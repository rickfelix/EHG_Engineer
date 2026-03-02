#!/usr/bin/env node

/**
 * Enrich SD-VENTURE-IDEATION-MVP-001 with required fields for handoff
 * Add: success_metrics, key_principles, risks
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_ANON_KEY
);

async function enrichSD() {
  console.log('🔄 Enriching SD-VENTURE-IDEATION-MVP-001 for LEAD→PLAN handoff...');
  console.log('='.repeat(80));

  const enrichment = {
    success_metrics: [
      'AI research completes in 5-15 minutes (vs 2-4 hours manual)',
      'Chairman satisfaction ≥8/10 with AI research quality',
      'Cost per venture research ≤$2.00',
      '≥80% of ventures use AI research (vs manual)',
      'Research insights lead to ≥30% improvement in venture validation accuracy'
    ],
    key_principles: [
      'Chairman remains in control - can pause, edit, or override AI research',
      'Transparency - show AI sources and confidence scores',
      'Cost-conscious - track and alert on research costs',
      'Privacy-first - encrypt sensitive research data',
      'Fail gracefully - allow manual fallback if AI research fails',
      'Progressive enhancement - existing modal still works, new workflow is opt-in',
      'Integration constraints: Must integrate with existing ventures table and 40-stage workflow',
      'Feature preservation: Must preserve existing VoiceCapture and EVA validation',
      'Multi-tenancy: Must support company-level data isolation',
      'Compliance: Must comply with third-party API ToS (Reddit, market data)',
      'Cost control: Research duration limited to 15 minutes max',
      'Rate limits: 5 ventures/hour per user, 10 research operations/day per company'
    ],
    risks: [
      {
        risk: 'AI research quality varies by industry/niche',
        mitigation: 'Show confidence scores, allow chairman to request re-research or edit manually',
        severity: 'medium'
      },
      {
        risk: 'Research costs exceed budget ($2+ per venture)',
        mitigation: 'Implement cost tracking, budget alerts, and research tier options (fast/thorough)',
        severity: 'high'
      },
      {
        risk: 'CrewAI API rate limits or downtime',
        mitigation: 'Implement retry logic, queuing, and fallback to manual entry',
        severity: 'high'
      },
      {
        risk: 'Third-party data sources (Reddit, market data) change APIs',
        mitigation: 'Modular agent design - easy to swap data sources',
        severity: 'medium'
      },
      {
        risk: 'Chairman abandons long-running research (5-15 min)',
        mitigation: 'Pause/resume functionality, save draft, email notification when complete',
        severity: 'medium'
      },
      {
        risk: 'Security - AI research may expose sensitive market data',
        mitigation: 'Encrypt research results, RLS policies, audit logging',
        severity: 'high'
      }
    ]
  };

  try {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .update({
        success_metrics: enrichment.success_metrics,
        key_principles: enrichment.key_principles,
        risks: enrichment.risks,
        updated_at: new Date().toISOString()
      })
      .eq('id', 'SD-VENTURE-IDEATION-MVP-001')
      .select()
      .single();

    if (error) throw error;

    console.log('✅ Successfully enriched SD-VENTURE-IDEATION-MVP-001');
    console.log('');
    console.log('📊 Added Fields:');
    console.log('  ✅ Success Metrics:', enrichment.success_metrics.length);
    console.log('  ✅ Key Principles:', enrichment.key_principles.length, '(includes constraints)');
    console.log('  ✅ Risks:', enrichment.risks.length);
    console.log('');
    console.log('📈 SD should now pass handoff validation (≥85% complete)');
    console.log('='.repeat(80));

    return data;
  } catch (error) {
    console.error('❌ Error enriching SD:', error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  enrichSD();
}

export { enrichSD };
