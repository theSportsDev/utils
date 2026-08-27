'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ENV_MODULE_PATH = path.resolve(__dirname, '../../src/env.js');

function readEnvInChild({ cwd, environment = {} }) {
  const script = [
    `const env = require(${JSON.stringify(ENV_MODULE_PATH)});`,
    'process.stdout.write(JSON.stringify({ nodeEnv: env.nodeEnv, devNotifierSlackToken: env.devNotifierSlackToken, devNotifierSlackChannel: env.devNotifierSlackChannel, devTokenMatchesEnv: env.devNotifierSlackToken === process.env.DEV_NOTIFIER_SLACK_TOKEN, devChannelMatchesEnv: env.devNotifierSlackChannel === process.env.DEV_NOTIFIER_SLACK_CHANNEL, slackBotToken: env.slackBotToken, slackChannel: env.slackChannel }));',
  ].join('\n');

  const childEnvironment = { ...process.env };
  ['NODE_ENV', 'SLACK_BOT_TOKEN', 'SLACK_CHANNEL', 'DEV_NOTIFIER_SLACK_TOKEN', 'DEV_NOTIFIER_SLACK_CHANNEL'].forEach((key) => delete childEnvironment[key]);

  return JSON.parse(execFileSync(process.execPath, ['-e', script], {
    cwd,
    env: { ...childEnvironment, ...environment },
    encoding: 'utf8',
  }));
}

describe('환경변수 객체', () => {
  test('CommonJS require가 환경 객체를 직접 반환한다', () => {
    // Given: 환경변수가 비어 있는 격리된 실행 디렉터리가 준비되었다
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'utils-env-'));
    const script = [
      `const env = require(${JSON.stringify(ENV_MODULE_PATH)});`,
      'process.stdout.write(JSON.stringify({ isObject: typeof env === \'object\' && env !== null, keys: Object.keys(env), hasToken: Object.prototype.hasOwnProperty.call(env, \'devNotifierSlackToken\'), hasLegacyToken: Object.prototype.hasOwnProperty.call(env, \'slackBotToken\'), hasLegacyChannel: Object.prototype.hasOwnProperty.call(env, \'slackChannel\'), hasNestedEnv: Object.prototype.hasOwnProperty.call(env, \'env\') }));',
    ].join('\n');

    try {
      // When: CommonJS require로 env 모듈을 로드한다
      const result = JSON.parse(execFileSync(process.execPath, ['-e', script], {
        cwd,
        env: Object.fromEntries(
          Object.entries(process.env)
            .filter(([key]) => !['NODE_ENV', 'SLACK_BOT_TOKEN', 'SLACK_CHANNEL', 'DEV_NOTIFIER_SLACK_TOKEN', 'DEV_NOTIFIER_SLACK_CHANNEL'].includes(key)),
        ),
        encoding: 'utf8',
      }));

      // Then: 모듈 자체가 환경 객체를 반환하고 토큰은 비열거 상태다
      expect(result).toEqual({
        isObject: true,
        keys: ['nodeEnv', 'devNotifierSlackChannel'],
        hasToken: true,
        hasLegacyToken: false,
        hasLegacyChannel: false,
        hasNestedEnv: false,
      });
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('셸 환경변수가 .env 값보다 우선한다', () => {
    // Given: 격리된 실행 디렉터리의 .env와 같은 키의 셸 환경변수가 준비되었다
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'utils-env-'));
    fs.writeFileSync(path.join(cwd, '.env'), [
      'NODE_ENV=dotenv',
      'DEV_NOTIFIER_SLACK_TOKEN=dotenv-dev-token',
      'DEV_NOTIFIER_SLACK_CHANNEL=dotenv-dev-channel',
    ].join('\n'));

    try {
      // When: env 모듈을 자식 프로세스에서 로드한다
      const result = readEnvInChild({
        cwd,
        environment: {
          NODE_ENV: 'shell',
          DEV_NOTIFIER_SLACK_TOKEN: 'shell-dev-token',
          DEV_NOTIFIER_SLACK_CHANNEL: 'shell-dev-channel',
        },
      });

      // Then: 셸 환경변수가 그대로 반환된다
      expect(result.nodeEnv).toBe('shell');
      expect(result.devTokenMatchesEnv).toBe(true);
      expect(result.devChannelMatchesEnv).toBe(true);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('.env 값을 로드하고 파일이 없어도 기본값을 적용한다', () => {
    // Given: 셸 환경변수 없이 .env만 있는 실행 디렉터리가 준비되었다
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'utils-env-'));
    fs.writeFileSync(path.join(cwd, '.env'), [
      'NODE_ENV=staging',
      'DEV_NOTIFIER_SLACK_TOKEN=dotenv-dev-token',
      'DEV_NOTIFIER_SLACK_CHANNEL=dotenv-dev-channel',
    ].join('\n'));

    try {
      // When: .env가 있는 디렉터리에서 env 모듈을 로드한다
      const fromDotEnv = readEnvInChild({
        cwd,
      });

      // Then: .env 값이 반환된다
      expect(fromDotEnv.nodeEnv).toBe('staging');
      expect(fromDotEnv.devTokenMatchesEnv).toBe(true);
      expect(fromDotEnv.devChannelMatchesEnv).toBe(true);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }

    const emptyCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'utils-env-'));
    try {
      // When: .env가 없는 디렉터리에서 env 모듈을 로드한다
      const withoutDotEnv = readEnvInChild({ cwd: emptyCwd });

      // Then: NODE_ENV는 development이고 Slack 값은 undefined이다
      expect(withoutDotEnv.nodeEnv).toBe('development');
      expect(withoutDotEnv.devNotifierSlackToken).toBeUndefined();
      expect(withoutDotEnv.devNotifierSlackChannel).toBeUndefined();
    } finally {
      fs.rmSync(emptyCwd, { recursive: true, force: true });
    }
  });

  test('NODE_ENV가 빈 문자열이면 development를 반환한다', () => {
    // Given: NODE_ENV가 빈 문자열인 실행 환경이 준비되었다
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'utils-env-'));

    try {
      // When: env 모듈을 로드한다
      const result = readEnvInChild({ cwd, environment: { NODE_ENV: '' } });

      // Then: 기본 환경 이름을 반환한다
      expect(result.nodeEnv).toBe('development');
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('getter가 process.env의 런타임 변경을 새 프로퍼티에 반영한다', () => {
    // Given: env 모듈을 로드하고 환경변수를 초기화했다
    jest.resetModules();
    const original = Object.fromEntries(
      ['NODE_ENV', 'DEV_NOTIFIER_SLACK_TOKEN', 'DEV_NOTIFIER_SLACK_CHANNEL']
        .map((key) => [key, process.env[key]]),
    );
    delete process.env.NODE_ENV;
    ['DEV_NOTIFIER_SLACK_TOKEN', 'DEV_NOTIFIER_SLACK_CHANNEL']
      .forEach((key) => delete process.env[key]);
    const env = require('../../src/env.js');

    try {
      // When: 모듈 로드 이후 process.env를 변경한다
      process.env.NODE_ENV = 'production';

      // Then: getter가 최신 값을 반환한다
      expect(env.nodeEnv).toBe('production');
      process.env.DEV_NOTIFIER_SLACK_TOKEN = 'runtime-dev-token';
      process.env.DEV_NOTIFIER_SLACK_CHANNEL = 'runtime-dev-channel';
      expect(env.devNotifierSlackToken === 'runtime-dev-token').toBe(true);
      expect(env.devNotifierSlackChannel === 'runtime-dev-channel').toBe(true);
      expect(env.slackBotToken).toBeUndefined();
      expect(env.slackChannel).toBeUndefined();
    } finally {
      Object.entries(original).forEach(([key, value]) => {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      });
    }
  });

  test('알림 토큰은 열거·직렬화되지 않고 getter를 덮어쓸 수 없다', () => {
    // Given: 환경변수 객체와 Slack 토큰이 준비되었다
    jest.resetModules();
    const original = Object.fromEntries(
      ['DEV_NOTIFIER_SLACK_TOKEN', 'DEV_NOTIFIER_SLACK_CHANNEL']
        .map((key) => [key, process.env[key]]),
    );
    process.env.DEV_NOTIFIER_SLACK_TOKEN = 'dev-token-sentinel';
    process.env.DEV_NOTIFIER_SLACK_CHANNEL = 'C-DEV';
    const env = require('../../src/env.js');

    try {
      // When: 객체를 열거·직렬화하고 getter에 값을 대입한다
      const keys = Object.keys(env);
      const serialized = JSON.stringify(env);
      const spread = { ...env };
      const descriptors = Object.fromEntries(
        ['nodeEnv', 'devNotifierSlackToken', 'devNotifierSlackChannel', 'slackBotToken', 'slackChannel']
          .map((key) => [key, Object.getOwnPropertyDescriptor(env, key)]),
      );
      try {
        env.devNotifierSlackToken = 'overwritten-sentinel';
      } catch (error) {
        // 읽기 전용 프로퍼티의 엄격 모드 대입 오류는 허용한다
      }

      // Then: 토큰이 외부 표현에 노출되지 않고 최신 환경값을 반환한다
      expect(keys).not.toContain('devNotifierSlackToken');
      expect(keys).not.toContain('slackBotToken');
      expect(serialized).not.toContain(env.devNotifierSlackToken);
      expect(spread).not.toHaveProperty('devNotifierSlackToken');
      expect(spread).not.toHaveProperty('slackBotToken');
      expect(descriptors.nodeEnv).toEqual(expect.objectContaining({ enumerable: true, configurable: false, set: undefined }));
      expect(descriptors.devNotifierSlackToken).toEqual(expect.objectContaining({ enumerable: false, configurable: false, set: undefined }));
      expect(descriptors.devNotifierSlackChannel).toEqual(expect.objectContaining({ enumerable: true, configurable: false, set: undefined }));
      expect(descriptors.slackBotToken).toBeUndefined();
      expect(descriptors.slackChannel).toBeUndefined();
      expect(typeof descriptors.nodeEnv.get).toBe('function');
      expect(typeof descriptors.devNotifierSlackToken.get).toBe('function');
      expect(typeof descriptors.devNotifierSlackChannel.get).toBe('function');
      expect(env.devNotifierSlackToken === 'dev-token-sentinel').toBe(true);
    } finally {
      Object.entries(original).forEach(([key, value]) => {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      });
    }
  });
});
