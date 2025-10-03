#!/usr/bin/env node
/**
 * Restore LEAD Pre-Approval Simplicity Gate Section to Database
 * This section was removed during regeneration but contains important workflow guidance
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function restorePreApprovalGate() {
  console.log('🔄 Restoring LEAD Pre-Approval Simplicity Gate to database...\n');

  try {
    // Step 1: Update LEAD agent responsibilities to include pre-approval phase
    console.log('📝 Step 1: Updating LEAD agent responsibilities...');

    const leadResponsibilities = `Strategic planning, business objectives, final approval. **SIMPLICITY FIRST (PRE-APPROVAL ONLY)**: During initial SD review, challenge complexity and favor simple solutions. Ask "What's the simplest solution?" and "Why not just configure existing tools?" Apply 80/20 rule BEFORE approval. Once SD is approved, LEAD commits to full scope and verifies completion only - scope reduction post-approval is prohibited without explicit human authorization and creating new SDs for deferred work.
- **🛡️ HUMAN APPROVAL REQUIRED**: LEAD MUST request human approval before changing SD status/priority. Use standardized over-engineering rubric for evaluations. NEVER override user selections without explicit permission.
- **📋 Over-Engineering Evaluation**: Use \`scripts/lead-over-engineering-rubric.js\` for standardized assessments. Present findings to human for approval before any changes.
- **🚫 PROHIBITED**: Autonomous SD status changes, user selection overrides, subjective over-engineering calls without rubric. **🤖 MANDATORY SUB-AGENT AUTOMATION**: Before approving any SD as complete, LEAD MUST run . This automatically executes all required sub-agents (Continuous Improvement Coach for retrospectives, DevOps Platform Architect for CI/CD verification) and validates completion requirements. Failure to run this script will result in missed retrospectives and incomplete protocol execution. **✅ APPROVAL CHECKLIST**: LEAD may only approve an SD after: (1) Running  successfully, (2) Verifying output shows "✅ SD READY FOR COMPLETION", (3) Reviewing any warnings, (4) Obtaining human approval for status change.`;

    const { error: leadError } = await supabase
      .from('leo_agents')
      .update({ responsibilities: leadResponsibilities })
      .eq('agent_code', 'LEAD');

    if (leadError) {
      console.error('❌ Failed to update LEAD agent:', leadError);
      throw leadError;
    }

    console.log('✅ LEAD agent responsibilities updated');

    // Step 2: Update PLAN agent responsibilities to include escalation guidance
    console.log('\n📝 Step 2: Updating PLAN agent responsibilities...');

    const planResponsibilities = `Technical design, PRD creation with comprehensive test plans, pre-automation validation, acceptance testing. **PRAGMATIC ENGINEERING**: Use boring technology that works reliably. Prefer configuration over code, simple solutions over complex architectures. Filter sub-agent recommendations through simplicity lens. **If PRD seems over-engineered during creation, escalate to LEAD for scope reduction BEFORE proceeding to EXEC.**
- **🔍 Supervisor Mode**: Final "done done" verification with all sub-agents **🔍 CI/CD VERIFICATION**: After EXEC completion, wait 2-3 minutes for GitHub CI/CD pipelines to complete, then trigger DevOps Platform Architect to verify no pipeline failures exist before final approval.
- **🔍 Supervisor Mode**: Final "done done" verification with all sub-agents`;

    const { error: planError } = await supabase
      .from('leo_agents')
      .update({ responsibilities: planResponsibilities })
      .eq('agent_code', 'PLAN');

    if (planError) {
      console.error('❌ Failed to update PLAN agent:', planError);
      throw planError;
    }

    console.log('✅ PLAN agent responsibilities updated');

    // Step 3: Add Pre-Approval Simplicity Gate as a protocol section
    console.log('\n📝 Step 3: Adding Pre-Approval Simplicity Gate section...');

    // First, get the active protocol ID
    const { data: protocol } = await supabase
      .from('leo_protocols')
      .select('id')
      .eq('status', 'active')
      .single();

    if (!protocol) {
      throw new Error('No active protocol found');
    }

    // Get highest order_index to insert after agent responsibilities
    const { data: sections } = await supabase
      .from('leo_protocol_sections')
      .select('order_index')
      .eq('protocol_id', protocol.id)
      .order('order_index', { ascending: false })
      .limit(1);

    const nextOrder = sections && sections.length > 0 ? sections[0].order_index + 1 : 100;

    const preApprovalGateContent = `## 🛡️ LEAD Pre-Approval Simplicity Gate

### MANDATORY Before Approving ANY Strategic Directive

LEAD MUST answer these questions BEFORE approval:

1. **Need Validation**: Is this solving a real user problem or perceived problem?
2. **Simplicity Check**: What's the simplest solution that delivers core value?
3. **Existing Tools**: Can we configure existing tools instead of building new?
4. **80/20 Analysis**: Can we deliver 80% value with 20% of proposed effort?
5. **Scope Reduction**: Should this be split into multiple smaller SDs?
6. **Phase Decomposition**: Can we defer Phase 3-4 features to separate SD?

**If answers suggest over-engineering → LEAD MUST**:
- Reduce scope BEFORE approval
- Create separate SDs for deferred work
- Document rationale for scope changes
- Get human approval for major reductions

**SCOPE LOCK**: Once LEAD approves an SD, the scope is LOCKED. LEAD may NOT:
- ❌ Re-evaluate "do we really need this?" during final approval
- ❌ Apply simplicity filter after EXEC phase begins
- ❌ Defer work unilaterally during verification
- ❌ Mark SD complete if PRD requirements not met

**Exception**: LEAD may reduce scope mid-execution ONLY if:
1. Critical technical blocker discovered (impossibility)
2. External business priorities changed dramatically
3. Explicit human approval obtained
4. New SD created for all deferred work
`;

    const { error: sectionError } = await supabase
      .from('leo_protocol_sections')
      .insert({
        protocol_id: protocol.id,
        section_type: 'lead_pre_approval_simplicity_gate',
        title: '🛡️ LEAD Pre-Approval Simplicity Gate',
        content: preApprovalGateContent,
        order_index: nextOrder,
        metadata: {}
      });

    if (sectionError) {
      console.error('❌ Failed to add protocol section:', sectionError);
      throw sectionError;
    }

    console.log('✅ Pre-Approval Simplicity Gate section added');

    console.log('\n🎯 Success! All updates complete.');
    console.log('\n📋 Next steps:');
    console.log('   1. Run: node scripts/generate-claude-md-from-db.js');
    console.log('   2. Verify CLAUDE.md includes the Pre-Approval Simplicity Gate section');
    console.log('   3. Verify LEAD and PLAN agent responsibilities are correct');

  } catch (error) {
    console.error('\n❌ Restoration failed:', error);
    process.exit(1);
  }
}

restorePreApprovalGate();
