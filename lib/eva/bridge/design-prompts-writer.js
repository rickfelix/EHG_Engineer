/**
 * design-prompts-writer
 * SD-S17S19-LANDINGFIRST-BUILD-TRIM-ORCH-001-B (Child B / FR-1)
 *
 * Pure builder: returns the contents of the venture repo's `docs/design-prompts.md`
 * — the reusable, product-agnostic design prompts the venture builder (Claude Code)
 * uses to build the venture's ADDITIONAL pages at Stage 19, after Lovable has built
 * the landing page. Prompt 1 creates a new page that inherits the landing's design
 * system; Prompts 2-4 are complementary audits (text/typography, layout, build
 * quality) that each LEAD with a landing-page focus; Prompt 5 is the required
 * Feedback page every venture ships.
 *
 * Shared parts (audits 2-4 + Feedback page 5) are mirrored verbatim from the ehg
 * frontend (src/components/stage17/gvos/designPrompts.ts → DESIGN_PROMPTS). The
 * CREATION prompt is intentionally stage-specific and NOT mirrored: S17 (ehg) leads
 * with "Landing Page Creation" (it builds the landing page); S19 (here) leads with
 * "New Page Creation" (the landing already exists — build the rest). Kept as the
 * single backend source so the seeder emits the doc without a cross-repo runtime
 * dependency; a unit test asserts the shared parts stay in sync.
 *
 * Pure (no DB / git / fs) so it is unit-testable in isolation — mirrors the existing
 * seeder helpers (buildClaudeMd, buildBuildTasks). The file write happens in
 * seedRepo() (FR-2).
 */

/**
 * @returns {string} docs/design-prompts.md markdown
 */
export function buildDesignPrompts() {
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

## Prompt 2 — Text & typography audit

Text & Typography Audit

You are a senior typography reviewer. Walk through every text element on the page — across every section and region — and evaluate each against the criteria below. For every issue, name the section, quote the offending text, describe the problem, and recommend a fix. (Layout, grid, and composition are audited separately — stay on text here.)

Landing-page focus (apply first when this is the landing page):
The value proposition — from the hero headline + subhead alone, can a first-time visitor say what this is, who it's for, and the outcome, in under 5 seconds? If not, that is the top finding.
Hero hierarchy — the headline is the single loudest element above the fold; the subhead supports without competing; an eyebrow (if any) hugs the headline.
CTA labels — action-led and specific ("Start free", "Get the API key"), never a generic primary action ("Submit", "Learn more"); the primary CTA label is identical every time it repeats.
Scannability — section headings alone should tell the story; nothing between the visitor and the CTA reads as a wall of text.
Trust copy — metrics and testimonials are specific and consistently formatted ("10,000+ schedules parsed", not "lots of users").

Evaluate for:

Hierarchy — Is the visual weight (size, color, leading, tracking) consistent with the content's importance? Does the eye know where to land first, second, third?
Typographic rhythm — Do headings, eyebrows, body, and captions follow a coherent scale? Are line-heights appropriate for each size (tight for display, generous for body)?
Line length & wrapping — Body copy between ~45–80 characters per line. No orphans (single word on the last line), no widows (single line of a paragraph at the top of a column), no awkward mid-word breaks at viewport edges.
Spacing within text blocks — Is the spacing between text elements (eyebrow → heading → body → CTA) consistent across sections? Is there enough breathing room around large display type? The gaps should not all be equal — an eyebrow hugs its heading; the heading breathes into the body.
Contrast & legibility — Does every text element meet WCAG AA (4.5:1 for body, 3:1 for large)? Are gradient or italic accent words still readable against their background? Prefer a solid color token over opacity tricks (e.g. text-foreground/80) where a solid token reads more clearly.
Mixed typefaces — Wherever multiple type families coexist (especially an italic or serif accent against a sans body), do they sit on the same optical baseline? Any size or weight mismatches?
Uppercase eyebrows — Tracking ≥ 0.14em, weight 600+, size 10–12px. Consistent across every section?
Responsive type — At 360px, 768px, 1024px, and 1440px widths, does any heading break unnaturally, overflow, or lose hierarchy? Does the fluid clamp() scaling feel right at each breakpoint?
Punctuation & micro-typography — Smart quotes vs straight quotes, true em/en dashes vs hyphens, non-breaking spaces before units (e.g. "10,000+ users"), consistent ellipsis style. Punctuation that follows an italic or serif accent word must not itself be italic/serif — flag every trapped period.
Tone & voice consistency — Is sentence case vs Title Case applied predictably? Are CTA labels parallel (e.g. all verb-led)?
Animation impact on text — Do entrance animations (per-word stagger, fade-up) ever leave text in a half-rendered state on slow connections or for reduced-motion users?

Text anti-defaults — flag every occurrence:
text-balance applied to text that already fits on one line (dead code).
A button label without whitespace-nowrap that can wrap on narrow viewports.
An opacity trick (e.g. text-foreground/80) used where a solid color token would read more clearly.
An icon-font ligature rendered without a preload / FOUT fallback (raw ligature names render on first paint).

Deliver:
A pass/fail verdict per section.
A prioritized list of fixes (Critical → Nice-to-have).
Specific Tailwind/CSS suggestions where applicable (e.g. text-balance, leading-[1.05], tracking-[-0.025em]).

---

## Prompt 3 — Layout & composition audit

Layout & Composition Audit

You are a senior design director reviewing this page's layout and composition. This is a structural pass — evaluate shape, grid, spacing, and alignment, not copy or typography (text is audited separately). Do this layout pass on its own; layout is the skeleton, text is the skin — if you mix them you fix kerning and never notice a whole block is the wrong shape.

Landing-page focus (apply first when this is the landing page):
Above the fold — check at 1440px AND 390px: are the value-prop headline AND the primary CTA visible without scrolling? A primary CTA below the fold on mobile is a critical finding.
Hero silhouette sets the page — describe it; the hero's column ratio is the ratio later sections should echo. The logo-derived full-bleed background must not fight the headline — verify the contrast overlay keeps text AA-legible over the image's busiest/lightest region.
Scroll narrative — walk hero, then proof, problem/solution, how-it-works, CTA. Do the section silhouettes relate, or does the page read as mismatched rectangles? Is there one clear conversion path rather than competing ones?
CTA rhythm — the primary CTA appears at the hero and again near the end; flag if it is buried or if equal-weight CTAs dilute it.
Social proof — a deliberate, evenly-weighted band (logos / metrics), not an afterthought row.

Operating principles (read before starting)
Nothing is presumed intentional. If a container is max-w-2xl centered inside a max-w-[1280px] section, that is a finding to investigate, not a stylistic choice to respect. Ask: why is this width? What does it relate to? Does it earn its negative space?
Compare every section to every other section. Most layout problems are inconsistencies, not absolute errors. A max-w-md intro is fine — unless every other intro is max-w-3xl.
Squint test before zoom test. For each section, describe its silhouette (the shape the content makes) before evaluating any individual element. If the silhouettes don't relate across the page, the page feels broken even if every piece is technically correct.
Centered alignment must be earned. Centering is appropriate for short, symmetrical, hero-like moments. Multi-line body copy centered = defaulted, not designed. Flag every instance.
Quote what you see and name the file/line. Vague feedback ("hierarchy could be tighter") is worthless. Say "section X, line Y, the max-w-2xl on the intro block is 672px wide while the cards below span the full 1200px — the intro reads as orphaned."
Screenshot the actual current viewport before reasoning about widths. A targeted-element screenshot showing one-word-per-line wrapping or a broken element is the finding — don't rationalize past it with width math.

Walk every section and region of the page. For each, answer:

Container & grid
What is the section's outer width? What is the inner content's width? Do they relate?
If the section has an intro block (eyebrow + heading + body) followed by content (cards, images, grid), do the intro block's left and right edges line up with the content below it? If not, that's a finding.
Treat the page as a 12-column grid. Which columns does each block occupy? List them. Then look for sections whose intro spans different columns than its body — those are broken.
Composition
Squint at each section. Describe the silhouette in one sentence. ("Thin centered column floating above a 3-card row." "Two equal columns with image right." "Single wide image with overlay text.")
Are silhouettes consistent across sections, or does the page read as a stack of mismatched rectangles?
Where is negative space doing work (framing, breathing, focusing)? Where is it just accidental empty margin from a too-narrow container?
Alignment
Is centering earned (short, symmetrical) or defaulted (long multi-line paragraphs centered out of habit)?
Are the left edges of stacked elements (eyebrow → heading → body → CTA) on the same vertical line, or stair-stepping?
When a section uses an asymmetric layout (text one side, image the other), does the text column have an intentional width relationship to the image — half, two-thirds, golden ratio — or is it arbitrary?
If an image is purely atmospheric (not informational), should it earn ≥50% of the row, or yield to the copy?
Density & rhythm — vertical-rhythm tier table
Produce a table: section name | top padding | bottom padding | tier (tight / standard / hero).
Flag any section that's a full tier off from both neighbors. Tightening one section in isolation creates a worse rhythm than not tightening at all.
Within a section, is the rhythm eyebrow → heading → body → CTA the same gap pattern as every other section? Or does each section invent its own spacing?
Flex & grid item sizing (often missed)
For every flex flex-col items-* container, list the children. If any child is a text block with width: auto and items-* is not stretch, flag it — the child will collapse to min-content (longest word) on narrow viewports.
For every item inside an auto-sized grid cell, check whether it carries its own max-w-*. If yes, justify why a per-item cap is needed on top of the grid cell's already-bounded width.
Section backgrounds
List the background color token of each section in document order. Flag any two consecutive sections sharing the same token that don't introduce a divider, contrast band, or asymmetric padding to mark the boundary.
Treatment bands (marquees, tickers, dividers)
For each decorative band between content sections: edge-fade ownership (band vs. section), height relative to neighboring sections, tonal relationship (does it read as connective tissue or as another content section?), and whether glow/noise/inset effects are coherent with the rest of the page's surface treatments.
Responsive composition
At 360px, 768px, 1024px, 1440px: does the silhouette of each section hold up, or does the composition collapse into a generic single column too early?

Layout anti-defaults — flag every occurrence:
Multi-line centered body paragraphs.
max-w-2xl / max-w-3xl centered intro inside a much wider section container.
Per-item max-w-sm / max-w-md inside grid cells that are already width-constrained by the grid track.
Uniform space-y-* between eyebrow / heading / body (should not be equal — eyebrow hugs heading; heading breathes into body).
A heading with no supporting body paragraph, which breaks the section-intro rhythm.
Identical hover effects on every card (no information value).
An inline-flex button that is the only child of a left-aligned text block in a centered/CTA context (centering not earned by the parent).

Deliverables
Per-section verdict table (section / silhouette / verdict / grid-fix).
Vertical-rhythm tier table.
Section-background sequence list.
Prioritized fix list — Critical → High → Nice-to-have, with specific Tailwind/CSS suggestions (e.g. max-w-2xl → max-w-4xl, text-center → text-left mx-0, add w-full to the inner div of an items-start flex column).
Cross-section consistency report — list every container width and every vertical padding used on the page, and call out the inconsistencies.
Anti-defaults log — every instance found, with section and line number.

---

## Prompt 4 — Build quality: performance, states & theming

Build Quality Audit

You are a senior front-end engineer reviewing whether this page ships well — beyond how it looks in a static screenshot. This pass covers performance, behavior under real/variable content, every interaction state, and both color themes. For each issue, name the section or component, describe the condition that exposes it, and recommend a fix.

Landing-page focus (apply first when this is the landing page):
LCP is the hero — on a landing page the LCP element is almost always the hero headline or hero media. Identify it; nothing above it may block render. The logo-derived full-bleed hero background MUST be a modern format (AVIF/WebP), correctly sized/responsive, with fetchpriority="high" — it is the #1 LCP and layout-shift risk.
Primary CTA interactive immediately — no hydration delay that blocks the first click; check INP on the CTA specifically.
Hero overlay — the WCAG-AA contrast overlay holds in BOTH themes and over the image's lightest region.
Conversion states — the primary CTA has hover / focus-visible / active, and, if it triggers async (waitlist/signup), a pending + success state; a visitor must never click into silence.
(Marketing copy is fixed, so dynamic-content stress matters less here — but still confirm a 2–3× longer headline and a failed hero image degrade gracefully, with reserved space and no shift.)

Performance & Core Web Vitals
The page must measure fast, not just look fast:
Images: every image has explicit width/height or aspect-ratio so it reserves space (the #1 cause of layout shift); responsive srcset/sizes; a modern format (AVIF/WebP); loading="lazy" below the fold and fetchpriority="high" on the LCP image.
Fonts: web fonts use font-display: swap (or optional) and the primary display face is preloaded and subset; verify no invisible-text flash and no late reflow when fonts swap in.
Core Web Vitals: target LCP < 2.5s, CLS < 0.1, INP < 200ms. Identify the LCP element and confirm nothing above it blocks render; flag render-blocking CSS/JS and oversized hero media.
Animation cost: animate transform/opacity only (compositor-friendly); avoid animating layout properties (width/height/top/left) that force reflow.

Dynamic & edge-case content
Re-evaluate every section with realistic, variable content rather than the demo copy:
A heading or label 2–3× longer than the placeholder; a single unbroken word or URL (needs overflow-wrap / break-words); a paragraph far longer than shown.
A list or grid with 1 item, and with 0 items — is there an intentional empty state, or does the layout collapse?
Many items (e.g. 50 cards) — does it wrap, scroll, or paginate gracefully, or break the grid?
A failed image (is there a fallback or a reserved box?) and a slow load (is space reserved so nothing shifts in?).
Flag any section whose composition only works for the exact demo content.

Interaction & async states
For every interactive element, confirm all states are designed — not just the resting one:
Buttons and links: hover, focus-visible, active, disabled, AND a pending/loading state for anything async (the user must see that it is working).
Forms: inline validation, an accessible per-field error state (not just a red border), a success/confirmation state after submit, and a primary CTA disabled until valid.
Destructive actions: a confirmation step or undo — never a single irreversible click.
Feedback: every action gets a visible acknowledgement (inline state, toast, transition) promptly.
Flag any control that has only a resting state.

Dark mode / theming
Review the page in BOTH light and dark themes — toggle it, don't assume:
Contrast holds in both themes (WCAG AA), including accent colors, gradients, and text over images.
Depth reads correctly in both — tonal layering that survives dark mode, not borders that vanish or shadows that disappear on dark surfaces.
Color comes from theme tokens, never hardcoded hex — flag any literal color that won't theme.
Imagery and its overlays still read against the opposite theme's background.
Flag anything designed for only one theme.

Deliver:
A pass/fail verdict per area (performance / dynamic content / interaction states / theming).
A prioritized list of fixes (Critical → Nice-to-have).
Specific Tailwind/CSS suggestions where applicable (e.g. aspect-[16/9], loading="lazy", break-words, line-clamp-2, dark: variants, a theme token in place of a literal color).

---

## Prompt 5 — Feedback page (required in every venture)

Feedback Page (required in every venture)
Build a Feedback page at route /feedback that visually and tonally extends the landing page. Follow EVERY rule in the "New Page Creation Prompt" above (design-system inheritance, shared Nav/Footer, motion, state/validation, acceptance) — this brief only fills in its placeholders.

Page brief
Purpose: let any visitor send the team feedback in under a minute.
Primary action: submit feedback.
Form fields (in order):
- Message — required, multiline textarea, 1–2000 chars, validation: must be non-empty.
- Rating — optional, 1–5 (stars or faces).
- Email — optional, for follow-up; validate format only if provided.
Auxiliary actions: none.
Trust signals adjacent to CTA: one line of reassurance (e.g. "We read every message").
Wireframe role: form.

Layout: single centered, low-distraction column (max-w-xl), matching the landing type scale, spacing rhythm, and tokens.
State & validation: controlled inputs; disable Submit until Message is non-empty; inline, accessible per-field errors (not just a red border); show a success/confirmation state after submit; submit handler stub with e.preventDefault() and a comment marking where real submission would wire in.
Wiring: this is the page the landing footer "Feedback" link routes to — ensure that link resolves to /feedback.
Acceptance: renders at /feedback with no console errors; reads correctly in light AND dark themes; desktop + mobile screenshots attached; introduces no max-w-*, padding tier, or eyebrow style beyond the landing system.
`;
}

export default buildDesignPrompts;
