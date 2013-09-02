/**
 *
 *
 */

function Logger (Framework) {

	var noop = function () {};

	// If log is specified, use it, otherwise use the console
	if (Framework.logger) {
			Framework.error     = Framework.logger.error;
			Framework.warn      = Framework.logger.warn;
			Framework.log       = Framework.logger.debug || Framework.logger;
			Framework.verbose   = Framework.logger.verbose;
	}

	// In IE, we can't default to the browser console because there IS NO BROWSER CONSOLE
	else if (typeof console !== 'undefined') {

		// we are in ie 9 or 8.
		if (_.isUndefined(console.log.bind))  {
				Framework.error     = noop;
				Framework.warn      = noop;
				Framework.log       = noop;
				Framework.debug     = noop;
				Framework.verbose   = noop;
		}

		// We are in a friendly browser like Chrome, Firefox, or IE10
		else {
			Framework.error		= console.error && console.error.bind(console);
			Framework.warn		= console.warn && console.warn.bind(console);
			Framework.log		= console.debug && console.debug.bind(console);
			Framework.verbose	= console.log && console.log.bind(console);

			// Turn off all logs in production
			if (Framework.production) {
					Framework.logLevel = 'silent';
			}

			// Use log level config if provided
			switch ( Framework.logLevel ) {
				case 'verbose': break;

				case 'debug':   Framework.verbose = noop;
								break;

				case 'warn':    Framework.verbose = Framework.log = noop;
								break;

				case 'error':   Framework.verbose = Framework.log =
								Framework.warn = noop;
								break;

				case 'silent':  Framework.verbose = Framework.log =
								Framework.warn = Framework.error = noop;
								break;

				default:        throw new Error ('Unrecognized logging level config ' +
												'(' + Framework.id + '.logLevel = "' + Framework.logLevel + '")');
			}

			// Support for `debug` for backwards compatibility
			Framework.debug = Framework.log;

			// Verbose spits out log level
			Framework.verbose('Log level set to :: ', Framework.logLevel);
		}
	}
}
