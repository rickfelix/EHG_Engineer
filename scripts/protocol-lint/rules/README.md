# Protocol Linter Rules

Rules live in two subdirectories, discovered automatically by `rule-loader.mjs` at linter startup. No central registry to maintain — drop a file in, it loads.

SD-PROTOCOL-LINTER-001.

## Directories

| Directory | Style | When to use |
|-----------|-------|-------------|
| `declarative/*.json` | Pattern-level JSON | Phrase presence/absence, required markers, simple string matches |
| `code/*.mjs` | JavaScript module with `check(ctx)` | Cross-section reasoning, regex extraction, semantic rules, DB-vs-hardcoded comparison |

## Rule contract

Both styles produce the same runtime shape:

```js
{
  id: 'LINT-XXX-NNN',            // Unique identifier; used in leo_lint_violations.rule_id
  severity: 'warn' | 'block',    // New rules MUST ship as 'warn' (see promotion lifecycle)
  description: 'string',         // Human readable — shown in dashboard and CLI output
  enabled: true,                 // Optional; defaults true
  check(ctx)                     // Returns an array of { section_id, message, context } objects
}
```

`check(ctx)` receives:

```js
{
  sections: [{ id, section_name, content, section_type, anchor_topic, ... }],
  protocol: {/* optional protocol metadata */},
  generatorCode: 'string',       // Optional; for hardcoded-vs-DB rules
}
```

and returns an array (possibly empty) of partial violations. The engine fills in `rule_id` and `severity` from the rule object; `check` only provides `section_id`, `message`, and optional `context`.

## Declarative rule schema (JSON)

```json
{
  "id": "LINT-PHRASE-001",
  "severity": "warn",
  "description": "Sections with section_type='pause_policy' must reference AUTO-PROCEED.",
  "pattern_type": "required_phrase",
  "pattern": "AUTO-PROCEED",
  "section_type_filter": "pause_policy",
  "enabled": true
}
```

Supported `pattern_type` values:
- `required_phrase` — every matching section MUST contain `pattern`
- `forbidden_phrase` — no matching section may contain `pattern`

Optional: `section_type_filter` narrows the rule to sections where `section_type === <value>`.

## Code rule example (`.mjs`)

```js
export default {
  id: 'LINT-ANCHOR-001',
  severity: 'warn',
  description: 'An anchor_topic may be claimed by at most one section.',
  enabled: true,
  check(ctx) {
    const sections = (ctx.sections || []).filter(s => s.anchor_topic);
    // ...group by anchor_topic, emit violation per duplicate...
    return [];
  }
};
```

## Fixtures are required

Every rule MUST ship with two fixtures in `../fixtures/`:

- `<RULE-ID>.positive.json` — a context that SHOULD trigger the rule
- `<RULE-ID>.negative.json` — a context that SHOULD NOT trigger the rule

The CI test `tests/unit/protocol-lint/engine.test.mjs` enforces this — missing fixtures fail the build. Fixture shape:

```json
{
  "description": "...human context...",
  "sections": [...],
  "expected_violations": [
    { "rule_id": "LINT-XXX-001", "section_id": "sec-1" }
  ]
}
```

`expected_violations` is optional but recommended for positive fixtures so tests can verify the rule flagged the right sections.

## Promotion lifecycle (warn → block)

New rules default to `severity: "warn"`. Promotion to `block` lands in slice 4 via `npm run protocol:lint:promote <rule-id>`, which requires 2+ consecutive clean regen runs. Do NOT author new rules with `severity: "block"` — this is a review comment in PRs.

## Naming convention

`LINT-<CATEGORY>-<NNN>` — category is 4-8 uppercase letters describing the rule class.

Categories in use:
- `PHRASE` — phrase presence/absence
- `THRESH` — numeric threshold consistency
- `ANCHOR` — anchor-topic uniqueness

Add categories as needed. No central list — rely on `rule_id` conflicts being caught by the PK constraint on `leo_lint_rules`.
