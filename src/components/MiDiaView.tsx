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
      // Sort: incomplete first, then by assigned date or created time. 
      // For now, let's just show incomplete ones and sort by date. 
      setTareas(tareasData.filter(t => !t.completada));
    });

    return () => unsubscribe();
  }, [user]);

  const handleCompleteTask = async (taskId: string) => {
    try {
      const taskRef = doc(db, 'tareas', taskId);
      await updateDoc(taskRef, {
        completada: true
      });
    } catch (error) {
      console.error("Error updating document: ", error);
    }
  };

  // Convert "Xh" or "Ym" to minutes
  const getMinutes = (timeStr: string) => {
    const isHours = timeStr.includes('h');
    const val = parseInt(timeStr.replace(/\D/g, ''), 10);
    return isHours ? val * 60 : val;
  };

  const filteredTareas = tareas.filter(t => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      t.titulo.toLowerCase().includes(query) ||
      (t.notas && t.notas.toLowerCase().includes(query))
    );
  });

  const totalMinutes = filteredTareas.reduce((acc, task) => acc + getMinutes(task.tiempo_estimado), 0);
  const maxMinutes = 8 * 60;
  const capacityPercent = Math.min((totalMinutes / maxMinutes) * 100, 100);

  const formatHours = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h > 0 ? h + 'h ' : ''}${m > 0 ? m + 'm' : ''}`.trim() || '0m';
  };

  const getPriorityStyle = (prioridad?: string) => {
    switch(prioridad) {
      case 'alta': return 'bg-red-50/80 border-red-100 dark:bg-red-900/10 dark:border-red-900/30';
      case 'media': return 'bg-amber-50/80 border-amber-100 dark:bg-amber-900/10 dark:border-amber-900/30';
      case 'baja': return 'bg-emerald-50/80 border-emerald-100 dark:bg-emerald-900/10 dark:border-emerald-900/30';
      default: return 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700';
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
            filteredTareas.map(tarea => (
              <div 
                key={tarea.id} 
                className={`rounded-2xl border shadow-sm flex items-stretch group hover:shadow-md transition-all duration-300 cursor-pointer overflow-hidden ${getPriorityStyle(tarea.prioridad)}`}
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
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 truncate transition-colors duration-300">{tarea.titulo}</h3>
                  {tarea.notas && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                      {tarea.notas}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-3 mt-3">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-white/50 dark:bg-slate-800/50 px-2 py-1 rounded-md flex items-center gap-1 transition-colors duration-300">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                      {tarea.tiempo_estimado}
                    </span>
                    {tarea.concejalia && (
                       <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-white/50 dark:bg-slate-800/50 px-2 py-1 rounded-md transition-colors duration-300">
                         {tarea.concejalia}
                       </span>
                    )}
                    {tarea.fecha_vencimiento && (
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-white/50 dark:bg-slate-800/50 px-2 py-1 rounded-md flex items-center gap-1 transition-colors duration-300">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                        {new Date(tarea.fecha_vencimiento).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
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
