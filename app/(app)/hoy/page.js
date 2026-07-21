'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { money, fechaCorta } from '@/lib/utils';
import ExpedienteModal from '@/components/ExpedienteModal';

export default function Hoy() {
  const [items, setItems] = useState([]);
  const [perfil, setPerfil] = useState(null);
  const [abierto, setAbierto] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('v_pendientes_hoy').select('*').order('fecha');
    setItems(data || []);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const { data } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single();
      setPerfil(data);
    });
    const canal = supabase.channel('hoy')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gestiones' }, cargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'compromisos' }, cargar)
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [cargar]);

  const descartar = async (it) => {
    if (!confirm(`¿Descartar la acción del folio ${it.folio}?\n"${it.descripcion}"`)) return;
    setOcupado(true);
    await supabase.from('gestiones').update({
      prox_accion: null, prox_fecha: null, updated_by: perfil?.nombre || null,
    }).eq('folio', it.folio);
    await supabase.from('contactos').insert({
      folio: it.folio, tipo: 'Sistema',
      descripcion: `Acción descartada: ${it.descripcion}`,
      agente: perfil?.nombre || null,
    });
    await cargar();
    setOcupado(false);
  };

  const resolverCompromiso = async (it, estatus) => {
    setOcupado(true);
    await supabase.from('compromisos').update({ estatus, resuelto_en: new Date().toISOString() })
      .eq('folio', it.folio).eq('fecha_compromiso', it.fecha).eq('estatus', 'pendiente');
    await supabase.from('contactos').insert({
      folio: it.folio, tipo: 'Compromiso',
      descripcion: `Compromiso del ${fechaCorta(it.fecha)} marcado: ${estatus}`,
      agente: perfil?.nombre || null,
    });
    await cargar();
    setOcupado(false);
  };

  const vencidas = items.filter((i) => i.estado === 'vencida');
  const deHoy = items.filter((i) => i.estado === 'hoy');

  const Item = ({ it }) => (
    <div className={`item ${it.estado === 'vencida' ? 'vencida' : 'hoy-item'}`}>
      <div className="cuerpo">
        <button className="folio-chip" onClick={() => setAbierto(it.folio)}>{it.folio}</button>
        <div className="desc">{it.descripcion}{it.monto ? ` · ${money(it.monto)}` : ''}</div>
        <div className="meta mono">{fechaCorta(it.fecha)}{it.agente ? ` · ${it.agente}` : ''}</div>
      </div>
      <div className="acciones">
        {it.tipo_item === 'compromiso' ? (
          <>
            <button className="btn exito" disabled={ocupado} onClick={() => resolverCompromiso(it, 'cumplido')}>Pagó</button>
            <button className="btn peligro" disabled={ocupado} onClick={() => resolverCompromiso(it, 'incumplido')}>No pagó</button>
          </>
        ) : (
          <>
            <button className="btn secundario" disabled={ocupado} onClick={() => setAbierto(it.folio)}>Abrir</button>
            <button className="btn peligro" disabled={ocupado} onClick={() => descartar(it)}>✕ Descartar</button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="encabezado"><h1>Hoy</h1>
        <div className="sub">{vencidas.length} vencidas sin resolver · {deHoy.length} programadas para hoy</div></div>
      <hr className="linea-oro" />
      {cargando && <div className="vacio">Cargando…</div>}
      {!cargando && items.length === 0 && <div className="vacio">Nada pendiente. Día limpio. ✨</div>}
      {vencidas.length > 0 && (
        <div className="tarjeta">
          <h2>⚠️ Vencidas sin resolver</h2>
          <div className="item-lista">{vencidas.map((it, i) => <Item key={`${it.tipo_item}-${it.folio}-${i}`} it={it} />)}</div>
        </div>
      )}
      {deHoy.length > 0 && (
        <div className="tarjeta">
          <h2>📋 Programadas para hoy</h2>
          <div className="item-lista">{deHoy.map((it, i) => <Item key={`${it.tipo_item}-${it.folio}-${i}`} it={it} />)}</div>
        </div>
      )}
      {abierto && (
        <ExpedienteModal folio={abierto} perfil={perfil}
          onCerrar={() => setAbierto(null)} onCambio={cargar} />
      )}
    </>
  );
}
