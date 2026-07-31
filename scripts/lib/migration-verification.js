/**
 * migration-verification — capture pg introspection definitions for declared
 * objects before+after a migration apply.
 *
 * PRD FR-5 / CONDITION_3 (LEAD risk-agent): must cover FUNCTION, TRIGGER, VIEW,
 * INDEX. Genesis cascade-trigger ship-gap (PR #3703) was a TRIGGER —
 * pg_proc-only would have missed it.
 *
 * SD: SD-LEO-INFRA-CANONICAL-SCRIPTS-APPLY-001
 */

async function captureFunctionDef(client, schema, name) {
  const r = await client.query(
    `SELECT pg_get_functiondef(p.oid) AS def
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = $1 AND p.proname = $2
      LIMIT 1`,
    [schema, name]
  );
  return r.rows.length ? r.rows[0].def : null;
}

async function captureTriggerDef(client, schema, name) {
  const r = await client.query(
    `SELECT pg_get_triggerdef(t.oid) AS def
       FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND t.tgname = $2 AND NOT t.tgisinternal
      LIMIT 1`,
    [schema, name]
  );
  return r.rows.length ? r.rows[0].def : null;
}

async function captureViewDef(client, schema, name) {
  const r = await client.query(
    `SELECT definition FROM pg_views WHERE schemaname = $1 AND viewname = $2
     UNION ALL
     SELECT pg_get_viewdef(c.oid, true)::text
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind = 'm'
     LIMIT 1`,
    [schema, name]
  );
  return r.rows.length ? r.rows[0].definition || r.rows[0].pg_get_viewdef || null : null;
}

async function captureIndexDef(client, schema, name) {
  const r = await client.query(
    `SELECT indexdef FROM pg_indexes
      WHERE schemaname = $1 AND indexname = $2 LIMIT 1`,
    [schema, name]
  );
  return r.rows.length ? r.rows[0].indexdef : null;
}

/**
 * POLICY capture — SD-FDBK-INFRA-LIVE-PROBE-DDL-001 FR-2 (parent FR-4 AC-1:
 * "RLS/policy items are verdicted from pg_policies and relrowsecurity directly").
 *
 * Returns a stable, comparable definition string built from the live catalog, plus the
 * table's relrowsecurity — AC-4 requires citing relrowsecurity=FALSE with zero policies,
 * so the RLS-enabled flag must survive into the captured value, not just the policy body.
 *
 * AMBIGUITY RETURNS NULL. A policy name is unique per (table, policy), not per schema, so a
 * name-only lookup can match rows on several tables. Returning null makes the item
 * UNVERIFIABLE rather than picking one arbitrarily — per the FR-1 decision
 * (docs/reference/ddl-approval-record-definition.md), the fail direction is UNVERIFIABLE,
 * never a false APPLIED. Pass obj.table to disambiguate.
 */
async function capturePolicyDef(client, schema, name, table) {
  const params = table ? [schema, name, table] : [schema, name];
  const r = await client.query(
    `SELECT p.tablename, p.policyname, p.permissive, p.roles::text AS roles, p.cmd,
            COALESCE(p.qual, '') AS qual, COALESCE(p.with_check, '') AS with_check,
            c.relrowsecurity
       FROM pg_policies p
       JOIN pg_class c ON c.relname = p.tablename
       JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = p.schemaname
      WHERE p.schemaname = $1 AND p.policyname = $2
        ${table ? 'AND p.tablename = $3' : ''}`,
    params
  );
  if (r.rows.length !== 1) return null; // 0 = absent, >1 = ambiguous -> UNVERIFIABLE
  const p = r.rows[0];
  return `POLICY ${p.policyname} ON ${schema}.${p.tablename} `
    + `PERMISSIVE=${p.permissive} ROLES=${p.roles} CMD=${p.cmd} `
    + `USING=(${p.qual}) WITH_CHECK=(${p.with_check}) RLS_ENABLED=${p.relrowsecurity}`;
}

/**
 * CONSTRAINT capture — FR-3 (parent FR-4 AC-2: "Constraint items compare
 * pg_get_constraintdef() BODY, never conname alone").
 *
 * The BODY is the point. scripts/verify-migration-apply-state.mjs:358-366 matches on conname
 * only, so a same-named CHECK with a different body reads APPLIED — that fail-open is exactly
 * what this closes. Same ambiguity rule as policies: conname is unique per table, not per
 * schema, so >1 match returns null rather than guessing.
 */
async function captureConstraintDef(client, schema, name, table) {
  const params = table ? [schema, name, table] : [schema, name];
  const r = await client.query(
    `SELECT pg_get_constraintdef(con.oid) AS def, rel.relname AS tablename
       FROM pg_constraint con
       JOIN pg_namespace n ON n.oid = con.connamespace
       LEFT JOIN pg_class rel ON rel.oid = con.conrelid
      WHERE n.nspname = $1 AND con.conname = $2
        ${table ? 'AND rel.relname = $3' : ''}`,
    params
  );
  if (r.rows.length !== 1) return null; // 0 = absent, >1 = ambiguous -> UNVERIFIABLE
  return `CONSTRAINT ${name} ON ${schema}.${r.rows[0].tablename} ${r.rows[0].def}`;
}

export async function captureObjectDefinitions(client, declaredObjects) {
  const out = [];
  for (const obj of declaredObjects) {
    let definition = null;
    if (obj.kind === 'FUNCTION') definition = await captureFunctionDef(client, obj.schema, obj.name);
    else if (obj.kind === 'TRIGGER') definition = await captureTriggerDef(client, obj.schema, obj.name);
    else if (obj.kind === 'VIEW') definition = await captureViewDef(client, obj.schema, obj.name);
    else if (obj.kind === 'INDEX') definition = await captureIndexDef(client, obj.schema, obj.name);
    // FR-2/FR-3 (SD-FDBK-INFRA-LIVE-PROBE-DDL-001): POLICY and CONSTRAINT were the declared
    // gap — migration-object-parser.js:5 scopes the MVP to FUNCTION/TRIGGER/VIEW/INDEX, which
    // is precisely why access-control DDL has never been verifiable. obj.table is optional and
    // disambiguates; without it an ambiguous match returns null (-> UNVERIFIABLE, never APPLIED).
    else if (obj.kind === 'POLICY') definition = await capturePolicyDef(client, obj.schema, obj.name, obj.table);
    else if (obj.kind === 'CONSTRAINT') definition = await captureConstraintDef(client, obj.schema, obj.name, obj.table);
    out.push({ kind: obj.kind, schema: obj.schema, name: obj.name, ...(obj.table ? { table: obj.table } : {}), definition });
  }
  return out;
}

export function buildObjectDiffs(beforeDefs, afterDefs) {
  const byKey = new Map();
  for (const b of beforeDefs) byKey.set(`${b.kind}::${b.schema}::${b.name}`, { before: b.definition });
  for (const a of afterDefs) {
    const k = `${a.kind}::${a.schema}::${a.name}`;
    const entry = byKey.get(k) || { before: null };
    entry.after = a.definition;
    entry.kind = a.kind;
    entry.schema = a.schema;
    entry.name = a.name;
    byKey.set(k, entry);
  }
  const out = [];
  for (const [, v] of byKey) {
    const changed = (v.before || null) !== (v.after || null);
    out.push({ kind: v.kind, schema: v.schema, name: v.name, before: v.before ?? null, after: v.after ?? null, changed });
  }
  return out;
}
