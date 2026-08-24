'use strict';

/**
 * Logger 사용 가이드 — 스펙 문서 역할을 하는 테스트 파일
 *
 * 이 파일을 읽으면 Logger를 어떻게 생성하고, 어떤 방식으로 로그를 남기며,
 * 파일에 어떻게 저장되는지 전체 사용법을 파악할 수 있습니다.
 *
 * 기본 사용 예시:
 *   // config/logger.js
 *   const { LoggerFactory } = require('@theSportsDev/utils');
 *   module.exports = LoggerFactory.create({ logDir: process.env.LOG_PATH });
 *
 *   // 다른 모듈
 *   const logger = require('./config/logger');
 *   logger.info('서버가 시작되었습니다', { port: 3000 });
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const EventEmitter = require('events');
const { execFileSync } = require('child_process');

const { LoggerFactory } = require('../../src/index.cjs');
const { Logger } = require('../../src/logger/logger');
const { requestLoggerMiddleware } = require('../../src/index.cjs');

// 로컬 타임존 기준 YYYY-MM-DD (winston-daily-rotate-file의 기본 동작과 일치)
function localYyyyMmDd(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 가장 마지막의 로그(JSON)만 추출하는 함수
// JSON 이 한 줄 씩 추가되는 로그를 테스트하는 과정에서 마지막 개행때문에 테스트가 실패할 것을 방지
function readLastNonEmptyLine(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.length ? lines[lines.length - 1] : '';
}

// 파일이 생성되고 최소 1바이트 이상 기록될 때까지 최대 timeout ms 대기
function waitForFile(filePath, timeout = 2000, minSize = 1) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function check() {
      if (fs.existsSync(filePath)) return resolve();
      if (Date.now() - start > timeout)
        return reject(new Error(`File not created within ${timeout}ms: ${filePath}`));
      setTimeout(check, 20);
    })();
  });
}

describe('Logger 사용 가이드', () => {
  describe('환경 설정', () => {
    let originalNodeEnv;

    beforeEach(() => {
      originalNodeEnv = process.env.NODE_ENV;
    });

    afterEach(() => {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
    });

    test('명시한 env 옵션이 환경변수보다 우선한다', () => {
      // Given: process.env와 명시 옵션에 서로 다른 환경 이름이 준비되었다
      process.env.NODE_ENV = 'production';

      // When: 명시한 env 옵션으로 Logger 설정을 해석한다
      const config = Logger.resolveConfig({ env: 'test', enableFile: false });

      // Then: 명시 옵션을 사용한다
      expect(config.env).toBe('test');
    });

    test('NODE_ENV를 Logger 설정에 반영한다', () => {
      // Given: NODE_ENV가 준비되었다
      process.env.NODE_ENV = 'staging';

      // When: env 옵션 없이 Logger 설정을 해석한다
      const config = Logger.resolveConfig({ enableFile: false });

      // Then: 환경변수 값을 사용한다
      expect(config.env).toBe('staging');
    });

    test.each([undefined, ''])('NODE_ENV가 %p이면 development를 사용한다', (nodeEnv) => {
      // Given: NODE_ENV가 없거나 빈 문자열이다
      if (nodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = nodeEnv;

      // When: env 옵션 없이 Logger 설정을 해석한다
      const config = Logger.resolveConfig({ enableFile: false });

      // Then: development 기본값을 사용한다
      expect(config.env).toBe('development');
    });
  });

  // ── 1. 생성 ─────────────────────────────────────────────────────────────────

  describe('생성 (LoggerFactory.create)', () => {
    test('enableFile: false면 logDir 없이도 생성할 수 있다', () => {
      expect(() => LoggerFactory.create({ enableFile: false })).not.toThrow();
    });

    test('create()는 호출마다 독립적인 인스턴스를 반환한다', () => {
      const a = LoggerFactory.create({ enableFile: false });
      const b = LoggerFactory.create({ enableFile: false });
      expect(a).not.toBe(b);
    });

    test('create()로 반환된 인스턴스는 즉시 사용할 수 있다', () => {
      const logger = LoggerFactory.create({ enableFile: false });
      expect(() => logger.info('생성 직후 사용 테스트')).not.toThrow();
    });

    test('인자 없이 생성하면 콘솔 전용 로거가 만들어지며 경고는 출력되지 않는다', () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const logger = LoggerFactory.create(); // logDir 없음 → enableFile 자동 false
      expect(errorSpy).not.toHaveBeenCalled();
      expect(() => logger.info('콘솔 전용 동작')).not.toThrow();

      errorSpy.mockRestore();
    });

    test('enableFile: true를 명시했는데 logDir이 없으면 경고를 출력하고 파일 저장은 비활성화된다', () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const logger = LoggerFactory.create({ enableFile: true });
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('logDir is required'));
      expect(() => logger.info('경고 후에도 동작해야 함')).not.toThrow();

      errorSpy.mockRestore();
    });
  });

  // ── 2. 로그 레벨 ───────────────────────────────────────────────────────────

  describe('로그 레벨', () => {
    let logger;
    let spy;

    beforeEach(() => {
      logger = LoggerFactory.create({ enableFile: false });
      spy = {};
      ['info', 'warn', 'error', 'debug', 'verbose', 'http'].forEach((level) => {
        spy[level] = jest.spyOn(logger._instance, level).mockImplementation(() => {});
      });
    });

    test('logger.info()  — 일반 정보 로그', () => {
      logger.info('서버가 시작되었습니다', { port: 3000 });
      expect(spy.info).toHaveBeenCalledWith('서버가 시작되었습니다', { port: 3000 });
    });

    test('logger.warn()  — 경고 로그', () => {
      logger.warn('메모리 사용량이 높습니다', { usage: '85%' });
      expect(spy.warn).toHaveBeenCalledWith('메모리 사용량이 높습니다', { usage: '85%' });
    });

    test('logger.error() — 에러 로그', () => {
      logger.error('데이터베이스 연결 실패', { host: 'db.internal' });
      expect(spy.error).toHaveBeenCalledWith('데이터베이스 연결 실패', { host: 'db.internal' });
    });

    test('logger.debug() — 디버그 로그', () => {
      logger.debug('쿼리 실행', { sql: 'SELECT * FROM users' });
      expect(spy.debug).toHaveBeenCalledWith('쿼리 실행', { sql: 'SELECT * FROM users' });
    });

    test('logger.verbose() — 상세 로그', () => {
      logger.verbose('요청 파라미터 덤프', { params: { id: 1 } });
      expect(spy.verbose).toHaveBeenCalledWith('요청 파라미터 덤프', { params: { id: 1 } });
    });

    test('logger.http() — HTTP 접근 로그 (morgan 연동용)', () => {
      logger.http('GET /health 200 5ms');
      expect(spy.http).toHaveBeenCalledWith('GET /health 200 5ms', {});
    });
  });

  // ── 3. 입력 형식 ───────────────────────────────────────────────────────────

  describe('입력 형식', () => {
    let logger;
    let infoSpy;

    beforeEach(() => {
      logger = LoggerFactory.create({ enableFile: false });
      infoSpy = jest.spyOn(logger._instance, 'info').mockImplementation(() => {});
    });

    test('문자열 메시지만 전달', () => {
      logger.info('단순 문자열 메시지');
      expect(infoSpy).toHaveBeenCalledWith('단순 문자열 메시지', {});
    });

    test('문자열 메시지 + 메타 객체 전달', () => {
      logger.info('사용자 로그인', { userId: 42, ip: '127.0.0.1' });
      expect(infoSpy).toHaveBeenCalledWith('사용자 로그인', { userId: 42, ip: '127.0.0.1' });
    });

    test('Error 객체 전달 — message와 stack이 자동 추출된다', () => {
      const err = new Error('DB 타임아웃');
      logger.info(err);
      expect(infoSpy).toHaveBeenCalledWith(
        'DB 타임아웃',
        expect.objectContaining({ stack: expect.stringContaining('DB 타임아웃') })
      );
    });

    test('Error 객체 + 추가 메타 전달 — stack과 메타가 병합된다', () => {
      const err = new Error('파일 없음');
      logger.info(err, { path: '/var/log/app.log' });
      expect(infoSpy).toHaveBeenCalledWith(
        '파일 없음',
        expect.objectContaining({ stack: expect.any(String), path: '/var/log/app.log' })
      );
    });

    test('message 필드를 가진 객체 전달 — message가 분리되고 나머지는 메타로 처리된다', () => {
      logger.info({ message: '구조화 로그', requestId: 'req-001', duration: 120 });
      expect(infoSpy).toHaveBeenCalledWith('구조화 로그', { requestId: 'req-001', duration: 120 });
    });

    test('message 필드 없는 순수 구조화 객체 전달 — 빈 문자열 메시지 + 전체 메타', () => {
      logger.info({ event: 'user.signup', userId: 7 });
      expect(infoSpy).toHaveBeenCalledWith('', { event: 'user.signup', userId: 7 });
    });
  });

  // ── 4. child 로거 ──────────────────────────────────────────────────────────

  describe('child 로거 — 컨텍스트 바인딩', () => {
    let logger;

    beforeEach(() => {
      logger = LoggerFactory.create({ enableFile: false });
    });

    test('child()로 모듈·요청 단위 컨텍스트를 바인딩한 로거를 만들 수 있다', () => {
      const authLogger = logger.child({ module: 'auth' });

      expect(typeof authLogger.info).toBe('function');
      expect(typeof authLogger.warn).toBe('function');
      expect(typeof authLogger.error).toBe('function');
      expect(typeof authLogger.debug).toBe('function');
      expect(typeof authLogger.verbose).toBe('function');
      expect(typeof authLogger.http).toBe('function');
      expect(typeof authLogger.child).toBe('function');
    });

    test('child 로거의 로그 메서드가 예외를 던지지 않는다', () => {
      const child = logger.child({ module: 'payment' });

      expect(() => {
        child.info('결제 처리 시작', { orderId: 'ord-001' });
        child.warn('잔액 부족 경고');
        child.error('결제 실패', { reason: 'insufficient_funds' });
        child.debug('결제 상세 로그');
        child.verbose('결제 내부 상태');
        child.http('POST /pay 200 130ms');
      }).not.toThrow();
    });

    test('child()를 중첩해서 컨텍스트를 계층적으로 쌓을 수 있다', () => {
      const moduleLogger = logger.child({ module: 'order' });
      const requestLogger = moduleLogger.child({ requestId: 'req-xyz' });

      expect(() => requestLogger.info('주문 생성 완료', { orderId: 42 })).not.toThrow();
    });
  });

  // ── 5. 파일 저장 ───────────────────────────────────────────────────────────

  describe('파일 저장', () => {
    let tmpDir;
    let logger;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-test-'));
      logger = LoggerFactory.create({
        enableFile: true,
        logDir: tmpDir,
        env: 'test',
        format: 'json',
      });
    });

    afterEach(async () => {
      // 파일 스트림이 디렉토리 삭제 전에 완전히 닫히도록 종료 대기
      await new Promise((resolve) => logger._instance.end(resolve));
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('enableFile: true 이면 combined 로그 파일이 생성된다', async () => {
      logger.info('파일 저장 확인', { requestId: 'test-001' });

      const today = localYyyyMmDd();
      const combinedLog = path.join(tmpDir, 'test', `${today}-combined.log`);
      await waitForFile(combinedLog);
      expect(fs.existsSync(combinedLog)).toBe(true);
    });

    test('파일 내용은 JSON 포맷이며 message·level·timestamp 필드를 포함한다', async () => {
      logger.info('JSON 포맷 검증', { userId: 99 });

      const today = localYyyyMmDd();
      const combinedLog = path.join(tmpDir, 'test', `${today}-combined.log`);
      await waitForFile(combinedLog);
      const parsed = JSON.parse(readLastNonEmptyLine(combinedLog));

      expect(parsed.message).toBe('JSON 포맷 검증');
      expect(parsed.userId).toBe(99);
      expect(parsed.level).toBe('info');
      expect(parsed.timestamp).toBeDefined();
    });

    test('error 레벨 로그는 combined 파일과 error 전용 파일 양쪽에 기록된다', async () => {
      logger.error('심각한 오류 발생', { code: 500 });

      const today = localYyyyMmDd();
      const logDir = path.join(tmpDir, 'test');
      const errorLog = path.join(logDir, `${today}-error.log`);
      const combinedLog = path.join(logDir, `${today}-combined.log`);

      await Promise.all([waitForFile(errorLog), waitForFile(combinedLog)]);

      const parsedError = JSON.parse(readLastNonEmptyLine(errorLog));
      expect(parsedError.level).toBe('error');
      expect(parsedError.message).toBe('심각한 오류 발생');

      const parsedCombined = JSON.parse(readLastNonEmptyLine(combinedLog));
      expect(parsedCombined.level).toBe('error');
      expect(parsedCombined.message).toBe('심각한 오류 발생');
    });

    test('info 레벨 로그는 error 전용 파일에 기록되지 않는다', async () => {
      logger.info('일반 정보 로그');

      const today = localYyyyMmDd();
      const combinedLog = path.join(tmpDir, 'test', `${today}-combined.log`);
      await waitForFile(combinedLog); // combined에 기록됨을 확인한 뒤

      // 파일이 생성되더라도 error 레벨 항목은 없어야 한다
      const errorLog = path.join(tmpDir, 'test', `${today}-error.log`);
      if (!fs.existsSync(errorLog)) return;
      const last = readLastNonEmptyLine(errorLog);
      expect(last).toBe('');
    });

    test('enableFile: false 이면 로그 디렉토리 자체가 생성되지 않는다', () => {
      const isolatedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-nofile-'));
      try {
        const consoleOnlyLogger = LoggerFactory.create({
          enableFile: false,
          logDir: isolatedDir,
          env: 'test',
        });
        consoleOnlyLogger.info('파일 없음 확인');
        expect(fs.existsSync(path.join(isolatedDir, 'test'))).toBe(false);
      } finally {
        fs.rmSync(isolatedDir, { recursive: true, force: true });
      }
    });
  });
});

describe('LoggerFactory.create API — 공용 구조화 로그', () => {
  let tmpDir;
  let logger;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-logger-test-'));
    logger = LoggerFactory.create({
      enableFile: true,
      logDir: tmpDir,
      env: 'test',
      format: 'json',
      service: 'membership-api',
      version: '2026.08.24',
      source: 'nodejs',
    });
  });

  afterEach(async () => {
    await new Promise((resolve) => logger._instance.end(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('공통 스키마와 서비스 식별자를 JSON 로그에 기록한다', async () => {
    const schemaLogger = LoggerFactory.create({
      enableFile: true,
      logDir: tmpDir,
      env: 'test',
      service: 'membership-api',
      version: '2026.08.24',
      source: 'nodejs',
      attributePaths: ['result_count'],
    });
    schemaLogger.info('회원 조회 완료', {
      event: 'member.read',
      module: 'membership',
      operation: 'read',
      request_id: 'req-schema-001',
      trace_id: 'trace-schema-001',
      span_id: 'span-schema-001',
      duration_ms: 42,
      attributes: { result_count: 1 },
    });

    const combinedLog = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(combinedLog);
    const parsed = JSON.parse(readLastNonEmptyLine(combinedLog));

    expect(parsed).toEqual(expect.objectContaining({
      schemaVersion: expect.any(String),
      timestamp: expect.any(String),
      status: expect.any(String),
      level: 'info',
      message: '회원 조회 완료',
      service: 'membership-api',
      env: 'test',
      version: '2026.08.24',
      source: 'nodejs',
      event: 'member.read',
      module: 'membership',
      operation: 'read',
      request_id: 'req-schema-001',
      trace_id: 'trace-schema-001',
      span_id: 'span-schema-001',
      duration_ms: 42,
      attributes: { result_count: 1 },
    }));
    await new Promise((resolve) => schemaLogger._instance.end(resolve));
  });

  test('contextProvider가 로그마다 추적 컨텍스트를 주입한다', async () => {
    let activeTrace = 'trace-context-001';
    const contextualLogger = LoggerFactory.create({
      enableFile: true,
      logDir: tmpDir,
      env: 'test',
      service: 'context-api',
      version: '1.0.0',
      contextProvider: () => ({ trace_id: activeTrace, span_id: 'span-context-001' }),
    });

    contextualLogger.info('첫 번째 이벤트');
    activeTrace = 'trace-context-002';
    contextualLogger.info('두 번째 이벤트');

    const combinedLog = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(combinedLog);
    const records = fs.readFileSync(combinedLog, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    expect(records.map((record) => record.trace_id)).toEqual(
      expect.arrayContaining(['trace-context-001', 'trace-context-002'])
    );
    expect(records[records.length - 1].span_id).toBe('span-context-001');
    await new Promise((resolve) => contextualLogger._instance.end(resolve));
  });

  test('중첩 객체와 문자열 패턴의 개인정보를 최종 출력에서 비가역적으로 필터링한다', async () => {
    const password = 'super-secret-password';
    const phone = '010-1234-5678';
    const email = 'member@example.com';
    const address = '서울특별시 중구 세종대로 1';

    logger.info(`로그인 실패 email=${email} phone=${phone}`, {
      password,
      memberName: '홍길동',
      profile: { address, nested: { mobile: phone } },
      authorization: `Bearer ${'a'.repeat(40)}`,
    });

    const combinedLog = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(combinedLog);
    const raw = fs.readFileSync(combinedLog, 'utf8');
    const parsed = JSON.parse(readLastNonEmptyLine(combinedLog));

    expect(raw).not.toContain(password);
    expect(raw).not.toContain(phone);
    expect(raw).not.toContain(email);
    expect(raw).not.toContain(address);
    expect(parsed.password).toBe('[REDACTED]');
    expect(parsed.memberName).toBe('[REDACTED]');
    expect(parsed.profile.address).toBe('[REDACTED]');
    expect(parsed.profile.nested.mobile).toBe('[REDACTED]');
  });

  test('Error의 message·stack·cause와 child 컨텍스트의 개인정보를 필터링한다', async () => {
    const secret = 'child-password-123';
    const error = new Error(`DB 실패 ${secret}`);
    error.cause = { password: secret, memberName: '김민수' };
    const child = logger.child({ request_id: 'req-child-001', password: secret });

    child.error(error, { profile: { phone: '010-9876-5432' } });

    const combinedLog = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(combinedLog);
    const raw = fs.readFileSync(combinedLog, 'utf8');
    const parsed = JSON.parse(readLastNonEmptyLine(combinedLog));

    expect(raw).not.toContain(secret);
    expect(raw).not.toContain('김민수');
    expect(raw).not.toContain('010-9876-5432');
    expect(parsed.error).toEqual(expect.objectContaining({
      kind: 'Error',
      message: expect.not.stringContaining(secret),
      stack: expect.not.stringContaining(secret),
    }));
  });

  test('순환 참조와 과대 문자열을 예외 없이 fail-closed로 기록한다', async () => {
    const secret = 'cycle-secret-value';
    const circular = { password: secret };
    circular.self = circular;
    const oversized = `${secret}-${'x'.repeat(200000)}`;

    expect(() => logger.info('비정상 입력 처리', { circular, oversized })).not.toThrow();

    const combinedLog = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(combinedLog);
    const raw = fs.readFileSync(combinedLog, 'utf8');
    expect(raw).not.toContain(secret);
    expect(raw.length).toBeLessThan(100000);
  });

  test('추가 키와 경로 redaction 설정을 적용한다', async () => {
    const customLogger = LoggerFactory.create({
      enableFile: true,
      logDir: tmpDir,
      env: 'test',
      service: 'custom-api',
      redaction: {
        additionalKeys: ['customer_code'],
        additionalPaths: ['checkout.recipient.nickname'],
      },
    });

    customLogger.info('사용자 지정 필터', {
      customer_code: 'CUSTOMER-SECRET',
      checkout: { recipient: { nickname: '별명-비공개' } },
    });

    const combinedLog = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(combinedLog);
    const raw = fs.readFileSync(combinedLog, 'utf8');
    expect(raw).not.toContain('CUSTOMER-SECRET');
    expect(raw).not.toContain('별명-비공개');
    await new Promise((resolve) => customLogger._instance.end(resolve));
  });
});

describe('requestLoggerMiddleware API — 요청 상관관계', () => {
  test('요청 ID를 검증·생성하고 req.log와 응답 헤더에 연결한다', () => {
    const requestLogger = LoggerFactory.create({ enableFile: false, env: 'test' });
    const middleware = requestLoggerMiddleware(requestLogger);
    const req = new EventEmitter();
    req.method = 'GET';
    req.originalUrl = '/members?name=홍길동&password=secret';
    req.url = req.originalUrl;
    req.headers = { 'x-request-id': 'req-http-001', authorization: 'Bearer secret-token' };
    req.route = { path: '/members' };
    const res = new EventEmitter();
    res.statusCode = 200;
    res.headers = {};
    res.setHeader = (name, value) => { res.headers[name.toLowerCase()] = value; };
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.request_id).not.toBe('req-http-001');
    expect(req.request_id).toEqual(expect.any(String));
    expect(req.log).toBeDefined();
    expect(res.headers['x-request-id']).toBe(req.request_id);
    expect(res.headers['x-trace-id']).toBeUndefined();
    expect(res.headers['x-request-id']).not.toContain('홍길동');
    expect(res.headers['x-request-id']).not.toContain('secret');
  });

  test('응답 완료 로그에 안전한 HTTP 필드만 기록하고 query·body·인증 헤더를 제외한다', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'request-logger-test-'));
    const requestLogger = LoggerFactory.create({
      enableFile: true,
      logDir: tmpDir,
      env: 'test',
      service: 'http-api',
      version: '2.0.0',
    });
    const middleware = requestLoggerMiddleware(requestLogger);
    const req = new EventEmitter();
    Object.assign(req, {
      method: 'POST',
      originalUrl: '/members?phone=010-1111-2222',
      url: '/members?phone=010-1111-2222',
      headers: { 'x-request-id': 'req-http-002', authorization: 'Bearer token-secret' },
      route: { path: '/members' },
      body: { password: 'body-password', phone: '010-1111-2222' },
    });
    const res = new EventEmitter();
    res.statusCode = 201;
    res.headers = {};
    res.setHeader = (name, value) => { res.headers[name.toLowerCase()] = value; };

    middleware(req, res, () => {});
    res.emit('finish');

    const combinedLog = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(combinedLog);
    const raw = fs.readFileSync(combinedLog, 'utf8');
    const parsed = JSON.parse(readLastNonEmptyLine(combinedLog));
    expect(parsed).toEqual(expect.objectContaining({
      request_id: req.request_id,
      http: expect.objectContaining({
        method: 'POST',
        route: '/members',
        status_code: 201,
      }),
    }));
    expect(req.request_id).not.toBe('req-http-002');
    expect(res.headers['x-request-id']).toBe(req.request_id);
    expect(raw).not.toContain('req-http-002');
    expect(raw).not.toContain('010-1111-2222');
    expect(raw).not.toContain('body-password');
    expect(raw).not.toContain('token-secret');

    await new Promise((resolve) => requestLogger._instance.end(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('요청 시작 시 유효한 provider trace가 있으면 trace 헤더를 전달한다', () => {
    const requestLogger = LoggerFactory.create({
      enableFile: false,
      env: 'test',
      contextProvider: () => ({ trace_id: 'provider-trace-at-start' }),
    });
    const middleware = requestLoggerMiddleware(requestLogger);
    const req = new EventEmitter();
    Object.assign(req, { method: 'GET', url: '/health', originalUrl: '/health', headers: {} });
    const res = new EventEmitter();
    res.statusCode = 200;
    res.headers = {};
    res.setHeader = (name, value) => { res.headers[name.toLowerCase()] = value; };

    middleware(req, res, () => {});

    expect(res.headers['x-request-id']).toBe(req.request_id);
    expect(res.headers['x-trace-id']).toBe('provider-trace-at-start');
  });
});

describe('Logger 공개 모듈 API — CommonJS와 ESM', () => {
  test('CommonJS 진입점에서 기존 logger와 신규 middleware를 함께 제공한다', () => {
    const api = require('../../src/index.cjs');
    expect(api.LoggerFactory).toBeDefined();
    expect(api.logger).toBeDefined();
    expect(api.morganMiddleware).toBeDefined();
    expect(api.requestLoggerMiddleware).toBeDefined();
  });

  test('실제 ESM 진입점에서 logger와 middleware를 export한다', () => {
    const result = execFileSync(process.execPath, ['-e', [
      "import('./src/index.mjs').then(({ LoggerFactory, logger, requestLoggerMiddleware }) => {",
      '  if (!LoggerFactory || !logger || !requestLoggerMiddleware) process.exit(1);',
      "}).catch(() => process.exit(1));",
    ].join('\n')], { cwd: path.resolve(__dirname, '../..') });

    expect(result).toEqual(Buffer.from(''));
  });
});

describe('공용 Logger 보안 회귀 API', () => {
  let tmpDir;
  let logger;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-security-test-'));
    logger = LoggerFactory.create({
      enableFile: true,
      logDir: tmpDir,
      env: 'test',
      format: 'json',
      service: 'security-test-api',
      version: '1.0.0',
    });
  });

  afterEach(async () => {
    await new Promise((resolve) => logger._instance.end(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('한국어 개인정보 키와 02 전화번호를 최종 출력에서 필터링한다', async () => {
    logger.info('민감정보 검증', {
      비밀번호: 'korean-password',
      회원명: '홍길동',
      연락처: '02-1234-5678',
      주소: '서울시 중구 세종대로 1',
      전화번호: '02 9876 5432',
    });

    const file = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(file);
    const raw = fs.readFileSync(file, 'utf8');
    expect(raw).not.toContain('korean-password');
    expect(raw).not.toContain('홍길동');
    expect(raw).not.toContain('02-1234-5678');
    expect(raw).not.toContain('서울시 중구 세종대로 1');
    expect(raw).not.toContain('02 9876 5432');
  });

  test('새 비밀번호·비밀번호 확인·전체 이름·배송 주소와 국제 전화번호를 필터링한다', async () => {
    logger.info('derived 민감 키', {
      newPassword: 'new-password-secret',
      password_confirmation: 'confirmation-secret',
      fullName: '김민수',
      shippingAddress: '부산광역시 해운대구 센텀로 10',
      phone: '+82 10-1234-5678',
    });

    const file = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(file);
    const raw = fs.readFileSync(file, 'utf8');
    expect(raw).not.toContain('new-password-secret');
    expect(raw).not.toContain('confirmation-secret');
    expect(raw).not.toContain('김민수');
    expect(raw).not.toContain('부산광역시 해운대구 센텀로 10');
    expect(raw).not.toContain('+82 10-1234-5678');
  });

  test('key=value와 JSON 유사 문자열의 비밀번호·토큰·쿠키·권한 값을 필터링한다', async () => {
    logger.info([
      'password=raw-password',
      'token: "raw-token"',
      '{"cookie":"raw-cookie"}',
      'authorization=Bearer raw-bearer-token',
    ].join(' '));

    const file = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(file);
    const raw = fs.readFileSync(file, 'utf8');
    expect(raw).not.toContain('raw-password');
    expect(raw).not.toContain('raw-token');
    expect(raw).not.toContain('raw-cookie');
    expect(raw).not.toContain('raw-bearer-token');
  });

  test('Basic Authorization과 공백이 포함된 Cookie를 필터링한다', async () => {
    logger.info('credential header values', {
      authorization: 'Basic dXNlcjpwYXNzd29yZA==',
      cookie: 'session=raw-session; refresh_token=raw-refresh-token; theme=dark',
    });

    const file = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(file);
    const raw = fs.readFileSync(file, 'utf8');
    expect(raw).not.toContain('dXNlcjpwYXNzd29yZA==');
    expect(raw).not.toContain('raw-session');
    expect(raw).not.toContain('raw-refresh-token');
  });

  test('한국어 key=value와 URL 인코딩·이스케이프된 credential 문자열을 필터링한다', async () => {
    logger.info('비밀번호=한글-비밀 token=%22escaped-token%22 password%3Draw-url-secret {"cookie":"json-cookie-secret"}');

    const file = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(file);
    const raw = fs.readFileSync(file, 'utf8');
    expect(raw).not.toContain('한글-비밀');
    expect(raw).not.toContain('escaped-token');
    expect(raw).not.toContain('raw-url-secret');
    expect(raw).not.toContain('json-cookie-secret');
  });

  test('자유형 message의 전화번호·query·escaped JSON·한국어 개인정보·URL 인코딩 값을 필터링한다', async () => {
    logger.info([
      '+82 10-1234-5678',
      'GET /?password=raw-query-password&token=raw-query-token',
      '{\\"password\\":\\"raw-escaped-password\\",\\"token\\":\\"raw-escaped-token\\"}',
      '회원명=홍길동 주소=서울시 중구 세종대로 1 대한민국 서울특별시 강남구 테헤란로 123',
      'email%3Draw%40example.com credential%3Draw-url-credential',
    ].join(' '));

    const file = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(file);
    const raw = fs.readFileSync(file, 'utf8');
    [
      '+82 10-1234-5678', 'raw-query-password', 'raw-query-token',
      'raw-escaped-password', 'raw-escaped-token', '홍길동',
      '서울시', '중구', '세종대로', '대한민국', '서울특별시', '강남구', '테헤란로', '123',
      'raw%40example.com', 'raw@example.com', 'raw-url-credential',
    ].forEach((secret) => expect(raw).not.toContain(secret));
  });

  test('hostname·filename·eventName의 일반 단어는 오탐 필터링하지 않는다', async () => {
    logger.info('안전한 식별자', {
      hostname: 'passwords.example.com',
      filename: 'authorization.log',
      eventName: 'passwordReset',
    });

    const file = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(file);
    const parsed = JSON.parse(readLastNonEmptyLine(file));
    expect(parsed.hostname).toBe('passwords.example.com');
    expect(parsed.filename).toBe('authorization.log');
    expect(parsed.eventName).toBe('passwordReset');
  });

  test('operationName·serviceName·routeName은 보존하고 fullName·memberName은 필터링한다', async () => {
    logger.info('필드 분류', {
      operationName: 'member.lookup',
      serviceName: 'membership-api',
      routeName: 'member/:id',
      fullName: '이름 비공개',
      memberName: '회원 비공개',
    });

    const file = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(file);
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(readLastNonEmptyLine(file));
    expect(parsed.operationName).toBe('member.lookup');
    expect(parsed.serviceName).toBe('membership-api');
    expect(parsed.routeName).toBe('member/:id');
    expect(raw).not.toContain('이름 비공개');
    expect(raw).not.toContain('회원 비공개');
  });

  test('contextProvider와 message·meta getter 오류를 삼키고 유효한 최소 이벤트를 기록한다', async () => {
    const getterLogger = LoggerFactory.create({
      enableFile: true,
      logDir: tmpDir,
      env: 'test',
      service: 'getter-test-api',
      contextProvider: () => {
        throw new Error('context getter failure');
      },
    });
    const message = {};
    Object.defineProperty(message, 'message', { get: () => { throw new Error('message getter failure'); } });
    const meta = {};
    Object.defineProperty(meta, 'safe', { get: () => { throw new Error('meta getter failure'); } });
    const nested = {};
    Object.defineProperty(nested, 'secret', { get: () => { throw new Error('nested getter failure'); } });
    const topLevel = {};
    Object.defineProperty(topLevel, 'unsafe', { get: () => { throw new Error('top-level getter failure'); } });

    expect(() => getterLogger.info(message, { meta, nested, topLevel })).not.toThrow();
    const file = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(file);
    const raw = fs.readFileSync(file, 'utf8');
    expect(() => JSON.parse(readLastNonEmptyLine(file))).not.toThrow();
    expect(raw).not.toContain('getter failure');
    await new Promise((resolve) => getterLogger._instance.end(resolve));
  });

  test('invalid Date와 Proxy·nested enumerable getter 및 다양한 error meta를 fail-closed 처리한다', async () => {
    const invalidDate = new Date('not-a-date');
    const throwingProxy = new Proxy({}, {
      getPrototypeOf: () => { throw new Error('prototype trap'); },
      ownKeys: () => { throw new Error('ownKeys trap'); },
      get: () => { throw new Error('proxy get trap'); },
    });
    const nested = {};
    Object.defineProperty(nested, 'value', {
      enumerable: true,
      get: () => { throw new Error('enumerable getter'); },
    });
    const oversized = 'meta-oversized-secret'.repeat(20000);

    expect(() => logger.error('fail-closed 입력', {
      invalidDate,
      throwingProxy,
      nested,
      error: 42,
      errorText: 'string error meta',
      oversized,
    })).not.toThrow();

    const file = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(file);
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(readLastNonEmptyLine(file));
    expect(parsed).toEqual(expect.objectContaining({
      schemaVersion: expect.any(String),
      timestamp: expect.any(String),
      level: 'error',
      message: expect.any(String),
    }));
    expect(raw).not.toContain('prototype trap');
    expect(raw).not.toContain('ownKeys trap');
    expect(raw).not.toContain('proxy get trap');
    expect(raw).not.toContain('enumerable getter');
    expect(raw).not.toContain('meta-oversized-secret');
    expect(raw.length).toBeLessThan(100000);
  });

  test('Error fingerprint가 개인정보가 포함된 원문 메시지에 의존하지 않는다', async () => {
    logger.error(new Error('회원 홍길동 연락처 02-1111-2222 조회 실패'));
    logger.error(new Error('회원 김철수 연락처 02-3333-4444 조회 실패'));

    const file = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(file);
    const records = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
    expect(records[0].error.fingerprint).toBeDefined();
    expect(records[1].error.fingerprint).toBe(records[0].error.fingerprint);
  });

  test('child에 바인딩된 request_id와 trace_id는 호출자의 meta로 덮어쓸 수 없다', async () => {
    const child = logger.child({ request_id: 'bound-request', trace_id: 'bound-trace' });
    child.info('상관관계 우선순위', { request_id: 'caller-request', trace_id: 'caller-trace' });

    const file = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(file);
    const parsed = JSON.parse(readLastNonEmptyLine(file));
    expect(parsed.request_id).toBe('bound-request');
    expect(parsed.trace_id).toBe('bound-trace');
  });

  test('active contextProvider는 일반 logger에 적용되지만 child의 요청·추적 ID는 고정된다', async () => {
    let context = { request_id: 'provider-request-1', trace_id: 'provider-trace-1' };
    const contextual = LoggerFactory.create({
      enableFile: true,
      logDir: tmpDir,
      env: 'test',
      service: 'context-precedence-api',
      contextProvider: () => context,
    });
    const child = contextual.child({ request_id: 'bound-request', trace_id: 'bound-trace' });
    contextual.info('provider 첫 로그');
    child.info('child 첫 로그');
    context = { request_id: 'provider-request-2', trace_id: 'provider-trace-2' };
    contextual.info('provider 두 번째 로그');
    child.info('child 두 번째 로그');

    const file = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(file);
    const records = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
    expect(records.find((record) => record.message === 'provider 첫 로그').request_id).toBe('provider-request-1');
    expect(records.find((record) => record.message === 'provider 두 번째 로그').request_id).toBe('provider-request-2');
    expect(records.find((record) => record.message === 'child 첫 로그').request_id).toBe('bound-request');
    expect(records.find((record) => record.message === 'child 두 번째 로그').trace_id).toBe('bound-trace');
    await new Promise((resolve) => contextual._instance.end(resolve));
  });

  test('attributePaths allowlist에 선언된 필드만 attributes 아래에 기록한다', async () => {
    const allowlistedLogger = LoggerFactory.create({
      enableFile: true,
      logDir: tmpDir,
      env: 'test',
      service: 'allowlist-api',
      attributePaths: ['result_count', 'diagnostics.occurredAt', 'diagnostics.cause'],
    });
    const attributes = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`unknown_${index}`, index]));
    allowlistedLogger.info('예산 제한', {
      status: 'accepted',
      level: 'custom-level-should-not-win',
      request_id: 'req-canonical',
      attributes: {
        result_count: 1,
        diagnostics: { occurredAt: '2026-01-01', cause: 'safe-cause' },
        ...attributes,
      },
      unknown_top_level: 'must-be-nested',
    });

    const file = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(file);
    const parsed = JSON.parse(readLastNonEmptyLine(file));
    expect(parsed.level).toBe('info');
    expect(parsed.status).toBe('info');
    expect(parsed.request_id).toBe('req-canonical');
    expect(parsed.unknown_top_level).toBeUndefined();
    expect(parsed.result_count).toBeUndefined();
    expect(parsed.attributes).toEqual({
      result_count: 1,
      diagnostics: { occurredAt: '2026-01-01', cause: 'safe-cause' },
    });
    expect(Object.keys(parsed).length).toBeLessThanOrEqual(40);
    await new Promise((resolve) => allowlistedLogger._instance.end(resolve));
  });

  test('attributePaths의 잘못된·위험한·과도하게 깊은 경로를 무시하고 prototype pollution을 막는다', async () => {
    let validated;
    expect(() => {
      validated = LoggerFactory.create({
      enableFile: true,
      logDir: tmpDir,
      env: 'test',
      service: 'path-validation-api',
      attributePaths: [
        null, 123, '', 'too.deep.one.two.three.four.five.six',
        '__proto__.polluted', 'prototype.polluted', 'constructor.polluted', 'safe',
      ],
      });
    }).not.toThrow();
    expect(() => validated.info('경로 검증', {
      attributes: { safe: 'ok', __proto__: { polluted: 'yes' }, constructor: { polluted: 'yes' } },
    })).not.toThrow();
    expect(Object.prototype.polluted).toBeUndefined();
    const file = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(file);
    const parsed = JSON.parse(readLastNonEmptyLine(file));
    expect(parsed.attributes).toEqual({ safe: 'ok' });
    await new Promise((resolve) => validated._instance.end(resolve));
  });

  test('attributePaths는 meta.attributes 기준이며 scalar·Date·Error leaf와 명시적 descendant만 보존한다', async () => {
    const allowlisted = LoggerFactory.create({
      enableFile: true,
      logDir: tmpDir,
      env: 'test',
      service: 'leaf-validation-api',
      attributePaths: ['scalar', 'object', 'object.allowed', 'occurredAt', 'cause'],
    });
    allowlisted.info('leaf 검증', {
      scalar: 'must-not-be-copied-from-meta',
      attributes: {
        scalar: 'scalar-value',
        object: { allowed: 'declared-descendant', undeclared: 'drop-me' },
        occurredAt: new Date('2026-01-02T03:04:05.000Z'),
        cause: new Error('safe error'),
      },
    });

    const file = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(file);
    const parsed = JSON.parse(readLastNonEmptyLine(file));
    expect(parsed.scalar).toBeUndefined();
    expect(parsed.attributes.scalar).toBe('scalar-value');
    expect(parsed.attributes.object).toEqual({ allowed: 'declared-descendant' });
    expect(parsed.attributes.object.undeclared).toBeUndefined();
    expect(parsed.attributes.occurredAt).toContain('2026');
    expect(JSON.stringify(parsed.attributes.cause)).toContain('safe error');
    await new Promise((resolve) => allowlisted._instance.end(resolve));
  });

  test('순환 self와 깊은 Error.cause를 예외 없이 처리하고 필수 schema를 유지한다', async () => {
    const circular = { name: 'circular' };
    circular.self = circular;
    let cause = new Error('root cause');
    for (let index = 0; index < 20; index += 1) {
      const next = new Error(`nested cause ${index}`);
      cause.cause = next;
      cause = next;
    }
    expect(() => logger.error(cause, { circular })).not.toThrow();

    const file = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(file);
    const parsed = JSON.parse(readLastNonEmptyLine(file));
    expect(parsed).toEqual(expect.objectContaining({
      schemaVersion: expect.any(String),
      timestamp: expect.any(String),
      level: 'error',
      message: expect.any(String),
    }));
  });

  test('구조화 객체의 canonical 필드와 allowlist attributes를 보존하고 민감 값을 필터링한다', async () => {
    const structured = LoggerFactory.create({
      enableFile: true,
      logDir: tmpDir,
      env: 'test',
      service: 'structured-api',
      version: '3.0.0',
      attributePaths: ['result_count'],
    });
    structured.info({
      message: '구조화 이벤트',
      request_id: 'structured-request',
      trace_id: 'structured-trace',
      memberId: 'member-001',
      event: 'member.lookup',
      module: 'membership',
      operation: 'read',
      duration_ms: 17,
      http: { method: 'GET', route: '/members/:id', status_code: 200 },
      error: { kind: 'ValidationError', message: 'password=structured-secret' },
      attributes: { result_count: 1, hidden: 'drop-me' },
    });

    const file = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(file);
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(readLastNonEmptyLine(file));
    expect(parsed).toEqual(expect.objectContaining({
      message: '구조화 이벤트', request_id: 'structured-request', trace_id: 'structured-trace',
      memberId: 'member-001', event: 'member.lookup', module: 'membership', operation: 'read', duration_ms: 17,
      http: { method: 'GET', route: '/members/:id', status_code: 200 },
    }));
    expect(parsed.attributes).toEqual({ result_count: 1 });
    expect(parsed.error).toEqual(expect.objectContaining({
      kind: 'ValidationError',
      message: 'password=[REDACTED]',
      fingerprint: expect.stringMatching(/^[a-f0-9]{16}$/),
    }));
    expect(raw).not.toContain('structured-secret');
    await new Promise((resolve) => structured._instance.end(resolve));
  });

  test('많은 top-level 알 수 없는 키를 제한하고 canonical 필드는 top-level로 보존한다', async () => {
    const topLevelFields = Object.fromEntries(
      Array.from({ length: 120 }, (_, index) => [`unknown_field_${index}`, `value-${index}`])
    );
    logger.info('top-level 예산 제한', {
      ...topLevelFields,
      service: 'caller-service-must-not-win',
      request_id: 'request-canonical-budget',
      trace_id: 'trace-canonical-budget',
    });

    const file = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(file);
    const parsed = JSON.parse(readLastNonEmptyLine(file));
    expect(parsed.service).toBe('security-test-api');
    expect(parsed.request_id).toBe('request-canonical-budget');
    expect(parsed.trace_id).toBe('trace-canonical-budget');
    expect(Object.keys(parsed).length).toBeLessThanOrEqual(40);
    expect(parsed.attributes).toBeUndefined();
  });

  test('contextProvider의 많은 알 수 없는 필드와 민감한 tail을 출력하지 않는다', async () => {
    const leakedTail = 'provider-unsanitized-tail-secret';
    const providerFields = Object.fromEntries(
      Array.from({ length: 120 }, (_, index) => [`provider_field_${index}`, index])
    );
    const contextual = LoggerFactory.create({
      enableFile: true,
      logDir: tmpDir,
      env: 'test',
      service: 'provider-budget-api',
      contextProvider: () => ({
        trace_id: 'provider-budget-trace',
        ...providerFields,
        attributes: { leakedTail },
      }),
    });
    contextual.info('provider budget');

    const file = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(file);
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(readLastNonEmptyLine(file));
    expect(parsed.trace_id).toBe('provider-budget-trace');
    expect(raw).not.toContain(leakedTail);
    expect(Object.keys(parsed).length).toBeLessThanOrEqual(40);
    await new Promise((resolve) => contextual._instance.end(resolve));
  });

  test('250개가 넘는 meta와 child context에서도 필수 스키마와 correlation을 보존한다', async () => {
    const meta = Object.fromEntries(
      Array.from({ length: 280 }, (_, index) => [`arbitrary_${index}`, `value-${index}`])
    );
    const child = logger.child({ request_id: 'many-meta-request', trace_id: 'many-meta-trace' });
    child.info('대량 메타 이벤트', meta);

    const file = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(file);
    const parsed = JSON.parse(readLastNonEmptyLine(file));
    expect(parsed).toEqual(expect.objectContaining({
      schemaVersion: expect.any(String),
      timestamp: expect.any(String),
      level: 'info',
      message: '대량 메타 이벤트',
      request_id: 'many-meta-request',
      trace_id: 'many-meta-trace',
    }));
    expect(Object.keys(parsed).length).toBeLessThanOrEqual(40);
    expect(parsed.attributes).toBeUndefined();
  });

  test('unknown Proxy와 깊고 넓은 unknown object를 열거·순회하지 않는다', async () => {
    let ownKeysCalls = 0;
    let getterCalls = 0;
    const unknownProxy = new Proxy({}, {
      ownKeys: () => { ownKeysCalls += 1; return ['secret']; },
      get: () => { getterCalls += 1; throw new Error('unknown proxy getter'); },
      getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    });
    const deepUnknown = { level1: { level2: { level3: {} } } };
    Object.defineProperty(deepUnknown.level1.level2.level3, 'secret', {
      enumerable: true,
      get: () => { getterCalls += 1; throw new Error('deep unknown getter'); },
    });

    expect(() => logger.info('unknown 입력', { unknownProxy, deepUnknown })).not.toThrow();
    const file = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(file);
    const parsed = JSON.parse(readLastNonEmptyLine(file));
    expect(parsed.unknownProxy).toBeUndefined();
    expect(parsed.deepUnknown).toBeUndefined();
    expect(ownKeysCalls).toBe(0);
    expect(getterCalls).toBe(0);
  });

  test('중첩 Date와 Error의 유용한 표현을 유지하면서 개인정보를 필터링한다', async () => {
    const diagnosticLogger = LoggerFactory.create({
      enableFile: true,
      logDir: tmpDir,
      env: 'test',
      service: 'diagnostic-api',
      attributePaths: ['diagnostics.occurredAt', 'diagnostics.cause'],
    });
    diagnosticLogger.error('중첩 진단 정보', {
      attributes: {
        diagnostics: {
          occurredAt: new Date('2026-01-02T03:04:05.000Z'),
          cause: new Error('주소 서울시 비공개'),
        },
      },
    });

    const file = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(file);
    const parsed = JSON.parse(readLastNonEmptyLine(file));
    const diagnostic = parsed.attributes?.diagnostics || parsed.diagnostics;
    expect(JSON.stringify(diagnostic)).toContain('2026');
    expect(JSON.stringify(diagnostic)).toContain('Error');
    expect(JSON.stringify(diagnostic)).not.toContain('서울시 비공개');
    await new Promise((resolve) => diagnosticLogger._instance.end(resolve));
  });

  test('허용된 Error attribute의 거대한 cause와 Proxy를 열거하지 않고 bounded 표현만 기록한다', async () => {
    let ownKeysCalls = 0;
    let getterCalls = 0;
    const hugeCause = new Proxy({ secret: 'must-not-retain', payload: 'x'.repeat(100000) }, {
      ownKeys: () => { ownKeysCalls += 1; throw new Error('cause ownKeys'); },
      get: () => { getterCalls += 1; throw new Error('cause getter'); },
      getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    });
    const proxiedError = new Error('proxy cause error');
    Object.defineProperty(proxiedError, 'cause', { value: hugeCause, enumerable: false });
    const scalarError = new Error('scalar cause error');
    scalarError.cause = 'safe-cause';
    const errorLogger = LoggerFactory.create({
      enableFile: true,
      logDir: tmpDir,
      env: 'test',
      service: 'bounded-error-api',
      attributePaths: ['diagnostics.cause'],
    });

    expect(() => errorLogger.error('bounded causes', {
      attributes: { diagnostics: { cause: proxiedError } },
    })).not.toThrow();
    errorLogger.error('scalar cause', {
      attributes: { diagnostics: { cause: scalarError } },
    });

    const file = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(file);
    const raw = fs.readFileSync(file, 'utf8');
    const records = raw.split('\n').filter(Boolean).map((line) => JSON.parse(line));
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual(expect.objectContaining({
      schemaVersion: expect.any(String),
      timestamp: expect.any(String),
      level: 'error',
    }));
    expect(raw).not.toContain('must-not-retain');
    expect(raw).not.toContain('cause ownKeys');
    expect(raw).not.toContain('cause getter');
    expect(raw.length).toBeLessThan(100000);
    expect(JSON.stringify(records[1])).toContain('safe-cause');
    expect(ownKeysCalls).toBe(0);
    expect(getterCalls).toBe(0);
    await new Promise((resolve) => errorLogger._instance.end(resolve));
  });

  test('중첩 native Error cause의 kind·message·stack을 정제된 bounded 형태로 보존한다', async () => {
    const inner = new Error('내부 원인');
    const outer = new Error('외부 작업 실패');
    outer.cause = inner;
    const errorLogger = LoggerFactory.create({
      enableFile: true,
      logDir: tmpDir,
      env: 'test',
      service: 'nested-error-api',
    });

    errorLogger.error(outer);

    const file = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(file);
    const parsed = JSON.parse(readLastNonEmptyLine(file));
    const cause = parsed.error;
    expect(cause).toEqual(expect.objectContaining({
      kind: 'Error',
      message: '외부 작업 실패',
      stack: expect.stringContaining('외부 작업 실패'),
    }));
    expect(cause.cause).toEqual(expect.objectContaining({
      kind: 'Error',
      message: '내부 원인',
      stack: expect.stringContaining('내부 원인'),
    }));
    await new Promise((resolve) => errorLogger._instance.end(resolve));
  });

  test('nested plain error-like cause의 fingerprint와 이름·전화번호 PII를 출력하지 않는다', async () => {
    const outer = new Error('외부 오류');
    outer.cause = {
      kind: 'Error',
      name: '회원명=홍길동',
      message: '연락처=02-1234-5678 조회 실패',
      stack: 'Error: 주소=서울특별시 중구 세종대로 1',
      fingerprint: '홍길동|02-1234-5678|서울특별시 중구 세종대로 1',
    };
    const errorLogger = LoggerFactory.create({
      enableFile: true,
      logDir: tmpDir,
      env: 'test',
      service: 'plain-cause-api',
    });

    errorLogger.error(outer);

    const file = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(file);
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(readLastNonEmptyLine(file));
    expect(raw).not.toContain('홍길동');
    expect(raw).not.toContain('02-1234-5678');
    expect(raw).not.toContain('서울특별시 중구 세종대로 1');
    expect(parsed.error.cause).toBeUndefined();
    await new Promise((resolve) => errorLogger._instance.end(resolve));
  });

  test('error-like cause의 kind·message·stack이 대형 객체나 Proxy여도 열거하지 않고 bounded 출력한다', async () => {
    let ownKeysCalls = 0;
    let getterCalls = 0;
    const proxyValue = new Proxy({ payload: 'x'.repeat(200000) }, {
      ownKeys: () => { ownKeysCalls += 1; throw new Error('error-like ownKeys'); },
      get: () => { getterCalls += 1; throw new Error('error-like getter'); },
      getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    });
    const outer = new Error('비정상 nested cause');
    outer.cause = {
      kind: proxyValue,
      message: { huge: 'm'.repeat(200000) },
      stack: proxyValue,
    };
    const errorLogger = LoggerFactory.create({
      enableFile: true,
      logDir: tmpDir,
      env: 'test',
      service: 'bounded-plain-cause-api',
    });

    expect(() => errorLogger.error(outer)).not.toThrow();
    const file = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(file);
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(readLastNonEmptyLine(file));
    expect(parsed).toEqual(expect.objectContaining({
      schemaVersion: expect.any(String),
      timestamp: expect.any(String),
      level: 'error',
    }));
    expect(raw.length).toBeLessThan(100000);
    expect(raw).not.toContain('error-like ownKeys');
    expect(raw).not.toContain('error-like getter');
    expect(ownKeysCalls).toBe(0);
    expect(getterCalls).toBe(0);
    await new Promise((resolve) => errorLogger._instance.end(resolve));
  });

  test('public structured error의 null-prototype·throwing primitive·Proxy 입력을 예외 없이 제한한다', async () => {
    let ownKeysCalls = 0;
    let getterCalls = 0;
    const throwingPrimitive = {
      [Symbol.toPrimitive]: () => { throw new Error('primitive conversion'); },
    };
    const throwingProxy = new Proxy({ payload: 'p'.repeat(200000) }, {
      ownKeys: () => { ownKeysCalls += 1; throw new Error('structured ownKeys'); },
      get: () => { getterCalls += 1; throw new Error('structured get'); },
      getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    });
    const nullProtoError = Object.create(null);
    nullProtoError.kind = throwingPrimitive;
    nullProtoError.message = throwingProxy;
    nullProtoError.stack = throwingPrimitive;
    const structured = LoggerFactory.create({
      enableFile: true,
      logDir: tmpDir,
      env: 'test',
      service: 'structured-error-edge-api',
    });

    expect(() => structured.info({ message: 'structured edge', error: nullProtoError })).not.toThrow();
    const file = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(file);
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(readLastNonEmptyLine(file));
    expect(parsed).toEqual(expect.objectContaining({
      schemaVersion: expect.any(String),
      timestamp: expect.any(String),
      level: 'info',
      message: 'structured edge',
    }));
    expect(raw.length).toBeLessThan(100000);
    expect(raw).not.toContain('primitive conversion');
    expect(raw).not.toContain('structured ownKeys');
    expect(raw).not.toContain('structured get');
    expect(ownKeysCalls).toBe(0);
    expect(getterCalls).toBe(0);
    await new Promise((resolve) => structured._instance.end(resolve));
  });

  test('native Error의 message·cause·stack TOCTOU Proxy를 열거·변환하지 않고 bounded 출력한다', async () => {
    let ownKeysCalls = 0;
    let getterCalls = 0;
    const proxy = new Proxy({ payload: 'e'.repeat(200000) }, {
      ownKeys: () => { ownKeysCalls += 1; throw new Error('native ownKeys'); },
      get: () => { getterCalls += 1; throw new Error('native getter'); },
      getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    });
    const outer = Object.create(Error.prototype);
    Object.defineProperties(outer, {
      name: { value: 'Error', configurable: true },
      message: { value: proxy, configurable: true },
      stack: { value: proxy, configurable: true },
      cause: { value: proxy, configurable: true },
    });
    const errorLogger = LoggerFactory.create({
      enableFile: true,
      logDir: tmpDir,
      env: 'test',
      service: 'native-error-edge-api',
    });

    expect(() => errorLogger.error(outer)).not.toThrow();
    const file = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(file);
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(readLastNonEmptyLine(file));
    expect(parsed).toEqual(expect.objectContaining({
      schemaVersion: expect.any(String),
      timestamp: expect.any(String),
      level: 'error',
    }));
    expect(raw.length).toBeLessThan(100000);
    expect(raw).not.toContain('native ownKeys');
    expect(raw).not.toContain('native getter');
    expect(ownKeysCalls).toBe(0);
    expect(getterCalls).toBe(0);
    await new Promise((resolve) => errorLogger._instance.end(resolve));
  });
});

describe('requestLoggerMiddleware lifecycle API', () => {
  test('finish·close·aborted가 중복으로 발생해도 요청 완료 로그를 한 번만 남긴다', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'request-lifecycle-test-'));
    const requestLogger = LoggerFactory.create({
      enableFile: true,
      logDir: tmpDir,
      env: 'test',
      service: 'lifecycle-api',
    });
    const middleware = requestLoggerMiddleware(requestLogger);
    const req = new EventEmitter();
    Object.assign(req, { method: 'GET', url: '/health', originalUrl: '/health', headers: {}, route: { path: '/health' } });
    const res = new EventEmitter();
    res.statusCode = 200;
    res.setHeader = () => {};

    middleware(req, res, () => {});
    res.emit('finish');
    res.emit('close');
    req.emit('aborted');

    const file = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(file);
    const records = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    const requestId = req.request_id;
    expect(records.filter((record) => record.includes(requestId))).toHaveLength(1);
    await new Promise((resolve) => requestLogger._instance.end(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('finish 전에 close되고 writableEnded가 false면 성공 완료가 아닌 aborted 로그를 한 번 남긴다', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'request-aborted-test-'));
    const requestLogger = LoggerFactory.create({
      enableFile: true,
      logDir: tmpDir,
      env: 'test',
      service: 'aborted-api',
    });
    const middleware = requestLoggerMiddleware(requestLogger);
    const req = new EventEmitter();
    Object.assign(req, { method: 'GET', url: '/stream', originalUrl: '/stream', headers: {}, route: { path: '/stream' } });
    const res = new EventEmitter();
    res.statusCode = 200;
    res.writableEnded = false;
    res.setHeader = () => {};

    middleware(req, res, () => {});
    res.emit('close');
    res.emit('finish');
    req.emit('aborted');

    const file = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(file);
    const records = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
    const requestRecords = records.filter((record) => record.request_id === req.request_id);
    expect(requestRecords).toHaveLength(1);
    expect(requestRecords[0].http.status_code).not.toBe(200);
    expect(requestRecords[0].message).not.toMatch(/완료|completed/i);
    await new Promise((resolve) => requestLogger._instance.end(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('writableEnded가 true여도 writableFinished가 false인 close는 499 aborted로 한 번 기록한다', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'request-aborted-finished-test-'));
    const requestLogger = LoggerFactory.create({
      enableFile: true,
      logDir: tmpDir,
      env: 'test',
      service: 'aborted-finished-api',
    });
    const middleware = requestLoggerMiddleware(requestLogger);
    const req = new EventEmitter();
    Object.assign(req, { method: 'GET', url: '/stream', originalUrl: '/stream', headers: {}, route: { path: '/stream' } });
    const res = new EventEmitter();
    Object.assign(res, { statusCode: 200, writableEnded: true, writableFinished: false, setHeader: () => {} });

    middleware(req, res, () => {});
    res.emit('close');
    res.emit('finish');

    const file = path.join(tmpDir, 'test', `${localYyyyMmDd()}-combined.log`);
    await waitForFile(file);
    const records = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
    const requestRecords = records.filter((record) => record.request_id === req.request_id);
    expect(requestRecords).toHaveLength(1);
    expect(requestRecords[0].http.status_code).toBe(499);
    await new Promise((resolve) => requestLogger._instance.end(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
