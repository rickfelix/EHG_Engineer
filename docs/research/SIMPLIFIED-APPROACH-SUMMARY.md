# Simplified Haiku-First Approach (Final)

**Status**: Finalized and ready for implementation
**Complexity**: LOW (static configuration)
**Decision Fatigue**: ZERO (no runtime decisions)
**Implementation Time**: ~1.25 hours

---

## Core Principle

**No runtime escalation logic. Pure static model assignment.**

```
Model Selection Rule:
  model = PHASE_MODEL_OVERRIDES[phase][agent]

That's it.
```

---

## How It Works

### 1. The Lookup Table (The Entire System)

```javascript
const PHASE_MODEL_OVERRIDES = {
  LEAD: {
    GITHUB: 'haiku',
    DOCMON: 'haiku',
    RETRO: 'haiku',
    VALIDATION: 'haiku',
    QUICKFIX: 'haiku',
    RISK: 'sonnet',
    STORIES: 'sonnet',
    API: 'sonnet',
    DESIGN: 'sonnet',
    SECURITY: 'opus',
  },
  // ... PLAN and EXEC follow same pattern
};
```

When `github-agent` runs in `LEAD` phase:
- System looks up: `PHASE_MODEL_OVERRIDES['LEAD']['GITHUB']`
- Returns: `'haiku'`
- Uses Haiku. Done.

### 2. Token Logging (Track What Actually Happened)

```bash
# After LEAD phase completes
$ node scripts/token-logger.js --sd SD-XYZ --phase LEAD --tokens 42000

Output:
✅ Logged: SD-XYZ (LEAD) - 42,000 tokens
   Weekly total: 42,000 / 500,000 (8.4%) [🟢 GREEN]
```

That's it. Chairman manually logs tokens at phase boundaries. Simple.

### 3. Weekly Calibration (The Only "Decision Point")

**If output quality is bad**:

```
Week 1: testing-agent (EXEC) using Sonnet produced incomplete test coverage

Chairman notes: "Testing needs better reasoning"

Week 2: Update PHASE_MODEL_OVERRIDES
        EXEC: { TESTING: 'opus' }  // Changed from 'sonnet'

        $ git commit -am "calibration: testing-agent exec upgraded to opus"

Week 3+: New assignment is live
```

**That's the only decision point.** Once a week. Simple.

---

## User Experience (Simplified)

### Monday Morning
```bash
$ npm run sd:next
# System recommends model allocation based on static assignments
# "GITHUB in LEAD = Haiku, TESTING in PLAN = Sonnet, SECURITY in EXEC = Opus"

$ npm run approve-sd SD-USER-DASHBOARD
```

### During SD
```bash
# At phase boundaries, log tokens
$ node scripts/token-logger.js --sd SD-USER-DASHBOARD --phase LEAD --tokens 42000
$ node scripts/token-logger.js --sd SD-USER-DASHBOARD --phase PLAN --tokens 76000
$ node scripts/token-logger.js --sd SD-USER-DASHBOARD --phase EXEC --tokens 58000
```

### If Output Quality is Bad
```
Chairman thinks: "Testing output was incomplete. Let me check the assignment."

EXEC: { TESTING: 'sonnet' }

"Ah, testing-agent is using Sonnet in EXEC. But the output suggests it needs Opus."

Makes note: "Testing-agent should use Opus for edge case detection"

Next week: Updates assignment and commits it
```

### No Manual Escalations
No decisions like:
- ❌ "Should I escalate Haiku to Sonnet?"
- ❌ "Is this Haiku output good enough?"
- ❌ "Which model should I use for this?"

Just: ✅ Use the assigned model, log the tokens, monitor results.

---

## The 6 MVP Tasks (1.25 Hours)

| Task | Effort | What It Does |
|------|--------|-------------|
| 1. Update PHASE_MODEL_OVERRIDES | 15 mins | Static lookup table with Haiku defaults |
| 2. Create token-logger.js | 15 mins | Manual token logging at phase boundaries |
| 3. Create budget-status.js | 25 mins | Traffic-light budget display |
| 4. Update CLAUDE.md | 10 mins | Document model assignments |
| 5. Create quick reference | 10 mins | Chairman's cheat sheet |
| 6. Update .gitignore | 2 mins | Ignore .token-log.json |
| **TOTAL** | **77 mins** | **~1.25 hours** |

---

## Model Assignments (Static)

### TIER 1: Haiku Default

| Agent | LEAD | PLAN | EXEC |
|-------|------|------|------|
| GITHUB | Haiku | Haiku | Haiku |
| DOCMON | Haiku | Haiku | Haiku |
| RETRO | Haiku | - | Sonnet |
| VALIDATION | Haiku | Sonnet | Opus |
| QUICKFIX | Haiku | - | Haiku |

### TIER 2: Sonnet Default

| Agent | LEAD | PLAN | EXEC |
|-------|------|------|------|
| TESTING | Sonnet | Sonnet | Sonnet |
| DESIGN | Sonnet | Sonnet | Sonnet |
| DATABASE | - | Sonnet | - |
| API | Sonnet | Sonnet | - |
| STORIES | Sonnet | Sonnet | - |
| RISK | Sonnet | Sonnet | - |
| PERFORMANCE | - | - | Sonnet |
| DEPENDENCY | - | Sonnet | Sonnet |

### TIER 3: Opus Only

| Agent | LEAD | PLAN | EXEC |
|-------|------|------|------|
| SECURITY | Opus | Opus | Opus |

---

## Weekly Budget Zones (Information Only)

Budget status is **displayed but not enforced** in MVP:

```
🟢 GREEN   (0-70%)   → "Use models per assignment freely"
🟡 YELLOW  (70-85%)  → "Monitor burn rate"
🟠 ORANGE  (85-95%)  → "Consider deferring non-critical SDs"
🔴 RED     (95%+)    → "Budget nearly exhausted, pause work"
```

Chairman uses this info to make decisions about whether to start a new SD, but the system doesn't prevent or escalate based on budget.

---

## Success Metrics (Week 1)

After first 2-3 SDs, verify:

- ✅ System uses assigned models correctly
- ✅ Token logging is accurate
- ✅ Budget display is correct
- ✅ Chairman sees no decision fatigue (just logs tokens)

If all green → proceed to Week 2 refinements

---

## Future Enhancements (Weeks 2-4)

**Not in MVP, but possible enhancements**:

- Auto-logging (agents log tokens automatically, not manual)
- Forecast model (predict if you'll exceed budget this week)
- Dashboard web interface (nicer visualization)
- Learning loops (analyze which assignments worked well)

But MVP is intentionally minimal: just the lookup table + manual logging.

---

## FAQ

**Q: What if Haiku produces bad output?**
A: Use Sonnet next time for that agent. Update PHASE_MODEL_OVERRIDES, commit it, it's live next week.

**Q: Can Chairman override the model for a specific SD?**
A: Not in MVP. System uses the static assignment. If assignment is wrong, update it for next week.

**Q: What if budget runs out mid-week?**
A: Chairman sees RED zone, decides whether to keep working or defer. System doesn't force a decision.

**Q: How often do we update the assignments?**
A: Weekly calibration. Review logs, note which agents had issues, update PHASE_MODEL_OVERRIDES if patterns emerge.

**Q: Won't we run out of Opus budget?**
A: No. Opus is only used for security (5-10% of work). The constraint is actually managing when to use Sonnet vs Haiku.

---

## Commits You'll Make (After Implementation)

**First commit**:
```
git commit -am "feat: haiku-first model allocation

- Update PHASE_MODEL_OVERRIDES with Haiku defaults (Tier 1)
- Add token logging infrastructure (manual)
- Add budget status display (traffic-light)
- Document model assignments in CLAUDE.md
```

**Example Week 2 commit** (after observing patterns):
```
git commit -am "calibration: adjust model assignments based on week 1 data

- testing-agent EXEC: upgraded sonnet -> opus (edge case detection)
- retro-agent PLAN: moved from haiku -> sonnet (context understanding)
- github-agent: all phases remain haiku (no issues observed)
```

---

## The Philosophy

> **Trust the static assignment, monitor the results, update weekly if needed.**

No runtime decisions. No decision fatigue. Just a lookup table that's reviewed and refined each week based on observed patterns.

This approach works because:
1. **Predictable** - Same agent × phase always uses same model
2. **Debuggable** - Easy to see why a model was chosen (just look at the table)
3. **Updateable** - Change one line in the table, redeploy, live next week
4. **Simple** - Zero runtime logic, pure configuration

---

**Status**: READY FOR IMPLEMENTATION ✅

All research complete. Documentation clear. No ambiguity. Time to build.
