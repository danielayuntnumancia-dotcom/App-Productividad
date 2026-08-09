import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { Tarea } from '../types';
import { User } from 'firebase/auth';
import TaskCreateModal from './TaskCreateModal';

interface Props {
  user: User;
  searchQuery?: string;
  onSelectTask: (tarea: Tarea | null) => void;
}

export default function RegistroView({ user, searchQuery = '', onSelectTask }: Props) {
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [filter, setFilter] = useState<'pendientes' | 'completadas' | 'todas'>('pendientes');

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
      
      // Sort: high priority first, then date
      tareasData.sort((a, b) => {
        const priorityScore: Record<string, number> = { 'alta': 3, 'media': 2, 'baja': 1 };
        const scoreA = priorityScore[a.prioridad as string] || 2;
        const scoreB = priorityScore[b.prioridad as string] || 2;
        if (scoreA !== scoreB) return scoreB - scoreA;
        const dateA = a.dueDate || a.fecha_vencimiento || 0;
        const dateB = b.dueDate || b.fecha_vencimiento || 0;
        return dateA - dateB;
      });
      
      setTareas(tareasData);
    });

    return () => unsubscribe();
  }, [user]);

  const handleCompleteTask = async (taskId: string, completada: boolean) => {
    try {
      const taskRef = doc(db, 'tareas', taskId);
      const newStatus = completada ? 'todo' : 'completed';
      await updateDoc(taskRef, {
        status: newStatus,
        completada: !completada
      });
    } catch (error) {
      console.error("Error updating document: ", error);
    }
  };

  const filteredTareas = tareas.filter(t => {
    let matchFilter = true;
    const isCompleted = t.status === 'completed' || !!t.completada;
    if (filter === 'pendientes') matchFilter = !isCompleted;
    else if (filter === 'completadas') matchFilter = isCompleted;

    if (!matchFilter) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.titulo.toLowerCase().includes(q) ||
      (t.notas && t.notas.toLowerCase().includes(q))
    );
  });

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
      case 'Medioambiente': return 'bg-emerald-500 text-white';
      case 'Seguridad': return 'bg-blue-500 text-white';
      case 'Transporte': return 'bg-purple-500 text-white';
      case 'Hacienda': return 'bg-amber-500 text-white';
      case 'Entidades privadas': return 'bg-slate-500 text-white';
      default: return 'bg-slate-50 dark:bg-slate-800/50 border-r border-slate-100 dark:border-slate-700/50';
    }
  };

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto">
      <div className="max-w-4xl mx-auto w-full flex flex-col gap-6 md:gap-8">
        
        {/* HEADER */}
        <section className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 animate-fade-in-up">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 transition-colors duration-300">Registro de Tareas</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 transition-colors duration-300 mt-1">
              {tareas.length} tareas totales
            </p>
          </div>
          
          <div className="flex bg-slate-200/50 dark:bg-slate-700/50 p-1 rounded-xl transition-colors duration-300">
            {(['pendientes', 'completadas', 'todas'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  filter === f 
                    ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-sm' 
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </section>

        {/* ADD TASK BUTTON */}
        <section className="animate-fade-in-up" style={{ animationDelay: '50ms' }}>
          <button 
            onClick={() => setIsCreatingTask(true)}
            className="w-full flex items-center justify-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-500 rounded-2xl p-4 shadow-sm text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 font-semibold transition-all duration-300"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
            Nueva Tarea
          </button>
        </section>

        {/* TASK LIST */}
        <section className="flex flex-col gap-3 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
          {filteredTareas.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 transition-colors duration-300">
              <svg className="w-16 h-16 mx-auto text-slate-300 dark:text-slate-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
              <p className="text-slate-500 dark:text-slate-400 font-medium">No hay tareas en esta vista</p>
            </div>
          ) : (
            filteredTareas.map(tarea => (
              <div 
                key={tarea.id} 
                data-task-card="true"
                className={`rounded-2xl border shadow-sm flex items-stretch group hover:shadow-md transition-all duration-300 cursor-pointer overflow-hidden ${tarea.completada ? 'opacity-60 grayscale-[0.5]' : ''} ${getPriorityStyle(tarea.prioridad)}`}
                onClick={() => onSelectTask(tarea)}
              >
                <div className={`w-14 sm:w-16 flex items-start justify-center pt-5 shrink-0 transition-colors ${getConcejaliaBg(tarea.concejalia)}`}>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleCompleteTask(tarea.id!, tarea.completada); }}
                    className={`w-6 h-6 mt-0.5 rounded-full border-2 flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                      tarea.completada 
                        ? (tarea.concejalia ? 'bg-white text-black border-white' : 'bg-indigo-500 border-indigo-500 text-white') 
                        : (tarea.concejalia ? 'border-white/60 hover:border-white text-white' : 'border-slate-300 dark:border-slate-600 hover:border-indigo-500 dark:hover:border-indigo-400 text-indigo-600 dark:text-indigo-400')
                    }`}
                  >
                    <svg className={`w-4 h-4 ${tarea.completada ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                  </button>
                </div>
                <div className="flex-1 min-w-0 p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className={`font-semibold truncate transition-colors duration-300 ${tarea.completada ? 'text-slate-500 dark:text-slate-400 line-through' : 'text-slate-800 dark:text-slate-100'}`}>
                      {tarea.titulo}
                    </h3>
                    {getStatusBadge(tarea.status, tarea.blockedBy)}
                  </div>
                  {tarea.notas && (
                    <p className={`text-sm mt-1 line-clamp-2 leading-relaxed ${tarea.completada ? 'text-slate-400 dark:text-slate-500' : 'text-slate-500 dark:text-slate-400'}`}>
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
                      <span className={`text-xs font-medium bg-white/50 dark:bg-slate-800/50 px-2 py-1 rounded-md flex items-center gap-1 transition-colors duration-300 ${
                        tarea.fecha_vencimiento < Date.now() && !tarea.completada ? 'text-red-500 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'
                      }`}>
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
