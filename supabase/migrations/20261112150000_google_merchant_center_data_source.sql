ALTER TABLE public.merchant_center_settings
  ADD COLUMN IF NOT EXISTS data_source_name text;

UPDATE public.merchant_center_settings
SET data_source_name = data_source_id,
    data_source_id = substring(data_source_id FROM '/dataSources/([0-9]+)$')
WHERE data_source_id ~ '^accounts/[0-9]+/dataSources/[0-9]+$'
  AND data_source_name IS NULL;

UPDATE public.merchant_center_settings
SET data_source_name = format(
  'accounts/%s/dataSources/%s',
  merchant_account_id,
  data_source_id
)
WHERE data_source_id ~ '^[0-9]+$'
  AND merchant_account_id ~ '^[0-9]+$'
  AND data_source_name IS NULL;
