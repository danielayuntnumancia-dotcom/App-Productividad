import { Tarea, Project, DeadlineSeverity, ChecklistDocItem } from '../types';

/**
 * Festivos nacionales y comunes (mes-día)
 */
const NATIONAL_HOLIDAYS = [
  '01-01', // Año Nuevo
  '01-06', // Reyes
  '05-01', // Fiesta del Trabajo
  '08-15', // Asunción
  '10-12', // Fiesta Nacional
  '11-01', // Todos los Santos
  '12-06', // Constitución
  '12-08', // Inmaculada
  '12-25', // Navidad
];

/**
 * Calcula si una fecha determinada es fin de semana o festivo nacional
 */
export function isWeekendOrHoliday(date: Date): boolean {
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return true; // Domingo (0) o Sábado (6)

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const monthDay = `${month}-${day}`;

  return NATIONAL_HOLIDAYS.includes(monthDay);
}

/**
 * Calcula la diferencia en días hábiles (laborables) entre dos fechas
 */
export function calculateBusinessDays(startDate: Date, endDate: Date): number {
  let count = 0;
  const cur = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const target = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

  if (cur.getTime() === target.getTime()) return 0;

  const isFuture = target.getTime() > cur.getTime();
  const step = isFuture ? 1 : -1;

  while (cur.getTime() !== target.getTime()) {
    cur.setDate(cur.getDate() + step);
    if (!isWeekendOrHoliday(cur)) {
      count += step;
    }
  }

  return count;
}

/**
 * Calcula la diferencia en días naturales
 */
export function calculateCalendarDays(startDate: Date, endDate: Date): number {
  const cur = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).getTime();
  const target = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()).getTime();
  const diffMs = target - cur;
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export interface DeadlineInfo {
  severity: DeadlineSeverity;
  daysRemaining: number;
  isBusiness: boolean;
  formattedText: string;
  badgeClass: string;
  dotClass: string;
  isExpired: boolean;
  isUrgent: boolean;
}

/**
 * Evalúa el vencimiento y estado de semáforo de una tarea
 */
export function getTaskDeadlineInfo(tarea: Tarea): DeadlineInfo {
  const isCompleted = tarea.status === 'completed' || !!tarea.completada;
  const rawDate = tarea.dueDate || tarea.fecha_vencimiento;

  if (isCompleted || !rawDate) {
    return {
      severity: 'none',
      daysRemaining: 0,
      isBusiness: false,
      formattedText: isCompleted ? 'Completada' : 'Sin fecha límite',
      badgeClass: 'bg-slate-100 dark:bg-slate-700/60 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600',
      dotClass: 'bg-slate-400',
      isExpired: false,
      isUrgent: false
    };
  }

  const now = new Date();
  const targetDate = new Date(rawDate);
  const isBusiness = tarea.isBusinessDays ?? true;
  
  const days = isBusiness 
    ? calculateBusinessDays(now, targetDate) 
    : calculateCalendarDays(now, targetDate);

  if (days < 0) {
    const absDays = Math.abs(days);
    return {
      severity: 'expired',
      daysRemaining: days,
      isBusiness,
      formattedText: `🔴 Vencida hace ${absDays}d`,
      badgeClass: 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800 animate-pulse font-extrabold',
      dotClass: 'bg-red-600',
      isExpired: true,
      isUrgent: true
    };
  }

  if (days === 0) {
    return {
      severity: 'critical',
      daysRemaining: 0,
      isBusiness,
      formattedText: '🟠 ¡Vence Hoy!',
      badgeClass: 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800 font-extrabold animate-pulse',
      dotClass: 'bg-amber-500',
      isExpired: false,
      isUrgent: true
    };
  }

  if (days <= 2) {
    return {
      severity: 'critical',
      daysRemaining: days,
      isBusiness,
      formattedText: `🟠 Vence en ${days}d ${isBusiness ? 'hábiles' : ''}`,
      badgeClass: 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700 font-bold',
      dotClass: 'bg-amber-500',
      isExpired: false,
      isUrgent: true
    };
  }

  if (days <= 10) {
    return {
      severity: 'warning',
      daysRemaining: days,
      isBusiness,
      formattedText: `🟡 ${days}d ${isBusiness ? 'hábiles' : 'días'}`,
      badgeClass: 'bg-yellow-50 dark:bg-yellow-950/40 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800 font-semibold',
      dotClass: 'bg-yellow-500',
      isExpired: false,
      isUrgent: false
    };
  }

  return {
    severity: 'safe',
    daysRemaining: days,
    isBusiness,
    formattedText: `🟢 ${days}d restantes`,
    badgeClass: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60 font-medium',
    dotClass: 'bg-emerald-500',
    isExpired: false,
    isUrgent: false
  };
}

/**
 * Evalúa el estado de retención prolongada (si lleva más de X días esperando a terceros)
 */
export function getRetentionWarning(tarea: Tarea, daysThreshold: number = 5): { isProlonged: boolean; daysRetained: number; warningText: string | null } {
  if (tarea.status !== 'waiting_on_third_party') {
    return { isProlonged: false, daysRetained: 0, warningText: null };
  }

  const now = Date.now();
  const sinceMs = tarea.blockedSince || tarea.fecha_asignada || (typeof tarea.createdAt === 'number' ? tarea.createdAt : now);
  const diffDays = Math.floor((now - sinceMs) / (1000 * 60 * 60 * 24));

  if (diffDays >= daysThreshold) {
    return {
      isProlonged: true,
      daysRetained: diffDays,
      warningText: `⚠️ Retenido hace ${diffDays} días (${tarea.blockedBy || 'Tercero'})`
    };
  }

  return { isProlonged: false, daysRetained: diffDays, warningText: null };
}

/**
 * Plantillas predeterminadas de check-list de documentación obligatoria según la Ley de Contratos del Sector Público (LCSP) y Procedimiento Administrativo
 */
export function getDefaultChecklistForType(type: string): ChecklistDocItem[] {
  if (type === 'contrato_menor') {
    return [
      { id: 'cm_1', name: '1. Memoria Justificativa de Necesidad del Gasto (Art. 118 LCSP)', completed: false, required: true },
      { id: 'cm_2', name: '2. Retención de Crédito / Documento RC (Intervención)', completed: false, required: true },
      { id: 'cm_3', name: '3. Solicitud y Recepción de 3 Presupuestos de Empresas', completed: false, required: true },
      { id: 'cm_4', name: '4. Informe Técnico de no fraccionamiento del contrato', completed: false, required: true },
      { id: 'cm_5', name: '5. Decreto / Resolución de Alcaldía de Adjudicación', completed: false, required: true },
      { id: 'cm_6', name: '6. Factura Electrónica Conformada (FACe / FACeB2B)', completed: false, required: true },
      { id: 'cm_7', name: '7. Documento Contable ADO (Reconocimiento y Pago)', completed: false, required: true },
    ];
  }

  if (type === 'urbanismo' || type === 'obras') {
    return [
      { id: 'urb_1', name: '1. Solicitud de Registro de Entrada (ORVE / GEISER)', completed: false, required: true },
      { id: 'urb_2', name: '2. Justificante de Pago de Tasas e ICIO', completed: false, required: true },
      { id: 'urb_3', name: '3. Proyecto Técnico Visado / Memoria Valorada', completed: false, required: true },
      { id: 'urb_4', name: '4. Informe Técnico Municipal (Arquitecto/Aparejador)', completed: false, required: true },
      { id: 'urb_5', name: '5. Informe Jurídico de Secretaría', completed: false, required: true },
      { id: 'urb_6', name: '6. Decreto de Concesión de Licencia / Notificación', completed: false, required: true },
    ];
  }

  // Plantilla general para cualquier expediente administrativo
  return [
    { id: 'gen_1', name: '1. Instancia General / Solicitud de Inicio', completed: false, required: true },
    { id: 'gen_2', name: '2. Documentación Justificativa del Solicitante', completed: false, required: false },
    { id: 'gen_3', name: '3. Informe Técnico / Departamental Preceptivo', completed: false, required: true },
    { id: 'gen_4', name: '4. Informe de Intervención / Secretaría (si procede)', completed: false, required: false },
    { id: 'gen_5', name: '5. Resolución de Alcaldía / Acuerdo de Junta de Gobierno', completed: false, required: true },
    { id: 'gen_6', name: '6. Notificación al Interesado y Archivo', completed: false, required: true },
  ];
}
