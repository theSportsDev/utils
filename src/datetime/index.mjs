import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const datetime = require('./core.cjs');

const {
  SEOUL_TIME_ZONE,
  DATE_FORMAT,
  DATETIME_FORMAT,
  now,
  parseInstant,
  parseSeoulDateTime,
  toUtcIso,
  formatSeoulDateTime,
  formatSeoulDate,
} = datetime;

export {
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

export default datetime;
