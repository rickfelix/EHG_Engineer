#!/usr/bin/env node
/**
 * orphan-reroute-sweep.mjs — SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-D (Child C).
 * Thin CLI wrapper: run one tick of lib/fleet/orphan-reroute-sweep.js's sweepOrphanRows
 * (see that file's header for the orphan definition, reroute action, and repeat-offender
 * alarm). Headless-safe: no judgment calls, purely mechanical re-typing/re-targeting.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { sweepOrphanRows } from '../lib/fleet/orphan-reroute-sweep.js';

const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const out = await sweepOrphanRows(sb);
console.log(`[orphan-reroute-sweep] ${JSON.stringify(out)}`);
process.exitCode = out.error ? 1 : 0;
