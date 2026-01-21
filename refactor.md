
# Plan de Refactorización – Rendimiento y Arquitectura Limpia

## Objetivo
- Reducir el peso y tiempo de las llamadas al backend
- Evitar recálculos innecesarios
- Centralizar lógica y eliminar código duplicado
- Preparar la información en frontend usando hooks personalizados
- Tener una arquitectura clara, mantenible y escalable

---

## 1. Problemas Identificados

### Backend
- Endpoints hacen demasiado (lógica + queries + cálculos)
- Múltiples queries por request
- Recalculo de balances y métricas en cada llamada
- Respuestas grandes y poco específicas

### Frontend
- Fetch directo desde componentes
- Lógica repetida por página
- Estados duplicados
- Re-renders innecesarios
- Charts recalculando todo en cada render

---

## 2. Principios de la Refactorización

- Un endpoint = una responsabilidad
- Un hook = una fuente de verdad
- Backend entrega datos ya procesados
- Frontend solo compone y renderiza
- Nada de fetch directo en componentes UI

---

## 3. Refactor Backend (FastAPI)

### 3.1 Separación estricta por capas

```

Router → Service → Repository → DB

```

- Router: HTTP y validación mínima
- Service: reglas de negocio y agregaciones
- Repository: queries optimizadas
- DB: cálculos pesados cuando sea posible

---

### 3.2 Endpoints optimizados (clave)

❌ Evitar:
- `/transactions` devolviendo todo
- `/dashboard` calculando todo en runtime

✅ Usar:
- `/dashboard/summary`
- `/dashboard/charts`
- `/accounts/balances`
- `/transactions/list?from&to&limit`

Cada endpoint devuelve **solo lo necesario**.

---

### 3.3 Pre-cálculo y optimización

- Mover cálculos a:
  - views SQL
  - funciones en PostgreSQL
- Cachear:
  - dashboard
  - balances
- Evitar loops en Python sobre grandes datasets

---

## 4. Frontend – Arquitectura con Hooks Personalizados

### 4.1 Regla principal

❌ Componentes NO hacen fetch  
✅ Hooks hacen fetch, procesan y exponen datos listos

---

### 4.2 Estructura recomendada

```

src/
├── hooks/
│   ├── useDashboard.ts
│   ├── useAccounts.ts
│   ├── useTransactions.ts
│   └── useBudgets.ts
├── lib/
│   ├── api/
│   │   ├── dashboard.api.ts
│   │   ├── accounts.api.ts
│   │   └── transactions.api.ts
│   └── mappers/
├── components/
│   └── (arquitectura molecular)

````

---

### 4.3 Ejemplo de Hook correcto

```ts
export function useDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: getDashboardSummary
  })

  const preparedData = useMemo(() => ({
    balance: data?.balance ?? 0,
    savingsRate: data?.savings_rate ?? 0
  }), [data])

  return { preparedData, isLoading }
}
````

👉 El componente **no transforma nada**.

---

## 5. Eliminación de Código Duplicado

### Backend

* `BaseRepository`
* `BaseService`
* Errores comunes centralizados
* Validaciones reutilizables

### Frontend

* Un hook por dominio
* Un archivo API por endpoint
* Mappers para normalizar datos
* Nada de lógica repetida en componentes

---

## 6. Optimización de Rendimiento Frontend

* `useMemo` para datos derivados
* `useCallback` en handlers
* Charts reciben datos ya listos
* Estado normalizado (no arrays anidados gigantes)
* Evitar `useEffect` con lógica pesada

---

## 7. Plan de Ejecución (orden recomendado)

### Paso 1

Refactor backend:

* separar routers → services
* crear endpoints específicos y livianos

### Paso 2

Optimizar queries:

* reducir cantidad
* mover cálculos a DB
* cachear dashboard

### Paso 3

Crear hooks personalizados:

* uno por dominio
* centralizar fetch + lógica

### Paso 4

Refactor UI:

* componentes solo renderizan
* aplicar arquitectura molecular

### Paso 5

Optimizar dashboard:

* menos requests
* datos preprocesados
* memoización

---

## 8. Resultado Esperado

* Backend más rápido y predecible
* Navegación fluida
* Código fácil de entender
* Cambios localizados
* Escalabilidad real sin reescribir todo

---

## Nota Final

Si un componente necesita lógica → esa lógica pertenece a un hook.
Si un hook necesita lógica pesada → esa lógica pertenece al backend.

```


