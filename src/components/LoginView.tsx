import React, { useState } from 'react';
import { signInWithGoogle } from '../firebaseConfig';

export default function LoginView() {
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-900 min-h-screen flex items-center justify-center font-sans text-slate-800 dark:text-slate-100 overflow-hidden transition-colors duration-300">
      <main className="w-full max-w-md mx-4 bg-white dark:bg-slate-800 p-8 md:p-12 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-xl flex flex-col items-center justify-center relative z-10 animate-fade-in-up transition-colors duration-300">
        
        <div className="text-center mb-10 w-full flex flex-col items-center">
          <div className="w-16 h-16 bg-indigo-600 dark:bg-indigo-500 rounded-2xl flex items-center justify-center mb-6 text-white shadow-lg shadow-indigo-200 dark:shadow-none transition-colors duration-300">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
          </div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100 mb-2 tracking-tight transition-colors duration-300">
            FocusFlow
          </h1>
          <p className="text-slate-500 dark:text-slate-400 max-w-[280px] transition-colors duration-300">
            Productividad consciente, sin fricción.
          </p>
        </div>

        <div className="w-full flex flex-col items-center">
          <button
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="w-full h-14 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-xl shadow-sm border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600 transition-all flex items-center justify-center gap-3 font-semibold disabled:opacity-70 disabled:cursor-not-allowed duration-300"
          >
            <svg className="shrink-0 w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span>
              {isLoggingIn ? 'Iniciando sesión...' : 'Continuar con Google'}
            </span>
          </button>
        </div>
      </main>
    </div>
  );
}
