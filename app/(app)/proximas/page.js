'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { money, fechaCorta, hoyMX } from '@/lib/utils';
import ExpedienteModal from '@/components/ExpedienteModal';

export default function Proximas() {
  const [acciones, setAcciones] = useState([]);
  const [compromisos, setCompromisos] = useState([]);
  const [perfil, setPerfil] = useState(null);
  const [abierto, setAbierto] = useState(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const hoy = hoyMX();
    const [g, c] = await Promise.all([
      supabase.from('gestiones').select('folio, prox_accion, prox_fecha, cobrador')
        .gt('prox_fecha', hoy).not('prox_accion', 'is', null).order('prox_fecha'),
      supabase.from('compromisos').select('*')
        .gt('fecha_compromiso', hoy).eq('estatus', 'pendiente').order('fecha_compromiso'),
    ]);
    setAcciones(g.data || []);
    setCompromisos(c.data || []);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const { data } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single();
      setPerfil(data);
    });
    const canal = supabase.channel('proximas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gestiones' }, cargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'compromisos' }, cargar)
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [cargar]);

  return (
    <>
      <div className="encabezado"><h1>Próximas</h1>
        <div className="sub">{compromisos.length} compromisos · {acciones.length} acciones programadas</div></div>
      <hr className="linea-oro" />
      {cargando && <div className="vacio">Cargando…</div>}
      {!cargando && compromisos.length === 0 && acciones.length === 0 &&
        <div className="vacio">Nada programado a futuro por ahora.</div>}
      {compromisos.length > 0 && (
        <div className="tarjeta">
          <h2>💰 Compromisos de pago</h2>
          <div className="item-lista">
            {compromisos.map((c) => (
              <div key={c.id} className="item hoy-item">
                <div className="cuerpo">
                  <button className="folio-chip" onClick={() => setAbierto(c.folio)}>{c.folio}</button>
                  <div className="desc mono">{fechaCorta(c.fecha_compromiso)} · {money(c.monto)}</div>
                  <div className="meta">{c.notas || ''}{c.agente ? ` — ${c.agente}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {acciones.length > 0 && (
        <div className="tarjeta">
          <h2>🗓️ Acciones programadas</h2>
          <div className="item-lista">
            {acciones.map((a) => (
              <div key={a.folio} className="item">
                <div className="cuerpo">
                  <button className="folio-chip" onClick={() => setAbierto(a.folio)}>{a.folio}</button>
                  <div className="desc">{a.prox_accion}</div>
                  <div className="meta mono">{fechaCorta(a.prox_fecha)}{a.cobrador ? ` · ${a.cobrador}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {abierto && (
        <ExpedienteModal folio={abierto} perfil={perfil}
          onCerrar={() => setAbierto(null)} onCambio={cargar} />
      )}
    </>
  );
}
