-- SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-B FR-1 — a git-verified commit-pin provenance column for
-- strategic_directives_v2, alongside (never replacing) the existing worktree_path column.
-- Target DB: EHG_Engineer
--
-- @approved-by: <PENDING -- apply via the chairman's 3-factor ceremony>
--   approval on record. See database/chairman-gated/README.md: the approver header must match
--   `git config user.email` at apply time and is checked against the chairman-approval record.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- WHY A NEW COLUMN, NOT worktree_path ITSELF (EXEC-phase RCA correction, 2026-09-07). This SD's
-- PRD originally specified writing a `<path>@<sha>` pinned value directly into the EXISTING
-- worktree_path column. An RCA (rca-agent + consumer-scan + db-expert teammates) found that would
-- break 10 existing literal-path read sites across 4 files that call realpathSync/existsSync/
-- execFileSync-cwd/string-prefix-containment directly on that column with no parsing:
--   lib/claim-validity-gate.js (6 sites, including process.chdir(expectedWt) -- the highest
--     blast-radius one: every subsequent handoff on a claim whose worktree_path was pinned would
--     throw ClaimIdentityError trying to chdir into a nonexistent "<path>@<sha>" directory),
--   lib/claim/reacquire-self-live.mjs (cwd-containment check),
--   scripts/hooks/pre-tool-enforce.cjs (fs.existsSync on the raw value -- degrades a hard
--     main-branch-edit block to a warn-and-proceed),
--   scripts/modules/handoff/gates/subagent-evidence-gate.js (worst hit: resolveCurrentHeadSha
--     silently returns null under a pinned cwd, going dark on the gate-evidence staleness check --
--     the exact CLAUDE.md "evidence without provenance is absent, not weak" rule this SD exists to
--     strengthen, broken by the very column meant to prove provenance).
-- A live-DB schema analysis (db-expert) independently confirmed: worktree_path has ZERO CHECK
-- constraints/triggers/views today, all 5 existing writers write either a bare literal path or
-- NULL, and 92.7% of the 2,493 non-null rows are status=completed SDs whose worktrees were reaped
-- long ago -- for those, a HISTORICAL:<path> sentinel would carry zero information over NULL.
--
-- CORRECTED DESIGN: worktree_path is left COMPLETELY UNCHANGED (same 5 writers, same 10 readers,
-- same values). This migration adds a NEW, independent, nullable column, worktree_commit_pin,
-- that ONLY scripts/sd-start.js (and, later, the FR-3 reconciliation script) ever writes, and that
-- no pre-existing code reads yet -- so there is no consumer to break.
--
-- WHY VALID IMMEDIATELY, NO NOT VALID -> VALIDATE TWO-STEP (contrast with the original FR-4, now
-- retired). The two-step ceremony exists to avoid a migration failing outright against a large
-- pre-existing population of non-conforming values. worktree_commit_pin is a BRAND NEW column: it
-- starts 100% NULL across all 6,176 existing rows, and the predicate below is
-- `worktree_commit_pin IS NULL OR <3 shapes>` -- satisfied by every existing row by construction.
-- There is no backfill-before-validate dependency to defer.
--
-- WHY CHAIRMAN-GATED DESPITE BEING "JUST an ADD COLUMN" (TR-3). A nullable `ADD COLUMN` alone
-- would classify TIER-1 (auto-apply, per Rule C) -- see the precedent
-- 20260906_add_quick_fixes_metadata_column.sql. But this migration also adds a regex CHECK
-- constraint, and the tier-gate's allow-list (Rule H) covers only
-- `CHECK (col = ANY (ARRAY[literals]))` -- a fixed-literal-set check, not a regex. A regex CHECK
-- therefore does not match any auto-apply allow-rule and is default-deny TIER-2, requiring the
-- full chairman-gated ceremony (path outside auto-scanned migration dirs, git_committed guard,
-- `@approved-by` header matching the applier's git identity, single-use <1h token).
--
-- TR-2 (division of responsibility, unchanged by the column-name correction): this CHECK enforces
-- SHAPE only -- Postgres cannot shell out to `git cat-file`. Actual git-object verification
-- happens in the application layer (scripts/sd-start.js's writer, FR-5; the FR-3 reconciliation
-- script) BEFORE a value is ever written here. A row satisfying this constraint proves its VALUE
-- is well-formed; it does NOT independently prove the referenced commit still exists in the repo
-- (a commit can be pruned/GC'd after the pin was written) -- that is an accepted, documented
-- limitation of a pure-SQL predicate, not an oversight.
--
-- CEREMONY: this file lives in database/chairman-gated/ and is NEVER self-applied by the worker
-- that authors it — see this directory's README.md.
--
-- ROLLBACK: see the paired _DOWN.sql (drops the CHECK constraint, then the column -- both
-- provably additive; no other migration or code path depends on this column's existence).

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 1. ADD COLUMN (nullable, no default -- additive, safe under concurrent readers/writers)
-- ───────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE strategic_directives_v2 ADD COLUMN IF NOT EXISTS worktree_commit_pin TEXT;

COMMENT ON COLUMN strategic_directives_v2.worktree_commit_pin IS
  'SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-B. Git-verified commit-pin provenance for worktree_path, kept as a SEPARATE column deliberately (worktree_path itself stays a literal, realpathSync-able filesystem path consumed by lib/claim-validity-gate.js and others). One of three shapes when non-null: EXACT "<path>@<sha>", APPROXIMATE "<path>@<sha>~asof:<ISO8601>", or HISTORICAL "HISTORICAL:<path>" (no recoverable pin, never fabricated). Written by scripts/sd-start.js (lib/git/commit-pin-resolver.mjs, FR-2/FR-5) and the FR-3 reconciliation script. NULL means "no pin has ever been computed for this row" -- never "not applicable".';

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 2. CHECK constraint -- SHAPE ONLY (TR-2). Added VALID immediately: the column above starts
--    100% NULL, so every existing row already satisfies "IS NULL OR <shape>" by construction --
--    there is no pre-existing-violator population to scan, unlike a retrofit onto worktree_path
--    itself would have required.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE strategic_directives_v2
  ADD CONSTRAINT ck_strategic_directives_worktree_commit_pin_provenance
  CHECK (
    worktree_commit_pin IS NULL
    OR worktree_commit_pin ~ '^.+@[0-9a-f]{7,40}$'
    OR worktree_commit_pin ~ '^.+@[0-9a-f]{7,40}~asof:\d{4}-\d{2}-\d{2}T'
    OR worktree_commit_pin ~ '^HISTORICAL:.+$'
  );

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 3. VERIFY -- mirrors lib/git/commit-pin-resolver.mjs's SHAPE regexes exactly (kept in sync by
--    citing the same three patterns; if either changes, update both).
-- ───────────────────────────────────────────────────────────────────────────────────────────────
DO $verify$
BEGIN
  IF NOT ('a@1234567' ~ '^.+@[0-9a-f]{7,40}$') THEN
    RAISE EXCEPTION 'VERIFY FAILED: EXACT pattern should accept a@1234567';
  END IF;
  IF NOT ('a@1234567890123456789012345678901234567890~asof:2026-09-07T00:00:00Z' ~ '^.+@[0-9a-f]{7,40}~asof:\d{4}-\d{2}-\d{2}T') THEN
    RAISE EXCEPTION 'VERIFY FAILED: APPROXIMATE pattern should accept a well-formed asof suffix';
  END IF;
  IF NOT ('HISTORICAL:some/path' ~ '^HISTORICAL:.+$') THEN
    RAISE EXCEPTION 'VERIFY FAILED: HISTORICAL pattern should accept HISTORICAL:<path>';
  END IF;
  IF ('/bare/unpinned/path' ~ '^.+@[0-9a-f]{7,40}$')
     OR ('/bare/unpinned/path' ~ '^.+@[0-9a-f]{7,40}~asof:\d{4}-\d{2}-\d{2}T')
     OR ('/bare/unpinned/path' ~ '^HISTORICAL:.+$') THEN
    RAISE EXCEPTION 'VERIFY FAILED: a bare unpinned path should match NONE of the 3 shapes';
  END IF;

  RAISE NOTICE 'SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-B FR-1: all shape-regex verify assertions passed.';
END
$verify$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (companion DOWN file: 20260906_strategic_directives_worktree_commit_pin_DOWN.sql)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ALTER TABLE strategic_directives_v2 DROP CONSTRAINT IF EXISTS ck_strategic_directives_worktree_commit_pin_provenance;
-- ALTER TABLE strategic_directives_v2 DROP COLUMN IF EXISTS worktree_commit_pin;
-- Safe: the column and constraint are additive-only; scripts/sd-start.js's writer is fail-soft on
-- a missing column (catches the error, logs a warning, continues non-fatally -- see FR-5).
