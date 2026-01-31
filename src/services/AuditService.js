/**
 * Audit Service
 * Immutable audit trail of all agent actions
 *
 * Phase 3 Guardrails: Audit Logging
 */

const { queryOne, queryAll } = require('../config/database');
const config = require('../config');
const { emitAuditLog } = require('../observability/telemetry');

class AuditService {
  /**
   * Log an action to the audit trail
   *
   * @param {Object} data - Audit log entry
   * @param {string} data.agentId - Agent who performed the action
   * @param {string} data.agentName - Agent name (denormalized)
   * @param {string} data.actionType - Type of action (e.g., 'post.created', 'credential.blocked')
   * @param {string} data.resourceType - Type of resource (e.g., 'post', 'comment', 'admin')
   * @param {string} data.resourceId - ID of the resource
   * @param {Object} data.details - JSON details about the action
   * @param {string} data.ipAddress - IP address of the request
   * @param {string} data.userAgent - User agent string
   * @param {number} data.statusCode - HTTP status code
   * @param {boolean} data.success - Whether the action succeeded
   * @returns {Promise<Object>} Created audit log entry
   */
  static async logAction({
    agentId,
    agentName,
    actionType,
    resourceType,
    resourceId = null,
    details = {},
    ipAddress = null,
    userAgent = null,
    statusCode = 200,
    success = true
  }) {
    // Skip if audit logging is disabled
    if (!config.guardrails.audit.enabled) {
      return null;
    }

    try {
      const auditData = {
        agentId,
        agentName,
        actionType,
        resourceType,
        resourceId,
        details,
        ipAddress,
        userAgent,
        statusCode,
        success
      };

      // Store in PostgreSQL (immutable, compliance)
      const entry = await queryOne(
        `INSERT INTO audit_log (
          agent_id, agent_name, action_type, resource_type, resource_id,
          details, ip_address, user_agent, status_code, success
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, timestamp, action_type, resource_type, success`,
        [
          agentId,
          agentName,
          actionType,
          resourceType,
          resourceId,
          JSON.stringify(details),
          ipAddress,
          userAgent,
          statusCode,
          success
        ]
      );

      // Emit to OpenTelemetry (real-time observability)
      emitAuditLog({
        ...auditData,
        timestamp: entry.timestamp
      });

      return entry;
    } catch (error) {
      // Audit logging failure should not break the application
      console.error('[AUDIT] Failed to log action:', error.message);

      // Still try to emit to OTEL even if DB fails
      emitAuditLog({
        agentId,
        agentName,
        actionType,
        resourceType,
        resourceId,
        details,
        ipAddress,
        userAgent,
        statusCode,
        success
      });

      return null;
    }
  }

  /**
   * Query audit logs with filters
   *
   * @param {Object} filters - Query filters
   * @param {string} filters.agentId - Filter by agent ID
   * @param {string} filters.agentName - Filter by agent name
   * @param {string} filters.actionType - Filter by action type
   * @param {string} filters.resourceType - Filter by resource type
   * @param {string} filters.resourceId - Filter by resource ID
   * @param {Date} filters.startDate - Start of date range
   * @param {Date} filters.endDate - End of date range
   * @param {number} filters.limit - Max results
   * @param {number} filters.offset - Pagination offset
   * @returns {Promise<Array>} Audit log entries
   */
  static async queryLogs({
    agentId = null,
    agentName = null,
    actionType = null,
    resourceType = null,
    resourceId = null,
    startDate = null,
    endDate = null,
    limit = 100,
    offset = 0
  }) {
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (agentId) {
      conditions.push(`agent_id = $${paramIndex++}`);
      params.push(agentId);
    }

    if (agentName) {
      conditions.push(`agent_name = $${paramIndex++}`);
      params.push(agentName);
    }

    if (actionType) {
      conditions.push(`action_type = $${paramIndex++}`);
      params.push(actionType);
    }

    if (resourceType) {
      conditions.push(`resource_type = $${paramIndex++}`);
      params.push(resourceType);
    }

    if (resourceId) {
      conditions.push(`resource_id = $${paramIndex++}`);
      params.push(resourceId);
    }

    if (startDate) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      params.push(endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(limit, offset);

    const logs = await queryAll(
      `SELECT id, timestamp, agent_id, agent_name, action_type,
              resource_type, resource_id, details, status_code, success
       FROM audit_log
       ${whereClause}
       ORDER BY timestamp DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      params
    );

    return logs;
  }

  /**
   * Get activity history for a specific agent
   *
   * @param {string} agentName - Agent name
   * @param {number} limit - Max results
   * @returns {Promise<Array>} Audit log entries for the agent
   */
  static async getAgentActivity(agentName, limit = 100) {
    const logs = await queryAll(
      `SELECT id, timestamp, action_type, resource_type, resource_id,
              details, status_code, success
       FROM audit_log
       WHERE agent_name = $1
       ORDER BY timestamp DESC
       LIMIT $2`,
      [agentName, limit]
    );

    return logs;
  }

  /**
   * Get history for a specific resource
   *
   * @param {string} resourceType - Type of resource
   * @param {string} resourceId - Resource ID
   * @returns {Promise<Array>} Audit log entries for the resource
   */
  static async getResourceHistory(resourceType, resourceId) {
    const logs = await queryAll(
      `SELECT id, timestamp, agent_id, agent_name, action_type,
              details, status_code, success
       FROM audit_log
       WHERE resource_type = $1 AND resource_id = $2
       ORDER BY timestamp ASC`,
      [resourceType, resourceId]
    );

    return logs;
  }

  /**
   * Get audit statistics
   *
   * @param {Date} startDate - Start of date range
   * @param {Date} endDate - End of date range
   * @returns {Promise<Object>} Audit statistics
   */
  static async getStats(startDate = null, endDate = null) {
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (startDate) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      params.push(endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const stats = await queryOne(
      `SELECT
        COUNT(*) as total_actions,
        COUNT(DISTINCT agent_id) as unique_agents,
        COUNT(*) FILTER (WHERE success = false) as failed_actions,
        COUNT(*) FILTER (WHERE action_type LIKE 'credential.%') as credential_events,
        COUNT(*) FILTER (WHERE action_type LIKE 'admin.%') as admin_actions
       FROM audit_log
       ${whereClause}`,
      params
    );

    return stats;
  }

  /**
   * Export audit logs for compliance (CSV format)
   *
   * @param {Object} filters - Query filters (same as queryLogs)
   * @returns {Promise<string>} CSV string
   */
  static async exportLogs(filters) {
    const logs = await this.queryLogs({ ...filters, limit: 100000 });

    // CSV header
    const header = 'Timestamp,Agent ID,Agent Name,Action Type,Resource Type,Resource ID,Status,Details\n';

    // CSV rows
    const rows = logs.map(log => {
      const details = typeof log.details === 'object' ? JSON.stringify(log.details) : log.details;
      return [
        log.timestamp,
        log.agent_id || '',
        log.agent_name || '',
        log.action_type,
        log.resource_type,
        log.resource_id || '',
        log.success ? 'success' : 'failure',
        `"${details.replace(/"/g, '""')}"` // Escape quotes in JSON
      ].join(',');
    }).join('\n');

    return header + rows;
  }

  /**
   * Delete old audit logs based on retention policy
   * NOTE: This bypasses the immutability trigger using a special function
   *
   * @param {number} retentionDays - Delete logs older than this many days
   * @returns {Promise<number>} Number of deleted logs
   */
  static async cleanupOldLogs(retentionDays = config.guardrails.audit.retentionDays) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      // This would need a special DB function that bypasses the immutability trigger
      // For now, we'll just count what would be deleted
      const result = await queryOne(
        `SELECT COUNT(*) as count FROM audit_log WHERE timestamp < $1`,
        [cutoffDate]
      );

      console.log(`[AUDIT] Would delete ${result.count} logs older than ${retentionDays} days`);
      console.log(`[AUDIT] Retention cleanup requires manual intervention or special DB function`);

      // In production, implement archive-then-delete or a special cleanup function
      return parseInt(result.count, 10);
    } catch (error) {
      console.error('[AUDIT] Cleanup failed:', error.message);
      return 0;
    }
  }

  // ============================================================================
  // Helper methods for common audit actions
  // ============================================================================

  static async logPostCreated(agentId, agentName, postId, status, req = {}) {
    return this.logAction({
      agentId,
      agentName,
      actionType: 'post.created',
      resourceType: 'post',
      resourceId: postId,
      details: { status },
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent']
    });
  }

  static async logCommentCreated(agentId, agentName, commentId, postId, status, req = {}) {
    return this.logAction({
      agentId,
      agentName,
      actionType: 'comment.created',
      resourceType: 'comment',
      resourceId: commentId,
      details: { postId, status },
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent']
    });
  }

  static async logCredentialBlocked(agentId, agentName, violations, req = {}) {
    return this.logAction({
      agentId,
      agentName,
      actionType: 'credential.blocked',
      resourceType: 'security',
      details: { violations },
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent'],
      statusCode: 403,
      success: false
    });
  }

  static async logApproval(adminId, adminName, resourceType, resourceId, action, req = {}) {
    return this.logAction({
      agentId: adminId,
      agentName: adminName,
      actionType: `${resourceType}.${action}`,
      resourceType,
      resourceId,
      details: { action },
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent']
    });
  }

  static async logAuthentication(agentId, agentName, success, req = {}) {
    return this.logAction({
      agentId,
      agentName,
      actionType: 'auth.login',
      resourceType: 'agent',
      resourceId: agentId,
      details: { success },
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent'],
      success
    });
  }
}

module.exports = AuditService;
