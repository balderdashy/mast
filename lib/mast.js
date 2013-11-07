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
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9jb21wb25lbnQvYmluZEV2ZW50cy5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL2NvbXBvbmVudC9jbG9zZS5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL2NvbXBvbmVudC9oZWxwZXJzLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvY29tcG9uZW50L2luZGV4LmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvY29tcG9uZW50L2xpZmVjeWNsZUV2ZW50cy5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL2NvbXBvbmVudC9saWZlY3ljbGVIb29rcy5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL2NvbXBvbmVudC9yZW5kZXIuanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9jb21wb25lbnQvdmFsaWRhdGVEZWZpbml0aW9uLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvZGVmaW5lL2J1aWxkRGVmaW5pdGlvbi5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL2RlZmluZS9pbmRleC5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL2luZGV4LmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvbG9nZ2VyL2luZGV4LmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvbG9nZ2VyL3NldHVwLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvcmFpc2UvYnVpbGRQcm90b3R5cGUuanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9yYWlzZS9jb2xsZWN0UmVnaW9ucy5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL3JhaXNlL2NvbGxlY3RUZW1wbGF0ZXMuanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9yYWlzZS9pbmRleC5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL3JlZ2lvbi9hcHBlbmQuanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9yZWdpb24vYXR0YWNoLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvcmVnaW9uL2VtcHR5LmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvcmVnaW9uL2Zyb21FbGVtZW50LmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvcmVnaW9uL2luZGV4LmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvcmVnaW9uL2luc2VydC5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL3JlZ2lvbi9wcmVwZW5kLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvcmVnaW9uL3JlbW92ZS5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL3JvdXRlci9pbmRleC5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL3V0aWxzL0RPTS5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL3V0aWxzL2V2ZW50cy5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL3V0aWxzL3Nob3J0aGFuZC5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL3V0aWxzL3V0aWxzLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcElBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNYQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBCaW5kIGNvbGxlY3Rpb24gZXZlbnRzIHRvIGxpZmVjeWNsZSBldmVudCBoYW5kbGVyc1xuICovXG5leHBvcnRzLmNvbGxlY3Rpb25FdmVudHMgPSBmdW5jdGlvbigpIHtcblx0Ly8gQmluZCB0byBjb2xsZWN0aW9uIGV2ZW50cyBpZiBvbmUgd2FzIHBhc3NlZCBpblxuXHRpZiAodGhpcy5jb2xsZWN0aW9uKSB7XG5cblx0XHQvLyBMaXN0ZW4gdG8gZXZlbnRzXG5cdFx0dGhpcy5saXN0ZW5Ubyh0aGlzLmNvbGxlY3Rpb24sICdhZGQnLCB0aGlzLmFmdGVyQWRkKTtcblx0XHR0aGlzLmxpc3RlblRvKHRoaXMuY29sbGVjdGlvbiwgJ3JlbW92ZScsIHRoaXMuYWZ0ZXJSZW1vdmUpO1xuXHRcdHRoaXMubGlzdGVuVG8odGhpcy5jb2xsZWN0aW9uLCAncmVzZXQnLCB0aGlzLmFmdGVyUmVzZXQpO1xuXHR9XG59O1xuXG4vKipcbiAqIEJpbmQgbW9kZWwgZXZlbnRzIHRvIGxpZmVjeWNsZSBldmVudCBoYW5kbGVycyBhbmQgYWxzbyBhbGxvd3MgZm9yIGhhbmRsZXJzIHRvIGZpcmVcbiAqIG9uIGNlcnRhaW4gbW9kZWwgYXR0cmlidXRlIGNoYW5nZXMuXG4gKi9cbmV4cG9ydHMubW9kZWxFdmVudHMgPSBmdW5jdGlvbigpIHtcblx0aWYgKHRoaXMubW9kZWwpIHtcblxuXHRcdC8vIExpc3RlbiBmb3IgYW55IGF0dHJpYnV0ZSBjaGFuZ2VzXG5cdFx0Ly8gZS5nLlxuXHRcdC8vIC5hZnRlckNoYW5nZShtb2RlbCwgb3B0aW9ucylcblx0XHQvL1xuXHRcdHRoaXMubGlzdGVuVG8odGhpcy5tb2RlbCwgJ2NoYW5nZScsIGZ1bmN0aW9uIG1vZGVsQ2hhbmdlZCAobW9kZWwsIG9wdGlvbnMpIHtcblx0XHRcdGlmIChfLmlzRnVuY3Rpb24odGhpcy5hZnRlckNoYW5nZSkpIHtcblx0XHRcdFx0dGhpcy5hZnRlckNoYW5nZShtb2RlbCwgb3B0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyBMaXN0ZW4gZm9yIHNwZWNpZmljIGF0dHJpYnV0ZSBjaGFuZ2VzXG5cdFx0Ly8gZS5nLlxuXHRcdC8vIC5hZnRlckNoYW5nZS5jb2xvcihtb2RlbCwgdmFsdWUsIG9wdGlvbnMpXG5cdFx0Ly9cblx0XHRpZiAoXy5pc09iamVjdCh0aGlzLmFmdGVyQ2hhbmdlKSkge1xuXHRcdFx0Xy5lYWNoKHRoaXMuYWZ0ZXJDaGFuZ2UsIGZ1bmN0aW9uIChoYW5kbGVyLCBhdHRyTmFtZSkge1xuXG5cdFx0XHRcdC8vIENhbGwgaGFuZGxlciB3aXRoIG5ld1ZhbCB0byBrZWVwIGFyZ3VtZW50cyBzdHJhaWdodGZvcndhcmRcblx0XHRcdFx0dGhpcy5saXN0ZW5Ubyh0aGlzLm1vZGVsLCAnY2hhbmdlOicgKyBhdHRyTmFtZSwgZnVuY3Rpb24gYXR0ckNoYW5nZWQgKG1vZGVsLCBuZXdWYWwpIHtcblx0XHRcdFx0XHRoYW5kbGVyLmNhbGwoc2VsZiwgbmV3VmFsKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdH0sIHRoaXMpO1xuXHRcdH1cblx0fVxufTtcblxuLyoqXG4gKiBMaXN0ZW5zIGZvciBhbmQgcnVucyBoYW5kbGVycyBvbiBnbG9iYWwgZXZlbnRzIHRoYXQgYXJlIGxpc3RlbmVkIGZvciBvbiBhIGNvbXBvbmVudC5cbiAqL1xuZXhwb3J0cy5nbG9iYWxUcmlnZ2VycyA9IGZ1bmN0aW9uKCkge1xuXG5cdHZhciBzZWxmID0gdGhpcztcblxuXHR0aGlzLmxpc3RlblRvKEZSQU1FV09SSywgJ2FsbCcsIGZ1bmN0aW9uIChlUm91dGUpIHtcblxuXHRcdC8vIFRyaW0gb2ZmIGFsbCBidXQgdGhlIGZpcnN0IGFyZ3VtZW50IHRvIHBhc3MgdGhyb3VnaCB0byBoYW5kbGVyXG5cdFx0dmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuXHRcdGFyZ3Muc2hpZnQoKTtcblxuXHRcdC8vIEl0ZXJhdGUgdGhyb3VnaCBlYWNoIHN1YnNjcmlwdGlvbiBvbiB0aGlzIGNvbXBvbmVudFxuXHRcdC8vIGFuZCBsaXN0ZW4gZm9yIHRoZSBzcGVjaWZpZWQgZ2xvYmFsIGV2ZW50c1xuXHRcdF8uZWFjaChzZWxmLnN1YnNjcmlwdGlvbnMsIGZ1bmN0aW9uKGhhbmRsZXIsIG1hdGNoUGF0dGVybikge1xuXG5cdFx0XHQvLyBHcmFiIHJlZ2V4IGFuZCBwYXJhbSBwYXJzaW5nIGxvZ2ljIGZyb20gQmFja2JvbmUgY29yZVxuXHRcdFx0dmFyIGV4dHJhY3RQYXJhbXMgPSBCYWNrYm9uZS5Sb3V0ZXIucHJvdG90eXBlLl9leHRyYWN0UGFyYW1ldGVycyxcblx0XHRcdFx0Y2FsY3VsYXRlUmVnZXggPSBCYWNrYm9uZS5Sb3V0ZXIucHJvdG90eXBlLl9yb3V0ZVRvUmVnRXhwO1xuXG5cdFx0XHQvLyBUcmltIHRyYWlsaW5nXG5cdFx0XHRtYXRjaFBhdHRlcm4gPSBtYXRjaFBhdHRlcm4ucmVwbGFjZSgvXFwvKiQvZywgJycpO1xuXHRcdFx0Ly8gYW5kIGVyIHNvcnQgb2YuLiBsZWFkaW5nLi4gc2xhc2hlc1xuXHRcdFx0bWF0Y2hQYXR0ZXJuID0gbWF0Y2hQYXR0ZXJuLnJlcGxhY2UoL14oWyN+JV0pXFwvKi9nLCAnJDEnKTtcblx0XHRcdC8vIFRPRE86IG9wdGltaXphdGlvbi0gdGhpcyByZWFsbHkgb25seSBoYXMgdG8gYmUgZG9uZSBvbmNlLCBvbiByYWlzZSgpLCB3ZSBzaG91bGQgZG8gdGhhdFxuXG5cblx0XHRcdC8vIENvbWUgdXAgd2l0aCByZWdleCBmb3IgdGhpcyBtYXRjaFBhdHRlcm5cblx0XHRcdHZhciByZWdleCA9IGNhbGN1bGF0ZVJlZ2V4KG1hdGNoUGF0dGVybik7XG5cblx0XHRcdC8vIElmIHRoaXMgbWF0Y2hQYXRlcm4gaXMgdGhpcyBpcyBub3QgYSBtYXRjaCBmb3IgdGhlIGV2ZW50LFxuXHRcdFx0Ly8gYGNvbnRpbnVlYCBpdCBhbG9uZyB0byBpdCBjYW4gdHJ5IHRoZSBuZXh0IG1hdGNoUGF0dGVyblxuXHRcdFx0aWYgKCFlUm91dGUubWF0Y2gocmVnZXgpKSByZXR1cm47XG5cblx0XHRcdC8vIFBhcnNlIHBhcmFtZXRlcnMgZm9yIHVzZSBhcyBhcmdzIHRvIHRoZSBoYW5kbGVyXG5cdFx0XHQvLyAob3IgYW4gZW1wdHkgbGlzdCBpZiBub25lIGV4aXN0KVxuXHRcdFx0dmFyIHBhcmFtcyA9IGV4dHJhY3RQYXJhbXMocmVnZXgsIGVSb3V0ZSk7XG5cblx0XHRcdC8vIEhhbmRsZSBzdHJpbmcgcmVkaXJlY3RzIHRvIGZ1bmN0aW9uIG5hbWVzXG5cdFx0XHRpZiAoIV8uaXNGdW5jdGlvbihoYW5kbGVyKSkge1xuXHRcdFx0XHRoYW5kbGVyID0gc2VsZltoYW5kbGVyXTtcblxuXHRcdFx0XHRpZiAoIWhhbmRsZXIpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCB0cmlnZ2VyIHN1YnNjcmlwdGlvbiBiZWNhdXNlIG9mIHVua25vd24gaGFuZGxlcjogJyArIGhhbmRsZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIEJpbmQgY29udGV4dCBhbmQgYXJndW1lbnRzIHRvIHN1YnNjcmlwdGlvbiBoYW5kbGVyXG5cdFx0XHRoYW5kbGVyLmFwcGx5KHNlbGYsIF8udW5pb24oYXJncywgcGFyYW1zKSk7XG5cblx0XHR9KTtcblx0fSk7XG59O1xuIiwiLyoqXG4gKiBTYWZlbHkgemFwIGV2ZXJ5IHRyYWNlIGFib3V0IHRoaXMgY29tcG9uZW50IGZyb20gbWVtb3J5LlxuICovXG5cbnZhciBoZWxwZXJzID0gcmVxdWlyZSgnLi9oZWxwZXJzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY2xvc2UoKSB7XG5cblx0RlJBTUVXT1JLLmRlYnVnKCdDbG9zZWQgJyArIHRoaXMuaWQgKyAnIGNvbXBvbmVudC4nKTtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdC8vIENhbmNlbCBjdXJyZW50IHJlbmRlciBhbmQgY2xvc2Ugam9icywgaWYgdGhleSdyZSBydW5uaW5nXG5cdGlmICh0aGlzLl9yZW5kZXJpbmcpIHtcblx0XHRzZWxmLl9yZW5kZXJpbmdDYW5jZWxlZCA9IHRydWU7XG5cdFx0dGhpcy5jYW5jZWxSZW5kZXIoKTtcblx0XHRzZWxmLl9yZW5kZXJpbmcgPSBmYWxzZTtcblx0fVxuXHRpZiAodGhpcy5fY2xvc2luZykge1xuXHRcdHRoaXMuY2FuY2VsQ2xvc2UoKTtcblx0XHRzZWxmLl9jbG9zaW5nID0gZmFsc2U7XG5cdH1cblxuXHQvLyBMb2NrIGFjY2VzcyB0byBjbG9zZSgpXG5cdHRoaXMuX2Nsb3NpbmcgPSB0cnVlO1xuXG5cdHRoaXMuYmVmb3JlQ2xvc2UoZnVuY3Rpb24gKCkge1xuXG5cdFx0Ly8gPiBOT1RFOiBgdGhpcy5fY2xvc2luZz1mYWxzZWAgY2FuIGFuZCBwcm9iYWJseSBzaG91bGQgYmUgcmVtb3ZlZCxcblx0XHQvLyA+IHNpbmNlIG11dGV4IGlzIHVubmVjZXNzYXJ5IG5vdyB0aGF0IHRoZSBjb21wb25lbnQgaXMgdXAgZm9yIGdhcmJhZ2UgY29sbGVjdGlvblxuXHRcdC8vID4gV2FpdGluZyB0byBkbyB0aGlzIHVudGlsIGl0IGNhbiBiZSB0ZXN0ZWQgZnVydGhlclxuXG5cdFx0Ly8gVW5sb2NrIGNsb3NlKClcblx0XHRzZWxmLl9jbG9zaW5nID0gZmFsc2U7XG5cblx0XHQvLyBTdG9wIGxpc3RlbmluZyB0byBhbGwgZ2xvYmFsIHRyaWdnZXJzICglfCMpXG5cblx0XHQvLyBDbG9zZSBhbGwgY2hpbGQgY29tcG9uZW50c1xuXG5cdFx0aGVscGVycy5lbXB0eUFsbFJlZ2lvbnMuY2FsbChzZWxmKTtcblxuXHRcdC8vIENhbGwgbmF0aXZlIGBCYWNrYm9uZS5WaWV3LnByb3RvdHlwZS5yZW1vdmUoKWBcblx0XHQvLyB0byB1bmRlbGVnYXRlIGV2ZW50cywgZXRjLlxuXHRcdHNlbGYucmVtb3ZlKCk7XG5cblx0fSk7XG59O1xuIiwiLyoqXG4gKiBIZWxwZXIgZnVuY3Rpb25zIHVzZWQgYnkgY29tcG9uZW50cy9cbiAqL1xuXG52YXIgaGVscGVycyA9IG1vZHVsZS5leHBvcnRzID0ge1xuXG5cdC8qKlxuICogSWYgYW55IHJlZ2lvbnMgZXhpc3QgaW4gdGhpcyBjb21wb25lbnQsXG4gKiBlbXB0eSB0aGVtLCBhbmQgdGhlbiBkZWxldGUgdGhlbVxuICovXG5cdGVtcHR5QWxsUmVnaW9uczogZnVuY3Rpb24oKSB7XG5cdFx0Xy5lYWNoKHRoaXMucmVnaW9ucywgZnVuY3Rpb24gKHJlZ2lvbiwga2V5KSB7XG5cdFx0XHRyZWdpb24uZW1wdHkoKTtcblx0XHRcdGRlbGV0ZSB0aGlzLnJlZ2lvbnNba2V5XTtcblx0XHR9LCB0aGlzKTtcblx0fSxcblxuXHQvKipcblx0ICogSW5zdGFudGlhdGUgcmVnaW9uIGNvbXBvbmVudHMgYW5kIGFwcGVuZCBhbnkgZGVmYXVsdFxuXHQgKiB0ZW1wbGF0ZXMvY29tcG9uZW50cyB0byB0aGUgRE9NXG5cdCAqL1xuXHRyZW5kZXJSZWdpb25zOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0XHRoZWxwZXJzLmVtcHR5QWxsUmVnaW9ucygpO1xuXG5cdFx0Ly8gRGV0ZWN0IGNoaWxkIHJlZ2lvbnMgaW4gdGVtcGxhdGVcblx0XHR2YXIgJHJlZ2lvbnMgPSB0aGlzLiQoJ3JlZ2lvbiwgW2RhdGEtcmVnaW9uXScpO1xuXHRcdCRyZWdpb25zLmVhY2goZnVuY3Rpb24gKGksIGVsKSB7XG5cblx0XHRcdC8vIFByb3ZpZGUgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkgZm9yXG5cdFx0XHQvLyBgZGVmYXVsdGAsIGBjb250ZW50c2AgYW5kIGB0ZW1wbGF0ZWAgbm90YXRpb25cblx0XHRcdHZhciBjb21wb25lbnRJZCA9ICQoZWwpLmF0dHIoJ2RlZmF1bHQnKTtcblx0XHRcdGNvbXBvbmVudElkID0gY29tcG9uZW50SWQgfHwgJChlbCkuYXR0cignY29udGVudHMnKTtcblx0XHRcdGNvbXBvbmVudElkID0gY29tcG9uZW50SWQgfHwgJChlbCkuYXR0cigndGVtcGxhdGUnKTtcblx0XHRcdCQoZWwpLmF0dHIoJ2NvbnRlbnRzJywgY29tcG9uZW50SWQpO1xuXG5cdFx0XHQvLyBHZW5lcmF0ZSBhIHJlZ2lvbiBpbnN0YW5jZSBmcm9tIHRoZSBlbGVtZW50XG5cdFx0XHQvLyAobW9kaWZ5aW5nIHRoZSBET00gYXMgbmVjZXNzYXJ5KVxuXHRcdFx0dmFyIHJlZ2lvbiA9IEZSQU1FV09SSy5SZWdpb24uZnJvbUVsZW1lbnQoZWwsIHNlbGYpO1xuXG5cdFx0XHQvLyBJZiByZWdpb24gaGFzIG5vIGlkLCBnZW5lcmF0ZSBhIHVuaXF1ZSByZWdpb24gaWQgdy9pIHRoaXMgY29tcG9uZW50XG5cdFx0XHQvLyB0aGF0IGlzIHVubGlrZWx5IHRvIGNvbGxpZGUgd2l0aCBteSBvdGhlciBuYW1lZCByZWdpb25zXG5cdFx0XHRpZiAoIXJlZ2lvbi5pZCkge1xuXHRcdFx0XHRyZWdpb24uaWQgPSAnJytcblx0XHRcdFx0XHRGUkFNRVdPUksub3B0aW9ucy5mcmFtZXdvcmtJZCArXG5cdFx0XHRcdFx0J19fYW5vbnltb3VzX3JlZ2lvbl9fJyArXG5cdFx0XHRcdFx0c2VsZi5hbm9ueW1vdXNSZWdpb25Db3VudGVyO1xuXG5cdFx0XHRcdC8vIEluY3JlbWVudCBjb3VudGVyIGZvciBuZXh0IHRpbWVcblx0XHRcdFx0c2VsZi5hbm9ueW1vdXNSZWdpb25Db3VudGVyKys7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEtlZXAgdHJhY2sgb2YgcmVnaW9ucywgc2luY2Ugd2UgYXJlIHRoZSBwYXJlbnQgY29tcG9uZW50XG5cdFx0XHRzZWxmLnJlZ2lvbnNbcmVnaW9uLmlkXSA9IHJlZ2lvbjtcblxuXHRcdFx0Ly8gQXMgbG9uZyBhcyB0aGVyZSBhcmUgbm8gY29sbGlzaW9ucyxcblx0XHRcdC8vIHByb3ZpZGUgYSBmcmllbmRseSByZWZlcmVuY2UgdG8gdGhlIHJlZ2lvbiBvbiB0aGUgdG9wIGxldmVsIG9mIHRoZSBjb2xsZWN0aW9uXG5cdFx0XHRpZiAoIXNlbGZbcmVnaW9uLmlkXSkge1xuXHRcdFx0XHRzZWxmW3JlZ2lvbi5pZF0gPSByZWdpb247XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0sXG5cblx0LyoqXG5cdCAqIENvbnZlcnQgdGVtcGxhdGUgSFRNTCBhbmQgZGF0YSBpbnRvIGEgY29tcGlsZWQgJHRlbXBsYXRlXG5cdCAqL1xuXHRjb21waWxlVGVtcGxhdGU6IGZ1bmN0aW9uKCkge1xuXG5cdFx0Ly8gQ3JlYXRlIHRlbXBsYXRlIGRhdGEgY29udGV4dCBieSBwcm92aWRpbmcgYWNjZXNzIHRvIHRoZSBnbG9iYWwgRGF0YSBvYmplY3QsXG5cdFx0Ly8gQWxzbyBmb2xkIGluIHRoZSBtb2RlbCBhc3NvY2lhdGVkIHdpdGggdGhpcyBjb21wb25lbnQsIGlmIHRoZXJlIGlzIG9uZVxuXHRcdHZhciB0ZW1wbGF0ZUNvbnRleHQgPSBfLmV4dGVuZCh7XG5cblx0XHRcdC8vIEFsbG93cyB5b3UgdG8gZ2V0IGEgaG9sZCBvZiBkYXRhLFxuXHRcdFx0Ly8gYnV0IHVzZSBhIGRlZmF1bHQgdmFsdWUgaWYgaXQgZG9lc24ndCBleGlzdFxuXHRcdFx0Z2V0OiBmdW5jdGlvbiAoa2V5LCBkZWZhdWx0VmFsKSB7XG5cdFx0XHRcdHZhciB2YWwgPSB0ZW1wbGF0ZUNvbnRleHRba2V5XTtcblx0XHRcdFx0aWYgKHR5cGVvZiB2YWwgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdFx0dmFsID0gZGVmYXVsdFZhbDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdmFsO1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHQvLyBBbGwgRlJBTUVXT1JLLmRhdGEgaXMgYXZhaWxhYmxlIGluIGV2ZXJ5IHRlbXBsYXRlXG5cdFx0RlJBTUVXT1JLLmRhdGEpO1xuXG5cdFx0Ly8gSWYgYSBtb2RlbCBpcyBwcm92aWRlZCBmb3IgdGhpcyBjb21wb25lbnQsIG1ha2UgaXQgYXZhaWxhYmxlIGluIHRoaXMgdGVtcGxhdGVcblx0XHRpZiAodGhpcy5tb2RlbCkge1xuXHRcdFx0Xy5leHRlbmQodGVtcGxhdGVDb250ZXh0LCB0aGlzLm1vZGVsLmF0dHJpYnV0ZXMpO1xuXHRcdH1cblxuXHRcdC8vIFRlbXBsYXRlIHRoZSBIVE1MIHdpdGggdGhlIGRhdGFcblx0XHR2YXIgaHRtbDtcblx0XHR0cnkge1xuXHRcdFx0Ly8gQWNjZXB0IHByZWNvbXBpbGVkIHRlbXBsYXRlc1xuXHRcdFx0aWYgKF8uaXNGdW5jdGlvbih0aGlzLnRlbXBsYXRlKSkge1xuXHRcdFx0XHRodG1sID0gdGhpcy50ZW1wbGF0ZSh0ZW1wbGF0ZUNvbnRleHQpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gT3IgcmF3IHN0cmluZ3Ncblx0XHRcdGVsc2UgaHRtbCA9IF8udGVtcGxhdGUodGhpcy50ZW1wbGF0ZSwgdGVtcGxhdGVDb250ZXh0KTtcblx0XHR9XG5cdFx0Y2F0Y2ggKGUpIHtcblx0XHRcdHZhciBzdHIgPSBlLFxuXHRcdFx0XHRzdGFjayA9ICcnO1xuXG5cdFx0XHRpZiAoZSBpbnN0YW5jZW9mIEVycm9yKSB7XG5cdFx0XHRcdHN0ciA9ICBlLnRvU3RyaW5nKCk7XG5cdFx0XHRcdHN0YWNrID0gZS5zdGFjaztcblx0XHRcdH1cblxuXHRcdFx0RlJBTUVXT1JLLmVycm9yKHRoaXMuaWQgKyAnIDo6IHJlbmRlcigpIGVycm9yIGluIHRlbXBsYXRlIDpcXG4nICsgc3RyICsgJ1xcblRlbXBsYXRlIDo6ICcgKyBodG1sICsgJ1xcbicgKyBzdGFjayk7XG5cdFx0XHRodG1sID0gdGhpcy50ZW1wbGF0ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gaHRtbDtcblx0fVxuXG59O1xuIiwiLyoqXG4gKiBDb21wb25lbnQgaXMgYW4gZXh0ZW5kZWQgYEJhY2tib25lLlZpZXdgLiBJdCBhZGQgZmVhdHVyZXMgc3VjaCBhcyBhdXRvbWF0aWMgZXZlbnQgYmluZGluZyxcbiAqIHJlbmRlcmluZywgbGlmZWN5Y2xlIGhvb2tzIGFuZCBldmVudHMsIGFuZCBtb3JlLlxuICovXG5cbnZhciBsaWZlY3ljbGVIb29rcyAgICAgPSByZXF1aXJlKCcuL2xpZmVjeWNsZUhvb2tzJyksXG5cdFx0bGlmZWN5Y2xlRXZlbnRzICAgID0gcmVxdWlyZSgnLi9saWZlY3ljbGVFdmVudHMnKSxcblx0XHRiaW5kRXZlbnRzICAgICAgICAgPSByZXF1aXJlKCcuL2JpbmRFdmVudHMnKSxcblx0XHRjbG9zZSAgICAgICAgICAgICAgPSByZXF1aXJlKCcuL2Nsb3NlJyksXG5cdFx0cmVuZGVyICAgICAgICAgICAgID0gcmVxdWlyZSgnLi9yZW5kZXInKSxcblx0XHR2YWxpZGF0ZURlZmluaXRpb24gPSByZXF1aXJlKCcuL3ZhbGlkYXRlRGVmaW5pdGlvbicpO1xuXG5Db21wb25lbnQgPSBtb2R1bGUuZXhwb3J0cyA9IEJhY2tib25lLlZpZXcuZXh0ZW5kKCk7XG5cblxuXy5leHRlbmQoQ29tcG9uZW50LnByb3RvdHlwZSwge1xuXG5cdC8vIExpZmVjeWNsZSBIb29rc1xuXHRiZWZvcmVSZW5kZXI6IGZ1bmN0aW9uKGNiKSB7XG5cdFx0bGlmZWN5Y2xlSG9va3MuYmVmb3JlUmVuZGVyLmNhbGwodGhpcywgY2IpO1xuXHR9LFxuXHRiZWZvcmVDbG9zZTogZnVuY3Rpb24oY2IpIHtcblx0XHRsaWZlY3ljbGVIb29rcy5iZWZvcmVDbG9zZS5jYWxsKHRoaXMsIGNiKTtcblx0fSxcblx0YWZ0ZXJSZW5kZXI6IGZ1bmN0aW9uKCkge1xuXHRcdGxpZmVjeWNsZUhvb2tzLmFmdGVyUmVuZGVyLmNhbGwodGhpcyk7XG5cdH0sXG5cdGNhbmNlbFJlbmRlcjogZnVuY3Rpb24oKSB7XG5cdFx0bGlmZWN5Y2xlSG9va3MuY2FuY2VsUmVuZGVyLmNhbGwodGhpcyk7XG5cdH0sXG5cdGNhbmNlbENsb3NlOiBmdW5jdGlvbigpIHtcblx0XHRsaWZlY3ljbGVIb29rcy5jYW5jZWxDbG9zZS5jYWxsKHRoaXMpO1xuXHR9LFxuXG5cdC8vIExpZmVjeWNsZSBFdmVudHNcblx0YWZ0ZXJDaGFuZ2U6IGZ1bmN0aW9uKG1vZGVsLCBvcHRpb25zKSB7XG5cdFx0bGlmZWN5Y2xlRXZlbnRzLmFmdGVyQ2hhbmdlLmNhbGwodGhpcywgbW9kZWwsIG9wdGlvbnMpO1xuXHR9LFxuXHRhZnRlckFkZDogZnVuY3Rpb24obW9kZWwsIGNvbGxlY3Rpb24sIG9wdGlvbnMpIHtcblx0XHRsaWZlY3ljbGVFdmVudHMuYWZ0ZXJBZGQuY2FsbCh0aGlzLCBtb2RlbCwgY29sbGVjdGlvbiwgb3B0aW9ucyk7XG5cdH0sXG5cdGFmdGVyUmVtb3ZlOiBmdW5jdGlvbihtb2RlbCwgY29sbGVjdGlvbiwgb3B0aW9ucykge1xuXHRcdGxpZmVjeWNsZUV2ZW50cy5hZnRlclJlbW92ZS5jYWxsKHRoaXMsIG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zKTtcblx0fSxcblx0YWZ0ZXJSZXNldDogZnVuY3Rpb24oY29sbGVjdGlvbiwgb3B0aW9ucykge1xuXHRcdGxpZmVjeWNsZUV2ZW50cy5hZnRlclJlc2V0LmNhbGwodGhpcywgY29sbGVjdGlvbiwgb3B0aW9ucyk7XG5cdH0sXG5cblx0Ly8gUHJvdG90eXBlIG1ldGhvZHMuXG5cdGNsb3NlOiBmdW5jdGlvbigpIHtcblx0XHRjbG9zZS5jYWxsKHRoaXMpO1xuXHR9LFxuXHRyZW5kZXI6IGZ1bmN0aW9uKGF0SW5kZXgpIHtcblx0XHRyZW5kZXIuY2FsbCh0aGlzLCBhdEluZGV4KTtcblx0fVxufSk7XG5cblxuXG5cbkNvbXBvbmVudC5wcm90b3R5cGUuaW5pdGlhbGl6ZSA9IGZ1bmN0aW9uKHByb3BlcnRpZXMpIHtcblxuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0Ly8gS2VlcCB0cmFjayBvZiBhIGNvdW50ZXIgZm9yIHVzZSBpbiBnZW5lcmF0aW5nXG5cdC8vIGlkcyBmb3IgYW5vbnltb3VzIGNvbXBvbmVudHMuXG5cdHRoaXMuYW5vbnltb3VzUmVnaW9uQ291bnRlciA9IDA7XG5cblx0Ly8gRGlzYWJsZSBvciBpc3N1ZSB3YXJuaW5ncyBhYm91dCBjZXJ0YWluIHByb3BlcnRpZXNcblx0Ly8gYW5kIG1ldGhvZHMgdG8gYXZvaWQgY29uZnVzaW9uXG5cdHByb3BlcnRpZXMgPSB2YWxpZGF0ZURlZmluaXRpb24ocHJvcGVydGllcyk7XG5cblx0Ly8gRXh0ZW5kIGluc3RhbmNlIHcvIHNwZWNpZmllZCBwcm9wZXJ0aWVzIGFuZCBtZXRob2RzXG5cdF8uZXh0ZW5kKHRoaXMsIHByb3BlcnRpZXMpO1xuXG5cdC8vIFN0YXJ0IHdpdGggZW1wdHkgcmVnaW9ucyBvYmplY3Rcblx0dGhpcy5yZWdpb25zID0ge307XG5cblx0Ly8gRW5jb3VyYWdlIGNoaWxkIG1ldGhvZHMgdG8gdXNlIHRoZSBjb21wb25lbnQgY29udGV4dFxuXHRfLmJpbmRBbGwodGhpcyk7XG59O1xuIiwiLy8gRmlyZWQgd2hlbiB0aGUgYm91bmQgbW9kZWwgaXMgdXBkYXRlZCAoYHRoaXMubW9kZWxgKVxuZXhwb3J0cy5hZnRlckNoYW5nZSA9IGZ1bmN0aW9uIChtb2RlbCwgb3B0aW9ucykge307XG5cbi8vIEZpcmVkIHdoZW4gYSBtb2RlbCBpcyBhZGRlZCB0byB0aGUgYm91bmQgY29sbGVjdGlvbiAoYHRoaXMuY29sbGVjdGlvbmApXG5leHBvcnRzLmFmdGVyQWRkID0gZnVuY3Rpb24gKG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zKSB7fTtcblxuLy8gRmlyZWQgd2hlbiBhIG1vZGVsIGlzIHJlbW92ZWQgZnJvbSB0aGUgYm91bmQgY29sbGVjdGlvbiAoYHRoaXMuY29sbGVjdGlvbmApXG5leHBvcnRzLmFmdGVyUmVtb3ZlID0gZnVuY3Rpb24gKG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zKSB7fTtcblxuLy8gRmlyZWQgd2hlbiB0aGUgYm91bmQgY29sbGVjdGlvbiBpcyB3aXBlZCAoYHRoaXMuY29sbGVjdGlvbmApXG5leHBvcnRzLmFmdGVyUmVzZXQgPSBmdW5jdGlvbiAoY29sbGVjdGlvbiwgb3B0aW9ucykge307XG4iLCIvLyBGaXJlZCBhdXRvbWF0aWNhbGx5IHdoZW4gdGhlIHZpZXcgaXMgaW5pdGlhbGx5IGNyZWF0ZWRcbi8vIG9ubHkgZmlyZWQgYWZ0ZXJ3YXJkcyBpZiB0aGlzLnJlbmRlcigpIGlzIGV4cGxpY2l0bHkgY2FsbGVkXG4vLyBDYWxsYmFjayBtdXN0IGJlIGZpcmVkISFcbmV4cG9ydHMuYmVmb3JlUmVuZGVyID0gZnVuY3Rpb24gKGNiKSB7Y2IoKTt9O1xuXG4vLyBGaXJlZCBhdXRvbWF0aWNhbGx5IHdoZW4gdGhlIHZpZXcgaXMgaW5pdGlhbGx5IGNyZWF0ZWRcbi8vIG9ubHkgZmlyZWQgYWZ0ZXJ3YXJkcyBpZiB0aGlzLnJlbmRlcigpIGlzIGV4cGxpY2l0bHkgY2FsbGVkXG5leHBvcnRzLmFmdGVyUmVuZGVyID0gZnVuY3Rpb24gKCkge307XG5cbi8vIEZpcmVkIGF1dG9tYXRpY2FsbHkgd2hlbiB0aGUgdmlldyBpcyBjbG9zZWRcbmV4cG9ydHMuYmVmb3JlQ2xvc2UgPSBmdW5jdGlvbiAoY2IpIHtjYigpO307XG5cbi8vIEZpcmVkIGJlZm9yZSByZXJlbmRlcmluZyBvciBjbG9zaW5nIGEgdmlldyB0aGF0IGlzIGFscmVhZHkgd2FpdGluZyBvbiBhIGxvY2tcbmV4cG9ydHMuY2FuY2VsUmVuZGVyID0gZnVuY3Rpb24gKCkge1xuXHRGUkFNRVdPUksud2FybignY2FuY2VsUmVuZGVyKCkgc2hvdWxkIGJlIGRlZmluZWQgaWYgYmVmb3JlQ2xvc2UoY2IpIG9yIGJlZm9yZVJlbmRlcihjYiknICtcblx0XHRcdFx0XHRcdFx0XHQgJ2FyZSBiZWluZyB1c2VkIScpO1xufTtcblxuLy8gRmlyZWQgYmVmb3JlIHJlcmVuZGVyaW5nIG9yIGNsb3NpbmcgYSB2aWV3IHRoYXQgaXMgYWxyZWFkeSB3YWl0aW5nIG9uIGEgbG9ja1xuZXhwb3J0cy5jYW5jZWxDbG9zZSA9IGZ1bmN0aW9uICgpIHtcblx0RlJBTUVXT1JLLndhcm4oJ2NhbmNlbENsb3NlKCkgc2hvdWxkIGJlIGRlZmluZWQgaWYgYmVmb3JlQ2xvc2UoY2IpIG9yIGJlZm9yZVJlbmRlcihjYiknICtcblx0XHRcdFx0XHRcdFx0XHQgJ2FyZSBiZWluZyB1c2VkIScpO1xufTtcbiIsIi8qKlxuICogUnVuIEhUTUwgdGVtcGxhdGUgdGhyb3VnaCBlbmdpbmUgYW5kIGFwcGVuZCByZXN1bHRzIHRvIG91dGxldC4gQWxzbyByZXJlbmRlciByZWdpb25zLlxuICogSWYgYXRJbmRleCBpcyBzcGVjaWZpZWQsIHRoZSBjb21wb25lbnQgaXMgcmVuZGVyZWQgYXQgdGhlIGdpdmVuIHBvc2l0aW9uIHdpdGhpbiBpdHNcbiAqIG91dGxldC4gT3RoZXJ3aXNlLCB0aGUgbGFzdCBwb3NpdGlvbiBpcyB1c2VkLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSBhdEluZGV4IFtUaGUgaW5kZXggaW4gd2hpY2ggdG8gcmVuZGVyIHRoaXMgZWxlbWVudF1cbiAqL1xuXG52YXIgRE9NID0gcmVxdWlyZSAoJy4uL3V0aWxzL0RPTScpLFxuXHRcdGhlbHBlcnMgPSByZXF1aXJlKCcuL2hlbHBlcnMnKSxcblx0XHRiaW5kRXZlbnRzID0gcmVxdWlyZSAoJy4vYmluZEV2ZW50cycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHJlbmRlcihhdEluZGV4KSB7XG5cblx0RlJBTUVXT1JLLmRlYnVnKHRoaXMuaWQgKyAnIDotLS06IFJlbmRlcmluZyBjb21wb25lbnQuLi4nKTtcblxuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0Ly8gQ2FuY2VsIGN1cnJlbnQgcmVuZGVyIGFuZCBjbG9zZSBqb2JzLCBpZiB0aGV5J3JlIHJ1bm5pbmdcblx0aWYgKHRoaXMuX3JlbmRlcmluZykge1xuXHRcdEZSQU1FV09SSy5kZWJ1Zyh0aGlzLmlkICsgJyA6OiByZW5kZXIoKSBjYW5jZWxlZC4nKTtcblx0XHR0aGlzLl9yZW5kZXJpbmdDYW5jZWxlZCA9IHRydWU7XG5cdFx0dGhpcy5jYW5jZWxSZW5kZXIoKTtcblx0XHR0aGlzLl9yZW5kZXJpbmcgPSBmYWxzZTtcblx0fVxuXHRpZiAodGhpcy5fY2xvc2luZykge1xuXHRcdEZSQU1FV09SSy5kZWJ1Zyh0aGlzLmlkICsgJyA6OiBjbG9zZSgpIGNhbmNlbGVkLicpO1xuXHRcdHRoaXMuY2FuY2VsQ2xvc2UoKTtcblx0XHR0aGlzLl9jbG9zaW5nID0gZmFsc2U7XG5cdH1cblxuXHQvLyBMb2NrIGFjY2VzcyB0byByZW5kZXJcblx0dGhpcy5fcmVuZGVyaW5nID0gdHJ1ZTtcblxuXHQvLyBUcmlnZ2VyIGJlZm9yZVJlbmRlciBtZXRob2Rcblx0dGhpcy5iZWZvcmVSZW5kZXIoZnVuY3Rpb24gKCkge1xuXG5cdFx0Ly8gSWYgcmVuZGVyaW5nIHdhcyBjYW5jZWxlZCwgYnJlYWsgb3V0XG5cdFx0Ly8gZG8gbm90IHJlbmRlciwgYW5kIGRvIG5vdCBjYWxsIGFmdGVyUmVuZGVyKClcblx0XHRpZiAoIHNlbGYuX3JlbmRlcmluZ0NhbmNlbGVkICkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIC8vIEJpbmQgdGhlIGV2ZW50cyBvbiBtb2RlbC9jb2xsZWN0aW9ucyBhbmQgZ2xvYmFsIHRyaWdnZXJlZCBldmVudHMuXG5cdFx0YmluZEV2ZW50cy5jb2xsZWN0aW9uRXZlbnRzLmNhbGwoc2VsZik7XG5cdFx0YmluZEV2ZW50cy5tb2RlbEV2ZW50cy5jYWxsKHNlbGYpO1xuXHRcdGJpbmRFdmVudHMuZ2xvYmFsVHJpZ2dlcnMuY2FsbChzZWxmKTtcblxuXHRcdC8vIFVubG9jayByZW5kZXJpbmcgbXV0ZXhcblx0XHRzZWxmLl9yZW5kZXJpbmcgPSBmYWxzZTtcblxuXHRcdGlmICghc2VsZi4kb3V0bGV0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3Ioc2VsZi5pZCArICcgOjogVHJ5aW5nIHRvIHJlbmRlcigpLCBidXQgbm8gJG91dGxldCB3YXMgZGVmaW5lZCEnKTtcblx0XHR9XG5cblx0XHQvLyBSZWZyZXNoIGNvbXBpbGVkIHRlbXBsYXRlXG5cdFx0dmFyIGh0bWwgPSBoZWxwZXJzLmNvbXBpbGVUZW1wbGF0ZS5jYWxsKHNlbGYpO1xuXHRcdGlmICghaHRtbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKHRoaXMuaWQgKyAnIDo6IFVuYWJsZSB0byByZW5kZXIgY29tcG9uZW50IGJlY2F1c2UgdGVtcGxhdGUgY29tcGlsYXRpb24gZGlkIG5vdCByZXR1cm4gYW55IEhUTUwuJyk7XG5cdFx0fVxuXG5cdFx0Ly8gU3RyaXAgdHJhaWxpbmcgYW5kIGxlYWRpbmcgd2hpdGVzcGFjZSB0byBhdm9pZCBmYWxzZWx5IGRpYWdub3Npbmdcblx0XHQvLyBtdWx0aXBsZSBlbGVtZW50cywgd2hlbiBvbmx5IG9uZSBhY3R1YWxseSBleGlzdHNcblx0XHQvLyAodGhpcyBtaXNkaWFnbm9zaXMgd3JhcHMgdGhlIHRlbXBsYXRlIGluIGFuIGV4dHJhbmVvdXMgPGRpdj4pXG5cdFx0aHRtbCA9IGh0bWwucmVwbGFjZSgvXlxccyovLCAnJyk7XG5cdFx0aHRtbCA9IGh0bWwucmVwbGFjZSgvXFxzKiQvLCAnJyk7XG5cdFx0aHRtbCA9IGh0bWwucmVwbGFjZSgvKFxccnxcXG4pKi8sICcnKTtcblxuXHRcdC8vIFN0cmlwIEhUTUwgY29tbWVudHMsIHRoZW4gc3RyaXAgd2hpdGVzcGFjZSBhZ2FpblxuXHRcdC8vIChUT0RPOiBvcHRpbWl6ZSB0aGlzKVxuXHRcdGh0bWwgPSBodG1sLnJlcGxhY2UoLyg8IS0tListLT4pKi8sICcnKTtcblx0XHRodG1sID0gaHRtbC5yZXBsYWNlKC9eXFxzKi8sICcnKTtcblx0XHRodG1sID0gaHRtbC5yZXBsYWNlKC9cXHMqJC8sICcnKTtcblx0XHRodG1sID0gaHRtbC5yZXBsYWNlKC8oXFxyfFxcbikqLywgJycpO1xuXG5cdFx0Ly8gUGFyc2UgYSBET00gbm9kZSBvciBzZXJpZXMgb2YgRE9NIG5vZGVzIGZyb20gdGhlIG5ld2x5IHRlbXBsYXRlZCBIVE1MXG5cdFx0dmFyIHBhcnNlZE5vZGVzID0gJC5wYXJzZUhUTUwoaHRtbCk7XG5cdFx0dmFyIGVsID0gcGFyc2VkTm9kZXNbMF07XG5cblx0XHQvLyBJZiBubyBub2RlcyB3ZXJlIHBhcnNlZCwgdGhyb3cgYW4gZXJyb3Jcblx0XHRpZiAocGFyc2VkTm9kZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3Ioc2VsZi5pZCArICcgOjogcmVuZGVyKCkgcmFuIGludG8gYSBwcm9ibGVtIHJlbmRlcmluZyB0aGUgdGVtcGxhdGUgd2l0aCBIVE1MID0+IFxcbicraHRtbCk7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgdGhlcmUgaXMgbm90IG9uZSBzaW5nbGUgd3JhcHBlciBlbGVtZW50LFxuXHRcdC8vIG9yIGlmIHRoZSByZW5kZXJlZCB0ZW1wbGF0ZSBjb250YWlucyBvbmx5IGEgc2luZ2xlIHRleHQgbm9kZSxcblx0XHQvLyAob3IganVzdCBhIGxvbmUgcmVnaW9uKVxuXHRcdGVsc2UgaWYgKHBhcnNlZE5vZGVzLmxlbmd0aCA+IDEgfHwgcGFyc2VkTm9kZXNbMF0ubm9kZVR5cGUgPT09IDMgfHxcblx0XHRcdFx0XHRcdCAkKHBhcnNlZE5vZGVzWzBdKS5pcygncmVnaW9uJykpIHtcblxuXHRcdFx0RlJBTUVXT1JLLmxvZyhzZWxmLmlkICsgJyA6OiBXcmFwcGluZyB0ZW1wbGF0ZSBpbiA8ZGl2Lz4uLi4nLCBwYXJzZWROb2Rlcyk7XG5cblx0XHRcdC8vIHdyYXAgdGhlIGh0bWwgdXAgaW4gYSBjb250YWluZXIgPGRpdi8+XG5cdFx0XHRlbCA9ICQoJzxkaXYvPicpLmFwcGVuZChodG1sKTtcblx0XHRcdGVsID0gZWxbMF07XG5cdFx0fVxuXG5cdFx0Ly8gU2V0IEJhY2tib25lIGVsZW1lbnQgKGNhY2hlIGFuZCByZWRlbGVnYXRlIERPTSBldmVudHMpXG5cdFx0Ly8gKFdpbGwgYWxzbyB1cGRhdGUgc2VsZi4kZWwpXG5cdFx0c2VsZi5zZXRFbGVtZW50KGVsKTtcblx0XHQvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxuXG5cdFx0Ly8gRGV0ZWN0IGFuZCByZW5kZXIgYWxsIHJlZ2lvbnMgYW5kIHRoZWlyIGRlc2NlbmRlbnQgY29tcG9uZW50cyBhbmQgcmVnaW9uc1xuXHRcdGhlbHBlcnMucmVuZGVyUmVnaW9ucy5jYWxsKHNlbGYpO1xuXG5cdFx0Ly8gSW5zZXJ0IHRoZSBlbGVtZW50IGF0IHRoZSBwcm9wZXIgcGxhY2UgYW1vbmdzdCB0aGUgb3V0bGV0J3MgY2hpbGRyZW5cblx0XHR2YXIgbmVpZ2hib3JzID0gc2VsZi4kb3V0bGV0LmNoaWxkcmVuKCk7XG5cdFx0aWYgKF8uaXNGaW5pdGUoYXRJbmRleCkgJiYgbmVpZ2hib3JzLmxlbmd0aCA+IDAgJiYgbmVpZ2hib3JzLmxlbmd0aCA+IGF0SW5kZXgpIHtcblx0XHRcdG5laWdoYm9ycy5lcShhdEluZGV4KS5iZWZvcmUoc2VsZi4kZWwpO1xuXHRcdH1cblxuXHRcdC8vIEJ1dCBpZiB0aGUgb3V0bGV0IGlzIGVtcHR5LCBvciB0aGVyZSdzIG5vIGF0SW5kZXgsIGp1c3Qgc3RpY2sgaXQgb24gdGhlIGVuZFxuXHRcdGVsc2Ugc2VsZi4kb3V0bGV0LmFwcGVuZChzZWxmLiRlbCk7XG5cblx0XHQvLyBGaW5hbGx5LCB0cmlnZ2VyIGFmdGVyUmVuZGVyIG1ldGhvZFxuXHRcdHNlbGYuYWZ0ZXJSZW5kZXIoKTtcblxuXHRcdC8vIEFkZCBkYXRhIGF0dHJpYnV0ZXMgdG8gdGhpcyBjb21wb25lbnQncyAkZWwsIHByb3ZpZGluZyBhY2Nlc3Ncblx0XHQvLyB0byB3aGV0aGVyIHRoZSBlbGVtZW50IGhhcyB2YXJpb3VzIERPTSBiaW5kaW5ncyBmcm9tIHN0eWxlc2hlZXRzLlxuXHRcdC8vIChoYW5keSBmb3IgZGlzYWJsaW5nIHRleHQgc2VsZWN0aW9uIGFjY29yZGluZ2x5LCBldGMuKVxuXHRcdC8vXG5cdFx0Ly8gLT4gZGlzYWJsZSBmb3IgdGhpcyBjb21wb25lbnQgd2l0aCBgdGhpcy5hdHRyRmxhZ3MgPSBmYWxzZWBcblx0XHQvLyAtPiBvciBnbG9iYWxseSB3aXRoIGBGUkFNRVdPUksuYXR0ckZsYWdzID0gZmFsc2VgXG5cdFx0Ly9cblx0XHQvLyBUT0RPOiBtYWtlIGl0IHdvcmsgd2l0aCBkZWxlZ2F0ZWQgRE9NIGV2ZW50IGJpbmRpbmdzXG5cdFx0Ly9cblx0XHRpZiAoc2VsZi5hdHRyRmxhZ3MgIT09IGZhbHNlICYmIEZSQU1FV09SSy5hdHRyRmxhZ3MgIT09IGZhbHNlKSB7XG5cdFx0XHRET00uZmxhZ0JvdW5kRXZlbnRzKHNlbGYpO1xuXHRcdH1cblx0fSk7XG59XG4iLCIvKipcbiAqIENoZWNrIHRoZSBzcGVjaWZpZWQgZGVmaW5pdGlvbiBmb3Igb2J2aW91cyBtaXN0YWtlcywgZXNwZWNpYWxseSBsaWtlbHkgZGVwcmVjYXRpb25zIGFuZFxuICogdmFsaWRhdGUgdGhhdCB0aGUgbW9kZWwgYW5kIGNvbGxlY3Rpb25zIGFyZSBpbnN0YW5jZXMgb2YgQmFja2JvbmUncyBEYXRhIHN0cnVjdHVyZXMuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IHByb3BlcnRpZXMgW09iamVjdCBjb250YWluaW5nIHRoZSBwcm9wZXJ0aWVzIG9mIHRoZSBjb21wb25lbnRdXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB2YWxpZGF0ZURlZmluaXRpb24ocHJvcGVydGllcykge1xuXG5cdGlmIChfLmlzT2JqZWN0KHByb3BlcnRpZXMpKSB7XG5cblx0XHQvLyBEZXRlcm1pbmUgY29tcG9uZW50IGlkXG5cdFx0dmFyIGlkID0gdGhpcy5pZCB8fCBwcm9wZXJ0aWVzLmlkO1xuXG5cdFx0ZnVuY3Rpb24gX3ZhbGlkYXRlQmFja2JvbmVJbnN0YW5jZSAodHlwZSkge1xuXHRcdFx0dmFyIFR5cGUgPSB0eXBlWzBdLnRvVXBwZXJDYXNlKCkgKyB0eXBlLnNsaWNlKDEpO1xuXG5cdFx0XHRpZiAoICFwcm9wZXJ0aWVzW3R5cGVdIGluc3RhbmNlb2YgQmFja2JvbmVbVHlwZV0gKSB7XG5cblx0XHRcdFx0RnJhbWV3b3JrLmVycm9yKFxuXHRcdFx0XHRcdCdDb21wb25lbnQgKCcgKyBpZCArICcpIGhhcyBhbiBpbnZhbGlkICcgKyB0eXBlICsgJy0tIFxcbicgK1xuXHRcdFx0XHRcdCdJZiBgJyArIHR5cGUgKyAnYCBpcyBzcGVjaWZpZWQgZm9yIGEgY29tcG9uZW50LCAnICtcblx0XHRcdFx0XHQnaXQgbXVzdCBiZSBhbiAqaW5zdGFuY2UqIG9mIGEgQmFja2JvbmUuJyArIFR5cGUgKyAnLlxcbicpO1xuXG5cdFx0XHRcdGlmIChwcm9wZXJ0aWVzW3R5cGVdIGluc3RhbmNlb2YgQmFja2JvbmVbVHlwZV0uY29uc3RydWN0b3IpIHtcblx0XHRcdFx0XHRGcmFtZXdvcmsuZXJyb3IoXG5cdFx0XHRcdFx0XHQnSXQgbG9va3MgbGlrZSBhIEJhY2tib25lLicgKyBUeXBlICsgJyAqcHJvdG90eXBlKiB3YXMgc3BlY2lmaWVkIGluc3RlYWQgb2YgYSAnICtcblx0XHRcdFx0XHRcdCdCYWNrYm9uZS4nICsgVHlwZSArICcgKmluc3RhbmNlKi5cXG4nICtcblx0XHRcdFx0XHRcdCdQbGVhc2UgYG5ld2AgdXAgdGhlICcgKyB0eXBlICsgJyAtYmVmb3JlLSAnICsgRnJhbWV3b3JrLmlkICsgJy5yYWlzZSgpLCcgK1xuXHRcdFx0XHRcdFx0J29yIHVzZSBhIHdyYXBwZXIgZnVuY3Rpb24gdG8gYWNoaWV2ZSB0aGUgc2FtZSBlZmZlY3QsIGUuZy46XFxuJyArXG5cdFx0XHRcdFx0XHQnYCcgKyB0eXBlICsgJzogZnVuY3Rpb24gKCkge1xcbnJldHVybiBuZXcgU29tZScgKyBUeXBlICsgJygpO1xcbn1gJ1xuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRGcmFtZXdvcmsud2FybignSWdub3JpbmcgaW52YWxpZCAnICsgdHlwZSArICcgOjogJyArIHByb3BlcnRpZXNbdHlwZV0pO1xuXHRcdFx0XHRkZWxldGUgcHJvcGVydGllc1t0eXBlXTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDaGVjayB0aGF0IHRoaXMuY29sbGVjdGlvbiBpcyBhY3R1YWxseSBhbiBpbnN0YW5jZSBvZiBCYWNrYm9uZS5Db2xsZWN0aW9uXG5cdFx0Ly8gYW5kIHRoYXQgdGhpcy5tb2RlbCBpcyBhY3R1YWxseSBhbiBpbnN0YW5jZSBvZiBCYWNrYm9uZS5Nb2RlbFxuXHRcdF92YWxpZGF0ZUJhY2tib25lSW5zdGFuY2UoJ21vZGVsJyk7XG5cdFx0X3ZhbGlkYXRlQmFja2JvbmVJbnN0YW5jZSgnY29sbGVjdGlvbicpO1xuXG5cdFx0Ly8gQ2xvbmUgcHJvcGVydGllcyB0byBhdm9pZCBpbmFkdmVydGVudCBtb2RpZmljYXRpb25zXG5cdFx0cmV0dXJuIF8uY2xvbmUocHJvcGVydGllcyk7XG5cdH1cblxuXHRlbHNlIHJldHVybiB7fTtcblxufVxuIiwiLyoqXG4gKiBSdW4gZGVmaW5pdGlvbiBtZXRob2RzIHRvIGdldCBhY3R1YWwgY29tcG9uZW50IGRlZmluaXRpb25zLlxuICogVGhpcyBpcyBkZWZlcnJlZCB0byBhdm9pZCBoYXZpbmcgdG8gdXNlIEJhY2tib25lJ3MgZnVuY3Rpb24gKCkge30gYXBwcm9hY2ggZm9yIHRoaW5nc1xuICogbGlrZSBjb2xsZWN0aW9ucy5cbiAqL1xuXG4vKipcbiAqIEJ1aWxkIHVwcyBhIGNvbXBvbmVudCBkZWZpbml0aW9uIGJ5IHJ1bm5pbmcgdGhlIGRlZmluaXRpb24uIFdlIHRoZW4gbGluayB0aGVcbiAqIGNvbXBvbmVudCBkZWZpbml0aW9uIHRvIGFuIGlkZW50aWZpZXIgaW4gYEZSQU1FV09SSy5jb21wb25lbnRzYC5cbiAqXG4gKiBAcGFyYW0gIHtPYmplY3R9IGNvbXBvbmVudCBbT2JqZWN0IGNvbnRhaW5pbmcgdGhlIGRlZmluaXRpb24gZnVuY3Rpb24gb2YgdGhlIGNvbXBvbmVudF1cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBidWlsZENvbXBvbmVudERlZmluaXRpb24oY29tcG9uZW50KSB7XG5cdHZhciBjb21wb25lbnREZWYgPSBjb21wb25lbnQuZGVmaW5pdGlvbigpO1xuXG5cdGlmIChjb21wb25lbnQuaWRPdmVycmlkZSkge1xuXHRcdGlmIChjb21wb25lbnREZWYuaWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihjb21wb25lbnQuaWRPdmVycmlkZSArICc6OiBDYW5ub3Qgc3BlY2lmeSBhbiBpZE92ZXJyaWRlIGluIC5kZWZpbmUoKSBpZiBhbiBpZCBwcm9wZXJ0eSAoJytjb21wb25lbnREZWYuaWQrJykgaXMgYWxyZWFkeSBzZXQgaW4geW91ciBjb21wb25lbnQgZGVmaW5pdGlvbiFcXG5Vc2FnZTogLmRlZmluZShbaWRPdmVycmlkZV0sIGRlZmluaXRpb24pJyk7XG5cdFx0fVxuXHRcdGNvbXBvbmVudERlZi5pZCA9IGNvbXBvbmVudC5pZE92ZXJyaWRlO1xuXHR9XG5cdGlmICghY29tcG9uZW50RGVmLmlkKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgdXNlIC5kZWZpbmUoKSB3aXRob3V0IGRlZmluaW5nIGFuIGlkIHByb3BlcnR5IG9yIG92ZXJyaWRlIGluIHlvdXIgY29tcG9uZW50IVxcblVzYWdlOiAuZGVmaW5lKFtpZE92ZXJyaWRlXSwgZGVmaW5pdGlvbiknKTtcblx0fVxuXHRGUkFNRVdPUksuY29tcG9uZW50c1tjb21wb25lbnREZWYuaWRdID0gY29tcG9uZW50RGVmO1xufTtcbiIsIi8qKlxuICogT3B0aW9uYWwgbWV0aG9kIHRvIHJlcXVpcmUgYXBwIGNvbXBvbmVudHMuIFJlcXVpcmUuanMgY2FuIGJlIHVzZWQgaW5zdGVhZFxuICogYXMgbmVlZGVkLlxuICpcbiAqIEBwYXJhbSAge1N0cmluZ30gXHRbKG9wdGlvbmFsKSBDb21wb25lbnQgaWQgb3ZlcnJpZGVdXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gW0Z1bmN0aW9uIERlZmluaXRpb24gb2YgY29tcG9uZW50XVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGRlZmluZShpZCwgZGVmaW5pdGlvbkZuKSB7XG5cdC8vIElkIHBhcmFtIGlzIG9wdGlvbmFsXG5cdGlmICghZGVmaW5pdGlvbkZuKSB7XG5cdFx0ZGVmaW5pdGlvbkZuID0gaWQ7XG5cdFx0aWQgPSBudWxsO1xuXHR9XG5cblx0RlJBTUVXT1JLLl9kZWZpbmVRdWV1ZS5wdXNoKHtcblx0XHRkZWZpbml0aW9uOiBkZWZpbml0aW9uRm4sXG5cdFx0aWRPdmVycmlkZTogaWRcblx0fSk7XG59O1xuIiwiLyoqXG4gKiBNYXN0IGJ1aWxkIGZpbGUuIFRoZSBtYWluIGZpbGVcbiAqL1xuXG52YXIgZGVmaW5lID0gcmVxdWlyZSgnLi9kZWZpbmUvaW5kZXgnKTtcbnZhciBSZWdpb24gPSByZXF1aXJlKCcuL3JlZ2lvbi9pbmRleCcpO1xudmFyIENvbXBvbmVudCA9IHJlcXVpcmUoJy4vY29tcG9uZW50L2luZGV4Jyk7XG52YXIgcmFpc2UgPSByZXF1aXJlKCcuL3JhaXNlL2luZGV4Jyk7XG5cbi8qKlxuICogRnJhbWV3b3JrIGNsYXNzIGRlZmluaXRpb24gdGhhdCB3aWxsIGNyZWF0ZSBhIG5ldyBnbG9iYWwgaW5zdGFuY2Ugb2YgYSBjdXN0b20gRnJhbWV3b3JrLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIFtvcHRpb25zIGhhc2ggdG8gaW5pdGlhbGl6ZSB0aGUgY3VzdG9tIGZyYW1ld29yayB3aXRoXVxuICovXG5GcmFtZXdvcmsgPSBmdW5jdGlvbihvcHRpb25zKSB7XG5cdC8vIFNldCB0aGUgZGVmYXVsdCBvcHRpb25zIGZvciB0aG9zZSBub3QgcGFzc2VkIGluLlxuXHRvcHRpb25zID0gXy5kZWZhdWx0cyhvcHRpb25zLCB7XG5cdFx0bG9nTGV2ZWw6ICd3YXJuJyxcblx0XHRmcmFtZXdvcmtJZDogJ01hc3QnLFxuXHRcdHNob3J0Y3V0OiB7XG5cdFx0XHR0ZW1wbGF0ZTogdHJ1ZSxcblx0XHRcdGNvdW50OiB0cnVlXG5cdFx0fVxuXHR9KTtcblxuXHQvLyBTZXQgYSBzdGFydGluZyBwb2ludCB0byBCYWNrYm9uZSBhbmQgYWRkIGFkZGl0aW9uYWwgYXR0cmlidXRlLlxuXHRfLmV4dGVuZCh0aGlzLCBCYWNrYm9uZSwge1xuXHRcdG9wdGlvbnM6IG9wdGlvbnMsXG5cdFx0dGVtcGxhdGVzOiB7fSxcblx0XHRjb21wb25lbnRzOiB7fSxcblx0XHRkYXRhOiB7fSxcblx0XHRfZGVmaW5lUXVldWU6IFtdLFxuXHRcdHJlZ2lvbnM6IHt9XG5cdH0pO1xuXG5cdC8vIEV4cG9zZSBhIGdsb2JhbCBmb3IgdGhlIGN1c3RvbSBmcmFtZXdvcmsuXG5cdHZhciBmcmFtZXdvcmtOYW1lID0gb3B0aW9ucy5mcmFtZXdvcmtJZDtcblx0d2luZG93W2ZyYW1ld29ya05hbWVdID0gdGhpc1xuXG5cdC8vIFRocm91Z2h0b3V0IHRoZSBzb3VyY2UgY29kZSwgdGhlcmUgYXJlIG9wZXJhdGlvbnMgb24gYEZSQU1FV09SS2Agb3IgY29kZSB0aGF0IGFjY2Vzc2VzXG5cdC8vIGl0cyBhdHRyaWJ1dGVzLiBXZSB3aWxsIG1ha2UgYEZSQU1FV09SS2AgYWNjZXNzYWJsZSBieSBhc3NpZ25pbmcgaXQgdGhlIGluc3RhbmNlIG9mIHRoZVxuXHQvLyBjdXN0b20gRnJhbWV3b3JrLlxuXHRGUkFNRVdPUksgPSB3aW5kb3dbZnJhbWV3b3JrTmFtZV07XG59XG5cbi8vIEZyYW1ld29yayBwcm90b3R5cGUgbWV0aG9kcy5cbkZyYW1ld29yay5wcm90b3R5cGUuUmVnaW9uID0gUmVnaW9uO1xuRnJhbWV3b3JrLnByb3RvdHlwZS5Db21wb25lbnQgPSBDb21wb25lbnQ7XG5GcmFtZXdvcmsucHJvdG90eXBlLmRlZmluZSA9IGRlZmluZTtcbkZyYW1ld29yay5wcm90b3R5cGUucmFpc2UgPSByYWlzZTtcblxuIiwiLyoqXG4gKlx0TG9nZ2V0IGNvbnN0cnVjdG9yIG1ldGhvZCB0aGF0IHdpbGwgc2V0dXAgRlJBTUVXT1JLIHRvIGxvZyBtZXNzYWdlcy5cbiAqL1xuXG52YXIgc2V0dXBMb2dnZXIgPSByZXF1aXJlKCcuL3NldHVwJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gTG9nZ2VyKCkge1xuXG5cdC8vIFVwb24gaW5pdGlhbGl6YXRpb24sIHNldHVwIGxvZ2dlclxuXHRzZXR1cExvZ2dlcihGUkFNRVdPUksub3B0aW9ucy5sb2dMZXZlbCk7XG5cblx0Ly8gSW4gc3VwcG9ydGVkIGJyb3dzZXJzLCBhbHNvIHJ1biBzZXR1cExvZ2dlciBhZ2FpblxuXHQvLyB3aGVuIEZSQU1FV09SSy5sb2dMZXZlbCBpcyBzZXQgYnkgdGhlIHVzZXJcblx0aWYgKF8uaXNGdW5jdGlvbihGUkFNRVdPUksuX19kZWZpbmVTZXR0ZXJfXykpIHtcblx0XHRGUkFNRVdPUksuX19kZWZpbmVTZXR0ZXJfXygnbG9nTGV2ZWwnLCBmdW5jdGlvbiBvbkNoYW5nZSAobmV3TG9nTGV2ZWwpIHtcblx0XHRcdHNldHVwTG9nZ2VyKG5ld0xvZ0xldmVsKTtcblx0XHR9KTtcblx0fVxufTtcbiIsIi8qKlxuICogU2V0IHVwIHRoZSBsb2cgZnVuY3Rpb25zOlxuICpcbiAqIEZSQU1FV09SSy5lcnJvclxuICogRlJBTUVXT1JLLndhcm5cbiAqIEZSQU1FV09SSy5sb2dcbiAqIEZSQU1FV09SSy5kZWJ1ZyAoKmxlZ2FjeSlcbiAqIEZSQU1FV09SSy52ZXJib3NlXG4gKlxuICogQHBhcmFtICB7U3RyaW5nfSBsb2dMZXZlbCBbVGhlIGRlc2lyZWQgbG9nIGxldmVsIG9mIHRoZSBMb2dnZXJdXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gc2V0dXBMb2dnZXIgKGxvZ0xldmVsKSB7XG5cblx0dmFyIG5vb3AgPSBmdW5jdGlvbiAoKSB7fTtcblxuXHQvLyBJZiBsb2cgaXMgc3BlY2lmaWVkLCB1c2UgaXQsIG90aGVyd2lzZSB1c2UgdGhlIGNvbnNvbGVcblx0aWYgKEZSQU1FV09SSy5sb2dnZXIpIHtcblx0XHRGUkFNRVdPUksuZXJyb3IgICAgID0gRlJBTUVXT1JLLmxvZ2dlci5lcnJvcjtcblx0XHRGUkFNRVdPUksud2FybiAgICAgID0gRlJBTUVXT1JLLmxvZ2dlci53YXJuO1xuXHRcdEZSQU1FV09SSy5sb2cgICAgICAgPSBGUkFNRVdPUksubG9nZ2VyLmRlYnVnIHx8IEZSQU1FV09SSy5sb2dnZXI7XG5cdFx0RlJBTUVXT1JLLnZlcmJvc2UgICA9IEZSQU1FV09SSy5sb2dnZXIudmVyYm9zZTtcblx0fVxuXG5cdC8vIEluIElFLCB3ZSBjYW4ndCBkZWZhdWx0IHRvIHRoZSBicm93c2VyIGNvbnNvbGUgYmVjYXVzZSB0aGVyZSBJUyBOTyBCUk9XU0VSIENPTlNPTEVcblx0ZWxzZSBpZiAodHlwZW9mIGNvbnNvbGUgIT09ICd1bmRlZmluZWQnKSB7XG5cblx0XHQvLyBXZSBjYW5ub3QgY2FsbGVkIHRoZSAuYmluZCBtZXRob2Qgb24gdGhlIGNvbnNvbGUgbWV0aG9kcy4gV2UgYXJlIGluIGllIDkgb3IgOCwganVzdCBtYWtlXG5cdFx0Ly8gZXZlcnlodGluZyBhIG5vb3AuXG5cdFx0aWYgKF8uaXNVbmRlZmluZWQoY29uc29sZS5sb2cuYmluZCkpICB7XG5cdFx0XHRGUkFNRVdPUksuZXJyb3IgICAgID0gbm9vcDtcblx0XHRcdEZSQU1FV09SSy53YXJuICAgICAgPSBub29wO1xuXHRcdFx0RlJBTUVXT1JLLmxvZyAgICAgICA9IG5vb3A7XG5cdFx0XHRGUkFNRVdPUksuZGVidWcgICAgID0gbm9vcDtcblx0XHRcdEZSQU1FV09SSy52ZXJib3NlICAgPSBub29wO1xuXHRcdH1cblxuXHRcdC8vIFdlIGFyZSBpbiBhIGZyaWVuZGx5IGJyb3dzZXIgbGlrZSBDaHJvbWUsIEZpcmVmb3gsIG9yIElFMTBcblx0XHRlbHNlIHtcblx0XHRcdEZSQU1FV09SSy5lcnJvclx0XHQ9IGNvbnNvbGUuZXJyb3IgJiYgY29uc29sZS5lcnJvci5iaW5kKGNvbnNvbGUpO1xuXHRcdFx0RlJBTUVXT1JLLndhcm5cdFx0PSBjb25zb2xlLndhcm4gJiYgY29uc29sZS53YXJuLmJpbmQoY29uc29sZSk7XG5cdFx0XHRGUkFNRVdPUksubG9nXHRcdFx0PSBjb25zb2xlLmRlYnVnICYmIGNvbnNvbGUuZGVidWcuYmluZChjb25zb2xlKTtcblx0XHRcdEZSQU1FV09SSy52ZXJib3NlXHQ9IGNvbnNvbGUubG9nICYmIGNvbnNvbGUubG9nLmJpbmQoY29uc29sZSk7XG5cblx0XHRcdC8vIFVzZSBsb2cgbGV2ZWwgY29uZmlnIGlmIHByb3ZpZGVkXG5cdFx0XHRzd2l0Y2ggKGxvZ0xldmVsKSB7XG5cdFx0XHRcdGNhc2UgJ3ZlcmJvc2UnOiBicmVhaztcblxuXHRcdFx0XHRjYXNlICdkZWJ1Zyc6XG5cdFx0XHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UgPSBub29wO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgJ3dhcm4nOlxuXHRcdFx0XHRcdEZSQU1FV09SSy52ZXJib3NlID0gRlJBTUVXT1JLLmxvZyA9IG5vb3A7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSAnZXJyb3InOlxuXHRcdFx0XHRcdEZSQU1FV09SSy52ZXJib3NlID0gRlJBTUVXT1JLLmxvZyA9IEZSQU1FV09SSy53YXJuID0gbm9vcDtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlICdzaWxlbnQnOlxuXHRcdFx0XHRcdEZSQU1FV09SSy52ZXJib3NlID0gRlJBTUVXT1JLLmxvZyA9IEZSQU1FV09SSy53YXJuID0gRlJBTUVXT1JLLmVycm9yID0gbm9vcDtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvciAoJ1VucmVjb2duaXplZCBsb2dnaW5nIGxldmVsIGNvbmZpZyAnICtcblx0XHRcdFx0XHQnKCcgKyBGUkFNRVdPUksub3B0aW9ucy5mcmFtZXdvcmtJZCArICcubG9nTGV2ZWwgPSBcIicgKyBsb2dMZXZlbCArICdcIiknKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU3VwcG9ydCBmb3IgYGRlYnVnYCBmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHlcblx0XHRcdEZSQU1FV09SSy5kZWJ1ZyA9IEZSQU1FV09SSy5sb2c7XG5cblx0XHRcdC8vIFZlcmJvc2Ugc3BpdHMgb3V0IGxvZyBsZXZlbFxuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UoJ0xvZyBsZXZlbCBzZXQgdG8gOjogJywgbG9nTGV2ZWwpO1xuXHRcdH1cblx0fVxufVxuIiwiLyoqXG4gKiBHaXZlbiBhIGNvbXBvbmVudCBkZWZpbml0aW9uIGFuZCBpdHMga2V5LCB3ZSB3aWxsIGJ1aWxkIHVwIHRoZSBjb21wb25lbnQgcHJvdG90eXBlIGFuZCBtZXJnZVxuICogdGhpcyBjb21wb25lbnQgd2l0aCBpdHMgbWF0Y2hpbmcgdGVtcGxhdGUuXG4gKlxuICogQHBhcmFtICB7T2JqZWN0fSBjb21wb25lbnREZWYgW09iamVjdCBjb250YWluaW5nIHRoZSBjb21wb25lbnQgZGVmaW5pdGlvbl1cbiAqIEBwYXJhbSAge1N0cmluZ30gY29tcG9uZW50S2V5IFtUaGUgY29tcG9uZW50IGlkZW50aWZpZXJdXG4gKi9cblxudmFyIHRyYW5zbGF0ZVNob3J0aGFuZCA9IHJlcXVpcmUoJy4uL3V0aWxzL3Nob3J0aGFuZCcpO1xudmFyIFV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMvdXRpbHMnKTtcbnZhciBFdmVudHMgPSByZXF1aXJlKCcuLi91dGlscy9ldmVudHMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBidWlsZENvbXBvbmVudFByb3RvdHlwZShjb21wb25lbnREZWYsIGNvbXBvbmVudEtleSkge1xuXG5cdC8vIElmIGNvbXBvbmVudCBpZCBpcyBub3QgZXhwbGljaXRseSBzZXQsIHVzZSB0aGUgY29tcG9uZW50S2V5XG5cdGlmICghY29tcG9uZW50RGVmLmlkKSB7XG5cdFx0Y29tcG9uZW50RGVmLmlkID0gY29tcG9uZW50S2V5O1xuXHR9XG5cblx0Ly8gU2VhcmNoIHRlbXBsYXRlc1xuXHR2YXIgdGVtcGxhdGUgPSBGUkFNRVdPUksudGVtcGxhdGVzW2NvbXBvbmVudERlZi5pZF07XG5cblx0Ly8gSWYgbm8gbWF0Y2ggZm9yIGNvbXBvbmVudCB3YXMgZm91bmTCoGluIHRlbXBsYXRlcywgaXNzdWUgYSB3YXJuaW5nXG5cdGlmICghdGVtcGxhdGUpIHtcblx0XHRyZXR1cm4gRlJBTUVXT1JLLndhcm4oXG5cdFx0XHRjb21wb25lbnREZWYuaWQgKyAnIDo6IE5vIHRlbXBsYXRlIGZvdW5kIGZvciBjb21wb25lbnQhJyArXG5cdFx0XHQnXFxuVGVtcGxhdGVzIGRvblxcJ3QgbmVlZCBhIGNvbXBvbmVudCB1bmxlc3MgeW91IHdhbnQgaW50ZXJhY3Rpdml0eSwgJyArXG5cdFx0XHQnZXZlcnkgY29tcG9uZW50ICpzaG91bGQqIGhhdmUgYSBtYXRjaGluZyB0ZW1wbGF0ZSEhJyArXG5cdFx0XHQnXFxuVXNpbmcgY29tcG9uZW50cyB3aXRob3V0IHRlbXBsYXRlcyBtYXkgc2VlbSBuZWNlc3NhcnksICcgK1xuXHRcdFx0J2J1dCBpdFxcJ3Mgbm90LiAgSXQgbWFrZXMgeW91ciB2aWV3IGxvZ2ljIGluY29ycG9yZWFsLCBhbmQgbWFrZXMgeW91ciBjb2xsZWFndWVzICcgK1xuXHRcdFx0J3VuY29tZm9ydGFibGUuJyk7XG5cdH1cblxuXHQvLyBTYXZlIHJlZmVyZW5jZSB0byB0ZW1wbGF0ZSBpbiBjb21wb25lbnQgcHJvdG90eXBlXG5cdEZSQU1FV09SSy52ZXJib3NlKGNvbXBvbmVudERlZi5pZCArICcgOjogUGFpcmluZyBjb21wb25lbnQgd2l0aCB0ZW1wbGF0ZS4uLicpO1xuXHRjb21wb25lbnREZWYudGVtcGxhdGUgPSB0ZW1wbGF0ZTtcblxuXHQvLyBUcmFuc2xhdGUgcmlnaHQtaGFuZCBzaG9ydGhhbmQgZm9yIHRvcC1sZXZlbCBrZXlzXG5cdGNvbXBvbmVudERlZiA9IFV0aWxzLm9iak1hcChjb21wb25lbnREZWYsIHRyYW5zbGF0ZVNob3J0aGFuZCk7XG5cblxuXHQvLyBhbmQgZXZlbnRzIG9iamVjdFxuXHRpZiAoY29tcG9uZW50RGVmLmV2ZW50cykge1xuXHRcdGNvbXBvbmVudERlZi5ldmVudHMgPSBVdGlscy5vYmpNYXAoXG5cdFx0XHRjb21wb25lbnREZWYuZXZlbnRzLFxuXHRcdFx0dHJhbnNsYXRlU2hvcnRoYW5kXG5cdFx0KTtcblx0fVxuXG5cdC8vIGFuZCBhZnRlckNoYW5nZSBiaW5kaW5nc1xuXHRpZiAoXy5pc09iamVjdChjb21wb25lbnREZWYuYWZ0ZXJDaGFuZ2UpICYmICFfLmlzRnVuY3Rpb24oY29tcG9uZW50RGVmLmFmdGVyQ2hhbmdlKSkge1xuXHRcdGNvbXBvbmVudERlZi5hZnRlckNoYW5nZSA9IFV0aWxzLm9iak1hcChcblx0XHRcdGNvbXBvbmVudERlZi5hZnRlckNoYW5nZSxcblx0XHRcdHRyYW5zbGF0ZVNob3J0aGFuZFxuXHRcdCk7XG5cdH1cblxuXHQvLyBHbyBhaGVhZCBhbmQgdHVybiB0aGUgZGVmaW5pdGlvbiBpbnRvIGEgcmVhbCBjb21wb25lbnQgcHJvdG90eXBlXG5cdEZSQU1FV09SSy52ZXJib3NlKGNvbXBvbmVudERlZi5pZCArICcgOjogQnVpbGRpbmcgY29tcG9uZW50IHByb3RvdHlwZS4uLicpO1xuXHR2YXIgY29tcG9uZW50UHJvdG90eXBlID0gRlJBTUVXT1JLLkNvbXBvbmVudC5leHRlbmQoY29tcG9uZW50RGVmKTtcblxuXHQvLyBEaXNjb3ZlciBzdWJzY3JpcHRpb25zXG5cdGNvbXBvbmVudFByb3RvdHlwZS5wcm90b3R5cGUuc3Vic2NyaXB0aW9ucyA9IHt9O1xuXG5cdC8vIEl0ZXJhdGUgdGhyb3VnaCBlYWNoIHByb3BlcnR5IG9uIHRoaXMgY29tcG9uZW50IHByb3RvdHlwZVxuXHRfLmVhY2goY29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZSwgZnVuY3Rpb24gKGhhbmRsZXIsIGtleSkge1xuXG5cdFx0Ly8gRGV0ZWN0IERPTSBldmVudHMgYW5kIHNtYXNoIHRoZW0gaW50byB0aGUgZXZlbnRzIGhhc2hcblx0XHR2YXIgbWF0Y2hlZERPTUV2ZW50cyA9IGtleS5tYXRjaChFdmVudHNbJy9ET01FdmVudC8nXSk7XG5cdFx0aWYgKG1hdGNoZWRET01FdmVudHMpIHtcblx0XHRcdHZhciBldmVudE5hbWUgPSBtYXRjaGVkRE9NRXZlbnRzWzFdO1xuXHRcdFx0dmFyIGRlbGVnYXRlU2VsZWN0b3IgPSBtYXRjaGVkRE9NRXZlbnRzWzNdO1xuXG5cdFx0XHQvLyBTdG93IHRoZW0gaW4gZXZlbnRzIGhhc2hcblx0XHRcdGNvbXBvbmVudFByb3RvdHlwZS5wcm90b3R5cGUuZXZlbnRzID0gY29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZS5ldmVudHMgfHwge307XG5cdFx0XHRjb21wb25lbnRQcm90b3R5cGUucHJvdG90eXBlLmV2ZW50c1trZXldID0gaGFuZGxlcjtcblx0XHR9XG5cblx0XHQvLyBBZGQgYXBwIGV2ZW50cyAoJSksIHJvdXRlcyAoIyksIGFuZCBkYXRhIGxpc3RlbmVycyAofikgdG8gc3Vic2NyaXB0aW9ucyBoYXNoXG5cdFx0aWYgKGtleS5tYXRjaCgvXiglfCN8fikvKSkge1xuXHRcdFx0aWYgKF8uaXNTdHJpbmcoaGFuZGxlcikpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGNvbXBvbmVudERlZi5pZCArICc6OiBJbnZhbGlkIGxpc3RlbmVyIGZvciBzdWJzY3JpcHRpb246ICcgKyBrZXkgKyAnLlxcbicgK1xuXHRcdFx0XHRcdCdEZWZpbmUgeW91ciBjYWxsYmFjayB3aXRoIGFuIGFub255bW91cyBmdW5jdGlvbiBpbnN0ZWFkIG9mIGEgc3RyaW5nLidcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHRcdGlmICghXy5pc0Z1bmN0aW9uKGhhbmRsZXIpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihjb21wb25lbnREZWYuaWQgKyc6OiBJbnZhbGlkIGxpc3RlbmVyIGZvciBzdWJzY3JpcHRpb246ICcgKyBrZXkpO1xuXHRcdFx0fVxuXHRcdFx0Y29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZS5zdWJzY3JpcHRpb25zW2tleV0gPSBoYW5kbGVyO1xuXHRcdH1cblxuXHRcdC8vIEV4dGVuZCBvbmUgb3IgbW9yZSBvdGhlciBjb21wb25lbnRzXG5cdFx0ZWxzZSBpZiAoa2V5ID09PSAnZXh0ZW5kQ29tcG9uZW50cycpIHtcblx0XHRcdHZhciBvYmpUb01lcmdlID0ge307XG5cdFx0XHRfLmVhY2goaGFuZGxlciwgZnVuY3Rpb24oY2hpbGRJZCl7XG5cblx0XHRcdFx0aWYgKCFGUkFNRVdPUksuY29tcG9uZW50c1tjaGlsZElkXSl7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKFxuXHRcdFx0XHRcdGNvbXBvbmVudERlZi5pZCArICcgOjogJyArXG5cdFx0XHRcdFx0J1RyeWluZyB0byBkZWZpbmUvZXh0ZW5kIHRoaXMgY29tcG9uZW50IGZyb20gYCcgKyBjaGlsZElkICsgJ2AsICcgK1xuXHRcdFx0XHRcdCdidXQgbm8gY29tcG9uZW50IHdpdGggdGhhdCBpZCBjYW4gYmUgZm91bmQuJ1xuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRfLmV4dGVuZChvYmpUb01lcmdlLCBGUkFNRVdPUksuY29tcG9uZW50c1tjaGlsZElkXSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Xy5kZWZhdWx0cyhjb21wb25lbnRQcm90b3R5cGUucHJvdG90eXBlLCBvYmpUb01lcmdlKTtcblx0XHR9XG5cdH0pO1xuXG5cdC8vIFNhdmUgcHJvdG90eXBlIGluIGdsb2JhbCBzZXQgZm9yIHRyYWNraW5nXG5cdEZSQU1FV09SSy5jb21wb25lbnRzW2NvbXBvbmVudERlZi5pZF0gPSBjb21wb25lbnRQcm90b3R5cGU7XG59O1xuIiwiLyoqXG4gKiBDb2xsZWN0IGFueSByZWdpb25zIHdpdGggdGhlIGRlZmF1bHQgY29tcG9uZW50IHNldCBmcm9tIHRoZSBET00uXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjb2xsZWN0UmVnaW9ucyAoKSB7XG5cblx0Ly8gUHJvdmlkZSBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eSBmb3IgbGVnYWN5IG5vdGF0aW9uXG5cdCQoJ3JlZ2lvbltkZWZhdWx0XSxyZWdpb25bdGVtcGxhdGVdLFtkYXRhLXJlZ2lvbl1bZGVmYXVsdF0sW2RhdGEtcmVnaW9uXVt0ZW1wbGF0ZV0nKS5lYWNoKGZ1bmN0aW9uKCkge1xuXHRcdCRlID0gJCh0aGlzKTtcblx0XHR2YXIgY29tcG9uZW50SWQgPSAkZS5hdHRyKCdkZWZhdWx0JykgfHwgJGUuYXR0cigndGVtcGxhdGUnKTtcblx0XHQkZS5hdHRyKCdjb250ZW50cycsIGNvbXBvbmVudElkKTtcblx0fSk7XG5cblx0Ly8gTm93IGluc3RhbnRpYXRlIHRoZSBhcHByb3ByaWF0ZSBkZWZhdWx0IGNvbXBvbmVudCBpbiBlYWNoXG5cdC8vIHJlZ2lvbiB3aXRoIGEgc3BlY2lmaWVkIHRlbXBsYXRlL2NvbXBvbmVudFxuXHQkKCdyZWdpb25bY29udGVudHNdLFtkYXRhLXJlZ2lvbl1bY29udGVudHNdJykuZWFjaChmdW5jdGlvbigpIHtcblx0XHRGUkFNRVdPUksuUmVnaW9uLmZyb21FbGVtZW50KHRoaXMpO1xuXHR9KTtcbn1cbiIsIi8qKlxuICogTG9hZCBhbnkgc2NyaXB0IHRhZ3Mgb24gdGhlIHBhZ2Ugd2l0aCB0eXBlPVwidGV4dC90ZW1wbGF0ZVwiLlxuICpcbiAqIEByZXR1cm4ge09iamVjdH0gW09iamVjdCBjb25zaXN0aW5nIG9mIGEgdGVtcGxhdGUgaWRlbnRpZmllciBhbmQgaXRzIEhUTUwuXVxuICovXG5cbnZhciBVdGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzL3V0aWxzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY29sbGVjdFRlbXBsYXRlcygpIHtcblx0dmFyIHRlbXBsYXRlcyA9IHt9O1xuXG5cdCQoJ3NjcmlwdFt0eXBlPVwidGV4dC90ZW1wbGF0ZVwiXScpLmVhY2goZnVuY3Rpb24gKGksIGVsKSB7XG5cdFx0dmFyIGlkID0gVXRpbHMuZWwyaWQoZWwsIHRydWUpO1xuXHRcdHRlbXBsYXRlc1tpZF0gPSAkKGVsKS5odG1sKCk7XG5cblx0XHQvLyBTdHJpcCB3aGl0ZXNwYWNlIGxlZnRvdmVyIGZyb20gc2NyaXB0IHRhZ3Ncblx0XHR0ZW1wbGF0ZXNbaWRdID0gdGVtcGxhdGVzW2lkXS5yZXBsYWNlKC9eXFxzKy8sJycpO1xuXHRcdHRlbXBsYXRlc1tpZF0gPSB0ZW1wbGF0ZXNbaWRdLnJlcGxhY2UoL1xccyskLywnJyk7XG5cblx0XHQvLyBSZW1vdmUgZnJvbSBET01cblx0XHQkKGVsKS5yZW1vdmUoKTtcblx0fSk7XG5cblx0cmV0dXJuIHRlbXBsYXRlcztcbn07XG4iLCIvKipcbiAqIFRoaXMgaXMgdGhlIHN0YXJ0aW5nIHBvaW50IHRvIHlvdXIgYXBwbGljYXRpb24uICBZb3Ugc2hvdWxkIGdyYWIgdGVtcGxhdGVzIGFuZCBjb21wb25lbnRzXG4gKiBiZWZvcmUgY2FsbGluZyBGUkFNRVdPUksucmFpc2UoKSB1c2luZyBzb21ldGhpbmcgbGlrZSBSZXF1aXJlLmpzLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG5cdFx0ZGF0YTogeyBhdXRoZW50aWNhdGVkOiBmYWxzZSB9LFxuXHRcdHRlbXBsYXRlczogeyBjb21wb25lbnROYW1lOiBIVE1MT3JQcmVjb21waWxlZEZuIH0sXG5cdFx0Y29tcG9uZW50czogeyBjb21wb25lbnROYW1lOiBDb21wb25lbnREZWZpbml0aW9uIH1cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNiXG4gKi9cblxudmFyIExvZ2dlciA9IHJlcXVpcmUoJy4uL2xvZ2dlci9pbmRleCcpO1xudmFyIGJ1aWxkQ29tcG9uZW50RGVmaW5pdGlvbiA9IHJlcXVpcmUoJy4uL2RlZmluZS9idWlsZERlZmluaXRpb24nKTtcbnZhciBidWlsZENvbXBvbmVudFByb3RvdHlwZSA9IHJlcXVpcmUoJy4vYnVpbGRQcm90b3R5cGUnKTtcbnZhciBjb2xsZWN0VGVtcGxhdGVzID0gcmVxdWlyZSgnLi9jb2xsZWN0VGVtcGxhdGVzJyk7XG52YXIgY29sbGVjdFJlZ2lvbnMgPSByZXF1aXJlKCcuL2NvbGxlY3RSZWdpb25zJyk7XG52YXIgc2V0dXBSb3V0ZXIgPSByZXF1aXJlKCcuLi9yb3V0ZXIvaW5kZXgnKTtcblxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHJhaXNlKG9wdGlvbnMsIGNiKSB7XG5cblx0Ly8gSWYgb25seSBvbmUgYXJnIGlzIHByZXNlbnQsIHVzZSBvcHRpb25zIGFzIGNhbGxiYWNrIGlmIHBvc3NpYmxlLlxuXHQvLyBJZiBvcHRpb25zIGFyZSBub3QgZGVmaW5lZCwgdXNlIGFuIGVtcHR5IG9iamVjdC5cblx0aWYgKCFjYiAmJiBfLmlzRnVuY3Rpb24ob3B0aW9ucykpIHtcblx0XHRjYiA9IG9wdGlvbnM7XG5cdH1cblx0aWYgKCFfLmlzUGxhaW5PYmplY3Qob3B0aW9ucykpIHtcblx0XHRvcHRpb25zID0ge307XG5cdH1cblxuXHQvLyBBcHBseSBkZWZhdWx0c1xuXHRfLmRlZmF1bHRzKEZSQU1FV09SSywge1xuXHRcdHRocm90dGxlV2luZG93UmVzaXplOiAyMDAsXG5cdFx0bG9nTGV2ZWw6ICd3YXJuJyxcblx0XHRsb2dnZXI6IHVuZGVmaW5lZCxcblx0XHRwcm9kdWN0aW9uOiBmYWxzZVxuXHR9KTtcblxuXHQvLyBBcHBseSBvdmVycmlkZXMgZnJvbSBvcHRpb25zXG5cdF8uZXh0ZW5kKEZSQU1FV09SSywgb3B0aW9ucyk7XG5cblx0Ly8gSW50ZXJwcmV0IGBwcm9kdWN0aW9uYCBhcyBgbG9nTGV2ZWwgPT09ICdzaWxlbnQnYFxuXHRpZiAoRlJBTUVXT1JLLnByb2R1Y3Rpb24pIHtcblx0XHRGUkFNRVdPUksubG9nTGV2ZWwgPSAnc2lsZW50Jztcblx0fVxuXG5cdC8vIEluaXRpYWxpemUgbG9nZ2VyXG5cdG5ldyBMb2dnZXIoKTtcblxuXHQvLyBNZXJnZSBkYXRhIGludG8gRlJBTUVXT1JLLmRhdGFcblx0Xy5leHRlbmQoRlJBTUVXT1JLLmRhdGEsIG9wdGlvbnMuZGF0YSB8fCB7fSk7XG5cblx0Ly8gTWVyZ2Ugc3BlY2lmaWVkIHRlbXBsYXRlcyB3aXRoIEZSQU1FV09SSy50ZW1wbGF0ZXNcblx0Xy5leHRlbmQoRlJBTUVXT1JLLnRlbXBsYXRlcywgb3B0aW9ucy50ZW1wbGF0ZXMgfHwge30pO1xuXG5cdC8vIElmIEZSQU1FV09SSy5kZWZpbmUoKSB3YXMgdXNlZCwgYnVpbGQgdGhlIGxpc3Qgb2YgY29tcG9uZW50c1xuXHQvLyBJdGVyYXRlIHRocm91Z2ggdGhlIGRlZmluZSBxdWV1ZSBhbmQgY3JlYXRlIGVhY2ggZGVmaW5pdGlvblxuXHRfLmVhY2goRlJBTUVXT1JLLl9kZWZpbmVRdWV1ZSwgYnVpbGRDb21wb25lbnREZWZpbml0aW9uKTtcblxuXHQvLyBNZXJnZSBzcGVjaWZpZWQgY29tcG9uZW50cyB3LyBGUkFNRVdPUksuY29tcG9uZW50c1xuXHRfLmV4dGVuZChGUkFNRVdPUksuY29tcG9uZW50cywgb3B0aW9ucy5jb21wb25lbnRzIHx8IHt9KTtcblxuXHQvLyBCYWNrIHVwIGVhY2ggY29tcG9uZW50IGRlZmluaXRpb24gYmVmb3JlIHRyYW5zZm9ybWluZyBpdCBpbnRvIGEgbGl2ZSBwcm90b3R5cGVcblx0RlJBTUVXT1JLLmNvbXBvbmVudERlZnMgPSBfLmNsb25lKEZSQU1FV09SSy5jb21wb25lbnRzKTtcblxuXHQvLyBSdW4gdGhpcyBjYWxsIGJhY2sgd2hlbiB0aGUgRE9NIGlzIHJlYWR5XG5cdCQoZnVuY3Rpb24gKCkge1xuXG5cdFx0Ly8gQ29sbGVjdCBhbnkgPHNjcmlwdD4gdGFnIHRlbXBsYXRlcyBvbiB0aGUgcGFnZVxuXHRcdC8vIGFuZCBhYnNvcmIgdGhlbSBpbnRvIEZSQU1FV09SSy50ZW1wbGF0ZXNcblx0XHRfLmV4dGVuZChGUkFNRVdPUksudGVtcGxhdGVzLCBjb2xsZWN0VGVtcGxhdGVzKCkpO1xuXG5cdFx0Ly8gQnVpbGQgYWN0dWFsIHByb3RvdHlwZXMgZm9yIHRoZSBjb21wb25lbnRzXG5cdFx0Ly8gKG5lZWQgdGhlIHRlbXBsYXRlcyBhdCB0aGlzIHBvaW50IHRvIG1ha2UgdGhpcyB3b3JrKVxuXG5cdFx0Xy5lYWNoKEZSQU1FV09SSy5jb21wb25lbnRzLCBidWlsZENvbXBvbmVudFByb3RvdHlwZSk7XG5cblx0XHQvLyBHcmFiIGluaXRpYWwgcmVnaW9ucyBmcm9tIERPTVxuXHRcdGNvbGxlY3RSZWdpb25zKCk7XG5cblx0XHQvLyBCaW5kIGdsb2JhbCBET00gZXZlbnRzIGFzIEZSQU1FV09SSyBldmVudHNcblx0XHQvLyAoZS5nLiAld2luZG93OnJlc2l6ZSlcblx0XHR2YXIgdHJpZ2dlclJlc2l6ZUV2ZW50ID0gXy5kZWJvdW5jZShmdW5jdGlvbiAoKSB7XG5cdFx0XHRGUkFNRVdPUksudHJpZ2dlcignJXdpbmRvdzpyZXNpemUnKTtcblx0XHR9LCBvcHRpb25zLnRocm90dGxlV2luZG93UmVzaXplIHx8IDApO1xuXHRcdCQod2luZG93KS5yZXNpemUodHJpZ2dlclJlc2l6ZUV2ZW50KTtcblx0XHQvLyBUT0RPOiBhZGQgbW9yZSBldmVudHMgYW5kIGV4dHJhcG9sYXRlIHRoaXMgbG9naWMgdG8gYSBzZXBhcmF0ZSBtb2R1bGVcblxuXHRcdC8vIERvIHRoZSBpbml0aWFsIHJvdXRpbmcgc2VxdWVuY2Vcblx0XHQvLyBMb29rIGF0IHRoZSAjZnJhZ21lbnQgdXJsIGFuZCBmaXJlIHRoZSBnbG9iYWwgcm91dGUgZXZlbnRcblx0XHRzZXR1cFJvdXRlcigpO1xuXHRcdEZSQU1FV09SSy5oaXN0b3J5LnN0YXJ0KF8uZGVmYXVsdHMoe1xuXHRcdFx0cHVzaFN0YXRlOiB1bmRlZmluZWQsXG5cdFx0XHRoYXNoQ2hhbmdlOiB1bmRlZmluZWQsXG5cdFx0XHRyb290OiB1bmRlZmluZWRcblx0XHR9LCBvcHRpb25zKSk7XG5cblx0XHRpZiAoY2IpIGNiKCk7XG5cdH0pO1xufTtcbiIsIi8qKlxuICogQXBwZW5kIGEgY29tcG9uZW50IHRvIHRoZSBlbmQgb2YgYSByZWdpb24uIFRoaXMgY2FsbHMgaW5zZXJ0IGF0IHRoZSBsYXN0IHBvc2l0aW9uLlxuICpcbiAqIEBwYXJhbSAge1N0cmluZ30gY29tcG9uZW50SWQgW1RoZSBjb21wb25lbnQgaWQgdGhhdCB3ZSB3YW50IHRvIGFwcGVuZF1cbiAqIEBwYXJhbSAge09iamVjdH0gcHJvcGVydGllcyAgW1Byb3BlcnRpZXMgdG8gaW5zdGFudGlhdGUgdGhlIGNvbXBvbmVudCB3aXRoXVxuICpcbiAqIEByZXR1cm4ge0NvbXBvbmVudH0gICAgICAgICAgW05ld2x5IGFwcGVuZGVkIENvbXBvbmVudF1cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBhcHBlbmQoY29tcG9uZW50SWQsIHByb3BlcnRpZXMpIHtcblx0Ly8gSW5zZXJ0IGF0IGxhc3QgcG9zaXRpb25cblx0cmV0dXJuIHRoaXMuaW5zZXJ0KHRoaXMuX2NoaWxkcmVuLmxlbmd0aCwgY29tcG9uZW50SWQsIHByb3BlcnRpZXMpO1xufTtcbiIsIi8qKlxuICogU2hvcnRjdXQgZm9yIGNhbGxpbmcgZW1wdHkoKSBhbmQgdGhlbiBhcHBlbmQoKSxcbiAqIFRoaXMgaXMgdGhlIGdlbmVyYWwgdXNlIGNhc2UgZm9yIG1hbmFnaW5nIHN1YmNvbXBvbmVudHNcbiAqIChlLmcuIHdoZW4gYSBuYXZiYXIgaXRlbSBpcyB0b3VjaGVkKVxuICpcbiAqIEBwYXJhbSAge1N0cmluZ30gY29tcG9uZW50ICBbVGhlIGlkIG5hbWUgb2YgdGhlIGNvbXBvbmV0IHRoYXQgeW91IHdhbnQgdG8gYXR0YWNoXVxuICogQHBhcmFtICB7T2JqZWN0fSBwcm9wZXJ0aWVzIFtQcm9wZXJ0aWVzIHRoYXQgdGhlIGF0dGFjaGVkIGNvbXBvbmVudCB3aWxsIGJlIGluaXRhbGl6ZWQgd2l0aF1cbiAqXG4gKiBAcmV0dXJuIHtDb21wb25lbnR9IFx0XHRcdFx0IFtOZXdseSBhdHRhY2hlZCBjb21wb25lbnRdXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYXR0YWNoKGNvbXBvbmVudCwgcHJvcGVydGllcykge1xuXHR0aGlzLmVtcHR5KCk7XG5cdHJldHVybiB0aGlzLmFwcGVuZChjb21wb25lbnQsIHByb3BlcnRpZXMpO1xufTtcbiIsIi8qKlxuICogcmVnaW9uLmVtcHR5KCApXG4gKlxuICogSXRlcmF0ZSBvdmVyIGVhY2ggY29tcG9uZW50IGluIHRoaXMgcmVnaW9uIGFuZCBjYWxsIC5jbG9zZSgpIG9uIGl0XG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZW1wdHkoKSB7XG5cdEZSQU1FV09SSy5kZWJ1Zyh0aGlzLnBhcmVudC5pZCArICcgOjogRW1wdHlpbmcgcmVnaW9uOiAnICsgdGhpcy5pZCk7XG5cdHdoaWxlICh0aGlzLl9jaGlsZHJlbi5sZW5ndGggPiAwKSB7XG5cdFx0dGhpcy5yZW1vdmUoMCk7XG5cdH1cbn07XG4iLCIvKipcbiAqIEZhY3RvcnkgbWV0aG9kIHRvIGdlbmVyYXRlIGEgbmV3IHJlZ2lvbiBpbnN0YW5jZSBmcm9tIGEgRE9NIGVsZW1lbnRcbiAqIEltcGxlbWVudHMgYHRlbXBsYXRlYCwgYGNvdW50YCwgYW5kIGBkYXRhLSpgIEhUTUwgYXR0cmlidXRlcy5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9uc1xuICogQHJldHVybnMgcmVnaW9uIGluc3RhbmNlXG4gKi9cblxudmFyIFV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMvdXRpbHMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmcm9tRWxlbWVudChlbCwgcGFyZW50KSB7XG5cblx0Ly8gSWYgcGFyZW50IGlzIG5vdCBzcGVjaWZpZWQsIG1ha2UtYmVsaWV2ZS5cblx0cGFyZW50ID0gcGFyZW50IHx8IHsgaWQ6ICcqJyB9O1xuXG5cblxuXHQvLyBCdWlsZCByZWdpb25cblx0dmFyIHJlZ2lvbiA9IG5ldyBGUkFNRVdPUksuUmVnaW9uKHtcblx0XHRpZDogVXRpbHMuZWwyaWQoZWwpLFxuXHRcdCRlbDogJChlbCksXG5cdFx0cGFyZW50OiBwYXJlbnRcblx0fSk7XG5cblx0Ly8gSWYgdGhpcyByZWdpb24gaGFzIGEgZGVmYXVsdCBjb21wb25lbnQvdGVtcGxhdGUgc2V0LFxuXHQvLyBncmFiIHRoZSBpZCAgLS0gIGUuZy4gPHJlZ2lvbiBjb250ZW50cz1cIkZvb1wiIC8+XG5cdHZhciBjb21wb25lbnRJZCA9ICQoZWwpLmF0dHIoJ2NvbnRlbnRzJyk7XG5cblxuXHQvLyBJZiBgY291bnRgIGlzIHNldCwgcmVuZGVyIHN1Yi1jb21wb25lbnQgc3BlY2lmaWVkIG51bWJlciBvZiB0aW1lcy5cblx0Ly8gZS5nLiA8cmVnaW9uIHRlbXBsYXRlPVwiRm9vXCIgY291bnQ9XCIzXCIgLz5cblx0Ly8gKHZlcmlmeSBGUkFNRVdPUksuc2hvcnRjdXQuY291bnQgaXMgZW5hYmxlZClcblx0dmFyIGNvdW50QXR0cixcblx0XHRcdGNvdW50ID0gMTtcblxuXHRpZiAoRlJBTUVXT1JLLm9wdGlvbnMuc2hvcnRjdXQuY291bnQpIHtcblxuXHRcdC8vIElmIGBjb3VudGAgYXR0cmlidXRlIGlzIG5vdCBmYWxzZSBvciB1bmRlZmluZWQsXG5cdFx0Ly8gdGhhdCBtZWFucyBpdCB3YXMgc2V0IGV4cGxpY2l0bHksIGFuZCB3ZSBzaG91bGQgdXNlIGl0XG5cdFx0Y291bnRBdHRyID0gJChlbCkuYXR0cignY291bnQnKTtcblx0XHQvLyBGUkFNRVdPUksuZGVidWcoJ0NvdW50IGF0dHIgaXMgOjogJywgY291bnRBdHRyKTtcblx0XHRpZiAoISFjb3VudEF0dHIpIHtcblx0XHRcdGNvdW50ID0gY291bnRBdHRyO1xuXHRcdH1cblx0fVxuXG5cblx0RlJBTUVXT1JLLmRlYnVnKFxuXHRcdHBhcmVudC5pZCArICcgOi06IEluc3RhbnRpYXRlZMKgbmV3IHJlZ2lvbicgK1xuXHRcdCggcmVnaW9uLmlkID8gJyBgJyArIHJlZ2lvbi5pZCArICdgJyA6ICcnICkgK1xuXHRcdCggY29tcG9uZW50SWQgPyAnIGFuZCBwb3B1bGF0ZWQgaXQgd2l0aCcgK1xuXHRcdFx0KCBjb3VudCA+IDEgPyBjb3VudCArICcgaW5zdGFuY2VzIG9mJyA6ICcgMScgKSArXG5cdFx0XHQnIGAnICsgY29tcG9uZW50SWQgKyAnYCcgOiAnJ1xuXHRcdCkgKyAnLidcblx0KTtcblxuXG5cblx0Ly8gQXBwZW5kIHN1Yi1jb21wb25lbnQocykgdG8gcmVnaW9uIGF1dG9tYXRpY2FsbHlcblx0Ly8gKHZlcmlmeSBGUkFNRVdPUksuc2hvcnRjdXQudGVtcGxhdGUgaXMgZW5hYmxlZClcblx0aWYgKCBGUkFNRVdPUksub3B0aW9ucy5zaG9ydGN1dC50ZW1wbGF0ZSAmJiBjb21wb25lbnRJZCApIHtcblxuXHRcdC8vIEZSQU1FV09SSy5kZWJ1Zyhcblx0XHQvLyBcdCdQcmVwYXJpbmcgdG8gcmVuZGVyICcgKyBjb3VudCArICcgJyArIGNvbXBvbmVudElkICsgJyBjb21wb25lbnRzIGludG8gcmVnaW9uICcgK1xuXHRcdC8vIFx0JygnICsgcmVnaW9uLmlkICsgJyksIHdoaWNoIGFscmVhZHkgY29udGFpbnMgJyArIHJlZ2lvbi4kZWwuY2hpbGRyZW4oKS5sZW5ndGggK1xuXHRcdC8vIFx0JyBzdWJjb21wb25lbnRzLidcblx0XHQvLyApO1xuXG5cdFx0cmVnaW9uLmFwcGVuZChjb21wb25lbnRJZCk7XG5cblx0XHQvLyAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblx0XHQvLyAvLyBTRVJJT1VTTFkgV1RGXG5cdFx0Ly8gLy8gTUFKT1IgSEFYWFhYWFhYXG5cdFx0Ly8gLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cdFx0Ly8gY291bnQgPSArY291bnQgKyAxO1xuXHRcdC8vIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG5cdFx0Ly8gZm9yICh2YXIgaj0wOyBqIDwgY291bnQ7IGorKyApIHtcblxuXHRcdC8vIFx0cmVnaW9uLmFwcGVuZChjb21wb25lbnRJZCk7XG5cblx0XHQvLyBcdC8vIEZSQU1FV09SSy5kZWJ1Zyhcblx0XHQvLyBcdC8vIFx0J3JlbmRlcmluZyB0aGUgJyArIGNvbXBvbmVudElkICsgJyBjb21wb25lbnQsIHJlbWFpbmluZzogJyArXG5cdFx0Ly8gXHQvLyBcdGNvdW50ICsgJyBhbmQgdGhlcmUgYXJlICcgKyByZWdpb24uJGVsLmNoaWxkcmVuKCkubGVuZ3RoICtcblx0XHQvLyBcdC8vIFx0JyBzdWJjb21wb25lbnQgZWxlbWVudHMgaW4gdGhlIHJlZ2lvbiBub3cnXG5cdFx0Ly8gXHQvLyApO1xuXG5cdFx0Ly8gfVxuXG5cdH1cblxuXHRyZXR1cm4gcmVnaW9uO1xufTtcbiIsIi8qKlxuICogUmVnaW9uc1xuICovXG5cbnZhciBpbnNlcnQgPSByZXF1aXJlKCcuL2luc2VydCcpLFxuXHRcdHJlbW92ZSA9IHJlcXVpcmUoJy4vcmVtb3ZlJyksXG5cdFx0ZW1wdHkgPSByZXF1aXJlKCcuL2VtcHR5JyksXG5cdFx0YXBwZW5kID0gcmVxdWlyZSgnLi9hcHBlbmQnKSxcblx0XHRhdHRhY2ggPSByZXF1aXJlKCcuL2F0dGFjaCcpLFxuXHRcdHByZXBlbmQgPSByZXF1aXJlKCcuL3ByZXBlbmQnKSxcblx0XHRmcm9tRWxlbWVudCA9IHJlcXVpcmUoJy4vZnJvbUVsZW1lbnQnKTtcblxuUmVnaW9uID0gbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByZWdpb24ocHJvcGVydGllcykge1xuXG5cdF8uZXh0ZW5kKHRoaXMsIEZSQU1FV09SSy5FdmVudHMpO1xuXG5cdGlmICghcHJvcGVydGllcykge1xuXHRcdHByb3BlcnRpZXMgPSB7fTtcblx0fVxuXHRpZiAoIXByb3BlcnRpZXMuJGVsKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdUcnlpbmcgdG8gaW5zdGFudGlhdGUgcmVnaW9uIHdpdGggbm8gJGVsIScpO1xuXHR9XG5cblx0Ly8gRm9sZCBpbiBwcm9wZXJ0aWVzIHRvIHByb3RvdHlwZVxuXHRfLmV4dGVuZCh0aGlzLCBwcm9wZXJ0aWVzKTtcblxuXHQvLyBJZiBuZWl0aGVyIGFuIGlkIG5vciBhIGB0ZW1wbGF0ZWAgd2FzIHNwZWNpZmllZCxcblx0Ly8gd2UnbGwgdGhyb3cgYW4gZXJyb3IsIHNpbmNlIHRoZXJlJ3Mgbm8gd2F5IHRvIGdldCBhIGhvbGQgb2YgdGhlIHJlZ2lvblxuXHRpZiAoIXRoaXMuaWQgJiYgISh0aGlzLiRlbC5hdHRyKCdkZWZhdWx0JykgfHwgdGhpcy4kZWwuYXR0cigndGVtcGxhdGUnKSB8fFxuXHRcdHRoaXMuJGVsLmF0dHIoJ2NvbnRlbnRzJykpKSB7XG5cblx0XHR0aHJvdyBuZXcgRXJyb3IoXG5cdFx0XHR0aGlzLnBhcmVudC5pZCArICcgOjogRWl0aGVyIGBkYXRhLWlkYCwgYGNvbnRlbnRzYCwgb3IgYm90aCAnICtcblx0XHRcdCdtdXN0IGJlIHNwZWNpZmllZCBvbiByZWdpb25zLiBcXG4nICtcblx0XHRcdCdlLmcuIDxyZWdpb24gZGF0YS1pZD1cImZvb1wiIHRlbXBsYXRlPVwiU29tZUNvbXBvbmVudFwiPjwvcmVnaW9uPidcblx0XHQpO1xuXHR9XG5cblx0Ly8gU2V0IHVwIGxpc3QgdG8gaG91c2UgY2hpbGQgY29tcG9uZW50c1xuXHR0aGlzLl9jaGlsZHJlbiA9IFtdO1xuXG5cdF8uYmluZEFsbCh0aGlzKTtcblxuXHQvLyBTZXQgdXAgY29udmVuaWVuY2UgYWNjZXNzIHRvIHRoaXMgcmVnaW9uIGluIHRoZSBnbG9iYWwgcmVnaW9uIGNhY2hlXG5cdEZSQU1FV09SSy5yZWdpb25zW3RoaXMuaWRdID0gdGhpcztcbn07XG5cblJlZ2lvbi5mcm9tRWxlbWVudCA9IGZ1bmN0aW9uKGVsLCBwYXJlbnQpIHtcblx0cmV0dXJuIGZyb21FbGVtZW50KGVsLCBwYXJlbnQpO1xufTtcblJlZ2lvbi5wcm90b3R5cGUucmVtb3ZlID0gZnVuY3Rpb24oYXRJbmRleCkge1xuXHRyZXR1cm4gcmVtb3ZlLmNhbGwodGhpcywgYXRJbmRleCk7XG59O1xuUmVnaW9uLnByb3RvdHlwZS5lbXB0eSA9IGZ1bmN0aW9uKCkge1xuXHRyZXR1cm4gZW1wdHkuY2FsbCh0aGlzKTtcbn07XG5SZWdpb24ucHJvdG90eXBlLmluc2VydCA9IGZ1bmN0aW9uKGF0SW5kZXgsIGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKSB7XG5cdHJldHVybiBpbnNlcnQuY2FsbCh0aGlzLCBhdEluZGV4LCBjb21wb25lbnRJZCwgcHJvcGVydGllcyk7XG59O1xuUmVnaW9uLnByb3RvdHlwZS5hcHBlbmQgPSBmdW5jdGlvbihjb21wb25lbnRJZCwgcHJvcGVydGllcykge1xuXHRyZXR1cm4gYXBwZW5kLmNhbGwodGhpcywgY29tcG9uZW50SWQsIHByb3BlcnRpZXMpO1xufTtcblJlZ2lvbi5wcm90b3R5cGUuYXR0YWNoID0gZnVuY3Rpb24oY29tcG9uZW50LCBwcm9wZXJ0aWVzKSB7XG5cdHJldHVybiBhdHRhY2guY2FsbCh0aGlzLCBjb21wb25lbnQsIHByb3BlcnRpZXMpO1xufTtcblJlZ2lvbi5wcm90b3R5cGUucHJlcGVuZCA9IGZ1bmN0aW9uKGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKSB7XG5cdHJldHVybiBwcmVwZW5kLmNhbGwodGhpcywgY29tcG9uZW50SWQsIHByb3BlcnRpZXMpO1xufTtcbiIsIi8qKlxuICogcmVnaW9uLmluc2VydCggYXRJbmRleCwgY29tcG9uZW50SWQsIFtwcm9wZXJ0aWVzXSApXG4gKlxuICogVE9ETzogc3VwcG9ydCBhIGxpc3Qgb2YgcHJvcGVydGllcyBvYmplY3RzIGluIGxpZXUgb2YgdGhlIHByb3BlcnRpZXMgb2JqZWN0XG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpbnNlcnQoYXRJbmRleCwgY29tcG9uZW50SWQsIHByb3BlcnRpZXMpIHtcblxuXHR2YXIgZXJyID0gJyc7XG5cdGlmICghKGF0SW5kZXggfHwgXy5pc0Zpbml0ZShhdEluZGV4KSkpIHtcblx0XHRlcnIgKz0gdGhpcy5pZCArICcuaW5zZXJ0KCkgOjogTm8gYXRJbmRleCBzcGVjaWZpZWQhJztcblx0fVxuXHRlbHNlIGlmICghY29tcG9uZW50SWQpIHtcblx0XHRlcnIgKz0gdGhpcy5pZCArICcuaW5zZXJ0KCkgOjogTm8gY29tcG9uZW50SWQgc3BlY2lmaWVkISc7XG5cdH1cblx0aWYgKGVycikge1xuXHRcdHRocm93IG5ldyBFcnJvcihlcnIgKyAnXFxuVXNhZ2U6IGFwcGVuZChhdEluZGV4LCBjb21wb25lbnRJZCwgW3Byb3BlcnRpZXNdKScpO1xuXHR9XG5cblx0dmFyIGNvbXBvbmVudDtcblx0Ly8gSWYgY29tcG9uZW50SWQgaXMgYSBzdHJpbmcsIGxvb2sgdXAgY29tcG9uZW50IHByb3RvdHlwZSBhbmQgaW5zdGF0aWF0ZVxuXHRpZiAoJ3N0cmluZycgPT0gdHlwZW9mIGNvbXBvbmVudElkKSB7XG5cblx0XHR2YXIgY29tcG9uZW50UHJvdG90eXBlID0gRlJBTUVXT1JLLmNvbXBvbmVudHNbY29tcG9uZW50SWRdO1xuXG5cdFx0aWYgKCFjb21wb25lbnRQcm90b3R5cGUpIHtcblx0XHRcdHZhciB0ZW1wbGF0ZSA9IEZSQU1FV09SSy50ZW1wbGF0ZXNbY29tcG9uZW50SWRdO1xuXHRcdFx0aWYgKCF0ZW1wbGF0ZSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IgKCdJbiAnICtcblx0XHRcdFx0XHQodGhpcy5pZCB8fCAnQW5vbnltb3VzIHJlZ2lvbicpICsgJzo6IFRyeWluZyB0byBhdHRhY2ggJyArXG5cdFx0XHRcdFx0Y29tcG9uZW50SWQgKyAnLCBidXQgbm8gY29tcG9uZW50IG9yIHRlbXBsYXRlIGV4aXN0cyB3aXRoIHRoYXQgaWQuJyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIElmIG5vIGNvbXBvbmVudCBwcm90b3R5cGUgd2l0aCB0aGlzIGlkIGV4aXN0cyxcblx0XHRcdC8vIGNyZWF0ZSBhbiBhbm9ueW1vdXMgb25lIHRvIHVzZVxuXHRcdFx0Y29tcG9uZW50UHJvdG90eXBlID0gRlJBTUVXT1JLLkNvbXBvbmVudC5leHRlbmQoe1xuXHRcdFx0XHRpZDogY29tcG9uZW50SWQsXG5cdFx0XHRcdHRlbXBsYXRlOiB0ZW1wbGF0ZVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gSW5zdGFudGlhdGUgYW5kIHJlbmRlciB0aGUgY29tcG9uZW50IGluc2lkZSB0aGlzIHJlZ2lvblxuXHRcdGNvbXBvbmVudCA9IG5ldyBjb21wb25lbnRQcm90b3R5cGUoXy5leHRlbmQoe1xuXHRcdFx0JG91dGxldDogdGhpcy4kZWxcblx0XHR9LCBwcm9wZXJ0aWVzIHx8IHt9KSk7XG5cblxuXHR9XG5cblx0Ly8gT3RoZXJ3aXNlIGFzc3VtZSBhbiBpbnN0YW50aWF0ZWQgY29tcG9uZW50IG9iamVjdCB3YXMgc2VudFxuXHQvKiBUT0RPOiBDaGVjayB0aGF0IGNvbXBvbmVudCBvYmplY3QgaXMgdmFsaWQgKi9cblx0ZWxzZSB7XG5cdFx0Y29tcG9uZW50ID0gY29tcG9uZW50SWQ7XG5cdFx0Y29tcG9uZW50LiRvdXRsZXQgPSB0aGlzLiRlbDtcblx0fVxuXG5cdC8vIFNhdmUgcmVmZXJlbmNlIHRvIHBhcmVudFJlZ2lvblxuXHRjb21wb25lbnQucGFyZW50UmVnaW9uID0gdGhpcztcblxuXHQvLyBSZW5kZXIgY29tcG9uZW50IGludG8gdGhpcyByZWdpb25cblx0Y29tcG9uZW50LnJlbmRlcihhdEluZGV4KTtcblxuXHQvLyBBbmQga2VlcCB0cmFjayBvZiBpdCBpbiB0aGUgbGlzdCBvZiB0aGlzIHJlZ2lvbidzIGNoaWxkcmVuXG5cdHRoaXMuX2NoaWxkcmVuLnNwbGljZShhdEluZGV4LCAwLCBjb21wb25lbnQpO1xuXG5cdC8vIExvZyBmb3IgZGVidWdnaW5nIGBjb3VudGAgZGVjbGFyYXRpdmVcblx0dmFyIGRlYnVnU3RyID0gdGhpcy5wYXJlbnQuaWQgKyAnIDo6IEluc2VydGVkICcgKyBjb21wb25lbnRJZCArICcgaW50byAnO1xuXHRpZiAodGhpcy5pZCkgZGVidWdTdHIgKz0gJ3JlZ2lvbjogJyArIHRoaXMuaWQgKyAnIGF0IGluZGV4ICcgKyBhdEluZGV4O1xuXHRlbHNlIGRlYnVnU3RyICs9ICdhbm9ueW1vdXMgcmVnaW9uIGF0IGluZGV4ICcgKyBhdEluZGV4O1xuXHRGUkFNRVdPUksudmVyYm9zZShkZWJ1Z1N0cik7XG5cblx0cmV0dXJuIGNvbXBvbmVudDtcblxufTtcbiIsIi8qKlxuICogUHJlcGVuZCBhIGNvbXBvbmVudCB0byB0aGUgYmVnaW5uaW5nIG9mIGEgcmVnaW9uLiBUaGlzIGNhbGxzIGluc2VydCBhdCB0aGUgZmlyc3QgcG9zaXRpb24uXG4gKlxuICogQHBhcmFtICB7U3RyaW5nfSBjb21wb25lbnRJZCBbVGhlIGNvbXBvbmVudCBpZCB0aGF0IHdlIHdhbnQgdG8gcHJlcGVuZCBdXG4gKiBAcGFyYW0gIHtPYmplY3R9IHByb3BlcnRpZXMgIFtQcm9wZXJ0aWVzIHRvIGluc3RhbnRpYXRlIHRoZSBjb21wb25lbnQgd2l0aF1cbiAqXG4gKiBAcmV0dXJuIHtDb21wb25lbnR9ICAgICAgICAgIFtOZXdseSBwcmVwZW5kZWQgQ29tcG9uZW50XVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHByZXBlbmQoY29tcG9uZW50SWQsIHByb3BlcnRpZXMpIHtcblx0Ly8gSW5zZXJ0IGF0IGxhc3QgcG9zaXRpb25cblx0cmV0dXJuIHRoaXMuaW5zZXJ0KDAsIGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKTtcbn07XG4iLCIvKipcbiAqIHJlZ2lvbi5yZW1vdmUoIGF0SW5kZXggKVxuICpcbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByZW1vdmUoYXRJbmRleCkge1xuXG5cdGlmICghYXRJbmRleCAmJiAhXy5pc0Zpbml0ZShhdEluZGV4KSkge1xuXHRcdHRocm93IG5ldyBFcnJvcih0aGlzLmlkICsgJy5yZW1vdmUoKSA6OiBObyBhdEluZGV4IHNwZWNpZmllZCEgXFxuVXNhZ2U6IHJlbW92ZShhdEluZGV4KScpO1xuXHR9XG5cblx0Ly8gUmVtb3ZlIHRoZSBjb21wb25lbnQgZnJvbSB0aGUgbGlzdFxuXHR2YXIgY29tcG9uZW50ID0gdGhpcy5fY2hpbGRyZW4uc3BsaWNlKGF0SW5kZXgsIDEpO1xuXHRpZiAoIWNvbXBvbmVudFswXSkge1xuXG5cdFx0Ly8gSWYgdGhlIGxpc3QgaXMgZW1wdHksIGZyZWFrIG91dFxuXHRcdHRocm93IG5ldyBFcnJvcih0aGlzLmlkICsgJy5yZW1vdmUoKSA6OiBUcnlpbmcgdG8gcmVtb3ZlIGEgY29tcG9uZW50IHRoYXQgZG9lc25cXCd0IGV4aXN0IGF0IGluZGV4ICcgKyBhdEluZGV4KTtcblx0fVxuXG5cdC8vIFNxdWVlemUgdGhlIGNvbXBvbmVudCB0byBkbyBnZXQgYWxsIHRoZSBiaW5keSBnb29kbmVzcyBvdXRcblx0Y29tcG9uZW50WzBdLmNsb3NlKCk7XG5cblx0RlJBTUVXT1JLLmRlYnVnKHRoaXMucGFyZW50LmlkICsgJyA6OiBSZW1vdmVkIGNvbXBvbmVudCBhdCBpbmRleCAnICsgYXRJbmRleCArICcgZnJvbSByZWdpb246ICcgKyB0aGlzLmlkKTtcbn07XG4iLCIvKipcbiAqIFNldHMgdXAgdGhlIEZSQU1FV09SSyByb3V0ZXIuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcm91dGVyU2V0dXAoKSB7XG5cblx0Ly8gV2lsZGNhcmQgcm91dGVzIHRvIGdsb2JhbCBldmVudCBkZWxlZ2F0b3Jcblx0dmFyIHJvdXRlciA9IG5ldyBGUkFNRVdPUksuUm91dGVyKCk7XG5cdHJvdXRlci5yb3V0ZSgvKC4qKS8sICdyb3V0ZScsIGZ1bmN0aW9uIChyb3V0ZSkge1xuXG5cdFx0Ly8gTm9ybWFsaXplIGhvbWUgcm91dGVzICgjIG9yIG51bGwpIHRvICcnXG5cdFx0aWYgKCFyb3V0ZSkge1xuXHRcdFx0cm91dGUgPSAnJztcblx0XHR9XG5cblx0XHQvLyBUcmlnZ2VyIHJvdXRlXG5cdFx0RlJBTUVXT1JLLnRyaWdnZXIoJyMnICsgcm91dGUpO1xuXHR9KTtcblxuXHQvLyBFeHBvc2UgYG5hdmlnYXRlKClgIG1ldGhvZFxuXHRGUkFNRVdPUksubmF2aWdhdGUgPSBGUkFNRVdPUksuaGlzdG9yeS5uYXZpZ2F0ZTtcbn1cbiIsIi8qKlxuICogQmFyZS1ib25lcyBET00vVUkgdXRpbGl0aWVzXG4gKi9cblxudmFyIEV2ZW50cyA9IHJlcXVpcmUoJy4vZXZlbnRzJyk7XG5cbnZhciBET00gPSB7XG5cblx0LyoqXG5cdCAqIEV4cG9zZSB0aGUgXCJET01teS1ldmVudGVkbmVzc1wiIG9mIGVsZW1lbnRzIHNvIHRoYXQgaXQncyBzZWxlY3RhYmxlIHZpYSBDU1Ncblx0ICogWW91IGNhbiB1c2UgdGhpcyB0byBhcHBseSBhIGZldyBjaG9pY2UgRE9NIG1vZGlmaWNhdGlvbnMgb3V0IHRoZSBnYXRlLS1cblx0ICogKGUuZy4gdHdlYWtzIHRhcmdldGluZyBjb21tb24gaXNzdWVzIHRoYXQgdHlwaWNhbGx5IGdldCBmb3Jnb3R0ZW4sIGxpa2UgZGlzYWJsaW5nIHRleHQgc2VsZWN0aW9uKVxuXHQgKlxuXHQgKiBAcGFyYW0ge0NvbXBvbmVudH0gY29tcG9uZW50XG5cdCAqL1xuXHRmbGFnQm91bmRFdmVudHM6IGZ1bmN0aW9uICggY29tcG9uZW50ICkge1xuXG5cdFx0Ly8gVE9ETzogcHJvdmlkZSBhY2Nlc3MgdG8gYm91bmQgZ2xvYmFsIGV2ZW50cyAoJSkgYW5kIHJvdXRlcyAoIykgYXMgd2VsbFxuXHRcdC8vIFRPRE86IGZsYWcgYWxsIERPTSBldmVudHMsIG5vdCBqdXN0IGNsaWNrIGFuZCB0b3VjaFxuXG5cdFx0Ly8gQnVpbGQgc3Vic2V0IG9mIGp1c3QgdGhlIGNsaWNrL3RvdWNoIGV2ZW50c1xuXHRcdHZhciBjbGlja09yVG91Y2hFdmVudHMgPSBFdmVudHMucGFyc2UoXG5cdFx0XHRjb21wb25lbnQuZXZlbnRzLFxuXHRcdFx0eyBvbmx5OiBbJ2NsaWNrJywgJ3RvdWNoJywgJ3RvdWNoc3RhcnQnLCAndG91Y2hlbmQnXSB9XG5cdFx0KTtcblxuXHRcdC8vIElmIG5vIGNsaWNrL3RvdWNoIGV2ZW50cyBmb3VuZCwgYmFpbCBvdXRcblx0XHRpZiAoIGNsaWNrT3JUb3VjaEV2ZW50cy5sZW5ndGggPCAxICkgcmV0dXJuO1xuXG5cdFx0Ly8gUXVlcnkgYWZmZWN0ZWQgZWxlbWVudHMgZnJvbSBET01cblx0XHR2YXIgJGFmZmVjdGVkID0gRXZlbnRzLmdldEVsZW1lbnRzKGNsaWNrT3JUb3VjaEV2ZW50cywgY29tcG9uZW50KTtcblxuXHRcdC8vIE5PVEU6IEZvciBub3csIHRoaXMgaXMgYWx3YXlzIGp1c3QgJ2NsaWNrJ1xuXHRcdHZhciBib3VuZEV2ZW50c1N0cmluZyA9ICdjbGljayc7XG5cblx0XHQvLyBTZXQgYGRhdGEtRlJBTUVXT1JLLWNsaWNrYWJsZWAgY3VzdG9tIGF0dHJpYnV0ZVxuXHRcdC8vICh1aSBsb2dpYyBzaG91bGQgYmUgZXh0ZW5kZWQgaW4gQ1NTKVxuXHRcdCRhZmZlY3RlZC5hdHRyKCdkYXRhLScgKyBGUkFNRVdPUksub3B0aW9ucy5mcmFtZXdvcmtJZCArICctZXZlbnRzJywgYm91bmRFdmVudHNTdHJpbmcpO1xuXG5cdFx0RlJBTUVXT1JLLnZlcmJvc2UoXG5cdFx0XHRjb21wb25lbnQuaWQgKyAnIDo6ICcgK1xuXHRcdFx0J0Rpc2FibGVkIHVzZXIgdGV4dCBzZWxlY3Rpb24gb24gZWxlbWVudHMgdy8gY2xpY2svdG91Y2ggZXZlbnRzOicsXG5cdFx0XHRjbGlja09yVG91Y2hFdmVudHMsXG5cdFx0XHQkYWZmZWN0ZWRcblx0XHQpO1xuXHR9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IERPTTtcbiIsIi8qKlxuICogVXRpbGl0eSBFdmVudCB0b29sa2l0XG4gKi9cblxudmFyIFV0aWxzID0gcmVxdWlyZSgnLi91dGlscy5qcycpO1xuXG52YXIgRXZlbnRzID0ge1xuXG5cdC8qKlxuXHQgKiBQYXJzZXMgYSBkaWN0aW9uYXJ5IG9mIGV2ZW50cyBhbmQgb3B0aW9uYWxseSBmaWx0ZXJzIGJ5IHRoZSBldmVudCB0eXBlLiBJZiB0aGUgZXZlbnRcblx0ICpcblx0ICogQHBhcmFtICB7T2JqZWN0fSBldmVudHMgIFtBIEJhY2tib25lLlZpZXcgZXZlbnRzIG9iamVjdF1cblx0ICogQHBhcmFtICB7T2JqZWN0fSBvcHRpb25zIFtPcHRpb25zIG9iamVjdCB0aGF0IGFsbG93cyB1cyB0byBmaWx0ZXIgcGFyc2luZyB0byBjZXJ0YWluIGV2ZW50XG5cdCAqICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZXNdXG5cdCAqXG5cdCAqIEByZXR1cm4ge0FycmF5fSAgICAgICAgICBbQXJyYXkgY29udGFpbmluZyBwYXJzZWRFdmVudHMgdGhhdCBhcmUgbWF0Y2hpbmcgZXZlbnQga2V5c11cblx0ICovXG5cdHBhcnNlOiBmdW5jdGlvbiAoZXZlbnRzLCBvcHRpb25zKSB7XG5cblx0XHR2YXIgZXZlbnRLZXlzID0gXy5rZXlzKGV2ZW50cyB8fCB7fSksXG5cdFx0XHRsaW1pdEV2ZW50cyxcblx0XHRcdHBhcnNlZEV2ZW50cyA9IFtdO1xuXG5cdFx0Ly8gT3B0aW9uYWxseSBmaWx0ZXIgdXNpbmcgc2V0IG9mIGFjY2VwdGFibGUgZXZlbnQgdHlwZXNcblx0XHRsaW1pdEV2ZW50cyA9IG9wdGlvbnMub25seTtcblx0XHRldmVudEtleXMgPSBfLmZpbHRlcihldmVudEtleXMsIGZ1bmN0aW9uIGNoZWNrRXZlbnROYW1lIChldmVudEtleSkge1xuXG5cdFx0XHQvLyBQYXJzZSBldmVudCBzdHJpbmcgaW50byBzZW1hbnRpYyByZXByZXNlbnRhdGlvblxuXHRcdFx0dmFyIGV2ZW50ID0gRXZlbnRzLnBhcnNlRE9NRXZlbnQoZXZlbnRLZXkpO1xuXHRcdFx0cGFyc2VkRXZlbnRzLnB1c2goZXZlbnQpO1xuXG5cdFx0XHQvLyBPcHRpb25hbCBmaWx0ZXJcblx0XHRcdGlmIChsaW1pdEV2ZW50cykge1xuXHRcdFx0XHRyZXR1cm4gXy5jb250YWlucyhsaW1pdEV2ZW50cywgZXZlbnQubmFtZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBwYXJzZWRFdmVudHM7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFtnZXRFbGVtZW50cyBkZXNjcmlwdGlvbl1cblx0ICpcblx0ICogQHBhcmFtICB7QXJyYXl9IHNlbWFudGljRXZlbnRzIFtBIGxpc3Qgb2YgcGFyc2VkIGV2ZW50IG9iamVjdHNdXG5cdCAqIEBwYXJhbSAge0NvbXBvbmVudH0gY29udGV4dCAgICBbSW5zdGFuY2Ugb2YgYSBjb21wb25lbnQgdG8gdXNlIGFzIGEgc3RhcnRpbmcgcG9pbnQgZm9yXG5cdCAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhlIERPTSBxdWVyaWVzXVxuXHQgKlxuXHQgKiBAcmV0dXJuIHtBcnJheX0gICAgICAgICAgICAgICAgW0FuIGFycmF5IG9mIGpRdWVyeSBzZXQgb2YgbWF0Y2hlZCBlbGVtZW50c11cblx0ICovXG5cdGdldEVsZW1lbnRzOiBmdW5jdGlvbiAoc2VtYW50aWNFdmVudHMsIGNvbnRleHQpIHtcblxuXHRcdC8vIENvbnRleHQgb3B0aW9uYWxcblx0XHRjb250ZXh0ID0gY29udGV4dCB8fCB7ICQ6ICQgfTtcblxuXHRcdC8vIEl0ZXJhdGl2ZWx5IGJ1aWxkIGEgc2V0IG9mIGFmZmVjdGVkIGVsZW1lbnRzXG5cdFx0dmFyICRhZmZlY3RlZCA9ICQoKTtcblx0XHRfLmVhY2goc2VtYW50aWNFdmVudHMsIGZ1bmN0aW9uIGxvb2t1cEVsZW1lbnRzRm9yRXZlbnQgKGV2ZW50KSB7XG5cblx0XHRcdC8vIERldGVybWluZSBtYXRjaGVkIGVsZW1lbnRzXG5cdFx0XHQvLyBVc2UgZGVsZWdhdGUgc2VsZWN0b3IgaWYgc3BlY2lmaWVkXG5cdFx0XHQvLyBPdGhlcndpc2UsIGdyYWIgdGhlIGVsZW1lbnQgZm9yIHRoaXMgY29tcG9uZW50XG5cdFx0XHR2YXIgJG1hdGNoZWQgPVx0ZXZlbnQuc2VsZWN0b3IgP1xuXHRcdFx0XHRcdFx0XHRjb250ZXh0LiQoZXZlbnQuc2VsZWN0b3IpIDpcblx0XHRcdFx0XHRcdFx0Y29udGV4dC4kZWw7XG5cblx0XHRcdC8vIEFkZCBtYXRjaGVkIGVsZW1lbnRzIHRvIHNldFxuXHRcdFx0JGFmZmVjdGVkID0gJGFmZmVjdGVkLmFkZCggJG1hdGNoZWQgKTtcblx0XHR9LCB0aGlzKTtcblxuXHRcdHJldHVybiAkYWZmZWN0ZWQ7XG5cdH0sXG5cblxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHdoZXRoZXIgdGhlIHNwZWNpZmllZCBldmVudCBrZXkgbWF0Y2hlcyBhIERPTSBldmVudC5cblx0ICpcblx0ICogQHBhcmFtICB7U3RyaW5nfSBrZXkgW0tleSB0byBtYXRjaCBhZ2FpbnN0XVxuXHQgKlxuXHQgKiBpZiBubyBtYXRjaCBpcyBmb3VuZFxuXHQgKiBAcmV0dXJuIHtCb29sZWFufSBcdFx0W3JldHVybiBgZmFsc2VgXVxuXHQgKlxuXHQgKiBvdGhlcndpc2Vcblx0ICogQHJldHVybiB7T2JqZWN0fSAgXHRcdFtPYmplY3QgY29udGFpbmluZyB0aGUgYG5hbWVgIG9mIHRoZSBET00gZWxlbWVudCBhbmQgdGhlIGBzZWxlY3RvcmBdXG5cdCAqL1xuXHRwYXJzZURPTUV2ZW50OiBfLm1lbW9pemUoZnVuY3Rpb24oa2V5KSB7XG5cblx0XHR2YXIgbWF0Y2hlcyA9IGtleS5tYXRjaCh0aGlzWycvRE9NRXZlbnQvJ10pO1xuXG5cdFx0aWYgKCFtYXRjaGVzIHx8ICFtYXRjaGVzWzFdKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdG5hbWU6IG1hdGNoZXNbMV0sXG5cdFx0XHRzZWxlY3RvcjogbWF0Y2hlc1szXVxuXHRcdH07XG5cdH0pLFxuXG5cblx0LyoqXG5cdCAqIFN1cHBvcnRlZCBcImZpcnN0LWNsYXNzXCIgRE9NIGV2ZW50cy5cblx0ICogQHR5cGUge0FycmF5fVxuXHQgKi9cblx0bmFtZXM6IFtcblxuXHRcdC8vIExvY2FsaXplZCBicm93c2VyIGV2ZW50c1xuXHRcdC8vICh3b3JrcyBvbiBpbmRpdmlkdWFsIGVsZW1lbnRzKVxuXHRcdCdlcnJvcicsICdzY3JvbGwnLFxuXG5cdFx0Ly8gTW91c2UgZXZlbnRzXG5cdFx0J2NsaWNrJywgJ2RibGNsaWNrJywgJ21vdXNlZG93bicsICdtb3VzZXVwJywgJ2hvdmVyJywgJ21vdXNlZW50ZXInLCAnbW91c2VsZWF2ZScsXG5cdFx0J21vdXNlb3ZlcicsICdtb3VzZW91dCcsICdtb3VzZW1vdmUnLFxuXG5cdFx0Ly8gS2V5Ym9hcmQgZXZlbnRzXG5cdFx0J2tleWRvd24nLCAna2V5dXAnLCAna2V5cHJlc3MnLFxuXG5cdFx0Ly8gRm9ybSBldmVudHNcblx0XHQnYmx1cicsICdjaGFuZ2UnLCAnZm9jdXMnLCAnZm9jdXNpbicsICdmb2N1c291dCcsICdzZWxlY3QnLCAnc3VibWl0JyxcblxuXHRcdC8vIFJhdyB0b3VjaCBldmVudHNcblx0XHQndG91Y2hzdGFydCcsICd0b3VjaGVuZCcsICd0b3VjaG1vdmUnLCAndG91Y2hjYW5jZWwnLFxuXG5cdFx0Ly8gTWFudWZhY3R1cmVkIGV2ZW50c1xuXHRcdCd0b3VjaCcsXG5cblx0XHQvLyBUT0RPOlxuXHRcdCdyaWdodGNsaWNrJywgJ2NsaWNrb3V0c2lkZSdcblx0XVxufTtcblxuXG5cblxuLyoqXG4gKiBSZWdleHAgdG8gbWF0Y2ggXCJmaXJzdCBjbGFzc1wiIERPTSBldmVudHNcbiAqICh0aGVzZSBhcmUgYWxsb3dlZCBpbiB0aGUgdG9wIGxldmVsIG9mIGEgY29tcG9uZW50IGRlZmluaXRpb24gYXMgbWV0aG9kIGtleXMpXG4gKlx0XHRpLmUuIC9eKGNsaWNrfGhvdmVyfGJsdXJ8Zm9jdXMpKCAoLispKS9cbiAqXHRcdFx0WzFdID0+IGV2ZW50IG5hbWVcbiAqXHRcdFx0WzNdID0+IHNlbGVjdG9yXG4gKi9cblxuRXZlbnRzWycvRE9NRXZlbnQvJ10gPSBuZXcgUmVnRXhwKCdeKCcgKyBfLnJlZHVjZShFdmVudHMubmFtZXMsXG5cdGZ1bmN0aW9uIGJ1aWxkUmVnZXhwKG1lbW8sIGV2ZW50TmFtZSwgaW5kZXgpIHtcblxuXHRcdC8vIE9taXQgYHxgIHRoZSBmaXJzdCB0aW1lXG5cdFx0aWYgKGluZGV4ID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gbWVtbyArIGV2ZW50TmFtZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbWVtbyArICd8JyArIGV2ZW50TmFtZTtcblx0fSwgJycpICtcbicpKCAoLispKT8kJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gRXZlbnRzO1xuIiwiLyoqXG4gKiBUcmFuc2xhdGUgKipyaWdodC1oYW5kLXNpZGUgYWJicmV2aWF0aW9ucyoqIGludG8gZnVuY3Rpb25zIHRoYXQgcGVyZm9ybVxuICogdGhlIHByb3BlciBiZWhhdmlvcnMsIGUuZy5cbiAqXHRcdCNhYm91dF9tZVxuICpcdFx0JW1haW5NZW51Om9wZW5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHRyYW5zbGF0ZVNob3J0aGFuZCh2YWx1ZSwga2V5KSB7XG5cblx0dmFyIG1hdGNoZXMsIGZuO1xuXG5cdC8vIElmIHRoaXMgaXMgYW4gaW1wb3J0YW50LCBGUkFNRVdPUkstc3BlY2lmaWMgZGF0YSBrZXksXG5cdC8vIGFuZCBhIGZ1bmN0aW9uIHdhcyBzcGVjaWZpZWQsIHJ1biBpdCB0byBnZXQgaXRzIHZhbHVlXG5cdC8vICh0aGlzIGlzIHRvIGtlZXAgcGFyaXR5IHdpdGggQmFja2JvbmUncyBzaW1pbGFyIGZ1bmN0aW9uYWxpdHkpXG5cdGlmIChfLmlzRnVuY3Rpb24odmFsdWUpICYmIChrZXkgPT09ICdjb2xsZWN0aW9uJyB8fCBrZXkgPT09ICdtb2RlbCcpKSB7XG5cdFx0cmV0dXJuIHZhbHVlKCk7XG5cdH1cblxuXHQvLyBJZ25vcmUgb3RoZXIgbm9uLXN0cmluZ3Ncblx0aWYgKCFfLmlzU3RyaW5nKHZhbHVlKSkge1xuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxuXG5cdC8vIFJlZGlyZWN0cyB1c2VyIHRvIGNsaWVudC1zaWRlIFVSTCwgdy9vIGFmZmVjdGluZyBicm93c2VyIGhpc3Rvcnlcblx0Ly8gTGlrZSBjYWxsaW5nIGBCYWNrYm9uZS5oaXN0b3J5Lm5hdmlnYXRlKCcvZm9vJywgeyByZXBsYWNlOiB0cnVlIH0pYFxuXHRpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXiMjKC4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHRcdGZuID0gZnVuY3Rpb24gcmVkaXJlY3RBbmRDb3ZlclRyYWNrcygpIHtcblx0XHRcdHZhciB1cmwgPSBtYXRjaGVzWzFdO1xuXHRcdFx0RlJBTUVXT1JLLmhpc3RvcnkubmF2aWdhdGUodXJsLCB7XG5cdFx0XHRcdHRyaWdnZXI6IHRydWUsXG5cdFx0XHRcdHJlcGxhY2U6IHRydWVcblx0XHRcdH0pO1xuXHRcdH07XG5cdH1cblx0Ly8gTWV0aG9kIHRvIHJlZGlyZWN0IHVzZXIgdG8gYSBjbGllbnQtc2lkZSBVUkwsIHRoZW4gY2FsbCB0aGUgaGFuZGxlclxuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eIyguKlteLlxcc10rKS8pKSAmJiBtYXRjaGVzWzFdKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiBjaGFuZ2VVcmxGcmFnbWVudCgpIHtcblx0XHRcdHZhciB1cmwgPSBtYXRjaGVzWzFdO1xuXHRcdFx0RlJBTUVXT1JLLmhpc3RvcnkubmF2aWdhdGUodXJsLCB7XG5cdFx0XHRcdHRyaWdnZXI6IHRydWVcblx0XHRcdH0pO1xuXHRcdH07XG5cdH1cblx0Ly8gTWV0aG9kIHRvIHRyaWdnZXIgZ2xvYmFsIGV2ZW50XG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14oJS4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHRcdGZuID0gZnVuY3Rpb24gdHJpZ2dlckV2ZW50KCkge1xuXHRcdFx0dmFyIHRyaWdnZXIgPSBtYXRjaGVzWzFdO1xuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UodGhpcy5pZCArICcgOjogVHJpZ2dlcmluZyBldmVudCAoJyArIHRyaWdnZXIgKyAnKS4uLicpO1xuXHRcdFx0RlJBTUVXT1JLLnRyaWdnZXIodHJpZ2dlcik7XG5cdFx0fTtcblx0fVxuXHQvLyBNZXRob2QgdG8gZmlyZSBhIHRlc3QgYWxlcnRcblx0Ly8gKHVzZSBtZXNzYWdlLCBpZiBzcGVjaWZpZWQpXG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14hISFcXHMqKC4qW14uXFxzXSk/LykpKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiBiYW5nQWxlcnQoZSkge1xuXG5cdFx0XHQvLyBJZiBzcGVjaWZpZWQsIG1lc3NhZ2UgaXMgdXNlZCwgb3RoZXJ3aXNlICdBbGVydCB0cmlnZ2VyZWQhJ1xuXHRcdFx0dmFyIG1zZyA9IChtYXRjaGVzICYmIG1hdGNoZXNbMV0pIHx8ICdEZWJ1ZyBhbGVydCAoISEhKSB0cmlnZ2VyZWQhJztcblxuXHRcdFx0Ly8gT3RoZXIgZGlhZ25vc3RpYyBpbmZvcm1hdGlvblxuXHRcdFx0bXNnICs9ICdcXG5cXG5EaWFnbm9zdGljc1xcbj09PT09PT09PT09PT09PT09PT09PT09PVxcbic7XG5cdFx0XHRpZiAoZSAmJiBlLmN1cnJlbnRUYXJnZXQpIHtcblx0XHRcdFx0bXNnICs9ICdlLmN1cnJlbnRUYXJnZXQgOjogJyArIGUuY3VycmVudFRhcmdldDtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmlkKSB7XG5cdFx0XHRcdG1zZyArPSAndGhpcy5pZCA6OiAnICsgdGhpcy5pZDtcblx0XHRcdH1cblxuXHRcdFx0YWxlcnQobXNnKTtcblx0XHR9O1xuXHR9XG5cblx0Ly8gTWV0aG9kIHRvIGxvZyBhIG1lc3NhZ2UgdG8gdGhlIGNvbnNvbGVcblx0Ly8gKHVzZSBtZXNzYWdlLCBpZiBzcGVjaWZpZWQpXG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14+Pj5cXHMqKC4qW14uXFxzXSk/LykpKSB7XG5cblx0XHRmbiA9IGZ1bmN0aW9uIGxvZ01lc3NhZ2UoZSkge1xuXG5cdFx0XHQvLyBJZiBzcGVjaWZpZWQsIG1lc3NhZ2UgaXMgdXNlZCwgb3RoZXJ3aXNlIHVzZSBkZWZhdWx0XG5cdFx0XHR2YXIgbXNnID0gKG1hdGNoZXMgJiYgbWF0Y2hlc1sxXSkgfHwgJ0xvZyBtZXNzYWdlICg+Pj4pIHRyaWdnZXJlZCEnO1xuXHRcdFx0RlJBTUVXT1JLLmxvZyhtc2cpO1xuXHRcdH07XG5cdH1cblxuXHQvLyBNZXRob2QgdG8gYXR0YWNoIHRoZSBzcGVjaWZpZWQgY29tcG9uZW50L3RlbXBsYXRlIHRvIGEgcmVnaW9uXG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14oLispQCguKlteLlxcc10pLykpICYmIG1hdGNoZXNbMV0gJiYgbWF0Y2hlc1syXSkge1xuXHRcdGZuID0gZnVuY3Rpb24gYXR0YWNoVGVtcGxhdGUoKSB7XG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZSh0aGlzLmlkICsgJyA6OiBBdHRhY2hpbmcgYCcgKyBtYXRjaGVzWzJdICsgJ2AgdG8gYCcgKyBtYXRjaGVzWzFdICsgJ2AuLi4nKTtcblxuXHRcdFx0dmFyIHJlZ2lvbiA9IG1hdGNoZXNbMV07XG5cdFx0XHR2YXIgdGVtcGxhdGUgPSBtYXRjaGVzWzJdO1xuXG5cdFx0XHR0aGlzW3JlZ2lvbl0uYXR0YWNoKHRlbXBsYXRlKTtcblx0XHR9O1xuXHR9XG5cblxuXHQvLyBNZXRob2QgdG8gYWRkIHRoZSBzcGVjaWZpZWQgY2xhc3Ncblx0ZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXlxcK1xccypcXC4oLipbXi5cXHNdKS8pKSAmJiBtYXRjaGVzWzFdKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiBhZGRDbGFzcygpIHtcblx0XHRcdEZSQU1FV09SSy52ZXJib3NlKHRoaXMuaWQgKyAnIDo6IEFkZGluZyBjbGFzcyAoJyArIG1hdGNoZXNbMV0gKyAnKS4uLicpO1xuXHRcdFx0dGhpcy4kZWwuYWRkQ2xhc3MobWF0Y2hlc1sxXSk7XG5cdFx0fTtcblx0fVxuXHQvLyBNZXRob2QgdG8gcmVtb3ZlIHRoZSBzcGVjaWZpZWQgY2xhc3Ncblx0ZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXlxcLVxccypcXC4oLipbXi5cXHNdKS8pKSAmJiBtYXRjaGVzWzFdKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiByZW1vdmVDbGFzcygpIHtcblx0XHRcdEZSQU1FV09SSy52ZXJib3NlKHRoaXMuaWQgKyAnIDo6IFJlbW92aW5nIGNsYXNzICgnICsgbWF0Y2hlc1sxXSArICcpLi4uJyk7XG5cdFx0XHR0aGlzLiRlbC5yZW1vdmVDbGFzcyhtYXRjaGVzWzFdKTtcblx0XHR9O1xuXHR9XG5cdC8vIE1ldGhvZCB0byB0b2dnbGUgdGhlIHNwZWNpZmllZCBjbGFzc1xuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eXFwhXFxzKlxcLiguKlteLlxcc10pLykpICYmIG1hdGNoZXNbMV0pIHtcblx0XHRmbiA9IGZ1bmN0aW9uIHRvZ2dsZUNsYXNzKCkge1xuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UodGhpcy5pZCArICcgOjogVG9nZ2xpbmcgY2xhc3MgKCcgKyBtYXRjaGVzWzFdICsgJykuLi4nKTtcblx0XHRcdHRoaXMuJGVsLnRvZ2dsZUNsYXNzKG1hdGNoZXNbMV0pO1xuXHRcdH07XG5cdH1cblxuXHQvLyBUT0RPOlx0YWxsb3cgZGVzY2VuZGFudHMgdG8gYmUgY29udHJvbGxlZCB2aWEgc2hvcnRoYW5kXG5cdC8vXHRcdFx0ZS5nLiA6ICdsaS5yb3cgLS5oaWdobGlnaHRlZCdcblx0Ly9cdFx0XHR3b3VsZCByZW1vdmUgdGhlIGBoaWdobGlnaHRlZGAgY2xhc3MgZnJvbSB0aGlzLiQoJ2xpLnJvdycpXG5cblxuXHQvLyBJZiBzaG9ydC1oYW5kIG1hdGNoZWQsIHJldHVybiB0aGUgZGVyZWZlcmVuY2VkIGZ1bmN0aW9uXG5cdGlmIChmbikge1xuXG5cdFx0RlJBTUVXT1JLLnZlcmJvc2UoJ0ludGVycHJldGluZyBtZWFuaW5nIGZyb20gc2hvcnRoYW5kIDo6IGAnICsgdmFsdWUgKyAnYC4uLicpO1xuXG5cdFx0Ly8gQ3VycnkgdGhlIHJlc3VsdCBmdW5jdGlvbiB3aXRoIGFueSBzdWZmaXggbWF0Y2hlc1xuXHRcdHZhciBjdXJyaWVkRm4gPSBmbjtcblxuXHRcdC8vIFRyYWlsaW5nIGAuYCBpbmRpY2F0ZXMgYW4gZS5zdG9wUHJvcGFnYXRpb24oKVxuXHRcdGlmICh2YWx1ZS5tYXRjaCgvXFwuXFxzKiQvKSkge1xuXHRcdFx0Y3VycmllZEZuID0gZnVuY3Rpb24gYW5kU3RvcFByb3BhZ2F0aW9uKGUpIHtcblxuXHRcdFx0XHQvLyBCaW5kIChzbyBpdCBpbmhlcml0cyBjb21wb25lbnQgY29udGV4dCkgYW5kIGNhbGwgaW50ZXJpb3IgZnVuY3Rpb25cblx0XHRcdFx0Zm4uYXBwbHkodGhpcyk7XG5cblx0XHRcdFx0Ly8gdGhlbiBpbW1lZGlhdGVseSBzdG9wIGV2ZW50IGJ1YmJsaW5nL3Byb3BhZ2F0aW9uXG5cdFx0XHRcdGlmIChlICYmIGUuc3RvcFByb3BhZ2F0aW9uKSB7XG5cdFx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRGUkFNRVdPUksud2Fybihcblx0XHRcdFx0XHRcdHRoaXMuaWQgKyAnIDo6IFRyYWlsaW5nIGAuYCBzaG9ydGhhbmQgd2FzIHVzZWQgdG8gaW52b2tlIGFuICcgK1xuXHRcdFx0XHRcdFx0J2Uuc3RvcFByb3BhZ2F0aW9uKCksIGJ1dCBcIicgKyB2YWx1ZSArICdcIiB3YXMgbm90IHRyaWdnZXJlZCBieSBhIERPTSBldmVudCFcXG4nICtcblx0XHRcdFx0XHRcdCdQcm9iYWJseSBiZXN0IHRvIGRvdWJsZS1jaGVjayB0aGlzIHdhcyB3aGF0IHlvdSBtZWFudCB0byBkby4nKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY3VycmllZEZuO1xuXHR9XG5cblxuXHQvLyBPdGhlcndpc2UsIGlmIG5vIHNob3J0LWhhbmQgbWF0Y2hlZCwgcGFzcyB0aGUgb3JpZ2luYWwgdmFsdWVcblx0Ly8gc3RyYWlnaHQgdGhyb3VnaFxuXHRyZXR1cm4gdmFsdWU7XG59O1xuIiwiLyoqXG4gKiBVdGlsaXR5IGZ1bmN0aW9ucyB0aGF0IGFyZSB1c2VkIHRocm91Z2hvdXQgdGhlIGNvcmUuXG4gKi9cblxudmFyIFV0aWxzID0ge1xuXG5cdC8qKlxuXHQgKiBHcmFicyB0aGUgaWQgeG9yIGRhdGEtaWQgZnJvbSBhbiBIVE1MIGVsZW1lbnQuXG5cdCAqXG5cdCAqIEBwYXJhbSAge0RPTUVsZW1lbnR9IGVsICAgIFtFbGVtZW50IHdoZXJlIHdlIGFyZSBsb29raW5nIGZvciB0aGUgYGlkYCBvciBgZGF0YS1pZGAgYXR0cl1cblx0ICogQHBhcmFtICB7Qm9vbGVhbn0gcmVxdWlyZWQgW0RldGVybWluZXMgaWYgaXQgaXMgcmVxdWlyZWQgdG8gZmluZCBhbiBgaWRgIG9yIGBkYXRhLWlkYCBhdHRyXVxuXHQgKlxuXHQgKiBAcmV0dXJuIHtTdHJpbmd9ICAgICAgICAgIFx0W0lkZW50aWZpY2F0aW9uIHN0cmluZyB0aGF0IHdhcyBmb3VuZF1cblx0ICovXG5cdGVsMmlkOiBmdW5jdGlvbihlbCwgcmVxdWlyZWQpIHtcblxuXHRcdHZhciBpZCA9ICQoZWwpLmF0dHIoJ2lkJyk7XG5cdFx0dmFyIGRhdGFJZCA9ICQoZWwpLmF0dHIoJ2RhdGEtaWQnKTtcblx0XHR2YXIgY29udGVudHNJZCA9ICQoZWwpLmF0dHIoJ2NvbnRlbnRzJyk7XG5cblx0XHRpZiAoaWQgJiYgZGF0YUlkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoaWQgKyAnIDo6IENhbm5vdCBzZXQgYm90aCBgaWRgIGFuZCBgZGF0YS1pZGAhICBQbGVhc2UgdXNlIG9uZSBvciB0aGUgb3RoZXIuICAoZGF0YS1pZCBpcyBzYWZlc3QpJyk7XG5cdFx0fVxuXHRcdGlmIChyZXF1aXJlZCAmJiAhaWQgJiYgIWRhdGFJZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdObyBpZCBzcGVjaWZpZWQgaW4gZWxlbWVudCB3aGVyZSBpdCBpcyByZXF1aXJlZDpcXG4nICsgZWwpO1xuXHRcdH1cblxuXHRcdHJldHVybiBpZCB8fCBkYXRhSWQgfHwgY29udGVudHNJZDtcblx0fSxcblxuXHQvKipcblx0ICogTWFwIGFuIG9iamVjdCdzIHZhbHVlcywgYW5kIHJldHVybiBhIHZhbGlkIG9iamVjdCAodGhpcyBmdW5jdGlvbiBpcyBoYW5keSBiZWNhdXNlXG5cdCAqIHVuZGVyc2NvcmUubWFwKCkgcmV0dXJucyBhIGxpc3QsIG5vdCBhbiBvYmplY3QuKVxuXHQgKlxuXHQgKiBAcGFyYW0gIHtPYmplY3R9IG9iaiAgICAgICAgIFx0W09qZWN0IHdob3MgdmFsdWVzIHlvdSB3YW50IHRvIG1hcF1cblx0ICogQHBhcmFtICB7RnVuY3Rpb259IHRyYW5zZm9ybUZuIFtGdW5jdGlvbiB0byB0cmFuc2Zvcm0gZWFjaCBvYmplY3QgdmFsdWUgYnldXG5cdCAqXG5cdCAqIEByZXR1cm4ge09iamVjdH0gICAgICAgICAgICAgXHRbTmV3IG9iamVjdCB3aXRoIHRoZSB2YWx1ZXMgbWFwcGVkXVxuXHQgKi9cblx0b2JqTWFwOiBmdW5jdGlvbiBvYmpNYXAob2JqLCB0cmFuc2Zvcm1Gbikge1xuXHRcdHJldHVybiBfLm9iamVjdChfLmtleXMob2JqKSwgXy5tYXAob2JqLCB0cmFuc2Zvcm1GbikpO1xuXHR9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFV0aWxzOyJdfQ==
;