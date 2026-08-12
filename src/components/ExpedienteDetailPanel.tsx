import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, writeBatch, updateDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Project, Tarea, TaskStatus } from '../types';
import CustomDatePicker from './CustomDatePicker';
import { useConcejalias } from '../hooks/useConcejalias';
import { getConcejaliaStyle } from '../utils/concejaliaColors';
import { exportExpedientToPDF, exportExpedientToCSV, sortExpedientTasksNaturally, copyExpedientTasksToClipboard } from '../utils/exportUtils';

interface Props {
  project: Project;
  onClose: () => void;
}

export default function ExpedienteDetailPanel({ project, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const concejaliasList = useConcejalias(project.userId);

  const [projectName, setProjectName] = useState(project.name);
  const [concejalia, setConcejalia] = useState(project.concejalia || '');
  const [linkedExpedientId, setLinkedExpedientId] = useState(project.linkedExpedientId || '');
  const [notas, setNotas] = useState(project.notas || project.notes || '');
  const [projectStatus, setProjectStatus] = useState<'active' | 'completed' | 'archived'>(project.status || 'active');
  const [existingProjects, setExistingProjects] = useState<{ id: string; name: string; code: string }[]>([]);
  const [tasks, setTasks] = useState<Tarea[]>([]);

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

  // Escuchar otros proyectos existentes para el selector de vinculación
  useEffect(() => {
    if (!project?.userId) return;

    const q = query(
      collection(db, 'tareas'),
      where('userId', '==', project.userId)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const projMap: Record<string, { id: string; name: string; code: string }> = {};
      snapshot.forEach((d) => {
        const data = d.data();
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
  }, [project?.userId, project?.id]);

  // Escuchar en tiempo real las tareas del expediente
  useEffect(() => {
    if (!project?.id) return;

    const q = project.userId
      ? query(collection(db, 'tareas'), where('userId', '==', project.userId), where('projectId', '==', project.id))
      : query(collection(db, 'tareas'), where('projectId', '==', project.id));

    const unsub = onSnapshot(q, (snapshot) => {
      const taskList: Tarea[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        if (!data.isTemplate && !data.isConcejalia && !data.isProject) {
          taskList.push({ id: d.id, ...data } as Tarea);
        }
      });
      setTasks(taskList);

      if (!fechaVencimiento && taskList.length > 0) {
        setFechaVencimiento(getInitialProjectDueDateStr(taskList));
      }
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

  // Eliminar una tarea individual del expediente
  const handleDeleteSingleTask = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("¿Eliminar esta tarea del expediente?")) return;
    try {
      await deleteDoc(doc(db, 'tareas', taskId));
    } catch (err: any) {
      console.error("Error deleting task from detail panel: ", err);
      setErrorMsg("Error al eliminar la tarea.");
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

      await addDoc(collection(db, 'tareas'), {
        projectId: project.id,
        projectName: projectName.trim() || project.name,
        concejalia: concejalia || project.concejalia || 'General',
        projectConcejalia: concejalia || project.concejalia || 'General',
        linkedExpedientId: linkedExpedientId || '',
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
        userId: project.userId,
        fecha_creacion: now
      });

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

      // 1. Actualizar todas las tareas hijas del expediente (respetando sus anotaciones existentes)
      tasks.forEach((t) => {
        if (!t.id) return;
        const tRef = doc(db, 'tareas', t.id);

        const currentTitle = editedTitles[t.id] !== undefined ? editedTitles[t.id].trim() : (t.title || t.titulo);
        const currentMin = editedMinutes[t.id] !== undefined ? Number(editedMinutes[t.id]) || 15 : (t.estimatedTimeMin || 15);
        const currentStatus = editedStatuses[t.id] !== undefined ? editedStatuses[t.id] : (t.status || 'todo');

        const matchNumber = currentTitle.match(/^(\d+)[\.\s]/);
        const orderIdx = matchNumber ? parseInt(matchNumber[1], 10) : (typeof t.orderIndex === 'number' ? t.orderIndex : 9999);

        const updateData: any = {
          projectName: newName,
          concejalia,
          projectConcejalia: concejalia,
          projectMasterCategory: concejalia,
          linkedExpedientId: linkedExpedientId || '',
          orderIndex: orderIdx,
          title: currentTitle,
          titulo: `${currentTitle} - ${newName}`,
          estimatedTimeMin: currentMin,
          tiempo_estimado: `${currentMin}m`,
          status: currentStatus,
          completada: currentStatus === 'completed'
        };

        if (newDueDateMs) {
          updateData.dueDate = newDueDateMs;
          updateData.fecha_vencimiento = newDueDateMs;
        }

        batch.update(tRef, updateData);
      });

      // 2. Guardar/fusionar cabecera de expediente con batch.set ({ merge: true })
      if (project.id) {
        const pRef = doc(db, 'tareas', project.id);
        batch.set(pRef, {
          isProject: true,
          id: project.id,
          projectId: project.id,
          name: newName,
          projectName: newName,
          concejalia,
          projectConcejalia: concejalia,
          linkedExpedientId: linkedExpedientId || '',
          status: projectStatus,
          notas: notas.trim(),
          notes: notas.trim(),
          userId: project.userId,
          ...(newDueDateMs ? { dueDate: newDueDateMs, fecha_vencimiento: newDueDateMs } : {})
        }, { merge: true });
      }

      await batch.commit();
      setIsSaving(false);
      setSuccessMsg("¡Expediente y tareas hijas actualizados con éxito!");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (error: any) {
      console.error("Error al actualizar expediente en lote: ", error);
      setIsSaving(false);
      setErrorMsg(error?.message || "Error al guardar los cambios.");
    }
  };

  const handleDeleteExpediente = async () => {
    if (!window.confirm(`¿Eliminar definitivamente el expediente "${project.name}" y todas sus tareas (${tasks.length})?`)) {
      return;
    }

    try {
      const batch = writeBatch(db);
      tasks.forEach((t) => {
        if (t.id) batch.delete(doc(db, 'tareas', t.id));
      });
      if (project.id) {
        batch.delete(doc(db, 'tareas', project.id));
      }
      await batch.commit();
      onClose();
    } catch (err) {
      console.error("Error al eliminar expediente: ", err);
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

        {/* Fila 2: Barra de herramientas de exportación sin solapamiento */}
        <div className="flex items-center gap-2 pt-1 border-t border-slate-200/50 dark:border-slate-700/50 flex-wrap">
          <button
            type="button"
            onClick={() => exportExpedientToPDF(project, tasks)}
            className="px-2.5 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Exportar informe en formato PDF listo para imprimir"
          >
            <span>📄 PDF</span>
          </button>
          <button
            type="button"
            onClick={() => exportExpedientToCSV(project, tasks)}
            className="px-2.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Exportar hoja de datos compatible con Microsoft Excel"
          >
            <span>📊 Excel</span>
          </button>
          <button
            type="button"
            onClick={handleCopyTextList}
            className="px-2.5 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Copiar lista de tareas formateada para enviar por WhatsApp o Email"
          >
            <span>📋 Copiar Texto</span>
          </button>
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

        {/* SECCIÓN INTERACTIVA DE TAREAS DEL EXPEDIENTE */}
        <div className="pt-2 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Tareas del Expediente ({tasks.length})
            </span>
            <button
              type="button"
              onClick={() => setIsAddingTask(!isAddingTask)}
              className="px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 text-xs font-bold rounded-lg border border-indigo-200 dark:border-indigo-800/50 transition-colors flex items-center gap-1 cursor-pointer"
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

              return (
                <div 
                  key={t.id || idx}
                  className="p-3 bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-700 rounded-xl space-y-2"
                >
                  {/* Fila 1: Número + Título Completo + Papelera */}
                  <div className="flex items-center gap-2 w-full">
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
          onClick={handleDeleteExpediente}
          className="w-full py-2.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors flex items-center justify-center gap-1 cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          <span>Eliminar Expediente Completo</span>
        </button>
      </div>

    </div>
  );
}
