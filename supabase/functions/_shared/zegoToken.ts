// ZEGOCLOUD "token04" generator (the basic-authentication token used by Call Kit, Express and In-app Chat/ZIM).
// Written for Deno / Web Crypto so it runs inside a Supabase edge function. It follows the layout of ZEGOCLOUD's open-source
// token generator (zego_server_assistant, generateToken04):
//     token = "04" + base64( expire:int64-BE | ivLength:uint16-BE | iv | cipherLength:uint16-BE | cipher )
//     cipher = AES-CBC(key = ServerSecret as UTF-8, iv = 16 random chars) of the JSON
//              { app_id, user_id, nonce, ctime, expire, payload }
// The AES key size follows the ServerSecret length (16 / 24 / 32 characters; ZEGOCLOUD secrets are 32).
// The ServerSecret never leaves the server.

const ALPHANUM = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function randomIv(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => ALPHANUM[b % ALPHANUM.length]).join('');
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export interface Token04Options { payload?: string; nowMs?: number }

export async function generateToken04(
  appId: number, userId: string, secret: string, effectiveSeconds: number, opts: Token04Options = {},
): Promise<string> {
  if (!Number.isInteger(appId) || appId <= 0) throw new Error('appId must be a positive integer');
  if (!userId || userId.length > 64) throw new Error('userId is required');
  if (![16, 24, 32].includes(secret.length)) throw new Error('ServerSecret must be 16, 24 or 32 characters');
  if (!Number.isInteger(effectiveSeconds) || effectiveSeconds <= 0) throw new Error('effectiveSeconds must be a positive integer');

  const ctime = Math.floor((opts.nowMs ?? Date.now()) / 1000);
  const expire = ctime + effectiveSeconds;
  const info = {
    app_id: appId, user_id: userId,
    nonce: crypto.getRandomValues(new Int32Array(1))[0],
    ctime, expire, payload: opts.payload ?? '',
  };

  const enc = new TextEncoder();
  const iv = randomIv();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'AES-CBC' }, false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv: enc.encode(iv) }, key, enc.encode(JSON.stringify(info))));

  const out = new Uint8Array(8 + 2 + iv.length + 2 + cipher.length);
  const view = new DataView(out.buffer);
  view.setBigInt64(0, BigInt(expire), false);
  view.setUint16(8, iv.length, false);
  out.set(enc.encode(iv), 10);
  view.setUint16(10 + iv.length, cipher.length, false);
  out.set(cipher, 12 + iv.length);
  return '04' + toBase64(out);
}

/** ZEGOCLOUD user ids are at most 32 bytes of letters/digits, so a UUID is sent without its dashes (exactly 32 characters). */
export const toZegoUserId = (uuid: string) => uuid.replace(/-/g, '').toLowerCase();
