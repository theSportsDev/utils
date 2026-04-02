'use strict';

const { format } = require('winston');

/**
 * 파일 트랜스포트 및 프로덕션 콘솔 출력을 위한 JSON 포맷.
 * 모든 로그 라인은 단일 JSON 객체로 출력됩니다 — 파싱하거나 Datadog 등으로 전송하기 쉽습니다.
 */
function createJsonFormat(config) {
  return format.combine(
    format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    format.errors({ stack: true }),
    format((info) => {
      if (!info.env) info.env = config.env;
      return info;
    })(),
    format.json()
  );
}

module.exports = { createJsonFormat };
