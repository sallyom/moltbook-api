/**
 * Custom Patterns Test
 * Tests that custom credential patterns can be loaded from file
 */

const fs = require('fs');
const path = require('path');

// Create test patterns file
const testPatternsPath = path.join(__dirname, '.test_patterns.json');
const testPatterns = {
  "patterns": {
    "acme_api_key": {
      "regex": "ACME_[A-Z0-9]{32}",
      "description": "ACME Corp API key",
      "enabled": true
    },
    "disabled_pattern": {
      "regex": "DISABLED_.*",
      "description": "This should be skipped",
      "enabled": false
    },
    "db_connection": {
      "regex": "mysql://[^\\s]+:[^\\s]+@[^\\s]+",
      "description": "MySQL connection string",
      "enabled": true
    }
  }
};

fs.writeFileSync(testPatternsPath, JSON.stringify(testPatterns, null, 2));

// Set environment to use test file
process.env.CREDENTIAL_PATTERNS_FILE = testPatternsPath;

// Now load the scanner (will pick up custom patterns)
const { scanString, CUSTOM_PATTERNS, ALL_PATTERNS } = require('../src/middleware/credentialScanner');

console.log('🧪 Custom Patterns Test\n');

// Test 1: Verify custom patterns loaded
console.log('Test 1: Custom patterns loaded');
const customKeys = Object.keys(CUSTOM_PATTERNS);
console.log(`  Loaded patterns: ${customKeys.join(', ')}`);
if (customKeys.includes('custom_acme_api_key') && customKeys.includes('custom_db_connection')) {
  console.log('  ✅ Expected patterns found');
} else {
  console.log('  ❌ Missing expected patterns');
  process.exit(1);
}

if (customKeys.includes('custom_disabled_pattern')) {
  console.log('  ❌ Disabled pattern was loaded (should be skipped)');
  process.exit(1);
} else {
  console.log('  ✅ Disabled pattern correctly skipped');
}

// Test 2: Detect ACME API key
console.log('\nTest 2: Detect ACME API key');
const acmeTest = 'Use this key: ACME_12345678901234567890123456789012';  // Exactly 32 chars after ACME_
const acmeResult = scanString(acmeTest);
if (!acmeResult.clean && acmeResult.found.some(v => v.type === 'custom_acme_api_key')) {
  console.log('  ✅ ACME API key detected');
} else {
  console.log('  ❌ ACME API key not detected');
  console.log('  Found:', acmeResult.found);
  process.exit(1);
}

// Test 3: Detect MySQL connection
console.log('\nTest 3: Detect MySQL connection string');
const mysqlTest = 'Database: mysql://user:password@localhost/db';
const mysqlResult = scanString(mysqlTest);
if (!mysqlResult.clean && mysqlResult.found.some(v => v.type === 'custom_db_connection')) {
  console.log('  ✅ MySQL connection string detected');
} else {
  console.log('  ❌ MySQL connection string not detected');
  console.log('  Found:', mysqlResult.found);
  process.exit(1);
}

// Test 4: Verify disabled pattern not detected
console.log('\nTest 4: Verify disabled pattern not detected');
const disabledTest = 'DISABLED_THIS_SHOULD_NOT_TRIGGER';
const disabledResult = scanString(disabledTest);
if (disabledResult.found.some(v => v.type === 'custom_disabled_pattern')) {
  console.log('  ❌ Disabled pattern was detected (should be skipped)');
  process.exit(1);
} else {
  console.log('  ✅ Disabled pattern correctly ignored');
}

// Test 5: Built-in patterns still work
console.log('\nTest 5: Built-in patterns still work alongside custom');
const builtinTest = 'OpenAI key: sk-proj-test123456789012345678901234567890123456';
const builtinResult = scanString(builtinTest);
if (!builtinResult.clean && builtinResult.found.some(v => v.type === 'openai')) {
  console.log('  ✅ Built-in OpenAI pattern still works');
} else {
  console.log('  ❌ Built-in pattern broken');
  process.exit(1);
}

// Cleanup
fs.unlinkSync(testPatternsPath);

console.log('\n✨ All custom pattern tests passed!\n');
console.log('Summary:');
console.log(`  Built-in patterns: ${Object.keys(ALL_PATTERNS).filter(k => !k.startsWith('custom_')).length}`);
console.log(`  Custom patterns: ${Object.keys(CUSTOM_PATTERNS).length}`);
console.log(`  Total patterns: ${Object.keys(ALL_PATTERNS).length}`);
