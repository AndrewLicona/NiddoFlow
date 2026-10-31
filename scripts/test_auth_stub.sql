-- Stub mínimo del esquema `auth` de Supabase, solo para pruebas locales.
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

create or replace function auth.role() returns text
  language sql stable as
$$
  select 'authenticated'
$$;
