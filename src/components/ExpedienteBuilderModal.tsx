import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { User } from 'firebase/auth';
import { ConcejaliaItem, TemplateTask, TaskStatus, generateExpedientCode } from '../types';

interface Props {
  user: User;
  onClose: () => void;
}

const DEFAULT_CONCEJALIAS = [
  "Economía y Hacienda",
  "Medio Ambiente",
  "Policía Local y Movilidad",
  "Entidades Urbanísticas de Conservación"
];

export default function ExpedienteBuilderModal({ user, onClose }: Props) {
  const [concejalias, setConcejalias] = useState<ConcejaliaItem[]>([]);
  const [selectedConcejaliaName, setSelectedConcejaliaName] = useState<string>('');
  const [isCreatingConcejalia, setIsCreatingConcejalia] = useState(false);
  const [newConcejaliaName, setNewConcejaliaName] = useState('');
  
  const [nombreProyecto, setNombreProyecto] = useState('');
  const [existingProjects, setExistingProjects] = useState<{ id: string; name: string; code: string }[]>([]);
  const [selectedLinkedProjectId, setSelectedLinkedProjectId] = useState<string>('');

  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Array de tareas dinámicas
  const [tasks, setTasks] = useState<TemplateTask[]>([
    { title: '1. Requerimiento de documentación', estimatedTimeMin: 30, status: 'todo' }
  ]);

  // Escuchar proyectos existentes para vinculación
  useEffect(() => {
    const q = query(
      collection(db, 'tareas'),
      where('userId', '==', user.uid)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const projMap: Record<string, { id: string; name: string; code: string }> = {};
      snapshot.forEach((d) => {
        const data = d.data();
        if (data.projectId && data.projectName && !data.isTemplate && !data.isConcejalia) {
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
  }, [user.uid]);

  // Cargar concejalías del usuario desde la colección autorizada 'tareas'
  useEffect(() => {
    const q = query(
      collection(db, 'tareas'),
      where('userId', '==', user.uid),
      where('isConcejalia', '==', true)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: ConcejaliaItem[] = [];
      snapshot.forEach((d) => {
        items.push({ id: d.id, ...d.data() } as ConcejaliaItem);
      });
      setConcejalias(items);

      if (items.length > 0 && !selectedConcejaliaName) {
        setSelectedConcejaliaName(items[0].name);
      } else if (items.length === 0 && !selectedConcejaliaName) {
        setSelectedConcejaliaName(DEFAULT_CONCEJALIAS[0]);
      }
    });

    return () => unsubscribe();
  }, [user.uid, selectedConcejaliaName]);

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
      { title: `${prev.length + 1}. Tarea nueva`, estimatedTimeMin: 30, status: 'todo' }
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

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreProyecto.trim() || isGenerating) return;
    if (!selectedConcejaliaName) {
      setErrorMessage("Debes seleccionar una concejalía.");
      return;
    }

    const validTasks = tasks.filter(t => t.title.trim().length > 0);
    if (validTasks.length === 0) {
      setErrorMessage("Debes agregar al menos 1 tarea con título.");
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);

    try {
      const batch = writeBatch(db);
      const projName = nombreProyecto.trim();
      const now = Date.now();
      const generatedProjectId = `proj_${now}_${Math.random().toString(36).substring(2, 7)}`;
      const expCode = generateExpedientCode();

      // ACCIÓN A & B: Escribir tareas dinámicas en la colección 'tareas' vinculadas al projectId
      const tareasRef = collection(db, 'tareas');

      validTasks.forEach((task) => {
        const newTaskRef = doc(tareasRef);
        batch.set(newTaskRef, {
          projectId: generatedProjectId,
          projectName: projName,
          concejalia: selectedConcejaliaName,
          projectConcejalia: selectedConcejaliaName,
          projectMasterCategory: selectedConcejaliaName,
          expedientCode: expCode,
          linkedExpedientId: selectedLinkedProjectId || '',
          title: task.title.trim(),
          titulo: `${task.title.trim()} - ${projName}`,
          notes: task.notes || '',
          notas: task.notes || '',
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
        const matchedConcObj = concejalias.find(c => c.name === selectedConcejaliaName);
        batch.set(templateRef, {
          isTemplate: true,
          name: projName,
          concejaliaId: matchedConcObj?.id || '',
          concejalia: selectedConcejaliaName,
          tasks: validTasks.map(t => ({
            title: t.title.trim(),
            estimatedTimeMin: Number(t.estimatedTimeMin) || 15,
            status: t.status,
            notes: t.notes || '',
            ...(t.blockedBy ? { blockedBy: t.blockedBy } : {})
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
      console.error("Error generating dynamic expediente batch: ", err);
      setErrorMessage(err?.message || "Error al guardar en Firestore.");
      setIsGenerating(false);
    }
  };

  // Combinar concejalías de Firestore con predeterminadas
  const allConcejaliaOptions = Array.from(
    new Set([...concejalias.map(c => c.name), ...DEFAULT_CONCEJALIAS])
  );

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
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Constructor de Expedientes</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Crea expedientes dinámicos a la medida con Firestore</p>
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
        <form onSubmit={handleGenerate} className="flex-1 flex flex-col overflow-hidden">
          
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

            {/* SECCIÓN 2: NOMBRE DEL EXPEDIENTE */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Nombre del Expediente / Objeto *
              </label>
              <input 
                type="text"
                required
                placeholder="Ej. Requerimiento Parcela 54 o Contrato de Suministros"
                value={nombreProyecto}
                onChange={(e) => setNombreProyecto(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-sm font-medium text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
              />
            </div>

            {/* SECCIÓN VINCULACIÓN CRUZADA DE EXPEDIENTES */}
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

            {/* SECCIÓN 3: CREADOR DE TAREAS DINÁMICO */}
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Tareas del Expediente ({tasks.length})
                </label>
                <button
                  type="button"
                  onClick={handleAddTaskRow}
                  className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 text-xs font-bold rounded-xl transition-all flex items-center gap-1 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Añadir Tarea
                </button>
              </div>

              <div className="space-y-2.5">
                {tasks.map((taskRow, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-700 rounded-2xl flex flex-col sm:flex-row items-stretch sm:items-center gap-2 transition-all">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 text-xs font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </div>

                    <input 
                      type="text"
                      placeholder="Título de la tarea..."
                      value={taskRow.title}
                      onChange={(e) => handleTaskChange(idx, 'title', e.target.value)}
                      className="flex-1 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-800 dark:text-slate-100 outline-none"
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
                ))}
              </div>
            </div>

            {/* SECCIÓN 4: CHECKBOX PLANTILLA RECURRENTE */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input 
                  type="checkbox"
                  checked={saveAsTemplate}
                  onChange={(e) => setSaveAsTemplate(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 transition-colors cursor-pointer"
                />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Guardar como plantilla recurrente en Firestore
                </span>
              </label>
              <p className="text-xs text-slate-400 mt-1 pl-7">
                Podrás reutilizar este conjunto de tareas con un solo clic desde el selector de plantillas.
              </p>
            </div>

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
                  <span>Generando Lote...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>Generar Expediente</span>
                </>
              )}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
