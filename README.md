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
- **PWA**: Recursos estáticos en caché; sin conexión se muestra una página informativa para proteger los datos de la sesión.
- **Diseño Molecular**: Interfaz construida con un sistema de diseño atómico (Atoms -> Molecules -> Organisms).
- **Consistencia Visual**: Iconografía profesional con Lucide-React y una paleta de colores curada para modo oscuro y claro.

## 🛠️ Stack Tecnológico

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS, Framer Motion, Recharts.
- **Backend**: FastAPI (Python), Prisma, Pydantic.
- **Base de Datos & Auth**: Supabase (PostgreSQL), RLS (Row Level Security).
- **Infraestructura**: Docker ready, PWA support.

## 🚀 Inicio Rápido

### Estructura del Proyecto

- `/frontend`: Aplicación Next.js (Puerto 3000)
- `/backend`: API FastAPI (Puerto 8000)

### Configuración Local

1. Copia `backend/.env.example` a `backend/.env` y configura las credenciales de Supabase y la conexión PostgreSQL. Configura también `frontend/.env.local` con las variables públicas de Supabase y la URL del backend; consulta `.env.production.example` para sus nombres. La clave `service_role` es secreta y solo debe estar en el backend.

2. **Backend** (Python 3.11 o 3.12):
   ```bash
   cd backend
   python -m venv .venv
   # Windows PowerShell: .venv\Scripts\Activate.ps1
   # macOS/Linux: source .venv/bin/activate
   python -m pip install -r requirements.txt
   prisma generate
   python -m uvicorn main:app --reload
   ```

3. **Frontend**:
   ```bash
   cd frontend
   npm ci
   npm run dev
   ```

La API expone `/health` para comprobar que el proceso responde y `/ready` para consultar el estado de conexión del cliente Prisma. Para ejecutar las pruebas del backend, activa el entorno virtual y ejecuta `python -m pytest` desde `backend`.

### Acceso con Google en desarrollo

En el panel de Supabase, abre **Authentication → URL Configuration** y añade `http://localhost:3000/auth/callback` a **Redirect URLs**. Si usas `127.0.0.1` en lugar de `localhost`, añade también `http://127.0.0.1:3000/auth/callback`. Conserva la URL de producción en **Site URL** y las redirecciones de producción existentes. Inicia el acceso desde la misma dirección y navegador en los que vas a usar la aplicación; el verificador de la sesión se guarda allí.

---
Diseñado con ❤️ para la libertad financiera familiar.
