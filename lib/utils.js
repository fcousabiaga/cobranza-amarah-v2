export const money = (v) =>
  v == null ? '—' : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(v);

export const fechaCorta = (s) => {
  if (!s) return '—';
  const [y, m, d] = String(s).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

// Fecha local de México (Supabase corre en UTC)
export const hoyMX = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());

export const ESTATUS = [
  ['sin_gestion', 'Sin gestión'],
  ['sin_accion', 'Sin acción'],
  ['contactado', 'Contactado'],
  ['plan_pagos', 'Plan de pagos'],
  ['penalidad_verificada', 'Penalidad verificada'],
  ['haciendo_cambio_ajustes', 'Haciendo cambio/ajustes'],
  ['carta_precancelacion', 'Carta pre-cancelación'],
  ['en_firma_rescindir', 'En firma para rescindir'],
  ['regularizado', 'Regularizado'],
  ['rescindido', 'Rescindido'],
];

export const nombreEstatus = (k) => (ESTATUS.find(([v]) => v === k) || [k, k])[1];
