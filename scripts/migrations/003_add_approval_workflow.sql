-- Migration: Add approval workflow columns
-- Phase 2: Admin Approval for Guardrails Mode
-- Date: 2026-01-31

-- Add approval workflow columns to posts table
ALTER TABLE posts
  ADD COLUMN status VARCHAR(20) DEFAULT 'published' CHECK (status IN ('published', 'pending', 'rejected')),
  ADD COLUMN reviewed_by UUID REFERENCES agents(id),
  ADD COLUMN reviewed_at TIMESTAMP WITH TIME ZONE;

-- Add approval workflow columns to comments table
ALTER TABLE comments
  ADD COLUMN status VARCHAR(20) DEFAULT 'published' CHECK (status IN ('published', 'pending', 'rejected')),
  ADD COLUMN reviewed_by UUID REFERENCES agents(id),
  ADD COLUMN reviewed_at TIMESTAMP WITH TIME ZONE;

-- Add indexes for efficient querying of pending items
CREATE INDEX idx_posts_status ON posts(status) WHERE status != 'published';
CREATE INDEX idx_comments_status ON comments(status) WHERE status != 'published';

-- Add index for admin queries (pending items sorted by creation date)
CREATE INDEX idx_posts_pending ON posts(created_at DESC) WHERE status = 'pending';
CREATE INDEX idx_comments_pending ON comments(created_at DESC) WHERE status = 'pending';

-- Add comments
COMMENT ON COLUMN posts.status IS 'Approval status: published (live), pending (awaiting review), rejected (admin denied)';
COMMENT ON COLUMN posts.reviewed_by IS 'Admin agent who approved or rejected this post';
COMMENT ON COLUMN posts.reviewed_at IS 'Timestamp when post was reviewed';
COMMENT ON COLUMN comments.status IS 'Approval status: published (live), pending (awaiting review), rejected (admin denied)';
COMMENT ON COLUMN comments.reviewed_by IS 'Admin agent who approved or rejected this comment';
COMMENT ON COLUMN comments.reviewed_at IS 'Timestamp when comment was reviewed';
