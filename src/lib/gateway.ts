import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const GATEWAY_COOKIE = 'mge-gateway-session';
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is missing in production!');
}
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback-dev-secret-change-in-production'
);

export interface GatewayPayload {
  email: string;
  whitelisted: boolean;
}

export async function createGatewayToken(email: string): Promise<string> {
  return new SignJWT({ email, whitelisted: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h') // Gateway session lasts 24 hours
    .setIssuer('mge-gateway')
    .sign(JWT_SECRET);
}

export async function verifyGatewayToken(token: string): Promise<GatewayPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: 'mge-gateway',
    });
    return payload as unknown as GatewayPayload;
  } catch {
    return null;
  }
}

export function setGatewaySession(response: NextResponse, token: string): NextResponse {
  const isProd = process.env.NODE_ENV === 'production';
  response.cookies.set(GATEWAY_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 24 * 3600, // 24 hours
  });
  return response;
}

export async function getGatewaySession(): Promise<GatewayPayload | null> {
  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(GATEWAY_COOKIE);
    if (!cookie?.value) return null;
    return await verifyGatewayToken(cookie.value);
  } catch {
    return null;
  }
}
