/**
 * Rule fetching and management for gates
 */

import { getDb } from './db';
import { ValidationRule } from './score';

/**
 * Fetch validation rules for a specific gate
 */
export async function getRulesForGate(gate: string): Promise<ValidationRule[]> {
  const db = await getDb();
  
  const { data: rules, error } = await db
    .from('leo_validation_rules')
    .select('rule_name, weight, criteria, required')
    .eq('gate', gate)
    .eq('active', true)
    .order('weight', { ascending: false });
  
  if (error) {
    console.error(`❌ Failed to fetch rules for gate ${gate}:`, error.message);
    process.exit(2);
  }
  
  if (!rules || rules.length === 0) {
    console.error(`❌ No active rules found for gate ${gate}`);
    console.error('Please run: psql $DATABASE_URL -f database/seed/leo_validation_rules.sql');
    process.exit(2);
  }
  
  // Validate weights sum to 1.0
  const totalWeight = rules.reduce((sum, r) => sum + r.weight, 0);
  if (Math.abs(totalWeight - 1.0) > 0.001) {
    console.error(`❌ Gate ${gate} weights sum to ${totalWeight}, expected 1.000`);
    console.error('Rules:', rules.map(r => `${r.rule_name}:${r.weight}`).join(', '));
    process.exit(2);
  }
  
  return rules as ValidationRule[];
}

/**
 * PRD details including SD type for threshold calculation
 */
export interface PRDDetails {
  id: string;
  title: string;
  sd_id: string | null;
  status: string;
  sd_type: string;
  directive_id: string | null;
}

/**
 * Get PRD details for context, including SD type
 */
export async function getPRDDetails(prdId: string): Promise<PRDDetails | null> {
  const db = await getDb();

  // First get PRD with directive_id
  const { data: prd, error: prdError } = await db
    .from('product_requirements_v2')
    .select('id, title, sd_id, status, directive_id')
    .eq('id', prdId)
    .single();

  if (prdError || !prd) {
    console.error(`❌ PRD not found: ${prdId}`);
    return null;
  }

  // Get SD type from linked strategic directive
  let sdType = 'feature'; // default
  if (prd.directive_id) {
    const { data: sd } = await db
      .from('strategic_directives_v2')
      .select('sd_type')
      .eq('id', prd.directive_id)
      .single();

    if (sd?.sd_type) {
      sdType = sd.sd_type;
    }
  }

  return {
    id: prd.id,
    title: prd.title,
    sd_id: prd.sd_id,
    status: prd.status,
    directive_id: prd.directive_id,
    sd_type: sdType
  };
}

/**
 * Store gate review results
 */
export async function storeGateReview(
  prdId: string,
  gate: string,
  score: number,
  evidence: Record<string, unknown>,
): Promise<void> {
  const db = await getDb();
  
  const { error } = await db
    .from('leo_gate_reviews')
    .insert({
      prd_id: prdId,
      gate,
      score,
      evidence,
      created_by: 'gate-runner',
    });
  
  if (error) {
    console.error('❌ Failed to store gate review:', error.message);
    throw error;
  }
  
  console.log(`✅ Gate review stored: ${gate} = ${score}%`);
}