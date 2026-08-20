import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, writeBatch, updateDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { Project, Tarea, TaskStatus } from '../types';
import CustomDatePicker from './CustomDatePicker';
import MacroExpedienteModal from './MacroExpedienteModal';
import BulkTaskActionBar from './BulkTaskActionBar';
import { useConcejalias } from '../hooks/useConcejalias';
import { getConcejaliaStyle } from '../utils/concejaliaColors';
import { exportExpedientToPDF, exportExpedientToCSV, sortExpedientTasksNaturally, copyExpedientTasksToClipboard } from '../utils/exportUtils';
import { getDefaultChecklistForType, getTaskDeadlineInfo } from '../utils/deadlines';
import { ChecklistDocItem, generateExpedientCode } from '../types';
import { moveToTrashTask, moveToTrashExpediente } from '../utils/trashUtils';

interface Props {
  project: Project;
  onClose: () => void;
}

export default function ExpedienteDetailPanel({ project, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const effectiveUserId = project.userId || auth.currentUser?.uid || '';
  const concejaliasList = useConcejalias(effectiveUserId);

  const [projectName, setProjectName] = useState(project.name);
  const [concejalia, setConcejalia] = useState(project.concejalia || '');
  const [linkedExpedientId, setLinkedExpedientId] = useState(project.linkedExpedientId || '');
  const [notas, setNotas] = useState(project.notas || project.notes || '');
  const [projectStatus, setProjectStatus] = useState<'active' | 'completed' | 'archived'>(project.status || 'active');
  const [driveFolderUrl, setDriveFolderUrl] = useState(project.driveFolderUrl || '');
  const [sedeUrl, setSedeUrl] = useState(project.sedeUrl || '');
  const [checklistDocs, setChecklistDocs] = useState<ChecklistDocItem[]>(() => {
    if (project.checklistDocs && project.checklistDocs.length > 0) return project.checklistDocs;
    return getDefaultChecklistForType(project.isContratoMenor ? 'contrato_menor' : 'general');
  });

  const [existingProjects, setExistingProjects] = useState<{ id: string; name: string; code: string }[]>([]);
  const [childProjects, setChildProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Tarea[]>([]);
  const [isAddingCMModalOpen, setIsAddingCMModalOpen] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [isCloning, setIsCloning] = useState(false);

  // Estados para modificar títulos, minutos y estados de las tareas pendientes existentes
  const [editedTitles, setEditedTitles] = useState<Record<string, string>>({});
  const [editedMinutes, setEditedMinutes] = useState<Record<string, number>>({});
  const [editedStatuses, setEditedStatuses] = useState<Record<string, TaskStatus>>({});

  // Estados para añadir nueva tarea al expediente
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskMinutes, setNewTaskMinutes] = useState('15');

  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Escuchar la fecha de vencimiento más temprana o común de las tareas del expediente como la fecha del expediente
  const getInitialProjectDueDateStr = (tList: Tarea[]): string => {
    if (tList.length === 0) return '';
    const dates = tList.map(t => t.dueDate || t.fecha_vencimiento).filter(Boolean) as number[];
    if (dates.length === 0) return '';
    const minDate = Math.min(...dates);
    return new Date(minDate).toISOString().split('T')[0];
  };

  const [fechaVencimiento, setFechaVencimiento] = useState<string>('');

  // Sincronizar todos los estados cuando cambie el proyecto recibido
  useEffect(() => {
    setProjectName(project.name);
    setConcejalia(project.concejalia || '');
    setLinkedExpedientId(project.linkedExpedientId || '');
    setNotas(project.notas || project.notes || '');
    setProjectStatus(project.status || 'active');
    setDriveFolderUrl(project.driveFolderUrl || '');
    setSedeUrl(project.sedeUrl || '');
    setChecklistDocs(
      project.checklistDocs && project.checklistDocs.length > 0
        ? project.checklistDocs
        : getDefaultChecklistForType(project.isContratoMenor ? 'contrato_menor' : 'general')
    );
    setEditedTitles({});
    setEditedMinutes({});
    setEditedStatuses({});
    setFechaVencimiento('');
  }, [project.id, project.name]);

  // Escuchar otros proyectos existentes para el selector de vinculación
  useEffect(() => {
    if (!effectiveUserId) return;

    const q = query(
      collection(db, 'tareas'),
      where('userId', '==', effectiveUserId)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const projMap: Record<string, { id: string; name: string; code: string }> = {};
      snapshot.forEach((d) => {
        const data = d.data();
        if (data.isDeleted) return;
        if (data.isProject && (data.id !== project.id && data.projectId !== project.id)) {
          projMap[data.id || d.id] = {
            id: data.id || d.id,
            name: data.name || data.projectName,
            code: data.expedientCode || 'EXP-2026-N/A'
          };
        } else if (data.projectId && data.projectName && !data.isTemplate && !data.isConcejalia && data.projectId !== project.id) {
          if (!projMap[data.projectId]) {
            projMap[data.projectId] = {
              id: data.projectId,
              name: data.projectName,
              code: data.expedientCode || 'EXP-2026-N/A'
            };
          }
        }
      });
      setExistingProjects(Object.values(projMap));
    });

    return () => unsub();
  }, [effectiveUserId, project?.id]);

  // Escuchar sub-contratos menores si este proyecto es un Macro-Expediente
  useEffect(() => {
    if (!project?.id || !effectiveUserId) return;

    const q = query(
      collection(db, 'tareas'),
      where('userId', '==', effectiveUserId),
      where('isProject', '==', true),
      where('parentProjectId', '==', project.id)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const list: Project[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        if (data.isDeleted) return;
        list.push({ id: data.projectId || data.id || d.id, ...data } as Project);
      });
      list.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }));
      setChildProjects(list);
    });

    return () => unsub();
  }, [project?.id, effectiveUserId]);

  // Escuchar en tiempo real las tareas del expediente
  useEffect(() => {
    if (!project?.id) return;

    const q = effectiveUserId
      ? query(collection(db, 'tareas'), where('userId', '==', effectiveUserId), where('projectId', '==', project.id))
      : query(collection(db, 'tareas'), where('projectId', '==', project.id));

    const unsub = onSnapshot(q, (snapshot) => {
      const taskList: Tarea[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        if (!data.isTemplate && !data.isConcejalia && !data.isProject && !data.isDeleted) {
          taskList.push({ id: d.id, ...data } as Tarea);
        }
      });
      setTasks(taskList);

      setFechaVencimiento((prev) => {
        if (!prev && taskList.length > 0) {
          return getInitialProjectDueDateStr(taskList);
        }
        return prev;
      });
    });

    return () => unsub();
  }, [project?.id, project?.userId]);

  // Escuchar la tecla Escape para cerrar
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  // Eliminar una tarea individual del expediente (Mover a Papelera)
  const handleDeleteSingleTask = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("¿Mover esta tarea a la papelera? Podrás recuperarla desde la sección Papelera.")) return;
    try {
      await moveToTrashTask(taskId);
      setSuccessMsg("¡Tarea movida a la papelera!");
      setTimeout(() => setSuccessMsg(null), 2500);
    } catch (err: any) {
      console.error("Error deleting task from detail panel: ", err);
      setErrorMsg("Error al mover la tarea a la papelera.");
    }
  };

  // Añadir una nueva tarea al expediente
  const handleAddNewTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    try {
      const now = Date.now();
      const newDueDateMs = fechaVencimiento ? new Date(fechaVencimiento).getTime() : now;
      const parsedMin = parseInt(newTaskMinutes, 10);
      const minVal = !isNaN(parsedMin) && parsedMin > 0 ? parsedMin : 15;

      const rawTitle = newTaskTitle.trim();
      const hasNumberPrefix = /^\d+[\.\s]/.test(rawTitle);
      const nextSeqNumber = tasks.length + 1;
      const formattedTitle = hasNumberPrefix ? rawTitle : `${nextSeqNumber}. ${rawTitle}`;
      const resolvedUserId = effectiveUserId || auth.currentUser?.uid || (tasks.length > 0 ? tasks[0].userId : '');

      const newTaskData: any = {
        projectId: project.id,
        projectName: projectName.trim() || project.name,
        concejalia: concejalia || project.concejalia || 'General',
        projectConcejalia: concejalia || project.concejalia || 'General',
        linkedExpedientId: linkedExpedientId || project.linkedExpedientId || '',
        orderIndex: nextSeqNumber,
        title: formattedTitle,
        titulo: `${formattedTitle} - ${projectName.trim() || project.name}`,
        notes: '',
        notas: '',
        status: 'todo',
        completada: false,
        estimatedTimeMin: minVal,
        tiempo_estimado: `${minVal}m`,
        isInMyDay: true,
        dueDate: newDueDateMs,
        fecha_vencimiento: newDueDateMs,
        prioridad: 'media',
        fecha_creacion: now
      };

      if (project.parentProjectId) {
        newTaskData.parentProjectId = project.parentProjectId;
      }
      if (project.parentProjectName) {
        newTaskData.parentProjectName = project.parentProjectName;
      }
      if (project.isContratoMenor !== undefined) {
        newTaskData.isContratoMenor = project.isContratoMenor;
      }
      if (project.expedientCode) {
        newTaskData.expedientCode = project.expedientCode;
      }

      if (resolvedUserId) {
        newTaskData.userId = resolvedUserId;
      }

      await addDoc(collection(db, 'tareas'), newTaskData);

      setNewTaskTitle('');
      setNewTaskMinutes('15');
      setIsAddingTask(false);
      setSuccessMsg("¡Tarea añadida al expediente!");
      setTimeout(() => setSuccessMsg(null), 2500);
    } catch (err: any) {
      console.error("Error adding new task to project: ", err);
      setErrorMsg("Error al crear la tarea en Firestore.");
    }
  };

  const handleSaveAll = async () => {
    if (!projectName.trim() || isSaving) return;
    setIsSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const batch = writeBatch(db);
      const newName = projectName.trim();
      const newDueDateMs = fechaVencimiento ? new Date(fechaVencimiento).getTime() : null;
      const resolvedUserId = effectiveUserId || auth.currentUser?.uid || (tasks.length > 0 ? tasks[0].userId : '');

      // 1. Actualizar todas las tareas hijas del expediente (respetando sus anotaciones existentes)
      tasks.forEach((t) => {
        if (!t.id) return;
        const tRef = doc(db, 'tareas', t.id);

        const currentTitle = editedTitles[t.id] !== undefined ? editedTitles[t.id].trim() : (t.title || t.titulo || '');
        const currentMin = editedMinutes[t.id] !== undefined ? Number(editedMinutes[t.id]) || 15 : (t.estimatedTimeMin || 15);
        const currentStatus = editedStatuses[t.id] !== undefined ? editedStatuses[t.id] : (t.status || 'todo');

        const matchNumber = currentTitle.match(/^(\d+)[\.\s]/);
        const orderIdx = matchNumber ? parseInt(matchNumber[1], 10) : (typeof t.orderIndex === 'number' ? t.orderIndex : 9999);

        const updateData: any = {
          projectName: newName,
          concejalia: concejalia || '',
          projectConcejalia: concejalia || '',
          projectMasterCategory: concejalia || '',
          linkedExpedientId: linkedExpedientId || project.linkedExpedientId || '',
          orderIndex: orderIdx,
          title: currentTitle,
          titulo: `${currentTitle} - ${newName}`,
          estimatedTimeMin: currentMin,
          tiempo_estimado: `${currentMin}m`,
          status: currentStatus,
          completada: currentStatus === 'completed'
        };

        const effParentProjectId = project.parentProjectId || t.parentProjectId || '';
        if (effParentProjectId) {
          updateData.parentProjectId = effParentProjectId;
        }
        const effParentProjectName = project.parentProjectName || t.parentProjectName || '';
        if (effParentProjectName) {
          updateData.parentProjectName = effParentProjectName;
        }
        if (project.isContratoMenor !== undefined || t.isContratoMenor !== undefined) {
          updateData.isContratoMenor = project.isContratoMenor ?? t.isContratoMenor ?? false;
        }
        if (project.expedientCode || t.expedientCode) {
          updateData.expedientCode = project.expedientCode || t.expedientCode;
        }

        if (resolvedUserId) {
          updateData.userId = resolvedUserId;
        }

        if (newDueDateMs) {
          updateData.dueDate = newDueDateMs;
          updateData.fecha_vencimiento = newDueDateMs;
        }

        batch.set(tRef, updateData, { merge: true });
      });

      // 2. Guardar/fusionar cabecera de expediente con batch.set ({ merge: true })
      const docIdToUse = project.firestoreDocId || project.id || project.projectId;
      if (docIdToUse) {
        const pRef = doc(db, 'tareas', docIdToUse);
        const projectUpdateData: any = {
          isProject: true,
          id: project.id || project.projectId || docIdToUse,
          projectId: project.id || project.projectId || docIdToUse,
          name: newName,
          projectName: newName,
          concejalia: concejalia || '',
          projectConcejalia: concejalia || '',
          projectMasterCategory: concejalia || '',
          linkedExpedientId: linkedExpedientId || project.linkedExpedientId || '',
          status: projectStatus,
          notas: (notas || '').trim(),
          notes: (notas || '').trim(),
          driveFolderUrl: (driveFolderUrl || '').trim(),
          sedeUrl: (sedeUrl || '').trim(),
          checklistDocs: checklistDocs || []
        };

        if (project.parentProjectId) {
          projectUpdateData.parentProjectId = project.parentProjectId;
        }
        if (project.parentProjectName) {
          projectUpdateData.parentProjectName = project.parentProjectName;
        }
        if (project.isContratoMenor !== undefined) {
          projectUpdateData.isContratoMenor = project.isContratoMenor;
        }
        if (project.isMacroProject !== undefined) {
          projectUpdateData.isMacroProject = project.isMacroProject;
        }
        if (project.type) {
          projectUpdateData.type = project.type;
        }
        if (project.expedientCode) {
          projectUpdateData.expedientCode = project.expedientCode;
        }

        if (resolvedUserId) {
          projectUpdateData.userId = resolvedUserId;
        }

        if (newDueDateMs) {
          projectUpdateData.dueDate = newDueDateMs;
          projectUpdateData.fecha_vencimiento = newDueDateMs;
        }

        batch.set(pRef, projectUpdateData, { merge: true });
      }

      await batch.commit();
      setIsSaving(false);
      setSuccessMsg("¡Expediente, enlaces y documentación actualizados con éxito!");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (error: any) {
      console.error("Error al actualizar expediente en lote: ", error);
      setIsSaving(false);
      setErrorMsg(error?.message || "Error al guardar los cambios.");
    }
  };

  const handleCloneForNextYear = async () => {
    if (!window.confirm(`¿Deseas clonar este expediente completo ("${project.name}") con todas sus tareas limpias para la próxima edición o ejercicio?`)) return;

    setIsCloning(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const currentYear = new Date().getFullYear();
      const nextYear = currentYear + 1;
      let clonedName = project.name;

      if (clonedName.includes(String(currentYear))) {
        clonedName = clonedName.replace(new RegExp(String(currentYear), 'g'), String(nextYear));
      } else {
        clonedName = `${clonedName} (${nextYear})`;
      }

      const newExpedientCode = generateExpedientCode();
      const newProjectId = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const resolvedUserId = effectiveUserId || auth.currentUser?.uid || (tasks.length > 0 ? tasks[0].userId : '');
      const batch = writeBatch(db);

      // Crear nuevo expediente
      const pRef = doc(db, 'tareas', newProjectId);
      const clonePayload: any = {
        ...project,
        id: newProjectId,
        projectId: newProjectId,
        name: clonedName,
        projectName: clonedName,
        expedientCode: newExpedientCode,
        status: 'active',
        createdAt: Date.now(),
        fecha_creacion: Date.now(),
        checklistDocs: checklistDocs.map(c => ({ ...c, completed: false }))
      };

      if (resolvedUserId) {
        clonePayload.userId = resolvedUserId;
      }

      batch.set(pRef, clonePayload);

      // Clonar tareas hijas con estado 'todo'
      tasks.forEach((t, idx) => {
        const newTaskId = `task_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`;
        const tRef = doc(db, 'tareas', newTaskId);
        const cleanTitle = t.title || t.titulo.split(' - ')[0] || t.titulo;

        const taskClonePayload: any = {
          titulo: `${cleanTitle} - ${clonedName}`,
          title: cleanTitle,
          notas: t.notas || t.notes || '',
          notes: t.notas || t.notes || '',
          status: 'todo',
          completada: false,
          estimatedTimeMin: t.estimatedTimeMin || 15,
          tiempo_estimado: `${t.estimatedTimeMin || 15}m`,
          isInMyDay: false,
          prioridad: t.prioridad || 'media',
          concejalia: project.concejalia || '',
          projectConcejalia: project.concejalia || '',
          projectMasterCategory: project.concejalia || '',
          projectId: newProjectId,
          projectName: clonedName,
          expedientCode: newExpedientCode,
          orderIndex: t.orderIndex ?? idx + 1,
          createdAt: Date.now(),
          fecha_creacion: Date.now()
        };

        if (resolvedUserId) {
          taskClonePayload.userId = resolvedUserId;
        }

        batch.set(tRef, taskClonePayload);
      });

      await batch.commit();
      setIsCloning(false);
      setSuccessMsg(`¡Expediente clonado con éxito: "${clonedName}" (${newExpedientCode})!`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      console.error("Error cloning expedient: ", err);
      setIsCloning(false);
      setErrorMsg("Error al clonar el expediente.");
    }
  };

  const handleDeleteExpediente = async () => {
    const targetProjectId = project.id || (project as any).projectId;
    if (!targetProjectId) {
      setErrorMsg("ID de expediente no válido.");
      return;
    }

    if (!window.confirm(`¿Mover el expediente "${project.name}" y todas sus tareas a la papelera? Podrás recuperarlo en cualquier momento desde la Papelera.`)) {
      return;
    }

    try {
      // project.firestoreDocId = ID físico real del doc en Firestore
      await moveToTrashExpediente(targetProjectId, tasks, project.firestoreDocId);
      onClose();
    } catch (err: any) {
      console.error("Error al mover expediente a papelera: ", err);
      setErrorMsg(err?.message || "Error al eliminar expediente.");
    }
  };

  const handleCopyTextList = async () => {
    const ok = await copyExpedientTasksToClipboard(project, tasks);
    if (ok) {
      setSuccessMsg("¡Lista de tareas copiada al portapapeles (lista para WhatsApp/Email)!");
      setTimeout(() => setSuccessMsg(null), 3000);
    } else {
      setErrorMsg("No se pudo copiar al portapapeles.");
      setTimeout(() => setErrorMsg(null), 3000);
    }
  };

  const cStyle = getConcejaliaStyle(concejalia);

  return (
    <div ref={panelRef} className="h-full flex flex-col bg-white dark:bg-slate-800 transition-colors duration-300 overflow-hidden shadow-2xl border-l border-slate-200 dark:border-slate-700">
      
      {/* HEADER DEL PANEL */}
      <div className="p-5 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 space-y-3 shrink-0">
        {/* Fila 1: Título completo y botón cerrar */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-extrabold text-slate-800 dark:text-slate-100">
                  Detalles del Expediente
                </h2>
                {project.expedientCode && (
                  <span className="px-2 py-0.5 rounded-md text-xs font-mono font-bold bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    {project.expedientCode}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Edición en lote de expediente y tareas hijas</p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors shrink-0 cursor-pointer"
            title="Cerrar panel"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Fila 2: Barra de herramientas de exportación y acciones rápidas */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/50 dark:border-slate-700/50 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => exportExpedientToPDF(project, tasks)}
              className="px-2.5 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 font-bold text-xs transition-colors flex items-center gap-1 cursor-pointer"
              title="Exportar informe en formato PDF listo para imprimir"
            >
              <span>📄 PDF</span>
            </button>
            <button
              type="button"
              onClick={() => exportExpedientToCSV(project, tasks)}
              className="px-2.5 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 font-bold text-xs transition-colors flex items-center gap-1 cursor-pointer"
              title="Exportar hoja de datos compatible con Microsoft Excel"
            >
              <span>📊 Excel</span>
            </button>
            <button
              type="button"
              onClick={handleCopyTextList}
              className="px-2.5 py-1 rounded-xl bg-amber-50 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 font-bold text-xs transition-colors flex items-center gap-1 cursor-pointer"
              title="Copiar lista de tareas formateada para enviar por WhatsApp o Email"
            >
              <span>📋 Copiar</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {(project.isMacroProject || project.type === 'macro_expediente' || childProjects.length > 0) && (
              <button
                type="button"
                onClick={() => setIsAddingCMModalOpen(true)}
                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1 cursor-pointer"
              >
                <span>➕</span> Contrato
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsAddingTask(!isAddingTask)}
              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1 cursor-pointer"
            >
              <span>➕</span> Tarea
            </button>
          </div>
        </div>
      </div>

      {/* MENSAJE DE ÉXITO */}
      {successMsg && (
        <div className="bg-emerald-500 text-white px-6 py-2.5 text-xs font-bold flex items-center gap-2 animate-fade-in shrink-0">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
          <span>{successMsg}</span>
        </div>
      )}

      {/* MENSAJE DE ERROR */}
      {errorMsg && (
        <div className="bg-red-500 text-white px-6 py-2.5 text-xs font-bold flex items-center gap-2 animate-fade-in shrink-0">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{errorMsg}</span>
        </div>
      )}

      {/* CUERPO DEL PANEL */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        
        {/* NOMBRE DEL EXPEDIENTE */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
            Nombre del Expediente / Proyecto *
          </label>
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            placeholder="Ej. Obras pavimentación Calle Real"
          />
        </div>

        {/* ANOTACIONES Y NOTAS DEL EXPEDIENTE */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
            Anotaciones / Notas del Expediente
          </label>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={4}
            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors resize-none font-medium"
            placeholder="Escribe notas generales, observaciones o enlaces de interés sobre el expediente..."
          />
        </div>

        {/* ESTADO GLOBAL DEL EXPEDIENTE */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
            Estado del Expediente *
          </label>
          <select
            value={projectStatus}
            onChange={(e) => setProjectStatus(e.target.value as 'active' | 'completed' | 'archived')}
            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
          >
            <option value="active">🟢 Activo</option>
            <option value="completed">✅ Completado</option>
            <option value="archived">📦 Archivado</option>
          </select>
        </div>

        {/* SELECTOR DE CONCEJALÍA */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
            Concejalía Responsable *
          </label>
          <select
            value={concejalia}
            onChange={(e) => setConcejalia(e.target.value)}
            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
          >
            <option value="">Seleccionar Concejalía...</option>
            {concejaliasList.map((cName) => (
              <option key={cName} value={cName}>{cName}</option>
            ))}
          </select>
        </div>

        {/* VINCULACIÓN A OTRO EXPEDIENTE */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
            Vincular a Expediente Existente
          </label>
          <select
            value={linkedExpedientId}
            onChange={(e) => setLinkedExpedientId(e.target.value)}
            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
          >
            <option value="">-- Sin expediente vinculado (Independiente) --</option>
            {existingProjects.map((p) => (
              <option key={p.id} value={p.id}>
                🔗 {p.code} - {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* FECHA LÍMITE GENERAL DEL EXPEDIENTE */}
        <div>
          <CustomDatePicker
            label="Fecha Límite Global del Expediente (Afecta a todas las tareas)"
            value={fechaVencimiento}
            onChange={(dStr) => setFechaVencimiento(dStr)}
          />
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
            Al cambiar la fecha del expediente y pulsar "Guardar Cambios", se actualizará la fecha límite de todas las tareas contenidas.
          </p>
        </div>

        {/* ENLACES EXTERNOS (GOOGLE DRIVE Y SEDE ELECTRÓNICA) */}
        <div className="p-4 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/80 dark:border-blue-800/50 rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
              <span>📁</span> Repositorio Google Drive & Sede
            </span>
          </div>

          <div className="space-y-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  Carpeta Raíz en Google Drive:
                </label>
                {driveFolderUrl.trim() && (
                  <a
                    href={driveFolderUrl.trim()}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    <span>🔗 Abrir Carpeta</span>
                  </a>
                )}
              </div>
              <input
                type="url"
                value={driveFolderUrl}
                onChange={(e) => setDriveFolderUrl(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/..."
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-blue-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  Enlace Sede Electrónica / Gestor:
                </label>
                {sedeUrl.trim() && (
                  <a
                    href={sedeUrl.trim()}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                  >
                    <span>🏛️ Abrir en Sede</span>
                  </a>
                )}
              </div>
              <input
                type="url"
                value={sedeUrl}
                onChange={(e) => setSedeUrl(e.target.value)}
                placeholder="https://sedeelectronica.es/expediente/..."
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
            </div>
          </div>
        </div>

        {/* CHECKLIST DE DOCUMENTACIÓN PRECEPTIVA */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <span>📑</span> Check-list de Documentación Obligatoria
              </span>
              <p className="text-[11px] text-slate-400">
                {checklistDocs.filter(d => d.completed).length} de {checklistDocs.length} documentos aportados ({checklistDocs.length > 0 ? Math.round((checklistDocs.filter(d => d.completed).length / checklistDocs.length) * 100) : 0}%)
              </p>
            </div>
            <div className="w-20 bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-emerald-500 h-full rounded-full transition-all"
                style={{ width: `${checklistDocs.length > 0 ? (checklistDocs.filter(d => d.completed).length / checklistDocs.length) * 100 : 0}%` }}
              ></div>
            </div>
          </div>

          <div className="space-y-1.5">
            {checklistDocs.map((docItem, dIdx) => (
              <div
                key={docItem.id || dIdx}
                className="p-2 bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-xl flex items-center justify-between gap-2"
              >
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer select-none flex-1 min-w-0">
                  <input
                    type="checkbox"
                    checked={docItem.completed}
                    onChange={(e) => {
                      const updated = [...checklistDocs];
                      updated[dIdx] = { ...docItem, completed: e.target.checked };
                      setChecklistDocs(updated);
                    }}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 dark:border-slate-600"
                  />
                  <span className={`truncate ${docItem.completed ? 'line-through text-slate-400' : ''}`}>
                    {docItem.name}
                  </span>
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* SECCIÓN SUB-CONTRATOS MENORES SI ES MACRO-EXPEDIENTE */}
        {(project.isMacroProject || project.type === 'macro_expediente' || childProjects.length > 0) && (
          <div className="p-4 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                  <span>📜</span> Sub-Contratos Menores ({childProjects.length})
                </h4>
                <p className="text-[11px] text-amber-700/80 dark:text-amber-400">
                  Contratos menores asociados a este macro-expediente
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddingCMModalOpen(true)}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1 cursor-pointer"
              >
                <span>➕</span> Añadir Contrato
              </button>
            </div>

            {childProjects.length === 0 ? (
              <p className="text-xs text-amber-800/60 dark:text-amber-400/60 italic py-2">
                No hay sub-contratos menores vinculados todavía.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {childProjects.map((cm) => (
                  <div key={cm.id} className="p-2.5 bg-white dark:bg-slate-800 border border-amber-200/80 dark:border-slate-700 rounded-xl flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-200 truncate flex items-center gap-1.5">
                      <span>📜</span> {cm.name}
                    </span>
                    <span className="font-mono text-[11px] font-bold text-amber-700 dark:text-amber-300 shrink-0">
                      {cm.expedientCode}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SECCIÓN INTERACTIVA DE TAREAS DEL EXPEDIENTE */}
        <div className="pt-2 space-y-3">
          <div className="sticky top-0 z-10 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md py-2.5 px-3 -mx-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between rounded-xl shadow-xs">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              Tareas del Expediente ({tasks.length})
            </span>
            <button
              type="button"
              onClick={() => setIsAddingTask(!isAddingTask)}
              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
            >
              <span>{isAddingTask ? '✕ Cancelar' : '+ Añadir Tarea'}</span>
            </button>
          </div>

          {/* Formulario Inline para Añadir Nueva Tarea */}
          {isAddingTask && (
            <form onSubmit={handleAddNewTask} className="p-3.5 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800 rounded-xl space-y-3 animate-fade-in">
              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">Nueva Tarea para el Expediente</span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  required
                  placeholder="Ej. Título de la nueva tarea..."
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  className="flex-1 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="number"
                  min={5}
                  max={480}
                  step={5}
                  value={newTaskMinutes}
                  onChange={(e) => setNewTaskMinutes(e.target.value)}
                  className="w-16 px-2 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-center font-mono font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-xs font-bold text-slate-400">min</span>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddingTask(false)}
                  className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-sm"
                >
                  Guardar Tarea
                </button>
              </div>
            </form>
          )}

          {/* LISTA DE TAREAS PENDIENTES EDITABLES */}
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {sortExpedientTasksNaturally(tasks).map((t, idx) => {
              const currentTitle = editedTitles[t.id] !== undefined ? editedTitles[t.id] : (t.title || t.titulo);
              const currentMin = editedMinutes[t.id] !== undefined ? editedMinutes[t.id] : (t.estimatedTimeMin || 15);
              const currentStatus = editedStatuses[t.id] !== undefined ? editedStatuses[t.id] : (t.status || 'todo');
              const isSelected = !!t.id && selectedTaskIds.includes(t.id);

              return (
                <div 
                  key={t.id || idx}
                  className={`p-3 border rounded-xl space-y-2 transition-all ${
                    isSelected
                      ? 'bg-indigo-50/90 dark:bg-indigo-950/40 border-indigo-500 ring-2 ring-indigo-500/30'
                      : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200/80 dark:border-slate-700'
                  }`}
                >
                  {/* Fila 1: Checkbox + Número + Título Completo + Papelera */}
                  <div className="flex items-center gap-2 w-full">
                    {/* Checkbox de Selección Masiva */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!t.id) return;
                        setSelectedTaskIds(prev =>
                          prev.includes(t.id!) ? prev.filter(id => id !== t.id) : [...prev, t.id!]
                        );
                      }}
                      className={`w-4 h-4 rounded border flex items-center justify-center text-[9px] font-black transition-all cursor-pointer shrink-0 ${
                        isSelected
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                          : 'border-slate-300 dark:border-slate-600 bg-white/80 dark:bg-slate-800 text-transparent hover:border-indigo-400'
                      }`}
                      title={isSelected ? 'Desmarcar tarea' : 'Seleccionar para edición en masa'}
                    >
                      ✓
                    </button>

                    <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-bold flex items-center justify-center shrink-0 text-xs">
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={currentTitle}
                      onChange={(e) => setEditedTitles(prev => ({ ...prev, [t.id]: e.target.value }))}
                      className="flex-1 bg-transparent border-b border-slate-200 dark:border-slate-700 hover:border-indigo-400 focus:border-indigo-500 px-1 py-1 font-semibold text-xs text-slate-800 dark:text-slate-200 outline-none transition-all w-full"
                      placeholder="Título de la tarea..."
                    />
                    <button
                      type="button"
                      onClick={(e) => handleDeleteSingleTask(t.id, e)}
                      title="Eliminar esta tarea"
                      className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-500 dark:text-red-400 rounded-lg transition-colors shrink-0 cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>

                  {/* Fila 2: Tiempo estimado + Selector de estado */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/50 dark:border-slate-800 text-[11px]">
                    <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-mono">
                      <span>⏱️ Tiempo:</span>
                      <input
                        type="number"
                        min={5}
                        max={480}
                        step={5}
                        value={currentMin}
                        onChange={(e) => setEditedMinutes(prev => ({ ...prev, [t.id]: Number(e.target.value) }))}
                        className="w-14 px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-center text-slate-700 dark:text-slate-200 font-bold outline-none"
                      />
                      <span>min</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500 dark:text-slate-400 font-semibold">Estado:</span>
                      <select
                        value={currentStatus}
                        onChange={(e) => setEditedStatuses(prev => ({ ...prev, [t.id]: e.target.value as TaskStatus }))}
                        className="px-2 py-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[11px] font-semibold text-slate-700 dark:text-slate-300 outline-none"
                      >
                        <option value="todo">Pendiente</option>
                        <option value="in_progress">En curso</option>
                        <option value="waiting_on_third_party">Retenido</option>
                        <option value="completed">Completada</option>
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* FOOTER Y ACCIONES */}
      <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 space-y-3 shrink-0">
        <button
          onClick={handleSaveAll}
          disabled={isSaving}
          className="w-full bg-indigo-600 dark:bg-indigo-500 hover:bg-indigo-700 dark:hover:bg-indigo-600 text-white py-3 px-4 rounded-xl font-bold text-sm shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
        >
          {isSaving ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>Guardando en Lote...</span>
            </>
          ) : (
            <span>Guardar Cambios en Lote</span>
          )}
        </button>

        <button
          type="button"
          onClick={handleCloneForNextYear}
          disabled={isCloning || isSaving}
          className="w-full py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <span>🔄</span>
          <span>{isCloning ? 'Clonando Expediente...' : 'Duplicar para Próxima Edición / Año'}</span>
        </button>

        <button
          onClick={handleDeleteExpediente}
          className="w-full py-2.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors flex items-center justify-center gap-1 cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          <span>Eliminar Expediente Completo</span>
        </button>
      </div>

      {/* MODAL DE ADICIÓN DE CONTRATOS MENORES AL MACRO */}
      {isAddingCMModalOpen && (
        <MacroExpedienteModal
          user={{ uid: project.userId || '' } as any}
          onClose={() => setIsAddingCMModalOpen(false)}
          existingMacroProject={project}
        />
      )}

      {/* BARRA FLOTANTE DE ACCIONES MASIVAS */}
      <BulkTaskActionBar
        selectedTaskIds={selectedTaskIds}
        tasks={tasks}
        concejaliasList={concejaliasList}
        onClearSelection={() => setSelectedTaskIds([])}
        onSelectAll={() => {
          if (selectedTaskIds.length === tasks.length) {
            setSelectedTaskIds([]);
          } else {
            setSelectedTaskIds(tasks.map(t => t.id!).filter(Boolean));
          }
        }}
        isAllSelected={tasks.length > 0 && selectedTaskIds.length === tasks.length}
      />

    </div>
  );
}
