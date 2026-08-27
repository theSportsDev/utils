# Notifier

Slack 채널로 에러·작업·배포 알림을 발송하는 모듈입니다.

## 사용법

```js
// CommonJS
const { ErrorNotifier, SlackNotifier } = require('@theSportsDev/utils');

// ESM
import { ErrorNotifier, SlackNotifier } from '@theSportsDev/utils';

const errorNotifier = new ErrorNotifier({
  slackChannel: process.env.SLACK_ALERT_CHANNEL,
  targetService: 'FC xxx API 서버',
  serviceOwner: '홍길동',
});

await errorNotifier.push({ error });

const slackNotifier = new SlackNotifier();
await slackNotifier.notifyScriptResult({
  targetService: '수원 삼성',
  taskName: '경기결과 업데이트',
  success: true,
});
```

## 생성자 옵션

모든 옵션은 선택값입니다. `slackToken`을 생략하면 `SLACK_BOT_TOKEN` 환경변수를 사용합니다. ErrorNotifier의 채널은 기존처럼 생성자에서 직접 전달합니다.

| 옵션      | 기본값                                     | 설명                                                       |
| --------- | ------------------------------------------ | ---------------------------------------------------------- |
| `slackToken` | `process.env.SLACK_BOT_TOKEN`   | Slack Bot Token                                      |
| `slackChannel` | 없음   | 메시지를 보낼 채널 ID                                      |
| `targetService` | `'Unknown Service'`                        | 알림 메시지에 표기될 서비스 이름                           |
| `serviceOwner`   | `''`                                       | 담당자 이름. 사내 멤버 맵에 있으면 Slack 멘션으로 변환됨   |

## `push({ error, message })`

| 인자      | 타입     | 설명                                                                  |
| --------- | -------- | --------------------------------------------------------------------- |
| `error`   | `Error`  | 발송할 에러 객체. `Error` 인스턴스가 아니면 무시됨                    |
| `message` | `string` | (선택) 부모 메시지 앞에 추가로 붙일 컨텍스트 문자열                   |

발송 규칙:

- `error`가 `Error` 인스턴스가 아니거나 `error.status < 500`이면 무시합니다.
- 부모 메시지: `*[status]* *서비스명* 확인 필요 @담당자`
  - `message` 인자를 전달하면 부모 메시지 앞 줄에 추가됩니다.
- 스레드 답글: `error.message`, `error.stack`을 각각 코드블록으로 감싸 별도 메시지로 발송합니다.

## SlackNotifier

`SlackNotifier`는 일반 메시지, 스크립트 결과, 배포 결과를 발송합니다. 생성자 옵션은 환경변수보다 우선합니다.

| 옵션 | 환경변수 | 설명 |
| --- | --- | --- |
| `slackToken` | `SLACK_BOT_TOKEN` | Slack Bot Token |
| `slackChannel` | `SLACK_CHANNEL` | 발송할 채널 ID |

```js
const { SlackNotifier, formatDeploymentResultMessage } = require('@theSportsDev/utils/notifier');

const notifier = new SlackNotifier({
  slackToken: process.env.SLACK_BOT_TOKEN,
  slackChannel: process.env.SLACK_CHANNEL,
});

await notifier.push({ message: '작업을 시작합니다.' });
await notifier.postThread({
  message: '배포 후 확인이 필요합니다.',
  comments: ['헬스 체크를 시작합니다.', '모니터링 결과를 공유합니다.'],
});
await notifier.notifyDeploymentResult({
  environment: 'release',
  targetService: '수원삼성',
  serviceType: 'API',
  success: true,
});

formatDeploymentResultMessage({
  environment: 'release',
  targetService: '수원삼성',
  serviceType: 'WEB',
  success: false,
});
```

`postThread({ message, comments })`는 부모 메시지를 먼저 발송하고, `comments`의 각 메시지를 해당 부모 메시지의 스레드에 입력 순서대로 추가합니다. `comments`는 비어 있지 않은 문자열 배열이어야 하며, 반환값에는 부모 응답과 각 댓글 응답이 `{ parent, comments }` 형태로 포함됩니다.

`formatScriptResultMessage({ targetService, taskName, success })`와 `formatDeploymentResultMessage({ environment, targetService, serviceType, success })`는 메시지만 만들며, 모든 필수 문자열은 공백을 제거한 뒤 비어 있으면 거부합니다. `success`는 boolean이어야 하고 `serviceType`은 `WEB` 또는 `API`만 허용합니다.

## 실제 채널 발송 확인

테스트용 발송 스크립트는 저장소 루트의 `.env`에서 봇 토큰과 채널 ID를 자동으로 읽습니다. 셸 환경변수로 설정한 값은 `.env` 값보다 우선합니다.

```bash
# .env
SLACK_BOT_TOKEN='xoxb-...'
SLACK_CHANNEL='C0123456789'

npm run test:slack:post
npm run test:slack:post -- '배포 알림 발송 확인'
npm run test:slack:post-thread
npm run test:slack:post-thread -- '배포 확인' '서버 확인 완료' '모니터링 시작'
```

`test:slack:post`는 인자를 하나의 메시지로 합쳐 발송하며, 메시지를 생략하면 `[TEST] Hello world!`를 발송합니다. `test:slack:post-thread`는 첫 번째 인자를 부모 메시지로, 나머지 인자를 스레드 댓글로 발송합니다. 인자를 생략하면 기본 부모 메시지와 댓글 두 개를 발송하며, 부모 메시지만 지정하면 발송하지 않고 실패합니다. 성공 시 발송 순서대로 Slack 메시지의 `ts` 식별자만 출력하며, 토큰·채널·메시지는 출력하지 않습니다.

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
