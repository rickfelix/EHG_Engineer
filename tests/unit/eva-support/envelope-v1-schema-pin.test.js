/**
 * SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-B / FR-1, AC-2, TEST-1, US-002
 *
 * Static regression-pin: asserts envelope v1.0 schema is locked across BOTH sides:
 *   (a) scripts/eva-support/decision-log-formatter.js literals: ENVELOPE_VERSION,
 *       FENCE_LANG, REQUIRED_FIELDS (12 named entries)
 *   (b) eva_support_decision_log table column list (excluding metadata cols
 *       created_at + PK ordering)
 *
 * The pin is read-side: it consumes the formatter source via fs.readFileSync +
 * regex (not an import — guards against accidental constant rename) and consults
 * information_schema.columns for the table side. Either drift fails loudly.
 *
 * Dual-anchor pattern per SD-FDBK-ENH-CADENCE-VOCAB-DISCRIMINATOR-001 (PR #3685):
 *   - whole-file regex for module-level constants
 *   - scoped slice for the REQUIRED_FIELDS array literal
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const FORMATTER_PATH = resolve(
  process.cwd(),
  'scripts/eva-support/decision-log-formatter.js',
);

const EXPECTED_REQUIRED_FIELDS = [
  'schema_version',
  'task_id',
  'sequence',
  'timestamp',
  'flow',
  'eva_reply_summary',
  'operator_input_summary',
  'override_reason',
  'model',
  'tokens_in',
  'tokens_out',
  'references',
];

const EXPECTED_ENVELOPE_VERSION = '1.0';
const EXPECTED_FENCE_LANG = 'eva-decision-log';

describe('envelope v1.0 schema pin (formatter + eva_support_decision_log)', () => {
  let formatterSrc;

  beforeAll(() => {
    formatterSrc = readFileSync(FORMATTER_PATH, 'utf8');
  });

  it('formatter file is readable', () => {
    expect(formatterSrc.length).toBeGreaterThan(100);
  });

  describe('formatter literals (read via fs.readFileSync + regex)', () => {
    it('ENVELOPE_VERSION literal is exactly "1.0"', () => {
      const match = formatterSrc.match(
        /export\s+const\s+ENVELOPE_VERSION\s*=\s*['"]([^'"]+)['"]/,
      );
      expect(match).not.toBeNull();
      expect(match[1]).toBe(EXPECTED_ENVELOPE_VERSION);
    });

    it('FENCE_LANG literal is exactly "eva-decision-log"', () => {
      const match = formatterSrc.match(
        /export\s+const\s+FENCE_LANG\s*=\s*['"]([^'"]+)['"]/,
      );
      expect(match).not.toBeNull();
      expect(match[1]).toBe(EXPECTED_FENCE_LANG);
    });

    it('REQUIRED_FIELDS array contains exactly the 12 expected fields in order', () => {
      // Scoped slice for the REQUIRED_FIELDS array literal — dual-anchor pattern.
      const startMatch = formatterSrc.match(
        /export\s+const\s+REQUIRED_FIELDS\s*=\s*\[/,
      );
      expect(startMatch).not.toBeNull();
      const start = startMatch.index + startMatch[0].length;
      const end = formatterSrc.indexOf('];', start);
      expect(end).toBeGreaterThan(start);

      const arrayBody = formatterSrc.slice(start, end);
      // Extract quoted-string entries
      const entries = [...arrayBody.matchAll(/['"]([a-z_]+)['"]/g)].map(
        (m) => m[1],
      );

      expect(entries).toEqual(EXPECTED_REQUIRED_FIELDS);
    });
  });

  describe('eva_support_decision_log table columns', () => {
    let columnNames;

    beforeAll(async () => {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
      );
      const { data, error } = await supabase.rpc('exec_sql', {
        sql_text:
          "SELECT column_name FROM information_schema.columns WHERE table_name='eva_support_decision_log' AND table_schema='public' ORDER BY ordinal_position",
      });
      if (error) throw error;
      const rows = data?.[0]?.result ?? [];
      columnNames = rows.map((r) => r.column_name);
    });

    it('table exists with at least the 12 required columns (plus created_at)', () => {
      expect(columnNames.length).toBeGreaterThanOrEqual(12);
    });

    it('table columns include every REQUIRED_FIELDS entry verbatim', () => {
      for (const field of EXPECTED_REQUIRED_FIELDS) {
        expect(columnNames).toContain(field);
      }
    });

    it('table columns do NOT include extras beyond REQUIRED_FIELDS + created_at + Phase 3 audit columns', () => {
      // Allowed extras:
      //   created_at - row metadata, not envelope (original Phase 2 allowance)
      //   decision_kind + metadata - Phase 3 audit columns added by
      //     SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C / FR-0 Migration 2. These are
      //     additive non-breaking — the Phase 2 envelope writer (insertEntry)
      //     does not pass them; decision_kind has a DEFAULT='sd_recommendation'
      //     so existing Phase 2 inserts succeed unchanged.
      const allowedExtras = new Set(['created_at', 'decision_kind', 'metadata']);
      for (const col of columnNames) {
        const isRequiredField = EXPECTED_REQUIRED_FIELDS.includes(col);
        const isAllowedExtra = allowedExtras.has(col);
        expect(
          isRequiredField || isAllowedExtra,
          `column "${col}" is neither a REQUIRED_FIELDS entry nor an allowed extra (${[...allowedExtras].join(', ')})`,
        ).toBe(true);
      }
    });
  });
});
