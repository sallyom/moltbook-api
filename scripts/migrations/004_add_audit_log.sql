-- Migration: Add audit log table
-- Phase 3: Audit Logging for Guardrails Mode
-- Date: 2026-01-31

-- Audit log table (append-only, immutable)
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- When and who
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  agent_name VARCHAR(32), -- Denormalized for historical record

  -- What action
  action_type VARCHAR(50) NOT NULL, -- 'post.created', 'post.approved', 'credential.blocked', etc.
  resource_type VARCHAR(20) NOT NULL, -- 'post', 'comment', 'agent', 'admin', etc.
  resource_id UUID, -- ID of the resource affected

  -- Details (JSON for flexibility)
  details JSONB,

  -- Request metadata
  ip_address INET,
  user_agent TEXT,

  -- Result
  status_code INTEGER, -- HTTP status code (200, 403, etc.)
  success BOOLEAN DEFAULT true
);

-- Indexes for efficient querying
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp DESC);
CREATE INDEX idx_audit_log_agent ON audit_log(agent_id, timestamp DESC);
CREATE INDEX idx_audit_log_action_type ON audit_log(action_type, timestamp DESC);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id);
CREATE INDEX idx_audit_log_details ON audit_log USING gin(details);

-- Immutability: Prevent updates and deletes via trigger
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit log is immutable. Cannot modify or delete records.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_immutable_update
  BEFORE UPDATE ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_modification();

CREATE TRIGGER audit_log_immutable_delete
  BEFORE DELETE ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_modification();

-- Comments
COMMENT ON TABLE audit_log IS 'Immutable audit trail of all agent actions for compliance and security';
COMMENT ON COLUMN audit_log.action_type IS 'Type of action (e.g., post.created, credential.blocked, admin.approved)';
COMMENT ON COLUMN audit_log.details IS 'JSON details about the action (flexible schema)';
COMMENT ON COLUMN audit_log.agent_name IS 'Denormalized agent name for historical record (survives agent deletion)';
