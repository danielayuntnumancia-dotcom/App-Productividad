import { Tarea, Project } from '../types';

const STORAGE_KEY = 'focusflow_ai_api_key';
const STORAGE_KEY_LEGACY = 'focusflow_gemini_api_key';

export function getStoredApiKey(): string {
  if (typeof window !== 'undefined') {
    // Leer clave nueva
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved.trim()) return saved.trim();
    // Migrar clave antigua si existe (y no es una clave de Gemini AQ.)
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
- Sé conciso y directo, evitando rodeos innecesarios.
- Responde siempre en español.`;

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODELS = [
  'openai/gpt-oss-120b',   // GPT-OSS 120B — el más potente disponible
  'groq/compound',         // Groq Compound — modelo propietario Groq
  'qwen/qwen3.6-27b',      // Qwen 3.6 27B — eficiente y capaz
  'groq/compound-mini',    // Groq Compound Mini — rápido
  'openai/gpt-oss-20b',    // GPT-OSS 20B — ligero de respaldo
];

export async function askGemini(
  prompt: string,
  history: ChatMessage[] = [],
  contextData?: { tasks?: Tarea[]; projects?: Project[] }
): Promise<string> {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    throw new Error("No se ha configurado ninguna clave de API. Por favor, introduce tu clave de Groq en el panel de ajustes del asistente (⚙️).");
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
        summaryContext.push(`Tareas pendientes: ${pending.map(t => t.titulo || t.title).filter(Boolean).join(', ')}`);
      }
    }
    if (summaryContext.length > 0) {
      contextualizedPrompt = `[Contexto: ${summaryContext.join('. ')}]\n\n${prompt}`;
    }
  }

  // Construir historial de mensajes en formato OpenAI (compatible con Groq)
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: SYSTEM_INSTRUCTION }
  ];

  // Añadir historial (excluyendo mensaje de bienvenida inicial del modelo)
  const validHistory = history.filter((msg, idx) => {
    if (idx === 0 && msg.role === 'model') return false;
    return true;
  });

  for (const msg of validHistory.slice(-8)) {
    messages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.text
    });
  }

  // Añadir el nuevo prompt del usuario
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
          temperature: 0.4,
          max_tokens: 4096,
          stream: false
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        const errMsg = errJson?.error?.message || `HTTP ${response.status}`;
        console.warn(`Fallo con modelo ${model}: ${errMsg}`);
        lastError = new Error(`[${model}] ${errMsg}`);
        // Si es 401 no tiene sentido reintentar con otros modelos
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
