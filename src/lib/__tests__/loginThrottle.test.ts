import { beforeEach, describe, expect, it } from 'vitest';
import { formatWait, lockoutSecondsRemaining, recordSignInFailure, recordSignInSuccess } from '@/lib/loginThrottle';

describe('sign-in throttle', () => {
  beforeEach(() => { window.sessionStorage.clear(); recordSignInSuccess(); });

  it('allows a few wrong passwords, then locks for a short time', () => {
    for (let i = 0; i < 4; i++) recordSignInFailure();
    expect(lockoutSecondsRemaining()).toBe(0);
    recordSignInFailure();
    expect(lockoutSecondsRemaining()).toBeGreaterThan(0);
    expect(lockoutSecondsRemaining()).toBeLessThanOrEqual(30);
  });

  it('locks for longer after more failures but never more than 15 minutes', () => {
    for (let i = 0; i < 30; i++) recordSignInFailure();
    expect(lockoutSecondsRemaining()).toBeLessThanOrEqual(15 * 60);
    expect(lockoutSecondsRemaining()).toBeGreaterThan(60);
  });

  it('clears after a successful sign-in', () => {
    for (let i = 0; i < 6; i++) recordSignInFailure();
    recordSignInSuccess();
    expect(lockoutSecondsRemaining()).toBe(0);
  });

  it('formats waits for people', () => {
    expect(formatWait(30)).toBe('30 seconds');
    expect(formatWait(61)).toBe('2 minutes');
  });
});
