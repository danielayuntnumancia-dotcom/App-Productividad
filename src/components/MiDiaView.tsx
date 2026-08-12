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

type MiDiaStatusFilter = 'todas' | 'todo' | 'in_progress' | 'waiting_on_third_party';

export default function MiDiaView({ user, searchQuery = '', onSelectTask, onSelectProject }: Props) {
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [expandedExpedientes, setExpandedExpedientes] = useState<Set<string>>(new Set());
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [isCreatingExpediente, setIsCreatingExpediente] = useState(false);
  const [filterStatus, setFilterStatus] = useState<MiDiaStatusFilter>('todas');

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

  const getPriorityStyle = (prioridad?: string) => {
    switch(prioridad) {
      case 'alta': return 'bg-red-50/80 border-red-100 dark:bg-red-900/10 dark:border-red-900/30 shadow-red-100 dark:shadow-none';
      case 'media': return 'bg-amber-50/80 border-amber-100 dark:bg-amber-900/10 dark:border-amber-900/30 shadow-amber-100 dark:shadow-none';
      case 'baja': return 'bg-emerald-50/80 border-emerald-100 dark:bg-emerald-900/10 dark:border-emerald-900/30 shadow-emerald-100 dark:shadow-none';
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
      default:
        return null;
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

  const parseMinutes = (timeStr?: string): number => {
    if (!timeStr) return 0;
    const lower = timeStr.toLowerCase().trim();
    const minMatch = lower.match(/^(\d+)\s*m/);
    if (minMatch) return parseInt(minMatch[1], 10);
    const hourMatch = lower.match(/^(\d+(?:\.\d+)?)\s*h/);
    if (hourMatch) return Math.round(parseFloat(hourMatch[1]) * 60);
    const num = parseInt(lower, 10);
    return isNaN(num) ? 0 : num;
  };

  // Filtrado por buscador y estado
  const filteredTareas = tareas.filter(t => {
    let matchStatus = true;
    if (filterStatus === 'todo') {
      matchStatus = t.status === 'todo' || !t.status;
    } else if (filterStatus === 'in_progress') {
      matchStatus = t.status === 'in_progress';
    } else if (filterStatus === 'waiting_on_third_party') {
      matchStatus = t.status === 'waiting_on_third_party';
    }

    if (!matchStatus) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.titulo.toLowerCase().includes(q) ||
      (t.notas && t.notas.toLowerCase().includes(q))
    );
  });

  const totalMinutes = filteredTareas.reduce((acc, t) => acc + parseMinutes(t.tiempo_estimado), 0);
  const capacityPercent = Math.min(Math.round((totalMinutes / 480) * 100), 100);

  const formatHours = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  };

  // Agrupar tareas filtradas por expediente
  const expedientesMap: Record<string, { id: string; name: string; concejalia?: string; code?: string; linkedExpedientId?: string; tasks: Tarea[] }> = {};
  const independentTasks: Tarea[] = [];

  filteredTareas.forEach(t => {
    if (t.projectId) {
      if (!expedientesMap[t.projectId]) {
        expedientesMap[t.projectId] = {
          id: t.projectId,
          name: t.projectName || 'Expediente Sin Nombre',
          concejalia: t.concejalia || t.projectConcejalia || t.projectMasterCategory,
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

  const getExpedientDueDate = (exp: { tasks: Tarea[] }): number => {
    const dates = exp.tasks.map(t => t.dueDate || t.fecha_vencimiento).filter(Boolean) as number[];
    if (dates.length > 0) return Math.min(...dates);
    return 9999999999999;
  };

  Object.values(expedientesMap).forEach(exp => {
    exp.tasks = sortTasksNaturally(exp.tasks);
  });
  const sortedIndependentTasks = sortTasksNaturally(independentTasks);

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
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 truncate transition-colors duration-300">
              {tarea.titulo}
            </h3>
            <div className="flex items-center gap-2 shrink-0">
              {getStatusBadge(tarea.status, tarea.blockedBy)}
              <button
                onClick={(e) => handleDeleteTaskDirect(tarea.id!, e)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all shrink-0 cursor-pointer"
                title="Eliminar tarea directamente"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          </div>
          {tarea.notas && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed transition-colors duration-300">
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
                tarea.fecha_vencimiento < Date.now() ? 'text-red-500 dark:text-red-400 font-semibold' : 'text-slate-500 dark:text-slate-400'
              }`}>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                {new Date(tarea.fecha_vencimiento).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const statusFilterOptions: { key: MiDiaStatusFilter; label: string; count: number }[] = [
    { key: 'todas', label: 'Todas', count: tareas.length },
    { key: 'in_progress', label: '⚡ En Curso', count: tareas.filter(t => t.status === 'in_progress').length },
    { key: 'waiting_on_third_party', label: '⚠️ Retenidas por Terceros', count: tareas.filter(t => t.status === 'waiting_on_third_party').length },
    { key: 'todo', label: 'Pendientes', count: tareas.filter(t => t.status === 'todo' || !t.status).length },
  ];

  return (
    <div className="flex-1 p-4 sm:p-6 md:p-8 w-full min-h-full flex flex-col">
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col gap-6 md:gap-8">
        
        {/* HEADER & CAPACITY BAR */}
        <section className="flex flex-col gap-4 animate-fade-in-up">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 transition-colors duration-300">Mi Día</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 transition-colors duration-300">
                {new Date().toLocaleDateString('es-ES', { weekday: 'long', month: 'short', day: 'numeric' })}
              </p>
            </div>

            {/* BARRA DE FILTRADO POR ESTADO EN MI DÍA */}
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-200/60 dark:bg-slate-800/80 p-1.5 rounded-2xl border border-slate-300/50 dark:border-slate-700/50">
              {statusFilterOptions.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setFilterStatus(opt.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-1.5 cursor-pointer ${
                    filterStatus === opt.key 
                      ? (opt.key === 'waiting_on_third_party' 
                          ? 'bg-amber-500 text-white shadow-sm' 
                          : opt.key === 'in_progress' 
                            ? 'bg-indigo-600 text-white shadow-sm' 
                            : 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 shadow-sm')
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-300/40 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <span>{opt.label}</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                    filterStatus === opt.key ? 'bg-black/15 dark:bg-white/20 text-current font-extrabold' : 'bg-slate-300/60 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold'
                  }`}>
                    {opt.count}
                  </span>
                </button>
              ))}
            </div>
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
        <section className="animate-fade-in-up flex flex-col sm:flex-row gap-3" style={{ animationDelay: '50ms' }}>
          <button 
            onClick={() => setIsCreatingTask(true)}
            className="flex-1 flex items-center justify-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-500 rounded-2xl p-4 shadow-sm text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 font-semibold transition-all duration-300 cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
            Añadir Tarea a Mi Día
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

        {/* MAIN TASK LIST */}
        <section className="flex-1 flex flex-col gap-6 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
          {filteredTareas.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-16 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 transition-colors duration-300">
              <svg className="w-16 h-16 text-slate-300 dark:text-slate-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M5 13l4 4L19 7"></path></svg>
              <p className="text-slate-500 dark:text-slate-400 font-medium text-center">No hay tareas que coincidan con el filtro seleccionado</p>
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* BLOQUE 1: EXPEDIENTES EN MI DÍA */}
              {expedientesList.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-1">
                    Expedientes ({expedientesList.length})
                  </h3>

                  <div className="space-y-3">
                    {expedientesList.map(exp => {
                      const isExpanded = expandedExpedientes.has(exp.id);
                      const cStyle = getConcejaliaStyle(exp.concejalia);

                      return (
                        <div 
                          key={exp.id} 
                          className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-all duration-200"
                        >
                          {/* Cabecera del Expediente (Acordeón) */}
                          <div 
                            className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                            onClick={() => toggleExpediente(exp.id)}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <button 
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                              >
                                <svg 
                                  className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} 
                                  fill="none" 
                                  stroke="currentColor" 
                                  viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                                </svg>
                              </button>

                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  {exp.code && (
                                    <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-mono">
                                      {exp.code}
                                    </span>
                                  )}

                                  <h4 
                                    className="font-bold text-slate-800 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors truncate text-sm sm:text-base"
                                    onClick={(e) => {
                                      if (onSelectProject) {
                                        e.stopPropagation();
                                        onSelectProject({ id: exp.id, name: exp.name, type: 'custom', concejalia: exp.concejalia, status: 'active', expedientCode: exp.code });
                                      }
                                    }}
                                  >
                                    {exp.name}
                                  </h4>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                  {exp.concejalia && (
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${cStyle.badgeClass}`}>
                                      📁 {exp.concejalia}
                                    </span>
                                  )}
                                  {exp.linkedExpedientId && (
                                    <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-md">
                                      🔗 Vinculado
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0 ml-2">
                              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2.5 py-1 rounded-full">
                                {exp.tasks.length} {exp.tasks.length === 1 ? 'tarea' : 'tareas'}
                              </span>

                              <button
                                onClick={(e) => handleDeleteExpedienteDirect(exp.id, exp.name, e)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all shrink-0 cursor-pointer"
                                title="Eliminar expediente y sus tareas"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>

                          {/* Tareas del Expediente */}
                          {isExpanded && (
                            <div className="p-4 pt-0 border-t border-slate-100 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-900/20 space-y-2">
                              {exp.tasks.map(t => renderTaskCard(t))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* BLOQUE 2: TAREAS INDEPENDIENTES */}
              {sortedIndependentTasks.length > 0 && (
                <div className="space-y-4">
                  {expedientesList.length > 0 && (
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-1">
                      Tareas Independientes ({sortedIndependentTasks.length})
                    </h3>
                  )}
                  <div className="space-y-3">
                    {sortedIndependentTasks.map(t => renderTaskCard(t))}
                  </div>
                </div>
              )}

            </div>
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
