'use strict';

const envConfig = require('../src/env');
const { DevNotifier: DefaultDevNotifier } = require('../src/notifier/DevNotifier');

const DEFAULT_MESSAGE = '[TEST] Hello world!';
const DEFAULT_THREAD_MESSAGE = '[TEST] Thread parent';
const DEFAULT_THREAD_COMMENTS = ['[TEST] Thread comment 1', '[TEST] Thread comment 2'];

function getRequiredEnv(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getRunOptions(argv) {
  const [, , mode = 'post', ...rawArgs] = Array.isArray(argv) ? argv : [];
  const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;

  return { mode, args };
}

function getMessage(args) {
  const message = Array.isArray(args) ? args.join(' ').trim() : '';

  return message || DEFAULT_MESSAGE;
}

function getThreadPayload(args) {
  if (!Array.isArray(args) || args.length === 0) {
    return {
      message: DEFAULT_THREAD_MESSAGE,
      ts_msg1: DEFAULT_THREAD_COMMENTS[0],
      ts_msg2: DEFAULT_THREAD_COMMENTS[1],
    };
  }

  const [message, ts_msg1, ts_msg2, ts_msg3, ...extraComments] = args;
  if (
    typeof message !== 'string' || !message.trim()
    || typeof ts_msg1 !== 'string' || !ts_msg1.trim()
    || extraComments.length > 0
  ) return null;

  return { message, ts_msg1, ts_msg2, ts_msg3 };
}

function writeTs(stdout, response) {
  if (response && typeof response.ts === 'string' && response.ts) {
    stdout(response.ts);
  }
}

async function run({
  mode = 'post',
  args = process.argv.slice(2),
  env = envConfig,
  DevNotifier = DefaultDevNotifier,
  stdout = console.log,
  stderr = console.error,
} = {}) {
  if (mode !== 'post' && mode !== 'post-thread') {
    stderr('유효한 DevNotifier 발송 모드가 필요합니다.');
    return 1;
  }

  const threadPayload = mode === 'post-thread' ? getThreadPayload(args) : null;
  if (mode === 'post-thread' && !threadPayload) {
    stderr('스레드 발송에는 부모 메시지와 하나 이상의 댓글(최대 세 개)이 필요합니다.');
    return 1;
  }

  const slackToken = getRequiredEnv(env.devNotifierSlackToken);
  const slackChannel = getRequiredEnv(env.devNotifierSlackChannel);
  if (!slackToken || !slackChannel) {
    stderr('SLACK_BOT_TOKEN 및 SLACK_CHANNEL 환경변수가 필요합니다.');
    return 1;
  }

  try {
    const notifier = new DevNotifier({ slackToken, slackChannel });
    if (mode === 'post') {
      const response = await notifier.post({ message: getMessage(args) });
      writeTs(stdout, response);
      return 0;
    }

    const response = await notifier.postThread(threadPayload);
    writeTs(stdout, response && response.parent);
    response && response.comments.forEach((comment) => writeTs(stdout, comment));
    return 0;
  } catch (error) {
    stderr('Slack 발송 실패');
    return 1;
  }
}

if (require.main === module) {
  const { mode, args } = getRunOptions(process.argv);
  run({ mode, args }).then((exitCode) => {
    process.exitCode = exitCode;
  });
}

module.exports = { getRunOptions, run };
