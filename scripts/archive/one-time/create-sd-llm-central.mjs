#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createLLMCentralizationSD() {
    console.log('\n🚀 Creating SD-LLM-CENTRAL-001: Centralized LLM Provider Management\n');

    // Get next sequence rank
    const { data: maxRank } = await supabase
        .from('strategic_directives_v2')
        .select('sequence_rank')
        .order('sequence_rank', { ascending: false })
        .limit(1);

    const nextRank = (maxRank?.[0]?.sequence_rank || 0) + 1;

    // 1. Create the SD
    const sdPayload = {
        id: 'SD-LLM-CENTRAL-001',
        sd_key: 'SD-LLM-CENTRAL-001',
        title: 'Centralized LLM Provider Management System',
        description: `Create a centralized system for managing Large Language Model (LLM) providers and configurations across the entire EHG application. This will enable easy swapping of LLM providers (OpenAI, Anthropic, etc.) from a single location in user settings without requiring code changes.

**Current State Analysis:**
- 158+ files reference LLM providers (OpenAI, Claude, GPT models)
- Hard-coded model names scattered across:
  - Frontend services (ai-service-manager.ts, evaConversation.ts, etc.)
  - Supabase Edge Functions (40+ functions with hard-coded gpt-4.1-2025-04-14, gpt-4o-realtime-preview, etc.)
  - API routes and components
- Multiple API keys stored in different locations (env vars, localStorage, Edge Function secrets)
- No centralized configuration for model selection or fallback strategies

**Proposed Solution:**
1. Create centralized LLM configuration service with:
   - Provider registry (OpenAI, Anthropic, Google, local models)
   - Model catalog per provider with capabilities
   - User-level provider preferences
   - System-wide default fallback chain
   - API key management per provider

2. User Settings Interface:
   - LLM Provider Management page under user profile
   - Select primary/fallback providers
   - Configure API keys securely
   - Set model preferences per use case (chat, code generation, analysis)
   - Test provider connectivity

3. Migration Strategy:
   - Create abstraction layer over existing ai-service-manager.ts
   - Update Edge Functions to use centralized config
   - Migrate hard-coded model references to config lookups
   - Implement graceful fallback when provider unavailable

**Benefits:**
- Single location to swap LLM providers as new models release
- Better cost management (route to cheaper models when appropriate)
- Improved reliability (automatic fallback to secondary provider)
- User choice and flexibility
- Easier testing and development (use local models)`,

        rationale: 'As LLM technology evolves rapidly, the ability to quickly adopt new models or switch providers is critical. Hard-coded provider references create technical debt and prevent agile response to new capabilities. Centralized management enables rapid adaptation, cost optimization, and improved user experience.',

        scope: `**In Scope:**
- Database schema for LLM provider configs and user preferences
- Centralized LLM configuration service
- User settings UI for provider management
- Migration of existing hard-coded references to config-driven approach
- API key secure storage and rotation
- Provider health monitoring and fallback logic
- Documentation and migration guide

**Out of Scope:**
- Training or fine-tuning custom models
- Multi-model orchestration (already exists in some Edge Functions)
- Billing/usage tracking (separate SD recommended)`,

        status: 'draft',
        priority: 'high',
        category: 'Infrastructure',
        sequence_rank: nextRank,
        target_application: 'EHG',

        metadata: {
            technical_complexity: 'medium',
            business_impact: 'high',
            estimated_effort_hours: 24,

            kpi_names: [
                'provider_switching_latency_seconds',
                'fallback_success_rate_percent',
                'model_reference_centralization_percent',
                'api_key_security_score'
            ],

            acceptance_checklist: [
                'Database schema created: llm_providers, llm_models, user_llm_preferences',
                'Centralized LLM config service implemented and tested',
                'User settings page: LLM Provider Management UI complete',
                'Provider connectivity testing working',
                'At least 80% of hard-coded model references migrated',
                'All Edge Functions using centralized config',
                'Fallback logic tested and verified',
                'API keys securely stored (not in code/localStorage)',
                'Documentation: Migration guide and user guide complete',
                'E2E tests: Provider switching without app restart'
            ],

            risks: [
                'Edge Function environment variable limitations',
                'Backward compatibility with existing integrations',
                'API key security during migration',
                'Performance impact of config lookups',
                'Provider-specific feature differences'
            ],

            artifacts: [
                'Database DDL: llm_providers, llm_models, user_llm_preferences',
                'LLM Configuration Service (TypeScript)',
                'User Settings: Provider Management UI',
                'Migration script for existing references',
                'Provider adapter interfaces',
                'API key rotation utilities',
                'Migration guide documentation',
                'User documentation'
            ],

            dependencies: [],

            affected_files_estimate: 158,

            key_technical_decisions: [
                'Use database for provider configs vs. environment variables',
                'API key storage: Supabase Vault vs. encrypted database fields',
                'Fallback strategy: Sequential vs. parallel provider attempts',
                'Cache strategy for config lookups to minimize DB calls'
            ]
        }
    };

    // Check if SD exists
    const { data: existingSD } = await supabase
        .from('strategic_directives_v2')
        .select('id')
        .eq('id', 'SD-LLM-CENTRAL-001')
        .single();

    let sdResult;
    if (existingSD) {
        const { data, error } = await supabase
            .from('strategic_directives_v2')
            .update(sdPayload)
            .eq('id', 'SD-LLM-CENTRAL-001')
            .select();
        sdResult = { data, error, action: 'updated' };
    } else {
        const { data, error } = await supabase
            .from('strategic_directives_v2')
            .insert(sdPayload)
            .select();
        sdResult = { data, error, action: 'inserted' };
    }

    if (sdResult.error) {
        console.log('❌ SD operation failed:', sdResult.error.message);
        console.log('Error details:', JSON.stringify(sdResult.error, null, 2));
        return;
    }

    console.log(`✅ SD ${sdResult.action}: SD-LLM-CENTRAL-001`);
    console.log('\n📋 Strategic Directive Details:');
    console.log('ID:', sdResult.data[0].id);
    console.log('Title:', sdResult.data[0].title);
    console.log('Priority:', sdResult.data[0].priority);
    console.log('Status:', sdResult.data[0].status);
    console.log('Sequence Rank:', sdResult.data[0].sequence_rank);

    console.log('\n✨ Next Steps:');
    console.log('1. Review SD in dashboard: http://localhost:3000');
    console.log('2. LEAD agent to review and approve SD');
    console.log('3. Create PRD with detailed technical specifications');
    console.log('4. PLAN agent to create implementation roadmap');
}

createLLMCentralizationSD().catch(console.error);
