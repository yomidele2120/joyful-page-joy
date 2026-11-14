#!/usr/bin/env python3
"""
Static checks for supabase/migrations/20261114090000_vendor_advertising.sql.

This is NOT a substitute for running the migration against Postgres (see supabase/tests/vendor_advertising_test.sql).
It catches typos that would stop the migration from applying or leave a function exposed:
  1. quote / parenthesis balance
  2. every CREATE FUNCTION appears in exactly one permission list (nothing accidentally public)
  3. every name in a permission list is actually created
  4. every public.<table> referenced exists (created here or in an earlier migration)
  5. column names used through the common aliases exist on the real tables
  6. nothing is defined twice

Usage:  python3 scripts/check-advertising-migration.py
"""
import re, sys, glob, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIG = os.path.join(ROOT, 'supabase/migrations/20261114090000_vendor_advertising.sql')
sql = open(MIG, encoding='utf-8').read()
problems = []

def strip(src):
    """Remove comments and single-quoted strings (keeps dollar-quoted bodies, which are code)."""
    out, i, n = [], 0, len(src)
    while i < n:
        if src.startswith('--', i):
            j = src.find('\n', i); i = n if j < 0 else j; continue
        if src[i] == "'":
            i += 1
            while i < n:
                if src[i] == "'" and src[i + 1:i + 2] == "'": i += 2; continue
                if src[i] == "'": i += 1; break
                i += 1
            out.append("''"); continue
        out.append(src[i]); i += 1
    return ''.join(out)

code = strip(sql)

# 1. balance
tags = re.findall(r'\$[A-Za-z_]*\$', code)
for t in set(tags):
    if tags.count(t) % 2: problems.append(f'unbalanced dollar quote {t}')
if code.count('(') != code.count(')'): problems.append(f'parentheses: {code.count("(")} open vs {code.count(")")} close')
if code.count('[') != code.count(']'): problems.append(f'brackets: {code.count("[")} open vs {code.count("]")} close')

# 6. duplicates
funcs = re.findall(r'CREATE OR REPLACE FUNCTION public\.(\w+)\(', sql)
for f in set(funcs):
    if funcs.count(f) > 1: problems.append(f'function defined twice: {f}')
tables_here = re.findall(r'CREATE TABLE IF NOT EXISTS public\.(\w+)', sql)
for t in set(tables_here):
    if tables_here.count(t) > 1: problems.append(f'table defined twice: {t}')

# 2 + 3. permission lists
m = re.search(r"_public text\[\] := ARRAY\[(.*?)\];\s*_signed_in text\[\] := ARRAY\[(.*?)\];\s*_internal text\[\] := ARRAY\[(.*?)\];", sql, re.S)
lists = {}
if not m: problems.append('could not find the permission lists')
else:
    for name, blob in zip(('public', 'signed_in', 'internal'), m.groups()):
        lists[name] = re.findall(r"'(\w+)'", blob)
    allnames = sum(lists.values(), [])
    for f in set(funcs):
        c = allnames.count(f)
        if c == 0: problems.append(f'function {f} is not in any permission list (it would stay callable by everyone)')
        if c > 1: problems.append(f'function {f} is in more than one permission list')
    for n in set(allnames):
        if n not in funcs: problems.append(f'permission list names a function that is never created: {n}')
    for n in lists['public']:
        if not n.startswith(('get_', 'record_')): problems.append(f'unexpected public function: {n}')
    for n in lists['internal']:
        if n.startswith(('vendor_', 'admin_', 'my_')): problems.append(f'user-facing function listed as internal: {n}')

# 4. tables
existing = set(tables_here)
for p in glob.glob(os.path.join(ROOT, 'supabase/migrations/*.sql')):
    if p == MIG: continue
    existing |= set(re.findall(r'CREATE TABLE (?:IF NOT EXISTS )?public\.(\w+)', open(p, encoding='utf-8').read()))
types = open(os.path.join(ROOT, 'src/integrations/supabase/types.ts'), encoding='utf-8').read()
def type_cols(table):
    mm = re.search(r'\n      %s: \{\n        Row: \{(.*?)\n        \}' % table, types, re.S)
    return set(re.findall(r'\n\s+(\w+)\??:', mm.group(1))) if mm else set()
existing |= {'user_roles', 'vendors', 'products', 'notifications'}
for t in sorted(set(re.findall(r'\b(?:FROM|JOIN|INTO|UPDATE|TABLE(?: IF NOT EXISTS)?|ON) public\.(\w+)', code))):
    if t not in existing: problems.append(f'unknown table referenced: public.{t}')

# 5. columns through aliases
def cols_from_create(table):
    mm = re.search(r'CREATE TABLE IF NOT EXISTS public\.%s \((.*?)\n\);' % table, sql, re.S)
    if not mm: return set()
    return set(re.findall(r'^\s{2}(\w+)\s', mm.group(1), re.M)) - {'UNIQUE', 'CONSTRAINT', 'CHECK', 'PRIMARY'}
membership_cols = {'vendor_id', 'plan_slug', 'status', 'period_started_at', 'expires_at', 'updated_at'}
plan_cols = {'slug', 'is_active', 'name', 'features', 'price_kobo', 'period_days', 'purchase_enabled'}
alias_tables = {
    'v': type_cols('vendors'), 'm': membership_cols, 'f': cols_from_create('advertising_plan_features'),
    'b': cols_from_create('vendor_advertising_banners'), 'j': cols_from_create('advertising_generation_jobs'),
    'e': cols_from_create('external_ad_campaigns'), 'ap': cols_from_create('vendor_advertising_products') | {'position'},
}
for alias, cols in alias_tables.items():
    for col in sorted(set(re.findall(r'(?<![\w.])%s\.(\w+)' % alias, code))):
        if col not in cols and col != '*':
            problems.append(f'alias {alias}. uses unknown column {col}')
for alias, table in {'p': 'products'}.items():
    # `p` is also a derived-table alias in two analytics queries (placement, i, c); allow those.
    for col in sorted(set(re.findall(r'(?<![\w.])p\.(\w+)', code))):
        if col not in type_cols(table) and col not in {'placement', 'i', 'c', 'oid', 'proname', 'pronamespace'}:  # derived-table + pg_proc aliases
            problems.append(f'alias p. uses unknown products column {col}')

print(f'{len(funcs)} functions, {len(tables_here)} tables, {len(lists.get("public", []))} public / {len(lists.get("signed_in", []))} signed-in / {len(lists.get("internal", []))} internal permissions')
if problems:
    print('\nPROBLEMS:'); [print(' -', p) for p in problems]; sys.exit(1)
print('OK: no static problems found (this does not replace running the migration and the SQL tests).')
