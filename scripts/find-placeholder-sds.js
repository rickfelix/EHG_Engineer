import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const { data, error } = await supabase
  .from('strategic_directives_v2')
  .select('id, title, status, description')
  .order('id');

if (error) {
  console.error('❌ Error:', error);
  process.exit(1);
}

const placeholderPatterns = /TODO|PLACEHOLDER|TBD|FIXME|\[.*\]|<.*>/i;
const withPlaceholders = data.filter(sd =>
  placeholderPatterns.test(sd.title) ||
  (sd.description && placeholderPatterns.test(sd.description))
);

console.log(`\n📋 Found ${withPlaceholders.length} SDs with placeholder text:\n`);
withPlaceholders.forEach(sd => {
  const titleMatch = placeholderPatterns.test(sd.title);
  const descMatch = sd.description && placeholderPatterns.test(sd.description);
  console.log(`  • ${sd.id} (${sd.status})`);
  console.log(`    Title: ${sd.title.substring(0, 80)}`);
  if (titleMatch) console.log('    ⚠️  Title contains placeholder text');
  if (descMatch) console.log('    ⚠️  Description contains placeholder text');
  console.log('');
});

console.log('\n💡 Fix Recommendation:');
console.log('   • Review each SD and replace placeholder text with actual content');
console.log(`   • Estimated effort: ~3 minutes per SD = ${withPlaceholders.length * 3} minutes total\n`);
