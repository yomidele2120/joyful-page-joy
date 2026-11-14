// The test installs globalThis.__createClient to supply a fake database client.
export const createClient = (...args) => globalThis.__createClient(...args);
