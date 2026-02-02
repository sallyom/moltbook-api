/**
 * OpenTelemetry Instrumentation
 * Integrates audit logs with OTEL traces for observability
 *
 * Guardrails: Audit Logging + OpenTelemetry
 */

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
const { Resource } = require('@opentelemetry/resources');
const { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } = require('@opentelemetry/semantic-conventions');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const {
  LoggerProvider,
  BatchLogRecordProcessor
} = require('@opentelemetry/sdk-logs');
const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const config = require('../config');

let sdk;
let loggerProvider;
let auditLogger;

/**
 * Initialize OpenTelemetry SDK
 */
function initializeOTEL() {
  // Skip if OTEL is disabled
  if (!config.otel?.enabled) {
    console.log('[OTEL] Disabled - skipping initialization');
    return null;
  }

  try {
    const serviceName = config.otel.serviceName || 'moltbook-api';
    const otlpEndpoint = config.otel.endpoint || 'http://localhost:4318';

    // Create resource with service metadata
    const mlflowExperiment = process.env.MLFLOW_EXPERIMENT_NAME || 'OpenClaw';
    const resource = new Resource({
      [SEMRESATTRS_SERVICE_NAME]: serviceName,
      [SEMRESATTRS_SERVICE_VERSION]: require('../../package.json').version,
      'deployment.environment': config.nodeEnv,
      'mlflow.experimentName': mlflowExperiment,
      'mlflow.projectName': mlflowExperiment
    });

    // Initialize Logger Provider for audit logs
    loggerProvider = new LoggerProvider({ resource });

    const logExporter = new OTLPLogExporter({
      url: `${otlpEndpoint}/v1/logs`,
      headers: {}
    });

    loggerProvider.addLogRecordProcessor(
      new BatchLogRecordProcessor(logExporter)
    );

    // Get audit logger
    auditLogger = loggerProvider.getLogger('audit', '1.0.0');

    // Initialize trace exporters and span processors
    const spanProcessors = [];

    // Primary: OTEL Collector
    const collectorExporter = new OTLPTraceExporter({
      url: `${otlpEndpoint}/v1/traces`
    });
    spanProcessors.push(new BatchSpanProcessor(collectorExporter));

    // Optional: MLFlow (if enabled)
    const mlflowEnabled = process.env.MLFLOW_TRACING_ENABLED === 'true';
    const mlflowEndpoint = process.env.MLFLOW_TRACKING_URI || 'http://mlflow-service.mlflow.svc.cluster.local:5000';
    // mlflowExperiment already declared above (line 42)

    if (mlflowEnabled) {
      const mlflowExporter = new OTLPTraceExporter({
        url: `${mlflowEndpoint}/v1/traces`,
        headers: {
          'x-mlflow-source': 'moltbook-api',
          'x-mlflow-experiment-name': mlflowExperiment
        }
      });
      spanProcessors.push(new BatchSpanProcessor(mlflowExporter));
      console.log(`[OTEL] MLFlow tracing enabled - sending to ${mlflowEndpoint} (experiment: ${mlflowExperiment})`);
    }

    // NodeSDK with multiple span processors
    sdk = new NodeSDK({
      resource,
      spanProcessors,
      instrumentations: [
        new HttpInstrumentation({
          ignoreIncomingPaths: ['/health', '/api/v1/health']
        }),
        new ExpressInstrumentation()
      ]
    });

    sdk.start();

    const destinations = spanProcessors.length > 1
      ? `${otlpEndpoint} + MLFlow`
      : otlpEndpoint;
    console.log(`[OTEL] Initialized - sending to ${destinations}`);
    return sdk;
  } catch (error) {
    console.error('[OTEL] Initialization failed:', error.message);
    return null;
  }
}

/**
 * Emit audit log as OpenTelemetry log record
 *
 * @param {Object} auditData - Audit log data
 */
function emitAuditLog(auditData) {
  if (!auditLogger || !config.otel?.enabled) {
    return; // OTEL not initialized or disabled
  }

  try {
    const {
      timestamp = new Date(),
      agentId,
      agentName,
      actionType,
      resourceType,
      resourceId,
      details = {},
      ipAddress,
      userAgent,
      statusCode,
      success
    } = auditData;

    // Emit structured log with OTEL
    auditLogger.emit({
      timestamp: timestamp.getTime(),
      severityNumber: success ? 9 : 17, // INFO (9) or ERROR (17)
      severityText: success ? 'INFO' : 'ERROR',
      body: `Audit: ${actionType} on ${resourceType}`,
      attributes: {
        // Audit-specific attributes
        'audit.agent.id': agentId,
        'audit.agent.name': agentName,
        'audit.action.type': actionType,
        'audit.resource.type': resourceType,
        'audit.resource.id': resourceId,
        'audit.success': success,
        'audit.status_code': statusCode,

        // Request context
        'http.client_ip': ipAddress,
        'http.user_agent': userAgent,

        // Details as JSON string
        'audit.details': JSON.stringify(details)
      }
    });
  } catch (error) {
    console.error('[OTEL] Failed to emit audit log:', error.message);
  }
}

/**
 * Gracefully shutdown OTEL SDK
 */
async function shutdownOTEL() {
  if (sdk) {
    try {
      await sdk.shutdown();
      console.log('[OTEL] Shutdown complete');
    } catch (error) {
      console.error('[OTEL] Shutdown error:', error.message);
    }
  }

  if (loggerProvider) {
    try {
      await loggerProvider.shutdown();
    } catch (error) {
      console.error('[OTEL] LoggerProvider shutdown error:', error.message);
    }
  }
}

// Handle graceful shutdown
process.on('SIGTERM', shutdownOTEL);
process.on('SIGINT', shutdownOTEL);

module.exports = {
  initializeOTEL,
  emitAuditLog,
  shutdownOTEL
};
