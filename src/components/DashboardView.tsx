import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { User } from 'firebase/auth';
import { Tarea, Project } from '../types';
import { getConcejaliaStyle } from '../utils/concejaliaColors';
import { getTaskDeadlineInfo, getRetentionWarning } from '../utils/deadlines';

interface Props {
  user: User;
  onSelectTask: (tarea: Tarea) => void;
  onSelectProject?: (project: Project) => void;
}

type TimeRange = 'month' | 'quarter' | 'year' | 'all';

export default function DashboardView({ user, onSelectTask, onSelectProject }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [allTareas, setAllTareas] = useState<Tarea[]>([]);
  const [timeRange, setTimeRange] = useState<TimeRange>('year');

  // Escuchar proyectos
  useEffect(() => {
    const qProjects = query(
      collection(db, 'tareas'),
      where('userId', '==', user.uid),
      where('isProject', '==', true)
    );

    const unsub = onSnapshot(qProjects, (snapshot) => {
      const pList: Project[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        pList.push({ id: data.projectId || data.id || d.id, ...data } as Project);
      });
      setProjects(pList);
    });

    return () => unsub();
  }, [user.uid]);

  // Escuchar tareas
  useEffect(() => {
    const qTareas = query(
      collection(db, 'tareas'),
      where('userId', '==', user.uid)
    );

    const unsub = onSnapshot(qTareas, (snapshot) => {
      const tList: Tarea[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        if (!data.isTemplate && !data.isConcejalia && !data.isProject) {
          tList.push({ id: d.id, ...data } as Tarea);
        }
      });
      setAllTareas(tList);
    });

    return () => unsub();
  }, [user.uid]);

  // Filtrar según rango temporal
  const now = new Date();
  const getFilterTimestamp = (): number => {
    if (timeRange === 'month') {
      return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    }
    if (timeRange === 'quarter') {
      const currentQuarterMonth = Math.floor(now.getMonth() / 3) * 3;
      return new Date(now.getFullYear(), currentQuarterMonth, 1).getTime();
    }
    if (timeRange === 'year') {
      return new Date(now.getFullYear(), 0, 1).getTime();
    }
    return 0; // all
  };

  const minTimestamp = getFilterTimestamp();

  // Tareas y Proyectos filtrados
  const filteredTareas = allTareas.filter((t) => {
    if (minTimestamp === 0) return true;
    const created = t.fecha_creacion || (typeof t.createdAt === 'number' ? t.createdAt : 0);
    return created >= minTimestamp;
  });

  const filteredProjects = projects.filter((p) => {
    if (minTimestamp === 0) return true;
    const created = p.fecha_creacion || (typeof p.createdAt === 'number' ? p.createdAt : 0);
    return created >= minTimestamp;
  });

  // Métricas Clave (KPIs)
  const totalExpedientes = filteredProjects.length;
  const expedientesCompletados = filteredProjects.filter(p => p.status === 'completed').length;
  const expedientesActivos = filteredProjects.filter(p => p.status === 'active').length;
  const contratosMenoresTotal = filteredProjects.filter(p => p.isContratoMenor || p.type === 'contrato_menor').length;

  const totalTareasCount = filteredTareas.length;
  const tareasCompletadasCount = filteredTareas.filter(t => t.status === 'completed' || t.completada).length;
  const tareasEnCursoCount = filteredTareas.filter(t => t.status === 'in_progress').length;
  const tareasRetenidasCount = filteredTareas.filter(t => t.status === 'waiting_on_third_party').length;
  const tareasPendientesCount = filteredTareas.filter(t => t.status === 'todo' || !t.status).length;

  // Evaluación de plazos y cumplimiento
  const deadlineEvals = filteredTareas.map(t => getTaskDeadlineInfo(t));
  const expiredTasksCount = deadlineEvals.filter(d => d.isExpired).length;
  const criticalTasksCount = deadlineEvals.filter(d => d.severity === 'critical').length;
  const safeTasksCount = deadlineEvals.filter(d => d.severity === 'safe' || d.severity === 'warning').length;

  const totalEvaluated = expiredTasksCount + criticalTasksCount + safeTasksCount;
  const cumplimientoPorcentaje = totalEvaluated > 0 
    ? Math.round(((totalEvaluated - expiredTasksCount) / totalEvaluated) * 100)
    : 100;

  // Desglose por Concejalía
  const concejaliaCounts: Record<string, { total: number; completed: number; active: number; contracts: number }> = {};

  filteredProjects.forEach((p) => {
    const cName = p.concejalia || 'General';
    if (!concejaliaCounts[cName]) {
      concejaliaCounts[cName] = { total: 0, completed: 0, active: 0, contracts: 0 };
    }
    concejaliaCounts[cName].total += 1;
    if (p.status === 'completed') concejaliaCounts[cName].completed += 1;
    else concejaliaCounts[cName].active += 1;
    if (p.isContratoMenor || p.type === 'contrato_menor') concejaliaCounts[cName].contracts += 1;
  });

  const concejaliasSorted = Object.entries(concejaliaCounts).sort((a, b) => b[1].total - a[1].total);

  // Análisis de Cuellos de Botella (Retenciones)
  const retentionMap: Record<string, { count: number; totalDays: number; tasks: Tarea[] }> = {};
  filteredTareas.forEach((t) => {
    if (t.status === 'waiting_on_third_party') {
      const reason = t.blockedBy || t.blockingReason || 'Tercero sin especificar';
      const warning = getRetentionWarning(t);
      if (!retentionMap[reason]) {
        retentionMap[reason] = { count: 0, totalDays: 0, tasks: [] };
      }
      retentionMap[reason].count += 1;
      retentionMap[reason].totalDays += warning.daysRetained;
      retentionMap[reason].tasks.push(t);
    }
  });

  const bottlenecksSorted = Object.entries(retentionMap).sort((a, b) => b[1].count - a[1].count);

  // Exportar Informe Ejecutivo en PDF / Impresión
  const exportExecutiveReportPDF = () => {
    const rangeLabel = timeRange === 'month' ? 'Este Mes' : timeRange === 'quarter' ? 'Este Trimestre' : timeRange === 'year' ? 'Este Año 2026' : 'Todo el Histórico';
    const printDate = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const concejaliaTableRows = concejaliasSorted.map(([cName, data]) => {
      const percent = totalExpedientes > 0 ? Math.round((data.total / totalExpedientes) * 100) : 0;
      return `
        <tr>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #1e293b;">${cName}</td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: 700;">${data.total}</td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #4f46e5;">${data.active}</td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #16a34a;">${data.completed}</td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #d97706;">${data.contracts}</td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 700;">${percent}%</td>
        </tr>
      `;
    }).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Informe Ejecutivo de Gestión Municipal - ${rangeLabel}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
          @page { size: A4 portrait; margin: 12mm; }
          * { box-sizing: border-box; }
          body { font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #0f172a; margin: 0; padding: 0; background: #ffffff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #4f46e5; padding-bottom: 12px; margin-bottom: 16px; }
          .title { font-size: 18px; font-weight: 800; color: #1e1b4b; margin: 0; }
          .subtitle { font-size: 12px; color: #4338ca; font-weight: 700; margin-top: 4px; text-transform: uppercase; }
          .meta-info { font-size: 10px; color: #64748b; margin-top: 4px; }
          .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
          .kpi-card { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; }
          .kpi-title { font-size: 9px; text-transform: uppercase; font-weight: 800; color: #64748b; margin-bottom: 2px; }
          .kpi-val { font-size: 20px; font-weight: 900; color: #0f172a; }
          .kpi-sub { font-size: 9px; color: #94a3b8; margin-top: 2px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11px; }
          th { background: #1e293b; color: #ffffff; text-align: left; padding: 8px 10px; font-size: 10px; text-transform: uppercase; }
          .section-title { font-size: 13px; font-weight: 800; color: #1e293b; margin-top: 18px; margin-bottom: 6px; border-left: 4px solid #4f46e5; padding-left: 8px; }
          .footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 9px; color: #94a3b8; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="title">AYUNTAMIENTO DE NUMANCIA DE LA SAGRA</h1>
            <div class="subtitle">Cuadro de Mandos y Rendimiento de Gestión (${rangeLabel})</div>
            <div class="meta-info">Fecha de emisión: ${printDate} | Responsable: ${user.email || 'Alcaldía'}</div>
          </div>
          <div style="font-size: 24px; font-weight: 900; color: #4f46e5;">FocusFlow</div>
        </div>

        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-title">Expedientes Totales</div>
            <div class="kpi-val">${totalExpedientes}</div>
            <div class="kpi-sub">${expedientesActivos} activos / ${expedientesCompletados} finalizados</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title">Contratos Menores</div>
            <div class="kpi-val" style="color: #d97706;">${contratosMenoresTotal}</div>
            <div class="kpi-sub">Trámites y memorias</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title">Cumplimiento Plazos</div>
            <div class="kpi-val" style="color: ${cumplimientoPorcentaje >= 80 ? '#16a34a' : '#dc2626'};">${cumplimientoPorcentaje}%</div>
            <div class="kpi-sub">${expiredTasksCount} vencidas / ${criticalTasksCount} críticas</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title">Retenciones Terceros</div>
            <div class="kpi-val" style="color: #ea580c;">${tareasRetenidasCount}</div>
            <div class="kpi-sub">Esperando informes/proveedor</div>
          </div>
        </div>

        <div class="section-title">Distribución y Carga de Trabajo por Concejalía</div>
        <table>
          <thead>
            <tr>
              <th>Concejalía</th>
              <th style="text-align: center;">Total Exp.</th>
              <th style="text-align: center;">Activos</th>
              <th style="text-align: center;">Completados</th>
              <th style="text-align: center;">Contratos Menores</th>
              <th style="text-align: right;">% Carga</th>
            </tr>
          </thead>
          <tbody>
            ${concejaliaTableRows || '<tr><td colspan="6" style="padding: 12px; text-align: center; color: #94a3b8;">No hay datos para este periodo.</td></tr>'}
          </tbody>
        </table>

        <div class="footer">
          Documento generado automáticamente por FocusFlow • Ayuntamiento de Numancia de la Sagra
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6 animate-fade-in">
      
      {/* HEADER CON FILTROS Y BOTÓN DE INFORME */}
      <section className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <span>📊</span> Cuadro de Mandos y Analítica Ejecutiva
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Control integral de carga de trabajo, plazos de tramitación y rendimiento municipal.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Selector de Rango Temporal */}
          <div className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-1 rounded-xl shadow-xs text-xs">
            {(['month', 'quarter', 'year', 'all'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer capitalize ${
                  timeRange === r
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                {r === 'month' ? 'Este Mes' : r === 'quarter' ? 'Trimestre' : r === 'year' ? 'Año 2026' : 'Todo'}
              </button>
            ))}
          </div>

          <button
            onClick={exportExecutiveReportPDF}
            className="px-4 py-2 bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-700 hover:to-rose-600 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span>📄</span> Informe Ejecutivo PDF
          </button>
        </div>
      </section>

      {/* TARJETAS DE KPIS PRINCIPALES */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* KPI 1: Expedientes Totales */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Expedientes Totales
            </span>
            <span className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
              📁
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-800 dark:text-slate-100">
              {totalExpedientes}
            </span>
            <span className="text-xs font-semibold text-slate-400">
              ({expedientesActivos} activos / {expedientesCompletados} finalizados)
            </span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-indigo-600 h-full rounded-full transition-all"
              style={{ width: `${totalExpedientes > 0 ? (expedientesCompletados / totalExpedientes) * 100 : 0}%` }}
            ></div>
          </div>
        </div>

        {/* KPI 2: Contratos Menores */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Contratos Menores
            </span>
            <span className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
              📜
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-800 dark:text-slate-100">
              {contratosMenoresTotal}
            </span>
            <span className="text-xs font-semibold text-slate-400">
              contratos tramitados
            </span>
          </div>
          <p className="text-[11px] text-slate-400">
            Con trámites de memoria, RC, 3 ofertas y decreto
          </p>
        </div>

        {/* KPI 3: Cumplimiento de Plazos */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Eficacia en Plazos
            </span>
            <span className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
              ⏱️
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-black ${cumplimientoPorcentaje >= 80 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {cumplimientoPorcentaje}%
            </span>
            <span className="text-xs font-semibold text-slate-400">
              en plazo legal
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-red-500 font-bold">🔴 {expiredTasksCount} vencidas</span>
            <span>•</span>
            <span className="text-amber-500 font-bold">🟠 {criticalTasksCount} críticas</span>
          </div>
        </div>

        {/* KPI 4: Retenciones / Terceros */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
              Trámites Retenidos
            </span>
            <span className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 flex items-center justify-center font-bold">
              ⚠️
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-800 dark:text-slate-100">
              {tareasRetenidasCount}
            </span>
            <span className="text-xs font-semibold text-slate-400">
              esperando terceros
            </span>
          </div>
          <p className="text-[11px] text-slate-400">
            Pendientes de informes, facturas o proveedores
          </p>
        </div>

      </div>

      {/* SECCIÓN 2 COLUMNAS: CARGA POR CONCEJALÍA + CUELLOS DE BOTELLA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* COLUMNA 1: DISTRIBUCIÓN POR CONCEJALÍA */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-3xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-3">
            <h3 className="font-extrabold text-sm sm:text-base text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span>🏛️</span> Carga de Trabajo por Concejalía
            </h3>
            <span className="text-xs font-semibold text-slate-400">
              {concejaliasSorted.length} áreas activas
            </span>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {concejaliasSorted.length === 0 ? (
              <p className="text-xs text-slate-400 italic text-center py-6">No hay expedientes en el periodo seleccionado.</p>
            ) : (
              concejaliasSorted.map(([cName, stats]) => {
                const cStyle = getConcejaliaStyle(cName);
                const percent = totalExpedientes > 0 ? Math.round((stats.total / totalExpedientes) * 100) : 0;

                return (
                  <div key={cName} className="p-3.5 bg-slate-50 dark:bg-slate-700/30 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
                        <div className={`w-3 h-3 rounded-full ${cStyle.dot}`}></div>
                        <span>{cName}</span>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-[11px]">
                        <span className="font-bold text-slate-700 dark:text-slate-200">{stats.total} exp. ({percent}%)</span>
                        <span className="text-emerald-600 dark:text-emerald-400">({stats.completed} concluidos)</span>
                      </div>
                    </div>

                    <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-indigo-600 h-full rounded-full transition-all"
                        style={{ width: `${percent}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* COLUMNA 2: DETECTOR DE CUELLOS DE BOTELLA / RETENCIONES */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-3xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-3">
            <h3 className="font-extrabold text-sm sm:text-base text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span>⚠️</span> Detector de Cuellos de Botella
            </h3>
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
              {bottlenecksSorted.length} entidades retenedoras
            </span>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {bottlenecksSorted.length === 0 ? (
              <div className="text-center py-10 space-y-2">
                <span className="text-3xl">🎉</span>
                <p className="text-xs font-bold text-slate-600 dark:text-slate-300">¡No hay expedientes retenidos actualmente!</p>
                <p className="text-[11px] text-slate-400">Todos los trámites avanzan en plazo.</p>
              </div>
            ) : (
              bottlenecksSorted.map(([reason, stats]) => (
                <div key={reason} className="p-3.5 bg-amber-50/50 dark:bg-amber-950/20 rounded-2xl border border-amber-200/80 dark:border-amber-800/50 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-amber-900 dark:text-amber-200">
                      {reason}
                    </span>
                    <span className="font-bold text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/60">
                      {stats.count} {stats.count === 1 ? 'trámite' : 'trámites'}
                    </span>
                  </div>

                  <div className="space-y-1">
                    {stats.tasks.slice(0, 3).map((t) => (
                      <div
                        key={t.id}
                        onClick={() => onSelectTask(t)}
                        className="text-[11px] text-slate-600 dark:text-slate-300 truncate hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer flex items-center gap-1.5"
                      >
                        <span>•</span>
                        <span className="font-semibold">{t.titulo || t.title}</span>
                        {t.projectName && <span className="text-slate-400">({t.projectName})</span>}
                      </div>
                    ))}
                    {stats.tasks.length > 3 && (
                      <p className="text-[10px] text-slate-400 italic">
                        + {stats.tasks.length - 3} trámites más...
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
