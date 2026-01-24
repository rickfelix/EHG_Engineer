/**
 * Add weighted keyword scoring section to leo_protocol_sections
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const sectionContent = {
  protocol_id: 'leo-v4-3-3-ui-parity',
  section_type: 'weighted_keyword_scoring',
  title: 'Weighted Keyword Scoring System',
  content: `## Weighted Keyword Scoring for Sub-Agent Routing

### Overview
Sub-agents are triggered using a weighted keyword scoring system that evaluates user queries against categorized keyword lists.

### Scoring Formula
\`\`\`
score = sum(matched_keyword_weights)
\`\`\`

### Weight Categories
| Category | Weight | Description |
|----------|--------|-------------|
| **PRIMARY** | 4 points | Unique to agent (e.g., "root cause" → RCA) |
| **SECONDARY** | 2 points | Strong signal (e.g., "debug", "migration") |
| **TERTIARY** | 1 point | Common terms (e.g., "issue", "problem") |

### Confidence Thresholds
| Threshold | Points | Action |
|-----------|--------|--------|
| **HIGH** | >=5 | Auto-trigger agent |
| **MEDIUM** | >=3 | Trigger if single match, suggest if multiple |
| **LOW** | >=1 | Mention for awareness |

### Examples
- "identify the root cause" → RCA (4pts primary + 1pt tertiary = 5pts = HIGH)
- "create database migration" → DATABASE (4pts primary + 2pts secondary = 6pts = HIGH)
- "this is slow" → PERFORMANCE (2pts secondary = MEDIUM)

### Keyword Storage
Keywords are stored in \`leo_sub_agents.metadata.trigger_keywords\` with structure:
\`\`\`json
{
  "primary": ["unique phrase 1", "unique phrase 2"],
  "secondary": ["strong signal 1", "strong signal 2"],
  "tertiary": ["common term 1", "common term 2"]
}
\`\`\`

### Implementation
- Scorer: \`lib/keyword-intent-scorer.js\`
- Phrase matching: Multi-word phrases matched as units
- Word boundary: Single words use word boundary matching

### Design Principles
1. **Overfit rather than underfit** - Comprehensive keywords preferred
2. **Primary uniqueness** - Primary keywords should be unique to each agent
3. **No external dependencies** - Pure keyword matching, no API calls
4. **Deterministic** - Same query always produces same result`,
  order_index: 100,
  metadata: {
    version: '1.0.0',
    created: new Date().toISOString(),
    source: 'SD-LEO-INFRA-KEYWORD-SCORING-001'
  },
  priority: 'STANDARD'
};

async function addSection() {
  const { data, error } = await supabase
    .from('leo_protocol_sections')
    .insert(sectionContent);

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  console.log('✅ Weighted keyword scoring section added to database');
}

addSection();
