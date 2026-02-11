# ⚠️ MANUAL DATABASE MIGRATION REQUIRED


## Metadata
- **Category**: Database
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, migration, sd, directive

**Why**: Supabase anon key doesn't have permissions to create tables directly.
**Time**: 5 minutes
**Priority**: CRITICAL for automation

---

## 📋 Step-by-Step Instructions

### Step 1: Access Supabase Dashboard
1. Go to: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq
2. Log in with your credentials
3. Click "SQL Editor" in the left sidebar

### Step 2: Create Sub-Agent Queue Table
Copy and paste this SQL into the editor:

```sql
-- Create sub-agent queue table
CREATE TABLE IF NOT EXISTS sub_agent_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id UUID REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
  sub_agent_code TEXT NOT NULL,
  trigger_event TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result JSONB,
  error_message TEXT
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_subagent_queue_status ON sub_agent_queue(status);
CREATE INDEX IF NOT EXISTS idx_subagent_queue_sd ON sub_agent_queue(sd_id);
CREATE INDEX IF NOT EXISTS idx_subagent_queue_priority ON sub_agent_queue(priority DESC, created_at ASC);

-- Create view for pending work
CREATE OR REPLACE VIEW v_pending_subagent_work AS
SELECT
  q.id as queue_id,
  q.sd_id,
  sd.sd_key,
  sd.title as sd_title,
  sd.status as sd_status,
  q.sub_agent_code,
  q.trigger_event,
  q.status as queue_status,
  q.priority,
  q.created_at,
  q.started_at,
  EXTRACT(EPOCH FROM (NOW() - q.created_at))/3600 as hours_pending
FROM sub_agent_queue q
JOIN strategic_directives_v2 sd ON q.sd_id = sd.id
WHERE q.status IN ('pending', 'in_progress')
ORDER BY q.priority DESC, q.created_at ASC;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON sub_agent_queue TO anon, authenticated;
GRANT SELECT ON v_pending_subagent_work TO anon, authenticated;

-- Confirm installation
SELECT 'Sub-agent automation tables created successfully!' as status;
```

### Step 3: Execute
1. Click the green "Run" button (or press Ctrl+Enter)
2. You should see: "Sub-agent automation tables created successfully!"
3. If you see any errors, copy them and show me

### Step 4: Verify
Run this query to confirm:
```sql
SELECT * FROM sub_agent_queue LIMIT 1;
SELECT * FROM v_pending_subagent_work LIMIT 1;
```

Both should return empty results (no error).

### Step 5: Return Here
Once complete, tell me "migration done" and I'll continue with the automation setup!

---

## 🔮 What Happens Next (Automatic)

After you complete this manual step, I will:
1. ✅ Test the queue system
2. ✅ Create sub-agent execution scripts
3. ✅ Setup the worker process
4. ✅ Integrate with dashboard
5. ✅ Test end-to-end automation

---

## ❓ Troubleshooting

**Error: "permission denied"**
- Make sure you're logged in as the project owner
- Try from the SQL Editor, not the Table Editor

**Error: "table already exists"**
- Great! Skip to Step 4 to verify it works

**Can't find SQL Editor**
- Look for "SQL Editor" in left sidebar under "Database" section
- Or go directly to: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql

---

**Created**: 2025-10-01
**Estimated Time**: 5 minutes
**Blocking**: Full automation implementation
