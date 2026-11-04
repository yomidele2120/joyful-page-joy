import {
  buildTikTokAuthorizeUrl,
  hasTikTokVideoListScope,
  parseTikTokScopes,
  requiresTikTokVideoList,
} from '../../supabase/functions/tiktok/oauth';
import { mapTikTokOAuthError } from '../lib/functionError';

describe('TikTok OAuth configuration', () => {
  it('uses defaults for an empty scope setting', () => {
    expect(parseTikTokScopes('  , ', true)).toEqual(['user.info.basic', 'video.list']);
  });

  it('trims, drops empty entries, and de-duplicates scopes', () => {
    expect(parseTikTokScopes(' user.info.basic, , video.list,user.info.basic ', true))
      .toEqual(['user.info.basic', 'video.list']);
  });

  it('rejects whitespace-separated and unsupported scopes', () => {
    expect(() => parseTikTokScopes('user.info.basic video.list', true)).toThrow();
    expect(() => parseTikTokScopes('user.info.basic,unknown.scope', false)).toThrow();
  });

  it('permits basic-only Sandbox mode only when video.list is optional', () => {
    expect(parseTikTokScopes('user.info.basic', false)).toEqual(['user.info.basic']);
    expect(() => parseTikTokScopes('user.info.basic', true)).toThrow();
    expect(requiresTikTokVideoList(undefined)).toBe(true);
    expect(requiresTikTokVideoList(' FALSE ')).toBe(false);
    expect(hasTikTokVideoListScope('user.info.basic, video.list')).toBe(true);
  });

  it('builds the TikTok authorize URL with the configured values', () => {
    const authorize = new URL(buildTikTokAuthorizeUrl(
      'client-key',
      'https://techubafrica-nu.vercel.app/tiktok/callback',
      ['user.info.basic', 'video.list'],
      'one-time-state',
    ));

    expect(authorize.origin + authorize.pathname).toBe('https://www.tiktok.com/v2/auth/authorize/');
    expect(authorize.searchParams.get('client_key')).toBe('client-key');
    expect(authorize.searchParams.get('redirect_uri')).toBe('https://techubafrica-nu.vercel.app/tiktok/callback');
    expect(authorize.searchParams.get('response_type')).toBe('code');
    expect(authorize.searchParams.get('scope')).toBe('user.info.basic,video.list');
    expect(authorize.searchParams.get('state')).toBe('one-time-state');
  });
});

describe('TikTok callback errors', () => {
  it('gives actionable Sandbox guidance for server_error', () => {
    expect(mapTikTokOAuthError('server_error'))
      .toBe('Check that every requested scope is added to your TikTok app (Sandbox) and that TIKTOK_SCOPES matches.');
  });

  it('maps denial, non-target, and redirect errors', () => {
    expect(mapTikTokOAuthError('access_denied')).toContain('declined');
    expect(mapTikTokOAuthError('non_sandbox_target')).toContain('Target users');
    expect(mapTikTokOAuthError('invalid_request', 'redirect_uri mismatch')).toContain('exactly match');
  });
});
