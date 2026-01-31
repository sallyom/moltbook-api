/**
 * Credential Scanner Middleware
 * Detects and blocks API keys, tokens, and other credentials in content
 */

const config = require('../config');
const fs = require('fs');
const path = require('path');

// Credential detection patterns
const PATTERNS = {
  openai: {
    regex: /sk-[a-zA-Z0-9-]{20,}/g,
    description: 'OpenAI API key'
  },
  github: {
    regex: /gh[ps]_[a-zA-Z0-9]{20,}/g,
    description: 'GitHub personal access token'
  },
  github_oauth: {
    regex: /gho_[a-zA-Z0-9]{36,}/g,
    description: 'GitHub OAuth token'
  },
  aws: {
    regex: /AKIA[0-9A-Z]{16}/g,
    description: 'AWS access key'
  },
  aws_secret: {
    regex: /aws(.{0,20})?['\"][0-9a-zA-Z\/+]{40}['\"]/gi,
    description: 'AWS secret key'
  },
  google: {
    regex: /ya29\.[a-zA-Z0-9_-]+/g,
    description: 'Google OAuth token'
  },
  jwt: {
    regex: /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
    description: 'JSON Web Token (JWT)'
  },
  slack: {
    regex: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24,32}/g,
    description: 'Slack token'
  },
  stripe: {
    regex: /sk_live_[a-zA-Z0-9]{24,}/g,
    description: 'Stripe secret key'
  },
  anthropic: {
    regex: /sk-ant-[a-zA-Z0-9-]{20,}/g,
    description: 'Anthropic API key'
  },
  generic_base64: {
    regex: /[a-zA-Z0-9+\/]{50,}={0,2}/g,
    description: 'Potential base64-encoded secret (50+ chars)'
  },
  password_literal: {
    regex: /password\s+(is\s+)?['\"]?[\w!@#$%^&*()]{8,}|password\s*[:=]\s*['\"]?[\w!@#$%^&*()]{8,}/gi,
    description: 'Password in literal form'
  },
  api_key_literal: {
    regex: /api[_-]?key\s*[:=]\s*['\"]?[\w-]{20,}/gi,
    description: 'API key in literal form'
  }
};

/**
 * Load custom patterns from file
 */
function loadCustomPatterns() {
  const customPatternsPath = process.env.CREDENTIAL_PATTERNS_FILE ||
                             path.join(process.cwd(), '.credential_patterns.json');

  if (!fs.existsSync(customPatternsPath)) {
    return {};
  }

  try {
    const fileContent = fs.readFileSync(customPatternsPath, 'utf8');
    const customConfig = JSON.parse(fileContent);

    if (!customConfig.patterns) {
      console.warn('[CREDENTIAL_SCAN] Custom patterns file missing "patterns" key');
      return {};
    }

    const customPatterns = {};
    for (const [key, pattern] of Object.entries(customConfig.patterns)) {
      // Skip disabled patterns
      if (pattern.enabled === false) {
        continue;
      }

      // Validate pattern has required fields
      if (!pattern.regex || !pattern.description) {
        console.warn(`[CREDENTIAL_SCAN] Custom pattern "${key}" missing regex or description, skipping`);
        continue;
      }

      // Convert regex string to RegExp object
      try {
        customPatterns[`custom_${key}`] = {
          regex: new RegExp(pattern.regex, 'g'),
          description: pattern.description
        };
      } catch (err) {
        console.warn(`[CREDENTIAL_SCAN] Invalid regex for custom pattern "${key}": ${err.message}`);
      }
    }

    console.log(`[CREDENTIAL_SCAN] Loaded ${Object.keys(customPatterns).length} custom patterns from ${customPatternsPath}`);
    return customPatterns;
  } catch (err) {
    console.warn(`[CREDENTIAL_SCAN] Failed to load custom patterns: ${err.message}`);
    return {};
  }
}

// Load custom patterns at startup
const CUSTOM_PATTERNS = loadCustomPatterns();

// Merge built-in and custom patterns
const ALL_PATTERNS = { ...PATTERNS, ...CUSTOM_PATTERNS };

/**
 * Scan text for potential credentials
 */
function scanForCredentials(text, enabledPatterns = []) {
  if (!text || typeof text !== 'string') {
    return { found: [], clean: true };
  }

  const violations = [];

  for (const [type, pattern] of Object.entries(ALL_PATTERNS)) {
    // Skip if pattern not enabled
    if (enabledPatterns.length > 0 && !enabledPatterns.includes(type)) {
      continue;
    }

    const matches = text.match(pattern.regex);
    if (matches && matches.length > 0) {
      // Deduplicate matches
      const uniqueMatches = [...new Set(matches)];

      violations.push({
        type,
        description: pattern.description,
        count: uniqueMatches.length,
        samples: uniqueMatches.slice(0, 3).map(m => {
          // Show first 10 chars + ...
          return m.length > 15 ? m.substring(0, 15) + '...' : m;
        })
      });
    }
  }

  return {
    found: violations,
    clean: violations.length === 0
  };
}

/**
 * Extract all text content from request body
 */
function extractTextContent(body) {
  const texts = [];

  if (typeof body === 'string') {
    return [body];
  }

  if (typeof body === 'object' && body !== null) {
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === 'string') {
        texts.push(value);
      } else if (typeof value === 'object' && value !== null) {
        // Recursively extract from nested objects
        texts.push(...extractTextContent(value));
      }
    }
  }

  return texts;
}

/**
 * Middleware: Scan request content for credentials
 */
function credentialScanMiddleware(req, res, next) {
  const { guardrails } = config;

  // Skip if guardrails disabled
  if (!guardrails.enabled && !guardrails.auditOnly) {
    return next();
  }

  // Skip if credential scan disabled
  if (!guardrails.credentialScan.enabled) {
    return next();
  }

  // Extract all text from request body
  const texts = extractTextContent(req.body);
  const combinedText = texts.join('\n');

  // Scan for credentials
  const scanResult = scanForCredentials(
    combinedText,
    guardrails.credentialScan.patterns
  );

  // Handle violations
  if (!scanResult.clean) {
    const action = guardrails.credentialScan.action;

    // Log violation
    console.warn('[CREDENTIAL_SCAN] Potential credentials detected', {
      agent: req.agent?.name || 'unknown',
      path: req.path,
      method: req.method,
      violations: scanResult.found,
      action
    });

    // Store in request for audit log
    req.credentialScanViolation = {
      found: scanResult.found,
      action
    };

    if (action === 'block') {
      // Block request
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Content contains potential credentials or sensitive data',
        code: 'CREDENTIAL_DETECTED',
        violations: scanResult.found.map(v => ({
          type: v.type,
          description: v.description,
          count: v.count
        })),
        help: 'Remove API keys, tokens, passwords, and other credentials from your content. Never share credentials through Moltbook.'
      });
    }

    if (action === 'flag') {
      // Flag for admin review (requires approval workflow)
      req.body._flagged = true;
      req.body._flagReason = 'Potential credentials detected';
      req.body._flagDetails = scanResult.found;
    }

    // 'log' action: just logged above, continue
  }

  next();
}

/**
 * Scan a single string (useful for testing)
 */
function scanString(text) {
  return scanForCredentials(text);
}

module.exports = {
  credentialScanMiddleware,
  scanString,
  PATTERNS,
  CUSTOM_PATTERNS,
  ALL_PATTERNS,
  loadCustomPatterns
};
