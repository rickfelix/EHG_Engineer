/**
 * Latest-Migration Resolver
 *
 * SD-LEO-FIX-CHILD-TAIL-CHAIRMAN-001 (FR-4).
 *
 * A static-pin test that hardcodes one migration filename goes stale the moment a later
 * migration extends the same function with CREATE OR REPLACE: the test keeps reading the
 * OLD file, recreates the OLD body in a live transaction, and stays green while measuring
 * a function that no longer matches production. That is precisely how
 * tests/integration/get-pending-chairman-items.contract.test.js stayed green while pinned
 * to 20260710_create_get_pending_chairman_items.sql after 20260717 and then this SD's
 * migration both superseded it.
 *
 * Sort order matters here, and "migration filenames are date-prefixed" is NOT true of the
 * whole database/migrations/ directory — it holds legacy non-date-prefixed files (e.g.
 * uat-tracking-schema.sql) plus a mix of dash-dated (2025-09-22-*.sql) and compact
 * YYYYMMDD_ (20260815_*.sql) prefixes, whose lexicographic order does not agree with true
 * chronological order (verified against this repo's actual database/migrations/ listing,
 * adversarial review of SD-LEO-FIX-CHILD-TAIL-CHAIRMAN-001 PR #7057). Sorting ALL .sql
 * filenames together would silently resolve to the wrong "latest" file with no error — the
 * exact silent-staleness failure mode this helper exists to prevent. To keep the guarantee
 * real rather than assumed, this function only considers files matching the compact
 * `^\d{8}_` prefix (the convention every migration extending get_pending_chairman_items
 * actually uses); among THOSE, lexicographic sort order is chronological order.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const DATE_PREFIXED = /^\d{8}_/;

/**
 * NOTE ON "LATEST" vs "LIVE": this returns the newest DECLARED body among migration files —
 * the file with the highest date prefix that contains the marker. For a chairman-gated
 * migration, the newest file is, by construction, often the one NOT YET applied (staged,
 * pending the chairman ceremony). "Latest declared" and "currently live in the database" can
 * genuinely differ during that window. This function resolves the former; it does not, and
 * cannot from static files alone, know the latter.
 *
 * @param {string} repoRoot - absolute path to the repo root
 * @param {string} marker - a string that must appear in the migration (e.g. a function name)
 * @returns {{ path: string, sql: string }} the newest matching migration file and its contents
 * @throws if no `^\d{8}_`-prefixed migration under database/migrations/ contains the marker
 */
export function resolveLatestMigration(repoRoot, marker) {
  const dir = resolve(repoRoot, 'database/migrations');
  const candidates = readdirSync(dir)
    .filter((f) => f.endsWith('.sql') && DATE_PREFIXED.test(f))
    .sort(); // restricted to ^\d{8}_ prefixes: lexicographic === chronological, verified above
  for (let i = candidates.length - 1; i >= 0; i--) {
    const path = resolve(dir, candidates[i]);
    const sql = readFileSync(path, 'utf8');
    if (sql.includes(marker)) return { path, sql };
  }
  throw new Error(`resolveLatestMigration: no ^\\d{8}_-prefixed migration under ${dir} contains "${marker}"`);
}
