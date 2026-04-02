import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { LoggerFactory, morganMiddleware } = require('./index.cjs');

export { LoggerFactory, morganMiddleware };
export default { LoggerFactory, morganMiddleware };
