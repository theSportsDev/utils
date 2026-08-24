# Logger 사용 가이드

공용 Logger는 의도적으로 단순한 API만 제공합니다.

```js
logger.debug('new user joined', user.mb_idx);
```

- 첫 번째 인자: 로그 메시지 문자열
- 두 번째 인자: 선택적인 단일 값
- 객체, 배열, 함수, `Error` 객체는 전달할 수 없음
- 이름, 연락처, 주소 등이 포함된 객체를 실수로 통째로 기록하는 상황을 차단
- 출력 문자열에 포함된 이메일, 전화번호, token 등은 최종 출력 전에 필터링

## 1. 설치

```bash
npm install @theSportsDev/utils
```

## 2. 서비스 Logger 만들기

일반 서비스는 서비스 이름만 지정하면 됩니다. `service`를 생략하면 `SERVICE_NAME`, 없으면 `unknown-service`를 사용하므로 서비스별 로그 구분을 위해 명시를 권장합니다.

`lib/logger.js`:

```js
'use strict';

const { LoggerFactory } = require('@theSportsDev/utils');

module.exports = LoggerFactory.create({
  // 권장: 서비스 이름
  service: 'membership-api',
});
```

환경과 배포 버전은 환경 변수에서 자동으로 읽습니다.

```dotenv
NODE_ENV=production
APP_VERSION=2026.08.24.1
```

- `env`: `NODE_ENV`, 없으면 `development`
- `version`: `APP_VERSION`, 없으면 `unknown`

ESM에서도 `create`에 서비스 이름을 직접 전달합니다.

```js
import { LoggerFactory } from '@theSportsDev/utils';

export const logger = LoggerFactory.create({
  // 권장: 서비스 이름
  service: 'membership-api',
});
```

## 3. 로그 출력

```js
const logger = require('./lib/logger');

logger.info('server started');
logger.debug('new user joined', user.mb_idx);
logger.warn('slow response detected', durationMs);
logger.error('database connection failed', error.code);
```

두 번째 값은 JSON 로그의 `value` 필드에 기록됩니다.

```json
{
  "level": "debug",
  "message": "new user joined",
  "value": 12345,
  "service": "membership-api",
  "env": "production",
  "version": "2026.08.24.1",
}
```

허용되는 두 번째 값:

```js
logger.info('member loaded', 12345);
logger.info('member loaded', 'member-12345');
logger.info('feature enabled', true);
logger.info('optional value', null);
```

허용되지 않는 입력:

```js
// 모두 TypeError
logger.info('member loaded', user);
logger.info('member loaded', { mb_idx: user.mb_idx });
logger.info('members loaded', users);
logger.error('request failed', error);
logger.info({ message: 'structured log' });
```

오류는 필요한 단일 값만 선택해서 기록하세요.

```js
try {
  await loadMember();
} catch (error) {
  logger.error('member load failed', error.code || error.message);
}
```

오류 메시지 자체에 개인정보가 들어갈 수 있다면 고정 메시지나 내부 오류 코드를 사용하세요.

```js
logger.error('member load failed', 'MEMBER_LOAD_FAILED');
```

## 4. Express 적용

`requestLoggerMiddleware`를 라우터보다 먼저 등록합니다.

```js
const express = require('express');
const { requestLoggerMiddleware } = require('@theSportsDev/utils');
const logger = require('./lib/logger');

const app = express();

app.use(requestLoggerMiddleware(logger));
app.use(express.json());

app.get('/members/:id', async (req, res) => {
  const member = await findMember(req.params.id);

  // req.log에는 request_id가 자동으로 연결됩니다.
  req.log.debug('member loaded', member.mb_idx);
  res.json(member);
});
```

미들웨어는 자동으로 다음 정보를 기록합니다.

- `request_id`
- HTTP method
- Express route template
- HTTP status
- 요청 처리 시간
- 요청 완료 또는 중단 여부

query, body, Authorization, Cookie, 원본 URL과 응답 body는 기록하지 않습니다.

외부 request ID를 신뢰해야 하는 환경에서는 검증된 프록시가 있는 경우에만 다음 옵션을 사용하세요.

```js
app.use(requestLoggerMiddleware(logger, { trustProxy: true }));
```

OpenTelemetry 또는 Datadog APM의 trace를 연결할 때만 `LoggerFactory.create` 인자에 `contextProvider`를 추가합니다. 반환하는 ID는 영문·숫자·점·밑줄·하이픈으로 구성된 128자 이하 문자열만 허용됩니다.

```js
const { LoggerFactory } = require('@theSportsDev/utils');

module.exports = LoggerFactory.create({
  service: 'membership-api',
  contextProvider: () => {
    const context = getActiveTraceContext();
    return context ? {
      trace_id: context.traceId,
      span_id: context.spanId,
    } : {};
  },
});
```

## 5. 개인정보 보호

객체 입력을 금지하는 것이 1차 보호 장치입니다. Logger에는 필요한 단일 식별자만 전달하세요.

```js
// 권장: 내부 비가역 ID
logger.debug('new user joined', user.mb_idx);

// 금지: 개인정보 객체
logger.debug('new user joined', user);

// 금지: 개인정보 필드
logger.debug('new user joined', user.name);
logger.debug('new user joined', user.mobile);
logger.debug('new user joined', user.address);
```

문자열에 포함된 이메일, 한국 전화번호, Bearer/JWT, 민감한 key-value 패턴은 `[REDACTED]`로 치환됩니다. 하지만 자동 필터에 의존해 개인정보를 전달해서는 안 됩니다.

## 6. 운영 환경

운영에서는 JSON stdout을 CloudWatch Logs가 수집하도록 구성합니다.

```text
서비스 JSON stdout
→ 소스 AWS 계정 CloudWatch Logs
→ 중앙 observability 계정
→ OpenSearch + S3
→ 향후 Datadog
```

애플리케이션에는 중앙 AWS 계정 자격증명이나 Datadog API key를 넣지 않습니다.

주요 검색 필드:

- `service`, `env`, `version`
- `request_id`, `trace_id`
- `level`, `message`, `value`
- `http.route`, `http.status_code`

## 7. 선택 설정

대부분의 서비스는 `service`만 설정하면 됩니다.

```js
const logger = LoggerFactory.create({ service: 'membership-api' });
```

필요한 경우에만 출력 관련 옵션을 `LoggerFactory.create` 인자에 추가하세요.

```js
const logger = LoggerFactory.create({
  service: 'membership-batch',
  level: 'info',
  format: 'json',
  logDir: './logs',
  maxFiles: '30d',
  maxSize: '20m',
  enableFile: true,
});
```

| 옵션 | 기본값 | 설명 |
| --- | --- | --- |
| `service` | `SERVICE_NAME` 또는 `unknown-service` | 서비스 이름(명시 권장) |
| `env` | `NODE_ENV` 또는 `development` | 실행 환경 |
| `version` | `APP_VERSION` 또는 `unknown` | 배포 버전 |
| `level` | 개발 `debug`, 그 외 `info` | 최소 로그 레벨 |
| `format` | 개발 `pretty`, 그 외 `json` | 콘솔 출력 형식 |
| `contextProvider` | 없음 | 활성 `trace_id`, `span_id` 제공 함수 |
| `logDir` | `null` | 로컬 파일 저장 경로 |
| `maxFiles` | `30d` | 파일 보관 기간 |
| `maxSize` | `20m` | 파일당 최대 크기 |
| `enableFile` | `logDir` 설정 여부 | 파일 로그 사용 여부 |

## 적용 체크리스트

- [ ] 서비스별 `LoggerFactory.create({ service: '...' })`를 만들었다.
- [ ] 로그 호출은 `message`와 선택적인 단일 값만 사용한다.
- [ ] 객체, 배열, `Error`를 Logger에 전달하지 않는다.
- [ ] 이름, 연락처, 이메일, 주소 대신 내부 비가역 ID를 사용한다.
- [ ] Express 요청에서는 `req.log`를 사용한다.
- [ ] 운영 로그는 JSON stdout으로 출력한다.
