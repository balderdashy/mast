/**
 * Mast build file. The main file
 */

var define = require('./define/index');
var Region = require('./region/index');
var raise = require('./raise/index');

(function(global, undefined) {

	global.FRAMEWORK = Backbone;

	FRAMEWORK.define = define;
	FRAMEWORK.Region = Region;

	// Region cache
	FRAMEWORK.regions = {};

	// Shortcut defaults
	FRAMEWORK.shortcut = {};
	FRAMEWORK.shortcut.template = true;
	FRAMEWORK.shortcut.count = true;

	FRAMEWORK.raise = raise;
	FRAMEWORK.raise();

})(window);
