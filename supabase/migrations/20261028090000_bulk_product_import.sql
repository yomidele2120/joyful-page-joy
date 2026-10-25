create extension if not exists pgcrypto;

create table if not exists public.product_import_jobs (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  admin_user_id uuid references auth.users(id) on delete set null,
  file_name text not null,
  source_type text not null default 'csv' check (source_type in ('csv','excel')),
  status text not null default 'queued' check (status in ('queued','processing','review','approved','rejected','published','failed')),
  total_rows integer not null default 0,
  processed_rows integer not null default 0,
  success_count integer not null default 0,
  failed_count integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_import_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.product_import_jobs(id) on delete cascade,
  source_name text not null,
  source_price numeric(12,2),
  normalized_name text,
  category_name text,
  brand text,
  description text,
  specs jsonb not null default '{}'::jsonb,
  image_url text,
  image_status text not null default 'pending' check (image_status in ('pending','verified','missing','uncertain','uploaded')),
  price numeric(12,2) not null,
  original_price numeric(12,2) not null,
  source_urls jsonb not null default '[]'::jsonb,
  attempt_count integer not null default 0,
  published_product_id uuid references public.products(id) on delete set null,
  status text not null default 'queued' check (status in ('queued','processing','review','approved','rejected','published','failed')),
  review_notes text,
  error_message text,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.product_import_items
  add column if not exists source_urls jsonb not null default '[]'::jsonb,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists published_product_id uuid references public.products(id) on delete set null;

update public.product_import_items set original_price = price where original_price is null;
alter table public.product_import_items alter column original_price set not null;
alter table public.product_import_items drop constraint if exists product_import_items_status_check;
alter table public.product_import_items add constraint product_import_items_status_check
  check (status in ('queued','processing','review','approved','rejected','published','failed'));

create index if not exists idx_product_import_jobs_vendor on public.product_import_jobs (vendor_id, created_at desc);
create index if not exists idx_product_import_jobs_status on public.product_import_jobs (status, created_at desc);
create index if not exists idx_product_import_items_job on public.product_import_items (job_id, status);
create index if not exists idx_product_import_items_attempts on public.product_import_items (job_id, attempt_count) where status in ('queued', 'failed');

create or replace function public.product_import_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_product_import_jobs_updated_at on public.product_import_jobs;
create trigger trg_product_import_jobs_updated_at
before update on public.product_import_jobs
for each row execute function public.product_import_set_updated_at();

drop trigger if exists trg_product_import_items_updated_at on public.product_import_items;
create trigger trg_product_import_items_updated_at
before update on public.product_import_items
for each row execute function public.product_import_set_updated_at();

create or replace function public.protect_product_import_price()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.price is distinct from old.price
    or new.original_price is distinct from old.original_price then
    raise exception 'The imported client selling price is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_product_import_price on public.product_import_items;
create trigger trg_protect_product_import_price
before update on public.product_import_items
for each row execute function public.protect_product_import_price();

alter table public.product_import_jobs enable row level security;
alter table public.product_import_items enable row level security;

drop policy if exists "Admins manage product import jobs" on public.product_import_jobs;
create policy "Admins manage product import jobs" on public.product_import_jobs
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins manage product import items" on public.product_import_items;
create policy "Admins manage product import items" on public.product_import_items
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

drop policy if exists "Admins upload imported product images" on storage.objects;
create policy "Admins upload imported product images" on storage.objects
for insert to authenticated
with check (bucket_id = 'product-images' and public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins update imported product images" on storage.objects;
create policy "Admins update imported product images" on storage.objects
for update to authenticated
using (bucket_id = 'product-images' and public.has_role(auth.uid(), 'admin'))
with check (bucket_id = 'product-images' and public.has_role(auth.uid(), 'admin'));

drop policy if exists "Imported product images are public" on storage.objects;
create policy "Imported product images are public" on storage.objects
for select to public
using (bucket_id = 'product-images');
