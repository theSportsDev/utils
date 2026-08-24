'use strict';

const fs = require('fs');
const path = require('path');

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const crypto = require('crypto');

const envConfig = require('../env');
const { jsonFormat, prettyFormat } = require('./formats');
const { safeRead } = require('./sanitize');

const LEVELS = ['error', 'warn', 'info', 'http', 'verbose', 'debug'];
const SNAPSHOT_CANONICAL_KEYS = ['request_id', 'trace_id', 'span_id', 'memberId', 'event', 'module', 'operation', 'duration_ms', 'path'];
const COMPATIBLE_OBJECT_KEYS = ['event', 'userId', 'requestId', 'duration'];
const BOUNDED_ERROR = Symbol.for('@theSportsDev/utils/bounded-error');
const TRANSPORT_KEYS = [...SNAPSHOT_CANONICAL_KEYS, 'error', 'stack', 'userId', 'requestId', 'duration', 'port', 'usage', 'host', 'sql', 'ip', 'code', 'reason', 'orderId', 'password', 'memberName', 'authorization', 'customer_code', 'hostname', 'filename', 'eventName', 'operationName', 'serviceName', 'routeName'];
const SAFE_PATH_SEGMENT = /^[A-Za-z][A-Za-z0-9_]*$/;

class Logger {
  static resolveConfig(userConfig) {
    const env = userConfig.env || envConfig.nodeEnv;
    const isDev = env === 'development';
    return {
      env,
      level: userConfig.level || (isDev ? 'debug' : 'info'),
      format: userConfig.format || (isDev ? 'pretty' : 'json'),
      logDir: userConfig.logDir || null,
      maxFiles: userConfig.maxFiles || '30d',
      maxSize: userConfig.maxSize || '20m',
      service: userConfig.service || process.env.SERVICE_NAME || 'unknown-service',
      version: userConfig.version || process.env.APP_VERSION || 'unknown',
      contextProvider: userConfig.contextProvider,
      attributePaths: Logger.validateAttributePaths(userConfig.attributePaths),
      redaction: userConfig.redaction || {},
      enableFile: userConfig.enableFile !== undefined ? userConfig.enableFile : Boolean(userConfig.logDir),
    };
  }

  static buildTransports(config) {
    const json = jsonFormat(config);
    const consoleFormat = config.format === 'json' ? json : prettyFormat(config);
    const list = [new winston.transports.Console({ format: consoleFormat })];

    if (config.enableFile) {
      if (!config.logDir) {
        console.error('[Logger] logDir is required when enableFile is true. File logging disabled.');
        return list;
      }
      const dir = path.resolve(config.logDir, config.env);
      fs.mkdirSync(dir, { recursive: true });

      const shared = {
        dirname: dir,
        datePattern: 'YYYY-MM-DD',
        maxFiles: config.maxFiles,
        maxSize: config.maxSize,
        zippedArchive: true,
        format: json,
      };
      const fileTransports = [
        new DailyRotateFile({ ...shared, filename: '%DATE%-combined.log' }),
        new DailyRotateFile({ ...shared, filename: '%DATE%-error.log', level: 'error' }),
      ];
      fileTransports.forEach((t) =>
        t.on('error', (err) => console.error('[Logger] File transport error:', err.message))
      );
      list.push(...fileTransports);
    }

    return list;
  }

  static normalize(message, meta = {}) {
    if (Logger.isNativeError(message)) {
      const error = Logger.errorPayload(message);
      return [error.message || '', { stack: error.stack, error, ...Logger.snapshot(meta) }];
    }
    if (typeof message === 'object' && message !== null) {
      const messageRead = safeRead(message, 'message');
      const rest = Logger.readKnown(message, COMPATIBLE_OBJECT_KEYS);
      ['http', 'error', 'attributes', 'request_id', 'trace_id', 'span_id', 'memberId', 'module', 'operation', 'duration_ms'].forEach((key) => {
        const read = safeRead(message, key);
        if (read.ok && read.value !== undefined) rest[key] = read.value;
      });
      return [messageRead.ok && messageRead.value !== undefined ? messageRead.value : '', { ...rest, ...Logger.snapshot(meta) }];
    }
    try {
      return [String(message), meta];
    } catch (_) {
      return ['', meta];
    }
  }

  static snapshot(value) {
    return Logger.readKnown(value, SNAPSHOT_CANONICAL_KEYS);
  }

  static readKnown(value, keys) {
    if (!value || typeof value !== 'object') return {};
    const result = {};
    keys.forEach((key) => {
      const read = safeRead(value, key);
      if (read.ok && read.value !== undefined) result[key] = read.value;
    });
    return result;
  }

  static readPath(source, path) {
    let current = source;
    for (const key of path.split('.')) {
      const read = safeRead(current, key);
      if (!read.ok || read.value === undefined || read.value === null) return undefined;
      current = read.value;
    }
    return current;
  }

  static assignPath(target, path, value) {
    const keys = path.split('.');
    let current = target;
    keys.slice(0, -1).forEach((key) => {
      if (!current[key]) current[key] = Object.create(null);
      current = current[key];
    });
    current[keys[keys.length - 1]] = value;
  }

  static prepareMeta(meta, config) {
    const result = Logger.readKnown(meta, TRANSPORT_KEYS);
    if (result.error) {
      const error = Logger.isNativeError(result.error) || Logger.isBoundedErrorPayload(result.error)
        ? Logger.errorPayload(result.error)
        : undefined;
      if (error) result.error = error;
      else delete result.error;
    }
    const paramsId = Logger.readPath(meta, 'params.id');
    if (paramsId !== undefined) result.params = { id: paramsId };
    const profileAddress = Logger.readPath(meta, 'profile.address');
    const profileMobile = Logger.readPath(meta, 'profile.nested.mobile');
    if (profileAddress !== undefined || profileMobile !== undefined) {
      result.profile = {};
      if (profileAddress !== undefined) result.profile.address = profileAddress;
      if (profileMobile !== undefined) result.profile.nested = { mobile: profileMobile };
    }
    const checkoutNickname = Logger.readPath(meta, 'checkout.recipient.nickname');
    if (checkoutNickname !== undefined) result.checkout = { recipient: { nickname: checkoutNickname } };
    const http = {};
    ['method', 'route', 'status_code'].forEach((key) => {
      const value = Logger.readPath(meta, `http.${key}`);
      if (value !== undefined) http[key] = value;
    });
    if (Object.keys(http).length) result.http = http;
    const attributes = Object.create(null);
    (config.attributePaths || []).forEach((path) => {
      const value = Logger.readPath(meta, `attributes.${path}`);
      const leaf = Logger.normalizeAttributeLeaf(value);
      if (leaf !== undefined) Logger.assignPath(attributes, path, leaf);
    });
    if (Object.keys(attributes).length) result.attributes = attributes;
    return result;
  }

  static validateAttributePaths(paths) {
    if (paths === undefined) return [];
    if (!Array.isArray(paths)) throw new TypeError('attributePaths must be an array');
    return paths.slice(0, 50).filter((path) => {
      if (typeof path !== 'string') return false;
      const segments = path.split('.');
      return segments.length <= 4 && segments.every((segment) => SAFE_PATH_SEGMENT.test(segment) && !['__proto__', 'prototype', 'constructor'].includes(segment));
    });
  }

  static normalizeAttributeLeaf(value) {
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
    if (Logger.isDateLike(value)) {
      try { return value.toISOString(); } catch (_) { return undefined; }
    }
    if (Logger.isErrorLike(value)) return Logger.errorPayload(value);
    return undefined;
  }

  static isDateLike(value) {
    try {
      return Object.prototype.toString.call(value) === '[object Date]';
    } catch (_) {
      return false;
    }
  }

  static isErrorLike(value) {
    if (!value || typeof value !== 'object') return false;
    const stack = safeRead(value, 'stack');
    const message = safeRead(value, 'message');
    return stack.ok && typeof stack.value === 'string' && message.ok;
  }

  static isNativeError(value) {
    try {
      if (!value || typeof value !== 'object') return false;
      let prototype = Object.getPrototypeOf(value);
      for (let depth = 0; prototype && depth < 4; depth += 1, prototype = Object.getPrototypeOf(prototype)) {
        if (prototype === Error.prototype) return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  static isBoundedErrorPayload(value) {
    try {
      const required = ['kind', 'message'].every((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
          && typeof descriptor.value === 'string' && Buffer.byteLength(descriptor.value, 'utf8') <= 8192;
      });
      const stack = Object.getOwnPropertyDescriptor(value, 'stack');
      return required && (!stack || (Object.prototype.hasOwnProperty.call(stack, 'value')
        && (stack.value === undefined || (typeof stack.value === 'string' && Buffer.byteLength(stack.value, 'utf8') <= 8192))));
    } catch (_) {
      return false;
    }
  }

  static errorPayload(error, depth = 0, seen = new WeakSet()) {
    if (!error || typeof error !== 'object' || depth > 4 || seen.has(error)) return undefined;
    seen.add(error);
    const message = Logger.boundedOwnString(error, 'message');
    const stack = Logger.boundedOwnString(error, 'stack');
    const kind = Logger.boundedOwnString(error, 'kind') || Logger.boundedOwnString(error, 'name') || 'Error';
    const payload = {
      kind,
      message: message || '',
      stack: stack || undefined,
      fingerprint: crypto.createHash('sha256').update('pending').digest('hex').slice(0, 16),
    };
    Object.defineProperty(payload, BOUNDED_ERROR, { value: true });
    const cause = Logger.ownValue(error, 'cause');
    if (depth < 4 && cause.ok && (Logger.isNativeError(cause.value) || Logger.hasInternalErrorMarker(cause.value))) {
      payload.cause = Logger.errorPayload(cause.value, depth + 1, seen);
    }
    else if (cause.ok && (cause.value === null || ['string', 'number', 'boolean'].includes(typeof cause.value))) payload.cause = cause.value;
    return payload;
  }

  static ownValue(value, key) {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') ? { ok: true, value: descriptor.value } : { ok: false };
    } catch (_) {
      return { ok: false };
    }
  }

  static hasInternalErrorMarker(value) {
    const marker = Logger.ownValue(value, BOUNDED_ERROR);
    return marker.ok && marker.value === true;
  }

  static boundedOwnString(value, key) {
    const read = Logger.ownValue(value, key);
    return read.ok && typeof read.value === 'string' && Buffer.byteLength(read.value, 'utf8') <= 8192 ? read.value : undefined;
  }

  constructor(userConfig = {}) {
    if (userConfig.__winston) {
      this._instance = userConfig.__winston;
      this._config = userConfig.__config;
      this._context = userConfig.__context || {};
      return;
    }
    const config = Logger.resolveConfig(userConfig);
    this._config = config;
    this._context = {};
    this._instance = winston.createLogger({
      level: config.level,
      transports: Logger.buildTransports(config),
    });
  }

  child(context) {
    return new Logger({
      __winston: this._instance,
      __config: this._config,
      __context: { ...this._context, ...Logger.snapshot(context) },
    });
  }

  activeContext() {
    try {
      return typeof this._config.contextProvider === 'function'
        ? Logger.readKnown(this._config.contextProvider(), ['request_id', 'trace_id', 'span_id', 'memberId'])
        : {};
    } catch (_) {
      return {};
    }
  }
}

for (const level of LEVELS) {
  Logger.prototype[level] = function (message, meta) {
    const [m, mm] = Logger.normalize(message, meta);
    const mergedMeta = { ...Logger.prepareMeta(mm, this._config), ...this.activeContext(), ...this._context };
    this._instance[level](m, mergedMeta);
  };
}

function createLogger(userConfig = {}) {
  return new Logger(userConfig);
}

const LoggerFactory = { create: createLogger };
const logger = createLogger();

module.exports = { Logger, LoggerFactory, logger, createLogger };
