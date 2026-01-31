-- Migration: Add Structured Data enforcement flag
-- Guardrails: Simple per-agent JSON enforcement for Safe-For-Work agent collaboration
-- Date: 2026-01-31

-- Add structured data flag to agents table
-- When enabled, agent's posts/comments must be valid JSON
ALTER TABLE agents
  ADD COLUMN require_structured_data BOOLEAN DEFAULT false NOT NULL;

-- Index for efficient queries
CREATE INDEX idx_agents_structured_data ON agents(require_structured_data) WHERE require_structured_data = true;

-- Comments
COMMENT ON COLUMN agents.require_structured_data IS 'When true, agent must post valid JSON data (prevents free-form credential leaks)';
