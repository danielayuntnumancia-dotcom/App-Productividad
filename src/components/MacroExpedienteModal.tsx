import React, { useState, useEffect } from 'react';
import { collection, addDoc, doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { User } from 'firebase/auth';
import { generateExpedientCode, Project } from '../types';
import { useConcejalias } from '../hooks/useConcejalias';
import { useUserTemplates } from '../hooks/useUserTemplates';
import { cleanTaskTitle } from '../utils/taskNumbering';

interface Props {
  user: User;
  onClose: () => void;
  existingMacroProject?: Project | null;
}

const DEFAULT_CM_TASKS = [
  { 
    title: "Requerimiento y Entrega de Documentación", 
    notes: "Comprobar recepción de:\n- Presupuestos\n- Modelo Declaración Responsable\n- Certificado de la AEAT\n- Certificado de la TGSS\n- Certificado titularidad cuenta bancaria / Ficha de terceros", 
    status: "todo" as const, 
    estimatedTimeMin: 30 
  },
  { 
    title: "Rellenar documentación de contrato menor", 
    notes: "",
    status: "todo" as const, 
    estimatedTimeMin: 45 
  },
  { 
    title: "Enviar correo a Zaira y Ana", 
    notes: "",
    status: "todo" as const, 
    estimatedTimeMin: 10 
  },
  { 
    title: "Firma en Gestiona", 
    notes: "",
    status: "waiting_on_third_party" as const, 
    blockedBy: "Plataforma Gestiona / Funcionario", 
    estimatedTimeMin: 15 
  }
];

export default function MacroExpedienteModal({ user, onClose, existingMacroProject = null }: Props) {
  const concejaliasList = useConcejalias(user.uid);
  const { allTemplates } = useUserTemplates(user.uid);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  // Seleccionar automáticamente la mejor plantilla (predeterminada o personalizada de contratos menores)
  useEffect(() => {
    if (allTemplates.length > 0 && !selectedTemplateId) {
      const bestMatch = allTemplates.find(t => t.isDefault) ||
                        allTemplates.find(t => t.isCustom && t.name.toLowerCase().includes('contrato menor')) ||
                        allTemplates.find(t => t.name.toLowerCase().includes('contrato menor')) ||
                        allTemplates[0];
      if (bestMatch) setSelectedTemplateId(bestMatch.id);
    }
  }, [allTemplates, selectedTemplateId]);

  const chosenTemplate = allTemplates.find(t => t.id === selectedTemplateId) || allTemplates[0];
  const templateTasksToUse = (chosenTemplate?.tasks && chosenTemplate.tasks.length > 0)
    ? chosenTemplate.tasks
    : DEFAULT_CM_TASKS;
  const tasksPerContract = templateTasksToUse.length;
  
  const [selectedConcejaliaName, setSelectedConcejaliaName] = useState<string>(
    existingMacroProject ? (existingMacroProject.concejalia || '') : ''
  );
  const [isCreatingConcejalia, setIsCreatingConcejalia] = useState(false);
  const [newConcejaliaName, setNewConcejaliaName] = useState('');

  const [macroName, setMacroName] = useState(existingMacroProject ? existingMacroProject.name : '');
  const [macroNotas, setMacroNotas] = useState(existingMacroProject ? (existingMacroProject.notas || existingMacroProject.notes || '') : '');

  // Lista de contratos menores
  const [contratosList, setContratosList] = useState<string[]>([
    'Alquiler de Escenario',
    'Sonido e Iluminación',
    'Servicio Médico / Ambulancia'
  ]);

  const [isQuickPasteOpen, setIsQuickPasteOpen] = useState(false);
  const [quickPasteText, setQuickPasteText] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Inicializar Concejalía por defecto
  useEffect(() => {
    if (concejaliasList.length > 0 && !selectedConcejaliaName) {
      setSelectedConcejaliaName(concejaliasList[0]);
    }
  }, [concejaliasList, selectedConcejaliaName]);

  const handleSaveNewConcejalia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newConcejaliaName.trim()) return;

    try {
      await addDoc(collection(db, 'tareas'), {
        isConcejalia: true,
        name: newConcejaliaName.trim(),
        userId: user.uid,
        fecha_creacion: Date.now()
      });

      setSelectedConcejaliaName(newConcejaliaName.trim());
      setNewConcejaliaName('');
      setIsCreatingConcejalia(false);
    } catch (err: any) {
      console.error("Error creating concejalia: ", err);
      setErrorMessage("Error al guardar la concejalía en Firestore.");
    }
  };

  const handleAddContratoRow = () => {
    setContratosList(prev => [...prev, '']);
  };

  const handleRemoveContratoRow = (index: number) => {
    if (contratosList.length <= 1) return;
    setContratosList(prev => prev.filter((_, i) => i !== index));
  };

  const handleContratoChange = (index: number, val: string) => {
    setContratosList(prev => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
  };

  const handleApplyQuickPaste = () => {
    if (!quickPasteText.trim()) return;
    const lines = quickPasteText
      .split('\n')
      .map(line => cleanTaskTitle(line.trim()))
      .filter(line => line.length > 0);

    if (lines.length > 0) {
      setContratosList(lines);
      setIsQuickPasteOpen(false);
      setQuickPasteText('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!macroName.trim() || isGenerating) return;
    if (!selectedConcejaliaName) {
      setErrorMessage("Debes seleccionar una concejalía.");
      return;
    }

    const validContratos = contratosList
      .map(c => cleanTaskTitle(c))
      .filter(c => c.length > 0);

    if (validContratos.length === 0) {
      setErrorMessage("Debes añadir al menos 1 Contrato Menor con nombre.");
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);

    try {
      const now = Date.now();
      const batch = writeBatch(db);
      const parentExpName = macroName.trim();
      
      const macroProjectId = existingMacroProject?.id || `macro_${now}_${Math.random().toString(36).substring(2, 7)}`;
      const macroExpCode = existingMacroProject?.expedientCode || generateExpedientCode();

      // ACCIÓN 1: Crear cabecera del Macro-Expediente si no existe previamente
      if (!existingMacroProject) {
        const macroRef = doc(collection(db, 'tareas'));
        batch.set(macroRef, {
          isProject: true,
          isMacroProject: true,
          id: macroProjectId,
          projectId: macroProjectId,
          name: parentExpName,
          projectName: parentExpName,
          type: 'macro_expediente',
          concejalia: selectedConcejaliaName,
          projectConcejalia: selectedConcejaliaName,
          status: 'active',
          expedientCode: macroExpCode,
          notas: macroNotas.trim(),
          notes: macroNotas.trim(),
          userId: user.uid,
          fecha_creacion: now
        });
      }

      // ACCIÓN 2: Crear cada Sub-Proyecto de Contrato Menor y sus 4 Tareas Hijas
      const tareasRef = collection(db, 'tareas');

      validContratos.forEach((cmNameRaw, cmIdx) => {
        const cmName = cleanTaskTitle(cmNameRaw);
        const subProjectId = `proj_cm_${now}_${cmIdx}_${Math.random().toString(36).substring(2, 7)}`;
        const subExpCode = generateExpedientCode();

        // 2.1 Cabecera del Sub-Proyecto Contrato Menor
        const subProjRef = doc(tareasRef);
        batch.set(subProjRef, {
          isProject: true,
          isContratoMenor: true,
          id: subProjectId,
          projectId: subProjectId,
          name: cmName,
          projectName: cmName,
          type: 'contrato_menor',
          concejalia: selectedConcejaliaName,
          projectConcejalia: selectedConcejaliaName,
          status: 'active',
          expedientCode: subExpCode,
          parentProjectId: macroProjectId,
          parentProjectName: parentExpName,
          linkedExpedientId: macroProjectId,
          orderIndex: cmIdx + 1,
          userId: user.uid,
          fecha_creacion: now
        });

        // 2.2 Inyección de las tareas predeterminadas de la plantilla para este contrato menor
        templateTasksToUse.forEach((taskTpl, tIdx) => {
          const cleanTaskName = cleanTaskTitle(taskTpl.title);
          const indexedTitle = `${tIdx + 1}. ${cleanTaskName}`;
          const fullTaskTitle = `${indexedTitle} - ${cmName}`;

          const taskDocRef = doc(tareasRef);
          batch.set(taskDocRef, {
            projectId: subProjectId,
            projectName: cmName,
            parentProjectId: macroProjectId,
            parentProjectName: parentExpName,
            isContratoMenor: true,
            templateId: chosenTemplate?.id || 'contrato_menor',
            concejalia: selectedConcejaliaName,
            projectConcejalia: selectedConcejaliaName,
            projectMasterCategory: selectedConcejaliaName,
            expedientCode: subExpCode,
            linkedExpedientId: macroProjectId,
            orderIndex: tIdx + 1,
            title: indexedTitle,
            titulo: fullTaskTitle,
            notes: taskTpl.notes || '',
            notas: taskTpl.notes || '',
            status: taskTpl.status,
            completada: taskTpl.status === 'completed',
            estimatedTimeMin: taskTpl.estimatedTimeMin,
            tiempo_estimado: `${taskTpl.estimatedTimeMin}m`,
            blockedBy: taskTpl.blockedBy || '',
            blockingReason: taskTpl.status === 'waiting_on_third_party' ? 'Firma en Gestiona' : '',
            isInMyDay: true,
            dueDate: now,
            fecha_vencimiento: now,
            prioridad: 'media',
            userId: user.uid,
            fecha_creacion: now
          });
        });
      });

      await batch.commit();

      const totalTasksCreated = validContratos.length * templateTasksToUse.length;
      setSuccessMessage(
        `¡Macro-Expediente generado con éxito con ${validContratos.length} Contratos Menores y ${totalTasksCreated} trámites asociados!`
      );

      setTimeout(() => {
        onClose();
      }, 1300);

    } catch (err: any) {
      console.error("Error creating Macro-Expediente: ", err);
      setErrorMessage(err?.message || "Error al generar el lote en Firestore.");
      setIsGenerating(false);
    }
  };

  const validCount = contratosList.filter(c => cleanTaskTitle(c).length > 0).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity animate-fade-in"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-700 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-fade-in-up transition-colors duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-700 bg-gradient-to-r from-amber-500/10 via-indigo-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-amber-500 text-white rounded-2xl flex items-center justify-center shrink-0 shadow-md shadow-amber-500/20">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                  {existingMacroProject ? 'Añadir Lote de Contratos Menores' : 'Macro-Expediente con Contratos Menores'}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                  3 Niveles
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Genera un expediente contenedor y múltiples contratos menores con sus trámites automáticos
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Success Banner */}
        {successMessage && (
          <div className="bg-emerald-500 text-white px-6 py-3 text-sm font-semibold flex items-center gap-2 animate-fade-in">
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            <span>{successMessage}</span>
          </div>
        )}

        {/* Error Banner */}
        {errorMessage && (
          <div className="bg-red-500 text-white px-6 py-3 text-sm font-semibold flex items-center gap-2 animate-fade-in">
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* SECCIÓN 1: CONCEJALÍA */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Concejalía Responsable *
              </label>

              {!isCreatingConcejalia ? (
                <div className="flex items-center gap-2">
                  <select
                    value={selectedConcejaliaName}
                    disabled={!!existingMacroProject}
                    onChange={(e) => {
                      if (e.target.value === 'CREATE_NEW') {
                        setIsCreatingConcejalia(true);
                      } else {
                        setSelectedConcejaliaName(e.target.value);
                      }
                    }}
                    className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-sm font-medium text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-amber-500 transition-all outline-none disabled:opacity-60"
                  >
                    {concejaliasList.map((concName) => (
                      <option key={concName} value={concName}>{concName}</option>
                    ))}
                    {!existingMacroProject && <option value="CREATE_NEW">+ Crear nueva Concejalía...</option>}
                  </select>
                </div>
              ) : (
                <div className="flex items-center gap-2 animate-fade-in">
                  <input 
                    type="text"
                    placeholder="Nombre de la nueva Concejalía..."
                    value={newConcejaliaName}
                    onChange={(e) => setNewConcejaliaName(e.target.value)}
                    className="flex-1 px-4 py-2 bg-white dark:bg-slate-700 border border-amber-500 rounded-xl text-sm text-slate-800 dark:text-slate-100 outline-none"
                  />
                  <button 
                    type="button"
                    onClick={handleSaveNewConcejalia}
                    className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition-colors shrink-0 cursor-pointer"
                  >
                    Guardar
                  </button>
                  <button 
                    type="button"
                    onClick={() => setIsCreatingConcejalia(false)}
                    className="px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium rounded-xl hover:bg-slate-200 transition-colors shrink-0 cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>

            {/* SECCIÓN 2: NOMBRE DEL EXPEDIENTE MARCO */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Nombre del Macro-Expediente / Evento / Proyecto Marco *
              </label>
              <input 
                type="text"
                required
                disabled={!!existingMacroProject}
                placeholder="Ej. Fiestas Patronales de Agosto 2026, Campaña Asfaltado, Plan de Colegios..."
                value={macroName}
                onChange={(e) => setMacroName(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-sm font-medium text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-amber-500 transition-all outline-none disabled:opacity-60"
              />
            </div>

            {/* SECCIÓN 3: NOTAS DEL EXPEDIENTE MARCO (Opcional) */}
            {!existingMacroProject && (
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Observaciones / Justificación General (Opcional)
                </label>
                <textarea 
                  rows={2}
                  placeholder="Detalles sobre las fechas del evento, memoria justificativa o presupuesto conjunto..."
                  value={macroNotas}
                  onChange={(e) => setMacroNotas(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-sm font-medium text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-amber-500 transition-all outline-none resize-none"
                />
              </div>
            )}

            {/* SECCIÓN 4: SELECTOR EXPLÍCITO DE PLANTILLA PARA CADA CONTRATO MENOR */}
            <div className="p-4 bg-amber-50/70 dark:bg-amber-950/20 rounded-2xl border border-amber-200 dark:border-amber-800/60 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                    <span>📋</span> Plantilla de Trámites a Aplicar a Cada Contrato Menor *
                  </label>
                  <p className="text-[11px] text-amber-700/80 dark:text-amber-400">
                    Elige qué esquema de tareas hijas tendrá cada contrato menor de este lote.
                  </p>
                </div>
                <span className="text-[11px] font-extrabold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/60 px-2.5 py-1 rounded-xl border border-amber-300 dark:border-amber-700 shrink-0">
                  ⚡ {tasksPerContract} trámites por contrato
                </span>
              </div>

              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer shadow-xs"
              >
                {allTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.isDefault ? '⭐ [Predeterminada] ' : t.isCustom ? '✨ [Personalizada] ' : '🔒 [Fábrica] '}
                    {t.name} ({t.tasks?.length || 0} trámites - {t.concejalia})
                  </option>
                ))}
              </select>

              {/* Vista previa de los trámites que se generarán */}
              {chosenTemplate && (
                <div className="pt-1 text-[11px] text-slate-600 dark:text-slate-300 space-y-1.5">
                  <span className="font-bold text-amber-900 dark:text-amber-200 block text-[11px]">
                    Trámites incluidos en "{chosenTemplate.name}":
                  </span>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                    {templateTasksToUse.map((task, idx) => (
                      <span key={idx} className="bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-800/60 px-2 py-0.5 rounded-lg text-slate-700 dark:text-slate-200 font-semibold text-[11px] shadow-2xs">
                        {idx + 1}. {cleanTaskTitle(task.title)} <span className="text-slate-400 font-mono">({task.estimatedTimeMin}m)</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* SECCIÓN 5: LISTADO DINÁMICO DE CONTRATOS MENORES */}
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-700">
              <div className="sticky top-0 z-20 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md py-2.5 px-3 -mx-3 border-b border-amber-200 dark:border-amber-800/60 flex flex-wrap items-center justify-between gap-2 shadow-xs rounded-xl">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-amber-950 dark:text-amber-200">
                    Contratos Menores del Expediente ({validCount})
                  </label>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Cada uno se creará con los {tasksPerContract} trámites de "{chosenTemplate?.name || 'la plantilla seleccionada'}".
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsQuickPasteOpen(!isQuickPasteOpen)}
                    className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    Pegar Lista
                  </button>

                  <button
                    type="button"
                    onClick={handleAddContratoRow}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    + Añadir Contrato
                  </button>
                </div>
              </div>

              {/* Panel de Pegado Rápido */}
              {isQuickPasteOpen && (
                <div className="p-4 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 rounded-2xl space-y-2.5 animate-fade-in">
                  <span className="text-xs font-bold text-amber-900 dark:text-amber-200 block">
                    📋 Pega tu lista de contratos menores (una línea por contrato):
                  </span>
                  <textarea 
                    rows={4}
                    placeholder={`Alquiler de Escenario\nSonido e Iluminación\nServicio de Ambulancias\nPirotecnia y Fuegos\nSeguridad y Vigilancia`}
                    value={quickPasteText}
                    onChange={(e) => setQuickPasteText(e.target.value)}
                    className="w-full p-3 bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700/60 rounded-xl text-xs text-slate-800 dark:text-slate-100 outline-none font-mono"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsQuickPasteOpen(false)}
                      className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyQuickPaste}
                      disabled={!quickPasteText.trim()}
                      className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                    >
                      Cargar Lista
                    </button>
                  </div>
                </div>
              )}

              {/* Filas de Contratos Menores */}
              <div className="space-y-2">
                {contratosList.map((cmText, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-700 rounded-2xl transition-all">
                    <div className="w-7 h-7 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 text-xs font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </div>

                    <input 
                      type="text"
                      placeholder={`Nombre del contrato menor ${idx + 1} (ej. Escenario, Sonido, Carpas)...`}
                      value={cmText}
                      onChange={(e) => handleContratoChange(idx, e.target.value)}
                      onBlur={(e) => handleContratoChange(idx, cleanTaskTitle(e.target.value))}
                      className="flex-1 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl text-sm font-medium text-slate-800 dark:text-slate-100 outline-none focus:border-amber-500"
                    />

                    <div className="flex items-center gap-1.5 shrink-0 px-2.5 py-1 bg-white/80 dark:bg-slate-800/80 rounded-xl border border-slate-100 dark:border-slate-700/50">
                      <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300">
                        ⚡ {tasksPerContract} trámites
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveContratoRow(idx)}
                      disabled={contratosList.length <= 1}
                      className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-20 transition-colors shrink-0 cursor-pointer"
                      title="Eliminar fila"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* RESUMEN VISUAL DEL LOTE */}
            <div className="p-4 bg-gradient-to-r from-indigo-50/50 to-amber-50/50 dark:from-indigo-950/20 dark:to-amber-950/20 border border-indigo-100 dark:border-indigo-900/40 rounded-2xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-3">
                <span className="text-xl">📊</span>
                <div>
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">
                    Resumen de Creación en Firestore
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {!existingMacroProject ? '1 Expediente Marco' : 'Expediente Marco Existente'} ➔ {validCount} Sub-Contratos Menores ➔ {validCount * tasksPerContract} Tareas Hijas
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-amber-700 dark:text-amber-300">
                  {validCount * tasksPerContract} trámites
                </span>
              </div>
            </div>

          </div>

          {/* FOOTER */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors text-sm cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isGenerating || !macroName.trim() || validCount === 0}
              className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-md shadow-amber-500/20 transition-all flex items-center gap-2 text-sm cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Generando lote completo...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <span>Crear {validCount} Contratos Menores</span>
                </>
              )}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
