# NiddoFlow: Gestión Financiera Inteligente 🚀

**NiddoFlow** es una aplicación integral diseñada para la gestión de finanzas personales y compartidas (familiares). Combina una arquitectura moderna con capacidades offline y un motor de inteligencia que transforma datos transaccionales en consejos accionables.

## ✨ Características Principales

### 🧠 Centro de Inteligencia (AI Smart Feed)
- **Heurísticas Avanzadas**: Análisis automático de hábitos de gasto, tasa de ahorro y detección de gastos recurrentes.
- **Alertas Proactivas**: Notificaciones inteligentes sobre presupuestos excedidos y deudas pendientes de pago o cobro.
- **Diseño Híbrido**: Interfaz adaptable que funciona como un carrusel táctil en móviles y como una cuadrícula profesional en escritorio.

### 📊 Visualización Analítica
- **Carousel de Gráficos**: Acceso rápido a 7 tipos de visualizaciones (Tendencias, Distribución, Flujo de Caja por Mes, Gastos por Usuario, etc.).
- **Tendencias Interactivas**: Gráfico de Ingresos vs. Gastos con granularidad diaria y mensual.
- **Exportación Total**: Generación de reportes PDF profesionales alineados a A4 y descarga de historial completo en formato CSV.

### 📱 Experiencia Premium & Mobile-First
- **Offline-Ready**: Arquitectura diseñada para funcionar sin conexión estable (PWA).
- **Diseño Molecular**: Interfaz construida con un sistema de diseño atómico (Atoms -> Molecules -> Organisms).
- **Consistencia Visual**: Iconografía profesional con Lucide-React y una paleta de colores curada para modo oscuro y claro.

## 🛠️ Stack Tecnológico

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS, Framer Motion, Recharts.
- **Backend**: FastAPI (Python), SQLAlchemy, Pydantic.
- **Base de Datos & Auth**: Supabase (PostgreSQL), RLS (Row Level Security).
- **Infraestructura**: Docker ready, PWA support.

## 🚀 Inicio Rápido

### Estructura del Proyecto

- `/frontend`: Aplicación Next.js (Puerto 3000)
- `/backend`: API FastAPI (Puerto 8000)

### Configuración Local

1. **Backend**:
   ```bash
   cd backend
   pip install -r requirements.txt
   uvicorn main:app --reload
   ```

2. **Frontend**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

---
Diseñado con ❤️ para la libertad financiera familiar.
