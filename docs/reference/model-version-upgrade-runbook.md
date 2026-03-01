---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Model Version Upgrade Runbook



## Table of Contents

- [Metadata](#metadata)
- [Quick Reference](#quick-reference)
- [1. Architecture Overview](#1-architecture-overview)
  - [Layer 1: Tier-Based Routing (Sub-Agent System)](#layer-1-tier-based-routing-sub-agent-system)
  - [Layer 2: Specific Model Registry (Database + Clients)](#layer-2-specific-model-registry-database-clients)
- [2. Upgrade Type A: Change Model Tier Assignment](#2-upgrade-type-a-change-model-tier-assignment)
  - [Step 1: Edit Config File](#step-1-edit-config-file)
  - [Step 2: Find and Update the Assignment](#step-2-find-and-update-the-assignment)
  - [Step 3: Update Simplified Routing (Optional but Recommended)](#step-3-update-simplified-routing-optional-but-recommended)
  - [Step 4: Validate Config Loads](#step-4-validate-config-loads)
  - [Step 5: Test Sub-Agent Execution](#step-5-test-sub-agent-execution)
  - [Step 6: Commit Change](#step-6-commit-change)
- [3. Upgrade Type B: Add New Model Version to Registry](#3-upgrade-type-b-add-new-model-version-to-registry)
  - [Step 1: Add to Database](#step-1-add-to-database)
  - [Step 2: Update Multimodal Client (if using vision features)](#step-2-update-multimodal-client-if-using-vision-features)
  - [Step 3: Update PRD LLM Service (if used for PRD generation)](#step-3-update-prd-llm-service-if-used-for-prd-generation)
  - [Step 4: Validate Database Entry](#step-4-validate-database-entry)
  - [Step 5: Commit Changes](#step-5-commit-changes)
- [4. Upgrade Type C: Full Model Generation Swap](#4-upgrade-type-c-full-model-generation-swap)
  - [Pre-Flight Checklist](#pre-flight-checklist)
  - [Step-by-Step Procedure](#step-by-step-procedure)
- [5. Rollback Procedures](#5-rollback-procedures)
  - [Rollback Tier Assignment](#rollback-tier-assignment)
  - [Rollback Model Registry](#rollback-model-registry)
  - [Rollback Multimodal Client](#rollback-multimodal-client)
- [6. Validation Checklist](#6-validation-checklist)
- [7. Model Naming Conventions](#7-model-naming-conventions)
  - [Tier Names (Layer 1)](#tier-names-layer-1)
  - [Model Keys (Layer 2)](#model-keys-layer-2)
- [8. Files Reference](#8-files-reference)
- [9. Common Scenarios](#9-common-scenarios)
  - [Scenario: Anthropic releases Claude 4.5 Sonnet (minor version)](#scenario-anthropic-releases-claude-45-sonnet-minor-version)
  - [Scenario: Want to try new model for specific sub-agent](#scenario-want-to-try-new-model-for-specific-sub-agent)
  - [Scenario: Model deprecated by provider](#scenario-model-deprecated-by-provider)
- [10. Centralized Model Configuration (SD-LLM-CONFIG-CENTRAL-001)](#10-centralized-model-configuration-sd-llm-config-central-001)
  - [Solution Overview](#solution-overview)
  - [Cascade Priority (as of 2026-02-23)](#cascade-priority-as-of-2026-02-23)
  - [Usage](#usage)
  - [Current Model Defaults](#current-model-defaults)
  - [Environment Variable Overrides](#environment-variable-overrides)
  - [Model Upgrade Process (Simplified)](#model-upgrade-process-simplified)
  - [Audit Command](#audit-command)
  - [Scripts Refactored](#scripts-refactored)
  - [Adding New Model Purposes](#adding-new-model-purposes)
- [11. Automation Scripts (Future Enhancement)](#11-automation-scripts-future-enhancement)
- [References](#references)

## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-02-23
- **Tags**: database, api, testing, e2e

**Status**: ACTIVE
**Created**: 2026-01-08
**Version**: 1.0.0
**Purpose**: Step-by-step guide for swapping LLM model versions when new releases come out

---

## Quick Reference

| Task | Files to Update | Command to Validate |
|------|-----------------|---------------------|
| Change model tier (haiku→sonnet) | `config/phase-model-config.json` | `node -e "console.log(require('./config/phase-model-config.json'))"` |
| Add new model version | Database `llm_models` table | `npm run db:query "SELECT * FROM llm_models"` |
| Update vision/multimodal pricing | `lib/ai/multimodal-client.js` | Manual review |
| Full model swap (e.g., Claude 4→5) | All of the above | See Section 4 |

---

## 1. Architecture Overview

The EHG LLM management system has **two layers**:

### Layer 1: Tier-Based Routing (Sub-Agent System)
- **Location**: `config/phase-model-config.json`, `config/phase-model-routing.json`
- **Consumer**: `lib/sub-agent-executor.js`
- **Model References**: Uses tier names (`haiku`, `sonnet`, `opus`) NOT specific versions
- **Purpose**: Determines which capability tier to use per (phase, sub-agent) combination

### Layer 2: Specific Model Registry (Database + Clients)
- **Location**: Database tables `llm_providers`, `llm_models`
- **Consumer**: `lib/ai/multimodal-client.js`, PRD generation
- **Model References**: Specific model IDs (`claude-sonnet-4`, `gpt-5-mini`)
- **Purpose**: Tracks pricing, capabilities, rate limits for specific model versions

```
┌─────────────────────────────────────────────────────────────┐
│                    LAYER 1: Tier Routing                    │
│  config/phase-model-config.json                             │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                     │
│  │ haiku   │  │ sonnet  │  │  opus   │  ← Tier Names       │
│  └────┬────┘  └────┬────┘  └────┬────┘                     │
└───────┼────────────┼────────────┼───────────────────────────┘
        │            │            │
        ▼            ▼            ▼
┌─────────────────────────────────────────────────────────────┐
│                 LAYER 2: Model Registry                     │
│  Database: llm_models table                                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │claude-haiku-3│ │claude-sonnet-4│ │claude-opus-4 │        │
│  │gpt-5-nano    │ │gpt-5-mini    │ │gpt-5         │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Upgrade Type A: Change Model Tier Assignment

**Use Case**: You want the TESTING sub-agent in EXEC phase to use Opus instead of Sonnet.

### Step 1: Edit Config File

```bash
# Open the config
code config/phase-model-config.json
```

### Step 2: Find and Update the Assignment

```json
// Before
"EXEC": {
  "TESTING": { "model": "sonnet", "reason": "E2E test execution" }
}

// After
"EXEC": {
  "TESTING": { "model": "opus", "reason": "E2E test execution - upgraded for better edge case detection" }
}
```

### Step 3: Update Simplified Routing (Optional but Recommended)

```bash
code config/phase-model-routing.json
```

```json
// Update to match
"EXEC": {
  "TESTING": "opus"
}
```

### Step 4: Validate Config Loads

```bash
node -e "
const config = require('./config/phase-model-config.json');
console.log('EXEC.TESTING:', config.phaseModelOverrides.EXEC.TESTING);
"
```

### Step 5: Test Sub-Agent Execution

```bash
# Dry run a sub-agent to verify routing
node -e "
import('./lib/sub-agent-executor.js').then(m => {
  const model = m.getModelForAgentAndPhase('TESTING', 'EXEC');
  console.log('Model selected:', model);
});
"
```

### Step 6: Commit Change

```bash
git add config/phase-model-config.json config/phase-model-routing.json
git commit -m "calibration: TESTING agent EXEC phase upgraded to opus (edge case detection)"
```

---

## 3. Upgrade Type B: Add New Model Version to Registry

**Use Case**: Anthropic releases Claude 5 Sonnet and you want to add it to the system.

### Step 1: Add to Database

```sql
-- Connect to Supabase and run:
INSERT INTO llm_models (
  provider_id,
  model_key,
  model_name,
  model_family,
  model_version,
  model_tier,
  context_window,
  max_output_tokens,
  supports_function_calling,
  supports_vision,
  supports_streaming,
  pricing,
  rate_limits,
  capabilities,
  status,
  release_date
) VALUES (
  (SELECT id FROM llm_providers WHERE provider_key = 'anthropic'),
  'claude-sonnet-5',           -- model_key (unique identifier)
  'Claude 5 Sonnet',           -- model_name (display name)
  'claude',                    -- model_family
  '5.0',                       -- model_version
  'sonnet',                    -- model_tier (haiku/sonnet/opus)
  200000,                      -- context_window
  8192,                        -- max_output_tokens
  true,                        -- supports_function_calling
  true,                        -- supports_vision
  true,                        -- supports_streaming
  '{"input_per_1m": 3.00, "output_per_1m": 15.00}'::jsonb,  -- pricing
  '{"requests_per_minute": 50, "tokens_per_minute": 100000}'::jsonb,  -- rate_limits
  '{"reasoning": "advanced", "code": "expert", "analysis": "expert"}'::jsonb,  -- capabilities
  'active',                    -- status
  '2026-01-15'                 -- release_date
);
```

### Step 2: Update Multimodal Client (if using vision features)

Edit `lib/ai/multimodal-client.js`:

```javascript
// Add to tokenPricing object (around line 27)
this.tokenPricing = {
  // ... existing models ...
  'claude-sonnet-5': { input: 3.00, output: 15.00 },  // Claude Sonnet 5 (NEW)
};

// Add to getAvailableModels() (around line 403)
anthropic: ['claude-sonnet-5', 'claude-sonnet-4', 'claude-sonnet-3.7', 'claude-opus-4', 'claude-haiku-3'],
```

### Step 3: Update PRD LLM Service (if used for PRD generation)

Check `scripts/modules/prd-llm-service.mjs` for model references:

```javascript
// If model is hardcoded, update it
const LLM_PRD_CONFIG = {
  model: 'claude-sonnet-5',  // Updated from claude-sonnet-4
  // ...
};
```

### Step 4: Validate Database Entry

```bash
npm run db:query "SELECT model_key, model_name, model_tier, status FROM llm_models WHERE model_key = 'claude-sonnet-5'"
```

### Step 5: Commit Changes

```bash
git add lib/ai/multimodal-client.js scripts/modules/prd-llm-service.mjs
git commit -m "feat(llm): add Claude 5 Sonnet to model registry"
```

---

## 4. Upgrade Type C: Full Model Generation Swap

**Use Case**: Claude 4 → Claude 5 across the entire system (new model generation release).

### Pre-Flight Checklist

- [ ] Read Anthropic/OpenAI release notes for breaking changes
- [ ] Check API endpoint changes (usually none, but verify)
- [ ] Verify pricing changes
- [ ] Check rate limit changes
- [ ] Test new model manually first

### Step-by-Step Procedure

#### Phase 1: Database Updates

```sql
-- 1. Add new models to registry
INSERT INTO llm_models (model_key, model_name, model_family, model_version, model_tier, ...)
VALUES
  ('claude-haiku-5', 'Claude 5 Haiku', 'claude', '5.0', 'haiku', ...),
  ('claude-sonnet-5', 'Claude 5 Sonnet', 'claude', '5.0', 'sonnet', ...),
  ('claude-opus-5', 'Claude 5 Opus', 'claude', '5.0', 'opus', ...);

-- 2. Mark old models as deprecated (don't delete!)
UPDATE llm_models
SET status = 'deprecated', deprecation_date = CURRENT_DATE
WHERE model_key IN ('claude-haiku-4', 'claude-sonnet-4', 'claude-opus-4');
```

#### Phase 2: Update Multimodal Client

```javascript
// lib/ai/multimodal-client.js

// Update pricing
this.tokenPricing = {
  // New Claude 5 models
  'claude-haiku-5': { input: 0.30, output: 1.50 },
  'claude-sonnet-5': { input: 3.00, output: 15.00 },
  'claude-opus-5': { input: 15.00, output: 75.00 },

  // Keep old models for backward compatibility
  'claude-haiku-3': { input: 0.25, output: 1.25 },
  'claude-sonnet-4': { input: 3.00, output: 15.00 },
  'claude-opus-4': { input: 15.00, output: 75.00 },
};

// Update available models list
anthropic: ['claude-haiku-5', 'claude-sonnet-5', 'claude-opus-5',
            'claude-haiku-3', 'claude-sonnet-4', 'claude-opus-4'],

// Update recommendations
getRecommendedModel(useCase = 'default') {
  const recommendations = {
    'complex-reasoning': 'claude-opus-5',  // Updated
    // ...
  };
}
```

#### Phase 3: Update Environment Variables (if applicable)

```bash
# .env or .env.claude
AI_MODEL=claude-sonnet-5  # Updated from claude-sonnet-4
```

#### Phase 4: Update Any Hardcoded References

Search for hardcoded model names:

```bash
# Find all references to old model names
grep -r "claude-sonnet-4\|claude-opus-4\|claude-haiku" --include="*.js" --include="*.ts" --include="*.mjs"
```

Common locations to check:
- `scripts/modules/prd-llm-service.mjs`
- `scripts/vision-model-selector.js`
- Any test files

#### Phase 5: Validate

```bash
# 1. Check database
npm run db:query "SELECT model_key, status FROM llm_models WHERE model_family = 'claude' ORDER BY model_version DESC"

# 2. Test multimodal client
node -e "
const Client = require('./lib/ai/multimodal-client.js');
const client = new Client({ provider: 'anthropic', model: 'claude-sonnet-5' });
console.log('Available:', client.getAvailableModels());
console.log('Cost estimate:', client.estimateCost(10));
"

# 3. Test sub-agent routing (should still work - uses tiers not specific models)
node -e "
import('./lib/sub-agent-executor.js').then(m => {
  console.log('SECURITY model:', m.getModelForAgentAndPhase('SECURITY', 'EXEC'));
});
"
```

#### Phase 6: Commit and Document

```bash
git add -A
git commit -m "feat(llm): upgrade to Claude 5 model generation

- Added claude-haiku-5, claude-sonnet-5, claude-opus-5 to registry
- Deprecated Claude 4 models (kept for backward compatibility)
- Updated pricing in multimodal-client.js
- Updated PRD generation service

Breaking changes: None (tier-based routing unchanged)
"
```

---

## 5. Rollback Procedures

### Rollback Tier Assignment

```bash
# Revert config file
git checkout HEAD~1 -- config/phase-model-config.json config/phase-model-routing.json
```

### Rollback Model Registry

```sql
-- Reactivate old model
UPDATE llm_models SET status = 'active', deprecation_date = NULL
WHERE model_key = 'claude-sonnet-4';

-- Deactivate new model
UPDATE llm_models SET status = 'inactive'
WHERE model_key = 'claude-sonnet-5';
```

### Rollback Multimodal Client

```bash
git checkout HEAD~1 -- lib/ai/multimodal-client.js
```

---

## 6. Validation Checklist

After any model upgrade, verify:

- [ ] **Config loads without errors**: `node -e "require('./config/phase-model-config.json')"`
- [ ] **Sub-agent routing works**: Test with `getModelForAgentAndPhase()`
- [ ] **Database entries correct**: Query `llm_models` table
- [ ] **Pricing data accurate**: Check `tokenPricing` in multimodal-client.js
- [ ] **No hardcoded old references**: Run grep search
- [ ] **Test sub-agent execution**: Run one sub-agent manually
- [ ] **Monitor first SD**: Watch for routing errors in logs

---

## 7. Model Naming Conventions

### Tier Names (Layer 1)
Always use lowercase: `haiku`, `sonnet`, `opus`

### Model Keys (Layer 2)
Format: `{provider}-{tier}-{version}`

Examples:
- `claude-haiku-3` (Claude Haiku 3.x)
- `claude-sonnet-4` (Claude Sonnet 4.x)
- `claude-opus-5` (Claude Opus 5.x)
- `gpt-5-mini` (GPT-5 Mini)
- `gpt-5-nano` (GPT-5 Nano)

---

## 8. Files Reference

| File | Purpose | When to Update |
|------|---------|----------------|
| `config/phase-model-config.json` | Tier assignments per (phase, agent) | Change tier for sub-agent |
| `config/phase-model-routing.json` | Simplified routing table | Mirror phase-model-config changes |
| `lib/sub-agent-executor.js` | Loads config, routes requests | Rarely (logic changes only) |
| `lib/ai/multimodal-client.js` | Vision API calls, pricing | New model versions, pricing changes |
| `scripts/modules/prd-llm-service.mjs` | PRD generation | Change default model for PRDs |
| `scripts/vision-model-selector.js` | Vision model selection | Add new vision-capable models |
| Database: `llm_providers` | Provider registry | New providers (rare) |
| Database: `llm_models` | Model registry | New model versions |
| Database: `model_usage_log` | Usage tracking | Never (auto-populated) |

---

## 9. Common Scenarios

### Scenario: Anthropic releases Claude 4.5 Sonnet (minor version)

1. Add to database with `model_key: 'claude-sonnet-4-5'`
2. Update pricing in multimodal-client.js if changed
3. **No config changes needed** (tier routing still uses "sonnet")

### Scenario: Want to try new model for specific sub-agent

1. Add model to database
2. Test manually first
3. Update `phase-model-config.json` for that specific (phase, agent)
4. Monitor for 1 week
5. Rollback or confirm based on results

### Scenario: Model deprecated by provider

1. Update database: `status = 'deprecated'`, set `deprecation_date`
2. Update any hardcoded references to new model
3. Keep in registry for historical tracking
4. **Don't delete** - usage logs reference it

---

## 10. Centralized Model Configuration (SD-LLM-CONFIG-CENTRAL-001)

**Status**: IMPLEMENTED (2026-01-08) | **Provider default updated to Google Gemini 3.x (2026-02-23)**

### Solution Overview

Centralized model configuration via `lib/config/model-config.js` eliminates hardcoded model names across the codebase. As of 2026-02-23, **Google Gemini is the primary provider** — OpenAI is the fallback.

### Cascade Priority (as of 2026-02-23)

```
Anthropic (effort-based/thinking) → Google Gemini → OpenAI → Ollama (local)
```

Use `getLLMClient({ purpose })` from `lib/llm/client-factory.js` to get a provider-agnostic client.

### Usage

```javascript
// Recommended: use factory (automatically routes to Gemini primary)
import { getLLMClient, getEmbeddingClient } from '../../lib/llm/client-factory.js';

const llm = getLLMClient({ purpose: 'validation' });   // → gemini-3.1-pro-preview
const llm = getLLMClient({ purpose: 'fast' });         // → gemini-3-flash-preview
const llm = getLLMClient({ purpose: 'generation' });   // → gemini-3.1-pro-preview
const llm = getLLMClient({ purpose: 'classification'});// → gemini-3-flash-preview
const llm = getLLMClient({ purpose: 'vision' });       // → gemini-3.1-pro-preview
const embedder = getEmbeddingClient();                 // → gemini-embedding-001 (1536d)

// OpenAI-compatible interface on all returned clients
const result = await llm.chat.completions.create({ messages, ... });

// Legacy helpers (still work, used internally)
import { getGoogleModel, getClaudeModel } from '../../lib/config/model-config.js';
const model = getGoogleModel('validation');  // Returns 'gemini-3.1-pro-preview' or env override
const model = getClaudeModel('validation'); // Returns 'claude-sonnet-4-20250514' or env override
```

### Current Model Defaults

| Purpose | Google (primary) | OpenAI (fallback) |
|---------|-----------------|-------------------|
| validation | `gemini-3.1-pro-preview` | `gpt-5.2` |
| generation | `gemini-3.1-pro-preview` | `gpt-5.2` |
| classification | `gemini-3-flash-preview` | `gpt-5-mini` |
| fast | `gemini-3-flash-preview` | `gpt-5-mini` |
| vision | `gemini-3.1-pro-preview` | `gpt-4o` |
| embedding | `gemini-embedding-001` (1536d) | `text-embedding-3-small` (1536d) |

### Environment Variable Overrides

```bash
# Primary: Google Gemini (required for all AI features)
GEMINI_API_KEY=your-gemini-api-key

# Override Google models by purpose
GEMINI_MODEL_VALIDATION=gemini-3.1-pro-preview
GEMINI_MODEL_CLASSIFICATION=gemini-3-flash-preview
GEMINI_MODEL_GENERATION=gemini-3.1-pro-preview
GEMINI_MODEL_FAST=gemini-3-flash-preview
GEMINI_MODEL_VISION=gemini-3.1-pro-preview

# Fallback: OpenAI (optional — voice/WebRTC only if Gemini is primary)
OPENAI_API_KEY=your-openai-key
OPENAI_MODEL_VALIDATION=gpt-5.3
OPENAI_MODEL_CLASSIFICATION=gpt-5-mini

# Claude (effort-based reasoning, Anthropic adapter)
CLAUDE_MODEL=claude-sonnet-4-20250514
```

### Model Upgrade Process (Simplified)

With centralized config, upgrading models is now:

1. **Edit ONE file**: `lib/config/model-config.js`
2. **Update defaults in `google.{}` section** (Google is primary)
3. **Test**: `npm run llm:config`
4. **Commit**: Single file change

```javascript
// lib/config/model-config.js - Update Google defaults
const MODEL_DEFAULTS = {
  google: {
    validation: 'gemini-3.2-pro-preview',    // Example: upgrade to 3.2
    classification: 'gemini-3.1-flash',
    generation: 'gemini-3.2-pro-preview',
    fast: 'gemini-3.1-flash',
    vision: 'gemini-3.2-pro-preview',
  },
  // openai: kept as fallback
};
```

### Audit Command

Detect any hardcoded model references that bypass centralized config:

```bash
# Run audit
npm run llm:audit

# Strict mode (fails CI if violations found)
npm run llm:audit:strict

# View current effective configuration
npm run llm:config
```

### Scripts Refactored

The following scripts now use centralized config:

| File | Purpose | Model Purpose |
|------|---------|---------------|
| `scripts/modules/sd-type-classifier.js` | SD type classification | `classification` |
| `scripts/modules/ai-quality-evaluator.js` | Quality evaluation | `validation` |
| `scripts/modules/shipping/ShippingDecisionEvaluator.js` | Shipping decisions | `validation` |
| `lib/sub-agents/api-relevance-classifier.js` | API relevance check | `fast` |
| `scripts/uat-to-strategic-directive-ai.js` | UAT to SD conversion | `generation` |
| `scripts/add-prd-to-database.js` | PRD generation | `generation` |

### Adding New Model Purposes

If you need a new purpose (e.g., `embedding`):

1. Add to `MODEL_DEFAULTS` in `lib/config/model-config.js`
2. Add to `ENV_VARS` for environment override support
3. Add to `VALID_PURPOSES` array
4. Document in this runbook

---

## 11. Automation Scripts (Future Enhancement)

```bash
# Proposed CLI commands (not yet implemented)

# Add new model interactively
npm run llm:add-model

# List all models with status
npm run llm:list

# Deprecate a model
npm run llm:deprecate claude-sonnet-4

# Validate all model references
npm run llm:validate
```

---

## References

- [Model Allocation Strategy](./model-allocation-strategy.md) - Tier philosophy and calibration
- [Haiku-First Strategy](../research/haiku-first-strategy.md) - Cost optimization research
- [Sub-Agent Executor](../../lib/sub-agent-executor.js) - Routing implementation
- [Multimodal Client](../../lib/ai/multimodal-client.js) - Vision API integration

---

**Maintained by**: LEO Protocol Team
**Last Updated**: 2026-02-23
**Change log**: v1.1.0 — Updated Section 10 for Google Gemini 3.x as primary provider (PR #1577)
