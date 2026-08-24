// SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 — EXEC SECURITY review F3, PRD half.
//
// TR-4 and FR-3 both frame the non-coverage boundary around service_role alone. Measured live
// (database/evidence/canonical-writer-choke/deploy-order-and-role-surface.json), `authenticated`
// also holds a table-level UPDATE grant AND a PERMISSIVE UPDATE policy
// (venture_update_strategic_directives_v2, qual `((venture_id IS NULL) OR
// fn_user_has_venture_access(venture_id))`), so the guard adds no protection against it either.
//
// STRICTLY ADDITIVE, and deliberately so: this APPENDS one clearly-marked amendment to each of the
// two descriptions and rewrites nothing else. The PRD is being edited concurrently by the team lead,
// so the read-modify-write window is kept to a single round trip and every anchor is asserted before
// and after. Idempotent — re-running is a no-op.
import { createDatabaseClient } from '../lib/supabase-connection.js';

const PRD_ID = 'PRD-SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001';
const MARKER = 'EXEC-PHASE SECURITY AMENDMENT (F3, measured live 2026-08-24)';

const AMENDMENT =
  ` ${MARKER}: the non-coverage boundary above names service_role, but that is NARROWER THAN THE ` +
  `ESTATE SUPPORTS. Measured live via pg_policies + information_schema.role_table_grants (evidence: ` +
  `database/evidence/canonical-writer-choke/deploy-order-and-role-surface.json), the role ` +
  `\`authenticated\` ALSO holds a table-level UPDATE grant on strategic_directives_v2 AND a ` +
  `PERMISSIVE UPDATE policy -- venture_update_strategic_directives_v2, qual ((venture_id IS NULL) OR ` +
  `fn_user_has_venture_access(venture_id)). Nearly every SD carries venture_id IS NULL, so ` +
  `\`authenticated\` can UPDATE nearly every row, and can enumerate the valid identities through the ` +
  `EXECUTE grant the migration adds on sd_canonical_writer_policy(). THE GUARD THEREFORE ADDS NO ` +
  `PROTECTION AGAINST \`authenticated\` EITHER, and this is a DISTINCT case from the service_role one ` +
  `-- it does not depend on ALTER TABLE ... DISABLE TRIGGER access, only on an ordinary permissive ` +
  `RLS qual. CRITICALLY, THIS IS NOT A PRIVILEGE EXPANSION INTRODUCED BY THIS SD: before the guard, ` +
  `\`authenticated\` could already write any lifecycle column with no stamp required at all, so its ` +
  `capability is unchanged, and the registry EXECUTE grant is a PREREQUISITE for its writes to be ` +
  `evaluated rather than failing on permission-denied. \`anon\` is genuinely different and IS blocked: ` +
  `it holds the table-level UPDATE grant but no anon UPDATE policy, so RLS filters every row. Stated ` +
  `here because a reader given only the service_role framing would infer a boundary against ` +
  `authenticated users that does not exist.`;

const client = await createDatabaseClient('engineer', { verify: false });

const { rows } = await client.query(
  'SELECT technical_requirements, functional_requirements FROM product_requirements_v2 WHERE id = $1',
  [PRD_ID],
);
if (rows.length !== 1) throw new Error(`expected exactly 1 PRD row, got ${rows.length}`);

const trs = rows[0].technical_requirements;
const frs = rows[0].functional_requirements;
if (!Array.isArray(trs) || !Array.isArray(frs)) throw new Error('requirements are not arrays — refusing to write');

const tr4 = trs.find((t) => t.id === 'TR-4');
const fr3 = frs.find((f) => f.id === 'FR-3');
if (!tr4) throw new Error('TR-4 not found');
if (!fr3) throw new Error('FR-3 not found');

// Sanity: these must be the requirements that actually make the narrow claim, or the amendment is
// being appended to the wrong text.
if (!/non-coverage|CHOKE, not an absolute barrier|choke/i.test(tr4.description)) {
  throw new Error('TR-4 description does not look like the non-coverage disclosure — refusing to write');
}
if (!/service_role/.test(fr3.description)) {
  throw new Error('FR-3 description no longer mentions service_role — anchor drifted, refusing to write');
}

let changed = 0;
if (!tr4.description.includes(MARKER)) {
  tr4.description += AMENDMENT;
  changed += 1;
}
if (!fr3.description.includes(MARKER)) {
  fr3.description += AMENDMENT;
  changed += 1;
}

if (changed === 0) {
  console.log('ALREADY_AMENDED — no write performed (idempotent re-run)');
} else {
  await client.query(
    `UPDATE product_requirements_v2
        SET technical_requirements = $2::jsonb,
            functional_requirements = $3::jsonb,
            updated_at = NOW()
      WHERE id = $1`,
    [PRD_ID, JSON.stringify(trs), JSON.stringify(frs)],
  );
  console.log(`AMENDED ${changed} requirement description(s)`);
}

// Read back independently rather than trusting the UPDATE's return.
const { rows: after } = await client.query(
  'SELECT technical_requirements, functional_requirements FROM product_requirements_v2 WHERE id = $1',
  [PRD_ID],
);
const tr4After = after[0].technical_requirements.find((t) => t.id === 'TR-4');
const fr3After = after[0].functional_requirements.find((f) => f.id === 'FR-3');
console.log('TR-4 carries amendment:', tr4After.description.includes(MARKER));
console.log('FR-3 carries amendment:', fr3After.description.includes(MARKER));
console.log('TR count preserved:', after[0].technical_requirements.length === trs.length);
console.log('FR count preserved:', after[0].functional_requirements.length === frs.length);

await client.end();
