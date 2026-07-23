'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { money, fechaCorta } from '@/lib/utils';
import ExpedienteModal from '@/components/ExpedienteModal';

const SECCIONES = [
  ['enviar_rescision', '⚫ Enviar rescisión definitiva', 'El plazo de la pre-carta venció sin pago. Abre el expediente y genera la carta.'],
  ['compromiso', '💰 Compromisos de pago', 'Verifica si el cliente depositó lo prometido.'],
  ['recordatorio_compromiso', '🔔 Recordar compromisos de mañana', 'Manda el recordatorio al cliente un día antes de su fecha.'],
  ['accion', '📋 Acciones programadas', 'Lo que el equipo agendó para hoy o quedó pendiente.'],
  ['enviar_precarta', '📄 Pre-cartas por enviar', 'Folios con 3+ parcialidades vencidas, sin carta previa. Abre y genera.'],
  ['seguimiento', '📞 Seguimiento pendiente', 'Folios vencidos sin contacto en los últimos 7 días.'],
];

const META_DIARIA = 10;

export default function Hoy() {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(0);
  const [perfil, setPerfil] = useState(null);
  const [abierto, setAbierto] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [soloMias, setSoloMias] = useState(false);

  const cargar = useCallback(async (nombre) => {
    try { await supabase.rpc('verificar_compromisos_pagos'); } catch {}
    const [cola, m] = await Promise.all([
      supabase.from('v_cola_trabajo').select('*').order('prioridad').order('fecha', { nullsFirst: false }).order('monto', { ascending: false }),
      supabase.from('v_meta_hoy').select('*'),
    ]);
    setItems(cola.data || []);
    const propio = (m.data || []).find((r) => r.agente === nombre);
    setMeta(propio?.expedientes_gestionados || 0);
    setCargando(false);
  }, []);

  useEffect(() => {
    let nombre = null;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const { data } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single();
      setPerfil(data);
      nombre = data?.nombre;
      cargar(nombre);
    });
    const canal = supabase.channel('hoy')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gestiones' }, () => cargar(nombre))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'compromisos' }, () => cargar(nombre))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contactos' }, () => cargar(nombre))
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [cargar]);

  const recargar = () => cargar(perfil?.nombre);

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
    await recargar();
    setOcupado(false);
  };

  const marcarRecordado = async (it) => {
    setOcupado(true);
    await supabase.from('contactos').insert({
      folio: it.folio, tipo: 'Recordatorio',
      descripcion: `Recordatorio enviado del compromiso del ${fechaCorta(it.fecha)}`,
      agente: perfil?.nombre || null,
    });
    await recargar();
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
    await recargar();
    setOcupado(false);
  };

  const esMia = (it) => !it.agente || it.agente === perfil?.nombre;
  const visibles = soloMias ? items.filter(esMia) : items;
  const pendientesMios = items.filter(esMia).length;
  const pct = Math.min(100, Math.round((meta / META_DIARIA) * 100));

  const Item = ({ it }) => (
    <div className={`item ${it.estado === 'vencida' ? 'vencida' : 'hoy-item'}`}>
      <div className="cuerpo">
        <button className="folio-chip" onClick={() => setAbierto(it.folio)}>{it.folio}</button>
        {it.cliente && <span style={{ marginLeft: 8, fontSize: 13.5, color: 'var(--tinta-suave)' }}>{it.cliente}</span>}
        <div className="desc">{it.descripcion}{it.tipo_item === 'compromiso' && it.monto ? ` · ${money(it.monto)}` : ''}</div>
        {it.pago_detectado && (
          <div style={{ display: 'inline-block', background: 'var(--verde-suave)', color: 'var(--verde)',
            borderRadius: 6, padding: '2px 8px', fontSize: 12.5, fontWeight: 600, margin: '4px 0' }}>
            💵 {it.pago_detectado}
          </div>
        )}
        <div className="meta mono">
          {it.fecha ? fechaCorta(it.fecha) : ''}
          {it.tipo_item !== 'compromiso' && it.monto ? ` · vencido ${money(it.monto)}` : ''}
          {it.agente ? ` · ${it.agente}` : ' · sin asignar'}
        </div>
      </div>
      <div className="acciones">
        {it.tipo_item === 'compromiso' ? (
          <>
            <button className="btn exito" disabled={ocupado} onClick={() => resolverCompromiso(it, 'cumplido')}>Pagó</button>
            <button className="btn peligro" disabled={ocupado} onClick={() => resolverCompromiso(it, 'incumplido')}>No pagó</button>
          </>
        ) : it.tipo_item === 'recordatorio_compromiso' ? (
          <>
            <button className="btn secundario" disabled={ocupado} onClick={() => setAbierto(it.folio)}>Abrir</button>
            <button className="btn oro" disabled={ocupado} onClick={() => marcarRecordado(it)}>✓ Recordatorio enviado</button>
          </>
        ) : it.tipo_item === 'accion' ? (
          <>
            <button className="btn secundario" disabled={ocupado} onClick={() => setAbierto(it.folio)}>Abrir</button>
            <button className="btn peligro" disabled={ocupado} onClick={() => descartar(it)}>✕ Descartar</button>
          </>
        ) : (
          <button className={`btn ${it.tipo_item === 'enviar_rescision' ? 'peligro' : it.tipo_item === 'enviar_precarta' ? 'oro' : 'secundario'}`}
            disabled={ocupado} onClick={() => setAbierto(it.folio)}>
            Abrir expediente
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="encabezado"><h1>Hoy</h1>
        <div className="sub">{pendientesMios} pendientes {soloMias ? 'tuyos' : 'del equipo'}</div></div>
      <hr className="linea-oro" />

      <div className="kpis" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="kpi">
          <div className="etiqueta">Meta del día</div>
          <div className="valor">{meta} <span style={{ fontSize: 15, color: 'var(--tinta-suave)' }}>/ {META_DIARIA} expedientes</span></div>
          <div style={{ background: 'var(--linea)', borderRadius: 99, height: 8, marginTop: 8 }}>
            <div style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--verde)' : 'var(--oro)', height: 8, borderRadius: 99, transition: 'width .3s' }} />
          </div>
        </div>
        <div className="kpi" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div className="etiqueta" style={{ marginBottom: 8 }}>Ver</div>
          <div className="form-linea">
            <button className={`btn ${soloMias ? 'secundario' : ''}`} onClick={() => setSoloMias(false)}>Todas</button>
            <button className={`btn ${soloMias ? '' : 'secundario'}`} onClick={() => setSoloMias(true)}>Solo mías</button>
          </div>
        </div>
      </div>

      {cargando && <div className="vacio">Cargando…</div>}
      {!cargando && visibles.length === 0 && <div className="vacio">Nada pendiente. Día limpio. ✨</div>}

      {SECCIONES.map(([tipo, titulo, ayuda]) => {
        const grupo = visibles.filter((i) => i.tipo_item === tipo);
        if (grupo.length === 0) return null;
        return (
          <div className="tarjeta" key={tipo}>
            <h2>{titulo} <span style={{ color: 'var(--tinta-suave)', fontWeight: 400 }}>({grupo.length})</span></h2>
            <div style={{ fontSize: 13, color: 'var(--tinta-suave)', marginBottom: 10 }}>{ayuda}</div>
            <div className="item-lista">{grupo.map((it, i) => <Item key={`${tipo}-${it.folio}-${i}`} it={it} />)}</div>
          </div>
        );
      })}

      {abierto && (
        <ExpedienteModal folio={abierto} perfil={perfil}
          onCerrar={() => setAbierto(null)} onCambio={recargar} />
      )}
    </>
  );
}
