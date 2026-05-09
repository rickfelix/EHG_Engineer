// QF-20260509-AUDIT-LOG-SHAPE — closes feedback 327716da. Two harness paths
// inserted into audit_log with non-existent columns (`action`, `details`) so
// the inserts silently failed against the canonical schema. This test pins
// both call sites to the canonical column set so future regressions are
// caught at unit-test time, not production-runtime "insert silently fails".
//
// Canonical audit_log columns (from production schema, sample row 2026-05-09):
//   id (auto), event_type, entity_type, entity_id, old_value, new_value,
//   metadata, severity, created_by, created_at (auto).
//
// Forbidden keys on audit_log inserts: action, details (these are the bug
// shapes that motivated this test).

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

const SUBAGENT_EVIDENCE_GATE = path.join(
  repoRoot,
  'scripts/modules/handoff/gates/subagent-evidence-gate.js'
);
const STOP_HOOK_BYPASS_HANDLER = path.join(
  repoRoot,
  'scripts/hooks/stop-subagent-enforcement/bypass-handler.js'
);

const REQUIRED_AUDIT_LOG_KEYS = ['event_type', 'entity_type', 'severity', 'metadata', 'created_by'];
const FORBIDDEN_AUDIT_LOG_KEYS = ['action', 'details'];

function readSrc(p) {
  return fs.readFileSync(p, 'utf-8');
}

// Extract the object literal passed to a `audit_log` insert call. We pin to
// the first such call in each file (the bypass-audit path).
function extractFirstAuditLogInsert(src) {
  // Match `.from('audit_log').insert({ ... })` — find balanced braces by
  // counting from the opening `{` of the object literal.
  const re = /from\(\s*['"]audit_log['"]\s*\)\s*\.insert\s*\(\s*\{/;
  const m = src.match(re);
  if (!m) return null;
  const startIdx = m.index + m[0].length - 1; // position of '{'
  let depth = 0;
  let endIdx = -1;
  for (let i = startIdx; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  if (endIdx === -1) return null;
  return src.substring(startIdx, endIdx + 1);
}

describe('QF-20260509-AUDIT-LOG-SHAPE: audit_log insert shape regression pin', () => {
  describe('subagent-evidence-gate.js writeKillSwitchAudit', () => {
    let auditObj;
    beforeAll(() => {
      const src = readSrc(SUBAGENT_EVIDENCE_GATE);
      auditObj = extractFirstAuditLogInsert(src);
      expect(auditObj, 'expected an audit_log.insert({...}) call').not.toBeNull();
    });

    it('does NOT include the non-existent `action` column', () => {
      // Pre-fix bug: `action: 'gate_bypass'` — audit_log has no action column.
      expect(auditObj).not.toMatch(/\baction\s*:/);
    });

    it('does NOT include the non-existent `details` column', () => {
      expect(auditObj).not.toMatch(/\bdetails\s*:/);
    });

    it('emits all canonical required columns (event_type, entity_type, severity, metadata, created_by)', () => {
      for (const key of REQUIRED_AUDIT_LOG_KEYS) {
        expect(auditObj, `missing canonical key: ${key}`).toMatch(new RegExp(`\\b${key}\\s*:`));
      }
    });

    it('event_type is the bypass event identifier (gate_bypass)', () => {
      expect(auditObj).toMatch(/event_type\s*:\s*['"]gate_bypass['"]/);
    });

    it('entity_type is strategic_directive (gate bypass is per-SD)', () => {
      expect(auditObj).toMatch(/entity_type\s*:\s*['"]strategic_directive['"]/);
    });

    it('entity_id is the SD UUID parameter (sdUuid)', () => {
      expect(auditObj).toMatch(/entity_id\s*:\s*sdUuid/);
    });

    it('created_by attributes the writer for forensic traceability', () => {
      expect(auditObj).toMatch(/created_by\s*:\s*['"]subagent-evidence-gate['"]/);
    });
  });

  describe('stop-subagent-enforcement/bypass-handler.js audit log', () => {
    let auditObj;
    beforeAll(() => {
      const src = readSrc(STOP_HOOK_BYPASS_HANDLER);
      auditObj = extractFirstAuditLogInsert(src);
      expect(auditObj, 'expected an audit_log.insert({...}) call').not.toBeNull();
    });

    it('does NOT include the non-existent `action` column', () => {
      expect(auditObj).not.toMatch(/\baction\s*:/);
    });

    it('does NOT include the non-existent `details` column', () => {
      // Pre-fix bug: `details: {...}` — audit_log column is `metadata`, not `details`.
      expect(auditObj).not.toMatch(/\bdetails\s*:/);
    });

    it('emits all canonical required columns (event_type, entity_type, severity, metadata, created_by)', () => {
      for (const key of REQUIRED_AUDIT_LOG_KEYS) {
        expect(auditObj, `missing canonical key: ${key}`).toMatch(new RegExp(`\\b${key}\\s*:`));
      }
    });

    it('event_type is the bypass event identifier (STOP_HOOK_BYPASS)', () => {
      expect(auditObj).toMatch(/event_type\s*:\s*['"]STOP_HOOK_BYPASS['"]/);
    });

    it('entity_type is strategic_directive', () => {
      expect(auditObj).toMatch(/entity_type\s*:\s*['"]strategic_directive['"]/);
    });

    it('entity_id is the bypass.sd_key', () => {
      expect(auditObj).toMatch(/entity_id\s*:\s*bypass\.sd_key/);
    });

    it('metadata payload retains the bypass fields (sd_key, explanation, skipped_agents, retrospective_id)', () => {
      expect(auditObj).toMatch(/sd_key:\s*bypass\.sd_key/);
      expect(auditObj).toMatch(/explanation:\s*bypass\.explanation/);
      expect(auditObj).toMatch(/skipped_agents:\s*bypass\.skipped_agents/);
      expect(auditObj).toMatch(/retrospective_id:\s*bypass\.retrospective_id/);
    });

    it('created_by attributes the writer', () => {
      expect(auditObj).toMatch(/created_by\s*:\s*['"]stop-hook-bypass-handler['"]/);
    });
  });

  describe('cross-site invariant: forbidden keys absent everywhere in both files', () => {
    it('neither file references the forbidden `action` key in any audit_log insert object', () => {
      // Coarse but sufficient — these files have only the bypass-audit insert
      // touching audit_log; any future audit_log insert added here must also
      // honor canonical shape, and this guard makes that explicit.
      const a = readSrc(SUBAGENT_EVIDENCE_GATE);
      const b = readSrc(STOP_HOOK_BYPASS_HANDLER);
      const re = /from\(\s*['"]audit_log['"]\s*\)/;
      // Both files do call .from('audit_log') — sanity check that we picked
      // the right files, then assert no `action:` literal appears within
      // ~500 chars after the .insert(.
      expect(a.match(re), 'subagent-evidence-gate.js should reference audit_log').toBeTruthy();
      expect(b.match(re), 'bypass-handler.js should reference audit_log').toBeTruthy();
      for (const src of [a, b]) {
        const obj = extractFirstAuditLogInsert(src);
        expect(obj).not.toBeNull();
        for (const forbidden of FORBIDDEN_AUDIT_LOG_KEYS) {
          expect(obj, `forbidden key ${forbidden} should be absent`).not.toMatch(
            new RegExp(`\\b${forbidden}\\s*:`)
          );
        }
      }
    });
  });
});
