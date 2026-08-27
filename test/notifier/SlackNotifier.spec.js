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

  test('postThread는 부모 메시지를 먼저 발송하고 같은 스레드에 댓글을 순서대로 추가한다', async () => {
    // Given: Slack 발송기가 구성되고 부모 및 댓글 메시지가 준비되었다
    const instance = new SlackNotifier({ slackToken: 'token', slackChannel: 'C-TEST' });
    mockPostMessage
      .mockResolvedValueOnce({ ok: true, ts: '1700000000.000100' })
      .mockResolvedValueOnce({ ok: true, ts: '1700000000.000101' })
      .mockResolvedValueOnce({ ok: true, ts: '1700000000.000102' });

    // When: 부모 메시지와 댓글을 postThread한다
    const result = await instance.postThread({ message: ' parent ', comments: [' first ', ' second '] });

    // Then: 부모 응답과 댓글 응답을 반환하고 댓글은 부모 ts를 thread_ts로 사용한다
    expect(result).toEqual({
      parent: { ok: true, ts: '1700000000.000100' },
      comments: [
        { ok: true, ts: '1700000000.000101' },
        { ok: true, ts: '1700000000.000102' },
      ],
    });
    expect(mockPostMessage.mock.calls).toEqual([
      [{ channel: 'C-TEST', text: 'parent' }],
      [{ channel: 'C-TEST', text: 'first', thread_ts: '1700000000.000100' }],
      [{ channel: 'C-TEST', text: 'second', thread_ts: '1700000000.000100' }],
    ]);
  });

  test('postThread는 부모와 댓글의 앞뒤 공백을 제거하고 특수 멘션을 정제한다', async () => {
    // Given: 멘션이 포함된 공백 문자열이 준비되었다
    const instance = new SlackNotifier({ slackToken: 'token', slackChannel: 'C-TEST' });
    mockPostMessage
      .mockResolvedValueOnce({ ok: true, ts: '1700000000.000100' })
      .mockResolvedValueOnce({ ok: true, ts: '1700000000.000101' });

    // When: 부모 메시지와 댓글을 postThread한다
    await instance.postThread({
      message: ' <!channel> parent ',
      comments: [' <!here> first ', ' <!everyone> second '],
    });

    // Then: 위험한 Slack 마크업은 제거되고 안전한 텍스트만 SDK에 전달된다
    expect(mockPostMessage).toHaveBeenNthCalledWith(1, { channel: 'C-TEST', text: '[mention removed] parent' });
    expect(mockPostMessage).toHaveBeenNthCalledWith(2, {
      channel: 'C-TEST',
      text: '[mention removed] first',
      thread_ts: '1700000000.000100',
    });
    expect(mockPostMessage).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(mockPostMessage.mock.calls)).not.toContain('<!channel>');
    expect(JSON.stringify(mockPostMessage.mock.calls)).not.toContain('<!here>');
    expect(JSON.stringify(mockPostMessage.mock.calls)).not.toContain('<!everyone>');
  });

  test.each([
    ['message', { message: '', comments: ['comment'] }],
    ['message', { message: null, comments: ['comment'] }],
    ['message', { message: undefined, comments: ['comment'] }],
    ['comments', { message: 'parent', comments: [] }],
    ['comments', { message: 'parent', comments: undefined }],
    ['comments', { message: 'parent', comments: 'comment' }],
    ['댓글', { message: 'parent', comments: [''] }],
    ['댓글', { message: 'parent', comments: ['  '] }],
    ['댓글', { message: 'parent', comments: [null] }],
    ['댓글', { message: 'parent', comments: [1] }],
    ['댓글', { message: 'parent', comments: new Array(1) }],
  ])('postThread의 %s가 유효하지 않으면 거부하고 SDK를 호출하지 않는다', async (_field, options) => {
    // Given: 필수 입력 중 하나가 유효하지 않다
    const instance = new SlackNotifier({ slackToken: 'token', slackChannel: 'C-TEST' });

    // When: 유효하지 않은 입력으로 postThread한다
    const request = instance.postThread(options);

    // Then: 입력 오류를 반환하고 SDK는 호출하지 않는다
    await expect(request).rejects.toThrow();
    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  test('postThread는 부모 응답에 ts가 없으면 댓글을 발송하지 않는다', async () => {
    // Given: 부모 메시지 응답에 스레드 식별자가 없다
    const instance = new SlackNotifier({ slackToken: 'token', slackChannel: 'C-TEST' });
    mockPostMessage.mockResolvedValueOnce({ ok: true });

    // When: 댓글이 있는 postThread를 실행한다
    const request = instance.postThread({ message: 'parent', comments: ['comment'] });

    // Then: ts 부족 오류를 반환하고 댓글은 호출하지 않는다
    await expect(request).rejects.toThrow();
    expect(mockPostMessage).toHaveBeenCalledTimes(1);
  });

  test('postThread의 부모 발송 실패를 전파하고 댓글을 발송하지 않는다', async () => {
    // Given: 부모 메시지 발송이 실패한다
    const instance = new SlackNotifier({ slackToken: 'token', slackChannel: 'C-TEST' });
    const sdkError = new Error('Parent unavailable');
    mockPostMessage.mockRejectedValueOnce(sdkError);

    // When: postThread를 실행한다
    const request = instance.postThread({ message: 'parent', comments: ['comment'] });

    // Then: 같은 오류를 호출자에게 전파하고 댓글은 호출하지 않는다
    await expect(request).rejects.toBe(sdkError);
    expect(mockPostMessage).toHaveBeenCalledTimes(1);
  });

  test('postThread의 댓글 발송 실패를 전파하고 이후 댓글을 중단한다', async () => {
    // Given: 두 번째 발송 대상 댓글에서 Slack 오류가 발생한다
    const instance = new SlackNotifier({ slackToken: 'token', slackChannel: 'C-TEST' });
    const sdkError = new Error('Reply unavailable');
    mockPostMessage
      .mockResolvedValueOnce({ ok: true, ts: '1700000000.000100' })
      .mockRejectedValueOnce(sdkError);

    // When: 댓글 두 개를 포함해 postThread를 실행한다
    const request = instance.postThread({ message: 'parent', comments: ['first', 'second'] });

    // Then: 댓글 오류를 전파하고 실패 이후 댓글은 발송하지 않는다
    await expect(request).rejects.toBe(sdkError);
    expect(mockPostMessage).toHaveBeenCalledTimes(2);
    expect(mockPostMessage).toHaveBeenNthCalledWith(2, {
      channel: 'C-TEST',
      text: 'first',
      thread_ts: '1700000000.000100',
    });
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
