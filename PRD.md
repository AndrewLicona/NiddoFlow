# Documento de Requisitos del Producto (PRD) - NiddoFlow

## 1. Introducción y Visión
**NiddoFlow** es una aplicación integral de gestión financiera diseñada para familias y usuarios individuales que buscan control, claridad y proactividad en sus finanzas. A diferencia de las aplicaciones de gestión de gastos tradicionales, NiddoFlow se enfoca en la colaboración familiar, la experiencia de usuario premium (mobile-first) y el uso de inteligencia de datos para transformar simples registros en decisiones financieras inteligentes.

## 2. Objetivos del Producto
- **Centralización**: Ofrecer un único lugar para gestionar todas las cuentas (personales y compartidas).
- **Colaboración**: Facilitar el seguimiento de gastos familiares sin comprometer la privacidad individual de cada miembro.
- **Resiliencia**: Funcionalidad "offline-first" que garantiza que el usuario pueda registrar movimientos en cualquier momento y lugar.
- **Inteligencia**: Proporcionar análisis automáticos y alertas inteligentes sobre hábitos de gasto y presupuestos.

## 3. Público Objetivo
- **Familias y Parejas**: Que necesitan gestionar gastos compartidos (servicios, vivienda, ocio) y aportes a cuentas conjuntas.
- **Individuos**: Que buscan una herramienta profesional para organizar sus finanzas personales con un diseño moderno.
- **Usuarios con Conectividad Inestable**: Personas que necesitan registrar sus gastos en movimiento y sincronizarlos luego.

## 4. Roles de Usuario
- **Administrador**:
  - Puede crear y gestionar la unidad familiar.
  - Invita o elimina miembros.
  - Configura presupuestos globales y categorías.
  - Acceso total a reportes y auditoría de transferencias.
- **Miembro**:
  - Registra sus ingresos y gastos personales.
  - Puede ver y registrar movimientos en la cuenta conjunta.
  - Visualiza resúmenes financieros familiares.

## 5. Requisitos Funcionales

### A. Gestión de Movimientos
- **Ingresos**: Registro de entradas de dinero especificando cuenta, categoría y fecha.
- **Gastos**: Registro de salidas con soporte para adjuntar recibos (imágenes) y selección de alcance (Personal o Familiar).
- **Transferencias**: Movimiento de fondos entre cuentas (ej. transferencia de ahorro personal a cuenta conjunta).
- **Deudas y Préstamos**:
  - Registro de dinero por cobrar (`to_receive`) y por pagar (`to_pay`).
  - Creación automática de transacciones iniciales al otorgar o recibir un préstamo.
  - Seguimiento de amortizaciones e historial de pagos.

### B. Gestión de Cuentas
- **Cuentas Personales**: Visibles y gestionables solo por el titular.
- **Cuenta Conjunta**: Fondos compartidos donde todos los miembros pueden depositar o realizar pagos.
- **Recálculo de Balance**: El sistema debe ajustar automáticamente el saldo de las cuentas ante cualquier cambio en las transacciones.

### C. Dashboard e Inteligencia
- **Smart Feed**: Carrusel informativo con métricas clave (Balance total, % de ahorro, gastos del mes).
- **Visualización Analítica**: Gráficos de tendencias (Ingresos vs. Gastos), distribución por categoría y gastos por usuario.
- **Alertas**: Notificaciones proactivas sobre deudas vencidas o cuando un presupuesto está cerca de agotarse.

### D. Presupuestos y Categorías
- **Presupuestos Mensuales**: Definición de límites de gasto por categoría.
- **Categorías Configurables**: Soporte para categorías globales (por defecto) y personalizadas.
- **Iconografía**: Uso de iconos profesionales para una rápida identificación visual.

### E. Reportes y Exportación
- **Exportación PDF/CSV**: Generación de informes financieros detallados para auditoría o archivo personal.
- **Filtros Avanzados**: Por fecha, usuario, cuenta y tipo de movimiento.

### F. Clasificación Inteligente de Facturas
- **Productos por Factura**: Cada línea de producto escaneada queda almacenada con su categoría, cantidad, precio y nivel de confianza.
- **Edición en línea**: El usuario ve la tabla de productos y puede corregir la categoría de cualquiera en un clic.
- **Categorías Restringidas**: El OCR solo puede proponer categorías que existen; nunca se crean categorías fantasma.
- **Aprendizaje**: Las correcciones del usuario se guardan como reglas y se aplican en las siguientes facturas, antes de llamar a la IA.
- **Cuotas**: Se distingue el valor de la cuota pagada del total de la compra.
- **Facturas Multi-Página**: Se procesan todas las páginas del PDF, donde suele estar el total.

### G. Categorías Personalizadas
- **CRUD Completo**: Crear, renombrar, cambiar icono y eliminar categorías propias de la familia.
- **Protección**: Las categorías del sistema no se pueden tocar; las de otra familia tampoco son accesibles.
- **Sin Pérdida de Historial**: Al eliminar una categoría, los movimientos quedan sin categoría y los presupuestos se conservan.

### H. Control de Necesidades y Compromisos del Hogar
- **Lista de Necesidades**: Ítems pendientes de compra con categoría y precio estimado. Al marcarlos como comprados generan la transacción.
- **Cuentas del Hogar**: Arriendo, servicios y seguros con frecuencia de cobro y costo mensual normalizado.
- **Metas de Ahorro**: Objetivo con importe y fecha objetivo. Cada aporte genera un movimiento real en la cuenta elegida, así que el balance refleja el dinero ya separado.
- **Cierre de Ciclo**: La factura escaneada puede marcar como comprados los pendientes que coincidan.

### I. Importación Bancaria
- **Flujo de Dos Pasos**: Primero se analiza el archivo (sin escribir nada) y el usuario revisa; después confirma qué se registra.
- **Detección de Duplicados**: Marca Movimientos ya existentes y detecta conflictos por fecha e importe.
- **Cero Borrados**: Un movimiento ausente del archivo del banco se reporta para revisión, nunca se elimina.

### J. Asistente Financiero (NiddoAI)
- **Contexto Familiar Completo**: La IA ve totales, gasto por categoría, gasto por miembro, presupuestos con lo gastado real, recurrentes y deudas.
- **Herramientas de Solo Lectura**: Consulta los datos por sí misma en lugar de estimar.
- **Alcance Dinámico**: Distingue entre preguntas personales y familiares.
- **Propuestas con Confirmación**: Nunca escribe directamente; propone y el usuario confirma.
- **Memoria Entre Sesiones**: Recupera el historial guardado.

## 6. Requisitos No Funcionales
- **Offline-First**: Implementación de PWA y persistencia local (`IndexedDB`) con sincronización automática al detectar conexión.
- **Diseño Premium**: Interfaz moderna, sistema de diseño molecular, y soporte nativo para **Modo Oscuro**.
- **Seguridad**: Autenticación robusta y seguridad a nivel de base de datos (`RLS - Row Level Security`) en Supabase para proteger la privacidad de los datos personales.
- **Escalabilidad**: Backend basado en FastAPI para un procesamiento rápido y modular.
- **Cero Destrucción de Datos**: Toda migración es aditiva e idempotente. Nunca se hace `DROP TABLE`, `TRUNCATE` ni se cambia el tipo de una columna existente. Las claves foráneas nuevas usan `on delete set null`.
- **Una Sola Fuente de Verdad**: Todo cálculo que aparece en más de una pantalla se resuelve en el servidor, para que el dashboard, los reportes y el asistente muestren los mismos números.

## 7. Stack Tecnológico
- **Frontend**: Next.js 16, TypeScript, React 19, Tailwind CSS v4, Framer Motion, Recharts, lucide-react.
- **Backend**: FastAPI (Python), Prisma-Python, Supabase-py, Pydantic, google-genai.
- **Base de Datos & Auth**: Supabase (PostgreSQL), Storage para recibos.
- **Infraestructura**: Docker ready, Soporte PWA.

## 8. Roadmap de Desarrollo
1. **Fase 1 (Completada)**: Inicialización, Autenticación y Esquema de Base de Datos.
2. **Fase 2 (Completada)**: Núcleo de Transacciones y Gestión de Cuentas.
3. **Fase 3 (Completada)**: Dashboard Analítico, Inteligencia de Datos y Sistema de Deudas.
4. **Fase 4 (Completada)**: Capa de agregación en servidor, IA con herramientas, categorías propias, clasificación de productos por factura, control de necesidades, cuentas del hogar e importador bancario.
5. **Fase 5 (Futuro)**: Sincronización offline avanzada (PWA), proyección predictiva de saldos y reportes fiscales.
