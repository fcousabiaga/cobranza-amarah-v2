-- ============================================================
-- COBRANZA AMARAH v2 — Esquema Supabase (Fase 1)
-- Ejecutar completo en: Supabase → SQL Editor → New query → Run
-- ============================================================

-- ------------------------------------------------------------
-- 1. PERFILES DE USUARIO (ligados a Supabase Auth)
-- ------------------------------------------------------------
create table public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  rol text not null check (rol in ('cobrador', 'admin')),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. TABLAS ESPEJO DE LOS REPORTES CRM
--    (se refrescan con cada importación; NUNCA guardan gestión)
-- ------------------------------------------------------------

create table public.expedientes (
  folio text primary key,
  fecha_crm date,
  proyecto text,
  fase text,
  etapa text,
  unidad text,
  mt2 numeric,
  plan text,
  costo numeric,
  saldo_total numeric,              -- "SALTO TOTAL (ACTUAL)"
  importe_pagado numeric,           -- "IMPORTE TOTAL PAGADO"
  nombre_cliente text,
  correo_cliente text,
  telefono_cliente text,
  pais_cliente text,
  estado_cliente text,
  status text,                      -- Cobranza / Finalizado / Reservación / etc.
  metodo_pago text,
  plazo text,
  enganche numeric,
  meses_enganche numeric,
  fecha_primera_parcialidad date,
  fecha_firma_contrato date,
  mensualidad numeric,              -- "MONTO PRIMER ACTUALIZACIÓN" (col BK)
  mensualidad_2 numeric,            -- "MONTO SEGUNDA ACTUALIZACIÓN"
  mensualidad_3 numeric,            -- "MONTO TERCERA ACTUALIZACIÓN"
  nombre_asesor text,
  raw jsonb,                        -- fila completa del reporte (91 columnas)
  importado_en timestamptz not null default now()
);

create table public.saldos_vencidos (
  folio text primary key,
  cliente text,
  telefono text,
  etapa text,
  privada text,
  unidad text,
  superficie_m2 numeric,
  importe_venta numeric,
  num_pagos_realizados int,
  fecha_ultimo_pago date,
  monto_total_pagado numeric,
  parcialidades_vencidas int,
  monto_vencido numeric,
  pct_saldo_vencido numeric,
  enganche numeric,
  parcialidad numeric,
  dias_vencimiento int,
  fecha_primer_pago date,
  importado_en timestamptz not null default now()
);

create table public.saldos_expediente (
  folio text primary key,
  nombre_cliente text,
  etapa text,
  unidad text,
  plan text,
  costo_precio_venta numeric,
  saldo_total numeric,
  area numeric,
  total_apartado numeric,
  valor_enganche numeric,
  fecha_firma_clientes date,
  parcialidades_pendientes int,
  telefono_cliente text,
  fecha_ultima_mensualidad date,
  importado_en timestamptz not null default now()
);

create table public.pagos (
  id bigint generated always as identity primary key,
  folio text not null,
  cliente text,
  etapa text,
  unidad text,
  numero_pago text,
  fecha_amortizacion date,
  concepto text,
  monto_a_pagar numeric,
  folio_pago text,
  fecha_comprobante date,
  metodo_pago text,
  tipo_pago text,
  monto_pagado numeric,
  fecha_aplicacion date,
  estatus text,
  importado_en timestamptz not null default now()
);
create index idx_pagos_folio on public.pagos (folio);

create table public.inventario (
  id bigint generated always as identity primary key,
  proyecto text,
  fase text,
  etapa text,
  lote text,
  empresa_propietaria text,
  clasificador text,
  area_m2 numeric,
  precio_m2 numeric,
  estado text,                      -- Vendido / Disponible / etc.
  valor numeric,
  folio_venta text,
  fecha_venta date,
  importado_en timestamptz not null default now()
);
create index idx_inventario_folio on public.inventario (folio_venta);

create table public.cancelados (
  folio text primary key,
  nombre_cliente text,
  unidad text,
  etapa text,
  status text,
  motivos_cancelacion text,
  costo numeric,
  importe_pagado numeric,
  raw jsonb,
  importado_en timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3. TABLAS DE GESTIÓN (el corazón del CRM — nunca se borran)
--    Reemplazan la hoja "seguimiento" y sus JSON embebidos
-- ------------------------------------------------------------

create table public.gestiones (
  folio text primary key,
  estatus text not null default 'sin_gestion',
  prox_accion text,
  prox_fecha date,
  notas text,
  cobrador text,
  fecha_contactado date,
  fecha_carta date,
  fecha_aviso_final date,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table public.contactos (
  id uuid primary key default gen_random_uuid(),
  folio text not null,
  fecha timestamptz not null default now(),
  tipo text,                        -- whatsapp, llamada, penalizacion, morosidad,
                                    -- pre-cancelacion, aviso_final, rescision, nota...
  descripcion text,
  agente text,
  creado_en timestamptz not null default now()
);
create index idx_contactos_folio on public.contactos (folio);
create index idx_contactos_fecha on public.contactos (fecha);
create index idx_contactos_agente on public.contactos (agente);

create table public.compromisos (
  id text primary key,              -- conserva el id original del JSON migrado
  folio text not null,
  fecha_compromiso date not null,
  monto numeric,
  estatus text not null default 'pendiente'
    check (estatus in ('pendiente', 'cumplido', 'incumplido', 'descartado')),
  agente text,
  notas text,
  creado_en timestamptz not null default now(),
  resuelto_en timestamptz
);
create index idx_compromisos_folio on public.compromisos (folio);
create index idx_compromisos_fecha on public.compromisos (fecha_compromiso);

create table public.cartas (
  id uuid primary key default gen_random_uuid(),
  folio text not null,
  tipo text not null check (tipo in ('precancelacion', 'rescision')),
  generada_por text,
  generada_en timestamptz not null default now(),
  archivo_path text                 -- ruta en Supabase Storage (bucket "cartas")
);
create index idx_cartas_folio on public.cartas (folio);

create table public.snapshots_cartera (
  fecha date primary key,
  total_vencido numeric,
  expedientes_vencidos int,
  total_cartera numeric,
  datos jsonb,
  creado_en timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 4. TRIGGER: updated_at automático en gestiones
-- ------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger trg_gestiones_updated
before update on public.gestiones
for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- 5. VISTAS DE NEGOCIO
-- ------------------------------------------------------------

-- Cartera vencida enriquecida (reporte + gestión en una sola consulta)
create or replace view public.v_cartera_vencida as
select
  sv.folio,
  sv.cliente,
  sv.telefono,
  sv.unidad,
  sv.etapa,
  sv.parcialidades_vencidas,
  sv.monto_vencido,
  sv.pct_saldo_vencido,
  sv.dias_vencimiento,
  sv.fecha_ultimo_pago,
  e.mensualidad,
  e.saldo_total,
  e.status,
  g.estatus       as estatus_gestion,
  g.prox_accion,
  g.prox_fecha,
  g.cobrador,
  g.updated_at    as gestion_actualizada,
  case
    when sv.parcialidades_vencidas >= 4 then 'critico'
    when sv.parcialidades_vencidas = 3 then 'alto'
    when sv.parcialidades_vencidas = 2 then 'medio'
    else 'bajo'
  end as nivel_riesgo
from public.saldos_vencidos sv
left join public.expedientes e on e.folio = sv.folio
left join public.gestiones g   on g.folio = sv.folio
where coalesce(g.estatus, '') not in ('rescindido', 'regularizado');

-- Mensualidades esperadas: SOLO expedientes con STATUS = 'Cobranza'
create or replace view public.v_mensualidades_esperadas as
select
  count(*)                       as expedientes_cobranza,
  coalesce(sum(mensualidad), 0)  as total_esperado
from public.expedientes
where status = 'Cobranza';

-- Productividad por agente y día (tipos de mensaje que cuentan para la meta)
create or replace view public.v_productividad as
select
  agente,
  date(fecha) as dia,
  count(distinct folio) as expedientes_gestionados,
  count(*)              as gestiones_totales
from public.contactos
where tipo in ('penalizacion', 'morosidad', 'pre-cancelacion', 'aviso_final', 'rescision')
group by agente, date(fecha);

-- Pendientes de HOY: acciones vencidas sin resolver + programadas hoy + compromisos
create or replace view public.v_pendientes_hoy as
select
  'accion' as tipo_item,
  g.folio,
  g.prox_accion   as descripcion,
  g.prox_fecha    as fecha,
  g.cobrador      as agente,
  null::numeric   as monto,
  case when g.prox_fecha < current_date then 'vencida' else 'hoy' end as estado
from public.gestiones g
where g.prox_fecha <= current_date
  and g.prox_accion is not null
union all
select
  'compromiso',
  c.folio,
  'Compromiso de pago',
  c.fecha_compromiso,
  c.agente,
  c.monto,
  case when c.fecha_compromiso < current_date then 'vencida' else 'hoy' end
from public.compromisos c
where c.fecha_compromiso <= current_date
  and c.estatus = 'pendiente';

-- ------------------------------------------------------------
-- 6. ROW LEVEL SECURITY
-- ------------------------------------------------------------

-- Helper: ¿el usuario autenticado está activo?
create or replace function public.usuario_activo()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and activo = true
  );
$$;

-- Activar RLS en todas las tablas
alter table public.perfiles          enable row level security;
alter table public.expedientes       enable row level security;
alter table public.saldos_vencidos   enable row level security;
alter table public.saldos_expediente enable row level security;
alter table public.pagos             enable row level security;
alter table public.inventario        enable row level security;
alter table public.cancelados        enable row level security;
alter table public.gestiones         enable row level security;
alter table public.contactos         enable row level security;
alter table public.compromisos       enable row level security;
alter table public.cartas            enable row level security;
alter table public.snapshots_cartera enable row level security;

-- Perfiles: cada quien lee el suyo (y los admins gestionan por dashboard de Supabase)
create policy perfiles_leer_propio on public.perfiles
  for select using (id = auth.uid());

-- Tablas espejo: solo lectura para usuarios activos
-- (la escritura la hace el módulo de importación con service_role, que ignora RLS)
create policy leer_expedientes       on public.expedientes       for select using (public.usuario_activo());
create policy leer_saldos_vencidos   on public.saldos_vencidos   for select using (public.usuario_activo());
create policy leer_saldos_expediente on public.saldos_expediente for select using (public.usuario_activo());
create policy leer_pagos             on public.pagos             for select using (public.usuario_activo());
create policy leer_inventario        on public.inventario        for select using (public.usuario_activo());
create policy leer_cancelados        on public.cancelados        for select using (public.usuario_activo());

-- Tablas de gestión: lectura y escritura para usuarios activos
-- (igual que hoy: cobradoras y admins pueden gestionar; se puede restringir después)
create policy gestiones_todo   on public.gestiones          for all using (public.usuario_activo()) with check (public.usuario_activo());
create policy contactos_todo   on public.contactos          for all using (public.usuario_activo()) with check (public.usuario_activo());
create policy compromisos_todo on public.compromisos        for all using (public.usuario_activo()) with check (public.usuario_activo());
create policy cartas_todo      on public.cartas             for all using (public.usuario_activo()) with check (public.usuario_activo());
create policy snapshots_todo   on public.snapshots_cartera  for all using (public.usuario_activo()) with check (public.usuario_activo());

-- ============================================================
-- FIN DEL ESQUEMA
-- ============================================================
