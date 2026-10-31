"""Aplica las salvaguardas de idempotencia a los archivos SQL.

Cambios (idénticos en `supabase/schema.sql` y en la migración):
  1. La creación del índice único pasa a ser NO FATAL: si la base ya tiene
     categorías duplicadas, se avisa con un NOTICE y la migración continúa.
  2. Las siembras de categorías por defecto dejan de depender del índice
     único y usan `where not exists`, así que son idempotentes por sí solas.
"""

import io
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

INDEX_OLD = """create unique index if not exists categories_family_name_type_uniq
  on categories (coalesce(family_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name), type);"""

INDEX_NEW = """-- El indice unico evita categorias duplicadas por familia.
-- Si la base ya tuviera duplicados (por ejemplo porque una siembra anterior
-- se corrio dos veces), la creacion falla. En ese caso NO se aborta la
-- migracion: se avisa y se sigue. La unicidad tambien la garantiza la API,
-- que responde 409 cuando detecta un duplicado.
do $$
begin
    create unique index if not exists categories_family_name_type_uniq
      on categories (coalesce(family_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name), type);
exception when others then
    raise notice 'No se pudo crear categories_family_name_type_uniq (posibles categorias duplicadas preexistentes): %', sqlerrm;
end $$;"""

SEED_OLD = """insert into categories (name, type, is_default) values
('Salario', 'income', true),
('Ventas', 'income', true),
('Comida', 'expense', true),
('Transporte', 'expense', true),
('Vivienda', 'expense', true),
('Servicios', 'expense', true),
('Entretenimiento', 'expense', true)
on conflict do nothing;"""

SEED_NEW = """insert into categories (name, type, is_default)
select v.name, v.type, v.is_default
from (values
  ('Salario', 'income', true),
  ('Ventas', 'income', true),
  ('Comida', 'expense', true),
  ('Transporte', 'expense', true),
  ('Vivienda', 'expense', true),
  ('Servicios', 'expense', true),
  ('Entretenimiento', 'expense', true)
) as v(name, type, is_default)
where not exists (
  select 1 from categories c
  where lower(c.name) = lower(v.name) and c.type = v.type and c.family_id is null
);"""

SEED2_OLD = """insert into categories (name, type, is_default) values
  ('Salud', 'expense', true),
  ('Otros', 'expense', true),
  ('Préstamos Recibidos', 'income', true),
  ('Préstamos Otorgados', 'expense', true),
  ('Deudas', 'expense', true)
on conflict do nothing;"""

SEED2_NEW = """insert into categories (name, type, is_default)
select v.name, v.type, v.is_default
from (values
  ('Salud', 'expense', true),
  ('Otros', 'expense', true),
  ('Préstamos Recibidos', 'income', true),
  ('Préstamos Otorgados', 'expense', true),
  ('Deudas', 'expense', true)
) as v(name, type, is_default)
where not exists (
  select 1 from categories c
  where lower(c.name) = lower(v.name) and c.type = v.type and c.family_id is null
);"""


def apply(path: str) -> int:
    with io.open(path, "r", encoding="utf-8", newline="") as fh:
        content = fh.read()

    newline = "\r\n" if "\r\n" in content else "\n"

    def norm(text: str) -> str:
        return text.replace("\r\n", "\n")

    def restore(text: str) -> str:
        if newline == "\r\n":
            return text.replace("\n", "\r\n")
        return text

    original = content
    working = norm(content)

    changes = 0
    for old, new in ((INDEX_OLD, INDEX_NEW), (SEED_OLD, SEED_NEW), (SEED2_OLD, SEED2_NEW)):
        if old in working:
            working = working.replace(old, new)
            changes += 1
        else:
            print(f"  [aviso] patron no encontrado en {os.path.basename(path)}: {old.splitlines()[0][:60]}")

    if working != norm(original):
        with io.open(path, "w", encoding="utf-8", newline="") as fh:
            fh.write(restore(working))

    return changes


def main() -> int:
    targets = [
        os.path.join(ROOT, "supabase", "schema.sql"),
        os.path.join(ROOT, "supabase", "migrations", "20261030_improvements.sql"),
    ]
    for target in targets:
        if not os.path.exists(target):
            print(f"[error] no existe: {target}")
            return 1
        applied = apply(target)
        print(f"[ok] {os.path.basename(target)}: {applied} cambios aplicados")
    return 0


if __name__ == "__main__":
    sys.exit(main())
