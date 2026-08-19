import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Tarea, Project } from '../types';
import { getConcejaliaStyle } from '../utils/concejaliaColors';
import {
  restoreTask,
  restoreExpediente,
  permanentDeleteTask,
  permanentDeleteExpediente,
  emptyAllTrash
} from '../utils/trashUtils';

interface Props {
  user: User;
  searchQuery?: string;
}

export default function PapeleraView({ user, searchQuery = '' }: Props) {
  const [activeTab, setActiveTab] = useState<'expedientes' | 'tareas'>('expedientes');
  const [deletedTasks, setDeletedTasks] = useState<Tarea[]>([]);
  const [deletedProjects, setDeletedProjects] = useState<Project[]>([]);
  const [allTasksForExpedientes, setAllTasksForExpedientes] = useState<Tarea[]>([]);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMsg({ text, type });
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  useEffect(() => {
    if (!user.uid) return;

    // Escuchar todas las tareas para calcular expedientes y tareas eliminadas
    const q = query(
      collection(db, 'tareas'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allList: Tarea[] = [];
      const delTaskList: Tarea[] = [];
      const projDocMap: Record<string, Project> = {};

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const id = docSnap.id;

        if (data.isProject) {
          if (data.isDeleted) {
            projDocMap[data.projectId || data.id || id] = {
              id: data.projectId || data.id || id,
              firestoreDocId: id,
              name: data.name || data.projectName || 'Expediente',
              type: data.type || 'custom',
              concejalia: data.concejalia || 'General',
              status: data.status || 'active',
              expedientCode: data.expedientCode,
              deletedAt: data.deletedAt,
              isDeleted: true,
              userId: data.userId
            };
          }
        } else if (!data.isTemplate && !data.isConcejalia) {
          const t = { id, ...data } as Tarea;
          allList.push(t);

          if (t.isDeleted) {
            delTaskList.push(t);
            // Si la tarea eliminada tiene projectId y no está en projDocMap, crear entrada virtual
            if (t.projectId && t.deletedType === 'expediente' && !projDocMap[t.projectId]) {
              projDocMap[t.projectId] = {
                id: t.projectId,
                name: t.projectName || 'Expediente',
                type: 'custom',
                concejalia: t.concejalia || 'General',
                status: 'active',
                expedientCode: t.expedientCode,
                deletedAt: t.deletedAt,
                isDeleted: true,
                userId: t.userId
              };
            }
          }
        }
      });

      setAllTasksForExpedientes(allList);
      setDeletedTasks(delTaskList);
      setDeletedProjects(Object.values(projDocMap));
    });

    return () => unsubscribe();
  }, [user.uid]);

  // Formatear fecha de borrado
  const formatDeletedDate = (timestamp?: number | null) => {
    if (!timestamp) return 'Fecha desconocida';
    const date = new Date(timestamp);
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Filtrar según el término de búsqueda
  const qClean = searchQuery.trim().toLowerCase();

  const filteredProjects = deletedProjects.filter((p) => {
    if (!qClean) return true;
    return (
      (p.name && p.name.toLowerCase().includes(qClean)) ||
      (p.expedientCode && p.expedientCode.toLowerCase().includes(qClean)) ||
      (p.concejalia && p.concejalia.toLowerCase().includes(qClean))
    );
  });

  // Tareas sueltas eliminadas (aquellas con deletedType !== 'expediente' o sin projectId)
  const individualDeletedTasks = deletedTasks.filter((t) => {
    if (t.deletedType === 'expediente' && t.projectId) return false;
    if (!qClean) return true;
    return (
      (t.titulo && t.titulo.toLowerCase().includes(qClean)) ||
      (t.title && t.title.toLowerCase().includes(qClean)) ||
      (t.projectName && t.projectName.toLowerCase().includes(qClean))
    );
  });

  // Acciones de Restauración
  const handleRestoreExpediente = async (project: Project) => {
    if (!project.id) return;
    setIsProcessing(true);
    try {
      await restoreExpediente(project.id, allTasksForExpedientes, project.firestoreDocId);
      showToast(`¡Expediente "${project.name}" y sus tareas restaurados con éxito!`);
    } catch (err) {
      console.error("Error restaurando expediente: ", err);
      showToast("Error al restaurar el expediente.", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestoreTask = async (task: Tarea) => {
    if (!task.id) return;
    setIsProcessing(true);
    try {
      await restoreTask(task.id);
      showToast(`¡Tarea "${task.title || task.titulo}" restaurada!`);
    } catch (err) {
      console.error("Error restaurando tarea: ", err);
      showToast("Error al restaurar la tarea.", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  // Acciones de Eliminación Definitiva
  const handlePermanentDeleteExpediente = async (project: Project) => {
    if (!project.id) return;
    if (!window.confirm(`⚠️ ¿ELIMINAR DEFINITIVAMENTE el expediente "${project.name}" y todas sus tareas asociadas?\n\nEsta acción NO se puede deshacer.`)) {
      return;
    }
    setIsProcessing(true);
    try {
      await permanentDeleteExpediente(project.id, allTasksForExpedientes, project.firestoreDocId);
      showToast(`Expediente "${project.name}" eliminado permanentemente.`);
    } catch (err: any) {
      console.error("Error eliminando expediente definitivamente: ", err);
      showToast(`Error al eliminar definitivamente el expediente: ${err.message || err}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePermanentDeleteTask = async (task: Tarea) => {
    if (!task.id) return;
    if (!window.confirm(`⚠️ ¿ELIMINAR DEFINITIVAMENTE la tarea "${task.title || task.titulo}"?\n\nEsta acción NO se puede deshacer.`)) {
      return;
    }
    setIsProcessing(true);
    try {
      await permanentDeleteTask(task.id);
      showToast(`Tarea eliminada definitivamente.`);
    } catch (err) {
      console.error("Error eliminando tarea definitivamente: ", err);
      showToast("Error al eliminar definitivamente la tarea.", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  // Vaciar toda la papelera
  const handleEmptyAll = async () => {
    const totalCount = deletedProjects.length + individualDeletedTasks.length;
    if (totalCount === 0) return;

    if (!window.confirm(`🚨 ¿VACIAR TODA LA PAPELERA?\n\nSe eliminarán de forma irreversible:\n- ${deletedProjects.length} expedientes\n- ${deletedTasks.length} tareas totales\n\n¿Estás completamente seguro?`)) {
      return;
    }

    setIsProcessing(true);
    try {
      const projectIds = deletedProjects.map(p => p.firestoreDocId || p.id!).filter(Boolean);
      await emptyAllTrash(deletedTasks, projectIds);
      showToast("La papelera ha sido vaciada por completo.");
    } catch (err: any) {
      console.error("Error vaciando la papelera: ", err);
      showToast(`Error al vaciar la papelera: ${err.message || err}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const totalDeletedCount = deletedProjects.length + individualDeletedTasks.length;

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6 animate-fade-in">
      
      {/* CABECERA DE PAPELERA */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors duration-300">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 flex items-center justify-center text-2xl shadow-xs">
            🗑️
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-3">
              Papelera de Reciclaje
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
                {totalDeletedCount} {totalDeletedCount === 1 ? 'elemento' : 'elementos'}
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Los elementos eliminados se conservan aquí. Puedes restaurarlos o eliminarlos de forma definitiva.
            </p>
          </div>
        </div>

        {totalDeletedCount > 0 && (
          <button
            type="button"
            onClick={handleEmptyAll}
            disabled={isProcessing}
            className="px-4 py-2.5 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-2 cursor-pointer shrink-0 disabled:opacity-50"
            title="Eliminar de forma permanente todos los elementos en la papelera"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>Vaciar Papelera</span>
          </button>
        )}
      </div>

      {/* TOAST DE FEEDBACK */}
      {feedbackMsg && (
        <div
          className={`px-4 py-3 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-3 animate-fade-in shadow-md ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-500 text-white'
              : 'bg-red-500 text-white'
          }`}
        >
          <span>{feedbackMsg.type === 'success' ? '✅' : '⚠️'}</span>
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* PESTAÑAS */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 gap-2 sm:gap-4">
        <button
          onClick={() => setActiveTab('expedientes')}
          className={`pb-3 px-2 sm:px-4 font-extrabold text-sm transition-all flex items-center gap-2 border-b-2 cursor-pointer ${
            activeTab === 'expedientes'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <span>📁 Expedientes Eliminados</span>
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {filteredProjects.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('tareas')}
          className={`pb-3 px-2 sm:px-4 font-extrabold text-sm transition-all flex items-center gap-2 border-b-2 cursor-pointer ${
            activeTab === 'tareas'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <span>📝 Tareas Sueltas Eliminadas</span>
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {individualDeletedTasks.length}
          </span>
        </button>
      </div>

      {/* CONTENIDO DE EXPEDIENTES ELIMINADOS */}
      {activeTab === 'expedientes' && (
        <div className="space-y-3">
          {filteredProjects.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 p-12 text-center rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
              <span className="text-4xl block mb-2">🌿</span>
              <h3 className="font-bold text-slate-700 dark:text-slate-200 text-base">No hay expedientes en la papelera</h3>
              <p className="text-xs text-slate-400 mt-1">Los expedientes que elimines aparecerán aquí para que puedas recuperarlos.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredProjects.map((proj) => {
                const cStyle = getConcejaliaStyle(proj.concejalia);
                const projTasks = allTasksForExpedientes.filter(t => t.projectId === proj.id);

                return (
                  <div
                    key={proj.id}
                    className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs hover:border-slate-300 dark:hover:border-slate-600 transition-all flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-base">
                            📁 {proj.name}
                          </h3>
                          {proj.expedientCode && (
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                              {proj.expedientCode}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${cStyle.badgeClass}`}>
                          {proj.concejalia || 'General'}
                        </span>
                        <span className="text-slate-400 font-medium text-[11px]">
                          • {projTasks.length} {projTasks.length === 1 ? 'tarea hija' : 'tareas hijas'}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-400 flex items-center gap-1 pt-1">
                        <span>🕒 Eliminado el:</span>
                        <span className="font-semibold text-slate-500 dark:text-slate-300">
                          {formatDeletedDate(proj.deletedAt)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-700/60">
                      <button
                        type="button"
                        onClick={() => handleRestoreExpediente(proj)}
                        disabled={isProcessing}
                        className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        title="Restaurar este expediente y todas sus tareas a la lista activa"
                      >
                        <span>♻️ Restaurar</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handlePermanentDeleteExpediente(proj)}
                        disabled={isProcessing}
                        className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        title="Eliminar de forma permanente este expediente y sus tareas"
                      >
                        <span>❌ Eliminar definitivamente</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* CONTENIDO DE TAREAS SUELTAS ELIMINADAS */}
      {activeTab === 'tareas' && (
        <div className="space-y-3">
          {individualDeletedTasks.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 p-12 text-center rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
              <span className="text-4xl block mb-2">🌿</span>
              <h3 className="font-bold text-slate-700 dark:text-slate-200 text-base">No hay tareas sueltas en la papelera</h3>
              <p className="text-xs text-slate-400 mt-1">Las tareas independientes que elimines aparecerán aquí.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {individualDeletedTasks.map((t) => {
                const cStyle = getConcejaliaStyle(t.concejalia);

                return (
                  <div
                    key={t.id}
                    className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs hover:border-slate-300 dark:hover:border-slate-600 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-800 dark:text-slate-100 text-sm break-words">
                          {t.title || t.titulo}
                        </span>
                        {t.projectName && (
                          <span className="text-[11px] text-slate-500 font-medium bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-md">
                            📂 {t.projectName}
                          </span>
                        )}
                        {t.concejalia && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${cStyle.badgeClass}`}>
                            {t.concejalia}
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-slate-400 flex items-center gap-2">
                        <span>🕒 Eliminada: {formatDeletedDate(t.deletedAt)}</span>
                        {t.estimatedTimeMin && <span>• ⏱️ {t.estimatedTimeMin}m</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => handleRestoreTask(t)}
                        disabled={isProcessing}
                        className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold text-xs rounded-xl transition-all flex items-center gap-1 cursor-pointer"
                        title="Restaurar esta tarea"
                      >
                        <span>♻️ Restaurar</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handlePermanentDeleteTask(t)}
                        disabled={isProcessing}
                        className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-bold text-xs rounded-xl transition-all flex items-center gap-1 cursor-pointer"
                        title="Eliminar de forma permanente"
                      >
                        <span>❌ Eliminar</span>
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
}
