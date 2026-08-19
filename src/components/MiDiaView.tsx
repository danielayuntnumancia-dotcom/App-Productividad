import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { Tarea, Project } from '../types';
import { User } from 'firebase/auth';
import TaskCreateModal from './TaskCreateModal';
import TemplateSelectorModal from './TemplateSelectorModal';
import BulkTaskActionBar from './BulkTaskActionBar';
import { getConcejaliaStyle, getConcejaliaBg, getPriorityStyle, getPriorityBadgeClass } from '../utils/concejaliaColors';
import { useConcejalias } from '../hooks/useConcejalias';
import { getTaskDeadlineInfo, getRetentionWarning } from '../utils/deadlines';
import { moveToTrashTask, moveToTrashExpediente } from '../utils/trashUtils';
import KanbanBoard from './KanbanBoard';

interface Props {
  user: User;
  searchQuery?: string;
  onSelectTask: (tarea: Tarea | null) => void;
  onSelectProject?: (project: Project | null) => void;
}

type MiDiaStatusFilter = 'todas' | 'todo' | 'in_progress' | 'waiting_on_third_party';

export default function MiDiaView({ user, searchQuery = '', onSelectTask, onSelectProject }: Props) {
  const concejaliasList = useConcejalias(user.uid);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [allUserTareas, setAllUserTareas] = useState<Tarea[]>([]);
  const [expandedExpedientes, setExpandedExpedientes] = useState<Set<string>>(new Set());
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [isCreatingExpediente, setIsCreatingExpediente] = useState(false);
  const [filterStatus, setFilterStatus] = useState<MiDiaStatusFilter>('todas');
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, 'tareas'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tareasData: Tarea[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.isDeleted) return;
        tareasData.push({ id: doc.id, ...data } as Tarea);
      });
      setAllUserTareas(tareasData);
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

  const handleUpdateTaskStatus = async (taskId: string, newStatus: string) => {
    try {
      const taskRef = doc(db, 'tareas', taskId);
      await updateDoc(taskRef, {
        status: newStatus,
        completada: newStatus === 'completed'
      });
    } catch (error) {
      console.error("Error updating task status: ", error);
    }
  };

  const handleDeleteTaskDirect = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("¿Mover esta tarea a la papelera? Podrás recuperarla en la sección Papelera.")) return;
    try {
      await moveToTrashTask(taskId);
    } catch (err) {
      console.error("Error moving task to trash: ", err);
    }
  };

  const handleDeleteExpedienteDirect = async (projectId: string, projectName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`¿Mover el expediente "${projectName}" y sus tareas a la papelera? Podrás recuperarlo desde la Papelera.`)) return;
    try {
      await moveToTrashExpediente(projectId, allUserTareas);
    } catch (err) {
      console.error("Error moving expediente to trash: ", err);
    }
  };

  const getPriorityBadge = (prioridad?: string, priority?: string) => {
    const val = (prioridad || priority || 'media').toLowerCase();
    const badgeClass = getPriorityBadgeClass(prioridad, priority);
    const label = (val === 'alta' || val === 'high' || val === 'urgente' || val === 'urgent') 
      ? '🔴 Alta' 
      : (val === 'baja' || val === 'low') 
        ? '🟩 Baja' 
        : '🟧 Media';
    return (
      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border ${badgeClass} shrink-0`}>
        {label}
      </span>
    );
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
    const isSelected = !!tarea.id && selectedTaskIds.includes(tarea.id);

    const cardStyle = isSelected
      ? 'bg-indigo-50/90 dark:bg-indigo-950/40 border-indigo-500 dark:border-indigo-500 ring-2 ring-indigo-500/30 shadow-md'
      : (isOverdue 
          ? 'bg-red-50 border-red-500 dark:bg-red-900/20 dark:border-red-500/80' 
          : (tarea.status === 'in_progress'
              ? 'bg-indigo-50/80 border-indigo-500 dark:bg-indigo-900/10 dark:border-indigo-500 shadow-indigo-100 dark:shadow-none'
              : getPriorityStyle(tarea.prioridad, (tarea as any).priority)));

    const statusBadge = getStatusBadge(tarea.status, tarea.blockedBy);

    return (
      <div 
        key={tarea.id} 
        data-task-card="true"
        className={`rounded-2xl border shadow-sm flex items-stretch group hover:shadow-md transition-all duration-300 cursor-pointer overflow-hidden ${cardStyle}`}
        onClick={() => onSelectTask(tarea)}
      >
        <div className={`w-12 sm:w-16 flex flex-col items-center justify-between py-3.5 shrink-0 transition-colors ${getConcejaliaBg(tarea.concejalia)}`}>
          {/* Checkbox de Selección Masiva */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!tarea.id) return;
              setSelectedTaskIds(prev =>
                prev.includes(tarea.id!) ? prev.filter(id => id !== tarea.id) : [...prev, tarea.id!]
              );
            }}
            className={`w-5 h-5 rounded-md border flex items-center justify-center text-[10px] font-black transition-all cursor-pointer ${
              isSelected
                ? 'bg-white text-indigo-700 border-white shadow-xs'
                : 'border-white/60 bg-black/10 text-transparent hover:border-white hover:bg-black/20'
            }`}
            title={isSelected ? 'Desmarcar tarea' : 'Seleccionar para edición en masa'}
          >
            ✓
          </button>

          {/* Botón de Completar */}
          <button 
            onClick={(e) => { e.stopPropagation(); handleCompleteTask(tarea.id!); }}
            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
              tarea.concejalia
                ? 'border-white/60 hover:border-white text-white'
                : 'border-slate-300 dark:border-slate-600 hover:border-indigo-500 dark:hover:border-indigo-400 text-indigo-600 dark:text-indigo-400'
            }`}
            title="Marcar como completada"
          >
            <svg className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
          </button>
        </div>
        <div className="flex-1 min-w-0 p-3.5 sm:p-5 flex flex-col justify-between">
          <div className="space-y-1.5">
            {/* Fila superior de Metadatos y Borrado (Status Badge + Priority Badge + Expediente + Papelera) */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                {statusBadge}
                {getPriorityBadge(tarea.prioridad, (tarea as any).priority)}
                {(() => {
                  const dl = getTaskDeadlineInfo(tarea);
                  if (dl.severity !== 'none') {
                    return (
                      <span className={`text-[10px] px-2 py-0.5 rounded-md border font-bold ${dl.badgeClass}`}>
                        {dl.formattedText}
                      </span>
                    );
                  }
                  return null;
                })()}
                {tarea.projectName && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border bg-slate-100 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300 truncate max-w-[220px]">
                    📁 {tarea.expedientCode ? `${tarea.expedientCode} - ` : ''}{tarea.projectName}
                  </span>
                )}
              </div>

              <button
                onClick={(e) => handleDeleteTaskDirect(tarea.id!, e)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all shrink-0 cursor-pointer ml-auto"
                title="Eliminar tarea directamente"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>

            {/* Título de la tarea */}
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm sm:text-base leading-snug break-words line-clamp-2 transition-colors duration-300">
              {tarea.titulo}
            </h3>

            {(() => {
              const ret = getRetentionWarning(tarea);
              if (ret.isProlonged) {
                return (
                  <p className="text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2 py-1 rounded-md border border-amber-200 dark:border-amber-800">
                    {ret.warningText}
                  </p>
                );
              }
              return null;
            })()}

            {tarea.notas && (
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed transition-colors duration-300">
                {tarea.notas}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-3 pt-2 border-t border-slate-100 dark:border-slate-700/40">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-white/50 dark:bg-slate-800/50 px-2 py-1 rounded-md flex items-center gap-1 transition-colors duration-300">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              {tarea.tiempo_estimado}
            </span>
            {tarea.concejalia && (
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-white/50 dark:bg-slate-800/50 px-2 py-1 rounded-md transition-colors duration-300">
                {tarea.concejalia}
              </span>
            )}
            {tarea.driveFolderUrl && (
              <a
                href={tarea.driveFolderUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-xs font-bold bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800 flex items-center gap-1 transition-all"
                title="Abrir carpeta en Google Drive"
              >
                <span>📁</span> Drive
              </a>
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
            <div className="flex items-center gap-1.5 bg-slate-200/60 dark:bg-slate-800/80 p-1.5 rounded-2xl border border-slate-300/50 dark:border-slate-700/50 overflow-x-auto no-scrollbar flex-nowrap max-w-full">
              {statusFilterOptions.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setFilterStatus(opt.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-1.5 cursor-pointer shrink-0 ${
                    filterStatus === opt.key 
                      ? (opt.key === 'waiting_on_third_party' 
                          ? 'bg-amber-500 text-white shadow-sm' 
                          : opt.key === 'in_progress' 
                            ? 'bg-indigo-600 text-white shadow-sm' 
                            : 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 shadow-sm')
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-300/40 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <span className="whitespace-nowrap">{opt.label}</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                    filterStatus === opt.key ? 'bg-black/15 dark:bg-white/20 text-current font-extrabold' : 'bg-slate-300/60 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold'
                  }`}>
                    {opt.count}
                  </span>
                </button>
              ))}
            </div>

            {/* VIEW TOGGLE */}
            <div className="flex bg-slate-200/60 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-300/50 dark:border-slate-700/50 shrink-0">
              <button 
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${viewMode === 'list' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
                Lista
              </button>
              <button 
                onClick={() => setViewMode('kanban')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${viewMode === 'kanban' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"></path></svg>
                Tablero
              </button>
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

        {/* MAIN TASK LIST OR KANBAN BOARD */}
        <section className={`flex-1 flex flex-col gap-6 animate-fade-in-up ${viewMode === 'kanban' ? 'min-h-[60vh]' : ''}`} style={{ animationDelay: '100ms' }}>
          {filteredTareas.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-16 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 transition-colors duration-300">
              <svg className="w-16 h-16 text-slate-300 dark:text-slate-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M5 13l4 4L19 7"></path></svg>
              <p className="text-slate-500 dark:text-slate-400 font-medium text-center">No hay tareas que coincidan con el filtro seleccionado</p>
            </div>
          ) : viewMode === 'kanban' ? (
            <KanbanBoard tasks={filteredTareas} onTaskStatusChange={handleUpdateTaskStatus} onSelectTask={onSelectTask} />
          ) : (
            <div className="space-y-6">
              
              {/* BLOQUE 1: EXPEDIENTES EN MI DÍA */}
              {expedientesList.length > 0 && (
                <div className="space-y-4">
                  {(() => {
                    const isContratoMenorExpedient = (exp: typeof expedientesList[0]) => {
                      return exp.tasks.some(t => (t as any).isContratoMenor || (t as any).templateId === 'contrato_menor');
                    };

                    const cmExpedientes = expedientesList.filter(isContratoMenorExpedient);
                    const regularExpedientes = expedientesList.filter(e => !isContratoMenorExpedient(e));
                    const isCMMasterExpanded = expandedExpedientes.has('master_cm_midia');

                    const renderExpedientItem = (exp: typeof expedientesList[0]) => {
                      const isExpanded = expandedExpedientes.has(exp.id);
                      const cStyle = getConcejaliaStyle(exp.concejalia);
                      const hasHighPriority = exp.tasks.some(t => (t.prioridad || (t as any).priority) === 'alta' || (t.prioridad || (t as any).priority) === 'high');

                      return (
                        <div 
                          key={exp.id}
                          data-project-card="true"
                          className={`bg-white dark:bg-slate-800 border-t border-r border-b border-slate-200 dark:border-slate-700/80 border-l-4 ${cStyle.borderL} rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200`}
                        >
                          {/* CABECERA EXPEDIENTE */}
                          <div 
                            onClick={() => toggleExpediente(exp.id)}
                            className="p-4 sm:p-5 flex flex-col gap-2.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                <button className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
                                  <svg 
                                    className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                                  </svg>
                                </button>

                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h4 
                                      className="font-extrabold text-slate-800 dark:text-slate-100 text-sm sm:text-base leading-snug break-words cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400"
                                      onClick={(e) => {
                                        if (onSelectProject) {
                                          e.stopPropagation();
                                          onSelectProject({ id: exp.id, name: exp.name, type: 'custom', concejalia: exp.concejalia, status: 'active', expedientCode: exp.code, userId: user.uid });
                                        }
                                      }}
                                    >
                                      📁 {exp.name}
                                    </h4>

                                    {exp.code && (
                                      <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shrink-0">
                                        {exp.code}
                                      </span>
                                    )}

                                    {hasHighPriority && (
                                      <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 shrink-0">
                                        🔴 Alta Prioridad
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2 text-xs">
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
                            </div>

                            {/* BARRA INFERIOR DE ACCIONES Y CONTADOR */}
                            <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-700/60 pt-2.5 mt-1">
                              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2.5 py-1 rounded-full">
                                {exp.tasks.length} {exp.tasks.length === 1 ? 'tarea' : 'tareas'}
                              </span>

                              <button
                                onClick={(e) => handleDeleteExpedienteDirect(exp.id, exp.name, e)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all shrink-0 cursor-pointer"
                                title="Eliminar expediente"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>

                          {/* LISTA DE TAREAS HIJAS */}
                          {isExpanded && (
                            <div className="p-4 pt-2 border-t border-slate-100 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-900/30 space-y-2.5">
                              {exp.tasks.map(t => renderTaskCard(t))}
                            </div>
                          )}
                        </div>
                      );
                    };

                    return (
                      <div className="space-y-4">
                        {/* EXPEDIENTES REGULARES */}
                        {regularExpedientes.length > 0 && (
                          <div className="space-y-3">
                            {regularExpedientes.map(exp => renderExpedientItem(exp))}
                          </div>
                        )}

                        {/* TARJETA MÁSTER CONTRATOS MENORES */}
                        {cmExpedientes.length > 0 && (
                          <div className="bg-amber-50/40 dark:bg-amber-950/20 border-2 border-amber-300 dark:border-amber-700/60 rounded-2xl overflow-hidden shadow-sm">
                            <div 
                              onClick={() => toggleExpediente('master_cm_midia')}
                              className="p-4 sm:p-5 flex items-center justify-between cursor-pointer hover:bg-amber-100/50 dark:hover:bg-amber-900/30 transition-colors"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <button className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                                  <svg 
                                    className={`w-4 h-4 transition-transform duration-200 ${isCMMasterExpanded ? 'rotate-90' : ''}`}
                                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                                  </svg>
                                </button>
                                <div>
                                  <h4 className="font-extrabold text-amber-900 dark:text-amber-200 text-base flex items-center gap-2">
                                    <span>📜</span> Contratos Menores en Mi Día
                                  </h4>
                                  <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                                    {cmExpedientes.length} contrato(s) activo(s)
                                  </p>
                                </div>
                              </div>
                            </div>

                            {isCMMasterExpanded && (
                              <div className="p-4 pt-2 border-t border-amber-200 dark:border-amber-800/50 space-y-3">
                                {cmExpedientes.map(exp => renderExpedientItem(exp))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
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

      {/* BARRA FLOTANTE DE ACCIONES MASIVAS */}
      <BulkTaskActionBar
        selectedTaskIds={selectedTaskIds}
        tasks={tareas}
        concejaliasList={concejaliasList}
        onClearSelection={() => setSelectedTaskIds([])}
        onSelectAll={() => {
          if (selectedTaskIds.length === tareas.length) {
            setSelectedTaskIds([]);
          } else {
            setSelectedTaskIds(tareas.map(t => t.id!).filter(Boolean));
          }
        }}
        isAllSelected={tareas.length > 0 && selectedTaskIds.length === tareas.length}
      />
    </div>
  );
}
