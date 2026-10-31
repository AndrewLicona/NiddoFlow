# 📘 Manual de Usuario - NiddoFlow

Bienvenido a **NiddoFlow**, tu sistema de gestión financiera familiar. Este manual te explicará cómo usar las nuevas funciones para mantener tus finanzas bajo control.

---

## 🚀 1. Préstamos y Deudas (¡Nuevo!)

Hemos separado los "Préstamos de Dinero" de las "Cuentas por Pagar" para que tus reportes sean exactos.

### 💵 Modo: Préstamo (Dinero)
Úsalo cuando prestas dinero en efectivo o te prestan a ti.
*   **Ir a**: Menú Deudas -> Botón "Agregar Registro" -> Pestaña **"💵 Préstamo"**.
*   **¿Cómo funciona?**:
    *   Si **TÚ prestas** dinero a alguien: Elige "Préstamo Otorgado (Yo presté)".
    *   Si **TE prestan** dinero a ti: Elige "Préstamo Recibido (Me prestaron)".
*   **Categoría**: ¡Es automática! No tienes que elegir nada, el sistema lo asigna correctamente para no mezclarlo con tus gastos de comida o servicios.

### 🧾 Modo: Cuenta por Pagar (Facturas)
Úsalo para recibos de luz, agua, tarjetas de crédito o ventas pendientes.
*   **Ir a**: Menú Deudas -> Botón "Agregar Registro" -> Pestaña **"🧾 Cuenta por Pagar"**.
*   **¿Cómo funciona?**:
    *   **Debo Pagar**: Para facturas que tienes pendiente pagar.
    *   **Me Deben**: Para dinero que te deben por una venta o servicio.
*   **Categoría**: **Aquí SÍ eliges**. Por ejemplo, selecciona "Servicios" para la luz o "Alimentación" para compras pendientes. Así tu presupuesto se actualiza correctamente cuando pagues.

---

## 🧾 2. Facturas con escaneo (¡Nuevo!)

Escanea un recibo y NiddoFlow no solo registra el total: **desglosa cada producto** y lo clasifica solo.

*   **Ir a**: Menú Movimientos -> **"Nueva Transacción"** -> sube la foto del recibo.
*   **¿Qué obtienes?**:
    *   Una tabla con **cada producto** de la factura (leche, pan, detergente...) y la categoría en la que quedó.
    *   Si la IA no está segura de un producto, lo marca en **ámbar** para que lo revises.
    *   Si la factura fue **a cuotas**, ves "Cuota 2 de 3" y el total real de la compra, para que tu flujo de caja no te engañe.
    *   Si el recibo tiene **varias páginas** (facturas de luz, internet), se leen todas y se toma el total correcto.
*   **Corregir una categoría**: haz clic en el desplegable de la fila y elige otra. La corrección se guarda y la app **aprende**: la próxima vez que escanees algo de ese mismo comercio, ya lo clasifica solo.

---

## 🏷️ 3. Categorías propias (¡Nuevo!)

Las categorías del sistema (Comida, Transporte, Vivienda...) están bien, pero cada familia es distinta.

*   **Ir a**: Menú **Ajustes** -> pestaña **"Categorías"**.
*   **Crear una**: escribe el nombre, elige el ícono y el tipo (Gasto o Ingreso).
*   **Editar o borrar**: las categorías con el distintivo **"Sistema"** no se tocan; las tuyas sí.
*   **Al borrar**, el sistema te dice exactamente qué se vería afectado ("14 movimientos y 1 presupuesto"). **No se pierde historial**: los movimientos quedan sin categoría y el presupuesto se conserva.

---

## 🛒 4. Necesidades: lo que todavía no tienes (¡Nuevo!)

La lista de cosas que falta comprar en casa.

*   **Ir a**: Menú **Necesidades**.
*   **Añadir**: escribe qué falta (leche, papel, detergente), elige la categoría y, si quieres, el precio estimado y la prioridad.
*   **Marcar comprado**: al comprarlo, se crea el movimiento de gasto con la categoría que ya tenía, así que el presupuesto se actualiza al instante.
*   **Ciclo completo**: necesidad -> compra -> factura escaneada -> producto clasificado -> presupuesto. Todo conectado.

---

## 🏠 5. Cuentas del hogar (¡Nuevo!)

Los gastos que se repiten: arriendo, luz, agua, seguro.

*   **Ir a**: Menú **Cuentas del hogar**.
*   Registra el nombre, el valor, la frecuencia (mensual, quincenal, semanal...) y el día de cobro.
*   Ves el **costo mensual real** de tu hogar y qué vence en los próximos 7 días.

---

## 🏦 6. Importar el extracto del banco (¡Nuevo!)

*   **Ir a**: Menú **Importar movimientos**.
*   Sube el CSV u OFX que descargas de tu banco. **Primero solo se analiza**: te muestra una tabla con cada movimiento, marcando los duplicados y los que ya tienes.
*   Revisa, desmarca lo que no quieras y pulsa **Importar**. Solo entonces se registra lo que confirmaste.
*   **Nunca se borra nada**: si un movimiento no aparece en el archivo del banco, se te avisa para que lo revises, pero no se elimina.

---

## 🤖 7. NiddoAI con todo el contexto (¡Nuevo!)

El chat ahora **conoce toda la familia**, no solo lo tuyo.

*   Pregúntale cosas como: *"¿cuánto gastamos en comida este mes?"*, *"¿cómo vamos de presupuesto?"*, *"¿quién gastó más en transporte?"*.
*   Distingue entre lo tuyo y lo de la familia: *"¿gasté yo?"* responde solo por tu cuenta; *"¿gastamos?"* responde por el hogar.
*   **Registrar desde el chat**: pídele "registra que gasté 30 mil en café" y te propone el movimiento. **Tú confirmas** con un botón: la IA nunca escribe por su cuenta.
*   Recuerda conversaciones anteriores: puedes seguir la charla de ayer.

---

## 💸 8. Centro de Inteligencia (¡Nuevo!)

El dashboard ahora razona sobre tus datos, no solo los muestra.

*   **Gastos recurrentes**: tus suscripciones (Netflix, Spotify, gym...) con su coste mensual real.
*   **Proyección de flujo de caja**: cuánto vas a tener a fin de mes y cuántos días de margen te quedan.
*   **Anomalías**: te avisa si gastaste mucho más de lo normal en una categoría.
*   **Gasto por miembro**: quién gastó más en el mes.

---

## 📊 9. Reportes y Exportación

Descarga tu historial para auditorías o revisiones externas.

*   **Exportar a PDF**:
    1.  Ve a la sección **Historial**.
    2.  Haz clic en el botón de **"Exportar"** (icono de descarga).
    3.  Elige el rango de fechas (ej: Todo el año).
    4.  Selecciona el formato **PDF**.
    5.  ¡Listo! Se descargará un reporte profesional con todas las transacciones de la familia.
*   **Filtros finos**: en **Reportes** ahora puedes filtrar por categoría, integrante, tipo de movimiento, rango de monto y texto libre.

---

## 🕒 10. Pagos de Deudas

Registrar un pago ahora es más fácil y seguro.

1.  Ve a la tarjeta de la deuda pendiente.
2.  Haz clic en **"Registrar Pago"** (botón verde).
3.  **Cuenta Vinculada**: Si la deuda estaba asociada a una cuenta específica (ej: Tarjeta de Crédito), el sistema **seleccionará esa cuenta automáticamente** para el pago. Ya no te bloqueará.

---

## 🎯 11. Metas de ahorro (¡Nuevo!)

Un objetivo con fecha y presupuesto: "¿cuánto falta para el viaje?".

*   **Ir a**: Menú **Metas**.
*   **Crear una**: nombre, cuánto quieres ahorrar y, si quieres, la fecha objetivo y una categoría.
*   **Aportar**: el botón **"+ Aportar"** registra un movimiento real en la cuenta que elijas, así que tu balance refleja el dinero que ya separaste (no es un número suelto).
*   **Avance**: ves el porcentaje y el saldo en cada tarjeta. El saldo de la meta se actualiza solo con los aportes.
*   **Borrar una meta** no toca los movimientos ni los saldos: solo desaparece de la lista.

---

## 💡 Tips Adicionales

*   **Hora Local**: El sistema ahora detecta automáticamente si estás en Colombia, Perú, etc., para mostrar la hora correcta de las transacciones.
*   **Recibos**: Recuerda que puedes tomar fotos a tus comprobantes al momento de crear una transacción o pagar una deuda.
*   **Corregir productos de una factura vieja**: en **Historial**, despliega un movimiento con productos y verás un selector por producto para corregir su categoría. La app **aprende** de esa corrección para las próximas facturas del mismo comercio.
*   **La IA recuerda**: NiddoAI conserva el historial de tus conversaciones, así que puedes preguntar "¿y el mes pasado?" sin volver a explicar el contexto.

---
*NiddoFlow - Finanzas Claras, Familia Tranquila.*
