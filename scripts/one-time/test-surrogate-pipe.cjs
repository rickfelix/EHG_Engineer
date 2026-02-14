/**
 * Test: Do surrogates appear through child process pipes on Windows?
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Write a temp script that produces emoji output
const tempScript = path.join(__dirname, '_temp_emoji_test.js');
fs.writeFileSync(tempScript, `
for(let i = 0; i < 200; i++) {
  console.log(i + ' \\u{1F600}\\u{1F4CB}\\u{2705}\\u{274C}\\u{1F50D}\\u{26A1}\\u{26D4}\\u{2139}\\u{1F4A1}\\u{1F916}\\u{1F4E6}\\u{1F332}\\u{1F33F}\\u{1F4C2} ' + 'x'.repeat(100));
}
`);

try {
  const result = execSync(`node "${tempScript}"`, {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024
  });

  // Scan for lone surrogates
  let surrogates = 0;
  let locations = [];
  for (let i = 0; i < result.length; i++) {
    const code = result.charCodeAt(i);
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = result.charCodeAt(i + 1);
      if (!(next >= 0xDC00 && next <= 0xDFFF)) {
        surrogates++;
        locations.push({ idx: i, code: code.toString(16) });
      }
    } else if (code >= 0xDC00 && code <= 0xDFFF) {
      const prev = result.charCodeAt(i - 1);
      if (!(prev >= 0xD800 && prev <= 0xDBFF)) {
        surrogates++;
        locations.push({ idx: i, code: code.toString(16) });
      }
    }
  }

  console.log('Output size:', result.length, 'chars');
  console.log('Lone surrogates found:', surrogates);
  if (locations.length > 0) {
    console.log('Locations:', JSON.stringify(locations.slice(0, 5)));
  }

  // Also test: Does JSON.stringify of this result produce valid JSON?
  try {
    const jsonStr = JSON.stringify({ output: result });
    JSON.parse(jsonStr); // Should not throw
    console.log('JSON round-trip: OK (size:', jsonStr.length, ')');
  } catch (e) {
    console.log('JSON round-trip FAILED:', e.message);
  }
} catch (e) {
  console.log('Execution error:', e.message);
} finally {
  try { fs.unlinkSync(tempScript); } catch {}
}
