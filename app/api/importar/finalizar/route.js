// Cierre de la importación: automatización post-importación
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req) {
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  const { data: { user } } = await supa.auth.getUser(token || '');
  if (!user) return Response.json({ error: 'Sin autorización' }, { status: 403 });
  const { data: perfil } = await supa.from('perfiles').select('*').eq('id', user.id).single();
  if (perfil?.rol !== 'admin') return Response.json({ error: 'Solo administradores' }, { status: 403 });

  const { data, error } = await supa.rpc('post_importacion', { ejecutado_por: perfil.nombre });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, resumen: data });
}
