-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Families
create table if not exists families (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  invite_code text unique,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Accounts
create table if not exists accounts (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  type text not null check (type in ('personal', 'joint')),
  family_id uuid references families(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade, -- Null if joint
  balance numeric default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Profiles (Users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  family_id uuid references families(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Trigger to create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- RLS Policies
alter table families enable row level security;
alter table profiles enable row level security;
alter table accounts enable row level security;

drop policy if exists "Allow all for authenticated" on families;
drop policy if exists "Allow all for authenticated" on profiles;
drop policy if exists "Allow all for authenticated" on accounts;

create policy "Allow all for authenticated" on families for all using (auth.role() = 'authenticated');
create policy "Allow all for authenticated" on profiles for all using (auth.role() = 'authenticated');
create policy "Allow all for authenticated" on accounts for all using (auth.role() = 'authenticated');

-- Categories
create table if not exists categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  type text not null check (type in ('income', 'expense')),
  icon text, -- Optional icon identifier
  is_default boolean default false,
  family_id uuid references families(id) on delete cascade, -- Null if global default
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Transactions
create table if not exists transactions (
  id uuid primary key default uuid_generate_v4(),
  description text not null,
  amount numeric not null, -- Positive for both, type determines sign usually, or store expenses as negative. Let's store absolute and use type.
  type text not null check (type in ('income', 'expense', 'transfer')),
  date timestamp with time zone not null default timezone('utc'::text, now()),
  category_id uuid references categories(id) on delete set null,
  account_id uuid references accounts(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete set null, -- Who created it
  family_id uuid references families(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS for new tables
alter table categories enable row level security;
alter table transactions enable row level security;

drop policy if exists "Allow all for authenticated" on categories;
drop policy if exists "Allow all for authenticated" on transactions;

create policy "Allow all for authenticated" on categories for all using (auth.role() = 'authenticated');
create policy "Allow all for authenticated" on transactions for all using (auth.role() = 'authenticated');

-- Insert minimal default categories
insert into categories (name, type, is_default)
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
);

-- Budgets
create table if not exists budgets (
  id uuid primary key default uuid_generate_v4(),
  category_id uuid references categories(id) on delete set null, -- Null si se borró la categoría (el presupuesto se conserva)
  family_id uuid references families(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade, -- Null = presupuesto familiar compartido
  amount numeric not null,
  period text not null check (period in ('weekly', 'monthly')) default 'monthly',
  month integer, -- Null if weekly
  week_number integer, -- Null if monthly
  year integer not null,
  start_date date,
  end_date date,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(family_id, category_id, period, month, week_number, year)
);

-- Debts
create table if not exists debts (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references families(id) on delete cascade not null,
  description text not null,
  total_amount numeric not null,
  remaining_amount numeric not null,
  type text not null check (type in ('to_pay', 'to_receive')),
  status text not null check (status in ('active', 'paid')),
  category_id uuid references categories(id) on delete set null, -- Null si se borró la categoría (la deuda se conserva)
  due_date timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS for news tables
alter table budgets enable row level security;
alter table debts enable row level security;

drop policy if exists "Allow all for authenticated" on budgets;
drop policy if exists "Allow all for authenticated" on debts;

create policy "Allow all for authenticated" on budgets for all using (auth.role() = 'authenticated');
create policy "Allow all for authenticated" on debts for all using (auth.role() = 'authenticated');

-- =====================================================================

-- =====================================================================

-- =====================================================================
-- INICIO DEL DDL DE supabase/migrations/20261030_improvements.sql
-- Copiado literalmente desde la migración para que el script de despliegue
-- y la migración queden sincronizados (CONTRATOS_IMPLEMENTACION.md §6.8).
-- =====================================================================

-- =====================================================================
-- NiddoFlow · Migración de mejoras de esquema
-- Fecha    : 2026-10-30
-- Contrato : CONTRATOS_IMPLEMENTACION.md §6 (Agente G · Esquema de datos)
-- Uso      : psql -f supabase/migrations/20261030_improvements.sql
--            (o supabase db push)
--
-- IDEMPOTENTE: se puede aplicar tantas veces como haga falta.
-- Reglas de §0 respetadas:
--   · Cero cambios destructivos (sin DROP TABLE / TRUNCATE / ALTER COLUMN TYPE).
--   · Todo el DDL es idempotente.
--   · Las columnas nuevas son nullable y con default seguro.
--   · Las FKs nuevas usan ON DELETE SET NULL.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Tablas que ya existían en backend/schema.prisma pero faltaban en
--    el script de despliegue (supabase/schema.sql).
--      · transaction_items   → productos de cada factura (la usa el backend)
--      · user_category_rules → reglas aprendidas de categorización
--      · ai_chat_messages    → historial del chat con IA
-- ---------------------------------------------------------------------

create table if not exists transaction_items (
  id uuid primary key default uuid_generate_v4(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  item_name text not null,
  quantity numeric default 1,
  unit_price numeric not null,
  total_price numeric not null,
  category text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists user_category_rules (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant text not null,
  raw_keyword text not null,
  category text not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists ai_chat_messages (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  content text,
  tool_calls jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS de las tres tablas nuevas (§6.7)
alter table transaction_items enable row level security;
alter table user_category_rules enable row level security;
alter table ai_chat_messages enable row level security;

drop policy if exists "Allow all for authenticated" on transaction_items;
drop policy if exists "Allow all for authenticated" on user_category_rules;
drop policy if exists "Allow all for authenticated" on ai_chat_messages;

create policy "Allow all for authenticated" on transaction_items for all using (auth.role() = 'authenticated');
create policy "Allow all for authenticated" on user_category_rules for all using (auth.role() = 'authenticated');
create policy "Allow all for authenticated" on ai_chat_messages for all using (auth.role() = 'authenticated');

-- Índice único de reglas aprendidas (§6.5)
create unique index if not exists user_category_rules_uniq
  on user_category_rules (user_id, merchant, raw_keyword);


-- ---------------------------------------------------------------------
-- 2. §6.2 · Columnas nuevas (todas nullable, todas idempotentes)
-- ---------------------------------------------------------------------

-- Categorías: jerarquía disponible pero NO se usa (decisión: plano)
alter table categories add column if not exists parent_id uuid references categories(id) on delete set null;

-- Índices de unicidad de categorías (por familia + tipo + nombre normalizado)
-- El indice unico evita categorias duplicadas por familia.
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
end $$;

-- Productos de factura → categoría real
alter table transaction_items add column if not exists category_id uuid references categories(id) on delete set null;
alter table transaction_items add column if not exists confidence numeric;

-- Transacciones → comercio normalizado + cuotas
alter table transactions add column if not exists merchant text;
alter table transactions add column if not exists installment_current integer;
alter table transactions add column if not exists installment_total integer;
alter table transactions add column if not exists purchase_total_amount numeric;
alter table transactions add column if not exists image_hash text;

-- Importador bancario
alter table transactions add column if not exists import_hash text;
alter table transactions add column if not exists source text;   -- valores: manual|ocr|import

-- Budgets: distinguir presupuesto personal del familiar compartido.
-- NULL = presupuesto familiar compartido; con valor = presupuesto personal.
alter table budgets add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- Transacciones: soporte del recibo y cuenta destino de las transferencias.
-- El código (frontend/src/app/debts/actions.ts y el backend) ya los envía.
alter table transactions add column if not exists receipt_url text;
alter table transactions add column if not exists target_account_id uuid references accounts(id) on delete set null;

-- Índices recomendados (§6.2)
create index if not exists transactions_family_date_idx on transactions (family_id, date desc);
create index if not exists transactions_merchant_idx on transactions (merchant);
create index if not exists transaction_items_transaction_idx on transaction_items (transaction_id);
create index if not exists transaction_items_category_idx on transaction_items (category_id);
create index if not exists user_category_rules_lookup_idx on user_category_rules (user_id, merchant);


-- ---------------------------------------------------------------------
-- 3. §6.3 · budgets: ON DELETE CASCADE → ON DELETE SET NULL
--    Así borrar una categoría NO borra el presupuesto en silencio.
-- ---------------------------------------------------------------------

-- 3.1 Se elimina la FK vigente de budgets.category_id.
--     La línea literal del contrato cubre el nombre canónico; el bloque DO
--     atrapa cualquier otro nombre (Prisma/Postgres lo nombran distinto
--     según cómo se creó la tabla) para no dejar una FK "cascade" huérfana
--     que seguiría borrando presupuestos.
alter table budgets drop constraint if exists budgets_category_id_fkey;

do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.budgets'::regclass
      and con.contype = 'f'
      and con.conkey = ARRAY[
        (select att.attnum
         from pg_attribute att
         where att.attrelid = 'public.budgets'::regclass
           and att.attname = 'category_id'
           and not att.attisdropped)
      ]
  loop
    execute format('alter table public.budgets drop constraint %I', r.conname);
  end loop;
end;
$$;

-- 3.2 La columna debe admitir NULL para que el SET NULL sea posible.
alter table budgets alter column category_id drop not null;

-- 3.3 FK canónica: al borrar la categoría, el presupuesto se conserva sin categoría.
alter table budgets add constraint budgets_category_id_fkey
  foreign key (category_id) references categories(id) on delete set null;


-- ---------------------------------------------------------------------
-- 4. §6.4 · Tablas nuevas (aditivas)
-- ---------------------------------------------------------------------

-- shopping_items (necesidades / lista de la compra)
create table if not exists shopping_items (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  category_id uuid references categories(id) on delete set null,
  quantity numeric default 1,
  estimated_price numeric,
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  status text not null default 'pending' check (status in ('pending','purchased','skipped')),
  purchase_transaction_id uuid references transactions(id) on delete set null,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  purchased_at timestamptz
);
create index if not exists shopping_items_family_status_idx on shopping_items (family_id, status);

-- savings_goals (metas de ahorro de la familia)
create table if not exists savings_goals (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  target_amount numeric not null,
  saved_amount numeric not null default 0,
  target_date date,
  category_id uuid references categories(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

-- recurring_bills (cuentas por pagar del hogar)
create table if not exists recurring_bills (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  amount numeric not null,
  category_id uuid references categories(id) on delete set null,
  cadence text not null default 'monthly' check (cadence in ('weekly','biweekly','monthly','quarterly','yearly')),
  day_of_month integer,
  next_due_date date,
  is_active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default timezone('utc'::text, now()) not null
);
-- `notes` lo usa el endpoint de cuentas por pagar (backend/app/models/recurring_bill.py)
alter table recurring_bills add column if not exists notes text;


-- ---------------------------------------------------------------------
-- 5. §6.7 · RLS de las tablas nuevas de §6.4
-- ---------------------------------------------------------------------

alter table shopping_items enable row level security;
alter table savings_goals enable row level security;
alter table recurring_bills enable row level security;

drop policy if exists "Allow all for authenticated" on shopping_items;
drop policy if exists "Allow all for authenticated" on savings_goals;
drop policy if exists "Allow all for authenticated" on recurring_bills;

create policy "Allow all for authenticated" on shopping_items for all using (auth.role() = 'authenticated');
create policy "Allow all for authenticated" on savings_goals for all using (auth.role() = 'authenticated');
create policy "Allow all for authenticated" on recurring_bills for all using (auth.role() = 'authenticated');


-- ---------------------------------------------------------------------
-- 6. §6.6 · Categorías por defecto que faltaban
--    (exigidas por ocr_service.py:410-419 y debts_service.py)
--    El índice único categories_family_name_type_uniq ya existe más arriba,
--    por lo que "on conflict do nothing" detecta los duplicados con
--    family_id = NULL (coalesce → mismo uuid centinela).
-- ---------------------------------------------------------------------

insert into categories (name, type, is_default)
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
);


-- ---------------------------------------------------------------------
-- 7. §6.1 · Función RPC get_dashboard_summary
-- ---------------------------------------------------------------------
-- El backend la invoca en backend/app/repositories/stats_repository.py:7
--   self.db.rpc("get_dashboard_summary", {"p_user_id": user_id}).execute()
--
-- FORMA de la respuesta (deducida de tres fuentes independientes):
--   · backend/app/routers/stats.py:11-20
--       TrendPoint{date: str, income: float, expense: float}
--       DashboardStats{total_balance, monthly_income, monthly_expense, trends}
--   · frontend/src/lib/api/dashboard.api.ts:3-14 → idéntica (snake_case)
--   · frontend/src/app/dashboard/charts/FinanceTrendChart.tsx:51
--       → parseISO(item.date + '-01') ⇒ "date" es "YYYY-MM" (no "YYYY-MM-DD")
--
-- La semántica replica EXACTAMENTE la del servicio Python previo al RPC
-- (commit 8c643f7^: backend/app/services/stats_service.py).
--
-- Si la función YA existe en la base de datos (p. ej. creada a mano desde el
-- SQL Editor de Supabase) NO se reemplaza: se conserva la versión de
-- producción y hay que validarla contra este contrato antes de migrar.
do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_dashboard_summary'
      and p.pronargs = 1
  ) then
    create function public.get_dashboard_summary(p_user_id uuid)
    returns json
    language plpgsql
    security invoker
    set search_path = public, pg_temp
    as $func$
    declare
      v_family_id uuid;
      v_total_balance numeric := 0;
      v_monthly_income numeric := 0;
      v_monthly_expense numeric := 0;
      v_trends json;
      v_start_of_month timestamptz;
      v_start_of_trends timestamptz;
    begin
      -- 1) Familia del usuario. Sin perfil (o sin familia) → null → el backend
      --    responde 404 "Profile or summary not found".
      select p.family_id
        into v_family_id
        from public.profiles p
       where p.id = p_user_id;

      if v_family_id is null then
        return null;
      end if;

      -- Fechas de corte en UTC (igual que el datetime.utcnow() del servicio Python)
      v_start_of_month := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
      v_start_of_trends := ((now() at time zone 'utc') - interval '180 days') at time zone 'utc';

      -- 2) Balance total: cuentas conjuntas + cuentas personales del propio usuario
      select coalesce(sum(a.balance), 0)
        into v_total_balance
        from public.accounts a
       where a.family_id = v_family_id
         and (a.type = 'joint' or (a.type = 'personal' and a.user_id = p_user_id));

      -- 3) Totales del mes en curso (familia completa)
      select
        coalesce(sum(t.amount) filter (where t.type = 'income'), 0),
        coalesce(sum(t.amount) filter (where t.type = 'expense'), 0)
        into v_monthly_income, v_monthly_expense
        from public.transactions t
       where t.family_id = v_family_id
         and t.date >= v_start_of_month;

      -- 4) Tendencias: últimos 180 días agrupados por mes ("YYYY-MM")
      select coalesce(
               json_agg(
                 json_build_object('date', g.month, 'income', g.income, 'expense', g.expense)
                 order by g.month
               ),
               '[]'::json
             )
        into v_trends
        from (
          select
            to_char(t.date at time zone 'utc', 'YYYY-MM') as month,
            coalesce(sum(t.amount) filter (where t.type = 'income'), 0) as income,
            coalesce(sum(t.amount) filter (where t.type = 'expense'), 0) as expense
          from public.transactions t
          where t.family_id = v_family_id
            and t.date >= v_start_of_trends
          group by 1
        ) g;

      return json_build_object(
        'total_balance', v_total_balance,
        'monthly_income', v_monthly_income,
        'monthly_expense', v_monthly_expense,
        'trends', v_trends
      );
    end;
    $func$;
  end if;
end;
$$;
-- FIN DEL DDL DE supabase/migrations/20261030_improvements.sql
