'use strict';

const { ErrorNotifier } = require('../../src/notifier/ErrorNotifier');

function makeMockError(status, message = 'boom') {
  const err = new Error(message);
  err.status = status;
  return err;
}

describe('ErrorNotifier', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // 2026-05-04 10:00:00 KST (월요일, 근무시간)
    jest.setSystemTime(new Date('2026-05-04T01:00:00.000Z'));
  });

  afterEach(() => {
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
      const notifier = new ErrorNotifier({ targetService: 'Bluewings API', serviceOwner: '홍길동' });
      const postMessage = jest.fn().mockResolvedValue({ ts: '1700000000.000100' });
      notifier.slackClient = { chat: { postMessage } };

      await notifier.push({ error: new Error() });

      expect(postMessage).toHaveBeenCalled();
      expect(postMessage.mock.calls[0][0].text).toContain('[500]');
    });

    test('Error & status >= 500이면 부모 + 스레드 메시지를 발송한다', async () => {
      const notifier = new ErrorNotifier({ targetService: 'Bluewings API', serviceOwner: '홍길동' });
      const postMessage = jest.fn().mockResolvedValue({ ts: '1700000000.000100' });
      notifier.slackClient = { chat: { postMessage } };

      await notifier.push({ error: makeMockError(500, 'DB down') });

      // 부모 + message 스레드 + stack 스레드 = 3회
      expect(postMessage).toHaveBeenCalledTimes(3);
    });

    test('서비스 이름이 없으면 "Unknown Service"로 표기된다', async () => {
      const notifier = new ErrorNotifier();
      const postMessage = jest.fn().mockResolvedValue({ ts: '1700000000.000100' });
      notifier.slackClient = { chat: { postMessage } };

      await notifier.push({ error: makeMockError(500) });

      expect(postMessage.mock.calls[0][0].text).toContain('Unknown Service');
    });

    test('message를 함께 전달하면 부모 메시지 앞에 추가된다', async () => {
      const notifier = new ErrorNotifier();
      const postMessage = jest.fn().mockResolvedValue({ ts: '1700000000.000100' });
      notifier.slackClient = { chat: { postMessage } };

      await notifier.push({ error: makeMockError(500, 'DB down'), message: '추가 컨텍스트' });

      expect(postMessage.mock.calls[0][0].text).toContain('추가 컨텍스트\n');
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
