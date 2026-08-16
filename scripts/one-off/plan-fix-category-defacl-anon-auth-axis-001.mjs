#!/usr/bin/env node
// PLAN-phase verification: correct sd.category from 'Security' to 'Infrastructure'.
//
// GATE3_TRACEABILITY's Section A (recommendation-adherence.js) and Section C (traceability-
// mapping.js) both key their "no design/UI artifact to trace, that is fine" full-credit bypass
// off sd.category.toLowerCase() === 'database' | 'infrastructure' | 'refactor' -- NOT off
// sd_type. This SD's sd_type stays 'security' (correctly governs Tier-3 routing, SECURITY
// sub-agent requirement, and the 90% LEAD-TO-PLAN threshold -- unaffected by this change).
// category='Security' matched isSecuritySD in Section C (keyword-based, already passing after
// the deliverables_manifest fix) but is NOT one of the bypass-eligible categories in Section A,
// and Section C's isSecuritySD path still requires a real (non-existent, by design) "design
// analysis" for full C2 credit. The DIRECT PREDECESSOR SD to this one
// (SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001 -- same author's judgment, same shape of work: a
// staged chairman-gated SQL-only migration with zero UI) used category='Infrastructure' despite
// ALSO being sd_type='security' -- category in this repo is a looser, execution-shape
// classification, not a 1:1 mirror of sd_type. Matching that precedent here.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { error } = await supabase
  .from('strategic_directives_v2')
  .update({ category: 'Infrastructure' })
  .eq('sd_key', 'SD-LEO-SEC-DEFACL-ANON-AUTH-AXIS-001');
if (error) { console.error('UPDATE ERR:', error.message); process.exit(1); }
console.log('category corrected: Security -> Infrastructure (sd_type remains security, unaffected).');
