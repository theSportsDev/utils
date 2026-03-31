'use strict';

const WinstonLogger = require('./implementations/winston/WinstonLogger');
const { createMorganMiddleware } = require('./middleware/morgan');

// 싱글톤 로거 인스턴스 — 프로세스당 하나, 모든 모듈에서 공유.
const logger = new WinstonLogger();

/**
 * Morgan HTTP 요청 로깅 미들웨어 팩토리.
 * Morgan 출력을 싱글톤 로거에 연결합니다.
 *
 * @param {object} [options] - 옵션은 src/middleware/morgan.js 참고
 * @returns {Function} Express 미들웨어
 */
function morganMiddleware(options) {
  return createMorganMiddleware(logger, options);
}

module.exports = { logger, morganMiddleware };
