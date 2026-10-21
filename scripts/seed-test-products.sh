#!/usr/bin/env bash
# Fills a STAGING database with fake products so you can measure speed at 1 to 2 million.
# NEVER point this at your live database.
#
#   export DATABASE_URL='postgresql://postgres:PASSWORD@db.xxxx.supabase.co:5432/postgres'   # staging only
#   bash scripts/seed-test-products.sh 1000000        # how many to create (default 1,000,000)
#
# Needs psql (the PostgreSQL client) and supabase/seed/seed_test_products.sql already run once.
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to your STAGING database connection string first}"
TOTAL="${1:-1000000}"
CHUNK="${2:-25000}"

HOST="$(echo "$DATABASE_URL" | sed -E 's#.*@([^:/?]+).*#\1#')"
echo "This will add $TOTAL fake products to: $HOST"
read -r -p "Is that a TEST database, not your live site? Type yes to continue: " OK
[ "$OK" = "yes" ] || { echo "Cancelled."; exit 1; }

START=1
while [ "$START" -le "$TOTAL" ]; do
  COUNT=$(( TOTAL - START + 1 ))
  [ "$COUNT" -gt "$CHUNK" ] && COUNT="$CHUNK"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -t -c "SELECT public.seed_test_products($START, $COUNT);" > /dev/null
  echo "created products $START to $(( START + COUNT - 1 ))"
  START=$(( START + COUNT ))
done

echo "Updating the database's statistics..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "ANALYZE public.products;"
echo "Done. Now run supabase/seed/explain_product_queries.sql and open /products on the staging site."
