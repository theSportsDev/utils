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
