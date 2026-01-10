# NiddoFlow - Reglas de Negocio y Lógica del Sistema

Este documento sirve como referencia para entender cómo funciona la lógica interna de NiddoFlow, especialmente en lo que respecta a transacciones, préstamos y flujos de dinero.

---

## 🏗️ Estructura de Datos Principal

### 1. Transacciones (`transactions`)
Son los movimientos de dinero individuales.
- **Tipos:**
  - `income` (Ingreso): Suma al balance de la cuenta.
  - `expense` (Egreso): Resta al balance de la cuenta.
  - `transfer` (Transferencia): Resta de la cuenta origen (`account_id`) y suma a la cuenta destino (`target_account_id`).
- **Impacto:** Cualquier creación, edición o eliminación de una transacción recalcula automáticamente el balance de la(s) cuenta(s) involucrada(s).

### 2. Préstamos (`debts`)
Representan deudas o dinero por cobrar.
- **Tipos:**
  - `to_pay` (Por pagar / Préstamo Recibido): Es una **entrada** de dinero inicial.
  - `to_receive` (Por cobrar / Préstamo Otorgado): Es una **salida** de dinero inicial.
- **Lógica Automática:**
  - Al crear un préstamo y asociarlo a una cuenta, el sistema crea **automáticamente** una transacción inicial para reflejar el movimiento de dinero.
  - Si es `to_pay`, se crea un ingreso (`income`).
  - Si es `to_receive`, se crea un egreso (`expense`).
- **Categorías por defecto:**
  - Se usan las categorías "Préstamos Recibidos" o "Préstamos Otorgados" si el usuario no elige una.

---

## 👪 Alcance y Visibilidad (Scoping)

NiddoFlow maneja dos niveles de visibilidad:
- **Personal:** Solo muestra transacciones de las cuentas personales del usuario logueado.
- **Familiar:** Muestra:
  1. Todas las cuentas marcadas como "familiares/conjuntas".
  2. Las cuentas personales del usuario logueado.
  3. **Todas las transferencias** de la familia (para auditoría).
  *No muestra las cuentas personales de otros miembros de la familia.*

---

## 📊 Exportación y Reportes
- El sistema permite exportar un historial en **PDF** con filtrado por fechas y alcance (Personal/Familiar).
- Los recibos (imágenes/archivos) se almacenan en el storage de Supabase y el PDF incluye enlaces directos a ellos.

---

## 🛠️ Mantenimiento de Base de Datos
- Las categorías globales (`is_default = true`) no tienen `family_id` y están disponibles para todos.
- Al limpiar la base de datos, siempre se deben restaurar las categorías base para que la aplicación sea funcional desde el inicio.
