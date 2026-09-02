import 'dotenv/config';
import { fetchVerificationCode } from '../../lib/apa/imap-code-fetcher.js';

try {
  await fetchVerificationCode({ aliasLocalPart: 'altifyai-uat', timeoutMs: 8000 });
  console.log('UNEXPECTED: fetchVerificationCode resolved without throwing');
} catch (err) {
  console.log('MESSAGE:', err.message);
  console.log('STACK:', err.stack);
  if (err.cause) console.log('CAUSE:', err.cause);
}
