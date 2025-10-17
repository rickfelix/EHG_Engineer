#!/usr/bin/env node

/**
 * Update PRD-SD-VIDEO-VARIANT-001 with Runway API
 * Strategic pivot based on research: Sora 2 not production-ready
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_ANON_KEY
);

const PRD_ID = 'PRD-SD-VIDEO-VARIANT-001';

async function updatePRD() {
  console.log('🔄 Updating PRD with Runway Gen-3 API');
  console.log('='.repeat(80));
  console.log('Strategic Pivot: Sora 2 → Runway Gen-3 (production-ready)');
  console.log('');

  try {
    const { data, error } = await supabase
      .from('product_requirements_v2')
      .update({
        executive_summary: `Video Variant Testing & Optimization Engine enables venture teams to generate 12-20 video variants from a single prompt using Runway's Gen-3 API, track performance across 5 major social platforms (Instagram, TikTok, YouTube, LinkedIn, X), and identify winning variants with >70% statistical confidence. This system reduces video production time from weeks to minutes while providing data-driven optimization recommendations. **Architecture uses provider-agnostic abstraction layer for future flexibility (e.g., Sora 2 when GA).**`,

        technical_context: `Integration with Runway Gen-3 API via @runwayml/sdk for AI-generated video variants, multi-platform API connectors (Instagram Graph API, TikTok API, YouTube Data API v3, LinkedIn Marketing API, Twitter API v2), statistical analysis engine using jstat library, and React-based performance dashboards with Recharts visualization. **Service abstraction layer (IVideoGenerationService) allows swapping providers without UI changes.**`,

        functional_requirements: [
          'Submit single video concept prompt to generate 12-20 variants via Runway Gen-3 API',
          'Upload variants to Instagram, TikTok, YouTube, LinkedIn, and X with platform-specific formatting',
          'Track performance metrics: views, engagement rate, CTR, conversions, shares',
          'Sync platform data every 15 minutes for real-time monitoring',
          'Calculate statistical confidence scores (p-values, confidence intervals) for variant comparison',
          'Display performance comparison dashboard with sorting, filtering, and CSV export',
          'Recommend winning variant with >70% confidence threshold',
          'Archive historical variant data with 1-year retention policy',
          'Provide platform-specific optimization recommendations based on historical patterns'
        ],

        technology_stack: [
          'Frontend: React 18, Vite, TypeScript',
          'UI: Shadcn UI, TailwindCSS, Recharts',
          'Backend: Node.js, Express',
          'Database: Supabase PostgreSQL',
          'APIs: Runway Gen-3 (@runwayml/sdk), Instagram Graph, TikTok, YouTube Data v3, LinkedIn Marketing, Twitter API v2',
          'Testing: Vitest (unit), Playwright (E2E)',
          'Statistics: jstat library',
          'CI/CD: GitHub Actions',
          'Architecture: IVideoGenerationService interface for provider abstraction'
        ],

        dependencies: [
          'Runway Gen-3 API access (credit-based pricing: $0.05/sec)',
          'Instagram Graph API credentials',
          'TikTok API credentials',
          'YouTube Data API v3 credentials',
          'LinkedIn Marketing API credentials',
          'Twitter API v2 credentials',
          'Supabase project with PostgreSQL database',
          'React + Vite project structure',
          'Future consideration: OpenAI Sora 2 API when GA/stable'
        ],

        api_specifications: [
          {
            endpoint: '/api/variants/generate',
            method: 'POST',
            description: 'Generate video variants via Runway Gen-3 API',
            payload: { prompt: 'string', variant_count: 'integer (12-20)', duration: 'integer (seconds)', resolution: 'string' },
            response: { campaign_id: 'UUID', variants: 'array', provider: 'runway' },
            notes: 'Uses IVideoGenerationService abstraction - provider can be swapped'
          },
          {
            endpoint: '/api/variants/upload',
            method: 'POST',
            description: 'Upload variants to social platforms',
            payload: { variant_ids: 'array', platforms: 'array' },
            response: { upload_status: 'object' }
          },
          {
            endpoint: '/api/performance/sync',
            method: 'GET',
            description: 'Sync performance metrics from platforms',
            response: { metrics: 'array', synced_at: 'timestamp' }
          },
          {
            endpoint: '/api/analysis/winner',
            method: 'POST',
            description: 'Calculate statistical winner',
            payload: { campaign_id: 'UUID' },
            response: { winner: 'object', confidence: 'decimal', alternatives: 'array' }
          }
        ],

        performance_requirements: {
          video_generation_time: '<10 minutes for 12-20 variants (Runway gen4_turbo model)',
          platform_sync_latency: '<5 seconds per platform',
          dashboard_load_time: '<2 seconds initial load',
          statistical_analysis_time: '<30 seconds for 20 variants',
          api_response_time: '<500ms for 95th percentile',
          runway_concurrency: '1-20+ concurrent jobs (tier-based)'
        },

        constraints: [
          'Must use Runway Gen-3 API for MVP (provider-agnostic architecture allows future migration)',
          'Must integrate all 5 platforms (Instagram, TikTok, YouTube, LinkedIn, X)',
          'Must achieve >70% statistical confidence for winner identification',
          'All components must be <600 LOC (architectural standard)',
          'Test coverage must be >=80% (quality gate)',
          'Service abstraction must support multiple providers (IVideoGenerationService interface)'
        ],

        assumptions: [
          'Runway Gen-3 API is available and stable for production use (verified)',
          'Platform APIs provide necessary metrics (views, engagement, CTR, conversions, shares)',
          'Statistical analysis with 20 variants provides sufficient confidence',
          'Venture teams have API credentials for all platforms',
          'React + Vite project structure is already established',
          'OpenAI Sora 2 will be considered when GA/stable (Q1 2026 target)'
        ],

        risks: [
          { risk: 'Runway API rate limiting', mitigation: 'Documented tier system (1-20+ concurrent), plan for higher tier if needed', severity: 'low' },
          { risk: 'Platform API changes breaking integration', mitigation: 'Version API clients, monitor changelog feeds', severity: 'high' },
          { risk: 'Insufficient statistical significance (< 70% confidence)', mitigation: 'Require minimum sample size before analysis', severity: 'medium' },
          { risk: 'Component size exceeding 600 LOC', mitigation: 'Pre-commit hooks + CI validation', severity: 'low' },
          { risk: 'Test coverage falling below 80%', mitigation: 'Branch protection rules require coverage threshold', severity: 'medium' },
          { risk: 'Future Sora 2 migration complexity', mitigation: 'IVideoGenerationService abstraction designed for easy provider swap', severity: 'low' }
        ],

        metadata: {
          ...(await getPRDMetadata()),
          architecture_decision: {
            original_api: 'OpenAI Sora 2',
            selected_api: 'Runway Gen-3',
            decision_date: new Date().toISOString(),
            rationale: 'Sora 2 not production-ready (severe stability issues, billing for failed jobs, undocumented rate limits). Runway offers 50% cost savings, documented limits, and production SLA.',
            cost_comparison: {
              runway: '$0.05/sec (gen4_turbo)',
              sora2: '$0.10/sec (when GA)',
              monthly_savings: '~$1,500 at 450 videos/month'
            },
            migration_path: 'IVideoGenerationService interface allows future Sora 2 integration when stable'
          }
        },

        updated_at: new Date().toISOString()
      })
      .eq('id', PRD_ID)
      .select()
      .single();

    if (error) throw error;

    console.log('✅ PRD updated successfully!');
    console.log('');
    console.log('Key Changes:');
    console.log('  • API: Sora 2 → Runway Gen-3');
    console.log('  • SDK: openai → @runwayml/sdk');
    console.log('  • Cost: $0.10/sec → $0.05/sec (50% savings)');
    console.log('  • Architecture: Added IVideoGenerationService abstraction');
    console.log('  • Migration Path: Ready for Sora 2 when GA/stable');
    console.log('');
    console.log('📝 Next: Update User Story US-001');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

async function getPRDMetadata() {
  const { data } = await supabase
    .from('product_requirements_v2')
    .select('metadata')
    .eq('id', PRD_ID)
    .single();

  return data?.metadata || {};
}

updatePRD();
