-- ============================================================
-- COBRANZA AMARAH v2 — Usuarios y Tiempo Real (Fase 2/3)
-- ============================================================
-- ANTES de correr esto:
-- 1. Ve a Supabase → Authentication → Users → "Add user" → "Create new user"
-- 2. Crea los 7 usuarios con correo y contraseña (marca "Auto Confirm User"):
--    andrea@..., liz@..., nana@..., y los 4 admins
--    (pueden ser correos reales o inventados tipo andrea@amarah.app)
-- 3. Luego EDITA los correos de abajo para que coincidan y corre este script.

insert into public.perfiles (id, nombre, rol)
select id, v.nombre, v.rol
from auth.users u
join (values
  ('andrea@amarah.app',  'Andrea Ramirez',   'cobrador'),
  ('liz@amarah.app',     'Liz Olvera',       'cobrador'),
  ('nana@amarah.app',    'Nana Retana',      'cobrador'),
  ('pancho@amarah.app',  'Francisco Usabiaga','admin'),
  ('er@amarah.app',      'ER',               'admin'),
  ('enrique@amarah.app', 'Enrique Gonzalez', 'admin'),
  ('oscar@amarah.app',   'Oscar Retana',     'admin')
) as v(correo, nombre, rol) on u.email = v.correo
on conflict (id) do update set nombre = excluded.nombre, rol = excluded.rol;

-- Verifica que los 7 quedaron:
-- select p.nombre, p.rol, u.email from perfiles p join auth.users u on u.id = p.id;

-- ------------------------------------------------------------
-- Activar Tiempo Real en las tablas de gestión
-- (para que los cambios de una agente aparezcan al instante en las demás)
-- ------------------------------------------------------------
alter publication supabase_realtime add table public.gestiones;
alter publication supabase_realtime add table public.compromisos;
alter publication supabase_realtime add table public.contactos;
