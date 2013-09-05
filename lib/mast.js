;(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * Mast build file. The main file
 */

var define = require('./define/index');
var Region = require('./region/index');
var Component = require('./component/index');
var raise = require('./raise/index');

(function(global, undefined) {

	global.FRAMEWORK = Backbone;

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

})(window);

},{"./component/index":5,"./define/index":10,"./raise/index":16,"./region/index":21}],2:[function(require,module,exports){
/**
 * Bind collection events to lifecycle event handlers
 */
exports.collectionEvents = function() {
	// Bind to collection events if one was passed in
	if (this.collection) {

		// Listen to events
		this.listenTo(this.collection, 'add', this.afterAdd);
		this.listenTo(this.collection, 'remove', this.afterRemove);
		this.listenTo(this.collection, 'reset', this.afterReset);
	}
};

/**
 * Bind model events to lifecycle event handlers and also allows for handlers to fire
 * on certain model attribute changes.
 */
exports.modelEvents = function() {
	if (this.model) {

		// Listen for any attribute changes
		// e.g.
		// .afterChange(model, options)
		//
		this.listenTo(this.model, 'change', function modelChanged (model, options) {
			if (_.isFunction(this.afterChange)) {
				this.afterChange(model, options);
			}
		});

		// Listen for specific attribute changes
		// e.g.
		// .afterChange.color(model, value, options)
		//
		if (_.isObject(this.afterChange)) {
			_.each(this.afterChange, function (handler, attrName) {

				// Call handler with newVal to keep arguments straightforward
				this.listenTo(this.model, 'change:' + attrName, function attrChanged (model, newVal) {
					handler.call(self, newVal);
				});

			}, this);
		}
	}
};

/**
 * Listens for and runs handlers on global events that are listened for on a component.
 */
exports.globalTriggers = function() {

	this.listenTo(FRAMEWORK, 'all', function (eRoute) {

		// Trim off all but the first argument to pass through to handler
		var args = Array.prototype.slice.call(arguments);
		args.shift();

		// Iterate through each subscription on this component
		// and listen for the specified global events
		_.each(this.subscriptions, function(handler, matchPattern) {

			// Grab regex and param parsing logic from Backbone core
			var extractParams = Backbone.Router.prototype._extractParameters,
				calculateRegex = Backbone.Router.prototype._routeToRegExp;

			// Trim trailing
			matchPattern = matchPattern.replace(/\/*$/g, '');
			// and er sort of.. leading.. slashes
			matchPattern = matchPattern.replace(/^([#~%])\/*/g, '$1');
			// TODO: optimization- this really only has to be done once, on raise(), we should do that


			// Come up with regex for this matchPattern
			var regex = calculateRegex(matchPattern);

			// If this matchPatern is this is not a match for the event,
			// `continue` it along to it can try the next matchPattern
			if (!eRoute.match(regex)) return;

			// Parse parameters for use as args to the handler
			// (or an empty list if none exist)
			var params = extractParams(regex, eRoute);

			// Handle string redirects to function names
			if (!_.isFunction(handler)) {
				handler = self[handler];

				if (!handler) {
					throw new Error('Cannot trigger subscription because of unknown handler: ' + handler);
				}
			}

			// Bind context and arguments to subscription handler
			handler.apply(this, _.union(args, params));

		});
	});
};

},{}],3:[function(require,module,exports){
/**
 * Safely zap every trace about this component from memory.
 */

var helpers = require('./helpers');

module.exports = function close() {

	FRAMEWORK.debug('Closed ' + this.id + ' component.');
	var self = this;

	// Cancel current render and close jobs, if they're running
	if (this._rendering) {
		this.cancelRender();
		self._rendering = false;
	}
	if (this._closing) {
		this.cancelClose();
		self._closing = false;
	}

	// Lock access to close()
	this._closing = true;

	this.beforeClose(function () {

		// > NOTE: `this._closing=false` can and probably should be removed,
		// > since mutex is unnecessary now that the component is up for garbage collection
		// > Waiting to do this until it can be tested further

		// Unlock close()
		self._closing = false;

		// Stop listening to all global triggers (%|#)

		// Close all child components

		helpers.emptyAllRegions.call(self);

		// Call native `Backbone.View.prototype.remove()`
		// to undelegate events, etc.
		self.remove();

	});
};

},{"./helpers":4}],4:[function(require,module,exports){
/**
 * Helper functions used by components/
 */

var helpers = module.exports = {

	/**
 * If any regions exist in this component,
 * empty them, and then delete them
 */
	emptyAllRegions: function() {
		_.each(this.regions, function (region, key) {
			region.empty();
			delete this.regions[key];
		}, this);
	},

	/**
	 * Instantiate region components and append any default
	 * templates/components to the DOM
	 */
	renderRegions: function() {
		var self = this;

		helpers.emptyAllRegions();

		// Detect child regions in template
		var $regions = this.$('region');
		$regions.each(function (i, el) {

			// Provide backwards compatibility for
			// `default`, `contents` and `template` notation
			var componentId = $(el).attr('default');
			componentId = componentId || $(el).attr('contents');
			componentId = componentId || $(el).attr('template');
			$(el).attr('contents', componentId);

			// Generate a region instance from the element
			// (modifying the DOM as necessary)
			var region = FRAMEWORK.Region.fromElement(el, self);

			// Keep track of regions, since we are the parent component
			self.regions[region.id] = region;

			// As long as there are no collisions,
			// provide a friendly reference to the region on the top level of the collection
			if (!self[region.id]) {
				self[region.id] = region;
			}
		});
	},

	/**
	 * Convert template HTML and data into a compiled $template
	 */
	compileTemplate: function() {

		// Create template data context by providing access to the global Data object,
		// Also fold in the model associated with this component, if there is one
		var templateContext = _.extend({

			// Allows you to get a hold of data,
			// but use a default value if it doesn't exist
			get: function (key, defaultVal) {
				var val = templateContext[key];
				if (typeof val === 'undefined') {
					val = defaultVal;
				}
				return val;
			}
		},

		// All FRAMEWORK.data is available in every template
		FRAMEWORK.data);

		// If a model is provided for this component, make it available in this template
		if (this.model) {
			_.extend(templateContext, this.model.attributes);
		}

		// Template the HTML with the data
		var html;
		try {
			// Accept precompiled templates
			if (_.isFunction(this.template)) {
				html = this.template(templateContext);
			}
			// Or raw strings
			else html = _.template(this.template, templateContext);
		}
		catch (e) {
			var str = e,
				stack = '';

			if (e instanceof Error) {
				str =  e.toString();
				stack = e.stack;
			}

			FRAMEWORK.error(this.id + ' :: render() error in template :\n' + str + '\nTemplate :: ' + html + '\n' + stack);
			html = this.template;
		}

		return html;
	}

};

},{}],5:[function(require,module,exports){
/**
 * Component is an extended `Backbone.View`. It add features suck as automatic event binding,
 * rendering, lifecycle hooks and events, and more.
 */

var lifecycleHooks  = require('./lifecycleHooks');
var lifecycleEvents = require('./lifecycleEvents');
var bindEvents      = require('./bindEvents');
var close           = require('./close');
var render          = require('./render');
var bindEvents      = require ('./bindEvents');

Component = module.exports = Backbone.View.extend();


_.extend(Component.prototype, {

	// Lifecycle Hooks
	beforeRender: function(cb) {
		lifecycleHooks.beforeRender.call(this, cb);
	},
	beforeClose: function(cb) {
		lifecycleHooks.beforeClose.call(this, cb);
	},
	afterRender: function() {
		lifecycleHooks.afterRender.call(this);
	},
	cancelRender: function() {
		lifecycleHooks.cancelRender.call(this);
	},
	cancelClose: function() {
		lifecycleHooks.cancelClose.call(this);
	},

	// Lifecycle Events
	afterChange: function(model, options) {
		lifecycleEvents.afterChange.call(this, model, options);
	},
	afterAdd: function(model, collection, options) {
		lifecycleEvents.afterAdd.call(this, model, collection, options);
	},
	afterRemove: function(model, collection, options) {
		lifecycleEvents.afterRemove.call(this, model, collection, options);
	},
	afterReset: function(collection, options) {
		lifecycleEvents.afterReset.call(this, collection, options);
	},

	// Prototype methods.
	close: function() {
		close.call(this)
	},
	render: function(atIndex) {
		render.call(this, atIndex);
	}
});




Component.prototype.initialize = function(properties) {

	var self = this;

	// Extend instance w/ specified properties and methods
	_.extend(this, properties);

	// Start with empty regions object
	this.regions = {};

	// Bind the events on model/collections and global triggered events.
	bindEvents.collectionEvents.call(this);
	bindEvents.modelEvents.call(this);
	bindEvents.globalTriggers.call(this);

	// Encourage child methods to use the component context
	_.bindAll(this);

	// Bind context to event handlers
	_.each(this.events, function(handler, eventString) {
		_.bind(handler, this);
	}, this);
};

},{"./bindEvents":2,"./close":3,"./lifecycleEvents":6,"./lifecycleHooks":7,"./render":8}],6:[function(require,module,exports){
// Fired when the bound model is updated (`this.model`)
exports.afterChange = function (model, options) {};

// Fired when a model is added to the bound collection (`this.collection`)
exports.afterAdd = function (model, collection, options) {};

// Fired when a model is removed from the bound collection (`this.collection`)
exports.afterRemove = function (model, collection, options) {};

// Fired when the bound collection is wiped (`this.collection`)
exports.afterReset = function (collection, options) {};

},{}],7:[function(require,module,exports){
// Fired automatically when the view is initially created
// only fired afterwards if this.render() is explicitly called
// Callback must be fired!!
exports.beforeRender = function (cb) {cb();};

// Fired automatically when the view is initially created
// only fired afterwards if this.render() is explicitly called
exports.afterRender = function () {};

// Fired automatically when the view is closed
exports.beforeClose = function (cb) {cb();};

// Fired before rerendering or closing a view that is already waiting on a lock
exports.cancelRender = function () {
	FRAMEWORK.warn('cancelRender() should be defined if beforeClose(cb) or beforeRender(cb)' +
								 'are being used!');
};

// Fired before rerendering or closing a view that is already waiting on a lock
exports.cancelClose = function () {
	FRAMEWORK.warn('cancelClose() should be defined if beforeClose(cb) or beforeRender(cb)' +
								 'are being used!');
};

},{}],8:[function(require,module,exports){
/**
 * Run HTML template through engine and append results to outlet. Also rerender regions.
 * If atIndex is specified, the component is rendered at the given position within its
 * outlet. Otherwise, the last position is used.
 *
 * @param {Number} atIndex [The index in which to render this element]
 */

var DOM = require ('../utils/DOM'),
		helpers = require('./helpers');

module.exports = function render(atIndex) {

	FRAMEWORK.debug(this.id + ' :---: Rendering component...');

	var self = this;

	// Cancel current render and close jobs, if they're running
	if (this._rendering) {
		FRAMEWORK.debug(this.id + ' :: render() canceled.');
		this.cancelRender();
		self._rendering = false;
	}
	if (this._closing) {
		FRAMEWORK.debug(this.id + ' :: close() canceled.');
		this.cancelClose();
		self._closing = false;
	}

	// Lock access to render
	this._rendering = true;

	// Trigger beforeRender method
	this.beforeRender(function () {


		// Unlock rendering mutex
		self._rendering = false;

		if (!self.$outlet) {
			throw new Error(self.id + ' :: Trying to render(), but no $outlet was defined!');
		}

		// Refresh compiled template
		var html = helpers.compileTemplate.call(self);
		if (!html) {
			throw new Error(this.id + ' :: Unable to render component because template compilation did not return any HTML.');
		}

		// Strip trailing and leading whitespace to avoid falsely diagnosing
		// multiple elements, when only one actually exists
		// (this misdiagnosis wraps the template in an extraneous <div>)
		html = html.replace(/^\s*/, '');
		html = html.replace(/\s*$/, '');
		html = html.replace(/(\r|\n)*/, '');

		// Strip HTML comments, then strip whitespace again
		// (TODO: optimize this)
		html = html.replace(/(<!--.+-->)*/, '');
		html = html.replace(/^\s*/, '');
		html = html.replace(/\s*$/, '');
		html = html.replace(/(\r|\n)*/, '');

		// Parse a DOM node or series of DOM nodes from the newly templated HTML
		var parsedNodes = $.parseHTML(html);
		var el = parsedNodes[0];

		// If no nodes were parsed, throw an error
		if (parsedNodes.length === 0) {
			throw new Error(self.id + ' :: render() ran into a problem rendering the template with HTML => \n'+html);
		}

		// If there is not one single wrapper element,
		// or if the rendered template contains only a single text node,
		// (or just a lone region)
		else if (parsedNodes.length > 1 || parsedNodes[0].nodeType === 3 ||
						 $(parsedNodes[0]).is('region')) {

			FRAMEWORK.log(self.id + ' :: Wrapping template in <div/>...', parsedNodes);

			// wrap the html up in a container <div/>
			el = $('<div/>').append(html);
			el = el[0];
		}

		// Set Backbone element (cache and redelegate DOM events)
		// (Will also update self.$el)
		self.setElement(el);
		///////////////////////////////////////////////////////////////


		// Detect and render all regions and their descendent components and regions
		helpers.renderRegions.call(self);

		// Insert the element at the proper place amongst the outlet's children
		var neighbors = self.$outlet.children();
		if (_.isFinite(atIndex) && neighbors.length > 0 && neighbors.length > atIndex) {
			neighbors.eq(atIndex).before(self.$el);
		}

		// But if the outlet is empty, or there's no atIndex, just stick it on the end
		else self.$outlet.append(self.$el);

		// Finally, trigger afterRender method
		self.afterRender();

		// Add data attributes to this component's $el, providing access
		// to whether the element has various DOM bindings from stylesheets.
		// (handy for disabling text selection accordingly, etc.)
		//
		// -> disable for this component with `this.attrFlags = false`
		// -> or globally with `FRAMEWORK.attrFlags = false`
		//
		// TODO: make it work with delegated DOM event bindings
		//
		if (self.attrFlags !== false && FRAMEWORK.attrFlags !== false) {
			DOM.flagBoundEvents(self);
		}
	});
}

},{"../utils/DOM":24,"./helpers":4}],9:[function(require,module,exports){
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

},{}],10:[function(require,module,exports){
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

},{}],11:[function(require,module,exports){
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

},{"./setup":12}],12:[function(require,module,exports){
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

},{}],13:[function(require,module,exports){
/**
 * Given a component definition and its key, we will build up the component prototype and merge
 * this component with its matching template.
 *
 * @param  {Object} componentDef [Object containing the component definition]
 * @param  {String} componentKey [The component identifier]
 */

var translateShorthand = require('../utils/shorthand');

module.exports = function buildComponentPrototype(componentDef, componentKey) {

	// If component id is not explicitly set, use the componentKey
	if (!componentDef.id) {
		componentDef.id = componentKey;
	}

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
	componentDef = Utils.objMap(componentDef, _.bind(translateShorthand, componentDef));

	// and events object
	// TODO: require utils
	if (componentDef.events) {
		componentDef.events = Utils.objMap(
			componentDef.events,
			translateShorthand
		);
	}

	// and afterChange bindings
	// TODO: require utils
	if (_.isObject(componentDef.afterChange) && !_.isFunction(componentDef.afterChange)) {
		componentDef.afterChange = Utils.objMap(
			componentDef.afterChange,
			translateShorthand
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

},{"../utils/shorthand":26}],14:[function(require,module,exports){
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

},{}],15:[function(require,module,exports){
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

},{"../utils/utils":27}],16:[function(require,module,exports){
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

},{"../define/buildDefinition":9,"../logger/index":11,"./buildPrototype":13,"./collectRegions":14,"./collectTemplates":15}],17:[function(require,module,exports){
/**
 * region.append( componentId, [properties] )
 *
 * Calls insert() at last position
 */
module.exports = function append(componentId, properties) {
	// Insert at last position
	console.log(componentId);
	return this.insert(this._children.length, componentId, properties);
};

},{}],18:[function(require,module,exports){
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

},{}],19:[function(require,module,exports){
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

},{}],20:[function(require,module,exports){
/**
 * Factory method to generate a new region instance from a DOM element
 * Implements `template`, `count`, and `data-*` HTML attributes.
 *
 * @param {Object} options
 * @returns region instance
 */

var Utils = require('../utils/utils');

module.exports = function fromElement(el, parent) {

	// If parent is not specified, make-believe.
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

},{"../utils/utils":27}],21:[function(require,module,exports){
/**
 * Regions
 */

var insert = require('./insert');
var remove = require('./remove');
var empty = require('./empty');
var append = require('./append');
var attach = require('./attach');
var fromElement = require('./fromElement');

Region = module.exports = function region(properties) {

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

Region.fromElement = function(el, parent) {
	return fromElement(el, parent);
};
Region.prototype.remove = function(atIndex) {
	return remove.call(this, atIndex);
};
Region.prototype.empty = function() {
	return empty.call(this);
};
Region.prototype.insert = function(atIndex, componentId, properties) {
	return insert.call(this, atIndex, componentId, properties);
};
Region.prototype.append = function(componentId, properties) {
	return append.call(this, componentId, properties);
};
Region.prototype.attach = function(component, properties) {
	return attach.call(this, component, properties);
};

},{"./append":17,"./attach":18,"./empty":19,"./fromElement":20,"./insert":22,"./remove":23}],22:[function(require,module,exports){
/**
 * region.insert( atIndex, componentId, [properties] )
 *
 * TODO: support a list of properties objects in lieu of the properties object
 */

module.exports = function insert(atIndex, componentId, properties) {

	var err = '';
	if (!(atIndex || _.isFinite(atIndex))) {
		err += this.id + '.insert() :: No atIndex specified!';
	}
	else if (!componentId) {
		err += this.id + '.insert() :: No componentId specified!';
	}
	if (err) {
		throw new Error(err + '\nUsage: append(atIndex, componentId, [properties])');
	}

	var component;
	// If componentId is a string, look up component prototype and instatiate
	if ('string' == typeof componentId) {

		var componentPrototype = FRAMEWORK.components[componentId];

		if (!componentPrototype) {
			var template = FRAMEWORK.templates[componentId];
			if (!template) {
				throw new Error ('In ' +
					(this.id || 'Anonymous region') + ':: Trying to attach ' +
					componentId + ', but no component or template exists with that id.');
			}

			// If no component prototype with this id exists,
			// create an anonymous one to use
			componentPrototype = FRAMEWORK.Component.extend({
				id: componentId,
				template: template
			});
		}

		// Instantiate and render the component inside this region
		component = new componentPrototype(_.extend({
			$outlet: this.$el
		}, properties || {}));


	}

	// Otherwise assume an instantiated component object was sent
	/* TODO: Check that component object is valid */
	else {
		component = componentId;
		component.$outlet = this.$el;
	}

	component.render(atIndex);

	// And keep track of it in the list of this region's children
	this._children.splice(atIndex, 0, component);

	// Log for debugging `count` declarative
	var debugStr = this.parent.id + ' :: Inserted ' + componentId + ' into ';
	if (this.id) debugStr += 'region: ' + this.id + ' at index ' + atIndex;
	else debugStr += 'anonymous region at index ' + atIndex;
	FRAMEWORK.verbose(debugStr);

	return component;

};

},{}],23:[function(require,module,exports){
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

},{}],24:[function(require,module,exports){
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

},{"./events":25}],25:[function(require,module,exports){
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

},{"./utils":27}],26:[function(require,module,exports){
/**
 * Translate **right-hand-side abbreviations** into functions that perform
 * the proper behaviors, e.g.
 *		#about_me
 *		%mainMenu:open
 */

module.exports = function translateShorthand(value, key) {

	var matches, fn;

	// If this is an important, FRAMEWORK-specific data key,
	// and a function was specified, run it to get its value
	// (this is to keep parity with Backbone's similar functionality)
	if (_.isFunction(value) && (key === 'collection' || key === 'model')) {
		return value();
	}

	// Ignore other non-strings
	if (!_.isString(value)) {
		return value;
	}

	// Redirects user to client-side URL, w/o affecting browser history
	// Like calling `Backbone.history.navigate('/foo', { replace: true })`
	if ((matches = value.match(/^##(.*[^.\s])/)) && matches[1]) {
		fn = function redirectAndCoverTracks() {
			var url = matches[1];
			FRAMEWORK.history.navigate(url, {
				trigger: true,
				replace: true
			});
		};
	}
	// Method to redirect user to a client-side URL, then call the handler
	else if ((matches = value.match(/^#(.*[^.\s]+)/)) && matches[1]) {
		fn = function changeUrlFragment() {
			var url = matches[1];
			FRAMEWORK.history.navigate(url, {
				trigger: true
			});
		};
	}
	// Method to trigger global event
	else if ((matches = value.match(/^(%.*[^.\s])/)) && matches[1]) {
		fn = function triggerEvent() {
			var trigger = matches[1];
			FRAMEWORK.verbose(this.id + ' :: Triggering event (' + trigger + ')...');
			FRAMEWORK.trigger(trigger);
		};
	}
	// Method to fire a test alert
	// (use message, if specified)
	else if ((matches = value.match(/^!!!\s*(.*[^.\s])?/))) {
		fn = function bangAlert(e) {

			// If specified, message is used, otherwise 'Alert triggered!'
			var msg = (matches && matches[1]) || 'Debug alert (!!!) triggered!';

			// Other diagnostic information
			msg += '\n\nDiagnostics\n========================\n';
			if (e && e.currentTarget) {
				msg += 'e.currentTarget :: ' + e.currentTarget;
			}
			if (this.id) {
				msg += 'this.id :: ' + this.id;
			}

			alert(msg);
		};
	}

	// Method to log a message to the console
	// (use message, if specified)
	else if ((matches = value.match(/^>>>\s*(.*[^.\s])?/))) {
		fn = function logMessage(e) {

			// If specified, message is used, otherwise use default
			var msg = (matches && matches[1]) || 'Log message (>>>) triggered!';
			FRAMEWORK.log(msg);
		};
	}

	// Method to attach the specified component/template to a region
	else if ((matches = value.match(/^(.+)@(.*[^.\s])/)) && matches[1] && matches[2]) {
		fn = function attachTemplate() {
			FRAMEWORK.verbose(this.id + ' :: Attaching `' + matches[2] + '` to `' + matches[1] + '`...');

			var region = matches[1];
			var template = matches[2];
			this[region].attach(template);
		};
	}


	// Method to add the specified class
	else if ((matches = value.match(/^\+\s*\.(.*[^.\s])/)) && matches[1]) {
		fn = function addClass() {
			FRAMEWORK.verbose(this.id + ' :: Adding class (' + matches[1] + ')...');
			this.$el.addClass(matches[1]);
		};
	}
	// Method to remove the specified class
	else if ((matches = value.match(/^\-\s*\.(.*[^.\s])/)) && matches[1]) {
		fn = function removeClass() {
			FRAMEWORK.verbose(this.id + ' :: Removing class (' + matches[1] + ')...');
			this.$el.removeClass(matches[1]);
		};
	}
	// Method to toggle the specified class
	else if ((matches = value.match(/^\!\s*\.(.*[^.\s])/)) && matches[1]) {
		fn = function toggleClass() {
			FRAMEWORK.verbose(this.id + ' :: Toggling class (' + matches[1] + ')...');
			this.$el.toggleClass(matches[1]);
		};
	}

	// TODO:	allow descendants to be controlled via shorthand
	//			e.g. : 'li.row -.highlighted'
	//			would remove the `highlighted` class from this.$('li.row')


	// If short-hand matched, return the dereferenced function
	if (fn) {

		FRAMEWORK.verbose('Interpreting meaning from shorthand :: `' + value + '`...');

		// Curry the result function with any suffix matches
		var curriedFn = fn;

		// Trailing `.` indicates an e.stopPropagation()
		if (value.match(/\.\s*$/)) {
			curriedFn = function andStopPropagation(e) {

				// Bind (so it inherits component context) and call interior function
				fn.apply(this);

				// then immediately stop event bubbling/propagation
				if (e && e.stopPropagation) {
					e.stopPropagation();
				} else {
					FRAMEWORK.warn(
						this.id + ' :: Trailing `.` shorthand was used to invoke an ' +
						'e.stopPropagation(), but "' + value + '" was not triggered by a DOM event!\n' +
						'Probably best to double-check this was what you meant to do.');
				}
			};
		}


		return curriedFn;
	}


	// Otherwise, if no short-hand matched, pass the original value
	// straight through
	return value;
};

},{}],27:[function(require,module,exports){
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
	 * Map an object's values, and return a valid object (this function is handy because
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

},{"./DOM":24}]},{},[1])
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9idWlsZC5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL2NvbXBvbmVudC9iaW5kRXZlbnRzLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvY29tcG9uZW50L2Nsb3NlLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvY29tcG9uZW50L2hlbHBlcnMuanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9jb21wb25lbnQvaW5kZXguanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9jb21wb25lbnQvbGlmZWN5Y2xlRXZlbnRzLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvY29tcG9uZW50L2xpZmVjeWNsZUhvb2tzLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvY29tcG9uZW50L3JlbmRlci5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL2RlZmluZS9idWlsZERlZmluaXRpb24uanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9kZWZpbmUvaW5kZXguanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9sb2dnZXIvaW5kZXguanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9sb2dnZXIvc2V0dXAuanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9yYWlzZS9idWlsZFByb3RvdHlwZS5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL3JhaXNlL2NvbGxlY3RSZWdpb25zLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvcmFpc2UvY29sbGVjdFRlbXBsYXRlcy5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL3JhaXNlL2luZGV4LmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvcmVnaW9uL2FwcGVuZC5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL3JlZ2lvbi9hdHRhY2guanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9yZWdpb24vZW1wdHkuanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9yZWdpb24vZnJvbUVsZW1lbnQuanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9yZWdpb24vaW5kZXguanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9yZWdpb24vaW5zZXJ0LmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvcmVnaW9uL3JlbW92ZS5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL3V0aWxzL0RPTS5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL3V0aWxzL2V2ZW50cy5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL3V0aWxzL3Nob3J0aGFuZC5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL3V0aWxzL3V0aWxzLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0dBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNaQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIE1hc3QgYnVpbGQgZmlsZS4gVGhlIG1haW4gZmlsZVxuICovXG5cbnZhciBkZWZpbmUgPSByZXF1aXJlKCcuL2RlZmluZS9pbmRleCcpO1xudmFyIFJlZ2lvbiA9IHJlcXVpcmUoJy4vcmVnaW9uL2luZGV4Jyk7XG52YXIgQ29tcG9uZW50ID0gcmVxdWlyZSgnLi9jb21wb25lbnQvaW5kZXgnKTtcbnZhciByYWlzZSA9IHJlcXVpcmUoJy4vcmFpc2UvaW5kZXgnKTtcblxuKGZ1bmN0aW9uKGdsb2JhbCwgdW5kZWZpbmVkKSB7XG5cblx0Z2xvYmFsLkZSQU1FV09SSyA9IEJhY2tib25lO1xuXG5cdC8vIFN0YXJ0IHcvIGVtcHR5IHRlbXBsYXRlcywgY29tcG9uZW50cywgYW5kIGRhdGFcblx0RlJBTUVXT1JLLnRlbXBsYXRlcyA9IHt9O1xuXHRGUkFNRVdPUksuY29tcG9uZW50cyA9IHt9O1xuXHRGUkFNRVdPUksuZGF0YSA9IHt9O1xuXHRGUkFNRVdPUksuX2RlZmluZVF1ZXVlID0gW107XG5cblx0Ly8gUmVnaW9uIGNhY2hlXG5cdEZSQU1FV09SSy5yZWdpb25zID0ge307XG5cblx0Ly8gU2hvcnRjdXQgZGVmYXVsdHNcblx0RlJBTUVXT1JLLnNob3J0Y3V0ID0ge307XG5cdEZSQU1FV09SSy5zaG9ydGN1dC50ZW1wbGF0ZSA9IHRydWU7XG5cdEZSQU1FV09SSy5zaG9ydGN1dC5jb3VudCA9IHRydWU7XG5cblxuXHRGUkFNRVdPUksuUmVnaW9uID0gUmVnaW9uO1xuXHRGUkFNRVdPUksuQ29tcG9uZW50ID0gQ29tcG9uZW50O1xuXG5cdEZSQU1FV09SSy5kZWZpbmUgPSBkZWZpbmU7XG5cdEZSQU1FV09SSy5yYWlzZSA9IHJhaXNlO1xuXG59KSh3aW5kb3cpO1xuIiwiLyoqXG4gKiBCaW5kIGNvbGxlY3Rpb24gZXZlbnRzIHRvIGxpZmVjeWNsZSBldmVudCBoYW5kbGVyc1xuICovXG5leHBvcnRzLmNvbGxlY3Rpb25FdmVudHMgPSBmdW5jdGlvbigpIHtcblx0Ly8gQmluZCB0byBjb2xsZWN0aW9uIGV2ZW50cyBpZiBvbmUgd2FzIHBhc3NlZCBpblxuXHRpZiAodGhpcy5jb2xsZWN0aW9uKSB7XG5cblx0XHQvLyBMaXN0ZW4gdG8gZXZlbnRzXG5cdFx0dGhpcy5saXN0ZW5Ubyh0aGlzLmNvbGxlY3Rpb24sICdhZGQnLCB0aGlzLmFmdGVyQWRkKTtcblx0XHR0aGlzLmxpc3RlblRvKHRoaXMuY29sbGVjdGlvbiwgJ3JlbW92ZScsIHRoaXMuYWZ0ZXJSZW1vdmUpO1xuXHRcdHRoaXMubGlzdGVuVG8odGhpcy5jb2xsZWN0aW9uLCAncmVzZXQnLCB0aGlzLmFmdGVyUmVzZXQpO1xuXHR9XG59O1xuXG4vKipcbiAqIEJpbmQgbW9kZWwgZXZlbnRzIHRvIGxpZmVjeWNsZSBldmVudCBoYW5kbGVycyBhbmQgYWxzbyBhbGxvd3MgZm9yIGhhbmRsZXJzIHRvIGZpcmVcbiAqIG9uIGNlcnRhaW4gbW9kZWwgYXR0cmlidXRlIGNoYW5nZXMuXG4gKi9cbmV4cG9ydHMubW9kZWxFdmVudHMgPSBmdW5jdGlvbigpIHtcblx0aWYgKHRoaXMubW9kZWwpIHtcblxuXHRcdC8vIExpc3RlbiBmb3IgYW55IGF0dHJpYnV0ZSBjaGFuZ2VzXG5cdFx0Ly8gZS5nLlxuXHRcdC8vIC5hZnRlckNoYW5nZShtb2RlbCwgb3B0aW9ucylcblx0XHQvL1xuXHRcdHRoaXMubGlzdGVuVG8odGhpcy5tb2RlbCwgJ2NoYW5nZScsIGZ1bmN0aW9uIG1vZGVsQ2hhbmdlZCAobW9kZWwsIG9wdGlvbnMpIHtcblx0XHRcdGlmIChfLmlzRnVuY3Rpb24odGhpcy5hZnRlckNoYW5nZSkpIHtcblx0XHRcdFx0dGhpcy5hZnRlckNoYW5nZShtb2RlbCwgb3B0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyBMaXN0ZW4gZm9yIHNwZWNpZmljIGF0dHJpYnV0ZSBjaGFuZ2VzXG5cdFx0Ly8gZS5nLlxuXHRcdC8vIC5hZnRlckNoYW5nZS5jb2xvcihtb2RlbCwgdmFsdWUsIG9wdGlvbnMpXG5cdFx0Ly9cblx0XHRpZiAoXy5pc09iamVjdCh0aGlzLmFmdGVyQ2hhbmdlKSkge1xuXHRcdFx0Xy5lYWNoKHRoaXMuYWZ0ZXJDaGFuZ2UsIGZ1bmN0aW9uIChoYW5kbGVyLCBhdHRyTmFtZSkge1xuXG5cdFx0XHRcdC8vIENhbGwgaGFuZGxlciB3aXRoIG5ld1ZhbCB0byBrZWVwIGFyZ3VtZW50cyBzdHJhaWdodGZvcndhcmRcblx0XHRcdFx0dGhpcy5saXN0ZW5Ubyh0aGlzLm1vZGVsLCAnY2hhbmdlOicgKyBhdHRyTmFtZSwgZnVuY3Rpb24gYXR0ckNoYW5nZWQgKG1vZGVsLCBuZXdWYWwpIHtcblx0XHRcdFx0XHRoYW5kbGVyLmNhbGwoc2VsZiwgbmV3VmFsKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdH0sIHRoaXMpO1xuXHRcdH1cblx0fVxufTtcblxuLyoqXG4gKiBMaXN0ZW5zIGZvciBhbmQgcnVucyBoYW5kbGVycyBvbiBnbG9iYWwgZXZlbnRzIHRoYXQgYXJlIGxpc3RlbmVkIGZvciBvbiBhIGNvbXBvbmVudC5cbiAqL1xuZXhwb3J0cy5nbG9iYWxUcmlnZ2VycyA9IGZ1bmN0aW9uKCkge1xuXG5cdHRoaXMubGlzdGVuVG8oRlJBTUVXT1JLLCAnYWxsJywgZnVuY3Rpb24gKGVSb3V0ZSkge1xuXG5cdFx0Ly8gVHJpbSBvZmYgYWxsIGJ1dCB0aGUgZmlyc3QgYXJndW1lbnQgdG8gcGFzcyB0aHJvdWdoIHRvIGhhbmRsZXJcblx0XHR2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG5cdFx0YXJncy5zaGlmdCgpO1xuXG5cdFx0Ly8gSXRlcmF0ZSB0aHJvdWdoIGVhY2ggc3Vic2NyaXB0aW9uIG9uIHRoaXMgY29tcG9uZW50XG5cdFx0Ly8gYW5kIGxpc3RlbiBmb3IgdGhlIHNwZWNpZmllZCBnbG9iYWwgZXZlbnRzXG5cdFx0Xy5lYWNoKHRoaXMuc3Vic2NyaXB0aW9ucywgZnVuY3Rpb24oaGFuZGxlciwgbWF0Y2hQYXR0ZXJuKSB7XG5cblx0XHRcdC8vIEdyYWIgcmVnZXggYW5kIHBhcmFtIHBhcnNpbmcgbG9naWMgZnJvbSBCYWNrYm9uZSBjb3JlXG5cdFx0XHR2YXIgZXh0cmFjdFBhcmFtcyA9IEJhY2tib25lLlJvdXRlci5wcm90b3R5cGUuX2V4dHJhY3RQYXJhbWV0ZXJzLFxuXHRcdFx0XHRjYWxjdWxhdGVSZWdleCA9IEJhY2tib25lLlJvdXRlci5wcm90b3R5cGUuX3JvdXRlVG9SZWdFeHA7XG5cblx0XHRcdC8vIFRyaW0gdHJhaWxpbmdcblx0XHRcdG1hdGNoUGF0dGVybiA9IG1hdGNoUGF0dGVybi5yZXBsYWNlKC9cXC8qJC9nLCAnJyk7XG5cdFx0XHQvLyBhbmQgZXIgc29ydCBvZi4uIGxlYWRpbmcuLiBzbGFzaGVzXG5cdFx0XHRtYXRjaFBhdHRlcm4gPSBtYXRjaFBhdHRlcm4ucmVwbGFjZSgvXihbI34lXSlcXC8qL2csICckMScpO1xuXHRcdFx0Ly8gVE9ETzogb3B0aW1pemF0aW9uLSB0aGlzIHJlYWxseSBvbmx5IGhhcyB0byBiZSBkb25lIG9uY2UsIG9uIHJhaXNlKCksIHdlIHNob3VsZCBkbyB0aGF0XG5cblxuXHRcdFx0Ly8gQ29tZSB1cCB3aXRoIHJlZ2V4IGZvciB0aGlzIG1hdGNoUGF0dGVyblxuXHRcdFx0dmFyIHJlZ2V4ID0gY2FsY3VsYXRlUmVnZXgobWF0Y2hQYXR0ZXJuKTtcblxuXHRcdFx0Ly8gSWYgdGhpcyBtYXRjaFBhdGVybiBpcyB0aGlzIGlzIG5vdCBhIG1hdGNoIGZvciB0aGUgZXZlbnQsXG5cdFx0XHQvLyBgY29udGludWVgIGl0IGFsb25nIHRvIGl0IGNhbiB0cnkgdGhlIG5leHQgbWF0Y2hQYXR0ZXJuXG5cdFx0XHRpZiAoIWVSb3V0ZS5tYXRjaChyZWdleCkpIHJldHVybjtcblxuXHRcdFx0Ly8gUGFyc2UgcGFyYW1ldGVycyBmb3IgdXNlIGFzIGFyZ3MgdG8gdGhlIGhhbmRsZXJcblx0XHRcdC8vIChvciBhbiBlbXB0eSBsaXN0IGlmIG5vbmUgZXhpc3QpXG5cdFx0XHR2YXIgcGFyYW1zID0gZXh0cmFjdFBhcmFtcyhyZWdleCwgZVJvdXRlKTtcblxuXHRcdFx0Ly8gSGFuZGxlIHN0cmluZyByZWRpcmVjdHMgdG8gZnVuY3Rpb24gbmFtZXNcblx0XHRcdGlmICghXy5pc0Z1bmN0aW9uKGhhbmRsZXIpKSB7XG5cdFx0XHRcdGhhbmRsZXIgPSBzZWxmW2hhbmRsZXJdO1xuXG5cdFx0XHRcdGlmICghaGFuZGxlcikge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IHRyaWdnZXIgc3Vic2NyaXB0aW9uIGJlY2F1c2Ugb2YgdW5rbm93biBoYW5kbGVyOiAnICsgaGFuZGxlcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gQmluZCBjb250ZXh0IGFuZCBhcmd1bWVudHMgdG8gc3Vic2NyaXB0aW9uIGhhbmRsZXJcblx0XHRcdGhhbmRsZXIuYXBwbHkodGhpcywgXy51bmlvbihhcmdzLCBwYXJhbXMpKTtcblxuXHRcdH0pO1xuXHR9KTtcbn07XG4iLCIvKipcbiAqIFNhZmVseSB6YXAgZXZlcnkgdHJhY2UgYWJvdXQgdGhpcyBjb21wb25lbnQgZnJvbSBtZW1vcnkuXG4gKi9cblxudmFyIGhlbHBlcnMgPSByZXF1aXJlKCcuL2hlbHBlcnMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjbG9zZSgpIHtcblxuXHRGUkFNRVdPUksuZGVidWcoJ0Nsb3NlZCAnICsgdGhpcy5pZCArICcgY29tcG9uZW50LicpO1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0Ly8gQ2FuY2VsIGN1cnJlbnQgcmVuZGVyIGFuZCBjbG9zZSBqb2JzLCBpZiB0aGV5J3JlIHJ1bm5pbmdcblx0aWYgKHRoaXMuX3JlbmRlcmluZykge1xuXHRcdHRoaXMuY2FuY2VsUmVuZGVyKCk7XG5cdFx0c2VsZi5fcmVuZGVyaW5nID0gZmFsc2U7XG5cdH1cblx0aWYgKHRoaXMuX2Nsb3NpbmcpIHtcblx0XHR0aGlzLmNhbmNlbENsb3NlKCk7XG5cdFx0c2VsZi5fY2xvc2luZyA9IGZhbHNlO1xuXHR9XG5cblx0Ly8gTG9jayBhY2Nlc3MgdG8gY2xvc2UoKVxuXHR0aGlzLl9jbG9zaW5nID0gdHJ1ZTtcblxuXHR0aGlzLmJlZm9yZUNsb3NlKGZ1bmN0aW9uICgpIHtcblxuXHRcdC8vID4gTk9URTogYHRoaXMuX2Nsb3Npbmc9ZmFsc2VgIGNhbiBhbmQgcHJvYmFibHkgc2hvdWxkIGJlIHJlbW92ZWQsXG5cdFx0Ly8gPiBzaW5jZSBtdXRleCBpcyB1bm5lY2Vzc2FyeSBub3cgdGhhdCB0aGUgY29tcG9uZW50IGlzIHVwIGZvciBnYXJiYWdlIGNvbGxlY3Rpb25cblx0XHQvLyA+IFdhaXRpbmcgdG8gZG8gdGhpcyB1bnRpbCBpdCBjYW4gYmUgdGVzdGVkIGZ1cnRoZXJcblxuXHRcdC8vIFVubG9jayBjbG9zZSgpXG5cdFx0c2VsZi5fY2xvc2luZyA9IGZhbHNlO1xuXG5cdFx0Ly8gU3RvcCBsaXN0ZW5pbmcgdG8gYWxsIGdsb2JhbCB0cmlnZ2VycyAoJXwjKVxuXG5cdFx0Ly8gQ2xvc2UgYWxsIGNoaWxkIGNvbXBvbmVudHNcblxuXHRcdGhlbHBlcnMuZW1wdHlBbGxSZWdpb25zLmNhbGwoc2VsZik7XG5cblx0XHQvLyBDYWxsIG5hdGl2ZSBgQmFja2JvbmUuVmlldy5wcm90b3R5cGUucmVtb3ZlKClgXG5cdFx0Ly8gdG8gdW5kZWxlZ2F0ZSBldmVudHMsIGV0Yy5cblx0XHRzZWxmLnJlbW92ZSgpO1xuXG5cdH0pO1xufTtcbiIsIi8qKlxuICogSGVscGVyIGZ1bmN0aW9ucyB1c2VkIGJ5IGNvbXBvbmVudHMvXG4gKi9cblxudmFyIGhlbHBlcnMgPSBtb2R1bGUuZXhwb3J0cyA9IHtcblxuXHQvKipcbiAqIElmIGFueSByZWdpb25zIGV4aXN0IGluIHRoaXMgY29tcG9uZW50LFxuICogZW1wdHkgdGhlbSwgYW5kIHRoZW4gZGVsZXRlIHRoZW1cbiAqL1xuXHRlbXB0eUFsbFJlZ2lvbnM6IGZ1bmN0aW9uKCkge1xuXHRcdF8uZWFjaCh0aGlzLnJlZ2lvbnMsIGZ1bmN0aW9uIChyZWdpb24sIGtleSkge1xuXHRcdFx0cmVnaW9uLmVtcHR5KCk7XG5cdFx0XHRkZWxldGUgdGhpcy5yZWdpb25zW2tleV07XG5cdFx0fSwgdGhpcyk7XG5cdH0sXG5cblx0LyoqXG5cdCAqIEluc3RhbnRpYXRlIHJlZ2lvbiBjb21wb25lbnRzIGFuZCBhcHBlbmQgYW55IGRlZmF1bHRcblx0ICogdGVtcGxhdGVzL2NvbXBvbmVudHMgdG8gdGhlIERPTVxuXHQgKi9cblx0cmVuZGVyUmVnaW9uczogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdFx0aGVscGVycy5lbXB0eUFsbFJlZ2lvbnMoKTtcblxuXHRcdC8vIERldGVjdCBjaGlsZCByZWdpb25zIGluIHRlbXBsYXRlXG5cdFx0dmFyICRyZWdpb25zID0gdGhpcy4kKCdyZWdpb24nKTtcblx0XHQkcmVnaW9ucy5lYWNoKGZ1bmN0aW9uIChpLCBlbCkge1xuXG5cdFx0XHQvLyBQcm92aWRlIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5IGZvclxuXHRcdFx0Ly8gYGRlZmF1bHRgLCBgY29udGVudHNgIGFuZCBgdGVtcGxhdGVgIG5vdGF0aW9uXG5cdFx0XHR2YXIgY29tcG9uZW50SWQgPSAkKGVsKS5hdHRyKCdkZWZhdWx0Jyk7XG5cdFx0XHRjb21wb25lbnRJZCA9IGNvbXBvbmVudElkIHx8ICQoZWwpLmF0dHIoJ2NvbnRlbnRzJyk7XG5cdFx0XHRjb21wb25lbnRJZCA9IGNvbXBvbmVudElkIHx8ICQoZWwpLmF0dHIoJ3RlbXBsYXRlJyk7XG5cdFx0XHQkKGVsKS5hdHRyKCdjb250ZW50cycsIGNvbXBvbmVudElkKTtcblxuXHRcdFx0Ly8gR2VuZXJhdGUgYSByZWdpb24gaW5zdGFuY2UgZnJvbSB0aGUgZWxlbWVudFxuXHRcdFx0Ly8gKG1vZGlmeWluZyB0aGUgRE9NIGFzIG5lY2Vzc2FyeSlcblx0XHRcdHZhciByZWdpb24gPSBGUkFNRVdPUksuUmVnaW9uLmZyb21FbGVtZW50KGVsLCBzZWxmKTtcblxuXHRcdFx0Ly8gS2VlcCB0cmFjayBvZiByZWdpb25zLCBzaW5jZSB3ZSBhcmUgdGhlIHBhcmVudCBjb21wb25lbnRcblx0XHRcdHNlbGYucmVnaW9uc1tyZWdpb24uaWRdID0gcmVnaW9uO1xuXG5cdFx0XHQvLyBBcyBsb25nIGFzIHRoZXJlIGFyZSBubyBjb2xsaXNpb25zLFxuXHRcdFx0Ly8gcHJvdmlkZSBhIGZyaWVuZGx5IHJlZmVyZW5jZSB0byB0aGUgcmVnaW9uIG9uIHRoZSB0b3AgbGV2ZWwgb2YgdGhlIGNvbGxlY3Rpb25cblx0XHRcdGlmICghc2VsZltyZWdpb24uaWRdKSB7XG5cdFx0XHRcdHNlbGZbcmVnaW9uLmlkXSA9IHJlZ2lvbjtcblx0XHRcdH1cblx0XHR9KTtcblx0fSxcblxuXHQvKipcblx0ICogQ29udmVydCB0ZW1wbGF0ZSBIVE1MIGFuZCBkYXRhIGludG8gYSBjb21waWxlZCAkdGVtcGxhdGVcblx0ICovXG5cdGNvbXBpbGVUZW1wbGF0ZTogZnVuY3Rpb24oKSB7XG5cblx0XHQvLyBDcmVhdGUgdGVtcGxhdGUgZGF0YSBjb250ZXh0IGJ5IHByb3ZpZGluZyBhY2Nlc3MgdG8gdGhlIGdsb2JhbCBEYXRhIG9iamVjdCxcblx0XHQvLyBBbHNvIGZvbGQgaW4gdGhlIG1vZGVsIGFzc29jaWF0ZWQgd2l0aCB0aGlzIGNvbXBvbmVudCwgaWYgdGhlcmUgaXMgb25lXG5cdFx0dmFyIHRlbXBsYXRlQ29udGV4dCA9IF8uZXh0ZW5kKHtcblxuXHRcdFx0Ly8gQWxsb3dzIHlvdSB0byBnZXQgYSBob2xkIG9mIGRhdGEsXG5cdFx0XHQvLyBidXQgdXNlIGEgZGVmYXVsdCB2YWx1ZSBpZiBpdCBkb2Vzbid0IGV4aXN0XG5cdFx0XHRnZXQ6IGZ1bmN0aW9uIChrZXksIGRlZmF1bHRWYWwpIHtcblx0XHRcdFx0dmFyIHZhbCA9IHRlbXBsYXRlQ29udGV4dFtrZXldO1xuXHRcdFx0XHRpZiAodHlwZW9mIHZhbCA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdFx0XHR2YWwgPSBkZWZhdWx0VmFsO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB2YWw7XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdC8vIEFsbCBGUkFNRVdPUksuZGF0YSBpcyBhdmFpbGFibGUgaW4gZXZlcnkgdGVtcGxhdGVcblx0XHRGUkFNRVdPUksuZGF0YSk7XG5cblx0XHQvLyBJZiBhIG1vZGVsIGlzIHByb3ZpZGVkIGZvciB0aGlzIGNvbXBvbmVudCwgbWFrZSBpdCBhdmFpbGFibGUgaW4gdGhpcyB0ZW1wbGF0ZVxuXHRcdGlmICh0aGlzLm1vZGVsKSB7XG5cdFx0XHRfLmV4dGVuZCh0ZW1wbGF0ZUNvbnRleHQsIHRoaXMubW9kZWwuYXR0cmlidXRlcyk7XG5cdFx0fVxuXG5cdFx0Ly8gVGVtcGxhdGUgdGhlIEhUTUwgd2l0aCB0aGUgZGF0YVxuXHRcdHZhciBodG1sO1xuXHRcdHRyeSB7XG5cdFx0XHQvLyBBY2NlcHQgcHJlY29tcGlsZWQgdGVtcGxhdGVzXG5cdFx0XHRpZiAoXy5pc0Z1bmN0aW9uKHRoaXMudGVtcGxhdGUpKSB7XG5cdFx0XHRcdGh0bWwgPSB0aGlzLnRlbXBsYXRlKHRlbXBsYXRlQ29udGV4dCk7XG5cdFx0XHR9XG5cdFx0XHQvLyBPciByYXcgc3RyaW5nc1xuXHRcdFx0ZWxzZSBodG1sID0gXy50ZW1wbGF0ZSh0aGlzLnRlbXBsYXRlLCB0ZW1wbGF0ZUNvbnRleHQpO1xuXHRcdH1cblx0XHRjYXRjaCAoZSkge1xuXHRcdFx0dmFyIHN0ciA9IGUsXG5cdFx0XHRcdHN0YWNrID0gJyc7XG5cblx0XHRcdGlmIChlIGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdFx0c3RyID0gIGUudG9TdHJpbmcoKTtcblx0XHRcdFx0c3RhY2sgPSBlLnN0YWNrO1xuXHRcdFx0fVxuXG5cdFx0XHRGUkFNRVdPUksuZXJyb3IodGhpcy5pZCArICcgOjogcmVuZGVyKCkgZXJyb3IgaW4gdGVtcGxhdGUgOlxcbicgKyBzdHIgKyAnXFxuVGVtcGxhdGUgOjogJyArIGh0bWwgKyAnXFxuJyArIHN0YWNrKTtcblx0XHRcdGh0bWwgPSB0aGlzLnRlbXBsYXRlO1xuXHRcdH1cblxuXHRcdHJldHVybiBodG1sO1xuXHR9XG5cbn07XG4iLCIvKipcbiAqIENvbXBvbmVudCBpcyBhbiBleHRlbmRlZCBgQmFja2JvbmUuVmlld2AuIEl0IGFkZCBmZWF0dXJlcyBzdWNrIGFzIGF1dG9tYXRpYyBldmVudCBiaW5kaW5nLFxuICogcmVuZGVyaW5nLCBsaWZlY3ljbGUgaG9va3MgYW5kIGV2ZW50cywgYW5kIG1vcmUuXG4gKi9cblxudmFyIGxpZmVjeWNsZUhvb2tzICA9IHJlcXVpcmUoJy4vbGlmZWN5Y2xlSG9va3MnKTtcbnZhciBsaWZlY3ljbGVFdmVudHMgPSByZXF1aXJlKCcuL2xpZmVjeWNsZUV2ZW50cycpO1xudmFyIGJpbmRFdmVudHMgICAgICA9IHJlcXVpcmUoJy4vYmluZEV2ZW50cycpO1xudmFyIGNsb3NlICAgICAgICAgICA9IHJlcXVpcmUoJy4vY2xvc2UnKTtcbnZhciByZW5kZXIgICAgICAgICAgPSByZXF1aXJlKCcuL3JlbmRlcicpO1xudmFyIGJpbmRFdmVudHMgICAgICA9IHJlcXVpcmUgKCcuL2JpbmRFdmVudHMnKTtcblxuQ29tcG9uZW50ID0gbW9kdWxlLmV4cG9ydHMgPSBCYWNrYm9uZS5WaWV3LmV4dGVuZCgpO1xuXG5cbl8uZXh0ZW5kKENvbXBvbmVudC5wcm90b3R5cGUsIHtcblxuXHQvLyBMaWZlY3ljbGUgSG9va3Ncblx0YmVmb3JlUmVuZGVyOiBmdW5jdGlvbihjYikge1xuXHRcdGxpZmVjeWNsZUhvb2tzLmJlZm9yZVJlbmRlci5jYWxsKHRoaXMsIGNiKTtcblx0fSxcblx0YmVmb3JlQ2xvc2U6IGZ1bmN0aW9uKGNiKSB7XG5cdFx0bGlmZWN5Y2xlSG9va3MuYmVmb3JlQ2xvc2UuY2FsbCh0aGlzLCBjYik7XG5cdH0sXG5cdGFmdGVyUmVuZGVyOiBmdW5jdGlvbigpIHtcblx0XHRsaWZlY3ljbGVIb29rcy5hZnRlclJlbmRlci5jYWxsKHRoaXMpO1xuXHR9LFxuXHRjYW5jZWxSZW5kZXI6IGZ1bmN0aW9uKCkge1xuXHRcdGxpZmVjeWNsZUhvb2tzLmNhbmNlbFJlbmRlci5jYWxsKHRoaXMpO1xuXHR9LFxuXHRjYW5jZWxDbG9zZTogZnVuY3Rpb24oKSB7XG5cdFx0bGlmZWN5Y2xlSG9va3MuY2FuY2VsQ2xvc2UuY2FsbCh0aGlzKTtcblx0fSxcblxuXHQvLyBMaWZlY3ljbGUgRXZlbnRzXG5cdGFmdGVyQ2hhbmdlOiBmdW5jdGlvbihtb2RlbCwgb3B0aW9ucykge1xuXHRcdGxpZmVjeWNsZUV2ZW50cy5hZnRlckNoYW5nZS5jYWxsKHRoaXMsIG1vZGVsLCBvcHRpb25zKTtcblx0fSxcblx0YWZ0ZXJBZGQ6IGZ1bmN0aW9uKG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zKSB7XG5cdFx0bGlmZWN5Y2xlRXZlbnRzLmFmdGVyQWRkLmNhbGwodGhpcywgbW9kZWwsIGNvbGxlY3Rpb24sIG9wdGlvbnMpO1xuXHR9LFxuXHRhZnRlclJlbW92ZTogZnVuY3Rpb24obW9kZWwsIGNvbGxlY3Rpb24sIG9wdGlvbnMpIHtcblx0XHRsaWZlY3ljbGVFdmVudHMuYWZ0ZXJSZW1vdmUuY2FsbCh0aGlzLCBtb2RlbCwgY29sbGVjdGlvbiwgb3B0aW9ucyk7XG5cdH0sXG5cdGFmdGVyUmVzZXQ6IGZ1bmN0aW9uKGNvbGxlY3Rpb24sIG9wdGlvbnMpIHtcblx0XHRsaWZlY3ljbGVFdmVudHMuYWZ0ZXJSZXNldC5jYWxsKHRoaXMsIGNvbGxlY3Rpb24sIG9wdGlvbnMpO1xuXHR9LFxuXG5cdC8vIFByb3RvdHlwZSBtZXRob2RzLlxuXHRjbG9zZTogZnVuY3Rpb24oKSB7XG5cdFx0Y2xvc2UuY2FsbCh0aGlzKVxuXHR9LFxuXHRyZW5kZXI6IGZ1bmN0aW9uKGF0SW5kZXgpIHtcblx0XHRyZW5kZXIuY2FsbCh0aGlzLCBhdEluZGV4KTtcblx0fVxufSk7XG5cblxuXG5cbkNvbXBvbmVudC5wcm90b3R5cGUuaW5pdGlhbGl6ZSA9IGZ1bmN0aW9uKHByb3BlcnRpZXMpIHtcblxuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0Ly8gRXh0ZW5kIGluc3RhbmNlIHcvIHNwZWNpZmllZCBwcm9wZXJ0aWVzIGFuZCBtZXRob2RzXG5cdF8uZXh0ZW5kKHRoaXMsIHByb3BlcnRpZXMpO1xuXG5cdC8vIFN0YXJ0IHdpdGggZW1wdHkgcmVnaW9ucyBvYmplY3Rcblx0dGhpcy5yZWdpb25zID0ge307XG5cblx0Ly8gQmluZCB0aGUgZXZlbnRzIG9uIG1vZGVsL2NvbGxlY3Rpb25zIGFuZCBnbG9iYWwgdHJpZ2dlcmVkIGV2ZW50cy5cblx0YmluZEV2ZW50cy5jb2xsZWN0aW9uRXZlbnRzLmNhbGwodGhpcyk7XG5cdGJpbmRFdmVudHMubW9kZWxFdmVudHMuY2FsbCh0aGlzKTtcblx0YmluZEV2ZW50cy5nbG9iYWxUcmlnZ2Vycy5jYWxsKHRoaXMpO1xuXG5cdC8vIEVuY291cmFnZSBjaGlsZCBtZXRob2RzIHRvIHVzZSB0aGUgY29tcG9uZW50IGNvbnRleHRcblx0Xy5iaW5kQWxsKHRoaXMpO1xuXG5cdC8vIEJpbmQgY29udGV4dCB0byBldmVudCBoYW5kbGVyc1xuXHRfLmVhY2godGhpcy5ldmVudHMsIGZ1bmN0aW9uKGhhbmRsZXIsIGV2ZW50U3RyaW5nKSB7XG5cdFx0Xy5iaW5kKGhhbmRsZXIsIHRoaXMpO1xuXHR9LCB0aGlzKTtcbn07XG4iLCIvLyBGaXJlZCB3aGVuIHRoZSBib3VuZCBtb2RlbCBpcyB1cGRhdGVkIChgdGhpcy5tb2RlbGApXG5leHBvcnRzLmFmdGVyQ2hhbmdlID0gZnVuY3Rpb24gKG1vZGVsLCBvcHRpb25zKSB7fTtcblxuLy8gRmlyZWQgd2hlbiBhIG1vZGVsIGlzIGFkZGVkIHRvIHRoZSBib3VuZCBjb2xsZWN0aW9uIChgdGhpcy5jb2xsZWN0aW9uYClcbmV4cG9ydHMuYWZ0ZXJBZGQgPSBmdW5jdGlvbiAobW9kZWwsIGNvbGxlY3Rpb24sIG9wdGlvbnMpIHt9O1xuXG4vLyBGaXJlZCB3aGVuIGEgbW9kZWwgaXMgcmVtb3ZlZCBmcm9tIHRoZSBib3VuZCBjb2xsZWN0aW9uIChgdGhpcy5jb2xsZWN0aW9uYClcbmV4cG9ydHMuYWZ0ZXJSZW1vdmUgPSBmdW5jdGlvbiAobW9kZWwsIGNvbGxlY3Rpb24sIG9wdGlvbnMpIHt9O1xuXG4vLyBGaXJlZCB3aGVuIHRoZSBib3VuZCBjb2xsZWN0aW9uIGlzIHdpcGVkIChgdGhpcy5jb2xsZWN0aW9uYClcbmV4cG9ydHMuYWZ0ZXJSZXNldCA9IGZ1bmN0aW9uIChjb2xsZWN0aW9uLCBvcHRpb25zKSB7fTtcbiIsIi8vIEZpcmVkIGF1dG9tYXRpY2FsbHkgd2hlbiB0aGUgdmlldyBpcyBpbml0aWFsbHkgY3JlYXRlZFxuLy8gb25seSBmaXJlZCBhZnRlcndhcmRzIGlmIHRoaXMucmVuZGVyKCkgaXMgZXhwbGljaXRseSBjYWxsZWRcbi8vIENhbGxiYWNrIG11c3QgYmUgZmlyZWQhIVxuZXhwb3J0cy5iZWZvcmVSZW5kZXIgPSBmdW5jdGlvbiAoY2IpIHtjYigpO307XG5cbi8vIEZpcmVkIGF1dG9tYXRpY2FsbHkgd2hlbiB0aGUgdmlldyBpcyBpbml0aWFsbHkgY3JlYXRlZFxuLy8gb25seSBmaXJlZCBhZnRlcndhcmRzIGlmIHRoaXMucmVuZGVyKCkgaXMgZXhwbGljaXRseSBjYWxsZWRcbmV4cG9ydHMuYWZ0ZXJSZW5kZXIgPSBmdW5jdGlvbiAoKSB7fTtcblxuLy8gRmlyZWQgYXV0b21hdGljYWxseSB3aGVuIHRoZSB2aWV3IGlzIGNsb3NlZFxuZXhwb3J0cy5iZWZvcmVDbG9zZSA9IGZ1bmN0aW9uIChjYikge2NiKCk7fTtcblxuLy8gRmlyZWQgYmVmb3JlIHJlcmVuZGVyaW5nIG9yIGNsb3NpbmcgYSB2aWV3IHRoYXQgaXMgYWxyZWFkeSB3YWl0aW5nIG9uIGEgbG9ja1xuZXhwb3J0cy5jYW5jZWxSZW5kZXIgPSBmdW5jdGlvbiAoKSB7XG5cdEZSQU1FV09SSy53YXJuKCdjYW5jZWxSZW5kZXIoKSBzaG91bGQgYmUgZGVmaW5lZCBpZiBiZWZvcmVDbG9zZShjYikgb3IgYmVmb3JlUmVuZGVyKGNiKScgK1xuXHRcdFx0XHRcdFx0XHRcdCAnYXJlIGJlaW5nIHVzZWQhJyk7XG59O1xuXG4vLyBGaXJlZCBiZWZvcmUgcmVyZW5kZXJpbmcgb3IgY2xvc2luZyBhIHZpZXcgdGhhdCBpcyBhbHJlYWR5IHdhaXRpbmcgb24gYSBsb2NrXG5leHBvcnRzLmNhbmNlbENsb3NlID0gZnVuY3Rpb24gKCkge1xuXHRGUkFNRVdPUksud2FybignY2FuY2VsQ2xvc2UoKSBzaG91bGQgYmUgZGVmaW5lZCBpZiBiZWZvcmVDbG9zZShjYikgb3IgYmVmb3JlUmVuZGVyKGNiKScgK1xuXHRcdFx0XHRcdFx0XHRcdCAnYXJlIGJlaW5nIHVzZWQhJyk7XG59O1xuIiwiLyoqXG4gKiBSdW4gSFRNTCB0ZW1wbGF0ZSB0aHJvdWdoIGVuZ2luZSBhbmQgYXBwZW5kIHJlc3VsdHMgdG8gb3V0bGV0LiBBbHNvIHJlcmVuZGVyIHJlZ2lvbnMuXG4gKiBJZiBhdEluZGV4IGlzIHNwZWNpZmllZCwgdGhlIGNvbXBvbmVudCBpcyByZW5kZXJlZCBhdCB0aGUgZ2l2ZW4gcG9zaXRpb24gd2l0aGluIGl0c1xuICogb3V0bGV0LiBPdGhlcndpc2UsIHRoZSBsYXN0IHBvc2l0aW9uIGlzIHVzZWQuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IGF0SW5kZXggW1RoZSBpbmRleCBpbiB3aGljaCB0byByZW5kZXIgdGhpcyBlbGVtZW50XVxuICovXG5cbnZhciBET00gPSByZXF1aXJlICgnLi4vdXRpbHMvRE9NJyksXG5cdFx0aGVscGVycyA9IHJlcXVpcmUoJy4vaGVscGVycycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHJlbmRlcihhdEluZGV4KSB7XG5cblx0RlJBTUVXT1JLLmRlYnVnKHRoaXMuaWQgKyAnIDotLS06IFJlbmRlcmluZyBjb21wb25lbnQuLi4nKTtcblxuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0Ly8gQ2FuY2VsIGN1cnJlbnQgcmVuZGVyIGFuZCBjbG9zZSBqb2JzLCBpZiB0aGV5J3JlIHJ1bm5pbmdcblx0aWYgKHRoaXMuX3JlbmRlcmluZykge1xuXHRcdEZSQU1FV09SSy5kZWJ1Zyh0aGlzLmlkICsgJyA6OiByZW5kZXIoKSBjYW5jZWxlZC4nKTtcblx0XHR0aGlzLmNhbmNlbFJlbmRlcigpO1xuXHRcdHNlbGYuX3JlbmRlcmluZyA9IGZhbHNlO1xuXHR9XG5cdGlmICh0aGlzLl9jbG9zaW5nKSB7XG5cdFx0RlJBTUVXT1JLLmRlYnVnKHRoaXMuaWQgKyAnIDo6IGNsb3NlKCkgY2FuY2VsZWQuJyk7XG5cdFx0dGhpcy5jYW5jZWxDbG9zZSgpO1xuXHRcdHNlbGYuX2Nsb3NpbmcgPSBmYWxzZTtcblx0fVxuXG5cdC8vIExvY2sgYWNjZXNzIHRvIHJlbmRlclxuXHR0aGlzLl9yZW5kZXJpbmcgPSB0cnVlO1xuXG5cdC8vIFRyaWdnZXIgYmVmb3JlUmVuZGVyIG1ldGhvZFxuXHR0aGlzLmJlZm9yZVJlbmRlcihmdW5jdGlvbiAoKSB7XG5cblxuXHRcdC8vIFVubG9jayByZW5kZXJpbmcgbXV0ZXhcblx0XHRzZWxmLl9yZW5kZXJpbmcgPSBmYWxzZTtcblxuXHRcdGlmICghc2VsZi4kb3V0bGV0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3Ioc2VsZi5pZCArICcgOjogVHJ5aW5nIHRvIHJlbmRlcigpLCBidXQgbm8gJG91dGxldCB3YXMgZGVmaW5lZCEnKTtcblx0XHR9XG5cblx0XHQvLyBSZWZyZXNoIGNvbXBpbGVkIHRlbXBsYXRlXG5cdFx0dmFyIGh0bWwgPSBoZWxwZXJzLmNvbXBpbGVUZW1wbGF0ZS5jYWxsKHNlbGYpO1xuXHRcdGlmICghaHRtbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKHRoaXMuaWQgKyAnIDo6IFVuYWJsZSB0byByZW5kZXIgY29tcG9uZW50IGJlY2F1c2UgdGVtcGxhdGUgY29tcGlsYXRpb24gZGlkIG5vdCByZXR1cm4gYW55IEhUTUwuJyk7XG5cdFx0fVxuXG5cdFx0Ly8gU3RyaXAgdHJhaWxpbmcgYW5kIGxlYWRpbmcgd2hpdGVzcGFjZSB0byBhdm9pZCBmYWxzZWx5IGRpYWdub3Npbmdcblx0XHQvLyBtdWx0aXBsZSBlbGVtZW50cywgd2hlbiBvbmx5IG9uZSBhY3R1YWxseSBleGlzdHNcblx0XHQvLyAodGhpcyBtaXNkaWFnbm9zaXMgd3JhcHMgdGhlIHRlbXBsYXRlIGluIGFuIGV4dHJhbmVvdXMgPGRpdj4pXG5cdFx0aHRtbCA9IGh0bWwucmVwbGFjZSgvXlxccyovLCAnJyk7XG5cdFx0aHRtbCA9IGh0bWwucmVwbGFjZSgvXFxzKiQvLCAnJyk7XG5cdFx0aHRtbCA9IGh0bWwucmVwbGFjZSgvKFxccnxcXG4pKi8sICcnKTtcblxuXHRcdC8vIFN0cmlwIEhUTUwgY29tbWVudHMsIHRoZW4gc3RyaXAgd2hpdGVzcGFjZSBhZ2FpblxuXHRcdC8vIChUT0RPOiBvcHRpbWl6ZSB0aGlzKVxuXHRcdGh0bWwgPSBodG1sLnJlcGxhY2UoLyg8IS0tListLT4pKi8sICcnKTtcblx0XHRodG1sID0gaHRtbC5yZXBsYWNlKC9eXFxzKi8sICcnKTtcblx0XHRodG1sID0gaHRtbC5yZXBsYWNlKC9cXHMqJC8sICcnKTtcblx0XHRodG1sID0gaHRtbC5yZXBsYWNlKC8oXFxyfFxcbikqLywgJycpO1xuXG5cdFx0Ly8gUGFyc2UgYSBET00gbm9kZSBvciBzZXJpZXMgb2YgRE9NIG5vZGVzIGZyb20gdGhlIG5ld2x5IHRlbXBsYXRlZCBIVE1MXG5cdFx0dmFyIHBhcnNlZE5vZGVzID0gJC5wYXJzZUhUTUwoaHRtbCk7XG5cdFx0dmFyIGVsID0gcGFyc2VkTm9kZXNbMF07XG5cblx0XHQvLyBJZiBubyBub2RlcyB3ZXJlIHBhcnNlZCwgdGhyb3cgYW4gZXJyb3Jcblx0XHRpZiAocGFyc2VkTm9kZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3Ioc2VsZi5pZCArICcgOjogcmVuZGVyKCkgcmFuIGludG8gYSBwcm9ibGVtIHJlbmRlcmluZyB0aGUgdGVtcGxhdGUgd2l0aCBIVE1MID0+IFxcbicraHRtbCk7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgdGhlcmUgaXMgbm90IG9uZSBzaW5nbGUgd3JhcHBlciBlbGVtZW50LFxuXHRcdC8vIG9yIGlmIHRoZSByZW5kZXJlZCB0ZW1wbGF0ZSBjb250YWlucyBvbmx5IGEgc2luZ2xlIHRleHQgbm9kZSxcblx0XHQvLyAob3IganVzdCBhIGxvbmUgcmVnaW9uKVxuXHRcdGVsc2UgaWYgKHBhcnNlZE5vZGVzLmxlbmd0aCA+IDEgfHwgcGFyc2VkTm9kZXNbMF0ubm9kZVR5cGUgPT09IDMgfHxcblx0XHRcdFx0XHRcdCAkKHBhcnNlZE5vZGVzWzBdKS5pcygncmVnaW9uJykpIHtcblxuXHRcdFx0RlJBTUVXT1JLLmxvZyhzZWxmLmlkICsgJyA6OiBXcmFwcGluZyB0ZW1wbGF0ZSBpbiA8ZGl2Lz4uLi4nLCBwYXJzZWROb2Rlcyk7XG5cblx0XHRcdC8vIHdyYXAgdGhlIGh0bWwgdXAgaW4gYSBjb250YWluZXIgPGRpdi8+XG5cdFx0XHRlbCA9ICQoJzxkaXYvPicpLmFwcGVuZChodG1sKTtcblx0XHRcdGVsID0gZWxbMF07XG5cdFx0fVxuXG5cdFx0Ly8gU2V0IEJhY2tib25lIGVsZW1lbnQgKGNhY2hlIGFuZCByZWRlbGVnYXRlIERPTSBldmVudHMpXG5cdFx0Ly8gKFdpbGwgYWxzbyB1cGRhdGUgc2VsZi4kZWwpXG5cdFx0c2VsZi5zZXRFbGVtZW50KGVsKTtcblx0XHQvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxuXG5cdFx0Ly8gRGV0ZWN0IGFuZCByZW5kZXIgYWxsIHJlZ2lvbnMgYW5kIHRoZWlyIGRlc2NlbmRlbnQgY29tcG9uZW50cyBhbmQgcmVnaW9uc1xuXHRcdGhlbHBlcnMucmVuZGVyUmVnaW9ucy5jYWxsKHNlbGYpO1xuXG5cdFx0Ly8gSW5zZXJ0IHRoZSBlbGVtZW50IGF0IHRoZSBwcm9wZXIgcGxhY2UgYW1vbmdzdCB0aGUgb3V0bGV0J3MgY2hpbGRyZW5cblx0XHR2YXIgbmVpZ2hib3JzID0gc2VsZi4kb3V0bGV0LmNoaWxkcmVuKCk7XG5cdFx0aWYgKF8uaXNGaW5pdGUoYXRJbmRleCkgJiYgbmVpZ2hib3JzLmxlbmd0aCA+IDAgJiYgbmVpZ2hib3JzLmxlbmd0aCA+IGF0SW5kZXgpIHtcblx0XHRcdG5laWdoYm9ycy5lcShhdEluZGV4KS5iZWZvcmUoc2VsZi4kZWwpO1xuXHRcdH1cblxuXHRcdC8vIEJ1dCBpZiB0aGUgb3V0bGV0IGlzIGVtcHR5LCBvciB0aGVyZSdzIG5vIGF0SW5kZXgsIGp1c3Qgc3RpY2sgaXQgb24gdGhlIGVuZFxuXHRcdGVsc2Ugc2VsZi4kb3V0bGV0LmFwcGVuZChzZWxmLiRlbCk7XG5cblx0XHQvLyBGaW5hbGx5LCB0cmlnZ2VyIGFmdGVyUmVuZGVyIG1ldGhvZFxuXHRcdHNlbGYuYWZ0ZXJSZW5kZXIoKTtcblxuXHRcdC8vIEFkZCBkYXRhIGF0dHJpYnV0ZXMgdG8gdGhpcyBjb21wb25lbnQncyAkZWwsIHByb3ZpZGluZyBhY2Nlc3Ncblx0XHQvLyB0byB3aGV0aGVyIHRoZSBlbGVtZW50IGhhcyB2YXJpb3VzIERPTSBiaW5kaW5ncyBmcm9tIHN0eWxlc2hlZXRzLlxuXHRcdC8vIChoYW5keSBmb3IgZGlzYWJsaW5nIHRleHQgc2VsZWN0aW9uIGFjY29yZGluZ2x5LCBldGMuKVxuXHRcdC8vXG5cdFx0Ly8gLT4gZGlzYWJsZSBmb3IgdGhpcyBjb21wb25lbnQgd2l0aCBgdGhpcy5hdHRyRmxhZ3MgPSBmYWxzZWBcblx0XHQvLyAtPiBvciBnbG9iYWxseSB3aXRoIGBGUkFNRVdPUksuYXR0ckZsYWdzID0gZmFsc2VgXG5cdFx0Ly9cblx0XHQvLyBUT0RPOiBtYWtlIGl0IHdvcmsgd2l0aCBkZWxlZ2F0ZWQgRE9NIGV2ZW50IGJpbmRpbmdzXG5cdFx0Ly9cblx0XHRpZiAoc2VsZi5hdHRyRmxhZ3MgIT09IGZhbHNlICYmIEZSQU1FV09SSy5hdHRyRmxhZ3MgIT09IGZhbHNlKSB7XG5cdFx0XHRET00uZmxhZ0JvdW5kRXZlbnRzKHNlbGYpO1xuXHRcdH1cblx0fSk7XG59XG4iLCIvKipcbiAqIFJ1biBkZWZpbml0aW9uIG1ldGhvZHMgdG8gZ2V0IGFjdHVhbCBjb21wb25lbnQgZGVmaW5pdGlvbnMuXG4gKiBUaGlzIGlzIGRlZmVycmVkIHRvIGF2b2lkIGhhdmluZyB0byB1c2UgQmFja2JvbmUncyBmdW5jdGlvbiAoKSB7fSBhcHByb2FjaCBmb3IgdGhpbmdzXG4gKiBsaWtlIGNvbGxlY3Rpb25zLlxuICovXG5cbi8qKlxuICogQnVpbGQgdXBzIGEgY29tcG9uZW50IGRlZmluaXRpb24gYnkgcnVubmluZyB0aGUgZGVmaW5pdGlvbi4gV2UgdGhlbiBsaW5rIHRoZVxuICogY29tcG9uZW50IGRlZmluaXRpb24gdG8gYW4gaWRlbnRpZmllciBpbiBgRlJBTUVXT1JLLmNvbXBvbmVudHNgLlxuICpcbiAqIEBwYXJhbSAge09iamVjdH0gY29tcG9uZW50IFtPYmplY3QgY29udGFpbmluZyB0aGUgZGVmaW5pdGlvbiBmdW5jdGlvbiBvZiB0aGUgY29tcG9uZW50XVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGJ1aWxkQ29tcG9uZW50RGVmaW5pdGlvbihjb21wb25lbnQpIHtcblx0dmFyIGNvbXBvbmVudERlZiA9IGNvbXBvbmVudC5kZWZpbml0aW9uKCk7XG5cblx0aWYgKGNvbXBvbmVudC5pZE92ZXJyaWRlKSB7XG5cdFx0aWYgKGNvbXBvbmVudERlZi5pZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGNvbXBvbmVudC5pZE92ZXJyaWRlICsgJzo6IENhbm5vdCBzcGVjaWZ5IGFuIGlkT3ZlcnJpZGUgaW4gLmRlZmluZSgpIGlmIGFuIGlkIHByb3BlcnR5ICgnK2NvbXBvbmVudERlZi5pZCsnKSBpcyBhbHJlYWR5IHNldCBpbiB5b3VyIGNvbXBvbmVudCBkZWZpbml0aW9uIVxcblVzYWdlOiAuZGVmaW5lKFtpZE92ZXJyaWRlXSwgZGVmaW5pdGlvbiknKTtcblx0XHR9XG5cdFx0Y29tcG9uZW50RGVmLmlkID0gY29tcG9uZW50LmlkT3ZlcnJpZGU7XG5cdH1cblx0aWYgKCFjb21wb25lbnREZWYuaWQpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCB1c2UgLmRlZmluZSgpIHdpdGhvdXQgZGVmaW5pbmcgYW4gaWQgcHJvcGVydHkgb3Igb3ZlcnJpZGUgaW4geW91ciBjb21wb25lbnQhXFxuVXNhZ2U6IC5kZWZpbmUoW2lkT3ZlcnJpZGVdLCBkZWZpbml0aW9uKScpO1xuXHR9XG5cdEZSQU1FV09SSy5jb21wb25lbnRzW2NvbXBvbmVudERlZi5pZF0gPSBjb21wb25lbnREZWY7XG59O1xuIiwiLyoqXG4gKiBPcHRpb25hbCBtZXRob2QgdG8gcmVxdWlyZSBhcHAgY29tcG9uZW50cy4gUmVxdWlyZS5qcyBjYW4gYmUgdXNlZCBpbnN0ZWFkXG4gKiBhcyBuZWVkZWQuXG4gKlxuICogQHBhcmFtICB7U3RyaW5nfSBcdFsob3B0aW9uYWwpIENvbXBvbmVudCBpZCBvdmVycmlkZV1cbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSBbRnVuY3Rpb24gRGVmaW5pdGlvbiBvZiBjb21wb25lbnRdXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZGVmaW5lKGlkLCBkZWZpbml0aW9uRm4pIHtcblx0Ly8gSWQgcGFyYW0gaXMgb3B0aW9uYWxcblx0aWYgKCFkZWZpbml0aW9uRm4pIHtcblx0XHRkZWZpbml0aW9uRm4gPSBpZDtcblx0XHRpZCA9IG51bGw7XG5cdH1cblxuXHRGUkFNRVdPUksuX2RlZmluZVF1ZXVlLnB1c2goe1xuXHRcdGRlZmluaXRpb246IGRlZmluaXRpb25Gbixcblx0XHRpZE92ZXJyaWRlOiBpZFxuXHR9KTtcbn07XG4iLCIvKipcbiAqXHRMb2dnZXQgY29uc3RydWN0b3IgbWV0aG9kIHRoYXQgd2lsbCBzZXR1cCBGUkFNRVdPUksgdG8gbG9nIG1lc3NhZ2VzLlxuICovXG5cbnZhciBzZXR1cExvZ2dlciA9IHJlcXVpcmUoJy4vc2V0dXAnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBMb2dnZXIoKSB7XG5cblx0Ly8gVXBvbiBpbml0aWFsaXphdGlvbiwgc2V0dXAgbG9nZ2VyXG5cdHNldHVwTG9nZ2VyKEZSQU1FV09SSy5sb2dMZXZlbCk7XG5cblx0Ly8gSW4gc3VwcG9ydGVkIGJyb3dzZXJzLCBhbHNvIHJ1biBzZXR1cExvZ2dlciBhZ2FpblxuXHQvLyB3aGVuIEZSQU1FV09SSy5sb2dMZXZlbCBpcyBzZXQgYnkgdGhlIHVzZXJcblx0aWYgKF8uaXNGdW5jdGlvbihGUkFNRVdPUksuX19kZWZpbmVTZXR0ZXJfXykpIHtcblx0XHRGUkFNRVdPUksuX19kZWZpbmVTZXR0ZXJfXygnbG9nTGV2ZWwnLCBmdW5jdGlvbiBvbkNoYW5nZSAobmV3TG9nTGV2ZWwpIHtcblx0XHRcdHNldHVwTG9nZ2VyKG5ld0xvZ0xldmVsKTtcblx0XHR9KTtcblx0fVxufTtcbiIsIi8qKlxuICogU2V0IHVwIHRoZSBsb2cgZnVuY3Rpb25zOlxuICpcbiAqIEZSQU1FV09SSy5lcnJvclxuICogRlJBTUVXT1JLLndhcm5cbiAqIEZSQU1FV09SSy5sb2dcbiAqIEZSQU1FV09SSy5kZWJ1ZyAoKmxlZ2FjeSlcbiAqIEZSQU1FV09SSy52ZXJib3NlXG4gKlxuICogQHBhcmFtICB7U3RyaW5nfSBsb2dMZXZlbCBbVGhlIGRlc2lyZWQgbG9nIGxldmVsIG9mIHRoZSBMb2dnZXJdXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gc2V0dXBMb2dnZXIgKGxvZ0xldmVsKSB7XG5cblx0dmFyIG5vb3AgPSBmdW5jdGlvbiAoKSB7fTtcblxuXHQvLyBJZiBsb2cgaXMgc3BlY2lmaWVkLCB1c2UgaXQsIG90aGVyd2lzZSB1c2UgdGhlIGNvbnNvbGVcblx0aWYgKEZSQU1FV09SSy5sb2dnZXIpIHtcblx0XHRGUkFNRVdPUksuZXJyb3IgICAgID0gRlJBTUVXT1JLLmxvZ2dlci5lcnJvcjtcblx0XHRGUkFNRVdPUksud2FybiAgICAgID0gRlJBTUVXT1JLLmxvZ2dlci53YXJuO1xuXHRcdEZSQU1FV09SSy5sb2cgICAgICAgPSBGUkFNRVdPUksubG9nZ2VyLmRlYnVnIHx8IEZSQU1FV09SSy5sb2dnZXI7XG5cdFx0RlJBTUVXT1JLLnZlcmJvc2UgICA9IEZSQU1FV09SSy5sb2dnZXIudmVyYm9zZTtcblx0fVxuXG5cdC8vIEluIElFLCB3ZSBjYW4ndCBkZWZhdWx0IHRvIHRoZSBicm93c2VyIGNvbnNvbGUgYmVjYXVzZSB0aGVyZSBJUyBOTyBCUk9XU0VSIENPTlNPTEVcblx0ZWxzZSBpZiAodHlwZW9mIGNvbnNvbGUgIT09ICd1bmRlZmluZWQnKSB7XG5cblx0XHQvLyBXZSBjYW5ub3QgY2FsbGVkIHRoZSAuYmluZCBtZXRob2Qgb24gdGhlIGNvbnNvbGUgbWV0aG9kcy4gV2UgYXJlIGluIGllIDkgb3IgOCwganVzdCBtYWtlXG5cdFx0Ly8gZXZlcnlodGluZyBhIG5vb3AuXG5cdFx0aWYgKF8uaXNVbmRlZmluZWQoY29uc29sZS5sb2cuYmluZCkpICB7XG5cdFx0XHRGUkFNRVdPUksuZXJyb3IgICAgID0gbm9vcDtcblx0XHRcdEZSQU1FV09SSy53YXJuICAgICAgPSBub29wO1xuXHRcdFx0RlJBTUVXT1JLLmxvZyAgICAgICA9IG5vb3A7XG5cdFx0XHRGUkFNRVdPUksuZGVidWcgICAgID0gbm9vcDtcblx0XHRcdEZSQU1FV09SSy52ZXJib3NlICAgPSBub29wO1xuXHRcdH1cblxuXHRcdC8vIFdlIGFyZSBpbiBhIGZyaWVuZGx5IGJyb3dzZXIgbGlrZSBDaHJvbWUsIEZpcmVmb3gsIG9yIElFMTBcblx0XHRlbHNlIHtcblx0XHRcdEZSQU1FV09SSy5lcnJvclx0XHQ9IGNvbnNvbGUuZXJyb3IgJiYgY29uc29sZS5lcnJvci5iaW5kKGNvbnNvbGUpO1xuXHRcdFx0RlJBTUVXT1JLLndhcm5cdFx0PSBjb25zb2xlLndhcm4gJiYgY29uc29sZS53YXJuLmJpbmQoY29uc29sZSk7XG5cdFx0XHRGUkFNRVdPUksubG9nXHRcdFx0PSBjb25zb2xlLmRlYnVnICYmIGNvbnNvbGUuZGVidWcuYmluZChjb25zb2xlKTtcblx0XHRcdEZSQU1FV09SSy52ZXJib3NlXHQ9IGNvbnNvbGUubG9nICYmIGNvbnNvbGUubG9nLmJpbmQoY29uc29sZSk7XG5cblx0XHRcdC8vIFVzZSBsb2cgbGV2ZWwgY29uZmlnIGlmIHByb3ZpZGVkXG5cdFx0XHRzd2l0Y2ggKGxvZ0xldmVsKSB7XG5cdFx0XHRcdGNhc2UgJ3ZlcmJvc2UnOiBicmVhaztcblxuXHRcdFx0XHRjYXNlICdkZWJ1Zyc6XG5cdFx0XHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UgPSBub29wO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgJ3dhcm4nOlxuXHRcdFx0XHRcdEZSQU1FV09SSy52ZXJib3NlID0gRlJBTUVXT1JLLmxvZyA9IG5vb3A7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSAnZXJyb3InOlxuXHRcdFx0XHRcdEZSQU1FV09SSy52ZXJib3NlID0gRlJBTUVXT1JLLmxvZyA9IEZSQU1FV09SSy53YXJuID0gbm9vcDtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlICdzaWxlbnQnOlxuXHRcdFx0XHRcdEZSQU1FV09SSy52ZXJib3NlID0gRlJBTUVXT1JLLmxvZyA9IEZSQU1FV09SSy53YXJuID0gRlJBTUVXT1JLLmVycm9yID0gbm9vcDtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvciAoJ1VucmVjb2duaXplZCBsb2dnaW5nIGxldmVsIGNvbmZpZyAnICtcblx0XHRcdFx0XHQnKCcgKyBGUkFNRVdPUksuaWQgKyAnLmxvZ0xldmVsID0gXCInICsgbG9nTGV2ZWwgKyAnXCIpJyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFN1cHBvcnQgZm9yIGBkZWJ1Z2AgZm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5XG5cdFx0XHRGUkFNRVdPUksuZGVidWcgPSBGUkFNRVdPUksubG9nO1xuXG5cdFx0XHQvLyBWZXJib3NlIHNwaXRzIG91dCBsb2cgbGV2ZWxcblx0XHRcdEZSQU1FV09SSy52ZXJib3NlKCdMb2cgbGV2ZWwgc2V0IHRvIDo6ICcsIGxvZ0xldmVsKTtcblx0XHR9XG5cdH1cbn1cbiIsIi8qKlxuICogR2l2ZW4gYSBjb21wb25lbnQgZGVmaW5pdGlvbiBhbmQgaXRzIGtleSwgd2Ugd2lsbCBidWlsZCB1cCB0aGUgY29tcG9uZW50IHByb3RvdHlwZSBhbmQgbWVyZ2VcbiAqIHRoaXMgY29tcG9uZW50IHdpdGggaXRzIG1hdGNoaW5nIHRlbXBsYXRlLlxuICpcbiAqIEBwYXJhbSAge09iamVjdH0gY29tcG9uZW50RGVmIFtPYmplY3QgY29udGFpbmluZyB0aGUgY29tcG9uZW50IGRlZmluaXRpb25dXG4gKiBAcGFyYW0gIHtTdHJpbmd9IGNvbXBvbmVudEtleSBbVGhlIGNvbXBvbmVudCBpZGVudGlmaWVyXVxuICovXG5cbnZhciB0cmFuc2xhdGVTaG9ydGhhbmQgPSByZXF1aXJlKCcuLi91dGlscy9zaG9ydGhhbmQnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBidWlsZENvbXBvbmVudFByb3RvdHlwZShjb21wb25lbnREZWYsIGNvbXBvbmVudEtleSkge1xuXG5cdC8vIElmIGNvbXBvbmVudCBpZCBpcyBub3QgZXhwbGljaXRseSBzZXQsIHVzZSB0aGUgY29tcG9uZW50S2V5XG5cdGlmICghY29tcG9uZW50RGVmLmlkKSB7XG5cdFx0Y29tcG9uZW50RGVmLmlkID0gY29tcG9uZW50S2V5O1xuXHR9XG5cblx0Ly8gU2VhcmNoIHRlbXBsYXRlc1xuXHR2YXIgdGVtcGxhdGUgPSBGUkFNRVdPUksudGVtcGxhdGVzW2NvbXBvbmVudERlZi5pZF07XG5cblx0Ly8gSWYgbm8gbWF0Y2ggZm9yIGNvbXBvbmVudCB3YXMgZm91bmTCoGluIHRlbXBsYXRlcywgaXNzdWUgYSB3YXJuaW5nXG5cdGlmICghdGVtcGxhdGUpIHtcblx0XHRyZXR1cm4gRlJBTUVXT1JLLndhcm4oXG5cdFx0XHRjb21wb25lbnREZWYuaWQgKyAnIDo6IE5vIHRlbXBsYXRlIGZvdW5kIGZvciBjb21wb25lbnQhJyArXG5cdFx0XHQnXFxuVGVtcGxhdGVzIGRvblxcJ3QgbmVlZCBhIGNvbXBvbmVudCB1bmxlc3MgeW91IHdhbnQgaW50ZXJhY3Rpdml0eSwgJyArXG5cdFx0XHQnZXZlcnkgY29tcG9uZW50ICpzaG91bGQqIGhhdmUgYSBtYXRjaGluZyB0ZW1wbGF0ZSEhJyArXG5cdFx0XHQnXFxuVXNpbmcgY29tcG9uZW50cyB3aXRob3V0IHRlbXBsYXRlcyBtYXkgc2VlbSBuZWNlc3NhcnksICcgK1xuXHRcdFx0J2J1dCBpdFxcJ3Mgbm90LiAgSXQgbWFrZXMgeW91ciB2aWV3IGxvZ2ljIGluY29ycG9yZWFsLCBhbmQgbWFrZXMgeW91ciBjb2xsZWFndWVzICcgK1xuXHRcdFx0J3VuY29tZm9ydGFibGUuJyk7XG5cdH1cblxuXHQvLyBTYXZlIHJlZmVyZW5jZSB0byB0ZW1wbGF0ZSBpbiBjb21wb25lbnQgcHJvdG90eXBlXG5cdEZSQU1FV09SSy52ZXJib3NlKGNvbXBvbmVudERlZi5pZCArICcgOjogUGFpcmluZyBjb21wb25lbnQgd2l0aCB0ZW1wbGF0ZS4uLicpO1xuXHRjb21wb25lbnREZWYudGVtcGxhdGUgPSB0ZW1wbGF0ZTtcblxuXHQvLyBUcmFuc2xhdGUgcmlnaHQtaGFuZCBzaG9ydGhhbmQgZm9yIHRvcC1sZXZlbCBrZXlzXG5cdGNvbXBvbmVudERlZiA9IFV0aWxzLm9iak1hcChjb21wb25lbnREZWYsIF8uYmluZCh0cmFuc2xhdGVTaG9ydGhhbmQsIGNvbXBvbmVudERlZikpO1xuXG5cdC8vIGFuZCBldmVudHMgb2JqZWN0XG5cdC8vIFRPRE86IHJlcXVpcmUgdXRpbHNcblx0aWYgKGNvbXBvbmVudERlZi5ldmVudHMpIHtcblx0XHRjb21wb25lbnREZWYuZXZlbnRzID0gVXRpbHMub2JqTWFwKFxuXHRcdFx0Y29tcG9uZW50RGVmLmV2ZW50cyxcblx0XHRcdHRyYW5zbGF0ZVNob3J0aGFuZFxuXHRcdCk7XG5cdH1cblxuXHQvLyBhbmQgYWZ0ZXJDaGFuZ2UgYmluZGluZ3Ncblx0Ly8gVE9ETzogcmVxdWlyZSB1dGlsc1xuXHRpZiAoXy5pc09iamVjdChjb21wb25lbnREZWYuYWZ0ZXJDaGFuZ2UpICYmICFfLmlzRnVuY3Rpb24oY29tcG9uZW50RGVmLmFmdGVyQ2hhbmdlKSkge1xuXHRcdGNvbXBvbmVudERlZi5hZnRlckNoYW5nZSA9IFV0aWxzLm9iak1hcChcblx0XHRcdGNvbXBvbmVudERlZi5hZnRlckNoYW5nZSxcblx0XHRcdHRyYW5zbGF0ZVNob3J0aGFuZFxuXHRcdCk7XG5cdH1cblxuXHQvLyBHbyBhaGVhZCBhbmQgdHVybiB0aGUgZGVmaW5pdGlvbiBpbnRvIGEgcmVhbCBjb21wb25lbnQgcHJvdG90eXBlXG5cdEZSQU1FV09SSy52ZXJib3NlKGNvbXBvbmVudERlZi5pZCArICcgOjogQnVpbGRpbmcgY29tcG9uZW50IHByb3RvdHlwZS4uLicpO1xuXHR2YXIgY29tcG9uZW50UHJvdG90eXBlID0gRlJBTUVXT1JLLkNvbXBvbmVudC5leHRlbmQoY29tcG9uZW50RGVmKTtcblxuXHQvLyBEaXNjb3ZlciBzdWJzY3JpcHRpb25zXG5cdGNvbXBvbmVudFByb3RvdHlwZS5wcm90b3R5cGUuc3Vic2NyaXB0aW9ucyA9IHt9O1xuXG5cdC8vIEl0ZXJhdGUgdGhyb3VnaCBlYWNoIHByb3BlcnR5IG9uIHRoaXMgY29tcG9uZW50IHByb3RvdHlwZVxuXHRfLmVhY2goY29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZSwgZnVuY3Rpb24gKGhhbmRsZXIsIGtleSkge1xuXG5cdFx0Ly8gQWRkIGFwcCBldmVudHMgKCUpLCByb3V0ZXMgKCMpLCBhbmQgZGF0YSBsaXN0ZW5lcnMgKH4pIHRvIHN1YnNjcmlwdGlvbnMgaGFzaFxuXHRcdGlmIChrZXkubWF0Y2goL14oJXwjfH4pLykpIHtcblx0XHRcdGlmIChfLmlzU3RyaW5nKGhhbmRsZXIpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihjb21wb25lbnREZWYuaWQgKyAnOjogSW52YWxpZCBsaXN0ZW5lciBmb3Igc3Vic2NyaXB0aW9uOiAnICsga2V5ICsgJy5cXG4nICtcblx0XHRcdFx0XHQnRGVmaW5lIHlvdXIgY2FsbGJhY2sgd2l0aCBhbiBhbm9ueW1vdXMgZnVuY3Rpb24gaW5zdGVhZCBvZiBhIHN0cmluZy4nXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIV8uaXNGdW5jdGlvbihoYW5kbGVyKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoY29tcG9uZW50RGVmLmlkICsnOjogSW52YWxpZCBsaXN0ZW5lciBmb3Igc3Vic2NyaXB0aW9uOiAnICsga2V5KTtcblx0XHRcdH1cblx0XHRcdGNvbXBvbmVudFByb3RvdHlwZS5wcm90b3R5cGUuc3Vic2NyaXB0aW9uc1trZXldID0gaGFuZGxlcjtcblx0XHR9XG5cblx0XHQvLyBFeHRlbmQgb25lIG9yIG1vcmUgb3RoZXIgY29tcG9uZW50c1xuXHRcdGVsc2UgaWYgKGtleSA9PT0gJ2V4dGVuZENvbXBvbmVudHMnKSB7XG5cdFx0XHR2YXIgb2JqVG9NZXJnZSA9IHt9O1xuXHRcdFx0Xy5lYWNoKGhhbmRsZXIsIGZ1bmN0aW9uKGNoaWxkSWQpe1xuXG5cdFx0XHRcdGlmICghRlJBTUVXT1JLLmNvbXBvbmVudHNbY2hpbGRJZF0pe1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihcblx0XHRcdFx0XHRjb21wb25lbnREZWYuaWQgKyAnIDo6ICcgK1xuXHRcdFx0XHRcdCdUcnlpbmcgdG8gZGVmaW5lL2V4dGVuZCB0aGlzIGNvbXBvbmVudCBmcm9tIGAnICsgY2hpbGRJZCArICdgLCAnICtcblx0XHRcdFx0XHQnYnV0IG5vIGNvbXBvbmVudCB3aXRoIHRoYXQgaWQgY2FuIGJlIGZvdW5kLidcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Xy5leHRlbmQob2JqVG9NZXJnZSwgRlJBTUVXT1JLLmNvbXBvbmVudHNbY2hpbGRJZF0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdF8uZGVmYXVsdHMoY29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZSwgb2JqVG9NZXJnZSk7XG5cdFx0fVxuXHR9KTtcblxuXHQvLyBTYXZlIHByb3RvdHlwZSBpbiBnbG9iYWwgc2V0IGZvciB0cmFja2luZ1xuXHRGUkFNRVdPUksuY29tcG9uZW50c1tjb21wb25lbnREZWYuaWRdID0gY29tcG9uZW50UHJvdG90eXBlO1xufTtcbiIsIi8qKlxuICogQ29sbGVjdCBhbnkgcmVnaW9ucyB3aXRoIHRoZSBkZWZhdWx0IGNvbXBvbmVudCBzZXQgZnJvbSB0aGUgRE9NLlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY29sbGVjdFJlZ2lvbnMgKCkge1xuXG5cdC8vIFByb3ZpZGUgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkgZm9yIGxlZ2FjeSBub3RhdGlvblxuXHQkKCdyZWdpb25bZGVmYXVsdF0scmVnaW9uW3RlbXBsYXRlXScpLmVhY2goZnVuY3Rpb24oKSB7XG5cdFx0JGUgPSAkKHRoaXMpO1xuXHRcdHZhciBjb21wb25lbnRJZCA9ICRlLmF0dHIoJ2RlZmF1bHQnKSB8fCAkZS5hdHRyKCd0ZW1wbGF0ZScpO1xuXHRcdCRlLmF0dHIoJ2NvbnRlbnRzJywgY29tcG9uZW50SWQpO1xuXHR9KTtcblxuXHQvLyBOb3cgaW5zdGFudGlhdGUgdGhlIGFwcHJvcHJpYXRlIGRlZmF1bHQgY29tcG9uZW50IGluIGVhY2hcblx0Ly8gcmVnaW9uIHdpdGggYSBzcGVjaWZpZWQgdGVtcGxhdGUvY29tcG9uZW50XG5cdCQoJ3JlZ2lvbltjb250ZW50c10nKS5lYWNoKGZ1bmN0aW9uKCkge1xuXHRcdEZSQU1FV09SSy5SZWdpb24uZnJvbUVsZW1lbnQodGhpcyk7XG5cdH0pO1xufVxuIiwiLyoqXG4gKiBMb2FkIGFueSBzY3JpcHQgdGFncyBvbiB0aGUgcGFnZSB3aXRoIHR5cGU9XCJ0ZXh0L3RlbXBsYXRlXCIuXG4gKlxuICogQHJldHVybiB7T2JqZWN0fSBbT2JqZWN0IGNvbnNpc3Rpbmcgb2YgYSB0ZW1wbGF0ZSBpZGVudGlmaWVyIGFuZCBpdHMgSFRNTC5dXG4gKi9cblxudmFyIFV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMvdXRpbHMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjb2xsZWN0VGVtcGxhdGVzKCkge1xuXHR2YXIgdGVtcGxhdGVzID0ge307XG5cblx0JCgnc2NyaXB0W3R5cGU9XCJ0ZXh0L3RlbXBsYXRlXCJdJykuZWFjaChmdW5jdGlvbiAoaSwgZWwpIHtcblx0XHR2YXIgaWQgPSBVdGlscy5lbDJpZChlbCwgdHJ1ZSk7XG5cdFx0dGVtcGxhdGVzW2lkXSA9ICQoZWwpLmh0bWwoKTtcblxuXHRcdC8vIFN0cmlwIHdoaXRlc3BhY2UgbGVmdG92ZXIgZnJvbSBzY3JpcHQgdGFnc1xuXHRcdHRlbXBsYXRlc1tpZF0gPSB0ZW1wbGF0ZXNbaWRdLnJlcGxhY2UoL15cXHMrLywnJyk7XG5cdFx0dGVtcGxhdGVzW2lkXSA9IHRlbXBsYXRlc1tpZF0ucmVwbGFjZSgvXFxzKyQvLCcnKTtcblxuXHRcdC8vIFJlbW92ZSBmcm9tIERPTVxuXHRcdCQoZWwpLnJlbW92ZSgpO1xuXHR9KTtcblxuXHRyZXR1cm4gdGVtcGxhdGVzO1xufTtcbiIsIi8qKlxuICogVGhpcyBpcyB0aGUgc3RhcnRpbmcgcG9pbnQgdG8geW91ciBhcHBsaWNhdGlvbi4gIFlvdSBzaG91bGQgZ3JhYiB0ZW1wbGF0ZXMgYW5kIGNvbXBvbmVudHNcbiAqIGJlZm9yZSBjYWxsaW5nIEZSQU1FV09SSy5yYWlzZSgpIHVzaW5nIHNvbWV0aGluZyBsaWtlIFJlcXVpcmUuanMuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnNcblx0XHRkYXRhOiB7IGF1dGhlbnRpY2F0ZWQ6IGZhbHNlIH0sXG5cdFx0dGVtcGxhdGVzOiB7IGNvbXBvbmVudE5hbWU6IEhUTUxPclByZWNvbXBpbGVkRm4gfSxcblx0XHRjb21wb25lbnRzOiB7IGNvbXBvbmVudE5hbWU6IENvbXBvbmVudERlZmluaXRpb24gfVxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2JcbiAqL1xuXG52YXIgTG9nZ2VyID0gcmVxdWlyZSgnLi4vbG9nZ2VyL2luZGV4Jyk7XG52YXIgYnVpbGRDb21wb25lbnREZWZpbml0aW9uID0gcmVxdWlyZSgnLi4vZGVmaW5lL2J1aWxkRGVmaW5pdGlvbicpO1xudmFyIGJ1aWxkQ29tcG9uZW50UHJvdG90eXBlID0gcmVxdWlyZSgnLi9idWlsZFByb3RvdHlwZScpO1xudmFyIGNvbGxlY3RUZW1wbGF0ZXMgPSByZXF1aXJlKCcuL2NvbGxlY3RUZW1wbGF0ZXMnKTtcbnZhciBjb2xsZWN0UmVnaW9ucyA9IHJlcXVpcmUoJy4vY29sbGVjdFJlZ2lvbnMnKTtcblxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHJhaXNlKG9wdGlvbnMsIGNiKSB7XG5cblx0Ly8gSWYgb25seSBvbmUgYXJnIGlzIHByZXNlbnQsIHVzZSBvcHRpb25zIGFzIGNhbGxiYWNrIGlmIHBvc3NpYmxlLlxuXHQvLyBJZiBvcHRpb25zIGFyZSBub3QgZGVmaW5lZCwgdXNlIGFuIGVtcHR5IG9iamVjdC5cblx0aWYgKCFjYiAmJiBfLmlzRnVuY3Rpb24ob3B0aW9ucykpIHtcblx0XHRjYiA9IG9wdGlvbnM7XG5cdH1cblx0aWYgKCFfLmlzUGxhaW5PYmplY3Qob3B0aW9ucykpIHtcblx0XHRvcHRpb25zID0ge307XG5cdH1cblxuXHQvLyBBcHBseSBkZWZhdWx0c1xuXHRfLmRlZmF1bHRzKEZSQU1FV09SSywge1xuXHRcdHRocm90dGxlV2luZG93UmVzaXplOiAyMDAsXG5cdFx0bG9nTGV2ZWw6ICd3YXJuJyxcblx0XHRsb2dnZXI6IHVuZGVmaW5lZCxcblx0XHRwcm9kdWN0aW9uOiBmYWxzZVxuXHR9KTtcblxuXHQvLyBBcHBseSBvdmVycmlkZXMgZnJvbSBvcHRpb25zXG5cdF8uZXh0ZW5kKEZSQU1FV09SSywgb3B0aW9ucyk7XG5cblx0Ly8gSW50ZXJwcmV0IGBwcm9kdWN0aW9uYCBhcyBgbG9nTGV2ZWwgPT09ICdzaWxlbnQnYFxuXHRpZiAoRlJBTUVXT1JLLnByb2R1Y3Rpb24pIHtcblx0XHRGUkFNRVdPUksubG9nTGV2ZWwgPSAnc2lsZW50Jztcblx0fVxuXG5cdC8vIEluaXRpYWxpemUgbG9nZ2VyXG5cdG5ldyBMb2dnZXIoKTtcblxuXHQvLyBNZXJnZSBkYXRhIGludG8gRlJBTUVXT1JLLmRhdGFcblx0Xy5leHRlbmQoRlJBTUVXT1JLLmRhdGEsIG9wdGlvbnMuZGF0YSB8fCB7fSk7XG5cblx0Ly8gTWVyZ2Ugc3BlY2lmaWVkIHRlbXBsYXRlcyB3aXRoIEZSQU1FV09SSy50ZW1wbGF0ZXNcblx0Xy5leHRlbmQoRlJBTUVXT1JLLnRlbXBsYXRlcywgb3B0aW9ucy50ZW1wbGF0ZXMgfHwge30pO1xuXG5cdC8vIElmIEZSQU1FV09SSy5kZWZpbmUoKSB3YXMgdXNlZCwgYnVpbGQgdGhlIGxpc3Qgb2YgY29tcG9uZW50c1xuXHQvLyBJdGVyYXRlIHRocm91Z2ggdGhlIGRlZmluZSBxdWV1ZSBhbmQgY3JlYXRlIGVhY2ggZGVmaW5pdGlvblxuXHRfLmVhY2goRlJBTUVXT1JLLl9kZWZpbmVRdWV1ZSwgYnVpbGRDb21wb25lbnREZWZpbml0aW9uKTtcblxuXHQvLyBNZXJnZSBzcGVjaWZpZWQgY29tcG9uZW50cyB3LyBGUkFNRVdPUksuY29tcG9uZW50c1xuXHRfLmV4dGVuZChGUkFNRVdPUksuY29tcG9uZW50cywgb3B0aW9ucy5jb21wb25lbnRzIHx8IHt9KTtcblxuXHQvLyBCYWNrIHVwIGVhY2ggY29tcG9uZW50IGRlZmluaXRpb24gYmVmb3JlIHRyYW5zZm9ybWluZyBpdCBpbnRvIGEgbGl2ZSBwcm90b3R5cGVcblx0RlJBTUVXT1JLLmNvbXBvbmVudERlZnMgPSBfLmNsb25lKEZSQU1FV09SSy5jb21wb25lbnRzKTtcblxuXHQvLyBSdW4gdGhpcyBjYWxsIGJhY2sgd2hlbiB0aGUgRE9NIGlzIHJlYWR5XG5cdCQoZnVuY3Rpb24gKCkge1xuXG5cdFx0Ly8gQ29sbGVjdCBhbnkgPHNjcmlwdD4gdGFnIHRlbXBsYXRlcyBvbiB0aGUgcGFnZVxuXHRcdC8vIGFuZCBhYnNvcmIgdGhlbSBpbnRvIEZSQU1FV09SSy50ZW1wbGF0ZXNcblx0XHRfLmV4dGVuZChGUkFNRVdPUksudGVtcGxhdGVzLCBjb2xsZWN0VGVtcGxhdGVzKCkpO1xuXG5cdFx0Ly8gQnVpbGQgYWN0dWFsIHByb3RvdHlwZXMgZm9yIHRoZSBjb21wb25lbnRzXG5cdFx0Ly8gKG5lZWQgdGhlIHRlbXBsYXRlcyBhdCB0aGlzIHBvaW50IHRvIG1ha2UgdGhpcyB3b3JrKVxuXHRcdF8uZWFjaChGUkFNRVdPUksuY29tcG9uZW50cywgYnVpbGRDb21wb25lbnRQcm90b3R5cGUpO1xuXG5cdFx0Ly8gR3JhYiBpbml0aWFsIHJlZ2lvbnMgZnJvbSBET01cblx0XHRjb2xsZWN0UmVnaW9ucygpO1xuXG5cdFx0Ly8gQmluZCBnbG9iYWwgRE9NIGV2ZW50cyBhcyBGUkFNRVdPUksgZXZlbnRzXG5cdFx0Ly8gKGUuZy4gJXdpbmRvdzpyZXNpemUpXG5cdFx0dmFyIHRyaWdnZXJSZXNpemVFdmVudCA9IF8uZGVib3VuY2UoZnVuY3Rpb24gKCkge1xuXHRcdFx0RlJBTUVXT1JLLnRyaWdnZXIoJyV3aW5kb3c6cmVzaXplJyk7XG5cdFx0fSwgb3B0aW9ucy50aHJvdHRsZVdpbmRvd1Jlc2l6ZSB8fCAwKTtcblx0XHQkKHdpbmRvdykucmVzaXplKHRyaWdnZXJSZXNpemVFdmVudCk7XG5cdFx0Ly8gVE9ETzogYWRkIG1vcmUgZXZlbnRzIGFuZCBleHRyYXBvbGF0ZSB0aGlzIGxvZ2ljIHRvIGEgc2VwYXJhdGUgbW9kdWxlXG5cblx0XHQvLyBEbyB0aGUgaW5pdGlhbCByb3V0aW5nIHNlcXVlbmNlXG5cdFx0Ly8gTG9vayBhdCB0aGUgI2ZyYWdtZW50IHVybCBhbmQgZmlyZSB0aGUgZ2xvYmFsIHJvdXRlIGV2ZW50XG5cdFx0RlJBTUVXT1JLLmhpc3Rvcnkuc3RhcnQoXy5kZWZhdWx0cyh7XG5cdFx0XHRwdXNoU3RhdGU6IHVuZGVmaW5lZCxcblx0XHRcdGhhc2hDaGFuZ2U6IHVuZGVmaW5lZCxcblx0XHRcdHJvb3Q6IHVuZGVmaW5lZFxuXHRcdH0sIG9wdGlvbnMpKTtcblxuXHRcdGlmIChjYikgY2IoKTtcblx0fSk7XG59O1xuIiwiLyoqXG4gKiByZWdpb24uYXBwZW5kKCBjb21wb25lbnRJZCwgW3Byb3BlcnRpZXNdIClcbiAqXG4gKiBDYWxscyBpbnNlcnQoKSBhdCBsYXN0IHBvc2l0aW9uXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYXBwZW5kKGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKSB7XG5cdC8vIEluc2VydCBhdCBsYXN0IHBvc2l0aW9uXG5cdGNvbnNvbGUubG9nKGNvbXBvbmVudElkKTtcblx0cmV0dXJuIHRoaXMuaW5zZXJ0KHRoaXMuX2NoaWxkcmVuLmxlbmd0aCwgY29tcG9uZW50SWQsIHByb3BlcnRpZXMpO1xufTtcbiIsIi8qKlxuICogU2hvcnRjdXQgZm9yIGNhbGxpbmcgZW1wdHkoKSBhbmQgdGhlbiBhcHBlbmQoKSxcbiAqIFRoaXMgaXMgdGhlIGdlbmVyYWwgdXNlIGNhc2UgZm9yIG1hbmFnaW5nIHN1YmNvbXBvbmVudHNcbiAqIChlLmcuIHdoZW4gYSBuYXZiYXIgaXRlbSBpcyB0b3VjaGVkKVxuICpcbiAqIEBwYXJhbSAge3N0cmluZ30gY29tcG9uZW50ICBUaGUgaWQgbmFtZSBvZiB0aGUgY29tcG9uZXQgdGhhdCB5b3Ugd2FudCB0byBhdHRhY2guXG4gKiBAcGFyYW0gIHtPYmplY3R9IHByb3BlcnRpZXMgUHJvcGVydGllcyB0aGF0IHRoZSBhdHRhY2hlZCBjb21wb25lbnQgd2lsbCBiZSBpbml0YWxpemVkIHdpdGguXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBhdHRhY2goY29tcG9uZW50LCBwcm9wZXJ0aWVzKSB7XG5cdHRoaXMuZW1wdHkoKTtcblx0cmV0dXJuIHRoaXMuYXBwZW5kKGNvbXBvbmVudCwgcHJvcGVydGllcyk7XG59O1xuIiwiLyoqXG4gKiByZWdpb24uZW1wdHkoIClcbiAqXG4gKiBJdGVyYXRlIG92ZXIgZWFjaCBjb21wb25lbnQgaW4gdGhpcyByZWdpb24gYW5kIGNhbGwgLmNsb3NlKCkgb24gaXRcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGVtcHR5KCkge1xuXHRGUkFNRVdPUksuZGVidWcodGhpcy5wYXJlbnQuaWQgKyAnIDo6IEVtcHR5aW5nIHJlZ2lvbjogJyArIHRoaXMuaWQpO1xuXHR3aGlsZSAodGhpcy5fY2hpbGRyZW4ubGVuZ3RoID4gMCkge1xuXHRcdHRoaXMucmVtb3ZlKDApO1xuXHR9XG59O1xuIiwiLyoqXG4gKiBGYWN0b3J5IG1ldGhvZCB0byBnZW5lcmF0ZSBhIG5ldyByZWdpb24gaW5zdGFuY2UgZnJvbSBhIERPTSBlbGVtZW50XG4gKiBJbXBsZW1lbnRzIGB0ZW1wbGF0ZWAsIGBjb3VudGAsIGFuZCBgZGF0YS0qYCBIVE1MIGF0dHJpYnV0ZXMuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnNcbiAqIEByZXR1cm5zIHJlZ2lvbiBpbnN0YW5jZVxuICovXG5cbnZhciBVdGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzL3V0aWxzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZnJvbUVsZW1lbnQoZWwsIHBhcmVudCkge1xuXG5cdC8vIElmIHBhcmVudCBpcyBub3Qgc3BlY2lmaWVkLCBtYWtlLWJlbGlldmUuXG5cdHBhcmVudCA9IHBhcmVudCB8fCB7IGlkOiAnKicgfTtcblxuXG5cblx0Ly8gQnVpbGQgcmVnaW9uXG5cdHZhciByZWdpb24gPSBuZXcgRlJBTUVXT1JLLlJlZ2lvbih7XG5cdFx0aWQ6IFV0aWxzLmVsMmlkKGVsKSxcblx0XHQkZWw6ICQoZWwpLFxuXHRcdHBhcmVudDogcGFyZW50XG5cdH0pO1xuXG5cdC8vIElmIHRoaXMgcmVnaW9uIGhhcyBhIGRlZmF1bHQgY29tcG9uZW50L3RlbXBsYXRlIHNldCxcblx0Ly8gZ3JhYiB0aGUgaWQgIC0tICBlLmcuIDxyZWdpb24gY29udGVudHM9XCJGb29cIiAvPlxuXHR2YXIgY29tcG9uZW50SWQgPSAkKGVsKS5hdHRyKCdjb250ZW50cycpO1xuXG5cblx0Ly8gSWYgYGNvdW50YCBpcyBzZXQsIHJlbmRlciBzdWItY29tcG9uZW50IHNwZWNpZmllZCBudW1iZXIgb2YgdGltZXMuXG5cdC8vIGUuZy4gPHJlZ2lvbiB0ZW1wbGF0ZT1cIkZvb1wiIGNvdW50PVwiM1wiIC8+XG5cdC8vICh2ZXJpZnkgRlJBTUVXT1JLLnNob3J0Y3V0LmNvdW50IGlzIGVuYWJsZWQpXG5cdHZhciBjb3VudEF0dHIsXG5cdFx0XHRjb3VudCA9IDE7XG5cblx0aWYgKEZSQU1FV09SSy5zaG9ydGN1dC5jb3VudCkge1xuXG5cdFx0Ly8gSWYgYGNvdW50YCBhdHRyaWJ1dGUgaXMgbm90IGZhbHNlIG9yIHVuZGVmaW5lZCxcblx0XHQvLyB0aGF0IG1lYW5zIGl0IHdhcyBzZXQgZXhwbGljaXRseSwgYW5kIHdlIHNob3VsZCB1c2UgaXRcblx0XHRjb3VudEF0dHIgPSAkKGVsKS5hdHRyKCdjb3VudCcpO1xuXHRcdC8vIEZSQU1FV09SSy5kZWJ1ZygnQ291bnQgYXR0ciBpcyA6OiAnLCBjb3VudEF0dHIpO1xuXHRcdGlmICghIWNvdW50QXR0cikge1xuXHRcdFx0Y291bnQgPSBjb3VudEF0dHI7XG5cdFx0fVxuXHR9XG5cblxuXHRGUkFNRVdPUksuZGVidWcoXG5cdFx0cGFyZW50LmlkICsgJyA6LTogSW5zdGFudGlhdGVkwqBuZXcgcmVnaW9uJyArXG5cdFx0KCByZWdpb24uaWQgPyAnIGAnICsgcmVnaW9uLmlkICsgJ2AnIDogJycgKSArXG5cdFx0KCBjb21wb25lbnRJZCA/ICcgYW5kIHBvcHVsYXRlZCBpdCB3aXRoJyArXG5cdFx0XHQoIGNvdW50ID4gMSA/IGNvdW50ICsgJyBpbnN0YW5jZXMgb2YnIDogJyAxJyApICtcblx0XHRcdCcgYCcgKyBjb21wb25lbnRJZCArICdgJyA6ICcnXG5cdFx0KSArICcuJ1xuXHQpO1xuXG5cblxuXHQvLyBBcHBlbmQgc3ViLWNvbXBvbmVudChzKSB0byByZWdpb24gYXV0b21hdGljYWxseVxuXHQvLyAodmVyaWZ5IEZSQU1FV09SSy5zaG9ydGN1dC50ZW1wbGF0ZSBpcyBlbmFibGVkKVxuXHRpZiAoIEZSQU1FV09SSy5zaG9ydGN1dC50ZW1wbGF0ZSAmJiBjb21wb25lbnRJZCApIHtcblxuXHRcdC8vIEZSQU1FV09SSy5kZWJ1Zyhcblx0XHQvLyBcdCdQcmVwYXJpbmcgdG8gcmVuZGVyICcgKyBjb3VudCArICcgJyArIGNvbXBvbmVudElkICsgJyBjb21wb25lbnRzIGludG8gcmVnaW9uICcgK1xuXHRcdC8vIFx0JygnICsgcmVnaW9uLmlkICsgJyksIHdoaWNoIGFscmVhZHkgY29udGFpbnMgJyArIHJlZ2lvbi4kZWwuY2hpbGRyZW4oKS5sZW5ndGggK1xuXHRcdC8vIFx0JyBzdWJjb21wb25lbnRzLidcblx0XHQvLyApO1xuXG5cdFx0cmVnaW9uLmFwcGVuZChjb21wb25lbnRJZCk7XG5cblx0XHQvLyAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblx0XHQvLyAvLyBTRVJJT1VTTFkgV1RGXG5cdFx0Ly8gLy8gTUFKT1IgSEFYWFhYWFhYXG5cdFx0Ly8gLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cdFx0Ly8gY291bnQgPSArY291bnQgKyAxO1xuXHRcdC8vIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG5cdFx0Ly8gZm9yICh2YXIgaj0wOyBqIDwgY291bnQ7IGorKyApIHtcblxuXHRcdC8vIFx0cmVnaW9uLmFwcGVuZChjb21wb25lbnRJZCk7XG5cblx0XHQvLyBcdC8vIEZSQU1FV09SSy5kZWJ1Zyhcblx0XHQvLyBcdC8vIFx0J3JlbmRlcmluZyB0aGUgJyArIGNvbXBvbmVudElkICsgJyBjb21wb25lbnQsIHJlbWFpbmluZzogJyArXG5cdFx0Ly8gXHQvLyBcdGNvdW50ICsgJyBhbmQgdGhlcmUgYXJlICcgKyByZWdpb24uJGVsLmNoaWxkcmVuKCkubGVuZ3RoICtcblx0XHQvLyBcdC8vIFx0JyBzdWJjb21wb25lbnQgZWxlbWVudHMgaW4gdGhlIHJlZ2lvbiBub3cnXG5cdFx0Ly8gXHQvLyApO1xuXG5cdFx0Ly8gfVxuXG5cdH1cblxuXHRyZXR1cm4gcmVnaW9uO1xufTtcbiIsIi8qKlxuICogUmVnaW9uc1xuICovXG5cbnZhciBpbnNlcnQgPSByZXF1aXJlKCcuL2luc2VydCcpO1xudmFyIHJlbW92ZSA9IHJlcXVpcmUoJy4vcmVtb3ZlJyk7XG52YXIgZW1wdHkgPSByZXF1aXJlKCcuL2VtcHR5Jyk7XG52YXIgYXBwZW5kID0gcmVxdWlyZSgnLi9hcHBlbmQnKTtcbnZhciBhdHRhY2ggPSByZXF1aXJlKCcuL2F0dGFjaCcpO1xudmFyIGZyb21FbGVtZW50ID0gcmVxdWlyZSgnLi9mcm9tRWxlbWVudCcpO1xuXG5SZWdpb24gPSBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHJlZ2lvbihwcm9wZXJ0aWVzKSB7XG5cblx0Xy5leHRlbmQodGhpcywgRlJBTUVXT1JLLkV2ZW50cyk7XG5cblx0aWYgKCFwcm9wZXJ0aWVzKSB7XG5cdFx0cHJvcGVydGllcyA9IHt9O1xuXHR9XG5cdGlmICghcHJvcGVydGllcy4kZWwpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1RyeWluZyB0byBpbnN0YW50aWF0ZSByZWdpb24gd2l0aCBubyAkZWwhJyk7XG5cdH1cblxuXHQvLyBGb2xkIGluIHByb3BlcnRpZXMgdG8gcHJvdG90eXBlXG5cdF8uZXh0ZW5kKHRoaXMsIHByb3BlcnRpZXMpO1xuXG5cdC8vIElmIG5laXRoZXIgYW4gaWQgbm9yIGEgYHRlbXBsYXRlYCB3YXMgc3BlY2lmaWVkLFxuXHQvLyB3ZSdsbCB0aHJvdyBhbiBlcnJvciwgc2luY2UgdGhlcmUncyBubyB3YXkgdG8gZ2V0IGEgaG9sZCBvZiB0aGUgcmVnaW9uXG5cdGlmICghdGhpcy5pZCAmJiAhKHRoaXMuJGVsLmF0dHIoJ2RlZmF1bHQnKSB8fCB0aGlzLiRlbC5hdHRyKCd0ZW1wbGF0ZScpIHx8XG5cdFx0dGhpcy4kZWwuYXR0cignY29udGVudHMnKSkpIHtcblxuXHRcdHRocm93IG5ldyBFcnJvcihcblx0XHRcdHRoaXMucGFyZW50LmlkICsgJyA6OiBFaXRoZXIgYGRhdGEtaWRgLCBgY29udGVudHNgLCBvciBib3RoICcgK1xuXHRcdFx0J211c3QgYmUgc3BlY2lmaWVkIG9uIHJlZ2lvbnMuIFxcbicgK1xuXHRcdFx0J2UuZy4gPHJlZ2lvbiBkYXRhLWlkPVwiZm9vXCIgdGVtcGxhdGU9XCJTb21lQ29tcG9uZW50XCI+PC9yZWdpb24+J1xuXHRcdCk7XG5cdH1cblxuXHQvLyBTZXQgdXAgbGlzdCB0byBob3VzZSBjaGlsZCBjb21wb25lbnRzXG5cdHRoaXMuX2NoaWxkcmVuID0gW107XG5cblx0Xy5iaW5kQWxsKHRoaXMpO1xuXG5cdC8vIFNldCB1cCBjb252ZW5pZW5jZSBhY2Nlc3MgdG8gdGhpcyByZWdpb24gaW4gdGhlIGdsb2JhbCByZWdpb24gY2FjaGVcblx0RlJBTUVXT1JLLnJlZ2lvbnNbdGhpcy5pZF0gPSB0aGlzO1xufTtcblxuUmVnaW9uLmZyb21FbGVtZW50ID0gZnVuY3Rpb24oZWwsIHBhcmVudCkge1xuXHRyZXR1cm4gZnJvbUVsZW1lbnQoZWwsIHBhcmVudCk7XG59O1xuUmVnaW9uLnByb3RvdHlwZS5yZW1vdmUgPSBmdW5jdGlvbihhdEluZGV4KSB7XG5cdHJldHVybiByZW1vdmUuY2FsbCh0aGlzLCBhdEluZGV4KTtcbn07XG5SZWdpb24ucHJvdG90eXBlLmVtcHR5ID0gZnVuY3Rpb24oKSB7XG5cdHJldHVybiBlbXB0eS5jYWxsKHRoaXMpO1xufTtcblJlZ2lvbi5wcm90b3R5cGUuaW5zZXJ0ID0gZnVuY3Rpb24oYXRJbmRleCwgY29tcG9uZW50SWQsIHByb3BlcnRpZXMpIHtcblx0cmV0dXJuIGluc2VydC5jYWxsKHRoaXMsIGF0SW5kZXgsIGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKTtcbn07XG5SZWdpb24ucHJvdG90eXBlLmFwcGVuZCA9IGZ1bmN0aW9uKGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKSB7XG5cdHJldHVybiBhcHBlbmQuY2FsbCh0aGlzLCBjb21wb25lbnRJZCwgcHJvcGVydGllcyk7XG59O1xuUmVnaW9uLnByb3RvdHlwZS5hdHRhY2ggPSBmdW5jdGlvbihjb21wb25lbnQsIHByb3BlcnRpZXMpIHtcblx0cmV0dXJuIGF0dGFjaC5jYWxsKHRoaXMsIGNvbXBvbmVudCwgcHJvcGVydGllcyk7XG59O1xuIiwiLyoqXG4gKiByZWdpb24uaW5zZXJ0KCBhdEluZGV4LCBjb21wb25lbnRJZCwgW3Byb3BlcnRpZXNdIClcbiAqXG4gKiBUT0RPOiBzdXBwb3J0IGEgbGlzdCBvZiBwcm9wZXJ0aWVzIG9iamVjdHMgaW4gbGlldSBvZiB0aGUgcHJvcGVydGllcyBvYmplY3RcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGluc2VydChhdEluZGV4LCBjb21wb25lbnRJZCwgcHJvcGVydGllcykge1xuXG5cdHZhciBlcnIgPSAnJztcblx0aWYgKCEoYXRJbmRleCB8fCBfLmlzRmluaXRlKGF0SW5kZXgpKSkge1xuXHRcdGVyciArPSB0aGlzLmlkICsgJy5pbnNlcnQoKSA6OiBObyBhdEluZGV4IHNwZWNpZmllZCEnO1xuXHR9XG5cdGVsc2UgaWYgKCFjb21wb25lbnRJZCkge1xuXHRcdGVyciArPSB0aGlzLmlkICsgJy5pbnNlcnQoKSA6OiBObyBjb21wb25lbnRJZCBzcGVjaWZpZWQhJztcblx0fVxuXHRpZiAoZXJyKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGVyciArICdcXG5Vc2FnZTogYXBwZW5kKGF0SW5kZXgsIGNvbXBvbmVudElkLCBbcHJvcGVydGllc10pJyk7XG5cdH1cblxuXHR2YXIgY29tcG9uZW50O1xuXHQvLyBJZiBjb21wb25lbnRJZCBpcyBhIHN0cmluZywgbG9vayB1cCBjb21wb25lbnQgcHJvdG90eXBlIGFuZCBpbnN0YXRpYXRlXG5cdGlmICgnc3RyaW5nJyA9PSB0eXBlb2YgY29tcG9uZW50SWQpIHtcblxuXHRcdHZhciBjb21wb25lbnRQcm90b3R5cGUgPSBGUkFNRVdPUksuY29tcG9uZW50c1tjb21wb25lbnRJZF07XG5cblx0XHRpZiAoIWNvbXBvbmVudFByb3RvdHlwZSkge1xuXHRcdFx0dmFyIHRlbXBsYXRlID0gRlJBTUVXT1JLLnRlbXBsYXRlc1tjb21wb25lbnRJZF07XG5cdFx0XHRpZiAoIXRlbXBsYXRlKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvciAoJ0luICcgK1xuXHRcdFx0XHRcdCh0aGlzLmlkIHx8ICdBbm9ueW1vdXMgcmVnaW9uJykgKyAnOjogVHJ5aW5nIHRvIGF0dGFjaCAnICtcblx0XHRcdFx0XHRjb21wb25lbnRJZCArICcsIGJ1dCBubyBjb21wb25lbnQgb3IgdGVtcGxhdGUgZXhpc3RzIHdpdGggdGhhdCBpZC4nKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSWYgbm8gY29tcG9uZW50IHByb3RvdHlwZSB3aXRoIHRoaXMgaWQgZXhpc3RzLFxuXHRcdFx0Ly8gY3JlYXRlIGFuIGFub255bW91cyBvbmUgdG8gdXNlXG5cdFx0XHRjb21wb25lbnRQcm90b3R5cGUgPSBGUkFNRVdPUksuQ29tcG9uZW50LmV4dGVuZCh7XG5cdFx0XHRcdGlkOiBjb21wb25lbnRJZCxcblx0XHRcdFx0dGVtcGxhdGU6IHRlbXBsYXRlXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBJbnN0YW50aWF0ZSBhbmQgcmVuZGVyIHRoZSBjb21wb25lbnQgaW5zaWRlIHRoaXMgcmVnaW9uXG5cdFx0Y29tcG9uZW50ID0gbmV3IGNvbXBvbmVudFByb3RvdHlwZShfLmV4dGVuZCh7XG5cdFx0XHQkb3V0bGV0OiB0aGlzLiRlbFxuXHRcdH0sIHByb3BlcnRpZXMgfHwge30pKTtcblxuXG5cdH1cblxuXHQvLyBPdGhlcndpc2UgYXNzdW1lIGFuIGluc3RhbnRpYXRlZCBjb21wb25lbnQgb2JqZWN0IHdhcyBzZW50XG5cdC8qIFRPRE86IENoZWNrIHRoYXQgY29tcG9uZW50IG9iamVjdCBpcyB2YWxpZCAqL1xuXHRlbHNlIHtcblx0XHRjb21wb25lbnQgPSBjb21wb25lbnRJZDtcblx0XHRjb21wb25lbnQuJG91dGxldCA9IHRoaXMuJGVsO1xuXHR9XG5cblx0Y29tcG9uZW50LnJlbmRlcihhdEluZGV4KTtcblxuXHQvLyBBbmQga2VlcCB0cmFjayBvZiBpdCBpbiB0aGUgbGlzdCBvZiB0aGlzIHJlZ2lvbidzIGNoaWxkcmVuXG5cdHRoaXMuX2NoaWxkcmVuLnNwbGljZShhdEluZGV4LCAwLCBjb21wb25lbnQpO1xuXG5cdC8vIExvZyBmb3IgZGVidWdnaW5nIGBjb3VudGAgZGVjbGFyYXRpdmVcblx0dmFyIGRlYnVnU3RyID0gdGhpcy5wYXJlbnQuaWQgKyAnIDo6IEluc2VydGVkICcgKyBjb21wb25lbnRJZCArICcgaW50byAnO1xuXHRpZiAodGhpcy5pZCkgZGVidWdTdHIgKz0gJ3JlZ2lvbjogJyArIHRoaXMuaWQgKyAnIGF0IGluZGV4ICcgKyBhdEluZGV4O1xuXHRlbHNlIGRlYnVnU3RyICs9ICdhbm9ueW1vdXMgcmVnaW9uIGF0IGluZGV4ICcgKyBhdEluZGV4O1xuXHRGUkFNRVdPUksudmVyYm9zZShkZWJ1Z1N0cik7XG5cblx0cmV0dXJuIGNvbXBvbmVudDtcblxufTtcbiIsIi8qKlxuICogcmVnaW9uLnJlbW92ZSggYXRJbmRleCApXG4gKlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHJlbW92ZShhdEluZGV4KSB7XG5cblx0aWYgKCFhdEluZGV4ICYmICFfLmlzRmluaXRlKGF0SW5kZXgpKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKHRoaXMuaWQgKyAnLnJlbW92ZSgpIDo6IE5vIGF0SW5kZXggc3BlY2lmaWVkISBcXG5Vc2FnZTogcmVtb3ZlKGF0SW5kZXgpJyk7XG5cdH1cblxuXHQvLyBSZW1vdmUgdGhlIGNvbXBvbmVudCBmcm9tIHRoZSBsaXN0XG5cdHZhciBjb21wb25lbnQgPSB0aGlzLl9jaGlsZHJlbi5zcGxpY2UoYXRJbmRleCwgMSk7XG5cdGlmICghY29tcG9uZW50WzBdKSB7XG5cblx0XHQvLyBJZiB0aGUgbGlzdCBpcyBlbXB0eSwgZnJlYWsgb3V0XG5cdFx0dGhyb3cgbmV3IEVycm9yKHRoaXMuaWQgKyAnLnJlbW92ZSgpIDo6IFRyeWluZyB0byByZW1vdmUgYSBjb21wb25lbnQgdGhhdCBkb2VzblxcJ3QgZXhpc3QgYXQgaW5kZXggJyArIGF0SW5kZXgpO1xuXHR9XG5cblx0Ly8gU3F1ZWV6ZSB0aGUgY29tcG9uZW50IHRvIGRvIGdldCBhbGwgdGhlIGJpbmR5IGdvb2RuZXNzIG91dFxuXHRjb21wb25lbnRbMF0uY2xvc2UoKTtcblxuXHRGUkFNRVdPUksuZGVidWcodGhpcy5wYXJlbnQuaWQgKyAnIDo6IFJlbW92ZWQgY29tcG9uZW50IGF0IGluZGV4ICcgKyBhdEluZGV4ICsgJyBmcm9tIHJlZ2lvbjogJyArIHRoaXMuaWQpO1xufTtcbiIsIi8qKlxuICogQmFyZS1ib25lcyBET00vVUkgdXRpbGl0aWVzXG4gKi9cblxudmFyIEV2ZW50cyA9IHJlcXVpcmUoJy4vZXZlbnRzJyk7XG5cbkRPTSA9IHtcblxuXHQvKipcblx0ICogRXhwb3NlIHRoZSBcIkRPTW15LWV2ZW50ZWRuZXNzXCIgb2YgZWxlbWVudHMgc28gdGhhdCBpdCdzIHNlbGVjdGFibGUgdmlhIENTU1xuXHQgKiBZb3UgY2FuIHVzZSB0aGlzIHRvIGFwcGx5IGEgZmV3IGNob2ljZSBET00gbW9kaWZpY2F0aW9ucyBvdXQgdGhlIGdhdGUtLVxuXHQgKiAoZS5nLiB0d2Vha3MgdGFyZ2V0aW5nIGNvbW1vbiBpc3N1ZXMgdGhhdCB0eXBpY2FsbHkgZ2V0IGZvcmdvdHRlbiwgbGlrZSBkaXNhYmxpbmcgdGV4dCBzZWxlY3Rpb24pXG5cdCAqXG5cdCAqIEBwYXJhbSB7Q29tcG9uZW50fSBjb21wb25lbnRcblx0ICovXG5cdGZsYWdCb3VuZEV2ZW50czogZnVuY3Rpb24gKCBjb21wb25lbnQgKSB7XG5cblx0XHQvLyBUT0RPOiBwcm92aWRlIGFjY2VzcyB0byBib3VuZCBnbG9iYWwgZXZlbnRzICglKSBhbmQgcm91dGVzICgjKSBhcyB3ZWxsXG5cdFx0Ly8gVE9ETzogZmxhZyBhbGwgRE9NIGV2ZW50cywgbm90IGp1c3QgY2xpY2sgYW5kIHRvdWNoXG5cblx0XHQvLyBCdWlsZCBzdWJzZXQgb2YganVzdCB0aGUgY2xpY2svdG91Y2ggZXZlbnRzXG5cdFx0dmFyIGNsaWNrT3JUb3VjaEV2ZW50cyA9IEV2ZW50cy5wYXJzZShcblx0XHRcdGNvbXBvbmVudC5ldmVudHMsXG5cdFx0XHR7IG9ubHk6IFsnY2xpY2snLCAndG91Y2gnLCAndG91Y2hzdGFydCcsICd0b3VjaGVuZCddIH1cblx0XHQpO1xuXG5cdFx0Ly8gSWYgbm8gY2xpY2svdG91Y2ggZXZlbnRzIGZvdW5kLCBiYWlsIG91dFxuXHRcdGlmICggY2xpY2tPclRvdWNoRXZlbnRzLmxlbmd0aCA8IDEgKSByZXR1cm47XG5cblx0XHQvLyBRdWVyeSBhZmZlY3RlZCBlbGVtZW50cyBmcm9tIERPTVxuXHRcdHZhciAkYWZmZWN0ZWQgPSBFdmVudHMuZ2V0RWxlbWVudHMoY2xpY2tPclRvdWNoRXZlbnRzLCBjb21wb25lbnQpO1xuXG5cdFx0Ly8gTk9URTogRm9yIG5vdywgdGhpcyBpcyBhbHdheXMganVzdCAnY2xpY2snXG5cdFx0dmFyIGJvdW5kRXZlbnRzU3RyaW5nID0gJ2NsaWNrJztcblxuXHRcdC8vIFNldCBgZGF0YS1GUkFNRVdPUkstY2xpY2thYmxlYCBjdXN0b20gYXR0cmlidXRlXG5cdFx0Ly8gKHVpIGxvZ2ljIHNob3VsZCBiZSBleHRlbmRlZCBpbiBDU1MpXG5cdFx0JGFmZmVjdGVkLmF0dHIoJ2RhdGEtJyArIEZSQU1FV09SSy5pZCArICctZXZlbnRzJywgYm91bmRFdmVudHNTdHJpbmcpO1xuXG5cdFx0RnJhbWV3b3JrLnZlcmJvc2UoXG5cdFx0XHRjb21wb25lbnQuaWQgKyAnIDo6ICcgK1xuXHRcdFx0J0Rpc2FibGVkIHVzZXIgdGV4dCBzZWxlY3Rpb24gb24gZWxlbWVudHMgdy8gY2xpY2svdG91Y2ggZXZlbnRzOicsXG5cdFx0XHRjbGlja09yVG91Y2hFdmVudHMsXG5cdFx0XHQkYWZmZWN0ZWRcblx0XHQpO1xuXHR9LFxuXG5cblx0LyoqXG5cdCAqIFN1cHBvcnRlZCBcImZpcnN0LWNsYXNzXCIgRE9NIGV2ZW50cy5cblx0ICogQHR5cGUge0FycmF5fVxuXHQgKi9cblx0ZXZlbnRzOiBbXG5cblx0XHQvLyBMb2NhbGl6ZWQgYnJvd3NlciBldmVudHNcblx0XHQvLyAod29ya3Mgb24gaW5kaXZpZHVhbCBlbGVtZW50cylcblx0XHQnZXJyb3InLCAnc2Nyb2xsJyxcblxuXHRcdC8vIE1vdXNlIGV2ZW50c1xuXHRcdCdjbGljaycsICdkYmxjbGljaycsICdtb3VzZWRvd24nLCAnbW91c2V1cCcsICdob3ZlcicsICdtb3VzZWVudGVyJywgJ21vdXNlbGVhdmUnLFxuXHRcdCdtb3VzZW92ZXInLCAnbW91c2VvdXQnLCAnbW91c2Vtb3ZlJyxcblxuXHRcdC8vIEtleWJvYXJkIGV2ZW50c1xuXHRcdCdrZXlkb3duJywgJ2tleXVwJywgJ2tleXByZXNzJyxcblxuXHRcdC8vIEZvcm0gZXZlbnRzXG5cdFx0J2JsdXInLCAnY2hhbmdlJywgJ2ZvY3VzJywgJ2ZvY3VzaW4nLCAnZm9jdXNvdXQnLCAnc2VsZWN0JywgJ3N1Ym1pdCcsXG5cblx0XHQvLyBSYXcgdG91Y2ggZXZlbnRzXG5cdFx0J3RvdWNoc3RhcnQnLCAndG91Y2hlbmQnLCAndG91Y2htb3ZlJywgJ3RvdWNoY2FuY2VsJyxcblxuXHRcdC8vIE1hbnVmYWN0dXJlZCBldmVudHNcblx0XHQndG91Y2gnLFxuXG5cdFx0Ly8gVE9ETzpcblx0XHQncmlnaHRjbGljaycsICdjbGlja291dHNpZGUnXG5cdF1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gRE9NO1xuIiwiLyoqXG4gKiBVdGlsaXR5IEV2ZW50IHRvb2xraXRcbiAqL1xuXG52YXIgVXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJyk7XG5cbkV2ZW50cyA9IHtcblxuXHQvKipcblx0ICogUGFyc2VzIGEgZGljdGlvbmFyeSBvZiBldmVudHMgYW5kIG9wdGlvbmFsbHkgZmlsdGVycyBieSB0aGUgZXZlbnQgdHlwZS4gSWYgdGhlIGV2ZW50XG5cdCAqXG5cdCAqIEBwYXJhbSAge09iamVjdH0gZXZlbnRzICBbQSBCYWNrYm9uZS5WaWV3IGV2ZW50cyBvYmplY3RdXG5cdCAqIEBwYXJhbSAge09iamVjdH0gb3B0aW9ucyBbT3B0aW9ucyBvYmplY3QgdGhhdCBhbGxvd3MgdXMgdG8gZmlsdGVyIHBhcnNpbmcgdG8gY2VydGFpbiBldmVudFxuXHQgKiAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWVzXVxuXHQgKlxuXHQgKiBAcmV0dXJuIHtBcnJheX0gICAgICAgICAgW0FycmF5IGNvbnRhaW5pbmcgcGFyc2VkRXZlbnRzIHRoYXQgYXJlIG1hdGNoaW5nIGV2ZW50IGtleXNdXG5cdCAqL1xuXHRwYXJzZTogZnVuY3Rpb24gKGV2ZW50cywgb3B0aW9ucykge1xuXG5cdFx0dmFyIGV2ZW50S2V5cyA9IF8ua2V5cyhldmVudHMgfHwge30pLFxuXHRcdFx0bGltaXRFdmVudHMsXG5cdFx0XHRwYXJzZWRFdmVudHMgPSBbXTtcblxuXHRcdC8vIE9wdGlvbmFsbHkgZmlsdGVyIHVzaW5nIHNldCBvZiBhY2NlcHRhYmxlIGV2ZW50IHR5cGVzXG5cdFx0bGltaXRFdmVudHMgPSBvcHRpb25zLm9ubHk7XG5cdFx0ZXZlbnRLZXlzID0gXy5maWx0ZXIoZXZlbnRLZXlzLCBmdW5jdGlvbiBjaGVja0V2ZW50TmFtZSAoZXZlbnRLZXkpIHtcblxuXHRcdFx0Ly8gUGFyc2UgZXZlbnQgc3RyaW5nIGludG8gc2VtYW50aWMgcmVwcmVzZW50YXRpb25cblx0XHRcdHZhciBldmVudCA9IFV0aWxzLnBhcnNlRE9NRXZlbnQoZXZlbnRLZXkpO1xuXHRcdFx0cGFyc2VkRXZlbnRzLnB1c2goZXZlbnQpO1xuXG5cdFx0XHQvLyBPcHRpb25hbCBmaWx0ZXJcblx0XHRcdGlmIChsaW1pdEV2ZW50cykge1xuXHRcdFx0XHRyZXR1cm4gXy5jb250YWlucyhsaW1pdEV2ZW50cywgZXZlbnQubmFtZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBwYXJzZWRFdmVudHM7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFtnZXRFbGVtZW50cyBkZXNjcmlwdGlvbl1cblx0ICpcblx0ICogQHBhcmFtICB7QXJyYXl9IHNlbWFudGljRXZlbnRzIFtBIGxpc3Qgb2YgcGFyc2VkIGV2ZW50IG9iamVjdHNdXG5cdCAqIEBwYXJhbSAge0NvbXBvbmVudH0gY29udGV4dCAgICBbSW5zdGFuY2Ugb2YgYSBjb21wb25lbnQgdG8gdXNlIGFzIGEgc3RhcnRpbmcgcG9pbnQgZm9yXG5cdCAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhlIERPTSBxdWVyaWVzXVxuXHQgKlxuXHQgKiBAcmV0dXJuIHtBcnJheX0gICAgICAgICAgICAgICAgW0FuIGFycmF5IG9mIGpRdWVyeSBzZXQgb2YgbWF0Y2hlZCBlbGVtZW50c11cblx0ICovXG5cdGdldEVsZW1lbnRzOiBmdW5jdGlvbiAoc2VtYW50aWNFdmVudHMsIGNvbnRleHQpIHtcblxuXHRcdC8vIENvbnRleHQgb3B0aW9uYWxcblx0XHRjb250ZXh0ID0gY29udGV4dCB8fCB7ICQ6ICQgfTtcblxuXHRcdC8vIEl0ZXJhdGl2ZWx5IGJ1aWxkIGEgc2V0IG9mIGFmZmVjdGVkIGVsZW1lbnRzXG5cdFx0dmFyICRhZmZlY3RlZCA9ICQoKTtcblx0XHRfLmVhY2goc2VtYW50aWNFdmVudHMsIGZ1bmN0aW9uIGxvb2t1cEVsZW1lbnRzRm9yRXZlbnQgKGV2ZW50KSB7XG5cblx0XHRcdC8vIERldGVybWluZSBtYXRjaGVkIGVsZW1lbnRzXG5cdFx0XHQvLyBVc2UgZGVsZWdhdGUgc2VsZWN0b3IgaWYgc3BlY2lmaWVkXG5cdFx0XHQvLyBPdGhlcndpc2UsIGdyYWIgdGhlIGVsZW1lbnQgZm9yIHRoaXMgY29tcG9uZW50XG5cdFx0XHR2YXIgJG1hdGNoZWQgPVx0ZXZlbnQuc2VsZWN0b3IgP1xuXHRcdFx0XHRcdFx0XHRjb250ZXh0LiQoZXZlbnQuc2VsZWN0b3IpIDpcblx0XHRcdFx0XHRcdFx0Y29udGV4dC4kZWw7XG5cblx0XHRcdC8vIEFkZCBtYXRjaGVkIGVsZW1lbnRzIHRvIHNldFxuXHRcdFx0JGFmZmVjdGVkID0gJGFmZmVjdGVkLmFkZCggJG1hdGNoZWQgKTtcblx0XHR9LCB0aGlzKTtcblxuXHRcdHJldHVybiAkYWZmZWN0ZWQ7XG5cdH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gRXZlbnRzO1xuIiwiLyoqXG4gKiBUcmFuc2xhdGUgKipyaWdodC1oYW5kLXNpZGUgYWJicmV2aWF0aW9ucyoqIGludG8gZnVuY3Rpb25zIHRoYXQgcGVyZm9ybVxuICogdGhlIHByb3BlciBiZWhhdmlvcnMsIGUuZy5cbiAqXHRcdCNhYm91dF9tZVxuICpcdFx0JW1haW5NZW51Om9wZW5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHRyYW5zbGF0ZVNob3J0aGFuZCh2YWx1ZSwga2V5KSB7XG5cblx0dmFyIG1hdGNoZXMsIGZuO1xuXG5cdC8vIElmIHRoaXMgaXMgYW4gaW1wb3J0YW50LCBGUkFNRVdPUkstc3BlY2lmaWMgZGF0YSBrZXksXG5cdC8vIGFuZCBhIGZ1bmN0aW9uIHdhcyBzcGVjaWZpZWQsIHJ1biBpdCB0byBnZXQgaXRzIHZhbHVlXG5cdC8vICh0aGlzIGlzIHRvIGtlZXAgcGFyaXR5IHdpdGggQmFja2JvbmUncyBzaW1pbGFyIGZ1bmN0aW9uYWxpdHkpXG5cdGlmIChfLmlzRnVuY3Rpb24odmFsdWUpICYmIChrZXkgPT09ICdjb2xsZWN0aW9uJyB8fCBrZXkgPT09ICdtb2RlbCcpKSB7XG5cdFx0cmV0dXJuIHZhbHVlKCk7XG5cdH1cblxuXHQvLyBJZ25vcmUgb3RoZXIgbm9uLXN0cmluZ3Ncblx0aWYgKCFfLmlzU3RyaW5nKHZhbHVlKSkge1xuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxuXG5cdC8vIFJlZGlyZWN0cyB1c2VyIHRvIGNsaWVudC1zaWRlIFVSTCwgdy9vIGFmZmVjdGluZyBicm93c2VyIGhpc3Rvcnlcblx0Ly8gTGlrZSBjYWxsaW5nIGBCYWNrYm9uZS5oaXN0b3J5Lm5hdmlnYXRlKCcvZm9vJywgeyByZXBsYWNlOiB0cnVlIH0pYFxuXHRpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXiMjKC4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHRcdGZuID0gZnVuY3Rpb24gcmVkaXJlY3RBbmRDb3ZlclRyYWNrcygpIHtcblx0XHRcdHZhciB1cmwgPSBtYXRjaGVzWzFdO1xuXHRcdFx0RlJBTUVXT1JLLmhpc3RvcnkubmF2aWdhdGUodXJsLCB7XG5cdFx0XHRcdHRyaWdnZXI6IHRydWUsXG5cdFx0XHRcdHJlcGxhY2U6IHRydWVcblx0XHRcdH0pO1xuXHRcdH07XG5cdH1cblx0Ly8gTWV0aG9kIHRvIHJlZGlyZWN0IHVzZXIgdG8gYSBjbGllbnQtc2lkZSBVUkwsIHRoZW4gY2FsbCB0aGUgaGFuZGxlclxuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eIyguKlteLlxcc10rKS8pKSAmJiBtYXRjaGVzWzFdKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiBjaGFuZ2VVcmxGcmFnbWVudCgpIHtcblx0XHRcdHZhciB1cmwgPSBtYXRjaGVzWzFdO1xuXHRcdFx0RlJBTUVXT1JLLmhpc3RvcnkubmF2aWdhdGUodXJsLCB7XG5cdFx0XHRcdHRyaWdnZXI6IHRydWVcblx0XHRcdH0pO1xuXHRcdH07XG5cdH1cblx0Ly8gTWV0aG9kIHRvIHRyaWdnZXIgZ2xvYmFsIGV2ZW50XG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14oJS4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHRcdGZuID0gZnVuY3Rpb24gdHJpZ2dlckV2ZW50KCkge1xuXHRcdFx0dmFyIHRyaWdnZXIgPSBtYXRjaGVzWzFdO1xuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UodGhpcy5pZCArICcgOjogVHJpZ2dlcmluZyBldmVudCAoJyArIHRyaWdnZXIgKyAnKS4uLicpO1xuXHRcdFx0RlJBTUVXT1JLLnRyaWdnZXIodHJpZ2dlcik7XG5cdFx0fTtcblx0fVxuXHQvLyBNZXRob2QgdG8gZmlyZSBhIHRlc3QgYWxlcnRcblx0Ly8gKHVzZSBtZXNzYWdlLCBpZiBzcGVjaWZpZWQpXG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14hISFcXHMqKC4qW14uXFxzXSk/LykpKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiBiYW5nQWxlcnQoZSkge1xuXG5cdFx0XHQvLyBJZiBzcGVjaWZpZWQsIG1lc3NhZ2UgaXMgdXNlZCwgb3RoZXJ3aXNlICdBbGVydCB0cmlnZ2VyZWQhJ1xuXHRcdFx0dmFyIG1zZyA9IChtYXRjaGVzICYmIG1hdGNoZXNbMV0pIHx8ICdEZWJ1ZyBhbGVydCAoISEhKSB0cmlnZ2VyZWQhJztcblxuXHRcdFx0Ly8gT3RoZXIgZGlhZ25vc3RpYyBpbmZvcm1hdGlvblxuXHRcdFx0bXNnICs9ICdcXG5cXG5EaWFnbm9zdGljc1xcbj09PT09PT09PT09PT09PT09PT09PT09PVxcbic7XG5cdFx0XHRpZiAoZSAmJiBlLmN1cnJlbnRUYXJnZXQpIHtcblx0XHRcdFx0bXNnICs9ICdlLmN1cnJlbnRUYXJnZXQgOjogJyArIGUuY3VycmVudFRhcmdldDtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmlkKSB7XG5cdFx0XHRcdG1zZyArPSAndGhpcy5pZCA6OiAnICsgdGhpcy5pZDtcblx0XHRcdH1cblxuXHRcdFx0YWxlcnQobXNnKTtcblx0XHR9O1xuXHR9XG5cblx0Ly8gTWV0aG9kIHRvIGxvZyBhIG1lc3NhZ2UgdG8gdGhlIGNvbnNvbGVcblx0Ly8gKHVzZSBtZXNzYWdlLCBpZiBzcGVjaWZpZWQpXG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14+Pj5cXHMqKC4qW14uXFxzXSk/LykpKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiBsb2dNZXNzYWdlKGUpIHtcblxuXHRcdFx0Ly8gSWYgc3BlY2lmaWVkLCBtZXNzYWdlIGlzIHVzZWQsIG90aGVyd2lzZSB1c2UgZGVmYXVsdFxuXHRcdFx0dmFyIG1zZyA9IChtYXRjaGVzICYmIG1hdGNoZXNbMV0pIHx8ICdMb2cgbWVzc2FnZSAoPj4+KSB0cmlnZ2VyZWQhJztcblx0XHRcdEZSQU1FV09SSy5sb2cobXNnKTtcblx0XHR9O1xuXHR9XG5cblx0Ly8gTWV0aG9kIHRvIGF0dGFjaCB0aGUgc3BlY2lmaWVkIGNvbXBvbmVudC90ZW1wbGF0ZSB0byBhIHJlZ2lvblxuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eKC4rKUAoLipbXi5cXHNdKS8pKSAmJiBtYXRjaGVzWzFdICYmIG1hdGNoZXNbMl0pIHtcblx0XHRmbiA9IGZ1bmN0aW9uIGF0dGFjaFRlbXBsYXRlKCkge1xuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UodGhpcy5pZCArICcgOjogQXR0YWNoaW5nIGAnICsgbWF0Y2hlc1syXSArICdgIHRvIGAnICsgbWF0Y2hlc1sxXSArICdgLi4uJyk7XG5cblx0XHRcdHZhciByZWdpb24gPSBtYXRjaGVzWzFdO1xuXHRcdFx0dmFyIHRlbXBsYXRlID0gbWF0Y2hlc1syXTtcblx0XHRcdHRoaXNbcmVnaW9uXS5hdHRhY2godGVtcGxhdGUpO1xuXHRcdH07XG5cdH1cblxuXG5cdC8vIE1ldGhvZCB0byBhZGQgdGhlIHNwZWNpZmllZCBjbGFzc1xuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eXFwrXFxzKlxcLiguKlteLlxcc10pLykpICYmIG1hdGNoZXNbMV0pIHtcblx0XHRmbiA9IGZ1bmN0aW9uIGFkZENsYXNzKCkge1xuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UodGhpcy5pZCArICcgOjogQWRkaW5nIGNsYXNzICgnICsgbWF0Y2hlc1sxXSArICcpLi4uJyk7XG5cdFx0XHR0aGlzLiRlbC5hZGRDbGFzcyhtYXRjaGVzWzFdKTtcblx0XHR9O1xuXHR9XG5cdC8vIE1ldGhvZCB0byByZW1vdmUgdGhlIHNwZWNpZmllZCBjbGFzc1xuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eXFwtXFxzKlxcLiguKlteLlxcc10pLykpICYmIG1hdGNoZXNbMV0pIHtcblx0XHRmbiA9IGZ1bmN0aW9uIHJlbW92ZUNsYXNzKCkge1xuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UodGhpcy5pZCArICcgOjogUmVtb3ZpbmcgY2xhc3MgKCcgKyBtYXRjaGVzWzFdICsgJykuLi4nKTtcblx0XHRcdHRoaXMuJGVsLnJlbW92ZUNsYXNzKG1hdGNoZXNbMV0pO1xuXHRcdH07XG5cdH1cblx0Ly8gTWV0aG9kIHRvIHRvZ2dsZSB0aGUgc3BlY2lmaWVkIGNsYXNzXG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL15cXCFcXHMqXFwuKC4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHRcdGZuID0gZnVuY3Rpb24gdG9nZ2xlQ2xhc3MoKSB7XG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZSh0aGlzLmlkICsgJyA6OiBUb2dnbGluZyBjbGFzcyAoJyArIG1hdGNoZXNbMV0gKyAnKS4uLicpO1xuXHRcdFx0dGhpcy4kZWwudG9nZ2xlQ2xhc3MobWF0Y2hlc1sxXSk7XG5cdFx0fTtcblx0fVxuXG5cdC8vIFRPRE86XHRhbGxvdyBkZXNjZW5kYW50cyB0byBiZSBjb250cm9sbGVkIHZpYSBzaG9ydGhhbmRcblx0Ly9cdFx0XHRlLmcuIDogJ2xpLnJvdyAtLmhpZ2hsaWdodGVkJ1xuXHQvL1x0XHRcdHdvdWxkIHJlbW92ZSB0aGUgYGhpZ2hsaWdodGVkYCBjbGFzcyBmcm9tIHRoaXMuJCgnbGkucm93JylcblxuXG5cdC8vIElmIHNob3J0LWhhbmQgbWF0Y2hlZCwgcmV0dXJuIHRoZSBkZXJlZmVyZW5jZWQgZnVuY3Rpb25cblx0aWYgKGZuKSB7XG5cblx0XHRGUkFNRVdPUksudmVyYm9zZSgnSW50ZXJwcmV0aW5nIG1lYW5pbmcgZnJvbSBzaG9ydGhhbmQgOjogYCcgKyB2YWx1ZSArICdgLi4uJyk7XG5cblx0XHQvLyBDdXJyeSB0aGUgcmVzdWx0IGZ1bmN0aW9uIHdpdGggYW55IHN1ZmZpeCBtYXRjaGVzXG5cdFx0dmFyIGN1cnJpZWRGbiA9IGZuO1xuXG5cdFx0Ly8gVHJhaWxpbmcgYC5gIGluZGljYXRlcyBhbiBlLnN0b3BQcm9wYWdhdGlvbigpXG5cdFx0aWYgKHZhbHVlLm1hdGNoKC9cXC5cXHMqJC8pKSB7XG5cdFx0XHRjdXJyaWVkRm4gPSBmdW5jdGlvbiBhbmRTdG9wUHJvcGFnYXRpb24oZSkge1xuXG5cdFx0XHRcdC8vIEJpbmQgKHNvIGl0IGluaGVyaXRzIGNvbXBvbmVudCBjb250ZXh0KSBhbmQgY2FsbCBpbnRlcmlvciBmdW5jdGlvblxuXHRcdFx0XHRmbi5hcHBseSh0aGlzKTtcblxuXHRcdFx0XHQvLyB0aGVuIGltbWVkaWF0ZWx5IHN0b3AgZXZlbnQgYnViYmxpbmcvcHJvcGFnYXRpb25cblx0XHRcdFx0aWYgKGUgJiYgZS5zdG9wUHJvcGFnYXRpb24pIHtcblx0XHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdEZSQU1FV09SSy53YXJuKFxuXHRcdFx0XHRcdFx0dGhpcy5pZCArICcgOjogVHJhaWxpbmcgYC5gIHNob3J0aGFuZCB3YXMgdXNlZCB0byBpbnZva2UgYW4gJyArXG5cdFx0XHRcdFx0XHQnZS5zdG9wUHJvcGFnYXRpb24oKSwgYnV0IFwiJyArIHZhbHVlICsgJ1wiIHdhcyBub3QgdHJpZ2dlcmVkIGJ5IGEgRE9NIGV2ZW50IVxcbicgK1xuXHRcdFx0XHRcdFx0J1Byb2JhYmx5IGJlc3QgdG8gZG91YmxlLWNoZWNrIHRoaXMgd2FzIHdoYXQgeW91IG1lYW50IHRvIGRvLicpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH1cblxuXG5cdFx0cmV0dXJuIGN1cnJpZWRGbjtcblx0fVxuXG5cblx0Ly8gT3RoZXJ3aXNlLCBpZiBubyBzaG9ydC1oYW5kIG1hdGNoZWQsIHBhc3MgdGhlIG9yaWdpbmFsIHZhbHVlXG5cdC8vIHN0cmFpZ2h0IHRocm91Z2hcblx0cmV0dXJuIHZhbHVlO1xufTtcbiIsIi8qKlxuICogVXRpbGl0eSBmdW5jdGlvbnMgdGhhdCBhcmUgdXNlZCB0aHJvdWdob3V0IHRoZSBjb3JlLlxuICovXG5cbnZhciBET00gPSByZXF1aXJlKCcuL0RPTScpO1xuXG5VdGlscyA9IHtcblxuXHQvKipcblx0ICogR3JhYnMgdGhlIGlkIHhvciBkYXRhLWlkIGZyb20gYW4gSFRNTCBlbGVtZW50LlxuXHQgKlxuXHQgKiBAcGFyYW0gIHtET01FbGVtZW50fSBlbCAgICBbRWxlbWVudCB3aGVyZSB3ZSBhcmUgbG9va2luZyBmb3IgdGhlIGBpZGAgb3IgYGRhdGEtaWRgIGF0dHJdXG5cdCAqIEBwYXJhbSAge0Jvb2xlYW59IHJlcXVpcmVkIFtEZXRlcm1pbmVzIGlmIGl0IGlzIHJlcXVpcmVkIHRvIGZpbmQgYW4gYGlkYCBvciBgZGF0YS1pZGAgYXR0cl1cblx0ICpcblx0ICogQHJldHVybiB7U3RyaW5nfSAgICAgICAgICBcdFtJZGVudGlmaWNhdGlvbiBzdHJpbmcgdGhhdCB3YXMgZm91bmRdXG5cdCAqL1xuXHRlbDJpZDogZnVuY3Rpb24gKGVsLCByZXF1aXJlZCkge1xuXG5cdFx0dmFyIGlkID0gJChlbCkuYXR0cignaWQnKTtcblx0XHR2YXIgZGF0YUlkID0gJChlbCkuYXR0cignZGF0YS1pZCcpO1xuXHRcdHZhciBjb250ZW50c0lkID0gJChlbCkuYXR0cignY29udGVudHMnKTtcblxuXHRcdGlmIChpZCAmJiBkYXRhSWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihpZCArICcgOjogQ2Fubm90IHNldCBib3RoIGBpZGAgYW5kIGBkYXRhLWlkYCEgIFBsZWFzZSB1c2Ugb25lIG9yIHRoZSBvdGhlci4gIChkYXRhLWlkIGlzIHNhZmVzdCknKTtcblx0XHR9XG5cdFx0aWYgKHJlcXVpcmVkICYmICFpZCAmJiAhZGF0YUlkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIGlkIHNwZWNpZmllZCBpbiBlbGVtZW50IHdoZXJlIGl0IGlzIHJlcXVpcmVkOlxcbicgKyBlbCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGlkIHx8IGRhdGFJZCB8fCBjb250ZW50c0lkO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBSZWdleHAgdG8gbWF0Y2ggXCJmaXJzdCBjbGFzc1wiIERPTSBldmVudHNcblx0ICogKHRoZXNlIGFyZSBhbGxvd2VkIGluIHRoZSB0b3AgbGV2ZWwgb2YgYSBjb21wb25lbnQgZGVmaW5pdGlvbiBhcyBtZXRob2Qga2V5cylcblx0ICpcdFx0aS5lLiAvXihjbGlja3xob3ZlcnxibHVyfGZvY3VzKSggKC4rKSkvXG5cdCAqXHRcdFx0WzFdID0+IGV2ZW50IG5hbWVcblx0ICpcdFx0XHRbM10gPT4gc2VsZWN0b3Jcblx0ICovXG5cdCcvRE9NRXZlbnQvJzogbmV3IFJlZ0V4cCgnXignICsgXy5yZWR1Y2UoRE9NLmV2ZW50cyxcblx0XHRmdW5jdGlvbiBidWlsZFJlZ2V4cCAobWVtbywgZXZlbnROYW1lLCBpbmRleCkge1xuXG5cdFx0XHQvLyBPbWl0IGB8YCB0aGUgZmlyc3QgdGltZVxuXHRcdFx0aWYgKGluZGV4ID09PSAwKSB7XG5cdFx0XHRcdHJldHVybiBtZW1vICsgZXZlbnROYW1lO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gbWVtbyArICd8JyArIGV2ZW50TmFtZTtcblx0XHR9LCAnJykgK1xuXHRcdCcpKCAoLispKT8kJyksXG5cblx0LyoqXG5cdCAqIFJldHVybnMgd2hldGhlciB0aGUgc3BlY2lmaWVkIGV2ZW50IGtleSBtYXRjaGVzIGEgRE9NIGV2ZW50LlxuXHQgKlxuXHQgKiBAcGFyYW0gIHtTdHJpbmd9IGtleSBbS2V5IHRvIG1hdGNoIGFnYWluc3RdXG5cdCAqXG5cdFx0KiBpZiBubyBtYXRjaCBpcyBmb3VuZFxuXHQgKiBAcmV0dXJuIHtCb29sZWFufSBcdFx0W3JldHVybiBgZmFsc2VgXVxuXHQgKlxuXHQgKiBvdGhlcndpc2Vcblx0ICogQHJldHVybiB7T2JqZWN0fSAgXHRcdFtPYmplY3QgY29udGFpbmluZyB0aGUgYG5hbWVgIG9mIHRoZSBET00gZWxlbWVudCBhbmQgdGhlIGBzZWxlY3RvcmBdXG5cdCAqL1xuXHRwYXJzZURPTUV2ZW50OiBfLm1lbW9pemUoZnVuY3Rpb24gKGtleSkge1xuXG5cdFx0dmFyIG1hdGNoZXMgPSBrZXkubWF0Y2godGhpc1snL0RPTUV2ZW50LyddKTtcblxuXHRcdGlmICghbWF0Y2hlcyB8fCAhbWF0Y2hlc1sxXSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRuYW1lXHRcdDogbWF0Y2hlc1sxXSxcblx0XHRcdHNlbGVjdG9yXHQ6IG1hdGNoZXNbM11cblx0XHR9O1xuXHR9KSxcblxuXHQvKipcblx0ICogTWFwIGFuIG9iamVjdCdzIHZhbHVlcywgYW5kIHJldHVybiBhIHZhbGlkIG9iamVjdCAodGhpcyBmdW5jdGlvbiBpcyBoYW5keSBiZWNhdXNlXG5cdCAqIHVuZGVyc2NvcmUubWFwKCkgcmV0dXJucyBhIGxpc3QsIG5vdCBhbiBvYmplY3QuKVxuXHQgKlxuXHQgKiBAcGFyYW0gIHtPYmplY3R9IG9iaiAgICAgICAgIFx0W09qZWN0IHdob3MgdmFsdWVzIHlvdSB3YW50IHRvIG1hcF1cblx0ICogQHBhcmFtICB7RnVuY3Rpb259IHRyYW5zZm9ybUZuIFtGdW5jdGlvbiB0byB0cmFuc2Zvcm0gZWFjaCBvYmplY3QgdmFsdWUgYnldXG5cdCAqXG5cdCAqIEByZXR1cm4ge09iamVjdH0gICAgICAgICAgICAgXHRbTmV3IG9iamVjdCB3aXRoIHRoZSB2YWx1ZXMgbWFwcGVkXVxuXHQgKi9cblx0b2JqTWFwOiBmdW5jdGlvbiBvYmpNYXAgKG9iaiwgdHJhbnNmb3JtRm4pIHtcblx0XHRyZXR1cm4gXy5vYmplY3QoXy5rZXlzKG9iaiksIF8ubWFwKG9iaiwgdHJhbnNmb3JtRm4pKTtcblx0fVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBVdGlscztcbiJdfQ==
;