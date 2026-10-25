alter table public.product_import_jobs
  add column if not exists skipped_count integer not null default 0;

alter table public.product_import_items
  add column if not exists source_fields jsonb not null default '{}'::jsonb;

alter table public.product_import_items drop constraint if exists product_import_items_status_check;
alter table public.product_import_items add constraint product_import_items_status_check
  check (status in ('queued','processing','review','approved','rejected','published','failed','skipped'));

comment on column public.product_import_items.source_fields is
  'Optional product-format fields and separate CSV specification columns supplied by the admin.';
