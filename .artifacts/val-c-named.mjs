try {
  const m = await import('file:///C:/Users/rickf/AppData/Local/Temp/enc-probe.cjs');
  console.log('namespace keys:', Object.keys(m).join(','));
  console.log('named CredentialEncryption import works?', typeof m.CredentialEncryption === 'function');
} catch (e) { console.log('named import FAILED:', e.message.slice(0,160)); }
