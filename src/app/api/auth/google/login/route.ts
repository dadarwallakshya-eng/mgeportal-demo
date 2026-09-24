import { NextResponse, type NextRequest } from 'next/server';
import { google } from 'googleapis';
import crypto from 'crypto';

export async function GET(request: NextRequest) {
  try {
    const clientId = process.env.GOOGLE_GATEWAY_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_GATEWAY_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error('[GOOGLE_GATEWAY_LOGIN] Missing Google credentials in environment.');
      return NextResponse.json({ error: 'OAuth credentials not configured' }, { status: 500 });
    }

    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https';
    const redirectUri = `${protocol}://${host}/api/auth/google/callback`;

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    // Generate secure random values for CSRF state, PKCE verifier/challenge, and nonce
    const stateToken = crypto.randomBytes(32).toString('hex');
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64url');
    const nonce = crypto.randomBytes(32).toString('hex');

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'online', // Restrict to online access as requested
      scope: [
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
      prompt: 'select_account',
      state: stateToken,
      code_challenge: challenge,
      code_challenge_method: 'S256' as any,
      nonce: nonce,
    });

    const response = NextResponse.redirect(authUrl);

    // Set secure cookies for validation in the callback handler
    const isProd = process.env.NODE_ENV === 'production';
    const cookieOptions = {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 300, // 5 minutes
    };

    const actionParam = request.nextUrl.searchParams.get('action');
    if (actionParam === 'mfa_reset') {
      response.cookies.set('google_oauth_action', 'mfa_reset', cookieOptions);
    }

    response.cookies.set('google_oauth_state', stateToken, cookieOptions);
    response.cookies.set('google_oauth_verifier', verifier, cookieOptions);
    response.cookies.set('google_oauth_nonce', nonce, cookieOptions);

    return response;
  } catch (error) {
    console.error('[GOOGLE_GATEWAY_LOGIN] Error generating auth URL:', error);
    return NextResponse.json({ error: 'Failed to initiate Google sign-in' }, { status: 500 });
  }
}

