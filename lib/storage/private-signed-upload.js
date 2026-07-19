/**
 * private-signed-upload — SD-LEO-INFRA-CHAIRMAN-DAILY-REVIEW-DOC-001-D.
 *
 * Built from first principles: the parent SD's PRD cited lib/eva/logo-image-generator.js and
 * lib/eva/stage-handlers/s11.js as "private-bucket + signed-URL precedent" -- both are actually
 * PUBLIC-bucket examples (createBucket public:true + getPublicUrl). grep -rl createSignedUrl
 * over lib/ and scripts/ returns zero real-implementation hits repo-wide. This module NEVER
 * calls getPublicUrl and NEVER creates a bucket with public:true -- confidentiality-critical for
 * the chairman's roadmap image (a public-URL attempt was already correctly blocked, 2026-07-18).
 */

/**
 * Ensures `bucket` exists as a PRIVATE (public:false) Supabase Storage bucket, uploads `buffer`
 * to `path`, and returns a short-TTL signed URL. Never calls getPublicUrl.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{bucket: string, path: string, buffer: Buffer, contentType: string, expiresInSeconds: number}} args
 * @returns {Promise<{path: string, signedUrl: string}>}
 */
export async function uploadPrivateAndSign(supabase, { bucket, path, buffer, contentType, expiresInSeconds }) {
  // Create-or-use: tolerate an already-exists error rather than failing the whole upload.
  const { error: createErr } = await supabase.storage.createBucket(bucket, { public: false });
  if (createErr && !/already exists/i.test(createErr.message || '')) {
    throw new Error(`private-signed-upload: createBucket failed: ${createErr.message}`);
  }

  const { error: uploadErr } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, { contentType, upsert: true });
  if (uploadErr) throw new Error(`private-signed-upload: upload failed: ${uploadErr.message}`);

  const { data, error: signErr } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);
  if (signErr) throw new Error(`private-signed-upload: createSignedUrl failed: ${signErr.message}`);

  return { path, signedUrl: data.signedUrl };
}

export default { uploadPrivateAndSign };
