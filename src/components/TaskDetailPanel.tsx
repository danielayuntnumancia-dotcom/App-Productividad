import React, { useState, useEffect, useRef } from 'react';
import { Tarea, TaskStatus } from '../types';
import { doc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import CustomDatePicker from './CustomDatePicker';
import { useConcejalias } from '../hooks/useConcejalias';

interface Props {
  tarea: Tarea;
  onClose: () => void;
}

export default function TaskDetailPanel({ tarea, onClose }: Props) {
  const concejaliasList = useConcejalias(tarea.userId);
  const panelRef = useRef<HTMLDivElement>(null);
  const [titulo, setTitulo] = useState(tarea.titulo);
  const [notas, setNotas] = useState(tarea.notas || '');

  const getInitialStatus = (t: Tarea): TaskStatus => {
    if (t.status) return t.status;
    if (t.completada) return 'completed';
    return 'todo';
  };

  const getInitialMinutes = (t: Tarea): string => {
    if (t.estimatedTimeMin !== undefined) return String(t.estimatedTimeMin);
    if (t.tiempo_estimado) {
      const p = parseInt(t.tiempo_estimado, 10);
      if (!isNaN(p)) return String(p);
    }
    return '15';
  };

  const getInitialDueDateStr = (t: Tarea): string => {
    const raw = t.dueDate || t.fecha_vencimiento;
    if (raw) return new Date(raw).toISOString().split('T')[0];
    return '';
  };

  const [status, setStatus] = useState<TaskStatus>(getInitialStatus(tarea));
  const [tiempoEstimado, setTiempoEstimado] = useState(getInitialMinutes(tarea));
  const [isInMyDay, setIsInMyDay] = useState<boolean>(tarea.isInMyDay ?? true);
  const [fechaVencimiento, setFechaVencimiento] = useState<string>(getInitialDueDateStr(tarea));
  const [blockedBy, setBlockedBy] = useState<string>(tarea.blockedBy || '');
  const [blockingReason, setBlockingReason] = useState<string>(tarea.blockingReason || '');
  const [externalReference, setExternalReference] = useState<string>(tarea.externalReference || '');
  
  // Handle legacy numeric priorities
  const defaultPriority = typeof tarea.prioridad === 'string' && ['baja', 'media', 'alta'].includes(tarea.prioridad) 
    ? tarea.prioridad as 'baja' | 'media' | 'alta'
    : 'media';
    
  const [prioridad, setPrioridad] = useState<'baja' | 'media' | 'alta'>(defaultPriority);
  
  const [concejalia, setConcejalia] = useState<string>(tarea.concejalia || '');
  
  const [isSaving, setIsSaving] = useState(false);

  // Live listener to Firestore document so changes (e.g. clicking "Iniciar" on task card) update panel in real time
  useEffect(() => {
    if (!tarea.id) return;
    const taskRef = doc(db, 'tareas', tarea.id);
    const unsubscribe = onSnapshot(taskRef, (docSnap) => {
      if (docSnap.exists()) {
        const liveData = { id: docSnap.id, ...docSnap.data() } as Tarea;
        setTitulo(liveData.titulo);
        setNotas(liveData.notas || '');
        setStatus(getInitialStatus(liveData));
        setTiempoEstimado(getInitialMinutes(liveData));
        setIsInMyDay(liveData.isInMyDay ?? true);
        setBlockedBy(liveData.blockedBy || '');
        setBlockingReason(liveData.blockingReason || '');
        setExternalReference(liveData.externalReference || '');
        setPrioridad(
          typeof liveData.prioridad === 'string' && ['baja', 'media', 'alta'].includes(liveData.prioridad) 
            ? liveData.prioridad as 'baja' | 'media' | 'alta'
            : 'media'
        );
        setFechaVencimiento(getInitialDueDateStr(liveData));
        setConcejalia(liveData.concejalia || '');
      }
    });

    return () => unsubscribe();
  }, [tarea.id]);

  useEffect(() => {
    // Escape key listener
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  const handleBlurExternalRef = async () => {
    if (!tarea.id) return;
    try {
      const taskRef = doc(db, 'tareas', tarea.id);
      await updateDoc(taskRef, {
        externalReference: externalReference.trim()
      });
    } catch (error) {
      console.error("Error updating externalReference on blur: ", error);
    }
  };

  const handleSave = async () => {
    if (!tarea.id) return;
    setIsSaving(true);
    try {
      const parsedMin = parseInt(tiempoEstimado, 10);
      const finalMinutes = !isNaN(parsedMin) && parsedMin > 0 ? parsedMin : 15;
      const calculatedDueDate = fechaVencimiento ? new Date(fechaVencimiento).getTime() : Date.now();

      const taskRef = doc(db, 'tareas', tarea.id);
      await updateDoc(taskRef, {
        titulo,
        notas,
        status,
        estimatedTimeMin: finalMinutes,
        dueDate: calculatedDueDate,
        isInMyDay,
        tiempo_estimado: `${finalMinutes}m`,
        completada: status === 'completed',
        fecha_vencimiento: calculatedDueDate,
        prioridad,
        blockedBy: status === 'waiting_on_third_party' ? blockedBy : '',
        blockingReason: status === 'waiting_on_third_party' ? blockingReason : '',
        externalReference: externalReference.trim(),
        ...(concejalia ? { concejalia: concejalia as any } : { concejalia: null }),
      });
      // Autocierre inmediato tras guardar con éxito
      onClose();
    } catch (error) {
      console.error("Error updating task: ", error);
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!tarea.id) return;
    if (!window.confirm('¿Eliminar esta tarea?')) return;
    try {
      await deleteDoc(doc(db, 'tareas', tarea.id));
      onClose();
    } catch (error) {
      console.error("Error deleting task: ", error);
    }
  };

  const handleCompleteToggle = async () => {
    if (!tarea.id) return;
    const newStatus: TaskStatus = status === 'completed' ? 'todo' : 'completed';
    setStatus(newStatus);
    try {
      const taskRef = doc(db, 'tareas', tarea.id);
      await updateDoc(taskRef, { status: newStatus, completada: newStatus === 'completed' });
    } catch (error) {
      console.error("Error toggling task completion status: ", error);
    }
  };

  return (
    <div ref={panelRef} className="flex flex-col h-full bg-white dark:bg-slate-800 w-full transition-colors duration-300">
      
      {/* Header */}
      <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-100 dark:border-slate-700">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Detalles de la Tarea</h2>
        <button 
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        
        {/* Title */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Título</label>
          <input 
            type="text"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            className="w-full bg-transparent border-none text-2xl font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-0 p-0"
            placeholder="Ej: Preparar presentación"
          />
        </div>

        {/* Action Quick Toggle */}
        <button 
          onClick={handleCompleteToggle}
          className={`w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors ${
            status === 'completed'
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 hover:bg-emerald-200'
              : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 hover:bg-indigo-100'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
          {status === 'completed' ? 'Completada (Marcar como pendiente)' : 'Marcar como completada'}
        </button>

        {/* Status Selector */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Estado</label>
          <select
            value={status}
            onChange={async (e) => {
              const newStatus = e.target.value as TaskStatus;
              setStatus(newStatus);
              if (tarea.id) {
                try {
                  const taskRef = doc(db, 'tareas', tarea.id);
                  await updateDoc(taskRef, {
                    status: newStatus,
                    completada: newStatus === 'completed'
                  });
                } catch (error) {
                  console.error("Error updating status in Firestore: ", error);
                }
              }
            }}
            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
          >
            <option value="todo">Pendiente</option>
            <option value="in_progress">En curso</option>
            <option value="waiting_on_third_party">En espera de terceros</option>
            <option value="completed">Completada</option>
          </select>
        </div>

        {/* Conditional Blocking Fields for 'waiting_on_third_party' */}
        {status === 'waiting_on_third_party' && (
          <div className="p-4 bg-amber-50/70 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-2xl space-y-4 animate-fade-in transition-all">
            <div>
              <label className="block text-sm font-semibold text-amber-900 dark:text-amber-300 mb-2">
                Retenido por / Departamento *
              </label>
              <input 
                type="text"
                value={blockedBy}
                onChange={(e) => setBlockedBy(e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border border-amber-300 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors"
                placeholder="Ej. Intervención, Contratación, Policía Local"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-amber-900 dark:text-amber-300 mb-2">
                Motivo / Trámite esperado *
              </label>
              <input 
                type="text"
                value={blockingReason}
                onChange={(e) => setBlockingReason(e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border border-amber-300 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors"
                placeholder="Ej. Esperando informe de fiscalización, Pendiente de firma"
              />
            </div>
          </div>
        )}

        {/* Is In My Day Checkbox */}
        <div className="flex items-center">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input 
              type="checkbox"
              checked={isInMyDay}
              onChange={(e) => setIsInMyDay(e.target.checked)}
              className="w-5 h-5 text-indigo-600 rounded border-slate-300 dark:border-slate-700 focus:ring-indigo-500"
            />
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Incluir en "Mi Día"</span>
          </label>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Anotaciones</label>
          <textarea 
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={4}
            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors resize-none"
            placeholder="Detalles, enlaces, subtareas..."
          ></textarea>
        </div>

        {/* External Document Reference / Location */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Ref. Documental / Ubicación
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <input 
              type="text"
              value={externalReference}
              onChange={(e) => setExternalReference(e.target.value)}
              onBlur={handleBlurExternalRef}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-11 pr-4 py-3 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors font-mono text-sm"
              placeholder="Ej. Nº Expediente Gestiona o Ruta Local"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Date */}
          <div>
            <CustomDatePicker 
              label="Fecha límite"
              value={fechaVencimiento}
              onChange={(dateStr) => setFechaVencimiento(dateStr)}
            />
          </div>
          
          {/* Time (Minutes) */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Estimado (min)</label>
            <input 
              type="number"
              min="1"
              value={tiempoEstimado}
              onChange={(e) => setTiempoEstimado(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
              placeholder="15"
            />
          </div>
        </div>

        {/* Priority */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Prioridad</label>
          <div className="flex gap-2">
            {(['baja', 'media', 'alta'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPrioridad(p)}
                className={`flex-1 py-2 rounded-xl font-medium text-sm transition-all border ${
                  prioridad === p 
                    ? (p === 'alta' ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/30 dark:border-red-800/50 dark:text-red-400' :
                       p === 'media' ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/30 dark:border-amber-800/50 dark:text-amber-400' :
                       'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-800/50 dark:text-emerald-400')
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>
        
        {/* Concejalia */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Concejalía</label>
          <select
            value={concejalia}
            onChange={(e) => setConcejalia(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors font-medium"
          >
            <option value="">Selecciona Concejalía...</option>
            {concejaliasList.map((cName) => (
              <option key={cName} value={cName}>{cName}</option>
            ))}
          </select>
        </div>

      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-100 dark:border-slate-700 flex flex-col gap-3 bg-slate-50/50 dark:bg-slate-800/50">
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="w-full bg-indigo-600 dark:bg-indigo-500 text-white px-6 py-3 rounded-xl font-semibold shadow-md shadow-indigo-200 dark:shadow-none hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-all disabled:opacity-70 flex items-center justify-center gap-2"
        >
          {isSaving ? 'Guardando...' : 'Guardar Cambios'}
        </button>
        <button 
          onClick={handleDelete}
          className="w-full flex items-center justify-center gap-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 px-4 py-3 rounded-xl transition-colors font-medium text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          Eliminar Tarea
        </button>
      </div>

    </div>
  );
}
