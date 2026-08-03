export interface Tarea {
  id?: string;
  userId: string;
  titulo: string;
  tiempo_estimado: string;
  completada: boolean;
  fecha_asignada: number | null;
  prioridad: number;
}
