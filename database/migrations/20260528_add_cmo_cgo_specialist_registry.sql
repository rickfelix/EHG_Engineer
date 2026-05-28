-- Migration: Add CMO + CGO founding identities to specialist_registry (brainstorm board seats)
-- SD: SD-LEO-INFRA-ADD-CMO-CHIEF-001
-- Purpose: Add a marketing voice (CMO) and a revenue/growth voice (CGO = Chief Growth Officer)
--          to the dynamic brainstorm board. CronGenius first-venture pilot finding: the board
--          (CSO/CRO=Risk/CTO/CISO/COO/CFO) had no marketing or revenue/growth seat, so GTM
--          concerns surfaced only via ad-hoc chairman correction rather than board-level scrutiny.
--          Purely additive DATA — no schema change. The growth seat is coded CGO (Chief Growth
--          Officer) because CRO already denotes Chief Risk Officer in this registry.
-- Idempotent: UPSERT on role (specialist_registry_role_key is the only unique key; legacy_agent_code
--             is nullable/non-unique). authority_score=70 matches the founding identities (default is 50).
--             is_governance_floor=false — CMO/CGO compete on topic relevance, panel size (maxSeats=6)
--             and the governance floor (CRO+CISO) are unchanged.

BEGIN;

INSERT INTO specialist_registry (name, role, expertise, context, metadata, authority_score, is_governance_floor, legacy_agent_code, expertise_domains)
VALUES
  (
    'CMO', 'cmo',
    'Positioning, demand generation, brand, channel and message fit',
    'Chief Marketing Officer — evaluates brainstorm topics through positioning, target audience, demand generation, brand, channel selection, and go-to-market messaging.',
    '{"source": "founding-identity", "topicDomain": "marketing"}'::jsonb,
    70.00, false, 'CMO',
    ARRAY['marketing', 'brand', 'demand-generation', 'positioning', 'channels', 'gtm', 'messaging', 'audience']
  ),
  (
    'CGO', 'cgo',
    'Revenue growth, monetization, pricing, distribution, retention',
    'Chief Growth Officer — evaluates brainstorm topics through revenue growth, monetization model, pricing, distribution surfaces, funnel and retention, and expansion.',
    '{"source": "founding-identity", "topicDomain": "growth"}'::jsonb,
    70.00, false, 'CGO',
    ARRAY['growth', 'revenue', 'monetization', 'pricing', 'distribution', 'retention', 'funnel', 'expansion']
  )
ON CONFLICT (role) DO UPDATE SET
  authority_score = EXCLUDED.authority_score,
  is_governance_floor = EXCLUDED.is_governance_floor,
  legacy_agent_code = EXCLUDED.legacy_agent_code,
  expertise_domains = EXCLUDED.expertise_domains,
  context = EXCLUDED.context,
  metadata = EXCLUDED.metadata;

COMMIT;
