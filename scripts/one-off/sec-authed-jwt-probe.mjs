// Adversarial end-to-end: mint a plain `authenticated` JWT (the same class any signed-in app
// user holds) and attempt to read eva_sync_state over PostgREST. Instrument-diverse from the
// pg_policies read.
import dotenv from 'dotenv'; dotenv.config();
import crypto from 'node:crypto';
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_JWT_SECRET;
const anon = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now()/1000);
const head = b64({ alg:'HS256', typ:'JWT' });
const body = b64({ role:'authenticated', sub:'00000000-0000-0000-0000-0000000000aa', aud:'authenticated', iat:now, exp:now+300 });
const sig = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
const jwt = `${head}.${body}.${sig}`;
const r = await fetch(`${url}/rest/v1/eva_sync_state?select=id,source_identifier,source_metadata`, {
  headers: { apikey: anon, Authorization: `Bearer ${jwt}` },
});
const t = await r.text();
console.log('AUTHENTICATED-JWT SELECT status:', r.status);
console.log('rows returned:', (() => { try { return JSON.parse(t).length; } catch { return 'n/a'; } })());
console.log('body (truncated):', t.slice(0, 600));
