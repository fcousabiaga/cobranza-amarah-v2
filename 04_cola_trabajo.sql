-- ============================================================
-- COBRANZA AMARAH v2 — Motor de la cola de trabajo (tab Hoy)
-- Correr completo en el SQL Editor (reemplaza si ya existe)
-- ============================================================

-- Función: suma n días hábiles a una fecha (sáb/dom no cuentan)
create or replace function public.sumar_dias_habiles(d date, n int)
returns date language plpgsql immutable as $$
declare
  resultado date := d;
  faltan int := n;
begin
  while faltan > 0 loop
    resultado := resultado + 1;
    if extract(isodow from resultado) < 6 then
      faltan := faltan - 1;
    end if;
  end loop;
  return resultado;
end $$;

-- Fecha local de México (Supabase corre en UTC)
create or replace function public.hoy_mx()
returns date language sql stable as $$
  select (now() at time zone 'America/Mexico_City')::date;
$$;

-- ------------------------------------------------------------
-- LA COLA DE TRABAJO: todo lo accionable, generado por reglas
-- ------------------------------------------------------------
create or replace view public.v_cola_trabajo as
with hoy as (select public.hoy_mx() as f),

-- Regla 1: pre-carta enviada + 5 días hábiles cumplidos + sin regularizar
rescisiones as (
  select g.folio,
         public.sumar_dias_habiles(g.fecha_carta, 5) as vence
  from public.gestiones g, hoy h
  where g.estatus = 'carta_precancelacion'
    and g.fecha_carta is not null
    and public.sumar_dias_habiles(g.fecha_carta, 5) <= h.f
),

-- Regla 4: candidatos a pre-carta (3+ vencidas, sin carta, sin plan activo)
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
  'vencida' as estado
from rescisiones r
join public.gestiones g on g.folio = r.folio
left join public.expedientes e on e.folio = r.folio
left join public.saldos_vencidos sv on sv.folio = r.folio

union all

-- 2. COMPROMISOS DE PAGO (hoy y vencidos)
select
  'compromiso', 2, c.folio,
  coalesce(e.nombre_cliente, sv.cliente),
  'Compromiso de pago' || coalesce(': ' || c.notas, ''),
  c.fecha_compromiso, c.monto, c.agente,
  case when c.fecha_compromiso < h.f then 'vencida' else 'hoy' end
from public.compromisos c
cross join hoy h
left join public.expedientes e on e.folio = c.folio
left join public.saldos_vencidos sv on sv.folio = c.folio
where c.estatus = 'pendiente' and c.fecha_compromiso <= h.f

union all

-- 3. ACCIONES PROGRAMADAS (hoy y vencidas; excluye folios ya en regla 1)
select
  'accion', 3, g.folio,
  coalesce(e.nombre_cliente, sv.cliente),
  g.prox_accion, g.prox_fecha, null::numeric, g.cobrador,
  case when g.prox_fecha < h.f then 'vencida' else 'hoy' end
from public.gestiones g
cross join hoy h
left join public.expedientes e on e.folio = g.folio
left join public.saldos_vencidos sv on sv.folio = g.folio
where g.prox_fecha <= h.f
  and g.prox_accion is not null
  and not exists (select 1 from rescisiones r where r.folio = g.folio)

union all

-- 4. PRE-CARTAS POR ENVIAR (sugerencias automáticas)
select
  'enviar_precarta', 4, p.folio,
  coalesce(e.nombre_cliente, p.cliente),
  'Enviar carta pre-cancelación — ' || p.parcialidades_vencidas ||
    ' parcialidades vencidas',
  null::date, p.monto_vencido, g.cobrador, 'sugerida'
from precartas p
left join public.gestiones g on g.folio = p.folio
left join public.expedientes e on e.folio = p.folio

union all

-- 5. SEGUIMIENTO PENDIENTE (vencidos sin contacto en 7+ días)
select
  'seguimiento', 5, sv.folio,
  coalesce(e.nombre_cliente, sv.cliente),
  case when uc.ultimo is null
    then 'Sin ningún contacto registrado — dar primer seguimiento'
    else 'Sin contacto desde el ' || to_char(uc.ultimo, 'DD/MM/YYYY') || ' — dar seguimiento'
  end,
  null::date, sv.monto_vencido, g.cobrador, 'sugerida'
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

-- ------------------------------------------------------------
-- Productividad de hoy por agente (para el medidor de meta)
-- ------------------------------------------------------------
create or replace view public.v_meta_hoy as
select
  c.agente,
  count(distinct c.folio) as expedientes_gestionados
from public.contactos c
where (c.fecha at time zone 'America/Mexico_City')::date = public.hoy_mx()
  and c.agente is not null
group by c.agente;
