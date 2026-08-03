import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { Tarea } from '../types';
import { User } from 'firebase/auth';

interface Props {
  user: User;
}

export default function MiDiaView({ user }: Props) {
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  useEffect(() => {
    const q = query(
      collection(db, 'tareas'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tareasData: Tarea[] = [];
      snapshot.forEach((doc) => {
        tareasData.push({ id: doc.id, ...doc.data() } as Tarea);
      });
      // Sort: incomplete first, then by assigned date or created time. 
      // For now, let's just show incomplete ones and sort by date. 
      setTareas(tareasData.filter(t => !t.completada));
    });

    return () => unsubscribe();
  }, [user]);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    // Parse estimated time if included (e.g. "Llamar cliente 30m")
    let title = newTaskTitle.trim();
    let time = "30m"; // default
    const timeMatch = title.match(/(\d+[hm])$/i);
    if (timeMatch) {
      time = timeMatch[1];
      title = title.replace(/(\d+[hm])$/i, '').trim();
    }

    try {
      const newTarea: Omit<Tarea, 'id'> = {
        userId: user.uid,
        titulo: title,
        tiempo_estimado: time,
        completada: false,
        fecha_asignada: Date.now(),
        prioridad: 0,
      };
      await addDoc(collection(db, 'tareas'), newTarea);
      setNewTaskTitle('');
    } catch (error) {
      console.error("Error adding document: ", error);
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    try {
      const taskRef = doc(db, 'tareas', taskId);
      await updateDoc(taskRef, {
        completada: true
      });
    } catch (error) {
      console.error("Error updating document: ", error);
    }
  };

  // Convert "Xh" or "Ym" to minutes
  const getMinutes = (timeStr: string) => {
    const isHours = timeStr.includes('h');
    const val = parseInt(timeStr.replace(/\D/g, ''), 10);
    return isHours ? val * 60 : val;
  };

  const totalMinutes = tareas.reduce((acc, task) => acc + getMinutes(task.tiempo_estimado), 0);
  const maxMinutes = 8 * 60;
  const capacityPercent = Math.min((totalMinutes / maxMinutes) * 100, 100);

  const formatHours = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h > 0 ? h + 'h ' : ''}${m > 0 ? m + 'm' : ''}`.trim() || '0m';
  };

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto">
      <div className="max-w-4xl mx-auto w-full flex flex-col gap-8 md:gap-10">
        
        {/* HEADER & CAPACITY BAR */}
        <section className="flex flex-col gap-4 animate-fade-in-up">
          <div className="justify-between items-end hidden md:flex">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 transition-colors duration-300">Mi Día</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 transition-colors duration-300">
              {new Date().toLocaleDateString('es-ES', { weekday: 'long', month: 'short', day: 'numeric' })}
            </p>
          </div>
          
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider transition-colors duration-300">Capacidad Diaria</span>
              <span className="text-sm text-slate-800 dark:text-slate-100 font-bold transition-colors duration-300">
                {formatHours(totalMinutes)} <span className="text-slate-400 dark:text-slate-500 font-normal">/ 8h</span>
              </span>
            </div>
            <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden relative transition-colors duration-300">
              <div 
                className={`h-full rounded-full transition-all duration-1000 ease-out ${capacityPercent > 90 ? 'bg-red-500' : 'bg-indigo-500'}`} 
                style={{ width: `${capacityPercent}%` }}
              ></div>
            </div>
          </div>
        </section>

        {/* CAPTURA RAPIDA (Quick Add) */}
        <section className="relative group animate-fade-in-up" style={{ animationDelay: '100ms' }}>
          <form onSubmit={handleAddTask} className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-2 px-4 shadow-sm focus-within:border-indigo-500 dark:focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all duration-300">
            <svg className="w-5 h-5 text-slate-400 dark:text-slate-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
            <input 
              className="w-full bg-transparent border-none focus:ring-0 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 py-3 outline-none transition-colors duration-300" 
              placeholder="Añadir tarea (ej: Llamar cliente 30m)" 
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
            />
            <button type="submit" className="ml-2 bg-indigo-600 dark:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-semibold shadow-lg shadow-indigo-200 dark:shadow-none hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-all opacity-0 group-focus-within:opacity-100 whitespace-nowrap">
              Añadir
            </button>
          </form>
        </section>

        {/* PLANIFICADOR (Task List) */}
        <section className="flex flex-col gap-4 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
          {tareas.length === 0 ? (
            <p className="text-center text-slate-500 dark:text-slate-400 mt-8 transition-colors duration-300">No hay tareas para hoy. ¡Disfruta tu tiempo libre!</p>
          ) : (
            tareas.map(tarea => (
              <div key={tarea.id} className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-4 group hover:shadow-md transition-all duration-300">
                <button 
                  onClick={() => handleCompleteTask(tarea.id!)}
                  className="w-6 h-6 rounded-full border-2 border-slate-300 dark:border-slate-600 flex items-center justify-center hover:border-indigo-500 dark:hover:border-indigo-400 transition-colors cursor-pointer shrink-0"
                >
                  <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                </button>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 truncate transition-colors duration-300">{tarea.titulo}</h3>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs font-medium text-slate-400 dark:text-slate-500 flex items-center gap-1 transition-colors duration-300">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                      {tarea.tiempo_estimado}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </section>

      </div>
    </div>
  );
}
