import { doc, setDoc, deleteDoc, writeBatch, collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { Tarea } from '../types';

function getCurrentUid(): string {
  return auth.currentUser?.uid || '';
}

/**
 * Mueve una tarea individual a la papelera (Soft-delete).
 * taskId DEBE ser el ID físico real del documento en Firestore (d.id del snapshot).
 */
export async function moveToTrashTask(taskId: string): Promise<void> {
  if (!taskId) return;
  const currentUid = getCurrentUid();
  const taskRef = doc(db, 'tareas', taskId);

  const payload: any = {
    isDeleted: true,
    deletedAt: Date.now(),
    deletedType: 'tarea',
    isInMyDay: false
  };
  if (currentUid) payload.userId = currentUid;

  await setDoc(taskRef, payload, { merge: true });
}

/**
 * Mueve un expediente y todas sus tareas hijas a la papelera (Soft-delete en lote).
 *
 * @param projectId      - ID lógico del proyecto (campo `projectId` de las tareas, ej: "proj_xxx")
 * @param allTasks       - Lista de tareas ya cargadas en la vista (con sus id = Firestore doc ID reales)
 * @param firestoreDocId - ID FÍSICO real del documento cabecera en Firestore (d.id del snapshot).
 *                         Si no se provee, solo se marcan las tareas hijas como eliminadas.
 */
export async function moveToTrashExpediente(
  projectId: string,
  allTasks: Tarea[] = [],
  firestoreDocId?: string
): Promise<void> {
  if (!projectId) return;
  const currentUid = getCurrentUid();
  const batch = writeBatch(db);
  const now = Date.now();

  const softDeletePayload = (extraFields: object = {}) => {
    const p: any = {
      isDeleted: true,
      deletedAt: now,
      deletedType: 'expediente',
      isInMyDay: false,
      ...extraFields
    };
    if (currentUid) p.userId = currentUid;
    return p;
  };

  // 1. Marcar el documento cabecera del proyecto usando su ID FÍSICO real en Firestore.
  //    Si no se provee firestoreDocId, marcamos directamente el doc con el ID lógico.
  if (firestoreDocId) {
    batch.set(doc(db, 'tareas', firestoreDocId), softDeletePayload({ isProject: true }), { merge: true });
  } else {
    // Buscar el documento real que tenga este projectId
    const q = query(
      collection(db, 'tareas'),
      where('isProject', '==', true),
      where('projectId', '==', projectId)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      snap.forEach(d => {
        batch.set(d.ref, softDeletePayload({ isProject: true }), { merge: true });
      });
    } else {
      batch.set(doc(db, 'tareas', projectId), softDeletePayload({ isProject: true }), { merge: true });
    }
  }

  // 2. Marcar TODAS las tareas hijas usando su ID físico real (t.id = Firestore doc ID)
  const expTasks = allTasks.filter(t => t.projectId === projectId);
  expTasks.forEach((t) => {
    if (t.id) {
      batch.set(doc(db, 'tareas', t.id), softDeletePayload(), { merge: true });
    }
  });

  await batch.commit();
}

/**
 * Restaura una tarea individual de la papelera.
 */
export async function restoreTask(taskId: string): Promise<void> {
  if (!taskId) return;
  const currentUid = getCurrentUid();
  const taskRef = doc(db, 'tareas', taskId);
  const payload: any = { isDeleted: false, deletedAt: null, deletedType: null };
  if (currentUid) payload.userId = currentUid;
  await setDoc(taskRef, payload, { merge: true });
}

/**
 * Restaura un expediente y todas sus tareas hijas de la papelera.
 */
export async function restoreExpediente(
  projectId: string,
  allTasks: Tarea[] = [],
  firestoreDocId?: string
): Promise<void> {
  if (!projectId) return;
  const currentUid = getCurrentUid();
  const batch = writeBatch(db);

  const restorePayload = () => {
    const p: any = { isDeleted: false, deletedAt: null, deletedType: null };
    if (currentUid) p.userId = currentUid;
    return p;
  };

  if (firestoreDocId) {
    batch.set(doc(db, 'tareas', firestoreDocId), restorePayload(), { merge: true });
  } else {
    const q = query(collection(db, 'tareas'), where('isProject', '==', true), where('projectId', '==', projectId));
    const snap = await getDocs(q);
    if (!snap.empty) {
      snap.forEach(d => batch.set(d.ref, restorePayload(), { merge: true }));
    } else {
      batch.set(doc(db, 'tareas', projectId), restorePayload(), { merge: true });
    }
  }

  const expTasks = allTasks.filter(t => t.projectId === projectId);
  expTasks.forEach((t) => {
    if (t.id) batch.set(doc(db, 'tareas', t.id), restorePayload(), { merge: true });
  });

  await batch.commit();
}

/**
 * Elimina definitivamente una tarea de Firestore (Hard-delete).
 */
export async function permanentDeleteTask(taskId: string): Promise<void> {
  if (!taskId) return;
  await deleteDoc(doc(db, 'tareas', taskId));
}

/**
 * Elimina definitivamente un expediente y sus tareas (Hard-delete en lote).
 */
export async function permanentDeleteExpediente(
  projectId: string,
  allTasks: Tarea[] = [],
  firestoreDocId?: string
): Promise<void> {
  if (!projectId) return;
  const batch = writeBatch(db);

  if (firestoreDocId) {
    batch.delete(doc(db, 'tareas', firestoreDocId));
  } else {
    const q = query(collection(db, 'tareas'), where('isProject', '==', true), where('projectId', '==', projectId));
    const snap = await getDocs(q);
    if (!snap.empty) {
      snap.forEach(d => batch.delete(d.ref));
    } else {
      batch.delete(doc(db, 'tareas', projectId));
    }
  }

  const expTasks = allTasks.filter(t => t.projectId === projectId);
  expTasks.forEach((t) => {
    if (t.id) batch.delete(doc(db, 'tareas', t.id));
  });

  await batch.commit();
}

/**
 * Vacía completamente todos los elementos de la papelera (Hard-delete en lote).
 */
export async function emptyAllTrash(deletedTasks: Tarea[], deletedProjectIds: string[]): Promise<void> {
  const batch = writeBatch(db);

  const uniqueTaskIds = Array.from(new Set(deletedTasks.map(t => t.id).filter(Boolean))) as string[];
  const uniqueProjectIds = Array.from(new Set(deletedProjectIds.filter(Boolean)));

  uniqueTaskIds.forEach((id) => {
    batch.delete(doc(db, 'tareas', id));
  });

  uniqueProjectIds.forEach((pid) => {
    if (!uniqueTaskIds.includes(pid)) {
      batch.delete(doc(db, 'tareas', pid));
    }
  });

  await batch.commit();
}
