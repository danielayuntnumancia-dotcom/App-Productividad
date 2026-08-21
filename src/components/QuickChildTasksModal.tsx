import React, { useState } from 'react';
import { collection, writeBatch, doc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { User } from 'firebase/auth';
import { Project, Tarea, ExpedienteTemplate, TaskStatus } from '../types';
import { useConcejalias } from '../hooks/useConcejalias';
import { useUserTemplates } from '../hooks/useUserTemplates';
import CustomDatePicker from './CustomDatePicker';
import { cleanTaskTitle } from '../utils/taskNumbering';

interface QueuedChildTask {
  id: string;
  title: string;
  concejalia: string;
  prioridad: 'baja' | 'media' | 'alta' | 'urgente';
  estimatedTimeMin: number;
  dueDateStr: string;
  status: TaskStatus;
  blockedBy: string;
  blockingReason: string;
  notes: string;
  isInMyDay: boolean;
  driveFolderUrl: string;
  isExpanded: boolean;
}

interface Props {
  user: User;
  project: Project;
  existingTasks?: Tarea[];
  isOpen: boolean;
  onClose: () => void;
  templates?: ExpedienteTemplate[];
  onTasksCreated?: () => void;
}

const COMMON_STEPS = [
  'Presupuesto y ofertas',
  'Declaración Responsable',
  'Certificado AEAT',
  'Certificado TGSS',
  'Certificado titularidad cuenta bancaria',
  'Informe / Memoria Justificativa',
  'Retención de Crédito (RC)',
  'Aprobación y Firma en Gestiona',
  'Envío a Intervención',
  'Recepción y Conformidad de Factura'
];

export default function QuickChildTasksModal({
  user,
  project,
  existingTasks = [],
  isOpen,
  onClose,
  templates = [],
  onTasksCreated
}: Props) {
  if (!isOpen) return null;

  const concejaliasList = useConcejalias(user.uid);
  const { allTemplates } = useUserTemplates(user.uid);
  const availableTemplates = templates && templates.length > 0 ? templates : allTemplates;

  const defaultConcejalia = project.concejalia || (concejaliasList.length > 0 ? concejaliasList[0] : 'General');
  
  const existingCount = existingTasks.length;

  const createBlankTask = (offsetIndex: number, defaultTitle = ''): QueuedChildTask => {
    return {
      id: `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: defaultTitle,
      concejalia: defaultConcejalia,
      prioridad: 'media',
      estimatedTimeMin: 30,
      dueDateStr: '',
      status: 'todo',
      blockedBy: '',
      blockingReason: '',
      notes: '',
      isInMyDay: true,
      driveFolderUrl: '',
      isExpanded: false
    };
  };

  const [queue, setQueue] = useState<QueuedChildTask[]>(() => [createBlankTask(0)]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleAddTaskRow = (title = '') => {
    setQueue((prev) => [...prev, createBlankTask(prev.length, title)]);
  };

  const handleRemoveTaskRow = (id: string) => {
    if (queue.length === 1) {
      setQueue([createBlankTask(0)]);
      return;
    }
    setQueue((prev) => prev.filter((t) => t.id !== id));
  };

  const handleDuplicateTaskRow = (index: number) => {
    const item = queue[index];
    const duplicate: QueuedChildTask = {
      ...item,
      id: `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: item.title ? `${item.title} (copia)` : ''
    };
    const newQueue = [...queue];
    newQueue.splice(index + 1, 0, duplicate);
    setQueue(newQueue);
  };

  const handleUpdateTask = (id: string, field: keyof QueuedChildTask, value: any) => {
    setQueue((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [field]: value } : t))
    );
  };

  const handleLoadFromTemplate = (templateId: string) => {
    if (!templateId) return;
    const tpl = availableTemplates.find((t) => t.id === templateId);
    if (!tpl || !tpl.tasks || tpl.tasks.length === 0) return;

    const loadedTasks: QueuedChildTask[] = tpl.tasks.map((tk, idx) => ({
      id: `tpl_${Date.now()}_${idx}`,
      title: cleanTaskTitle(tk.title || ''),
      concejalia: tpl.concejalia || defaultConcejalia,
      prioridad: 'media',
      estimatedTimeMin: tk.estimatedTimeMin || 30,
      dueDateStr: '',
      status: tk.status || 'todo',
      blockedBy: tk.blockedBy || '',
      blockingReason: tk.blockingReason || '',
      notes: tk.notes || tk.notas || '',
      isInMyDay: true,
      driveFolderUrl: '',
      isExpanded: false
    }));

    if (queue.length === 1 && !queue[0].title.trim()) {
      setQueue(loadedTasks);
    } else {
      setQueue((prev) => [...prev, ...loadedTasks]);
    }
    setSelectedTemplateId('');
  };

  const handleSaveAll = async () => {
    const validTasks = queue.filter((t) => t.title.trim().length > 0);
    if (validTasks.length === 0) {
      setErrorMessage("Por favor, introduce el nombre de al menos un trámite.");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const batch = writeBatch(db);
      const now = Date.now();

      validTasks.forEach((t, idx) => {
        const newTaskRef = doc(collection(db, 'tareas'));
        const nextSeq = existingCount + idx + 1;
        const rawTitle = t.title.trim();
        const hasNumberPrefix = /^\d+[\.\s]/.test(rawTitle);
        const cleanTitleText = cleanTaskTitle(rawTitle);
        const stepTitle = hasNumberPrefix ? rawTitle : `${nextSeq}. ${cleanTitleText}`;
        const fullTitle = `${stepTitle} - ${project.name}`;

        const dueTimestamp = t.dueDateStr ? new Date(`${t.dueDateStr}T23:59:59`).getTime() : now;

        const taskDoc: any = {
          userId: user.uid,
          projectId: project.id,
          projectName: project.name,
          concejalia: t.concejalia || defaultConcejalia,
          projectConcejalia: t.concejalia || defaultConcejalia,
          orderIndex: nextSeq,
          title: stepTitle,
          titulo: fullTitle,
          status: t.status,
          completada: t.status === 'completed',
          prioridad: t.prioridad,
          estimatedTimeMin: t.estimatedTimeMin,
          tiempo_estimado: `${t.estimatedTimeMin}m`,
          dueDate: dueTimestamp,
          fecha_vencimiento: dueTimestamp,
          notes: t.notes.trim(),
          notas: t.notes.trim(),
          blockedBy: t.blockedBy.trim(),
          blockingReason: t.blockingReason.trim(),
          isInMyDay: t.isInMyDay,
          driveFolderUrl: t.driveFolderUrl.trim(),
          fecha_creacion: now + idx
        };

        if (project.parentProjectId) taskDoc.parentProjectId = project.parentProjectId;
        if (project.parentProjectName) taskDoc.parentProjectName = project.parentProjectName;
        if (project.isContratoMenor !== undefined) taskDoc.isContratoMenor = project.isContratoMenor;
        if (project.expedientCode) taskDoc.expedientCode = project.expedientCode;
        if (project.linkedExpedientId) taskDoc.linkedExpedientId = project.linkedExpedientId;

        batch.set(newTaskRef, taskDoc);
      });

      await batch.commit();
      if (onTasksCreated) onTasksCreated();
      onClose();
    } catch (err: any) {
      console.error("Error creating child tasks in batch:", err);
      setErrorMessage(err?.message || "Error al guardar las tareas hijas.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-6 bg-slate-900/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden animate-fade-in-up">
        
        {/* HEADER */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 p-0.5 shadow-md flex items-center justify-center text-white text-lg font-black">
              ➕
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-base sm:text-lg">
                  Añadir Trámites al Expediente
                </h3>
                {project.expedientCode && (
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    {project.expedientCode}
                  </span>
                )}
                {project.concejalia && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {project.concejalia}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5 mt-0.5">
                <span>📁 {project.name}</span>
                {project.parentProjectName && (
                  <span className="text-purple-600 dark:text-purple-400 font-semibold">
                    • 🏛️ Macro: {project.parentProjectName}
                  </span>
                )}
                <span className="text-slate-400">({existingCount} trámites existentes)</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-xl transition-colors cursor-pointer text-base font-bold"
            title="Cerrar modal"
          >
            ✕
          </button>
        </div>

        {/* BARRA SUPERIOR: ACCIONES RÁPIDAS Y PLANTILLAS */}
        <div className="p-3 sm:p-4 bg-indigo-50/50 dark:bg-indigo-950/20 border-b border-indigo-100 dark:border-indigo-900/40 flex items-center justify-between gap-3 flex-wrap shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
              Plantilla rápida:
            </span>
            <select
              value={selectedTemplateId}
              onChange={(e) => handleLoadFromTemplate(e.target.value)}
              className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none cursor-pointer hover:border-indigo-400"
            >
              <option value="">Seleccionar plantilla para cargar pasos...</option>
              {availableTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.tasks?.length || 0} pasos)
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleAddTaskRow()}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span>➕</span> Añadir Fila
            </button>
          </div>
        </div>

        {/* SUGERENCIAS RÁPIDAS DE PASOS FRECUENTES */}
        <div className="px-4 py-2.5 bg-slate-50/80 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800/80 flex items-center gap-1.5 overflow-x-auto text-[11px] shrink-0 no-scrollbar">
          <span className="text-slate-400 dark:text-slate-500 font-bold whitespace-nowrap">
            Sugerencias con 1 clic:
          </span>
          {COMMON_STEPS.map((step) => (
            <button
              key={step}
              type="button"
              onClick={() => handleAddTaskRow(step)}
              className="px-2.5 py-1 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-300 border border-slate-200 dark:border-slate-700 rounded-lg whitespace-nowrap transition-colors cursor-pointer shrink-0 font-medium"
            >
              + {step}
            </button>
          ))}
        </div>

        {/* MENSAJE DE ERROR */}
        {errorMessage && (
          <div className="p-3 bg-red-50 dark:bg-red-950/50 border-b border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center justify-between">
            <span>⚠️ {errorMessage}</span>
            <button onClick={() => setErrorMessage(null)} className="font-bold">✕</button>
          </div>
        )}

        {/* LISTA DINÁMICA DE TAREAS EN COLA */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {queue.map((item, index) => {
            const stepNum = existingCount + index + 1;

            return (
              <div
                key={item.id}
                className={`border rounded-2xl p-3.5 sm:p-4 transition-all duration-200 ${
                  item.isExpanded
                    ? 'bg-slate-50/90 dark:bg-slate-800/90 border-indigo-300 dark:border-indigo-700 shadow-md ring-1 ring-indigo-400/20'
                    : 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                {/* FILA PRINCIPAL: NÚMERO DE PASO + TÍTULO + ACCIONES */}
                <div className="flex items-center gap-2 sm:gap-3">
                  {/* Badge de paso */}
                  <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs">
                    {stepNum}
                  </span>

                  {/* Input de Título */}
                  <input
                    type="text"
                    value={item.title}
                    onChange={(e) => handleUpdateTask(item.id, 'title', e.target.value)}
                    placeholder={`Nombre del trámite (Paso ${stepNum})...`}
                    className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-800 dark:text-slate-100 placeholder-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  />

                  {/* Selector de Prioridad Rápido */}
                  <div className="hidden sm:flex items-center gap-1 bg-slate-100 dark:bg-slate-700/60 p-1 rounded-xl shrink-0">
                    {(['baja', 'media', 'alta', 'urgente'] as const).map((p) => {
                      const isSel = item.prioridad === p;
                      const colors: Record<string, string> = {
                        baja: isSel ? 'bg-slate-500 text-white' : 'text-slate-500 hover:text-slate-800',
                        media: isSel ? 'bg-blue-600 text-white' : 'text-blue-500 hover:text-blue-700',
                        alta: isSel ? 'bg-amber-600 text-white' : 'text-amber-500 hover:text-amber-700',
                        urgente: isSel ? 'bg-rose-600 text-white' : 'text-rose-500 hover:text-rose-700'
                      };
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => handleUpdateTask(item.id, 'prioridad', p)}
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer ${colors[p]}`}
                        >
                          {p.charAt(0)}
                        </button>
                      );
                    })}
                  </div>

                  {/* Selector de Tiempo Rápido */}
                  <div className="hidden md:flex items-center gap-1 shrink-0">
                    <input
                      type="number"
                      min={5}
                      step={5}
                      value={item.estimatedTimeMin}
                      onChange={(e) => handleUpdateTask(item.id, 'estimatedTimeMin', Math.max(5, parseInt(e.target.value, 10) || 15))}
                      className="w-14 px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-center text-slate-700 dark:text-slate-200 outline-none"
                    />
                    <span className="text-[11px] font-bold text-slate-400">min</span>
                  </div>

                  {/* Botón Desplegar Opciones Avanzadas */}
                  <button
                    type="button"
                    onClick={() => handleUpdateTask(item.id, 'isExpanded', !item.isExpanded)}
                    className={`p-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      item.isExpanded
                        ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                    title="Editar todos los parámetros avanzados (Concejalía, Fecha, Retención, Notas)"
                  >
                    ⚙️
                  </button>

                  {/* Duplicar Fila */}
                  <button
                    type="button"
                    onClick={() => handleDuplicateTaskRow(index)}
                    className="p-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all cursor-pointer text-xs"
                    title="Duplicar este trámite"
                  >
                    📑
                  </button>

                  {/* Eliminar Fila */}
                  <button
                    type="button"
                    onClick={() => handleRemoveTaskRow(item.id)}
                    className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all cursor-pointer text-xs"
                    title="Eliminar de la lista"
                  >
                    🗑️
                  </button>
                </div>

                {/* PANEL DE PARÁMETROS AVANZADOS (DESPLEGABLE) */}
                {item.isExpanded && (
                  <div className="mt-3.5 pt-3.5 border-t border-slate-200 dark:border-slate-700/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-fade-in text-xs">
                    {/* Concejalía */}
                    <div>
                      <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">
                        Concejalía:
                      </label>
                      <select
                        value={item.concejalia}
                        onChange={(e) => handleUpdateTask(item.id, 'concejalia', e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none"
                      >
                        {concejaliasList.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    {/* Estado Inicial */}
                    <div>
                      <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">
                        Estado Inicial:
                      </label>
                      <select
                        value={item.status}
                        onChange={(e) => handleUpdateTask(item.id, 'status', e.target.value as TaskStatus)}
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none"
                      >
                        <option value="todo">⏳ Por hacer (Pendiente)</option>
                        <option value="in_progress">⚡ En progreso</option>
                        <option value="waiting_on_third_party">⚠️ Esperando a tercero / Retenido</option>
                        <option value="completed">✓ Completado</option>
                      </select>
                    </div>

                    {/* Fecha Límite */}
                    <div>
                      <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">
                        Fecha Límite:
                      </label>
                      <CustomDatePicker
                        value={item.dueDateStr}
                        onChange={(d) => handleUpdateTask(item.id, 'dueDateStr', d)}
                      />
                    </div>

                    {/* Bloqueo / Retención (Si aplica) */}
                    {item.status === 'waiting_on_third_party' && (
                      <>
                        <div>
                          <label className="block font-bold text-amber-700 dark:text-amber-400 mb-1">
                            Retenido por:
                          </label>
                          <input
                            type="text"
                            value={item.blockedBy}
                            onChange={(e) => handleUpdateTask(item.id, 'blockedBy', e.target.value)}
                            placeholder="Ej. Intervención, Proveedor..."
                            className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-amber-700 dark:text-amber-400 mb-1">
                            Motivo del bloqueo:
                          </label>
                          <input
                            type="text"
                            value={item.blockingReason}
                            onChange={(e) => handleUpdateTask(item.id, 'blockingReason', e.target.value)}
                            placeholder="Ej. Pendiente de firma en Gestiona..."
                            className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 outline-none"
                          />
                        </div>
                      </>
                    )}

                    {/* Carpeta Drive */}
                    <div>
                      <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">
                        Enlace a Carpeta / Drive:
                      </label>
                      <input
                        type="url"
                        value={item.driveFolderUrl}
                        onChange={(e) => handleUpdateTask(item.id, 'driveFolderUrl', e.target.value)}
                        placeholder="https://drive.google.com/..."
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 outline-none"
                      />
                    </div>

                    {/* En Mi Día Checkbox */}
                    <div className="flex items-center gap-2 pt-5">
                      <input
                        type="checkbox"
                        id={`myday_${item.id}`}
                        checked={item.isInMyDay}
                        onChange={(e) => handleUpdateTask(item.id, 'isInMyDay', e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
                      />
                      <label htmlFor={`myday_${item.id}`} className="font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                        ⭐ Incluir en "Mi Día"
                      </label>
                    </div>

                    {/* Notas / Observaciones */}
                    <div className="sm:col-span-2 lg:col-span-3">
                      <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">
                        Notas y Observaciones:
                      </label>
                      <textarea
                        rows={2}
                        value={item.notes}
                        onChange={(e) => handleUpdateTask(item.id, 'notes', e.target.value)}
                        placeholder="Instrucciones, requisitos o notas adicionales para este trámite..."
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* FOOTER */}
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 flex items-center justify-between gap-3 flex-wrap shrink-0">
          <button
            type="button"
            onClick={() => handleAddTaskRow()}
            className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-2xl transition-colors flex items-center gap-2 cursor-pointer"
          >
            <span>➕</span> Añadir Otro Trámite
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 font-bold text-xs transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleSaveAll}
              disabled={isSaving}
              className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-extrabold text-xs sm:text-sm rounded-2xl shadow-lg shadow-indigo-500/25 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <span>💾</span>
                  <span>Guardar {queue.filter(t => t.title.trim()).length} Trámites</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
