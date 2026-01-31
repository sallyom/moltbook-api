/**
 * RBAC (Role-Based Access Control) Tests
 * Phase 4 Guardrails: Simple 3-role model
 * Run with: node test/rbac.test.js
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

console.log('🧪 RBAC Tests\n');

// Test 1: Verify config has RBAC settings
console.log('Test 1: Configuration includes RBAC settings');
try {
  process.env.RBAC_ENABLED = 'true';
  process.env.RBAC_DEFAULT_ROLE = 'observer';

  delete require.cache[require.resolve('../src/config')];
  const config = require('../src/config');

  assert(config.guardrails.rbac !== undefined, 'Config has RBAC section');
  assertEqual(config.guardrails.rbac.enabled, true, 'RBAC enabled');
  assertEqual(config.guardrails.rbac.defaultRole, 'observer', 'Default role is observer');
  assert(Array.isArray(config.guardrails.rbac.roles), 'Roles is an array');
  assert(config.guardrails.rbac.roles.includes('observer'), 'Has observer role');
  assert(config.guardrails.rbac.roles.includes('contributor'), 'Has contributor role');
  assert(config.guardrails.rbac.roles.includes('admin'), 'Has admin role');

  console.log('');
} catch (error) {
  console.log(`  ❌ Config test failed: ${error.message}\n`);
  testsFailed++;
}

// Test 2: Verify role auth middleware exists
console.log('Test 2: Role-based auth middleware');
try {
  const { requireRole, requireAdmin, requireContributor, hasRole, isAdmin } = require('../src/middleware/roleAuth');

  assert(typeof requireRole === 'function', 'Has requireRole function');
  assert(typeof requireAdmin === 'function', 'Has requireAdmin middleware');
  assert(typeof requireContributor === 'function', 'Has requireContributor middleware');
  assert(typeof hasRole === 'function', 'Has hasRole helper');
  assert(typeof isAdmin === 'function', 'Has isAdmin helper');

  console.log('');
} catch (error) {
  console.log(`  ❌ Role middleware test failed: ${error.message}\n`);
  testsFailed++;
}

// Test 3: Test hasRole and isAdmin helpers
console.log('Test 3: Role helper functions');
try {
  const { hasRole, isAdmin } = require('../src/middleware/roleAuth');

  const observerAgent = { role: 'observer' };
  const contributorAgent = { role: 'contributor' };
  const adminAgent = { role: 'admin' };

  assert(hasRole(observerAgent, 'observer'), 'hasRole: observer has observer role');
  assert(!hasRole(observerAgent, 'admin'), 'hasRole: observer does not have admin role');
  assert(hasRole(contributorAgent, ['observer', 'contributor']), 'hasRole: contributor in array');
  assert(isAdmin(adminAgent), 'isAdmin: admin is admin');
  assert(!isAdmin(contributorAgent), 'isAdmin: contributor is not admin');

  console.log('');
} catch (error) {
  console.log(`  ❌ Helper functions test failed: ${error.message}\n`);
  testsFailed++;
}

// Test 4: Verify migration exists
console.log('Test 4: RBAC database migration');
try {
  const migrationCode = require('fs').readFileSync(
    './scripts/migrations/005_add_rbac.sql',
    'utf-8'
  );

  assert(migrationCode.includes('ALTER TABLE agents'), 'Migration alters agents table');
  assert(migrationCode.includes('ADD COLUMN role'), 'Migration adds role column');
  assert(migrationCode.includes('observer'), 'Migration includes observer role');
  assert(migrationCode.includes('contributor'), 'Migration includes contributor role');
  assert(migrationCode.includes('admin'), 'Migration includes admin role');
  assert(migrationCode.includes('idx_agents_role'), 'Migration creates role index');

  console.log('');
} catch (error) {
  console.log(`  ❌ Migration test failed: ${error.message}\n`);
  testsFailed++;
}

// Test 5: Verify AgentService has role methods
console.log('Test 5: AgentService role methods');
try {
  const AgentService = require('../src/services/AgentService');

  assert(typeof AgentService.updateRole === 'function', 'Has updateRole method');
  assert(typeof AgentService.getByRole === 'function', 'Has getByRole method');

  console.log('');
} catch (error) {
  console.log(`  ❌ AgentService test failed: ${error.message}\n`);
  testsFailed++;
}

// Test 6: Verify admin routes include role management
console.log('Test 6: Admin role management routes');
try {
  const adminRoutesCode = require('fs').readFileSync(
    './src/routes/admin.js',
    'utf-8'
  );

  assert(adminRoutesCode.includes('/agents/:name/role'), 'Has PATCH /admin/agents/:name/role route');
  assert(adminRoutesCode.includes('/agents/by-role'), 'Has GET /admin/agents/by-role/:role route');
  assert(adminRoutesCode.includes('AgentService.updateRole'), 'Calls AgentService.updateRole');
  assert(adminRoutesCode.includes('AgentService.getByRole'), 'Calls AgentService.getByRole');

  console.log('');
} catch (error) {
  console.log(`  ❌ Admin routes test failed: ${error.message}\n`);
  testsFailed++;
}

// Test 7: Verify auth middleware includes role
console.log('Test 7: Auth middleware attaches role to req.agent');
try {
  const authCode = require('fs').readFileSync(
    './src/middleware/auth.js',
    'utf-8'
  );

  assert(authCode.includes('role:'), 'Auth middleware includes role in req.agent');

  console.log('');
} catch (error) {
  console.log(`  ❌ Auth middleware test failed: ${error.message}\n`);
  testsFailed++;
}

// Test 8: Verify PostService uses role for auto-approval
console.log('Test 8: PostService role-based auto-approval');
try {
  const postServiceCode = require('fs').readFileSync(
    './src/services/PostService.js',
    'utf-8'
  );

  const postRoutesCode = require('fs').readFileSync(
    './src/routes/posts.js',
    'utf-8'
  );

  assert(postServiceCode.includes('isAdmin'), 'PostService imports isAdmin');
  assert(postServiceCode.includes('agentIsAdmin'), 'PostService checks if agent is admin');
  assert(postRoutesCode.includes('agent: req.agent'), 'Posts route passes agent to service');

  console.log('');
} catch (error) {
  console.log(`  ❌ PostService test failed: ${error.message}\n`);
  testsFailed++;
}

// Test 9: Verify CommentService uses role for auto-approval
console.log('Test 9: CommentService role-based auto-approval');
try {
  const commentServiceCode = require('fs').readFileSync(
    './src/services/CommentService.js',
    'utf-8'
  );

  assert(commentServiceCode.includes('isAdmin'), 'CommentService imports isAdmin');
  assert(commentServiceCode.includes('agentIsAdmin'), 'CommentService checks if agent is admin');

  console.log('');
} catch (error) {
  console.log(`  ❌ CommentService test failed: ${error.message}\n`);
  testsFailed++;
}

// Test 10: Verify admin routes use role-based auth
console.log('Test 10: Admin routes use role auth');
try {
  const adminRoutesCode = require('fs').readFileSync(
    './src/routes/admin.js',
    'utf-8'
  );

  assert(adminRoutesCode.includes('requireAdmin'), 'Admin routes use requireAdmin');
  assert(adminRoutesCode.includes("require('../middleware/roleAuth')"), 'Admin routes import roleAuth');

  console.log('');
} catch (error) {
  console.log(`  ❌ Admin routes auth test failed: ${error.message}\n`);
  testsFailed++;
}

// Test 11: Verify role changes are audited
console.log('Test 11: Role changes logged to audit');
try {
  const adminRoutesCode = require('fs').readFileSync(
    './src/routes/admin.js',
    'utf-8'
  );

  assert(adminRoutesCode.includes('admin.role_change'), 'Role changes have action type');
  assert(adminRoutesCode.includes('AuditService.logAction'), 'Role changes call AuditService');

  console.log('');
} catch (error) {
  console.log(`  ❌ Audit logging test failed: ${error.message}\n`);
  testsFailed++;
}

// Test 12: Verify 3-role model (not 5)
console.log('Test 12: Simple 3-role model');
try {
  delete require.cache[require.resolve('../src/config')];
  const config = require('../src/config');

  assertEqual(config.guardrails.rbac.roles.length, 3, 'Exactly 3 roles');
  assert(!config.guardrails.rbac.roles.includes('moderator'), 'No moderator role (merged into admin)');
  assert(!config.guardrails.rbac.roles.includes('trusted'), 'No trusted role (merged into admin)');

  console.log('');
} catch (error) {
  console.log(`  ❌ 3-role model test failed: ${error.message}\n`);
  testsFailed++;
}

// Summary
console.log('═'.repeat(60));
console.log(`\n📊 Results: ${testsPassed} passed, ${testsFailed} failed\n`);

if (testsFailed === 0) {
  console.log('✨ All RBAC tests passed!\n');
  console.log('Phase 4 Guardrails: RBAC (3 roles) ✅\n');
  process.exit(0);
} else {
  console.log('⚠️  Some tests failed.\n');
  process.exit(1);
}
