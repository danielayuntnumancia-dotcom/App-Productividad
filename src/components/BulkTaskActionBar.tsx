import React, { useState } from 'react';
import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { TaskStatus, Tarea } from '../types';
import CustomDatePicker from './CustomDatePicker';

interface Props {
  selectedTaskIds: string[];
  tasks: Tarea[];
  concejaliasList?: string[];
  onClearSelection: () => void;
  onSelectAll?: () => void;
  isAllSelected?: boolean;
}

type ActiveActionModal = 'status' | 'priority' | 'time' | 'date' | 'concejalia' | 'blocked' | null;

export default function BulkTaskActionBar({
  selectedTaskIds,
  tasks,
  concejaliasList = [],
  onClearSelection,
  onSelectAll,
  isAllSelected = false
}: Props) {
  const count = selectedTaskIds.length;
  if (count === 0) return null;

  const [activeModal, setActiveModal] = useState<ActiveActionModal>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Estados temporales para los modales de edición masiva
  const [targetStatus, setTargetStatus] = useState<TaskStatus>('todo');
  const [targetPriority, setTargetPriority] = useState<'alta' | 'media' | 'baja'>('media');
  const [targetMinutes, setTargetMinutes] = useState<number>(30);
  const [targetDateStr, setTargetDateStr] = useState<string>('');
  const [targetConcejalia, setTargetConcejalia] = useState<string>('');
  const [targetBlockedBy, setTargetBlockedBy] = useState<string>('Plataforma Gestiona / Funcionario');

  // Ejecutar actualización en lote en Firestore
  const executeBatchUpdate = async (updateData: Partial<Tarea>) => {
    setIsProcessing(true);
    try {
      const batch = writeBatch(db);
      selectedTaskIds.forEach((taskId) => {
        const tRef = doc(db, 'tareas', taskId);
        batch.update(tRef, {
          ...updateData,
          updatedAt: Date.now()
        });
      });

      await batch.commit();
      setFeedbackMsg(`¡${count} tareas actualizadas correctamente!`);
      setActiveModal(null);
      setTimeout(() => {
        setFeedbackMsg(null);
        onClearSelection();
      }, 1500);
    } catch (err: any) {
      console.error("Error executing bulk task update: ", err);
      alert(`Error al actualizar tareas en lote: ${err?.message || ''}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // 1. Cambiar Estado Masivo
  const handleApplyStatus = () => {
    const isCompleted = targetStatus === 'completed';
    executeBatchUpdate({
      status: targetStatus,
      completada: isCompleted,
      ...(isCompleted ? { completedAt: Date.now() } : {})
    });
  };

  // 2. Cambiar Prioridad Masiva
  const handleApplyPriority = () => {
    executeBatchUpdate({
      prioridad: targetPriority
    });
  };

  // 3. Cambiar Tiempo Estimado Masivo
  const handleApplyTime = () => {
    const mins = Number(targetMinutes) || 15;
    executeBatchUpdate({
      estimatedTimeMin: mins,
      tiempo_estimado: `${mins}m`
    });
  };

  // 4. Cambiar Fecha de Vencimiento Masiva
  const handleApplyDueDate = () => {
    if (!targetDateStr) return;
    const dueMs = new Date(targetDateStr).getTime();
    executeBatchUpdate({
      dueDate: dueMs,
      fecha_vencimiento: dueMs
    });
  };

  // 5. Cambiar Concejalía Masiva
  const handleApplyConcejalia = () => {
    if (!targetConcejalia) return;
    executeBatchUpdate({
      concejalia: targetConcejalia,
      projectConcejalia: targetConcejalia,
      projectMasterCategory: targetConcejalia
    });
  };

  // 6. Asignar Bloqueo por Terceros Masivo
  const handleApplyBlocked = () => {
    executeBatchUpdate({
      status: 'waiting_on_third_party',
      blockedBy: targetBlockedBy.trim() || 'Plataforma Gestiona / Terceros',
      blockingReason: targetBlockedBy.trim()
    });
  };

  // 7. Toggle Mi Día Masivo
  const handleToggleMyDay = (inMyDay: boolean) => {
    executeBatchUpdate({
      isInMyDay: inMyDay
    });
  };

  // 8. Eliminar Tareas Masivas
  const handleDeleteBulk = async () => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar definitivamente ${count} tareas seleccionadas? Esta acción no se puede deshacer.`)) {
      return;
    }

    setIsProcessing(true);
    try {
      const batch = writeBatch(db);
      selectedTaskIds.forEach((taskId) => {
        batch.delete(doc(db, 'tareas', taskId));
      });

      await batch.commit();
      setFeedbackMsg(`¡${count} tareas eliminadas!`);
      setTimeout(() => {
        setFeedbackMsg(null);
        onClearSelection();
      }, 1200);
    } catch (err: any) {
      console.error("Error executing bulk task deletion: ", err);
      alert("Error al eliminar las tareas.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      {/* BARRA FLOTANTE PRINCIPAL DE ACCIONES MASIVAS */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-5xl bg-slate-900/95 dark:bg-slate-800/95 text-white backdrop-blur-xl border border-slate-700/80 shadow-2xl rounded-3xl p-3 sm:p-4 animate-fade-in-up transition-all duration-300">
        
        {feedbackMsg ? (
          <div className="flex items-center justify-center gap-2 py-1 text-emerald-400 font-bold text-sm sm:text-base animate-fade-in">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
            </svg>
            <span>{feedbackMsg}</span>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row items-center justify-between gap-3">
            
            {/* Contador y Selector Global */}
            <div className="flex items-center gap-2.5 shrink-0 w-full md:w-auto justify-between md:justify-start">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-indigo-500 text-white font-extrabold text-xs flex items-center justify-center shadow-xs">
                  {count}
                </span>
                <span className="text-xs sm:text-sm font-bold text-slate-200">
                  {count === 1 ? '1 tarea seleccionada' : `${count} tareas seleccionadas`}
                </span>
              </div>

              {onSelectAll && (
                <button
                  type="button"
                  onClick={onSelectAll}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer border border-slate-700"
                >
                  {isAllSelected ? 'Desmarcar todo' : 'Seleccionar todo'}
                </button>
              )}
            </div>

            {/* BOTONERA DE ACCIONES EN LOTE */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full md:w-auto justify-start md:justify-end pb-1 md:pb-0">
              
              {/* Cambiar Estado */}
              <button
                type="button"
                onClick={() => setActiveModal('status')}
                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0 shadow-xs"
                title="Cambiar estado en lote"
              >
                <span>⚡</span> Estado
              </button>

              {/* Cambiar Prioridad */}
              <button
                type="button"
                onClick={() => setActiveModal('priority')}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-bold rounded-xl border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                title="Cambiar prioridad en lote"
              >
                <span>🔴</span> Prioridad
              </button>

              {/* Cambiar Tiempo */}
              <button
                type="button"
                onClick={() => setActiveModal('time')}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-bold rounded-xl border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                title="Cambiar tiempo estimado en lote"
              >
                <span>⏱️</span> Tiempo
              </button>

              {/* Cambiar Fecha */}
              <button
                type="button"
                onClick={() => setActiveModal('date')}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-bold rounded-xl border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                title="Asignar fecha límite en lote"
              >
                <span>📅</span> Fecha
              </button>

              {/* Cambiar Concejalía */}
              {concejaliasList.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveModal('concejalia')}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-bold rounded-xl border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                  title="Mover a otra concejalía"
                >
                  <span>🏛️</span> Concejalía
                </button>
              )}

              {/* Bloqueo / Retención */}
              <button
                type="button"
                onClick={() => setActiveModal('blocked')}
                className="px-3 py-2 bg-amber-600/80 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                title="Marcar retenido por terceros"
              >
                <span>⚠️</span> Retenido
              </button>

              {/* Toggle Mi Día */}
              <button
                type="button"
                onClick={() => handleToggleMyDay(true)}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-amber-400 text-xs font-bold rounded-xl border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                title="Añadir todas a Mi Día"
              >
                <span>☀️</span> +Mi Día
              </button>

              {/* Eliminar Masivo */}
              <button
                type="button"
                onClick={handleDeleteBulk}
                className="p-2 bg-red-500/20 hover:bg-red-500/40 text-red-300 hover:text-red-200 rounded-xl transition-colors cursor-pointer shrink-0"
                title="Eliminar tareas seleccionadas"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>

              {/* Cancelar Selección */}
              <button
                type="button"
                onClick={onClearSelection}
                className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer shrink-0 ml-1"
                title="Cancelar selección"
              >
                ✕
              </button>
            </div>

          </div>
        )}
      </div>

      {/* MODALES DE ACCIÓN ESPECÍFICA */}

      {/* 1. MODAL CAMBIAR ESTADO */}
      {activeModal === 'status' && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-sm border border-slate-200 dark:border-slate-700 shadow-2xl space-y-4 animate-fade-in-up">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span>⚡</span> Cambiar Estado de {count} tareas
            </h3>
            
            <div className="space-y-2">
              {[
                { key: 'todo', label: 'Pendiente', icon: '⏳' },
                { key: 'in_progress', label: 'En Curso', icon: '🚀' },
                { key: 'waiting_on_third_party', label: 'En Espera (Retenido)', icon: '⚠️' },
                { key: 'completed', label: 'Completada', icon: '✅' },
              ].map((st) => (
                <button
                  key={st.key}
                  type="button"
                  onClick={() => setTargetStatus(st.key as TaskStatus)}
                  className={`w-full p-3 rounded-2xl border text-left text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                    targetStatus === st.key
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-500/20'
                      : 'bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>{st.icon}</span> {st.label}
                  </span>
                  {targetStatus === st.key && <span>✓</span>}
                </button>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleApplyStatus}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer disabled:opacity-50"
              >
                {isProcessing ? 'Aplicando...' : 'Aplicar a Todas'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. MODAL CAMBIAR PRIORIDAD */}
      {activeModal === 'priority' && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-sm border border-slate-200 dark:border-slate-700 shadow-2xl space-y-4 animate-fade-in-up">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span>🔴</span> Cambiar Prioridad de {count} tareas
            </h3>
            
            <div className="space-y-2">
              {[
                { key: 'alta', label: '🔴 Alta Prioridad', desc: 'Tareas urgentes o prioritarias' },
                { key: 'media', label: '🟧 Media Prioridad', desc: 'Trámites estándar' },
                { key: 'baja', label: '🟩 Baja Prioridad', desc: 'Tareas secundarias' },
              ].map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setTargetPriority(p.key as any)}
                  className={`w-full p-3 rounded-2xl border text-left text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                    targetPriority === p.key
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-500/20'
                      : 'bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <div>
                    <span className="block">{p.label}</span>
                    <span className="text-[10px] font-normal text-slate-400">{p.desc}</span>
                  </div>
                  {targetPriority === p.key && <span>✓</span>}
                </button>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleApplyPriority}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer disabled:opacity-50"
              >
                {isProcessing ? 'Aplicando...' : 'Aplicar Prioridad'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. MODAL CAMBIAR TIEMPO */}
      {activeModal === 'time' && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-sm border border-slate-200 dark:border-slate-700 shadow-2xl space-y-4 animate-fade-in-up">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span>⏱️</span> Cambiar Tiempo Estimado
            </h3>
            
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">
                Minutos estimados por cada tarea:
              </label>

              <div className="grid grid-cols-4 gap-2">
                {[15, 30, 45, 60].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setTargetMinutes(m)}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      targetMinutes === m
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-600'
                    }`}
                  >
                    {m}m
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <span className="text-xs font-semibold text-slate-500">Personalizado:</span>
                <input
                  type="number"
                  min={5}
                  max={480}
                  step={5}
                  value={targetMinutes}
                  onChange={(e) => setTargetMinutes(Number(e.target.value))}
                  className="w-20 px-2 py-1.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-bold text-center text-slate-800 dark:text-slate-100"
                />
                <span className="text-xs font-bold text-slate-400">minutos</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleApplyTime}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer disabled:opacity-50"
              >
                {isProcessing ? 'Aplicando...' : 'Guardar Minutos'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. MODAL CAMBIAR FECHA DE VENCIMIENTO */}
      {activeModal === 'date' && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-sm border border-slate-200 dark:border-slate-700 shadow-2xl space-y-4 animate-fade-in-up">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span>📅</span> Asignar Fecha Límite Masiva
            </h3>
            
            <div className="space-y-2">
              <CustomDatePicker
                label="Nueva Fecha Límite para las tareas seleccionadas"
                value={targetDateStr}
                onChange={(dStr) => setTargetDateStr(dStr)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isProcessing || !targetDateStr}
                onClick={handleApplyDueDate}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer disabled:opacity-50"
              >
                {isProcessing ? 'Aplicando...' : 'Asignar Fecha'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL CAMBIAR CONCEJALÍA */}
      {activeModal === 'concejalia' && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-sm border border-slate-200 dark:border-slate-700 shadow-2xl space-y-4 animate-fade-in-up">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span>🏛️</span> Reasignar Concejalía Masiva
            </h3>
            
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">
                Seleccionar nueva concejalía de destino:
              </label>
              <select
                value={targetConcejalia}
                onChange={(e) => setTargetConcejalia(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 outline-none"
              >
                <option value="">-- Seleccionar Concejalía --</option>
                {concejaliasList.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isProcessing || !targetConcejalia}
                onClick={handleApplyConcejalia}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer disabled:opacity-50"
              >
                {isProcessing ? 'Aplicando...' : 'Reasignar Concejalía'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. MODAL ASIGNAR RETENCIÓN / TERCEROS */}
      {activeModal === 'blocked' && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-sm border border-slate-200 dark:border-slate-700 shadow-2xl space-y-4 animate-fade-in-up">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span>⚠️</span> Marcar Retenido por Terceros
            </h3>
            
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">
                Departamento o Entidad retenedora:
              </label>
              <input
                type="text"
                value={targetBlockedBy}
                onChange={(e) => setTargetBlockedBy(e.target.value)}
                placeholder="Ej. Plataforma Gestiona, Intervención, Zaira y Ana..."
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-700 border border-amber-300 dark:border-amber-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-100 outline-none"
              />
              <p className="text-[11px] text-slate-400">
                Las {count} tareas seleccionadas pasarán a estado "En Espera" con este motivo de bloqueo.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isProcessing || !targetBlockedBy.trim()}
                onClick={handleApplyBlocked}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer disabled:opacity-50"
              >
                {isProcessing ? 'Aplicando...' : 'Aplicar Retención'}
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
