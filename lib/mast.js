;(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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

},{"./define/index":3,"./raise/index":9,"./region/index":14}],2:[function(require,module,exports){
/**
 * Run definition methods to get actual component definitions.
 * This is deferred to avoid having to use Backbone's function () {} approach for things
 * like collections.
 */

/**
 * Build ups a component definition by running the definition. We then link the
 * component definition to an identifier in `FRAMEWORK.components`.
 *
 * @param  {Object} component [Object containing the definition function of the component]
 */
module.exports = function buildComponentDefinition(component) {
	var componentDef = component.definition();

	if (component.idOverride) {
		if (componentDef.id) {
			throw new Error(component.idOverride + ':: Cannot specify an idOverride in .define() if an id property ('+componentDef.id+') is already set in your component definition!\nUsage: .define([idOverride], definition)');
		}
		componentDef.id = component.idOverride;
	}
	if (!componentDef.id) {
		throw new Error('Cannot use .define() without defining an id property or override in your component!\nUsage: .define([idOverride], definition)');
	}
	FRAMEWORK.components[componentDef.id] = componentDef;
};

},{}],3:[function(require,module,exports){
/**
 * Optional method to require app components. Require.js can be used instead
 * as needed.
 *
 * @param  {String} 	[(optional) Component id override]
 * @param  {Function} [Function Definition of component]
 */
module.exports = function define(id, definitionFn) {
	// Id param is optional
	if (!definitionFn) {
		definitionFn = id;
		id = null;
	}

	FRAMEWORK._defineQueue.push({
		definition: definitionFn,
		idOverride: id
	});
};

},{}],4:[function(require,module,exports){
/**
 *	Logget constructor method that will setup FRAMEWORK to log messages.
 */

var setupLogger = require('./setup');

module.exports = function Logger() {

	// Upon initialization, setup logger
	setupLogger(FRAMEWORK.logLevel);

	// In supported browsers, also run setupLogger again
	// when FRAMEWORK.logLevel is set by the user
	if (_.isFunction(FRAMEWORK.__defineSetter__)) {
		FRAMEWORK.__defineSetter__('logLevel', function onChange (newLogLevel) {
			setupLogger(newLogLevel);
		});
	}
};

},{"./setup":5}],5:[function(require,module,exports){
/**
 * Set up the log functions:
 *
 * FRAMEWORK.error
 * FRAMEWORK.warn
 * FRAMEWORK.log
 * FRAMEWORK.debug (*legacy)
 * FRAMEWORK.verbose
 *
 * @param  {String} logLevel [The desired log level of the Logger]
 */
module.exports = function setupLogger (logLevel) {

	var noop = function () {};

	// If log is specified, use it, otherwise use the console
	if (FRAMEWORK.logger) {
		FRAMEWORK.error     = FRAMEWORK.logger.error;
		FRAMEWORK.warn      = FRAMEWORK.logger.warn;
		FRAMEWORK.log       = FRAMEWORK.logger.debug || FRAMEWORK.logger;
		FRAMEWORK.verbose   = FRAMEWORK.logger.verbose;
	}

	// In IE, we can't default to the browser console because there IS NO BROWSER CONSOLE
	else if (typeof console !== 'undefined') {

		// We cannot called the .bind method on the console methods. We are in ie 9 or 8, just make
		// everyhting a noop.
		if (_.isUndefined(console.log.bind))  {
			FRAMEWORK.error     = noop;
			FRAMEWORK.warn      = noop;
			FRAMEWORK.log       = noop;
			FRAMEWORK.debug     = noop;
			FRAMEWORK.verbose   = noop;
		}

		// We are in a friendly browser like Chrome, Firefox, or IE10
		else {
			FRAMEWORK.error		= console.error && console.error.bind(console);
			FRAMEWORK.warn		= console.warn && console.warn.bind(console);
			FRAMEWORK.log			= console.debug && console.debug.bind(console);
			FRAMEWORK.verbose	= console.log && console.log.bind(console);

			// Use log level config if provided
			switch (logLevel) {
				case 'verbose': break;

				case 'debug':
					FRAMEWORK.verbose = noop;
					break;

				case 'warn':
					FRAMEWORK.verbose = FRAMEWORK.log = noop;
					break;

				case 'error':
					FRAMEWORK.verbose = FRAMEWORK.log = FRAMEWORK.warn = noop;
					break;

				case 'silent':
					FRAMEWORK.verbose = FRAMEWORK.log = FRAMEWORK.warn = FRAMEWORK.error = noop;
					break;

				default:
					throw new Error ('Unrecognized logging level config ' +
					'(' + FRAMEWORK.id + '.logLevel = "' + logLevel + '")');
			}

			// Support for `debug` for backwards compatibility
			FRAMEWORK.debug = FRAMEWORK.log;

			// Verbose spits out log level
			FRAMEWORK.verbose('Log level set to :: ', logLevel);
		}
	}
}

},{}],6:[function(require,module,exports){
/**
 * Given a component definition and its key, we will build up the component prototype and merge
 * this component with its matching template.
 *
 * @param  {Object} componentDef [Object containing the component definition]
 * @param  {String} componentKey [The component identifier]
 */

var Utils = require('../utils/utils');

module.exports = function buildComponentPrototype(componentDef, componentKey) {

	// If component id is not explicitly set, use the componentKey
	if (!componentDef.id) componentDef.id = componentKey;

	// Search templates
	var template = FRAMEWORK.templates[componentDef.id];

	// If no match for component was found in templates, issue a warning
	if (!template) {
		return FRAMEWORK.warn(
			componentDef.id + ' :: No template found for component!' +
			'\nTemplates don\'t need a component unless you want interactivity, ' +
			'every component *should* have a matching template!!' +
			'\nUsing components without templates may seem necessary, ' +
			'but it\'s not.  It makes your view logic incorporeal, and makes your colleagues ' +
			'uncomfortable.');
	}

	// Save reference to template in component prototype
	FRAMEWORK.verbose(componentDef.id + ' :: Pairing component with template...');
	componentDef.template = template;

	// Translate right-hand shorthand for top-level keys
	// TODO: require utils
	componentDef = Utils.objMap(componentDef, FRAMEWORK.Util.translateShorthand);

	// and events object
	// TODO: require utils
	if (componentDef.events) {
		componentDef.events = Utils.objMap(
			componentDef.events,
			FRAMEWORK.Util.translateShorthand
		);
	}

	// and afterChange bindings
	// TODO: require utils
	if (_.isObject(componentDef.afterChange) && !_.isFunction(componentDef.afterChange)) {
		componentDef.afterChange = Utils.objMap(
			componentDef.afterChange,
			FRAMEWORK.Util.translateShorthand
		);
	}

	// Go ahead and turn the definition into a real component prototype
	FRAMEWORK.verbose(componentDef.id + ' :: Building component prototype...');
	var componentPrototype = FRAMEWORK.Component.extend(componentDef);

	// Discover subscriptions
	componentPrototype.prototype.subscriptions = {};

	// Iterate through each property on this component prototype
	_.each(componentPrototype.prototype, function (handler, key) {

		// Add app events (%), routes (#), and data listeners (~) to subscriptions hash
		if (key.match(/^(%|#|~)/)) {
			if (_.isString(handler)) {
				throw new Error(componentDef.id + ':: Invalid listener for subscription: ' + key + '.\n' +
					'Define your callback with an anonymous function instead of a string.'
				);
			}
			if (!_.isFunction(handler)) {
				throw new Error(componentDef.id +':: Invalid listener for subscription: ' + key);
			}
			componentPrototype.prototype.subscriptions[key] = handler;
		}

		// Extend one or more other components
		else if (key === 'extendComponents') {
			var objToMerge = {};
			_.each(handler, function(childId){

				if (!FRAMEWORK.components[childId]){
					throw new Error(
					componentDef.id + ' :: ' +
					'Trying to define/extend this component from `' + childId + '`, ' +
					'but no component with that id can be found.'
					);
				}

				_.extend(objToMerge, FRAMEWORK.components[childId]);
			});

			_.defaults(componentPrototype.prototype, objToMerge);
		}
	});

	// Save prototype in global set for tracking
	FRAMEWORK.components[componentDef.id] = componentPrototype;
};

},{"../utils/utils":18}],7:[function(require,module,exports){
/**
 * Collect any regions with the default component set from the DOM.
 */

module.exports = function collectRegions () {

	// Provide backwards compatibility for legacy notation
	$('region[default],region[template]').each(function() {
		$e = $(this);
		var componentId = $e.attr('default') || $e.attr('template');
		$e.attr('contents', componentId);
	});

	// Now instantiate the appropriate default component in each
	// region with a specified template/component
	$('region[contents]').each(function() {
		FRAMEWORK.Region.fromElement(this);
	});
}

},{}],8:[function(require,module,exports){
/**
 * Load any script tags on the page with type="text/template".
 *
 * @return {Object} [Object consisting of a template identifier and its HTML.]
 */

var Utils = require('../utils/utils');

module.exports = function collectTemplates() {
	var templates = {};

	$('script[type="text/template"]').each(function (i, el) {
		var id = Utils.el2id(el, true);
		templates[id] = $(el).html();

		// Strip whitespace leftover from script tags
		templates[id] = templates[id].replace(/^\s+/,'');
		templates[id] = templates[id].replace(/\s+$/,'');

		// Remove from DOM
		$(el).remove();
	});

	return templates;
};

},{"../utils/utils":18}],9:[function(require,module,exports){
/**
 * This is the starting point to your application.  You should grab templates and components
 * before calling FRAMEWORK.raise() using something like Require.js.
 *
 * @param {Object} options
		data: { authenticated: false },
		templates: { componentName: HTMLOrPrecompiledFn },
		components: { componentName: ComponentDefinition }
 * @param {Function} cb
 */

var Logger = require('../logger/index');
var buildComponentDefinition = require('../define/buildDefinition');
var buildComponentPrototype = require('./buildPrototype');
var collectTemplates = require('./collectTemplates');
var collectRegions = require('./collectRegions');


module.exports = function raise(options, cb) {

	// If only one arg is present, use options as callback if possible.
	// If options are not defined, use an empty object.
	if (!cb && _.isFunction(options)) {
		cb = options;
	}
	if (!_.isPlainObject(options)) {
		options = {};
	}

	// Apply defaults
	_.defaults(FRAMEWORK, {
		throttleWindowResize: 200,
		logLevel: 'warn',
		logger: undefined,
		production: false
	});

	// Apply overrides from options
	_.extend(FRAMEWORK, options);

	// Interpret `production` as `logLevel === 'silent'`
	if (FRAMEWORK.production) {
		FRAMEWORK.logLevel = 'silent';
	}

	// Initialize logger
	new Logger();

	// Merge data into FRAMEWORK.data
	_.extend(FRAMEWORK.data, options.data || {});

	// Merge specified templates with FRAMEWORK.templates
	_.extend(FRAMEWORK.templates, options.templates || {});

	// If FRAMEWORK.define() was used, build the list of components
	// Iterate through the define queue and create each definition
	FRAMEWORK._defineQueue = [];
	_.each(FRAMEWORK._defineQueue, buildComponentDefinition);

	// Merge specified components w/ FRAMEWORK.components
	_.extend(FRAMEWORK.components, options.components || {});

	// Back up each component definition before transforming it into a live prototype
	FRAMEWORK.componentDefs = _.clone(FRAMEWORK.components);

	// Run this call back when the DOM is ready
	$(function () {

		// Collect any <script> tag templates on the page
		// and absorb them into FRAMEWORK.templates
		_.extend(FRAMEWORK.templates, collectTemplates());

		// Build actual prototypes for the components
		// (need the templates at this point to make this work)
		_.each(FRAMEWORK.components, buildComponentPrototype);

		// Grab initial regions from DOM
		collectRegions();

		// Bind global DOM events as FRAMEWORK events
		// (e.g. %window:resize)
		var triggerResizeEvent = _.debounce(function () {
			FRAMEWORK.trigger('%window:resize');
		}, options.throttleWindowResize || 0);
		$(window).resize(triggerResizeEvent);
		// TODO: add more events and extrapolate this logic to a separate module

		// Do the initial routing sequence
		// Look at the #fragment url and fire the global route event
		FRAMEWORK.history.start(_.defaults({
			pushState: undefined,
			hashChange: undefined,
			root: undefined
		}, options));

		if (cb) cb();
	});
};

},{"../define/buildDefinition":2,"../logger/index":4,"./buildPrototype":6,"./collectRegions":7,"./collectTemplates":8}],10:[function(require,module,exports){
/**
 * region.append( componentId, [properties] )
 *
 * Calls insert() at last position
 */

module.exports = function append(componentId, properties) {
	// Insert at last position
	return this.insert(this._children.length, componentId, properties);
};

},{}],11:[function(require,module,exports){
/**
 * Shortcut for calling empty() and then append(),
 * This is the general use case for managing subcomponents
 * (e.g. when a navbar item is touched)
 *
 * @param  {string} component  The id name of the componet that you want to attach.
 * @param  {Object} properties Properties that the attached component will be initalized with.
 */

module.exports = function attach(component, properties) {
	this.empty();
	return this.append(component, properties);
};

},{}],12:[function(require,module,exports){
/**
 * region.empty( )
 *
 * Iterate over each component in this region and call .close() on it
 */

module.exports = function empty() {
	FRAMEWORK.debug(this.parent.id + ' :: Emptying region: ' + this.id);
	while (this._children.length > 0) {
		this.remove(0);
	}
};

},{}],13:[function(require,module,exports){
/**
 * Factory method to generate a new region instance from a DOM element
 * Implements `template`, `count`, and `data-*` HTML attributes.
 *
 * @param {Object} options
 * @returns region instance
 */

var Utils = require('../utils/utils');

module.exports = function fromElement(el, parent) {

	// If parent is not specified, make-believe
	parent = parent || { id: '*' };



	// Build region
	var region = new FRAMEWORK.Region({
		id: Utils.el2id(el),
		$el: $(el),
		parent: parent
	});

	// If this region has a default component/template set,
	// grab the id  --  e.g. <region contents="Foo" />
	var componentId = $(el).attr('contents');


	// If `count` is set, render sub-component specified number of times.
	// e.g. <region template="Foo" count="3" />
	// (verify FRAMEWORK.shortcut.count is enabled)
	var countAttr,
		count = 1;

	if (FRAMEWORK.shortcut.count) {

		// If `count` attribute is not false or undefined,
		// that means it was set explicitly, and we should use it
		countAttr = $(el).attr('count');
		// FRAMEWORK.debug('Count attr is :: ', countAttr);
		if (!!countAttr) {
			count = countAttr;
		}
	}


	FRAMEWORK.debug(
		parent.id + ' :-: Instantiated new region' +
		( region.id ? ' `' + region.id + '`' : '' ) +
		( componentId ? ' and populated it with' +
			( count > 1 ? count + ' instances of' : ' 1' ) +
			' `' + componentId + '`' : ''
		) + '.'
	);



	// Append sub-component(s) to region automatically
	// (verify FRAMEWORK.shortcut.template is enabled)
	if ( FRAMEWORK.shortcut.template && componentId ) {

		// FRAMEWORK.debug(
		// 	'Preparing to render ' + count + ' ' + componentId + ' components into region ' +
		// 	'(' + region.id + '), which already contains ' + region.$el.children().length +
		// 	' subcomponents.'
		// );

		region.append(componentId);

		// //////////////////////////////////////////
		// // SERIOUSLY WTF
		// // MAJOR HAXXXXXXX
		// //////////////////////////////////////////
		// count = +count + 1;
		// //////////////////////////////////////////

		// for (var j=0; j < count; j++ ) {

		// 	region.append(componentId);

		// 	// FRAMEWORK.debug(
		// 	// 	'rendering the ' + componentId + ' component, remaining: ' +
		// 	// 	count + ' and there are ' + region.$el.children().length +
		// 	// 	' subcomponent elements in the region now'
		// 	// );

		// }

	}

	return region;
};

},{"../utils/utils":18}],14:[function(require,module,exports){
/**
 * Regions
 */

var insert = require('./empty');
var remove = require('./remove');
var empty = require('./empty');
var append = require('./append');
var attach = require('./attach');
var fromElement = require('./fromElement');

Region = module.exports = function constructor(properties) {

	_.extend(this, FRAMEWORK.Events);

	if (!properties) {
		properties = {};
	}
	if (!properties.$el) {
		throw new Error('Trying to instantiate region with no $el!');
	}

	// Fold in properties to prototype
	_.extend(this, properties);

	// If neither an id nor a `template` was specified,
	// we'll throw an error, since there's no way to get a hold of the region
	if (!this.id && !(this.$el.attr('default') || this.$el.attr('template') ||
			this.$el.attr('contents'))) {

		throw new Error(
			this.parent.id + ' :: Either `data-id`, `contents`, or both ' +
			'must be specified on regions. \n' +
			'e.g. <region data-id="foo" template="SomeComponent"></region>'
		);
	}

	// Set up list to house child components
	this._children = [];

	_.bindAll(this);

	// Set up convenience access to this region in the global region cache
	FRAMEWORK.regions[this.id] = this;
};

Region.fromElement = function (el, parent) { return fromElement.call(this, el, parent);};
Region.prototype.remove = function (atIndex) { return remove.call(this, atIndex);};
Region.prototype.empty = function() {return empty.call(this);};
Region.prototype.insert = function (atIndex, componentId, properties) {
	return insert.call(this, atIndex, componentId, properties);
};
Region.prototype.append = function(componentId, properties) {
	return append.call(this, componentId, properties);
};
Region.prototype.attach = function(component, properties) {
	return append.call(this, component, properties);
};

},{"./append":10,"./attach":11,"./empty":12,"./fromElement":13,"./remove":15}],15:[function(require,module,exports){
/**
 * region.remove( atIndex )
 *
 */
module.exports = function remove(atIndex) {

	if (!atIndex && !_.isFinite(atIndex)) {
		throw new Error(this.id + '.remove() :: No atIndex specified! \nUsage: remove(atIndex)');
	}

	// Remove the component from the list
	var component = this._children.splice(atIndex, 1);
	if (!component[0]) {

		// If the list is empty, freak out
		throw new Error(this.id + '.remove() :: Trying to remove a component that doesn\'t exist at index ' + atIndex);
	}

	// Squeeze the component to do get all the bindy goodness out
	component[0].close();

	FRAMEWORK.debug(this.parent.id + ' :: Removed component at index ' + atIndex + ' from region: ' + this.id);
};

},{}],16:[function(require,module,exports){
/**
 * Bare-bones DOM/UI utilities
 */

var Events = require('./events');

DOM = {

	/**
	 * Expose the "DOMmy-eventedness" of elements so that it's selectable via CSS
	 * You can use this to apply a few choice DOM modifications out the gate--
	 * (e.g. tweaks targeting common issues that typically get forgotten, like disabling text selection)
	 *
	 * @param {Component} component
	 */
	flagBoundEvents: function ( component ) {

		// TODO: provide access to bound global events (%) and routes (#) as well
		// TODO: flag all DOM events, not just click and touch

		// Build subset of just the click/touch events
		var clickOrTouchEvents = Events.parse(
			component.events,
			{ only: ['click', 'touch', 'touchstart', 'touchend'] }
		);

		// If no click/touch events found, bail out
		if ( clickOrTouchEvents.length < 1 ) return;

		// Query affected elements from DOM
		var $affected = Events.getElements(clickOrTouchEvents, component);

		// NOTE: For now, this is always just 'click'
		var boundEventsString = 'click';

		// Set `data-FRAMEWORK-clickable` custom attribute
		// (ui logic should be extended in CSS)
		$affected.attr('data-' + FRAMEWORK.id + '-events', boundEventsString);

		Framework.verbose(
			component.id + ' :: ' +
			'Disabled user text selection on elements w/ click/touch events:',
			clickOrTouchEvents,
			$affected
		);
	},


	/**
	 * Supported "first-class" DOM events.
	 * @type {Array}
	 */
	events: [

		// Localized browser events
		// (works on individual elements)
		'error', 'scroll',

		// Mouse events
		'click', 'dblclick', 'mousedown', 'mouseup', 'hover', 'mouseenter', 'mouseleave',
		'mouseover', 'mouseout', 'mousemove',

		// Keyboard events
		'keydown', 'keyup', 'keypress',

		// Form events
		'blur', 'change', 'focus', 'focusin', 'focusout', 'select', 'submit',

		// Raw touch events
		'touchstart', 'touchend', 'touchmove', 'touchcancel',

		// Manufactured events
		'touch',

		// TODO:
		'rightclick', 'clickoutside'
	]
};

module.exports = DOM;

},{"./events":17}],17:[function(require,module,exports){
/**
 * Utility Event toolkit
 */

var Utils = require('./utils');

Events = {

	/**
	 * Parses a dictionary of events and optionally filters by the event type. If the event
	 *
	 * @param  {Object} events  [A Backbone.View events object]
	 * @param  {Object} options [Options object that allows us to filter parsing to certain event
	 *                           names]
	 *
	 * @return {Array}          [Array containing parsedEvents that are matching event keys]
	 */
	parse: function (events, options) {

		var eventKeys = _.keys(events || {}),
			limitEvents,
			parsedEvents = [];

		// Optionally filter using set of acceptable event types
		limitEvents = options.only;
		eventKeys = _.filter(eventKeys, function checkEventName (eventKey) {

			// Parse event string into semantic representation
			var event = Utils.parseDOMEvent(eventKey);
			parsedEvents.push(event);

			// Optional filter
			if (limitEvents) {
				return _.contains(limitEvents, event.name);
			}
			return true;
		});

		return parsedEvents;
	},

	/**
	 * [getElements description]
	 *
	 * @param  {Array} semanticEvents [A list of parsed event objects]
	 * @param  {Component} context    [Instance of a component to use as a starting point for
	 *                                 the DOM queries]
	 *
	 * @return {Array}                [An array of jQuery set of matched elements]
	 */
	getElements: function (semanticEvents, context) {

		// Context optional
		context = context || { $: $ };

		// Iteratively build a set of affected elements
		var $affected = $();
		_.each(semanticEvents, function lookupElementsForEvent (event) {

			// Determine matched elements
			// Use delegate selector if specified
			// Otherwise, grab the element for this component
			var $matched =	event.selector ?
							context.$(event.selector) :
							context.$el;

			// Add matched elements to set
			$affected = $affected.add( $matched );
		}, this);

		return $affected;
	}
};

module.exports = Events;

},{"./utils":18}],18:[function(require,module,exports){
/**
 * Utility functions that are used throughout the core.
 */

var DOM = require('./DOM');

Utils = {

	/**
	 * Grabs the id xor data-id from an HTML element.
	 *
	 * @param  {DOMElement} el    [Element where we are looking for the `id` or `data-id` attr]
	 * @param  {Boolean} required [Determines if it is required to find an `id` or `data-id` attr]
	 *
	 * @return {String}          	[Identification string that was found]
	 */
	el2id: function (el, required) {

		var id = $(el).attr('id');
		var dataId = $(el).attr('data-id');
		var contentsId = $(el).attr('contents');

		if (id && dataId) {
			throw new Error(id + ' :: Cannot set both `id` and `data-id`!  Please use one or the other.  (data-id is safest)');
		}
		if (required && !id && !dataId) {
			throw new Error('No id specified in element where it is required:\n' + el);
		}

		return id || dataId || contentsId;
	},

	/**
	 * Regexp to match "first class" DOM events
	 * (these are allowed in the top level of a component definition as method keys)
	 *		i.e. /^(click|hover|blur|focus)( (.+))/
	 *			[1] => event name
	 *			[3] => selector
	 */
	'/DOMEvent/': new RegExp('^(' + _.reduce(DOM.events,
		function buildRegexp (memo, eventName, index) {

			// Omit `|` the first time
			if (index === 0) {
				return memo + eventName;
			}

			return memo + '|' + eventName;
		}, '') +
		')( (.+))?$'),

	/**
	 * Returns whether the specified event key matches a DOM event.
	 *
	 * @param  {String} key [Key to match against]
	 *
		* if no match is found
	 * @return {Boolean} 		[return `false`]
	 *
	 * otherwise
	 * @return {Object}  		[Object containing the `name` of the DOM element and the `selector`]
	 */
	parseDOMEvent: _.memoize(function (key) {

		var matches = key.match(this['/DOMEvent/']);

		if (!matches || !matches[1]) {
			return false;
		}

		return {
			name		: matches[1],
			selector	: matches[3]
		};
	}),

	/**
	 * Map an object's values, but return a valid object (this function is handy because
	 * underscore.map() returns a list, not an object.)
	 *
	 * @param  {Object} obj         	[Oject whos values you want to map]
	 * @param  {Function} transformFn [Function to transform each object value by]
	 *
	 * @return {Object}             	[New object with the values mapped]
	 */
	objMap: function objMap (obj, transformFn) {
		return _.object(_.keys(obj), _.map(obj, transformFn));
	}
};

module.exports = Utils;

},{"./DOM":16}]},{},[1])
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9idWlsZC5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL2RlZmluZS9idWlsZERlZmluaXRpb24uanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9kZWZpbmUvaW5kZXguanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9sb2dnZXIvaW5kZXguanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9sb2dnZXIvc2V0dXAuanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9yYWlzZS9idWlsZFByb3RvdHlwZS5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL3JhaXNlL2NvbGxlY3RSZWdpb25zLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvcmFpc2UvY29sbGVjdFRlbXBsYXRlcy5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL3JhaXNlL2luZGV4LmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvcmVnaW9uL2FwcGVuZC5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL3JlZ2lvbi9hdHRhY2guanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9yZWdpb24vZW1wdHkuanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9yZWdpb24vZnJvbUVsZW1lbnQuanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9yZWdpb24vaW5kZXguanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9yZWdpb24vcmVtb3ZlLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvdXRpbHMvRE9NLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvdXRpbHMvZXZlbnRzLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvdXRpbHMvdXRpbHMuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDYkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogTWFzdCBidWlsZCBmaWxlLiBUaGUgbWFpbiBmaWxlXG4gKi9cblxudmFyIGRlZmluZSA9IHJlcXVpcmUoJy4vZGVmaW5lL2luZGV4Jyk7XG52YXIgUmVnaW9uID0gcmVxdWlyZSgnLi9yZWdpb24vaW5kZXgnKTtcbnZhciByYWlzZSA9IHJlcXVpcmUoJy4vcmFpc2UvaW5kZXgnKTtcblxuKGZ1bmN0aW9uKGdsb2JhbCwgdW5kZWZpbmVkKSB7XG5cblx0Z2xvYmFsLkZSQU1FV09SSyA9IEJhY2tib25lO1xuXG5cdEZSQU1FV09SSy5kZWZpbmUgPSBkZWZpbmU7XG5cdEZSQU1FV09SSy5SZWdpb24gPSBSZWdpb247XG5cblx0Ly8gUmVnaW9uIGNhY2hlXG5cdEZSQU1FV09SSy5yZWdpb25zID0ge307XG5cblx0Ly8gU2hvcnRjdXQgZGVmYXVsdHNcblx0RlJBTUVXT1JLLnNob3J0Y3V0ID0ge307XG5cdEZSQU1FV09SSy5zaG9ydGN1dC50ZW1wbGF0ZSA9IHRydWU7XG5cdEZSQU1FV09SSy5zaG9ydGN1dC5jb3VudCA9IHRydWU7XG5cblx0RlJBTUVXT1JLLnJhaXNlID0gcmFpc2U7XG5cdEZSQU1FV09SSy5yYWlzZSgpO1xuXG59KSh3aW5kb3cpO1xuIiwiLyoqXG4gKiBSdW4gZGVmaW5pdGlvbiBtZXRob2RzIHRvIGdldCBhY3R1YWwgY29tcG9uZW50IGRlZmluaXRpb25zLlxuICogVGhpcyBpcyBkZWZlcnJlZCB0byBhdm9pZCBoYXZpbmcgdG8gdXNlIEJhY2tib25lJ3MgZnVuY3Rpb24gKCkge30gYXBwcm9hY2ggZm9yIHRoaW5nc1xuICogbGlrZSBjb2xsZWN0aW9ucy5cbiAqL1xuXG4vKipcbiAqIEJ1aWxkIHVwcyBhIGNvbXBvbmVudCBkZWZpbml0aW9uIGJ5IHJ1bm5pbmcgdGhlIGRlZmluaXRpb24uIFdlIHRoZW4gbGluayB0aGVcbiAqIGNvbXBvbmVudCBkZWZpbml0aW9uIHRvIGFuIGlkZW50aWZpZXIgaW4gYEZSQU1FV09SSy5jb21wb25lbnRzYC5cbiAqXG4gKiBAcGFyYW0gIHtPYmplY3R9IGNvbXBvbmVudCBbT2JqZWN0IGNvbnRhaW5pbmcgdGhlIGRlZmluaXRpb24gZnVuY3Rpb24gb2YgdGhlIGNvbXBvbmVudF1cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBidWlsZENvbXBvbmVudERlZmluaXRpb24oY29tcG9uZW50KSB7XG5cdHZhciBjb21wb25lbnREZWYgPSBjb21wb25lbnQuZGVmaW5pdGlvbigpO1xuXG5cdGlmIChjb21wb25lbnQuaWRPdmVycmlkZSkge1xuXHRcdGlmIChjb21wb25lbnREZWYuaWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihjb21wb25lbnQuaWRPdmVycmlkZSArICc6OiBDYW5ub3Qgc3BlY2lmeSBhbiBpZE92ZXJyaWRlIGluIC5kZWZpbmUoKSBpZiBhbiBpZCBwcm9wZXJ0eSAoJytjb21wb25lbnREZWYuaWQrJykgaXMgYWxyZWFkeSBzZXQgaW4geW91ciBjb21wb25lbnQgZGVmaW5pdGlvbiFcXG5Vc2FnZTogLmRlZmluZShbaWRPdmVycmlkZV0sIGRlZmluaXRpb24pJyk7XG5cdFx0fVxuXHRcdGNvbXBvbmVudERlZi5pZCA9IGNvbXBvbmVudC5pZE92ZXJyaWRlO1xuXHR9XG5cdGlmICghY29tcG9uZW50RGVmLmlkKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgdXNlIC5kZWZpbmUoKSB3aXRob3V0IGRlZmluaW5nIGFuIGlkIHByb3BlcnR5IG9yIG92ZXJyaWRlIGluIHlvdXIgY29tcG9uZW50IVxcblVzYWdlOiAuZGVmaW5lKFtpZE92ZXJyaWRlXSwgZGVmaW5pdGlvbiknKTtcblx0fVxuXHRGUkFNRVdPUksuY29tcG9uZW50c1tjb21wb25lbnREZWYuaWRdID0gY29tcG9uZW50RGVmO1xufTtcbiIsIi8qKlxuICogT3B0aW9uYWwgbWV0aG9kIHRvIHJlcXVpcmUgYXBwIGNvbXBvbmVudHMuIFJlcXVpcmUuanMgY2FuIGJlIHVzZWQgaW5zdGVhZFxuICogYXMgbmVlZGVkLlxuICpcbiAqIEBwYXJhbSAge1N0cmluZ30gXHRbKG9wdGlvbmFsKSBDb21wb25lbnQgaWQgb3ZlcnJpZGVdXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gW0Z1bmN0aW9uIERlZmluaXRpb24gb2YgY29tcG9uZW50XVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGRlZmluZShpZCwgZGVmaW5pdGlvbkZuKSB7XG5cdC8vIElkIHBhcmFtIGlzIG9wdGlvbmFsXG5cdGlmICghZGVmaW5pdGlvbkZuKSB7XG5cdFx0ZGVmaW5pdGlvbkZuID0gaWQ7XG5cdFx0aWQgPSBudWxsO1xuXHR9XG5cblx0RlJBTUVXT1JLLl9kZWZpbmVRdWV1ZS5wdXNoKHtcblx0XHRkZWZpbml0aW9uOiBkZWZpbml0aW9uRm4sXG5cdFx0aWRPdmVycmlkZTogaWRcblx0fSk7XG59O1xuIiwiLyoqXG4gKlx0TG9nZ2V0IGNvbnN0cnVjdG9yIG1ldGhvZCB0aGF0IHdpbGwgc2V0dXAgRlJBTUVXT1JLIHRvIGxvZyBtZXNzYWdlcy5cbiAqL1xuXG52YXIgc2V0dXBMb2dnZXIgPSByZXF1aXJlKCcuL3NldHVwJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gTG9nZ2VyKCkge1xuXG5cdC8vIFVwb24gaW5pdGlhbGl6YXRpb24sIHNldHVwIGxvZ2dlclxuXHRzZXR1cExvZ2dlcihGUkFNRVdPUksubG9nTGV2ZWwpO1xuXG5cdC8vIEluIHN1cHBvcnRlZCBicm93c2VycywgYWxzbyBydW4gc2V0dXBMb2dnZXIgYWdhaW5cblx0Ly8gd2hlbiBGUkFNRVdPUksubG9nTGV2ZWwgaXMgc2V0IGJ5IHRoZSB1c2VyXG5cdGlmIChfLmlzRnVuY3Rpb24oRlJBTUVXT1JLLl9fZGVmaW5lU2V0dGVyX18pKSB7XG5cdFx0RlJBTUVXT1JLLl9fZGVmaW5lU2V0dGVyX18oJ2xvZ0xldmVsJywgZnVuY3Rpb24gb25DaGFuZ2UgKG5ld0xvZ0xldmVsKSB7XG5cdFx0XHRzZXR1cExvZ2dlcihuZXdMb2dMZXZlbCk7XG5cdFx0fSk7XG5cdH1cbn07XG4iLCIvKipcbiAqIFNldCB1cCB0aGUgbG9nIGZ1bmN0aW9uczpcbiAqXG4gKiBGUkFNRVdPUksuZXJyb3JcbiAqIEZSQU1FV09SSy53YXJuXG4gKiBGUkFNRVdPUksubG9nXG4gKiBGUkFNRVdPUksuZGVidWcgKCpsZWdhY3kpXG4gKiBGUkFNRVdPUksudmVyYm9zZVxuICpcbiAqIEBwYXJhbSAge1N0cmluZ30gbG9nTGV2ZWwgW1RoZSBkZXNpcmVkIGxvZyBsZXZlbCBvZiB0aGUgTG9nZ2VyXVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHNldHVwTG9nZ2VyIChsb2dMZXZlbCkge1xuXG5cdHZhciBub29wID0gZnVuY3Rpb24gKCkge307XG5cblx0Ly8gSWYgbG9nIGlzIHNwZWNpZmllZCwgdXNlIGl0LCBvdGhlcndpc2UgdXNlIHRoZSBjb25zb2xlXG5cdGlmIChGUkFNRVdPUksubG9nZ2VyKSB7XG5cdFx0RlJBTUVXT1JLLmVycm9yICAgICA9IEZSQU1FV09SSy5sb2dnZXIuZXJyb3I7XG5cdFx0RlJBTUVXT1JLLndhcm4gICAgICA9IEZSQU1FV09SSy5sb2dnZXIud2Fybjtcblx0XHRGUkFNRVdPUksubG9nICAgICAgID0gRlJBTUVXT1JLLmxvZ2dlci5kZWJ1ZyB8fCBGUkFNRVdPUksubG9nZ2VyO1xuXHRcdEZSQU1FV09SSy52ZXJib3NlICAgPSBGUkFNRVdPUksubG9nZ2VyLnZlcmJvc2U7XG5cdH1cblxuXHQvLyBJbiBJRSwgd2UgY2FuJ3QgZGVmYXVsdCB0byB0aGUgYnJvd3NlciBjb25zb2xlIGJlY2F1c2UgdGhlcmUgSVMgTk8gQlJPV1NFUiBDT05TT0xFXG5cdGVsc2UgaWYgKHR5cGVvZiBjb25zb2xlICE9PSAndW5kZWZpbmVkJykge1xuXG5cdFx0Ly8gV2UgY2Fubm90IGNhbGxlZCB0aGUgLmJpbmQgbWV0aG9kIG9uIHRoZSBjb25zb2xlIG1ldGhvZHMuIFdlIGFyZSBpbiBpZSA5IG9yIDgsIGp1c3QgbWFrZVxuXHRcdC8vIGV2ZXJ5aHRpbmcgYSBub29wLlxuXHRcdGlmIChfLmlzVW5kZWZpbmVkKGNvbnNvbGUubG9nLmJpbmQpKSAge1xuXHRcdFx0RlJBTUVXT1JLLmVycm9yICAgICA9IG5vb3A7XG5cdFx0XHRGUkFNRVdPUksud2FybiAgICAgID0gbm9vcDtcblx0XHRcdEZSQU1FV09SSy5sb2cgICAgICAgPSBub29wO1xuXHRcdFx0RlJBTUVXT1JLLmRlYnVnICAgICA9IG5vb3A7XG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZSAgID0gbm9vcDtcblx0XHR9XG5cblx0XHQvLyBXZSBhcmUgaW4gYSBmcmllbmRseSBicm93c2VyIGxpa2UgQ2hyb21lLCBGaXJlZm94LCBvciBJRTEwXG5cdFx0ZWxzZSB7XG5cdFx0XHRGUkFNRVdPUksuZXJyb3JcdFx0PSBjb25zb2xlLmVycm9yICYmIGNvbnNvbGUuZXJyb3IuYmluZChjb25zb2xlKTtcblx0XHRcdEZSQU1FV09SSy53YXJuXHRcdD0gY29uc29sZS53YXJuICYmIGNvbnNvbGUud2Fybi5iaW5kKGNvbnNvbGUpO1xuXHRcdFx0RlJBTUVXT1JLLmxvZ1x0XHRcdD0gY29uc29sZS5kZWJ1ZyAmJiBjb25zb2xlLmRlYnVnLmJpbmQoY29uc29sZSk7XG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZVx0PSBjb25zb2xlLmxvZyAmJiBjb25zb2xlLmxvZy5iaW5kKGNvbnNvbGUpO1xuXG5cdFx0XHQvLyBVc2UgbG9nIGxldmVsIGNvbmZpZyBpZiBwcm92aWRlZFxuXHRcdFx0c3dpdGNoIChsb2dMZXZlbCkge1xuXHRcdFx0XHRjYXNlICd2ZXJib3NlJzogYnJlYWs7XG5cblx0XHRcdFx0Y2FzZSAnZGVidWcnOlxuXHRcdFx0XHRcdEZSQU1FV09SSy52ZXJib3NlID0gbm9vcDtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlICd3YXJuJzpcblx0XHRcdFx0XHRGUkFNRVdPUksudmVyYm9zZSA9IEZSQU1FV09SSy5sb2cgPSBub29wO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgJ2Vycm9yJzpcblx0XHRcdFx0XHRGUkFNRVdPUksudmVyYm9zZSA9IEZSQU1FV09SSy5sb2cgPSBGUkFNRVdPUksud2FybiA9IG5vb3A7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSAnc2lsZW50Jzpcblx0XHRcdFx0XHRGUkFNRVdPUksudmVyYm9zZSA9IEZSQU1FV09SSy5sb2cgPSBGUkFNRVdPUksud2FybiA9IEZSQU1FV09SSy5lcnJvciA9IG5vb3A7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IgKCdVbnJlY29nbml6ZWQgbG9nZ2luZyBsZXZlbCBjb25maWcgJyArXG5cdFx0XHRcdFx0JygnICsgRlJBTUVXT1JLLmlkICsgJy5sb2dMZXZlbCA9IFwiJyArIGxvZ0xldmVsICsgJ1wiKScpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTdXBwb3J0IGZvciBgZGVidWdgIGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eVxuXHRcdFx0RlJBTUVXT1JLLmRlYnVnID0gRlJBTUVXT1JLLmxvZztcblxuXHRcdFx0Ly8gVmVyYm9zZSBzcGl0cyBvdXQgbG9nIGxldmVsXG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZSgnTG9nIGxldmVsIHNldCB0byA6OiAnLCBsb2dMZXZlbCk7XG5cdFx0fVxuXHR9XG59XG4iLCIvKipcbiAqIEdpdmVuIGEgY29tcG9uZW50IGRlZmluaXRpb24gYW5kIGl0cyBrZXksIHdlIHdpbGwgYnVpbGQgdXAgdGhlIGNvbXBvbmVudCBwcm90b3R5cGUgYW5kIG1lcmdlXG4gKiB0aGlzIGNvbXBvbmVudCB3aXRoIGl0cyBtYXRjaGluZyB0ZW1wbGF0ZS5cbiAqXG4gKiBAcGFyYW0gIHtPYmplY3R9IGNvbXBvbmVudERlZiBbT2JqZWN0IGNvbnRhaW5pbmcgdGhlIGNvbXBvbmVudCBkZWZpbml0aW9uXVxuICogQHBhcmFtICB7U3RyaW5nfSBjb21wb25lbnRLZXkgW1RoZSBjb21wb25lbnQgaWRlbnRpZmllcl1cbiAqL1xuXG52YXIgVXRpbHMgPSByZXF1aXJlKCcuLi91dGlscy91dGlscycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGJ1aWxkQ29tcG9uZW50UHJvdG90eXBlKGNvbXBvbmVudERlZiwgY29tcG9uZW50S2V5KSB7XG5cblx0Ly8gSWYgY29tcG9uZW50IGlkIGlzIG5vdCBleHBsaWNpdGx5IHNldCwgdXNlIHRoZSBjb21wb25lbnRLZXlcblx0aWYgKCFjb21wb25lbnREZWYuaWQpIGNvbXBvbmVudERlZi5pZCA9IGNvbXBvbmVudEtleTtcblxuXHQvLyBTZWFyY2ggdGVtcGxhdGVzXG5cdHZhciB0ZW1wbGF0ZSA9IEZSQU1FV09SSy50ZW1wbGF0ZXNbY29tcG9uZW50RGVmLmlkXTtcblxuXHQvLyBJZiBubyBtYXRjaCBmb3IgY29tcG9uZW50IHdhcyBmb3VuZMKgaW4gdGVtcGxhdGVzLCBpc3N1ZSBhIHdhcm5pbmdcblx0aWYgKCF0ZW1wbGF0ZSkge1xuXHRcdHJldHVybiBGUkFNRVdPUksud2Fybihcblx0XHRcdGNvbXBvbmVudERlZi5pZCArICcgOjogTm8gdGVtcGxhdGUgZm91bmQgZm9yIGNvbXBvbmVudCEnICtcblx0XHRcdCdcXG5UZW1wbGF0ZXMgZG9uXFwndCBuZWVkIGEgY29tcG9uZW50IHVubGVzcyB5b3Ugd2FudCBpbnRlcmFjdGl2aXR5LCAnICtcblx0XHRcdCdldmVyeSBjb21wb25lbnQgKnNob3VsZCogaGF2ZSBhIG1hdGNoaW5nIHRlbXBsYXRlISEnICtcblx0XHRcdCdcXG5Vc2luZyBjb21wb25lbnRzIHdpdGhvdXQgdGVtcGxhdGVzIG1heSBzZWVtIG5lY2Vzc2FyeSwgJyArXG5cdFx0XHQnYnV0IGl0XFwncyBub3QuICBJdCBtYWtlcyB5b3VyIHZpZXcgbG9naWMgaW5jb3Jwb3JlYWwsIGFuZCBtYWtlcyB5b3VyIGNvbGxlYWd1ZXMgJyArXG5cdFx0XHQndW5jb21mb3J0YWJsZS4nKTtcblx0fVxuXG5cdC8vIFNhdmUgcmVmZXJlbmNlIHRvIHRlbXBsYXRlIGluIGNvbXBvbmVudCBwcm90b3R5cGVcblx0RlJBTUVXT1JLLnZlcmJvc2UoY29tcG9uZW50RGVmLmlkICsgJyA6OiBQYWlyaW5nIGNvbXBvbmVudCB3aXRoIHRlbXBsYXRlLi4uJyk7XG5cdGNvbXBvbmVudERlZi50ZW1wbGF0ZSA9IHRlbXBsYXRlO1xuXG5cdC8vIFRyYW5zbGF0ZSByaWdodC1oYW5kIHNob3J0aGFuZCBmb3IgdG9wLWxldmVsIGtleXNcblx0Ly8gVE9ETzogcmVxdWlyZSB1dGlsc1xuXHRjb21wb25lbnREZWYgPSBVdGlscy5vYmpNYXAoY29tcG9uZW50RGVmLCBGUkFNRVdPUksuVXRpbC50cmFuc2xhdGVTaG9ydGhhbmQpO1xuXG5cdC8vIGFuZCBldmVudHMgb2JqZWN0XG5cdC8vIFRPRE86IHJlcXVpcmUgdXRpbHNcblx0aWYgKGNvbXBvbmVudERlZi5ldmVudHMpIHtcblx0XHRjb21wb25lbnREZWYuZXZlbnRzID0gVXRpbHMub2JqTWFwKFxuXHRcdFx0Y29tcG9uZW50RGVmLmV2ZW50cyxcblx0XHRcdEZSQU1FV09SSy5VdGlsLnRyYW5zbGF0ZVNob3J0aGFuZFxuXHRcdCk7XG5cdH1cblxuXHQvLyBhbmQgYWZ0ZXJDaGFuZ2UgYmluZGluZ3Ncblx0Ly8gVE9ETzogcmVxdWlyZSB1dGlsc1xuXHRpZiAoXy5pc09iamVjdChjb21wb25lbnREZWYuYWZ0ZXJDaGFuZ2UpICYmICFfLmlzRnVuY3Rpb24oY29tcG9uZW50RGVmLmFmdGVyQ2hhbmdlKSkge1xuXHRcdGNvbXBvbmVudERlZi5hZnRlckNoYW5nZSA9IFV0aWxzLm9iak1hcChcblx0XHRcdGNvbXBvbmVudERlZi5hZnRlckNoYW5nZSxcblx0XHRcdEZSQU1FV09SSy5VdGlsLnRyYW5zbGF0ZVNob3J0aGFuZFxuXHRcdCk7XG5cdH1cblxuXHQvLyBHbyBhaGVhZCBhbmQgdHVybiB0aGUgZGVmaW5pdGlvbiBpbnRvIGEgcmVhbCBjb21wb25lbnQgcHJvdG90eXBlXG5cdEZSQU1FV09SSy52ZXJib3NlKGNvbXBvbmVudERlZi5pZCArICcgOjogQnVpbGRpbmcgY29tcG9uZW50IHByb3RvdHlwZS4uLicpO1xuXHR2YXIgY29tcG9uZW50UHJvdG90eXBlID0gRlJBTUVXT1JLLkNvbXBvbmVudC5leHRlbmQoY29tcG9uZW50RGVmKTtcblxuXHQvLyBEaXNjb3ZlciBzdWJzY3JpcHRpb25zXG5cdGNvbXBvbmVudFByb3RvdHlwZS5wcm90b3R5cGUuc3Vic2NyaXB0aW9ucyA9IHt9O1xuXG5cdC8vIEl0ZXJhdGUgdGhyb3VnaCBlYWNoIHByb3BlcnR5IG9uIHRoaXMgY29tcG9uZW50IHByb3RvdHlwZVxuXHRfLmVhY2goY29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZSwgZnVuY3Rpb24gKGhhbmRsZXIsIGtleSkge1xuXG5cdFx0Ly8gQWRkIGFwcCBldmVudHMgKCUpLCByb3V0ZXMgKCMpLCBhbmQgZGF0YSBsaXN0ZW5lcnMgKH4pIHRvIHN1YnNjcmlwdGlvbnMgaGFzaFxuXHRcdGlmIChrZXkubWF0Y2goL14oJXwjfH4pLykpIHtcblx0XHRcdGlmIChfLmlzU3RyaW5nKGhhbmRsZXIpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihjb21wb25lbnREZWYuaWQgKyAnOjogSW52YWxpZCBsaXN0ZW5lciBmb3Igc3Vic2NyaXB0aW9uOiAnICsga2V5ICsgJy5cXG4nICtcblx0XHRcdFx0XHQnRGVmaW5lIHlvdXIgY2FsbGJhY2sgd2l0aCBhbiBhbm9ueW1vdXMgZnVuY3Rpb24gaW5zdGVhZCBvZiBhIHN0cmluZy4nXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIV8uaXNGdW5jdGlvbihoYW5kbGVyKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoY29tcG9uZW50RGVmLmlkICsnOjogSW52YWxpZCBsaXN0ZW5lciBmb3Igc3Vic2NyaXB0aW9uOiAnICsga2V5KTtcblx0XHRcdH1cblx0XHRcdGNvbXBvbmVudFByb3RvdHlwZS5wcm90b3R5cGUuc3Vic2NyaXB0aW9uc1trZXldID0gaGFuZGxlcjtcblx0XHR9XG5cblx0XHQvLyBFeHRlbmQgb25lIG9yIG1vcmUgb3RoZXIgY29tcG9uZW50c1xuXHRcdGVsc2UgaWYgKGtleSA9PT0gJ2V4dGVuZENvbXBvbmVudHMnKSB7XG5cdFx0XHR2YXIgb2JqVG9NZXJnZSA9IHt9O1xuXHRcdFx0Xy5lYWNoKGhhbmRsZXIsIGZ1bmN0aW9uKGNoaWxkSWQpe1xuXG5cdFx0XHRcdGlmICghRlJBTUVXT1JLLmNvbXBvbmVudHNbY2hpbGRJZF0pe1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihcblx0XHRcdFx0XHRjb21wb25lbnREZWYuaWQgKyAnIDo6ICcgK1xuXHRcdFx0XHRcdCdUcnlpbmcgdG8gZGVmaW5lL2V4dGVuZCB0aGlzIGNvbXBvbmVudCBmcm9tIGAnICsgY2hpbGRJZCArICdgLCAnICtcblx0XHRcdFx0XHQnYnV0IG5vIGNvbXBvbmVudCB3aXRoIHRoYXQgaWQgY2FuIGJlIGZvdW5kLidcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Xy5leHRlbmQob2JqVG9NZXJnZSwgRlJBTUVXT1JLLmNvbXBvbmVudHNbY2hpbGRJZF0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdF8uZGVmYXVsdHMoY29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZSwgb2JqVG9NZXJnZSk7XG5cdFx0fVxuXHR9KTtcblxuXHQvLyBTYXZlIHByb3RvdHlwZSBpbiBnbG9iYWwgc2V0IGZvciB0cmFja2luZ1xuXHRGUkFNRVdPUksuY29tcG9uZW50c1tjb21wb25lbnREZWYuaWRdID0gY29tcG9uZW50UHJvdG90eXBlO1xufTtcbiIsIi8qKlxuICogQ29sbGVjdCBhbnkgcmVnaW9ucyB3aXRoIHRoZSBkZWZhdWx0IGNvbXBvbmVudCBzZXQgZnJvbSB0aGUgRE9NLlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY29sbGVjdFJlZ2lvbnMgKCkge1xuXG5cdC8vIFByb3ZpZGUgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkgZm9yIGxlZ2FjeSBub3RhdGlvblxuXHQkKCdyZWdpb25bZGVmYXVsdF0scmVnaW9uW3RlbXBsYXRlXScpLmVhY2goZnVuY3Rpb24oKSB7XG5cdFx0JGUgPSAkKHRoaXMpO1xuXHRcdHZhciBjb21wb25lbnRJZCA9ICRlLmF0dHIoJ2RlZmF1bHQnKSB8fCAkZS5hdHRyKCd0ZW1wbGF0ZScpO1xuXHRcdCRlLmF0dHIoJ2NvbnRlbnRzJywgY29tcG9uZW50SWQpO1xuXHR9KTtcblxuXHQvLyBOb3cgaW5zdGFudGlhdGUgdGhlIGFwcHJvcHJpYXRlIGRlZmF1bHQgY29tcG9uZW50IGluIGVhY2hcblx0Ly8gcmVnaW9uIHdpdGggYSBzcGVjaWZpZWQgdGVtcGxhdGUvY29tcG9uZW50XG5cdCQoJ3JlZ2lvbltjb250ZW50c10nKS5lYWNoKGZ1bmN0aW9uKCkge1xuXHRcdEZSQU1FV09SSy5SZWdpb24uZnJvbUVsZW1lbnQodGhpcyk7XG5cdH0pO1xufVxuIiwiLyoqXG4gKiBMb2FkIGFueSBzY3JpcHQgdGFncyBvbiB0aGUgcGFnZSB3aXRoIHR5cGU9XCJ0ZXh0L3RlbXBsYXRlXCIuXG4gKlxuICogQHJldHVybiB7T2JqZWN0fSBbT2JqZWN0IGNvbnNpc3Rpbmcgb2YgYSB0ZW1wbGF0ZSBpZGVudGlmaWVyIGFuZCBpdHMgSFRNTC5dXG4gKi9cblxudmFyIFV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMvdXRpbHMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjb2xsZWN0VGVtcGxhdGVzKCkge1xuXHR2YXIgdGVtcGxhdGVzID0ge307XG5cblx0JCgnc2NyaXB0W3R5cGU9XCJ0ZXh0L3RlbXBsYXRlXCJdJykuZWFjaChmdW5jdGlvbiAoaSwgZWwpIHtcblx0XHR2YXIgaWQgPSBVdGlscy5lbDJpZChlbCwgdHJ1ZSk7XG5cdFx0dGVtcGxhdGVzW2lkXSA9ICQoZWwpLmh0bWwoKTtcblxuXHRcdC8vIFN0cmlwIHdoaXRlc3BhY2UgbGVmdG92ZXIgZnJvbSBzY3JpcHQgdGFnc1xuXHRcdHRlbXBsYXRlc1tpZF0gPSB0ZW1wbGF0ZXNbaWRdLnJlcGxhY2UoL15cXHMrLywnJyk7XG5cdFx0dGVtcGxhdGVzW2lkXSA9IHRlbXBsYXRlc1tpZF0ucmVwbGFjZSgvXFxzKyQvLCcnKTtcblxuXHRcdC8vIFJlbW92ZSBmcm9tIERPTVxuXHRcdCQoZWwpLnJlbW92ZSgpO1xuXHR9KTtcblxuXHRyZXR1cm4gdGVtcGxhdGVzO1xufTtcbiIsIi8qKlxuICogVGhpcyBpcyB0aGUgc3RhcnRpbmcgcG9pbnQgdG8geW91ciBhcHBsaWNhdGlvbi4gIFlvdSBzaG91bGQgZ3JhYiB0ZW1wbGF0ZXMgYW5kIGNvbXBvbmVudHNcbiAqIGJlZm9yZSBjYWxsaW5nIEZSQU1FV09SSy5yYWlzZSgpIHVzaW5nIHNvbWV0aGluZyBsaWtlIFJlcXVpcmUuanMuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnNcblx0XHRkYXRhOiB7IGF1dGhlbnRpY2F0ZWQ6IGZhbHNlIH0sXG5cdFx0dGVtcGxhdGVzOiB7IGNvbXBvbmVudE5hbWU6IEhUTUxPclByZWNvbXBpbGVkRm4gfSxcblx0XHRjb21wb25lbnRzOiB7IGNvbXBvbmVudE5hbWU6IENvbXBvbmVudERlZmluaXRpb24gfVxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2JcbiAqL1xuXG52YXIgTG9nZ2VyID0gcmVxdWlyZSgnLi4vbG9nZ2VyL2luZGV4Jyk7XG52YXIgYnVpbGRDb21wb25lbnREZWZpbml0aW9uID0gcmVxdWlyZSgnLi4vZGVmaW5lL2J1aWxkRGVmaW5pdGlvbicpO1xudmFyIGJ1aWxkQ29tcG9uZW50UHJvdG90eXBlID0gcmVxdWlyZSgnLi9idWlsZFByb3RvdHlwZScpO1xudmFyIGNvbGxlY3RUZW1wbGF0ZXMgPSByZXF1aXJlKCcuL2NvbGxlY3RUZW1wbGF0ZXMnKTtcbnZhciBjb2xsZWN0UmVnaW9ucyA9IHJlcXVpcmUoJy4vY29sbGVjdFJlZ2lvbnMnKTtcblxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHJhaXNlKG9wdGlvbnMsIGNiKSB7XG5cblx0Ly8gSWYgb25seSBvbmUgYXJnIGlzIHByZXNlbnQsIHVzZSBvcHRpb25zIGFzIGNhbGxiYWNrIGlmIHBvc3NpYmxlLlxuXHQvLyBJZiBvcHRpb25zIGFyZSBub3QgZGVmaW5lZCwgdXNlIGFuIGVtcHR5IG9iamVjdC5cblx0aWYgKCFjYiAmJiBfLmlzRnVuY3Rpb24ob3B0aW9ucykpIHtcblx0XHRjYiA9IG9wdGlvbnM7XG5cdH1cblx0aWYgKCFfLmlzUGxhaW5PYmplY3Qob3B0aW9ucykpIHtcblx0XHRvcHRpb25zID0ge307XG5cdH1cblxuXHQvLyBBcHBseSBkZWZhdWx0c1xuXHRfLmRlZmF1bHRzKEZSQU1FV09SSywge1xuXHRcdHRocm90dGxlV2luZG93UmVzaXplOiAyMDAsXG5cdFx0bG9nTGV2ZWw6ICd3YXJuJyxcblx0XHRsb2dnZXI6IHVuZGVmaW5lZCxcblx0XHRwcm9kdWN0aW9uOiBmYWxzZVxuXHR9KTtcblxuXHQvLyBBcHBseSBvdmVycmlkZXMgZnJvbSBvcHRpb25zXG5cdF8uZXh0ZW5kKEZSQU1FV09SSywgb3B0aW9ucyk7XG5cblx0Ly8gSW50ZXJwcmV0IGBwcm9kdWN0aW9uYCBhcyBgbG9nTGV2ZWwgPT09ICdzaWxlbnQnYFxuXHRpZiAoRlJBTUVXT1JLLnByb2R1Y3Rpb24pIHtcblx0XHRGUkFNRVdPUksubG9nTGV2ZWwgPSAnc2lsZW50Jztcblx0fVxuXG5cdC8vIEluaXRpYWxpemUgbG9nZ2VyXG5cdG5ldyBMb2dnZXIoKTtcblxuXHQvLyBNZXJnZSBkYXRhIGludG8gRlJBTUVXT1JLLmRhdGFcblx0Xy5leHRlbmQoRlJBTUVXT1JLLmRhdGEsIG9wdGlvbnMuZGF0YSB8fCB7fSk7XG5cblx0Ly8gTWVyZ2Ugc3BlY2lmaWVkIHRlbXBsYXRlcyB3aXRoIEZSQU1FV09SSy50ZW1wbGF0ZXNcblx0Xy5leHRlbmQoRlJBTUVXT1JLLnRlbXBsYXRlcywgb3B0aW9ucy50ZW1wbGF0ZXMgfHwge30pO1xuXG5cdC8vIElmIEZSQU1FV09SSy5kZWZpbmUoKSB3YXMgdXNlZCwgYnVpbGQgdGhlIGxpc3Qgb2YgY29tcG9uZW50c1xuXHQvLyBJdGVyYXRlIHRocm91Z2ggdGhlIGRlZmluZSBxdWV1ZSBhbmQgY3JlYXRlIGVhY2ggZGVmaW5pdGlvblxuXHRGUkFNRVdPUksuX2RlZmluZVF1ZXVlID0gW107XG5cdF8uZWFjaChGUkFNRVdPUksuX2RlZmluZVF1ZXVlLCBidWlsZENvbXBvbmVudERlZmluaXRpb24pO1xuXG5cdC8vIE1lcmdlIHNwZWNpZmllZCBjb21wb25lbnRzIHcvIEZSQU1FV09SSy5jb21wb25lbnRzXG5cdF8uZXh0ZW5kKEZSQU1FV09SSy5jb21wb25lbnRzLCBvcHRpb25zLmNvbXBvbmVudHMgfHwge30pO1xuXG5cdC8vIEJhY2sgdXAgZWFjaCBjb21wb25lbnQgZGVmaW5pdGlvbiBiZWZvcmUgdHJhbnNmb3JtaW5nIGl0IGludG8gYSBsaXZlIHByb3RvdHlwZVxuXHRGUkFNRVdPUksuY29tcG9uZW50RGVmcyA9IF8uY2xvbmUoRlJBTUVXT1JLLmNvbXBvbmVudHMpO1xuXG5cdC8vIFJ1biB0aGlzIGNhbGwgYmFjayB3aGVuIHRoZSBET00gaXMgcmVhZHlcblx0JChmdW5jdGlvbiAoKSB7XG5cblx0XHQvLyBDb2xsZWN0IGFueSA8c2NyaXB0PiB0YWcgdGVtcGxhdGVzIG9uIHRoZSBwYWdlXG5cdFx0Ly8gYW5kIGFic29yYiB0aGVtIGludG8gRlJBTUVXT1JLLnRlbXBsYXRlc1xuXHRcdF8uZXh0ZW5kKEZSQU1FV09SSy50ZW1wbGF0ZXMsIGNvbGxlY3RUZW1wbGF0ZXMoKSk7XG5cblx0XHQvLyBCdWlsZCBhY3R1YWwgcHJvdG90eXBlcyBmb3IgdGhlIGNvbXBvbmVudHNcblx0XHQvLyAobmVlZCB0aGUgdGVtcGxhdGVzIGF0IHRoaXMgcG9pbnQgdG8gbWFrZSB0aGlzIHdvcmspXG5cdFx0Xy5lYWNoKEZSQU1FV09SSy5jb21wb25lbnRzLCBidWlsZENvbXBvbmVudFByb3RvdHlwZSk7XG5cblx0XHQvLyBHcmFiIGluaXRpYWwgcmVnaW9ucyBmcm9tIERPTVxuXHRcdGNvbGxlY3RSZWdpb25zKCk7XG5cblx0XHQvLyBCaW5kIGdsb2JhbCBET00gZXZlbnRzIGFzIEZSQU1FV09SSyBldmVudHNcblx0XHQvLyAoZS5nLiAld2luZG93OnJlc2l6ZSlcblx0XHR2YXIgdHJpZ2dlclJlc2l6ZUV2ZW50ID0gXy5kZWJvdW5jZShmdW5jdGlvbiAoKSB7XG5cdFx0XHRGUkFNRVdPUksudHJpZ2dlcignJXdpbmRvdzpyZXNpemUnKTtcblx0XHR9LCBvcHRpb25zLnRocm90dGxlV2luZG93UmVzaXplIHx8IDApO1xuXHRcdCQod2luZG93KS5yZXNpemUodHJpZ2dlclJlc2l6ZUV2ZW50KTtcblx0XHQvLyBUT0RPOiBhZGQgbW9yZSBldmVudHMgYW5kIGV4dHJhcG9sYXRlIHRoaXMgbG9naWMgdG8gYSBzZXBhcmF0ZSBtb2R1bGVcblxuXHRcdC8vIERvIHRoZSBpbml0aWFsIHJvdXRpbmcgc2VxdWVuY2Vcblx0XHQvLyBMb29rIGF0IHRoZSAjZnJhZ21lbnQgdXJsIGFuZCBmaXJlIHRoZSBnbG9iYWwgcm91dGUgZXZlbnRcblx0XHRGUkFNRVdPUksuaGlzdG9yeS5zdGFydChfLmRlZmF1bHRzKHtcblx0XHRcdHB1c2hTdGF0ZTogdW5kZWZpbmVkLFxuXHRcdFx0aGFzaENoYW5nZTogdW5kZWZpbmVkLFxuXHRcdFx0cm9vdDogdW5kZWZpbmVkXG5cdFx0fSwgb3B0aW9ucykpO1xuXG5cdFx0aWYgKGNiKSBjYigpO1xuXHR9KTtcbn07XG4iLCIvKipcbiAqIHJlZ2lvbi5hcHBlbmQoIGNvbXBvbmVudElkLCBbcHJvcGVydGllc10gKVxuICpcbiAqIENhbGxzIGluc2VydCgpIGF0IGxhc3QgcG9zaXRpb25cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGFwcGVuZChjb21wb25lbnRJZCwgcHJvcGVydGllcykge1xuXHQvLyBJbnNlcnQgYXQgbGFzdCBwb3NpdGlvblxuXHRyZXR1cm4gdGhpcy5pbnNlcnQodGhpcy5fY2hpbGRyZW4ubGVuZ3RoLCBjb21wb25lbnRJZCwgcHJvcGVydGllcyk7XG59O1xuIiwiLyoqXG4gKiBTaG9ydGN1dCBmb3IgY2FsbGluZyBlbXB0eSgpIGFuZCB0aGVuIGFwcGVuZCgpLFxuICogVGhpcyBpcyB0aGUgZ2VuZXJhbCB1c2UgY2FzZSBmb3IgbWFuYWdpbmcgc3ViY29tcG9uZW50c1xuICogKGUuZy4gd2hlbiBhIG5hdmJhciBpdGVtIGlzIHRvdWNoZWQpXG4gKlxuICogQHBhcmFtICB7c3RyaW5nfSBjb21wb25lbnQgIFRoZSBpZCBuYW1lIG9mIHRoZSBjb21wb25ldCB0aGF0IHlvdSB3YW50IHRvIGF0dGFjaC5cbiAqIEBwYXJhbSAge09iamVjdH0gcHJvcGVydGllcyBQcm9wZXJ0aWVzIHRoYXQgdGhlIGF0dGFjaGVkIGNvbXBvbmVudCB3aWxsIGJlIGluaXRhbGl6ZWQgd2l0aC5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGF0dGFjaChjb21wb25lbnQsIHByb3BlcnRpZXMpIHtcblx0dGhpcy5lbXB0eSgpO1xuXHRyZXR1cm4gdGhpcy5hcHBlbmQoY29tcG9uZW50LCBwcm9wZXJ0aWVzKTtcbn07XG4iLCIvKipcbiAqIHJlZ2lvbi5lbXB0eSggKVxuICpcbiAqIEl0ZXJhdGUgb3ZlciBlYWNoIGNvbXBvbmVudCBpbiB0aGlzIHJlZ2lvbiBhbmQgY2FsbCAuY2xvc2UoKSBvbiBpdFxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZW1wdHkoKSB7XG5cdEZSQU1FV09SSy5kZWJ1Zyh0aGlzLnBhcmVudC5pZCArICcgOjogRW1wdHlpbmcgcmVnaW9uOiAnICsgdGhpcy5pZCk7XG5cdHdoaWxlICh0aGlzLl9jaGlsZHJlbi5sZW5ndGggPiAwKSB7XG5cdFx0dGhpcy5yZW1vdmUoMCk7XG5cdH1cbn07XG4iLCIvKipcbiAqIEZhY3RvcnkgbWV0aG9kIHRvIGdlbmVyYXRlIGEgbmV3IHJlZ2lvbiBpbnN0YW5jZSBmcm9tIGEgRE9NIGVsZW1lbnRcbiAqIEltcGxlbWVudHMgYHRlbXBsYXRlYCwgYGNvdW50YCwgYW5kIGBkYXRhLSpgIEhUTUwgYXR0cmlidXRlcy5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9uc1xuICogQHJldHVybnMgcmVnaW9uIGluc3RhbmNlXG4gKi9cblxudmFyIFV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMvdXRpbHMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmcm9tRWxlbWVudChlbCwgcGFyZW50KSB7XG5cblx0Ly8gSWYgcGFyZW50IGlzIG5vdCBzcGVjaWZpZWQsIG1ha2UtYmVsaWV2ZVxuXHRwYXJlbnQgPSBwYXJlbnQgfHwgeyBpZDogJyonIH07XG5cblxuXG5cdC8vIEJ1aWxkIHJlZ2lvblxuXHR2YXIgcmVnaW9uID0gbmV3IEZSQU1FV09SSy5SZWdpb24oe1xuXHRcdGlkOiBVdGlscy5lbDJpZChlbCksXG5cdFx0JGVsOiAkKGVsKSxcblx0XHRwYXJlbnQ6IHBhcmVudFxuXHR9KTtcblxuXHQvLyBJZiB0aGlzIHJlZ2lvbiBoYXMgYSBkZWZhdWx0IGNvbXBvbmVudC90ZW1wbGF0ZSBzZXQsXG5cdC8vIGdyYWIgdGhlIGlkICAtLSAgZS5nLiA8cmVnaW9uIGNvbnRlbnRzPVwiRm9vXCIgLz5cblx0dmFyIGNvbXBvbmVudElkID0gJChlbCkuYXR0cignY29udGVudHMnKTtcblxuXG5cdC8vIElmIGBjb3VudGAgaXMgc2V0LCByZW5kZXIgc3ViLWNvbXBvbmVudCBzcGVjaWZpZWQgbnVtYmVyIG9mIHRpbWVzLlxuXHQvLyBlLmcuIDxyZWdpb24gdGVtcGxhdGU9XCJGb29cIiBjb3VudD1cIjNcIiAvPlxuXHQvLyAodmVyaWZ5IEZSQU1FV09SSy5zaG9ydGN1dC5jb3VudCBpcyBlbmFibGVkKVxuXHR2YXIgY291bnRBdHRyLFxuXHRcdGNvdW50ID0gMTtcblxuXHRpZiAoRlJBTUVXT1JLLnNob3J0Y3V0LmNvdW50KSB7XG5cblx0XHQvLyBJZiBgY291bnRgIGF0dHJpYnV0ZSBpcyBub3QgZmFsc2Ugb3IgdW5kZWZpbmVkLFxuXHRcdC8vIHRoYXQgbWVhbnMgaXQgd2FzIHNldCBleHBsaWNpdGx5LCBhbmQgd2Ugc2hvdWxkIHVzZSBpdFxuXHRcdGNvdW50QXR0ciA9ICQoZWwpLmF0dHIoJ2NvdW50Jyk7XG5cdFx0Ly8gRlJBTUVXT1JLLmRlYnVnKCdDb3VudCBhdHRyIGlzIDo6ICcsIGNvdW50QXR0cik7XG5cdFx0aWYgKCEhY291bnRBdHRyKSB7XG5cdFx0XHRjb3VudCA9IGNvdW50QXR0cjtcblx0XHR9XG5cdH1cblxuXG5cdEZSQU1FV09SSy5kZWJ1Zyhcblx0XHRwYXJlbnQuaWQgKyAnIDotOiBJbnN0YW50aWF0ZWTCoG5ldyByZWdpb24nICtcblx0XHQoIHJlZ2lvbi5pZCA/ICcgYCcgKyByZWdpb24uaWQgKyAnYCcgOiAnJyApICtcblx0XHQoIGNvbXBvbmVudElkID8gJyBhbmQgcG9wdWxhdGVkIGl0IHdpdGgnICtcblx0XHRcdCggY291bnQgPiAxID8gY291bnQgKyAnIGluc3RhbmNlcyBvZicgOiAnIDEnICkgK1xuXHRcdFx0JyBgJyArIGNvbXBvbmVudElkICsgJ2AnIDogJydcblx0XHQpICsgJy4nXG5cdCk7XG5cblxuXG5cdC8vIEFwcGVuZCBzdWItY29tcG9uZW50KHMpIHRvIHJlZ2lvbiBhdXRvbWF0aWNhbGx5XG5cdC8vICh2ZXJpZnkgRlJBTUVXT1JLLnNob3J0Y3V0LnRlbXBsYXRlIGlzIGVuYWJsZWQpXG5cdGlmICggRlJBTUVXT1JLLnNob3J0Y3V0LnRlbXBsYXRlICYmIGNvbXBvbmVudElkICkge1xuXG5cdFx0Ly8gRlJBTUVXT1JLLmRlYnVnKFxuXHRcdC8vIFx0J1ByZXBhcmluZyB0byByZW5kZXIgJyArIGNvdW50ICsgJyAnICsgY29tcG9uZW50SWQgKyAnIGNvbXBvbmVudHMgaW50byByZWdpb24gJyArXG5cdFx0Ly8gXHQnKCcgKyByZWdpb24uaWQgKyAnKSwgd2hpY2ggYWxyZWFkeSBjb250YWlucyAnICsgcmVnaW9uLiRlbC5jaGlsZHJlbigpLmxlbmd0aCArXG5cdFx0Ly8gXHQnIHN1YmNvbXBvbmVudHMuJ1xuXHRcdC8vICk7XG5cblx0XHRyZWdpb24uYXBwZW5kKGNvbXBvbmVudElkKTtcblxuXHRcdC8vIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXHRcdC8vIC8vIFNFUklPVVNMWSBXVEZcblx0XHQvLyAvLyBNQUpPUiBIQVhYWFhYWFhcblx0XHQvLyAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblx0XHQvLyBjb3VudCA9ICtjb3VudCArIDE7XG5cdFx0Ly8gLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cblx0XHQvLyBmb3IgKHZhciBqPTA7IGogPCBjb3VudDsgaisrICkge1xuXG5cdFx0Ly8gXHRyZWdpb24uYXBwZW5kKGNvbXBvbmVudElkKTtcblxuXHRcdC8vIFx0Ly8gRlJBTUVXT1JLLmRlYnVnKFxuXHRcdC8vIFx0Ly8gXHQncmVuZGVyaW5nIHRoZSAnICsgY29tcG9uZW50SWQgKyAnIGNvbXBvbmVudCwgcmVtYWluaW5nOiAnICtcblx0XHQvLyBcdC8vIFx0Y291bnQgKyAnIGFuZCB0aGVyZSBhcmUgJyArIHJlZ2lvbi4kZWwuY2hpbGRyZW4oKS5sZW5ndGggK1xuXHRcdC8vIFx0Ly8gXHQnIHN1YmNvbXBvbmVudCBlbGVtZW50cyBpbiB0aGUgcmVnaW9uIG5vdydcblx0XHQvLyBcdC8vICk7XG5cblx0XHQvLyB9XG5cblx0fVxuXG5cdHJldHVybiByZWdpb247XG59O1xuIiwiLyoqXG4gKiBSZWdpb25zXG4gKi9cblxudmFyIGluc2VydCA9IHJlcXVpcmUoJy4vZW1wdHknKTtcbnZhciByZW1vdmUgPSByZXF1aXJlKCcuL3JlbW92ZScpO1xudmFyIGVtcHR5ID0gcmVxdWlyZSgnLi9lbXB0eScpO1xudmFyIGFwcGVuZCA9IHJlcXVpcmUoJy4vYXBwZW5kJyk7XG52YXIgYXR0YWNoID0gcmVxdWlyZSgnLi9hdHRhY2gnKTtcbnZhciBmcm9tRWxlbWVudCA9IHJlcXVpcmUoJy4vZnJvbUVsZW1lbnQnKTtcblxuUmVnaW9uID0gbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjb25zdHJ1Y3Rvcihwcm9wZXJ0aWVzKSB7XG5cblx0Xy5leHRlbmQodGhpcywgRlJBTUVXT1JLLkV2ZW50cyk7XG5cblx0aWYgKCFwcm9wZXJ0aWVzKSB7XG5cdFx0cHJvcGVydGllcyA9IHt9O1xuXHR9XG5cdGlmICghcHJvcGVydGllcy4kZWwpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1RyeWluZyB0byBpbnN0YW50aWF0ZSByZWdpb24gd2l0aCBubyAkZWwhJyk7XG5cdH1cblxuXHQvLyBGb2xkIGluIHByb3BlcnRpZXMgdG8gcHJvdG90eXBlXG5cdF8uZXh0ZW5kKHRoaXMsIHByb3BlcnRpZXMpO1xuXG5cdC8vIElmIG5laXRoZXIgYW4gaWQgbm9yIGEgYHRlbXBsYXRlYCB3YXMgc3BlY2lmaWVkLFxuXHQvLyB3ZSdsbCB0aHJvdyBhbiBlcnJvciwgc2luY2UgdGhlcmUncyBubyB3YXkgdG8gZ2V0IGEgaG9sZCBvZiB0aGUgcmVnaW9uXG5cdGlmICghdGhpcy5pZCAmJiAhKHRoaXMuJGVsLmF0dHIoJ2RlZmF1bHQnKSB8fCB0aGlzLiRlbC5hdHRyKCd0ZW1wbGF0ZScpIHx8XG5cdFx0XHR0aGlzLiRlbC5hdHRyKCdjb250ZW50cycpKSkge1xuXG5cdFx0dGhyb3cgbmV3IEVycm9yKFxuXHRcdFx0dGhpcy5wYXJlbnQuaWQgKyAnIDo6IEVpdGhlciBgZGF0YS1pZGAsIGBjb250ZW50c2AsIG9yIGJvdGggJyArXG5cdFx0XHQnbXVzdCBiZSBzcGVjaWZpZWQgb24gcmVnaW9ucy4gXFxuJyArXG5cdFx0XHQnZS5nLiA8cmVnaW9uIGRhdGEtaWQ9XCJmb29cIiB0ZW1wbGF0ZT1cIlNvbWVDb21wb25lbnRcIj48L3JlZ2lvbj4nXG5cdFx0KTtcblx0fVxuXG5cdC8vIFNldCB1cCBsaXN0IHRvIGhvdXNlIGNoaWxkIGNvbXBvbmVudHNcblx0dGhpcy5fY2hpbGRyZW4gPSBbXTtcblxuXHRfLmJpbmRBbGwodGhpcyk7XG5cblx0Ly8gU2V0IHVwIGNvbnZlbmllbmNlIGFjY2VzcyB0byB0aGlzIHJlZ2lvbiBpbiB0aGUgZ2xvYmFsIHJlZ2lvbiBjYWNoZVxuXHRGUkFNRVdPUksucmVnaW9uc1t0aGlzLmlkXSA9IHRoaXM7XG59O1xuXG5SZWdpb24uZnJvbUVsZW1lbnQgPSBmdW5jdGlvbiAoZWwsIHBhcmVudCkgeyByZXR1cm4gZnJvbUVsZW1lbnQuY2FsbCh0aGlzLCBlbCwgcGFyZW50KTt9O1xuUmVnaW9uLnByb3RvdHlwZS5yZW1vdmUgPSBmdW5jdGlvbiAoYXRJbmRleCkgeyByZXR1cm4gcmVtb3ZlLmNhbGwodGhpcywgYXRJbmRleCk7fTtcblJlZ2lvbi5wcm90b3R5cGUuZW1wdHkgPSBmdW5jdGlvbigpIHtyZXR1cm4gZW1wdHkuY2FsbCh0aGlzKTt9O1xuUmVnaW9uLnByb3RvdHlwZS5pbnNlcnQgPSBmdW5jdGlvbiAoYXRJbmRleCwgY29tcG9uZW50SWQsIHByb3BlcnRpZXMpIHtcblx0cmV0dXJuIGluc2VydC5jYWxsKHRoaXMsIGF0SW5kZXgsIGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKTtcbn07XG5SZWdpb24ucHJvdG90eXBlLmFwcGVuZCA9IGZ1bmN0aW9uKGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKSB7XG5cdHJldHVybiBhcHBlbmQuY2FsbCh0aGlzLCBjb21wb25lbnRJZCwgcHJvcGVydGllcyk7XG59O1xuUmVnaW9uLnByb3RvdHlwZS5hdHRhY2ggPSBmdW5jdGlvbihjb21wb25lbnQsIHByb3BlcnRpZXMpIHtcblx0cmV0dXJuIGFwcGVuZC5jYWxsKHRoaXMsIGNvbXBvbmVudCwgcHJvcGVydGllcyk7XG59O1xuIiwiLyoqXG4gKiByZWdpb24ucmVtb3ZlKCBhdEluZGV4IClcbiAqXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcmVtb3ZlKGF0SW5kZXgpIHtcblxuXHRpZiAoIWF0SW5kZXggJiYgIV8uaXNGaW5pdGUoYXRJbmRleCkpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IodGhpcy5pZCArICcucmVtb3ZlKCkgOjogTm8gYXRJbmRleCBzcGVjaWZpZWQhIFxcblVzYWdlOiByZW1vdmUoYXRJbmRleCknKTtcblx0fVxuXG5cdC8vIFJlbW92ZSB0aGUgY29tcG9uZW50IGZyb20gdGhlIGxpc3Rcblx0dmFyIGNvbXBvbmVudCA9IHRoaXMuX2NoaWxkcmVuLnNwbGljZShhdEluZGV4LCAxKTtcblx0aWYgKCFjb21wb25lbnRbMF0pIHtcblxuXHRcdC8vIElmIHRoZSBsaXN0IGlzIGVtcHR5LCBmcmVhayBvdXRcblx0XHR0aHJvdyBuZXcgRXJyb3IodGhpcy5pZCArICcucmVtb3ZlKCkgOjogVHJ5aW5nIHRvIHJlbW92ZSBhIGNvbXBvbmVudCB0aGF0IGRvZXNuXFwndCBleGlzdCBhdCBpbmRleCAnICsgYXRJbmRleCk7XG5cdH1cblxuXHQvLyBTcXVlZXplIHRoZSBjb21wb25lbnQgdG8gZG8gZ2V0IGFsbCB0aGUgYmluZHkgZ29vZG5lc3Mgb3V0XG5cdGNvbXBvbmVudFswXS5jbG9zZSgpO1xuXG5cdEZSQU1FV09SSy5kZWJ1Zyh0aGlzLnBhcmVudC5pZCArICcgOjogUmVtb3ZlZCBjb21wb25lbnQgYXQgaW5kZXggJyArIGF0SW5kZXggKyAnIGZyb20gcmVnaW9uOiAnICsgdGhpcy5pZCk7XG59O1xuIiwiLyoqXG4gKiBCYXJlLWJvbmVzIERPTS9VSSB1dGlsaXRpZXNcbiAqL1xuXG52YXIgRXZlbnRzID0gcmVxdWlyZSgnLi9ldmVudHMnKTtcblxuRE9NID0ge1xuXG5cdC8qKlxuXHQgKiBFeHBvc2UgdGhlIFwiRE9NbXktZXZlbnRlZG5lc3NcIiBvZiBlbGVtZW50cyBzbyB0aGF0IGl0J3Mgc2VsZWN0YWJsZSB2aWEgQ1NTXG5cdCAqIFlvdSBjYW4gdXNlIHRoaXMgdG8gYXBwbHkgYSBmZXcgY2hvaWNlIERPTSBtb2RpZmljYXRpb25zIG91dCB0aGUgZ2F0ZS0tXG5cdCAqIChlLmcuIHR3ZWFrcyB0YXJnZXRpbmcgY29tbW9uIGlzc3VlcyB0aGF0IHR5cGljYWxseSBnZXQgZm9yZ290dGVuLCBsaWtlIGRpc2FibGluZyB0ZXh0IHNlbGVjdGlvbilcblx0ICpcblx0ICogQHBhcmFtIHtDb21wb25lbnR9IGNvbXBvbmVudFxuXHQgKi9cblx0ZmxhZ0JvdW5kRXZlbnRzOiBmdW5jdGlvbiAoIGNvbXBvbmVudCApIHtcblxuXHRcdC8vIFRPRE86IHByb3ZpZGUgYWNjZXNzIHRvIGJvdW5kIGdsb2JhbCBldmVudHMgKCUpIGFuZCByb3V0ZXMgKCMpIGFzIHdlbGxcblx0XHQvLyBUT0RPOiBmbGFnIGFsbCBET00gZXZlbnRzLCBub3QganVzdCBjbGljayBhbmQgdG91Y2hcblxuXHRcdC8vIEJ1aWxkIHN1YnNldCBvZiBqdXN0IHRoZSBjbGljay90b3VjaCBldmVudHNcblx0XHR2YXIgY2xpY2tPclRvdWNoRXZlbnRzID0gRXZlbnRzLnBhcnNlKFxuXHRcdFx0Y29tcG9uZW50LmV2ZW50cyxcblx0XHRcdHsgb25seTogWydjbGljaycsICd0b3VjaCcsICd0b3VjaHN0YXJ0JywgJ3RvdWNoZW5kJ10gfVxuXHRcdCk7XG5cblx0XHQvLyBJZiBubyBjbGljay90b3VjaCBldmVudHMgZm91bmQsIGJhaWwgb3V0XG5cdFx0aWYgKCBjbGlja09yVG91Y2hFdmVudHMubGVuZ3RoIDwgMSApIHJldHVybjtcblxuXHRcdC8vIFF1ZXJ5IGFmZmVjdGVkIGVsZW1lbnRzIGZyb20gRE9NXG5cdFx0dmFyICRhZmZlY3RlZCA9IEV2ZW50cy5nZXRFbGVtZW50cyhjbGlja09yVG91Y2hFdmVudHMsIGNvbXBvbmVudCk7XG5cblx0XHQvLyBOT1RFOiBGb3Igbm93LCB0aGlzIGlzIGFsd2F5cyBqdXN0ICdjbGljaydcblx0XHR2YXIgYm91bmRFdmVudHNTdHJpbmcgPSAnY2xpY2snO1xuXG5cdFx0Ly8gU2V0IGBkYXRhLUZSQU1FV09SSy1jbGlja2FibGVgIGN1c3RvbSBhdHRyaWJ1dGVcblx0XHQvLyAodWkgbG9naWMgc2hvdWxkIGJlIGV4dGVuZGVkIGluIENTUylcblx0XHQkYWZmZWN0ZWQuYXR0cignZGF0YS0nICsgRlJBTUVXT1JLLmlkICsgJy1ldmVudHMnLCBib3VuZEV2ZW50c1N0cmluZyk7XG5cblx0XHRGcmFtZXdvcmsudmVyYm9zZShcblx0XHRcdGNvbXBvbmVudC5pZCArICcgOjogJyArXG5cdFx0XHQnRGlzYWJsZWQgdXNlciB0ZXh0IHNlbGVjdGlvbiBvbiBlbGVtZW50cyB3LyBjbGljay90b3VjaCBldmVudHM6Jyxcblx0XHRcdGNsaWNrT3JUb3VjaEV2ZW50cyxcblx0XHRcdCRhZmZlY3RlZFxuXHRcdCk7XG5cdH0sXG5cblxuXHQvKipcblx0ICogU3VwcG9ydGVkIFwiZmlyc3QtY2xhc3NcIiBET00gZXZlbnRzLlxuXHQgKiBAdHlwZSB7QXJyYXl9XG5cdCAqL1xuXHRldmVudHM6IFtcblxuXHRcdC8vIExvY2FsaXplZCBicm93c2VyIGV2ZW50c1xuXHRcdC8vICh3b3JrcyBvbiBpbmRpdmlkdWFsIGVsZW1lbnRzKVxuXHRcdCdlcnJvcicsICdzY3JvbGwnLFxuXG5cdFx0Ly8gTW91c2UgZXZlbnRzXG5cdFx0J2NsaWNrJywgJ2RibGNsaWNrJywgJ21vdXNlZG93bicsICdtb3VzZXVwJywgJ2hvdmVyJywgJ21vdXNlZW50ZXInLCAnbW91c2VsZWF2ZScsXG5cdFx0J21vdXNlb3ZlcicsICdtb3VzZW91dCcsICdtb3VzZW1vdmUnLFxuXG5cdFx0Ly8gS2V5Ym9hcmQgZXZlbnRzXG5cdFx0J2tleWRvd24nLCAna2V5dXAnLCAna2V5cHJlc3MnLFxuXG5cdFx0Ly8gRm9ybSBldmVudHNcblx0XHQnYmx1cicsICdjaGFuZ2UnLCAnZm9jdXMnLCAnZm9jdXNpbicsICdmb2N1c291dCcsICdzZWxlY3QnLCAnc3VibWl0JyxcblxuXHRcdC8vIFJhdyB0b3VjaCBldmVudHNcblx0XHQndG91Y2hzdGFydCcsICd0b3VjaGVuZCcsICd0b3VjaG1vdmUnLCAndG91Y2hjYW5jZWwnLFxuXG5cdFx0Ly8gTWFudWZhY3R1cmVkIGV2ZW50c1xuXHRcdCd0b3VjaCcsXG5cblx0XHQvLyBUT0RPOlxuXHRcdCdyaWdodGNsaWNrJywgJ2NsaWNrb3V0c2lkZSdcblx0XVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBET007XG4iLCIvKipcbiAqIFV0aWxpdHkgRXZlbnQgdG9vbGtpdFxuICovXG5cbnZhciBVdGlscyA9IHJlcXVpcmUoJy4vdXRpbHMnKTtcblxuRXZlbnRzID0ge1xuXG5cdC8qKlxuXHQgKiBQYXJzZXMgYSBkaWN0aW9uYXJ5IG9mIGV2ZW50cyBhbmQgb3B0aW9uYWxseSBmaWx0ZXJzIGJ5IHRoZSBldmVudCB0eXBlLiBJZiB0aGUgZXZlbnRcblx0ICpcblx0ICogQHBhcmFtICB7T2JqZWN0fSBldmVudHMgIFtBIEJhY2tib25lLlZpZXcgZXZlbnRzIG9iamVjdF1cblx0ICogQHBhcmFtICB7T2JqZWN0fSBvcHRpb25zIFtPcHRpb25zIG9iamVjdCB0aGF0IGFsbG93cyB1cyB0byBmaWx0ZXIgcGFyc2luZyB0byBjZXJ0YWluIGV2ZW50XG5cdCAqICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZXNdXG5cdCAqXG5cdCAqIEByZXR1cm4ge0FycmF5fSAgICAgICAgICBbQXJyYXkgY29udGFpbmluZyBwYXJzZWRFdmVudHMgdGhhdCBhcmUgbWF0Y2hpbmcgZXZlbnQga2V5c11cblx0ICovXG5cdHBhcnNlOiBmdW5jdGlvbiAoZXZlbnRzLCBvcHRpb25zKSB7XG5cblx0XHR2YXIgZXZlbnRLZXlzID0gXy5rZXlzKGV2ZW50cyB8fCB7fSksXG5cdFx0XHRsaW1pdEV2ZW50cyxcblx0XHRcdHBhcnNlZEV2ZW50cyA9IFtdO1xuXG5cdFx0Ly8gT3B0aW9uYWxseSBmaWx0ZXIgdXNpbmcgc2V0IG9mIGFjY2VwdGFibGUgZXZlbnQgdHlwZXNcblx0XHRsaW1pdEV2ZW50cyA9IG9wdGlvbnMub25seTtcblx0XHRldmVudEtleXMgPSBfLmZpbHRlcihldmVudEtleXMsIGZ1bmN0aW9uIGNoZWNrRXZlbnROYW1lIChldmVudEtleSkge1xuXG5cdFx0XHQvLyBQYXJzZSBldmVudCBzdHJpbmcgaW50byBzZW1hbnRpYyByZXByZXNlbnRhdGlvblxuXHRcdFx0dmFyIGV2ZW50ID0gVXRpbHMucGFyc2VET01FdmVudChldmVudEtleSk7XG5cdFx0XHRwYXJzZWRFdmVudHMucHVzaChldmVudCk7XG5cblx0XHRcdC8vIE9wdGlvbmFsIGZpbHRlclxuXHRcdFx0aWYgKGxpbWl0RXZlbnRzKSB7XG5cdFx0XHRcdHJldHVybiBfLmNvbnRhaW5zKGxpbWl0RXZlbnRzLCBldmVudC5uYW1lKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHBhcnNlZEV2ZW50cztcblx0fSxcblxuXHQvKipcblx0ICogW2dldEVsZW1lbnRzIGRlc2NyaXB0aW9uXVxuXHQgKlxuXHQgKiBAcGFyYW0gIHtBcnJheX0gc2VtYW50aWNFdmVudHMgW0EgbGlzdCBvZiBwYXJzZWQgZXZlbnQgb2JqZWN0c11cblx0ICogQHBhcmFtICB7Q29tcG9uZW50fSBjb250ZXh0ICAgIFtJbnN0YW5jZSBvZiBhIGNvbXBvbmVudCB0byB1c2UgYXMgYSBzdGFydGluZyBwb2ludCBmb3Jcblx0ICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGUgRE9NIHF1ZXJpZXNdXG5cdCAqXG5cdCAqIEByZXR1cm4ge0FycmF5fSAgICAgICAgICAgICAgICBbQW4gYXJyYXkgb2YgalF1ZXJ5IHNldCBvZiBtYXRjaGVkIGVsZW1lbnRzXVxuXHQgKi9cblx0Z2V0RWxlbWVudHM6IGZ1bmN0aW9uIChzZW1hbnRpY0V2ZW50cywgY29udGV4dCkge1xuXG5cdFx0Ly8gQ29udGV4dCBvcHRpb25hbFxuXHRcdGNvbnRleHQgPSBjb250ZXh0IHx8IHsgJDogJCB9O1xuXG5cdFx0Ly8gSXRlcmF0aXZlbHkgYnVpbGQgYSBzZXQgb2YgYWZmZWN0ZWQgZWxlbWVudHNcblx0XHR2YXIgJGFmZmVjdGVkID0gJCgpO1xuXHRcdF8uZWFjaChzZW1hbnRpY0V2ZW50cywgZnVuY3Rpb24gbG9va3VwRWxlbWVudHNGb3JFdmVudCAoZXZlbnQpIHtcblxuXHRcdFx0Ly8gRGV0ZXJtaW5lIG1hdGNoZWQgZWxlbWVudHNcblx0XHRcdC8vIFVzZSBkZWxlZ2F0ZSBzZWxlY3RvciBpZiBzcGVjaWZpZWRcblx0XHRcdC8vIE90aGVyd2lzZSwgZ3JhYiB0aGUgZWxlbWVudCBmb3IgdGhpcyBjb21wb25lbnRcblx0XHRcdHZhciAkbWF0Y2hlZCA9XHRldmVudC5zZWxlY3RvciA/XG5cdFx0XHRcdFx0XHRcdGNvbnRleHQuJChldmVudC5zZWxlY3RvcikgOlxuXHRcdFx0XHRcdFx0XHRjb250ZXh0LiRlbDtcblxuXHRcdFx0Ly8gQWRkIG1hdGNoZWQgZWxlbWVudHMgdG8gc2V0XG5cdFx0XHQkYWZmZWN0ZWQgPSAkYWZmZWN0ZWQuYWRkKCAkbWF0Y2hlZCApO1xuXHRcdH0sIHRoaXMpO1xuXG5cdFx0cmV0dXJuICRhZmZlY3RlZDtcblx0fVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBFdmVudHM7XG4iLCIvKipcbiAqIFV0aWxpdHkgZnVuY3Rpb25zIHRoYXQgYXJlIHVzZWQgdGhyb3VnaG91dCB0aGUgY29yZS5cbiAqL1xuXG52YXIgRE9NID0gcmVxdWlyZSgnLi9ET00nKTtcblxuVXRpbHMgPSB7XG5cblx0LyoqXG5cdCAqIEdyYWJzIHRoZSBpZCB4b3IgZGF0YS1pZCBmcm9tIGFuIEhUTUwgZWxlbWVudC5cblx0ICpcblx0ICogQHBhcmFtICB7RE9NRWxlbWVudH0gZWwgICAgW0VsZW1lbnQgd2hlcmUgd2UgYXJlIGxvb2tpbmcgZm9yIHRoZSBgaWRgIG9yIGBkYXRhLWlkYCBhdHRyXVxuXHQgKiBAcGFyYW0gIHtCb29sZWFufSByZXF1aXJlZCBbRGV0ZXJtaW5lcyBpZiBpdCBpcyByZXF1aXJlZCB0byBmaW5kIGFuIGBpZGAgb3IgYGRhdGEtaWRgIGF0dHJdXG5cdCAqXG5cdCAqIEByZXR1cm4ge1N0cmluZ30gICAgICAgICAgXHRbSWRlbnRpZmljYXRpb24gc3RyaW5nIHRoYXQgd2FzIGZvdW5kXVxuXHQgKi9cblx0ZWwyaWQ6IGZ1bmN0aW9uIChlbCwgcmVxdWlyZWQpIHtcblxuXHRcdHZhciBpZCA9ICQoZWwpLmF0dHIoJ2lkJyk7XG5cdFx0dmFyIGRhdGFJZCA9ICQoZWwpLmF0dHIoJ2RhdGEtaWQnKTtcblx0XHR2YXIgY29udGVudHNJZCA9ICQoZWwpLmF0dHIoJ2NvbnRlbnRzJyk7XG5cblx0XHRpZiAoaWQgJiYgZGF0YUlkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoaWQgKyAnIDo6IENhbm5vdCBzZXQgYm90aCBgaWRgIGFuZCBgZGF0YS1pZGAhICBQbGVhc2UgdXNlIG9uZSBvciB0aGUgb3RoZXIuICAoZGF0YS1pZCBpcyBzYWZlc3QpJyk7XG5cdFx0fVxuXHRcdGlmIChyZXF1aXJlZCAmJiAhaWQgJiYgIWRhdGFJZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdObyBpZCBzcGVjaWZpZWQgaW4gZWxlbWVudCB3aGVyZSBpdCBpcyByZXF1aXJlZDpcXG4nICsgZWwpO1xuXHRcdH1cblxuXHRcdHJldHVybiBpZCB8fCBkYXRhSWQgfHwgY29udGVudHNJZDtcblx0fSxcblxuXHQvKipcblx0ICogUmVnZXhwIHRvIG1hdGNoIFwiZmlyc3QgY2xhc3NcIiBET00gZXZlbnRzXG5cdCAqICh0aGVzZSBhcmUgYWxsb3dlZCBpbiB0aGUgdG9wIGxldmVsIG9mIGEgY29tcG9uZW50IGRlZmluaXRpb24gYXMgbWV0aG9kIGtleXMpXG5cdCAqXHRcdGkuZS4gL14oY2xpY2t8aG92ZXJ8Ymx1cnxmb2N1cykoICguKykpL1xuXHQgKlx0XHRcdFsxXSA9PiBldmVudCBuYW1lXG5cdCAqXHRcdFx0WzNdID0+IHNlbGVjdG9yXG5cdCAqL1xuXHQnL0RPTUV2ZW50Lyc6IG5ldyBSZWdFeHAoJ14oJyArIF8ucmVkdWNlKERPTS5ldmVudHMsXG5cdFx0ZnVuY3Rpb24gYnVpbGRSZWdleHAgKG1lbW8sIGV2ZW50TmFtZSwgaW5kZXgpIHtcblxuXHRcdFx0Ly8gT21pdCBgfGAgdGhlIGZpcnN0IHRpbWVcblx0XHRcdGlmIChpbmRleCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gbWVtbyArIGV2ZW50TmFtZTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIG1lbW8gKyAnfCcgKyBldmVudE5hbWU7XG5cdFx0fSwgJycpICtcblx0XHQnKSggKC4rKSk/JCcpLFxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHdoZXRoZXIgdGhlIHNwZWNpZmllZCBldmVudCBrZXkgbWF0Y2hlcyBhIERPTSBldmVudC5cblx0ICpcblx0ICogQHBhcmFtICB7U3RyaW5nfSBrZXkgW0tleSB0byBtYXRjaCBhZ2FpbnN0XVxuXHQgKlxuXHRcdCogaWYgbm8gbWF0Y2ggaXMgZm91bmRcblx0ICogQHJldHVybiB7Qm9vbGVhbn0gXHRcdFtyZXR1cm4gYGZhbHNlYF1cblx0ICpcblx0ICogb3RoZXJ3aXNlXG5cdCAqIEByZXR1cm4ge09iamVjdH0gIFx0XHRbT2JqZWN0IGNvbnRhaW5pbmcgdGhlIGBuYW1lYCBvZiB0aGUgRE9NIGVsZW1lbnQgYW5kIHRoZSBgc2VsZWN0b3JgXVxuXHQgKi9cblx0cGFyc2VET01FdmVudDogXy5tZW1vaXplKGZ1bmN0aW9uIChrZXkpIHtcblxuXHRcdHZhciBtYXRjaGVzID0ga2V5Lm1hdGNoKHRoaXNbJy9ET01FdmVudC8nXSk7XG5cblx0XHRpZiAoIW1hdGNoZXMgfHwgIW1hdGNoZXNbMV0pIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZVx0XHQ6IG1hdGNoZXNbMV0sXG5cdFx0XHRzZWxlY3Rvclx0OiBtYXRjaGVzWzNdXG5cdFx0fTtcblx0fSksXG5cblx0LyoqXG5cdCAqIE1hcCBhbiBvYmplY3QncyB2YWx1ZXMsIGJ1dCByZXR1cm4gYSB2YWxpZCBvYmplY3QgKHRoaXMgZnVuY3Rpb24gaXMgaGFuZHkgYmVjYXVzZVxuXHQgKiB1bmRlcnNjb3JlLm1hcCgpIHJldHVybnMgYSBsaXN0LCBub3QgYW4gb2JqZWN0Lilcblx0ICpcblx0ICogQHBhcmFtICB7T2JqZWN0fSBvYmogICAgICAgICBcdFtPamVjdCB3aG9zIHZhbHVlcyB5b3Ugd2FudCB0byBtYXBdXG5cdCAqIEBwYXJhbSAge0Z1bmN0aW9ufSB0cmFuc2Zvcm1GbiBbRnVuY3Rpb24gdG8gdHJhbnNmb3JtIGVhY2ggb2JqZWN0IHZhbHVlIGJ5XVxuXHQgKlxuXHQgKiBAcmV0dXJuIHtPYmplY3R9ICAgICAgICAgICAgIFx0W05ldyBvYmplY3Qgd2l0aCB0aGUgdmFsdWVzIG1hcHBlZF1cblx0ICovXG5cdG9iak1hcDogZnVuY3Rpb24gb2JqTWFwIChvYmosIHRyYW5zZm9ybUZuKSB7XG5cdFx0cmV0dXJuIF8ub2JqZWN0KF8ua2V5cyhvYmopLCBfLm1hcChvYmosIHRyYW5zZm9ybUZuKSk7XG5cdH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gVXRpbHM7XG4iXX0=
;