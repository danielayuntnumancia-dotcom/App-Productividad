import { GoogleGenAI } from '@google/genai';
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
      summaryContext.push(`Expedientes activos: ${contextData.projects.slice(0, 8).map(p => p.name).join(', ')}`);
    }
    if (contextData.tasks?.length) {
      const pending = contextData.tasks.filter(t => !t.completada && t.status !== 'completed').slice(0, 8);
      if (pending.length > 0) {
        summaryContext.push(`Tareas pendientes: ${pending.map(t => t.titulo || t.title).join(', ')}`);
      }
    }
    if (summaryContext.length > 0) {
      contextualizedPrompt = `[Contexto: ${summaryContext.join('. ')}]\n\n${prompt}`;
    }
  }

  try {
    // Usar el SDK oficial de Google GenAI (compatible con claves AQ.)
    const ai = new GoogleGenAI({ apiKey });

    // Construir historial de conversación excluyendo el mensaje de bienvenida inicial
    const validHistory = history.filter((msg, idx) => {
      if (idx === 0 && msg.role === 'model') return false;
      return true;
    });

    // Construir el array de contents para el SDK
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    for (const msg of validHistory.slice(-6)) {
      const role = msg.role === 'user' ? 'user' : 'model';
      const lastRole = contents[contents.length - 1]?.role;
      if (lastRole === role) {
        contents[contents.length - 1].parts[0].text += `\n${msg.text}`;
      } else {
        contents.push({ role, parts: [{ text: msg.text }] });
      }
    }

    // Añadir el nuevo mensaje del usuario
    const lastItem = contents[contents.length - 1];
    if (lastItem && lastItem.role === 'user') {
      lastItem.parts[0].text = contextualizedPrompt;
    } else {
      contents.push({ role: 'user', parts: [{ text: contextualizedPrompt }] });
    }

    const modelsToTry = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.0-flash-lite'];

    let lastErr: any = null;

    for (const modelName of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: contents as any,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            temperature: 0.4,
            maxOutputTokens: 2048,
          }
        });

        const text = response.text;
        if (text) return text.trim();

      } catch (err: any) {
        console.warn(`Error con modelo ${modelName}:`, err?.message);
        lastErr = err;
      }
    }

    throw lastErr || new Error("No se pudo obtener respuesta del asistente de IA.");

  } catch (err: any) {
    console.error("Error en askGemini:", err);
    const msg = err?.message || 'Error desconocido';
    if (msg.includes('API_KEY_INVALID') || msg.includes('CONSUMER_INVALID') || msg.includes('permission')) {
      throw new Error("La clave de API no es válida o no tiene permisos suficientes. Comprueba tu clave en los ajustes (⚙️).");
    }
    throw new Error(msg);
  }
}
