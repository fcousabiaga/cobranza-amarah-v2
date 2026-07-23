# Cobranza Amarah — Reglamento del motor de cobranza

Este documento define **todas las reglas automáticas** que alimentan el tablero **Hoy**. Es el contrato de operación: si una regla cambia, se cambia aquí y en la base de datos, y todo el equipo trabaja igual.

---

## Ciclo de vida de un folio vencido

```
Cliente se atrasa → aparece en saldos vencidos
   ↓
[R6] Sin contacto 7 días → "Seguimiento pendiente"
   ↓  (la agente contacta, negocia)
   ├── Cliente promete pagar → COMPROMISO DE PAGO → ciclo R2/R3/R4
   ├── Cliente crítico (3+ vencidas) → [R5] "Pre-carta por enviar"
   ↓
Pre-carta generada → estatus carta_precancelacion, plazo 5 días hábiles
   ↓
[R1] Plazo cumplido sin pago → "Enviar rescisión definitiva"
   ↓
Rescisión generada → estatus rescindido → SALE de cartera y de la cola
```

---

## Las reglas, una por una

### R1 — Enviar rescisión definitiva (prioridad 1)
- **Se activa cuando:** el folio tiene estatus `carta_precancelacion` y su pre-carta ya cumplió **5 días hábiles**.
- **La app muestra:** "Enviar cancelación definitiva — la pre-carta del DD/MM cumplió su plazo".
- **Acción de la agente:** abrir expediente → botón ⚫ Carta rescisión.
- **Al generarla:** estatus → `rescindido`, sale de cartera vencida, se programa "dar de baja en el sistema" a 3 días.
- **Se desactiva sola si:** el cliente se regulariza antes (cambio de estatus) o paga (verificación de pagos).

### R2 — Compromiso de pago, día D y vencidos (prioridad 2)
- **Se activa cuando:** un compromiso `pendiente` llega a su fecha (D0) o ya la pasó (D+1, D+2...).
- **La app muestra:** "HOY vence el compromiso — confirmar depósito" o "Compromiso vencido hace N días — verificar o marcar no pagó".
- **💵 Detección de pagos:** si el CRM ya registró pagos del folio posteriores a la creación del compromiso, el item muestra la insignia verde con el monto y la fecha — la agente confirma con evidencia, no de memoria.
- **Acción:** botón **Pagó** / **No pagó**. Todo queda en el historial.

### R3 — Recordatorio previo, día D-1 (prioridad 3)
- **Se activa cuando:** un compromiso `pendiente` vence **mañana**.
- **La app muestra:** "Recordar al cliente su compromiso de MAÑANA".
- **Acción:** la agente manda el WhatsApp/llamada y presiona **✓ Recordatorio enviado** (queda registrado en el historial y cuenta para su meta diaria).

### R4 — Verificación automática contra pagos reales
- **Cómo funciona:** cada vez que se abre el tablero Hoy (y en cada importación futura de reportes), la base de datos cruza los compromisos pendientes/incumplidos contra la tabla de **pagos del CRM**.
- **Criterio de cumplimiento:** pagos del folio, posteriores a la creación del compromiso y hasta 5 días después de la fecha prometida, que **sumen al menos el monto comprometido**.
- **Si cumple:** el compromiso se marca `cumplido` + `verificado` automáticamente, con nota en el historial ("verificado contra pagos del CRM: $X registrados"). Nadie tiene que hacerlo a mano.
- **Nota:** la tabla de pagos se actualiza con cada importación de reportes, así que la verificación es tan fresca como el último corte.

### R5 — Pre-cartas por enviar (prioridad 5)
- **Se activa cuando:** un folio vencido tiene **≥ 3 parcialidades vencidas** (umbral ajustable), sin carta previa, y su gestión no está en proceso (excluye plan_pagos, cambio/ajustes, carta ya enviada, rescindido, regularizado).
- **Acción:** abrir expediente → 📄 Carta pre-cancelación. Un clic hace todo: PDF, historial, estatus, plazo de 5 días hábiles y archivo en Storage.

### R6 — Seguimiento pendiente (prioridad 6)
- **Se activa cuando:** un folio vencido lleva **7+ días sin ningún contacto** registrado (o nunca ha sido contactado), y no cae en ninguna otra regla ni tiene compromiso vigente.
- **Objetivo:** que ningún cliente moroso quede olvidado.

### Acciones programadas manualmente (prioridad 4)
- Todo lo que las agentes agenden con "Próxima acción" en el expediente aparece en su fecha (y permanece si se vence, hasta resolverse o descartarse).

---

## Parámetros ajustables (y dónde viven)

| Parámetro | Valor actual | Dónde se cambia |
|---|---|---|
| Plazo de la pre-carta | 5 días hábiles | `05_reglas_compromisos.sql` (función y regla R1) y carta PDF |
| Umbral de pre-carta | 3+ parcialidades vencidas | comentario `← umbral ajustable` en la vista |
| Días sin contacto para seguimiento | 7 días | regla R6 en la vista |
| Ventana de verificación de pagos | creación → fecha + 5 días | función `verificar_compromisos_pagos()` |
| Tolerancia del monto verificado | 100% del comprometido | función (se puede bajar a 95%, etc.) |
| Recordatorio previo | 1 día antes | regla R3 (se puede agregar D-2, D-3) |
| Meta diaria por agente | 10 expedientes | `META_DIARIA` en `hoy/page.js` |
| Baja tras rescisión | 3 días | `ExpedienteModal.js` |

## Reglas futuras (cuando entre el módulo de importación)

- **Auto-regularización:** folio que desaparece de saldos vencidos en una importación → estatus `regularizado` automático + limpieza de acciones pendientes + nota en historial.
- **Verificación masiva post-importación:** correr `verificar_compromisos_pagos()` al final de cada importación.
- **Alerta de reincidencia:** folio regularizado que reaparece vencido → prioridad alta con su historial completo a la vista.
