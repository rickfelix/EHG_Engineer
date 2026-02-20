/**
 * CJS wrapper for claim-guard.mjs (TR-1: ESM + CJS compatibility)
 * SD-LEO-INFRA-CLAIM-GUARD-001
 */

let _module;

async function loadModule() {
  if (!_module) {
    _module = await import('./claim-guard.mjs');
  }
  return _module;
}

async function claimGuard(sdKey, sessionId) {
  const mod = await loadModule();
  return mod.claimGuard(sdKey, sessionId);
}

async function formatClaimFailure(result) {
  const mod = await loadModule();
  return mod.formatClaimFailure(result);
}

async function verifyClaimOwnership(sdKey, sessionId) {
  const mod = await loadModule();
  return mod.verifyClaimOwnership(sdKey, sessionId);
}

module.exports = { claimGuard, formatClaimFailure, verifyClaimOwnership };
