/**
 * SD-LEO-FIX-GUARD-UNGUARDED-UUID-001 — guard pack for 4 SD-completion AFTER
 * triggers with no outer exception guard (F-1, F-2, F-9 per
 * docs/audits/SD-LEO-INFRA-TRIGGER-ESTATE-AUDIT-001.md).
 *
 * Hermetic source-assertions on the 3 migration files (no DB connection).
 * Live behavioral proof is scripts/validate-trigger-guard-pack.mjs — a
 * BEGIN...ROLLBACK round-trip exercising all 4 functions, run pre-apply
 * (functions applied in-txn from these same files) and re-run post-apply
 * once the chairman approves the TIER-2 migration.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function loadMigration(name) {
  return readFileSync(path.resolve(process.cwd(), 'database/migrations', name), 'utf8');
}

const uuidGuard = loadMigration('20260619_uuid_cast_guard_sd_completion.sql');
const feedbackGuard = loadMigration('20260621_auto_close_feedback_exception_guard.sql');
const feedbackGuardDown = loadMigration('20260621_auto_close_feedback_exception_guard_DOWN.sql');
const orchestratorGuard = loadMigration('20260701_guard_orchestrator_auto_complete_exception.sql');
const orchestratorGuardDown = loadMigration('20260701_guard_orchestrator_auto_complete_exception_DOWN.sql');

describe('F-1: safe_uuid guard (record_mttr_on_sd_completion, fn_emit_sd_completed_event)', () => {
  it('defines a format-guarded safe_uuid(text) helper', () => {
    expect(uuidGuard).toMatch(/CREATE OR REPLACE FUNCTION public\.safe_uuid\(p_text text\)/);
    expect(uuidGuard).toMatch(/RETURNS uuid/);
    expect(uuidGuard).toMatch(/RETURN NULL;/);
  });

  it('record_mttr_on_sd_completion calls safe_uuid instead of a raw ::UUID cast', () => {
    const fnStart = uuidGuard.indexOf('CREATE OR REPLACE FUNCTION public.record_mttr_on_sd_completion');
    const fnEnd = uuidGuard.indexOf('$function$;', fnStart);
    const body = uuidGuard.slice(fnStart, fnEnd);
    expect(body).toMatch(/public\.safe_uuid\(NEW\.metadata->>'proposal_id'\)/);
    expect(body).not.toMatch(/\(NEW\.metadata->>'proposal_id'\)::UUID/);
  });

  it('fn_emit_sd_completed_event calls safe_uuid instead of a raw ::UUID cast', () => {
    const fnStart = uuidGuard.indexOf('CREATE OR REPLACE FUNCTION public.fn_emit_sd_completed_event');
    const fnEnd = uuidGuard.indexOf('$function$;', fnStart);
    const body = uuidGuard.slice(fnStart, fnEnd);
    expect(body).toMatch(/public\.safe_uuid\(NEW\.metadata->>'venture_id'\)/);
    expect(body).not.toMatch(/\(NEW\.metadata->>'venture_id'\)::UUID/);
  });

  it('carries a self-verification block asserting safe_uuid behavior', () => {
    expect(uuidGuard).toMatch(/DO \$verify\$/);
    expect(uuidGuard).toMatch(/safe_uuid\('not-a-uuid'\) IS NOT NULL/);
  });
});

describe('F-2: outer exception guard on fn_auto_close_feedback_on_sd_completion', () => {
  it('preserves the two feedback UPDATE statements byte-identically', () => {
    expect(feedbackGuard).toMatch(/WHERE strategic_directive_id = NEW\.id/);
    expect(feedbackGuard).toMatch(/WHERE resolution_sd_id = NEW\.id/);
  });

  it('appends the sibling EXCEPTION WHEN OTHERS guard, returning NEW', () => {
    expect(feedbackGuard).toMatch(/EXCEPTION WHEN OTHERS THEN/);
    expect(feedbackGuard).toMatch(/RAISE WARNING 'fn_auto_close_feedback_on_sd_completion failed for SD %: %', NEW\.id, SQLERRM;/);
    const guardIdx = feedbackGuard.indexOf('EXCEPTION WHEN OTHERS THEN');
    expect(feedbackGuard.slice(guardIdx)).toMatch(/RETURN NEW;/);
  });

  it('ships a paired DOWN migration to restore the unguarded body', () => {
    expect(feedbackGuardDown).toMatch(/CREATE OR REPLACE FUNCTION public\.fn_auto_close_feedback_on_sd_completion/);
    expect(feedbackGuardDown).not.toMatch(/EXCEPTION WHEN OTHERS THEN/);
  });
});

describe('F-9: outer exception guard on try_auto_complete_parent_orchestrator', () => {
  it('preserves the child-count / complete_orchestrator_sd() call chain byte-identically', () => {
    expect(orchestratorGuard).toMatch(/v_result := complete_orchestrator_sd\(v_parent_id\);/);
    expect(orchestratorGuard).toMatch(/COUNT\(\*\) FILTER \(WHERE status = 'completed'\)/);
  });

  it('appends the sibling EXCEPTION WHEN OTHERS guard, returning NEW', () => {
    expect(orchestratorGuard).toMatch(/EXCEPTION WHEN OTHERS THEN/);
    expect(orchestratorGuard).toMatch(/RAISE WARNING 'try_auto_complete_parent_orchestrator failed for SD %: %', NEW\.id, SQLERRM;/);
    const guardIdx = orchestratorGuard.indexOf('EXCEPTION WHEN OTHERS THEN');
    expect(orchestratorGuard.slice(guardIdx)).toMatch(/RETURN NEW;/);
  });

  it('carries a self-verification block asserting the guard is present', () => {
    expect(orchestratorGuard).toMatch(/DO \$verify\$/);
    expect(orchestratorGuard).toMatch(/pg_get_functiondef\('public\.try_auto_complete_parent_orchestrator\(\)'::regprocedure\)/);
  });

  it('ships a paired DOWN migration to restore the unguarded body', () => {
    expect(orchestratorGuardDown).toMatch(/CREATE OR REPLACE FUNCTION public\.try_auto_complete_parent_orchestrator/);
    expect(orchestratorGuardDown).not.toMatch(/EXCEPTION WHEN OTHERS THEN/);
  });
});

describe('TIER-2 chairman-gate compliance', () => {
  it('all 3 migrations are CREATE OR REPLACE FUNCTION (never auto-applied per CLAUDE_CORE.md tiered policy)', () => {
    for (const sql of [uuidGuard, feedbackGuard, orchestratorGuard]) {
      expect(sql).toMatch(/CREATE OR REPLACE FUNCTION/);
    }
  });
});

describe('validator wiring (live round-trip reachability)', () => {
  it('validate:trigger-guard-pack npm script points at the round-trip validator', () => {
    const pkg = JSON.parse(readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
    expect(pkg.scripts['validate:trigger-guard-pack']).toMatch(/validate-trigger-guard-pack\.mjs/);
  });

  it('the validator script exists and rolls back (no persistent writes)', () => {
    const v = readFileSync(path.resolve(process.cwd(), 'scripts/validate-trigger-guard-pack.mjs'), 'utf8');
    expect(v).toMatch(/ROLLBACK/);
    expect(v).toMatch(/SD-TEST-GUARDPACK-ROUNDTRIP/);
  });
});
