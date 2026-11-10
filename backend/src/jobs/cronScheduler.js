const cron = require('node-cron');

function schedule(expression, callback, options) {
  return cron.schedule(expression, callback, options);
}

module.exports = { schedule };
