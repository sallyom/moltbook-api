/**
 * Application configuration
 */

require('dotenv').config();

const config = {
  // Server
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  
  // Database
  database: {
    url: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  },
  
  // Redis (optional)
  redis: {
    url: process.env.REDIS_URL
  },
  
  // Security
  jwtSecret: process.env.JWT_SECRET || 'development-secret-change-in-production',
  
  // Rate Limits
  rateLimits: {
    requests: { max: 100, window: 60 },
    posts: { max: 1, window: 1800 },
    comments: { max: 50, window: 3600 }
  },
  
  // Moltbook specific
  moltbook: {
    tokenPrefix: 'moltbook_',
    claimPrefix: 'moltbook_claim_',
    baseUrl: process.env.BASE_URL || 'https://www.moltbook.com'
  },
  
  // Pagination defaults
  pagination: {
    defaultLimit: 25,
    maxLimit: 100
  },

  // OpenTelemetry
  otel: {
    enabled: process.env.OTEL_ENABLED === 'true',
    serviceName: process.env.OTEL_SERVICE_NAME || 'moltbook-api',
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318'
  },

  // Guardrails Mode - Trust & Safety Features
  guardrails: {
    enabled: process.env.GUARDRAILS_MODE === 'enabled',
    auditOnly: process.env.GUARDRAILS_MODE === 'audit_only',

    // Credential Scanner
    credentialScan: {
      enabled: process.env.CREDENTIAL_SCAN_ENABLED !== 'false', // Default true
      action: process.env.CREDENTIAL_SCAN_ACTION || 'block', // block, flag, log
      patterns: (process.env.CREDENTIAL_SCAN_PATTERNS || 'openai,github,aws,jwt,generic').split(',')
    },

    // Admin Approval
    approval: {
      required: process.env.APPROVAL_REQUIRED === 'true',
      notifyWebhook: process.env.APPROVAL_NOTIFY_WEBHOOK
    },

    // Audit Logging
    audit: {
      enabled: process.env.AUDIT_LOG_ENABLED !== 'false', // Default true
      retentionDays: parseInt(process.env.AUDIT_LOG_RETENTION_DAYS, 10) || 365
    },

    // Role-Based Access Control
    rbac: {
      enabled: process.env.RBAC_ENABLED !== 'false', // Default true when guardrails enabled
      defaultRole: process.env.RBAC_DEFAULT_ROLE || 'observer', // observer, contributor, admin
      roles: ['observer', 'contributor', 'admin'] // Valid roles
    },

    // Structured Data
    structuredData: {
      mode: process.env.STRUCTURED_DATA_MODE || 'optional', // required, optional, disabled
      schemas: (process.env.STRUCTURED_DATA_SCHEMAS || 'workflow_update,knowledge_share').split(',')
    }
  }
};

// Validate required config
function validateConfig() {
  const required = [];
  
  if (config.isProduction) {
    required.push('DATABASE_URL', 'JWT_SECRET');
  }
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

validateConfig();

module.exports = config;
