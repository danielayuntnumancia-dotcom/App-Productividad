import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { User } from 'firebase/auth';
import { Tarea, Project } from '../types';
import ExpedienteBuilderModal from './ExpedienteBuilderModal';
import MacroExpedienteModal from './MacroExpedienteModal';
import BulkTaskActionBar from './BulkTaskActionBar';
import { useConcejalias } from '../hooks/useConcejalias';
import { getConcejaliaStyle, getPriorityStyle, getPriorityBadgeClass } from '../utils/concejaliaColors';
import { exportExpedientToPDF, exportExpedientToCSV, copyExpedientTasksToClipboard, exportConcejaliaReportToPDF, exportConcejaliaReportToCSV } from '../utils/exportUtils';

interface Props {
  user: User;
  searchQuery?: string;
  onSelectTask: (tarea: Tarea) => void;
  onSelectProject?: (project: Project) => void;
}

type CMStatusFilter = 'todos' | 'activos' | 'completados';

export default function ContratosMenoresView({ user, searchQuery = '', onSelectTask, onSelectProject }: Props) {
  const concejaliasList = useConcejalias(user.uid);
  const [projects, setProjects] = useState<Project[]>([]);
  const [allTareas, setAllTareas] = useState<Tarea[]>([]);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [isCreatingBuilder, setIsCreatingBuilder] = useState(false);
  const [isMacroModalOpen, setIsMacroModalOpen] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);

  // Filtros
  const [concejaliaFilter, setConcejaliaFilter] = useState<string>('todas');
  const [statusFilter, setStatusFilter] = useState<CMStatusFilter>('todos');
  const [copySuccessMsg, setCopySuccessMsg] = useState<string | null>(null);

  // Escuchar expedientes desde /tareas
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
    if (!window.confirm("¿Eliminar esta tarea definitivamente?")) return;
    try {
      await deleteDoc(doc(db, 'tareas', taskId));
    } catch (err) {
      console.error("Error deleting task directly: ", err);
    }
  };

  const handleDeleteExpedienteDirect = async (projectId: string, projectName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`¿Eliminar el contrato menor "${projectName}" y TODAS sus tareas asociadas?`)) return;
    try {
      const batch = writeBatch(db);
      const expedienteTasks = allTareas.filter(t => t.projectId === projectId);
      expedienteTasks.forEach(t => {
        if (t.id) batch.delete(doc(db, 'tareas', t.id));
      });
      batch.delete(doc(db, 'tareas', projectId));
      await batch.commit();
    } catch (err) {
      console.error("Error deleting expediente batch: ", err);
    }
  };

  const handleCopyClipboard = async (project: Project, tasks: Tarea[], e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await copyExpedientTasksToClipboard(project, tasks);
    if (ok) {
      setCopySuccessMsg(`¡Tareas de "${project.name}" copiadas al portapapeles!`);
      setTimeout(() => setCopySuccessMsg(null), 3000);
    }
  };

  // Filtrado exclusivo de proyectos tipo Contrato Menor
  const isContratoMenorProject = (proj: Project): boolean => {
    if (proj.type === 'contrato_menor' || proj.isContratoMenor) return true;
    const projTasks = allTareas.filter(t => t.projectId === proj.id);
    return projTasks.some(t => (t as any).isContratoMenor || (t as any).templateId === 'contrato_menor');
  };

  // Combinar proyectos explícitos con implícitos
  const effectiveProjectsMap: Record<string, Project> = {};
  projects.forEach((p) => {
    if (p.id) effectiveProjectsMap[p.id] = p;
  });

  allTareas.forEach((t) => {
    if (t.projectId && !effectiveProjectsMap[t.projectId]) {
      effectiveProjectsMap[t.projectId] = {
        id: t.projectId,
        name: t.projectName || 'Contrato Menor Sin Nombre',
        type: (t as any).isContratoMenor ? 'contrato_menor' : 'custom',
        concejalia: t.concejalia || t.projectConcejalia || t.projectMasterCategory || 'Economía y Hacienda',
        status: 'active',
        expedientCode: t.expedientCode,
        userId: t.userId
      };
    }
  });

  const cmProjects = Object.values(effectiveProjectsMap).filter(isContratoMenorProject);

  const getProjectEffectiveStatus = (proj: Project): 'active' | 'completed' => {
    const projTasks = allTareas.filter((t) => t.projectId === proj.id);
    if (projTasks.length > 0 && projTasks.every((t) => t.status === 'completed' || t.completada)) {
      return 'completed';
    }
    return 'active';
  };

  // Concejalías disponibles en contratos menores
  const availableConcejalias = Array.from(
    new Set(cmProjects.map((p) => p.concejalia || 'Economía y Hacienda'))
  ).sort();

  // Filtrado final
  const filteredCMProjects = cmProjects.filter((proj) => {
    if (concejaliaFilter !== 'todas' && (proj.concejalia || 'Economía y Hacienda') !== concejaliaFilter) {
      return false;
    }
    const effStatus = getProjectEffectiveStatus(proj);
    if (statusFilter !== 'todos' && effStatus !== statusFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = proj.name.toLowerCase().includes(q);
      const matchCode = proj.expedientCode && proj.expedientCode.toLowerCase().includes(q);
      const matchTask = allTareas.some(t => t.projectId === proj.id && (t.titulo?.toLowerCase().includes(q) || t.title?.toLowerCase().includes(q)));
      return matchName || matchCode || matchTask;
    }
    return true;
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

  const getTaskSortOrder = (t: Tarea): number => {
    if (typeof t.orderIndex === 'number' && !isNaN(t.orderIndex) && t.orderIndex > 0) {
      return t.orderIndex;
    }
    const text = t.title || t.titulo || '';
    const match = text.match(/^(\d+)[\.\s]/);
    if (match) {
      return parseInt(match[1], 10);
    }
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

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6 animate-fade-in">
      
      {copySuccessMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs sm:text-sm font-semibold px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 border border-slate-700 animate-bounce">
          <span>📋</span> {copySuccessMsg}
        </div>
      )}

      {/* HEADER SECTION */}
      <section className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <span>📜</span> Módulo de Contratos Menores
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Gestión simplificada y trazabilidad completa de contratación menor municipal.
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2.5">
          <button 
            onClick={() => exportConcejaliaReportToPDF(concejaliaFilter !== 'todas' ? concejaliaFilter : 'Economía y Hacienda', cmProjects, allTareas)}
            className="px-3.5 py-2 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 font-bold text-xs rounded-xl border border-rose-200 dark:border-rose-800 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span>📄</span> Informe PDF
          </button>
          
          <button 
            onClick={() => exportConcejaliaReportToCSV(concejaliaFilter !== 'todas' ? concejaliaFilter : 'Economía y Hacienda', cmProjects, allTareas)}
            className="px-3.5 py-2 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-bold text-xs rounded-xl border border-emerald-200 dark:border-emerald-800 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span>📊</span> Excel
          </button>

          <button 
            onClick={() => setIsMacroModalOpen(true)}
            className="px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-700 hover:to-amber-600 text-white font-semibold text-xs rounded-xl shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
          >
            <span>📦</span> Nuevo Lote / Macro
          </button>

          <button 
            onClick={() => setIsCreatingBuilder(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
          >
            <span>⚡</span> Nuevo Contrato Individual
          </button>
        </div>
      </section>

      {/* BARRA DE FILTROS */}
      <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 p-3.5 rounded-2xl shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 min-w-[220px]">
          <span className="font-bold text-slate-500 dark:text-slate-400 shrink-0">🏛️ Concejalía:</span>
          <select
            value={concejaliaFilter}
            onChange={(e) => setConcejaliaFilter(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-500"
          >
            <option value="todas">Todas las concejalías ({cmProjects.length})</option>
            {availableConcejalias.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-700/50 p-1 rounded-xl shrink-0 overflow-x-auto no-scrollbar flex-nowrap max-w-full">
          <span className="font-bold text-slate-400 dark:text-slate-500 px-1 text-[11px]">Estado Contrato:</span>
          {(['todos', 'activos', 'completados'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer capitalize shrink-0 ${
                statusFilter === st
                  ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </section>

      {/* LISTA DE CONTRATOS MENORES */}
      {filteredCMProjects.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700">
          <svg className="w-16 h-16 mx-auto text-amber-300 dark:text-amber-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-slate-500 dark:text-slate-400 font-medium">No existen contratos menores registrados con el filtro actual.</p>
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

            const hasHighPriority = projectTasks.some(t => {
              const p = (t.prioridad || (t as any).priority || '').toLowerCase();
              return p === 'alta' || p === 'high' || p === 'urgente' || p === 'urgent';
            });

            return (
              <div
                key={project.id}
                data-project-card="true"
                className={`bg-white dark:bg-slate-800 border-t border-r border-b border-slate-200 dark:border-slate-700/80 border-l-4 ${cStyle.borderL} rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200`}
              >
                {/* CABECERA CONTRATO MENOR */}
                <div
                  onClick={() => toggleProject(project.id!)}
                  className="p-4 sm:p-5 flex flex-col gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                >
                  {/* Fila 1: Título completo, código EXP y estado */}
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
                          <h3 
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onSelectProject) {
                                onSelectProject({
                                  ...project,
                                  userId: user.uid
                                });
                              }
                            }}
                            className="font-extrabold text-slate-800 dark:text-slate-100 text-sm sm:text-base leading-snug break-words cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400"
                          >
                            📜 {project.name}
                          </h3>
                          {project.expedientCode && (
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shrink-0">
                              {project.expedientCode}
                            </span>
                          )}
                          {isAllDone ? (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border border-emerald-200 shrink-0">✅ Completado</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 border border-amber-200 shrink-0">📜 En Tramitación</span>
                          )}
                          {hasHighPriority && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 shrink-0">
                              🔴 Alta Prioridad
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-slate-500 dark:text-slate-400 font-medium">Concejalía:</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${cStyle.badgeClass}`}>
                            {project.concejalia || 'Economía y Hacienda'}
                          </span>
                          {project.parentProjectName && (
                            <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800/50">
                              📦 Macro: {project.parentProjectName}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Fila 2: Barra de herramientas de acciones y contador de tareas */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-700/50">
                    <div className="flex items-center gap-3">
                      <div className="w-24 sm:w-32 bg-slate-100 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                        <div 
                          className="bg-amber-500 h-full rounded-full transition-all duration-300"
                          style={{ width: `${percent}%` }}
                        ></div>
                      </div>
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {completedCount}/{totalCount} ({percent}%)
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          exportExpedientToPDF(project, projectTasks);
                        }}
                        className="px-2.5 py-1 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 font-bold text-[11px] rounded-lg border border-rose-200 dark:border-rose-800/60 transition-all flex items-center gap-1 cursor-pointer"
                        title="Exportar en PDF"
                      >
                        📄 PDF
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          exportExpedientToCSV(project, projectTasks);
                        }}
                        className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-bold text-[11px] rounded-lg border border-emerald-200 dark:border-emerald-800/60 transition-all flex items-center gap-1 cursor-pointer"
                        title="Exportar a Excel"
                      >
                        📊 XLS
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleCopyClipboard(project, projectTasks, e)}
                        className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold text-[11px] rounded-lg border border-indigo-200 dark:border-indigo-800/60 transition-all flex items-center gap-1 cursor-pointer"
                        title="Copiar Texto para WhatsApp / Correo"
                      >
                        📋 TXT
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onSelectProject) {
                            onSelectProject({
                              ...project,
                              userId: user.uid
                            });
                          }
                        }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all cursor-pointer"
                        title="Editar Contrato"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleDeleteExpedienteDirect(project.id!, project.name, e)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all cursor-pointer"
                        title="Eliminar Contrato Menor completo"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>
                </div>

                {/* TAREAS DE CONTRATO MENOR */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 sm:px-6 bg-slate-50/50 dark:bg-slate-900/30 border-t border-slate-100 dark:border-slate-700/50">
                    {projectTasks.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-2 pl-6">No hay tareas registradas en este contrato menor.</p>
                    ) : (
                      <div className="pl-4 sm:pl-6 border-l-2 border-amber-300 dark:border-amber-700 space-y-2 py-2">
                        {projectTasks.map((tarea) => {
                          const isCompleted = tarea.status === 'completed' || !!tarea.completada;
                          const taskNote = tarea.notas || tarea.notes;
                          const isSelected = !!tarea.id && selectedTaskIds.includes(tarea.id);

                          return (
                            <div
                              key={tarea.id}
                              onClick={() => onSelectTask(tarea)}
                              className={`p-3 rounded-xl flex items-center justify-between gap-3 border transition-all shadow-2xs cursor-pointer ${
                                isSelected
                                  ? 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-500 ring-2 ring-amber-500/30'
                                  : (isCompleted 
                                      ? 'bg-white/60 dark:bg-slate-800/60 border-slate-100 dark:border-slate-700/60 opacity-70' 
                                      : getPriorityStyle(tarea.prioridad, (tarea as any).priority))
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
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
                                  className={`w-4 h-4 rounded border flex items-center justify-center text-[9px] font-black transition-all cursor-pointer shrink-0 ${
                                    isSelected
                                      ? 'bg-amber-600 border-amber-600 text-white shadow-xs'
                                      : 'border-slate-300 dark:border-slate-600 bg-white/80 dark:bg-slate-800 text-transparent hover:border-amber-400'
                                  }`}
                                  title={isSelected ? 'Desmarcar trámite' : 'Seleccionar para edición en masa'}
                                >
                                  ✓
                                </button>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCompleteTask(tarea.id!, isCompleted);
                                  }}
                                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                                    isCompleted 
                                      ? 'bg-emerald-500 border-emerald-500 text-white' 
                                      : 'border-slate-300 dark:border-slate-600 hover:border-amber-500'
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
                                {getPriorityBadge(tarea.prioridad, (tarea as any).priority)}
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

      {/* MODAL DE MACRO-EXPEDIENTE */}
      {isMacroModalOpen && (
        <MacroExpedienteModal
          user={user}
          onClose={() => setIsMacroModalOpen(false)}
        />
      )}

      {isCreatingBuilder && (
        <ExpedienteBuilderModal
          user={user}
          onClose={() => setIsCreatingBuilder(false)}
        />
      )}

      {/* BARRA FLOTANTE DE ACCIONES MASIVAS */}
      <BulkTaskActionBar
        selectedTaskIds={selectedTaskIds}
        tasks={allTareas}
        concejaliasList={concejaliasList}
        onClearSelection={() => setSelectedTaskIds([])}
        onSelectAll={() => {
          if (selectedTaskIds.length === allTareas.length) {
            setSelectedTaskIds([]);
          } else {
            setSelectedTaskIds(allTareas.map(t => t.id!).filter(Boolean));
          }
        }}
        isAllSelected={allTareas.length > 0 && selectedTaskIds.length === allTareas.length}
      />
    </div>
  );
}
