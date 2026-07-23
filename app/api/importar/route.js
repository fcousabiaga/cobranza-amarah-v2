// Importación de un reporte xlsx del CRM (solo admins)
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { detectarTipo, TRANSFORMADORES } from '@/lib/importadores';

export const runtime = 'nodejs';
export const maxDuration = 60;

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function validarAdmin(req, supa) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await supa.auth.getUser(token);
  if (!user) return null;
  const { data: perfil } = await supa.from('perfiles').select('*').eq('id', user.id).single();
  return perfil?.rol === 'admin' && perfil?.activo ? perfil : null;
}

export async function POST(req) {
  const supa = admin();
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY en las variables de entorno' }, { status: 500 });
  }
  const perfil = await validarAdmin(req, supa);
  if (!perfil) return Response.json({ error: 'Solo administradores pueden importar' }, { status: 403 });

  const form = await req.formData();
  const file = form.get('file');
  if (!file) return Response.json({ error: 'No llegó ningún archivo' }, { status: 400 });

  // Parsear xlsx
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
  if (!rows.length) return Response.json({ error: `${file.name}: sin filas de datos` }, { status: 400 });

  const tipo = detectarTipo(Object.keys(rows[0]), rows);
  if (!tipo) {
    return Response.json({ error: `${file.name}: no reconozco este reporte (revisa que sea uno de los 6 del CRM)` }, { status: 400 });
  }

  const { fn, clave, dedupe } = TRANSFORMADORES[tipo];
  let registros = fn(rows);

  // dedupe por clave (conserva la última aparición)
  if (dedupe && clave) {
    const mapa = new Map();
    for (const r of registros) mapa.set(r[clave], r);
    registros = [...mapa.values()];
  }

  // Reemplazo del espejo: borrar todo e insertar en bloques
  const filtroBorrado = tipo === 'pagos' || tipo === 'inventario'
    ? { col: 'id', op: 'gte', val: 0 }
    : { col: 'folio', op: 'neq', val: '___' };
  const del = await supa.from(tipo).delete()[filtroBorrado.op](filtroBorrado.col, filtroBorrado.val);
  if (del.error) return Response.json({ error: `Error limpiando ${tipo}: ${del.error.message}` }, { status: 500 });

  const LOTE = 500;
  for (let i = 0; i < registros.length; i += LOTE) {
    const { error } = await supa.from(tipo).insert(registros.slice(i, i + LOTE));
    if (error) {
      return Response.json({ error: `Error insertando en ${tipo} (bloque ${i / LOTE + 1}): ${error.message}` }, { status: 500 });
    }
  }

  return Response.json({ ok: true, tipo, archivo: file.name, filas: registros.length });
}
