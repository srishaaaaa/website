import { one } from '../db/index.js';

// The cost-price columns arrive with migration 019. Until it has been run on a database, everything that touches them is skipped,
// so the rest of the POS keeps working. A "yes" answer is remembered; a "no" is rechecked at most once a minute.
let known = false, checkedAt = 0;
export async function hasCostColumns(db) {
  if (known) return true;
  if (Date.now() - checkedAt < 60_000) return false;
  checkedAt = Date.now();
  const r = await one(db, `SELECT COUNT(*)::int AS n FROM information_schema.columns
    WHERE (table_name = 'products' AND column_name = 'cost_price') OR (table_name = 'pos_sale_items' AND column_name = 'cost_snapshot')`);
  known = r.n >= 2; return known;
}
export const resetCostCheck = () => { known = false; checkedAt = 0 };

// pos_advances.deposit_split arrives with migration 021; until then a deposit can only be paid one way.
let splitKnown = false, splitAt = 0;
export async function hasDepositSplit(db) {
  if (splitKnown) return true;
  if (Date.now() - splitAt < 60_000) return false;
  splitAt = Date.now();
  splitKnown = !!(await one(db, `SELECT 1 AS x FROM information_schema.columns WHERE table_name = 'pos_advances' AND column_name = 'deposit_split'`));
  return splitKnown;
}
