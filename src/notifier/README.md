# Notifier

Slack 채널로 에러 알림, 서버 주요 로그, 스크립트 처리 결과를 발송하는 모듈입니다.

## 사용법

```js
// CommonJS
const { ErrorNotifier, DevNotifier } = require('@theSportsDev/utils');

// ESM
import { ErrorNotifier, DevNotifier } from '@theSportsDev/utils';

const devNotifier = new DevNotifier();
await devNotifier.post({
  message: '전북현대 경기 결과 안내 Push 성공',
  result: 'success',
});
```

## DevNotifier 생성자 옵션

`slackToken`과 `slackChannel`을 생략하면 각각 `SLACK_BOT_TOKEN`, `SLACK_CHANNEL` 환경변수를 사용합니다. 명시한 옵션이 환경변수보다 우선합니다.

| 옵션 | 환경변수 | 설명 |
| --- | --- | --- |
| `slackToken` | `SLACK_BOT_TOKEN` | Slack Bot Token |
| `slackChannel` | `SLACK_CHANNEL` | 발송할 채널 ID |

## DevNotifier

`DevNotifier`는 서버 로그와 스크립트 처리 결과를 단일 메시지 또는 스레드로 발송합니다.

```js
const { DevNotifier } = require('@theSportsDev/utils/notifier');

const notifier = new DevNotifier({
  slackToken: process.env.SLACK_BOT_TOKEN,
  slackChannel: process.env.SLACK_CHANNEL,
});

await notifier.post({
  message: '전북현대 경기 결과 안내 Push 성공',
  result: 'success',
});

await notifier.postThread({
  message: '경기 결과 Push 처리',
  result: 'fail',
  ts_msg1: '대상: 1,234명',
  ts_msg2: '실패 원인을 확인합니다.',
});
```

### `post({ message, result })`

- `message`는 필수 비공백 문자열입니다. 없거나 유효하지 않으면 오류를 기록하고 Slack에 발송하지 않습니다.
- 메시지에는 서울 시간 기준 `처리 날짜: YYYY-MM-DD HH:mm:ss`가 자동으로 붙습니다.
- `result`가 정확히 `'success'`면 `처리 결과: 성공 :짠:`, 정확히 `'fail'`면 `처리 결과: 실패 :rotating_light:`가 붙습니다. 그 외 값과 생략한 값은 처리 결과 줄을 추가하지 않습니다.

### `postThread({ message, result, ts_msg1, ts_msg2, ts_msg3 })`

- 부모 메시지 포맷은 `post`와 같습니다.
- `ts_msg1`은 필수 댓글이며 `ts_msg2`, `ts_msg3`은 선택 댓글입니다. 제공한 댓글은 비공백 문자열이어야 합니다.
- 댓글은 전달한 순서대로 부모 메시지의 같은 thread에 발송합니다. 반환값은 `{ parent, comments }`입니다.

사용자 입력의 Slack 전체 채널·사용자·사용자 그룹 멘션은 제거합니다. Slack date markup은 유지됩니다.

## ErrorNotifier

`ErrorNotifier`는 서버 오류를 Slack에 발송합니다. `slackToken`을 생략하면 `SLACK_BOT_TOKEN`을 사용하지만, `slackChannel`은 생성자에서 직접 전달해야 합니다.

| 옵션 | 기본값 | 설명 |
| --- | --- | --- |
| `slackToken` | `SLACK_BOT_TOKEN` | Slack Bot Token |
| `slackChannel` | 없음 | 메시지를 보낼 채널 ID |
| `targetService` | `'Unknown Service'` | 알림 메시지에 표기될 서비스 이름 |
| `serviceOwner` | `''` | 담당자 이름. 사내 멤버 맵에 있으면 Slack 멘션으로 변환됨 |

### `push({ error, message })`

| 인자 | 타입 | 설명 |
| --- | --- | --- |
| `error` | `Error` | 발송할 에러 객체. `Error` 인스턴스가 아니면 무시됨 |
| `message` | `string` | (선택) 부모 메시지 앞에 추가로 붙일 컨텍스트 문자열 |

발송 규칙:

- `error`가 `Error` 인스턴스가 아니거나 `error.status`가 500 미만이면 무시합니다. `status`가 없으면 500으로 처리합니다.
- 부모 메시지: `*[status]* *서비스명* 확인 필요 @담당자`
  - `message` 인자를 전달하면 부모 메시지 앞 줄에 추가됩니다.
- 스레드 답글: `error.message`, `error.stack`을 각각 코드블록으로 감싸 별도 메시지로 발송합니다.
- 메시지 안의 Slack 멘션(`@here`, `@channel`, 사용자·사용자 그룹 멘션)은 제거하고, 토큰·비밀번호·쿠키·API 키 등 인증 정보로 보이는 값은 `[REDACTED]`로 마스킹합니다.

### 담당자 멘션 규칙

- 내장 멤버 맵에 등록된 이름인 경우, **한국 시간 기준 평일(월–금) 08:00–19:00**에만 `<@SlackId>` 형태로 멘션됩니다.
- 그 외 시간/요일에는 이름 그대로 표기됩니다.
- 멤버 맵에 없는 이름은 항상 그대로 표기됩니다.

### 권장 패턴

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

## 실제 채널 발송 확인

저장소 루트 `.env`의 `SLACK_BOT_TOKEN`, `SLACK_CHANNEL`을 사용합니다. 셸 환경변수가 `.env`보다 우선합니다.

```bash
npm run test:dev-notifier:post
npm run test:dev-notifier:post -- '서버 로그 발송 확인'
npm run test:dev-notifier:post-thread
npm run test:dev-notifier:post-thread -- '처리 확인' '첫 댓글' '두 번째 댓글' '세 번째 댓글'
```

스레드 스크립트는 부모 메시지와 첫 댓글을 필수로 받고, 댓글은 최대 세 개까지 받습니다. 성공 시 메시지의 `ts` 식별자만 출력하며 토큰·채널·메시지는 출력하지 않습니다.
