import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Tarea } from '../types';
import { User } from 'firebase/auth';
import { getConcejaliaStyle, getConcejaliaBg } from '../utils/concejaliaColors';
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  addDays,
  subDays,
  startOfYear,
  addYears,
  subYears,
  getDaysInMonth,
  addWeeks,
  subWeeks,
} from 'date-fns';
import { es } from 'date-fns/locale';
import TaskCreateModal from './TaskCreateModal';

interface Props {
  user: User;
  searchQuery?: string;
  onSelectTask: (tarea: Tarea | null) => void;
}

type CalendarViewType = 'dia' | 'semana' | 'mes' | 'año';

export default function CalendarioView({ user, searchQuery = '', onSelectTask }: Props) {
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarViewType>('mes');
  const [isCreatingTask, setIsCreatingTask] = useState(false);

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
      setTareas(tareasData);
    });

    return () => unsubscribe();
  }, [user]);

  const filteredTareas = tareas.filter(t => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const taskNote = t.notas || t.notes || '';
    return (
      t.titulo.toLowerCase().includes(q) ||
      taskNote.toLowerCase().includes(q)
    );
  });

  const getTasksForDate = (date: Date) => {
    return filteredTareas.filter(t => {
      const taskTimestamp = t.dueDate || t.fecha_vencimiento || t.fecha_asignada;
      if (!taskTimestamp) return false;
      const taskDate = new Date(taskTimestamp);
      return isSameDay(taskDate, date);
    });
  };

  const next = () => {
    if (view === 'mes') setCurrentDate(addMonths(currentDate, 1));
    else if (view === 'semana') setCurrentDate(addWeeks(currentDate, 1));
    else if (view === 'dia') setCurrentDate(addDays(currentDate, 1));
    else if (view === 'año') setCurrentDate(addYears(currentDate, 1));
  };

  const prev = () => {
    if (view === 'mes') setCurrentDate(subMonths(currentDate, 1));
    else if (view === 'semana') setCurrentDate(subWeeks(currentDate, 1));
    else if (view === 'dia') setCurrentDate(subDays(currentDate, 1));
    else if (view === 'año') setCurrentDate(subYears(currentDate, 1));
  };

  const today = () => setCurrentDate(new Date());

  const renderHeader = () => {
    let dateFormat = 'MMMM yyyy';
    if (view === 'año') dateFormat = 'yyyy';
    else if (view === 'dia') dateFormat = "EEEE, d 'de' MMMM yyyy";
    
    return (
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 capitalize">
            {format(currentDate, dateFormat, { locale: es })}
          </h2>
          <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
            <button onClick={prev} className="p-1 hover:bg-white dark:hover:bg-slate-600 rounded-md transition-colors text-slate-600 dark:text-slate-300">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
            </button>
            <button onClick={today} className="px-3 text-sm font-semibold hover:bg-white dark:hover:bg-slate-600 rounded-md transition-colors text-slate-600 dark:text-slate-300">Hoy</button>
            <button onClick={next} className="p-1 hover:bg-white dark:hover:bg-slate-600 rounded-md transition-colors text-slate-600 dark:text-slate-300">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
            </button>
          </div>
        </div>
        
        <div className="flex bg-slate-200/50 dark:bg-slate-700/50 p-1 rounded-xl">
          {(['dia', 'semana', 'mes', 'año'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition-all capitalize ${
                view === v 
                  ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-sm' 
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderCells = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const rows = [];
    let days = [];
    let day = startDate;
    let formattedDate = '';

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        formattedDate = format(day, 'd');
        const cloneDay = day;
        const dayTasks = getTasksForDate(cloneDay);
        
        days.push(
          <div
            key={day.toString()}
            className={`min-h-[100px] sm:min-h-[120px] p-2 border-r border-b border-slate-200 dark:border-slate-700 transition-colors ${
              !isSameMonth(day, monthStart)
                ? 'bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500'
                : isSameDay(day, new Date()) 
                  ? 'bg-indigo-50/30 dark:bg-indigo-900/10 text-slate-800 dark:text-slate-100' 
                  : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700/50'
            }`}
            onClick={() => {
              // Optional: open task creation for this date
            }}
          >
            <div className="flex justify-between items-start">
              <span className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full ${
                isSameDay(day, new Date()) ? 'bg-indigo-600 text-white' : ''
              }`}>
                {formattedDate}
              </span>
              {dayTasks.length > 0 && (
                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded-md">
                  {dayTasks.length}
                </span>
              )}
            </div>
            
            <div className="mt-2 flex flex-col gap-1 overflow-y-auto max-h-[70px] no-scrollbar">
              {dayTasks.slice(0, 3).map(t => (
                <div 
                  key={t.id} 
                  onClick={(e) => { e.stopPropagation(); onSelectTask(t); }}
                  className={`text-[10px] sm:text-xs truncate px-1.5 py-1 rounded cursor-pointer ${
                    t.completada 
                      ? 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 line-through' 
                      : t.prioridad === 'alta' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' 
                      : t.prioridad === 'media' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                      : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  {t.titulo}
                </div>
              ))}
              {dayTasks.length > 3 && (
                <div className="text-[10px] text-slate-400 text-center font-medium">
                  +{dayTasks.length - 3} más
                </div>
              )}
            </div>
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div className="grid grid-cols-7" key={day.toString()}>
          {days}
        </div>
      );
      days = [];
    }
    return (
      <div className="border-t border-l border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
        <div className="grid grid-cols-7 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
          {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(d => (
            <div key={d} className="py-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-r border-slate-200 dark:border-slate-700 last:border-r-0">
              <span className="hidden sm:inline">{d}</span>
              <span className="sm:hidden">{d.slice(0, 3)}</span>
            </div>
          ))}
        </div>
        {rows}
      </div>
    );
  };

  const renderWeek = () => {
    const startDate = startOfWeek(currentDate, { weekStartsOn: 1 });
    
    return (
      <div className="flex flex-col h-[600px] overflow-hidden border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm bg-white dark:bg-slate-800">
        <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-700 shrink-0">
          {[0, 1, 2, 3, 4, 5, 6].map(i => {
            const day = addDays(startDate, i);
            return (
              <div key={i} className="py-3 px-2 text-center border-r border-slate-200 dark:border-slate-700 last:border-r-0 flex flex-col items-center gap-1">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {format(day, 'E', { locale: es })}
                </span>
                <span className={`text-lg font-bold w-8 h-8 flex items-center justify-center rounded-full ${isSameDay(day, new Date()) ? 'bg-indigo-600 text-white' : 'text-slate-800 dark:text-slate-100'}`}>
                  {format(day, 'd')}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex-1 overflow-y-auto grid grid-cols-7 relative">
          {[0, 1, 2, 3, 4, 5, 6].map(i => {
            const day = addDays(startDate, i);
            const dayTasks = getTasksForDate(day);
            return (
              <div key={i} className="border-r border-slate-200 dark:border-slate-700 last:border-r-0 relative min-h-[500px] p-2 flex flex-col gap-2">
                {dayTasks.map(t => (
                  <div 
                    key={t.id} 
                    data-task-card="true"
                    onClick={() => onSelectTask(t)}
                    className={`p-2 rounded-lg text-xs cursor-pointer shadow-sm border ${
                      t.completada 
                        ? 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 line-through opacity-70' 
                        : t.prioridad === 'alta' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/30 text-red-700 dark:text-red-400' 
                        : t.prioridad === 'media' ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/30 text-amber-700 dark:text-amber-400'
                        : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/30 text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    <div className="font-semibold mb-1 truncate">{t.titulo}</div>
                    <div className="text-[10px] opacity-80">{t.tiempo_estimado}</div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const getPriorityStyle = (prioridad?: string) => {
    switch(prioridad) {
      case 'alta': return 'bg-red-50/80 border-red-100 dark:bg-red-900/10 dark:border-red-900/30';
      case 'media': return 'bg-amber-50/80 border-amber-100 dark:bg-amber-900/10 dark:border-amber-900/30';
      case 'baja': return 'bg-emerald-50/80 border-emerald-100 dark:bg-emerald-900/10 dark:border-emerald-900/30';
      default: return 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700';
    }
  };



  const renderDay = () => {
    const dayTasks = getTasksForDate(currentDate);
    
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 sm:p-6 min-h-[500px]">
        {dayTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[400px] text-slate-400 dark:text-slate-500">
            <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
            <p className="text-lg font-medium">No hay tareas programadas para este día.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {dayTasks.map(t => (
              <div 
                key={t.id} 
                onClick={() => onSelectTask(t)}
                className={`rounded-2xl border shadow-sm flex items-stretch group hover:shadow-md transition-shadow cursor-pointer overflow-hidden ${
                  t.completada 
                    ? 'opacity-60 grayscale-[0.5] bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-500' 
                    : getPriorityStyle(t.prioridad)
                }`}
              >
                <div className={`w-14 sm:w-16 flex items-start justify-center pt-5 shrink-0 transition-colors ${getConcejaliaBg(t.concejalia)}`}>
                  <div className={`w-3 h-3 rounded-full shrink-0 mt-0.5 ${
                    t.completada ? 'bg-slate-300 dark:bg-slate-600' :
                    t.concejalia ? 'bg-white' :
                    t.prioridad === 'alta' ? 'bg-red-500' :
                    t.prioridad === 'media' ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}></div>
                </div>
                <div className="flex-1 min-w-0 p-4 sm:p-5">
                  <h4 className={`font-semibold text-base truncate ${t.completada ? 'line-through' : 'text-slate-800 dark:text-slate-100'}`}>{t.titulo}</h4>
                  {(t.notas || t.notes) && <p className="text-sm text-slate-500 mt-1 line-clamp-2 leading-relaxed">{t.notas || t.notes}</p>}
                  <div className="flex flex-wrap gap-3 mt-3">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-white/50 dark:bg-slate-800/50 px-2 py-1 rounded-md flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                      {t.tiempo_estimado}
                    </span>
                    {t.concejalia && (
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-white/50 dark:bg-slate-800/50 px-2 py-1 rounded-md">
                        {t.concejalia}
                      </span>
                    )}
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-white/50 dark:bg-slate-800/50 px-2 py-1 rounded-md capitalize flex items-center gap-1">
                      Prioridad {t.prioridad}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderYear = () => {
    const yearStart = startOfYear(currentDate);
    const months = Array.from({ length: 12 }).map((_, i) => addMonths(yearStart, i));
    
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {months.map(month => {
          const mStart = startOfMonth(month);
          const mEnd = endOfMonth(month);
          
          // Get all tasks for this month
          const monthTasks = filteredTareas.filter(t => {
            const taskDate = new Date(t.fecha_vencimiento || t.fecha_asignada || 0);
            return taskDate >= mStart && taskDate <= mEnd;
          });
          
          return (
            <div 
              key={month.toString()} 
              onClick={() => {
                setCurrentDate(month);
                setView('mes');
              }}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer group"
            >
              <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 capitalize mb-4 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                {format(month, 'MMMM', { locale: es })}
              </h3>
              
              <div className="flex items-end justify-between">
                <div className="flex flex-col">
                  <span className="text-3xl font-black text-slate-800 dark:text-slate-100">{monthTasks.length}</span>
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tareas</span>
                </div>
                
                {monthTasks.length > 0 && (
                  <div className="flex -space-x-1">
                    {monthTasks.slice(0, 3).map((t, i) => (
                      <div 
                        key={i} 
                        className={`w-6 h-6 rounded-full border-2 border-white dark:border-slate-800 flex items-center justify-center ${
                          t.prioridad === 'alta' ? 'bg-red-500' :
                          t.prioridad === 'media' ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                      ></div>
                    ))}
                    {monthTasks.length > 3 && (
                      <div className="w-6 h-6 rounded-full border-2 border-white dark:border-slate-800 bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[8px] font-bold text-slate-600 dark:text-slate-300">
                        +{monthTasks.length - 3}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto">
      <div className="max-w-6xl mx-auto w-full flex flex-col gap-6">
        
        {renderHeader()}
        
        <div className="animate-fade-in-up">
          {view === 'mes' && renderCells()}
          {view === 'semana' && renderWeek()}
          {view === 'dia' && renderDay()}
          {view === 'año' && renderYear()}
        </div>

      </div>
      
      {/* Floating Add Button for Mobile */}
      <button 
        onClick={() => setIsCreatingTask(true)}
        className="md:hidden fixed bottom-24 right-6 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-xl shadow-indigo-600/30 flex items-center justify-center hover:bg-indigo-700 transition-colors z-40"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
      </button>
      
      {isCreatingTask && (
        <TaskCreateModal 
          user={user} 
          onClose={() => setIsCreatingTask(false)} 
        />
      )}
    </div>
  );
}
