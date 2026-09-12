import { createDatabaseClient } from '../scripts/lib/supabase-connection.js';
const c = await createDatabaseClient('engineer', { verify: false });
const read = async (label) => {
  const r = await c.query(`SELECT proconfig, prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='val_probe_cor_fn'`);
  console.log(label, JSON.stringify(r.rows));
};
try {
  await c.query(`CREATE OR REPLACE FUNCTION val_probe_cor_fn() RETURNS int AS $x$ BEGIN RETURN 1; END; $x$ LANGUAGE plpgsql SECURITY DEFINER`);
  await read('after create            :');
  await c.query(`ALTER FUNCTION public.val_probe_cor_fn() SET search_path = public, pg_catalog`);
  await read('after ALTER SET sp      :');
  await c.query(`CREATE OR REPLACE FUNCTION val_probe_cor_fn() RETURNS int AS $x$ BEGIN RETURN 2; END; $x$ LANGUAGE plpgsql SECURITY DEFINER`);
  await read('after CREATE OR REPLACE :');
  console.log('\nVERDICT: if the last line shows proconfig null, CREATE OR REPLACE WIPES the pinned search_path.');
} finally {
  await c.query('DROP FUNCTION IF EXISTS val_probe_cor_fn()').catch(()=>{});
  await c.end();
}
