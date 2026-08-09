export type TaskStatus = 'todo' | 'in_progress' | 'waiting_on_third_party' | 'completed';

export interface Tarea {
  id?: string;
  userId: string;
  titulo: string;
  notas?: string;
  status: TaskStatus;
  dueDate: number; // Timestamp en ms
  estimatedTimeMin: number; // Minutos estimados
  isInMyDay: boolean; // Booleano, por defecto true
  
  // Campos heredados / retrocompatibilidad
  tiempo_estimado?: string;
  completada?: boolean;
  fecha_asignada?: number | null;
  fecha_vencimiento?: number | null;
  prioridad: 'baja' | 'media' | 'alta';
  concejalia?: 'Medioambiente' | 'Seguridad' | 'Transporte' | 'Hacienda' | 'Entidades privadas';
  
  // Trazabilidad de bloqueos
  blockedBy?: string; // Departamento / Entidad retenedora
  blockingReason?: string; // Motivo / Trámite esperado
}
