import { NextResponse, type NextRequest } from 'next/server';
import { google } from 'googleapis';
import prisma from '@/lib/prisma';
import { createGatewayToken, setGatewaySession } from '@/lib/gateway';

export async function GET(request: NextRequest) {
  // Helper to construct error response with cleared security cookies
  const createErrorResponse = (message: string, status: number) => {
    const errorResponse = NextResponse.json({ error: message }, { status });
    errorResponse.cookies.set('google_oauth_state', '', { maxAge: 0, path: '/' });
    errorResponse.cookies.set('google_oauth_verifier', '', { maxAge: 0, path: '/' });
    errorResponse.cookies.set('google_oauth_nonce', '', { maxAge: 0, path: '/' });
    return errorResponse;
  };

  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const stateParam = searchParams.get('state');

    if (!code) {
      return createErrorResponse('Authorization code is missing', 400);
    }

    // Retrieve security parameters from cookies
    const stateCookie = request.cookies.get('google_oauth_state')?.value;
    const verifierCookie = request.cookies.get('google_oauth_verifier')?.value;
    const nonceCookie = request.cookies.get('google_oauth_nonce')?.value;

    // 1. Verify CSRF State Parameter
    if (!stateCookie || !stateParam || stateCookie !== stateParam) {
      console.error('[GOOGLE_GATEWAY_CALLBACK] CSRF state parameter validation failed.');
      return createErrorResponse('CSRF validation failed: State parameter mismatch or expired', 400);
    }

    // 2. Verify PKCE Verifier exists
    if (!verifierCookie) {
      console.error('[GOOGLE_GATEWAY_CALLBACK] PKCE code verifier is missing from cookies.');
      return createErrorResponse('PKCE validation failed: Code verifier is missing or expired', 400);
    }

    const clientId = process.env.GOOGLE_GATEWAY_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_GATEWAY_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error('[GOOGLE_GATEWAY_CALLBACK] Missing Google credentials in environment.');
      return createErrorResponse('OAuth credentials not configured', 500);
    }

    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https';
    const redirectUri = `${protocol}://${host}/api/auth/google/callback`;

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    // Exchange authorization code for tokens using the PKCE code verifier
    const { tokens } = await oauth2Client.getToken({
      code,
      codeVerifier: verifierCookie,
    });
    oauth2Client.setCredentials(tokens);

    // 3. Verify Nonce inside the ID Token (protects against token replay attacks)
    if (!tokens.id_token) {
      console.error('[GOOGLE_GATEWAY_CALLBACK] ID Token is missing from Google response.');
      return createErrorResponse('Token validation failed: Missing ID token', 400);
    }

    try {
      const parts = tokens.id_token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWT format');
      }
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
      
      if (!nonceCookie || payload.nonce !== nonceCookie) {
        console.error('[GOOGLE_GATEWAY_CALLBACK] Nonce validation failed. Stored:', nonceCookie, 'Received:', payload.nonce);
        return createErrorResponse('Token validation failed: Nonce parameter mismatch', 400);
      }
    } catch (e: any) {
      console.error('[GOOGLE_GATEWAY_CALLBACK] Error parsing or validating ID token nonce:', e.message);
      return createErrorResponse('Token validation failed: Invalid ID token payload', 400);
    }

    // Fetch user info from Google
    const oauth2 = google.oauth2({ auth: oauth2Client, version: 'v2' });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email?.toLowerCase();

    if (!email) {
      return createErrorResponse('Failed to retrieve email from Google', 400);
    }

    // Check whitelist
    const whitelistEntry = await prisma.googleWhitelist.findUnique({
      where: { email },
    });

    if (!whitelistEntry) {
      console.warn(`[GOOGLE_GATEWAY_CALLBACK] Access denied for non-whitelisted email: ${email}`);
      // Redirect to school showcase website as requested, clearing cookies
      const fallbackResponse = NextResponse.redirect('https://newmodernkct.in/');
      fallbackResponse.cookies.set('google_oauth_state', '', { maxAge: 0, path: '/' });
      fallbackResponse.cookies.set('google_oauth_verifier', '', { maxAge: 0, path: '/' });
      fallbackResponse.cookies.set('google_oauth_nonce', '', { maxAge: 0, path: '/' });
      fallbackResponse.cookies.set('google_oauth_from', '', { maxAge: 0, path: '/' });
      return fallbackResponse;
    }

    console.log(`[GOOGLE_GATEWAY_CALLBACK] Whitelisted email verified: ${email}`);

    // Check if this OAuth flow was initiated for 2FA Reset
    const oauthAction = request.cookies.get('google_oauth_action')?.value;
    if (oauthAction === 'mfa_reset') {
      // Find matching user profile by username/email
      const matchedUser = await prisma.user.findFirst({
        where: {
          OR: [
            { username: email },
            { username: email.split('@')[0] }
          ]
        }
      });

      if (matchedUser) {
        await prisma.user.update({
          where: { id: matchedUser.id },
          data: { totpSecret: null, isTotpEnabled: false }
        });
        console.log(`[GOOGLE_MFA_RESET] 2FA reset via Google OAuth for user: ${matchedUser.username}`);
      } else {
        // Fallback: reset 2FA for all users if whitelisted owner
        await prisma.user.updateMany({
          data: { totpSecret: null, isTotpEnabled: false }
        });
        console.log(`[GOOGLE_MFA_RESET] 2FA reset via Google OAuth for whitelisted owner: ${email}`);
      }

      const resetRedirectUrl = `${protocol}://${host}/login?mfa_reset=success`;
      const response = NextResponse.redirect(resetRedirectUrl);
      const gatewayToken = await createGatewayToken(email);
      setGatewaySession(response, gatewayToken);

      response.cookies.set('google_oauth_state', '', { maxAge: 0, path: '/' });
      response.cookies.set('google_oauth_verifier', '', { maxAge: 0, path: '/' });
      response.cookies.set('google_oauth_nonce', '', { maxAge: 0, path: '/' });
      response.cookies.set('google_oauth_action', '', { maxAge: 0, path: '/' });
      return response;
    }

    // Create session token and response redirect to portal login page or preserved URL
    const gatewayToken = await createGatewayToken(email);
    
    // Retrieve destination path from cookie
    const fromPath = request.cookies.get('google_oauth_from')?.value;
    const targetUrl = fromPath ? `${protocol}://${host}${fromPath}` : `${protocol}://${host}/login`;
    
    const response = NextResponse.redirect(targetUrl);
    
    // Set the secure session cookie
    setGatewaySession(response, gatewayToken);

    // Clear temporary OAuth validation cookies
    response.cookies.set('google_oauth_state', '', { maxAge: 0, path: '/' });
    response.cookies.set('google_oauth_verifier', '', { maxAge: 0, path: '/' });
    response.cookies.set('google_oauth_nonce', '', { maxAge: 0, path: '/' });
    response.cookies.set('google_oauth_action', '', { maxAge: 0, path: '/' });
    response.cookies.set('google_oauth_from', '', { maxAge: 0, path: '/' });

    return response;
  } catch (error) {
    console.error('[GOOGLE_GATEWAY_CALLBACK] Error in callback handler:', error);
    return createErrorResponse('Authentication failed', 500);
  }
}

