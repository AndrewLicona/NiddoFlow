-- =====================================================================
-- Migracion: debts.category_id -> ON DELETE SET NULL
-- =====================================================================
--
-- Por que:
--   `debts.category_id` apuntaba a `categories(id)` sin accion `on delete`,
--   es decir en `NO ACTION`. Eso hacia que borrar una categoria que tuviera
--   deudas asociadas devolviera 409 y el usuario no pudiera borrarla nunca.
--
--   Una deuda sin categoria sigue siendo una deuda valida: no se pierde nada.
--   Es el mismo criterio que ya se aplica a `budgets.category_id`,
--   `transactions.category_id` y `transaction_items.category_id`.
--
-- Garantias:
--   - Aditiva e idempotente: se puede aplicar dos veces sin efecto adverso.
--   - No borra ni modifica filas: solo cambia la accion de la FK.
--   - La columna ya es nullable: no hace falta tocar `not null`.
--   - Va en UN solo bloque DO para que sea atomico y se pueda aplicar sobre
--     el pooler de transacciones de Supabase (que no soporta bien el DDL
--     multi-sentencia).
--
-- Ejecutar con el SQL Editor de Supabase o con una conexion directa (5432).
-- =====================================================================

do $$
begin
    if exists (
        select 1
        from pg_constraint
        where conname = 'debts_category_id_fkey'
          and conrelid = 'public.debts'::regclass
    ) then
        execute 'alter table public.debts drop constraint debts_category_id_fkey';
        execute 'alter table public.debts add constraint debts_category_id_fkey '
             || 'foreign key (category_id) references categories(id) on delete set null';
        raise notice 'debts.category_id ahora es ON DELETE SET NULL';
    else
        raise notice 'debts_category_id_fkey no existe: nada que hacer';
    end if;
end
$$;
