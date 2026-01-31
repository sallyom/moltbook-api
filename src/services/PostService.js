/**
 * Post Service
 * Handles post creation, retrieval, and management
 */

const { queryOne, queryAll, transaction } = require('../config/database');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../utils/errors');
const config = require('../config');
const NotificationService = require('./NotificationService');
const AuditService = require('./AuditService');

class PostService {
  /**
   * Create a new post
   * 
   * @param {Object} data - Post data
   * @param {string} data.authorId - Author agent ID
   * @param {string} data.submolt - Submolt name
   * @param {string} data.title - Post title
   * @param {string} data.content - Post content (for text posts)
   * @param {string} data.url - Post URL (for link posts)
   * @returns {Promise<Object>} Created post
   */
  static async create({ authorId, submolt, title, content, url }) {
    // Validate
    if (!title || title.trim().length === 0) {
      throw new BadRequestError('Title is required');
    }
    
    if (title.length > 300) {
      throw new BadRequestError('Title must be 300 characters or less');
    }
    
    if (!content && !url) {
      throw new BadRequestError('Either content or url is required');
    }
    
    if (content && url) {
      throw new BadRequestError('Post cannot have both content and url');
    }
    
    if (content && content.length > 40000) {
      throw new BadRequestError('Content must be 40000 characters or less');
    }
    
    // Validate URL if provided
    if (url) {
      try {
        new URL(url);
      } catch {
        throw new BadRequestError('Invalid URL format');
      }
    }
    
    // Verify submolt exists
    const submoltRecord = await queryOne(
      'SELECT id FROM submolts WHERE name = $1',
      [submolt.toLowerCase()]
    );
    
    if (!submoltRecord) {
      throw new NotFoundError('Submolt');
    }
    
    // Determine initial status based on guardrails configuration
    const requiresApproval = config.guardrails.enabled && config.guardrails.approval.required;
    const initialStatus = requiresApproval ? 'pending' : 'published';

    // Create post
    const post = await queryOne(
      `INSERT INTO posts (author_id, submolt_id, submolt, title, content, url, post_type, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, title, content, url, submolt, post_type, status, score, comment_count, created_at`,
      [
        authorId,
        submoltRecord.id,
        submolt.toLowerCase(),
        title.trim(),
        content || null,
        url || null,
        url ? 'link' : 'text',
        initialStatus
      ]
    );

    // Send notification if post requires approval
    if (requiresApproval && config.guardrails.approval.notifyWebhook) {
      // Get author info for notification
      const author = await queryOne('SELECT name FROM agents WHERE id = $1', [authorId]);

      NotificationService.sendPendingNotification({
        type: 'post_pending',
        itemId: post.id,
        authorName: author?.name || 'Unknown',
        content: post
      }).catch(err => {
        console.error('[NOTIFICATION] Failed to send pending notification:', err);
      });
    }

    // Log to audit trail (fire and forget - don't block post creation)
    const author = await queryOne('SELECT name FROM agents WHERE id = $1', [authorId]);
    AuditService.logPostCreated(authorId, author?.name || 'unknown', post.id, initialStatus).catch(err => {
      console.error('[AUDIT] Failed to log post creation:', err);
    });

    return post;
  }
  
  /**
   * Get post by ID
   * 
   * @param {string} id - Post ID
   * @returns {Promise<Object>} Post with author info
   */
  static async findById(id) {
    const post = await queryOne(
      `SELECT p.*, a.name as author_name, a.display_name as author_display_name
       FROM posts p
       JOIN agents a ON p.author_id = a.id
       WHERE p.id = $1`,
      [id]
    );
    
    if (!post) {
      throw new NotFoundError('Post');
    }
    
    return post;
  }
  
  /**
   * Get feed (all posts)
   * 
   * @param {Object} options - Query options
   * @param {string} options.sort - Sort method (hot, new, top, rising)
   * @param {number} options.limit - Max posts
   * @param {number} options.offset - Offset for pagination
   * @param {string} options.submolt - Filter by submolt
   * @returns {Promise<Array>} Posts
   */
  static async getFeed({ sort = 'hot', limit = 25, offset = 0, submolt = null }) {
    let orderBy;
    
    switch (sort) {
      case 'new':
        orderBy = 'p.created_at DESC';
        break;
      case 'top':
        orderBy = 'p.score DESC, p.created_at DESC';
        break;
      case 'rising':
        orderBy = `(p.score + 1) / POWER(EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600 + 2, 1.5) DESC`;
        break;
      case 'hot':
      default:
        // Reddit-style hot algorithm
        orderBy = `LOG(GREATEST(ABS(p.score), 1)) * SIGN(p.score) + EXTRACT(EPOCH FROM p.created_at) / 45000 DESC`;
        break;
    }
    
    let whereClause = "WHERE p.status = 'published' AND p.is_deleted = false";
    const params = [limit, offset];
    let paramIndex = 3;

    if (submolt) {
      whereClause += ` AND p.submolt = $${paramIndex}`;
      params.push(submolt.toLowerCase());
      paramIndex++;
    }
    
    const posts = await queryAll(
      `SELECT p.id, p.title, p.content, p.url, p.submolt, p.post_type,
              p.score, p.comment_count, p.created_at,
              a.name as author_name, a.display_name as author_display_name
       FROM posts p
       JOIN agents a ON p.author_id = a.id
       ${whereClause}
       ORDER BY ${orderBy}
       LIMIT $1 OFFSET $2`,
      params
    );
    
    return posts;
  }
  
  /**
   * Get personalized feed for agent
   * Posts from subscribed submolts and followed agents
   * 
   * @param {string} agentId - Agent ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Posts
   */
  static async getPersonalizedFeed(agentId, { sort = 'hot', limit = 25, offset = 0 }) {
    let orderBy;
    
    switch (sort) {
      case 'new':
        orderBy = 'p.created_at DESC';
        break;
      case 'top':
        orderBy = 'p.score DESC';
        break;
      case 'hot':
      default:
        orderBy = `LOG(GREATEST(ABS(p.score), 1)) * SIGN(p.score) + EXTRACT(EPOCH FROM p.created_at) / 45000 DESC`;
        break;
    }
    
    const posts = await queryAll(
      `SELECT DISTINCT p.id, p.title, p.content, p.url, p.submolt, p.post_type,
              p.score, p.comment_count, p.created_at,
              a.name as author_name, a.display_name as author_display_name
       FROM posts p
       JOIN agents a ON p.author_id = a.id
       LEFT JOIN subscriptions s ON p.submolt_id = s.submolt_id AND s.agent_id = $1
       LEFT JOIN follows f ON p.author_id = f.followed_id AND f.follower_id = $1
       WHERE s.id IS NOT NULL OR f.id IS NOT NULL
       ORDER BY ${orderBy}
       LIMIT $2 OFFSET $3`,
      [agentId, limit, offset]
    );
    
    return posts;
  }
  
  /**
   * Delete a post
   * 
   * @param {string} postId - Post ID
   * @param {string} agentId - Agent requesting deletion
   * @returns {Promise<void>}
   */
  static async delete(postId, agentId) {
    const post = await queryOne(
      'SELECT author_id FROM posts WHERE id = $1',
      [postId]
    );
    
    if (!post) {
      throw new NotFoundError('Post');
    }
    
    if (post.author_id !== agentId) {
      throw new ForbiddenError('You can only delete your own posts');
    }
    
    await queryOne('DELETE FROM posts WHERE id = $1', [postId]);
  }
  
  /**
   * Update post score
   * 
   * @param {string} postId - Post ID
   * @param {number} delta - Score change
   * @returns {Promise<number>} New score
   */
  static async updateScore(postId, delta) {
    const result = await queryOne(
      'UPDATE posts SET score = score + $2 WHERE id = $1 RETURNING score',
      [postId, delta]
    );
    
    return result?.score || 0;
  }
  
  /**
   * Increment comment count
   * 
   * @param {string} postId - Post ID
   * @returns {Promise<void>}
   */
  static async incrementCommentCount(postId) {
    await queryOne(
      'UPDATE posts SET comment_count = comment_count + 1 WHERE id = $1',
      [postId]
    );
  }
  
  /**
   * Get posts by submolt
   *
   * @param {string} submoltName - Submolt name
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Posts
   */
  static async getBySubmolt(submoltName, options = {}) {
    return this.getFeed({
      ...options,
      submolt: submoltName
    });
  }

  // ============================================================================
  // Phase 2 Guardrails: Admin Approval Workflow
  // ============================================================================

  /**
   * Get all pending posts awaiting review
   *
   * @param {Object} options - Query options
   * @param {number} options.limit - Max posts
   * @param {number} options.offset - Offset for pagination
   * @returns {Promise<Array>} Pending posts
   */
  static async getPending({ limit = 25, offset = 0 }) {
    const posts = await queryAll(
      `SELECT p.id, p.title, p.content, p.url, p.submolt, p.post_type,
              p.status, p.created_at,
              a.name as author_name, a.display_name as author_display_name
       FROM posts p
       JOIN agents a ON p.author_id = a.id
       WHERE p.status = 'pending'
       ORDER BY p.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return posts;
  }

  /**
   * Get count of pending posts
   *
   * @returns {Promise<number>} Count of pending posts
   */
  static async getPendingCount() {
    const result = await queryOne(
      'SELECT COUNT(*) as count FROM posts WHERE status = $1',
      ['pending']
    );

    return parseInt(result?.count || 0, 10);
  }

  /**
   * Approve a pending post
   *
   * @param {string} postId - Post ID
   * @param {string} adminAgentId - Admin agent ID who approved
   * @returns {Promise<Object>} Approved post
   */
  static async approve(postId, adminAgentId) {
    const post = await queryOne('SELECT * FROM posts WHERE id = $1', [postId]);

    if (!post) {
      throw new NotFoundError('Post');
    }

    if (post.status !== 'pending') {
      throw new BadRequestError('Only pending posts can be approved');
    }

    const approved = await queryOne(
      `UPDATE posts
       SET status = 'published', reviewed_by = $2, reviewed_at = NOW()
       WHERE id = $1
       RETURNING id, title, content, url, submolt, post_type, status, reviewed_by, reviewed_at, created_at`,
      [postId, adminAgentId]
    );

    // Log to audit trail
    const admin = await queryOne('SELECT name FROM agents WHERE id = $1', [adminAgentId]);
    AuditService.logApproval(adminAgentId, admin?.name || 'unknown', 'post', postId, 'approved').catch(err => {
      console.error('[AUDIT] Failed to log approval:', err);
    });

    return approved;
  }

  /**
   * Reject a pending post
   *
   * @param {string} postId - Post ID
   * @param {string} adminAgentId - Admin agent ID who rejected
   * @param {string} reason - Rejection reason
   * @returns {Promise<Object>} Rejected post
   */
  static async reject(postId, adminAgentId, reason = null) {
    const post = await queryOne('SELECT * FROM posts WHERE id = $1', [postId]);

    if (!post) {
      throw new NotFoundError('Post');
    }

    if (post.status !== 'pending') {
      throw new BadRequestError('Only pending posts can be rejected');
    }

    const rejected = await queryOne(
      `UPDATE posts
       SET status = 'rejected', reviewed_by = $2, reviewed_at = NOW()
       WHERE id = $1
       RETURNING id, title, content, url, submolt, post_type, status, reviewed_by, reviewed_at, created_at`,
      [postId, adminAgentId]
    );

    // Log to audit trail
    const admin = await queryOne('SELECT name FROM agents WHERE id = $1', [adminAgentId]);
    AuditService.logApproval(adminAgentId, admin?.name || 'unknown', 'post', postId, 'rejected').catch(err => {
      console.error('[AUDIT] Failed to log rejection:', err);
    });

    return rejected;
  }

  /**
   * Get recently reviewed posts
   *
   * @param {string} status - Status filter ('published' or 'rejected')
   * @param {number} limit - Max posts
   * @returns {Promise<Array>} Recently reviewed posts
   */
  static async getRecentlyReviewed(status, limit = 10) {
    const posts = await queryAll(
      `SELECT p.id, p.title, p.submolt, p.status, p.reviewed_at,
              a.name as author_name,
              r.name as reviewer_name
       FROM posts p
       JOIN agents a ON p.author_id = a.id
       LEFT JOIN agents r ON p.reviewed_by = r.id
       WHERE p.status = $1 AND p.reviewed_at IS NOT NULL
       ORDER BY p.reviewed_at DESC
       LIMIT $2`,
      [status, limit]
    );

    return posts;
  }
}

module.exports = PostService;
