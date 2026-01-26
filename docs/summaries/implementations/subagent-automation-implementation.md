# Sub-Agent Automation Implementation Plan


## Metadata
- **Category**: Report
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, testing, migration, security

**Created**: 2025-10-01
**Status**: READY TO IMPLEMENT
**Purpose**: Fully automate sub-agent triggering to prevent misses

---

## 🎯 Current vs. Target State

### Current State (Semi-Automated)
```
SD status changes → MANUAL checklist → MANUAL activation → Sub-agent runs
     ❌                  ❌                  ❌                 ✅
```

### Target State (Fully Automated)
```
SD status changes → DATABASE TRIGGER → QUEUE CREATED → WORKER PROCESSES
     ✅                   ✅                ✅               ✅
```

---

## 📋 Implementation Steps

### Phase 1: Database Setup (30 minutes)

**1. Apply Migration**
```bash
psql $DATABASE_URL -f database/migrations/create-subagent-automation.sql
```

**Creates**:
- `sub_agent_queue` table - Queue for required activations
- `trigger_subagents_on_sd_status_change()` - Automatic queuing on status change
- `validate_lead_approval()` - Blocks approval if incomplete
- `v_pending_subagent_work` - Dashboard view

**2. Verify Installation**
```sql
SELECT * FROM v_pending_subagent_work;
SELECT validate_lead_approval('some-sd-uuid');
```

### Phase 2: Worker Setup (15 minutes)

**1. Install Dependencies**
```bash
npm install --save-dev node-cron
```

**2. Test Worker Manually**
```bash
# Process queue once
node scripts/subagent-worker.js once

# Check queue status
node scripts/subagent-worker.js status

# Run continuously (development)
node scripts/subagent-worker.js continuous 30
```

### Phase 3: Dashboard Integration (2 hours)

**1. Add Queue Status Component**
```jsx
// src/client/src/components/SubAgentQueue.jsx
import { useQuery } from '@tanstack/react-query';

export function SubAgentQueue({ sdId }) {
  const { data } = useQuery({
    queryKey: ['subagent-queue', sdId],
    queryFn: async () => {
      const { data } = await supabase
        .from('v_pending_subagent_work')
        .select('*')
        .eq('sd_id', sdId);
      return data;
    }
  });

  if (!data || data.length === 0) return <Badge>✅ All Complete</Badge>;

  return (
    <Alert variant="warning">
      <AlertTitle>⚠️ Pending Sub-Agents</AlertTitle>
      <ul>
        {data.map(task => (
          <li key={task.queue_id}>{task.sub_agent_code}</li>
        ))}
      </ul>
    </Alert>
  );
}
```

**2. Add Approval Blocker**
```jsx
// In LEAD approval component
const { data: validation } = useQuery({
  queryKey: ['validate-approval', sdId],
  queryFn: async () => {
    const { data } = await supabase
      .rpc('validate_lead_approval', { p_sd_id: sdId });
    return data[0];
  }
});

if (!validation?.can_approve) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Cannot Approve</AlertTitle>
      <AlertDescription>
        {validation?.blocking_reason}
        <ul>
          {validation?.pending_subagents?.map(sa => <li>{sa}</li>)}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
```

### Phase 4: Production Deployment (1 hour)

**1. Add Worker to package.json**
```json
{
  "scripts": {
    "worker:subagents": "node scripts/subagent-worker.js continuous 60",
    "worker:subagents:once": "node scripts/subagent-worker.js once"
  }
}
```

**2. Setup Cron Job (Linux/Mac)**
```bash
# Run worker every 5 minutes
crontab -e

# Add line:
*/5 * * * * cd /path/to/EHG_Engineer && node scripts/subagent-worker.js once >> logs/worker.log 2>&1
```

**3. Setup Windows Task Scheduler**
```powershell
# Create scheduled task
$action = New-ScheduledTaskAction -Execute "node" -Argument "scripts/subagent-worker.js once" -WorkingDirectory "C:\_EHG\EHG_Engineer"
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5)
Register-ScheduledTask -Action $action -Trigger $trigger -TaskName "SubAgentWorker"
```

**4. Docker/Production**
```dockerfile
# Add to Dockerfile
CMD ["sh", "-c", "node server.js & node scripts/subagent-worker.js continuous 60"]
```

---

## 🔄 How It Works

### Automatic Triggering

**1. User marks SD as completed**
```sql
UPDATE strategic_directives_v2
SET status = 'completed', progress = 100
WHERE id = 'some-uuid';
```

**2. Database trigger fires automatically**
```
trigger_subagents_on_sd_status_change()
  → Detects status change to 'completed'
  → Calls queue_required_subagents(sd_id, 'SD_STATUS_COMPLETED')
  → Inserts into sub_agent_queue:
    - CONTINUOUS_IMPROVEMENT_COACH (priority 9)
    - DEVOPS_PLATFORM_ARCHITECT (priority 8)
```

**3. Worker picks up tasks**
```
Worker polls every 60 seconds
  → Fetches tasks from v_pending_subagent_work
  → Executes scripts/generate-retrospective.js
  → Marks task as 'completed' with results
  → Stores result in sub_agent_queue.result
```

**4. Dashboard shows real-time status**
```
SubAgentQueue component
  → Queries v_pending_subagent_work
  → Shows pending tasks with progress
  → Updates when worker completes tasks
```

### Approval Validation

**When LEAD tries to approve**:
```sql
SELECT validate_lead_approval('sd-uuid');

-- Returns:
-- can_approve: false
-- blocking_reason: "Required sub-agents not completed"
-- pending_subagents: ["CONTINUOUS_IMPROVEMENT_COACH"]
```

**Dashboard blocks approval button** until all tasks complete.

---

## 🎛️ Configuration

### Adding New Sub-Agent Triggers

**1. Edit migration file**:
```sql
-- In queue_required_subagents function
IF p_trigger_event IN ('NEW_TRIGGER_EVENT') THEN
  INSERT INTO sub_agent_queue (sd_id, sub_agent_code, trigger_event, priority)
  VALUES (p_sd_id, 'NEW_SUB_AGENT', p_trigger_event, 7);
END IF;
```

**2. Add script mapping**:
```javascript
// In subagent-worker.js
const SUB_AGENT_SCRIPTS = {
  'NEW_SUB_AGENT': 'scripts/new-subagent-script.js',
  // ... existing mappings
};
```

### Adjusting Priority

Priority scale: 1-10 (10 = highest)
- 9-10: Critical (retrospectives, security)
- 7-8: High (DevOps, QA)
- 5-6: Medium (Design, Systems)
- 3-4: Low (Documentation)
- 1-2: Optional (Notifications)

---

## 📊 Monitoring

### Check Queue Status
```bash
node scripts/subagent-worker.js status
```

### View Pending Tasks
```sql
SELECT * FROM v_pending_subagent_work;
```

### Check Failed Tasks
```sql
SELECT *
FROM sub_agent_queue
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 10;
```

### Retry Failed Task
```sql
UPDATE sub_agent_queue
SET status = 'pending', error_message = NULL
WHERE id = 'failed-task-uuid';
```

---

## ⚠️ Important Considerations

### 1. Worker Must Be Running
- Cron job or continuous process required
- No tasks process if worker is down
- Monitor worker health

### 2. Script Availability
- All scripts in `SUB_AGENT_SCRIPTS` must exist
- Scripts must accept SD UUID as argument
- Scripts should output JSON for result tracking

### 3. Error Handling
- Failed tasks remain in queue with error message
- Manual intervention may be needed
- Dashboard should show failed tasks

### 4. Performance
- Worker processes tasks sequentially
- High-priority tasks processed first
- Adjust polling interval based on load

---

## 🚀 Rollout Plan

### Week 1: Development Environment
- [ ] Apply database migration
- [ ] Test worker manually
- [ ] Verify trigger automation
- [ ] Create dashboard components

### Week 2: Integration Testing
- [ ] Test with real SD lifecycle
- [ ] Verify approval blocking
- [ ] Test error handling
- [ ] Monitor queue performance

### Week 3: Production Deployment
- [ ] Deploy database changes
- [ ] Setup cron job/scheduled task
- [ ] Deploy dashboard updates
- [ ] Monitor first automated runs

### Week 4: Validation
- [ ] Review automated retrospectives
- [ ] Check DevOps verifications
- [ ] Analyze any failures
- [ ] Tune priorities/intervals

---

## ✅ Success Criteria

**Automation is successful when**:
1. ✅ SD status change → queue entry created (no manual step)
2. ✅ Worker processes tasks automatically
3. ✅ Retrospectives generated without human intervention
4. ✅ DevOps verifications run on every implementation
5. ✅ LEAD cannot approve with pending sub-agents
6. ✅ Zero missed sub-agents in 30-day period

---

## 📞 Support

**Issues with automation**:
1. Check worker logs: `tail -f logs/worker.log`
2. Check queue: `node scripts/subagent-worker.js status`
3. Verify database trigger: `SELECT * FROM sub_agent_queue`
4. Manual override: Run specific sub-agent script directly

**Emergency bypass** (use sparingly):
```sql
-- Mark all pending tasks as completed (DO NOT USE IN PRODUCTION)
UPDATE sub_agent_queue
SET status = 'completed', completed_at = NOW()
WHERE status = 'pending' AND sd_id = 'emergency-sd-uuid';
```

---

**Last Updated**: 2025-10-01
**Next Review**: After 30-day trial period
**Owner**: CONTINUOUS_IMPROVEMENT_COACH
