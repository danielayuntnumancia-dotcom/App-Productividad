import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { User } from 'firebase/auth';
import { Tarea, Project } from '../types';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  PieChart,
  Pie,
  Legend
} from 'recharts';

interface Props {
  user: User;
}

// Mapeo de colores Hex para Recharts correspondiente a concejaliaColors.ts
const CONCEJALIA_HEX_MAP: Record<string, string> = {
  'Economía y Hacienda': '#3b82f6', // Azul Indigo/Blue
  'Medio Ambiente': '#10b981', // Verde Esmeralda
  'Policía Local y Movilidad': '#f59e0b', // Naranja/Ámbar
  'Entidades Urbanísticas de Conservación': '#a855f7' // Púrpura
};

const DYNAMIC_HEX_PALETTE = ['#6366f1', '#f43f5e', '#14b8a6', '#06b6d4', '#d946ef'];

const getConcejaliaHexColor = (name: string): string => {
  if (CONCEJALIA_HEX_MAP[name]) return CONCEJALIA_HEX_MAP[name];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % DYNAMIC_HEX_PALETTE.length;
  return DYNAMIC_HEX_PALETTE[index];
};

// Colores para el gráfico de dona (Estado de las tareas)
const STATUS_COLORS: Record<string, { label: string; color: string }> = {
  todo: { label: 'Pendientes', color: '#94a3b8' }, // Gris Slate
  in_progress: { label: 'En Curso', color: '#6366f1' }, // Azul / Índigo
  waiting_on_third_party: { label: 'Retenidas por Terceros', color: '#ef4444' }, // Rojo / Naranja Intenso
  completed: { label: 'Completadas', color: '#10b981' } // Verde Esmeralda
};

export default function DashboardView({ user }: Props) {
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  // Escuchar colección /tareas en tiempo real
  useEffect(() => {
    const qTareas = query(
      collection(db, 'tareas'),
      where('userId', '==', user.uid)
    );

    const unsubTareas = onSnapshot(qTareas, (snapshot) => {
      const taskList: Tarea[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        if (!data.isTemplate && !data.isConcejalia) {
          taskList.push({ id: d.id, ...data } as Tarea);
        }
      });
      setTareas(taskList);
      setLoading(false);
    });

    return () => unsubTareas();
  }, [user.uid]);

  // Escuchar colección /projects en tiempo real
  useEffect(() => {
    const qProjects = query(
      collection(db, 'projects'),
      where('userId', '==', user.uid)
    );

    const unsubProjects = onSnapshot(qProjects, (snapshot) => {
      const projList: Project[] = [];
      snapshot.forEach((d) => {
        projList.push({ id: d.id, ...d.data() } as Project);
      });
      setProjects(projList);
    });

    return () => unsubProjects();
  }, [user.uid]);

  // CALCULO DE KPIS E INDICADORES
  
  // 1. Unificar expedientes/proyectos activos
  // Se consideran activos los de collection(projects) + proyectos inferidos desde /tareas que tengan projectId/expedientCode
  const expedientesMap: Record<string, { id: string; name: string; concejalia: string; status: string }> = {};

  // Agregar desde /projects
  projects.forEach((p) => {
    if (p.status !== 'completed' && p.status !== 'archived') {
      expedientesMap[p.id || p.name] = {
        id: p.id || p.name,
        name: p.name,
        concejalia: p.concejalia || 'Sin asignación',
        status: p.status || 'active'
      };
    }
  });

  // Agregar desde /tareas con projectId
  tareas.forEach((t) => {
    if (t.projectId && !expedientesMap[t.projectId]) {
      expedientesMap[t.projectId] = {
        id: t.projectId,
        name: t.projectName || t.expedientCode || 'Expediente sin nombre',
        concejalia: t.projectConcejalia || t.concejalia || 'Sin asignación',
        status: 'active'
      };
    }
  });

  const activeExpedientesCount = Object.keys(expedientesMap).length;

  // 2. Volumen por Concejalía (gráfico de barras)
  const concejaliaCounts: Record<string, number> = {};
  Object.values(expedientesMap).forEach((exp) => {
    const cName = exp.concejalia || 'Sin asignación';
    concejaliaCounts[cName] = (concejaliaCounts[cName] || 0) + 1;
  });

  // Si no hay expedientes aún, agrupar por concejalías de tareas como fallback
  if (Object.keys(concejaliaCounts).length === 0) {
    tareas.forEach((t) => {
      const cName = t.concejalia || t.projectConcejalia || 'Sin asignación';
      concejaliaCounts[cName] = (concejaliaCounts[cName] || 0) + 1;
    });
  }

  const barChartData = Object.entries(concejaliaCounts).map(([concejalia, count]) => ({
    concejalia,
    count,
    color: getConcejaliaHexColor(concejalia)
  }));

  // 3. Estado de las Tareas (gráfico de pastel / dona)
  const statusCounts: Record<string, number> = {
    todo: 0,
    in_progress: 0,
    waiting_on_third_party: 0,
    completed: 0
  };

  tareas.forEach((t) => {
    const s = t.status || (t.completada ? 'completed' : 'todo');
    if (statusCounts[s] !== undefined) {
      statusCounts[s]++;
    } else {
      statusCounts.todo++;
    }
  });

  const pieChartData = [
    { name: STATUS_COLORS.todo.label, value: statusCounts.todo, color: STATUS_COLORS.todo.color, key: 'todo' },
    { name: STATUS_COLORS.in_progress.label, value: statusCounts.in_progress, color: STATUS_COLORS.in_progress.color, key: 'in_progress' },
    { name: STATUS_COLORS.waiting_on_third_party.label, value: statusCounts.waiting_on_third_party, color: STATUS_COLORS.waiting_on_third_party.color, key: 'waiting_on_third_party' },
    { name: STATUS_COLORS.completed.label, value: statusCounts.completed, color: STATUS_COLORS.completed.color, key: 'completed' }
  ].filter((item) => item.value > 0);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6 bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
      
      {/* CABECERA Y TÍTULO */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">
          Cuadro de Mando Analítico
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
          Monitorización en tiempo real de expedientes, concejalías y detección de cuellos de botella.
        </p>
      </div>

      {/* 1. SECCIÓN DE TARJETAS DE RESUMEN (KPIs) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        
        {/* KPI 1: Expedientes Activos */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 sm:p-5 shadow-sm transition-colors duration-300">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Expedientes Activos
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-800 dark:text-slate-100">
            {activeExpedientesCount}
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            En gestión activa
          </p>
        </div>

        {/* KPI 2: Tareas Pendientes */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 sm:p-5 shadow-sm transition-colors duration-300">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Tareas Pendientes
            </span>
            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-800 dark:text-slate-100">
            {statusCounts.todo}
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Sin comenzar
          </p>
        </div>

        {/* KPI 3: Tareas En Curso */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 sm:p-5 shadow-sm transition-colors duration-300">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Tareas En Curso
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-800 dark:text-slate-100">
            {statusCounts.in_progress}
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            En trámite actual
          </p>
        </div>

        {/* KPI 4: TARJETA DESTACADA - Retenidas por Terceros (Ámbar / Rojo) */}
        <div className="bg-amber-50/80 dark:bg-amber-950/40 border-2 border-amber-400 dark:border-amber-600 rounded-2xl p-4 sm:p-5 shadow-md relative overflow-hidden transition-colors duration-300">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
              Retenidas por Terceros
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center shadow-sm shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-amber-900 dark:text-amber-200">
            {statusCounts.waiting_on_third_party}
          </div>
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mt-1 flex items-center gap-1">
            <span>⚠️</span> Cuello de botella detectado
          </p>
        </div>

      </div>

      {/* 2. GRID PRINCIPAL CON GRÁFICOS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* PANEL IZQUIERDO: BarChart de Volumen por Concejalía */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm transition-colors duration-300 flex flex-col">
          <div className="mb-4">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Volumen de Expedientes por Concejalía
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Distribución de carga de proyectos por área municipal
            </p>
          </div>

          <div className="w-full h-72 sm:h-80 flex-1">
            {barChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barChartData} margin={{ top: 20, right: 20, left: -10, bottom: 40 }}>
                  <XAxis 
                    dataKey="concejalia" 
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                  />
                  <YAxis tick={{ fill: '#64748b', fontSize: 12 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '0.75rem',
                      color: '#f8fafc'
                    }}
                    cursor={{ fill: 'rgba(148, 163, 184, 0.1)' }}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {barChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                No existen datos registrados para graficar.
              </div>
            )}
          </div>
        </div>

        {/* PANEL DERECHO: PieChart (Anillo) de Estado de las Tareas */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm transition-colors duration-300 flex flex-col">
          <div className="mb-4">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
              </svg>
              Distribución de Tareas por Estado
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Desglose operativo de trámites activos y retenidos
            </p>
          </div>

          <div className="w-full h-72 sm:h-80 flex-1 flex items-center justify-center">
            {pieChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieChartData}
                    cx="50%"
                    cy="45%"
                    innerRadius={60}
                    outerRadius={95}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {pieChartData.map((entry, index) => (
                      <Cell key={`pie-cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '0.75rem',
                      color: '#f8fafc'
                    }}
                  />
                  <Legend 
                    verticalAlign="bottom" 
                    height={36} 
                    formatter={(value) => (
                      <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                        {value}
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                No hay tareas activas para mostrar en el gráfico.
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
