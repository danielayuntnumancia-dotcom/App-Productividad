export interface ConcejaliaStyle {
  bg: string;
  text: string;
  border: string;
  borderL: string;
  dot: string;
  badgeClass: string;
}

const PREDEFINED_COLORS: Record<string, ConcejaliaStyle> = {
  'Economía y Hacienda': {
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-800',
    borderL: 'border-l-blue-500',
    dot: 'bg-blue-500',
    badgeClass: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
  },
  'Medio Ambiente': {
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-800',
    borderL: 'border-l-emerald-500',
    dot: 'bg-emerald-500',
    badgeClass: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
  },
  'Policía Local y Movilidad': {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-800',
    borderL: 'border-l-amber-500',
    dot: 'bg-amber-500',
    badgeClass: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
  },
  'Transporte': {
    bg: 'bg-cyan-50 dark:bg-cyan-950/40',
    text: 'text-cyan-700 dark:text-cyan-300',
    border: 'border-cyan-200 dark:border-cyan-800',
    borderL: 'border-l-cyan-500',
    dot: 'bg-cyan-500',
    badgeClass: 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800'
  },
  'Entidades Urbanísticas de Conservación': {
    bg: 'bg-purple-50 dark:bg-purple-950/40',
    text: 'text-purple-700 dark:text-purple-300',
    border: 'border-purple-200 dark:border-purple-800',
    borderL: 'border-l-purple-500',
    dot: 'bg-purple-500',
    badgeClass: 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
  }
};

const DYNAMIC_PALETTE: ConcejaliaStyle[] = [
  {
    bg: 'bg-indigo-50 dark:bg-indigo-950/40',
    text: 'text-indigo-700 dark:text-indigo-300',
    border: 'border-indigo-200 dark:border-indigo-800',
    borderL: 'border-l-indigo-500',
    dot: 'bg-indigo-500',
    badgeClass: 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
  },
  {
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    text: 'text-rose-700 dark:text-rose-300',
    border: 'border-rose-200 dark:border-rose-800',
    borderL: 'border-l-rose-500',
    dot: 'bg-rose-500',
    badgeClass: 'bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
  },
  {
    bg: 'bg-teal-50 dark:bg-teal-950/40',
    text: 'text-teal-700 dark:text-teal-300',
    border: 'border-teal-200 dark:border-teal-800',
    borderL: 'border-l-teal-500',
    dot: 'bg-teal-500',
    badgeClass: 'bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800'
  },
  {
    bg: 'bg-cyan-50 dark:bg-cyan-950/40',
    text: 'text-cyan-700 dark:text-cyan-300',
    border: 'border-cyan-200 dark:border-cyan-800',
    borderL: 'border-l-cyan-500',
    dot: 'bg-cyan-500',
    badgeClass: 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800'
  },
  {
    bg: 'bg-fuchsia-50 dark:bg-fuchsia-950/40',
    text: 'text-fuchsia-700 dark:text-fuchsia-300',
    border: 'border-fuchsia-200 dark:border-fuchsia-800',
    borderL: 'border-l-fuchsia-500',
    dot: 'bg-fuchsia-500',
    badgeClass: 'bg-fuchsia-100 dark:bg-fuchsia-900/50 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-200 dark:border-fuchsia-800'
  }
];

export const getConcejaliaStyle = (name?: string): ConcejaliaStyle => {
  if (!name) return DYNAMIC_PALETTE[0];
  if (PREDEFINED_COLORS[name]) return PREDEFINED_COLORS[name];

  // Hash determinista para nuevas concejalías personalizadas
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % DYNAMIC_PALETTE.length;
  return DYNAMIC_PALETTE[index];
};

export const getConcejaliaBg = (name?: string): string => {
  if (!name) return 'bg-slate-100 dark:bg-slate-800/60 text-slate-400 border-r border-slate-200 dark:border-slate-700/60';
  const style = getConcejaliaStyle(name);
  return `${style.dot} text-white`;
};

export const getPriorityStyle = (prioridad?: string, priority?: string): string => {
  const val = (prioridad || priority || '').toLowerCase();
  if (val === 'alta' || val === 'high' || val === 'urgente' || val === 'urgent') {
    return 'bg-red-50/90 dark:bg-red-950/30 border-red-300 dark:border-red-800/60 shadow-sm shadow-red-100/50 dark:shadow-none';
  }
  if (val === 'media' || val === 'medium') {
    return 'bg-amber-50/90 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800/60 shadow-sm shadow-amber-100/50 dark:shadow-none';
  }
  if (val === 'baja' || val === 'low') {
    return 'bg-emerald-50/90 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800/60 shadow-sm shadow-emerald-100/50 dark:shadow-none';
  }
  return 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80';
};

export const getPriorityBadgeClass = (prioridad?: string, priority?: string): string => {
  const val = (prioridad || priority || '').toLowerCase();
  if (val === 'alta' || val === 'high' || val === 'urgente' || val === 'urgent') {
    return 'bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-300 border-red-300 dark:border-red-800';
  }
  if (val === 'baja' || val === 'low') {
    return 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';
  }
  return 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800';
};
