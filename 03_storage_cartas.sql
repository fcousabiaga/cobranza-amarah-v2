-- ============================================================
-- COBRANZA AMARAH v2 — Archivo de cartas en Supabase Storage
-- Correr una sola vez en el SQL Editor
-- ============================================================

-- Bucket privado donde se archiva cada PDF generado
insert into storage.buckets (id, name, public)
values ('cartas', 'cartas', false)
on conflict (id) do nothing;

-- Usuarios activos pueden archivar y consultar cartas
create policy "cartas_subir" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cartas' and public.usuario_activo());

create policy "cartas_leer" on storage.objects
  for select to authenticated
  using (bucket_id = 'cartas' and public.usuario_activo());

create policy "cartas_reemplazar" on storage.objects
  for update to authenticated
  using (bucket_id = 'cartas' and public.usuario_activo());
