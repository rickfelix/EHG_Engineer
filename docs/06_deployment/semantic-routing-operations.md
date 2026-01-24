# Semantic Intent Routing System - Operations Guide

**Category**: Infrastructure Operations
**Status**: Active
**Version**: 1.0.0
**Author**: LEO Protocol System
**Last Updated**: 2026-01-23
**Tags**: semantic-routing, embeddings, sub-agents, skills, openai, infrastructure
**Related SD**: SD-LEO-INFRA-SEMANTIC-ROUTING-001

---

## Overview

The Semantic Intent Routing System uses OpenAI embeddings and cosine similarity to intelligently route user queries to appropriate sub-agents and detect skill invocation intent. This replaces keyword-based pattern matching with semantic understanding.

**Components**:
1. **Sub-Agent Router** (`lib/semantic-agent-router.js`) - Routes queries to sub-agents
2. **Skill Intent Detector** (`lib/skill-intent-detector.js`) - Detects skill invocation intent
3. **Embedding Generator** (`scripts/generate-subagent-embeddings.js`) - Generates domain embeddings

**Performance**: 77% accuracy on sub-agent routing (23/30 test cases), 100% on skill detection (9/9 test cases)

---

## Architecture

### How It Works

1. **Embedding Generation** (One-time setup):
   - Each sub-agent's domain description is converted to a 1536-dimension vector using OpenAI's `text-embedding-3-small` model
   - Embeddings are stored in PostgreSQL using the `pgvector` extension
   - Cost: ~$0.0001 per 26 sub-agents

2. **Query Routing** (Runtime):
   - User query is converted to an embedding
   - Cosine similarity calculated against all sub-agent embeddings
   - Top 5 matches above 35% threshold returned
   - Results ranked by similarity score

3. **Skill Detection** (Runtime):
   - Skill patterns pre-generated into embeddings (cached)
   - User message compared semantically + exact pattern bonus
   - Top match above 45% threshold triggers skill invocation

### Data Flow

```
User Query
    ↓
[Generate Query Embedding via OpenAI]
    ↓
[Load Sub-Agent Embeddings from DB]
    ↓
[Calculate Cosine Similarity]
    ↓
[Filter by 35% Threshold]
    ↓
[Return Top 5 Matches]
```

---

## Configuration

### Environment Variables

Required in `.env`:
```bash
# OpenAI API Key (required for embedding generation)
OPENAI_API_KEY=sk-...

# Supabase (required for database access)
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
```

### Tunable Parameters

**Sub-Agent Router** (`lib/semantic-agent-router.js`):
```javascript
const SIMILARITY_THRESHOLD = 0.35; // 35% - Lower = more permissive
const TOP_K = 5; // Return top 5 matches
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
```

**Skill Intent Detector** (`lib/skill-intent-detector.js`):
```javascript
const SIMILARITY_THRESHOLD = 0.45; // 45% - Higher for precision
const EXACT_MATCH_BONUS = 0.2; // 20% bonus for exact pattern match
```

**Tuning Guidance**:
- **Lower threshold** → More matches, higher recall, more false positives
- **Higher threshold** → Fewer matches, higher precision, may miss valid queries
- **Current 35%/45%** → Balanced based on empirical testing

---

## Operations

### Initial Setup

1. **Generate Sub-Agent Embeddings**:
   ```bash
   node scripts/generate-subagent-embeddings.js
   ```

   **Expected Output**:
   ```
   ════════════════════════════════════════════════════════════
     Sub-Agent Domain Embedding Generator
   ════════════════════════════════════════════════════════════

   Generating embeddings for 26 sub-agents...
   ✅ Generated 26 embeddings
   💰 Cost: $0.0001

   Coverage: 26/26 (100%)
   ```

2. **Verify Database Storage**:
   ```bash
   node -e "
   const { createClient } = require('@supabase/supabase-js');
   require('dotenv').config();
   const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
   supabase.from('leo_sub_agents')
     .select('code', { count: 'exact' })
     .not('domain_embedding', 'is', null)
     .then(({count}) => console.log('Embeddings stored:', count));
   "
   ```

### Testing

**Sub-Agent Routing Test**:
```bash
node lib/semantic-agent-router.js --test
```

**Expected Output**:
```
🧪 Semantic Agent Router - Test Results
══════════════════════════════════════════════════════════════════

📝 Query: "identify the root cause of this bug"
──────────────────────────────────────────────
   1. RCA (58%) - Root Cause Analysis Agent
   2. TESTING (42%) - QA Engineering Director

📝 Query: "analyze performance bottlenecks"
──────────────────────────────────────────────
   1. PERFORMANCE (50%) - Performance Agent
   2. MONITORING (38%) - Monitoring Agent
```

**Skill Detection Test**:
```bash
node lib/skill-intent-detector.js --test
```

**Expected Output**:
```
🎯 Skill Intent Detector - Test Results
══════════════════════════════════════════════════════════════════

💬 Message: "yes, create the SD"
──────────────────────────────────────────────
   ✅ Detected: /leo create (57%)
      Semantic: 57% | Exact: No
```

**Single Query Test**:
```bash
# Test sub-agent routing
node lib/semantic-agent-router.js "why is this authentication failing"

# Test skill detection
node lib/skill-intent-detector.js "lets ship this code"
```

### Monitoring

**Check Embedding Coverage**:
```bash
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('leo_sub_agents')
  .select('code, domain_embedding')
  .eq('active', true)
  .then(({data}) => {
    const total = data.length;
    const withEmbedding = data.filter(a => a.domain_embedding).length;
    console.log(\`Coverage: \${withEmbedding}/\${total} (\${Math.round(withEmbedding/total*100)}%)\`);
    const missing = data.filter(a => !a.domain_embedding).map(a => a.code);
    if (missing.length > 0) console.log('Missing:', missing.join(', '));
  });
"
```

**Cache Hit Rate** (via application logs):
- Look for "Generating skill pattern embeddings..." - should only appear once per session
- Agent embeddings cache logs: "Loaded N agents from cache"

### Maintenance

**When to Regenerate Embeddings**:
1. **New sub-agent added** - Run embedding generator
2. **Domain description updated** - Regenerate affected agent
3. **Skill patterns changed** - Restart application to reload cache

**Regenerate Single Sub-Agent** (manual database update):
```javascript
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const domainText = "Your updated domain description here...";

const response = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: domainText
});

await supabase
  .from('leo_sub_agents')
  .update({ domain_embedding: response.data[0].embedding })
  .eq('code', 'YOUR_AGENT_CODE');
```

---

## Troubleshooting

### Issue: "No matches found above threshold"

**Symptoms**: All queries return empty results

**Causes**:
1. Threshold too high (65% instead of 35%)
2. Embeddings not generated
3. Query too vague/short

**Solutions**:
```bash
# 1. Check coverage
node -e "/* coverage check script above */"

# 2. Test with known query
node lib/semantic-agent-router.js "identify the root cause"

# 3. Lower threshold temporarily for debugging
# Edit lib/semantic-agent-router.js: SIMILARITY_THRESHOLD = 0.25
```

### Issue: "Vector parsing error"

**Symptoms**: `cosineSimilarity` returns 0 for all comparisons

**Cause**: PostgreSQL `pgvector` returns embeddings as strings `"[x,y,z]"` not arrays

**Solution**: Already handled by `parseVector()` function. If error persists:
```javascript
// Verify vector format in database
const { data } = await supabase
  .from('leo_sub_agents')
  .select('domain_embedding')
  .limit(1)
  .single();

console.log('Type:', typeof data.domain_embedding);
console.log('Sample:', data.domain_embedding.substring(0, 50));
// Should show: Type: string, Sample: [0.123,-0.456,0.789,...]
```

### Issue: OpenAI API rate limit exceeded

**Symptoms**: `429 Too Many Requests` error during embedding generation

**Cause**: Too many concurrent embedding requests

**Solution**: Embeddings are generated sequentially. If still hitting limits:
1. Check API quota: https://platform.openai.com/account/usage
2. Add delay between requests:
   ```javascript
   await new Promise(resolve => setTimeout(resolve, 1000)); // 1s delay
   ```

### Issue: Incorrect routing (wrong sub-agent selected)

**Symptoms**: Query routes to unexpected sub-agent

**Example**: "review authentication flow" → UAT (36%) instead of SECURITY

**Diagnosis**:
```bash
# Get all scores for query
node lib/semantic-agent-router.js "your query here" | head -20
```

**Solutions**:
1. **If top match is correct but low score**: Lower threshold
2. **If wrong agent has higher score**: Update domain descriptions to differentiate
3. **If ambiguous query**: Add more context to query

**Acceptable False Positives**: 77% accuracy means ~23% may be misrouted. This is acceptable given semantic ambiguity.

---

## Integration

### CLAUDE.md Integration

The semantic routing system is referenced in:
- **Sub-Agent Trigger Keywords** section (CLAUDE.md)
- **Skill Intent Detection** section (CLAUDE.md)

**How It Works**:
1. User query enters Claude Code
2. Semantic router runs in background
3. Top matches presented to Claude
4. Claude uses results to invoke appropriate sub-agents/skills

### Task Tool Integration

```javascript
// Example: Using semantic routing results
const router = new SemanticAgentRouter();
const matches = await router.route("why is the database slow");

// Top match: PERFORMANCE (50%)
// Invoke performance sub-agent
await Task({
  subagent_type: matches[0].code,
  prompt: "Analyze database performance issues",
  description: "Performance analysis"
});
```

### Skill Tool Integration

```javascript
// Example: Using skill detection results
const detector = new SkillIntentDetector();
const result = await detector.detect("yes, create the SD");

// Detected: /leo create (57%)
// Invoke skill
if (result) {
  await Skill({
    skill: result.skill,
    args: ""
  });
}
```

---

## Performance Metrics

### Accuracy (Test Results)

**Sub-Agent Routing** (30 test queries):
- **Passed**: 23/30 (77%)
- **Failed**: 1/30 (3%)
- **No Match**: 6/30 (20%)

**Skill Detection** (9 test queries):
- **Passed**: 9/9 (100%)
- **Failed**: 0/9 (0%)

### Latency

**Embedding Generation** (one-time):
- 26 sub-agents: ~5 seconds
- Single embedding: ~200ms

**Query Routing** (per request):
- With cache: ~100ms (OpenAI API only)
- Without cache: ~250ms (API + DB load)

**Skill Detection** (per request):
- First request: ~300ms (generates pattern embeddings)
- Subsequent: ~100ms (cached)

### Cost

**Embedding Generation**:
- Model: `text-embedding-3-small`
- Rate: $0.02 per 1M tokens
- 26 sub-agents (~15k tokens): **$0.0001**
- Skill patterns (~8k tokens): **$0.00016**

**Query Routing**:
- Per query: ~100 tokens
- 1000 queries: **$0.002**

**Total Monthly Estimate** (1000 queries/day):
- Generation: $0.0001 (one-time)
- Queries: $60 (30k queries)

---

## Database Schema

### leo_sub_agents Table

```sql
CREATE TABLE leo_sub_agents (
  id UUID PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT,
  description TEXT,
  priority INTEGER,
  domain_embedding vector(1536),  -- OpenAI embedding
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leo_sub_agents_active
  ON leo_sub_agents(active)
  WHERE active = true;
```

**Vector Storage**:
- PostgreSQL `pgvector` extension
- Dimension: 1536 (text-embedding-3-small)
- Storage format: String representation `"[x,y,z,...]"`

---

## Known Limitations

1. **Short/Vague Queries**:
   - "why is this slow" → No match (too generic)
   - Solution: Provide more context in query

2. **Semantic Ambiguity**:
   - "review authentication flow" could be SECURITY or UAT
   - Current: Routes to UAT (36%)
   - Acceptable given context overlap

3. **Threshold Trade-off**:
   - 35% threshold balances recall vs precision
   - Lower → More false positives
   - Higher → More false negatives (no match)

4. **Cache Invalidation**:
   - Skill pattern cache persists for session
   - Changes to `SKILL_PATTERNS` require restart
   - Solution: Add cache TTL or reload mechanism

---

## Future Enhancements

### Short-Term
- [ ] Add cache TTL for skill patterns (currently session-persistent)
- [ ] Implement hybrid scoring (semantic + keyword boost)
- [ ] Add confidence thresholds per sub-agent type

### Medium-Term
- [ ] Track routing accuracy metrics in database
- [ ] A/B test different thresholds
- [ ] User feedback loop (correct/incorrect routing)

### Long-Term
- [ ] Fine-tune custom embedding model on LEO data
- [ ] Multi-agent routing (return multiple agents for complex queries)
- [ ] Contextual routing (consider conversation history)

---

## References

### Related Documentation
- **Keyword-Based Triggering**: `docs/reference/preventing-missed-subagents.md`
- **Sub-Agent System**: CLAUDE.md (Sub-Agent Trigger Keywords section)
- **Skill System**: CLAUDE.md (Skill Intent Detection section)

### Source Files
- **Sub-Agent Router**: `lib/semantic-agent-router.js` (272 lines)
- **Skill Detector**: `lib/skill-intent-detector.js` (411 lines)
- **Embedding Generator**: `scripts/generate-subagent-embeddings.js` (updated)

### External Dependencies
- **OpenAI API**: https://platform.openai.com/docs/api-reference/embeddings
- **PostgreSQL pgvector**: https://github.com/pgvector/pgvector
- **Cosine Similarity**: https://en.wikipedia.org/wiki/Cosine_similarity

---

**Deployment Status**: ✅ Active (Deployed 2026-01-23)
**Monitoring**: Manual testing via CLI commands
**Support**: See Troubleshooting section above
