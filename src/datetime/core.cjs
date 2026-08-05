'use strict';

const dayjs = require('dayjs');
const customParseFormat = require('dayjs/plugin/customParseFormat');
const timezone = require('dayjs/plugin/timezone');
const utc = require('dayjs/plugin/utc');

dayjs.extend(customParseFormat);
dayjs.extend(utc);
dayjs.extend(timezone);

const SEOUL_TIME_ZONE = 'Asia/Seoul';
const DATE_FORMAT = 'YYYY-MM-DD';
const DATETIME_FORMAT = 'YYYY-MM-DD HH:mm:ss';
const INSTANT_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/;
const MIN_YEAR = 1970;
const MAX_YEAR = 9999;

function assertString(value) {
  if (typeof value !== 'string') {
    throw new TypeError('Date time value must be a string');
  }
}

function assertValidDate(value) {
  if (!(value instanceof Date)) {
    throw new TypeError('Date time value must be a Date');
  }

  if (Number.isNaN(value.getTime())) {
    throw new RangeError('Date time value must be valid');
  }
}

function isValidLocalDateTime(value) {
  return dayjs.utc(value, DATETIME_FORMAT, true).isValid();
}

function hasSupportedYear(value) {
  const year = Number(value.slice(0, 4));
  return year >= MIN_YEAR && year <= MAX_YEAR;
}

function now() {
  return new Date();
}

function parseInstant(value) {
  assertString(value);

  const match = INSTANT_PATTERN.exec(value);
  if (!match || !hasSupportedYear(match[1]) || !isValidLocalDateTime(`${match[1]} ${match[2]}`)) {
    throw new RangeError('Date time value must be a valid instant');
  }

  const offset = match[4];
  if (offset !== 'Z') {
    const offsetHour = Number(offset.slice(1, 3));
    const offsetMinute = Number(offset.slice(4, 6));
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) {
      throw new RangeError('Date time value must be a valid instant');
    }
  }

  const result = new Date(value);
  if (Number.isNaN(result.getTime())) {
    throw new RangeError('Date time value must be a valid instant');
  }

  return result;
}

function parseSeoulDateTime(value) {
  assertString(value);

  if (!hasSupportedYear(value) || !isValidLocalDateTime(value)) {
    throw new RangeError('Date time value must be a valid Seoul date time');
  }

  return dayjs.tz(value, DATETIME_FORMAT, SEOUL_TIME_ZONE).toDate();
}

function toUtcIso(value) {
  assertValidDate(value);
  return value.toISOString();
}

function formatSeoulDateTime(value) {
  assertValidDate(value);
  return dayjs(value).tz(SEOUL_TIME_ZONE).format(DATETIME_FORMAT);
}

function formatSeoulDate(value) {
  assertValidDate(value);
  return dayjs(value).tz(SEOUL_TIME_ZONE).format(DATE_FORMAT);
}

module.exports = {
  SEOUL_TIME_ZONE,
  DATE_FORMAT,
  DATETIME_FORMAT,
  now,
  parseInstant,
  parseSeoulDateTime,
  toUtcIso,
  formatSeoulDateTime,
  formatSeoulDate,
};
