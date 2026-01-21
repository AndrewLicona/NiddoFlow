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

## 6. Requisitos No Funcionales
- **Offline-First**: Implementación de PWA y persistencia local (`IndexedDB`) con sincronización automática al detectar conexión.
- **Diseño Premium**: Interfaz moderna, sistema de diseño molecular, y soporte nativo para **Modo Oscuro**.
- **Seguridad**: Autenticación robusta y seguridad a nivel de base de datos (`RLS - Row Level Security`) en Supabase para proteger la privacidad de los datos personales.
- **Escalabilidad**: Backend basado en FastAPI para un procesamiento rápido y modular.

## 7. Stack Tecnológico
- **Frontend**: Next.js 14, TypeScript, Tailwind CSS, Framer Motion, Recharts.
- **Backend**: FastAPI (Python), SQLAlchemy, Pydantic.
- **Base de Datos & Auth**: Supabase (PostgreSQL), Storage para recibos.
- **Infraestructura**: Docker ready, Soporte PWA.

## 8. Roadmap de Desarrollo
1. **Fase 1 (Completada)**: Inicialización, Autenticación y Esquema de Base de Datos.
2. **Fase 2 (Completada)**: Núcleo de Transacciones y Gestión de Cuentas.
3. **Fase 3 (En Progreso)**: Dashboard Analítico, Inteligencia de Datos y Sistema de Deudas.
4. **Fase 4 (Futuro)**: Sincronización offline avanzada (PWA) y optimización de reportes.
5. **Fase 5 (Futuro)**: Clasificación automática de gastos mediante IA avanzada.
