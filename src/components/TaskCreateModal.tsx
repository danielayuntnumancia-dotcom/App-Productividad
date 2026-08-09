import React, { useState, useEffect } from 'react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { User } from 'firebase/auth';
import { Tarea, TaskStatus } from '../types';
import CustomDatePicker from './CustomDatePicker';

interface Props {
  user: User;
  onClose: () => void;
}

export default function TaskCreateModal({ user, onClose }: Props) {
  const [titulo, setTitulo] = useState('');
  const [notas, setNotas] = useState('');
  const [tiempoEstimado, setTiempoEstimado] = useState('15');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [isInMyDay, setIsInMyDay] = useState<boolean>(true);
  const [blockedBy, setBlockedBy] = useState('');
  const [blockingReason, setBlockingReason] = useState('');
  const [prioridad, setPrioridad] = useState<'baja' | 'media' | 'alta'>('media');
  const [concejalia, setConcejalia] = useState<'Medioambiente' | 'Seguridad' | 'Transporte' | 'Hacienda' | 'Entidades privadas' | ''>('');
  const [fechaVencimiento, setFechaVencimiento] = useState<string>('');
  
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim() || isSaving) return;

    setIsSaving(true);
    try {
      const parsedMin = parseInt(tiempoEstimado, 10);
      const finalMinutes = !isNaN(parsedMin) && parsedMin > 0 ? parsedMin : 15;
      const calculatedDueDate = fechaVencimiento ? new Date(fechaVencimiento).getTime() : Date.now();

      await addDoc(collection(db, 'tareas'), {
        titulo,
        notas,
        completada: status === 'completed',
        status,
        estimatedTimeMin: finalMinutes,
        dueDate: calculatedDueDate,
        isInMyDay: isInMyDay ?? true,
        blockedBy: status === 'waiting_on_third_party' ? blockedBy : '',
        blockingReason: status === 'waiting_on_third_party' ? blockingReason : '',
        tiempo_estimado: `${finalMinutes}m`,
        fecha_vencimiento: calculatedDueDate,
        prioridad,
        ...(concejalia ? { concejalia } : {}),
        fecha_creacion: Date.now(),
        userId: user.uid
      });
      onClose();
    } catch (error) {
      console.error("Error creating task: ", error);
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity animate-fade-in"
        onClick={onClose}
      ></div>

      <div className="relative bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-700 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-up transition-colors duration-300">
        
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Nueva Tarea</h2>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Estado de la Tarea</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TaskStatus)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                >
                  <option value="todo">Pendiente</option>
                  <option value="in_progress">En curso</option>
                  <option value="waiting_on_third_party">En espera de terceros</option>
                  <option value="completed">Completada</option>
                </select>
              </div>

              <div className="flex items-center">
                <label className="flex items-center gap-3 cursor-pointer mt-6 select-none">
                  <input 
                    type="checkbox"
                    checked={isInMyDay}
                    onChange={(e) => setIsInMyDay(e.target.checked)}
                    className="w-5 h-5 text-indigo-600 rounded border-slate-300 dark:border-slate-700 focus:ring-indigo-500"
                  />
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Incluir en "Mi Día"</span>
                </label>
              </div>
            </div>

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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <CustomDatePicker 
                  label="Fecha límite"
                  value={fechaVencimiento}
                  onChange={(dateStr) => setFechaVencimiento(dateStr)}
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Tiempo estimado (minutos)</label>
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

            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Prioridad</label>
              <div className="flex gap-3">
                {(['baja', 'media', 'alta'] as const).map(p => (
                  <button
                    key={p}
                    type="button"
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
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                disabled={isSaving || !titulo.trim()}
                className="bg-indigo-600 dark:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-semibold shadow-md shadow-indigo-200 dark:shadow-none hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-all disabled:opacity-70 flex items-center gap-2"
              >
                {isSaving ? 'Guardando...' : 'Crear Tarea'}
              </button>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
}
