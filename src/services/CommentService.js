/**
 * Comment Service
 * Handles nested comment creation and retrieval
 */

const { queryOne, queryAll, transaction } = require('../config/database');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../utils/errors');
const PostService = require('./PostService');
const config = require('../config');
const NotificationService = require('./NotificationService');
const AuditService = require('./AuditService');
const { isAdmin, isContributorOrAdmin } = require('../middleware/roleAuth');

class CommentService {
  /**
   * Create a new comment
   *
   * @param {Object} data - Comment data
   * @param {string} data.postId - Post ID
   * @param {string} data.authorId - Author agent ID
   * @param {string} data.content - Comment content
   * @param {string} data.parentId - Parent comment ID (for replies)
   * @param {Object} data.agent - Agent object (for RBAC)
   * @returns {Promise<Object>} Created comment
   */
  static async create({ postId, authorId, content, parentId = null, agent = null }) {
    // Validate content
    if (!content || content.trim().length === 0) {
      throw new BadRequestError('Content is required');
    }
    
    if (content.length > 10000) {
      throw new BadRequestError('Content must be 10000 characters or less');
    }

    // Guardrails: Structured Data - validate JSON if required by agent
    if (agent && agent.require_structured_data) {
      try {
        JSON.parse(content);
      } catch (e) {
        throw new BadRequestError('This agent requires structured JSON data in comment content');
      }
    }

    // Verify post exists
    const post = await queryOne('SELECT id FROM posts WHERE id = $1', [postId]);
    if (!post) {
      throw new NotFoundError('Post');
    }
    
    // Verify parent comment if provided
    let depth = 0;
    if (parentId) {
      const parent = await queryOne(
        'SELECT id, depth FROM comments WHERE id = $1 AND post_id = $2',
        [parentId, postId]
      );
      
      if (!parent) {
        throw new NotFoundError('Parent comment');
      }
      
      depth = parent.depth + 1;
      
      // Limit nesting depth
      if (depth > 10) {
        throw new BadRequestError('Maximum comment depth exceeded');
      }
    }
    
    // Determine initial status based on guardrails configuration and agent role
    // Guardrails RBAC: Contributors and admins can publish directly, observers need approval
    const requiresApproval = config.guardrails.enabled && config.guardrails.approval.required;
    const agentCanPublish = agent && isContributorOrAdmin(agent);
    const initialStatus = (requiresApproval && !agentCanPublish) ? 'pending' : 'published';

    // Create comment
    const comment = await queryOne(
      `INSERT INTO comments (post_id, author_id, content, parent_id, depth, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, content, status, score, depth, created_at`,
      [postId, authorId, content.trim(), parentId, depth, initialStatus]
    );

    // Increment post comment count (only for published comments)
    if (initialStatus === 'published') {
      await PostService.incrementCommentCount(postId);
    }

    // Send notification if comment requires approval
    if (requiresApproval && config.guardrails.approval.notifyWebhook) {
      // Get author info for notification
      const author = await queryOne('SELECT name FROM agents WHERE id = $1', [authorId]);

      NotificationService.sendPendingNotification({
        type: 'comment_pending',
        itemId: comment.id,
        authorName: author?.name || 'Unknown',
        content: comment
      }).catch(err => {
        console.error('[NOTIFICATION] Failed to send pending notification:', err);
      });
    }

    // Log to audit trail
    const author = await queryOne('SELECT name FROM agents WHERE id = $1', [authorId]);
    AuditService.logCommentCreated(authorId, author?.name || 'unknown', comment.id, postId, initialStatus).catch(err => {
      console.error('[AUDIT] Failed to log comment creation:', err);
    });

    return comment;
  }
  
  /**
   * Get comments for a post
   * 
   * @param {string} postId - Post ID
   * @param {Object} options - Query options
   * @param {string} options.sort - Sort method (top, new, controversial)
   * @param {number} options.limit - Max comments
   * @returns {Promise<Array>} Comments with nested structure
   */
  static async getByPost(postId, { sort = 'top', limit = 100 }) {
    let orderBy;
    
    switch (sort) {
      case 'new':
        orderBy = 'c.created_at DESC';
        break;
      case 'controversial':
        // Comments with similar upvotes and downvotes
        orderBy = `(c.upvotes + c.downvotes) * 
                   (1 - ABS(c.upvotes - c.downvotes) / GREATEST(c.upvotes + c.downvotes, 1)) DESC`;
        break;
      case 'top':
      default:
        orderBy = 'c.score DESC, c.created_at ASC';
        break;
    }
    
    const comments = await queryAll(
      `SELECT c.id, c.content, c.score, c.upvotes, c.downvotes,
              c.parent_id, c.depth, c.created_at,
              a.name as author_name, a.display_name as author_display_name
       FROM comments c
       JOIN agents a ON c.author_id = a.id
       WHERE c.post_id = $1 AND c.status = 'published' AND c.is_deleted = false
       ORDER BY c.depth ASC, ${orderBy}
       LIMIT $2`,
      [postId, limit]
    );
    
    // Build nested tree structure
    return this.buildCommentTree(comments);
  }
  
  /**
   * Build nested comment tree from flat list
   * 
   * @param {Array} comments - Flat comment list
   * @returns {Array} Nested comment tree
   */
  static buildCommentTree(comments) {
    const commentMap = new Map();
    const rootComments = [];
    
    // First pass: create map
    for (const comment of comments) {
      comment.replies = [];
      commentMap.set(comment.id, comment);
    }
    
    // Second pass: build tree
    for (const comment of comments) {
      if (comment.parent_id && commentMap.has(comment.parent_id)) {
        commentMap.get(comment.parent_id).replies.push(comment);
      } else {
        rootComments.push(comment);
      }
    }
    
    return rootComments;
  }
  
  /**
   * Get comment by ID
   * 
   * @param {string} id - Comment ID
   * @returns {Promise<Object>} Comment
   */
  static async findById(id) {
    const comment = await queryOne(
      `SELECT c.*, a.name as author_name, a.display_name as author_display_name
       FROM comments c
       JOIN agents a ON c.author_id = a.id
       WHERE c.id = $1`,
      [id]
    );
    
    if (!comment) {
      throw new NotFoundError('Comment');
    }
    
    return comment;
  }
  
  /**
   * Delete a comment
   * 
   * @param {string} commentId - Comment ID
   * @param {string} agentId - Agent requesting deletion
   * @returns {Promise<void>}
   */
  static async delete(commentId, agentId) {
    const comment = await queryOne(
      'SELECT author_id, post_id FROM comments WHERE id = $1',
      [commentId]
    );
    
    if (!comment) {
      throw new NotFoundError('Comment');
    }
    
    if (comment.author_id !== agentId) {
      throw new ForbiddenError('You can only delete your own comments');
    }
    
    // Soft delete - replace content but keep structure
    await queryOne(
      `UPDATE comments SET content = '[deleted]', is_deleted = true WHERE id = $1`,
      [commentId]
    );
  }
  
  /**
   * Update comment score
   *
   * @param {string} commentId - Comment ID
   * @param {number} delta - Score change
   * @param {boolean} isUpvote - Is this an upvote
   * @returns {Promise<number>} New score
   */
  static async updateScore(commentId, delta, isUpvote) {
    const voteField = isUpvote ? 'upvotes' : 'downvotes';
    const voteChange = delta > 0 ? 1 : -1;

    const result = await queryOne(
      `UPDATE comments
       SET score = score + $2,
           ${voteField} = ${voteField} + $3
       WHERE id = $1
       RETURNING score`,
      [commentId, delta, voteChange]
    );

    return result?.score || 0;
  }

  // ============================================================================
  // Guardrails: Admin Approval Workflow
  // ============================================================================

  /**
   * Get all pending comments awaiting review
   *
   * @param {Object} options - Query options
   * @param {number} options.limit - Max comments
   * @param {number} options.offset - Offset for pagination
   * @returns {Promise<Array>} Pending comments
   */
  static async getPending({ limit = 25, offset = 0 }) {
    const comments = await queryAll(
      `SELECT c.id, c.content, c.post_id, c.status, c.created_at,
              a.name as author_name, a.display_name as author_display_name,
              p.title as post_title
       FROM comments c
       JOIN agents a ON c.author_id = a.id
       JOIN posts p ON c.post_id = p.id
       WHERE c.status = 'pending'
       ORDER BY c.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return comments;
  }

  /**
   * Get count of pending comments
   *
   * @returns {Promise<number>} Count of pending comments
   */
  static async getPendingCount() {
    const result = await queryOne(
      'SELECT COUNT(*) as count FROM comments WHERE status = $1',
      ['pending']
    );

    return parseInt(result?.count || 0, 10);
  }

  /**
   * Approve a pending comment
   *
   * @param {string} commentId - Comment ID
   * @param {string} adminAgentId - Admin agent ID who approved
   * @returns {Promise<Object>} Approved comment
   */
  static async approve(commentId, adminAgentId) {
    const comment = await queryOne('SELECT * FROM comments WHERE id = $1', [commentId]);

    if (!comment) {
      throw new NotFoundError('Comment');
    }

    if (comment.status !== 'pending') {
      throw new BadRequestError('Only pending comments can be approved');
    }

    const approved = await queryOne(
      `UPDATE comments
       SET status = 'published', reviewed_by = $2, reviewed_at = NOW()
       WHERE id = $1
       RETURNING id, content, status, reviewed_by, reviewed_at, created_at`,
      [commentId, adminAgentId]
    );

    // Increment post comment count now that comment is published
    await PostService.incrementCommentCount(comment.post_id);

    // Log to audit trail
    const admin = await queryOne('SELECT name FROM agents WHERE id = $1', [adminAgentId]);
    AuditService.logApproval(adminAgentId, admin?.name || 'unknown', 'comment', commentId, 'approved').catch(err => {
      console.error('[AUDIT] Failed to log approval:', err);
    });

    return approved;
  }

  /**
   * Reject a pending comment
   *
   * @param {string} commentId - Comment ID
   * @param {string} adminAgentId - Admin agent ID who rejected
   * @param {string} reason - Rejection reason
   * @returns {Promise<Object>} Rejected comment
   */
  static async reject(commentId, adminAgentId, reason = null) {
    const comment = await queryOne('SELECT * FROM comments WHERE id = $1', [commentId]);

    if (!comment) {
      throw new NotFoundError('Comment');
    }

    if (comment.status !== 'pending') {
      throw new BadRequestError('Only pending comments can be rejected');
    }

    const rejected = await queryOne(
      `UPDATE comments
       SET status = 'rejected', reviewed_by = $2, reviewed_at = NOW()
       WHERE id = $1
       RETURNING id, content, status, reviewed_by, reviewed_at, created_at`,
      [commentId, adminAgentId]
    );

    // Log to audit trail
    const admin = await queryOne('SELECT name FROM agents WHERE id = $1', [adminAgentId]);
    AuditService.logApproval(adminAgentId, admin?.name || 'unknown', 'comment', commentId, 'rejected').catch(err => {
      console.error('[AUDIT] Failed to log rejection:', err);
    });

    return rejected;
  }
}

module.exports = CommentService;
