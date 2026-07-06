// Planted MISS-direction fixture for the expired-premise gauge (TS-3).
// The live gauge excludes tests/fixtures by default; unit tests opt in via
// includeFixtures: true. Do not "fix" the past date — it is the test subject.

// REVISIT-IF(expires=2026-01-01) owner=coordinator provenance=SD-LEO-INFRA-BITTER-LESSON-AUDIT-001 note=planted expired fixture, gauge must fire on this
export const plantedWorkaround = true;

// REVISIT-IF(expires=2099-12-31) owner=coordinator provenance=SD-LEO-INFRA-BITTER-LESSON-AUDIT-001 note=planted healthy tag, gauge must stay quiet on this
export const healthyWorkaround = true;
