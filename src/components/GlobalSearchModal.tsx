import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { User } from 'firebase/auth';
import { Tarea, Project } from '../types';

interface GlobalSearchModalProps {
  user: User;
  onSelectTask: (task: Tarea) => void;
  onSelectProject: (project: Project) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export default function GlobalSearchModal({ user, onSelectTask, onSelectProject, isOpen, setIsOpen }: GlobalSearchModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keyboard listener for Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, setIsOpen]);

  // Fetch data when modal is open
  useEffect(() => {
    if (!isOpen || !user.uid) return;

    const q = query(collection(db, 'tareas'), where('userId', '==', user.uid));
    const unsub = onSnapshot(q, (snapshot) => {
      const tList: Tarea[] = [];
      const pList: Project[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.isDeleted || data.isTemplate || data.isConcejalia) return;
        
        if (data.isProject) {
          pList.push({ id: doc.id, ...data } as Project);
        } else {
          tList.push({ id: doc.id, ...data } as Tarea);
        }
      });
      setTareas(tList);
      setProjects(pList);
    });

    return () => unsub();
  }, [isOpen, user.uid]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setSearchTerm('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const lowerSearch = searchTerm.toLowerCase();
  
  const filteredProjects = lowerSearch.length > 1 ? projects.filter(p => 
    p.title?.toLowerCase().includes(lowerSearch) || 
    p.projectId?.toLowerCase().includes(lowerSearch)
  ).slice(0, 5) : [];

  const filteredTasks = lowerSearch.length > 1 ? tareas.filter(t => 
    t.title?.toLowerCase().includes(lowerSearch) && !t.completada
  ).slice(0, 5) : [];

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh]">
      <div className="absolute inset-0 bg-brand-darker/60 backdrop-blur-sm transition-opacity" onClick={() => setIsOpen(false)}></div>
      
      <div className="relative w-full max-w-2xl bg-white dark:bg-brand-surface rounded-2xl shadow-2xl border border-slate-200 dark:border-brand-surface-light overflow-hidden animate-fade-in-up">
        {/* Header / Input */}
        <div className="flex items-center px-4 py-4 border-b border-slate-100 dark:border-brand-surface-light">
          <svg className="w-6 h-6 text-brand-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="flex-1 px-4 py-2 bg-transparent text-xl text-slate-800 dark:text-slate-100 outline-none placeholder-slate-400 dark:placeholder-slate-500 font-medium"
            placeholder="Buscar en FocusFlow..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <div className="flex items-center gap-1 shrink-0">
             <kbd className="px-2 py-1 bg-slate-100 dark:bg-brand-dark rounded text-xs font-semibold text-slate-500 border border-slate-200 dark:border-brand-surface-light">ESC</kbd>
          </div>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-6">
          {searchTerm.length <= 1 && (
             <div className="text-center py-10 text-slate-400 dark:text-slate-500">
               Escribe al menos 2 caracteres para buscar expedientes, tareas o contratos...
             </div>
          )}

          {searchTerm.length > 1 && filteredProjects.length === 0 && filteredTasks.length === 0 && (
             <div className="text-center py-10 text-slate-400 dark:text-slate-500">
               No hay resultados para "{searchTerm}"
             </div>
          )}

          {filteredProjects.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-brand-secondary tracking-wider uppercase mb-3 px-2">Expedientes Recientes</h3>
              <div className="space-y-2">
                {filteredProjects.map(proj => (
                  <button 
                    key={proj.id}
                    onClick={() => { onSelectProject(proj); setIsOpen(false); }}
                    className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-brand-dark border border-transparent hover:border-slate-200 dark:hover:border-brand-surface-light transition-all text-left group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-brand-primary/20 flex items-center justify-center shrink-0">
                         <svg className="w-5 h-5 text-brand-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
                      </div>
                      <div>
                        <div className="font-semibold text-slate-800 dark:text-slate-100">{proj.title}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{proj.projectId || 'Sin código'} • {proj.area || 'Sin departamento'}</div>
                      </div>
                    </div>
                    <svg className="w-5 h-5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                  </button>
                ))}
              </div>
            </div>
          )}

          {filteredTasks.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-brand-tertiary tracking-wider uppercase mb-3 px-2">Tareas Pendientes</h3>
              <div className="space-y-2">
                {filteredTasks.map(task => (
                  <button 
                    key={task.id}
                    onClick={() => { onSelectTask(task); setIsOpen(false); }}
                    className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-brand-dark border border-transparent hover:border-slate-200 dark:hover:border-brand-surface-light transition-all text-left group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-brand-tertiary/20 flex items-center justify-center shrink-0">
                         <svg className="w-5 h-5 text-brand-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                      </div>
                      <div>
                        <div className="font-semibold text-slate-800 dark:text-slate-100">{task.title}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Expediente asociado • Vence pronto</div>
                      </div>
                    </div>
                    <svg className="w-5 h-5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-slate-50 dark:bg-brand-darker border-t border-slate-100 dark:border-brand-surface-light flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1"><kbd className="bg-slate-200 dark:bg-brand-surface px-1.5 rounded">↑</kbd> <kbd className="bg-slate-200 dark:bg-brand-surface px-1.5 rounded">↓</kbd> Navegar</span>
            <span className="flex items-center gap-1"><kbd className="bg-slate-200 dark:bg-brand-surface px-1.5 rounded">↵</kbd> Seleccionar</span>
          </div>
        </div>

      </div>
    </div>
  );
}
