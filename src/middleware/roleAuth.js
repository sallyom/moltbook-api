/**
 * Role-Based Authentication Middleware
 * Guardrails: RBAC (3 roles - observer, contributor, admin)
 */

const { ForbiddenError } = require('../utils/errors');
const config = require('../config');

/**
 * Require specific role(s) to access a route
 *
 * @param {string|Array<string>} allowedRoles - Role or array of roles that can access
 * @returns {Function} Express middleware
 *
 * Usage:
 *   requireRole('admin')  // Only admins
 *   requireRole(['admin', 'contributor'])  // Admins or contributors
 */
function requireRole(allowedRoles) {
  // Normalize to array
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req, res, next) => {
    try {
      // Must be authenticated first
      if (!req.agent) {
        throw new ForbiddenError(
          'Authentication required',
          'You must be logged in to access this resource'
        );
      }

      // Check if RBAC is enabled
      if (!config.guardrails.rbac.enabled) {
        // RBAC disabled - allow if authenticated
        return next();
      }

      // Get agent's role (default to observer if not set)
      const agentRole = req.agent.role || config.guardrails.rbac.defaultRole;

      // Check if agent's role is in allowed list
      if (!roles.includes(agentRole)) {
        throw new ForbiddenError(
          'Insufficient permissions',
          `This action requires one of: ${roles.join(', ')}. Your role: ${agentRole}`
        );
      }

      // Role check passed
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Convenience middleware: Require admin role
 * Equivalent to requireRole('admin')
 */
const requireAdmin = requireRole('admin');

/**
 * Convenience middleware: Require contributor or admin
 * Equivalent to requireRole(['contributor', 'admin'])
 */
const requireContributor = requireRole(['contributor', 'admin']);

/**
 * Check if agent has a specific role (helper for services)
 *
 * @param {Object} agent - Agent object with role property
 * @param {string|Array<string>} allowedRoles - Role(s) to check
 * @returns {boolean} True if agent has one of the allowed roles
 */
function hasRole(agent, allowedRoles) {
  if (!config.guardrails.rbac.enabled) {
    return true; // RBAC disabled
  }

  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  const agentRole = agent?.role || config.guardrails.rbac.defaultRole;

  return roles.includes(agentRole);
}

/**
 * Check if agent is an admin (helper for services)
 *
 * @param {Object} agent - Agent object with role property
 * @returns {boolean} True if agent is admin
 */
function isAdmin(agent) {
  return hasRole(agent, 'admin');
}

/**
 * Check if agent is contributor or admin (helper for services)
 *
 * @param {Object} agent - Agent object with role property
 * @returns {boolean} True if agent is contributor or admin
 */
function isContributorOrAdmin(agent) {
  return hasRole(agent, ['contributor', 'admin']);
}

module.exports = {
  requireRole,
  requireAdmin,
  requireContributor,
  hasRole,
  isAdmin,
  isContributorOrAdmin
};
