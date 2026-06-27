# CD30 — Cloudflare-default venture-hosting standard re-instated (supersedes CD-15)

**Decision date:** 2026-06-27 (chairman-corrected)
**Child SD:** SD-LEO-INFRA-VENTURE-CLOUDFLARE-DEFAULT-001-A (FR-1 governance correction)
**Parent SD:** SD-LEO-INFRA-VENTURE-CLOUDFLARE-DEFAULT-001
**Canonical store:** `SD-EHG-VENTURE1-MARKET-MODELING-SAAS-001` → `metadata.chairman_decisions.CD30_stack_cloudflare` (DB SSOT)

## What changed

CD30 **supersedes CD-15** (`CD15_stack`, 2026-06-24) and re-instates the **2026-06-14 ratified
Cloudflare-default venture-hosting standard**. CD-15's Replit re-lock was an **accidental inheritance**
of the un-updated Replit standard — **not a deliberate reversal**. The chairman explicitly confirmed the
re-lock was unintentional on 2026-06-27.

## Conformant default (re-instated)

- **Web (static):** Cloudflare Pages
- **Server runtime:** Cloudflare Workers (Google Cloud Run only when a full Node runtime is required)
- **Object storage:** Cloudflare R2
- **Database:** D1-default → Neon-graduate (via `stakes-router`)
- **Auth / images / errors:** Clerk + Gemini + Sentry
- **Repo:** own repo per venture
- **Replit:** demoted to explicit opt-in (prototyping only) — no longer the hardcoded default
- **Spend-guardrails:** the 8-point policy is a **hard precondition** before Cloudflare-default goes live
  (D1 runaway-invoice risk; no provider has a hard dollar cap)

## Rationale

The 2026-06-14 six-source research unanimously recommended Cloudflare for BOTH cost (~$5/mo vs ~$55/mo on
Replit) AND the chairman's objection that Replit runs vendor AI agents/telemetry on deployed infra. The
standard was ratified once (2026-06-14) but never shipped as the default (Replit left as the hardcoded
fail-safe), then accidentally reverted by CD-15.

## Scope of this child (FR-1 only)

Governance record only:
1. **FR-1** — appended `CD30_stack_cloudflare` to the canonical chairman-decisions store; annotated
   `CD15_stack` with a `[SUPERSEDED ...]` marker (original text preserved verbatim for audit).
2. **FR-1b** — mirrored the correction into the canonical session-decisions ledger
   (`docs/reports/venture1-session-decisions-canonical-2026-06-24.md`).
3. **FR-1c** — no code, stack-policy, or schema changes in this child.

## Enactment (sibling children — out of scope here)

- **-B** standard/SSOT rewrite (venture-hosting-standard.md, venture-stack-policy.js, S19 check)
- **-C** provisioner default-seeding code (default Cloudflare `stack_descriptor`)
- **-D** spend-guardrail wiring (`lib/venture-deploy/spend-guardrails.js`)

> Propagation-integrity: the corrected decision is written into the canonical store so any future
> "lock to the approved standard" reads the correct value and the CD-15-class accidental inheritance
> cannot recur. The SSOT-prose enactment lands in child -B.
