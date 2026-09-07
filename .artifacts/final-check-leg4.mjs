import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY);
const r1 = await supabase.from("sub_agent_execution_results").select("id, sub_agent_code, phase, verdict, confidence, created_at, updated_at").eq("id", "a04c8380-ee85-4332-bccd-d524aa2598b9").single();
const r2 = await supabase.from("retrospectives").select("id, sd_id, retro_type, status, quality_score, generated_by, created_at, updated_at, key_learnings, action_items, success_patterns, failure_patterns").eq("id", "8fa57b2f-ed34-4da1-ba23-331b0535a769").single();
console.log("RETRO evidence row:", JSON.stringify(r1.data, null, 2));
console.log("Retrospective row summary:", JSON.stringify({
  id: r2.data.id, status: r2.data.status, quality_score: r2.data.quality_score,
  generated_by: r2.data.generated_by, created_at: r2.data.created_at, updated_at: r2.data.updated_at,
  key_learnings_count: r2.data.key_learnings.length, action_items_count: r2.data.action_items.length,
  success_patterns_count: r2.data.success_patterns.length, failure_patterns_count: r2.data.failure_patterns.length
}, null, 2));
