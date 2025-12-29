// Dependency Observer Edge Function
// LEO Protocol v4.4: Proactive SD Proposal System
// Monitors npm audit for vulnerabilities and proposes SDs for fixes

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NpmAuditVulnerability {
  name: string;
  severity: 'info' | 'low' | 'moderate' | 'high' | 'critical';
  via: string[];
  effects: string[];
  range: string;
  fixAvailable: boolean | { name: string; version: string; isSemVerMajor: boolean };
}

interface NpmAuditResult {
  vulnerabilities: Record<string, NpmAuditVulnerability>;
  metadata: {
    vulnerabilities: {
      info: number;
      low: number;
      moderate: number;
      high: number;
      critical: number;
      total: number;
    };
  };
}

interface ObserverRequest {
  audit_results?: NpmAuditResult;
  target_application?: string;
  venture_id?: string;
  dry_run?: boolean;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request
    const body: ObserverRequest = await req.json();
    const {
      audit_results,
      target_application = 'EHG_Engineer',
      venture_id,
      dry_run = false,
    } = body;

    // Validate input
    if (!audit_results?.vulnerabilities) {
      return new Response(
        JSON.stringify({ error: 'Missing audit_results.vulnerabilities' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = {
      proposals_created: 0,
      proposals_skipped: 0,
      alerts_created: 0,
      errors: [] as string[],
      proposals: [] as any[],
    };

    // Filter high and critical vulnerabilities
    const highPriorityVulns = Object.entries(audit_results.vulnerabilities)
      .filter(([_, vuln]) => vuln.severity === 'high' || vuln.severity === 'critical');

    console.log(`Found ${highPriorityVulns.length} high/critical vulnerabilities`);

    for (const [packageName, vuln] of highPriorityVulns) {
      // Generate deterministic dedupe key
      const cveMatch = vuln.via.find(v => typeof v === 'string' && v.includes('CVE'));
      const advisoryId = cveMatch || `${packageName}:${vuln.range}`;
      const dedupeKey = `dependency_update:${packageName}:${advisoryId}`;

      // Check if proposal already exists
      const { data: existing } = await supabase
        .from('sd_proposals')
        .select('id, status')
        .eq('dedupe_key', dedupeKey)
        .in('status', ['pending', 'seen', 'snoozed'])
        .single();

      if (existing) {
        console.log(`Skipping ${packageName}: proposal already exists (${existing.status})`);
        results.proposals_skipped++;
        continue;
      }

      // Calculate confidence based on severity and fix availability
      let confidence = 0.70;
      if (vuln.severity === 'critical') confidence = 0.95;
      else if (vuln.severity === 'high') confidence = 0.85;

      if (vuln.fixAvailable) confidence += 0.05;

      // Build proposal
      const proposal = {
        title: `Fix ${vuln.severity.toUpperCase()} vulnerability in ${packageName}`,
        description: `A ${vuln.severity} severity vulnerability was detected in ${packageName} (${vuln.range}). ${
          vuln.fixAvailable
            ? typeof vuln.fixAvailable === 'object'
              ? `Fix available: upgrade to ${vuln.fixAvailable.name}@${vuln.fixAvailable.version}${vuln.fixAvailable.isSemVerMajor ? ' (MAJOR VERSION CHANGE)' : ''}`
              : 'A fix is available.'
            : 'No automatic fix available - manual remediation required.'
        }`,
        trigger_type: 'dependency_update',
        trigger_source_id: advisoryId,
        trigger_event_type: 'npm_audit_vulnerability',
        confidence_score: Math.min(confidence, 1.0),
        impact_score: vuln.severity === 'critical' ? 0.95 : 0.80,
        urgency_level: vuln.severity === 'critical' ? 'critical' : 'medium',
        dedupe_key: dedupeKey,
        target_application: target_application,
        venture_id: venture_id || null,
        created_by: 'observer:dependencies',
        proposed_scope: {
          objectives: [
            `Remediate ${vuln.severity} vulnerability in ${packageName}`,
            'Update package to patched version',
            'Run dependency compatibility tests',
            'Verify no breaking changes'
          ],
          success_criteria: [
            `npm audit shows no ${vuln.severity} vulnerability for ${packageName}`,
            'All existing tests pass',
            'No new security warnings introduced'
          ],
          risks: [
            {
              risk: 'Breaking changes in updated package',
              mitigation: 'Review changelog and run comprehensive tests'
            },
            {
              risk: 'Transitive dependency conflicts',
              mitigation: 'Use npm dedupe and check peer dependencies'
            }
          ]
        },
        evidence_data: {
          package_name: packageName,
          severity: vuln.severity,
          vulnerable_range: vuln.range,
          via: vuln.via,
          effects: vuln.effects,
          fix_available: vuln.fixAvailable,
          detected_at: new Date().toISOString()
        }
      };

      if (dry_run) {
        results.proposals.push(proposal);
        results.proposals_created++;
        continue;
      }

      // Insert proposal
      const { data: insertedProposal, error: insertError } = await supabase
        .from('sd_proposals')
        .insert(proposal)
        .select()
        .single();

      if (insertError) {
        console.error(`Failed to insert proposal for ${packageName}:`, insertError);
        results.errors.push(`${packageName}: ${insertError.message}`);
        continue;
      }

      results.proposals.push(insertedProposal);
      results.proposals_created++;

      // For critical vulnerabilities, also create chairman alert
      if (vuln.severity === 'critical') {
        try {
          const { error: alertError } = await supabase
            .from('chairman_alerts')
            .insert({
              severity: 'critical',
              title: `CRITICAL: ${packageName} vulnerability requires immediate attention`,
              message: proposal.description,
              source: 'sd_proposal',
              source_id: insertedProposal.id,
              metadata: {
                trigger_type: 'dependency_update',
                package: packageName,
                advisory: advisoryId
              }
            });

          if (!alertError) {
            results.alerts_created++;

            // Update proposal with linked alert
            await supabase
              .from('sd_proposals')
              .update({ linked_alert_id: insertedProposal.id })
              .eq('id', insertedProposal.id);
          }
        } catch (alertErr) {
          console.error('Failed to create chairman alert:', alertErr);
          // Non-blocking - proposal still created
        }
      }

      // Log system event
      try {
        await supabase.rpc('fn_log_system_event', {
          p_event_type: 'PROPOSAL_GENERATED',
          p_correlation_id: insertedProposal.correlation_id,
          p_payload: {
            proposal_id: insertedProposal.id,
            trigger_type: 'dependency_update',
            package: packageName,
            severity: vuln.severity,
            confidence: proposal.confidence_score
          }
        });
      } catch (eventErr) {
        // fn_log_system_event may not exist
        console.log('System event logging skipped');
      }
    }

    console.log(`Observer complete: ${results.proposals_created} proposals created, ${results.proposals_skipped} skipped`);

    return new Response(
      JSON.stringify({
        success: true,
        dry_run,
        ...results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Observer error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
