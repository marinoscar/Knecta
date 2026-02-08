import pino from 'pino';

const isDevelopment = process.env.NODE_ENV === 'development';
const isOtelEnabled = process.env.OTEL_ENABLED === 'true';
const serviceName = process.env.OTEL_SERVICE_NAME || 'enterprise-app-api';

function buildTransport(): pino.TransportSingleOptions | pino.TransportMultiOptions | undefined {
  const otelTransport: pino.TransportSingleOptions = {
    target: 'pino-opentelemetry-transport',
    options: {
      loggerName: serviceName,
      resourceAttributes: {
        'service.name': serviceName,
      },
    },
  };

  const prettyTransport: pino.TransportSingleOptions = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  };

  if (isDevelopment && isOtelEnabled) {
    // Development with OTEL: both pretty console and OTLP
    return {
      targets: [prettyTransport, otelTransport],
    };
  }

  if (isDevelopment) {
    // Development without OTEL: pretty console only
    return prettyTransport;
  }

  if (isOtelEnabled) {
    // Production with OTEL: OTLP only
    return otelTransport;
  }

  // Production without OTEL: no transport (stdout JSON)
  return undefined;
}

export const pinoConfig: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
    bindings: (bindings) => ({
      pid: bindings.pid,
      host: bindings.hostname,
      service: serviceName,
    }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: buildTransport(),
};

export const createLogger = () => pino(pinoConfig);
