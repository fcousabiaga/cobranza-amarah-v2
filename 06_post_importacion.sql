-- ============================================================
-- COBRANZA AMARAH v2 — Automatización post-importación
-- Correr una sola vez en el SQL Editor
-- ============================================================
-- Se ejecuta automáticamente al terminar cada importación de
-- reportes. Hace 4 cosas:
--   1. AUTO-REGULARIZACIÓN: folios en proceso de cobranza que ya
--      no aparecen en saldos vencidos → estatus 'regularizado',
--      se limpia su acción pendiente y se anota en el historial.
--   2. LIMPIEZA: acciones colgadas de folios rescindidos o
--      regularizados (conserva las de "Dar de baja...").
--   3. VERIFICACIÓN: corre verificar_compromisos_pagos() con los
--      pagos recién importados.
--   4. SNAPSHOT: guarda la foto del día de la cartera vencida
--      para el histórico.

create or replace function public.post_importacion(ejecutado_por text default 'Sistema')
returns jsonb language plpgsql security definer as $$
declare
  r record;
  regularizados int := 0;
  limpiadas int := 0;
  verificados int := 0;
  tv numeric; ne int;
begin
  -- 1. Auto-regularización
  for r in
    select g.folio from public.gestiones g
    where g.estatus in ('contactado', 'penalidad_verificada', 'plan_pagos',
                        'haciendo_cambio_ajustes', 'carta_precancelacion',
                        'en_firma_rescindir')
      and not exists (select 1 from public.saldos_vencidos sv where sv.folio = g.folio)
  loop
    update public.gestiones
    set estatus = 'regularizado', prox_accion = null, prox_fecha = null,
        updated_by = ejecutado_por
    where folio = r.folio;

    insert into public.contactos (folio, tipo, descripcion, agente)
    values (r.folio, 'Sistema',
      'Folio regularizado automáticamente: ya no aparece en saldos vencidos del CRM',
      'Sistema');

    regularizados := regularizados + 1;
  end loop;

  -- 2. Limpieza de acciones colgadas
  with u as (
    update public.gestiones
    set prox_accion = null, prox_fecha = null
    where estatus in ('rescindido', 'regularizado')
      and prox_accion is not null
      and prox_accion not ilike 'Dar de baja%'
    returning 1
  ) select count(*) into limpiadas from u;

  -- 3. Verificación de compromisos contra los pagos recién importados
  verificados := public.verificar_compromisos_pagos();

  -- 4. Snapshot del día
  select coalesce(sum(monto_vencido), 0), count(*) into tv, ne
  from public.saldos_vencidos;

  insert into public.snapshots_cartera (fecha, total_vencido, expedientes_vencidos, total_cartera)
  select public.hoy_mx(), tv, ne,
         (select coalesce(sum(saldo_total), 0) from public.expedientes where status = 'Cobranza')
  on conflict (fecha) do update
    set total_vencido = excluded.total_vencido,
        expedientes_vencidos = excluded.expedientes_vencidos,
        total_cartera = excluded.total_cartera;

  return jsonb_build_object(
    'regularizados', regularizados,
    'acciones_limpiadas', limpiadas,
    'compromisos_verificados', verificados,
    'cartera_vencida', tv,
    'folios_vencidos', ne
  );
end $$;

grant execute on function public.post_importacion(text) to authenticated;
