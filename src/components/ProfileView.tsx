import React, { useState, useEffect } from 'react';
import { logOut } from '../firebaseConfig';
import { User } from 'firebase/auth';

interface Props {
  user: User;
}

export default function ProfileView({ user }: Props) {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

  const toggleDarkMode = () => {
    if (isDark) {
      document.documentElement.classList.remove('dark');
      setIsDark(false);
    } else {
      document.documentElement.classList.add('dark');
      setIsDark(true);
    }
  };

  return (
    <main className="max-w-md mx-auto w-full md:max-w-3xl md:mt-12 pb-24 md:pb-12 bg-white dark:bg-slate-800 md:rounded-3xl border border-transparent md:border-slate-100 dark:md:border-slate-700 md:shadow-lg p-6 md:p-8 flex-1 overflow-y-auto transition-colors duration-300">
      {/* Profile Header */}
      <section className="flex flex-col items-center pt-8 pb-6 animate-fade-in-up">
        <div className="w-20 h-20 rounded-full overflow-hidden mb-4 bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-400 dark:text-slate-500 transition-colors duration-300">
          {user.photoURL ? (
            <img alt="Profile Avatar" className="w-full h-full object-cover" src={user.photoURL} />
          ) : (
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
          )}
        </div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-1 transition-colors duration-300">
          {user.displayName || 'Usuario'}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 transition-colors duration-300">{user.email}</p>
      </section>

      {/* Sync Status */}
      <section className="mb-8 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-2xl p-4 flex items-center justify-between shadow-sm border border-slate-100 dark:border-slate-700 transition-colors duration-300">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 transition-colors duration-300">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 transition-colors duration-300">Estado de Sincronización</h2>
              <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 transition-colors duration-300">Sincronizado. Trabajando Online</p>
            </div>
          </div>
          <div className="w-2 h-2 rounded-full bg-indigo-500 dark:bg-indigo-400 animate-pulse transition-colors duration-300"></div>
        </div>
      </section>

      {/* Settings List */}
      <section className="space-y-4 mb-8 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
        <button className="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors border border-transparent">
          <div className="flex items-center gap-4 text-slate-800 dark:text-slate-100 font-semibold transition-colors duration-300">
            <svg className="w-5 h-5 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
            <span>Notificaciones</span>
          </div>
          <svg className="w-5 h-5 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
        </button>
        <button onClick={toggleDarkMode} className="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors border border-transparent">
          <div className="flex items-center gap-4 text-slate-800 dark:text-slate-100 font-semibold transition-colors duration-300">
            <svg className="w-5 h-5 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
            <span>{isDark ? 'Modo Claro' : 'Modo Oscuro'}</span>
          </div>
          <div className="w-10 h-6 bg-slate-200 dark:bg-indigo-600 rounded-full relative transition-colors duration-300">
            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-300 ${isDark ? 'left-5' : 'left-1'}`}></div>
          </div>
        </button>
        <button className="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors border border-transparent">
          <div className="flex items-center gap-4 text-slate-800 dark:text-slate-100 font-semibold transition-colors duration-300">
            <svg className="w-5 h-5 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <span>Acerca de</span>
          </div>
          <svg className="w-5 h-5 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
        </button>
      </section>

      {/* Logout */}
      <section className="flex justify-center pb-8 animate-fade-in-up" style={{ animationDelay: '300ms' }}>
        <button 
          onClick={logOut}
          className="font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 px-6 py-3 rounded-xl transition-colors"
        >
          Cerrar Sesión
        </button>
      </section>
    </main>
  );
}
