# Problem — feedback/error capture seam

**Domain**: a risky operation can fail. The wrong response is to SWALLOW the failure
— an empty `catch` that discards the error, or (the "session-register" class) a call
that returns `ok:true` while the durable row it was supposed to write is missing. Both
leave a failure with no trace. The right response is to CAPTURE it: leave a durable
record AND a visible signal, without breaking the caller and without flooding.

**Reuse evidence** (why this domain earned a golden reference):

- **The swallowed-error class is recurring and expensive**: a `catch {}` that returns
  fail-silent hides the very failure you need to see. The estate funnels failures into
  a single durable channel precisely so they cannot vanish.
- **The estate's canonical capture writer** (`lib/governance/emit-feedback.js`,
  `@canonical-writer-for: feedback`) shows the durable shape: `emitFeedback(...)` inserts
  a `feedback` row and dedups via `dedupHash = sha256(today::description::dedup_key)`
  where `today` is the UTC day (`toISOString().slice(0,10)`); the dedup CHECK is
  co-scoped by `(category, metadata->>dedup_hash)`; `source_id`, `status`, `priority`,
  and `resolution_notes` are EXCLUDED from the hash, and `emitted_at` is volatile row
  metadata — dedup keys on STABLE fields only. Its CLI wrapper is
  `scripts/log-harness-bug.js`; `scripts/capture-completion-flags.js` funnels
  completion findings through the same channel; sub-agent failures land as error rows
  in `sub_agent_execution_results`.

**Attribution honesty** (do not miscopy as estate-distilled): two properties of this
reference are deliberate **seam-design hardening**, not a mirror of `emitFeedback`:

- **"never throws"** — `emitFeedback` actually DOES throw on its insert failure and on
  validation; only its enrichment path (`_autoFillDeferredFromSdKey`) and its
  non-blocking dual-write catch are best-effort. A *capture seam*, though, must not
  throw — if it does, it re-becomes the swallow class it fights. So the seam-wide
  never-throw is a composition, cited from those two partial precedents.
- **"a stderr line on every first capture"** — `emitFeedback` is SILENT on the
  successful row write, and `log-harness-bug.js` logs to STDOUT (not stderr) on success.
  The estate's "never fully silent" seed is its `console.warn` enrichment-error paths and
  its `console.error` dual-write path. This reference COMPOSES those into a per-capture
  stderr guarantee — labeled hardening, not distillation.

The entry shape here (`{category, type, symptom, source, severity, dedup_hash,
emitted_at}`) is a DISTILLATION of the estate's `feedback` row + dedup shape — `symptom`
maps to the `feedback` *description*, `dedup_hash` is composed of the same stable fields,
`emitted_at` is stored but excluded from the hash.

**Task shape a delegate will face**: wrap a risky operation so that a failure leaves a
durable, deduped row and a visible stderr line, the caller is never broken by a throw
(not even when the sink or logger itself fails), and a healthy operation stays silent.
