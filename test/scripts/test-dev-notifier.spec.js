'use strict';

const { run } = require('../../scripts/test-dev-notifier');

describe('DevNotifier 테스트 스크립트', () => {
  describe('post 모드', () => {
    test('새 환경변수를 DevNotifier 생성자 옵션으로 전달하고 메시지를 발송한다', async () => {
      // Given: 새 환경변수와 네트워크를 사용하지 않는 가짜 notifier가 준비되었다
      const instances = [];
      class FakeDevNotifier {
        constructor(options) {
          this.options = options;
          instances.push(this);
        }

        async post(payload) {
          this.payload = payload;
          return { ts: '1700000000.000001' };
        }
      }
      const stdout = jest.fn();
      const stderr = jest.fn();

      // When: 새 환경변수로 post 모드를 실행한다
      const exitCode = await run({
        mode: 'post',
        args: ['배포 완료'],
        env: {
          devNotifierSlackToken: 'new-token',
          devNotifierSlackChannel: 'new-channel',
        },
        DevNotifier: FakeDevNotifier,
        stdout,
        stderr,
      });

      // Then: 새 환경변수가 Slack 옵션과 메시지로 전달된다
      expect(exitCode).toBe(0);
      expect(instances).toHaveLength(1);
      expect(instances[0].options).toEqual({
        slackToken: 'new-token',
        slackChannel: 'new-channel',
      });
      expect(instances[0].payload).toEqual({ message: '배포 완료' });
      expect(stdout).toHaveBeenCalledWith('1700000000.000001');
      expect(stderr).not.toHaveBeenCalled();
    });

    test('레거시 환경변수만 있으면 notifier를 생성하거나 발송하지 않는다', async () => {
      // Given: 레거시 환경변수만 있고 가짜 notifier가 준비되었다
      const FakeDevNotifier = jest.fn();
      const stderr = jest.fn();

      // When: 레거시 환경변수로 post 모드를 실행한다
      const exitCode = await run({
        mode: 'post',
        args: ['발송하면 안 됨'],
        env: {
          slackBotToken: 'legacy-token',
          slackChannel: 'legacy-channel',
        },
        DevNotifier: FakeDevNotifier,
        stderr,
      });

      // Then: 새 환경변수가 없으므로 실패하고 notifier를 호출하지 않는다
      expect(exitCode).toBe(1);
      expect(FakeDevNotifier).not.toHaveBeenCalled();
      expect(stderr).toHaveBeenCalledWith('DEV_NOTIFIER_SLACK_TOKEN 및 DEV_NOTIFIER_SLACK_CHANNEL 환경변수가 필요합니다.');
    });
  });

  describe('post-thread 모드', () => {
    test('새 환경변수로 스레드 발송을 실행한다', async () => {
      // Given: 새 환경변수와 스레드 발송을 기록하는 가짜 notifier가 준비되었다
      const instances = [];
      class FakeDevNotifier {
        constructor(options) {
          this.options = options;
          instances.push(this);
        }

        async postThread(payload) {
          this.payload = payload;
          return {
            parent: { ts: '1700000000.000001' },
            comments: [{ ts: '1700000000.000002' }],
          };
        }
      }
      const stdout = jest.fn();

      // When: 새 환경변수로 post-thread 모드를 실행한다
      const exitCode = await run({
        mode: 'post-thread',
        args: ['부모', '댓글 1'],
        env: {
          devNotifierSlackToken: 'thread-token',
          devNotifierSlackChannel: 'thread-channel',
        },
        DevNotifier: FakeDevNotifier,
        stdout,
      });

      // Then: 생성자 옵션과 스레드 payload가 전달되고 timestamp가 출력된다
      expect(exitCode).toBe(0);
      expect(instances[0].options).toEqual({
        slackToken: 'thread-token',
        slackChannel: 'thread-channel',
      });
      expect(instances[0].payload).toEqual({
        message: '부모',
        ts_msg1: '댓글 1',
        ts_msg2: undefined,
        ts_msg3: undefined,
      });
      expect(stdout.mock.calls).toEqual([
        ['1700000000.000001'],
        ['1700000000.000002'],
      ]);
    });
  });
});
