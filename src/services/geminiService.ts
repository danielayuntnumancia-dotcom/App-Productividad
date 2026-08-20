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
2. Desglosar necesidades o proyectos municipales en una lista ordenada de tareas y trámites secuenciales con tiempos estimados.
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
      summaryContext.push(`Expedientes activos del usuario: ${contextData.projects.slice(0, 8).map(p => p.name).join(', ')}`);
    }
    if (contextData.tasks?.length) {
      const pendingTasks = contextData.tasks.filter(t => !t.completada && t.status !== 'completed').slice(0, 8);
      if (pendingTasks.length > 0) {
        summaryContext.push(`Tareas pendientes: ${pendingTasks.map(t => t.titulo || t.title).join(', ')}`);
      }
    }
    if (summaryContext.length > 0) {
      contextualizedPrompt = `[Contexto: ${summaryContext.join('. ')}]\n\n${prompt}`;
    }
  }

  // Construir historial válido: debe empezar siempre por 'user', alternando user/model
  const validHistory = history.filter((msg, idx) => {
    if (idx === 0 && msg.role === 'model') return false; // Descartar bienvenida inicial
    return true;
  });

  const formattedContents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

  for (const msg of validHistory.slice(-6)) {
    const role = msg.role === 'user' ? 'user' : 'model';
    const lastRole = formattedContents[formattedContents.length - 1]?.role;
    if (lastRole === role) {
      // Combinar mensajes consecutivos del mismo rol
      formattedContents[formattedContents.length - 1].parts[0].text += `\n${msg.text}`;
    } else {
      formattedContents.push({ role, parts: [{ text: msg.text }] });
    }
  }

  // Añadir el nuevo mensaje del usuario
  const lastItem = formattedContents[formattedContents.length - 1];
  if (lastItem && lastItem.role === 'user') {
    // Reemplazar o combinar con el último user turn
    lastItem.parts[0].text = contextualizedPrompt;
  } else {
    formattedContents.push({ role: 'user', parts: [{ text: contextualizedPrompt }] });
  }

  // Combinaciones de modelo + versión de API a intentar
  const attempts = [
    { model: 'gemini-2.0-flash',        apiVer: 'v1beta' },
    { model: 'gemini-1.5-flash',        apiVer: 'v1beta' },
    { model: 'gemini-2.0-flash',        apiVer: 'v1' },
    { model: 'gemini-1.5-flash',        apiVer: 'v1' },
    { model: 'gemini-1.5-flash-latest', apiVer: 'v1beta' },
    { model: 'gemini-pro',              apiVer: 'v1' },
  ];

  let lastError: any = null;

  for (const { model, apiVer } of attempts) {
    try {
      const url = `https://generativelanguage.googleapis.com/${apiVer}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

      const requestBody: any = {
        contents: formattedContents,
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 2048,
        }
      };

      // systemInstruction solo está disponible en v1beta
      if (apiVer === 'v1beta') {
        requestBody.systemInstruction = { parts: [{ text: SYSTEM_INSTRUCTION }] };
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        const errMsg = errJson?.error?.message || `HTTP ${response.status}`;
        console.warn(`Fallo ${apiVer}/${model}: ${errMsg}`);
        lastError = new Error(errMsg);
        continue; // Intentar siguiente combinación
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text.trim();

    } catch (err: any) {
      console.warn(`Error ${model} (${apiVer}):`, err?.message);
      lastError = err;
    }
  }

  // Mensaje de error descriptivo al usuario
  const errMsg = lastError?.message || 'Error desconocido';
  if (errMsg.includes('API_KEY_INVALID') || errMsg.includes('CONSUMER_INVALID') || errMsg.includes('permission')) {
    throw new Error("La clave de API no tiene permisos para usar Gemini. Asegúrate de que la 'Generative Language API' esté habilitada en tu proyecto de Google Cloud Console.");
  }
  throw new Error(`No se pudo conectar con el Asistente IA: ${errMsg}`);
}
