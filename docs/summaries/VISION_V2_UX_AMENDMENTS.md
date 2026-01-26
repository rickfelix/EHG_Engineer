# Recommended Amendments for `00_VISION_V2_CHAIRMAN_OS.md` (Section 2)


## Metadata
- **Category**: Report
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-12
- **Tags**: api, architecture, react, frontend

Copy and paste the following content to replace/enhance **Section 2: The User Experience**.

## ADDITION 1: The "Briefing" Component (Technical Spec)

*Insert after "The Morning Briefing" (Line 68)*

**Technical Implementation:**
EVA's briefing is not just text; it is a structured JSON payload driving the UI.

**Data Structure (JSON):**
```json
{
  "greeting": "Good morning, Rick. Systems nominal.",
  "global_health_score": 88,
  "weather_report": {
    "active_ventures": 3,
    "blocked_agents": 1,
    "token_burn_rate": "normal"
  },
  "priority_feed": [
    {
      "id": "evt_123",
      "type": "blocker",
      "entity": "Project Chimera",
      "stage": 12,
      "message": "API Access Denied",
      "action_required": true
    },
    {
      "id": "evt_124",
      "type": "milestone",
      "entity": "Solara",
      "stage": 4,
      "message": "Market analysis complete. TAM > $1B.",
      "action_required": false
    }
  ]
}
```

**Required React Components:**
*   `<EvaBriefingContainer />`: The full-screen modal/panel wrapper.
*   `<BriefingTicker />`: Renders the `weather_report` metrics.
*   `<PriorityFeedStack />`: A vertical stack of `<FeedCard />` items.
*   `<DecisionDeck />`: The Tinder-like swipe interface for `action_required: true` items.

---

## ADDITION 2: The "Factory Floor" Visuals (Visualization Spec)

*Insert after "The Assembly Line" (Line 79)*

**Visual Architecture:**
The 25-stage interactions are too complex for a single Kanban board. We use a **Grouped Pipeline** layout.

**Layout:**
*   **Horizontal Scroll Container:** Grouped by Phase (Truth, Engine, etc.).
*   **Column:** Each Stage (1-25) is a fixed-width column.
*   **Card:** The "Active Venture" is the card that moves through the columns.

**Agent Telemetry UI (`<AgentTelemetry />`):**
We do not just show "Status: Working." We visualize the *State Machine*.
*   **States:**
    *   `IDLE`: Greyed out opacity (0.5).
    *   `WORKING`: Pulsing Ring Animation (Cyan). tooltip: *"Drafting PRD (45% complete)"*
    *   `THINKING` (LLM Call): Indeterminate Progress Bar.
    *   `BLOCKED`: Flashing Red Border + "Help" Icon.
*   **Component:** `<AgentBadge type="researcher" state="working" />`

---

## ADDITION 3: The "Direct Override" Interaction (Flow Spec)

*Insert after "Direct Override" (Line 82)*

**Integration Flow:**
1.  **Selection:** Rick highlights a paragraph in the `<MarkdownViewer />`.
2.  **Context Menu:** A Floating Toolbar appears (style: Notion/Medium).
    *   *Options:* [Comment] [Copy] **[EVA Override]**
3.  **Command:** Clicking **[EVA Override]** opens a minimalist input box attached to the selection.
4.  **Input:** Rick types: *"Too verbose. Summarize in 3 bullets."*
5.  **Execution:**
    *   Frontend sends `POST /api/eva/override`.
    *   UI shows " EVA Working..." overlay on the specific paragraph.
    *   Text streams updates in real-time (diff view).
6.  **Confirmation:** Agent responds: *"Updated. Better?"* -> [Keep] [Revert].
