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

  // Referencia documental externa
  externalReference?: string; // Nº Expediente Gestiona o Ruta Local

  // Vinculación a Proyecto / Expediente
  projectId?: string;
  projectName?: string;
  projectMasterCategory?: string;
  projectConcejalia?: string;
  expedientCode?: string;
  linkedExpedientId?: string;
}

export interface Project {
  id?: string;
  name: string;
  type: string;
  concejalia: string;
  status: 'active' | 'completed' | 'archived';
  expedientCode?: string;
  linkedExpedientId?: string;
  createdAt?: any;
  userId: string;
}

export const generateExpedientCode = (): string => {
  const year = new Date().getFullYear();
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let randomStr = '';
  for (let i = 0; i < 4; i++) {
    randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `EXP-${year}-${randomStr}`;
};

export interface TemplateTask {
  title: string;
  notes?: string;
  estimatedTimeMin: number;
  status: TaskStatus;
  blockedBy?: string;
  blockingReason?: string;
}

export interface ExpedienteTemplate {
  id: string;
  name: string;
  nombre?: string;
  concejalia: string;
  concejaliaId?: string;
  masterCategory?: string;
  descripcion?: string;
  tasks: TemplateTask[];
}

export interface ConcejaliaItem {
  id?: string;
  name: string;
  userId: string;
  createdAt?: any;
}

export interface TemplateItem {
  id?: string;
  name: string;
  concejaliaId?: string;
  concejalia: string;
  tasks: TemplateTask[];
  userId: string;
  createdAt?: any;
}
