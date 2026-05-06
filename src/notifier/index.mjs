import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { ErrorNotifier } = require('./index.cjs');

export { ErrorNotifier };
export default { ErrorNotifier };
