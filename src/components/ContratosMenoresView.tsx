import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { User } from 'firebase/auth';
import { Tarea, Project } from '../types';
import TemplateSelectorModal from './TemplateSelectorModal';
import { getConcejaliaStyle } from '../utils/concejaliaColors';

interface Props {
  user: User;
  searchQuery?: string;
  onSelectTask: (tarea: Tarea) => void;
  onSelectProject?: (project: Project) => void;
}

export default function ContratosMenoresView({ user, searchQuery = '', onSelectTask, onSelectProject }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [allTareas, setAllTareas] = useState<Tarea[]>([]);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [isCreatingExpediente, setIsCreatingExpediente] = useState(false);
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'active' | 'completed'>('ALL');

  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  // Escuchar documentos de expedientes
  useEffect(() => {
    const qProjects = query(
      collection(db, 'tareas'),
      where('userId', '==', user.uid),
      where('isProject', '==', true)
    );

    const unsubProjects = onSnapshot(qProjects, (snapshot) => {
      const projData: Project[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        projData.push({ id: data.projectId || data.id || d.id, ...data } as Project);
      });
      setProjects(projData);
    });

    return () => unsubProjects();
  }, [user.uid]);

  // Escuchar todas las tareas
  useEffect(() => {
    const qTareas = query(
      collection(db, 'tareas'),
      where('userId', '==', user.uid)
    );

    const unsubTareas = onSnapshot(qTareas, (snapshot) => {
      const taskData: Tarea[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        if (!data.isTemplate && !data.isConcejalia && !data.isProject) {
          taskData.push({ id: d.id, ...data } as Tarea);
        }
      });
      setAllTareas(taskData);
    });

    return () => unsubTareas();
  }, [user.uid]);

  // Identificar si un expediente es Contrato Menor
  const isContratoMenorProject = (p: Project | any): boolean => {
    if (p.isContratoMenor) return true;
    if (p.templateId === 'contrato_menor' || p.type === 'contrato_menor') return true;
    const nameLower = (p.name || p.projectName || '').toLowerCase();
    return nameLower.includes('contrato menor') || nameLower.includes('contrato m');
  };

  // Construir lista efectiva de proyectos de Contrato Menor
  const effectiveProjectsMap: Record<string, Project> = {};

  projects.forEach((p) => {
    if (p.id && isContratoMenorProject(p)) {
      effectiveProjectsMap[p.id] = p;
    }
  });

  allTareas.forEach((t) => {
    if (t.projectId) {
      const isCM = (t as any).isContratoMenor || (t as any).templateId === 'contrato_menor' || (t.projectName || '').toLowerCase().includes('contrato menor');
      if (isCM && !effectiveProjectsMap[t.projectId]) {
        effectiveProjectsMap[t.projectId] = {
          id: t.projectId,
          name: t.projectName || 'Contrato Menor Sin Nombre',
          type: 'contrato_menor',
          concejalia: t.concejalia || t.projectConcejalia || 'Economía y Hacienda',
          status: 'active',
          expedientCode: t.expedientCode,
          linkedExpedientId: t.linkedExpedientId,
          userId: t.userId
        };
      }
    }
  });

  const cmProjects = Object.values(effectiveProjectsMap);

  const toggleProject = (projectId: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const handleCompleteTask = async (taskId: string, completada?: boolean) => {
    try {
      const taskRef = doc(db, 'tareas', taskId);
      const newStatus = completada ? 'todo' : 'completed';
      await updateDoc(taskRef, {
        status: newStatus,
        completada: !completada
      });
    } catch (error) {
      console.error("Error updating task status: ", error);
    }
  };

  const handleDeleteTaskDirect = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("¿Eliminar esta tarea del contrato menor?")) return;
    try {
      await deleteDoc(doc(db, 'tareas', taskId));
    } catch (err) {
      console.error("Error deleting task directly: ", err);
    }
  };

  const handleDeleteExpedienteDirect = async (projectId: string, projectName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`¿Eliminar el Contrato Menor "${projectName}" y todas sus tareas?`)) return;
    try {
      const batch = writeBatch(db);
      const expedienteTasks = allTareas.filter(t => t.projectId === projectId);
      expedienteTasks.forEach(t => {
        if (t.id) batch.delete(doc(db, 'tareas', t.id));
      });
      if (projectId) {
        batch.delete(doc(db, 'tareas', projectId));
      }
      await batch.commit();
    } catch (err) {
      console.error("Error deleting expediente batch: ", err);
    }
  };

  // Filtrar contratos por búsqueda y estado
  const filteredCMProjects = cmProjects.filter((p) => {
    const pTasks = allTareas.filter(t => t.projectId === p.id);
    const isCompleted = pTasks.length > 0 && pTasks.every(t => t.status === 'completed' || t.completada);

    if (statusFilter === 'active' && isCompleted) return false;
    if (statusFilter === 'completed' && !isCompleted) return false;

    if (localSearch.trim()) {
      const q = localSearch.toLowerCase();
      const codeMatch = p.expedientCode ? p.expedientCode.toLowerCase().includes(q) : false;
      const nameMatch = p.name.toLowerCase().includes(q);
      const taskMatch = pTasks.some(t => (t.titulo || '').toLowerCase().includes(q) || (t.title || '').toLowerCase().includes(q));
      return codeMatch || nameMatch || taskMatch;
    }

    return true;
  });

  const getTaskSortOrder = (t: Tarea): number => {
    const text = t.title || t.titulo || '';
    const match = text.match(/^(\d+)[\.\s]/);
    if (match) return parseInt(match[1], 10);
    if (typeof t.orderIndex === 'number') return t.orderIndex;
    return 9999;
  };

  const sortTasksNaturally = (tasks: Tarea[]): Tarea[] => {
    return [...tasks].sort((a, b) => {
      const orderA = getTaskSortOrder(a);
      const orderB = getTaskSortOrder(b);
      if (orderA !== orderB) return orderA - orderB;
      const titleA = a.titulo || a.title || '';
      const titleB = b.titulo || b.title || '';
      return titleA.localeCompare(titleB, undefined, { numeric: true, sensitivity: 'base' });
    });
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6 animate-fade-in">
      
      {/* HEADER SECTION */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Contratos Menores</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
              {cmProjects.length} registrados
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gestión centralizada de expedientes de Contrato Menor con checklist de tareas predefinidas
          </p>
        </div>

        <button
          onClick={() => setIsCreatingExpediente(true)}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer shrink-0"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          ⚡ Nuevo Contrato Menor
        </button>
      </section>

      {/* BARRA DE BÚSQUEDA Y FILTROS */}
      <section className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="w-full sm:w-80 relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Buscar por código, nombre o tarea..."
            className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          {localSearch && (
            <button onClick={() => setLocalSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">✕</button>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {(['ALL', 'active', 'completed'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                statusFilter === st
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              {st === 'ALL' ? 'Todos' : st === 'active' ? 'En Tramitación' : 'Completados'}
            </button>
          ))}
        </div>
      </section>

      {/* LISTADO DE CONTRATOS MENORES EN ACORDEÓN */}
      {filteredCMProjects.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700">
          <svg className="w-16 h-16 mx-auto text-slate-300 dark:text-slate-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-slate-500 dark:text-slate-400 font-medium">No se encontraron Contratos Menores</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCMProjects.map((project) => {
            const isExpanded = expandedProjects.has(project.id!);
            const projectTasks = sortTasksNaturally(allTareas.filter(t => t.projectId === project.id));
            const completedCount = projectTasks.filter(t => t.status === 'completed' || t.completada).length;
            const totalCount = projectTasks.length;
            const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
            const isAllDone = totalCount > 0 && completedCount === totalCount;
            const cStyle = getConcejaliaStyle(project.concejalia || 'Economía y Hacienda');

            return (
              <div
                key={project.id}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200"
              >
                {/* CABECERA CONTRATO MENOR */}
                <div
                  onClick={() => toggleProject(project.id!)}
                  className="p-4 sm:p-5 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <button className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                      <svg
                        className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>

                    <div className="min-w-0 space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm sm:text-base truncate">
                          📜 {project.name}
                        </h3>
                        {project.expedientCode && (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shrink-0">
                            {project.expedientCode}
                          </span>
                        )}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${cStyle.badgeClass}`}>
                          {project.concejalia || 'Economía y Hacienda'}
                        </span>
                        {isAllDone ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                            ✅ Completado
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                            🟢 En tramitación
                          </span>
                        )}
                      </div>

                      {/* Barra de progreso */}
                      <div className="flex items-center gap-3 pt-1 max-w-md">
                        <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 ${isAllDone ? 'bg-emerald-500' : 'bg-indigo-600'}`}
                            style={{ width: `${percent}%` }}
                          ></div>
                        </div>
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 font-mono shrink-0">
                          {completedCount}/{totalCount} ({percent}%)
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onSelectProject) onSelectProject(project);
                      }}
                      className="w-8 h-8 flex items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-all shrink-0 cursor-pointer"
                      title="Editar Contrato Menor"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => handleDeleteExpedienteDirect(project.id!, project.name, e)}
                      className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all shrink-0 cursor-pointer"
                      title="Eliminar Contrato Menor completo"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>

                {/* CHECKLIST DE TAREAS HIJAS PREDEFINIDAS */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 sm:px-6 bg-slate-50/50 dark:bg-slate-900/30 border-t border-slate-100 dark:border-slate-700/50 space-y-2">
                    {projectTasks.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-2 pl-4">No hay tareas asociadas a este contrato menor.</p>
                    ) : (
                      <div className="space-y-2 py-2">
                        {projectTasks.map((tarea) => {
                          const isCompleted = tarea.status === 'completed' || !!tarea.completada;
                          const taskNote = tarea.notas || tarea.notes;

                          return (
                            <div
                              key={tarea.id}
                              onClick={() => onSelectTask(tarea)}
                              className="p-3 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700/60 rounded-xl flex items-center justify-between gap-3 hover:border-indigo-300 dark:hover:border-indigo-600 cursor-pointer transition-all shadow-2xs"
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCompleteTask(tarea.id!, isCompleted);
                                  }}
                                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                                    isCompleted 
                                      ? 'bg-emerald-500 border-emerald-500 text-white' 
                                      : 'border-slate-300 dark:border-slate-600 hover:border-indigo-500'
                                  }`}
                                >
                                  {isCompleted && (
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </button>

                                <div className="min-w-0 flex-1">
                                  <p className={`text-sm font-semibold truncate ${isCompleted ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-200'}`}>
                                    {tarea.titulo || tarea.title}
                                  </p>
                                  {taskNote && (
                                    <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
                                      📝 {taskNote}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[11px] font-medium text-slate-400 bg-slate-100 dark:bg-slate-700/50 px-2 py-0.5 rounded">
                                  {tarea.estimatedTimeMin ? `${tarea.estimatedTimeMin} min` : tarea.tiempo_estimado}
                                </span>
                                <button
                                  onClick={(e) => handleDeleteTaskDirect(tarea.id!, e)}
                                  className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all shrink-0 cursor-pointer"
                                  title="Eliminar tarea"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL DE NUEVO EXPEDIENTE DE CONTRATO MENOR */}
      {isCreatingExpediente && (
        <TemplateSelectorModal user={user} onClose={() => setIsCreatingExpediente(false)} />
      )}

    </div>
  );
}
