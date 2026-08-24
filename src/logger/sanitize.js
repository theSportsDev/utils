'use strict';

const REDACTED = '[REDACTED]';
const TRUNCATED = '[TRUNCATED]';
const CIRCULAR = '[CIRCULAR]';
const MAX_DEPTH = 12;
const MAX_NODES = 500;
const MAX_KEYS = 500;
const MAX_BYTES = 65536;
const MAX_STRING_LENGTH = 8192;
const MAX_COPY_KEYS = 50;

const SENSITIVE_KEYS = new Set([
  'password', 'passwd', 'pwd', 'secret', 'token', 'accesstoken', 'refreshtoken',
  'authorization', 'cookie', 'apikey', 'email', 'mail', 'name', 'membername',
  'username', 'mobile', 'phone', 'tel', 'address', 'birthday', 'birthdate',
  'resident', 'ssn', '비밀번호', '패스워드', '회원명', '이름', '성명', '연락처',
  '전화번호', '휴대폰', '휴대전화', '이메일', '메일', '주소', '생년월일', '주민번호',
]);
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const KOREAN_PHONE = /(^|[^A-Za-z0-9])(?:\+82[-\s]?)?(?:0?1\d|0?2|0?[3-6]\d|0?70)[-\s]?\d{3,4}[-\s]?\d{4}(?=$|[^A-Za-z0-9])/g;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const CREDENTIAL_VALUE = /((?:^|[,{\s?&])(?:\\?["']?)(?:password|passwd|pwd|token|authorization|cookie|api[_-]?key)(?:\\?["']?)\s*[:=]\s*)(?:\\?"[^\"]*\\?"|'[^']*'|[^,}\]\s&]+)/gi;
const MEMBER_NAME = /(회원\s+)[가-힣]{2,4}(?=\s*(?:연락처|전화번호|이메일|주소|조회|$))/g;
const HYPHENATED_SECRET = /\b[A-Za-z0-9]+-(?:password|passwd|secret)[A-Za-z0-9-]*\b/gi;
const AUTHORIZATION_VALUE = /(authorization\s*[:=]\s*)Bearer\s+[^\s,}\]]+/gi;
const AUTH_BASIC_VALUE = /(authorization\s*[:=]\s*)Basic\s+[^\s,}\]]+/gi;
const COOKIE_VALUE = /((?:^|[,\s{])cookie\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^}\r\n]*)/gi;
const URL_ENCODED_CREDENTIAL = /((?:password|passwd|pwd|token|authorization|cookie|credential|email|name|phone|mobile|address|birth(?:date)?|비밀번호|토큰|회원명|주소|이메일|연락처|전화번호|생년월일)(?:%3A|%3D))[^&\s,}\]]+/gi;
const KOREAN_CREDENTIAL = /((?:비밀번호|토큰|인증|쿠키|회원명|주소)\s*[:=]\s*)[^\s,}\]&]+/g;
const ADDRESS_TEXT = /(주소\s+)[가-힣][가-힣 ]{1,80}/g;
const ADDRESS_VALUE = /(주소\s*=\s*)[^\n]{1,160}(?=\s+(?:[A-Za-z]+(?:%3D|=))|$)/g;

function normalizeKey(value) {
  return String(value).toLowerCase().replace(/[_.-]/g, '');
}

function isSensitiveKey(key) {
  const normalized = normalizeKey(key);
  if (normalized === 'hostname' || normalized === 'filename' || normalized === 'eventname') return false;
  if (SENSITIVE_KEYS.has(normalized)) return true;
  if (new Set(['fullname', 'membername', 'username', 'shippingaddress', 'billingaddress', 'homeaddress']).has(normalized)) return true;
  const tokens = String(key).replace(/([a-z])([A-Z])/g, '$1 $2').split(/[_.\-\s]+/).map(normalizeKey);
  const prefix = tokens.slice(0, -1).join('');
  return (tokens.includes('password') || tokens.includes('passwd') || tokens.includes('token') || tokens.includes('secret'))
    || (tokens.includes('address') && /(?:shipping|billing|home|member|user)/.test(prefix))
    || (tokens.includes('name') && /(?:full|member|user)/.test(prefix));
}

function safeRead(object, key) {
  try {
    return { ok: true, value: object[key] };
  } catch (_) {
    return { ok: false, value: REDACTED };
  }
}

function safeKeys(value, limit = MAX_COPY_KEYS) {
  const keys = [];
  try {
    for (const key in value) {
      try {
        if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      } catch (_) {
        return keys;
      }
      keys.push(key);
      if (keys.length >= limit) break;
    }
    return keys;
  } catch (_) {
    return keys;
  }
}

function sanitizeString(value) {
  if (Buffer.byteLength(value, 'utf8') > MAX_STRING_LENGTH) return TRUNCATED;
  return value
    .replace(AUTHORIZATION_VALUE, '$1[REDACTED]')
    .replace(AUTH_BASIC_VALUE, '$1[REDACTED]')
    .replace(COOKIE_VALUE, '$1[REDACTED]')
    .replace(URL_ENCODED_CREDENTIAL, '$1[REDACTED]')
    .replace(ADDRESS_VALUE, '$1[REDACTED]')
    .replace(KOREAN_CREDENTIAL, '$1[REDACTED]')
    .replace(CREDENTIAL_VALUE, '$1[REDACTED]')
    .replace(EMAIL, REDACTED)
    .replace(KOREAN_PHONE, '$1[REDACTED]')
    .replace(BEARER, REDACTED)
    .replace(JWT, REDACTED)
    .replace(MEMBER_NAME, '$1[REDACTED]')
    .replace(ADDRESS_TEXT, '$1[REDACTED]')
    .replace(HYPHENATED_SECRET, REDACTED);
}

function createSanitizer(redaction = {}) {
  const additionalKeys = new Set((redaction.additionalKeys || []).filter(Boolean).map(normalizeKey));
  const additionalPaths = new Set((redaction.additionalPaths || []).filter((path) => typeof path === 'string' && path).map((path) => path.toLowerCase()));

  function isSensitive(key, currentPath) {
    return isSensitiveKey(key) || additionalKeys.has(normalizeKey(key)) || additionalPaths.has(currentPath.toLowerCase());
  }

  function sanitize(value) {
    const state = { nodes: 0, keys: 0, bytes: 0, seen: new WeakSet() };
    function visit(current, path, depth) {
      try {
      if (++state.nodes > MAX_NODES || depth > MAX_DEPTH) return TRUNCATED;
      if (current === null || current === undefined) return current;
      if (typeof current === 'string') {
        if (Buffer.byteLength(current, 'utf8') > MAX_STRING_LENGTH) return TRUNCATED;
        state.bytes += Buffer.byteLength(current, 'utf8');
        return state.bytes > MAX_BYTES ? TRUNCATED : sanitizeString(current);
      }
      if (typeof current === 'number' || typeof current === 'boolean') return current;
      if (typeof current === 'bigint') return String(current);
      if (typeof current === 'function' || typeof current === 'symbol') return undefined;
      if (typeof current !== 'object') return String(current);
      if (state.seen.has(current)) return CIRCULAR;
      state.seen.add(current);
      if (Object.prototype.toString.call(current) === '[object Date]') {
        const timestamp = current.getTime();
        return Number.isNaN(timestamp) ? TRUNCATED : new Date(timestamp).toISOString();
      }
      if (Array.isArray(current)) return current.slice(0, MAX_COPY_KEYS).map((item, index) => visit(item, `${path}.${index}`, depth + 1));

      const result = {};
      for (const key of safeKeys(current)) {
        if (++state.keys > MAX_KEYS) {
          result.__truncated__ = TRUNCATED;
          break;
        }
        const nextPath = path ? `${path}.${key}` : key;
        const read = safeRead(current, key);
        result[key] = isSensitive(key, nextPath) ? REDACTED : read.ok ? visit(read.value, nextPath, depth + 1) : REDACTED;
      }
      return result;
      } catch (_) {
        return REDACTED;
      }
    }
    try {
      return visit(value, '', 0);
    } catch (_) {
      return REDACTED;
    }
  }
  return sanitize;
}

module.exports = { REDACTED, createSanitizer, safeRead, safeKeys };
