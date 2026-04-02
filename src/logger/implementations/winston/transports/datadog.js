'use strict';

/**
 * Datadog 트랜스포트 — 향후 활성화를 위한 플레이스홀더.
 *
 * 활성화 방법:
 *   1. 트랜스포트 패키지를 설치합니다:
 *        npm install datadog-winston
 *
 *   2. 아래 구현 코드의 주석을 해제합니다.
 *
 *   3. logger.init()에 Datadog 설정을 전달합니다:
 *        logger.init({
 *          datadog: {
 *            apiKey: process.env.DD_API_KEY,
 *            service: 'my-service',
 *            // hostname: 'my-host',      // 기본값: os.hostname()
 *            // intakeRegion: 'eu',        // 기본값: 'us1'
 *          }
 *        });
 *
 * 참고: https://www.npmjs.com/package/datadog-winston
 */
function createDatadogTransport(config) {
  // const os = require('os');
  // const DatadogWinston = require('datadog-winston');
  // return new DatadogWinston({
  //   apiKey:        config.datadog.apiKey,
  //   hostname:      config.datadog.hostname || os.hostname(),
  //   service:       config.datadog.service  || 'app',
  //   ddsource:      'nodejs',
  //   ddtags:        `env:${config.env}`,
  //   intakeRegion:  config.datadog.intakeRegion || 'us1',
  // });

  console.error(
    '[Logger] Datadog transport is not yet activated.\n' +
    'See src/implementations/winston/transports/datadog.js for setup instructions.'
  );
  return null;
}

module.exports = { createDatadogTransport };
