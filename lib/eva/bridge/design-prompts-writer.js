/**
 * design-prompts-writer
 * SD-S17S19-LANDINGFIRST-BUILD-TRIM-ORCH-001-B (Child B / FR-1)
 * SD-LEO-INFRA-UNIFY-STAGE-DESIGN-001 (Phase 2): the SHARED bodies now come from the
 *   single source shared-design-prompts.json — no longer hand-mirrored.
 *
 * Pure builder: returns the contents of the venture repo's `docs/design-prompts.md`
 * — the reusable, product-agnostic design prompts the venture builder (Claude Code)
 * uses to build the venture's ADDITIONAL pages at Stage 19, after Lovable has built
 * the landing page. Prompt 1 creates a new page that inherits the landing's design
 * system; Prompts 2-4 are complementary audits (text/typography, layout, build
 * quality) that each LEAD with a landing-page focus; Prompt 5 is the required
 * Feedback page every venture ships.
 *
 * The SHARED parts (audits 2-4 + Feedback page 5) come from the single source
 * `shared-design-prompts.json` (vendored byte-equivalent into both repos; ehg's copy
 * is src/components/stage17/gvos/shared-design-prompts.json). The CREATION prompt
 * (Prompt 1) is intentionally STAGE-SPECIFIC and stays hand-authored here: S17 (ehg)
 * leads with "Landing Page Creation" (it builds the landing); S19 (here) leads with
 * "New Page Creation" (the landing already exists — build the rest). `npm run
 * design-prompts:sync` + the twinned cross-repo checksum gate keep the shared parts
 * in lock-step. The vendored require keeps the builder dependency-free across repos
 * (no ehg import).
 *
 * Pure (no DB / git / network) so it is unit-testable — mirrors buildClaudeMd /
 * buildBuildTasks. The file write happens in seedRepo() (FR-2).
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
/** Single source of the shared bodies (audits 2-4 + Feedback 5), keyed by id. */
const SHARED_DESIGN_PROMPTS = require('./shared-design-prompts.json');

/**
 * @returns {string} docs/design-prompts.md markdown
 */
export function buildDesignPrompts() {
  // Shared prompts (2-5) rendered from the single source. Prompt 1 (creation) below
  // is stage-specific and stays inline.
  const sharedMd = SHARED_DESIGN_PROMPTS
    .map((p) => `## Prompt ${p.id} — ${p.summary}\n\n${p.text}`)
    .join('\n\n---\n\n');

  return `# Design Prompts — additional-page build playbook

> **How the venture is built (read first).** The landing page is designed in Google
> Stitch, elevated in Lovable, and pushed to GitHub (Replit hosts from GitHub). That
> is the ONLY page Lovable builds. **You (Claude Code) build every additional page
> here, in this repo**, inheriting the landing page's design system — at no metered
> cost. Do NOT rebuild the landing page; it already exists.

## Design prompting approach
As a process: **Google Stitch** (get the colors and feel) → **Lovable** (elevate the
design to look and feel more professional and polished, like work from a high-end
design firm; adjust spacing as well — you have creative liberty) → **GitHub** →
**Replit from GitHub** (elevate the design to look and feel more professional and
polished, like work from a high-end design firm; adjust spacing as well — you have
creative liberty).

Use the prompts below for the wireframe pages **after** the landing page is designed.
For each additional page: **follow Prompt 1** (it inherits the landing design system),
then run **Prompts 2, 3, and 4** as audits. Fill Prompt 1's brief from the relevant
screen section in \`docs/wireframes.md\`. Every venture also ships the **Feedback
page (Prompt 5)** — build it even if no wireframe screen calls for it.

---

## Prompt 1 — New page creation (inherits landing design system)

New Page Creation Prompt
Create a new <page name> page at <route path> that visually and tonally extends the existing landing page.

1. Design-system inheritance (read first)
The landing page (src/routes/index.tsx) is the source of truth for color tokens, type scale, spacing rhythm, motion grammar, and component patterns. Mirror them.
Reuse the established tokens (bg-breath-cream, bg-sand-warm, text-primary, text-on-surface, text-soft-charcoal, border-outline-variant, Poppins display + Instrument Serif italic accent + Inter body, fluid clamp() headings, [0.22, 1, 0.36, 1] easing).
Match the landing-page vertical-rhythm tier (py-16 md:py-20 standard, pt-8 md:pt-12 for tight tops, container max-w-[1280px] px-5 md:px-10).
When the brief below specifies tokens that conflict with the landing system (e.g., a different brand color), the landing system wins unless this prompt explicitly says otherwise.
2. Shared components
Reuse Nav and Footer from index.tsx. If they aren't already exported, extract them into src/components/site/ first and update both files to import from there — don't duplicate.
Use a slim variant of Nav for auth/checkout pages: logo + single contextual link (e.g., "Sign In" on signup, "Sign Up" on login). No primary nav links.
3. Page brief
Purpose: <one-sentence user outcome>
Primary action: <what the user should do, e.g., "create an account in under 30 seconds">
Form fields (in order): <list, with required/optional and validation rules>
Auxiliary actions: <social auth providers, magic-link option, etc., or "none">
Trust signals adjacent to CTA: <list, or "infer from product context">
Wireframe role: <form / dashboard / pricing / etc.>
4. Layout
Target silhouette: <e.g., "7/5 two-column: form left, atmospheric panel right with reused hero image and value props">
Asymmetric layouts should match the landing hero's column ratio unless a different ratio is specified here.
Below lg, collapse to single column; right panel may be hidden if it's purely atmospheric.
5. Icons & assets
Icons: Material Symbols Outlined (matching landing). For brand marks not in MSO (Google, Apple, GitHub), use inline SVG.
Images: reuse public/hero-lamp.png and any other landing assets before generating or stocking new ones. Note any new asset needs and list them at the end of the change.
6. Motion
Entrance: staggered fadeUp matching the landing Reveal pattern (opacity 0 → 1, y 24 → 0, duration 0.7–0.9, ease constant above).
Respect useReducedMotion.
Button micro-interactions: whileHover={{ y: -2 }}, whileTap={{ scale: 0.97 }}, spring stiffness: 380, damping: 22.
7. State & validation
Controlled inputs with local state. Submit handler stubs with e.preventDefault() and a comment marking where real submission would wire in.
Disable primary CTA until required fields and consent checkboxes are valid.
No error UI in this pass unless this prompt explicitly says otherwise.
8. Wiring
Update any existing link in the landing nav/CTA that should now route to this page.
If the new page is standalone, say so explicitly.
9. Acceptance
Page renders at the specified route with no console errors.
Visual screenshot at the desktop and mobile breakpoints attached for review.
No max-w-* value, padding tier, or eyebrow style introduced that doesn't already exist on the landing page (per the layout audit prompt).
Anti-defaults from the audit prompt do not appear.
Below, the structured brief: <paste JSON>

---

${sharedMd}
`;
}

export default buildDesignPrompts;
