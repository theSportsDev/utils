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
const { DevNotifier, ErrorNotifier } = notifier;

describe('DevNotifier', () => {
  const originalToken = process.env.SLACK_BOT_TOKEN;
  const originalChannel = process.env.SLACK_CHANNEL;
  const now = new Date('2026-08-25T12:29:59.000Z');

  beforeEach(() => {
    mockPostMessage.mockReset();
    WebClient.mockClear();
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_CHANNEL;
    mockPostMessage.mockResolvedValue({ ok: true, ts: '1700000000.000100' });
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  afterAll(() => {
    if (originalToken === undefined) delete process.env.SLACK_BOT_TOKEN;
    else process.env.SLACK_BOT_TOKEN = originalToken;
    if (originalChannel === undefined) delete process.env.SLACK_CHANNEL;
    else process.env.SLACK_CHANNEL = originalChannel;
  });

  describe('post', () => {
    test('성공 결과를 서울 시간 포맷으로 발송한다', async () => {
      // Given: 성공 결과를 발송할 notifier가 준비되었다
      const instance = new DevNotifier({ slackToken: 'token', slackChannel: 'C-TEST' });

      // When: 성공 결과를 post한다
      await instance.post({ message: '전북현대 경기 결과 안내 Push', result: 'success' });

      // Then: 처리 날짜와 성공 결과가 포함된 메시지를 발송한다
      expect(mockPostMessage).toHaveBeenCalledWith({
        channel: 'C-TEST',
        text: '전북현대 경기 결과 안내 Push\n처리 날짜: 2026-08-25 21:29:59\n처리 결과: 성공 :짠:',
      });
    });

    test('실패 결과를 경고 이모지와 함께 발송한다', async () => {
      // Given: 실패 결과를 발송할 notifier가 준비되었다
      const instance = new DevNotifier({ slackToken: 'token', slackChannel: 'C-TEST' });

      // When: 실패 결과를 post한다
      await instance.post({ message: '전북현대 경기 결과 안내 Push', result: 'fail' });

      // Then: 실패 결과가 포함된 메시지를 발송한다
      expect(mockPostMessage.mock.calls[0][0].text).toBe(
        '전북현대 경기 결과 안내 Push\n처리 날짜: 2026-08-25 21:29:59\n처리 결과: 실패 :rotating_light:',
      );
    });

    test.each([undefined, 'success ', ' SUCCESS', 'fail '])('result가 %p이면 처리 결과 행을 생략한다', async (result) => {
      // Given: 결과 값이 없거나 정확한 허용값이 아니다
      const instance = new DevNotifier({ slackToken: 'token', slackChannel: 'C-TEST' });

      // When: 결과를 포함해 post한다
      await instance.post({ message: '서버 주요 로그', result });

      // Then: 처리 날짜까지만 발송한다
      expect(mockPostMessage.mock.calls[0][0].text).toBe('서버 주요 로그\n처리 날짜: 2026-08-25 21:29:59');
    });

    test.each(['', '   ', null, undefined, 123])('message가 %p이면 console.error 후 Slack을 호출하지 않는다', async (message) => {
      // Given: 메시지가 유효하지 않다
      const instance = new DevNotifier({ slackToken: 'token', slackChannel: 'C-TEST' });
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // When: 유효하지 않은 메시지를 post한다
      const result = await instance.post({ message });

      // Then: 오류를 기록하고 발송하지 않는다
      expect(result).toBeUndefined();
      expect(errorSpy).toHaveBeenCalled();
      expect(mockPostMessage).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    test('SDK 발송 오류를 동일한 오류 객체로 전파한다', async () => {
      // Given: Slack SDK가 오류를 반환한다
      const instance = new DevNotifier({ slackToken: 'token', slackChannel: 'C-TEST' });
      const sdkError = new Error('Slack unavailable');
      mockPostMessage.mockRejectedValueOnce(sdkError);

      // When: 메시지를 post한다
      const request = instance.post({ message: '서버 로그' });

      // Then: 동일한 오류 객체를 호출자에게 전파한다
      await expect(request).rejects.toBe(sdkError);
    });
  });

  describe('postThread', () => {
    test('부모 메시지와 최대 세 댓글을 순서대로 같은 thread에 발송한다', async () => {
      // Given: 부모와 세 댓글이 준비되었다
      const instance = new DevNotifier({ slackToken: 'token', slackChannel: 'C-TEST' });
      mockPostMessage
        .mockResolvedValueOnce({ ok: true, ts: '1700000000.000100' })
        .mockResolvedValueOnce({ ok: true, ts: '1700000000.000101' })
        .mockResolvedValueOnce({ ok: true, ts: '1700000000.000102' })
        .mockResolvedValueOnce({ ok: true, ts: '1700000000.000103' });

      // When: thread를 발송한다
      const result = await instance.postThread({
        message: '스크립트 실행 결과', result: 'success',
        ts_msg1: '첫 번째 코멘트', ts_msg2: '두 번째 코멘트', ts_msg3: '세 번째 코멘트',
      });

      // Then: 응답을 parent/comments로 반환하고 순서대로 발송한다
      expect(result).toEqual({
        parent: { ok: true, ts: '1700000000.000100' },
        comments: [
          { ok: true, ts: '1700000000.000101' },
          { ok: true, ts: '1700000000.000102' },
          { ok: true, ts: '1700000000.000103' },
        ],
      });
      expect(mockPostMessage.mock.calls).toEqual([
        [{ channel: 'C-TEST', text: '스크립트 실행 결과\n처리 날짜: 2026-08-25 21:29:59\n처리 결과: 성공 :짠:' }],
        [{ channel: 'C-TEST', text: '첫 번째 코멘트', thread_ts: '1700000000.000100' }],
        [{ channel: 'C-TEST', text: '두 번째 코멘트', thread_ts: '1700000000.000100' }],
        [{ channel: 'C-TEST', text: '세 번째 코멘트', thread_ts: '1700000000.000100' }],
      ]);
    });

    test('ts_msg2와 ts_msg3가 없으면 첫 댓글만 발송한다', async () => {
      // Given: 첫 댓글만 준비되었다
      const instance = new DevNotifier({ slackToken: 'token', slackChannel: 'C-TEST' });
      mockPostMessage.mockResolvedValueOnce({ ok: true, ts: '1700000000.000100' });

      // When: 첫 댓글만 포함해 thread를 발송한다
      await instance.postThread({ message: '부모', ts_msg1: '첫 댓글' });

      // Then: 부모와 첫 댓글만 발송한다
      expect(mockPostMessage).toHaveBeenCalledTimes(2);
      expect(mockPostMessage).toHaveBeenLastCalledWith({
        channel: 'C-TEST', text: '첫 댓글', thread_ts: '1700000000.000100',
      });
    });

    test('실패 결과 thread 부모 메시지에 실패 포맷을 적용한다', async () => {
      // Given: 실패 결과와 첫 댓글이 준비되었다
      const instance = new DevNotifier({ slackToken: 'token', slackChannel: 'C-TEST' });
      mockPostMessage.mockResolvedValueOnce({ ok: true, ts: '1700000000.000100' });

      // When: 실패 결과 thread를 발송한다
      await instance.postThread({ message: '배치 처리', result: 'fail', ts_msg1: '오류 로그' });

      // Then: 부모 메시지에 실패 이모지가 포함된다
      expect(mockPostMessage).toHaveBeenNthCalledWith(1, {
        channel: 'C-TEST',
        text: '배치 처리\n처리 날짜: 2026-08-25 21:29:59\n처리 결과: 실패 :rotating_light:',
      });
    });

    test.each([undefined, '', '  ', null, 1])('ts_msg1이 %p이면 부모 발송 전에 TypeError가 발생한다', async (ts_msg1) => {
      // Given: 첫 댓글이 유효하지 않다
      const instance = new DevNotifier({ slackToken: 'token', slackChannel: 'C-TEST' });

      // When: 유효하지 않은 thread를 발송한다
      const request = instance.postThread({ message: '부모', ts_msg1 });

      // Then: 부모와 댓글 모두 발송하지 않는다
      await expect(request).rejects.toThrow(TypeError);
      expect(mockPostMessage).not.toHaveBeenCalled();
    });

    test.each([
      ['ts_msg2', { ts_msg1: '첫 댓글', ts_msg2: '  ' }],
      ['ts_msg3', { ts_msg1: '첫 댓글', ts_msg3: null }],
    ])('%s가 유효하지 않으면 부모 발송 전에 TypeError가 발생한다', async (_field, options) => {
      // Given: 선택 댓글 중 하나가 유효하지 않다
      const instance = new DevNotifier({ slackToken: 'token', slackChannel: 'C-TEST' });

      // When: 유효하지 않은 thread를 발송한다
      const request = instance.postThread({ message: '부모', ...options });

      // Then: 부모도 발송하지 않는다
      await expect(request).rejects.toThrow(TypeError);
      expect(mockPostMessage).not.toHaveBeenCalled();
    });

    test('message가 없으면 console.error 후 thread를 발송하지 않는다', async () => {
      // Given: 부모 메시지가 없다
      const instance = new DevNotifier({ slackToken: 'token', slackChannel: 'C-TEST' });
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // When: 메시지 없는 thread를 발송한다
      const result = await instance.postThread({ ts_msg1: '첫 댓글' });

      // Then: 오류를 기록하고 Slack을 호출하지 않는다
      expect(result).toBeUndefined();
      expect(errorSpy).toHaveBeenCalled();
      expect(mockPostMessage).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    test('부모 ts가 없으면 댓글을 발송하지 않는다', async () => {
      // Given: 부모 응답에 thread 식별자가 없다
      const instance = new DevNotifier({ slackToken: 'token', slackChannel: 'C-TEST' });
      mockPostMessage.mockResolvedValueOnce({ ok: true });

      // When: thread를 발송한다
      const request = instance.postThread({ message: '부모', ts_msg1: '첫 댓글' });

      // Then: 오류가 발생하고 부모만 호출된다
      await expect(request).rejects.toThrow();
      expect(mockPostMessage).toHaveBeenCalledTimes(1);
    });

    test('SDK 오류를 호출자에게 전파하고 이후 발송을 중단한다', async () => {
      // Given: 부모 발송에서 SDK 오류가 발생한다
      const instance = new DevNotifier({ slackToken: 'token', slackChannel: 'C-TEST' });
      const sdkError = new Error('Slack unavailable');
      mockPostMessage.mockRejectedValueOnce(sdkError);

      // When: thread를 발송한다
      const request = instance.postThread({ message: '부모', ts_msg1: '첫 댓글' });

      // Then: 같은 오류를 전파한다
      await expect(request).rejects.toBe(sdkError);
      expect(mockPostMessage).toHaveBeenCalledTimes(1);
    });

    test('댓글 발송 오류가 발생하면 이후 댓글을 발송하지 않는다', async () => {
      // Given: 첫 댓글 발송에서 SDK 오류가 발생한다
      const instance = new DevNotifier({ slackToken: 'token', slackChannel: 'C-TEST' });
      const sdkError = new Error('Reply unavailable');
      mockPostMessage
        .mockResolvedValueOnce({ ok: true, ts: '1700000000.000100' })
        .mockRejectedValueOnce(sdkError);

      // When: 세 댓글을 포함한 thread를 발송한다
      const request = instance.postThread({
        message: '부모', ts_msg1: '첫 댓글', ts_msg2: '두 번째 댓글', ts_msg3: '세 번째 댓글',
      });

      // Then: 오류를 전파하고 실패 뒤 댓글은 중단한다
      await expect(request).rejects.toBe(sdkError);
      expect(mockPostMessage).toHaveBeenCalledTimes(2);
      expect(mockPostMessage).toHaveBeenNthCalledWith(2, {
        channel: 'C-TEST', text: '첫 댓글', thread_ts: '1700000000.000100',
      });
    });
  });

  describe('Slack 구성과 안전성', () => {
    test('명시 옵션이 환경변수보다 우선하고 값을 trim한다', () => {
      // Given: 환경변수와 명시 옵션이 모두 있다
      process.env.SLACK_BOT_TOKEN = ' env-token ';
      process.env.SLACK_CHANNEL = ' env-channel ';

      // When: 명시 옵션으로 notifier를 생성한다
      const instance = new DevNotifier({ slackToken: ' option-token ', slackChannel: ' C-TEST ' });

      // Then: 명시 옵션을 사용한다
      expect(WebClient).toHaveBeenCalledWith('option-token');
      expect(instance.channel).toBe('C-TEST');
    });

    test('환경변수가 없거나 공백이면 Slack 발송을 거부한다', async () => {
      // Given: Slack 구성값이 없다
      const instance = new DevNotifier();

      // When: 메시지를 발송한다
      const request = instance.post({ message: 'hello' });

      // Then: SDK를 호출하지 않고 거부한다
      await expect(request).rejects.toThrow();
      expect(mockPostMessage).not.toHaveBeenCalled();
    });

    test.each([
      ['token', { slackToken: '   ', slackChannel: 'C-TEST' }],
      ['channel', { slackToken: 'token', slackChannel: '\t' }],
    ])('whitespace-only %s이면 Slack SDK를 호출하지 않는다', async (_field, options) => {
      // Given: Slack 구성값 중 하나가 공백뿐이다
      const instance = new DevNotifier(options);

      // When: 메시지를 발송한다
      const request = instance.post({ message: 'hello' });

      // Then: 구성 오류를 거부한다
      await expect(request).rejects.toThrow();
      expect(mockPostMessage).not.toHaveBeenCalled();
    });

    test('특수 멘션은 제거하고 안전한 date markup은 유지한다', async () => {
      // Given: 멘션과 date markup이 포함된 메시지가 있다
      const instance = new DevNotifier({ slackToken: 'token', slackChannel: 'C-TEST' });
      const dateMarkup = '<!date^1392734382^{date_short}|Posted>';

      // When: 메시지를 발송한다
      await instance.post({ message: `<!channel> <!here> <!everyone> <@UATTACKER> ${dateMarkup}` });

      // Then: 위험한 멘션은 제거하고 date markup은 유지한다
      const sent = mockPostMessage.mock.calls[0][0].text;
      expect(sent).not.toContain('<!channel>');
      expect(sent).not.toContain('<!here>');
      expect(sent).not.toContain('<!everyone>');
      expect(sent).not.toContain('<@UATTACKER>');
      expect(sent).toContain(dateMarkup);
    });

    test('token은 JSON 직렬화 결과에 노출되지 않는다', () => {
      // Given: 명시 token과 환경 token으로 notifier를 생성한다
      process.env.SLACK_BOT_TOKEN = 'ENV_TOKEN_SENTINEL';
      const explicit = new DevNotifier({ slackToken: 'EXPLICIT_TOKEN_SENTINEL', slackChannel: 'C-TEST' });
      const fromEnv = new DevNotifier({ slackChannel: 'C-TEST' });

      // When: notifier를 직렬화한다
      const serialized = JSON.stringify({ explicit, fromEnv });

      // Then: token이 결과에 노출되지 않는다
      expect(serialized).not.toContain('EXPLICIT_TOKEN_SENTINEL');
      expect(serialized).not.toContain('ENV_TOKEN_SENTINEL');
    });
  });
});

describe('notifier 공개 export', () => {
  test('root와 notifier CJS는 DevNotifier와 ErrorNotifier만 관련 export한다', () => {
    const output = execFileSync(process.execPath, [
      '-e',
      "const root = require('@theSportsDev/utils'); const notifier = require('@theSportsDev/utils/notifier'); console.log(JSON.stringify({dev: !!root.DevNotifier && !!notifier.DevNotifier, error: !!root.ErrorNotifier && !!notifier.ErrorNotifier, slack: root.SlackNotifier || notifier.SlackNotifier, script: root.formatScriptResultMessage || notifier.formatScriptResultMessage, deployment: root.formatDeploymentResultMessage || notifier.formatDeploymentResultMessage}))",
    ], { cwd: require('process').cwd(), encoding: 'utf8' });

    expect(JSON.parse(output.trim())).toEqual({ dev: true, error: true });
  });

  test('root와 notifier ESM은 DevNotifier와 ErrorNotifier를 export하고 기존 API는 제거한다', () => {
    const output = execFileSync(process.execPath, [
      '--input-type=module',
      '-e',
      "import * as notifier from '@theSportsDev/utils/notifier'; import * as root from '@theSportsDev/utils'; console.log(JSON.stringify({dev: !!notifier.DevNotifier && !!root.DevNotifier, error: !!notifier.ErrorNotifier && !!root.ErrorNotifier, slack: notifier.SlackNotifier || root.SlackNotifier, script: notifier.formatScriptResultMessage || root.formatScriptResultMessage, deployment: notifier.formatDeploymentResultMessage || root.formatDeploymentResultMessage}))",
    ], { cwd: require('process').cwd(), encoding: 'utf8' });

    expect(JSON.parse(output.trim())).toEqual({ dev: true, error: true });
  });
});
