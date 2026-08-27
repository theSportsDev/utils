# Logger

Winston 기반 로거. 즉시 사용 가능한 기본 인스턴스와, 커스텀 설정용 팩토리를 함께 제공합니다.

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

### Express HTTP 로깅 (Morgan)

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
