/**
 * SD-LEO-INFRA-SIDE-CLAIM-ELIGIBILITY-001: static-pin safety properties for the 3 new
 * migrations. DDL cannot run against a real Postgres instance in a unit test, so these pins
 * assert the SQL text itself carries the safety invariants the SD demands -- most critically
 * that the observe-only trigger is fail-open end-to-end and NEVER raises (a broken trigger
 * must never stall the fleet's claim mechanism), and that claim_sd's DROP+CREATE preserves
 * the single-overload contract (a second overload reproduces the exact PGRST203 fleet-stall
 * this SD exists to prevent).
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../database/migrations');

const registrySrc = readFileSync(path.join(MIGRATIONS_DIR, '20260704_claim_gate_version_registry.sql'), 'utf8');
const clientVersionSrc = readFileSync(path.join(MIGRATIONS_DIR, '20260704_claim_sd_client_gate_version.sql'), 'utf8');
const observeTriggerSrc = readFileSync(path.join(MIGRATIONS_DIR, '20260704_claim_eligibility_observe_trigger.sql'), 'utf8');

describe('claim-gate-version-registry migration (FR-1)', () => {
  test('seeds claim_gate_version_floor via atomic jsonb_set (never a read-then-write merge)', () => {
    expect(registrySrc).toMatch(/jsonb_set\(COALESCE\(metadata,\s*'\{\}'::jsonb\),\s*'\{claim_gate_version_floor\}'/);
  });

  test('targets the shared config_key=default row (not a new config row)', () => {
    expect(registrySrc).toMatch(/WHERE config_key = 'default'/);
  });
});

describe('claim_sd client-gate-version migration (FR-2)', () => {
  test('adds claim_gate_client_version as a nullable additive column', () => {
    expect(clientVersionSrc).toMatch(/ALTER TABLE strategic_directives_v2 ADD COLUMN IF NOT EXISTS claim_gate_client_version integer/);
  });

  test('drops the old 4-arg overload before creating the 5-arg version (avoids the PGRST203 dual-overload hazard)', () => {
    const dropIdx = clientVersionSrc.indexOf('DROP FUNCTION IF EXISTS public.claim_sd(text, text, text, boolean)');
    const createIdx = clientVersionSrc.indexOf('CREATE FUNCTION public.claim_sd(');
    expect(dropIdx).toBeGreaterThan(0);
    expect(createIdx).toBeGreaterThan(dropIdx);
  });

  test('new signature appends p_client_gate_version as the 5th, defaulted parameter (never changes existing positional args)', () => {
    expect(clientVersionSrc).toMatch(
      /CREATE FUNCTION public\.claim_sd\(p_sd_id text, p_session_id text, p_track text, p_force_takeover boolean DEFAULT false, p_client_gate_version integer DEFAULT NULL\)/
    );
  });

  test('stamps claim_gate_client_version only in the strategic_directives_v2 UPDATE (the one behavioral addition)', () => {
    expect(clientVersionSrc).toMatch(/claim_gate_client_version = p_client_gate_version/);
    // Every pre-existing guard from the live function must survive verbatim -- spot-check the
    // most safety-critical ones (live-peer refusal, silenced-peer refusal, terminal-status guard).
    expect(clientVersionSrc).toMatch(/CLAIM_LIVE_PEER/);
    expect(clientVersionSrc).toMatch(/CLAIM_SILENCED_PEER/);
    expect(clientVersionSrc).toMatch(/CLAIM_SD_TERMINAL/);
    expect(clientVersionSrc).toMatch(/pg_advisory_xact_lock\(hashtext\(p_sd_id\)\)/);
  });

  test('verifies exactly one claim_sd overload exists after the migration runs', () => {
    expect(clientVersionSrc).toMatch(/SELECT count\(\*\) INTO v_overload_count FROM pg_proc WHERE proname = 'claim_sd'/);
    expect(clientVersionSrc).toMatch(/IF v_overload_count != 1 THEN/);
  });

  test('notifies PostgREST to reload its schema cache for the new signature', () => {
    expect(clientVersionSrc).toMatch(/NOTIFY pgrst, 'reload schema'/);
  });
});

describe('claim-eligibility observe-only trigger (FR-3/FR-4)', () => {
  test('the trigger function has an outer fail-open EXCEPTION handler that returns NEW (never blocks)', () => {
    const fnStart = observeTriggerSrc.indexOf('CREATE OR REPLACE FUNCTION public.claim_eligibility_observe()');
    expect(fnStart).toBeGreaterThan(0);
    const fnBody = observeTriggerSrc.slice(fnStart);
    expect(fnBody).toMatch(/EXCEPTION WHEN OTHERS THEN\s*\n\s*RETURN NEW;/);
  });

  test('never RAISEs (observe-only: logs would-rejects, never blocks the write)', () => {
    const fnStart = observeTriggerSrc.indexOf('CREATE OR REPLACE FUNCTION public.claim_eligibility_observe()');
    const fnEnd = observeTriggerSrc.indexOf('$function$;', fnStart);
    const fnBody = observeTriggerSrc.slice(fnStart, fnEnd);
    expect(fnBody).not.toMatch(/RAISE EXCEPTION/);
  });

  test('the version-floor read is isolated in its own fail-open sub-block', () => {
    expect(observeTriggerSrc).toMatch(/EXCEPTION WHEN OTHERS THEN\s*\n\s*v_floor := NULL;/);
  });

  test('checks the 3 config-free invariants: requires_human_action, needs_coordinator_review, orchestrator-parent', () => {
    expect(observeTriggerSrc).toMatch(/requires_human_action/);
    expect(observeTriggerSrc).toMatch(/needs_coordinator_review/);
    expect(observeTriggerSrc).toMatch(/sd_type = 'orchestrator'/);
  });

  test('explicitly documents repo-match as OUT OF SCOPE / dropped (not silently omitted)', () => {
    expect(observeTriggerSrc).toMatch(/repo-match.*DROPPED ENTIRELY/is);
  });

  test('logs would-reject events to a claim_rejects ledger, never raises to block', () => {
    expect(observeTriggerSrc).toMatch(/CREATE TABLE IF NOT EXISTS claim_rejects/);
    expect(observeTriggerSrc).toMatch(/INSERT INTO claim_rejects/);
  });

  test('fires only on claim ACQUISITION (claiming_session_id transitioning to non-null)', () => {
    expect(observeTriggerSrc).toMatch(
      /WHEN \(NEW\.claiming_session_id IS DISTINCT FROM OLD\.claiming_session_id AND NEW\.claiming_session_id IS NOT NULL\)/
    );
  });
});
