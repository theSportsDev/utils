# Notifier

Slack 채널로 에러 알림을 발송하는 모듈. `ErrorNotifier` 클래스를 직접 인스턴스화해 사용합니다.

## 사용법

```js
// CommonJS
const { ErrorNotifier } = require('@theSportsDev/utils');

// ESM
import { ErrorNotifier } from '@theSportsDev/utils';

module.exports = new ErrorNotifier({
  slackChannel: process.env.SLACK_ALERT_CHANNEL,
  targetService: 'FC xxx API 서버',
  serviceOwner: '홍길동',
});

await notifier.push({ error });
```

## 생성자 옵션

모든 옵션은 선택값입니다. `token` / `channel`을 생략하면 환경변수에서 fallback으로 읽습니다.

| 옵션      | 기본값                                     | 설명                                                       |
| --------- | ------------------------------------------ | ---------------------------------------------------------- |
| `slackChannel` | `process.env.SLACK_CHANNEL_ERROR_NOTIFY`   | 메시지를 보낼 채널 ID                                      |
| `targetService` | `'Unknown Service'`                        | 알림 메시지에 표기될 서비스 이름                           |
| `serviceOwner`   | `''`                                       | 담당자 이름. 사내 멤버 맵에 있으면 Slack 멘션으로 변환됨   |

## `post({ error, message })`

| 인자      | 타입     | 설명                                                                  |
| --------- | -------- | --------------------------------------------------------------------- |
| `error`   | `Error`  | 발송할 에러 객체. `Error` 인스턴스가 아니면 무시됨                    |
| `message` | `string` | (선택) 부모 메시지 앞에 추가로 붙일 컨텍스트 문자열                   |

발송 규칙:

- `error`가 `Error` 인스턴스가 아니거나 `error.status < 500`이면 무시합니다.
- 부모 메시지: `*[status]* *서비스명* 확인 필요 @담당자`
  - `message` 인자를 전달하면 부모 메시지 앞 줄에 추가됩니다.
- 스레드 답글: `error.message`, `error.stack`을 각각 코드블록으로 감싸 별도 메시지로 발송합니다.

## 담당자 멘션 규칙

- 내장 멤버 맵에 등록된 이름인 경우, **한국 시간 기준 평일(월–금) 08:00–19:00**에만 `<@SlackId>` 형태로 멘션됩니다.
- 그 외 시간/요일에는 이름 그대로 표기됩니다.
- 멤버 맵에 없는 이름은 항상 그대로 표기됩니다.

## 권장 패턴

설정값을 한 번 바인딩한 인스턴스를 모듈로 export 해 재사용하세요.

```js
// config/notifier.js
const { ErrorNotifier } = require('@theSportsDev/utils');

module.exports = new ErrorNotifier({
  slackChannel: process.env.SLACK_ALERT_CHANNEL,
  targetService: 'FC xxx API 서버',
  serviceOwner: '홍길동',
});

// 다른 모듈
const notifier = require('./config/notifier');
await notifier.push({ error });
```
