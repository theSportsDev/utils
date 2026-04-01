'use strict';

/**
 * 기본 설정값.
 * level과 format은 명시적으로 지정하지 않으면 env에 따라 자동 결정됩니다.
 * logDir은 기본값이 없으며, enableFile: true(기본값)일 때 반드시 주입해야 합니다.
 */
const DEFAULTS = {
  env: process.env.NODE_ENV || 'development',
  level: null,      // 자동: development면 'debug', 그 외에는 'info'
  format: null,     // 자동: development면 'pretty', 그 외에는 'json'
  logDir: null,     // 필수 (enableFile: true일 때) — LoggerFactory.create({ logDir })로 주입
  maxFiles: '30d',  // winston-daily-rotate-file: 최근 30일치 보관
  maxSize: '20m',   // winston-daily-rotate-file: 20 MB에서 로테이션
  enableFile: true, // 콘솔 외에 로테이션 파일에도 기록
  datadog: null,    // { apiKey, service, hostname?, intakeRegion? } — Datadog 트랜스포트 활성화
};

/**
 * 사용자 설정과 기본값을 병합하고 자동값을 결정합니다.
 * enableFile: true인데 logDir이 없으면 파일 저장을 비활성화하고 콘솔에 경고합니다.
 * @param {object} userConfig
 * @returns {object} 결정된 설정
 */
function resolveConfig(userConfig = {}) {
  const config = { ...DEFAULTS, ...userConfig };
  const isDev = config.env === 'development';

  if (config.level === null)  config.level  = isDev ? 'debug' : 'info';
  if (config.format === null) config.format = isDev ? 'pretty' : 'json';

  if (config.enableFile && !config.logDir) {
    console.error(
      '[Logger] logDir is required when enableFile is true (default).\n' +
      "  Pass it via LoggerFactory.create({ logDir: '/path/to/logs' }).\n" +
      '  File logging has been disabled for this instance.'
    );
    config.enableFile = false;
  }

  return config;
}

module.exports = { resolveConfig };
