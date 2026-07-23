-- ============================================================
-- COBRANZA AMARAH v2 — Reglas de compromisos:
--   verificación contra pagos reales + recordatorios D-1/D0/D+1
-- Correr completo en el SQL Editor
-- ============================================================

-- Campos de verificación en compromisos
alter table public.compromisos add column if not exists verificado boolean not null default false;
alter table public.compromisos add column if not exists monto_verificado numeric;

-- ------------------------------------------------------------
-- VERIFICACIÓN AUTOMÁTICA CONTRA PAGOS
-- Un compromiso se considera CUMPLIDO cuando en la tabla `pagos`
-- (el espejo del CRM) aparecen pagos del folio, posteriores a la
-- creación del compromiso, que suman al menos el monto prometido.
-- Ventana: desde que se creó el compromiso hasta 5 días después
-- de la fecha comprometida (o hasta hoy si aún no llega).
-- Es idempotente: solo actúa cuando encuentra evidencia nueva.
-- ------------------------------------------------------------
create or replace function public.verificar_compromisos_pagos()
returns int language plpgsql security definer as $$
declare
  c record;
  pagado numeric;
  marcados int := 0;
begin
  for c in
    select * from public.compromisos
    where estatus in ('pendiente', 'incumplido') and verificado = false
  loop
    select coalesce(sum(p.monto_pagado), 0) into pagado
    from public.pagos p
    where p.folio = c.folio
      and p.monto_pagado > 0
      and p.fecha_comprobante >= c.creado_en::date
      and p.fecha_comprobante <= greatest(c.fecha_compromiso, public.hoy_mx()) + 5;

    if pagado > 0 and pagado >= coalesce(c.monto, 0) then
      update public.compromisos
      set estatus = 'cumplido', verificado = true,
          monto_verificado = pagado, resuelto_en = now()
      where id = c.id;

      insert into public.contactos (folio, tipo, descripcion, agente)
      values (c.folio, 'Sistema',
        'Compromiso del ' || to_char(c.fecha_compromiso, 'DD/MM/YYYY') ||
        ' verificado contra pagos del CRM: $' ||
        to_char(pagado, 'FM999,999,990.00') || ' registrados', 'Sistema');

      marcados := marcados + 1;
    end if;
  end loop;
  return marcados;
end $$;

grant execute on function public.verificar_compromisos_pagos() to authenticated;

-- ------------------------------------------------------------
-- COLA DE TRABAJO v2 — con recordatorios D-1 / D0 / D+1
-- y detección de pagos en compromisos
-- ------------------------------------------------------------
drop view if exists public.v_cola_trabajo;

create view public.v_cola_trabajo as
with hoy as (select public.hoy_mx() as f),

rescisiones as (
  select g.folio, public.sumar_dias_habiles(g.fecha_carta, 5) as vence
  from public.gestiones g, hoy h
  where g.estatus = 'carta_precancelacion'
    and g.fecha_carta is not null
    and public.sumar_dias_habiles(g.fecha_carta, 5) <= h.f
),

precartas as (
  select sv.folio, sv.cliente, sv.parcialidades_vencidas, sv.monto_vencido
  from public.saldos_vencidos sv
  left join public.gestiones g on g.folio = sv.folio
  where sv.parcialidades_vencidas >= 3            -- ← umbral ajustable
    and coalesce(g.estatus, 'sin_gestion') in
        ('sin_gestion', 'sin_accion', 'contactado', 'penalidad_verificada')
    and g.fecha_carta is null
)

-- 1. ENVIAR RESCISIÓN DEFINITIVA
select
  'enviar_rescision' as tipo_item, 1 as prioridad,
  r.folio,
  coalesce(e.nombre_cliente, sv.cliente) as cliente,
  'Enviar cancelación definitiva — la pre-carta del ' ||
    to_char(g.fecha_carta, 'DD/MM/YYYY') || ' cumplió su plazo' as descripcion,
  r.vence as fecha,
  sv.monto_vencido as monto,
  g.cobrador as agente,
  'vencida' as estado,
  null::text as pago_detectado
from rescisiones r
join public.gestiones g on g.folio = r.folio
left join public.expedientes e on e.folio = r.folio
left join public.saldos_vencidos sv on sv.folio = r.folio

union all

-- 2. COMPROMISOS: día del compromiso (D0) y vencidos (D+1 en adelante)
select
  'compromiso', 2, c.folio,
  coalesce(e.nombre_cliente, sv.cliente),
  case
    when c.fecha_compromiso = h.f
      then 'HOY vence el compromiso' || coalesce(': ' || c.notas, '') || ' — confirmar depósito'
    else 'Compromiso vencido hace ' || (h.f - c.fecha_compromiso) ||
         ' día(s)' || coalesce(': ' || c.notas, '') || ' — verificar o marcar no pagó'
  end,
  c.fecha_compromiso, c.monto, c.agente,
  case when c.fecha_compromiso < h.f then 'vencida' else 'hoy' end,
  pd.texto
from public.compromisos c
cross join hoy h
left join public.expedientes e on e.folio = c.folio
left join public.saldos_vencidos sv on sv.folio = c.folio
left join lateral (
  select 'Pago(s) por $' || to_char(sum(p.monto_pagado), 'FM999,999,990.00') ||
         ' registrados desde el ' || to_char(min(p.fecha_comprobante), 'DD/MM/YYYY') as texto
  from public.pagos p
  where p.folio = c.folio and p.monto_pagado > 0
    and p.fecha_comprobante >= c.creado_en::date
  having sum(p.monto_pagado) > 0
) pd on true
where c.estatus = 'pendiente' and c.fecha_compromiso <= h.f

union all

-- 3. RECORDATORIO PREVIO (D-1): compromiso que vence MAÑANA
select
  'recordatorio_compromiso', 3, c.folio,
  coalesce(e.nombre_cliente, sv.cliente),
  'Recordar al cliente su compromiso de MAÑANA' || coalesce(': ' || c.notas, ''),
  c.fecha_compromiso, c.monto, c.agente, 'hoy',
  null
from public.compromisos c
cross join hoy h
left join public.expedientes e on e.folio = c.folio
left join public.saldos_vencidos sv on sv.folio = c.folio
where c.estatus = 'pendiente' and c.fecha_compromiso = h.f + 1

union all

-- 4. ACCIONES PROGRAMADAS
select
  'accion', 4, g.folio,
  coalesce(e.nombre_cliente, sv.cliente),
  g.prox_accion, g.prox_fecha, null::numeric, g.cobrador,
  case when g.prox_fecha < h.f then 'vencida' else 'hoy' end,
  null
from public.gestiones g
cross join hoy h
left join public.expedientes e on e.folio = g.folio
left join public.saldos_vencidos sv on sv.folio = g.folio
where g.prox_fecha <= h.f
  and g.prox_accion is not null
  and not exists (select 1 from rescisiones r where r.folio = g.folio)

union all

-- 5. PRE-CARTAS POR ENVIAR
select
  'enviar_precarta', 5, p.folio,
  coalesce(e.nombre_cliente, p.cliente),
  'Enviar carta pre-cancelación — ' || p.parcialidades_vencidas ||
    ' parcialidades vencidas',
  null::date, p.monto_vencido, g.cobrador, 'sugerida',
  null
from precartas p
left join public.gestiones g on g.folio = p.folio
left join public.expedientes e on e.folio = p.folio

union all

-- 6. SEGUIMIENTO PENDIENTE
select
  'seguimiento', 6, sv.folio,
  coalesce(e.nombre_cliente, sv.cliente),
  case when uc.ultimo is null
    then 'Sin ningún contacto registrado — dar primer seguimiento'
    else 'Sin contacto desde el ' || to_char(uc.ultimo, 'DD/MM/YYYY') || ' — dar seguimiento'
  end,
  null::date, sv.monto_vencido, g.cobrador, 'sugerida',
  null
from public.saldos_vencidos sv
cross join hoy h
left join public.gestiones g on g.folio = sv.folio
left join public.expedientes e on e.folio = sv.folio
left join lateral (
  select max(c.fecha)::date as ultimo from public.contactos c where c.folio = sv.folio
) uc on true
where coalesce(g.estatus, 'sin_gestion') not in
      ('rescindido', 'regularizado', 'en_firma_rescindir', 'carta_precancelacion')
  and (uc.ultimo is null or uc.ultimo <= h.f - 7)
  and not exists (select 1 from precartas p where p.folio = sv.folio)
  and not exists (
    select 1 from public.compromisos c
    where c.folio = sv.folio and c.estatus = 'pendiente'
  );
