'use strict';

const morgan = require('morgan');

/**
 * 로거에 연결된 Morgan HTTP 요청 로깅 미들웨어를 생성합니다.
 *
 * @param {object} loggerInstance - http() 메서드를 가진 로거 인스턴스
 * @param {object} [options]
 * @param {string} [options.format='combined']
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
