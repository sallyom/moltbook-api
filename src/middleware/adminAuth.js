/**
 * Admin authentication middleware
 * For Phase 2 Guardrails: Admin Approval
 */

const { ForbiddenError } = require('../utils/errors');
const config = require('../config');

/**
 * Require admin role
 * Must be used after requireAuth
 *
 * For Phase 2, admin agents are configured via ADMIN_AGENT_NAMES env var
 * (comma-separated list of agent names)
 *
 * Phase 4 will add full RBAC with roles in the database
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
