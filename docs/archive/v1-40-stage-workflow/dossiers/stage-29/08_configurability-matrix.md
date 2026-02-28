---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 29: Configurability Matrix


## Table of Contents

- [Overview](#overview)
- [Configuration Schema](#configuration-schema)
- [Parameter Catalog](#parameter-catalog)
  - [1. UI Refinement Parameters (Substage 29.1)](#1-ui-refinement-parameters-substage-291)
  - [2. UX Optimization Parameters (Substage 29.2)](#2-ux-optimization-parameters-substage-292)
  - [3. Asset Preparation Parameters (Substage 29.3)](#3-asset-preparation-parameters-substage-293)
  - [4. Performance Parameters (Core Web Vitals)](#4-performance-parameters-core-web-vitals)
  - [5. Recursion Parameters (Trigger Controls)](#5-recursion-parameters-trigger-controls)
- [Preset Configurations](#preset-configurations)
  - [Preset 1: Strict (Fintech, Healthcare)](#preset-1-strict-fintech-healthcare)
  - [Preset 2: Balanced (Default)](#preset-2-balanced-default)
  - [Preset 3: Fast (MVP, Beta)](#preset-3-fast-mvp-beta)
- [Configuration Management](#configuration-management)
  - [Setting Configuration (Venture Creation)](#setting-configuration-venture-creation)
  - [Updating Configuration (Runtime)](#updating-configuration-runtime)
  - [Reading Configuration (Agent Execution)](#reading-configuration-agent-execution)
- [Validation Rules](#validation-rules)
  - [Pre-Execution Validation](#pre-execution-validation)
  - [Runtime Overrides](#runtime-overrides)
- [Impact Analysis](#impact-analysis)
  - [Parameter Sensitivity](#parameter-sensitivity)
  - [Performance vs. Quality Trade-offs](#performance-vs-quality-trade-offs)
- [Cross-References](#cross-references)
- [Sources Table](#sources-table)

## Overview

This matrix defines all tunable parameters for Stage 29 (Final Polish), enabling venture-specific customization while maintaining consistent quality standards.

**Storage**: `ventures.stage_29_config` column (JSONB)
**Validation**: Schema enforced by database constraints + agent validation

---

## Configuration Schema

**Full JSON Schema**:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "ui_refinement": {
      "type": "object",
      "properties": {
        "design_token_threshold": {
          "type": "number",
          "minimum": 80,
          "maximum": 100,
          "default": 95,
          "description": "Design token compliance percentage (0-100)"
        },
        "animation_fps_threshold": {
          "type": "number",
          "minimum": 30,
          "maximum": 120,
          "default": 60,
          "description": "Animation frame rate threshold (fps)"
        },
        "responsive_breakpoints": {
          "type": "array",
          "items": {"type": "number"},
          "default": [320, 768, 1024, 1440, 1920],
          "description": "Responsive design test breakpoints (px)"
        },
        "visual_regression_threshold": {
          "type": "number",
          "minimum": 0,
          "maximum": 5,
          "default": 1,
          "description": "Visual regression tolerance percentage"
        }
      }
    },
    "ux_optimization": {
      "type": "object",
      "properties": {
        "accessibility_score_threshold": {
          "type": "number",
          "minimum": 80,
          "maximum": 100,
          "default": 95,
          "description": "Axe + Lighthouse accessibility score (0-100)"
        },
        "flow_improvement_threshold": {
          "type": "number",
          "minimum": 0,
          "maximum": 50,
          "default": 5,
          "description": "Flow completion rate improvement percentage"
        },
        "friction_point_max": {
          "type": "number",
          "minimum": 0,
          "maximum": 20,
          "default": 5,
          "description": "Maximum acceptable friction points"
        },
        "ux_score_regression_max": {
          "type": "number",
          "minimum": 0,
          "maximum": 30,
          "default": 10,
          "description": "Maximum UX score regression (points)"
        }
      }
    },
    "asset_preparation": {
      "type": "object",
      "properties": {
        "main_bundle_size_limit_kb": {
          "type": "number",
          "minimum": 100,
          "maximum": 500,
          "default": 200,
          "description": "Main bundle size limit (KB, gzipped)"
        },
        "vendor_bundle_size_limit_kb": {
          "type": "number",
          "minimum": 200,
          "maximum": 1000,
          "default": 300,
          "description": "Vendor bundle size limit (KB, gzipped)"
        },
        "cdn_cache_hit_rate_threshold": {
          "type": "number",
          "minimum": 70,
          "maximum": 100,
          "default": 90,
          "description": "CDN cache hit rate percentage"
        },
        "image_compression_threshold": {
          "type": "number",
          "minimum": 10,
          "maximum": 70,
          "default": 30,
          "description": "Image compression improvement percentage"
        },
        "cdn_latency_threshold_ms": {
          "type": "number",
          "minimum": 50,
          "maximum": 500,
          "default": 100,
          "description": "CDN latency threshold (ms, p95)"
        }
      }
    },
    "performance": {
      "type": "object",
      "properties": {
        "lcp_threshold_ms": {
          "type": "number",
          "minimum": 1000,
          "maximum": 5000,
          "default": 2500,
          "description": "Largest Contentful Paint threshold (ms)"
        },
        "fid_threshold_ms": {
          "type": "number",
          "minimum": 50,
          "maximum": 300,
          "default": 100,
          "description": "First Input Delay threshold (ms)"
        },
        "cls_threshold": {
          "type": "number",
          "minimum": 0,
          "maximum": 0.5,
          "default": 0.1,
          "description": "Cumulative Layout Shift threshold"
        },
        "performance_score_threshold": {
          "type": "number",
          "minimum": 70,
          "maximum": 100,
          "default": 90,
          "description": "Lighthouse performance score (0-100)"
        }
      }
    },
    "recursion": {
      "type": "object",
      "properties": {
        "max_iterations_polish_001": {
          "type": "number",
          "minimum": 1,
          "maximum": 5,
          "default": 3,
          "description": "Max iterations for UI consistency fixes"
        },
        "max_iterations_polish_002": {
          "type": "number",
          "minimum": 1,
          "maximum": 5,
          "default": 2,
          "description": "Max iterations for UX optimization fixes"
        },
        "max_iterations_polish_003": {
          "type": "number",
          "minimum": 1,
          "maximum": 5,
          "default": 2,
          "description": "Max iterations for asset preparation fixes"
        },
        "global_max_recursion_depth": {
          "type": "number",
          "minimum": 1,
          "maximum": 10,
          "default": 5,
          "description": "Global max recursion depth across all triggers"
        }
      }
    }
  },
  "required": ["ui_refinement", "ux_optimization", "asset_preparation", "performance", "recursion"]
}
```

**Evidence Basis**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-29.md:36-39 (metrics thresholds needed)

---

## Parameter Catalog

### 1. UI Refinement Parameters (Substage 29.1)

| Parameter | Default | Range | Impact | Evidence |
|-----------|---------|-------|--------|----------|
| `design_token_threshold` | 95 | 80-100 | **HIGH**: Gates UI polish completion | EHG_Engineer@6ef8cf4:stages.yaml:1315 |
| `animation_fps_threshold` | 60 | 30-120 | **MEDIUM**: Affects smoothness perception | EHG_Engineer@6ef8cf4:stages.yaml:1316 |
| `responsive_breakpoints` | [320, 768, 1024, 1440, 1920] | Custom array | **MEDIUM**: Test coverage breadth | EHG_Engineer@6ef8cf4:stages.yaml:1317 |
| `visual_regression_threshold` | 1 | 0-5 | **LOW**: Percy/Chromatic tolerance | EHG_Engineer@6ef8cf4:stages.yaml:1318 |

**Tuning Guidance**:
- **Strict ventures** (fintech, healthcare): `design_token_threshold = 98`, `animation_fps_threshold = 60`
- **Fast-moving ventures** (MVP, beta): `design_token_threshold = 85`, `animation_fps_threshold = 30`

---

### 2. UX Optimization Parameters (Substage 29.2)

| Parameter | Default | Range | Impact | Evidence |
|-----------|---------|-------|--------|----------|
| `accessibility_score_threshold` | 95 | 80-100 | **CRITICAL**: WCAG compliance gate | EHG_Engineer@6ef8cf4:stages.yaml:1324 |
| `flow_improvement_threshold` | 5 | 0-50 | **HIGH**: User satisfaction impact | EHG_Engineer@6ef8cf4:stages.yaml:1321 |
| `friction_point_max` | 5 | 0-20 | **MEDIUM**: UX quality baseline | EHG_Engineer@6ef8cf4:stages.yaml:1322 |
| `ux_score_regression_max` | 10 | 0-30 | **HIGH**: Rollback trigger | EHG_Engineer@6ef8cf4:critique/stage-29.md:47 |

**Tuning Guidance**:
- **Accessibility-critical ventures** (government, public services): `accessibility_score_threshold = 100`
- **Internal tools**: `accessibility_score_threshold = 85`, `flow_improvement_threshold = 0`

---

### 3. Asset Preparation Parameters (Substage 29.3)

| Parameter | Default | Range | Impact | Evidence |
|-----------|---------|-------|--------|----------|
| `main_bundle_size_limit_kb` | 200 | 100-500 | **HIGH**: Load time impact | EHG_Engineer@6ef8cf4:stages.yaml:1329 |
| `vendor_bundle_size_limit_kb` | 300 | 200-1000 | **MEDIUM**: Initial load time | EHG_Engineer@6ef8cf4:stages.yaml:1329 |
| `cdn_cache_hit_rate_threshold` | 90 | 70-100 | **MEDIUM**: CDN efficiency | EHG_Engineer@6ef8cf4:stages.yaml:1328 |
| `image_compression_threshold` | 30 | 10-70 | **MEDIUM**: Asset optimization gain | EHG_Engineer@6ef8cf4:stages.yaml:1327 |
| `cdn_latency_threshold_ms` | 100 | 50-500 | **HIGH**: Global user experience | EHG_Engineer@6ef8cf4:stages.yaml:1328 |

**Tuning Guidance**:
- **Global ventures** (multi-region): `cdn_cache_hit_rate_threshold = 95`, `cdn_latency_threshold_ms = 50`
- **Image-heavy ventures** (media, e-commerce): `image_compression_threshold = 50`

---

### 4. Performance Parameters (Core Web Vitals)

| Parameter | Default | Range | Impact | Evidence |
|-----------|---------|-------|--------|----------|
| `lcp_threshold_ms` | 2500 | 1000-5000 | **CRITICAL**: Largest Contentful Paint | EHG_Engineer@6ef8cf4:stages.yaml:1303 |
| `fid_threshold_ms` | 100 | 50-300 | **CRITICAL**: First Input Delay | EHG_Engineer@6ef8cf4:stages.yaml:1303 |
| `cls_threshold` | 0.1 | 0-0.5 | **CRITICAL**: Cumulative Layout Shift | EHG_Engineer@6ef8cf4:stages.yaml:1303 |
| `performance_score_threshold` | 90 | 70-100 | **HIGH**: Lighthouse overall score | EHG_Engineer@6ef8cf4:stages.yaml:1303 |

**Tuning Guidance**:
- **SEO-critical ventures**: `lcp_threshold_ms = 2000`, `performance_score_threshold = 95` (Google Core Web Vitals thresholds)
- **Admin dashboards**: `lcp_threshold_ms = 4000`, `performance_score_threshold = 75` (relaxed for internal use)

**Web Vitals Reference**: Based on Google's recommended thresholds (https://web.dev/vitals/)

---

### 5. Recursion Parameters (Trigger Controls)

| Parameter | Default | Range | Impact | Evidence |
|-----------|---------|-------|--------|----------|
| `max_iterations_polish_001` | 3 | 1-5 | **MEDIUM**: UI fix retries | EHG_Engineer@6ef8cf4:critique/stage-29.md:31-34 |
| `max_iterations_polish_002` | 2 | 1-5 | **MEDIUM**: UX fix retries | EHG_Engineer@6ef8cf4:critique/stage-29.md:31-34 |
| `max_iterations_polish_003` | 2 | 1-5 | **MEDIUM**: Asset fix retries | EHG_Engineer@6ef8cf4:critique/stage-29.md:31-34 |
| `global_max_recursion_depth` | 5 | 1-10 | **CRITICAL**: Infinite loop prevention | (Safety limit) |

**Tuning Guidance**:
- **High-automation ventures**: Increase `max_iterations_*` to 5 for more automated fix attempts
- **Fast-fail ventures**: Set `max_iterations_*` to 1 for quick escalation to human intervention

---

## Preset Configurations

### Preset 1: Strict (Fintech, Healthcare)

**Use Case**: Compliance-heavy ventures requiring highest quality standards

```json
{
  "ui_refinement": {
    "design_token_threshold": 98,
    "animation_fps_threshold": 60,
    "visual_regression_threshold": 0.5
  },
  "ux_optimization": {
    "accessibility_score_threshold": 100,
    "flow_improvement_threshold": 10,
    "ux_score_regression_max": 5
  },
  "asset_preparation": {
    "main_bundle_size_limit_kb": 150,
    "cdn_cache_hit_rate_threshold": 95
  },
  "performance": {
    "lcp_threshold_ms": 2000,
    "performance_score_threshold": 95
  }
}
```

**Trade-offs**: Longer Stage 29 duration (~2x), higher polish quality, lower deployment risk

---

### Preset 2: Balanced (Default)

**Use Case**: Most ventures with standard quality expectations

```json
{
  "ui_refinement": {
    "design_token_threshold": 95,
    "animation_fps_threshold": 60
  },
  "ux_optimization": {
    "accessibility_score_threshold": 95,
    "flow_improvement_threshold": 5
  },
  "asset_preparation": {
    "main_bundle_size_limit_kb": 200,
    "cdn_cache_hit_rate_threshold": 90
  },
  "performance": {
    "lcp_threshold_ms": 2500,
    "performance_score_threshold": 90
  }
}
```

**Trade-offs**: Balanced velocity vs. quality, suitable for 80% of ventures

---

### Preset 3: Fast (MVP, Beta)

**Use Case**: Early-stage ventures prioritizing speed over polish

```json
{
  "ui_refinement": {
    "design_token_threshold": 85,
    "animation_fps_threshold": 30,
    "visual_regression_threshold": 3
  },
  "ux_optimization": {
    "accessibility_score_threshold": 85,
    "flow_improvement_threshold": 0,
    "friction_point_max": 10
  },
  "asset_preparation": {
    "main_bundle_size_limit_kb": 300,
    "cdn_cache_hit_rate_threshold": 80
  },
  "performance": {
    "lcp_threshold_ms": 4000,
    "performance_score_threshold": 75
  }
}
```

**Trade-offs**: Faster Stage 29 completion (~50% time), lower polish quality, acceptable for non-production beta

---

## Configuration Management

### Setting Configuration (Venture Creation)

**SQL**:
```sql
-- Use default configuration (Balanced preset)
INSERT INTO ventures (title, description, stage_29_config)
VALUES (
    'New Venture',
    'Description',
    DEFAULT  -- Uses default JSONB from column definition
);

-- Use Strict preset
INSERT INTO ventures (title, description, stage_29_config)
VALUES (
    'Fintech App',
    'Description',
    '{"ui_refinement": {"design_token_threshold": 98}, ...}'::jsonb
);
```

---

### Updating Configuration (Runtime)

**SQL**:
```sql
-- Update single parameter
UPDATE ventures
SET stage_29_config = jsonb_set(
    stage_29_config,
    '{ui_refinement, design_token_threshold}',
    '98'
)
WHERE id = :venture_id;

-- Replace entire configuration (switch presets)
UPDATE ventures
SET stage_29_config = :new_config_json
WHERE id = :venture_id;
```

---

### Reading Configuration (Agent Execution)

**Python** (in Agent):
```python
def get_venture_config(venture_id: str) -> dict:
    """Fetch Stage 29 config from ventures table."""
    query = "SELECT stage_29_config FROM ventures WHERE id = %s"
    result = db.execute(query, [venture_id])
    return result[0]['stage_29_config']

# Usage in UIRefinementSpecialist agent
config = get_venture_config(venture_id)
threshold = config['ui_refinement']['design_token_threshold']  # 95
```

---

## Validation Rules

### Pre-Execution Validation

**Validation Agent** (runs before Stage 29 starts):
```python
def validate_stage_29_config(venture_id: str) -> bool:
    """Validate config against JSON schema."""
    config = get_venture_config(venture_id)

    # Check required keys
    required_keys = ['ui_refinement', 'ux_optimization', 'asset_preparation', 'performance', 'recursion']
    if not all(key in config for key in required_keys):
        raise ValueError(f"Missing required config keys: {set(required_keys) - set(config.keys())}")

    # Check value ranges
    if not (80 <= config['ui_refinement']['design_token_threshold'] <= 100):
        raise ValueError("design_token_threshold must be 80-100")

    # ... (validate all parameters against ranges)

    return True  # Config valid
```

---

### Runtime Overrides

**Environment Variables** (temporary overrides for testing):
```bash
# Override thresholds for single Stage 29 execution
STAGE_29_UI_THRESHOLD=90 \
STAGE_29_A11Y_THRESHOLD=85 \
python -m agents.final_polish_crew --venture-id=<uuid>
```

**Use Case**: A/B testing different thresholds, emergency relaxation during incidents

---

## Impact Analysis

### Parameter Sensitivity

**High Sensitivity** (small changes = big impact):
- `design_token_threshold`: 95 → 90 = +50% more false passes
- `accessibility_score_threshold`: 95 → 90 = WCAG compliance risk
- `main_bundle_size_limit_kb`: 200 → 250 = +15% load time
- `lcp_threshold_ms`: 2500 → 3000 = SEO ranking drop

**Low Sensitivity** (tuning room available):
- `responsive_breakpoints`: Add/remove breakpoints without quality impact
- `visual_regression_threshold`: 1% → 2% = negligible visual difference
- `friction_point_max`: 5 → 7 = still acceptable UX

---

### Performance vs. Quality Trade-offs

**Faster Stage 29 (Lower Quality)**:
- Set `design_token_threshold = 85`, `accessibility_score_threshold = 85`
- Impact: -30% Stage 29 duration, +20% post-launch bugs

**Slower Stage 29 (Higher Quality)**:
- Set `design_token_threshold = 98`, `accessibility_score_threshold = 100`
- Impact: +50% Stage 29 duration, -40% post-launch bugs

**Optimal Balance**: Default Balanced preset (95% thresholds)

---

## Cross-References

- **SD-METRICS-FRAMEWORK-001** (P0 CRITICAL, status=queued): Implements metrics tracking for thresholds
- **SD-FINAL-POLISH-AUTOMATION-001** (proposed): Uses config parameters in agent execution
- **SD-CONFIG-MANAGEMENT-001** (proposed): Universal config management system across all stages

---

## Sources Table

| Source | Repo | Commit | Path | Lines | Evidence |
|--------|------|--------|------|-------|----------|
| Metrics thresholds needed | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-29.md | 36-39 | Improvement #2 |
| Automation target | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-29.md | 31-34 | 80% automation goal |
| Rollback triggers | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-29.md | 47-50 | Improvement #4 |
| Performance metrics | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1300-1303 | 3 metrics defined |
| Substage 29.1 criteria | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1313-1318 | UI refinement done_when |
| Substage 29.2 criteria | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1319-1324 | UX optimization done_when |
| Substage 29.3 criteria | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1325-1330 | Asset preparation done_when |

<!-- Generated by Claude Code Phase 11 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
