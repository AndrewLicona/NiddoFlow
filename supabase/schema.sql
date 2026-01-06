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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- RLS Policies
alter table families enable row level security;
alter table profiles enable row level security;
alter table accounts enable row level security;

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

create policy "Allow all for authenticated" on categories for all using (auth.role() = 'authenticated');
create policy "Allow all for authenticated" on transactions for all using (auth.role() = 'authenticated');

-- Insert minimal default categories
insert into categories (name, type, is_default) values
('Salario', 'income', true),
('Ventas', 'income', true),
('Comida', 'expense', true),
('Transporte', 'expense', true),
('Vivienda', 'expense', true),
('Servicios', 'expense', true),
('Entretenimiento', 'expense', true)
on conflict do nothing; -- Simple way to avoid dupes if re-run, ideally need unique constraint/index
