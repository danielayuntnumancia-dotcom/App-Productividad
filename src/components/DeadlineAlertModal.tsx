import React from 'react';
import { Tarea } from '../types';
import { getTaskDeadlineInfo, getRetentionWarning } from '../utils/deadlines';

interface Props {
  tasks: Tarea[];
  onClose: () => void;
  onSelectTask: (tarea: Tarea) => void;
}

export default function DeadlineAlertModal({ tasks, onClose, onSelectTask }: Props) {
  // Filtrar tareas que requieren atención inmediata
  const urgentTasks = tasks
    .filter(t => t.status !== 'completed' && !t.completada)
    .map(t => {
      const deadline = getTaskDeadlineInfo(t);
      const retention = getRetentionWarning(t);
      return { tarea: t, deadline, retention };
    })
    .filter(item => item.deadline.isUrgent || item.deadline.isExpired || item.retention.isProlonged)
    .sort((a, b) => {
      // Ordenar primero vencidas, luego críticas, luego retenidas
      if (a.deadline.isExpired && !b.deadline.isExpired) return -1;
      if (!a.deadline.isExpired && b.deadline.isExpired) return 1;
      return a.deadline.daysRemaining - b.deadline.daysRemaining;
    });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-2xl w-full border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        
        {/* Cabecera del Modal */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-700/80 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xl font-bold">
              ⏱️
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800 dark:text-slate-100">
                Centro de Alertas de Plazos y Retenciones
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {urgentTasks.length} {urgentTasks.length === 1 ? 'trámite requiere' : 'trámites requieren'} atención prioritaria
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors flex items-center justify-center cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Listado de Alertas */}
        <div className="p-5 overflow-y-auto space-y-3 flex-1">
          {urgentTasks.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <span className="text-4xl">🎉</span>
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">¡Todo al día!</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                No tienes ningún plazo vencido ni trámites en riesgo en este momento.
              </p>
            </div>
          ) : (
            urgentTasks.map(({ tarea, deadline, retention }) => (
              <div
                key={tarea.id}
                onClick={() => {
                  onSelectTask(tarea);
                  onClose();
                }}
                className={`p-4 rounded-2xl border transition-all cursor-pointer hover:shadow-md space-y-2 ${
                  deadline.isExpired
                    ? 'bg-red-50/70 dark:bg-red-950/30 border-red-200 dark:border-red-800/60'
                    : deadline.severity === 'critical'
                      ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60'
                      : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] border ${deadline.badgeClass}`}>
                        {deadline.formattedText}
                      </span>
                      {tarea.concejalia && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                          {tarea.concejalia}
                        </span>
                      )}
                      {tarea.projectName && (
                        <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 truncate">
                          📁 {tarea.projectName}
                        </span>
                      )}
                    </div>

                    <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100">
                      {tarea.titulo || tarea.title}
                    </h4>

                    {retention.isProlonged && (
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                        {retention.warningText}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
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
                    <button
                      type="button"
                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors"
                    >
                      Abrir Ficha
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pie del modal */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl transition-colors cursor-pointer"
          >
            Cerrar Alertas
          </button>
        </div>

      </div>
    </div>
  );
}
