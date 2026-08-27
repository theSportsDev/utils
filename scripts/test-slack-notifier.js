'use strict';

const fs = require('fs');
const path = require('path');

const { SlackNotifier: DefaultSlackNotifier } = require('../src/notifier/SlackNotifier');

const DEFAULT_MESSAGE = '[TEST] Hello world!';
const DEFAULT_THREAD_MESSAGE = '[TEST] Thread parent';
const DEFAULT_THREAD_COMMENTS = ['[TEST] Thread comment 1', '[TEST] Thread comment 2'];
const DOT_ENV_PATH = path.resolve(__dirname, '../.env');

function loadDotEnv(env) {
  let contents;

  try {
    contents = fs.readFileSync(DOT_ENV_PATH, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return;
    }

    throw error;
  }

  contents.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);

    if (!match || env[match[1]] !== undefined) {
      return;
    }

    const value = match[2].trim();
    const quote = value[0];

    env[match[1]] = quote && quote === value[value.length - 1] && (quote === '\'' || quote === '"')
      ? value.slice(1, -1)
      : value;
  });
}

function getRequiredEnv(env, name) {
  const value = env[name];

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

loadDotEnv(process.env);

async function run({
  mode = 'post',
  args = process.argv.slice(2),
  env = process.env,
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

  const slackToken = getRequiredEnv(env, 'SLACK_BOT_TOKEN');
  const slackChannel = getRequiredEnv(env, 'SLACK_CHANNEL');

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
