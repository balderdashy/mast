(function(e){if("function"==typeof bootstrap)bootstrap("mast",e);else if("object"==typeof exports)module.exports=e();else if("function"==typeof define&&define.amd)define(e);else if("undefined"!=typeof ses){if(!ses.ok())return;ses.makeMast=e}else"undefined"!=typeof window?window.Mast=e():global.Mast=e()})(function(){var define,ses,bootstrap,module,exports;
return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * Module dependencies
 */
var renderDataBindings = require('./renderDataBindings');


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
	var self = this;

	if (this.model) {

		// Listen for any attribute changes
		// e.g.
		// .afterChange(model, options)
		//
		this.listenTo(this.model, 'change', function modelChanged (model, options) {

			// Render data bindings
			renderDataBindings.call(self);

			// Run custom `afterChange`() method
			if (_.isFunction(this.afterChange)) {
				this.afterChange(model, options);
			}
		});

		// Listen for specific attribute changes
		// e.g.
		// .afterChange.color(model, value, options)
		if (_.isObject(this.afterChange)) {
			_.each(this.afterChange, function (handler, attrName) {

				// Call handler with newVal to keep arguments straightforward
				this.listenTo(this.model, 'change:' + attrName, function attrChanged (model, newVal) {
					handler.call(this, newVal);
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

},{"./renderDataBindings":12}],2:[function(require,module,exports){
/**
 * Module dependencies
 */

var deleteAllRegions = require('./deleteAllRegions');




/**
 * FRAMEWORK.Component.prototype.close
 *
 * Safely zap every trace about this component from memory.
 *
 */

module.exports = function close () {

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
		deleteAllRegions.call(self);

		// Call native `Backbone.View.prototype.remove()`
		// to undelegate events, etc.
		self.remove();

	});
};

},{"./deleteAllRegions":6}],3:[function(require,module,exports){
/**
 * Convert template HTML and data into a compiled $template
 */
module.exports = function compileTemplate () {

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

		// NOTE: This error is no longer a valid error.
		// FRAMEWORK.error(this.id + ' :: Cannot render() template (probably missing data).\n\nGot this error ::\n'+str,'\n');
		if (html) {FRAMEWORK.verbose('Template :: ' + html);}
		FRAMEWORK.verbose('Full Template Error:' + '\n',stack);
		FRAMEWORK.verbose('\n\nMore information:', '\n\nTemplate context ::',templateContext, '\n\nthis.model::', this.model);
		html = _.isString(this.template) ? this.template : str;
	}

	return html;
};



},{}],4:[function(require,module,exports){
/**
 * `class` data binding
 * @type {Object}
 */
module.exports = {
	regexp: /bind\-class\-([^-]+)/,
	fn: function ($el, model, matches) {
		// Regexp matches for wildcard params in attribute match expression
		var className = matches[1];

		var raw = $boundEl.attr('bind-class-' + className);
		var clean = raw.replace(/^@/, '');
		if ( model.get(clean) ) {
			$boundEl.addClass(className);
		}
		else {
			$boundEl.removeClass(className);
		}
	}
};


},{}],5:[function(require,module,exports){
/**
 * `text` data binding
 * @type {Object}
 */

module.exports = {
	regexp: /bind-text/,
	fn: function ($el, model) {
		var raw = $boundEl.attr('bind-text');
		var clean = raw.replace(/^@/, '');
		$boundEl.text( model.get(clean) );
	}
};

},{}],6:[function(require,module,exports){
/**
 * If any regions exist in this component,
 * empty them, and then delete them
 */

module.exports = function deleteAllRegions () {
	_.each(this.regions, function (region, key) {
		region.empty();
		delete this.regions[key];
	}, this);
};

},{}],7:[function(require,module,exports){
/**
 * Module dependencies
 */

var lifecycleHooks     = require('./lifecycleHooks'),
	lifecycleEvents    = require('./lifecycleEvents'),
	bindEvents         = require('./bindEvents'),
	closeComponent     = require('./close'),
	render             = require('./render'),
	renderCollection   = require('./renderCollection'),
	validateDefinition = require('./validateDefinition');


/**
 * FRAMEWORK.Component
 *
 * Component is an extended `Backbone.View`. It add features such as automatic event binding,
 * rendering, lifecycle hooks and events, and more.
 *
 * @constructor
 */
var Component = module.exports = Backbone.View.extend();


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
		closeComponent.call(this);
	},
	render: function(atIndex) {
		render.call(this, atIndex);
	},

	renderCollection: function () {
		var args = Array.prototype.slice.call(arguments);
		renderCollection.apply(this, args);
	},
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

},{"./bindEvents":1,"./close":2,"./lifecycleEvents":8,"./lifecycleHooks":9,"./render":10,"./renderCollection":11,"./validateDefinition":14}],8:[function(require,module,exports){
// Fired when the bound model is updated (`this.model`)
exports.afterChange = function (model, options) {};

// Fired when a model is added to the bound collection (`this.collection`)
exports.afterAdd = function (model, collection, options) {};

// Fired when a model is removed from the bound collection (`this.collection`)
exports.afterRemove = function (model, collection, options) {};

// Fired when the bound collection is wiped (`this.collection`)
exports.afterReset = function (collection, options) {};

},{}],9:[function(require,module,exports){
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

},{}],10:[function(require,module,exports){
/**
 * Module dependencies
 */

var DOM = require ('../utils/DOM'),
		renderDataBindings = require('./renderDataBindings'),
		compileTemplate = require('./compileTemplate'),
		renderRegions = require('./renderRegions'),
		bindEvents = require ('./bindEvents');




/**
 * Run HTML template through engine and append results to outlet. Also rerender regions.
 * If atIndex is specified, the component is rendered at the given position within its
 * outlet. Otherwise, the last position is used.
 *
 * @param {Number} atIndex [The index in which to render this element]
 */

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

		// Bind the events on model/collections and global triggered events.
		bindEvents.collectionEvents.call(self);
		bindEvents.modelEvents.call(self);
		bindEvents.globalTriggers.call(self);

		// Unlock rendering mutex
		self._rendering = false;

		if (!self.$outlet) {
			throw new Error(self.id + ' :: Trying to render(), but no $outlet was defined!');
		}

		// Hydrate compiled template
		// (combines the template function with data to return HTML)
		var html = compileTemplate.call(self);
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
		else if (parsedNodes.length > 1 || parsedNodes[0].nodeType === 3) {

			FRAMEWORK.log(self.id + ' :: Wrapping template in <div/>...', parsedNodes);
			el = $('<div/>').append(html);
			el = el[0];
		}

		// (or just a lone region)
		// wrap the html up in a container <div/>
		// else if (
		// 	$(parsedNodes[0]).is('region') ||
		// 	$(parsedNodes[0]).attr('data-region') !== undefined ) {
		// 	// used to wrap this stuff in a div too, but not anymore
		// 	// since it messes w/ HTML things like tables
		// }



		// Set Backbone element (cache and redelegate DOM events)
		// (Will also update self.$el)
		self.setElement(el);



		// Detect and render all regions and their descendent components and regions
		renderRegions.call(self);

		// Insert the element at the proper place amongst the outlet's children
		var neighbors = self.$outlet.children();
		if (_.isFinite(atIndex) && neighbors.length > 0 && neighbors.length > atIndex) {
			neighbors.eq(atIndex).before(self.$el);
		}

		// But if the outlet is empty, or there's no atIndex, just stick it on the end
		else self.$outlet.append(self.$el);


		// Flag with data-template-id attribute
		// (to make template/component boundaries easier to pick out in the inspector)
		self.$el.attr('data-template-id', self.id);




		//
		// If the parent component has route listeners (e.g. #foo)
		// run any of them that match `window.location.hash`.
		// (after rendering the template and regions but BEFORE the `afterRender`
		// lifecycle callback is triggered)
		//
		// not sure if this is a good idea in general-- maybe configurable..?
		// or only if backbone.history isn't ready yet?
		//
		// disabling for now...
		// _.each( Object.keys(self), function (key) {
		// 	var matchedRoute = key.match(new RegExp('/^' +window.location.hash + '/'));
		// 	if (!matchedRoute) return;

		// 	var matchedRouteListener = self[matchedRoute];
		// 	matchedRouteListener();
		// });


		// Finally, trigger afterRender method
		self.afterRender();


		// Run data bindings
		// TODO: don't call this here-- just do when initially inserting the template into the DOM
		// (this is inefficient)
		renderDataBindings.call(self);


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
};

},{"../utils/DOM":33,"./bindEvents":1,"./compileTemplate":3,"./renderDataBindings":12,"./renderRegions":13}],11:[function(require,module,exports){

/**
 * TODO:
 * Try out a different approach for the logic in `renderCollection`
 * below by overloading `region.attach()`.
 *
 * Example usage: (in parent component)
 * ======================================
 * this.someRegion.attach('SomeOtherComponent',{ collection: SomeCollection })
 *
 * -or-
 *
 * this.someRegion.repeat('SomeOtherComponent',{ collection: SomeCollection })
 */

/**
 * renderCollection()
 *
 * Reusable logic to render a collection into a region
 *
 * TODO: move onto Region object instead...  See gist.
 *
 * @param {Object} collection - data source
 * @param {Options} options
 *		: options.itemTemplate {String} - name of template/component to use as item
 *		: options.intoRegion {Object} - the destination region
 */
module.exports = function (collection, options) {

	// Required:
	if (typeof collection !== 'object') throw new Error('renderCollection :: Unknown/invalid collection, "' + (collection && collection.type) + '"');
	if (!options.itemTemplate) throw new Error('renderCollection :: options.itemTemplate required!');
	if (!options.intoRegion) throw new Error('renderCollection :: options.intoRegion required!');


	// Determine collectionName
	var collectionName = collection.type;

	// Target region
	var outlet = options.intoRegion;

	// Sub-component
	var subcomponentName = options.itemTemplate;

	// Name of the collection state attribute that wille be injected into the HTML
	// Used for the default render behavior.
	var bodyStateAttribute = 'data-' + collectionName + '-state';




	/**
	 * Default render methods
	 *
	 * Override default render methods with options if specified
	 */

	// Default render logic for error state (e.g. red text)
	var renderError = options.renderError || function renderError () {
		FRAMEWORK.error('An error occurred while loading ' + collectionName + ' ::\n', collection.error);

		// Set a data attribute on HTML body
		$('body').attr(bodyStateAttribute, 'error');
	};

	// Default render logic for loading state (e.g. spinner)
	var renderSyncing = options.renderSyncing || function renderSyncing() {
		FRAMEWORK.log('Loading ' + collectionName + '...');

		// Set state attribute on HTML body
		$('body').attr(bodyStateAttribute, 'syncing');
	};

	// Default render logic to clean up after a successful sync/load
	var renderSynced = options.renderSynced || function renderSynced() {
		FRAMEWORK.log(collection.length + ' ' + collectionName + ' fetched successfully.');

		// Set state attribute on HTML body
		$('body').attr(bodyStateAttribute, 'ready');
	};

	// Default render logic for items in collection
	var renderReset = options.renderReset || function renderReset() {

		// Clean out the region, wrap in a try/catch to stop the execution
		try {
			outlet.empty();
		} catch (e) {}


		// TODO: Smart merge to minimize DOM queries
		collection.each(function (model) {
			// For each model found, append a subcomponent to the region
			outlet.append(subcomponentName, { model: model });
		});
	};

	/**
	 * renderAdd ( model, [atIndex] )
	 *
	 * @param {Model} model						- the Backbone model that was added
	 * @param {Integer} atIndex				- (optional- defaults to collection.length)
	 *
	 * Default render logic for the case where an item is added to the collection.
	 */
	var renderAdd = options.renderAdd || function renderAdd( model, atIndex ) {
		if ( typeof atIndex === 'number') {
			return outlet.insert(atIndex, subcomponentName, { model: model });
		}
		return outlet.append(subcomponentName, { model: model });
	};

	/**
	 * renderRemove( atIndex )
	 *
	 * @param {Integer} atIndex			- the former index of the Backbone model that was removed
	 *
	 * Default render logic for the case where an item is removed from the collection.
	 */
	var renderRemove = options.renderRemove || function renderRemove( atIndex ) {
		outlet.remove( atIndex );
	};






	/**
	 * Bootstrap
	 *
	 * Renders initial state of collection into our region
	 * using our child template.
	 */

	// If our collection is fetching, render the fetching (loading) state.
	if (collection.syncing) {
		renderSyncing();
	}


	// If our collection failed to fetch (i.e. received a 4xx or 5xx error code)
	// render an error state
	//
	// Handle the case of multiple error states with different styles here as well.
	else if (collection.error) {
		renderError();
	}


	// Otherwise our collection is loaded and ready,
	// so go ahead and render it into the target region.
	//
	// (alternatively at this point, a custom `empty` state may be rendered)
	// console.log('The collection ' + subcomponentName + '---->');
	else renderReset();







	/**
	 * Bind events
	 *
	 * Listen for state changes (syncing, synced, server error, add, remove, sort, etc.)
	 * These manual bindings can be removed when core framework supports render-time collection
	 * bindings.  For now, doing it this way rather than patching the core to test our structural
	 * assumptions.
	 */

	// When a fetch is initiated from the server...
	//
	// (after `Backbone.sync` begins a remote request)
	this.listenTo(collection, 'request', function afterRequest () {
		renderSyncing();
	});

	// When a fetch completes successfully and new data is loaded...
	//
	// (after this component is already instantiated)
	this.listenTo(collection, 'sync', function afterSync () {
		renderSynced();
		renderReset();
	});

	// When server sends a response w/ an error code
	//
	// (after this component is already instantiated)
	this.listenTo(collection, 'error', function afterSyncError (collection, xhr) {

		// Ignore abort "error"
		//
		// Why? because it's not actually an error.
		// Not sure why this triggers Backbone.Collection's `error` event...
		//
		// If two fetches occur on the same collection at the same time,
		// we abort the old XHR request ourselves if it's still running)
		if (xhr && xhr.statusText === 'abort') return;

		renderError();
	});

	// When a model is added...
	//
	// Listen for new models, and insert a child template
	// at the appropriate index within the region.
	this.listenTo(collection, 'add', function afterAdd ( model, collection, options ) {
		renderAdd( model, options.at );
	});

	// When a model is removed...
	//
	// Grab model's relative index within collection and remove
	// the child template at the same index within the region.
	this.listenTo(collection, 'remove', function afterRemove ( model, collection, options ) {
		renderRemove( options.index );
	});



};

},{}],12:[function(require,module,exports){
/**
 * Module dependencies
 */

var dataBindings = {
	text    : require('./dataBindings/text'),
	'class' : require('./dataBindings/class')
};



/**
 * Render model bindings.
 *   + `bind-text`
 *   + more to come
 *
 * Called by Component when its model changes.
 */

module.exports = function renderDataBindings () {
	FRAMEWORK.debug('Rendering data bindings for ', this.id,'component...');

	// Ensure that model exists
	if (!this.model) {
		throw new Error(
			'Trying to bootstrap data bindings for component (' + this.id + '), ' +
			'but it has no model!');
	}
	var model = this.model;

	// jQuery selector for grabbing all elements w/ data bindings
	var bindingSelector = '[bind-text], :matchAttr("^bind-class-*$")';

	// Get elements in this component which have data bindings
	// (ignores contents of regions if they exist)
	var $boundElements = _$selectOuter.call(this, bindingSelector);

	// Loop through each bound attribute of each bound element
	// and call the appropriate render method.
	$boundElements.each(function eachBoundElement () {
		$boundEl = $(this);

		var allAttributes = $boundEl[0].attributes;
		_.each(allAttributes, function (attr) {
			var attrName = attr.nodeName;

			_.each( dataBindings, function eachBindingFormula ( binding ) {
				var matches = attrName.match(binding.regexp);
				if ( matches ) {
					binding.fn($boundEl, model, matches);
				}
			});
		});
	});
};




/**
 * Lookup suitable elements within this component's $el context.
 * Ignore regions, and include the top-level element.
 *
 * @param {String} bindingSelector - DOM selector to use
 *
 * @api private
 */

function _$selectOuter ( bindingSelector ) {

	// Lookup matches
	var $matches = this.$(bindingSelector);

	// If top-level element in template has a data-binding, include it
	if (this.$el.filter(bindingSelector)) {
		$matches = $.merge($matches, this.$el);
	}

	// Omit anything inside a region, since those bindings will have already
	// been taken care of by one of the descendant component(s) within the region.
	//
	// TODO: optimize to exclude these elements from the original DOM selection
	$matches = $matches.not( this.$('region *, [data-region] *') );

	return $matches;
}





//////////////////////////////////////////////////////////////////
///
//                         ||
// TODO: move this thing   \/
//       into `utils` prbly
//

/**
 * Create pseudo-selector for getting wildcard data attributes.
 *
 * Usage:
 * $(":matchAttr('^data-')")
 *
 * Source:
 * http://stackoverflow.com/a/13222509/486547
 *
 * @api private
 */

jQuery.expr.pseudos.matchAttr = $.expr.createPseudo(function(arg) {

    var regexp = new RegExp(arg);
    return function(elem) {
        for(var i = 0; i < elem.attributes.length; i++) {
            var attr = elem.attributes[i];
            if(regexp.test(attr.name)) {
                return true;
            }
        }
        return false;
    };
});

//  /\
//  ||
//
//////////////////////////////////////////////////////////////////















//////////////////////////////////////////
/////////////////////////////////////////////
///                     ||
/// CURRENTLY UNUSED    \/
/////////////////////////////////////////////
//////////////////////////////////////////


// Regexps for detection of wildcard named parameters in custom element attribute names.
// var optionalParam = /\((.*?)\)/g;
// var namedParam = /(\(\?)?:\w+/g;
// var splatParam = /\*\w+/g;
// var escapeRegExp = /[\-{}\[\]+?.,\\\^$|#\s]/g;


// Build selector for superset of these bindings
// var _attrNameToRegExp = function( attrExpression ) {

// 	attrExpression = attrExpression.replace(escapeRegExp, '\\$&')
// 		.replace(optionalParam, '(?:$1)?')
// 		.replace(namedParam, function(match, optional) {
// 			return optional ? match : '([^\/]+)';
// 		})
// 		.replace(splatParam, '(.*?)');
// 	return '^' + attrExpression + '$';
// };
// var _extractParameters = function(regexp, attrName, attrExpression) {
// 	var paramValues = regexp.exec(attrName).slice(1);
// 	var paramKeys = namedParam.exec(attrExpression);

// 	if (!paramKeys || !paramValues) return {};

// 	var namedParameters = {};
// 	console.log('paramValues:',paramValues);
// 	_.each(paramValues, function eachMatchingPiece( param, i ) {
// 		var key = paramKeys[i];
// 		key = key.slice(1); // remove `:` from named param
// 		namedParameters[key] = paramValues[i];
// 	});
// 	return namedParameters;
// };



// /**
//  * Render a single binding
//  */
// var _renderBinding = function ($matchedEl, domAttributeName, model, renderFn, namedParams) {
// 	var rawBinding = $matchedEl.attr( domAttributeName );
// 	// If element doesn't contain the specified DOM attribute...
// 	// fail silently.
// 	if ( !rawBinding ) return;

// 	// console.log('getting ',domAttributeName,'on',$matchedEl);
// 	var modelAttributeName = rawBinding.replace(/^\@/, '');
// 	FRAMEWORK.debug('Found a binding ::', rawBinding, '::', namedParams);

// 	// If model doesn't contain the specified attribute...
// 	if ( typeof model.attributes[modelAttributeName] === 'undefined' ) {

// 		// fail silently.
// 		return;
// 		// FRAMEWORK.warn('Cannot bind `@'+modelAttributeName+' for template/component ' +
// 		// 	'`' + component.id +'`.\n'+
// 		// 	'No such attribute exists in the component\'s model.'
// 		// );
// 	}

// 	// Render a data binding
// 	var bindingVal = model.get(modelAttributeName) || '';
// 	renderFn( $matchedEl, bindingVal, namedParams );
// };


// /**
//  * Render the specified type of data bindings
//  *
//  * @param {Object} options
//  *		@option {Function} renderFn ($el, val, params)	-> function which renders the data binding for the specified element
//  *			@param {JQueryElement} $el
//  *			@param {?} val -> value of bound model attribute
//  *			@param {Object} params -> keyed object of dynamic parameters from the name of the attribute itself
//  *		@option {String} attribute -> name of bound attribute, e.g. 'bind-text'
//  *		@option {Component} component
//  *		@option {Backbone.Model} [model] - defaults to `component.model`
//  */
// var _renderBindings = function ( options ) {
// 	var component = options.component;
// 	var attributeExpression = options.attribute;
// 	var model = options.model || options.component.model;


// 	// Calculate string which can be "new-ed" into a RegExp
// 	var attrRegExpStr = _attrNameToRegExp(attributeExpression);
// 	var attrRegExp = new RegExp(attrRegExpStr);


// 	var boundAttrSelector = ':matchAttr("' + attrRegExpStr + '")';

// 	// Find all relevant descendant elements
// 	var $matches = _get$Matches(boundAttrSelector, component);

// 	// Early exit for simple bindings (w/o bound params)
// 	if ( !attributeExpression.match(/\:/)) {
// 		$matches.each(function () {
// 			_renderBinding($(this), attributeExpression, model, options.renderFn, {});

// 		});
// 		return;
// 	}

// 	console.log('\nRendering parameterized data binding: ',attrRegExp);

// 	// TODO: batch it up so we only do one DOM query
// 	$matches.each(function eachElementWithABinding () {
// 		var $matchedEl = $(this);

// 		// Get all attributes for this $el and filter a set of matching names/params
// 		var allDOMAttrNames = _.map( $matchedEl[0].attributes, function (el) {
// 			return el.nodeName;
// 		});
// 		console.log('allDOMAttrNames for el',allDOMAttrNames, $matchedEl);
// 		var matchingDOMAttrs = {};
// 		_.each( allDOMAttrNames, function eachAttribute ( domAttrName ) {
// 			// console.log('checking',domAttrName);
// 			if ( domAttrName.match(attrRegExp)) {
// 				matchingDOMAttrs[domAttrName] = _extractParameters( attrRegExp, domAttrName, attributeExpression );
// 				// console.log(', got',matchingDOMAttrs[domAttrName], ' (((',domAttrName, attributeExpression);
// 			}
// 		});


// 		console.log(' **** matchingDOMAttrs ::', matchingDOMAttrs);

// 		throw new Error('hwaaa');
// 		_.each(matchingDOMAttrs, function ( namedParams, domAttributeName ) {
// 			_renderBinding($matchedEl, domAttributeName, model, options.renderFn, namedParams);
// 		});

// 	});
// };




},{"./dataBindings/class":4,"./dataBindings/text":5}],13:[function(require,module,exports){
/**
 * Module dependencies
 */
var deleteAllRegions = require('./deleteAllRegions'),
	el2DefaultTemplateID = require('../utils/el2DefaultTemplateID');



/**
 * Instantiate region components and append any default
 * templates/components to the DOM
 */

module.exports = function renderRegions () {
	var self = this;

	deleteAllRegions();

	// TODO: get closest descendant regions, not all descendant regions

	// Detect child regions in template
	var $regions = this.$('region, [data-region]');

	// But also check the top-level element of the component's template itself,
	// in case the top-level element is ITS OWN region
	$regions = $regions.add( this.$el.filter('region, [data-region]') );

	$regions.each(function (i, el) {

		// Detect default component id for child region
		var defaultComponentId = el2DefaultTemplateID(el);

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

		// As long as there are no collisions, also provide access to the region
		// on the top level of the component, e.g. so you can do `this.myRegion`
		// in your component methods.
		if (!self[region.id]) {
			self[region.id] = region;
		}
	});
};


},{"../utils/el2DefaultTemplateID":34,"./deleteAllRegions":6}],14:[function(require,module,exports){
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

},{}],15:[function(require,module,exports){
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

},{}],16:[function(require,module,exports){
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

},{}],17:[function(require,module,exports){
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
var Framework = function(options) {

	// Set the default options for those not passed in.
	options = _.defaults(options || {}, {
		throttleWindowResize: 200,
		logLevel: 'warn',
		frameworkId: 'mast',
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

	/**
	 * Extend FRAMEWORK.Collection to make it better
	 * (specifically, to add error handling)
	 */
	var self = this;
	var originalCollection = this.Collection;
	this.Collection = originalCollection.extend({

		initialize: function (options) {

			// Override `collection.fetch()`
			this._fetch = this.fetch;
			this.fetch = this['_fetch++'];
		},


		/**
		 * afterError
		 *
		 * Lifecycle callback to catch when a fetch error occurs
		 *
		 * TODO:
		 * Probably remove this-- reasoning ::
		 * In most cases, you actually care about the error in
		 * the relevant components who are using this collection,
		 * in which case you'd just bind an error event handler.
		 */
		afterError: function (collection, xhr, options) {
			// this exists for you to override it!
		},




		/**
		 * Override Backbone.Collection's `fetch()`
		 * to allow for better error handling.
		 *
		 * TODO: pull this into Backbone.sync instead..
		 * only problem is clashing with other sync overrides
		 */
		'_fetch++': function (options) {
			var collection = this;

			options = options || {};

			// Log a friendlier "No URL" message:
			if ( !collection.url ) {
				self.error('Cannot fetch() ' + collection.type + ' :: Collection has no URL function/property...');
				return;
			}

			// Override error handler to mixin an 'error' event
			var originalErrorHandler = options.error;
			var originalSuccessHandler = options.success;
			_.extend(options, {
				success: function (collection, xhr, options) {
					var args = Array.prototype.slice.call(arguments);

					// Null out `collection.syncing`
					collection.syncing = null;

					// Trigger original success handler if specified
					// on `fetch({success: function(){/*...*/}})`
					if (originalSuccessHandler) {
						return originalSuccessHandler.apply(collection, args);
					}
				},
				error: function (collection, xhr, options) {
					var args = Array.prototype.slice.call(arguments);

					// Null out `collection.syncing`
					collection.syncing = null;

					// If this is an "abort", ignore it- (state has already been taken care of)
					if ( xhr && xhr.statusText==='abort' ) return;

					// Set `collection.error` using the response from the fetch
					// (try json, then response text, then status code, then just default to `true`)
					collection.error =
						( xhr && xhr.responseJSON ) ? xhr.responseJSON :
						( xhr && xhr.responseText ) ? xhr.responseText :
						true;


					// Call `afterError()`
					collection.afterError.apply(collection,args);

					// Trigger original error handler if specified
					// on `fetch({error: function(){/*...*/}})`
					if (originalErrorHandler) {
						return originalErrorHandler.apply(collection, args);
					}
				}
			});

			// Null out `collection.error`
			collection.error = null;

			// If `fetch` is already in progress, cancel it
			// and fire off a new one.
			if (collection.syncing) {
				self.log('Aborting running `fetch()` in order to start a new `fetch()`...');
				collection.syncing.abort();
			}

			// Call original `fetch()` using our monkey-patched options
			var xhr = collection._fetch(options);

			// Set `collection.syncing` to the XHR object in use
			collection.syncing = xhr;

			// Return the XHR object to maintain original `Backbone.Collection.fetch()` API
			return xhr;
		}

	});


	// Throughout the source code, there are operations on `FRAMEWORK` or code that accesses
	// its attributes. So we make `FRAMEWORK` accessible.
	//
	// Note:
	// `FRAMEWORK` will only be a global variable ** during the build **
	FRAMEWORK = this;


};

// Framework prototype methods.
Framework.prototype.Region = Region;
Framework.prototype.Component = Component;
Framework.prototype.define = define;
Framework.prototype.raise = raise;


// Instantiate Framework instance
var framework = new Framework();

// TODO: future
// Raise immediately, and then all new models / new components / changes
// should be dynamic at runtime.
//
// For now, Mast.raise() is still manual.


// Expose instantiated framework via UMD:
module.exports = framework;

},{"./component/index":7,"./define/index":16,"./raise/index":23,"./region/index":28}],18:[function(require,module,exports){
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

},{"./setup":19}],19:[function(require,module,exports){
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

},{}],20:[function(require,module,exports){
/**
 * Given a component definition and its key, we will build up the component prototype and merge
 * this component with its matching template.
 *
 * @param  {Object} componentDef [Object containing the component definition]
 * @param  {String} componentKey [The component identifier]
 */

var translateShorthand = require('../utils/shorthand');
var objMap = require('../utils/objMap');
var Events = require('../utils/events');

module.exports = function buildComponentPrototype(componentDef, componentKey) {

	// If component id is not explicitly set, use the componentKey
	if (!componentDef.id) {
		componentDef.id = componentKey;
	}

	// Search templates
	var template = FRAMEWORK.templates[componentDef.id];

	// Save reference to template in component prototype
	FRAMEWORK.verbose(componentDef.id + ' :: Pairing component with template...');
	componentDef.template = template;

	// Translate right-hand shorthand for top-level keys
	componentDef = objMap(componentDef, translateShorthand);


	// and events object
	if (componentDef.events) {
		componentDef.events = objMap(
			componentDef.events,
			translateShorthand
		);
	}

	// and afterChange bindings
	if (_.isObject(componentDef.afterChange) && !_.isFunction(componentDef.afterChange)) {
		componentDef.afterChange = objMap(
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

},{"../utils/events":36,"../utils/objMap":37,"../utils/shorthand":38}],21:[function(require,module,exports){
/**
 * Module dependencies
 */

var el2DefaultTemplateID = require('../utils/el2DefaultTemplateID');





/**
 * Collect any TOP-LEVEL regions with the default template/component specified in the HTML
 *
 * Note:
 * This is only run on the original HTML page, not in client-side templates!!!
 * For that, see `lib/component/renderRegions.js`.
 *
 */

module.exports = function collectRegions () {


	// Get top-level regions.
	var $topLevelRegions = $('region, [data-region]').filter(function() {
		return $(this).parents('region, [data-region]').length === 0;
	});


	$topLevelRegions.each(function() {
		var el = this;
		var $el = $(this);

		// Provide backwards compatibility for legacy notation
		// (normalize to `template`)
		var componentId = el2DefaultTemplateID(el);

		// Now instantiate the appropriate default component in each
		// region with a specified template/component
		FRAMEWORK.Region.fromElement(el);
	});

};

},{"../utils/el2DefaultTemplateID":34}],22:[function(require,module,exports){
/**
 * Load any script tags on the page with type="text/template".
 *
 * @return {Object} [Object consisting of a template identifier and its HTML.]
 */

var el2MastID = require('../utils/el2MastID');

module.exports = function collectTemplatesFromScriptTags() {
	var templates = {};

	$('script[type="text/template"]').each(function (i, el) {
		var id = el2MastID(el, true);
		templates[id] = $(el).html();

		// Strip whitespace leftover from script tags
		templates[id] = templates[id].replace(/^\s+/,'');
		templates[id] = templates[id].replace(/\s+$/,'');

		// Remove from DOM
		$(el).remove();
	});

	return templates;
};

},{"../utils/el2MastID":35}],23:[function(require,module,exports){
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
var collectTemplatesFromScriptTags = require('./collectTemplatesFromScriptTags');
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
		_.extend(FRAMEWORK.templates, collectTemplatesFromScriptTags());

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

},{"../define/buildDefinition":15,"../logger/index":18,"../router/index":32,"./buildPrototype":20,"./collectRegions":21,"./collectTemplatesFromScriptTags":22}],24:[function(require,module,exports){
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

},{}],25:[function(require,module,exports){
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

},{}],26:[function(require,module,exports){
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

},{}],27:[function(require,module,exports){
/**
 * Module dependencies
 */
var el2MastID = require('../utils/el2MastID'),
	el2DefaultTemplateID = require('../utils/el2DefaultTemplateID');



/**
 * Factory method to generate a new region instance from a DOM element
 * Also implements `template` and `count` directives, as well as support
 * for embedded templates by checking `el`'s innerHTML.
 *
 * @param {Object} options
 * @returns region instance
 */

module.exports = function fromElement(el, parent) {

	// If parent is not specified, make-believe.
	parent = parent || { id: '*' };

	var $el = $(el);


	// Build region
	var region = new FRAMEWORK.Region({
		id: el2MastID(el),
		$el: $el,
		parent: parent
	});

	// set embedded component to string of component that we want to render in this area.
	var embeddedComponent = region.embeddedComponent;
	if (_.isObject(embeddedComponent)) {
		embeddedComponent = region.embeddedContent;
	}


	// If `template` shortcut is enabled, append specified sub-component(s)
	// to the region automatically. We also make sure that the region doesnt have
	// embedded content. If it does, then dont append it in.
	if ( FRAMEWORK.options.shortcut.template && embeddedComponent && !region.hasContent) {

		// If `count` is set, render sub-component specified number of times.
		// e.g. <region template="Foo" count="3" />
		//
		// (Note that if the `count` shortcut is disabled, `count` is always = 1)
		var count;
		if (FRAMEWORK.options.shortcut.count) {
			count = (typeof $el.attr('count') !== 'undefined') ? $el.attr('count') : 1;
		}

		// Append the subcomponent the appropriate # of times.
		for (var i=0; i < count; i++ ) {
			region.append(embeddedComponent);
		}

		FRAMEWORK.debug(
			parent.id + ' :-: Instantiated new region' +
			( region.id ? ' `' + region.id + '`' : '' ) +
			( embeddedComponent ? ' and populated it with' +
				( count > 1 ? count + ' instances of' : ' 1' ) +
				' `' + embeddedComponent + '`' : ''
			) + '.'
		);
	}

	return region;
};

},{"../utils/el2DefaultTemplateID":34,"../utils/el2MastID":35}],28:[function(require,module,exports){
/**
 * Module dependencies
 */

var insert = require('./insert'),
	remove = require('./remove'),
	empty = require('./empty'),
	append = require('./append'),
	attach = require('./attach'),
	prepend = require('./prepend'),
	fromElement = require('./fromElement'),
	el2DefaultTemplateID = require('../utils/el2DefaultTemplateID'),
	buildComponentPrototype = require('../raise/buildPrototype');


/**
 * FRAMEWORK.Region
 *
 * @param  {Object} properties
 *
 * @constructor
 */

var Region = module.exports = function region(properties) {

	_.extend(this, FRAMEWORK.Events);

	if (!properties) {
		properties = {};
	}
	if (!properties.$el) {
		throw new Error('Trying to instantiate region with no $el!');
	}

	// Fold in properties to prototype
	_.extend(this, properties);

	// If the region has a component/template identifier, (e.g. <region template="Foo" />)
	// we'll use that as the `embeddedComponent`.
	this.embeddedComponent = el2DefaultTemplateID(this.$el[0]);

	// Next, check if the region has any embedded HTML.
	var embeddedTemplate = this.$el.html();



	// Trim whitespace from embedded template in case it was included by accident.
	embeddedTemplate = embeddedTemplate && embeddedTemplate.replace(/^\s+/, '');
	embeddedTemplate = embeddedTemplate && embeddedTemplate.replace(/\s+$/, '');

	// Instantiate an anonymous component for the embedded template.
	if (embeddedTemplate) {

		// Give an flag so we know this region has embedded content.
		this.hasContent = true;

		// Add this template to our collection of framework templates. This will allow us to
		// render this component in the future.
		FRAMEWORK.templates[this.embeddedComponent] = embeddedTemplate;

		// If the Framework has this component registered for this embedded component,
		// then create a prototype of this compnent. This allows having logic for this
		// embedded component in a different component file.
		if (_.has(FRAMEWORK.componentDefs, this.embeddedComponent)) {
			var componentDef = FRAMEWORK.componentDefs[this.embeddedComponent],
					componentKey = this.embeddedComponent;

			buildComponentPrototype(componentDef, componentKey);
		}

		// Wipe the embedded HTML from the DOM.
		// NOTE: this step could be omitted, but leaving it in now for safety.
		this.$el.empty();

		// Extend a component prototype, then instantiate the component,
		// but don't render yet.  It's already rendered, mostly! (except for ITS regions)
		// We'll use this anonymous component instance as our `embeddedComponent` for this
		// region.
		// var templateProperties = {
		// 	template: embeddedTemplate,
		// 	id: this.embeddedComponent
		// };

		// shortcut to get hold of embedded component id.
		this.embeddedContent = this.embeddedComponent;

		// this.embeddedComponent = new (FRAMEWORK.Component.extend(templateProperties))(properties);
		// this.embeddedComponent = new FRAMEWORK.Component(templateProperties);
		// console.log('something');

	}

	// If neither an id nor a `template` was specified,
	// we'll throw an error, since there's no way to get a hold of the region
	if ( !this.id && !this.embeddedComponent ) {

		throw new Error(
			this.parent.id + ' :: A region identifier (e.g. `data-region="foo"`) may ' +
			'only be omitted if a default template is specified, e.g.:\n' +
			'e.g. <region template="SomeComponent"></region>'
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

},{"../raise/buildPrototype":20,"../utils/el2DefaultTemplateID":34,"./append":24,"./attach":25,"./empty":26,"./fromElement":27,"./insert":29,"./prepend":30,"./remove":31}],29:[function(require,module,exports){
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
		throw new Error(err + '\nUsage: insert(atIndex, componentId, [properties])');
	}

	var component;
	// If componentId is a string, look up component prototype and instatiate
	if ('string' == typeof componentId) {

		var componentPrototype = FRAMEWORK.components[componentId];

		if (!componentPrototype) {
			var template = FRAMEWORK.templates[componentId];
			if (!template) {
				throw new Error ('In ' +
					(this.id || 'Anonymous region') + ':: Trying to insert ' +
					componentId + ', but no template exists with that id.');
			}

			// If no component prototype exists for the template
			// with the specififed id, create a stub one on the fly.
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

	// Check to see if the model was already defined. If it is, use that model. If not, assign it
	// the parents model if it has one, or assign it a new backbone instance.
	if (!component.model) {
		component.model = this.parent.model ? this.parent.model : new Backbone.Model();
	}

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

},{}],30:[function(require,module,exports){
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

},{}],31:[function(require,module,exports){
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

},{}],32:[function(require,module,exports){
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

},{}],33:[function(require,module,exports){
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

},{"./events":36}],34:[function(require,module,exports){
/**
 * Inspect a DOM element and see if it has a default component/template ID.
 * Provides backwards-compatibility layer, and normalizes the syntax in the DOM.
 *
 * @param  {DOMElement} el
 * @return {String}    [the id of the default component/template, if one was specified]
 */
module.exports = function (el) {

	// Provide backwards compatibility for
	// `default`, `contents` and `template` notation
	var componentId = $(el).attr('template') || $(el).attr('default') || $(el).attr('contents');

	// Normalize to `template` attribute in the DOM.
	$(el).attr('template', componentId);

	return componentId;
};

},{}],35:[function(require,module,exports){
/**
 * Grabs the Mast identifier from an HTML element.
 * Supports `id`, `data-id`, or `data-region`
 *
 * @param  {DOMElement} el    [the DOM element to inspect]
 * @param  {Boolean} required [whether an identifier is required]
 *
 * @return {String}           [identifier]
 */

module.exports = function el2MastID (el, required) {

	var id = $(el).attr('id');
	var dataId = $(el).attr('data-id') || $(el).attr('data-region');
	var contentsId = $(el).attr('contents');

	if (id && dataId) {
		throw new Error(id + ' :: Cannot set both `id` and `data-id`!  Please use one or the other.  (data-id is safest)');
	}
	if (required && !id && !dataId) {
		throw new Error('No id specified in element where it is required:\n' + el);
	}

	return id || dataId || contentsId;
};

},{}],36:[function(require,module,exports){
/**
 * Utility Event toolkit
 */

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

},{}],37:[function(require,module,exports){
/**
 * Map an object's values, and return a valid object (this function is handy because
 * underscore.map() returns a list, not an object.)
 *
 * @param {Object} obj            [Object whos values you want to map]
 * @param  {Function} transformFn [Function to transform each object value by]
 *
 * @return {Object}                [New object with the values mapped]
 */

module.exports = function objMap(obj, transformFn) {
	return _.object(_.keys(obj), _.map(obj, transformFn));
};


},{}],38:[function(require,module,exports){
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

	// Also ignore `template`
	// TODO: use a different key later
	if (key === 'template') return value;

	// Also ignore things that start with _
	if (key.match(/^_/)) return value;


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
	else if (
		((matches = value.match(/^([^.\s]+)\s*<\-\s*(.*[^.\s])/)) && matches[1] && matches[2]) ||
		((matches = value.match(/^([^.\s]+)\s*\->\s*(.*[^.\s])/)) && matches[1] && matches[2] &&
			(matches['tmp'] = matches[1]) && (matches[1] = matches[2]) && (matches[2] = matches['tmp']))
	) {
		fn = function attachTemplate() {

			// Remove all whitespace from matches
			matches[1] = matches[1].replace(/(\s+)/g, '');
			matches[2] = matches[2].replace(/(\s+)/g, '');

			var region = matches[1];
			var template = matches[2];
			FRAMEWORK.verbose(this.id + ' :: Attaching `' + template + '` to `' + region + '`...');


			if (!this[region]) {
				FRAMEWORK.error(this.id,':: Trying to attach region with shorthand ('+value+'), but could not find region `'+region+'`');
				return;
			}
			this[region].attach(template);
		};
	}


	// Method to toggle (!) the specified model attr
	else if ((matches = value.match(/^\!\s*\@(.*[^.\s])/)) && matches[1]) {
		fn = function toggleAttr() {
			FRAMEWORK.verbose(this.id + ' :: Toggling attr (' + matches[1] + ')...');
			var oldAttrValue = this.model.get( matches[1] );

			if (oldAttrValue) {
				this.model.set( matches[1], false );
			}
			else {
				this.model.set( matches[1], true );
			}
		};
	}

	// Method to change the specified model attr
	else if ((matches = value.match(/^\s*\@([^=]+)=([^=]*)\s*$/))) {

		var attrName = matches[1];
		var newAttrValue = matches[2];

		fn = function changeAttr() {
			this.model.set(attrName, newAttrValue);
		};
	}

	// Method to remove the model for the current component
	else if ((matches = value.match(/^\s*\-\s*$/))) {
		fn = function removeModel () {

			// Only works if model belongs to a collection
			if (!this.model.collection) return;

			this.model.collection.remove(this.model);
		};
	}


	// deprecating class manipulation shorthand
	// (no need to do dom manipulation unless absolutely necessary)

	// // Method to add the specified class
	// else if ((matches = value.match(/^\+\s*\.(.*[^.\s])/)) && matches[1]) {
	// 	fn = function addClass() {
	// 		FRAMEWORK.verbose(this.id + ' :: Adding class (' + matches[1] + ')...');
	// 		this.$el.addClass(matches[1]);
	// 	};
	// }
	// // Method to remove the specified class
	// else if ((matches = value.match(/^\-\s*\.(.*[^.\s])/)) && matches[1]) {
	// 	fn = function removeClass() {
	// 		FRAMEWORK.verbose(this.id + ' :: Removing class (' + matches[1] + ')...');
	// 		this.$el.removeClass(matches[1]);
	// 	};
	// }
	// // Method to toggle the specified class
	// else if ((matches = value.match(/^\!\s*\.(.*[^.\s])/)) && matches[1]) {
	// 	fn = function toggleClass() {
	// 		FRAMEWORK.verbose(this.id + ' :: Toggling class (' + matches[1] + ')...');
	// 		this.$el.toggleClass(matches[1]);
	// 	};
	// }

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

},{}]},{},[17])
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L2JpbmRFdmVudHMuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L2Nsb3NlLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2NvbXBvbmVudC9jb21waWxlVGVtcGxhdGUuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L2RhdGFCaW5kaW5ncy9jbGFzcy5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9jb21wb25lbnQvZGF0YUJpbmRpbmdzL3RleHQuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L2RlbGV0ZUFsbFJlZ2lvbnMuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L2luZGV4LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2NvbXBvbmVudC9saWZlY3ljbGVFdmVudHMuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L2xpZmVjeWNsZUhvb2tzLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2NvbXBvbmVudC9yZW5kZXIuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L3JlbmRlckNvbGxlY3Rpb24uanMiLCIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L3JlbmRlckRhdGFCaW5kaW5ncy5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9jb21wb25lbnQvcmVuZGVyUmVnaW9ucy5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9jb21wb25lbnQvdmFsaWRhdGVEZWZpbml0aW9uLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2RlZmluZS9idWlsZERlZmluaXRpb24uanMiLCIvY29kZS9vc3MvbWFzdC9saWIvZGVmaW5lL2luZGV4LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2luZGV4LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2xvZ2dlci9pbmRleC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9sb2dnZXIvc2V0dXAuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvcmFpc2UvYnVpbGRQcm90b3R5cGUuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvcmFpc2UvY29sbGVjdFJlZ2lvbnMuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvcmFpc2UvY29sbGVjdFRlbXBsYXRlc0Zyb21TY3JpcHRUYWdzLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3JhaXNlL2luZGV4LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3JlZ2lvbi9hcHBlbmQuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvcmVnaW9uL2F0dGFjaC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9yZWdpb24vZW1wdHkuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvcmVnaW9uL2Zyb21FbGVtZW50LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3JlZ2lvbi9pbmRleC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9yZWdpb24vaW5zZXJ0LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3JlZ2lvbi9wcmVwZW5kLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3JlZ2lvbi9yZW1vdmUuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvcm91dGVyL2luZGV4LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3V0aWxzL0RPTS5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi91dGlscy9lbDJEZWZhdWx0VGVtcGxhdGVJRC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi91dGlscy9lbDJNYXN0SUQuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvdXRpbHMvZXZlbnRzLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3V0aWxzL29iak1hcC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi91dGlscy9zaG9ydGhhbmQuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNYQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNYQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6TEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9SQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNYQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzXG4gKi9cbnZhciByZW5kZXJEYXRhQmluZGluZ3MgPSByZXF1aXJlKCcuL3JlbmRlckRhdGFCaW5kaW5ncycpO1xuXG5cbi8qKlxuICogQmluZCBjb2xsZWN0aW9uIGV2ZW50cyB0byBsaWZlY3ljbGUgZXZlbnQgaGFuZGxlcnNcbiAqL1xuZXhwb3J0cy5jb2xsZWN0aW9uRXZlbnRzID0gZnVuY3Rpb24oKSB7XG5cdC8vIEJpbmQgdG8gY29sbGVjdGlvbiBldmVudHMgaWYgb25lIHdhcyBwYXNzZWQgaW5cblx0aWYgKHRoaXMuY29sbGVjdGlvbikge1xuXG5cdFx0Ly8gTGlzdGVuIHRvIGV2ZW50c1xuXHRcdHRoaXMubGlzdGVuVG8odGhpcy5jb2xsZWN0aW9uLCAnYWRkJywgdGhpcy5hZnRlckFkZCk7XG5cdFx0dGhpcy5saXN0ZW5Ubyh0aGlzLmNvbGxlY3Rpb24sICdyZW1vdmUnLCB0aGlzLmFmdGVyUmVtb3ZlKTtcblx0XHR0aGlzLmxpc3RlblRvKHRoaXMuY29sbGVjdGlvbiwgJ3Jlc2V0JywgdGhpcy5hZnRlclJlc2V0KTtcblx0fVxufTtcblxuLyoqXG4gKiBCaW5kIG1vZGVsIGV2ZW50cyB0byBsaWZlY3ljbGUgZXZlbnQgaGFuZGxlcnMgYW5kIGFsc28gYWxsb3dzIGZvciBoYW5kbGVycyB0byBmaXJlXG4gKiBvbiBjZXJ0YWluIG1vZGVsIGF0dHJpYnV0ZSBjaGFuZ2VzLlxuICovXG5leHBvcnRzLm1vZGVsRXZlbnRzID0gZnVuY3Rpb24oKSB7XG5cdHZhciBzZWxmID0gdGhpcztcblxuXHRpZiAodGhpcy5tb2RlbCkge1xuXG5cdFx0Ly8gTGlzdGVuIGZvciBhbnkgYXR0cmlidXRlIGNoYW5nZXNcblx0XHQvLyBlLmcuXG5cdFx0Ly8gLmFmdGVyQ2hhbmdlKG1vZGVsLCBvcHRpb25zKVxuXHRcdC8vXG5cdFx0dGhpcy5saXN0ZW5Ubyh0aGlzLm1vZGVsLCAnY2hhbmdlJywgZnVuY3Rpb24gbW9kZWxDaGFuZ2VkIChtb2RlbCwgb3B0aW9ucykge1xuXG5cdFx0XHQvLyBSZW5kZXIgZGF0YSBiaW5kaW5nc1xuXHRcdFx0cmVuZGVyRGF0YUJpbmRpbmdzLmNhbGwoc2VsZik7XG5cblx0XHRcdC8vIFJ1biBjdXN0b20gYGFmdGVyQ2hhbmdlYCgpIG1ldGhvZFxuXHRcdFx0aWYgKF8uaXNGdW5jdGlvbih0aGlzLmFmdGVyQ2hhbmdlKSkge1xuXHRcdFx0XHR0aGlzLmFmdGVyQ2hhbmdlKG1vZGVsLCBvcHRpb25zKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIExpc3RlbiBmb3Igc3BlY2lmaWMgYXR0cmlidXRlIGNoYW5nZXNcblx0XHQvLyBlLmcuXG5cdFx0Ly8gLmFmdGVyQ2hhbmdlLmNvbG9yKG1vZGVsLCB2YWx1ZSwgb3B0aW9ucylcblx0XHRpZiAoXy5pc09iamVjdCh0aGlzLmFmdGVyQ2hhbmdlKSkge1xuXHRcdFx0Xy5lYWNoKHRoaXMuYWZ0ZXJDaGFuZ2UsIGZ1bmN0aW9uIChoYW5kbGVyLCBhdHRyTmFtZSkge1xuXG5cdFx0XHRcdC8vIENhbGwgaGFuZGxlciB3aXRoIG5ld1ZhbCB0byBrZWVwIGFyZ3VtZW50cyBzdHJhaWdodGZvcndhcmRcblx0XHRcdFx0dGhpcy5saXN0ZW5Ubyh0aGlzLm1vZGVsLCAnY2hhbmdlOicgKyBhdHRyTmFtZSwgZnVuY3Rpb24gYXR0ckNoYW5nZWQgKG1vZGVsLCBuZXdWYWwpIHtcblx0XHRcdFx0XHRoYW5kbGVyLmNhbGwodGhpcywgbmV3VmFsKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdH0sIHRoaXMpO1xuXHRcdH1cblx0fVxufTtcblxuLyoqXG4gKiBMaXN0ZW5zIGZvciBhbmQgcnVucyBoYW5kbGVycyBvbiBnbG9iYWwgZXZlbnRzIHRoYXQgYXJlIGxpc3RlbmVkIGZvciBvbiBhIGNvbXBvbmVudC5cbiAqL1xuZXhwb3J0cy5nbG9iYWxUcmlnZ2VycyA9IGZ1bmN0aW9uKCkge1xuXG5cdHZhciBzZWxmID0gdGhpcztcblxuXHR0aGlzLmxpc3RlblRvKEZSQU1FV09SSywgJ2FsbCcsIGZ1bmN0aW9uIChlUm91dGUpIHtcblxuXHRcdC8vIFRyaW0gb2ZmIGFsbCBidXQgdGhlIGZpcnN0IGFyZ3VtZW50IHRvIHBhc3MgdGhyb3VnaCB0byBoYW5kbGVyXG5cdFx0dmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuXHRcdGFyZ3Muc2hpZnQoKTtcblxuXHRcdC8vIEl0ZXJhdGUgdGhyb3VnaCBlYWNoIHN1YnNjcmlwdGlvbiBvbiB0aGlzIGNvbXBvbmVudFxuXHRcdC8vIGFuZCBsaXN0ZW4gZm9yIHRoZSBzcGVjaWZpZWQgZ2xvYmFsIGV2ZW50c1xuXHRcdF8uZWFjaChzZWxmLnN1YnNjcmlwdGlvbnMsIGZ1bmN0aW9uKGhhbmRsZXIsIG1hdGNoUGF0dGVybikge1xuXG5cdFx0XHQvLyBHcmFiIHJlZ2V4IGFuZCBwYXJhbSBwYXJzaW5nIGxvZ2ljIGZyb20gQmFja2JvbmUgY29yZVxuXHRcdFx0dmFyIGV4dHJhY3RQYXJhbXMgPSBCYWNrYm9uZS5Sb3V0ZXIucHJvdG90eXBlLl9leHRyYWN0UGFyYW1ldGVycyxcblx0XHRcdFx0Y2FsY3VsYXRlUmVnZXggPSBCYWNrYm9uZS5Sb3V0ZXIucHJvdG90eXBlLl9yb3V0ZVRvUmVnRXhwO1xuXG5cdFx0XHQvLyBUcmltIHRyYWlsaW5nXG5cdFx0XHRtYXRjaFBhdHRlcm4gPSBtYXRjaFBhdHRlcm4ucmVwbGFjZSgvXFwvKiQvZywgJycpO1xuXHRcdFx0Ly8gYW5kIGVyIHNvcnQgb2YuLiBsZWFkaW5nLi4gc2xhc2hlc1xuXHRcdFx0bWF0Y2hQYXR0ZXJuID0gbWF0Y2hQYXR0ZXJuLnJlcGxhY2UoL14oWyN+JV0pXFwvKi9nLCAnJDEnKTtcblx0XHRcdC8vIFRPRE86IG9wdGltaXphdGlvbi0gdGhpcyByZWFsbHkgb25seSBoYXMgdG8gYmUgZG9uZSBvbmNlLCBvbiByYWlzZSgpLCB3ZSBzaG91bGQgZG8gdGhhdFxuXG5cblx0XHRcdC8vIENvbWUgdXAgd2l0aCByZWdleCBmb3IgdGhpcyBtYXRjaFBhdHRlcm5cblx0XHRcdHZhciByZWdleCA9IGNhbGN1bGF0ZVJlZ2V4KG1hdGNoUGF0dGVybik7XG5cblx0XHRcdC8vIElmIHRoaXMgbWF0Y2hQYXRlcm4gaXMgdGhpcyBpcyBub3QgYSBtYXRjaCBmb3IgdGhlIGV2ZW50LFxuXHRcdFx0Ly8gYGNvbnRpbnVlYCBpdCBhbG9uZyB0byBpdCBjYW4gdHJ5IHRoZSBuZXh0IG1hdGNoUGF0dGVyblxuXHRcdFx0aWYgKCFlUm91dGUubWF0Y2gocmVnZXgpKSByZXR1cm47XG5cblx0XHRcdC8vIFBhcnNlIHBhcmFtZXRlcnMgZm9yIHVzZSBhcyBhcmdzIHRvIHRoZSBoYW5kbGVyXG5cdFx0XHQvLyAob3IgYW4gZW1wdHkgbGlzdCBpZiBub25lIGV4aXN0KVxuXHRcdFx0dmFyIHBhcmFtcyA9IGV4dHJhY3RQYXJhbXMocmVnZXgsIGVSb3V0ZSk7XG5cblx0XHRcdC8vIEhhbmRsZSBzdHJpbmcgcmVkaXJlY3RzIHRvIGZ1bmN0aW9uIG5hbWVzXG5cdFx0XHRpZiAoIV8uaXNGdW5jdGlvbihoYW5kbGVyKSkge1xuXHRcdFx0XHRoYW5kbGVyID0gc2VsZltoYW5kbGVyXTtcblxuXHRcdFx0XHRpZiAoIWhhbmRsZXIpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCB0cmlnZ2VyIHN1YnNjcmlwdGlvbiBiZWNhdXNlIG9mIHVua25vd24gaGFuZGxlcjogJyArIGhhbmRsZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIEJpbmQgY29udGV4dCBhbmQgYXJndW1lbnRzIHRvIHN1YnNjcmlwdGlvbiBoYW5kbGVyXG5cdFx0XHRoYW5kbGVyLmFwcGx5KHNlbGYsIF8udW5pb24oYXJncywgcGFyYW1zKSk7XG5cblx0XHR9KTtcblx0fSk7XG59O1xuIiwiLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzXG4gKi9cblxudmFyIGRlbGV0ZUFsbFJlZ2lvbnMgPSByZXF1aXJlKCcuL2RlbGV0ZUFsbFJlZ2lvbnMnKTtcblxuXG5cblxuLyoqXG4gKiBGUkFNRVdPUksuQ29tcG9uZW50LnByb3RvdHlwZS5jbG9zZVxuICpcbiAqIFNhZmVseSB6YXAgZXZlcnkgdHJhY2UgYWJvdXQgdGhpcyBjb21wb25lbnQgZnJvbSBtZW1vcnkuXG4gKlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY2xvc2UgKCkge1xuXG5cdEZSQU1FV09SSy5kZWJ1ZygnQ2xvc2VkICcgKyB0aGlzLmlkICsgJyBjb21wb25lbnQuJyk7XG5cdHZhciBzZWxmID0gdGhpcztcblxuXHQvLyBDYW5jZWwgY3VycmVudCByZW5kZXIgYW5kIGNsb3NlIGpvYnMsIGlmIHRoZXkncmUgcnVubmluZ1xuXHRpZiAodGhpcy5fcmVuZGVyaW5nKSB7XG5cdFx0c2VsZi5fcmVuZGVyaW5nQ2FuY2VsZWQgPSB0cnVlO1xuXHRcdHRoaXMuY2FuY2VsUmVuZGVyKCk7XG5cdFx0c2VsZi5fcmVuZGVyaW5nID0gZmFsc2U7XG5cdH1cblx0aWYgKHRoaXMuX2Nsb3NpbmcpIHtcblx0XHR0aGlzLmNhbmNlbENsb3NlKCk7XG5cdFx0c2VsZi5fY2xvc2luZyA9IGZhbHNlO1xuXHR9XG5cblx0Ly8gTG9jayBhY2Nlc3MgdG8gY2xvc2UoKVxuXHR0aGlzLl9jbG9zaW5nID0gdHJ1ZTtcblxuXHR0aGlzLmJlZm9yZUNsb3NlKGZ1bmN0aW9uICgpIHtcblxuXHRcdC8vID4gTk9URTogYHRoaXMuX2Nsb3Npbmc9ZmFsc2VgIGNhbiBhbmQgcHJvYmFibHkgc2hvdWxkIGJlIHJlbW92ZWQsXG5cdFx0Ly8gPiBzaW5jZSBtdXRleCBpcyB1bm5lY2Vzc2FyeSBub3cgdGhhdCB0aGUgY29tcG9uZW50IGlzIHVwIGZvciBnYXJiYWdlIGNvbGxlY3Rpb25cblx0XHQvLyA+IFdhaXRpbmcgdG8gZG8gdGhpcyB1bnRpbCBpdCBjYW4gYmUgdGVzdGVkIGZ1cnRoZXJcblxuXHRcdC8vIFVubG9jayBjbG9zZSgpXG5cdFx0c2VsZi5fY2xvc2luZyA9IGZhbHNlO1xuXG5cdFx0Ly8gU3RvcCBsaXN0ZW5pbmcgdG8gYWxsIGdsb2JhbCB0cmlnZ2VycyAoJXwjKVxuXG5cdFx0Ly8gQ2xvc2UgYWxsIGNoaWxkIGNvbXBvbmVudHNcblx0XHRkZWxldGVBbGxSZWdpb25zLmNhbGwoc2VsZik7XG5cblx0XHQvLyBDYWxsIG5hdGl2ZSBgQmFja2JvbmUuVmlldy5wcm90b3R5cGUucmVtb3ZlKClgXG5cdFx0Ly8gdG8gdW5kZWxlZ2F0ZSBldmVudHMsIGV0Yy5cblx0XHRzZWxmLnJlbW92ZSgpO1xuXG5cdH0pO1xufTtcbiIsIi8qKlxuICogQ29udmVydCB0ZW1wbGF0ZSBIVE1MIGFuZCBkYXRhIGludG8gYSBjb21waWxlZCAkdGVtcGxhdGVcbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjb21waWxlVGVtcGxhdGUgKCkge1xuXG5cdC8vIENyZWF0ZSB0ZW1wbGF0ZSBkYXRhIGNvbnRleHQgYnkgcHJvdmlkaW5nIGFjY2VzcyB0byB0aGUgZ2xvYmFsIERhdGEgb2JqZWN0LFxuXHQvLyBBbHNvIGZvbGQgaW4gdGhlIG1vZGVsIGFzc29jaWF0ZWQgd2l0aCB0aGlzIGNvbXBvbmVudCwgaWYgdGhlcmUgaXMgb25lXG5cdHZhciB0ZW1wbGF0ZUNvbnRleHQgPSBfLmV4dGVuZCh7XG5cblx0XHQvLyBBbGxvd3MgeW91IHRvIGdldCBhIGhvbGQgb2YgZGF0YSxcblx0XHQvLyBidXQgdXNlIGEgZGVmYXVsdCB2YWx1ZSBpZiBpdCBkb2Vzbid0IGV4aXN0XG5cdFx0Z2V0OiBmdW5jdGlvbiAoa2V5LCBkZWZhdWx0VmFsKSB7XG5cdFx0XHR2YXIgdmFsID0gdGVtcGxhdGVDb250ZXh0W2tleV07XG5cdFx0XHRpZiAodHlwZW9mIHZhbCA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdFx0dmFsID0gZGVmYXVsdFZhbDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB2YWw7XG5cdFx0fVxuXHR9LFxuXG5cdC8vIEFsbCBGUkFNRVdPUksuZGF0YSBpcyBhdmFpbGFibGUgaW4gZXZlcnkgdGVtcGxhdGVcblx0RlJBTUVXT1JLLmRhdGEpO1xuXG5cdC8vIElmIGEgbW9kZWwgaXMgcHJvdmlkZWQgZm9yIHRoaXMgY29tcG9uZW50LCBtYWtlIGl0IGF2YWlsYWJsZSBpbiB0aGlzIHRlbXBsYXRlXG5cdGlmICh0aGlzLm1vZGVsKSB7XG5cdFx0Xy5leHRlbmQodGVtcGxhdGVDb250ZXh0LCB0aGlzLm1vZGVsLmF0dHJpYnV0ZXMpO1xuXHR9XG5cblx0Ly8gVGVtcGxhdGUgdGhlIEhUTUwgd2l0aCB0aGUgZGF0YVxuXHR2YXIgaHRtbDtcblx0dHJ5IHtcblx0XHQvLyBBY2NlcHQgcHJlY29tcGlsZWQgdGVtcGxhdGVzXG5cdFx0aWYgKF8uaXNGdW5jdGlvbih0aGlzLnRlbXBsYXRlKSkge1xuXHRcdFx0aHRtbCA9IHRoaXMudGVtcGxhdGUodGVtcGxhdGVDb250ZXh0KTtcblx0XHR9XG5cdFx0Ly8gT3IgcmF3IHN0cmluZ3Ncblx0XHRlbHNlIGh0bWwgPSBfLnRlbXBsYXRlKHRoaXMudGVtcGxhdGUsIHRlbXBsYXRlQ29udGV4dCk7XG5cdH1cblx0Y2F0Y2ggKGUpIHtcblx0XHR2YXIgc3RyID0gZSxcblx0XHRcdHN0YWNrID0gJyc7XG5cblx0XHRpZiAoZSBpbnN0YW5jZW9mIEVycm9yKSB7XG5cdFx0XHRzdHIgPSAgZS50b1N0cmluZygpO1xuXHRcdFx0c3RhY2sgPSBlLnN0YWNrO1xuXHRcdH1cblxuXHRcdC8vIE5PVEU6IFRoaXMgZXJyb3IgaXMgbm8gbG9uZ2VyIGEgdmFsaWQgZXJyb3IuXG5cdFx0Ly8gRlJBTUVXT1JLLmVycm9yKHRoaXMuaWQgKyAnIDo6IENhbm5vdCByZW5kZXIoKSB0ZW1wbGF0ZSAocHJvYmFibHkgbWlzc2luZyBkYXRhKS5cXG5cXG5Hb3QgdGhpcyBlcnJvciA6Olxcbicrc3RyLCdcXG4nKTtcblx0XHRpZiAoaHRtbCkge0ZSQU1FV09SSy52ZXJib3NlKCdUZW1wbGF0ZSA6OiAnICsgaHRtbCk7fVxuXHRcdEZSQU1FV09SSy52ZXJib3NlKCdGdWxsIFRlbXBsYXRlIEVycm9yOicgKyAnXFxuJyxzdGFjayk7XG5cdFx0RlJBTUVXT1JLLnZlcmJvc2UoJ1xcblxcbk1vcmUgaW5mb3JtYXRpb246JywgJ1xcblxcblRlbXBsYXRlIGNvbnRleHQgOjonLHRlbXBsYXRlQ29udGV4dCwgJ1xcblxcbnRoaXMubW9kZWw6OicsIHRoaXMubW9kZWwpO1xuXHRcdGh0bWwgPSBfLmlzU3RyaW5nKHRoaXMudGVtcGxhdGUpID8gdGhpcy50ZW1wbGF0ZSA6IHN0cjtcblx0fVxuXG5cdHJldHVybiBodG1sO1xufTtcblxuXG4iLCIvKipcbiAqIGBjbGFzc2AgZGF0YSBiaW5kaW5nXG4gKiBAdHlwZSB7T2JqZWN0fVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IHtcblx0cmVnZXhwOiAvYmluZFxcLWNsYXNzXFwtKFteLV0rKS8sXG5cdGZuOiBmdW5jdGlvbiAoJGVsLCBtb2RlbCwgbWF0Y2hlcykge1xuXHRcdC8vIFJlZ2V4cCBtYXRjaGVzIGZvciB3aWxkY2FyZCBwYXJhbXMgaW4gYXR0cmlidXRlIG1hdGNoIGV4cHJlc3Npb25cblx0XHR2YXIgY2xhc3NOYW1lID0gbWF0Y2hlc1sxXTtcblxuXHRcdHZhciByYXcgPSAkYm91bmRFbC5hdHRyKCdiaW5kLWNsYXNzLScgKyBjbGFzc05hbWUpO1xuXHRcdHZhciBjbGVhbiA9IHJhdy5yZXBsYWNlKC9eQC8sICcnKTtcblx0XHRpZiAoIG1vZGVsLmdldChjbGVhbikgKSB7XG5cdFx0XHQkYm91bmRFbC5hZGRDbGFzcyhjbGFzc05hbWUpO1xuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdCRib3VuZEVsLnJlbW92ZUNsYXNzKGNsYXNzTmFtZSk7XG5cdFx0fVxuXHR9XG59O1xuXG4iLCIvKipcbiAqIGB0ZXh0YCBkYXRhIGJpbmRpbmdcbiAqIEB0eXBlIHtPYmplY3R9XG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSB7XG5cdHJlZ2V4cDogL2JpbmQtdGV4dC8sXG5cdGZuOiBmdW5jdGlvbiAoJGVsLCBtb2RlbCkge1xuXHRcdHZhciByYXcgPSAkYm91bmRFbC5hdHRyKCdiaW5kLXRleHQnKTtcblx0XHR2YXIgY2xlYW4gPSByYXcucmVwbGFjZSgvXkAvLCAnJyk7XG5cdFx0JGJvdW5kRWwudGV4dCggbW9kZWwuZ2V0KGNsZWFuKSApO1xuXHR9XG59O1xuIiwiLyoqXG4gKiBJZiBhbnkgcmVnaW9ucyBleGlzdCBpbiB0aGlzIGNvbXBvbmVudCxcbiAqIGVtcHR5IHRoZW0sIGFuZCB0aGVuIGRlbGV0ZSB0aGVtXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBkZWxldGVBbGxSZWdpb25zICgpIHtcblx0Xy5lYWNoKHRoaXMucmVnaW9ucywgZnVuY3Rpb24gKHJlZ2lvbiwga2V5KSB7XG5cdFx0cmVnaW9uLmVtcHR5KCk7XG5cdFx0ZGVsZXRlIHRoaXMucmVnaW9uc1trZXldO1xuXHR9LCB0aGlzKTtcbn07XG4iLCIvKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXNcbiAqL1xuXG52YXIgbGlmZWN5Y2xlSG9va3MgICAgID0gcmVxdWlyZSgnLi9saWZlY3ljbGVIb29rcycpLFxuXHRsaWZlY3ljbGVFdmVudHMgICAgPSByZXF1aXJlKCcuL2xpZmVjeWNsZUV2ZW50cycpLFxuXHRiaW5kRXZlbnRzICAgICAgICAgPSByZXF1aXJlKCcuL2JpbmRFdmVudHMnKSxcblx0Y2xvc2VDb21wb25lbnQgICAgID0gcmVxdWlyZSgnLi9jbG9zZScpLFxuXHRyZW5kZXIgICAgICAgICAgICAgPSByZXF1aXJlKCcuL3JlbmRlcicpLFxuXHRyZW5kZXJDb2xsZWN0aW9uICAgPSByZXF1aXJlKCcuL3JlbmRlckNvbGxlY3Rpb24nKSxcblx0dmFsaWRhdGVEZWZpbml0aW9uID0gcmVxdWlyZSgnLi92YWxpZGF0ZURlZmluaXRpb24nKTtcblxuXG4vKipcbiAqIEZSQU1FV09SSy5Db21wb25lbnRcbiAqXG4gKiBDb21wb25lbnQgaXMgYW4gZXh0ZW5kZWQgYEJhY2tib25lLlZpZXdgLiBJdCBhZGQgZmVhdHVyZXMgc3VjaCBhcyBhdXRvbWF0aWMgZXZlbnQgYmluZGluZyxcbiAqIHJlbmRlcmluZywgbGlmZWN5Y2xlIGhvb2tzIGFuZCBldmVudHMsIGFuZCBtb3JlLlxuICpcbiAqIEBjb25zdHJ1Y3RvclxuICovXG52YXIgQ29tcG9uZW50ID0gbW9kdWxlLmV4cG9ydHMgPSBCYWNrYm9uZS5WaWV3LmV4dGVuZCgpO1xuXG5cbl8uZXh0ZW5kKENvbXBvbmVudC5wcm90b3R5cGUsIHtcblxuXHQvLyBMaWZlY3ljbGUgSG9va3Ncblx0YmVmb3JlUmVuZGVyOiBmdW5jdGlvbihjYikge1xuXHRcdGxpZmVjeWNsZUhvb2tzLmJlZm9yZVJlbmRlci5jYWxsKHRoaXMsIGNiKTtcblx0fSxcblx0YmVmb3JlQ2xvc2U6IGZ1bmN0aW9uKGNiKSB7XG5cdFx0bGlmZWN5Y2xlSG9va3MuYmVmb3JlQ2xvc2UuY2FsbCh0aGlzLCBjYik7XG5cdH0sXG5cdGFmdGVyUmVuZGVyOiBmdW5jdGlvbigpIHtcblx0XHRsaWZlY3ljbGVIb29rcy5hZnRlclJlbmRlci5jYWxsKHRoaXMpO1xuXHR9LFxuXHRjYW5jZWxSZW5kZXI6IGZ1bmN0aW9uKCkge1xuXHRcdGxpZmVjeWNsZUhvb2tzLmNhbmNlbFJlbmRlci5jYWxsKHRoaXMpO1xuXHR9LFxuXHRjYW5jZWxDbG9zZTogZnVuY3Rpb24oKSB7XG5cdFx0bGlmZWN5Y2xlSG9va3MuY2FuY2VsQ2xvc2UuY2FsbCh0aGlzKTtcblx0fSxcblxuXHQvLyBMaWZlY3ljbGUgRXZlbnRzXG5cdGFmdGVyQ2hhbmdlOiBmdW5jdGlvbihtb2RlbCwgb3B0aW9ucykge1xuXHRcdGxpZmVjeWNsZUV2ZW50cy5hZnRlckNoYW5nZS5jYWxsKHRoaXMsIG1vZGVsLCBvcHRpb25zKTtcblx0fSxcblx0YWZ0ZXJBZGQ6IGZ1bmN0aW9uKG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zKSB7XG5cdFx0bGlmZWN5Y2xlRXZlbnRzLmFmdGVyQWRkLmNhbGwodGhpcywgbW9kZWwsIGNvbGxlY3Rpb24sIG9wdGlvbnMpO1xuXHR9LFxuXHRhZnRlclJlbW92ZTogZnVuY3Rpb24obW9kZWwsIGNvbGxlY3Rpb24sIG9wdGlvbnMpIHtcblx0XHRsaWZlY3ljbGVFdmVudHMuYWZ0ZXJSZW1vdmUuY2FsbCh0aGlzLCBtb2RlbCwgY29sbGVjdGlvbiwgb3B0aW9ucyk7XG5cdH0sXG5cdGFmdGVyUmVzZXQ6IGZ1bmN0aW9uKGNvbGxlY3Rpb24sIG9wdGlvbnMpIHtcblx0XHRsaWZlY3ljbGVFdmVudHMuYWZ0ZXJSZXNldC5jYWxsKHRoaXMsIGNvbGxlY3Rpb24sIG9wdGlvbnMpO1xuXHR9LFxuXG5cdC8vIFByb3RvdHlwZSBtZXRob2RzLlxuXHRjbG9zZTogZnVuY3Rpb24oKSB7XG5cdFx0Y2xvc2VDb21wb25lbnQuY2FsbCh0aGlzKTtcblx0fSxcblx0cmVuZGVyOiBmdW5jdGlvbihhdEluZGV4KSB7XG5cdFx0cmVuZGVyLmNhbGwodGhpcywgYXRJbmRleCk7XG5cdH0sXG5cblx0cmVuZGVyQ29sbGVjdGlvbjogZnVuY3Rpb24gKCkge1xuXHRcdHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcblx0XHRyZW5kZXJDb2xsZWN0aW9uLmFwcGx5KHRoaXMsIGFyZ3MpO1xuXHR9LFxufSk7XG5cblxuXG5cbkNvbXBvbmVudC5wcm90b3R5cGUuaW5pdGlhbGl6ZSA9IGZ1bmN0aW9uKHByb3BlcnRpZXMpIHtcblxuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0Ly8gS2VlcCB0cmFjayBvZiBhIGNvdW50ZXIgZm9yIHVzZSBpbiBnZW5lcmF0aW5nXG5cdC8vIGlkcyBmb3IgYW5vbnltb3VzIGNvbXBvbmVudHMuXG5cdHRoaXMuYW5vbnltb3VzUmVnaW9uQ291bnRlciA9IDA7XG5cblx0Ly8gRGlzYWJsZSBvciBpc3N1ZSB3YXJuaW5ncyBhYm91dCBjZXJ0YWluIHByb3BlcnRpZXNcblx0Ly8gYW5kIG1ldGhvZHMgdG8gYXZvaWQgY29uZnVzaW9uXG5cdHByb3BlcnRpZXMgPSB2YWxpZGF0ZURlZmluaXRpb24ocHJvcGVydGllcyk7XG5cblx0Ly8gRXh0ZW5kIGluc3RhbmNlIHcvIHNwZWNpZmllZCBwcm9wZXJ0aWVzIGFuZCBtZXRob2RzXG5cdF8uZXh0ZW5kKHRoaXMsIHByb3BlcnRpZXMpO1xuXG5cdC8vIFN0YXJ0IHdpdGggZW1wdHkgcmVnaW9ucyBvYmplY3Rcblx0dGhpcy5yZWdpb25zID0ge307XG5cblx0Ly8gRW5jb3VyYWdlIGNoaWxkIG1ldGhvZHMgdG8gdXNlIHRoZSBjb21wb25lbnQgY29udGV4dFxuXHRfLmJpbmRBbGwodGhpcyk7XG59O1xuIiwiLy8gRmlyZWQgd2hlbiB0aGUgYm91bmQgbW9kZWwgaXMgdXBkYXRlZCAoYHRoaXMubW9kZWxgKVxuZXhwb3J0cy5hZnRlckNoYW5nZSA9IGZ1bmN0aW9uIChtb2RlbCwgb3B0aW9ucykge307XG5cbi8vIEZpcmVkIHdoZW4gYSBtb2RlbCBpcyBhZGRlZCB0byB0aGUgYm91bmQgY29sbGVjdGlvbiAoYHRoaXMuY29sbGVjdGlvbmApXG5leHBvcnRzLmFmdGVyQWRkID0gZnVuY3Rpb24gKG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zKSB7fTtcblxuLy8gRmlyZWQgd2hlbiBhIG1vZGVsIGlzIHJlbW92ZWQgZnJvbSB0aGUgYm91bmQgY29sbGVjdGlvbiAoYHRoaXMuY29sbGVjdGlvbmApXG5leHBvcnRzLmFmdGVyUmVtb3ZlID0gZnVuY3Rpb24gKG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zKSB7fTtcblxuLy8gRmlyZWQgd2hlbiB0aGUgYm91bmQgY29sbGVjdGlvbiBpcyB3aXBlZCAoYHRoaXMuY29sbGVjdGlvbmApXG5leHBvcnRzLmFmdGVyUmVzZXQgPSBmdW5jdGlvbiAoY29sbGVjdGlvbiwgb3B0aW9ucykge307XG4iLCIvLyBGaXJlZCBhdXRvbWF0aWNhbGx5IHdoZW4gdGhlIHZpZXcgaXMgaW5pdGlhbGx5IGNyZWF0ZWRcbi8vIG9ubHkgZmlyZWQgYWZ0ZXJ3YXJkcyBpZiB0aGlzLnJlbmRlcigpIGlzIGV4cGxpY2l0bHkgY2FsbGVkXG4vLyBDYWxsYmFjayBtdXN0IGJlIGZpcmVkISFcbmV4cG9ydHMuYmVmb3JlUmVuZGVyID0gZnVuY3Rpb24gKGNiKSB7Y2IoKTt9O1xuXG4vLyBGaXJlZCBhdXRvbWF0aWNhbGx5IHdoZW4gdGhlIHZpZXcgaXMgaW5pdGlhbGx5IGNyZWF0ZWRcbi8vIG9ubHkgZmlyZWQgYWZ0ZXJ3YXJkcyBpZiB0aGlzLnJlbmRlcigpIGlzIGV4cGxpY2l0bHkgY2FsbGVkXG5leHBvcnRzLmFmdGVyUmVuZGVyID0gZnVuY3Rpb24gKCkge307XG5cbi8vIEZpcmVkIGF1dG9tYXRpY2FsbHkgd2hlbiB0aGUgdmlldyBpcyBjbG9zZWRcbmV4cG9ydHMuYmVmb3JlQ2xvc2UgPSBmdW5jdGlvbiAoY2IpIHtjYigpO307XG5cbi8vIEZpcmVkIGJlZm9yZSByZXJlbmRlcmluZyBvciBjbG9zaW5nIGEgdmlldyB0aGF0IGlzIGFscmVhZHkgd2FpdGluZyBvbiBhIGxvY2tcbmV4cG9ydHMuY2FuY2VsUmVuZGVyID0gZnVuY3Rpb24gKCkge1xuXHRGUkFNRVdPUksud2FybignY2FuY2VsUmVuZGVyKCkgc2hvdWxkIGJlIGRlZmluZWQgaWYgYmVmb3JlQ2xvc2UoY2IpIG9yIGJlZm9yZVJlbmRlcihjYiknICtcblx0XHRcdFx0XHRcdFx0XHQgJ2FyZSBiZWluZyB1c2VkIScpO1xufTtcblxuLy8gRmlyZWQgYmVmb3JlIHJlcmVuZGVyaW5nIG9yIGNsb3NpbmcgYSB2aWV3IHRoYXQgaXMgYWxyZWFkeSB3YWl0aW5nIG9uIGEgbG9ja1xuZXhwb3J0cy5jYW5jZWxDbG9zZSA9IGZ1bmN0aW9uICgpIHtcblx0RlJBTUVXT1JLLndhcm4oJ2NhbmNlbENsb3NlKCkgc2hvdWxkIGJlIGRlZmluZWQgaWYgYmVmb3JlQ2xvc2UoY2IpIG9yIGJlZm9yZVJlbmRlcihjYiknICtcblx0XHRcdFx0XHRcdFx0XHQgJ2FyZSBiZWluZyB1c2VkIScpO1xufTtcbiIsIi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llc1xuICovXG5cbnZhciBET00gPSByZXF1aXJlICgnLi4vdXRpbHMvRE9NJyksXG5cdFx0cmVuZGVyRGF0YUJpbmRpbmdzID0gcmVxdWlyZSgnLi9yZW5kZXJEYXRhQmluZGluZ3MnKSxcblx0XHRjb21waWxlVGVtcGxhdGUgPSByZXF1aXJlKCcuL2NvbXBpbGVUZW1wbGF0ZScpLFxuXHRcdHJlbmRlclJlZ2lvbnMgPSByZXF1aXJlKCcuL3JlbmRlclJlZ2lvbnMnKSxcblx0XHRiaW5kRXZlbnRzID0gcmVxdWlyZSAoJy4vYmluZEV2ZW50cycpO1xuXG5cblxuXG4vKipcbiAqIFJ1biBIVE1MIHRlbXBsYXRlIHRocm91Z2ggZW5naW5lIGFuZCBhcHBlbmQgcmVzdWx0cyB0byBvdXRsZXQuIEFsc28gcmVyZW5kZXIgcmVnaW9ucy5cbiAqIElmIGF0SW5kZXggaXMgc3BlY2lmaWVkLCB0aGUgY29tcG9uZW50IGlzIHJlbmRlcmVkIGF0IHRoZSBnaXZlbiBwb3NpdGlvbiB3aXRoaW4gaXRzXG4gKiBvdXRsZXQuIE90aGVyd2lzZSwgdGhlIGxhc3QgcG9zaXRpb24gaXMgdXNlZC5cbiAqXG4gKiBAcGFyYW0ge051bWJlcn0gYXRJbmRleCBbVGhlIGluZGV4IGluIHdoaWNoIHRvIHJlbmRlciB0aGlzIGVsZW1lbnRdXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByZW5kZXIoYXRJbmRleCkge1xuXG5cdEZSQU1FV09SSy5kZWJ1Zyh0aGlzLmlkICsgJyA6LS0tOiBSZW5kZXJpbmcgY29tcG9uZW50Li4uJyk7XG5cblx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdC8vIENhbmNlbCBjdXJyZW50IHJlbmRlciBhbmQgY2xvc2Ugam9icywgaWYgdGhleSdyZSBydW5uaW5nXG5cdGlmICh0aGlzLl9yZW5kZXJpbmcpIHtcblx0XHRGUkFNRVdPUksuZGVidWcodGhpcy5pZCArICcgOjogcmVuZGVyKCkgY2FuY2VsZWQuJyk7XG5cdFx0dGhpcy5fcmVuZGVyaW5nQ2FuY2VsZWQgPSB0cnVlO1xuXHRcdHRoaXMuY2FuY2VsUmVuZGVyKCk7XG5cdFx0dGhpcy5fcmVuZGVyaW5nID0gZmFsc2U7XG5cdH1cblx0aWYgKHRoaXMuX2Nsb3NpbmcpIHtcblx0XHRGUkFNRVdPUksuZGVidWcodGhpcy5pZCArICcgOjogY2xvc2UoKSBjYW5jZWxlZC4nKTtcblx0XHR0aGlzLmNhbmNlbENsb3NlKCk7XG5cdFx0dGhpcy5fY2xvc2luZyA9IGZhbHNlO1xuXHR9XG5cblx0Ly8gTG9jayBhY2Nlc3MgdG8gcmVuZGVyXG5cdHRoaXMuX3JlbmRlcmluZyA9IHRydWU7XG5cblx0Ly8gVHJpZ2dlciBiZWZvcmVSZW5kZXIgbWV0aG9kXG5cdHRoaXMuYmVmb3JlUmVuZGVyKGZ1bmN0aW9uICgpIHtcblxuXHRcdC8vIElmIHJlbmRlcmluZyB3YXMgY2FuY2VsZWQsIGJyZWFrIG91dFxuXHRcdC8vIGRvIG5vdCByZW5kZXIsIGFuZCBkbyBub3QgY2FsbCBhZnRlclJlbmRlcigpXG5cdFx0aWYgKCBzZWxmLl9yZW5kZXJpbmdDYW5jZWxlZCApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBCaW5kIHRoZSBldmVudHMgb24gbW9kZWwvY29sbGVjdGlvbnMgYW5kIGdsb2JhbCB0cmlnZ2VyZWQgZXZlbnRzLlxuXHRcdGJpbmRFdmVudHMuY29sbGVjdGlvbkV2ZW50cy5jYWxsKHNlbGYpO1xuXHRcdGJpbmRFdmVudHMubW9kZWxFdmVudHMuY2FsbChzZWxmKTtcblx0XHRiaW5kRXZlbnRzLmdsb2JhbFRyaWdnZXJzLmNhbGwoc2VsZik7XG5cblx0XHQvLyBVbmxvY2sgcmVuZGVyaW5nIG11dGV4XG5cdFx0c2VsZi5fcmVuZGVyaW5nID0gZmFsc2U7XG5cblx0XHRpZiAoIXNlbGYuJG91dGxldCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKHNlbGYuaWQgKyAnIDo6IFRyeWluZyB0byByZW5kZXIoKSwgYnV0IG5vICRvdXRsZXQgd2FzIGRlZmluZWQhJyk7XG5cdFx0fVxuXG5cdFx0Ly8gSHlkcmF0ZSBjb21waWxlZCB0ZW1wbGF0ZVxuXHRcdC8vIChjb21iaW5lcyB0aGUgdGVtcGxhdGUgZnVuY3Rpb24gd2l0aCBkYXRhIHRvIHJldHVybiBIVE1MKVxuXHRcdHZhciBodG1sID0gY29tcGlsZVRlbXBsYXRlLmNhbGwoc2VsZik7XG5cdFx0aWYgKCFodG1sKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IodGhpcy5pZCArICcgOjogVW5hYmxlIHRvIHJlbmRlciBjb21wb25lbnQgYmVjYXVzZSB0ZW1wbGF0ZSBjb21waWxhdGlvbiBkaWQgbm90IHJldHVybiBhbnkgSFRNTC4nKTtcblx0XHR9XG5cblx0XHQvLyBTdHJpcCB0cmFpbGluZyBhbmQgbGVhZGluZyB3aGl0ZXNwYWNlIHRvIGF2b2lkIGZhbHNlbHkgZGlhZ25vc2luZ1xuXHRcdC8vIG11bHRpcGxlIGVsZW1lbnRzLCB3aGVuIG9ubHkgb25lIGFjdHVhbGx5IGV4aXN0c1xuXHRcdC8vICh0aGlzIG1pc2RpYWdub3NpcyB3cmFwcyB0aGUgdGVtcGxhdGUgaW4gYW4gZXh0cmFuZW91cyA8ZGl2Pilcblx0XHRodG1sID0gaHRtbC5yZXBsYWNlKC9eXFxzKi8sICcnKTtcblx0XHRodG1sID0gaHRtbC5yZXBsYWNlKC9cXHMqJC8sICcnKTtcblx0XHRodG1sID0gaHRtbC5yZXBsYWNlKC8oXFxyfFxcbikqLywgJycpO1xuXG5cdFx0Ly8gU3RyaXAgSFRNTCBjb21tZW50cywgdGhlbiBzdHJpcCB3aGl0ZXNwYWNlIGFnYWluXG5cdFx0Ly8gKFRPRE86IG9wdGltaXplIHRoaXMpXG5cdFx0aHRtbCA9IGh0bWwucmVwbGFjZSgvKDwhLS0uKy0tPikqLywgJycpO1xuXHRcdGh0bWwgPSBodG1sLnJlcGxhY2UoL15cXHMqLywgJycpO1xuXHRcdGh0bWwgPSBodG1sLnJlcGxhY2UoL1xccyokLywgJycpO1xuXHRcdGh0bWwgPSBodG1sLnJlcGxhY2UoLyhcXHJ8XFxuKSovLCAnJyk7XG5cblx0XHQvLyBQYXJzZSBhIERPTSBub2RlIG9yIHNlcmllcyBvZiBET00gbm9kZXMgZnJvbSB0aGUgbmV3bHkgdGVtcGxhdGVkIEhUTUxcblx0XHR2YXIgcGFyc2VkTm9kZXMgPSAkLnBhcnNlSFRNTChodG1sKTtcblx0XHR2YXIgZWwgPSBwYXJzZWROb2Rlc1swXTtcblxuXHRcdC8vIElmIG5vIG5vZGVzIHdlcmUgcGFyc2VkLCB0aHJvdyBhbiBlcnJvclxuXHRcdGlmIChwYXJzZWROb2Rlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihzZWxmLmlkICsgJyA6OiByZW5kZXIoKSByYW4gaW50byBhIHByb2JsZW0gcmVuZGVyaW5nIHRoZSB0ZW1wbGF0ZSB3aXRoIEhUTUwgPT4gXFxuJytodG1sKTtcblx0XHR9XG5cblxuXG5cdFx0Ly8gSWYgdGhlcmUgaXMgbm90IG9uZSBzaW5nbGUgd3JhcHBlciBlbGVtZW50LFxuXHRcdC8vIG9yIGlmIHRoZSByZW5kZXJlZCB0ZW1wbGF0ZSBjb250YWlucyBvbmx5IGEgc2luZ2xlIHRleHQgbm9kZSxcblx0XHRlbHNlIGlmIChwYXJzZWROb2Rlcy5sZW5ndGggPiAxIHx8IHBhcnNlZE5vZGVzWzBdLm5vZGVUeXBlID09PSAzKSB7XG5cblx0XHRcdEZSQU1FV09SSy5sb2coc2VsZi5pZCArICcgOjogV3JhcHBpbmcgdGVtcGxhdGUgaW4gPGRpdi8+Li4uJywgcGFyc2VkTm9kZXMpO1xuXHRcdFx0ZWwgPSAkKCc8ZGl2Lz4nKS5hcHBlbmQoaHRtbCk7XG5cdFx0XHRlbCA9IGVsWzBdO1xuXHRcdH1cblxuXHRcdC8vIChvciBqdXN0IGEgbG9uZSByZWdpb24pXG5cdFx0Ly8gd3JhcCB0aGUgaHRtbCB1cCBpbiBhIGNvbnRhaW5lciA8ZGl2Lz5cblx0XHQvLyBlbHNlIGlmIChcblx0XHQvLyBcdCQocGFyc2VkTm9kZXNbMF0pLmlzKCdyZWdpb24nKSB8fFxuXHRcdC8vIFx0JChwYXJzZWROb2Rlc1swXSkuYXR0cignZGF0YS1yZWdpb24nKSAhPT0gdW5kZWZpbmVkICkge1xuXHRcdC8vIFx0Ly8gdXNlZCB0byB3cmFwIHRoaXMgc3R1ZmYgaW4gYSBkaXYgdG9vLCBidXQgbm90IGFueW1vcmVcblx0XHQvLyBcdC8vIHNpbmNlIGl0IG1lc3NlcyB3LyBIVE1MIHRoaW5ncyBsaWtlIHRhYmxlc1xuXHRcdC8vIH1cblxuXG5cblx0XHQvLyBTZXQgQmFja2JvbmUgZWxlbWVudCAoY2FjaGUgYW5kIHJlZGVsZWdhdGUgRE9NIGV2ZW50cylcblx0XHQvLyAoV2lsbCBhbHNvIHVwZGF0ZSBzZWxmLiRlbClcblx0XHRzZWxmLnNldEVsZW1lbnQoZWwpO1xuXG5cblxuXHRcdC8vIERldGVjdCBhbmQgcmVuZGVyIGFsbCByZWdpb25zIGFuZCB0aGVpciBkZXNjZW5kZW50IGNvbXBvbmVudHMgYW5kIHJlZ2lvbnNcblx0XHRyZW5kZXJSZWdpb25zLmNhbGwoc2VsZik7XG5cblx0XHQvLyBJbnNlcnQgdGhlIGVsZW1lbnQgYXQgdGhlIHByb3BlciBwbGFjZSBhbW9uZ3N0IHRoZSBvdXRsZXQncyBjaGlsZHJlblxuXHRcdHZhciBuZWlnaGJvcnMgPSBzZWxmLiRvdXRsZXQuY2hpbGRyZW4oKTtcblx0XHRpZiAoXy5pc0Zpbml0ZShhdEluZGV4KSAmJiBuZWlnaGJvcnMubGVuZ3RoID4gMCAmJiBuZWlnaGJvcnMubGVuZ3RoID4gYXRJbmRleCkge1xuXHRcdFx0bmVpZ2hib3JzLmVxKGF0SW5kZXgpLmJlZm9yZShzZWxmLiRlbCk7XG5cdFx0fVxuXG5cdFx0Ly8gQnV0IGlmIHRoZSBvdXRsZXQgaXMgZW1wdHksIG9yIHRoZXJlJ3Mgbm8gYXRJbmRleCwganVzdCBzdGljayBpdCBvbiB0aGUgZW5kXG5cdFx0ZWxzZSBzZWxmLiRvdXRsZXQuYXBwZW5kKHNlbGYuJGVsKTtcblxuXG5cdFx0Ly8gRmxhZyB3aXRoIGRhdGEtdGVtcGxhdGUtaWQgYXR0cmlidXRlXG5cdFx0Ly8gKHRvIG1ha2UgdGVtcGxhdGUvY29tcG9uZW50IGJvdW5kYXJpZXMgZWFzaWVyIHRvIHBpY2sgb3V0IGluIHRoZSBpbnNwZWN0b3IpXG5cdFx0c2VsZi4kZWwuYXR0cignZGF0YS10ZW1wbGF0ZS1pZCcsIHNlbGYuaWQpO1xuXG5cblxuXG5cdFx0Ly9cblx0XHQvLyBJZiB0aGUgcGFyZW50IGNvbXBvbmVudCBoYXMgcm91dGUgbGlzdGVuZXJzIChlLmcuICNmb28pXG5cdFx0Ly8gcnVuIGFueSBvZiB0aGVtIHRoYXQgbWF0Y2ggYHdpbmRvdy5sb2NhdGlvbi5oYXNoYC5cblx0XHQvLyAoYWZ0ZXIgcmVuZGVyaW5nIHRoZSB0ZW1wbGF0ZSBhbmQgcmVnaW9ucyBidXQgQkVGT1JFIHRoZSBgYWZ0ZXJSZW5kZXJgXG5cdFx0Ly8gbGlmZWN5Y2xlIGNhbGxiYWNrIGlzIHRyaWdnZXJlZClcblx0XHQvL1xuXHRcdC8vIG5vdCBzdXJlIGlmIHRoaXMgaXMgYSBnb29kIGlkZWEgaW4gZ2VuZXJhbC0tIG1heWJlIGNvbmZpZ3VyYWJsZS4uP1xuXHRcdC8vIG9yIG9ubHkgaWYgYmFja2JvbmUuaGlzdG9yeSBpc24ndCByZWFkeSB5ZXQ/XG5cdFx0Ly9cblx0XHQvLyBkaXNhYmxpbmcgZm9yIG5vdy4uLlxuXHRcdC8vIF8uZWFjaCggT2JqZWN0LmtleXMoc2VsZiksIGZ1bmN0aW9uIChrZXkpIHtcblx0XHQvLyBcdHZhciBtYXRjaGVkUm91dGUgPSBrZXkubWF0Y2gobmV3IFJlZ0V4cCgnL14nICt3aW5kb3cubG9jYXRpb24uaGFzaCArICcvJykpO1xuXHRcdC8vIFx0aWYgKCFtYXRjaGVkUm91dGUpIHJldHVybjtcblxuXHRcdC8vIFx0dmFyIG1hdGNoZWRSb3V0ZUxpc3RlbmVyID0gc2VsZlttYXRjaGVkUm91dGVdO1xuXHRcdC8vIFx0bWF0Y2hlZFJvdXRlTGlzdGVuZXIoKTtcblx0XHQvLyB9KTtcblxuXG5cdFx0Ly8gRmluYWxseSwgdHJpZ2dlciBhZnRlclJlbmRlciBtZXRob2Rcblx0XHRzZWxmLmFmdGVyUmVuZGVyKCk7XG5cblxuXHRcdC8vIFJ1biBkYXRhIGJpbmRpbmdzXG5cdFx0Ly8gVE9ETzogZG9uJ3QgY2FsbCB0aGlzIGhlcmUtLSBqdXN0IGRvIHdoZW4gaW5pdGlhbGx5IGluc2VydGluZyB0aGUgdGVtcGxhdGUgaW50byB0aGUgRE9NXG5cdFx0Ly8gKHRoaXMgaXMgaW5lZmZpY2llbnQpXG5cdFx0cmVuZGVyRGF0YUJpbmRpbmdzLmNhbGwoc2VsZik7XG5cblxuXHRcdC8vIEFkZCBkYXRhIGF0dHJpYnV0ZXMgdG8gdGhpcyBjb21wb25lbnQncyAkZWwsIHByb3ZpZGluZyBhY2Nlc3Ncblx0XHQvLyB0byB3aGV0aGVyIHRoZSBlbGVtZW50IGhhcyB2YXJpb3VzIERPTSBiaW5kaW5ncyBmcm9tIHN0eWxlc2hlZXRzLlxuXHRcdC8vIChoYW5keSBmb3IgZGlzYWJsaW5nIHRleHQgc2VsZWN0aW9uIGFjY29yZGluZ2x5LCBldGMuKVxuXHRcdC8vXG5cdFx0Ly8gLT4gZGlzYWJsZSBmb3IgdGhpcyBjb21wb25lbnQgd2l0aCBgdGhpcy5hdHRyRmxhZ3MgPSBmYWxzZWBcblx0XHQvLyAtPiBvciBnbG9iYWxseSB3aXRoIGBGUkFNRVdPUksuYXR0ckZsYWdzID0gZmFsc2VgXG5cdFx0Ly9cblx0XHQvLyBUT0RPOiBtYWtlIGl0IHdvcmsgd2l0aCBkZWxlZ2F0ZWQgRE9NIGV2ZW50IGJpbmRpbmdzXG5cdFx0Ly9cblx0XHRpZiAoc2VsZi5hdHRyRmxhZ3MgIT09IGZhbHNlICYmIEZSQU1FV09SSy5hdHRyRmxhZ3MgIT09IGZhbHNlKSB7XG5cdFx0XHRET00uZmxhZ0JvdW5kRXZlbnRzKHNlbGYpO1xuXHRcdH1cblx0fSk7XG59O1xuIiwiXG4vKipcbiAqIFRPRE86XG4gKiBUcnkgb3V0IGEgZGlmZmVyZW50IGFwcHJvYWNoIGZvciB0aGUgbG9naWMgaW4gYHJlbmRlckNvbGxlY3Rpb25gXG4gKiBiZWxvdyBieSBvdmVybG9hZGluZyBgcmVnaW9uLmF0dGFjaCgpYC5cbiAqXG4gKiBFeGFtcGxlIHVzYWdlOiAoaW4gcGFyZW50IGNvbXBvbmVudClcbiAqID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gKiB0aGlzLnNvbWVSZWdpb24uYXR0YWNoKCdTb21lT3RoZXJDb21wb25lbnQnLHsgY29sbGVjdGlvbjogU29tZUNvbGxlY3Rpb24gfSlcbiAqXG4gKiAtb3ItXG4gKlxuICogdGhpcy5zb21lUmVnaW9uLnJlcGVhdCgnU29tZU90aGVyQ29tcG9uZW50Jyx7IGNvbGxlY3Rpb246IFNvbWVDb2xsZWN0aW9uIH0pXG4gKi9cblxuLyoqXG4gKiByZW5kZXJDb2xsZWN0aW9uKClcbiAqXG4gKiBSZXVzYWJsZSBsb2dpYyB0byByZW5kZXIgYSBjb2xsZWN0aW9uIGludG8gYSByZWdpb25cbiAqXG4gKiBUT0RPOiBtb3ZlIG9udG8gUmVnaW9uIG9iamVjdCBpbnN0ZWFkLi4uICBTZWUgZ2lzdC5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gY29sbGVjdGlvbiAtIGRhdGEgc291cmNlXG4gKiBAcGFyYW0ge09wdGlvbnN9IG9wdGlvbnNcbiAqXHRcdDogb3B0aW9ucy5pdGVtVGVtcGxhdGUge1N0cmluZ30gLSBuYW1lIG9mIHRlbXBsYXRlL2NvbXBvbmVudCB0byB1c2UgYXMgaXRlbVxuICpcdFx0OiBvcHRpb25zLmludG9SZWdpb24ge09iamVjdH0gLSB0aGUgZGVzdGluYXRpb24gcmVnaW9uXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGNvbGxlY3Rpb24sIG9wdGlvbnMpIHtcblxuXHQvLyBSZXF1aXJlZDpcblx0aWYgKHR5cGVvZiBjb2xsZWN0aW9uICE9PSAnb2JqZWN0JykgdGhyb3cgbmV3IEVycm9yKCdyZW5kZXJDb2xsZWN0aW9uIDo6IFVua25vd24vaW52YWxpZCBjb2xsZWN0aW9uLCBcIicgKyAoY29sbGVjdGlvbiAmJiBjb2xsZWN0aW9uLnR5cGUpICsgJ1wiJyk7XG5cdGlmICghb3B0aW9ucy5pdGVtVGVtcGxhdGUpIHRocm93IG5ldyBFcnJvcigncmVuZGVyQ29sbGVjdGlvbiA6OiBvcHRpb25zLml0ZW1UZW1wbGF0ZSByZXF1aXJlZCEnKTtcblx0aWYgKCFvcHRpb25zLmludG9SZWdpb24pIHRocm93IG5ldyBFcnJvcigncmVuZGVyQ29sbGVjdGlvbiA6OiBvcHRpb25zLmludG9SZWdpb24gcmVxdWlyZWQhJyk7XG5cblxuXHQvLyBEZXRlcm1pbmUgY29sbGVjdGlvbk5hbWVcblx0dmFyIGNvbGxlY3Rpb25OYW1lID0gY29sbGVjdGlvbi50eXBlO1xuXG5cdC8vIFRhcmdldCByZWdpb25cblx0dmFyIG91dGxldCA9IG9wdGlvbnMuaW50b1JlZ2lvbjtcblxuXHQvLyBTdWItY29tcG9uZW50XG5cdHZhciBzdWJjb21wb25lbnROYW1lID0gb3B0aW9ucy5pdGVtVGVtcGxhdGU7XG5cblx0Ly8gTmFtZSBvZiB0aGUgY29sbGVjdGlvbiBzdGF0ZSBhdHRyaWJ1dGUgdGhhdCB3aWxsZSBiZSBpbmplY3RlZCBpbnRvIHRoZSBIVE1MXG5cdC8vIFVzZWQgZm9yIHRoZSBkZWZhdWx0IHJlbmRlciBiZWhhdmlvci5cblx0dmFyIGJvZHlTdGF0ZUF0dHJpYnV0ZSA9ICdkYXRhLScgKyBjb2xsZWN0aW9uTmFtZSArICctc3RhdGUnO1xuXG5cblxuXG5cdC8qKlxuXHQgKiBEZWZhdWx0IHJlbmRlciBtZXRob2RzXG5cdCAqXG5cdCAqIE92ZXJyaWRlIGRlZmF1bHQgcmVuZGVyIG1ldGhvZHMgd2l0aCBvcHRpb25zIGlmIHNwZWNpZmllZFxuXHQgKi9cblxuXHQvLyBEZWZhdWx0IHJlbmRlciBsb2dpYyBmb3IgZXJyb3Igc3RhdGUgKGUuZy4gcmVkIHRleHQpXG5cdHZhciByZW5kZXJFcnJvciA9IG9wdGlvbnMucmVuZGVyRXJyb3IgfHwgZnVuY3Rpb24gcmVuZGVyRXJyb3IgKCkge1xuXHRcdEZSQU1FV09SSy5lcnJvcignQW4gZXJyb3Igb2NjdXJyZWQgd2hpbGUgbG9hZGluZyAnICsgY29sbGVjdGlvbk5hbWUgKyAnIDo6XFxuJywgY29sbGVjdGlvbi5lcnJvcik7XG5cblx0XHQvLyBTZXQgYSBkYXRhIGF0dHJpYnV0ZSBvbiBIVE1MIGJvZHlcblx0XHQkKCdib2R5JykuYXR0cihib2R5U3RhdGVBdHRyaWJ1dGUsICdlcnJvcicpO1xuXHR9O1xuXG5cdC8vIERlZmF1bHQgcmVuZGVyIGxvZ2ljIGZvciBsb2FkaW5nIHN0YXRlIChlLmcuIHNwaW5uZXIpXG5cdHZhciByZW5kZXJTeW5jaW5nID0gb3B0aW9ucy5yZW5kZXJTeW5jaW5nIHx8IGZ1bmN0aW9uIHJlbmRlclN5bmNpbmcoKSB7XG5cdFx0RlJBTUVXT1JLLmxvZygnTG9hZGluZyAnICsgY29sbGVjdGlvbk5hbWUgKyAnLi4uJyk7XG5cblx0XHQvLyBTZXQgc3RhdGUgYXR0cmlidXRlIG9uIEhUTUwgYm9keVxuXHRcdCQoJ2JvZHknKS5hdHRyKGJvZHlTdGF0ZUF0dHJpYnV0ZSwgJ3N5bmNpbmcnKTtcblx0fTtcblxuXHQvLyBEZWZhdWx0IHJlbmRlciBsb2dpYyB0byBjbGVhbiB1cCBhZnRlciBhIHN1Y2Nlc3NmdWwgc3luYy9sb2FkXG5cdHZhciByZW5kZXJTeW5jZWQgPSBvcHRpb25zLnJlbmRlclN5bmNlZCB8fCBmdW5jdGlvbiByZW5kZXJTeW5jZWQoKSB7XG5cdFx0RlJBTUVXT1JLLmxvZyhjb2xsZWN0aW9uLmxlbmd0aCArICcgJyArIGNvbGxlY3Rpb25OYW1lICsgJyBmZXRjaGVkIHN1Y2Nlc3NmdWxseS4nKTtcblxuXHRcdC8vIFNldCBzdGF0ZSBhdHRyaWJ1dGUgb24gSFRNTCBib2R5XG5cdFx0JCgnYm9keScpLmF0dHIoYm9keVN0YXRlQXR0cmlidXRlLCAncmVhZHknKTtcblx0fTtcblxuXHQvLyBEZWZhdWx0IHJlbmRlciBsb2dpYyBmb3IgaXRlbXMgaW4gY29sbGVjdGlvblxuXHR2YXIgcmVuZGVyUmVzZXQgPSBvcHRpb25zLnJlbmRlclJlc2V0IHx8IGZ1bmN0aW9uIHJlbmRlclJlc2V0KCkge1xuXG5cdFx0Ly8gQ2xlYW4gb3V0IHRoZSByZWdpb24sIHdyYXAgaW4gYSB0cnkvY2F0Y2ggdG8gc3RvcCB0aGUgZXhlY3V0aW9uXG5cdFx0dHJ5IHtcblx0XHRcdG91dGxldC5lbXB0eSgpO1xuXHRcdH0gY2F0Y2ggKGUpIHt9XG5cblxuXHRcdC8vIFRPRE86IFNtYXJ0IG1lcmdlIHRvIG1pbmltaXplIERPTSBxdWVyaWVzXG5cdFx0Y29sbGVjdGlvbi5lYWNoKGZ1bmN0aW9uIChtb2RlbCkge1xuXHRcdFx0Ly8gRm9yIGVhY2ggbW9kZWwgZm91bmQsIGFwcGVuZCBhIHN1YmNvbXBvbmVudCB0byB0aGUgcmVnaW9uXG5cdFx0XHRvdXRsZXQuYXBwZW5kKHN1YmNvbXBvbmVudE5hbWUsIHsgbW9kZWw6IG1vZGVsIH0pO1xuXHRcdH0pO1xuXHR9O1xuXG5cdC8qKlxuXHQgKiByZW5kZXJBZGQgKCBtb2RlbCwgW2F0SW5kZXhdIClcblx0ICpcblx0ICogQHBhcmFtIHtNb2RlbH0gbW9kZWxcdFx0XHRcdFx0XHQtIHRoZSBCYWNrYm9uZSBtb2RlbCB0aGF0IHdhcyBhZGRlZFxuXHQgKiBAcGFyYW0ge0ludGVnZXJ9IGF0SW5kZXhcdFx0XHRcdC0gKG9wdGlvbmFsLSBkZWZhdWx0cyB0byBjb2xsZWN0aW9uLmxlbmd0aClcblx0ICpcblx0ICogRGVmYXVsdCByZW5kZXIgbG9naWMgZm9yIHRoZSBjYXNlIHdoZXJlIGFuIGl0ZW0gaXMgYWRkZWQgdG8gdGhlIGNvbGxlY3Rpb24uXG5cdCAqL1xuXHR2YXIgcmVuZGVyQWRkID0gb3B0aW9ucy5yZW5kZXJBZGQgfHwgZnVuY3Rpb24gcmVuZGVyQWRkKCBtb2RlbCwgYXRJbmRleCApIHtcblx0XHRpZiAoIHR5cGVvZiBhdEluZGV4ID09PSAnbnVtYmVyJykge1xuXHRcdFx0cmV0dXJuIG91dGxldC5pbnNlcnQoYXRJbmRleCwgc3ViY29tcG9uZW50TmFtZSwgeyBtb2RlbDogbW9kZWwgfSk7XG5cdFx0fVxuXHRcdHJldHVybiBvdXRsZXQuYXBwZW5kKHN1YmNvbXBvbmVudE5hbWUsIHsgbW9kZWw6IG1vZGVsIH0pO1xuXHR9O1xuXG5cdC8qKlxuXHQgKiByZW5kZXJSZW1vdmUoIGF0SW5kZXggKVxuXHQgKlxuXHQgKiBAcGFyYW0ge0ludGVnZXJ9IGF0SW5kZXhcdFx0XHQtIHRoZSBmb3JtZXIgaW5kZXggb2YgdGhlIEJhY2tib25lIG1vZGVsIHRoYXQgd2FzIHJlbW92ZWRcblx0ICpcblx0ICogRGVmYXVsdCByZW5kZXIgbG9naWMgZm9yIHRoZSBjYXNlIHdoZXJlIGFuIGl0ZW0gaXMgcmVtb3ZlZCBmcm9tIHRoZSBjb2xsZWN0aW9uLlxuXHQgKi9cblx0dmFyIHJlbmRlclJlbW92ZSA9IG9wdGlvbnMucmVuZGVyUmVtb3ZlIHx8IGZ1bmN0aW9uIHJlbmRlclJlbW92ZSggYXRJbmRleCApIHtcblx0XHRvdXRsZXQucmVtb3ZlKCBhdEluZGV4ICk7XG5cdH07XG5cblxuXG5cblxuXG5cdC8qKlxuXHQgKiBCb290c3RyYXBcblx0ICpcblx0ICogUmVuZGVycyBpbml0aWFsIHN0YXRlIG9mIGNvbGxlY3Rpb24gaW50byBvdXIgcmVnaW9uXG5cdCAqIHVzaW5nIG91ciBjaGlsZCB0ZW1wbGF0ZS5cblx0ICovXG5cblx0Ly8gSWYgb3VyIGNvbGxlY3Rpb24gaXMgZmV0Y2hpbmcsIHJlbmRlciB0aGUgZmV0Y2hpbmcgKGxvYWRpbmcpIHN0YXRlLlxuXHRpZiAoY29sbGVjdGlvbi5zeW5jaW5nKSB7XG5cdFx0cmVuZGVyU3luY2luZygpO1xuXHR9XG5cblxuXHQvLyBJZiBvdXIgY29sbGVjdGlvbiBmYWlsZWQgdG8gZmV0Y2ggKGkuZS4gcmVjZWl2ZWQgYSA0eHggb3IgNXh4IGVycm9yIGNvZGUpXG5cdC8vIHJlbmRlciBhbiBlcnJvciBzdGF0ZVxuXHQvL1xuXHQvLyBIYW5kbGUgdGhlIGNhc2Ugb2YgbXVsdGlwbGUgZXJyb3Igc3RhdGVzIHdpdGggZGlmZmVyZW50IHN0eWxlcyBoZXJlIGFzIHdlbGwuXG5cdGVsc2UgaWYgKGNvbGxlY3Rpb24uZXJyb3IpIHtcblx0XHRyZW5kZXJFcnJvcigpO1xuXHR9XG5cblxuXHQvLyBPdGhlcndpc2Ugb3VyIGNvbGxlY3Rpb24gaXMgbG9hZGVkIGFuZCByZWFkeSxcblx0Ly8gc28gZ28gYWhlYWQgYW5kIHJlbmRlciBpdCBpbnRvIHRoZSB0YXJnZXQgcmVnaW9uLlxuXHQvL1xuXHQvLyAoYWx0ZXJuYXRpdmVseSBhdCB0aGlzIHBvaW50LCBhIGN1c3RvbSBgZW1wdHlgIHN0YXRlIG1heSBiZSByZW5kZXJlZClcblx0Ly8gY29uc29sZS5sb2coJ1RoZSBjb2xsZWN0aW9uICcgKyBzdWJjb21wb25lbnROYW1lICsgJy0tLS0+Jyk7XG5cdGVsc2UgcmVuZGVyUmVzZXQoKTtcblxuXG5cblxuXG5cblxuXHQvKipcblx0ICogQmluZCBldmVudHNcblx0ICpcblx0ICogTGlzdGVuIGZvciBzdGF0ZSBjaGFuZ2VzIChzeW5jaW5nLCBzeW5jZWQsIHNlcnZlciBlcnJvciwgYWRkLCByZW1vdmUsIHNvcnQsIGV0Yy4pXG5cdCAqIFRoZXNlIG1hbnVhbCBiaW5kaW5ncyBjYW4gYmUgcmVtb3ZlZCB3aGVuIGNvcmUgZnJhbWV3b3JrIHN1cHBvcnRzIHJlbmRlci10aW1lIGNvbGxlY3Rpb25cblx0ICogYmluZGluZ3MuICBGb3Igbm93LCBkb2luZyBpdCB0aGlzIHdheSByYXRoZXIgdGhhbiBwYXRjaGluZyB0aGUgY29yZSB0byB0ZXN0IG91ciBzdHJ1Y3R1cmFsXG5cdCAqIGFzc3VtcHRpb25zLlxuXHQgKi9cblxuXHQvLyBXaGVuIGEgZmV0Y2ggaXMgaW5pdGlhdGVkIGZyb20gdGhlIHNlcnZlci4uLlxuXHQvL1xuXHQvLyAoYWZ0ZXIgYEJhY2tib25lLnN5bmNgIGJlZ2lucyBhIHJlbW90ZSByZXF1ZXN0KVxuXHR0aGlzLmxpc3RlblRvKGNvbGxlY3Rpb24sICdyZXF1ZXN0JywgZnVuY3Rpb24gYWZ0ZXJSZXF1ZXN0ICgpIHtcblx0XHRyZW5kZXJTeW5jaW5nKCk7XG5cdH0pO1xuXG5cdC8vIFdoZW4gYSBmZXRjaCBjb21wbGV0ZXMgc3VjY2Vzc2Z1bGx5IGFuZCBuZXcgZGF0YSBpcyBsb2FkZWQuLi5cblx0Ly9cblx0Ly8gKGFmdGVyIHRoaXMgY29tcG9uZW50IGlzIGFscmVhZHkgaW5zdGFudGlhdGVkKVxuXHR0aGlzLmxpc3RlblRvKGNvbGxlY3Rpb24sICdzeW5jJywgZnVuY3Rpb24gYWZ0ZXJTeW5jICgpIHtcblx0XHRyZW5kZXJTeW5jZWQoKTtcblx0XHRyZW5kZXJSZXNldCgpO1xuXHR9KTtcblxuXHQvLyBXaGVuIHNlcnZlciBzZW5kcyBhIHJlc3BvbnNlIHcvIGFuIGVycm9yIGNvZGVcblx0Ly9cblx0Ly8gKGFmdGVyIHRoaXMgY29tcG9uZW50IGlzIGFscmVhZHkgaW5zdGFudGlhdGVkKVxuXHR0aGlzLmxpc3RlblRvKGNvbGxlY3Rpb24sICdlcnJvcicsIGZ1bmN0aW9uIGFmdGVyU3luY0Vycm9yIChjb2xsZWN0aW9uLCB4aHIpIHtcblxuXHRcdC8vIElnbm9yZSBhYm9ydCBcImVycm9yXCJcblx0XHQvL1xuXHRcdC8vIFdoeT8gYmVjYXVzZSBpdCdzIG5vdCBhY3R1YWxseSBhbiBlcnJvci5cblx0XHQvLyBOb3Qgc3VyZSB3aHkgdGhpcyB0cmlnZ2VycyBCYWNrYm9uZS5Db2xsZWN0aW9uJ3MgYGVycm9yYCBldmVudC4uLlxuXHRcdC8vXG5cdFx0Ly8gSWYgdHdvIGZldGNoZXMgb2NjdXIgb24gdGhlIHNhbWUgY29sbGVjdGlvbiBhdCB0aGUgc2FtZSB0aW1lLFxuXHRcdC8vIHdlIGFib3J0IHRoZSBvbGQgWEhSIHJlcXVlc3Qgb3Vyc2VsdmVzIGlmIGl0J3Mgc3RpbGwgcnVubmluZylcblx0XHRpZiAoeGhyICYmIHhoci5zdGF0dXNUZXh0ID09PSAnYWJvcnQnKSByZXR1cm47XG5cblx0XHRyZW5kZXJFcnJvcigpO1xuXHR9KTtcblxuXHQvLyBXaGVuIGEgbW9kZWwgaXMgYWRkZWQuLi5cblx0Ly9cblx0Ly8gTGlzdGVuIGZvciBuZXcgbW9kZWxzLCBhbmQgaW5zZXJ0IGEgY2hpbGQgdGVtcGxhdGVcblx0Ly8gYXQgdGhlIGFwcHJvcHJpYXRlIGluZGV4IHdpdGhpbiB0aGUgcmVnaW9uLlxuXHR0aGlzLmxpc3RlblRvKGNvbGxlY3Rpb24sICdhZGQnLCBmdW5jdGlvbiBhZnRlckFkZCAoIG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zICkge1xuXHRcdHJlbmRlckFkZCggbW9kZWwsIG9wdGlvbnMuYXQgKTtcblx0fSk7XG5cblx0Ly8gV2hlbiBhIG1vZGVsIGlzIHJlbW92ZWQuLi5cblx0Ly9cblx0Ly8gR3JhYiBtb2RlbCdzIHJlbGF0aXZlIGluZGV4IHdpdGhpbiBjb2xsZWN0aW9uIGFuZCByZW1vdmVcblx0Ly8gdGhlIGNoaWxkIHRlbXBsYXRlIGF0IHRoZSBzYW1lIGluZGV4IHdpdGhpbiB0aGUgcmVnaW9uLlxuXHR0aGlzLmxpc3RlblRvKGNvbGxlY3Rpb24sICdyZW1vdmUnLCBmdW5jdGlvbiBhZnRlclJlbW92ZSAoIG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zICkge1xuXHRcdHJlbmRlclJlbW92ZSggb3B0aW9ucy5pbmRleCApO1xuXHR9KTtcblxuXG5cbn07XG4iLCIvKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXNcbiAqL1xuXG52YXIgZGF0YUJpbmRpbmdzID0ge1xuXHR0ZXh0ICAgIDogcmVxdWlyZSgnLi9kYXRhQmluZGluZ3MvdGV4dCcpLFxuXHQnY2xhc3MnIDogcmVxdWlyZSgnLi9kYXRhQmluZGluZ3MvY2xhc3MnKVxufTtcblxuXG5cbi8qKlxuICogUmVuZGVyIG1vZGVsIGJpbmRpbmdzLlxuICogICArIGBiaW5kLXRleHRgXG4gKiAgICsgbW9yZSB0byBjb21lXG4gKlxuICogQ2FsbGVkIGJ5IENvbXBvbmVudCB3aGVuIGl0cyBtb2RlbCBjaGFuZ2VzLlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcmVuZGVyRGF0YUJpbmRpbmdzICgpIHtcblx0RlJBTUVXT1JLLmRlYnVnKCdSZW5kZXJpbmcgZGF0YSBiaW5kaW5ncyBmb3IgJywgdGhpcy5pZCwnY29tcG9uZW50Li4uJyk7XG5cblx0Ly8gRW5zdXJlIHRoYXQgbW9kZWwgZXhpc3RzXG5cdGlmICghdGhpcy5tb2RlbCkge1xuXHRcdHRocm93IG5ldyBFcnJvcihcblx0XHRcdCdUcnlpbmcgdG8gYm9vdHN0cmFwIGRhdGEgYmluZGluZ3MgZm9yIGNvbXBvbmVudCAoJyArIHRoaXMuaWQgKyAnKSwgJyArXG5cdFx0XHQnYnV0IGl0IGhhcyBubyBtb2RlbCEnKTtcblx0fVxuXHR2YXIgbW9kZWwgPSB0aGlzLm1vZGVsO1xuXG5cdC8vIGpRdWVyeSBzZWxlY3RvciBmb3IgZ3JhYmJpbmcgYWxsIGVsZW1lbnRzIHcvIGRhdGEgYmluZGluZ3Ncblx0dmFyIGJpbmRpbmdTZWxlY3RvciA9ICdbYmluZC10ZXh0XSwgOm1hdGNoQXR0cihcIl5iaW5kLWNsYXNzLSokXCIpJztcblxuXHQvLyBHZXQgZWxlbWVudHMgaW4gdGhpcyBjb21wb25lbnQgd2hpY2ggaGF2ZSBkYXRhIGJpbmRpbmdzXG5cdC8vIChpZ25vcmVzIGNvbnRlbnRzIG9mIHJlZ2lvbnMgaWYgdGhleSBleGlzdClcblx0dmFyICRib3VuZEVsZW1lbnRzID0gXyRzZWxlY3RPdXRlci5jYWxsKHRoaXMsIGJpbmRpbmdTZWxlY3Rvcik7XG5cblx0Ly8gTG9vcCB0aHJvdWdoIGVhY2ggYm91bmQgYXR0cmlidXRlIG9mIGVhY2ggYm91bmQgZWxlbWVudFxuXHQvLyBhbmQgY2FsbCB0aGUgYXBwcm9wcmlhdGUgcmVuZGVyIG1ldGhvZC5cblx0JGJvdW5kRWxlbWVudHMuZWFjaChmdW5jdGlvbiBlYWNoQm91bmRFbGVtZW50ICgpIHtcblx0XHQkYm91bmRFbCA9ICQodGhpcyk7XG5cblx0XHR2YXIgYWxsQXR0cmlidXRlcyA9ICRib3VuZEVsWzBdLmF0dHJpYnV0ZXM7XG5cdFx0Xy5lYWNoKGFsbEF0dHJpYnV0ZXMsIGZ1bmN0aW9uIChhdHRyKSB7XG5cdFx0XHR2YXIgYXR0ck5hbWUgPSBhdHRyLm5vZGVOYW1lO1xuXG5cdFx0XHRfLmVhY2goIGRhdGFCaW5kaW5ncywgZnVuY3Rpb24gZWFjaEJpbmRpbmdGb3JtdWxhICggYmluZGluZyApIHtcblx0XHRcdFx0dmFyIG1hdGNoZXMgPSBhdHRyTmFtZS5tYXRjaChiaW5kaW5nLnJlZ2V4cCk7XG5cdFx0XHRcdGlmICggbWF0Y2hlcyApIHtcblx0XHRcdFx0XHRiaW5kaW5nLmZuKCRib3VuZEVsLCBtb2RlbCwgbWF0Y2hlcyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcbn07XG5cblxuXG5cbi8qKlxuICogTG9va3VwIHN1aXRhYmxlIGVsZW1lbnRzIHdpdGhpbiB0aGlzIGNvbXBvbmVudCdzICRlbCBjb250ZXh0LlxuICogSWdub3JlIHJlZ2lvbnMsIGFuZCBpbmNsdWRlIHRoZSB0b3AtbGV2ZWwgZWxlbWVudC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gYmluZGluZ1NlbGVjdG9yIC0gRE9NIHNlbGVjdG9yIHRvIHVzZVxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIF8kc2VsZWN0T3V0ZXIgKCBiaW5kaW5nU2VsZWN0b3IgKSB7XG5cblx0Ly8gTG9va3VwIG1hdGNoZXNcblx0dmFyICRtYXRjaGVzID0gdGhpcy4kKGJpbmRpbmdTZWxlY3Rvcik7XG5cblx0Ly8gSWYgdG9wLWxldmVsIGVsZW1lbnQgaW4gdGVtcGxhdGUgaGFzIGEgZGF0YS1iaW5kaW5nLCBpbmNsdWRlIGl0XG5cdGlmICh0aGlzLiRlbC5maWx0ZXIoYmluZGluZ1NlbGVjdG9yKSkge1xuXHRcdCRtYXRjaGVzID0gJC5tZXJnZSgkbWF0Y2hlcywgdGhpcy4kZWwpO1xuXHR9XG5cblx0Ly8gT21pdCBhbnl0aGluZyBpbnNpZGUgYSByZWdpb24sIHNpbmNlIHRob3NlIGJpbmRpbmdzIHdpbGwgaGF2ZSBhbHJlYWR5XG5cdC8vIGJlZW4gdGFrZW4gY2FyZSBvZiBieSBvbmUgb2YgdGhlIGRlc2NlbmRhbnQgY29tcG9uZW50KHMpIHdpdGhpbiB0aGUgcmVnaW9uLlxuXHQvL1xuXHQvLyBUT0RPOiBvcHRpbWl6ZSB0byBleGNsdWRlIHRoZXNlIGVsZW1lbnRzIGZyb20gdGhlIG9yaWdpbmFsIERPTSBzZWxlY3Rpb25cblx0JG1hdGNoZXMgPSAkbWF0Y2hlcy5ub3QoIHRoaXMuJCgncmVnaW9uICosIFtkYXRhLXJlZ2lvbl0gKicpICk7XG5cblx0cmV0dXJuICRtYXRjaGVzO1xufVxuXG5cblxuXG5cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuLy8vXG4vLyAgICAgICAgICAgICAgICAgICAgICAgICB8fFxuLy8gVE9ETzogbW92ZSB0aGlzIHRoaW5nICAgXFwvXG4vLyAgICAgICBpbnRvIGB1dGlsc2AgcHJibHlcbi8vXG5cbi8qKlxuICogQ3JlYXRlIHBzZXVkby1zZWxlY3RvciBmb3IgZ2V0dGluZyB3aWxkY2FyZCBkYXRhIGF0dHJpYnV0ZXMuXG4gKlxuICogVXNhZ2U6XG4gKiAkKFwiOm1hdGNoQXR0cignXmRhdGEtJylcIilcbiAqXG4gKiBTb3VyY2U6XG4gKiBodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8xMzIyMjUwOS80ODY1NDdcbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5qUXVlcnkuZXhwci5wc2V1ZG9zLm1hdGNoQXR0ciA9ICQuZXhwci5jcmVhdGVQc2V1ZG8oZnVuY3Rpb24oYXJnKSB7XG5cbiAgICB2YXIgcmVnZXhwID0gbmV3IFJlZ0V4cChhcmcpO1xuICAgIHJldHVybiBmdW5jdGlvbihlbGVtKSB7XG4gICAgICAgIGZvcih2YXIgaSA9IDA7IGkgPCBlbGVtLmF0dHJpYnV0ZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBhdHRyID0gZWxlbS5hdHRyaWJ1dGVzW2ldO1xuICAgICAgICAgICAgaWYocmVnZXhwLnRlc3QoYXR0ci5uYW1lKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9O1xufSk7XG5cbi8vICAvXFxcbi8vICB8fFxuLy9cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG5cblxuXG5cblxuXG5cblxuXG5cblxuXG5cblxuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbi8vLyAgICAgICAgICAgICAgICAgICAgIHx8XG4vLy8gQ1VSUkVOVExZIFVOVVNFRCAgICBcXC9cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cblxuLy8gUmVnZXhwcyBmb3IgZGV0ZWN0aW9uIG9mIHdpbGRjYXJkIG5hbWVkIHBhcmFtZXRlcnMgaW4gY3VzdG9tIGVsZW1lbnQgYXR0cmlidXRlIG5hbWVzLlxuLy8gdmFyIG9wdGlvbmFsUGFyYW0gPSAvXFwoKC4qPylcXCkvZztcbi8vIHZhciBuYW1lZFBhcmFtID0gLyhcXChcXD8pPzpcXHcrL2c7XG4vLyB2YXIgc3BsYXRQYXJhbSA9IC9cXCpcXHcrL2c7XG4vLyB2YXIgZXNjYXBlUmVnRXhwID0gL1tcXC17fVxcW1xcXSs/LixcXFxcXFxeJHwjXFxzXS9nO1xuXG5cbi8vIEJ1aWxkIHNlbGVjdG9yIGZvciBzdXBlcnNldCBvZiB0aGVzZSBiaW5kaW5nc1xuLy8gdmFyIF9hdHRyTmFtZVRvUmVnRXhwID0gZnVuY3Rpb24oIGF0dHJFeHByZXNzaW9uICkge1xuXG4vLyBcdGF0dHJFeHByZXNzaW9uID0gYXR0ckV4cHJlc3Npb24ucmVwbGFjZShlc2NhcGVSZWdFeHAsICdcXFxcJCYnKVxuLy8gXHRcdC5yZXBsYWNlKG9wdGlvbmFsUGFyYW0sICcoPzokMSk/Jylcbi8vIFx0XHQucmVwbGFjZShuYW1lZFBhcmFtLCBmdW5jdGlvbihtYXRjaCwgb3B0aW9uYWwpIHtcbi8vIFx0XHRcdHJldHVybiBvcHRpb25hbCA/IG1hdGNoIDogJyhbXlxcL10rKSc7XG4vLyBcdFx0fSlcbi8vIFx0XHQucmVwbGFjZShzcGxhdFBhcmFtLCAnKC4qPyknKTtcbi8vIFx0cmV0dXJuICdeJyArIGF0dHJFeHByZXNzaW9uICsgJyQnO1xuLy8gfTtcbi8vIHZhciBfZXh0cmFjdFBhcmFtZXRlcnMgPSBmdW5jdGlvbihyZWdleHAsIGF0dHJOYW1lLCBhdHRyRXhwcmVzc2lvbikge1xuLy8gXHR2YXIgcGFyYW1WYWx1ZXMgPSByZWdleHAuZXhlYyhhdHRyTmFtZSkuc2xpY2UoMSk7XG4vLyBcdHZhciBwYXJhbUtleXMgPSBuYW1lZFBhcmFtLmV4ZWMoYXR0ckV4cHJlc3Npb24pO1xuXG4vLyBcdGlmICghcGFyYW1LZXlzIHx8ICFwYXJhbVZhbHVlcykgcmV0dXJuIHt9O1xuXG4vLyBcdHZhciBuYW1lZFBhcmFtZXRlcnMgPSB7fTtcbi8vIFx0Y29uc29sZS5sb2coJ3BhcmFtVmFsdWVzOicscGFyYW1WYWx1ZXMpO1xuLy8gXHRfLmVhY2gocGFyYW1WYWx1ZXMsIGZ1bmN0aW9uIGVhY2hNYXRjaGluZ1BpZWNlKCBwYXJhbSwgaSApIHtcbi8vIFx0XHR2YXIga2V5ID0gcGFyYW1LZXlzW2ldO1xuLy8gXHRcdGtleSA9IGtleS5zbGljZSgxKTsgLy8gcmVtb3ZlIGA6YCBmcm9tIG5hbWVkIHBhcmFtXG4vLyBcdFx0bmFtZWRQYXJhbWV0ZXJzW2tleV0gPSBwYXJhbVZhbHVlc1tpXTtcbi8vIFx0fSk7XG4vLyBcdHJldHVybiBuYW1lZFBhcmFtZXRlcnM7XG4vLyB9O1xuXG5cblxuLy8gLyoqXG4vLyAgKiBSZW5kZXIgYSBzaW5nbGUgYmluZGluZ1xuLy8gICovXG4vLyB2YXIgX3JlbmRlckJpbmRpbmcgPSBmdW5jdGlvbiAoJG1hdGNoZWRFbCwgZG9tQXR0cmlidXRlTmFtZSwgbW9kZWwsIHJlbmRlckZuLCBuYW1lZFBhcmFtcykge1xuLy8gXHR2YXIgcmF3QmluZGluZyA9ICRtYXRjaGVkRWwuYXR0ciggZG9tQXR0cmlidXRlTmFtZSApO1xuLy8gXHQvLyBJZiBlbGVtZW50IGRvZXNuJ3QgY29udGFpbiB0aGUgc3BlY2lmaWVkIERPTSBhdHRyaWJ1dGUuLi5cbi8vIFx0Ly8gZmFpbCBzaWxlbnRseS5cbi8vIFx0aWYgKCAhcmF3QmluZGluZyApIHJldHVybjtcblxuLy8gXHQvLyBjb25zb2xlLmxvZygnZ2V0dGluZyAnLGRvbUF0dHJpYnV0ZU5hbWUsJ29uJywkbWF0Y2hlZEVsKTtcbi8vIFx0dmFyIG1vZGVsQXR0cmlidXRlTmFtZSA9IHJhd0JpbmRpbmcucmVwbGFjZSgvXlxcQC8sICcnKTtcbi8vIFx0RlJBTUVXT1JLLmRlYnVnKCdGb3VuZCBhIGJpbmRpbmcgOjonLCByYXdCaW5kaW5nLCAnOjonLCBuYW1lZFBhcmFtcyk7XG5cbi8vIFx0Ly8gSWYgbW9kZWwgZG9lc24ndCBjb250YWluIHRoZSBzcGVjaWZpZWQgYXR0cmlidXRlLi4uXG4vLyBcdGlmICggdHlwZW9mIG1vZGVsLmF0dHJpYnV0ZXNbbW9kZWxBdHRyaWJ1dGVOYW1lXSA9PT0gJ3VuZGVmaW5lZCcgKSB7XG5cbi8vIFx0XHQvLyBmYWlsIHNpbGVudGx5LlxuLy8gXHRcdHJldHVybjtcbi8vIFx0XHQvLyBGUkFNRVdPUksud2FybignQ2Fubm90IGJpbmQgYEAnK21vZGVsQXR0cmlidXRlTmFtZSsnIGZvciB0ZW1wbGF0ZS9jb21wb25lbnQgJyArXG4vLyBcdFx0Ly8gXHQnYCcgKyBjb21wb25lbnQuaWQgKydgLlxcbicrXG4vLyBcdFx0Ly8gXHQnTm8gc3VjaCBhdHRyaWJ1dGUgZXhpc3RzIGluIHRoZSBjb21wb25lbnRcXCdzIG1vZGVsLidcbi8vIFx0XHQvLyApO1xuLy8gXHR9XG5cbi8vIFx0Ly8gUmVuZGVyIGEgZGF0YSBiaW5kaW5nXG4vLyBcdHZhciBiaW5kaW5nVmFsID0gbW9kZWwuZ2V0KG1vZGVsQXR0cmlidXRlTmFtZSkgfHwgJyc7XG4vLyBcdHJlbmRlckZuKCAkbWF0Y2hlZEVsLCBiaW5kaW5nVmFsLCBuYW1lZFBhcmFtcyApO1xuLy8gfTtcblxuXG4vLyAvKipcbi8vICAqIFJlbmRlciB0aGUgc3BlY2lmaWVkIHR5cGUgb2YgZGF0YSBiaW5kaW5nc1xuLy8gICpcbi8vICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4vLyAgKlx0XHRAb3B0aW9uIHtGdW5jdGlvbn0gcmVuZGVyRm4gKCRlbCwgdmFsLCBwYXJhbXMpXHQtPiBmdW5jdGlvbiB3aGljaCByZW5kZXJzIHRoZSBkYXRhIGJpbmRpbmcgZm9yIHRoZSBzcGVjaWZpZWQgZWxlbWVudFxuLy8gICpcdFx0XHRAcGFyYW0ge0pRdWVyeUVsZW1lbnR9ICRlbFxuLy8gICpcdFx0XHRAcGFyYW0gez99IHZhbCAtPiB2YWx1ZSBvZiBib3VuZCBtb2RlbCBhdHRyaWJ1dGVcbi8vICAqXHRcdFx0QHBhcmFtIHtPYmplY3R9IHBhcmFtcyAtPiBrZXllZCBvYmplY3Qgb2YgZHluYW1pYyBwYXJhbWV0ZXJzIGZyb20gdGhlIG5hbWUgb2YgdGhlIGF0dHJpYnV0ZSBpdHNlbGZcbi8vICAqXHRcdEBvcHRpb24ge1N0cmluZ30gYXR0cmlidXRlIC0+IG5hbWUgb2YgYm91bmQgYXR0cmlidXRlLCBlLmcuICdiaW5kLXRleHQnXG4vLyAgKlx0XHRAb3B0aW9uIHtDb21wb25lbnR9IGNvbXBvbmVudFxuLy8gICpcdFx0QG9wdGlvbiB7QmFja2JvbmUuTW9kZWx9IFttb2RlbF0gLSBkZWZhdWx0cyB0byBgY29tcG9uZW50Lm1vZGVsYFxuLy8gICovXG4vLyB2YXIgX3JlbmRlckJpbmRpbmdzID0gZnVuY3Rpb24gKCBvcHRpb25zICkge1xuLy8gXHR2YXIgY29tcG9uZW50ID0gb3B0aW9ucy5jb21wb25lbnQ7XG4vLyBcdHZhciBhdHRyaWJ1dGVFeHByZXNzaW9uID0gb3B0aW9ucy5hdHRyaWJ1dGU7XG4vLyBcdHZhciBtb2RlbCA9IG9wdGlvbnMubW9kZWwgfHwgb3B0aW9ucy5jb21wb25lbnQubW9kZWw7XG5cblxuLy8gXHQvLyBDYWxjdWxhdGUgc3RyaW5nIHdoaWNoIGNhbiBiZSBcIm5ldy1lZFwiIGludG8gYSBSZWdFeHBcbi8vIFx0dmFyIGF0dHJSZWdFeHBTdHIgPSBfYXR0ck5hbWVUb1JlZ0V4cChhdHRyaWJ1dGVFeHByZXNzaW9uKTtcbi8vIFx0dmFyIGF0dHJSZWdFeHAgPSBuZXcgUmVnRXhwKGF0dHJSZWdFeHBTdHIpO1xuXG5cbi8vIFx0dmFyIGJvdW5kQXR0clNlbGVjdG9yID0gJzptYXRjaEF0dHIoXCInICsgYXR0clJlZ0V4cFN0ciArICdcIiknO1xuXG4vLyBcdC8vIEZpbmQgYWxsIHJlbGV2YW50IGRlc2NlbmRhbnQgZWxlbWVudHNcbi8vIFx0dmFyICRtYXRjaGVzID0gX2dldCRNYXRjaGVzKGJvdW5kQXR0clNlbGVjdG9yLCBjb21wb25lbnQpO1xuXG4vLyBcdC8vIEVhcmx5IGV4aXQgZm9yIHNpbXBsZSBiaW5kaW5ncyAody9vIGJvdW5kIHBhcmFtcylcbi8vIFx0aWYgKCAhYXR0cmlidXRlRXhwcmVzc2lvbi5tYXRjaCgvXFw6LykpIHtcbi8vIFx0XHQkbWF0Y2hlcy5lYWNoKGZ1bmN0aW9uICgpIHtcbi8vIFx0XHRcdF9yZW5kZXJCaW5kaW5nKCQodGhpcyksIGF0dHJpYnV0ZUV4cHJlc3Npb24sIG1vZGVsLCBvcHRpb25zLnJlbmRlckZuLCB7fSk7XG5cbi8vIFx0XHR9KTtcbi8vIFx0XHRyZXR1cm47XG4vLyBcdH1cblxuLy8gXHRjb25zb2xlLmxvZygnXFxuUmVuZGVyaW5nIHBhcmFtZXRlcml6ZWQgZGF0YSBiaW5kaW5nOiAnLGF0dHJSZWdFeHApO1xuXG4vLyBcdC8vIFRPRE86IGJhdGNoIGl0IHVwIHNvIHdlIG9ubHkgZG8gb25lIERPTSBxdWVyeVxuLy8gXHQkbWF0Y2hlcy5lYWNoKGZ1bmN0aW9uIGVhY2hFbGVtZW50V2l0aEFCaW5kaW5nICgpIHtcbi8vIFx0XHR2YXIgJG1hdGNoZWRFbCA9ICQodGhpcyk7XG5cbi8vIFx0XHQvLyBHZXQgYWxsIGF0dHJpYnV0ZXMgZm9yIHRoaXMgJGVsIGFuZCBmaWx0ZXIgYSBzZXQgb2YgbWF0Y2hpbmcgbmFtZXMvcGFyYW1zXG4vLyBcdFx0dmFyIGFsbERPTUF0dHJOYW1lcyA9IF8ubWFwKCAkbWF0Y2hlZEVsWzBdLmF0dHJpYnV0ZXMsIGZ1bmN0aW9uIChlbCkge1xuLy8gXHRcdFx0cmV0dXJuIGVsLm5vZGVOYW1lO1xuLy8gXHRcdH0pO1xuLy8gXHRcdGNvbnNvbGUubG9nKCdhbGxET01BdHRyTmFtZXMgZm9yIGVsJyxhbGxET01BdHRyTmFtZXMsICRtYXRjaGVkRWwpO1xuLy8gXHRcdHZhciBtYXRjaGluZ0RPTUF0dHJzID0ge307XG4vLyBcdFx0Xy5lYWNoKCBhbGxET01BdHRyTmFtZXMsIGZ1bmN0aW9uIGVhY2hBdHRyaWJ1dGUgKCBkb21BdHRyTmFtZSApIHtcbi8vIFx0XHRcdC8vIGNvbnNvbGUubG9nKCdjaGVja2luZycsZG9tQXR0ck5hbWUpO1xuLy8gXHRcdFx0aWYgKCBkb21BdHRyTmFtZS5tYXRjaChhdHRyUmVnRXhwKSkge1xuLy8gXHRcdFx0XHRtYXRjaGluZ0RPTUF0dHJzW2RvbUF0dHJOYW1lXSA9IF9leHRyYWN0UGFyYW1ldGVycyggYXR0clJlZ0V4cCwgZG9tQXR0ck5hbWUsIGF0dHJpYnV0ZUV4cHJlc3Npb24gKTtcbi8vIFx0XHRcdFx0Ly8gY29uc29sZS5sb2coJywgZ290JyxtYXRjaGluZ0RPTUF0dHJzW2RvbUF0dHJOYW1lXSwgJyAoKCgnLGRvbUF0dHJOYW1lLCBhdHRyaWJ1dGVFeHByZXNzaW9uKTtcbi8vIFx0XHRcdH1cbi8vIFx0XHR9KTtcblxuXG4vLyBcdFx0Y29uc29sZS5sb2coJyAqKioqIG1hdGNoaW5nRE9NQXR0cnMgOjonLCBtYXRjaGluZ0RPTUF0dHJzKTtcblxuLy8gXHRcdHRocm93IG5ldyBFcnJvcignaHdhYWEnKTtcbi8vIFx0XHRfLmVhY2gobWF0Y2hpbmdET01BdHRycywgZnVuY3Rpb24gKCBuYW1lZFBhcmFtcywgZG9tQXR0cmlidXRlTmFtZSApIHtcbi8vIFx0XHRcdF9yZW5kZXJCaW5kaW5nKCRtYXRjaGVkRWwsIGRvbUF0dHJpYnV0ZU5hbWUsIG1vZGVsLCBvcHRpb25zLnJlbmRlckZuLCBuYW1lZFBhcmFtcyk7XG4vLyBcdFx0fSk7XG5cbi8vIFx0fSk7XG4vLyB9O1xuXG5cblxuIiwiLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzXG4gKi9cbnZhciBkZWxldGVBbGxSZWdpb25zID0gcmVxdWlyZSgnLi9kZWxldGVBbGxSZWdpb25zJyksXG5cdGVsMkRlZmF1bHRUZW1wbGF0ZUlEID0gcmVxdWlyZSgnLi4vdXRpbHMvZWwyRGVmYXVsdFRlbXBsYXRlSUQnKTtcblxuXG5cbi8qKlxuICogSW5zdGFudGlhdGUgcmVnaW9uIGNvbXBvbmVudHMgYW5kIGFwcGVuZCBhbnkgZGVmYXVsdFxuICogdGVtcGxhdGVzL2NvbXBvbmVudHMgdG8gdGhlIERPTVxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcmVuZGVyUmVnaW9ucyAoKSB7XG5cdHZhciBzZWxmID0gdGhpcztcblxuXHRkZWxldGVBbGxSZWdpb25zKCk7XG5cblx0Ly8gVE9ETzogZ2V0IGNsb3Nlc3QgZGVzY2VuZGFudCByZWdpb25zLCBub3QgYWxsIGRlc2NlbmRhbnQgcmVnaW9uc1xuXG5cdC8vIERldGVjdCBjaGlsZCByZWdpb25zIGluIHRlbXBsYXRlXG5cdHZhciAkcmVnaW9ucyA9IHRoaXMuJCgncmVnaW9uLCBbZGF0YS1yZWdpb25dJyk7XG5cblx0Ly8gQnV0IGFsc28gY2hlY2sgdGhlIHRvcC1sZXZlbCBlbGVtZW50IG9mIHRoZSBjb21wb25lbnQncyB0ZW1wbGF0ZSBpdHNlbGYsXG5cdC8vIGluIGNhc2UgdGhlIHRvcC1sZXZlbCBlbGVtZW50IGlzIElUUyBPV04gcmVnaW9uXG5cdCRyZWdpb25zID0gJHJlZ2lvbnMuYWRkKCB0aGlzLiRlbC5maWx0ZXIoJ3JlZ2lvbiwgW2RhdGEtcmVnaW9uXScpICk7XG5cblx0JHJlZ2lvbnMuZWFjaChmdW5jdGlvbiAoaSwgZWwpIHtcblxuXHRcdC8vIERldGVjdCBkZWZhdWx0IGNvbXBvbmVudCBpZCBmb3IgY2hpbGQgcmVnaW9uXG5cdFx0dmFyIGRlZmF1bHRDb21wb25lbnRJZCA9IGVsMkRlZmF1bHRUZW1wbGF0ZUlEKGVsKTtcblxuXHRcdC8vIEdlbmVyYXRlIGEgcmVnaW9uIGluc3RhbmNlIGZyb20gdGhlIGVsZW1lbnRcblx0XHQvLyAobW9kaWZ5aW5nIHRoZSBET00gYXMgbmVjZXNzYXJ5KVxuXHRcdHZhciByZWdpb24gPSBGUkFNRVdPUksuUmVnaW9uLmZyb21FbGVtZW50KGVsLCBzZWxmKTtcblxuXHRcdC8vIElmIHJlZ2lvbiBoYXMgbm8gaWQsIGdlbmVyYXRlIGEgdW5pcXVlIHJlZ2lvbiBpZCB3L2kgdGhpcyBjb21wb25lbnRcblx0XHQvLyB0aGF0IGlzIHVubGlrZWx5IHRvIGNvbGxpZGUgd2l0aCBteSBvdGhlciBuYW1lZCByZWdpb25zXG5cdFx0aWYgKCFyZWdpb24uaWQpIHtcblx0XHRcdHJlZ2lvbi5pZCA9ICcnK1xuXHRcdFx0XHRGUkFNRVdPUksub3B0aW9ucy5mcmFtZXdvcmtJZCArXG5cdFx0XHRcdCdfX2Fub255bW91c19yZWdpb25fXycgK1xuXHRcdFx0XHRzZWxmLmFub255bW91c1JlZ2lvbkNvdW50ZXI7XG5cblx0XHRcdC8vIEluY3JlbWVudCBjb3VudGVyIGZvciBuZXh0IHRpbWVcblx0XHRcdHNlbGYuYW5vbnltb3VzUmVnaW9uQ291bnRlcisrO1xuXHRcdH1cblxuXHRcdC8vIEtlZXAgdHJhY2sgb2YgcmVnaW9ucywgc2luY2Ugd2UgYXJlIHRoZSBwYXJlbnQgY29tcG9uZW50XG5cdFx0c2VsZi5yZWdpb25zW3JlZ2lvbi5pZF0gPSByZWdpb247XG5cblx0XHQvLyBBcyBsb25nIGFzIHRoZXJlIGFyZSBubyBjb2xsaXNpb25zLCBhbHNvIHByb3ZpZGUgYWNjZXNzIHRvIHRoZSByZWdpb25cblx0XHQvLyBvbiB0aGUgdG9wIGxldmVsIG9mIHRoZSBjb21wb25lbnQsIGUuZy4gc28geW91IGNhbiBkbyBgdGhpcy5teVJlZ2lvbmBcblx0XHQvLyBpbiB5b3VyIGNvbXBvbmVudCBtZXRob2RzLlxuXHRcdGlmICghc2VsZltyZWdpb24uaWRdKSB7XG5cdFx0XHRzZWxmW3JlZ2lvbi5pZF0gPSByZWdpb247XG5cdFx0fVxuXHR9KTtcbn07XG5cbiIsIi8qKlxuICogQ2hlY2sgdGhlIHNwZWNpZmllZCBkZWZpbml0aW9uIGZvciBvYnZpb3VzIG1pc3Rha2VzLCBlc3BlY2lhbGx5IGxpa2VseSBkZXByZWNhdGlvbnMgYW5kXG4gKiB2YWxpZGF0ZSB0aGF0IHRoZSBtb2RlbCBhbmQgY29sbGVjdGlvbnMgYXJlIGluc3RhbmNlcyBvZiBCYWNrYm9uZSdzIERhdGEgc3RydWN0dXJlcy5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gcHJvcGVydGllcyBbT2JqZWN0IGNvbnRhaW5pbmcgdGhlIHByb3BlcnRpZXMgb2YgdGhlIGNvbXBvbmVudF1cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHZhbGlkYXRlRGVmaW5pdGlvbihwcm9wZXJ0aWVzKSB7XG5cblx0aWYgKF8uaXNPYmplY3QocHJvcGVydGllcykpIHtcblxuXHRcdC8vIERldGVybWluZSBjb21wb25lbnQgaWRcblx0XHR2YXIgaWQgPSB0aGlzLmlkIHx8IHByb3BlcnRpZXMuaWQ7XG5cblx0XHRmdW5jdGlvbiBfdmFsaWRhdGVCYWNrYm9uZUluc3RhbmNlICh0eXBlKSB7XG5cdFx0XHR2YXIgVHlwZSA9IHR5cGVbMF0udG9VcHBlckNhc2UoKSArIHR5cGUuc2xpY2UoMSk7XG5cblx0XHRcdGlmICggIXByb3BlcnRpZXNbdHlwZV0gaW5zdGFuY2VvZiBCYWNrYm9uZVtUeXBlXSApIHtcblxuXHRcdFx0XHRGcmFtZXdvcmsuZXJyb3IoXG5cdFx0XHRcdFx0J0NvbXBvbmVudCAoJyArIGlkICsgJykgaGFzIGFuIGludmFsaWQgJyArIHR5cGUgKyAnLS0gXFxuJyArXG5cdFx0XHRcdFx0J0lmIGAnICsgdHlwZSArICdgIGlzIHNwZWNpZmllZCBmb3IgYSBjb21wb25lbnQsICcgK1xuXHRcdFx0XHRcdCdpdCBtdXN0IGJlIGFuICppbnN0YW5jZSogb2YgYSBCYWNrYm9uZS4nICsgVHlwZSArICcuXFxuJyk7XG5cblx0XHRcdFx0aWYgKHByb3BlcnRpZXNbdHlwZV0gaW5zdGFuY2VvZiBCYWNrYm9uZVtUeXBlXS5jb25zdHJ1Y3Rvcikge1xuXHRcdFx0XHRcdEZyYW1ld29yay5lcnJvcihcblx0XHRcdFx0XHRcdCdJdCBsb29rcyBsaWtlIGEgQmFja2JvbmUuJyArIFR5cGUgKyAnICpwcm90b3R5cGUqIHdhcyBzcGVjaWZpZWQgaW5zdGVhZCBvZiBhICcgK1xuXHRcdFx0XHRcdFx0J0JhY2tib25lLicgKyBUeXBlICsgJyAqaW5zdGFuY2UqLlxcbicgK1xuXHRcdFx0XHRcdFx0J1BsZWFzZSBgbmV3YCB1cCB0aGUgJyArIHR5cGUgKyAnIC1iZWZvcmUtICcgKyBGcmFtZXdvcmsuaWQgKyAnLnJhaXNlKCksJyArXG5cdFx0XHRcdFx0XHQnb3IgdXNlIGEgd3JhcHBlciBmdW5jdGlvbiB0byBhY2hpZXZlIHRoZSBzYW1lIGVmZmVjdCwgZS5nLjpcXG4nICtcblx0XHRcdFx0XHRcdCdgJyArIHR5cGUgKyAnOiBmdW5jdGlvbiAoKSB7XFxucmV0dXJuIG5ldyBTb21lJyArIFR5cGUgKyAnKCk7XFxufWAnXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdEZyYW1ld29yay53YXJuKCdJZ25vcmluZyBpbnZhbGlkICcgKyB0eXBlICsgJyA6OiAnICsgcHJvcGVydGllc1t0eXBlXSk7XG5cdFx0XHRcdGRlbGV0ZSBwcm9wZXJ0aWVzW3R5cGVdO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENoZWNrIHRoYXQgdGhpcy5jb2xsZWN0aW9uIGlzIGFjdHVhbGx5IGFuIGluc3RhbmNlIG9mIEJhY2tib25lLkNvbGxlY3Rpb25cblx0XHQvLyBhbmQgdGhhdCB0aGlzLm1vZGVsIGlzIGFjdHVhbGx5IGFuIGluc3RhbmNlIG9mIEJhY2tib25lLk1vZGVsXG5cdFx0X3ZhbGlkYXRlQmFja2JvbmVJbnN0YW5jZSgnbW9kZWwnKTtcblx0XHRfdmFsaWRhdGVCYWNrYm9uZUluc3RhbmNlKCdjb2xsZWN0aW9uJyk7XG5cblx0XHQvLyBDbG9uZSBwcm9wZXJ0aWVzIHRvIGF2b2lkIGluYWR2ZXJ0ZW50IG1vZGlmaWNhdGlvbnNcblx0XHRyZXR1cm4gXy5jbG9uZShwcm9wZXJ0aWVzKTtcblx0fVxuXG5cdGVsc2UgcmV0dXJuIHt9O1xuXG59XG4iLCIvKipcbiAqIFJ1biBkZWZpbml0aW9uIG1ldGhvZHMgdG8gZ2V0IGFjdHVhbCBjb21wb25lbnQgZGVmaW5pdGlvbnMuXG4gKiBUaGlzIGlzIGRlZmVycmVkIHRvIGF2b2lkIGhhdmluZyB0byB1c2UgQmFja2JvbmUncyBmdW5jdGlvbiAoKSB7fSBhcHByb2FjaCBmb3IgdGhpbmdzXG4gKiBsaWtlIGNvbGxlY3Rpb25zLlxuICovXG5cbi8qKlxuICogQnVpbGQgdXBzIGEgY29tcG9uZW50IGRlZmluaXRpb24gYnkgcnVubmluZyB0aGUgZGVmaW5pdGlvbi4gV2UgdGhlbiBsaW5rIHRoZVxuICogY29tcG9uZW50IGRlZmluaXRpb24gdG8gYW4gaWRlbnRpZmllciBpbiBgRlJBTUVXT1JLLmNvbXBvbmVudHNgLlxuICpcbiAqIEBwYXJhbSAge09iamVjdH0gY29tcG9uZW50IFtPYmplY3QgY29udGFpbmluZyB0aGUgZGVmaW5pdGlvbiBmdW5jdGlvbiBvZiB0aGUgY29tcG9uZW50XVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGJ1aWxkQ29tcG9uZW50RGVmaW5pdGlvbihjb21wb25lbnQpIHtcblx0dmFyIGNvbXBvbmVudERlZiA9IGNvbXBvbmVudC5kZWZpbml0aW9uKCk7XG5cblx0aWYgKGNvbXBvbmVudC5pZE92ZXJyaWRlKSB7XG5cdFx0aWYgKGNvbXBvbmVudERlZi5pZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGNvbXBvbmVudC5pZE92ZXJyaWRlICsgJzo6IENhbm5vdCBzcGVjaWZ5IGFuIGlkT3ZlcnJpZGUgaW4gLmRlZmluZSgpIGlmIGFuIGlkIHByb3BlcnR5ICgnK2NvbXBvbmVudERlZi5pZCsnKSBpcyBhbHJlYWR5IHNldCBpbiB5b3VyIGNvbXBvbmVudCBkZWZpbml0aW9uIVxcblVzYWdlOiAuZGVmaW5lKFtpZE92ZXJyaWRlXSwgZGVmaW5pdGlvbiknKTtcblx0XHR9XG5cdFx0Y29tcG9uZW50RGVmLmlkID0gY29tcG9uZW50LmlkT3ZlcnJpZGU7XG5cdH1cblx0aWYgKCFjb21wb25lbnREZWYuaWQpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCB1c2UgLmRlZmluZSgpIHdpdGhvdXQgZGVmaW5pbmcgYW4gaWQgcHJvcGVydHkgb3Igb3ZlcnJpZGUgaW4geW91ciBjb21wb25lbnQhXFxuVXNhZ2U6IC5kZWZpbmUoW2lkT3ZlcnJpZGVdLCBkZWZpbml0aW9uKScpO1xuXHR9XG5cdEZSQU1FV09SSy5jb21wb25lbnRzW2NvbXBvbmVudERlZi5pZF0gPSBjb21wb25lbnREZWY7XG59O1xuIiwiLyoqXG4gKiBPcHRpb25hbCBtZXRob2QgdG8gcmVxdWlyZSBhcHAgY29tcG9uZW50cy4gUmVxdWlyZS5qcyBjYW4gYmUgdXNlZCBpbnN0ZWFkXG4gKiBhcyBuZWVkZWQuXG4gKlxuICogQHBhcmFtICB7U3RyaW5nfSBcdFsob3B0aW9uYWwpIENvbXBvbmVudCBpZCBvdmVycmlkZV1cbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSBbRnVuY3Rpb24gRGVmaW5pdGlvbiBvZiBjb21wb25lbnRdXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZGVmaW5lKGlkLCBkZWZpbml0aW9uRm4pIHtcblx0Ly8gSWQgcGFyYW0gaXMgb3B0aW9uYWxcblx0aWYgKCFkZWZpbml0aW9uRm4pIHtcblx0XHRkZWZpbml0aW9uRm4gPSBpZDtcblx0XHRpZCA9IG51bGw7XG5cdH1cblxuXHRGUkFNRVdPUksuX2RlZmluZVF1ZXVlLnB1c2goe1xuXHRcdGRlZmluaXRpb246IGRlZmluaXRpb25Gbixcblx0XHRpZE92ZXJyaWRlOiBpZFxuXHR9KTtcbn07XG4iLCIvKipcbiAqIE1hc3QgYnVpbGQgZmlsZS4gVGhlIG1haW4gZmlsZVxuICovXG5cbnZhciBkZWZpbmUgPSByZXF1aXJlKCcuL2RlZmluZS9pbmRleCcpO1xudmFyIFJlZ2lvbiA9IHJlcXVpcmUoJy4vcmVnaW9uL2luZGV4Jyk7XG52YXIgQ29tcG9uZW50ID0gcmVxdWlyZSgnLi9jb21wb25lbnQvaW5kZXgnKTtcbnZhciByYWlzZSA9IHJlcXVpcmUoJy4vcmFpc2UvaW5kZXgnKTtcblxuLyoqXG4gKiBGcmFtZXdvcmsgY2xhc3MgZGVmaW5pdGlvbiB0aGF0IHdpbGwgY3JlYXRlIGEgbmV3IGdsb2JhbCBpbnN0YW5jZSBvZiBhIGN1c3RvbSBGcmFtZXdvcmsuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgW29wdGlvbnMgaGFzaCB0byBpbml0aWFsaXplIHRoZSBjdXN0b20gZnJhbWV3b3JrIHdpdGhdXG4gKi9cbnZhciBGcmFtZXdvcmsgPSBmdW5jdGlvbihvcHRpb25zKSB7XG5cblx0Ly8gU2V0IHRoZSBkZWZhdWx0IG9wdGlvbnMgZm9yIHRob3NlIG5vdCBwYXNzZWQgaW4uXG5cdG9wdGlvbnMgPSBfLmRlZmF1bHRzKG9wdGlvbnMgfHwge30sIHtcblx0XHR0aHJvdHRsZVdpbmRvd1Jlc2l6ZTogMjAwLFxuXHRcdGxvZ0xldmVsOiAnd2FybicsXG5cdFx0ZnJhbWV3b3JrSWQ6ICdtYXN0Jyxcblx0XHRwcm9kdWN0aW9uOiBmYWxzZSxcblx0XHRsb2dnZXI6IHVuZGVmaW5lZCxcblx0XHRzaG9ydGN1dDoge1xuXHRcdFx0dGVtcGxhdGU6IHRydWUsXG5cdFx0XHRjb3VudDogdHJ1ZVxuXHRcdH1cblx0fSk7XG5cblx0Ly8gU2V0IGEgc3RhcnRpbmcgcG9pbnQgdG8gQmFja2JvbmUgYW5kIGFkZCBhZGRpdGlvbmFsIGF0dHJpYnV0ZS5cblx0Xy5leHRlbmQodGhpcywgQmFja2JvbmUsIHtcblx0XHRvcHRpb25zOiBvcHRpb25zLFxuXHRcdHRlbXBsYXRlczoge30sXG5cdFx0Y29tcG9uZW50czoge30sXG5cdFx0ZGF0YToge30sXG5cdFx0X2RlZmluZVF1ZXVlOiBbXSxcblx0XHRyZWdpb25zOiB7fVxuXHR9KTtcblxuXHQvKipcblx0ICogRXh0ZW5kIEZSQU1FV09SSy5Db2xsZWN0aW9uIHRvIG1ha2UgaXQgYmV0dGVyXG5cdCAqIChzcGVjaWZpY2FsbHksIHRvIGFkZCBlcnJvciBoYW5kbGluZylcblx0ICovXG5cdHZhciBzZWxmID0gdGhpcztcblx0dmFyIG9yaWdpbmFsQ29sbGVjdGlvbiA9IHRoaXMuQ29sbGVjdGlvbjtcblx0dGhpcy5Db2xsZWN0aW9uID0gb3JpZ2luYWxDb2xsZWN0aW9uLmV4dGVuZCh7XG5cblx0XHRpbml0aWFsaXplOiBmdW5jdGlvbiAob3B0aW9ucykge1xuXG5cdFx0XHQvLyBPdmVycmlkZSBgY29sbGVjdGlvbi5mZXRjaCgpYFxuXHRcdFx0dGhpcy5fZmV0Y2ggPSB0aGlzLmZldGNoO1xuXHRcdFx0dGhpcy5mZXRjaCA9IHRoaXNbJ19mZXRjaCsrJ107XG5cdFx0fSxcblxuXG5cdFx0LyoqXG5cdFx0ICogYWZ0ZXJFcnJvclxuXHRcdCAqXG5cdFx0ICogTGlmZWN5Y2xlIGNhbGxiYWNrIHRvIGNhdGNoIHdoZW4gYSBmZXRjaCBlcnJvciBvY2N1cnNcblx0XHQgKlxuXHRcdCAqIFRPRE86XG5cdFx0ICogUHJvYmFibHkgcmVtb3ZlIHRoaXMtLSByZWFzb25pbmcgOjpcblx0XHQgKiBJbiBtb3N0IGNhc2VzLCB5b3UgYWN0dWFsbHkgY2FyZSBhYm91dCB0aGUgZXJyb3IgaW5cblx0XHQgKiB0aGUgcmVsZXZhbnQgY29tcG9uZW50cyB3aG8gYXJlIHVzaW5nIHRoaXMgY29sbGVjdGlvbixcblx0XHQgKiBpbiB3aGljaCBjYXNlIHlvdSdkIGp1c3QgYmluZCBhbiBlcnJvciBldmVudCBoYW5kbGVyLlxuXHRcdCAqL1xuXHRcdGFmdGVyRXJyb3I6IGZ1bmN0aW9uIChjb2xsZWN0aW9uLCB4aHIsIG9wdGlvbnMpIHtcblx0XHRcdC8vIHRoaXMgZXhpc3RzIGZvciB5b3UgdG8gb3ZlcnJpZGUgaXQhXG5cdFx0fSxcblxuXG5cblxuXHRcdC8qKlxuXHRcdCAqIE92ZXJyaWRlIEJhY2tib25lLkNvbGxlY3Rpb24ncyBgZmV0Y2goKWBcblx0XHQgKiB0byBhbGxvdyBmb3IgYmV0dGVyIGVycm9yIGhhbmRsaW5nLlxuXHRcdCAqXG5cdFx0ICogVE9ETzogcHVsbCB0aGlzIGludG8gQmFja2JvbmUuc3luYyBpbnN0ZWFkLi5cblx0XHQgKiBvbmx5IHByb2JsZW0gaXMgY2xhc2hpbmcgd2l0aCBvdGhlciBzeW5jIG92ZXJyaWRlc1xuXHRcdCAqL1xuXHRcdCdfZmV0Y2grKyc6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG5cdFx0XHR2YXIgY29sbGVjdGlvbiA9IHRoaXM7XG5cblx0XHRcdG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG5cdFx0XHQvLyBMb2cgYSBmcmllbmRsaWVyIFwiTm8gVVJMXCIgbWVzc2FnZTpcblx0XHRcdGlmICggIWNvbGxlY3Rpb24udXJsICkge1xuXHRcdFx0XHRzZWxmLmVycm9yKCdDYW5ub3QgZmV0Y2goKSAnICsgY29sbGVjdGlvbi50eXBlICsgJyA6OiBDb2xsZWN0aW9uIGhhcyBubyBVUkwgZnVuY3Rpb24vcHJvcGVydHkuLi4nKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBPdmVycmlkZSBlcnJvciBoYW5kbGVyIHRvIG1peGluIGFuICdlcnJvcicgZXZlbnRcblx0XHRcdHZhciBvcmlnaW5hbEVycm9ySGFuZGxlciA9IG9wdGlvbnMuZXJyb3I7XG5cdFx0XHR2YXIgb3JpZ2luYWxTdWNjZXNzSGFuZGxlciA9IG9wdGlvbnMuc3VjY2Vzcztcblx0XHRcdF8uZXh0ZW5kKG9wdGlvbnMsIHtcblx0XHRcdFx0c3VjY2VzczogZnVuY3Rpb24gKGNvbGxlY3Rpb24sIHhociwgb3B0aW9ucykge1xuXHRcdFx0XHRcdHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcblxuXHRcdFx0XHRcdC8vIE51bGwgb3V0IGBjb2xsZWN0aW9uLnN5bmNpbmdgXG5cdFx0XHRcdFx0Y29sbGVjdGlvbi5zeW5jaW5nID0gbnVsbDtcblxuXHRcdFx0XHRcdC8vIFRyaWdnZXIgb3JpZ2luYWwgc3VjY2VzcyBoYW5kbGVyIGlmIHNwZWNpZmllZFxuXHRcdFx0XHRcdC8vIG9uIGBmZXRjaCh7c3VjY2VzczogZnVuY3Rpb24oKXsvKi4uLiovfX0pYFxuXHRcdFx0XHRcdGlmIChvcmlnaW5hbFN1Y2Nlc3NIYW5kbGVyKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gb3JpZ2luYWxTdWNjZXNzSGFuZGxlci5hcHBseShjb2xsZWN0aW9uLCBhcmdzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGVycm9yOiBmdW5jdGlvbiAoY29sbGVjdGlvbiwgeGhyLCBvcHRpb25zKSB7XG5cdFx0XHRcdFx0dmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuXG5cdFx0XHRcdFx0Ly8gTnVsbCBvdXQgYGNvbGxlY3Rpb24uc3luY2luZ2Bcblx0XHRcdFx0XHRjb2xsZWN0aW9uLnN5bmNpbmcgPSBudWxsO1xuXG5cdFx0XHRcdFx0Ly8gSWYgdGhpcyBpcyBhbiBcImFib3J0XCIsIGlnbm9yZSBpdC0gKHN0YXRlIGhhcyBhbHJlYWR5IGJlZW4gdGFrZW4gY2FyZSBvZilcblx0XHRcdFx0XHRpZiAoIHhociAmJiB4aHIuc3RhdHVzVGV4dD09PSdhYm9ydCcgKSByZXR1cm47XG5cblx0XHRcdFx0XHQvLyBTZXQgYGNvbGxlY3Rpb24uZXJyb3JgIHVzaW5nIHRoZSByZXNwb25zZSBmcm9tIHRoZSBmZXRjaFxuXHRcdFx0XHRcdC8vICh0cnkganNvbiwgdGhlbiByZXNwb25zZSB0ZXh0LCB0aGVuIHN0YXR1cyBjb2RlLCB0aGVuIGp1c3QgZGVmYXVsdCB0byBgdHJ1ZWApXG5cdFx0XHRcdFx0Y29sbGVjdGlvbi5lcnJvciA9XG5cdFx0XHRcdFx0XHQoIHhociAmJiB4aHIucmVzcG9uc2VKU09OICkgPyB4aHIucmVzcG9uc2VKU09OIDpcblx0XHRcdFx0XHRcdCggeGhyICYmIHhoci5yZXNwb25zZVRleHQgKSA/IHhoci5yZXNwb25zZVRleHQgOlxuXHRcdFx0XHRcdFx0dHJ1ZTtcblxuXG5cdFx0XHRcdFx0Ly8gQ2FsbCBgYWZ0ZXJFcnJvcigpYFxuXHRcdFx0XHRcdGNvbGxlY3Rpb24uYWZ0ZXJFcnJvci5hcHBseShjb2xsZWN0aW9uLGFyZ3MpO1xuXG5cdFx0XHRcdFx0Ly8gVHJpZ2dlciBvcmlnaW5hbCBlcnJvciBoYW5kbGVyIGlmIHNwZWNpZmllZFxuXHRcdFx0XHRcdC8vIG9uIGBmZXRjaCh7ZXJyb3I6IGZ1bmN0aW9uKCl7LyouLi4qL319KWBcblx0XHRcdFx0XHRpZiAob3JpZ2luYWxFcnJvckhhbmRsZXIpIHtcblx0XHRcdFx0XHRcdHJldHVybiBvcmlnaW5hbEVycm9ySGFuZGxlci5hcHBseShjb2xsZWN0aW9uLCBhcmdzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBOdWxsIG91dCBgY29sbGVjdGlvbi5lcnJvcmBcblx0XHRcdGNvbGxlY3Rpb24uZXJyb3IgPSBudWxsO1xuXG5cdFx0XHQvLyBJZiBgZmV0Y2hgIGlzIGFscmVhZHkgaW4gcHJvZ3Jlc3MsIGNhbmNlbCBpdFxuXHRcdFx0Ly8gYW5kIGZpcmUgb2ZmIGEgbmV3IG9uZS5cblx0XHRcdGlmIChjb2xsZWN0aW9uLnN5bmNpbmcpIHtcblx0XHRcdFx0c2VsZi5sb2coJ0Fib3J0aW5nIHJ1bm5pbmcgYGZldGNoKClgIGluIG9yZGVyIHRvIHN0YXJ0IGEgbmV3IGBmZXRjaCgpYC4uLicpO1xuXHRcdFx0XHRjb2xsZWN0aW9uLnN5bmNpbmcuYWJvcnQoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ2FsbCBvcmlnaW5hbCBgZmV0Y2goKWAgdXNpbmcgb3VyIG1vbmtleS1wYXRjaGVkIG9wdGlvbnNcblx0XHRcdHZhciB4aHIgPSBjb2xsZWN0aW9uLl9mZXRjaChvcHRpb25zKTtcblxuXHRcdFx0Ly8gU2V0IGBjb2xsZWN0aW9uLnN5bmNpbmdgIHRvIHRoZSBYSFIgb2JqZWN0IGluIHVzZVxuXHRcdFx0Y29sbGVjdGlvbi5zeW5jaW5nID0geGhyO1xuXG5cdFx0XHQvLyBSZXR1cm4gdGhlIFhIUiBvYmplY3QgdG8gbWFpbnRhaW4gb3JpZ2luYWwgYEJhY2tib25lLkNvbGxlY3Rpb24uZmV0Y2goKWAgQVBJXG5cdFx0XHRyZXR1cm4geGhyO1xuXHRcdH1cblxuXHR9KTtcblxuXG5cdC8vIFRocm91Z2hvdXQgdGhlIHNvdXJjZSBjb2RlLCB0aGVyZSBhcmUgb3BlcmF0aW9ucyBvbiBgRlJBTUVXT1JLYCBvciBjb2RlIHRoYXQgYWNjZXNzZXNcblx0Ly8gaXRzIGF0dHJpYnV0ZXMuIFNvIHdlIG1ha2UgYEZSQU1FV09SS2AgYWNjZXNzaWJsZS5cblx0Ly9cblx0Ly8gTm90ZTpcblx0Ly8gYEZSQU1FV09SS2Agd2lsbCBvbmx5IGJlIGEgZ2xvYmFsIHZhcmlhYmxlICoqIGR1cmluZyB0aGUgYnVpbGQgKipcblx0RlJBTUVXT1JLID0gdGhpcztcblxuXG59O1xuXG4vLyBGcmFtZXdvcmsgcHJvdG90eXBlIG1ldGhvZHMuXG5GcmFtZXdvcmsucHJvdG90eXBlLlJlZ2lvbiA9IFJlZ2lvbjtcbkZyYW1ld29yay5wcm90b3R5cGUuQ29tcG9uZW50ID0gQ29tcG9uZW50O1xuRnJhbWV3b3JrLnByb3RvdHlwZS5kZWZpbmUgPSBkZWZpbmU7XG5GcmFtZXdvcmsucHJvdG90eXBlLnJhaXNlID0gcmFpc2U7XG5cblxuLy8gSW5zdGFudGlhdGUgRnJhbWV3b3JrIGluc3RhbmNlXG52YXIgZnJhbWV3b3JrID0gbmV3IEZyYW1ld29yaygpO1xuXG4vLyBUT0RPOiBmdXR1cmVcbi8vIFJhaXNlIGltbWVkaWF0ZWx5LCBhbmQgdGhlbiBhbGwgbmV3IG1vZGVscyAvIG5ldyBjb21wb25lbnRzIC8gY2hhbmdlc1xuLy8gc2hvdWxkIGJlIGR5bmFtaWMgYXQgcnVudGltZS5cbi8vXG4vLyBGb3Igbm93LCBNYXN0LnJhaXNlKCkgaXMgc3RpbGwgbWFudWFsLlxuXG5cbi8vIEV4cG9zZSBpbnN0YW50aWF0ZWQgZnJhbWV3b3JrIHZpYSBVTUQ6XG5tb2R1bGUuZXhwb3J0cyA9IGZyYW1ld29yaztcbiIsIi8qKlxuICpcdExvZ2dldCBjb25zdHJ1Y3RvciBtZXRob2QgdGhhdCB3aWxsIHNldHVwIEZSQU1FV09SSyB0byBsb2cgbWVzc2FnZXMuXG4gKi9cblxudmFyIHNldHVwTG9nZ2VyID0gcmVxdWlyZSgnLi9zZXR1cCcpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIExvZ2dlcigpIHtcblxuXHQvLyBVcG9uIGluaXRpYWxpemF0aW9uLCBzZXR1cCBsb2dnZXJcblx0c2V0dXBMb2dnZXIoRlJBTUVXT1JLLm9wdGlvbnMubG9nTGV2ZWwpO1xuXG5cdC8vIEluIHN1cHBvcnRlZCBicm93c2VycywgYWxzbyBydW4gc2V0dXBMb2dnZXIgYWdhaW5cblx0Ly8gd2hlbiBGUkFNRVdPUksubG9nTGV2ZWwgaXMgc2V0IGJ5IHRoZSB1c2VyXG5cdC8vIFRPRE86IGZpbmQgYSB3YXkgdG8gZG8gdGhpcyB3aXRob3V0IGRlcGVuZGluZyBvbiBfX2RlZmluZVNldHRlcl9fLlxuXHRpZiAoXy5pc0Z1bmN0aW9uKEZSQU1FV09SSy5fX2RlZmluZVNldHRlcl9fKSkge1xuXHRcdEZSQU1FV09SSy5fX2RlZmluZVNldHRlcl9fKCdsb2dMZXZlbCcsIGZ1bmN0aW9uIG9uQ2hhbmdlIChuZXdMb2dMZXZlbCkge1xuXHRcdFx0c2V0dXBMb2dnZXIobmV3TG9nTGV2ZWwpO1xuXHRcdH0pO1xuXHR9XG59O1xuIiwiLyoqXG4gKiBTZXQgdXAgdGhlIGxvZyBmdW5jdGlvbnM6XG4gKlxuICogRlJBTUVXT1JLLmVycm9yXG4gKiBGUkFNRVdPUksud2FyblxuICogRlJBTUVXT1JLLmxvZ1xuICogRlJBTUVXT1JLLmRlYnVnICgqbGVnYWN5KVxuICogRlJBTUVXT1JLLnZlcmJvc2VcbiAqXG4gKiBAcGFyYW0gIHtTdHJpbmd9IGxvZ0xldmVsIFtUaGUgZGVzaXJlZCBsb2cgbGV2ZWwgb2YgdGhlIExvZ2dlcl1cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBzZXR1cExvZ2dlciAobG9nTGV2ZWwpIHtcblxuXHR2YXIgbm9vcCA9IGZ1bmN0aW9uICgpIHt9O1xuXG5cdC8vIElmIGxvZyBpcyBzcGVjaWZpZWQsIHVzZSBpdCwgb3RoZXJ3aXNlIHVzZSB0aGUgY29uc29sZVxuXHRpZiAoRlJBTUVXT1JLLmxvZ2dlcikge1xuXHRcdEZSQU1FV09SSy5lcnJvciAgICAgPSBGUkFNRVdPUksubG9nZ2VyLmVycm9yO1xuXHRcdEZSQU1FV09SSy53YXJuICAgICAgPSBGUkFNRVdPUksubG9nZ2VyLndhcm47XG5cdFx0RlJBTUVXT1JLLmxvZyAgICAgICA9IEZSQU1FV09SSy5sb2dnZXIuZGVidWcgfHwgRlJBTUVXT1JLLmxvZ2dlcjtcblx0XHRGUkFNRVdPUksudmVyYm9zZSAgID0gRlJBTUVXT1JLLmxvZ2dlci52ZXJib3NlO1xuXHR9XG5cblx0Ly8gSW4gSUUsIHdlIGNhbid0IGRlZmF1bHQgdG8gdGhlIGJyb3dzZXIgY29uc29sZSBiZWNhdXNlIHRoZXJlIElTIE5PIEJST1dTRVIgQ09OU09MRVxuXHRlbHNlIGlmICh0eXBlb2YgY29uc29sZSAhPT0gJ3VuZGVmaW5lZCcpIHtcblxuXHRcdC8vIFdlIGNhbm5vdCBjYWxsZWQgdGhlIC5iaW5kIG1ldGhvZCBvbiB0aGUgY29uc29sZSBtZXRob2RzLiBXZSBhcmUgaW4gaWUgOSBvciA4LCBqdXN0IG1ha2Vcblx0XHQvLyBldmVyeWh0aW5nIGEgbm9vcC5cblx0XHRpZiAoXy5pc1VuZGVmaW5lZChjb25zb2xlLmxvZy5iaW5kKSkgIHtcblx0XHRcdEZSQU1FV09SSy5lcnJvciAgICAgPSBub29wO1xuXHRcdFx0RlJBTUVXT1JLLndhcm4gICAgICA9IG5vb3A7XG5cdFx0XHRGUkFNRVdPUksubG9nICAgICAgID0gbm9vcDtcblx0XHRcdEZSQU1FV09SSy5kZWJ1ZyAgICAgPSBub29wO1xuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UgICA9IG5vb3A7XG5cdFx0fVxuXG5cdFx0Ly8gV2UgYXJlIGluIGEgZnJpZW5kbHkgYnJvd3NlciBsaWtlIENocm9tZSwgRmlyZWZveCwgb3IgSUUxMFxuXHRcdGVsc2Uge1xuXHRcdFx0RlJBTUVXT1JLLmVycm9yXHRcdD0gY29uc29sZS5lcnJvciAmJiBjb25zb2xlLmVycm9yLmJpbmQoY29uc29sZSk7XG5cdFx0XHRGUkFNRVdPUksud2Fyblx0XHQ9IGNvbnNvbGUud2FybiAmJiBjb25zb2xlLndhcm4uYmluZChjb25zb2xlKTtcblx0XHRcdEZSQU1FV09SSy5sb2dcdFx0XHQ9IGNvbnNvbGUuZGVidWcgJiYgY29uc29sZS5kZWJ1Zy5iaW5kKGNvbnNvbGUpO1xuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2VcdD0gY29uc29sZS5sb2cgJiYgY29uc29sZS5sb2cuYmluZChjb25zb2xlKTtcblxuXHRcdFx0Ly8gVXNlIGxvZyBsZXZlbCBjb25maWcgaWYgcHJvdmlkZWRcblx0XHRcdHN3aXRjaCAobG9nTGV2ZWwpIHtcblx0XHRcdFx0Y2FzZSAndmVyYm9zZSc6IGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgJ2RlYnVnJzpcblx0XHRcdFx0XHRGUkFNRVdPUksudmVyYm9zZSA9IG5vb3A7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSAnd2Fybic6XG5cdFx0XHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UgPSBGUkFNRVdPUksubG9nID0gbm9vcDtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlICdlcnJvcic6XG5cdFx0XHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UgPSBGUkFNRVdPUksubG9nID0gRlJBTUVXT1JLLndhcm4gPSBub29wO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgJ3NpbGVudCc6XG5cdFx0XHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UgPSBGUkFNRVdPUksubG9nID0gRlJBTUVXT1JLLndhcm4gPSBGUkFNRVdPUksuZXJyb3IgPSBub29wO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yICgnVW5yZWNvZ25pemVkIGxvZ2dpbmcgbGV2ZWwgY29uZmlnICcgK1xuXHRcdFx0XHRcdCcoJyArIEZSQU1FV09SSy5vcHRpb25zLmZyYW1ld29ya0lkICsgJy5sb2dMZXZlbCA9IFwiJyArIGxvZ0xldmVsICsgJ1wiKScpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTdXBwb3J0IGZvciBgZGVidWdgIGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eVxuXHRcdFx0RlJBTUVXT1JLLmRlYnVnID0gRlJBTUVXT1JLLmxvZztcblxuXHRcdFx0Ly8gVmVyYm9zZSBzcGl0cyBvdXQgbG9nIGxldmVsXG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZSgnTG9nIGxldmVsIHNldCB0byA6OiAnLCBsb2dMZXZlbCk7XG5cdFx0fVxuXHR9XG59XG4iLCIvKipcbiAqIEdpdmVuIGEgY29tcG9uZW50IGRlZmluaXRpb24gYW5kIGl0cyBrZXksIHdlIHdpbGwgYnVpbGQgdXAgdGhlIGNvbXBvbmVudCBwcm90b3R5cGUgYW5kIG1lcmdlXG4gKiB0aGlzIGNvbXBvbmVudCB3aXRoIGl0cyBtYXRjaGluZyB0ZW1wbGF0ZS5cbiAqXG4gKiBAcGFyYW0gIHtPYmplY3R9IGNvbXBvbmVudERlZiBbT2JqZWN0IGNvbnRhaW5pbmcgdGhlIGNvbXBvbmVudCBkZWZpbml0aW9uXVxuICogQHBhcmFtICB7U3RyaW5nfSBjb21wb25lbnRLZXkgW1RoZSBjb21wb25lbnQgaWRlbnRpZmllcl1cbiAqL1xuXG52YXIgdHJhbnNsYXRlU2hvcnRoYW5kID0gcmVxdWlyZSgnLi4vdXRpbHMvc2hvcnRoYW5kJyk7XG52YXIgb2JqTWFwID0gcmVxdWlyZSgnLi4vdXRpbHMvb2JqTWFwJyk7XG52YXIgRXZlbnRzID0gcmVxdWlyZSgnLi4vdXRpbHMvZXZlbnRzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYnVpbGRDb21wb25lbnRQcm90b3R5cGUoY29tcG9uZW50RGVmLCBjb21wb25lbnRLZXkpIHtcblxuXHQvLyBJZiBjb21wb25lbnQgaWQgaXMgbm90IGV4cGxpY2l0bHkgc2V0LCB1c2UgdGhlIGNvbXBvbmVudEtleVxuXHRpZiAoIWNvbXBvbmVudERlZi5pZCkge1xuXHRcdGNvbXBvbmVudERlZi5pZCA9IGNvbXBvbmVudEtleTtcblx0fVxuXG5cdC8vIFNlYXJjaCB0ZW1wbGF0ZXNcblx0dmFyIHRlbXBsYXRlID0gRlJBTUVXT1JLLnRlbXBsYXRlc1tjb21wb25lbnREZWYuaWRdO1xuXG5cdC8vIFNhdmUgcmVmZXJlbmNlIHRvIHRlbXBsYXRlIGluIGNvbXBvbmVudCBwcm90b3R5cGVcblx0RlJBTUVXT1JLLnZlcmJvc2UoY29tcG9uZW50RGVmLmlkICsgJyA6OiBQYWlyaW5nIGNvbXBvbmVudCB3aXRoIHRlbXBsYXRlLi4uJyk7XG5cdGNvbXBvbmVudERlZi50ZW1wbGF0ZSA9IHRlbXBsYXRlO1xuXG5cdC8vIFRyYW5zbGF0ZSByaWdodC1oYW5kIHNob3J0aGFuZCBmb3IgdG9wLWxldmVsIGtleXNcblx0Y29tcG9uZW50RGVmID0gb2JqTWFwKGNvbXBvbmVudERlZiwgdHJhbnNsYXRlU2hvcnRoYW5kKTtcblxuXG5cdC8vIGFuZCBldmVudHMgb2JqZWN0XG5cdGlmIChjb21wb25lbnREZWYuZXZlbnRzKSB7XG5cdFx0Y29tcG9uZW50RGVmLmV2ZW50cyA9IG9iak1hcChcblx0XHRcdGNvbXBvbmVudERlZi5ldmVudHMsXG5cdFx0XHR0cmFuc2xhdGVTaG9ydGhhbmRcblx0XHQpO1xuXHR9XG5cblx0Ly8gYW5kIGFmdGVyQ2hhbmdlIGJpbmRpbmdzXG5cdGlmIChfLmlzT2JqZWN0KGNvbXBvbmVudERlZi5hZnRlckNoYW5nZSkgJiYgIV8uaXNGdW5jdGlvbihjb21wb25lbnREZWYuYWZ0ZXJDaGFuZ2UpKSB7XG5cdFx0Y29tcG9uZW50RGVmLmFmdGVyQ2hhbmdlID0gb2JqTWFwKFxuXHRcdFx0Y29tcG9uZW50RGVmLmFmdGVyQ2hhbmdlLFxuXHRcdFx0dHJhbnNsYXRlU2hvcnRoYW5kXG5cdFx0KTtcblx0fVxuXG5cdC8vIEdvIGFoZWFkIGFuZCB0dXJuIHRoZSBkZWZpbml0aW9uIGludG8gYSByZWFsIGNvbXBvbmVudCBwcm90b3R5cGVcblx0RlJBTUVXT1JLLnZlcmJvc2UoY29tcG9uZW50RGVmLmlkICsgJyA6OiBCdWlsZGluZyBjb21wb25lbnQgcHJvdG90eXBlLi4uJyk7XG5cdHZhciBjb21wb25lbnRQcm90b3R5cGUgPSBGUkFNRVdPUksuQ29tcG9uZW50LmV4dGVuZChjb21wb25lbnREZWYpO1xuXG5cdC8vIERpc2NvdmVyIHN1YnNjcmlwdGlvbnNcblx0Y29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZS5zdWJzY3JpcHRpb25zID0ge307XG5cblx0Ly8gSXRlcmF0ZSB0aHJvdWdoIGVhY2ggcHJvcGVydHkgb24gdGhpcyBjb21wb25lbnQgcHJvdG90eXBlXG5cdF8uZWFjaChjb21wb25lbnRQcm90b3R5cGUucHJvdG90eXBlLCBmdW5jdGlvbiAoaGFuZGxlciwga2V5KSB7XG5cblx0XHQvLyBEZXRlY3QgRE9NIGV2ZW50cyBhbmQgc21hc2ggdGhlbSBpbnRvIHRoZSBldmVudHMgaGFzaFxuXHRcdHZhciBtYXRjaGVkRE9NRXZlbnRzID0ga2V5Lm1hdGNoKEV2ZW50c1snL0RPTUV2ZW50LyddKTtcblx0XHRpZiAobWF0Y2hlZERPTUV2ZW50cykge1xuXHRcdFx0dmFyIGV2ZW50TmFtZSA9IG1hdGNoZWRET01FdmVudHNbMV07XG5cdFx0XHR2YXIgZGVsZWdhdGVTZWxlY3RvciA9IG1hdGNoZWRET01FdmVudHNbM107XG5cblx0XHRcdC8vIFN0b3cgdGhlbSBpbiBldmVudHMgaGFzaFxuXHRcdFx0Y29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZS5ldmVudHMgPSBjb21wb25lbnRQcm90b3R5cGUucHJvdG90eXBlLmV2ZW50cyB8fCB7fTtcblx0XHRcdGNvbXBvbmVudFByb3RvdHlwZS5wcm90b3R5cGUuZXZlbnRzW2tleV0gPSBoYW5kbGVyO1xuXHRcdH1cblxuXHRcdC8vIEFkZCBhcHAgZXZlbnRzICglKSwgcm91dGVzICgjKSwgYW5kIGRhdGEgbGlzdGVuZXJzICh+KSB0byBzdWJzY3JpcHRpb25zIGhhc2hcblx0XHRpZiAoa2V5Lm1hdGNoKC9eKCV8I3x+KS8pKSB7XG5cdFx0XHRpZiAoXy5pc1N0cmluZyhoYW5kbGVyKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoY29tcG9uZW50RGVmLmlkICsgJzo6IEludmFsaWQgbGlzdGVuZXIgZm9yIHN1YnNjcmlwdGlvbjogJyArIGtleSArICcuXFxuJyArXG5cdFx0XHRcdFx0J0RlZmluZSB5b3VyIGNhbGxiYWNrIHdpdGggYW4gYW5vbnltb3VzIGZ1bmN0aW9uIGluc3RlYWQgb2YgYSBzdHJpbmcuJ1xuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFfLmlzRnVuY3Rpb24oaGFuZGxlcikpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGNvbXBvbmVudERlZi5pZCArJzo6IEludmFsaWQgbGlzdGVuZXIgZm9yIHN1YnNjcmlwdGlvbjogJyArIGtleSk7XG5cdFx0XHR9XG5cdFx0XHRjb21wb25lbnRQcm90b3R5cGUucHJvdG90eXBlLnN1YnNjcmlwdGlvbnNba2V5XSA9IGhhbmRsZXI7XG5cdFx0fVxuXG5cdFx0Ly8gRXh0ZW5kIG9uZSBvciBtb3JlIG90aGVyIGNvbXBvbmVudHNcblx0XHRlbHNlIGlmIChrZXkgPT09ICdleHRlbmRDb21wb25lbnRzJykge1xuXHRcdFx0dmFyIG9ialRvTWVyZ2UgPSB7fTtcblx0XHRcdF8uZWFjaChoYW5kbGVyLCBmdW5jdGlvbihjaGlsZElkKXtcblxuXHRcdFx0XHRpZiAoIUZSQU1FV09SSy5jb21wb25lbnRzW2NoaWxkSWRdKXtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoXG5cdFx0XHRcdFx0Y29tcG9uZW50RGVmLmlkICsgJyA6OiAnICtcblx0XHRcdFx0XHQnVHJ5aW5nIHRvIGRlZmluZS9leHRlbmQgdGhpcyBjb21wb25lbnQgZnJvbSBgJyArIGNoaWxkSWQgKyAnYCwgJyArXG5cdFx0XHRcdFx0J2J1dCBubyBjb21wb25lbnQgd2l0aCB0aGF0IGlkIGNhbiBiZSBmb3VuZC4nXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdF8uZXh0ZW5kKG9ialRvTWVyZ2UsIEZSQU1FV09SSy5jb21wb25lbnRzW2NoaWxkSWRdKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRfLmRlZmF1bHRzKGNvbXBvbmVudFByb3RvdHlwZS5wcm90b3R5cGUsIG9ialRvTWVyZ2UpO1xuXHRcdH1cblx0fSk7XG5cblx0Ly8gU2F2ZSBwcm90b3R5cGUgaW4gZ2xvYmFsIHNldCBmb3IgdHJhY2tpbmdcblx0RlJBTUVXT1JLLmNvbXBvbmVudHNbY29tcG9uZW50RGVmLmlkXSA9IGNvbXBvbmVudFByb3RvdHlwZTtcbn07XG4iLCIvKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXNcbiAqL1xuXG52YXIgZWwyRGVmYXVsdFRlbXBsYXRlSUQgPSByZXF1aXJlKCcuLi91dGlscy9lbDJEZWZhdWx0VGVtcGxhdGVJRCcpO1xuXG5cblxuXG5cbi8qKlxuICogQ29sbGVjdCBhbnkgVE9QLUxFVkVMIHJlZ2lvbnMgd2l0aCB0aGUgZGVmYXVsdCB0ZW1wbGF0ZS9jb21wb25lbnQgc3BlY2lmaWVkIGluIHRoZSBIVE1MXG4gKlxuICogTm90ZTpcbiAqIFRoaXMgaXMgb25seSBydW4gb24gdGhlIG9yaWdpbmFsIEhUTUwgcGFnZSwgbm90IGluIGNsaWVudC1zaWRlIHRlbXBsYXRlcyEhIVxuICogRm9yIHRoYXQsIHNlZSBgbGliL2NvbXBvbmVudC9yZW5kZXJSZWdpb25zLmpzYC5cbiAqXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjb2xsZWN0UmVnaW9ucyAoKSB7XG5cblxuXHQvLyBHZXQgdG9wLWxldmVsIHJlZ2lvbnMuXG5cdHZhciAkdG9wTGV2ZWxSZWdpb25zID0gJCgncmVnaW9uLCBbZGF0YS1yZWdpb25dJykuZmlsdGVyKGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiAkKHRoaXMpLnBhcmVudHMoJ3JlZ2lvbiwgW2RhdGEtcmVnaW9uXScpLmxlbmd0aCA9PT0gMDtcblx0fSk7XG5cblxuXHQkdG9wTGV2ZWxSZWdpb25zLmVhY2goZnVuY3Rpb24oKSB7XG5cdFx0dmFyIGVsID0gdGhpcztcblx0XHR2YXIgJGVsID0gJCh0aGlzKTtcblxuXHRcdC8vIFByb3ZpZGUgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkgZm9yIGxlZ2FjeSBub3RhdGlvblxuXHRcdC8vIChub3JtYWxpemUgdG8gYHRlbXBsYXRlYClcblx0XHR2YXIgY29tcG9uZW50SWQgPSBlbDJEZWZhdWx0VGVtcGxhdGVJRChlbCk7XG5cblx0XHQvLyBOb3cgaW5zdGFudGlhdGUgdGhlIGFwcHJvcHJpYXRlIGRlZmF1bHQgY29tcG9uZW50IGluIGVhY2hcblx0XHQvLyByZWdpb24gd2l0aCBhIHNwZWNpZmllZCB0ZW1wbGF0ZS9jb21wb25lbnRcblx0XHRGUkFNRVdPUksuUmVnaW9uLmZyb21FbGVtZW50KGVsKTtcblx0fSk7XG5cbn07XG4iLCIvKipcbiAqIExvYWQgYW55IHNjcmlwdCB0YWdzIG9uIHRoZSBwYWdlIHdpdGggdHlwZT1cInRleHQvdGVtcGxhdGVcIi5cbiAqXG4gKiBAcmV0dXJuIHtPYmplY3R9IFtPYmplY3QgY29uc2lzdGluZyBvZiBhIHRlbXBsYXRlIGlkZW50aWZpZXIgYW5kIGl0cyBIVE1MLl1cbiAqL1xuXG52YXIgZWwyTWFzdElEID0gcmVxdWlyZSgnLi4vdXRpbHMvZWwyTWFzdElEJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY29sbGVjdFRlbXBsYXRlc0Zyb21TY3JpcHRUYWdzKCkge1xuXHR2YXIgdGVtcGxhdGVzID0ge307XG5cblx0JCgnc2NyaXB0W3R5cGU9XCJ0ZXh0L3RlbXBsYXRlXCJdJykuZWFjaChmdW5jdGlvbiAoaSwgZWwpIHtcblx0XHR2YXIgaWQgPSBlbDJNYXN0SUQoZWwsIHRydWUpO1xuXHRcdHRlbXBsYXRlc1tpZF0gPSAkKGVsKS5odG1sKCk7XG5cblx0XHQvLyBTdHJpcCB3aGl0ZXNwYWNlIGxlZnRvdmVyIGZyb20gc2NyaXB0IHRhZ3Ncblx0XHR0ZW1wbGF0ZXNbaWRdID0gdGVtcGxhdGVzW2lkXS5yZXBsYWNlKC9eXFxzKy8sJycpO1xuXHRcdHRlbXBsYXRlc1tpZF0gPSB0ZW1wbGF0ZXNbaWRdLnJlcGxhY2UoL1xccyskLywnJyk7XG5cblx0XHQvLyBSZW1vdmUgZnJvbSBET01cblx0XHQkKGVsKS5yZW1vdmUoKTtcblx0fSk7XG5cblx0cmV0dXJuIHRlbXBsYXRlcztcbn07XG4iLCIvKipcbiAqIFRoaXMgaXMgdGhlIHN0YXJ0aW5nIHBvaW50IHRvIHlvdXIgYXBwbGljYXRpb24uICBZb3Ugc2hvdWxkIGdyYWIgdGVtcGxhdGVzIGFuZCBjb21wb25lbnRzXG4gKiBiZWZvcmUgY2FsbGluZyBGUkFNRVdPUksucmFpc2UoKSB1c2luZyBzb21ldGhpbmcgbGlrZSBSZXF1aXJlLmpzLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG5cdFx0ZGF0YTogeyBhdXRoZW50aWNhdGVkOiBmYWxzZSB9LFxuXHRcdHRlbXBsYXRlczogeyBjb21wb25lbnROYW1lOiBIVE1MT3JQcmVjb21waWxlZEZuIH0sXG5cdFx0Y29tcG9uZW50czogeyBjb21wb25lbnROYW1lOiBDb21wb25lbnREZWZpbml0aW9uIH1cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNiXG4gKi9cblxudmFyIExvZ2dlciA9IHJlcXVpcmUoJy4uL2xvZ2dlci9pbmRleCcpO1xudmFyIGJ1aWxkQ29tcG9uZW50RGVmaW5pdGlvbiA9IHJlcXVpcmUoJy4uL2RlZmluZS9idWlsZERlZmluaXRpb24nKTtcbnZhciBidWlsZENvbXBvbmVudFByb3RvdHlwZSA9IHJlcXVpcmUoJy4vYnVpbGRQcm90b3R5cGUnKTtcbnZhciBjb2xsZWN0VGVtcGxhdGVzRnJvbVNjcmlwdFRhZ3MgPSByZXF1aXJlKCcuL2NvbGxlY3RUZW1wbGF0ZXNGcm9tU2NyaXB0VGFncycpO1xudmFyIGNvbGxlY3RSZWdpb25zID0gcmVxdWlyZSgnLi9jb2xsZWN0UmVnaW9ucycpO1xudmFyIHNldHVwUm91dGVyID0gcmVxdWlyZSgnLi4vcm91dGVyL2luZGV4Jyk7XG5cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByYWlzZShvcHRpb25zLCBjYikge1xuXG5cdC8vIElmIG9ubHkgb25lIGFyZyBpcyBwcmVzZW50LCB1c2Ugb3B0aW9ucyBhcyBjYWxsYmFjayBpZiBwb3NzaWJsZS5cblx0Ly8gSWYgb3B0aW9ucyBhcmUgbm90IGRlZmluZWQsIHVzZSBhbiBlbXB0eSBvYmplY3QuXG5cdGlmICghY2IgJiYgXy5pc0Z1bmN0aW9uKG9wdGlvbnMpKSB7XG5cdFx0Y2IgPSBvcHRpb25zO1xuXHR9XG5cdGlmICghXy5pc1BsYWluT2JqZWN0KG9wdGlvbnMpKSB7XG5cdFx0b3B0aW9ucyA9IHt9O1xuXHR9XG5cblx0Ly8gSW50ZXJwcmV0IGBwcm9kdWN0aW9uYCBhcyBgbG9nTGV2ZWwgPT09ICdzaWxlbnQnYFxuXHRpZiAoRlJBTUVXT1JLLm9wdGlvbnMucHJvZHVjdGlvbikge1xuXHRcdEZSQU1FV09SSy5vcHRpb25zLmxvZ0xldmVsID0gJ3NpbGVudCc7XG5cdH1cblxuXHQvLyBJbml0aWFsaXplIGxvZ2dlclxuXHRuZXcgTG9nZ2VyKCk7XG5cblx0Ly8gTWVyZ2UgZGF0YSBpbnRvIEZSQU1FV09SSy5kYXRhXG5cdF8uZXh0ZW5kKEZSQU1FV09SSy5kYXRhLCBvcHRpb25zLmRhdGEgfHwge30pO1xuXG5cdC8vIE1lcmdlIHNwZWNpZmllZCB0ZW1wbGF0ZXMgd2l0aCBGUkFNRVdPUksudGVtcGxhdGVzXG5cdF8uZXh0ZW5kKEZSQU1FV09SSy50ZW1wbGF0ZXMsIG9wdGlvbnMudGVtcGxhdGVzIHx8IHt9KTtcblxuXHQvLyBJZiBGUkFNRVdPUksuZGVmaW5lKCkgd2FzIHVzZWQsIGJ1aWxkIHRoZSBsaXN0IG9mIGNvbXBvbmVudHNcblx0Ly8gSXRlcmF0ZSB0aHJvdWdoIHRoZSBkZWZpbmUgcXVldWUgYW5kIGNyZWF0ZSBlYWNoIGRlZmluaXRpb25cblx0Xy5lYWNoKEZSQU1FV09SSy5fZGVmaW5lUXVldWUsIGJ1aWxkQ29tcG9uZW50RGVmaW5pdGlvbik7XG5cblx0Ly8gTWVyZ2Ugc3BlY2lmaWVkIGNvbXBvbmVudHMgdy8gRlJBTUVXT1JLLmNvbXBvbmVudHNcblx0Xy5leHRlbmQoRlJBTUVXT1JLLmNvbXBvbmVudHMsIG9wdGlvbnMuY29tcG9uZW50cyB8fCB7fSk7XG5cblx0Ly8gQmFjayB1cCBlYWNoIGNvbXBvbmVudCBkZWZpbml0aW9uIGJlZm9yZSB0cmFuc2Zvcm1pbmcgaXQgaW50byBhIGxpdmUgcHJvdG90eXBlXG5cdEZSQU1FV09SSy5jb21wb25lbnREZWZzID0gXy5jbG9uZShGUkFNRVdPUksuY29tcG9uZW50cyk7XG5cblx0Ly8gUnVuIHRoaXMgY2FsbCBiYWNrIHdoZW4gdGhlIERPTSBpcyByZWFkeVxuXHQkKGZ1bmN0aW9uICgpIHtcblxuXHRcdC8vIENvbGxlY3QgYW55IDxzY3JpcHQ+IHRhZyB0ZW1wbGF0ZXMgb24gdGhlIHBhZ2Vcblx0XHQvLyBhbmQgYWJzb3JiIHRoZW0gaW50byBGUkFNRVdPUksudGVtcGxhdGVzXG5cdFx0Xy5leHRlbmQoRlJBTUVXT1JLLnRlbXBsYXRlcywgY29sbGVjdFRlbXBsYXRlc0Zyb21TY3JpcHRUYWdzKCkpO1xuXG5cdFx0Ly8gQnVpbGQgYWN0dWFsIHByb3RvdHlwZXMgZm9yIHRoZSBjb21wb25lbnRzXG5cdFx0Ly8gKG5lZWQgdGhlIHRlbXBsYXRlcyBhdCB0aGlzIHBvaW50IHRvIG1ha2UgdGhpcyB3b3JrKVxuXHRcdF8uZWFjaChGUkFNRVdPUksuY29tcG9uZW50cywgYnVpbGRDb21wb25lbnRQcm90b3R5cGUpO1xuXG5cdFx0Ly8gR3JhYiBpbml0aWFsIHJlZ2lvbnMgZnJvbSBET01cblx0XHRjb2xsZWN0UmVnaW9ucygpO1xuXG5cdFx0Ly8gQmluZCBnbG9iYWwgRE9NIGV2ZW50cyBhcyBGUkFNRVdPUksgZXZlbnRzXG5cdFx0Ly8gKGUuZy4gJXdpbmRvdzpyZXNpemUpXG5cdFx0dmFyIHRyaWdnZXJSZXNpemVFdmVudCA9IF8uZGVib3VuY2UoZnVuY3Rpb24gKCkge1xuXHRcdFx0RlJBTUVXT1JLLnRyaWdnZXIoJyV3aW5kb3c6cmVzaXplJyk7XG5cdFx0fSwgRlJBTUVXT1JLLm9wdGlvbnMudGhyb3R0bGVXaW5kb3dSZXNpemUgfHwgMCk7XG5cdFx0JCh3aW5kb3cpLnJlc2l6ZSh0cmlnZ2VyUmVzaXplRXZlbnQpO1xuXHRcdC8vIFRPRE86IGFkZCBtb3JlIGV2ZW50cyBhbmQgZXh0cmFwb2xhdGUgdGhpcyBsb2dpYyB0byBhIHNlcGFyYXRlIG1vZHVsZVxuXG5cdFx0Ly8gRG8gdGhlIGluaXRpYWwgcm91dGluZyBzZXF1ZW5jZVxuXHRcdC8vIExvb2sgYXQgdGhlICNmcmFnbWVudCB1cmwgYW5kIGZpcmUgdGhlIGdsb2JhbCByb3V0ZSBldmVudFxuXHRcdHNldHVwUm91dGVyKCk7XG5cdFx0RlJBTUVXT1JLLmhpc3Rvcnkuc3RhcnQoXy5kZWZhdWx0cyh7XG5cdFx0XHRwdXNoU3RhdGU6IHVuZGVmaW5lZCxcblx0XHRcdGhhc2hDaGFuZ2U6IHVuZGVmaW5lZCxcblx0XHRcdHJvb3Q6IHVuZGVmaW5lZFxuXHRcdH0sIG9wdGlvbnMpKTtcblxuXHRcdGlmIChjYikgY2IoKTtcblx0fSk7XG59O1xuIiwiLyoqXG4gKiBBcHBlbmQgYSBjb21wb25lbnQgdG8gdGhlIGVuZCBvZiBhIHJlZ2lvbi4gVGhpcyBjYWxscyBpbnNlcnQgYXQgdGhlIGxhc3QgcG9zaXRpb24uXG4gKlxuICogQHBhcmFtICB7U3RyaW5nfSBjb21wb25lbnRJZCBbVGhlIGNvbXBvbmVudCBpZCB0aGF0IHdlIHdhbnQgdG8gYXBwZW5kXVxuICogQHBhcmFtICB7T2JqZWN0fSBwcm9wZXJ0aWVzICBbUHJvcGVydGllcyB0byBpbnN0YW50aWF0ZSB0aGUgY29tcG9uZW50IHdpdGhdXG4gKlxuICogQHJldHVybiB7Q29tcG9uZW50fSAgICAgICAgICBbTmV3bHkgYXBwZW5kZWQgQ29tcG9uZW50XVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGFwcGVuZChjb21wb25lbnRJZCwgcHJvcGVydGllcykge1xuXHQvLyBJbnNlcnQgYXQgbGFzdCBwb3NpdGlvblxuXHRyZXR1cm4gdGhpcy5pbnNlcnQodGhpcy5fY2hpbGRyZW4ubGVuZ3RoLCBjb21wb25lbnRJZCwgcHJvcGVydGllcyk7XG59O1xuIiwiLyoqXG4gKiBTaG9ydGN1dCBmb3IgY2FsbGluZyBlbXB0eSgpIGFuZCB0aGVuIGFwcGVuZCgpLFxuICogVGhpcyBpcyB0aGUgZ2VuZXJhbCB1c2UgY2FzZSBmb3IgbWFuYWdpbmcgc3ViY29tcG9uZW50c1xuICogKGUuZy4gd2hlbiBhIG5hdmJhciBpdGVtIGlzIHRvdWNoZWQpXG4gKlxuICogQHBhcmFtICB7U3RyaW5nfSBjb21wb25lbnQgIFtUaGUgaWQgbmFtZSBvZiB0aGUgY29tcG9uZXQgdGhhdCB5b3Ugd2FudCB0byBhdHRhY2hdXG4gKiBAcGFyYW0gIHtPYmplY3R9IHByb3BlcnRpZXMgW1Byb3BlcnRpZXMgdGhhdCB0aGUgYXR0YWNoZWQgY29tcG9uZW50IHdpbGwgYmUgaW5pdGFsaXplZCB3aXRoXVxuICpcbiAqIEByZXR1cm4ge0NvbXBvbmVudH0gXHRcdFx0XHQgW05ld2x5IGF0dGFjaGVkIGNvbXBvbmVudF1cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBhdHRhY2goY29tcG9uZW50LCBwcm9wZXJ0aWVzKSB7XG5cdHRoaXMuZW1wdHkoKTtcblx0cmV0dXJuIHRoaXMuYXBwZW5kKGNvbXBvbmVudCwgcHJvcGVydGllcyk7XG59O1xuIiwiLyoqXG4gKiByZWdpb24uZW1wdHkoIClcbiAqXG4gKiBJdGVyYXRlIG92ZXIgZWFjaCBjb21wb25lbnQgaW4gdGhpcyByZWdpb24gYW5kIGNhbGwgLmNsb3NlKCkgb24gaXRcbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBlbXB0eSgpIHtcblx0RlJBTUVXT1JLLmRlYnVnKHRoaXMucGFyZW50LmlkICsgJyA6OiBFbXB0eWluZyByZWdpb246ICcgKyB0aGlzLmlkKTtcblx0d2hpbGUgKHRoaXMuX2NoaWxkcmVuLmxlbmd0aCA+IDApIHtcblx0XHR0aGlzLnJlbW92ZSgwKTtcblx0fVxufTtcbiIsIi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llc1xuICovXG52YXIgZWwyTWFzdElEID0gcmVxdWlyZSgnLi4vdXRpbHMvZWwyTWFzdElEJyksXG5cdGVsMkRlZmF1bHRUZW1wbGF0ZUlEID0gcmVxdWlyZSgnLi4vdXRpbHMvZWwyRGVmYXVsdFRlbXBsYXRlSUQnKTtcblxuXG5cbi8qKlxuICogRmFjdG9yeSBtZXRob2QgdG8gZ2VuZXJhdGUgYSBuZXcgcmVnaW9uIGluc3RhbmNlIGZyb20gYSBET00gZWxlbWVudFxuICogQWxzbyBpbXBsZW1lbnRzIGB0ZW1wbGF0ZWAgYW5kIGBjb3VudGAgZGlyZWN0aXZlcywgYXMgd2VsbCBhcyBzdXBwb3J0XG4gKiBmb3IgZW1iZWRkZWQgdGVtcGxhdGVzIGJ5IGNoZWNraW5nIGBlbGAncyBpbm5lckhUTUwuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnNcbiAqIEByZXR1cm5zIHJlZ2lvbiBpbnN0YW5jZVxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZnJvbUVsZW1lbnQoZWwsIHBhcmVudCkge1xuXG5cdC8vIElmIHBhcmVudCBpcyBub3Qgc3BlY2lmaWVkLCBtYWtlLWJlbGlldmUuXG5cdHBhcmVudCA9IHBhcmVudCB8fCB7IGlkOiAnKicgfTtcblxuXHR2YXIgJGVsID0gJChlbCk7XG5cblxuXHQvLyBCdWlsZCByZWdpb25cblx0dmFyIHJlZ2lvbiA9IG5ldyBGUkFNRVdPUksuUmVnaW9uKHtcblx0XHRpZDogZWwyTWFzdElEKGVsKSxcblx0XHQkZWw6ICRlbCxcblx0XHRwYXJlbnQ6IHBhcmVudFxuXHR9KTtcblxuXHQvLyBzZXQgZW1iZWRkZWQgY29tcG9uZW50IHRvIHN0cmluZyBvZiBjb21wb25lbnQgdGhhdCB3ZSB3YW50IHRvIHJlbmRlciBpbiB0aGlzIGFyZWEuXG5cdHZhciBlbWJlZGRlZENvbXBvbmVudCA9IHJlZ2lvbi5lbWJlZGRlZENvbXBvbmVudDtcblx0aWYgKF8uaXNPYmplY3QoZW1iZWRkZWRDb21wb25lbnQpKSB7XG5cdFx0ZW1iZWRkZWRDb21wb25lbnQgPSByZWdpb24uZW1iZWRkZWRDb250ZW50O1xuXHR9XG5cblxuXHQvLyBJZiBgdGVtcGxhdGVgIHNob3J0Y3V0IGlzIGVuYWJsZWQsIGFwcGVuZCBzcGVjaWZpZWQgc3ViLWNvbXBvbmVudChzKVxuXHQvLyB0byB0aGUgcmVnaW9uIGF1dG9tYXRpY2FsbHkuIFdlIGFsc28gbWFrZSBzdXJlIHRoYXQgdGhlIHJlZ2lvbiBkb2VzbnQgaGF2ZVxuXHQvLyBlbWJlZGRlZCBjb250ZW50LiBJZiBpdCBkb2VzLCB0aGVuIGRvbnQgYXBwZW5kIGl0IGluLlxuXHRpZiAoIEZSQU1FV09SSy5vcHRpb25zLnNob3J0Y3V0LnRlbXBsYXRlICYmIGVtYmVkZGVkQ29tcG9uZW50ICYmICFyZWdpb24uaGFzQ29udGVudCkge1xuXG5cdFx0Ly8gSWYgYGNvdW50YCBpcyBzZXQsIHJlbmRlciBzdWItY29tcG9uZW50IHNwZWNpZmllZCBudW1iZXIgb2YgdGltZXMuXG5cdFx0Ly8gZS5nLiA8cmVnaW9uIHRlbXBsYXRlPVwiRm9vXCIgY291bnQ9XCIzXCIgLz5cblx0XHQvL1xuXHRcdC8vIChOb3RlIHRoYXQgaWYgdGhlIGBjb3VudGAgc2hvcnRjdXQgaXMgZGlzYWJsZWQsIGBjb3VudGAgaXMgYWx3YXlzID0gMSlcblx0XHR2YXIgY291bnQ7XG5cdFx0aWYgKEZSQU1FV09SSy5vcHRpb25zLnNob3J0Y3V0LmNvdW50KSB7XG5cdFx0XHRjb3VudCA9ICh0eXBlb2YgJGVsLmF0dHIoJ2NvdW50JykgIT09ICd1bmRlZmluZWQnKSA/ICRlbC5hdHRyKCdjb3VudCcpIDogMTtcblx0XHR9XG5cblx0XHQvLyBBcHBlbmQgdGhlIHN1YmNvbXBvbmVudCB0aGUgYXBwcm9wcmlhdGUgIyBvZiB0aW1lcy5cblx0XHRmb3IgKHZhciBpPTA7IGkgPCBjb3VudDsgaSsrICkge1xuXHRcdFx0cmVnaW9uLmFwcGVuZChlbWJlZGRlZENvbXBvbmVudCk7XG5cdFx0fVxuXG5cdFx0RlJBTUVXT1JLLmRlYnVnKFxuXHRcdFx0cGFyZW50LmlkICsgJyA6LTogSW5zdGFudGlhdGVkwqBuZXcgcmVnaW9uJyArXG5cdFx0XHQoIHJlZ2lvbi5pZCA/ICcgYCcgKyByZWdpb24uaWQgKyAnYCcgOiAnJyApICtcblx0XHRcdCggZW1iZWRkZWRDb21wb25lbnQgPyAnIGFuZCBwb3B1bGF0ZWQgaXQgd2l0aCcgK1xuXHRcdFx0XHQoIGNvdW50ID4gMSA/IGNvdW50ICsgJyBpbnN0YW5jZXMgb2YnIDogJyAxJyApICtcblx0XHRcdFx0JyBgJyArIGVtYmVkZGVkQ29tcG9uZW50ICsgJ2AnIDogJydcblx0XHRcdCkgKyAnLidcblx0XHQpO1xuXHR9XG5cblx0cmV0dXJuIHJlZ2lvbjtcbn07XG4iLCIvKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXNcbiAqL1xuXG52YXIgaW5zZXJ0ID0gcmVxdWlyZSgnLi9pbnNlcnQnKSxcblx0cmVtb3ZlID0gcmVxdWlyZSgnLi9yZW1vdmUnKSxcblx0ZW1wdHkgPSByZXF1aXJlKCcuL2VtcHR5JyksXG5cdGFwcGVuZCA9IHJlcXVpcmUoJy4vYXBwZW5kJyksXG5cdGF0dGFjaCA9IHJlcXVpcmUoJy4vYXR0YWNoJyksXG5cdHByZXBlbmQgPSByZXF1aXJlKCcuL3ByZXBlbmQnKSxcblx0ZnJvbUVsZW1lbnQgPSByZXF1aXJlKCcuL2Zyb21FbGVtZW50JyksXG5cdGVsMkRlZmF1bHRUZW1wbGF0ZUlEID0gcmVxdWlyZSgnLi4vdXRpbHMvZWwyRGVmYXVsdFRlbXBsYXRlSUQnKSxcblx0YnVpbGRDb21wb25lbnRQcm90b3R5cGUgPSByZXF1aXJlKCcuLi9yYWlzZS9idWlsZFByb3RvdHlwZScpO1xuXG5cbi8qKlxuICogRlJBTUVXT1JLLlJlZ2lvblxuICpcbiAqIEBwYXJhbSAge09iamVjdH0gcHJvcGVydGllc1xuICpcbiAqIEBjb25zdHJ1Y3RvclxuICovXG5cbnZhciBSZWdpb24gPSBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHJlZ2lvbihwcm9wZXJ0aWVzKSB7XG5cblx0Xy5leHRlbmQodGhpcywgRlJBTUVXT1JLLkV2ZW50cyk7XG5cblx0aWYgKCFwcm9wZXJ0aWVzKSB7XG5cdFx0cHJvcGVydGllcyA9IHt9O1xuXHR9XG5cdGlmICghcHJvcGVydGllcy4kZWwpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1RyeWluZyB0byBpbnN0YW50aWF0ZSByZWdpb24gd2l0aCBubyAkZWwhJyk7XG5cdH1cblxuXHQvLyBGb2xkIGluIHByb3BlcnRpZXMgdG8gcHJvdG90eXBlXG5cdF8uZXh0ZW5kKHRoaXMsIHByb3BlcnRpZXMpO1xuXG5cdC8vIElmIHRoZSByZWdpb24gaGFzIGEgY29tcG9uZW50L3RlbXBsYXRlIGlkZW50aWZpZXIsIChlLmcuIDxyZWdpb24gdGVtcGxhdGU9XCJGb29cIiAvPilcblx0Ly8gd2UnbGwgdXNlIHRoYXQgYXMgdGhlIGBlbWJlZGRlZENvbXBvbmVudGAuXG5cdHRoaXMuZW1iZWRkZWRDb21wb25lbnQgPSBlbDJEZWZhdWx0VGVtcGxhdGVJRCh0aGlzLiRlbFswXSk7XG5cblx0Ly8gTmV4dCwgY2hlY2sgaWYgdGhlIHJlZ2lvbiBoYXMgYW55IGVtYmVkZGVkIEhUTUwuXG5cdHZhciBlbWJlZGRlZFRlbXBsYXRlID0gdGhpcy4kZWwuaHRtbCgpO1xuXG5cblxuXHQvLyBUcmltIHdoaXRlc3BhY2UgZnJvbSBlbWJlZGRlZCB0ZW1wbGF0ZSBpbiBjYXNlIGl0IHdhcyBpbmNsdWRlZCBieSBhY2NpZGVudC5cblx0ZW1iZWRkZWRUZW1wbGF0ZSA9IGVtYmVkZGVkVGVtcGxhdGUgJiYgZW1iZWRkZWRUZW1wbGF0ZS5yZXBsYWNlKC9eXFxzKy8sICcnKTtcblx0ZW1iZWRkZWRUZW1wbGF0ZSA9IGVtYmVkZGVkVGVtcGxhdGUgJiYgZW1iZWRkZWRUZW1wbGF0ZS5yZXBsYWNlKC9cXHMrJC8sICcnKTtcblxuXHQvLyBJbnN0YW50aWF0ZSBhbiBhbm9ueW1vdXMgY29tcG9uZW50IGZvciB0aGUgZW1iZWRkZWQgdGVtcGxhdGUuXG5cdGlmIChlbWJlZGRlZFRlbXBsYXRlKSB7XG5cblx0XHQvLyBHaXZlIGFuIGZsYWcgc28gd2Uga25vdyB0aGlzIHJlZ2lvbiBoYXMgZW1iZWRkZWQgY29udGVudC5cblx0XHR0aGlzLmhhc0NvbnRlbnQgPSB0cnVlO1xuXG5cdFx0Ly8gQWRkIHRoaXMgdGVtcGxhdGUgdG8gb3VyIGNvbGxlY3Rpb24gb2YgZnJhbWV3b3JrIHRlbXBsYXRlcy4gVGhpcyB3aWxsIGFsbG93IHVzIHRvXG5cdFx0Ly8gcmVuZGVyIHRoaXMgY29tcG9uZW50IGluIHRoZSBmdXR1cmUuXG5cdFx0RlJBTUVXT1JLLnRlbXBsYXRlc1t0aGlzLmVtYmVkZGVkQ29tcG9uZW50XSA9IGVtYmVkZGVkVGVtcGxhdGU7XG5cblx0XHQvLyBJZiB0aGUgRnJhbWV3b3JrIGhhcyB0aGlzIGNvbXBvbmVudCByZWdpc3RlcmVkIGZvciB0aGlzIGVtYmVkZGVkIGNvbXBvbmVudCxcblx0XHQvLyB0aGVuIGNyZWF0ZSBhIHByb3RvdHlwZSBvZiB0aGlzIGNvbXBuZW50LiBUaGlzIGFsbG93cyBoYXZpbmcgbG9naWMgZm9yIHRoaXNcblx0XHQvLyBlbWJlZGRlZCBjb21wb25lbnQgaW4gYSBkaWZmZXJlbnQgY29tcG9uZW50IGZpbGUuXG5cdFx0aWYgKF8uaGFzKEZSQU1FV09SSy5jb21wb25lbnREZWZzLCB0aGlzLmVtYmVkZGVkQ29tcG9uZW50KSkge1xuXHRcdFx0dmFyIGNvbXBvbmVudERlZiA9IEZSQU1FV09SSy5jb21wb25lbnREZWZzW3RoaXMuZW1iZWRkZWRDb21wb25lbnRdLFxuXHRcdFx0XHRcdGNvbXBvbmVudEtleSA9IHRoaXMuZW1iZWRkZWRDb21wb25lbnQ7XG5cblx0XHRcdGJ1aWxkQ29tcG9uZW50UHJvdG90eXBlKGNvbXBvbmVudERlZiwgY29tcG9uZW50S2V5KTtcblx0XHR9XG5cblx0XHQvLyBXaXBlIHRoZSBlbWJlZGRlZCBIVE1MIGZyb20gdGhlIERPTS5cblx0XHQvLyBOT1RFOiB0aGlzIHN0ZXAgY291bGQgYmUgb21pdHRlZCwgYnV0IGxlYXZpbmcgaXQgaW4gbm93IGZvciBzYWZldHkuXG5cdFx0dGhpcy4kZWwuZW1wdHkoKTtcblxuXHRcdC8vIEV4dGVuZCBhIGNvbXBvbmVudCBwcm90b3R5cGUsIHRoZW4gaW5zdGFudGlhdGUgdGhlIGNvbXBvbmVudCxcblx0XHQvLyBidXQgZG9uJ3QgcmVuZGVyIHlldC4gIEl0J3MgYWxyZWFkeSByZW5kZXJlZCwgbW9zdGx5ISAoZXhjZXB0IGZvciBJVFMgcmVnaW9ucylcblx0XHQvLyBXZSdsbCB1c2UgdGhpcyBhbm9ueW1vdXMgY29tcG9uZW50IGluc3RhbmNlIGFzIG91ciBgZW1iZWRkZWRDb21wb25lbnRgIGZvciB0aGlzXG5cdFx0Ly8gcmVnaW9uLlxuXHRcdC8vIHZhciB0ZW1wbGF0ZVByb3BlcnRpZXMgPSB7XG5cdFx0Ly8gXHR0ZW1wbGF0ZTogZW1iZWRkZWRUZW1wbGF0ZSxcblx0XHQvLyBcdGlkOiB0aGlzLmVtYmVkZGVkQ29tcG9uZW50XG5cdFx0Ly8gfTtcblxuXHRcdC8vIHNob3J0Y3V0IHRvIGdldCBob2xkIG9mIGVtYmVkZGVkIGNvbXBvbmVudCBpZC5cblx0XHR0aGlzLmVtYmVkZGVkQ29udGVudCA9IHRoaXMuZW1iZWRkZWRDb21wb25lbnQ7XG5cblx0XHQvLyB0aGlzLmVtYmVkZGVkQ29tcG9uZW50ID0gbmV3IChGUkFNRVdPUksuQ29tcG9uZW50LmV4dGVuZCh0ZW1wbGF0ZVByb3BlcnRpZXMpKShwcm9wZXJ0aWVzKTtcblx0XHQvLyB0aGlzLmVtYmVkZGVkQ29tcG9uZW50ID0gbmV3IEZSQU1FV09SSy5Db21wb25lbnQodGVtcGxhdGVQcm9wZXJ0aWVzKTtcblx0XHQvLyBjb25zb2xlLmxvZygnc29tZXRoaW5nJyk7XG5cblx0fVxuXG5cdC8vIElmIG5laXRoZXIgYW4gaWQgbm9yIGEgYHRlbXBsYXRlYCB3YXMgc3BlY2lmaWVkLFxuXHQvLyB3ZSdsbCB0aHJvdyBhbiBlcnJvciwgc2luY2UgdGhlcmUncyBubyB3YXkgdG8gZ2V0IGEgaG9sZCBvZiB0aGUgcmVnaW9uXG5cdGlmICggIXRoaXMuaWQgJiYgIXRoaXMuZW1iZWRkZWRDb21wb25lbnQgKSB7XG5cblx0XHR0aHJvdyBuZXcgRXJyb3IoXG5cdFx0XHR0aGlzLnBhcmVudC5pZCArICcgOjogQSByZWdpb24gaWRlbnRpZmllciAoZS5nLiBgZGF0YS1yZWdpb249XCJmb29cImApIG1heSAnICtcblx0XHRcdCdvbmx5IGJlIG9taXR0ZWQgaWYgYSBkZWZhdWx0IHRlbXBsYXRlIGlzIHNwZWNpZmllZCwgZS5nLjpcXG4nICtcblx0XHRcdCdlLmcuIDxyZWdpb24gdGVtcGxhdGU9XCJTb21lQ29tcG9uZW50XCI+PC9yZWdpb24+J1xuXHRcdCk7XG5cdH1cblxuXHQvLyBTZXQgdXAgbGlzdCB0byBob3VzZSBjaGlsZCBjb21wb25lbnRzXG5cdHRoaXMuX2NoaWxkcmVuID0gW107XG5cblx0Xy5iaW5kQWxsKHRoaXMpO1xuXG5cdC8vIFNldCB1cCBjb252ZW5pZW5jZSBhY2Nlc3MgdG8gdGhpcyByZWdpb24gaW4gdGhlIGdsb2JhbCByZWdpb24gY2FjaGVcblx0RlJBTUVXT1JLLnJlZ2lvbnNbdGhpcy5pZF0gPSB0aGlzO1xufTtcblxuUmVnaW9uLmZyb21FbGVtZW50ID0gZnVuY3Rpb24oZWwsIHBhcmVudCkge1xuXHRyZXR1cm4gZnJvbUVsZW1lbnQoZWwsIHBhcmVudCk7XG59O1xuUmVnaW9uLnByb3RvdHlwZS5yZW1vdmUgPSBmdW5jdGlvbihhdEluZGV4KSB7XG5cdHJldHVybiByZW1vdmUuY2FsbCh0aGlzLCBhdEluZGV4KTtcbn07XG5SZWdpb24ucHJvdG90eXBlLmVtcHR5ID0gZnVuY3Rpb24oKSB7XG5cdHJldHVybiBlbXB0eS5jYWxsKHRoaXMpO1xufTtcblJlZ2lvbi5wcm90b3R5cGUuaW5zZXJ0ID0gZnVuY3Rpb24oYXRJbmRleCwgY29tcG9uZW50SWQsIHByb3BlcnRpZXMpIHtcblx0cmV0dXJuIGluc2VydC5jYWxsKHRoaXMsIGF0SW5kZXgsIGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKTtcbn07XG5SZWdpb24ucHJvdG90eXBlLmFwcGVuZCA9IGZ1bmN0aW9uKGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKSB7XG5cdHJldHVybiBhcHBlbmQuY2FsbCh0aGlzLCBjb21wb25lbnRJZCwgcHJvcGVydGllcyk7XG59O1xuUmVnaW9uLnByb3RvdHlwZS5hdHRhY2ggPSBmdW5jdGlvbihjb21wb25lbnQsIHByb3BlcnRpZXMpIHtcblx0cmV0dXJuIGF0dGFjaC5jYWxsKHRoaXMsIGNvbXBvbmVudCwgcHJvcGVydGllcyk7XG59O1xuUmVnaW9uLnByb3RvdHlwZS5wcmVwZW5kID0gZnVuY3Rpb24oY29tcG9uZW50SWQsIHByb3BlcnRpZXMpIHtcblx0cmV0dXJuIHByZXBlbmQuY2FsbCh0aGlzLCBjb21wb25lbnRJZCwgcHJvcGVydGllcyk7XG59O1xuIiwiLyoqXG4gKiByZWdpb24uaW5zZXJ0KCBhdEluZGV4LCBjb21wb25lbnRJZCwgW3Byb3BlcnRpZXNdIClcbiAqXG4gKiBUT0RPOiBzdXBwb3J0IGEgbGlzdCBvZiBwcm9wZXJ0aWVzIG9iamVjdHMgaW4gbGlldSBvZiB0aGUgcHJvcGVydGllcyBvYmplY3RcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGluc2VydChhdEluZGV4LCBjb21wb25lbnRJZCwgcHJvcGVydGllcykge1xuXG5cdHZhciBlcnIgPSAnJztcblx0aWYgKCEoYXRJbmRleCB8fCBfLmlzRmluaXRlKGF0SW5kZXgpKSkge1xuXHRcdGVyciArPSB0aGlzLmlkICsgJy5pbnNlcnQoKSA6OiBObyBhdEluZGV4IHNwZWNpZmllZCEnO1xuXHR9XG5cdGVsc2UgaWYgKCFjb21wb25lbnRJZCkge1xuXHRcdGVyciArPSB0aGlzLmlkICsgJy5pbnNlcnQoKSA6OiBObyBjb21wb25lbnRJZCBzcGVjaWZpZWQhJztcblx0fVxuXHRpZiAoZXJyKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGVyciArICdcXG5Vc2FnZTogaW5zZXJ0KGF0SW5kZXgsIGNvbXBvbmVudElkLCBbcHJvcGVydGllc10pJyk7XG5cdH1cblxuXHR2YXIgY29tcG9uZW50O1xuXHQvLyBJZiBjb21wb25lbnRJZCBpcyBhIHN0cmluZywgbG9vayB1cCBjb21wb25lbnQgcHJvdG90eXBlIGFuZCBpbnN0YXRpYXRlXG5cdGlmICgnc3RyaW5nJyA9PSB0eXBlb2YgY29tcG9uZW50SWQpIHtcblxuXHRcdHZhciBjb21wb25lbnRQcm90b3R5cGUgPSBGUkFNRVdPUksuY29tcG9uZW50c1tjb21wb25lbnRJZF07XG5cblx0XHRpZiAoIWNvbXBvbmVudFByb3RvdHlwZSkge1xuXHRcdFx0dmFyIHRlbXBsYXRlID0gRlJBTUVXT1JLLnRlbXBsYXRlc1tjb21wb25lbnRJZF07XG5cdFx0XHRpZiAoIXRlbXBsYXRlKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvciAoJ0luICcgK1xuXHRcdFx0XHRcdCh0aGlzLmlkIHx8ICdBbm9ueW1vdXMgcmVnaW9uJykgKyAnOjogVHJ5aW5nIHRvIGluc2VydCAnICtcblx0XHRcdFx0XHRjb21wb25lbnRJZCArICcsIGJ1dCBubyB0ZW1wbGF0ZSBleGlzdHMgd2l0aCB0aGF0IGlkLicpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZiBubyBjb21wb25lbnQgcHJvdG90eXBlIGV4aXN0cyBmb3IgdGhlIHRlbXBsYXRlXG5cdFx0XHQvLyB3aXRoIHRoZSBzcGVjaWZpZmVkIGlkLCBjcmVhdGUgYSBzdHViIG9uZSBvbiB0aGUgZmx5LlxuXHRcdFx0Y29tcG9uZW50UHJvdG90eXBlID0gRlJBTUVXT1JLLkNvbXBvbmVudC5leHRlbmQoe1xuXHRcdFx0XHRpZDogY29tcG9uZW50SWQsXG5cdFx0XHRcdHRlbXBsYXRlOiB0ZW1wbGF0ZVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gSW5zdGFudGlhdGUgYW5kIHJlbmRlciB0aGUgY29tcG9uZW50IGluc2lkZSB0aGlzIHJlZ2lvblxuXHRcdGNvbXBvbmVudCA9IG5ldyBjb21wb25lbnRQcm90b3R5cGUoXy5leHRlbmQoe1xuXHRcdFx0JG91dGxldDogdGhpcy4kZWxcblx0XHR9LCBwcm9wZXJ0aWVzIHx8IHt9KSk7XG5cblxuXHR9XG5cblx0Ly8gT3RoZXJ3aXNlIGFzc3VtZSBhbiBpbnN0YW50aWF0ZWQgY29tcG9uZW50IG9iamVjdCB3YXMgc2VudFxuXHQvKiBUT0RPOiBDaGVjayB0aGF0IGNvbXBvbmVudCBvYmplY3QgaXMgdmFsaWQgKi9cblx0ZWxzZSB7XG5cdFx0Y29tcG9uZW50ID0gY29tcG9uZW50SWQ7XG5cdFx0Y29tcG9uZW50LiRvdXRsZXQgPSB0aGlzLiRlbDtcblx0fVxuXG5cdC8vIFNhdmUgcmVmZXJlbmNlIHRvIHBhcmVudFJlZ2lvblxuXHRjb21wb25lbnQucGFyZW50UmVnaW9uID0gdGhpcztcblxuXHQvLyBDaGVjayB0byBzZWUgaWYgdGhlIG1vZGVsIHdhcyBhbHJlYWR5IGRlZmluZWQuIElmIGl0IGlzLCB1c2UgdGhhdCBtb2RlbC4gSWYgbm90LCBhc3NpZ24gaXRcblx0Ly8gdGhlIHBhcmVudHMgbW9kZWwgaWYgaXQgaGFzIG9uZSwgb3IgYXNzaWduIGl0IGEgbmV3IGJhY2tib25lIGluc3RhbmNlLlxuXHRpZiAoIWNvbXBvbmVudC5tb2RlbCkge1xuXHRcdGNvbXBvbmVudC5tb2RlbCA9IHRoaXMucGFyZW50Lm1vZGVsID8gdGhpcy5wYXJlbnQubW9kZWwgOiBuZXcgQmFja2JvbmUuTW9kZWwoKTtcblx0fVxuXG5cdC8vIFJlbmRlciBjb21wb25lbnQgaW50byB0aGlzIHJlZ2lvblxuXHRjb21wb25lbnQucmVuZGVyKGF0SW5kZXgpO1xuXG5cdC8vIEFuZCBrZWVwIHRyYWNrIG9mIGl0IGluIHRoZSBsaXN0IG9mIHRoaXMgcmVnaW9uJ3MgY2hpbGRyZW5cblx0dGhpcy5fY2hpbGRyZW4uc3BsaWNlKGF0SW5kZXgsIDAsIGNvbXBvbmVudCk7XG5cblx0Ly8gTG9nIGZvciBkZWJ1Z2dpbmcgYGNvdW50YCBkZWNsYXJhdGl2ZVxuXHR2YXIgZGVidWdTdHIgPSB0aGlzLnBhcmVudC5pZCArICcgOjogSW5zZXJ0ZWQgJyArIGNvbXBvbmVudElkICsgJyBpbnRvICc7XG5cdGlmICh0aGlzLmlkKSBkZWJ1Z1N0ciArPSAncmVnaW9uOiAnICsgdGhpcy5pZCArICcgYXQgaW5kZXggJyArIGF0SW5kZXg7XG5cdGVsc2UgZGVidWdTdHIgKz0gJ2Fub255bW91cyByZWdpb24gYXQgaW5kZXggJyArIGF0SW5kZXg7XG5cdEZSQU1FV09SSy52ZXJib3NlKGRlYnVnU3RyKTtcblxuXHRyZXR1cm4gY29tcG9uZW50O1xuXG59O1xuIiwiLyoqXG4gKiBQcmVwZW5kIGEgY29tcG9uZW50IHRvIHRoZSBiZWdpbm5pbmcgb2YgYSByZWdpb24uIFRoaXMgY2FsbHMgaW5zZXJ0IGF0IHRoZSBmaXJzdCBwb3NpdGlvbi5cbiAqXG4gKiBAcGFyYW0gIHtTdHJpbmd9IGNvbXBvbmVudElkIFtUaGUgY29tcG9uZW50IGlkIHRoYXQgd2Ugd2FudCB0byBwcmVwZW5kIF1cbiAqIEBwYXJhbSAge09iamVjdH0gcHJvcGVydGllcyAgW1Byb3BlcnRpZXMgdG8gaW5zdGFudGlhdGUgdGhlIGNvbXBvbmVudCB3aXRoXVxuICpcbiAqIEByZXR1cm4ge0NvbXBvbmVudH0gICAgICAgICAgW05ld2x5IHByZXBlbmRlZCBDb21wb25lbnRdXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcHJlcGVuZChjb21wb25lbnRJZCwgcHJvcGVydGllcykge1xuXHQvLyBJbnNlcnQgYXQgbGFzdCBwb3NpdGlvblxuXHRyZXR1cm4gdGhpcy5pbnNlcnQoMCwgY29tcG9uZW50SWQsIHByb3BlcnRpZXMpO1xufTtcbiIsIi8qKlxuICogcmVnaW9uLnJlbW92ZSggYXRJbmRleCApXG4gKlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHJlbW92ZShhdEluZGV4KSB7XG5cblx0aWYgKCFhdEluZGV4ICYmICFfLmlzRmluaXRlKGF0SW5kZXgpKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKHRoaXMuaWQgKyAnLnJlbW92ZSgpIDo6IE5vIGF0SW5kZXggc3BlY2lmaWVkISBcXG5Vc2FnZTogcmVtb3ZlKGF0SW5kZXgpJyk7XG5cdH1cblxuXHQvLyBSZW1vdmUgdGhlIGNvbXBvbmVudCBmcm9tIHRoZSBsaXN0XG5cdHZhciBjb21wb25lbnQgPSB0aGlzLl9jaGlsZHJlbi5zcGxpY2UoYXRJbmRleCwgMSk7XG5cdGlmICghY29tcG9uZW50WzBdKSB7XG5cblx0XHQvLyBJZiB0aGUgbGlzdCBpcyBlbXB0eSwgZnJlYWsgb3V0XG5cdFx0dGhyb3cgbmV3IEVycm9yKHRoaXMuaWQgKyAnLnJlbW92ZSgpIDo6IFRyeWluZyB0byByZW1vdmUgYSBjb21wb25lbnQgdGhhdCBkb2VzblxcJ3QgZXhpc3QgYXQgaW5kZXggJyArIGF0SW5kZXgpO1xuXHR9XG5cblx0Ly8gU3F1ZWV6ZSB0aGUgY29tcG9uZW50IHRvIGRvIGdldCBhbGwgdGhlIGJpbmR5IGdvb2RuZXNzIG91dFxuXHRjb21wb25lbnRbMF0uY2xvc2UoKTtcblxuXHRGUkFNRVdPUksuZGVidWcodGhpcy5wYXJlbnQuaWQgKyAnIDo6IFJlbW92ZWQgY29tcG9uZW50IGF0IGluZGV4ICcgKyBhdEluZGV4ICsgJyBmcm9tIHJlZ2lvbjogJyArIHRoaXMuaWQpO1xufTtcbiIsIi8qKlxuICogU2V0cyB1cCB0aGUgRlJBTUVXT1JLIHJvdXRlci5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByb3V0ZXJTZXR1cCgpIHtcblxuXHQvLyBXaWxkY2FyZCByb3V0ZXMgdG8gZ2xvYmFsIGV2ZW50IGRlbGVnYXRvclxuXHR2YXIgcm91dGVyID0gbmV3IEZSQU1FV09SSy5Sb3V0ZXIoKTtcblx0cm91dGVyLnJvdXRlKC8oLiopLywgJ3JvdXRlJywgZnVuY3Rpb24gKHJvdXRlKSB7XG5cblx0XHQvLyBOb3JtYWxpemUgaG9tZSByb3V0ZXMgKCMgb3IgbnVsbCkgdG8gJydcblx0XHRpZiAoIXJvdXRlKSB7XG5cdFx0XHRyb3V0ZSA9ICcnO1xuXHRcdH1cblxuXHRcdC8vIFRyaWdnZXIgcm91dGVcblx0XHRGUkFNRVdPUksudHJpZ2dlcignIycgKyByb3V0ZSk7XG5cdH0pO1xuXG5cdC8vIEV4cG9zZSBgbmF2aWdhdGUoKWAgbWV0aG9kXG5cdEZSQU1FV09SSy5uYXZpZ2F0ZSA9IEZSQU1FV09SSy5oaXN0b3J5Lm5hdmlnYXRlO1xufVxuIiwiLyoqXG4gKiBCYXJlLWJvbmVzIERPTS9VSSB1dGlsaXRpZXNcbiAqL1xuXG52YXIgRXZlbnRzID0gcmVxdWlyZSgnLi9ldmVudHMnKTtcblxudmFyIERPTSA9IHtcblxuXHQvKipcblx0ICogRXhwb3NlIHRoZSBcIkRPTW15LWV2ZW50ZWRuZXNzXCIgb2YgZWxlbWVudHMgc28gdGhhdCBpdCdzIHNlbGVjdGFibGUgdmlhIENTU1xuXHQgKiBZb3UgY2FuIHVzZSB0aGlzIHRvIGFwcGx5IGEgZmV3IGNob2ljZSBET00gbW9kaWZpY2F0aW9ucyBvdXQgdGhlIGdhdGUtLVxuXHQgKiAoZS5nLiB0d2Vha3MgdGFyZ2V0aW5nIGNvbW1vbiBpc3N1ZXMgdGhhdCB0eXBpY2FsbHkgZ2V0IGZvcmdvdHRlbiwgbGlrZSBkaXNhYmxpbmcgdGV4dCBzZWxlY3Rpb24pXG5cdCAqXG5cdCAqIEBwYXJhbSB7Q29tcG9uZW50fSBjb21wb25lbnRcblx0ICovXG5cdGZsYWdCb3VuZEV2ZW50czogZnVuY3Rpb24gKCBjb21wb25lbnQgKSB7XG5cblx0XHQvLyBUT0RPOiBwcm92aWRlIGFjY2VzcyB0byBib3VuZCBnbG9iYWwgZXZlbnRzICglKSBhbmQgcm91dGVzICgjKSBhcyB3ZWxsXG5cdFx0Ly8gVE9ETzogZmxhZyBhbGwgRE9NIGV2ZW50cywgbm90IGp1c3QgY2xpY2sgYW5kIHRvdWNoXG5cblx0XHQvLyBCdWlsZCBzdWJzZXQgb2YganVzdCB0aGUgY2xpY2svdG91Y2ggZXZlbnRzXG5cdFx0dmFyIGNsaWNrT3JUb3VjaEV2ZW50cyA9IEV2ZW50cy5wYXJzZShcblx0XHRcdGNvbXBvbmVudC5ldmVudHMsXG5cdFx0XHR7IG9ubHk6IFsnY2xpY2snLCAndG91Y2gnLCAndG91Y2hzdGFydCcsICd0b3VjaGVuZCddIH1cblx0XHQpO1xuXG5cdFx0Ly8gSWYgbm8gY2xpY2svdG91Y2ggZXZlbnRzIGZvdW5kLCBiYWlsIG91dFxuXHRcdGlmICggY2xpY2tPclRvdWNoRXZlbnRzLmxlbmd0aCA8IDEgKSByZXR1cm47XG5cblx0XHQvLyBRdWVyeSBhZmZlY3RlZCBlbGVtZW50cyBmcm9tIERPTVxuXHRcdHZhciAkYWZmZWN0ZWQgPSBFdmVudHMuZ2V0RWxlbWVudHMoY2xpY2tPclRvdWNoRXZlbnRzLCBjb21wb25lbnQpO1xuXG5cdFx0Ly8gTk9URTogRm9yIG5vdywgdGhpcyBpcyBhbHdheXMganVzdCAnY2xpY2snXG5cdFx0dmFyIGJvdW5kRXZlbnRzU3RyaW5nID0gJ2NsaWNrJztcblxuXHRcdC8vIFNldCBgZGF0YS1GUkFNRVdPUkstY2xpY2thYmxlYCBjdXN0b20gYXR0cmlidXRlXG5cdFx0Ly8gKHVpIGxvZ2ljIHNob3VsZCBiZSBleHRlbmRlZCBpbiBDU1MpXG5cdFx0JGFmZmVjdGVkLmF0dHIoJ2RhdGEtJyArIEZSQU1FV09SSy5vcHRpb25zLmZyYW1ld29ya0lkICsgJy1ldmVudHMnLCBib3VuZEV2ZW50c1N0cmluZyk7XG5cblx0XHRGUkFNRVdPUksudmVyYm9zZShcblx0XHRcdGNvbXBvbmVudC5pZCArICcgOjogJyArXG5cdFx0XHQnRGlzYWJsZWQgdXNlciB0ZXh0IHNlbGVjdGlvbiBvbiBlbGVtZW50cyB3LyBjbGljay90b3VjaCBldmVudHM6Jyxcblx0XHRcdGNsaWNrT3JUb3VjaEV2ZW50cyxcblx0XHRcdCRhZmZlY3RlZFxuXHRcdCk7XG5cdH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gRE9NO1xuIiwiLyoqXG4gKiBJbnNwZWN0IGEgRE9NIGVsZW1lbnQgYW5kIHNlZSBpZiBpdCBoYXMgYSBkZWZhdWx0IGNvbXBvbmVudC90ZW1wbGF0ZSBJRC5cbiAqIFByb3ZpZGVzIGJhY2t3YXJkcy1jb21wYXRpYmlsaXR5IGxheWVyLCBhbmQgbm9ybWFsaXplcyB0aGUgc3ludGF4IGluIHRoZSBET00uXG4gKlxuICogQHBhcmFtICB7RE9NRWxlbWVudH0gZWxcbiAqIEByZXR1cm4ge1N0cmluZ30gICAgW3RoZSBpZCBvZiB0aGUgZGVmYXVsdCBjb21wb25lbnQvdGVtcGxhdGUsIGlmIG9uZSB3YXMgc3BlY2lmaWVkXVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChlbCkge1xuXG5cdC8vIFByb3ZpZGUgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkgZm9yXG5cdC8vIGBkZWZhdWx0YCwgYGNvbnRlbnRzYCBhbmQgYHRlbXBsYXRlYCBub3RhdGlvblxuXHR2YXIgY29tcG9uZW50SWQgPSAkKGVsKS5hdHRyKCd0ZW1wbGF0ZScpIHx8ICQoZWwpLmF0dHIoJ2RlZmF1bHQnKSB8fCAkKGVsKS5hdHRyKCdjb250ZW50cycpO1xuXG5cdC8vIE5vcm1hbGl6ZSB0byBgdGVtcGxhdGVgIGF0dHJpYnV0ZSBpbiB0aGUgRE9NLlxuXHQkKGVsKS5hdHRyKCd0ZW1wbGF0ZScsIGNvbXBvbmVudElkKTtcblxuXHRyZXR1cm4gY29tcG9uZW50SWQ7XG59O1xuIiwiLyoqXG4gKiBHcmFicyB0aGUgTWFzdCBpZGVudGlmaWVyIGZyb20gYW4gSFRNTCBlbGVtZW50LlxuICogU3VwcG9ydHMgYGlkYCwgYGRhdGEtaWRgLCBvciBgZGF0YS1yZWdpb25gXG4gKlxuICogQHBhcmFtICB7RE9NRWxlbWVudH0gZWwgICAgW3RoZSBET00gZWxlbWVudCB0byBpbnNwZWN0XVxuICogQHBhcmFtICB7Qm9vbGVhbn0gcmVxdWlyZWQgW3doZXRoZXIgYW4gaWRlbnRpZmllciBpcyByZXF1aXJlZF1cbiAqXG4gKiBAcmV0dXJuIHtTdHJpbmd9ICAgICAgICAgICBbaWRlbnRpZmllcl1cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGVsMk1hc3RJRCAoZWwsIHJlcXVpcmVkKSB7XG5cblx0dmFyIGlkID0gJChlbCkuYXR0cignaWQnKTtcblx0dmFyIGRhdGFJZCA9ICQoZWwpLmF0dHIoJ2RhdGEtaWQnKSB8fCAkKGVsKS5hdHRyKCdkYXRhLXJlZ2lvbicpO1xuXHR2YXIgY29udGVudHNJZCA9ICQoZWwpLmF0dHIoJ2NvbnRlbnRzJyk7XG5cblx0aWYgKGlkICYmIGRhdGFJZCkge1xuXHRcdHRocm93IG5ldyBFcnJvcihpZCArICcgOjogQ2Fubm90IHNldCBib3RoIGBpZGAgYW5kIGBkYXRhLWlkYCEgIFBsZWFzZSB1c2Ugb25lIG9yIHRoZSBvdGhlci4gIChkYXRhLWlkIGlzIHNhZmVzdCknKTtcblx0fVxuXHRpZiAocmVxdWlyZWQgJiYgIWlkICYmICFkYXRhSWQpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIGlkIHNwZWNpZmllZCBpbiBlbGVtZW50IHdoZXJlIGl0IGlzIHJlcXVpcmVkOlxcbicgKyBlbCk7XG5cdH1cblxuXHRyZXR1cm4gaWQgfHwgZGF0YUlkIHx8IGNvbnRlbnRzSWQ7XG59O1xuIiwiLyoqXG4gKiBVdGlsaXR5IEV2ZW50IHRvb2xraXRcbiAqL1xuXG52YXIgRXZlbnRzID0ge1xuXG5cdC8qKlxuXHQgKiBQYXJzZXMgYSBkaWN0aW9uYXJ5IG9mIGV2ZW50cyBhbmQgb3B0aW9uYWxseSBmaWx0ZXJzIGJ5IHRoZSBldmVudCB0eXBlLiBJZiB0aGUgZXZlbnRcblx0ICpcblx0ICogQHBhcmFtICB7T2JqZWN0fSBldmVudHMgIFtBIEJhY2tib25lLlZpZXcgZXZlbnRzIG9iamVjdF1cblx0ICogQHBhcmFtICB7T2JqZWN0fSBvcHRpb25zIFtPcHRpb25zIG9iamVjdCB0aGF0IGFsbG93cyB1cyB0byBmaWx0ZXIgcGFyc2luZyB0byBjZXJ0YWluIGV2ZW50XG5cdCAqICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZXNdXG5cdCAqXG5cdCAqIEByZXR1cm4ge0FycmF5fSAgICAgICAgICBbQXJyYXkgY29udGFpbmluZyBwYXJzZWRFdmVudHMgdGhhdCBhcmUgbWF0Y2hpbmcgZXZlbnQga2V5c11cblx0ICovXG5cdHBhcnNlOiBmdW5jdGlvbiAoZXZlbnRzLCBvcHRpb25zKSB7XG5cblx0XHR2YXIgZXZlbnRLZXlzID0gXy5rZXlzKGV2ZW50cyB8fCB7fSksXG5cdFx0XHRsaW1pdEV2ZW50cyxcblx0XHRcdHBhcnNlZEV2ZW50cyA9IFtdO1xuXG5cdFx0Ly8gT3B0aW9uYWxseSBmaWx0ZXIgdXNpbmcgc2V0IG9mIGFjY2VwdGFibGUgZXZlbnQgdHlwZXNcblx0XHRsaW1pdEV2ZW50cyA9IG9wdGlvbnMub25seTtcblx0XHRldmVudEtleXMgPSBfLmZpbHRlcihldmVudEtleXMsIGZ1bmN0aW9uIGNoZWNrRXZlbnROYW1lIChldmVudEtleSkge1xuXG5cdFx0XHQvLyBQYXJzZSBldmVudCBzdHJpbmcgaW50byBzZW1hbnRpYyByZXByZXNlbnRhdGlvblxuXHRcdFx0dmFyIGV2ZW50ID0gRXZlbnRzLnBhcnNlRE9NRXZlbnQoZXZlbnRLZXkpO1xuXHRcdFx0cGFyc2VkRXZlbnRzLnB1c2goZXZlbnQpO1xuXG5cdFx0XHQvLyBPcHRpb25hbCBmaWx0ZXJcblx0XHRcdGlmIChsaW1pdEV2ZW50cykge1xuXHRcdFx0XHRyZXR1cm4gXy5jb250YWlucyhsaW1pdEV2ZW50cywgZXZlbnQubmFtZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBwYXJzZWRFdmVudHM7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFtnZXRFbGVtZW50cyBkZXNjcmlwdGlvbl1cblx0ICpcblx0ICogQHBhcmFtICB7QXJyYXl9IHNlbWFudGljRXZlbnRzIFtBIGxpc3Qgb2YgcGFyc2VkIGV2ZW50IG9iamVjdHNdXG5cdCAqIEBwYXJhbSAge0NvbXBvbmVudH0gY29udGV4dCAgICBbSW5zdGFuY2Ugb2YgYSBjb21wb25lbnQgdG8gdXNlIGFzIGEgc3RhcnRpbmcgcG9pbnQgZm9yXG5cdCAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhlIERPTSBxdWVyaWVzXVxuXHQgKlxuXHQgKiBAcmV0dXJuIHtBcnJheX0gICAgICAgICAgICAgICAgW0FuIGFycmF5IG9mIGpRdWVyeSBzZXQgb2YgbWF0Y2hlZCBlbGVtZW50c11cblx0ICovXG5cdGdldEVsZW1lbnRzOiBmdW5jdGlvbiAoc2VtYW50aWNFdmVudHMsIGNvbnRleHQpIHtcblxuXHRcdC8vIENvbnRleHQgb3B0aW9uYWxcblx0XHRjb250ZXh0ID0gY29udGV4dCB8fCB7ICQ6ICQgfTtcblxuXHRcdC8vIEl0ZXJhdGl2ZWx5IGJ1aWxkIGEgc2V0IG9mIGFmZmVjdGVkIGVsZW1lbnRzXG5cdFx0dmFyICRhZmZlY3RlZCA9ICQoKTtcblx0XHRfLmVhY2goc2VtYW50aWNFdmVudHMsIGZ1bmN0aW9uIGxvb2t1cEVsZW1lbnRzRm9yRXZlbnQgKGV2ZW50KSB7XG5cblx0XHRcdC8vIERldGVybWluZSBtYXRjaGVkIGVsZW1lbnRzXG5cdFx0XHQvLyBVc2UgZGVsZWdhdGUgc2VsZWN0b3IgaWYgc3BlY2lmaWVkXG5cdFx0XHQvLyBPdGhlcndpc2UsIGdyYWIgdGhlIGVsZW1lbnQgZm9yIHRoaXMgY29tcG9uZW50XG5cdFx0XHR2YXIgJG1hdGNoZWQgPVx0ZXZlbnQuc2VsZWN0b3IgP1xuXHRcdFx0XHRcdFx0XHRjb250ZXh0LiQoZXZlbnQuc2VsZWN0b3IpIDpcblx0XHRcdFx0XHRcdFx0Y29udGV4dC4kZWw7XG5cblx0XHRcdC8vIEFkZCBtYXRjaGVkIGVsZW1lbnRzIHRvIHNldFxuXHRcdFx0JGFmZmVjdGVkID0gJGFmZmVjdGVkLmFkZCggJG1hdGNoZWQgKTtcblx0XHR9LCB0aGlzKTtcblxuXHRcdHJldHVybiAkYWZmZWN0ZWQ7XG5cdH0sXG5cblxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHdoZXRoZXIgdGhlIHNwZWNpZmllZCBldmVudCBrZXkgbWF0Y2hlcyBhIERPTSBldmVudC5cblx0ICpcblx0ICogQHBhcmFtICB7U3RyaW5nfSBrZXkgW0tleSB0byBtYXRjaCBhZ2FpbnN0XVxuXHQgKlxuXHQgKiBpZiBubyBtYXRjaCBpcyBmb3VuZFxuXHQgKiBAcmV0dXJuIHtCb29sZWFufSBcdFx0W3JldHVybiBgZmFsc2VgXVxuXHQgKlxuXHQgKiBvdGhlcndpc2Vcblx0ICogQHJldHVybiB7T2JqZWN0fSAgXHRcdFtPYmplY3QgY29udGFpbmluZyB0aGUgYG5hbWVgIG9mIHRoZSBET00gZWxlbWVudCBhbmQgdGhlIGBzZWxlY3RvcmBdXG5cdCAqL1xuXHRwYXJzZURPTUV2ZW50OiBfLm1lbW9pemUoZnVuY3Rpb24oa2V5KSB7XG5cblx0XHR2YXIgbWF0Y2hlcyA9IGtleS5tYXRjaCh0aGlzWycvRE9NRXZlbnQvJ10pO1xuXG5cdFx0aWYgKCFtYXRjaGVzIHx8ICFtYXRjaGVzWzFdKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdG5hbWU6IG1hdGNoZXNbMV0sXG5cdFx0XHRzZWxlY3RvcjogbWF0Y2hlc1szXVxuXHRcdH07XG5cdH0pLFxuXG5cblx0LyoqXG5cdCAqIFN1cHBvcnRlZCBcImZpcnN0LWNsYXNzXCIgRE9NIGV2ZW50cy5cblx0ICogQHR5cGUge0FycmF5fVxuXHQgKi9cblx0bmFtZXM6IFtcblxuXHRcdC8vIExvY2FsaXplZCBicm93c2VyIGV2ZW50c1xuXHRcdC8vICh3b3JrcyBvbiBpbmRpdmlkdWFsIGVsZW1lbnRzKVxuXHRcdCdlcnJvcicsICdzY3JvbGwnLFxuXG5cdFx0Ly8gTW91c2UgZXZlbnRzXG5cdFx0J2NsaWNrJywgJ2RibGNsaWNrJywgJ21vdXNlZG93bicsICdtb3VzZXVwJywgJ2hvdmVyJywgJ21vdXNlZW50ZXInLCAnbW91c2VsZWF2ZScsXG5cdFx0J21vdXNlb3ZlcicsICdtb3VzZW91dCcsICdtb3VzZW1vdmUnLFxuXG5cdFx0Ly8gS2V5Ym9hcmQgZXZlbnRzXG5cdFx0J2tleWRvd24nLCAna2V5dXAnLCAna2V5cHJlc3MnLFxuXG5cdFx0Ly8gRm9ybSBldmVudHNcblx0XHQnYmx1cicsICdjaGFuZ2UnLCAnZm9jdXMnLCAnZm9jdXNpbicsICdmb2N1c291dCcsICdzZWxlY3QnLCAnc3VibWl0JyxcblxuXHRcdC8vIFJhdyB0b3VjaCBldmVudHNcblx0XHQndG91Y2hzdGFydCcsICd0b3VjaGVuZCcsICd0b3VjaG1vdmUnLCAndG91Y2hjYW5jZWwnLFxuXG5cdFx0Ly8gTWFudWZhY3R1cmVkIGV2ZW50c1xuXHRcdCd0b3VjaCcsXG5cblx0XHQvLyBUT0RPOlxuXHRcdCdyaWdodGNsaWNrJywgJ2NsaWNrb3V0c2lkZSdcblx0XVxufTtcblxuXG5cblxuLyoqXG4gKiBSZWdleHAgdG8gbWF0Y2ggXCJmaXJzdCBjbGFzc1wiIERPTSBldmVudHNcbiAqICh0aGVzZSBhcmUgYWxsb3dlZCBpbiB0aGUgdG9wIGxldmVsIG9mIGEgY29tcG9uZW50IGRlZmluaXRpb24gYXMgbWV0aG9kIGtleXMpXG4gKlx0XHRpLmUuIC9eKGNsaWNrfGhvdmVyfGJsdXJ8Zm9jdXMpKCAoLispKS9cbiAqXHRcdFx0WzFdID0+IGV2ZW50IG5hbWVcbiAqXHRcdFx0WzNdID0+IHNlbGVjdG9yXG4gKi9cblxuRXZlbnRzWycvRE9NRXZlbnQvJ10gPSBuZXcgUmVnRXhwKCdeKCcgKyBfLnJlZHVjZShFdmVudHMubmFtZXMsXG5cdGZ1bmN0aW9uIGJ1aWxkUmVnZXhwKG1lbW8sIGV2ZW50TmFtZSwgaW5kZXgpIHtcblxuXHRcdC8vIE9taXQgYHxgIHRoZSBmaXJzdCB0aW1lXG5cdFx0aWYgKGluZGV4ID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gbWVtbyArIGV2ZW50TmFtZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbWVtbyArICd8JyArIGV2ZW50TmFtZTtcblx0fSwgJycpICtcbicpKCAoLispKT8kJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gRXZlbnRzO1xuIiwiLyoqXG4gKiBNYXAgYW4gb2JqZWN0J3MgdmFsdWVzLCBhbmQgcmV0dXJuIGEgdmFsaWQgb2JqZWN0ICh0aGlzIGZ1bmN0aW9uIGlzIGhhbmR5IGJlY2F1c2VcbiAqIHVuZGVyc2NvcmUubWFwKCkgcmV0dXJucyBhIGxpc3QsIG5vdCBhbiBvYmplY3QuKVxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmogICAgICAgICAgICBbT2JqZWN0IHdob3MgdmFsdWVzIHlvdSB3YW50IHRvIG1hcF1cbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSB0cmFuc2Zvcm1GbiBbRnVuY3Rpb24gdG8gdHJhbnNmb3JtIGVhY2ggb2JqZWN0IHZhbHVlIGJ5XVxuICpcbiAqIEByZXR1cm4ge09iamVjdH0gICAgICAgICAgICAgICAgW05ldyBvYmplY3Qgd2l0aCB0aGUgdmFsdWVzIG1hcHBlZF1cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIG9iak1hcChvYmosIHRyYW5zZm9ybUZuKSB7XG5cdHJldHVybiBfLm9iamVjdChfLmtleXMob2JqKSwgXy5tYXAob2JqLCB0cmFuc2Zvcm1GbikpO1xufTtcblxuIiwiLyoqXG4gKiBUcmFuc2xhdGUgKipyaWdodC1oYW5kLXNpZGUgYWJicmV2aWF0aW9ucyoqIGludG8gZnVuY3Rpb25zIHRoYXQgcGVyZm9ybVxuICogdGhlIHByb3BlciBiZWhhdmlvcnMsIGUuZy5cbiAqXHRcdCNhYm91dF9tZVxuICpcdFx0JW1haW5NZW51Om9wZW5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHRyYW5zbGF0ZVNob3J0aGFuZCh2YWx1ZSwga2V5KSB7XG5cblx0dmFyIG1hdGNoZXMsIGZuO1xuXG5cdC8vIElmIHRoaXMgaXMgYW4gaW1wb3J0YW50LCBGUkFNRVdPUkstc3BlY2lmaWMgZGF0YSBrZXksXG5cdC8vIGFuZCBhIGZ1bmN0aW9uIHdhcyBzcGVjaWZpZWQsIHJ1biBpdCB0byBnZXQgaXRzIHZhbHVlXG5cdC8vICh0aGlzIGlzIHRvIGtlZXAgcGFyaXR5IHdpdGggQmFja2JvbmUncyBzaW1pbGFyIGZ1bmN0aW9uYWxpdHkpXG5cdGlmIChfLmlzRnVuY3Rpb24odmFsdWUpICYmIChrZXkgPT09ICdjb2xsZWN0aW9uJyB8fCBrZXkgPT09ICdtb2RlbCcpKSB7XG5cdFx0cmV0dXJuIHZhbHVlKCk7XG5cdH1cblxuXHQvLyBJZ25vcmUgb3RoZXIgbm9uLXN0cmluZ3Ncblx0aWYgKCFfLmlzU3RyaW5nKHZhbHVlKSkge1xuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxuXG5cdC8vIEFsc28gaWdub3JlIGB0ZW1wbGF0ZWBcblx0Ly8gVE9ETzogdXNlIGEgZGlmZmVyZW50IGtleSBsYXRlclxuXHRpZiAoa2V5ID09PSAndGVtcGxhdGUnKSByZXR1cm4gdmFsdWU7XG5cblx0Ly8gQWxzbyBpZ25vcmUgdGhpbmdzIHRoYXQgc3RhcnQgd2l0aCBfXG5cdGlmIChrZXkubWF0Y2goL15fLykpIHJldHVybiB2YWx1ZTtcblxuXG5cdC8vIFJlZGlyZWN0cyB1c2VyIHRvIGNsaWVudC1zaWRlIFVSTCwgdy9vIGFmZmVjdGluZyBicm93c2VyIGhpc3Rvcnlcblx0Ly8gTGlrZSBjYWxsaW5nIGBCYWNrYm9uZS5oaXN0b3J5Lm5hdmlnYXRlKCcvZm9vJywgeyByZXBsYWNlOiB0cnVlIH0pYFxuXHRpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXiMjKC4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHRcdGZuID0gZnVuY3Rpb24gcmVkaXJlY3RBbmRDb3ZlclRyYWNrcygpIHtcblx0XHRcdHZhciB1cmwgPSBtYXRjaGVzWzFdO1xuXHRcdFx0RlJBTUVXT1JLLmhpc3RvcnkubmF2aWdhdGUodXJsLCB7XG5cdFx0XHRcdHRyaWdnZXI6IHRydWUsXG5cdFx0XHRcdHJlcGxhY2U6IHRydWVcblx0XHRcdH0pO1xuXHRcdH07XG5cdH1cblx0Ly8gTWV0aG9kIHRvIHJlZGlyZWN0IHVzZXIgdG8gYSBjbGllbnQtc2lkZSBVUkwsIHRoZW4gY2FsbCB0aGUgaGFuZGxlclxuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eIyguKlteLlxcc10rKS8pKSAmJiBtYXRjaGVzWzFdKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiBjaGFuZ2VVcmxGcmFnbWVudCgpIHtcblx0XHRcdHZhciB1cmwgPSBtYXRjaGVzWzFdO1xuXHRcdFx0RlJBTUVXT1JLLmhpc3RvcnkubmF2aWdhdGUodXJsLCB7XG5cdFx0XHRcdHRyaWdnZXI6IHRydWVcblx0XHRcdH0pO1xuXHRcdH07XG5cdH1cblx0Ly8gTWV0aG9kIHRvIHRyaWdnZXIgZ2xvYmFsIGV2ZW50XG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14oJS4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHRcdGZuID0gZnVuY3Rpb24gdHJpZ2dlckV2ZW50KCkge1xuXHRcdFx0dmFyIHRyaWdnZXIgPSBtYXRjaGVzWzFdO1xuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UodGhpcy5pZCArICcgOjogVHJpZ2dlcmluZyBldmVudCAoJyArIHRyaWdnZXIgKyAnKS4uLicpO1xuXHRcdFx0RlJBTUVXT1JLLnRyaWdnZXIodHJpZ2dlcik7XG5cdFx0fTtcblx0fVxuXHQvLyBNZXRob2QgdG8gZmlyZSBhIHRlc3QgYWxlcnRcblx0Ly8gKHVzZSBtZXNzYWdlLCBpZiBzcGVjaWZpZWQpXG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14hISFcXHMqKC4qW14uXFxzXSk/LykpKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiBiYW5nQWxlcnQoZSkge1xuXG5cdFx0XHQvLyBJZiBzcGVjaWZpZWQsIG1lc3NhZ2UgaXMgdXNlZCwgb3RoZXJ3aXNlICdBbGVydCB0cmlnZ2VyZWQhJ1xuXHRcdFx0dmFyIG1zZyA9IChtYXRjaGVzICYmIG1hdGNoZXNbMV0pIHx8ICdEZWJ1ZyBhbGVydCAoISEhKSB0cmlnZ2VyZWQhJztcblxuXHRcdFx0Ly8gT3RoZXIgZGlhZ25vc3RpYyBpbmZvcm1hdGlvblxuXHRcdFx0bXNnICs9ICdcXG5cXG5EaWFnbm9zdGljc1xcbj09PT09PT09PT09PT09PT09PT09PT09PVxcbic7XG5cdFx0XHRpZiAoZSAmJiBlLmN1cnJlbnRUYXJnZXQpIHtcblx0XHRcdFx0bXNnICs9ICdlLmN1cnJlbnRUYXJnZXQgOjogJyArIGUuY3VycmVudFRhcmdldDtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmlkKSB7XG5cdFx0XHRcdG1zZyArPSAndGhpcy5pZCA6OiAnICsgdGhpcy5pZDtcblx0XHRcdH1cblxuXHRcdFx0YWxlcnQobXNnKTtcblx0XHR9O1xuXHR9XG5cblx0Ly8gTWV0aG9kIHRvIGxvZyBhIG1lc3NhZ2UgdG8gdGhlIGNvbnNvbGVcblx0Ly8gKHVzZSBtZXNzYWdlLCBpZiBzcGVjaWZpZWQpXG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14+Pj5cXHMqKC4qW14uXFxzXSk/LykpKSB7XG5cblx0XHRmbiA9IGZ1bmN0aW9uIGxvZ01lc3NhZ2UoZSkge1xuXG5cdFx0XHQvLyBJZiBzcGVjaWZpZWQsIG1lc3NhZ2UgaXMgdXNlZCwgb3RoZXJ3aXNlIHVzZSBkZWZhdWx0XG5cdFx0XHR2YXIgbXNnID0gKG1hdGNoZXMgJiYgbWF0Y2hlc1sxXSkgfHwgJ0xvZyBtZXNzYWdlICg+Pj4pIHRyaWdnZXJlZCEnO1xuXHRcdFx0RlJBTUVXT1JLLmxvZyhtc2cpO1xuXHRcdH07XG5cdH1cblxuXHQvLyBNZXRob2QgdG8gYXR0YWNoIHRoZSBzcGVjaWZpZWQgY29tcG9uZW50L3RlbXBsYXRlIHRvIGEgcmVnaW9uXG5cdGVsc2UgaWYgKFxuXHRcdCgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eKFteLlxcc10rKVxccyo8XFwtXFxzKiguKlteLlxcc10pLykpICYmIG1hdGNoZXNbMV0gJiYgbWF0Y2hlc1syXSkgfHxcblx0XHQoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXihbXi5cXHNdKylcXHMqXFwtPlxccyooLipbXi5cXHNdKS8pKSAmJiBtYXRjaGVzWzFdICYmIG1hdGNoZXNbMl0gJiZcblx0XHRcdChtYXRjaGVzWyd0bXAnXSA9IG1hdGNoZXNbMV0pICYmIChtYXRjaGVzWzFdID0gbWF0Y2hlc1syXSkgJiYgKG1hdGNoZXNbMl0gPSBtYXRjaGVzWyd0bXAnXSkpXG5cdCkge1xuXHRcdGZuID0gZnVuY3Rpb24gYXR0YWNoVGVtcGxhdGUoKSB7XG5cblx0XHRcdC8vIFJlbW92ZSBhbGwgd2hpdGVzcGFjZSBmcm9tIG1hdGNoZXNcblx0XHRcdG1hdGNoZXNbMV0gPSBtYXRjaGVzWzFdLnJlcGxhY2UoLyhcXHMrKS9nLCAnJyk7XG5cdFx0XHRtYXRjaGVzWzJdID0gbWF0Y2hlc1syXS5yZXBsYWNlKC8oXFxzKykvZywgJycpO1xuXG5cdFx0XHR2YXIgcmVnaW9uID0gbWF0Y2hlc1sxXTtcblx0XHRcdHZhciB0ZW1wbGF0ZSA9IG1hdGNoZXNbMl07XG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZSh0aGlzLmlkICsgJyA6OiBBdHRhY2hpbmcgYCcgKyB0ZW1wbGF0ZSArICdgIHRvIGAnICsgcmVnaW9uICsgJ2AuLi4nKTtcblxuXG5cdFx0XHRpZiAoIXRoaXNbcmVnaW9uXSkge1xuXHRcdFx0XHRGUkFNRVdPUksuZXJyb3IodGhpcy5pZCwnOjogVHJ5aW5nIHRvIGF0dGFjaCByZWdpb24gd2l0aCBzaG9ydGhhbmQgKCcrdmFsdWUrJyksIGJ1dCBjb3VsZCBub3QgZmluZCByZWdpb24gYCcrcmVnaW9uKydgJyk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXNbcmVnaW9uXS5hdHRhY2godGVtcGxhdGUpO1xuXHRcdH07XG5cdH1cblxuXG5cdC8vIE1ldGhvZCB0byB0b2dnbGUgKCEpIHRoZSBzcGVjaWZpZWQgbW9kZWwgYXR0clxuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eXFwhXFxzKlxcQCguKlteLlxcc10pLykpICYmIG1hdGNoZXNbMV0pIHtcblx0XHRmbiA9IGZ1bmN0aW9uIHRvZ2dsZUF0dHIoKSB7XG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZSh0aGlzLmlkICsgJyA6OiBUb2dnbGluZyBhdHRyICgnICsgbWF0Y2hlc1sxXSArICcpLi4uJyk7XG5cdFx0XHR2YXIgb2xkQXR0clZhbHVlID0gdGhpcy5tb2RlbC5nZXQoIG1hdGNoZXNbMV0gKTtcblxuXHRcdFx0aWYgKG9sZEF0dHJWYWx1ZSkge1xuXHRcdFx0XHR0aGlzLm1vZGVsLnNldCggbWF0Y2hlc1sxXSwgZmFsc2UgKTtcblx0XHRcdH1cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHR0aGlzLm1vZGVsLnNldCggbWF0Y2hlc1sxXSwgdHJ1ZSApO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHQvLyBNZXRob2QgdG8gY2hhbmdlIHRoZSBzcGVjaWZpZWQgbW9kZWwgYXR0clxuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eXFxzKlxcQChbXj1dKyk9KFtePV0qKVxccyokLykpKSB7XG5cblx0XHR2YXIgYXR0ck5hbWUgPSBtYXRjaGVzWzFdO1xuXHRcdHZhciBuZXdBdHRyVmFsdWUgPSBtYXRjaGVzWzJdO1xuXG5cdFx0Zm4gPSBmdW5jdGlvbiBjaGFuZ2VBdHRyKCkge1xuXHRcdFx0dGhpcy5tb2RlbC5zZXQoYXR0ck5hbWUsIG5ld0F0dHJWYWx1ZSk7XG5cdFx0fTtcblx0fVxuXG5cdC8vIE1ldGhvZCB0byByZW1vdmUgdGhlIG1vZGVsIGZvciB0aGUgY3VycmVudCBjb21wb25lbnRcblx0ZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXlxccypcXC1cXHMqJC8pKSkge1xuXHRcdGZuID0gZnVuY3Rpb24gcmVtb3ZlTW9kZWwgKCkge1xuXG5cdFx0XHQvLyBPbmx5IHdvcmtzIGlmIG1vZGVsIGJlbG9uZ3MgdG8gYSBjb2xsZWN0aW9uXG5cdFx0XHRpZiAoIXRoaXMubW9kZWwuY29sbGVjdGlvbikgcmV0dXJuO1xuXG5cdFx0XHR0aGlzLm1vZGVsLmNvbGxlY3Rpb24ucmVtb3ZlKHRoaXMubW9kZWwpO1xuXHRcdH07XG5cdH1cblxuXG5cdC8vIGRlcHJlY2F0aW5nIGNsYXNzIG1hbmlwdWxhdGlvbiBzaG9ydGhhbmRcblx0Ly8gKG5vIG5lZWQgdG8gZG8gZG9tIG1hbmlwdWxhdGlvbiB1bmxlc3MgYWJzb2x1dGVseSBuZWNlc3NhcnkpXG5cblx0Ly8gLy8gTWV0aG9kIHRvIGFkZCB0aGUgc3BlY2lmaWVkIGNsYXNzXG5cdC8vIGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL15cXCtcXHMqXFwuKC4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHQvLyBcdGZuID0gZnVuY3Rpb24gYWRkQ2xhc3MoKSB7XG5cdC8vIFx0XHRGUkFNRVdPUksudmVyYm9zZSh0aGlzLmlkICsgJyA6OiBBZGRpbmcgY2xhc3MgKCcgKyBtYXRjaGVzWzFdICsgJykuLi4nKTtcblx0Ly8gXHRcdHRoaXMuJGVsLmFkZENsYXNzKG1hdGNoZXNbMV0pO1xuXHQvLyBcdH07XG5cdC8vIH1cblx0Ly8gLy8gTWV0aG9kIHRvIHJlbW92ZSB0aGUgc3BlY2lmaWVkIGNsYXNzXG5cdC8vIGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL15cXC1cXHMqXFwuKC4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHQvLyBcdGZuID0gZnVuY3Rpb24gcmVtb3ZlQ2xhc3MoKSB7XG5cdC8vIFx0XHRGUkFNRVdPUksudmVyYm9zZSh0aGlzLmlkICsgJyA6OiBSZW1vdmluZyBjbGFzcyAoJyArIG1hdGNoZXNbMV0gKyAnKS4uLicpO1xuXHQvLyBcdFx0dGhpcy4kZWwucmVtb3ZlQ2xhc3MobWF0Y2hlc1sxXSk7XG5cdC8vIFx0fTtcblx0Ly8gfVxuXHQvLyAvLyBNZXRob2QgdG8gdG9nZ2xlIHRoZSBzcGVjaWZpZWQgY2xhc3Ncblx0Ly8gZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXlxcIVxccypcXC4oLipbXi5cXHNdKS8pKSAmJiBtYXRjaGVzWzFdKSB7XG5cdC8vIFx0Zm4gPSBmdW5jdGlvbiB0b2dnbGVDbGFzcygpIHtcblx0Ly8gXHRcdEZSQU1FV09SSy52ZXJib3NlKHRoaXMuaWQgKyAnIDo6IFRvZ2dsaW5nIGNsYXNzICgnICsgbWF0Y2hlc1sxXSArICcpLi4uJyk7XG5cdC8vIFx0XHR0aGlzLiRlbC50b2dnbGVDbGFzcyhtYXRjaGVzWzFdKTtcblx0Ly8gXHR9O1xuXHQvLyB9XG5cblx0Ly8gVE9ETzpcdGFsbG93IGRlc2NlbmRhbnRzIHRvIGJlIGNvbnRyb2xsZWQgdmlhIHNob3J0aGFuZFxuXHQvL1x0XHRcdGUuZy4gOiAnbGkucm93IC0uaGlnaGxpZ2h0ZWQnXG5cdC8vXHRcdFx0d291bGQgcmVtb3ZlIHRoZSBgaGlnaGxpZ2h0ZWRgIGNsYXNzIGZyb20gdGhpcy4kKCdsaS5yb3cnKVxuXG5cblx0Ly8gSWYgc2hvcnQtaGFuZCBtYXRjaGVkLCByZXR1cm4gdGhlIGRlcmVmZXJlbmNlZCBmdW5jdGlvblxuXHRpZiAoZm4pIHtcblxuXHRcdEZSQU1FV09SSy52ZXJib3NlKCdJbnRlcnByZXRpbmcgbWVhbmluZyBmcm9tIHNob3J0aGFuZCA6OiBgJyArIHZhbHVlICsgJ2AuLi4nKTtcblxuXHRcdC8vIEN1cnJ5IHRoZSByZXN1bHQgZnVuY3Rpb24gd2l0aCBhbnkgc3VmZml4IG1hdGNoZXNcblx0XHR2YXIgY3VycmllZEZuID0gZm47XG5cblx0XHQvLyBUcmFpbGluZyBgLmAgaW5kaWNhdGVzIGFuIGUuc3RvcFByb3BhZ2F0aW9uKClcblx0XHRpZiAodmFsdWUubWF0Y2goL1xcLlxccyokLykpIHtcblx0XHRcdGN1cnJpZWRGbiA9IGZ1bmN0aW9uIGFuZFN0b3BQcm9wYWdhdGlvbihlKSB7XG5cblx0XHRcdFx0Ly8gQmluZCAoc28gaXQgaW5oZXJpdHMgY29tcG9uZW50IGNvbnRleHQpIGFuZCBjYWxsIGludGVyaW9yIGZ1bmN0aW9uXG5cdFx0XHRcdGZuLmFwcGx5KHRoaXMpO1xuXG5cdFx0XHRcdC8vIHRoZW4gaW1tZWRpYXRlbHkgc3RvcCBldmVudCBidWJibGluZy9wcm9wYWdhdGlvblxuXHRcdFx0XHRpZiAoZSAmJiBlLnN0b3BQcm9wYWdhdGlvbikge1xuXHRcdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0RlJBTUVXT1JLLndhcm4oXG5cdFx0XHRcdFx0XHR0aGlzLmlkICsgJyA6OiBUcmFpbGluZyBgLmAgc2hvcnRoYW5kIHdhcyB1c2VkIHRvIGludm9rZSBhbiAnICtcblx0XHRcdFx0XHRcdCdlLnN0b3BQcm9wYWdhdGlvbigpLCBidXQgXCInICsgdmFsdWUgKyAnXCIgd2FzIG5vdCB0cmlnZ2VyZWQgYnkgYSBET00gZXZlbnQhXFxuJyArXG5cdFx0XHRcdFx0XHQnUHJvYmFibHkgYmVzdCB0byBkb3VibGUtY2hlY2sgdGhpcyB3YXMgd2hhdCB5b3UgbWVhbnQgdG8gZG8uJyk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGN1cnJpZWRGbjtcblx0fVxuXG5cblx0Ly8gT3RoZXJ3aXNlLCBpZiBubyBzaG9ydC1oYW5kIG1hdGNoZWQsIHBhc3MgdGhlIG9yaWdpbmFsIHZhbHVlXG5cdC8vIHN0cmFpZ2h0IHRocm91Z2hcblx0cmV0dXJuIHZhbHVlO1xufTtcbiJdfQ==
(17)
});
;