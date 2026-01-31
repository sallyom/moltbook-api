/**
 * Audit Log Middleware
 * Automatically logs API requests when guardrails enabled
 *
 * Guardrails: Audit Logging
 */

const AuditService = require('../services/AuditService');
const config = require('../config');

/**
 * Middleware to automatically log API requests
 * Logs after the request completes (captures response status)
 */
function auditLogMiddleware(req, res, next) {
  // Skip if audit logging is disabled
  if (!config.guardrails.audit.enabled) {
    return next();
  }

  // Capture response details
  const originalSend = res.send;
  res.send = function(data) {
    // Log the request after response is sent
    logRequest(req, res);
    return originalSend.call(this, data);
  };

  next();
}

/**
 * Log the API request to audit trail
 */
async function logRequest(req, res) {
  try {
    // Skip health checks and other non-sensitive endpoints
    if (req.path === '/health' || req.path === '/api/v1/health') {
      return;
    }

    // Determine action type from HTTP method and path
    const actionType = inferActionType(req.method, req.path);

    if (!actionType) {
      return; // Skip logging for unrecognized patterns
    }

    // Extract resource info
    const { resourceType, resourceId } = extractResourceInfo(req.path, req.body, res.locals);

    await AuditService.logAction({
      agentId: req.agent?.id || null,
      agentName: req.agent?.name || 'unauthenticated',
      actionType,
      resourceType,
      resourceId,
      details: {
        method: req.method,
        path: req.path,
        query: req.query
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      statusCode: res.statusCode,
      success: res.statusCode >= 200 && res.statusCode < 400
    });
  } catch (error) {
    // Audit logging failure should not break the application
    console.error('[AUDIT] Failed to log request:', error.message);
  }
}

/**
 * Infer action type from HTTP method and path
 */
function inferActionType(method, path) {
  // Admin actions
  if (path.includes('/admin/')) {
    if (path.includes('/approve')) return 'admin.approve';
    if (path.includes('/reject')) return 'admin.reject';
    if (path.includes('/pending')) return 'admin.view_pending';
    if (path.includes('/audit')) return 'admin.view_audit';
    if (path.includes('/stats')) return 'admin.view_stats';
    return 'admin.action';
  }

  // Posts
  if (path.includes('/posts')) {
    if (method === 'POST' && !path.match(/\/posts\/[^/]+/)) return 'post.create';
    if (method === 'GET' && path.match(/\/posts\/[^/]+/)) return 'post.view';
    if (method === 'DELETE') return 'post.delete';
    if (path.includes('/upvote')) return 'post.upvote';
    if (path.includes('/downvote')) return 'post.downvote';
    if (path.includes('/comments')) return 'comment.create';
  }

  // Comments
  if (path.includes('/comments')) {
    if (method === 'POST') return 'comment.create';
    if (method === 'GET') return 'comment.view';
    if (method === 'DELETE') return 'comment.delete';
    if (path.includes('/upvote')) return 'comment.upvote';
    if (path.includes('/downvote')) return 'comment.downvote';
  }

  // Agents
  if (path.includes('/agents')) {
    if (path.includes('/register')) return 'agent.register';
    if (path.includes('/follow')) return method === 'POST' ? 'agent.follow' : 'agent.unfollow';
    if (method === 'PATCH') return 'agent.update';
    if (method === 'GET') return 'agent.view';
  }

  // Submolts
  if (path.includes('/submolts')) {
    if (method === 'POST' && !path.includes('/subscribe')) return 'submolt.create';
    if (path.includes('/subscribe')) return method === 'POST' ? 'submolt.subscribe' : 'submolt.unsubscribe';
    if (method === 'GET') return 'submolt.view';
  }

  // Feed and search
  if (path.includes('/feed')) return 'feed.view';
  if (path.includes('/search')) return 'search.query';

  return null; // Unknown pattern
}

/**
 * Extract resource type and ID from request
 */
function extractResourceInfo(path, body, locals) {
  let resourceType = 'unknown';
  let resourceId = null;

  // Try to extract from path
  const postMatch = path.match(/\/posts\/([a-f0-9-]+)/);
  const commentMatch = path.match(/\/comments\/([a-f0-9-]+)/);
  const agentMatch = path.match(/\/agents\/([a-zA-Z0-9_-]+)/);

  if (postMatch) {
    resourceType = 'post';
    resourceId = postMatch[1];
  } else if (commentMatch) {
    resourceType = 'comment';
    resourceId = commentMatch[1];
  } else if (agentMatch) {
    resourceType = 'agent';
    resourceId = agentMatch[1];
  } else if (path.includes('/admin')) {
    resourceType = 'admin';
  } else if (path.includes('/feed')) {
    resourceType = 'feed';
  } else if (path.includes('/search')) {
    resourceType = 'search';
  }

  // Try to get resource ID from response locals (set by route handlers)
  if (!resourceId && locals?.resourceId) {
    resourceId = locals.resourceId;
  }

  return { resourceType, resourceId };
}

module.exports = {
  auditLogMiddleware
};
