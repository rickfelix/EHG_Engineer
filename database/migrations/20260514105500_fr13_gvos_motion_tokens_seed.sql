-- Migration 1 (FR-13): gvos_tokens.prompt_emission + 15 motion-token seed
-- Idempotent. Adds 'motion' to category CHECK constraint (existing categories preserved).

BEGIN;

-- 1a. Additive column (nullable; existing 31 rows stay NULL)
ALTER TABLE gvos_tokens
  ADD COLUMN IF NOT EXISTS prompt_emission JSONB;

-- 1b. Widen category CHECK to include 'motion'
ALTER TABLE gvos_tokens DROP CONSTRAINT IF EXISTS gvos_tokens_category_check;
ALTER TABLE gvos_tokens
  ADD CONSTRAINT gvos_tokens_category_check
  CHECK (category = ANY (ARRAY[
    'structural'::text,'kinetic'::text,'atmospheric'::text,'compliance'::text,
    'typography'::text,'vertical-expansion'::text,'hidden-risk'::text,'pack'::text,
    'motion'::text
  ]));

-- 1c. Seed 15 motion tokens (ON CONFLICT (name) DO NOTHING via UNIQUE gvos_tokens_name_key)
INSERT INTO gvos_tokens
  (name, category, definition, implementation_hint, prompt_emission, version_major, version_minor, version_patch)
VALUES
  ('Press-Tactile-80ms', 'motion', 'Tactile press feedback for buttons and clickable surfaces (80ms scale-down).', 'framer-motion: whileTap={{ scale: 0.97 }} transition={{ duration: 0.08, ease: "easeOut" }}', '{"trigger":"click/tap","duration_ms":80,"easing":"ease-out","library_call_example":"motion.button({ whileTap: { scale: 0.97 } })"}'::jsonb, 1, 0, 0),
  ('Focus-Ring-Crossfade-150ms', 'motion', 'Smooth focus-ring crossfade for inputs and interactive controls (150ms ease-in-out).', 'framer-motion: animate ring opacity 0→1 over 0.15s on focus', '{"trigger":"focus","duration_ms":150,"easing":"ease-in-out","library_call_example":"motion.input({ initial: { boxShadow: \"0 0 0 0\" }, animate: { boxShadow: \"0 0 0 2px var(--ring)\" } })"}'::jsonb, 1, 0, 0),
  ('Toast-Slide-In-180ms', 'motion', 'Toast notifications slide in from the right edge with crossfade (180ms).', 'framer-motion: initial={x:24,opacity:0} animate={x:0,opacity:1} transition={duration:0.18}', '{"trigger":"mount","duration_ms":180,"easing":"ease-out","library_call_example":"motion.div({ initial: { x: 24, opacity: 0 }, animate: { x: 0, opacity: 1 } })"}'::jsonb, 1, 0, 0),
  ('Skeleton-Shimmer-1200ms', 'motion', 'Skeleton placeholder shimmer loop while data loads (1200ms linear).', 'CSS keyframes or framer-motion repeating gradient sweep', '{"trigger":"loading","duration_ms":1200,"easing":"linear-loop","library_call_example":"motion.div({ animate: { backgroundPosition: [\"0% 0%\",\"100% 0%\"] }, transition: { repeat: Infinity, duration: 1.2 } })"}'::jsonb, 1, 0, 0),
  ('Field-Validation-Shake-160ms', 'motion', 'Horizontal shake on invalid form-field submission (160ms).', 'framer-motion: animate x: [0,-6,6,-4,4,0]', '{"trigger":"validation-fail","duration_ms":160,"easing":"ease-in-out","library_call_example":"motion.input({ animate: errorTrigger ? { x: [0,-6,6,-4,4,0] } : { x: 0 }, transition: { duration: 0.16 } })"}'::jsonb, 1, 0, 0),
  ('Modal-Scale-In-200ms', 'motion', 'Modal dialog scale-in with crossfade on open (200ms ease-out-cubic).', 'framer-motion: initial={scale:0.95,opacity:0} animate={scale:1,opacity:1} transition={duration:0.2,ease:[0.16,1,0.3,1]}', '{"trigger":"mount","duration_ms":200,"easing":"ease-out-cubic","library_call_example":"motion.div({ initial: { scale: 0.95, opacity: 0 }, animate: { scale: 1, opacity: 1 } })"}'::jsonb, 1, 0, 0),
  ('Hover-Lift-100ms', 'motion', 'Subtle elevation on hover for cards and clickable surfaces (100ms).', 'framer-motion: whileHover={{ y: -2 }} transition={{ duration: 0.1 }}', '{"trigger":"hover","duration_ms":100,"easing":"ease-out","library_call_example":"motion.div({ whileHover: { y: -2, boxShadow: \"0 4px 16px rgba(0,0,0,0.08)\" } })"}'::jsonb, 1, 0, 0),
  ('Dropdown-Reveal-160ms', 'motion', 'Dropdown menu reveal with height + opacity transition (160ms).', 'framer-motion: initial={height:0,opacity:0} animate={height:"auto",opacity:1} transition={duration:0.16}', '{"trigger":"open","duration_ms":160,"easing":"ease-out","library_call_example":"motion.ul({ initial: { height: 0, opacity: 0 }, animate: { height: \"auto\", opacity: 1 } })"}'::jsonb, 1, 0, 0),
  ('Number-Tick-Smooth-Lerp', 'motion', 'Smooth numeric counter interpolation for dashboards and KPIs (~400ms lerp).', 'framer-motion: useSpring + display rounded value', '{"trigger":"value-change","duration_ms":400,"easing":"ease-out","library_call_example":"useSpring(value, { stiffness: 100, damping: 30 })"}'::jsonb, 1, 0, 0),
  ('Page-Crossfade-180ms', 'motion', 'Crossfade between route/page transitions (180ms ease-in-out).', 'framer-motion: AnimatePresence mode="wait" with opacity tween', '{"trigger":"route-change","duration_ms":180,"easing":"ease-in-out","library_call_example":"AnimatePresence + motion.main({ initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } })"}'::jsonb, 1, 0, 0),
  ('Empty-State-Fade-In-300ms', 'motion', 'Empty-state illustration + copy fade-in with slight lift (300ms).', 'framer-motion: opacity 0→1, y 8→0', '{"trigger":"mount","duration_ms":300,"easing":"ease-out","library_call_example":"motion.div({ initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } })"}'::jsonb, 1, 0, 0),
  ('Disabled-Press-Damper-50ms', 'motion', 'Damped feedback on attempting to interact with a disabled control (50ms).', 'framer-motion: brief scale dip when disabled press detected', '{"trigger":"click-disabled","duration_ms":50,"easing":"ease-out","library_call_example":"motion.button({ animate: disabled ? { scale: [1, 0.99, 1] } : {} })"}'::jsonb, 1, 0, 0),
  ('Tab-Underline-Slide-200ms', 'motion', 'Active-tab underline indicator slides between tabs (200ms ease-out-cubic).', 'framer-motion: layoutId shared between tab triggers', '{"trigger":"tab-change","duration_ms":200,"easing":"ease-out-cubic","library_call_example":"motion.span({ layoutId: \"tab-underline\" })"}'::jsonb, 1, 0, 0),
  ('Tooltip-Fade-100ms-delay-300ms', 'motion', 'Tooltip appears after 300ms sustained hover then 100ms fade-in.', 'framer-motion: transition={{ delay: 0.3, duration: 0.1 }}', '{"trigger":"hover-sustained","duration_ms":100,"easing":"ease-out","library_call_example":"motion.div({ initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { delay: 0.3, duration: 0.1 } })"}'::jsonb, 1, 0, 0),
  ('Progress-Ease-Out-Cubic', 'motion', 'Progress bar width interpolation with cubic ease-out (600ms).', 'framer-motion: width 0→target, easing [0.16,1,0.3,1]', '{"trigger":"value-change","duration_ms":600,"easing":"ease-out-cubic","library_call_example":"motion.div({ initial: { width: \"0%\" }, animate: { width: \"${pct}%\" }, transition: { ease: [0.16,1,0.3,1] } })"}'::jsonb, 1, 0, 0)
ON CONFLICT (name) DO NOTHING;

-- 1d. Idempotency assertion: count must be 15 (or more if re-run after extra inserts)
DO $$
DECLARE motion_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO motion_count FROM gvos_tokens WHERE category = 'motion';
  IF motion_count < 15 THEN
    RAISE EXCEPTION 'FR-13 seed failed: gvos_tokens WHERE category=motion = %, expected >= 15', motion_count;
  END IF;
END $$;

COMMIT;