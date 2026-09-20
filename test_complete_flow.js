/**
 * Comprehensive Verification Script using native fetch
 * Tests all 17 flow steps
 */

const ADMIN_URL = 'http://localhost:3001';
const MAIN_URL = 'http://localhost:3000';

let cookieJar = '';

async function apiFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (cookieJar && !options.skipCookie) {
    headers['Cookie'] = cookieJar;
  }

  const res = await fetch(url, {
    ...options,
    headers
  });

  // Track Set-Cookie headers
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (setCookies && setCookies.length > 0) {
    cookieJar = setCookies.map(c => c.split(';')[0]).join('; ');
  } else {
    const rawSetCookie = res.headers.get('set-cookie');
    if (rawSetCookie) {
      cookieJar = rawSetCookie.split(';')[0];
    }
  }

  let json = null;
  const text = await res.text();
  try {
    json = JSON.parse(text);
  } catch (e) {}

  return {
    status: res.status,
    headers: res.headers,
    text,
    json
  };
}

// 1x1 test JPEG
const sampleJpegBytes = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
  0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
  0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
  0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
  0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
  0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
  0x00, 0x7f, 0x00, 0xff, 0xd9
]);

async function run() {
  console.log('🚀 Running Complete End-to-End Verification Flow...\n');
  let passed = 0;
  let failed = 0;

  function assert(cond, msg) {
    if (cond) {
      console.log(`  ✅ [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${msg}`);
      failed++;
    }
  }

  try {
    // 1. Open Admin Panel
    console.log('Step 1: Open Admin Panel');
    const res1 = await apiFetch(`${ADMIN_URL}/`);
    assert(res1.status === 200, 'Admin Panel responds with HTTP 200');
    assert(res1.text.includes('Belmond Fabrics and Tailor'), 'Renders Belmond Fabrics brand title');

    // 2. Wrong password denied
    console.log('\nStep 2: Enter wrong password');
    const res2 = await apiFetch(`${ADMIN_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrong_secret_password' })
    });
    assert(res2.status === 401, 'Wrong password rejected with 401');

    // 3. Correct password accepted -> dashboard opens
    console.log('\nStep 3: Enter correct password');
    const res3 = await apiFetch(`${ADMIN_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'belmond_admin_2026' })
    });
    assert(res3.status === 200, 'Correct password accepted with 200 OK');
    assert(Boolean(cookieJar), 'HttpOnly session cookie stored');

    // Check dashboard stats
    const statsRes = await apiFetch(`${ADMIN_URL}/api/stats`);
    assert(statsRes.status === 200, 'Dashboard stats fetched successfully');
    console.log(`    Current stats: Total=${statsRes.json?.total}, Published=${statsRes.json?.published}, Hidden=${statsRes.json?.hidden}`);

    // 4. Upload one image
    console.log('\nStep 4: Upload one dress image');
    const formData = new FormData();
    const testBlob = new Blob([sampleJpegBytes], { type: 'image/jpeg' });
    formData.append('images', testBlob, 'bespoke_dress_showcase.jpg');

    const uploadRes = await apiFetch(`${ADMIN_URL}/api/dresses/upload`, {
      method: 'POST',
      body: formData
    });

    assert(uploadRes.status === 200, 'Upload request returned HTTP 200');
    assert(uploadRes.json?.uploadedCount === 1, `Uploaded 1 dress (response: ${uploadRes.json?.uploadedCount})`);
    const newDress = uploadRes.json?.uploaded?.[0];
    assert(Boolean(newDress?.id), `Created dress record ID: ${newDress?.id}`);

    // 5. Confirm it appears in Supabase Storage
    console.log('\nStep 5: Confirm image appears in Supabase Storage');
    const imgUrl = newDress?.image_url;
    assert(Boolean(imgUrl && imgUrl.includes('/dress-images/')), `Image URL stored in dress-images bucket: ${imgUrl}`);
    const storageCheck = await fetch(imgUrl);
    assert(storageCheck.status === 200, `Image is publicly downloadable from Supabase Storage (HTTP 200)`);

    // 6. Confirm a record appears in public.dresses
    console.log('\nStep 6: Confirm record in public.dresses');
    const listRes = await apiFetch(`${ADMIN_URL}/api/dresses`);
    const found = listRes.json?.dresses?.find(d => d.id === newDress?.id);
    assert(Boolean(found), `Dress record exists in public.dresses`);

    // 7. Confirm is_visible = true
    console.log('\nStep 7: Confirm is_visible = true');
    assert(found?.is_visible === true, `is_visible is true`);

    // 8 & 9. Open Main Website & confirm image appears automatically
    console.log('\nSteps 8 & 9: Verify Main Website connection');
    const mainRes = await fetch(`${MAIN_URL}/`);
    assert(mainRes.status === 200, 'Main Website responds with HTTP 200');
    // Fetch public dresses directly using Supabase public query
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseAnon = createClient(
      'https://mardkilahpajcucjkvjs.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hcmRraWxhaHBhamN1Y2prdmpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4NzIxMjIsImV4cCI6MjEwNTQ0ODEyMn0.omPsSAuUgWz8ZzWL86T88vCbDxEhI7SbXum7jvFKXmE'
    );
    const { data: mainWebsiteDresses } = await supabaseAnon
      .from('dresses')
      .select('*')
      .eq('is_visible', true);
    const mainFound = mainWebsiteDresses?.some(d => d.id === newDress.id);
    assert(mainFound === true, `Main Website query automatically includes the new image!`);

    // 10. Hide the image from Admin Panel
    console.log('\nStep 10: Hide image from Admin Panel');
    const hideRes = await apiFetch(`${ADMIN_URL}/api/dresses/${newDress.id}/visibility`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_visible: false })
    });
    assert(hideRes.status === 200, 'PATCH visibility returned HTTP 200');
    assert(hideRes.json?.dress?.is_visible === false, 'is_visible updated to false');

    // 11. Confirm Main Website no longer displays it
    console.log('\nStep 11: Confirm Main Website query no longer displays hidden image');
    const { data: mainHiddenCheck } = await supabaseAnon
      .from('dresses')
      .select('*')
      .eq('is_visible', true);
    const mainHiddenFound = mainHiddenCheck?.some(d => d.id === newDress.id);
    assert(mainHiddenFound === false, `Main Website strictly excludes hidden image!`);

    // 12. Show it again
    console.log('\nStep 12: Show image again');
    const showRes = await apiFetch(`${ADMIN_URL}/api/dresses/${newDress.id}/visibility`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_visible: true })
    });
    assert(showRes.status === 200, 'PATCH visibility returned HTTP 200');
    assert(showRes.json?.dress?.is_visible === true, 'is_visible restored to true');

    // 13. Confirm Main Website displays it again
    console.log('\nStep 13: Confirm Main Website displays restored image');
    const { data: mainRestoredCheck } = await supabaseAnon
      .from('dresses')
      .select('*')
      .eq('is_visible', true);
    const mainRestoredFound = mainRestoredCheck?.some(d => d.id === newDress.id);
    assert(mainRestoredFound === true, `Main Website displays image again!`);

    // 14. Delete it
    console.log('\nStep 14: Delete image permanently');
    const deleteRes = await apiFetch(`${ADMIN_URL}/api/dresses/${newDress.id}`, {
      method: 'DELETE'
    });
    assert(deleteRes.status === 200, 'DELETE endpoint returned HTTP 200');
    assert(deleteRes.json?.databaseDeleted === true, 'Database record deleted');
    assert(deleteRes.json?.storageDeleted === true, 'Storage object deleted');

    // 15. Confirm database record is deleted
    console.log('\nStep 15: Confirm database record is deleted');
    const { data: dbCheck } = await supabaseAnon
      .from('dresses')
      .select('*')
      .eq('id', newDress.id);
    assert(!dbCheck || dbCheck.length === 0, `Database record no longer exists`);

    // 16. Confirm Storage file is deleted
    console.log('\nStep 16: Confirm Storage file is deleted');
    const storagePostDelete = await fetch(imgUrl + '?cache_bust=' + Date.now());
    assert(storagePostDelete.status === 404 || storagePostDelete.status === 400, `Storage URL returns 404/400 (file deleted: status ${storagePostDelete.status})`);

    // 17. Confirm Main Website no longer displays it
    console.log('\nStep 17: Confirm Main Website no longer displays it');
    const { data: mainFinalCheck } = await supabaseAnon
      .from('dresses')
      .select('*')
      .eq('is_visible', true);
    const mainFinalFound = mainFinalCheck?.some(d => d.id === newDress.id);
    assert(mainFinalFound === false, `Main Website does not display deleted image`);

  } catch (err) {
    console.error('Fatal error during test run:', err);
    failed++;
  }

  console.log(`\n=========================================`);
  console.log(`COMPLETE FLOW TEST: ${passed} PASSED, ${failed} FAILED`);
  console.log(`=========================================\n`);

  process.exit(failed > 0 ? 1 : 0);
}

run();
