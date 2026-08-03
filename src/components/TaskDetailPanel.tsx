import React, { useState, useEffect } from 'react';
import { Tarea } from '../types';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

interface Props {
  tarea: Tarea;
  onClose: () => void;
}

export default function TaskDetailPanel({ tarea, onClose }: Props) {
  const [titulo, setTitulo] = useState(tarea.titulo);
  const [notas, setNotas] = useState(tarea.notas || '');
  const [tiempoEstimado, setTiempoEstimado] = useState(tarea.tiempo_estimado);
  
  // Handle legacy numeric priorities
  const defaultPriority = typeof tarea.prioridad === 'string' && ['baja', 'media', 'alta'].includes(tarea.prioridad) 
    ? tarea.prioridad as 'baja' | 'media' | 'alta'
    : 'media';
    
  const [prioridad, setPrioridad] = useState<'baja' | 'media' | 'alta'>(defaultPriority);
  
  const [fechaVencimiento, setFechaVencimiento] = useState<string>(
    tarea.fecha_vencimiento ? new Date(tarea.fecha_vencimiento).toISOString().split('T')[0] : ''
  );
  
  const defaultConcejalia = tarea.concejalia || '';
  const [concejalia, setConcejalia] = useState<'Medioambiente' | 'Seguridad' | 'Transporte' | 'Hacienda' | 'Entidades privadas' | ''>(defaultConcejalia);
  
  const [isSaving, setIsSaving] = useState(false);

  // Update local state when tarea prop changes
  useEffect(() => {
    setTitulo(tarea.titulo);
    setNotas(tarea.notas || '');
    setTiempoEstimado(tarea.tiempo_estimado);
    setPrioridad(
      typeof tarea.prioridad === 'string' && ['baja', 'media', 'alta'].includes(tarea.prioridad) 
        ? tarea.prioridad as 'baja' | 'media' | 'alta'
        : 'media'
    );
    setFechaVencimiento(tarea.fecha_vencimiento ? new Date(tarea.fecha_vencimiento).toISOString().split('T')[0] : '');
    setConcejalia(tarea.concejalia || '');
  }, [tarea]);

  useEffect(() => {
    // Add escape key listener
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleSave = async () => {
    if (!tarea.id) return;
    setIsSaving(true);
    try {
      const taskRef = doc(db, 'tareas', tarea.id);
      await updateDoc(taskRef, {
        titulo,
        notas,
        tiempo_estimado: tiempoEstimado,
        prioridad,
        ...(concejalia ? { concejalia: concejalia as any } : {}),
        fecha_vencimiento: fechaVencimiento ? new Date(fechaVencimiento).getTime() : null,
      });
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

  const handleComplete = async () => {
    if (!tarea.id) return;
    try {
      const taskRef = doc(db, 'tareas', tarea.id);
      await updateDoc(taskRef, { completada: !tarea.completada });
      onClose();
    } catch (error) {
      console.error("Error completing task: ", error);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-800 w-full transition-colors duration-300">
      
      {/* Header */}
      <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-100 dark:border-slate-700">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Detalles</h2>
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
          onClick={handleComplete}
          className={`w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors ${
            tarea.completada 
              ? 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
              : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
          {tarea.completada ? 'Marcar como pendiente' : 'Completar Tarea'}
        </button>

        {/* Notes */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Anotaciones</label>
          <textarea 
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={5}
            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors resize-none"
            placeholder="Detalles, enlaces, subtareas..."
          ></textarea>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Date */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Fecha límite</label>
            <input 
              type="date"
              value={fechaVencimiento}
              onChange={(e) => setFechaVencimiento(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors [color-scheme:light] dark:[color-scheme:dark]"
            />
          </div>
          
          {/* Time */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Estimado</label>
            <input 
              type="text"
              value={tiempoEstimado}
              onChange={(e) => setTiempoEstimado(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
              placeholder="Ej: 30m, 2h"
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
            onChange={(e) => setConcejalia(e.target.value as any)}
            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
          >
            <option value="">Selecciona...</option>
            <option value="Medioambiente">Medioambiente</option>
            <option value="Seguridad">Seguridad</option>
            <option value="Transporte">Transporte</option>
            <option value="Hacienda">Hacienda</option>
            <option value="Entidades privadas">Entidades privadas</option>
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
