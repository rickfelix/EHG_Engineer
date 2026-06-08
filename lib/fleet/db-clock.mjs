// SD-FDBK-INFRA-NODE-CLOCK-SKEW-001 — ESM re-export of the CJS db-clock helper so .mjs
// consumers (claim-guard.mjs, coordinator-audit.mjs) share ONE implementation. Single
// source of truth = ./db-clock.cjs.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { getDbNowMs } = require('./db-clock.cjs');
export { getDbNowMs };
