# NiddoFlow — Plataforma de Gestión Financiera Familiar

## 🎯 Objetivo
Desarrollar una aplicación **offline-first** para la gestión financiera familiar que permita:
- Administrar **cuentas personales y una cuenta conjunta**
- Registrar **ingresos, gastos, transferencias y deudas**
- Analizar el uso del dinero en relación con los ingresos
- Visualizar información clara mediante un **dashboard informativo**
- Acceso multiusuario desde cualquier dispositivo
- Funcionamiento sin conexión a internet con sincronización posterior

---

## 🧩 Conceptos Clave del Sistema

### Tipos de cuentas
- **Cuenta Conjunta**
  - Recibe aportes de los miembros
  - Cubre gastos compartidos
- **Cuentas Personales**
  - Manejo individual del dinero
  - Gastos fuera o relacionados con el hogar

### Principio fundamental
> **Todo movimiento es una transacción**
(incluye ingresos, gastos y transferencias)

---

## 👥 Roles de Usuario

### Administrador
- Crear y gestionar la familia
- Invitar miembros
- Definir presupuestos
- Acceso completo al dashboard

### Miembro
- Registrar ingresos y gastos
- Ver su información personal
- Ver resúmenes familiares

---

## 📦 Funcionalidades Obligatorias (MVP)

### Autenticación
- Login / Logout
- Roles
- Gestión por familia

### Movimientos financieros
- Ingresos (personales y conjuntos)
- Gastos (personales, conjuntos o mixtos)
- Transferencias:
  - Personal → Conjunta
  - Conjunta → Personal
- Deudas:
  - Estado
  - Cuotas
  - Historial

### Presupuestos
- Por persona
- Por categoría
- Mensual
- Alertas de sobreuso

---

## 📊 Dashboard Informativo

### Métricas clave
- Ingresos totales
- Gastos totales
- Balance mensual
- % gasto vs ingreso
- Ahorro

### Visualizaciones
- Ingresos vs gastos (línea)
- Gastos por categoría (donut)
- Gastos por persona (barras)
- Evolución mensual

---

## 📡 Offline-first

### Estrategia
- Aplicación **PWA**
- Persistencia local con **IndexedDB**
- Sincronización cuando haya conexión
- Control de conflictos con:
  - UUID
  - timestamps
  - estado de sincronización

---

## 🧠 Inteligencia Artificial (fase futura)
*(No prioritaria en el MVP)*

- Clasificación automática de gastos
- Resúmenes financieros mensuales
- Detección de hábitos de gasto
- Alertas inteligentes

---

## 🛠 Stack Tecnológico

### Frontend
- **Next.js (App Router)**
- TypeScript
- Tailwind CSS
- PWA
- IndexedDB

### Backend
- **FastAPI**
- Python
- JWT Auth

### Base de Datos
- **PostgreSQL (Supabase)**
- Esquema relacional

### Infraestructura
- Supabase (Auth + DB)
- Posible despliegue en servidor casero
- Docker (opcional)

---

## 🗃 Modelo de Datos (alto nivel)

### Entidades
- Family
- User
- Account (personal / conjunta)
- Transaction
- Budget
- Debt

### Transacción
- id (UUID)
- type (income | expense | transfer)
- amount
- category
- account_origin
- account_target
- user_id
- date
- synced
- created_at
- updated_at

---

## 🔀 Flujo General

1. Usuario registra movimiento (online u offline)
2. Datos se guardan localmente
3. Al recuperar conexión:
   - Se sincroniza con FastAPI
4. Backend procesa y agrega datos
5. Dashboard se actualiza

---

## 📁 Versionado y Repositorio

### Repositorio
- GitHub (privado)

### Branching
- main → estable
- dev → desarrollo
- feature/* → nuevas funcionalidades

### Convención de commits
- feat:
- fix:
- refactor:
- docs:

---

## 🗺 Roadmap

# 🧭 Fases de Desarrollo — NiddoFlow

---

## 🔹 FASE 0 — Inicialización del Proyecto
**Objetivo:** Tener el proyecto creado, versionado y ejecutándose localmente.

### Tareas
- Crear repositorio GitHub (privado)
- Definir estructura:
  - `/frontend` → Next.js
  - `/backend` → FastAPI
- Configurar:
  - TypeScript
  - ESLint / Prettier
  - Variables de entorno (`.env`)
- Crear README inicial

### Resultado
- Proyecto corre en local
- Control de versiones limpio y ordenado

---

## 🔹 FASE 1 — Supabase + Autenticación
**Objetivo:** Usuarios reales y base de datos funcional.

### Tareas
- Crear proyecto en Supabase
- Configurar:
  - Auth (email/password)
  - Base de datos Postgres
- Conectar FastAPI con Supabase
- Crear tablas base:
  - `families`
  - `users`
  - `accounts`
- Lógica:
  - Crear familia
  - Unirse a familia
  - Crear cuenta conjunta
  - Crear cuenta personal por usuario

### Frontend
- Login
- Registro
- Selección / creación de familia

### Resultado
- Usuarios autenticados
- Familias y cuentas creadas correctamente

---

## 🔹 FASE 2 — Transacciones (Núcleo)
**Objetivo:** Registrar ingresos, gastos y transferencias.

### Tareas
- Crear tabla `transactions`
- Implementar validaciones por tipo:
  - `income`
  - `expense`
  - `transfer`
- Endpoints FastAPI:
  - Crear transacción
  - Listar transacciones por mes / familia

### Frontend
- Formulario de transacción
- Listado de movimientos
- Filtros por fecha y tipo

### Resultado
- Movimientos financieros funcionando correctamente
- Balances calculables

---

## 🔹 FASE 3 — Dashboard Básico
**Objetivo:** Visualizar el estado financiero.

### Backend
- Endpoints agregados:
  - Ingresos vs gastos
  - Balance mensual
  - Gastos por categoría
  - Gastos por usuario

### Frontend
- KPIs principales
- Gráficas:
  - Línea (ingresos vs gastos)
  - Donut (categorías)
  - Barras (por usuario)
- Filtro mensual

### Resultado
- Dashboard claro, útil y entendible

---

## 🔹 FASE 4 — Presupuestos y Deudas
**Objetivo:** Control y planificación financiera.

### Tareas
- Crear tabla `budgets`
- Crear tabla `debts`
- Reglas de negocio:
  - Presupuesto mensual por categoría
  - Seguimiento de pagos
- Endpoints CRUD

### Frontend
- Configuración de presupuestos
- Vista de progreso
- Gestión de deudas

### Resultado
- Control real del gasto
- Visibilidad de compromisos financieros

---

## 🔹 FASE 5 — Offline-first (PWA)
**Objetivo:** Uso sin conexión a internet.

### Tareas
- Convertir frontend en PWA
- Implementar IndexedDB:
  - Guardar transacciones locales
- Campo `synced` en transacciones
- Endpoint de sincronización

### Reglas
- Offline → guardar local
- Online → sincronizar
- Conflictos por `updated_at`

### Resultado
- Aplicación funcional sin internet
- Sincronización confiable

---

## 🔹 FASE 6 — Optimización y Escalabilidad
**Objetivo:** Pulir y preparar para crecimiento.

### Opcional
- Exportar CSV / PDF
- Alertas simples
- Roles avanzados
- IA (análisis y recomendaciones)

### Resultado
- Producto sólido y escalable

---

## 📌 Prioridad de Ejecución
1. Fase 0
2. Fase 1
3. Fase 2
4. Fase 3
5. Fase 5
6. Fase 4
7. Fase 6


---

## 🔒 Principios del Proyecto
- Simplicidad
- Transparencia financiera
- Bajo costo
- Escalabilidad
- Código limpio

---

## 📌 Nombre del Proyecto
**NiddoFlow**

Gestión clara del dinero familiar, en flujo constante.
