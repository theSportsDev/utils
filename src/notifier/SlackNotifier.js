'use strict';

const { WebClient } = require('@slack/web-api');
const {
  formatScriptResultMessage,
  formatDeploymentResultMessage,
} = require('./messageFormatters');
const { sanitizeSlackMarkup } = require('./messageSafety');

function requireString(value, fieldName) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${fieldName} must be a non-empty string`);
  }

  return value.trim();
}

class SlackNotifier {
  constructor({ slackToken, slackChannel } = {}) {
    const token = slackToken === undefined ? process.env.SLACK_BOT_TOKEN : slackToken;
    const channel = slackChannel === undefined ? process.env.SLACK_CHANNEL : slackChannel;

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

  async push({ message } = {}) {
    const token = requireString(this.token, 'slackToken');
    const channel = requireString(this.channel, 'slackChannel');
    const text = sanitizeSlackMarkup(requireString(message, 'message'));

    return this.slackClient.chat.postMessage({ channel, text });
  }

  async postThread({ message, comments } = {}) {
    const token = requireString(this.token, 'slackToken');
    const channel = requireString(this.channel, 'slackChannel');
    const text = sanitizeSlackMarkup(requireString(message, 'message'));

    if (!Array.isArray(comments) || comments.length === 0) {
      throw new TypeError('comments must be a non-empty array');
    }

    const commentTexts = Array.from(comments, (comment, index) => (
      sanitizeSlackMarkup(requireString(comment, `comments[${index}]`))
    ));

    const parent = await this.slackClient.chat.postMessage({ channel, text });
    const threadTs = requireString(parent && parent.ts, 'parent response ts');
    const commentResponses = [];

    for (const commentText of commentTexts) {
      const comment = await this.slackClient.chat.postMessage({
        channel,
        text: commentText,
        thread_ts: threadTs,
      });
      commentResponses.push(comment);
    }

    return { parent, comments: commentResponses };
  }

  notifyScriptResult(options) {
    return this.push({ message: formatScriptResultMessage(options) });
  }

  notifyDeploymentResult(options) {
    return this.push({ message: formatDeploymentResultMessage(options) });
  }
}

module.exports = {
  SlackNotifier,
  formatScriptResultMessage,
  formatDeploymentResultMessage,
};
