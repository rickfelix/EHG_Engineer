/**
 * SD-LEO-GEN-ALTIFYAI-FIRST-CUSTOMER-001 FR-1: run provisionVentureEmail for AltifyAI in an
 * explicit, spend-safe no-purchase mode.
 *
 * TR-1 / TESTING sub-agent finding G1 (sub_agent_execution_results de22862f): the !registrar
 * plan_mode short-circuit (lib/venture-email/provision-venture-email.js:246-252) is nested inside
 * an if(!done('registered')) check -- if provision_state were ever already at/past 'registered',
 * that branch is skipped and dns/resendDomains/emailRouting would each default to a LIVE adapter
 * unless independently overridden. This script overrides ALL FOUR seams (registrar, dns,
 * resendDomains, emailRouting) as null, and additionally asserts the zero-rows precondition
 * before invoking, so no live provisioning call is possible under any provision_state.
 *
 * A domain apex is required by provisionVentureEmail(venture, deps) but AltifyAI owns no
 * registrable domain (ventures has no domain column; its only surface is the workers.dev
 * subdomain). 'altifyai.com' below is a DOCUMENTATION PLACEHOLDER for the eventual real domain --
 * registrar:null means this call never checks or reserves it. Purchasing a real domain is a
 * separate, explicitly chairman-approved spend decision, out of this SD's automation entirely.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { provisionVentureEmail } from '../../lib/venture-email/provision-venture-email.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const VENTURE_ID = '50763b6a-1fad-4e1e-b2fc-296a1d66ebf9';
const PLACEHOLDER_DOMAIN = 'altifyai.com';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function assertPrecondition() {
  const { data, error } = await supabase
    .from('venture_email_identities')
    .select('id, domain, provision_state')
    .eq('venture_id', VENTURE_ID);
  if (error) throw new Error(`precondition check failed: ${error.message}`);
  if (data.length > 0) {
    throw new Error(
      `PRECONDITION FAILED: venture_email_identities already has ${data.length} row(s) for ` +
      `AltifyAI (${JSON.stringify(data)}) -- this script assumes a fresh venture with no prior ` +
      'provisioning attempt. Refusing to run rather than risk an unverified state.'
    );
  }
  console.log('[precondition] OK -- venture_email_identities has zero rows for AltifyAI.');
}

async function main() {
  await assertPrecondition();

  const throwOnCall = (name) => new Proxy({}, {
    get() {
      throw new Error(`SAFETY: ${name} adapter method called -- this must never happen in no-purchase mode`);
    },
  });

  const result = await provisionVentureEmail(
    { id: VENTURE_ID, domain: PLACEHOLDER_DOMAIN },
    {
      supabase,
      registrar: null,
      dns: null,
      resendDomains: null,
      emailRouting: null,
    }
  );

  console.log('[result]', JSON.stringify(result, null, 2));

  if (result.state !== 'plan_mode') {
    throw new Error(`UNEXPECTED STATE: expected 'plan_mode', got '${result.state}' -- refusing to treat this as safe.`);
  }

  const artifact = {
    ventureId: VENTURE_ID,
    domain_placeholder: PLACEHOLDER_DOMAIN,
    provision_state: result.state,
    plan_steps: result.planSteps,
    note:
      'No live registrar/dns/resendDomains/emailRouting call occurred (all four deps overridden ' +
      'null). domain_placeholder is NOT a reserved or checked domain -- purchasing a real domain ' +
      'for AltifyAI is a separate, explicitly chairman-approved spend decision, out of this SD.',
    measured_at: new Date().toISOString(),
  };

  const { data: venture, error: fetchErr } = await supabase.from('ventures').select('metadata').eq('id', VENTURE_ID).single();
  if (fetchErr) throw fetchErr;
  const metadata = {
    ...venture.metadata,
    venture_email_provisioning: artifact,
  };
  const { error: updateErr } = await supabase.from('ventures').update({ metadata }).eq('id', VENTURE_ID);
  if (updateErr) throw updateErr;

  console.log('[FR-1] Provisioning artifact recorded to ventures.metadata.venture_email_provisioning.');
}

if (isMainModule(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[FR-1] FATAL:', err);
      process.exit(1);
    });
}

export { assertPrecondition, main };
