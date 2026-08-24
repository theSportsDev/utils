'use strict';

const crypto = require('crypto');
const { format } = require('winston');
const { createSanitizer, safeRead } = require('./sanitize');

const LEVEL = Symbol.for('level');
const CANONICAL_FIELDS = ['request_id', 'trace_id', 'span_id', 'memberId', 'event', 'module', 'operation', 'duration_ms', 'stack', 'userId', 'password', 'memberName', 'authorization', 'customer_code', 'hostname', 'filename', 'eventName', 'operationName', 'serviceName', 'routeName'];

function readPath(source, path) {
  let current = source;
  for (const key of path.split('.')) {
    const read = safeRead(current, key);
    if (!read.ok || read.value === undefined || read.value === null) return undefined;
    current = read.value;
  }
  return current;
}

function assignPath(target, path, value) {
  const keys = path.split('.');
  let current = target;
  keys.slice(0, -1).forEach((key) => {
    if (!current[key]) current[key] = Object.create(null);
    current = current[key];
  });
  current[keys[keys.length - 1]] = value;
}

function readHttp(source) {
  const http = {};
  ['method', 'route', 'status_code'].forEach((key) => {
    const value = readPath(source, `http.${key}`);
    if (value !== undefined) http[key] = value;
  });
  return Object.keys(http).length ? http : undefined;
}

function readError(source, depth = 0, seen = new WeakSet()) {
  const error = readPath(source, 'error');
  if (!error || typeof error !== 'object' || depth > 4 || seen.has(error)) return undefined;
  seen.add(error);
  const result = {};
  ['kind', 'message', 'stack'].forEach((key) => {
    const value = boundedOwnString(error, key);
    if (value !== undefined) result[key] = value;
  });
  const cause = safeRead(error, 'cause');
  if (cause.ok && cause.value && typeof cause.value === 'object' && isBoundedErrorPayload(cause.value)) {
    const nested = readError({ error: cause.value }, depth + 1, seen);
    if (nested) result.cause = nested;
  } else if (cause.ok && (cause.value === null || ['string', 'number', 'boolean'].includes(typeof cause.value))) {
    result.cause = cause.value;
  }
  result.fingerprint = normalizeFingerprint(result);
  return Object.keys(result).length ? result : undefined;
}

function boundedOwnString(value, key) {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
      && typeof descriptor.value === 'string' && Buffer.byteLength(descriptor.value, 'utf8') <= 8192
      ? descriptor.value
      : undefined;
  } catch (_) {
    return undefined;
  }
}

function isNativeError(value) {
  try {
    return Boolean(value && typeof value === 'object' && Error.prototype.isPrototypeOf(value));
  } catch (_) {
    return false;
  }
}

function isBoundedErrorPayload(value) {
  if (isNativeError(value)) return true;
  try {
    const required = ['kind', 'message'].map((key) => Object.getOwnPropertyDescriptor(value, key));
    const stack = Object.getOwnPropertyDescriptor(value, 'stack');
    return required.every((descriptor) => descriptor
      && Object.prototype.hasOwnProperty.call(descriptor, 'value')
      && typeof descriptor.value === 'string'
      && Buffer.byteLength(descriptor.value, 'utf8') <= 8192)
      && (!stack || (Object.prototype.hasOwnProperty.call(stack, 'value')
        && (stack.value === undefined || (typeof stack.value === 'string' && Buffer.byteLength(stack.value, 'utf8') <= 8192))));
  } catch (_) {
    return false;
  }
}

function readLegacy(source) {
  const profile = {};
  const address = readPath(source, 'profile.address');
  const mobile = readPath(source, 'profile.nested.mobile');
  if (address !== undefined) profile.address = address;
  if (mobile !== undefined) profile.nested = { mobile };
  const checkoutNickname = readPath(source, 'checkout.recipient.nickname');
  const result = {};
  if (Object.keys(profile).length) result.profile = profile;
  if (checkoutNickname !== undefined) result.checkout = { recipient: { nickname: checkoutNickname } };
  return result;
}

function normalizeFingerprint(error) {
  try {
    const kind = boundedOwnString(error, 'kind') || 'Error';
    const message = boundedOwnString(error, 'message') || '';
    const normalized = message.replace(/\[REDACTED\]/g, '').replace(/\b\d+\b/g, '#').replace(/회원\s+[가-힣]{2,4}/g, '회원 #');
    return crypto.createHash('sha256').update(`${kind}:${normalized}`).digest('hex').slice(0, 16);
  } catch (_) {
    return crypto.createHash('sha256').update('Error:').digest('hex').slice(0, 16);
  }
}

function structuredFormat(config) {
  const sanitize = createSanitizer(config.redaction);
  const attributePaths = Array.isArray(config.attributePaths) ? config.attributePaths.slice(0, 50) : [];
  return format((info) => {
    const level = safeRead(info, 'level').value || 'info';
    const timestamp = safeRead(info, 'timestamp').value || new Date().toISOString();
    const message = safeRead(info, 'message').value;
    const event = {
      schemaVersion: '1.0', timestamp, level, message: message === undefined ? '' : String(message),
      status: level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info',
      service: config.service, env: config.env, version: config.version, source: config.source,
    };
    CANONICAL_FIELDS.forEach((key) => {
      const value = safeRead(info, key);
      if (value.ok && value.value !== undefined) event[key] = value.value;
    });
    const http = readHttp(info);
    const error = readError(info);
    if (http) event.http = http;
    if (error) event.error = error;
    Object.assign(event, readLegacy(info));
    const attributes = Object.create(null);
    attributePaths.forEach((path) => {
      if (typeof path !== 'string' || !path || path.split('.').length > 4) return;
      const value = readPath(info, `attributes.${path}`);
      if (value !== undefined) assignPath(attributes, path, value);
    });
    if (Object.keys(attributes).length) event.attributes = attributes;
    const sanitized = sanitize(event);
    if (sanitized.error && typeof sanitized.error === 'object') sanitized.error.fingerprint = normalizeFingerprint(sanitized.error);
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
