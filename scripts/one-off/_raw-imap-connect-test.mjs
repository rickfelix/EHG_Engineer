import 'dotenv/config';
import { ImapFlow } from 'imapflow';

const client = new ImapFlow({
  host: 'imap.gmail.com',
  port: 993,
  secure: true,
  auth: { user: process.env.VENTURE_UAT_GMAIL_USER, pass: process.env.VENTURE_UAT_GMAIL_APP_PASSWORD },
  logger: false,
});

try {
  await client.connect();
  console.log('CONNECT OK');
  await client.logout();
} catch (err) {
  console.log('MESSAGE:', err.message);
  console.log('CODE:', err.code);
  console.log('RESPONSE:', err.response);
  console.log('RESPONSE_STATUS:', err.responseStatus);
  console.log('RESPONSE_TEXT:', err.responseText);
  console.log('AUTHENTICATION_FAILED:', err.authenticationFailed);
}
process.exit(0);
