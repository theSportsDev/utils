'use strict';

const fs = require('fs');
const path = require('path');

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

const { jsonFormat, prettyFormat } = require('./formats');

const LEVELS = ['error', 'warn', 'info', 'http', 'verbose', 'debug'];

class Logger {
  static resolveConfig(userConfig) {
    const env = userConfig.env || process.env.NODE_ENV || 'development';
    const isDev = env === 'development';
    return {
      env,
      level: userConfig.level || (isDev ? 'debug' : 'info'),
      format: userConfig.format || (isDev ? 'pretty' : 'json'),
      logDir: userConfig.logDir || null,
      maxFiles: userConfig.maxFiles || '30d',
      maxSize: userConfig.maxSize || '20m',
      enableFile: userConfig.enableFile !== undefined ? userConfig.enableFile : Boolean(userConfig.logDir),
    };
  }

  static buildTransports(config) {
    const json = jsonFormat(config.env);
    const consoleFormat = config.format === 'json' ? json : prettyFormat(config.env);
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
    if (message instanceof Error) {
      return [message.message, { stack: message.stack, ...meta }];
    }
    if (typeof message === 'object' && message !== null) {
      const { message: msg = '', ...rest } = message;
      return [msg, { ...rest, ...meta }];
    }
    return [String(message), meta];
  }

  constructor(userConfig = {}) {
    if (userConfig.__winston) {
      this._instance = userConfig.__winston;
      return;
    }
    const config = Logger.resolveConfig(userConfig);
    this._instance = winston.createLogger({
      level: config.level,
      transports: Logger.buildTransports(config),
    });
  }

  child(context) {
    return new Logger({ __winston: this._instance.child(context) });
  }
}

for (const level of LEVELS) {
  Logger.prototype[level] = function (message, meta) {
    const [m, mm] = Logger.normalize(message, meta);
    this._instance[level](m, mm);
  };
}

function createLogger(userConfig = {}) {
  return new Logger(userConfig);
}

const LoggerFactory = { create: createLogger };
const logger = createLogger();

module.exports = { Logger, LoggerFactory, logger, createLogger };
