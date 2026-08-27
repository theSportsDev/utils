'use strict';

const envConfig = require('../src/env');
const { SlackNotifier: DefaultSlackNotifier } = require('../src/notifier/SlackNotifier');

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
      comments: DEFAULT_THREAD_COMMENTS,
    };
  }

  const [message, ...comments] = args;

  if (typeof message !== 'string' || !message.trim() || comments.length === 0) {
    return null;
  }

  return { message, comments };
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
  SlackNotifier = DefaultSlackNotifier,
  stdout = console.log,
  stderr = console.error,
} = {}) {
  if (mode !== 'post' && mode !== 'post-thread') {
    stderr('유효한 Slack 발송 모드가 필요합니다.');
    return 1;
  }

  const threadPayload = mode === 'post-thread' ? getThreadPayload(args) : null;

  if (mode === 'post-thread' && !threadPayload) {
    stderr('스레드 발송에는 부모 메시지와 하나 이상의 댓글이 필요합니다.');
    return 1;
  }

  const slackToken = getRequiredEnv(env.slackBotToken);
  const slackChannel = getRequiredEnv(env.slackChannel);

  if (!slackToken || !slackChannel) {
    stderr('SLACK_BOT_TOKEN 및 SLACK_CHANNEL 환경변수가 필요합니다.');
    return 1;
  }

  try {
    const notifier = new SlackNotifier({ slackToken, slackChannel });

    if (mode === 'post') {
      const response = await notifier.push({ message: getMessage(args) });
      writeTs(stdout, response);
      return 0;
    }

    const response = await notifier.postThread(threadPayload);
    writeTs(stdout, response && response.parent);
    response && Array.isArray(response.comments) && response.comments.forEach((comment) => {
      writeTs(stdout, comment);
    });

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
