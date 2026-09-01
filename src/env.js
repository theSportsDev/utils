'use strict';

const dotenv = require('dotenv');

dotenv.config({ quiet: true });

const env = {};

Object.defineProperties(env, {
  nodeEnv: {
    enumerable: true,
    get() {
      return process.env.NODE_ENV || 'development';
    },
  },
  devNotifierSlackToken: {
    enumerable: false,
    get() {
      return process.env.DEV_NOTIFIER_SLACK_TOKEN;
    },
  },
  devNotifierSlackChannel: {
    enumerable: true,
    get() {
      return process.env.DEV_NOTIFIER_SLACK_CHANNEL;
    },
  },
});

module.exports = env;
