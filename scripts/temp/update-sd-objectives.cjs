require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const sdId = process.argv[2];

const strategicObjectives = [
  {
    objective: "Prevent PRD scope drift by grounding requirements in source SD",
    rationale: "LLM-generated PRDs drift from original SD intent when context is lost. Grounding validation ensures requirements trace back to source documents.",
    success_metric: "80% reduction in PRD rework due to scope drift",
    alignment: "Quality-first execution philosophy"
  },
  {
    objective: "Add implementation context to SD schema for type-aware PRD generation",
    rationale: "Distinguishing CLI/web/API/database context prevents hallucinated UI requirements for CLI work and vice versa.",
    success_metric: "100% of new SDs specify implementation_context field",
    alignment: "Database-first approach"
  },
  {
    objective: "Create transparent flagging mechanism for ungrounded requirements",
    rationale: "Rather than hard-blocking PRDs, flag ungrounded items with confidence scores for human review.",
    success_metric: "All ungrounded requirements flagged with confidence < 0.7",
    alignment: "Human-in-the-loop validation"
  }
];

supabase.from('strategic_directives_v2')
  .update({
    strategic_objectives: strategicObjectives,
    status: 'active'
  })
  .eq('id', sdId)
  .select()
  .single()
  .then(function(result) {
    if (result.error) {
      console.error('Error:', result.error.message);
      process.exit(1);
    }
    console.log('SD updated with strategic objectives');
    console.log('ID:', result.data.id);
    console.log('Status:', result.data.status);
    console.log('Strategic Objectives:', result.data.strategic_objectives.length);
  });
