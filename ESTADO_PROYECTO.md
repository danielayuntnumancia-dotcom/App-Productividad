# Estado del Proyecto - App de Productividad y Gestión Municipal por Expedientes

**Última actualización:** 18 de Agosto de 2026  
**Estado:** ✅ Estable, Compilado con 0 errores, Sincronizado en GitHub y Desplegado en Firebase Hosting  
**Entorno de Producción:** [https://app-productividad-54955.web.app](https://app-productividad-54955.web.app)  
**Repositorio GitHub:** [https://github.com/danielayuntnumancia-dotcom/App-Productividad.git](https://github.com/danielayuntnumancia-dotcom/App-Productividad.git)  

---

## 🚀 Logros de esta Sesión

1. **📦 Macro-Expedientes y Lotes de Contratos Menores (`MacroExpedienteModal.tsx`, `taskNumbering.ts`):**
   - **Estructura Jerárquica en 3 Niveles:** Concejalía ➔ Macro-Expediente ➔ Sub-Contratos Menores ➔ Tareas Hijas del Procedimiento.
   - **Generación Atómica por Lotes:** Creación en 1 clic de múltiples contratos menores a partir de pegado rápido de listas multilínea o agregación manual.
   - **Inyección de Plantillas:** Cada contrato menor recibe automáticamente las tareas hijas de la plantilla de contratación seleccionada (Memoria, RC, 3 Presupuestos, Decreto, ADO), con numeración secuencial garantizada (`1.`, `2.`, `3.`).
   - **Insignias Visuales:** Distintivos `📦 Macro: [Nombre]` y árbol visual interactivo con sangría y botones de acción rápida.

2. **📋 Gestor Total de Plantillas y Plantillas Predeterminadas (`PlantillasView.tsx`, `useUserTemplates.ts`):**
   - **Módulo Independiente:** Nueva vista accesible desde el menú lateral y móvil para crear, editar, duplicar, eliminar e inspeccionar plantillas.
   - **Elección de Plantilla Predeterminada:** Posibilidad de marcar cualquier plantilla propia como predeterminada ⭐ y ocultar/eliminar las plantillas de fábrica obsoletas.
   - **Copia de Seguridad:** Exportación e importación completa del catálogo de plantillas en formato JSON.
   - **Constructor Rápido de Expedientes:** Creación de expedientes ordinarios y macro-expedientes directamente desde la tarjeta de la plantilla.

3. **⚡ Edición en Masa de Tareas (`BulkTaskActionBar.tsx`):**
   - **Barra Flotante Inferior:** Barra emergente con efecto *glassmorphism* y contador en tiempo real al seleccionar casillas de tareas individuales o hijas.
   - **Operaciones Masivas Disponibles:**
     - 🔄 **Cambio de Estado:** Pendiente (`todo`), En curso (`in_progress`), Retenido (`waiting_on_third_party`) o Completada (`completed`).
     - 🔴 **Cambio de Prioridad:** Asignación en lote a Alta, Media o Baja.
     - ⏱️ **Ajuste de Tiempo Estimado:** Minutos prefijados (5m, 15m, 30m, 60m) o personalizados.
     - 📅 **Fecha Límite / Vencimiento:** Asignación simultánea de fecha con selector interactivo.
     - 🏛️ **Reasignación de Concejalía:** Cambio unificado de área responsable.
     - ⚠️ **Asignación de Motivo de Retención / Tercero:** Con trazabilidad temporal.
     - ☀️ **Toggle en "Mi Día":** Inclusión o exclusión masiva del panel de foco diario.
     - 🗑️ **Eliminación Atómica en Lote:** Borrado seguro con diálogo de confirmación.
   - **Integración Global:** Activo en *Mi Día*, *Bandeja General*, *Árbol de Expedientes*, *Contratos Menores* y la *Ficha de Expediente*.

4. **📌 Botones de Acción Fijados ("Sticky"):**
   - Cabeceras y barras de botones (`+ Añadir Tarea`, `+ Añadir Contrato`, `📋 Pegar Lista`) fijadas con `sticky top-0 backdrop-blur-md` en `ExpedienteDetailPanel.tsx`, `ExpedienteBuilderModal.tsx` y `MacroExpedienteModal.tsx` para evitar tener que desplazarse arriba y abajo al trabajar con listas extensas.

5. **⏱️ Sistema de Control de Plazos Críticos y Semáforos (`deadlines.ts`, `DeadlineAlertModal.tsx`):**
   - **Cómputo en Días Hábiles vs. Naturales:** Cálculo automático descontando fines de semana y festivos según la Ley 39/2015 del Procedimiento Administrativo Común.
   - **Semáforo Dinámico en 4 Fases:**
     - 🟢 **Plazo Holgado:** Más de 10 días hábiles restantes.
     - 🟡 **En Atención:** Entre 3 y 10 días hábiles restantes.
     - 🟠 **Alerta Crítica:** Menos de 48 horas / Vence hoy.
     - 🔴 **Vencido:** Insignia roja con contador de días de retraso (`-Xd`).
   - **Campana de Alertas en Cabecera:** Insignia roja con contador de trámites urgentes en el header general que abre el Centro de Alertas prioritario.

6. **📁 Integración con Google Drive y Check-list Documental (`ExpedienteDetailPanel.tsx`, `TaskDetailPanel.tsx`):**
   - **Enlaces Directos a Drive:** Enlaces a carpetas o documentos específicos de Google Drive por cada tarea y a nivel de expediente.
   - **Botón Rápido `📁 Drive`:** Integrado en todas las tarjetas y filas para abrir la carpeta de trabajo en 1 clic.
   - **Check-list de Documentación Obligatoria (LCSP Art. 118):** Verificación de los 7 documentos preceptivos (*Memoria justificativa, RC de Intervención, 3 Presupuestos, Decreto de adjudicación, Factura FACe, ADO*) con barra de progreso porcentual.

7. **📊 Cuadro de Mandos y Dashboard Ejecutivo (`DashboardView.tsx`):**
   - Pestaña **`📊 Analítica`** con KPIs en tiempo real (Expedientes totales, Contratos menores, % de Cumplimiento de plazos, Trámites retenidos).
   - Gráficos de distribución de carga de trabajo por Concejalía.
   - **Detector de Cuellos de Botella:** Identificación y tiempo promedio de trámites retenidos por terceros o departamentos.
   - **Generador de Informe Ejecutivo Oficial en PDF / Impresión A4:** Documento maquetado con membrete municipal listo para comisiones o juntas de gobierno.

8. **🤖 Automatizaciones y Clonador de Macro-Expedientes Anuales:**
   - Botón **`🔄 Duplicar para Próxima Edición / Año`** en la ficha del expediente para clonar macro-expedientes completos con estados limpios a pendiente, nuevo año y nuevo código EXP.
   - Detección y avisos visuales automáticos para tareas retenidas más de 5 días.

---

## 📌 Tareas Pendientes para la Próxima Sesión

1. **Notificaciones Push Nativas y Modo Offline (Capacitor Android):**
   - Activación de notificaciones push en el móvil para avisos de plazos críticos a 24h.
   - Sincronización offline con Firestore para trabajo de campo sin cobertura.

2. **Generador de Carátulas Físicas con Códigos QR:**
   - Impresión de carátula A4 y etiquetas de lomo para carpetas físicas de archivador con QR de acceso directo al expediente.

## 🏗️ Escalabilidad y Arquitectura Backend (Cloud Functions)

Actualmente, el proyecto está diseñado para funcionar 100% bajo la capa gratuita (**Plan Spark**) de Firebase (Autenticación, Firestore, Hosting). Las lógicas complejas como *tareas recurrentes, cálculos de plazos y auditorías* se evalúan de forma "perezosa" (Lazy Evaluation) directamente en el cliente (navegador/Front-end) utilizando transacciones para evitar colisiones.

**Plan de Migración (Si se requiere un Servidor Dedicado / Plan Blaze):**
Si en el futuro se necesita absoluta puntualidad temporal (independiente de la actividad de los usuarios) o enviar correos automatizados, la base de código está preparada para externalizar estas lógicas a **Firebase Cloud Functions**:
1. **Cron Jobs:** Mover la evaluación de "Generar expedientes periódicos" del Front-end a una Cloud Function programada (`functions.pubsub.schedule('0 0 1 * *')`).
2. **Triggers de Auditoría:** Mover la creación del historial de cambios a un disparador de base de datos (`functions.firestore.document('tareas/{taskId}').onUpdate(...)`) para que el backend lleve el registro de forma inviolable, sin gastar escrituras dobles desde el cliente.
3. **Notificaciones Automatizadas:** Envío de correos o notificaciones push desde el servidor cuando falten 48h para un plazo crítico, sin depender de que la app se abra.

---

*Proyecto sincronizado en GitHub y desplegado en producción en Firebase Hosting.*
