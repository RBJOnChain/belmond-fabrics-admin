/**
 * Comprehensive API & Security Test Suite for Belmond Fabrics Admin Panel
 */

import http from 'http';

const ADMIN_URL = 'http://localhost:3001';
let sessionCookie = '';

function request(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    if (sessionCookie && !options.skipCookie) {
      reqOptions.headers['Cookie'] = sessionCookie;
    }

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        const setCookie = res.headers['set-cookie'];
        if (setCookie && !options.skipCookie) {
          sessionCookie = setCookie.map(c => c.split(';')[0]).join('; ');
        }
        let json = null;
        try { json = JSON.parse(data); } catch(e) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
          json
        });
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function runSuite() {
  console.log('🧪 Running Belmond Fabrics Admin Panel Security & Integration Test Suite...\n');
  let passed = 0;
  let failed = 0;

  function test(condition, description) {
    if (condition) {
      console.log(`  ✅ [PASS] ${description}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${description}`);
      failed++;
    }
  }

  // 1. Static asset & HTML tests
  const home = await request(`${ADMIN_URL}/`);
  test(home.status === 200, 'Admin root URL responds with HTTP 200 OK');
  test(home.body.includes('Belmond Fabrics and Tailor'), 'HTML includes brand title');
  test(home.body.includes('Admin Panel'), 'HTML includes Admin Panel badge');
  test(home.body.includes('admin-password-input'), 'HTML renders secure password input gate');
  test(home.body.includes('view-dashboard') && home.body.includes('view-upload') && home.body.includes('view-manage'), 'HTML includes all 3 core views (Dashboard, Upload, Manage)');

  // 2. Unauthenticated access blocked
  const unauthStats = await request(`${ADMIN_URL}/api/stats`, { skipCookie: true });
  test(unauthStats.status === 401, 'Unauthenticated GET /api/stats rejected with 401');

  const unauthDresses = await request(`${ADMIN_URL}/api/dresses`, { skipCookie: true });
  test(unauthDresses.status === 401, 'Unauthenticated GET /api/dresses rejected with 401');

  const unauthUpload = await request(`${ADMIN_URL}/api/dresses/upload`, { method: 'POST', skipCookie: true });
  test(unauthUpload.status === 401, 'Unauthenticated POST /api/dresses/upload rejected with 401');

  const unauthPatch = await request(`${ADMIN_URL}/api/dresses/test-id/visibility`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    skipCookie: true
  }, JSON.stringify({ is_visible: false }));
  test(unauthPatch.status === 401, 'Unauthenticated PATCH /api/dresses/:id/visibility rejected with 401');

  const unauthDelete = await request(`${ADMIN_URL}/api/dresses/test-id`, { method: 'DELETE', skipCookie: true });
  test(unauthDelete.status === 401, 'Unauthenticated DELETE /api/dresses/:id rejected with 401');

  // 3. Password Verification
  const badLogin = await request(`${ADMIN_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({ password: 'wrong_password_999' }));
  test(badLogin.status === 401, 'Incorrect password rejected with 401');
  test(badLogin.json?.error === 'Incorrect admin password', 'Returns descriptive message on wrong password');

  const goodLogin = await request(`${ADMIN_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({ password: 'belmond_admin_2026' }));
  test(goodLogin.status === 200, 'Correct password accepted with 200 OK');
  test(goodLogin.headers['set-cookie']?.[0]?.includes('HttpOnly'), 'Session cookie has HttpOnly flag set');
  test(Boolean(sessionCookie), 'Client received session cookie token');

  // 4. Authenticated Session Checks
  const me = await request(`${ADMIN_URL}/api/auth/me`);
  test(me.status === 200 && me.json?.authenticated === true, 'GET /api/auth/me confirms authenticated session');

  const stats = await request(`${ADMIN_URL}/api/stats`);
  test(stats.status === 200, 'GET /api/stats succeeds with valid session');
  test(typeof stats.json?.total === 'number' && typeof stats.json?.published === 'number' && typeof stats.json?.hidden === 'number', 'Stats payload returns total, published, and hidden counts');

  const dresses = await request(`${ADMIN_URL}/api/dresses`);
  test(dresses.status === 200 && Array.isArray(dresses.json?.dresses), 'GET /api/dresses succeeds with valid session and returns array');

  // 5. Logout flow
  const logout = await request(`${ADMIN_URL}/api/auth/logout`, { method: 'POST' });
  test(logout.status === 200, 'POST /api/auth/logout returns 200 OK');
  test(logout.headers['set-cookie']?.[0]?.includes('Expires=') || logout.headers['set-cookie']?.[0]?.includes('Max-Age=0'), 'Logout clears session cookie');

  // Re-verify after logout
  const meAfterLogout = await request(`${ADMIN_URL}/api/auth/me`);
  test(meAfterLogout.status === 401, 'Session invalid after logout (401)');

  console.log(`\n=========================================`);
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`=========================================\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runSuite();
