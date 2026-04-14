/**
 * Logo Image Generator
 * SD-EVA-FEAT-LOGO-IMAGEN-PIPELINE-001
 *
 * Post-S11 hook that generates venture logo images using Google Imagen 3
 * via the Gemini API, uploads to Supabase Storage, and writes the URL
 * to venture_artifacts via the artifact persistence service.
 */
import { createClient } from '@supabase/supabase-js';
import { writeArtifact } from './artifact-persistence-service.js';
import dotenv from 'dotenv';
dotenv.config();

const IMAGEN_MODEL = 'imagen-3.0-generate-002';
const MAX_RETRIES = 2;
const BUCKET_NAME = 'venture-logos';

/**
 * Sanitize logo spec into a safe Imagen prompt.
 * @param {object} logoSpec - Brand identity data from S11
 * @returns {string} Sanitized prompt
 */
export function buildLogoPrompt(logoSpec) {
  if (!logoSpec || typeof logoSpec !== 'object') {
    return 'A clean, modern startup logo with blue and white colors';
  }
  const name = String(logoSpec.name || logoSpec.selectedName || 'Startup').slice(0, 50).replace(/[^\w\s-]/g, '');
  const colors = Array.isArray(logoSpec.colors)
    ? logoSpec.colors.slice(0, 3).map(c => String(c.hex || c).slice(0, 7)).join(', ')
    : logoSpec.primaryColor || 'blue';
  const style = String(logoSpec.style || 'modern minimalist').slice(0, 30).replace(/[^\w\s-]/g, '');
  return `A professional ${style} logo for "${name}". Colors: ${colors}. Clean vector style on white background, suitable for web header. No text overlay, icon only.`;
}

function buildSimplifiedPrompt(logoSpec) {
  const name = String(logoSpec?.name || 'Startup').slice(0, 30).replace(/[^\w\s]/g, '');
  return `A simple, clean geometric logo icon in blue tones on white background for a company called "${name}". Minimal, professional, icon only.`;
}

async function callImagen(prompt) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) { console.warn('[logo-gen] No API key — skipping'); return null; }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:predict?key=${apiKey}`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1, aspectRatio: '1:1', safetyFilterLevel: 'block_few' },
      }),
    });
    if (!response.ok) { console.warn(`[logo-gen] Imagen ${response.status}`); return null; }
    const data = await response.json();
    const imageData = data?.predictions?.[0]?.bytesBase64Encoded;
    return imageData ? Buffer.from(imageData, 'base64') : null;
  } catch (err) { console.warn(`[logo-gen] ${err.message}`); return null; }
}

async function uploadToStorage(supabase, ventureId, imageBuffer) {
  const filePath = `${ventureId}/logo.png`;
  const { error } = await supabase.storage.from(BUCKET_NAME).upload(filePath, imageBuffer, { contentType: 'image/png', upsert: true });
  if (error) { console.warn(`[logo-gen] Upload failed: ${error.message}`); return null; }
  const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);
  return urlData?.publicUrl || null;
}

/**
 * Generate and store a logo image for a venture.
 * @param {string} ventureId
 * @param {object} logoSpec - Brand identity from S11
 * @param {object} [options]
 * @returns {Promise<{success: boolean, logoUrl: string|null, error: string|null}>}
 */
export async function generateLogoImage(ventureId, logoSpec, options = {}) {
  const { minStage = 7 } = options;
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Viability gate
  const { data: venture } = await supabase.from('ventures').select('current_lifecycle_stage').eq('id', ventureId).single();
  if (!venture || venture.current_lifecycle_stage < minStage) {
    return { success: false, logoUrl: null, error: `Stage ${venture?.current_lifecycle_stage || 0} < ${minStage}` };
  }

  // Idempotency
  const { data: existing } = await supabase.from('venture_artifacts')
    .select('id, content').eq('venture_id', ventureId).eq('artifact_type', 'logo_image').eq('is_current', true).maybeSingle();
  if (existing?.content?.logo_url) {
    return { success: true, logoUrl: existing.content.logo_url, error: null };
  }

  // Generate with retries
  let imageBuffer = null;
  let prompt = buildLogoPrompt(logoSpec);
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    imageBuffer = await callImagen(prompt);
    if (imageBuffer) break;
    if (attempt < MAX_RETRIES) { prompt = buildSimplifiedPrompt(logoSpec); }
  }
  if (!imageBuffer) return { success: false, logoUrl: null, error: 'Generation failed' };

  // Upload
  const logoUrl = await uploadToStorage(supabase, ventureId, imageBuffer);
  if (!logoUrl) return { success: false, logoUrl: null, error: 'Upload failed' };

  // Write via persistence service
  await writeArtifact(supabase, {
    ventureId, lifecycleStage: 11, artifactType: 'logo_image',
    content: { logo_url: logoUrl, prompt, generated_at: new Date().toISOString() },
  });

  return { success: true, logoUrl, error: null };
}

export default { generateLogoImage, buildLogoPrompt };
