const fs = require('fs');
const path = require('path');

// 1. Load Environment Config
const envPath = 'c:\\Users\\User\\Desktop\\School_website_antigravity\\mge-portal-clean\\.env';
const config = {};
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const lines = envContent.split('\n');
  for (const line of lines) {
    const trimmed = line.strip ? line.strip() : line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const parts = trimmed.split('=', 2);
      if (parts.length === 2) {
        config[parts[0].trim()] = parts[1].trim().replace(/^["']|["']$/g, '');
      }
    }
  }
}

const jwtSecretStr = config.JWT_SECRET || 'fallback-dev-secret-change-in-production';
const jwtSecret = new TextEncoder().encode(jwtSecretStr);

// Load jose modules dynamically
const { SignJWT } = require('c:\\Users\\User\\Desktop\\School_website_antigravity\\mge-portal-clean\\node_modules\\jose');

// 2. Generate Tokens
async function generateTokens() {
  const jti = Math.random().toString(36).substring(7);
  
  // Portal session token (expiring in 1 hour)
  const sessionToken = await new SignJWT({
    userId: '770c1354-6619-4157-9b44-28a17b5fd6fb',
    username: 'devilal1983@mgportal.com',
    role: 'DIRECTOR',
    accessUnits: ["hindi", "english", "college", "hostel", "transport"],
    name: 'Mr. Devilal Kumawat',
    jti
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .setIssuer('mge-portal')
    .setJti(jti)
    .sign(jwtSecret);

  // Gateway token
  const gatewayToken = await new SignJWT({
    email: 'devilal1983@mgportal.com',
    whitelisted: true
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .setIssuer('mge-gateway')
    .sign(jwtSecret);

  return { sessionToken, gatewayToken };
}

// 3. Test Endpoints Runner
async function runTests() {
  console.log('Generating authentication tokens...');
  const { sessionToken, gatewayToken } = await generateTokens();
  
  const cookieHeader = `mge-session=${sessionToken}; mge-gateway-session=${gatewayToken}`;

  const endpoints = [
    { name: 'Health Check', path: '/api/health', method: 'GET' },
    { name: 'Auth Check (Me)', path: '/api/auth/me', method: 'GET', auth: true },
    { name: 'Dashboard Summary', path: '/api/dashboard/summary', method: 'GET', auth: true },
    { name: 'Students Directory', path: '/api/students?limit=2', method: 'GET', auth: true },
    { name: 'Staff Directory', path: '/api/staff?limit=2', method: 'GET', auth: true },
    { name: 'Hostel Summary', path: '/api/hostel/summary', method: 'GET', auth: true },
    { name: 'Transport Dashboard', path: '/api/transport/dashboard', method: 'GET', auth: true },
    { name: 'Chart of Accounts', path: '/api/accounts/chart', method: 'GET', auth: true },
    { name: 'Finance Monthly Summary', path: '/api/finance/monthly-summary', method: 'GET', auth: true },
    { name: 'Core Management Summary', path: '/api/core-management/summary', method: 'GET', auth: true },
    { name: 'Users List', path: '/api/users', method: 'GET', auth: true }
  ];

  console.log('\nStarting API verification checks...\n');
  const results = [];

  for (const ep of endpoints) {
    const url = `http://localhost:3000${ep.path}`;
    const headers = ep.auth ? { 'Cookie': cookieHeader } : {};
    
    try {
      const start = Date.now();
      const res = await fetch(url, {
        method: ep.method,
        headers: headers
      });
      const duration = Date.now() - start;
      const status = res.status;
      let bodyText = '';
      try {
        const data = await res.json();
        bodyText = JSON.stringify(data).substring(0, 100);
      } catch {
        bodyText = '(non-JSON response)';
      }
      
      const success = status >= 200 && status < 400;
      console.log(`[${success ? 'PASS' : 'FAIL'}] ${ep.name} (${ep.path})`);
      console.log(`       Status: ${status} | Time: ${duration}ms | Data: ${bodyText}`);
      
      results.push({ ...ep, status, duration, success, dataPreview: bodyText });
    } catch (err) {
      console.log(`[ERROR] ${ep.name} (${ep.path}): ${err.message}`);
      results.push({ ...ep, status: 'ERROR', duration: 0, success: false, dataPreview: err.message });
    }
  }

  // 4. Generate Markdown Report
  console.log('\nGenerating test report markdown...');
  let report = '# MGE School Portal API Verification Report\n\n';
  report += `Run time: ${new Date().toISOString()}\n\n`;
  report += '| API Endpoint Name | HTTP Method | Path | Status Code | Latency | Result |\n';
  report += '| :--- | :--- | :--- | :--- | :--- | :--- |\n';
  
  for (const r of results) {
    const icon = r.success ? '✅ PASS' : '❌ FAIL';
    report += `| ${r.name} | ${r.method} | \`${r.path}\` | ${r.status} | ${r.duration}ms | ${icon} |\n`;
  }
  
  report += '\n### Response Data Previews\n';
  for (const r of results) {
    report += `* **${r.name}**: \`${r.dataPreview}\`\n`;
  }

  const reportPath = 'C:\\Users\\User\\.gemini\\antigravity\\brain\\e42578c5-e974-4a23-a294-e5512b4c78dd\\walkthrough.md';
  fs.writeFileSync(reportPath, report);
  console.log(`Report successfully written to ${reportPath}`);
}

runTests().catch(console.error);
