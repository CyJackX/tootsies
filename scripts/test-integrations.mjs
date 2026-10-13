import { existsSync } from 'node:fs';
import { nextShow } from '../src/data/nextShow.ts';
import { Sheets } from '../src/server/sheets.ts';
import { stripe } from '../src/server/stripe.ts';

// Never print credential values, provider response bodies, or application answers.
if (existsSync('.dev.vars')) process.loadEnvFile('.dev.vars');
let failed = false;
for (const name of ['GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY', 'STRIPE_SECRET_KEY', 'PUBLIC_STRIPE_PUBLISHABLE_KEY']) {
  if (!process.env[name]) { console.error(`Missing ${name}`); failed = true; }
}
if (failed) process.exit(1);
try {
  const sheets = new Sheets(process.env, nextShow);
  const rows = await sheets.rows(); // Creates the configured tab/headers if needed; no applicant rows written.
  const repeated = await new Sheets(process.env, nextShow).rows(false);
  if (rows.length !== repeated.length) throw new Error('Row count changed during verification');
  console.log(`Google authentication, spreadsheet access, and headers verified. Tab: ${nextShow.sheetTab || nextShow.id}. Applications: ${rows.length}.`);
} catch (error) {
  console.error(`Google check failed: ${error instanceof Error ? error.message : 'Request failed'}`);
  failed = true;
}
try {
  const balance = await stripe(process.env, 'balance');
  const prefix = balance.livemode ? 'pk_live_' : 'pk_test_';
  if (!process.env.PUBLIC_STRIPE_PUBLISHABLE_KEY.startsWith(prefix)) throw new Error('Publishable key mode does not match secret key');
  console.log(`Stripe secret key authenticated (${balance.livemode ? 'live' : 'test'} mode); publishable key mode matches. No customers, card setups, or charges created.`);
} catch (error) {
  console.error(`Stripe check failed: ${error instanceof Error ? error.message : 'Request failed'}`);
  failed = true;
}
process.exitCode = failed ? 1 : 0;
