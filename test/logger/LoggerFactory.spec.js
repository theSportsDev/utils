'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const EventEmitter = require('events');
const { execFileSync } = require('child_process');

const { LoggerFactory, logger, requestLoggerMiddleware } = require('../../src/index.cjs');
const { closeLogger } = require('../../src/logger/logger');

function dateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function waitForFile(file) {
  for (let count = 0; count < 50; count += 1) {
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8').trim()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`log file was not written: ${file}`);
}

function lastRecord(file) {
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  return JSON.parse(lines[lines.length - 1]);
}

describe('Logger의 단순 공개 API', () => {
  let logDir;
  let instance;
  let logFile;

  beforeEach(() => {
    logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'simple-logger-'));
    instance = LoggerFactory.create({
      service: 'membership-api',
      env: 'test',
      version: '1.0.0',
      format: 'json',
      level: 'debug',
      logDir,
    });
    logFile = path.join(logDir, 'test', `${dateString()}-combined.log`);
  });

  afterEach(async () => {
    await new Promise((resolve) => closeLogger(instance, resolve));
    fs.rmSync(logDir, { recursive: true, force: true });
  });

  test('첫 번째 문자열 인자만으로 로그를 출력한다', async () => {
    instance.info('server started');
    await waitForFile(logFile);

    expect(lastRecord(logFile)).toEqual(expect.objectContaining({
      message: 'server started',
      service: 'membership-api',
      env: 'test',
      version: '1.0.0',
      level: 'info',
    }));
  });

  test.each([
    ['문자열', 'member-123'],
    ['숫자', 123],
    ['불리언', true],
    ['null', null],
  ])('두 번째 %s 값을 value 필드에 출력한다', async (_, value) => {
    instance.debug('new user joined', value);
    await waitForFile(logFile);
    expect(lastRecord(logFile).value).toBe(value);
  });

  test.each([
    {},
    { mb_idx: 1 },
    ['member-1'],
    new Error('failure'),
    () => 'member-1',
  ])('두 번째 인자로 객체나 함수를 받지 않는다', (value) => {
    expect(() => instance.info('invalid value', value)).toThrow(TypeError);
  });

  test.each([
    {},
    ['message'],
    new Error('failure'),
    123,
    null,
  ])('첫 번째 인자는 문자열만 허용한다', (message) => {
    expect(() => instance.info(message)).toThrow(TypeError);
  });

  test('세 개 이상의 인자를 받지 않는다', () => {
    expect(() => instance.info('member loaded', 123, 'extra')).toThrow(TypeError);
  });

  test('두 번째 문자열에 포함된 개인정보를 필터링한다', async () => {
    instance.info('login failed', 'email=user@example.com phone=010-1234-5678 token=secret-token');
    await waitForFile(logFile);

    const raw = fs.readFileSync(logFile, 'utf8');
    expect(raw).not.toContain('user@example.com');
    expect(raw).not.toContain('010-1234-5678');
    expect(raw).not.toContain('secret-token');
    expect(lastRecord(logFile).value).toContain('[REDACTED]');
  });

  test('메시지 문자열의 개인정보도 필터링한다', async () => {
    instance.warn('회원 연락처=010-9876-5432 조회 실패');
    await waitForFile(logFile);
    expect(fs.readFileSync(logFile, 'utf8')).not.toContain('010-9876-5432');
  });

  test('인증·쿠키·JWT·URL 인코딩·주소 문자열을 필터링한다', async () => {
    instance.info('sensitive values', [
      'authorization=Basic dXNlcjpwYXNzd29yZA==',
      'cookie=session=raw-session-secret',
      'token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature',
      'password%3Draw-password-secret',
      '주소=서울특별시 중구 세종대로 1',
    ].join(' '));
    await waitForFile(logFile);
    const raw = fs.readFileSync(logFile, 'utf8');
    ['dXNlcjpwYXNzd29yZA==', 'raw-session-secret', 'eyJhbGciOiJIUzI1NiJ9', 'raw-password-secret', '서울특별시 중구 세종대로 1']
      .forEach((secret) => expect(raw).not.toContain(secret));
  });

  test('child logger의 요청 컨텍스트는 호출 값으로 덮어쓸 수 없다', async () => {
    const child = instance.child({ request_id: 'request-123', trace_id: 'trace-123' });
    child.info('member loaded', 10);
    await waitForFile(logFile);

    expect(lastRecord(logFile)).toEqual(expect.objectContaining({
      request_id: 'request-123',
      trace_id: 'trace-123',
      value: 10,
    }));
  });

  test('child와 contextProvider의 객체 ID를 출력하지 않는다', async () => {
    const contextual = LoggerFactory.create({
      service: 'context-api', env: 'test', format: 'json', logDir,
      contextProvider: () => ({ trace_id: { name: '홍길동' } }),
    });
    const child = contextual.child({ request_id: { mobile: '010-1234-5678' } });
    child.info('safe context');
    await waitForFile(logFile);

    const raw = fs.readFileSync(logFile, 'utf8');
    expect(raw).not.toContain('홍길동');
    expect(raw).not.toContain('010-1234-5678');
    expect(lastRecord(logFile).request_id).toBeUndefined();
    expect(lastRecord(logFile).trace_id).toBeUndefined();
    await new Promise((resolve) => closeLogger(contextual, resolve));
  });
});

describe('Logger 생성 설정', () => {
  test('service만 전달해 생성할 수 있다', () => {
    const instance = LoggerFactory.create({ service: 'simple-api', enableFile: false });
    expect(instance).not.toHaveProperty('_config');
    expect(instance).not.toHaveProperty('_instance');
    expect(instance).not.toHaveProperty('_writeStructured');
  });

  test.each(['service', 'env', 'version'])('%s 설정에 객체를 허용하지 않는다', (key) => {
    expect(() => LoggerFactory.create({
      service: 'simple-api',
      enableFile: false,
      [key]: { MB_NAME: '홍길동' },
    })).toThrow(TypeError);
  });

  test('기본 logger와 CJS API를 제공한다', () => {
    expect(logger.info).toEqual(expect.any(Function));
    expect(requestLoggerMiddleware).toEqual(expect.any(Function));
  });

  test('ESM 진입점에서도 같은 API를 제공한다', () => {
    const result = execFileSync(process.execPath, ['-e', [
      "import('./src/index.mjs').then((api) => {",
      '  if (!api.LoggerFactory || !api.logger || !api.requestLoggerMiddleware) process.exit(1);',
      '}).catch(() => process.exit(1));',
    ].join('\n')], { cwd: path.resolve(__dirname, '../..') });
    expect(result).toEqual(Buffer.from(''));
  });
});

describe('requestLoggerMiddleware', () => {
  test('req.log와 request ID를 연결하고 HTTP 완료 로그를 남긴다', () => {
    const instance = LoggerFactory.create({ service: 'http-api', enableFile: false });
    const middleware = requestLoggerMiddleware(instance);
    const req = new EventEmitter();
    Object.assign(req, { method: 'GET', headers: {}, route: { path: '/members/:id' } });
    const res = new EventEmitter();
    Object.assign(res, { statusCode: 200, writableFinished: true, setHeader: jest.fn() });
    middleware(req, res, () => {});
    req.log.debug('member loaded', 123);
    res.emit('finish');

    expect(req.request_id).toEqual(expect.any(String));
    expect(req.log).toBeDefined();
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', req.request_id);
  });

  test('중단·완료 이벤트가 연속 발생해도 499 로그를 한 번만 기록한다', async () => {
    const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'request-abort-'));
    const instance = LoggerFactory.create({ service: 'http-api', env: 'test', format: 'json', logDir });
    const middleware = requestLoggerMiddleware(instance);
    const req = new EventEmitter();
    Object.assign(req, { method: 'GET', headers: {}, route: { path: '/stream' } });
    const res = new EventEmitter();
    Object.assign(res, { statusCode: 200, writableFinished: false, setHeader: () => {} });

    middleware(req, res, () => {});
    res.emit('close');
    res.emit('finish');
    req.emit('aborted');

    const file = path.join(logDir, 'test', `${dateString()}-combined.log`);
    await waitForFile(file);
    const records = fs.readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    const requestRecords = records.filter((record) => record.request_id === req.request_id);
    expect(requestRecords).toHaveLength(1);
    expect(requestRecords[0].http.status_code).toBe(499);
    expect(requestRecords[0].event).toBe('http.request.aborted');
    await new Promise((resolve) => closeLogger(instance, resolve));
    fs.rmSync(logDir, { recursive: true, force: true });
  });

  test('신뢰 옵션이 있을 때만 유효한 외부 request ID를 사용한다', () => {
    const instance = LoggerFactory.create({ service: 'http-api', enableFile: false });
    const req = new EventEmitter();
    Object.assign(req, { method: 'GET', headers: { 'x-request-id': 'trusted-request-1' } });
    const res = new EventEmitter();
    Object.assign(res, { statusCode: 200, writableFinished: true, setHeader: jest.fn() });

    requestLoggerMiddleware(instance, { trustIncomingIds: true })(req, res, () => {});
    expect(req.request_id).toBe('trusted-request-1');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'trusted-request-1');
  });
});
