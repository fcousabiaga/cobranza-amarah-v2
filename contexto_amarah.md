# Contexto Amarah — Documento maestro (v2)
**Actualizado:** 22 de julio de 2026 · Arquitectura nueva en producción

## Qué es
**Cobranza Amarah v2**: sistema de cobranza del desarrollo Amarah (Grupo Ureca de México). Gestiona ~450 expedientes de clientes que compraron terreno a crédito. Equipo: cobradoras Andrea Ramirez, Liz Olvera, Nana Retana; admins Francisco Usabiaga (Pancho, dueño del proyecto), ER, Enrique Gonzalez, Oscar Retana.

## Arquitectura (v2 — reemplazó a GitHub Pages + Apps Script + Google Sheets)
- **Frontend:** Next.js 14 (app router, JS, componentes cliente), repo GitHub → **Vercel** (`cobranza-amarah-v2.vercel.app`). Deploy automático con cada push a main.
- **Base de datos:** **Supabase** (proyecto `cszvlhtfitjuvumkabyk`), Postgres con RLS + Auth + Realtime + Storage.
- **Auth:** email/contraseña (Supabase Auth) + tabla `perfiles` (rol: cobrador/admin, activo). Sesión persistente por dispositivo.
- **PDF:** jsPDF en el cliente; assets (logos Ureca/Amarah + firma de Pancho) en base64 en `lib/cartasAssets.js`.
- **Fuentes:** Archivo (títulos), Inter (cuerpo), IBM Plex Mono (folios/montos), vía Google Fonts link.
- La app vieja (fcousabiaga.github.io/cobranza-amarah + Apps Script + Sheets) queda como respaldo histórico de solo lectura.

## Esquema de datos (12 tablas + vistas)
**Espejo del CRM** (se reemplazan en cada importación): `expedientes` (con `raw` jsonb de las 91 columnas), `saldos_vencidos`, `saldos_expediente`, `pagos`, `inventario`, `cancelados`.
**Gestión** (nunca se borran): `gestiones` (1/folio: estatus, prox_accion/fecha, notas, cobrador, fechas de cartas), `contactos` (1 fila por contacto), `compromisos` (1 fila por compromiso; campos verificado/monto_verificado), `cartas` (log de PDFs, archivo en Storage bucket `cartas`), `snapshots_cartera`, `perfiles`.
**Vistas:** `v_cartera_vencida` (excluye rescindidos/regularizados; nivel_riesgo por parcialidades), `v_mensualidades_esperadas` (STATUS='Cobranza'), `v_cola_trabajo` (el motor del tab Hoy), `v_meta_hoy`, `v_productividad`, `v_pendientes_hoy` (legado).
**Funciones:** `hoy_mx()`, `sumar_dias_habiles()`, `usuario_activo()`, `verificar_compromisos_pagos()`, `post_importacion()`.

## El motor de cobranza (tab Hoy = centro de operación)
Reglas documentadas en `REGLAS_MOTOR.md` (fuente de verdad). Resumen:
1. **Enviar rescisión** — pre-carta + 5 días hábiles sin pago
2. **Compromisos D0/vencidos** — con insignia 💵 si el CRM ya registró pagos
3. **Recordatorio D-1** — compromisos de mañana
4. **Acciones programadas** manualmente
5. **Pre-cartas por enviar** — 3+ parcialidades vencidas sin carta (umbral ajustable)
6. **Seguimiento** — vencidos sin contacto en 7+ días
Verificación automática: compromisos se marcan cumplidos solos contra la tabla `pagos`. Meta diaria: 10 expedientes/agente con medidor. Filtro Todas/Solo mías.

## Cartas PDF (en el modal del expediente)
- **Pre-cancelación** (1 pág): descarga + estatus `carta_precancelacion` + fecha_carta + próxima acción a 5 días hábiles + archivo en Storage.
- **Rescisión definitiva** (2 págs, con firma): pide fecha contrato + fecha pre-carta (autollenadas) → estatus `rescindido` (sale de cartera) + "dar de baja" a 3 días.
- Diseño fiel a plantillas oficiales (membrete dual, tablas, cajas de alerta, texto legal, pie de contacto).

## Módulo de importación (/importar, solo admins)
Sube los xlsx tal cual salen de Adara (juntos o sueltos) → API los identifica por contenido (ojo: expedientes y cancelados tienen encabezados idénticos; se distinguen porque cancelados = 100% STATUS 'Cancelado') → reemplaza espejos en bloques de 500 → `post_importacion()`: auto-regularización (folios que salen de saldos vencidos → `regularizado` + limpia acción + nota), limpieza de acciones colgadas (conserva "Dar de baja..."), verificación de compromisos, snapshot del día. Devuelve resumen visual.
Requiere `SUPABASE_SERVICE_ROLE_KEY` como variable de entorno en Vercel (server-only).

## Archivos SQL aplicados (en orden)
`01_schema.sql` → `02_usuarios_y_realtime.sql` → `03_storage_cartas.sql` → `04_cola_trabajo.sql` → `05_reglas_compromisos.sql` → `06_post_importacion.sql`

## Decisiones y aprendizajes clave
- Escrituras vía Supabase JS (POST real); el hack de GET por CORS murió con Apps Script.
- Fechas SIEMPRE con zona `America/Mexico_City` (`hoy_mx()` en SQL, `hoyMX()` en JS) — Supabase corre en UTC.
- La migración inicial fusionó 7 folios duplicados y dedupicó 73 contactos (secuelas del bug viejo de guardado).
- Al migrar se detectaron 9 compromisos ya pagados sin marcar — la verificación automática existe por esto.
- Números de control: 449 exp. en Cobranza / ~$1.81M mensualidades esperadas / cartera vencida ~$2.07M en 106 folios activos (jul 2026).
- La vista de cartera EXCLUYE rescindidos/regularizados (resuelto el viejo pendiente de conteos inflados).

## Pendientes / siguiente horizonte
- Crear los 6 usuarios restantes del equipo y hacer el corte oficial con las cobradoras.
- Definir asignación de cartera por agente (¿por etapa, rangos de folio, o libre?) para que "Solo mías" sea la jornada completa.
- Fase 6: sincronización automática con la API de Adara CRM (pedir docs a soporte de Adara; la capa de transformación ya está lista para reusarse).
- Posibles: recordatorios D-2/D-3, alerta de reincidencia, tab Productividad/Histórico con snapshots, notificaciones push/WhatsApp.
