/**
 * Mast build file. The main file
 */

var define = require('./define/index');
var Region = require('./region/index');
var Component = require('./component/index');
var raise = require('./raise/index');

/**
 * Framework class definition that has the propeties that our custom framework will need
 *
 * @param {Object} options [options hash to initialize the custom framework with]
 */
Framework = function(options) {
	// Set default options if some are not passed in.
	options = _.defaults(options, {
		logLevel: 'warn',
		frameworkId: 'Mast',
		shortcut: {
			template: true,
			count: true
		}
	});

	// Set starting point to Backbone and add additional attributes
	_.extend(this, Backbone, {
		options: options,
		template: {},
		components: {},
		data: {},
		_defineQueue: [],
		regions: {}
	});

	// Set a global value to be an instance of a custom framework.
	var frameworkName = options.frameworkId;
	window[frameworkName] = this

	// Make a value accessable that is tied to the custom framework.
	FRAMEWORK = window[frameworkName];
}

// Framework prototype methods.
Framework.prototype.Region = Region;
Framework.prototype.Component = Component;
Framework.prototype.define = define;
Framework.prototype.raise = raise;

