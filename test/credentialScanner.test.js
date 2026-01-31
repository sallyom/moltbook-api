/**
 * Credential Scanner Tests
 * Run with: node test/credentialScanner.test.js
 */

const { scanString, PATTERNS } = require('../src/middleware/credentialScanner');

// Test cases
const tests = [
  {
    name: 'OpenAI API key',
    text: 'Here is my API key: sk-proj-1234567890abcdefghijklmnopqrstuvwxyz123456',
    shouldDetect: true,
    expectedType: 'openai'
  },
  {
    name: 'GitHub token',
    text: 'Use this token: ghp_1234567890abcdefghijklmnopqrstuv',
    shouldDetect: true,
    expectedType: 'github'
  },
  {
    name: 'AWS access key',
    text: 'My AWS key is AKIAIOSFODNN7EXAMPLE',
    shouldDetect: true,
    expectedType: 'aws'
  },
  {
    name: 'JWT token',
    text: 'Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    shouldDetect: true,
    expectedType: 'jwt'
  },
  {
    name: 'Anthropic API key',
    text: 'sk-ant-api03-1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmnop',
    shouldDetect: true,
    expectedType: 'anthropic'
  },
  {
    name: 'Password literal',
    text: 'My password is password123456',
    shouldDetect: true,
    expectedType: 'password_literal'
  },
  {
    name: 'API key literal',
    text: 'api_key = abcdef1234567890ghijklmn',
    shouldDetect: true,
    expectedType: 'api_key_literal'
  },
  {
    name: 'Clean text',
    text: 'This is a normal post about AI agents collaborating on workflows. No credentials here!',
    shouldDetect: false
  },
  {
    name: 'Multiple violations',
    text: 'I found this key: sk-proj-test123456789012345678901234567890123456 and this token: ghp_1234567890abcdefghijklmnopqrstuv',
    shouldDetect: true,
    expectedMultiple: true
  },
  {
    name: 'Embedded in JSON',
    text: '{"apiKey": "sk-proj-test123456789012345678901234567890123456", "data": "value"}',
    shouldDetect: true,
    expectedType: 'openai'
  }
];

// Run tests
console.log('🧪 Credential Scanner Tests\n');

let passed = 0;
let failed = 0;

tests.forEach((test, index) => {
  const result = scanString(test.text);
  const detected = !result.clean;

  if (detected === test.shouldDetect) {
    if (test.shouldDetect) {
      if (test.expectedType) {
        const foundExpectedType = result.found.some(v => v.type === test.expectedType);
        if (foundExpectedType) {
          console.log(`✅ Test ${index + 1}: ${test.name}`);
          console.log(`   Found: ${result.found.map(v => v.type).join(', ')}`);
          passed++;
        } else {
          console.log(`❌ Test ${index + 1}: ${test.name}`);
          console.log(`   Expected ${test.expectedType}, found: ${result.found.map(v => v.type).join(', ')}`);
          failed++;
        }
      } else {
        console.log(`✅ Test ${index + 1}: ${test.name}`);
        console.log(`   Found: ${result.found.map(v => v.type).join(', ')}`);
        passed++;
      }
    } else {
      console.log(`✅ Test ${index + 1}: ${test.name} (clean)`);
      passed++;
    }
  } else {
    console.log(`❌ Test ${index + 1}: ${test.name}`);
    console.log(`   Expected detection: ${test.shouldDetect}, got: ${detected}`);
    if (detected) {
      console.log(`   Found: ${JSON.stringify(result.found, null, 2)}`);
    }
    failed++;
  }
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

if (failed === 0) {
  console.log('✨ All tests passed!\n');
  process.exit(0);
} else {
  console.log('⚠️  Some tests failed.\n');
  process.exit(1);
}
