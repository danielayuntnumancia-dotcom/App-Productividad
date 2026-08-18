import React, { useState, useRef } from 'react';
import { collection, doc, addDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { User } from 'firebase/auth';
import { ExpedienteTemplate, generateExpedientCode } from '../types';
import ExpedienteBuilderModal from './ExpedienteBuilderModal';
import { getConcejaliaStyle } from '../utils/concejaliaColors';
import { useConcejalias } from '../hooks/useConcejalias';
import { useUserTemplates } from '../hooks/useUserTemplates';
import { cleanTaskTitle } from '../utils/taskNumbering';

interface Props {
  user: User;
  searchQuery?: string;
}

export default function PlantillasView({ user, searchQuery = '' }: Props) {
  const concejaliasList = useConcejalias(user.uid);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Hook centralizado con soporte de predeterminadas y eliminación total
  const {
    allTemplates,
    customTemplates,
    hiddenStaticIds,
    defaultTemplateId,
    setDefaultTemplate,
    deleteTemplate,
    restoreStaticTemplates
  } = useUserTemplates(user.uid);

  const [expandedTemplates, setExpandedTemplates] = useState<Set<string>>(new Set());

  // Filtros
  const [concejaliaFilter, setConcejaliaFilter] = useState<string>('todas');
  const [typeFilter, setTypeFilter] = useState<'todas' | 'default' | 'custom' | 'system'>('todas');

  // Estados para modales de edición / creación
  const [builderModal, setBuilderModal] = useState<{
    isOpen: boolean;
    templateToEdit: ExpedienteTemplate | null;
    mode: 'create_template' | 'edit_template' | 'create_expediente';
  }>({
    isOpen: false,
    templateToEdit: null,
    mode: 'create_template'
  });

  // Modal de generación rápida de expediente
  const [quickGenModal, setQuickGenModal] = useState<{
    isOpen: boolean;
    template: ExpedienteTemplate | null;
  }>({
    isOpen: false,
    template: null
  });
  const [quickGenExpName, setQuickGenExpName] = useState('');
  const [isGeneratingQuick, setIsGeneratingQuick] = useState(false);

  // Mensajes de alerta y feedback
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedTemplates(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Filtrado de plantillas
  const filteredTemplates = allTemplates.filter(t => {
    if (concejaliaFilter !== 'todas' && t.concejalia !== concejaliaFilter) {
      return false;
    }
    if (typeFilter === 'default' && !t.isDefault) return false;
    if (typeFilter === 'custom' && !t.isCustom) return false;
    if (typeFilter === 'system' && t.isCustom) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = t.name.toLowerCase().includes(q);
      const matchConc = t.concejalia.toLowerCase().includes(q);
      const matchTask = t.tasks?.some(task => task.title.toLowerCase().includes(q));
      return matchName || matchConc || matchTask;
    }
    return true;
  });

  // Alternar estado de Predeterminada (⭐)
  const handleToggleDefault = async (template: ExpedienteTemplate) => {
    try {
      await setDefaultTemplate(template.id, !!template.isDefault);
      const msg = template.isDefault 
        ? `Plantilla "${template.name}" desmarcada como predeterminada.` 
        : `⭐ ¡Plantilla "${template.name}" establecida como Predeterminada!`;
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error("Error setting default template: ", err);
      setErrorMsg("Error al actualizar la plantilla predeterminada.");
      setTimeout(() => setErrorMsg(null), 3000);
    }
  };

  // Duplicar / Clonar Plantilla
  const handleDuplicateTemplate = async (template: ExpedienteTemplate) => {
    try {
      const now = Date.now();
      await addDoc(collection(db, 'tareas'), {
        isTemplate: true,
        name: `${template.name} (Copia)`,
        concejalia: template.concejalia || 'General',
        descripcion: template.descripcion || template.description || '',
        tasks: template.tasks.map(t => ({
          title: cleanTaskTitle(t.title),
          estimatedTimeMin: t.estimatedTimeMin || 30,
          status: t.status || 'todo',
          notes: t.notes || t.notas || '',
          ...(t.blockedBy ? { blockedBy: t.blockedBy } : {})
        })),
        userId: user.uid,
        fecha_creacion: now
      });

      setSuccessMsg(`¡Plantilla "${template.name}" duplicada con éxito!`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error("Error duplicating template: ", err);
      setErrorMsg("Error al duplicar la plantilla.");
      setTimeout(() => setErrorMsg(null), 3000);
    }
  };

  // Eliminar cualquier plantilla (Personalizada o del Sistema)
  const handleDeleteTemplate = async (template: ExpedienteTemplate) => {
    const confirmMessage = template.isCustom
      ? `¿Eliminar definitivamente la plantilla "${template.name}"?`
      : `¿Eliminar la plantilla de fábrica "${template.name}" de tu catálogo? (Podrás restaurarla cuando quieras con el botón "Restaurar Fábrica")`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      await deleteTemplate(template);
      setSuccessMsg(`Plantilla "${template.name}" eliminada de tu catálogo.`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error("Error deleting template: ", err);
      setErrorMsg("Error al eliminar la plantilla.");
      setTimeout(() => setErrorMsg(null), 3000);
    }
  };

  // Restaurar plantillas originales de fábrica
  const handleRestoreStatic = async () => {
    if (!window.confirm("¿Restaurar todas las plantillas originales de fábrica en tu catálogo?")) return;
    try {
      await restoreStaticTemplates();
      setSuccessMsg("¡Plantillas originales de fábrica restauradas con éxito!");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setErrorMsg("Error al restaurar las plantillas de fábrica.");
      setTimeout(() => setErrorMsg(null), 3000);
    }
  };

  // Exportar todas las plantillas en formato JSON
  const handleExportJSON = () => {
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(allTemplates, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `Plantillas_Expedientes_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      setSuccessMsg("¡Archivo JSON de respaldo exportado correctamente!");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      console.error("Error exporting templates JSON: ", err);
      setErrorMsg("Error al exportar el archivo JSON.");
    }
  };

  // Importar plantillas desde JSON
  const handleImportJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);

        if (!Array.isArray(parsed)) {
          throw new Error("El archivo JSON no contiene un listado de plantillas válido.");
        }

        const batch = writeBatch(db);
        const now = Date.now();
        let count = 0;

        parsed.forEach((item: any) => {
          if (item.name && Array.isArray(item.tasks)) {
            const newRef = doc(collection(db, 'tareas'));
            batch.set(newRef, {
              isTemplate: true,
              name: item.name.trim(),
              concejalia: item.concejalia || 'General',
              descripcion: item.descripcion || item.description || '',
              tasks: item.tasks.map((t: any) => ({
                title: cleanTaskTitle(t.title || ''),
                estimatedTimeMin: Number(t.estimatedTimeMin) || 30,
                status: t.status || 'todo',
                notes: t.notes || t.notas || '',
                ...(t.blockedBy ? { blockedBy: t.blockedBy } : {})
              })),
              userId: user.uid,
              fecha_creacion: now
            });
            count++;
          }
        });

        if (count > 0) {
          await batch.commit();
          setSuccessMsg(`¡${count} plantillas importadas y guardadas con éxito!`);
          setTimeout(() => setSuccessMsg(null), 3500);
        } else {
          setErrorMsg("No se encontraron plantillas válidas en el archivo.");
          setTimeout(() => setErrorMsg(null), 3500);
        }

      } catch (err: any) {
        console.error("Error reading JSON file: ", err);
        setErrorMsg(`Error al procesar el archivo JSON: ${err?.message || ''}`);
        setTimeout(() => setErrorMsg(null), 4000);
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.readAsText(file);
  };

  // Generar Expediente desde la Plantilla
  const handleQuickGenerateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickGenModal.template || !quickGenExpName.trim() || isGeneratingQuick) return;

    setIsGeneratingQuick(true);
    try {
      const template = quickGenModal.template;
      const projName = quickGenExpName.trim();
      const now = Date.now();
      const batch = writeBatch(db);

      const generatedProjectId = `proj_${now}_${Math.random().toString(36).substring(2, 7)}`;
      const expCode = generateExpedientCode();
      const isCM = template.id === 'contrato_menor' || projName.toLowerCase().includes('contrato menor');

      // 1. Cabecera del Proyecto en /tareas con isProject: true
      const projectRef = doc(collection(db, 'tareas'));
      batch.set(projectRef, {
        isProject: true,
        id: generatedProjectId,
        projectId: generatedProjectId,
        name: projName,
        projectName: projName,
        type: isCM ? 'contrato_menor' : 'template',
        templateId: template.id,
        isContratoMenor: isCM,
        concejalia: template.concejalia || 'General',
        projectConcejalia: template.concejalia || 'General',
        status: 'active',
        expedientCode: expCode,
        notas: template.descripcion || '',
        notes: template.descripcion || '',
        userId: user.uid,
        fecha_creacion: now
      });

      // 2. Tareas dinámicas
      const tareasRef = collection(db, 'tareas');
      template.tasks.forEach((task, index) => {
        const clean = cleanTaskTitle(task.title);
        const indexedTitle = `${index + 1}. ${clean}`;
        const fullTitle = `${indexedTitle} - ${projName}`;

        const newTaskRef = doc(tareasRef);
        batch.set(newTaskRef, {
          projectId: generatedProjectId,
          projectName: projName,
          concejalia: template.concejalia || 'General',
          projectConcejalia: template.concejalia || 'General',
          projectMasterCategory: template.concejalia || 'General',
          expedientCode: expCode,
          templateId: template.id,
          isContratoMenor: isCM,
          orderIndex: index + 1,
          title: indexedTitle,
          titulo: fullTitle,
          notes: task.notes || template.descripcion || '',
          notas: task.notes || template.descripcion || '',
          status: task.status,
          completada: task.status === 'completed',
          estimatedTimeMin: task.estimatedTimeMin,
          tiempo_estimado: `${task.estimatedTimeMin}m`,
          blockedBy: task.blockedBy || '',
          blockingReason: task.blockingReason || '',
          isInMyDay: true,
          dueDate: now,
          fecha_vencimiento: now,
          prioridad: 'media',
          userId: user.uid,
          fecha_creacion: now
        });
      });

      await batch.commit();

      setSuccessMsg(`¡Expediente "${projName}" generado con éxito con ${template.tasks.length} tareas!`);
      setQuickGenModal({ isOpen: false, template: null });
      setQuickGenExpName('');
      setTimeout(() => setSuccessMsg(null), 3000);

    } catch (err: any) {
      console.error("Error creating expedient from template: ", err);
      setErrorMsg("Error al generar el expediente.");
    } finally {
      setIsGeneratingQuick(false);
    }
  };

  // Estadísticas globales
  const totalTasksCount = allTemplates.reduce((acc, t) => acc + (t.tasks?.length || 0), 0);
  const totalMinutes = allTemplates.reduce((acc, t) => acc + (t.tasks?.reduce((sum, task) => sum + (task.estimatedTimeMin || 0), 0) || 0), 0);

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6 animate-fade-in">
      
      {/* Toast Notification Banner */}
      {successMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-900 text-white text-xs sm:text-sm font-semibold px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2 border border-emerald-700 animate-bounce">
          <svg className="w-5 h-5 text-emerald-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-red-900 text-white text-xs sm:text-sm font-semibold px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2 border border-red-700 animate-bounce">
          <svg className="w-5 h-5 text-red-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Input Oculto para Importar JSON */}
      <input 
        type="file"
        ref={fileInputRef}
        onChange={handleImportJSON}
        accept=".json,application/json"
        className="hidden"
      />

      {/* HEADER PRINCIPAL */}
      <section className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-md shadow-indigo-500/20">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
                Gestor y Catálogo de Plantillas
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Diseña, personaliza, elige tus predeterminadas o elimina plantillas antiguas.
              </p>
            </div>
          </div>
        </div>

        {/* BOTONES DE ACCIÓN PRINCIPALES */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button 
            onClick={handleExportJSON}
            className="px-3.5 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl border border-slate-200 dark:border-slate-600 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="Descargar copia de seguridad en JSON"
          >
            <span>📤</span> Exportar JSON
          </button>

          <button 
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl border border-slate-200 dark:border-slate-600 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="Subir archivo JSON de plantillas"
          >
            <span>📥</span> Importar JSON
          </button>

          <button 
            onClick={() => setBuilderModal({ isOpen: true, templateToEdit: null, mode: 'create_template' })}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-500/20 hover:shadow-lg transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <span>Nueva Plantilla</span>
          </button>
        </div>
      </section>

      {/* TARJETAS DE ESTADÍSTICAS */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xs space-y-1">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Total Plantillas</span>
          <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{allTemplates.length}</span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xs space-y-1">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Personalizadas</span>
          <span className="text-2xl font-black text-amber-600 dark:text-amber-400">{customTemplates.length}</span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xs space-y-1">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Trámites Modelados</span>
          <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{totalTasksCount}</span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xs space-y-1">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Tiempo Estimado</span>
          <span className="text-2xl font-black text-purple-600 dark:text-purple-400">{Math.round(totalMinutes / 60)}h {totalMinutes % 60}m</span>
        </div>
      </section>

      {/* BARRA DE FILTROS */}
      <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 p-4 rounded-2xl shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
        {/* Selector de Concejalía */}
        <div className="flex items-center gap-2 min-w-[220px]">
          <span className="font-bold text-slate-500 dark:text-slate-400 shrink-0">🏛️ Concejalía:</span>
          <select
            value={concejaliaFilter}
            onChange={(e) => setConcejaliaFilter(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-500"
          >
            <option value="todas">Todas las concejalías ({allTemplates.length})</option>
            {concejaliasList.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Filtro por Tipo */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700/50 p-1 rounded-xl shrink-0 overflow-x-auto no-scrollbar flex-nowrap max-w-full">
            <span className="font-bold text-slate-400 dark:text-slate-500 px-1 text-[11px]">Tipo:</span>
            {[
              { key: 'todas', label: 'Todas' },
              { key: 'default', label: '⭐ Predeterminadas' },
              { key: 'custom', label: '✨ Personalizadas' },
              { key: 'system', label: '🔒 Fábrica' }
            ].map((tOpt) => (
              <button
                key={tOpt.key}
                onClick={() => setTypeFilter(tOpt.key as any)}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer shrink-0 ${
                  typeFilter === tOpt.key
                    ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {tOpt.label}
              </button>
            ))}
          </div>

          {/* Botón Restaurar plantillas de fábrica si hay alguna eliminada */}
          {hiddenStaticIds.length > 0 && (
            <button
              onClick={handleRestoreStatic}
              className="px-3 py-1.5 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 text-amber-700 dark:text-amber-300 font-bold text-[11px] rounded-xl border border-amber-200 dark:border-amber-800 transition-all flex items-center gap-1 cursor-pointer"
              title="Restaurar plantillas de fábrica que habías eliminado"
            >
              <span>🔄</span> Restaurar Fábrica ({hiddenStaticIds.length})
            </button>
          )}
        </div>
      </section>

      {/* GRID DE PLANTILLAS */}
      {filteredTemplates.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 space-y-3">
          <svg className="w-16 h-16 mx-auto text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">
            No se encontraron plantillas con los filtros actuales.
          </p>
          <button
            type="button"
            onClick={() => setBuilderModal({ isOpen: true, templateToEdit: null, mode: 'create_template' })}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-all inline-flex items-center gap-1.5"
          >
            <span>+</span> Crear Primera Plantilla
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredTemplates.map((template) => {
            const cStyle = getConcejaliaStyle(template.concejalia);
            const isExpanded = expandedTemplates.has(template.id);
            const totalMins = template.tasks?.reduce((sum, t) => sum + (t.estimatedTimeMin || 0), 0) || 0;

            return (
              <div
                key={template.id}
                className={`bg-white dark:bg-slate-800 border-t border-r border-b border-slate-200 dark:border-slate-700/80 border-l-4 ${cStyle.borderL} rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col justify-between ${
                  template.isDefault ? 'ring-2 ring-amber-400/80 dark:ring-amber-500/80' : ''
                }`}
              >
                {/* Cabecera de la Tarjeta */}
                <div className="p-5 sm:p-6 space-y-4">
                  
                  {/* Badges superiores */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${cStyle.badgeClass}`}>
                        {template.concejalia}
                      </span>

                      {template.isDefault && (
                        <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider bg-amber-500 text-white shadow-xs flex items-center gap-1">
                          ⭐ Predeterminada
                        </span>
                      )}

                      <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                        template.isCustom 
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800' 
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                      }`}>
                        {template.isCustom ? '✨ Creada por ti' : '🔒 Fábrica'}
                      </span>
                    </div>

                    {/* Botón de Estrella para Marcar/Desmarcar como Predeterminada */}
                    <button
                      type="button"
                      onClick={() => handleToggleDefault(template)}
                      className={`p-1.5 rounded-xl border transition-all cursor-pointer flex items-center gap-1 text-xs font-bold ${
                        template.isDefault
                          ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                          : 'bg-slate-50 dark:bg-slate-700/50 text-slate-400 hover:text-amber-500 border-slate-200 dark:border-slate-600'
                      }`}
                      title={template.isDefault ? "Desmarcar como predeterminada" : "Marcar esta plantilla como predeterminada oficial"}
                    >
                      <span>⭐</span>
                      <span className="hidden sm:inline text-[10px]">{template.isDefault ? 'Predeterminada' : 'Elegir defecto'}</span>
                    </button>
                  </div>

                  {/* Título y Descripción */}
                  <div>
                    <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 leading-snug break-words">
                      {template.name}
                    </h3>
                    {template.descripcion && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                        {template.descripcion}
                      </p>
                    )}
                  </div>

                  {/* Resumen de Tareas y Minutos */}
                  <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-700/50">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      ⚡ {template.tasks?.length || 0} trámites
                    </span>
                    <span>•</span>
                    <span className="font-mono font-medium">
                      ⏱️ {totalMins} min
                    </span>
                  </div>

                  {/* Acordeón de Tareas de la Plantilla */}
                  <div>
                    <button
                      type="button"
                      onClick={() => toggleExpand(template.id)}
                      className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 flex items-center gap-1 cursor-pointer"
                    >
                      <span>{isExpanded ? '▼ Ocultar tareas predeterminadas' : '▶ Ver lista de trámites detallada'}</span>
                    </button>

                    {isExpanded && (
                      <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-100 dark:border-slate-700/80 space-y-2 animate-fade-in">
                        {template.tasks.map((task, tIdx) => (
                          <div key={tIdx} className="p-2 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl flex items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2 truncate">
                              <span className="w-5 h-5 rounded-full bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold flex items-center justify-center shrink-0">
                                {tIdx + 1}
                              </span>
                              <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">
                                {cleanTaskTitle(task.title)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {task.blockedBy && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold">
                                  ⚠️ {task.blockedBy}
                                </span>
                              )}
                              <span className="text-[10px] font-medium text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                                {task.estimatedTimeMin}m
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>

                {/* BOTONERA DE ACCIÓN INFERIOR */}
                <div className="p-4 bg-slate-50/70 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setQuickGenExpName('');
                      setQuickGenModal({ isOpen: true, template });
                    }}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>🚀</span> Generar Expediente
                  </button>

                  <div className="flex items-center gap-1.5">
                    {/* Botón Editar */}
                    <button
                      type="button"
                      onClick={() => setBuilderModal({ isOpen: true, templateToEdit: template, mode: 'edit_template' })}
                      className="p-2 hover:bg-indigo-50 dark:hover:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-xl transition-colors cursor-pointer"
                      title="Editar plantilla y sus tareas"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>

                    {/* Botón Duplicar */}
                    <button
                      type="button"
                      onClick={() => handleDuplicateTemplate(template)}
                      className="p-2 hover:bg-amber-50 dark:hover:bg-amber-950 text-amber-600 dark:text-amber-400 rounded-xl transition-colors cursor-pointer"
                      title="Duplicar plantilla como copia"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                      </svg>
                    </button>

                    {/* Botón Eliminar (habilitado para TODAS las plantillas) */}
                    <button
                      type="button"
                      onClick={() => handleDeleteTemplate(template)}
                      className="p-2 hover:bg-red-50 dark:hover:bg-red-950 text-red-500 dark:text-red-400 rounded-xl transition-colors cursor-pointer"
                      title={template.isCustom ? "Eliminar plantilla personalizada" : "Eliminar/Ocultar plantilla de fábrica"}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* MODAL DE GENERACIÓN RÁPIDA DE EXPEDIENTE */}
      {quickGenModal.isOpen && quickGenModal.template && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
            onClick={() => setQuickGenModal({ isOpen: false, template: null })}
          />

          <div className="relative bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-700 w-full max-w-lg p-6 space-y-5 animate-fade-in-up">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center font-bold">
                  🚀
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 text-lg">
                    Generar Nuevo Expediente
                  </h3>
                  <p className="text-xs text-slate-400">
                    A partir de la plantilla "{quickGenModal.template.name}"
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQuickGenModal({ isOpen: false, template: null })}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleQuickGenerateSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Nombre del Nuevo Expediente / Objeto *
                </label>
                <input 
                  type="text"
                  required
                  autoFocus
                  placeholder="Ej. Contrato Suministros Papelería 2026, Limpieza Solar Polígono..."
                  value={quickGenExpName}
                  onChange={(e) => setQuickGenExpName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm font-medium text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500"
                />
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex justify-between">
                  <span className="font-semibold">Concejalía:</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">{quickGenModal.template.concejalia}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold">Trámites a crear en lote:</span>
                  <span className="font-bold">{quickGenModal.template.tasks?.length || 0} tareas</span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setQuickGenModal({ isOpen: false, template: null })}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isGeneratingQuick || !quickGenExpName.trim()}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  {isGeneratingQuick ? 'Generando...' : 'Crear Expediente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE EDICIÓN / CREACIÓN COMPLETA DE PLANTILLA */}
      {builderModal.isOpen && (
        <ExpedienteBuilderModal
          user={user}
          mode={builderModal.mode}
          templateToEdit={builderModal.templateToEdit}
          onClose={() => setBuilderModal({ isOpen: false, templateToEdit: null, mode: 'create_template' })}
        />
      )}

    </div>
  );
}
