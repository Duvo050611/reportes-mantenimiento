-- =====================================================================
-- Reportes de Mantenimiento Universitario · Configuración de Supabase
-- Ejecutar completo en: Dashboard > SQL Editor > New query > Run
-- Es idempotente: se puede ejecutar varias veces.
--
-- Requisitos previos en el Dashboard:
--   Authentication > Sign In / Providers > Email: habilitado
--   (Para la demo en clase se puede desactivar "Confirm email".)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) PERFILES Y ROLES
--    El rol NUNCA lo decide el cliente: se crea con un trigger en el
--    servidor y el usuario no tiene permiso para modificarlo.
--      estudiante / administrativo -> registran y ven SOLO sus reportes
--      mantenimiento              -> ve todos y actualiza el estado
-- ---------------------------------------------------------------------
create table if not exists public.perfiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nombre      text not null check (char_length(nombre) between 2 and 80),
  tipo        text not null default 'estudiante'
                check (tipo in ('estudiante', 'administrativo')),
  rol         text not null default 'usuario'
                check (rol in ('usuario', 'mantenimiento')),
  created_at  timestamptz not null default now()
);

alter table public.perfiles enable row level security;

-- Crea el perfil al registrarse. Solo se aceptan del cliente "nombre" y
-- "tipo" (estudiante/administrativo); el rol privilegiado se asigna a mano.
create or replace function public.crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo text := coalesce(new.raw_user_meta_data ->> 'tipo', 'estudiante');
begin
  if v_tipo not in ('estudiante', 'administrativo') then
    v_tipo := 'estudiante';
  end if;
  insert into public.perfiles (id, nombre, tipo)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1)), 80),
    v_tipo
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_crear_perfil on auth.users;
create trigger trg_crear_perfil
after insert on auth.users
for each row execute function public.crear_perfil();

-- ¿El usuario actual es personal de mantenimiento? (usado por las políticas)
create or replace function public.es_mantenimiento()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfiles
    where id = (select auth.uid()) and rol = 'mantenimiento'
  );
$$;

revoke all on function public.es_mantenimiento() from public, anon;
grant execute on function public.es_mantenimiento() to authenticated;

revoke all on public.perfiles from anon, authenticated;
grant select on public.perfiles to authenticated;     -- sin insert/update/delete

drop policy if exists "perfiles_select_propio" on public.perfiles;
create policy "perfiles_select_propio"
on public.perfiles for select to authenticated
using (id = (select auth.uid()) or (select public.es_mantenimiento()));

-- ---------------------------------------------------------------------
-- 2) TABLA DE REPORTES
--    La foto NO se guarda en la BD: solo su ruta dentro del bucket.
-- ---------------------------------------------------------------------
create table if not exists public.reportes (
  id              uuid primary key default gen_random_uuid(),
  folio           bigint generated always as identity unique,
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  categoria       text not null check (categoria in
                    ('computo', 'iluminacion', 'mobiliario', 'internet', 'electrica', 'otro')),
  edificio        text not null check (char_length(edificio) between 1 and 60),
  aula            text not null check (char_length(aula) between 1 and 60),
  descripcion     text not null check (char_length(descripcion) between 10 and 1000),
  foto_path       text check (foto_path is null or foto_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+$'),
  estado          text not null default 'pendiente'
                    check (estado in ('pendiente', 'en_proceso', 'resuelto')),
  fecha_registro  timestamptz not null default now(),   -- la pone el servidor
  actualizado_en  timestamptz not null default now(),
  id_cliente      uuid unique                            -- idempotencia de reintentos offline
);

alter table public.reportes enable row level security;

-- Solo las columnas que el usuario puede escribir. user_id, estado y
-- fecha_registro las fija el servidor (default) y no se aceptan del cliente.
revoke all on public.reportes from anon, authenticated;
grant select on public.reportes to authenticated;
grant insert (categoria, edificio, aula, descripcion, foto_path, id_cliente) on public.reportes to authenticated;
grant update (estado) on public.reportes to authenticated;   -- filtrado por RLS: solo mantenimiento

drop policy if exists "reportes_select" on public.reportes;
drop policy if exists "reportes_insert_propio" on public.reportes;
drop policy if exists "reportes_update_mantenimiento" on public.reportes;

create policy "reportes_select"
on public.reportes for select to authenticated
using (user_id = (select auth.uid()) or (select public.es_mantenimiento()));

create policy "reportes_insert_propio"
on public.reportes for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (foto_path is null or split_part(foto_path, '/', 1) = (select auth.uid())::text)
);

create policy "reportes_update_mantenimiento"
on public.reportes for update to authenticated
using ((select public.es_mantenimiento()))
with check ((select public.es_mantenimiento()));

-- Mantiene la fecha de actualización
create or replace function public.tocar_actualizado()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists trg_reportes_actualizado on public.reportes;
create trigger trg_reportes_actualizado
before update on public.reportes
for each row execute function public.tocar_actualizado();

create index if not exists reportes_user_fecha_idx on public.reportes (user_id, fecha_registro desc);
create index if not exists reportes_estado_idx on public.reportes (estado);

-- ---------------------------------------------------------------------
-- 3) BUCKET PRIVADO DE EVIDENCIAS (validación de tipo y tamaño en servidor)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidencias', 'evidencias', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public             = excluded.public,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "evidencias_insert_propia" on storage.objects;
drop policy if exists "evidencias_select" on storage.objects;

-- Subir: solo dentro de la carpeta propia  evidencias/<uid>/<archivo>
create policy "evidencias_insert_propia"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'evidencias'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Leer (generar URL firmada): dueño o personal de mantenimiento
create policy "evidencias_select"
on storage.objects for select to authenticated
using (
  bucket_id = 'evidencias'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select public.es_mantenimiento())
  )
);
-- Sin políticas UPDATE/DELETE: la evidencia no puede sobrescribirse ni borrarse desde la app.

-- ---------------------------------------------------------------------
-- 4) ASIGNAR EL ROL DE MANTENIMIENTO (solo un administrador, desde aquí)
-- ---------------------------------------------------------------------
-- update public.perfiles set rol = 'mantenimiento'
-- where id = (select id from auth.users where email = 'mantenimiento@universidad.edu.mx');
