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

type ActiveActionModal = 'status' | 'priority' | 'time' | 'date' | 'concejalia' | 'blocked' | 'notes' | 'all' | null;

const COMMON_DEPARTMENTS = [
  'Plataforma Gestiona / Funcionario',
  'Intervención / Tesorería',
  'Secretaría General',
  'Contratación / Compras',
  'Servicios Técnicos / Obras',
  'Zaira y Ana',
  'Proveedor / Empresa Externa',
  'Firma de Alcaldía',
  'Junta de Gobierno Local'
];

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
  const [targetStatus, setTargetStatus] = useState<TaskStatus>('completed');
  const [targetPriority, setTargetPriority] = useState<'alta' | 'media' | 'baja'>('media');
  const [targetMinutes, setTargetMinutes] = useState<number>(30);
  const [targetDateStr, setTargetDateStr] = useState<string>('');
  const [targetConcejalia, setTargetConcejalia] = useState<string>('');
  const [targetBlockedBy, setTargetBlockedBy] = useState<string>('Plataforma Gestiona / Funcionario');
  const [targetNotes, setTargetNotes] = useState<string>('');
  const [notesMode, setNotesMode] = useState<'replace' | 'append'>('append');

  // Multi-field modal state
  const [enableFields, setEnableFields] = useState({
    status: false,
    priority: false,
    time: false,
    date: false,
    concejalia: false,
    myDay: false,
    notes: false
  });
  const [multiMyDay, setMultiMyDay] = useState<boolean>(true);

  // Ejecutar actualización en lote en Firestore
  const executeBatchUpdate = async (updateData: Record<string, any>, customMsg?: string) => {
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
      setFeedbackMsg(customMsg || `¡${count} tareas actualizadas correctamente!`);
      setActiveModal(null);
      setTimeout(() => {
        setFeedbackMsg(null);
        onClearSelection();
      }, 1400);
    } catch (err: any) {
      console.error("Error executing bulk task update: ", err);
      alert(`Error al actualizar tareas en lote: ${err?.message || 'Error desconocido'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // 1. Acción rápida: Marcar como Completadas directamente
  const handleQuickComplete = () => {
    executeBatchUpdate({
      status: 'completed',
      completada: true,
      completedAt: Date.now(),
      blockedBy: '',
      blockingReason: ''
    }, `✅ ¡${count} tareas marcadas como completadas!`);
  };

  // 2. Cambiar Estado Masivo (Cualquier Estado)
  const handleApplyStatus = (statusToApply?: TaskStatus) => {
    const st = statusToApply || targetStatus;
    if (st === 'completed') {
      executeBatchUpdate({
        status: 'completed',
        completada: true,
        completedAt: Date.now(),
        blockedBy: '',
        blockingReason: ''
      }, `✅ ¡${count} tareas completadas!`);
    } else if (st === 'waiting_on_third_party') {
      const entity = targetBlockedBy.trim() || 'Plataforma Gestiona / Funcionario';
      executeBatchUpdate({
        status: 'waiting_on_third_party',
        completada: false,
        completedAt: null,
        blockedBy: entity,
        blockingReason: entity,
        blockedSince: Date.now()
      }, `⚠️ ¡${count} tareas retenidas por ${entity}!`);
    } else if (st === 'in_progress') {
      executeBatchUpdate({
        status: 'in_progress',
        completada: false,
        completedAt: null,
        blockedBy: '',
        blockingReason: ''
      }, `🚀 ¡${count} tareas en curso!`);
    } else {
      executeBatchUpdate({
        status: 'todo',
        completada: false,
        completedAt: null,
        blockedBy: '',
        blockingReason: ''
      }, `⏳ ¡${count} tareas marcadas como pendientes!`);
    }
  };

  // 3. Cambiar Prioridad Masiva
  const handleApplyPriority = () => {
    executeBatchUpdate({
      prioridad: targetPriority,
      priority: targetPriority
    }, `🔴 Prioridad ${targetPriority.toUpperCase()} asignada a ${count} tareas.`);
  };

  // 4. Cambiar Tiempo Estimado Masivo
  const handleApplyTime = (customMin?: number) => {
    const mins = customMin !== undefined ? customMin : (Number(targetMinutes) || 15);
    executeBatchUpdate({
      estimatedTimeMin: mins,
      tiempo_estimado: `${mins} min`
    }, `⏱️ ${mins} minutos asignados a ${count} tareas.`);
  };

  // 5. Cambiar Fecha de Vencimiento Masiva
  const handleApplyDueDate = (preset?: 'today' | 'tomorrow' | 'nextWeek' | 'clear') => {
    if (preset === 'clear') {
      executeBatchUpdate({
        dueDate: null,
        fecha_vencimiento: null
      }, `📅 Fecha límite eliminada de ${count} tareas.`);
      return;
    }

    let targetMs: number;
    if (preset === 'today') {
      const d = new Date();
      d.setHours(23, 59, 59, 999);
      targetMs = d.getTime();
    } else if (preset === 'tomorrow') {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(23, 59, 59, 999);
      targetMs = d.getTime();
    } else if (preset === 'nextWeek') {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      d.setHours(23, 59, 59, 999);
      targetMs = d.getTime();
    } else {
      if (!targetDateStr) return;
      const parsed = new Date(targetDateStr + 'T23:59:59');
      targetMs = parsed.getTime();
    }

    executeBatchUpdate({
      dueDate: targetMs,
      fecha_vencimiento: targetMs
    }, `📅 Nueva fecha límite asignada a ${count} tareas.`);
  };

  // 6. Cambiar Concejalía Masiva
  const handleApplyConcejalia = () => {
    if (!targetConcejalia) return;
    executeBatchUpdate({
      concejalia: targetConcejalia,
      projectConcejalia: targetConcejalia,
      projectMasterCategory: targetConcejalia
    }, `🏛️ Concejalía "${targetConcejalia}" asignada.`);
  };

  // 7. Toggle Mi Día Masivo
  const handleToggleMyDay = (inMyDay: boolean) => {
    executeBatchUpdate({
      isInMyDay: inMyDay
    }, inMyDay ? `☀️ ${count} tareas añadidas a Mi Día` : `🌑 ${count} tareas quitadas de Mi Día`);
  };

  // 8. Aplicar Notas / Observaciones en Bloque
  const handleApplyNotes = () => {
    if (!targetNotes.trim() && notesMode === 'replace') {
      if (!window.confirm("¿Deseas vaciar las notas de las tareas seleccionadas?")) return;
    }

    setIsProcessing(true);
    try {
      const batch = writeBatch(db);
      selectedTaskIds.forEach((taskId) => {
        const existingTask = tasks.find(t => t.id === taskId);
        const currentNotes = existingTask?.notas || existingTask?.notes || '';
        let finalNotes = '';
        if (notesMode === 'append') {
          finalNotes = currentNotes ? `${currentNotes}\n${targetNotes.trim()}` : targetNotes.trim();
        } else {
          finalNotes = targetNotes.trim();
        }

        const tRef = doc(db, 'tareas', taskId);
        batch.update(tRef, {
          notas: finalNotes,
          notes: finalNotes,
          updatedAt: Date.now()
        });
      });

      batch.commit().then(() => {
        setFeedbackMsg(`📝 Notas actualizadas en ${count} tareas.`);
        setActiveModal(null);
        setTimeout(() => {
          setFeedbackMsg(null);
          onClearSelection();
        }, 1400);
      });
    } catch (err: any) {
      console.error("Error updating bulk notes: ", err);
      alert("Error al actualizar las notas.");
    } finally {
      setIsProcessing(false);
    }
  };

  // 9. Guardar Edición Completa Multicampo
  const handleApplyMultiField = () => {
    const updateObj: Record<string, any> = {};

    if (enableFields.status) {
      if (targetStatus === 'completed') {
        updateObj.status = 'completed';
        updateObj.completada = true;
        updateObj.completedAt = Date.now();
        updateObj.blockedBy = '';
        updateObj.blockingReason = '';
      } else if (targetStatus === 'waiting_on_third_party') {
        updateObj.status = 'waiting_on_third_party';
        updateObj.completada = false;
        updateObj.completedAt = null;
        updateObj.blockedBy = targetBlockedBy.trim() || 'Plataforma Gestiona / Funcionario';
        updateObj.blockingReason = targetBlockedBy.trim() || 'En espera de terceros';
        updateObj.blockedSince = Date.now();
      } else if (targetStatus === 'in_progress') {
        updateObj.status = 'in_progress';
        updateObj.completada = false;
        updateObj.completedAt = null;
        updateObj.blockedBy = '';
        updateObj.blockingReason = '';
      } else {
        updateObj.status = 'todo';
        updateObj.completada = false;
        updateObj.completedAt = null;
        updateObj.blockedBy = '';
        updateObj.blockingReason = '';
      }
    }

    if (enableFields.priority) {
      updateObj.prioridad = targetPriority;
      updateObj.priority = targetPriority;
    }

    if (enableFields.time) {
      const mins = Number(targetMinutes) || 15;
      updateObj.estimatedTimeMin = mins;
      updateObj.tiempo_estimado = `${mins} min`;
    }

    if (enableFields.date) {
      if (targetDateStr) {
        const parsed = new Date(targetDateStr + 'T23:59:59');
        updateObj.dueDate = parsed.getTime();
        updateObj.fecha_vencimiento = parsed.getTime();
      } else {
        updateObj.dueDate = null;
        updateObj.fecha_vencimiento = null;
      }
    }

    if (enableFields.concejalia && targetConcejalia) {
      updateObj.concejalia = targetConcejalia;
      updateObj.projectConcejalia = targetConcejalia;
      updateObj.projectMasterCategory = targetConcejalia;
    }

    if (enableFields.myDay) {
      updateObj.isInMyDay = multiMyDay;
    }

    if (Object.keys(updateObj).length === 0 && !enableFields.notes) {
      alert("Por favor selecciona al menos un campo para actualizar.");
      return;
    }

    if (enableFields.notes) {
      setIsProcessing(true);
      try {
        const batch = writeBatch(db);
        selectedTaskIds.forEach((taskId) => {
          const existingTask = tasks.find(t => t.id === taskId);
          const currentNotes = existingTask?.notas || existingTask?.notes || '';
          let finalNotes = '';
          if (notesMode === 'append') {
            finalNotes = currentNotes ? `${currentNotes}\n${targetNotes.trim()}` : targetNotes.trim();
          } else {
            finalNotes = targetNotes.trim();
          }

          const tRef = doc(db, 'tareas', taskId);
          batch.update(tRef, {
            ...updateObj,
            notas: finalNotes,
            notes: finalNotes,
            updatedAt: Date.now()
          });
        });

        batch.commit().then(() => {
          setFeedbackMsg(`✏️ ¡${count} tareas actualizadas correctamente!`);
          setActiveModal(null);
          setTimeout(() => {
            setFeedbackMsg(null);
            onClearSelection();
          }, 1400);
        });
      } catch (err: any) {
        console.error("Error updating bulk multi-field: ", err);
        alert("Error al actualizar las tareas.");
      } finally {
        setIsProcessing(false);
      }
    } else {
      executeBatchUpdate(updateObj, `✏️ ¡${count} tareas actualizadas correctamente!`);
    }
  };

  // 10. Eliminar Tareas Masivas
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
      setFeedbackMsg(`🗑️ ¡${count} tareas eliminadas!`);
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
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 w-[96%] max-w-6xl bg-slate-900/95 dark:bg-slate-800/95 text-white backdrop-blur-xl border border-slate-700/80 shadow-2xl rounded-2xl sm:rounded-3xl p-2.5 sm:p-3.5 animate-fade-in-up transition-all duration-300">
        
        {feedbackMsg ? (
          <div className="flex items-center justify-center gap-2 py-1 text-emerald-400 font-bold text-sm sm:text-base animate-fade-in">
            <svg className="w-5 h-5 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
            </svg>
            <span>{feedbackMsg}</span>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row items-center justify-between gap-2.5">
            
            {/* Contador y Selector Global */}
            <div className="flex items-center gap-2.5 shrink-0 w-full lg:w-auto justify-between lg:justify-start">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-indigo-500 text-white font-extrabold text-xs flex items-center justify-center shadow-xs">
                  {count}
                </span>
                <span className="text-xs sm:text-sm font-bold text-slate-100">
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
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full lg:w-auto justify-start lg:justify-end pb-1 lg:pb-0">
              
              {/* ACCIÓN RÁPIDA DIRECTA: MARCAR COMPLETADAS */}
              <button
                type="button"
                onClick={handleQuickComplete}
                disabled={isProcessing}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0 shadow-sm disabled:opacity-50"
                title="Marcar todas las tareas seleccionadas como completadas"
              >
                <span>✅</span> <span className="hidden sm:inline">Marcar</span> Completadas
              </button>

              {/* CAMBIAR ESTADO COMPLETO */}
              <button
                type="button"
                onClick={() => setActiveModal('status')}
                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0 shadow-xs"
                title="Cambiar estado: Pendiente, En curso, Retenido o Completada"
              >
                <span>⚡</span> Estado
              </button>

              {/* PRIORIDAD */}
              <button
                type="button"
                onClick={() => setActiveModal('priority')}
                className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-bold rounded-xl border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                title="Cambiar prioridad en lote"
              >
                <span>🔴</span> Prioridad
              </button>

              {/* TIEMPO */}
              <button
                type="button"
                onClick={() => setActiveModal('time')}
                className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-bold rounded-xl border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                title="Cambiar tiempo estimado en lote"
              >
                <span>⏱️</span> Tiempo
              </button>

              {/* FECHA */}
              <button
                type="button"
                onClick={() => setActiveModal('date')}
                className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-bold rounded-xl border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                title="Asignar fecha límite en lote"
              >
                <span>📅</span> Fecha
              </button>

              {/* CONCEJALÍA */}
              {concejaliasList.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveModal('concejalia')}
                  className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-bold rounded-xl border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                  title="Mover a otra concejalía"
                >
                  <span>🏛️</span> Concejalía
                </button>
              )}

              {/* RETENIDO / BLOQUEO */}
              <button
                type="button"
                onClick={() => setActiveModal('blocked')}
                className="px-2.5 py-2 bg-amber-600/80 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                title="Marcar como retenido por terceros o gestionar motivo de bloqueo"
              >
                <span>⚠️</span> Retenido
              </button>

              {/* TOGGLE MI DÍA */}
              <button
                type="button"
                onClick={() => handleToggleMyDay(true)}
                className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-amber-400 text-xs font-bold rounded-xl border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                title="Añadir todas las tareas seleccionadas a Mi Día"
              >
                <span>☀️</span> +Mi Día
              </button>

              {/* NOTAS */}
              <button
                type="button"
                onClick={() => setActiveModal('notes')}
                className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-bold rounded-xl border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                title="Añadir o editar notas masivas"
              >
                <span>📝</span> Notas
              </button>

              {/* EDICIÓN MÚLTIPLE */}
              <button
                type="button"
                onClick={() => setActiveModal('all')}
                className="px-2.5 py-2 bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 hover:text-white text-xs font-bold rounded-xl border border-indigo-700/60 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                title="Abrir editor masivo multicampo"
              >
                <span>✏️</span> Editar Todo
              </button>

              {/* ELIMINAR MASIVO */}
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

              {/* CANCELAR SELECCIÓN */}
              <button
                type="button"
                onClick={onClearSelection}
                className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer shrink-0 ml-0.5"
                title="Cancelar selección"
              >
                ✕
              </button>
            </div>

          </div>
        )}
      </div>

      {/* MODALES DE ACCIÓN ESPECÍFICA */}

      {/* 1. MODAL CAMBIAR ESTADO (TODAS LAS OPCIONES) */}
      {activeModal === 'status' && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-md border border-slate-200 dark:border-slate-700 shadow-2xl space-y-4 animate-fade-in-up">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <span>⚡</span> Cambiar Estado ({count} tareas)
              </h3>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Selecciona el nuevo estado que tendrán todas las tareas marcadas:
            </p>
            
            <div className="space-y-2">
              {[
                { 
                  key: 'completed', 
                  label: 'Completada', 
                  icon: '✅', 
                  desc: 'Marca las tareas como finalizadas y archiva su progreso',
                  badgeClass: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                },
                { 
                  key: 'todo', 
                  label: 'Pendiente', 
                  icon: '⏳', 
                  desc: 'Tarea pendiente de realizar en la bandeja de trabajo',
                  badgeClass: 'bg-slate-50 dark:bg-slate-700/50 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200'
                },
                { 
                  key: 'in_progress', 
                  label: 'En Curso', 
                  icon: '🚀', 
                  desc: 'Actualmente en elaboración activa',
                  badgeClass: 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-700 dark:text-blue-300'
                },
                { 
                  key: 'waiting_on_third_party', 
                  label: 'En Espera / Retenido por Terceros', 
                  icon: '⚠️', 
                  desc: 'Retenida a la espera de firma, informe, plataforma o terceros',
                  badgeClass: 'bg-amber-50 dark:bg-amber-950/40 border-amber-500 text-amber-800 dark:text-amber-300'
                },
              ].map((st) => {
                const isSelected = targetStatus === st.key;
                return (
                  <div
                    key={st.key}
                    onClick={() => setTargetStatus(st.key as TaskStatus)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? `${st.badgeClass} ring-2 ring-indigo-500/30 font-bold`
                        : 'bg-slate-50 dark:bg-slate-700/40 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-bold text-xs sm:text-sm">
                        <span>{st.icon}</span>
                        <span>{st.label}</span>
                      </div>
                      {isSelected && <span className="font-extrabold text-sm">✓</span>}
                    </div>
                    <p className="text-[11px] font-normal text-slate-500 dark:text-slate-400 mt-1 pl-6">
                      {st.desc}
                    </p>

                    {/* Si está seleccionado Retenido, mostrar input de departamento */}
                    {isSelected && st.key === 'waiting_on_third_party' && (
                      <div className="mt-3 pl-6 space-y-2" onClick={(e) => e.stopPropagation()}>
                        <label className="block text-[11px] font-bold text-amber-900 dark:text-amber-200">
                          Departamento / Motivo de Retención:
                        </label>
                        <input
                          type="text"
                          value={targetBlockedBy}
                          onChange={(e) => setTargetBlockedBy(e.target.value)}
                          placeholder="Ej. Plataforma Gestiona, Intervención, Proveedor..."
                          className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-amber-400 dark:border-amber-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 outline-none"
                        />
                        <div className="flex flex-wrap gap-1 pt-1">
                          {['Plataforma Gestiona', 'Intervención', 'Zaira y Ana', 'Secretaría'].map(dept => (
                            <button
                              key={dept}
                              type="button"
                              onClick={() => setTargetBlockedBy(dept)}
                              className="px-2 py-0.5 bg-amber-100/70 dark:bg-amber-900/40 text-[10px] rounded-lg text-amber-800 dark:text-amber-300 hover:bg-amber-200"
                            >
                              {dept}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleApplyStatus()}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer disabled:opacity-50"
              >
                {isProcessing ? 'Aplicando...' : `Aplicar Estado a ${count} tareas`}
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
              <span>🔴</span> Cambiar Prioridad ({count} tareas)
            </h3>
            
            <div className="space-y-2">
              {[
                { key: 'alta', label: '🔴 Alta Prioridad', desc: 'Tareas urgentes o de tramitación prioritaria' },
                { key: 'media', label: '🟧 Media Prioridad', desc: 'Trámites estándar y flujo habitual' },
                { key: 'baja', label: '🟩 Baja Prioridad', desc: 'Tareas secundarias o sin urgencia inmediata' },
              ].map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setTargetPriority(p.key as any)}
                  className={`w-full p-3 rounded-2xl border text-left text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                    targetPriority === p.key
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-500/20'
                      : 'bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-slate-400'
                  }`}
                >
                  <div>
                    <span className="block text-sm">{p.label}</span>
                    <span className="text-[10px] font-normal text-slate-400 dark:text-slate-400">{p.desc}</span>
                  </div>
                  {targetPriority === p.key && <span className="text-base">✓</span>}
                </button>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
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
                Minutos estimados por cada una de las {count} tareas:
              </label>

              <div className="grid grid-cols-4 gap-2">
                {[10, 15, 30, 45, 60, 90, 120, 180].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setTargetMinutes(m);
                      handleApplyTime(m);
                    }}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      targetMinutes === m
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-600 hover:border-indigo-400'
                    }`}
                  >
                    {m >= 60 ? `${m / 60}h` : `${m}m`}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                <span className="text-xs font-semibold text-slate-500">Personalizado:</span>
                <input
                  type="number"
                  min={5}
                  max={480}
                  step={5}
                  value={targetMinutes}
                  onChange={(e) => setTargetMinutes(Number(e.target.value))}
                  className="w-24 px-2 py-1.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-bold text-center text-slate-800 dark:text-slate-100"
                />
                <span className="text-xs font-bold text-slate-400">minutos</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleApplyTime()}
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
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-md border border-slate-200 dark:border-slate-700 shadow-2xl space-y-4 animate-fade-in-up">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span>📅</span> Asignar Fecha Límite ({count} tareas)
            </h3>
            
            {/* Opciones rápidas de fecha */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleApplyDueDate('today')}
                className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-bold text-xs rounded-xl text-center cursor-pointer transition-all"
              >
                🌅 Hoy
              </button>
              <button
                type="button"
                onClick={() => handleApplyDueDate('tomorrow')}
                className="p-2.5 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-bold text-xs rounded-xl text-center cursor-pointer transition-all"
              >
                ☀️ Mañana
              </button>
              <button
                type="button"
                onClick={() => handleApplyDueDate('nextWeek')}
                className="p-2.5 bg-purple-50 dark:bg-purple-950/50 hover:bg-purple-100 dark:hover:bg-purple-900 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 font-bold text-xs rounded-xl text-center cursor-pointer transition-all"
              >
                📆 En 7 días
              </button>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700">
              <CustomDatePicker
                label="O selecciona una fecha específica en el calendario:"
                value={targetDateStr}
                onChange={(dStr) => setTargetDateStr(dStr)}
              />
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-700">
              <button
                type="button"
                onClick={() => handleApplyDueDate('clear')}
                className="px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl"
                title="Eliminar la fecha de vencimiento de las tareas seleccionadas"
              >
                ❌ Sin Fecha
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isProcessing || !targetDateStr}
                  onClick={() => handleApplyDueDate()}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isProcessing ? 'Aplicando...' : 'Guardar Fecha'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL CAMBIAR CONCEJALÍA */}
      {activeModal === 'concejalia' && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-sm border border-slate-200 dark:border-slate-700 shadow-2xl space-y-4 animate-fade-in-up">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span>🏛️</span> Reasignar Concejalía ({count} tareas)
            </h3>
            
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">
                Seleccionar nueva concejalía de destino:
              </label>
              <select
                value={targetConcejalia}
                onChange={(e) => setTargetConcejalia(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 outline-none"
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
                className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
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
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-md border border-slate-200 dark:border-slate-700 shadow-2xl space-y-4 animate-fade-in-up">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span>⚠️</span> Marcar Retenido por Terceros ({count} tareas)
            </h3>
            
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400">
                Departamento, Entidad o Motivo retenedor:
              </label>
              <input
                type="text"
                value={targetBlockedBy}
                onChange={(e) => setTargetBlockedBy(e.target.value)}
                placeholder="Ej. Plataforma Gestiona, Intervención, Zaira y Ana..."
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-700 border border-amber-300 dark:border-amber-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-100 outline-none"
              />

              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-400">Atajos rápidos:</span>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                  {COMMON_DEPARTMENTS.map((dept) => (
                    <button
                      key={dept}
                      type="button"
                      onClick={() => setTargetBlockedBy(dept)}
                      className={`px-2.5 py-1 text-xs rounded-xl font-medium transition-all cursor-pointer border ${
                        targetBlockedBy === dept
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-amber-400'
                      }`}
                    >
                      {dept}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-[11px] text-slate-400">
                Las {count} tareas seleccionadas pasarán a estado "En Espera" con esta entidad como responsable.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isProcessing || !targetBlockedBy.trim()}
                onClick={() => handleApplyStatus('waiting_on_third_party')}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer disabled:opacity-50"
              >
                {isProcessing ? 'Aplicando...' : 'Aplicar Retención'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. MODAL EDITAR NOTAS / OBSERVACIONES MASIVAS */}
      {activeModal === 'notes' && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-md border border-slate-200 dark:border-slate-700 shadow-2xl space-y-4 animate-fade-in-up">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span>📝</span> Anotaciones en Bloque ({count} tareas)
            </h3>
            
            <div className="space-y-3">
              <div className="flex items-center gap-4 text-xs font-bold">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="notesMode"
                    checked={notesMode === 'append'}
                    onChange={() => setNotesMode('append')}
                    className="text-indigo-600"
                  />
                  <span>Añadir al final (sin borrar anteriores)</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="notesMode"
                    checked={notesMode === 'replace'}
                    onChange={() => setNotesMode('replace')}
                    className="text-indigo-600"
                  />
                  <span>Reemplazar todo</span>
                </label>
              </div>

              <textarea
                value={targetNotes}
                onChange={(e) => setTargetNotes(e.target.value)}
                placeholder="Escribe la nota u observación a aplicar a todas las tareas..."
                rows={4}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleApplyNotes}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer disabled:opacity-50"
              >
                {isProcessing ? 'Aplicando...' : 'Guardar Notas'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. MODAL EDICIÓN MULTICAMPO AVANZADA */}
      {activeModal === 'all' && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-lg border border-slate-200 dark:border-slate-700 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto animate-fade-in-up">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <span>✏️</span> Edición Masiva Avanzada ({count} tareas)
              </h3>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Marca las casillas de los campos que deseas modificar a la vez en todas las tareas seleccionadas:
            </p>

            <div className="space-y-3 divide-y divide-slate-100 dark:divide-slate-700/60">
              
              {/* CAMPO ESTADO */}
              <div className="pt-2">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableFields.status}
                    onChange={(e) => setEnableFields(prev => ({ ...prev, status: e.target.checked }))}
                    className="w-4 h-4 text-indigo-600 rounded"
                  />
                  <span>⚡ Modificar Estado</span>
                </label>

                {enableFields.status && (
                  <div className="mt-2 pl-6 space-y-2">
                    <select
                      value={targetStatus}
                      onChange={(e) => setTargetStatus(e.target.value as TaskStatus)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-bold"
                    >
                      <option value="completed">✅ Completada</option>
                      <option value="todo">⏳ Pendiente</option>
                      <option value="in_progress">🚀 En Curso</option>
                      <option value="waiting_on_third_party">⚠️ Retenido / En espera</option>
                    </select>

                    {targetStatus === 'waiting_on_third_party' && (
                      <input
                        type="text"
                        value={targetBlockedBy}
                        onChange={(e) => setTargetBlockedBy(e.target.value)}
                        placeholder="Motivo / Entidad retenedora..."
                        className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-amber-400 rounded-xl text-xs font-medium"
                      />
                    )}
                  </div>
                )}
              </div>

              {/* CAMPO PRIORIDAD */}
              <div className="pt-2">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableFields.priority}
                    onChange={(e) => setEnableFields(prev => ({ ...prev, priority: e.target.checked }))}
                    className="w-4 h-4 text-indigo-600 rounded"
                  />
                  <span>🔴 Modificar Prioridad</span>
                </label>

                {enableFields.priority && (
                  <div className="mt-2 pl-6 flex gap-2">
                    {(['alta', 'media', 'baja'] as const).map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setTargetPriority(p)}
                        className={`flex-1 py-1.5 text-xs font-bold rounded-xl border ${
                          targetPriority === p
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-600'
                        }`}
                      >
                        {p === 'alta' ? '🔴 Alta' : p === 'media' ? '🟧 Media' : '🟩 Baja'}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* CAMPO TIEMPO ESTIMADO */}
              <div className="pt-2">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableFields.time}
                    onChange={(e) => setEnableFields(prev => ({ ...prev, time: e.target.checked }))}
                    className="w-4 h-4 text-indigo-600 rounded"
                  />
                  <span>⏱️ Modificar Tiempo Estimado</span>
                </label>

                {enableFields.time && (
                  <div className="mt-2 pl-6 flex items-center gap-2">
                    <input
                      type="number"
                      min={5}
                      max={480}
                      step={5}
                      value={targetMinutes}
                      onChange={(e) => setTargetMinutes(Number(e.target.value))}
                      className="w-24 px-2 py-1.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-bold text-center"
                    />
                    <span className="text-xs font-bold text-slate-400">minutos</span>
                  </div>
                )}
              </div>

              {/* CAMPO FECHA LÍMITE */}
              <div className="pt-2">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableFields.date}
                    onChange={(e) => setEnableFields(prev => ({ ...prev, date: e.target.checked }))}
                    className="w-4 h-4 text-indigo-600 rounded"
                  />
                  <span>📅 Modificar Fecha Límite</span>
                </label>

                {enableFields.date && (
                  <div className="mt-2 pl-6 space-y-2">
                    <CustomDatePicker
                      value={targetDateStr}
                      onChange={(dStr) => setTargetDateStr(dStr)}
                    />
                    <button
                      type="button"
                      onClick={() => setTargetDateStr('')}
                      className="text-[11px] font-bold text-red-500 hover:underline"
                    >
                      Limpiar / Dejar sin fecha
                    </button>
                  </div>
                )}
              </div>

              {/* CAMPO CONCEJALÍA */}
              {concejaliasList.length > 0 && (
                <div className="pt-2">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableFields.concejalia}
                      onChange={(e) => setEnableFields(prev => ({ ...prev, concejalia: e.target.checked }))}
                      className="w-4 h-4 text-indigo-600 rounded"
                    />
                    <span>🏛️ Modificar Concejalía</span>
                  </label>

                  {enableFields.concejalia && (
                    <div className="mt-2 pl-6">
                      <select
                        value={targetConcejalia}
                        onChange={(e) => setTargetConcejalia(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-bold"
                      >
                        <option value="">-- Seleccionar Concejalía --</option>
                        {concejaliasList.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* CAMPO MI DÍA */}
              <div className="pt-2">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableFields.myDay}
                    onChange={(e) => setEnableFields(prev => ({ ...prev, myDay: e.target.checked }))}
                    className="w-4 h-4 text-indigo-600 rounded"
                  />
                  <span>☀️ Estado en "Mi Día"</span>
                </label>

                {enableFields.myDay && (
                  <div className="mt-2 pl-6 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setMultiMyDay(true)}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-xl border ${
                        multiMyDay
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200'
                      }`}
                    >
                      ☀️ Añadir a Mi Día
                    </button>
                    <button
                      type="button"
                      onClick={() => setMultiMyDay(false)}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-xl border ${
                        !multiMyDay
                          ? 'bg-slate-800 text-white border-slate-800'
                          : 'bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200'
                      }`}
                    >
                      🌑 Quitar de Mi Día
                    </button>
                  </div>
                )}
              </div>

              {/* CAMPO NOTAS */}
              <div className="pt-2">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableFields.notes}
                    onChange={(e) => setEnableFields(prev => ({ ...prev, notes: e.target.checked }))}
                    className="w-4 h-4 text-indigo-600 rounded"
                  />
                  <span>📝 Añadir Anotación</span>
                </label>

                {enableFields.notes && (
                  <div className="mt-2 pl-6 space-y-2">
                    <textarea
                      value={targetNotes}
                      onChange={(e) => setTargetNotes(e.target.value)}
                      placeholder="Nota u observación a añadir..."
                      rows={2}
                      className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    />
                  </div>
                )}
              </div>

            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleApplyMultiField}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer disabled:opacity-50"
              >
                {isProcessing ? 'Guardando...' : 'Aplicar Cambios Seleccionados'}
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
