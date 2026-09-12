const j = require(process.argv[2]);
console.log('numTotalTestSuites', j.numTotalTestSuites);
console.log('numPassedTestSuites', j.numPassedTestSuites);
console.log('numFailedTestSuites', j.numFailedTestSuites);
console.log('numTotalTests', j.numTotalTests);
console.log('numPassedTests', j.numPassedTests);
console.log('numFailedTests', j.numFailedTests);
console.log('numPendingTests', j.numPendingTests);
console.log('success', j.success);
console.log('--- per file ---');
for (const r of j.testResults) {
  const p = r.name.split(/[\/]/).slice(-3).join('/');
  console.log(r.status, String(r.assertionResults.length).padStart(4), p);
}
