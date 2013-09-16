;(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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

	var self = this;

	this.listenTo(FRAMEWORK, 'all', function (eRoute) {

		// Trim off all but the first argument to pass through to handler
		var args = Array.prototype.slice.call(arguments);
		args.shift();

		// Iterate through each subscription on this component
		// and listen for the specified global events
		_.each(self.subscriptions, function(handler, matchPattern) {

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
			handler.apply(self, _.union(args, params));

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
		var $regions = this.$('region, [data-region]');
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
		close.call(this);
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
	// _.each(this.events, function(handler, eventString) {
	// 	console.log(handler, eventString);
	// 	_.bind(handler, this);
	// }, this);
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

},{"../utils/DOM":25,"./helpers":4}],9:[function(require,module,exports){
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
var Utils = require('../utils/utils');
var Events = require('../utils/events');

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
	componentDef = Utils.objMap(componentDef, translateShorthand);


	// and events object
	if (componentDef.events) {
		componentDef.events = Utils.objMap(
			componentDef.events,
			translateShorthand
		);
	}

	// and afterChange bindings
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

		// Detect DOM events and smash them into the events hash
		var matchedDOMEvents = key.match(Events['/DOMEvent/']);
		if (matchedDOMEvents) {
			var eventName = matchedDOMEvents[1];
			var delegateSelector = matchedDOMEvents[3];

			// Stow them in events hash
			componentPrototype.prototype.events = componentPrototype.prototype.events || {};
			componentPrototype.prototype.events[key] = handler;
		}

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

},{"../utils/events":26,"../utils/shorthand":27,"../utils/utils":28}],14:[function(require,module,exports){
/**
 * Collect any regions with the default component set from the DOM.
 */

module.exports = function collectRegions () {

	// Provide backwards compatibility for legacy notation
	$('region[default],region[template],[data-region][default],[data-region][template]').each(function() {
		$e = $(this);
		var componentId = $e.attr('default') || $e.attr('template');
		$e.attr('contents', componentId);
	});

	// Now instantiate the appropriate default component in each
	// region with a specified template/component
	$('region[contents],[data-region][contents]').each(function() {
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

},{"../utils/utils":28}],16:[function(require,module,exports){
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
var setupRouter = require('../router/index');


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
		setupRouter();
		FRAMEWORK.history.start(_.defaults({
			pushState: undefined,
			hashChange: undefined,
			root: undefined
		}, options));

		if (cb) cb();
	});
};

},{"../define/buildDefinition":9,"../logger/index":11,"../router/index":24,"./buildPrototype":13,"./collectRegions":14,"./collectTemplates":15}],17:[function(require,module,exports){
/**
 * region.append( componentId, [properties] )
 *
 * Calls insert() at last position
 */
module.exports = function append(componentId, properties) {
	// Insert at last position
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

},{"../utils/utils":28}],21:[function(require,module,exports){
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

	// Save reference to parentRegion
	component.parentRegion = this;

	// Render component into this region
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
 * Sets up the FRAMEWORK router.
 */
module.exports = function routerSetup() {

	// Wildcard routes to global event delegator
	var router = new FRAMEWORK.Router();
	router.route(/(.*)/, 'route', function (route) {

		// Normalize home routes (# or null) to ''
		if (!route) {
			route = '';
		}

		// Trigger route
		FRAMEWORK.trigger('#' + route);
	});

	// Expose `navigate()` method
	FRAMEWORK.navigate = FRAMEWORK.history.navigate;
}

},{}],25:[function(require,module,exports){
/**
 * Bare-bones DOM/UI utilities
 */

var Events = require('./events');

var DOM = {

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

		FRAMEWORK.verbose(
			component.id + ' :: ' +
			'Disabled user text selection on elements w/ click/touch events:',
			clickOrTouchEvents,
			$affected
		);
	}
};

module.exports = DOM;

},{"./events":26}],26:[function(require,module,exports){
/**
 * Utility Event toolkit
 */

var Utils = require('./utils.js');

var Events = {

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
			var event = Events.parseDOMEvent(eventKey);
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
	},



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
	parseDOMEvent: _.memoize(function(key) {

		var matches = key.match(this['/DOMEvent/']);

		if (!matches || !matches[1]) {
			return false;
		}

		return {
			name: matches[1],
			selector: matches[3]
		};
	}),


	/**
	 * Supported "first-class" DOM events.
	 * @type {Array}
	 */
	names: [

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




/**
 * Regexp to match "first class" DOM events
 * (these are allowed in the top level of a component definition as method keys)
 *		i.e. /^(click|hover|blur|focus)( (.+))/
 *			[1] => event name
 *			[3] => selector
 */

Events['/DOMEvent/'] = new RegExp('^(' + _.reduce(Events.names,
	function buildRegexp(memo, eventName, index) {

		// Omit `|` the first time
		if (index === 0) {
			return memo + eventName;
		}

		return memo + '|' + eventName;
	}, '') +
')( (.+))?$');

module.exports = Events;

},{"./utils.js":28}],27:[function(require,module,exports){
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

},{}],28:[function(require,module,exports){
/**
 * Utility functions that are used throughout the core.
 */

var Utils = {

	/**
	 * Grabs the id xor data-id from an HTML element.
	 *
	 * @param  {DOMElement} el    [Element where we are looking for the `id` or `data-id` attr]
	 * @param  {Boolean} required [Determines if it is required to find an `id` or `data-id` attr]
	 *
	 * @return {String}          	[Identification string that was found]
	 */
	el2id: function(el, required) {

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
	 * Map an object's values, and return a valid object (this function is handy because
	 * underscore.map() returns a list, not an object.)
	 *
	 * @param  {Object} obj         	[Oject whos values you want to map]
	 * @param  {Function} transformFn [Function to transform each object value by]
	 *
	 * @return {Object}             	[New object with the values mapped]
	 */
	objMap: function objMap(obj, transformFn) {
		return _.object(_.keys(obj), _.map(obj, transformFn));
	}
};

module.exports = Utils;
},{}]},{},[1])
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvY29kZS9tYXN0L2xpYi9zcmMvYnVpbGQuanMiLCIvY29kZS9tYXN0L2xpYi9zcmMvY29tcG9uZW50L2JpbmRFdmVudHMuanMiLCIvY29kZS9tYXN0L2xpYi9zcmMvY29tcG9uZW50L2Nsb3NlLmpzIiwiL2NvZGUvbWFzdC9saWIvc3JjL2NvbXBvbmVudC9oZWxwZXJzLmpzIiwiL2NvZGUvbWFzdC9saWIvc3JjL2NvbXBvbmVudC9pbmRleC5qcyIsIi9jb2RlL21hc3QvbGliL3NyYy9jb21wb25lbnQvbGlmZWN5Y2xlRXZlbnRzLmpzIiwiL2NvZGUvbWFzdC9saWIvc3JjL2NvbXBvbmVudC9saWZlY3ljbGVIb29rcy5qcyIsIi9jb2RlL21hc3QvbGliL3NyYy9jb21wb25lbnQvcmVuZGVyLmpzIiwiL2NvZGUvbWFzdC9saWIvc3JjL2RlZmluZS9idWlsZERlZmluaXRpb24uanMiLCIvY29kZS9tYXN0L2xpYi9zcmMvZGVmaW5lL2luZGV4LmpzIiwiL2NvZGUvbWFzdC9saWIvc3JjL2xvZ2dlci9pbmRleC5qcyIsIi9jb2RlL21hc3QvbGliL3NyYy9sb2dnZXIvc2V0dXAuanMiLCIvY29kZS9tYXN0L2xpYi9zcmMvcmFpc2UvYnVpbGRQcm90b3R5cGUuanMiLCIvY29kZS9tYXN0L2xpYi9zcmMvcmFpc2UvY29sbGVjdFJlZ2lvbnMuanMiLCIvY29kZS9tYXN0L2xpYi9zcmMvcmFpc2UvY29sbGVjdFRlbXBsYXRlcy5qcyIsIi9jb2RlL21hc3QvbGliL3NyYy9yYWlzZS9pbmRleC5qcyIsIi9jb2RlL21hc3QvbGliL3NyYy9yZWdpb24vYXBwZW5kLmpzIiwiL2NvZGUvbWFzdC9saWIvc3JjL3JlZ2lvbi9hdHRhY2guanMiLCIvY29kZS9tYXN0L2xpYi9zcmMvcmVnaW9uL2VtcHR5LmpzIiwiL2NvZGUvbWFzdC9saWIvc3JjL3JlZ2lvbi9mcm9tRWxlbWVudC5qcyIsIi9jb2RlL21hc3QvbGliL3NyYy9yZWdpb24vaW5kZXguanMiLCIvY29kZS9tYXN0L2xpYi9zcmMvcmVnaW9uL2luc2VydC5qcyIsIi9jb2RlL21hc3QvbGliL3NyYy9yZWdpb24vcmVtb3ZlLmpzIiwiL2NvZGUvbWFzdC9saWIvc3JjL3JvdXRlci9pbmRleC5qcyIsIi9jb2RlL21hc3QvbGliL3NyYy91dGlscy9ET00uanMiLCIvY29kZS9tYXN0L2xpYi9zcmMvdXRpbHMvZXZlbnRzLmpzIiwiL2NvZGUvbWFzdC9saWIvc3JjL3V0aWxzL3Nob3J0aGFuZC5qcyIsIi9jb2RlL21hc3QvbGliL3NyYy91dGlscy91dGlscy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0VBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDYkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9KQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIE1hc3QgYnVpbGQgZmlsZS4gVGhlIG1haW4gZmlsZVxuICovXG5cbnZhciBkZWZpbmUgPSByZXF1aXJlKCcuL2RlZmluZS9pbmRleCcpO1xudmFyIFJlZ2lvbiA9IHJlcXVpcmUoJy4vcmVnaW9uL2luZGV4Jyk7XG52YXIgQ29tcG9uZW50ID0gcmVxdWlyZSgnLi9jb21wb25lbnQvaW5kZXgnKTtcbnZhciByYWlzZSA9IHJlcXVpcmUoJy4vcmFpc2UvaW5kZXgnKTtcblxuKGZ1bmN0aW9uKGdsb2JhbCwgZnJhbWV3b3JrTmFtZSwgJCwgXywgQmFja2JvbmUsIHVuZGVmaW5lZCkge1xuXG5cdC8vIFVzZSBjdXN0b20gZnJhbWV3b3JrSWQgaWYgcHJvdmlkZWQgb3IgZGVmYXVsdCB0byAnRlJBTUVXT1JLJ1xuXHR2YXIgZnJhbWV3b3JrSWQgPSBmcmFtZXdvcmtOYW1lIHx8ICdGUkFNRVdPUksnO1xuXG5cdC8vIFVzZSBwcm92aWRlZCBCYWNrYm9uZSBvciBkZWZhdWx0IHRvIGdsb2JhbFxuXHRCYWNrYm9uZSA9IEJhY2tib25lIHx8IGdsb2JhbC5CYWNrYm9uZTtcblxuXHQvLyBVc2UgcHJvdmlkZWQgJCBvciBkZWZhdWx0IHRvIGdsb2JhbFxuXHQkID0gJCB8fCBnbG9iYWwuJDtcblx0XG5cdC8vIFVzZSBwcm92aWRlZCBfIG9yIGRlZmF1bHQgdG8gZ2xvYmFsXG5cdF8gPSBfIHx8IGdsb2JhbC5fO1xuXG5cdC8vIFN0YXJ0IG9mZiB3aXRoIEJhY2tib25lIGFuZCBidWlsZCBvbiB0b3Agb2YgaXRcblx0Z2xvYmFsW2ZyYW1ld29ya0lkXSA9IEJhY2tib25lO1xuXG5cdC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cdC8vIEhhY2shXG5cdC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cdEZSQU1FV09SSyA9IGdsb2JhbFtmcmFtZXdvcmtJZF07XG5cblx0Ly8gU3RhcnQgdy8gZW1wdHkgdGVtcGxhdGVzLCBjb21wb25lbnRzLCBhbmQgZGF0YVxuXHRGUkFNRVdPUksudGVtcGxhdGVzID0ge307XG5cdEZSQU1FV09SSy5jb21wb25lbnRzID0ge307XG5cdEZSQU1FV09SSy5kYXRhID0ge307XG5cdEZSQU1FV09SSy5fZGVmaW5lUXVldWUgPSBbXTtcblxuXHQvLyBSZWdpb24gY2FjaGVcblx0RlJBTUVXT1JLLnJlZ2lvbnMgPSB7fTtcblxuXHQvLyBTaG9ydGN1dCBkZWZhdWx0c1xuXHRGUkFNRVdPUksuc2hvcnRjdXQgPSB7fTtcblx0RlJBTUVXT1JLLnNob3J0Y3V0LnRlbXBsYXRlID0gdHJ1ZTtcblx0RlJBTUVXT1JLLnNob3J0Y3V0LmNvdW50ID0gdHJ1ZTtcblxuXG5cdEZSQU1FV09SSy5SZWdpb24gPSBSZWdpb247XG5cdEZSQU1FV09SSy5Db21wb25lbnQgPSBDb21wb25lbnQ7XG5cblx0RlJBTUVXT1JLLmRlZmluZSA9IGRlZmluZTtcblx0RlJBTUVXT1JLLnJhaXNlID0gcmFpc2U7XG5cbn0pXG5cblxuXG4vKipcbiAqIElmIHlvdSB3YW50IHRvIHBhc3MgaW4gYSBjdXN0b20gRnJhbWV3b3JrIG5hbWUsXG4gKiBhIEJhY2tib25lIGluc3RhbmNlLCBhbiB1bmRlcnNjb3JlL2xvZGFzaCBpbnN0YW5jZSxcbiAqIG9yIGEgalF1ZXJ5IGluc3RhbmNlLCB5b3UgY2FuIGRvIHNvIGFzIG9wdGlvbmFsIHBhcmFtZXRlcnMgXG4gKiBoZXJlLCBlLmcuXG4gKiAod2luZG93LCAnRm9vJywgJCwgXywgQmFja2JvbmUpXG4gKlxuICogT3RoZXJ3aXNlLCBqdXN0IHBhc3MgaW4gYHdpbmRvd2AgYW5kICdGUkFNRVdPUksnLCB3aW5kb3cuJCwgXG4gKiB3aW5kb3cuXywgd2luZG93LkJhY2tib25lIHdpbGwgYmUgdXNlZCwgZS5nLlxuICogKHdpbmRvdylcbiAqL1xuXG4od2luZG93LCAnRWlrb24nKTtcblxuXG5cblxuXG5cbiIsIi8qKlxuICogQmluZCBjb2xsZWN0aW9uIGV2ZW50cyB0byBsaWZlY3ljbGUgZXZlbnQgaGFuZGxlcnNcbiAqL1xuZXhwb3J0cy5jb2xsZWN0aW9uRXZlbnRzID0gZnVuY3Rpb24oKSB7XG5cdC8vIEJpbmQgdG8gY29sbGVjdGlvbiBldmVudHMgaWYgb25lIHdhcyBwYXNzZWQgaW5cblx0aWYgKHRoaXMuY29sbGVjdGlvbikge1xuXG5cdFx0Ly8gTGlzdGVuIHRvIGV2ZW50c1xuXHRcdHRoaXMubGlzdGVuVG8odGhpcy5jb2xsZWN0aW9uLCAnYWRkJywgdGhpcy5hZnRlckFkZCk7XG5cdFx0dGhpcy5saXN0ZW5Ubyh0aGlzLmNvbGxlY3Rpb24sICdyZW1vdmUnLCB0aGlzLmFmdGVyUmVtb3ZlKTtcblx0XHR0aGlzLmxpc3RlblRvKHRoaXMuY29sbGVjdGlvbiwgJ3Jlc2V0JywgdGhpcy5hZnRlclJlc2V0KTtcblx0fVxufTtcblxuLyoqXG4gKiBCaW5kIG1vZGVsIGV2ZW50cyB0byBsaWZlY3ljbGUgZXZlbnQgaGFuZGxlcnMgYW5kIGFsc28gYWxsb3dzIGZvciBoYW5kbGVycyB0byBmaXJlXG4gKiBvbiBjZXJ0YWluIG1vZGVsIGF0dHJpYnV0ZSBjaGFuZ2VzLlxuICovXG5leHBvcnRzLm1vZGVsRXZlbnRzID0gZnVuY3Rpb24oKSB7XG5cdGlmICh0aGlzLm1vZGVsKSB7XG5cblx0XHQvLyBMaXN0ZW4gZm9yIGFueSBhdHRyaWJ1dGUgY2hhbmdlc1xuXHRcdC8vIGUuZy5cblx0XHQvLyAuYWZ0ZXJDaGFuZ2UobW9kZWwsIG9wdGlvbnMpXG5cdFx0Ly9cblx0XHR0aGlzLmxpc3RlblRvKHRoaXMubW9kZWwsICdjaGFuZ2UnLCBmdW5jdGlvbiBtb2RlbENoYW5nZWQgKG1vZGVsLCBvcHRpb25zKSB7XG5cdFx0XHRpZiAoXy5pc0Z1bmN0aW9uKHRoaXMuYWZ0ZXJDaGFuZ2UpKSB7XG5cdFx0XHRcdHRoaXMuYWZ0ZXJDaGFuZ2UobW9kZWwsIG9wdGlvbnMpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Ly8gTGlzdGVuIGZvciBzcGVjaWZpYyBhdHRyaWJ1dGUgY2hhbmdlc1xuXHRcdC8vIGUuZy5cblx0XHQvLyAuYWZ0ZXJDaGFuZ2UuY29sb3IobW9kZWwsIHZhbHVlLCBvcHRpb25zKVxuXHRcdC8vXG5cdFx0aWYgKF8uaXNPYmplY3QodGhpcy5hZnRlckNoYW5nZSkpIHtcblx0XHRcdF8uZWFjaCh0aGlzLmFmdGVyQ2hhbmdlLCBmdW5jdGlvbiAoaGFuZGxlciwgYXR0ck5hbWUpIHtcblxuXHRcdFx0XHQvLyBDYWxsIGhhbmRsZXIgd2l0aCBuZXdWYWwgdG8ga2VlcCBhcmd1bWVudHMgc3RyYWlnaHRmb3J3YXJkXG5cdFx0XHRcdHRoaXMubGlzdGVuVG8odGhpcy5tb2RlbCwgJ2NoYW5nZTonICsgYXR0ck5hbWUsIGZ1bmN0aW9uIGF0dHJDaGFuZ2VkIChtb2RlbCwgbmV3VmFsKSB7XG5cdFx0XHRcdFx0aGFuZGxlci5jYWxsKHNlbGYsIG5ld1ZhbCk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHR9LCB0aGlzKTtcblx0XHR9XG5cdH1cbn07XG5cbi8qKlxuICogTGlzdGVucyBmb3IgYW5kIHJ1bnMgaGFuZGxlcnMgb24gZ2xvYmFsIGV2ZW50cyB0aGF0IGFyZSBsaXN0ZW5lZCBmb3Igb24gYSBjb21wb25lbnQuXG4gKi9cbmV4cG9ydHMuZ2xvYmFsVHJpZ2dlcnMgPSBmdW5jdGlvbigpIHtcblxuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0dGhpcy5saXN0ZW5UbyhGUkFNRVdPUkssICdhbGwnLCBmdW5jdGlvbiAoZVJvdXRlKSB7XG5cblx0XHQvLyBUcmltIG9mZiBhbGwgYnV0IHRoZSBmaXJzdCBhcmd1bWVudCB0byBwYXNzIHRocm91Z2ggdG8gaGFuZGxlclxuXHRcdHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcblx0XHRhcmdzLnNoaWZ0KCk7XG5cblx0XHQvLyBJdGVyYXRlIHRocm91Z2ggZWFjaCBzdWJzY3JpcHRpb24gb24gdGhpcyBjb21wb25lbnRcblx0XHQvLyBhbmQgbGlzdGVuIGZvciB0aGUgc3BlY2lmaWVkIGdsb2JhbCBldmVudHNcblx0XHRfLmVhY2goc2VsZi5zdWJzY3JpcHRpb25zLCBmdW5jdGlvbihoYW5kbGVyLCBtYXRjaFBhdHRlcm4pIHtcblxuXHRcdFx0Ly8gR3JhYiByZWdleCBhbmQgcGFyYW0gcGFyc2luZyBsb2dpYyBmcm9tIEJhY2tib25lIGNvcmVcblx0XHRcdHZhciBleHRyYWN0UGFyYW1zID0gQmFja2JvbmUuUm91dGVyLnByb3RvdHlwZS5fZXh0cmFjdFBhcmFtZXRlcnMsXG5cdFx0XHRcdGNhbGN1bGF0ZVJlZ2V4ID0gQmFja2JvbmUuUm91dGVyLnByb3RvdHlwZS5fcm91dGVUb1JlZ0V4cDtcblxuXHRcdFx0Ly8gVHJpbSB0cmFpbGluZ1xuXHRcdFx0bWF0Y2hQYXR0ZXJuID0gbWF0Y2hQYXR0ZXJuLnJlcGxhY2UoL1xcLyokL2csICcnKTtcblx0XHRcdC8vIGFuZCBlciBzb3J0IG9mLi4gbGVhZGluZy4uIHNsYXNoZXNcblx0XHRcdG1hdGNoUGF0dGVybiA9IG1hdGNoUGF0dGVybi5yZXBsYWNlKC9eKFsjfiVdKVxcLyovZywgJyQxJyk7XG5cdFx0XHQvLyBUT0RPOiBvcHRpbWl6YXRpb24tIHRoaXMgcmVhbGx5IG9ubHkgaGFzIHRvIGJlIGRvbmUgb25jZSwgb24gcmFpc2UoKSwgd2Ugc2hvdWxkIGRvIHRoYXRcblxuXG5cdFx0XHQvLyBDb21lIHVwIHdpdGggcmVnZXggZm9yIHRoaXMgbWF0Y2hQYXR0ZXJuXG5cdFx0XHR2YXIgcmVnZXggPSBjYWxjdWxhdGVSZWdleChtYXRjaFBhdHRlcm4pO1xuXG5cdFx0XHQvLyBJZiB0aGlzIG1hdGNoUGF0ZXJuIGlzIHRoaXMgaXMgbm90IGEgbWF0Y2ggZm9yIHRoZSBldmVudCxcblx0XHRcdC8vIGBjb250aW51ZWAgaXQgYWxvbmcgdG8gaXQgY2FuIHRyeSB0aGUgbmV4dCBtYXRjaFBhdHRlcm5cblx0XHRcdGlmICghZVJvdXRlLm1hdGNoKHJlZ2V4KSkgcmV0dXJuO1xuXG5cdFx0XHQvLyBQYXJzZSBwYXJhbWV0ZXJzIGZvciB1c2UgYXMgYXJncyB0byB0aGUgaGFuZGxlclxuXHRcdFx0Ly8gKG9yIGFuIGVtcHR5IGxpc3QgaWYgbm9uZSBleGlzdClcblx0XHRcdHZhciBwYXJhbXMgPSBleHRyYWN0UGFyYW1zKHJlZ2V4LCBlUm91dGUpO1xuXG5cdFx0XHQvLyBIYW5kbGUgc3RyaW5nIHJlZGlyZWN0cyB0byBmdW5jdGlvbiBuYW1lc1xuXHRcdFx0aWYgKCFfLmlzRnVuY3Rpb24oaGFuZGxlcikpIHtcblx0XHRcdFx0aGFuZGxlciA9IHNlbGZbaGFuZGxlcl07XG5cblx0XHRcdFx0aWYgKCFoYW5kbGVyKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgdHJpZ2dlciBzdWJzY3JpcHRpb24gYmVjYXVzZSBvZiB1bmtub3duIGhhbmRsZXI6ICcgKyBoYW5kbGVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBCaW5kIGNvbnRleHQgYW5kIGFyZ3VtZW50cyB0byBzdWJzY3JpcHRpb24gaGFuZGxlclxuXHRcdFx0aGFuZGxlci5hcHBseShzZWxmLCBfLnVuaW9uKGFyZ3MsIHBhcmFtcykpO1xuXG5cdFx0fSk7XG5cdH0pO1xufTtcbiIsIi8qKlxuICogU2FmZWx5IHphcCBldmVyeSB0cmFjZSBhYm91dCB0aGlzIGNvbXBvbmVudCBmcm9tIG1lbW9yeS5cbiAqL1xuXG52YXIgaGVscGVycyA9IHJlcXVpcmUoJy4vaGVscGVycycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNsb3NlKCkge1xuXG5cdEZSQU1FV09SSy5kZWJ1ZygnQ2xvc2VkICcgKyB0aGlzLmlkICsgJyBjb21wb25lbnQuJyk7XG5cdHZhciBzZWxmID0gdGhpcztcblxuXHQvLyBDYW5jZWwgY3VycmVudCByZW5kZXIgYW5kIGNsb3NlIGpvYnMsIGlmIHRoZXkncmUgcnVubmluZ1xuXHRpZiAodGhpcy5fcmVuZGVyaW5nKSB7XG5cdFx0dGhpcy5jYW5jZWxSZW5kZXIoKTtcblx0XHRzZWxmLl9yZW5kZXJpbmcgPSBmYWxzZTtcblx0fVxuXHRpZiAodGhpcy5fY2xvc2luZykge1xuXHRcdHRoaXMuY2FuY2VsQ2xvc2UoKTtcblx0XHRzZWxmLl9jbG9zaW5nID0gZmFsc2U7XG5cdH1cblxuXHQvLyBMb2NrIGFjY2VzcyB0byBjbG9zZSgpXG5cdHRoaXMuX2Nsb3NpbmcgPSB0cnVlO1xuXG5cdHRoaXMuYmVmb3JlQ2xvc2UoZnVuY3Rpb24gKCkge1xuXG5cdFx0Ly8gPiBOT1RFOiBgdGhpcy5fY2xvc2luZz1mYWxzZWAgY2FuIGFuZCBwcm9iYWJseSBzaG91bGQgYmUgcmVtb3ZlZCxcblx0XHQvLyA+IHNpbmNlIG11dGV4IGlzIHVubmVjZXNzYXJ5IG5vdyB0aGF0IHRoZSBjb21wb25lbnQgaXMgdXAgZm9yIGdhcmJhZ2UgY29sbGVjdGlvblxuXHRcdC8vID4gV2FpdGluZyB0byBkbyB0aGlzIHVudGlsIGl0IGNhbiBiZSB0ZXN0ZWQgZnVydGhlclxuXG5cdFx0Ly8gVW5sb2NrIGNsb3NlKClcblx0XHRzZWxmLl9jbG9zaW5nID0gZmFsc2U7XG5cblx0XHQvLyBTdG9wIGxpc3RlbmluZyB0byBhbGwgZ2xvYmFsIHRyaWdnZXJzICglfCMpXG5cblx0XHQvLyBDbG9zZSBhbGwgY2hpbGQgY29tcG9uZW50c1xuXG5cdFx0aGVscGVycy5lbXB0eUFsbFJlZ2lvbnMuY2FsbChzZWxmKTtcblxuXHRcdC8vIENhbGwgbmF0aXZlIGBCYWNrYm9uZS5WaWV3LnByb3RvdHlwZS5yZW1vdmUoKWBcblx0XHQvLyB0byB1bmRlbGVnYXRlIGV2ZW50cywgZXRjLlxuXHRcdHNlbGYucmVtb3ZlKCk7XG5cblx0fSk7XG59O1xuIiwiLyoqXG4gKiBIZWxwZXIgZnVuY3Rpb25zIHVzZWQgYnkgY29tcG9uZW50cy9cbiAqL1xuXG52YXIgaGVscGVycyA9IG1vZHVsZS5leHBvcnRzID0ge1xuXG5cdC8qKlxuICogSWYgYW55IHJlZ2lvbnMgZXhpc3QgaW4gdGhpcyBjb21wb25lbnQsXG4gKiBlbXB0eSB0aGVtLCBhbmQgdGhlbiBkZWxldGUgdGhlbVxuICovXG5cdGVtcHR5QWxsUmVnaW9uczogZnVuY3Rpb24oKSB7XG5cdFx0Xy5lYWNoKHRoaXMucmVnaW9ucywgZnVuY3Rpb24gKHJlZ2lvbiwga2V5KSB7XG5cdFx0XHRyZWdpb24uZW1wdHkoKTtcblx0XHRcdGRlbGV0ZSB0aGlzLnJlZ2lvbnNba2V5XTtcblx0XHR9LCB0aGlzKTtcblx0fSxcblxuXHQvKipcblx0ICogSW5zdGFudGlhdGUgcmVnaW9uIGNvbXBvbmVudHMgYW5kIGFwcGVuZCBhbnkgZGVmYXVsdFxuXHQgKiB0ZW1wbGF0ZXMvY29tcG9uZW50cyB0byB0aGUgRE9NXG5cdCAqL1xuXHRyZW5kZXJSZWdpb25zOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0XHRoZWxwZXJzLmVtcHR5QWxsUmVnaW9ucygpO1xuXG5cdFx0Ly8gRGV0ZWN0IGNoaWxkIHJlZ2lvbnMgaW4gdGVtcGxhdGVcblx0XHR2YXIgJHJlZ2lvbnMgPSB0aGlzLiQoJ3JlZ2lvbiwgW2RhdGEtcmVnaW9uXScpO1xuXHRcdCRyZWdpb25zLmVhY2goZnVuY3Rpb24gKGksIGVsKSB7XG5cblx0XHRcdC8vIFByb3ZpZGUgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkgZm9yXG5cdFx0XHQvLyBgZGVmYXVsdGAsIGBjb250ZW50c2AgYW5kIGB0ZW1wbGF0ZWAgbm90YXRpb25cblx0XHRcdHZhciBjb21wb25lbnRJZCA9ICQoZWwpLmF0dHIoJ2RlZmF1bHQnKTtcblx0XHRcdGNvbXBvbmVudElkID0gY29tcG9uZW50SWQgfHwgJChlbCkuYXR0cignY29udGVudHMnKTtcblx0XHRcdGNvbXBvbmVudElkID0gY29tcG9uZW50SWQgfHwgJChlbCkuYXR0cigndGVtcGxhdGUnKTtcblx0XHRcdCQoZWwpLmF0dHIoJ2NvbnRlbnRzJywgY29tcG9uZW50SWQpO1xuXG5cdFx0XHQvLyBHZW5lcmF0ZSBhIHJlZ2lvbiBpbnN0YW5jZSBmcm9tIHRoZSBlbGVtZW50XG5cdFx0XHQvLyAobW9kaWZ5aW5nIHRoZSBET00gYXMgbmVjZXNzYXJ5KVxuXHRcdFx0dmFyIHJlZ2lvbiA9IEZSQU1FV09SSy5SZWdpb24uZnJvbUVsZW1lbnQoZWwsIHNlbGYpO1xuXG5cdFx0XHQvLyBLZWVwIHRyYWNrIG9mIHJlZ2lvbnMsIHNpbmNlIHdlIGFyZSB0aGUgcGFyZW50IGNvbXBvbmVudFxuXHRcdFx0c2VsZi5yZWdpb25zW3JlZ2lvbi5pZF0gPSByZWdpb247XG5cblx0XHRcdC8vIEFzIGxvbmcgYXMgdGhlcmUgYXJlIG5vIGNvbGxpc2lvbnMsXG5cdFx0XHQvLyBwcm92aWRlIGEgZnJpZW5kbHkgcmVmZXJlbmNlIHRvIHRoZSByZWdpb24gb24gdGhlIHRvcCBsZXZlbCBvZiB0aGUgY29sbGVjdGlvblxuXHRcdFx0aWYgKCFzZWxmW3JlZ2lvbi5pZF0pIHtcblx0XHRcdFx0c2VsZltyZWdpb24uaWRdID0gcmVnaW9uO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0IHRlbXBsYXRlIEhUTUwgYW5kIGRhdGEgaW50byBhIGNvbXBpbGVkICR0ZW1wbGF0ZVxuXHQgKi9cblx0Y29tcGlsZVRlbXBsYXRlOiBmdW5jdGlvbigpIHtcblxuXHRcdC8vIENyZWF0ZSB0ZW1wbGF0ZSBkYXRhIGNvbnRleHQgYnkgcHJvdmlkaW5nIGFjY2VzcyB0byB0aGUgZ2xvYmFsIERhdGEgb2JqZWN0LFxuXHRcdC8vIEFsc28gZm9sZCBpbiB0aGUgbW9kZWwgYXNzb2NpYXRlZCB3aXRoIHRoaXMgY29tcG9uZW50LCBpZiB0aGVyZSBpcyBvbmVcblx0XHR2YXIgdGVtcGxhdGVDb250ZXh0ID0gXy5leHRlbmQoe1xuXG5cdFx0XHQvLyBBbGxvd3MgeW91IHRvIGdldCBhIGhvbGQgb2YgZGF0YSxcblx0XHRcdC8vIGJ1dCB1c2UgYSBkZWZhdWx0IHZhbHVlIGlmIGl0IGRvZXNuJ3QgZXhpc3Rcblx0XHRcdGdldDogZnVuY3Rpb24gKGtleSwgZGVmYXVsdFZhbCkge1xuXHRcdFx0XHR2YXIgdmFsID0gdGVtcGxhdGVDb250ZXh0W2tleV07XG5cdFx0XHRcdGlmICh0eXBlb2YgdmFsID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRcdHZhbCA9IGRlZmF1bHRWYWw7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHZhbDtcblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0Ly8gQWxsIEZSQU1FV09SSy5kYXRhIGlzIGF2YWlsYWJsZSBpbiBldmVyeSB0ZW1wbGF0ZVxuXHRcdEZSQU1FV09SSy5kYXRhKTtcblxuXHRcdC8vIElmIGEgbW9kZWwgaXMgcHJvdmlkZWQgZm9yIHRoaXMgY29tcG9uZW50LCBtYWtlIGl0IGF2YWlsYWJsZSBpbiB0aGlzIHRlbXBsYXRlXG5cdFx0aWYgKHRoaXMubW9kZWwpIHtcblx0XHRcdF8uZXh0ZW5kKHRlbXBsYXRlQ29udGV4dCwgdGhpcy5tb2RlbC5hdHRyaWJ1dGVzKTtcblx0XHR9XG5cblx0XHQvLyBUZW1wbGF0ZSB0aGUgSFRNTCB3aXRoIHRoZSBkYXRhXG5cdFx0dmFyIGh0bWw7XG5cdFx0dHJ5IHtcblx0XHRcdC8vIEFjY2VwdCBwcmVjb21waWxlZCB0ZW1wbGF0ZXNcblx0XHRcdGlmIChfLmlzRnVuY3Rpb24odGhpcy50ZW1wbGF0ZSkpIHtcblx0XHRcdFx0aHRtbCA9IHRoaXMudGVtcGxhdGUodGVtcGxhdGVDb250ZXh0KTtcblx0XHRcdH1cblx0XHRcdC8vIE9yIHJhdyBzdHJpbmdzXG5cdFx0XHRlbHNlIGh0bWwgPSBfLnRlbXBsYXRlKHRoaXMudGVtcGxhdGUsIHRlbXBsYXRlQ29udGV4dCk7XG5cdFx0fVxuXHRcdGNhdGNoIChlKSB7XG5cdFx0XHR2YXIgc3RyID0gZSxcblx0XHRcdFx0c3RhY2sgPSAnJztcblxuXHRcdFx0aWYgKGUgaW5zdGFuY2VvZiBFcnJvcikge1xuXHRcdFx0XHRzdHIgPSAgZS50b1N0cmluZygpO1xuXHRcdFx0XHRzdGFjayA9IGUuc3RhY2s7XG5cdFx0XHR9XG5cblx0XHRcdEZSQU1FV09SSy5lcnJvcih0aGlzLmlkICsgJyA6OiByZW5kZXIoKSBlcnJvciBpbiB0ZW1wbGF0ZSA6XFxuJyArIHN0ciArICdcXG5UZW1wbGF0ZSA6OiAnICsgaHRtbCArICdcXG4nICsgc3RhY2spO1xuXHRcdFx0aHRtbCA9IHRoaXMudGVtcGxhdGU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGh0bWw7XG5cdH1cblxufTtcbiIsIi8qKlxuICogQ29tcG9uZW50IGlzIGFuIGV4dGVuZGVkIGBCYWNrYm9uZS5WaWV3YC4gSXQgYWRkIGZlYXR1cmVzIHN1Y2sgYXMgYXV0b21hdGljIGV2ZW50IGJpbmRpbmcsXG4gKiByZW5kZXJpbmcsIGxpZmVjeWNsZSBob29rcyBhbmQgZXZlbnRzLCBhbmQgbW9yZS5cbiAqL1xuXG52YXIgbGlmZWN5Y2xlSG9va3MgID0gcmVxdWlyZSgnLi9saWZlY3ljbGVIb29rcycpO1xudmFyIGxpZmVjeWNsZUV2ZW50cyA9IHJlcXVpcmUoJy4vbGlmZWN5Y2xlRXZlbnRzJyk7XG52YXIgYmluZEV2ZW50cyAgICAgID0gcmVxdWlyZSgnLi9iaW5kRXZlbnRzJyk7XG52YXIgY2xvc2UgICAgICAgICAgID0gcmVxdWlyZSgnLi9jbG9zZScpO1xudmFyIHJlbmRlciAgICAgICAgICA9IHJlcXVpcmUoJy4vcmVuZGVyJyk7XG52YXIgYmluZEV2ZW50cyAgICAgID0gcmVxdWlyZSAoJy4vYmluZEV2ZW50cycpO1xuXG5Db21wb25lbnQgPSBtb2R1bGUuZXhwb3J0cyA9IEJhY2tib25lLlZpZXcuZXh0ZW5kKCk7XG5cblxuXy5leHRlbmQoQ29tcG9uZW50LnByb3RvdHlwZSwge1xuXG5cdC8vIExpZmVjeWNsZSBIb29rc1xuXHRiZWZvcmVSZW5kZXI6IGZ1bmN0aW9uKGNiKSB7XG5cdFx0bGlmZWN5Y2xlSG9va3MuYmVmb3JlUmVuZGVyLmNhbGwodGhpcywgY2IpO1xuXHR9LFxuXHRiZWZvcmVDbG9zZTogZnVuY3Rpb24oY2IpIHtcblx0XHRsaWZlY3ljbGVIb29rcy5iZWZvcmVDbG9zZS5jYWxsKHRoaXMsIGNiKTtcblx0fSxcblx0YWZ0ZXJSZW5kZXI6IGZ1bmN0aW9uKCkge1xuXHRcdGxpZmVjeWNsZUhvb2tzLmFmdGVyUmVuZGVyLmNhbGwodGhpcyk7XG5cdH0sXG5cdGNhbmNlbFJlbmRlcjogZnVuY3Rpb24oKSB7XG5cdFx0bGlmZWN5Y2xlSG9va3MuY2FuY2VsUmVuZGVyLmNhbGwodGhpcyk7XG5cdH0sXG5cdGNhbmNlbENsb3NlOiBmdW5jdGlvbigpIHtcblx0XHRsaWZlY3ljbGVIb29rcy5jYW5jZWxDbG9zZS5jYWxsKHRoaXMpO1xuXHR9LFxuXG5cdC8vIExpZmVjeWNsZSBFdmVudHNcblx0YWZ0ZXJDaGFuZ2U6IGZ1bmN0aW9uKG1vZGVsLCBvcHRpb25zKSB7XG5cdFx0bGlmZWN5Y2xlRXZlbnRzLmFmdGVyQ2hhbmdlLmNhbGwodGhpcywgbW9kZWwsIG9wdGlvbnMpO1xuXHR9LFxuXHRhZnRlckFkZDogZnVuY3Rpb24obW9kZWwsIGNvbGxlY3Rpb24sIG9wdGlvbnMpIHtcblx0XHRsaWZlY3ljbGVFdmVudHMuYWZ0ZXJBZGQuY2FsbCh0aGlzLCBtb2RlbCwgY29sbGVjdGlvbiwgb3B0aW9ucyk7XG5cdH0sXG5cdGFmdGVyUmVtb3ZlOiBmdW5jdGlvbihtb2RlbCwgY29sbGVjdGlvbiwgb3B0aW9ucykge1xuXHRcdGxpZmVjeWNsZUV2ZW50cy5hZnRlclJlbW92ZS5jYWxsKHRoaXMsIG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zKTtcblx0fSxcblx0YWZ0ZXJSZXNldDogZnVuY3Rpb24oY29sbGVjdGlvbiwgb3B0aW9ucykge1xuXHRcdGxpZmVjeWNsZUV2ZW50cy5hZnRlclJlc2V0LmNhbGwodGhpcywgY29sbGVjdGlvbiwgb3B0aW9ucyk7XG5cdH0sXG5cblx0Ly8gUHJvdG90eXBlIG1ldGhvZHMuXG5cdGNsb3NlOiBmdW5jdGlvbigpIHtcblx0XHRjbG9zZS5jYWxsKHRoaXMpO1xuXHR9LFxuXHRyZW5kZXI6IGZ1bmN0aW9uKGF0SW5kZXgpIHtcblx0XHRyZW5kZXIuY2FsbCh0aGlzLCBhdEluZGV4KTtcblx0fVxufSk7XG5cblxuXG5cbkNvbXBvbmVudC5wcm90b3R5cGUuaW5pdGlhbGl6ZSA9IGZ1bmN0aW9uKHByb3BlcnRpZXMpIHtcblxuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0Ly8gRXh0ZW5kIGluc3RhbmNlIHcvIHNwZWNpZmllZCBwcm9wZXJ0aWVzIGFuZCBtZXRob2RzXG5cdF8uZXh0ZW5kKHRoaXMsIHByb3BlcnRpZXMpO1xuXG5cdC8vIFN0YXJ0IHdpdGggZW1wdHkgcmVnaW9ucyBvYmplY3Rcblx0dGhpcy5yZWdpb25zID0ge307XG5cblx0Ly8gQmluZCB0aGUgZXZlbnRzIG9uIG1vZGVsL2NvbGxlY3Rpb25zIGFuZCBnbG9iYWwgdHJpZ2dlcmVkIGV2ZW50cy5cblx0YmluZEV2ZW50cy5jb2xsZWN0aW9uRXZlbnRzLmNhbGwodGhpcyk7XG5cdGJpbmRFdmVudHMubW9kZWxFdmVudHMuY2FsbCh0aGlzKTtcblx0YmluZEV2ZW50cy5nbG9iYWxUcmlnZ2Vycy5jYWxsKHRoaXMpO1xuXG5cdC8vIEVuY291cmFnZSBjaGlsZCBtZXRob2RzIHRvIHVzZSB0aGUgY29tcG9uZW50IGNvbnRleHRcblx0Xy5iaW5kQWxsKHRoaXMpO1xuXG5cdC8vIEJpbmQgY29udGV4dCB0byBldmVudCBoYW5kbGVyc1xuXHQvLyBfLmVhY2godGhpcy5ldmVudHMsIGZ1bmN0aW9uKGhhbmRsZXIsIGV2ZW50U3RyaW5nKSB7XG5cdC8vIFx0Y29uc29sZS5sb2coaGFuZGxlciwgZXZlbnRTdHJpbmcpO1xuXHQvLyBcdF8uYmluZChoYW5kbGVyLCB0aGlzKTtcblx0Ly8gfSwgdGhpcyk7XG59O1xuIiwiLy8gRmlyZWQgd2hlbiB0aGUgYm91bmQgbW9kZWwgaXMgdXBkYXRlZCAoYHRoaXMubW9kZWxgKVxuZXhwb3J0cy5hZnRlckNoYW5nZSA9IGZ1bmN0aW9uIChtb2RlbCwgb3B0aW9ucykge307XG5cbi8vIEZpcmVkIHdoZW4gYSBtb2RlbCBpcyBhZGRlZCB0byB0aGUgYm91bmQgY29sbGVjdGlvbiAoYHRoaXMuY29sbGVjdGlvbmApXG5leHBvcnRzLmFmdGVyQWRkID0gZnVuY3Rpb24gKG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zKSB7fTtcblxuLy8gRmlyZWQgd2hlbiBhIG1vZGVsIGlzIHJlbW92ZWQgZnJvbSB0aGUgYm91bmQgY29sbGVjdGlvbiAoYHRoaXMuY29sbGVjdGlvbmApXG5leHBvcnRzLmFmdGVyUmVtb3ZlID0gZnVuY3Rpb24gKG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zKSB7fTtcblxuLy8gRmlyZWQgd2hlbiB0aGUgYm91bmQgY29sbGVjdGlvbiBpcyB3aXBlZCAoYHRoaXMuY29sbGVjdGlvbmApXG5leHBvcnRzLmFmdGVyUmVzZXQgPSBmdW5jdGlvbiAoY29sbGVjdGlvbiwgb3B0aW9ucykge307XG4iLCIvLyBGaXJlZCBhdXRvbWF0aWNhbGx5IHdoZW4gdGhlIHZpZXcgaXMgaW5pdGlhbGx5IGNyZWF0ZWRcbi8vIG9ubHkgZmlyZWQgYWZ0ZXJ3YXJkcyBpZiB0aGlzLnJlbmRlcigpIGlzIGV4cGxpY2l0bHkgY2FsbGVkXG4vLyBDYWxsYmFjayBtdXN0IGJlIGZpcmVkISFcbmV4cG9ydHMuYmVmb3JlUmVuZGVyID0gZnVuY3Rpb24gKGNiKSB7Y2IoKTt9O1xuXG4vLyBGaXJlZCBhdXRvbWF0aWNhbGx5IHdoZW4gdGhlIHZpZXcgaXMgaW5pdGlhbGx5IGNyZWF0ZWRcbi8vIG9ubHkgZmlyZWQgYWZ0ZXJ3YXJkcyBpZiB0aGlzLnJlbmRlcigpIGlzIGV4cGxpY2l0bHkgY2FsbGVkXG5leHBvcnRzLmFmdGVyUmVuZGVyID0gZnVuY3Rpb24gKCkge307XG5cbi8vIEZpcmVkIGF1dG9tYXRpY2FsbHkgd2hlbiB0aGUgdmlldyBpcyBjbG9zZWRcbmV4cG9ydHMuYmVmb3JlQ2xvc2UgPSBmdW5jdGlvbiAoY2IpIHtjYigpO307XG5cbi8vIEZpcmVkIGJlZm9yZSByZXJlbmRlcmluZyBvciBjbG9zaW5nIGEgdmlldyB0aGF0IGlzIGFscmVhZHkgd2FpdGluZyBvbiBhIGxvY2tcbmV4cG9ydHMuY2FuY2VsUmVuZGVyID0gZnVuY3Rpb24gKCkge1xuXHRGUkFNRVdPUksud2FybignY2FuY2VsUmVuZGVyKCkgc2hvdWxkIGJlIGRlZmluZWQgaWYgYmVmb3JlQ2xvc2UoY2IpIG9yIGJlZm9yZVJlbmRlcihjYiknICtcblx0XHRcdFx0XHRcdFx0XHQgJ2FyZSBiZWluZyB1c2VkIScpO1xufTtcblxuLy8gRmlyZWQgYmVmb3JlIHJlcmVuZGVyaW5nIG9yIGNsb3NpbmcgYSB2aWV3IHRoYXQgaXMgYWxyZWFkeSB3YWl0aW5nIG9uIGEgbG9ja1xuZXhwb3J0cy5jYW5jZWxDbG9zZSA9IGZ1bmN0aW9uICgpIHtcblx0RlJBTUVXT1JLLndhcm4oJ2NhbmNlbENsb3NlKCkgc2hvdWxkIGJlIGRlZmluZWQgaWYgYmVmb3JlQ2xvc2UoY2IpIG9yIGJlZm9yZVJlbmRlcihjYiknICtcblx0XHRcdFx0XHRcdFx0XHQgJ2FyZSBiZWluZyB1c2VkIScpO1xufTtcbiIsIi8qKlxuICogUnVuIEhUTUwgdGVtcGxhdGUgdGhyb3VnaCBlbmdpbmUgYW5kIGFwcGVuZCByZXN1bHRzIHRvIG91dGxldC4gQWxzbyByZXJlbmRlciByZWdpb25zLlxuICogSWYgYXRJbmRleCBpcyBzcGVjaWZpZWQsIHRoZSBjb21wb25lbnQgaXMgcmVuZGVyZWQgYXQgdGhlIGdpdmVuIHBvc2l0aW9uIHdpdGhpbiBpdHNcbiAqIG91dGxldC4gT3RoZXJ3aXNlLCB0aGUgbGFzdCBwb3NpdGlvbiBpcyB1c2VkLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSBhdEluZGV4IFtUaGUgaW5kZXggaW4gd2hpY2ggdG8gcmVuZGVyIHRoaXMgZWxlbWVudF1cbiAqL1xuXG52YXIgRE9NID0gcmVxdWlyZSAoJy4uL3V0aWxzL0RPTScpLFxuXHRcdGhlbHBlcnMgPSByZXF1aXJlKCcuL2hlbHBlcnMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByZW5kZXIoYXRJbmRleCkge1xuXG5cdEZSQU1FV09SSy5kZWJ1Zyh0aGlzLmlkICsgJyA6LS0tOiBSZW5kZXJpbmcgY29tcG9uZW50Li4uJyk7XG5cblx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdC8vIENhbmNlbCBjdXJyZW50IHJlbmRlciBhbmQgY2xvc2Ugam9icywgaWYgdGhleSdyZSBydW5uaW5nXG5cdGlmICh0aGlzLl9yZW5kZXJpbmcpIHtcblx0XHRGUkFNRVdPUksuZGVidWcodGhpcy5pZCArICcgOjogcmVuZGVyKCkgY2FuY2VsZWQuJyk7XG5cdFx0dGhpcy5jYW5jZWxSZW5kZXIoKTtcblx0XHRzZWxmLl9yZW5kZXJpbmcgPSBmYWxzZTtcblx0fVxuXHRpZiAodGhpcy5fY2xvc2luZykge1xuXHRcdEZSQU1FV09SSy5kZWJ1Zyh0aGlzLmlkICsgJyA6OiBjbG9zZSgpIGNhbmNlbGVkLicpO1xuXHRcdHRoaXMuY2FuY2VsQ2xvc2UoKTtcblx0XHRzZWxmLl9jbG9zaW5nID0gZmFsc2U7XG5cdH1cblxuXHQvLyBMb2NrIGFjY2VzcyB0byByZW5kZXJcblx0dGhpcy5fcmVuZGVyaW5nID0gdHJ1ZTtcblxuXHQvLyBUcmlnZ2VyIGJlZm9yZVJlbmRlciBtZXRob2Rcblx0dGhpcy5iZWZvcmVSZW5kZXIoZnVuY3Rpb24gKCkge1xuXG5cblx0XHQvLyBVbmxvY2sgcmVuZGVyaW5nIG11dGV4XG5cdFx0c2VsZi5fcmVuZGVyaW5nID0gZmFsc2U7XG5cblx0XHRpZiAoIXNlbGYuJG91dGxldCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKHNlbGYuaWQgKyAnIDo6IFRyeWluZyB0byByZW5kZXIoKSwgYnV0IG5vICRvdXRsZXQgd2FzIGRlZmluZWQhJyk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVmcmVzaCBjb21waWxlZCB0ZW1wbGF0ZVxuXHRcdHZhciBodG1sID0gaGVscGVycy5jb21waWxlVGVtcGxhdGUuY2FsbChzZWxmKTtcblx0XHRpZiAoIWh0bWwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcih0aGlzLmlkICsgJyA6OiBVbmFibGUgdG8gcmVuZGVyIGNvbXBvbmVudCBiZWNhdXNlIHRlbXBsYXRlIGNvbXBpbGF0aW9uIGRpZCBub3QgcmV0dXJuIGFueSBIVE1MLicpO1xuXHRcdH1cblxuXHRcdC8vIFN0cmlwIHRyYWlsaW5nIGFuZCBsZWFkaW5nIHdoaXRlc3BhY2UgdG8gYXZvaWQgZmFsc2VseSBkaWFnbm9zaW5nXG5cdFx0Ly8gbXVsdGlwbGUgZWxlbWVudHMsIHdoZW4gb25seSBvbmUgYWN0dWFsbHkgZXhpc3RzXG5cdFx0Ly8gKHRoaXMgbWlzZGlhZ25vc2lzIHdyYXBzIHRoZSB0ZW1wbGF0ZSBpbiBhbiBleHRyYW5lb3VzIDxkaXY+KVxuXHRcdGh0bWwgPSBodG1sLnJlcGxhY2UoL15cXHMqLywgJycpO1xuXHRcdGh0bWwgPSBodG1sLnJlcGxhY2UoL1xccyokLywgJycpO1xuXHRcdGh0bWwgPSBodG1sLnJlcGxhY2UoLyhcXHJ8XFxuKSovLCAnJyk7XG5cblx0XHQvLyBTdHJpcCBIVE1MIGNvbW1lbnRzLCB0aGVuIHN0cmlwIHdoaXRlc3BhY2UgYWdhaW5cblx0XHQvLyAoVE9ETzogb3B0aW1pemUgdGhpcylcblx0XHRodG1sID0gaHRtbC5yZXBsYWNlKC8oPCEtLS4rLS0+KSovLCAnJyk7XG5cdFx0aHRtbCA9IGh0bWwucmVwbGFjZSgvXlxccyovLCAnJyk7XG5cdFx0aHRtbCA9IGh0bWwucmVwbGFjZSgvXFxzKiQvLCAnJyk7XG5cdFx0aHRtbCA9IGh0bWwucmVwbGFjZSgvKFxccnxcXG4pKi8sICcnKTtcblxuXHRcdC8vIFBhcnNlIGEgRE9NIG5vZGUgb3Igc2VyaWVzIG9mIERPTSBub2RlcyBmcm9tIHRoZSBuZXdseSB0ZW1wbGF0ZWQgSFRNTFxuXHRcdHZhciBwYXJzZWROb2RlcyA9ICQucGFyc2VIVE1MKGh0bWwpO1xuXHRcdHZhciBlbCA9IHBhcnNlZE5vZGVzWzBdO1xuXG5cdFx0Ly8gSWYgbm8gbm9kZXMgd2VyZSBwYXJzZWQsIHRocm93IGFuIGVycm9yXG5cdFx0aWYgKHBhcnNlZE5vZGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKHNlbGYuaWQgKyAnIDo6IHJlbmRlcigpIHJhbiBpbnRvIGEgcHJvYmxlbSByZW5kZXJpbmcgdGhlIHRlbXBsYXRlIHdpdGggSFRNTCA9PiBcXG4nK2h0bWwpO1xuXHRcdH1cblxuXHRcdC8vIElmIHRoZXJlIGlzIG5vdCBvbmUgc2luZ2xlIHdyYXBwZXIgZWxlbWVudCxcblx0XHQvLyBvciBpZiB0aGUgcmVuZGVyZWQgdGVtcGxhdGUgY29udGFpbnMgb25seSBhIHNpbmdsZSB0ZXh0IG5vZGUsXG5cdFx0Ly8gKG9yIGp1c3QgYSBsb25lIHJlZ2lvbilcblx0XHRlbHNlIGlmIChwYXJzZWROb2Rlcy5sZW5ndGggPiAxIHx8IHBhcnNlZE5vZGVzWzBdLm5vZGVUeXBlID09PSAzIHx8XG5cdFx0XHRcdFx0XHQgJChwYXJzZWROb2Rlc1swXSkuaXMoJ3JlZ2lvbicpKSB7XG5cblx0XHRcdEZSQU1FV09SSy5sb2coc2VsZi5pZCArICcgOjogV3JhcHBpbmcgdGVtcGxhdGUgaW4gPGRpdi8+Li4uJywgcGFyc2VkTm9kZXMpO1xuXG5cdFx0XHQvLyB3cmFwIHRoZSBodG1sIHVwIGluIGEgY29udGFpbmVyIDxkaXYvPlxuXHRcdFx0ZWwgPSAkKCc8ZGl2Lz4nKS5hcHBlbmQoaHRtbCk7XG5cdFx0XHRlbCA9IGVsWzBdO1xuXHRcdH1cblxuXHRcdC8vIFNldCBCYWNrYm9uZSBlbGVtZW50IChjYWNoZSBhbmQgcmVkZWxlZ2F0ZSBET00gZXZlbnRzKVxuXHRcdC8vIChXaWxsIGFsc28gdXBkYXRlIHNlbGYuJGVsKVxuXHRcdHNlbGYuc2V0RWxlbWVudChlbCk7XG5cdFx0Ly8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cblxuXHRcdC8vIERldGVjdCBhbmQgcmVuZGVyIGFsbCByZWdpb25zIGFuZCB0aGVpciBkZXNjZW5kZW50IGNvbXBvbmVudHMgYW5kIHJlZ2lvbnNcblx0XHRoZWxwZXJzLnJlbmRlclJlZ2lvbnMuY2FsbChzZWxmKTtcblxuXHRcdC8vIEluc2VydCB0aGUgZWxlbWVudCBhdCB0aGUgcHJvcGVyIHBsYWNlIGFtb25nc3QgdGhlIG91dGxldCdzIGNoaWxkcmVuXG5cdFx0dmFyIG5laWdoYm9ycyA9IHNlbGYuJG91dGxldC5jaGlsZHJlbigpO1xuXHRcdGlmIChfLmlzRmluaXRlKGF0SW5kZXgpICYmIG5laWdoYm9ycy5sZW5ndGggPiAwICYmIG5laWdoYm9ycy5sZW5ndGggPiBhdEluZGV4KSB7XG5cdFx0XHRuZWlnaGJvcnMuZXEoYXRJbmRleCkuYmVmb3JlKHNlbGYuJGVsKTtcblx0XHR9XG5cblx0XHQvLyBCdXQgaWYgdGhlIG91dGxldCBpcyBlbXB0eSwgb3IgdGhlcmUncyBubyBhdEluZGV4LCBqdXN0IHN0aWNrIGl0IG9uIHRoZSBlbmRcblx0XHRlbHNlIHNlbGYuJG91dGxldC5hcHBlbmQoc2VsZi4kZWwpO1xuXG5cdFx0Ly8gRmluYWxseSwgdHJpZ2dlciBhZnRlclJlbmRlciBtZXRob2Rcblx0XHRzZWxmLmFmdGVyUmVuZGVyKCk7XG5cblx0XHQvLyBBZGQgZGF0YSBhdHRyaWJ1dGVzIHRvIHRoaXMgY29tcG9uZW50J3MgJGVsLCBwcm92aWRpbmcgYWNjZXNzXG5cdFx0Ly8gdG8gd2hldGhlciB0aGUgZWxlbWVudCBoYXMgdmFyaW91cyBET00gYmluZGluZ3MgZnJvbSBzdHlsZXNoZWV0cy5cblx0XHQvLyAoaGFuZHkgZm9yIGRpc2FibGluZyB0ZXh0IHNlbGVjdGlvbiBhY2NvcmRpbmdseSwgZXRjLilcblx0XHQvL1xuXHRcdC8vIC0+IGRpc2FibGUgZm9yIHRoaXMgY29tcG9uZW50IHdpdGggYHRoaXMuYXR0ckZsYWdzID0gZmFsc2VgXG5cdFx0Ly8gLT4gb3IgZ2xvYmFsbHkgd2l0aCBgRlJBTUVXT1JLLmF0dHJGbGFncyA9IGZhbHNlYFxuXHRcdC8vXG5cdFx0Ly8gVE9ETzogbWFrZSBpdCB3b3JrIHdpdGggZGVsZWdhdGVkIERPTSBldmVudCBiaW5kaW5nc1xuXHRcdC8vXG5cdFx0aWYgKHNlbGYuYXR0ckZsYWdzICE9PSBmYWxzZSAmJiBGUkFNRVdPUksuYXR0ckZsYWdzICE9PSBmYWxzZSkge1xuXHRcdFx0RE9NLmZsYWdCb3VuZEV2ZW50cyhzZWxmKTtcblx0XHR9XG5cdH0pO1xufVxuIiwiLyoqXG4gKiBSdW4gZGVmaW5pdGlvbiBtZXRob2RzIHRvIGdldCBhY3R1YWwgY29tcG9uZW50IGRlZmluaXRpb25zLlxuICogVGhpcyBpcyBkZWZlcnJlZCB0byBhdm9pZCBoYXZpbmcgdG8gdXNlIEJhY2tib25lJ3MgZnVuY3Rpb24gKCkge30gYXBwcm9hY2ggZm9yIHRoaW5nc1xuICogbGlrZSBjb2xsZWN0aW9ucy5cbiAqL1xuXG4vKipcbiAqIEJ1aWxkIHVwcyBhIGNvbXBvbmVudCBkZWZpbml0aW9uIGJ5IHJ1bm5pbmcgdGhlIGRlZmluaXRpb24uIFdlIHRoZW4gbGluayB0aGVcbiAqIGNvbXBvbmVudCBkZWZpbml0aW9uIHRvIGFuIGlkZW50aWZpZXIgaW4gYEZSQU1FV09SSy5jb21wb25lbnRzYC5cbiAqXG4gKiBAcGFyYW0gIHtPYmplY3R9IGNvbXBvbmVudCBbT2JqZWN0IGNvbnRhaW5pbmcgdGhlIGRlZmluaXRpb24gZnVuY3Rpb24gb2YgdGhlIGNvbXBvbmVudF1cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBidWlsZENvbXBvbmVudERlZmluaXRpb24oY29tcG9uZW50KSB7XG5cdHZhciBjb21wb25lbnREZWYgPSBjb21wb25lbnQuZGVmaW5pdGlvbigpO1xuXG5cdGlmIChjb21wb25lbnQuaWRPdmVycmlkZSkge1xuXHRcdGlmIChjb21wb25lbnREZWYuaWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihjb21wb25lbnQuaWRPdmVycmlkZSArICc6OiBDYW5ub3Qgc3BlY2lmeSBhbiBpZE92ZXJyaWRlIGluIC5kZWZpbmUoKSBpZiBhbiBpZCBwcm9wZXJ0eSAoJytjb21wb25lbnREZWYuaWQrJykgaXMgYWxyZWFkeSBzZXQgaW4geW91ciBjb21wb25lbnQgZGVmaW5pdGlvbiFcXG5Vc2FnZTogLmRlZmluZShbaWRPdmVycmlkZV0sIGRlZmluaXRpb24pJyk7XG5cdFx0fVxuXHRcdGNvbXBvbmVudERlZi5pZCA9IGNvbXBvbmVudC5pZE92ZXJyaWRlO1xuXHR9XG5cdGlmICghY29tcG9uZW50RGVmLmlkKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgdXNlIC5kZWZpbmUoKSB3aXRob3V0IGRlZmluaW5nIGFuIGlkIHByb3BlcnR5IG9yIG92ZXJyaWRlIGluIHlvdXIgY29tcG9uZW50IVxcblVzYWdlOiAuZGVmaW5lKFtpZE92ZXJyaWRlXSwgZGVmaW5pdGlvbiknKTtcblx0fVxuXHRGUkFNRVdPUksuY29tcG9uZW50c1tjb21wb25lbnREZWYuaWRdID0gY29tcG9uZW50RGVmO1xufTtcbiIsIi8qKlxuICogT3B0aW9uYWwgbWV0aG9kIHRvIHJlcXVpcmUgYXBwIGNvbXBvbmVudHMuIFJlcXVpcmUuanMgY2FuIGJlIHVzZWQgaW5zdGVhZFxuICogYXMgbmVlZGVkLlxuICpcbiAqIEBwYXJhbSAge1N0cmluZ30gXHRbKG9wdGlvbmFsKSBDb21wb25lbnQgaWQgb3ZlcnJpZGVdXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gW0Z1bmN0aW9uIERlZmluaXRpb24gb2YgY29tcG9uZW50XVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGRlZmluZShpZCwgZGVmaW5pdGlvbkZuKSB7XG5cdC8vIElkIHBhcmFtIGlzIG9wdGlvbmFsXG5cdGlmICghZGVmaW5pdGlvbkZuKSB7XG5cdFx0ZGVmaW5pdGlvbkZuID0gaWQ7XG5cdFx0aWQgPSBudWxsO1xuXHR9XG5cblx0RlJBTUVXT1JLLl9kZWZpbmVRdWV1ZS5wdXNoKHtcblx0XHRkZWZpbml0aW9uOiBkZWZpbml0aW9uRm4sXG5cdFx0aWRPdmVycmlkZTogaWRcblx0fSk7XG59O1xuIiwiLyoqXG4gKlx0TG9nZ2V0IGNvbnN0cnVjdG9yIG1ldGhvZCB0aGF0IHdpbGwgc2V0dXAgRlJBTUVXT1JLIHRvIGxvZyBtZXNzYWdlcy5cbiAqL1xuXG52YXIgc2V0dXBMb2dnZXIgPSByZXF1aXJlKCcuL3NldHVwJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gTG9nZ2VyKCkge1xuXG5cdC8vIFVwb24gaW5pdGlhbGl6YXRpb24sIHNldHVwIGxvZ2dlclxuXHRzZXR1cExvZ2dlcihGUkFNRVdPUksubG9nTGV2ZWwpO1xuXG5cdC8vIEluIHN1cHBvcnRlZCBicm93c2VycywgYWxzbyBydW4gc2V0dXBMb2dnZXIgYWdhaW5cblx0Ly8gd2hlbiBGUkFNRVdPUksubG9nTGV2ZWwgaXMgc2V0IGJ5IHRoZSB1c2VyXG5cdGlmIChfLmlzRnVuY3Rpb24oRlJBTUVXT1JLLl9fZGVmaW5lU2V0dGVyX18pKSB7XG5cdFx0RlJBTUVXT1JLLl9fZGVmaW5lU2V0dGVyX18oJ2xvZ0xldmVsJywgZnVuY3Rpb24gb25DaGFuZ2UgKG5ld0xvZ0xldmVsKSB7XG5cdFx0XHRzZXR1cExvZ2dlcihuZXdMb2dMZXZlbCk7XG5cdFx0fSk7XG5cdH1cbn07XG4iLCIvKipcbiAqIFNldCB1cCB0aGUgbG9nIGZ1bmN0aW9uczpcbiAqXG4gKiBGUkFNRVdPUksuZXJyb3JcbiAqIEZSQU1FV09SSy53YXJuXG4gKiBGUkFNRVdPUksubG9nXG4gKiBGUkFNRVdPUksuZGVidWcgKCpsZWdhY3kpXG4gKiBGUkFNRVdPUksudmVyYm9zZVxuICpcbiAqIEBwYXJhbSAge1N0cmluZ30gbG9nTGV2ZWwgW1RoZSBkZXNpcmVkIGxvZyBsZXZlbCBvZiB0aGUgTG9nZ2VyXVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHNldHVwTG9nZ2VyIChsb2dMZXZlbCkge1xuXG5cdHZhciBub29wID0gZnVuY3Rpb24gKCkge307XG5cblx0Ly8gSWYgbG9nIGlzIHNwZWNpZmllZCwgdXNlIGl0LCBvdGhlcndpc2UgdXNlIHRoZSBjb25zb2xlXG5cdGlmIChGUkFNRVdPUksubG9nZ2VyKSB7XG5cdFx0RlJBTUVXT1JLLmVycm9yICAgICA9IEZSQU1FV09SSy5sb2dnZXIuZXJyb3I7XG5cdFx0RlJBTUVXT1JLLndhcm4gICAgICA9IEZSQU1FV09SSy5sb2dnZXIud2Fybjtcblx0XHRGUkFNRVdPUksubG9nICAgICAgID0gRlJBTUVXT1JLLmxvZ2dlci5kZWJ1ZyB8fCBGUkFNRVdPUksubG9nZ2VyO1xuXHRcdEZSQU1FV09SSy52ZXJib3NlICAgPSBGUkFNRVdPUksubG9nZ2VyLnZlcmJvc2U7XG5cdH1cblxuXHQvLyBJbiBJRSwgd2UgY2FuJ3QgZGVmYXVsdCB0byB0aGUgYnJvd3NlciBjb25zb2xlIGJlY2F1c2UgdGhlcmUgSVMgTk8gQlJPV1NFUiBDT05TT0xFXG5cdGVsc2UgaWYgKHR5cGVvZiBjb25zb2xlICE9PSAndW5kZWZpbmVkJykge1xuXG5cdFx0Ly8gV2UgY2Fubm90IGNhbGxlZCB0aGUgLmJpbmQgbWV0aG9kIG9uIHRoZSBjb25zb2xlIG1ldGhvZHMuIFdlIGFyZSBpbiBpZSA5IG9yIDgsIGp1c3QgbWFrZVxuXHRcdC8vIGV2ZXJ5aHRpbmcgYSBub29wLlxuXHRcdGlmIChfLmlzVW5kZWZpbmVkKGNvbnNvbGUubG9nLmJpbmQpKSAge1xuXHRcdFx0RlJBTUVXT1JLLmVycm9yICAgICA9IG5vb3A7XG5cdFx0XHRGUkFNRVdPUksud2FybiAgICAgID0gbm9vcDtcblx0XHRcdEZSQU1FV09SSy5sb2cgICAgICAgPSBub29wO1xuXHRcdFx0RlJBTUVXT1JLLmRlYnVnICAgICA9IG5vb3A7XG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZSAgID0gbm9vcDtcblx0XHR9XG5cblx0XHQvLyBXZSBhcmUgaW4gYSBmcmllbmRseSBicm93c2VyIGxpa2UgQ2hyb21lLCBGaXJlZm94LCBvciBJRTEwXG5cdFx0ZWxzZSB7XG5cdFx0XHRGUkFNRVdPUksuZXJyb3JcdFx0PSBjb25zb2xlLmVycm9yICYmIGNvbnNvbGUuZXJyb3IuYmluZChjb25zb2xlKTtcblx0XHRcdEZSQU1FV09SSy53YXJuXHRcdD0gY29uc29sZS53YXJuICYmIGNvbnNvbGUud2Fybi5iaW5kKGNvbnNvbGUpO1xuXHRcdFx0RlJBTUVXT1JLLmxvZ1x0XHRcdD0gY29uc29sZS5kZWJ1ZyAmJiBjb25zb2xlLmRlYnVnLmJpbmQoY29uc29sZSk7XG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZVx0PSBjb25zb2xlLmxvZyAmJiBjb25zb2xlLmxvZy5iaW5kKGNvbnNvbGUpO1xuXG5cdFx0XHQvLyBVc2UgbG9nIGxldmVsIGNvbmZpZyBpZiBwcm92aWRlZFxuXHRcdFx0c3dpdGNoIChsb2dMZXZlbCkge1xuXHRcdFx0XHRjYXNlICd2ZXJib3NlJzogYnJlYWs7XG5cblx0XHRcdFx0Y2FzZSAnZGVidWcnOlxuXHRcdFx0XHRcdEZSQU1FV09SSy52ZXJib3NlID0gbm9vcDtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlICd3YXJuJzpcblx0XHRcdFx0XHRGUkFNRVdPUksudmVyYm9zZSA9IEZSQU1FV09SSy5sb2cgPSBub29wO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgJ2Vycm9yJzpcblx0XHRcdFx0XHRGUkFNRVdPUksudmVyYm9zZSA9IEZSQU1FV09SSy5sb2cgPSBGUkFNRVdPUksud2FybiA9IG5vb3A7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSAnc2lsZW50Jzpcblx0XHRcdFx0XHRGUkFNRVdPUksudmVyYm9zZSA9IEZSQU1FV09SSy5sb2cgPSBGUkFNRVdPUksud2FybiA9IEZSQU1FV09SSy5lcnJvciA9IG5vb3A7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IgKCdVbnJlY29nbml6ZWQgbG9nZ2luZyBsZXZlbCBjb25maWcgJyArXG5cdFx0XHRcdFx0JygnICsgRlJBTUVXT1JLLmlkICsgJy5sb2dMZXZlbCA9IFwiJyArIGxvZ0xldmVsICsgJ1wiKScpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTdXBwb3J0IGZvciBgZGVidWdgIGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eVxuXHRcdFx0RlJBTUVXT1JLLmRlYnVnID0gRlJBTUVXT1JLLmxvZztcblxuXHRcdFx0Ly8gVmVyYm9zZSBzcGl0cyBvdXQgbG9nIGxldmVsXG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZSgnTG9nIGxldmVsIHNldCB0byA6OiAnLCBsb2dMZXZlbCk7XG5cdFx0fVxuXHR9XG59XG4iLCIvKipcbiAqIEdpdmVuIGEgY29tcG9uZW50IGRlZmluaXRpb24gYW5kIGl0cyBrZXksIHdlIHdpbGwgYnVpbGQgdXAgdGhlIGNvbXBvbmVudCBwcm90b3R5cGUgYW5kIG1lcmdlXG4gKiB0aGlzIGNvbXBvbmVudCB3aXRoIGl0cyBtYXRjaGluZyB0ZW1wbGF0ZS5cbiAqXG4gKiBAcGFyYW0gIHtPYmplY3R9IGNvbXBvbmVudERlZiBbT2JqZWN0IGNvbnRhaW5pbmcgdGhlIGNvbXBvbmVudCBkZWZpbml0aW9uXVxuICogQHBhcmFtICB7U3RyaW5nfSBjb21wb25lbnRLZXkgW1RoZSBjb21wb25lbnQgaWRlbnRpZmllcl1cbiAqL1xuXG52YXIgdHJhbnNsYXRlU2hvcnRoYW5kID0gcmVxdWlyZSgnLi4vdXRpbHMvc2hvcnRoYW5kJyk7XG52YXIgVXRpbHMgPSByZXF1aXJlKCcuLi91dGlscy91dGlscycpO1xudmFyIEV2ZW50cyA9IHJlcXVpcmUoJy4uL3V0aWxzL2V2ZW50cycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGJ1aWxkQ29tcG9uZW50UHJvdG90eXBlKGNvbXBvbmVudERlZiwgY29tcG9uZW50S2V5KSB7XG5cblx0Ly8gSWYgY29tcG9uZW50IGlkIGlzIG5vdCBleHBsaWNpdGx5IHNldCwgdXNlIHRoZSBjb21wb25lbnRLZXlcblx0aWYgKCFjb21wb25lbnREZWYuaWQpIHtcblx0XHRjb21wb25lbnREZWYuaWQgPSBjb21wb25lbnRLZXk7XG5cdH1cblxuXHQvLyBTZWFyY2ggdGVtcGxhdGVzXG5cdHZhciB0ZW1wbGF0ZSA9IEZSQU1FV09SSy50ZW1wbGF0ZXNbY29tcG9uZW50RGVmLmlkXTtcblxuXHQvLyBJZiBubyBtYXRjaCBmb3IgY29tcG9uZW50IHdhcyBmb3VuZMKgaW4gdGVtcGxhdGVzLCBpc3N1ZSBhIHdhcm5pbmdcblx0aWYgKCF0ZW1wbGF0ZSkge1xuXHRcdHJldHVybiBGUkFNRVdPUksud2Fybihcblx0XHRcdGNvbXBvbmVudERlZi5pZCArICcgOjogTm8gdGVtcGxhdGUgZm91bmQgZm9yIGNvbXBvbmVudCEnICtcblx0XHRcdCdcXG5UZW1wbGF0ZXMgZG9uXFwndCBuZWVkIGEgY29tcG9uZW50IHVubGVzcyB5b3Ugd2FudCBpbnRlcmFjdGl2aXR5LCAnICtcblx0XHRcdCdldmVyeSBjb21wb25lbnQgKnNob3VsZCogaGF2ZSBhIG1hdGNoaW5nIHRlbXBsYXRlISEnICtcblx0XHRcdCdcXG5Vc2luZyBjb21wb25lbnRzIHdpdGhvdXQgdGVtcGxhdGVzIG1heSBzZWVtIG5lY2Vzc2FyeSwgJyArXG5cdFx0XHQnYnV0IGl0XFwncyBub3QuICBJdCBtYWtlcyB5b3VyIHZpZXcgbG9naWMgaW5jb3Jwb3JlYWwsIGFuZCBtYWtlcyB5b3VyIGNvbGxlYWd1ZXMgJyArXG5cdFx0XHQndW5jb21mb3J0YWJsZS4nKTtcblx0fVxuXG5cdC8vIFNhdmUgcmVmZXJlbmNlIHRvIHRlbXBsYXRlIGluIGNvbXBvbmVudCBwcm90b3R5cGVcblx0RlJBTUVXT1JLLnZlcmJvc2UoY29tcG9uZW50RGVmLmlkICsgJyA6OiBQYWlyaW5nIGNvbXBvbmVudCB3aXRoIHRlbXBsYXRlLi4uJyk7XG5cdGNvbXBvbmVudERlZi50ZW1wbGF0ZSA9IHRlbXBsYXRlO1xuXG5cdC8vIFRyYW5zbGF0ZSByaWdodC1oYW5kIHNob3J0aGFuZCBmb3IgdG9wLWxldmVsIGtleXNcblx0Y29tcG9uZW50RGVmID0gVXRpbHMub2JqTWFwKGNvbXBvbmVudERlZiwgdHJhbnNsYXRlU2hvcnRoYW5kKTtcblxuXG5cdC8vIGFuZCBldmVudHMgb2JqZWN0XG5cdGlmIChjb21wb25lbnREZWYuZXZlbnRzKSB7XG5cdFx0Y29tcG9uZW50RGVmLmV2ZW50cyA9IFV0aWxzLm9iak1hcChcblx0XHRcdGNvbXBvbmVudERlZi5ldmVudHMsXG5cdFx0XHR0cmFuc2xhdGVTaG9ydGhhbmRcblx0XHQpO1xuXHR9XG5cblx0Ly8gYW5kIGFmdGVyQ2hhbmdlIGJpbmRpbmdzXG5cdGlmIChfLmlzT2JqZWN0KGNvbXBvbmVudERlZi5hZnRlckNoYW5nZSkgJiYgIV8uaXNGdW5jdGlvbihjb21wb25lbnREZWYuYWZ0ZXJDaGFuZ2UpKSB7XG5cdFx0Y29tcG9uZW50RGVmLmFmdGVyQ2hhbmdlID0gVXRpbHMub2JqTWFwKFxuXHRcdFx0Y29tcG9uZW50RGVmLmFmdGVyQ2hhbmdlLFxuXHRcdFx0dHJhbnNsYXRlU2hvcnRoYW5kXG5cdFx0KTtcblx0fVxuXG5cdC8vIEdvIGFoZWFkIGFuZCB0dXJuIHRoZSBkZWZpbml0aW9uIGludG8gYSByZWFsIGNvbXBvbmVudCBwcm90b3R5cGVcblx0RlJBTUVXT1JLLnZlcmJvc2UoY29tcG9uZW50RGVmLmlkICsgJyA6OiBCdWlsZGluZyBjb21wb25lbnQgcHJvdG90eXBlLi4uJyk7XG5cdHZhciBjb21wb25lbnRQcm90b3R5cGUgPSBGUkFNRVdPUksuQ29tcG9uZW50LmV4dGVuZChjb21wb25lbnREZWYpO1xuXG5cdC8vIERpc2NvdmVyIHN1YnNjcmlwdGlvbnNcblx0Y29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZS5zdWJzY3JpcHRpb25zID0ge307XG5cblx0Ly8gSXRlcmF0ZSB0aHJvdWdoIGVhY2ggcHJvcGVydHkgb24gdGhpcyBjb21wb25lbnQgcHJvdG90eXBlXG5cdF8uZWFjaChjb21wb25lbnRQcm90b3R5cGUucHJvdG90eXBlLCBmdW5jdGlvbiAoaGFuZGxlciwga2V5KSB7XG5cblx0XHQvLyBEZXRlY3QgRE9NIGV2ZW50cyBhbmQgc21hc2ggdGhlbSBpbnRvIHRoZSBldmVudHMgaGFzaFxuXHRcdHZhciBtYXRjaGVkRE9NRXZlbnRzID0ga2V5Lm1hdGNoKEV2ZW50c1snL0RPTUV2ZW50LyddKTtcblx0XHRpZiAobWF0Y2hlZERPTUV2ZW50cykge1xuXHRcdFx0dmFyIGV2ZW50TmFtZSA9IG1hdGNoZWRET01FdmVudHNbMV07XG5cdFx0XHR2YXIgZGVsZWdhdGVTZWxlY3RvciA9IG1hdGNoZWRET01FdmVudHNbM107XG5cblx0XHRcdC8vIFN0b3cgdGhlbSBpbiBldmVudHMgaGFzaFxuXHRcdFx0Y29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZS5ldmVudHMgPSBjb21wb25lbnRQcm90b3R5cGUucHJvdG90eXBlLmV2ZW50cyB8fCB7fTtcblx0XHRcdGNvbXBvbmVudFByb3RvdHlwZS5wcm90b3R5cGUuZXZlbnRzW2tleV0gPSBoYW5kbGVyO1xuXHRcdH1cblxuXHRcdC8vIEFkZCBhcHAgZXZlbnRzICglKSwgcm91dGVzICgjKSwgYW5kIGRhdGEgbGlzdGVuZXJzICh+KSB0byBzdWJzY3JpcHRpb25zIGhhc2hcblx0XHRpZiAoa2V5Lm1hdGNoKC9eKCV8I3x+KS8pKSB7XG5cdFx0XHRpZiAoXy5pc1N0cmluZyhoYW5kbGVyKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoY29tcG9uZW50RGVmLmlkICsgJzo6IEludmFsaWQgbGlzdGVuZXIgZm9yIHN1YnNjcmlwdGlvbjogJyArIGtleSArICcuXFxuJyArXG5cdFx0XHRcdFx0J0RlZmluZSB5b3VyIGNhbGxiYWNrIHdpdGggYW4gYW5vbnltb3VzIGZ1bmN0aW9uIGluc3RlYWQgb2YgYSBzdHJpbmcuJ1xuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFfLmlzRnVuY3Rpb24oaGFuZGxlcikpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGNvbXBvbmVudERlZi5pZCArJzo6IEludmFsaWQgbGlzdGVuZXIgZm9yIHN1YnNjcmlwdGlvbjogJyArIGtleSk7XG5cdFx0XHR9XG5cdFx0XHRjb21wb25lbnRQcm90b3R5cGUucHJvdG90eXBlLnN1YnNjcmlwdGlvbnNba2V5XSA9IGhhbmRsZXI7XG5cdFx0fVxuXG5cdFx0Ly8gRXh0ZW5kIG9uZSBvciBtb3JlIG90aGVyIGNvbXBvbmVudHNcblx0XHRlbHNlIGlmIChrZXkgPT09ICdleHRlbmRDb21wb25lbnRzJykge1xuXHRcdFx0dmFyIG9ialRvTWVyZ2UgPSB7fTtcblx0XHRcdF8uZWFjaChoYW5kbGVyLCBmdW5jdGlvbihjaGlsZElkKXtcblxuXHRcdFx0XHRpZiAoIUZSQU1FV09SSy5jb21wb25lbnRzW2NoaWxkSWRdKXtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoXG5cdFx0XHRcdFx0Y29tcG9uZW50RGVmLmlkICsgJyA6OiAnICtcblx0XHRcdFx0XHQnVHJ5aW5nIHRvIGRlZmluZS9leHRlbmQgdGhpcyBjb21wb25lbnQgZnJvbSBgJyArIGNoaWxkSWQgKyAnYCwgJyArXG5cdFx0XHRcdFx0J2J1dCBubyBjb21wb25lbnQgd2l0aCB0aGF0IGlkIGNhbiBiZSBmb3VuZC4nXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdF8uZXh0ZW5kKG9ialRvTWVyZ2UsIEZSQU1FV09SSy5jb21wb25lbnRzW2NoaWxkSWRdKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRfLmRlZmF1bHRzKGNvbXBvbmVudFByb3RvdHlwZS5wcm90b3R5cGUsIG9ialRvTWVyZ2UpO1xuXHRcdH1cblx0fSk7XG5cblx0Ly8gU2F2ZSBwcm90b3R5cGUgaW4gZ2xvYmFsIHNldCBmb3IgdHJhY2tpbmdcblx0RlJBTUVXT1JLLmNvbXBvbmVudHNbY29tcG9uZW50RGVmLmlkXSA9IGNvbXBvbmVudFByb3RvdHlwZTtcbn07XG4iLCIvKipcbiAqIENvbGxlY3QgYW55IHJlZ2lvbnMgd2l0aCB0aGUgZGVmYXVsdCBjb21wb25lbnQgc2V0IGZyb20gdGhlIERPTS5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNvbGxlY3RSZWdpb25zICgpIHtcblxuXHQvLyBQcm92aWRlIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5IGZvciBsZWdhY3kgbm90YXRpb25cblx0JCgncmVnaW9uW2RlZmF1bHRdLHJlZ2lvblt0ZW1wbGF0ZV0sW2RhdGEtcmVnaW9uXVtkZWZhdWx0XSxbZGF0YS1yZWdpb25dW3RlbXBsYXRlXScpLmVhY2goZnVuY3Rpb24oKSB7XG5cdFx0JGUgPSAkKHRoaXMpO1xuXHRcdHZhciBjb21wb25lbnRJZCA9ICRlLmF0dHIoJ2RlZmF1bHQnKSB8fCAkZS5hdHRyKCd0ZW1wbGF0ZScpO1xuXHRcdCRlLmF0dHIoJ2NvbnRlbnRzJywgY29tcG9uZW50SWQpO1xuXHR9KTtcblxuXHQvLyBOb3cgaW5zdGFudGlhdGUgdGhlIGFwcHJvcHJpYXRlIGRlZmF1bHQgY29tcG9uZW50IGluIGVhY2hcblx0Ly8gcmVnaW9uIHdpdGggYSBzcGVjaWZpZWQgdGVtcGxhdGUvY29tcG9uZW50XG5cdCQoJ3JlZ2lvbltjb250ZW50c10sW2RhdGEtcmVnaW9uXVtjb250ZW50c10nKS5lYWNoKGZ1bmN0aW9uKCkge1xuXHRcdEZSQU1FV09SSy5SZWdpb24uZnJvbUVsZW1lbnQodGhpcyk7XG5cdH0pO1xufVxuIiwiLyoqXG4gKiBMb2FkIGFueSBzY3JpcHQgdGFncyBvbiB0aGUgcGFnZSB3aXRoIHR5cGU9XCJ0ZXh0L3RlbXBsYXRlXCIuXG4gKlxuICogQHJldHVybiB7T2JqZWN0fSBbT2JqZWN0IGNvbnNpc3Rpbmcgb2YgYSB0ZW1wbGF0ZSBpZGVudGlmaWVyIGFuZCBpdHMgSFRNTC5dXG4gKi9cblxudmFyIFV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMvdXRpbHMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjb2xsZWN0VGVtcGxhdGVzKCkge1xuXHR2YXIgdGVtcGxhdGVzID0ge307XG5cblx0JCgnc2NyaXB0W3R5cGU9XCJ0ZXh0L3RlbXBsYXRlXCJdJykuZWFjaChmdW5jdGlvbiAoaSwgZWwpIHtcblx0XHR2YXIgaWQgPSBVdGlscy5lbDJpZChlbCwgdHJ1ZSk7XG5cdFx0dGVtcGxhdGVzW2lkXSA9ICQoZWwpLmh0bWwoKTtcblxuXHRcdC8vIFN0cmlwIHdoaXRlc3BhY2UgbGVmdG92ZXIgZnJvbSBzY3JpcHQgdGFnc1xuXHRcdHRlbXBsYXRlc1tpZF0gPSB0ZW1wbGF0ZXNbaWRdLnJlcGxhY2UoL15cXHMrLywnJyk7XG5cdFx0dGVtcGxhdGVzW2lkXSA9IHRlbXBsYXRlc1tpZF0ucmVwbGFjZSgvXFxzKyQvLCcnKTtcblxuXHRcdC8vIFJlbW92ZSBmcm9tIERPTVxuXHRcdCQoZWwpLnJlbW92ZSgpO1xuXHR9KTtcblxuXHRyZXR1cm4gdGVtcGxhdGVzO1xufTtcbiIsIi8qKlxuICogVGhpcyBpcyB0aGUgc3RhcnRpbmcgcG9pbnQgdG8geW91ciBhcHBsaWNhdGlvbi4gIFlvdSBzaG91bGQgZ3JhYiB0ZW1wbGF0ZXMgYW5kIGNvbXBvbmVudHNcbiAqIGJlZm9yZSBjYWxsaW5nIEZSQU1FV09SSy5yYWlzZSgpIHVzaW5nIHNvbWV0aGluZyBsaWtlIFJlcXVpcmUuanMuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnNcblx0XHRkYXRhOiB7IGF1dGhlbnRpY2F0ZWQ6IGZhbHNlIH0sXG5cdFx0dGVtcGxhdGVzOiB7IGNvbXBvbmVudE5hbWU6IEhUTUxPclByZWNvbXBpbGVkRm4gfSxcblx0XHRjb21wb25lbnRzOiB7IGNvbXBvbmVudE5hbWU6IENvbXBvbmVudERlZmluaXRpb24gfVxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2JcbiAqL1xuXG52YXIgTG9nZ2VyID0gcmVxdWlyZSgnLi4vbG9nZ2VyL2luZGV4Jyk7XG52YXIgYnVpbGRDb21wb25lbnREZWZpbml0aW9uID0gcmVxdWlyZSgnLi4vZGVmaW5lL2J1aWxkRGVmaW5pdGlvbicpO1xudmFyIGJ1aWxkQ29tcG9uZW50UHJvdG90eXBlID0gcmVxdWlyZSgnLi9idWlsZFByb3RvdHlwZScpO1xudmFyIGNvbGxlY3RUZW1wbGF0ZXMgPSByZXF1aXJlKCcuL2NvbGxlY3RUZW1wbGF0ZXMnKTtcbnZhciBjb2xsZWN0UmVnaW9ucyA9IHJlcXVpcmUoJy4vY29sbGVjdFJlZ2lvbnMnKTtcbnZhciBzZXR1cFJvdXRlciA9IHJlcXVpcmUoJy4uL3JvdXRlci9pbmRleCcpO1xuXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcmFpc2Uob3B0aW9ucywgY2IpIHtcblxuXHQvLyBJZiBvbmx5IG9uZSBhcmcgaXMgcHJlc2VudCwgdXNlIG9wdGlvbnMgYXMgY2FsbGJhY2sgaWYgcG9zc2libGUuXG5cdC8vIElmIG9wdGlvbnMgYXJlIG5vdCBkZWZpbmVkLCB1c2UgYW4gZW1wdHkgb2JqZWN0LlxuXHRpZiAoIWNiICYmIF8uaXNGdW5jdGlvbihvcHRpb25zKSkge1xuXHRcdGNiID0gb3B0aW9ucztcblx0fVxuXHRpZiAoIV8uaXNQbGFpbk9iamVjdChvcHRpb25zKSkge1xuXHRcdG9wdGlvbnMgPSB7fTtcblx0fVxuXG5cdC8vIEFwcGx5IGRlZmF1bHRzXG5cdF8uZGVmYXVsdHMoRlJBTUVXT1JLLCB7XG5cdFx0dGhyb3R0bGVXaW5kb3dSZXNpemU6IDIwMCxcblx0XHRsb2dMZXZlbDogJ3dhcm4nLFxuXHRcdGxvZ2dlcjogdW5kZWZpbmVkLFxuXHRcdHByb2R1Y3Rpb246IGZhbHNlXG5cdH0pO1xuXG5cdC8vIEFwcGx5IG92ZXJyaWRlcyBmcm9tIG9wdGlvbnNcblx0Xy5leHRlbmQoRlJBTUVXT1JLLCBvcHRpb25zKTtcblxuXHQvLyBJbnRlcnByZXQgYHByb2R1Y3Rpb25gIGFzIGBsb2dMZXZlbCA9PT0gJ3NpbGVudCdgXG5cdGlmIChGUkFNRVdPUksucHJvZHVjdGlvbikge1xuXHRcdEZSQU1FV09SSy5sb2dMZXZlbCA9ICdzaWxlbnQnO1xuXHR9XG5cblx0Ly8gSW5pdGlhbGl6ZSBsb2dnZXJcblx0bmV3IExvZ2dlcigpO1xuXG5cdC8vIE1lcmdlIGRhdGEgaW50byBGUkFNRVdPUksuZGF0YVxuXHRfLmV4dGVuZChGUkFNRVdPUksuZGF0YSwgb3B0aW9ucy5kYXRhIHx8IHt9KTtcblxuXHQvLyBNZXJnZSBzcGVjaWZpZWQgdGVtcGxhdGVzIHdpdGggRlJBTUVXT1JLLnRlbXBsYXRlc1xuXHRfLmV4dGVuZChGUkFNRVdPUksudGVtcGxhdGVzLCBvcHRpb25zLnRlbXBsYXRlcyB8fCB7fSk7XG5cblx0Ly8gSWYgRlJBTUVXT1JLLmRlZmluZSgpIHdhcyB1c2VkLCBidWlsZCB0aGUgbGlzdCBvZiBjb21wb25lbnRzXG5cdC8vIEl0ZXJhdGUgdGhyb3VnaCB0aGUgZGVmaW5lIHF1ZXVlIGFuZCBjcmVhdGUgZWFjaCBkZWZpbml0aW9uXG5cdF8uZWFjaChGUkFNRVdPUksuX2RlZmluZVF1ZXVlLCBidWlsZENvbXBvbmVudERlZmluaXRpb24pO1xuXG5cdC8vIE1lcmdlIHNwZWNpZmllZCBjb21wb25lbnRzIHcvIEZSQU1FV09SSy5jb21wb25lbnRzXG5cdF8uZXh0ZW5kKEZSQU1FV09SSy5jb21wb25lbnRzLCBvcHRpb25zLmNvbXBvbmVudHMgfHwge30pO1xuXG5cdC8vIEJhY2sgdXAgZWFjaCBjb21wb25lbnQgZGVmaW5pdGlvbiBiZWZvcmUgdHJhbnNmb3JtaW5nIGl0IGludG8gYSBsaXZlIHByb3RvdHlwZVxuXHRGUkFNRVdPUksuY29tcG9uZW50RGVmcyA9IF8uY2xvbmUoRlJBTUVXT1JLLmNvbXBvbmVudHMpO1xuXG5cdC8vIFJ1biB0aGlzIGNhbGwgYmFjayB3aGVuIHRoZSBET00gaXMgcmVhZHlcblx0JChmdW5jdGlvbiAoKSB7XG5cblx0XHQvLyBDb2xsZWN0IGFueSA8c2NyaXB0PiB0YWcgdGVtcGxhdGVzIG9uIHRoZSBwYWdlXG5cdFx0Ly8gYW5kIGFic29yYiB0aGVtIGludG8gRlJBTUVXT1JLLnRlbXBsYXRlc1xuXHRcdF8uZXh0ZW5kKEZSQU1FV09SSy50ZW1wbGF0ZXMsIGNvbGxlY3RUZW1wbGF0ZXMoKSk7XG5cblx0XHQvLyBCdWlsZCBhY3R1YWwgcHJvdG90eXBlcyBmb3IgdGhlIGNvbXBvbmVudHNcblx0XHQvLyAobmVlZCB0aGUgdGVtcGxhdGVzIGF0IHRoaXMgcG9pbnQgdG8gbWFrZSB0aGlzIHdvcmspXG5cblx0XHRfLmVhY2goRlJBTUVXT1JLLmNvbXBvbmVudHMsIGJ1aWxkQ29tcG9uZW50UHJvdG90eXBlKTtcblxuXHRcdC8vIEdyYWIgaW5pdGlhbCByZWdpb25zIGZyb20gRE9NXG5cdFx0Y29sbGVjdFJlZ2lvbnMoKTtcblxuXHRcdC8vIEJpbmQgZ2xvYmFsIERPTSBldmVudHMgYXMgRlJBTUVXT1JLIGV2ZW50c1xuXHRcdC8vIChlLmcuICV3aW5kb3c6cmVzaXplKVxuXHRcdHZhciB0cmlnZ2VyUmVzaXplRXZlbnQgPSBfLmRlYm91bmNlKGZ1bmN0aW9uICgpIHtcblx0XHRcdEZSQU1FV09SSy50cmlnZ2VyKCcld2luZG93OnJlc2l6ZScpO1xuXHRcdH0sIG9wdGlvbnMudGhyb3R0bGVXaW5kb3dSZXNpemUgfHwgMCk7XG5cdFx0JCh3aW5kb3cpLnJlc2l6ZSh0cmlnZ2VyUmVzaXplRXZlbnQpO1xuXHRcdC8vIFRPRE86IGFkZCBtb3JlIGV2ZW50cyBhbmQgZXh0cmFwb2xhdGUgdGhpcyBsb2dpYyB0byBhIHNlcGFyYXRlIG1vZHVsZVxuXG5cdFx0Ly8gRG8gdGhlIGluaXRpYWwgcm91dGluZyBzZXF1ZW5jZVxuXHRcdC8vIExvb2sgYXQgdGhlICNmcmFnbWVudCB1cmwgYW5kIGZpcmUgdGhlIGdsb2JhbCByb3V0ZSBldmVudFxuXHRcdHNldHVwUm91dGVyKCk7XG5cdFx0RlJBTUVXT1JLLmhpc3Rvcnkuc3RhcnQoXy5kZWZhdWx0cyh7XG5cdFx0XHRwdXNoU3RhdGU6IHVuZGVmaW5lZCxcblx0XHRcdGhhc2hDaGFuZ2U6IHVuZGVmaW5lZCxcblx0XHRcdHJvb3Q6IHVuZGVmaW5lZFxuXHRcdH0sIG9wdGlvbnMpKTtcblxuXHRcdGlmIChjYikgY2IoKTtcblx0fSk7XG59O1xuIiwiLyoqXG4gKiByZWdpb24uYXBwZW5kKCBjb21wb25lbnRJZCwgW3Byb3BlcnRpZXNdIClcbiAqXG4gKiBDYWxscyBpbnNlcnQoKSBhdCBsYXN0IHBvc2l0aW9uXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYXBwZW5kKGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKSB7XG5cdC8vIEluc2VydCBhdCBsYXN0IHBvc2l0aW9uXG5cdHJldHVybiB0aGlzLmluc2VydCh0aGlzLl9jaGlsZHJlbi5sZW5ndGgsIGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKTtcbn07XG4iLCIvKipcbiAqIFNob3J0Y3V0IGZvciBjYWxsaW5nIGVtcHR5KCkgYW5kIHRoZW4gYXBwZW5kKCksXG4gKiBUaGlzIGlzIHRoZSBnZW5lcmFsIHVzZSBjYXNlIGZvciBtYW5hZ2luZyBzdWJjb21wb25lbnRzXG4gKiAoZS5nLiB3aGVuIGEgbmF2YmFyIGl0ZW0gaXMgdG91Y2hlZClcbiAqXG4gKiBAcGFyYW0gIHtzdHJpbmd9IGNvbXBvbmVudCAgVGhlIGlkIG5hbWUgb2YgdGhlIGNvbXBvbmV0IHRoYXQgeW91IHdhbnQgdG8gYXR0YWNoLlxuICogQHBhcmFtICB7T2JqZWN0fSBwcm9wZXJ0aWVzIFByb3BlcnRpZXMgdGhhdCB0aGUgYXR0YWNoZWQgY29tcG9uZW50IHdpbGwgYmUgaW5pdGFsaXplZCB3aXRoLlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYXR0YWNoKGNvbXBvbmVudCwgcHJvcGVydGllcykge1xuXHR0aGlzLmVtcHR5KCk7XG5cdHJldHVybiB0aGlzLmFwcGVuZChjb21wb25lbnQsIHByb3BlcnRpZXMpO1xufTtcbiIsIi8qKlxuICogcmVnaW9uLmVtcHR5KCApXG4gKlxuICogSXRlcmF0ZSBvdmVyIGVhY2ggY29tcG9uZW50IGluIHRoaXMgcmVnaW9uIGFuZCBjYWxsIC5jbG9zZSgpIG9uIGl0XG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBlbXB0eSgpIHtcblx0RlJBTUVXT1JLLmRlYnVnKHRoaXMucGFyZW50LmlkICsgJyA6OiBFbXB0eWluZyByZWdpb246ICcgKyB0aGlzLmlkKTtcblx0d2hpbGUgKHRoaXMuX2NoaWxkcmVuLmxlbmd0aCA+IDApIHtcblx0XHR0aGlzLnJlbW92ZSgwKTtcblx0fVxufTtcbiIsIi8qKlxuICogRmFjdG9yeSBtZXRob2QgdG8gZ2VuZXJhdGUgYSBuZXcgcmVnaW9uIGluc3RhbmNlIGZyb20gYSBET00gZWxlbWVudFxuICogSW1wbGVtZW50cyBgdGVtcGxhdGVgLCBgY291bnRgLCBhbmQgYGRhdGEtKmAgSFRNTCBhdHRyaWJ1dGVzLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gKiBAcmV0dXJucyByZWdpb24gaW5zdGFuY2VcbiAqL1xuXG52YXIgVXRpbHMgPSByZXF1aXJlKCcuLi91dGlscy91dGlscycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZyb21FbGVtZW50KGVsLCBwYXJlbnQpIHtcblxuXHQvLyBJZiBwYXJlbnQgaXMgbm90IHNwZWNpZmllZCwgbWFrZS1iZWxpZXZlLlxuXHRwYXJlbnQgPSBwYXJlbnQgfHwgeyBpZDogJyonIH07XG5cblxuXG5cdC8vIEJ1aWxkIHJlZ2lvblxuXHR2YXIgcmVnaW9uID0gbmV3IEZSQU1FV09SSy5SZWdpb24oe1xuXHRcdGlkOiBVdGlscy5lbDJpZChlbCksXG5cdFx0JGVsOiAkKGVsKSxcblx0XHRwYXJlbnQ6IHBhcmVudFxuXHR9KTtcblxuXHQvLyBJZiB0aGlzIHJlZ2lvbiBoYXMgYSBkZWZhdWx0IGNvbXBvbmVudC90ZW1wbGF0ZSBzZXQsXG5cdC8vIGdyYWIgdGhlIGlkICAtLSAgZS5nLiA8cmVnaW9uIGNvbnRlbnRzPVwiRm9vXCIgLz5cblx0dmFyIGNvbXBvbmVudElkID0gJChlbCkuYXR0cignY29udGVudHMnKTtcblxuXG5cdC8vIElmIGBjb3VudGAgaXMgc2V0LCByZW5kZXIgc3ViLWNvbXBvbmVudCBzcGVjaWZpZWQgbnVtYmVyIG9mIHRpbWVzLlxuXHQvLyBlLmcuIDxyZWdpb24gdGVtcGxhdGU9XCJGb29cIiBjb3VudD1cIjNcIiAvPlxuXHQvLyAodmVyaWZ5IEZSQU1FV09SSy5zaG9ydGN1dC5jb3VudCBpcyBlbmFibGVkKVxuXHR2YXIgY291bnRBdHRyLFxuXHRcdFx0Y291bnQgPSAxO1xuXG5cdGlmIChGUkFNRVdPUksuc2hvcnRjdXQuY291bnQpIHtcblxuXHRcdC8vIElmIGBjb3VudGAgYXR0cmlidXRlIGlzIG5vdCBmYWxzZSBvciB1bmRlZmluZWQsXG5cdFx0Ly8gdGhhdCBtZWFucyBpdCB3YXMgc2V0IGV4cGxpY2l0bHksIGFuZCB3ZSBzaG91bGQgdXNlIGl0XG5cdFx0Y291bnRBdHRyID0gJChlbCkuYXR0cignY291bnQnKTtcblx0XHQvLyBGUkFNRVdPUksuZGVidWcoJ0NvdW50IGF0dHIgaXMgOjogJywgY291bnRBdHRyKTtcblx0XHRpZiAoISFjb3VudEF0dHIpIHtcblx0XHRcdGNvdW50ID0gY291bnRBdHRyO1xuXHRcdH1cblx0fVxuXG5cblx0RlJBTUVXT1JLLmRlYnVnKFxuXHRcdHBhcmVudC5pZCArICcgOi06IEluc3RhbnRpYXRlZMKgbmV3IHJlZ2lvbicgK1xuXHRcdCggcmVnaW9uLmlkID8gJyBgJyArIHJlZ2lvbi5pZCArICdgJyA6ICcnICkgK1xuXHRcdCggY29tcG9uZW50SWQgPyAnIGFuZCBwb3B1bGF0ZWQgaXQgd2l0aCcgK1xuXHRcdFx0KCBjb3VudCA+IDEgPyBjb3VudCArICcgaW5zdGFuY2VzIG9mJyA6ICcgMScgKSArXG5cdFx0XHQnIGAnICsgY29tcG9uZW50SWQgKyAnYCcgOiAnJ1xuXHRcdCkgKyAnLidcblx0KTtcblxuXG5cblx0Ly8gQXBwZW5kIHN1Yi1jb21wb25lbnQocykgdG8gcmVnaW9uIGF1dG9tYXRpY2FsbHlcblx0Ly8gKHZlcmlmeSBGUkFNRVdPUksuc2hvcnRjdXQudGVtcGxhdGUgaXMgZW5hYmxlZClcblx0aWYgKCBGUkFNRVdPUksuc2hvcnRjdXQudGVtcGxhdGUgJiYgY29tcG9uZW50SWQgKSB7XG5cblx0XHQvLyBGUkFNRVdPUksuZGVidWcoXG5cdFx0Ly8gXHQnUHJlcGFyaW5nIHRvIHJlbmRlciAnICsgY291bnQgKyAnICcgKyBjb21wb25lbnRJZCArICcgY29tcG9uZW50cyBpbnRvIHJlZ2lvbiAnICtcblx0XHQvLyBcdCcoJyArIHJlZ2lvbi5pZCArICcpLCB3aGljaCBhbHJlYWR5IGNvbnRhaW5zICcgKyByZWdpb24uJGVsLmNoaWxkcmVuKCkubGVuZ3RoICtcblx0XHQvLyBcdCcgc3ViY29tcG9uZW50cy4nXG5cdFx0Ly8gKTtcblxuXHRcdHJlZ2lvbi5hcHBlbmQoY29tcG9uZW50SWQpO1xuXG5cdFx0Ly8gLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cdFx0Ly8gLy8gU0VSSU9VU0xZIFdURlxuXHRcdC8vIC8vIE1BSk9SIEhBWFhYWFhYWFxuXHRcdC8vIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXHRcdC8vIGNvdW50ID0gK2NvdW50ICsgMTtcblx0XHQvLyAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxuXHRcdC8vIGZvciAodmFyIGo9MDsgaiA8IGNvdW50OyBqKysgKSB7XG5cblx0XHQvLyBcdHJlZ2lvbi5hcHBlbmQoY29tcG9uZW50SWQpO1xuXG5cdFx0Ly8gXHQvLyBGUkFNRVdPUksuZGVidWcoXG5cdFx0Ly8gXHQvLyBcdCdyZW5kZXJpbmcgdGhlICcgKyBjb21wb25lbnRJZCArICcgY29tcG9uZW50LCByZW1haW5pbmc6ICcgK1xuXHRcdC8vIFx0Ly8gXHRjb3VudCArICcgYW5kIHRoZXJlIGFyZSAnICsgcmVnaW9uLiRlbC5jaGlsZHJlbigpLmxlbmd0aCArXG5cdFx0Ly8gXHQvLyBcdCcgc3ViY29tcG9uZW50IGVsZW1lbnRzIGluIHRoZSByZWdpb24gbm93J1xuXHRcdC8vIFx0Ly8gKTtcblxuXHRcdC8vIH1cblxuXHR9XG5cblx0cmV0dXJuIHJlZ2lvbjtcbn07XG4iLCIvKipcbiAqIFJlZ2lvbnNcbiAqL1xuXG52YXIgaW5zZXJ0ID0gcmVxdWlyZSgnLi9pbnNlcnQnKTtcbnZhciByZW1vdmUgPSByZXF1aXJlKCcuL3JlbW92ZScpO1xudmFyIGVtcHR5ID0gcmVxdWlyZSgnLi9lbXB0eScpO1xudmFyIGFwcGVuZCA9IHJlcXVpcmUoJy4vYXBwZW5kJyk7XG52YXIgYXR0YWNoID0gcmVxdWlyZSgnLi9hdHRhY2gnKTtcbnZhciBmcm9tRWxlbWVudCA9IHJlcXVpcmUoJy4vZnJvbUVsZW1lbnQnKTtcblxuUmVnaW9uID0gbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByZWdpb24ocHJvcGVydGllcykge1xuXG5cdF8uZXh0ZW5kKHRoaXMsIEZSQU1FV09SSy5FdmVudHMpO1xuXG5cdGlmICghcHJvcGVydGllcykge1xuXHRcdHByb3BlcnRpZXMgPSB7fTtcblx0fVxuXHRpZiAoIXByb3BlcnRpZXMuJGVsKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdUcnlpbmcgdG8gaW5zdGFudGlhdGUgcmVnaW9uIHdpdGggbm8gJGVsIScpO1xuXHR9XG5cblx0Ly8gRm9sZCBpbiBwcm9wZXJ0aWVzIHRvIHByb3RvdHlwZVxuXHRfLmV4dGVuZCh0aGlzLCBwcm9wZXJ0aWVzKTtcblxuXHQvLyBJZiBuZWl0aGVyIGFuIGlkIG5vciBhIGB0ZW1wbGF0ZWAgd2FzIHNwZWNpZmllZCxcblx0Ly8gd2UnbGwgdGhyb3cgYW4gZXJyb3IsIHNpbmNlIHRoZXJlJ3Mgbm8gd2F5IHRvIGdldCBhIGhvbGQgb2YgdGhlIHJlZ2lvblxuXHRpZiAoIXRoaXMuaWQgJiYgISh0aGlzLiRlbC5hdHRyKCdkZWZhdWx0JykgfHwgdGhpcy4kZWwuYXR0cigndGVtcGxhdGUnKSB8fFxuXHRcdHRoaXMuJGVsLmF0dHIoJ2NvbnRlbnRzJykpKSB7XG5cblx0XHR0aHJvdyBuZXcgRXJyb3IoXG5cdFx0XHR0aGlzLnBhcmVudC5pZCArICcgOjogRWl0aGVyIGBkYXRhLWlkYCwgYGNvbnRlbnRzYCwgb3IgYm90aCAnICtcblx0XHRcdCdtdXN0IGJlIHNwZWNpZmllZCBvbiByZWdpb25zLiBcXG4nICtcblx0XHRcdCdlLmcuIDxyZWdpb24gZGF0YS1pZD1cImZvb1wiIHRlbXBsYXRlPVwiU29tZUNvbXBvbmVudFwiPjwvcmVnaW9uPidcblx0XHQpO1xuXHR9XG5cblx0Ly8gU2V0IHVwIGxpc3QgdG8gaG91c2UgY2hpbGQgY29tcG9uZW50c1xuXHR0aGlzLl9jaGlsZHJlbiA9IFtdO1xuXG5cdF8uYmluZEFsbCh0aGlzKTtcblxuXHQvLyBTZXQgdXAgY29udmVuaWVuY2UgYWNjZXNzIHRvIHRoaXMgcmVnaW9uIGluIHRoZSBnbG9iYWwgcmVnaW9uIGNhY2hlXG5cdEZSQU1FV09SSy5yZWdpb25zW3RoaXMuaWRdID0gdGhpcztcbn07XG5cblJlZ2lvbi5mcm9tRWxlbWVudCA9IGZ1bmN0aW9uKGVsLCBwYXJlbnQpIHtcblx0cmV0dXJuIGZyb21FbGVtZW50KGVsLCBwYXJlbnQpO1xufTtcblJlZ2lvbi5wcm90b3R5cGUucmVtb3ZlID0gZnVuY3Rpb24oYXRJbmRleCkge1xuXHRyZXR1cm4gcmVtb3ZlLmNhbGwodGhpcywgYXRJbmRleCk7XG59O1xuUmVnaW9uLnByb3RvdHlwZS5lbXB0eSA9IGZ1bmN0aW9uKCkge1xuXHRyZXR1cm4gZW1wdHkuY2FsbCh0aGlzKTtcbn07XG5SZWdpb24ucHJvdG90eXBlLmluc2VydCA9IGZ1bmN0aW9uKGF0SW5kZXgsIGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKSB7XG5cdHJldHVybiBpbnNlcnQuY2FsbCh0aGlzLCBhdEluZGV4LCBjb21wb25lbnRJZCwgcHJvcGVydGllcyk7XG59O1xuUmVnaW9uLnByb3RvdHlwZS5hcHBlbmQgPSBmdW5jdGlvbihjb21wb25lbnRJZCwgcHJvcGVydGllcykge1xuXHRyZXR1cm4gYXBwZW5kLmNhbGwodGhpcywgY29tcG9uZW50SWQsIHByb3BlcnRpZXMpO1xufTtcblJlZ2lvbi5wcm90b3R5cGUuYXR0YWNoID0gZnVuY3Rpb24oY29tcG9uZW50LCBwcm9wZXJ0aWVzKSB7XG5cdHJldHVybiBhdHRhY2guY2FsbCh0aGlzLCBjb21wb25lbnQsIHByb3BlcnRpZXMpO1xufTtcbiIsIi8qKlxuICogcmVnaW9uLmluc2VydCggYXRJbmRleCwgY29tcG9uZW50SWQsIFtwcm9wZXJ0aWVzXSApXG4gKlxuICogVE9ETzogc3VwcG9ydCBhIGxpc3Qgb2YgcHJvcGVydGllcyBvYmplY3RzIGluIGxpZXUgb2YgdGhlIHByb3BlcnRpZXMgb2JqZWN0XG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpbnNlcnQoYXRJbmRleCwgY29tcG9uZW50SWQsIHByb3BlcnRpZXMpIHtcblxuXHR2YXIgZXJyID0gJyc7XG5cdGlmICghKGF0SW5kZXggfHwgXy5pc0Zpbml0ZShhdEluZGV4KSkpIHtcblx0XHRlcnIgKz0gdGhpcy5pZCArICcuaW5zZXJ0KCkgOjogTm8gYXRJbmRleCBzcGVjaWZpZWQhJztcblx0fVxuXHRlbHNlIGlmICghY29tcG9uZW50SWQpIHtcblx0XHRlcnIgKz0gdGhpcy5pZCArICcuaW5zZXJ0KCkgOjogTm8gY29tcG9uZW50SWQgc3BlY2lmaWVkISc7XG5cdH1cblx0aWYgKGVycikge1xuXHRcdHRocm93IG5ldyBFcnJvcihlcnIgKyAnXFxuVXNhZ2U6IGFwcGVuZChhdEluZGV4LCBjb21wb25lbnRJZCwgW3Byb3BlcnRpZXNdKScpO1xuXHR9XG5cblx0dmFyIGNvbXBvbmVudDtcblx0Ly8gSWYgY29tcG9uZW50SWQgaXMgYSBzdHJpbmcsIGxvb2sgdXAgY29tcG9uZW50IHByb3RvdHlwZSBhbmQgaW5zdGF0aWF0ZVxuXHRpZiAoJ3N0cmluZycgPT0gdHlwZW9mIGNvbXBvbmVudElkKSB7XG5cblx0XHR2YXIgY29tcG9uZW50UHJvdG90eXBlID0gRlJBTUVXT1JLLmNvbXBvbmVudHNbY29tcG9uZW50SWRdO1xuXG5cdFx0aWYgKCFjb21wb25lbnRQcm90b3R5cGUpIHtcblx0XHRcdHZhciB0ZW1wbGF0ZSA9IEZSQU1FV09SSy50ZW1wbGF0ZXNbY29tcG9uZW50SWRdO1xuXHRcdFx0aWYgKCF0ZW1wbGF0ZSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IgKCdJbiAnICtcblx0XHRcdFx0XHQodGhpcy5pZCB8fCAnQW5vbnltb3VzIHJlZ2lvbicpICsgJzo6IFRyeWluZyB0byBhdHRhY2ggJyArXG5cdFx0XHRcdFx0Y29tcG9uZW50SWQgKyAnLCBidXQgbm8gY29tcG9uZW50IG9yIHRlbXBsYXRlIGV4aXN0cyB3aXRoIHRoYXQgaWQuJyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIElmIG5vIGNvbXBvbmVudCBwcm90b3R5cGUgd2l0aCB0aGlzIGlkIGV4aXN0cyxcblx0XHRcdC8vIGNyZWF0ZSBhbiBhbm9ueW1vdXMgb25lIHRvIHVzZVxuXHRcdFx0Y29tcG9uZW50UHJvdG90eXBlID0gRlJBTUVXT1JLLkNvbXBvbmVudC5leHRlbmQoe1xuXHRcdFx0XHRpZDogY29tcG9uZW50SWQsXG5cdFx0XHRcdHRlbXBsYXRlOiB0ZW1wbGF0ZVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gSW5zdGFudGlhdGUgYW5kIHJlbmRlciB0aGUgY29tcG9uZW50IGluc2lkZSB0aGlzIHJlZ2lvblxuXHRcdGNvbXBvbmVudCA9IG5ldyBjb21wb25lbnRQcm90b3R5cGUoXy5leHRlbmQoe1xuXHRcdFx0JG91dGxldDogdGhpcy4kZWxcblx0XHR9LCBwcm9wZXJ0aWVzIHx8IHt9KSk7XG5cblxuXHR9XG5cblx0Ly8gT3RoZXJ3aXNlIGFzc3VtZSBhbiBpbnN0YW50aWF0ZWQgY29tcG9uZW50IG9iamVjdCB3YXMgc2VudFxuXHQvKiBUT0RPOiBDaGVjayB0aGF0IGNvbXBvbmVudCBvYmplY3QgaXMgdmFsaWQgKi9cblx0ZWxzZSB7XG5cdFx0Y29tcG9uZW50ID0gY29tcG9uZW50SWQ7XG5cdFx0Y29tcG9uZW50LiRvdXRsZXQgPSB0aGlzLiRlbDtcblx0fVxuXG5cdC8vIFNhdmUgcmVmZXJlbmNlIHRvIHBhcmVudFJlZ2lvblxuXHRjb21wb25lbnQucGFyZW50UmVnaW9uID0gdGhpcztcblxuXHQvLyBSZW5kZXIgY29tcG9uZW50IGludG8gdGhpcyByZWdpb25cblx0Y29tcG9uZW50LnJlbmRlcihhdEluZGV4KTtcblxuXHQvLyBBbmQga2VlcCB0cmFjayBvZiBpdCBpbiB0aGUgbGlzdCBvZiB0aGlzIHJlZ2lvbidzIGNoaWxkcmVuXG5cdHRoaXMuX2NoaWxkcmVuLnNwbGljZShhdEluZGV4LCAwLCBjb21wb25lbnQpO1xuXG5cdC8vIExvZyBmb3IgZGVidWdnaW5nIGBjb3VudGAgZGVjbGFyYXRpdmVcblx0dmFyIGRlYnVnU3RyID0gdGhpcy5wYXJlbnQuaWQgKyAnIDo6IEluc2VydGVkICcgKyBjb21wb25lbnRJZCArICcgaW50byAnO1xuXHRpZiAodGhpcy5pZCkgZGVidWdTdHIgKz0gJ3JlZ2lvbjogJyArIHRoaXMuaWQgKyAnIGF0IGluZGV4ICcgKyBhdEluZGV4O1xuXHRlbHNlIGRlYnVnU3RyICs9ICdhbm9ueW1vdXMgcmVnaW9uIGF0IGluZGV4ICcgKyBhdEluZGV4O1xuXHRGUkFNRVdPUksudmVyYm9zZShkZWJ1Z1N0cik7XG5cblx0cmV0dXJuIGNvbXBvbmVudDtcblxufTtcbiIsIi8qKlxuICogcmVnaW9uLnJlbW92ZSggYXRJbmRleCApXG4gKlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHJlbW92ZShhdEluZGV4KSB7XG5cblx0aWYgKCFhdEluZGV4ICYmICFfLmlzRmluaXRlKGF0SW5kZXgpKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKHRoaXMuaWQgKyAnLnJlbW92ZSgpIDo6IE5vIGF0SW5kZXggc3BlY2lmaWVkISBcXG5Vc2FnZTogcmVtb3ZlKGF0SW5kZXgpJyk7XG5cdH1cblxuXHQvLyBSZW1vdmUgdGhlIGNvbXBvbmVudCBmcm9tIHRoZSBsaXN0XG5cdHZhciBjb21wb25lbnQgPSB0aGlzLl9jaGlsZHJlbi5zcGxpY2UoYXRJbmRleCwgMSk7XG5cdGlmICghY29tcG9uZW50WzBdKSB7XG5cblx0XHQvLyBJZiB0aGUgbGlzdCBpcyBlbXB0eSwgZnJlYWsgb3V0XG5cdFx0dGhyb3cgbmV3IEVycm9yKHRoaXMuaWQgKyAnLnJlbW92ZSgpIDo6IFRyeWluZyB0byByZW1vdmUgYSBjb21wb25lbnQgdGhhdCBkb2VzblxcJ3QgZXhpc3QgYXQgaW5kZXggJyArIGF0SW5kZXgpO1xuXHR9XG5cblx0Ly8gU3F1ZWV6ZSB0aGUgY29tcG9uZW50IHRvIGRvIGdldCBhbGwgdGhlIGJpbmR5IGdvb2RuZXNzIG91dFxuXHRjb21wb25lbnRbMF0uY2xvc2UoKTtcblxuXHRGUkFNRVdPUksuZGVidWcodGhpcy5wYXJlbnQuaWQgKyAnIDo6IFJlbW92ZWQgY29tcG9uZW50IGF0IGluZGV4ICcgKyBhdEluZGV4ICsgJyBmcm9tIHJlZ2lvbjogJyArIHRoaXMuaWQpO1xufTtcbiIsIi8qKlxuICogU2V0cyB1cCB0aGUgRlJBTUVXT1JLIHJvdXRlci5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByb3V0ZXJTZXR1cCgpIHtcblxuXHQvLyBXaWxkY2FyZCByb3V0ZXMgdG8gZ2xvYmFsIGV2ZW50IGRlbGVnYXRvclxuXHR2YXIgcm91dGVyID0gbmV3IEZSQU1FV09SSy5Sb3V0ZXIoKTtcblx0cm91dGVyLnJvdXRlKC8oLiopLywgJ3JvdXRlJywgZnVuY3Rpb24gKHJvdXRlKSB7XG5cblx0XHQvLyBOb3JtYWxpemUgaG9tZSByb3V0ZXMgKCMgb3IgbnVsbCkgdG8gJydcblx0XHRpZiAoIXJvdXRlKSB7XG5cdFx0XHRyb3V0ZSA9ICcnO1xuXHRcdH1cblxuXHRcdC8vIFRyaWdnZXIgcm91dGVcblx0XHRGUkFNRVdPUksudHJpZ2dlcignIycgKyByb3V0ZSk7XG5cdH0pO1xuXG5cdC8vIEV4cG9zZSBgbmF2aWdhdGUoKWAgbWV0aG9kXG5cdEZSQU1FV09SSy5uYXZpZ2F0ZSA9IEZSQU1FV09SSy5oaXN0b3J5Lm5hdmlnYXRlO1xufVxuIiwiLyoqXG4gKiBCYXJlLWJvbmVzIERPTS9VSSB1dGlsaXRpZXNcbiAqL1xuXG52YXIgRXZlbnRzID0gcmVxdWlyZSgnLi9ldmVudHMnKTtcblxudmFyIERPTSA9IHtcblxuXHQvKipcblx0ICogRXhwb3NlIHRoZSBcIkRPTW15LWV2ZW50ZWRuZXNzXCIgb2YgZWxlbWVudHMgc28gdGhhdCBpdCdzIHNlbGVjdGFibGUgdmlhIENTU1xuXHQgKiBZb3UgY2FuIHVzZSB0aGlzIHRvIGFwcGx5IGEgZmV3IGNob2ljZSBET00gbW9kaWZpY2F0aW9ucyBvdXQgdGhlIGdhdGUtLVxuXHQgKiAoZS5nLiB0d2Vha3MgdGFyZ2V0aW5nIGNvbW1vbiBpc3N1ZXMgdGhhdCB0eXBpY2FsbHkgZ2V0IGZvcmdvdHRlbiwgbGlrZSBkaXNhYmxpbmcgdGV4dCBzZWxlY3Rpb24pXG5cdCAqXG5cdCAqIEBwYXJhbSB7Q29tcG9uZW50fSBjb21wb25lbnRcblx0ICovXG5cdGZsYWdCb3VuZEV2ZW50czogZnVuY3Rpb24gKCBjb21wb25lbnQgKSB7XG5cblx0XHQvLyBUT0RPOiBwcm92aWRlIGFjY2VzcyB0byBib3VuZCBnbG9iYWwgZXZlbnRzICglKSBhbmQgcm91dGVzICgjKSBhcyB3ZWxsXG5cdFx0Ly8gVE9ETzogZmxhZyBhbGwgRE9NIGV2ZW50cywgbm90IGp1c3QgY2xpY2sgYW5kIHRvdWNoXG5cblx0XHQvLyBCdWlsZCBzdWJzZXQgb2YganVzdCB0aGUgY2xpY2svdG91Y2ggZXZlbnRzXG5cdFx0dmFyIGNsaWNrT3JUb3VjaEV2ZW50cyA9IEV2ZW50cy5wYXJzZShcblx0XHRcdGNvbXBvbmVudC5ldmVudHMsXG5cdFx0XHR7IG9ubHk6IFsnY2xpY2snLCAndG91Y2gnLCAndG91Y2hzdGFydCcsICd0b3VjaGVuZCddIH1cblx0XHQpO1xuXG5cdFx0Ly8gSWYgbm8gY2xpY2svdG91Y2ggZXZlbnRzIGZvdW5kLCBiYWlsIG91dFxuXHRcdGlmICggY2xpY2tPclRvdWNoRXZlbnRzLmxlbmd0aCA8IDEgKSByZXR1cm47XG5cblx0XHQvLyBRdWVyeSBhZmZlY3RlZCBlbGVtZW50cyBmcm9tIERPTVxuXHRcdHZhciAkYWZmZWN0ZWQgPSBFdmVudHMuZ2V0RWxlbWVudHMoY2xpY2tPclRvdWNoRXZlbnRzLCBjb21wb25lbnQpO1xuXG5cdFx0Ly8gTk9URTogRm9yIG5vdywgdGhpcyBpcyBhbHdheXMganVzdCAnY2xpY2snXG5cdFx0dmFyIGJvdW5kRXZlbnRzU3RyaW5nID0gJ2NsaWNrJztcblxuXHRcdC8vIFNldCBgZGF0YS1GUkFNRVdPUkstY2xpY2thYmxlYCBjdXN0b20gYXR0cmlidXRlXG5cdFx0Ly8gKHVpIGxvZ2ljIHNob3VsZCBiZSBleHRlbmRlZCBpbiBDU1MpXG5cdFx0JGFmZmVjdGVkLmF0dHIoJ2RhdGEtJyArIEZSQU1FV09SSy5pZCArICctZXZlbnRzJywgYm91bmRFdmVudHNTdHJpbmcpO1xuXG5cdFx0RlJBTUVXT1JLLnZlcmJvc2UoXG5cdFx0XHRjb21wb25lbnQuaWQgKyAnIDo6ICcgK1xuXHRcdFx0J0Rpc2FibGVkIHVzZXIgdGV4dCBzZWxlY3Rpb24gb24gZWxlbWVudHMgdy8gY2xpY2svdG91Y2ggZXZlbnRzOicsXG5cdFx0XHRjbGlja09yVG91Y2hFdmVudHMsXG5cdFx0XHQkYWZmZWN0ZWRcblx0XHQpO1xuXHR9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IERPTTtcbiIsIi8qKlxuICogVXRpbGl0eSBFdmVudCB0b29sa2l0XG4gKi9cblxudmFyIFV0aWxzID0gcmVxdWlyZSgnLi91dGlscy5qcycpO1xuXG52YXIgRXZlbnRzID0ge1xuXG5cdC8qKlxuXHQgKiBQYXJzZXMgYSBkaWN0aW9uYXJ5IG9mIGV2ZW50cyBhbmQgb3B0aW9uYWxseSBmaWx0ZXJzIGJ5IHRoZSBldmVudCB0eXBlLiBJZiB0aGUgZXZlbnRcblx0ICpcblx0ICogQHBhcmFtICB7T2JqZWN0fSBldmVudHMgIFtBIEJhY2tib25lLlZpZXcgZXZlbnRzIG9iamVjdF1cblx0ICogQHBhcmFtICB7T2JqZWN0fSBvcHRpb25zIFtPcHRpb25zIG9iamVjdCB0aGF0IGFsbG93cyB1cyB0byBmaWx0ZXIgcGFyc2luZyB0byBjZXJ0YWluIGV2ZW50XG5cdCAqICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZXNdXG5cdCAqXG5cdCAqIEByZXR1cm4ge0FycmF5fSAgICAgICAgICBbQXJyYXkgY29udGFpbmluZyBwYXJzZWRFdmVudHMgdGhhdCBhcmUgbWF0Y2hpbmcgZXZlbnQga2V5c11cblx0ICovXG5cdHBhcnNlOiBmdW5jdGlvbiAoZXZlbnRzLCBvcHRpb25zKSB7XG5cblx0XHR2YXIgZXZlbnRLZXlzID0gXy5rZXlzKGV2ZW50cyB8fCB7fSksXG5cdFx0XHRsaW1pdEV2ZW50cyxcblx0XHRcdHBhcnNlZEV2ZW50cyA9IFtdO1xuXG5cdFx0Ly8gT3B0aW9uYWxseSBmaWx0ZXIgdXNpbmcgc2V0IG9mIGFjY2VwdGFibGUgZXZlbnQgdHlwZXNcblx0XHRsaW1pdEV2ZW50cyA9IG9wdGlvbnMub25seTtcblx0XHRldmVudEtleXMgPSBfLmZpbHRlcihldmVudEtleXMsIGZ1bmN0aW9uIGNoZWNrRXZlbnROYW1lIChldmVudEtleSkge1xuXG5cdFx0XHQvLyBQYXJzZSBldmVudCBzdHJpbmcgaW50byBzZW1hbnRpYyByZXByZXNlbnRhdGlvblxuXHRcdFx0dmFyIGV2ZW50ID0gRXZlbnRzLnBhcnNlRE9NRXZlbnQoZXZlbnRLZXkpO1xuXHRcdFx0cGFyc2VkRXZlbnRzLnB1c2goZXZlbnQpO1xuXG5cdFx0XHQvLyBPcHRpb25hbCBmaWx0ZXJcblx0XHRcdGlmIChsaW1pdEV2ZW50cykge1xuXHRcdFx0XHRyZXR1cm4gXy5jb250YWlucyhsaW1pdEV2ZW50cywgZXZlbnQubmFtZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBwYXJzZWRFdmVudHM7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFtnZXRFbGVtZW50cyBkZXNjcmlwdGlvbl1cblx0ICpcblx0ICogQHBhcmFtICB7QXJyYXl9IHNlbWFudGljRXZlbnRzIFtBIGxpc3Qgb2YgcGFyc2VkIGV2ZW50IG9iamVjdHNdXG5cdCAqIEBwYXJhbSAge0NvbXBvbmVudH0gY29udGV4dCAgICBbSW5zdGFuY2Ugb2YgYSBjb21wb25lbnQgdG8gdXNlIGFzIGEgc3RhcnRpbmcgcG9pbnQgZm9yXG5cdCAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhlIERPTSBxdWVyaWVzXVxuXHQgKlxuXHQgKiBAcmV0dXJuIHtBcnJheX0gICAgICAgICAgICAgICAgW0FuIGFycmF5IG9mIGpRdWVyeSBzZXQgb2YgbWF0Y2hlZCBlbGVtZW50c11cblx0ICovXG5cdGdldEVsZW1lbnRzOiBmdW5jdGlvbiAoc2VtYW50aWNFdmVudHMsIGNvbnRleHQpIHtcblxuXHRcdC8vIENvbnRleHQgb3B0aW9uYWxcblx0XHRjb250ZXh0ID0gY29udGV4dCB8fCB7ICQ6ICQgfTtcblxuXHRcdC8vIEl0ZXJhdGl2ZWx5IGJ1aWxkIGEgc2V0IG9mIGFmZmVjdGVkIGVsZW1lbnRzXG5cdFx0dmFyICRhZmZlY3RlZCA9ICQoKTtcblx0XHRfLmVhY2goc2VtYW50aWNFdmVudHMsIGZ1bmN0aW9uIGxvb2t1cEVsZW1lbnRzRm9yRXZlbnQgKGV2ZW50KSB7XG5cblx0XHRcdC8vIERldGVybWluZSBtYXRjaGVkIGVsZW1lbnRzXG5cdFx0XHQvLyBVc2UgZGVsZWdhdGUgc2VsZWN0b3IgaWYgc3BlY2lmaWVkXG5cdFx0XHQvLyBPdGhlcndpc2UsIGdyYWIgdGhlIGVsZW1lbnQgZm9yIHRoaXMgY29tcG9uZW50XG5cdFx0XHR2YXIgJG1hdGNoZWQgPVx0ZXZlbnQuc2VsZWN0b3IgP1xuXHRcdFx0XHRcdFx0XHRjb250ZXh0LiQoZXZlbnQuc2VsZWN0b3IpIDpcblx0XHRcdFx0XHRcdFx0Y29udGV4dC4kZWw7XG5cblx0XHRcdC8vIEFkZCBtYXRjaGVkIGVsZW1lbnRzIHRvIHNldFxuXHRcdFx0JGFmZmVjdGVkID0gJGFmZmVjdGVkLmFkZCggJG1hdGNoZWQgKTtcblx0XHR9LCB0aGlzKTtcblxuXHRcdHJldHVybiAkYWZmZWN0ZWQ7XG5cdH0sXG5cblxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHdoZXRoZXIgdGhlIHNwZWNpZmllZCBldmVudCBrZXkgbWF0Y2hlcyBhIERPTSBldmVudC5cblx0ICpcblx0ICogQHBhcmFtICB7U3RyaW5nfSBrZXkgW0tleSB0byBtYXRjaCBhZ2FpbnN0XVxuXHQgKlxuXHQgKiBpZiBubyBtYXRjaCBpcyBmb3VuZFxuXHQgKiBAcmV0dXJuIHtCb29sZWFufSBcdFx0W3JldHVybiBgZmFsc2VgXVxuXHQgKlxuXHQgKiBvdGhlcndpc2Vcblx0ICogQHJldHVybiB7T2JqZWN0fSAgXHRcdFtPYmplY3QgY29udGFpbmluZyB0aGUgYG5hbWVgIG9mIHRoZSBET00gZWxlbWVudCBhbmQgdGhlIGBzZWxlY3RvcmBdXG5cdCAqL1xuXHRwYXJzZURPTUV2ZW50OiBfLm1lbW9pemUoZnVuY3Rpb24oa2V5KSB7XG5cblx0XHR2YXIgbWF0Y2hlcyA9IGtleS5tYXRjaCh0aGlzWycvRE9NRXZlbnQvJ10pO1xuXG5cdFx0aWYgKCFtYXRjaGVzIHx8ICFtYXRjaGVzWzFdKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdG5hbWU6IG1hdGNoZXNbMV0sXG5cdFx0XHRzZWxlY3RvcjogbWF0Y2hlc1szXVxuXHRcdH07XG5cdH0pLFxuXG5cblx0LyoqXG5cdCAqIFN1cHBvcnRlZCBcImZpcnN0LWNsYXNzXCIgRE9NIGV2ZW50cy5cblx0ICogQHR5cGUge0FycmF5fVxuXHQgKi9cblx0bmFtZXM6IFtcblxuXHRcdC8vIExvY2FsaXplZCBicm93c2VyIGV2ZW50c1xuXHRcdC8vICh3b3JrcyBvbiBpbmRpdmlkdWFsIGVsZW1lbnRzKVxuXHRcdCdlcnJvcicsICdzY3JvbGwnLFxuXG5cdFx0Ly8gTW91c2UgZXZlbnRzXG5cdFx0J2NsaWNrJywgJ2RibGNsaWNrJywgJ21vdXNlZG93bicsICdtb3VzZXVwJywgJ2hvdmVyJywgJ21vdXNlZW50ZXInLCAnbW91c2VsZWF2ZScsXG5cdFx0J21vdXNlb3ZlcicsICdtb3VzZW91dCcsICdtb3VzZW1vdmUnLFxuXG5cdFx0Ly8gS2V5Ym9hcmQgZXZlbnRzXG5cdFx0J2tleWRvd24nLCAna2V5dXAnLCAna2V5cHJlc3MnLFxuXG5cdFx0Ly8gRm9ybSBldmVudHNcblx0XHQnYmx1cicsICdjaGFuZ2UnLCAnZm9jdXMnLCAnZm9jdXNpbicsICdmb2N1c291dCcsICdzZWxlY3QnLCAnc3VibWl0JyxcblxuXHRcdC8vIFJhdyB0b3VjaCBldmVudHNcblx0XHQndG91Y2hzdGFydCcsICd0b3VjaGVuZCcsICd0b3VjaG1vdmUnLCAndG91Y2hjYW5jZWwnLFxuXG5cdFx0Ly8gTWFudWZhY3R1cmVkIGV2ZW50c1xuXHRcdCd0b3VjaCcsXG5cblx0XHQvLyBUT0RPOlxuXHRcdCdyaWdodGNsaWNrJywgJ2NsaWNrb3V0c2lkZSdcblx0XVxufTtcblxuXG5cblxuLyoqXG4gKiBSZWdleHAgdG8gbWF0Y2ggXCJmaXJzdCBjbGFzc1wiIERPTSBldmVudHNcbiAqICh0aGVzZSBhcmUgYWxsb3dlZCBpbiB0aGUgdG9wIGxldmVsIG9mIGEgY29tcG9uZW50IGRlZmluaXRpb24gYXMgbWV0aG9kIGtleXMpXG4gKlx0XHRpLmUuIC9eKGNsaWNrfGhvdmVyfGJsdXJ8Zm9jdXMpKCAoLispKS9cbiAqXHRcdFx0WzFdID0+IGV2ZW50IG5hbWVcbiAqXHRcdFx0WzNdID0+IHNlbGVjdG9yXG4gKi9cblxuRXZlbnRzWycvRE9NRXZlbnQvJ10gPSBuZXcgUmVnRXhwKCdeKCcgKyBfLnJlZHVjZShFdmVudHMubmFtZXMsXG5cdGZ1bmN0aW9uIGJ1aWxkUmVnZXhwKG1lbW8sIGV2ZW50TmFtZSwgaW5kZXgpIHtcblxuXHRcdC8vIE9taXQgYHxgIHRoZSBmaXJzdCB0aW1lXG5cdFx0aWYgKGluZGV4ID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gbWVtbyArIGV2ZW50TmFtZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbWVtbyArICd8JyArIGV2ZW50TmFtZTtcblx0fSwgJycpICtcbicpKCAoLispKT8kJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gRXZlbnRzO1xuIiwiLyoqXG4gKiBUcmFuc2xhdGUgKipyaWdodC1oYW5kLXNpZGUgYWJicmV2aWF0aW9ucyoqIGludG8gZnVuY3Rpb25zIHRoYXQgcGVyZm9ybVxuICogdGhlIHByb3BlciBiZWhhdmlvcnMsIGUuZy5cbiAqXHRcdCNhYm91dF9tZVxuICpcdFx0JW1haW5NZW51Om9wZW5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHRyYW5zbGF0ZVNob3J0aGFuZCh2YWx1ZSwga2V5KSB7XG5cblx0dmFyIG1hdGNoZXMsIGZuO1xuXG5cdC8vIElmIHRoaXMgaXMgYW4gaW1wb3J0YW50LCBGUkFNRVdPUkstc3BlY2lmaWMgZGF0YSBrZXksXG5cdC8vIGFuZCBhIGZ1bmN0aW9uIHdhcyBzcGVjaWZpZWQsIHJ1biBpdCB0byBnZXQgaXRzIHZhbHVlXG5cdC8vICh0aGlzIGlzIHRvIGtlZXAgcGFyaXR5IHdpdGggQmFja2JvbmUncyBzaW1pbGFyIGZ1bmN0aW9uYWxpdHkpXG5cdGlmIChfLmlzRnVuY3Rpb24odmFsdWUpICYmIChrZXkgPT09ICdjb2xsZWN0aW9uJyB8fCBrZXkgPT09ICdtb2RlbCcpKSB7XG5cdFx0cmV0dXJuIHZhbHVlKCk7XG5cdH1cblxuXHQvLyBJZ25vcmUgb3RoZXIgbm9uLXN0cmluZ3Ncblx0aWYgKCFfLmlzU3RyaW5nKHZhbHVlKSkge1xuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxuXG5cdC8vIFJlZGlyZWN0cyB1c2VyIHRvIGNsaWVudC1zaWRlIFVSTCwgdy9vIGFmZmVjdGluZyBicm93c2VyIGhpc3Rvcnlcblx0Ly8gTGlrZSBjYWxsaW5nIGBCYWNrYm9uZS5oaXN0b3J5Lm5hdmlnYXRlKCcvZm9vJywgeyByZXBsYWNlOiB0cnVlIH0pYFxuXHRpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXiMjKC4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHRcdGZuID0gZnVuY3Rpb24gcmVkaXJlY3RBbmRDb3ZlclRyYWNrcygpIHtcblx0XHRcdHZhciB1cmwgPSBtYXRjaGVzWzFdO1xuXHRcdFx0RlJBTUVXT1JLLmhpc3RvcnkubmF2aWdhdGUodXJsLCB7XG5cdFx0XHRcdHRyaWdnZXI6IHRydWUsXG5cdFx0XHRcdHJlcGxhY2U6IHRydWVcblx0XHRcdH0pO1xuXHRcdH07XG5cdH1cblx0Ly8gTWV0aG9kIHRvIHJlZGlyZWN0IHVzZXIgdG8gYSBjbGllbnQtc2lkZSBVUkwsIHRoZW4gY2FsbCB0aGUgaGFuZGxlclxuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eIyguKlteLlxcc10rKS8pKSAmJiBtYXRjaGVzWzFdKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiBjaGFuZ2VVcmxGcmFnbWVudCgpIHtcblx0XHRcdHZhciB1cmwgPSBtYXRjaGVzWzFdO1xuXHRcdFx0RlJBTUVXT1JLLmhpc3RvcnkubmF2aWdhdGUodXJsLCB7XG5cdFx0XHRcdHRyaWdnZXI6IHRydWVcblx0XHRcdH0pO1xuXHRcdH07XG5cdH1cblx0Ly8gTWV0aG9kIHRvIHRyaWdnZXIgZ2xvYmFsIGV2ZW50XG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14oJS4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHRcdGZuID0gZnVuY3Rpb24gdHJpZ2dlckV2ZW50KCkge1xuXHRcdFx0dmFyIHRyaWdnZXIgPSBtYXRjaGVzWzFdO1xuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UodGhpcy5pZCArICcgOjogVHJpZ2dlcmluZyBldmVudCAoJyArIHRyaWdnZXIgKyAnKS4uLicpO1xuXHRcdFx0RlJBTUVXT1JLLnRyaWdnZXIodHJpZ2dlcik7XG5cdFx0fTtcblx0fVxuXHQvLyBNZXRob2QgdG8gZmlyZSBhIHRlc3QgYWxlcnRcblx0Ly8gKHVzZSBtZXNzYWdlLCBpZiBzcGVjaWZpZWQpXG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14hISFcXHMqKC4qW14uXFxzXSk/LykpKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiBiYW5nQWxlcnQoZSkge1xuXG5cdFx0XHQvLyBJZiBzcGVjaWZpZWQsIG1lc3NhZ2UgaXMgdXNlZCwgb3RoZXJ3aXNlICdBbGVydCB0cmlnZ2VyZWQhJ1xuXHRcdFx0dmFyIG1zZyA9IChtYXRjaGVzICYmIG1hdGNoZXNbMV0pIHx8ICdEZWJ1ZyBhbGVydCAoISEhKSB0cmlnZ2VyZWQhJztcblxuXHRcdFx0Ly8gT3RoZXIgZGlhZ25vc3RpYyBpbmZvcm1hdGlvblxuXHRcdFx0bXNnICs9ICdcXG5cXG5EaWFnbm9zdGljc1xcbj09PT09PT09PT09PT09PT09PT09PT09PVxcbic7XG5cdFx0XHRpZiAoZSAmJiBlLmN1cnJlbnRUYXJnZXQpIHtcblx0XHRcdFx0bXNnICs9ICdlLmN1cnJlbnRUYXJnZXQgOjogJyArIGUuY3VycmVudFRhcmdldDtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmlkKSB7XG5cdFx0XHRcdG1zZyArPSAndGhpcy5pZCA6OiAnICsgdGhpcy5pZDtcblx0XHRcdH1cblxuXHRcdFx0YWxlcnQobXNnKTtcblx0XHR9O1xuXHR9XG5cblx0Ly8gTWV0aG9kIHRvIGxvZyBhIG1lc3NhZ2UgdG8gdGhlIGNvbnNvbGVcblx0Ly8gKHVzZSBtZXNzYWdlLCBpZiBzcGVjaWZpZWQpXG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14+Pj5cXHMqKC4qW14uXFxzXSk/LykpKSB7XG5cblx0XHRmbiA9IGZ1bmN0aW9uIGxvZ01lc3NhZ2UoZSkge1xuXG5cdFx0XHQvLyBJZiBzcGVjaWZpZWQsIG1lc3NhZ2UgaXMgdXNlZCwgb3RoZXJ3aXNlIHVzZSBkZWZhdWx0XG5cdFx0XHR2YXIgbXNnID0gKG1hdGNoZXMgJiYgbWF0Y2hlc1sxXSkgfHwgJ0xvZyBtZXNzYWdlICg+Pj4pIHRyaWdnZXJlZCEnO1xuXHRcdFx0RlJBTUVXT1JLLmxvZyhtc2cpO1xuXHRcdH07XG5cdH1cblxuXHQvLyBNZXRob2QgdG8gYXR0YWNoIHRoZSBzcGVjaWZpZWQgY29tcG9uZW50L3RlbXBsYXRlIHRvIGEgcmVnaW9uXG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14oLispQCguKlteLlxcc10pLykpICYmIG1hdGNoZXNbMV0gJiYgbWF0Y2hlc1syXSkge1xuXHRcdGZuID0gZnVuY3Rpb24gYXR0YWNoVGVtcGxhdGUoKSB7XG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZSh0aGlzLmlkICsgJyA6OiBBdHRhY2hpbmcgYCcgKyBtYXRjaGVzWzJdICsgJ2AgdG8gYCcgKyBtYXRjaGVzWzFdICsgJ2AuLi4nKTtcblxuXHRcdFx0dmFyIHJlZ2lvbiA9IG1hdGNoZXNbMV07XG5cdFx0XHR2YXIgdGVtcGxhdGUgPSBtYXRjaGVzWzJdO1xuXG5cdFx0XHR0aGlzW3JlZ2lvbl0uYXR0YWNoKHRlbXBsYXRlKTtcblx0XHR9O1xuXHR9XG5cblxuXHQvLyBNZXRob2QgdG8gYWRkIHRoZSBzcGVjaWZpZWQgY2xhc3Ncblx0ZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXlxcK1xccypcXC4oLipbXi5cXHNdKS8pKSAmJiBtYXRjaGVzWzFdKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiBhZGRDbGFzcygpIHtcblx0XHRcdEZSQU1FV09SSy52ZXJib3NlKHRoaXMuaWQgKyAnIDo6IEFkZGluZyBjbGFzcyAoJyArIG1hdGNoZXNbMV0gKyAnKS4uLicpO1xuXHRcdFx0dGhpcy4kZWwuYWRkQ2xhc3MobWF0Y2hlc1sxXSk7XG5cdFx0fTtcblx0fVxuXHQvLyBNZXRob2QgdG8gcmVtb3ZlIHRoZSBzcGVjaWZpZWQgY2xhc3Ncblx0ZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXlxcLVxccypcXC4oLipbXi5cXHNdKS8pKSAmJiBtYXRjaGVzWzFdKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiByZW1vdmVDbGFzcygpIHtcblx0XHRcdEZSQU1FV09SSy52ZXJib3NlKHRoaXMuaWQgKyAnIDo6IFJlbW92aW5nIGNsYXNzICgnICsgbWF0Y2hlc1sxXSArICcpLi4uJyk7XG5cdFx0XHR0aGlzLiRlbC5yZW1vdmVDbGFzcyhtYXRjaGVzWzFdKTtcblx0XHR9O1xuXHR9XG5cdC8vIE1ldGhvZCB0byB0b2dnbGUgdGhlIHNwZWNpZmllZCBjbGFzc1xuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eXFwhXFxzKlxcLiguKlteLlxcc10pLykpICYmIG1hdGNoZXNbMV0pIHtcblx0XHRmbiA9IGZ1bmN0aW9uIHRvZ2dsZUNsYXNzKCkge1xuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UodGhpcy5pZCArICcgOjogVG9nZ2xpbmcgY2xhc3MgKCcgKyBtYXRjaGVzWzFdICsgJykuLi4nKTtcblx0XHRcdHRoaXMuJGVsLnRvZ2dsZUNsYXNzKG1hdGNoZXNbMV0pO1xuXHRcdH07XG5cdH1cblxuXHQvLyBUT0RPOlx0YWxsb3cgZGVzY2VuZGFudHMgdG8gYmUgY29udHJvbGxlZCB2aWEgc2hvcnRoYW5kXG5cdC8vXHRcdFx0ZS5nLiA6ICdsaS5yb3cgLS5oaWdobGlnaHRlZCdcblx0Ly9cdFx0XHR3b3VsZCByZW1vdmUgdGhlIGBoaWdobGlnaHRlZGAgY2xhc3MgZnJvbSB0aGlzLiQoJ2xpLnJvdycpXG5cblxuXHQvLyBJZiBzaG9ydC1oYW5kIG1hdGNoZWQsIHJldHVybiB0aGUgZGVyZWZlcmVuY2VkIGZ1bmN0aW9uXG5cdGlmIChmbikge1xuXG5cdFx0RlJBTUVXT1JLLnZlcmJvc2UoJ0ludGVycHJldGluZyBtZWFuaW5nIGZyb20gc2hvcnRoYW5kIDo6IGAnICsgdmFsdWUgKyAnYC4uLicpO1xuXG5cdFx0Ly8gQ3VycnkgdGhlIHJlc3VsdCBmdW5jdGlvbiB3aXRoIGFueSBzdWZmaXggbWF0Y2hlc1xuXHRcdHZhciBjdXJyaWVkRm4gPSBmbjtcblxuXHRcdC8vIFRyYWlsaW5nIGAuYCBpbmRpY2F0ZXMgYW4gZS5zdG9wUHJvcGFnYXRpb24oKVxuXHRcdGlmICh2YWx1ZS5tYXRjaCgvXFwuXFxzKiQvKSkge1xuXHRcdFx0Y3VycmllZEZuID0gZnVuY3Rpb24gYW5kU3RvcFByb3BhZ2F0aW9uKGUpIHtcblxuXHRcdFx0XHQvLyBCaW5kIChzbyBpdCBpbmhlcml0cyBjb21wb25lbnQgY29udGV4dCkgYW5kIGNhbGwgaW50ZXJpb3IgZnVuY3Rpb25cblx0XHRcdFx0Zm4uYXBwbHkodGhpcyk7XG5cblx0XHRcdFx0Ly8gdGhlbiBpbW1lZGlhdGVseSBzdG9wIGV2ZW50IGJ1YmJsaW5nL3Byb3BhZ2F0aW9uXG5cdFx0XHRcdGlmIChlICYmIGUuc3RvcFByb3BhZ2F0aW9uKSB7XG5cdFx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRGUkFNRVdPUksud2Fybihcblx0XHRcdFx0XHRcdHRoaXMuaWQgKyAnIDo6IFRyYWlsaW5nIGAuYCBzaG9ydGhhbmQgd2FzIHVzZWQgdG8gaW52b2tlIGFuICcgK1xuXHRcdFx0XHRcdFx0J2Uuc3RvcFByb3BhZ2F0aW9uKCksIGJ1dCBcIicgKyB2YWx1ZSArICdcIiB3YXMgbm90IHRyaWdnZXJlZCBieSBhIERPTSBldmVudCFcXG4nICtcblx0XHRcdFx0XHRcdCdQcm9iYWJseSBiZXN0IHRvIGRvdWJsZS1jaGVjayB0aGlzIHdhcyB3aGF0IHlvdSBtZWFudCB0byBkby4nKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY3VycmllZEZuO1xuXHR9XG5cblxuXHQvLyBPdGhlcndpc2UsIGlmIG5vIHNob3J0LWhhbmQgbWF0Y2hlZCwgcGFzcyB0aGUgb3JpZ2luYWwgdmFsdWVcblx0Ly8gc3RyYWlnaHQgdGhyb3VnaFxuXHRyZXR1cm4gdmFsdWU7XG59O1xuIiwiLyoqXG4gKiBVdGlsaXR5IGZ1bmN0aW9ucyB0aGF0IGFyZSB1c2VkIHRocm91Z2hvdXQgdGhlIGNvcmUuXG4gKi9cblxudmFyIFV0aWxzID0ge1xuXG5cdC8qKlxuXHQgKiBHcmFicyB0aGUgaWQgeG9yIGRhdGEtaWQgZnJvbSBhbiBIVE1MIGVsZW1lbnQuXG5cdCAqXG5cdCAqIEBwYXJhbSAge0RPTUVsZW1lbnR9IGVsICAgIFtFbGVtZW50IHdoZXJlIHdlIGFyZSBsb29raW5nIGZvciB0aGUgYGlkYCBvciBgZGF0YS1pZGAgYXR0cl1cblx0ICogQHBhcmFtICB7Qm9vbGVhbn0gcmVxdWlyZWQgW0RldGVybWluZXMgaWYgaXQgaXMgcmVxdWlyZWQgdG8gZmluZCBhbiBgaWRgIG9yIGBkYXRhLWlkYCBhdHRyXVxuXHQgKlxuXHQgKiBAcmV0dXJuIHtTdHJpbmd9ICAgICAgICAgIFx0W0lkZW50aWZpY2F0aW9uIHN0cmluZyB0aGF0IHdhcyBmb3VuZF1cblx0ICovXG5cdGVsMmlkOiBmdW5jdGlvbihlbCwgcmVxdWlyZWQpIHtcblxuXHRcdHZhciBpZCA9ICQoZWwpLmF0dHIoJ2lkJyk7XG5cdFx0dmFyIGRhdGFJZCA9ICQoZWwpLmF0dHIoJ2RhdGEtaWQnKTtcblx0XHR2YXIgY29udGVudHNJZCA9ICQoZWwpLmF0dHIoJ2NvbnRlbnRzJyk7XG5cblx0XHRpZiAoaWQgJiYgZGF0YUlkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoaWQgKyAnIDo6IENhbm5vdCBzZXQgYm90aCBgaWRgIGFuZCBgZGF0YS1pZGAhICBQbGVhc2UgdXNlIG9uZSBvciB0aGUgb3RoZXIuICAoZGF0YS1pZCBpcyBzYWZlc3QpJyk7XG5cdFx0fVxuXHRcdGlmIChyZXF1aXJlZCAmJiAhaWQgJiYgIWRhdGFJZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdObyBpZCBzcGVjaWZpZWQgaW4gZWxlbWVudCB3aGVyZSBpdCBpcyByZXF1aXJlZDpcXG4nICsgZWwpO1xuXHRcdH1cblxuXHRcdHJldHVybiBpZCB8fCBkYXRhSWQgfHwgY29udGVudHNJZDtcblx0fSxcblxuXHQvKipcblx0ICogTWFwIGFuIG9iamVjdCdzIHZhbHVlcywgYW5kIHJldHVybiBhIHZhbGlkIG9iamVjdCAodGhpcyBmdW5jdGlvbiBpcyBoYW5keSBiZWNhdXNlXG5cdCAqIHVuZGVyc2NvcmUubWFwKCkgcmV0dXJucyBhIGxpc3QsIG5vdCBhbiBvYmplY3QuKVxuXHQgKlxuXHQgKiBAcGFyYW0gIHtPYmplY3R9IG9iaiAgICAgICAgIFx0W09qZWN0IHdob3MgdmFsdWVzIHlvdSB3YW50IHRvIG1hcF1cblx0ICogQHBhcmFtICB7RnVuY3Rpb259IHRyYW5zZm9ybUZuIFtGdW5jdGlvbiB0byB0cmFuc2Zvcm0gZWFjaCBvYmplY3QgdmFsdWUgYnldXG5cdCAqXG5cdCAqIEByZXR1cm4ge09iamVjdH0gICAgICAgICAgICAgXHRbTmV3IG9iamVjdCB3aXRoIHRoZSB2YWx1ZXMgbWFwcGVkXVxuXHQgKi9cblx0b2JqTWFwOiBmdW5jdGlvbiBvYmpNYXAob2JqLCB0cmFuc2Zvcm1Gbikge1xuXHRcdHJldHVybiBfLm9iamVjdChfLmtleXMob2JqKSwgXy5tYXAob2JqLCB0cmFuc2Zvcm1GbikpO1xuXHR9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFV0aWxzOyJdfQ==
;