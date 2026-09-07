require('dotenv').config();
const {createClient}=require('@supabase/supabase-js');
const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
const {data}=await s.from('product_requirements_v2').select('*').order('created_at',{ascending:false}).limit(1);
console.log('cols:', data&&data[0]?Object.keys(data[0]):[]);
const {data:us}=await s.from('user_stories').select('*').limit(1);
console.log('user_stories cols:', us&&us[0]?Object.keys(us[0]):[]);
})();
