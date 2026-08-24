'use strict';

const crypto = require('crypto');

const REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

function createId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
}

function validId(value) {
  return typeof value === 'string' && REQUEST_ID.test(value) ? value : null;
}

function requestLoggerMiddleware(loggerInstance, options = {}) {
  if (!loggerInstance || typeof loggerInstance.child !== 'function') {
    throw new TypeError('requestLoggerMiddleware requires a logger instance');
  }

  return (req, res, next) => {
    const headers = req.headers || {};
    const trustIncomingIds = options.trustProxy === true || options.trustIncomingIds === true;
    const activeContext = typeof loggerInstance.activeContext === 'function' ? loggerInstance.activeContext() : {};
    const requestId = trustIncomingIds ? validId(headers['x-request-id']) || createId() : createId();
    const traceId = validId(activeContext.trace_id) || (trustIncomingIds ? validId(headers['x-trace-id']) : null);
    const startedAt = process.hrtime.bigint ? process.hrtime.bigint() : null;
    let finalized = false;

    req.request_id = requestId;
    req.trace_id = traceId;
    req.log = loggerInstance.child(traceId ? { request_id: requestId, trace_id: traceId } : { request_id: requestId });
    if (typeof res.setHeader === 'function') {
      res.setHeader('X-Request-Id', requestId);
      if (traceId) res.setHeader('X-Trace-Id', traceId);
    }

    const finalize = (outcome) => {
      if (finalized) return;
      finalized = true;
      const durationMs = startedAt
        ? Number(process.hrtime.bigint() - startedAt) / 1e6
        : 0;
      const route = req.route && typeof req.route.path === 'string' ? req.route.path : undefined;
      const aborted = outcome === 'aborted';
      req.log.info(aborted ? 'HTTP request aborted' : 'HTTP request completed', {
        event: aborted ? 'http.request.aborted' : 'http.request.completed',
        duration_ms: Math.round(durationMs),
        http: {
          method: req.method,
          route,
          status_code: aborted ? 499 : res.statusCode,
        },
      });
    };
    res.once('finish', () => finalize('finish'));
    res.once('close', () => finalize(res.writableFinished === true ? 'close' : 'aborted'));
    req.once('aborted', () => finalize('aborted'));

    next();
  };
}

module.exports = { requestLoggerMiddleware };
