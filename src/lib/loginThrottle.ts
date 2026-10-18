// A friendly brake on repeated wrong passwords. This is only a convenience for honest users: the real
// rate limiting happens in Supabase Auth (and CAPTCHA, when enabled), which a script cannot skip.

const KEY = 'ithub.signin-failures';
const FREE_ATTEMPTS = 5;
const MAX_LOCK_SECONDS = 15 * 60;

interface ThrottleState { count: number; lockedUntil: number }
let memory: ThrottleState = { count: 0, lockedUntil: 0 };

function read(): ThrottleState {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ThrottleState>;
      return { count: Number(parsed.count) || 0, lockedUntil: Number(parsed.lockedUntil) || 0 };
    }
  } catch { /* storage blocked: use memory */ }
  return memory;
}

function write(state: ThrottleState) {
  memory = state;
  try { window.sessionStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

export function lockoutSecondsRemaining(): number {
  return Math.max(0, Math.ceil((read().lockedUntil - Date.now()) / 1000));
}

export function recordSignInFailure() {
  const state = read();
  const count = state.count + 1;
  const lockSeconds = count >= FREE_ATTEMPTS ? Math.min(MAX_LOCK_SECONDS, 30 * 2 ** (count - FREE_ATTEMPTS)) : 0;
  write({ count, lockedUntil: lockSeconds ? Date.now() + lockSeconds * 1000 : 0 });
}

export function recordSignInSuccess() {
  write({ count: 0, lockedUntil: 0 });
}

export function formatWait(seconds: number): string {
  return seconds >= 60 ? `${Math.ceil(seconds / 60)} minute${seconds > 60 ? 's' : ''}` : `${seconds} seconds`;
}
