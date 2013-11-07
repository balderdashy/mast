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

},{"../utils/DOM":26,"./bindEvents":1,"./helpers":3}],8:[function(require,module,exports){
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
		logLevel: 'warn',
		frameworkId: 'Mast',
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

},{"../utils/events":27,"../utils/shorthand":28,"../utils/utils":29}],15:[function(require,module,exports){
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

},{"../utils/utils":29}],17:[function(require,module,exports){
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

},{"../define/buildDefinition":9,"../logger/index":12,"../router/index":25,"./buildPrototype":14,"./collectRegions":15,"./collectTemplates":16}],18:[function(require,module,exports){
/**
 * region.append( componentId, [properties] )
 *
 * Calls insert() at last position
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
 * @param  {string} component  The id name of the componet that you want to attach.
 * @param  {Object} properties Properties that the attached component will be initalized with.
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

},{"../utils/utils":29}],22:[function(require,module,exports){
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

},{"./append":18,"./attach":19,"./empty":20,"./fromElement":21,"./insert":23,"./remove":24}],23:[function(require,module,exports){
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

},{}],25:[function(require,module,exports){
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

},{}],26:[function(require,module,exports){
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

},{"./events":27}],27:[function(require,module,exports){
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

},{"./utils.js":29}],28:[function(require,module,exports){
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

},{}],29:[function(require,module,exports){
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
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9jb21wb25lbnQvYmluZEV2ZW50cy5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL2NvbXBvbmVudC9jbG9zZS5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL2NvbXBvbmVudC9oZWxwZXJzLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvY29tcG9uZW50L2luZGV4LmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvY29tcG9uZW50L2xpZmVjeWNsZUV2ZW50cy5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL2NvbXBvbmVudC9saWZlY3ljbGVIb29rcy5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL2NvbXBvbmVudC9yZW5kZXIuanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9jb21wb25lbnQvdmFsaWRhdGVEZWZpbml0aW9uLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvZGVmaW5lL2J1aWxkRGVmaW5pdGlvbi5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL2RlZmluZS9pbmRleC5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL2luZGV4LmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvbG9nZ2VyL2luZGV4LmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvbG9nZ2VyL3NldHVwLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvcmFpc2UvYnVpbGRQcm90b3R5cGUuanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9yYWlzZS9jb2xsZWN0UmVnaW9ucy5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL3JhaXNlL2NvbGxlY3RUZW1wbGF0ZXMuanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9yYWlzZS9pbmRleC5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL3JlZ2lvbi9hcHBlbmQuanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9yZWdpb24vYXR0YWNoLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvcmVnaW9uL2VtcHR5LmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvcmVnaW9uL2Zyb21FbGVtZW50LmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvcmVnaW9uL2luZGV4LmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvcmVnaW9uL2luc2VydC5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL3JlZ2lvbi9yZW1vdmUuanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9yb3V0ZXIvaW5kZXguanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy91dGlscy9ET00uanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy91dGlscy9ldmVudHMuanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy91dGlscy9zaG9ydGhhbmQuanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy91dGlscy91dGlscy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2SEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNYQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDYkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9KQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEJpbmQgY29sbGVjdGlvbiBldmVudHMgdG8gbGlmZWN5Y2xlIGV2ZW50IGhhbmRsZXJzXG4gKi9cbmV4cG9ydHMuY29sbGVjdGlvbkV2ZW50cyA9IGZ1bmN0aW9uKCkge1xuXHQvLyBCaW5kIHRvIGNvbGxlY3Rpb24gZXZlbnRzIGlmIG9uZSB3YXMgcGFzc2VkIGluXG5cdGlmICh0aGlzLmNvbGxlY3Rpb24pIHtcblxuXHRcdC8vIExpc3RlbiB0byBldmVudHNcblx0XHR0aGlzLmxpc3RlblRvKHRoaXMuY29sbGVjdGlvbiwgJ2FkZCcsIHRoaXMuYWZ0ZXJBZGQpO1xuXHRcdHRoaXMubGlzdGVuVG8odGhpcy5jb2xsZWN0aW9uLCAncmVtb3ZlJywgdGhpcy5hZnRlclJlbW92ZSk7XG5cdFx0dGhpcy5saXN0ZW5Ubyh0aGlzLmNvbGxlY3Rpb24sICdyZXNldCcsIHRoaXMuYWZ0ZXJSZXNldCk7XG5cdH1cbn07XG5cbi8qKlxuICogQmluZCBtb2RlbCBldmVudHMgdG8gbGlmZWN5Y2xlIGV2ZW50IGhhbmRsZXJzIGFuZCBhbHNvIGFsbG93cyBmb3IgaGFuZGxlcnMgdG8gZmlyZVxuICogb24gY2VydGFpbiBtb2RlbCBhdHRyaWJ1dGUgY2hhbmdlcy5cbiAqL1xuZXhwb3J0cy5tb2RlbEV2ZW50cyA9IGZ1bmN0aW9uKCkge1xuXHRpZiAodGhpcy5tb2RlbCkge1xuXG5cdFx0Ly8gTGlzdGVuIGZvciBhbnkgYXR0cmlidXRlIGNoYW5nZXNcblx0XHQvLyBlLmcuXG5cdFx0Ly8gLmFmdGVyQ2hhbmdlKG1vZGVsLCBvcHRpb25zKVxuXHRcdC8vXG5cdFx0dGhpcy5saXN0ZW5Ubyh0aGlzLm1vZGVsLCAnY2hhbmdlJywgZnVuY3Rpb24gbW9kZWxDaGFuZ2VkIChtb2RlbCwgb3B0aW9ucykge1xuXHRcdFx0aWYgKF8uaXNGdW5jdGlvbih0aGlzLmFmdGVyQ2hhbmdlKSkge1xuXHRcdFx0XHR0aGlzLmFmdGVyQ2hhbmdlKG1vZGVsLCBvcHRpb25zKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIExpc3RlbiBmb3Igc3BlY2lmaWMgYXR0cmlidXRlIGNoYW5nZXNcblx0XHQvLyBlLmcuXG5cdFx0Ly8gLmFmdGVyQ2hhbmdlLmNvbG9yKG1vZGVsLCB2YWx1ZSwgb3B0aW9ucylcblx0XHQvL1xuXHRcdGlmIChfLmlzT2JqZWN0KHRoaXMuYWZ0ZXJDaGFuZ2UpKSB7XG5cdFx0XHRfLmVhY2godGhpcy5hZnRlckNoYW5nZSwgZnVuY3Rpb24gKGhhbmRsZXIsIGF0dHJOYW1lKSB7XG5cblx0XHRcdFx0Ly8gQ2FsbCBoYW5kbGVyIHdpdGggbmV3VmFsIHRvIGtlZXAgYXJndW1lbnRzIHN0cmFpZ2h0Zm9yd2FyZFxuXHRcdFx0XHR0aGlzLmxpc3RlblRvKHRoaXMubW9kZWwsICdjaGFuZ2U6JyArIGF0dHJOYW1lLCBmdW5jdGlvbiBhdHRyQ2hhbmdlZCAobW9kZWwsIG5ld1ZhbCkge1xuXHRcdFx0XHRcdGhhbmRsZXIuY2FsbChzZWxmLCBuZXdWYWwpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0fSwgdGhpcyk7XG5cdFx0fVxuXHR9XG59O1xuXG4vKipcbiAqIExpc3RlbnMgZm9yIGFuZCBydW5zIGhhbmRsZXJzIG9uIGdsb2JhbCBldmVudHMgdGhhdCBhcmUgbGlzdGVuZWQgZm9yIG9uIGEgY29tcG9uZW50LlxuICovXG5leHBvcnRzLmdsb2JhbFRyaWdnZXJzID0gZnVuY3Rpb24oKSB7XG5cblx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdHRoaXMubGlzdGVuVG8oRlJBTUVXT1JLLCAnYWxsJywgZnVuY3Rpb24gKGVSb3V0ZSkge1xuXG5cdFx0Ly8gVHJpbSBvZmYgYWxsIGJ1dCB0aGUgZmlyc3QgYXJndW1lbnQgdG8gcGFzcyB0aHJvdWdoIHRvIGhhbmRsZXJcblx0XHR2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG5cdFx0YXJncy5zaGlmdCgpO1xuXG5cdFx0Ly8gSXRlcmF0ZSB0aHJvdWdoIGVhY2ggc3Vic2NyaXB0aW9uIG9uIHRoaXMgY29tcG9uZW50XG5cdFx0Ly8gYW5kIGxpc3RlbiBmb3IgdGhlIHNwZWNpZmllZCBnbG9iYWwgZXZlbnRzXG5cdFx0Xy5lYWNoKHNlbGYuc3Vic2NyaXB0aW9ucywgZnVuY3Rpb24oaGFuZGxlciwgbWF0Y2hQYXR0ZXJuKSB7XG5cblx0XHRcdC8vIEdyYWIgcmVnZXggYW5kIHBhcmFtIHBhcnNpbmcgbG9naWMgZnJvbSBCYWNrYm9uZSBjb3JlXG5cdFx0XHR2YXIgZXh0cmFjdFBhcmFtcyA9IEJhY2tib25lLlJvdXRlci5wcm90b3R5cGUuX2V4dHJhY3RQYXJhbWV0ZXJzLFxuXHRcdFx0XHRjYWxjdWxhdGVSZWdleCA9IEJhY2tib25lLlJvdXRlci5wcm90b3R5cGUuX3JvdXRlVG9SZWdFeHA7XG5cblx0XHRcdC8vIFRyaW0gdHJhaWxpbmdcblx0XHRcdG1hdGNoUGF0dGVybiA9IG1hdGNoUGF0dGVybi5yZXBsYWNlKC9cXC8qJC9nLCAnJyk7XG5cdFx0XHQvLyBhbmQgZXIgc29ydCBvZi4uIGxlYWRpbmcuLiBzbGFzaGVzXG5cdFx0XHRtYXRjaFBhdHRlcm4gPSBtYXRjaFBhdHRlcm4ucmVwbGFjZSgvXihbI34lXSlcXC8qL2csICckMScpO1xuXHRcdFx0Ly8gVE9ETzogb3B0aW1pemF0aW9uLSB0aGlzIHJlYWxseSBvbmx5IGhhcyB0byBiZSBkb25lIG9uY2UsIG9uIHJhaXNlKCksIHdlIHNob3VsZCBkbyB0aGF0XG5cblxuXHRcdFx0Ly8gQ29tZSB1cCB3aXRoIHJlZ2V4IGZvciB0aGlzIG1hdGNoUGF0dGVyblxuXHRcdFx0dmFyIHJlZ2V4ID0gY2FsY3VsYXRlUmVnZXgobWF0Y2hQYXR0ZXJuKTtcblxuXHRcdFx0Ly8gSWYgdGhpcyBtYXRjaFBhdGVybiBpcyB0aGlzIGlzIG5vdCBhIG1hdGNoIGZvciB0aGUgZXZlbnQsXG5cdFx0XHQvLyBgY29udGludWVgIGl0IGFsb25nIHRvIGl0IGNhbiB0cnkgdGhlIG5leHQgbWF0Y2hQYXR0ZXJuXG5cdFx0XHRpZiAoIWVSb3V0ZS5tYXRjaChyZWdleCkpIHJldHVybjtcblxuXHRcdFx0Ly8gUGFyc2UgcGFyYW1ldGVycyBmb3IgdXNlIGFzIGFyZ3MgdG8gdGhlIGhhbmRsZXJcblx0XHRcdC8vIChvciBhbiBlbXB0eSBsaXN0IGlmIG5vbmUgZXhpc3QpXG5cdFx0XHR2YXIgcGFyYW1zID0gZXh0cmFjdFBhcmFtcyhyZWdleCwgZVJvdXRlKTtcblxuXHRcdFx0Ly8gSGFuZGxlIHN0cmluZyByZWRpcmVjdHMgdG8gZnVuY3Rpb24gbmFtZXNcblx0XHRcdGlmICghXy5pc0Z1bmN0aW9uKGhhbmRsZXIpKSB7XG5cdFx0XHRcdGhhbmRsZXIgPSBzZWxmW2hhbmRsZXJdO1xuXG5cdFx0XHRcdGlmICghaGFuZGxlcikge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IHRyaWdnZXIgc3Vic2NyaXB0aW9uIGJlY2F1c2Ugb2YgdW5rbm93biBoYW5kbGVyOiAnICsgaGFuZGxlcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gQmluZCBjb250ZXh0IGFuZCBhcmd1bWVudHMgdG8gc3Vic2NyaXB0aW9uIGhhbmRsZXJcblx0XHRcdGhhbmRsZXIuYXBwbHkoc2VsZiwgXy51bmlvbihhcmdzLCBwYXJhbXMpKTtcblxuXHRcdH0pO1xuXHR9KTtcbn07XG4iLCIvKipcbiAqIFNhZmVseSB6YXAgZXZlcnkgdHJhY2UgYWJvdXQgdGhpcyBjb21wb25lbnQgZnJvbSBtZW1vcnkuXG4gKi9cblxudmFyIGhlbHBlcnMgPSByZXF1aXJlKCcuL2hlbHBlcnMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjbG9zZSgpIHtcblxuXHRGUkFNRVdPUksuZGVidWcoJ0Nsb3NlZCAnICsgdGhpcy5pZCArICcgY29tcG9uZW50LicpO1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0Ly8gQ2FuY2VsIGN1cnJlbnQgcmVuZGVyIGFuZCBjbG9zZSBqb2JzLCBpZiB0aGV5J3JlIHJ1bm5pbmdcblx0aWYgKHRoaXMuX3JlbmRlcmluZykge1xuXHRcdHNlbGYuX3JlbmRlcmluZ0NhbmNlbGVkID0gdHJ1ZTtcblx0XHR0aGlzLmNhbmNlbFJlbmRlcigpO1xuXHRcdHNlbGYuX3JlbmRlcmluZyA9IGZhbHNlO1xuXHR9XG5cdGlmICh0aGlzLl9jbG9zaW5nKSB7XG5cdFx0dGhpcy5jYW5jZWxDbG9zZSgpO1xuXHRcdHNlbGYuX2Nsb3NpbmcgPSBmYWxzZTtcblx0fVxuXG5cdC8vIExvY2sgYWNjZXNzIHRvIGNsb3NlKClcblx0dGhpcy5fY2xvc2luZyA9IHRydWU7XG5cblx0dGhpcy5iZWZvcmVDbG9zZShmdW5jdGlvbiAoKSB7XG5cblx0XHQvLyA+IE5PVEU6IGB0aGlzLl9jbG9zaW5nPWZhbHNlYCBjYW4gYW5kIHByb2JhYmx5IHNob3VsZCBiZSByZW1vdmVkLFxuXHRcdC8vID4gc2luY2UgbXV0ZXggaXMgdW5uZWNlc3Nhcnkgbm93IHRoYXQgdGhlIGNvbXBvbmVudCBpcyB1cCBmb3IgZ2FyYmFnZSBjb2xsZWN0aW9uXG5cdFx0Ly8gPiBXYWl0aW5nIHRvIGRvIHRoaXMgdW50aWwgaXQgY2FuIGJlIHRlc3RlZCBmdXJ0aGVyXG5cblx0XHQvLyBVbmxvY2sgY2xvc2UoKVxuXHRcdHNlbGYuX2Nsb3NpbmcgPSBmYWxzZTtcblxuXHRcdC8vIFN0b3AgbGlzdGVuaW5nIHRvIGFsbCBnbG9iYWwgdHJpZ2dlcnMgKCV8IylcblxuXHRcdC8vIENsb3NlIGFsbCBjaGlsZCBjb21wb25lbnRzXG5cblx0XHRoZWxwZXJzLmVtcHR5QWxsUmVnaW9ucy5jYWxsKHNlbGYpO1xuXG5cdFx0Ly8gQ2FsbCBuYXRpdmUgYEJhY2tib25lLlZpZXcucHJvdG90eXBlLnJlbW92ZSgpYFxuXHRcdC8vIHRvIHVuZGVsZWdhdGUgZXZlbnRzLCBldGMuXG5cdFx0c2VsZi5yZW1vdmUoKTtcblxuXHR9KTtcbn07XG4iLCIvKipcbiAqIEhlbHBlciBmdW5jdGlvbnMgdXNlZCBieSBjb21wb25lbnRzL1xuICovXG5cbnZhciBoZWxwZXJzID0gbW9kdWxlLmV4cG9ydHMgPSB7XG5cblx0LyoqXG4gKiBJZiBhbnkgcmVnaW9ucyBleGlzdCBpbiB0aGlzIGNvbXBvbmVudCxcbiAqIGVtcHR5IHRoZW0sIGFuZCB0aGVuIGRlbGV0ZSB0aGVtXG4gKi9cblx0ZW1wdHlBbGxSZWdpb25zOiBmdW5jdGlvbigpIHtcblx0XHRfLmVhY2godGhpcy5yZWdpb25zLCBmdW5jdGlvbiAocmVnaW9uLCBrZXkpIHtcblx0XHRcdHJlZ2lvbi5lbXB0eSgpO1xuXHRcdFx0ZGVsZXRlIHRoaXMucmVnaW9uc1trZXldO1xuXHRcdH0sIHRoaXMpO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBJbnN0YW50aWF0ZSByZWdpb24gY29tcG9uZW50cyBhbmQgYXBwZW5kIGFueSBkZWZhdWx0XG5cdCAqIHRlbXBsYXRlcy9jb21wb25lbnRzIHRvIHRoZSBET01cblx0ICovXG5cdHJlbmRlclJlZ2lvbnM6IGZ1bmN0aW9uKCkge1xuXHRcdHZhciBzZWxmID0gdGhpcztcblxuXHRcdGhlbHBlcnMuZW1wdHlBbGxSZWdpb25zKCk7XG5cblx0XHQvLyBEZXRlY3QgY2hpbGQgcmVnaW9ucyBpbiB0ZW1wbGF0ZVxuXHRcdHZhciAkcmVnaW9ucyA9IHRoaXMuJCgncmVnaW9uLCBbZGF0YS1yZWdpb25dJyk7XG5cdFx0JHJlZ2lvbnMuZWFjaChmdW5jdGlvbiAoaSwgZWwpIHtcblxuXHRcdFx0Ly8gUHJvdmlkZSBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eSBmb3Jcblx0XHRcdC8vIGBkZWZhdWx0YCwgYGNvbnRlbnRzYCBhbmQgYHRlbXBsYXRlYCBub3RhdGlvblxuXHRcdFx0dmFyIGNvbXBvbmVudElkID0gJChlbCkuYXR0cignZGVmYXVsdCcpO1xuXHRcdFx0Y29tcG9uZW50SWQgPSBjb21wb25lbnRJZCB8fCAkKGVsKS5hdHRyKCdjb250ZW50cycpO1xuXHRcdFx0Y29tcG9uZW50SWQgPSBjb21wb25lbnRJZCB8fCAkKGVsKS5hdHRyKCd0ZW1wbGF0ZScpO1xuXHRcdFx0JChlbCkuYXR0cignY29udGVudHMnLCBjb21wb25lbnRJZCk7XG5cblx0XHRcdC8vIEdlbmVyYXRlIGEgcmVnaW9uIGluc3RhbmNlIGZyb20gdGhlIGVsZW1lbnRcblx0XHRcdC8vIChtb2RpZnlpbmcgdGhlIERPTSBhcyBuZWNlc3NhcnkpXG5cdFx0XHR2YXIgcmVnaW9uID0gRlJBTUVXT1JLLlJlZ2lvbi5mcm9tRWxlbWVudChlbCwgc2VsZik7XG5cblx0XHRcdC8vIElmIHJlZ2lvbiBoYXMgbm8gaWQsIGdlbmVyYXRlIGEgdW5pcXVlIHJlZ2lvbiBpZCB3L2kgdGhpcyBjb21wb25lbnRcblx0XHRcdC8vIHRoYXQgaXMgdW5saWtlbHkgdG8gY29sbGlkZSB3aXRoIG15IG90aGVyIG5hbWVkIHJlZ2lvbnNcblx0XHRcdGlmICghcmVnaW9uLmlkKSB7XG5cdFx0XHRcdHJlZ2lvbi5pZCA9ICcnK1xuXHRcdFx0XHRcdEZSQU1FV09SSy5vcHRpb25zLmZyYW1ld29ya0lkICtcblx0XHRcdFx0XHQnX19hbm9ueW1vdXNfcmVnaW9uX18nICtcblx0XHRcdFx0XHRzZWxmLmFub255bW91c1JlZ2lvbkNvdW50ZXI7XG5cblx0XHRcdFx0Ly8gSW5jcmVtZW50IGNvdW50ZXIgZm9yIG5leHQgdGltZVxuXHRcdFx0XHRzZWxmLmFub255bW91c1JlZ2lvbkNvdW50ZXIrKztcblx0XHRcdH1cblxuXHRcdFx0Ly8gS2VlcCB0cmFjayBvZiByZWdpb25zLCBzaW5jZSB3ZSBhcmUgdGhlIHBhcmVudCBjb21wb25lbnRcblx0XHRcdHNlbGYucmVnaW9uc1tyZWdpb24uaWRdID0gcmVnaW9uO1xuXG5cdFx0XHQvLyBBcyBsb25nIGFzIHRoZXJlIGFyZSBubyBjb2xsaXNpb25zLFxuXHRcdFx0Ly8gcHJvdmlkZSBhIGZyaWVuZGx5IHJlZmVyZW5jZSB0byB0aGUgcmVnaW9uIG9uIHRoZSB0b3AgbGV2ZWwgb2YgdGhlIGNvbGxlY3Rpb25cblx0XHRcdGlmICghc2VsZltyZWdpb24uaWRdKSB7XG5cdFx0XHRcdHNlbGZbcmVnaW9uLmlkXSA9IHJlZ2lvbjtcblx0XHRcdH1cblx0XHR9KTtcblx0fSxcblxuXHQvKipcblx0ICogQ29udmVydCB0ZW1wbGF0ZSBIVE1MIGFuZCBkYXRhIGludG8gYSBjb21waWxlZCAkdGVtcGxhdGVcblx0ICovXG5cdGNvbXBpbGVUZW1wbGF0ZTogZnVuY3Rpb24oKSB7XG5cblx0XHQvLyBDcmVhdGUgdGVtcGxhdGUgZGF0YSBjb250ZXh0IGJ5IHByb3ZpZGluZyBhY2Nlc3MgdG8gdGhlIGdsb2JhbCBEYXRhIG9iamVjdCxcblx0XHQvLyBBbHNvIGZvbGQgaW4gdGhlIG1vZGVsIGFzc29jaWF0ZWQgd2l0aCB0aGlzIGNvbXBvbmVudCwgaWYgdGhlcmUgaXMgb25lXG5cdFx0dmFyIHRlbXBsYXRlQ29udGV4dCA9IF8uZXh0ZW5kKHtcblxuXHRcdFx0Ly8gQWxsb3dzIHlvdSB0byBnZXQgYSBob2xkIG9mIGRhdGEsXG5cdFx0XHQvLyBidXQgdXNlIGEgZGVmYXVsdCB2YWx1ZSBpZiBpdCBkb2Vzbid0IGV4aXN0XG5cdFx0XHRnZXQ6IGZ1bmN0aW9uIChrZXksIGRlZmF1bHRWYWwpIHtcblx0XHRcdFx0dmFyIHZhbCA9IHRlbXBsYXRlQ29udGV4dFtrZXldO1xuXHRcdFx0XHRpZiAodHlwZW9mIHZhbCA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdFx0XHR2YWwgPSBkZWZhdWx0VmFsO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB2YWw7XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdC8vIEFsbCBGUkFNRVdPUksuZGF0YSBpcyBhdmFpbGFibGUgaW4gZXZlcnkgdGVtcGxhdGVcblx0XHRGUkFNRVdPUksuZGF0YSk7XG5cblx0XHQvLyBJZiBhIG1vZGVsIGlzIHByb3ZpZGVkIGZvciB0aGlzIGNvbXBvbmVudCwgbWFrZSBpdCBhdmFpbGFibGUgaW4gdGhpcyB0ZW1wbGF0ZVxuXHRcdGlmICh0aGlzLm1vZGVsKSB7XG5cdFx0XHRfLmV4dGVuZCh0ZW1wbGF0ZUNvbnRleHQsIHRoaXMubW9kZWwuYXR0cmlidXRlcyk7XG5cdFx0fVxuXG5cdFx0Ly8gVGVtcGxhdGUgdGhlIEhUTUwgd2l0aCB0aGUgZGF0YVxuXHRcdHZhciBodG1sO1xuXHRcdHRyeSB7XG5cdFx0XHQvLyBBY2NlcHQgcHJlY29tcGlsZWQgdGVtcGxhdGVzXG5cdFx0XHRpZiAoXy5pc0Z1bmN0aW9uKHRoaXMudGVtcGxhdGUpKSB7XG5cdFx0XHRcdGh0bWwgPSB0aGlzLnRlbXBsYXRlKHRlbXBsYXRlQ29udGV4dCk7XG5cdFx0XHR9XG5cdFx0XHQvLyBPciByYXcgc3RyaW5nc1xuXHRcdFx0ZWxzZSBodG1sID0gXy50ZW1wbGF0ZSh0aGlzLnRlbXBsYXRlLCB0ZW1wbGF0ZUNvbnRleHQpO1xuXHRcdH1cblx0XHRjYXRjaCAoZSkge1xuXHRcdFx0dmFyIHN0ciA9IGUsXG5cdFx0XHRcdHN0YWNrID0gJyc7XG5cblx0XHRcdGlmIChlIGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdFx0c3RyID0gIGUudG9TdHJpbmcoKTtcblx0XHRcdFx0c3RhY2sgPSBlLnN0YWNrO1xuXHRcdFx0fVxuXG5cdFx0XHRGUkFNRVdPUksuZXJyb3IodGhpcy5pZCArICcgOjogcmVuZGVyKCkgZXJyb3IgaW4gdGVtcGxhdGUgOlxcbicgKyBzdHIgKyAnXFxuVGVtcGxhdGUgOjogJyArIGh0bWwgKyAnXFxuJyArIHN0YWNrKTtcblx0XHRcdGh0bWwgPSB0aGlzLnRlbXBsYXRlO1xuXHRcdH1cblxuXHRcdHJldHVybiBodG1sO1xuXHR9XG5cbn07XG4iLCIvKipcbiAqIENvbXBvbmVudCBpcyBhbiBleHRlbmRlZCBgQmFja2JvbmUuVmlld2AuIEl0IGFkZCBmZWF0dXJlcyBzdWNoIGFzIGF1dG9tYXRpYyBldmVudCBiaW5kaW5nLFxuICogcmVuZGVyaW5nLCBsaWZlY3ljbGUgaG9va3MgYW5kIGV2ZW50cywgYW5kIG1vcmUuXG4gKi9cblxudmFyIGxpZmVjeWNsZUhvb2tzICAgICA9IHJlcXVpcmUoJy4vbGlmZWN5Y2xlSG9va3MnKSxcblx0XHRsaWZlY3ljbGVFdmVudHMgICAgPSByZXF1aXJlKCcuL2xpZmVjeWNsZUV2ZW50cycpLFxuXHRcdGJpbmRFdmVudHMgICAgICAgICA9IHJlcXVpcmUoJy4vYmluZEV2ZW50cycpLFxuXHRcdGNsb3NlICAgICAgICAgICAgICA9IHJlcXVpcmUoJy4vY2xvc2UnKSxcblx0XHRyZW5kZXIgICAgICAgICAgICAgPSByZXF1aXJlKCcuL3JlbmRlcicpLFxuXHRcdHZhbGlkYXRlRGVmaW5pdGlvbiA9IHJlcXVpcmUoJy4vdmFsaWRhdGVEZWZpbml0aW9uJyk7XG5cbkNvbXBvbmVudCA9IG1vZHVsZS5leHBvcnRzID0gQmFja2JvbmUuVmlldy5leHRlbmQoKTtcblxuXG5fLmV4dGVuZChDb21wb25lbnQucHJvdG90eXBlLCB7XG5cblx0Ly8gTGlmZWN5Y2xlIEhvb2tzXG5cdGJlZm9yZVJlbmRlcjogZnVuY3Rpb24oY2IpIHtcblx0XHRsaWZlY3ljbGVIb29rcy5iZWZvcmVSZW5kZXIuY2FsbCh0aGlzLCBjYik7XG5cdH0sXG5cdGJlZm9yZUNsb3NlOiBmdW5jdGlvbihjYikge1xuXHRcdGxpZmVjeWNsZUhvb2tzLmJlZm9yZUNsb3NlLmNhbGwodGhpcywgY2IpO1xuXHR9LFxuXHRhZnRlclJlbmRlcjogZnVuY3Rpb24oKSB7XG5cdFx0bGlmZWN5Y2xlSG9va3MuYWZ0ZXJSZW5kZXIuY2FsbCh0aGlzKTtcblx0fSxcblx0Y2FuY2VsUmVuZGVyOiBmdW5jdGlvbigpIHtcblx0XHRsaWZlY3ljbGVIb29rcy5jYW5jZWxSZW5kZXIuY2FsbCh0aGlzKTtcblx0fSxcblx0Y2FuY2VsQ2xvc2U6IGZ1bmN0aW9uKCkge1xuXHRcdGxpZmVjeWNsZUhvb2tzLmNhbmNlbENsb3NlLmNhbGwodGhpcyk7XG5cdH0sXG5cblx0Ly8gTGlmZWN5Y2xlIEV2ZW50c1xuXHRhZnRlckNoYW5nZTogZnVuY3Rpb24obW9kZWwsIG9wdGlvbnMpIHtcblx0XHRsaWZlY3ljbGVFdmVudHMuYWZ0ZXJDaGFuZ2UuY2FsbCh0aGlzLCBtb2RlbCwgb3B0aW9ucyk7XG5cdH0sXG5cdGFmdGVyQWRkOiBmdW5jdGlvbihtb2RlbCwgY29sbGVjdGlvbiwgb3B0aW9ucykge1xuXHRcdGxpZmVjeWNsZUV2ZW50cy5hZnRlckFkZC5jYWxsKHRoaXMsIG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zKTtcblx0fSxcblx0YWZ0ZXJSZW1vdmU6IGZ1bmN0aW9uKG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zKSB7XG5cdFx0bGlmZWN5Y2xlRXZlbnRzLmFmdGVyUmVtb3ZlLmNhbGwodGhpcywgbW9kZWwsIGNvbGxlY3Rpb24sIG9wdGlvbnMpO1xuXHR9LFxuXHRhZnRlclJlc2V0OiBmdW5jdGlvbihjb2xsZWN0aW9uLCBvcHRpb25zKSB7XG5cdFx0bGlmZWN5Y2xlRXZlbnRzLmFmdGVyUmVzZXQuY2FsbCh0aGlzLCBjb2xsZWN0aW9uLCBvcHRpb25zKTtcblx0fSxcblxuXHQvLyBQcm90b3R5cGUgbWV0aG9kcy5cblx0Y2xvc2U6IGZ1bmN0aW9uKCkge1xuXHRcdGNsb3NlLmNhbGwodGhpcyk7XG5cdH0sXG5cdHJlbmRlcjogZnVuY3Rpb24oYXRJbmRleCkge1xuXHRcdHJlbmRlci5jYWxsKHRoaXMsIGF0SW5kZXgpO1xuXHR9XG59KTtcblxuXG5cblxuQ29tcG9uZW50LnByb3RvdHlwZS5pbml0aWFsaXplID0gZnVuY3Rpb24ocHJvcGVydGllcykge1xuXG5cdHZhciBzZWxmID0gdGhpcztcblxuXHQvLyBLZWVwIHRyYWNrIG9mIGEgY291bnRlciBmb3IgdXNlIGluIGdlbmVyYXRpbmdcblx0Ly8gaWRzIGZvciBhbm9ueW1vdXMgY29tcG9uZW50cy5cblx0dGhpcy5hbm9ueW1vdXNSZWdpb25Db3VudGVyID0gMDtcblxuXHQvLyBEaXNhYmxlIG9yIGlzc3VlIHdhcm5pbmdzIGFib3V0IGNlcnRhaW4gcHJvcGVydGllc1xuXHQvLyBhbmQgbWV0aG9kcyB0byBhdm9pZCBjb25mdXNpb25cblx0cHJvcGVydGllcyA9IHZhbGlkYXRlRGVmaW5pdGlvbihwcm9wZXJ0aWVzKTtcblxuXHQvLyBFeHRlbmQgaW5zdGFuY2Ugdy8gc3BlY2lmaWVkIHByb3BlcnRpZXMgYW5kIG1ldGhvZHNcblx0Xy5leHRlbmQodGhpcywgcHJvcGVydGllcyk7XG5cblx0Ly8gU3RhcnQgd2l0aCBlbXB0eSByZWdpb25zIG9iamVjdFxuXHR0aGlzLnJlZ2lvbnMgPSB7fTtcblxuXHQvLyBFbmNvdXJhZ2UgY2hpbGQgbWV0aG9kcyB0byB1c2UgdGhlIGNvbXBvbmVudCBjb250ZXh0XG5cdF8uYmluZEFsbCh0aGlzKTtcbn07XG4iLCIvLyBGaXJlZCB3aGVuIHRoZSBib3VuZCBtb2RlbCBpcyB1cGRhdGVkIChgdGhpcy5tb2RlbGApXG5leHBvcnRzLmFmdGVyQ2hhbmdlID0gZnVuY3Rpb24gKG1vZGVsLCBvcHRpb25zKSB7fTtcblxuLy8gRmlyZWQgd2hlbiBhIG1vZGVsIGlzIGFkZGVkIHRvIHRoZSBib3VuZCBjb2xsZWN0aW9uIChgdGhpcy5jb2xsZWN0aW9uYClcbmV4cG9ydHMuYWZ0ZXJBZGQgPSBmdW5jdGlvbiAobW9kZWwsIGNvbGxlY3Rpb24sIG9wdGlvbnMpIHt9O1xuXG4vLyBGaXJlZCB3aGVuIGEgbW9kZWwgaXMgcmVtb3ZlZCBmcm9tIHRoZSBib3VuZCBjb2xsZWN0aW9uIChgdGhpcy5jb2xsZWN0aW9uYClcbmV4cG9ydHMuYWZ0ZXJSZW1vdmUgPSBmdW5jdGlvbiAobW9kZWwsIGNvbGxlY3Rpb24sIG9wdGlvbnMpIHt9O1xuXG4vLyBGaXJlZCB3aGVuIHRoZSBib3VuZCBjb2xsZWN0aW9uIGlzIHdpcGVkIChgdGhpcy5jb2xsZWN0aW9uYClcbmV4cG9ydHMuYWZ0ZXJSZXNldCA9IGZ1bmN0aW9uIChjb2xsZWN0aW9uLCBvcHRpb25zKSB7fTtcbiIsIi8vIEZpcmVkIGF1dG9tYXRpY2FsbHkgd2hlbiB0aGUgdmlldyBpcyBpbml0aWFsbHkgY3JlYXRlZFxuLy8gb25seSBmaXJlZCBhZnRlcndhcmRzIGlmIHRoaXMucmVuZGVyKCkgaXMgZXhwbGljaXRseSBjYWxsZWRcbi8vIENhbGxiYWNrIG11c3QgYmUgZmlyZWQhIVxuZXhwb3J0cy5iZWZvcmVSZW5kZXIgPSBmdW5jdGlvbiAoY2IpIHtjYigpO307XG5cbi8vIEZpcmVkIGF1dG9tYXRpY2FsbHkgd2hlbiB0aGUgdmlldyBpcyBpbml0aWFsbHkgY3JlYXRlZFxuLy8gb25seSBmaXJlZCBhZnRlcndhcmRzIGlmIHRoaXMucmVuZGVyKCkgaXMgZXhwbGljaXRseSBjYWxsZWRcbmV4cG9ydHMuYWZ0ZXJSZW5kZXIgPSBmdW5jdGlvbiAoKSB7fTtcblxuLy8gRmlyZWQgYXV0b21hdGljYWxseSB3aGVuIHRoZSB2aWV3IGlzIGNsb3NlZFxuZXhwb3J0cy5iZWZvcmVDbG9zZSA9IGZ1bmN0aW9uIChjYikge2NiKCk7fTtcblxuLy8gRmlyZWQgYmVmb3JlIHJlcmVuZGVyaW5nIG9yIGNsb3NpbmcgYSB2aWV3IHRoYXQgaXMgYWxyZWFkeSB3YWl0aW5nIG9uIGEgbG9ja1xuZXhwb3J0cy5jYW5jZWxSZW5kZXIgPSBmdW5jdGlvbiAoKSB7XG5cdEZSQU1FV09SSy53YXJuKCdjYW5jZWxSZW5kZXIoKSBzaG91bGQgYmUgZGVmaW5lZCBpZiBiZWZvcmVDbG9zZShjYikgb3IgYmVmb3JlUmVuZGVyKGNiKScgK1xuXHRcdFx0XHRcdFx0XHRcdCAnYXJlIGJlaW5nIHVzZWQhJyk7XG59O1xuXG4vLyBGaXJlZCBiZWZvcmUgcmVyZW5kZXJpbmcgb3IgY2xvc2luZyBhIHZpZXcgdGhhdCBpcyBhbHJlYWR5IHdhaXRpbmcgb24gYSBsb2NrXG5leHBvcnRzLmNhbmNlbENsb3NlID0gZnVuY3Rpb24gKCkge1xuXHRGUkFNRVdPUksud2FybignY2FuY2VsQ2xvc2UoKSBzaG91bGQgYmUgZGVmaW5lZCBpZiBiZWZvcmVDbG9zZShjYikgb3IgYmVmb3JlUmVuZGVyKGNiKScgK1xuXHRcdFx0XHRcdFx0XHRcdCAnYXJlIGJlaW5nIHVzZWQhJyk7XG59O1xuIiwiLyoqXG4gKiBSdW4gSFRNTCB0ZW1wbGF0ZSB0aHJvdWdoIGVuZ2luZSBhbmQgYXBwZW5kIHJlc3VsdHMgdG8gb3V0bGV0LiBBbHNvIHJlcmVuZGVyIHJlZ2lvbnMuXG4gKiBJZiBhdEluZGV4IGlzIHNwZWNpZmllZCwgdGhlIGNvbXBvbmVudCBpcyByZW5kZXJlZCBhdCB0aGUgZ2l2ZW4gcG9zaXRpb24gd2l0aGluIGl0c1xuICogb3V0bGV0LiBPdGhlcndpc2UsIHRoZSBsYXN0IHBvc2l0aW9uIGlzIHVzZWQuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IGF0SW5kZXggW1RoZSBpbmRleCBpbiB3aGljaCB0byByZW5kZXIgdGhpcyBlbGVtZW50XVxuICovXG5cbnZhciBET00gPSByZXF1aXJlICgnLi4vdXRpbHMvRE9NJyksXG5cdFx0aGVscGVycyA9IHJlcXVpcmUoJy4vaGVscGVycycpLFxuXHRcdGJpbmRFdmVudHMgPSByZXF1aXJlICgnLi9iaW5kRXZlbnRzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcmVuZGVyKGF0SW5kZXgpIHtcblxuXHRGUkFNRVdPUksuZGVidWcodGhpcy5pZCArICcgOi0tLTogUmVuZGVyaW5nIGNvbXBvbmVudC4uLicpO1xuXG5cdHZhciBzZWxmID0gdGhpcztcblxuXHQvLyBDYW5jZWwgY3VycmVudCByZW5kZXIgYW5kIGNsb3NlIGpvYnMsIGlmIHRoZXkncmUgcnVubmluZ1xuXHRpZiAodGhpcy5fcmVuZGVyaW5nKSB7XG5cdFx0RlJBTUVXT1JLLmRlYnVnKHRoaXMuaWQgKyAnIDo6IHJlbmRlcigpIGNhbmNlbGVkLicpO1xuXHRcdHRoaXMuX3JlbmRlcmluZ0NhbmNlbGVkID0gdHJ1ZTtcblx0XHR0aGlzLmNhbmNlbFJlbmRlcigpO1xuXHRcdHRoaXMuX3JlbmRlcmluZyA9IGZhbHNlO1xuXHR9XG5cdGlmICh0aGlzLl9jbG9zaW5nKSB7XG5cdFx0RlJBTUVXT1JLLmRlYnVnKHRoaXMuaWQgKyAnIDo6IGNsb3NlKCkgY2FuY2VsZWQuJyk7XG5cdFx0dGhpcy5jYW5jZWxDbG9zZSgpO1xuXHRcdHRoaXMuX2Nsb3NpbmcgPSBmYWxzZTtcblx0fVxuXG5cdC8vIExvY2sgYWNjZXNzIHRvIHJlbmRlclxuXHR0aGlzLl9yZW5kZXJpbmcgPSB0cnVlO1xuXG5cdC8vIFRyaWdnZXIgYmVmb3JlUmVuZGVyIG1ldGhvZFxuXHR0aGlzLmJlZm9yZVJlbmRlcihmdW5jdGlvbiAoKSB7XG5cblx0XHQvLyBJZiByZW5kZXJpbmcgd2FzIGNhbmNlbGVkLCBicmVhayBvdXRcblx0XHQvLyBkbyBub3QgcmVuZGVyLCBhbmQgZG8gbm90IGNhbGwgYWZ0ZXJSZW5kZXIoKVxuXHRcdGlmICggc2VsZi5fcmVuZGVyaW5nQ2FuY2VsZWQgKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gLy8gQmluZCB0aGUgZXZlbnRzIG9uIG1vZGVsL2NvbGxlY3Rpb25zIGFuZCBnbG9iYWwgdHJpZ2dlcmVkIGV2ZW50cy5cblx0XHRiaW5kRXZlbnRzLmNvbGxlY3Rpb25FdmVudHMuY2FsbChzZWxmKTtcblx0XHRiaW5kRXZlbnRzLm1vZGVsRXZlbnRzLmNhbGwoc2VsZik7XG5cdFx0YmluZEV2ZW50cy5nbG9iYWxUcmlnZ2Vycy5jYWxsKHNlbGYpO1xuXG5cdFx0Ly8gVW5sb2NrIHJlbmRlcmluZyBtdXRleFxuXHRcdHNlbGYuX3JlbmRlcmluZyA9IGZhbHNlO1xuXG5cdFx0aWYgKCFzZWxmLiRvdXRsZXQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihzZWxmLmlkICsgJyA6OiBUcnlpbmcgdG8gcmVuZGVyKCksIGJ1dCBubyAkb3V0bGV0IHdhcyBkZWZpbmVkIScpO1xuXHRcdH1cblxuXHRcdC8vIFJlZnJlc2ggY29tcGlsZWQgdGVtcGxhdGVcblx0XHR2YXIgaHRtbCA9IGhlbHBlcnMuY29tcGlsZVRlbXBsYXRlLmNhbGwoc2VsZik7XG5cdFx0aWYgKCFodG1sKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IodGhpcy5pZCArICcgOjogVW5hYmxlIHRvIHJlbmRlciBjb21wb25lbnQgYmVjYXVzZSB0ZW1wbGF0ZSBjb21waWxhdGlvbiBkaWQgbm90IHJldHVybiBhbnkgSFRNTC4nKTtcblx0XHR9XG5cblx0XHQvLyBTdHJpcCB0cmFpbGluZyBhbmQgbGVhZGluZyB3aGl0ZXNwYWNlIHRvIGF2b2lkIGZhbHNlbHkgZGlhZ25vc2luZ1xuXHRcdC8vIG11bHRpcGxlIGVsZW1lbnRzLCB3aGVuIG9ubHkgb25lIGFjdHVhbGx5IGV4aXN0c1xuXHRcdC8vICh0aGlzIG1pc2RpYWdub3NpcyB3cmFwcyB0aGUgdGVtcGxhdGUgaW4gYW4gZXh0cmFuZW91cyA8ZGl2Pilcblx0XHRodG1sID0gaHRtbC5yZXBsYWNlKC9eXFxzKi8sICcnKTtcblx0XHRodG1sID0gaHRtbC5yZXBsYWNlKC9cXHMqJC8sICcnKTtcblx0XHRodG1sID0gaHRtbC5yZXBsYWNlKC8oXFxyfFxcbikqLywgJycpO1xuXG5cdFx0Ly8gU3RyaXAgSFRNTCBjb21tZW50cywgdGhlbiBzdHJpcCB3aGl0ZXNwYWNlIGFnYWluXG5cdFx0Ly8gKFRPRE86IG9wdGltaXplIHRoaXMpXG5cdFx0aHRtbCA9IGh0bWwucmVwbGFjZSgvKDwhLS0uKy0tPikqLywgJycpO1xuXHRcdGh0bWwgPSBodG1sLnJlcGxhY2UoL15cXHMqLywgJycpO1xuXHRcdGh0bWwgPSBodG1sLnJlcGxhY2UoL1xccyokLywgJycpO1xuXHRcdGh0bWwgPSBodG1sLnJlcGxhY2UoLyhcXHJ8XFxuKSovLCAnJyk7XG5cblx0XHQvLyBQYXJzZSBhIERPTSBub2RlIG9yIHNlcmllcyBvZiBET00gbm9kZXMgZnJvbSB0aGUgbmV3bHkgdGVtcGxhdGVkIEhUTUxcblx0XHR2YXIgcGFyc2VkTm9kZXMgPSAkLnBhcnNlSFRNTChodG1sKTtcblx0XHR2YXIgZWwgPSBwYXJzZWROb2Rlc1swXTtcblxuXHRcdC8vIElmIG5vIG5vZGVzIHdlcmUgcGFyc2VkLCB0aHJvdyBhbiBlcnJvclxuXHRcdGlmIChwYXJzZWROb2Rlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihzZWxmLmlkICsgJyA6OiByZW5kZXIoKSByYW4gaW50byBhIHByb2JsZW0gcmVuZGVyaW5nIHRoZSB0ZW1wbGF0ZSB3aXRoIEhUTUwgPT4gXFxuJytodG1sKTtcblx0XHR9XG5cblx0XHQvLyBJZiB0aGVyZSBpcyBub3Qgb25lIHNpbmdsZSB3cmFwcGVyIGVsZW1lbnQsXG5cdFx0Ly8gb3IgaWYgdGhlIHJlbmRlcmVkIHRlbXBsYXRlIGNvbnRhaW5zIG9ubHkgYSBzaW5nbGUgdGV4dCBub2RlLFxuXHRcdC8vIChvciBqdXN0IGEgbG9uZSByZWdpb24pXG5cdFx0ZWxzZSBpZiAocGFyc2VkTm9kZXMubGVuZ3RoID4gMSB8fCBwYXJzZWROb2Rlc1swXS5ub2RlVHlwZSA9PT0gMyB8fFxuXHRcdFx0XHRcdFx0ICQocGFyc2VkTm9kZXNbMF0pLmlzKCdyZWdpb24nKSkge1xuXG5cdFx0XHRGUkFNRVdPUksubG9nKHNlbGYuaWQgKyAnIDo6IFdyYXBwaW5nIHRlbXBsYXRlIGluIDxkaXYvPi4uLicsIHBhcnNlZE5vZGVzKTtcblxuXHRcdFx0Ly8gd3JhcCB0aGUgaHRtbCB1cCBpbiBhIGNvbnRhaW5lciA8ZGl2Lz5cblx0XHRcdGVsID0gJCgnPGRpdi8+JykuYXBwZW5kKGh0bWwpO1xuXHRcdFx0ZWwgPSBlbFswXTtcblx0XHR9XG5cblx0XHQvLyBTZXQgQmFja2JvbmUgZWxlbWVudCAoY2FjaGUgYW5kIHJlZGVsZWdhdGUgRE9NIGV2ZW50cylcblx0XHQvLyAoV2lsbCBhbHNvIHVwZGF0ZSBzZWxmLiRlbClcblx0XHRzZWxmLnNldEVsZW1lbnQoZWwpO1xuXHRcdC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG5cblx0XHQvLyBEZXRlY3QgYW5kIHJlbmRlciBhbGwgcmVnaW9ucyBhbmQgdGhlaXIgZGVzY2VuZGVudCBjb21wb25lbnRzIGFuZCByZWdpb25zXG5cdFx0aGVscGVycy5yZW5kZXJSZWdpb25zLmNhbGwoc2VsZik7XG5cblx0XHQvLyBJbnNlcnQgdGhlIGVsZW1lbnQgYXQgdGhlIHByb3BlciBwbGFjZSBhbW9uZ3N0IHRoZSBvdXRsZXQncyBjaGlsZHJlblxuXHRcdHZhciBuZWlnaGJvcnMgPSBzZWxmLiRvdXRsZXQuY2hpbGRyZW4oKTtcblx0XHRpZiAoXy5pc0Zpbml0ZShhdEluZGV4KSAmJiBuZWlnaGJvcnMubGVuZ3RoID4gMCAmJiBuZWlnaGJvcnMubGVuZ3RoID4gYXRJbmRleCkge1xuXHRcdFx0bmVpZ2hib3JzLmVxKGF0SW5kZXgpLmJlZm9yZShzZWxmLiRlbCk7XG5cdFx0fVxuXG5cdFx0Ly8gQnV0IGlmIHRoZSBvdXRsZXQgaXMgZW1wdHksIG9yIHRoZXJlJ3Mgbm8gYXRJbmRleCwganVzdCBzdGljayBpdCBvbiB0aGUgZW5kXG5cdFx0ZWxzZSBzZWxmLiRvdXRsZXQuYXBwZW5kKHNlbGYuJGVsKTtcblxuXHRcdC8vIEZpbmFsbHksIHRyaWdnZXIgYWZ0ZXJSZW5kZXIgbWV0aG9kXG5cdFx0c2VsZi5hZnRlclJlbmRlcigpO1xuXG5cdFx0Ly8gQWRkIGRhdGEgYXR0cmlidXRlcyB0byB0aGlzIGNvbXBvbmVudCdzICRlbCwgcHJvdmlkaW5nIGFjY2Vzc1xuXHRcdC8vIHRvIHdoZXRoZXIgdGhlIGVsZW1lbnQgaGFzIHZhcmlvdXMgRE9NIGJpbmRpbmdzIGZyb20gc3R5bGVzaGVldHMuXG5cdFx0Ly8gKGhhbmR5IGZvciBkaXNhYmxpbmcgdGV4dCBzZWxlY3Rpb24gYWNjb3JkaW5nbHksIGV0Yy4pXG5cdFx0Ly9cblx0XHQvLyAtPiBkaXNhYmxlIGZvciB0aGlzIGNvbXBvbmVudCB3aXRoIGB0aGlzLmF0dHJGbGFncyA9IGZhbHNlYFxuXHRcdC8vIC0+IG9yIGdsb2JhbGx5IHdpdGggYEZSQU1FV09SSy5hdHRyRmxhZ3MgPSBmYWxzZWBcblx0XHQvL1xuXHRcdC8vIFRPRE86IG1ha2UgaXQgd29yayB3aXRoIGRlbGVnYXRlZCBET00gZXZlbnQgYmluZGluZ3Ncblx0XHQvL1xuXHRcdGlmIChzZWxmLmF0dHJGbGFncyAhPT0gZmFsc2UgJiYgRlJBTUVXT1JLLmF0dHJGbGFncyAhPT0gZmFsc2UpIHtcblx0XHRcdERPTS5mbGFnQm91bmRFdmVudHMoc2VsZik7XG5cdFx0fVxuXHR9KTtcbn1cbiIsIi8qKlxuICogQ2hlY2sgdGhlIHNwZWNpZmllZCBkZWZpbml0aW9uIGZvciBvYnZpb3VzIG1pc3Rha2VzLCBlc3BlY2lhbGx5IGxpa2VseSBkZXByZWNhdGlvbnMgYW5kXG4gKiB2YWxpZGF0ZSB0aGF0IHRoZSBtb2RlbCBhbmQgY29sbGVjdGlvbnMgYXJlIGluc3RhbmNlcyBvZiBCYWNrYm9uZSdzIERhdGEgc3RydWN0dXJlcy5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gcHJvcGVydGllcyBbT2JqZWN0IGNvbnRhaW5pbmcgdGhlIHByb3BlcnRpZXMgb2YgdGhlIGNvbXBvbmVudF1cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHZhbGlkYXRlRGVmaW5pdGlvbihwcm9wZXJ0aWVzKSB7XG5cblx0aWYgKF8uaXNPYmplY3QocHJvcGVydGllcykpIHtcblxuXHRcdC8vIERldGVybWluZSBjb21wb25lbnQgaWRcblx0XHR2YXIgaWQgPSB0aGlzLmlkIHx8IHByb3BlcnRpZXMuaWQ7XG5cblx0XHRmdW5jdGlvbiBfdmFsaWRhdGVCYWNrYm9uZUluc3RhbmNlICh0eXBlKSB7XG5cdFx0XHR2YXIgVHlwZSA9IHR5cGVbMF0udG9VcHBlckNhc2UoKSArIHR5cGUuc2xpY2UoMSk7XG5cblx0XHRcdGlmICggIXByb3BlcnRpZXNbdHlwZV0gaW5zdGFuY2VvZiBCYWNrYm9uZVtUeXBlXSApIHtcblxuXHRcdFx0XHRGcmFtZXdvcmsuZXJyb3IoXG5cdFx0XHRcdFx0J0NvbXBvbmVudCAoJyArIGlkICsgJykgaGFzIGFuIGludmFsaWQgJyArIHR5cGUgKyAnLS0gXFxuJyArXG5cdFx0XHRcdFx0J0lmIGAnICsgdHlwZSArICdgIGlzIHNwZWNpZmllZCBmb3IgYSBjb21wb25lbnQsICcgK1xuXHRcdFx0XHRcdCdpdCBtdXN0IGJlIGFuICppbnN0YW5jZSogb2YgYSBCYWNrYm9uZS4nICsgVHlwZSArICcuXFxuJyk7XG5cblx0XHRcdFx0aWYgKHByb3BlcnRpZXNbdHlwZV0gaW5zdGFuY2VvZiBCYWNrYm9uZVtUeXBlXS5jb25zdHJ1Y3Rvcikge1xuXHRcdFx0XHRcdEZyYW1ld29yay5lcnJvcihcblx0XHRcdFx0XHRcdCdJdCBsb29rcyBsaWtlIGEgQmFja2JvbmUuJyArIFR5cGUgKyAnICpwcm90b3R5cGUqIHdhcyBzcGVjaWZpZWQgaW5zdGVhZCBvZiBhICcgK1xuXHRcdFx0XHRcdFx0J0JhY2tib25lLicgKyBUeXBlICsgJyAqaW5zdGFuY2UqLlxcbicgK1xuXHRcdFx0XHRcdFx0J1BsZWFzZSBgbmV3YCB1cCB0aGUgJyArIHR5cGUgKyAnIC1iZWZvcmUtICcgKyBGcmFtZXdvcmsuaWQgKyAnLnJhaXNlKCksJyArXG5cdFx0XHRcdFx0XHQnb3IgdXNlIGEgd3JhcHBlciBmdW5jdGlvbiB0byBhY2hpZXZlIHRoZSBzYW1lIGVmZmVjdCwgZS5nLjpcXG4nICtcblx0XHRcdFx0XHRcdCdgJyArIHR5cGUgKyAnOiBmdW5jdGlvbiAoKSB7XFxucmV0dXJuIG5ldyBTb21lJyArIFR5cGUgKyAnKCk7XFxufWAnXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdEZyYW1ld29yay53YXJuKCdJZ25vcmluZyBpbnZhbGlkICcgKyB0eXBlICsgJyA6OiAnICsgcHJvcGVydGllc1t0eXBlXSk7XG5cdFx0XHRcdGRlbGV0ZSBwcm9wZXJ0aWVzW3R5cGVdO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENoZWNrIHRoYXQgdGhpcy5jb2xsZWN0aW9uIGlzIGFjdHVhbGx5IGFuIGluc3RhbmNlIG9mIEJhY2tib25lLkNvbGxlY3Rpb25cblx0XHQvLyBhbmQgdGhhdCB0aGlzLm1vZGVsIGlzIGFjdHVhbGx5IGFuIGluc3RhbmNlIG9mIEJhY2tib25lLk1vZGVsXG5cdFx0X3ZhbGlkYXRlQmFja2JvbmVJbnN0YW5jZSgnbW9kZWwnKTtcblx0XHRfdmFsaWRhdGVCYWNrYm9uZUluc3RhbmNlKCdjb2xsZWN0aW9uJyk7XG5cblx0XHQvLyBDbG9uZSBwcm9wZXJ0aWVzIHRvIGF2b2lkIGluYWR2ZXJ0ZW50IG1vZGlmaWNhdGlvbnNcblx0XHRyZXR1cm4gXy5jbG9uZShwcm9wZXJ0aWVzKTtcblx0fVxuXG5cdGVsc2UgcmV0dXJuIHt9O1xuXG59XG4iLCIvKipcbiAqIFJ1biBkZWZpbml0aW9uIG1ldGhvZHMgdG8gZ2V0IGFjdHVhbCBjb21wb25lbnQgZGVmaW5pdGlvbnMuXG4gKiBUaGlzIGlzIGRlZmVycmVkIHRvIGF2b2lkIGhhdmluZyB0byB1c2UgQmFja2JvbmUncyBmdW5jdGlvbiAoKSB7fSBhcHByb2FjaCBmb3IgdGhpbmdzXG4gKiBsaWtlIGNvbGxlY3Rpb25zLlxuICovXG5cbi8qKlxuICogQnVpbGQgdXBzIGEgY29tcG9uZW50IGRlZmluaXRpb24gYnkgcnVubmluZyB0aGUgZGVmaW5pdGlvbi4gV2UgdGhlbiBsaW5rIHRoZVxuICogY29tcG9uZW50IGRlZmluaXRpb24gdG8gYW4gaWRlbnRpZmllciBpbiBgRlJBTUVXT1JLLmNvbXBvbmVudHNgLlxuICpcbiAqIEBwYXJhbSAge09iamVjdH0gY29tcG9uZW50IFtPYmplY3QgY29udGFpbmluZyB0aGUgZGVmaW5pdGlvbiBmdW5jdGlvbiBvZiB0aGUgY29tcG9uZW50XVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGJ1aWxkQ29tcG9uZW50RGVmaW5pdGlvbihjb21wb25lbnQpIHtcblx0dmFyIGNvbXBvbmVudERlZiA9IGNvbXBvbmVudC5kZWZpbml0aW9uKCk7XG5cblx0aWYgKGNvbXBvbmVudC5pZE92ZXJyaWRlKSB7XG5cdFx0aWYgKGNvbXBvbmVudERlZi5pZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGNvbXBvbmVudC5pZE92ZXJyaWRlICsgJzo6IENhbm5vdCBzcGVjaWZ5IGFuIGlkT3ZlcnJpZGUgaW4gLmRlZmluZSgpIGlmIGFuIGlkIHByb3BlcnR5ICgnK2NvbXBvbmVudERlZi5pZCsnKSBpcyBhbHJlYWR5IHNldCBpbiB5b3VyIGNvbXBvbmVudCBkZWZpbml0aW9uIVxcblVzYWdlOiAuZGVmaW5lKFtpZE92ZXJyaWRlXSwgZGVmaW5pdGlvbiknKTtcblx0XHR9XG5cdFx0Y29tcG9uZW50RGVmLmlkID0gY29tcG9uZW50LmlkT3ZlcnJpZGU7XG5cdH1cblx0aWYgKCFjb21wb25lbnREZWYuaWQpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCB1c2UgLmRlZmluZSgpIHdpdGhvdXQgZGVmaW5pbmcgYW4gaWQgcHJvcGVydHkgb3Igb3ZlcnJpZGUgaW4geW91ciBjb21wb25lbnQhXFxuVXNhZ2U6IC5kZWZpbmUoW2lkT3ZlcnJpZGVdLCBkZWZpbml0aW9uKScpO1xuXHR9XG5cdEZSQU1FV09SSy5jb21wb25lbnRzW2NvbXBvbmVudERlZi5pZF0gPSBjb21wb25lbnREZWY7XG59O1xuIiwiLyoqXG4gKiBPcHRpb25hbCBtZXRob2QgdG8gcmVxdWlyZSBhcHAgY29tcG9uZW50cy4gUmVxdWlyZS5qcyBjYW4gYmUgdXNlZCBpbnN0ZWFkXG4gKiBhcyBuZWVkZWQuXG4gKlxuICogQHBhcmFtICB7U3RyaW5nfSBcdFsob3B0aW9uYWwpIENvbXBvbmVudCBpZCBvdmVycmlkZV1cbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSBbRnVuY3Rpb24gRGVmaW5pdGlvbiBvZiBjb21wb25lbnRdXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZGVmaW5lKGlkLCBkZWZpbml0aW9uRm4pIHtcblx0Ly8gSWQgcGFyYW0gaXMgb3B0aW9uYWxcblx0aWYgKCFkZWZpbml0aW9uRm4pIHtcblx0XHRkZWZpbml0aW9uRm4gPSBpZDtcblx0XHRpZCA9IG51bGw7XG5cdH1cblxuXHRGUkFNRVdPUksuX2RlZmluZVF1ZXVlLnB1c2goe1xuXHRcdGRlZmluaXRpb246IGRlZmluaXRpb25Gbixcblx0XHRpZE92ZXJyaWRlOiBpZFxuXHR9KTtcbn07XG4iLCIvKipcbiAqIE1hc3QgYnVpbGQgZmlsZS4gVGhlIG1haW4gZmlsZVxuICovXG5cbnZhciBkZWZpbmUgPSByZXF1aXJlKCcuL2RlZmluZS9pbmRleCcpO1xudmFyIFJlZ2lvbiA9IHJlcXVpcmUoJy4vcmVnaW9uL2luZGV4Jyk7XG52YXIgQ29tcG9uZW50ID0gcmVxdWlyZSgnLi9jb21wb25lbnQvaW5kZXgnKTtcbnZhciByYWlzZSA9IHJlcXVpcmUoJy4vcmFpc2UvaW5kZXgnKTtcblxuLyoqXG4gKiBGcmFtZXdvcmsgY2xhc3MgZGVmaW5pdGlvbiB0aGF0IHdpbGwgY3JlYXRlIGEgbmV3IGdsb2JhbCBpbnN0YW5jZSBvZiBhIGN1c3RvbSBGcmFtZXdvcmsuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgW29wdGlvbnMgaGFzaCB0byBpbml0aWFsaXplIHRoZSBjdXN0b20gZnJhbWV3b3JrIHdpdGhdXG4gKi9cbkZyYW1ld29yayA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcblx0Ly8gU2V0IHRoZSBkZWZhdWx0IG9wdGlvbnMgZm9yIHRob3NlIG5vdCBwYXNzZWQgaW4uXG5cdG9wdGlvbnMgPSBfLmRlZmF1bHRzKG9wdGlvbnMsIHtcblx0XHRsb2dMZXZlbDogJ3dhcm4nLFxuXHRcdGZyYW1ld29ya0lkOiAnTWFzdCcsXG5cdFx0c2hvcnRjdXQ6IHtcblx0XHRcdHRlbXBsYXRlOiB0cnVlLFxuXHRcdFx0Y291bnQ6IHRydWVcblx0XHR9XG5cdH0pO1xuXG5cdC8vIFNldCBhIHN0YXJ0aW5nIHBvaW50IHRvIEJhY2tib25lIGFuZCBhZGQgYWRkaXRpb25hbCBhdHRyaWJ1dGUuXG5cdF8uZXh0ZW5kKHRoaXMsIEJhY2tib25lLCB7XG5cdFx0b3B0aW9uczogb3B0aW9ucyxcblx0XHR0ZW1wbGF0ZXM6IHt9LFxuXHRcdGNvbXBvbmVudHM6IHt9LFxuXHRcdGRhdGE6IHt9LFxuXHRcdF9kZWZpbmVRdWV1ZTogW10sXG5cdFx0cmVnaW9uczoge31cblx0fSk7XG5cblx0Ly8gRXhwb3NlIGEgZ2xvYmFsIGZvciB0aGUgY3VzdG9tIGZyYW1ld29yay5cblx0dmFyIGZyYW1ld29ya05hbWUgPSBvcHRpb25zLmZyYW1ld29ya0lkO1xuXHR3aW5kb3dbZnJhbWV3b3JrTmFtZV0gPSB0aGlzXG5cblx0Ly8gVGhyb3VnaHRvdXQgdGhlIHNvdXJjZSBjb2RlLCB0aGVyZSBhcmUgb3BlcmF0aW9ucyBvbiBgRlJBTUVXT1JLYCBvciBjb2RlIHRoYXQgYWNjZXNzZXNcblx0Ly8gaXRzIGF0dHJpYnV0ZXMuIFdlIHdpbGwgbWFrZSBgRlJBTUVXT1JLYCBhY2Nlc3NhYmxlIGJ5IGFzc2lnbmluZyBpdCB0aGUgaW5zdGFuY2Ugb2YgdGhlXG5cdC8vIGN1c3RvbSBGcmFtZXdvcmsuXG5cdEZSQU1FV09SSyA9IHdpbmRvd1tmcmFtZXdvcmtOYW1lXTtcbn1cblxuLy8gRnJhbWV3b3JrIHByb3RvdHlwZSBtZXRob2RzLlxuRnJhbWV3b3JrLnByb3RvdHlwZS5SZWdpb24gPSBSZWdpb247XG5GcmFtZXdvcmsucHJvdG90eXBlLkNvbXBvbmVudCA9IENvbXBvbmVudDtcbkZyYW1ld29yay5wcm90b3R5cGUuZGVmaW5lID0gZGVmaW5lO1xuRnJhbWV3b3JrLnByb3RvdHlwZS5yYWlzZSA9IHJhaXNlO1xuXG4iLCIvKipcbiAqXHRMb2dnZXQgY29uc3RydWN0b3IgbWV0aG9kIHRoYXQgd2lsbCBzZXR1cCBGUkFNRVdPUksgdG8gbG9nIG1lc3NhZ2VzLlxuICovXG5cbnZhciBzZXR1cExvZ2dlciA9IHJlcXVpcmUoJy4vc2V0dXAnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBMb2dnZXIoKSB7XG5cblx0Ly8gVXBvbiBpbml0aWFsaXphdGlvbiwgc2V0dXAgbG9nZ2VyXG5cdHNldHVwTG9nZ2VyKEZSQU1FV09SSy5vcHRpb25zLmxvZ0xldmVsKTtcblxuXHQvLyBJbiBzdXBwb3J0ZWQgYnJvd3NlcnMsIGFsc28gcnVuIHNldHVwTG9nZ2VyIGFnYWluXG5cdC8vIHdoZW4gRlJBTUVXT1JLLmxvZ0xldmVsIGlzIHNldCBieSB0aGUgdXNlclxuXHRpZiAoXy5pc0Z1bmN0aW9uKEZSQU1FV09SSy5fX2RlZmluZVNldHRlcl9fKSkge1xuXHRcdEZSQU1FV09SSy5fX2RlZmluZVNldHRlcl9fKCdsb2dMZXZlbCcsIGZ1bmN0aW9uIG9uQ2hhbmdlIChuZXdMb2dMZXZlbCkge1xuXHRcdFx0c2V0dXBMb2dnZXIobmV3TG9nTGV2ZWwpO1xuXHRcdH0pO1xuXHR9XG59O1xuIiwiLyoqXG4gKiBTZXQgdXAgdGhlIGxvZyBmdW5jdGlvbnM6XG4gKlxuICogRlJBTUVXT1JLLmVycm9yXG4gKiBGUkFNRVdPUksud2FyblxuICogRlJBTUVXT1JLLmxvZ1xuICogRlJBTUVXT1JLLmRlYnVnICgqbGVnYWN5KVxuICogRlJBTUVXT1JLLnZlcmJvc2VcbiAqXG4gKiBAcGFyYW0gIHtTdHJpbmd9IGxvZ0xldmVsIFtUaGUgZGVzaXJlZCBsb2cgbGV2ZWwgb2YgdGhlIExvZ2dlcl1cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBzZXR1cExvZ2dlciAobG9nTGV2ZWwpIHtcblxuXHR2YXIgbm9vcCA9IGZ1bmN0aW9uICgpIHt9O1xuXG5cdC8vIElmIGxvZyBpcyBzcGVjaWZpZWQsIHVzZSBpdCwgb3RoZXJ3aXNlIHVzZSB0aGUgY29uc29sZVxuXHRpZiAoRlJBTUVXT1JLLmxvZ2dlcikge1xuXHRcdEZSQU1FV09SSy5lcnJvciAgICAgPSBGUkFNRVdPUksubG9nZ2VyLmVycm9yO1xuXHRcdEZSQU1FV09SSy53YXJuICAgICAgPSBGUkFNRVdPUksubG9nZ2VyLndhcm47XG5cdFx0RlJBTUVXT1JLLmxvZyAgICAgICA9IEZSQU1FV09SSy5sb2dnZXIuZGVidWcgfHwgRlJBTUVXT1JLLmxvZ2dlcjtcblx0XHRGUkFNRVdPUksudmVyYm9zZSAgID0gRlJBTUVXT1JLLmxvZ2dlci52ZXJib3NlO1xuXHR9XG5cblx0Ly8gSW4gSUUsIHdlIGNhbid0IGRlZmF1bHQgdG8gdGhlIGJyb3dzZXIgY29uc29sZSBiZWNhdXNlIHRoZXJlIElTIE5PIEJST1dTRVIgQ09OU09MRVxuXHRlbHNlIGlmICh0eXBlb2YgY29uc29sZSAhPT0gJ3VuZGVmaW5lZCcpIHtcblxuXHRcdC8vIFdlIGNhbm5vdCBjYWxsZWQgdGhlIC5iaW5kIG1ldGhvZCBvbiB0aGUgY29uc29sZSBtZXRob2RzLiBXZSBhcmUgaW4gaWUgOSBvciA4LCBqdXN0IG1ha2Vcblx0XHQvLyBldmVyeWh0aW5nIGEgbm9vcC5cblx0XHRpZiAoXy5pc1VuZGVmaW5lZChjb25zb2xlLmxvZy5iaW5kKSkgIHtcblx0XHRcdEZSQU1FV09SSy5lcnJvciAgICAgPSBub29wO1xuXHRcdFx0RlJBTUVXT1JLLndhcm4gICAgICA9IG5vb3A7XG5cdFx0XHRGUkFNRVdPUksubG9nICAgICAgID0gbm9vcDtcblx0XHRcdEZSQU1FV09SSy5kZWJ1ZyAgICAgPSBub29wO1xuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UgICA9IG5vb3A7XG5cdFx0fVxuXG5cdFx0Ly8gV2UgYXJlIGluIGEgZnJpZW5kbHkgYnJvd3NlciBsaWtlIENocm9tZSwgRmlyZWZveCwgb3IgSUUxMFxuXHRcdGVsc2Uge1xuXHRcdFx0RlJBTUVXT1JLLmVycm9yXHRcdD0gY29uc29sZS5lcnJvciAmJiBjb25zb2xlLmVycm9yLmJpbmQoY29uc29sZSk7XG5cdFx0XHRGUkFNRVdPUksud2Fyblx0XHQ9IGNvbnNvbGUud2FybiAmJiBjb25zb2xlLndhcm4uYmluZChjb25zb2xlKTtcblx0XHRcdEZSQU1FV09SSy5sb2dcdFx0XHQ9IGNvbnNvbGUuZGVidWcgJiYgY29uc29sZS5kZWJ1Zy5iaW5kKGNvbnNvbGUpO1xuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2VcdD0gY29uc29sZS5sb2cgJiYgY29uc29sZS5sb2cuYmluZChjb25zb2xlKTtcblxuXHRcdFx0Ly8gVXNlIGxvZyBsZXZlbCBjb25maWcgaWYgcHJvdmlkZWRcblx0XHRcdHN3aXRjaCAobG9nTGV2ZWwpIHtcblx0XHRcdFx0Y2FzZSAndmVyYm9zZSc6IGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgJ2RlYnVnJzpcblx0XHRcdFx0XHRGUkFNRVdPUksudmVyYm9zZSA9IG5vb3A7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSAnd2Fybic6XG5cdFx0XHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UgPSBGUkFNRVdPUksubG9nID0gbm9vcDtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlICdlcnJvcic6XG5cdFx0XHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UgPSBGUkFNRVdPUksubG9nID0gRlJBTUVXT1JLLndhcm4gPSBub29wO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgJ3NpbGVudCc6XG5cdFx0XHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UgPSBGUkFNRVdPUksubG9nID0gRlJBTUVXT1JLLndhcm4gPSBGUkFNRVdPUksuZXJyb3IgPSBub29wO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yICgnVW5yZWNvZ25pemVkIGxvZ2dpbmcgbGV2ZWwgY29uZmlnICcgK1xuXHRcdFx0XHRcdCcoJyArIEZSQU1FV09SSy5vcHRpb25zLmZyYW1ld29ya0lkICsgJy5sb2dMZXZlbCA9IFwiJyArIGxvZ0xldmVsICsgJ1wiKScpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTdXBwb3J0IGZvciBgZGVidWdgIGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eVxuXHRcdFx0RlJBTUVXT1JLLmRlYnVnID0gRlJBTUVXT1JLLmxvZztcblxuXHRcdFx0Ly8gVmVyYm9zZSBzcGl0cyBvdXQgbG9nIGxldmVsXG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZSgnTG9nIGxldmVsIHNldCB0byA6OiAnLCBsb2dMZXZlbCk7XG5cdFx0fVxuXHR9XG59XG4iLCIvKipcbiAqIEdpdmVuIGEgY29tcG9uZW50IGRlZmluaXRpb24gYW5kIGl0cyBrZXksIHdlIHdpbGwgYnVpbGQgdXAgdGhlIGNvbXBvbmVudCBwcm90b3R5cGUgYW5kIG1lcmdlXG4gKiB0aGlzIGNvbXBvbmVudCB3aXRoIGl0cyBtYXRjaGluZyB0ZW1wbGF0ZS5cbiAqXG4gKiBAcGFyYW0gIHtPYmplY3R9IGNvbXBvbmVudERlZiBbT2JqZWN0IGNvbnRhaW5pbmcgdGhlIGNvbXBvbmVudCBkZWZpbml0aW9uXVxuICogQHBhcmFtICB7U3RyaW5nfSBjb21wb25lbnRLZXkgW1RoZSBjb21wb25lbnQgaWRlbnRpZmllcl1cbiAqL1xuXG52YXIgdHJhbnNsYXRlU2hvcnRoYW5kID0gcmVxdWlyZSgnLi4vdXRpbHMvc2hvcnRoYW5kJyk7XG52YXIgVXRpbHMgPSByZXF1aXJlKCcuLi91dGlscy91dGlscycpO1xudmFyIEV2ZW50cyA9IHJlcXVpcmUoJy4uL3V0aWxzL2V2ZW50cycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGJ1aWxkQ29tcG9uZW50UHJvdG90eXBlKGNvbXBvbmVudERlZiwgY29tcG9uZW50S2V5KSB7XG5cblx0Ly8gSWYgY29tcG9uZW50IGlkIGlzIG5vdCBleHBsaWNpdGx5IHNldCwgdXNlIHRoZSBjb21wb25lbnRLZXlcblx0aWYgKCFjb21wb25lbnREZWYuaWQpIHtcblx0XHRjb21wb25lbnREZWYuaWQgPSBjb21wb25lbnRLZXk7XG5cdH1cblxuXHQvLyBTZWFyY2ggdGVtcGxhdGVzXG5cdHZhciB0ZW1wbGF0ZSA9IEZSQU1FV09SSy50ZW1wbGF0ZXNbY29tcG9uZW50RGVmLmlkXTtcblxuXHQvLyBJZiBubyBtYXRjaCBmb3IgY29tcG9uZW50IHdhcyBmb3VuZMKgaW4gdGVtcGxhdGVzLCBpc3N1ZSBhIHdhcm5pbmdcblx0aWYgKCF0ZW1wbGF0ZSkge1xuXHRcdHJldHVybiBGUkFNRVdPUksud2Fybihcblx0XHRcdGNvbXBvbmVudERlZi5pZCArICcgOjogTm8gdGVtcGxhdGUgZm91bmQgZm9yIGNvbXBvbmVudCEnICtcblx0XHRcdCdcXG5UZW1wbGF0ZXMgZG9uXFwndCBuZWVkIGEgY29tcG9uZW50IHVubGVzcyB5b3Ugd2FudCBpbnRlcmFjdGl2aXR5LCAnICtcblx0XHRcdCdldmVyeSBjb21wb25lbnQgKnNob3VsZCogaGF2ZSBhIG1hdGNoaW5nIHRlbXBsYXRlISEnICtcblx0XHRcdCdcXG5Vc2luZyBjb21wb25lbnRzIHdpdGhvdXQgdGVtcGxhdGVzIG1heSBzZWVtIG5lY2Vzc2FyeSwgJyArXG5cdFx0XHQnYnV0IGl0XFwncyBub3QuICBJdCBtYWtlcyB5b3VyIHZpZXcgbG9naWMgaW5jb3Jwb3JlYWwsIGFuZCBtYWtlcyB5b3VyIGNvbGxlYWd1ZXMgJyArXG5cdFx0XHQndW5jb21mb3J0YWJsZS4nKTtcblx0fVxuXG5cdC8vIFNhdmUgcmVmZXJlbmNlIHRvIHRlbXBsYXRlIGluIGNvbXBvbmVudCBwcm90b3R5cGVcblx0RlJBTUVXT1JLLnZlcmJvc2UoY29tcG9uZW50RGVmLmlkICsgJyA6OiBQYWlyaW5nIGNvbXBvbmVudCB3aXRoIHRlbXBsYXRlLi4uJyk7XG5cdGNvbXBvbmVudERlZi50ZW1wbGF0ZSA9IHRlbXBsYXRlO1xuXG5cdC8vIFRyYW5zbGF0ZSByaWdodC1oYW5kIHNob3J0aGFuZCBmb3IgdG9wLWxldmVsIGtleXNcblx0Y29tcG9uZW50RGVmID0gVXRpbHMub2JqTWFwKGNvbXBvbmVudERlZiwgdHJhbnNsYXRlU2hvcnRoYW5kKTtcblxuXG5cdC8vIGFuZCBldmVudHMgb2JqZWN0XG5cdGlmIChjb21wb25lbnREZWYuZXZlbnRzKSB7XG5cdFx0Y29tcG9uZW50RGVmLmV2ZW50cyA9IFV0aWxzLm9iak1hcChcblx0XHRcdGNvbXBvbmVudERlZi5ldmVudHMsXG5cdFx0XHR0cmFuc2xhdGVTaG9ydGhhbmRcblx0XHQpO1xuXHR9XG5cblx0Ly8gYW5kIGFmdGVyQ2hhbmdlIGJpbmRpbmdzXG5cdGlmIChfLmlzT2JqZWN0KGNvbXBvbmVudERlZi5hZnRlckNoYW5nZSkgJiYgIV8uaXNGdW5jdGlvbihjb21wb25lbnREZWYuYWZ0ZXJDaGFuZ2UpKSB7XG5cdFx0Y29tcG9uZW50RGVmLmFmdGVyQ2hhbmdlID0gVXRpbHMub2JqTWFwKFxuXHRcdFx0Y29tcG9uZW50RGVmLmFmdGVyQ2hhbmdlLFxuXHRcdFx0dHJhbnNsYXRlU2hvcnRoYW5kXG5cdFx0KTtcblx0fVxuXG5cdC8vIEdvIGFoZWFkIGFuZCB0dXJuIHRoZSBkZWZpbml0aW9uIGludG8gYSByZWFsIGNvbXBvbmVudCBwcm90b3R5cGVcblx0RlJBTUVXT1JLLnZlcmJvc2UoY29tcG9uZW50RGVmLmlkICsgJyA6OiBCdWlsZGluZyBjb21wb25lbnQgcHJvdG90eXBlLi4uJyk7XG5cdHZhciBjb21wb25lbnRQcm90b3R5cGUgPSBGUkFNRVdPUksuQ29tcG9uZW50LmV4dGVuZChjb21wb25lbnREZWYpO1xuXG5cdC8vIERpc2NvdmVyIHN1YnNjcmlwdGlvbnNcblx0Y29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZS5zdWJzY3JpcHRpb25zID0ge307XG5cblx0Ly8gSXRlcmF0ZSB0aHJvdWdoIGVhY2ggcHJvcGVydHkgb24gdGhpcyBjb21wb25lbnQgcHJvdG90eXBlXG5cdF8uZWFjaChjb21wb25lbnRQcm90b3R5cGUucHJvdG90eXBlLCBmdW5jdGlvbiAoaGFuZGxlciwga2V5KSB7XG5cblx0XHQvLyBEZXRlY3QgRE9NIGV2ZW50cyBhbmQgc21hc2ggdGhlbSBpbnRvIHRoZSBldmVudHMgaGFzaFxuXHRcdHZhciBtYXRjaGVkRE9NRXZlbnRzID0ga2V5Lm1hdGNoKEV2ZW50c1snL0RPTUV2ZW50LyddKTtcblx0XHRpZiAobWF0Y2hlZERPTUV2ZW50cykge1xuXHRcdFx0dmFyIGV2ZW50TmFtZSA9IG1hdGNoZWRET01FdmVudHNbMV07XG5cdFx0XHR2YXIgZGVsZWdhdGVTZWxlY3RvciA9IG1hdGNoZWRET01FdmVudHNbM107XG5cblx0XHRcdC8vIFN0b3cgdGhlbSBpbiBldmVudHMgaGFzaFxuXHRcdFx0Y29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZS5ldmVudHMgPSBjb21wb25lbnRQcm90b3R5cGUucHJvdG90eXBlLmV2ZW50cyB8fCB7fTtcblx0XHRcdGNvbXBvbmVudFByb3RvdHlwZS5wcm90b3R5cGUuZXZlbnRzW2tleV0gPSBoYW5kbGVyO1xuXHRcdH1cblxuXHRcdC8vIEFkZCBhcHAgZXZlbnRzICglKSwgcm91dGVzICgjKSwgYW5kIGRhdGEgbGlzdGVuZXJzICh+KSB0byBzdWJzY3JpcHRpb25zIGhhc2hcblx0XHRpZiAoa2V5Lm1hdGNoKC9eKCV8I3x+KS8pKSB7XG5cdFx0XHRpZiAoXy5pc1N0cmluZyhoYW5kbGVyKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoY29tcG9uZW50RGVmLmlkICsgJzo6IEludmFsaWQgbGlzdGVuZXIgZm9yIHN1YnNjcmlwdGlvbjogJyArIGtleSArICcuXFxuJyArXG5cdFx0XHRcdFx0J0RlZmluZSB5b3VyIGNhbGxiYWNrIHdpdGggYW4gYW5vbnltb3VzIGZ1bmN0aW9uIGluc3RlYWQgb2YgYSBzdHJpbmcuJ1xuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFfLmlzRnVuY3Rpb24oaGFuZGxlcikpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGNvbXBvbmVudERlZi5pZCArJzo6IEludmFsaWQgbGlzdGVuZXIgZm9yIHN1YnNjcmlwdGlvbjogJyArIGtleSk7XG5cdFx0XHR9XG5cdFx0XHRjb21wb25lbnRQcm90b3R5cGUucHJvdG90eXBlLnN1YnNjcmlwdGlvbnNba2V5XSA9IGhhbmRsZXI7XG5cdFx0fVxuXG5cdFx0Ly8gRXh0ZW5kIG9uZSBvciBtb3JlIG90aGVyIGNvbXBvbmVudHNcblx0XHRlbHNlIGlmIChrZXkgPT09ICdleHRlbmRDb21wb25lbnRzJykge1xuXHRcdFx0dmFyIG9ialRvTWVyZ2UgPSB7fTtcblx0XHRcdF8uZWFjaChoYW5kbGVyLCBmdW5jdGlvbihjaGlsZElkKXtcblxuXHRcdFx0XHRpZiAoIUZSQU1FV09SSy5jb21wb25lbnRzW2NoaWxkSWRdKXtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoXG5cdFx0XHRcdFx0Y29tcG9uZW50RGVmLmlkICsgJyA6OiAnICtcblx0XHRcdFx0XHQnVHJ5aW5nIHRvIGRlZmluZS9leHRlbmQgdGhpcyBjb21wb25lbnQgZnJvbSBgJyArIGNoaWxkSWQgKyAnYCwgJyArXG5cdFx0XHRcdFx0J2J1dCBubyBjb21wb25lbnQgd2l0aCB0aGF0IGlkIGNhbiBiZSBmb3VuZC4nXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdF8uZXh0ZW5kKG9ialRvTWVyZ2UsIEZSQU1FV09SSy5jb21wb25lbnRzW2NoaWxkSWRdKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRfLmRlZmF1bHRzKGNvbXBvbmVudFByb3RvdHlwZS5wcm90b3R5cGUsIG9ialRvTWVyZ2UpO1xuXHRcdH1cblx0fSk7XG5cblx0Ly8gU2F2ZSBwcm90b3R5cGUgaW4gZ2xvYmFsIHNldCBmb3IgdHJhY2tpbmdcblx0RlJBTUVXT1JLLmNvbXBvbmVudHNbY29tcG9uZW50RGVmLmlkXSA9IGNvbXBvbmVudFByb3RvdHlwZTtcbn07XG4iLCIvKipcbiAqIENvbGxlY3QgYW55IHJlZ2lvbnMgd2l0aCB0aGUgZGVmYXVsdCBjb21wb25lbnQgc2V0IGZyb20gdGhlIERPTS5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNvbGxlY3RSZWdpb25zICgpIHtcblxuXHQvLyBQcm92aWRlIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5IGZvciBsZWdhY3kgbm90YXRpb25cblx0JCgncmVnaW9uW2RlZmF1bHRdLHJlZ2lvblt0ZW1wbGF0ZV0sW2RhdGEtcmVnaW9uXVtkZWZhdWx0XSxbZGF0YS1yZWdpb25dW3RlbXBsYXRlXScpLmVhY2goZnVuY3Rpb24oKSB7XG5cdFx0JGUgPSAkKHRoaXMpO1xuXHRcdHZhciBjb21wb25lbnRJZCA9ICRlLmF0dHIoJ2RlZmF1bHQnKSB8fCAkZS5hdHRyKCd0ZW1wbGF0ZScpO1xuXHRcdCRlLmF0dHIoJ2NvbnRlbnRzJywgY29tcG9uZW50SWQpO1xuXHR9KTtcblxuXHQvLyBOb3cgaW5zdGFudGlhdGUgdGhlIGFwcHJvcHJpYXRlIGRlZmF1bHQgY29tcG9uZW50IGluIGVhY2hcblx0Ly8gcmVnaW9uIHdpdGggYSBzcGVjaWZpZWQgdGVtcGxhdGUvY29tcG9uZW50XG5cdCQoJ3JlZ2lvbltjb250ZW50c10sW2RhdGEtcmVnaW9uXVtjb250ZW50c10nKS5lYWNoKGZ1bmN0aW9uKCkge1xuXHRcdEZSQU1FV09SSy5SZWdpb24uZnJvbUVsZW1lbnQodGhpcyk7XG5cdH0pO1xufVxuIiwiLyoqXG4gKiBMb2FkIGFueSBzY3JpcHQgdGFncyBvbiB0aGUgcGFnZSB3aXRoIHR5cGU9XCJ0ZXh0L3RlbXBsYXRlXCIuXG4gKlxuICogQHJldHVybiB7T2JqZWN0fSBbT2JqZWN0IGNvbnNpc3Rpbmcgb2YgYSB0ZW1wbGF0ZSBpZGVudGlmaWVyIGFuZCBpdHMgSFRNTC5dXG4gKi9cblxudmFyIFV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMvdXRpbHMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjb2xsZWN0VGVtcGxhdGVzKCkge1xuXHR2YXIgdGVtcGxhdGVzID0ge307XG5cblx0JCgnc2NyaXB0W3R5cGU9XCJ0ZXh0L3RlbXBsYXRlXCJdJykuZWFjaChmdW5jdGlvbiAoaSwgZWwpIHtcblx0XHR2YXIgaWQgPSBVdGlscy5lbDJpZChlbCwgdHJ1ZSk7XG5cdFx0dGVtcGxhdGVzW2lkXSA9ICQoZWwpLmh0bWwoKTtcblxuXHRcdC8vIFN0cmlwIHdoaXRlc3BhY2UgbGVmdG92ZXIgZnJvbSBzY3JpcHQgdGFnc1xuXHRcdHRlbXBsYXRlc1tpZF0gPSB0ZW1wbGF0ZXNbaWRdLnJlcGxhY2UoL15cXHMrLywnJyk7XG5cdFx0dGVtcGxhdGVzW2lkXSA9IHRlbXBsYXRlc1tpZF0ucmVwbGFjZSgvXFxzKyQvLCcnKTtcblxuXHRcdC8vIFJlbW92ZSBmcm9tIERPTVxuXHRcdCQoZWwpLnJlbW92ZSgpO1xuXHR9KTtcblxuXHRyZXR1cm4gdGVtcGxhdGVzO1xufTtcbiIsIi8qKlxuICogVGhpcyBpcyB0aGUgc3RhcnRpbmcgcG9pbnQgdG8geW91ciBhcHBsaWNhdGlvbi4gIFlvdSBzaG91bGQgZ3JhYiB0ZW1wbGF0ZXMgYW5kIGNvbXBvbmVudHNcbiAqIGJlZm9yZSBjYWxsaW5nIEZSQU1FV09SSy5yYWlzZSgpIHVzaW5nIHNvbWV0aGluZyBsaWtlIFJlcXVpcmUuanMuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnNcblx0XHRkYXRhOiB7IGF1dGhlbnRpY2F0ZWQ6IGZhbHNlIH0sXG5cdFx0dGVtcGxhdGVzOiB7IGNvbXBvbmVudE5hbWU6IEhUTUxPclByZWNvbXBpbGVkRm4gfSxcblx0XHRjb21wb25lbnRzOiB7IGNvbXBvbmVudE5hbWU6IENvbXBvbmVudERlZmluaXRpb24gfVxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2JcbiAqL1xuXG52YXIgTG9nZ2VyID0gcmVxdWlyZSgnLi4vbG9nZ2VyL2luZGV4Jyk7XG52YXIgYnVpbGRDb21wb25lbnREZWZpbml0aW9uID0gcmVxdWlyZSgnLi4vZGVmaW5lL2J1aWxkRGVmaW5pdGlvbicpO1xudmFyIGJ1aWxkQ29tcG9uZW50UHJvdG90eXBlID0gcmVxdWlyZSgnLi9idWlsZFByb3RvdHlwZScpO1xudmFyIGNvbGxlY3RUZW1wbGF0ZXMgPSByZXF1aXJlKCcuL2NvbGxlY3RUZW1wbGF0ZXMnKTtcbnZhciBjb2xsZWN0UmVnaW9ucyA9IHJlcXVpcmUoJy4vY29sbGVjdFJlZ2lvbnMnKTtcbnZhciBzZXR1cFJvdXRlciA9IHJlcXVpcmUoJy4uL3JvdXRlci9pbmRleCcpO1xuXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcmFpc2Uob3B0aW9ucywgY2IpIHtcblxuXHQvLyBJZiBvbmx5IG9uZSBhcmcgaXMgcHJlc2VudCwgdXNlIG9wdGlvbnMgYXMgY2FsbGJhY2sgaWYgcG9zc2libGUuXG5cdC8vIElmIG9wdGlvbnMgYXJlIG5vdCBkZWZpbmVkLCB1c2UgYW4gZW1wdHkgb2JqZWN0LlxuXHRpZiAoIWNiICYmIF8uaXNGdW5jdGlvbihvcHRpb25zKSkge1xuXHRcdGNiID0gb3B0aW9ucztcblx0fVxuXHRpZiAoIV8uaXNQbGFpbk9iamVjdChvcHRpb25zKSkge1xuXHRcdG9wdGlvbnMgPSB7fTtcblx0fVxuXG5cdC8vIEFwcGx5IGRlZmF1bHRzXG5cdF8uZGVmYXVsdHMoRlJBTUVXT1JLLCB7XG5cdFx0dGhyb3R0bGVXaW5kb3dSZXNpemU6IDIwMCxcblx0XHRsb2dMZXZlbDogJ3dhcm4nLFxuXHRcdGxvZ2dlcjogdW5kZWZpbmVkLFxuXHRcdHByb2R1Y3Rpb246IGZhbHNlXG5cdH0pO1xuXG5cdC8vIEFwcGx5IG92ZXJyaWRlcyBmcm9tIG9wdGlvbnNcblx0Xy5leHRlbmQoRlJBTUVXT1JLLCBvcHRpb25zKTtcblxuXHQvLyBJbnRlcnByZXQgYHByb2R1Y3Rpb25gIGFzIGBsb2dMZXZlbCA9PT0gJ3NpbGVudCdgXG5cdGlmIChGUkFNRVdPUksucHJvZHVjdGlvbikge1xuXHRcdEZSQU1FV09SSy5sb2dMZXZlbCA9ICdzaWxlbnQnO1xuXHR9XG5cblx0Ly8gSW5pdGlhbGl6ZSBsb2dnZXJcblx0bmV3IExvZ2dlcigpO1xuXG5cdC8vIE1lcmdlIGRhdGEgaW50byBGUkFNRVdPUksuZGF0YVxuXHRfLmV4dGVuZChGUkFNRVdPUksuZGF0YSwgb3B0aW9ucy5kYXRhIHx8IHt9KTtcblxuXHQvLyBNZXJnZSBzcGVjaWZpZWQgdGVtcGxhdGVzIHdpdGggRlJBTUVXT1JLLnRlbXBsYXRlc1xuXHRfLmV4dGVuZChGUkFNRVdPUksudGVtcGxhdGVzLCBvcHRpb25zLnRlbXBsYXRlcyB8fCB7fSk7XG5cblx0Ly8gSWYgRlJBTUVXT1JLLmRlZmluZSgpIHdhcyB1c2VkLCBidWlsZCB0aGUgbGlzdCBvZiBjb21wb25lbnRzXG5cdC8vIEl0ZXJhdGUgdGhyb3VnaCB0aGUgZGVmaW5lIHF1ZXVlIGFuZCBjcmVhdGUgZWFjaCBkZWZpbml0aW9uXG5cdF8uZWFjaChGUkFNRVdPUksuX2RlZmluZVF1ZXVlLCBidWlsZENvbXBvbmVudERlZmluaXRpb24pO1xuXG5cdC8vIE1lcmdlIHNwZWNpZmllZCBjb21wb25lbnRzIHcvIEZSQU1FV09SSy5jb21wb25lbnRzXG5cdF8uZXh0ZW5kKEZSQU1FV09SSy5jb21wb25lbnRzLCBvcHRpb25zLmNvbXBvbmVudHMgfHwge30pO1xuXG5cdC8vIEJhY2sgdXAgZWFjaCBjb21wb25lbnQgZGVmaW5pdGlvbiBiZWZvcmUgdHJhbnNmb3JtaW5nIGl0IGludG8gYSBsaXZlIHByb3RvdHlwZVxuXHRGUkFNRVdPUksuY29tcG9uZW50RGVmcyA9IF8uY2xvbmUoRlJBTUVXT1JLLmNvbXBvbmVudHMpO1xuXG5cdC8vIFJ1biB0aGlzIGNhbGwgYmFjayB3aGVuIHRoZSBET00gaXMgcmVhZHlcblx0JChmdW5jdGlvbiAoKSB7XG5cblx0XHQvLyBDb2xsZWN0IGFueSA8c2NyaXB0PiB0YWcgdGVtcGxhdGVzIG9uIHRoZSBwYWdlXG5cdFx0Ly8gYW5kIGFic29yYiB0aGVtIGludG8gRlJBTUVXT1JLLnRlbXBsYXRlc1xuXHRcdF8uZXh0ZW5kKEZSQU1FV09SSy50ZW1wbGF0ZXMsIGNvbGxlY3RUZW1wbGF0ZXMoKSk7XG5cblx0XHQvLyBCdWlsZCBhY3R1YWwgcHJvdG90eXBlcyBmb3IgdGhlIGNvbXBvbmVudHNcblx0XHQvLyAobmVlZCB0aGUgdGVtcGxhdGVzIGF0IHRoaXMgcG9pbnQgdG8gbWFrZSB0aGlzIHdvcmspXG5cblx0XHRfLmVhY2goRlJBTUVXT1JLLmNvbXBvbmVudHMsIGJ1aWxkQ29tcG9uZW50UHJvdG90eXBlKTtcblxuXHRcdC8vIEdyYWIgaW5pdGlhbCByZWdpb25zIGZyb20gRE9NXG5cdFx0Y29sbGVjdFJlZ2lvbnMoKTtcblxuXHRcdC8vIEJpbmQgZ2xvYmFsIERPTSBldmVudHMgYXMgRlJBTUVXT1JLIGV2ZW50c1xuXHRcdC8vIChlLmcuICV3aW5kb3c6cmVzaXplKVxuXHRcdHZhciB0cmlnZ2VyUmVzaXplRXZlbnQgPSBfLmRlYm91bmNlKGZ1bmN0aW9uICgpIHtcblx0XHRcdEZSQU1FV09SSy50cmlnZ2VyKCcld2luZG93OnJlc2l6ZScpO1xuXHRcdH0sIG9wdGlvbnMudGhyb3R0bGVXaW5kb3dSZXNpemUgfHwgMCk7XG5cdFx0JCh3aW5kb3cpLnJlc2l6ZSh0cmlnZ2VyUmVzaXplRXZlbnQpO1xuXHRcdC8vIFRPRE86IGFkZCBtb3JlIGV2ZW50cyBhbmQgZXh0cmFwb2xhdGUgdGhpcyBsb2dpYyB0byBhIHNlcGFyYXRlIG1vZHVsZVxuXG5cdFx0Ly8gRG8gdGhlIGluaXRpYWwgcm91dGluZyBzZXF1ZW5jZVxuXHRcdC8vIExvb2sgYXQgdGhlICNmcmFnbWVudCB1cmwgYW5kIGZpcmUgdGhlIGdsb2JhbCByb3V0ZSBldmVudFxuXHRcdHNldHVwUm91dGVyKCk7XG5cdFx0RlJBTUVXT1JLLmhpc3Rvcnkuc3RhcnQoXy5kZWZhdWx0cyh7XG5cdFx0XHRwdXNoU3RhdGU6IHVuZGVmaW5lZCxcblx0XHRcdGhhc2hDaGFuZ2U6IHVuZGVmaW5lZCxcblx0XHRcdHJvb3Q6IHVuZGVmaW5lZFxuXHRcdH0sIG9wdGlvbnMpKTtcblxuXHRcdGlmIChjYikgY2IoKTtcblx0fSk7XG59O1xuIiwiLyoqXG4gKiByZWdpb24uYXBwZW5kKCBjb21wb25lbnRJZCwgW3Byb3BlcnRpZXNdIClcbiAqXG4gKiBDYWxscyBpbnNlcnQoKSBhdCBsYXN0IHBvc2l0aW9uXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYXBwZW5kKGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKSB7XG5cdC8vIEluc2VydCBhdCBsYXN0IHBvc2l0aW9uXG5cdHJldHVybiB0aGlzLmluc2VydCh0aGlzLl9jaGlsZHJlbi5sZW5ndGgsIGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKTtcbn07XG4iLCIvKipcbiAqIFNob3J0Y3V0IGZvciBjYWxsaW5nIGVtcHR5KCkgYW5kIHRoZW4gYXBwZW5kKCksXG4gKiBUaGlzIGlzIHRoZSBnZW5lcmFsIHVzZSBjYXNlIGZvciBtYW5hZ2luZyBzdWJjb21wb25lbnRzXG4gKiAoZS5nLiB3aGVuIGEgbmF2YmFyIGl0ZW0gaXMgdG91Y2hlZClcbiAqXG4gKiBAcGFyYW0gIHtzdHJpbmd9IGNvbXBvbmVudCAgVGhlIGlkIG5hbWUgb2YgdGhlIGNvbXBvbmV0IHRoYXQgeW91IHdhbnQgdG8gYXR0YWNoLlxuICogQHBhcmFtICB7T2JqZWN0fSBwcm9wZXJ0aWVzIFByb3BlcnRpZXMgdGhhdCB0aGUgYXR0YWNoZWQgY29tcG9uZW50IHdpbGwgYmUgaW5pdGFsaXplZCB3aXRoLlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYXR0YWNoKGNvbXBvbmVudCwgcHJvcGVydGllcykge1xuXHR0aGlzLmVtcHR5KCk7XG5cdHJldHVybiB0aGlzLmFwcGVuZChjb21wb25lbnQsIHByb3BlcnRpZXMpO1xufTtcbiIsIi8qKlxuICogcmVnaW9uLmVtcHR5KCApXG4gKlxuICogSXRlcmF0ZSBvdmVyIGVhY2ggY29tcG9uZW50IGluIHRoaXMgcmVnaW9uIGFuZCBjYWxsIC5jbG9zZSgpIG9uIGl0XG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBlbXB0eSgpIHtcblx0RlJBTUVXT1JLLmRlYnVnKHRoaXMucGFyZW50LmlkICsgJyA6OiBFbXB0eWluZyByZWdpb246ICcgKyB0aGlzLmlkKTtcblx0d2hpbGUgKHRoaXMuX2NoaWxkcmVuLmxlbmd0aCA+IDApIHtcblx0XHR0aGlzLnJlbW92ZSgwKTtcblx0fVxufTtcbiIsIi8qKlxuICogRmFjdG9yeSBtZXRob2QgdG8gZ2VuZXJhdGUgYSBuZXcgcmVnaW9uIGluc3RhbmNlIGZyb20gYSBET00gZWxlbWVudFxuICogSW1wbGVtZW50cyBgdGVtcGxhdGVgLCBgY291bnRgLCBhbmQgYGRhdGEtKmAgSFRNTCBhdHRyaWJ1dGVzLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gKiBAcmV0dXJucyByZWdpb24gaW5zdGFuY2VcbiAqL1xuXG52YXIgVXRpbHMgPSByZXF1aXJlKCcuLi91dGlscy91dGlscycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZyb21FbGVtZW50KGVsLCBwYXJlbnQpIHtcblxuXHQvLyBJZiBwYXJlbnQgaXMgbm90IHNwZWNpZmllZCwgbWFrZS1iZWxpZXZlLlxuXHRwYXJlbnQgPSBwYXJlbnQgfHwgeyBpZDogJyonIH07XG5cblxuXG5cdC8vIEJ1aWxkIHJlZ2lvblxuXHR2YXIgcmVnaW9uID0gbmV3IEZSQU1FV09SSy5SZWdpb24oe1xuXHRcdGlkOiBVdGlscy5lbDJpZChlbCksXG5cdFx0JGVsOiAkKGVsKSxcblx0XHRwYXJlbnQ6IHBhcmVudFxuXHR9KTtcblxuXHQvLyBJZiB0aGlzIHJlZ2lvbiBoYXMgYSBkZWZhdWx0IGNvbXBvbmVudC90ZW1wbGF0ZSBzZXQsXG5cdC8vIGdyYWIgdGhlIGlkICAtLSAgZS5nLiA8cmVnaW9uIGNvbnRlbnRzPVwiRm9vXCIgLz5cblx0dmFyIGNvbXBvbmVudElkID0gJChlbCkuYXR0cignY29udGVudHMnKTtcblxuXG5cdC8vIElmIGBjb3VudGAgaXMgc2V0LCByZW5kZXIgc3ViLWNvbXBvbmVudCBzcGVjaWZpZWQgbnVtYmVyIG9mIHRpbWVzLlxuXHQvLyBlLmcuIDxyZWdpb24gdGVtcGxhdGU9XCJGb29cIiBjb3VudD1cIjNcIiAvPlxuXHQvLyAodmVyaWZ5IEZSQU1FV09SSy5zaG9ydGN1dC5jb3VudCBpcyBlbmFibGVkKVxuXHR2YXIgY291bnRBdHRyLFxuXHRcdFx0Y291bnQgPSAxO1xuXG5cdGlmIChGUkFNRVdPUksub3B0aW9ucy5zaG9ydGN1dC5jb3VudCkge1xuXG5cdFx0Ly8gSWYgYGNvdW50YCBhdHRyaWJ1dGUgaXMgbm90IGZhbHNlIG9yIHVuZGVmaW5lZCxcblx0XHQvLyB0aGF0IG1lYW5zIGl0IHdhcyBzZXQgZXhwbGljaXRseSwgYW5kIHdlIHNob3VsZCB1c2UgaXRcblx0XHRjb3VudEF0dHIgPSAkKGVsKS5hdHRyKCdjb3VudCcpO1xuXHRcdC8vIEZSQU1FV09SSy5kZWJ1ZygnQ291bnQgYXR0ciBpcyA6OiAnLCBjb3VudEF0dHIpO1xuXHRcdGlmICghIWNvdW50QXR0cikge1xuXHRcdFx0Y291bnQgPSBjb3VudEF0dHI7XG5cdFx0fVxuXHR9XG5cblxuXHRGUkFNRVdPUksuZGVidWcoXG5cdFx0cGFyZW50LmlkICsgJyA6LTogSW5zdGFudGlhdGVkwqBuZXcgcmVnaW9uJyArXG5cdFx0KCByZWdpb24uaWQgPyAnIGAnICsgcmVnaW9uLmlkICsgJ2AnIDogJycgKSArXG5cdFx0KCBjb21wb25lbnRJZCA/ICcgYW5kIHBvcHVsYXRlZCBpdCB3aXRoJyArXG5cdFx0XHQoIGNvdW50ID4gMSA/IGNvdW50ICsgJyBpbnN0YW5jZXMgb2YnIDogJyAxJyApICtcblx0XHRcdCcgYCcgKyBjb21wb25lbnRJZCArICdgJyA6ICcnXG5cdFx0KSArICcuJ1xuXHQpO1xuXG5cblxuXHQvLyBBcHBlbmQgc3ViLWNvbXBvbmVudChzKSB0byByZWdpb24gYXV0b21hdGljYWxseVxuXHQvLyAodmVyaWZ5IEZSQU1FV09SSy5zaG9ydGN1dC50ZW1wbGF0ZSBpcyBlbmFibGVkKVxuXHRpZiAoIEZSQU1FV09SSy5vcHRpb25zLnNob3J0Y3V0LnRlbXBsYXRlICYmIGNvbXBvbmVudElkICkge1xuXG5cdFx0Ly8gRlJBTUVXT1JLLmRlYnVnKFxuXHRcdC8vIFx0J1ByZXBhcmluZyB0byByZW5kZXIgJyArIGNvdW50ICsgJyAnICsgY29tcG9uZW50SWQgKyAnIGNvbXBvbmVudHMgaW50byByZWdpb24gJyArXG5cdFx0Ly8gXHQnKCcgKyByZWdpb24uaWQgKyAnKSwgd2hpY2ggYWxyZWFkeSBjb250YWlucyAnICsgcmVnaW9uLiRlbC5jaGlsZHJlbigpLmxlbmd0aCArXG5cdFx0Ly8gXHQnIHN1YmNvbXBvbmVudHMuJ1xuXHRcdC8vICk7XG5cblx0XHRyZWdpb24uYXBwZW5kKGNvbXBvbmVudElkKTtcblxuXHRcdC8vIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXHRcdC8vIC8vIFNFUklPVVNMWSBXVEZcblx0XHQvLyAvLyBNQUpPUiBIQVhYWFhYWFhcblx0XHQvLyAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblx0XHQvLyBjb3VudCA9ICtjb3VudCArIDE7XG5cdFx0Ly8gLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cblx0XHQvLyBmb3IgKHZhciBqPTA7IGogPCBjb3VudDsgaisrICkge1xuXG5cdFx0Ly8gXHRyZWdpb24uYXBwZW5kKGNvbXBvbmVudElkKTtcblxuXHRcdC8vIFx0Ly8gRlJBTUVXT1JLLmRlYnVnKFxuXHRcdC8vIFx0Ly8gXHQncmVuZGVyaW5nIHRoZSAnICsgY29tcG9uZW50SWQgKyAnIGNvbXBvbmVudCwgcmVtYWluaW5nOiAnICtcblx0XHQvLyBcdC8vIFx0Y291bnQgKyAnIGFuZCB0aGVyZSBhcmUgJyArIHJlZ2lvbi4kZWwuY2hpbGRyZW4oKS5sZW5ndGggK1xuXHRcdC8vIFx0Ly8gXHQnIHN1YmNvbXBvbmVudCBlbGVtZW50cyBpbiB0aGUgcmVnaW9uIG5vdydcblx0XHQvLyBcdC8vICk7XG5cblx0XHQvLyB9XG5cblx0fVxuXG5cdHJldHVybiByZWdpb247XG59O1xuIiwiLyoqXG4gKiBSZWdpb25zXG4gKi9cblxudmFyIGluc2VydCA9IHJlcXVpcmUoJy4vaW5zZXJ0Jyk7XG52YXIgcmVtb3ZlID0gcmVxdWlyZSgnLi9yZW1vdmUnKTtcbnZhciBlbXB0eSA9IHJlcXVpcmUoJy4vZW1wdHknKTtcbnZhciBhcHBlbmQgPSByZXF1aXJlKCcuL2FwcGVuZCcpO1xudmFyIGF0dGFjaCA9IHJlcXVpcmUoJy4vYXR0YWNoJyk7XG52YXIgZnJvbUVsZW1lbnQgPSByZXF1aXJlKCcuL2Zyb21FbGVtZW50Jyk7XG5cblJlZ2lvbiA9IG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcmVnaW9uKHByb3BlcnRpZXMpIHtcblxuXHRfLmV4dGVuZCh0aGlzLCBGUkFNRVdPUksuRXZlbnRzKTtcblxuXHRpZiAoIXByb3BlcnRpZXMpIHtcblx0XHRwcm9wZXJ0aWVzID0ge307XG5cdH1cblx0aWYgKCFwcm9wZXJ0aWVzLiRlbCkge1xuXHRcdHRocm93IG5ldyBFcnJvcignVHJ5aW5nIHRvIGluc3RhbnRpYXRlIHJlZ2lvbiB3aXRoIG5vICRlbCEnKTtcblx0fVxuXG5cdC8vIEZvbGQgaW4gcHJvcGVydGllcyB0byBwcm90b3R5cGVcblx0Xy5leHRlbmQodGhpcywgcHJvcGVydGllcyk7XG5cblx0Ly8gSWYgbmVpdGhlciBhbiBpZCBub3IgYSBgdGVtcGxhdGVgIHdhcyBzcGVjaWZpZWQsXG5cdC8vIHdlJ2xsIHRocm93IGFuIGVycm9yLCBzaW5jZSB0aGVyZSdzIG5vIHdheSB0byBnZXQgYSBob2xkIG9mIHRoZSByZWdpb25cblx0aWYgKCF0aGlzLmlkICYmICEodGhpcy4kZWwuYXR0cignZGVmYXVsdCcpIHx8IHRoaXMuJGVsLmF0dHIoJ3RlbXBsYXRlJykgfHxcblx0XHR0aGlzLiRlbC5hdHRyKCdjb250ZW50cycpKSkge1xuXG5cdFx0dGhyb3cgbmV3IEVycm9yKFxuXHRcdFx0dGhpcy5wYXJlbnQuaWQgKyAnIDo6IEVpdGhlciBgZGF0YS1pZGAsIGBjb250ZW50c2AsIG9yIGJvdGggJyArXG5cdFx0XHQnbXVzdCBiZSBzcGVjaWZpZWQgb24gcmVnaW9ucy4gXFxuJyArXG5cdFx0XHQnZS5nLiA8cmVnaW9uIGRhdGEtaWQ9XCJmb29cIiB0ZW1wbGF0ZT1cIlNvbWVDb21wb25lbnRcIj48L3JlZ2lvbj4nXG5cdFx0KTtcblx0fVxuXG5cdC8vIFNldCB1cCBsaXN0IHRvIGhvdXNlIGNoaWxkIGNvbXBvbmVudHNcblx0dGhpcy5fY2hpbGRyZW4gPSBbXTtcblxuXHRfLmJpbmRBbGwodGhpcyk7XG5cblx0Ly8gU2V0IHVwIGNvbnZlbmllbmNlIGFjY2VzcyB0byB0aGlzIHJlZ2lvbiBpbiB0aGUgZ2xvYmFsIHJlZ2lvbiBjYWNoZVxuXHRGUkFNRVdPUksucmVnaW9uc1t0aGlzLmlkXSA9IHRoaXM7XG59O1xuXG5SZWdpb24uZnJvbUVsZW1lbnQgPSBmdW5jdGlvbihlbCwgcGFyZW50KSB7XG5cdHJldHVybiBmcm9tRWxlbWVudChlbCwgcGFyZW50KTtcbn07XG5SZWdpb24ucHJvdG90eXBlLnJlbW92ZSA9IGZ1bmN0aW9uKGF0SW5kZXgpIHtcblx0cmV0dXJuIHJlbW92ZS5jYWxsKHRoaXMsIGF0SW5kZXgpO1xufTtcblJlZ2lvbi5wcm90b3R5cGUuZW1wdHkgPSBmdW5jdGlvbigpIHtcblx0cmV0dXJuIGVtcHR5LmNhbGwodGhpcyk7XG59O1xuUmVnaW9uLnByb3RvdHlwZS5pbnNlcnQgPSBmdW5jdGlvbihhdEluZGV4LCBjb21wb25lbnRJZCwgcHJvcGVydGllcykge1xuXHRyZXR1cm4gaW5zZXJ0LmNhbGwodGhpcywgYXRJbmRleCwgY29tcG9uZW50SWQsIHByb3BlcnRpZXMpO1xufTtcblJlZ2lvbi5wcm90b3R5cGUuYXBwZW5kID0gZnVuY3Rpb24oY29tcG9uZW50SWQsIHByb3BlcnRpZXMpIHtcblx0cmV0dXJuIGFwcGVuZC5jYWxsKHRoaXMsIGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKTtcbn07XG5SZWdpb24ucHJvdG90eXBlLmF0dGFjaCA9IGZ1bmN0aW9uKGNvbXBvbmVudCwgcHJvcGVydGllcykge1xuXHRyZXR1cm4gYXR0YWNoLmNhbGwodGhpcywgY29tcG9uZW50LCBwcm9wZXJ0aWVzKTtcbn07XG4iLCIvKipcbiAqIHJlZ2lvbi5pbnNlcnQoIGF0SW5kZXgsIGNvbXBvbmVudElkLCBbcHJvcGVydGllc10gKVxuICpcbiAqIFRPRE86IHN1cHBvcnQgYSBsaXN0IG9mIHByb3BlcnRpZXMgb2JqZWN0cyBpbiBsaWV1IG9mIHRoZSBwcm9wZXJ0aWVzIG9iamVjdFxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaW5zZXJ0KGF0SW5kZXgsIGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKSB7XG5cblx0dmFyIGVyciA9ICcnO1xuXHRpZiAoIShhdEluZGV4IHx8IF8uaXNGaW5pdGUoYXRJbmRleCkpKSB7XG5cdFx0ZXJyICs9IHRoaXMuaWQgKyAnLmluc2VydCgpIDo6IE5vIGF0SW5kZXggc3BlY2lmaWVkISc7XG5cdH1cblx0ZWxzZSBpZiAoIWNvbXBvbmVudElkKSB7XG5cdFx0ZXJyICs9IHRoaXMuaWQgKyAnLmluc2VydCgpIDo6IE5vIGNvbXBvbmVudElkIHNwZWNpZmllZCEnO1xuXHR9XG5cdGlmIChlcnIpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoZXJyICsgJ1xcblVzYWdlOiBhcHBlbmQoYXRJbmRleCwgY29tcG9uZW50SWQsIFtwcm9wZXJ0aWVzXSknKTtcblx0fVxuXG5cdHZhciBjb21wb25lbnQ7XG5cdC8vIElmIGNvbXBvbmVudElkIGlzIGEgc3RyaW5nLCBsb29rIHVwIGNvbXBvbmVudCBwcm90b3R5cGUgYW5kIGluc3RhdGlhdGVcblx0aWYgKCdzdHJpbmcnID09IHR5cGVvZiBjb21wb25lbnRJZCkge1xuXG5cdFx0dmFyIGNvbXBvbmVudFByb3RvdHlwZSA9IEZSQU1FV09SSy5jb21wb25lbnRzW2NvbXBvbmVudElkXTtcblxuXHRcdGlmICghY29tcG9uZW50UHJvdG90eXBlKSB7XG5cdFx0XHR2YXIgdGVtcGxhdGUgPSBGUkFNRVdPUksudGVtcGxhdGVzW2NvbXBvbmVudElkXTtcblx0XHRcdGlmICghdGVtcGxhdGUpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yICgnSW4gJyArXG5cdFx0XHRcdFx0KHRoaXMuaWQgfHwgJ0Fub255bW91cyByZWdpb24nKSArICc6OiBUcnlpbmcgdG8gYXR0YWNoICcgK1xuXHRcdFx0XHRcdGNvbXBvbmVudElkICsgJywgYnV0IG5vIGNvbXBvbmVudCBvciB0ZW1wbGF0ZSBleGlzdHMgd2l0aCB0aGF0IGlkLicpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZiBubyBjb21wb25lbnQgcHJvdG90eXBlIHdpdGggdGhpcyBpZCBleGlzdHMsXG5cdFx0XHQvLyBjcmVhdGUgYW4gYW5vbnltb3VzIG9uZSB0byB1c2Vcblx0XHRcdGNvbXBvbmVudFByb3RvdHlwZSA9IEZSQU1FV09SSy5Db21wb25lbnQuZXh0ZW5kKHtcblx0XHRcdFx0aWQ6IGNvbXBvbmVudElkLFxuXHRcdFx0XHR0ZW1wbGF0ZTogdGVtcGxhdGVcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIEluc3RhbnRpYXRlIGFuZCByZW5kZXIgdGhlIGNvbXBvbmVudCBpbnNpZGUgdGhpcyByZWdpb25cblx0XHRjb21wb25lbnQgPSBuZXcgY29tcG9uZW50UHJvdG90eXBlKF8uZXh0ZW5kKHtcblx0XHRcdCRvdXRsZXQ6IHRoaXMuJGVsXG5cdFx0fSwgcHJvcGVydGllcyB8fCB7fSkpO1xuXG5cblx0fVxuXG5cdC8vIE90aGVyd2lzZSBhc3N1bWUgYW4gaW5zdGFudGlhdGVkIGNvbXBvbmVudCBvYmplY3Qgd2FzIHNlbnRcblx0LyogVE9ETzogQ2hlY2sgdGhhdCBjb21wb25lbnQgb2JqZWN0IGlzIHZhbGlkICovXG5cdGVsc2Uge1xuXHRcdGNvbXBvbmVudCA9IGNvbXBvbmVudElkO1xuXHRcdGNvbXBvbmVudC4kb3V0bGV0ID0gdGhpcy4kZWw7XG5cdH1cblxuXHQvLyBTYXZlIHJlZmVyZW5jZSB0byBwYXJlbnRSZWdpb25cblx0Y29tcG9uZW50LnBhcmVudFJlZ2lvbiA9IHRoaXM7XG5cblx0Ly8gUmVuZGVyIGNvbXBvbmVudCBpbnRvIHRoaXMgcmVnaW9uXG5cdGNvbXBvbmVudC5yZW5kZXIoYXRJbmRleCk7XG5cblx0Ly8gQW5kIGtlZXAgdHJhY2sgb2YgaXQgaW4gdGhlIGxpc3Qgb2YgdGhpcyByZWdpb24ncyBjaGlsZHJlblxuXHR0aGlzLl9jaGlsZHJlbi5zcGxpY2UoYXRJbmRleCwgMCwgY29tcG9uZW50KTtcblxuXHQvLyBMb2cgZm9yIGRlYnVnZ2luZyBgY291bnRgIGRlY2xhcmF0aXZlXG5cdHZhciBkZWJ1Z1N0ciA9IHRoaXMucGFyZW50LmlkICsgJyA6OiBJbnNlcnRlZCAnICsgY29tcG9uZW50SWQgKyAnIGludG8gJztcblx0aWYgKHRoaXMuaWQpIGRlYnVnU3RyICs9ICdyZWdpb246ICcgKyB0aGlzLmlkICsgJyBhdCBpbmRleCAnICsgYXRJbmRleDtcblx0ZWxzZSBkZWJ1Z1N0ciArPSAnYW5vbnltb3VzIHJlZ2lvbiBhdCBpbmRleCAnICsgYXRJbmRleDtcblx0RlJBTUVXT1JLLnZlcmJvc2UoZGVidWdTdHIpO1xuXG5cdHJldHVybiBjb21wb25lbnQ7XG5cbn07XG4iLCIvKipcbiAqIHJlZ2lvbi5yZW1vdmUoIGF0SW5kZXggKVxuICpcbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByZW1vdmUoYXRJbmRleCkge1xuXG5cdGlmICghYXRJbmRleCAmJiAhXy5pc0Zpbml0ZShhdEluZGV4KSkge1xuXHRcdHRocm93IG5ldyBFcnJvcih0aGlzLmlkICsgJy5yZW1vdmUoKSA6OiBObyBhdEluZGV4IHNwZWNpZmllZCEgXFxuVXNhZ2U6IHJlbW92ZShhdEluZGV4KScpO1xuXHR9XG5cblx0Ly8gUmVtb3ZlIHRoZSBjb21wb25lbnQgZnJvbSB0aGUgbGlzdFxuXHR2YXIgY29tcG9uZW50ID0gdGhpcy5fY2hpbGRyZW4uc3BsaWNlKGF0SW5kZXgsIDEpO1xuXHRpZiAoIWNvbXBvbmVudFswXSkge1xuXG5cdFx0Ly8gSWYgdGhlIGxpc3QgaXMgZW1wdHksIGZyZWFrIG91dFxuXHRcdHRocm93IG5ldyBFcnJvcih0aGlzLmlkICsgJy5yZW1vdmUoKSA6OiBUcnlpbmcgdG8gcmVtb3ZlIGEgY29tcG9uZW50IHRoYXQgZG9lc25cXCd0IGV4aXN0IGF0IGluZGV4ICcgKyBhdEluZGV4KTtcblx0fVxuXG5cdC8vIFNxdWVlemUgdGhlIGNvbXBvbmVudCB0byBkbyBnZXQgYWxsIHRoZSBiaW5keSBnb29kbmVzcyBvdXRcblx0Y29tcG9uZW50WzBdLmNsb3NlKCk7XG5cblx0RlJBTUVXT1JLLmRlYnVnKHRoaXMucGFyZW50LmlkICsgJyA6OiBSZW1vdmVkIGNvbXBvbmVudCBhdCBpbmRleCAnICsgYXRJbmRleCArICcgZnJvbSByZWdpb246ICcgKyB0aGlzLmlkKTtcbn07XG4iLCIvKipcbiAqIFNldHMgdXAgdGhlIEZSQU1FV09SSyByb3V0ZXIuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcm91dGVyU2V0dXAoKSB7XG5cblx0Ly8gV2lsZGNhcmQgcm91dGVzIHRvIGdsb2JhbCBldmVudCBkZWxlZ2F0b3Jcblx0dmFyIHJvdXRlciA9IG5ldyBGUkFNRVdPUksuUm91dGVyKCk7XG5cdHJvdXRlci5yb3V0ZSgvKC4qKS8sICdyb3V0ZScsIGZ1bmN0aW9uIChyb3V0ZSkge1xuXG5cdFx0Ly8gTm9ybWFsaXplIGhvbWUgcm91dGVzICgjIG9yIG51bGwpIHRvICcnXG5cdFx0aWYgKCFyb3V0ZSkge1xuXHRcdFx0cm91dGUgPSAnJztcblx0XHR9XG5cblx0XHQvLyBUcmlnZ2VyIHJvdXRlXG5cdFx0RlJBTUVXT1JLLnRyaWdnZXIoJyMnICsgcm91dGUpO1xuXHR9KTtcblxuXHQvLyBFeHBvc2UgYG5hdmlnYXRlKClgIG1ldGhvZFxuXHRGUkFNRVdPUksubmF2aWdhdGUgPSBGUkFNRVdPUksuaGlzdG9yeS5uYXZpZ2F0ZTtcbn1cbiIsIi8qKlxuICogQmFyZS1ib25lcyBET00vVUkgdXRpbGl0aWVzXG4gKi9cblxudmFyIEV2ZW50cyA9IHJlcXVpcmUoJy4vZXZlbnRzJyk7XG5cbnZhciBET00gPSB7XG5cblx0LyoqXG5cdCAqIEV4cG9zZSB0aGUgXCJET01teS1ldmVudGVkbmVzc1wiIG9mIGVsZW1lbnRzIHNvIHRoYXQgaXQncyBzZWxlY3RhYmxlIHZpYSBDU1Ncblx0ICogWW91IGNhbiB1c2UgdGhpcyB0byBhcHBseSBhIGZldyBjaG9pY2UgRE9NIG1vZGlmaWNhdGlvbnMgb3V0IHRoZSBnYXRlLS1cblx0ICogKGUuZy4gdHdlYWtzIHRhcmdldGluZyBjb21tb24gaXNzdWVzIHRoYXQgdHlwaWNhbGx5IGdldCBmb3Jnb3R0ZW4sIGxpa2UgZGlzYWJsaW5nIHRleHQgc2VsZWN0aW9uKVxuXHQgKlxuXHQgKiBAcGFyYW0ge0NvbXBvbmVudH0gY29tcG9uZW50XG5cdCAqL1xuXHRmbGFnQm91bmRFdmVudHM6IGZ1bmN0aW9uICggY29tcG9uZW50ICkge1xuXG5cdFx0Ly8gVE9ETzogcHJvdmlkZSBhY2Nlc3MgdG8gYm91bmQgZ2xvYmFsIGV2ZW50cyAoJSkgYW5kIHJvdXRlcyAoIykgYXMgd2VsbFxuXHRcdC8vIFRPRE86IGZsYWcgYWxsIERPTSBldmVudHMsIG5vdCBqdXN0IGNsaWNrIGFuZCB0b3VjaFxuXG5cdFx0Ly8gQnVpbGQgc3Vic2V0IG9mIGp1c3QgdGhlIGNsaWNrL3RvdWNoIGV2ZW50c1xuXHRcdHZhciBjbGlja09yVG91Y2hFdmVudHMgPSBFdmVudHMucGFyc2UoXG5cdFx0XHRjb21wb25lbnQuZXZlbnRzLFxuXHRcdFx0eyBvbmx5OiBbJ2NsaWNrJywgJ3RvdWNoJywgJ3RvdWNoc3RhcnQnLCAndG91Y2hlbmQnXSB9XG5cdFx0KTtcblxuXHRcdC8vIElmIG5vIGNsaWNrL3RvdWNoIGV2ZW50cyBmb3VuZCwgYmFpbCBvdXRcblx0XHRpZiAoIGNsaWNrT3JUb3VjaEV2ZW50cy5sZW5ndGggPCAxICkgcmV0dXJuO1xuXG5cdFx0Ly8gUXVlcnkgYWZmZWN0ZWQgZWxlbWVudHMgZnJvbSBET01cblx0XHR2YXIgJGFmZmVjdGVkID0gRXZlbnRzLmdldEVsZW1lbnRzKGNsaWNrT3JUb3VjaEV2ZW50cywgY29tcG9uZW50KTtcblxuXHRcdC8vIE5PVEU6IEZvciBub3csIHRoaXMgaXMgYWx3YXlzIGp1c3QgJ2NsaWNrJ1xuXHRcdHZhciBib3VuZEV2ZW50c1N0cmluZyA9ICdjbGljayc7XG5cblx0XHQvLyBTZXQgYGRhdGEtRlJBTUVXT1JLLWNsaWNrYWJsZWAgY3VzdG9tIGF0dHJpYnV0ZVxuXHRcdC8vICh1aSBsb2dpYyBzaG91bGQgYmUgZXh0ZW5kZWQgaW4gQ1NTKVxuXHRcdCRhZmZlY3RlZC5hdHRyKCdkYXRhLScgKyBGUkFNRVdPUksub3B0aW9ucy5mcmFtZXdvcmtJZCArICctZXZlbnRzJywgYm91bmRFdmVudHNTdHJpbmcpO1xuXG5cdFx0RlJBTUVXT1JLLnZlcmJvc2UoXG5cdFx0XHRjb21wb25lbnQuaWQgKyAnIDo6ICcgK1xuXHRcdFx0J0Rpc2FibGVkIHVzZXIgdGV4dCBzZWxlY3Rpb24gb24gZWxlbWVudHMgdy8gY2xpY2svdG91Y2ggZXZlbnRzOicsXG5cdFx0XHRjbGlja09yVG91Y2hFdmVudHMsXG5cdFx0XHQkYWZmZWN0ZWRcblx0XHQpO1xuXHR9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IERPTTtcbiIsIi8qKlxuICogVXRpbGl0eSBFdmVudCB0b29sa2l0XG4gKi9cblxudmFyIFV0aWxzID0gcmVxdWlyZSgnLi91dGlscy5qcycpO1xuXG52YXIgRXZlbnRzID0ge1xuXG5cdC8qKlxuXHQgKiBQYXJzZXMgYSBkaWN0aW9uYXJ5IG9mIGV2ZW50cyBhbmQgb3B0aW9uYWxseSBmaWx0ZXJzIGJ5IHRoZSBldmVudCB0eXBlLiBJZiB0aGUgZXZlbnRcblx0ICpcblx0ICogQHBhcmFtICB7T2JqZWN0fSBldmVudHMgIFtBIEJhY2tib25lLlZpZXcgZXZlbnRzIG9iamVjdF1cblx0ICogQHBhcmFtICB7T2JqZWN0fSBvcHRpb25zIFtPcHRpb25zIG9iamVjdCB0aGF0IGFsbG93cyB1cyB0byBmaWx0ZXIgcGFyc2luZyB0byBjZXJ0YWluIGV2ZW50XG5cdCAqICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZXNdXG5cdCAqXG5cdCAqIEByZXR1cm4ge0FycmF5fSAgICAgICAgICBbQXJyYXkgY29udGFpbmluZyBwYXJzZWRFdmVudHMgdGhhdCBhcmUgbWF0Y2hpbmcgZXZlbnQga2V5c11cblx0ICovXG5cdHBhcnNlOiBmdW5jdGlvbiAoZXZlbnRzLCBvcHRpb25zKSB7XG5cblx0XHR2YXIgZXZlbnRLZXlzID0gXy5rZXlzKGV2ZW50cyB8fCB7fSksXG5cdFx0XHRsaW1pdEV2ZW50cyxcblx0XHRcdHBhcnNlZEV2ZW50cyA9IFtdO1xuXG5cdFx0Ly8gT3B0aW9uYWxseSBmaWx0ZXIgdXNpbmcgc2V0IG9mIGFjY2VwdGFibGUgZXZlbnQgdHlwZXNcblx0XHRsaW1pdEV2ZW50cyA9IG9wdGlvbnMub25seTtcblx0XHRldmVudEtleXMgPSBfLmZpbHRlcihldmVudEtleXMsIGZ1bmN0aW9uIGNoZWNrRXZlbnROYW1lIChldmVudEtleSkge1xuXG5cdFx0XHQvLyBQYXJzZSBldmVudCBzdHJpbmcgaW50byBzZW1hbnRpYyByZXByZXNlbnRhdGlvblxuXHRcdFx0dmFyIGV2ZW50ID0gRXZlbnRzLnBhcnNlRE9NRXZlbnQoZXZlbnRLZXkpO1xuXHRcdFx0cGFyc2VkRXZlbnRzLnB1c2goZXZlbnQpO1xuXG5cdFx0XHQvLyBPcHRpb25hbCBmaWx0ZXJcblx0XHRcdGlmIChsaW1pdEV2ZW50cykge1xuXHRcdFx0XHRyZXR1cm4gXy5jb250YWlucyhsaW1pdEV2ZW50cywgZXZlbnQubmFtZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBwYXJzZWRFdmVudHM7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFtnZXRFbGVtZW50cyBkZXNjcmlwdGlvbl1cblx0ICpcblx0ICogQHBhcmFtICB7QXJyYXl9IHNlbWFudGljRXZlbnRzIFtBIGxpc3Qgb2YgcGFyc2VkIGV2ZW50IG9iamVjdHNdXG5cdCAqIEBwYXJhbSAge0NvbXBvbmVudH0gY29udGV4dCAgICBbSW5zdGFuY2Ugb2YgYSBjb21wb25lbnQgdG8gdXNlIGFzIGEgc3RhcnRpbmcgcG9pbnQgZm9yXG5cdCAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhlIERPTSBxdWVyaWVzXVxuXHQgKlxuXHQgKiBAcmV0dXJuIHtBcnJheX0gICAgICAgICAgICAgICAgW0FuIGFycmF5IG9mIGpRdWVyeSBzZXQgb2YgbWF0Y2hlZCBlbGVtZW50c11cblx0ICovXG5cdGdldEVsZW1lbnRzOiBmdW5jdGlvbiAoc2VtYW50aWNFdmVudHMsIGNvbnRleHQpIHtcblxuXHRcdC8vIENvbnRleHQgb3B0aW9uYWxcblx0XHRjb250ZXh0ID0gY29udGV4dCB8fCB7ICQ6ICQgfTtcblxuXHRcdC8vIEl0ZXJhdGl2ZWx5IGJ1aWxkIGEgc2V0IG9mIGFmZmVjdGVkIGVsZW1lbnRzXG5cdFx0dmFyICRhZmZlY3RlZCA9ICQoKTtcblx0XHRfLmVhY2goc2VtYW50aWNFdmVudHMsIGZ1bmN0aW9uIGxvb2t1cEVsZW1lbnRzRm9yRXZlbnQgKGV2ZW50KSB7XG5cblx0XHRcdC8vIERldGVybWluZSBtYXRjaGVkIGVsZW1lbnRzXG5cdFx0XHQvLyBVc2UgZGVsZWdhdGUgc2VsZWN0b3IgaWYgc3BlY2lmaWVkXG5cdFx0XHQvLyBPdGhlcndpc2UsIGdyYWIgdGhlIGVsZW1lbnQgZm9yIHRoaXMgY29tcG9uZW50XG5cdFx0XHR2YXIgJG1hdGNoZWQgPVx0ZXZlbnQuc2VsZWN0b3IgP1xuXHRcdFx0XHRcdFx0XHRjb250ZXh0LiQoZXZlbnQuc2VsZWN0b3IpIDpcblx0XHRcdFx0XHRcdFx0Y29udGV4dC4kZWw7XG5cblx0XHRcdC8vIEFkZCBtYXRjaGVkIGVsZW1lbnRzIHRvIHNldFxuXHRcdFx0JGFmZmVjdGVkID0gJGFmZmVjdGVkLmFkZCggJG1hdGNoZWQgKTtcblx0XHR9LCB0aGlzKTtcblxuXHRcdHJldHVybiAkYWZmZWN0ZWQ7XG5cdH0sXG5cblxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHdoZXRoZXIgdGhlIHNwZWNpZmllZCBldmVudCBrZXkgbWF0Y2hlcyBhIERPTSBldmVudC5cblx0ICpcblx0ICogQHBhcmFtICB7U3RyaW5nfSBrZXkgW0tleSB0byBtYXRjaCBhZ2FpbnN0XVxuXHQgKlxuXHQgKiBpZiBubyBtYXRjaCBpcyBmb3VuZFxuXHQgKiBAcmV0dXJuIHtCb29sZWFufSBcdFx0W3JldHVybiBgZmFsc2VgXVxuXHQgKlxuXHQgKiBvdGhlcndpc2Vcblx0ICogQHJldHVybiB7T2JqZWN0fSAgXHRcdFtPYmplY3QgY29udGFpbmluZyB0aGUgYG5hbWVgIG9mIHRoZSBET00gZWxlbWVudCBhbmQgdGhlIGBzZWxlY3RvcmBdXG5cdCAqL1xuXHRwYXJzZURPTUV2ZW50OiBfLm1lbW9pemUoZnVuY3Rpb24oa2V5KSB7XG5cblx0XHR2YXIgbWF0Y2hlcyA9IGtleS5tYXRjaCh0aGlzWycvRE9NRXZlbnQvJ10pO1xuXG5cdFx0aWYgKCFtYXRjaGVzIHx8ICFtYXRjaGVzWzFdKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdG5hbWU6IG1hdGNoZXNbMV0sXG5cdFx0XHRzZWxlY3RvcjogbWF0Y2hlc1szXVxuXHRcdH07XG5cdH0pLFxuXG5cblx0LyoqXG5cdCAqIFN1cHBvcnRlZCBcImZpcnN0LWNsYXNzXCIgRE9NIGV2ZW50cy5cblx0ICogQHR5cGUge0FycmF5fVxuXHQgKi9cblx0bmFtZXM6IFtcblxuXHRcdC8vIExvY2FsaXplZCBicm93c2VyIGV2ZW50c1xuXHRcdC8vICh3b3JrcyBvbiBpbmRpdmlkdWFsIGVsZW1lbnRzKVxuXHRcdCdlcnJvcicsICdzY3JvbGwnLFxuXG5cdFx0Ly8gTW91c2UgZXZlbnRzXG5cdFx0J2NsaWNrJywgJ2RibGNsaWNrJywgJ21vdXNlZG93bicsICdtb3VzZXVwJywgJ2hvdmVyJywgJ21vdXNlZW50ZXInLCAnbW91c2VsZWF2ZScsXG5cdFx0J21vdXNlb3ZlcicsICdtb3VzZW91dCcsICdtb3VzZW1vdmUnLFxuXG5cdFx0Ly8gS2V5Ym9hcmQgZXZlbnRzXG5cdFx0J2tleWRvd24nLCAna2V5dXAnLCAna2V5cHJlc3MnLFxuXG5cdFx0Ly8gRm9ybSBldmVudHNcblx0XHQnYmx1cicsICdjaGFuZ2UnLCAnZm9jdXMnLCAnZm9jdXNpbicsICdmb2N1c291dCcsICdzZWxlY3QnLCAnc3VibWl0JyxcblxuXHRcdC8vIFJhdyB0b3VjaCBldmVudHNcblx0XHQndG91Y2hzdGFydCcsICd0b3VjaGVuZCcsICd0b3VjaG1vdmUnLCAndG91Y2hjYW5jZWwnLFxuXG5cdFx0Ly8gTWFudWZhY3R1cmVkIGV2ZW50c1xuXHRcdCd0b3VjaCcsXG5cblx0XHQvLyBUT0RPOlxuXHRcdCdyaWdodGNsaWNrJywgJ2NsaWNrb3V0c2lkZSdcblx0XVxufTtcblxuXG5cblxuLyoqXG4gKiBSZWdleHAgdG8gbWF0Y2ggXCJmaXJzdCBjbGFzc1wiIERPTSBldmVudHNcbiAqICh0aGVzZSBhcmUgYWxsb3dlZCBpbiB0aGUgdG9wIGxldmVsIG9mIGEgY29tcG9uZW50IGRlZmluaXRpb24gYXMgbWV0aG9kIGtleXMpXG4gKlx0XHRpLmUuIC9eKGNsaWNrfGhvdmVyfGJsdXJ8Zm9jdXMpKCAoLispKS9cbiAqXHRcdFx0WzFdID0+IGV2ZW50IG5hbWVcbiAqXHRcdFx0WzNdID0+IHNlbGVjdG9yXG4gKi9cblxuRXZlbnRzWycvRE9NRXZlbnQvJ10gPSBuZXcgUmVnRXhwKCdeKCcgKyBfLnJlZHVjZShFdmVudHMubmFtZXMsXG5cdGZ1bmN0aW9uIGJ1aWxkUmVnZXhwKG1lbW8sIGV2ZW50TmFtZSwgaW5kZXgpIHtcblxuXHRcdC8vIE9taXQgYHxgIHRoZSBmaXJzdCB0aW1lXG5cdFx0aWYgKGluZGV4ID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gbWVtbyArIGV2ZW50TmFtZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbWVtbyArICd8JyArIGV2ZW50TmFtZTtcblx0fSwgJycpICtcbicpKCAoLispKT8kJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gRXZlbnRzO1xuIiwiLyoqXG4gKiBUcmFuc2xhdGUgKipyaWdodC1oYW5kLXNpZGUgYWJicmV2aWF0aW9ucyoqIGludG8gZnVuY3Rpb25zIHRoYXQgcGVyZm9ybVxuICogdGhlIHByb3BlciBiZWhhdmlvcnMsIGUuZy5cbiAqXHRcdCNhYm91dF9tZVxuICpcdFx0JW1haW5NZW51Om9wZW5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHRyYW5zbGF0ZVNob3J0aGFuZCh2YWx1ZSwga2V5KSB7XG5cblx0dmFyIG1hdGNoZXMsIGZuO1xuXG5cdC8vIElmIHRoaXMgaXMgYW4gaW1wb3J0YW50LCBGUkFNRVdPUkstc3BlY2lmaWMgZGF0YSBrZXksXG5cdC8vIGFuZCBhIGZ1bmN0aW9uIHdhcyBzcGVjaWZpZWQsIHJ1biBpdCB0byBnZXQgaXRzIHZhbHVlXG5cdC8vICh0aGlzIGlzIHRvIGtlZXAgcGFyaXR5IHdpdGggQmFja2JvbmUncyBzaW1pbGFyIGZ1bmN0aW9uYWxpdHkpXG5cdGlmIChfLmlzRnVuY3Rpb24odmFsdWUpICYmIChrZXkgPT09ICdjb2xsZWN0aW9uJyB8fCBrZXkgPT09ICdtb2RlbCcpKSB7XG5cdFx0cmV0dXJuIHZhbHVlKCk7XG5cdH1cblxuXHQvLyBJZ25vcmUgb3RoZXIgbm9uLXN0cmluZ3Ncblx0aWYgKCFfLmlzU3RyaW5nKHZhbHVlKSkge1xuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxuXG5cdC8vIFJlZGlyZWN0cyB1c2VyIHRvIGNsaWVudC1zaWRlIFVSTCwgdy9vIGFmZmVjdGluZyBicm93c2VyIGhpc3Rvcnlcblx0Ly8gTGlrZSBjYWxsaW5nIGBCYWNrYm9uZS5oaXN0b3J5Lm5hdmlnYXRlKCcvZm9vJywgeyByZXBsYWNlOiB0cnVlIH0pYFxuXHRpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXiMjKC4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHRcdGZuID0gZnVuY3Rpb24gcmVkaXJlY3RBbmRDb3ZlclRyYWNrcygpIHtcblx0XHRcdHZhciB1cmwgPSBtYXRjaGVzWzFdO1xuXHRcdFx0RlJBTUVXT1JLLmhpc3RvcnkubmF2aWdhdGUodXJsLCB7XG5cdFx0XHRcdHRyaWdnZXI6IHRydWUsXG5cdFx0XHRcdHJlcGxhY2U6IHRydWVcblx0XHRcdH0pO1xuXHRcdH07XG5cdH1cblx0Ly8gTWV0aG9kIHRvIHJlZGlyZWN0IHVzZXIgdG8gYSBjbGllbnQtc2lkZSBVUkwsIHRoZW4gY2FsbCB0aGUgaGFuZGxlclxuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eIyguKlteLlxcc10rKS8pKSAmJiBtYXRjaGVzWzFdKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiBjaGFuZ2VVcmxGcmFnbWVudCgpIHtcblx0XHRcdHZhciB1cmwgPSBtYXRjaGVzWzFdO1xuXHRcdFx0RlJBTUVXT1JLLmhpc3RvcnkubmF2aWdhdGUodXJsLCB7XG5cdFx0XHRcdHRyaWdnZXI6IHRydWVcblx0XHRcdH0pO1xuXHRcdH07XG5cdH1cblx0Ly8gTWV0aG9kIHRvIHRyaWdnZXIgZ2xvYmFsIGV2ZW50XG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14oJS4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHRcdGZuID0gZnVuY3Rpb24gdHJpZ2dlckV2ZW50KCkge1xuXHRcdFx0dmFyIHRyaWdnZXIgPSBtYXRjaGVzWzFdO1xuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UodGhpcy5pZCArICcgOjogVHJpZ2dlcmluZyBldmVudCAoJyArIHRyaWdnZXIgKyAnKS4uLicpO1xuXHRcdFx0RlJBTUVXT1JLLnRyaWdnZXIodHJpZ2dlcik7XG5cdFx0fTtcblx0fVxuXHQvLyBNZXRob2QgdG8gZmlyZSBhIHRlc3QgYWxlcnRcblx0Ly8gKHVzZSBtZXNzYWdlLCBpZiBzcGVjaWZpZWQpXG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14hISFcXHMqKC4qW14uXFxzXSk/LykpKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiBiYW5nQWxlcnQoZSkge1xuXG5cdFx0XHQvLyBJZiBzcGVjaWZpZWQsIG1lc3NhZ2UgaXMgdXNlZCwgb3RoZXJ3aXNlICdBbGVydCB0cmlnZ2VyZWQhJ1xuXHRcdFx0dmFyIG1zZyA9IChtYXRjaGVzICYmIG1hdGNoZXNbMV0pIHx8ICdEZWJ1ZyBhbGVydCAoISEhKSB0cmlnZ2VyZWQhJztcblxuXHRcdFx0Ly8gT3RoZXIgZGlhZ25vc3RpYyBpbmZvcm1hdGlvblxuXHRcdFx0bXNnICs9ICdcXG5cXG5EaWFnbm9zdGljc1xcbj09PT09PT09PT09PT09PT09PT09PT09PVxcbic7XG5cdFx0XHRpZiAoZSAmJiBlLmN1cnJlbnRUYXJnZXQpIHtcblx0XHRcdFx0bXNnICs9ICdlLmN1cnJlbnRUYXJnZXQgOjogJyArIGUuY3VycmVudFRhcmdldDtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmlkKSB7XG5cdFx0XHRcdG1zZyArPSAndGhpcy5pZCA6OiAnICsgdGhpcy5pZDtcblx0XHRcdH1cblxuXHRcdFx0YWxlcnQobXNnKTtcblx0XHR9O1xuXHR9XG5cblx0Ly8gTWV0aG9kIHRvIGxvZyBhIG1lc3NhZ2UgdG8gdGhlIGNvbnNvbGVcblx0Ly8gKHVzZSBtZXNzYWdlLCBpZiBzcGVjaWZpZWQpXG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14+Pj5cXHMqKC4qW14uXFxzXSk/LykpKSB7XG5cblx0XHRmbiA9IGZ1bmN0aW9uIGxvZ01lc3NhZ2UoZSkge1xuXG5cdFx0XHQvLyBJZiBzcGVjaWZpZWQsIG1lc3NhZ2UgaXMgdXNlZCwgb3RoZXJ3aXNlIHVzZSBkZWZhdWx0XG5cdFx0XHR2YXIgbXNnID0gKG1hdGNoZXMgJiYgbWF0Y2hlc1sxXSkgfHwgJ0xvZyBtZXNzYWdlICg+Pj4pIHRyaWdnZXJlZCEnO1xuXHRcdFx0RlJBTUVXT1JLLmxvZyhtc2cpO1xuXHRcdH07XG5cdH1cblxuXHQvLyBNZXRob2QgdG8gYXR0YWNoIHRoZSBzcGVjaWZpZWQgY29tcG9uZW50L3RlbXBsYXRlIHRvIGEgcmVnaW9uXG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14oLispQCguKlteLlxcc10pLykpICYmIG1hdGNoZXNbMV0gJiYgbWF0Y2hlc1syXSkge1xuXHRcdGZuID0gZnVuY3Rpb24gYXR0YWNoVGVtcGxhdGUoKSB7XG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZSh0aGlzLmlkICsgJyA6OiBBdHRhY2hpbmcgYCcgKyBtYXRjaGVzWzJdICsgJ2AgdG8gYCcgKyBtYXRjaGVzWzFdICsgJ2AuLi4nKTtcblxuXHRcdFx0dmFyIHJlZ2lvbiA9IG1hdGNoZXNbMV07XG5cdFx0XHR2YXIgdGVtcGxhdGUgPSBtYXRjaGVzWzJdO1xuXG5cdFx0XHR0aGlzW3JlZ2lvbl0uYXR0YWNoKHRlbXBsYXRlKTtcblx0XHR9O1xuXHR9XG5cblxuXHQvLyBNZXRob2QgdG8gYWRkIHRoZSBzcGVjaWZpZWQgY2xhc3Ncblx0ZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXlxcK1xccypcXC4oLipbXi5cXHNdKS8pKSAmJiBtYXRjaGVzWzFdKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiBhZGRDbGFzcygpIHtcblx0XHRcdEZSQU1FV09SSy52ZXJib3NlKHRoaXMuaWQgKyAnIDo6IEFkZGluZyBjbGFzcyAoJyArIG1hdGNoZXNbMV0gKyAnKS4uLicpO1xuXHRcdFx0dGhpcy4kZWwuYWRkQ2xhc3MobWF0Y2hlc1sxXSk7XG5cdFx0fTtcblx0fVxuXHQvLyBNZXRob2QgdG8gcmVtb3ZlIHRoZSBzcGVjaWZpZWQgY2xhc3Ncblx0ZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXlxcLVxccypcXC4oLipbXi5cXHNdKS8pKSAmJiBtYXRjaGVzWzFdKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiByZW1vdmVDbGFzcygpIHtcblx0XHRcdEZSQU1FV09SSy52ZXJib3NlKHRoaXMuaWQgKyAnIDo6IFJlbW92aW5nIGNsYXNzICgnICsgbWF0Y2hlc1sxXSArICcpLi4uJyk7XG5cdFx0XHR0aGlzLiRlbC5yZW1vdmVDbGFzcyhtYXRjaGVzWzFdKTtcblx0XHR9O1xuXHR9XG5cdC8vIE1ldGhvZCB0byB0b2dnbGUgdGhlIHNwZWNpZmllZCBjbGFzc1xuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eXFwhXFxzKlxcLiguKlteLlxcc10pLykpICYmIG1hdGNoZXNbMV0pIHtcblx0XHRmbiA9IGZ1bmN0aW9uIHRvZ2dsZUNsYXNzKCkge1xuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UodGhpcy5pZCArICcgOjogVG9nZ2xpbmcgY2xhc3MgKCcgKyBtYXRjaGVzWzFdICsgJykuLi4nKTtcblx0XHRcdHRoaXMuJGVsLnRvZ2dsZUNsYXNzKG1hdGNoZXNbMV0pO1xuXHRcdH07XG5cdH1cblxuXHQvLyBUT0RPOlx0YWxsb3cgZGVzY2VuZGFudHMgdG8gYmUgY29udHJvbGxlZCB2aWEgc2hvcnRoYW5kXG5cdC8vXHRcdFx0ZS5nLiA6ICdsaS5yb3cgLS5oaWdobGlnaHRlZCdcblx0Ly9cdFx0XHR3b3VsZCByZW1vdmUgdGhlIGBoaWdobGlnaHRlZGAgY2xhc3MgZnJvbSB0aGlzLiQoJ2xpLnJvdycpXG5cblxuXHQvLyBJZiBzaG9ydC1oYW5kIG1hdGNoZWQsIHJldHVybiB0aGUgZGVyZWZlcmVuY2VkIGZ1bmN0aW9uXG5cdGlmIChmbikge1xuXG5cdFx0RlJBTUVXT1JLLnZlcmJvc2UoJ0ludGVycHJldGluZyBtZWFuaW5nIGZyb20gc2hvcnRoYW5kIDo6IGAnICsgdmFsdWUgKyAnYC4uLicpO1xuXG5cdFx0Ly8gQ3VycnkgdGhlIHJlc3VsdCBmdW5jdGlvbiB3aXRoIGFueSBzdWZmaXggbWF0Y2hlc1xuXHRcdHZhciBjdXJyaWVkRm4gPSBmbjtcblxuXHRcdC8vIFRyYWlsaW5nIGAuYCBpbmRpY2F0ZXMgYW4gZS5zdG9wUHJvcGFnYXRpb24oKVxuXHRcdGlmICh2YWx1ZS5tYXRjaCgvXFwuXFxzKiQvKSkge1xuXHRcdFx0Y3VycmllZEZuID0gZnVuY3Rpb24gYW5kU3RvcFByb3BhZ2F0aW9uKGUpIHtcblxuXHRcdFx0XHQvLyBCaW5kIChzbyBpdCBpbmhlcml0cyBjb21wb25lbnQgY29udGV4dCkgYW5kIGNhbGwgaW50ZXJpb3IgZnVuY3Rpb25cblx0XHRcdFx0Zm4uYXBwbHkodGhpcyk7XG5cblx0XHRcdFx0Ly8gdGhlbiBpbW1lZGlhdGVseSBzdG9wIGV2ZW50IGJ1YmJsaW5nL3Byb3BhZ2F0aW9uXG5cdFx0XHRcdGlmIChlICYmIGUuc3RvcFByb3BhZ2F0aW9uKSB7XG5cdFx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRGUkFNRVdPUksud2Fybihcblx0XHRcdFx0XHRcdHRoaXMuaWQgKyAnIDo6IFRyYWlsaW5nIGAuYCBzaG9ydGhhbmQgd2FzIHVzZWQgdG8gaW52b2tlIGFuICcgK1xuXHRcdFx0XHRcdFx0J2Uuc3RvcFByb3BhZ2F0aW9uKCksIGJ1dCBcIicgKyB2YWx1ZSArICdcIiB3YXMgbm90IHRyaWdnZXJlZCBieSBhIERPTSBldmVudCFcXG4nICtcblx0XHRcdFx0XHRcdCdQcm9iYWJseSBiZXN0IHRvIGRvdWJsZS1jaGVjayB0aGlzIHdhcyB3aGF0IHlvdSBtZWFudCB0byBkby4nKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY3VycmllZEZuO1xuXHR9XG5cblxuXHQvLyBPdGhlcndpc2UsIGlmIG5vIHNob3J0LWhhbmQgbWF0Y2hlZCwgcGFzcyB0aGUgb3JpZ2luYWwgdmFsdWVcblx0Ly8gc3RyYWlnaHQgdGhyb3VnaFxuXHRyZXR1cm4gdmFsdWU7XG59O1xuIiwiLyoqXG4gKiBVdGlsaXR5IGZ1bmN0aW9ucyB0aGF0IGFyZSB1c2VkIHRocm91Z2hvdXQgdGhlIGNvcmUuXG4gKi9cblxudmFyIFV0aWxzID0ge1xuXG5cdC8qKlxuXHQgKiBHcmFicyB0aGUgaWQgeG9yIGRhdGEtaWQgZnJvbSBhbiBIVE1MIGVsZW1lbnQuXG5cdCAqXG5cdCAqIEBwYXJhbSAge0RPTUVsZW1lbnR9IGVsICAgIFtFbGVtZW50IHdoZXJlIHdlIGFyZSBsb29raW5nIGZvciB0aGUgYGlkYCBvciBgZGF0YS1pZGAgYXR0cl1cblx0ICogQHBhcmFtICB7Qm9vbGVhbn0gcmVxdWlyZWQgW0RldGVybWluZXMgaWYgaXQgaXMgcmVxdWlyZWQgdG8gZmluZCBhbiBgaWRgIG9yIGBkYXRhLWlkYCBhdHRyXVxuXHQgKlxuXHQgKiBAcmV0dXJuIHtTdHJpbmd9ICAgICAgICAgIFx0W0lkZW50aWZpY2F0aW9uIHN0cmluZyB0aGF0IHdhcyBmb3VuZF1cblx0ICovXG5cdGVsMmlkOiBmdW5jdGlvbihlbCwgcmVxdWlyZWQpIHtcblxuXHRcdHZhciBpZCA9ICQoZWwpLmF0dHIoJ2lkJyk7XG5cdFx0dmFyIGRhdGFJZCA9ICQoZWwpLmF0dHIoJ2RhdGEtaWQnKTtcblx0XHR2YXIgY29udGVudHNJZCA9ICQoZWwpLmF0dHIoJ2NvbnRlbnRzJyk7XG5cblx0XHRpZiAoaWQgJiYgZGF0YUlkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoaWQgKyAnIDo6IENhbm5vdCBzZXQgYm90aCBgaWRgIGFuZCBgZGF0YS1pZGAhICBQbGVhc2UgdXNlIG9uZSBvciB0aGUgb3RoZXIuICAoZGF0YS1pZCBpcyBzYWZlc3QpJyk7XG5cdFx0fVxuXHRcdGlmIChyZXF1aXJlZCAmJiAhaWQgJiYgIWRhdGFJZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdObyBpZCBzcGVjaWZpZWQgaW4gZWxlbWVudCB3aGVyZSBpdCBpcyByZXF1aXJlZDpcXG4nICsgZWwpO1xuXHRcdH1cblxuXHRcdHJldHVybiBpZCB8fCBkYXRhSWQgfHwgY29udGVudHNJZDtcblx0fSxcblxuXHQvKipcblx0ICogTWFwIGFuIG9iamVjdCdzIHZhbHVlcywgYW5kIHJldHVybiBhIHZhbGlkIG9iamVjdCAodGhpcyBmdW5jdGlvbiBpcyBoYW5keSBiZWNhdXNlXG5cdCAqIHVuZGVyc2NvcmUubWFwKCkgcmV0dXJucyBhIGxpc3QsIG5vdCBhbiBvYmplY3QuKVxuXHQgKlxuXHQgKiBAcGFyYW0gIHtPYmplY3R9IG9iaiAgICAgICAgIFx0W09qZWN0IHdob3MgdmFsdWVzIHlvdSB3YW50IHRvIG1hcF1cblx0ICogQHBhcmFtICB7RnVuY3Rpb259IHRyYW5zZm9ybUZuIFtGdW5jdGlvbiB0byB0cmFuc2Zvcm0gZWFjaCBvYmplY3QgdmFsdWUgYnldXG5cdCAqXG5cdCAqIEByZXR1cm4ge09iamVjdH0gICAgICAgICAgICAgXHRbTmV3IG9iamVjdCB3aXRoIHRoZSB2YWx1ZXMgbWFwcGVkXVxuXHQgKi9cblx0b2JqTWFwOiBmdW5jdGlvbiBvYmpNYXAob2JqLCB0cmFuc2Zvcm1Gbikge1xuXHRcdHJldHVybiBfLm9iamVjdChfLmtleXMob2JqKSwgXy5tYXAob2JqLCB0cmFuc2Zvcm1GbikpO1xuXHR9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFV0aWxzOyJdfQ==
;