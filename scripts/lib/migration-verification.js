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

export async function captureObjectDefinitions(client, declaredObjects) {
  const out = [];
  for (const obj of declaredObjects) {
    let definition = null;
    if (obj.kind === 'FUNCTION') definition = await captureFunctionDef(client, obj.schema, obj.name);
    else if (obj.kind === 'TRIGGER') definition = await captureTriggerDef(client, obj.schema, obj.name);
    else if (obj.kind === 'VIEW') definition = await captureViewDef(client, obj.schema, obj.name);
    else if (obj.kind === 'INDEX') definition = await captureIndexDef(client, obj.schema, obj.name);
    out.push({ kind: obj.kind, schema: obj.schema, name: obj.name, definition });
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
