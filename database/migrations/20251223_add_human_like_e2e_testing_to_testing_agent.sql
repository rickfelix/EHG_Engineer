-- Migration: Add Human-Like E2E Testing Enhancements to TESTING Sub-Agent
-- Purpose: Update QA Engineering Director (TESTING) with new testing fixtures and capabilities
-- Created: 2025-12-23

-- Update TESTING sub-agent with Human-Like E2E Testing content
UPDATE leo_sub_agents
SET
  description = description || E'

### Human-Like E2E Testing Enhancements (v2.5.0)

The testing sub-agent has access to enhanced fixtures for human-like testing:

**Available Fixtures** (`tests/e2e/fixtures/`):

| Fixture | Purpose | Import |
|---------|---------|--------|
| `accessibility.ts` | axe-core WCAG 2.1 AA testing | `import { test, a11y } from ''./fixtures/accessibility''` |
| `keyboard-oracle.ts` | Tab order, focus traps, skip links | `import { test, keyboard } from ''./fixtures/keyboard-oracle''` |
| `chaos-saboteur.ts` | Network failure simulation, resilience | `import { test, chaos } from ''./fixtures/chaos-saboteur''` |
| `visual-oracle.ts` | CLS measurement, layout shift detection | `import { test, visual } from ''./fixtures/visual-oracle''` |
| `llm-ux-oracle.ts` | GPT-5.2 multi-lens UX evaluation | `import { test, uxOracle } from ''./fixtures/llm-ux-oracle''` |
| `stringency-resolver.ts` | Auto-determines test stringency | `import { determineStringency } from ''./fixtures/stringency-resolver''` |
| `console-capture.ts` | Console error/warning capture | `import { ConsoleCapture } from ''./fixtures/console-capture''` |

**Stringency Levels:**
- `strict` - Block on any violation (critical paths like /checkout, /auth)
- `standard` - Block critical/serious, warn moderate (default)
- `relaxed` - Warn only, collect data (new features)

**LLM UX Evaluation Lenses:**
- `first-time-user` - Is purpose clear? Are CTAs obvious?
- `accessibility` - Visual a11y beyond WCAG checks
- `mobile-user` - Touch targets, thumb zones, scroll fatigue
- `error-recovery` - Helpful errors, clear recovery paths
- `cognitive-load` - Too many choices? Overwhelming forms?

**Chaos Testing Capabilities:**
- `attachNetworkChaos(rate)` - Inject random API failures
- `simulateOffline(ms)` - Temporary network outage
- `injectLatency(pattern, ms)` - Add delay to requests
- `testDoubleSubmit(selector)` - Verify idempotency
- `checkRecovery(selector, timeout)` - Verify error recovery

**Sample Test Locations:**
- `tests/e2e/accessibility/wcag-check.spec.ts` - WCAG compliance tests
- `tests/e2e/resilience/chaos-testing.spec.ts` - Network resilience tests
- `tests/e2e/ux-evaluation/llm-ux.spec.ts` - LLM UX evaluation tests

**CI Workflow:** `.github/workflows/e2e-human-like.yml`',

  capabilities = capabilities || ARRAY[
    'accessibility-testing: axe-core WCAG 2.1 AA compliance',
    'keyboard-testing: Tab order, focus trap, skip link verification',
    'chaos-testing: Network failure simulation, resilience verification',
    'visual-testing: CLS measurement, layout shift detection',
    'llm-ux-testing: GPT-5.2 multi-lens UX evaluation ($20/month budget)',
    'stringency-resolver: Auto-determine test strictness by context',
    'console-oracle: Capture and assert on console errors',
    'human-like-testing: Unified fixtures for comprehensive E2E testing'
  ],

  metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{human_like_testing}',
    '{
      "version": "2.5.0",
      "fixtures": [
        "accessibility.ts",
        "keyboard-oracle.ts",
        "chaos-saboteur.ts",
        "visual-oracle.ts",
        "llm-ux-oracle.ts",
        "stringency-resolver.ts",
        "console-capture.ts"
      ],
      "stringency_levels": ["strict", "standard", "relaxed"],
      "llm_lenses": ["first-time-user", "accessibility", "mobile-user", "error-recovery", "cognitive-load"],
      "chaos_capabilities": ["network_chaos", "offline_simulation", "latency_injection", "double_submit_test", "recovery_check"],
      "budget": "$20/month for LLM UX evaluation",
      "added_date": "2025-12-23"
    }'::jsonb
  ),

  version = '2.5.0'

WHERE code = 'TESTING';

-- Verify the update
SELECT code, name, version, array_length(capabilities, 1) as capability_count
FROM leo_sub_agents
WHERE code = 'TESTING';

DO $$
BEGIN
    RAISE NOTICE 'TESTING sub-agent updated with Human-Like E2E Testing capabilities.';
    RAISE NOTICE 'Run: node scripts/generate-claude-md-from-db.js to regenerate CLAUDE files.';
END $$;
