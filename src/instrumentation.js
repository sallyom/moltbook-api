/**
 * OpenTelemetry Instrumentation Bootstrap
 *
 * CRITICAL: This file must be required FIRST, before any other modules
 * OpenTelemetry auto-instrumentation must patch modules before they're loaded
 */

const config = require('./config');
const { initializeOTEL } = require('./observability/telemetry');

// Initialize OTEL before any HTTP/Express modules are loaded
if (config.otel?.enabled) {
  initializeOTEL();
  console.log('[OTEL] Instrumentation loaded (before app modules)');
}

module.exports = {};
