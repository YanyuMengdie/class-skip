import { verify } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

export class ProductionAuthError extends Error {
  constructor(public status = 401, message = '请先登录逃课神器，再使用此功能。') { super(message); }
}
const projectId = 'ai-tutor-647fd';
let certificates: { expires: number; values: Record<string, string> } | undefined;
let loading: Promise<Record<string, string>> | undefined;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

async function signingCertificates(): Promise<Record<string, string>> {
  if (certificates && certificates.expires > Date.now()) return certificates.values;
  if (loading) return loading;
  loading = (async () => {
    const response = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com', { signal: AbortSignal.timeout(10_000), redirect: 'error' });
    if (!response.ok) throw new ProductionAuthError(503, '登录验证暂时不可用，请稍后重试。');
    const values: unknown = await response.json();
    if (!object(values) || !Object.values(values).every(value => typeof value === 'string')) throw new ProductionAuthError(503);
    const seconds = Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] ?? 300);
    certificates = { values: values as Record<string, string>, expires: Date.now() + Math.min(seconds, 3600) * 1000 };
    return certificates.values;
  })();
  try { return await loading; } finally { loading = undefined; }
}

/** Validate Firebase's signature, issuer, audience and expiry; a Canvas token is not app authentication. */
export async function requireProductionUser(request: Pick<IncomingMessage, 'headers'>): Promise<string> {
  const token = request.headers['x-classskip-token'];
  if (typeof token !== 'string' || token.length > 16_384) throw new ProductionAuthError();
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw new ProductionAuthError();
  let header: unknown, claims: unknown;
  try { header = JSON.parse(Buffer.from(parts[0], 'base64url').toString()); claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString()); }
  catch { throw new ProductionAuthError(); }
  const now = Date.now() / 1000;
  if (!object(header) || header.alg !== 'RS256' || typeof header.kid !== 'string' || !object(claims)
    || claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}`
    || typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128
    || typeof claims.exp !== 'number' || claims.exp <= now
    || typeof claims.iat !== 'number' || claims.iat > now
    || typeof claims.auth_time !== 'number' || claims.auth_time > now) throw new ProductionAuthError();
  const keys = await signingCertificates();
  if (!Object.hasOwn(keys, header.kid) || !verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), keys[header.kid], Buffer.from(parts[2], 'base64url'))) throw new ProductionAuthError();
  return claims.sub;
}
