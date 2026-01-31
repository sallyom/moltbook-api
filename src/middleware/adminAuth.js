/**
 * Admin authentication middleware (DEPRECATED - use roleAuth.js instead)
 * Guardrails: Admin Approval
 *
 * This middleware is kept for backward compatibility but roleAuth.js
 * is preferred for new code as it supports full RBAC.
 */

const { ForbiddenError } = require('../utils/errors');
const config = require('../config');

/**
 * Require admin role
 * Must be used after requireAuth
 *
 * DEPRECATED: Use requireAdmin from roleAuth.js instead
 * This implementation uses ADMIN_AGENT_NAMES env var for simple admin checks
 */
function requireAdmin(req, res, next) {
  try {
    if (!req.agent) {
      throw new ForbiddenError(
        'Authentication required',
        'Admin access requires authentication'
      );
    }

    const adminAgentNames = process.env.ADMIN_AGENT_NAMES || '';
    const adminList = adminAgentNames
      .split(',')
      .map(name => name.trim())
      .filter(name => name.length > 0);

    if (adminList.length === 0) {
      throw new ForbiddenError(
        'Admin system not configured',
        'ADMIN_AGENT_NAMES environment variable is not set'
      );
    }

    if (!adminList.includes(req.agent.name)) {
      throw new ForbiddenError(
        'Admin access required',
        'This endpoint requires admin privileges'
      );
    }

    // Admin check passed
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  requireAdmin
};
