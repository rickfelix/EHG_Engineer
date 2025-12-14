# Vision Brief Visualization

Generate UI mockup visualizations from approved vision briefs using AI image generation.

## Required Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes* | Google Gemini API key (primary provider) |
| `OPENAI_API_KEY` | Yes* | OpenAI API key (fallback provider) |
| `VISION_VISUALIZATION_MODEL` | No | Override Gemini model (default: `gemini-2.5-flash-image`) |
| `VISION_IMAGE_MODEL` | No | Override OpenAI model (default: `dall-e-3`) |

*At least one API key is required. Both recommended for fallback support.

## Supported Providers

| Provider | Model ID | Notes |
|----------|----------|-------|
| Gemini (primary) | `gemini-2.5-flash-image` | "Nano Banana" - Google's image generation model |
| OpenAI (fallback) | `dall-e-3` | DALL-E 3 1024x1024 |

## Usage

```bash
# Preview mode (shows prompt, no generation)
node scripts/generate-vision-visualization.js SD-FEATURE-001

# Dry-run (shows what would happen)
node scripts/generate-vision-visualization.js SD-FEATURE-001 --dry-run

# Generate and upload
node scripts/generate-vision-visualization.js SD-FEATURE-001 --confirm

# Allow unapproved vision briefs
node scripts/generate-vision-visualization.js SD-FEATURE-001 --confirm --allow-draft

# Force specific provider
node scripts/generate-vision-visualization.js SD-FEATURE-001 --confirm --provider gemini
node scripts/generate-vision-visualization.js SD-FEATURE-001 --confirm --provider openai
```

## Provider Selection Modes

| Mode | Behavior |
|------|----------|
| `auto` (default) | Use Gemini if available, fallback to OpenAI on failure |
| `gemini` | Force Gemini only, fail if unavailable |
| `openai` | Force OpenAI only, fail if unavailable |

## Output

Images are stored in Supabase Storage:
- Bucket: `vision-briefs`
- Path: `sd/{SD-ID}/vision/{timestamp}.png`

Metadata is saved to `sd.metadata.vision_discovery.visualization`:
```json
{
  "status": "draft",
  "url": "https://...",
  "provider": "gemini",
  "model": "gemini-2.5-flash-image",
  "selection_reason": "auto: GEMINI_API_KEY configured (primary)",
  "prompt_hash": "abc123...",
  "version": 1,
  "generated_at": "2025-12-14T..."
}
```

## Troubleshooting

### "Gemini not configured" warning
Add `GEMINI_API_KEY` to your `.env` file:
```bash
echo "GEMINI_API_KEY=your-key-here" >> .env
```

### 404 error from Gemini
Verify model name is correct (`gemini-2.5-flash-image`). Check Google AI docs for latest model IDs.

### Fallback to OpenAI unexpectedly
Check logs for "Primary provider (gemini) failed" message with error details. Common causes:
- Invalid API key
- Rate limiting
- Model not available in region

## Related Scripts

- `generate-vision-brief.js` - Generate vision brief with personas
- `approve-vision-brief.js` - Approve/reject vision brief
- `lib/visualization-provider.js` - Provider factory implementation
