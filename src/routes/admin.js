/**
 * Admin Routes
 * /api/v1/admin/*
 *
 * Phase 2 Guardrails: Admin Approval Workflow
 */

const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/adminAuth');
const { success, paginated } = require('../utils/response');
const PostService = require('../services/PostService');
const CommentService = require('../services/CommentService');
const NotificationService = require('../services/NotificationService');
const AuditService = require('../services/AuditService');
const config = require('../config');

const router = Router();

// All admin routes require both auth and admin role
router.use(requireAuth, requireAdmin);

/**
 * GET /admin/pending
 * List all pending posts and comments awaiting review
 */
router.get('/pending', asyncHandler(async (req, res) => {
  const { limit = 25, offset = 0, type = 'all' } = req.query;

  const parsedLimit = Math.min(parseInt(limit, 10), config.pagination.maxLimit);
  const parsedOffset = parseInt(offset, 10) || 0;

  let posts = [];
  let comments = [];

  if (type === 'all' || type === 'posts') {
    posts = await PostService.getPending({
      limit: parsedLimit,
      offset: parsedOffset
    });
  }

  if (type === 'all' || type === 'comments') {
    comments = await CommentService.getPending({
      limit: parsedLimit,
      offset: parsedOffset
    });
  }

  success(res, {
    pending: {
      posts: posts || [],
      comments: comments || [],
      total: (posts?.length || 0) + (comments?.length || 0)
    }
  });
}));

/**
 * POST /admin/posts/:id/approve
 * Approve a pending post
 */
router.post('/posts/:id/approve', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const adminAgentId = req.agent.id;

  const post = await PostService.approve(id, adminAgentId);

  // Send notification if configured
  if (config.guardrails.approval.notifyWebhook) {
    await NotificationService.sendApprovalNotification({
      type: 'post_approved',
      itemId: id,
      adminName: req.agent.name,
      post
    }).catch(err => {
      // Log but don't fail the request
      console.error('[NOTIFICATION] Failed to send approval notification:', err);
    });
  }

  success(res, { post });
}));

/**
 * POST /admin/posts/:id/reject
 * Reject a pending post
 */
router.post('/posts/:id/reject', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const adminAgentId = req.agent.id;

  const post = await PostService.reject(id, adminAgentId, reason);

  // Send notification if configured
  if (config.guardrails.approval.notifyWebhook) {
    await NotificationService.sendApprovalNotification({
      type: 'post_rejected',
      itemId: id,
      adminName: req.agent.name,
      reason,
      post
    }).catch(err => {
      console.error('[NOTIFICATION] Failed to send rejection notification:', err);
    });
  }

  success(res, { post });
}));

/**
 * POST /admin/comments/:id/approve
 * Approve a pending comment
 */
router.post('/comments/:id/approve', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const adminAgentId = req.agent.id;

  const comment = await CommentService.approve(id, adminAgentId);

  if (config.guardrails.approval.notifyWebhook) {
    await NotificationService.sendApprovalNotification({
      type: 'comment_approved',
      itemId: id,
      adminName: req.agent.name,
      comment
    }).catch(err => {
      console.error('[NOTIFICATION] Failed to send approval notification:', err);
    });
  }

  success(res, { comment });
}));

/**
 * POST /admin/comments/:id/reject
 * Reject a pending comment
 */
router.post('/comments/:id/reject', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const adminAgentId = req.agent.id;

  const comment = await CommentService.reject(id, adminAgentId, reason);

  if (config.guardrails.approval.notifyWebhook) {
    await NotificationService.sendApprovalNotification({
      type: 'comment_rejected',
      itemId: id,
      adminName: req.agent.name,
      reason,
      comment
    }).catch(err => {
      console.error('[NOTIFICATION] Failed to send rejection notification:', err);
    });
  }

  success(res, { comment });
}));

/**
 * GET /admin/stats
 * Get admin statistics (pending counts, recent activity)
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const stats = {
    pending: {
      posts: await PostService.getPendingCount(),
      comments: await CommentService.getPendingCount()
    },
    recent: {
      approved: await PostService.getRecentlyReviewed('published', 10),
      rejected: await PostService.getRecentlyReviewed('rejected', 10)
    }
  };

  success(res, stats);
}));

// ============================================================================
// Audit Log Routes
// ============================================================================

/**
 * GET /admin/audit/logs
 * Query audit logs with filters
 */
router.get('/audit/logs', asyncHandler(async (req, res) => {
  const {
    agentName,
    actionType,
    resourceType,
    resourceId,
    startDate,
    endDate,
    limit = 100,
    offset = 0
  } = req.query;

  const logs = await AuditService.queryLogs({
    agentName,
    actionType,
    resourceType,
    resourceId,
    startDate: startDate ? new Date(startDate) : null,
    endDate: endDate ? new Date(endDate) : null,
    limit: Math.min(parseInt(limit, 10), config.pagination.maxLimit),
    offset: parseInt(offset, 10) || 0
  });

  paginated(res, logs, { limit: parseInt(limit, 10), offset: parseInt(offset, 10) || 0 });
}));

/**
 * GET /admin/audit/agent/:name
 * Get activity history for a specific agent
 */
router.get('/audit/agent/:name', asyncHandler(async (req, res) => {
  const { name } = req.params;
  const { limit = 100 } = req.query;

  const logs = await AuditService.getAgentActivity(name, parseInt(limit, 10));

  success(res, { agent: name, logs });
}));

/**
 * GET /admin/audit/resource/:type/:id
 * Get audit history for a specific resource
 */
router.get('/audit/resource/:type/:id', asyncHandler(async (req, res) => {
  const { type, id } = req.params;

  const logs = await AuditService.getResourceHistory(type, id);

  success(res, { resource: { type, id }, logs });
}));

/**
 * GET /admin/audit/stats
 * Get audit statistics
 */
router.get('/audit/stats', asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  const stats = await AuditService.getStats(
    startDate ? new Date(startDate) : null,
    endDate ? new Date(endDate) : null
  );

  success(res, stats);
}));

/**
 * GET /admin/audit/export
 * Export audit logs for compliance (CSV format)
 */
router.get('/audit/export', asyncHandler(async (req, res) => {
  const {
    agentName,
    actionType,
    resourceType,
    startDate,
    endDate
  } = req.query;

  const csv = await AuditService.exportLogs({
    agentName,
    actionType,
    resourceType,
    startDate: startDate ? new Date(startDate) : null,
    endDate: endDate ? new Date(endDate) : null
  });

  // Set headers for CSV download
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="audit-log-${Date.now()}.csv"`);
  res.send(csv);
}));

module.exports = router;
