/**
 * Logger will allow the use of any logger as well as support multiple log levels
 * depending on a defined propery called `loglevel`.
 */

function Logger(Framework) {

  // If log is specified, use it, otherwise use the console
  if (Framework.logger) {
    Framework.error = Framework.logger.error;
    Framework.warn = Framework.logger.warn;
    Framework.log = Framework.logger.debug || Framework.logger;
    Framework.verbose = Framework.logger.verbose;
  }
  // In IE, we can't default to the browser console because there IS NO BROWSER CONSOLE
  else if (typeof console !== 'undefined') {
    Framework.error = console && console.error && console.error.bind(console);
    Framework.warn = console && console.warn && console.warn.bind(console);
    Framework.log = console && console.log && console.log.bind(console);
    Framework.verbose = console && console.debug && console.debug.bind(console);
  }

  // Support for `debug` for backwards compatibility
  Framework.debug = Framework.log;

  // Turn off all logs in production
  if (Framework.production) {
    Framework.logLevel = 'silent';
  }

  // Use log level config if provided
  var noop = function() {};
  switch (Framework.logLevel) {

    case 'verbose':
      break;

    case 'debug':
      Framework.verbose = noop;
      break;

    case 'warn':
      Framework.verbose = Framework.log = Framework.debug = noop;
      break;

    case 'error':
      Framework.verbose = Framework.log = Framework.debug = Framework.warn = noop;
      break;

    case 'silent':
      Framework.verbose = Framework.log = Framework.debug = Framework.warn =
      Framework.error = noop;
      break;

    default:
      throw new Error('Unrecognized logging level config ' +
        '(' + Framework.id + '.logLevel = "' + Framework.logLevel + '")');
  }
}
