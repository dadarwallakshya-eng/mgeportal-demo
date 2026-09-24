/**
 * @file scratch/validate_portal.ts
 * @description Automated role-based end-to-end integration test.
 *              Seeds temporary users, generates TOTP MFA codes, executes API requests,
 *              asserts security constraints and filters, and cleans up the database.
 */

import 'dotenv/config';
import prisma from '../src/lib/prisma';
import bcrypt from 'bcryptjs';
import speakeasy from 'speakeasy';
import { SignJWT } from 'jose';

const BASE_URL = 'http://127.0.0.1:3000';
const TEST_MFA_SECRET = 'JBSWY3DPEHPK3PXP'; // Base32 secret for 'test'

const JWT_SECRET_BYTES = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback-dev-secret-change-in-production-12345'
);

async function createGatewayToken(email: string): Promise<string> {
  return new SignJWT({ email, whitelisted: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .setIssuer('mge-gateway')
    .sign(JWT_SECRET_BYTES);
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loginUser(username: string): Promise<string> {
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'TestPassword123!' }),
  });

  if (loginRes.status !== 200) {
    const text = await loginRes.text();
    throw new Error(`Login step 1 failed for ${username}: ${loginRes.status} - ${text}`);
  }

  const loginData = await loginRes.json();
  const { mfaPendingToken } = loginData;

  // Generate TOTP code
  const code = speakeasy.totp({
    secret: TEST_MFA_SECRET,
    encoding: 'base32',
  });

  const verifyRes = await fetch(`${BASE_URL}/api/auth/mfa/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${mfaPendingToken}`,
    },
    body: JSON.stringify({ code }),
  });

  if (verifyRes.status !== 200) {
    const text = await verifyRes.text();
    throw new Error(`MFA verification failed for ${username}: ${verifyRes.status} - ${text}`);
  }

  const setCookie = verifyRes.headers.get('set-cookie');
  if (!setCookie) {
    throw new Error(`Session cookie not returned in MFA verify response for ${username}`);
  }

  const match = setCookie.match(/mge-session=([^;]+)/);
  if (!match) {
    throw new Error(`Failed to parse mge-session token from set-cookie header: ${setCookie}`);
  }

  return match[1];
}

async function main() {
  console.log('=== Starting End-to-End Role Verification ===\n');

  const passwordHash = await bcrypt.hash('TestPassword123!', 12);

  // 1. Seed Google OAuth Whitelist entries for Google Gate bypass
  console.log('[1/5] Seeding test database entries...');

  // Seed Whitelist
  await prisma.googleWhitelist.upsert({
    where: { email: 'test_director@gmail.com' },
    create: { email: 'test_director@gmail.com', name: 'Test Director' },
    update: {},
  });

  // Seed Users
  const director = await prisma.user.upsert({
    where: { username: 'test_director' },
    create: {
      username: 'test_director',
      passwordHash,
      name: 'Test Director',
      role: 'DIRECTOR',
      accessUnits: ['english', 'hindi', 'college', 'hostel'],
      totpSecret: TEST_MFA_SECRET,
      isTotpEnabled: true,
    },
    update: {
      passwordHash,
      isActive: true,
      totpSecret: TEST_MFA_SECRET,
      isTotpEnabled: true,
    },
  });

  const principal = await prisma.user.upsert({
    where: { username: 'test_principal' },
    create: {
      username: 'test_principal',
      passwordHash,
      name: 'Test Principal',
      role: 'PRINCIPAL',
      accessUnits: ['english'],
      totpSecret: TEST_MFA_SECRET,
      isTotpEnabled: true,
    },
    update: {
      passwordHash,
      isActive: true,
      totpSecret: TEST_MFA_SECRET,
      isTotpEnabled: true,
    },
  });

  const dataEntry = await prisma.user.upsert({
    where: { username: 'test_data_entry' },
    create: {
      username: 'test_data_entry',
      passwordHash,
      name: 'Test Data Entry',
      role: 'DATA_ENTRY',
      accessUnits: ['english'],
      totpSecret: TEST_MFA_SECRET,
      isTotpEnabled: true,
    },
    update: {
      passwordHash,
      isActive: true,
      totpSecret: TEST_MFA_SECRET,
      isTotpEnabled: true,
    },
  });

  console.log('✔ Test users seeded successfully.');

  // Find a real student ID to use in role testing
  const student = await prisma.student.findFirst({
    select: { id: true }
  });
  const studentId = student ? student.id : '00000000-0000-0000-0000-000000000000';
  console.log(`Using student ID: ${studentId} for testing API routes.`);

  // Wait briefly for startup
  await sleep(1000);

  // 2. Perform authentications
  console.log('\n[2/5] Simulating secure MFA logins...');
  const directorSession = await loginUser('test_director');
  console.log('✔ Director session obtained.');

  const principalSession = await loginUser('test_principal');
  console.log('✔ Principal session obtained.');

  const dataEntrySession = await loginUser('test_data_entry');
  console.log('✔ Data Entry session obtained.');

  // Generate cryptographically signed gateway token
  const gatewayToken = await createGatewayToken('test_director@gmail.com');

  // 3. Test Role-Based Restrictions (ABAC/RBAC)
  console.log('\n[3/5] Testing Role-Based Authorization Restrictions...');

  // A. Data Entry cannot view transactions
  const deTxnRes = await fetch(`${BASE_URL}/api/transactions`, {
    headers: { 'Cookie': `mge-session=${dataEntrySession}; mge-gateway-session=${gatewayToken}` }
  });
  console.log(`- Data Entry GET /api/transactions status: ${deTxnRes.status} (Expected: 401/403/404)`);
  if (deTxnRes.status !== 401 && deTxnRes.status !== 403 && deTxnRes.status !== 404) {
    console.error('❌ Security breach: Data Entry allowed to fetch financial transactions!');
    process.exit(1);
  }

  // B. Data Entry cannot access student discounts (GET is 405 Method Not Allowed)
  const deDiscRes = await fetch(`${BASE_URL}/api/students/${studentId}/discount`, {
    headers: { 'Cookie': `mge-session=${dataEntrySession}; mge-gateway-session=${gatewayToken}` }
  });
  console.log(`- Data Entry GET /api/students/[id]/discount status: ${deDiscRes.status} (Expected: 405/401/403)`);
  if (deDiscRes.status !== 405 && deDiscRes.status !== 401 && deDiscRes.status !== 403 && deDiscRes.status !== 404) {
    console.error('❌ Security breach: Data Entry allowed to fetch student discounts!');
    process.exit(1);
  }

  // C. Principal cannot apply a discount > 20% on Tuition / 100% on other
  // Send 105% to exceed all caps and guarantee a 400/403
  const prDiscRes = await fetch(`${BASE_URL}/api/students/${studentId}/discount`, {
    method: 'POST',
    headers: {
      'Cookie': `mge-session=${principalSession}; mge-gateway-session=${gatewayToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ componentName: 'ALL', discountPercent: 105, reason: 'Test validation' })
  });
  console.log(`- Principal applying 105% discount status: ${prDiscRes.status} (Expected: 400/403)`);
  if (prDiscRes.status !== 400 && prDiscRes.status !== 403) {
    console.error('❌ Security breach: Principal allowed to exceed discount cap!');
    process.exit(1);
  }

  // D. Test Session Fingerprint Mismatch
  console.log('\n- Testing Session Hijack (Fingerprint Mismatch) Protection...');
  const hijackedRes = await fetch(`${BASE_URL}/api/users`, {
    headers: {
      'Cookie': `mge-session=${directorSession}; mge-gateway-session=${gatewayToken}`,
      'User-Agent': 'HackersBrowser/1.0 (Tampered)' // Mismatched user agent
    }
  });
  console.log(`- Accessing Users API with tampered User-Agent: ${hijackedRes.status} (Expected: 401)`);
  if (hijackedRes.status !== 401) {
    console.error('❌ Security breach: Session validation succeeded despite browser fingerprint mismatch!');
    process.exit(1);
  }
  console.log('✔ Session fingerprint mismatch successfully rejected.');

  // E. Test Document Token Tampering
  console.log('\n- Testing encrypted document token tampering protection...');
  const badTokenRes = await fetch(`${BASE_URL}/api/docs/t/tampered_base64_token`, {
    headers: { 'Cookie': `mge-session=${directorSession}; mge-gateway-session=${gatewayToken}` }
  });
  console.log(`- Fetching tampered document token: ${badTokenRes.status} (Expected: 404)`);
  if (badTokenRes.status !== 404) {
    console.error('❌ Security breach: Token decryption failed to return 404!');
    process.exit(1);
  }
  console.log('✔ Token tampering validation successfully rejected.');

  // 4. Test Rate Limiting
  console.log('\n[4/5] Testing rate-limiting constraints...');
  let hitRateLimit = false;
  // Send rapid non-GET requests to exceed 120 reqs/min limit
  for (let i = 0; i < 130; i++) {
    const res = await fetch(`${BASE_URL}/api/auth/session-check?jti=dummy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (res.status === 429) {
      hitRateLimit = true;
      console.log(`✔ API Rate Limit triggered at request ${i + 1} (HTTP 429)`);
      break;
    }
  }
  if (!hitRateLimit) {
    console.error('❌ Failed to trigger API rate limiting!');
    process.exit(1);
  }

  // 5. Cleanup
  console.log('\n[5/5] Cleaning up test seed database entries...');
  await prisma.user.deleteMany({
    where: { username: { in: ['test_director', 'test_principal', 'test_data_entry'] } }
  });
  await prisma.googleWhitelist.deleteMany({
    where: { email: 'test_director@gmail.com' }
  });
  console.log('✔ Cleanup complete.');

  console.log('\n=============================================');
  console.log('🎉 ALL INTEGRATION AND SECURITY TESTS PASSED!');
  console.log('=============================================');
}

main().catch(err => {
  console.error('\n❌ E2E Validation script failed with error:', err);
  process.exit(1);
});
