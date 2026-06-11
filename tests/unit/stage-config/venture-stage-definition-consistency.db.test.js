// SD-LEO-INFRA-VENTURE-STAGE-DEFINITION-001 — AC-6 consistency assertion.
//
// The byte-parity test (venture-workflow-byte-parity.test.js) guards that the
// generated mirror matches the venture_stages SSOT. THIS test guards the SSOT
// itself: after the definition-alignment migration, every one of the 26 stages
// must follow one naming convention and carry a non-empty, brand-free
// description that agrees with its app_description.
//
// It reads venture_stages directly (the DB is the source of truth — AC asserts
// against it, not the generated file). When SUPABASE creds are absent (e.g. a
// CI lane without DB secrets, or a local run not wrapped in dotenvx) the suite
// skips gracefully rather than failing.

import { describe, it, expect, beforeAll } from 'vitest';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const HAS_CREDS = Boolean(SUPABASE_URL && SUPABASE_KEY);

// Brand / tool names that leaked into earlier descriptions from superseded
// components — descriptions must stay implementation-neutral.
const BRAND_NAMES = [/\bLovable\b/i, /\bStitch\b/i, /\bClaude Code\b/i, /\bGitHub\b/i, /\bnpm\b/i];

// phase_name must be uniform Title-Case "The X" (single capitalized word).
const PHASE_NAME_RE = /^The [A-Z][a-z]+$/;

describe.skipIf(!HAS_CREDS)(
  'venture_stages definition consistency (SD-LEO-INFRA-VENTURE-STAGE-DEFINITION-001 AC-6)',
  () => {
    let stages = [];

    beforeAll(async () => {
      const { createClient } = await import('@supabase/supabase-js');
      const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
      const { data, error } = await sb
        .from('venture_stages')
        .select('stage_number,stage_name,phase_number,phase_name,chunk,description,app_description')
        .order('stage_number');
      if (error) throw new Error(`venture_stages query failed: ${error.message}`);
      stages = data;
    });

    it('has exactly 26 stages numbered 1..26', () => {
      expect(stages.length).toBe(26);
      expect(stages.map((s) => s.stage_number)).toEqual(
        Array.from({ length: 26 }, (_, i) => i + 1)
      );
    });

    it('every stage has a non-empty description and app_description (AC-3)', () => {
      const empty = stages.filter(
        (s) => !s.description?.trim() || !s.app_description?.trim()
      );
      expect(
        empty.map((s) => s.stage_number),
        'stages with empty description/app_description'
      ).toEqual([]);
    });

    it('phase_name is uniform "The X" across all 26 rows, exactly 6 distinct (AC-1)', () => {
      const bad = stages.filter((s) => !PHASE_NAME_RE.test(s.phase_name || ''));
      expect(
        bad.map((s) => `${s.stage_number}:${s.phase_name}`),
        'rows whose phase_name is not "The X"'
      ).toEqual([]);
      expect(new Set(stages.map((s) => s.phase_name)).size).toBe(6);
    });

    it('phase_name agrees with phase_number (one label per phase)', () => {
      const byPhase = new Map();
      for (const s of stages) {
        if (!byPhase.has(s.phase_number)) byPhase.set(s.phase_number, new Set());
        byPhase.get(s.phase_number).add(s.phase_name);
      }
      const conflicts = [...byPhase.entries()].filter(([, names]) => names.size > 1);
      expect(conflicts.map(([p]) => p), 'phase_numbers with >1 phase_name').toEqual([]);
    });

    it('no description embeds a tool/brand name (AC-4 implementation-neutral)', () => {
      const offenders = stages
        .filter((s) => BRAND_NAMES.some((re) => re.test(s.description) || re.test(s.app_description)))
        .map((s) => s.stage_number);
      expect(offenders, 'stages whose description names a tool/brand').toEqual([]);
    });

    it('stage 23 name no longer embeds the gate type (AC-2)', () => {
      const s23 = stages.find((s) => s.stage_number === 23);
      expect(s23.stage_name).toBe('Launch Readiness');
    });

    it('chunk partitions cleanly: THE_BUILD = 18..23, THE_LAUNCH = 24..26', () => {
      const inChunk = (c) =>
        stages
          .filter((s) => s.chunk === c)
          .map((s) => s.stage_number)
          .sort((a, b) => a - b);
      expect(inChunk('THE_BUILD')).toEqual([18, 19, 20, 21, 22, 23]);
      expect(inChunk('THE_LAUNCH')).toEqual([24, 25, 26]);
    });
  }
);
