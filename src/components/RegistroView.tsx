import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Tarea } from '../types';
import { User } from 'firebase/auth';
import TaskCreateModal from './TaskCreateModal';
import TemplateSelectorModal from './TemplateSelectorModal';
import BulkTaskActionBar from './BulkTaskActionBar';
import { getConcejaliaStyle, getConcejaliaBg, getPriorityStyle, getPriorityBadgeClass } from '../utils/concejaliaColors';
import { useConcejalias } from '../hooks/useConcejalias';
import { getTaskDeadlineInfo, getRetentionWarning } from '../utils/deadlines';
import { moveToTrashTask } from '../utils/trashUtils';
import KanbanBoard from './KanbanBoard';

interface Props {
  user: User;
  searchQuery?: string;
  onSelectTask: (tarea: Tarea | null) => void;
}

type StatusFilterOption = 'todas' | 'todo' | 'in_progress' | 'waiting_on_third_party' | 'completed';

export default function RegistroView({ user, searchQuery = '', onSelectTask }: Props) {
  const concejaliasList = useConcejalias(user.uid);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [isCreatingExpediente, setIsCreatingExpediente] = useState(false);
  const [filter, setFilter] = useState<StatusFilterOption>('todas');
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
        if (!data.isTemplate && !data.isConcejalia && !data.isProject) {
          tareasData.push({ id: doc.id, ...data } as Tarea);
        }
      });
      
      const getTaskDueDate = (t: Tarea): number => {
        if (t.dueDate) return t.dueDate;
        if (t.fecha_vencimiento) return t.fecha_vencimiento;
        if (t.createdAt) return typeof t.createdAt === 'number' ? t.createdAt : (t.createdAt.seconds ? t.createdAt.seconds * 1000 : 0);
        if (t.fecha_creacion) return t.fecha_creacion;
        return 9999999999999;
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

      // Ordenar por: 1º Fecha Límite, 2º Concejalía, 3º Expediente, 4º Nombre
      tareasData.sort((a, b) => {
        const dateA = getTaskDueDate(a);
        const dateB = getTaskDueDate(b);
        if (dateA !== dateB) return dateA - dateB;

        const concA = a.concejalia || a.projectConcejalia || a.projectMasterCategory || 'ZZZ_SinConcejalia';
        const concB = b.concejalia || b.projectConcejalia || b.projectMasterCategory || 'ZZZ_SinConcejalia';
        const concComp = concA.localeCompare(concB, undefined, { sensitivity: 'base' });
        if (concComp !== 0) return concComp;

        const projA = a.projectName || 'ZZZ_SinExpediente';
        const projB = b.projectName || 'ZZZ_SinExpediente';
        const projComp = projA.localeCompare(projB, undefined, { sensitivity: 'base' });
        if (projComp !== 0) return projComp;

        const orderA = getTaskSortOrder(a);
        const orderB = getTaskSortOrder(b);
        if (orderA !== orderB) return orderA - orderB;

        const titleA = a.titulo || a.title || '';
        const titleB = b.titulo || b.title || '';
        return titleA.localeCompare(titleB, undefined, { numeric: true, sensitivity: 'base' });
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

  const handleDeleteTaskDirect = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("¿Mover esta tarea a la papelera? Podrás recuperarla en la sección Papelera.")) return;
    try {
      await moveToTrashTask(taskId);
    } catch (err) {
      console.error("Error moving task to trash: ", err);
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

  // Contadores para las pestañas de filtro por estado
  const counts = {
    todas: tareas.length,
    todo: tareas.filter(t => !t.completada && (t.status === 'todo' || !t.status)).length,
    in_progress: tareas.filter(t => !t.completada && t.status === 'in_progress').length,
    waiting_on_third_party: tareas.filter(t => !t.completada && t.status === 'waiting_on_third_party').length,
    completed: tareas.filter(t => t.completada || t.status === 'completed').length,
  };

  const filteredTareas = tareas.filter(t => {
    let matchFilter = true;
    const isCompleted = t.status === 'completed' || !!t.completada;

    if (filter === 'todo') {
      matchFilter = !isCompleted && (t.status === 'todo' || !t.status);
    } else if (filter === 'in_progress') {
      matchFilter = !isCompleted && t.status === 'in_progress';
    } else if (filter === 'waiting_on_third_party') {
      matchFilter = !isCompleted && t.status === 'waiting_on_third_party';
    } else if (filter === 'completed') {
      matchFilter = isCompleted;
    }

    if (!matchFilter) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const taskNote = t.notas || t.notes || '';
    return (
      t.titulo.toLowerCase().includes(q) ||
      taskNote.toLowerCase().includes(q)
    );
  });

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
      case 'completed':
        return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Completada</span>;
      default:
        return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">Pendiente</span>;
    }
  };

  const filterOptions: { key: StatusFilterOption; label: string; count: number; activeClass: string }[] = [
    { key: 'todas', label: 'Todas', count: counts.todas, activeClass: 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-sm' },
    { key: 'todo', label: 'Pendientes', count: counts.todo, activeClass: 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 shadow-sm' },
    { key: 'in_progress', label: 'En Curso', count: counts.in_progress, activeClass: 'bg-indigo-600 text-white shadow-sm' },
    { key: 'waiting_on_third_party', label: '⚠️ Retenidas por Terceros', count: counts.waiting_on_third_party, activeClass: 'bg-amber-500 text-white shadow-sm' },
    { key: 'completed', label: 'Completadas', count: counts.completed, activeClass: 'bg-emerald-600 text-white shadow-sm' }
  ];

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full flex flex-col gap-6 md:gap-8 animate-fade-in">
        
        {/* HEADER & FILTER BAR */}
        <section className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 animate-fade-in-up">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 transition-colors duration-300">Registro de Tareas</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 transition-colors duration-300 mt-1">
              Mostrando {filteredTareas.length} de {tareas.length} tareas totales
            </p>
          </div>
          
          {/* BARRA DE FILTROS AVANZADA POR ESTADO */}
          <div className="flex items-center gap-1.5 bg-slate-200/60 dark:bg-slate-800/80 p-1.5 rounded-2xl border border-slate-300/50 dark:border-slate-700/50 overflow-x-auto no-scrollbar flex-nowrap max-w-full">
            {filterOptions.map(opt => (
              <button
                key={opt.key}
                onClick={() => setFilter(opt.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-1.5 cursor-pointer shrink-0 ${
                  filter === opt.key 
                    ? opt.activeClass 
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-300/40 dark:hover:bg-slate-700/50'
                }`}
              >
                <span className="whitespace-nowrap">{opt.label}</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                  filter === opt.key 
                    ? 'bg-black/15 dark:bg-white/20 text-current font-extrabold' 
                    : 'bg-slate-300/60 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold'
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
        </section>

        {/* ADD TASK & EXPEDIENTE BUTTONS */}
        <section className="animate-fade-in-up flex flex-col sm:flex-row gap-3" style={{ animationDelay: '50ms' }}>
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

        {/* TASK LIST OR KANBAN BOARD */}
        <section className={`flex flex-col gap-3 animate-fade-in-up ${viewMode === 'kanban' ? 'flex-1 min-h-[60vh]' : ''}`} style={{ animationDelay: '100ms' }}>
          {filteredTareas.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 transition-colors duration-300">
              <svg className="w-16 h-16 mx-auto text-slate-300 dark:text-slate-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
              <p className="text-slate-500 dark:text-slate-400 font-medium">No se encontraron tareas con el filtro seleccionado</p>
            </div>
          ) : viewMode === 'kanban' ? (
            <KanbanBoard tasks={filteredTareas} onTaskStatusChange={handleUpdateTaskStatus} onSelectTask={onSelectTask} />
          ) : (
            filteredTareas.map((tarea) => {
              const rawDueDate = tarea.dueDate || tarea.fecha_vencimiento;
              const isOverdue = !!rawDueDate && rawDueDate < Date.now() && tarea.status !== 'completed' && !tarea.completada;
              const taskNote = tarea.notas || tarea.notes;
              const isSelected = !!tarea.id && selectedTaskIds.includes(tarea.id);

              return (
                <div
                  key={tarea.id}
                  onClick={() => onSelectTask(tarea)}
                  className={`p-4 sm:p-5 rounded-2xl border transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md flex items-center justify-between gap-4 ${
                    isSelected
                      ? 'bg-indigo-50/90 dark:bg-indigo-950/40 border-indigo-500 ring-2 ring-indigo-500/30'
                      : (tarea.completada 
                          ? 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-75' 
                          : getPriorityStyle(tarea.prioridad, (tarea as any).priority))
                  }`}
                >
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
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
                      className={`w-5 h-5 rounded-md border flex items-center justify-center text-[10px] font-black transition-all cursor-pointer mt-0.5 shrink-0 ${
                        isSelected
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                          : 'border-slate-300 dark:border-slate-600 bg-white/80 dark:bg-slate-800 text-transparent hover:border-indigo-400'
                      }`}
                      title={isSelected ? 'Desmarcar tarea' : 'Seleccionar para edición en masa'}
                    >
                      ✓
                    </button>

                    {/* Botón de Completar */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCompleteTask(tarea.id!, tarea.completada);
                      }}
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors mt-0.5 ${
                        tarea.completada 
                          ? 'bg-emerald-500 border-emerald-500 text-white' 
                          : 'border-slate-300 dark:border-slate-600 hover:border-indigo-500'
                      }`}
                      title="Marcar como completada"
                    >
                      {tarea.completada && (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>

                    <div className="min-w-0 space-y-1.5 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {getStatusBadge(tarea.status, tarea.blockedBy)}
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
                      </div>

                      <h3 className={`font-bold text-slate-800 dark:text-slate-100 text-sm sm:text-base leading-snug break-words ${tarea.completada ? 'line-through text-slate-400 dark:text-slate-500' : ''}`}>
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

                      {tarea.projectName && (
                        <div className="text-xs font-medium text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
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
                      {taskNote && (
                        <p className={`text-xs sm:text-sm mt-1 line-clamp-2 leading-relaxed ${tarea.completada ? 'text-slate-400 dark:text-slate-500' : 'text-slate-500 dark:text-slate-400'}`}>
                          {taskNote}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {tarea.driveFolderUrl && (
                      <a
                        href={tarea.driveFolderUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="px-2.5 py-1 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-xs font-bold rounded-lg border border-blue-200 dark:border-blue-800/60 transition-all flex items-center gap-1"
                        title="Abrir carpeta en Google Drive"
                      >
                        <span>📁</span> Drive
                      </a>
                    )}
                    <div className="hidden sm:flex flex-col items-end gap-1 text-right">
                      {rawDueDate && (
                        <span className={`text-xs font-medium ${isOverdue ? 'text-red-500 dark:text-red-400 font-semibold' : 'text-slate-500 dark:text-slate-400'}`}>
                          {new Date(rawDueDate).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        {tarea.estimatedTimeMin ? `${tarea.estimatedTimeMin} min` : tarea.tiempo_estimado}
                      </span>
                    </div>

                    <button
                      onClick={(e) => handleDeleteTaskDirect(tarea.id!, e)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all shrink-0 cursor-pointer"
                      title="Eliminar tarea directamente"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </section>
      
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
          if (selectedTaskIds.length === filteredTareas.length) {
            setSelectedTaskIds([]);
          } else {
            setSelectedTaskIds(filteredTareas.map(t => t.id!).filter(Boolean));
          }
        }}
        isAllSelected={filteredTareas.length > 0 && selectedTaskIds.length === filteredTareas.length}
      />
    </div>
  );
}
