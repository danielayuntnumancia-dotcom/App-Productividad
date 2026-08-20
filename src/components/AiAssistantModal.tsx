import React, { useState, useRef, useEffect } from 'react';
import { askGemini, ChatMessage, getStoredApiKey, saveStoredApiKey } from '../services/geminiService';
import { Tarea, Project } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  tasks?: Tarea[];
  projects?: Project[];
}

const QUICK_PROMPTS = [
  {
    icon: '✍️',
    label: 'Memoria Contrato Menor',
    prompt: 'Redacta un modelo completo de Memoria Justificativa para un Contrato Menor municipal (Ley 9/2017 LCSP), motivando la necesidad, el objeto, que no se fracciona el objeto del contrato y el precio estimado.'
  },
  {
    icon: '📋',
    label: 'Desglosar Trámites Expediente',
    prompt: 'Desglosa los trámites preceptivos y tareas secuenciales (con tiempos estimados en minutos) para gestionar un nuevo contrato menor de servicios/obras en un Ayuntamiento.'
  },
  {
    icon: '✉️',
    label: 'Correo Formal a Intervención',
    prompt: 'Redacta un correo electrónico formal y educado para solicitar a Intervención/Secretaría agilizar la fiscalización y firma de un expediente en la plataforma Gestiona.'
  },
  {
    icon: '⏱️',
    label: 'Plazos y Silencio Administrativo',
    prompt: 'Explica de forma concisa cómo funciona el cómputo de plazos en días hábiles según la Ley 39/2015 y qué efectos tiene el silencio administrativo en procedimientos municipales.'
  }
];

export default function AiAssistantModal({ isOpen, onClose, tasks = [], projects = [] }: Props) {
  if (!isOpen) return null;

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'model',
      text: '¡Hola! Soy tu **Asistente Inteligente de FocusFlow** (motor Groq AI). Puedo ayudarte a redactar memorias justificativas de contratos menores, desglosar trámites de expedientes, redactar comunicaciones formales o asesorarte con plazos administrativos. ¿En qué te ayudo hoy?'
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [customKeyInput, setCustomKeyInput] = useState(getStoredApiKey());
  const [copyFeedbackIdx, setCopyFeedbackIdx] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = { role: 'user', text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInputText('');
    setIsLoading(true);

    try {
      const responseText = await askGemini(text, messages, { tasks, projects });
      setMessages([...updatedMessages, { role: 'model', text: responseText }]);
    } catch (err: any) {
      console.error("Error from Gemini Assistant:", err);
      const errMsg = err?.message || 'Ha ocurrido un error al conectar con el asistente de IA.';
      setMessages([
        ...updatedMessages,
        {
          role: 'model',
          text: `⚠️ **Error:** ${errMsg}\n\n*Consejo: Comprueba tu clave de API en los ajustes (⚙️).*`
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveKey = () => {
    saveStoredApiKey(customKeyInput);
    setShowSettings(false);
    alert("Clave de API guardada correctamente.");
  };

  const handleCopyText = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopyFeedbackIdx(idx);
    setTimeout(() => setCopyFeedbackIdx(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-6 bg-slate-900/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-3xl h-[85vh] max-h-[750px] shadow-2xl flex flex-col overflow-hidden animate-fade-in-up">
        
        {/* HEADER */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 via-blue-500 to-cyan-400 p-0.5 shadow-md flex items-center justify-center text-white text-lg">
              🤖
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-base sm:text-lg">
                  Asistente FocusFlow
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-xs">
                  Groq AI
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                Copiloto de productividad y gestión administrativa municipal
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                showSettings
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
              title="Ajustes de clave API"
            >
              ⚙️ Clave API
            </button>
            <button
              type="button"
              onClick={() => {
                setMessages([
                  {
                    role: 'model',
                    text: 'Conversación reiniciada. ¿En qué puedo ayudarte ahora?'
                  }
                ]);
              }}
              className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              title="Limpiar conversación"
            >
              🗑️
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-xl transition-colors cursor-pointer text-base font-bold ml-1"
              title="Cerrar asistente"
            >
              ✕
            </button>
          </div>
        </div>

        {/* PANEL DE AJUSTES DE CLAVE API */}
        {showSettings && (
          <div className="p-4 bg-indigo-50/90 dark:bg-indigo-950/40 border-b border-indigo-200 dark:border-indigo-800 space-y-2.5 animate-fade-in shrink-0">
            <div className="flex items-center justify-between">
              <span className="w-full text-[11px] font-bold text-orange-900 dark:text-orange-200 flex items-center gap-1.5">
                ⚙️ Clave Groq: Configuración de Clave API
              </span>
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-bold text-orange-600 dark:text-orange-400 hover:underline whitespace-nowrap"
              >
                Obtener clave gratis en Groq ↗
              </a>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={customKeyInput}
                onChange={(e) => setCustomKeyInput(e.target.value)}
                placeholder="Pega tu clave de Groq (gsk_...)..."
                className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-orange-200 dark:border-orange-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 font-mono outline-none"
              />
              <button
                type="button"
                onClick={handleSaveKey}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer"
              >
                Guardar
              </button>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              La clave se almacena de forma segura en tu navegador y no se comparte con terceros.
            </p>
          </div>
        )}

        {/* CUERPO DEL CHAT */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          
          {/* BOTONES DE ACCIÓN RÁPIDA */}
          <div className="space-y-1.5 pb-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Atajos y Redacción Rápida:
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {QUICK_PROMPTS.map((qp, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSendMessage(qp.prompt)}
                  className="p-2.5 bg-slate-50 dark:bg-slate-800/70 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-slate-200 dark:border-slate-700/80 hover:border-indigo-400 rounded-2xl text-left transition-all cursor-pointer group"
                >
                  <span className="text-base block mb-0.5">{qp.icon}</span>
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 line-clamp-2 leading-tight">
                    {qp.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* LISTADO DE MENSAJES */}
          {messages.map((msg, idx) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={idx}
                className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 text-white flex items-center justify-center shrink-0 text-sm shadow-xs mt-1">
                    🤖
                  </div>
                )}

                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-3xl p-4 sm:p-5 text-xs sm:text-sm leading-relaxed space-y-2 shadow-xs ${
                    isUser
                      ? 'bg-indigo-600 text-white rounded-br-xs font-medium'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-bl-xs border border-slate-200/80 dark:border-slate-700/80'
                  }`}
                >
                  {/* Formato de texto con párrafos y saltos de línea */}
                  <div className="whitespace-pre-wrap font-sans">
                    {msg.text}
                  </div>

                  {/* Botón copiar para respuestas del modelo */}
                  {!isUser && (
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleCopyText(msg.text, idx)}
                        className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer border border-slate-200 dark:border-slate-600"
                        title="Copiar texto para pegar en Word, Gestiona o Correo"
                      >
                        <span>{copyFeedbackIdx === idx ? '✓ ¡Copiado!' : '📋 Copiar Texto'}</span>
                      </button>
                    </div>
                  )}
                </div>

                {isUser && (
                  <div className="w-8 h-8 rounded-xl bg-slate-800 text-white flex items-center justify-center shrink-0 text-sm shadow-xs mt-1">
                    👤
                  </div>
                )}
              </div>
            );
          })}

          {/* INDICADOR DE CARGA */}
          {isLoading && (
            <div className="flex gap-3 justify-start items-center">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 text-white flex items-center justify-center shrink-0 text-sm shadow-xs animate-spin">
                🤖
              </div>
              <div className="p-3.5 bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                <span>Pensando y redactando respuesta...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* INPUT FOOTER */}
        <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Pregunta o pide redactar algo a FocusFlow AI (ej. 'Redactar providencia de inicio para...')..."
              disabled={isLoading}
              className="flex-1 px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            />
            <button
              type="submit"
              disabled={isLoading || !inputText.trim()}
              className="px-5 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-extrabold text-xs sm:text-sm rounded-2xl shadow-md transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shrink-0"
            >
              <span>Enviar</span> <span>🚀</span>
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
