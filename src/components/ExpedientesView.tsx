import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { User } from 'firebase/auth';
import { Tarea, Project } from '../types';
import TemplateSelectorModal from './TemplateSelectorModal';
import ExpedienteBuilderModal from './ExpedienteBuilderModal';
import MacroExpedienteModal from './MacroExpedienteModal';
import BulkTaskActionBar from './BulkTaskActionBar';
import { getConcejaliaStyle, getPriorityStyle, getPriorityBadgeClass } from '../utils/concejaliaColors';
import { exportExpedientToPDF, exportExpedientToCSV, copyExpedientTasksToClipboard, exportConcejaliaReportToPDF, exportConcejaliaReportToCSV } from '../utils/exportUtils';
import { useConcejalias } from '../hooks/useConcejalias';

interface Props {
  user: User;
  searchQuery?: string;
  onSelectTask: (tarea: Tarea) => void;
  onSelectProject?: (project: Project) => void;
}

type ExpedienteStatusFilter = 'todos' | 'activos' | 'completados' | 'archivados';
type TaskStatusFilter = 'todos' | 'todo' | 'in_progress' | 'waiting_on_third_party' | 'completed';

export default function ExpedientesView({ user, searchQuery = '', onSelectTask, onSelectProject }: Props) {
  const concejaliasList = useConcejalias(user.uid);
  const [projects, setProjects] = useState<Project[]>([]);
  const [allTareas, setAllTareas] = useState<Tarea[]>([]);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [isCreatingExpediente, setIsCreatingExpediente] = useState(false);
  const [isCreatingBuilder, setIsCreatingBuilder] = useState(false);
  const [isMacroModalOpen, setIsMacroModalOpen] = useState(false);
  const [selectedMacroProjectForAdd, setSelectedMacroProjectForAdd] = useState<Project | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);

  // Filtros
  const [concejaliaFilter, setConcejaliaFilter] = useState<string>('todas');
  const [expedienteStatusFilter, setExpedienteStatusFilter] = useState<ExpedienteStatusFilter>('todos');
  const [taskStatusFilter, setTaskStatusFilter] = useState<TaskStatusFilter>('todos');
  const [copySuccessMsg, setCopySuccessMsg] = useState<string | null>(null);

  // Escuchar documentos de expedientes (isProject: true en /tareas)
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

  // Escuchar todas las tareas para vincularlas a proyectos
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
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
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
    if (!window.confirm(`¿Eliminar el expediente "${projectName}" y TODAS sus tareas asociadas?`)) return;
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

  // Combinar proyectos explícitos con proyectos derivados de la colección tareas
  const effectiveProjectsMap: Record<string, Project> = {};

  projects.forEach((p) => {
    if (p.id) effectiveProjectsMap[p.id] = p;
  });

  allTareas.forEach((t) => {
    if (t.projectId && !effectiveProjectsMap[t.projectId]) {
      effectiveProjectsMap[t.projectId] = {
        id: t.projectId,
        name: t.projectName || 'Expediente Sin Nombre',
        type: 'custom',
        concejalia: t.concejalia || t.projectConcejalia || t.projectMasterCategory || 'General',
        status: 'active',
        expedientCode: t.expedientCode,
        linkedExpedientId: t.linkedExpedientId,
        userId: t.userId
      };
    } else if (t.projectId && effectiveProjectsMap[t.projectId]) {
      if (!effectiveProjectsMap[t.projectId].expedientCode && t.expedientCode) {
        effectiveProjectsMap[t.projectId].expedientCode = t.expedientCode;
      }
      if (!effectiveProjectsMap[t.projectId].linkedExpedientId && t.linkedExpedientId) {
        effectiveProjectsMap[t.projectId].linkedExpedientId = t.linkedExpedientId;
      }
    }
  });

  const effectiveProjects = Object.values(effectiveProjectsMap);

  // Lista de concejalías únicas para el desplegable de filtro
  const availableConcejalias = Array.from(
    new Set(effectiveProjects.map((p) => p.concejalia || 'General'))
  ).sort();

  // Filtrado de proyectos por Estado e Identificación de Contratos Menores
  const getProjectEffectiveStatus = (proj: Project): 'active' | 'completed' | 'archived' => {
    if (proj.status === 'archived') return 'archived';
    const projTasks = allTareas.filter((t) => t.projectId === proj.id);
    if (projTasks.length > 0 && projTasks.every((t) => t.status === 'completed' || t.completada)) {
      return 'completed';
    }
    return 'active';
  };

  const isContratoMenorProject = (proj: Project): boolean => {
    if (proj.type === 'contrato_menor' || proj.isContratoMenor) return true;
    const projTasks = allTareas.filter(t => t.projectId === proj.id);
    return projTasks.some(t => (t as any).isContratoMenor || (t as any).templateId === 'contrato_menor');
  };

  // Filtrado de tareas según taskStatusFilter
  const filterTaskByStatus = (t: Tarea): boolean => {
    if (taskStatusFilter === 'todos') return true;
    const isCompleted = t.status === 'completed' || !!t.completada;
    if (taskStatusFilter === 'todo') return !isCompleted && (t.status === 'todo' || !t.status);
    if (taskStatusFilter === 'in_progress') return !isCompleted && t.status === 'in_progress';
    if (taskStatusFilter === 'waiting_on_third_party') return !isCompleted && t.status === 'waiting_on_third_party';
    if (taskStatusFilter === 'completed') return isCompleted;
    return true;
  };

  // Agrupar proyectos por Concejalía
  const concejaliaGroups: Record<string, Project[]> = {};

  effectiveProjects.forEach((proj) => {
    const groupName = proj.concejalia || 'General';

    if (concejaliaFilter !== 'todas' && groupName !== concejaliaFilter) {
      return;
    }

    const effStatus = getProjectEffectiveStatus(proj);
    if (expedienteStatusFilter !== 'todos' && effStatus !== expedienteStatusFilter) {
      return;
    }

    const projTasks = allTareas.filter((t) => t.projectId === proj.id);
    if (taskStatusFilter !== 'todos') {
      const hasMatchingTask = projTasks.some(filterTaskByStatus);
      if (!hasMatchingTask && projTasks.length > 0) return;
    }

    if (!concejaliaGroups[groupName]) concejaliaGroups[groupName] = [];
    concejaliaGroups[groupName].push(proj);
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
    switch (status) {
      case 'in_progress':
        return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">En curso</span>;
      case 'waiting_on_third_party':
        return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Retenido{blockedBy ? `: ${blockedBy}` : ''}</span>;
      case 'completed':
        return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Completada</span>;
      default:
        return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">Pendiente</span>;
    }
  };

  const renderProjectStatusBadge = (status: 'active' | 'completed' | 'archived') => {
    switch (status) {
      case 'completed':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">✅ Completado</span>;
      case 'archived':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600">📦 Archivado</span>;
      default:
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800">🟢 Activo</span>;
    }
  };

  const filteredConcejaliaNames = Object.keys(concejaliaGroups).filter((cName) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    if (cName.toLowerCase().includes(q)) return true;
    return concejaliaGroups[cName].some((p) =>
      p.name.toLowerCase().includes(q) ||
      (p.expedientCode && p.expedientCode.toLowerCase().includes(q)) ||
      allTareas.some(t => t.projectId === p.id && (t.titulo?.toLowerCase().includes(q) || t.title?.toLowerCase().includes(q) || t.notas?.toLowerCase().includes(q)))
    );
  });

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6 animate-fade-in">
      
      {/* MENSAJE DE COPIADO EXITOSO */}
      {copySuccessMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs sm:text-sm font-semibold px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 border border-slate-700 animate-bounce">
          <span>📋</span> {copySuccessMsg}
        </div>
      )}

      {/* HEADER SECTION */}
      <section className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Árbol de Expedientes</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Jerarquía completa por Concejalía, Expedientes y Tareas Hijas</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2.5">
          <button 
            onClick={() => exportConcejaliaReportToPDF(concejaliaFilter !== 'todas' ? concejaliaFilter : 'General', effectiveProjects, allTareas)}
            className="px-3.5 py-2 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 font-bold text-xs rounded-xl border border-rose-200 dark:border-rose-800 transition-all flex items-center gap-1.5 cursor-pointer"
            title="Exportar informe en PDF"
          >
            <span>📄</span> Informe PDF
          </button>
          
          <button 
            onClick={() => exportConcejaliaReportToCSV(concejaliaFilter !== 'todas' ? concejaliaFilter : 'General', effectiveProjects, allTareas)}
            className="px-3.5 py-2 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-bold text-xs rounded-xl border border-emerald-200 dark:border-emerald-800 transition-all flex items-center gap-1.5 cursor-pointer"
            title="Exportar a Microsoft Excel"
          >
            <span>📊</span> Excel
          </button>

          <button 
            onClick={() => {
              setSelectedMacroProjectForAdd(null);
              setIsMacroModalOpen(true);
            }}
            className="px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-700 hover:to-amber-600 text-white font-semibold text-xs rounded-xl shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
          >
            <span>📦</span> Nuevo Macro-Expediente
          </button>

          <button 
            onClick={() => setIsCreatingBuilder(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
          >
            <span>⚡</span> Constructor Dinámico
          </button>
          
          <button 
            onClick={() => setIsCreatingExpediente(true)}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-semibold text-xs rounded-xl transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
          >
            <span>📋</span> Plantillas Recurrentes
          </button>
        </div>
      </section>

      {/* BARRA DE FILTROS AVANZADOS (Concejalía + Estado Expediente + Estado Tarea) */}
      <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 p-3.5 rounded-2xl shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
        {/* Selector de Concejalía */}
        <div className="flex items-center gap-2 min-w-[200px]">
          <span className="font-bold text-slate-500 dark:text-slate-400 shrink-0">🏛️ Concejalía:</span>
          <select
            value={concejaliaFilter}
            onChange={(e) => setConcejaliaFilter(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-500"
          >
            <option value="todas">Todas las concejalías ({effectiveProjects.length})</option>
            {availableConcejalias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Filtro por Estado de Expediente */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-700/50 p-1 rounded-xl shrink-0 overflow-x-auto no-scrollbar flex-nowrap max-w-full">
          <span className="font-bold text-slate-400 dark:text-slate-500 px-1 text-[11px]">Expediente:</span>
          {(['todos', 'activos', 'completados', 'archivados'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setExpedienteStatusFilter(st)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer capitalize shrink-0 ${
                expedienteStatusFilter === st
                  ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Filtro por Estado de Tareas Hijas */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-700/50 p-1 rounded-xl shrink-0 overflow-x-auto no-scrollbar flex-nowrap max-w-full">
          <span className="font-bold text-slate-400 dark:text-slate-500 px-1 text-[11px]">Trámites:</span>
          {[
            { key: 'todos', label: 'Todos' },
            { key: 'todo', label: 'Pendientes' },
            { key: 'in_progress', label: 'En Curso' },
            { key: 'waiting_on_third_party', label: '⚠️ Retenidos' },
            { key: 'completed', label: 'Completados' }
          ].map((tOpt) => (
            <button
              key={tOpt.key}
              onClick={() => setTaskStatusFilter(tOpt.key as TaskStatusFilter)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer shrink-0 ${
                taskStatusFilter === tOpt.key
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {tOpt.label}
            </button>
          ))}
        </div>
      </section>

      {/* ÁRBOL JERÁRQUICO */}
      {filteredConcejaliaNames.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700">
          <svg className="w-16 h-16 mx-auto text-slate-300 dark:text-slate-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          <p className="text-slate-500 dark:text-slate-400 font-medium">No se encontraron expedientes con los filtros seleccionados</p>
        </div>
      ) : (
        <div className="space-y-8">
          {filteredConcejaliaNames.map((concejaliaName) => {
            const projectsInGroup = concejaliaGroups[concejaliaName];
            const cStyle = getConcejaliaStyle(concejaliaName);

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

            // Identificar proyectos macro
            const isMacroProjectCheck = (p: Project) => {
              return p.isMacroProject === true || p.type === 'macro_expediente' || projectsInGroup.some(sub => sub.parentProjectId === p.id);
            };

            // Macro-Expedientes
            const macroProjectsInGroup = projectsInGroup.filter(p => isMacroProjectCheck(p));

            // Expedientes Ordinarios (no macro y no sub-contratos)
            const regularProjectsInGroup = projectsInGroup.filter(p => !isMacroProjectCheck(p) && !p.parentProjectId && !isContratoMenorProject(p));

            // Contratos Menores Independientes (sin macro padre)
            const standaloneCMProjects = projectsInGroup.filter(p => !isMacroProjectCheck(p) && !p.parentProjectId && isContratoMenorProject(p));

            const isSubfolderExpanded = expandedProjects.has(`subfolder_cm_${concejaliaName}`);

            // RENDER DE TARJETA DE PROYECTO / CONTRATO MENOR ESTÁNDAR
            const renderProjectCard = (project: Project, isNested: boolean = false) => {
              const isExpanded = expandedProjects.has(project.id!);
              const projectTasks = sortTasksNaturally(allTareas.filter(t => t.projectId === project.id));
              const completedCount = projectTasks.filter(t => t.status === 'completed' || t.completada).length;
              const totalCount = projectTasks.length;
              const projCStyle = getConcejaliaStyle(project.concejalia);
              const effStatus = getProjectEffectiveStatus(project);

              const hasHighPriority = projectTasks.some(t => {
                const p = (t.prioridad || (t as any).priority || '').toLowerCase();
                return p === 'alta' || p === 'high' || p === 'urgente' || p === 'urgent';
              });

              return (
                <div 
                  key={project.id}
                  data-project-card="true"
                  className={`bg-white dark:bg-slate-800 border-t border-r border-b border-slate-200 dark:border-slate-700/80 border-l-4 ${projCStyle.borderL} rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 ${isNested ? 'bg-slate-50/50 dark:bg-slate-800/60' : ''}`}
                >
                  {/* CABECERA EXPEDIENTE */}
                  <div 
                    onClick={() => toggleProject(project.id!)}
                    className="p-4 sm:p-5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors space-y-3"
                  >
                    {/* Fila 1: Título completo, código EXP y distintivo concejalía */}
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
                              {isContratoMenorProject(project) ? '📜' : '📁'} {project.name}
                            </h3>
                            {project.expedientCode && (
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shrink-0">
                                {project.expedientCode}
                              </span>
                            )}
                            {renderProjectStatusBadge(effStatus)}
                            {hasHighPriority && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 shrink-0">
                                🔴 Alta Prioridad
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="text-slate-500 dark:text-slate-400 font-medium">Concejalía:</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${projCStyle.badgeClass}`}>
                              {project.concejalia}
                            </span>
                            {project.parentProjectName && (
                              <span className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                                📦 Macro: {project.parentProjectName}
                              </span>
                            )}
                            {(() => {
                              const linkedParent = project.linkedExpedientId && !project.parentProjectName
                                ? effectiveProjects.find(p => p.id === project.linkedExpedientId || p.expedientCode === project.linkedExpedientId) 
                                : null;
                              if (!linkedParent) return null;
                              return (
                                <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium flex items-center gap-1">
                                  🔗 Vinculado a: {linkedParent.expedientCode ? `${linkedParent.expedientCode} - ` : ''}{linkedParent.name}
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Fila 2: Barra de herramientas de acciones y contador de tareas */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-700/50">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700/60 px-2.5 py-1 rounded-full">
                          {completedCount}/{totalCount} tareas ({totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0}%)
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
                          title="Exportar expediente en PDF"
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
                          title="Exportar expediente a Excel"
                        >
                          📊 XLS
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleCopyClipboard(project, projectTasks, e)}
                          className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold text-[11px] rounded-lg border border-indigo-200 dark:border-indigo-800/60 transition-all flex items-center gap-1 cursor-pointer"
                          title="Copiar lista para WhatsApp / Correo"
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
                          className="px-2.5 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold text-[11px] rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                          title="Ver y editar ficha completa del expediente"
                        >
                          ⚙️ Ficha
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteExpedienteDirect(project.id!, project.name, e)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all cursor-pointer"
                          title="Eliminar este expediente y sus tareas"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* NIVEL 3: TAREAS HIJAS (EXPANDIBLE) */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 dark:border-slate-700 p-4 bg-slate-50/50 dark:bg-slate-900/30 space-y-2">
                      {projectTasks.length === 0 ? (
                        <p className="text-xs text-slate-400 dark:text-slate-500 italic py-2 text-center">
                          No hay tareas registradas en este expediente
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {projectTasks.map((tarea) => {
                            const isCompleted = tarea.status === 'completed' || !!tarea.completada;
                            const taskNote = tarea.notes || tarea.notas;
                            const isSelected = !!tarea.id && selectedTaskIds.includes(tarea.id);

                            return (
                              <div
                                key={tarea.id}
                                onClick={() => onSelectTask(tarea)}
                                className={`p-3 rounded-xl flex items-center justify-between gap-3 border transition-all shadow-2xs cursor-pointer ${
                                  isSelected
                                    ? 'bg-indigo-50/90 dark:bg-indigo-950/40 border-indigo-500 ring-2 ring-indigo-500/30'
                                    : (isCompleted 
                                        ? 'bg-white/60 dark:bg-slate-800/60 border-slate-100 dark:border-slate-700/60 opacity-70' 
                                        : getPriorityStyle(tarea.prioridad, (tarea as any).priority))
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
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
                                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                                        : 'border-slate-300 dark:border-slate-600 bg-white/80 dark:bg-slate-800 text-transparent hover:border-indigo-400'
                                    }`}
                                    title={isSelected ? 'Desmarcar tarea' : 'Seleccionar para edición en masa'}
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
                                    <p className={`text-sm font-medium truncate ${isCompleted ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-200'}`}>
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
                                  {getStatusBadge(tarea.status, tarea.blockedBy)}
                                  {getPriorityBadge(tarea.prioridad, (tarea as any).priority)}
                                  <span className="text-[11px] font-medium text-slate-400 bg-slate-100 dark:bg-slate-700/50 px-2 py-0.5 rounded">
                                    {tarea.estimatedTimeMin ? `${tarea.estimatedTimeMin} min` : tarea.tiempo_estimado}
                                  </span>
                                  <button
                                    onClick={(e) => handleDeleteTaskDirect(tarea.id!, e)}
                                    className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all shrink-0 cursor-pointer"
                                    title="Eliminar tarea directamente"
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
            };

            // RENDER DE MACRO-EXPEDIENTE (ESTRUCTURA DE 3 NIVELES)
            const renderMacroProjectCard = (macroProj: Project) => {
              const isExpanded = expandedProjects.has(macroProj.id!);
              const childCMs = projectsInGroup.filter(p => p.parentProjectId === macroProj.id);
              
              // Todas las tareas de todos los sub-contratos
              const allChildTasks = allTareas.filter(t => t.parentProjectId === macroProj.id || t.projectId === macroProj.id);
              const completedChildCount = allChildTasks.filter(t => t.status === 'completed' || t.completada).length;
              const totalChildCount = allChildTasks.length;
              const percent = totalChildCount > 0 ? Math.round((completedChildCount / totalChildCount) * 100) : 0;
              const effStatus = getProjectEffectiveStatus(macroProj);

              return (
                <div 
                  key={macroProj.id}
                  className="bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-indigo-500/5 dark:from-amber-950/30 dark:via-slate-800 dark:to-indigo-950/20 border-2 border-amber-400/80 dark:border-amber-600/60 rounded-3xl overflow-hidden shadow-md space-y-0 transition-all"
                >
                  {/* CABECERA MACRO-EXPEDIENTE */}
                  <div 
                    onClick={() => toggleProject(macroProj.id!)}
                    className="p-5 cursor-pointer hover:bg-amber-50/60 dark:hover:bg-amber-900/20 transition-colors space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <button className="w-9 h-9 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                          <svg 
                            className={`w-5 h-5 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                          </svg>
                        </button>

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500 text-white shadow-xs">
                              📦 Macro-Expediente
                            </span>
                            <h3 
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onSelectProject) onSelectProject({ ...macroProj, userId: user.uid });
                              }}
                              className="font-black text-slate-900 dark:text-slate-50 text-base sm:text-lg leading-snug break-words hover:text-amber-600 dark:hover:text-amber-400 cursor-pointer"
                            >
                              {macroProj.name}
                            </h3>
                            {macroProj.expedientCode && (
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
                                {macroProj.expedientCode}
                              </span>
                            )}
                            {renderProjectStatusBadge(effStatus)}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span>Concejalía: <strong className="text-slate-700 dark:text-slate-200">{macroProj.concejalia}</strong></span>
                            <span>•</span>
                            <span className="font-semibold text-amber-700 dark:text-amber-300">
                              {childCMs.length} Contratos Menores ({totalChildCount} trámites totales)
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* BARRA DE ACCIONES DEL MACRO-EXPEDIENTE */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-amber-200/60 dark:border-amber-800/40">
                      <div className="flex items-center gap-2">
                        <div className="w-32 bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                          <div className="bg-amber-500 h-full transition-all duration-300" style={{ width: `${percent}%` }}></div>
                        </div>
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                          {percent}% ({completedChildCount}/{totalChildCount})
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedMacroProjectForAdd(macroProj);
                            setIsMacroModalOpen(true);
                          }}
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <span>➕</span> Añadir Contrato Menor
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onSelectProject) onSelectProject({ ...macroProj, userId: user.uid });
                          }}
                          className="px-2.5 py-1.5 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs rounded-xl border border-slate-200 dark:border-slate-600 transition-all cursor-pointer"
                        >
                          ⚙️ Ficha
                        </button>

                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!window.confirm(`¿Eliminar el Macro-Expediente "${macroProj.name}", todos sus ${childCMs.length} contratos menores y sus ${totalChildCount} tareas asociadas?`)) return;
                            try {
                              const batch = writeBatch(db);
                              // Eliminar tareas hijas
                              allChildTasks.forEach(t => {
                                if (t.id) batch.delete(doc(db, 'tareas', t.id));
                              });
                              // Eliminar sub-proyectos
                              childCMs.forEach(cm => {
                                if (cm.id) batch.delete(doc(db, 'tareas', cm.id));
                              });
                              // Eliminar proyecto marco
                              batch.delete(doc(db, 'tareas', macroProj.id!));
                              await batch.commit();
                            } catch (err) {
                              console.error("Error deleting macro project: ", err);
                            }
                          }}
                          className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all cursor-pointer"
                          title="Eliminar Macro-Expediente completo"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* LISTA DE SUB-CONTRATOS MENORES ANIDADOS (NIVEL 2 Y 3) */}
                  {isExpanded && (
                    <div className="p-4 sm:p-6 bg-white/80 dark:bg-slate-900/60 border-t-2 border-amber-300 dark:border-amber-700/60 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                          <span>📜</span> Sub-Contratos Menores asociados ({childCMs.length}):
                        </h4>
                        <span className="text-[11px] text-slate-400">
                          Despliega cada uno para ver sus trámites
                        </span>
                      </div>

                      {childCMs.length === 0 ? (
                        <div className="p-6 text-center bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
                          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                            Aún no hay contratos menores añadidos a este macro-expediente.
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedMacroProjectForAdd(macroProj);
                              setIsMacroModalOpen(true);
                            }}
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
                          >
                            + Añadir Lote de Contratos Menores
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3 pl-2 sm:pl-4 border-l-2 border-amber-300 dark:border-amber-700">
                          {childCMs.map((cmProj) => renderProjectCard(cmProj, true))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            };

            return (
              <div key={concejaliaName} className="space-y-4">
                
                {/* NIVEL 1: ENCABEZADO DE CONCEJALÍA */}
                <div className="flex items-center gap-3 pb-2 border-b-2 border-slate-200 dark:border-slate-700">
                  <div className={`w-3.5 h-3.5 rounded-full ${cStyle.dot}`}></div>
                  <h2 className={`text-lg font-bold ${cStyle.text} tracking-tight`}>
                    {concejaliaName}
                  </h2>
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${cStyle.badgeClass}`}>
                    {projectsInGroup.length} {projectsInGroup.length === 1 ? 'expediente' : 'expedientes'}
                  </span>
                </div>

                {/* NIVEL 2: LISTA DE EXPEDIENTES */}
                <div className="grid grid-cols-1 gap-4 pl-2 sm:pl-4 border-l-2 border-slate-100 dark:border-slate-800">
                  
                  {/* 1. MACRO-EXPEDIENTES (3 NIVELES) */}
                  {macroProjectsInGroup.map((macroProj) => renderMacroProjectCard(macroProj))}

                  {/* 2. EXPEDIENTES ORDINARIOS */}
                  {regularProjectsInGroup.map((project) => renderProjectCard(project))}

                  {/* 3. SUBCARPETA DE CONTRATOS MENORES INDEPENDIENTES */}
                  {standaloneCMProjects.length > 0 && (
                    <div className="bg-amber-50/40 dark:bg-amber-950/20 border-2 border-amber-300 dark:border-amber-700/60 rounded-2xl overflow-hidden shadow-sm">
                      <div
                        onClick={() => toggleProject(`subfolder_cm_${concejaliaName}`)}
                        className="p-4 sm:p-5 flex items-center justify-between cursor-pointer hover:bg-amber-100/50 dark:hover:bg-amber-900/30 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <button className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                            <svg 
                              className={`w-4 h-4 transition-transform duration-200 ${isSubfolderExpanded ? 'rotate-90' : ''}`}
                              fill="none" stroke="currentColor" viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                          <div>
                            <h3 className="font-extrabold text-amber-900 dark:text-amber-200 text-sm sm:text-base flex items-center gap-2">
                              <span>📜</span> Contratos Menores Independientes ({standaloneCMProjects.length})
                            </h3>
                            <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                              Contratos menores sueltos de {concejaliaName}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* CONTRATOS MENORES DESPLEGADOS */}
                      {isSubfolderExpanded && (
                        <div className="p-4 pt-2 border-t border-amber-200 dark:border-amber-800/50 space-y-4">
                          {standaloneCMProjects.map((cmProj) => renderProjectCard(cmProj))}
                        </div>
                      )}
                    </div>
                  )}

                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL DE MACRO-EXPEDIENTE */}
      {isMacroModalOpen && (
        <MacroExpedienteModal
          user={user}
          onClose={() => {
            setIsMacroModalOpen(false);
            setSelectedMacroProjectForAdd(null);
          }}
          existingMacroProject={selectedMacroProjectForAdd}
        />
      )}

      {/* MODALES DE CREACIÓN */}
      {isCreatingBuilder && (
        <ExpedienteBuilderModal 
          user={user}
          onClose={() => setIsCreatingBuilder(false)}
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
