# Quality Lifecycle Enhancements - Triangulation Synthesis

**Date**: 2026-01-17
**Reviewers**: Claude (Opus 4.5), OpenAI GPT-4o, AntiGravity (Gemini)
**Subject**: Enhancement Request Integration into Quality Lifecycle System

---

## Overall Scores Comparison

| Dimension | Claude | OpenAI | Gemini | Consensus |
|-----------|--------|--------|--------|-----------|
| Conceptual Clarity | 8/10 | 8/10 | 9/10 | **8.3/10** |
| Integration Complexity | Medium | Medium | Medium | **Medium** |
| Solo Entrepreneur Fit | 9/10 | 9/10 | 10/10 | **9.3/10** |
| **Recommendation** | Unified | Unified | Unified | **UNIFIED** |

**Verdict**: Complete consensus on unified approach. All three reviewers agree this is essential for a solo entrepreneur.

---

## Areas of Strong Consensus (All Three Agree)

### 1. Unified Table is Mandatory

| Claude | OpenAI | Gemini |
|--------|--------|--------|
| "Solo entrepreneur needs ONE inbox" | "Single inbox and conversion simplicity" | "Context switching between Bug DB and Idea DB is fatal" |

**Action**: Use unified table. No debate.

### 2. Type Discriminator Approach

All three recommend a `type` field to distinguish issues from enhancements:

| Claude | OpenAI | Gemini |
|--------|--------|--------|
| `type: 'issue' \| 'enhancement'` | `type: 'issue' \| 'enhancement'` | `signal_type: 'defect' \| 'enhancement' \| 'inquiry'` |

**Action**: Add type discriminator. Gemini adds 'inquiry' as third type (interesting).

### 3. Conversion = Type Change on Same Record

| Claude | OpenAI | Gemini |
|--------|--------|--------|
| "No new record created. Same ID." | "Type change with audit trail" | "Simple UPDATE signal_type query" |

**Action**: Conversion is a field update, not a data migration. Add audit fields.

### 4. Unified Triage, Divergent Criteria

| Claude | OpenAI | Gemini |
|--------|--------|--------|
| "Same mechanics, different criteria" | "Unified workflow with type-specific criteria" | "Unified Triage, Divergent Resolution" |

**Action**: One triage workflow. Issues use severity; enhancements use value/effort.

### 5. Enhancements Enter at Detection

| Claude | OpenAI | Gemini |
|--------|--------|--------|
| "Detection (same entry point)" | "Enhancements live in Detection" | "Capture (formerly Detection)" |

**Action**: Same entry point for all feedback types.

---

## Areas of Divergence

### Naming: Table Name

| Claude | OpenAI | Gemini |
|--------|--------|--------|
| `feedback` | `feedback` | `signals` |

**Gemini's argument**: "Signals" is neutral - covers noise, bugs, ideas, alerts.
**OpenAI/Claude argument**: "Feedback" is more user-friendly language.

**Synthesis**: Either works. "Signals" is more technically neutral; "feedback" is more human-readable. **Lean toward `feedback`** for user-facing simplicity.

### Naming: Command Name

| Claude | OpenAI | Gemini |
|--------|--------|--------|
| `/feedback` | `/feedback` (with `/issues` alias) | `/inbox` |

**Gemini's argument**: `/inbox` represents "the list of unprocessed things" - like an email inbox.
**OpenAI/Claude argument**: `/feedback` is descriptive of what you're managing.

**Synthesis**: `/inbox` is compelling for the "unified queue" mental model. `/feedback` is more explicit. **Consider `/inbox` as primary, `/feedback` as alias.**

### Naming: Lifecycle Name

| Claude | OpenAI | Gemini |
|--------|--------|--------|
| "Feedback Lifecycle" | Keep "Quality Lifecycle" + "Feedback Inbox" | "Signal Lifecycle" |

**OpenAI's argument**: Minimal rename; continuity with existing documentation.
**Claude's argument**: "Quality" is a stretch for feature requests.
**Gemini's argument**: "Signal" covers all types neutrally.

**Synthesis**: OpenAI's approach is most pragmatic - keep the system name, rename the user-facing intake surface. **Keep "Quality Lifecycle System" but use "Feedback Inbox" for the user-facing command.**

### Lifecycle Stage Rename

| Claude | OpenAI | Gemini |
|--------|--------|--------|
| Keep "Detection" | Keep "Detection" | Rename to "Capture" |

**Gemini's argument**: "Detection" is passive/negative. "Capture" covers active user ideas AND passive error logging.

**Synthesis**: Gemini makes a compelling point. "Detection" implies finding something wrong. "Capture" is neutral. **Consider renaming Detection → Capture.**

### Third Type: Inquiry

Gemini uniquely suggests a third type:

```
signal_type: 'defect' | 'enhancement' | 'inquiry'
```

**Use case**: User asks a question, not reporting a bug or requesting a feature. "How do I export?" is neither defect nor enhancement.

**Synthesis**: Valid addition. Could be handled as a category within issues, or as a third type. **Defer for now, but note as future consideration.**

---

## Unique Insights

### From Gemini Only

| Insight | Value |
|---------|-------|
| Rename Detection → "Capture" | High - more neutral framing |
| Add "inquiry" as third type | Medium - valid use case |
| `/inbox` command naming | High - better mental model |
| "A Bug and a Feature Request are just two types of Work to be done" | High - clarifying philosophy |
| "Splitting them guarantees one system will be neglected" | High - core insight |

### From OpenAI Only

| Insight | Value |
|---------|-------|
| Keep "Quality Lifecycle" for continuity | Medium - pragmatic |
| `roadmap_stage` field for enhancements | Medium - useful for planning |
| "Severity-based pinning and alerting for issues" | High - prevents enhancement noise from hiding bugs |

### From Claude Only

| Insight | Value |
|---------|-------|
| `roadmap_quarter` field (Q1, Q2) | Low - may be over-engineering |
| `votes` field for future user voting | Medium - useful for prioritization |
| "Prevent idea debt" with auto-archive | High - practical noise control |

---

## Consolidated Recommendation

### Data Model

```sql
CREATE TABLE feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Type discriminator (CONSENSUS)
  type VARCHAR(20) NOT NULL,                -- 'issue' | 'enhancement'

  -- Source (CONSENSUS)
  source_application VARCHAR(50) NOT NULL,
  source_type VARCHAR(30) NOT NULL,         -- 'manual_feedback' | 'auto_capture' | 'uat_failure'

  -- Common fields (CONSENSUS)
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'new',
  priority VARCHAR(10),                     -- P0-P3 for issues, high/med/low for enhancements

  -- Issue-specific (CONSENSUS)
  severity VARCHAR(20),                     -- critical, high, medium, low
  category VARCHAR(50),                     -- bug, ux_issue, error
  error_hash VARCHAR(64),
  stack_trace TEXT,
  resolution_type VARCHAR(30),

  -- Enhancement-specific (CONSENSUS)
  value_estimate VARCHAR(20),               -- high, medium, low (or Gemini's 'game_changer', 'nice_to_have')
  effort_estimate VARCHAR(20),              -- small, medium, large
  votes INTEGER DEFAULT 0,                  -- For future voting (Claude suggestion)

  -- Conversion tracking (CONSENSUS)
  original_type VARCHAR(20),
  converted_at TIMESTAMPTZ,
  conversion_reason TEXT,

  -- Triage (from previous triangulation)
  triaged_at TIMESTAMPTZ,
  snoozed_until TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
```

### Naming

| Element | Recommendation | Rationale |
|---------|---------------|-----------|
| Table name | `feedback` | More human-readable than "signals" |
| Primary command | `/inbox` | Gemini's insight - unified queue mental model |
| Alias commands | `/feedback`, `/issues` | Backward compatibility |
| System name | "Quality Lifecycle System" | OpenAI's pragmatism - minimal churn |
| User-facing | "Feedback Inbox" | Clear what it is |
| Stage 2 rename | Detection → **Capture** | Gemini's insight - neutral framing |

### Updated Lifecycle

```
Prevention → Capture → Triage → Resolution → Learning
               ↓
        (Issues + Enhancements)
```

### Workflow Summary

| Aspect | Issues | Enhancements |
|--------|--------|--------------|
| Entry | `/inbox new`, error capture, UAT fail | `/inbox new --type=enhancement` |
| Triage criteria | Severity + urgency | Value + effort |
| Default path | Resolution queue | Backlog |
| Resolution | /quick-fix or SD | SD when prioritized |
| Success | "Is it fixed?" | "Did users adopt it?" |

---

## Action Items for Vision Document

| Priority | Action |
|----------|--------|
| **High** | Rename table from `issues` to `feedback` |
| **High** | Add `type` discriminator field |
| **High** | Add enhancement-specific fields (value_estimate, effort_estimate) |
| **High** | Add conversion tracking fields |
| **Medium** | Rename Detection stage to "Capture" |
| **Medium** | Update command structure (`/inbox` primary) |
| **Low** | Add `votes` field for future enhancement voting |
| **Low** | Consider "inquiry" as third type |

---

## Final Recommendation

**PROCEED with Unified Feedback Architecture**

All three reviewers unanimously agree:
1. Unified table is mandatory for solo entrepreneur sanity
2. Type discriminator enables clean separation within unified structure
3. Conversion is trivial (field update, not data migration)
4. One inbox prevents system neglect

The only debates are naming choices, which are low-stakes. The architecture is clear.

---

*Synthesis completed: 2026-01-17*
*Ready for vision document update*
