/**
 * Mast build file. The main file
 */

var define = require('./define/index');
var Region = require('./region/index');
var Component = require('./component/index');
var raise = require('./raise/index');

(function(global, frameworkName, $, _, Backbone, undefined) {

	// Use custom frameworkId if provided or default to 'FRAMEWORK'
	var frameworkId = frameworkName || 'FRAMEWORK';

	// Use provided Backbone or default to global
	Backbone = Backbone || global.Backbone;

	// Use provided $ or default to global
	$ = $ || global.$;
	
	// Use provided _ or default to global
	_ = _ || global._;

	// Start off with Backbone and build on top of it
	global[frameworkId] = Backbone;

	///////////////////////////////////
	// Hack!
	///////////////////////////////////
	FRAMEWORK = global[frameworkId];

	// Start w/ empty templates, components, and data
	FRAMEWORK.templates = {};
	FRAMEWORK.components = {};
	FRAMEWORK.data = {};
	FRAMEWORK._defineQueue = [];

	// Region cache
	FRAMEWORK.regions = {};

	// Shortcut defaults
	FRAMEWORK.shortcut = {};
	FRAMEWORK.shortcut.template = true;
	FRAMEWORK.shortcut.count = true;


	FRAMEWORK.Region = Region;
	FRAMEWORK.Component = Component;

	FRAMEWORK.define = define;
	FRAMEWORK.raise = raise;

})



/**
 * If you want to pass in a custom Framework name,
 * a Backbone instance, an underscore/lodash instance,
 * or a jQuery instance, you can do so as optional parameters 
 * here, e.g.
 * (window, 'Foo', $, _, Backbone)
 *
 * Otherwise, just pass in `window` and 'FRAMEWORK', window.$, 
 * window._, window.Backbone will be used, e.g.
 * (window)
 */

(window, 'Eikon');






