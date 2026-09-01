import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  ErrorNotifier,
  DevNotifier,
} = require('./index.cjs');

export {
  ErrorNotifier,
  DevNotifier,
};
export default {
  ErrorNotifier,
  DevNotifier,
};
