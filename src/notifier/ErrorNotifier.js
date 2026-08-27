'use strict';

const { WebClient } = require('@slack/web-api');
const env = require('../env');
const { sanitizeSlackMarkup } = require('./messageSafety');

const MEMBER_MAP = new Map([
  ['배지훈', 'U02196V2EH3'],
  ['이슬', 'U021QT7DL81'],
  ['김소정', 'U05HN8194L9'],
  ['오선화', 'U03SPQUP8F8'],
  ['모영진', 'U0APHC4C4UD'],
  ['김여명', 'U09KXN1P2JX'],
  ['김혜진', 'U0A4WKVSC1L'],
  ['이찬호', 'U03SPQV1H7G'],
]);

const config = {
  worksHour: { days: [1, 2, 3, 4, 5], startHour: 8, endHour: 19 },
};
const SENSITIVE_KEY_PATTERN = '(?:token|authorization|cookie|password|(?:access|refresh)[_-]?token|api[_-]?key|client[_-]?secret)';
const SENSITIVE_VALUE_PATTERN = new RegExp(
  `((?:\\\\?["']?\\b${SENSITIVE_KEY_PATTERN}\\b\\\\?["']?)\\s*[:=]\\s*)([\\s\\S]*?)(?=(?:\\s+(?:\\\\?["']?\\b${SENSITIVE_KEY_PATTERN}\\b\\\\?["']?)\\s*[:=])|\\r?\\n|$)`,
  'gi',
);

class ErrorNotifier {
  constructor({ targetService, serviceOwner, slackToken, slackChannel } = {}) {
    this.targetService = targetService || 'Unknown Service';
    this.serviceOwner = serviceOwner || '';
    const token = slackToken === undefined ? env.devNotifierSlackToken : slackToken;
    this.channel = slackChannel;
    Object.defineProperties(this, {
      token: {
        configurable: true,
        enumerable: false,
        value: token,
        writable: true,
      },
      slackClient: {
        configurable: true,
        enumerable: false,
        value: new WebClient(token),
        writable: true,
      },
    });
  }

  /** owner을 슬랙 멘션으로 변환하는 메서드 */
  _mapOwnerToSlackId(owner) {
    if (!owner) return '';

    // owner가 MEMBER_MAP에 있으면 멘션, 없으면 그냥 이름 노출
    const slackId = MEMBER_MAP.get(owner);
    if (!slackId) return sanitizeSlackMarkup(owner);

    // 한국 시간 기준으로 근무 시간 내면 멘션, 아니면 이름만 노출
    const { days, startHour, endHour } = config.worksHour;
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const inWorks =
      days.includes(now.getDay()) && now.getHours() >= startHour && now.getHours() < endHour;

    return inWorks ? `<@${slackId}>` : owner;
  }

  /** value를 문자열로 안전하게 변환하는 메서드 */
  _toStringSafe(value) {
    if (Object.is(value, undefined) || Object.is(value, null)) return '';
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2);
      } catch (e) {
        return String(value);
      }
    }
    return String(value);
  }

  /** 메시지 안의 인증 정보를 마스킹하는 메서드 */
  _redactSensitiveValues(value) {
    const stringValue = this._toStringSafe(value);
    return stringValue.replace(SENSITIVE_VALUE_PATTERN, '$1[REDACTED]');
  }

  /** Slack 특수 멘션을 제거하는 메서드 */
  _sanitizeSlackMessage(value) {
    return sanitizeSlackMarkup(this._redactSensitiveValues(value));
  }

  /** value를 ```value``` 형태(code block)로 감싸는 메서드 */
  _wrappedInCodeFence(value) {
    const strValue = this._sanitizeSlackMessage(value);
    if (!strValue) return '';
    const CODE_FENCE = '```';
    return `${CODE_FENCE}${strValue}${CODE_FENCE}`;
  }

  /** Slack 메시지를 게시하는 메서드 */
  _postSlackMessage({ channel, message, thread_ts }) {
    if (!channel) {
      console.error('Required slack channel to post message');
      return;
    }
    // doc: https://docs.slack.dev/reference/methods/chat.postMessage/
    return this.slackClient.chat.postMessage({
      channel,
      text: message,
      thread_ts,
    });
  }

  /** 에러 알림을 보내는 메서드 */
  async push({ error, message } = {}) {
    // error가 아니거나 status가 500 이상이 아니면 알림 보내지 않기
    if (!(error instanceof Error) || error?.status < 500) return;

    if (!this.channel) {
      console.error('Required slack channel to post message');
      return;
    }

    const owner = this._mapOwnerToSlackId(this.serviceOwner);

    const statusCode = error?.status ? this._toStringSafe(error?.status) : '500';
    const errorMessage = this._sanitizeSlackMessage(error?.message);
    const errorStack = this._sanitizeSlackMessage(error?.stack);

    const payload = {
      channel: this.channel,
      message: `*[${this._sanitizeSlackMessage(statusCode)}]* *${this._sanitizeSlackMessage(this.targetService)}* 확인 필요 ${owner}`,
    };

    // 추가 메시지가 있으면 에러 메시지 앞에 추가
    if (message) {
      payload.message = this._sanitizeSlackMessage(message) + `\n` + payload.message;
    }

    // 에러 메시지 첫 메시지 게시는 멘션 포함, 이후 메시지는 스레드 게시
    const parent = await this._postSlackMessage(payload);

    const threadTs = parent.ts;
    if (!threadTs) return;

    if (errorMessage) {
      await this._postSlackMessage({
        channel: this.channel,
        thread_ts: threadTs,
        message: `error message=\n` + this._wrappedInCodeFence(errorMessage),
      });
    }

    if (errorStack) {
      await this._postSlackMessage({
        channel: this.channel,
        thread_ts: threadTs,
        message: `error stack=\n` + this._wrappedInCodeFence(errorStack),
      });
    }
  }
}

module.exports = { ErrorNotifier };
