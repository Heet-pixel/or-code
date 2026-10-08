/**
 * End-to-end smoke test for the Smart QR Billing API.
 *
 * Run the server first (npm run dev), then in another terminal:
 *   node scripts/smoke-test.js
 *
 * It walks through the real flow a shop owner would use - register, create
 * a product, "scan" it by looking it up by code, bill it, and confirm stock
 * actually dropped - all against your live MongoDB. No mocking.
 */

const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:5000/api';

let pass = 0;
let fail = 0;

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  \x1b[32m\u2713\x1b[0m ${label}`);
    pass++;
  } else {
    console.log(`  \x1b[31m\u2717\x1b[0m ${label} ${detail ? '- ' + detail : ''}`);
    fail++;
  }
}

async function req(method, path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response, e.g. a PDF stream */
  }
  return { status: res.status, ok: res.ok, body: json, raw: res };
}

async function main() {
  console.log(`\nRunning smoke test against ${BASE}\n`);

  // 1. health check
  const health = await req('GET', '/health');
  check('API is reachable', health.status === 200, `got status ${health.status}`);
  if (health.status !== 200) {
    console.log('\nServer not reachable - is `npm run dev` running in another terminal?\n');
    process.exit(1);
  }

  // 2. register a throwaway shop account
  const email = `smoke-${Date.now()}@example.com`;
  const reg = await req('POST', '/auth/register', {
    name: 'Smoke Test',
    shopName: 'Smoke Test Store',
    email,
    password: 'password123',
  });
  check('Register creates an account and returns a token', reg.status === 201 && !!reg.body?.token, JSON.stringify(reg.body));
  const token = reg.body?.token;

  // 3. login with the same credentials
  const login = await req('POST', '/auth/login', { email, password: 'password123' });
  check('Login works with those credentials', login.status === 200 && !!login.body?.token, JSON.stringify(login.body));

  // 4. create a product -> should get back a productId and a QR data URL
  const create = await req(
    'POST',
    '/products',
    { name: 'Smoke Test Cola 500ml', price: 40, stock: 10, gst: 5 },
    token
  );
  check('Create product returns a productId', /^PRD-/.test(create.body?.product?.productId || ''), JSON.stringify(create.body));
  check('Create product returns a QR data URL', (create.body?.product?.qrDataUrl || '').startsWith('data:image/png'));
  const product = create.body?.product;
  check('Initial stock is recorded as Batch 1', product?.batches?.length === 1 && product.batches[0].batchNumber === 1 && product.batches[0].quantity === 10, JSON.stringify(product?.batches));

  // 4b. restock it twice - batch numbers should increment, stock should add up
  const restock1 = await req('POST', `/products/${product._id}/restock`, { quantity: 1000 }, token);
  check('First restock becomes Batch 2', restock1.body?.product?.batches?.length === 2 && restock1.body.product.batches[1].batchNumber === 2, JSON.stringify(restock1.body?.product?.batches));
  check('Stock after restocking 1000 units is 1010', restock1.body?.product?.stock === 1010, `got ${restock1.body?.product?.stock}`);

  const restock2 = await req('POST', `/products/${product._id}/restock`, { quantity: 250 }, token);
  check('Second restock becomes Batch 3', restock2.body?.product?.batches?.length === 3 && restock2.body.product.batches[2].batchNumber === 3, JSON.stringify(restock2.body?.product?.batches));
  check('Stock after restocking 250 more units is 1260', restock2.body?.product?.stock === 1260, `got ${restock2.body?.product?.stock}`);

  const badRestock = await req('POST', `/products/${product._id}/restock`, { quantity: 0 }, token);
  check('Restocking with quantity 0 is rejected', badRestock.status === 400);

  // 5. "scan" it - look it up purely by the code the QR encodes
  const scanned = await req('GET', `/products/by-code/${product.productId}`, null, token);
  check('Scanning by product code returns the same product', scanned.body?.product?.name === product.name);

  // 6. edit the price - QR/productId must not change
  const edited = await req('PUT', `/products/${product._id}`, { price: 55 }, token);
  check('Editing price does not change the productId', edited.body?.product?.productId === product.productId);
  check('Editing price actually updates it', edited.body?.product?.price === 55);

  // 7. try to oversell - should be rejected and stock left untouched
  const oversell = await req('POST', '/sales', { items: [{ productId: product.productId, quantity: 999999 }] }, token);
  check('Overselling past available stock is rejected', oversell.status === 409, JSON.stringify(oversell.body));

  // 8. complete a real bill for 3 units at the updated price
  const sale = await req('POST', '/sales', { items: [{ productId: product.productId, quantity: 3 }] }, token);
  check('Completing a valid bill succeeds', sale.status === 201, JSON.stringify(sale.body));
  check('Bill snapshots the price at time of sale (55, not the original 40)', sale.body?.sale?.items?.[0]?.priceAtSale === 55);
  check('Bill total reflects GST', sale.body?.sale?.total === Number((55 * 3 * 1.05).toFixed(2)), `got ${sale.body?.sale?.total}`);

  // 9. stock should have actually dropped by 3, from 1260 to 1257 - restocks above don't touch this math
  const afterSale = await req('GET', `/products/${product._id}`, null, token);
  check('Stock decreased by exactly the quantity sold (1260 -> 1257)', afterSale.body?.product?.stock === 1257, `got ${afterSale.body?.product?.stock}`);
  check('Selling stock does not add a new batch (still 3)', afterSale.body?.product?.batches?.length === 3, `got ${afterSale.body?.product?.batches?.length}`);

  // 10. dashboard should reflect today's revenue
  const dash = await req('GET', '/dashboard', null, token);
  check('Dashboard shows today\'s revenue > 0 after the sale', (dash.body?.today?.revenue || 0) > 0, JSON.stringify(dash.body?.today));

  // 11. old sale record must keep the price charged even after another price edit
  await req('PUT', `/products/${product._id}`, { price: 999 }, token);
  const saleAfterAnotherEdit = await req('GET', `/sales/${sale.body.sale._id}`, null, token);
  check(
    'Historical invoice keeps the original sale price even after another price change',
    saleAfterAnotherEdit.body?.sale?.items?.[0]?.priceAtSale === 55
  );

  // 12. invoice PDF actually generates
  const invoicePdf = await req('GET', `/sales/${sale.body.sale._id}/invoice-pdf`, null, token);
  check('Invoice PDF endpoint responds with a PDF', invoicePdf.raw.headers.get('content-type') === 'application/pdf');

  // 13. QR label sheet PDF actually generates
  const qrPdf = await req('GET', `/products/${product._id}/qr-pdf?copies=5`, null, token);
  check('QR label sheet PDF endpoint responds with a PDF', qrPdf.raw.headers.get('content-type') === 'application/pdf');

  // 13b. regression checks for bugs fixed in the hardening pass
  const weirdSearch = await req('GET', '/products?search=' + encodeURIComponent('(['), null, token);
  check('Searching with regex special characters does not crash', weirdSearch.status === 200, `got ${weirdSearch.status}`);

  const badId = await req('GET', '/products/not-a-real-id', null, token);
  check('A malformed product id returns 400, not 500', badId.status === 400, `got ${badId.status}`);

  const lowerCode = await req('GET', `/products/by-code/${product.productId.toLowerCase()}`, null, token);
  check('Product code lookup is case-insensitive', lowerCode.status === 200);

  const fractional = await req('POST', '/sales', { items: [{ productId: product.productId, quantity: 1.5 }] }, token);
  check('Fractional quantity is rejected', fractional.status === 400, `got ${fractional.status}`);

  const stockBefore = (await req('GET', `/products/${product._id}`, null, token)).body?.product?.stock;
  const dup = await req(
    'POST',
    '/sales',
    { items: [{ productId: product.productId, quantity: 2 }, { productId: product.productId, quantity: 3 }] },
    token
  );
  const stockAfter = (await req('GET', `/products/${product._id}`, null, token)).body?.product?.stock;
  check('Duplicate cart lines for one product are merged (one line of 5)', dup.status === 201 && dup.body?.sale?.items?.length === 1 && dup.body.sale.items[0].quantity === 5, JSON.stringify(dup.body));
  check('Stock dropped by the merged quantity (5)', stockBefore - stockAfter === 5, `${stockBefore} -> ${stockAfter}`);

  const blankEdit = await req('PUT', `/products/${product._id}`, { price: '' }, token);
  check('Blank price on edit becomes 0 instead of corrupting the product', blankEdit.status === 200 && blankEdit.body?.product?.price === 0, JSON.stringify(blankEdit.body));

  // 14. a second, unrelated account must never see this product
  const otherEmail = `smoke-b-${Date.now()}@example.com`;
  const otherReg = await req('POST', '/auth/register', { name: 'Other Shop', email: otherEmail, password: 'password123' });
  const otherLookup = await req('GET', `/products/by-code/${product.productId}`, null, otherReg.body?.token);
  check('A different user cannot see this product (data isolation)', otherLookup.status === 404);

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\nSmoke test crashed:', err.message);
  process.exit(1);
});
