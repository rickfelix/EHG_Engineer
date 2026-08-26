---
category: feature
status: approved
version: 1.0.0
author: SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-A
last_updated: 2026-08-26
tags: [feature, media-generation, creative, storage]
---

# Media Generation: Unified Adapter Seam

## Metadata
- **Category**: Feature
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-A
- **Last Updated**: 2026-08-26
- **Tags**: feature, media-generation, creative, storage

## Overview

`lib/creative/generate-asset.js#generateAsset()` is the single call path for image/video
generation in EHG_Engineer, replacing two previously-orphaned, uncoordinated systems
(`lib/marketing/ai/{image,video}-generator.js`, now deprecated with zero new call sites).
It is a provider-per-capability routing table (`image: [runway, gemini]`, `video: [runway]`)
with ordered fallback — if a configured provider throws, the next provider in that capability's
list is attempted before the call fails.

This document describes the real, shipped state as of PR #7571 — **not** a roadmap or
aspirational design. See `docs/04_features/34a_creative_media_automation.md` for an earlier,
DOCMON-auto-generated speculative draft that does not reflect any implemented system; it
describes a fictional `EnhancedCreativeMediaAgent` class hierarchy with no corresponding code.

## What changed (SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-A)

1. **Mandatory `venture_id`.** `generateAsset(ventureId, capability, spec, constraints, deps)`
   rejects a missing venture before any provider request is made. This exists so the future
   HARD FENCE (child B of the parent orchestrator, `SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-B`)
   always has a venture to key its S23+S24 stage-gate check against.
2. **Private asset storage.** `lib/creative/asset-storage.js` (new) uploads a generated asset's
   bytes to a **private** Supabase Storage bucket (`creative-assets-private`, `public: false`) via
   `lib/storage/private-signed-upload.js`, and returns only the storage **path** — never a public
   or signed URL — for persistence on the `creative_assets.storage_path` column. Previously the
   provider's own URL/bytes were discarded entirely.
   - Runway (`asset.url`, a provider-hosted CloudFront link) is fetched server-side and re-hosted.
     The fetch is host-allowlisted to Runway's actual confirmed output host
     (`dnznrvs05pmza.cloudfront.net`), uses `redirect: 'manual'` (a redirect response is refused,
     never silently followed), and enforces an https-only, image/video-content-type-only, 200MB
     size cap.
   - Gemini (`asset.raw`, inline base64 bytes) is decoded directly.
3. **MVP-scoped quality gate.** `lib/creative/quality-gate.js`'s two stages, which previously
   failed closed **unconditionally** (no real generation could ever pass), now have narrow interim
   implementations: a structural brand-source-ref check, and a keyword deny-list anti-fabrication
   screen. The non-negotiable stub-output rejection (a test-mode/placeholder generation is always
   rejected) is unchanged. A full claims-registry/brand-token comparator remains out of scope,
   deferred to a follow-up SD if these interim checks prove insufficient.

## Known limitations (tracked, not silent)

- The anti-fabrication keyword screen is a **prompt**-side check, not an **output**-side one, and
  is bypassable by spacing/homoglyph tricks. Acceptable for MVP; a real claims-registry screen is
  future work.
- All of the above controls (venture check, quality gate, storage) are overridable via an
  injectable `deps` parameter (mirroring this codebase's existing test-injection pattern). This is
  intentional for testability, but means **the future HARD FENCE must not be implemented as
  something that lives behind this same injection point** — it needs its own, non-bypassable
  chokepoint.
- Kling was not added as a second configured video provider (Runway already is one, real and
  working); this is an explicit, documented scope decision, not an oversight.

## Related

- `database/migrations/20260826_creative_assets_storage_path.sql` — additive `storage_path` column.
- `SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001` (parent orchestrator) — the reconciliation effort
  this child is one part of; see children -B (fence), -C (variant scoring), -D (ehg app reconciliation).
