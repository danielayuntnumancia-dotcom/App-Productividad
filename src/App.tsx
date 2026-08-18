import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { auth } from './firebaseConfig';
import LoginView from './components/LoginView';
import MiDiaView from './components/MiDiaView';
import RegistroView from './components/RegistroView';
import CalendarioView from './components/CalendarioView';
import ExpedientesView from './components/ExpedientesView';
import ContratosMenoresView from './components/ContratosMenoresView';
import PlantillasView from './components/PlantillasView';
import DashboardView from './components/DashboardView';
import TaskDetailPanel from './components/TaskDetailPanel';
import ExpedienteDetailPanel from './components/ExpedienteDetailPanel';
import { Tarea, Project } from './types';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<'myday' | 'registro' | 'calendario' | 'expedientes' | 'contratos_menores' | 'plantillas' | 'dashboard'>('myday');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTask, setSelectedTask] = useState<Tarea | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  const [isDark, setIsDark] = useState(() => {
    return document.documentElement.classList.contains('dark');
  });

  const toggleDarkMode = () => {
    if (isDark) {
      document.documentElement.classList.remove('dark');
      localStorage.theme = 'light';
      setIsDark(false);
    } else {
      document.documentElement.classList.add('dark');
      localStorage.theme = 'dark';
      setIsDark(true);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-off-white flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-focus-blue border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  const handleSelectTask = (t: Tarea | null) => {
    setSelectedTask(t);
    if (t) setSelectedProject(null);
  };

  const handleSelectProject = (p: Project | null) => {
    setSelectedProject(p);
    if (p) setSelectedTask(null);
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-900 font-sans h-full overflow-hidden flex flex-col md:flex-row min-h-screen transition-colors duration-300">
      
      {/* DESKTOP SIDE NAVIGATION (Hidden on mobile) */}
      <aside className="hidden md:flex flex-col w-64 xl:w-72 h-full bg-slate-50 dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 shrink-0 z-40 relative transition-colors duration-300">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
          </div>
          <h1 className="font-bold text-slate-800 dark:text-slate-100 text-lg tracking-tight transition-colors duration-300">FocusFlow</h1>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          <button 
            onClick={() => { setCurrentView('myday'); setSelectedTask(null); setSelectedProject(null); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${currentView === 'myday' ? 'bg-indigo-50 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50'}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <span>Mi Día</span>
          </button>
          
          <button 
            onClick={() => { setCurrentView('registro'); setSelectedTask(null); setSelectedProject(null); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${currentView === 'registro' ? 'bg-indigo-50 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50'}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
            <span>Bandeja</span>
          </button>
          
          <button 
            onClick={() => { setCurrentView('calendario'); setSelectedTask(null); setSelectedProject(null); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${currentView === 'calendario' ? 'bg-indigo-50 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50'}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
            <span>Calendario</span>
          </button>

          <button 
            onClick={() => { setCurrentView('expedientes'); setSelectedTask(null); setSelectedProject(null); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${currentView === 'expedientes' ? 'bg-indigo-50 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50'}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <span>Expedientes</span>
          </button>

          <button 
            onClick={() => { setCurrentView('contratos_menores'); setSelectedTask(null); setSelectedProject(null); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${currentView === 'contratos_menores' ? 'bg-indigo-50 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50'}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Contratos Menores</span>
          </button>

          <button 
            onClick={() => { setCurrentView('plantillas'); setSelectedTask(null); setSelectedProject(null); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${currentView === 'plantillas' ? 'bg-indigo-50 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50'}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span>Plantillas</span>
          </button>

          <button 
            onClick={() => { setCurrentView('dashboard'); setSelectedTask(null); setSelectedProject(null); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${currentView === 'dashboard' ? 'bg-indigo-50 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50'}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
            </svg>
            <span>Analítica</span>
          </button>
        </nav>
        
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 space-y-1 bg-slate-50 dark:bg-slate-800">
          <button 
            onClick={toggleDarkMode}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
          >
            {isDark ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
            )}
            <span>{isDark ? 'Modo Claro' : 'Modo Oscuro'}</span>
          </button>
          
          <button 
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs overflow-hidden">
               {user.photoURL ? <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" /> : <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>}
            </div>
            <span className="truncate flex-1 text-left">{user.displayName || user.email}</span>
            <svg className="w-4 h-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT CANVAS */}
      <main 
        className="flex-1 flex flex-col h-screen overflow-hidden relative w-full bg-white dark:bg-slate-900 mx-auto transition-colors duration-300"
        onClick={(e) => {
          if (selectedTask || selectedProject) {
            const target = e.target as HTMLElement;
            const isTaskCard = target.closest('[data-task-card="true"]');
            const isProjectCard = target.closest('[data-project-card="true"]');
            const isInteractive = target.closest('button, input, select, textarea, a');
            if (!isTaskCard && !isProjectCard && !isInteractive) {
              setSelectedTask(null);
              setSelectedProject(null);
            }
          }
        }}
      >
        
        {/* TOP HEADER WITH SEARCH */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center px-6 py-4 md:h-16 w-full bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 z-30 shrink-0 transition-colors duration-300 gap-4">
          <div className="flex items-center justify-between w-full md:w-auto">
            <div className="flex items-center gap-3">
              <div className="md:hidden w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
              </div>
              <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 transition-colors duration-300">
                {currentView === 'myday' ? 'Mi Día' : currentView === 'registro' ? 'Bandeja' : currentView === 'calendario' ? 'Calendario' : currentView === 'expedientes' ? 'Expedientes' : currentView === 'contratos_menores' ? 'Contratos Menores' : 'Analítica'}
              </h1>
            </div>
            {/* MOBILE ONLY BUTTONS IN HEADER */}
            <div className="md:hidden flex items-center gap-1 shrink-0">
              <button onClick={toggleDarkMode} className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                {isDark ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
                )}
              </button>
              <button onClick={handleSignOut} className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
              </button>
            </div>
          </div>
          
          <div className="w-full md:w-80 relative">
            <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            <input 
              type="text" 
              placeholder="Buscar..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
            />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto pb-24 md:pb-0">
          {currentView === 'myday' ? (
            <MiDiaView user={user} searchQuery={searchQuery} onSelectTask={handleSelectTask} onSelectProject={handleSelectProject} />
          ) : currentView === 'registro' ? (
            <RegistroView user={user} searchQuery={searchQuery} onSelectTask={handleSelectTask} />
          ) : currentView === 'calendario' ? (
            <CalendarioView user={user} searchQuery={searchQuery} onSelectTask={handleSelectTask} />
          ) : currentView === 'expedientes' ? (
            <ExpedientesView user={user} searchQuery={searchQuery} onSelectTask={handleSelectTask} onSelectProject={handleSelectProject} />
          ) : currentView === 'contratos_menores' ? (
            <ContratosMenoresView user={user} searchQuery={searchQuery} onSelectTask={handleSelectTask} onSelectProject={handleSelectProject} />
          ) : currentView === 'plantillas' ? (
            <PlantillasView user={user} searchQuery={searchQuery} />
          ) : (
            <DashboardView user={user} />
          )}
        </div>

        {/* MOBILE BOTTOM NAV BAR */}
        <nav className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center h-20 pb-safe px-2 bg-white/90 dark:bg-slate-800/90 border-t border-slate-200 dark:border-slate-700 backdrop-blur-xl transition-colors duration-300">
          <button 
            onClick={() => { setCurrentView('myday'); setSelectedTask(null); setSelectedProject(null); }}
            className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all duration-200 ${currentView === 'myday' ? 'text-indigo-700 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
          >
            <svg className="w-5 h-5 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <span className="text-[10px] font-medium">Mi Día</span>
          </button>
          
          <button 
            onClick={() => { setCurrentView('registro'); setSelectedTask(null); setSelectedProject(null); }}
            className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all duration-200 ${currentView === 'registro' ? 'text-indigo-700 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
          >
            <svg className="w-5 h-5 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
            <span className="text-[10px] font-medium">Bandeja</span>
          </button>
          
          <button 
            onClick={() => { setCurrentView('calendario'); setSelectedTask(null); setSelectedProject(null); }}
            className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all duration-200 ${currentView === 'calendario' ? 'text-indigo-700 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
          >
            <svg className="w-5 h-5 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
            <span className="text-[10px] font-medium">Calendario</span>
          </button>

          <button 
            onClick={() => { setCurrentView('expedientes'); setSelectedTask(null); setSelectedProject(null); }}
            className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all duration-200 ${currentView === 'expedientes' ? 'text-indigo-700 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
          >
            <svg className="w-5 h-5 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <span className="text-[10px] font-medium">Expedientes</span>
          </button>

          <button 
            onClick={() => { setCurrentView('plantillas'); setSelectedTask(null); setSelectedProject(null); }}
            className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all duration-200 ${currentView === 'plantillas' ? 'text-indigo-700 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
          >
            <svg className="w-5 h-5 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span className="text-[10px] font-medium">Plantillas</span>
          </button>

          <button 
            onClick={() => { setCurrentView('dashboard'); setSelectedTask(null); setSelectedProject(null); }}
            className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all duration-200 ${currentView === 'dashboard' ? 'text-indigo-700 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
          >
            <svg className="w-5 h-5 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
            </svg>
            <span className="text-[10px] font-medium">Analítica</span>
          </button>
        </nav>
      </main>

      {/* RIGHT PANEL (DESKTOP) */}
      {selectedTask && (
        <aside className="hidden lg:flex flex-col w-80 xl:w-96 bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 shrink-0 z-40 transition-all duration-300">
          <TaskDetailPanel tarea={selectedTask} onClose={() => setSelectedTask(null)} />
        </aside>
      )}

      {selectedProject && (
        <aside className="hidden lg:flex flex-col w-80 xl:w-96 bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 shrink-0 z-40 transition-all duration-300">
          <ExpedienteDetailPanel project={selectedProject} onClose={() => setSelectedProject(null)} />
        </aside>
      )}

      {/* MOBILE SLIDE OVER FOR TASK / EXPEDIENTE DETAIL */}
      {selectedTask && (
        <div className="lg:hidden fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm transition-opacity" onClick={() => setSelectedTask(null)}></div>
          <div className="relative w-full max-w-sm h-full bg-white dark:bg-slate-800 shadow-2xl animate-fade-in-left">
             <TaskDetailPanel tarea={selectedTask} onClose={() => setSelectedTask(null)} />
          </div>
        </div>
      )}

      {selectedProject && (
        <div className="lg:hidden fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm transition-opacity" onClick={() => setSelectedProject(null)}></div>
          <div className="relative w-full max-w-sm h-full bg-white dark:bg-slate-800 shadow-2xl animate-fade-in-left">
             <ExpedienteDetailPanel project={selectedProject} onClose={() => setSelectedProject(null)} />
          </div>
        </div>
      )}

    </div>
  );
}
