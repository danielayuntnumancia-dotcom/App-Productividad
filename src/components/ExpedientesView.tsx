import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { User } from 'firebase/auth';
import { Tarea, Project } from '../types';
import TemplateSelectorModal from './TemplateSelectorModal';
import ExpedienteBuilderModal from './ExpedienteBuilderModal';
import { getConcejaliaStyle } from '../utils/concejaliaColors';
import { useConcejalias } from '../hooks/useConcejalias';

interface Props {
  user: User;
  searchQuery?: string;
  onSelectTask: (tarea: Tarea) => void;
  onSelectProject?: (project: Project) => void;
}

export default function ExpedientesView({ user, searchQuery = '', onSelectTask, onSelectProject }: Props) {
  const concejaliasList = useConcejalias(user.uid);
  const [projects, setProjects] = useState<Project[]>([]);
  const [allTareas, setAllTareas] = useState<Tarea[]>([]);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [isCreatingExpediente, setIsCreatingExpediente] = useState(false);
  const [isCreatingBuilder, setIsCreatingBuilder] = useState(false);

  // Estados locales de filtrado y búsqueda avanzada
  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery);
  const [selectedConcejalia, setSelectedConcejalia] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<'ALL' | 'active' | 'completed' | 'archived'>('ALL');

  useEffect(() => {
    setLocalSearchQuery(searchQuery);
  }, [searchQuery]);

  // Escuchar documentos de expedientes (isProject: true en /tareas y /projects)
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
      if (projectId) {
        batch.delete(doc(db, 'tareas', projectId));
      }
      await batch.commit();
    } catch (err) {
      console.error("Error deleting expediente batch: ", err);
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

  // Calcular el estado efectivo de un expediente (Asignado explícitamente o derivado si todas sus tareas están completas)
  const getProjectEffectiveStatus = (proj: Project): 'active' | 'completed' | 'archived' => {
    if (proj.status === 'archived') return 'archived';
    if (proj.status === 'completed') return 'completed';
    
    const projTasks = allTareas.filter(t => t.projectId === proj.id);
    if (projTasks.length > 0) {
      const allCompleted = projTasks.every(t => t.status === 'completed' || t.completada);
      if (allCompleted) return 'completed';
    }
    return 'active';
  };

  // Renderizar insignia de estado del proyecto
  const renderProjectStatusBadge = (status: 'active' | 'completed' | 'archived') => {
    switch (status) {
      case 'archived':
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 shrink-0">📦 Archivado</span>;
      case 'completed':
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shrink-0">✅ Completado</span>;
      default:
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shrink-0">🟢 Activo</span>;
    }
  };

  // Filtrar expedientes según los tres criterios combinados (Buscador, Concejalía, Estado)
  const filteredProjects = effectiveProjects.filter((proj) => {
    // 1. Filtro de concejalía
    if (selectedConcejalia !== 'ALL' && (proj.concejalia || 'General') !== selectedConcejalia) {
      return false;
    }

    // 2. Filtro de estado
    const effectiveStatus = getProjectEffectiveStatus(proj);
    if (selectedStatus !== 'ALL' && effectiveStatus !== selectedStatus) {
      return false;
    }

    // 3. Filtro de búsqueda textual (Código EXP, Nombre de expediente, Concejalía, o tareas/notas asociadas)
    if (localSearchQuery.trim()) {
      const q = localSearchQuery.toLowerCase();
      const codeMatch = proj.expedientCode ? proj.expedientCode.toLowerCase().includes(q) : false;
      const nameMatch = proj.name ? proj.name.toLowerCase().includes(q) : false;
      const concejaliaMatch = proj.concejalia ? proj.concejalia.toLowerCase().includes(q) : false;
      
      const taskMatch = allTareas.some(t => t.projectId === proj.id && (
        (t.titulo && t.titulo.toLowerCase().includes(q)) ||
        (t.title && t.title.toLowerCase().includes(q)) ||
        (t.notas && t.notas.toLowerCase().includes(q)) ||
        (t.notes && t.notes.toLowerCase().includes(q))
      ));

      return codeMatch || nameMatch || concejaliaMatch || taskMatch;
    }

    return true;
  });

  // Agrupar proyectos filtrados por Concejalía
  const concejaliaGroups: Record<string, Project[]> = {};

  filteredProjects.forEach((proj) => {
    const groupName = proj.concejalia || 'General';
    if (!concejaliaGroups[groupName]) concejaliaGroups[groupName] = [];
    concejaliaGroups[groupName].push(proj);
  });

  // Identificar si un expediente es Contrato Menor
  const isContratoMenorProject = (p: Project | any): boolean => {
    if (p.isContratoMenor) return true;
    if (p.templateId === 'contrato_menor' || p.type === 'contrato_menor') return true;
    const nameLower = (p.name || p.projectName || '').toLowerCase();
    return nameLower.includes('contrato menor') || nameLower.includes('contrato m');
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

  const concejaliaNames = Object.keys(concejaliaGroups);
  const isFilteringActive = localSearchQuery.trim() !== '' || selectedConcejalia !== 'ALL' || selectedStatus !== 'ALL';

  const resetFilters = () => {
    setLocalSearchQuery('');
    setSelectedConcejalia('ALL');
    setSelectedStatus('ALL');
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6 animate-fade-in">
      
      {/* HEADER SECTION */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Árbol de Expedientes</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Jerarquía completa por Concejalía, Expedientes y Tareas Hijas</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2.5">
          <button 
            onClick={() => setIsCreatingBuilder(true)}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            ⚡ Constructor Dinámico
          </button>
          
          <button 
            onClick={() => setIsCreatingExpediente(true)}
            className="px-4 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Plantillas Recurrentes
          </button>
        </div>
      </section>

      {/* BARRA DE HERRAMIENTAS: BUSCADOR Y FILTROS AVANZADOS */}
      <section className="bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          
          {/* BUSCADOR TEXTUAL */}
          <div className="md:col-span-6 relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={localSearchQuery}
              onChange={(e) => setLocalSearchQuery(e.target.value)}
              placeholder="Buscar por Expediente (EXP-2026-XXXX), nombre o tareas..."
              className="w-full pl-10 pr-10 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
            {localSearchQuery && (
              <button
                onClick={() => setLocalSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            )}
          </div>

          {/* FILTRO POR CONCEJALÍA */}
          <div className="md:col-span-3">
            <select
              value={selectedConcejalia}
              onChange={(e) => setSelectedConcejalia(e.target.value)}
              className="w-full py-2.5 px-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            >
              <option value="ALL">🏛️ Todas las Concejalías</option>
              {Array.from(new Set([...concejaliasList, ...effectiveProjects.map(p => p.concejalia).filter(Boolean)])).map((cName) => (
                <option key={cName} value={cName}>{cName}</option>
              ))}
            </select>
          </div>

          {/* FILTRO POR ESTADO DEL EXPEDIENTE */}
          <div className="md:col-span-3">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as any)}
              className="w-full py-2.5 px-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            >
              <option value="ALL">📋 Todos los Estados</option>
              <option value="active">🟢 Activos</option>
              <option value="completed">✅ Completados</option>
              <option value="archived">📦 Archivados</option>
            </select>
          </div>

        </div>

        {/* RESUMEN DE RESULTADOS Y BOTÓN DE LIMPIAR FILTROS */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700/50 text-xs">
          <span className="font-semibold text-slate-500 dark:text-slate-400">
            Mostrando <strong className="text-indigo-600 dark:text-indigo-400 font-bold">{filteredProjects.length}</strong> de {effectiveProjects.length} expedientes
          </span>

          {isFilteringActive && (
            <button
              onClick={resetFilters}
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 flex items-center gap-1 cursor-pointer transition-colors"
            >
              <span>✕ Limpiar Filtros</span>
            </button>
          )}
        </div>
      </section>

      {/* ÁRBOL JERÁRQUICO */}
      {concejaliaNames.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700">
          <svg className="w-16 h-16 mx-auto text-slate-300 dark:text-slate-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          <p className="text-slate-500 dark:text-slate-400 font-medium">No se encontraron expedientes con los filtros aplicados</p>
          {isFilteringActive && (
            <button
              onClick={resetFilters}
              className="mt-3 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-bold rounded-xl text-xs"
            >
              Restablecer Filtros
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {concejaliaNames.map((concejaliaName) => {
            const projectsInGroup = concejaliaGroups[concejaliaName];
            const cStyle = getConcejaliaStyle(concejaliaName);

            const cmProjectsInGroup = projectsInGroup.filter(isContratoMenorProject);
            const regularProjectsInGroup = projectsInGroup.filter(p => !isContratoMenorProject(p));
            const isSubfolderExpanded = expandedProjects.has(`folder_cm_${concejaliaName}`);

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

            const renderProjectCard = (project: Project) => {
              const isExpanded = expandedProjects.has(project.id!);
              const projectTasks = sortTasksNaturally(allTareas.filter(t => t.projectId === project.id));
              const completedCount = projectTasks.filter(t => t.status === 'completed' || t.completada).length;
              const totalCount = projectTasks.length;
              const projCStyle = getConcejaliaStyle(project.concejalia);
              const effStatus = getProjectEffectiveStatus(project);

              return (
                <div 
                  key={project.id}
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200"
                >
                  {/* CABECERA EXPEDIENTE */}
                  <div 
                    onClick={() => toggleProject(project.id!)}
                    className="p-4 sm:p-5 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
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
                          <h3 className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                            {isContratoMenorProject(project) ? '📜' : '📁'} {project.name}
                          </h3>
                          {project.expedientCode && (
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shrink-0">
                              {project.expedientCode}
                            </span>
                          )}
                          {renderProjectStatusBadge(effStatus)}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
                          <span>Concejalía:</span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${projCStyle.badgeClass}`}>
                            {project.concejalia}
                          </span>
                        </p>
                        {(() => {
                          const linkedParent = project.linkedExpedientId 
                            ? effectiveProjects.find(p => p.id === project.linkedExpedientId || p.expedientCode === project.linkedExpedientId) 
                            : null;
                          if (!linkedParent) return null;
                          return (
                            <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium flex items-center gap-1 mt-0.5">
                              <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                              </svg>
                              <span>Vinculado a: {linkedParent.expedientCode ? `${linkedParent.expedientCode} - ` : ''}{linkedParent.name}</span>
                            </p>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                        {completedCount}/{totalCount} tareas
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onSelectProject) {
                            onSelectProject(project);
                          }
                        }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-all shrink-0 cursor-pointer"
                        title="Editar Expediente"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => handleDeleteExpedienteDirect(project.id!, project.name, e)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all shrink-0 cursor-pointer"
                        title="Eliminar Expediente completo"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>

                  {/* NIVEL 3: TAREAS HIJAS (EXPANDIBLE) */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 sm:px-6 bg-slate-50/50 dark:bg-slate-900/30 border-t border-slate-100 dark:border-slate-700/50">
                      {projectTasks.length === 0 ? (
                        <p className="text-xs text-slate-400 italic py-2 pl-6">No hay tareas registradas en este expediente.</p>
                      ) : (
                        <div className="pl-4 sm:pl-6 border-l-2 border-indigo-200 dark:border-indigo-800 space-y-2 py-2">
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

                {/* NIVEL 2: TARJETAS DE EXPEDIENTES (ORDINARIOS + SUBCARPETAS) */}
                <div className="space-y-3 pl-2 sm:pl-4">
                  {/* SUBCARPETAMÁSTER DE CONTRATOS MENORES SI EXISTEN EN ESTA CONCEJALÍA */}
                  {cmProjectsInGroup.length > 0 && (
                    <div className="bg-indigo-50/60 dark:bg-indigo-950/20 border-2 border-indigo-200 dark:border-indigo-800/60 rounded-2xl overflow-hidden shadow-xs">
                      <div
                        onClick={() => toggleProject(`folder_cm_${concejaliaName}`)}
                        className="p-4 flex items-center justify-between cursor-pointer hover:bg-indigo-100/50 dark:hover:bg-indigo-900/30 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-sm shrink-0">
                            📜
                          </div>
                          <div>
                            <h3 className="font-bold text-indigo-950 dark:text-indigo-100 text-sm sm:text-base">
                              Subcarpeta: Contratos Menores
                            </h3>
                            <p className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold">
                              {cmProjectsInGroup.length} {cmProjectsInGroup.length === 1 ? 'contrato menor' : 'contratos menores'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300">
                            {isSubfolderExpanded ? 'Ocultar' : `Desplegar (${cmProjectsInGroup.length})`}
                          </span>
                          <svg className={`w-5 h-5 text-indigo-600 dark:text-indigo-400 transition-transform duration-200 ${isSubfolderExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </div>

                      {/* CONTRATOS MENORES DENTRO DE LA SUBCARPETA */}
                      {isSubfolderExpanded && (
                        <div className="p-3 space-y-3 bg-white/60 dark:bg-slate-900/40 border-t border-indigo-100 dark:border-indigo-900/40">
                          {cmProjectsInGroup.map((project) => renderProjectCard(project))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* EXPEDIENTES ORDINARIOS DE LA CONCEJALÍA */}
                  {regularProjectsInGroup.map((project) => renderProjectCard(project))}
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* MODAL DE NUEVO EXPEDIENTE */}
      {isCreatingExpediente && (
        <TemplateSelectorModal user={user} onClose={() => setIsCreatingExpediente(false)} />
      )}

      {/* MODAL CONSTRUCTOR DINÁMICO */}
      {isCreatingBuilder && (
        <ExpedienteBuilderModal user={user} onClose={() => setIsCreatingBuilder(false)} />
      )}

    </div>
  );
}
