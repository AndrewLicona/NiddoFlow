"""Invariantes de seguridad del backend (contrato CONTRATOS_IMPLEMENTACION.md §0).

Estas pruebas **leen el codigo fuente** y fallan si se rompe una regla. No
tocan la base de datos, asi que se pueden correr en cualquier entorno.

Reglas vigiladas:
  1. Todo borrado esta acotado a un id **y** a una familia.
  2. No hay DDL ni SQL destructivo dentro del codigo de la aplicacion.
  3. La IA no tiene herramientas de escritura.
  4. El importador no borra nada.
  5. No se construye SQL concatenando texto del usuario.
"""

import ast
import os
import re

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP_DIR = os.path.join(BACKEND_DIR, "app")

# Scopes que valen como "acotado" en un `where` de Prisma.
SCOPING_KEYS = {"id", "family_id", "user_id", "transaction_id", "account_id"}

# Metodos que ejecutan SQL contra la base de datos.
SQL_EXECUTORS = {"query_raw", "execute", "raw", "execute_raw"}


def _py_files():
    """Todos los .py de la aplicacion (excluye __pycache__)."""
    for root, dirs, files in os.walk(APP_DIR):
        dirs[:] = [d for d in dirs if d != "__pycache__"]
        for name in sorted(files):
            if name.endswith(".py"):
                yield os.path.join(root, name)


def _rel(path):
    return os.path.relpath(path, BACKEND_DIR).replace("\\", "/")


def _chain(node):
    """Cadena de llamadas de un ``Call``, de fuera hacia dentro."""
    parts = []
    current = node
    while isinstance(current, ast.Call) and isinstance(current.func, ast.Attribute):
        parts.append((current.func.attr, current.args, current.keywords))
        current = current.func.value
    return parts


def _parents(tree):
    parents = {}
    for node in ast.walk(tree):
        for child in ast.iter_child_nodes(node):
            parents[child] = node
    return parents


def _outermost_calls(tree, parents):
    """Los ``Call`` mas externos de cada cadena de llamadas.

    En ``a.b().c()`` el padre directo del ``Call`` interno es el nodo
    ``Attribute`` que forma el ``func`` del externo, no el ``Call`` externo.
    Por eso se busca un ``Attribute`` cuyo ``value`` sea la llamada.
    """
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        parent = parents.get(node)
        if isinstance(parent, ast.Attribute) and parent.value is node:
            continue  # es parte de una cadena mas larga
        yield node


def _decorator_calls(tree):
    """Llamadas que son decoradores (``@router.delete(...)``) y no consultas."""
    calls = set()
    for node in ast.walk(tree):
        for decorator in getattr(node, "decorator_list", []) or []:
            for sub in ast.walk(decorator):
                if isinstance(sub, ast.Call):
                    calls.add(id(sub))
    return calls


def _eq_filters(chain, delete_index):
    """Las claves usadas en los ``.eq(...)`` aplicados despues del borrado."""
    keys = set()
    for attr, args, _keywords in chain[:delete_index]:
        if attr != "eq" or not args:
            continue
        first = args[0]
        if isinstance(first, ast.Constant) and isinstance(first.value, str):
            keys.add(first.value)
    return keys


def _where_keys(keywords):
    """Claves del dict ``where=`` de una llamada Prisma."""
    for keyword in keywords:
        if keyword.arg != "where":
            continue
        value = keyword.value
        if isinstance(value, ast.Dict):
            keys = set()
            for key in value.keys:
                if isinstance(key, ast.Constant) and isinstance(key.value, str):
                    keys.add(key.value)
            return keys
    return set()


class TestBorradosAcotados:
    """Regla 1: ningun borrado puede tocar filas de otra familia."""

    def test_todo_borrado_esta_acotado(self):
        problemas = []

        for path in _py_files():
            with open(path, "r", encoding="utf-8") as handle:
                source = handle.read()
            tree = ast.parse(source, filename=path)
            parents = _parents(tree)
            decoradores = _decorator_calls(tree)

            for call in _outermost_calls(tree, parents):
                if id(call) in decoradores:
                    continue  # @router.delete(...) no es una consulta

                chain = _chain(call)
                delete_index = None
                for index, (attr, _args, _kw) in enumerate(chain):
                    if attr in ("delete", "delete_many"):
                        delete_index = index
                        break
                if delete_index is None:
                    continue

                _attr, delete_args, delete_keywords = chain[delete_index]

                if delete_args or any(kw.arg == "where" for kw in delete_keywords):
                    # Forma Prisma: delete(where={...}) / delete_many(where={...})
                    keys = _where_keys(delete_keywords)
                    if not keys & SCOPING_KEYS:
                        problemas.append(
                            f"{_rel(path)}: delete sin scope (where={sorted(keys) or 'vacio'})"
                        )
                    continue

                # Forma supabase-py: .delete().eq(...).eq(...)
                filters = _eq_filters(chain, delete_index)
                if not filters & SCOPING_KEYS:
                    problemas.append(f"{_rel(path)}: .delete() sin filtro de alcance")
                if "family_id" not in filters and "transaction_id" not in filters:
                    # `transaction_items` no tiene columna `family_id`: se acota
                    # por su movimiento, que ya esta acotado a la familia.
                    problemas.append(f'{_rel(path)}: .delete() sin acotar a la familia')

        assert not problemas, "Borrados sin acotar:\n" + "\n".join(problemas)

    def test_no_hay_truncate_ni_delete_masivo(self):
        problemas = []
        for path in _py_files():
            with open(path, "r", encoding="utf-8") as handle:
                source = handle.read()
            tree = ast.parse(source, filename=path)

            for node in ast.walk(tree):
                if not isinstance(node, ast.Constant):
                    continue
                if not isinstance(node.value, str):
                    continue
                text = node.value.lower()
                if "truncate " in text or "drop table" in text:
                    problemas.append(f"{_rel(path)}: SQL destructivo en el codigo")
                if re.search(r"delete\s+from\s+\w+\s*(;|$)", text):
                    problemas.append(f"{_rel(path)}: DELETE FROM sin WHERE")

        assert not problemas, "SQL destructivo:\n" + "\n".join(problemas)


class TestIaNoEscribe:
    """Regla 3: la IA solo propone."""

    def test_ai_tools_no_tiene_escrituras(self):
        path = os.path.join(APP_DIR, "services", "ai_tools.py")
        with open(path, "r", encoding="utf-8") as handle:
            source = handle.read()

        for operacion in (".insert(", ".update(", ".delete(", ".upsert(", ".create("):
            assert operacion not in source, f"ai_tools.py usa {operacion}: la IA no puede escribir"

    def test_ai_tools_expone_herramientas_de_lectura(self):
        path = os.path.join(APP_DIR, "services", "ai_tools.py")
        with open(path, "r", encoding="utf-8") as handle:
            source = handle.read()

        tree = ast.parse(source, filename=path)
        funciones = [
            node.name
            for node in tree.body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        ]
        assert len(funciones) >= 5, (
            f"ai_tools.py deberia exponer varias herramientas de lectura, tiene {len(funciones)}"
        )


class TestImportadorNoBorra:
    """Regla 4: el importador nunca borra."""

    def test_el_importador_no_tiene_borrados(self):
        path = os.path.join(APP_DIR, "services", "bank_import_service.py")
        with open(path, "r", encoding="utf-8") as handle:
            source = handle.read()

        tree = ast.parse(source, filename=path)
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                assert node.func.attr not in ("delete", "delete_many"), (
                    "bank_import_service.py borra datos: el importador solo crea."
                )

    def test_el_importador_marca_lo_ausente(self):
        path = os.path.join(APP_DIR, "services", "bank_import_service.py")
        with open(path, "r", encoding="utf-8") as handle:
            source = handle.read()

        assert "missing_in_bank" in source, (
            "El importador debe reportar lo que no aparece en el banco."
        )


class TestSqlNoInyectable:
    """Regla 5: no se arma SQL con texto del usuario."""

    def test_no_hay_sql_con_textos_interpolados(self):
        """Solo se revisan los f-strings que se EJECUTAN contra la base de datos.

        Un prompt de IA con texto interpolado no es SQL y no es un riesgo.
        """
        problemas = []
        for path in _py_files():
            with open(path, "r", encoding="utf-8") as handle:
                source = handle.read()
            tree = ast.parse(source, filename=path)

            for node in ast.walk(tree):
                if not isinstance(node, ast.Call):
                    continue
                if not isinstance(node.func, ast.Attribute):
                    continue
                if node.func.attr not in SQL_EXECUTORS:
                    continue
                for argument in list(node.args) + [kw.value for kw in node.keywords]:
                    if isinstance(argument, ast.JoinedStr):
                        problemas.append(f"{_rel(path)}: SQL armado con f-string")

        assert not problemas, "SQL concatenado:\n" + "\n".join(problemas)
