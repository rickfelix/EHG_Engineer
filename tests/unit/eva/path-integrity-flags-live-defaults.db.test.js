// SD-LEO-INFRA-MINUS-PATH-INTEGRITY-001 — TESTING EXEC-TO-PLAN finding C5/C6: TS-11(a) (FR-1)
// and TS-12(a) (FR-4) asserted the MIGRATION FILE's text, not the live leo_feature_flags row --
// a real value, not a behavioral proxy. This closes that gap with a genuine live read.
//
// Skips gracefully when SUPABASE creds are absent (CI lane without secrets, matching
// tests/unit/roadmap/plan-of-record-remainder-view.db.test.js's established pattern).

import { describe, it, expect, beforeAll } from 'vitest';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const HAS_CREDS = Boolean(SUPABASE_URL && SERVICE_KEY);

describe.skipIf(!HAS_CREDS)(
  'leo_feature_flags — path-integrity safe defaults, live (D5, TS-11/TS-12)',
  () => {
    let flagRows;

    beforeAll(async () => {
      const { createClient } = await import('@supabase/supabase-js');
      const sb = createClient(SUPABASE_URL, SERVICE_KEY);
      // Real column-select, not count/head (TR-8: a head:true count on a MISSING table/row
      // returns count=null with NO error and cannot prove presence or absence).
      const { data, error } = await sb
        .from('leo_feature_flags')
        .select('flag_key, is_enabled, lifecycle_state, display_name')
        .in('flag_key', ['PATH_INTEGRITY_EXIT_GATE_ENFORCE', 'PATH_INTEGRITY_PRODUCT_REVIEW_KILL_SWITCH']);
      if (error) throw new Error(`leo_feature_flags query failed: ${error.message}`);
      flagRows = data;
    });

    it('TS-11(a): PATH_INTEGRITY_EXIT_GATE_ENFORCE (FR-1) row exists, is_enabled=false, lifecycle_state=disabled', () => {
      const row = flagRows.find((r) => r.flag_key === 'PATH_INTEGRITY_EXIT_GATE_ENFORCE');
      expect(row).toBeDefined();
      expect(row.is_enabled).toBe(false);
      expect(row.lifecycle_state).toBe('disabled');
      expect(row.display_name).toBeTruthy();
    });

    it('TS-12(a): PATH_INTEGRITY_PRODUCT_REVIEW_KILL_SWITCH (FR-4) row exists, is_enabled=false, lifecycle_state=disabled', () => {
      const row = flagRows.find((r) => r.flag_key === 'PATH_INTEGRITY_PRODUCT_REVIEW_KILL_SWITCH');
      expect(row).toBeDefined();
      expect(row.is_enabled).toBe(false);
      expect(row.lifecycle_state).toBe('disabled');
      expect(row.display_name).toBeTruthy();
    });
  }
);
