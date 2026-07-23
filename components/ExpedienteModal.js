'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { money, fechaCorta, hoyMX, ESTATUS, nombreEstatus } from '@/lib/utils';
import { generarPreCarta, generarRescision, sumarDias, fechaLarga } from '@/lib/cartas';

export default function ExpedienteModal({ folio, perfil, onCerrar, onCambio }) {
  const [exp, setExp] = useState(null);
  const [saldo, setSaldo] = useState(null);
  const [gestion, setGestion] = useState(null);
  const [contactos, setContactos] = useState([]);
  const [compromisos, setCompromisos] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [guardando, setGuardando] = useState(false);

  // formularios
  const [tipoC, setTipoC] = useState('WhatsApp');
  const [notaC, setNotaC] = useState('');
  const [fechaK, setFechaK] = useState('');
  const [montoK, setMontoK] = useState('');
  const [conceptoK, setConceptoK] = useState('');
  const [proxAccion, setProxAccion] = useState('');
  const [proxFecha, setProxFecha] = useState('');
  const [dialogoRescision, setDialogoRescision] = useState(false);
  const [fechaContrato, setFechaContrato] = useState('');
  const [fechaPreCarta, setFechaPreCarta] = useState('');

  const cargar = useCallback(async () => {
    const [e, sv, g, c, k, pg] = await Promise.all([
      supabase.from('expedientes').select('*').eq('folio', folio).maybeSingle(),
      supabase.from('saldos_vencidos').select('*').eq('folio', folio).maybeSingle(),
      supabase.from('gestiones').select('*').eq('folio', folio).maybeSingle(),
      supabase.from('contactos').select('*').eq('folio', folio).order('fecha', { ascending: false }).limit(60),
      supabase.from('compromisos').select('*').eq('folio', folio).order('fecha_compromiso', { ascending: false }),
      supabase.from('pagos').select('fecha_comprobante, monto_pagado, metodo_pago, concepto')
        .eq('folio', folio).gt('monto_pagado', 0)
        .order('fecha_comprobante', { ascending: false }).limit(5),
    ]);
    setExp(e.data);
    setSaldo(sv.data);
    setGestion(g.data);
    setContactos(c.data || []);
    setCompromisos(k.data || []);
    setPagos(pg?.data || []);
    setProxAccion(g.data?.prox_accion || '');
    setProxFecha(g.data?.prox_fecha || '');
  }, [folio]);

  useEffect(() => { cargar(); }, [cargar]);

  const upsertGestion = async (cambios) => {
    const base = {
      folio,
      estatus: gestion?.estatus || 'sin_gestion',
      updated_by: perfil?.nombre || null,
      cobrador: gestion?.cobrador || perfil?.nombre || null,
      ...cambios,
    };
    const { error } = await supabase.from('gestiones').upsert(base, { onConflict: 'folio' });
    return error;
  };

  const registrarContacto = async (tipo, descripcion) => {
    await supabase.from('contactos').insert({
      folio, tipo, descripcion: descripcion || null, agente: perfil?.nombre || null,
    });
  };

  const agregarContacto = async (e) => {
    e.preventDefault();
    setGuardando(true);
    await registrarContacto(tipoC, notaC);
    await upsertGestion({ fecha_contactado: hoyMX() });
    setNotaC('');
    await cargar(); onCambio?.();
    setGuardando(false);
  };

  const agregarCompromiso = async (e) => {
    e.preventDefault();
    if (!fechaK) return;
    setGuardando(true);
    await supabase.from('compromisos').insert({
      id: String(Date.now()),
      folio,
      fecha_compromiso: fechaK,
      monto: montoK ? Number(montoK) : null,
      notas: conceptoK || null,
      agente: perfil?.nombre || null,
    });
    await registrarContacto('Compromiso', `Compromiso de pago para ${fechaCorta(fechaK)}${montoK ? ` por ${money(Number(montoK))}` : ''}`);
    setFechaK(''); setMontoK(''); setConceptoK('');
    await cargar(); onCambio?.();
    setGuardando(false);
  };

  const resolverCompromiso = async (c, estatus) => {
    setGuardando(true);
    await supabase.from('compromisos').update({ estatus, resuelto_en: new Date().toISOString() }).eq('id', c.id);
    await registrarContacto('Compromiso', `Compromiso del ${fechaCorta(c.fecha_compromiso)} marcado: ${estatus}`);
    await cargar(); onCambio?.();
    setGuardando(false);
  };

  const cambiarEstatus = async (nuevo) => {
    setGuardando(true);
    const limpiar = ['regularizado', 'rescindido'].includes(nuevo)
      ? { prox_accion: null, prox_fecha: null } : {};
    await upsertGestion({ estatus: nuevo, ...limpiar });
    await registrarContacto('Estatus', `Estatus cambiado a: ${nombreEstatus(nuevo)}`);
    await cargar(); onCambio?.();
    setGuardando(false);
  };

  const guardarProxima = async (e) => {
    e.preventDefault();
    setGuardando(true);
    await upsertGestion({ prox_accion: proxAccion || null, prox_fecha: proxFecha || null });
    await cargar(); onCambio?.();
    setGuardando(false);
  };

  const cliente = exp?.nombre_cliente || saldo?.cliente || '—';
  const telefono = exp?.telefono_cliente || saldo?.telefono;

  // ---------- Cartas PDF ----------
  const datosCarta = () => ({
    folio,
    cliente,
    unidad: exp?.unidad || saldo?.unidad || '',
    mt2: exp?.mt2 || saldo?.superficie_m2 || null,
    parcialidadesVencidas: saldo?.parcialidades_vencidas ?? 0,
    montoVencido: saldo?.monto_vencido ?? 0,
    ultimoPago: saldo?.fecha_ultimo_pago || null,
    fechaHoy: hoyMX(),
  });

  const subirCarta = async (doc, tipo, nombreArchivo) => {
    try {
      const blob = doc.output('blob');
      const ruta = `${folio}/${nombreArchivo}`;
      const { error } = await supabase.storage.from('cartas')
        .upload(ruta, blob, { upsert: true, contentType: 'application/pdf' });
      await supabase.from('cartas').insert({
        folio, tipo, generada_por: perfil?.nombre || null,
        archivo_path: error ? null : ruta,
      });
    } catch (e) { console.warn('No se pudo archivar la carta en Storage:', e); }
  };

  const generarPre = async () => {
    setGuardando(true);
    const d = datosCarta();
    const { doc, fechaLimite } = generarPreCarta(d);
    const archivo = `Pre-carta_${folio}_${cliente.replace(/[^\wÁÉÍÓÚÑáéíóúñ ]/g, '').replace(/\s+/g, '_')}.pdf`;
    doc.save(archivo);
    await subirCarta(doc, 'precancelacion', archivo);
    await registrarContacto('pre-cancelacion', `Carta pre-cancelación generada. Fecha límite: ${fechaLarga(fechaLimite)}`);
    await upsertGestion({
      estatus: 'carta_precancelacion',
      fecha_carta: d.fechaHoy,
      prox_accion: 'Verificar pago; si no pagó, enviar carta definitiva de rescisión',
      prox_fecha: fechaLimite,
    });
    await cargar(); onCambio?.();
    setGuardando(false);
  };

  const abrirDialogoRescision = () => {
    setFechaPreCarta(gestion?.fecha_carta || '');
    setFechaContrato(exp?.fecha_firma_contrato || '');
    setDialogoRescision(true);
  };

  const generarRes = async (e) => {
    e.preventDefault();
    setGuardando(true);
    const d = { ...datosCarta(), fechaContrato, fechaPreCarta };
    const { doc } = generarRescision(d);
    const archivo = `Rescision_${folio}_${cliente.replace(/[^\wÁÉÍÓÚÑáéíóúñ ]/g, '').replace(/\s+/g, '_')}.pdf`;
    doc.save(archivo);
    await subirCarta(doc, 'rescision', archivo);
    await registrarContacto('rescision', 'Carta de rescisión definitiva generada y enviada');
    await upsertGestion({
      estatus: 'rescindido',
      fecha_aviso_final: d.fechaHoy,
      prox_accion: 'Dar de baja el expediente en el sistema (rescisión enviada)',
      prox_fecha: sumarDias(d.fechaHoy, 3),
    });
    setDialogoRescision(false);
    await cargar(); onCambio?.();
    setGuardando(false);
  };

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="cerrar" onClick={onCerrar} aria-label="Cerrar">×</button>
        <span className="folio-chip">Folio {folio}</span>
        <h2 style={{ margin: '10px 0 2px' }}>{cliente}</h2>
        <div style={{ color: 'var(--tinta-suave)', fontSize: 14 }}>
          {exp?.unidad || saldo?.unidad || ''} {exp?.etapa ? `· ${exp.etapa}` : ''}
          {telefono ? ` · ${telefono}` : ''}
        </div>
        <hr className="linea-oro" />

        <div className="datos-grid">
          <div className="dato"><div className="l">Estatus de gestión</div>
            <div className="v"><span className="pastilla estatus-chip">{nombreEstatus(gestion?.estatus || 'sin_gestion')}</span></div></div>
          <div className="dato"><div className="l">Parcialidades vencidas</div>
            <div className="v mono">{saldo?.parcialidades_vencidas ?? 0}</div></div>
          <div className="dato"><div className="l">Monto vencido</div>
            <div className="v mono" style={{ color: 'var(--rojo)' }}>{money(saldo?.monto_vencido)}</div></div>
          <div className="dato"><div className="l">Mensualidad</div>
            <div className="v mono">{money(exp?.mensualidad)}</div></div>
          <div className="dato"><div className="l">Saldo total</div>
            <div className="v mono">{money(exp?.saldo_total)}</div></div>
          <div className="dato"><div className="l">Último pago</div>
            <div className="v mono">{fechaCorta(saldo?.fecha_ultimo_pago)}</div></div>
        </div>

        <div className="seccion">
          <h3>Cambiar estatus</h3>
          <div className="form-linea">
            <select value={gestion?.estatus || 'sin_gestion'} onChange={(e) => cambiarEstatus(e.target.value)} disabled={guardando}>
              {ESTATUS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
            </select>
          </div>
        </div>

        <div className="seccion">
          <h3>Próxima acción</h3>
          <form className="form-linea" onSubmit={guardarProxima}>
            <input placeholder="Describe la acción" value={proxAccion} onChange={(e) => setProxAccion(e.target.value)} />
            <input type="date" value={proxFecha || ''} onChange={(e) => setProxFecha(e.target.value)} style={{ maxWidth: 170 }} />
            <button className="btn secundario" disabled={guardando} type="submit" style={{ flex: '0 0 auto' }}>Guardar</button>
          </form>
          {gestion?.prox_accion && (
            <div style={{ fontSize: 13, color: 'var(--tinta-suave)', marginTop: 6 }}>
              Programada: {gestion.prox_accion} — {fechaCorta(gestion.prox_fecha)}
            </div>
          )}
        </div>

        <div className="seccion">
          <h3>Generar carta (PDF)</h3>
          <div className="form-linea">
            <button className="btn secundario" disabled={guardando} onClick={generarPre} type="button">
              📄 Carta pre-cancelación
            </button>
            <button className="btn peligro" disabled={guardando} onClick={abrirDialogoRescision} type="button">
              ⚫ Carta rescisión definitiva
            </button>
          </div>
          {gestion?.fecha_carta && (
            <div style={{ fontSize: 13, color: 'var(--tinta-suave)', marginTop: 6 }}>
              Pre-carta enviada el {fechaCorta(gestion.fecha_carta)}
            </div>
          )}
          {dialogoRescision && (
            <form onSubmit={generarRes} style={{ marginTop: 10, background: 'var(--papel)', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>Datos para la rescisión</div>
              <div className="form-linea">
                <label style={{ fontSize: 12.5 }}>Fecha del contrato
                  <input type="date" value={fechaContrato} onChange={(e) => setFechaContrato(e.target.value)} required />
                </label>
                <label style={{ fontSize: 12.5 }}>Fecha de envío de la pre-carta
                  <input type="date" value={fechaPreCarta} onChange={(e) => setFechaPreCarta(e.target.value)} required />
                </label>
              </div>
              <div className="form-linea" style={{ marginTop: 8 }}>
                <button className="btn peligro" disabled={guardando} type="submit">Generar rescisión</button>
                <button className="btn secundario" type="button" onClick={() => setDialogoRescision(false)}>Cancelar</button>
              </div>
            </form>
          )}
        </div>

        <div className="seccion">
          <h3>Compromisos de pago</h3>
          {compromisos.length === 0 && <div style={{ fontSize: 14, color: 'var(--tinta-suave)' }}>Sin compromisos registrados.</div>}
          <div className="item-lista">
            {compromisos.map((c) => (
              <div key={c.id} className="item" style={{ padding: 10 }}>
                <div className="cuerpo">
                  <div className="desc mono">{fechaCorta(c.fecha_compromiso)} · {money(c.monto)}</div>
                  <div className="meta">{c.notas || ''} {c.agente ? `— ${c.agente}` : ''} · <b>{c.estatus}</b></div>
                </div>
                {c.estatus === 'pendiente' && (
                  <div className="acciones">
                    <button className="btn exito" disabled={guardando} onClick={() => resolverCompromiso(c, 'cumplido')}>Pagó</button>
                    <button className="btn peligro" disabled={guardando} onClick={() => resolverCompromiso(c, 'incumplido')}>No pagó</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <form className="form-linea" style={{ marginTop: 10 }} onSubmit={agregarCompromiso}>
            <input type="date" value={fechaK} onChange={(e) => setFechaK(e.target.value)} required style={{ maxWidth: 170 }} />
            <input type="number" step="0.01" placeholder="Monto" value={montoK} onChange={(e) => setMontoK(e.target.value)} style={{ maxWidth: 140 }} />
            <input placeholder="Concepto" value={conceptoK} onChange={(e) => setConceptoK(e.target.value)} />
            <button className="btn oro" disabled={guardando} type="submit" style={{ flex: '0 0 auto' }}>Registrar compromiso</button>
          </form>
        </div>

        <div className="seccion">
          <h3>Registrar contacto</h3>
          <form className="form-linea" onSubmit={agregarContacto}>
            <select value={tipoC} onChange={(e) => setTipoC(e.target.value)} style={{ maxWidth: 170 }}>
              {['WhatsApp', 'Llamada', 'Correo', 'Visita', 'penalizacion', 'morosidad', 'pre-cancelacion', 'aviso_final', 'rescision', 'Nota']
                .map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input placeholder="Nota (opcional)" value={notaC} onChange={(e) => setNotaC(e.target.value)} />
            <button className="btn" disabled={guardando} type="submit" style={{ flex: '0 0 auto' }}>Guardar contacto</button>
          </form>
        </div>

        <div className="seccion">
          <h3>Pagos recientes (CRM)</h3>
          {pagos.length === 0 && <div style={{ fontSize: 14, color: 'var(--tinta-suave)' }}>Sin pagos registrados en el último corte.</div>}
          <div className="historial">
            {pagos.map((p, i) => (
              <div key={i} className="contacto-item">
                <b className="mono">{money(p.monto_pagado)}</b> — {fechaCorta(p.fecha_comprobante)}
                <div className="quien">{p.concepto || ''}{p.metodo_pago ? ` · ${p.metodo_pago}` : ''}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--tinta-suave)', marginTop: 6 }}>
            Según el último reporte importado del CRM.
          </div>
        </div>

        <div className="seccion">
          <h3>Historial ({contactos.length})</h3>
          <div className="historial">
            {contactos.map((c) => (
              <div key={c.id} className="contacto-item">
                <b>{c.tipo || 'Contacto'}</b> {c.descripcion ? `— ${c.descripcion}` : ''}
                <div className="quien mono">{new Date(c.fecha).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'short', timeStyle: 'short' })} · {c.agente || '—'}</div>
              </div>
            ))}
            {contactos.length === 0 && <div style={{ fontSize: 14, color: 'var(--tinta-suave)' }}>Sin contactos registrados todavía.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
