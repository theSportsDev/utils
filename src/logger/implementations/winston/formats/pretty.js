'use strict';

const { format } = require('winston');

/**
 * 개발 환경 콘솔 출력을 위한 사람이 읽기 쉬운 컬러 포맷.
 *
 * 출력 예시:
 *   2024-01-01 12:00:00 [development] info: Server started
 *   2024-01-01 12:00:00 [development] info: User login {"userId":1,"action":"login"}
 *   2024-01-01 12:00:00 [development] error: Something failed
 *     Error: Something failed
 *       at Object.<anonymous> (app.js:10:11)
 */
function createPrettyFormat(config) {
  return format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.colorize({ all: true }),
    format.errors({ stack: true }),
    format.printf(({ timestamp, level, message, env, stack, ...meta }) => {
      const envTag = `[${env || config.env}]`;
      const msg = message !== null ? String(message) : '';
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';

      if (stack) {
        return `${timestamp} ${envTag} ${level}: ${msg}\n${stack}`;
      }
      return `${timestamp} ${envTag} ${level}: ${msg}${metaStr}`;
    })
  );
}

module.exports = { createPrettyFormat };
