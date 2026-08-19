import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, doc, writeBatch, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { User } from 'firebase/auth';
import { TemplateTask, TaskStatus, generateExpedientCode, ExpedienteTemplate } from '../types';
import { useConcejalias } from '../hooks/useConcejalias';
import { cleanTaskTitle, formatIndexedTaskTitle, formatExpedientTaskTitle } from '../utils/taskNumbering';

interface Props {
  user: User;
  onClose: () => void;
  templateToEdit?: ExpedienteTemplate | null;
  mode?: 'create_expediente' | 'edit_template' | 'create_template';
  onTemplateSaved?: (savedTemplate: ExpedienteTemplate) => void;
}

export default function ExpedienteBuilderModal({
  user,
  onClose,
  templateToEdit = null,
  mode = 'create_expediente',
  onTemplateSaved
}: Props) {
  const concejaliasList = useConcejalias(user.uid);
  const [selectedConcejaliaName, setSelectedConcejaliaName] = useState<string>(
    templateToEdit ? (templateToEdit.concejalia || templateToEdit.masterCategory || '') : ''
  );
  const [isCreatingConcejalia, setIsCreatingConcejalia] = useState(false);
  const [newConcejaliaName, setNewConcejaliaName] = useState('');
  
  const [nombreProyecto, setNombreProyecto] = useState(
    templateToEdit ? (templateToEdit.name || templateToEdit.nombre || '') : ''
  );
  const [notasProyecto, setNotasProyecto] = useState(
    templateToEdit ? (templateToEdit.descripcion || templateToEdit.description || '') : ''
  );
  const [existingProjects, setExistingProjects] = useState<{ id: string; name: string; code: string }[]>([]);
  const [selectedLinkedProjectId, setSelectedLinkedProjectId] = useState<string>('');

  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Array de tareas dinámicas limpias de prefijos manuales
  const [tasks, setTasks] = useState<TemplateTask[]>(() => {
    if (templateToEdit?.tasks && templateToEdit.tasks.length > 0) {
      return templateToEdit.tasks.map(t => ({
        title: cleanTaskTitle(t.title || ''),
        estimatedTimeMin: t.estimatedTimeMin || 30,
        status: t.status || 'todo',
        notes: t.notes || t.notas || '',
        notas: t.notas || t.notes || '',
        blockedBy: t.blockedBy || '',
        blockingReason: t.blockingReason || ''
      }));
    }
    return [{ title: 'Requerimiento de documentación', estimatedTimeMin: 30, status: 'todo' }];
  });

  const isTemplateOnlyMode = mode === 'edit_template' || mode === 'create_template';

  // Escuchar proyectos existentes para vinculación (solo necesario en modo generar expediente)
  useEffect(() => {
    if (isTemplateOnlyMode) return;

    const q = query(
      collection(db, 'tareas'),
      where('userId', '==', user.uid)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const projMap: Record<string, { id: string; name: string; code: string }> = {};
      snapshot.forEach((d) => {
        const data = d.data();
        if (data.isProject) {
          projMap[data.id || d.id] = {
            id: data.id || d.id,
            name: data.name || data.projectName,
            code: data.expedientCode || 'EXP-2026-N/A'
          };
        } else if (data.projectId && data.projectName && !data.isTemplate && !data.isConcejalia) {
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
  }, [user.uid, isTemplateOnlyMode]);

  // Si aún no hay concejalía seleccionada, tomar la primera de la lista unificada
  useEffect(() => {
    if (concejaliasList.length > 0 && !selectedConcejaliaName) {
      setSelectedConcejaliaName(concejaliasList[0]);
    }
  }, [concejaliasList, selectedConcejaliaName]);

  const allConcejaliaOptions = concejaliasList;

  const handleSaveNewConcejalia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newConcejaliaName.trim()) return;

    try {
      await addDoc(collection(db, 'tareas'), {
        isConcejalia: true,
        name: newConcejaliaName.trim(),
        userId: user.uid,
        fecha_creacion: Date.now()
      });

      setSelectedConcejaliaName(newConcejaliaName.trim());
      setNewConcejaliaName('');
      setIsCreatingConcejalia(false);
    } catch (err: any) {
      console.error("Error creating concejalia: ", err);
      setErrorMessage("Error al guardar la concejalía en Firestore.");
    }
  };

  const handleAddTaskRow = () => {
    setTasks((prev) => [
      ...prev,
      { title: '', estimatedTimeMin: 30, status: 'todo' }
    ]);
  };

  const handleRemoveTaskRow = (index: number) => {
    if (tasks.length <= 1) return;
    setTasks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleTaskChange = (index: number, field: keyof TemplateTask, value: any) => {
    setTasks((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleMoveTask = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === tasks.length - 1)) return;
    setTasks((prev) => {
      const next = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      const temp = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = temp;
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreProyecto.trim() || isGenerating) return;
    if (!selectedConcejaliaName) {
      setErrorMessage("Debes seleccionar una concejalía.");
      return;
    }

    const validTasks = tasks.filter(t => cleanTaskTitle(t.title).length > 0);
    if (validTasks.length === 0) {
      setErrorMessage("Debes agregar al menos 1 tarea con título.");
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);

    try {
      const projName = nombreProyecto.trim();
      const now = Date.now();

      // =========================================================================
      // MODO 1: EDICIÓN O CREACIÓN EXCLUSIVA DE PLANTILLA (Sin instanciar proyecto)
      // =========================================================================
      if (isTemplateOnlyMode) {
        const templateTaskData = validTasks.map((t, index) => ({
          title: cleanTaskTitle(t.title),
          estimatedTimeMin: Number(t.estimatedTimeMin) || 15,
          status: t.status || 'todo',
          notes: t.notes || '',
          orderIndex: index + 1,
          ...(t.blockedBy ? { blockedBy: t.blockedBy } : {}),
          ...(t.blockingReason ? { blockingReason: t.blockingReason } : {})
        }));

        // Si es edición de una plantilla guardada en Firestore existente
        if (mode === 'edit_template' && templateToEdit?.id && templateToEdit.id !== 'contrato_menor' && templateToEdit.id !== 'limpieza_parcela') {
          const templateRef = doc(db, 'tareas', templateToEdit.id);
          await updateDoc(templateRef, {
            name: projName,
            concejalia: selectedConcejaliaName,
            tasks: templateTaskData,
            fecha_modificacion: now
          });
        } else {
          // Nueva plantilla o guardar versión personalizada de plantilla del sistema
          const newTemplateRef = doc(collection(db, 'tareas'));
          await setDoc(newTemplateRef, {
            isTemplate: true,
            name: projName,
            concejalia: selectedConcejaliaName,
            tasks: templateTaskData,
            userId: user.uid,
            fecha_creacion: now
          });
        }

        setSuccessMessage(`¡Plantilla "${projName}" ${mode === 'edit_template' ? 'actualizada' : 'guardada'} con éxito!`);
        if (onTemplateSaved) {
          onTemplateSaved({
            id: templateToEdit?.id || '',
            name: projName,
            concejalia: selectedConcejaliaName,
            tasks: templateTaskData
          });
        }
        setTimeout(() => {
          onClose();
        }, 1000);
        return;
      }

      // =========================================================================
      // MODO 2: GENERACIÓN DE EXPEDIENTE (Lote activo)
      // =========================================================================
      const batch = writeBatch(db);
      const generatedProjectId = `proj_${now}_${Math.random().toString(36).substring(2, 7)}`;
      const expCode = generateExpedientCode();

      // ACCIÓN A: Guardar la cabecera del proyecto en la colección autorizada 'tareas' con isProject: true
      const projectRef = doc(db, 'tareas', generatedProjectId);
      batch.set(projectRef, {
        isProject: true,
        id: generatedProjectId,
        projectId: generatedProjectId,
        name: projName,
        projectName: projName,
        type: 'custom',
        concejalia: selectedConcejaliaName,
        projectConcejalia: selectedConcejaliaName,
        status: 'active',
        expedientCode: expCode,
        linkedExpedientId: selectedLinkedProjectId || '',
        notas: notasProyecto.trim(),
        notes: notasProyecto.trim(),
        userId: user.uid,
        fecha_creacion: now
      });

      // ACCIÓN B: Escribir tareas dinámicas en la colección 'tareas' vinculadas al projectId
      const tareasRef = collection(db, 'tareas');

      validTasks.forEach((task, index) => {
        const cleanTitle = cleanTaskTitle(task.title);
        const indexedTitle = `${index + 1}. ${cleanTitle}`;
        const fullExpTitle = `${indexedTitle} - ${projName}`;

        const newTaskRef = doc(tareasRef);
        batch.set(newTaskRef, {
          projectId: generatedProjectId,
          projectName: projName,
          concejalia: selectedConcejaliaName,
          projectConcejalia: selectedConcejaliaName,
          projectMasterCategory: selectedConcejaliaName,
          expedientCode: expCode,
          linkedExpedientId: selectedLinkedProjectId || '',
          orderIndex: index + 1,
          title: indexedTitle,
          titulo: fullExpTitle,
          notes: task.notes || notasProyecto.trim() || '',
          notas: task.notes || notasProyecto.trim() || '',
          status: task.status,
          completada: task.status === 'completed',
          estimatedTimeMin: Number(task.estimatedTimeMin) || 15,
          tiempo_estimado: `${Number(task.estimatedTimeMin) || 15}m`,
          blockedBy: task.status === 'waiting_on_third_party' ? (task.blockedBy || 'Tercero') : '',
          blockingReason: task.blockingReason || '',
          isInMyDay: true,
          dueDate: now,
          fecha_vencimiento: now,
          prioridad: 'media',
          userId: user.uid,
          fecha_creacion: now
        });
      });

      // ACCIÓN C (Condicional): Si el checkbox es TRUE, guardar como plantilla en la colección 'tareas' con isTemplate: true
      if (saveAsTemplate) {
        const templateRef = doc(collection(db, 'tareas'));
        batch.set(templateRef, {
          isTemplate: true,
          name: projName,
          concejalia: selectedConcejaliaName,
          tasks: validTasks.map((t, index) => ({
            title: cleanTaskTitle(t.title),
            estimatedTimeMin: Number(t.estimatedTimeMin) || 15,
            status: t.status,
            notes: t.notes || '',
            orderIndex: index + 1,
            ...(t.blockedBy ? { blockedBy: t.blockedBy } : {}),
            ...(t.blockingReason ? { blockingReason: t.blockingReason } : {})
          })),
          userId: user.uid,
          fecha_creacion: now
        });
      }

      await batch.commit();

      setSuccessMessage(`¡Expediente "${projName}" generado con éxito con ${validTasks.length} tareas!`);
      setTimeout(() => {
        onClose();
      }, 1200);

    } catch (err: any) {
      console.error("Error saving expediente/template: ", err);
      setErrorMessage(err?.message || "Error al guardar en Firestore.");
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity animate-fade-in"
        onClick={onClose}
      ></div>

      {/* Modal Card */}
      <div className="relative bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-700 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-fade-in-up transition-colors duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center shrink-0">
              {mode === 'edit_template' ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              ) : mode === 'create_template' ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                {mode === 'edit_template' 
                  ? 'Editar Plantilla de Expediente' 
                  : mode === 'create_template'
                    ? 'Nueva Plantilla de Expediente'
                    : 'Constructor de Expedientes'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {mode === 'edit_template'
                  ? 'Modifica el nombre, concejalía y tareas predeterminadas'
                  : mode === 'create_template'
                    ? 'Diseña una plantilla personalizada para reutilizar con un clic'
                    : 'Crea expedientes dinámicos a la medida con Firestore'}
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Success Banner */}
        {successMessage && (
          <div className="bg-emerald-500 text-white px-6 py-3 text-sm font-semibold flex items-center gap-2 animate-fade-in">
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            <span>{successMessage}</span>
          </div>
        )}

        {/* Error Banner */}
        {errorMessage && (
          <div className="bg-red-500 text-white px-6 py-3 text-sm font-semibold flex items-center gap-2 animate-fade-in">
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* FORM */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* SECCIÓN 1: CONCEJALÍA */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Concejalía Responsable *
              </label>

              {!isCreatingConcejalia ? (
                <div className="flex items-center gap-2">
                  <select
                    value={selectedConcejaliaName}
                    onChange={(e) => {
                      if (e.target.value === 'CREATE_NEW') {
                        setIsCreatingConcejalia(true);
                      } else {
                        setSelectedConcejaliaName(e.target.value);
                      }
                    }}
                    className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-sm font-medium text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                  >
                    {allConcejaliaOptions.map((concName) => (
                      <option key={concName} value={concName}>{concName}</option>
                    ))}
                    <option value="CREATE_NEW">+ Crear nueva Concejalía...</option>
                  </select>
                </div>
              ) : (
                <div className="flex items-center gap-2 animate-fade-in">
                  <input 
                    type="text"
                    placeholder="Nombre de la nueva Concejalía..."
                    value={newConcejaliaName}
                    onChange={(e) => setNewConcejaliaName(e.target.value)}
                    className="flex-1 px-4 py-2 bg-white dark:bg-slate-700 border border-indigo-500 rounded-xl text-sm text-slate-800 dark:text-slate-100 outline-none"
                  />
                  <button 
                    type="button"
                    onClick={handleSaveNewConcejalia}
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors shrink-0"
                  >
                    Guardar
                  </button>
                  <button 
                    type="button"
                    onClick={() => setIsCreatingConcejalia(false)}
                    className="px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium rounded-xl hover:bg-slate-200 transition-colors shrink-0"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>

            {/* SECCIÓN 2: NOMBRE DE LA PLANTILLA / EXPEDIENTE */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {isTemplateOnlyMode ? 'Nombre de la Plantilla *' : 'Nombre del Expediente / Objeto *'}
              </label>
              <input 
                type="text"
                required
                placeholder={isTemplateOnlyMode ? "Ej. Tramitación de Licencia de Vado" : "Ej. Requerimiento Parcela 54 o Contrato de Suministros"}
                value={nombreProyecto}
                onChange={(e) => setNombreProyecto(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-sm font-medium text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
              />
            </div>

            {/* SECCIÓN NOTAS / DESCRIPCIÓN (Opcional) */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {isTemplateOnlyMode ? 'Descripción / Notas de la Plantilla (Opcional)' : 'Anotaciones / Notas del Expediente (Opcional)'}
              </label>
              <textarea 
                rows={2}
                placeholder={isTemplateOnlyMode ? "Instrucciones de uso o normativa aplicable..." : "Observaciones generales o detalles de interés sobre este expediente..."}
                value={notasProyecto}
                onChange={(e) => setNotasProyecto(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-sm font-medium text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 transition-all outline-none resize-none"
              />
            </div>

            {/* SECCIÓN VINCULACIÓN CRUZADA (Solo para instanciación de expediente) */}
            {!isTemplateOnlyMode && (
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Vincular a Expediente Existente (Opcional)
                </label>
                <select
                  value={selectedLinkedProjectId}
                  onChange={(e) => setSelectedLinkedProjectId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-sm font-medium text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                >
                  <option value="">-- Sin expediente vinculado (Independiente) --</option>
                  {existingProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* SECCIÓN 3: CREADOR / EDITOR DE TAREAS DINÁMICO */}
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-700">
              <div className="sticky top-0 z-20 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md py-2.5 px-3 -mx-3 border-b border-slate-200 dark:border-slate-700/80 flex items-center justify-between shadow-xs rounded-xl">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  {isTemplateOnlyMode ? `Tareas Predeterminadas (${tasks.length})` : `Tareas del Expediente (${tasks.length})`}
                </label>
                <button
                  type="button"
                  onClick={handleAddTaskRow}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  + Añadir Tarea
                </button>
              </div>

              <div className="space-y-3">
                {tasks.map((taskRow, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-2.5 transition-all">
                    
                    {/* Fila Principal de Tarea */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 text-xs font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        
                        {/* Botones de Reordenación */}
                        <button
                          type="button"
                          onClick={() => handleMoveTask(idx, 'up')}
                          disabled={idx === 0}
                          className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-indigo-600 disabled:opacity-20 transition-colors"
                          title="Subir"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveTask(idx, 'down')}
                          disabled={idx === tasks.length - 1}
                          className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-indigo-600 disabled:opacity-20 transition-colors"
                          title="Bajar"
                        >
                          ▼
                        </button>
                      </div>

                      <input 
                        type="text"
                        placeholder={`Trámite o paso ${idx + 1}...`}
                        value={taskRow.title}
                        onChange={(e) => handleTaskChange(idx, 'title', e.target.value)}
                        onBlur={(e) => handleTaskChange(idx, 'title', cleanTaskTitle(e.target.value))}
                        className="flex-1 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500"
                      />

                      <div className="flex items-center gap-2">
                        <div className="w-24 shrink-0 flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl px-2 py-1.5">
                          <input 
                            type="number"
                            min="5"
                            max="480"
                            value={taskRow.estimatedTimeMin}
                            onChange={(e) => handleTaskChange(idx, 'estimatedTimeMin', Number(e.target.value))}
                            className="w-full text-xs font-semibold text-slate-800 dark:text-slate-100 text-center outline-none"
                          />
                          <span className="text-[10px] text-slate-400">min</span>
                        </div>

                        <select
                          value={taskRow.status}
                          onChange={(e) => handleTaskChange(idx, 'status', e.target.value as TaskStatus)}
                          className="px-2 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-100 outline-none shrink-0"
                        >
                          <option value="todo">Pendiente</option>
                          <option value="in_progress">En curso</option>
                          <option value="waiting_on_third_party">En espera (Retenido)</option>
                        </select>

                        <button
                          type="button"
                          onClick={() => handleRemoveTaskRow(idx)}
                          disabled={tasks.length <= 1}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-30 transition-colors shrink-0 cursor-pointer"
                          title="Eliminar fila"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>

                    {/* Campo Condicional: Departamento / Tercero Retenedor si está Retenido */}
                    {taskRow.status === 'waiting_on_third_party' && (
                      <div className="pl-8 flex items-center gap-2">
                        <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 shrink-0">⚠️ Retenido por:</span>
                        <input
                          type="text"
                          placeholder="Ej. Plataforma Gestiona, Intervención, Secretaría, Arquitecto..."
                          value={taskRow.blockedBy || ''}
                          onChange={(e) => handleTaskChange(idx, 'blockedBy', e.target.value)}
                          className="flex-1 px-2.5 py-1 text-xs bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 rounded-lg text-amber-900 dark:text-amber-200 outline-none"
                        />
                      </div>
                    )}

                    {/* Campo de Notas / Checklist interno de la tarea */}
                    <div className="pl-8">
                      <input
                        type="text"
                        placeholder="📝 Notas o checklist de esta tarea (Opcional)..."
                        value={taskRow.notes || taskRow.notas || ''}
                        onChange={(e) => {
                          handleTaskChange(idx, 'notes', e.target.value);
                          handleTaskChange(idx, 'notas', e.target.value);
                        }}
                        className="w-full px-2.5 py-1 text-xs bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 placeholder-slate-400 outline-none"
                      />
                    </div>

                  </div>
                ))}
              </div>
            </div>

            {/* SECCIÓN 4: CHECKBOX PLANTILLA RECURRENTE (Solo cuando se genera un expediente nuevo) */}
            {!isTemplateOnlyMode && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input 
                    type="checkbox"
                    checked={saveAsTemplate}
                    onChange={(e) => setSaveAsTemplate(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 transition-colors cursor-pointer"
                  />
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Guardar también como plantilla recurrente en Firestore
                  </span>
                </label>
                <p className="text-xs text-slate-400 mt-1 pl-7">
                  Podrás reutilizar este conjunto de tareas con un solo clic desde el selector de plantillas.
                </p>
              </div>
            )}

          </div>

          {/* FOOTER */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors text-sm cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isGenerating || !nombreProyecto.trim()}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-md transition-all flex items-center gap-2 text-sm cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>{isTemplateOnlyMode ? 'Guardando plantilla...' : 'Generando Lote...'}</span>
                </>
              ) : (
                <>
                  {isTemplateOnlyMode ? (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                      </svg>
                      <span>{mode === 'edit_template' ? 'Guardar Cambios en Plantilla' : 'Guardar Plantilla'}</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span>Generar Expediente</span>
                    </>
                  )}
                </>
              )}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}

