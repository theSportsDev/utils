'use strict';

const mockPostMessage = jest.fn();

jest.mock('@slack/web-api', () => ({
  WebClient: jest.fn().mockImplementation(() => ({
    chat: { postMessage: mockPostMessage },
  })),
}));

const { WebClient } = require('@slack/web-api');
const { ErrorNotifier } = require('../../src/notifier/ErrorNotifier');

function makeMockError(status, message = 'boom') {
  const err = new Error(message);
  err.status = status;
  return err;
}

describe('ErrorNotifier', () => {
  const originalToken = process.env.SLACK_BOT_TOKEN;

  beforeEach(() => {
    jest.useFakeTimers();
    mockPostMessage.mockReset();
    WebClient.mockClear();
    // 2026-05-04 10:00:00 KST (월요일, 근무시간)
    jest.setSystemTime(new Date('2026-05-04T01:00:00.000Z'));
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env.SLACK_BOT_TOKEN;
    else process.env.SLACK_BOT_TOKEN = originalToken;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('인자 없이 생성 가능하고 기본값을 사용한다', () => {
    const notifier = new ErrorNotifier();

    expect(notifier.targetService).toBe('Unknown Service');
    expect(notifier.serviceOwner).toBe('');
  });

  test('서비스/담당자 인자를 반영한다', () => {
    const notifier = new ErrorNotifier({ targetService: 'API', serviceOwner: '홍길동' });

    expect(notifier.targetService).toBe('API');
    expect(notifier.serviceOwner).toBe('홍길동');
  });

  describe('push() 발송 규칙', () => {
    test('명시한 slackToken이 SLACK_BOT_TOKEN보다 우선한다', () => {
      process.env.SLACK_BOT_TOKEN = 'env-token';

      new ErrorNotifier({ slackToken: 'option-token' });

      expect(WebClient).toHaveBeenCalledWith('option-token');
      delete process.env.SLACK_BOT_TOKEN;
    });

    test('ErrorNotifier 직렬화 결과에 explicit/env token이 노출되지 않는다', () => {
      process.env.SLACK_BOT_TOKEN = 'ENV_ERROR_TOKEN_SENTINEL';
      const explicit = new ErrorNotifier({ slackToken: 'EXPLICIT_ERROR_TOKEN_SENTINEL' });
      const fromEnv = new ErrorNotifier();

      const serialized = JSON.stringify({ explicit, fromEnv });

      expect(serialized).not.toContain('EXPLICIT_ERROR_TOKEN_SENTINEL');
      expect(serialized).not.toContain('ENV_ERROR_TOKEN_SENTINEL');
    });

    test('SLACK_BOT_TOKEN 환경변수를 사용하고 자격 증명을 payload에 노출하지 않는다', async () => {
      process.env.SLACK_BOT_TOKEN = 'env-token';
      const notifier = new ErrorNotifier({ slackChannel: 'C-TEST' });
      notifier.slackClient = { chat: { postMessage: mockPostMessage } };
      mockPostMessage.mockResolvedValue({ ts: '1700000000.000100' });

      await notifier.push({ error: makeMockError(500, 'token=secret-value') });

      expect(WebClient).toHaveBeenCalledWith('env-token');
      expect(JSON.stringify(mockPostMessage.mock.calls)).not.toContain('env-token');
      delete process.env.SLACK_BOT_TOKEN;
    });

    test('Error 인스턴스가 아니면 무시된다', async () => {
      const notifier = new ErrorNotifier({ targetService: 'Bluewings API', serviceOwner: '홍길동' });
      const postMessage = jest.fn().mockResolvedValue({ ts: '1700000000.000100' });
      notifier.slackClient = { chat: { postMessage } };

      await notifier.push({ error: { status: 500, message: 'not an Error' } });

      expect(postMessage).not.toHaveBeenCalled();
    });

    test('error.status가 500 미만이면 무시된다', async () => {
      const notifier = new ErrorNotifier({ targetService: 'Bluewings API', serviceOwner: '홍길동' });
      const postMessage = jest.fn().mockResolvedValue({ ts: '1700000000.000100' });
      notifier.slackClient = { chat: { postMessage } };

      await notifier.push({ error: makeMockError(404) });

      expect(postMessage).not.toHaveBeenCalled();
    });

    test('status가 없는 에러면 상태코드가 500으로 고정된다.', async () => {
      const notifier = new ErrorNotifier({ targetService: 'Bluewings API', serviceOwner: '홍길동', slackChannel: 'C-TEST' });
      const postMessage = jest.fn().mockResolvedValue({ ts: '1700000000.000100' });
      notifier.slackClient = { chat: { postMessage } };

      await notifier.push({ error: new Error() });

      expect(postMessage).toHaveBeenCalled();
      expect(postMessage.mock.calls[0][0].text).toContain('[500]');
    });

    test('Error & status >= 500이면 부모 + 스레드 메시지를 발송한다', async () => {
      const notifier = new ErrorNotifier({ targetService: 'Bluewings API', serviceOwner: '홍길동', slackChannel: 'C-TEST' });
      const postMessage = jest.fn().mockResolvedValue({ ts: '1700000000.000100' });
      notifier.slackClient = { chat: { postMessage } };

      await notifier.push({ error: makeMockError(500, 'DB down') });

      // 부모 + message 스레드 + stack 스레드 = 3회
      expect(postMessage).toHaveBeenCalledTimes(3);
    });

    test('서비스 이름이 없으면 "Unknown Service"로 표기된다', async () => {
      const notifier = new ErrorNotifier({ slackChannel: 'C-TEST' });
      const postMessage = jest.fn().mockResolvedValue({ ts: '1700000000.000100' });
      notifier.slackClient = { chat: { postMessage } };

      await notifier.push({ error: makeMockError(500) });

      expect(postMessage.mock.calls[0][0].text).toContain('Unknown Service');
    });

    test('message를 함께 전달하면 부모 메시지 앞에 추가된다', async () => {
      const notifier = new ErrorNotifier({ slackChannel: 'C-TEST' });
      const postMessage = jest.fn().mockResolvedValue({ ts: '1700000000.000100' });
      notifier.slackClient = { chat: { postMessage } };

      await notifier.push({ error: makeMockError(500, 'DB down'), message: '추가 컨텍스트' });

      expect(postMessage.mock.calls[0][0].text).toContain('추가 컨텍스트\n');
    });

    test('context/error message/stack의 민감한 키 값을 [REDACTED] 처리한다', async () => {
      const notifier = new ErrorNotifier({ slackChannel: 'C-TEST' });
      const error = makeMockError(500, 'token=top-secret authorization: bearer-secret cookie=session-secret password=pw');
      error.stack = 'Error: token=stack-secret authorization=auth-secret cookie=cookie-secret password=stack-pw';
      notifier.slackClient = { chat: { postMessage: mockPostMessage } };
      mockPostMessage.mockResolvedValue({ ts: '1700000000.000100' });

      await notifier.push({
        error,
        message: 'context token=context-secret authorization=context-auth cookie=context-cookie password=context-pw',
      });

      const sent = mockPostMessage.mock.calls.map(([payload]) => payload.text).join('\n');
      expect(sent).toContain('[REDACTED]');
      expect(sent).not.toMatch(/top-secret|stack-secret|context-secret|auth-secret|context-auth|cookie-secret|context-cookie|stack-pw|context-pw/);
    });

    test('Basic/Bearer authorization, cookie, 공백 password와 JSON escaped quote의 secret suffix를 모두 가린다', async () => {
      const notifier = new ErrorNotifier({ slackChannel: 'C-TEST' });
      const error = makeMockError(500, 'authorization: Basic BASIC_SECRET\ncookie: sid=SID_SECRET; refresh=REFRESH_SECRET\npassword: password with spaces\naccess_token: ACCESS_SECRET\nrefresh_token: REFRESH_TOKEN_SECRET\naccessToken: CAMEL_ACCESS_SECRET\napiKey: API_KEY_SECRET\nclient_secret: CLIENT_SECRET\n' + String.raw`{\"token\":\"ESCAPED_TOKEN_SECRET\",\"access_token\":\"ESCAPED_ACCESS_SECRET\",\"client_secret\":\"ESCAPED_CLIENT_SECRET\"}`);
      error.stack = 'authorization: Bearer BEARER_SECRET\ncookie: sid=STACK_SID; refresh=STACK_REFRESH\npassword: stack password secret\naccess_token: STACK_ACCESS_SECRET\nrefresh_token: STACK_REFRESH_TOKEN_SECRET\naccessToken: STACK_CAMEL_ACCESS_SECRET\napiKey: STACK_API_KEY_SECRET\nclient_secret: STACK_CLIENT_SECRET\n' + String.raw`{\"token\":\"ESCAPED_STACK_TOKEN_SECRET\",\"refresh_token\":\"ESCAPED_STACK_REFRESH_SECRET\",\"apiKey\":\"ESCAPED_STACK_API_KEY_SECRET\"}`;
      notifier.slackClient = { chat: { postMessage: mockPostMessage } };
      mockPostMessage.mockResolvedValue({ ts: '1700000000.000100' });

      await notifier.push({
        error,
        message: 'authorization: Basic CONTEXT_BASIC\ncookie: sid=CONTEXT_SID; refresh=CONTEXT_REFRESH\npassword: context password secret\naccess_token: CONTEXT_ACCESS_SECRET\nrefresh_token: CONTEXT_REFRESH_TOKEN_SECRET\naccessToken: CONTEXT_CAMEL_ACCESS_SECRET\napiKey: CONTEXT_API_KEY_SECRET\nclient_secret: CONTEXT_CLIENT_SECRET\ntoken: CONTEXT_TOKEN\n' + String.raw`{\"token\":\"ESCAPED_CONTEXT_TOKEN_SECRET\",\"accessToken\":\"ESCAPED_CONTEXT_ACCESS_SECRET\",\"client_secret\":\"ESCAPED_CONTEXT_CLIENT_SECRET\"}`,
      });

      const sent = JSON.stringify(mockPostMessage.mock.calls);
      expect(sent).toContain('[REDACTED]');
      expect(sent).not.toMatch(/BASIC_SECRET|SID_SECRET|REFRESH_SECRET|password with spaces|BEARER_SECRET|STACK_SID|STACK_REFRESH|stack password secret|ACCESS_SECRET|REFRESH_TOKEN_SECRET|CAMEL_ACCESS_SECRET|API_KEY_SECRET|CLIENT_SECRET|ESCAPED_TOKEN_SECRET|ESCAPED_ACCESS_SECRET|ESCAPED_CLIENT_SECRET|STACK_ACCESS_SECRET|STACK_REFRESH_TOKEN_SECRET|STACK_CAMEL_ACCESS_SECRET|STACK_API_KEY_SECRET|STACK_CLIENT_SECRET|ESCAPED_STACK_TOKEN_SECRET|ESCAPED_STACK_REFRESH_SECRET|ESCAPED_STACK_API_KEY_SECRET|CONTEXT_BASIC|CONTEXT_SID|CONTEXT_REFRESH|context password secret|CONTEXT_ACCESS_SECRET|CONTEXT_REFRESH_TOKEN_SECRET|CONTEXT_CAMEL_ACCESS_SECRET|CONTEXT_API_KEY_SECRET|CONTEXT_CLIENT_SECRET|CONTEXT_TOKEN|ESCAPED_CONTEXT_TOKEN_SECRET|ESCAPED_CONTEXT_ACCESS_SECRET|ESCAPED_CONTEXT_CLIENT_SECRET/);
    });

    test('신뢰할 수 없는 입력의 특수 멘션은 제거하고 MEMBER_MAP 멘션만 유지한다', async () => {
      const notifier = new ErrorNotifier({
        slackChannel: 'C-TEST',
        serviceOwner: '<!channel> <!here> <!everyone> <@UATTACKER> <@WATTACKER> <!subteam^SATTACKER>',
      });
      const error = makeMockError(500, '<!channel> <!here> <!everyone> <@UATTACKER> <@WATTACKER> <!subteam^SATTACKER>');
      notifier.slackClient = { chat: { postMessage: mockPostMessage } };
      mockPostMessage.mockResolvedValue({ ts: '1700000000.000100' });

      await notifier.push({
        error,
        message: '<!channel> <!here> <!everyone> <@UATTACKER> <@WATTACKER> <!subteam^SATTACKER>',
      });

      const sent = JSON.stringify(mockPostMessage.mock.calls);
      expect(sent).not.toContain('<!channel>');
      expect(sent).not.toContain('<!here>');
      expect(sent).not.toContain('<!everyone>');
      expect(sent).not.toContain('<@UATTACKER>');
      expect(sent).not.toContain('<@WATTACKER>');
      expect(sent).not.toContain('<!subteam^SATTACKER>');

      mockPostMessage.mockClear();
      const mappedNotifier = new ErrorNotifier({ slackChannel: 'C-TEST', serviceOwner: '배지훈' });
      mappedNotifier.slackClient = { chat: { postMessage: mockPostMessage } };
      await mappedNotifier.push({ error: makeMockError(500) });
      expect(JSON.stringify(mockPostMessage.mock.calls)).toContain('<@U02196V2EH3>');
    });

    test('link_names를 보내지 않고 내장 Slack 사용자 멘션은 유지한다', async () => {
      const notifier = new ErrorNotifier({ slackChannel: 'C-TEST', serviceOwner: '배지훈' });
      notifier.slackClient = { chat: { postMessage: mockPostMessage } };
      mockPostMessage.mockResolvedValue({ ts: '1700000000.000100' });

      await notifier.push({ error: makeMockError(500) });

      const parentPayload = mockPostMessage.mock.calls[0][0];
      expect(parentPayload).not.toHaveProperty('link_names');
      expect(parentPayload.text).toContain('<@U02196V2EH3>');
    });

    test('slackChannel이 없으면 console.error만 남기고 발송 시도를 하지 않는다', async () => {
      const notifier = new ErrorNotifier({ targetService: 'API', serviceOwner: '홍길동' });
      const postMessage = jest.fn().mockResolvedValue({ ts: '1700000000.000100' });
      notifier.slackClient = { chat: { postMessage } };
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await expect(notifier.push({ error: makeMockError(500) })).resolves.toBeUndefined();

      expect(postMessage).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith('Required slack channel to post message');
    });

    test('생성자에서 channel을 직접 지정할 수 있다 (환경변수 불필요)', async () => {
      const notifier = new ErrorNotifier({
        slackChannel: 'C-DIRECT',
        targetService: 'API',
        serviceOwner: '홍길동',
      });
      const postMessage = jest.fn().mockResolvedValue({ ts: '1700000000.000100' });
      notifier.slackClient = { chat: { postMessage } };

      await notifier.push({ error: makeMockError(500) });

      expect(postMessage).toHaveBeenCalled();
      expect(postMessage.mock.calls[0][0].channel).toBe('C-DIRECT');
    });
  });

  describe('_mapOwnerToSlackId()', () => {
    test('memberMap에 있는 owner는 근무시간에 멘션으로 변환된다', () => {
      const notifier = new ErrorNotifier({ serviceOwner: '배지훈' });

      expect(notifier._mapOwnerToSlackId('배지훈')).toBe('<@U02196V2EH3>');
    });

    test('memberMap에 없는 owner는 이름 그대로 반환한다', () => {
      const notifier = new ErrorNotifier({ serviceOwner: '없는사람' });

      expect(notifier._mapOwnerToSlackId('없는사람')).toBe('없는사람');
    });

    test('owner가 비어 있으면 빈 문자열을 반환한다', () => {
      const notifier = new ErrorNotifier();

      expect(notifier._mapOwnerToSlackId('')).toBe('');
    });
  });
});
