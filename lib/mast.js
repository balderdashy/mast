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







},{"./component/index":5,"./define/index":11,"./raise/index":17,"./region/index":22}],2:[function(require,module,exports){
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

},{"./bindEvents":2,"./close":3,"./lifecycleEvents":6,"./lifecycleHooks":7,"./render":8,"./validateDefinition":9}],6:[function(require,module,exports){
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

},{"../utils/DOM":26,"./bindEvents":2,"./helpers":4}],9:[function(require,module,exports){
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

},{}],10:[function(require,module,exports){
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

},{}],11:[function(require,module,exports){
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

},{}],12:[function(require,module,exports){
/**
 *	Logget constructor method that will setup FRAMEWORK to log messages.
 */

var setupLogger = require('./setup');

module.exports = function Logger() {

	var FRAMEWORK = this;


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
					'(' + FRAMEWORK.id + '.logLevel = "' + logLevel + '")');
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

	console.log(this);

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

	var FRAMEWORK = this;

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
	new Logger(FRAMEWORK);

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

},{"../define/buildDefinition":10,"../logger/index":12,"../router/index":25,"./buildPrototype":14,"./collectRegions":15,"./collectTemplates":16}],18:[function(require,module,exports){
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
},{}]},{},[1])
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9idWlsZC5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL2NvbXBvbmVudC9iaW5kRXZlbnRzLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvY29tcG9uZW50L2Nsb3NlLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvY29tcG9uZW50L2hlbHBlcnMuanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9jb21wb25lbnQvaW5kZXguanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9jb21wb25lbnQvbGlmZWN5Y2xlRXZlbnRzLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvY29tcG9uZW50L2xpZmVjeWNsZUhvb2tzLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvY29tcG9uZW50L3JlbmRlci5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL2NvbXBvbmVudC92YWxpZGF0ZURlZmluaXRpb24uanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9kZWZpbmUvYnVpbGREZWZpbml0aW9uLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvZGVmaW5lL2luZGV4LmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvbG9nZ2VyL2luZGV4LmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvbG9nZ2VyL3NldHVwLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvcmFpc2UvYnVpbGRQcm90b3R5cGUuanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9yYWlzZS9jb2xsZWN0UmVnaW9ucy5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL3JhaXNlL2NvbGxlY3RUZW1wbGF0ZXMuanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9yYWlzZS9pbmRleC5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL3JlZ2lvbi9hcHBlbmQuanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9yZWdpb24vYXR0YWNoLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvcmVnaW9uL2VtcHR5LmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvcmVnaW9uL2Zyb21FbGVtZW50LmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvcmVnaW9uL2luZGV4LmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvcmVnaW9uL2luc2VydC5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL3JlZ2lvbi9yZW1vdmUuanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9yb3V0ZXIvaW5kZXguanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy91dGlscy9ET00uanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy91dGlscy9ldmVudHMuanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy91dGlscy9zaG9ydGhhbmQuanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy91dGlscy91dGlscy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0VBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0dBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcElBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDYkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9KQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIE1hc3QgYnVpbGQgZmlsZS4gVGhlIG1haW4gZmlsZVxuICovXG5cbnZhciBkZWZpbmUgPSByZXF1aXJlKCcuL2RlZmluZS9pbmRleCcpO1xudmFyIFJlZ2lvbiA9IHJlcXVpcmUoJy4vcmVnaW9uL2luZGV4Jyk7XG52YXIgQ29tcG9uZW50ID0gcmVxdWlyZSgnLi9jb21wb25lbnQvaW5kZXgnKTtcbnZhciByYWlzZSA9IHJlcXVpcmUoJy4vcmFpc2UvaW5kZXgnKTtcblxuKGZ1bmN0aW9uKGdsb2JhbCwgZnJhbWV3b3JrTmFtZSwgJCwgXywgQmFja2JvbmUsIHVuZGVmaW5lZCkge1xuXG5cdC8vIFVzZSBjdXN0b20gZnJhbWV3b3JrSWQgaWYgcHJvdmlkZWQgb3IgZGVmYXVsdCB0byAnRlJBTUVXT1JLJ1xuXHR2YXIgZnJhbWV3b3JrSWQgPSBmcmFtZXdvcmtOYW1lIHx8ICdGUkFNRVdPUksnO1xuXG5cdC8vIFVzZSBwcm92aWRlZCBCYWNrYm9uZSBvciBkZWZhdWx0IHRvIGdsb2JhbFxuXHRCYWNrYm9uZSA9IEJhY2tib25lIHx8IGdsb2JhbC5CYWNrYm9uZTtcblxuXHQvLyBVc2UgcHJvdmlkZWQgJCBvciBkZWZhdWx0IHRvIGdsb2JhbFxuXHQkID0gJCB8fCBnbG9iYWwuJDtcblx0XG5cdC8vIFVzZSBwcm92aWRlZCBfIG9yIGRlZmF1bHQgdG8gZ2xvYmFsXG5cdF8gPSBfIHx8IGdsb2JhbC5fO1xuXG5cdC8vIFN0YXJ0IG9mZiB3aXRoIEJhY2tib25lIGFuZCBidWlsZCBvbiB0b3Agb2YgaXRcblx0Z2xvYmFsW2ZyYW1ld29ya0lkXSA9IEJhY2tib25lO1xuXG5cdC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cdC8vIEhhY2shXG5cdC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cdEZSQU1FV09SSyA9IGdsb2JhbFtmcmFtZXdvcmtJZF07XG5cblx0Ly8gU3RhcnQgdy8gZW1wdHkgdGVtcGxhdGVzLCBjb21wb25lbnRzLCBhbmQgZGF0YVxuXHRGUkFNRVdPUksudGVtcGxhdGVzID0ge307XG5cdEZSQU1FV09SSy5jb21wb25lbnRzID0ge307XG5cdEZSQU1FV09SSy5kYXRhID0ge307XG5cdEZSQU1FV09SSy5fZGVmaW5lUXVldWUgPSBbXTtcblxuXHQvLyBSZWdpb24gY2FjaGVcblx0RlJBTUVXT1JLLnJlZ2lvbnMgPSB7fTtcblxuXHQvLyBTaG9ydGN1dCBkZWZhdWx0c1xuXHRGUkFNRVdPUksuc2hvcnRjdXQgPSB7fTtcblx0RlJBTUVXT1JLLnNob3J0Y3V0LnRlbXBsYXRlID0gdHJ1ZTtcblx0RlJBTUVXT1JLLnNob3J0Y3V0LmNvdW50ID0gdHJ1ZTtcblxuXG5cdEZSQU1FV09SSy5SZWdpb24gPSBSZWdpb247XG5cdEZSQU1FV09SSy5Db21wb25lbnQgPSBDb21wb25lbnQ7XG5cblx0RlJBTUVXT1JLLmRlZmluZSA9IGRlZmluZTtcblx0RlJBTUVXT1JLLnJhaXNlID0gcmFpc2U7XG5cbn0pXG5cblxuXG4vKipcbiAqIElmIHlvdSB3YW50IHRvIHBhc3MgaW4gYSBjdXN0b20gRnJhbWV3b3JrIG5hbWUsXG4gKiBhIEJhY2tib25lIGluc3RhbmNlLCBhbiB1bmRlcnNjb3JlL2xvZGFzaCBpbnN0YW5jZSxcbiAqIG9yIGEgalF1ZXJ5IGluc3RhbmNlLCB5b3UgY2FuIGRvIHNvIGFzIG9wdGlvbmFsIHBhcmFtZXRlcnMgXG4gKiBoZXJlLCBlLmcuXG4gKiAod2luZG93LCAnRm9vJywgJCwgXywgQmFja2JvbmUpXG4gKlxuICogT3RoZXJ3aXNlLCBqdXN0IHBhc3MgaW4gYHdpbmRvd2AgYW5kICdGUkFNRVdPUksnLCB3aW5kb3cuJCwgXG4gKiB3aW5kb3cuXywgd2luZG93LkJhY2tib25lIHdpbGwgYmUgdXNlZCwgZS5nLlxuICogKHdpbmRvdylcbiAqL1xuXG4od2luZG93LCAnRWlrb24nKTtcblxuXG5cblxuXG5cbiIsIi8qKlxuICogQmluZCBjb2xsZWN0aW9uIGV2ZW50cyB0byBsaWZlY3ljbGUgZXZlbnQgaGFuZGxlcnNcbiAqL1xuZXhwb3J0cy5jb2xsZWN0aW9uRXZlbnRzID0gZnVuY3Rpb24oKSB7XG5cdC8vIEJpbmQgdG8gY29sbGVjdGlvbiBldmVudHMgaWYgb25lIHdhcyBwYXNzZWQgaW5cblx0aWYgKHRoaXMuY29sbGVjdGlvbikge1xuXG5cdFx0Ly8gTGlzdGVuIHRvIGV2ZW50c1xuXHRcdHRoaXMubGlzdGVuVG8odGhpcy5jb2xsZWN0aW9uLCAnYWRkJywgdGhpcy5hZnRlckFkZCk7XG5cdFx0dGhpcy5saXN0ZW5Ubyh0aGlzLmNvbGxlY3Rpb24sICdyZW1vdmUnLCB0aGlzLmFmdGVyUmVtb3ZlKTtcblx0XHR0aGlzLmxpc3RlblRvKHRoaXMuY29sbGVjdGlvbiwgJ3Jlc2V0JywgdGhpcy5hZnRlclJlc2V0KTtcblx0fVxufTtcblxuLyoqXG4gKiBCaW5kIG1vZGVsIGV2ZW50cyB0byBsaWZlY3ljbGUgZXZlbnQgaGFuZGxlcnMgYW5kIGFsc28gYWxsb3dzIGZvciBoYW5kbGVycyB0byBmaXJlXG4gKiBvbiBjZXJ0YWluIG1vZGVsIGF0dHJpYnV0ZSBjaGFuZ2VzLlxuICovXG5leHBvcnRzLm1vZGVsRXZlbnRzID0gZnVuY3Rpb24oKSB7XG5cdGlmICh0aGlzLm1vZGVsKSB7XG5cblx0XHQvLyBMaXN0ZW4gZm9yIGFueSBhdHRyaWJ1dGUgY2hhbmdlc1xuXHRcdC8vIGUuZy5cblx0XHQvLyAuYWZ0ZXJDaGFuZ2UobW9kZWwsIG9wdGlvbnMpXG5cdFx0Ly9cblx0XHR0aGlzLmxpc3RlblRvKHRoaXMubW9kZWwsICdjaGFuZ2UnLCBmdW5jdGlvbiBtb2RlbENoYW5nZWQgKG1vZGVsLCBvcHRpb25zKSB7XG5cdFx0XHRpZiAoXy5pc0Z1bmN0aW9uKHRoaXMuYWZ0ZXJDaGFuZ2UpKSB7XG5cdFx0XHRcdHRoaXMuYWZ0ZXJDaGFuZ2UobW9kZWwsIG9wdGlvbnMpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Ly8gTGlzdGVuIGZvciBzcGVjaWZpYyBhdHRyaWJ1dGUgY2hhbmdlc1xuXHRcdC8vIGUuZy5cblx0XHQvLyAuYWZ0ZXJDaGFuZ2UuY29sb3IobW9kZWwsIHZhbHVlLCBvcHRpb25zKVxuXHRcdC8vXG5cdFx0aWYgKF8uaXNPYmplY3QodGhpcy5hZnRlckNoYW5nZSkpIHtcblx0XHRcdF8uZWFjaCh0aGlzLmFmdGVyQ2hhbmdlLCBmdW5jdGlvbiAoaGFuZGxlciwgYXR0ck5hbWUpIHtcblxuXHRcdFx0XHQvLyBDYWxsIGhhbmRsZXIgd2l0aCBuZXdWYWwgdG8ga2VlcCBhcmd1bWVudHMgc3RyYWlnaHRmb3J3YXJkXG5cdFx0XHRcdHRoaXMubGlzdGVuVG8odGhpcy5tb2RlbCwgJ2NoYW5nZTonICsgYXR0ck5hbWUsIGZ1bmN0aW9uIGF0dHJDaGFuZ2VkIChtb2RlbCwgbmV3VmFsKSB7XG5cdFx0XHRcdFx0aGFuZGxlci5jYWxsKHNlbGYsIG5ld1ZhbCk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHR9LCB0aGlzKTtcblx0XHR9XG5cdH1cbn07XG5cbi8qKlxuICogTGlzdGVucyBmb3IgYW5kIHJ1bnMgaGFuZGxlcnMgb24gZ2xvYmFsIGV2ZW50cyB0aGF0IGFyZSBsaXN0ZW5lZCBmb3Igb24gYSBjb21wb25lbnQuXG4gKi9cbmV4cG9ydHMuZ2xvYmFsVHJpZ2dlcnMgPSBmdW5jdGlvbigpIHtcblxuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0dGhpcy5saXN0ZW5UbyhGUkFNRVdPUkssICdhbGwnLCBmdW5jdGlvbiAoZVJvdXRlKSB7XG5cblx0XHQvLyBUcmltIG9mZiBhbGwgYnV0IHRoZSBmaXJzdCBhcmd1bWVudCB0byBwYXNzIHRocm91Z2ggdG8gaGFuZGxlclxuXHRcdHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcblx0XHRhcmdzLnNoaWZ0KCk7XG5cblx0XHQvLyBJdGVyYXRlIHRocm91Z2ggZWFjaCBzdWJzY3JpcHRpb24gb24gdGhpcyBjb21wb25lbnRcblx0XHQvLyBhbmQgbGlzdGVuIGZvciB0aGUgc3BlY2lmaWVkIGdsb2JhbCBldmVudHNcblx0XHRfLmVhY2goc2VsZi5zdWJzY3JpcHRpb25zLCBmdW5jdGlvbihoYW5kbGVyLCBtYXRjaFBhdHRlcm4pIHtcblxuXHRcdFx0Ly8gR3JhYiByZWdleCBhbmQgcGFyYW0gcGFyc2luZyBsb2dpYyBmcm9tIEJhY2tib25lIGNvcmVcblx0XHRcdHZhciBleHRyYWN0UGFyYW1zID0gQmFja2JvbmUuUm91dGVyLnByb3RvdHlwZS5fZXh0cmFjdFBhcmFtZXRlcnMsXG5cdFx0XHRcdGNhbGN1bGF0ZVJlZ2V4ID0gQmFja2JvbmUuUm91dGVyLnByb3RvdHlwZS5fcm91dGVUb1JlZ0V4cDtcblxuXHRcdFx0Ly8gVHJpbSB0cmFpbGluZ1xuXHRcdFx0bWF0Y2hQYXR0ZXJuID0gbWF0Y2hQYXR0ZXJuLnJlcGxhY2UoL1xcLyokL2csICcnKTtcblx0XHRcdC8vIGFuZCBlciBzb3J0IG9mLi4gbGVhZGluZy4uIHNsYXNoZXNcblx0XHRcdG1hdGNoUGF0dGVybiA9IG1hdGNoUGF0dGVybi5yZXBsYWNlKC9eKFsjfiVdKVxcLyovZywgJyQxJyk7XG5cdFx0XHQvLyBUT0RPOiBvcHRpbWl6YXRpb24tIHRoaXMgcmVhbGx5IG9ubHkgaGFzIHRvIGJlIGRvbmUgb25jZSwgb24gcmFpc2UoKSwgd2Ugc2hvdWxkIGRvIHRoYXRcblxuXG5cdFx0XHQvLyBDb21lIHVwIHdpdGggcmVnZXggZm9yIHRoaXMgbWF0Y2hQYXR0ZXJuXG5cdFx0XHR2YXIgcmVnZXggPSBjYWxjdWxhdGVSZWdleChtYXRjaFBhdHRlcm4pO1xuXG5cdFx0XHQvLyBJZiB0aGlzIG1hdGNoUGF0ZXJuIGlzIHRoaXMgaXMgbm90IGEgbWF0Y2ggZm9yIHRoZSBldmVudCxcblx0XHRcdC8vIGBjb250aW51ZWAgaXQgYWxvbmcgdG8gaXQgY2FuIHRyeSB0aGUgbmV4dCBtYXRjaFBhdHRlcm5cblx0XHRcdGlmICghZVJvdXRlLm1hdGNoKHJlZ2V4KSkgcmV0dXJuO1xuXG5cdFx0XHQvLyBQYXJzZSBwYXJhbWV0ZXJzIGZvciB1c2UgYXMgYXJncyB0byB0aGUgaGFuZGxlclxuXHRcdFx0Ly8gKG9yIGFuIGVtcHR5IGxpc3QgaWYgbm9uZSBleGlzdClcblx0XHRcdHZhciBwYXJhbXMgPSBleHRyYWN0UGFyYW1zKHJlZ2V4LCBlUm91dGUpO1xuXG5cdFx0XHQvLyBIYW5kbGUgc3RyaW5nIHJlZGlyZWN0cyB0byBmdW5jdGlvbiBuYW1lc1xuXHRcdFx0aWYgKCFfLmlzRnVuY3Rpb24oaGFuZGxlcikpIHtcblx0XHRcdFx0aGFuZGxlciA9IHNlbGZbaGFuZGxlcl07XG5cblx0XHRcdFx0aWYgKCFoYW5kbGVyKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgdHJpZ2dlciBzdWJzY3JpcHRpb24gYmVjYXVzZSBvZiB1bmtub3duIGhhbmRsZXI6ICcgKyBoYW5kbGVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBCaW5kIGNvbnRleHQgYW5kIGFyZ3VtZW50cyB0byBzdWJzY3JpcHRpb24gaGFuZGxlclxuXHRcdFx0aGFuZGxlci5hcHBseShzZWxmLCBfLnVuaW9uKGFyZ3MsIHBhcmFtcykpO1xuXG5cdFx0fSk7XG5cdH0pO1xufTtcbiIsIi8qKlxuICogU2FmZWx5IHphcCBldmVyeSB0cmFjZSBhYm91dCB0aGlzIGNvbXBvbmVudCBmcm9tIG1lbW9yeS5cbiAqL1xuXG52YXIgaGVscGVycyA9IHJlcXVpcmUoJy4vaGVscGVycycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNsb3NlKCkge1xuXG5cdEZSQU1FV09SSy5kZWJ1ZygnQ2xvc2VkICcgKyB0aGlzLmlkICsgJyBjb21wb25lbnQuJyk7XG5cdHZhciBzZWxmID0gdGhpcztcblxuXHQvLyBDYW5jZWwgY3VycmVudCByZW5kZXIgYW5kIGNsb3NlIGpvYnMsIGlmIHRoZXkncmUgcnVubmluZ1xuXHRpZiAodGhpcy5fcmVuZGVyaW5nKSB7XG5cdFx0c2VsZi5fcmVuZGVyaW5nQ2FuY2VsZWQgPSB0cnVlO1xuXHRcdHRoaXMuY2FuY2VsUmVuZGVyKCk7XG5cdFx0c2VsZi5fcmVuZGVyaW5nID0gZmFsc2U7XG5cdH1cblx0aWYgKHRoaXMuX2Nsb3NpbmcpIHtcblx0XHR0aGlzLmNhbmNlbENsb3NlKCk7XG5cdFx0c2VsZi5fY2xvc2luZyA9IGZhbHNlO1xuXHR9XG5cblx0Ly8gTG9jayBhY2Nlc3MgdG8gY2xvc2UoKVxuXHR0aGlzLl9jbG9zaW5nID0gdHJ1ZTtcblxuXHR0aGlzLmJlZm9yZUNsb3NlKGZ1bmN0aW9uICgpIHtcblxuXHRcdC8vID4gTk9URTogYHRoaXMuX2Nsb3Npbmc9ZmFsc2VgIGNhbiBhbmQgcHJvYmFibHkgc2hvdWxkIGJlIHJlbW92ZWQsXG5cdFx0Ly8gPiBzaW5jZSBtdXRleCBpcyB1bm5lY2Vzc2FyeSBub3cgdGhhdCB0aGUgY29tcG9uZW50IGlzIHVwIGZvciBnYXJiYWdlIGNvbGxlY3Rpb25cblx0XHQvLyA+IFdhaXRpbmcgdG8gZG8gdGhpcyB1bnRpbCBpdCBjYW4gYmUgdGVzdGVkIGZ1cnRoZXJcblxuXHRcdC8vIFVubG9jayBjbG9zZSgpXG5cdFx0c2VsZi5fY2xvc2luZyA9IGZhbHNlO1xuXG5cdFx0Ly8gU3RvcCBsaXN0ZW5pbmcgdG8gYWxsIGdsb2JhbCB0cmlnZ2VycyAoJXwjKVxuXG5cdFx0Ly8gQ2xvc2UgYWxsIGNoaWxkIGNvbXBvbmVudHNcblxuXHRcdGhlbHBlcnMuZW1wdHlBbGxSZWdpb25zLmNhbGwoc2VsZik7XG5cblx0XHQvLyBDYWxsIG5hdGl2ZSBgQmFja2JvbmUuVmlldy5wcm90b3R5cGUucmVtb3ZlKClgXG5cdFx0Ly8gdG8gdW5kZWxlZ2F0ZSBldmVudHMsIGV0Yy5cblx0XHRzZWxmLnJlbW92ZSgpO1xuXG5cdH0pO1xufTtcbiIsIi8qKlxuICogSGVscGVyIGZ1bmN0aW9ucyB1c2VkIGJ5IGNvbXBvbmVudHMvXG4gKi9cblxudmFyIGhlbHBlcnMgPSBtb2R1bGUuZXhwb3J0cyA9IHtcblxuXHQvKipcbiAqIElmIGFueSByZWdpb25zIGV4aXN0IGluIHRoaXMgY29tcG9uZW50LFxuICogZW1wdHkgdGhlbSwgYW5kIHRoZW4gZGVsZXRlIHRoZW1cbiAqL1xuXHRlbXB0eUFsbFJlZ2lvbnM6IGZ1bmN0aW9uKCkge1xuXHRcdF8uZWFjaCh0aGlzLnJlZ2lvbnMsIGZ1bmN0aW9uIChyZWdpb24sIGtleSkge1xuXHRcdFx0cmVnaW9uLmVtcHR5KCk7XG5cdFx0XHRkZWxldGUgdGhpcy5yZWdpb25zW2tleV07XG5cdFx0fSwgdGhpcyk7XG5cdH0sXG5cblx0LyoqXG5cdCAqIEluc3RhbnRpYXRlIHJlZ2lvbiBjb21wb25lbnRzIGFuZCBhcHBlbmQgYW55IGRlZmF1bHRcblx0ICogdGVtcGxhdGVzL2NvbXBvbmVudHMgdG8gdGhlIERPTVxuXHQgKi9cblx0cmVuZGVyUmVnaW9uczogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdFx0aGVscGVycy5lbXB0eUFsbFJlZ2lvbnMoKTtcblxuXHRcdC8vIERldGVjdCBjaGlsZCByZWdpb25zIGluIHRlbXBsYXRlXG5cdFx0dmFyICRyZWdpb25zID0gdGhpcy4kKCdyZWdpb24sIFtkYXRhLXJlZ2lvbl0nKTtcblx0XHQkcmVnaW9ucy5lYWNoKGZ1bmN0aW9uIChpLCBlbCkge1xuXG5cdFx0XHQvLyBQcm92aWRlIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5IGZvclxuXHRcdFx0Ly8gYGRlZmF1bHRgLCBgY29udGVudHNgIGFuZCBgdGVtcGxhdGVgIG5vdGF0aW9uXG5cdFx0XHR2YXIgY29tcG9uZW50SWQgPSAkKGVsKS5hdHRyKCdkZWZhdWx0Jyk7XG5cdFx0XHRjb21wb25lbnRJZCA9IGNvbXBvbmVudElkIHx8ICQoZWwpLmF0dHIoJ2NvbnRlbnRzJyk7XG5cdFx0XHRjb21wb25lbnRJZCA9IGNvbXBvbmVudElkIHx8ICQoZWwpLmF0dHIoJ3RlbXBsYXRlJyk7XG5cdFx0XHQkKGVsKS5hdHRyKCdjb250ZW50cycsIGNvbXBvbmVudElkKTtcblxuXHRcdFx0Ly8gR2VuZXJhdGUgYSByZWdpb24gaW5zdGFuY2UgZnJvbSB0aGUgZWxlbWVudFxuXHRcdFx0Ly8gKG1vZGlmeWluZyB0aGUgRE9NIGFzIG5lY2Vzc2FyeSlcblx0XHRcdHZhciByZWdpb24gPSBGUkFNRVdPUksuUmVnaW9uLmZyb21FbGVtZW50KGVsLCBzZWxmKTtcblxuXHRcdFx0Ly8gS2VlcCB0cmFjayBvZiByZWdpb25zLCBzaW5jZSB3ZSBhcmUgdGhlIHBhcmVudCBjb21wb25lbnRcblx0XHRcdHNlbGYucmVnaW9uc1tyZWdpb24uaWRdID0gcmVnaW9uO1xuXG5cdFx0XHQvLyBBcyBsb25nIGFzIHRoZXJlIGFyZSBubyBjb2xsaXNpb25zLFxuXHRcdFx0Ly8gcHJvdmlkZSBhIGZyaWVuZGx5IHJlZmVyZW5jZSB0byB0aGUgcmVnaW9uIG9uIHRoZSB0b3AgbGV2ZWwgb2YgdGhlIGNvbGxlY3Rpb25cblx0XHRcdGlmICghc2VsZltyZWdpb24uaWRdKSB7XG5cdFx0XHRcdHNlbGZbcmVnaW9uLmlkXSA9IHJlZ2lvbjtcblx0XHRcdH1cblx0XHR9KTtcblx0fSxcblxuXHQvKipcblx0ICogQ29udmVydCB0ZW1wbGF0ZSBIVE1MIGFuZCBkYXRhIGludG8gYSBjb21waWxlZCAkdGVtcGxhdGVcblx0ICovXG5cdGNvbXBpbGVUZW1wbGF0ZTogZnVuY3Rpb24oKSB7XG5cblx0XHQvLyBDcmVhdGUgdGVtcGxhdGUgZGF0YSBjb250ZXh0IGJ5IHByb3ZpZGluZyBhY2Nlc3MgdG8gdGhlIGdsb2JhbCBEYXRhIG9iamVjdCxcblx0XHQvLyBBbHNvIGZvbGQgaW4gdGhlIG1vZGVsIGFzc29jaWF0ZWQgd2l0aCB0aGlzIGNvbXBvbmVudCwgaWYgdGhlcmUgaXMgb25lXG5cdFx0dmFyIHRlbXBsYXRlQ29udGV4dCA9IF8uZXh0ZW5kKHtcblxuXHRcdFx0Ly8gQWxsb3dzIHlvdSB0byBnZXQgYSBob2xkIG9mIGRhdGEsXG5cdFx0XHQvLyBidXQgdXNlIGEgZGVmYXVsdCB2YWx1ZSBpZiBpdCBkb2Vzbid0IGV4aXN0XG5cdFx0XHRnZXQ6IGZ1bmN0aW9uIChrZXksIGRlZmF1bHRWYWwpIHtcblx0XHRcdFx0dmFyIHZhbCA9IHRlbXBsYXRlQ29udGV4dFtrZXldO1xuXHRcdFx0XHRpZiAodHlwZW9mIHZhbCA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdFx0XHR2YWwgPSBkZWZhdWx0VmFsO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB2YWw7XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdC8vIEFsbCBGUkFNRVdPUksuZGF0YSBpcyBhdmFpbGFibGUgaW4gZXZlcnkgdGVtcGxhdGVcblx0XHRGUkFNRVdPUksuZGF0YSk7XG5cblx0XHQvLyBJZiBhIG1vZGVsIGlzIHByb3ZpZGVkIGZvciB0aGlzIGNvbXBvbmVudCwgbWFrZSBpdCBhdmFpbGFibGUgaW4gdGhpcyB0ZW1wbGF0ZVxuXHRcdGlmICh0aGlzLm1vZGVsKSB7XG5cdFx0XHRfLmV4dGVuZCh0ZW1wbGF0ZUNvbnRleHQsIHRoaXMubW9kZWwuYXR0cmlidXRlcyk7XG5cdFx0fVxuXG5cdFx0Ly8gVGVtcGxhdGUgdGhlIEhUTUwgd2l0aCB0aGUgZGF0YVxuXHRcdHZhciBodG1sO1xuXHRcdHRyeSB7XG5cdFx0XHQvLyBBY2NlcHQgcHJlY29tcGlsZWQgdGVtcGxhdGVzXG5cdFx0XHRpZiAoXy5pc0Z1bmN0aW9uKHRoaXMudGVtcGxhdGUpKSB7XG5cdFx0XHRcdGh0bWwgPSB0aGlzLnRlbXBsYXRlKHRlbXBsYXRlQ29udGV4dCk7XG5cdFx0XHR9XG5cdFx0XHQvLyBPciByYXcgc3RyaW5nc1xuXHRcdFx0ZWxzZSBodG1sID0gXy50ZW1wbGF0ZSh0aGlzLnRlbXBsYXRlLCB0ZW1wbGF0ZUNvbnRleHQpO1xuXHRcdH1cblx0XHRjYXRjaCAoZSkge1xuXHRcdFx0dmFyIHN0ciA9IGUsXG5cdFx0XHRcdHN0YWNrID0gJyc7XG5cblx0XHRcdGlmIChlIGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdFx0c3RyID0gIGUudG9TdHJpbmcoKTtcblx0XHRcdFx0c3RhY2sgPSBlLnN0YWNrO1xuXHRcdFx0fVxuXG5cdFx0XHRGUkFNRVdPUksuZXJyb3IodGhpcy5pZCArICcgOjogcmVuZGVyKCkgZXJyb3IgaW4gdGVtcGxhdGUgOlxcbicgKyBzdHIgKyAnXFxuVGVtcGxhdGUgOjogJyArIGh0bWwgKyAnXFxuJyArIHN0YWNrKTtcblx0XHRcdGh0bWwgPSB0aGlzLnRlbXBsYXRlO1xuXHRcdH1cblxuXHRcdHJldHVybiBodG1sO1xuXHR9XG5cbn07XG4iLCIvKipcbiAqIENvbXBvbmVudCBpcyBhbiBleHRlbmRlZCBgQmFja2JvbmUuVmlld2AuIEl0IGFkZCBmZWF0dXJlcyBzdWNoIGFzIGF1dG9tYXRpYyBldmVudCBiaW5kaW5nLFxuICogcmVuZGVyaW5nLCBsaWZlY3ljbGUgaG9va3MgYW5kIGV2ZW50cywgYW5kIG1vcmUuXG4gKi9cblxudmFyIGxpZmVjeWNsZUhvb2tzICAgICA9IHJlcXVpcmUoJy4vbGlmZWN5Y2xlSG9va3MnKSxcblx0XHRsaWZlY3ljbGVFdmVudHMgICAgPSByZXF1aXJlKCcuL2xpZmVjeWNsZUV2ZW50cycpLFxuXHRcdGJpbmRFdmVudHMgICAgICAgICA9IHJlcXVpcmUoJy4vYmluZEV2ZW50cycpLFxuXHRcdGNsb3NlICAgICAgICAgICAgICA9IHJlcXVpcmUoJy4vY2xvc2UnKSxcblx0XHRyZW5kZXIgICAgICAgICAgICAgPSByZXF1aXJlKCcuL3JlbmRlcicpLFxuXHRcdHZhbGlkYXRlRGVmaW5pdGlvbiA9IHJlcXVpcmUoJy4vdmFsaWRhdGVEZWZpbml0aW9uJyk7XG5cbkNvbXBvbmVudCA9IG1vZHVsZS5leHBvcnRzID0gQmFja2JvbmUuVmlldy5leHRlbmQoKTtcblxuXG5fLmV4dGVuZChDb21wb25lbnQucHJvdG90eXBlLCB7XG5cblx0Ly8gTGlmZWN5Y2xlIEhvb2tzXG5cdGJlZm9yZVJlbmRlcjogZnVuY3Rpb24oY2IpIHtcblx0XHRsaWZlY3ljbGVIb29rcy5iZWZvcmVSZW5kZXIuY2FsbCh0aGlzLCBjYik7XG5cdH0sXG5cdGJlZm9yZUNsb3NlOiBmdW5jdGlvbihjYikge1xuXHRcdGxpZmVjeWNsZUhvb2tzLmJlZm9yZUNsb3NlLmNhbGwodGhpcywgY2IpO1xuXHR9LFxuXHRhZnRlclJlbmRlcjogZnVuY3Rpb24oKSB7XG5cdFx0bGlmZWN5Y2xlSG9va3MuYWZ0ZXJSZW5kZXIuY2FsbCh0aGlzKTtcblx0fSxcblx0Y2FuY2VsUmVuZGVyOiBmdW5jdGlvbigpIHtcblx0XHRsaWZlY3ljbGVIb29rcy5jYW5jZWxSZW5kZXIuY2FsbCh0aGlzKTtcblx0fSxcblx0Y2FuY2VsQ2xvc2U6IGZ1bmN0aW9uKCkge1xuXHRcdGxpZmVjeWNsZUhvb2tzLmNhbmNlbENsb3NlLmNhbGwodGhpcyk7XG5cdH0sXG5cblx0Ly8gTGlmZWN5Y2xlIEV2ZW50c1xuXHRhZnRlckNoYW5nZTogZnVuY3Rpb24obW9kZWwsIG9wdGlvbnMpIHtcblx0XHRsaWZlY3ljbGVFdmVudHMuYWZ0ZXJDaGFuZ2UuY2FsbCh0aGlzLCBtb2RlbCwgb3B0aW9ucyk7XG5cdH0sXG5cdGFmdGVyQWRkOiBmdW5jdGlvbihtb2RlbCwgY29sbGVjdGlvbiwgb3B0aW9ucykge1xuXHRcdGxpZmVjeWNsZUV2ZW50cy5hZnRlckFkZC5jYWxsKHRoaXMsIG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zKTtcblx0fSxcblx0YWZ0ZXJSZW1vdmU6IGZ1bmN0aW9uKG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zKSB7XG5cdFx0bGlmZWN5Y2xlRXZlbnRzLmFmdGVyUmVtb3ZlLmNhbGwodGhpcywgbW9kZWwsIGNvbGxlY3Rpb24sIG9wdGlvbnMpO1xuXHR9LFxuXHRhZnRlclJlc2V0OiBmdW5jdGlvbihjb2xsZWN0aW9uLCBvcHRpb25zKSB7XG5cdFx0bGlmZWN5Y2xlRXZlbnRzLmFmdGVyUmVzZXQuY2FsbCh0aGlzLCBjb2xsZWN0aW9uLCBvcHRpb25zKTtcblx0fSxcblxuXHQvLyBQcm90b3R5cGUgbWV0aG9kcy5cblx0Y2xvc2U6IGZ1bmN0aW9uKCkge1xuXHRcdGNsb3NlLmNhbGwodGhpcyk7XG5cdH0sXG5cdHJlbmRlcjogZnVuY3Rpb24oYXRJbmRleCkge1xuXHRcdHJlbmRlci5jYWxsKHRoaXMsIGF0SW5kZXgpO1xuXHR9XG59KTtcblxuXG5cblxuQ29tcG9uZW50LnByb3RvdHlwZS5pbml0aWFsaXplID0gZnVuY3Rpb24ocHJvcGVydGllcykge1xuXG5cdHZhciBzZWxmID0gdGhpcztcblxuXHQvLyBEaXNhYmxlIG9yIGlzc3VlIHdhcm5pbmdzIGFib3V0IGNlcnRhaW4gcHJvcGVydGllc1xuXHQvLyBhbmQgbWV0aG9kcyB0byBhdm9pZCBjb25mdXNpb25cblx0cHJvcGVydGllcyA9IHZhbGlkYXRlRGVmaW5pdGlvbihwcm9wZXJ0aWVzKTtcblxuXHQvLyBFeHRlbmQgaW5zdGFuY2Ugdy8gc3BlY2lmaWVkIHByb3BlcnRpZXMgYW5kIG1ldGhvZHNcblx0Xy5leHRlbmQodGhpcywgcHJvcGVydGllcyk7XG5cblx0Ly8gU3RhcnQgd2l0aCBlbXB0eSByZWdpb25zIG9iamVjdFxuXHR0aGlzLnJlZ2lvbnMgPSB7fTtcblxuXHQvLyBFbmNvdXJhZ2UgY2hpbGQgbWV0aG9kcyB0byB1c2UgdGhlIGNvbXBvbmVudCBjb250ZXh0XG5cdF8uYmluZEFsbCh0aGlzKTtcbn07XG4iLCIvLyBGaXJlZCB3aGVuIHRoZSBib3VuZCBtb2RlbCBpcyB1cGRhdGVkIChgdGhpcy5tb2RlbGApXG5leHBvcnRzLmFmdGVyQ2hhbmdlID0gZnVuY3Rpb24gKG1vZGVsLCBvcHRpb25zKSB7fTtcblxuLy8gRmlyZWQgd2hlbiBhIG1vZGVsIGlzIGFkZGVkIHRvIHRoZSBib3VuZCBjb2xsZWN0aW9uIChgdGhpcy5jb2xsZWN0aW9uYClcbmV4cG9ydHMuYWZ0ZXJBZGQgPSBmdW5jdGlvbiAobW9kZWwsIGNvbGxlY3Rpb24sIG9wdGlvbnMpIHt9O1xuXG4vLyBGaXJlZCB3aGVuIGEgbW9kZWwgaXMgcmVtb3ZlZCBmcm9tIHRoZSBib3VuZCBjb2xsZWN0aW9uIChgdGhpcy5jb2xsZWN0aW9uYClcbmV4cG9ydHMuYWZ0ZXJSZW1vdmUgPSBmdW5jdGlvbiAobW9kZWwsIGNvbGxlY3Rpb24sIG9wdGlvbnMpIHt9O1xuXG4vLyBGaXJlZCB3aGVuIHRoZSBib3VuZCBjb2xsZWN0aW9uIGlzIHdpcGVkIChgdGhpcy5jb2xsZWN0aW9uYClcbmV4cG9ydHMuYWZ0ZXJSZXNldCA9IGZ1bmN0aW9uIChjb2xsZWN0aW9uLCBvcHRpb25zKSB7fTtcbiIsIi8vIEZpcmVkIGF1dG9tYXRpY2FsbHkgd2hlbiB0aGUgdmlldyBpcyBpbml0aWFsbHkgY3JlYXRlZFxuLy8gb25seSBmaXJlZCBhZnRlcndhcmRzIGlmIHRoaXMucmVuZGVyKCkgaXMgZXhwbGljaXRseSBjYWxsZWRcbi8vIENhbGxiYWNrIG11c3QgYmUgZmlyZWQhIVxuZXhwb3J0cy5iZWZvcmVSZW5kZXIgPSBmdW5jdGlvbiAoY2IpIHtjYigpO307XG5cbi8vIEZpcmVkIGF1dG9tYXRpY2FsbHkgd2hlbiB0aGUgdmlldyBpcyBpbml0aWFsbHkgY3JlYXRlZFxuLy8gb25seSBmaXJlZCBhZnRlcndhcmRzIGlmIHRoaXMucmVuZGVyKCkgaXMgZXhwbGljaXRseSBjYWxsZWRcbmV4cG9ydHMuYWZ0ZXJSZW5kZXIgPSBmdW5jdGlvbiAoKSB7fTtcblxuLy8gRmlyZWQgYXV0b21hdGljYWxseSB3aGVuIHRoZSB2aWV3IGlzIGNsb3NlZFxuZXhwb3J0cy5iZWZvcmVDbG9zZSA9IGZ1bmN0aW9uIChjYikge2NiKCk7fTtcblxuLy8gRmlyZWQgYmVmb3JlIHJlcmVuZGVyaW5nIG9yIGNsb3NpbmcgYSB2aWV3IHRoYXQgaXMgYWxyZWFkeSB3YWl0aW5nIG9uIGEgbG9ja1xuZXhwb3J0cy5jYW5jZWxSZW5kZXIgPSBmdW5jdGlvbiAoKSB7XG5cdEZSQU1FV09SSy53YXJuKCdjYW5jZWxSZW5kZXIoKSBzaG91bGQgYmUgZGVmaW5lZCBpZiBiZWZvcmVDbG9zZShjYikgb3IgYmVmb3JlUmVuZGVyKGNiKScgK1xuXHRcdFx0XHRcdFx0XHRcdCAnYXJlIGJlaW5nIHVzZWQhJyk7XG59O1xuXG4vLyBGaXJlZCBiZWZvcmUgcmVyZW5kZXJpbmcgb3IgY2xvc2luZyBhIHZpZXcgdGhhdCBpcyBhbHJlYWR5IHdhaXRpbmcgb24gYSBsb2NrXG5leHBvcnRzLmNhbmNlbENsb3NlID0gZnVuY3Rpb24gKCkge1xuXHRGUkFNRVdPUksud2FybignY2FuY2VsQ2xvc2UoKSBzaG91bGQgYmUgZGVmaW5lZCBpZiBiZWZvcmVDbG9zZShjYikgb3IgYmVmb3JlUmVuZGVyKGNiKScgK1xuXHRcdFx0XHRcdFx0XHRcdCAnYXJlIGJlaW5nIHVzZWQhJyk7XG59O1xuIiwiLyoqXG4gKiBSdW4gSFRNTCB0ZW1wbGF0ZSB0aHJvdWdoIGVuZ2luZSBhbmQgYXBwZW5kIHJlc3VsdHMgdG8gb3V0bGV0LiBBbHNvIHJlcmVuZGVyIHJlZ2lvbnMuXG4gKiBJZiBhdEluZGV4IGlzIHNwZWNpZmllZCwgdGhlIGNvbXBvbmVudCBpcyByZW5kZXJlZCBhdCB0aGUgZ2l2ZW4gcG9zaXRpb24gd2l0aGluIGl0c1xuICogb3V0bGV0LiBPdGhlcndpc2UsIHRoZSBsYXN0IHBvc2l0aW9uIGlzIHVzZWQuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IGF0SW5kZXggW1RoZSBpbmRleCBpbiB3aGljaCB0byByZW5kZXIgdGhpcyBlbGVtZW50XVxuICovXG5cbnZhciBET00gPSByZXF1aXJlICgnLi4vdXRpbHMvRE9NJyksXG5cdFx0aGVscGVycyA9IHJlcXVpcmUoJy4vaGVscGVycycpLFxuXHRcdGJpbmRFdmVudHMgPSByZXF1aXJlICgnLi9iaW5kRXZlbnRzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcmVuZGVyKGF0SW5kZXgpIHtcblxuXHRGUkFNRVdPUksuZGVidWcodGhpcy5pZCArICcgOi0tLTogUmVuZGVyaW5nIGNvbXBvbmVudC4uLicpO1xuXG5cdHZhciBzZWxmID0gdGhpcztcblxuXHQvLyBDYW5jZWwgY3VycmVudCByZW5kZXIgYW5kIGNsb3NlIGpvYnMsIGlmIHRoZXkncmUgcnVubmluZ1xuXHRpZiAodGhpcy5fcmVuZGVyaW5nKSB7XG5cdFx0RlJBTUVXT1JLLmRlYnVnKHRoaXMuaWQgKyAnIDo6IHJlbmRlcigpIGNhbmNlbGVkLicpO1xuXHRcdHRoaXMuX3JlbmRlcmluZ0NhbmNlbGVkID0gdHJ1ZTtcblx0XHR0aGlzLmNhbmNlbFJlbmRlcigpO1xuXHRcdHRoaXMuX3JlbmRlcmluZyA9IGZhbHNlO1xuXHR9XG5cdGlmICh0aGlzLl9jbG9zaW5nKSB7XG5cdFx0RlJBTUVXT1JLLmRlYnVnKHRoaXMuaWQgKyAnIDo6IGNsb3NlKCkgY2FuY2VsZWQuJyk7XG5cdFx0dGhpcy5jYW5jZWxDbG9zZSgpO1xuXHRcdHRoaXMuX2Nsb3NpbmcgPSBmYWxzZTtcblx0fVxuXG5cdC8vIExvY2sgYWNjZXNzIHRvIHJlbmRlclxuXHR0aGlzLl9yZW5kZXJpbmcgPSB0cnVlO1xuXG5cdC8vIFRyaWdnZXIgYmVmb3JlUmVuZGVyIG1ldGhvZFxuXHR0aGlzLmJlZm9yZVJlbmRlcihmdW5jdGlvbiAoKSB7XG5cblx0XHQvLyBJZiByZW5kZXJpbmcgd2FzIGNhbmNlbGVkLCBicmVhayBvdXRcblx0XHQvLyBkbyBub3QgcmVuZGVyLCBhbmQgZG8gbm90IGNhbGwgYWZ0ZXJSZW5kZXIoKVxuXHRcdGlmICggc2VsZi5fcmVuZGVyaW5nQ2FuY2VsZWQgKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gLy8gQmluZCB0aGUgZXZlbnRzIG9uIG1vZGVsL2NvbGxlY3Rpb25zIGFuZCBnbG9iYWwgdHJpZ2dlcmVkIGV2ZW50cy5cblx0XHRiaW5kRXZlbnRzLmNvbGxlY3Rpb25FdmVudHMuY2FsbChzZWxmKTtcblx0XHRiaW5kRXZlbnRzLm1vZGVsRXZlbnRzLmNhbGwoc2VsZik7XG5cdFx0YmluZEV2ZW50cy5nbG9iYWxUcmlnZ2Vycy5jYWxsKHNlbGYpO1xuXG5cdFx0Ly8gVW5sb2NrIHJlbmRlcmluZyBtdXRleFxuXHRcdHNlbGYuX3JlbmRlcmluZyA9IGZhbHNlO1xuXG5cdFx0aWYgKCFzZWxmLiRvdXRsZXQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihzZWxmLmlkICsgJyA6OiBUcnlpbmcgdG8gcmVuZGVyKCksIGJ1dCBubyAkb3V0bGV0IHdhcyBkZWZpbmVkIScpO1xuXHRcdH1cblxuXHRcdC8vIFJlZnJlc2ggY29tcGlsZWQgdGVtcGxhdGVcblx0XHR2YXIgaHRtbCA9IGhlbHBlcnMuY29tcGlsZVRlbXBsYXRlLmNhbGwoc2VsZik7XG5cdFx0aWYgKCFodG1sKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IodGhpcy5pZCArICcgOjogVW5hYmxlIHRvIHJlbmRlciBjb21wb25lbnQgYmVjYXVzZSB0ZW1wbGF0ZSBjb21waWxhdGlvbiBkaWQgbm90IHJldHVybiBhbnkgSFRNTC4nKTtcblx0XHR9XG5cblx0XHQvLyBTdHJpcCB0cmFpbGluZyBhbmQgbGVhZGluZyB3aGl0ZXNwYWNlIHRvIGF2b2lkIGZhbHNlbHkgZGlhZ25vc2luZ1xuXHRcdC8vIG11bHRpcGxlIGVsZW1lbnRzLCB3aGVuIG9ubHkgb25lIGFjdHVhbGx5IGV4aXN0c1xuXHRcdC8vICh0aGlzIG1pc2RpYWdub3NpcyB3cmFwcyB0aGUgdGVtcGxhdGUgaW4gYW4gZXh0cmFuZW91cyA8ZGl2Pilcblx0XHRodG1sID0gaHRtbC5yZXBsYWNlKC9eXFxzKi8sICcnKTtcblx0XHRodG1sID0gaHRtbC5yZXBsYWNlKC9cXHMqJC8sICcnKTtcblx0XHRodG1sID0gaHRtbC5yZXBsYWNlKC8oXFxyfFxcbikqLywgJycpO1xuXG5cdFx0Ly8gU3RyaXAgSFRNTCBjb21tZW50cywgdGhlbiBzdHJpcCB3aGl0ZXNwYWNlIGFnYWluXG5cdFx0Ly8gKFRPRE86IG9wdGltaXplIHRoaXMpXG5cdFx0aHRtbCA9IGh0bWwucmVwbGFjZSgvKDwhLS0uKy0tPikqLywgJycpO1xuXHRcdGh0bWwgPSBodG1sLnJlcGxhY2UoL15cXHMqLywgJycpO1xuXHRcdGh0bWwgPSBodG1sLnJlcGxhY2UoL1xccyokLywgJycpO1xuXHRcdGh0bWwgPSBodG1sLnJlcGxhY2UoLyhcXHJ8XFxuKSovLCAnJyk7XG5cblx0XHQvLyBQYXJzZSBhIERPTSBub2RlIG9yIHNlcmllcyBvZiBET00gbm9kZXMgZnJvbSB0aGUgbmV3bHkgdGVtcGxhdGVkIEhUTUxcblx0XHR2YXIgcGFyc2VkTm9kZXMgPSAkLnBhcnNlSFRNTChodG1sKTtcblx0XHR2YXIgZWwgPSBwYXJzZWROb2Rlc1swXTtcblxuXHRcdC8vIElmIG5vIG5vZGVzIHdlcmUgcGFyc2VkLCB0aHJvdyBhbiBlcnJvclxuXHRcdGlmIChwYXJzZWROb2Rlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihzZWxmLmlkICsgJyA6OiByZW5kZXIoKSByYW4gaW50byBhIHByb2JsZW0gcmVuZGVyaW5nIHRoZSB0ZW1wbGF0ZSB3aXRoIEhUTUwgPT4gXFxuJytodG1sKTtcblx0XHR9XG5cblx0XHQvLyBJZiB0aGVyZSBpcyBub3Qgb25lIHNpbmdsZSB3cmFwcGVyIGVsZW1lbnQsXG5cdFx0Ly8gb3IgaWYgdGhlIHJlbmRlcmVkIHRlbXBsYXRlIGNvbnRhaW5zIG9ubHkgYSBzaW5nbGUgdGV4dCBub2RlLFxuXHRcdC8vIChvciBqdXN0IGEgbG9uZSByZWdpb24pXG5cdFx0ZWxzZSBpZiAocGFyc2VkTm9kZXMubGVuZ3RoID4gMSB8fCBwYXJzZWROb2Rlc1swXS5ub2RlVHlwZSA9PT0gMyB8fFxuXHRcdFx0XHRcdFx0ICQocGFyc2VkTm9kZXNbMF0pLmlzKCdyZWdpb24nKSkge1xuXG5cdFx0XHRGUkFNRVdPUksubG9nKHNlbGYuaWQgKyAnIDo6IFdyYXBwaW5nIHRlbXBsYXRlIGluIDxkaXYvPi4uLicsIHBhcnNlZE5vZGVzKTtcblxuXHRcdFx0Ly8gd3JhcCB0aGUgaHRtbCB1cCBpbiBhIGNvbnRhaW5lciA8ZGl2Lz5cblx0XHRcdGVsID0gJCgnPGRpdi8+JykuYXBwZW5kKGh0bWwpO1xuXHRcdFx0ZWwgPSBlbFswXTtcblx0XHR9XG5cblx0XHQvLyBTZXQgQmFja2JvbmUgZWxlbWVudCAoY2FjaGUgYW5kIHJlZGVsZWdhdGUgRE9NIGV2ZW50cylcblx0XHQvLyAoV2lsbCBhbHNvIHVwZGF0ZSBzZWxmLiRlbClcblx0XHRzZWxmLnNldEVsZW1lbnQoZWwpO1xuXHRcdC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG5cblx0XHQvLyBEZXRlY3QgYW5kIHJlbmRlciBhbGwgcmVnaW9ucyBhbmQgdGhlaXIgZGVzY2VuZGVudCBjb21wb25lbnRzIGFuZCByZWdpb25zXG5cdFx0aGVscGVycy5yZW5kZXJSZWdpb25zLmNhbGwoc2VsZik7XG5cblx0XHQvLyBJbnNlcnQgdGhlIGVsZW1lbnQgYXQgdGhlIHByb3BlciBwbGFjZSBhbW9uZ3N0IHRoZSBvdXRsZXQncyBjaGlsZHJlblxuXHRcdHZhciBuZWlnaGJvcnMgPSBzZWxmLiRvdXRsZXQuY2hpbGRyZW4oKTtcblx0XHRpZiAoXy5pc0Zpbml0ZShhdEluZGV4KSAmJiBuZWlnaGJvcnMubGVuZ3RoID4gMCAmJiBuZWlnaGJvcnMubGVuZ3RoID4gYXRJbmRleCkge1xuXHRcdFx0bmVpZ2hib3JzLmVxKGF0SW5kZXgpLmJlZm9yZShzZWxmLiRlbCk7XG5cdFx0fVxuXG5cdFx0Ly8gQnV0IGlmIHRoZSBvdXRsZXQgaXMgZW1wdHksIG9yIHRoZXJlJ3Mgbm8gYXRJbmRleCwganVzdCBzdGljayBpdCBvbiB0aGUgZW5kXG5cdFx0ZWxzZSBzZWxmLiRvdXRsZXQuYXBwZW5kKHNlbGYuJGVsKTtcblxuXHRcdC8vIEZpbmFsbHksIHRyaWdnZXIgYWZ0ZXJSZW5kZXIgbWV0aG9kXG5cdFx0c2VsZi5hZnRlclJlbmRlcigpO1xuXG5cdFx0Ly8gQWRkIGRhdGEgYXR0cmlidXRlcyB0byB0aGlzIGNvbXBvbmVudCdzICRlbCwgcHJvdmlkaW5nIGFjY2Vzc1xuXHRcdC8vIHRvIHdoZXRoZXIgdGhlIGVsZW1lbnQgaGFzIHZhcmlvdXMgRE9NIGJpbmRpbmdzIGZyb20gc3R5bGVzaGVldHMuXG5cdFx0Ly8gKGhhbmR5IGZvciBkaXNhYmxpbmcgdGV4dCBzZWxlY3Rpb24gYWNjb3JkaW5nbHksIGV0Yy4pXG5cdFx0Ly9cblx0XHQvLyAtPiBkaXNhYmxlIGZvciB0aGlzIGNvbXBvbmVudCB3aXRoIGB0aGlzLmF0dHJGbGFncyA9IGZhbHNlYFxuXHRcdC8vIC0+IG9yIGdsb2JhbGx5IHdpdGggYEZSQU1FV09SSy5hdHRyRmxhZ3MgPSBmYWxzZWBcblx0XHQvL1xuXHRcdC8vIFRPRE86IG1ha2UgaXQgd29yayB3aXRoIGRlbGVnYXRlZCBET00gZXZlbnQgYmluZGluZ3Ncblx0XHQvL1xuXHRcdGlmIChzZWxmLmF0dHJGbGFncyAhPT0gZmFsc2UgJiYgRlJBTUVXT1JLLmF0dHJGbGFncyAhPT0gZmFsc2UpIHtcblx0XHRcdERPTS5mbGFnQm91bmRFdmVudHMoc2VsZik7XG5cdFx0fVxuXHR9KTtcbn1cbiIsIi8qKlxuICogQ2hlY2sgdGhlIHNwZWNpZmllZCBkZWZpbml0aW9uIGZvciBvYnZpb3VzIG1pc3Rha2VzLCBlc3BlY2lhbGx5IGxpa2VseSBkZXByZWNhdGlvbnMgYW5kXG4gKiB2YWxpZGF0ZSB0aGF0IHRoZSBtb2RlbCBhbmQgY29sbGVjdGlvbnMgYXJlIGluc3RhbmNlcyBvZiBCYWNrYm9uZSdzIERhdGEgc3RydWN0dXJlcy5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gcHJvcGVydGllcyBbT2JqZWN0IGNvbnRhaW5pbmcgdGhlIHByb3BlcnRpZXMgb2YgdGhlIGNvbXBvbmVudF1cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHZhbGlkYXRlRGVmaW5pdGlvbihwcm9wZXJ0aWVzKSB7XG5cblx0aWYgKF8uaXNPYmplY3QocHJvcGVydGllcykpIHtcblxuXHRcdC8vIERldGVybWluZSBjb21wb25lbnQgaWRcblx0XHR2YXIgaWQgPSB0aGlzLmlkIHx8IHByb3BlcnRpZXMuaWQ7XG5cblx0XHRmdW5jdGlvbiBfdmFsaWRhdGVCYWNrYm9uZUluc3RhbmNlICh0eXBlKSB7XG5cdFx0XHR2YXIgVHlwZSA9IHR5cGVbMF0udG9VcHBlckNhc2UoKSArIHR5cGUuc2xpY2UoMSk7XG5cblx0XHRcdGlmICggIXByb3BlcnRpZXNbdHlwZV0gaW5zdGFuY2VvZiBCYWNrYm9uZVtUeXBlXSApIHtcblxuXHRcdFx0XHRGcmFtZXdvcmsuZXJyb3IoXG5cdFx0XHRcdFx0J0NvbXBvbmVudCAoJyArIGlkICsgJykgaGFzIGFuIGludmFsaWQgJyArIHR5cGUgKyAnLS0gXFxuJyArXG5cdFx0XHRcdFx0J0lmIGAnICsgdHlwZSArICdgIGlzIHNwZWNpZmllZCBmb3IgYSBjb21wb25lbnQsICcgK1xuXHRcdFx0XHRcdCdpdCBtdXN0IGJlIGFuICppbnN0YW5jZSogb2YgYSBCYWNrYm9uZS4nICsgVHlwZSArICcuXFxuJyk7XG5cblx0XHRcdFx0aWYgKHByb3BlcnRpZXNbdHlwZV0gaW5zdGFuY2VvZiBCYWNrYm9uZVtUeXBlXS5jb25zdHJ1Y3Rvcikge1xuXHRcdFx0XHRcdEZyYW1ld29yay5lcnJvcihcblx0XHRcdFx0XHRcdCdJdCBsb29rcyBsaWtlIGEgQmFja2JvbmUuJyArIFR5cGUgKyAnICpwcm90b3R5cGUqIHdhcyBzcGVjaWZpZWQgaW5zdGVhZCBvZiBhICcgK1xuXHRcdFx0XHRcdFx0J0JhY2tib25lLicgKyBUeXBlICsgJyAqaW5zdGFuY2UqLlxcbicgK1xuXHRcdFx0XHRcdFx0J1BsZWFzZSBgbmV3YCB1cCB0aGUgJyArIHR5cGUgKyAnIC1iZWZvcmUtICcgKyBGcmFtZXdvcmsuaWQgKyAnLnJhaXNlKCksJyArXG5cdFx0XHRcdFx0XHQnb3IgdXNlIGEgd3JhcHBlciBmdW5jdGlvbiB0byBhY2hpZXZlIHRoZSBzYW1lIGVmZmVjdCwgZS5nLjpcXG4nICtcblx0XHRcdFx0XHRcdCdgJyArIHR5cGUgKyAnOiBmdW5jdGlvbiAoKSB7XFxucmV0dXJuIG5ldyBTb21lJyArIFR5cGUgKyAnKCk7XFxufWAnXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdEZyYW1ld29yay53YXJuKCdJZ25vcmluZyBpbnZhbGlkICcgKyB0eXBlICsgJyA6OiAnICsgcHJvcGVydGllc1t0eXBlXSk7XG5cdFx0XHRcdGRlbGV0ZSBwcm9wZXJ0aWVzW3R5cGVdO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENoZWNrIHRoYXQgdGhpcy5jb2xsZWN0aW9uIGlzIGFjdHVhbGx5IGFuIGluc3RhbmNlIG9mIEJhY2tib25lLkNvbGxlY3Rpb25cblx0XHQvLyBhbmQgdGhhdCB0aGlzLm1vZGVsIGlzIGFjdHVhbGx5IGFuIGluc3RhbmNlIG9mIEJhY2tib25lLk1vZGVsXG5cdFx0X3ZhbGlkYXRlQmFja2JvbmVJbnN0YW5jZSgnbW9kZWwnKTtcblx0XHRfdmFsaWRhdGVCYWNrYm9uZUluc3RhbmNlKCdjb2xsZWN0aW9uJyk7XG5cblx0XHQvLyBDbG9uZSBwcm9wZXJ0aWVzIHRvIGF2b2lkIGluYWR2ZXJ0ZW50IG1vZGlmaWNhdGlvbnNcblx0XHRyZXR1cm4gXy5jbG9uZShwcm9wZXJ0aWVzKTtcblx0fVxuXG5cdGVsc2UgcmV0dXJuIHt9O1xuXG59XG4iLCIvKipcbiAqIFJ1biBkZWZpbml0aW9uIG1ldGhvZHMgdG8gZ2V0IGFjdHVhbCBjb21wb25lbnQgZGVmaW5pdGlvbnMuXG4gKiBUaGlzIGlzIGRlZmVycmVkIHRvIGF2b2lkIGhhdmluZyB0byB1c2UgQmFja2JvbmUncyBmdW5jdGlvbiAoKSB7fSBhcHByb2FjaCBmb3IgdGhpbmdzXG4gKiBsaWtlIGNvbGxlY3Rpb25zLlxuICovXG5cbi8qKlxuICogQnVpbGQgdXBzIGEgY29tcG9uZW50IGRlZmluaXRpb24gYnkgcnVubmluZyB0aGUgZGVmaW5pdGlvbi4gV2UgdGhlbiBsaW5rIHRoZVxuICogY29tcG9uZW50IGRlZmluaXRpb24gdG8gYW4gaWRlbnRpZmllciBpbiBgRlJBTUVXT1JLLmNvbXBvbmVudHNgLlxuICpcbiAqIEBwYXJhbSAge09iamVjdH0gY29tcG9uZW50IFtPYmplY3QgY29udGFpbmluZyB0aGUgZGVmaW5pdGlvbiBmdW5jdGlvbiBvZiB0aGUgY29tcG9uZW50XVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGJ1aWxkQ29tcG9uZW50RGVmaW5pdGlvbihjb21wb25lbnQpIHtcblx0dmFyIGNvbXBvbmVudERlZiA9IGNvbXBvbmVudC5kZWZpbml0aW9uKCk7XG5cblx0aWYgKGNvbXBvbmVudC5pZE92ZXJyaWRlKSB7XG5cdFx0aWYgKGNvbXBvbmVudERlZi5pZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGNvbXBvbmVudC5pZE92ZXJyaWRlICsgJzo6IENhbm5vdCBzcGVjaWZ5IGFuIGlkT3ZlcnJpZGUgaW4gLmRlZmluZSgpIGlmIGFuIGlkIHByb3BlcnR5ICgnK2NvbXBvbmVudERlZi5pZCsnKSBpcyBhbHJlYWR5IHNldCBpbiB5b3VyIGNvbXBvbmVudCBkZWZpbml0aW9uIVxcblVzYWdlOiAuZGVmaW5lKFtpZE92ZXJyaWRlXSwgZGVmaW5pdGlvbiknKTtcblx0XHR9XG5cdFx0Y29tcG9uZW50RGVmLmlkID0gY29tcG9uZW50LmlkT3ZlcnJpZGU7XG5cdH1cblx0aWYgKCFjb21wb25lbnREZWYuaWQpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCB1c2UgLmRlZmluZSgpIHdpdGhvdXQgZGVmaW5pbmcgYW4gaWQgcHJvcGVydHkgb3Igb3ZlcnJpZGUgaW4geW91ciBjb21wb25lbnQhXFxuVXNhZ2U6IC5kZWZpbmUoW2lkT3ZlcnJpZGVdLCBkZWZpbml0aW9uKScpO1xuXHR9XG5cdEZSQU1FV09SSy5jb21wb25lbnRzW2NvbXBvbmVudERlZi5pZF0gPSBjb21wb25lbnREZWY7XG59O1xuIiwiLyoqXG4gKiBPcHRpb25hbCBtZXRob2QgdG8gcmVxdWlyZSBhcHAgY29tcG9uZW50cy4gUmVxdWlyZS5qcyBjYW4gYmUgdXNlZCBpbnN0ZWFkXG4gKiBhcyBuZWVkZWQuXG4gKlxuICogQHBhcmFtICB7U3RyaW5nfSBcdFsob3B0aW9uYWwpIENvbXBvbmVudCBpZCBvdmVycmlkZV1cbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSBbRnVuY3Rpb24gRGVmaW5pdGlvbiBvZiBjb21wb25lbnRdXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZGVmaW5lKGlkLCBkZWZpbml0aW9uRm4pIHtcblx0Ly8gSWQgcGFyYW0gaXMgb3B0aW9uYWxcblx0aWYgKCFkZWZpbml0aW9uRm4pIHtcblx0XHRkZWZpbml0aW9uRm4gPSBpZDtcblx0XHRpZCA9IG51bGw7XG5cdH1cblxuXHRGUkFNRVdPUksuX2RlZmluZVF1ZXVlLnB1c2goe1xuXHRcdGRlZmluaXRpb246IGRlZmluaXRpb25Gbixcblx0XHRpZE92ZXJyaWRlOiBpZFxuXHR9KTtcbn07XG4iLCIvKipcbiAqXHRMb2dnZXQgY29uc3RydWN0b3IgbWV0aG9kIHRoYXQgd2lsbCBzZXR1cCBGUkFNRVdPUksgdG8gbG9nIG1lc3NhZ2VzLlxuICovXG5cbnZhciBzZXR1cExvZ2dlciA9IHJlcXVpcmUoJy4vc2V0dXAnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBMb2dnZXIoKSB7XG5cblx0dmFyIEZSQU1FV09SSyA9IHRoaXM7XG5cblxuXHQvLyBVcG9uIGluaXRpYWxpemF0aW9uLCBzZXR1cCBsb2dnZXJcblx0c2V0dXBMb2dnZXIoRlJBTUVXT1JLLmxvZ0xldmVsKTtcblxuXHQvLyBJbiBzdXBwb3J0ZWQgYnJvd3NlcnMsIGFsc28gcnVuIHNldHVwTG9nZ2VyIGFnYWluXG5cdC8vIHdoZW4gRlJBTUVXT1JLLmxvZ0xldmVsIGlzIHNldCBieSB0aGUgdXNlclxuXHRpZiAoXy5pc0Z1bmN0aW9uKEZSQU1FV09SSy5fX2RlZmluZVNldHRlcl9fKSkge1xuXHRcdEZSQU1FV09SSy5fX2RlZmluZVNldHRlcl9fKCdsb2dMZXZlbCcsIGZ1bmN0aW9uIG9uQ2hhbmdlIChuZXdMb2dMZXZlbCkge1xuXHRcdFx0c2V0dXBMb2dnZXIobmV3TG9nTGV2ZWwpO1xuXHRcdH0pO1xuXHR9XG59O1xuIiwiLyoqXG4gKiBTZXQgdXAgdGhlIGxvZyBmdW5jdGlvbnM6XG4gKlxuICogRlJBTUVXT1JLLmVycm9yXG4gKiBGUkFNRVdPUksud2FyblxuICogRlJBTUVXT1JLLmxvZ1xuICogRlJBTUVXT1JLLmRlYnVnICgqbGVnYWN5KVxuICogRlJBTUVXT1JLLnZlcmJvc2VcbiAqXG4gKiBAcGFyYW0gIHtTdHJpbmd9IGxvZ0xldmVsIFtUaGUgZGVzaXJlZCBsb2cgbGV2ZWwgb2YgdGhlIExvZ2dlcl1cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBzZXR1cExvZ2dlciAobG9nTGV2ZWwpIHtcblxuXHR2YXIgbm9vcCA9IGZ1bmN0aW9uICgpIHt9O1xuXG5cdC8vIElmIGxvZyBpcyBzcGVjaWZpZWQsIHVzZSBpdCwgb3RoZXJ3aXNlIHVzZSB0aGUgY29uc29sZVxuXHRpZiAoRlJBTUVXT1JLLmxvZ2dlcikge1xuXHRcdEZSQU1FV09SSy5lcnJvciAgICAgPSBGUkFNRVdPUksubG9nZ2VyLmVycm9yO1xuXHRcdEZSQU1FV09SSy53YXJuICAgICAgPSBGUkFNRVdPUksubG9nZ2VyLndhcm47XG5cdFx0RlJBTUVXT1JLLmxvZyAgICAgICA9IEZSQU1FV09SSy5sb2dnZXIuZGVidWcgfHwgRlJBTUVXT1JLLmxvZ2dlcjtcblx0XHRGUkFNRVdPUksudmVyYm9zZSAgID0gRlJBTUVXT1JLLmxvZ2dlci52ZXJib3NlO1xuXHR9XG5cblx0Ly8gSW4gSUUsIHdlIGNhbid0IGRlZmF1bHQgdG8gdGhlIGJyb3dzZXIgY29uc29sZSBiZWNhdXNlIHRoZXJlIElTIE5PIEJST1dTRVIgQ09OU09MRVxuXHRlbHNlIGlmICh0eXBlb2YgY29uc29sZSAhPT0gJ3VuZGVmaW5lZCcpIHtcblxuXHRcdC8vIFdlIGNhbm5vdCBjYWxsZWQgdGhlIC5iaW5kIG1ldGhvZCBvbiB0aGUgY29uc29sZSBtZXRob2RzLiBXZSBhcmUgaW4gaWUgOSBvciA4LCBqdXN0IG1ha2Vcblx0XHQvLyBldmVyeWh0aW5nIGEgbm9vcC5cblx0XHRpZiAoXy5pc1VuZGVmaW5lZChjb25zb2xlLmxvZy5iaW5kKSkgIHtcblx0XHRcdEZSQU1FV09SSy5lcnJvciAgICAgPSBub29wO1xuXHRcdFx0RlJBTUVXT1JLLndhcm4gICAgICA9IG5vb3A7XG5cdFx0XHRGUkFNRVdPUksubG9nICAgICAgID0gbm9vcDtcblx0XHRcdEZSQU1FV09SSy5kZWJ1ZyAgICAgPSBub29wO1xuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UgICA9IG5vb3A7XG5cdFx0fVxuXG5cdFx0Ly8gV2UgYXJlIGluIGEgZnJpZW5kbHkgYnJvd3NlciBsaWtlIENocm9tZSwgRmlyZWZveCwgb3IgSUUxMFxuXHRcdGVsc2Uge1xuXHRcdFx0RlJBTUVXT1JLLmVycm9yXHRcdD0gY29uc29sZS5lcnJvciAmJiBjb25zb2xlLmVycm9yLmJpbmQoY29uc29sZSk7XG5cdFx0XHRGUkFNRVdPUksud2Fyblx0XHQ9IGNvbnNvbGUud2FybiAmJiBjb25zb2xlLndhcm4uYmluZChjb25zb2xlKTtcblx0XHRcdEZSQU1FV09SSy5sb2dcdFx0XHQ9IGNvbnNvbGUuZGVidWcgJiYgY29uc29sZS5kZWJ1Zy5iaW5kKGNvbnNvbGUpO1xuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2VcdD0gY29uc29sZS5sb2cgJiYgY29uc29sZS5sb2cuYmluZChjb25zb2xlKTtcblxuXHRcdFx0Ly8gVXNlIGxvZyBsZXZlbCBjb25maWcgaWYgcHJvdmlkZWRcblx0XHRcdHN3aXRjaCAobG9nTGV2ZWwpIHtcblx0XHRcdFx0Y2FzZSAndmVyYm9zZSc6IGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgJ2RlYnVnJzpcblx0XHRcdFx0XHRGUkFNRVdPUksudmVyYm9zZSA9IG5vb3A7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSAnd2Fybic6XG5cdFx0XHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UgPSBGUkFNRVdPUksubG9nID0gbm9vcDtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlICdlcnJvcic6XG5cdFx0XHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UgPSBGUkFNRVdPUksubG9nID0gRlJBTUVXT1JLLndhcm4gPSBub29wO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgJ3NpbGVudCc6XG5cdFx0XHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UgPSBGUkFNRVdPUksubG9nID0gRlJBTUVXT1JLLndhcm4gPSBGUkFNRVdPUksuZXJyb3IgPSBub29wO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yICgnVW5yZWNvZ25pemVkIGxvZ2dpbmcgbGV2ZWwgY29uZmlnICcgK1xuXHRcdFx0XHRcdCcoJyArIEZSQU1FV09SSy5pZCArICcubG9nTGV2ZWwgPSBcIicgKyBsb2dMZXZlbCArICdcIiknKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU3VwcG9ydCBmb3IgYGRlYnVnYCBmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHlcblx0XHRcdEZSQU1FV09SSy5kZWJ1ZyA9IEZSQU1FV09SSy5sb2c7XG5cblx0XHRcdC8vIFZlcmJvc2Ugc3BpdHMgb3V0IGxvZyBsZXZlbFxuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UoJ0xvZyBsZXZlbCBzZXQgdG8gOjogJywgbG9nTGV2ZWwpO1xuXHRcdH1cblx0fVxufVxuIiwiLyoqXG4gKiBHaXZlbiBhIGNvbXBvbmVudCBkZWZpbml0aW9uIGFuZCBpdHMga2V5LCB3ZSB3aWxsIGJ1aWxkIHVwIHRoZSBjb21wb25lbnQgcHJvdG90eXBlIGFuZCBtZXJnZVxuICogdGhpcyBjb21wb25lbnQgd2l0aCBpdHMgbWF0Y2hpbmcgdGVtcGxhdGUuXG4gKlxuICogQHBhcmFtICB7T2JqZWN0fSBjb21wb25lbnREZWYgW09iamVjdCBjb250YWluaW5nIHRoZSBjb21wb25lbnQgZGVmaW5pdGlvbl1cbiAqIEBwYXJhbSAge1N0cmluZ30gY29tcG9uZW50S2V5IFtUaGUgY29tcG9uZW50IGlkZW50aWZpZXJdXG4gKi9cblxudmFyIHRyYW5zbGF0ZVNob3J0aGFuZCA9IHJlcXVpcmUoJy4uL3V0aWxzL3Nob3J0aGFuZCcpO1xudmFyIFV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMvdXRpbHMnKTtcbnZhciBFdmVudHMgPSByZXF1aXJlKCcuLi91dGlscy9ldmVudHMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBidWlsZENvbXBvbmVudFByb3RvdHlwZShjb21wb25lbnREZWYsIGNvbXBvbmVudEtleSkge1xuXG5cdGNvbnNvbGUubG9nKHRoaXMpO1xuXG5cdC8vIElmIGNvbXBvbmVudCBpZCBpcyBub3QgZXhwbGljaXRseSBzZXQsIHVzZSB0aGUgY29tcG9uZW50S2V5XG5cdGlmICghY29tcG9uZW50RGVmLmlkKSB7XG5cdFx0Y29tcG9uZW50RGVmLmlkID0gY29tcG9uZW50S2V5O1xuXHR9XG5cblx0Ly8gU2VhcmNoIHRlbXBsYXRlc1xuXHR2YXIgdGVtcGxhdGUgPSBGUkFNRVdPUksudGVtcGxhdGVzW2NvbXBvbmVudERlZi5pZF07XG5cblx0Ly8gSWYgbm8gbWF0Y2ggZm9yIGNvbXBvbmVudCB3YXMgZm91bmTCoGluIHRlbXBsYXRlcywgaXNzdWUgYSB3YXJuaW5nXG5cdGlmICghdGVtcGxhdGUpIHtcblx0XHRyZXR1cm4gRlJBTUVXT1JLLndhcm4oXG5cdFx0XHRjb21wb25lbnREZWYuaWQgKyAnIDo6IE5vIHRlbXBsYXRlIGZvdW5kIGZvciBjb21wb25lbnQhJyArXG5cdFx0XHQnXFxuVGVtcGxhdGVzIGRvblxcJ3QgbmVlZCBhIGNvbXBvbmVudCB1bmxlc3MgeW91IHdhbnQgaW50ZXJhY3Rpdml0eSwgJyArXG5cdFx0XHQnZXZlcnkgY29tcG9uZW50ICpzaG91bGQqIGhhdmUgYSBtYXRjaGluZyB0ZW1wbGF0ZSEhJyArXG5cdFx0XHQnXFxuVXNpbmcgY29tcG9uZW50cyB3aXRob3V0IHRlbXBsYXRlcyBtYXkgc2VlbSBuZWNlc3NhcnksICcgK1xuXHRcdFx0J2J1dCBpdFxcJ3Mgbm90LiAgSXQgbWFrZXMgeW91ciB2aWV3IGxvZ2ljIGluY29ycG9yZWFsLCBhbmQgbWFrZXMgeW91ciBjb2xsZWFndWVzICcgK1xuXHRcdFx0J3VuY29tZm9ydGFibGUuJyk7XG5cdH1cblxuXHQvLyBTYXZlIHJlZmVyZW5jZSB0byB0ZW1wbGF0ZSBpbiBjb21wb25lbnQgcHJvdG90eXBlXG5cdEZSQU1FV09SSy52ZXJib3NlKGNvbXBvbmVudERlZi5pZCArICcgOjogUGFpcmluZyBjb21wb25lbnQgd2l0aCB0ZW1wbGF0ZS4uLicpO1xuXHRjb21wb25lbnREZWYudGVtcGxhdGUgPSB0ZW1wbGF0ZTtcblxuXHQvLyBUcmFuc2xhdGUgcmlnaHQtaGFuZCBzaG9ydGhhbmQgZm9yIHRvcC1sZXZlbCBrZXlzXG5cdGNvbXBvbmVudERlZiA9IFV0aWxzLm9iak1hcChjb21wb25lbnREZWYsIHRyYW5zbGF0ZVNob3J0aGFuZCk7XG5cblxuXHQvLyBhbmQgZXZlbnRzIG9iamVjdFxuXHRpZiAoY29tcG9uZW50RGVmLmV2ZW50cykge1xuXHRcdGNvbXBvbmVudERlZi5ldmVudHMgPSBVdGlscy5vYmpNYXAoXG5cdFx0XHRjb21wb25lbnREZWYuZXZlbnRzLFxuXHRcdFx0dHJhbnNsYXRlU2hvcnRoYW5kXG5cdFx0KTtcblx0fVxuXG5cdC8vIGFuZCBhZnRlckNoYW5nZSBiaW5kaW5nc1xuXHRpZiAoXy5pc09iamVjdChjb21wb25lbnREZWYuYWZ0ZXJDaGFuZ2UpICYmICFfLmlzRnVuY3Rpb24oY29tcG9uZW50RGVmLmFmdGVyQ2hhbmdlKSkge1xuXHRcdGNvbXBvbmVudERlZi5hZnRlckNoYW5nZSA9IFV0aWxzLm9iak1hcChcblx0XHRcdGNvbXBvbmVudERlZi5hZnRlckNoYW5nZSxcblx0XHRcdHRyYW5zbGF0ZVNob3J0aGFuZFxuXHRcdCk7XG5cdH1cblxuXHQvLyBHbyBhaGVhZCBhbmQgdHVybiB0aGUgZGVmaW5pdGlvbiBpbnRvIGEgcmVhbCBjb21wb25lbnQgcHJvdG90eXBlXG5cdEZSQU1FV09SSy52ZXJib3NlKGNvbXBvbmVudERlZi5pZCArICcgOjogQnVpbGRpbmcgY29tcG9uZW50IHByb3RvdHlwZS4uLicpO1xuXHR2YXIgY29tcG9uZW50UHJvdG90eXBlID0gRlJBTUVXT1JLLkNvbXBvbmVudC5leHRlbmQoY29tcG9uZW50RGVmKTtcblxuXHQvLyBEaXNjb3ZlciBzdWJzY3JpcHRpb25zXG5cdGNvbXBvbmVudFByb3RvdHlwZS5wcm90b3R5cGUuc3Vic2NyaXB0aW9ucyA9IHt9O1xuXG5cdC8vIEl0ZXJhdGUgdGhyb3VnaCBlYWNoIHByb3BlcnR5IG9uIHRoaXMgY29tcG9uZW50IHByb3RvdHlwZVxuXHRfLmVhY2goY29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZSwgZnVuY3Rpb24gKGhhbmRsZXIsIGtleSkge1xuXG5cdFx0Ly8gRGV0ZWN0IERPTSBldmVudHMgYW5kIHNtYXNoIHRoZW0gaW50byB0aGUgZXZlbnRzIGhhc2hcblx0XHR2YXIgbWF0Y2hlZERPTUV2ZW50cyA9IGtleS5tYXRjaChFdmVudHNbJy9ET01FdmVudC8nXSk7XG5cdFx0aWYgKG1hdGNoZWRET01FdmVudHMpIHtcblx0XHRcdHZhciBldmVudE5hbWUgPSBtYXRjaGVkRE9NRXZlbnRzWzFdO1xuXHRcdFx0dmFyIGRlbGVnYXRlU2VsZWN0b3IgPSBtYXRjaGVkRE9NRXZlbnRzWzNdO1xuXG5cdFx0XHQvLyBTdG93IHRoZW0gaW4gZXZlbnRzIGhhc2hcblx0XHRcdGNvbXBvbmVudFByb3RvdHlwZS5wcm90b3R5cGUuZXZlbnRzID0gY29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZS5ldmVudHMgfHwge307XG5cdFx0XHRjb21wb25lbnRQcm90b3R5cGUucHJvdG90eXBlLmV2ZW50c1trZXldID0gaGFuZGxlcjtcblx0XHR9XG5cblx0XHQvLyBBZGQgYXBwIGV2ZW50cyAoJSksIHJvdXRlcyAoIyksIGFuZCBkYXRhIGxpc3RlbmVycyAofikgdG8gc3Vic2NyaXB0aW9ucyBoYXNoXG5cdFx0aWYgKGtleS5tYXRjaCgvXiglfCN8fikvKSkge1xuXHRcdFx0aWYgKF8uaXNTdHJpbmcoaGFuZGxlcikpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGNvbXBvbmVudERlZi5pZCArICc6OiBJbnZhbGlkIGxpc3RlbmVyIGZvciBzdWJzY3JpcHRpb246ICcgKyBrZXkgKyAnLlxcbicgK1xuXHRcdFx0XHRcdCdEZWZpbmUgeW91ciBjYWxsYmFjayB3aXRoIGFuIGFub255bW91cyBmdW5jdGlvbiBpbnN0ZWFkIG9mIGEgc3RyaW5nLidcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHRcdGlmICghXy5pc0Z1bmN0aW9uKGhhbmRsZXIpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihjb21wb25lbnREZWYuaWQgKyc6OiBJbnZhbGlkIGxpc3RlbmVyIGZvciBzdWJzY3JpcHRpb246ICcgKyBrZXkpO1xuXHRcdFx0fVxuXHRcdFx0Y29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZS5zdWJzY3JpcHRpb25zW2tleV0gPSBoYW5kbGVyO1xuXHRcdH1cblxuXHRcdC8vIEV4dGVuZCBvbmUgb3IgbW9yZSBvdGhlciBjb21wb25lbnRzXG5cdFx0ZWxzZSBpZiAoa2V5ID09PSAnZXh0ZW5kQ29tcG9uZW50cycpIHtcblx0XHRcdHZhciBvYmpUb01lcmdlID0ge307XG5cdFx0XHRfLmVhY2goaGFuZGxlciwgZnVuY3Rpb24oY2hpbGRJZCl7XG5cblx0XHRcdFx0aWYgKCFGUkFNRVdPUksuY29tcG9uZW50c1tjaGlsZElkXSl7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKFxuXHRcdFx0XHRcdGNvbXBvbmVudERlZi5pZCArICcgOjogJyArXG5cdFx0XHRcdFx0J1RyeWluZyB0byBkZWZpbmUvZXh0ZW5kIHRoaXMgY29tcG9uZW50IGZyb20gYCcgKyBjaGlsZElkICsgJ2AsICcgK1xuXHRcdFx0XHRcdCdidXQgbm8gY29tcG9uZW50IHdpdGggdGhhdCBpZCBjYW4gYmUgZm91bmQuJ1xuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRfLmV4dGVuZChvYmpUb01lcmdlLCBGUkFNRVdPUksuY29tcG9uZW50c1tjaGlsZElkXSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Xy5kZWZhdWx0cyhjb21wb25lbnRQcm90b3R5cGUucHJvdG90eXBlLCBvYmpUb01lcmdlKTtcblx0XHR9XG5cdH0pO1xuXG5cdC8vIFNhdmUgcHJvdG90eXBlIGluIGdsb2JhbCBzZXQgZm9yIHRyYWNraW5nXG5cdEZSQU1FV09SSy5jb21wb25lbnRzW2NvbXBvbmVudERlZi5pZF0gPSBjb21wb25lbnRQcm90b3R5cGU7XG59O1xuIiwiLyoqXG4gKiBDb2xsZWN0IGFueSByZWdpb25zIHdpdGggdGhlIGRlZmF1bHQgY29tcG9uZW50IHNldCBmcm9tIHRoZSBET00uXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjb2xsZWN0UmVnaW9ucyAoKSB7XG5cblx0Ly8gUHJvdmlkZSBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eSBmb3IgbGVnYWN5IG5vdGF0aW9uXG5cdCQoJ3JlZ2lvbltkZWZhdWx0XSxyZWdpb25bdGVtcGxhdGVdLFtkYXRhLXJlZ2lvbl1bZGVmYXVsdF0sW2RhdGEtcmVnaW9uXVt0ZW1wbGF0ZV0nKS5lYWNoKGZ1bmN0aW9uKCkge1xuXHRcdCRlID0gJCh0aGlzKTtcblx0XHR2YXIgY29tcG9uZW50SWQgPSAkZS5hdHRyKCdkZWZhdWx0JykgfHwgJGUuYXR0cigndGVtcGxhdGUnKTtcblx0XHQkZS5hdHRyKCdjb250ZW50cycsIGNvbXBvbmVudElkKTtcblx0fSk7XG5cblx0Ly8gTm93IGluc3RhbnRpYXRlIHRoZSBhcHByb3ByaWF0ZSBkZWZhdWx0IGNvbXBvbmVudCBpbiBlYWNoXG5cdC8vIHJlZ2lvbiB3aXRoIGEgc3BlY2lmaWVkIHRlbXBsYXRlL2NvbXBvbmVudFxuXHQkKCdyZWdpb25bY29udGVudHNdLFtkYXRhLXJlZ2lvbl1bY29udGVudHNdJykuZWFjaChmdW5jdGlvbigpIHtcblx0XHRGUkFNRVdPUksuUmVnaW9uLmZyb21FbGVtZW50KHRoaXMpO1xuXHR9KTtcbn1cbiIsIi8qKlxuICogTG9hZCBhbnkgc2NyaXB0IHRhZ3Mgb24gdGhlIHBhZ2Ugd2l0aCB0eXBlPVwidGV4dC90ZW1wbGF0ZVwiLlxuICpcbiAqIEByZXR1cm4ge09iamVjdH0gW09iamVjdCBjb25zaXN0aW5nIG9mIGEgdGVtcGxhdGUgaWRlbnRpZmllciBhbmQgaXRzIEhUTUwuXVxuICovXG5cbnZhciBVdGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzL3V0aWxzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY29sbGVjdFRlbXBsYXRlcygpIHtcblx0dmFyIHRlbXBsYXRlcyA9IHt9O1xuXG5cdCQoJ3NjcmlwdFt0eXBlPVwidGV4dC90ZW1wbGF0ZVwiXScpLmVhY2goZnVuY3Rpb24gKGksIGVsKSB7XG5cdFx0dmFyIGlkID0gVXRpbHMuZWwyaWQoZWwsIHRydWUpO1xuXHRcdHRlbXBsYXRlc1tpZF0gPSAkKGVsKS5odG1sKCk7XG5cblx0XHQvLyBTdHJpcCB3aGl0ZXNwYWNlIGxlZnRvdmVyIGZyb20gc2NyaXB0IHRhZ3Ncblx0XHR0ZW1wbGF0ZXNbaWRdID0gdGVtcGxhdGVzW2lkXS5yZXBsYWNlKC9eXFxzKy8sJycpO1xuXHRcdHRlbXBsYXRlc1tpZF0gPSB0ZW1wbGF0ZXNbaWRdLnJlcGxhY2UoL1xccyskLywnJyk7XG5cblx0XHQvLyBSZW1vdmUgZnJvbSBET01cblx0XHQkKGVsKS5yZW1vdmUoKTtcblx0fSk7XG5cblx0cmV0dXJuIHRlbXBsYXRlcztcbn07XG4iLCIvKipcbiAqIFRoaXMgaXMgdGhlIHN0YXJ0aW5nIHBvaW50IHRvIHlvdXIgYXBwbGljYXRpb24uICBZb3Ugc2hvdWxkIGdyYWIgdGVtcGxhdGVzIGFuZCBjb21wb25lbnRzXG4gKiBiZWZvcmUgY2FsbGluZyBGUkFNRVdPUksucmFpc2UoKSB1c2luZyBzb21ldGhpbmcgbGlrZSBSZXF1aXJlLmpzLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG5cdFx0ZGF0YTogeyBhdXRoZW50aWNhdGVkOiBmYWxzZSB9LFxuXHRcdHRlbXBsYXRlczogeyBjb21wb25lbnROYW1lOiBIVE1MT3JQcmVjb21waWxlZEZuIH0sXG5cdFx0Y29tcG9uZW50czogeyBjb21wb25lbnROYW1lOiBDb21wb25lbnREZWZpbml0aW9uIH1cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNiXG4gKi9cblxudmFyIExvZ2dlciA9IHJlcXVpcmUoJy4uL2xvZ2dlci9pbmRleCcpO1xudmFyIGJ1aWxkQ29tcG9uZW50RGVmaW5pdGlvbiA9IHJlcXVpcmUoJy4uL2RlZmluZS9idWlsZERlZmluaXRpb24nKTtcbnZhciBidWlsZENvbXBvbmVudFByb3RvdHlwZSA9IHJlcXVpcmUoJy4vYnVpbGRQcm90b3R5cGUnKTtcbnZhciBjb2xsZWN0VGVtcGxhdGVzID0gcmVxdWlyZSgnLi9jb2xsZWN0VGVtcGxhdGVzJyk7XG52YXIgY29sbGVjdFJlZ2lvbnMgPSByZXF1aXJlKCcuL2NvbGxlY3RSZWdpb25zJyk7XG52YXIgc2V0dXBSb3V0ZXIgPSByZXF1aXJlKCcuLi9yb3V0ZXIvaW5kZXgnKTtcblxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHJhaXNlKG9wdGlvbnMsIGNiKSB7XG5cblx0dmFyIEZSQU1FV09SSyA9IHRoaXM7XG5cblx0Ly8gSWYgb25seSBvbmUgYXJnIGlzIHByZXNlbnQsIHVzZSBvcHRpb25zIGFzIGNhbGxiYWNrIGlmIHBvc3NpYmxlLlxuXHQvLyBJZiBvcHRpb25zIGFyZSBub3QgZGVmaW5lZCwgdXNlIGFuIGVtcHR5IG9iamVjdC5cblx0aWYgKCFjYiAmJiBfLmlzRnVuY3Rpb24ob3B0aW9ucykpIHtcblx0XHRjYiA9IG9wdGlvbnM7XG5cdH1cblx0aWYgKCFfLmlzUGxhaW5PYmplY3Qob3B0aW9ucykpIHtcblx0XHRvcHRpb25zID0ge307XG5cdH1cblxuXHQvLyBBcHBseSBkZWZhdWx0c1xuXHRfLmRlZmF1bHRzKEZSQU1FV09SSywge1xuXHRcdHRocm90dGxlV2luZG93UmVzaXplOiAyMDAsXG5cdFx0bG9nTGV2ZWw6ICd3YXJuJyxcblx0XHRsb2dnZXI6IHVuZGVmaW5lZCxcblx0XHRwcm9kdWN0aW9uOiBmYWxzZVxuXHR9KTtcblxuXHQvLyBBcHBseSBvdmVycmlkZXMgZnJvbSBvcHRpb25zXG5cdF8uZXh0ZW5kKEZSQU1FV09SSywgb3B0aW9ucyk7XG5cblx0Ly8gSW50ZXJwcmV0IGBwcm9kdWN0aW9uYCBhcyBgbG9nTGV2ZWwgPT09ICdzaWxlbnQnYFxuXHRpZiAoRlJBTUVXT1JLLnByb2R1Y3Rpb24pIHtcblx0XHRGUkFNRVdPUksubG9nTGV2ZWwgPSAnc2lsZW50Jztcblx0fVxuXG5cdC8vIEluaXRpYWxpemUgbG9nZ2VyXG5cdG5ldyBMb2dnZXIoRlJBTUVXT1JLKTtcblxuXHQvLyBNZXJnZSBkYXRhIGludG8gRlJBTUVXT1JLLmRhdGFcblx0Xy5leHRlbmQoRlJBTUVXT1JLLmRhdGEsIG9wdGlvbnMuZGF0YSB8fCB7fSk7XG5cblx0Ly8gTWVyZ2Ugc3BlY2lmaWVkIHRlbXBsYXRlcyB3aXRoIEZSQU1FV09SSy50ZW1wbGF0ZXNcblx0Xy5leHRlbmQoRlJBTUVXT1JLLnRlbXBsYXRlcywgb3B0aW9ucy50ZW1wbGF0ZXMgfHwge30pO1xuXG5cdC8vIElmIEZSQU1FV09SSy5kZWZpbmUoKSB3YXMgdXNlZCwgYnVpbGQgdGhlIGxpc3Qgb2YgY29tcG9uZW50c1xuXHQvLyBJdGVyYXRlIHRocm91Z2ggdGhlIGRlZmluZSBxdWV1ZSBhbmQgY3JlYXRlIGVhY2ggZGVmaW5pdGlvblxuXHRfLmVhY2goRlJBTUVXT1JLLl9kZWZpbmVRdWV1ZSwgYnVpbGRDb21wb25lbnREZWZpbml0aW9uKTtcblxuXHQvLyBNZXJnZSBzcGVjaWZpZWQgY29tcG9uZW50cyB3LyBGUkFNRVdPUksuY29tcG9uZW50c1xuXHRfLmV4dGVuZChGUkFNRVdPUksuY29tcG9uZW50cywgb3B0aW9ucy5jb21wb25lbnRzIHx8IHt9KTtcblxuXHQvLyBCYWNrIHVwIGVhY2ggY29tcG9uZW50IGRlZmluaXRpb24gYmVmb3JlIHRyYW5zZm9ybWluZyBpdCBpbnRvIGEgbGl2ZSBwcm90b3R5cGVcblx0RlJBTUVXT1JLLmNvbXBvbmVudERlZnMgPSBfLmNsb25lKEZSQU1FV09SSy5jb21wb25lbnRzKTtcblxuXHQvLyBSdW4gdGhpcyBjYWxsIGJhY2sgd2hlbiB0aGUgRE9NIGlzIHJlYWR5XG5cdCQoZnVuY3Rpb24gKCkge1xuXG5cdFx0Ly8gQ29sbGVjdCBhbnkgPHNjcmlwdD4gdGFnIHRlbXBsYXRlcyBvbiB0aGUgcGFnZVxuXHRcdC8vIGFuZCBhYnNvcmIgdGhlbSBpbnRvIEZSQU1FV09SSy50ZW1wbGF0ZXNcblx0XHRfLmV4dGVuZChGUkFNRVdPUksudGVtcGxhdGVzLCBjb2xsZWN0VGVtcGxhdGVzKCkpO1xuXG5cdFx0Ly8gQnVpbGQgYWN0dWFsIHByb3RvdHlwZXMgZm9yIHRoZSBjb21wb25lbnRzXG5cdFx0Ly8gKG5lZWQgdGhlIHRlbXBsYXRlcyBhdCB0aGlzIHBvaW50IHRvIG1ha2UgdGhpcyB3b3JrKVxuXG5cdFx0Xy5lYWNoKEZSQU1FV09SSy5jb21wb25lbnRzLCBidWlsZENvbXBvbmVudFByb3RvdHlwZSk7XG5cblx0XHQvLyBHcmFiIGluaXRpYWwgcmVnaW9ucyBmcm9tIERPTVxuXHRcdGNvbGxlY3RSZWdpb25zKCk7XG5cblx0XHQvLyBCaW5kIGdsb2JhbCBET00gZXZlbnRzIGFzIEZSQU1FV09SSyBldmVudHNcblx0XHQvLyAoZS5nLiAld2luZG93OnJlc2l6ZSlcblx0XHR2YXIgdHJpZ2dlclJlc2l6ZUV2ZW50ID0gXy5kZWJvdW5jZShmdW5jdGlvbiAoKSB7XG5cdFx0XHRGUkFNRVdPUksudHJpZ2dlcignJXdpbmRvdzpyZXNpemUnKTtcblx0XHR9LCBvcHRpb25zLnRocm90dGxlV2luZG93UmVzaXplIHx8IDApO1xuXHRcdCQod2luZG93KS5yZXNpemUodHJpZ2dlclJlc2l6ZUV2ZW50KTtcblx0XHQvLyBUT0RPOiBhZGQgbW9yZSBldmVudHMgYW5kIGV4dHJhcG9sYXRlIHRoaXMgbG9naWMgdG8gYSBzZXBhcmF0ZSBtb2R1bGVcblxuXHRcdC8vIERvIHRoZSBpbml0aWFsIHJvdXRpbmcgc2VxdWVuY2Vcblx0XHQvLyBMb29rIGF0IHRoZSAjZnJhZ21lbnQgdXJsIGFuZCBmaXJlIHRoZSBnbG9iYWwgcm91dGUgZXZlbnRcblx0XHRzZXR1cFJvdXRlcigpO1xuXHRcdEZSQU1FV09SSy5oaXN0b3J5LnN0YXJ0KF8uZGVmYXVsdHMoe1xuXHRcdFx0cHVzaFN0YXRlOiB1bmRlZmluZWQsXG5cdFx0XHRoYXNoQ2hhbmdlOiB1bmRlZmluZWQsXG5cdFx0XHRyb290OiB1bmRlZmluZWRcblx0XHR9LCBvcHRpb25zKSk7XG5cblx0XHRpZiAoY2IpIGNiKCk7XG5cdH0pO1xufTtcbiIsIi8qKlxuICogcmVnaW9uLmFwcGVuZCggY29tcG9uZW50SWQsIFtwcm9wZXJ0aWVzXSApXG4gKlxuICogQ2FsbHMgaW5zZXJ0KCkgYXQgbGFzdCBwb3NpdGlvblxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGFwcGVuZChjb21wb25lbnRJZCwgcHJvcGVydGllcykge1xuXHQvLyBJbnNlcnQgYXQgbGFzdCBwb3NpdGlvblxuXHRyZXR1cm4gdGhpcy5pbnNlcnQodGhpcy5fY2hpbGRyZW4ubGVuZ3RoLCBjb21wb25lbnRJZCwgcHJvcGVydGllcyk7XG59O1xuIiwiLyoqXG4gKiBTaG9ydGN1dCBmb3IgY2FsbGluZyBlbXB0eSgpIGFuZCB0aGVuIGFwcGVuZCgpLFxuICogVGhpcyBpcyB0aGUgZ2VuZXJhbCB1c2UgY2FzZSBmb3IgbWFuYWdpbmcgc3ViY29tcG9uZW50c1xuICogKGUuZy4gd2hlbiBhIG5hdmJhciBpdGVtIGlzIHRvdWNoZWQpXG4gKlxuICogQHBhcmFtICB7c3RyaW5nfSBjb21wb25lbnQgIFRoZSBpZCBuYW1lIG9mIHRoZSBjb21wb25ldCB0aGF0IHlvdSB3YW50IHRvIGF0dGFjaC5cbiAqIEBwYXJhbSAge09iamVjdH0gcHJvcGVydGllcyBQcm9wZXJ0aWVzIHRoYXQgdGhlIGF0dGFjaGVkIGNvbXBvbmVudCB3aWxsIGJlIGluaXRhbGl6ZWQgd2l0aC5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGF0dGFjaChjb21wb25lbnQsIHByb3BlcnRpZXMpIHtcblx0dGhpcy5lbXB0eSgpO1xuXHRyZXR1cm4gdGhpcy5hcHBlbmQoY29tcG9uZW50LCBwcm9wZXJ0aWVzKTtcbn07XG4iLCIvKipcbiAqIHJlZ2lvbi5lbXB0eSggKVxuICpcbiAqIEl0ZXJhdGUgb3ZlciBlYWNoIGNvbXBvbmVudCBpbiB0aGlzIHJlZ2lvbiBhbmQgY2FsbCAuY2xvc2UoKSBvbiBpdFxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZW1wdHkoKSB7XG5cdEZSQU1FV09SSy5kZWJ1Zyh0aGlzLnBhcmVudC5pZCArICcgOjogRW1wdHlpbmcgcmVnaW9uOiAnICsgdGhpcy5pZCk7XG5cdHdoaWxlICh0aGlzLl9jaGlsZHJlbi5sZW5ndGggPiAwKSB7XG5cdFx0dGhpcy5yZW1vdmUoMCk7XG5cdH1cbn07XG4iLCIvKipcbiAqIEZhY3RvcnkgbWV0aG9kIHRvIGdlbmVyYXRlIGEgbmV3IHJlZ2lvbiBpbnN0YW5jZSBmcm9tIGEgRE9NIGVsZW1lbnRcbiAqIEltcGxlbWVudHMgYHRlbXBsYXRlYCwgYGNvdW50YCwgYW5kIGBkYXRhLSpgIEhUTUwgYXR0cmlidXRlcy5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9uc1xuICogQHJldHVybnMgcmVnaW9uIGluc3RhbmNlXG4gKi9cblxudmFyIFV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMvdXRpbHMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmcm9tRWxlbWVudChlbCwgcGFyZW50KSB7XG5cblx0Ly8gSWYgcGFyZW50IGlzIG5vdCBzcGVjaWZpZWQsIG1ha2UtYmVsaWV2ZS5cblx0cGFyZW50ID0gcGFyZW50IHx8IHsgaWQ6ICcqJyB9O1xuXG5cblxuXHQvLyBCdWlsZCByZWdpb25cblx0dmFyIHJlZ2lvbiA9IG5ldyBGUkFNRVdPUksuUmVnaW9uKHtcblx0XHRpZDogVXRpbHMuZWwyaWQoZWwpLFxuXHRcdCRlbDogJChlbCksXG5cdFx0cGFyZW50OiBwYXJlbnRcblx0fSk7XG5cblx0Ly8gSWYgdGhpcyByZWdpb24gaGFzIGEgZGVmYXVsdCBjb21wb25lbnQvdGVtcGxhdGUgc2V0LFxuXHQvLyBncmFiIHRoZSBpZCAgLS0gIGUuZy4gPHJlZ2lvbiBjb250ZW50cz1cIkZvb1wiIC8+XG5cdHZhciBjb21wb25lbnRJZCA9ICQoZWwpLmF0dHIoJ2NvbnRlbnRzJyk7XG5cblxuXHQvLyBJZiBgY291bnRgIGlzIHNldCwgcmVuZGVyIHN1Yi1jb21wb25lbnQgc3BlY2lmaWVkIG51bWJlciBvZiB0aW1lcy5cblx0Ly8gZS5nLiA8cmVnaW9uIHRlbXBsYXRlPVwiRm9vXCIgY291bnQ9XCIzXCIgLz5cblx0Ly8gKHZlcmlmeSBGUkFNRVdPUksuc2hvcnRjdXQuY291bnQgaXMgZW5hYmxlZClcblx0dmFyIGNvdW50QXR0cixcblx0XHRcdGNvdW50ID0gMTtcblxuXHRpZiAoRlJBTUVXT1JLLnNob3J0Y3V0LmNvdW50KSB7XG5cblx0XHQvLyBJZiBgY291bnRgIGF0dHJpYnV0ZSBpcyBub3QgZmFsc2Ugb3IgdW5kZWZpbmVkLFxuXHRcdC8vIHRoYXQgbWVhbnMgaXQgd2FzIHNldCBleHBsaWNpdGx5LCBhbmQgd2Ugc2hvdWxkIHVzZSBpdFxuXHRcdGNvdW50QXR0ciA9ICQoZWwpLmF0dHIoJ2NvdW50Jyk7XG5cdFx0Ly8gRlJBTUVXT1JLLmRlYnVnKCdDb3VudCBhdHRyIGlzIDo6ICcsIGNvdW50QXR0cik7XG5cdFx0aWYgKCEhY291bnRBdHRyKSB7XG5cdFx0XHRjb3VudCA9IGNvdW50QXR0cjtcblx0XHR9XG5cdH1cblxuXG5cdEZSQU1FV09SSy5kZWJ1Zyhcblx0XHRwYXJlbnQuaWQgKyAnIDotOiBJbnN0YW50aWF0ZWTCoG5ldyByZWdpb24nICtcblx0XHQoIHJlZ2lvbi5pZCA/ICcgYCcgKyByZWdpb24uaWQgKyAnYCcgOiAnJyApICtcblx0XHQoIGNvbXBvbmVudElkID8gJyBhbmQgcG9wdWxhdGVkIGl0IHdpdGgnICtcblx0XHRcdCggY291bnQgPiAxID8gY291bnQgKyAnIGluc3RhbmNlcyBvZicgOiAnIDEnICkgK1xuXHRcdFx0JyBgJyArIGNvbXBvbmVudElkICsgJ2AnIDogJydcblx0XHQpICsgJy4nXG5cdCk7XG5cblxuXG5cdC8vIEFwcGVuZCBzdWItY29tcG9uZW50KHMpIHRvIHJlZ2lvbiBhdXRvbWF0aWNhbGx5XG5cdC8vICh2ZXJpZnkgRlJBTUVXT1JLLnNob3J0Y3V0LnRlbXBsYXRlIGlzIGVuYWJsZWQpXG5cdGlmICggRlJBTUVXT1JLLnNob3J0Y3V0LnRlbXBsYXRlICYmIGNvbXBvbmVudElkICkge1xuXG5cdFx0Ly8gRlJBTUVXT1JLLmRlYnVnKFxuXHRcdC8vIFx0J1ByZXBhcmluZyB0byByZW5kZXIgJyArIGNvdW50ICsgJyAnICsgY29tcG9uZW50SWQgKyAnIGNvbXBvbmVudHMgaW50byByZWdpb24gJyArXG5cdFx0Ly8gXHQnKCcgKyByZWdpb24uaWQgKyAnKSwgd2hpY2ggYWxyZWFkeSBjb250YWlucyAnICsgcmVnaW9uLiRlbC5jaGlsZHJlbigpLmxlbmd0aCArXG5cdFx0Ly8gXHQnIHN1YmNvbXBvbmVudHMuJ1xuXHRcdC8vICk7XG5cblx0XHRyZWdpb24uYXBwZW5kKGNvbXBvbmVudElkKTtcblxuXHRcdC8vIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXHRcdC8vIC8vIFNFUklPVVNMWSBXVEZcblx0XHQvLyAvLyBNQUpPUiBIQVhYWFhYWFhcblx0XHQvLyAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblx0XHQvLyBjb3VudCA9ICtjb3VudCArIDE7XG5cdFx0Ly8gLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cblx0XHQvLyBmb3IgKHZhciBqPTA7IGogPCBjb3VudDsgaisrICkge1xuXG5cdFx0Ly8gXHRyZWdpb24uYXBwZW5kKGNvbXBvbmVudElkKTtcblxuXHRcdC8vIFx0Ly8gRlJBTUVXT1JLLmRlYnVnKFxuXHRcdC8vIFx0Ly8gXHQncmVuZGVyaW5nIHRoZSAnICsgY29tcG9uZW50SWQgKyAnIGNvbXBvbmVudCwgcmVtYWluaW5nOiAnICtcblx0XHQvLyBcdC8vIFx0Y291bnQgKyAnIGFuZCB0aGVyZSBhcmUgJyArIHJlZ2lvbi4kZWwuY2hpbGRyZW4oKS5sZW5ndGggK1xuXHRcdC8vIFx0Ly8gXHQnIHN1YmNvbXBvbmVudCBlbGVtZW50cyBpbiB0aGUgcmVnaW9uIG5vdydcblx0XHQvLyBcdC8vICk7XG5cblx0XHQvLyB9XG5cblx0fVxuXG5cdHJldHVybiByZWdpb247XG59O1xuIiwiLyoqXG4gKiBSZWdpb25zXG4gKi9cblxudmFyIGluc2VydCA9IHJlcXVpcmUoJy4vaW5zZXJ0Jyk7XG52YXIgcmVtb3ZlID0gcmVxdWlyZSgnLi9yZW1vdmUnKTtcbnZhciBlbXB0eSA9IHJlcXVpcmUoJy4vZW1wdHknKTtcbnZhciBhcHBlbmQgPSByZXF1aXJlKCcuL2FwcGVuZCcpO1xudmFyIGF0dGFjaCA9IHJlcXVpcmUoJy4vYXR0YWNoJyk7XG52YXIgZnJvbUVsZW1lbnQgPSByZXF1aXJlKCcuL2Zyb21FbGVtZW50Jyk7XG5cblJlZ2lvbiA9IG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcmVnaW9uKHByb3BlcnRpZXMpIHtcblxuXHRfLmV4dGVuZCh0aGlzLCBGUkFNRVdPUksuRXZlbnRzKTtcblxuXHRpZiAoIXByb3BlcnRpZXMpIHtcblx0XHRwcm9wZXJ0aWVzID0ge307XG5cdH1cblx0aWYgKCFwcm9wZXJ0aWVzLiRlbCkge1xuXHRcdHRocm93IG5ldyBFcnJvcignVHJ5aW5nIHRvIGluc3RhbnRpYXRlIHJlZ2lvbiB3aXRoIG5vICRlbCEnKTtcblx0fVxuXG5cdC8vIEZvbGQgaW4gcHJvcGVydGllcyB0byBwcm90b3R5cGVcblx0Xy5leHRlbmQodGhpcywgcHJvcGVydGllcyk7XG5cblx0Ly8gSWYgbmVpdGhlciBhbiBpZCBub3IgYSBgdGVtcGxhdGVgIHdhcyBzcGVjaWZpZWQsXG5cdC8vIHdlJ2xsIHRocm93IGFuIGVycm9yLCBzaW5jZSB0aGVyZSdzIG5vIHdheSB0byBnZXQgYSBob2xkIG9mIHRoZSByZWdpb25cblx0aWYgKCF0aGlzLmlkICYmICEodGhpcy4kZWwuYXR0cignZGVmYXVsdCcpIHx8IHRoaXMuJGVsLmF0dHIoJ3RlbXBsYXRlJykgfHxcblx0XHR0aGlzLiRlbC5hdHRyKCdjb250ZW50cycpKSkge1xuXG5cdFx0dGhyb3cgbmV3IEVycm9yKFxuXHRcdFx0dGhpcy5wYXJlbnQuaWQgKyAnIDo6IEVpdGhlciBgZGF0YS1pZGAsIGBjb250ZW50c2AsIG9yIGJvdGggJyArXG5cdFx0XHQnbXVzdCBiZSBzcGVjaWZpZWQgb24gcmVnaW9ucy4gXFxuJyArXG5cdFx0XHQnZS5nLiA8cmVnaW9uIGRhdGEtaWQ9XCJmb29cIiB0ZW1wbGF0ZT1cIlNvbWVDb21wb25lbnRcIj48L3JlZ2lvbj4nXG5cdFx0KTtcblx0fVxuXG5cdC8vIFNldCB1cCBsaXN0IHRvIGhvdXNlIGNoaWxkIGNvbXBvbmVudHNcblx0dGhpcy5fY2hpbGRyZW4gPSBbXTtcblxuXHRfLmJpbmRBbGwodGhpcyk7XG5cblx0Ly8gU2V0IHVwIGNvbnZlbmllbmNlIGFjY2VzcyB0byB0aGlzIHJlZ2lvbiBpbiB0aGUgZ2xvYmFsIHJlZ2lvbiBjYWNoZVxuXHRGUkFNRVdPUksucmVnaW9uc1t0aGlzLmlkXSA9IHRoaXM7XG59O1xuXG5SZWdpb24uZnJvbUVsZW1lbnQgPSBmdW5jdGlvbihlbCwgcGFyZW50KSB7XG5cdHJldHVybiBmcm9tRWxlbWVudChlbCwgcGFyZW50KTtcbn07XG5SZWdpb24ucHJvdG90eXBlLnJlbW92ZSA9IGZ1bmN0aW9uKGF0SW5kZXgpIHtcblx0cmV0dXJuIHJlbW92ZS5jYWxsKHRoaXMsIGF0SW5kZXgpO1xufTtcblJlZ2lvbi5wcm90b3R5cGUuZW1wdHkgPSBmdW5jdGlvbigpIHtcblx0cmV0dXJuIGVtcHR5LmNhbGwodGhpcyk7XG59O1xuUmVnaW9uLnByb3RvdHlwZS5pbnNlcnQgPSBmdW5jdGlvbihhdEluZGV4LCBjb21wb25lbnRJZCwgcHJvcGVydGllcykge1xuXHRyZXR1cm4gaW5zZXJ0LmNhbGwodGhpcywgYXRJbmRleCwgY29tcG9uZW50SWQsIHByb3BlcnRpZXMpO1xufTtcblJlZ2lvbi5wcm90b3R5cGUuYXBwZW5kID0gZnVuY3Rpb24oY29tcG9uZW50SWQsIHByb3BlcnRpZXMpIHtcblx0cmV0dXJuIGFwcGVuZC5jYWxsKHRoaXMsIGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKTtcbn07XG5SZWdpb24ucHJvdG90eXBlLmF0dGFjaCA9IGZ1bmN0aW9uKGNvbXBvbmVudCwgcHJvcGVydGllcykge1xuXHRyZXR1cm4gYXR0YWNoLmNhbGwodGhpcywgY29tcG9uZW50LCBwcm9wZXJ0aWVzKTtcbn07XG4iLCIvKipcbiAqIHJlZ2lvbi5pbnNlcnQoIGF0SW5kZXgsIGNvbXBvbmVudElkLCBbcHJvcGVydGllc10gKVxuICpcbiAqIFRPRE86IHN1cHBvcnQgYSBsaXN0IG9mIHByb3BlcnRpZXMgb2JqZWN0cyBpbiBsaWV1IG9mIHRoZSBwcm9wZXJ0aWVzIG9iamVjdFxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaW5zZXJ0KGF0SW5kZXgsIGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKSB7XG5cblx0dmFyIGVyciA9ICcnO1xuXHRpZiAoIShhdEluZGV4IHx8IF8uaXNGaW5pdGUoYXRJbmRleCkpKSB7XG5cdFx0ZXJyICs9IHRoaXMuaWQgKyAnLmluc2VydCgpIDo6IE5vIGF0SW5kZXggc3BlY2lmaWVkISc7XG5cdH1cblx0ZWxzZSBpZiAoIWNvbXBvbmVudElkKSB7XG5cdFx0ZXJyICs9IHRoaXMuaWQgKyAnLmluc2VydCgpIDo6IE5vIGNvbXBvbmVudElkIHNwZWNpZmllZCEnO1xuXHR9XG5cdGlmIChlcnIpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoZXJyICsgJ1xcblVzYWdlOiBhcHBlbmQoYXRJbmRleCwgY29tcG9uZW50SWQsIFtwcm9wZXJ0aWVzXSknKTtcblx0fVxuXG5cdHZhciBjb21wb25lbnQ7XG5cdC8vIElmIGNvbXBvbmVudElkIGlzIGEgc3RyaW5nLCBsb29rIHVwIGNvbXBvbmVudCBwcm90b3R5cGUgYW5kIGluc3RhdGlhdGVcblx0aWYgKCdzdHJpbmcnID09IHR5cGVvZiBjb21wb25lbnRJZCkge1xuXG5cdFx0dmFyIGNvbXBvbmVudFByb3RvdHlwZSA9IEZSQU1FV09SSy5jb21wb25lbnRzW2NvbXBvbmVudElkXTtcblxuXHRcdGlmICghY29tcG9uZW50UHJvdG90eXBlKSB7XG5cdFx0XHR2YXIgdGVtcGxhdGUgPSBGUkFNRVdPUksudGVtcGxhdGVzW2NvbXBvbmVudElkXTtcblx0XHRcdGlmICghdGVtcGxhdGUpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yICgnSW4gJyArXG5cdFx0XHRcdFx0KHRoaXMuaWQgfHwgJ0Fub255bW91cyByZWdpb24nKSArICc6OiBUcnlpbmcgdG8gYXR0YWNoICcgK1xuXHRcdFx0XHRcdGNvbXBvbmVudElkICsgJywgYnV0IG5vIGNvbXBvbmVudCBvciB0ZW1wbGF0ZSBleGlzdHMgd2l0aCB0aGF0IGlkLicpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZiBubyBjb21wb25lbnQgcHJvdG90eXBlIHdpdGggdGhpcyBpZCBleGlzdHMsXG5cdFx0XHQvLyBjcmVhdGUgYW4gYW5vbnltb3VzIG9uZSB0byB1c2Vcblx0XHRcdGNvbXBvbmVudFByb3RvdHlwZSA9IEZSQU1FV09SSy5Db21wb25lbnQuZXh0ZW5kKHtcblx0XHRcdFx0aWQ6IGNvbXBvbmVudElkLFxuXHRcdFx0XHR0ZW1wbGF0ZTogdGVtcGxhdGVcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIEluc3RhbnRpYXRlIGFuZCByZW5kZXIgdGhlIGNvbXBvbmVudCBpbnNpZGUgdGhpcyByZWdpb25cblx0XHRjb21wb25lbnQgPSBuZXcgY29tcG9uZW50UHJvdG90eXBlKF8uZXh0ZW5kKHtcblx0XHRcdCRvdXRsZXQ6IHRoaXMuJGVsXG5cdFx0fSwgcHJvcGVydGllcyB8fCB7fSkpO1xuXG5cblx0fVxuXG5cdC8vIE90aGVyd2lzZSBhc3N1bWUgYW4gaW5zdGFudGlhdGVkIGNvbXBvbmVudCBvYmplY3Qgd2FzIHNlbnRcblx0LyogVE9ETzogQ2hlY2sgdGhhdCBjb21wb25lbnQgb2JqZWN0IGlzIHZhbGlkICovXG5cdGVsc2Uge1xuXHRcdGNvbXBvbmVudCA9IGNvbXBvbmVudElkO1xuXHRcdGNvbXBvbmVudC4kb3V0bGV0ID0gdGhpcy4kZWw7XG5cdH1cblxuXHQvLyBTYXZlIHJlZmVyZW5jZSB0byBwYXJlbnRSZWdpb25cblx0Y29tcG9uZW50LnBhcmVudFJlZ2lvbiA9IHRoaXM7XG5cblx0Ly8gUmVuZGVyIGNvbXBvbmVudCBpbnRvIHRoaXMgcmVnaW9uXG5cdGNvbXBvbmVudC5yZW5kZXIoYXRJbmRleCk7XG5cblx0Ly8gQW5kIGtlZXAgdHJhY2sgb2YgaXQgaW4gdGhlIGxpc3Qgb2YgdGhpcyByZWdpb24ncyBjaGlsZHJlblxuXHR0aGlzLl9jaGlsZHJlbi5zcGxpY2UoYXRJbmRleCwgMCwgY29tcG9uZW50KTtcblxuXHQvLyBMb2cgZm9yIGRlYnVnZ2luZyBgY291bnRgIGRlY2xhcmF0aXZlXG5cdHZhciBkZWJ1Z1N0ciA9IHRoaXMucGFyZW50LmlkICsgJyA6OiBJbnNlcnRlZCAnICsgY29tcG9uZW50SWQgKyAnIGludG8gJztcblx0aWYgKHRoaXMuaWQpIGRlYnVnU3RyICs9ICdyZWdpb246ICcgKyB0aGlzLmlkICsgJyBhdCBpbmRleCAnICsgYXRJbmRleDtcblx0ZWxzZSBkZWJ1Z1N0ciArPSAnYW5vbnltb3VzIHJlZ2lvbiBhdCBpbmRleCAnICsgYXRJbmRleDtcblx0RlJBTUVXT1JLLnZlcmJvc2UoZGVidWdTdHIpO1xuXG5cdHJldHVybiBjb21wb25lbnQ7XG5cbn07XG4iLCIvKipcbiAqIHJlZ2lvbi5yZW1vdmUoIGF0SW5kZXggKVxuICpcbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByZW1vdmUoYXRJbmRleCkge1xuXG5cdGlmICghYXRJbmRleCAmJiAhXy5pc0Zpbml0ZShhdEluZGV4KSkge1xuXHRcdHRocm93IG5ldyBFcnJvcih0aGlzLmlkICsgJy5yZW1vdmUoKSA6OiBObyBhdEluZGV4IHNwZWNpZmllZCEgXFxuVXNhZ2U6IHJlbW92ZShhdEluZGV4KScpO1xuXHR9XG5cblx0Ly8gUmVtb3ZlIHRoZSBjb21wb25lbnQgZnJvbSB0aGUgbGlzdFxuXHR2YXIgY29tcG9uZW50ID0gdGhpcy5fY2hpbGRyZW4uc3BsaWNlKGF0SW5kZXgsIDEpO1xuXHRpZiAoIWNvbXBvbmVudFswXSkge1xuXG5cdFx0Ly8gSWYgdGhlIGxpc3QgaXMgZW1wdHksIGZyZWFrIG91dFxuXHRcdHRocm93IG5ldyBFcnJvcih0aGlzLmlkICsgJy5yZW1vdmUoKSA6OiBUcnlpbmcgdG8gcmVtb3ZlIGEgY29tcG9uZW50IHRoYXQgZG9lc25cXCd0IGV4aXN0IGF0IGluZGV4ICcgKyBhdEluZGV4KTtcblx0fVxuXG5cdC8vIFNxdWVlemUgdGhlIGNvbXBvbmVudCB0byBkbyBnZXQgYWxsIHRoZSBiaW5keSBnb29kbmVzcyBvdXRcblx0Y29tcG9uZW50WzBdLmNsb3NlKCk7XG5cblx0RlJBTUVXT1JLLmRlYnVnKHRoaXMucGFyZW50LmlkICsgJyA6OiBSZW1vdmVkIGNvbXBvbmVudCBhdCBpbmRleCAnICsgYXRJbmRleCArICcgZnJvbSByZWdpb246ICcgKyB0aGlzLmlkKTtcbn07XG4iLCIvKipcbiAqIFNldHMgdXAgdGhlIEZSQU1FV09SSyByb3V0ZXIuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcm91dGVyU2V0dXAoKSB7XG5cblx0Ly8gV2lsZGNhcmQgcm91dGVzIHRvIGdsb2JhbCBldmVudCBkZWxlZ2F0b3Jcblx0dmFyIHJvdXRlciA9IG5ldyBGUkFNRVdPUksuUm91dGVyKCk7XG5cdHJvdXRlci5yb3V0ZSgvKC4qKS8sICdyb3V0ZScsIGZ1bmN0aW9uIChyb3V0ZSkge1xuXG5cdFx0Ly8gTm9ybWFsaXplIGhvbWUgcm91dGVzICgjIG9yIG51bGwpIHRvICcnXG5cdFx0aWYgKCFyb3V0ZSkge1xuXHRcdFx0cm91dGUgPSAnJztcblx0XHR9XG5cblx0XHQvLyBUcmlnZ2VyIHJvdXRlXG5cdFx0RlJBTUVXT1JLLnRyaWdnZXIoJyMnICsgcm91dGUpO1xuXHR9KTtcblxuXHQvLyBFeHBvc2UgYG5hdmlnYXRlKClgIG1ldGhvZFxuXHRGUkFNRVdPUksubmF2aWdhdGUgPSBGUkFNRVdPUksuaGlzdG9yeS5uYXZpZ2F0ZTtcbn1cbiIsIi8qKlxuICogQmFyZS1ib25lcyBET00vVUkgdXRpbGl0aWVzXG4gKi9cblxudmFyIEV2ZW50cyA9IHJlcXVpcmUoJy4vZXZlbnRzJyk7XG5cbnZhciBET00gPSB7XG5cblx0LyoqXG5cdCAqIEV4cG9zZSB0aGUgXCJET01teS1ldmVudGVkbmVzc1wiIG9mIGVsZW1lbnRzIHNvIHRoYXQgaXQncyBzZWxlY3RhYmxlIHZpYSBDU1Ncblx0ICogWW91IGNhbiB1c2UgdGhpcyB0byBhcHBseSBhIGZldyBjaG9pY2UgRE9NIG1vZGlmaWNhdGlvbnMgb3V0IHRoZSBnYXRlLS1cblx0ICogKGUuZy4gdHdlYWtzIHRhcmdldGluZyBjb21tb24gaXNzdWVzIHRoYXQgdHlwaWNhbGx5IGdldCBmb3Jnb3R0ZW4sIGxpa2UgZGlzYWJsaW5nIHRleHQgc2VsZWN0aW9uKVxuXHQgKlxuXHQgKiBAcGFyYW0ge0NvbXBvbmVudH0gY29tcG9uZW50XG5cdCAqL1xuXHRmbGFnQm91bmRFdmVudHM6IGZ1bmN0aW9uICggY29tcG9uZW50ICkge1xuXG5cdFx0Ly8gVE9ETzogcHJvdmlkZSBhY2Nlc3MgdG8gYm91bmQgZ2xvYmFsIGV2ZW50cyAoJSkgYW5kIHJvdXRlcyAoIykgYXMgd2VsbFxuXHRcdC8vIFRPRE86IGZsYWcgYWxsIERPTSBldmVudHMsIG5vdCBqdXN0IGNsaWNrIGFuZCB0b3VjaFxuXG5cdFx0Ly8gQnVpbGQgc3Vic2V0IG9mIGp1c3QgdGhlIGNsaWNrL3RvdWNoIGV2ZW50c1xuXHRcdHZhciBjbGlja09yVG91Y2hFdmVudHMgPSBFdmVudHMucGFyc2UoXG5cdFx0XHRjb21wb25lbnQuZXZlbnRzLFxuXHRcdFx0eyBvbmx5OiBbJ2NsaWNrJywgJ3RvdWNoJywgJ3RvdWNoc3RhcnQnLCAndG91Y2hlbmQnXSB9XG5cdFx0KTtcblxuXHRcdC8vIElmIG5vIGNsaWNrL3RvdWNoIGV2ZW50cyBmb3VuZCwgYmFpbCBvdXRcblx0XHRpZiAoIGNsaWNrT3JUb3VjaEV2ZW50cy5sZW5ndGggPCAxICkgcmV0dXJuO1xuXG5cdFx0Ly8gUXVlcnkgYWZmZWN0ZWQgZWxlbWVudHMgZnJvbSBET01cblx0XHR2YXIgJGFmZmVjdGVkID0gRXZlbnRzLmdldEVsZW1lbnRzKGNsaWNrT3JUb3VjaEV2ZW50cywgY29tcG9uZW50KTtcblxuXHRcdC8vIE5PVEU6IEZvciBub3csIHRoaXMgaXMgYWx3YXlzIGp1c3QgJ2NsaWNrJ1xuXHRcdHZhciBib3VuZEV2ZW50c1N0cmluZyA9ICdjbGljayc7XG5cblx0XHQvLyBTZXQgYGRhdGEtRlJBTUVXT1JLLWNsaWNrYWJsZWAgY3VzdG9tIGF0dHJpYnV0ZVxuXHRcdC8vICh1aSBsb2dpYyBzaG91bGQgYmUgZXh0ZW5kZWQgaW4gQ1NTKVxuXHRcdCRhZmZlY3RlZC5hdHRyKCdkYXRhLScgKyBGUkFNRVdPUksuaWQgKyAnLWV2ZW50cycsIGJvdW5kRXZlbnRzU3RyaW5nKTtcblxuXHRcdEZSQU1FV09SSy52ZXJib3NlKFxuXHRcdFx0Y29tcG9uZW50LmlkICsgJyA6OiAnICtcblx0XHRcdCdEaXNhYmxlZCB1c2VyIHRleHQgc2VsZWN0aW9uIG9uIGVsZW1lbnRzIHcvIGNsaWNrL3RvdWNoIGV2ZW50czonLFxuXHRcdFx0Y2xpY2tPclRvdWNoRXZlbnRzLFxuXHRcdFx0JGFmZmVjdGVkXG5cdFx0KTtcblx0fVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBET007XG4iLCIvKipcbiAqIFV0aWxpdHkgRXZlbnQgdG9vbGtpdFxuICovXG5cbnZhciBVdGlscyA9IHJlcXVpcmUoJy4vdXRpbHMuanMnKTtcblxudmFyIEV2ZW50cyA9IHtcblxuXHQvKipcblx0ICogUGFyc2VzIGEgZGljdGlvbmFyeSBvZiBldmVudHMgYW5kIG9wdGlvbmFsbHkgZmlsdGVycyBieSB0aGUgZXZlbnQgdHlwZS4gSWYgdGhlIGV2ZW50XG5cdCAqXG5cdCAqIEBwYXJhbSAge09iamVjdH0gZXZlbnRzICBbQSBCYWNrYm9uZS5WaWV3IGV2ZW50cyBvYmplY3RdXG5cdCAqIEBwYXJhbSAge09iamVjdH0gb3B0aW9ucyBbT3B0aW9ucyBvYmplY3QgdGhhdCBhbGxvd3MgdXMgdG8gZmlsdGVyIHBhcnNpbmcgdG8gY2VydGFpbiBldmVudFxuXHQgKiAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWVzXVxuXHQgKlxuXHQgKiBAcmV0dXJuIHtBcnJheX0gICAgICAgICAgW0FycmF5IGNvbnRhaW5pbmcgcGFyc2VkRXZlbnRzIHRoYXQgYXJlIG1hdGNoaW5nIGV2ZW50IGtleXNdXG5cdCAqL1xuXHRwYXJzZTogZnVuY3Rpb24gKGV2ZW50cywgb3B0aW9ucykge1xuXG5cdFx0dmFyIGV2ZW50S2V5cyA9IF8ua2V5cyhldmVudHMgfHwge30pLFxuXHRcdFx0bGltaXRFdmVudHMsXG5cdFx0XHRwYXJzZWRFdmVudHMgPSBbXTtcblxuXHRcdC8vIE9wdGlvbmFsbHkgZmlsdGVyIHVzaW5nIHNldCBvZiBhY2NlcHRhYmxlIGV2ZW50IHR5cGVzXG5cdFx0bGltaXRFdmVudHMgPSBvcHRpb25zLm9ubHk7XG5cdFx0ZXZlbnRLZXlzID0gXy5maWx0ZXIoZXZlbnRLZXlzLCBmdW5jdGlvbiBjaGVja0V2ZW50TmFtZSAoZXZlbnRLZXkpIHtcblxuXHRcdFx0Ly8gUGFyc2UgZXZlbnQgc3RyaW5nIGludG8gc2VtYW50aWMgcmVwcmVzZW50YXRpb25cblx0XHRcdHZhciBldmVudCA9IEV2ZW50cy5wYXJzZURPTUV2ZW50KGV2ZW50S2V5KTtcblx0XHRcdHBhcnNlZEV2ZW50cy5wdXNoKGV2ZW50KTtcblxuXHRcdFx0Ly8gT3B0aW9uYWwgZmlsdGVyXG5cdFx0XHRpZiAobGltaXRFdmVudHMpIHtcblx0XHRcdFx0cmV0dXJuIF8uY29udGFpbnMobGltaXRFdmVudHMsIGV2ZW50Lm5hbWUpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gcGFyc2VkRXZlbnRzO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBbZ2V0RWxlbWVudHMgZGVzY3JpcHRpb25dXG5cdCAqXG5cdCAqIEBwYXJhbSAge0FycmF5fSBzZW1hbnRpY0V2ZW50cyBbQSBsaXN0IG9mIHBhcnNlZCBldmVudCBvYmplY3RzXVxuXHQgKiBAcGFyYW0gIHtDb21wb25lbnR9IGNvbnRleHQgICAgW0luc3RhbmNlIG9mIGEgY29tcG9uZW50IHRvIHVzZSBhcyBhIHN0YXJ0aW5nIHBvaW50IGZvclxuXHQgKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoZSBET00gcXVlcmllc11cblx0ICpcblx0ICogQHJldHVybiB7QXJyYXl9ICAgICAgICAgICAgICAgIFtBbiBhcnJheSBvZiBqUXVlcnkgc2V0IG9mIG1hdGNoZWQgZWxlbWVudHNdXG5cdCAqL1xuXHRnZXRFbGVtZW50czogZnVuY3Rpb24gKHNlbWFudGljRXZlbnRzLCBjb250ZXh0KSB7XG5cblx0XHQvLyBDb250ZXh0IG9wdGlvbmFsXG5cdFx0Y29udGV4dCA9IGNvbnRleHQgfHwgeyAkOiAkIH07XG5cblx0XHQvLyBJdGVyYXRpdmVseSBidWlsZCBhIHNldCBvZiBhZmZlY3RlZCBlbGVtZW50c1xuXHRcdHZhciAkYWZmZWN0ZWQgPSAkKCk7XG5cdFx0Xy5lYWNoKHNlbWFudGljRXZlbnRzLCBmdW5jdGlvbiBsb29rdXBFbGVtZW50c0ZvckV2ZW50IChldmVudCkge1xuXG5cdFx0XHQvLyBEZXRlcm1pbmUgbWF0Y2hlZCBlbGVtZW50c1xuXHRcdFx0Ly8gVXNlIGRlbGVnYXRlIHNlbGVjdG9yIGlmIHNwZWNpZmllZFxuXHRcdFx0Ly8gT3RoZXJ3aXNlLCBncmFiIHRoZSBlbGVtZW50IGZvciB0aGlzIGNvbXBvbmVudFxuXHRcdFx0dmFyICRtYXRjaGVkID1cdGV2ZW50LnNlbGVjdG9yID9cblx0XHRcdFx0XHRcdFx0Y29udGV4dC4kKGV2ZW50LnNlbGVjdG9yKSA6XG5cdFx0XHRcdFx0XHRcdGNvbnRleHQuJGVsO1xuXG5cdFx0XHQvLyBBZGQgbWF0Y2hlZCBlbGVtZW50cyB0byBzZXRcblx0XHRcdCRhZmZlY3RlZCA9ICRhZmZlY3RlZC5hZGQoICRtYXRjaGVkICk7XG5cdFx0fSwgdGhpcyk7XG5cblx0XHRyZXR1cm4gJGFmZmVjdGVkO1xuXHR9LFxuXG5cblxuXHQvKipcblx0ICogUmV0dXJucyB3aGV0aGVyIHRoZSBzcGVjaWZpZWQgZXZlbnQga2V5IG1hdGNoZXMgYSBET00gZXZlbnQuXG5cdCAqXG5cdCAqIEBwYXJhbSAge1N0cmluZ30ga2V5IFtLZXkgdG8gbWF0Y2ggYWdhaW5zdF1cblx0ICpcblx0ICogaWYgbm8gbWF0Y2ggaXMgZm91bmRcblx0ICogQHJldHVybiB7Qm9vbGVhbn0gXHRcdFtyZXR1cm4gYGZhbHNlYF1cblx0ICpcblx0ICogb3RoZXJ3aXNlXG5cdCAqIEByZXR1cm4ge09iamVjdH0gIFx0XHRbT2JqZWN0IGNvbnRhaW5pbmcgdGhlIGBuYW1lYCBvZiB0aGUgRE9NIGVsZW1lbnQgYW5kIHRoZSBgc2VsZWN0b3JgXVxuXHQgKi9cblx0cGFyc2VET01FdmVudDogXy5tZW1vaXplKGZ1bmN0aW9uKGtleSkge1xuXG5cdFx0dmFyIG1hdGNoZXMgPSBrZXkubWF0Y2godGhpc1snL0RPTUV2ZW50LyddKTtcblxuXHRcdGlmICghbWF0Y2hlcyB8fCAhbWF0Y2hlc1sxXSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRuYW1lOiBtYXRjaGVzWzFdLFxuXHRcdFx0c2VsZWN0b3I6IG1hdGNoZXNbM11cblx0XHR9O1xuXHR9KSxcblxuXG5cdC8qKlxuXHQgKiBTdXBwb3J0ZWQgXCJmaXJzdC1jbGFzc1wiIERPTSBldmVudHMuXG5cdCAqIEB0eXBlIHtBcnJheX1cblx0ICovXG5cdG5hbWVzOiBbXG5cblx0XHQvLyBMb2NhbGl6ZWQgYnJvd3NlciBldmVudHNcblx0XHQvLyAod29ya3Mgb24gaW5kaXZpZHVhbCBlbGVtZW50cylcblx0XHQnZXJyb3InLCAnc2Nyb2xsJyxcblxuXHRcdC8vIE1vdXNlIGV2ZW50c1xuXHRcdCdjbGljaycsICdkYmxjbGljaycsICdtb3VzZWRvd24nLCAnbW91c2V1cCcsICdob3ZlcicsICdtb3VzZWVudGVyJywgJ21vdXNlbGVhdmUnLFxuXHRcdCdtb3VzZW92ZXInLCAnbW91c2VvdXQnLCAnbW91c2Vtb3ZlJyxcblxuXHRcdC8vIEtleWJvYXJkIGV2ZW50c1xuXHRcdCdrZXlkb3duJywgJ2tleXVwJywgJ2tleXByZXNzJyxcblxuXHRcdC8vIEZvcm0gZXZlbnRzXG5cdFx0J2JsdXInLCAnY2hhbmdlJywgJ2ZvY3VzJywgJ2ZvY3VzaW4nLCAnZm9jdXNvdXQnLCAnc2VsZWN0JywgJ3N1Ym1pdCcsXG5cblx0XHQvLyBSYXcgdG91Y2ggZXZlbnRzXG5cdFx0J3RvdWNoc3RhcnQnLCAndG91Y2hlbmQnLCAndG91Y2htb3ZlJywgJ3RvdWNoY2FuY2VsJyxcblxuXHRcdC8vIE1hbnVmYWN0dXJlZCBldmVudHNcblx0XHQndG91Y2gnLFxuXG5cdFx0Ly8gVE9ETzpcblx0XHQncmlnaHRjbGljaycsICdjbGlja291dHNpZGUnXG5cdF1cbn07XG5cblxuXG5cbi8qKlxuICogUmVnZXhwIHRvIG1hdGNoIFwiZmlyc3QgY2xhc3NcIiBET00gZXZlbnRzXG4gKiAodGhlc2UgYXJlIGFsbG93ZWQgaW4gdGhlIHRvcCBsZXZlbCBvZiBhIGNvbXBvbmVudCBkZWZpbml0aW9uIGFzIG1ldGhvZCBrZXlzKVxuICpcdFx0aS5lLiAvXihjbGlja3xob3ZlcnxibHVyfGZvY3VzKSggKC4rKSkvXG4gKlx0XHRcdFsxXSA9PiBldmVudCBuYW1lXG4gKlx0XHRcdFszXSA9PiBzZWxlY3RvclxuICovXG5cbkV2ZW50c1snL0RPTUV2ZW50LyddID0gbmV3IFJlZ0V4cCgnXignICsgXy5yZWR1Y2UoRXZlbnRzLm5hbWVzLFxuXHRmdW5jdGlvbiBidWlsZFJlZ2V4cChtZW1vLCBldmVudE5hbWUsIGluZGV4KSB7XG5cblx0XHQvLyBPbWl0IGB8YCB0aGUgZmlyc3QgdGltZVxuXHRcdGlmIChpbmRleCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIG1lbW8gKyBldmVudE5hbWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG1lbW8gKyAnfCcgKyBldmVudE5hbWU7XG5cdH0sICcnKSArXG4nKSggKC4rKSk/JCcpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEV2ZW50cztcbiIsIi8qKlxuICogVHJhbnNsYXRlICoqcmlnaHQtaGFuZC1zaWRlIGFiYnJldmlhdGlvbnMqKiBpbnRvIGZ1bmN0aW9ucyB0aGF0IHBlcmZvcm1cbiAqIHRoZSBwcm9wZXIgYmVoYXZpb3JzLCBlLmcuXG4gKlx0XHQjYWJvdXRfbWVcbiAqXHRcdCVtYWluTWVudTpvcGVuXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB0cmFuc2xhdGVTaG9ydGhhbmQodmFsdWUsIGtleSkge1xuXG5cdHZhciBtYXRjaGVzLCBmbjtcblxuXHQvLyBJZiB0aGlzIGlzIGFuIGltcG9ydGFudCwgRlJBTUVXT1JLLXNwZWNpZmljIGRhdGEga2V5LFxuXHQvLyBhbmQgYSBmdW5jdGlvbiB3YXMgc3BlY2lmaWVkLCBydW4gaXQgdG8gZ2V0IGl0cyB2YWx1ZVxuXHQvLyAodGhpcyBpcyB0byBrZWVwIHBhcml0eSB3aXRoIEJhY2tib25lJ3Mgc2ltaWxhciBmdW5jdGlvbmFsaXR5KVxuXHRpZiAoXy5pc0Z1bmN0aW9uKHZhbHVlKSAmJiAoa2V5ID09PSAnY29sbGVjdGlvbicgfHwga2V5ID09PSAnbW9kZWwnKSkge1xuXHRcdHJldHVybiB2YWx1ZSgpO1xuXHR9XG5cblx0Ly8gSWdub3JlIG90aGVyIG5vbi1zdHJpbmdzXG5cdGlmICghXy5pc1N0cmluZyh2YWx1ZSkpIHtcblx0XHRyZXR1cm4gdmFsdWU7XG5cdH1cblxuXHQvLyBSZWRpcmVjdHMgdXNlciB0byBjbGllbnQtc2lkZSBVUkwsIHcvbyBhZmZlY3RpbmcgYnJvd3NlciBoaXN0b3J5XG5cdC8vIExpa2UgY2FsbGluZyBgQmFja2JvbmUuaGlzdG9yeS5uYXZpZ2F0ZSgnL2ZvbycsIHsgcmVwbGFjZTogdHJ1ZSB9KWBcblx0aWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14jIyguKlteLlxcc10pLykpICYmIG1hdGNoZXNbMV0pIHtcblx0XHRmbiA9IGZ1bmN0aW9uIHJlZGlyZWN0QW5kQ292ZXJUcmFja3MoKSB7XG5cdFx0XHR2YXIgdXJsID0gbWF0Y2hlc1sxXTtcblx0XHRcdEZSQU1FV09SSy5oaXN0b3J5Lm5hdmlnYXRlKHVybCwge1xuXHRcdFx0XHR0cmlnZ2VyOiB0cnVlLFxuXHRcdFx0XHRyZXBsYWNlOiB0cnVlXG5cdFx0XHR9KTtcblx0XHR9O1xuXHR9XG5cdC8vIE1ldGhvZCB0byByZWRpcmVjdCB1c2VyIHRvIGEgY2xpZW50LXNpZGUgVVJMLCB0aGVuIGNhbGwgdGhlIGhhbmRsZXJcblx0ZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXiMoLipbXi5cXHNdKykvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHRcdGZuID0gZnVuY3Rpb24gY2hhbmdlVXJsRnJhZ21lbnQoKSB7XG5cdFx0XHR2YXIgdXJsID0gbWF0Y2hlc1sxXTtcblx0XHRcdEZSQU1FV09SSy5oaXN0b3J5Lm5hdmlnYXRlKHVybCwge1xuXHRcdFx0XHR0cmlnZ2VyOiB0cnVlXG5cdFx0XHR9KTtcblx0XHR9O1xuXHR9XG5cdC8vIE1ldGhvZCB0byB0cmlnZ2VyIGdsb2JhbCBldmVudFxuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eKCUuKlteLlxcc10pLykpICYmIG1hdGNoZXNbMV0pIHtcblx0XHRmbiA9IGZ1bmN0aW9uIHRyaWdnZXJFdmVudCgpIHtcblx0XHRcdHZhciB0cmlnZ2VyID0gbWF0Y2hlc1sxXTtcblx0XHRcdEZSQU1FV09SSy52ZXJib3NlKHRoaXMuaWQgKyAnIDo6IFRyaWdnZXJpbmcgZXZlbnQgKCcgKyB0cmlnZ2VyICsgJykuLi4nKTtcblx0XHRcdEZSQU1FV09SSy50cmlnZ2VyKHRyaWdnZXIpO1xuXHRcdH07XG5cdH1cblx0Ly8gTWV0aG9kIHRvIGZpcmUgYSB0ZXN0IGFsZXJ0XG5cdC8vICh1c2UgbWVzc2FnZSwgaWYgc3BlY2lmaWVkKVxuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eISEhXFxzKiguKlteLlxcc10pPy8pKSkge1xuXHRcdGZuID0gZnVuY3Rpb24gYmFuZ0FsZXJ0KGUpIHtcblxuXHRcdFx0Ly8gSWYgc3BlY2lmaWVkLCBtZXNzYWdlIGlzIHVzZWQsIG90aGVyd2lzZSAnQWxlcnQgdHJpZ2dlcmVkISdcblx0XHRcdHZhciBtc2cgPSAobWF0Y2hlcyAmJiBtYXRjaGVzWzFdKSB8fCAnRGVidWcgYWxlcnQgKCEhISkgdHJpZ2dlcmVkISc7XG5cblx0XHRcdC8vIE90aGVyIGRpYWdub3N0aWMgaW5mb3JtYXRpb25cblx0XHRcdG1zZyArPSAnXFxuXFxuRGlhZ25vc3RpY3NcXG49PT09PT09PT09PT09PT09PT09PT09PT1cXG4nO1xuXHRcdFx0aWYgKGUgJiYgZS5jdXJyZW50VGFyZ2V0KSB7XG5cdFx0XHRcdG1zZyArPSAnZS5jdXJyZW50VGFyZ2V0IDo6ICcgKyBlLmN1cnJlbnRUYXJnZXQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5pZCkge1xuXHRcdFx0XHRtc2cgKz0gJ3RoaXMuaWQgOjogJyArIHRoaXMuaWQ7XG5cdFx0XHR9XG5cblx0XHRcdGFsZXJ0KG1zZyk7XG5cdFx0fTtcblx0fVxuXG5cdC8vIE1ldGhvZCB0byBsb2cgYSBtZXNzYWdlIHRvIHRoZSBjb25zb2xlXG5cdC8vICh1c2UgbWVzc2FnZSwgaWYgc3BlY2lmaWVkKVxuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9ePj4+XFxzKiguKlteLlxcc10pPy8pKSkge1xuXG5cdFx0Zm4gPSBmdW5jdGlvbiBsb2dNZXNzYWdlKGUpIHtcblxuXHRcdFx0Ly8gSWYgc3BlY2lmaWVkLCBtZXNzYWdlIGlzIHVzZWQsIG90aGVyd2lzZSB1c2UgZGVmYXVsdFxuXHRcdFx0dmFyIG1zZyA9IChtYXRjaGVzICYmIG1hdGNoZXNbMV0pIHx8ICdMb2cgbWVzc2FnZSAoPj4+KSB0cmlnZ2VyZWQhJztcblx0XHRcdEZSQU1FV09SSy5sb2cobXNnKTtcblx0XHR9O1xuXHR9XG5cblx0Ly8gTWV0aG9kIHRvIGF0dGFjaCB0aGUgc3BlY2lmaWVkIGNvbXBvbmVudC90ZW1wbGF0ZSB0byBhIHJlZ2lvblxuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eKC4rKUAoLipbXi5cXHNdKS8pKSAmJiBtYXRjaGVzWzFdICYmIG1hdGNoZXNbMl0pIHtcblx0XHRmbiA9IGZ1bmN0aW9uIGF0dGFjaFRlbXBsYXRlKCkge1xuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UodGhpcy5pZCArICcgOjogQXR0YWNoaW5nIGAnICsgbWF0Y2hlc1syXSArICdgIHRvIGAnICsgbWF0Y2hlc1sxXSArICdgLi4uJyk7XG5cblx0XHRcdHZhciByZWdpb24gPSBtYXRjaGVzWzFdO1xuXHRcdFx0dmFyIHRlbXBsYXRlID0gbWF0Y2hlc1syXTtcblxuXHRcdFx0dGhpc1tyZWdpb25dLmF0dGFjaCh0ZW1wbGF0ZSk7XG5cdFx0fTtcblx0fVxuXG5cblx0Ly8gTWV0aG9kIHRvIGFkZCB0aGUgc3BlY2lmaWVkIGNsYXNzXG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL15cXCtcXHMqXFwuKC4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHRcdGZuID0gZnVuY3Rpb24gYWRkQ2xhc3MoKSB7XG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZSh0aGlzLmlkICsgJyA6OiBBZGRpbmcgY2xhc3MgKCcgKyBtYXRjaGVzWzFdICsgJykuLi4nKTtcblx0XHRcdHRoaXMuJGVsLmFkZENsYXNzKG1hdGNoZXNbMV0pO1xuXHRcdH07XG5cdH1cblx0Ly8gTWV0aG9kIHRvIHJlbW92ZSB0aGUgc3BlY2lmaWVkIGNsYXNzXG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL15cXC1cXHMqXFwuKC4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHRcdGZuID0gZnVuY3Rpb24gcmVtb3ZlQ2xhc3MoKSB7XG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZSh0aGlzLmlkICsgJyA6OiBSZW1vdmluZyBjbGFzcyAoJyArIG1hdGNoZXNbMV0gKyAnKS4uLicpO1xuXHRcdFx0dGhpcy4kZWwucmVtb3ZlQ2xhc3MobWF0Y2hlc1sxXSk7XG5cdFx0fTtcblx0fVxuXHQvLyBNZXRob2QgdG8gdG9nZ2xlIHRoZSBzcGVjaWZpZWQgY2xhc3Ncblx0ZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXlxcIVxccypcXC4oLipbXi5cXHNdKS8pKSAmJiBtYXRjaGVzWzFdKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiB0b2dnbGVDbGFzcygpIHtcblx0XHRcdEZSQU1FV09SSy52ZXJib3NlKHRoaXMuaWQgKyAnIDo6IFRvZ2dsaW5nIGNsYXNzICgnICsgbWF0Y2hlc1sxXSArICcpLi4uJyk7XG5cdFx0XHR0aGlzLiRlbC50b2dnbGVDbGFzcyhtYXRjaGVzWzFdKTtcblx0XHR9O1xuXHR9XG5cblx0Ly8gVE9ETzpcdGFsbG93IGRlc2NlbmRhbnRzIHRvIGJlIGNvbnRyb2xsZWQgdmlhIHNob3J0aGFuZFxuXHQvL1x0XHRcdGUuZy4gOiAnbGkucm93IC0uaGlnaGxpZ2h0ZWQnXG5cdC8vXHRcdFx0d291bGQgcmVtb3ZlIHRoZSBgaGlnaGxpZ2h0ZWRgIGNsYXNzIGZyb20gdGhpcy4kKCdsaS5yb3cnKVxuXG5cblx0Ly8gSWYgc2hvcnQtaGFuZCBtYXRjaGVkLCByZXR1cm4gdGhlIGRlcmVmZXJlbmNlZCBmdW5jdGlvblxuXHRpZiAoZm4pIHtcblxuXHRcdEZSQU1FV09SSy52ZXJib3NlKCdJbnRlcnByZXRpbmcgbWVhbmluZyBmcm9tIHNob3J0aGFuZCA6OiBgJyArIHZhbHVlICsgJ2AuLi4nKTtcblxuXHRcdC8vIEN1cnJ5IHRoZSByZXN1bHQgZnVuY3Rpb24gd2l0aCBhbnkgc3VmZml4IG1hdGNoZXNcblx0XHR2YXIgY3VycmllZEZuID0gZm47XG5cblx0XHQvLyBUcmFpbGluZyBgLmAgaW5kaWNhdGVzIGFuIGUuc3RvcFByb3BhZ2F0aW9uKClcblx0XHRpZiAodmFsdWUubWF0Y2goL1xcLlxccyokLykpIHtcblx0XHRcdGN1cnJpZWRGbiA9IGZ1bmN0aW9uIGFuZFN0b3BQcm9wYWdhdGlvbihlKSB7XG5cblx0XHRcdFx0Ly8gQmluZCAoc28gaXQgaW5oZXJpdHMgY29tcG9uZW50IGNvbnRleHQpIGFuZCBjYWxsIGludGVyaW9yIGZ1bmN0aW9uXG5cdFx0XHRcdGZuLmFwcGx5KHRoaXMpO1xuXG5cdFx0XHRcdC8vIHRoZW4gaW1tZWRpYXRlbHkgc3RvcCBldmVudCBidWJibGluZy9wcm9wYWdhdGlvblxuXHRcdFx0XHRpZiAoZSAmJiBlLnN0b3BQcm9wYWdhdGlvbikge1xuXHRcdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0RlJBTUVXT1JLLndhcm4oXG5cdFx0XHRcdFx0XHR0aGlzLmlkICsgJyA6OiBUcmFpbGluZyBgLmAgc2hvcnRoYW5kIHdhcyB1c2VkIHRvIGludm9rZSBhbiAnICtcblx0XHRcdFx0XHRcdCdlLnN0b3BQcm9wYWdhdGlvbigpLCBidXQgXCInICsgdmFsdWUgKyAnXCIgd2FzIG5vdCB0cmlnZ2VyZWQgYnkgYSBET00gZXZlbnQhXFxuJyArXG5cdFx0XHRcdFx0XHQnUHJvYmFibHkgYmVzdCB0byBkb3VibGUtY2hlY2sgdGhpcyB3YXMgd2hhdCB5b3UgbWVhbnQgdG8gZG8uJyk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGN1cnJpZWRGbjtcblx0fVxuXG5cblx0Ly8gT3RoZXJ3aXNlLCBpZiBubyBzaG9ydC1oYW5kIG1hdGNoZWQsIHBhc3MgdGhlIG9yaWdpbmFsIHZhbHVlXG5cdC8vIHN0cmFpZ2h0IHRocm91Z2hcblx0cmV0dXJuIHZhbHVlO1xufTtcbiIsIi8qKlxuICogVXRpbGl0eSBmdW5jdGlvbnMgdGhhdCBhcmUgdXNlZCB0aHJvdWdob3V0IHRoZSBjb3JlLlxuICovXG5cbnZhciBVdGlscyA9IHtcblxuXHQvKipcblx0ICogR3JhYnMgdGhlIGlkIHhvciBkYXRhLWlkIGZyb20gYW4gSFRNTCBlbGVtZW50LlxuXHQgKlxuXHQgKiBAcGFyYW0gIHtET01FbGVtZW50fSBlbCAgICBbRWxlbWVudCB3aGVyZSB3ZSBhcmUgbG9va2luZyBmb3IgdGhlIGBpZGAgb3IgYGRhdGEtaWRgIGF0dHJdXG5cdCAqIEBwYXJhbSAge0Jvb2xlYW59IHJlcXVpcmVkIFtEZXRlcm1pbmVzIGlmIGl0IGlzIHJlcXVpcmVkIHRvIGZpbmQgYW4gYGlkYCBvciBgZGF0YS1pZGAgYXR0cl1cblx0ICpcblx0ICogQHJldHVybiB7U3RyaW5nfSAgICAgICAgICBcdFtJZGVudGlmaWNhdGlvbiBzdHJpbmcgdGhhdCB3YXMgZm91bmRdXG5cdCAqL1xuXHRlbDJpZDogZnVuY3Rpb24oZWwsIHJlcXVpcmVkKSB7XG5cblx0XHR2YXIgaWQgPSAkKGVsKS5hdHRyKCdpZCcpO1xuXHRcdHZhciBkYXRhSWQgPSAkKGVsKS5hdHRyKCdkYXRhLWlkJyk7XG5cdFx0dmFyIGNvbnRlbnRzSWQgPSAkKGVsKS5hdHRyKCdjb250ZW50cycpO1xuXG5cdFx0aWYgKGlkICYmIGRhdGFJZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGlkICsgJyA6OiBDYW5ub3Qgc2V0IGJvdGggYGlkYCBhbmQgYGRhdGEtaWRgISAgUGxlYXNlIHVzZSBvbmUgb3IgdGhlIG90aGVyLiAgKGRhdGEtaWQgaXMgc2FmZXN0KScpO1xuXHRcdH1cblx0XHRpZiAocmVxdWlyZWQgJiYgIWlkICYmICFkYXRhSWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTm8gaWQgc3BlY2lmaWVkIGluIGVsZW1lbnQgd2hlcmUgaXQgaXMgcmVxdWlyZWQ6XFxuJyArIGVsKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gaWQgfHwgZGF0YUlkIHx8IGNvbnRlbnRzSWQ7XG5cdH0sXG5cblx0LyoqXG5cdCAqIE1hcCBhbiBvYmplY3QncyB2YWx1ZXMsIGFuZCByZXR1cm4gYSB2YWxpZCBvYmplY3QgKHRoaXMgZnVuY3Rpb24gaXMgaGFuZHkgYmVjYXVzZVxuXHQgKiB1bmRlcnNjb3JlLm1hcCgpIHJldHVybnMgYSBsaXN0LCBub3QgYW4gb2JqZWN0Lilcblx0ICpcblx0ICogQHBhcmFtICB7T2JqZWN0fSBvYmogICAgICAgICBcdFtPamVjdCB3aG9zIHZhbHVlcyB5b3Ugd2FudCB0byBtYXBdXG5cdCAqIEBwYXJhbSAge0Z1bmN0aW9ufSB0cmFuc2Zvcm1GbiBbRnVuY3Rpb24gdG8gdHJhbnNmb3JtIGVhY2ggb2JqZWN0IHZhbHVlIGJ5XVxuXHQgKlxuXHQgKiBAcmV0dXJuIHtPYmplY3R9ICAgICAgICAgICAgIFx0W05ldyBvYmplY3Qgd2l0aCB0aGUgdmFsdWVzIG1hcHBlZF1cblx0ICovXG5cdG9iak1hcDogZnVuY3Rpb24gb2JqTWFwKG9iaiwgdHJhbnNmb3JtRm4pIHtcblx0XHRyZXR1cm4gXy5vYmplY3QoXy5rZXlzKG9iaiksIF8ubWFwKG9iaiwgdHJhbnNmb3JtRm4pKTtcblx0fVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBVdGlsczsiXX0=
;