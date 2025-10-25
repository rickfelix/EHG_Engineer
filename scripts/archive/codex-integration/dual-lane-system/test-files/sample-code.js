// Sample code file for testing Codex dual-lane workflow
// This file will be used to test real patch generation

function existingFunction() {
  console.log('This is the original function');
  return 'original';
}

function helperFunction(input) {
  return input.toUpperCase();
}

// TODO: Codex will add new functions here

module.exports = {
  existingFunction,
  helperFunction
};