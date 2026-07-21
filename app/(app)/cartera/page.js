'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { money, fechaCorta, nombreEstatus } from '@/lib/utils';
import ExpedienteModal from '@/components/ExpedienteModal';

export default function Cartera() {
  const [filas, setFilas] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [riesgo, setRiesgo] = useState('');
  const [abierto, setAbierto] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('v_cartera_vencida').select('*')
      .order('parcialidades_vencidas', { ascending: false })
      .order('monto_vencido', { ascending: false });
    setFilas(data || []);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const { data } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single();
      setPerfil(data);
    });
    const canal = supabase.channel('cartera')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gestiones' }, cargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'compromisos' }, cargar)
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [cargar]);

  const visibles = filas.filter((f) => {
    if (riesgo && f.nivel_riesgo !== riesgo) return false;
    if (!busqueda) return true;
    const q = busqueda.toLowerCase();
    return String(f.folio).includes(q) || (f.cliente || '').toLowerCase().includes(q) || (f.unidad || '').toLowerCase().includes(q);
  });

  return (
    <>
      <div className="encabezado"><h1>Cartera vencida</h1>
        <div className="sub">{filas.length} expedientes · {money(filas.reduce((s, f) => s + (f.monto_vencido || 0), 0))} vencido</div></div>
      <hr className="linea-oro" />
      <div className="filtros">
        <input placeholder="Buscar folio, cliente o unidad" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <select value={riesgo} onChange={(e) => setRiesgo(e.target.value)}>
          <option value="">Todos los riesgos</option>
          <option value="critico">Crítico</option>
          <option value="alto">Alto</option>
          <option value="medio">Medio</option>
          <option value="bajo">Bajo</option>
        </select>
      </div>
      <div className="tarjeta tabla-scroll" style={{ padding: 0 }}>
        <table className="tabla">
          <thead><tr>
            <th>Folio</th><th>Cliente</th><th>Riesgo</th>
            <th className="num">Vencidas</th><th className="num">Monto vencido</th>
            <th>Último pago</th><th>Gestión</th>
          </tr></thead>
          <tbody>
            {visibles.map((f) => (
              <tr key={f.folio} className="fila" onClick={() => setAbierto(f.folio)}>
                <td><span className="folio-chip">{f.folio}</span></td>
                <td>{f.cliente || '—'}</td>
                <td><span className={`pastilla riesgo-${f.nivel_riesgo}`}>{f.nivel_riesgo}</span></td>
                <td className="num">{f.parcialidades_vencidas}</td>
                <td className="num" style={{ color: 'var(--rojo)' }}>{money(f.monto_vencido)}</td>
                <td className="mono" style={{ fontSize: 13 }}>{fechaCorta(f.fecha_ultimo_pago)}</td>
                <td style={{ fontSize: 13 }}>{nombreEstatus(f.estatus_gestion || 'sin_gestion')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {cargando && <div className="vacio">Cargando…</div>}
        {!cargando && visibles.length === 0 && <div className="vacio">Sin resultados con esos filtros.</div>}
      </div>
      {abierto && (
        <ExpedienteModal folio={abierto} perfil={perfil}
          onCerrar={() => setAbierto(null)} onCambio={cargar} />
      )}
    </>
  );
}
