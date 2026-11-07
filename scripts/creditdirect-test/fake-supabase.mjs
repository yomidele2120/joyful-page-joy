// Tiny in-memory stand-in for the parts of supabase-js the Credit Direct functions use.
export const state = { tables: {}, admins: new Set(), users: {}, rpcCalls: [] };
export const reset = (tables) => { state.tables = structuredClone(tables); state.rpcCalls = []; };

class Q {
  constructor(t, name) { this.t = t; this.name = name; this.filters = []; this.op = 'select'; this.patch = null; }
  select() { return this; }
  insert(row) { this.op = 'insert'; this.patch = row; return this; }
  update(p) { this.op = 'update'; this.patch = p; return this; }
  upsert(row, o) { this.op = 'upsert'; this.patch = row; this.conflict = o?.onConflict; return this; }
  eq(k, v) { this.filters.push((r) => r[k] === v); return this; }
  neq(k, v) { this.filters.push((r) => r[k] !== v); return this; }
  in(k, vs) { this.filters.push((r) => vs.includes(r[k])); return this; }
  match(r) { return this.filters.every((f) => f(r)); }
  run() {
    const rows = state.tables[this.name] ?? (state.tables[this.name] = []);
    if (this.op === 'insert') {
      if (this.name === 'bnpl_transactions' && rows.some((r) => r.order_id === this.patch.order_id)) return { data: null, error: { message: 'duplicate key' } };
      rows.push({ ...this.patch }); return { data: null, error: null };
    }
    if (this.op === 'upsert') {
      const i = rows.findIndex((r) => r[this.conflict] === this.patch[this.conflict]);
      if (i >= 0) rows[i] = { ...rows[i], ...this.patch }; else rows.push({ ...this.patch });
      return { data: null, error: null };
    }
    if (this.op === 'update') { rows.filter((r) => this.match(r)).forEach((r) => Object.assign(r, this.patch)); return { data: null, error: null }; }
    return { data: rows.filter((r) => this.match(r)).map((r) => ({ ...r })), error: null };
  }
  maybeSingle() { const r = this.run(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error }); }
  then(res, rej) { return Promise.resolve(this.run()).then(res, rej); }
}

export function createClient() {
  return {
    from: (name) => new Q(null, name),
    auth: { getClaims: async (token) => {
      const sub = state.users[token];
      return sub ? { data: { claims: { sub } }, error: null } : { data: null, error: { message: 'bad token' } };
    } },
    rpc: async (fn, args) => {
      state.rpcCalls.push({ fn, args });
      if (fn === 'has_role') return { data: state.admins.has(args._user_id), error: null };
      if (fn === 'confirm_bnpl_payment') {
        const tx = state.tables.bnpl_transactions.find((r) => r.order_id === args._order_id);
        const order = state.tables.orders.find((r) => r.id === args._order_id);
        if (!tx || !order) return { data: 'no_transaction', error: null };
        if (tx.status === 'successful') return { data: tx.provider_reference === args._provider_reference ? 'already_confirmed' : 'different_reference', error: null };
        Object.assign(tx, { status: 'successful', provider_reference: args._provider_reference, is_live: args._is_live, raw_verify: args._raw });
        order.status = 'paid';
        (state.tables.payments ??= []).push({ order_id: order.id, payment_method: tx.provider + '_bnpl' });
        return { data: 'confirmed', error: null };
      }
      return { data: null, error: { message: 'unknown rpc ' + fn } };
    },
  };
}
