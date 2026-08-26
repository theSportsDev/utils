'use strict';

const { execFileSync } = require('child_process');
const mockPostMessage = jest.fn();

jest.mock('@slack/web-api', () => ({
  WebClient: jest.fn().mockImplementation(() => ({
    chat: { postMessage: mockPostMessage },
  })),
}));

const { WebClient } = require('@slack/web-api');
const notifier = require('../../src/notifier/index.cjs');

const {
  SlackNotifier,
  ErrorNotifier,
  formatScriptResultMessage,
  formatDeploymentResultMessage,
} = notifier;

describe('SlackNotifier 메시지 포맷터', () => {
  test('스크립트 성공 문구를 정확히 생성한다', () => {
    // Given: 경기결과 갱신 스크립트가 성공했다
    // When: 스크립트 결과를 포맷한다
    const result = formatScriptResultMessage({
      targetService: '수원 삼성',
      taskName: '경기결과 업데이트',
      success: true,
    });

    // Then: 성공 문구를 반환한다
    expect(result).toBe('수원 삼성 경기결과 업데이트 완료');
  });

  test('스크립트 실패 문구를 정확히 생성한다', () => {
    const result = formatScriptResultMessage({
      targetService: '수원 삼성',
      taskName: '경기결과 업데이트',
      success: false,
    });

    expect(result).toBe(':rotating_light: *수원 삼성 경기결과 업데이트 실패*');
  });

  test('배포 성공 문구를 정확히 생성한다', () => {
    const result = formatDeploymentResultMessage({
      environment: 'release',
      targetService: '수원삼성',
      serviceType: 'api',
      success: true,
    });

    expect(result).toBe('*[release]* 수원삼성 API 서버 배포되었습니다.');
  });

  test('배포 실패 문구를 정확히 생성한다', () => {
    const result = formatDeploymentResultMessage({
      environment: 'release',
      targetService: '수원삼성',
      serviceType: 'API',
      success: false,
    });

    expect(result).toBe(':rotating_light: *[release] 수원삼성 API 서버 배포 실패*');
  });

  test.each([
    ['스크립트 targetService', () => formatScriptResultMessage({ targetService: ' ', taskName: '작업', success: true })],
    ['스크립트 taskName', () => formatScriptResultMessage({ targetService: '서비스', taskName: '', success: true })],
    ['배포 environment', () => formatDeploymentResultMessage({ environment: '\t', targetService: '서비스', serviceType: 'WEB', success: true })],
    ['배포 targetService', () => formatDeploymentResultMessage({ environment: 'dev', targetService: '  ', serviceType: 'WEB', success: true })],
  ])('%s이 빈 문자열이면 거부한다', (_field, format) => {
    expect(format).toThrow();
  });

  test.each(['true', 1, null, undefined])('스크립트 success가 boolean이 아니면 거부한다: %p', (success) => {
    expect(() => formatScriptResultMessage({ targetService: '서비스', taskName: '작업', success })).toThrow();
  });

  test.each(['true', 1, null, undefined])('배포 success가 boolean이 아니면 거부한다: %p', (success) => {
    expect(() => formatDeploymentResultMessage({ environment: 'dev', targetService: '서비스', serviceType: 'WEB', success })).toThrow();
  });

  test('serviceType은 WEB/API만 대소문자 구분 없이 허용한다', () => {
    expect(formatDeploymentResultMessage({ environment: 'dev', targetService: '수원삼성', serviceType: 'web', success: true }))
      .toBe('*[dev]* 수원삼성 WEB 서버 배포되었습니다.');
    expect(() => formatDeploymentResultMessage({ environment: 'dev', targetService: '수원삼성', serviceType: 'worker', success: true }))
      .toThrow();
  });

  test('필수 문자열은 trim한 값을 문구에 반영한다', () => {
    expect(formatScriptResultMessage({ targetService: ' 수원 삼성 ', taskName: ' 경기결과 업데이트 ', success: true }))
      .toBe('수원 삼성 경기결과 업데이트 완료');
  });
});

describe('SlackNotifier', () => {
  const originalToken = process.env.SLACK_BOT_TOKEN;
  const originalChannel = process.env.SLACK_CHANNEL;

  beforeEach(() => {
    mockPostMessage.mockReset();
    WebClient.mockClear();
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_CHANNEL;
    mockPostMessage.mockResolvedValue({ ok: true, ts: '1700000000.000100' });
  });

  afterAll(() => {
    if (originalToken === undefined) delete process.env.SLACK_BOT_TOKEN;
    else process.env.SLACK_BOT_TOKEN = originalToken;
    if (originalChannel === undefined) delete process.env.SLACK_CHANNEL;
    else process.env.SLACK_CHANNEL = originalChannel;
  });

  test('명시 옵션이 환경변수보다 우선한다', () => {
    process.env.SLACK_BOT_TOKEN = 'env-token';
    process.env.SLACK_CHANNEL = 'env-channel';

    const instance = new SlackNotifier({ slackToken: 'option-token', slackChannel: 'option-channel' });

    expect(WebClient).toHaveBeenCalledWith('option-token');
    expect(instance.channel).toBe('option-channel');
  });

  test('환경변수로 token과 channel을 구성한다', () => {
    process.env.SLACK_BOT_TOKEN = 'env-token';
    process.env.SLACK_CHANNEL = 'env-channel';

    const instance = new SlackNotifier();

    expect(WebClient).toHaveBeenCalledWith('env-token');
    expect(instance.channel).toBe('env-channel');
  });

  test('slackToken과 slackChannel 및 message를 trim한다', async () => {
    const instance = new SlackNotifier({ slackToken: ' option-token ', slackChannel: ' C-TEST ' });

    expect(WebClient).toHaveBeenCalledWith('option-token');
    expect(instance.channel).toBe('C-TEST');

    await instance.push({ message: ' hello ' });

    expect(mockPostMessage).toHaveBeenCalledWith({ channel: 'C-TEST', text: 'hello' });
  });

  test.each([
    ['token', { slackToken: '   ', slackChannel: 'C-TEST' }],
    ['channel', { slackToken: 'token', slackChannel: '\t' }],
  ])('whitespace-only %s은 push에서 거부하고 SDK를 호출하지 않는다', async (_field, options) => {
    const instance = new SlackNotifier(options);

    await expect(instance.push({ message: 'hello' })).rejects.toThrow();
    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  test('구성값이 없으면 push가 거부된다', async () => {
    await expect(new SlackNotifier().push({ message: 'hello' })).rejects.toThrow();
    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  test.each(['', '   ', null, undefined])('message가 빈 값이면 거부된다: %p', async (message) => {
    const instance = new SlackNotifier({ slackToken: 'token', slackChannel: 'C-TEST' });

    await expect(instance.push({ message })).rejects.toThrow();
    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  test('push는 channel과 text payload를 SDK에 전달하고 응답을 반환한다', async () => {
    const instance = new SlackNotifier({ slackToken: 'token', slackChannel: 'C-TEST' });

    await expect(instance.push({ message: 'hello' })).resolves.toEqual({ ok: true, ts: '1700000000.000100' });
    expect(mockPostMessage).toHaveBeenCalledWith({ channel: 'C-TEST', text: 'hello' });
  });

  test('편의 메서드는 포맷한 메시지를 push한다', async () => {
    const instance = new SlackNotifier({ slackToken: 'token', slackChannel: 'C-TEST' });

    await instance.notifyScriptResult({ targetService: '수원 삼성', taskName: '경기결과 업데이트', success: true });
    expect(mockPostMessage).toHaveBeenLastCalledWith({ channel: 'C-TEST', text: '수원 삼성 경기결과 업데이트 완료' });

    await instance.notifyDeploymentResult({ environment: 'release', targetService: '수원삼성', serviceType: 'API', success: false });
    expect(mockPostMessage).toHaveBeenLastCalledWith({ channel: 'C-TEST', text: ':rotating_light: *[release] 수원삼성 API 서버 배포 실패*' });
  });

  test('SDK 발송 거절을 호출자에게 전파한다', async () => {
    const sdkError = new Error('Slack unavailable');
    mockPostMessage.mockRejectedValueOnce(sdkError);
    const instance = new SlackNotifier({ slackToken: 'token', slackChannel: 'C-TEST' });

    await expect(instance.push({ message: 'hello' })).rejects.toBe(sdkError);
  });

  test('SlackNotifier 직렬화 결과에 explicit/env token이 노출되지 않는다', () => {
    process.env.SLACK_BOT_TOKEN = 'ENV_TOKEN_SENTINEL';
    const explicit = new SlackNotifier({ slackToken: 'EXPLICIT_TOKEN_SENTINEL', slackChannel: 'C-TEST' });
    const fromEnv = new SlackNotifier({ slackChannel: 'C-TEST' });

    const serialized = JSON.stringify({ explicit, fromEnv });

    expect(serialized).not.toContain('EXPLICIT_TOKEN_SENTINEL');
    expect(serialized).not.toContain('ENV_TOKEN_SENTINEL');
  });

  test('raw message와 formatter 입력의 특수 멘션이 Slack payload에 남지 않는다', async () => {
    const instance = new SlackNotifier({ slackToken: 'token', slackChannel: 'C-TEST' });

    await instance.push({ message: '<!channel> <!here> <!everyone> <@UATTACKER> <@WATTACKER> <!subteam^SATTACKER>' });
    await instance.notifyScriptResult({
      targetService: '<!channel>',
      taskName: '<@UATTACKER> <@WATTACKER> <!here> <!everyone>',
      success: true,
    });
    await instance.notifyDeploymentResult({
      environment: '<!subteam^SATTACKER>',
      targetService: '<@UATTACKER> <@WATTACKER>',
      serviceType: 'WEB',
      success: false,
    });

    const sent = JSON.stringify(mockPostMessage.mock.calls);
    expect(sent).not.toContain('<!channel>');
    expect(sent).not.toContain('<!here>');
    expect(sent).not.toContain('<!everyone>');
    expect(sent).not.toContain('<@UATTACKER>');
    expect(sent).not.toContain('<@WATTACKER>');
    expect(sent).not.toContain('<!subteam^SATTACKER>');
  });

  test('안전한 Slack date markup은 raw message에서 그대로 유지한다', async () => {
    const instance = new SlackNotifier({ slackToken: 'token', slackChannel: 'C-TEST' });
    const dateMarkup = '<!date^1392734382^{date_short}|Posted>';

    await instance.push({ message: dateMarkup });

    expect(mockPostMessage).toHaveBeenCalledWith({ channel: 'C-TEST', text: dateMarkup });
  });
});

describe('SlackNotifier 공개 export', () => {
  test('실제 package exports의 root와 notifier CJS에서 공개 API를 export한다', () => {
    const output = execFileSync(process.execPath, [
      '-e',
      "const root = require('@theSportsDev/utils'); const notifier = require('@theSportsDev/utils/notifier'); console.log([root.SlackNotifier, root.ErrorNotifier, root.formatScriptResultMessage, root.formatDeploymentResultMessage, notifier.SlackNotifier, notifier.ErrorNotifier, notifier.formatScriptResultMessage, notifier.formatDeploymentResultMessage].every(Boolean))",
    ], { cwd: require('process').cwd(), encoding: 'utf8' });

    expect(output.trim()).toBe('true');
  });

  test('notifier ESM에서 공개 API를 export한다', async () => {
    const output = execFileSync(process.execPath, [
      '--input-type=module',
      '-e',
      "import * as notifier from '@theSportsDev/utils/notifier'; import * as root from '@theSportsDev/utils'; console.log([notifier.SlackNotifier, notifier.ErrorNotifier, notifier.formatScriptResultMessage, notifier.formatDeploymentResultMessage, root.SlackNotifier, root.ErrorNotifier, root.formatScriptResultMessage, root.formatDeploymentResultMessage].every(Boolean))",
    ], { cwd: require('process').cwd(), encoding: 'utf8' });

    expect(output.trim()).toBe('true');
  });
});
