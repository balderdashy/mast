;(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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

},{}],2:[function(require,module,exports){
/**
 * Safely zap every trace about this component from memory.
 */

var helpers = require('./helpers');

module.exports = function close() {

	FRAMEWORK.debug('Closed ' + this.id + ' component.');
	var self = this;

	// Cancel current render and close jobs, if they're running
	if (this._rendering) {
		self._renderingCanceled = true;
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

},{"./helpers":3}],3:[function(require,module,exports){
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

			// If region has no id, generate a unique region id w/i this component
			// that is unlikely to collide with my other named regions
			if (!region.id) {
				region.id = ''+
					FRAMEWORK.options.frameworkId +
					'__anonymous_region__' +
					self.anonymousRegionCounter;

				// Increment counter for next time
				self.anonymousRegionCounter++;
			}

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

},{}],4:[function(require,module,exports){
/**
 * Component is an extended `Backbone.View`. It add features such as automatic event binding,
 * rendering, lifecycle hooks and events, and more.
 */

var lifecycleHooks     = require('./lifecycleHooks'),
		lifecycleEvents    = require('./lifecycleEvents'),
		bindEvents         = require('./bindEvents'),
		close              = require('./close'),
		render             = require('./render'),
		validateDefinition = require('./validateDefinition');

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

	// Keep track of a counter for use in generating
	// ids for anonymous components.
	this.anonymousRegionCounter = 0;

	// Disable or issue warnings about certain properties
	// and methods to avoid confusion
	properties = validateDefinition(properties);

	// Extend instance w/ specified properties and methods
	_.extend(this, properties);

	// Start with empty regions object
	this.regions = {};

	// Encourage child methods to use the component context
	_.bindAll(this);
};

},{"./bindEvents":1,"./close":2,"./lifecycleEvents":5,"./lifecycleHooks":6,"./render":7,"./validateDefinition":8}],5:[function(require,module,exports){
// Fired when the bound model is updated (`this.model`)
exports.afterChange = function (model, options) {};

// Fired when a model is added to the bound collection (`this.collection`)
exports.afterAdd = function (model, collection, options) {};

// Fired when a model is removed from the bound collection (`this.collection`)
exports.afterRemove = function (model, collection, options) {};

// Fired when the bound collection is wiped (`this.collection`)
exports.afterReset = function (collection, options) {};

},{}],6:[function(require,module,exports){
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

},{}],7:[function(require,module,exports){
/**
 * Run HTML template through engine and append results to outlet. Also rerender regions.
 * If atIndex is specified, the component is rendered at the given position within its
 * outlet. Otherwise, the last position is used.
 *
 * @param {Number} atIndex [The index in which to render this element]
 */

var DOM = require ('../utils/DOM'),
		helpers = require('./helpers'),
		bindEvents = require ('./bindEvents');

module.exports = function render(atIndex) {

	FRAMEWORK.debug(this.id + ' :---: Rendering component...');

	var self = this;

	// Cancel current render and close jobs, if they're running
	if (this._rendering) {
		FRAMEWORK.debug(this.id + ' :: render() canceled.');
		this._renderingCanceled = true;
		this.cancelRender();
		this._rendering = false;
	}
	if (this._closing) {
		FRAMEWORK.debug(this.id + ' :: close() canceled.');
		this.cancelClose();
		this._closing = false;
	}

	// Lock access to render
	this._rendering = true;

	// Trigger beforeRender method
	this.beforeRender(function () {

		// If rendering was canceled, break out
		// do not render, and do not call afterRender()
		if ( self._renderingCanceled ) {
			return;
		}

		// // Bind the events on model/collections and global triggered events.
		bindEvents.collectionEvents.call(self);
		bindEvents.modelEvents.call(self);
		bindEvents.globalTriggers.call(self);

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

},{"../utils/DOM":27,"./bindEvents":1,"./helpers":3}],8:[function(require,module,exports){
/**
 * Check the specified definition for obvious mistakes, especially likely deprecations and
 * validate that the model and collections are instances of Backbone's Data structures.
 *
 * @param {Object} properties [Object containing the properties of the component]
 */

module.exports = function validateDefinition(properties) {

	if (_.isObject(properties)) {

		// Determine component id
		var id = this.id || properties.id;

		function _validateBackboneInstance (type) {
			var Type = type[0].toUpperCase() + type.slice(1);

			if ( !properties[type] instanceof Backbone[Type] ) {

				Framework.error(
					'Component (' + id + ') has an invalid ' + type + '-- \n' +
					'If `' + type + '` is specified for a component, ' +
					'it must be an *instance* of a Backbone.' + Type + '.\n');

				if (properties[type] instanceof Backbone[Type].constructor) {
					Framework.error(
						'It looks like a Backbone.' + Type + ' *prototype* was specified instead of a ' +
						'Backbone.' + Type + ' *instance*.\n' +
						'Please `new` up the ' + type + ' -before- ' + Framework.id + '.raise(),' +
						'or use a wrapper function to achieve the same effect, e.g.:\n' +
						'`' + type + ': function () {\nreturn new Some' + Type + '();\n}`'
					);
				}

				Framework.warn('Ignoring invalid ' + type + ' :: ' + properties[type]);
				delete properties[type];
			}
		}

		// Check that this.collection is actually an instance of Backbone.Collection
		// and that this.model is actually an instance of Backbone.Model
		_validateBackboneInstance('model');
		_validateBackboneInstance('collection');

		// Clone properties to avoid inadvertent modifications
		return _.clone(properties);
	}

	else return {};

}

},{}],9:[function(require,module,exports){
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
 * Mast build file. The main file
 */

var define = require('./define/index');
var Region = require('./region/index');
var Component = require('./component/index');
var raise = require('./raise/index');

/**
 * Framework class definition that will create a new global instance of a custom Framework.
 *
 * @param {Object} options [options hash to initialize the custom framework with]
 */
Framework = function(options) {
	// Set the default options for those not passed in.
	options = _.defaults(options, {
		throttleWindowResize: 200,
		logLevel: 'warn',
		frameworkId: 'Mast',
		production: false,
		logger: undefined,
		shortcut: {
			template: true,
			count: true
		}
	});

	// Set a starting point to Backbone and add additional attribute.
	_.extend(this, Backbone, {
		options: options,
		templates: {},
		components: {},
		data: {},
		_defineQueue: [],
		regions: {}
	});

	// Expose a global for the custom framework.
	var frameworkName = options.frameworkId;
	window[frameworkName] = this

	// Throughtout the source code, there are operations on `FRAMEWORK` or code that accesses
	// its attributes. We will make `FRAMEWORK` accessable by assigning it the instance of the
	// custom Framework.
	FRAMEWORK = window[frameworkName];
}

// Framework prototype methods.
Framework.prototype.Region = Region;
Framework.prototype.Component = Component;
Framework.prototype.define = define;
Framework.prototype.raise = raise;


},{"./component/index":4,"./define/index":10,"./raise/index":17,"./region/index":22}],12:[function(require,module,exports){
/**
 *	Logget constructor method that will setup FRAMEWORK to log messages.
 */

var setupLogger = require('./setup');

module.exports = function Logger() {

	// Upon initialization, setup logger
	setupLogger(FRAMEWORK.options.logLevel);

	// In supported browsers, also run setupLogger again
	// when FRAMEWORK.logLevel is set by the user
	// TODO: find a way to do this without depending on __defineSetter__.
	if (_.isFunction(FRAMEWORK.__defineSetter__)) {
		FRAMEWORK.__defineSetter__('logLevel', function onChange (newLogLevel) {
			setupLogger(newLogLevel);
		});
	}
};

},{"./setup":13}],13:[function(require,module,exports){
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
					'(' + FRAMEWORK.options.frameworkId + '.logLevel = "' + logLevel + '")');
			}

			// Support for `debug` for backwards compatibility
			FRAMEWORK.debug = FRAMEWORK.log;

			// Verbose spits out log level
			FRAMEWORK.verbose('Log level set to :: ', logLevel);
		}
	}
}

},{}],14:[function(require,module,exports){
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

},{"../utils/events":28,"../utils/shorthand":29,"../utils/utils":30}],15:[function(require,module,exports){
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

},{}],16:[function(require,module,exports){
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

},{"../utils/utils":30}],17:[function(require,module,exports){
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

	// Interpret `production` as `logLevel === 'silent'`
	if (FRAMEWORK.options.production) {
		FRAMEWORK.options.logLevel = 'silent';
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
		}, FRAMEWORK.options.throttleWindowResize || 0);
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

},{"../define/buildDefinition":9,"../logger/index":12,"../router/index":26,"./buildPrototype":14,"./collectRegions":15,"./collectTemplates":16}],18:[function(require,module,exports){
/**
 * Append a component to the end of a region. This calls insert at the last position.
 *
 * @param  {String} componentId [The component id that we want to append]
 * @param  {Object} properties  [Properties to instantiate the component with]
 *
 * @return {Component}          [Newly appended Component]
 */
module.exports = function append(componentId, properties) {
	// Insert at last position
	return this.insert(this._children.length, componentId, properties);
};

},{}],19:[function(require,module,exports){
/**
 * Shortcut for calling empty() and then append(),
 * This is the general use case for managing subcomponents
 * (e.g. when a navbar item is touched)
 *
 * @param  {String} component  [The id name of the componet that you want to attach]
 * @param  {Object} properties [Properties that the attached component will be initalized with]
 *
 * @return {Component} 				 [Newly attached component]
 */
module.exports = function attach(component, properties) {
	this.empty();
	return this.append(component, properties);
};

},{}],20:[function(require,module,exports){
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

},{}],21:[function(require,module,exports){
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

	if (FRAMEWORK.options.shortcut.count) {

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
	if ( FRAMEWORK.options.shortcut.template && componentId ) {

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

},{"../utils/utils":30}],22:[function(require,module,exports){
/**
 * Regions
 */

var insert = require('./insert'),
		remove = require('./remove'),
		empty = require('./empty'),
		append = require('./append'),
		attach = require('./attach'),
		prepend = require('./prepend'),
		fromElement = require('./fromElement');

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
Region.prototype.prepend = function(componentId, properties) {
	return prepend.call(this, componentId, properties);
};

},{"./append":18,"./attach":19,"./empty":20,"./fromElement":21,"./insert":23,"./prepend":24,"./remove":25}],23:[function(require,module,exports){
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

},{}],24:[function(require,module,exports){
/**
 * Prepend a component to the beginning of a region. This calls insert at the first position.
 *
 * @param  {String} componentId [The component id that we want to prepend ]
 * @param  {Object} properties  [Properties to instantiate the component with]
 *
 * @return {Component}          [Newly prepended Component]
 */
module.exports = function prepend(componentId, properties) {
	// Insert at last position
	return this.insert(0, componentId, properties);
};

},{}],25:[function(require,module,exports){
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

},{}],26:[function(require,module,exports){
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

},{}],27:[function(require,module,exports){
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
		$affected.attr('data-' + FRAMEWORK.options.frameworkId + '-events', boundEventsString);

		FRAMEWORK.verbose(
			component.id + ' :: ' +
			'Disabled user text selection on elements w/ click/touch events:',
			clickOrTouchEvents,
			$affected
		);
	}
};

module.exports = DOM;

},{"./events":28}],28:[function(require,module,exports){
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

},{"./utils.js":30}],29:[function(require,module,exports){
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

},{}],30:[function(require,module,exports){
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
},{}]},{},[11])
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9jb21wb25lbnQvYmluZEV2ZW50cy5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL2NvbXBvbmVudC9jbG9zZS5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL2NvbXBvbmVudC9oZWxwZXJzLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvY29tcG9uZW50L2luZGV4LmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvY29tcG9uZW50L2xpZmVjeWNsZUV2ZW50cy5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL2NvbXBvbmVudC9saWZlY3ljbGVIb29rcy5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL2NvbXBvbmVudC9yZW5kZXIuanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9jb21wb25lbnQvdmFsaWRhdGVEZWZpbml0aW9uLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvZGVmaW5lL2J1aWxkRGVmaW5pdGlvbi5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL2RlZmluZS9pbmRleC5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL2luZGV4LmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvbG9nZ2VyL2luZGV4LmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvbG9nZ2VyL3NldHVwLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvcmFpc2UvYnVpbGRQcm90b3R5cGUuanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9yYWlzZS9jb2xsZWN0UmVnaW9ucy5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL3JhaXNlL2NvbGxlY3RUZW1wbGF0ZXMuanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9yYWlzZS9pbmRleC5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL3JlZ2lvbi9hcHBlbmQuanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9yZWdpb24vYXR0YWNoLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvcmVnaW9uL2VtcHR5LmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvcmVnaW9uL2Zyb21FbGVtZW50LmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvcmVnaW9uL2luZGV4LmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvcmVnaW9uL2luc2VydC5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL3JlZ2lvbi9wcmVwZW5kLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvcmVnaW9uL3JlbW92ZS5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL3JvdXRlci9pbmRleC5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL3V0aWxzL0RPTS5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL3V0aWxzL2V2ZW50cy5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL3V0aWxzL3Nob3J0aGFuZC5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL3V0aWxzL3V0aWxzLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcElBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3REQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNaQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1SkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQmluZCBjb2xsZWN0aW9uIGV2ZW50cyB0byBsaWZlY3ljbGUgZXZlbnQgaGFuZGxlcnNcbiAqL1xuZXhwb3J0cy5jb2xsZWN0aW9uRXZlbnRzID0gZnVuY3Rpb24oKSB7XG5cdC8vIEJpbmQgdG8gY29sbGVjdGlvbiBldmVudHMgaWYgb25lIHdhcyBwYXNzZWQgaW5cblx0aWYgKHRoaXMuY29sbGVjdGlvbikge1xuXG5cdFx0Ly8gTGlzdGVuIHRvIGV2ZW50c1xuXHRcdHRoaXMubGlzdGVuVG8odGhpcy5jb2xsZWN0aW9uLCAnYWRkJywgdGhpcy5hZnRlckFkZCk7XG5cdFx0dGhpcy5saXN0ZW5Ubyh0aGlzLmNvbGxlY3Rpb24sICdyZW1vdmUnLCB0aGlzLmFmdGVyUmVtb3ZlKTtcblx0XHR0aGlzLmxpc3RlblRvKHRoaXMuY29sbGVjdGlvbiwgJ3Jlc2V0JywgdGhpcy5hZnRlclJlc2V0KTtcblx0fVxufTtcblxuLyoqXG4gKiBCaW5kIG1vZGVsIGV2ZW50cyB0byBsaWZlY3ljbGUgZXZlbnQgaGFuZGxlcnMgYW5kIGFsc28gYWxsb3dzIGZvciBoYW5kbGVycyB0byBmaXJlXG4gKiBvbiBjZXJ0YWluIG1vZGVsIGF0dHJpYnV0ZSBjaGFuZ2VzLlxuICovXG5leHBvcnRzLm1vZGVsRXZlbnRzID0gZnVuY3Rpb24oKSB7XG5cdGlmICh0aGlzLm1vZGVsKSB7XG5cblx0XHQvLyBMaXN0ZW4gZm9yIGFueSBhdHRyaWJ1dGUgY2hhbmdlc1xuXHRcdC8vIGUuZy5cblx0XHQvLyAuYWZ0ZXJDaGFuZ2UobW9kZWwsIG9wdGlvbnMpXG5cdFx0Ly9cblx0XHR0aGlzLmxpc3RlblRvKHRoaXMubW9kZWwsICdjaGFuZ2UnLCBmdW5jdGlvbiBtb2RlbENoYW5nZWQgKG1vZGVsLCBvcHRpb25zKSB7XG5cdFx0XHRpZiAoXy5pc0Z1bmN0aW9uKHRoaXMuYWZ0ZXJDaGFuZ2UpKSB7XG5cdFx0XHRcdHRoaXMuYWZ0ZXJDaGFuZ2UobW9kZWwsIG9wdGlvbnMpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Ly8gTGlzdGVuIGZvciBzcGVjaWZpYyBhdHRyaWJ1dGUgY2hhbmdlc1xuXHRcdC8vIGUuZy5cblx0XHQvLyAuYWZ0ZXJDaGFuZ2UuY29sb3IobW9kZWwsIHZhbHVlLCBvcHRpb25zKVxuXHRcdC8vXG5cdFx0aWYgKF8uaXNPYmplY3QodGhpcy5hZnRlckNoYW5nZSkpIHtcblx0XHRcdF8uZWFjaCh0aGlzLmFmdGVyQ2hhbmdlLCBmdW5jdGlvbiAoaGFuZGxlciwgYXR0ck5hbWUpIHtcblxuXHRcdFx0XHQvLyBDYWxsIGhhbmRsZXIgd2l0aCBuZXdWYWwgdG8ga2VlcCBhcmd1bWVudHMgc3RyYWlnaHRmb3J3YXJkXG5cdFx0XHRcdHRoaXMubGlzdGVuVG8odGhpcy5tb2RlbCwgJ2NoYW5nZTonICsgYXR0ck5hbWUsIGZ1bmN0aW9uIGF0dHJDaGFuZ2VkIChtb2RlbCwgbmV3VmFsKSB7XG5cdFx0XHRcdFx0aGFuZGxlci5jYWxsKHNlbGYsIG5ld1ZhbCk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHR9LCB0aGlzKTtcblx0XHR9XG5cdH1cbn07XG5cbi8qKlxuICogTGlzdGVucyBmb3IgYW5kIHJ1bnMgaGFuZGxlcnMgb24gZ2xvYmFsIGV2ZW50cyB0aGF0IGFyZSBsaXN0ZW5lZCBmb3Igb24gYSBjb21wb25lbnQuXG4gKi9cbmV4cG9ydHMuZ2xvYmFsVHJpZ2dlcnMgPSBmdW5jdGlvbigpIHtcblxuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0dGhpcy5saXN0ZW5UbyhGUkFNRVdPUkssICdhbGwnLCBmdW5jdGlvbiAoZVJvdXRlKSB7XG5cblx0XHQvLyBUcmltIG9mZiBhbGwgYnV0IHRoZSBmaXJzdCBhcmd1bWVudCB0byBwYXNzIHRocm91Z2ggdG8gaGFuZGxlclxuXHRcdHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcblx0XHRhcmdzLnNoaWZ0KCk7XG5cblx0XHQvLyBJdGVyYXRlIHRocm91Z2ggZWFjaCBzdWJzY3JpcHRpb24gb24gdGhpcyBjb21wb25lbnRcblx0XHQvLyBhbmQgbGlzdGVuIGZvciB0aGUgc3BlY2lmaWVkIGdsb2JhbCBldmVudHNcblx0XHRfLmVhY2goc2VsZi5zdWJzY3JpcHRpb25zLCBmdW5jdGlvbihoYW5kbGVyLCBtYXRjaFBhdHRlcm4pIHtcblxuXHRcdFx0Ly8gR3JhYiByZWdleCBhbmQgcGFyYW0gcGFyc2luZyBsb2dpYyBmcm9tIEJhY2tib25lIGNvcmVcblx0XHRcdHZhciBleHRyYWN0UGFyYW1zID0gQmFja2JvbmUuUm91dGVyLnByb3RvdHlwZS5fZXh0cmFjdFBhcmFtZXRlcnMsXG5cdFx0XHRcdGNhbGN1bGF0ZVJlZ2V4ID0gQmFja2JvbmUuUm91dGVyLnByb3RvdHlwZS5fcm91dGVUb1JlZ0V4cDtcblxuXHRcdFx0Ly8gVHJpbSB0cmFpbGluZ1xuXHRcdFx0bWF0Y2hQYXR0ZXJuID0gbWF0Y2hQYXR0ZXJuLnJlcGxhY2UoL1xcLyokL2csICcnKTtcblx0XHRcdC8vIGFuZCBlciBzb3J0IG9mLi4gbGVhZGluZy4uIHNsYXNoZXNcblx0XHRcdG1hdGNoUGF0dGVybiA9IG1hdGNoUGF0dGVybi5yZXBsYWNlKC9eKFsjfiVdKVxcLyovZywgJyQxJyk7XG5cdFx0XHQvLyBUT0RPOiBvcHRpbWl6YXRpb24tIHRoaXMgcmVhbGx5IG9ubHkgaGFzIHRvIGJlIGRvbmUgb25jZSwgb24gcmFpc2UoKSwgd2Ugc2hvdWxkIGRvIHRoYXRcblxuXG5cdFx0XHQvLyBDb21lIHVwIHdpdGggcmVnZXggZm9yIHRoaXMgbWF0Y2hQYXR0ZXJuXG5cdFx0XHR2YXIgcmVnZXggPSBjYWxjdWxhdGVSZWdleChtYXRjaFBhdHRlcm4pO1xuXG5cdFx0XHQvLyBJZiB0aGlzIG1hdGNoUGF0ZXJuIGlzIHRoaXMgaXMgbm90IGEgbWF0Y2ggZm9yIHRoZSBldmVudCxcblx0XHRcdC8vIGBjb250aW51ZWAgaXQgYWxvbmcgdG8gaXQgY2FuIHRyeSB0aGUgbmV4dCBtYXRjaFBhdHRlcm5cblx0XHRcdGlmICghZVJvdXRlLm1hdGNoKHJlZ2V4KSkgcmV0dXJuO1xuXG5cdFx0XHQvLyBQYXJzZSBwYXJhbWV0ZXJzIGZvciB1c2UgYXMgYXJncyB0byB0aGUgaGFuZGxlclxuXHRcdFx0Ly8gKG9yIGFuIGVtcHR5IGxpc3QgaWYgbm9uZSBleGlzdClcblx0XHRcdHZhciBwYXJhbXMgPSBleHRyYWN0UGFyYW1zKHJlZ2V4LCBlUm91dGUpO1xuXG5cdFx0XHQvLyBIYW5kbGUgc3RyaW5nIHJlZGlyZWN0cyB0byBmdW5jdGlvbiBuYW1lc1xuXHRcdFx0aWYgKCFfLmlzRnVuY3Rpb24oaGFuZGxlcikpIHtcblx0XHRcdFx0aGFuZGxlciA9IHNlbGZbaGFuZGxlcl07XG5cblx0XHRcdFx0aWYgKCFoYW5kbGVyKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgdHJpZ2dlciBzdWJzY3JpcHRpb24gYmVjYXVzZSBvZiB1bmtub3duIGhhbmRsZXI6ICcgKyBoYW5kbGVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBCaW5kIGNvbnRleHQgYW5kIGFyZ3VtZW50cyB0byBzdWJzY3JpcHRpb24gaGFuZGxlclxuXHRcdFx0aGFuZGxlci5hcHBseShzZWxmLCBfLnVuaW9uKGFyZ3MsIHBhcmFtcykpO1xuXG5cdFx0fSk7XG5cdH0pO1xufTtcbiIsIi8qKlxuICogU2FmZWx5IHphcCBldmVyeSB0cmFjZSBhYm91dCB0aGlzIGNvbXBvbmVudCBmcm9tIG1lbW9yeS5cbiAqL1xuXG52YXIgaGVscGVycyA9IHJlcXVpcmUoJy4vaGVscGVycycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNsb3NlKCkge1xuXG5cdEZSQU1FV09SSy5kZWJ1ZygnQ2xvc2VkICcgKyB0aGlzLmlkICsgJyBjb21wb25lbnQuJyk7XG5cdHZhciBzZWxmID0gdGhpcztcblxuXHQvLyBDYW5jZWwgY3VycmVudCByZW5kZXIgYW5kIGNsb3NlIGpvYnMsIGlmIHRoZXkncmUgcnVubmluZ1xuXHRpZiAodGhpcy5fcmVuZGVyaW5nKSB7XG5cdFx0c2VsZi5fcmVuZGVyaW5nQ2FuY2VsZWQgPSB0cnVlO1xuXHRcdHRoaXMuY2FuY2VsUmVuZGVyKCk7XG5cdFx0c2VsZi5fcmVuZGVyaW5nID0gZmFsc2U7XG5cdH1cblx0aWYgKHRoaXMuX2Nsb3NpbmcpIHtcblx0XHR0aGlzLmNhbmNlbENsb3NlKCk7XG5cdFx0c2VsZi5fY2xvc2luZyA9IGZhbHNlO1xuXHR9XG5cblx0Ly8gTG9jayBhY2Nlc3MgdG8gY2xvc2UoKVxuXHR0aGlzLl9jbG9zaW5nID0gdHJ1ZTtcblxuXHR0aGlzLmJlZm9yZUNsb3NlKGZ1bmN0aW9uICgpIHtcblxuXHRcdC8vID4gTk9URTogYHRoaXMuX2Nsb3Npbmc9ZmFsc2VgIGNhbiBhbmQgcHJvYmFibHkgc2hvdWxkIGJlIHJlbW92ZWQsXG5cdFx0Ly8gPiBzaW5jZSBtdXRleCBpcyB1bm5lY2Vzc2FyeSBub3cgdGhhdCB0aGUgY29tcG9uZW50IGlzIHVwIGZvciBnYXJiYWdlIGNvbGxlY3Rpb25cblx0XHQvLyA+IFdhaXRpbmcgdG8gZG8gdGhpcyB1bnRpbCBpdCBjYW4gYmUgdGVzdGVkIGZ1cnRoZXJcblxuXHRcdC8vIFVubG9jayBjbG9zZSgpXG5cdFx0c2VsZi5fY2xvc2luZyA9IGZhbHNlO1xuXG5cdFx0Ly8gU3RvcCBsaXN0ZW5pbmcgdG8gYWxsIGdsb2JhbCB0cmlnZ2VycyAoJXwjKVxuXG5cdFx0Ly8gQ2xvc2UgYWxsIGNoaWxkIGNvbXBvbmVudHNcblxuXHRcdGhlbHBlcnMuZW1wdHlBbGxSZWdpb25zLmNhbGwoc2VsZik7XG5cblx0XHQvLyBDYWxsIG5hdGl2ZSBgQmFja2JvbmUuVmlldy5wcm90b3R5cGUucmVtb3ZlKClgXG5cdFx0Ly8gdG8gdW5kZWxlZ2F0ZSBldmVudHMsIGV0Yy5cblx0XHRzZWxmLnJlbW92ZSgpO1xuXG5cdH0pO1xufTtcbiIsIi8qKlxuICogSGVscGVyIGZ1bmN0aW9ucyB1c2VkIGJ5IGNvbXBvbmVudHMvXG4gKi9cblxudmFyIGhlbHBlcnMgPSBtb2R1bGUuZXhwb3J0cyA9IHtcblxuXHQvKipcbiAqIElmIGFueSByZWdpb25zIGV4aXN0IGluIHRoaXMgY29tcG9uZW50LFxuICogZW1wdHkgdGhlbSwgYW5kIHRoZW4gZGVsZXRlIHRoZW1cbiAqL1xuXHRlbXB0eUFsbFJlZ2lvbnM6IGZ1bmN0aW9uKCkge1xuXHRcdF8uZWFjaCh0aGlzLnJlZ2lvbnMsIGZ1bmN0aW9uIChyZWdpb24sIGtleSkge1xuXHRcdFx0cmVnaW9uLmVtcHR5KCk7XG5cdFx0XHRkZWxldGUgdGhpcy5yZWdpb25zW2tleV07XG5cdFx0fSwgdGhpcyk7XG5cdH0sXG5cblx0LyoqXG5cdCAqIEluc3RhbnRpYXRlIHJlZ2lvbiBjb21wb25lbnRzIGFuZCBhcHBlbmQgYW55IGRlZmF1bHRcblx0ICogdGVtcGxhdGVzL2NvbXBvbmVudHMgdG8gdGhlIERPTVxuXHQgKi9cblx0cmVuZGVyUmVnaW9uczogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdFx0aGVscGVycy5lbXB0eUFsbFJlZ2lvbnMoKTtcblxuXHRcdC8vIERldGVjdCBjaGlsZCByZWdpb25zIGluIHRlbXBsYXRlXG5cdFx0dmFyICRyZWdpb25zID0gdGhpcy4kKCdyZWdpb24sIFtkYXRhLXJlZ2lvbl0nKTtcblx0XHQkcmVnaW9ucy5lYWNoKGZ1bmN0aW9uIChpLCBlbCkge1xuXG5cdFx0XHQvLyBQcm92aWRlIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5IGZvclxuXHRcdFx0Ly8gYGRlZmF1bHRgLCBgY29udGVudHNgIGFuZCBgdGVtcGxhdGVgIG5vdGF0aW9uXG5cdFx0XHR2YXIgY29tcG9uZW50SWQgPSAkKGVsKS5hdHRyKCdkZWZhdWx0Jyk7XG5cdFx0XHRjb21wb25lbnRJZCA9IGNvbXBvbmVudElkIHx8ICQoZWwpLmF0dHIoJ2NvbnRlbnRzJyk7XG5cdFx0XHRjb21wb25lbnRJZCA9IGNvbXBvbmVudElkIHx8ICQoZWwpLmF0dHIoJ3RlbXBsYXRlJyk7XG5cdFx0XHQkKGVsKS5hdHRyKCdjb250ZW50cycsIGNvbXBvbmVudElkKTtcblxuXHRcdFx0Ly8gR2VuZXJhdGUgYSByZWdpb24gaW5zdGFuY2UgZnJvbSB0aGUgZWxlbWVudFxuXHRcdFx0Ly8gKG1vZGlmeWluZyB0aGUgRE9NIGFzIG5lY2Vzc2FyeSlcblx0XHRcdHZhciByZWdpb24gPSBGUkFNRVdPUksuUmVnaW9uLmZyb21FbGVtZW50KGVsLCBzZWxmKTtcblxuXHRcdFx0Ly8gSWYgcmVnaW9uIGhhcyBubyBpZCwgZ2VuZXJhdGUgYSB1bmlxdWUgcmVnaW9uIGlkIHcvaSB0aGlzIGNvbXBvbmVudFxuXHRcdFx0Ly8gdGhhdCBpcyB1bmxpa2VseSB0byBjb2xsaWRlIHdpdGggbXkgb3RoZXIgbmFtZWQgcmVnaW9uc1xuXHRcdFx0aWYgKCFyZWdpb24uaWQpIHtcblx0XHRcdFx0cmVnaW9uLmlkID0gJycrXG5cdFx0XHRcdFx0RlJBTUVXT1JLLm9wdGlvbnMuZnJhbWV3b3JrSWQgK1xuXHRcdFx0XHRcdCdfX2Fub255bW91c19yZWdpb25fXycgK1xuXHRcdFx0XHRcdHNlbGYuYW5vbnltb3VzUmVnaW9uQ291bnRlcjtcblxuXHRcdFx0XHQvLyBJbmNyZW1lbnQgY291bnRlciBmb3IgbmV4dCB0aW1lXG5cdFx0XHRcdHNlbGYuYW5vbnltb3VzUmVnaW9uQ291bnRlcisrO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBLZWVwIHRyYWNrIG9mIHJlZ2lvbnMsIHNpbmNlIHdlIGFyZSB0aGUgcGFyZW50IGNvbXBvbmVudFxuXHRcdFx0c2VsZi5yZWdpb25zW3JlZ2lvbi5pZF0gPSByZWdpb247XG5cblx0XHRcdC8vIEFzIGxvbmcgYXMgdGhlcmUgYXJlIG5vIGNvbGxpc2lvbnMsXG5cdFx0XHQvLyBwcm92aWRlIGEgZnJpZW5kbHkgcmVmZXJlbmNlIHRvIHRoZSByZWdpb24gb24gdGhlIHRvcCBsZXZlbCBvZiB0aGUgY29sbGVjdGlvblxuXHRcdFx0aWYgKCFzZWxmW3JlZ2lvbi5pZF0pIHtcblx0XHRcdFx0c2VsZltyZWdpb24uaWRdID0gcmVnaW9uO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0IHRlbXBsYXRlIEhUTUwgYW5kIGRhdGEgaW50byBhIGNvbXBpbGVkICR0ZW1wbGF0ZVxuXHQgKi9cblx0Y29tcGlsZVRlbXBsYXRlOiBmdW5jdGlvbigpIHtcblxuXHRcdC8vIENyZWF0ZSB0ZW1wbGF0ZSBkYXRhIGNvbnRleHQgYnkgcHJvdmlkaW5nIGFjY2VzcyB0byB0aGUgZ2xvYmFsIERhdGEgb2JqZWN0LFxuXHRcdC8vIEFsc28gZm9sZCBpbiB0aGUgbW9kZWwgYXNzb2NpYXRlZCB3aXRoIHRoaXMgY29tcG9uZW50LCBpZiB0aGVyZSBpcyBvbmVcblx0XHR2YXIgdGVtcGxhdGVDb250ZXh0ID0gXy5leHRlbmQoe1xuXG5cdFx0XHQvLyBBbGxvd3MgeW91IHRvIGdldCBhIGhvbGQgb2YgZGF0YSxcblx0XHRcdC8vIGJ1dCB1c2UgYSBkZWZhdWx0IHZhbHVlIGlmIGl0IGRvZXNuJ3QgZXhpc3Rcblx0XHRcdGdldDogZnVuY3Rpb24gKGtleSwgZGVmYXVsdFZhbCkge1xuXHRcdFx0XHR2YXIgdmFsID0gdGVtcGxhdGVDb250ZXh0W2tleV07XG5cdFx0XHRcdGlmICh0eXBlb2YgdmFsID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRcdHZhbCA9IGRlZmF1bHRWYWw7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHZhbDtcblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0Ly8gQWxsIEZSQU1FV09SSy5kYXRhIGlzIGF2YWlsYWJsZSBpbiBldmVyeSB0ZW1wbGF0ZVxuXHRcdEZSQU1FV09SSy5kYXRhKTtcblxuXHRcdC8vIElmIGEgbW9kZWwgaXMgcHJvdmlkZWQgZm9yIHRoaXMgY29tcG9uZW50LCBtYWtlIGl0IGF2YWlsYWJsZSBpbiB0aGlzIHRlbXBsYXRlXG5cdFx0aWYgKHRoaXMubW9kZWwpIHtcblx0XHRcdF8uZXh0ZW5kKHRlbXBsYXRlQ29udGV4dCwgdGhpcy5tb2RlbC5hdHRyaWJ1dGVzKTtcblx0XHR9XG5cblx0XHQvLyBUZW1wbGF0ZSB0aGUgSFRNTCB3aXRoIHRoZSBkYXRhXG5cdFx0dmFyIGh0bWw7XG5cdFx0dHJ5IHtcblx0XHRcdC8vIEFjY2VwdCBwcmVjb21waWxlZCB0ZW1wbGF0ZXNcblx0XHRcdGlmIChfLmlzRnVuY3Rpb24odGhpcy50ZW1wbGF0ZSkpIHtcblx0XHRcdFx0aHRtbCA9IHRoaXMudGVtcGxhdGUodGVtcGxhdGVDb250ZXh0KTtcblx0XHRcdH1cblx0XHRcdC8vIE9yIHJhdyBzdHJpbmdzXG5cdFx0XHRlbHNlIGh0bWwgPSBfLnRlbXBsYXRlKHRoaXMudGVtcGxhdGUsIHRlbXBsYXRlQ29udGV4dCk7XG5cdFx0fVxuXHRcdGNhdGNoIChlKSB7XG5cdFx0XHR2YXIgc3RyID0gZSxcblx0XHRcdFx0c3RhY2sgPSAnJztcblxuXHRcdFx0aWYgKGUgaW5zdGFuY2VvZiBFcnJvcikge1xuXHRcdFx0XHRzdHIgPSAgZS50b1N0cmluZygpO1xuXHRcdFx0XHRzdGFjayA9IGUuc3RhY2s7XG5cdFx0XHR9XG5cblx0XHRcdEZSQU1FV09SSy5lcnJvcih0aGlzLmlkICsgJyA6OiByZW5kZXIoKSBlcnJvciBpbiB0ZW1wbGF0ZSA6XFxuJyArIHN0ciArICdcXG5UZW1wbGF0ZSA6OiAnICsgaHRtbCArICdcXG4nICsgc3RhY2spO1xuXHRcdFx0aHRtbCA9IHRoaXMudGVtcGxhdGU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGh0bWw7XG5cdH1cblxufTtcbiIsIi8qKlxuICogQ29tcG9uZW50IGlzIGFuIGV4dGVuZGVkIGBCYWNrYm9uZS5WaWV3YC4gSXQgYWRkIGZlYXR1cmVzIHN1Y2ggYXMgYXV0b21hdGljIGV2ZW50IGJpbmRpbmcsXG4gKiByZW5kZXJpbmcsIGxpZmVjeWNsZSBob29rcyBhbmQgZXZlbnRzLCBhbmQgbW9yZS5cbiAqL1xuXG52YXIgbGlmZWN5Y2xlSG9va3MgICAgID0gcmVxdWlyZSgnLi9saWZlY3ljbGVIb29rcycpLFxuXHRcdGxpZmVjeWNsZUV2ZW50cyAgICA9IHJlcXVpcmUoJy4vbGlmZWN5Y2xlRXZlbnRzJyksXG5cdFx0YmluZEV2ZW50cyAgICAgICAgID0gcmVxdWlyZSgnLi9iaW5kRXZlbnRzJyksXG5cdFx0Y2xvc2UgICAgICAgICAgICAgID0gcmVxdWlyZSgnLi9jbG9zZScpLFxuXHRcdHJlbmRlciAgICAgICAgICAgICA9IHJlcXVpcmUoJy4vcmVuZGVyJyksXG5cdFx0dmFsaWRhdGVEZWZpbml0aW9uID0gcmVxdWlyZSgnLi92YWxpZGF0ZURlZmluaXRpb24nKTtcblxuQ29tcG9uZW50ID0gbW9kdWxlLmV4cG9ydHMgPSBCYWNrYm9uZS5WaWV3LmV4dGVuZCgpO1xuXG5cbl8uZXh0ZW5kKENvbXBvbmVudC5wcm90b3R5cGUsIHtcblxuXHQvLyBMaWZlY3ljbGUgSG9va3Ncblx0YmVmb3JlUmVuZGVyOiBmdW5jdGlvbihjYikge1xuXHRcdGxpZmVjeWNsZUhvb2tzLmJlZm9yZVJlbmRlci5jYWxsKHRoaXMsIGNiKTtcblx0fSxcblx0YmVmb3JlQ2xvc2U6IGZ1bmN0aW9uKGNiKSB7XG5cdFx0bGlmZWN5Y2xlSG9va3MuYmVmb3JlQ2xvc2UuY2FsbCh0aGlzLCBjYik7XG5cdH0sXG5cdGFmdGVyUmVuZGVyOiBmdW5jdGlvbigpIHtcblx0XHRsaWZlY3ljbGVIb29rcy5hZnRlclJlbmRlci5jYWxsKHRoaXMpO1xuXHR9LFxuXHRjYW5jZWxSZW5kZXI6IGZ1bmN0aW9uKCkge1xuXHRcdGxpZmVjeWNsZUhvb2tzLmNhbmNlbFJlbmRlci5jYWxsKHRoaXMpO1xuXHR9LFxuXHRjYW5jZWxDbG9zZTogZnVuY3Rpb24oKSB7XG5cdFx0bGlmZWN5Y2xlSG9va3MuY2FuY2VsQ2xvc2UuY2FsbCh0aGlzKTtcblx0fSxcblxuXHQvLyBMaWZlY3ljbGUgRXZlbnRzXG5cdGFmdGVyQ2hhbmdlOiBmdW5jdGlvbihtb2RlbCwgb3B0aW9ucykge1xuXHRcdGxpZmVjeWNsZUV2ZW50cy5hZnRlckNoYW5nZS5jYWxsKHRoaXMsIG1vZGVsLCBvcHRpb25zKTtcblx0fSxcblx0YWZ0ZXJBZGQ6IGZ1bmN0aW9uKG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zKSB7XG5cdFx0bGlmZWN5Y2xlRXZlbnRzLmFmdGVyQWRkLmNhbGwodGhpcywgbW9kZWwsIGNvbGxlY3Rpb24sIG9wdGlvbnMpO1xuXHR9LFxuXHRhZnRlclJlbW92ZTogZnVuY3Rpb24obW9kZWwsIGNvbGxlY3Rpb24sIG9wdGlvbnMpIHtcblx0XHRsaWZlY3ljbGVFdmVudHMuYWZ0ZXJSZW1vdmUuY2FsbCh0aGlzLCBtb2RlbCwgY29sbGVjdGlvbiwgb3B0aW9ucyk7XG5cdH0sXG5cdGFmdGVyUmVzZXQ6IGZ1bmN0aW9uKGNvbGxlY3Rpb24sIG9wdGlvbnMpIHtcblx0XHRsaWZlY3ljbGVFdmVudHMuYWZ0ZXJSZXNldC5jYWxsKHRoaXMsIGNvbGxlY3Rpb24sIG9wdGlvbnMpO1xuXHR9LFxuXG5cdC8vIFByb3RvdHlwZSBtZXRob2RzLlxuXHRjbG9zZTogZnVuY3Rpb24oKSB7XG5cdFx0Y2xvc2UuY2FsbCh0aGlzKTtcblx0fSxcblx0cmVuZGVyOiBmdW5jdGlvbihhdEluZGV4KSB7XG5cdFx0cmVuZGVyLmNhbGwodGhpcywgYXRJbmRleCk7XG5cdH1cbn0pO1xuXG5cblxuXG5Db21wb25lbnQucHJvdG90eXBlLmluaXRpYWxpemUgPSBmdW5jdGlvbihwcm9wZXJ0aWVzKSB7XG5cblx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdC8vIEtlZXAgdHJhY2sgb2YgYSBjb3VudGVyIGZvciB1c2UgaW4gZ2VuZXJhdGluZ1xuXHQvLyBpZHMgZm9yIGFub255bW91cyBjb21wb25lbnRzLlxuXHR0aGlzLmFub255bW91c1JlZ2lvbkNvdW50ZXIgPSAwO1xuXG5cdC8vIERpc2FibGUgb3IgaXNzdWUgd2FybmluZ3MgYWJvdXQgY2VydGFpbiBwcm9wZXJ0aWVzXG5cdC8vIGFuZCBtZXRob2RzIHRvIGF2b2lkIGNvbmZ1c2lvblxuXHRwcm9wZXJ0aWVzID0gdmFsaWRhdGVEZWZpbml0aW9uKHByb3BlcnRpZXMpO1xuXG5cdC8vIEV4dGVuZCBpbnN0YW5jZSB3LyBzcGVjaWZpZWQgcHJvcGVydGllcyBhbmQgbWV0aG9kc1xuXHRfLmV4dGVuZCh0aGlzLCBwcm9wZXJ0aWVzKTtcblxuXHQvLyBTdGFydCB3aXRoIGVtcHR5IHJlZ2lvbnMgb2JqZWN0XG5cdHRoaXMucmVnaW9ucyA9IHt9O1xuXG5cdC8vIEVuY291cmFnZSBjaGlsZCBtZXRob2RzIHRvIHVzZSB0aGUgY29tcG9uZW50IGNvbnRleHRcblx0Xy5iaW5kQWxsKHRoaXMpO1xufTtcbiIsIi8vIEZpcmVkIHdoZW4gdGhlIGJvdW5kIG1vZGVsIGlzIHVwZGF0ZWQgKGB0aGlzLm1vZGVsYClcbmV4cG9ydHMuYWZ0ZXJDaGFuZ2UgPSBmdW5jdGlvbiAobW9kZWwsIG9wdGlvbnMpIHt9O1xuXG4vLyBGaXJlZCB3aGVuIGEgbW9kZWwgaXMgYWRkZWQgdG8gdGhlIGJvdW5kIGNvbGxlY3Rpb24gKGB0aGlzLmNvbGxlY3Rpb25gKVxuZXhwb3J0cy5hZnRlckFkZCA9IGZ1bmN0aW9uIChtb2RlbCwgY29sbGVjdGlvbiwgb3B0aW9ucykge307XG5cbi8vIEZpcmVkIHdoZW4gYSBtb2RlbCBpcyByZW1vdmVkIGZyb20gdGhlIGJvdW5kIGNvbGxlY3Rpb24gKGB0aGlzLmNvbGxlY3Rpb25gKVxuZXhwb3J0cy5hZnRlclJlbW92ZSA9IGZ1bmN0aW9uIChtb2RlbCwgY29sbGVjdGlvbiwgb3B0aW9ucykge307XG5cbi8vIEZpcmVkIHdoZW4gdGhlIGJvdW5kIGNvbGxlY3Rpb24gaXMgd2lwZWQgKGB0aGlzLmNvbGxlY3Rpb25gKVxuZXhwb3J0cy5hZnRlclJlc2V0ID0gZnVuY3Rpb24gKGNvbGxlY3Rpb24sIG9wdGlvbnMpIHt9O1xuIiwiLy8gRmlyZWQgYXV0b21hdGljYWxseSB3aGVuIHRoZSB2aWV3IGlzIGluaXRpYWxseSBjcmVhdGVkXG4vLyBvbmx5IGZpcmVkIGFmdGVyd2FyZHMgaWYgdGhpcy5yZW5kZXIoKSBpcyBleHBsaWNpdGx5IGNhbGxlZFxuLy8gQ2FsbGJhY2sgbXVzdCBiZSBmaXJlZCEhXG5leHBvcnRzLmJlZm9yZVJlbmRlciA9IGZ1bmN0aW9uIChjYikge2NiKCk7fTtcblxuLy8gRmlyZWQgYXV0b21hdGljYWxseSB3aGVuIHRoZSB2aWV3IGlzIGluaXRpYWxseSBjcmVhdGVkXG4vLyBvbmx5IGZpcmVkIGFmdGVyd2FyZHMgaWYgdGhpcy5yZW5kZXIoKSBpcyBleHBsaWNpdGx5IGNhbGxlZFxuZXhwb3J0cy5hZnRlclJlbmRlciA9IGZ1bmN0aW9uICgpIHt9O1xuXG4vLyBGaXJlZCBhdXRvbWF0aWNhbGx5IHdoZW4gdGhlIHZpZXcgaXMgY2xvc2VkXG5leHBvcnRzLmJlZm9yZUNsb3NlID0gZnVuY3Rpb24gKGNiKSB7Y2IoKTt9O1xuXG4vLyBGaXJlZCBiZWZvcmUgcmVyZW5kZXJpbmcgb3IgY2xvc2luZyBhIHZpZXcgdGhhdCBpcyBhbHJlYWR5IHdhaXRpbmcgb24gYSBsb2NrXG5leHBvcnRzLmNhbmNlbFJlbmRlciA9IGZ1bmN0aW9uICgpIHtcblx0RlJBTUVXT1JLLndhcm4oJ2NhbmNlbFJlbmRlcigpIHNob3VsZCBiZSBkZWZpbmVkIGlmIGJlZm9yZUNsb3NlKGNiKSBvciBiZWZvcmVSZW5kZXIoY2IpJyArXG5cdFx0XHRcdFx0XHRcdFx0ICdhcmUgYmVpbmcgdXNlZCEnKTtcbn07XG5cbi8vIEZpcmVkIGJlZm9yZSByZXJlbmRlcmluZyBvciBjbG9zaW5nIGEgdmlldyB0aGF0IGlzIGFscmVhZHkgd2FpdGluZyBvbiBhIGxvY2tcbmV4cG9ydHMuY2FuY2VsQ2xvc2UgPSBmdW5jdGlvbiAoKSB7XG5cdEZSQU1FV09SSy53YXJuKCdjYW5jZWxDbG9zZSgpIHNob3VsZCBiZSBkZWZpbmVkIGlmIGJlZm9yZUNsb3NlKGNiKSBvciBiZWZvcmVSZW5kZXIoY2IpJyArXG5cdFx0XHRcdFx0XHRcdFx0ICdhcmUgYmVpbmcgdXNlZCEnKTtcbn07XG4iLCIvKipcbiAqIFJ1biBIVE1MIHRlbXBsYXRlIHRocm91Z2ggZW5naW5lIGFuZCBhcHBlbmQgcmVzdWx0cyB0byBvdXRsZXQuIEFsc28gcmVyZW5kZXIgcmVnaW9ucy5cbiAqIElmIGF0SW5kZXggaXMgc3BlY2lmaWVkLCB0aGUgY29tcG9uZW50IGlzIHJlbmRlcmVkIGF0IHRoZSBnaXZlbiBwb3NpdGlvbiB3aXRoaW4gaXRzXG4gKiBvdXRsZXQuIE90aGVyd2lzZSwgdGhlIGxhc3QgcG9zaXRpb24gaXMgdXNlZC5cbiAqXG4gKiBAcGFyYW0ge051bWJlcn0gYXRJbmRleCBbVGhlIGluZGV4IGluIHdoaWNoIHRvIHJlbmRlciB0aGlzIGVsZW1lbnRdXG4gKi9cblxudmFyIERPTSA9IHJlcXVpcmUgKCcuLi91dGlscy9ET00nKSxcblx0XHRoZWxwZXJzID0gcmVxdWlyZSgnLi9oZWxwZXJzJyksXG5cdFx0YmluZEV2ZW50cyA9IHJlcXVpcmUgKCcuL2JpbmRFdmVudHMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByZW5kZXIoYXRJbmRleCkge1xuXG5cdEZSQU1FV09SSy5kZWJ1Zyh0aGlzLmlkICsgJyA6LS0tOiBSZW5kZXJpbmcgY29tcG9uZW50Li4uJyk7XG5cblx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdC8vIENhbmNlbCBjdXJyZW50IHJlbmRlciBhbmQgY2xvc2Ugam9icywgaWYgdGhleSdyZSBydW5uaW5nXG5cdGlmICh0aGlzLl9yZW5kZXJpbmcpIHtcblx0XHRGUkFNRVdPUksuZGVidWcodGhpcy5pZCArICcgOjogcmVuZGVyKCkgY2FuY2VsZWQuJyk7XG5cdFx0dGhpcy5fcmVuZGVyaW5nQ2FuY2VsZWQgPSB0cnVlO1xuXHRcdHRoaXMuY2FuY2VsUmVuZGVyKCk7XG5cdFx0dGhpcy5fcmVuZGVyaW5nID0gZmFsc2U7XG5cdH1cblx0aWYgKHRoaXMuX2Nsb3NpbmcpIHtcblx0XHRGUkFNRVdPUksuZGVidWcodGhpcy5pZCArICcgOjogY2xvc2UoKSBjYW5jZWxlZC4nKTtcblx0XHR0aGlzLmNhbmNlbENsb3NlKCk7XG5cdFx0dGhpcy5fY2xvc2luZyA9IGZhbHNlO1xuXHR9XG5cblx0Ly8gTG9jayBhY2Nlc3MgdG8gcmVuZGVyXG5cdHRoaXMuX3JlbmRlcmluZyA9IHRydWU7XG5cblx0Ly8gVHJpZ2dlciBiZWZvcmVSZW5kZXIgbWV0aG9kXG5cdHRoaXMuYmVmb3JlUmVuZGVyKGZ1bmN0aW9uICgpIHtcblxuXHRcdC8vIElmIHJlbmRlcmluZyB3YXMgY2FuY2VsZWQsIGJyZWFrIG91dFxuXHRcdC8vIGRvIG5vdCByZW5kZXIsIGFuZCBkbyBub3QgY2FsbCBhZnRlclJlbmRlcigpXG5cdFx0aWYgKCBzZWxmLl9yZW5kZXJpbmdDYW5jZWxlZCApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyAvLyBCaW5kIHRoZSBldmVudHMgb24gbW9kZWwvY29sbGVjdGlvbnMgYW5kIGdsb2JhbCB0cmlnZ2VyZWQgZXZlbnRzLlxuXHRcdGJpbmRFdmVudHMuY29sbGVjdGlvbkV2ZW50cy5jYWxsKHNlbGYpO1xuXHRcdGJpbmRFdmVudHMubW9kZWxFdmVudHMuY2FsbChzZWxmKTtcblx0XHRiaW5kRXZlbnRzLmdsb2JhbFRyaWdnZXJzLmNhbGwoc2VsZik7XG5cblx0XHQvLyBVbmxvY2sgcmVuZGVyaW5nIG11dGV4XG5cdFx0c2VsZi5fcmVuZGVyaW5nID0gZmFsc2U7XG5cblx0XHRpZiAoIXNlbGYuJG91dGxldCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKHNlbGYuaWQgKyAnIDo6IFRyeWluZyB0byByZW5kZXIoKSwgYnV0IG5vICRvdXRsZXQgd2FzIGRlZmluZWQhJyk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVmcmVzaCBjb21waWxlZCB0ZW1wbGF0ZVxuXHRcdHZhciBodG1sID0gaGVscGVycy5jb21waWxlVGVtcGxhdGUuY2FsbChzZWxmKTtcblx0XHRpZiAoIWh0bWwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcih0aGlzLmlkICsgJyA6OiBVbmFibGUgdG8gcmVuZGVyIGNvbXBvbmVudCBiZWNhdXNlIHRlbXBsYXRlIGNvbXBpbGF0aW9uIGRpZCBub3QgcmV0dXJuIGFueSBIVE1MLicpO1xuXHRcdH1cblxuXHRcdC8vIFN0cmlwIHRyYWlsaW5nIGFuZCBsZWFkaW5nIHdoaXRlc3BhY2UgdG8gYXZvaWQgZmFsc2VseSBkaWFnbm9zaW5nXG5cdFx0Ly8gbXVsdGlwbGUgZWxlbWVudHMsIHdoZW4gb25seSBvbmUgYWN0dWFsbHkgZXhpc3RzXG5cdFx0Ly8gKHRoaXMgbWlzZGlhZ25vc2lzIHdyYXBzIHRoZSB0ZW1wbGF0ZSBpbiBhbiBleHRyYW5lb3VzIDxkaXY+KVxuXHRcdGh0bWwgPSBodG1sLnJlcGxhY2UoL15cXHMqLywgJycpO1xuXHRcdGh0bWwgPSBodG1sLnJlcGxhY2UoL1xccyokLywgJycpO1xuXHRcdGh0bWwgPSBodG1sLnJlcGxhY2UoLyhcXHJ8XFxuKSovLCAnJyk7XG5cblx0XHQvLyBTdHJpcCBIVE1MIGNvbW1lbnRzLCB0aGVuIHN0cmlwIHdoaXRlc3BhY2UgYWdhaW5cblx0XHQvLyAoVE9ETzogb3B0aW1pemUgdGhpcylcblx0XHRodG1sID0gaHRtbC5yZXBsYWNlKC8oPCEtLS4rLS0+KSovLCAnJyk7XG5cdFx0aHRtbCA9IGh0bWwucmVwbGFjZSgvXlxccyovLCAnJyk7XG5cdFx0aHRtbCA9IGh0bWwucmVwbGFjZSgvXFxzKiQvLCAnJyk7XG5cdFx0aHRtbCA9IGh0bWwucmVwbGFjZSgvKFxccnxcXG4pKi8sICcnKTtcblxuXHRcdC8vIFBhcnNlIGEgRE9NIG5vZGUgb3Igc2VyaWVzIG9mIERPTSBub2RlcyBmcm9tIHRoZSBuZXdseSB0ZW1wbGF0ZWQgSFRNTFxuXHRcdHZhciBwYXJzZWROb2RlcyA9ICQucGFyc2VIVE1MKGh0bWwpO1xuXHRcdHZhciBlbCA9IHBhcnNlZE5vZGVzWzBdO1xuXG5cdFx0Ly8gSWYgbm8gbm9kZXMgd2VyZSBwYXJzZWQsIHRocm93IGFuIGVycm9yXG5cdFx0aWYgKHBhcnNlZE5vZGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKHNlbGYuaWQgKyAnIDo6IHJlbmRlcigpIHJhbiBpbnRvIGEgcHJvYmxlbSByZW5kZXJpbmcgdGhlIHRlbXBsYXRlIHdpdGggSFRNTCA9PiBcXG4nK2h0bWwpO1xuXHRcdH1cblxuXHRcdC8vIElmIHRoZXJlIGlzIG5vdCBvbmUgc2luZ2xlIHdyYXBwZXIgZWxlbWVudCxcblx0XHQvLyBvciBpZiB0aGUgcmVuZGVyZWQgdGVtcGxhdGUgY29udGFpbnMgb25seSBhIHNpbmdsZSB0ZXh0IG5vZGUsXG5cdFx0Ly8gKG9yIGp1c3QgYSBsb25lIHJlZ2lvbilcblx0XHRlbHNlIGlmIChwYXJzZWROb2Rlcy5sZW5ndGggPiAxIHx8IHBhcnNlZE5vZGVzWzBdLm5vZGVUeXBlID09PSAzIHx8XG5cdFx0XHRcdFx0XHQgJChwYXJzZWROb2Rlc1swXSkuaXMoJ3JlZ2lvbicpKSB7XG5cblx0XHRcdEZSQU1FV09SSy5sb2coc2VsZi5pZCArICcgOjogV3JhcHBpbmcgdGVtcGxhdGUgaW4gPGRpdi8+Li4uJywgcGFyc2VkTm9kZXMpO1xuXG5cdFx0XHQvLyB3cmFwIHRoZSBodG1sIHVwIGluIGEgY29udGFpbmVyIDxkaXYvPlxuXHRcdFx0ZWwgPSAkKCc8ZGl2Lz4nKS5hcHBlbmQoaHRtbCk7XG5cdFx0XHRlbCA9IGVsWzBdO1xuXHRcdH1cblxuXHRcdC8vIFNldCBCYWNrYm9uZSBlbGVtZW50IChjYWNoZSBhbmQgcmVkZWxlZ2F0ZSBET00gZXZlbnRzKVxuXHRcdC8vIChXaWxsIGFsc28gdXBkYXRlIHNlbGYuJGVsKVxuXHRcdHNlbGYuc2V0RWxlbWVudChlbCk7XG5cdFx0Ly8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cblxuXHRcdC8vIERldGVjdCBhbmQgcmVuZGVyIGFsbCByZWdpb25zIGFuZCB0aGVpciBkZXNjZW5kZW50IGNvbXBvbmVudHMgYW5kIHJlZ2lvbnNcblx0XHRoZWxwZXJzLnJlbmRlclJlZ2lvbnMuY2FsbChzZWxmKTtcblxuXHRcdC8vIEluc2VydCB0aGUgZWxlbWVudCBhdCB0aGUgcHJvcGVyIHBsYWNlIGFtb25nc3QgdGhlIG91dGxldCdzIGNoaWxkcmVuXG5cdFx0dmFyIG5laWdoYm9ycyA9IHNlbGYuJG91dGxldC5jaGlsZHJlbigpO1xuXHRcdGlmIChfLmlzRmluaXRlKGF0SW5kZXgpICYmIG5laWdoYm9ycy5sZW5ndGggPiAwICYmIG5laWdoYm9ycy5sZW5ndGggPiBhdEluZGV4KSB7XG5cdFx0XHRuZWlnaGJvcnMuZXEoYXRJbmRleCkuYmVmb3JlKHNlbGYuJGVsKTtcblx0XHR9XG5cblx0XHQvLyBCdXQgaWYgdGhlIG91dGxldCBpcyBlbXB0eSwgb3IgdGhlcmUncyBubyBhdEluZGV4LCBqdXN0IHN0aWNrIGl0IG9uIHRoZSBlbmRcblx0XHRlbHNlIHNlbGYuJG91dGxldC5hcHBlbmQoc2VsZi4kZWwpO1xuXG5cdFx0Ly8gRmluYWxseSwgdHJpZ2dlciBhZnRlclJlbmRlciBtZXRob2Rcblx0XHRzZWxmLmFmdGVyUmVuZGVyKCk7XG5cblx0XHQvLyBBZGQgZGF0YSBhdHRyaWJ1dGVzIHRvIHRoaXMgY29tcG9uZW50J3MgJGVsLCBwcm92aWRpbmcgYWNjZXNzXG5cdFx0Ly8gdG8gd2hldGhlciB0aGUgZWxlbWVudCBoYXMgdmFyaW91cyBET00gYmluZGluZ3MgZnJvbSBzdHlsZXNoZWV0cy5cblx0XHQvLyAoaGFuZHkgZm9yIGRpc2FibGluZyB0ZXh0IHNlbGVjdGlvbiBhY2NvcmRpbmdseSwgZXRjLilcblx0XHQvL1xuXHRcdC8vIC0+IGRpc2FibGUgZm9yIHRoaXMgY29tcG9uZW50IHdpdGggYHRoaXMuYXR0ckZsYWdzID0gZmFsc2VgXG5cdFx0Ly8gLT4gb3IgZ2xvYmFsbHkgd2l0aCBgRlJBTUVXT1JLLmF0dHJGbGFncyA9IGZhbHNlYFxuXHRcdC8vXG5cdFx0Ly8gVE9ETzogbWFrZSBpdCB3b3JrIHdpdGggZGVsZWdhdGVkIERPTSBldmVudCBiaW5kaW5nc1xuXHRcdC8vXG5cdFx0aWYgKHNlbGYuYXR0ckZsYWdzICE9PSBmYWxzZSAmJiBGUkFNRVdPUksuYXR0ckZsYWdzICE9PSBmYWxzZSkge1xuXHRcdFx0RE9NLmZsYWdCb3VuZEV2ZW50cyhzZWxmKTtcblx0XHR9XG5cdH0pO1xufVxuIiwiLyoqXG4gKiBDaGVjayB0aGUgc3BlY2lmaWVkIGRlZmluaXRpb24gZm9yIG9idmlvdXMgbWlzdGFrZXMsIGVzcGVjaWFsbHkgbGlrZWx5IGRlcHJlY2F0aW9ucyBhbmRcbiAqIHZhbGlkYXRlIHRoYXQgdGhlIG1vZGVsIGFuZCBjb2xsZWN0aW9ucyBhcmUgaW5zdGFuY2VzIG9mIEJhY2tib25lJ3MgRGF0YSBzdHJ1Y3R1cmVzLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBwcm9wZXJ0aWVzIFtPYmplY3QgY29udGFpbmluZyB0aGUgcHJvcGVydGllcyBvZiB0aGUgY29tcG9uZW50XVxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gdmFsaWRhdGVEZWZpbml0aW9uKHByb3BlcnRpZXMpIHtcblxuXHRpZiAoXy5pc09iamVjdChwcm9wZXJ0aWVzKSkge1xuXG5cdFx0Ly8gRGV0ZXJtaW5lIGNvbXBvbmVudCBpZFxuXHRcdHZhciBpZCA9IHRoaXMuaWQgfHwgcHJvcGVydGllcy5pZDtcblxuXHRcdGZ1bmN0aW9uIF92YWxpZGF0ZUJhY2tib25lSW5zdGFuY2UgKHR5cGUpIHtcblx0XHRcdHZhciBUeXBlID0gdHlwZVswXS50b1VwcGVyQ2FzZSgpICsgdHlwZS5zbGljZSgxKTtcblxuXHRcdFx0aWYgKCAhcHJvcGVydGllc1t0eXBlXSBpbnN0YW5jZW9mIEJhY2tib25lW1R5cGVdICkge1xuXG5cdFx0XHRcdEZyYW1ld29yay5lcnJvcihcblx0XHRcdFx0XHQnQ29tcG9uZW50ICgnICsgaWQgKyAnKSBoYXMgYW4gaW52YWxpZCAnICsgdHlwZSArICctLSBcXG4nICtcblx0XHRcdFx0XHQnSWYgYCcgKyB0eXBlICsgJ2AgaXMgc3BlY2lmaWVkIGZvciBhIGNvbXBvbmVudCwgJyArXG5cdFx0XHRcdFx0J2l0IG11c3QgYmUgYW4gKmluc3RhbmNlKiBvZiBhIEJhY2tib25lLicgKyBUeXBlICsgJy5cXG4nKTtcblxuXHRcdFx0XHRpZiAocHJvcGVydGllc1t0eXBlXSBpbnN0YW5jZW9mIEJhY2tib25lW1R5cGVdLmNvbnN0cnVjdG9yKSB7XG5cdFx0XHRcdFx0RnJhbWV3b3JrLmVycm9yKFxuXHRcdFx0XHRcdFx0J0l0IGxvb2tzIGxpa2UgYSBCYWNrYm9uZS4nICsgVHlwZSArICcgKnByb3RvdHlwZSogd2FzIHNwZWNpZmllZCBpbnN0ZWFkIG9mIGEgJyArXG5cdFx0XHRcdFx0XHQnQmFja2JvbmUuJyArIFR5cGUgKyAnICppbnN0YW5jZSouXFxuJyArXG5cdFx0XHRcdFx0XHQnUGxlYXNlIGBuZXdgIHVwIHRoZSAnICsgdHlwZSArICcgLWJlZm9yZS0gJyArIEZyYW1ld29yay5pZCArICcucmFpc2UoKSwnICtcblx0XHRcdFx0XHRcdCdvciB1c2UgYSB3cmFwcGVyIGZ1bmN0aW9uIHRvIGFjaGlldmUgdGhlIHNhbWUgZWZmZWN0LCBlLmcuOlxcbicgK1xuXHRcdFx0XHRcdFx0J2AnICsgdHlwZSArICc6IGZ1bmN0aW9uICgpIHtcXG5yZXR1cm4gbmV3IFNvbWUnICsgVHlwZSArICcoKTtcXG59YCdcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0RnJhbWV3b3JrLndhcm4oJ0lnbm9yaW5nIGludmFsaWQgJyArIHR5cGUgKyAnIDo6ICcgKyBwcm9wZXJ0aWVzW3R5cGVdKTtcblx0XHRcdFx0ZGVsZXRlIHByb3BlcnRpZXNbdHlwZV07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgdGhhdCB0aGlzLmNvbGxlY3Rpb24gaXMgYWN0dWFsbHkgYW4gaW5zdGFuY2Ugb2YgQmFja2JvbmUuQ29sbGVjdGlvblxuXHRcdC8vIGFuZCB0aGF0IHRoaXMubW9kZWwgaXMgYWN0dWFsbHkgYW4gaW5zdGFuY2Ugb2YgQmFja2JvbmUuTW9kZWxcblx0XHRfdmFsaWRhdGVCYWNrYm9uZUluc3RhbmNlKCdtb2RlbCcpO1xuXHRcdF92YWxpZGF0ZUJhY2tib25lSW5zdGFuY2UoJ2NvbGxlY3Rpb24nKTtcblxuXHRcdC8vIENsb25lIHByb3BlcnRpZXMgdG8gYXZvaWQgaW5hZHZlcnRlbnQgbW9kaWZpY2F0aW9uc1xuXHRcdHJldHVybiBfLmNsb25lKHByb3BlcnRpZXMpO1xuXHR9XG5cblx0ZWxzZSByZXR1cm4ge307XG5cbn1cbiIsIi8qKlxuICogUnVuIGRlZmluaXRpb24gbWV0aG9kcyB0byBnZXQgYWN0dWFsIGNvbXBvbmVudCBkZWZpbml0aW9ucy5cbiAqIFRoaXMgaXMgZGVmZXJyZWQgdG8gYXZvaWQgaGF2aW5nIHRvIHVzZSBCYWNrYm9uZSdzIGZ1bmN0aW9uICgpIHt9IGFwcHJvYWNoIGZvciB0aGluZ3NcbiAqIGxpa2UgY29sbGVjdGlvbnMuXG4gKi9cblxuLyoqXG4gKiBCdWlsZCB1cHMgYSBjb21wb25lbnQgZGVmaW5pdGlvbiBieSBydW5uaW5nIHRoZSBkZWZpbml0aW9uLiBXZSB0aGVuIGxpbmsgdGhlXG4gKiBjb21wb25lbnQgZGVmaW5pdGlvbiB0byBhbiBpZGVudGlmaWVyIGluIGBGUkFNRVdPUksuY29tcG9uZW50c2AuXG4gKlxuICogQHBhcmFtICB7T2JqZWN0fSBjb21wb25lbnQgW09iamVjdCBjb250YWluaW5nIHRoZSBkZWZpbml0aW9uIGZ1bmN0aW9uIG9mIHRoZSBjb21wb25lbnRdXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYnVpbGRDb21wb25lbnREZWZpbml0aW9uKGNvbXBvbmVudCkge1xuXHR2YXIgY29tcG9uZW50RGVmID0gY29tcG9uZW50LmRlZmluaXRpb24oKTtcblxuXHRpZiAoY29tcG9uZW50LmlkT3ZlcnJpZGUpIHtcblx0XHRpZiAoY29tcG9uZW50RGVmLmlkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoY29tcG9uZW50LmlkT3ZlcnJpZGUgKyAnOjogQ2Fubm90IHNwZWNpZnkgYW4gaWRPdmVycmlkZSBpbiAuZGVmaW5lKCkgaWYgYW4gaWQgcHJvcGVydHkgKCcrY29tcG9uZW50RGVmLmlkKycpIGlzIGFscmVhZHkgc2V0IGluIHlvdXIgY29tcG9uZW50IGRlZmluaXRpb24hXFxuVXNhZ2U6IC5kZWZpbmUoW2lkT3ZlcnJpZGVdLCBkZWZpbml0aW9uKScpO1xuXHRcdH1cblx0XHRjb21wb25lbnREZWYuaWQgPSBjb21wb25lbnQuaWRPdmVycmlkZTtcblx0fVxuXHRpZiAoIWNvbXBvbmVudERlZi5pZCkge1xuXHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IHVzZSAuZGVmaW5lKCkgd2l0aG91dCBkZWZpbmluZyBhbiBpZCBwcm9wZXJ0eSBvciBvdmVycmlkZSBpbiB5b3VyIGNvbXBvbmVudCFcXG5Vc2FnZTogLmRlZmluZShbaWRPdmVycmlkZV0sIGRlZmluaXRpb24pJyk7XG5cdH1cblx0RlJBTUVXT1JLLmNvbXBvbmVudHNbY29tcG9uZW50RGVmLmlkXSA9IGNvbXBvbmVudERlZjtcbn07XG4iLCIvKipcbiAqIE9wdGlvbmFsIG1ldGhvZCB0byByZXF1aXJlIGFwcCBjb21wb25lbnRzLiBSZXF1aXJlLmpzIGNhbiBiZSB1c2VkIGluc3RlYWRcbiAqIGFzIG5lZWRlZC5cbiAqXG4gKiBAcGFyYW0gIHtTdHJpbmd9IFx0WyhvcHRpb25hbCkgQ29tcG9uZW50IGlkIG92ZXJyaWRlXVxuICogQHBhcmFtICB7RnVuY3Rpb259IFtGdW5jdGlvbiBEZWZpbml0aW9uIG9mIGNvbXBvbmVudF1cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBkZWZpbmUoaWQsIGRlZmluaXRpb25Gbikge1xuXHQvLyBJZCBwYXJhbSBpcyBvcHRpb25hbFxuXHRpZiAoIWRlZmluaXRpb25Gbikge1xuXHRcdGRlZmluaXRpb25GbiA9IGlkO1xuXHRcdGlkID0gbnVsbDtcblx0fVxuXG5cdEZSQU1FV09SSy5fZGVmaW5lUXVldWUucHVzaCh7XG5cdFx0ZGVmaW5pdGlvbjogZGVmaW5pdGlvbkZuLFxuXHRcdGlkT3ZlcnJpZGU6IGlkXG5cdH0pO1xufTtcbiIsIi8qKlxuICogTWFzdCBidWlsZCBmaWxlLiBUaGUgbWFpbiBmaWxlXG4gKi9cblxudmFyIGRlZmluZSA9IHJlcXVpcmUoJy4vZGVmaW5lL2luZGV4Jyk7XG52YXIgUmVnaW9uID0gcmVxdWlyZSgnLi9yZWdpb24vaW5kZXgnKTtcbnZhciBDb21wb25lbnQgPSByZXF1aXJlKCcuL2NvbXBvbmVudC9pbmRleCcpO1xudmFyIHJhaXNlID0gcmVxdWlyZSgnLi9yYWlzZS9pbmRleCcpO1xuXG4vKipcbiAqIEZyYW1ld29yayBjbGFzcyBkZWZpbml0aW9uIHRoYXQgd2lsbCBjcmVhdGUgYSBuZXcgZ2xvYmFsIGluc3RhbmNlIG9mIGEgY3VzdG9tIEZyYW1ld29yay5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBbb3B0aW9ucyBoYXNoIHRvIGluaXRpYWxpemUgdGhlIGN1c3RvbSBmcmFtZXdvcmsgd2l0aF1cbiAqL1xuRnJhbWV3b3JrID0gZnVuY3Rpb24ob3B0aW9ucykge1xuXHQvLyBTZXQgdGhlIGRlZmF1bHQgb3B0aW9ucyBmb3IgdGhvc2Ugbm90IHBhc3NlZCBpbi5cblx0b3B0aW9ucyA9IF8uZGVmYXVsdHMob3B0aW9ucywge1xuXHRcdHRocm90dGxlV2luZG93UmVzaXplOiAyMDAsXG5cdFx0bG9nTGV2ZWw6ICd3YXJuJyxcblx0XHRmcmFtZXdvcmtJZDogJ01hc3QnLFxuXHRcdHByb2R1Y3Rpb246IGZhbHNlLFxuXHRcdGxvZ2dlcjogdW5kZWZpbmVkLFxuXHRcdHNob3J0Y3V0OiB7XG5cdFx0XHR0ZW1wbGF0ZTogdHJ1ZSxcblx0XHRcdGNvdW50OiB0cnVlXG5cdFx0fVxuXHR9KTtcblxuXHQvLyBTZXQgYSBzdGFydGluZyBwb2ludCB0byBCYWNrYm9uZSBhbmQgYWRkIGFkZGl0aW9uYWwgYXR0cmlidXRlLlxuXHRfLmV4dGVuZCh0aGlzLCBCYWNrYm9uZSwge1xuXHRcdG9wdGlvbnM6IG9wdGlvbnMsXG5cdFx0dGVtcGxhdGVzOiB7fSxcblx0XHRjb21wb25lbnRzOiB7fSxcblx0XHRkYXRhOiB7fSxcblx0XHRfZGVmaW5lUXVldWU6IFtdLFxuXHRcdHJlZ2lvbnM6IHt9XG5cdH0pO1xuXG5cdC8vIEV4cG9zZSBhIGdsb2JhbCBmb3IgdGhlIGN1c3RvbSBmcmFtZXdvcmsuXG5cdHZhciBmcmFtZXdvcmtOYW1lID0gb3B0aW9ucy5mcmFtZXdvcmtJZDtcblx0d2luZG93W2ZyYW1ld29ya05hbWVdID0gdGhpc1xuXG5cdC8vIFRocm91Z2h0b3V0IHRoZSBzb3VyY2UgY29kZSwgdGhlcmUgYXJlIG9wZXJhdGlvbnMgb24gYEZSQU1FV09SS2Agb3IgY29kZSB0aGF0IGFjY2Vzc2VzXG5cdC8vIGl0cyBhdHRyaWJ1dGVzLiBXZSB3aWxsIG1ha2UgYEZSQU1FV09SS2AgYWNjZXNzYWJsZSBieSBhc3NpZ25pbmcgaXQgdGhlIGluc3RhbmNlIG9mIHRoZVxuXHQvLyBjdXN0b20gRnJhbWV3b3JrLlxuXHRGUkFNRVdPUksgPSB3aW5kb3dbZnJhbWV3b3JrTmFtZV07XG59XG5cbi8vIEZyYW1ld29yayBwcm90b3R5cGUgbWV0aG9kcy5cbkZyYW1ld29yay5wcm90b3R5cGUuUmVnaW9uID0gUmVnaW9uO1xuRnJhbWV3b3JrLnByb3RvdHlwZS5Db21wb25lbnQgPSBDb21wb25lbnQ7XG5GcmFtZXdvcmsucHJvdG90eXBlLmRlZmluZSA9IGRlZmluZTtcbkZyYW1ld29yay5wcm90b3R5cGUucmFpc2UgPSByYWlzZTtcblxuIiwiLyoqXG4gKlx0TG9nZ2V0IGNvbnN0cnVjdG9yIG1ldGhvZCB0aGF0IHdpbGwgc2V0dXAgRlJBTUVXT1JLIHRvIGxvZyBtZXNzYWdlcy5cbiAqL1xuXG52YXIgc2V0dXBMb2dnZXIgPSByZXF1aXJlKCcuL3NldHVwJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gTG9nZ2VyKCkge1xuXG5cdC8vIFVwb24gaW5pdGlhbGl6YXRpb24sIHNldHVwIGxvZ2dlclxuXHRzZXR1cExvZ2dlcihGUkFNRVdPUksub3B0aW9ucy5sb2dMZXZlbCk7XG5cblx0Ly8gSW4gc3VwcG9ydGVkIGJyb3dzZXJzLCBhbHNvIHJ1biBzZXR1cExvZ2dlciBhZ2FpblxuXHQvLyB3aGVuIEZSQU1FV09SSy5sb2dMZXZlbCBpcyBzZXQgYnkgdGhlIHVzZXJcblx0Ly8gVE9ETzogZmluZCBhIHdheSB0byBkbyB0aGlzIHdpdGhvdXQgZGVwZW5kaW5nIG9uIF9fZGVmaW5lU2V0dGVyX18uXG5cdGlmIChfLmlzRnVuY3Rpb24oRlJBTUVXT1JLLl9fZGVmaW5lU2V0dGVyX18pKSB7XG5cdFx0RlJBTUVXT1JLLl9fZGVmaW5lU2V0dGVyX18oJ2xvZ0xldmVsJywgZnVuY3Rpb24gb25DaGFuZ2UgKG5ld0xvZ0xldmVsKSB7XG5cdFx0XHRzZXR1cExvZ2dlcihuZXdMb2dMZXZlbCk7XG5cdFx0fSk7XG5cdH1cbn07XG4iLCIvKipcbiAqIFNldCB1cCB0aGUgbG9nIGZ1bmN0aW9uczpcbiAqXG4gKiBGUkFNRVdPUksuZXJyb3JcbiAqIEZSQU1FV09SSy53YXJuXG4gKiBGUkFNRVdPUksubG9nXG4gKiBGUkFNRVdPUksuZGVidWcgKCpsZWdhY3kpXG4gKiBGUkFNRVdPUksudmVyYm9zZVxuICpcbiAqIEBwYXJhbSAge1N0cmluZ30gbG9nTGV2ZWwgW1RoZSBkZXNpcmVkIGxvZyBsZXZlbCBvZiB0aGUgTG9nZ2VyXVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHNldHVwTG9nZ2VyIChsb2dMZXZlbCkge1xuXG5cdHZhciBub29wID0gZnVuY3Rpb24gKCkge307XG5cblx0Ly8gSWYgbG9nIGlzIHNwZWNpZmllZCwgdXNlIGl0LCBvdGhlcndpc2UgdXNlIHRoZSBjb25zb2xlXG5cdGlmIChGUkFNRVdPUksubG9nZ2VyKSB7XG5cdFx0RlJBTUVXT1JLLmVycm9yICAgICA9IEZSQU1FV09SSy5sb2dnZXIuZXJyb3I7XG5cdFx0RlJBTUVXT1JLLndhcm4gICAgICA9IEZSQU1FV09SSy5sb2dnZXIud2Fybjtcblx0XHRGUkFNRVdPUksubG9nICAgICAgID0gRlJBTUVXT1JLLmxvZ2dlci5kZWJ1ZyB8fCBGUkFNRVdPUksubG9nZ2VyO1xuXHRcdEZSQU1FV09SSy52ZXJib3NlICAgPSBGUkFNRVdPUksubG9nZ2VyLnZlcmJvc2U7XG5cdH1cblxuXHQvLyBJbiBJRSwgd2UgY2FuJ3QgZGVmYXVsdCB0byB0aGUgYnJvd3NlciBjb25zb2xlIGJlY2F1c2UgdGhlcmUgSVMgTk8gQlJPV1NFUiBDT05TT0xFXG5cdGVsc2UgaWYgKHR5cGVvZiBjb25zb2xlICE9PSAndW5kZWZpbmVkJykge1xuXG5cdFx0Ly8gV2UgY2Fubm90IGNhbGxlZCB0aGUgLmJpbmQgbWV0aG9kIG9uIHRoZSBjb25zb2xlIG1ldGhvZHMuIFdlIGFyZSBpbiBpZSA5IG9yIDgsIGp1c3QgbWFrZVxuXHRcdC8vIGV2ZXJ5aHRpbmcgYSBub29wLlxuXHRcdGlmIChfLmlzVW5kZWZpbmVkKGNvbnNvbGUubG9nLmJpbmQpKSAge1xuXHRcdFx0RlJBTUVXT1JLLmVycm9yICAgICA9IG5vb3A7XG5cdFx0XHRGUkFNRVdPUksud2FybiAgICAgID0gbm9vcDtcblx0XHRcdEZSQU1FV09SSy5sb2cgICAgICAgPSBub29wO1xuXHRcdFx0RlJBTUVXT1JLLmRlYnVnICAgICA9IG5vb3A7XG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZSAgID0gbm9vcDtcblx0XHR9XG5cblx0XHQvLyBXZSBhcmUgaW4gYSBmcmllbmRseSBicm93c2VyIGxpa2UgQ2hyb21lLCBGaXJlZm94LCBvciBJRTEwXG5cdFx0ZWxzZSB7XG5cdFx0XHRGUkFNRVdPUksuZXJyb3JcdFx0PSBjb25zb2xlLmVycm9yICYmIGNvbnNvbGUuZXJyb3IuYmluZChjb25zb2xlKTtcblx0XHRcdEZSQU1FV09SSy53YXJuXHRcdD0gY29uc29sZS53YXJuICYmIGNvbnNvbGUud2Fybi5iaW5kKGNvbnNvbGUpO1xuXHRcdFx0RlJBTUVXT1JLLmxvZ1x0XHRcdD0gY29uc29sZS5kZWJ1ZyAmJiBjb25zb2xlLmRlYnVnLmJpbmQoY29uc29sZSk7XG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZVx0PSBjb25zb2xlLmxvZyAmJiBjb25zb2xlLmxvZy5iaW5kKGNvbnNvbGUpO1xuXG5cdFx0XHQvLyBVc2UgbG9nIGxldmVsIGNvbmZpZyBpZiBwcm92aWRlZFxuXHRcdFx0c3dpdGNoIChsb2dMZXZlbCkge1xuXHRcdFx0XHRjYXNlICd2ZXJib3NlJzogYnJlYWs7XG5cblx0XHRcdFx0Y2FzZSAnZGVidWcnOlxuXHRcdFx0XHRcdEZSQU1FV09SSy52ZXJib3NlID0gbm9vcDtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlICd3YXJuJzpcblx0XHRcdFx0XHRGUkFNRVdPUksudmVyYm9zZSA9IEZSQU1FV09SSy5sb2cgPSBub29wO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgJ2Vycm9yJzpcblx0XHRcdFx0XHRGUkFNRVdPUksudmVyYm9zZSA9IEZSQU1FV09SSy5sb2cgPSBGUkFNRVdPUksud2FybiA9IG5vb3A7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSAnc2lsZW50Jzpcblx0XHRcdFx0XHRGUkFNRVdPUksudmVyYm9zZSA9IEZSQU1FV09SSy5sb2cgPSBGUkFNRVdPUksud2FybiA9IEZSQU1FV09SSy5lcnJvciA9IG5vb3A7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IgKCdVbnJlY29nbml6ZWQgbG9nZ2luZyBsZXZlbCBjb25maWcgJyArXG5cdFx0XHRcdFx0JygnICsgRlJBTUVXT1JLLm9wdGlvbnMuZnJhbWV3b3JrSWQgKyAnLmxvZ0xldmVsID0gXCInICsgbG9nTGV2ZWwgKyAnXCIpJyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFN1cHBvcnQgZm9yIGBkZWJ1Z2AgZm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5XG5cdFx0XHRGUkFNRVdPUksuZGVidWcgPSBGUkFNRVdPUksubG9nO1xuXG5cdFx0XHQvLyBWZXJib3NlIHNwaXRzIG91dCBsb2cgbGV2ZWxcblx0XHRcdEZSQU1FV09SSy52ZXJib3NlKCdMb2cgbGV2ZWwgc2V0IHRvIDo6ICcsIGxvZ0xldmVsKTtcblx0XHR9XG5cdH1cbn1cbiIsIi8qKlxuICogR2l2ZW4gYSBjb21wb25lbnQgZGVmaW5pdGlvbiBhbmQgaXRzIGtleSwgd2Ugd2lsbCBidWlsZCB1cCB0aGUgY29tcG9uZW50IHByb3RvdHlwZSBhbmQgbWVyZ2VcbiAqIHRoaXMgY29tcG9uZW50IHdpdGggaXRzIG1hdGNoaW5nIHRlbXBsYXRlLlxuICpcbiAqIEBwYXJhbSAge09iamVjdH0gY29tcG9uZW50RGVmIFtPYmplY3QgY29udGFpbmluZyB0aGUgY29tcG9uZW50IGRlZmluaXRpb25dXG4gKiBAcGFyYW0gIHtTdHJpbmd9IGNvbXBvbmVudEtleSBbVGhlIGNvbXBvbmVudCBpZGVudGlmaWVyXVxuICovXG5cbnZhciB0cmFuc2xhdGVTaG9ydGhhbmQgPSByZXF1aXJlKCcuLi91dGlscy9zaG9ydGhhbmQnKTtcbnZhciBVdGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzL3V0aWxzJyk7XG52YXIgRXZlbnRzID0gcmVxdWlyZSgnLi4vdXRpbHMvZXZlbnRzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYnVpbGRDb21wb25lbnRQcm90b3R5cGUoY29tcG9uZW50RGVmLCBjb21wb25lbnRLZXkpIHtcblxuXHQvLyBJZiBjb21wb25lbnQgaWQgaXMgbm90IGV4cGxpY2l0bHkgc2V0LCB1c2UgdGhlIGNvbXBvbmVudEtleVxuXHRpZiAoIWNvbXBvbmVudERlZi5pZCkge1xuXHRcdGNvbXBvbmVudERlZi5pZCA9IGNvbXBvbmVudEtleTtcblx0fVxuXG5cdC8vIFNlYXJjaCB0ZW1wbGF0ZXNcblx0dmFyIHRlbXBsYXRlID0gRlJBTUVXT1JLLnRlbXBsYXRlc1tjb21wb25lbnREZWYuaWRdO1xuXG5cdC8vIElmIG5vIG1hdGNoIGZvciBjb21wb25lbnQgd2FzIGZvdW5kwqBpbiB0ZW1wbGF0ZXMsIGlzc3VlIGEgd2FybmluZ1xuXHRpZiAoIXRlbXBsYXRlKSB7XG5cdFx0cmV0dXJuIEZSQU1FV09SSy53YXJuKFxuXHRcdFx0Y29tcG9uZW50RGVmLmlkICsgJyA6OiBObyB0ZW1wbGF0ZSBmb3VuZCBmb3IgY29tcG9uZW50IScgK1xuXHRcdFx0J1xcblRlbXBsYXRlcyBkb25cXCd0IG5lZWQgYSBjb21wb25lbnQgdW5sZXNzIHlvdSB3YW50IGludGVyYWN0aXZpdHksICcgK1xuXHRcdFx0J2V2ZXJ5IGNvbXBvbmVudCAqc2hvdWxkKiBoYXZlIGEgbWF0Y2hpbmcgdGVtcGxhdGUhIScgK1xuXHRcdFx0J1xcblVzaW5nIGNvbXBvbmVudHMgd2l0aG91dCB0ZW1wbGF0ZXMgbWF5IHNlZW0gbmVjZXNzYXJ5LCAnICtcblx0XHRcdCdidXQgaXRcXCdzIG5vdC4gIEl0IG1ha2VzIHlvdXIgdmlldyBsb2dpYyBpbmNvcnBvcmVhbCwgYW5kIG1ha2VzIHlvdXIgY29sbGVhZ3VlcyAnICtcblx0XHRcdCd1bmNvbWZvcnRhYmxlLicpO1xuXHR9XG5cblx0Ly8gU2F2ZSByZWZlcmVuY2UgdG8gdGVtcGxhdGUgaW4gY29tcG9uZW50IHByb3RvdHlwZVxuXHRGUkFNRVdPUksudmVyYm9zZShjb21wb25lbnREZWYuaWQgKyAnIDo6IFBhaXJpbmcgY29tcG9uZW50IHdpdGggdGVtcGxhdGUuLi4nKTtcblx0Y29tcG9uZW50RGVmLnRlbXBsYXRlID0gdGVtcGxhdGU7XG5cblx0Ly8gVHJhbnNsYXRlIHJpZ2h0LWhhbmQgc2hvcnRoYW5kIGZvciB0b3AtbGV2ZWwga2V5c1xuXHRjb21wb25lbnREZWYgPSBVdGlscy5vYmpNYXAoY29tcG9uZW50RGVmLCB0cmFuc2xhdGVTaG9ydGhhbmQpO1xuXG5cblx0Ly8gYW5kIGV2ZW50cyBvYmplY3Rcblx0aWYgKGNvbXBvbmVudERlZi5ldmVudHMpIHtcblx0XHRjb21wb25lbnREZWYuZXZlbnRzID0gVXRpbHMub2JqTWFwKFxuXHRcdFx0Y29tcG9uZW50RGVmLmV2ZW50cyxcblx0XHRcdHRyYW5zbGF0ZVNob3J0aGFuZFxuXHRcdCk7XG5cdH1cblxuXHQvLyBhbmQgYWZ0ZXJDaGFuZ2UgYmluZGluZ3Ncblx0aWYgKF8uaXNPYmplY3QoY29tcG9uZW50RGVmLmFmdGVyQ2hhbmdlKSAmJiAhXy5pc0Z1bmN0aW9uKGNvbXBvbmVudERlZi5hZnRlckNoYW5nZSkpIHtcblx0XHRjb21wb25lbnREZWYuYWZ0ZXJDaGFuZ2UgPSBVdGlscy5vYmpNYXAoXG5cdFx0XHRjb21wb25lbnREZWYuYWZ0ZXJDaGFuZ2UsXG5cdFx0XHR0cmFuc2xhdGVTaG9ydGhhbmRcblx0XHQpO1xuXHR9XG5cblx0Ly8gR28gYWhlYWQgYW5kIHR1cm4gdGhlIGRlZmluaXRpb24gaW50byBhIHJlYWwgY29tcG9uZW50IHByb3RvdHlwZVxuXHRGUkFNRVdPUksudmVyYm9zZShjb21wb25lbnREZWYuaWQgKyAnIDo6IEJ1aWxkaW5nIGNvbXBvbmVudCBwcm90b3R5cGUuLi4nKTtcblx0dmFyIGNvbXBvbmVudFByb3RvdHlwZSA9IEZSQU1FV09SSy5Db21wb25lbnQuZXh0ZW5kKGNvbXBvbmVudERlZik7XG5cblx0Ly8gRGlzY292ZXIgc3Vic2NyaXB0aW9uc1xuXHRjb21wb25lbnRQcm90b3R5cGUucHJvdG90eXBlLnN1YnNjcmlwdGlvbnMgPSB7fTtcblxuXHQvLyBJdGVyYXRlIHRocm91Z2ggZWFjaCBwcm9wZXJ0eSBvbiB0aGlzIGNvbXBvbmVudCBwcm90b3R5cGVcblx0Xy5lYWNoKGNvbXBvbmVudFByb3RvdHlwZS5wcm90b3R5cGUsIGZ1bmN0aW9uIChoYW5kbGVyLCBrZXkpIHtcblxuXHRcdC8vIERldGVjdCBET00gZXZlbnRzIGFuZCBzbWFzaCB0aGVtIGludG8gdGhlIGV2ZW50cyBoYXNoXG5cdFx0dmFyIG1hdGNoZWRET01FdmVudHMgPSBrZXkubWF0Y2goRXZlbnRzWycvRE9NRXZlbnQvJ10pO1xuXHRcdGlmIChtYXRjaGVkRE9NRXZlbnRzKSB7XG5cdFx0XHR2YXIgZXZlbnROYW1lID0gbWF0Y2hlZERPTUV2ZW50c1sxXTtcblx0XHRcdHZhciBkZWxlZ2F0ZVNlbGVjdG9yID0gbWF0Y2hlZERPTUV2ZW50c1szXTtcblxuXHRcdFx0Ly8gU3RvdyB0aGVtIGluIGV2ZW50cyBoYXNoXG5cdFx0XHRjb21wb25lbnRQcm90b3R5cGUucHJvdG90eXBlLmV2ZW50cyA9IGNvbXBvbmVudFByb3RvdHlwZS5wcm90b3R5cGUuZXZlbnRzIHx8IHt9O1xuXHRcdFx0Y29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZS5ldmVudHNba2V5XSA9IGhhbmRsZXI7XG5cdFx0fVxuXG5cdFx0Ly8gQWRkIGFwcCBldmVudHMgKCUpLCByb3V0ZXMgKCMpLCBhbmQgZGF0YSBsaXN0ZW5lcnMgKH4pIHRvIHN1YnNjcmlwdGlvbnMgaGFzaFxuXHRcdGlmIChrZXkubWF0Y2goL14oJXwjfH4pLykpIHtcblx0XHRcdGlmIChfLmlzU3RyaW5nKGhhbmRsZXIpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihjb21wb25lbnREZWYuaWQgKyAnOjogSW52YWxpZCBsaXN0ZW5lciBmb3Igc3Vic2NyaXB0aW9uOiAnICsga2V5ICsgJy5cXG4nICtcblx0XHRcdFx0XHQnRGVmaW5lIHlvdXIgY2FsbGJhY2sgd2l0aCBhbiBhbm9ueW1vdXMgZnVuY3Rpb24gaW5zdGVhZCBvZiBhIHN0cmluZy4nXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIV8uaXNGdW5jdGlvbihoYW5kbGVyKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoY29tcG9uZW50RGVmLmlkICsnOjogSW52YWxpZCBsaXN0ZW5lciBmb3Igc3Vic2NyaXB0aW9uOiAnICsga2V5KTtcblx0XHRcdH1cblx0XHRcdGNvbXBvbmVudFByb3RvdHlwZS5wcm90b3R5cGUuc3Vic2NyaXB0aW9uc1trZXldID0gaGFuZGxlcjtcblx0XHR9XG5cblx0XHQvLyBFeHRlbmQgb25lIG9yIG1vcmUgb3RoZXIgY29tcG9uZW50c1xuXHRcdGVsc2UgaWYgKGtleSA9PT0gJ2V4dGVuZENvbXBvbmVudHMnKSB7XG5cdFx0XHR2YXIgb2JqVG9NZXJnZSA9IHt9O1xuXHRcdFx0Xy5lYWNoKGhhbmRsZXIsIGZ1bmN0aW9uKGNoaWxkSWQpe1xuXG5cdFx0XHRcdGlmICghRlJBTUVXT1JLLmNvbXBvbmVudHNbY2hpbGRJZF0pe1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihcblx0XHRcdFx0XHRjb21wb25lbnREZWYuaWQgKyAnIDo6ICcgK1xuXHRcdFx0XHRcdCdUcnlpbmcgdG8gZGVmaW5lL2V4dGVuZCB0aGlzIGNvbXBvbmVudCBmcm9tIGAnICsgY2hpbGRJZCArICdgLCAnICtcblx0XHRcdFx0XHQnYnV0IG5vIGNvbXBvbmVudCB3aXRoIHRoYXQgaWQgY2FuIGJlIGZvdW5kLidcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Xy5leHRlbmQob2JqVG9NZXJnZSwgRlJBTUVXT1JLLmNvbXBvbmVudHNbY2hpbGRJZF0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdF8uZGVmYXVsdHMoY29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZSwgb2JqVG9NZXJnZSk7XG5cdFx0fVxuXHR9KTtcblxuXHQvLyBTYXZlIHByb3RvdHlwZSBpbiBnbG9iYWwgc2V0IGZvciB0cmFja2luZ1xuXHRGUkFNRVdPUksuY29tcG9uZW50c1tjb21wb25lbnREZWYuaWRdID0gY29tcG9uZW50UHJvdG90eXBlO1xufTtcbiIsIi8qKlxuICogQ29sbGVjdCBhbnkgcmVnaW9ucyB3aXRoIHRoZSBkZWZhdWx0IGNvbXBvbmVudCBzZXQgZnJvbSB0aGUgRE9NLlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY29sbGVjdFJlZ2lvbnMgKCkge1xuXG5cdC8vIFByb3ZpZGUgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkgZm9yIGxlZ2FjeSBub3RhdGlvblxuXHQkKCdyZWdpb25bZGVmYXVsdF0scmVnaW9uW3RlbXBsYXRlXSxbZGF0YS1yZWdpb25dW2RlZmF1bHRdLFtkYXRhLXJlZ2lvbl1bdGVtcGxhdGVdJykuZWFjaChmdW5jdGlvbigpIHtcblx0XHQkZSA9ICQodGhpcyk7XG5cdFx0dmFyIGNvbXBvbmVudElkID0gJGUuYXR0cignZGVmYXVsdCcpIHx8ICRlLmF0dHIoJ3RlbXBsYXRlJyk7XG5cdFx0JGUuYXR0cignY29udGVudHMnLCBjb21wb25lbnRJZCk7XG5cdH0pO1xuXG5cdC8vIE5vdyBpbnN0YW50aWF0ZSB0aGUgYXBwcm9wcmlhdGUgZGVmYXVsdCBjb21wb25lbnQgaW4gZWFjaFxuXHQvLyByZWdpb24gd2l0aCBhIHNwZWNpZmllZCB0ZW1wbGF0ZS9jb21wb25lbnRcblx0JCgncmVnaW9uW2NvbnRlbnRzXSxbZGF0YS1yZWdpb25dW2NvbnRlbnRzXScpLmVhY2goZnVuY3Rpb24oKSB7XG5cdFx0RlJBTUVXT1JLLlJlZ2lvbi5mcm9tRWxlbWVudCh0aGlzKTtcblx0fSk7XG59XG4iLCIvKipcbiAqIExvYWQgYW55IHNjcmlwdCB0YWdzIG9uIHRoZSBwYWdlIHdpdGggdHlwZT1cInRleHQvdGVtcGxhdGVcIi5cbiAqXG4gKiBAcmV0dXJuIHtPYmplY3R9IFtPYmplY3QgY29uc2lzdGluZyBvZiBhIHRlbXBsYXRlIGlkZW50aWZpZXIgYW5kIGl0cyBIVE1MLl1cbiAqL1xuXG52YXIgVXRpbHMgPSByZXF1aXJlKCcuLi91dGlscy91dGlscycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNvbGxlY3RUZW1wbGF0ZXMoKSB7XG5cdHZhciB0ZW1wbGF0ZXMgPSB7fTtcblxuXHQkKCdzY3JpcHRbdHlwZT1cInRleHQvdGVtcGxhdGVcIl0nKS5lYWNoKGZ1bmN0aW9uIChpLCBlbCkge1xuXHRcdHZhciBpZCA9IFV0aWxzLmVsMmlkKGVsLCB0cnVlKTtcblx0XHR0ZW1wbGF0ZXNbaWRdID0gJChlbCkuaHRtbCgpO1xuXG5cdFx0Ly8gU3RyaXAgd2hpdGVzcGFjZSBsZWZ0b3ZlciBmcm9tIHNjcmlwdCB0YWdzXG5cdFx0dGVtcGxhdGVzW2lkXSA9IHRlbXBsYXRlc1tpZF0ucmVwbGFjZSgvXlxccysvLCcnKTtcblx0XHR0ZW1wbGF0ZXNbaWRdID0gdGVtcGxhdGVzW2lkXS5yZXBsYWNlKC9cXHMrJC8sJycpO1xuXG5cdFx0Ly8gUmVtb3ZlIGZyb20gRE9NXG5cdFx0JChlbCkucmVtb3ZlKCk7XG5cdH0pO1xuXG5cdHJldHVybiB0ZW1wbGF0ZXM7XG59O1xuIiwiLyoqXG4gKiBUaGlzIGlzIHRoZSBzdGFydGluZyBwb2ludCB0byB5b3VyIGFwcGxpY2F0aW9uLiAgWW91IHNob3VsZCBncmFiIHRlbXBsYXRlcyBhbmQgY29tcG9uZW50c1xuICogYmVmb3JlIGNhbGxpbmcgRlJBTUVXT1JLLnJhaXNlKCkgdXNpbmcgc29tZXRoaW5nIGxpa2UgUmVxdWlyZS5qcy5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9uc1xuXHRcdGRhdGE6IHsgYXV0aGVudGljYXRlZDogZmFsc2UgfSxcblx0XHR0ZW1wbGF0ZXM6IHsgY29tcG9uZW50TmFtZTogSFRNTE9yUHJlY29tcGlsZWRGbiB9LFxuXHRcdGNvbXBvbmVudHM6IHsgY29tcG9uZW50TmFtZTogQ29tcG9uZW50RGVmaW5pdGlvbiB9XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYlxuICovXG5cbnZhciBMb2dnZXIgPSByZXF1aXJlKCcuLi9sb2dnZXIvaW5kZXgnKTtcbnZhciBidWlsZENvbXBvbmVudERlZmluaXRpb24gPSByZXF1aXJlKCcuLi9kZWZpbmUvYnVpbGREZWZpbml0aW9uJyk7XG52YXIgYnVpbGRDb21wb25lbnRQcm90b3R5cGUgPSByZXF1aXJlKCcuL2J1aWxkUHJvdG90eXBlJyk7XG52YXIgY29sbGVjdFRlbXBsYXRlcyA9IHJlcXVpcmUoJy4vY29sbGVjdFRlbXBsYXRlcycpO1xudmFyIGNvbGxlY3RSZWdpb25zID0gcmVxdWlyZSgnLi9jb2xsZWN0UmVnaW9ucycpO1xudmFyIHNldHVwUm91dGVyID0gcmVxdWlyZSgnLi4vcm91dGVyL2luZGV4Jyk7XG5cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByYWlzZShvcHRpb25zLCBjYikge1xuXG5cdC8vIElmIG9ubHkgb25lIGFyZyBpcyBwcmVzZW50LCB1c2Ugb3B0aW9ucyBhcyBjYWxsYmFjayBpZiBwb3NzaWJsZS5cblx0Ly8gSWYgb3B0aW9ucyBhcmUgbm90IGRlZmluZWQsIHVzZSBhbiBlbXB0eSBvYmplY3QuXG5cdGlmICghY2IgJiYgXy5pc0Z1bmN0aW9uKG9wdGlvbnMpKSB7XG5cdFx0Y2IgPSBvcHRpb25zO1xuXHR9XG5cdGlmICghXy5pc1BsYWluT2JqZWN0KG9wdGlvbnMpKSB7XG5cdFx0b3B0aW9ucyA9IHt9O1xuXHR9XG5cblx0Ly8gSW50ZXJwcmV0IGBwcm9kdWN0aW9uYCBhcyBgbG9nTGV2ZWwgPT09ICdzaWxlbnQnYFxuXHRpZiAoRlJBTUVXT1JLLm9wdGlvbnMucHJvZHVjdGlvbikge1xuXHRcdEZSQU1FV09SSy5vcHRpb25zLmxvZ0xldmVsID0gJ3NpbGVudCc7XG5cdH1cblxuXHQvLyBJbml0aWFsaXplIGxvZ2dlclxuXHRuZXcgTG9nZ2VyKCk7XG5cblx0Ly8gTWVyZ2UgZGF0YSBpbnRvIEZSQU1FV09SSy5kYXRhXG5cdF8uZXh0ZW5kKEZSQU1FV09SSy5kYXRhLCBvcHRpb25zLmRhdGEgfHwge30pO1xuXG5cdC8vIE1lcmdlIHNwZWNpZmllZCB0ZW1wbGF0ZXMgd2l0aCBGUkFNRVdPUksudGVtcGxhdGVzXG5cdF8uZXh0ZW5kKEZSQU1FV09SSy50ZW1wbGF0ZXMsIG9wdGlvbnMudGVtcGxhdGVzIHx8IHt9KTtcblxuXHQvLyBJZiBGUkFNRVdPUksuZGVmaW5lKCkgd2FzIHVzZWQsIGJ1aWxkIHRoZSBsaXN0IG9mIGNvbXBvbmVudHNcblx0Ly8gSXRlcmF0ZSB0aHJvdWdoIHRoZSBkZWZpbmUgcXVldWUgYW5kIGNyZWF0ZSBlYWNoIGRlZmluaXRpb25cblx0Xy5lYWNoKEZSQU1FV09SSy5fZGVmaW5lUXVldWUsIGJ1aWxkQ29tcG9uZW50RGVmaW5pdGlvbik7XG5cblx0Ly8gTWVyZ2Ugc3BlY2lmaWVkIGNvbXBvbmVudHMgdy8gRlJBTUVXT1JLLmNvbXBvbmVudHNcblx0Xy5leHRlbmQoRlJBTUVXT1JLLmNvbXBvbmVudHMsIG9wdGlvbnMuY29tcG9uZW50cyB8fCB7fSk7XG5cblx0Ly8gQmFjayB1cCBlYWNoIGNvbXBvbmVudCBkZWZpbml0aW9uIGJlZm9yZSB0cmFuc2Zvcm1pbmcgaXQgaW50byBhIGxpdmUgcHJvdG90eXBlXG5cdEZSQU1FV09SSy5jb21wb25lbnREZWZzID0gXy5jbG9uZShGUkFNRVdPUksuY29tcG9uZW50cyk7XG5cblx0Ly8gUnVuIHRoaXMgY2FsbCBiYWNrIHdoZW4gdGhlIERPTSBpcyByZWFkeVxuXHQkKGZ1bmN0aW9uICgpIHtcblxuXHRcdC8vIENvbGxlY3QgYW55IDxzY3JpcHQ+IHRhZyB0ZW1wbGF0ZXMgb24gdGhlIHBhZ2Vcblx0XHQvLyBhbmQgYWJzb3JiIHRoZW0gaW50byBGUkFNRVdPUksudGVtcGxhdGVzXG5cdFx0Xy5leHRlbmQoRlJBTUVXT1JLLnRlbXBsYXRlcywgY29sbGVjdFRlbXBsYXRlcygpKTtcblxuXHRcdC8vIEJ1aWxkIGFjdHVhbCBwcm90b3R5cGVzIGZvciB0aGUgY29tcG9uZW50c1xuXHRcdC8vIChuZWVkIHRoZSB0ZW1wbGF0ZXMgYXQgdGhpcyBwb2ludCB0byBtYWtlIHRoaXMgd29yaylcblxuXHRcdF8uZWFjaChGUkFNRVdPUksuY29tcG9uZW50cywgYnVpbGRDb21wb25lbnRQcm90b3R5cGUpO1xuXG5cdFx0Ly8gR3JhYiBpbml0aWFsIHJlZ2lvbnMgZnJvbSBET01cblx0XHRjb2xsZWN0UmVnaW9ucygpO1xuXG5cdFx0Ly8gQmluZCBnbG9iYWwgRE9NIGV2ZW50cyBhcyBGUkFNRVdPUksgZXZlbnRzXG5cdFx0Ly8gKGUuZy4gJXdpbmRvdzpyZXNpemUpXG5cdFx0dmFyIHRyaWdnZXJSZXNpemVFdmVudCA9IF8uZGVib3VuY2UoZnVuY3Rpb24gKCkge1xuXHRcdFx0RlJBTUVXT1JLLnRyaWdnZXIoJyV3aW5kb3c6cmVzaXplJyk7XG5cdFx0fSwgRlJBTUVXT1JLLm9wdGlvbnMudGhyb3R0bGVXaW5kb3dSZXNpemUgfHwgMCk7XG5cdFx0JCh3aW5kb3cpLnJlc2l6ZSh0cmlnZ2VyUmVzaXplRXZlbnQpO1xuXHRcdC8vIFRPRE86IGFkZCBtb3JlIGV2ZW50cyBhbmQgZXh0cmFwb2xhdGUgdGhpcyBsb2dpYyB0byBhIHNlcGFyYXRlIG1vZHVsZVxuXG5cdFx0Ly8gRG8gdGhlIGluaXRpYWwgcm91dGluZyBzZXF1ZW5jZVxuXHRcdC8vIExvb2sgYXQgdGhlICNmcmFnbWVudCB1cmwgYW5kIGZpcmUgdGhlIGdsb2JhbCByb3V0ZSBldmVudFxuXHRcdHNldHVwUm91dGVyKCk7XG5cdFx0RlJBTUVXT1JLLmhpc3Rvcnkuc3RhcnQoXy5kZWZhdWx0cyh7XG5cdFx0XHRwdXNoU3RhdGU6IHVuZGVmaW5lZCxcblx0XHRcdGhhc2hDaGFuZ2U6IHVuZGVmaW5lZCxcblx0XHRcdHJvb3Q6IHVuZGVmaW5lZFxuXHRcdH0sIG9wdGlvbnMpKTtcblxuXHRcdGlmIChjYikgY2IoKTtcblx0fSk7XG59O1xuIiwiLyoqXG4gKiBBcHBlbmQgYSBjb21wb25lbnQgdG8gdGhlIGVuZCBvZiBhIHJlZ2lvbi4gVGhpcyBjYWxscyBpbnNlcnQgYXQgdGhlIGxhc3QgcG9zaXRpb24uXG4gKlxuICogQHBhcmFtICB7U3RyaW5nfSBjb21wb25lbnRJZCBbVGhlIGNvbXBvbmVudCBpZCB0aGF0IHdlIHdhbnQgdG8gYXBwZW5kXVxuICogQHBhcmFtICB7T2JqZWN0fSBwcm9wZXJ0aWVzICBbUHJvcGVydGllcyB0byBpbnN0YW50aWF0ZSB0aGUgY29tcG9uZW50IHdpdGhdXG4gKlxuICogQHJldHVybiB7Q29tcG9uZW50fSAgICAgICAgICBbTmV3bHkgYXBwZW5kZWQgQ29tcG9uZW50XVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGFwcGVuZChjb21wb25lbnRJZCwgcHJvcGVydGllcykge1xuXHQvLyBJbnNlcnQgYXQgbGFzdCBwb3NpdGlvblxuXHRyZXR1cm4gdGhpcy5pbnNlcnQodGhpcy5fY2hpbGRyZW4ubGVuZ3RoLCBjb21wb25lbnRJZCwgcHJvcGVydGllcyk7XG59O1xuIiwiLyoqXG4gKiBTaG9ydGN1dCBmb3IgY2FsbGluZyBlbXB0eSgpIGFuZCB0aGVuIGFwcGVuZCgpLFxuICogVGhpcyBpcyB0aGUgZ2VuZXJhbCB1c2UgY2FzZSBmb3IgbWFuYWdpbmcgc3ViY29tcG9uZW50c1xuICogKGUuZy4gd2hlbiBhIG5hdmJhciBpdGVtIGlzIHRvdWNoZWQpXG4gKlxuICogQHBhcmFtICB7U3RyaW5nfSBjb21wb25lbnQgIFtUaGUgaWQgbmFtZSBvZiB0aGUgY29tcG9uZXQgdGhhdCB5b3Ugd2FudCB0byBhdHRhY2hdXG4gKiBAcGFyYW0gIHtPYmplY3R9IHByb3BlcnRpZXMgW1Byb3BlcnRpZXMgdGhhdCB0aGUgYXR0YWNoZWQgY29tcG9uZW50IHdpbGwgYmUgaW5pdGFsaXplZCB3aXRoXVxuICpcbiAqIEByZXR1cm4ge0NvbXBvbmVudH0gXHRcdFx0XHQgW05ld2x5IGF0dGFjaGVkIGNvbXBvbmVudF1cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBhdHRhY2goY29tcG9uZW50LCBwcm9wZXJ0aWVzKSB7XG5cdHRoaXMuZW1wdHkoKTtcblx0cmV0dXJuIHRoaXMuYXBwZW5kKGNvbXBvbmVudCwgcHJvcGVydGllcyk7XG59O1xuIiwiLyoqXG4gKiByZWdpb24uZW1wdHkoIClcbiAqXG4gKiBJdGVyYXRlIG92ZXIgZWFjaCBjb21wb25lbnQgaW4gdGhpcyByZWdpb24gYW5kIGNhbGwgLmNsb3NlKCkgb24gaXRcbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBlbXB0eSgpIHtcblx0RlJBTUVXT1JLLmRlYnVnKHRoaXMucGFyZW50LmlkICsgJyA6OiBFbXB0eWluZyByZWdpb246ICcgKyB0aGlzLmlkKTtcblx0d2hpbGUgKHRoaXMuX2NoaWxkcmVuLmxlbmd0aCA+IDApIHtcblx0XHR0aGlzLnJlbW92ZSgwKTtcblx0fVxufTtcbiIsIi8qKlxuICogRmFjdG9yeSBtZXRob2QgdG8gZ2VuZXJhdGUgYSBuZXcgcmVnaW9uIGluc3RhbmNlIGZyb20gYSBET00gZWxlbWVudFxuICogSW1wbGVtZW50cyBgdGVtcGxhdGVgLCBgY291bnRgLCBhbmQgYGRhdGEtKmAgSFRNTCBhdHRyaWJ1dGVzLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gKiBAcmV0dXJucyByZWdpb24gaW5zdGFuY2VcbiAqL1xuXG52YXIgVXRpbHMgPSByZXF1aXJlKCcuLi91dGlscy91dGlscycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZyb21FbGVtZW50KGVsLCBwYXJlbnQpIHtcblxuXHQvLyBJZiBwYXJlbnQgaXMgbm90IHNwZWNpZmllZCwgbWFrZS1iZWxpZXZlLlxuXHRwYXJlbnQgPSBwYXJlbnQgfHwgeyBpZDogJyonIH07XG5cblxuXG5cdC8vIEJ1aWxkIHJlZ2lvblxuXHR2YXIgcmVnaW9uID0gbmV3IEZSQU1FV09SSy5SZWdpb24oe1xuXHRcdGlkOiBVdGlscy5lbDJpZChlbCksXG5cdFx0JGVsOiAkKGVsKSxcblx0XHRwYXJlbnQ6IHBhcmVudFxuXHR9KTtcblxuXHQvLyBJZiB0aGlzIHJlZ2lvbiBoYXMgYSBkZWZhdWx0IGNvbXBvbmVudC90ZW1wbGF0ZSBzZXQsXG5cdC8vIGdyYWIgdGhlIGlkICAtLSAgZS5nLiA8cmVnaW9uIGNvbnRlbnRzPVwiRm9vXCIgLz5cblx0dmFyIGNvbXBvbmVudElkID0gJChlbCkuYXR0cignY29udGVudHMnKTtcblxuXG5cdC8vIElmIGBjb3VudGAgaXMgc2V0LCByZW5kZXIgc3ViLWNvbXBvbmVudCBzcGVjaWZpZWQgbnVtYmVyIG9mIHRpbWVzLlxuXHQvLyBlLmcuIDxyZWdpb24gdGVtcGxhdGU9XCJGb29cIiBjb3VudD1cIjNcIiAvPlxuXHQvLyAodmVyaWZ5IEZSQU1FV09SSy5zaG9ydGN1dC5jb3VudCBpcyBlbmFibGVkKVxuXHR2YXIgY291bnRBdHRyLFxuXHRcdFx0Y291bnQgPSAxO1xuXG5cdGlmIChGUkFNRVdPUksub3B0aW9ucy5zaG9ydGN1dC5jb3VudCkge1xuXG5cdFx0Ly8gSWYgYGNvdW50YCBhdHRyaWJ1dGUgaXMgbm90IGZhbHNlIG9yIHVuZGVmaW5lZCxcblx0XHQvLyB0aGF0IG1lYW5zIGl0IHdhcyBzZXQgZXhwbGljaXRseSwgYW5kIHdlIHNob3VsZCB1c2UgaXRcblx0XHRjb3VudEF0dHIgPSAkKGVsKS5hdHRyKCdjb3VudCcpO1xuXHRcdC8vIEZSQU1FV09SSy5kZWJ1ZygnQ291bnQgYXR0ciBpcyA6OiAnLCBjb3VudEF0dHIpO1xuXHRcdGlmICghIWNvdW50QXR0cikge1xuXHRcdFx0Y291bnQgPSBjb3VudEF0dHI7XG5cdFx0fVxuXHR9XG5cblxuXHRGUkFNRVdPUksuZGVidWcoXG5cdFx0cGFyZW50LmlkICsgJyA6LTogSW5zdGFudGlhdGVkwqBuZXcgcmVnaW9uJyArXG5cdFx0KCByZWdpb24uaWQgPyAnIGAnICsgcmVnaW9uLmlkICsgJ2AnIDogJycgKSArXG5cdFx0KCBjb21wb25lbnRJZCA/ICcgYW5kIHBvcHVsYXRlZCBpdCB3aXRoJyArXG5cdFx0XHQoIGNvdW50ID4gMSA/IGNvdW50ICsgJyBpbnN0YW5jZXMgb2YnIDogJyAxJyApICtcblx0XHRcdCcgYCcgKyBjb21wb25lbnRJZCArICdgJyA6ICcnXG5cdFx0KSArICcuJ1xuXHQpO1xuXG5cblxuXHQvLyBBcHBlbmQgc3ViLWNvbXBvbmVudChzKSB0byByZWdpb24gYXV0b21hdGljYWxseVxuXHQvLyAodmVyaWZ5IEZSQU1FV09SSy5zaG9ydGN1dC50ZW1wbGF0ZSBpcyBlbmFibGVkKVxuXHRpZiAoIEZSQU1FV09SSy5vcHRpb25zLnNob3J0Y3V0LnRlbXBsYXRlICYmIGNvbXBvbmVudElkICkge1xuXG5cdFx0Ly8gRlJBTUVXT1JLLmRlYnVnKFxuXHRcdC8vIFx0J1ByZXBhcmluZyB0byByZW5kZXIgJyArIGNvdW50ICsgJyAnICsgY29tcG9uZW50SWQgKyAnIGNvbXBvbmVudHMgaW50byByZWdpb24gJyArXG5cdFx0Ly8gXHQnKCcgKyByZWdpb24uaWQgKyAnKSwgd2hpY2ggYWxyZWFkeSBjb250YWlucyAnICsgcmVnaW9uLiRlbC5jaGlsZHJlbigpLmxlbmd0aCArXG5cdFx0Ly8gXHQnIHN1YmNvbXBvbmVudHMuJ1xuXHRcdC8vICk7XG5cblx0XHRyZWdpb24uYXBwZW5kKGNvbXBvbmVudElkKTtcblxuXHRcdC8vIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXHRcdC8vIC8vIFNFUklPVVNMWSBXVEZcblx0XHQvLyAvLyBNQUpPUiBIQVhYWFhYWFhcblx0XHQvLyAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblx0XHQvLyBjb3VudCA9ICtjb3VudCArIDE7XG5cdFx0Ly8gLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cblx0XHQvLyBmb3IgKHZhciBqPTA7IGogPCBjb3VudDsgaisrICkge1xuXG5cdFx0Ly8gXHRyZWdpb24uYXBwZW5kKGNvbXBvbmVudElkKTtcblxuXHRcdC8vIFx0Ly8gRlJBTUVXT1JLLmRlYnVnKFxuXHRcdC8vIFx0Ly8gXHQncmVuZGVyaW5nIHRoZSAnICsgY29tcG9uZW50SWQgKyAnIGNvbXBvbmVudCwgcmVtYWluaW5nOiAnICtcblx0XHQvLyBcdC8vIFx0Y291bnQgKyAnIGFuZCB0aGVyZSBhcmUgJyArIHJlZ2lvbi4kZWwuY2hpbGRyZW4oKS5sZW5ndGggK1xuXHRcdC8vIFx0Ly8gXHQnIHN1YmNvbXBvbmVudCBlbGVtZW50cyBpbiB0aGUgcmVnaW9uIG5vdydcblx0XHQvLyBcdC8vICk7XG5cblx0XHQvLyB9XG5cblx0fVxuXG5cdHJldHVybiByZWdpb247XG59O1xuIiwiLyoqXG4gKiBSZWdpb25zXG4gKi9cblxudmFyIGluc2VydCA9IHJlcXVpcmUoJy4vaW5zZXJ0JyksXG5cdFx0cmVtb3ZlID0gcmVxdWlyZSgnLi9yZW1vdmUnKSxcblx0XHRlbXB0eSA9IHJlcXVpcmUoJy4vZW1wdHknKSxcblx0XHRhcHBlbmQgPSByZXF1aXJlKCcuL2FwcGVuZCcpLFxuXHRcdGF0dGFjaCA9IHJlcXVpcmUoJy4vYXR0YWNoJyksXG5cdFx0cHJlcGVuZCA9IHJlcXVpcmUoJy4vcHJlcGVuZCcpLFxuXHRcdGZyb21FbGVtZW50ID0gcmVxdWlyZSgnLi9mcm9tRWxlbWVudCcpO1xuXG5SZWdpb24gPSBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHJlZ2lvbihwcm9wZXJ0aWVzKSB7XG5cblx0Xy5leHRlbmQodGhpcywgRlJBTUVXT1JLLkV2ZW50cyk7XG5cblx0aWYgKCFwcm9wZXJ0aWVzKSB7XG5cdFx0cHJvcGVydGllcyA9IHt9O1xuXHR9XG5cdGlmICghcHJvcGVydGllcy4kZWwpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1RyeWluZyB0byBpbnN0YW50aWF0ZSByZWdpb24gd2l0aCBubyAkZWwhJyk7XG5cdH1cblxuXHQvLyBGb2xkIGluIHByb3BlcnRpZXMgdG8gcHJvdG90eXBlXG5cdF8uZXh0ZW5kKHRoaXMsIHByb3BlcnRpZXMpO1xuXG5cdC8vIElmIG5laXRoZXIgYW4gaWQgbm9yIGEgYHRlbXBsYXRlYCB3YXMgc3BlY2lmaWVkLFxuXHQvLyB3ZSdsbCB0aHJvdyBhbiBlcnJvciwgc2luY2UgdGhlcmUncyBubyB3YXkgdG8gZ2V0IGEgaG9sZCBvZiB0aGUgcmVnaW9uXG5cdGlmICghdGhpcy5pZCAmJiAhKHRoaXMuJGVsLmF0dHIoJ2RlZmF1bHQnKSB8fCB0aGlzLiRlbC5hdHRyKCd0ZW1wbGF0ZScpIHx8XG5cdFx0dGhpcy4kZWwuYXR0cignY29udGVudHMnKSkpIHtcblxuXHRcdHRocm93IG5ldyBFcnJvcihcblx0XHRcdHRoaXMucGFyZW50LmlkICsgJyA6OiBFaXRoZXIgYGRhdGEtaWRgLCBgY29udGVudHNgLCBvciBib3RoICcgK1xuXHRcdFx0J211c3QgYmUgc3BlY2lmaWVkIG9uIHJlZ2lvbnMuIFxcbicgK1xuXHRcdFx0J2UuZy4gPHJlZ2lvbiBkYXRhLWlkPVwiZm9vXCIgdGVtcGxhdGU9XCJTb21lQ29tcG9uZW50XCI+PC9yZWdpb24+J1xuXHRcdCk7XG5cdH1cblxuXHQvLyBTZXQgdXAgbGlzdCB0byBob3VzZSBjaGlsZCBjb21wb25lbnRzXG5cdHRoaXMuX2NoaWxkcmVuID0gW107XG5cblx0Xy5iaW5kQWxsKHRoaXMpO1xuXG5cdC8vIFNldCB1cCBjb252ZW5pZW5jZSBhY2Nlc3MgdG8gdGhpcyByZWdpb24gaW4gdGhlIGdsb2JhbCByZWdpb24gY2FjaGVcblx0RlJBTUVXT1JLLnJlZ2lvbnNbdGhpcy5pZF0gPSB0aGlzO1xufTtcblxuUmVnaW9uLmZyb21FbGVtZW50ID0gZnVuY3Rpb24oZWwsIHBhcmVudCkge1xuXHRyZXR1cm4gZnJvbUVsZW1lbnQoZWwsIHBhcmVudCk7XG59O1xuUmVnaW9uLnByb3RvdHlwZS5yZW1vdmUgPSBmdW5jdGlvbihhdEluZGV4KSB7XG5cdHJldHVybiByZW1vdmUuY2FsbCh0aGlzLCBhdEluZGV4KTtcbn07XG5SZWdpb24ucHJvdG90eXBlLmVtcHR5ID0gZnVuY3Rpb24oKSB7XG5cdHJldHVybiBlbXB0eS5jYWxsKHRoaXMpO1xufTtcblJlZ2lvbi5wcm90b3R5cGUuaW5zZXJ0ID0gZnVuY3Rpb24oYXRJbmRleCwgY29tcG9uZW50SWQsIHByb3BlcnRpZXMpIHtcblx0cmV0dXJuIGluc2VydC5jYWxsKHRoaXMsIGF0SW5kZXgsIGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKTtcbn07XG5SZWdpb24ucHJvdG90eXBlLmFwcGVuZCA9IGZ1bmN0aW9uKGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKSB7XG5cdHJldHVybiBhcHBlbmQuY2FsbCh0aGlzLCBjb21wb25lbnRJZCwgcHJvcGVydGllcyk7XG59O1xuUmVnaW9uLnByb3RvdHlwZS5hdHRhY2ggPSBmdW5jdGlvbihjb21wb25lbnQsIHByb3BlcnRpZXMpIHtcblx0cmV0dXJuIGF0dGFjaC5jYWxsKHRoaXMsIGNvbXBvbmVudCwgcHJvcGVydGllcyk7XG59O1xuUmVnaW9uLnByb3RvdHlwZS5wcmVwZW5kID0gZnVuY3Rpb24oY29tcG9uZW50SWQsIHByb3BlcnRpZXMpIHtcblx0cmV0dXJuIHByZXBlbmQuY2FsbCh0aGlzLCBjb21wb25lbnRJZCwgcHJvcGVydGllcyk7XG59O1xuIiwiLyoqXG4gKiByZWdpb24uaW5zZXJ0KCBhdEluZGV4LCBjb21wb25lbnRJZCwgW3Byb3BlcnRpZXNdIClcbiAqXG4gKiBUT0RPOiBzdXBwb3J0IGEgbGlzdCBvZiBwcm9wZXJ0aWVzIG9iamVjdHMgaW4gbGlldSBvZiB0aGUgcHJvcGVydGllcyBvYmplY3RcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGluc2VydChhdEluZGV4LCBjb21wb25lbnRJZCwgcHJvcGVydGllcykge1xuXG5cdHZhciBlcnIgPSAnJztcblx0aWYgKCEoYXRJbmRleCB8fCBfLmlzRmluaXRlKGF0SW5kZXgpKSkge1xuXHRcdGVyciArPSB0aGlzLmlkICsgJy5pbnNlcnQoKSA6OiBObyBhdEluZGV4IHNwZWNpZmllZCEnO1xuXHR9XG5cdGVsc2UgaWYgKCFjb21wb25lbnRJZCkge1xuXHRcdGVyciArPSB0aGlzLmlkICsgJy5pbnNlcnQoKSA6OiBObyBjb21wb25lbnRJZCBzcGVjaWZpZWQhJztcblx0fVxuXHRpZiAoZXJyKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGVyciArICdcXG5Vc2FnZTogYXBwZW5kKGF0SW5kZXgsIGNvbXBvbmVudElkLCBbcHJvcGVydGllc10pJyk7XG5cdH1cblxuXHR2YXIgY29tcG9uZW50O1xuXHQvLyBJZiBjb21wb25lbnRJZCBpcyBhIHN0cmluZywgbG9vayB1cCBjb21wb25lbnQgcHJvdG90eXBlIGFuZCBpbnN0YXRpYXRlXG5cdGlmICgnc3RyaW5nJyA9PSB0eXBlb2YgY29tcG9uZW50SWQpIHtcblxuXHRcdHZhciBjb21wb25lbnRQcm90b3R5cGUgPSBGUkFNRVdPUksuY29tcG9uZW50c1tjb21wb25lbnRJZF07XG5cblx0XHRpZiAoIWNvbXBvbmVudFByb3RvdHlwZSkge1xuXHRcdFx0dmFyIHRlbXBsYXRlID0gRlJBTUVXT1JLLnRlbXBsYXRlc1tjb21wb25lbnRJZF07XG5cdFx0XHRpZiAoIXRlbXBsYXRlKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvciAoJ0luICcgK1xuXHRcdFx0XHRcdCh0aGlzLmlkIHx8ICdBbm9ueW1vdXMgcmVnaW9uJykgKyAnOjogVHJ5aW5nIHRvIGF0dGFjaCAnICtcblx0XHRcdFx0XHRjb21wb25lbnRJZCArICcsIGJ1dCBubyBjb21wb25lbnQgb3IgdGVtcGxhdGUgZXhpc3RzIHdpdGggdGhhdCBpZC4nKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSWYgbm8gY29tcG9uZW50IHByb3RvdHlwZSB3aXRoIHRoaXMgaWQgZXhpc3RzLFxuXHRcdFx0Ly8gY3JlYXRlIGFuIGFub255bW91cyBvbmUgdG8gdXNlXG5cdFx0XHRjb21wb25lbnRQcm90b3R5cGUgPSBGUkFNRVdPUksuQ29tcG9uZW50LmV4dGVuZCh7XG5cdFx0XHRcdGlkOiBjb21wb25lbnRJZCxcblx0XHRcdFx0dGVtcGxhdGU6IHRlbXBsYXRlXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBJbnN0YW50aWF0ZSBhbmQgcmVuZGVyIHRoZSBjb21wb25lbnQgaW5zaWRlIHRoaXMgcmVnaW9uXG5cdFx0Y29tcG9uZW50ID0gbmV3IGNvbXBvbmVudFByb3RvdHlwZShfLmV4dGVuZCh7XG5cdFx0XHQkb3V0bGV0OiB0aGlzLiRlbFxuXHRcdH0sIHByb3BlcnRpZXMgfHwge30pKTtcblxuXG5cdH1cblxuXHQvLyBPdGhlcndpc2UgYXNzdW1lIGFuIGluc3RhbnRpYXRlZCBjb21wb25lbnQgb2JqZWN0IHdhcyBzZW50XG5cdC8qIFRPRE86IENoZWNrIHRoYXQgY29tcG9uZW50IG9iamVjdCBpcyB2YWxpZCAqL1xuXHRlbHNlIHtcblx0XHRjb21wb25lbnQgPSBjb21wb25lbnRJZDtcblx0XHRjb21wb25lbnQuJG91dGxldCA9IHRoaXMuJGVsO1xuXHR9XG5cblx0Ly8gU2F2ZSByZWZlcmVuY2UgdG8gcGFyZW50UmVnaW9uXG5cdGNvbXBvbmVudC5wYXJlbnRSZWdpb24gPSB0aGlzO1xuXG5cdC8vIFJlbmRlciBjb21wb25lbnQgaW50byB0aGlzIHJlZ2lvblxuXHRjb21wb25lbnQucmVuZGVyKGF0SW5kZXgpO1xuXG5cdC8vIEFuZCBrZWVwIHRyYWNrIG9mIGl0IGluIHRoZSBsaXN0IG9mIHRoaXMgcmVnaW9uJ3MgY2hpbGRyZW5cblx0dGhpcy5fY2hpbGRyZW4uc3BsaWNlKGF0SW5kZXgsIDAsIGNvbXBvbmVudCk7XG5cblx0Ly8gTG9nIGZvciBkZWJ1Z2dpbmcgYGNvdW50YCBkZWNsYXJhdGl2ZVxuXHR2YXIgZGVidWdTdHIgPSB0aGlzLnBhcmVudC5pZCArICcgOjogSW5zZXJ0ZWQgJyArIGNvbXBvbmVudElkICsgJyBpbnRvICc7XG5cdGlmICh0aGlzLmlkKSBkZWJ1Z1N0ciArPSAncmVnaW9uOiAnICsgdGhpcy5pZCArICcgYXQgaW5kZXggJyArIGF0SW5kZXg7XG5cdGVsc2UgZGVidWdTdHIgKz0gJ2Fub255bW91cyByZWdpb24gYXQgaW5kZXggJyArIGF0SW5kZXg7XG5cdEZSQU1FV09SSy52ZXJib3NlKGRlYnVnU3RyKTtcblxuXHRyZXR1cm4gY29tcG9uZW50O1xuXG59O1xuIiwiLyoqXG4gKiBQcmVwZW5kIGEgY29tcG9uZW50IHRvIHRoZSBiZWdpbm5pbmcgb2YgYSByZWdpb24uIFRoaXMgY2FsbHMgaW5zZXJ0IGF0IHRoZSBmaXJzdCBwb3NpdGlvbi5cbiAqXG4gKiBAcGFyYW0gIHtTdHJpbmd9IGNvbXBvbmVudElkIFtUaGUgY29tcG9uZW50IGlkIHRoYXQgd2Ugd2FudCB0byBwcmVwZW5kIF1cbiAqIEBwYXJhbSAge09iamVjdH0gcHJvcGVydGllcyAgW1Byb3BlcnRpZXMgdG8gaW5zdGFudGlhdGUgdGhlIGNvbXBvbmVudCB3aXRoXVxuICpcbiAqIEByZXR1cm4ge0NvbXBvbmVudH0gICAgICAgICAgW05ld2x5IHByZXBlbmRlZCBDb21wb25lbnRdXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcHJlcGVuZChjb21wb25lbnRJZCwgcHJvcGVydGllcykge1xuXHQvLyBJbnNlcnQgYXQgbGFzdCBwb3NpdGlvblxuXHRyZXR1cm4gdGhpcy5pbnNlcnQoMCwgY29tcG9uZW50SWQsIHByb3BlcnRpZXMpO1xufTtcbiIsIi8qKlxuICogcmVnaW9uLnJlbW92ZSggYXRJbmRleCApXG4gKlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHJlbW92ZShhdEluZGV4KSB7XG5cblx0aWYgKCFhdEluZGV4ICYmICFfLmlzRmluaXRlKGF0SW5kZXgpKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKHRoaXMuaWQgKyAnLnJlbW92ZSgpIDo6IE5vIGF0SW5kZXggc3BlY2lmaWVkISBcXG5Vc2FnZTogcmVtb3ZlKGF0SW5kZXgpJyk7XG5cdH1cblxuXHQvLyBSZW1vdmUgdGhlIGNvbXBvbmVudCBmcm9tIHRoZSBsaXN0XG5cdHZhciBjb21wb25lbnQgPSB0aGlzLl9jaGlsZHJlbi5zcGxpY2UoYXRJbmRleCwgMSk7XG5cdGlmICghY29tcG9uZW50WzBdKSB7XG5cblx0XHQvLyBJZiB0aGUgbGlzdCBpcyBlbXB0eSwgZnJlYWsgb3V0XG5cdFx0dGhyb3cgbmV3IEVycm9yKHRoaXMuaWQgKyAnLnJlbW92ZSgpIDo6IFRyeWluZyB0byByZW1vdmUgYSBjb21wb25lbnQgdGhhdCBkb2VzblxcJ3QgZXhpc3QgYXQgaW5kZXggJyArIGF0SW5kZXgpO1xuXHR9XG5cblx0Ly8gU3F1ZWV6ZSB0aGUgY29tcG9uZW50IHRvIGRvIGdldCBhbGwgdGhlIGJpbmR5IGdvb2RuZXNzIG91dFxuXHRjb21wb25lbnRbMF0uY2xvc2UoKTtcblxuXHRGUkFNRVdPUksuZGVidWcodGhpcy5wYXJlbnQuaWQgKyAnIDo6IFJlbW92ZWQgY29tcG9uZW50IGF0IGluZGV4ICcgKyBhdEluZGV4ICsgJyBmcm9tIHJlZ2lvbjogJyArIHRoaXMuaWQpO1xufTtcbiIsIi8qKlxuICogU2V0cyB1cCB0aGUgRlJBTUVXT1JLIHJvdXRlci5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByb3V0ZXJTZXR1cCgpIHtcblxuXHQvLyBXaWxkY2FyZCByb3V0ZXMgdG8gZ2xvYmFsIGV2ZW50IGRlbGVnYXRvclxuXHR2YXIgcm91dGVyID0gbmV3IEZSQU1FV09SSy5Sb3V0ZXIoKTtcblx0cm91dGVyLnJvdXRlKC8oLiopLywgJ3JvdXRlJywgZnVuY3Rpb24gKHJvdXRlKSB7XG5cblx0XHQvLyBOb3JtYWxpemUgaG9tZSByb3V0ZXMgKCMgb3IgbnVsbCkgdG8gJydcblx0XHRpZiAoIXJvdXRlKSB7XG5cdFx0XHRyb3V0ZSA9ICcnO1xuXHRcdH1cblxuXHRcdC8vIFRyaWdnZXIgcm91dGVcblx0XHRGUkFNRVdPUksudHJpZ2dlcignIycgKyByb3V0ZSk7XG5cdH0pO1xuXG5cdC8vIEV4cG9zZSBgbmF2aWdhdGUoKWAgbWV0aG9kXG5cdEZSQU1FV09SSy5uYXZpZ2F0ZSA9IEZSQU1FV09SSy5oaXN0b3J5Lm5hdmlnYXRlO1xufVxuIiwiLyoqXG4gKiBCYXJlLWJvbmVzIERPTS9VSSB1dGlsaXRpZXNcbiAqL1xuXG52YXIgRXZlbnRzID0gcmVxdWlyZSgnLi9ldmVudHMnKTtcblxudmFyIERPTSA9IHtcblxuXHQvKipcblx0ICogRXhwb3NlIHRoZSBcIkRPTW15LWV2ZW50ZWRuZXNzXCIgb2YgZWxlbWVudHMgc28gdGhhdCBpdCdzIHNlbGVjdGFibGUgdmlhIENTU1xuXHQgKiBZb3UgY2FuIHVzZSB0aGlzIHRvIGFwcGx5IGEgZmV3IGNob2ljZSBET00gbW9kaWZpY2F0aW9ucyBvdXQgdGhlIGdhdGUtLVxuXHQgKiAoZS5nLiB0d2Vha3MgdGFyZ2V0aW5nIGNvbW1vbiBpc3N1ZXMgdGhhdCB0eXBpY2FsbHkgZ2V0IGZvcmdvdHRlbiwgbGlrZSBkaXNhYmxpbmcgdGV4dCBzZWxlY3Rpb24pXG5cdCAqXG5cdCAqIEBwYXJhbSB7Q29tcG9uZW50fSBjb21wb25lbnRcblx0ICovXG5cdGZsYWdCb3VuZEV2ZW50czogZnVuY3Rpb24gKCBjb21wb25lbnQgKSB7XG5cblx0XHQvLyBUT0RPOiBwcm92aWRlIGFjY2VzcyB0byBib3VuZCBnbG9iYWwgZXZlbnRzICglKSBhbmQgcm91dGVzICgjKSBhcyB3ZWxsXG5cdFx0Ly8gVE9ETzogZmxhZyBhbGwgRE9NIGV2ZW50cywgbm90IGp1c3QgY2xpY2sgYW5kIHRvdWNoXG5cblx0XHQvLyBCdWlsZCBzdWJzZXQgb2YganVzdCB0aGUgY2xpY2svdG91Y2ggZXZlbnRzXG5cdFx0dmFyIGNsaWNrT3JUb3VjaEV2ZW50cyA9IEV2ZW50cy5wYXJzZShcblx0XHRcdGNvbXBvbmVudC5ldmVudHMsXG5cdFx0XHR7IG9ubHk6IFsnY2xpY2snLCAndG91Y2gnLCAndG91Y2hzdGFydCcsICd0b3VjaGVuZCddIH1cblx0XHQpO1xuXG5cdFx0Ly8gSWYgbm8gY2xpY2svdG91Y2ggZXZlbnRzIGZvdW5kLCBiYWlsIG91dFxuXHRcdGlmICggY2xpY2tPclRvdWNoRXZlbnRzLmxlbmd0aCA8IDEgKSByZXR1cm47XG5cblx0XHQvLyBRdWVyeSBhZmZlY3RlZCBlbGVtZW50cyBmcm9tIERPTVxuXHRcdHZhciAkYWZmZWN0ZWQgPSBFdmVudHMuZ2V0RWxlbWVudHMoY2xpY2tPclRvdWNoRXZlbnRzLCBjb21wb25lbnQpO1xuXG5cdFx0Ly8gTk9URTogRm9yIG5vdywgdGhpcyBpcyBhbHdheXMganVzdCAnY2xpY2snXG5cdFx0dmFyIGJvdW5kRXZlbnRzU3RyaW5nID0gJ2NsaWNrJztcblxuXHRcdC8vIFNldCBgZGF0YS1GUkFNRVdPUkstY2xpY2thYmxlYCBjdXN0b20gYXR0cmlidXRlXG5cdFx0Ly8gKHVpIGxvZ2ljIHNob3VsZCBiZSBleHRlbmRlZCBpbiBDU1MpXG5cdFx0JGFmZmVjdGVkLmF0dHIoJ2RhdGEtJyArIEZSQU1FV09SSy5vcHRpb25zLmZyYW1ld29ya0lkICsgJy1ldmVudHMnLCBib3VuZEV2ZW50c1N0cmluZyk7XG5cblx0XHRGUkFNRVdPUksudmVyYm9zZShcblx0XHRcdGNvbXBvbmVudC5pZCArICcgOjogJyArXG5cdFx0XHQnRGlzYWJsZWQgdXNlciB0ZXh0IHNlbGVjdGlvbiBvbiBlbGVtZW50cyB3LyBjbGljay90b3VjaCBldmVudHM6Jyxcblx0XHRcdGNsaWNrT3JUb3VjaEV2ZW50cyxcblx0XHRcdCRhZmZlY3RlZFxuXHRcdCk7XG5cdH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gRE9NO1xuIiwiLyoqXG4gKiBVdGlsaXR5IEV2ZW50IHRvb2xraXRcbiAqL1xuXG52YXIgVXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzLmpzJyk7XG5cbnZhciBFdmVudHMgPSB7XG5cblx0LyoqXG5cdCAqIFBhcnNlcyBhIGRpY3Rpb25hcnkgb2YgZXZlbnRzIGFuZCBvcHRpb25hbGx5IGZpbHRlcnMgYnkgdGhlIGV2ZW50IHR5cGUuIElmIHRoZSBldmVudFxuXHQgKlxuXHQgKiBAcGFyYW0gIHtPYmplY3R9IGV2ZW50cyAgW0EgQmFja2JvbmUuVmlldyBldmVudHMgb2JqZWN0XVxuXHQgKiBAcGFyYW0gIHtPYmplY3R9IG9wdGlvbnMgW09wdGlvbnMgb2JqZWN0IHRoYXQgYWxsb3dzIHVzIHRvIGZpbHRlciBwYXJzaW5nIHRvIGNlcnRhaW4gZXZlbnRcblx0ICogICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lc11cblx0ICpcblx0ICogQHJldHVybiB7QXJyYXl9ICAgICAgICAgIFtBcnJheSBjb250YWluaW5nIHBhcnNlZEV2ZW50cyB0aGF0IGFyZSBtYXRjaGluZyBldmVudCBrZXlzXVxuXHQgKi9cblx0cGFyc2U6IGZ1bmN0aW9uIChldmVudHMsIG9wdGlvbnMpIHtcblxuXHRcdHZhciBldmVudEtleXMgPSBfLmtleXMoZXZlbnRzIHx8IHt9KSxcblx0XHRcdGxpbWl0RXZlbnRzLFxuXHRcdFx0cGFyc2VkRXZlbnRzID0gW107XG5cblx0XHQvLyBPcHRpb25hbGx5IGZpbHRlciB1c2luZyBzZXQgb2YgYWNjZXB0YWJsZSBldmVudCB0eXBlc1xuXHRcdGxpbWl0RXZlbnRzID0gb3B0aW9ucy5vbmx5O1xuXHRcdGV2ZW50S2V5cyA9IF8uZmlsdGVyKGV2ZW50S2V5cywgZnVuY3Rpb24gY2hlY2tFdmVudE5hbWUgKGV2ZW50S2V5KSB7XG5cblx0XHRcdC8vIFBhcnNlIGV2ZW50IHN0cmluZyBpbnRvIHNlbWFudGljIHJlcHJlc2VudGF0aW9uXG5cdFx0XHR2YXIgZXZlbnQgPSBFdmVudHMucGFyc2VET01FdmVudChldmVudEtleSk7XG5cdFx0XHRwYXJzZWRFdmVudHMucHVzaChldmVudCk7XG5cblx0XHRcdC8vIE9wdGlvbmFsIGZpbHRlclxuXHRcdFx0aWYgKGxpbWl0RXZlbnRzKSB7XG5cdFx0XHRcdHJldHVybiBfLmNvbnRhaW5zKGxpbWl0RXZlbnRzLCBldmVudC5uYW1lKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHBhcnNlZEV2ZW50cztcblx0fSxcblxuXHQvKipcblx0ICogW2dldEVsZW1lbnRzIGRlc2NyaXB0aW9uXVxuXHQgKlxuXHQgKiBAcGFyYW0gIHtBcnJheX0gc2VtYW50aWNFdmVudHMgW0EgbGlzdCBvZiBwYXJzZWQgZXZlbnQgb2JqZWN0c11cblx0ICogQHBhcmFtICB7Q29tcG9uZW50fSBjb250ZXh0ICAgIFtJbnN0YW5jZSBvZiBhIGNvbXBvbmVudCB0byB1c2UgYXMgYSBzdGFydGluZyBwb2ludCBmb3Jcblx0ICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGUgRE9NIHF1ZXJpZXNdXG5cdCAqXG5cdCAqIEByZXR1cm4ge0FycmF5fSAgICAgICAgICAgICAgICBbQW4gYXJyYXkgb2YgalF1ZXJ5IHNldCBvZiBtYXRjaGVkIGVsZW1lbnRzXVxuXHQgKi9cblx0Z2V0RWxlbWVudHM6IGZ1bmN0aW9uIChzZW1hbnRpY0V2ZW50cywgY29udGV4dCkge1xuXG5cdFx0Ly8gQ29udGV4dCBvcHRpb25hbFxuXHRcdGNvbnRleHQgPSBjb250ZXh0IHx8IHsgJDogJCB9O1xuXG5cdFx0Ly8gSXRlcmF0aXZlbHkgYnVpbGQgYSBzZXQgb2YgYWZmZWN0ZWQgZWxlbWVudHNcblx0XHR2YXIgJGFmZmVjdGVkID0gJCgpO1xuXHRcdF8uZWFjaChzZW1hbnRpY0V2ZW50cywgZnVuY3Rpb24gbG9va3VwRWxlbWVudHNGb3JFdmVudCAoZXZlbnQpIHtcblxuXHRcdFx0Ly8gRGV0ZXJtaW5lIG1hdGNoZWQgZWxlbWVudHNcblx0XHRcdC8vIFVzZSBkZWxlZ2F0ZSBzZWxlY3RvciBpZiBzcGVjaWZpZWRcblx0XHRcdC8vIE90aGVyd2lzZSwgZ3JhYiB0aGUgZWxlbWVudCBmb3IgdGhpcyBjb21wb25lbnRcblx0XHRcdHZhciAkbWF0Y2hlZCA9XHRldmVudC5zZWxlY3RvciA/XG5cdFx0XHRcdFx0XHRcdGNvbnRleHQuJChldmVudC5zZWxlY3RvcikgOlxuXHRcdFx0XHRcdFx0XHRjb250ZXh0LiRlbDtcblxuXHRcdFx0Ly8gQWRkIG1hdGNoZWQgZWxlbWVudHMgdG8gc2V0XG5cdFx0XHQkYWZmZWN0ZWQgPSAkYWZmZWN0ZWQuYWRkKCAkbWF0Y2hlZCApO1xuXHRcdH0sIHRoaXMpO1xuXG5cdFx0cmV0dXJuICRhZmZlY3RlZDtcblx0fSxcblxuXG5cblx0LyoqXG5cdCAqIFJldHVybnMgd2hldGhlciB0aGUgc3BlY2lmaWVkIGV2ZW50IGtleSBtYXRjaGVzIGEgRE9NIGV2ZW50LlxuXHQgKlxuXHQgKiBAcGFyYW0gIHtTdHJpbmd9IGtleSBbS2V5IHRvIG1hdGNoIGFnYWluc3RdXG5cdCAqXG5cdCAqIGlmIG5vIG1hdGNoIGlzIGZvdW5kXG5cdCAqIEByZXR1cm4ge0Jvb2xlYW59IFx0XHRbcmV0dXJuIGBmYWxzZWBdXG5cdCAqXG5cdCAqIG90aGVyd2lzZVxuXHQgKiBAcmV0dXJuIHtPYmplY3R9ICBcdFx0W09iamVjdCBjb250YWluaW5nIHRoZSBgbmFtZWAgb2YgdGhlIERPTSBlbGVtZW50IGFuZCB0aGUgYHNlbGVjdG9yYF1cblx0ICovXG5cdHBhcnNlRE9NRXZlbnQ6IF8ubWVtb2l6ZShmdW5jdGlvbihrZXkpIHtcblxuXHRcdHZhciBtYXRjaGVzID0ga2V5Lm1hdGNoKHRoaXNbJy9ET01FdmVudC8nXSk7XG5cblx0XHRpZiAoIW1hdGNoZXMgfHwgIW1hdGNoZXNbMV0pIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZTogbWF0Y2hlc1sxXSxcblx0XHRcdHNlbGVjdG9yOiBtYXRjaGVzWzNdXG5cdFx0fTtcblx0fSksXG5cblxuXHQvKipcblx0ICogU3VwcG9ydGVkIFwiZmlyc3QtY2xhc3NcIiBET00gZXZlbnRzLlxuXHQgKiBAdHlwZSB7QXJyYXl9XG5cdCAqL1xuXHRuYW1lczogW1xuXG5cdFx0Ly8gTG9jYWxpemVkIGJyb3dzZXIgZXZlbnRzXG5cdFx0Ly8gKHdvcmtzIG9uIGluZGl2aWR1YWwgZWxlbWVudHMpXG5cdFx0J2Vycm9yJywgJ3Njcm9sbCcsXG5cblx0XHQvLyBNb3VzZSBldmVudHNcblx0XHQnY2xpY2snLCAnZGJsY2xpY2snLCAnbW91c2Vkb3duJywgJ21vdXNldXAnLCAnaG92ZXInLCAnbW91c2VlbnRlcicsICdtb3VzZWxlYXZlJyxcblx0XHQnbW91c2VvdmVyJywgJ21vdXNlb3V0JywgJ21vdXNlbW92ZScsXG5cblx0XHQvLyBLZXlib2FyZCBldmVudHNcblx0XHQna2V5ZG93bicsICdrZXl1cCcsICdrZXlwcmVzcycsXG5cblx0XHQvLyBGb3JtIGV2ZW50c1xuXHRcdCdibHVyJywgJ2NoYW5nZScsICdmb2N1cycsICdmb2N1c2luJywgJ2ZvY3Vzb3V0JywgJ3NlbGVjdCcsICdzdWJtaXQnLFxuXG5cdFx0Ly8gUmF3IHRvdWNoIGV2ZW50c1xuXHRcdCd0b3VjaHN0YXJ0JywgJ3RvdWNoZW5kJywgJ3RvdWNobW92ZScsICd0b3VjaGNhbmNlbCcsXG5cblx0XHQvLyBNYW51ZmFjdHVyZWQgZXZlbnRzXG5cdFx0J3RvdWNoJyxcblxuXHRcdC8vIFRPRE86XG5cdFx0J3JpZ2h0Y2xpY2snLCAnY2xpY2tvdXRzaWRlJ1xuXHRdXG59O1xuXG5cblxuXG4vKipcbiAqIFJlZ2V4cCB0byBtYXRjaCBcImZpcnN0IGNsYXNzXCIgRE9NIGV2ZW50c1xuICogKHRoZXNlIGFyZSBhbGxvd2VkIGluIHRoZSB0b3AgbGV2ZWwgb2YgYSBjb21wb25lbnQgZGVmaW5pdGlvbiBhcyBtZXRob2Qga2V5cylcbiAqXHRcdGkuZS4gL14oY2xpY2t8aG92ZXJ8Ymx1cnxmb2N1cykoICguKykpL1xuICpcdFx0XHRbMV0gPT4gZXZlbnQgbmFtZVxuICpcdFx0XHRbM10gPT4gc2VsZWN0b3JcbiAqL1xuXG5FdmVudHNbJy9ET01FdmVudC8nXSA9IG5ldyBSZWdFeHAoJ14oJyArIF8ucmVkdWNlKEV2ZW50cy5uYW1lcyxcblx0ZnVuY3Rpb24gYnVpbGRSZWdleHAobWVtbywgZXZlbnROYW1lLCBpbmRleCkge1xuXG5cdFx0Ly8gT21pdCBgfGAgdGhlIGZpcnN0IHRpbWVcblx0XHRpZiAoaW5kZXggPT09IDApIHtcblx0XHRcdHJldHVybiBtZW1vICsgZXZlbnROYW1lO1xuXHRcdH1cblxuXHRcdHJldHVybiBtZW1vICsgJ3wnICsgZXZlbnROYW1lO1xuXHR9LCAnJykgK1xuJykoICguKykpPyQnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBFdmVudHM7XG4iLCIvKipcbiAqIFRyYW5zbGF0ZSAqKnJpZ2h0LWhhbmQtc2lkZSBhYmJyZXZpYXRpb25zKiogaW50byBmdW5jdGlvbnMgdGhhdCBwZXJmb3JtXG4gKiB0aGUgcHJvcGVyIGJlaGF2aW9ycywgZS5nLlxuICpcdFx0I2Fib3V0X21lXG4gKlx0XHQlbWFpbk1lbnU6b3BlblxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gdHJhbnNsYXRlU2hvcnRoYW5kKHZhbHVlLCBrZXkpIHtcblxuXHR2YXIgbWF0Y2hlcywgZm47XG5cblx0Ly8gSWYgdGhpcyBpcyBhbiBpbXBvcnRhbnQsIEZSQU1FV09SSy1zcGVjaWZpYyBkYXRhIGtleSxcblx0Ly8gYW5kIGEgZnVuY3Rpb24gd2FzIHNwZWNpZmllZCwgcnVuIGl0IHRvIGdldCBpdHMgdmFsdWVcblx0Ly8gKHRoaXMgaXMgdG8ga2VlcCBwYXJpdHkgd2l0aCBCYWNrYm9uZSdzIHNpbWlsYXIgZnVuY3Rpb25hbGl0eSlcblx0aWYgKF8uaXNGdW5jdGlvbih2YWx1ZSkgJiYgKGtleSA9PT0gJ2NvbGxlY3Rpb24nIHx8IGtleSA9PT0gJ21vZGVsJykpIHtcblx0XHRyZXR1cm4gdmFsdWUoKTtcblx0fVxuXG5cdC8vIElnbm9yZSBvdGhlciBub24tc3RyaW5nc1xuXHRpZiAoIV8uaXNTdHJpbmcodmFsdWUpKSB7XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG5cblx0Ly8gUmVkaXJlY3RzIHVzZXIgdG8gY2xpZW50LXNpZGUgVVJMLCB3L28gYWZmZWN0aW5nIGJyb3dzZXIgaGlzdG9yeVxuXHQvLyBMaWtlIGNhbGxpbmcgYEJhY2tib25lLmhpc3RvcnkubmF2aWdhdGUoJy9mb28nLCB7IHJlcGxhY2U6IHRydWUgfSlgXG5cdGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eIyMoLipbXi5cXHNdKS8pKSAmJiBtYXRjaGVzWzFdKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiByZWRpcmVjdEFuZENvdmVyVHJhY2tzKCkge1xuXHRcdFx0dmFyIHVybCA9IG1hdGNoZXNbMV07XG5cdFx0XHRGUkFNRVdPUksuaGlzdG9yeS5uYXZpZ2F0ZSh1cmwsIHtcblx0XHRcdFx0dHJpZ2dlcjogdHJ1ZSxcblx0XHRcdFx0cmVwbGFjZTogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0fTtcblx0fVxuXHQvLyBNZXRob2QgdG8gcmVkaXJlY3QgdXNlciB0byBhIGNsaWVudC1zaWRlIFVSTCwgdGhlbiBjYWxsIHRoZSBoYW5kbGVyXG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14jKC4qW14uXFxzXSspLykpICYmIG1hdGNoZXNbMV0pIHtcblx0XHRmbiA9IGZ1bmN0aW9uIGNoYW5nZVVybEZyYWdtZW50KCkge1xuXHRcdFx0dmFyIHVybCA9IG1hdGNoZXNbMV07XG5cdFx0XHRGUkFNRVdPUksuaGlzdG9yeS5uYXZpZ2F0ZSh1cmwsIHtcblx0XHRcdFx0dHJpZ2dlcjogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0fTtcblx0fVxuXHQvLyBNZXRob2QgdG8gdHJpZ2dlciBnbG9iYWwgZXZlbnRcblx0ZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXiglLipbXi5cXHNdKS8pKSAmJiBtYXRjaGVzWzFdKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiB0cmlnZ2VyRXZlbnQoKSB7XG5cdFx0XHR2YXIgdHJpZ2dlciA9IG1hdGNoZXNbMV07XG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZSh0aGlzLmlkICsgJyA6OiBUcmlnZ2VyaW5nIGV2ZW50ICgnICsgdHJpZ2dlciArICcpLi4uJyk7XG5cdFx0XHRGUkFNRVdPUksudHJpZ2dlcih0cmlnZ2VyKTtcblx0XHR9O1xuXHR9XG5cdC8vIE1ldGhvZCB0byBmaXJlIGEgdGVzdCBhbGVydFxuXHQvLyAodXNlIG1lc3NhZ2UsIGlmIHNwZWNpZmllZClcblx0ZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXiEhIVxccyooLipbXi5cXHNdKT8vKSkpIHtcblx0XHRmbiA9IGZ1bmN0aW9uIGJhbmdBbGVydChlKSB7XG5cblx0XHRcdC8vIElmIHNwZWNpZmllZCwgbWVzc2FnZSBpcyB1c2VkLCBvdGhlcndpc2UgJ0FsZXJ0IHRyaWdnZXJlZCEnXG5cdFx0XHR2YXIgbXNnID0gKG1hdGNoZXMgJiYgbWF0Y2hlc1sxXSkgfHwgJ0RlYnVnIGFsZXJ0ICghISEpIHRyaWdnZXJlZCEnO1xuXG5cdFx0XHQvLyBPdGhlciBkaWFnbm9zdGljIGluZm9ybWF0aW9uXG5cdFx0XHRtc2cgKz0gJ1xcblxcbkRpYWdub3N0aWNzXFxuPT09PT09PT09PT09PT09PT09PT09PT09XFxuJztcblx0XHRcdGlmIChlICYmIGUuY3VycmVudFRhcmdldCkge1xuXHRcdFx0XHRtc2cgKz0gJ2UuY3VycmVudFRhcmdldCA6OiAnICsgZS5jdXJyZW50VGFyZ2V0O1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuaWQpIHtcblx0XHRcdFx0bXNnICs9ICd0aGlzLmlkIDo6ICcgKyB0aGlzLmlkO1xuXHRcdFx0fVxuXG5cdFx0XHRhbGVydChtc2cpO1xuXHRcdH07XG5cdH1cblxuXHQvLyBNZXRob2QgdG8gbG9nIGEgbWVzc2FnZSB0byB0aGUgY29uc29sZVxuXHQvLyAodXNlIG1lc3NhZ2UsIGlmIHNwZWNpZmllZClcblx0ZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXj4+PlxccyooLipbXi5cXHNdKT8vKSkpIHtcblxuXHRcdGZuID0gZnVuY3Rpb24gbG9nTWVzc2FnZShlKSB7XG5cblx0XHRcdC8vIElmIHNwZWNpZmllZCwgbWVzc2FnZSBpcyB1c2VkLCBvdGhlcndpc2UgdXNlIGRlZmF1bHRcblx0XHRcdHZhciBtc2cgPSAobWF0Y2hlcyAmJiBtYXRjaGVzWzFdKSB8fCAnTG9nIG1lc3NhZ2UgKD4+PikgdHJpZ2dlcmVkISc7XG5cdFx0XHRGUkFNRVdPUksubG9nKG1zZyk7XG5cdFx0fTtcblx0fVxuXG5cdC8vIE1ldGhvZCB0byBhdHRhY2ggdGhlIHNwZWNpZmllZCBjb21wb25lbnQvdGVtcGxhdGUgdG8gYSByZWdpb25cblx0ZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXiguKylAKC4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSAmJiBtYXRjaGVzWzJdKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiBhdHRhY2hUZW1wbGF0ZSgpIHtcblx0XHRcdEZSQU1FV09SSy52ZXJib3NlKHRoaXMuaWQgKyAnIDo6IEF0dGFjaGluZyBgJyArIG1hdGNoZXNbMl0gKyAnYCB0byBgJyArIG1hdGNoZXNbMV0gKyAnYC4uLicpO1xuXG5cdFx0XHR2YXIgcmVnaW9uID0gbWF0Y2hlc1sxXTtcblx0XHRcdHZhciB0ZW1wbGF0ZSA9IG1hdGNoZXNbMl07XG5cblx0XHRcdHRoaXNbcmVnaW9uXS5hdHRhY2godGVtcGxhdGUpO1xuXHRcdH07XG5cdH1cblxuXG5cdC8vIE1ldGhvZCB0byBhZGQgdGhlIHNwZWNpZmllZCBjbGFzc1xuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eXFwrXFxzKlxcLiguKlteLlxcc10pLykpICYmIG1hdGNoZXNbMV0pIHtcblx0XHRmbiA9IGZ1bmN0aW9uIGFkZENsYXNzKCkge1xuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UodGhpcy5pZCArICcgOjogQWRkaW5nIGNsYXNzICgnICsgbWF0Y2hlc1sxXSArICcpLi4uJyk7XG5cdFx0XHR0aGlzLiRlbC5hZGRDbGFzcyhtYXRjaGVzWzFdKTtcblx0XHR9O1xuXHR9XG5cdC8vIE1ldGhvZCB0byByZW1vdmUgdGhlIHNwZWNpZmllZCBjbGFzc1xuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eXFwtXFxzKlxcLiguKlteLlxcc10pLykpICYmIG1hdGNoZXNbMV0pIHtcblx0XHRmbiA9IGZ1bmN0aW9uIHJlbW92ZUNsYXNzKCkge1xuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UodGhpcy5pZCArICcgOjogUmVtb3ZpbmcgY2xhc3MgKCcgKyBtYXRjaGVzWzFdICsgJykuLi4nKTtcblx0XHRcdHRoaXMuJGVsLnJlbW92ZUNsYXNzKG1hdGNoZXNbMV0pO1xuXHRcdH07XG5cdH1cblx0Ly8gTWV0aG9kIHRvIHRvZ2dsZSB0aGUgc3BlY2lmaWVkIGNsYXNzXG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL15cXCFcXHMqXFwuKC4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHRcdGZuID0gZnVuY3Rpb24gdG9nZ2xlQ2xhc3MoKSB7XG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZSh0aGlzLmlkICsgJyA6OiBUb2dnbGluZyBjbGFzcyAoJyArIG1hdGNoZXNbMV0gKyAnKS4uLicpO1xuXHRcdFx0dGhpcy4kZWwudG9nZ2xlQ2xhc3MobWF0Y2hlc1sxXSk7XG5cdFx0fTtcblx0fVxuXG5cdC8vIFRPRE86XHRhbGxvdyBkZXNjZW5kYW50cyB0byBiZSBjb250cm9sbGVkIHZpYSBzaG9ydGhhbmRcblx0Ly9cdFx0XHRlLmcuIDogJ2xpLnJvdyAtLmhpZ2hsaWdodGVkJ1xuXHQvL1x0XHRcdHdvdWxkIHJlbW92ZSB0aGUgYGhpZ2hsaWdodGVkYCBjbGFzcyBmcm9tIHRoaXMuJCgnbGkucm93JylcblxuXG5cdC8vIElmIHNob3J0LWhhbmQgbWF0Y2hlZCwgcmV0dXJuIHRoZSBkZXJlZmVyZW5jZWQgZnVuY3Rpb25cblx0aWYgKGZuKSB7XG5cblx0XHRGUkFNRVdPUksudmVyYm9zZSgnSW50ZXJwcmV0aW5nIG1lYW5pbmcgZnJvbSBzaG9ydGhhbmQgOjogYCcgKyB2YWx1ZSArICdgLi4uJyk7XG5cblx0XHQvLyBDdXJyeSB0aGUgcmVzdWx0IGZ1bmN0aW9uIHdpdGggYW55IHN1ZmZpeCBtYXRjaGVzXG5cdFx0dmFyIGN1cnJpZWRGbiA9IGZuO1xuXG5cdFx0Ly8gVHJhaWxpbmcgYC5gIGluZGljYXRlcyBhbiBlLnN0b3BQcm9wYWdhdGlvbigpXG5cdFx0aWYgKHZhbHVlLm1hdGNoKC9cXC5cXHMqJC8pKSB7XG5cdFx0XHRjdXJyaWVkRm4gPSBmdW5jdGlvbiBhbmRTdG9wUHJvcGFnYXRpb24oZSkge1xuXG5cdFx0XHRcdC8vIEJpbmQgKHNvIGl0IGluaGVyaXRzIGNvbXBvbmVudCBjb250ZXh0KSBhbmQgY2FsbCBpbnRlcmlvciBmdW5jdGlvblxuXHRcdFx0XHRmbi5hcHBseSh0aGlzKTtcblxuXHRcdFx0XHQvLyB0aGVuIGltbWVkaWF0ZWx5IHN0b3AgZXZlbnQgYnViYmxpbmcvcHJvcGFnYXRpb25cblx0XHRcdFx0aWYgKGUgJiYgZS5zdG9wUHJvcGFnYXRpb24pIHtcblx0XHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdEZSQU1FV09SSy53YXJuKFxuXHRcdFx0XHRcdFx0dGhpcy5pZCArICcgOjogVHJhaWxpbmcgYC5gIHNob3J0aGFuZCB3YXMgdXNlZCB0byBpbnZva2UgYW4gJyArXG5cdFx0XHRcdFx0XHQnZS5zdG9wUHJvcGFnYXRpb24oKSwgYnV0IFwiJyArIHZhbHVlICsgJ1wiIHdhcyBub3QgdHJpZ2dlcmVkIGJ5IGEgRE9NIGV2ZW50IVxcbicgK1xuXHRcdFx0XHRcdFx0J1Byb2JhYmx5IGJlc3QgdG8gZG91YmxlLWNoZWNrIHRoaXMgd2FzIHdoYXQgeW91IG1lYW50IHRvIGRvLicpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiBjdXJyaWVkRm47XG5cdH1cblxuXG5cdC8vIE90aGVyd2lzZSwgaWYgbm8gc2hvcnQtaGFuZCBtYXRjaGVkLCBwYXNzIHRoZSBvcmlnaW5hbCB2YWx1ZVxuXHQvLyBzdHJhaWdodCB0aHJvdWdoXG5cdHJldHVybiB2YWx1ZTtcbn07XG4iLCIvKipcbiAqIFV0aWxpdHkgZnVuY3Rpb25zIHRoYXQgYXJlIHVzZWQgdGhyb3VnaG91dCB0aGUgY29yZS5cbiAqL1xuXG52YXIgVXRpbHMgPSB7XG5cblx0LyoqXG5cdCAqIEdyYWJzIHRoZSBpZCB4b3IgZGF0YS1pZCBmcm9tIGFuIEhUTUwgZWxlbWVudC5cblx0ICpcblx0ICogQHBhcmFtICB7RE9NRWxlbWVudH0gZWwgICAgW0VsZW1lbnQgd2hlcmUgd2UgYXJlIGxvb2tpbmcgZm9yIHRoZSBgaWRgIG9yIGBkYXRhLWlkYCBhdHRyXVxuXHQgKiBAcGFyYW0gIHtCb29sZWFufSByZXF1aXJlZCBbRGV0ZXJtaW5lcyBpZiBpdCBpcyByZXF1aXJlZCB0byBmaW5kIGFuIGBpZGAgb3IgYGRhdGEtaWRgIGF0dHJdXG5cdCAqXG5cdCAqIEByZXR1cm4ge1N0cmluZ30gICAgICAgICAgXHRbSWRlbnRpZmljYXRpb24gc3RyaW5nIHRoYXQgd2FzIGZvdW5kXVxuXHQgKi9cblx0ZWwyaWQ6IGZ1bmN0aW9uKGVsLCByZXF1aXJlZCkge1xuXG5cdFx0dmFyIGlkID0gJChlbCkuYXR0cignaWQnKTtcblx0XHR2YXIgZGF0YUlkID0gJChlbCkuYXR0cignZGF0YS1pZCcpO1xuXHRcdHZhciBjb250ZW50c0lkID0gJChlbCkuYXR0cignY29udGVudHMnKTtcblxuXHRcdGlmIChpZCAmJiBkYXRhSWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihpZCArICcgOjogQ2Fubm90IHNldCBib3RoIGBpZGAgYW5kIGBkYXRhLWlkYCEgIFBsZWFzZSB1c2Ugb25lIG9yIHRoZSBvdGhlci4gIChkYXRhLWlkIGlzIHNhZmVzdCknKTtcblx0XHR9XG5cdFx0aWYgKHJlcXVpcmVkICYmICFpZCAmJiAhZGF0YUlkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIGlkIHNwZWNpZmllZCBpbiBlbGVtZW50IHdoZXJlIGl0IGlzIHJlcXVpcmVkOlxcbicgKyBlbCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGlkIHx8IGRhdGFJZCB8fCBjb250ZW50c0lkO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBNYXAgYW4gb2JqZWN0J3MgdmFsdWVzLCBhbmQgcmV0dXJuIGEgdmFsaWQgb2JqZWN0ICh0aGlzIGZ1bmN0aW9uIGlzIGhhbmR5IGJlY2F1c2Vcblx0ICogdW5kZXJzY29yZS5tYXAoKSByZXR1cm5zIGEgbGlzdCwgbm90IGFuIG9iamVjdC4pXG5cdCAqXG5cdCAqIEBwYXJhbSAge09iamVjdH0gb2JqICAgICAgICAgXHRbT2plY3Qgd2hvcyB2YWx1ZXMgeW91IHdhbnQgdG8gbWFwXVxuXHQgKiBAcGFyYW0gIHtGdW5jdGlvbn0gdHJhbnNmb3JtRm4gW0Z1bmN0aW9uIHRvIHRyYW5zZm9ybSBlYWNoIG9iamVjdCB2YWx1ZSBieV1cblx0ICpcblx0ICogQHJldHVybiB7T2JqZWN0fSAgICAgICAgICAgICBcdFtOZXcgb2JqZWN0IHdpdGggdGhlIHZhbHVlcyBtYXBwZWRdXG5cdCAqL1xuXHRvYmpNYXA6IGZ1bmN0aW9uIG9iak1hcChvYmosIHRyYW5zZm9ybUZuKSB7XG5cdFx0cmV0dXJuIF8ub2JqZWN0KF8ua2V5cyhvYmopLCBfLm1hcChvYmosIHRyYW5zZm9ybUZuKSk7XG5cdH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gVXRpbHM7Il19
;