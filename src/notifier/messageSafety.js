'use strict';

function sanitizeSlackMarkup(value) {
  return String(value).replace(
    /<!(?:channel|here|everyone)>|<!subteam\^[^>]*>|<@[^>]*>/gi,
    '[mention removed]',
  );
}

module.exports = { sanitizeSlackMarkup };
