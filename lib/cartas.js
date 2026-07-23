// Generador de cartas oficiales — réplica de las plantillas de Grupo Ureca
import { jsPDF } from 'jspdf';
import { LOGO_URECA, LOGO_AMARAH, FIRMA, PROP } from './cartasAssets';

// ---------- utilidades ----------
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const fechaLarga = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${y}`;
};

const ddmmyyyy = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

const dinero = (v) =>
  v == null ? '—' : `$ ${Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;

// Suma n días hábiles a una fecha ISO (zona MX)
export const sumarDiasHabiles = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`);
  let faltan = n;
  while (faltan > 0) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) faltan--;
  }
  return d.toISOString().slice(0, 10);
};

export const sumarDias = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

// ---------- bloques compartidos ----------
const COLORES = {
  tinta: [40, 42, 50],
  gris: [100, 104, 112],
  rojo: [192, 57, 43],
  cafe: [122, 83, 62],
  lineaGris: [180, 182, 188],
  celdaGris: [243, 243, 241],
  borde: [200, 200, 198],
  alertaFondo: [251, 235, 233],
};

function membrete(doc) {
  const anchoU = 26;
  doc.addImage(LOGO_URECA, 'PNG', 22, 12, anchoU, anchoU * PROP.ureca);
  const anchoA = 46;
  doc.addImage(LOGO_AMARAH, 'PNG', 210 - 22 - anchoA, 20, anchoA, anchoA * PROP.amarah);
  doc.setDrawColor(...COLORES.lineaGris);
  doc.setLineWidth(0.5);
  doc.line(22, 46, 188, 46);
}

function pie(doc) {
  doc.setDrawColor(...COLORES.lineaGris);
  doc.setLineWidth(0.3);
  doc.line(22, 280, 188, 280);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORES.gris);
  doc.text('pagos@grupoureca.com   |   +52 999 489 1992   |   Lunes a Viernes 9:00 - 17:00 hrs', 105, 286, { align: 'center' });
}

function parrafo(doc, texto, x, y, ancho, { tam = 9.5, interlinea = 4.4, estilo = 'normal', color = COLORES.tinta } = {}) {
  doc.setFont('helvetica', estilo);
  doc.setFontSize(tam);
  doc.setTextColor(...color);
  const lineas = doc.splitTextToSize(texto, ancho);
  doc.text(lineas, x, y);
  return y + lineas.length * interlinea;
}

function tablaDatos(doc, filas, y) {
  const x = 22, ancho = 166, colEtiqueta = 52, altoBase = 9;
  filas.forEach(([etiqueta, valor]) => {
    doc.setFontSize(9);
    const lineas = doc.splitTextToSize(String(valor), ancho - colEtiqueta - 8);
    const alto = Math.max(altoBase, lineas.length * 4.2 + 4.5);
    doc.setFillColor(...COLORES.celdaGris);
    doc.setDrawColor(...COLORES.borde);
    doc.setLineWidth(0.25);
    doc.rect(x, y, colEtiqueta, alto, 'FD');
    doc.rect(x + colEtiqueta, y, ancho - colEtiqueta, alto, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORES.cafe);
    doc.text(etiqueta, x + 3, y + 5.8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORES.tinta);
    doc.text(lineas, x + colEtiqueta + 4, y + 5.8);
    y += alto;
  });
  return y;
}

const nombreLote = (d) =>
  `${d.unidad || 'Lote'} - Desarrollo Amarah, Dzilám González, Yucatán`;

// ---------- CARTA 1: Pre-cancelación (Último aviso) ----------
export function generarPreCarta(d) {
  // d: { folio, cliente, unidad, parcialidadesVencidas, montoVencido, ultimoPago, fechaHoy }
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  membrete(doc);
  let y = 56;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...COLORES.cafe);
  doc.text(`Mérida, Yucatán, a ${fechaLarga(d.fechaHoy)}`, 22, y); y += 8;

  doc.setFontSize(12.5); doc.setTextColor(...COLORES.rojo);
  doc.text('NOTIFICACIÓN URGENTE DE RESCISIÓN INMINENTE', 22, y); y += 9;

  doc.setFontSize(10); doc.setTextColor(...COLORES.tinta);
  doc.setFont('helvetica', 'normal');
  doc.text('Estimado/a:', 22, y);
  doc.setFont('helvetica', 'bold');
  doc.text(`${d.cliente}`, 45, y);
  const wNombre = doc.getTextWidth(d.cliente);
  doc.setFont('helvetica', 'normal');
  doc.text(`-  Lote(s): ${d.unidad || ''}`, 45 + wNombre + 2, y);
  y += 9;

  y = parrafo(doc,
    'Su contrato se encuentra en estado crítico de mora y está a punto de cancelarse de forma definitiva.',
    22, y, 166, { tam: 10.5, estilo: 'bold', color: COLORES.rojo, interlinea: 5 }) + 4;

  y = parrafo(doc,
    'Hemos intentado contactarle en múltiples ocasiones por teléfono y WhatsApp sin éxito. Esta notificación es el último paso antes de proceder con la rescisión definitiva e irrevocable de su contrato.',
    22, y, 166) + 6;

  y = tablaDatos(doc, [
    ['Cliente', d.cliente],
    ['Lote(s)', nombreLote(d)],
    ['Parcialidades vencidas', `${d.parcialidadesVencidas} mensualidades consecutivas sin pago`],
    ['Saldo total vencido', dinero(d.montoVencido)],
    ['Última fecha de pago', ddmmyyyy(d.ultimoPago)],
  ], y) + 8;

  // Caja de alerta
  const fechaLimite = sumarDiasHabiles(d.fechaHoy, 5);
  const cajaY = y;
  doc.setFillColor(...COLORES.alertaFondo);
  doc.setDrawColor(...COLORES.rojo);
  doc.setLineWidth(0.5);
  doc.rect(22, cajaY, 166, 34, 'FD');
  let yy = cajaY + 8;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...COLORES.rojo);
  doc.text('PLAZO FINAL PARA REGULARIZACIÓN', 27, yy); yy += 5.5;
  yy = parrafo(doc,
    'Cuenta usted con un plazo máximo de 5 (cinco) días hábiles a partir de la recepción de esta notificación para regularizar su situación. Vencido este plazo sin respuesta, procederemos de inmediato con la cancelación definitiva de su contrato.',
    27, yy, 156, { tam: 8.8, interlinea: 4 }) + 4;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...COLORES.tinta);
  doc.text(`Fecha límite improrrogable:  ${fechaLarga(fechaLimite)}`, 27, yy);
  y = cajaY + 34 + 9;

  y = parrafo(doc,
    'Su contrato de compraventa establece expresamente que el incumplimiento en el pago de dos o más parcialidades consecutivas faculta a Grupo Ureca de México S.A. de C.V. para rescindir el instrumento de forma unilateral e inmediata, sin necesidad de declaración judicial previa, y con la pérdida de los pagos realizados en los términos previstos en el propio contrato.',
    22, y, 166) + 5;

  y = parrafo(doc,
    `Con ${d.parcialidadesVencidas} parcialidades consecutivas sin pago y un saldo vencido de ${dinero(d.montoVencido).replace('$ ', '$')}, la causal de rescisión ya se encuentra plenamente configurada. Esta notificación refleja nuestra última gestión para evitar la cancelación: el incumplimiento es imputable exclusivamente a su persona.`,
    22, y, 166) + 9;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  doc.text('Atentamente,', 22, y); y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('Grupo Ureca de México S.A. de C.V.', 22, y); y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text('Departamento de Gestión de Cartera', 22, y);

  pie(doc);
  return { doc, fechaLimite };
}

// ---------- CARTA 2: Rescisión definitiva ----------
export function generarRescision(d) {
  // d: { folio, cliente, unidad, mt2, parcialidadesVencidas, montoVencido, ultimoPago,
  //      fechaHoy, fechaContrato, fechaPreCarta }
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  // ----- Página 1 -----
  membrete(doc);
  let y = 56;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...COLORES.cafe);
  doc.text(`Mérida, Yucatán, a ${fechaLarga(d.fechaHoy)}`, 22, y); y += 8;

  doc.setFontSize(12.5); doc.setTextColor(...COLORES.rojo);
  doc.text('CANCELACIÓN DEFINITIVA DE CONTRATO DE COMPRAVENTA', 22, y); y += 9;

  doc.setFontSize(10); doc.setTextColor(...COLORES.tinta);
  doc.setFont('helvetica', 'normal');
  doc.text('Estimado/a:', 22, y);
  doc.setFont('helvetica', 'bold');
  doc.text(d.cliente, 45, y);
  y += 10;

  y = tablaDatos(doc, [
    ['Folio / Expediente', d.folio],
    ['Lote(s)', nombreLote(d)],
    ['Superficie', d.mt2 ? `${d.mt2} m2` : '—'],
    ['Fecha del contrato', ddmmyyyy(d.fechaContrato)],
  ], y) + 8;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...COLORES.cafe);
  doc.text('I.  Cancelación Definitiva', 22, y); y += 6;
  y = parrafo(doc,
    'Por medio de la presente, Grupo Ureca de México S.A. de C.V. notifica a usted, de manera formal, fehaciente e irrevocable, la cancelación definitiva del Contrato de Promesa de Compraventa señalado en los datos anteriores, correspondiente al Desarrollo Inmobiliario Amarah.',
    22, y, 166) + 7;

  // Caja causal
  const cajaY = y;
  doc.setFillColor(...COLORES.alertaFondo);
  doc.setDrawColor(...COLORES.rojo);
  doc.setLineWidth(0.5);
  doc.rect(22, cajaY, 166, 26, 'FD');
  let yy = cajaY + 7;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...COLORES.rojo);
  doc.text('Causal de cancelación: incumplimiento imputable exclusivamente al comprador', 27, yy); yy += 5.5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...COLORES.tinta);
  doc.text(`Parcialidades vencidas consecutivas:  ${d.parcialidadesVencidas} mensualidades`, 27, yy); yy += 4.6;
  doc.text(`Saldo total vencido:  ${dinero(d.montoVencido)}`, 27, yy); yy += 4.6;
  doc.text(`Última fecha de pago registrada:  ${ddmmyyyy(d.ultimoPago)}`, 27, yy);
  y = cajaY + 26 + 9;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...COLORES.cafe);
  doc.text('II.  Gestiones Realizadas por Grupo Ureca', 22, y); y += 6;
  y = parrafo(doc,
    'Previo a la presente cancelación, esta empresa realizó todas las gestiones a su alcance para facilitar su regularización, sin obtener respuesta ni pago de su parte:',
    22, y, 166) + 3;

  const vinetas = [
    'Múltiples intentos de contacto telefónico y por WhatsApp al número registrado en su expediente.',
    `Envío de notificación previa de mora y requerimiento urgente de regularización, remitida en fecha ${ddmmyyyy(d.fechaPreCarta)} por correo electrónico y WhatsApp, otorgándole un plazo de 5 días hábiles para subsanar el adeudo.`,
    'Vencimiento del plazo otorgado sin respuesta, comprobante de pago ni propuesta de regularización de su parte.',
  ];
  vinetas.forEach((v) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...COLORES.tinta);
    doc.text('•', 26, y);
    const lineas = doc.splitTextToSize(v, 156);
    doc.text(lineas, 31, y);
    y += lineas.length * 4.4 + 2;
  });
  y += 3;

  y = parrafo(doc,
    'Habiendo agotado todos los canales de comunicación y los plazos otorgados, la cancelación de su contrato es consecuencia directa e inevitable de su propio incumplimiento.',
    22, y, 166) + 8;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...COLORES.cafe);
  doc.text('III.  Fundamento Contractual y Efectos de la Cancelación', 22, y); y += 6;
  y = parrafo(doc,
    'Su contrato de compraventa establece de manera expresa que el incumplimiento en el pago de dos o más parcialidades consecutivas faculta a esta empresa para rescindir el instrumento de forma unilateral, inmediata y sin necesidad de declaración judicial previa. Dicha causal se encuentra plenamente configurada en su expediente.',
    22, y, 166);
  pie(doc);

  // ----- Página 2 -----
  doc.addPage();
  membrete(doc);
  y = 58;
  y = parrafo(doc,
    'En consecuencia, y de conformidad con los términos y condiciones pactados en el instrumento contractual suscrito entre las partes, a partir de la recepción de la presente notificación surten los siguientes efectos:',
    22, y, 166) + 7;

  const caja2Y = y;
  doc.setFillColor(...COLORES.alertaFondo);
  doc.setDrawColor(...COLORES.rojo);
  doc.setLineWidth(0.5);
  doc.rect(22, caja2Y, 166, 42, 'FD');
  yy = caja2Y + 7;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...COLORES.rojo);
  doc.text('Efectos inmediatos e irrevocables:', 27, yy); yy += 5.5;
  parrafo(doc,
    'Rescisión definitiva del contrato. El instrumento queda sin efectos jurídicos a partir de esta fecha. Pérdida de los derechos sobre el inmueble y de los pagos realizados. Ante el incumplimiento imputable al comprador, los términos de su contrato eximen a esta empresa de efectuar devolución alguna de las cantidades recibidas a la fecha de la rescisión. Liberación definitiva del lote: el inmueble queda liberado de forma inmediata e irrevocable, quedando Grupo Ureca de México S.A. de C.V. en plena libertad para disponer de él, incluyendo su oferta y venta a terceros.',
    27, yy, 156, { tam: 8.8, interlinea: 4 });
  y = caja2Y + 42 + 10;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...COLORES.cafe);
  doc.text('IV.  Constancia de Notificación', 22, y); y += 6;
  y = parrafo(doc,
    'La presente comunicación se remite simultáneamente por correo electrónico y WhatsApp a los datos de contacto registrados en su expediente, medios reconocidos contractualmente como canales oficiales de notificación. Produce plenos efectos legales desde la fecha de su envío, sin que sea necesaria confirmación adicional por parte del destinatario.',
    22, y, 166) + 10;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...COLORES.tinta);
  doc.text('Atentamente,', 22, y); y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('Grupo Ureca de México S.A. de C.V.', 22, y); y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text('Departamento de Gestión de Cartera', 22, y); y += 8;

  // Firma sobre la línea
  const anchoFirma = 34;
  doc.addImage(FIRMA, 'PNG', 24, y, anchoFirma, anchoFirma * PROP.firma);
  y += anchoFirma * PROP.firma + 2;
  doc.setDrawColor(...COLORES.tinta);
  doc.setLineWidth(0.4);
  doc.line(22, y, 82, y); y += 5;
  doc.setFont('helvetica', 'bold');
  doc.text('Francisco Usabiaga Flores', 22, y); y += 4.6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8); doc.setTextColor(...COLORES.gris);
  doc.text('Representante Legal - Grupo Ureca de México S.A. de C.V.', 22, y);

  pie(doc);
  return { doc };
}
