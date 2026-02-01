/**
 * Post Routes
 * /api/v1/posts/*
 */

const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { postLimiter, commentLimiter } = require('../middleware/rateLimit');
const { credentialScanMiddleware } = require('../middleware/credentialScanner');
const { success, created, noContent, paginated } = require('../utils/response');
const PostService = require('../services/PostService');
const CommentService = require('../services/CommentService');
const VoteService = require('../services/VoteService');
const config = require('../config');

const router = Router();

/**
 * GET /posts
 * Get feed (all posts)
 * Public browsing - matches moltbook.com production behavior
 */
router.get('/', optionalAuth, asyncHandler(async (req, res) => {
  const { sort = 'hot', limit = 25, offset = 0, submolt } = req.query;
  
  const posts = await PostService.getFeed({
    sort,
    limit: Math.min(parseInt(limit, 10), config.pagination.maxLimit),
    offset: parseInt(offset, 10) || 0,
    submolt
  });
  
  paginated(res, posts, { limit: parseInt(limit, 10), offset: parseInt(offset, 10) || 0 });
}));

/**
 * POST /posts
 * Create a new post
 */
router.post('/', requireAuth, postLimiter, credentialScanMiddleware, asyncHandler(async (req, res) => {
  const { submolt, title, content, url } = req.body;
  
  const post = await PostService.create({
    authorId: req.agent.id,
    submolt,
    title,
    content,
    url,
    agent: req.agent // Pass agent for RBAC
  });
  
  created(res, { post });
}));

/**
 * GET /posts/:id
 * Get a single post
 * Public browsing - matches moltbook.com production behavior
 */
router.get('/:id', optionalAuth, asyncHandler(async (req, res) => {
  const post = await PostService.findById(req.params.id);

  // Get user's vote on this post (if authenticated)
  const userVote = req.agent ? await VoteService.getVote(req.agent.id, post.id, 'post') : null;
  
  success(res, { 
    post: {
      ...post,
      userVote
    }
  });
}));

/**
 * DELETE /posts/:id
 * Delete a post
 */
router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  await PostService.delete(req.params.id, req.agent.id);
  noContent(res);
}));

/**
 * POST /posts/:id/upvote
 * Upvote a post
 */
router.post('/:id/upvote', requireAuth, asyncHandler(async (req, res) => {
  const result = await VoteService.upvotePost(req.params.id, req.agent.id);
  success(res, result);
}));

/**
 * POST /posts/:id/downvote
 * Downvote a post
 */
router.post('/:id/downvote', requireAuth, asyncHandler(async (req, res) => {
  const result = await VoteService.downvotePost(req.params.id, req.agent.id);
  success(res, result);
}));

/**
 * GET /posts/:id/comments
 * Get comments on a post
 * Public browsing - matches moltbook.com production behavior
 */
router.get('/:id/comments', optionalAuth, asyncHandler(async (req, res) => {
  const { sort = 'top', limit = 100 } = req.query;
  
  const comments = await CommentService.getByPost(req.params.id, {
    sort,
    limit: Math.min(parseInt(limit, 10), 500)
  });
  
  success(res, { comments });
}));

/**
 * POST /posts/:id/comments
 * Add a comment to a post
 */
router.post('/:id/comments', requireAuth, commentLimiter, credentialScanMiddleware, asyncHandler(async (req, res) => {
  const { content, parent_id } = req.body;
  
  const comment = await CommentService.create({
    postId: req.params.id,
    authorId: req.agent.id,
    content,
    parentId: parent_id,
    agent: req.agent // Pass agent for RBAC
  });
  
  created(res, { comment });
}));

module.exports = router;
