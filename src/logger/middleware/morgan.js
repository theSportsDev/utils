'use strict';

const morgan = require('morgan');

/**
 * 로거에 연결된 Morgan HTTP 요청 로깅 미들웨어를 생성합니다.
 * HTTP 접근 로그는 logger.http()를 통해 기록되며,
 * 설정된 모든 트랜스포트(콘솔 + 파일)를 거칩니다.
 *
 * @param {object} loggerInstance - http() 메서드를 가진 로거 인스턴스
 * @param {object} [options]
 * @param {string} [options.format='combined'] - Morgan 포맷 문자열 또는 사전 정의된 이름.
 *   사전 정의: 'combined', 'common', 'dev', 'short', 'tiny'
 *   커스텀:    ':method :url :status :response-time ms'
 * @returns {Function} Express 미들웨어
 */
function createMorganMiddleware(loggerInstance, options = {}) {
  const { format = 'combined', ...morganOptions } = options;

  const stream = {
    write: (message) => loggerInstance.http(message.trimEnd()),
  };

  return morgan(format, { stream, ...morganOptions });
}

module.exports = { createMorganMiddleware };
