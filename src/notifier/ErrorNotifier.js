'use strict';

const { WebClient } = require('@slack/web-api');

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
  SLACK_BOT_TOKEN: 'xoxb-1250645255394-11012406659139-DboqhWy6CcpVxaYI9nJKsNRP',
  worksHour: { days: [1, 2, 3, 4, 5], startHour: 8, endHour: 19 },
};

class ErrorNotifier {
  constructor({ targetService, serviceOwner, slackChannel } = {}) {
    this.targetService = targetService || 'Unknown Service';
    this.serviceOwner = serviceOwner || '';
    this.token = config.SLACK_BOT_TOKEN;
    this.channel = slackChannel;
    this.slackClient = new WebClient(this.token);
  }

  /** owner을 슬랙 멘션으로 변환하는 메서드 */
  _mapOwnerToSlackId(owner) {
    if (!owner) return '';

    // owner가 MEMBER_MAP에 있으면 멘션, 없으면 그냥 이름 노출
    const slackId = MEMBER_MAP.get(owner);
    if (!slackId) return owner;

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

  /** value를 ```value``` 형태(code block)로 감싸는 메서드 */
  _wrappedInCodeFence(value) {
    const strValue = this._toStringSafe(value);
    if (!strValue) return '';
    const CODE_FENCE = '```';
    return `${CODE_FENCE}${strValue}${CODE_FENCE}`;
  }

  /** Slack 메시지를 게시하는 메서드 */
  _postSlackMessage({ channel, message, isMentionUser, thread_ts }) {
    if (!channel) {
      console.error('Required slack channel to post message');
      return;
    }
    // doc: https://docs.slack.dev/reference/methods/chat.postMessage/
    return this.slackClient.chat.postMessage({
      channel,
      text: message,
      link_names: isMentionUser ? 1 : 0, // 멘션이 포함된 메시지는 link_names=1로 설정하여 멘션이 제대로 작동하도록 함
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
    const errorMessage = this._toStringSafe(error?.message);
    const errorStack = this._toStringSafe(error?.stack);

    const payload = {
      channel: this.channel,
      isMentionUser: Boolean(owner),
      message: `*[${statusCode}]* *${this.targetService}* 확인 필요 ${owner}`,
    };

    // 추가 메시지가 있으면 에러 메시지 앞에 추가
    if (message) {
      payload.message = this._toStringSafe(message) + `\n` + payload.message;
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
