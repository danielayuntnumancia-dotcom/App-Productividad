import { Tarea, Project, ExpedienteTemplate } from '../types';

const STORAGE_KEY = 'focusflow_ai_api_key';
const STORAGE_KEY_LEGACY = 'focusflow_gemini_api_key';

export function getStoredApiKey(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved.trim()) return saved.trim();
    const legacy = localStorage.getItem(STORAGE_KEY_LEGACY);
    if (legacy && legacy.trim() && legacy.trim().startsWith('gsk_')) {
      localStorage.setItem(STORAGE_KEY, legacy.trim());
      localStorage.removeItem(STORAGE_KEY_LEGACY);
      return legacy.trim();
    }
  }
  return import.meta.env.VITE_GROQ_API_KEY || '';
}

export function saveStoredApiKey(key: string): void {
  if (typeof window !== 'undefined') {
    if (key.trim()) {
      localStorage.setItem(STORAGE_KEY, key.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
}

export function hasApiKey(): boolean {
  return Boolean(getStoredApiKey());
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp?: number;
}

export interface AppContextData {
  tasks?: Tarea[];
  projects?: Project[];
  templates?: ExpedienteTemplate[];
  concejalias?: string[];
}

const SYSTEM_INSTRUCTION = `Eres el "Asistente Inteligente y Cerebro de FocusFlow", el copiloto oficial de Productividad, Gestión Administrativa y Contratación Pública Municipal en España.

TU CONOCIMIENTO Y ACCESO A DATOS EN VIVO:
Dispones del GRAFO COMPLETO DE CONOCIMIENTO de la aplicación actualizado en tiempo real, estructurado en:
1. MACRO-EXPEDIENTES: Grandes proyectos superiores (ej. Fiestas, Obras Plurianuales) que agrupan sub-expedientes o contratos menores hijos.
2. EXPEDIENTES Y CONTRATOS MENORES: Cada procedimiento administrativo, con sus datos, concejalía y desglose exacto de pasos 1 al N.
3. TRÁMITES SECUENCIALES: El estado exacto de CADA PASO (completado ✓, pendiente ⏳, retenido ⚠️) y el paso activo actual.
4. PLANTILLAS DE TRAMITACIÓN: Los procedimientos y tareas predefinidas estándar de la aplicación.
5. TAREAS INDIVIDUALES Y CONCEJALÍAS.

INSTRUCCIONES PARA RESPONDER CONSULTAS DEL USUARIO CON MÁXIMA EXACTITUD:
- RAZONAMIENTO JERÁRQUICO Y MATRICIAL:
  * Cuando te pregunten sobre un Macro-Expediente (ej. "¿Del macro expediente 'Fiestas septiembre 2026', qué expedientes tienen completados los pasos 1 al 6 y pendientes el 7 y 8?"):
    1. Localiza el Macro-Expediente indicado en la sección de Macro-Expedientes.
    2. Examina TODOS sus sub-expedientes vinculados (ej. VULKANO, CHARANGA, MAKRO 19 SÁBADO, BUEYES, etc.).
    3. Para cada sub-expediente, verifica el estado de cada paso del 1 al N.
    4. Responde con la lista EXACTA de sub-expedientes que cumplen la condición, detallando el estado de sus pasos (por ejemplo, mostrando que VULKANO tiene los pasos 1..6 completados y los pasos 7 y 8 pendientes).
  * Cuando te pregunten por el estado de un expediente: Explica los pasos completados, el paso actual pendiente y los pasos futuros.
  * Cuando te pregunten por plantillas o trámites estándar: Consulta la sección de Plantillas para explicar los trámites predefinidos.
  * Cuando te pidan redactar memorias, providencias o correos: Utiliza la normativa española (Ley 9/2017 LCSP, Ley 39/2015 LPAC) con formato formal listo para copiar y pegar.

ESTILO DE RESPUESTA:
- Confiable, analítico, estructurado y directo al grano.
- Utiliza tablas comparativas, listas con viñetas y emojis funcionales (🏛️, 📁, ✅, ⏳, 👉, ⚠️).
- Responde siempre en español.`;

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODELS = [
  'openai/gpt-oss-120b',   // GPT-OSS 120B — Máxima inteligencia y razonamiento profundo en Groq
  'groq/compound',         // Groq Compound — Motor estrella de Groq
  'qwen/qwen3.6-27b',      // Qwen 3.6 27B — Rápido y altamente capaz
  'groq/compound-mini',    // Groq Compound Mini — Respuesta instantánea
  'openai/gpt-oss-20b',    // GPT-OSS 20B — Respaldo ligero
];

/**
 * Extrae y limpia el número de paso secuencial y el título del trámite.
 */
function parseStepInfo(task: Tarea, fallbackIndex: number): { stepNumber: number; cleanTitle: string } {
  const rawTitle = (task.titulo || task.title || '').trim();

  let stepNumber: number | null = typeof task.orderIndex === 'number' && !isNaN(task.orderIndex) && task.orderIndex > 0 
    ? task.orderIndex 
    : null;

  const match = rawTitle.match(/^\s*\(?(\d+)\)?[\.\s\-\)]+/);
  if (match) {
    const parsed = parseInt(match[1], 10);
    if (!isNaN(parsed) && parsed > 0) {
      if (stepNumber === null) stepNumber = parsed;
    }
  }

  if (stepNumber === null) {
    stepNumber = fallbackIndex + 1;
  }

  let cleanTitle = rawTitle
    .replace(/^\s*(\(?\d+\)?[\.\s\-\)]+)+/g, '')
    .replace(/^\s*[\-\–\—\•\*]\s*/, '')
    .trim();

  if (task.projectName && cleanTitle.toLowerCase().endsWith(task.projectName.toLowerCase())) {
    cleanTitle = cleanTitle.slice(0, -task.projectName.length).replace(/[\s\-\–\—]+$/, '').trim();
  }

  return {
    stepNumber,
    cleanTitle: cleanTitle || rawTitle || `Trámite ${fallbackIndex + 1}`
  };
}

/**
 * Genera el Grafo de Conocimiento Ontológico Completo de la aplicación en vivo.
 */
export function buildAppKnowledgeGraph(data?: AppContextData): string {
  if (!data) return '';
  const { tasks = [], projects = [], templates = [], concejalias = [] } = data;
  if (!tasks.length && !projects.length && !templates.length) return '';

  const projectsMap: Map<string, Project> = new Map();
  const projectsByName: Map<string, Project> = new Map();

  projects.forEach((p) => {
    const pName = (p.name || (p as any).projectName || '').trim();
    if (p.id) projectsMap.set(p.id, p);
    if (p.firestoreDocId) projectsMap.set(p.firestoreDocId, p);
    if (pName) projectsByName.set(pName.toLowerCase(), p);
  });

  interface ExpedientItem {
    id: string;
    name: string;
    code: string;
    concejalia: string;
    type: string;
    isMacroProject: boolean;
    isContratoMenor: boolean;
    parentProjectId?: string;
    parentProjectName?: string;
    tasks: Tarea[];
  }

  const expedientNodes: Map<string, ExpedientItem> = new Map();
  const orphanTasks: Tarea[] = [];

  // 1. Registrar proyectos explícitos
  projects.forEach((p) => {
    const key = p.id || p.firestoreDocId || p.name || (p as any).projectName;
    if (key) {
      const pName = (p.name || (p as any).projectName || 'Expediente').trim();
      expedientNodes.set(key, {
        id: key,
        name: pName,
        code: p.expedientCode || '',
        concejalia: p.concejalia || (p as any).projectConcejalia || 'General',
        type: p.type || (p.isContratoMenor ? 'contrato_menor' : 'expediente'),
        isMacroProject: Boolean(p.isMacroProject || p.type === 'macro_expediente'),
        isContratoMenor: Boolean(p.isContratoMenor || p.type === 'contrato_menor'),
        parentProjectId: p.parentProjectId,
        parentProjectName: p.parentProjectName,
        tasks: []
      });
    }
  });

  // 2. Asignar tareas a sus proyectos o registrar proyectos implícitos
  tasks.forEach((t) => {
    let matchedNodeKey: string | null = null;

    if (t.projectId && expedientNodes.has(t.projectId)) {
      matchedNodeKey = t.projectId;
    } else if (t.parentProjectId && expedientNodes.has(t.parentProjectId) && !t.projectName) {
      matchedNodeKey = t.parentProjectId;
    } else if (t.projectName && projectsByName.has(t.projectName.trim().toLowerCase())) {
      const proj = projectsByName.get(t.projectName.trim().toLowerCase());
      matchedNodeKey = proj?.id || proj?.firestoreDocId || proj?.name || (proj as any)?.projectName || null;
    } else if (t.projectId || t.projectName) {
      matchedNodeKey = t.projectId || t.projectName || 'Desconocido';
      if (!expedientNodes.has(matchedNodeKey)) {
        const pName = (t.projectName || t.projectId || 'Expediente').trim();
        expedientNodes.set(matchedNodeKey, {
          id: matchedNodeKey,
          name: pName,
          code: t.expedientCode || '',
          concejalia: t.concejalia || t.projectConcejalia || t.projectMasterCategory || 'General',
          type: (t as any).isContratoMenor ? 'contrato_menor' : 'expediente',
          isMacroProject: false,
          isContratoMenor: Boolean((t as any).isContratoMenor),
          parentProjectId: t.parentProjectId,
          parentProjectName: t.parentProjectName,
          tasks: []
        });
      }
    }

    if (matchedNodeKey && expedientNodes.has(matchedNodeKey)) {
      const node = expedientNodes.get(matchedNodeKey)!;
      node.tasks.push(t);
      if (!node.parentProjectName && t.parentProjectName) node.parentProjectName = t.parentProjectName;
      if (!node.parentProjectId && t.parentProjectId) node.parentProjectId = t.parentProjectId;
      if (t.isContratoMenor) node.isContratoMenor = true;
    } else {
      orphanTasks.push(t);
    }
  });

  // 3. Organizar Macro-Expedientes vs Sub-Expedientes vs Independientes
  const macroProjects: ExpedientItem[] = [];
  const subExpedientsByMacro: Map<string, ExpedientItem[]> = new Map();
  const independentExpedients: ExpedientItem[] = [];

  expedientNodes.forEach((node) => {
    if (node.isMacroProject) {
      macroProjects.push(node);
      if (!subExpedientsByMacro.has(node.id)) subExpedientsByMacro.set(node.id, []);
      if (node.name && !subExpedientsByMacro.has(node.name.toLowerCase())) {
        subExpedientsByMacro.set(node.name.toLowerCase(), []);
      }
    }
  });

  expedientNodes.forEach((node) => {
    if (node.isMacroProject) return;

    const parentKey = node.parentProjectId || (node.parentProjectName ? node.parentProjectName.toLowerCase() : null);
    
    if (parentKey && subExpedientsByMacro.has(parentKey)) {
      subExpedientsByMacro.get(parentKey)!.push(node);
    } else if (node.parentProjectName) {
      const syntheticMacroKey = node.parentProjectName.toLowerCase();
      if (!subExpedientsByMacro.has(syntheticMacroKey)) {
        subExpedientsByMacro.set(syntheticMacroKey, []);
        macroProjects.push({
          id: node.parentProjectId || `macro_${syntheticMacroKey}`,
          name: node.parentProjectName,
          code: '',
          concejalia: node.concejalia,
          type: 'macro_expediente',
          isMacroProject: true,
          isContratoMenor: false,
          tasks: []
        });
      }
      subExpedientsByMacro.get(syntheticMacroKey)!.push(node);
    } else {
      independentExpedients.push(node);
    }
  });

  // Helper para serializar un expediente en 1 sola línea ultra-densa y precisa
  const formatExpedientCompact = (exp: ExpedientItem, prefix: string = '  '): string => {
    const rawTasks = exp.tasks;
    const parsedSteps = rawTasks.map((t, idx) => {
      const { stepNumber, cleanTitle } = parseStepInfo(t, idx);
      const isCompleted = t.status === 'completed' || Boolean(t.completada) || Boolean((t as any).completed);
      const isBlocked = t.status === 'waiting_on_third_party' || Boolean(t.blockedBy);
      return {
        stepNumber,
        cleanTitle,
        isCompleted,
        isBlocked,
        blockedBy: t.blockedBy || ''
      };
    });

    parsedSteps.sort((a, b) => a.stepNumber - b.stepNumber);

    const totalSteps = parsedSteps.length;
    const completedSteps = parsedSteps.filter((s) => s.isCompleted);
    const pendingSteps = parsedSteps.filter((s) => !s.isCompleted);
    const completedStepNumbers = completedSteps.map((s) => s.stepNumber);
    const pendingStepNumbers = pendingSteps.map((s) => s.stepNumber);
    const activeNextStep = pendingSteps.length > 0 ? pendingSteps[0] : null;

    let out = `${prefix}* "${exp.name}" [${exp.isContratoMenor ? 'CM' : exp.type}|${exp.concejalia}${exp.code ? `|${exp.code}` : ''}]: `;
    
    if (totalSteps === 0) {
      out += `(Sin pasos registrados)\n`;
    } else {
      const stepBadges = parsedSteps.map((s) => {
        const icon = s.isCompleted ? '✓' : (s.isBlocked ? `⚠️[${s.blockedBy}]` : '⏳');
        return `P${s.stepNumber}(${icon}:${s.cleanTitle})`;
      });
      const has1to6Done = [1, 2, 3, 4, 5, 6].every((num) => completedStepNumbers.includes(num));
      const has7and8Pending = pendingStepNumbers.includes(7) || pendingStepNumbers.includes(8);
      const activeText = activeNextStep ? `P${activeNextStep.stepNumber} ("${activeNextStep.cleanTitle}")` : '100%✓';
      
      out += `${stepBadges.join(' | ')} -> [Completados:${completedStepNumbers.join(',') || 'ninguno'}] [Pendientes:${pendingStepNumbers.join(',') || 'ninguno'}] [Activo:${activeText}] [¿P1-6✓ y P7-8⏳?: ${has1to6Done && has7and8Pending ? 'SÍ' : 'NO'}]\n`;
    }

    return out;
  };

  const sections: string[] = [];

  // SECCIÓN 1: MACRO-EXPEDIENTES Y SUB-EXPEDIENTES
  if (macroProjects.length > 0) {
    const macroBlocks: string[] = [];
    macroProjects.forEach((macro) => {
      const subExps = subExpedientsByMacro.get(macro.id) || subExpedientsByMacro.get(macro.name.toLowerCase()) || [];
      let mText = `🏛️ MACRO-EXPEDIENTE "${macro.name}" [${macro.concejalia}${macro.code ? ` | ${macro.code}` : ''} | ${subExps.length} Sub-Expedientes]:\n`;
      if (subExps.length === 0) {
        mText += `  (Sin sub-expedientes vinculados)\n`;
      } else {
        mText += subExps.map((sub) => formatExpedientCompact(sub, '    ')).join('');
      }
      macroBlocks.push(mText);
    });

    sections.push(
      `==================================================\n` +
      `📂 1. MACRO-EXPEDIENTES Y SUB-EXPEDIENTES VINCULADOS\n` +
      `==================================================\n` +
      macroBlocks.join('\n')
    );
  }

  // SECCIÓN 2: EXPEDIENTES INDEPENDIENTES (Priorizar activos)
  if (independentExpedients.length > 0) {
    const activeIndeps = independentExpedients.filter((e) => e.tasks.some((t) => !t.completada && t.status !== 'completed')).slice(0, 12);
    const indepToRender = activeIndeps.length > 0 ? activeIndeps : independentExpedients.slice(0, 8);
    const indepBlocks = indepToRender.map((exp) => formatExpedientCompact(exp, '  '));
    sections.push(
      `==================================================\n` +
      `📁 2. EXPEDIENTES INDEPENDIENTES ACTIVOS\n` +
      `==================================================\n` +
      indepBlocks.join('')
    );
  }

  // SECCIÓN 3: TAREAS INDIVIDUALES SUELTAS (Solo top 6)
  if (orphanTasks.length > 0) {
    const pendingOrphans = orphanTasks.filter((t) => t.status !== 'completed' && !t.completada && !(t as any).completed);
    if (pendingOrphans.length > 0) {
      const orphanLines = pendingOrphans.slice(0, 6).map((t) => {
        const title = (t.titulo || t.title || 'Tarea').trim();
        const concejalia = t.concejalia ? ` [${t.concejalia}]` : '';
        const blocked = t.status === 'waiting_on_third_party' ? ` ⚠️ Retenido: ${t.blockedBy || 'Tercero'}` : '';
        return `- ${title}${concejalia}${blocked}`;
      });
      sections.push(
        `==================================================\n` +
        `📌 3. TAREAS SUELTAS PENDIENTES (${pendingOrphans.length})\n` +
        `==================================================\n` +
        orphanLines.join('\n')
      );
    }
  }

  // SECCIÓN 4: CATÁLOGO DE PLANTILLAS
  if (templates.length > 0) {
    const tplNames = templates.map((tpl) => `"${tpl.name}" (${tpl.tasks?.length || 0} pasos)`).join(', ');
    sections.push(`📋 PLANTILLAS DISPONIBLES: ${tplNames}`);
  }

  // SECCIÓN 5: CONCEJALÍAS ACTIVAS
  if (concejalias.length > 0) {
    sections.push(`🏢 CONCEJALÍAS: ${concejalias.join(', ')}`);
  }

  const rawGraph = sections.join('\n\n');
  // Blindaje estricto: máximo 5.500 caracteres (~1.300 tokens)
  return rawGraph.length > 5500 ? rawGraph.slice(0, 5500) + '\n...(contexto truncado por límite)' : rawGraph;
}

export async function askGemini(
  prompt: string,
  history: ChatMessage[] = [],
  contextData?: AppContextData
): Promise<string> {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    throw new Error("No se ha configurado ninguna clave de API. Por favor, introduce tu clave de Groq en el panel de ajustes del asistente (⚙️).");
  }

  let contextualizedPrompt = prompt;
  if (contextData) {
    const fullGraph = buildAppKnowledgeGraph(contextData);
    if (fullGraph) {
      contextualizedPrompt = `[BASE DE CONOCIMIENTO Y GRAFO DE DATOS DE FOCUSFLOW EN TIEMPO REAL]\n${fullGraph}\n\n[CONSULTA DEL USUARIO]:\n${prompt}`;
    }
  }

  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: SYSTEM_INSTRUCTION }
  ];

  const validHistory = history.filter((msg, idx) => {
    if (idx === 0 && msg.role === 'model') return false;
    return true;
  });

  // Poda estricta de historial: último mensaje previo truncado a 200 caracteres
  for (const msg of validHistory.slice(-1)) {
    const truncatedText = msg.text.length > 200 ? msg.text.slice(0, 200) + '...' : msg.text;
    messages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: truncatedText
    });
  }

  messages.push({ role: 'user', content: contextualizedPrompt });

  let lastError: any = null;

  for (const model of GROQ_MODELS) {
    try {
      const response = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.2,
          max_tokens: 800,
          stream: false
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        const errMsg = errJson?.error?.message || `HTTP ${response.status}`;
        console.warn(`Fallo con modelo ${model}: ${errMsg}`);
        lastError = new Error(`[${model}] ${errMsg}`);
        if (response.status === 401 || response.status === 403) break;
        continue;
      }

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content;
      if (text) return text.trim();

    } catch (err: any) {
      console.warn(`Error con ${model}:`, err?.message);
      lastError = err;
    }
  }

  const errMsg = lastError?.message || 'Error desconocido';
  if (errMsg.includes('invalid_api_key') || errMsg.includes('Invalid API Key') || errMsg.includes('401') || errMsg.includes('unauthorized')) {
    throw new Error(`❌ Clave no válida. Asegúrate de que:\n1. La clave empieza por "gsk_"\n2. La has copiado completa sin espacios\n3. Tienes conexión a internet\n\nDetalle técnico: ${errMsg}`);
  }
  throw new Error(`Error Groq: ${errMsg}`);
}
