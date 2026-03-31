'use strict';

const winston = require('winston');
const BaseLogger = require('../../core/BaseLogger');
const { resolveConfig } = require('../../core/config');
const { createJsonFormat } = require('./formats/json');
const { createPrettyFormat } = require('./formats/pretty');
const { createConsoleTransport } = require('./transports/console');
const { createFileTransports } = require('./transports/file');
const { createDatadogTransport } = require('./transports/datadog');

class WinstonLogger extends BaseLogger {
  constructor() {
    super();
    this._config   = null;
    this._instance = null;
  }

  init(userConfig = {}) {
    if (this._instance) {
      process.emitWarning(
        '[Logger] init() was already called. Subsequent calls are ignored.',
        'LoggerWarning'
      );
      return this;
    }

    this._config = resolveConfig(userConfig);
    const { format: formatType, level, enableFile, datadog: datadogConfig } = this._config;

    const jsonFormat   = createJsonFormat(this._config);
    const prettyFormat = createPrettyFormat(this._config);
    const consoleFormat = formatType === 'json' ? jsonFormat : prettyFormat;

    const transportsList = [createConsoleTransport(consoleFormat)];

    if (enableFile) {
      // 파일은 콘솔 포맷과 무관하게 항상 JSON 사용 — 로그 수집에 적합
      transportsList.push(...createFileTransports(this._config, jsonFormat));
    }

    if (datadogConfig) {
      transportsList.push(createDatadogTransport(this._config));
    }

    this._instance = winston.createLogger({
      level,
      transports: transportsList,
    });

    return this;
  }

  _getInstance() {
    if (!this._instance) {
      this.init(); // auto-initialize with defaults on first use
    }
    return this._instance;
  }

  /**
   * 첫 번째 인자를 [message, meta] 튜플로 정규화합니다.
   *
   * 지원하는 입력 형식:
   *   logger.info('단순 문자열')
   *   logger.info('메타 포함 문자열', { key: 'val' })
   *   logger.info({ message: '문자열', key: 'val' })   // message 필드가 있는 객체
   *   logger.info({ event: 'user.login', userId: 1 })  // 순수 구조화 객체
   *   logger.error(new Error('오류 발생'))
   */
  _normalize(message, meta = {}) {
    if (message instanceof Error) {
      return [message.message, { stack: message.stack, ...meta }];
    }
    if (typeof message === 'object' && message !== null) {
      const { message: msg = '', ...rest } = message;
      return [msg, { ...rest, ...meta }];
    }
    return [String(message), meta];
  }

  info(message, meta)    { const [m, mm] = this._normalize(message, meta); this._getInstance().info(m, mm); }
  warn(message, meta)    { const [m, mm] = this._normalize(message, meta); this._getInstance().warn(m, mm); }
  error(message, meta)   { const [m, mm] = this._normalize(message, meta); this._getInstance().error(m, mm); }
  debug(message, meta)   { const [m, mm] = this._normalize(message, meta); this._getInstance().debug(m, mm); }
  verbose(message, meta) { const [m, mm] = this._normalize(message, meta); this._getInstance().verbose(m, mm); }
  http(message, meta)    { const [m, mm] = this._normalize(message, meta); this._getInstance().http(m, mm); }

  /**
   * 추가 바인딩 컨텍스트를 가진 자식 로거를 생성합니다.
   * 자식 로거는 동일한 Winston 인스턴스와 트랜스포트를 사용합니다.
   * 자식 로거에서 child()를 호출하면 컨텍스트가 병합됩니다.
   *
   * @example
   * const log = logger.child({ module: 'auth' });
   * log.info('로그인 성공', { userId: 1 });
   * // → { message: '로그인 성공', module: 'auth', userId: 1, ... }
   */
  child(context) {
    const winstonChild = this._getInstance().child(context);
    return this._wrapChild(winstonChild);
  }

  _wrapChild(winstonChild) {
    const normalize = this._normalize.bind(this);
    const wrapChild = this._wrapChild.bind(this);

    return {
      info:    (msg, meta) => { const [m, mm] = normalize(msg, meta); winstonChild.info(m, mm); },
      warn:    (msg, meta) => { const [m, mm] = normalize(msg, meta); winstonChild.warn(m, mm); },
      error:   (msg, meta) => { const [m, mm] = normalize(msg, meta); winstonChild.error(m, mm); },
      debug:   (msg, meta) => { const [m, mm] = normalize(msg, meta); winstonChild.debug(m, mm); },
      verbose: (msg, meta) => { const [m, mm] = normalize(msg, meta); winstonChild.verbose(m, mm); },
      http:    (msg, meta) => { const [m, mm] = normalize(msg, meta); winstonChild.http(m, mm); },
      child:   (ctx) => wrapChild(winstonChild.child(ctx)),
    };
  }
}

module.exports = WinstonLogger;
