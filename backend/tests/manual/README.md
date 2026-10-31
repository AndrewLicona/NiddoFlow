# Pruebas de integracion manuales (categorias / shopping / goals)

Estos scripts **no** forman parte de la suite de `pytest` (`pytest.ini` usa
`testpaths = tests` y `python_files = test_*.py`, asi que nada de esta carpeta
se recolecta). Tocan la **base de datos real**: crean y borran filas de prueba
en las tablas `categories`, `transactions`, `transaction_items`, `budgets`,
`shopping_items` y `savings_goals`.

## Opt-in obligatorio

Para evitar un borrado accidental, **ninguno** de estos scripts se ejecuta si
falta la variable `NIDDOFLOW_ALLOW_DB_TESTS=1`. Si falta, el script imprime la
instruccion y termina con codigo 2 sin tocar nada:

```powershell
$env:NIDDOFLOW_ALLOW_DB_TESTS = '1'
```

Ademas, la limpieza esta acotada: solo borra las filas que el propio test creo
(por id, o por nombre **dentro de la familia de prueba**), y las reglas
aprendidas se borran solo las del comercio de prueba (`tiendas ara`) - nunca
todas las reglas del usuario.

Ejecucion (desde `backend/`):

```powershell
cd backend
$env:NIDDOFLOW_ALLOW_DB_TESTS = '1'
.\venv\Scripts\python.exe tests\manual\integration_categories.py
.\venv\Scripts\python.exe tests\manual\integration_modules.py
.\venv\Scripts\python.exe tests\manual\integration_delete_history.py
.\venv\Scripts\python.exe tests\manual\integration_items.py
.\venv\Scripts\python.exe tests\manual\integration_transactions_write.py
.\venv\Scripts\python.exe tests\manual\integration_debts_category.py
```

| Script | Que comprueba |
| --- | --- |
| `integration_categories.py` | CRUD de `/categories`: permisos (403 default / otra familia), duplicados (409), icono invalido -> `null`, reglas aprendidas (`/categories/rules`) y aislamiento entre usuarios. |
| `integration_modules.py` | CRUD de `/shopping` y `/goals`: compra de una necesidad (crea el gasto), aporte a una meta, borrado sin perder el movimiento. |
| `integration_delete_history.py` | `DELETE /categories/{id}` **no borra historial**: el movimiento y el presupuesto sobreviven con `category_id = NULL`. |
| `integration_items.py` | `persist_item_categories` resuelve el texto de la categoria y escribe `category_id` (y `confidence` si el item la trae) en `transaction_items`. |
| `integration_transactions_write.py` | El `UPDATE` y el `DELETE` de movimientos estan acotados a la familia: con otra familia no modifican ni borran, y al borrar el propio se borran tambien sus productos. |
| `integration_debts_category.py` | Borrar una categoria con deudas asociadas NO se bloquea: la deuda sobrevive con `category_id = NULL` y el servicio informa de lo afectado. |

Cada script imprime `== RESULTADO: N OK, M FALLOS ==` y devuelve codigo de
salida 1 si hay algun fallo.
