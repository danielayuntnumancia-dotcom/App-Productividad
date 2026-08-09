import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { Tarea } from '../types';
import { User } from 'firebase/auth';
import TaskCreateModal from './TaskCreateModal';

interface Props {
  user: User;
  searchQuery?: string;
  onSelectTask: (tarea: Tarea | null) => void;
}

export default function MiDiaView({ user, searchQuery = '', onSelectTask }: Props) {
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, 'tareas'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tareasData: Tarea[] = [];
      snapshot.forEach((doc) => {
        tareasData.push({ id: doc.id, ...doc.data() } as Tarea);
      });
      // Filtrar tareas que pertenecen a "Mi Día" (isInMyDay !== false) y no están completadas
      setTareas(tareasData.filter(t => (t.isInMyDay !== false) && t.status !== 'completed' && !t.completada));
    });

    return () => unsubscribe();
  }, [user]);

  const handleCompleteTask = async (taskId: string) => {
    try {
      const taskRef = doc(db, 'tareas', taskId);
      await updateDoc(taskRef, {
        status: 'completed',
        completada: true
      });
    } catch (error) {
      console.error("Error updating document: ", error);
    }
  };

  const handleStartTask = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const taskRef = doc(db, 'tareas', taskId);
      await updateDoc(taskRef, {
        status: 'in_progress'
      });
    } catch (error) {
      console.error("Error starting task: ", error);
    }
  };

  // Convert estimated time to minutes (default 15 if empty or 0)
  const getMinutes = (task: Tarea): number => {
    if (typeof task.estimatedTimeMin === 'number' && !isNaN(task.estimatedTimeMin) && task.estimatedTimeMin > 0) {
      return task.estimatedTimeMin;
    }
    if (task.tiempo_estimado) {
      const isHours = task.tiempo_estimado.includes('h');
      const val = parseInt(task.tiempo_estimado.replace(/\D/g, ''), 10);
      if (!isNaN(val) && val > 0) return isHours ? val * 60 : val;
    }
    return 15; // Regla de negocio: 15 min por defecto si no está definido o es 0
  };

  const filteredTareas = tareas.filter(t => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      t.titulo.toLowerCase().includes(query) ||
      (t.notas && t.notas.toLowerCase().includes(query))
    );
  });

  // Tareas activas de Mi Día (isInMyDay !== false) para el cálculo de capacidad
  const activeMyDayTasks = tareas.filter(t => (t.isInMyDay !== false) && t.status !== 'completed' && !t.completada);
  const totalMinutes = activeMyDayTasks.reduce((acc, task) => acc + getMinutes(task), 0);
  const maxMinutes = 480; // 8 horas = 480 minutos
  const capacityPercent = Math.min((totalMinutes / maxMinutes) * 100, 100);

  const formatHours = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0 && m === 0) return '0m';
    return `${h > 0 ? h + 'h ' : ''}${m > 0 ? m + 'm' : ''}`.trim();
  };

  const getPriorityStyle = (prioridad?: string) => {
    switch(prioridad) {
      case 'alta': return 'bg-red-50/80 border-red-100 dark:bg-red-900/10 dark:border-red-900/30';
      case 'media': return 'bg-amber-50/80 border-amber-100 dark:bg-amber-900/10 dark:border-amber-900/30';
      case 'baja': return 'bg-emerald-50/80 border-emerald-100 dark:bg-emerald-900/10 dark:border-emerald-900/30';
      default: return 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700';
    }
  };

  const getStatusBadge = (status?: string, blockedBy?: string) => {
    switch(status) {
      case 'in_progress':
        return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">En curso</span>;
      case 'waiting_on_third_party':
        return (
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 flex items-center gap-1 border border-amber-300/50 dark:border-amber-700/50">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            {blockedBy ? `Retenido: ${blockedBy}` : 'En espera de terceros'}
          </span>
        );
      case 'completed':
        return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Completada</span>;
      default:
        return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">Pendiente</span>;
    }
  };

  const getConcejaliaBg = (concejalia?: string) => {
    switch(concejalia) {
      case 'Medioambiente': return 'bg-emerald-500';
      case 'Seguridad': return 'bg-blue-500';
      case 'Transporte': return 'bg-purple-500';
      case 'Hacienda': return 'bg-amber-500';
      case 'Entidades privadas': return 'bg-slate-500';
      default: return 'bg-slate-50 dark:bg-slate-800/50 border-r border-slate-100 dark:border-slate-700/50';
    }
  };

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto">
      <div className="max-w-4xl mx-auto w-full flex flex-col gap-8 md:gap-10">
        
        {/* HEADER & CAPACITY BAR */}
        <section className="flex flex-col gap-4 animate-fade-in-up">
          <div className="justify-between items-end hidden md:flex">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 transition-colors duration-300">Mi Día</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 transition-colors duration-300">
              {new Date().toLocaleDateString('es-ES', { weekday: 'long', month: 'short', day: 'numeric' })}
            </p>
          </div>
          
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider transition-colors duration-300">Capacidad Diaria</span>
              <span className="text-sm text-slate-800 dark:text-slate-100 font-bold transition-colors duration-300">
                {formatHours(totalMinutes)} <span className="text-slate-400 dark:text-slate-500 font-normal">/ 8h</span>
              </span>
            </div>
            <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden relative transition-colors duration-300">
              <div 
                className={`h-full rounded-full transition-all duration-1000 ease-out ${capacityPercent > 90 ? 'bg-red-500' : 'bg-indigo-500'}`} 
                style={{ width: `${capacityPercent}%` }}
              ></div>
            </div>
          </div>
        </section>

        {/* ADD TASK BUTTON */}
        <section className="animate-fade-in-up" style={{ animationDelay: '100ms' }}>
          <button 
            onClick={() => setIsCreatingTask(true)}
            className="w-full flex items-center justify-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-500 rounded-2xl p-4 shadow-sm text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 font-semibold transition-all duration-300"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
            Nueva Tarea
          </button>
        </section>

        {/* PLANIFICADOR (Task List) */}
        <section className="flex flex-col gap-4 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
          {filteredTareas.length === 0 ? (
            <p className="text-center text-slate-500 dark:text-slate-400 mt-8 transition-colors duration-300">No hay tareas para hoy. ¡Disfruta tu tiempo libre!</p>
          ) : (
            filteredTareas.map(tarea => {
              const rawDueDate = tarea.dueDate || tarea.fecha_vencimiento;
              const isOverdue = !!rawDueDate && rawDueDate < Date.now() && tarea.status !== 'completed' && !tarea.completada;

              const cardStyle = isOverdue 
                ? 'bg-red-50 border-red-500 dark:bg-red-900/20 dark:border-red-500/80' 
                : (tarea.status === 'in_progress'
                    ? 'bg-indigo-50/80 border-indigo-500 dark:bg-indigo-900/10 dark:border-indigo-500 shadow-indigo-100 dark:shadow-none'
                    : getPriorityStyle(tarea.prioridad));

              return (
                <div 
                  key={tarea.id} 
                  data-task-card="true"
                  className={`rounded-2xl border shadow-sm flex items-stretch group hover:shadow-md transition-all duration-300 cursor-pointer overflow-hidden ${cardStyle}`}
                  onClick={() => onSelectTask(tarea)}
                >
                  <div className={`w-14 sm:w-16 flex items-start justify-center pt-5 shrink-0 transition-colors ${getConcejaliaBg(tarea.concejalia)}`}>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleCompleteTask(tarea.id!); }}
                      className={`w-6 h-6 mt-0.5 rounded-full border-2 flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                        tarea.concejalia
                          ? 'border-white/60 hover:border-white text-white'
                          : 'border-slate-300 dark:border-slate-600 hover:border-indigo-500 dark:hover:border-indigo-400 text-indigo-600 dark:text-indigo-400'
                      }`}
                    >
                      <svg className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                    </button>
                  </div>
                  <div className="flex-1 min-w-0 p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-slate-800 dark:text-slate-100 truncate transition-colors duration-300">{tarea.titulo}</h3>
                      <div className="flex items-center gap-2 shrink-0">
                        {(!tarea.status || tarea.status === 'todo') && (
                          <button
                            onClick={(e) => handleStartTask(tarea.id!, e)}
                            className="px-2.5 py-1 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all duration-200 flex items-center gap-1 shrink-0 cursor-pointer"
                            title="Iniciar Tarea rápida"
                          >
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                            </svg>
                            Iniciar
                          </button>
                        )}
                        {getStatusBadge(tarea.status, tarea.blockedBy)}
                      </div>
                    </div>
                    {tarea.notas && (
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                        {tarea.notas}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-3 mt-3">
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-white/50 dark:bg-slate-800/50 px-2 py-1 rounded-md flex items-center gap-1 transition-colors duration-300">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        {tarea.estimatedTimeMin ? `${tarea.estimatedTimeMin} min` : tarea.tiempo_estimado}
                      </span>
                      {tarea.concejalia && (
                         <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-white/50 dark:bg-slate-800/50 px-2 py-1 rounded-md transition-colors duration-300">
                           {tarea.concejalia}
                         </span>
                      )}
                      {rawDueDate && (
                        <span className={`text-xs font-medium px-2 py-1 rounded-md flex items-center gap-1.5 transition-colors duration-300 ${
                          isOverdue 
                            ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 font-semibold' 
                            : 'text-slate-500 dark:text-slate-400 bg-white/50 dark:bg-slate-800/50'
                        }`}>
                          {isOverdue && (
                            <svg className="w-3.5 h-3.5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                          )}
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                          {new Date(rawDueDate).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </section>

      </div>
      
      {isCreatingTask && (
        <TaskCreateModal 
          user={user} 
          onClose={() => setIsCreatingTask(false)} 
        />
      )}
    </div>
  );
}
