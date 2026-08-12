import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { User } from 'firebase/auth';
import { Tarea, Project } from '../types';
import { getConcejaliaStyle } from '../utils/concejaliaColors';
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
  'Transporte': '#06b6d4', // Cyan
  'Entidades Urbanísticas de Conservación': '#a855f7' // Púrpura
};

const DYNAMIC_HEX_PALETTE = ['#6366f1', '#f43f5e', '#14b8a6', '#06b6d4', '#d946ef', '#ec4899', '#8b5cf6'];

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
const STATUS_COLORS: Record<string, { label: string; color: string; badge: string }> = {
  todo: { label: 'Pendientes', color: '#94a3b8', badge: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300' },
  in_progress: { label: 'En Curso', color: '#6366f1', badge: 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300' },
  waiting_on_third_party: { label: 'Retenidas por Terceros', color: '#ef4444', badge: 'bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300' },
  completed: { label: 'Completadas', color: '#10b981', badge: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300' }
};

export default function DashboardView({ user }: Props) {
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [expedientes, setExpedientes] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  // Escuchar la colección /tareas (tanto tareas como expedientes con isProject: true)
  useEffect(() => {
    const q = query(
      collection(db, 'tareas'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const taskList: Tarea[] = [];
      const expList: Project[] = [];

      snapshot.forEach((d) => {
        const data = d.data();
        if (data.isTemplate || data.isConcejalia) return;

        if (data.isProject) {
          expList.push({ id: d.id, ...data } as Project);
        } else {
          taskList.push({ id: d.id, ...data } as Tarea);
        }
      });

      setTareas(taskList);
      setExpedientes(expList);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user.uid]);

  // Escuchar también la colección secundaria /projects por retrocompatibilidad
  useEffect(() => {
    const qProjects = query(
      collection(db, 'projects'),
      where('userId', '==', user.uid)
    );

    const unsubProjects = onSnapshot(qProjects, (snapshot) => {
      if (snapshot.empty) return;
      setExpedientes((prevExp) => {
        const existingIds = new Set(prevExp.map(p => p.id));
        const extraProjects: Project[] = [];
        snapshot.forEach((d) => {
          if (!existingIds.has(d.id)) {
            extraProjects.push({ id: d.id, ...d.data() } as Project);
          }
        });
        return extraProjects.length > 0 ? [...prevExp, ...extraProjects] : prevExp;
      });
    });

    return () => unsubProjects();
  }, [user.uid]);

  // --- CÁLCULOS DE MÉTRICAS Y KPIS ---

  // 1. Expedientes Activos y Totales
  const totalExpedientes = expedientes.length > 0 ? expedientes.length : new Set(tareas.map(t => t.projectId).filter(Boolean)).size;
  const expedientesCompletados = expedientes.filter(p => p.status === 'completed').length;
  const activeExpedientesCount = expedientes.length > 0
    ? expedientes.filter(p => p.status !== 'completed' && p.status !== 'archived').length
    : totalExpedientes;

  // 2. Estado de Tareas
  const statusCounts = {
    todo: 0,
    in_progress: 0,
    waiting_on_third_party: 0,
    completed: 0
  };

  tareas.forEach((t) => {
    if (t.completada || t.status === 'completed') {
      statusCounts.completed++;
    } else if (t.status === 'waiting_on_third_party') {
      statusCounts.waiting_on_third_party++;
    } else if (t.status === 'in_progress') {
      statusCounts.in_progress++;
    } else {
      statusCounts.todo++;
    }
  });

  const totalTareas = tareas.length;
  const porcentajeCompletado = totalTareas > 0 ? Math.round((statusCounts.completed / totalTareas) * 100) : 0;

  // 3. Minutos/Horas Estimadas Totales
  const minutosEstimadosTotales = tareas.reduce((acc, t) => acc + (t.estimatedMinutes || (t as any).minutos_estimados || 0), 0);
  const horasEstimadasTotales = (minutosEstimadosTotales / 60).toFixed(1);

  // 4. Datos por Concejalía (Volumen y Porcentaje de Avance)
  const concejaliaStats: Record<string, { name: string; total: number; completed: number; inProgress: number; waiting: number }> = {};

  // Contabilizar desde expedientes
  expedientes.forEach((exp) => {
    const cName = exp.concejalia || 'Sin asignación';
    if (!concejaliaStats[cName]) {
      concejaliaStats[cName] = { name: cName, total: 0, completed: 0, inProgress: 0, waiting: 0 };
    }
    concejaliaStats[cName].total++;
    if (exp.status === 'completed') concejaliaStats[cName].completed++;
  });

  // Contabilizar desde tareas
  tareas.forEach((t) => {
    const cName = t.concejalia || t.projectConcejalia || 'Sin asignación';
    if (!concejaliaStats[cName]) {
      concejaliaStats[cName] = { name: cName, total: 0, completed: 0, inProgress: 0, waiting: 0 };
    }
    concejaliaStats[cName].total++;
    if (t.completada || t.status === 'completed') concejaliaStats[cName].completed++;
    else if (t.status === 'in_progress') concejaliaStats[cName].inProgress++;
    else if (t.status === 'waiting_on_third_party') concejaliaStats[cName].waiting++;
  });

  const barChartData = Object.values(concejaliaStats).map((stat) => ({
    concejalia: stat.name,
    count: stat.total,
    color: getConcejaliaHexColor(stat.name),
    porcentaje: stat.total > 0 ? Math.round((stat.completed / stat.total) * 100) : 0
  })).sort((a, b) => b.count - a.count);

  // 5. Datos para el Gráfico de Dona
  const pieChartData = [
    { name: STATUS_COLORS.todo.label, value: statusCounts.todo, color: STATUS_COLORS.todo.color },
    { name: STATUS_COLORS.in_progress.label, value: statusCounts.in_progress, color: STATUS_COLORS.in_progress.color },
    { name: STATUS_COLORS.waiting_on_third_party.label, value: statusCounts.waiting_on_third_party, color: STATUS_COLORS.waiting_on_third_party.color },
    { name: STATUS_COLORS.completed.label, value: statusCounts.completed, color: STATUS_COLORS.completed.color }
  ].filter((item) => item.value > 0);

  // 6. Análisis de Cuellos de Botella por Entidad Retenedora
  const thirdPartyCounts: Record<string, number> = {};
  tareas.forEach((t) => {
    if (t.status === 'waiting_on_third_party') {
      const entity = t.thirdPartyEntity || (t as any).entidad_retenedora || (t as any).retainedBy || 'Entidad no especificada';
      thirdPartyCounts[entity] = (thirdPartyCounts[entity] || 0) + 1;
    }
  });

  const thirdPartyList = Object.entries(thirdPartyCounts)
    .map(([entity, count]) => ({ entity, count }))
    .sort((a, b) => b.count - a.count);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-8 bg-slate-50 dark:bg-slate-900 transition-colors duration-300 min-h-screen">
      
      {/* CABECERA Y TÍTULO */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-3">
            <span>📊</span> Cuadro de Mando Analítico
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Monitorización en tiempo real de expedientes municipales, rendimiento por concejalía y retenciones.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/60 text-xs font-semibold text-indigo-700 dark:text-indigo-300 shrink-0">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          Sincronizado con Firestore
        </div>
      </div>

      {/* 1. SECCIÓN DE TARJETAS DE RESUMEN (KPIs) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* KPI 1: Expedientes Activos */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500"></div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Expedientes Activos
            </span>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
          </div>
          <div className="text-3xl font-black text-slate-800 dark:text-slate-100">
            {activeExpedientesCount}
          </div>
          <p className="text-xs font-medium text-slate-400 dark:text-slate-500 mt-2 flex items-center justify-between">
            <span>De {totalExpedientes} expedientes totales</span>
            {expedientesCompletados > 0 && (
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓ {expedientesCompletados} listos</span>
            )}
          </p>
        </div>

        {/* KPI 2: Tasa de Resolución / Eficiencia */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500"></div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Tasa de Completitud
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="text-3xl font-black text-slate-800 dark:text-slate-100 flex items-baseline gap-1">
            {porcentajeCompletado}%
            <span className="text-xs font-normal text-slate-400">({statusCounts.completed}/{totalTareas})</span>
          </div>
          {/* Progress bar visual */}
          <div className="w-full bg-slate-100 dark:bg-slate-700 h-2 rounded-full mt-3 overflow-hidden">
            <div 
              className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
              style={{ width: `${porcentajeCompletado}%` }}
            ></div>
          </div>
        </div>

        {/* KPI 3: Horas Estimadas Totales */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500"></div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Carga Estimada
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="text-3xl font-black text-slate-800 dark:text-slate-100 flex items-baseline gap-1">
            {horasEstimadasTotales} <span className="text-sm font-semibold text-slate-500">horas</span>
          </div>
          <p className="text-xs font-medium text-slate-400 dark:text-slate-500 mt-2">
            {minutosEstimadosTotales} minutos en {totalTareas} trámites
          </p>
        </div>

        {/* KPI 4: TARJETA ALERTA - Retenidas por Terceros */}
        <div className="bg-amber-50/90 dark:bg-amber-950/40 border-2 border-amber-400 dark:border-amber-600/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-black uppercase tracking-wider text-amber-800 dark:text-amber-300">
              Retenidas por Terceros
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          </div>
          <div className="text-3xl font-black text-amber-900 dark:text-amber-100">
            {statusCounts.waiting_on_third_party}
          </div>
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mt-2 flex items-center gap-1">
            <span>⚠️</span> {thirdPartyList.length} entidad(es) retenedora(s)
          </p>
        </div>

      </div>

      {/* 2. GRID PRINCIPAL DE GRÁFICOS Y ANÁLISIS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* PANEL IZQUIERDO: BarChart de Carga por Concejalía + Barras de Progreso */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Volumen por Concejalía
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Distribución de carga de expedientes y tareas por área municipal.
            </p>
          </div>

          {/* Gráfico de Barras Recharts */}
          <div className="w-full h-64 sm:h-72">
            {barChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barChartData} margin={{ top: 20, right: 15, left: -20, bottom: 40 }}>
                  <XAxis 
                    dataKey="concejalia" 
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                  />
                  <YAxis tick={{ fill: '#64748b', fontSize: 12 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '0.75rem',
                      color: '#f8fafc',
                      fontSize: '12px'
                    }}
                    cursor={{ fill: 'rgba(148, 163, 184, 0.1)' }}
                  />
                  <Bar dataKey="count" name="Trámites Totales" radius={[6, 6, 0, 0]}>
                    {barChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                No existen datos registrados para graficar.
              </div>
            )}
          </div>

          {/* Lista Visual de Avance por Concejalía */}
          {barChartData.length > 0 && (
            <div className="border-t border-slate-100 dark:border-slate-700/60 pt-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Porcentaje de Avance por Concejalía
              </h4>
              <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                {barChartData.map((item) => {
                  const style = getConcejaliaStyle(item.concejalia);
                  return (
                    <div key={item.concejalia} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className="flex items-center gap-2 truncate">
                          <span className={`w-2.5 h-2.5 rounded-full ${style.dot}`}></span>
                          <span className="text-slate-700 dark:text-slate-200 font-semibold truncate">{item.concejalia}</span>
                        </span>
                        <span className="text-slate-500 dark:text-slate-400 text-xs shrink-0">
                          {item.porcentaje}% ({item.count} ítems)
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-700/70 h-2 rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all duration-500" 
                          style={{ width: `${item.porcentaje}%`, backgroundColor: item.color }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* PANEL DERECHO: PieChart de Estado Operativo + Alerta de Cuellos de Botella */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                </svg>
                Estado Operativo de Trámites
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Distribución porcentual del estado de ejecución de las tareas.
            </p>
          </div>

          {/* Gráfico de Dona Recharts */}
          <div className="w-full h-64 sm:h-72 relative flex items-center justify-center">
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
                      color: '#f8fafc',
                      fontSize: '12px'
                    }}
                  />
                  <Legend 
                    verticalAlign="bottom" 
                    height={36} 
                    formatter={(value) => (
                      <span className="text-xs text-slate-600 dark:text-slate-300 font-semibold">
                        {value}
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                No hay tareas activas para mostrar en el gráfico.
              </div>
            )}
          </div>

          {/* Sección de Análisis de Retenciones por Terceros */}
          <div className="border-t border-slate-100 dark:border-slate-700/60 pt-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400 flex items-center justify-between">
              <span>⚠️ Cuellos de Botella por Entidad</span>
              <span className="text-slate-400 font-normal">({thirdPartyList.length} entidades)</span>
            </h4>

            {thirdPartyList.length > 0 ? (
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {thirdPartyList.map((item) => (
                  <div key={item.entity} className="flex items-center justify-between p-2.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/40 text-xs">
                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
                      <span className="truncate">{item.entity}</span>
                    </span>
                    <span className="font-bold px-2 py-0.5 rounded-md bg-amber-200/70 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 shrink-0">
                      {item.count} {item.count === 1 ? 'retención' : 'retenciones'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/40 text-xs font-medium text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                <span>🎉</span> Excelente: No existen tareas retenidas por terceros en este momento.
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
