/**
 * Adam-contract recurrence guard tests — SD-LEO-FIX-RESOLVE-ADAM-CONTRACT-001.
 * Pure detector unit cases + a REAL-file assertion against the regenerated CLAUDE_ADAM.md
 * (so the guard is exercised against the actual shipped contract, not only synthetic strings).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { auditSourcingGateConflict } from '../../lib/governance/adam-contract-audit.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');

// The OLD (buggy) active directive — sourcing/filing inside the gated enumeration.
const OLD_BUGGY = "Adam does **NOT** autonomously *begin* self-generated proactive work — sourcing/filing SDs, launching investigations, building — without the coordinator's confirmation.";
// The corrected active directive — sourcing/filing removed from the gate.
const CORRECTED = "Adam does **NOT** autonomously *begin* self-generated proactive work — launching investigations, building — without the coordinator's confirmation. **Sourcing/filing DRAFT SDs is EXEMPT — runs CONTINUOUSLY per NEVER HOLD SOURCING.**";
// A dated historical changelog mention (must NOT false-positive — different phrasing: parens + "go").
const CHANGELOG = "**2026-06-08**: Added the clause: Adam never autonomously *begins* self-generated proactive work (sourcing/filing SDs, launching investigations, building) without the coordinator's go.";

describe('auditSourcingGateConflict (pure)', () => {
  it('FLAGS the old buggy clause (sourcing/filing inside the gated enumeration)', () => {
    const r = auditSourcingGateConflict(OLD_BUGGY);
    expect(r.conflict).toBe(true);
    expect(r.reason).toMatch(/sourcing\/filing|EXEMPT/i);
  });
  it('PASSES the corrected clause (sourcing/filing removed from the gate)', () => {
    expect(auditSourcingGateConflict(CORRECTED).conflict).toBe(false);
  });
  it('does NOT false-positive on a dated historical changelog mention', () => {
    // changelog uses "(...) without the coordinator's go" — not the active "— ... — without ... confirmation" directive
    expect(auditSourcingGateConflict(CHANGELOG).conflict).toBe(false);
  });
  it('fail-open on empty/non-string input', () => {
    expect(auditSourcingGateConflict('').conflict).toBe(false);
    expect(auditSourcingGateConflict(null).conflict).toBe(false);
  });
  it('no active directive present -> not a conflict', () => {
    expect(auditSourcingGateConflict('some unrelated contract text').conflict).toBe(false);
  });
});

describe('hardened against evasion (adversarial review w22s1wray)', () => {
  it('FLAGS an en-dash (U+2013) delimited re-gating (was a false-negative)', () => {
    const enDash = "Adam does NOT autonomously begin self-generated proactive work – sourcing/filing SDs, building – without the coordinator's confirmation.";
    expect(auditSourcingGateConflict(enDash).conflict).toBe(true);
  });
  it('FLAGS a reworded trailing clause (go / approval), dash-delimited', () => {
    const go = "self-generated proactive work — sourcing/filing SDs, building — without the coordinator's go.";
    const appr = "self-generated proactive work — filing SDs — without the coordinator's approval.";
    expect(auditSourcingGateConflict(go).conflict).toBe(true);
    expect(auditSourcingGateConflict(appr).conflict).toBe(true);
  });
  it('FLAGS a multi-line enumeration', () => {
    const ml = "self-generated proactive work —\n  - sourcing/filing SDs\n  - building\n— without the coordinator's confirmation.";
    expect(auditSourcingGateConflict(ml).conflict).toBe(true);
  });
  it('still does NOT false-positive on the paren-delimited changelog even with a go trailing', () => {
    // changelog uses PARENS after "proactive work" (not a dash) -> dash-delimited regex never fires
    const cl = "**2026-06-08**: Adam never autonomously begins self-generated proactive work (sourcing/filing SDs, building) without the coordinator's go.";
    expect(auditSourcingGateConflict(cl).conflict).toBe(false);
  });
  it('curly apostrophe in coordinator’s is handled', () => {
    const curly = "self-generated proactive work — sourcing/filing SDs — without the coordinator’s confirmation.";
    expect(auditSourcingGateConflict(curly).conflict).toBe(true);
  });
});

describe('REAL regenerated CLAUDE_ADAM.md (integration — the actual shipped contract)', () => {
  it('the shipped contract has NO sourcing-in-the-gate conflict', () => {
    const p = resolve(REPO_ROOT, 'CLAUDE_ADAM.md');
    if (!existsSync(p)) { expect(existsSync(p)).toBe(true); return; }
    const text = readFileSync(p, 'utf8');
    const r = auditSourcingGateConflict(text);
    expect(r.conflict).toBe(false);
    // sanity: the active directive WAS found + parsed (the regex matched the real file), and the
    // EXEMPT carve-out is present — proving the fix is in the shipped contract, not just absent.
    expect(r.enumeration).not.toBeNull();
    expect(text).toMatch(/Sourcing\/filing DRAFT SDs is EXEMPT/);
  });
});
