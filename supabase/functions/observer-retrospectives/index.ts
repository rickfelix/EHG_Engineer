// Retrospective Pattern Observer Edge Function
// LEO Protocol v4.4: Proactive SD Proposal System
// Monitors retrospectives for recurring patterns and proposes SDs for remediation

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Retrospective {
  id: string;
  title: string;
  sd_id: string;
  learning_category: string;
  key_learnings: string;
  action_items: string;
  target_application: string;
  affected_components: string[];
  tags: string[];
  similarity?: number;
}

interface PatternCluster {
  category: string;
  retroIds: string[];
  sdIds: string[];
  titles: string[];
  sharedComponents: string[];
  sharedTags: string[];
  representativeTitle: string;
}

interface ObserverRequest {
  target_application?: string;
  venture_id?: string;
  dry_run?: boolean;
  similarity_threshold?: number;
  min_occurrences?: number;
}

// Generate deterministic dedupe key from pattern cluster
function generateDedupeKey(cluster: PatternCluster): string {
  // Sort retroIds for determinism
  const sortedRetroIds = [...cluster.retroIds].sort();
  // Create hash from sorted retro IDs
  const hashInput = sortedRetroIds.join('_');
  // Simple hash function for dedupe key
  let hash = 0;
  for (let i = 0; i < hashInput.length; i++) {
    const char = hashInput.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `retro_pattern:${cluster.category}:${Math.abs(hash).toString(16)}`;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request
    const body: ObserverRequest = await req.json();
    const {
      target_application = 'EHG_Engineer',
      venture_id,
      dry_run = false,
      similarity_threshold = 0.75,
      min_occurrences = 3,
    } = body;

    const results = {
      proposals_created: 0,
      proposals_skipped: 0,
      patterns_found: 0,
      errors: [] as string[],
      proposals: [] as any[],
      clusters: [] as PatternCluster[],
    };

    // Query recent retrospectives with published status (last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { data: retrospectives, error: fetchError } = await supabase
      .from('retrospectives')
      .select(`
        id,
        title,
        sd_id,
        learning_category,
        key_learnings,
        action_items,
        target_application,
        affected_components,
        tags,
        content_embedding
      `)
      .eq('status', 'published')
      .gte('created_at', ninetyDaysAgo.toISOString())
      .order('created_at', { ascending: false });

    if (fetchError) {
      throw new Error(`Failed to fetch retrospectives: ${fetchError.message}`);
    }

    if (!retrospectives || retrospectives.length < min_occurrences) {
      console.log(`Not enough retrospectives to analyze: ${retrospectives?.length || 0}`);
      return new Response(
        JSON.stringify({
          success: true,
          dry_run,
          message: `Insufficient retrospectives for pattern detection (found ${retrospectives?.length || 0}, need ${min_occurrences})`,
          ...results
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Analyzing ${retrospectives.length} retrospectives for patterns`);

    // Group by learning_category first (primary clustering)
    const categoryGroups = new Map<string, Retrospective[]>();
    for (const retro of retrospectives) {
      const category = retro.learning_category || 'APPLICATION_ISSUE';
      if (!categoryGroups.has(category)) {
        categoryGroups.set(category, []);
      }
      categoryGroups.get(category)!.push(retro);
    }

    // Find patterns within each category
    const patterns: PatternCluster[] = [];

    for (const [category, retros] of categoryGroups.entries()) {
      // Skip if not enough in this category
      if (retros.length < min_occurrences) {
        continue;
      }

      // Find shared components within category
      const componentCounts = new Map<string, string[]>();
      const tagCounts = new Map<string, string[]>();

      for (const retro of retros) {
        // Count component occurrences
        for (const comp of (retro.affected_components || [])) {
          if (!componentCounts.has(comp)) {
            componentCounts.set(comp, []);
          }
          componentCounts.get(comp)!.push(retro.id);
        }
        // Count tag occurrences
        for (const tag of (retro.tags || [])) {
          if (!tagCounts.has(tag)) {
            tagCounts.set(tag, []);
          }
          tagCounts.get(tag)!.push(retro.id);
        }
      }

      // Find components that appear 3+ times
      const recurringComponents = Array.from(componentCounts.entries())
        .filter(([_, ids]) => ids.length >= min_occurrences)
        .sort((a, b) => b[1].length - a[1].length);

      // Find tags that appear 3+ times
      const recurringTags = Array.from(tagCounts.entries())
        .filter(([_, ids]) => ids.length >= min_occurrences)
        .sort((a, b) => b[1].length - a[1].length);

      // Create clusters based on recurring components
      for (const [component, retroIds] of recurringComponents) {
        const clusterRetros = retros.filter(r => retroIds.includes(r.id));
        const uniqueSdIds = [...new Set(clusterRetros.map(r => r.sd_id).filter(Boolean))];

        // Only create pattern if it spans 3+ distinct SDs
        if (uniqueSdIds.length >= min_occurrences) {
          patterns.push({
            category,
            retroIds,
            sdIds: uniqueSdIds,
            titles: clusterRetros.map(r => r.title),
            sharedComponents: [component],
            sharedTags: recurringTags
              .filter(([_, ids]) => ids.some(id => retroIds.includes(id)))
              .map(([tag]) => tag),
            representativeTitle: `Recurring ${category.replace(/_/g, ' ').toLowerCase()} issues in ${component}`,
          });
        }
      }

      // If no component-based patterns, check for category-level patterns
      if (patterns.filter(p => p.category === category).length === 0) {
        const uniqueSdIds = [...new Set(retros.map(r => r.sd_id).filter(Boolean))];
        if (uniqueSdIds.length >= min_occurrences) {
          patterns.push({
            category,
            retroIds: retros.map(r => r.id),
            sdIds: uniqueSdIds,
            titles: retros.map(r => r.title),
            sharedComponents: [],
            sharedTags: recurringTags.slice(0, 5).map(([tag]) => tag),
            representativeTitle: `Recurring ${category.replace(/_/g, ' ').toLowerCase()} patterns detected`,
          });
        }
      }
    }

    results.patterns_found = patterns.length;
    results.clusters = patterns;

    console.log(`Found ${patterns.length} recurring patterns`);

    // Create proposals for each pattern
    for (const pattern of patterns) {
      const dedupeKey = generateDedupeKey(pattern);

      // Check if proposal already exists
      const { data: existing } = await supabase
        .from('sd_proposals')
        .select('id, status')
        .eq('dedupe_key', dedupeKey)
        .in('status', ['pending', 'seen', 'snoozed'])
        .single();

      if (existing) {
        console.log(`Skipping pattern ${pattern.category}: proposal already exists (${existing.status})`);
        results.proposals_skipped++;
        continue;
      }

      // Calculate confidence based on pattern strength
      let confidence = 0.70;
      // More SDs = higher confidence
      confidence += Math.min(pattern.sdIds.length * 0.05, 0.15);
      // More specific (component-based) = higher confidence
      if (pattern.sharedComponents.length > 0) confidence += 0.05;
      // More retros in cluster = higher confidence
      confidence += Math.min(pattern.retroIds.length * 0.02, 0.10);

      // Build proposal
      const proposal = {
        title: pattern.representativeTitle,
        description: `A recurring pattern has been detected across ${pattern.sdIds.length} Strategic Directives. ` +
          `${pattern.retroIds.length} retrospectives in the "${pattern.category.replace(/_/g, ' ')}" category ` +
          `share common issues${pattern.sharedComponents.length > 0 ? ` related to ${pattern.sharedComponents.join(', ')}` : ''}. ` +
          'This suggests a systemic issue that should be addressed with a dedicated SD.\n\n' +
          `Related retrospective titles:\n${pattern.titles.slice(0, 5).map(t => `- ${t}`).join('\n')}`,
        trigger_type: 'retrospective_pattern',
        trigger_source_id: pattern.retroIds[0], // Primary retro
        trigger_event_type: 'pattern_cluster_detected',
        confidence_score: Math.min(confidence, 1.0),
        impact_score: pattern.category === 'SECURITY_VULNERABILITY' ? 0.95 :
                       pattern.category === 'PERFORMANCE_OPTIMIZATION' ? 0.80 :
                       pattern.category === 'APPLICATION_ISSUE' ? 0.75 : 0.70,
        urgency_level: pattern.category === 'SECURITY_VULNERABILITY' ? 'critical' : 'medium',
        dedupe_key: dedupeKey,
        target_application: target_application,
        venture_id: venture_id || null,
        created_by: 'observer:retrospectives',
        proposed_scope: {
          objectives: [
            `Address recurring ${pattern.category.replace(/_/g, ' ').toLowerCase()} issues`,
            `Analyze root cause across ${pattern.sdIds.length} affected SDs`,
            'Implement systemic fix to prevent recurrence',
            'Update development practices if process-related'
          ],
          success_criteria: [
            'No new retrospectives with similar patterns for 30 days',
            'Root cause documented and addressed',
            'Prevention measures implemented'
          ],
          risks: [
            {
              risk: 'Pattern may have multiple unrelated causes',
              mitigation: 'Review each retrospective individually during LEAD phase'
            },
            {
              risk: 'Fix may require significant refactoring',
              mitigation: 'Scope carefully and consider incremental approach'
            }
          ]
        },
        evidence_data: {
          pattern_category: pattern.category,
          retro_ids: pattern.retroIds,
          sd_ids: pattern.sdIds,
          retro_count: pattern.retroIds.length,
          sd_count: pattern.sdIds.length,
          shared_components: pattern.sharedComponents,
          shared_tags: pattern.sharedTags,
          sample_titles: pattern.titles.slice(0, 5),
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
        console.error('Failed to insert proposal for pattern:', insertError);
        results.errors.push(`${pattern.category}: ${insertError.message}`);
        continue;
      }

      results.proposals.push(insertedProposal);
      results.proposals_created++;

      // For security patterns, also create chairman alert
      if (pattern.category === 'SECURITY_VULNERABILITY') {
        try {
          await supabase
            .from('chairman_alerts')
            .insert({
              severity: 'high',
              title: 'Recurring security pattern requires attention',
              message: proposal.description,
              source: 'sd_proposal',
              source_id: insertedProposal.id,
              metadata: {
                trigger_type: 'retrospective_pattern',
                pattern_category: pattern.category,
                sd_count: pattern.sdIds.length
              }
            });
        } catch (alertErr) {
          console.error('Failed to create chairman alert:', alertErr);
          // Non-blocking
        }
      }

      // Log system event
      try {
        await supabase.rpc('fn_log_system_event', {
          p_event_type: 'PROPOSAL_GENERATED',
          p_correlation_id: insertedProposal.correlation_id,
          p_payload: {
            proposal_id: insertedProposal.id,
            trigger_type: 'retrospective_pattern',
            pattern_category: pattern.category,
            retro_count: pattern.retroIds.length,
            confidence: proposal.confidence_score
          }
        });
      } catch (eventErr) {
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
