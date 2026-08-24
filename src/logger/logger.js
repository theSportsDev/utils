'use strict';

const fs = require('fs');
const path = require('path');

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

const { jsonFormat, prettyFormat } = require('./formats');
const { safeRead } = require('./sanitize');

const LEVELS = ['error', 'warn', 'info', 'http', 'verbose', 'debug'];
const LOG_LEVELS = new Set(LEVELS);
const LOG_FORMATS = new Set(['json', 'pretty']);
const CONTEXT_KEYS = ['request_id', 'trace_id', 'span_id'];
const CONTEXT_ID = /^[A-Za-z0-9._-]{1,128}$/;
const STATE = new WeakMap();

/**
 * LoggerFactory.create에 전달하는 설정입니다.
 *
 * @typedef {Object} LoggerConfig
 * @property {string} [service] 권장. 로그를 발생시킨 서비스 이름입니다.
 * @property {string} [env] 실행 환경입니다. 기본값은 NODE_ENV 또는 development입니다.
 * @property {string} [version] 배포 버전입니다. 기본값은 APP_VERSION 또는 unknown입니다.
 * @property {'error'|'warn'|'info'|'http'|'verbose'|'debug'} [level] 최소 로그 레벨입니다.
 * @property {'json'|'pretty'} [format] 로그 출력 형식입니다.
 * @property {() => object} [contextProvider] 매 로그에 포함할 요청 컨텍스트 제공 함수입니다.
 * @property {string} [logDir] 파일 로그를 저장할 디렉터리입니다.
 * @property {string} [maxFiles='30d'] 파일 로그 보관 기간 또는 개수입니다.
 * @property {string} [maxSize='20m'] 파일 로그 하나의 최대 크기입니다.
 * @property {boolean} [enableFile] 파일 로그 사용 여부입니다. logDir를 설정하면 기본으로 활성화됩니다.
 */

function boundedString(value, name, fallback, maxLength = 128) {
  const resolved = value === undefined || value === null || value === '' ? fallback : value;
  if (typeof resolved !== 'string' || Buffer.byteLength(resolved, 'utf8') > maxLength) {
    throw new TypeError(`${name} must be a string up to ${maxLength} bytes`);
  }
  return resolved;
}

function resolveLoggerConfig(userConfig = {}) {
  if (!userConfig || typeof userConfig !== 'object' || Array.isArray(userConfig)) {
    throw new TypeError('logger config must be an object');
  }
  const env = boundedString(userConfig.env, 'env', process.env.NODE_ENV || 'development');
  const isDevelopment = env === 'development';
  const level = boundedString(userConfig.level, 'level', isDevelopment ? 'debug' : 'info', 16);
  const format = boundedString(userConfig.format, 'format', isDevelopment ? 'pretty' : 'json', 16);
  if (!LOG_LEVELS.has(level)) throw new TypeError('level is not supported');
  if (!LOG_FORMATS.has(format)) throw new TypeError('format must be json or pretty');

  return {
    service: boundedString(userConfig.service, 'service', process.env.SERVICE_NAME || 'unknown-service'),
    env,
    version: boundedString(userConfig.version, 'version', process.env.APP_VERSION || 'unknown'),
    level,
    format,
    contextProvider: typeof userConfig.contextProvider === 'function' ? userConfig.contextProvider : undefined,
    logDir: userConfig.logDir == null ? null : boundedString(userConfig.logDir, 'logDir', null, 1024),
    maxFiles: boundedString(userConfig.maxFiles, 'maxFiles', '30d', 32),
    maxSize: boundedString(userConfig.maxSize, 'maxSize', '20m', 32),
    enableFile: userConfig.enableFile !== undefined ? userConfig.enableFile : Boolean(userConfig.logDir),
  };
}

function readContext(value) {
  if (!value || typeof value !== 'object') return {};
  const context = {};
  CONTEXT_KEYS.forEach((key) => {
    const read = safeRead(value, key);
    if (read.ok && typeof read.value === 'string' && CONTEXT_ID.test(read.value)) context[key] = read.value;
  });
  return context;
}

function buildTransports(config) {
  const json = jsonFormat(config);
  const consoleFormat = config.format === 'json' ? json : prettyFormat(config);
  const transports = [new winston.transports.Console({ format: consoleFormat })];

  if (!config.enableFile) return transports;
  if (!config.logDir) {
    console.error('[Logger] logDir is required when enableFile is true. File logging disabled.');
    return transports;
  }

  const directory = path.resolve(config.logDir, config.env);
  fs.mkdirSync(directory, { recursive: true });
  const shared = {
    dirname: directory,
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
  fileTransports.forEach((transport) => {
    transport.on('error', (error) => console.error('[Logger] File transport error:', error.message));
  });
  return [...transports, ...fileTransports];
}

function activeContext(state) {
  try {
    return typeof state.config.contextProvider === 'function'
      ? readContext(state.config.contextProvider())
      : {};
  } catch (_) {
    return {};
  }
}

class Logger {
  constructor(userConfig = {}) {
    const config = resolveLoggerConfig(userConfig);
    STATE.set(this, {
      config,
      context: {},
      winston: winston.createLogger({ level: config.level, transports: buildTransports(config) }),
    });
  }

  child(context) {
    const state = STATE.get(this);
    const child = Object.create(Logger.prototype);
    STATE.set(child, {
      config: state.config,
      context: { ...state.context, ...readContext(context) },
      winston: state.winston,
    });
    return child;
  }

  activeContext() {
    return activeContext(STATE.get(this));
  }
}

for (const level of LEVELS) {
  Logger.prototype[level] = function (message, value) {
    if (arguments.length > 2) throw new TypeError('logger accepts at most two arguments: message and value');
    if (typeof message !== 'string') throw new TypeError('logger message must be a string');
    if (value !== undefined && value !== null && !['string', 'number', 'boolean'].includes(typeof value)) {
      throw new TypeError('logger value must be a string, number, boolean, null, or undefined');
    }
    const state = STATE.get(this);
    state.winston[level](message, {
      ...(value === undefined ? {} : { value }),
      ...activeContext(state),
      ...state.context,
    });
  };
}

function writeRequestEvent(loggerInstance, message, meta) {
  const state = STATE.get(loggerInstance);
  if (!state) throw new TypeError('invalid logger instance');
  const event = safeRead(meta, 'event');
  const duration = safeRead(meta, 'duration_ms');
  const httpSource = safeRead(meta, 'http');
  const http = {};
  if (httpSource.ok && httpSource.value && typeof httpSource.value === 'object') {
    const method = safeRead(httpSource.value, 'method');
    const route = safeRead(httpSource.value, 'route');
    const statusCode = safeRead(httpSource.value, 'status_code');
    if (method.ok && typeof method.value === 'string') http.method = method.value;
    if (route.ok && typeof route.value === 'string') http.route = route.value;
    if (statusCode.ok && typeof statusCode.value === 'number') http.status_code = statusCode.value;
  }
  state.winston.info(message, {
    ...(event.ok && typeof event.value === 'string' ? { event: event.value } : {}),
    ...(duration.ok && typeof duration.value === 'number' ? { duration_ms: duration.value } : {}),
    ...(Object.keys(http).length ? { http } : {}),
    ...activeContext(state),
    ...state.context,
  });
}

function closeLogger(loggerInstance, callback) {
  const state = STATE.get(loggerInstance);
  if (state) state.winston.end(callback);
  else if (callback) callback();
}

/**
 * 서비스 전용 Logger를 생성합니다.
 *
 * @param {LoggerConfig} userConfig 서비스 이름을 포함한 Logger 설정입니다.
 * @returns {Logger} 생성된 Logger 인스턴스입니다.
 */
function createLogger(userConfig = {}) {
  return new Logger(userConfig);
}

const LoggerFactory = { create: createLogger };
const logger = createLogger();

module.exports = { Logger, LoggerFactory, logger, createLogger, writeRequestEvent, closeLogger };
