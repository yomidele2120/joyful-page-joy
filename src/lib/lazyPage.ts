import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

// Loads a page's code only when it is visited, and lets us start that download early (preload).
// If a visitor has the site open across a new deploy, the old page can ask for a code file that no longer
// exists. In that case reload once to pick up the new version instead of showing a blank screen.
const RELOAD_FLAG = 'ithub-chunk-reload';

export type LazyPage<T extends ComponentType<never>> = LazyExoticComponent<T> & { preload: () => Promise<unknown> };

export function lazyPage<T extends ComponentType<never>>(factory: () => Promise<{ default: T }>): LazyPage<T> {
  const load = () =>
    factory().then(
      mod => {
        try { window.sessionStorage.removeItem(RELOAD_FLAG); } catch { /* storage unavailable */ }
        return mod;
      },
      (err: unknown) => {
        let alreadyReloaded = true;
        try {
          alreadyReloaded = window.sessionStorage.getItem(RELOAD_FLAG) === '1';
          if (!alreadyReloaded) window.sessionStorage.setItem(RELOAD_FLAG, '1');
        } catch { /* storage unavailable: do not loop */ }
        if (!alreadyReloaded) {
          window.location.reload();
          return new Promise<never>(() => { /* page is reloading */ });
        }
        throw err;
      },
    );
  // Preloading is only a head start: if it fails (for example offline) nothing should happen or reload.
  return Object.assign(lazy(load), { preload: () => factory().catch(() => undefined) });
}
