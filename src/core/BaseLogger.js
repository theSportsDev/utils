'use strict';

/**
 * 로거 구현체를 위한 추상 기본 클래스.
 *
 * 모든 구체적인 로거(WinstonLogger, 향후 PinoLogger 등)는 이 클래스를 상속해야 합니다.
 * 공개 API 인터페이스는 여기서 고정됩니다 — 내부 라이브러리를 교체해도
 * 사용 코드는 변경할 필요 없이 새 구현체만 추가하면 됩니다.
 */
class BaseLogger {
  /**
   * 추가 바인딩 컨텍스트 필드를 가진 자식 로거를 생성합니다.
   * 자식 로거는 동일한 트랜스포트를 공유하며 — 메타데이터만 추가합니다.
   * @param {object} context - 이 자식 로거의 모든 로그 라인에 첨부할 필드
   * @returns {object} 동일한 API 인터페이스를 가진 자식 로거
   */
  child(context) { console.error(new Error('child() must be implemented')); }

  error(message, meta)   { console.error(new Error('error() must be implemented')); }
  warn(message, meta)    { console.error(new Error('warn() must be implemented')); }
  info(message, meta)    { console.error(new Error('info() must be implemented')); }
  http(message, meta)    { console.error(new Error('http() must be implemented')); }
  debug(message, meta)   { console.error(new Error('debug() must be implemented')); }
  verbose(message, meta) { console.error(new Error('verbose() must be implemented')); }
}

module.exports = BaseLogger;
