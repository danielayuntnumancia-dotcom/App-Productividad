import { Tarea, Project } from '../types';

const STORAGE_KEY = 'focusflow_gemini_api_key';

export function getStoredApiKey(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved.trim()) return saved.trim();
  }
  return import.meta.env.VITE_GEMINI_API_KEY || '';
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

const SYSTEM_INSTRUCTION = `Eres el "Asistente Inteligente de FocusFlow", un copiloto experto en Productividad y Gestión Pública Municipal en España.
Tu función es ayudar a los responsables municipales y funcionarios a:
1. Redactar borradores formales y rigurosos de:
   - Memorias Justificativas de Contratos Menores (motivando la necesidad, el objeto, el precio de mercado y la no fragmentación del contrato según la Ley 9/2017 de Contratos del Sector Público - LCSP).
   - Providencias de inicio de expediente, pliegos de prescripciones técnicas y requerimientos de subsanación de documentación.
   - Decretos y propuestas de resolución.
   - Correos formales e internos para agilizar trámites con departamentos (Intervención, Tesorería, Secretaría General, Plataforma Gestiona, proveedores externos).
2. Desglosar necesidades o proyectos municipales en una lista ordenada de tareas y trámites secuenciales con tiempos estimados (ej: 1. Presupuestos, 2. Declaración responsable, 3. Certificado AEAT, 4. Certificado TGSS, 5. Contrato menor, 6. Firma en Gestiona).
3. Asesorar sobre plazos administrativos, cómputo de días hábiles/naturales y silencio administrativo.

Estilo de respuesta:
- Profesional, riguroso, claro y perfectamente estructurado con títulos en negrita y viñetas.
- Cuando redactes un documento o borrador, entrégalo en un formato listo para copiar y pegar directamente en Word o en el gestor de expedientes (Gestiona).
- Sé conciso y directo, evitando rodeos innecesarios.`;

export async function askGemini(
  prompt: string,
  history: ChatMessage[] = [],
  contextData?: { tasks?: Tarea[]; projects?: Project[] }
): Promise<string> {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    throw new Error("No se ha configurado ninguna clave de API de Gemini. Por favor, introduce tu clave en el panel de ajustes del asistente (⚙️).");
  }

  // Enriquecer el prompt con contexto si está disponible
  let contextualizedPrompt = prompt;
  if (contextData && (contextData.tasks?.length || contextData.projects?.length)) {
    const summaryContext: string[] = [];
    if (contextData.projects?.length) {
      summaryContext.push(`Expedientes activos del usuario (${contextData.projects.length}): ${contextData.projects.slice(0, 8).map(p => `${p.name} [${p.concejalia || 'General'}]`).join(', ')}`);
    }
    if (contextData.tasks?.length) {
      const pendingTasks = contextData.tasks.filter(t => !t.completada && t.status !== 'completed').slice(0, 10);
      summaryContext.push(`Algunas tareas pendientes actuales (${pendingTasks.length}): ${pendingTasks.map(t => t.titulo || t.title).join(', ')}`);
    }
    if (summaryContext.length > 0) {
      contextualizedPrompt = `[Contexto actual del usuario en FocusFlow:\n${summaryContext.join('\n')}]\n\nSolicitud del usuario:\n${prompt}`;
    }
  }

  // Construir historial válido para la API de Gemini:
  // 1. Descartar cualquier mensaje de bienvenida inicial con rol 'model' para que comience en 'user'
  const validHistory = history.filter((msg, idx) => {
    // Si el primer mensaje es del modelo (bienvenida), omitirlo
    if (idx === 0 && msg.role === 'model') return false;
    return true;
  });

  const formattedContents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

  // Asegurar alternancia user -> model -> user
  for (const msg of validHistory.slice(-6)) {
    const role = msg.role === 'user' ? 'user' : 'model';
    // Evitar roles duplicados seguidos si ocurriera
    const lastRole = formattedContents[formattedContents.length - 1]?.role;
    if (lastRole === role) {
      formattedContents[formattedContents.length - 1].parts[0].text += `\n${msg.text}`;
    } else {
      formattedContents.push({
        role,
        parts: [{ text: msg.text }]
      });
    }
  }

  // Si el historial termina en user o está vacío, añadir el nuevo prompt
  const lastItem = formattedContents[formattedContents.length - 1];
  if (lastItem && lastItem.role === 'user') {
    lastItem.parts[0].text = contextualizedPrompt;
  } else {
    formattedContents.push({
      role: 'user',
      parts: [{ text: contextualizedPrompt }]
    });
  }

  const modelsToTry = ['gemini-2.0-flash', 'gemini-1.5-flash'];
  let lastError: any = null;

  for (const modelName of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: SYSTEM_INSTRUCTION }]
          },
          contents: formattedContents,
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 2048,
          }
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        const errMsg = errJson?.error?.message || `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(errMsg);
      }

      const data = await response.json();
      const generatedText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (generatedText) {
        return generatedText.trim();
      }
    } catch (err: any) {
      console.warn(`Error al consultar ${modelName}:`, err?.message);
      lastError = err;
    }
  }

  throw lastError || new Error("No se pudo obtener respuesta del modelo de IA.");
}
