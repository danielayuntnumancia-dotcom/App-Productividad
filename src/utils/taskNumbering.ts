/**
 * Limpia cualquier prefijo numérico previo (ej. "1. - ", "2. ", "4. ", "(1) ", "3- ")
 * dejando el título del trámite en limpio.
 */
export const cleanTaskTitle = (rawTitle: string): string => {
  if (!rawTitle) return '';
  return rawTitle
    .replace(/^\s*(\(?\d+\)?[\.\s\-\)]+)+/g, '')
    .replace(/^\s*[\-\–\—\•\*]\s*/, '')
    .trim();
};

/**
 * Formatea el título con su número secuencial correspondiente (1. Trámite)
 */
export const formatIndexedTaskTitle = (index: number, rawTitle: string): string => {
  const clean = cleanTaskTitle(rawTitle);
  return `${index + 1}. ${clean || 'Tarea'}`;
};

/**
 * Formatea el título completo con número secuencial y sufijo de proyecto opcional
 */
export const formatExpedientTaskTitle = (
  index: number,
  rawTitle: string,
  projectName?: string
): string => {
  const numbered = formatIndexedTaskTitle(index, rawTitle);
  if (projectName && projectName.trim()) {
    return `${numbered} - ${projectName.trim()}`;
  }
  return numbered;
};
