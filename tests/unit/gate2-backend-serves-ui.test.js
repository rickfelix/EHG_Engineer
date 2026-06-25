/**
 * SD-LEO-INFRA-GATE2-BACKEND-FIDELITY-NA-001 — servesExistingUiBackend predicate.
 *
 * STAGE24 (SD-EHG-PRODUCT-STAGE24-GOLIVE-BACKEND-001) is a backend API SD ("Build the POST
 * /api/stage24/{ventureId}/go-live route that Stage24GoLive.tsx already calls") that ships NO
 * new UI, but its scope NAMES its frontend caller → hasUISurface() trips on "frontend"/".tsx"
 * → all the !hasUISurface backend exemptions (incl. classifyBackendLeaf) reject it → Section A
 * false-blocked it, forcing 3 bypasses. These tests pin the fix BIDIRECTIONALLY: the
 * serves-existing-UI backend SD is exempt, while a genuine UI SD is NOT (BUILDS_NEW_UI_RE fence).
 */
import { describe, it, expect } from 'vitest';
import { servesExistingUiBackend } from '../../scripts/modules/implementation-fidelity/sections/backend-leaf-detection.js';

const STAGE24_SCOPE =
  'Build the POST /api/stage24/{ventureId}/go-live route that Stage24GoLive.tsx already calls. ' +
  'v1: (1) validate the Stage-23 launch-readiness gate before allowing go-live; (2) set ventures.deployment_url.';
const STAGE24_TITLE = 'Implement the Stage-24 Go-Live API endpoint the operator app already calls';

describe('servesExistingUiBackend — exempts a backend API serving an existing UI caller', () => {
  it('exempts the STAGE24 shape (the false-block that forced 3 bypasses)', () => {
    const r = servesExistingUiBackend('feature', STAGE24_SCOPE, STAGE24_TITLE);
    expect(r.exempt).toBe(true);
  });

  it('exempts a bugfix backend endpoint serving an existing component', () => {
    const r = servesExistingUiBackend('bugfix', 'Fix the GET /api/ventures/{id}/status handler that VentureStatus.tsx already calls', '');
    expect(r.exempt).toBe(true);
  });
});

describe('servesExistingUiBackend — does NOT exempt genuine UI work (BUILDS_NEW_UI fence)', () => {
  it('does NOT exempt an SD that BUILDS the .tsx component (even if it calls an existing API)', () => {
    const r = servesExistingUiBackend('feature', 'Build the Stage24GoLive.tsx component with a go-live button that calls the existing /api/stage24 endpoint', 'Stage24 Go-Live UI');
    expect(r.exempt).toBe(false);
  });

  it('does NOT exempt an SD that builds a new dashboard wired to an already-calling API', () => {
    const r = servesExistingUiBackend('feature', 'Create the new operator dashboard that already calls /api/metrics', 'Operator dashboard');
    expect(r.exempt).toBe(false);
  });
});

describe('servesExistingUiBackend — narrow scope (does not over-fire)', () => {
  it('does NOT exempt a pure backend API SD with no existing-UI reference (classifyBackendLeaf handles those)', () => {
    const r = servesExistingUiBackend('feature', 'Build the POST /api/ingest route for the distillation pipeline', '');
    expect(r.exempt).toBe(false);
  });

  it('does NOT exempt non-UI-capable types (handled by the sd-type policy)', () => {
    const r = servesExistingUiBackend('database', STAGE24_SCOPE, STAGE24_TITLE);
    expect(r.exempt).toBe(false);
  });

  it('does NOT exempt a UI-referencing SD that builds no API endpoint', () => {
    const r = servesExistingUiBackend('feature', 'Refactor the helper that Stage24GoLive.tsx already calls', '');
    expect(r.exempt).toBe(false);
  });
});
