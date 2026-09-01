'use strict';

const { WebClient } = require('@slack/web-api');
const { formatSeoulDateTime } = require('../datetime/index.cjs');
const env = require('../env');
const { sanitizeSlackMarkup } = require('./messageSafety');

function requireString(value, fieldName) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${fieldName} must be a non-empty string`);
  }

  return value.trim();
}

function getMessage(value) {
  if (typeof value !== 'string' || !value.trim()) {
    console.error('Required message to post Slack notification');
    return;
  }

  return sanitizeSlackMarkup(value.trim());
}

function formatMessage(message, result) {
  let text = `${message}\n처리 날짜: ${formatSeoulDateTime(new Date())}`;

  if (result === 'success') {
    text += '\n처리 결과: 성공 :짠:';
  } else if (result === 'fail') {
    text += '\n처리 결과: 실패 :rotating_light:';
  }

  return text;
}

class DevNotifier {
  constructor({ slackToken, slackChannel } = {}) {
    const token = slackToken === undefined ? env.devNotifierSlackToken : slackToken;
    const channel = slackChannel === undefined ? env.devNotifierSlackChannel : slackChannel;
    const normalizedToken = typeof token === 'string' ? token.trim() : token;

    this.channel = typeof channel === 'string' ? channel.trim() : channel;
    Object.defineProperties(this, {
      token: {
        configurable: true,
        enumerable: false,
        value: normalizedToken,
        writable: true,
      },
      slackClient: {
        configurable: true,
        enumerable: false,
        value: new WebClient(normalizedToken),
        writable: true,
      },
    });
  }

  _getSlackConfig() {
    return {
      token: requireString(this.token, 'slackToken'),
      channel: requireString(this.channel, 'slackChannel'),
    };
  }

  async post({ message, result } = {}) {
    const normalizedMessage = getMessage(message);
    if (!normalizedMessage) return;

    const { channel } = this._getSlackConfig();
    return this.slackClient.chat.postMessage({
      channel,
      text: formatMessage(normalizedMessage, result),
    });
  }

  async postThread({ message, result, ts_msg1, ts_msg2, ts_msg3 } = {}) {
    const normalizedMessage = getMessage(message);
    if (!normalizedMessage) return;

    const commentTexts = [
      sanitizeSlackMarkup(requireString(ts_msg1, 'ts_msg1')),
    ];

    for (const [fieldName, value] of [['ts_msg2', ts_msg2], ['ts_msg3', ts_msg3]]) {
      if (value !== undefined) {
        commentTexts.push(sanitizeSlackMarkup(requireString(value, fieldName)));
      }
    }

    const { channel } = this._getSlackConfig();
    const parent = await this.slackClient.chat.postMessage({
      channel,
      text: formatMessage(normalizedMessage, result),
    });
    const threadTs = requireString(parent && parent.ts, 'parent response ts');
    const comments = [];

    for (const text of commentTexts) {
      const comment = await this.slackClient.chat.postMessage({
        channel,
        text,
        thread_ts: threadTs,
      });
      comments.push(comment);
    }

    return { parent, comments };
  }
}

module.exports = { DevNotifier };
