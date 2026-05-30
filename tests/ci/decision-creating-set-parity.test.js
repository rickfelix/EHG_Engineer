// SD-LEO-REFAC-GATE-DECISION-CREATION-001 FR-5 TS-7
// CI drift assertion: FALLBACK_DECISION_CREATING_STAGES must equal the
// venture_stages-derived predicate. Prevents future drift if venture_stages
// changes without a corresponding fallback Set update.

import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { FALLBACK_DECISION_CREATING_STAGES } from '../../lib/eva/chairman-decision-watcher.js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe('FALLBACK_DECISION_CREATING_STAGES parity with venture_stages', () => {
  it.runIf(SUPABASE_URL && SUPABASE_KEY)(
    'fallback Set equals (gate_type IN kill/promotion) ∪ (review_mode=review)',
    async () => {
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
      const { data, error } = await supabase
        .from('venture_stages')
        .select('stage_number,gate_type,review_mode');
      if (error) throw error;

      const derived = new Set(
        data
          .filter(r => ['kill', 'promotion'].includes(r.gate_type) || r.review_mode === 'review')
          .map(r => r.stage_number)
      );

      const fallback = new Set(FALLBACK_DECISION_CREATING_STAGES);

      const onlyInDerived = [...derived].filter(s => !fallback.has(s));
      const onlyInFallback = [...fallback].filter(s => !derived.has(s));

      expect({ onlyInDerived, onlyInFallback }).toEqual({ onlyInDerived: [], onlyInFallback: [] });
    },
    30_000
  );
});
