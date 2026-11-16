-- Adds Euro, British Pound, Swiss Franc, Chinese Yuan and Japanese Yen as display currencies (prices are still charged in Naira).
-- No rates are added here: the admin enters today's real rates in Admin > Currency rates, and a currency shows in the
-- shop's selector only once its rate exists. Safe to run more than once.
ALTER TABLE public.currency_rates DROP CONSTRAINT IF EXISTS currency_rates_code_check;
ALTER TABLE public.currency_rates ADD CONSTRAINT currency_rates_code_check
  CHECK (code IN ('NGN', 'USD', 'AED', 'EUR', 'GBP', 'CHF', 'CNY', 'JPY'));
