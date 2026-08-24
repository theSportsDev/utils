# Logger

Winston 기반 로거. 즉시 사용 가능한 기본 인스턴스와, 커스텀 설정용 팩토리를 함께 제공합니다.

운영 환경에서는 JSON stdout을 기본 수집 경로로 사용하세요. 이 패키지는 AWS 또는 Datadog 자격증명을 보관하거나 로그를 직접 전송하지 않습니다. 따라서 모든 서비스는 같은 안전한 출력 형식으로 로그를 남기고, 인프라에서 중앙 수집 대상으로 전달할 수 있습니다.

### 빠른 시작

기본 `logger`를 가져와 바로 사용하면 됩니다. 콘솔 전용으로 동작합니다.

```js
// CommonJS
const { logger } = require('@theSportsDev/utils');

// ESM
import { logger } from '@theSportsDev/utils';

logger.info('서버가 시작되었습니다');
logger.error('데이터베이스 연결 실패');
```

기본 `logger`는 옵션 없이 생성되며 `NODE_ENV`에 따라 다음과 같이 설정됩니다.

| 항목         | `NODE_ENV === 'development'` (또는 미설정) | 그 외 (`production` 등) |
| ------------ | ------------------------------------------ | ----------------------- |
| `format`     | `'pretty'`                                 | `'json'`                |
| `enableFile` | `false` (콘솔 전용)                        | `false` (콘솔 전용)     |

파일 저장이나 다른 옵션을 바꾸려면 아래의 `LoggerFactory.create()`를 사용하세요.

### 커스텀 인스턴스 (파일 저장 등)

파일 로깅이 필요하면 `LoggerFactory.create()`로 직접 만들면 됩니다. `logDir`을 전달하면 파일 로깅이 자동으로 켜집니다.

```js
const { LoggerFactory } = require('@theSportsDev/utils');

const logger = LoggerFactory.create({
  logDir: './logs',
  maxFiles: '30d',
  maxSize: '20m',
});
```

전체 옵션:

`NODE_ENV`는 현재 실행 디렉터리(`process.cwd()`)의 `.env`에서 자동으로 읽습니다. 셸의 `process.env.NODE_ENV`가 `.env`보다 우선하며, 둘 다 없거나 빈 문자열이면 `'development'`를 사용합니다.

| 옵션         | 기본값                                                | 설명                                                                                |
| ------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `env`        | `process.env.NODE_ENV \|\| 'development'`             | 환경 이름. 로그 라인과 디렉토리 경로에 사용됨                                       |
| `level`      | development → `'debug'`, 그 외 → `'info'`             | 출력할 최소 로그 레벨                                                               |
| `format`     | development → `'pretty'`, 그 외 → `'json'`            | 콘솔 포맷 (`'json'` \| `'pretty'`). 파일은 항상 JSON                                |
| `logDir`     | `null`                                                | 로그 파일 저장 경로. 전달 시 `enableFile`이 자동으로 `true`가 됨                    |
| `enableFile` | `logDir`이 있으면 `true`, 없으면 `false`              | 파일 저장 여부. 명시적으로 `true`인데 `logDir`이 없으면 경고 후 비활성화됨          |
| `maxFiles`   | `'30d'`                                               | 보관 기간 (winston-daily-rotate-file)                                               |
| `maxSize`    | `'20m'`                                               | 단일 파일 최대 크기                                                                 |
| `service`    | `SERVICE_NAME \|\| 'unknown-service'`                | Datadog unified service tagging과 호환되는 서비스 이름                              |
| `version`    | `APP_VERSION \|\| 'unknown'`                          | 배포 버전                                                                           |
| `source`     | `'nodejs'`                                            | 로그 생성 소스                                                                      |
| `contextProvider` | 없음                                             | 로그마다 `trace_id`, `span_id` 등을 반환하는 선택적 함수                            |
| `redaction`  | `{}`                                                  | 추가로 가릴 키(`additionalKeys`)와 경로(`additionalPaths`)                          |
| `attributePaths` | `[]`                                               | `meta.attributes` 기준으로 허용할 서비스별 leaf 경로(최대 깊이 4). 문자열·숫자·불리언·Date·Error만 기록 |

전사 공용 설정 예시:

```js
const logger = LoggerFactory.create({
  service: 'membership-api',
  env: process.env.NODE_ENV,
  version: process.env.APP_VERSION,
  source: 'nodejs',
  contextProvider: () => ({ trace_id: getTraceId(), span_id: getSpanId() }),
  redaction: {
    additionalKeys: ['MB_NAME'],
    additionalPaths: ['member.profile.nickname'],
  },
  attributePaths: ['result_count', 'diagnostics.occurredAt'],
});
```

각 이벤트에는 `schemaVersion`, `timestamp`, `status`, `level`, `message`, `service`, `env`, `version`, `source`가 기록됩니다. `request_id`, `trace_id`, `span_id`, `event`, `module`, `operation`, `duration_ms`, `http`, `error`, `attributes`를 사용해 검색 가능한 디버깅 컨텍스트를 추가할 수 있습니다. 서비스별 필드는 반드시 `meta.attributes`에 넣고 `attributePaths`에 선언하세요. 경로는 안전한 식별자 세그먼트만 사용하며 `__proto__`, `prototype`, `constructor`는 거부됩니다. 선언하지 않은 meta·context·attributes는 열거하거나 출력하지 않습니다. 이전 API 호환을 위해 일부 기존 필드(`userId` 등)는 최상위에 유지될 수 있지만, 신규 필드는 최상위에 추가하지 마세요.

비밀번호, 토큰, 쿠키, 인증 헤더, 이름, 연락처, 이메일, 주소, 생년월일 계열 키와 이메일·전화번호·Bearer/JWT 문자열은 출력 전에 `[REDACTED]`로 치환됩니다. 이 필터는 최종 출력 보호막이며, request body·query·Authorization·Cookie·응답 body 자체를 로그에 전달하지 않는 것이 원칙입니다.

### 로그 레벨

```
verbose < debug < http < info < warn < error
```

### 입력 형식

```js
// 문자열
logger.info('서버가 시작되었습니다');

// 문자열 + 메타데이터
logger.info('사용자 로그인', { userId: 123, ip: '1.2.3.4' });

// 구조화 객체
logger.info({ event: 'user.login', userId: 123 });

// Error 객체 — message와 stack이 자동 추출됨
logger.error(new Error('예상치 못한 오류'));
logger.error(new Error('결제 실패'), { orderId: 456 });
```

### 모듈별 컨텍스트 (child logger)

```js
const authLogger = logger.child({ module: 'auth' });
authLogger.info('로그인 성공', { userId: 1 });
// → { message: '로그인 성공', module: 'auth', userId: 1, ... }

// 중첩도 가능
const dbLogger = authLogger.child({ layer: 'db' });
dbLogger.debug('쿼리 실행', { sql: 'SELECT ...' });
```

### Express HTTP 로깅

`requestLoggerMiddleware`는 기본적으로 외부의 request/trace ID를 신뢰하지 않고 새 ID를 생성해 `req.log`에 연결합니다. 검증된 프록시가 ID를 주입하는 환경에서만 `{ trustProxy: true }` 또는 `{ trustIncomingIds: true }`를 명시하세요. 응답 완료·연결 종료·중단 중 첫 이벤트에만 method, route template, status, duration을 기록하며 query·body·header는 기록하지 않습니다.

```js
const { logger, requestLoggerMiddleware } = require('@theSportsDev/utils');

app.use(requestLoggerMiddleware(logger));
app.get('/members/:id', (req, res) => {
  req.log.info('회원 조회 완료', { event: 'member.read', memberId: req.params.id });
  res.sendStatus(200);
});
```

`morganMiddleware`는 기존 호환성을 위해 유지되지만 deprecated입니다. 기본 포맷은 URL, referrer, user-agent를 포함하지 않습니다. 구조화된 HTTP 로그에는 새 미들웨어를 사용하세요.

```js
const express = require('express');
const { logger, morganMiddleware } = require('@theSportsDev/utils');

const app = express();

// 기본값: 'combined' 포맷. 첫 번째 인자로 사용할 로거 인스턴스를 전달
app.use(morganMiddleware(logger));

// 포맷 변경
app.use(morganMiddleware(logger, { format: 'dev' }));
app.use(morganMiddleware(logger, { format: ':method :url :status :response-time ms' }));
```

## 중앙 수집과 Datadog 확장

애플리케이션은 JSON stdout만 출력하고, 소스 AWS 계정의 CloudWatch Logs에서 중앙 observability 계정의 cross-account subscription으로 전달합니다. 중앙 Firehose/Lambda 정제 계층에서 2차 redaction과 AWS 출처(account, region, log group, stream)를 부여한 뒤 OpenSearch와 KMS 암호화 S3로 fan-out하세요. OpenSearch에서는 `service`, `env`, `version`, `request_id`, `trace_id`, `error.fingerprint`, `http.route`를 facet/saved query로 사용하고, 서비스별 `attributes`는 mapping explosion을 막기 위해 `flat_object` 또는 비인덱스 필드로 매핑하세요.

중앙 processor는 스키마 또는 redaction 검증 실패 시 원문을 OpenSearch, S3, Datadog, DLQ에 전달하지 말고 최소 진단 이벤트만 기록하는 fail-closed 정책을 적용해야 합니다. 소스 계정은 지정된 destination에 구독을 생성하는 최소 권한만 갖고, 중앙 계정만 Firehose·S3·OpenSearch·KMS와 Datadog secret을 사용할 수 있게 IAM 역할을 분리하세요. 수집 계정·리전·로그 그룹은 앱이 보낸 필드가 아닌 AWS 전달 메타데이터에서만 부여합니다.

Datadog 도입 시에는 같은 중앙 정제 이벤트에 Firehose Datadog destination을 추가합니다. 이 스키마의 `service`, `env`, `version`, `source`, `status`, `trace_id`, `span_id`가 그대로 Datadog의 unified tagging 및 log-trace correlation에 사용됩니다. Datadog API key는 중앙 계정의 Secrets Manager에만 두고, 애플리케이션이나 소스 계정에는 배포하지 마세요.

RDS 로그는 별도 파이프라인과 보존 정책으로 운영하며 MySQL error 로그만 기본 수집합니다. general query 로그는 개인정보 노출 위험 때문에 사용하지 않습니다.

---

## 파일 저장 구조

`logDir`을 전달했을 때 아래 경로에 저장됩니다.

```
{logDir}/
└── {env}/
    ├── YYYY-MM-DD-combined.log   # 전체 레벨
    └── YYYY-MM-DD-error.log      # error 레벨만
```

파일은 항상 JSON 형식으로 저장됩니다 (콘솔 `format` 설정과 무관).

---

## 출력 포맷

| format   | 출력 예시                                                                                 |
| -------- | ----------------------------------------------------------------------------------------- |
| `pretty` | `2024-01-01 12:00:00 [production] info: 서버 시작 {"port":3000}`                          |
| `json`   | `{"timestamp":"...","level":"info","message":"서버 시작","port":3000,"env":"production"}` |

---

## Express 앱 예시 (전체)

```js
const express = require('express');
const { LoggerFactory, morganMiddleware } = require('@theSportsDev/utils');

const logger = LoggerFactory.create({ logDir: process.env.LOG_PATH });

const app = express();
app.use(morganMiddleware(logger));

app.get('/', (req, res) => {
  logger.info('루트 요청 처리됨', { requestId: req.headers['x-request-id'] });
  res.send('ok');
});

app.listen(3000, () => {
  logger.info('서버 시작', { port: 3000 });
});
```
