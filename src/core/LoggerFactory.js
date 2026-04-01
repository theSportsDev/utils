'use strict';

const WinstonLogger = require('../implementations/winston/WinstonLogger');

/**
 * 로거 인스턴스 생성 팩토리.
 *
 * 사용 예시:
 *   // config/logger.js
 *   const { LoggerFactory } = require('@theSportsDev/utils');
 *   module.exports = LoggerFactory.create({ logDir: process.env.LOG_PATH });
 *
 *   // 다른 모듈
 *   const logger = require('./config/logger');
 *   logger.info('서버 시작', { port: 3000 });
 */
class LoggerFactory {
  /**
   * 새로운 로거 인스턴스를 생성합니다.
   * 각 호출은 독립적인 인스턴스를 반환합니다.
   *
   * @param {object} config
   * @param {string} config.logDir   - 로그 파일 저장 경로 (enableFile: true일 때 필수)
   * @param {string} [config.env]    - 환경 (기본값: NODE_ENV || 'development')
   * @param {string} [config.level]  - 로그 레벨 (기본값: env에 따라 자동 결정)
   * @param {string} [config.format] - 출력 포맷: 'json' | 'pretty' (기본값: env에 따라 자동 결정)
   * @param {boolean} [config.enableFile=true]  - 파일 저장 여부
   * @param {string}  [config.maxFiles='30d']   - 파일 보관 기간
   * @param {string}  [config.maxSize='20m']    - 파일 최대 크기
   * @param {object}  [config.datadog]          - Datadog 트랜스포트 설정
   * @returns {WinstonLogger}
   */
  static create(config = {}) {
    return new WinstonLogger(config);
  }
}

module.exports = LoggerFactory;
