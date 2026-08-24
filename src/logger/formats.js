'use strict';

const { format } = require('winston');
const { createSanitizer, safeRead } = require('./sanitize');

const LEVEL = Symbol.for('level');
const CANONICAL_FIELDS = ['request_id', 'trace_id', 'span_id', 'event', 'duration_ms', 'value'];

function readPath(source, path) {
  let current = source;
  for (const key of path.split('.')) {
    const read = safeRead(current, key);
    if (!read.ok || read.value === undefined || read.value === null) return undefined;
    current = read.value;
  }
  return current;
}

function readHttp(source) {
  const http = {};
  ['method', 'route', 'status_code'].forEach((key) => {
    const value = readPath(source, `http.${key}`);
    if (value !== undefined) http[key] = value;
  });
  return Object.keys(http).length ? http : undefined;
}

function structuredFormat(config) {
  const sanitize = createSanitizer();
  const service = typeof config.service === 'string' ? config.service : 'unknown-service';
  const env = typeof config.env === 'string' ? config.env : 'unknown';
  const version = typeof config.version === 'string' ? config.version : 'unknown';
  return format((info) => {
    const level = safeRead(info, 'level').value || 'info';
    const timestamp = safeRead(info, 'timestamp').value || new Date().toISOString();
    const message = safeRead(info, 'message').value;
    const event = {
      schemaVersion: '1.0', timestamp, level, message: message === undefined ? '' : String(message),
      status: level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info',
      service, env, version, source: 'nodejs',
    };
    CANONICAL_FIELDS.forEach((key) => {
      const value = safeRead(info, key);
      if (value.ok && value.value !== undefined) event[key] = value.value;
    });
    const http = readHttp(info);
    if (http) event.http = http;
    const sanitized = sanitize(event);
    return { ...sanitized, [LEVEL]: level };
  })();
}

function jsonFormat(config) {
  return format.combine(format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }), format.errors({ stack: true }), structuredFormat(config), format.json());
}

function prettyFormat(config) {
  return format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), format.errors({ stack: true }), structuredFormat(config), format.colorize({ all: true }),
    format.printf(({ timestamp, level, message, env, ...meta }) => `${timestamp} [${env || config.env}] ${level}: ${message}${Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''}`)
  );
}

module.exports = { jsonFormat, prettyFormat };
