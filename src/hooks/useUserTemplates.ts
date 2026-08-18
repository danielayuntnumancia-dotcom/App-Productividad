import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { EXPEDIENT_TEMPLATES } from '../constants/templates';
import { ExpedienteTemplate } from '../types';

export function useUserTemplates(userId: string) {
  const [customTemplates, setCustomTemplates] = useState<ExpedienteTemplate[]>([]);
  const [hiddenStaticIds, setHiddenStaticIds] = useState<string[]>([]);
  const [defaultTemplateId, setDefaultTemplateId] = useState<string | null>(null);
  const [configDocId, setConfigDocId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 1. Escuchar plantillas personalizadas de Firestore
  useEffect(() => {
    if (!userId) return;

    const q = query(
      collection(db, 'tareas'),
      where('userId', '==', userId),
      where('isTemplate', '==', true)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const list: ExpedienteTemplate[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        list.push({
          id: d.id,
          name: data.name || data.nombre || 'Plantilla Sin Nombre',
          concejalia: data.concejalia || data.masterCategory || 'General',
          descripcion: data.descripcion || data.description || '',
          tasks: Array.isArray(data.tasks) ? data.tasks : [],
          isCustom: true,
          isDefault: !!data.isDefault
        });
      });
      setCustomTemplates(list);
    });

    return () => unsub();
  }, [userId]);

  // 2. Escuchar configuración de plantillas (IDs de fábrica ocultadas y predeterminada global)
  useEffect(() => {
    if (!userId) return;

    const q = query(
      collection(db, 'tareas'),
      where('userId', '==', userId),
      where('type', '==', 'user_templates_config')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const docSnap = snapshot.docs[0];
        setConfigDocId(docSnap.id);
        const data = docSnap.data();
        setHiddenStaticIds(data.hiddenStaticTemplateIds || []);
        setDefaultTemplateId(data.defaultTemplateId || null);
      } else {
        setHiddenStaticIds([]);
        setDefaultTemplateId(null);
      }
      setLoading(false);
    });

    return () => unsub();
  }, [userId]);

  // Plantillas estáticas de fábrica no ocultadas
  const visibleStaticTemplates: ExpedienteTemplate[] = EXPEDIENT_TEMPLATES
    .filter(t => !hiddenStaticIds.includes(t.id))
    .map(t => ({
      ...t,
      isCustom: false,
      isDefault: defaultTemplateId === t.id
    }));

  // Lista unificada ordenada: primero las predeterminadas
  const allTemplates: ExpedienteTemplate[] = [
    ...customTemplates.map(t => ({
      ...t,
      isDefault: t.isDefault || defaultTemplateId === t.id
    })),
    ...visibleStaticTemplates
  ].sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });

  // Marcar una plantilla como predeterminada (o desmarcarla)
  const setDefaultTemplate = async (templateId: string, currentIsDefault: boolean = false) => {
    try {
      const targetDefaultId = currentIsDefault ? null : templateId;
      const batch = writeBatch(db);

      // Actualizar flag en plantillas personalizadas de Firestore
      customTemplates.forEach((t) => {
        const tRef = doc(db, 'tareas', t.id);
        batch.update(tRef, { isDefault: t.id === targetDefaultId });
      });

      // Guardar en config de usuario
      const ref = configDocId 
        ? doc(db, 'tareas', configDocId) 
        : doc(collection(db, 'tareas'));

      batch.set(ref, {
        userId,
        type: 'user_templates_config',
        hiddenStaticTemplateIds: hiddenStaticIds,
        defaultTemplateId: targetDefaultId,
        updatedAt: Date.now()
      }, { merge: true });

      await batch.commit();
      setDefaultTemplateId(targetDefaultId);
    } catch (err) {
      console.error("Error setting default template: ", err);
      throw err;
    }
  };

  // Eliminar cualquier plantilla (Personalizada o del Sistema)
  const deleteTemplate = async (template: ExpedienteTemplate) => {
    try {
      if (template.isCustom) {
        await deleteDoc(doc(db, 'tareas', template.id));
      } else {
        // Si es del sistema, agregar a hiddenStaticTemplateIds
        const updatedHidden = Array.from(new Set([...hiddenStaticIds, template.id]));
        const ref = configDocId 
          ? doc(db, 'tareas', configDocId) 
          : doc(collection(db, 'tareas'));

        await setDoc(ref, {
          userId,
          type: 'user_templates_config',
          hiddenStaticTemplateIds: updatedHidden,
          defaultTemplateId: defaultTemplateId === template.id ? null : defaultTemplateId,
          updatedAt: Date.now()
        }, { merge: true });

        setHiddenStaticIds(updatedHidden);
      }
    } catch (err) {
      console.error("Error deleting template: ", err);
      throw err;
    }
  };

  // Restaurar plantillas originales de fábrica
  const restoreStaticTemplates = async () => {
    try {
      const ref = configDocId 
        ? doc(db, 'tareas', configDocId) 
        : doc(collection(db, 'tareas'));

      await setDoc(ref, {
        userId,
        type: 'user_templates_config',
        hiddenStaticTemplateIds: [],
        updatedAt: Date.now()
      }, { merge: true });

      setHiddenStaticIds([]);
    } catch (err) {
      console.error("Error restoring static templates: ", err);
      throw err;
    }
  };

  return {
    allTemplates,
    customTemplates,
    hiddenStaticIds,
    defaultTemplateId,
    loading,
    setDefaultTemplate,
    deleteTemplate,
    restoreStaticTemplates
  };
}
