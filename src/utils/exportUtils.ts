import { Project, Tarea } from '../types';

/**
 * Convierte un texto a formato seguro para CSV de Excel
 */
const cleanCSV = (str?: string): string => {
  if (!str) return '""';
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
};

/**
 * Traduce el estado del proyecto o tarea a texto entendible
 */
const translateStatus = (status?: string, completada?: boolean): string => {
  if (completada || status === 'completed') return 'Completado';
  if (status === 'in_progress') return 'En curso';
  if (status === 'waiting_on_third_party') return 'Retenido / Terceros';
  if (status === 'archived') return 'Archivado';
  return 'Pendiente';
};

/**
 * Ordena las tareas de un expediente por su número de secuencia ("1.", "2.", "3.", etc.)
 */
export const sortExpedientTasksNaturally = (tasks: Tarea[]): Tarea[] => {
  return [...tasks].sort((a, b) => {
    const textA = a.title || a.titulo || '';
    const textB = b.title || b.titulo || '';
    const matchA = textA.match(/^(\d+)[\.\s]/);
    const matchB = textB.match(/^(\d+)[\.\s]/);
    const orderA = matchA ? parseInt(matchA[1], 10) : (typeof a.orderIndex === 'number' ? a.orderIndex : 9999);
    const orderB = matchB ? parseInt(matchB[1], 10) : (typeof b.orderIndex === 'number' ? b.orderIndex : 9999);

    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return textA.localeCompare(textB, undefined, { numeric: true, sensitivity: 'base' });
  });
};

/**
 * Formatea la lista de tareas de un expediente a texto plano listo para WhatsApp / Email
 */
export const formatExpedientTasksText = (project: Project, tasks: Tarea[]): string => {
  const sortedTasks = sortExpedientTasksNaturally(tasks);
  
  const lines = sortedTasks.map((t, idx) => {
    let titleStr = t.title || t.titulo || '';
    
    // Eliminar sufijo del nombre de proyecto si existe al final (" - NombreProyecto")
    const projName = project.name ? project.name.trim() : '';
    if (projName && titleStr.toLowerCase().endsWith(` - ${projName.toLowerCase()}`)) {
      titleStr = titleStr.substring(0, titleStr.length - (projName.length + 3)).trim();
    }
    
    // Si la tarea ya tiene número ("1. Título"), extraer sólo el título sin el número previo
    const numberMatch = titleStr.match(/^(\d+)[\.\s]+(.*)$/);
    if (numberMatch) {
      titleStr = numberMatch[2].trim();
    }
    
    return `${idx + 1}. ${titleStr}`;
  });

  return lines.join('\n');
};

/**
 * Copia la lista de tareas formateada al portapapeles
 */
export const copyExpedientTasksToClipboard = async (project: Project, tasks: Tarea[]): Promise<boolean> => {
  const text = formatExpedientTasksText(project, tasks);
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    }
  } catch (err) {
    console.error('Error al copiar al portapapeles:', err);
    return false;
  }
};

/**
 * EXPORTAR EXPEDIENTE INDIVIDUAL A EXCEL (CSV UTF-8 BOM)
 */
export const exportExpedientToCSV = (project: Project, tasks: Tarea[]) => {
  const sortedTasks = sortExpedientTasksNaturally(tasks);
  const bom = '\uFEFF'; // Para que Excel reconozca caracteres en castellano (á, é, ñ, etc.)
  const headers = ['Código Expediente', 'Nombre Expediente', 'Concejalía', 'Estado Expediente', 'Tarea', 'Estado Tarea', 'Retenido Por', 'Tiempo Estimado (min)', 'Notas / Anotaciones'];

  const rows = sortedTasks.map(t => [
    cleanCSV(project.expedientCode || 'N/A'),
    cleanCSV(project.name),
    cleanCSV(project.concejalia || 'General'),
    cleanCSV(translateStatus(project.status)),
    cleanCSV(t.titulo || t.title),
    cleanCSV(translateStatus(t.status, t.completada)),
    cleanCSV(t.blockedBy || ''),
    t.estimatedTimeMin || 15,
    cleanCSV(t.notas || t.notes || '')
  ]);

  const csvContent = bom + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  const filename = `${project.expedientCode || 'EXPEDIENTE'}_${project.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.csv`;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * EXPORTAR EXPEDIENTE INDIVIDUAL A PDF (IMPRIMIBLE OFICIAL A4 PORTRAIT)
 */
export const exportExpedientToPDF = (project: Project, tasks: Tarea[]) => {
  const sortedTasks = sortExpedientTasksNaturally(tasks);
  const completedTasks = sortedTasks.filter(t => t.completada || t.status === 'completed').length;
  const progressPercent = sortedTasks.length > 0 ? Math.round((completedTasks / sortedTasks.length) * 100) : 0;
  const printDate = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Informe Expediente ${project.expedientCode || ''} - ${project.name}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        @page {
          size: A4 portrait;
          margin: 10mm 12mm 12mm 12mm;
        }
        * {
          box-sizing: border-box;
        }
        body {
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          color: #0f172a;
          margin: 0;
          padding: 0;
          background: #ffffff;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #4f46e5;
          padding-bottom: 10px;
          margin-bottom: 14px;
        }
        .title-area {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .title {
          font-size: 18px;
          font-weight: 800;
          color: #1e1b4b;
          margin: 0;
          line-height: 1.2;
        }
        .code-badge {
          display: inline-block;
          background: #e0e7ff;
          color: #3730a3;
          font-weight: 800;
          font-family: monospace;
          padding: 3px 8px;
          border-radius: 6px;
          font-size: 12px;
          border: 1px solid #c7d2fe;
        }
        .meta-info {
          font-size: 11px;
          color: #475569;
          margin-top: 4px;
        }
        .summary-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 10px 14px;
          margin-bottom: 14px;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }
        .metric-title {
          font-size: 9px;
          text-transform: uppercase;
          font-weight: 700;
          color: #64748b;
          margin-bottom: 2px;
          letter-spacing: 0.3px;
        }
        .metric-value {
          font-size: 14px;
          font-weight: 800;
          color: #0f172a;
        }
        .progress-bar-bg {
          background: #cbd5e1;
          height: 6px;
          border-radius: 3px;
          overflow: hidden;
          margin-top: 4px;
        }
        .progress-bar-fill {
          background: #4f46e5;
          height: 100%;
        }
        .section-title {
          font-size: 13px;
          font-weight: 800;
          color: #1e1b4b;
          margin: 0 0 8px 0;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 4px;
        }
        th {
          background: #f1f5f9;
          text-align: left;
          padding: 6px 10px;
          font-size: 10px;
          font-weight: 800;
          color: #334155;
          border-bottom: 2px solid #cbd5e1;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        td {
          padding: 7px 10px;
          font-size: 11px;
          border-bottom: 1px solid #e2e8f0;
          vertical-align: middle;
        }
        tr:nth-child(even) td {
          background: #f8fafc;
        }
        .badge {
          display: inline-block;
          padding: 2px 7px;
          border-radius: 10px;
          font-size: 10px;
          font-weight: 700;
          white-space: nowrap;
        }
        .badge-completed { background: #dcfce7; color: #166534; }
        .badge-in_progress { background: #dbeafe; color: #1e40af; }
        .badge-waiting { background: #fef3c7; color: #92400e; }
        .badge-todo { background: #f1f5f9; color: #475569; }
        .footer {
          margin-top: 20px;
          padding-top: 8px;
          border-top: 1px solid #e2e8f0;
          font-size: 10px;
          color: #94a3b8;
          display: flex;
          justify-content: space-between;
        }
        @media print {
          body { margin: 0; padding: 0; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="title-area">
            ${project.expedientCode ? `<span class="code-badge">${project.expedientCode}</span>` : ''}
            <h1 class="title">${project.name}</h1>
          </div>
          <div class="meta-info">
            🏛️ <strong>Concejalía:</strong> ${project.concejalia || 'General'}
            ${project.linkedExpedientId ? ` &nbsp;|&nbsp; 🔗 <strong>Vinculado a:</strong> ${project.linkedExpedientId}` : ''}
          </div>
          ${project.notas || project.notes ? `<div style="font-size: 11px; color: #475569; margin-top: 4px; font-style: italic;">📝 ${project.notas || project.notes}</div>` : ''}
        </div>
        <div style="text-align: right;">
          <div style="font-size: 10px; font-weight: 800; color: #4f46e5; letter-spacing: 0.5px;">ADMINISTRACIÓN MUNICIPAL</div>
          <div style="font-size: 10px; color: #64748b; margin-top: 2px;">Fecha: ${printDate}</div>
        </div>
      </div>

      <div class="summary-card">
        <div>
          <div class="metric-title">Total Trámites</div>
          <div class="metric-value">${sortedTasks.length} tareas</div>
        </div>
        <div>
          <div class="metric-title">Completadas</div>
          <div class="metric-value" style="color: #166534;">${completedTasks} tareas</div>
        </div>
        <div>
          <div class="metric-title">Estado Expediente</div>
          <div class="metric-value">${translateStatus(project.status)}</div>
        </div>
        <div>
          <div class="metric-title">Porcentaje Avance</div>
          <div class="metric-value">${progressPercent}%</div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width: ${progressPercent}%;"></div>
          </div>
        </div>
      </div>

      <h2 class="section-title">📋 Trámites y Tareas Asociadas</h2>
      <table>
        <thead>
          <tr>
            <th style="width: 5%;">#</th>
            <th style="width: 45%;">Trámite / Tarea</th>
            <th style="width: 20%;">Estado</th>
            <th style="width: 15%;">Tiempo Est.</th>
            <th style="width: 15%;">Anotaciones</th>
          </tr>
        </thead>
        <tbody>
          ${sortedTasks.length === 0 ? `<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding:15px;">No hay tareas registradas en este expediente.</td></tr>` : ''}
          ${sortedTasks.map((t, index) => {
            const isCompleted = t.completada || t.status === 'completed';
            const statusKey = isCompleted ? 'completed' : (t.status || 'todo');
            const badgeClass = statusKey === 'completed' ? 'badge-completed' : (statusKey === 'in_progress' ? 'badge-in_progress' : (statusKey === 'waiting_on_third_party' ? 'badge-waiting' : 'badge-todo'));
            
            return `
              <tr>
                <td style="font-weight: 700; color: #475569;">${index + 1}</td>
                <td>
                  <strong style="${isCompleted ? 'text-decoration: line-through; color: #94a3b8;' : ''}">${t.titulo || t.title}</strong>
                </td>
                <td>
                  <span class="badge ${badgeClass}">${translateStatus(t.status, t.completada)}</span>
                  ${t.blockedBy ? `<div style="font-size: 9px; color: #92400e; margin-top:2px;">Retenido: ${t.blockedBy}</div>` : ''}
                </td>
                <td>${t.estimatedTimeMin ? `${t.estimatedTimeMin} min` : (t.tiempo_estimado || '15 min')}</td>
                <td style="font-size: 10px; color: #64748b;">${t.notas || t.notes || '-'}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>

      <div class="footer">
        <div>Sistema Municipal de Gestión de Expedientes y Productividad</div>
        <div>Página 1</div>
      </div>

      <script>
        window.onload = function() {
          window.print();
        };
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(htmlContent);
  printWindow.document.close();
};

/**
 * EXPORTAR INFORME DE CONCEJALÍA O GENERAL A EXCEL (CSV UTF-8 BOM)
 */
export const exportConcejaliaReportToCSV = (concejaliaName: string, projects: Project[], allTasks: Tarea[]) => {
  const bom = '\uFEFF';
  const headers = ['Concejalía', 'Código Expediente', 'Nombre Expediente', 'Estado Expediente', 'Total Tareas', 'Tareas Completadas', '% Avance', 'Anotaciones Expediente'];

  const rows = projects.map(p => {
    const projTasks = allTasks.filter(t => t.projectId === p.id);
    const completed = projTasks.filter(t => t.completada || t.status === 'completed').length;
    const percent = projTasks.length > 0 ? Math.round((completed / projTasks.length) * 100) : 0;

    return [
      cleanCSV(p.concejalia || concejaliaName || 'General'),
      cleanCSV(p.expedientCode || 'N/A'),
      cleanCSV(p.name),
      cleanCSV(translateStatus(p.status)),
      projTasks.length,
      completed,
      `${percent}%`,
      cleanCSV(p.notas || p.notes || '')
    ];
  });

  const csvContent = bom + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  const safeName = (concejaliaName || 'GENERAL').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `INFORME_CONCEJALIA_${safeName}.csv`;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * EXPORTAR INFORME DE CONCEJALÍA O GENERAL A PDF (IMPRIMIBLE OFICIAL A4 PORTRAIT)
 */
export const exportConcejaliaReportToPDF = (concejaliaName: string, projects: Project[], allTasks: Tarea[]) => {
  const totalProjects = projects.length;
  const totalTasks = allTasks.filter(t => projects.some(p => p.id === t.projectId)).length;
  const completedTasks = allTasks.filter(t => projects.some(p => p.id === t.projectId) && (t.completada || t.status === 'completed')).length;
  const globalPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const printDate = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Informe Consolidado - ${concejaliaName || 'Todas las Concejalías'}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        @page {
          size: A4 portrait;
          margin: 10mm 12mm 12mm 12mm;
        }
        * {
          box-sizing: border-box;
        }
        body {
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          color: #0f172a;
          margin: 0;
          padding: 0;
          background: #ffffff;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #4f46e5;
          padding-bottom: 10px;
          margin-bottom: 14px;
        }
        .title {
          font-size: 18px;
          font-weight: 800;
          color: #1e1b4b;
          margin: 0 0 4px 0;
          line-height: 1.2;
        }
        .meta-info {
          font-size: 11px;
          color: #475569;
        }
        .summary-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 10px 14px;
          margin-bottom: 14px;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }
        .metric-title {
          font-size: 9px;
          text-transform: uppercase;
          font-weight: 700;
          color: #64748b;
          margin-bottom: 2px;
          letter-spacing: 0.3px;
        }
        .metric-value {
          font-size: 14px;
          font-weight: 800;
          color: #0f172a;
        }
        .progress-bar-bg {
          background: #cbd5e1;
          height: 6px;
          border-radius: 3px;
          overflow: hidden;
          margin-top: 4px;
        }
        .progress-bar-fill {
          background: #4f46e5;
          height: 100%;
        }
        .section-title {
          font-size: 13px;
          font-weight: 800;
          color: #1e1b4b;
          margin: 0 0 8px 0;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 4px;
        }
        th {
          background: #f1f5f9;
          text-align: left;
          padding: 6px 10px;
          font-size: 10px;
          font-weight: 800;
          color: #334155;
          border-bottom: 2px solid #cbd5e1;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        td {
          padding: 7px 10px;
          font-size: 11px;
          border-bottom: 1px solid #e2e8f0;
          vertical-align: middle;
        }
        tr:nth-child(even) td {
          background: #f8fafc;
        }
        .code-badge {
          display: inline-block;
          background: #e0e7ff;
          color: #3730a3;
          font-weight: 800;
          font-family: monospace;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
        }
        .footer {
          margin-top: 20px;
          padding-top: 8px;
          border-top: 1px solid #e2e8f0;
          font-size: 10px;
          color: #94a3b8;
          display: flex;
          justify-content: space-between;
        }
        @media print {
          body { margin: 0; padding: 0; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1 class="title">🏛️ Informe Municipal de Concejalía</h1>
          <div class="meta-info">
            <strong>Área Municipal:</strong> ${concejaliaName === 'ALL' || !concejaliaName ? 'Todas las Concejalías' : concejaliaName}
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 10px; font-weight: 800; color: #4f46e5; letter-spacing: 0.5px;">ADMINISTRACIÓN MUNICIPAL</div>
          <div style="font-size: 10px; color: #64748b; margin-top: 2px;">Fecha: ${printDate}</div>
        </div>
      </div>

      <div class="summary-card">
        <div>
          <div class="metric-title">Expedientes Activos</div>
          <div class="metric-value">${totalProjects} expedientes</div>
        </div>
        <div>
          <div class="metric-title">Volumen Trámites</div>
          <div class="metric-value">${totalTasks} tareas</div>
        </div>
        <div>
          <div class="metric-title">Trámites Completados</div>
          <div class="metric-value" style="color: #166534;">${completedTasks} completadas</div>
        </div>
        <div>
          <div class="metric-title">Tasa Global Resolución</div>
          <div class="metric-value">${globalPercent}%</div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width: ${globalPercent}%;"></div>
          </div>
        </div>
      </div>

      <h2 class="section-title">📜 Desglose de Expedientes y Progreso</h2>
      <table>
        <thead>
          <tr>
            <th style="width: 15%;">Código EXP</th>
            <th style="width: 35%;">Nombre del Expediente</th>
            <th style="width: 20%;">Concejalía</th>
            <th style="width: 15%;">Progreso Tareas</th>
            <th style="width: 15%;">Estado</th>
          </tr>
        </thead>
        <tbody>
          ${projects.length === 0 ? `<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding:15px;">No se encontraron expedientes para este informe.</td></tr>` : ''}
          ${projects.map(p => {
            const pTasks = allTasks.filter(t => t.projectId === p.id);
            const pCompleted = pTasks.filter(t => t.completada || t.status === 'completed').length;
            const pPercent = pTasks.length > 0 ? Math.round((pCompleted / pTasks.length) * 100) : 0;

            return `
              <tr>
                <td><span class="code-badge">${p.expedientCode || 'N/A'}</span></td>
                <td><strong>${p.name}</strong></td>
                <td>${p.concejalia || 'General'}</td>
                <td>
                  <div>${pCompleted}/${pTasks.length} (${pPercent}%)</div>
                  <div class="progress-bar-bg" style="height:4px;">
                    <div class="progress-bar-fill" style="width:${pPercent}%;"></div>
                  </div>
                </td>
                <td>${translateStatus(p.status)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>

      <div class="footer">
        <div>Sistema Municipal de Gestión de Expedientes y Productividad</div>
        <div>Página 1</div>
      </div>

      <script>
        window.onload = function() {
          window.print();
        };
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(htmlContent);
  printWindow.document.close();
};
