-- Add mandatory agent invocation rules to LEO Protocol
INSERT INTO leo_protocol_sections (
  protocol_id,
  section_type,
  title,
  content,
  order_index,
  context_tier,
  target_file
) VALUES (
  'leo-v4-3-3-ui-parity',
  'mandatory_agent_invocation',
  'Mandatory Agent Invocation Rules',
  E'## Mandatory Agent Invocation Rules\n\n**CRITICAL**: Certain task types REQUIRE specialized agent invocation - NO ad-hoc manual inspection allowed.\n\n### Task Type -> Required Agent\n\n| Task Keywords | MUST Invoke | Purpose |\n|---------------|-------------|---------|\n| UI, UX, design, landing page, styling, CSS, colors, buttons | **design-agent** | Accessibility audit (axe-core), contrast checking |\n| accessibility, a11y, WCAG, screen reader, contrast | **design-agent** | WCAG 2.1 AA compliance validation |\n| form, input, validation, user flow | **design-agent** + **testing-agent** | UX + E2E verification |\n| performance, slow, loading, latency | **performance-agent** | Load testing, optimization |\n| security, auth, RLS, permissions | **security-agent** | Vulnerability assessment |\n| API, endpoint, REST, GraphQL | **api-agent** | API design patterns |\n| database, migration, schema | **database-agent** | Schema validation |\n| test, E2E, Playwright, coverage | **testing-agent** | Test execution |\n\n### Why This Exists\n\n**Incident**: Human-like testing perspective interpreted as manual content inspection.\n**Result**: 47 accessibility issues missed, including critical contrast failures (1.03:1 ratio).\n**Root Cause**: Ad-hoc review instead of specialized agent invocation.\n**Prevention**: Explicit rules mandate agent use for specialized tasks.\n\n### How to Apply\n\n1. Detect task type from user request keywords\n2. Invoke required agent(s) BEFORE making changes\n3. Agent findings inform implementation\n4. Re-run agent AFTER changes to verify fixes',
  5,
  'CORE',
  'CLAUDE.md'
)
ON CONFLICT DO NOTHING;
