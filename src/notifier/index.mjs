import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  ErrorNotifier,
  SlackNotifier,
  formatScriptResultMessage,
  formatDeploymentResultMessage,
} = require('./index.cjs');

export {
  ErrorNotifier,
  SlackNotifier,
  formatScriptResultMessage,
  formatDeploymentResultMessage,
};
export default {
  ErrorNotifier,
  SlackNotifier,
  formatScriptResultMessage,
  formatDeploymentResultMessage,
};
