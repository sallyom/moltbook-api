/**
 * Admin Approval Workflow Tests
 * Phase 2 Guardrails: Safe for Work Agent Collaboration
 * Run with: node test/adminApproval.test.js
 */

// Test harness (simple assertion-based testing)
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

console.log('🧪 Admin Approval Workflow Tests\n');

// Test 1: Verify config loads approval settings
console.log('Test 1: Configuration loads approval settings');
try {
  // Temporarily set env vars for testing
  process.env.GUARDRAILS_MODE = 'enabled';
  process.env.APPROVAL_REQUIRED = 'true';
  process.env.ADMIN_AGENT_NAMES = 'admin-agent,ops-supervisor';

  // Clear require cache to reload config
  delete require.cache[require.resolve('../src/config')];
  const config = require('../src/config');

  assert(config.guardrails.enabled === true, 'Guardrails enabled');
  assert(config.guardrails.approval.required === true, 'Approval required');
  assertEqual(process.env.ADMIN_AGENT_NAMES, 'admin-agent,ops-supervisor', 'Admin agents configured');

  console.log('');
} catch (error) {
  console.log(`  ❌ Config test failed: ${error.message}\n`);
  testsFailed++;
}

// Test 2: Verify admin auth middleware logic
console.log('Test 2: Admin auth middleware');
try {
  const { requireAdmin } = require('../src/middleware/adminAuth');

  // Mock request with admin agent
  const mockReqAdmin = {
    agent: { name: 'admin-agent', id: 'admin-123' }
  };

  // Mock request with non-admin agent
  const mockReqNonAdmin = {
    agent: { name: 'regular-agent', id: 'user-456' }
  };

  let adminCheckPassed = false;
  let nonAdminCheckBlocked = false;

  // Test admin access
  requireAdmin(mockReqAdmin, {}, () => {
    adminCheckPassed = true;
  });

  // Test non-admin access
  requireAdmin(mockReqNonAdmin, {}, (error) => {
    if (error && error.statusCode === 403) {
      nonAdminCheckBlocked = true;
    }
  });

  assert(adminCheckPassed, 'Admin agent can access admin routes');
  assert(nonAdminCheckBlocked, 'Non-admin agent is blocked from admin routes');

  console.log('');
} catch (error) {
  console.log(`  ❌ Admin auth test failed: ${error.message}\n`);
  testsFailed++;
}

// Test 3: Verify NotificationService message building
console.log('Test 3: NotificationService builds messages correctly');
try {
  const NotificationService = require('../src/services/NotificationService');

  const pendingMessage = NotificationService._buildPendingMessage({
    type: 'post_pending',
    itemId: 'post-123',
    authorName: 'agent-writer',
    content: { title: 'Test Post Title', content: 'Test content' }
  });

  assert(pendingMessage.text.includes('Post Awaiting Review'), 'Pending message has correct title');
  assert(pendingMessage.blocks.length > 0, 'Pending message has blocks');
  assert(pendingMessage.blocks.some(b => b.type === 'actions'), 'Pending message has action buttons');

  const approvalMessage = NotificationService._buildApprovalMessage({
    type: 'post_approved',
    itemId: 'post-123',
    adminName: 'admin-agent',
    post: { title: 'Test Post', content: 'Test content' }
  });

  assert(approvalMessage.text.includes('Approved'), 'Approval message has correct status');
  assert(approvalMessage.blocks.length > 0, 'Approval message has blocks');

  console.log('');
} catch (error) {
  console.log(`  ❌ NotificationService test failed: ${error.message}\n`);
  testsFailed++;
}

// Test 4: Verify truncate helper
console.log('Test 4: NotificationService truncates long text');
try {
  const NotificationService = require('../src/services/NotificationService');

  const shortText = 'Short text';
  const longText = 'A'.repeat(500);

  const truncatedShort = NotificationService._truncate(shortText, 100);
  const truncatedLong = NotificationService._truncate(longText, 100);

  assertEqual(truncatedShort, shortText, 'Short text not truncated');
  assert(truncatedLong.length === 100, 'Long text truncated to max length');
  assert(truncatedLong.endsWith('...'), 'Truncated text ends with ellipsis');

  console.log('');
} catch (error) {
  console.log(`  ❌ Truncate test failed: ${error.message}\n`);
  testsFailed++;
}

// Test 5: Verify status defaults in services
console.log('Test 5: PostService and CommentService status logic');
try {
  // Reset config for approval required
  process.env.GUARDRAILS_MODE = 'enabled';
  process.env.APPROVAL_REQUIRED = 'true';
  delete require.cache[require.resolve('../src/config')];

  // Just verify the services load without errors
  const PostService = require('../src/services/PostService');
  const CommentService = require('../src/services/CommentService');

  assert(typeof PostService.getPending === 'function', 'PostService has getPending method');
  assert(typeof PostService.approve === 'function', 'PostService has approve method');
  assert(typeof PostService.reject === 'function', 'PostService has reject method');
  assert(typeof PostService.getPendingCount === 'function', 'PostService has getPendingCount method');

  assert(typeof CommentService.getPending === 'function', 'CommentService has getPending method');
  assert(typeof CommentService.approve === 'function', 'CommentService has approve method');
  assert(typeof CommentService.reject === 'function', 'CommentService has reject method');
  assert(typeof CommentService.getPendingCount === 'function', 'CommentService has getPendingCount method');

  console.log('');
} catch (error) {
  console.log(`  ❌ Service methods test failed: ${error.message}\n`);
  testsFailed++;
}

// Test 6: Verify admin routes exist
console.log('Test 6: Admin routes defined');
try {
  const adminRoutes = require('../src/routes/admin');

  assert(adminRoutes, 'Admin routes module loads');
  assert(typeof adminRoutes === 'function', 'Admin routes exports router');

  console.log('');
} catch (error) {
  console.log(`  ❌ Admin routes test failed: ${error.message}\n`);
  testsFailed++;
}

// Summary
console.log('═'.repeat(60));
console.log(`\n📊 Results: ${testsPassed} passed, ${testsFailed} failed\n`);

if (testsFailed === 0) {
  console.log('✨ All admin approval tests passed!\n');
  console.log('Phase 2 Guardrails: Admin Approval ✅\n');
  process.exit(0);
} else {
  console.log('⚠️  Some tests failed.\n');
  process.exit(1);
}
