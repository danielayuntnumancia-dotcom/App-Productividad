import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, writeBatch, deleteDoc, serverTimestamp } from 'firebase/firestore';
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
  onClose: () => void;
}

export default function TemplateSelectorModal({ user, onClose }: Props) {
  const concejaliasList = useConcejalias(user.uid);
  const { allTemplates, deleteTemplate } = useUserTemplates(user.uid);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedConcejalia, setSelectedConcejalia] = useState<string>('');
  const [nombreProyecto, setNombreProyecto] = useState('');
  const [existingProjects, setExistingProjects] = useState<{ id: string; name: string; code: string }[]>([]);
  const [selectedLinkedProjectId, setSelectedLinkedProjectId] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [builderMode, setBuilderMode] = useState<'create_expediente' | 'edit_template' | 'create_template'>('create_expediente');
  const [editingTemplate, setEditingTemplate] = useState<ExpedienteTemplate | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Seleccionar la primera plantilla (la predeterminada si existe) cuando cargue la lista
  useEffect(() => {
    if (allTemplates.length > 0 && (!selectedTemplateId || !allTemplates.some(t => t.id === selectedTemplateId))) {
      setSelectedTemplateId(allTemplates[0].id);
    }
  }, [allTemplates, selectedTemplateId]);

  // Escuchar expedientes existentes para vinculación cruzada
  useEffect(() => {
    const q = query(
      collection(db, 'tareas'),
      where('userId', '==', user.uid)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const projMap: Record<string, { id: string; name: string; code: string }> = {};
      snapshot.forEach((d) => {
        const data = d.data();
        if (data.isProject) {
          projMap[data.id || d.id] = {
            id: data.id || d.id,
            name: data.name || data.projectName,
            code: data.expedientCode || 'EXP-2026-N/A'
          };
        } else if (data.projectId && data.projectName && !data.isTemplate && !data.isConcejalia) {
          if (!projMap[data.projectId]) {
            projMap[data.projectId] = {
              id: data.projectId,
              name: data.projectName,
              code: data.expedientCode || 'EXP-2026-N/A'
            };
          }
        }
      });
      setExistingProjects(Object.values(projMap));
    });

    return () => unsub();
  }, [user.uid]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const selectedTemplate = allTemplates.find(t => t.id === selectedTemplateId) || allTemplates[0];

  useEffect(() => {
    if (selectedTemplate) {
      setSelectedConcejalia(selectedTemplate.concejalia || selectedTemplate.masterCategory || concejaliasList[0] || 'General');
    }
  }, [selectedTemplateId, concejaliasList, selectedTemplate]);

  const handleDeleteTemplate = async (template: ExpedienteTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmMessage = template.isCustom
      ? `¿Eliminar la plantilla "${template.name}" de forma permanente?`
      : `¿Eliminar la plantilla de fábrica "${template.name}" de tu catálogo?`;

    if (!window.confirm(confirmMessage)) return;

    try {
      await deleteTemplate(template);
      setSuccessMessage(`Plantilla "${template.name}" eliminada correctamente.`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      console.error("Error deleting template: ", err);
      setErrorMessage(err?.message || "Error al eliminar la plantilla.");
      setTimeout(() => setErrorMessage(null), 3000);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreProyecto.trim() || isGenerating) return;

    setIsGenerating(true);
    setErrorMessage(null);
    try {
      const batch = writeBatch(db);
      const projName = nombreProyecto.trim();
      const now = Date.now();
      const conc = selectedConcejalia || selectedTemplate.concejalia || selectedTemplate.masterCategory || 'General';
      const generatedProjectId = `proj_${now}_${Math.random().toString(36).substring(2, 7)}`;
      const expCode = generateExpedientCode();

      const isCM = selectedTemplate.id === 'contrato_menor' || projName.toLowerCase().includes('contrato menor');

      // ACCIÓN A: Guardar la cabecera de proyecto en la colección autorizada 'tareas' con isProject: true
      const projectRef = doc(collection(db, 'tareas'));
      batch.set(projectRef, {
        isProject: true,
        id: generatedProjectId,
        projectId: generatedProjectId,
        name: projName,
        projectName: projName,
        type: isCM ? 'contrato_menor' : 'template',
        templateId: selectedTemplate.id,
        isContratoMenor: isCM,
        concejalia: conc,
        projectConcejalia: conc,
        status: 'active',
        expedientCode: expCode,
        linkedExpedientId: selectedLinkedProjectId || '',
        isInMyDay: true,
        userId: user.uid,
        fecha_creacion: now
      });

      // ACCIÓN B: Insertar las tareas en la colección 'tareas'
      const tareasRef = collection(db, 'tareas');

      selectedTemplate.tasks.forEach((task, index) => {
        const clean = cleanTaskTitle(task.title);
        const indexedTitle = `${index + 1}. ${clean}`;
        const fullExpTitle = `${indexedTitle} - ${projName}`;

        const newTaskRef = doc(tareasRef);
        batch.set(newTaskRef, {
          projectId: generatedProjectId,
          projectName: projName,
          concejalia: conc,
          projectConcejalia: conc,
          projectMasterCategory: conc,
          expedientCode: expCode,
          linkedExpedientId: selectedLinkedProjectId || '',
          templateId: selectedTemplate.id,
          isContratoMenor: isCM,
          orderIndex: index + 1,
          title: indexedTitle,
          titulo: fullExpTitle,
          notes: task.notes || selectedTemplate.descripcion || selectedTemplate.description || '',
          notas: task.notes || selectedTemplate.descripcion || selectedTemplate.description || '',
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
          createdAt: serverTimestamp(),
          fecha_creacion: now
        });
      });

      // Ejecutar batch atómico
      await batch.commit();
      setNombreProyecto('');
      setSuccessMessage(`¡Expediente "${projName}" generado con éxito con ${selectedTemplate.tasks.length} tareas!`);
      
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (error: any) {
      console.error("Error generating expediente batch: ", error);
      setErrorMessage(error?.message || "Error al guardar el expediente en Firestore.");
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity animate-fade-in"
        onClick={onClose}
      ></div>

      {/* Modal Card */}
      <div className="relative bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-700 w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-up transition-colors duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Plantillas de Expedientes</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Genera lotes de tareas o administra y edita tus plantillas</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        {/* Success Toast Banner */}
        {successMessage && (
          <div className="bg-emerald-500 text-white px-6 py-3 text-sm font-semibold flex items-center gap-2 animate-fade-in">
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            <span>{successMessage}</span>
          </div>
        )}

        {/* Error Toast Banner */}
        {errorMessage && (
          <div className="bg-red-500 text-white px-6 py-3 text-sm font-semibold flex items-center gap-2 animate-fade-in">
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleGenerate} className="flex-1 flex flex-col overflow-hidden">
          
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* BOTONES DE ACCIÓN: CONSTRUCTOR Y NUEVA PLANTILLA */}
            <div className="p-4 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 dark:from-indigo-900/30 dark:to-purple-900/30 border border-indigo-200 dark:border-indigo-800 rounded-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-bold text-indigo-900 dark:text-indigo-200">Personaliza y Crea Plantillas</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Edita plantillas existentes con el icono ✏️ o crea nuevas</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setEditingTemplate(null);
                    setBuilderMode('create_template');
                    setShowBuilder(true);
                  }}
                  className="px-3 py-2 bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1"
                >
                  <span>➕ Nueva Plantilla</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingTemplate(null);
                    setBuilderMode('create_expediente');
                    setShowBuilder(true);
                  }}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-1"
                >
                  <span>⚡ Expediente a Medida</span>
                </button>
              </div>
            </div>

            {/* Master Category / Concejalía Template Selection */}
            <div className="space-y-5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Seleccionar Plantilla de Expediente ({allTemplates.length})
              </label>

              {Array.from(new Set(allTemplates.map(t => t.concejalia || t.masterCategory || 'General'))).map(category => {
                const categoryTemplates = allTemplates.filter(
                  t => (t.concejalia || t.masterCategory || 'General') === category
                );
                const cStyle = getConcejaliaStyle(String(category));

                return (
                  <div key={category} className="space-y-2">
                    <h3 className={`text-sm font-bold ${cStyle.text} flex items-center gap-2`}>
                      <span className={`w-2.5 h-2.5 rounded-full ${cStyle.dot}`}></span>
                      {category}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {categoryTemplates.map(t => {
                        const isSelected = t.id === selectedTemplateId;
                        const isCustom = !!t.isCustom;

                        return (
                          <div
                            key={t.id}
                            onClick={() => setSelectedTemplateId(t.id)}
                            className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 relative ${
                              isSelected
                                ? 'bg-indigo-50/80 dark:bg-indigo-900/40 border-indigo-500 dark:border-indigo-500 ring-2 ring-indigo-500/20 text-indigo-950 dark:text-indigo-100 shadow-sm'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-sm truncate">{t.name}</span>
                                  {t.isDefault && (
                                    <span className="text-[9px] font-black uppercase px-1.5 py-0.5 bg-amber-500 text-white rounded shrink-0">
                                      ⭐ Defecto
                                    </span>
                                  )}
                                  {isCustom && (
                                    <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 rounded border border-indigo-200 dark:border-indigo-800 shrink-0">
                                      Guardada
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium block mt-0.5">
                                  {t.tasks.length} tareas automatizadas
                                </span>
                              </div>

                              {/* Acciones de Edición / Eliminación sobre la tarjeta */}
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingTemplate(t);
                                    setBuilderMode('edit_template');
                                    setShowBuilder(true);
                                  }}
                                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 transition-all cursor-pointer"
                                  title="Editar plantilla guardada"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                  </svg>
                                </button>

                                {isCustom && (
                                  <button
                                    type="button"
                                    onClick={(e) => handleDeleteTemplate(t, e)}
                                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/40 transition-all cursor-pointer"
                                    title="Eliminar plantilla"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                )}

                                {isSelected && (
                                  <span className="w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-400 ml-1"></span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Project / Expediente Name Input */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Nombre del Expediente / Objeto del Proyecto *
              </label>
              <input 
                type="text"
                value={nombreProyecto}
                onChange={(e) => setNombreProyecto(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                placeholder="Ej. Actuación Cantajuegos"
                autoFocus
              />
            </div>

            {/* Concejalía Responsable Dropdown */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Concejalía Responsable *
              </label>
              <select
                value={selectedConcejalia}
                onChange={(e) => setSelectedConcejalia(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
              >
                {concejaliasList.map((cName) => (
                  <option key={cName} value={cName}>{cName}</option>
                ))}
              </select>
            </div>

            {/* Vinculación a Expediente Existente */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Vincular a Expediente Existente (Opcional)
              </label>
              <select
                value={selectedLinkedProjectId}
                onChange={(e) => setSelectedLinkedProjectId(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
              >
                <option value="">-- Sin expediente vinculado (Independiente) --</option>
                {existingProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    🔗 {p.code} - {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Template Task Preview */}
            <div className="p-4 bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                Tareas a generar automáticamente en lote ({selectedTemplate.tasks.length}):
              </span>
              <div className="space-y-2">
                {selectedTemplate.tasks.map((task, idx) => {
                  const clean = cleanTaskTitle(task.title);
                  return (
                    <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-xs">
                      <div className="flex items-center gap-2 truncate">
                        <span className="w-5 h-5 rounded-full bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {idx + 1}. {clean} {nombreProyecto.trim() ? `- ${nombreProyecto.trim()}` : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {task.blockedBy && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 font-semibold">
                            Retenido: {task.blockedBy}
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 font-medium">
                          {task.estimatedTimeMin} min
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Footer */}
          <div className="p-6 border-t border-slate-100 dark:border-slate-700 flex justify-end items-center bg-slate-50/50 dark:bg-slate-800/50 gap-3">
            <button 
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              disabled={isGenerating || !nombreProyecto.trim()}
              className="bg-indigo-600 dark:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-semibold shadow-md shadow-indigo-200 dark:shadow-none hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-all disabled:opacity-70 flex items-center gap-2 cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Generando lote...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>Generar Expediente</span>
                </>
              )}
            </button>
          </div>

        </form>
      </div>

      {showBuilder && (
        <ExpedienteBuilderModal 
          user={user}
          templateToEdit={editingTemplate}
          mode={builderMode}
          onClose={() => { 
            setShowBuilder(false); 
            setEditingTemplate(null);
            setBuilderMode('create_expediente');
          }}
          onTemplateSaved={(saved) => {
            if (saved?.id) {
              setSelectedTemplateId(saved.id);
            }
          }}
        />
      )}
    </div>
  );
}
