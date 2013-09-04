/**
 * Mast build file. The main file
 */

var define = require('./define/index');
var Region = require('./region/index');
var raise = require('./raise/index');

(function(global, undefined) {

	global.FRAMEWORK = {}

	FRAMEWORK.define = define;
	FRAMEWORK.Region = Region;

	FRAMEWORK.raise = raise;
	FRAMEWORK.raise();

})(window);
