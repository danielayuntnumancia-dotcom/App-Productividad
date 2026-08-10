import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { Tarea, Project } from '../types';
import { User } from 'firebase/auth';
import TaskCreateModal from './TaskCreateModal';
import TemplateSelectorModal from './TemplateSelectorModal';
import { getConcejaliaStyle } from '../utils/concejaliaColors';

interface Props {
  user: User;
  searchQuery?: string;
  onSelectTask: (tarea: Tarea | null) => void;
  onSelectProject?: (project: Project | null) => void;
}

export default function MiDiaView({ user, searchQuery = '', onSelectTask, onSelectProject }: Props) {
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [expandedExpedientes, setExpandedExpedientes] = useState<Set<string>>(new Set());
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [isCreatingExpediente, setIsCreatingExpediente] = useState(false);

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
      const valid = tareasData.filter(t => !(t as any).isTemplate && !(t as any).isConcejalia && !(t as any).isProject && (t.isInMyDay !== false) && t.status !== 'completed' && !t.completada);
      setTareas(valid);

      // Expandir por defecto los expedientes encontrados
      const pIds = new Set(valid.map(t => t.projectId).filter(Boolean) as string[]);
      setExpandedExpedientes(pIds);
    });

    return () => unsubscribe();
  }, [user]);

  const toggleExpediente = (projectId: string) => {
    setExpandedExpedientes(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

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

  const handleDeleteTaskDirect = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("¿Eliminar esta tarea definitivamente?")) return;
    try {
      await deleteDoc(doc(db, 'tareas', taskId));
    } catch (err) {
      console.error("Error deleting task directly: ", err);
    }
  };

  const handleDeleteExpedienteDirect = async (projectId: string, projectName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`¿Eliminar el expediente "${projectName}" y TODAS sus tareas asociadas?`)) return;
    try {
      const batch = writeBatch(db);
      const expedienteTasks = tareas.filter(t => t.projectId === projectId);
      expedienteTasks.forEach(t => {
        if (t.id) batch.delete(doc(db, 'tareas', t.id));
      });
      await batch.commit();
    } catch (err) {
      console.error("Error deleting expediente batch: ", err);
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

  const getTaskSortOrder = (t: Tarea): number => {
    const text = t.title || t.titulo || '';
    const match = text.match(/^(\d+)[\.\s]/);
    if (match) {
      return parseInt(match[1], 10);
    }
    if (typeof t.orderIndex === 'number') return t.orderIndex;
    return 9999;
  };

  const sortTasksNaturally = (tasks: Tarea[]): Tarea[] => {
    return [...tasks].sort((a, b) => {
      const orderA = getTaskSortOrder(a);
      const orderB = getTaskSortOrder(b);
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      const titleA = a.titulo || a.title || '';
      const titleB = b.titulo || b.title || '';
      return titleA.localeCompare(titleB, undefined, { numeric: true, sensitivity: 'base' });
    });
  };

  // Agrupar tareas por expediente
  const expedientesMap: Record<string, { id: string; name: string; concejalia?: string; code?: string; linkedExpedientId?: string; tasks: Tarea[] }> = {};
  const independentTasks: Tarea[] = [];

  filteredTareas.forEach(t => {
    if (t.projectId && t.projectName) {
      if (!expedientesMap[t.projectId]) {
        expedientesMap[t.projectId] = {
          id: t.projectId,
          name: t.projectName,
          concejalia: t.concejalia || t.projectConcejalia || t.projectMasterCategory || 'General',
          code: t.expedientCode,
          linkedExpedientId: t.linkedExpedientId,
          tasks: []
        };
      } else if (!expedientesMap[t.projectId].linkedExpedientId && t.linkedExpedientId) {
        expedientesMap[t.projectId].linkedExpedientId = t.linkedExpedientId;
      }
      expedientesMap[t.projectId].tasks.push(t);
    } else {
      independentTasks.push(t);
    }
  });

  // Obtener la fecha límite más cercana de un expediente para ordenación cronológica
  const getExpedientDueDate = (exp: { tasks: Tarea[] }): number => {
    const dates = exp.tasks.map(t => t.dueDate || t.fecha_vencimiento).filter(Boolean) as number[];
    if (dates.length > 0) return Math.min(...dates);
    return 9999999999999;
  };

  // Ordenar tareas dentro de cada expediente y tareas independientes
  Object.values(expedientesMap).forEach(exp => {
    exp.tasks = sortTasksNaturally(exp.tasks);
  });
  const sortedIndependentTasks = sortTasksNaturally(independentTasks);

  // Ordenar expedientes cronológicamente por su fecha límite más próxima
  const expedientesList = Object.values(expedientesMap).sort((a, b) => {
    const dateA = getExpedientDueDate(a);
    const dateB = getExpedientDueDate(b);
    if (dateA !== dateB) return dateA - dateB;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });

  const renderTaskCard = (tarea: Tarea) => {
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

              {/* BOTÓN DE ELIMINACIÓN DIRECTA DE TAREA */}
              <button
                onClick={(e) => handleDeleteTaskDirect(tarea.id!, e)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all shrink-0 cursor-pointer"
                title="Eliminar tarea directamente"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          </div>
          {tarea.projectName && (
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-1.5">
              {(() => {
                const conc = tarea.concejalia || tarea.projectConcejalia || tarea.projectMasterCategory;
                if (!conc) return null;
                const cStyle = getConcejaliaStyle(conc);
                return (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${cStyle.badgeClass}`}>
                    📁 {conc}
                  </span>
                );
              })()}
              <span className="text-slate-600 dark:text-slate-300 font-semibold">
                {tarea.expedientCode ? `${tarea.expedientCode} - ` : ''}{tarea.projectName}
              </span>
            </div>
          )}
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
  };

  return (
    <div className="flex-1 p-4 sm:p-6 md:p-8 w-full min-h-full flex flex-col">
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col gap-6 md:gap-8">
        
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

        {/* ADD TASK & EXPEDIENTE BUTTONS */}
        <section className="animate-fade-in-up flex flex-col sm:flex-row gap-3" style={{ animationDelay: '100ms' }}>
          <button 
            onClick={() => setIsCreatingTask(true)}
            className="flex-1 flex items-center justify-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-500 rounded-2xl p-4 shadow-sm text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 font-semibold transition-all duration-300 cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
            Nueva Tarea
          </button>
          <button 
            onClick={() => setIsCreatingExpediente(true)}
            className="flex-1 flex items-center justify-center gap-2 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800/50 hover:border-indigo-500 dark:hover:border-indigo-500 rounded-2xl p-4 shadow-sm text-indigo-700 dark:text-indigo-300 font-semibold transition-all duration-300 cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Nuevo Expediente
          </button>
        </section>

        {/* PLANIFICADOR (Expedientes Accordions + Independent Tasks) */}

        {/* PLANIFICADOR (Expedientes Accordions + Independent Tasks) */}
        <section className="flex flex-col gap-6 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
          {filteredTareas.length === 0 ? (
            <p className="text-center text-slate-500 dark:text-slate-400 mt-8 transition-colors duration-300">No hay tareas para hoy. ¡Disfruta tu tiempo libre!</p>
          ) : (
            <>
              {/* BLOQUE DE EXPEDIENTES EN MI DÍA */}
              {expedientesList.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <span>📁 Expedientes en Mi Día ({expedientesList.length})</span>
                  </h3>

                  <div className="space-y-4">
                    {expedientesList.map(exp => {
                      const isExpanded = expandedExpedientes.has(exp.id);
                      const cStyle = getConcejaliaStyle(exp.concejalia);

                      return (
                        <div 
                          key={exp.id}
                          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200"
                        >
                          {/* CABECERA EXPEDIENTE */}
                          <div 
                            onClick={() => toggleExpediente(exp.id)}
                            className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <button className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                                <svg 
                                  className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                                </svg>
                              </button>

                              <div className="min-w-0 space-y-0.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm truncate">
                                    📁 {exp.name}
                                  </h4>
                                  {exp.code && (
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shrink-0">
                                      {exp.code}
                                    </span>
                                  )}
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${cStyle.badgeClass}`}>
                                    {exp.concejalia}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  {exp.tasks.length} {exp.tasks.length === 1 ? 'tarea en Mi Día' : 'tareas en Mi Día'}
                                </p>
                                {(() => {
                                  const linkedParent = exp.linkedExpedientId 
                                    ? expedientesList.find(p => p.id === exp.linkedExpedientId || p.code === exp.linkedExpedientId) 
                                    : null;
                                  if (!linkedParent) return null;
                                  return (
                                    <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium flex items-center gap-1 mt-0.5">
                                      <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                      </svg>
                                      <span>Vinculado a: {linkedParent.code ? `${linkedParent.code} - ` : ''}{linkedParent.name}</span>
                                    </p>
                                  );
                                })()}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {/* EDITAR EXPEDIENTE */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onSelectProject) {
                                    onSelectProject({
                                      id: exp.id,
                                      name: exp.name,
                                      concejalia: exp.concejalia || 'General',
                                      type: 'custom',
                                      status: 'active',
                                      expedientCode: exp.code,
                                      userId: user.uid
                                    });
                                  }
                                }}
                                className="w-8 h-8 flex items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-all cursor-pointer"
                                title="Editar Expediente (Nombre, Concejalía, Fecha)"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              </button>

                              {/* BORRADO DIRECTO DEL EXPEDIENTE */}
                              <button
                                onClick={(e) => handleDeleteExpedienteDirect(exp.id, exp.name, e)}
                                className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-700/60 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all cursor-pointer"
                                title="Eliminar Expediente completo"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </div>
                          </div>

                          {/* TAREAS HIJAS DEL EXPEDIENTE */}
                          {isExpanded && (
                            <div className="p-4 bg-slate-50/50 dark:bg-slate-900/30 border-t border-slate-100 dark:border-slate-700/50 space-y-3">
                              {exp.tasks.map(t => renderTaskCard(t))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* BLOQUE DE TAREAS INDEPENDIENTES */}
              {independentTasks.length > 0 && (
                <div className="space-y-3">
                  {expedientesList.length > 0 && (
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      📝 Tareas Independientes ({independentTasks.length})
                    </h3>
                  )}
                  <div className="space-y-3">
                    {sortedIndependentTasks.map(t => renderTaskCard(t))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

      </div>
      
      {isCreatingTask && (
        <TaskCreateModal 
          user={user} 
          onClose={() => setIsCreatingTask(false)} 
        />
      )}

      {isCreatingExpediente && (
        <TemplateSelectorModal 
          user={user} 
          onClose={() => setIsCreatingExpediente(false)} 
        />
      )}
    </div>
  );
}
