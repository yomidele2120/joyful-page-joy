import { beforeEach, describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { STORAGE_KEY, isPublicQuery, restoreQueryCache, saveQueryCache } from './queryPersist';

const make = () => new QueryClient();

describe('public query cache', () => {
  beforeEach(() => window.localStorage.clear());

  it('only treats public, successful queries as saveable', () => {
    expect(isPublicQuery({ queryKey: ['products', {}], state: { status: 'success' } } as never)).toBe(true);
    expect(isPublicQuery({ queryKey: ['categories', 'visible'], state: { status: 'success' } } as never)).toBe(true);
    expect(isPublicQuery({ queryKey: ['products-page', { page: 1 }], state: { status: 'success' } } as never)).toBe(true);
    expect(isPublicQuery({ queryKey: ['products-page', { page: 2 }], state: { status: 'success' } } as never)).toBe(false);
    expect(isPublicQuery({ queryKey: ['products-page', { page: 1, search: 'iphone' }], state: { status: 'success' } } as never)).toBe(false);
    expect(isPublicQuery({ queryKey: ['categories', 'all'], state: { status: 'success' } } as never)).toBe(false);
    expect(isPublicQuery({ queryKey: ['products'], state: { status: 'error' } } as never)).toBe(false);
    expect(isPublicQuery({ queryKey: ['user-orders', 'abc'], state: { status: 'success' } } as never)).toBe(false);
    expect(isPublicQuery({ queryKey: ['admin-payments'], state: { status: 'success' } } as never)).toBe(false);
  });

  it('saves public data and never private data, then restores it', () => {
    const a = make();
    a.setQueryData(['categories', 'visible'], [{ id: '1', name: 'Phones' }]);
    a.setQueryData(['user-orders', 'u1'], [{ id: 'secret-order' }]);
    saveQueryCache(a);

    const stored = window.localStorage.getItem(STORAGE_KEY) ?? '';
    expect(stored).toContain('Phones');
    expect(stored).not.toContain('secret-order');

    const b = make();
    expect(restoreQueryCache(b)).toBe(true);
    expect(b.getQueryData(['categories', 'visible'])).toEqual([{ id: '1', name: 'Phones' }]);
    expect(b.getQueryData(['user-orders', 'u1'])).toBeUndefined();
  });

  it('drops a copy that is too old', () => {
    const a = make();
    a.setQueryData(['categories', 'visible'], [{ id: '1' }]);
    saveQueryCache(a, Date.now() - 25 * 60 * 60 * 1000);
    const b = make();
    expect(restoreQueryCache(b)).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('ignores broken storage', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json');
    expect(restoreQueryCache(make())).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('does nothing when there is nothing public to save', () => {
    const a = make();
    a.setQueryData(['admin-orders'], [1]);
    saveQueryCache(a);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
