# Estado del Proyecto - FocusFlow (App de Productividad)

**Fecha de actualización:** 21 de Agosto de 2026  
**Repositorio GitHub:** `https://github.com/danielayuntnumancia-dotcom/App-Productividad.git` (Rama `main`)  
**Despliegue Firebase Hosting:** `https://app-productividad-54955.web.app`

---

## 🏆 Logros de esta sesión

### 1. Cerebro Ontológico Dinámico de FocusFlow para la IA (Groq AI)
* **Serialización Jerárquica Completa:** Se implementó `buildAppKnowledgeGraph` en `src/services/geminiService.ts`, estructurando en vivo toda la base de datos:
  * Macro-Expedientes (`isMacroProject: true`) vinculando automáticamente todos sus sub-expedientes y contratos menores hijos.
  * Desglose exacto paso a paso ($1..N$) por expediente con matrices de cumplimiento precalculadas (`¿Pasos 1-6 hechos y 7-8 pendientes?: SÍ/NO`).
  * Catálogo de plantillas oficiales de fábrica y personalizadas por el usuario.
  * Concejalías municipales activas.
* **Integración de Modelos Oficiales Activos en Groq:**
  * Motor principal: **`openai/gpt-oss-120b`** (120B parámetros, máxima capacidad de razonamiento).
  * Motores complementarios: **`groq/compound`**, **`qwen/qwen3.6-27b`**, **`groq/compound-mini`**, **`openai/gpt-oss-20b`**.
* **Blindaje Estricto de Consumo de Tokens:**
  * Compresión semántica de alta densidad (formato ultra-compacto de 1 línea por expediente).
  * Poda inteligente de historial truncando mensajes previos largos.
  * Ajuste de `max_tokens: 800` y límite máximo de carga, asegurando un consumo de ~2.000 tokens por consulta (muy por debajo del límite de 8.000 TPM de Groq Free Tier).
* **Visor Transparente en Vivo:** Botón **`🧠 Ver Cerebro`** en el modal del asistente para que el usuario pueda inspeccionar en cualquier momento qué datos exactos tiene cargados la IA.

### 2. Acceso Directo y Creación en Lote de Tareas Hijas
* **Nuevo Modal `QuickChildTasksModal.tsx`:**
  * Permite añadir múltiples trámites en lote antes de guardar los cambios.
  * Sugerencias de trámites frecuentes con 1 clic (`+ Presupuesto`, `+ Declaración Responsable`, `+ AEAT`, `+ TGSS`, `+ Memoria`, `+ RC`, `+ Firma Gestiona`, etc.).
  * Selector **«Plantilla rápida»** para volcar todos los pasos de cualquier plantilla oficial o personalizada directamente en el expediente.
  * Control total de todos los parámetros por cada trámite: Título, Concejalía, Prioridad, Tiempo estimado, Fecha límite (`CustomDatePicker`), Estado inicial, Retenido por / Motivo, Drive, Notas y ⭐ En Mi Día.
  * Auto-numeración correlativa inteligente de pasos.
  * Guardado atómico en Firestore mediante `writeBatch`.
* **Botón de Acceso Directo `➕ Trámites`:**
  * Integrado directamente en las tarjetas de **Expedientes Ordinarios**, **Sub-Expedientes de Macro-Expedientes** y **Contratos Menores**.
  * Accesible también al final de la lista de tareas dentro del expediente expandido.

### 3. Sincronización y Despliegue
* Código versionado y subido a GitHub (rama `main`).
* Desplegado con éxito y validado en Firebase Hosting.

---

## 📋 Tareas pendientes para la próxima sesión

1. **Optimizaciones del Asistente:**
   * Evaluar opciones para streaming de respuestas si se requiere sensación de inmediatez token a token.
2. **Ampliación de Plantillas Municipales:**
   * Añadir nuevas plantillas predefinidas según las necesidades de las distintas concejalías.
3. **Mantenimiento General:**
   * Monitorizar el rendimiento de Firestore y los tiempos de respuesta de la API de Groq en producción.
