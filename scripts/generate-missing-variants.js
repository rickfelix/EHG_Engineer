#!/usr/bin/env node
/**
 * Generate only the missing avatar variants for incomplete agents
 */

import { createDatabaseClient } from '../../../ehg/scripts/lib/supabase-connection.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const API_ENDPOINT = 'https://api.openai.com/v1/images/generations';

const DIVERSITY_POOL = [
  { ethnicity: 'Dominican', gender: 'male' },
  { ethnicity: 'Dominican', gender: 'female' },
  { ethnicity: 'Asian', gender: 'female' },
  { ethnicity: 'Asian', gender: 'male' },
  { ethnicity: 'Caucasian', gender: 'male' },
  { ethnicity: 'Caucasian', gender: 'female' }
];

const BACKGROUNDS = [
  'Modern glass office with city skyline view softly in background',
  'Contemporary tech office with digital displays softly visible',
  'Traditional executive office with bookshelf softly in background'
];

function selectDiversePersonas() {
  const shuffled = [...DIVERSITY_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3);
}

function getEthnicityDescription(ethnicity, gender) {
  const descriptions = {
    Dominican: {
      male: 'Dominican heritage with elegant blend of Taino indigenous, African, and Spanish features. Warm bronze to caramel skin tone.',
      female: 'Dominican heritage with beautiful blend of Taino, African, and Spanish features. Warm caramel to bronze skin tone, natural dark hair.'
    },
    Asian: {
      male: 'South Asian heritage with warm complexion, friendly intelligent eyes, professional appearance.',
      female: 'East Asian heritage with warm skin tone, intelligent expressive eyes, professional shoulder-length dark hair.'
    },
    Caucasian: {
      male: 'Fair to light olive complexion, clean-cut professional appearance.',
      female: 'Fair to light complexion, polished executive presence, professional styled hair.'
    }
  };
  return descriptions[ethnicity]?.[gender] || 'Professional appearance with warm demeanor.';
}

function generateAvatarPrompt(agentRole, ethnicity, gender, backgroundDesc) {
  const ageRange = gender === 'female' ? 'early to mid 30s' : 'mid to late 30s';
  const ethnicDescription = getEthnicityDescription(ethnicity, gender);

  return `Professional corporate headshot of a confident ${ethnicity} ${gender} ${agentRole} in ${ageRange}.
${ethnicDescription}
Professional expression showing expertise and confidence. Premium business attire, sophisticated appearance.
${backgroundDesc}
Head and shoulders composition, direct professional gaze. Shot with high-end camera, 85mm f/1.4 lens.
Professional lighting. Square composition (1024x1024).
Photorealistic executive headshot with natural skin texture visible.
Expert professional persona.`;
}

async function generateAvatar(prompt) {
  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt: prompt,
      n: 1,
      size: '1024x1024',
      quality: 'high',
      output_format: 'png'
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  return data.data[0].b64_json;
}

async function saveAvatarImage(agentRole, variantNum, imageBase64) {
  const fileName = `agent-${agentRole.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}-v${variantNum}.png`;
  const publicPath = path.join(__dirname, '../../../ehg/public', fileName);

  const imageBuffer = Buffer.from(imageBase64, 'base64');
  await fs.writeFile(publicPath, imageBuffer);

  return `/${fileName}`;
}

async function generateMissingVariants() {
  console.log('🎨 Generating Missing Avatar Variants\n');

  if (!OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not set');
    process.exit(1);
  }

  let client;

  try {
    client = await createDatabaseClient('ehg', {
      verify: true,
      verbose: false
    });

    // Find agents with incomplete avatar sets
    const { rows: incompleteAgents } = await client.query(`
      SELECT
        ca.id,
        ca.name,
        ca.role,
        COUNT(aa.id) as avatar_count,
        ARRAY_AGG(aa.variant_number ORDER BY aa.variant_number) as existing_variants
      FROM crewai_agents ca
      LEFT JOIN agent_avatars aa ON ca.id = aa.agent_id
      WHERE ca.status = 'active'
      GROUP BY ca.id, ca.name, ca.role
      HAVING COUNT(aa.id) < 3
      ORDER BY ca.name
    `);

    if (incompleteAgents.length === 0) {
      console.log('✅ All agents have complete avatar sets!\n');
      return;
    }

    console.log(`📋 Found ${incompleteAgents.length} agents with incomplete avatars:\n`);

    for (const agent of incompleteAgents) {
      const missingVariants = [1, 2, 3].filter(v => !agent.existing_variants.includes(v));
      console.log(`🎯 ${agent.name}`);
      console.log(`   Current: ${agent.avatar_count}/3`);
      console.log(`   Missing variants: ${missingVariants.join(', ')}\n`);

      const personas = selectDiversePersonas();

      for (const variantNum of missingVariants) {
        const persona = personas[variantNum - 1];
        const background = BACKGROUNDS[variantNum - 1];

        console.log(`  🖼️  Generating variant ${variantNum}: ${persona.ethnicity} ${persona.gender}...`);

        const prompt = generateAvatarPrompt(
          agent.role,
          persona.ethnicity,
          persona.gender,
          background
        );

        const imageBase64 = await generateAvatar(prompt);
        const avatarUrl = await saveAvatarImage(agent.role, variantNum, imageBase64);
        const fileSizeMB = (Buffer.from(imageBase64, 'base64').length / (1024 * 1024)).toFixed(2);
        console.log(`    ✅ Saved: ${avatarUrl} (${fileSizeMB} MB)`);

        await client.query(`
          INSERT INTO agent_avatars (
            agent_id, variant_number, avatar_url, description,
            ethnicity, gender, background_setting, generation_status, prompt_used
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed', $8)
        `, [
          agent.id,
          variantNum,
          avatarUrl,
          `${persona.ethnicity} ${persona.gender} ${agent.role}`,
          persona.ethnicity,
          persona.gender,
          background,
          prompt
        ]);

        // Delay between API calls
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      console.log(`  ✅ ${agent.name} complete (3/3)\n`);
    }

    console.log('🎉 All avatars complete!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
    }
  }
}

generateMissingVariants().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
