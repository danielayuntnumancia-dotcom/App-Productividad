import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebaseConfig';
import LoginView from './components/LoginView';
import MiDiaView from './components/MiDiaView';
import ProfileView from './components/ProfileView';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<'myday' | 'profile'>('myday');

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

  return (
    <div className="bg-slate-50 dark:bg-slate-900 font-sans h-full overflow-hidden flex flex-col md:flex-row min-h-screen transition-colors duration-300">
      
      {/* DESKTOP SIDE NAVIGATION (Hidden on mobile) */}
      <aside className="hidden md:flex flex-col w-64 h-full bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 shrink-0 z-40 relative transition-colors duration-300">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
          </div>
          <h1 className="font-bold text-slate-800 dark:text-slate-100 text-lg tracking-tight transition-colors duration-300">FocusFlow</h1>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          <button 
            onClick={() => setCurrentView('myday')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${currentView === 'myday' ? 'bg-indigo-50 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <span>Mi Día</span>
          </button>
          
          <button 
            onClick={() => setCurrentView('profile')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${currentView === 'profile' ? 'bg-indigo-50 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
            <span>Perfil</span>
          </button>
        </nav>
      </aside>

      {/* MAIN CONTENT CANVAS */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative w-full bg-slate-50 dark:bg-slate-900 mx-auto transition-colors duration-300">
        
        {/* MOBILE TOP APP BAR */}
        <header className="md:hidden flex justify-between items-center px-6 h-20 w-full bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 z-30 shrink-0 transition-colors duration-300">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
            </div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 transition-colors duration-300">
              {currentView === 'myday' ? 'Mi Día' : 'Perfil'}
            </h1>
          </div>
        </header>

        {currentView === 'myday' ? <MiDiaView user={user} /> : <ProfileView user={user} />}

        {/* MOBILE BOTTOM NAV BAR */}
        <nav className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center h-20 pb-safe px-6 bg-white/90 dark:bg-slate-800/90 border-t border-slate-200 dark:border-slate-700 backdrop-blur-xl transition-colors duration-300">
          <button 
            onClick={() => setCurrentView('myday')}
            className={`flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all duration-200 ${currentView === 'myday' ? 'text-indigo-700 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
          >
            <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <span className="text-[10px] font-medium">Mi Día</span>
          </button>
          
          <button 
            onClick={() => setCurrentView('profile')}
            className={`flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all duration-200 ${currentView === 'profile' ? 'text-indigo-700 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
          >
            <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
            <span className="text-[10px] font-medium">Perfil</span>
          </button>
        </nav>
      </main>

    </div>
  );
}
