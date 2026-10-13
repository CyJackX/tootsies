import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAnswers } from '../src/server/validation.ts';
import { isAccepting, nextShow, homepagePhase } from '../src/data/nextShow.ts';
import { Sheets, headers } from '../src/server/sheets.ts';
import { beginApplication, finishApplication } from '../src/server/applications.ts';
import { passesHoneypot, sameOrigin, readInput } from '../src/server/http.ts';
const answers = { name: 'A group', email: 'a@example.com', socials: '', location: 'Brooklyn', attendance: 'No', attendedBefore: 'Yes', newVideo: 'YESTOOTSIE', portfolio: 'N/A', notes: '=IMPORTXML("x")', consent: true };

test('validation accepts first time creators and attendance No, and requires email/consent', () => {
  assert.deepEqual(validateAnswers(answers).errors, {});
  assert.deepEqual(Object.keys(validateAnswers({ ...answers, email: 'bad', consent: false, newVideo: 'no' }).errors).sort(), ['consent', 'email', 'newVideo']);
  assert.ok(validateAnswers({ ...answers, portfolio: '' }).errors.portfolio);
  assert.ok(validateAnswers({ ...answers, attendedBefore: '' }).errors.attendedBefore);
  assert.ok(validateAnswers({ ...answers, newVideo: 'YES' }).errors.newVideo);
  assert.deepEqual(validateAnswers({ ...answers, attendedBefore: 'No', newVideo: 'yestootsie' }).errors, {});
});
test('show acceptance depends only on open, regardless of display dates', () => {
  const show = { ...nextShow, open: true, spreadsheetId: '', screeningAt: '', notificationDate: '', deadline: '' };
  assert.equal(isAccepting(show), true);
  assert.equal(isAccepting({ ...show, deadline: 'Applications close next Friday', notificationDate: 'A week later' }), true);
  assert.equal(isAccepting({ ...show, deadline: 'January 1, 2000' }), true);
  assert.equal(isAccepting({ ...show, open: false }), false);
});
test('HTTP and honeypot reject invalid origins, oversized input and filled hidden fields', async () => {
  const request = new Request('https://example.com/api/applications', { method: 'POST', headers: { Origin: 'https://example.com' }, body: '{}' });
  assert.equal(sameOrigin(request), true);
  assert.equal(sameOrigin(new Request(request.url, { headers: { Origin: 'https://other.com' } })), false);
  assert.deepEqual(await readInput(request), {});
  await assert.rejects(readInput(new Request(request.url, { method: 'POST', body: 'x'.repeat(20001) })));
  assert.equal(passesHoneypot({ website: '' }), true);
  assert.equal(passesHoneypot({}), true);
  assert.equal(passesHoneypot({ website: 'spam' }), false);
  assert.equal(passesHoneypot({ website: false }), false);
});

async function providers(callback) {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const env = { GOOGLE_SERVICE_ACCOUNT_EMAIL: 'test@example.com', GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64'), STRIPE_SECRET_KEY: 'sk_test_fake' };
  const show = nextShow, originalShow = { ...show }, originalFetch = globalThis.fetch;
  Object.assign(show, { open: true, spreadsheetId: 'sheet', screeningAt: 'future', notificationDate: 'future', deadline: '2030-01-01T00:00:00Z' });
  const state = { rows: [], calls: [], intents: new Map(), methods: new Map(), customers: new Map(), idempotency: new Map(), unavailable: false, appendUnavailable: false, uncertainAppend: false, tabExists: true, sheetHeaders: headers, creationUncertain: false };
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url); state.calls.push({ path, ...options });
    const reply = value => new Response(JSON.stringify(value), { status: 200 });
    if (path.includes('oauth2')) return reply({ access_token: 'mock' });
    if (path.includes('sheets.googleapis')) {
      if (state.unavailable) return new Response('', { status: 503 });
      if (path.includes('?fields=')) return reply({ sheets: state.tabExists ? [{ properties: { title: show.sheetTab || show.id } }] : [] });
      if (path.endsWith(':batchUpdate')) {
        const requests = JSON.parse(options.body).requests;
        assert.equal(requests[0].addSheet.properties.title, show.sheetTab || show.id);
        state.tabExists = true;
        state.sheetHeaders = requests[1].updateCells.rows[0].values.map(cell => cell.userEnteredValue.stringValue);
        if (state.creationUncertain) { state.creationUncertain = false; throw new Error('timeout after creation'); }
        return reply({});
      }
      if (options.method === 'PUT') {
        assert.equal(state.rows.length, 0);
        assert.ok(path.includes('valueInputOption=RAW'));
        state.sheetHeaders = JSON.parse(options.body).values[0];
        return reply({});
      }
      if (options.method === 'POST') {
        assert.ok(path.includes('valueInputOption=RAW'));
        if (state.appendUnavailable) return new Response('', { status: 503 });
        state.rows.push(JSON.parse(options.body).values[0]);
        if (state.uncertainAppend) { state.uncertainAppend = false; throw new Error('timeout after append'); }
        return reply({});
      }
      assert.equal(options.method, 'GET'); // Finalization never edits existing rows.
      return reply({ values: state.sheetHeaders.length ? [state.sheetHeaders, ...state.rows] : state.rows });
    }
    const key = options.headers?.['Idempotency-Key'];
    if (key && state.idempotency.has(key)) return reply(state.idempotency.get(key));
    const data = options.body;
    const metadata = data ? Object.fromEntries([...data].filter(([name]) => name.startsWith('metadata[')).map(([name, value]) => [name.slice(9, -1), value])) : {};
    if (path.endsWith('/setup_intents')) {
      assert.equal(data.get('usage'), 'off_session'); assert.equal(data.get('payment_method_types[0]'), 'card'); assert.equal(data.has('customer'), false);
      const id = `seti_mock${state.intents.size + 1}`;
      const intent = { id, client_secret: `${id}_secret_mocksecret`, created: Math.floor(Date.now() / 1000), status: 'requires_payment_method', usage: 'off_session', livemode: false, payment_method: null, metadata };
      state.intents.set(id, intent); state.idempotency.set(key, intent); return reply(intent);
    }
    if (path.includes('/setup_intents/')) return reply(state.intents.get(path.split('/').at(-1)));
    if (path.endsWith('/customers')) {
      const customer = { id: `cus_mock${state.customers.size + 1}`, metadata };
      state.customers.set(customer.id, customer); state.idempotency.set(key, customer); return reply(customer);
    }
    if (path.includes('/customers/')) return reply(state.customers.get(path.split('/').at(-1)));
    if (path.includes('/payment_methods/') && path.endsWith('/attach')) {
      const method = state.methods.get(path.split('/').at(-2));
      method.customer = data.get('customer'); state.idempotency.set(key, method); return reply(method);
    }
    if (path.includes('/payment_methods/')) return reply(state.methods.get(path.split('/').at(-1)));
    throw new Error(`Unexpected provider request: ${path}`);
  };
  const startInput = () => ({ ...answers, attemptId: crypto.randomUUID(), showId: show.id, consentText: "Applying is free. I authorize a one-time $25 USD charge if selected." });
  const succeed = secret => {
    const intent = state.intents.get(secret.split('_secret_')[0]);
    intent.status = 'succeeded'; intent.payment_method = `pm_${intent.id}`;
    state.methods.set(intent.payment_method, { id: intent.payment_method, type: 'card', customer: null });
  };
  try { await callback({ env, show, state, startInput, succeed }); }
  finally { globalThis.fetch = originalFetch; Object.assign(show, originalShow); }
}

test('starting or abandoning setup stores no Sheet row, customer, or answers in Stripe metadata', async () => providers(async ({ env, show, state, startInput }) => {
  const input = startInput();
  const first = await beginApplication(env, input);
  assert.ok(first.clientSecret);
  assert.equal(state.rows.length, 0); assert.equal(state.customers.size, 0);
  assert.equal(state.calls.some(call => call.path.includes('sheets.googleapis')), false);
  assert.equal((await beginApplication(env, input)).clientSecret, first.clientSecret);
  assert.equal(state.intents.size, 1);
  const metadata = state.intents.values().next().value.metadata;
  assert.match(metadata.answers_hash, /^[a-f0-9]{64}$/);
  assert.equal(metadata.consent_text, undefined);
  assert.equal((await beginApplication(env, { ...input, consentText: 'x'.repeat(501) })).status, 200);
  for (const value of [answers.name, answers.email, answers.notes, answers.portfolio]) assert.equal(JSON.stringify(metadata).includes(value), false);
  assert.equal((await finishApplication(env, { ...answers, clientSecret: first.clientSecret })).status, 409);
  assert.equal(state.rows.length, 0);
  assert.equal((await beginApplication(env, { ...input, consentText: '' })).status, 200);
  assert.equal((await beginApplication(env, { ...input, consent: false })).status, 400);
  show.open = false;
  assert.equal((await beginApplication(env, input)).status, 409);
}));

test('verified success inserts once, keeps fee snapshots and manual columns, and allows shared emails', async () => providers(async ({ env, show, state, startInput, succeed }) => {
  const first = await beginApplication(env, startInput()); succeed(first.clientSecret);
  const originalFee = show.feeCents; show.feeCents = 3000; show.open = false;
  assert.equal((await finishApplication(env, { ...answers, clientSecret: first.clientSecret })).complete, true);
  assert.equal(state.rows.length, 1); assert.equal(state.rows[0][12], String(originalFee));
  assert.equal(state.rows[0][11], answers.notes); assert.equal(state.rows[0][10], answers.portfolio);
  assert.equal(state.rows[0][7], 'No'); assert.equal(state.rows[0][8], 'Yes');
  assert.equal(state.rows[0][9], 'YESTOOTSIE'); assert.equal(state.rows[0][10], 'N/A');
  assert.equal(state.rows[0][0], state.rows[0][17]); assert.equal(state.customers.size, 1);
  state.rows[0].splice(20, 3, 'accepted', 'manual', 'keep');
  assert.equal((await finishApplication(env, { ...answers, clientSecret: first.clientSecret })).complete, true);
  assert.equal(state.rows.length, 1); assert.deepEqual(state.rows[0].slice(20), ['accepted', 'manual', 'keep']);
  show.open = true;
  const second = await beginApplication(env, startInput()); succeed(second.clientSecret);
  await finishApplication(env, { ...answers, clientSecret: second.clientSecret });
  assert.equal(state.rows.length, 2); assert.equal(state.rows[0][4], state.rows[1][4]); assert.equal(state.customers.size, 2);
}));

test('forged secrets, altered answers, unrelated setups and customer mismatches cannot insert', async () => providers(async ({ env, state, startInput, succeed }) => {
  const setup = await beginApplication(env, startInput()); succeed(setup.clientSecret);
  const input = { ...answers, clientSecret: setup.clientSecret };
  assert.equal((await finishApplication(env, { ...input, clientSecret: setup.clientSecret + 'forged' })).status, 400);
  assert.equal((await finishApplication(env, { ...input, notes: 'changed' })).status, 409);
  const intent = state.intents.values().next().value;
  const integration = intent.metadata.integration; intent.metadata.integration = 'other';
  assert.equal((await finishApplication(env, input)).status, 400); intent.metadata.integration = integration;
  const method = state.methods.get(intent.payment_method); method.customer = 'cus_other';
  state.customers.set('cus_other', { id: 'cus_other', metadata: { application_id: 'another', show_id: 'another' } });
  await assert.rejects(finishApplication(env, input), /another application/);
  assert.equal(state.rows.length, 0);
}));

test('Sheets outages and ambiguous saves recover without repeating card setup or customers', async () => providers(async ({ env, state, startInput, succeed, show }) => {
  const setup = await beginApplication(env, startInput()); succeed(setup.clientSecret);
  const input = { ...answers, clientSecret: setup.clientSecret };
  state.unavailable = true; await assert.rejects(finishApplication(env, input));
  assert.equal(state.rows.length, 0); assert.equal(state.customers.size, 0);
  state.unavailable = false; state.appendUnavailable = true;
  await assert.rejects(finishApplication(env, input));
  assert.equal(state.rows.length, 0); assert.equal(state.customers.size, 1);
  // Simulate a retry beyond Stripe's 24-hour idempotency window.
  state.idempotency.clear(); state.appendUnavailable = false; state.uncertainAppend = true;
  assert.equal((await finishApplication(env, input)).complete, true);
  assert.equal(state.rows.length, 1); assert.equal(state.customers.size, 1); assert.equal(state.intents.size, 1);
  state.rows.push([...state.rows[0]]);
  await assert.rejects(new Sheets(env, show).find(state.rows[0][0]), /Duplicate/);
  await assert.rejects(finishApplication(env, input), /Duplicate/);
}));

test('show tabs initialize automatically and reconcile ambiguous creation without overwriting headers', async () => providers(async ({ env, show, state }) => {
  state.tabExists = false; state.creationUncertain = true;
  assert.deepEqual(await new Sheets(env, show).rows(), []);
  assert.deepEqual(state.sheetHeaders, headers);
  assert.equal(state.calls.filter(call => call.path.endsWith(':batchUpdate')).length, 1);
  await new Sheets(env, show).rows();
  assert.equal(state.calls.filter(call => call.path.endsWith(':batchUpdate')).length, 1);
  state.sheetHeaders = [];
  await new Sheets(env, show).rows();
  assert.deepEqual(state.sheetHeaders, headers);
  state.sheetHeaders = ['existing organizer data'];
  const writes = state.calls.filter(call => call.method !== 'GET').length;
  await assert.rejects(new Sheets(env, show).rows(), /headers do not match/);
  assert.equal(state.calls.filter(call => call.method !== 'GET').length, writes);
}));

test('read-only reconciliation does not create tabs or initialize blank headers', async () => providers(async ({ env, show, state }) => {
  state.sheetHeaders = [];
  await assert.rejects(new Sheets(env, show).rows(false), /headers do not match/);
  assert.equal(state.calls.some(call => call.path.includes('sheets.googleapis') && call.method !== 'GET'), false);
}));

test('homepage derives shared show details and switches submission/ticket links', () => {
  const show = { ...nextShow, deadline: 'February 1 at midnight', notificationDate: 'February 15, 2027', ticketsUrl: 'https://example.com/tickets' };
  const submissions = homepagePhase({ ...show, phase: 'submissions' });
  assert.equal(submissions.url, '/submit');
  assert.equal(submissions.details.find(detail => detail.label === 'Submission Deadline').value, show.deadline);
  assert.equal(submissions.details.find(detail => detail.label === 'Show Date').value, show.screeningAt);
  assert.equal(submissions.details.find(detail => detail.label === 'Location').value, show.venue);
  assert.equal(submissions.details.find(detail => detail.label === 'Notification of Acceptance').value, show.notificationDate);
  const tickets = homepagePhase({ ...show, phase: 'tickets' });
  assert.equal(tickets.url, show.ticketsUrl);
  assert.equal(tickets.details.length, 2);
  assert.equal(homepagePhase({ ...show, deadline: '' }).details.some(detail => detail.label === 'Submission Deadline'), false);
});

test('empty old tabs upgrade headers while populated old tabs remain untouched', async () => providers(async ({ env, show, state }) => {
  const oldHeaders = headers.filter(header => header !== 'attended_before');
  oldHeaders.splice(oldHeaders.indexOf('portfolio') + 1, 0, 'portfolio_password');
  state.sheetHeaders = [...oldHeaders];
  await new Sheets(env, show).rows();
  assert.deepEqual(state.sheetHeaders, headers);
  state.sheetHeaders = [...oldHeaders]; state.rows = [['existing-application']];
  await assert.rejects(new Sheets(env, show).rows(), /headers do not match/);
  assert.deepEqual(state.sheetHeaders, oldHeaders);
  assert.deepEqual(state.rows, [['existing-application']]);
}));

test('consent wording is optional and unrestricted while the checkbox remains required', async () => providers(async ({ env, state, startInput, succeed }) => {
  const input = startInput(); delete input.consentText;
  const first = await beginApplication(env, input); assert.equal(first.status, 200); succeed(first.clientSecret);
  assert.equal((await finishApplication(env, { ...answers, clientSecret: first.clientSecret })).complete, true);
  assert.equal(state.rows[0][14], '');
  const second = await beginApplication(env, { ...startInput(), consentText: 'x'.repeat(1000) }); succeed(second.clientSecret);
  assert.equal((await finishApplication(env, { ...answers, consentText: 'x'.repeat(1000), clientSecret: second.clientSecret })).complete, true);
  assert.equal(state.rows[1][14], 'x'.repeat(1000));
  assert.equal((await beginApplication(env, { ...startInput(), consent: false })).status, 400);
}));
