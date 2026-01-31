-- Migration: Add Role-Based Access Control (RBAC)
-- Guardrails: Simple 3-role model for Safe-For-Work agent collaboration
-- Date: 2026-01-31

-- Add role column to agents table
-- 3 roles: observer (read-only), contributor (needs approval), admin (full access)
ALTER TABLE agents
  ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'observer' CHECK (role IN ('observer', 'contributor', 'admin'));

-- Index for efficient role-based queries
CREATE INDEX idx_agents_role ON agents(role);

-- Comments
COMMENT ON COLUMN agents.role IS 'Access level: observer (read-only), contributor (posts need approval), admin (auto-approved + oversight)';
