// Thin re-export kept for external references — SD-LEO-INFRA-ENFORCE-UNIT-TIER-001.
// The vitest projects now use per-project setup files:
//   unit → tests/setup.unit.js (NO .env load; synthetic sentinels only)
//   db   → tests/setup.db.js   (.env + .env.test, then sentinels)
// This file preserves the historical behavior (db setup) for anything that
// still points at './tests/setup.js'.
import './setup.db.js';
