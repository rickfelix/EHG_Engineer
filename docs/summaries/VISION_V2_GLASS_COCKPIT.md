# Visioning Exercise: The Glass Cockpit


## Metadata
- **Category**: Report
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-12
- **Tags**: api, unit, workflow, ci

## **Context: The "Glass Cockpit" Philosophy**

In aviation, a "Glass Cockpit" replaces analog dials with digital screens that show *only what matters* for the current phase of flight.
For **EHG Vision v2**, we apply this to the Venture Factory. Rick is the Pilot. EVA is the Co-Pilot. The "Engine" is the swarm of crewAI agents below deck.

---

## **1. The Chairman’s Office (`/chairman`)**
*The Setup: High-Level Strategy, Health, and Direction.*

To the Chairman, the Venture Factory is a black box that produces value. He doesn't need to see every commit; he needs to see flow, roadblocks, and opportunities.

### **The Morning Briefing**
Upon logging in, the clutter is gone. The Chairman is greeted not by a dashboard of widgets, but by **EVA** herself (in a dedicated "Briefing Mode").

> **EVA:** "Good Morning, Chairman.
> **Status:** All systems nominal.
> **Updates:**
> 1.  The *Solara* Marketing Crew has finished the launch plan (Review recommended).
> 2.  *Project Chimera* is stalled in Stage 12 (Blocker: API Access).
> 3.  **Opportunity:** Competitor X just raised prices; should we accelerate the Compass pricing model?"

*Action:* Rick can say "Show me Solara" or "Approve the Compass change."

### **The Visual Interface**
The screen is dominated by the **Venture Health** visualization—a 3D or holographic representation of the ecosystem.
-   **Truth, Engine, Identity, Blueprint, Build, Launch** are top-level "Phases" that light up based on activity.
-   **Ticker Tape:** A subtle stream on the right shows active agent logs (e.g., *"Agent X drafting PRD..."*, *"Agent Y deployed...*") to give a sense of "life" without requiring attention.

![Chairman's Glass Cockpit Dashboard](/C:/Users/rickf/.gemini/antigravity/brain/51d9a722-c9c0-47ba-ad9c-0d455ecc11ae/chairman_dashboard_wireframe_1765555358156.png)

---

## **2. The Venture Factory (`/ventures/:id`)**
*The Setup: Rick puts on the "Solo Entrepreneur" hat to inspect or build.*

When Rick clicks "Show me Solara," the view zooms effectively *into* one of the nodes. The UI shifts from "Strategic Blue" to "Tactical Amber/Green".

### **The "Assembly Line" (Not Just a Kanban)**
Standard Kanban boards are static. The Venture Factory view feels like a moving assembly line.
-   **The 25 Stages** are visualized as a horizontal flow.
-   **Agents as Workers:** You don't just see a card in "Drafting"; you see the **Product Manager Agent** icon *pulsing* or *working* on that card.
-   **Real-Time Feedback:** If an agent hits a snag, the card turns red. Rick can click it to "Open the Hood."

### **Inspection Mode**
Rick clicks a card (e.g., "Stage 7: Pricing Model").
-   **The Document:** The center screen is the artifact itself (the Markdown file, the Code).
-   **EVA's Sidebar:** EVA sits on the right, offering context. *"The Financial Agent assumes a 5% churn. This is aggressive compared to our baseline. Want me to adjust?"*
-   **Direct Command:** Rick can highlight text and type/say: *"Too complex. Simplify this section."* The agent sees this as feedback and iterates.

---

## **3. The EVA Interaction Model**
*The Co-Pilot that connects Strategy to Execution.*

EVA is not just a chatbot; she is the **Orchestrator**.

### **Command & Control**
Rick operates at two frequencies:
1.  **Voice/Chat (Natural Language):**
    *   *"EVA, spin up a new venture for 'AI-Driven Coffee'."* -> EVA triggers `create_venture` workflow.
    *   *"What's blocking the Build team?"* -> EVA queries agent logs and summarizes.
2.  **Approval & Review:**
    *   EVA presents "Decisions" as a stack of cards. Rick swipes Right (Approve) or Left (Reject/Comment).

### **Proactive Intelligence**
EVA watches the agents.
*   *Scenario:* A Developer Agent fails a test 3 times.
*   *EVA to Chairman:* "The Build Crew is struggling with the new auth module. I've paused them. Do you want to intervene or should I try the Senior Architect Agent?"

---

## **Summary of the "Feel"**
-   **Chairman Mode:** Calm, Omniscient, Decision-Focused. *Feels like: Captain Picard on the Bridge.*
-   **Venture Mode:** Busy, Mechanical, Progress-Focused. *Feels like: Iron Man in the Workshop.*
