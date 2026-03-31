'use strict';

const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

/**
 * 일별 로테이션 파일 트랜스포트를 생성합니다.
 *
 * 디렉토리 구조:
 *   {logDir}/{env}/YYYY-MM-DD-combined.log  — 전체 레벨
 *   {logDir}/{env}/YYYY-MM-DD-error.log     — error 레벨만
 *
 * 콘솔 포맷 설정과 무관하게 파일은 항상 JSON 포맷으로 기록되며,
 * 로그 수집 도구(Datadog, ELK 등)에 적합합니다.
 */
function createFileTransports(config, format) {
  const logDir = path.resolve(config.logDir, config.env);

  const shared = {
    dirname: logDir,
    datePattern: 'YYYY-MM-DD',
    maxFiles: config.maxFiles,
    maxSize: config.maxSize,
    zippedArchive: true,
    format,
  };

  return [
    new DailyRotateFile({
      ...shared,
      filename: '%DATE%-combined.log',
    }),
    new DailyRotateFile({
      ...shared,
      filename: '%DATE%-error.log',
      level: 'error',
    }),
  ];
}

module.exports = { createFileTransports };
