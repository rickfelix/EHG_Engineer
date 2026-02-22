#!/usr/bin/env node
// SD-LEO-ENH-ORG-STRUCTURE-AGENT-001: Send Department Message CLI
// Sends a message to a department, which fans out to all member agent inboxes.

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--department-id' && args[i + 1]) {
      parsed.departmentId = args[++i];
    } else if (args[i] === '--sender-id' && args[i + 1]) {
      parsed.senderId = args[++i];
    } else if (args[i] === '--content' && args[i + 1]) {
      parsed.content = args[++i];
    } else if (args[i] === '--metadata' && args[i + 1]) {
      try {
        parsed.metadata = JSON.parse(args[++i]);
      } catch {
        parsed.metadata = {};
      }
    } else if (args[i] === '--help' || args[i] === '-h') {
      parsed.help = true;
    }
  }
  return parsed;
}

function showUsage() {
  console.log(`Usage: node send-department-message.cjs [options]

Options:
  --department-id <uuid>   Department to send message to (required)
  --sender-id <uuid>       Agent sending the message (required)
  --content <text>         Message content (required)
  --metadata <json>        Optional JSON metadata
  --help, -h               Show this help message

Example:
  node send-department-message.cjs \\
    --department-id abc-123 \\
    --sender-id def-456 \\
    --content "Team standup at 10am"
`);
}

async function main(supabase) {
  const args = parseArgs();

  if (args.help || (!args.departmentId && !args.senderId && !args.content)) {
    showUsage();
    return;
  }

  if (!args.departmentId) {
    console.error('Error: --department-id is required');
    process.exit(1);
  }

  if (!args.senderId) {
    console.error('Error: --sender-id is required');
    process.exit(1);
  }

  if (!args.content) {
    console.error('Error: --content is required');
    process.exit(1);
  }

  const { data, error } = await supabase.rpc('send_department_message', {
    p_department_id: args.departmentId,
    p_sender_id: args.senderId,
    p_content: args.content,
    p_metadata: args.metadata || {},
  });

  if (error) {
    console.error('Error sending department message:', error.message);
    process.exit(1);
  }

  console.log(`✅ Department message sent successfully`);
  console.log(`   Message ID: ${data}`);
  console.log(`   Department: ${args.departmentId}`);
  console.log(`   Sender: ${args.senderId}`);
  console.log(`   Content: ${args.content}`);
}

if (require.main === module) {
  require('dotenv').config();
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  main(supabase);
}

module.exports = { main, parseArgs };
