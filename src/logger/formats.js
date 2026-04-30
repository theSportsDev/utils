'use strict';

const { format } = require('winston');

function jsonFormat(env) {
  return format.combine(
    format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    format.errors({ stack: true }),
    format((info) => {
      if (!info.env) info.env = env;
      return info;
    })(),
    format.json()
  );
}

function prettyFormat(env) {
  return format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.colorize({ all: true }),
    format.errors({ stack: true }),
    format.printf(({ timestamp, level, message, env: logEnv, stack, ...meta }) => {
      const envTag = `[${logEnv || env}]`;
      const msg = message !== null ? String(message) : '';
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      if (stack) return `${timestamp} ${envTag} ${level}: ${msg}\n${stack}`;
      return `${timestamp} ${envTag} ${level}: ${msg}${metaStr}`;
    })
  );
}

module.exports = { jsonFormat, prettyFormat };
