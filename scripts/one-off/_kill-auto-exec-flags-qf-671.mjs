#!/usr/bin/env node
/**
 * QF-20260816-671 -- KILL auto_exec_engine_v1 + auto_exec_checkout_sync_v1 per chairman
 * ruling B (SMS f88e9b5b 13:45Z; flag_enablement rows 1315d76e + c08f4368 rejected with
 * tooling-enacts note; Adam advisory c5bcf355).
 *
 * Uses the canonical flag tooling (lib/feature-flags/registry.js deleteFlag) rather than
 * raw SQL, so the deletion is audited via logAudit as every other flag mutation is.
 *
 * Both flags confirmed is_enabled=false / lifecycle_state='draft' (never rolled out) --
 * safe to delete outright rather than deprecate-then-delete.
 */
import 'dotenv/config';
import { deleteFlag } from '../../lib/feature-flags/registry.js';

const FLAGS = ['auto_exec_engine_v1', 'auto_exec_checkout_sync_v1'];

for (const key of FLAGS) {
  try {
    await deleteFlag(key, 'QF-20260816-671 (chairman ruling B, SMS f88e9b5b)');
    console.log(`• ${key}: deleted.`);
  } catch (e) {
    console.log(`• ${key}: ${e.message}`);
  }
}
