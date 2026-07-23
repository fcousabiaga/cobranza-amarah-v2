'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { money } from '@/lib/utils';

const NOMBRES = {
  expedientes: 'Expedientes', saldos_vencidos: 'Saldos vencidos',
  saldos_expediente: 'Saldos por expediente', pagos: 'Pagos',
  inventario: 'Inventario', cancelados: 'Cancelados',
};

export default function Importar() {
  const [perfil, setPerfil] = useState(null);
  const [archivos, setArchivos] = useState([]);
  const [progreso, setProgreso] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [corriendo, setCorriendo] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const { data } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single();
      setPerfil(data);
    });
  }, []);

  if (perfil && perfil.rol !== 'admin') {
    return <div className="vacio">Esta sección es solo para administradores.</div>;
  }

  const importar = async () => {
    if (!archivos.length) return;
    setCorriendo(true);
    setResumen(null);
    setProgreso([]);
    const { data: { session } } = await supabase.auth.getSession();
    const auth = { Authorization: `Bearer ${session.access_token}` };
    const log = [];

    for (const f of archivos) {
      log.push({ archivo: f.name, estado: 'procesando…' });
      setProgreso([...log]);
      try {
        const fd = new FormData();
        fd.append('file', f);
        const res = await fetch('/api/importar', { method: 'POST', headers: auth, body: fd });
        const j = await res.json();
        log[log.length - 1] = j.ok
          ? { archivo: f.name, estado: `✓ ${NOMBRES[j.tipo] || j.tipo}: ${j.filas.toLocaleString()} filas` }
          : { archivo: f.name, estado: `✗ ${j.error}`, error: true };
      } catch (e) {
        log[log.length - 1] = { archivo: f.name, estado: `✗ ${e.message}`, error: true };
      }
      setProgreso([...log]);
    }

    // Cierre: automatización post-importación
    if (log.some((l) => !l.error)) {
      log.push({ archivo: 'Automatización', estado: 'corriendo reglas…' });
      setProgreso([...log]);
      try {
        const res = await fetch('/api/importar/finalizar', { method: 'POST', headers: auth });
        const j = await res.json();
        if (j.ok) {
          setResumen(j.resumen);
          log[log.length - 1] = { archivo: 'Automatización', estado: '✓ completada' };
        } else {
          log[log.length - 1] = { archivo: 'Automatización', estado: `✗ ${j.error}`, error: true };
        }
      } catch (e) {
        log[log.length - 1] = { archivo: 'Automatización', estado: `✗ ${e.message}`, error: true };
      }
      setProgreso([...log]);
    }
    setCorriendo(false);
    setArchivos([]);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <>
      <div className="encabezado"><h1>Importar reportes</h1>
        <div className="sub">Sube los reportes del CRM tal cual los descargas de Adara. La app identifica cada uno sola.</div></div>
      <hr className="linea-oro" />

      <div className="tarjeta">
        <h2>1. Selecciona los archivos (.xlsx)</h2>
        <div style={{ fontSize: 13.5, color: 'var(--tinta-suave)', marginBottom: 10 }}>
          Puedes subir los 6 juntos o solo los que quieras actualizar (por ejemplo, solo pagos y saldos vencidos).
        </div>
        <input ref={inputRef} type="file" multiple accept=".xlsx"
          onChange={(e) => setArchivos([...e.target.files])} disabled={corriendo} />
        {archivos.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <button className="btn oro" onClick={importar} disabled={corriendo}>
              {corriendo ? 'Importando…' : `Importar ${archivos.length} archivo(s)`}
            </button>
          </div>
        )}
      </div>

      {progreso.length > 0 && (
        <div className="tarjeta">
          <h2>2. Progreso</h2>
          <div className="item-lista">
            {progreso.map((p, i) => (
              <div key={i} className="contacto-item" style={p.error ? { background: 'var(--rojo-suave)' } : {}}>
                <b>{p.archivo}</b> — {p.estado}
              </div>
            ))}
          </div>
        </div>
      )}

      {resumen && (
        <div className="tarjeta">
          <h2>3. Qué cambió con esta actualización</h2>
          <div className="kpis">
            <div className="kpi">
              <div className="etiqueta">Regularizados automáticamente</div>
              <div className="valor" style={{ color: 'var(--verde)' }}>{resumen.regularizados}</div>
              <div className="detalle">Salieron de saldos vencidos; su gestión se cerró sola</div>
            </div>
            <div className="kpi">
              <div className="etiqueta">Compromisos verificados</div>
              <div className="valor" style={{ color: 'var(--verde)' }}>{resumen.compromisos_verificados}</div>
              <div className="detalle">Cumplidos contra los pagos del CRM</div>
            </div>
            <div className="kpi">
              <div className="etiqueta">Acciones limpiadas</div>
              <div className="valor">{resumen.acciones_limpiadas}</div>
              <div className="detalle">Pendientes viejos de folios ya cerrados</div>
            </div>
            <div className="kpi">
              <div className="etiqueta">Cartera vencida actual</div>
              <div className="valor" style={{ color: 'var(--rojo)' }}>{money(resumen.cartera_vencida)}</div>
              <div className="detalle">{resumen.folios_vencidos} folios · guardado en el histórico</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
