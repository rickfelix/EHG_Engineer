import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY);
const { data } = await supabase.from("sd_phase_handoffs").select("handoff_type, status, created_at, accepted_at").eq("sd_id", "89c9c119-611f-4801-bf19-9a9d98751bfe").order("created_at", {ascending:true});
console.log(JSON.stringify(data, null, 2));
