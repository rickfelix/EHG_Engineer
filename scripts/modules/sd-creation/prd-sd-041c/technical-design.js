/**
 * Technical Design for SD-041C PRD
 *
 * Contains the technical architecture, system components, data flow,
 * and AI provider integration details.
 */

export const technicalDesign = `## Technical Architecture

### System Components

1. **GitHub Webhook Receiver** (/api/webhooks/github)
   - Express.js endpoint
   - HMAC signature validation middleware
   - Rate limiting (express-rate-limit)
   - Payload parsing and filtering

2. **AI Analysis Service** (lib/services/aiAnalysisService.ts)
   - Anthropic Claude 3.5 Sonnet integration
   - Prompt template engine
   - Response parser and validator
   - Retry logic with exponential backoff

3. **Documentation Generator** (lib/services/docGeneratorService.ts)
   - Handlebars template engine
   - Markdown validator
   - Slug generator
   - Version tracking

4. **Admin Dashboard** (src/client/src/pages/AdminDocumentation.tsx)
   - Shadcn UI components (Table, Card, Dialog, Form)
   - React Query for data fetching
   - Monaco Editor for markdown editing
   - Real-time preview with react-markdown

5. **Background Job Processor** (lib/workers/docWorker.ts)
   - Bull queue for async job processing
   - Webhook event processing
   - AI analysis jobs
   - Doc generation jobs

### Data Flow

\`\`\`
GitHub Push Event
  -> Webhook Receiver (validate HMAC)
  -> Store webhook_events
  -> Enqueue AI Analysis Job
  -> AI Service (Anthropic Claude)
  -> Parse AI Response
  -> Generate Doc (Handlebars)
  -> Store generated_docs (draft)
  -> Notify Admin (email/Slack)
  -> Admin Reviews via Dashboard
  -> Approve -> Publish
  -> Public Docs Site
\`\`\`

### AI Provider: Anthropic Claude 3.5 Sonnet

**Rationale**:
- Superior code comprehension vs GPT-4
- Cleaner JSON output (fewer parsing errors)
- Lower cost ($3/MTok input vs $10/MTok GPT-4)
- Faster response time (2-3s vs 5-7s)
- Better at following system prompts

**API Integration**:
\`\`\`typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

async function analyzeCode(fileDiff: string, context: string) {
  const response = await client.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 4096,
    temperature: 0.3,
    messages: [{
      role: 'user',
      content: \`You are a technical documentation generator...\\n\\n\${prompt}\`
    }]
  });

  return JSON.parse(response.content[0].text);
}
\`\`\`

### Dependencies
- @anthropic-ai/sdk: ^0.27.0
- express-rate-limit: ^7.0.0
- handlebars: ^4.7.8
- bull: ^4.12.0
- react-markdown: ^9.0.0
- monaco-editor: ^0.45.0`;
