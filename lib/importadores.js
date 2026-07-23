// Transformadores de los reportes del CRM (lado servidor)
// Réplica exacta de la lógica validada en la migración inicial.

const parseMoney = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Math.round(v * 100) / 100;
  const s = String(v).replace(/[$,\s]/g, '');
  if (!s || s === '-' || s === 'N/A') return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

const parseInt_ = (v) => {
  const n = parseMoney(v);
  return n === null ? null : Math.trunc(n);
};

const parseDate = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !isNaN(v)) {
    // SheetJS entrega Date en UTC del valor de celda
    return v.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  return null;
};

const parseText = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s || null;
};

const normFolio = (v) => {
  const s = parseText(v);
  if (!s) return null;
  return /^\d+\.0$/.test(s) ? s.slice(0, -2) : s;
};

const rawJson = (r) => {
  const o = {};
  for (const [k, v] of Object.entries(r)) {
    o[k] = v instanceof Date ? v.toISOString().slice(0, 10) : v;
  }
  return o;
};

// ---------- transformadores por reporte ----------

const tExpedientes = (rows) => rows.map((r) => {
  const folio = normFolio(r['FOLIO']);
  if (!folio) return null;
  return {
    folio,
    fecha_crm: parseDate(r['FECHA CRM']),
    proyecto: parseText(r['PROYECTO']),
    fase: parseText(r['FASE']),
    etapa: parseText(r['ETAPA']),
    unidad: parseText(r['UNIDAD']),
    mt2: parseMoney(r['MT2']),
    plan: parseText(r['PLAN']),
    costo: parseMoney(r['COSTO']),
    saldo_total: parseMoney(r['SALTO TOTAL (ACTUAL)']),
    importe_pagado: parseMoney(r['IMPORTE TOTAL PAGADO']),
    nombre_cliente: parseText(r['NOMBRE CLIENTE']),
    correo_cliente: parseText(r['CORREO CLIENTE']),
    telefono_cliente: parseText(r['NÚMERO DE TELÉFONO CLIENTE']),
    pais_cliente: parseText(r['PAÍS CLIENTE']),
    estado_cliente: parseText(r['ESTADO CLIENTE']),
    status: parseText(r['STATUS']),
    metodo_pago: parseText(r['MÉTODO DE PAGO']),
    plazo: parseText(r['PLAZO']),
    enganche: parseMoney(r['ENGANCHE/ANTICIPO']),
    meses_enganche: parseMoney(r['MESES DE ENGANCHE']),
    fecha_primera_parcialidad: parseDate(r['FECHA DE LA PRIMERA PARCIALIDAD']),
    fecha_firma_contrato: parseDate(r['FECHA DE FIRMA DE CONTRATO']),
    mensualidad: parseMoney(r['MONTO PRIMER ACTUALIZACIÓN']),
    mensualidad_2: parseMoney(r['MONTO SEGUNDA ACTUALIZACIÓN']),
    mensualidad_3: parseMoney(r['MONTO TERCERA ACTUALIZACIÓN']),
    nombre_asesor: parseText(r['NOMBRE ASESOR']),
    raw: rawJson(r),
  };
}).filter(Boolean);

const tSaldosVencidos = (rows) => rows.map((r) => {
  const folio = normFolio(r['FOLIO DE LA VENTA']);
  if (!folio) return null;
  return {
    folio,
    cliente: parseText(r['CLIENTE']),
    telefono: parseText(r['TELÉFONO']),
    etapa: parseText(r['ETAPA']),
    privada: parseText(r['PRIVADA']),
    unidad: parseText(r['UNIDAD']),
    superficie_m2: parseMoney(r['SUPERFICIE M2']),
    importe_venta: parseMoney(r['IMPORTE DE VENTA']),
    num_pagos_realizados: parseInt_(r['NUMERO DE PAGOS REALIZADOS']),
    fecha_ultimo_pago: parseDate(r['FECHA DE ÚLTIMO PAGO']),
    monto_total_pagado: parseMoney(r['MONTO TOTAL PAGADO']),
    parcialidades_vencidas: parseInt_(r['NUMERO DE PARCIALIDADES VENCIDAS']),
    monto_vencido: parseMoney(r['MONTO TOTAL VENCIDO']),
    pct_saldo_vencido: parseMoney(r['PORCENTAJE DE SALDO VENCIDO']),
    enganche: parseMoney(r['ENGANCHE']),
    parcialidad: parseMoney(r['PARCIALIDAD']),
    dias_vencimiento: parseInt_(r['DÍAS DE VENCIMIENTO']),
    fecha_primer_pago: parseDate(r['FECHA DEL PRIMER PAGO']),
  };
}).filter(Boolean);

const tSaldosExpediente = (rows) => rows.map((r) => {
  const folio = normFolio(r['FOLIO']);
  if (!folio) return null;
  return {
    folio,
    nombre_cliente: parseText(r['NOMBRE DEL CLIENTE']),
    etapa: parseText(r['ETAPA']),
    unidad: parseText(r['UNIDAD']),
    plan: parseText(r['PLAN']),
    costo_precio_venta: parseMoney(r['COSTO PRECIO DE VENTA']),
    saldo_total: parseMoney(r['SALDO TOTAL (ACTUAL)']),
    area: parseMoney(r['ÁREA']),
    total_apartado: parseMoney(r['TOTAL APARTADO']),
    valor_enganche: parseMoney(r['VALOR DEL ENGANCHE']),
    fecha_firma_clientes: parseDate(r['FECHA DE FIRMA DE CLIENTES']),
    parcialidades_pendientes: parseInt_(r['PARCIALIDADES PENDIENTES']),
    telefono_cliente: parseText(r['NÚMERO DE TELÉFONO CLIENTE']),
    fecha_ultima_mensualidad: parseDate(r['FECHA DE ÚLTIMA MENSUALIDAD']),
  };
}).filter(Boolean);

const tPagos = (rows) => rows.map((r) => {
  const folio = normFolio(r['Folio de la venta']);
  if (!folio) return null;
  return {
    folio,
    cliente: parseText(r['Cliente']),
    etapa: parseText(r['Etapa']),
    unidad: parseText(r['Unidad']),
    numero_pago: parseText(r['Número de pago']),
    fecha_amortizacion: parseDate(r['Fecha de amortización']),
    concepto: parseText(r['Concepto de pago']),
    monto_a_pagar: parseMoney(r['Monto a pagar']),
    folio_pago: parseText(r['Folio de pago']),
    fecha_comprobante: parseDate(r['Fecha del comprobante de pago']),
    metodo_pago: parseText(r['Método de pago']),
    tipo_pago: parseText(r['Tipo de pago']),
    monto_pagado: parseMoney(r['Monto pagado']),
    fecha_aplicacion: parseDate(r['Fecha de aplicación de pago* registro en sistema']),
    estatus: parseText(r['Estatus']),
  };
}).filter(Boolean);

const tInventario = (rows) => rows.map((r) => ({
  proyecto: parseText(r['PROYECTO']),
  fase: parseText(r['FASE']),
  etapa: parseText(r['ETAPA']),
  lote: parseText(r['# LOTE']),
  empresa_propietaria: parseText(r['EMPRESA PROPIETARIA']),
  clasificador: parseText(r['CLASIFICADOR']),
  area_m2: parseMoney(r['AREA M2']),
  precio_m2: parseMoney(r['PRECIO M2']),
  estado: parseText(r['ESTADO']),
  valor: parseMoney(r['VALOR']),
  folio_venta: normFolio(r['FOLIO DE VENTA']),
  fecha_venta: parseDate(r['FECHA DE VENTA']),
}));

const tCancelados = (rows) => rows.map((r) => {
  const folio = normFolio(r['FOLIO']);
  if (!folio) return null;
  return {
    folio,
    nombre_cliente: parseText(r['NOMBRE CLIENTE']),
    unidad: parseText(r['UNIDAD']),
    etapa: parseText(r['ETAPA']),
    status: parseText(r['STATUS']),
    motivos_cancelacion: parseText(r['MOTIVOS DE CANCELACIÓN']),
    costo: parseMoney(r['COSTO']),
    importe_pagado: parseMoney(r['IMPORTE TOTAL PAGADO']),
    raw: rawJson(r),
  };
}).filter(Boolean);

// ---------- detección automática del tipo de reporte ----------
// Nota: expedientes y cancelados tienen encabezados IDÉNTICOS en el CRM;
// se distinguen por el contenido (cancelados = 100% STATUS 'Cancelado').
export function detectarTipo(headers, rows = []) {
  const h = new Set(headers);
  if (h.has('FOLIO DE LA VENTA')) return 'saldos_vencidos';
  if (h.has('Folio de la venta')) return 'pagos';
  if (h.has('# LOTE')) return 'inventario';
  if (h.has('SALTO TOTAL (ACTUAL)')) {
    const conStatus = rows.filter((r) => r['STATUS']);
    if (!conStatus.length) return 'expedientes';
    const cancelados = conStatus.filter((r) => String(r['STATUS']).trim() === 'Cancelado').length;
    return cancelados / conStatus.length >= 0.9 ? 'cancelados' : 'expedientes';
  }
  if (h.has('SALDO TOTAL (ACTUAL)')) return 'saldos_expediente';
  return null;
}

export const TRANSFORMADORES = {
  expedientes: { fn: tExpedientes, clave: 'folio', dedupe: true },
  saldos_vencidos: { fn: tSaldosVencidos, clave: 'folio', dedupe: true },
  saldos_expediente: { fn: tSaldosExpediente, clave: 'folio', dedupe: true },
  pagos: { fn: tPagos, clave: null, dedupe: false },
  inventario: { fn: tInventario, clave: null, dedupe: false },
  cancelados: { fn: tCancelados, clave: 'folio', dedupe: true },
};
