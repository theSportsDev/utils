# @theSportsDev/utils

Platformn 사내 공통 유틸리티 라이브러리.

## 설치

패키지를 설치하기 전에 아래 레지스트리 설정이 필요합니다.

**1) 프로젝트 루트 `.npmrc`에 레지스트리 추가**

```
@theSportsDev:registry=https://npm.pkg.github.com
```

**2) GitHub Personal Access Token 설정** (`read:packages` 권한 필요)

```bash
# ~/.npmrc 에 추가 (전역 설정 — 커밋하지 마세요)
echo "//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN" >> ~/.npmrc
```

**3) 설치**

```bash
npm install @theSportsDev/utils
```

---

## Logger

Morgan + Winston 기반 로거. 싱글턴으로 동작하며 앱 전체에서 동일한 인스턴스를 공유합니다.

### 기본 사용

```js
// CommonJS
const { logger, morganMiddleware } = require('@theSportsDev/utils');

// ESM
import { logger, morganMiddleware } from '@theSportsDev/utils';
```

### 초기화 (선택)

`init()`을 호출하지 않으면 기본값으로 자동 초기화됩니다.

```js
logger.init({
  env: 'production', // 기본값: process.env.NODE_ENV || 'development'
  level: 'info', // 기본값: development → 'debug', 그 외 → 'info'
  format: 'json', // 기본값: development → 'pretty', 그 외 → 'json'
  logDir: './logs', // 기본값: './logs'  (실제 경로: ./logs/{env}/)
  maxFiles: '30d', // 기본값: '30d'
  maxSize: '20m', // 기본값: '20m'
  enableFile: true, // 기본값: true
});
```

> `init()`은 앱 시작 시 한 번만 호출하세요. 이후 호출은 무시됩니다.

### 로그 레벨

```
verbose < debug < http < info < warn < error
```

### 로그 출력

문자열과 객체(JSON) 모두 사용 가능합니다.

```js
// 문자열
logger.info('서버가 시작되었습니다');
logger.warn('디스크 사용량이 높습니다');
logger.error('데이터베이스 연결 실패');
logger.debug('쿼리 실행됨');

// 객체 (구조화된 로그)
logger.info({ event: 'user.login', userId: 123, ip: '1.2.3.4' });

// 문자열 + 메타데이터
logger.info('사용자 로그인', { userId: 123, ip: '1.2.3.4' });

// Error 객체
logger.error(new Error('예상치 못한 오류'));
logger.error('결제 실패', { orderId: 456, reason: 'timeout' });
```

### 모듈별 컨텍스트 (child logger)

싱글턴을 공유하면서 모듈명 등 고정 필드를 자동으로 추가할 수 있습니다.

```js
const log = logger.child({ module: 'auth' });
log.info('로그인 성공', { userId: 1 });
// → { message: '로그인 성공', module: 'auth', userId: 1, env: '...', ... }

// 중첩도 가능
const dbLog = log.child({ layer: 'db' });
dbLog.debug('쿼리 실행', { sql: 'SELECT ...' });
// → { module: 'auth', layer: 'db', sql: 'SELECT ...', ... }
```

### Express HTTP 로깅 (Morgan)

```js
const express = require('express');
const { logger, morganMiddleware } = require('@theSportsDev/utils');

const app = express();

// 기본값: 'combined' 포맷
app.use(morganMiddleware());

// Morgan 포맷 변경
app.use(morganMiddleware({ format: 'dev' }));
app.use(morganMiddleware({ format: ':method :url :status :response-time ms' }));
```

---

## 파일 저장 구조

`enableFile: true`(기본값)일 때 아래 경로에 저장됩니다.

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
const { logger, morganMiddleware } = require('@theSportsDev/utils');

logger.init({ env: process.env.NODE_ENV });

const app = express();

app.use(morganMiddleware());

app.get('/', (req, res) => {
  logger.info('루트 요청 처리됨', { requestId: req.headers['x-request-id'] });
  res.send('ok');
});

app.listen(3000, () => {
  logger.info('서버 시작', { port: 3000 });
});
```

---

## Datadog 연동 (추후)

```js
logger.init({
  env: 'production',
  datadog: {
    apiKey: process.env.DD_API_KEY,
    service: 'my-service',
  },
});
```

> `datadog-winston` 패키지 설치 및 `src/implementations/winston/transports/datadog.js` 활성화 필요. 주석 내 가이드를 참고하세요.

## 배포

main 브랜치에 머지되면 GitHub Actions가 자동으로 GitHub Packages에 배포합니다.

### 배포 절차

**1) `package.json`의 버전을 올린다**

```bash
npm version patch   # 0.1.0 → 0.1.1  (버그 수정)
npm version minor   # 0.1.0 → 0.2.0  (기능 추가)
npm version major   # 0.1.0 → 1.0.0  (Breaking change)
```

**2) PR을 열고 main에 머지한다**

머지 시 GitHub Actions가 자동으로 실행됩니다.

```
PR 머지 → main push → GitHub Actions
  → 현재 버전이 이미 배포됐는지 확인
  → 새 버전이면 npm publish
  → 동일 버전이면 skip (에러 없이 통과)
```

> 버전을 올리지 않고 머지해도 배포 step이 skip될 뿐 CI는 정상 통과합니다.

### 로컬에서 수동 배포 (긴급 시)

```bash
npm publish
```

> 로컬 배포 시 `~/.npmrc`에 `write:packages` 권한을 가진 GitHub Token이 설정되어 있어야 합니다.
