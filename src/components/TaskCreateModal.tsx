import React, { useState, useEffect } from 'react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { User } from 'firebase/auth';
import { Tarea } from '../types';

interface Props {
  user: User;
  onClose: () => void;
}

export default function TaskCreateModal({ user, onClose }: Props) {
  const [titulo, setTitulo] = useState('');
  const [notas, setNotas] = useState('');
  const [tiempoEstimado, setTiempoEstimado] = useState('30m');
  const [prioridad, setPrioridad] = useState<'baja' | 'media' | 'alta'>('media');
  const [concejalia, setConcejalia] = useState<'Medioambiente' | 'Seguridad' | 'Transporte' | 'Hacienda' | 'Entidades privadas' | ''>('');
  const [fechaVencimiento, setFechaVencimiento] = useState<string>('');
  
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Add escape key listener
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleSave = async () => {
    if (!titulo.trim()) return;
    setIsSaving(true);
    try {
      const newTarea: Omit<Tarea, 'id'> = {
        userId: user.uid,
        titulo: titulo.trim(),
        notas,
        tiempo_estimado: tiempoEstimado,
        prioridad,
        ...(concejalia ? { concejalia: concejalia as any } : {}),
        fecha_vencimiento: fechaVencimiento ? new Date(fechaVencimiento).getTime() : null,
        completada: false,
        fecha_asignada: Date.now(),
      };
      await addDoc(collection(db, 'tareas'), newTarea);
      onClose();
    } catch (error) {
      console.error("Error creating task: ", error);
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      ></div>
      
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-full animate-fade-in-up border border-slate-100 dark:border-slate-700 transition-colors duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Nueva Tarea</h2>
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
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Título *</label>
            <input 
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
              placeholder="Ej: Preparar presentación"
              autoFocus
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Anotaciones (Google Keep style)</label>
            <textarea 
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={4}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors resize-none"
              placeholder="Detalles, enlaces, subtareas..."
            ></textarea>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
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
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Tiempo estimado</label>
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
            <div className="flex gap-3">
              {(['baja', 'media', 'alta'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPrioridad(p)}
                  className={`flex-1 py-2.5 rounded-xl font-medium text-sm transition-all border ${
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
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Concejalía (Opcional)</label>
            <select
              value={concejalia}
              onChange={(e) => setConcejalia(e.target.value as any)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
            >
              <option value="">Selecciona una concejalía...</option>
              <option value="Medioambiente">Medioambiente</option>
              <option value="Seguridad">Seguridad</option>
              <option value="Transporte">Transporte</option>
              <option value="Hacienda">Hacienda</option>
              <option value="Entidades privadas">Entidades privadas</option>
            </select>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t border-slate-100 dark:border-slate-700 flex justify-end items-center bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex gap-3">
            <button 
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              Cancelar
            </button>
            <button 
              onClick={handleSave}
              disabled={isSaving || !titulo.trim()}
              className="bg-indigo-600 dark:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-semibold shadow-md shadow-indigo-200 dark:shadow-none hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-all disabled:opacity-70 flex items-center gap-2"
            >
              {isSaving ? 'Guardando...' : 'Crear Tarea'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
