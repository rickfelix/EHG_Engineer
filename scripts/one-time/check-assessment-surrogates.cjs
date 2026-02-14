/**
 * Check AI quality assessments for surrogate issues
 */
require('dotenv').config();
const {createClient} = require('@supabase/supabase-js');
const c = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async() => {
  const {data} = await c.from('ai_quality_assessments')
    .select('id, content_type, content_id, feedback, confidence_reasoning, scores')
    .order('assessed_at', {ascending: false})
    .limit(20);

  if (!data) return;

  let totalIssues = 0;
  data.forEach(a => {
    const fullStr = JSON.stringify(a);
    let surrogates = 0;
    let nonBMP = 0;
    for (let i = 0; i < fullStr.length; i++) {
      const code = fullStr.charCodeAt(i);
      if (code >= 0xD800 && code <= 0xDBFF) {
        const next = fullStr.charCodeAt(i + 1);
        if (!(next >= 0xDC00 && next <= 0xDFFF)) {
          surrogates++;
        } else {
          nonBMP++;
          i++;
        }
      } else if (code >= 0xDC00 && code <= 0xDFFF) {
        const prev = fullStr.charCodeAt(i - 1);
        if (!(prev >= 0xD800 && prev <= 0xDBFF)) surrogates++;
      }
    }
    totalIssues += surrogates;
    if (surrogates > 0 || nonBMP > 0) {
      console.log(a.content_type, a.content_id?.substring(0, 20),
        'surrogates:', surrogates, 'nonBMP_emoji:', nonBMP, 'size:', fullStr.length);
    }
  });
  console.log('Total surrogate issues:', totalIssues);
  console.log('Checked', data.length, 'records');
})();
