export type TaskStatus = 'todo' | 'in_progress' | 'waiting_on_third_party' | 'completed';

export interface ChecklistDocItem {
  id: string;
  name: string;
  completed: boolean;
  required?: boolean;
  driveUrl?: string;
  uploadedAt?: number;
}

export type DeadlineSeverity = 'safe' | 'warning' | 'critical' | 'expired' | 'none';

export interface Tarea {
  id?: string;
  userId: string;
  titulo: string;
  title?: string;
  notas?: string;
  notes?: string;
  status: TaskStatus;
  dueDate: number; // Timestamp en ms
  estimatedTimeMin: number; // Minutos estimados
  isInMyDay: boolean; // Booleano, por defecto true
  
  // Campos heredados / retrocompatibilidad
  tiempo_estimado?: string;
  completada?: boolean;
  fecha_asignada?: number | null;
  fecha_vencimiento?: number | null;
  createdAt?: any;
  fecha_creacion?: number | null;
  prioridad: 'baja' | 'media' | 'alta';
  concejalia?: string;
  
  // Trazabilidad de bloqueos y retenciones
  blockedBy?: string; // Departamento / Entidad retenedora
  blockingReason?: string; // Motivo / Trámite esperado
  blockedSince?: number; // Timestamp cuando se retuvo

  // Integración con Google Drive y Referencias
  driveFolderUrl?: string; // Enlace directo a carpeta de Google Drive
  driveDocUrl?: string; // Enlace directo a documento de Google Drive
  externalReference?: string; // Nº Expediente Sede / Gestiona o Ruta Local

  // Vinculación a Proyecto / Expediente
  projectId?: string;
  projectName?: string;
  projectMasterCategory?: string;
  projectConcejalia?: string;
  expedientCode?: string;
  linkedExpedientId?: string;
  parentProjectId?: string;
  parentProjectName?: string;
  isContratoMenor?: boolean;
  orderIndex?: number;
  
  // Control de Plazos Específicos
  isBusinessDays?: boolean; // Cómputo en días hábiles

  // Papelera y borrado suave
  isDeleted?: boolean;
  deletedAt?: number | null;
  deletedType?: 'tarea' | 'expediente';
  deletedProjectName?: string;
}

export interface Project {
  id?: string;
  /** ID físico real del documento en Firestore (d.id del snapshot). Puede diferir de `id`/`projectId` en documentos antiguos. */
  firestoreDocId?: string;
  name: string;
  type: string;
  concejalia: string;
  status: 'active' | 'completed' | 'archived';
  expedientCode?: string;
  linkedExpedientId?: string;
  isContratoMenor?: boolean;
  isMacroProject?: boolean;
  parentProjectId?: string;
  parentProjectName?: string;
  notes?: string;
  notas?: string;
  createdAt?: any;
  fecha_creacion?: number | null;
  userId?: string;

  // Integración con Google Drive
  driveFolderUrl?: string; // Carpeta raíz del expediente en Google Drive
  sedeUrl?: string; // Enlace directo a la Sede Electrónica

  // Check-list de Documentos Preceptivos
  checklistDocs?: ChecklistDocItem[];

  // Silencio Administrativo y Plazos Legales
  silencioTipo?: 'positivo' | 'negativo';
  silencioPlazoMeses?: number;
  plazoDiasHabiles?: number;

  // Papelera y borrado suave
  isDeleted?: boolean;
  deletedAt?: number | null;
  deletedType?: 'expediente';
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
  notas?: string;
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
  description?: string;
  tasks: TemplateTask[];
  isCustom?: boolean;
  isDefault?: boolean;
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
