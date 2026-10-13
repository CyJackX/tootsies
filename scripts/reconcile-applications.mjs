import { nextShow } from '../src/data/nextShow.ts';
import { Sheets } from '../src/server/sheets.ts';
const show = nextShow;
if (process.argv[2] && process.argv[2] !== show.id) throw new Error('Usage: npm run applications:reconcile -- SHOW_ID');
const rows = await new Sheets(process.env, show).rows(false);
const groups = new Map();
for (const [index, row] of rows.entries()) {
  const id = row[0] || '(missing ID)';
  groups.set(id, [...(groups.get(id) || []), index + 2]);
}
const duplicates = [...groups].filter(([, rows]) => rows.length > 1).map(([id, rows]) => ({ id, rows }));
const missingReferences = rows.flatMap((row, index) => !row[14] || !row[15] || !row[16] ? [{ id: row[0], row: index + 2, missingCustomer: !row[14], missingIntent: !row[15], missingPaymentMethod: !row[16] }] : []);
console.log(JSON.stringify({ showId: show.id, count: rows.length, duplicates, missingReferences }, null, 2));
// This command only reads Sheets; it never changes records or calls Stripe.
