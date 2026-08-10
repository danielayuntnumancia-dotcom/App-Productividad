import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export const DEFAULT_CONCEJALIAS = [
  "Economía y Hacienda",
  "Medio Ambiente",
  "Policía Local y Movilidad",
  "Transporte",
  "Entidades Urbanísticas de Conservación"
];

export function useConcejalias(userId?: string) {
  const [concejalias, setConcejalias] = useState<string[]>(DEFAULT_CONCEJALIAS);

  useEffect(() => {
    if (!userId) {
      setConcejalias(DEFAULT_CONCEJALIAS);
      return;
    }

    const q = query(
      collection(db, 'tareas'),
      where('userId', '==', userId),
      where('isConcejalia', '==', true)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const customNames: string[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.name && !DEFAULT_CONCEJALIAS.includes(data.name) && !customNames.includes(data.name)) {
          customNames.push(data.name);
        }
      });
      setConcejalias([...DEFAULT_CONCEJALIAS, ...customNames]);
    });

    return () => unsubscribe();
  }, [userId]);

  return concejalias;
}
