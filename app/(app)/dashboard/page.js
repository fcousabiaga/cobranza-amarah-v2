'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { money, hoyMX } from '@/lib/utils';

export default function Dashboard() {
  const [d, setD] = useState(null);

  useEffect(() => {
    (async () => {
      const [mens, cartera, comp] = await Promise.all([
        supabase.from('v_mensualidades_esperadas').select('*').single(),
        supabase.from('v_cartera_vencida').select('folio, monto_vencido, nivel_riesgo, parcialidades_vencidas'),
        supabase.from('compromisos').select('id, monto, fecha_compromiso').eq('estatus', 'pendiente'),
      ]);
      const filas = cartera.data || [];
      const riesgo = { critico: 0, alto: 0, medio: 0, bajo: 0 };
      filas.forEach((f) => { riesgo[f.nivel_riesgo] = (riesgo[f.nivel_riesgo] || 0) + 1; });
      setD({
        mens: mens.data,
        totalVencido: filas.reduce((s, f) => s + (f.monto_vencido || 0), 0),
        nVencidos: filas.length,
        riesgo,
        compromisos: comp.data || [],
      });
    })();
  }, []);

  if (!d) return <div className="vacio">Cargando…</div>;
  const hoy = hoyMX();
  const compVencidos = d.compromisos.filter((c) => c.fecha_compromiso < hoy).length;

  return (
    <>
      <div className="encabezado"><h1>Dashboard</h1>
        <div className="sub">Estado general de la cartera</div></div>
      <hr className="linea-oro" />
      <div className="kpis">
        <div className="kpi">
          <div className="etiqueta">Cartera vencida</div>
          <div className="valor" style={{ color: 'var(--rojo)' }}>{money(d.totalVencido)}</div>
          <div className="detalle">{d.nVencidos} expedientes con saldo vencido</div>
        </div>
        <div className="kpi">
          <div className="etiqueta">Mensualidades esperadas</div>
          <div className="valor">{money(d.mens?.total_esperado)}</div>
          <div className="detalle">{d.mens?.expedientes_cobranza} expedientes en Cobranza</div>
        </div>
        <div className="kpi">
          <div className="etiqueta">Compromisos pendientes</div>
          <div className="valor">{d.compromisos.length}</div>
          <div className="detalle">{compVencidos} ya vencieron · {money(d.compromisos.reduce((s, c) => s + (c.monto || 0), 0))}</div>
        </div>
      </div>
      <div className="tarjeta">
        <h2>Distribución de riesgo</h2>
        <table className="tabla">
          <thead><tr><th>Nivel</th><th className="num">Expedientes</th><th className="num">%</th></tr></thead>
          <tbody>
            {[['critico', 'Crítico (4+ vencidas)'], ['alto', 'Alto (3)'], ['medio', 'Medio (2)'], ['bajo', 'Bajo (1)']].map(([k, nombre]) => (
              <tr key={k}>
                <td><span className={`pastilla riesgo-${k}`}>{nombre}</span></td>
                <td className="num">{d.riesgo[k] || 0}</td>
                <td className="num">{d.nVencidos ? Math.round(((d.riesgo[k] || 0) / d.nVencidos) * 100) : 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
