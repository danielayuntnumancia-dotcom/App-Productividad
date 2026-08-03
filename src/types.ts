export interface Tarea {
  id?: string;
  userId: string;
  titulo: string;
  notas?: string;
  tiempo_estimado: string;
  completada: boolean;
  fecha_asignada: number | null; // For scheduling on a specific day
  fecha_vencimiento?: number | null; // Deadline
  prioridad: 'baja' | 'media' | 'alta';
  concejalia?: 'Medioambiente' | 'Seguridad' | 'Transporte' | 'Hacienda' | 'Entidades privadas';
}
