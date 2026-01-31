/**
 * Audit Logging Tests
 * Phase 3 Guardrails: Audit Logging + OpenTelemetry
 * Run with: node test/auditLog.test.js
 */

// Test harness
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    testsPassed++;
  } else {
    console.log(`  ❌ ${message}`);
    testsFailed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    console.log(`  ✅ ${message}`);
    testsPassed++;
  } else {
    console.log(`  ❌ ${message}`);
    console.log(`     Expected: ${expected}`);
    console.log(`     Got: ${actual}`);
    testsFailed++;
  }
}

console.log('🧪 Audit Logging Tests\n');

// Test 1: Verify AuditService exists and has required methods
console.log('Test 1: AuditService module structure');
try {
  const AuditService = require('../src/services/AuditService');

  assert(typeof AuditService.logAction === 'function', 'AuditService has logAction method');
  assert(typeof AuditService.queryLogs === 'function', 'AuditService has queryLogs method');
  assert(typeof AuditService.getAgentActivity === 'function', 'AuditService has getAgentActivity method');
  assert(typeof AuditService.getResourceHistory === 'function', 'AuditService has getResourceHistory method');
  assert(typeof AuditService.getStats === 'function', 'AuditService has getStats method');
  assert(typeof AuditService.exportLogs === 'function', 'AuditService has exportLogs method');
  assert(typeof AuditService.cleanupOldLogs === 'function', 'AuditService has cleanupOldLogs method');

  console.log('');
} catch (error) {
  console.log(`  ❌ AuditService test failed: ${error.message}\n`);
  testsFailed++;
}

// Test 2: Verify helper methods exist
console.log('Test 2: AuditService helper methods');
try {
  const AuditService = require('../src/services/AuditService');

  assert(typeof AuditService.logPostCreated === 'function', 'Has logPostCreated helper');
  assert(typeof AuditService.logCommentCreated === 'function', 'Has logCommentCreated helper');
  assert(typeof AuditService.logCredentialBlocked === 'function', 'Has logCredentialBlocked helper');
  assert(typeof AuditService.logApproval === 'function', 'Has logApproval helper');
  assert(typeof AuditService.logAuthentication === 'function', 'Has logAuthentication helper');

  console.log('');
} catch (error) {
  console.log(`  ❌ Helper methods test failed: ${error.message}\n`);
  testsFailed++;
}

// Test 3: Verify OTEL telemetry module
console.log('Test 3: OpenTelemetry telemetry module');
try {
  const telemetry = require('../src/observability/telemetry');

  assert(typeof telemetry.initializeOTEL === 'function', 'Has initializeOTEL function');
  assert(typeof telemetry.emitAuditLog === 'function', 'Has emitAuditLog function');
  assert(typeof telemetry.shutdownOTEL === 'function', 'Has shutdownOTEL function');

  console.log('');
} catch (error) {
  console.log(`  ❌ Telemetry module test failed: ${error.message}\n`);
  testsFailed++;
}

// Test 4: Verify audit middleware
console.log('Test 4: Audit log middleware');
try {
  const { auditLogMiddleware } = require('../src/middleware/auditLog');

  assert(typeof auditLogMiddleware === 'function', 'Middleware exports auditLogMiddleware function');

  console.log('');
} catch (error) {
  console.log(`  ❌ Middleware test failed: ${error.message}\n`);
  testsFailed++;
}

// Test 5: Verify config has OTEL settings
console.log('Test 5: Configuration includes OTEL settings');
try {
  // Set OTEL env vars for testing
  process.env.OTEL_ENABLED = 'true';
  process.env.OTEL_SERVICE_NAME = 'moltbook-api-test';
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://otel-collector:4318';

  // Clear require cache to reload config
  delete require.cache[require.resolve('../src/config')];
  const config = require('../src/config');

  assert(config.otel !== undefined, 'Config has otel section');
  assertEqual(config.otel.enabled, true, 'OTEL enabled from env var');
  assertEqual(config.otel.serviceName, 'moltbook-api-test', 'Service name from env var');
  assertEqual(config.otel.endpoint, 'http://otel-collector:4318', 'OTEL endpoint from env var');

  console.log('');
} catch (error) {
  console.log(`  ❌ Config test failed: ${error.message}\n`);
  testsFailed++;
}

// Test 6: Verify audit log integration in credential scanner
console.log('Test 6: Credential scanner audit integration');
try {
  const credentialScannerCode = require('fs').readFileSync(
    './src/middleware/credentialScanner.js',
    'utf-8'
  );

  assert(
    credentialScannerCode.includes('AuditService'),
    'Credential scanner imports AuditService'
  );
  assert(
    credentialScannerCode.includes('logCredentialBlocked'),
    'Credential scanner calls logCredentialBlocked'
  );

  console.log('');
} catch (error) {
  console.log(`  ❌ Credential scanner integration test failed: ${error.message}\n`);
  testsFailed++;
}

// Test 7: Verify audit log integration in PostService
console.log('Test 7: PostService audit integration');
try {
  const postServiceCode = require('fs').readFileSync(
    './src/services/PostService.js',
    'utf-8'
  );

  assert(
    postServiceCode.includes('AuditService'),
    'PostService imports AuditService'
  );
  assert(
    postServiceCode.includes('logPostCreated') || postServiceCode.includes('logApproval'),
    'PostService logs audit events'
  );

  console.log('');
} catch (error) {
  console.log(`  ❌ PostService integration test failed: ${error.message}\n`);
  testsFailed++;
}

// Test 8: Verify audit log integration in CommentService
console.log('Test 8: CommentService audit integration');
try {
  const commentServiceCode = require('fs').readFileSync(
    './src/services/CommentService.js',
    'utf-8'
  );

  assert(
    commentServiceCode.includes('AuditService'),
    'CommentService imports AuditService'
  );
  assert(
    commentServiceCode.includes('logCommentCreated') || commentServiceCode.includes('logApproval'),
    'CommentService logs audit events'
  );

  console.log('');
} catch (error) {
  console.log(`  ❌ CommentService integration test failed: ${error.message}\n`);
  testsFailed++;
}

// Test 9: Verify admin audit routes exist
console.log('Test 9: Admin audit routes');
try {
  const adminRoutesCode = require('fs').readFileSync(
    './src/routes/admin.js',
    'utf-8'
  );

  assert(
    adminRoutesCode.includes('/audit/logs'),
    'Has GET /admin/audit/logs route'
  );
  assert(
    adminRoutesCode.includes('/audit/agent'),
    'Has GET /admin/audit/agent/:name route'
  );
  assert(
    adminRoutesCode.includes('/audit/export'),
    'Has GET /admin/audit/export route'
  );
  assert(
    adminRoutesCode.includes('/audit/stats'),
    'Has GET /admin/audit/stats route'
  );

  console.log('');
} catch (error) {
  console.log(`  ❌ Admin routes test failed: ${error.message}\n`);
  testsFailed++;
}

// Test 10: Verify OTEL initialization in index.js
console.log('Test 10: OTEL initialization in main app');
try {
  const indexCode = require('fs').readFileSync(
    './src/index.js',
    'utf-8'
  );

  assert(
    indexCode.includes('initializeOTEL'),
    'Main app imports initializeOTEL'
  );
  assert(
    indexCode.includes('shutdownOTEL'),
    'Main app imports shutdownOTEL'
  );
  assert(
    indexCode.includes('config.otel.enabled'),
    'Main app checks OTEL config'
  );

  console.log('');
} catch (error) {
  console.log(`  ❌ Main app integration test failed: ${error.message}\n`);
  testsFailed++;
}

// Test 11: Verify database migration exists
console.log('Test 11: Audit log database migration');
try {
  const migrationCode = require('fs').readFileSync(
    './scripts/migrations/004_add_audit_log.sql',
    'utf-8'
  );

  assert(
    migrationCode.includes('CREATE TABLE audit_log'),
    'Migration creates audit_log table'
  );
  assert(
    migrationCode.includes('prevent_audit_log_modification'),
    'Migration includes immutability trigger'
  );
  assert(
    migrationCode.includes('idx_audit_log_timestamp'),
    'Migration creates timestamp index'
  );
  assert(
    migrationCode.includes('idx_audit_log_agent'),
    'Migration creates agent index'
  );

  console.log('');
} catch (error) {
  console.log(`  ❌ Migration test failed: ${error.message}\n`);
  testsFailed++;
}

// Test 12: Verify package.json has OTEL dependencies
console.log('Test 12: OpenTelemetry dependencies');
try {
  const packageJson = require('../package.json');

  assert(
    packageJson.dependencies['@opentelemetry/api'] !== undefined,
    'Has @opentelemetry/api dependency'
  );
  assert(
    packageJson.dependencies['@opentelemetry/sdk-node'] !== undefined,
    'Has @opentelemetry/sdk-node dependency'
  );
  assert(
    packageJson.dependencies['@opentelemetry/exporter-logs-otlp-http'] !== undefined,
    'Has @opentelemetry/exporter-logs-otlp-http dependency'
  );

  console.log('');
} catch (error) {
  console.log(`  ❌ Dependencies test failed: ${error.message}\n`);
  testsFailed++;
}

// Summary
console.log('═'.repeat(60));
console.log(`\n📊 Results: ${testsPassed} passed, ${testsFailed} failed\n`);

if (testsFailed === 0) {
  console.log('✨ All audit logging tests passed!\n');
  console.log('Phase 3 Guardrails: Audit Logging + OpenTelemetry ✅\n');
  process.exit(0);
} else {
  console.log('⚠️  Some tests failed.\n');
  process.exit(1);
}
