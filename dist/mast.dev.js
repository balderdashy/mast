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

		FRAMEWORK.error(this.id + ' :: Cannot render() template (probably missing data).\n\nGot this error ::\n'+str,'\n');
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



// Expose instantiated framework via UMD:
var framework = new Framework();
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

	var embeddedComponent = region.embeddedComponent;


	// If `template` shortcut is enabled, append specified sub-component(s)
	// to the region automatically
	if ( FRAMEWORK.options.shortcut.template && embeddedComponent ) {

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
	el2DefaultTemplateID = require('../utils/el2DefaultTemplateID');


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

		// Wipe the embedded HTML from the DOM.
		// NOTE: this step could be omitted, but leaving it in now for safety.
		this.$el.empty();

		// (maybe later) TODO:
		// allow embedded templates to be named this way, e.g. `<region template="Foo"></region>`
		// (should be very easy)
		//
		// id: this.embeddedComponent,

		// Extend a component prototype, then instantiate the component,
		// but don't render yet.  It's already rendered, mostly! (except for ITS regions)
		// We'll use this anonymous component instance as our `embeddedComponent` for this
		// region.
		this.embeddedComponent = new (
			FRAMEWORK.Component.extend({
				template: embeddedTemplate
			})
		)(properties);

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

},{"../utils/el2DefaultTemplateID":34,"./append":24,"./attach":25,"./empty":26,"./fromElement":27,"./insert":29,"./prepend":30,"./remove":31}],29:[function(require,module,exports){
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
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L2JpbmRFdmVudHMuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L2Nsb3NlLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2NvbXBvbmVudC9jb21waWxlVGVtcGxhdGUuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L2RhdGFCaW5kaW5ncy9jbGFzcy5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9jb21wb25lbnQvZGF0YUJpbmRpbmdzL3RleHQuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L2RlbGV0ZUFsbFJlZ2lvbnMuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L2luZGV4LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2NvbXBvbmVudC9saWZlY3ljbGVFdmVudHMuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L2xpZmVjeWNsZUhvb2tzLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2NvbXBvbmVudC9yZW5kZXIuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L3JlbmRlckNvbGxlY3Rpb24uanMiLCIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L3JlbmRlckRhdGFCaW5kaW5ncy5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9jb21wb25lbnQvcmVuZGVyUmVnaW9ucy5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9jb21wb25lbnQvdmFsaWRhdGVEZWZpbml0aW9uLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2RlZmluZS9idWlsZERlZmluaXRpb24uanMiLCIvY29kZS9vc3MvbWFzdC9saWIvZGVmaW5lL2luZGV4LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2luZGV4LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2xvZ2dlci9pbmRleC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9sb2dnZXIvc2V0dXAuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvcmFpc2UvYnVpbGRQcm90b3R5cGUuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvcmFpc2UvY29sbGVjdFJlZ2lvbnMuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvcmFpc2UvY29sbGVjdFRlbXBsYXRlc0Zyb21TY3JpcHRUYWdzLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3JhaXNlL2luZGV4LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3JlZ2lvbi9hcHBlbmQuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvcmVnaW9uL2F0dGFjaC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9yZWdpb24vZW1wdHkuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvcmVnaW9uL2Zyb21FbGVtZW50LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3JlZ2lvbi9pbmRleC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9yZWdpb24vaW5zZXJ0LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3JlZ2lvbi9wcmVwZW5kLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3JlZ2lvbi9yZW1vdmUuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvcm91dGVyL2luZGV4LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3V0aWxzL0RPTS5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi91dGlscy9lbDJEZWZhdWx0VGVtcGxhdGVJRC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi91dGlscy9lbDJNYXN0SUQuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvdXRpbHMvZXZlbnRzLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3V0aWxzL29iak1hcC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi91dGlscy9zaG9ydGhhbmQuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9GQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekxBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL05BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNYQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNaQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llc1xuICovXG52YXIgcmVuZGVyRGF0YUJpbmRpbmdzID0gcmVxdWlyZSgnLi9yZW5kZXJEYXRhQmluZGluZ3MnKTtcblxuXG4vKipcbiAqIEJpbmQgY29sbGVjdGlvbiBldmVudHMgdG8gbGlmZWN5Y2xlIGV2ZW50IGhhbmRsZXJzXG4gKi9cbmV4cG9ydHMuY29sbGVjdGlvbkV2ZW50cyA9IGZ1bmN0aW9uKCkge1xuXHQvLyBCaW5kIHRvIGNvbGxlY3Rpb24gZXZlbnRzIGlmIG9uZSB3YXMgcGFzc2VkIGluXG5cdGlmICh0aGlzLmNvbGxlY3Rpb24pIHtcblxuXHRcdC8vIExpc3RlbiB0byBldmVudHNcblx0XHR0aGlzLmxpc3RlblRvKHRoaXMuY29sbGVjdGlvbiwgJ2FkZCcsIHRoaXMuYWZ0ZXJBZGQpO1xuXHRcdHRoaXMubGlzdGVuVG8odGhpcy5jb2xsZWN0aW9uLCAncmVtb3ZlJywgdGhpcy5hZnRlclJlbW92ZSk7XG5cdFx0dGhpcy5saXN0ZW5Ubyh0aGlzLmNvbGxlY3Rpb24sICdyZXNldCcsIHRoaXMuYWZ0ZXJSZXNldCk7XG5cdH1cbn07XG5cbi8qKlxuICogQmluZCBtb2RlbCBldmVudHMgdG8gbGlmZWN5Y2xlIGV2ZW50IGhhbmRsZXJzIGFuZCBhbHNvIGFsbG93cyBmb3IgaGFuZGxlcnMgdG8gZmlyZVxuICogb24gY2VydGFpbiBtb2RlbCBhdHRyaWJ1dGUgY2hhbmdlcy5cbiAqL1xuZXhwb3J0cy5tb2RlbEV2ZW50cyA9IGZ1bmN0aW9uKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0aWYgKHRoaXMubW9kZWwpIHtcblxuXHRcdC8vIExpc3RlbiBmb3IgYW55IGF0dHJpYnV0ZSBjaGFuZ2VzXG5cdFx0Ly8gZS5nLlxuXHRcdC8vIC5hZnRlckNoYW5nZShtb2RlbCwgb3B0aW9ucylcblx0XHQvL1xuXHRcdHRoaXMubGlzdGVuVG8odGhpcy5tb2RlbCwgJ2NoYW5nZScsIGZ1bmN0aW9uIG1vZGVsQ2hhbmdlZCAobW9kZWwsIG9wdGlvbnMpIHtcblxuXHRcdFx0Ly8gUmVuZGVyIGRhdGEgYmluZGluZ3Ncblx0XHRcdHJlbmRlckRhdGFCaW5kaW5ncy5jYWxsKHNlbGYpO1xuXG5cdFx0XHQvLyBSdW4gY3VzdG9tIGBhZnRlckNoYW5nZWAoKSBtZXRob2Rcblx0XHRcdGlmIChfLmlzRnVuY3Rpb24odGhpcy5hZnRlckNoYW5nZSkpIHtcblx0XHRcdFx0dGhpcy5hZnRlckNoYW5nZShtb2RlbCwgb3B0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyBMaXN0ZW4gZm9yIHNwZWNpZmljIGF0dHJpYnV0ZSBjaGFuZ2VzXG5cdFx0Ly8gZS5nLlxuXHRcdC8vIC5hZnRlckNoYW5nZS5jb2xvcihtb2RlbCwgdmFsdWUsIG9wdGlvbnMpXG5cdFx0aWYgKF8uaXNPYmplY3QodGhpcy5hZnRlckNoYW5nZSkpIHtcblx0XHRcdF8uZWFjaCh0aGlzLmFmdGVyQ2hhbmdlLCBmdW5jdGlvbiAoaGFuZGxlciwgYXR0ck5hbWUpIHtcblxuXHRcdFx0XHQvLyBDYWxsIGhhbmRsZXIgd2l0aCBuZXdWYWwgdG8ga2VlcCBhcmd1bWVudHMgc3RyYWlnaHRmb3J3YXJkXG5cdFx0XHRcdHRoaXMubGlzdGVuVG8odGhpcy5tb2RlbCwgJ2NoYW5nZTonICsgYXR0ck5hbWUsIGZ1bmN0aW9uIGF0dHJDaGFuZ2VkIChtb2RlbCwgbmV3VmFsKSB7XG5cdFx0XHRcdFx0aGFuZGxlci5jYWxsKHRoaXMsIG5ld1ZhbCk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHR9LCB0aGlzKTtcblx0XHR9XG5cdH1cbn07XG5cbi8qKlxuICogTGlzdGVucyBmb3IgYW5kIHJ1bnMgaGFuZGxlcnMgb24gZ2xvYmFsIGV2ZW50cyB0aGF0IGFyZSBsaXN0ZW5lZCBmb3Igb24gYSBjb21wb25lbnQuXG4gKi9cbmV4cG9ydHMuZ2xvYmFsVHJpZ2dlcnMgPSBmdW5jdGlvbigpIHtcblxuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0dGhpcy5saXN0ZW5UbyhGUkFNRVdPUkssICdhbGwnLCBmdW5jdGlvbiAoZVJvdXRlKSB7XG5cblx0XHQvLyBUcmltIG9mZiBhbGwgYnV0IHRoZSBmaXJzdCBhcmd1bWVudCB0byBwYXNzIHRocm91Z2ggdG8gaGFuZGxlclxuXHRcdHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcblx0XHRhcmdzLnNoaWZ0KCk7XG5cblx0XHQvLyBJdGVyYXRlIHRocm91Z2ggZWFjaCBzdWJzY3JpcHRpb24gb24gdGhpcyBjb21wb25lbnRcblx0XHQvLyBhbmQgbGlzdGVuIGZvciB0aGUgc3BlY2lmaWVkIGdsb2JhbCBldmVudHNcblx0XHRfLmVhY2goc2VsZi5zdWJzY3JpcHRpb25zLCBmdW5jdGlvbihoYW5kbGVyLCBtYXRjaFBhdHRlcm4pIHtcblxuXHRcdFx0Ly8gR3JhYiByZWdleCBhbmQgcGFyYW0gcGFyc2luZyBsb2dpYyBmcm9tIEJhY2tib25lIGNvcmVcblx0XHRcdHZhciBleHRyYWN0UGFyYW1zID0gQmFja2JvbmUuUm91dGVyLnByb3RvdHlwZS5fZXh0cmFjdFBhcmFtZXRlcnMsXG5cdFx0XHRcdGNhbGN1bGF0ZVJlZ2V4ID0gQmFja2JvbmUuUm91dGVyLnByb3RvdHlwZS5fcm91dGVUb1JlZ0V4cDtcblxuXHRcdFx0Ly8gVHJpbSB0cmFpbGluZ1xuXHRcdFx0bWF0Y2hQYXR0ZXJuID0gbWF0Y2hQYXR0ZXJuLnJlcGxhY2UoL1xcLyokL2csICcnKTtcblx0XHRcdC8vIGFuZCBlciBzb3J0IG9mLi4gbGVhZGluZy4uIHNsYXNoZXNcblx0XHRcdG1hdGNoUGF0dGVybiA9IG1hdGNoUGF0dGVybi5yZXBsYWNlKC9eKFsjfiVdKVxcLyovZywgJyQxJyk7XG5cdFx0XHQvLyBUT0RPOiBvcHRpbWl6YXRpb24tIHRoaXMgcmVhbGx5IG9ubHkgaGFzIHRvIGJlIGRvbmUgb25jZSwgb24gcmFpc2UoKSwgd2Ugc2hvdWxkIGRvIHRoYXRcblxuXG5cdFx0XHQvLyBDb21lIHVwIHdpdGggcmVnZXggZm9yIHRoaXMgbWF0Y2hQYXR0ZXJuXG5cdFx0XHR2YXIgcmVnZXggPSBjYWxjdWxhdGVSZWdleChtYXRjaFBhdHRlcm4pO1xuXG5cdFx0XHQvLyBJZiB0aGlzIG1hdGNoUGF0ZXJuIGlzIHRoaXMgaXMgbm90IGEgbWF0Y2ggZm9yIHRoZSBldmVudCxcblx0XHRcdC8vIGBjb250aW51ZWAgaXQgYWxvbmcgdG8gaXQgY2FuIHRyeSB0aGUgbmV4dCBtYXRjaFBhdHRlcm5cblx0XHRcdGlmICghZVJvdXRlLm1hdGNoKHJlZ2V4KSkgcmV0dXJuO1xuXG5cdFx0XHQvLyBQYXJzZSBwYXJhbWV0ZXJzIGZvciB1c2UgYXMgYXJncyB0byB0aGUgaGFuZGxlclxuXHRcdFx0Ly8gKG9yIGFuIGVtcHR5IGxpc3QgaWYgbm9uZSBleGlzdClcblx0XHRcdHZhciBwYXJhbXMgPSBleHRyYWN0UGFyYW1zKHJlZ2V4LCBlUm91dGUpO1xuXG5cdFx0XHQvLyBIYW5kbGUgc3RyaW5nIHJlZGlyZWN0cyB0byBmdW5jdGlvbiBuYW1lc1xuXHRcdFx0aWYgKCFfLmlzRnVuY3Rpb24oaGFuZGxlcikpIHtcblx0XHRcdFx0aGFuZGxlciA9IHNlbGZbaGFuZGxlcl07XG5cblx0XHRcdFx0aWYgKCFoYW5kbGVyKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgdHJpZ2dlciBzdWJzY3JpcHRpb24gYmVjYXVzZSBvZiB1bmtub3duIGhhbmRsZXI6ICcgKyBoYW5kbGVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBCaW5kIGNvbnRleHQgYW5kIGFyZ3VtZW50cyB0byBzdWJzY3JpcHRpb24gaGFuZGxlclxuXHRcdFx0aGFuZGxlci5hcHBseShzZWxmLCBfLnVuaW9uKGFyZ3MsIHBhcmFtcykpO1xuXG5cdFx0fSk7XG5cdH0pO1xufTtcbiIsIi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llc1xuICovXG5cbnZhciBkZWxldGVBbGxSZWdpb25zID0gcmVxdWlyZSgnLi9kZWxldGVBbGxSZWdpb25zJyk7XG5cblxuXG5cbi8qKlxuICogRlJBTUVXT1JLLkNvbXBvbmVudC5wcm90b3R5cGUuY2xvc2VcbiAqXG4gKiBTYWZlbHkgemFwIGV2ZXJ5IHRyYWNlIGFib3V0IHRoaXMgY29tcG9uZW50IGZyb20gbWVtb3J5LlxuICpcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNsb3NlICgpIHtcblxuXHRGUkFNRVdPUksuZGVidWcoJ0Nsb3NlZCAnICsgdGhpcy5pZCArICcgY29tcG9uZW50LicpO1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0Ly8gQ2FuY2VsIGN1cnJlbnQgcmVuZGVyIGFuZCBjbG9zZSBqb2JzLCBpZiB0aGV5J3JlIHJ1bm5pbmdcblx0aWYgKHRoaXMuX3JlbmRlcmluZykge1xuXHRcdHNlbGYuX3JlbmRlcmluZ0NhbmNlbGVkID0gdHJ1ZTtcblx0XHR0aGlzLmNhbmNlbFJlbmRlcigpO1xuXHRcdHNlbGYuX3JlbmRlcmluZyA9IGZhbHNlO1xuXHR9XG5cdGlmICh0aGlzLl9jbG9zaW5nKSB7XG5cdFx0dGhpcy5jYW5jZWxDbG9zZSgpO1xuXHRcdHNlbGYuX2Nsb3NpbmcgPSBmYWxzZTtcblx0fVxuXG5cdC8vIExvY2sgYWNjZXNzIHRvIGNsb3NlKClcblx0dGhpcy5fY2xvc2luZyA9IHRydWU7XG5cblx0dGhpcy5iZWZvcmVDbG9zZShmdW5jdGlvbiAoKSB7XG5cblx0XHQvLyA+IE5PVEU6IGB0aGlzLl9jbG9zaW5nPWZhbHNlYCBjYW4gYW5kIHByb2JhYmx5IHNob3VsZCBiZSByZW1vdmVkLFxuXHRcdC8vID4gc2luY2UgbXV0ZXggaXMgdW5uZWNlc3Nhcnkgbm93IHRoYXQgdGhlIGNvbXBvbmVudCBpcyB1cCBmb3IgZ2FyYmFnZSBjb2xsZWN0aW9uXG5cdFx0Ly8gPiBXYWl0aW5nIHRvIGRvIHRoaXMgdW50aWwgaXQgY2FuIGJlIHRlc3RlZCBmdXJ0aGVyXG5cblx0XHQvLyBVbmxvY2sgY2xvc2UoKVxuXHRcdHNlbGYuX2Nsb3NpbmcgPSBmYWxzZTtcblxuXHRcdC8vIFN0b3AgbGlzdGVuaW5nIHRvIGFsbCBnbG9iYWwgdHJpZ2dlcnMgKCV8IylcblxuXHRcdC8vIENsb3NlIGFsbCBjaGlsZCBjb21wb25lbnRzXG5cdFx0ZGVsZXRlQWxsUmVnaW9ucy5jYWxsKHNlbGYpO1xuXG5cdFx0Ly8gQ2FsbCBuYXRpdmUgYEJhY2tib25lLlZpZXcucHJvdG90eXBlLnJlbW92ZSgpYFxuXHRcdC8vIHRvIHVuZGVsZWdhdGUgZXZlbnRzLCBldGMuXG5cdFx0c2VsZi5yZW1vdmUoKTtcblxuXHR9KTtcbn07XG4iLCIvKipcbiAqIENvbnZlcnQgdGVtcGxhdGUgSFRNTCBhbmQgZGF0YSBpbnRvIGEgY29tcGlsZWQgJHRlbXBsYXRlXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY29tcGlsZVRlbXBsYXRlICgpIHtcblxuXHQvLyBDcmVhdGUgdGVtcGxhdGUgZGF0YSBjb250ZXh0IGJ5IHByb3ZpZGluZyBhY2Nlc3MgdG8gdGhlIGdsb2JhbCBEYXRhIG9iamVjdCxcblx0Ly8gQWxzbyBmb2xkIGluIHRoZSBtb2RlbCBhc3NvY2lhdGVkIHdpdGggdGhpcyBjb21wb25lbnQsIGlmIHRoZXJlIGlzIG9uZVxuXHR2YXIgdGVtcGxhdGVDb250ZXh0ID0gXy5leHRlbmQoe1xuXG5cdFx0Ly8gQWxsb3dzIHlvdSB0byBnZXQgYSBob2xkIG9mIGRhdGEsXG5cdFx0Ly8gYnV0IHVzZSBhIGRlZmF1bHQgdmFsdWUgaWYgaXQgZG9lc24ndCBleGlzdFxuXHRcdGdldDogZnVuY3Rpb24gKGtleSwgZGVmYXVsdFZhbCkge1xuXHRcdFx0dmFyIHZhbCA9IHRlbXBsYXRlQ29udGV4dFtrZXldO1xuXHRcdFx0aWYgKHR5cGVvZiB2YWwgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdHZhbCA9IGRlZmF1bHRWYWw7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdmFsO1xuXHRcdH1cblx0fSxcblxuXHQvLyBBbGwgRlJBTUVXT1JLLmRhdGEgaXMgYXZhaWxhYmxlIGluIGV2ZXJ5IHRlbXBsYXRlXG5cdEZSQU1FV09SSy5kYXRhKTtcblxuXHQvLyBJZiBhIG1vZGVsIGlzIHByb3ZpZGVkIGZvciB0aGlzIGNvbXBvbmVudCwgbWFrZSBpdCBhdmFpbGFibGUgaW4gdGhpcyB0ZW1wbGF0ZVxuXHRpZiAodGhpcy5tb2RlbCkge1xuXHRcdF8uZXh0ZW5kKHRlbXBsYXRlQ29udGV4dCwgdGhpcy5tb2RlbC5hdHRyaWJ1dGVzKTtcblx0fVxuXG5cdC8vIFRlbXBsYXRlIHRoZSBIVE1MIHdpdGggdGhlIGRhdGFcblx0dmFyIGh0bWw7XG5cdHRyeSB7XG5cdFx0Ly8gQWNjZXB0IHByZWNvbXBpbGVkIHRlbXBsYXRlc1xuXHRcdGlmIChfLmlzRnVuY3Rpb24odGhpcy50ZW1wbGF0ZSkpIHtcblx0XHRcdGh0bWwgPSB0aGlzLnRlbXBsYXRlKHRlbXBsYXRlQ29udGV4dCk7XG5cdFx0fVxuXHRcdC8vIE9yIHJhdyBzdHJpbmdzXG5cdFx0ZWxzZSBodG1sID0gXy50ZW1wbGF0ZSh0aGlzLnRlbXBsYXRlLCB0ZW1wbGF0ZUNvbnRleHQpO1xuXHR9XG5cdGNhdGNoIChlKSB7XG5cdFx0dmFyIHN0ciA9IGUsXG5cdFx0XHRzdGFjayA9ICcnO1xuXG5cdFx0aWYgKGUgaW5zdGFuY2VvZiBFcnJvcikge1xuXHRcdFx0c3RyID0gIGUudG9TdHJpbmcoKTtcblx0XHRcdHN0YWNrID0gZS5zdGFjaztcblx0XHR9XG5cblx0XHRGUkFNRVdPUksuZXJyb3IodGhpcy5pZCArICcgOjogQ2Fubm90IHJlbmRlcigpIHRlbXBsYXRlIChwcm9iYWJseSBtaXNzaW5nIGRhdGEpLlxcblxcbkdvdCB0aGlzIGVycm9yIDo6XFxuJytzdHIsJ1xcbicpO1xuXHRcdGlmIChodG1sKSB7RlJBTUVXT1JLLnZlcmJvc2UoJ1RlbXBsYXRlIDo6ICcgKyBodG1sKTt9XG5cdFx0RlJBTUVXT1JLLnZlcmJvc2UoJ0Z1bGwgVGVtcGxhdGUgRXJyb3I6JyArICdcXG4nLHN0YWNrKTtcblx0XHRGUkFNRVdPUksudmVyYm9zZSgnXFxuXFxuTW9yZSBpbmZvcm1hdGlvbjonLCAnXFxuXFxuVGVtcGxhdGUgY29udGV4dCA6OicsdGVtcGxhdGVDb250ZXh0LCAnXFxuXFxudGhpcy5tb2RlbDo6JywgdGhpcy5tb2RlbCk7XG5cdFx0aHRtbCA9IF8uaXNTdHJpbmcodGhpcy50ZW1wbGF0ZSkgPyB0aGlzLnRlbXBsYXRlIDogc3RyO1xuXHR9XG5cblx0cmV0dXJuIGh0bWw7XG59O1xuXG5cbiIsIi8qKlxuICogYGNsYXNzYCBkYXRhIGJpbmRpbmdcbiAqIEB0eXBlIHtPYmplY3R9XG4gKi9cbm1vZHVsZS5leHBvcnRzID0ge1xuXHRyZWdleHA6IC9iaW5kXFwtY2xhc3NcXC0oW14tXSspLyxcblx0Zm46IGZ1bmN0aW9uICgkZWwsIG1vZGVsLCBtYXRjaGVzKSB7XG5cdFx0Ly8gUmVnZXhwIG1hdGNoZXMgZm9yIHdpbGRjYXJkIHBhcmFtcyBpbiBhdHRyaWJ1dGUgbWF0Y2ggZXhwcmVzc2lvblxuXHRcdHZhciBjbGFzc05hbWUgPSBtYXRjaGVzWzFdO1xuXG5cdFx0dmFyIHJhdyA9ICRib3VuZEVsLmF0dHIoJ2JpbmQtY2xhc3MtJyArIGNsYXNzTmFtZSk7XG5cdFx0dmFyIGNsZWFuID0gcmF3LnJlcGxhY2UoL15ALywgJycpO1xuXHRcdGlmICggbW9kZWwuZ2V0KGNsZWFuKSApIHtcblx0XHRcdCRib3VuZEVsLmFkZENsYXNzKGNsYXNzTmFtZSk7XG5cdFx0fVxuXHRcdGVsc2Uge1xuXHRcdFx0JGJvdW5kRWwucmVtb3ZlQ2xhc3MoY2xhc3NOYW1lKTtcblx0XHR9XG5cdH1cbn07XG5cbiIsIi8qKlxuICogYHRleHRgIGRhdGEgYmluZGluZ1xuICogQHR5cGUge09iamVjdH1cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcblx0cmVnZXhwOiAvYmluZC10ZXh0Lyxcblx0Zm46IGZ1bmN0aW9uICgkZWwsIG1vZGVsKSB7XG5cdFx0dmFyIHJhdyA9ICRib3VuZEVsLmF0dHIoJ2JpbmQtdGV4dCcpO1xuXHRcdHZhciBjbGVhbiA9IHJhdy5yZXBsYWNlKC9eQC8sICcnKTtcblx0XHQkYm91bmRFbC50ZXh0KCBtb2RlbC5nZXQoY2xlYW4pICk7XG5cdH1cbn07XG4iLCIvKipcbiAqIElmIGFueSByZWdpb25zIGV4aXN0IGluIHRoaXMgY29tcG9uZW50LFxuICogZW1wdHkgdGhlbSwgYW5kIHRoZW4gZGVsZXRlIHRoZW1cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGRlbGV0ZUFsbFJlZ2lvbnMgKCkge1xuXHRfLmVhY2godGhpcy5yZWdpb25zLCBmdW5jdGlvbiAocmVnaW9uLCBrZXkpIHtcblx0XHRyZWdpb24uZW1wdHkoKTtcblx0XHRkZWxldGUgdGhpcy5yZWdpb25zW2tleV07XG5cdH0sIHRoaXMpO1xufTtcbiIsIi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llc1xuICovXG5cbnZhciBsaWZlY3ljbGVIb29rcyAgICAgPSByZXF1aXJlKCcuL2xpZmVjeWNsZUhvb2tzJyksXG5cdGxpZmVjeWNsZUV2ZW50cyAgICA9IHJlcXVpcmUoJy4vbGlmZWN5Y2xlRXZlbnRzJyksXG5cdGJpbmRFdmVudHMgICAgICAgICA9IHJlcXVpcmUoJy4vYmluZEV2ZW50cycpLFxuXHRjbG9zZUNvbXBvbmVudCAgICAgPSByZXF1aXJlKCcuL2Nsb3NlJyksXG5cdHJlbmRlciAgICAgICAgICAgICA9IHJlcXVpcmUoJy4vcmVuZGVyJyksXG5cdHJlbmRlckNvbGxlY3Rpb24gICA9IHJlcXVpcmUoJy4vcmVuZGVyQ29sbGVjdGlvbicpLFxuXHR2YWxpZGF0ZURlZmluaXRpb24gPSByZXF1aXJlKCcuL3ZhbGlkYXRlRGVmaW5pdGlvbicpO1xuXG5cbi8qKlxuICogRlJBTUVXT1JLLkNvbXBvbmVudFxuICpcbiAqIENvbXBvbmVudCBpcyBhbiBleHRlbmRlZCBgQmFja2JvbmUuVmlld2AuIEl0IGFkZCBmZWF0dXJlcyBzdWNoIGFzIGF1dG9tYXRpYyBldmVudCBiaW5kaW5nLFxuICogcmVuZGVyaW5nLCBsaWZlY3ljbGUgaG9va3MgYW5kIGV2ZW50cywgYW5kIG1vcmUuXG4gKlxuICogQGNvbnN0cnVjdG9yXG4gKi9cbnZhciBDb21wb25lbnQgPSBtb2R1bGUuZXhwb3J0cyA9IEJhY2tib25lLlZpZXcuZXh0ZW5kKCk7XG5cblxuXy5leHRlbmQoQ29tcG9uZW50LnByb3RvdHlwZSwge1xuXG5cdC8vIExpZmVjeWNsZSBIb29rc1xuXHRiZWZvcmVSZW5kZXI6IGZ1bmN0aW9uKGNiKSB7XG5cdFx0bGlmZWN5Y2xlSG9va3MuYmVmb3JlUmVuZGVyLmNhbGwodGhpcywgY2IpO1xuXHR9LFxuXHRiZWZvcmVDbG9zZTogZnVuY3Rpb24oY2IpIHtcblx0XHRsaWZlY3ljbGVIb29rcy5iZWZvcmVDbG9zZS5jYWxsKHRoaXMsIGNiKTtcblx0fSxcblx0YWZ0ZXJSZW5kZXI6IGZ1bmN0aW9uKCkge1xuXHRcdGxpZmVjeWNsZUhvb2tzLmFmdGVyUmVuZGVyLmNhbGwodGhpcyk7XG5cdH0sXG5cdGNhbmNlbFJlbmRlcjogZnVuY3Rpb24oKSB7XG5cdFx0bGlmZWN5Y2xlSG9va3MuY2FuY2VsUmVuZGVyLmNhbGwodGhpcyk7XG5cdH0sXG5cdGNhbmNlbENsb3NlOiBmdW5jdGlvbigpIHtcblx0XHRsaWZlY3ljbGVIb29rcy5jYW5jZWxDbG9zZS5jYWxsKHRoaXMpO1xuXHR9LFxuXG5cdC8vIExpZmVjeWNsZSBFdmVudHNcblx0YWZ0ZXJDaGFuZ2U6IGZ1bmN0aW9uKG1vZGVsLCBvcHRpb25zKSB7XG5cdFx0bGlmZWN5Y2xlRXZlbnRzLmFmdGVyQ2hhbmdlLmNhbGwodGhpcywgbW9kZWwsIG9wdGlvbnMpO1xuXHR9LFxuXHRhZnRlckFkZDogZnVuY3Rpb24obW9kZWwsIGNvbGxlY3Rpb24sIG9wdGlvbnMpIHtcblx0XHRsaWZlY3ljbGVFdmVudHMuYWZ0ZXJBZGQuY2FsbCh0aGlzLCBtb2RlbCwgY29sbGVjdGlvbiwgb3B0aW9ucyk7XG5cdH0sXG5cdGFmdGVyUmVtb3ZlOiBmdW5jdGlvbihtb2RlbCwgY29sbGVjdGlvbiwgb3B0aW9ucykge1xuXHRcdGxpZmVjeWNsZUV2ZW50cy5hZnRlclJlbW92ZS5jYWxsKHRoaXMsIG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zKTtcblx0fSxcblx0YWZ0ZXJSZXNldDogZnVuY3Rpb24oY29sbGVjdGlvbiwgb3B0aW9ucykge1xuXHRcdGxpZmVjeWNsZUV2ZW50cy5hZnRlclJlc2V0LmNhbGwodGhpcywgY29sbGVjdGlvbiwgb3B0aW9ucyk7XG5cdH0sXG5cblx0Ly8gUHJvdG90eXBlIG1ldGhvZHMuXG5cdGNsb3NlOiBmdW5jdGlvbigpIHtcblx0XHRjbG9zZUNvbXBvbmVudC5jYWxsKHRoaXMpO1xuXHR9LFxuXHRyZW5kZXI6IGZ1bmN0aW9uKGF0SW5kZXgpIHtcblx0XHRyZW5kZXIuY2FsbCh0aGlzLCBhdEluZGV4KTtcblx0fSxcblxuXHRyZW5kZXJDb2xsZWN0aW9uOiBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuXHRcdHJlbmRlckNvbGxlY3Rpb24uYXBwbHkodGhpcywgYXJncyk7XG5cdH0sXG59KTtcblxuXG5cblxuQ29tcG9uZW50LnByb3RvdHlwZS5pbml0aWFsaXplID0gZnVuY3Rpb24ocHJvcGVydGllcykge1xuXG5cdHZhciBzZWxmID0gdGhpcztcblxuXHQvLyBLZWVwIHRyYWNrIG9mIGEgY291bnRlciBmb3IgdXNlIGluIGdlbmVyYXRpbmdcblx0Ly8gaWRzIGZvciBhbm9ueW1vdXMgY29tcG9uZW50cy5cblx0dGhpcy5hbm9ueW1vdXNSZWdpb25Db3VudGVyID0gMDtcblxuXHQvLyBEaXNhYmxlIG9yIGlzc3VlIHdhcm5pbmdzIGFib3V0IGNlcnRhaW4gcHJvcGVydGllc1xuXHQvLyBhbmQgbWV0aG9kcyB0byBhdm9pZCBjb25mdXNpb25cblx0cHJvcGVydGllcyA9IHZhbGlkYXRlRGVmaW5pdGlvbihwcm9wZXJ0aWVzKTtcblxuXHQvLyBFeHRlbmQgaW5zdGFuY2Ugdy8gc3BlY2lmaWVkIHByb3BlcnRpZXMgYW5kIG1ldGhvZHNcblx0Xy5leHRlbmQodGhpcywgcHJvcGVydGllcyk7XG5cblx0Ly8gU3RhcnQgd2l0aCBlbXB0eSByZWdpb25zIG9iamVjdFxuXHR0aGlzLnJlZ2lvbnMgPSB7fTtcblxuXHQvLyBFbmNvdXJhZ2UgY2hpbGQgbWV0aG9kcyB0byB1c2UgdGhlIGNvbXBvbmVudCBjb250ZXh0XG5cdF8uYmluZEFsbCh0aGlzKTtcbn07XG4iLCIvLyBGaXJlZCB3aGVuIHRoZSBib3VuZCBtb2RlbCBpcyB1cGRhdGVkIChgdGhpcy5tb2RlbGApXG5leHBvcnRzLmFmdGVyQ2hhbmdlID0gZnVuY3Rpb24gKG1vZGVsLCBvcHRpb25zKSB7fTtcblxuLy8gRmlyZWQgd2hlbiBhIG1vZGVsIGlzIGFkZGVkIHRvIHRoZSBib3VuZCBjb2xsZWN0aW9uIChgdGhpcy5jb2xsZWN0aW9uYClcbmV4cG9ydHMuYWZ0ZXJBZGQgPSBmdW5jdGlvbiAobW9kZWwsIGNvbGxlY3Rpb24sIG9wdGlvbnMpIHt9O1xuXG4vLyBGaXJlZCB3aGVuIGEgbW9kZWwgaXMgcmVtb3ZlZCBmcm9tIHRoZSBib3VuZCBjb2xsZWN0aW9uIChgdGhpcy5jb2xsZWN0aW9uYClcbmV4cG9ydHMuYWZ0ZXJSZW1vdmUgPSBmdW5jdGlvbiAobW9kZWwsIGNvbGxlY3Rpb24sIG9wdGlvbnMpIHt9O1xuXG4vLyBGaXJlZCB3aGVuIHRoZSBib3VuZCBjb2xsZWN0aW9uIGlzIHdpcGVkIChgdGhpcy5jb2xsZWN0aW9uYClcbmV4cG9ydHMuYWZ0ZXJSZXNldCA9IGZ1bmN0aW9uIChjb2xsZWN0aW9uLCBvcHRpb25zKSB7fTtcbiIsIi8vIEZpcmVkIGF1dG9tYXRpY2FsbHkgd2hlbiB0aGUgdmlldyBpcyBpbml0aWFsbHkgY3JlYXRlZFxuLy8gb25seSBmaXJlZCBhZnRlcndhcmRzIGlmIHRoaXMucmVuZGVyKCkgaXMgZXhwbGljaXRseSBjYWxsZWRcbi8vIENhbGxiYWNrIG11c3QgYmUgZmlyZWQhIVxuZXhwb3J0cy5iZWZvcmVSZW5kZXIgPSBmdW5jdGlvbiAoY2IpIHtjYigpO307XG5cbi8vIEZpcmVkIGF1dG9tYXRpY2FsbHkgd2hlbiB0aGUgdmlldyBpcyBpbml0aWFsbHkgY3JlYXRlZFxuLy8gb25seSBmaXJlZCBhZnRlcndhcmRzIGlmIHRoaXMucmVuZGVyKCkgaXMgZXhwbGljaXRseSBjYWxsZWRcbmV4cG9ydHMuYWZ0ZXJSZW5kZXIgPSBmdW5jdGlvbiAoKSB7fTtcblxuLy8gRmlyZWQgYXV0b21hdGljYWxseSB3aGVuIHRoZSB2aWV3IGlzIGNsb3NlZFxuZXhwb3J0cy5iZWZvcmVDbG9zZSA9IGZ1bmN0aW9uIChjYikge2NiKCk7fTtcblxuLy8gRmlyZWQgYmVmb3JlIHJlcmVuZGVyaW5nIG9yIGNsb3NpbmcgYSB2aWV3IHRoYXQgaXMgYWxyZWFkeSB3YWl0aW5nIG9uIGEgbG9ja1xuZXhwb3J0cy5jYW5jZWxSZW5kZXIgPSBmdW5jdGlvbiAoKSB7XG5cdEZSQU1FV09SSy53YXJuKCdjYW5jZWxSZW5kZXIoKSBzaG91bGQgYmUgZGVmaW5lZCBpZiBiZWZvcmVDbG9zZShjYikgb3IgYmVmb3JlUmVuZGVyKGNiKScgK1xuXHRcdFx0XHRcdFx0XHRcdCAnYXJlIGJlaW5nIHVzZWQhJyk7XG59O1xuXG4vLyBGaXJlZCBiZWZvcmUgcmVyZW5kZXJpbmcgb3IgY2xvc2luZyBhIHZpZXcgdGhhdCBpcyBhbHJlYWR5IHdhaXRpbmcgb24gYSBsb2NrXG5leHBvcnRzLmNhbmNlbENsb3NlID0gZnVuY3Rpb24gKCkge1xuXHRGUkFNRVdPUksud2FybignY2FuY2VsQ2xvc2UoKSBzaG91bGQgYmUgZGVmaW5lZCBpZiBiZWZvcmVDbG9zZShjYikgb3IgYmVmb3JlUmVuZGVyKGNiKScgK1xuXHRcdFx0XHRcdFx0XHRcdCAnYXJlIGJlaW5nIHVzZWQhJyk7XG59O1xuIiwiLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzXG4gKi9cblxudmFyIERPTSA9IHJlcXVpcmUgKCcuLi91dGlscy9ET00nKSxcblx0XHRyZW5kZXJEYXRhQmluZGluZ3MgPSByZXF1aXJlKCcuL3JlbmRlckRhdGFCaW5kaW5ncycpLFxuXHRcdGNvbXBpbGVUZW1wbGF0ZSA9IHJlcXVpcmUoJy4vY29tcGlsZVRlbXBsYXRlJyksXG5cdFx0cmVuZGVyUmVnaW9ucyA9IHJlcXVpcmUoJy4vcmVuZGVyUmVnaW9ucycpLFxuXHRcdGJpbmRFdmVudHMgPSByZXF1aXJlICgnLi9iaW5kRXZlbnRzJyk7XG5cblxuXG5cbi8qKlxuICogUnVuIEhUTUwgdGVtcGxhdGUgdGhyb3VnaCBlbmdpbmUgYW5kIGFwcGVuZCByZXN1bHRzIHRvIG91dGxldC4gQWxzbyByZXJlbmRlciByZWdpb25zLlxuICogSWYgYXRJbmRleCBpcyBzcGVjaWZpZWQsIHRoZSBjb21wb25lbnQgaXMgcmVuZGVyZWQgYXQgdGhlIGdpdmVuIHBvc2l0aW9uIHdpdGhpbiBpdHNcbiAqIG91dGxldC4gT3RoZXJ3aXNlLCB0aGUgbGFzdCBwb3NpdGlvbiBpcyB1c2VkLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSBhdEluZGV4IFtUaGUgaW5kZXggaW4gd2hpY2ggdG8gcmVuZGVyIHRoaXMgZWxlbWVudF1cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHJlbmRlcihhdEluZGV4KSB7XG5cblx0RlJBTUVXT1JLLmRlYnVnKHRoaXMuaWQgKyAnIDotLS06IFJlbmRlcmluZyBjb21wb25lbnQuLi4nKTtcblxuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0Ly8gQ2FuY2VsIGN1cnJlbnQgcmVuZGVyIGFuZCBjbG9zZSBqb2JzLCBpZiB0aGV5J3JlIHJ1bm5pbmdcblx0aWYgKHRoaXMuX3JlbmRlcmluZykge1xuXHRcdEZSQU1FV09SSy5kZWJ1Zyh0aGlzLmlkICsgJyA6OiByZW5kZXIoKSBjYW5jZWxlZC4nKTtcblx0XHR0aGlzLl9yZW5kZXJpbmdDYW5jZWxlZCA9IHRydWU7XG5cdFx0dGhpcy5jYW5jZWxSZW5kZXIoKTtcblx0XHR0aGlzLl9yZW5kZXJpbmcgPSBmYWxzZTtcblx0fVxuXHRpZiAodGhpcy5fY2xvc2luZykge1xuXHRcdEZSQU1FV09SSy5kZWJ1Zyh0aGlzLmlkICsgJyA6OiBjbG9zZSgpIGNhbmNlbGVkLicpO1xuXHRcdHRoaXMuY2FuY2VsQ2xvc2UoKTtcblx0XHR0aGlzLl9jbG9zaW5nID0gZmFsc2U7XG5cdH1cblxuXHQvLyBMb2NrIGFjY2VzcyB0byByZW5kZXJcblx0dGhpcy5fcmVuZGVyaW5nID0gdHJ1ZTtcblxuXHQvLyBUcmlnZ2VyIGJlZm9yZVJlbmRlciBtZXRob2Rcblx0dGhpcy5iZWZvcmVSZW5kZXIoZnVuY3Rpb24gKCkge1xuXG5cdFx0Ly8gSWYgcmVuZGVyaW5nIHdhcyBjYW5jZWxlZCwgYnJlYWsgb3V0XG5cdFx0Ly8gZG8gbm90IHJlbmRlciwgYW5kIGRvIG5vdCBjYWxsIGFmdGVyUmVuZGVyKClcblx0XHRpZiAoIHNlbGYuX3JlbmRlcmluZ0NhbmNlbGVkICkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEJpbmQgdGhlIGV2ZW50cyBvbiBtb2RlbC9jb2xsZWN0aW9ucyBhbmQgZ2xvYmFsIHRyaWdnZXJlZCBldmVudHMuXG5cdFx0YmluZEV2ZW50cy5jb2xsZWN0aW9uRXZlbnRzLmNhbGwoc2VsZik7XG5cdFx0YmluZEV2ZW50cy5tb2RlbEV2ZW50cy5jYWxsKHNlbGYpO1xuXHRcdGJpbmRFdmVudHMuZ2xvYmFsVHJpZ2dlcnMuY2FsbChzZWxmKTtcblxuXHRcdC8vIFVubG9jayByZW5kZXJpbmcgbXV0ZXhcblx0XHRzZWxmLl9yZW5kZXJpbmcgPSBmYWxzZTtcblxuXHRcdGlmICghc2VsZi4kb3V0bGV0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3Ioc2VsZi5pZCArICcgOjogVHJ5aW5nIHRvIHJlbmRlcigpLCBidXQgbm8gJG91dGxldCB3YXMgZGVmaW5lZCEnKTtcblx0XHR9XG5cblx0XHQvLyBIeWRyYXRlIGNvbXBpbGVkIHRlbXBsYXRlXG5cdFx0Ly8gKGNvbWJpbmVzIHRoZSB0ZW1wbGF0ZSBmdW5jdGlvbiB3aXRoIGRhdGEgdG8gcmV0dXJuIEhUTUwpXG5cdFx0dmFyIGh0bWwgPSBjb21waWxlVGVtcGxhdGUuY2FsbChzZWxmKTtcblx0XHRpZiAoIWh0bWwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcih0aGlzLmlkICsgJyA6OiBVbmFibGUgdG8gcmVuZGVyIGNvbXBvbmVudCBiZWNhdXNlIHRlbXBsYXRlIGNvbXBpbGF0aW9uIGRpZCBub3QgcmV0dXJuIGFueSBIVE1MLicpO1xuXHRcdH1cblxuXHRcdC8vIFN0cmlwIHRyYWlsaW5nIGFuZCBsZWFkaW5nIHdoaXRlc3BhY2UgdG8gYXZvaWQgZmFsc2VseSBkaWFnbm9zaW5nXG5cdFx0Ly8gbXVsdGlwbGUgZWxlbWVudHMsIHdoZW4gb25seSBvbmUgYWN0dWFsbHkgZXhpc3RzXG5cdFx0Ly8gKHRoaXMgbWlzZGlhZ25vc2lzIHdyYXBzIHRoZSB0ZW1wbGF0ZSBpbiBhbiBleHRyYW5lb3VzIDxkaXY+KVxuXHRcdGh0bWwgPSBodG1sLnJlcGxhY2UoL15cXHMqLywgJycpO1xuXHRcdGh0bWwgPSBodG1sLnJlcGxhY2UoL1xccyokLywgJycpO1xuXHRcdGh0bWwgPSBodG1sLnJlcGxhY2UoLyhcXHJ8XFxuKSovLCAnJyk7XG5cblx0XHQvLyBTdHJpcCBIVE1MIGNvbW1lbnRzLCB0aGVuIHN0cmlwIHdoaXRlc3BhY2UgYWdhaW5cblx0XHQvLyAoVE9ETzogb3B0aW1pemUgdGhpcylcblx0XHRodG1sID0gaHRtbC5yZXBsYWNlKC8oPCEtLS4rLS0+KSovLCAnJyk7XG5cdFx0aHRtbCA9IGh0bWwucmVwbGFjZSgvXlxccyovLCAnJyk7XG5cdFx0aHRtbCA9IGh0bWwucmVwbGFjZSgvXFxzKiQvLCAnJyk7XG5cdFx0aHRtbCA9IGh0bWwucmVwbGFjZSgvKFxccnxcXG4pKi8sICcnKTtcblxuXHRcdC8vIFBhcnNlIGEgRE9NIG5vZGUgb3Igc2VyaWVzIG9mIERPTSBub2RlcyBmcm9tIHRoZSBuZXdseSB0ZW1wbGF0ZWQgSFRNTFxuXHRcdHZhciBwYXJzZWROb2RlcyA9ICQucGFyc2VIVE1MKGh0bWwpO1xuXHRcdHZhciBlbCA9IHBhcnNlZE5vZGVzWzBdO1xuXG5cdFx0Ly8gSWYgbm8gbm9kZXMgd2VyZSBwYXJzZWQsIHRocm93IGFuIGVycm9yXG5cdFx0aWYgKHBhcnNlZE5vZGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKHNlbGYuaWQgKyAnIDo6IHJlbmRlcigpIHJhbiBpbnRvIGEgcHJvYmxlbSByZW5kZXJpbmcgdGhlIHRlbXBsYXRlIHdpdGggSFRNTCA9PiBcXG4nK2h0bWwpO1xuXHRcdH1cblxuXG5cblx0XHQvLyBJZiB0aGVyZSBpcyBub3Qgb25lIHNpbmdsZSB3cmFwcGVyIGVsZW1lbnQsXG5cdFx0Ly8gb3IgaWYgdGhlIHJlbmRlcmVkIHRlbXBsYXRlIGNvbnRhaW5zIG9ubHkgYSBzaW5nbGUgdGV4dCBub2RlLFxuXHRcdGVsc2UgaWYgKHBhcnNlZE5vZGVzLmxlbmd0aCA+IDEgfHwgcGFyc2VkTm9kZXNbMF0ubm9kZVR5cGUgPT09IDMpIHtcblxuXHRcdFx0RlJBTUVXT1JLLmxvZyhzZWxmLmlkICsgJyA6OiBXcmFwcGluZyB0ZW1wbGF0ZSBpbiA8ZGl2Lz4uLi4nLCBwYXJzZWROb2Rlcyk7XG5cdFx0XHRlbCA9ICQoJzxkaXYvPicpLmFwcGVuZChodG1sKTtcblx0XHRcdGVsID0gZWxbMF07XG5cdFx0fVxuXG5cdFx0Ly8gKG9yIGp1c3QgYSBsb25lIHJlZ2lvbilcblx0XHQvLyB3cmFwIHRoZSBodG1sIHVwIGluIGEgY29udGFpbmVyIDxkaXYvPlxuXHRcdC8vIGVsc2UgaWYgKFxuXHRcdC8vIFx0JChwYXJzZWROb2Rlc1swXSkuaXMoJ3JlZ2lvbicpIHx8XG5cdFx0Ly8gXHQkKHBhcnNlZE5vZGVzWzBdKS5hdHRyKCdkYXRhLXJlZ2lvbicpICE9PSB1bmRlZmluZWQgKSB7XG5cdFx0Ly8gXHQvLyB1c2VkIHRvIHdyYXAgdGhpcyBzdHVmZiBpbiBhIGRpdiB0b28sIGJ1dCBub3QgYW55bW9yZVxuXHRcdC8vIFx0Ly8gc2luY2UgaXQgbWVzc2VzIHcvIEhUTUwgdGhpbmdzIGxpa2UgdGFibGVzXG5cdFx0Ly8gfVxuXG5cblxuXHRcdC8vIFNldCBCYWNrYm9uZSBlbGVtZW50IChjYWNoZSBhbmQgcmVkZWxlZ2F0ZSBET00gZXZlbnRzKVxuXHRcdC8vIChXaWxsIGFsc28gdXBkYXRlIHNlbGYuJGVsKVxuXHRcdHNlbGYuc2V0RWxlbWVudChlbCk7XG5cblxuXG5cdFx0Ly8gRGV0ZWN0IGFuZCByZW5kZXIgYWxsIHJlZ2lvbnMgYW5kIHRoZWlyIGRlc2NlbmRlbnQgY29tcG9uZW50cyBhbmQgcmVnaW9uc1xuXHRcdHJlbmRlclJlZ2lvbnMuY2FsbChzZWxmKTtcblxuXHRcdC8vIEluc2VydCB0aGUgZWxlbWVudCBhdCB0aGUgcHJvcGVyIHBsYWNlIGFtb25nc3QgdGhlIG91dGxldCdzIGNoaWxkcmVuXG5cdFx0dmFyIG5laWdoYm9ycyA9IHNlbGYuJG91dGxldC5jaGlsZHJlbigpO1xuXHRcdGlmIChfLmlzRmluaXRlKGF0SW5kZXgpICYmIG5laWdoYm9ycy5sZW5ndGggPiAwICYmIG5laWdoYm9ycy5sZW5ndGggPiBhdEluZGV4KSB7XG5cdFx0XHRuZWlnaGJvcnMuZXEoYXRJbmRleCkuYmVmb3JlKHNlbGYuJGVsKTtcblx0XHR9XG5cblx0XHQvLyBCdXQgaWYgdGhlIG91dGxldCBpcyBlbXB0eSwgb3IgdGhlcmUncyBubyBhdEluZGV4LCBqdXN0IHN0aWNrIGl0IG9uIHRoZSBlbmRcblx0XHRlbHNlIHNlbGYuJG91dGxldC5hcHBlbmQoc2VsZi4kZWwpO1xuXG5cblx0XHQvLyBGbGFnIHdpdGggZGF0YS10ZW1wbGF0ZS1pZCBhdHRyaWJ1dGVcblx0XHQvLyAodG8gbWFrZSB0ZW1wbGF0ZS9jb21wb25lbnQgYm91bmRhcmllcyBlYXNpZXIgdG8gcGljayBvdXQgaW4gdGhlIGluc3BlY3Rvcilcblx0XHRzZWxmLiRlbC5hdHRyKCdkYXRhLXRlbXBsYXRlLWlkJywgc2VsZi5pZCk7XG5cblxuXG5cblx0XHQvL1xuXHRcdC8vIElmIHRoZSBwYXJlbnQgY29tcG9uZW50IGhhcyByb3V0ZSBsaXN0ZW5lcnMgKGUuZy4gI2Zvbylcblx0XHQvLyBydW4gYW55IG9mIHRoZW0gdGhhdCBtYXRjaCBgd2luZG93LmxvY2F0aW9uLmhhc2hgLlxuXHRcdC8vIChhZnRlciByZW5kZXJpbmcgdGhlIHRlbXBsYXRlIGFuZCByZWdpb25zIGJ1dCBCRUZPUkUgdGhlIGBhZnRlclJlbmRlcmBcblx0XHQvLyBsaWZlY3ljbGUgY2FsbGJhY2sgaXMgdHJpZ2dlcmVkKVxuXHRcdC8vXG5cdFx0Ly8gbm90IHN1cmUgaWYgdGhpcyBpcyBhIGdvb2QgaWRlYSBpbiBnZW5lcmFsLS0gbWF5YmUgY29uZmlndXJhYmxlLi4/XG5cdFx0Ly8gb3Igb25seSBpZiBiYWNrYm9uZS5oaXN0b3J5IGlzbid0IHJlYWR5IHlldD9cblx0XHQvL1xuXHRcdC8vIGRpc2FibGluZyBmb3Igbm93Li4uXG5cdFx0Ly8gXy5lYWNoKCBPYmplY3Qua2V5cyhzZWxmKSwgZnVuY3Rpb24gKGtleSkge1xuXHRcdC8vIFx0dmFyIG1hdGNoZWRSb3V0ZSA9IGtleS5tYXRjaChuZXcgUmVnRXhwKCcvXicgK3dpbmRvdy5sb2NhdGlvbi5oYXNoICsgJy8nKSk7XG5cdFx0Ly8gXHRpZiAoIW1hdGNoZWRSb3V0ZSkgcmV0dXJuO1xuXG5cdFx0Ly8gXHR2YXIgbWF0Y2hlZFJvdXRlTGlzdGVuZXIgPSBzZWxmW21hdGNoZWRSb3V0ZV07XG5cdFx0Ly8gXHRtYXRjaGVkUm91dGVMaXN0ZW5lcigpO1xuXHRcdC8vIH0pO1xuXG5cblx0XHQvLyBGaW5hbGx5LCB0cmlnZ2VyIGFmdGVyUmVuZGVyIG1ldGhvZFxuXHRcdHNlbGYuYWZ0ZXJSZW5kZXIoKTtcblxuXG5cdFx0Ly8gUnVuIGRhdGEgYmluZGluZ3Ncblx0XHQvLyBUT0RPOiBkb24ndCBjYWxsIHRoaXMgaGVyZS0tIGp1c3QgZG8gd2hlbiBpbml0aWFsbHkgaW5zZXJ0aW5nIHRoZSB0ZW1wbGF0ZSBpbnRvIHRoZSBET01cblx0XHQvLyAodGhpcyBpcyBpbmVmZmljaWVudClcblx0XHRyZW5kZXJEYXRhQmluZGluZ3MuY2FsbChzZWxmKTtcblxuXG5cdFx0Ly8gQWRkIGRhdGEgYXR0cmlidXRlcyB0byB0aGlzIGNvbXBvbmVudCdzICRlbCwgcHJvdmlkaW5nIGFjY2Vzc1xuXHRcdC8vIHRvIHdoZXRoZXIgdGhlIGVsZW1lbnQgaGFzIHZhcmlvdXMgRE9NIGJpbmRpbmdzIGZyb20gc3R5bGVzaGVldHMuXG5cdFx0Ly8gKGhhbmR5IGZvciBkaXNhYmxpbmcgdGV4dCBzZWxlY3Rpb24gYWNjb3JkaW5nbHksIGV0Yy4pXG5cdFx0Ly9cblx0XHQvLyAtPiBkaXNhYmxlIGZvciB0aGlzIGNvbXBvbmVudCB3aXRoIGB0aGlzLmF0dHJGbGFncyA9IGZhbHNlYFxuXHRcdC8vIC0+IG9yIGdsb2JhbGx5IHdpdGggYEZSQU1FV09SSy5hdHRyRmxhZ3MgPSBmYWxzZWBcblx0XHQvL1xuXHRcdC8vIFRPRE86IG1ha2UgaXQgd29yayB3aXRoIGRlbGVnYXRlZCBET00gZXZlbnQgYmluZGluZ3Ncblx0XHQvL1xuXHRcdGlmIChzZWxmLmF0dHJGbGFncyAhPT0gZmFsc2UgJiYgRlJBTUVXT1JLLmF0dHJGbGFncyAhPT0gZmFsc2UpIHtcblx0XHRcdERPTS5mbGFnQm91bmRFdmVudHMoc2VsZik7XG5cdFx0fVxuXHR9KTtcbn07XG4iLCJcbi8qKlxuICogVE9ETzpcbiAqIFRyeSBvdXQgYSBkaWZmZXJlbnQgYXBwcm9hY2ggZm9yIHRoZSBsb2dpYyBpbiBgcmVuZGVyQ29sbGVjdGlvbmBcbiAqIGJlbG93IGJ5IG92ZXJsb2FkaW5nIGByZWdpb24uYXR0YWNoKClgLlxuICpcbiAqIEV4YW1wbGUgdXNhZ2U6IChpbiBwYXJlbnQgY29tcG9uZW50KVxuICogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAqIHRoaXMuc29tZVJlZ2lvbi5hdHRhY2goJ1NvbWVPdGhlckNvbXBvbmVudCcseyBjb2xsZWN0aW9uOiBTb21lQ29sbGVjdGlvbiB9KVxuICpcbiAqIC1vci1cbiAqXG4gKiB0aGlzLnNvbWVSZWdpb24ucmVwZWF0KCdTb21lT3RoZXJDb21wb25lbnQnLHsgY29sbGVjdGlvbjogU29tZUNvbGxlY3Rpb24gfSlcbiAqL1xuXG4vKipcbiAqIHJlbmRlckNvbGxlY3Rpb24oKVxuICpcbiAqIFJldXNhYmxlIGxvZ2ljIHRvIHJlbmRlciBhIGNvbGxlY3Rpb24gaW50byBhIHJlZ2lvblxuICpcbiAqIFRPRE86IG1vdmUgb250byBSZWdpb24gb2JqZWN0IGluc3RlYWQuLi4gIFNlZSBnaXN0LlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBjb2xsZWN0aW9uIC0gZGF0YSBzb3VyY2VcbiAqIEBwYXJhbSB7T3B0aW9uc30gb3B0aW9uc1xuICpcdFx0OiBvcHRpb25zLml0ZW1UZW1wbGF0ZSB7U3RyaW5nfSAtIG5hbWUgb2YgdGVtcGxhdGUvY29tcG9uZW50IHRvIHVzZSBhcyBpdGVtXG4gKlx0XHQ6IG9wdGlvbnMuaW50b1JlZ2lvbiB7T2JqZWN0fSAtIHRoZSBkZXN0aW5hdGlvbiByZWdpb25cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoY29sbGVjdGlvbiwgb3B0aW9ucykge1xuXG5cdC8vIFJlcXVpcmVkOlxuXHRpZiAodHlwZW9mIGNvbGxlY3Rpb24gIT09ICdvYmplY3QnKSB0aHJvdyBuZXcgRXJyb3IoJ3JlbmRlckNvbGxlY3Rpb24gOjogVW5rbm93bi9pbnZhbGlkIGNvbGxlY3Rpb24sIFwiJyArIChjb2xsZWN0aW9uICYmIGNvbGxlY3Rpb24udHlwZSkgKyAnXCInKTtcblx0aWYgKCFvcHRpb25zLml0ZW1UZW1wbGF0ZSkgdGhyb3cgbmV3IEVycm9yKCdyZW5kZXJDb2xsZWN0aW9uIDo6IG9wdGlvbnMuaXRlbVRlbXBsYXRlIHJlcXVpcmVkIScpO1xuXHRpZiAoIW9wdGlvbnMuaW50b1JlZ2lvbikgdGhyb3cgbmV3IEVycm9yKCdyZW5kZXJDb2xsZWN0aW9uIDo6IG9wdGlvbnMuaW50b1JlZ2lvbiByZXF1aXJlZCEnKTtcblxuXG5cdC8vIERldGVybWluZSBjb2xsZWN0aW9uTmFtZVxuXHR2YXIgY29sbGVjdGlvbk5hbWUgPSBjb2xsZWN0aW9uLnR5cGU7XG5cblx0Ly8gVGFyZ2V0IHJlZ2lvblxuXHR2YXIgb3V0bGV0ID0gb3B0aW9ucy5pbnRvUmVnaW9uO1xuXG5cdC8vIFN1Yi1jb21wb25lbnRcblx0dmFyIHN1YmNvbXBvbmVudE5hbWUgPSBvcHRpb25zLml0ZW1UZW1wbGF0ZTtcblxuXHQvLyBOYW1lIG9mIHRoZSBjb2xsZWN0aW9uIHN0YXRlIGF0dHJpYnV0ZSB0aGF0IHdpbGxlIGJlIGluamVjdGVkIGludG8gdGhlIEhUTUxcblx0Ly8gVXNlZCBmb3IgdGhlIGRlZmF1bHQgcmVuZGVyIGJlaGF2aW9yLlxuXHR2YXIgYm9keVN0YXRlQXR0cmlidXRlID0gJ2RhdGEtJyArIGNvbGxlY3Rpb25OYW1lICsgJy1zdGF0ZSc7XG5cblxuXG5cblx0LyoqXG5cdCAqIERlZmF1bHQgcmVuZGVyIG1ldGhvZHNcblx0ICpcblx0ICogT3ZlcnJpZGUgZGVmYXVsdCByZW5kZXIgbWV0aG9kcyB3aXRoIG9wdGlvbnMgaWYgc3BlY2lmaWVkXG5cdCAqL1xuXG5cdC8vIERlZmF1bHQgcmVuZGVyIGxvZ2ljIGZvciBlcnJvciBzdGF0ZSAoZS5nLiByZWQgdGV4dClcblx0dmFyIHJlbmRlckVycm9yID0gb3B0aW9ucy5yZW5kZXJFcnJvciB8fCBmdW5jdGlvbiByZW5kZXJFcnJvciAoKSB7XG5cdFx0RlJBTUVXT1JLLmVycm9yKCdBbiBlcnJvciBvY2N1cnJlZCB3aGlsZSBsb2FkaW5nICcgKyBjb2xsZWN0aW9uTmFtZSArICcgOjpcXG4nLCBjb2xsZWN0aW9uLmVycm9yKTtcblxuXHRcdC8vIFNldCBhIGRhdGEgYXR0cmlidXRlIG9uIEhUTUwgYm9keVxuXHRcdCQoJ2JvZHknKS5hdHRyKGJvZHlTdGF0ZUF0dHJpYnV0ZSwgJ2Vycm9yJyk7XG5cdH07XG5cblx0Ly8gRGVmYXVsdCByZW5kZXIgbG9naWMgZm9yIGxvYWRpbmcgc3RhdGUgKGUuZy4gc3Bpbm5lcilcblx0dmFyIHJlbmRlclN5bmNpbmcgPSBvcHRpb25zLnJlbmRlclN5bmNpbmcgfHwgZnVuY3Rpb24gcmVuZGVyU3luY2luZygpIHtcblx0XHRGUkFNRVdPUksubG9nKCdMb2FkaW5nICcgKyBjb2xsZWN0aW9uTmFtZSArICcuLi4nKTtcblxuXHRcdC8vIFNldCBzdGF0ZSBhdHRyaWJ1dGUgb24gSFRNTCBib2R5XG5cdFx0JCgnYm9keScpLmF0dHIoYm9keVN0YXRlQXR0cmlidXRlLCAnc3luY2luZycpO1xuXHR9O1xuXG5cdC8vIERlZmF1bHQgcmVuZGVyIGxvZ2ljIHRvIGNsZWFuIHVwIGFmdGVyIGEgc3VjY2Vzc2Z1bCBzeW5jL2xvYWRcblx0dmFyIHJlbmRlclN5bmNlZCA9IG9wdGlvbnMucmVuZGVyU3luY2VkIHx8IGZ1bmN0aW9uIHJlbmRlclN5bmNlZCgpIHtcblx0XHRGUkFNRVdPUksubG9nKGNvbGxlY3Rpb24ubGVuZ3RoICsgJyAnICsgY29sbGVjdGlvbk5hbWUgKyAnIGZldGNoZWQgc3VjY2Vzc2Z1bGx5LicpO1xuXG5cdFx0Ly8gU2V0IHN0YXRlIGF0dHJpYnV0ZSBvbiBIVE1MIGJvZHlcblx0XHQkKCdib2R5JykuYXR0cihib2R5U3RhdGVBdHRyaWJ1dGUsICdyZWFkeScpO1xuXHR9O1xuXG5cdC8vIERlZmF1bHQgcmVuZGVyIGxvZ2ljIGZvciBpdGVtcyBpbiBjb2xsZWN0aW9uXG5cdHZhciByZW5kZXJSZXNldCA9IG9wdGlvbnMucmVuZGVyUmVzZXQgfHwgZnVuY3Rpb24gcmVuZGVyUmVzZXQoKSB7XG5cblx0XHQvLyBDbGVhbiBvdXQgdGhlIHJlZ2lvbiwgd3JhcCBpbiBhIHRyeS9jYXRjaCB0byBzdG9wIHRoZSBleGVjdXRpb25cblx0XHR0cnkge1xuXHRcdFx0b3V0bGV0LmVtcHR5KCk7XG5cdFx0fSBjYXRjaCAoZSkge31cblxuXG5cdFx0Ly8gVE9ETzogU21hcnQgbWVyZ2UgdG8gbWluaW1pemUgRE9NIHF1ZXJpZXNcblx0XHRjb2xsZWN0aW9uLmVhY2goZnVuY3Rpb24gKG1vZGVsKSB7XG5cdFx0XHQvLyBGb3IgZWFjaCBtb2RlbCBmb3VuZCwgYXBwZW5kIGEgc3ViY29tcG9uZW50IHRvIHRoZSByZWdpb25cblx0XHRcdG91dGxldC5hcHBlbmQoc3ViY29tcG9uZW50TmFtZSwgeyBtb2RlbDogbW9kZWwgfSk7XG5cdFx0fSk7XG5cdH07XG5cblx0LyoqXG5cdCAqIHJlbmRlckFkZCAoIG1vZGVsLCBbYXRJbmRleF0gKVxuXHQgKlxuXHQgKiBAcGFyYW0ge01vZGVsfSBtb2RlbFx0XHRcdFx0XHRcdC0gdGhlIEJhY2tib25lIG1vZGVsIHRoYXQgd2FzIGFkZGVkXG5cdCAqIEBwYXJhbSB7SW50ZWdlcn0gYXRJbmRleFx0XHRcdFx0LSAob3B0aW9uYWwtIGRlZmF1bHRzIHRvIGNvbGxlY3Rpb24ubGVuZ3RoKVxuXHQgKlxuXHQgKiBEZWZhdWx0IHJlbmRlciBsb2dpYyBmb3IgdGhlIGNhc2Ugd2hlcmUgYW4gaXRlbSBpcyBhZGRlZCB0byB0aGUgY29sbGVjdGlvbi5cblx0ICovXG5cdHZhciByZW5kZXJBZGQgPSBvcHRpb25zLnJlbmRlckFkZCB8fCBmdW5jdGlvbiByZW5kZXJBZGQoIG1vZGVsLCBhdEluZGV4ICkge1xuXHRcdGlmICggdHlwZW9mIGF0SW5kZXggPT09ICdudW1iZXInKSB7XG5cdFx0XHRyZXR1cm4gb3V0bGV0Lmluc2VydChhdEluZGV4LCBzdWJjb21wb25lbnROYW1lLCB7IG1vZGVsOiBtb2RlbCB9KTtcblx0XHR9XG5cdFx0cmV0dXJuIG91dGxldC5hcHBlbmQoc3ViY29tcG9uZW50TmFtZSwgeyBtb2RlbDogbW9kZWwgfSk7XG5cdH07XG5cblx0LyoqXG5cdCAqIHJlbmRlclJlbW92ZSggYXRJbmRleCApXG5cdCAqXG5cdCAqIEBwYXJhbSB7SW50ZWdlcn0gYXRJbmRleFx0XHRcdC0gdGhlIGZvcm1lciBpbmRleCBvZiB0aGUgQmFja2JvbmUgbW9kZWwgdGhhdCB3YXMgcmVtb3ZlZFxuXHQgKlxuXHQgKiBEZWZhdWx0IHJlbmRlciBsb2dpYyBmb3IgdGhlIGNhc2Ugd2hlcmUgYW4gaXRlbSBpcyByZW1vdmVkIGZyb20gdGhlIGNvbGxlY3Rpb24uXG5cdCAqL1xuXHR2YXIgcmVuZGVyUmVtb3ZlID0gb3B0aW9ucy5yZW5kZXJSZW1vdmUgfHwgZnVuY3Rpb24gcmVuZGVyUmVtb3ZlKCBhdEluZGV4ICkge1xuXHRcdG91dGxldC5yZW1vdmUoIGF0SW5kZXggKTtcblx0fTtcblxuXG5cblxuXG5cblx0LyoqXG5cdCAqIEJvb3RzdHJhcFxuXHQgKlxuXHQgKiBSZW5kZXJzIGluaXRpYWwgc3RhdGUgb2YgY29sbGVjdGlvbiBpbnRvIG91ciByZWdpb25cblx0ICogdXNpbmcgb3VyIGNoaWxkIHRlbXBsYXRlLlxuXHQgKi9cblxuXHQvLyBJZiBvdXIgY29sbGVjdGlvbiBpcyBmZXRjaGluZywgcmVuZGVyIHRoZSBmZXRjaGluZyAobG9hZGluZykgc3RhdGUuXG5cdGlmIChjb2xsZWN0aW9uLnN5bmNpbmcpIHtcblx0XHRyZW5kZXJTeW5jaW5nKCk7XG5cdH1cblxuXG5cdC8vIElmIG91ciBjb2xsZWN0aW9uIGZhaWxlZCB0byBmZXRjaCAoaS5lLiByZWNlaXZlZCBhIDR4eCBvciA1eHggZXJyb3IgY29kZSlcblx0Ly8gcmVuZGVyIGFuIGVycm9yIHN0YXRlXG5cdC8vXG5cdC8vIEhhbmRsZSB0aGUgY2FzZSBvZiBtdWx0aXBsZSBlcnJvciBzdGF0ZXMgd2l0aCBkaWZmZXJlbnQgc3R5bGVzIGhlcmUgYXMgd2VsbC5cblx0ZWxzZSBpZiAoY29sbGVjdGlvbi5lcnJvcikge1xuXHRcdHJlbmRlckVycm9yKCk7XG5cdH1cblxuXG5cdC8vIE90aGVyd2lzZSBvdXIgY29sbGVjdGlvbiBpcyBsb2FkZWQgYW5kIHJlYWR5LFxuXHQvLyBzbyBnbyBhaGVhZCBhbmQgcmVuZGVyIGl0IGludG8gdGhlIHRhcmdldCByZWdpb24uXG5cdC8vXG5cdC8vIChhbHRlcm5hdGl2ZWx5IGF0IHRoaXMgcG9pbnQsIGEgY3VzdG9tIGBlbXB0eWAgc3RhdGUgbWF5IGJlIHJlbmRlcmVkKVxuXHQvLyBjb25zb2xlLmxvZygnVGhlIGNvbGxlY3Rpb24gJyArIHN1YmNvbXBvbmVudE5hbWUgKyAnLS0tLT4nKTtcblx0ZWxzZSByZW5kZXJSZXNldCgpO1xuXG5cblxuXG5cblxuXG5cdC8qKlxuXHQgKiBCaW5kIGV2ZW50c1xuXHQgKlxuXHQgKiBMaXN0ZW4gZm9yIHN0YXRlIGNoYW5nZXMgKHN5bmNpbmcsIHN5bmNlZCwgc2VydmVyIGVycm9yLCBhZGQsIHJlbW92ZSwgc29ydCwgZXRjLilcblx0ICogVGhlc2UgbWFudWFsIGJpbmRpbmdzIGNhbiBiZSByZW1vdmVkIHdoZW4gY29yZSBmcmFtZXdvcmsgc3VwcG9ydHMgcmVuZGVyLXRpbWUgY29sbGVjdGlvblxuXHQgKiBiaW5kaW5ncy4gIEZvciBub3csIGRvaW5nIGl0IHRoaXMgd2F5IHJhdGhlciB0aGFuIHBhdGNoaW5nIHRoZSBjb3JlIHRvIHRlc3Qgb3VyIHN0cnVjdHVyYWxcblx0ICogYXNzdW1wdGlvbnMuXG5cdCAqL1xuXG5cdC8vIFdoZW4gYSBmZXRjaCBpcyBpbml0aWF0ZWQgZnJvbSB0aGUgc2VydmVyLi4uXG5cdC8vXG5cdC8vIChhZnRlciBgQmFja2JvbmUuc3luY2AgYmVnaW5zIGEgcmVtb3RlIHJlcXVlc3QpXG5cdHRoaXMubGlzdGVuVG8oY29sbGVjdGlvbiwgJ3JlcXVlc3QnLCBmdW5jdGlvbiBhZnRlclJlcXVlc3QgKCkge1xuXHRcdHJlbmRlclN5bmNpbmcoKTtcblx0fSk7XG5cblx0Ly8gV2hlbiBhIGZldGNoIGNvbXBsZXRlcyBzdWNjZXNzZnVsbHkgYW5kIG5ldyBkYXRhIGlzIGxvYWRlZC4uLlxuXHQvL1xuXHQvLyAoYWZ0ZXIgdGhpcyBjb21wb25lbnQgaXMgYWxyZWFkeSBpbnN0YW50aWF0ZWQpXG5cdHRoaXMubGlzdGVuVG8oY29sbGVjdGlvbiwgJ3N5bmMnLCBmdW5jdGlvbiBhZnRlclN5bmMgKCkge1xuXHRcdHJlbmRlclN5bmNlZCgpO1xuXHRcdHJlbmRlclJlc2V0KCk7XG5cdH0pO1xuXG5cdC8vIFdoZW4gc2VydmVyIHNlbmRzIGEgcmVzcG9uc2Ugdy8gYW4gZXJyb3IgY29kZVxuXHQvL1xuXHQvLyAoYWZ0ZXIgdGhpcyBjb21wb25lbnQgaXMgYWxyZWFkeSBpbnN0YW50aWF0ZWQpXG5cdHRoaXMubGlzdGVuVG8oY29sbGVjdGlvbiwgJ2Vycm9yJywgZnVuY3Rpb24gYWZ0ZXJTeW5jRXJyb3IgKGNvbGxlY3Rpb24sIHhocikge1xuXG5cdFx0Ly8gSWdub3JlIGFib3J0IFwiZXJyb3JcIlxuXHRcdC8vXG5cdFx0Ly8gV2h5PyBiZWNhdXNlIGl0J3Mgbm90IGFjdHVhbGx5IGFuIGVycm9yLlxuXHRcdC8vIE5vdCBzdXJlIHdoeSB0aGlzIHRyaWdnZXJzIEJhY2tib25lLkNvbGxlY3Rpb24ncyBgZXJyb3JgIGV2ZW50Li4uXG5cdFx0Ly9cblx0XHQvLyBJZiB0d28gZmV0Y2hlcyBvY2N1ciBvbiB0aGUgc2FtZSBjb2xsZWN0aW9uIGF0IHRoZSBzYW1lIHRpbWUsXG5cdFx0Ly8gd2UgYWJvcnQgdGhlIG9sZCBYSFIgcmVxdWVzdCBvdXJzZWx2ZXMgaWYgaXQncyBzdGlsbCBydW5uaW5nKVxuXHRcdGlmICh4aHIgJiYgeGhyLnN0YXR1c1RleHQgPT09ICdhYm9ydCcpIHJldHVybjtcblxuXHRcdHJlbmRlckVycm9yKCk7XG5cdH0pO1xuXG5cdC8vIFdoZW4gYSBtb2RlbCBpcyBhZGRlZC4uLlxuXHQvL1xuXHQvLyBMaXN0ZW4gZm9yIG5ldyBtb2RlbHMsIGFuZCBpbnNlcnQgYSBjaGlsZCB0ZW1wbGF0ZVxuXHQvLyBhdCB0aGUgYXBwcm9wcmlhdGUgaW5kZXggd2l0aGluIHRoZSByZWdpb24uXG5cdHRoaXMubGlzdGVuVG8oY29sbGVjdGlvbiwgJ2FkZCcsIGZ1bmN0aW9uIGFmdGVyQWRkICggbW9kZWwsIGNvbGxlY3Rpb24sIG9wdGlvbnMgKSB7XG5cdFx0cmVuZGVyQWRkKCBtb2RlbCwgb3B0aW9ucy5hdCApO1xuXHR9KTtcblxuXHQvLyBXaGVuIGEgbW9kZWwgaXMgcmVtb3ZlZC4uLlxuXHQvL1xuXHQvLyBHcmFiIG1vZGVsJ3MgcmVsYXRpdmUgaW5kZXggd2l0aGluIGNvbGxlY3Rpb24gYW5kIHJlbW92ZVxuXHQvLyB0aGUgY2hpbGQgdGVtcGxhdGUgYXQgdGhlIHNhbWUgaW5kZXggd2l0aGluIHRoZSByZWdpb24uXG5cdHRoaXMubGlzdGVuVG8oY29sbGVjdGlvbiwgJ3JlbW92ZScsIGZ1bmN0aW9uIGFmdGVyUmVtb3ZlICggbW9kZWwsIGNvbGxlY3Rpb24sIG9wdGlvbnMgKSB7XG5cdFx0cmVuZGVyUmVtb3ZlKCBvcHRpb25zLmluZGV4ICk7XG5cdH0pO1xuXG5cblxufTtcbiIsIi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llc1xuICovXG5cbnZhciBkYXRhQmluZGluZ3MgPSB7XG5cdHRleHQgICAgOiByZXF1aXJlKCcuL2RhdGFCaW5kaW5ncy90ZXh0JyksXG5cdCdjbGFzcycgOiByZXF1aXJlKCcuL2RhdGFCaW5kaW5ncy9jbGFzcycpXG59O1xuXG5cblxuLyoqXG4gKiBSZW5kZXIgbW9kZWwgYmluZGluZ3MuXG4gKiAgICsgYGJpbmQtdGV4dGBcbiAqICAgKyBtb3JlIHRvIGNvbWVcbiAqXG4gKiBDYWxsZWQgYnkgQ29tcG9uZW50IHdoZW4gaXRzIG1vZGVsIGNoYW5nZXMuXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByZW5kZXJEYXRhQmluZGluZ3MgKCkge1xuXHRGUkFNRVdPUksuZGVidWcoJ1JlbmRlcmluZyBkYXRhIGJpbmRpbmdzIGZvciAnLCB0aGlzLmlkLCdjb21wb25lbnQuLi4nKTtcblxuXHQvLyBFbnN1cmUgdGhhdCBtb2RlbCBleGlzdHNcblx0aWYgKCF0aGlzLm1vZGVsKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKFxuXHRcdFx0J1RyeWluZyB0byBib290c3RyYXAgZGF0YSBiaW5kaW5ncyBmb3IgY29tcG9uZW50ICgnICsgdGhpcy5pZCArICcpLCAnICtcblx0XHRcdCdidXQgaXQgaGFzIG5vIG1vZGVsIScpO1xuXHR9XG5cdHZhciBtb2RlbCA9IHRoaXMubW9kZWw7XG5cblx0Ly8galF1ZXJ5IHNlbGVjdG9yIGZvciBncmFiYmluZyBhbGwgZWxlbWVudHMgdy8gZGF0YSBiaW5kaW5nc1xuXHR2YXIgYmluZGluZ1NlbGVjdG9yID0gJ1tiaW5kLXRleHRdLCA6bWF0Y2hBdHRyKFwiXmJpbmQtY2xhc3MtKiRcIiknO1xuXG5cdC8vIEdldCBlbGVtZW50cyBpbiB0aGlzIGNvbXBvbmVudCB3aGljaCBoYXZlIGRhdGEgYmluZGluZ3Ncblx0Ly8gKGlnbm9yZXMgY29udGVudHMgb2YgcmVnaW9ucyBpZiB0aGV5IGV4aXN0KVxuXHR2YXIgJGJvdW5kRWxlbWVudHMgPSBfJHNlbGVjdE91dGVyLmNhbGwodGhpcywgYmluZGluZ1NlbGVjdG9yKTtcblxuXHQvLyBMb29wIHRocm91Z2ggZWFjaCBib3VuZCBhdHRyaWJ1dGUgb2YgZWFjaCBib3VuZCBlbGVtZW50XG5cdC8vIGFuZCBjYWxsIHRoZSBhcHByb3ByaWF0ZSByZW5kZXIgbWV0aG9kLlxuXHQkYm91bmRFbGVtZW50cy5lYWNoKGZ1bmN0aW9uIGVhY2hCb3VuZEVsZW1lbnQgKCkge1xuXHRcdCRib3VuZEVsID0gJCh0aGlzKTtcblxuXHRcdHZhciBhbGxBdHRyaWJ1dGVzID0gJGJvdW5kRWxbMF0uYXR0cmlidXRlcztcblx0XHRfLmVhY2goYWxsQXR0cmlidXRlcywgZnVuY3Rpb24gKGF0dHIpIHtcblx0XHRcdHZhciBhdHRyTmFtZSA9IGF0dHIubm9kZU5hbWU7XG5cblx0XHRcdF8uZWFjaCggZGF0YUJpbmRpbmdzLCBmdW5jdGlvbiBlYWNoQmluZGluZ0Zvcm11bGEgKCBiaW5kaW5nICkge1xuXHRcdFx0XHR2YXIgbWF0Y2hlcyA9IGF0dHJOYW1lLm1hdGNoKGJpbmRpbmcucmVnZXhwKTtcblx0XHRcdFx0aWYgKCBtYXRjaGVzICkge1xuXHRcdFx0XHRcdGJpbmRpbmcuZm4oJGJvdW5kRWwsIG1vZGVsLCBtYXRjaGVzKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xufTtcblxuXG5cblxuLyoqXG4gKiBMb29rdXAgc3VpdGFibGUgZWxlbWVudHMgd2l0aGluIHRoaXMgY29tcG9uZW50J3MgJGVsIGNvbnRleHQuXG4gKiBJZ25vcmUgcmVnaW9ucywgYW5kIGluY2x1ZGUgdGhlIHRvcC1sZXZlbCBlbGVtZW50LlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBiaW5kaW5nU2VsZWN0b3IgLSBET00gc2VsZWN0b3IgdG8gdXNlXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gXyRzZWxlY3RPdXRlciAoIGJpbmRpbmdTZWxlY3RvciApIHtcblxuXHQvLyBMb29rdXAgbWF0Y2hlc1xuXHR2YXIgJG1hdGNoZXMgPSB0aGlzLiQoYmluZGluZ1NlbGVjdG9yKTtcblxuXHQvLyBJZiB0b3AtbGV2ZWwgZWxlbWVudCBpbiB0ZW1wbGF0ZSBoYXMgYSBkYXRhLWJpbmRpbmcsIGluY2x1ZGUgaXRcblx0aWYgKHRoaXMuJGVsLmZpbHRlcihiaW5kaW5nU2VsZWN0b3IpKSB7XG5cdFx0JG1hdGNoZXMgPSAkLm1lcmdlKCRtYXRjaGVzLCB0aGlzLiRlbCk7XG5cdH1cblxuXHQvLyBPbWl0IGFueXRoaW5nIGluc2lkZSBhIHJlZ2lvbiwgc2luY2UgdGhvc2UgYmluZGluZ3Mgd2lsbCBoYXZlIGFscmVhZHlcblx0Ly8gYmVlbiB0YWtlbiBjYXJlIG9mIGJ5IG9uZSBvZiB0aGUgZGVzY2VuZGFudCBjb21wb25lbnQocykgd2l0aGluIHRoZSByZWdpb24uXG5cdC8vXG5cdC8vIFRPRE86IG9wdGltaXplIHRvIGV4Y2x1ZGUgdGhlc2UgZWxlbWVudHMgZnJvbSB0aGUgb3JpZ2luYWwgRE9NIHNlbGVjdGlvblxuXHQkbWF0Y2hlcyA9ICRtYXRjaGVzLm5vdCggdGhpcy4kKCdyZWdpb24gKiwgW2RhdGEtcmVnaW9uXSAqJykgKTtcblxuXHRyZXR1cm4gJG1hdGNoZXM7XG59XG5cblxuXG5cblxuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4vLy9cbi8vICAgICAgICAgICAgICAgICAgICAgICAgIHx8XG4vLyBUT0RPOiBtb3ZlIHRoaXMgdGhpbmcgICBcXC9cbi8vICAgICAgIGludG8gYHV0aWxzYCBwcmJseVxuLy9cblxuLyoqXG4gKiBDcmVhdGUgcHNldWRvLXNlbGVjdG9yIGZvciBnZXR0aW5nIHdpbGRjYXJkIGRhdGEgYXR0cmlidXRlcy5cbiAqXG4gKiBVc2FnZTpcbiAqICQoXCI6bWF0Y2hBdHRyKCdeZGF0YS0nKVwiKVxuICpcbiAqIFNvdXJjZTpcbiAqIGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9hLzEzMjIyNTA5LzQ4NjU0N1xuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmpRdWVyeS5leHByLnBzZXVkb3MubWF0Y2hBdHRyID0gJC5leHByLmNyZWF0ZVBzZXVkbyhmdW5jdGlvbihhcmcpIHtcblxuICAgIHZhciByZWdleHAgPSBuZXcgUmVnRXhwKGFyZyk7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKGVsZW0pIHtcbiAgICAgICAgZm9yKHZhciBpID0gMDsgaSA8IGVsZW0uYXR0cmlidXRlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIGF0dHIgPSBlbGVtLmF0dHJpYnV0ZXNbaV07XG4gICAgICAgICAgICBpZihyZWdleHAudGVzdChhdHRyLm5hbWUpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH07XG59KTtcblxuLy8gIC9cXFxuLy8gIHx8XG4vL1xuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cblxuXG5cblxuXG5cblxuXG5cblxuXG5cblxuXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuLy8vICAgICAgICAgICAgICAgICAgICAgfHxcbi8vLyBDVVJSRU5UTFkgVU5VU0VEICAgIFxcL1xuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxuXG4vLyBSZWdleHBzIGZvciBkZXRlY3Rpb24gb2Ygd2lsZGNhcmQgbmFtZWQgcGFyYW1ldGVycyBpbiBjdXN0b20gZWxlbWVudCBhdHRyaWJ1dGUgbmFtZXMuXG4vLyB2YXIgb3B0aW9uYWxQYXJhbSA9IC9cXCgoLio/KVxcKS9nO1xuLy8gdmFyIG5hbWVkUGFyYW0gPSAvKFxcKFxcPyk/OlxcdysvZztcbi8vIHZhciBzcGxhdFBhcmFtID0gL1xcKlxcdysvZztcbi8vIHZhciBlc2NhcGVSZWdFeHAgPSAvW1xcLXt9XFxbXFxdKz8uLFxcXFxcXF4kfCNcXHNdL2c7XG5cblxuLy8gQnVpbGQgc2VsZWN0b3IgZm9yIHN1cGVyc2V0IG9mIHRoZXNlIGJpbmRpbmdzXG4vLyB2YXIgX2F0dHJOYW1lVG9SZWdFeHAgPSBmdW5jdGlvbiggYXR0ckV4cHJlc3Npb24gKSB7XG5cbi8vIFx0YXR0ckV4cHJlc3Npb24gPSBhdHRyRXhwcmVzc2lvbi5yZXBsYWNlKGVzY2FwZVJlZ0V4cCwgJ1xcXFwkJicpXG4vLyBcdFx0LnJlcGxhY2Uob3B0aW9uYWxQYXJhbSwgJyg/OiQxKT8nKVxuLy8gXHRcdC5yZXBsYWNlKG5hbWVkUGFyYW0sIGZ1bmN0aW9uKG1hdGNoLCBvcHRpb25hbCkge1xuLy8gXHRcdFx0cmV0dXJuIG9wdGlvbmFsID8gbWF0Y2ggOiAnKFteXFwvXSspJztcbi8vIFx0XHR9KVxuLy8gXHRcdC5yZXBsYWNlKHNwbGF0UGFyYW0sICcoLio/KScpO1xuLy8gXHRyZXR1cm4gJ14nICsgYXR0ckV4cHJlc3Npb24gKyAnJCc7XG4vLyB9O1xuLy8gdmFyIF9leHRyYWN0UGFyYW1ldGVycyA9IGZ1bmN0aW9uKHJlZ2V4cCwgYXR0ck5hbWUsIGF0dHJFeHByZXNzaW9uKSB7XG4vLyBcdHZhciBwYXJhbVZhbHVlcyA9IHJlZ2V4cC5leGVjKGF0dHJOYW1lKS5zbGljZSgxKTtcbi8vIFx0dmFyIHBhcmFtS2V5cyA9IG5hbWVkUGFyYW0uZXhlYyhhdHRyRXhwcmVzc2lvbik7XG5cbi8vIFx0aWYgKCFwYXJhbUtleXMgfHwgIXBhcmFtVmFsdWVzKSByZXR1cm4ge307XG5cbi8vIFx0dmFyIG5hbWVkUGFyYW1ldGVycyA9IHt9O1xuLy8gXHRjb25zb2xlLmxvZygncGFyYW1WYWx1ZXM6JyxwYXJhbVZhbHVlcyk7XG4vLyBcdF8uZWFjaChwYXJhbVZhbHVlcywgZnVuY3Rpb24gZWFjaE1hdGNoaW5nUGllY2UoIHBhcmFtLCBpICkge1xuLy8gXHRcdHZhciBrZXkgPSBwYXJhbUtleXNbaV07XG4vLyBcdFx0a2V5ID0ga2V5LnNsaWNlKDEpOyAvLyByZW1vdmUgYDpgIGZyb20gbmFtZWQgcGFyYW1cbi8vIFx0XHRuYW1lZFBhcmFtZXRlcnNba2V5XSA9IHBhcmFtVmFsdWVzW2ldO1xuLy8gXHR9KTtcbi8vIFx0cmV0dXJuIG5hbWVkUGFyYW1ldGVycztcbi8vIH07XG5cblxuXG4vLyAvKipcbi8vICAqIFJlbmRlciBhIHNpbmdsZSBiaW5kaW5nXG4vLyAgKi9cbi8vIHZhciBfcmVuZGVyQmluZGluZyA9IGZ1bmN0aW9uICgkbWF0Y2hlZEVsLCBkb21BdHRyaWJ1dGVOYW1lLCBtb2RlbCwgcmVuZGVyRm4sIG5hbWVkUGFyYW1zKSB7XG4vLyBcdHZhciByYXdCaW5kaW5nID0gJG1hdGNoZWRFbC5hdHRyKCBkb21BdHRyaWJ1dGVOYW1lICk7XG4vLyBcdC8vIElmIGVsZW1lbnQgZG9lc24ndCBjb250YWluIHRoZSBzcGVjaWZpZWQgRE9NIGF0dHJpYnV0ZS4uLlxuLy8gXHQvLyBmYWlsIHNpbGVudGx5LlxuLy8gXHRpZiAoICFyYXdCaW5kaW5nICkgcmV0dXJuO1xuXG4vLyBcdC8vIGNvbnNvbGUubG9nKCdnZXR0aW5nICcsZG9tQXR0cmlidXRlTmFtZSwnb24nLCRtYXRjaGVkRWwpO1xuLy8gXHR2YXIgbW9kZWxBdHRyaWJ1dGVOYW1lID0gcmF3QmluZGluZy5yZXBsYWNlKC9eXFxALywgJycpO1xuLy8gXHRGUkFNRVdPUksuZGVidWcoJ0ZvdW5kIGEgYmluZGluZyA6OicsIHJhd0JpbmRpbmcsICc6OicsIG5hbWVkUGFyYW1zKTtcblxuLy8gXHQvLyBJZiBtb2RlbCBkb2Vzbid0IGNvbnRhaW4gdGhlIHNwZWNpZmllZCBhdHRyaWJ1dGUuLi5cbi8vIFx0aWYgKCB0eXBlb2YgbW9kZWwuYXR0cmlidXRlc1ttb2RlbEF0dHJpYnV0ZU5hbWVdID09PSAndW5kZWZpbmVkJyApIHtcblxuLy8gXHRcdC8vIGZhaWwgc2lsZW50bHkuXG4vLyBcdFx0cmV0dXJuO1xuLy8gXHRcdC8vIEZSQU1FV09SSy53YXJuKCdDYW5ub3QgYmluZCBgQCcrbW9kZWxBdHRyaWJ1dGVOYW1lKycgZm9yIHRlbXBsYXRlL2NvbXBvbmVudCAnICtcbi8vIFx0XHQvLyBcdCdgJyArIGNvbXBvbmVudC5pZCArJ2AuXFxuJytcbi8vIFx0XHQvLyBcdCdObyBzdWNoIGF0dHJpYnV0ZSBleGlzdHMgaW4gdGhlIGNvbXBvbmVudFxcJ3MgbW9kZWwuJ1xuLy8gXHRcdC8vICk7XG4vLyBcdH1cblxuLy8gXHQvLyBSZW5kZXIgYSBkYXRhIGJpbmRpbmdcbi8vIFx0dmFyIGJpbmRpbmdWYWwgPSBtb2RlbC5nZXQobW9kZWxBdHRyaWJ1dGVOYW1lKSB8fCAnJztcbi8vIFx0cmVuZGVyRm4oICRtYXRjaGVkRWwsIGJpbmRpbmdWYWwsIG5hbWVkUGFyYW1zICk7XG4vLyB9O1xuXG5cbi8vIC8qKlxuLy8gICogUmVuZGVyIHRoZSBzcGVjaWZpZWQgdHlwZSBvZiBkYXRhIGJpbmRpbmdzXG4vLyAgKlxuLy8gICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnNcbi8vICAqXHRcdEBvcHRpb24ge0Z1bmN0aW9ufSByZW5kZXJGbiAoJGVsLCB2YWwsIHBhcmFtcylcdC0+IGZ1bmN0aW9uIHdoaWNoIHJlbmRlcnMgdGhlIGRhdGEgYmluZGluZyBmb3IgdGhlIHNwZWNpZmllZCBlbGVtZW50XG4vLyAgKlx0XHRcdEBwYXJhbSB7SlF1ZXJ5RWxlbWVudH0gJGVsXG4vLyAgKlx0XHRcdEBwYXJhbSB7P30gdmFsIC0+IHZhbHVlIG9mIGJvdW5kIG1vZGVsIGF0dHJpYnV0ZVxuLy8gICpcdFx0XHRAcGFyYW0ge09iamVjdH0gcGFyYW1zIC0+IGtleWVkIG9iamVjdCBvZiBkeW5hbWljIHBhcmFtZXRlcnMgZnJvbSB0aGUgbmFtZSBvZiB0aGUgYXR0cmlidXRlIGl0c2VsZlxuLy8gICpcdFx0QG9wdGlvbiB7U3RyaW5nfSBhdHRyaWJ1dGUgLT4gbmFtZSBvZiBib3VuZCBhdHRyaWJ1dGUsIGUuZy4gJ2JpbmQtdGV4dCdcbi8vICAqXHRcdEBvcHRpb24ge0NvbXBvbmVudH0gY29tcG9uZW50XG4vLyAgKlx0XHRAb3B0aW9uIHtCYWNrYm9uZS5Nb2RlbH0gW21vZGVsXSAtIGRlZmF1bHRzIHRvIGBjb21wb25lbnQubW9kZWxgXG4vLyAgKi9cbi8vIHZhciBfcmVuZGVyQmluZGluZ3MgPSBmdW5jdGlvbiAoIG9wdGlvbnMgKSB7XG4vLyBcdHZhciBjb21wb25lbnQgPSBvcHRpb25zLmNvbXBvbmVudDtcbi8vIFx0dmFyIGF0dHJpYnV0ZUV4cHJlc3Npb24gPSBvcHRpb25zLmF0dHJpYnV0ZTtcbi8vIFx0dmFyIG1vZGVsID0gb3B0aW9ucy5tb2RlbCB8fCBvcHRpb25zLmNvbXBvbmVudC5tb2RlbDtcblxuXG4vLyBcdC8vIENhbGN1bGF0ZSBzdHJpbmcgd2hpY2ggY2FuIGJlIFwibmV3LWVkXCIgaW50byBhIFJlZ0V4cFxuLy8gXHR2YXIgYXR0clJlZ0V4cFN0ciA9IF9hdHRyTmFtZVRvUmVnRXhwKGF0dHJpYnV0ZUV4cHJlc3Npb24pO1xuLy8gXHR2YXIgYXR0clJlZ0V4cCA9IG5ldyBSZWdFeHAoYXR0clJlZ0V4cFN0cik7XG5cblxuLy8gXHR2YXIgYm91bmRBdHRyU2VsZWN0b3IgPSAnOm1hdGNoQXR0cihcIicgKyBhdHRyUmVnRXhwU3RyICsgJ1wiKSc7XG5cbi8vIFx0Ly8gRmluZCBhbGwgcmVsZXZhbnQgZGVzY2VuZGFudCBlbGVtZW50c1xuLy8gXHR2YXIgJG1hdGNoZXMgPSBfZ2V0JE1hdGNoZXMoYm91bmRBdHRyU2VsZWN0b3IsIGNvbXBvbmVudCk7XG5cbi8vIFx0Ly8gRWFybHkgZXhpdCBmb3Igc2ltcGxlIGJpbmRpbmdzICh3L28gYm91bmQgcGFyYW1zKVxuLy8gXHRpZiAoICFhdHRyaWJ1dGVFeHByZXNzaW9uLm1hdGNoKC9cXDovKSkge1xuLy8gXHRcdCRtYXRjaGVzLmVhY2goZnVuY3Rpb24gKCkge1xuLy8gXHRcdFx0X3JlbmRlckJpbmRpbmcoJCh0aGlzKSwgYXR0cmlidXRlRXhwcmVzc2lvbiwgbW9kZWwsIG9wdGlvbnMucmVuZGVyRm4sIHt9KTtcblxuLy8gXHRcdH0pO1xuLy8gXHRcdHJldHVybjtcbi8vIFx0fVxuXG4vLyBcdGNvbnNvbGUubG9nKCdcXG5SZW5kZXJpbmcgcGFyYW1ldGVyaXplZCBkYXRhIGJpbmRpbmc6ICcsYXR0clJlZ0V4cCk7XG5cbi8vIFx0Ly8gVE9ETzogYmF0Y2ggaXQgdXAgc28gd2Ugb25seSBkbyBvbmUgRE9NIHF1ZXJ5XG4vLyBcdCRtYXRjaGVzLmVhY2goZnVuY3Rpb24gZWFjaEVsZW1lbnRXaXRoQUJpbmRpbmcgKCkge1xuLy8gXHRcdHZhciAkbWF0Y2hlZEVsID0gJCh0aGlzKTtcblxuLy8gXHRcdC8vIEdldCBhbGwgYXR0cmlidXRlcyBmb3IgdGhpcyAkZWwgYW5kIGZpbHRlciBhIHNldCBvZiBtYXRjaGluZyBuYW1lcy9wYXJhbXNcbi8vIFx0XHR2YXIgYWxsRE9NQXR0ck5hbWVzID0gXy5tYXAoICRtYXRjaGVkRWxbMF0uYXR0cmlidXRlcywgZnVuY3Rpb24gKGVsKSB7XG4vLyBcdFx0XHRyZXR1cm4gZWwubm9kZU5hbWU7XG4vLyBcdFx0fSk7XG4vLyBcdFx0Y29uc29sZS5sb2coJ2FsbERPTUF0dHJOYW1lcyBmb3IgZWwnLGFsbERPTUF0dHJOYW1lcywgJG1hdGNoZWRFbCk7XG4vLyBcdFx0dmFyIG1hdGNoaW5nRE9NQXR0cnMgPSB7fTtcbi8vIFx0XHRfLmVhY2goIGFsbERPTUF0dHJOYW1lcywgZnVuY3Rpb24gZWFjaEF0dHJpYnV0ZSAoIGRvbUF0dHJOYW1lICkge1xuLy8gXHRcdFx0Ly8gY29uc29sZS5sb2coJ2NoZWNraW5nJyxkb21BdHRyTmFtZSk7XG4vLyBcdFx0XHRpZiAoIGRvbUF0dHJOYW1lLm1hdGNoKGF0dHJSZWdFeHApKSB7XG4vLyBcdFx0XHRcdG1hdGNoaW5nRE9NQXR0cnNbZG9tQXR0ck5hbWVdID0gX2V4dHJhY3RQYXJhbWV0ZXJzKCBhdHRyUmVnRXhwLCBkb21BdHRyTmFtZSwgYXR0cmlidXRlRXhwcmVzc2lvbiApO1xuLy8gXHRcdFx0XHQvLyBjb25zb2xlLmxvZygnLCBnb3QnLG1hdGNoaW5nRE9NQXR0cnNbZG9tQXR0ck5hbWVdLCAnICgoKCcsZG9tQXR0ck5hbWUsIGF0dHJpYnV0ZUV4cHJlc3Npb24pO1xuLy8gXHRcdFx0fVxuLy8gXHRcdH0pO1xuXG5cbi8vIFx0XHRjb25zb2xlLmxvZygnICoqKiogbWF0Y2hpbmdET01BdHRycyA6OicsIG1hdGNoaW5nRE9NQXR0cnMpO1xuXG4vLyBcdFx0dGhyb3cgbmV3IEVycm9yKCdod2FhYScpO1xuLy8gXHRcdF8uZWFjaChtYXRjaGluZ0RPTUF0dHJzLCBmdW5jdGlvbiAoIG5hbWVkUGFyYW1zLCBkb21BdHRyaWJ1dGVOYW1lICkge1xuLy8gXHRcdFx0X3JlbmRlckJpbmRpbmcoJG1hdGNoZWRFbCwgZG9tQXR0cmlidXRlTmFtZSwgbW9kZWwsIG9wdGlvbnMucmVuZGVyRm4sIG5hbWVkUGFyYW1zKTtcbi8vIFx0XHR9KTtcblxuLy8gXHR9KTtcbi8vIH07XG5cblxuXG4iLCIvKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXNcbiAqL1xudmFyIGRlbGV0ZUFsbFJlZ2lvbnMgPSByZXF1aXJlKCcuL2RlbGV0ZUFsbFJlZ2lvbnMnKSxcblx0ZWwyRGVmYXVsdFRlbXBsYXRlSUQgPSByZXF1aXJlKCcuLi91dGlscy9lbDJEZWZhdWx0VGVtcGxhdGVJRCcpO1xuXG5cblxuLyoqXG4gKiBJbnN0YW50aWF0ZSByZWdpb24gY29tcG9uZW50cyBhbmQgYXBwZW5kIGFueSBkZWZhdWx0XG4gKiB0ZW1wbGF0ZXMvY29tcG9uZW50cyB0byB0aGUgRE9NXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByZW5kZXJSZWdpb25zICgpIHtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdGRlbGV0ZUFsbFJlZ2lvbnMoKTtcblxuXHQvLyBUT0RPOiBnZXQgY2xvc2VzdCBkZXNjZW5kYW50IHJlZ2lvbnMsIG5vdCBhbGwgZGVzY2VuZGFudCByZWdpb25zXG5cblx0Ly8gRGV0ZWN0IGNoaWxkIHJlZ2lvbnMgaW4gdGVtcGxhdGVcblx0dmFyICRyZWdpb25zID0gdGhpcy4kKCdyZWdpb24sIFtkYXRhLXJlZ2lvbl0nKTtcblxuXHQvLyBCdXQgYWxzbyBjaGVjayB0aGUgdG9wLWxldmVsIGVsZW1lbnQgb2YgdGhlIGNvbXBvbmVudCdzIHRlbXBsYXRlIGl0c2VsZixcblx0Ly8gaW4gY2FzZSB0aGUgdG9wLWxldmVsIGVsZW1lbnQgaXMgSVRTIE9XTiByZWdpb25cblx0JHJlZ2lvbnMgPSAkcmVnaW9ucy5hZGQoIHRoaXMuJGVsLmZpbHRlcigncmVnaW9uLCBbZGF0YS1yZWdpb25dJykgKTtcblxuXHQkcmVnaW9ucy5lYWNoKGZ1bmN0aW9uIChpLCBlbCkge1xuXG5cdFx0Ly8gRGV0ZWN0IGRlZmF1bHQgY29tcG9uZW50IGlkIGZvciBjaGlsZCByZWdpb25cblx0XHR2YXIgZGVmYXVsdENvbXBvbmVudElkID0gZWwyRGVmYXVsdFRlbXBsYXRlSUQoZWwpO1xuXG5cdFx0Ly8gR2VuZXJhdGUgYSByZWdpb24gaW5zdGFuY2UgZnJvbSB0aGUgZWxlbWVudFxuXHRcdC8vIChtb2RpZnlpbmcgdGhlIERPTSBhcyBuZWNlc3NhcnkpXG5cdFx0dmFyIHJlZ2lvbiA9IEZSQU1FV09SSy5SZWdpb24uZnJvbUVsZW1lbnQoZWwsIHNlbGYpO1xuXG5cdFx0Ly8gSWYgcmVnaW9uIGhhcyBubyBpZCwgZ2VuZXJhdGUgYSB1bmlxdWUgcmVnaW9uIGlkIHcvaSB0aGlzIGNvbXBvbmVudFxuXHRcdC8vIHRoYXQgaXMgdW5saWtlbHkgdG8gY29sbGlkZSB3aXRoIG15IG90aGVyIG5hbWVkIHJlZ2lvbnNcblx0XHRpZiAoIXJlZ2lvbi5pZCkge1xuXHRcdFx0cmVnaW9uLmlkID0gJycrXG5cdFx0XHRcdEZSQU1FV09SSy5vcHRpb25zLmZyYW1ld29ya0lkICtcblx0XHRcdFx0J19fYW5vbnltb3VzX3JlZ2lvbl9fJyArXG5cdFx0XHRcdHNlbGYuYW5vbnltb3VzUmVnaW9uQ291bnRlcjtcblxuXHRcdFx0Ly8gSW5jcmVtZW50IGNvdW50ZXIgZm9yIG5leHQgdGltZVxuXHRcdFx0c2VsZi5hbm9ueW1vdXNSZWdpb25Db3VudGVyKys7XG5cdFx0fVxuXG5cdFx0Ly8gS2VlcCB0cmFjayBvZiByZWdpb25zLCBzaW5jZSB3ZSBhcmUgdGhlIHBhcmVudCBjb21wb25lbnRcblx0XHRzZWxmLnJlZ2lvbnNbcmVnaW9uLmlkXSA9IHJlZ2lvbjtcblxuXHRcdC8vIEFzIGxvbmcgYXMgdGhlcmUgYXJlIG5vIGNvbGxpc2lvbnMsIGFsc28gcHJvdmlkZSBhY2Nlc3MgdG8gdGhlIHJlZ2lvblxuXHRcdC8vIG9uIHRoZSB0b3AgbGV2ZWwgb2YgdGhlIGNvbXBvbmVudCwgZS5nLiBzbyB5b3UgY2FuIGRvIGB0aGlzLm15UmVnaW9uYFxuXHRcdC8vIGluIHlvdXIgY29tcG9uZW50IG1ldGhvZHMuXG5cdFx0aWYgKCFzZWxmW3JlZ2lvbi5pZF0pIHtcblx0XHRcdHNlbGZbcmVnaW9uLmlkXSA9IHJlZ2lvbjtcblx0XHR9XG5cdH0pO1xufTtcblxuIiwiLyoqXG4gKiBDaGVjayB0aGUgc3BlY2lmaWVkIGRlZmluaXRpb24gZm9yIG9idmlvdXMgbWlzdGFrZXMsIGVzcGVjaWFsbHkgbGlrZWx5IGRlcHJlY2F0aW9ucyBhbmRcbiAqIHZhbGlkYXRlIHRoYXQgdGhlIG1vZGVsIGFuZCBjb2xsZWN0aW9ucyBhcmUgaW5zdGFuY2VzIG9mIEJhY2tib25lJ3MgRGF0YSBzdHJ1Y3R1cmVzLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBwcm9wZXJ0aWVzIFtPYmplY3QgY29udGFpbmluZyB0aGUgcHJvcGVydGllcyBvZiB0aGUgY29tcG9uZW50XVxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gdmFsaWRhdGVEZWZpbml0aW9uKHByb3BlcnRpZXMpIHtcblxuXHRpZiAoXy5pc09iamVjdChwcm9wZXJ0aWVzKSkge1xuXG5cdFx0Ly8gRGV0ZXJtaW5lIGNvbXBvbmVudCBpZFxuXHRcdHZhciBpZCA9IHRoaXMuaWQgfHwgcHJvcGVydGllcy5pZDtcblxuXHRcdGZ1bmN0aW9uIF92YWxpZGF0ZUJhY2tib25lSW5zdGFuY2UgKHR5cGUpIHtcblx0XHRcdHZhciBUeXBlID0gdHlwZVswXS50b1VwcGVyQ2FzZSgpICsgdHlwZS5zbGljZSgxKTtcblxuXHRcdFx0aWYgKCAhcHJvcGVydGllc1t0eXBlXSBpbnN0YW5jZW9mIEJhY2tib25lW1R5cGVdICkge1xuXG5cdFx0XHRcdEZyYW1ld29yay5lcnJvcihcblx0XHRcdFx0XHQnQ29tcG9uZW50ICgnICsgaWQgKyAnKSBoYXMgYW4gaW52YWxpZCAnICsgdHlwZSArICctLSBcXG4nICtcblx0XHRcdFx0XHQnSWYgYCcgKyB0eXBlICsgJ2AgaXMgc3BlY2lmaWVkIGZvciBhIGNvbXBvbmVudCwgJyArXG5cdFx0XHRcdFx0J2l0IG11c3QgYmUgYW4gKmluc3RhbmNlKiBvZiBhIEJhY2tib25lLicgKyBUeXBlICsgJy5cXG4nKTtcblxuXHRcdFx0XHRpZiAocHJvcGVydGllc1t0eXBlXSBpbnN0YW5jZW9mIEJhY2tib25lW1R5cGVdLmNvbnN0cnVjdG9yKSB7XG5cdFx0XHRcdFx0RnJhbWV3b3JrLmVycm9yKFxuXHRcdFx0XHRcdFx0J0l0IGxvb2tzIGxpa2UgYSBCYWNrYm9uZS4nICsgVHlwZSArICcgKnByb3RvdHlwZSogd2FzIHNwZWNpZmllZCBpbnN0ZWFkIG9mIGEgJyArXG5cdFx0XHRcdFx0XHQnQmFja2JvbmUuJyArIFR5cGUgKyAnICppbnN0YW5jZSouXFxuJyArXG5cdFx0XHRcdFx0XHQnUGxlYXNlIGBuZXdgIHVwIHRoZSAnICsgdHlwZSArICcgLWJlZm9yZS0gJyArIEZyYW1ld29yay5pZCArICcucmFpc2UoKSwnICtcblx0XHRcdFx0XHRcdCdvciB1c2UgYSB3cmFwcGVyIGZ1bmN0aW9uIHRvIGFjaGlldmUgdGhlIHNhbWUgZWZmZWN0LCBlLmcuOlxcbicgK1xuXHRcdFx0XHRcdFx0J2AnICsgdHlwZSArICc6IGZ1bmN0aW9uICgpIHtcXG5yZXR1cm4gbmV3IFNvbWUnICsgVHlwZSArICcoKTtcXG59YCdcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0RnJhbWV3b3JrLndhcm4oJ0lnbm9yaW5nIGludmFsaWQgJyArIHR5cGUgKyAnIDo6ICcgKyBwcm9wZXJ0aWVzW3R5cGVdKTtcblx0XHRcdFx0ZGVsZXRlIHByb3BlcnRpZXNbdHlwZV07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgdGhhdCB0aGlzLmNvbGxlY3Rpb24gaXMgYWN0dWFsbHkgYW4gaW5zdGFuY2Ugb2YgQmFja2JvbmUuQ29sbGVjdGlvblxuXHRcdC8vIGFuZCB0aGF0IHRoaXMubW9kZWwgaXMgYWN0dWFsbHkgYW4gaW5zdGFuY2Ugb2YgQmFja2JvbmUuTW9kZWxcblx0XHRfdmFsaWRhdGVCYWNrYm9uZUluc3RhbmNlKCdtb2RlbCcpO1xuXHRcdF92YWxpZGF0ZUJhY2tib25lSW5zdGFuY2UoJ2NvbGxlY3Rpb24nKTtcblxuXHRcdC8vIENsb25lIHByb3BlcnRpZXMgdG8gYXZvaWQgaW5hZHZlcnRlbnQgbW9kaWZpY2F0aW9uc1xuXHRcdHJldHVybiBfLmNsb25lKHByb3BlcnRpZXMpO1xuXHR9XG5cblx0ZWxzZSByZXR1cm4ge307XG5cbn1cbiIsIi8qKlxuICogUnVuIGRlZmluaXRpb24gbWV0aG9kcyB0byBnZXQgYWN0dWFsIGNvbXBvbmVudCBkZWZpbml0aW9ucy5cbiAqIFRoaXMgaXMgZGVmZXJyZWQgdG8gYXZvaWQgaGF2aW5nIHRvIHVzZSBCYWNrYm9uZSdzIGZ1bmN0aW9uICgpIHt9IGFwcHJvYWNoIGZvciB0aGluZ3NcbiAqIGxpa2UgY29sbGVjdGlvbnMuXG4gKi9cblxuLyoqXG4gKiBCdWlsZCB1cHMgYSBjb21wb25lbnQgZGVmaW5pdGlvbiBieSBydW5uaW5nIHRoZSBkZWZpbml0aW9uLiBXZSB0aGVuIGxpbmsgdGhlXG4gKiBjb21wb25lbnQgZGVmaW5pdGlvbiB0byBhbiBpZGVudGlmaWVyIGluIGBGUkFNRVdPUksuY29tcG9uZW50c2AuXG4gKlxuICogQHBhcmFtICB7T2JqZWN0fSBjb21wb25lbnQgW09iamVjdCBjb250YWluaW5nIHRoZSBkZWZpbml0aW9uIGZ1bmN0aW9uIG9mIHRoZSBjb21wb25lbnRdXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYnVpbGRDb21wb25lbnREZWZpbml0aW9uKGNvbXBvbmVudCkge1xuXHR2YXIgY29tcG9uZW50RGVmID0gY29tcG9uZW50LmRlZmluaXRpb24oKTtcblxuXHRpZiAoY29tcG9uZW50LmlkT3ZlcnJpZGUpIHtcblx0XHRpZiAoY29tcG9uZW50RGVmLmlkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoY29tcG9uZW50LmlkT3ZlcnJpZGUgKyAnOjogQ2Fubm90IHNwZWNpZnkgYW4gaWRPdmVycmlkZSBpbiAuZGVmaW5lKCkgaWYgYW4gaWQgcHJvcGVydHkgKCcrY29tcG9uZW50RGVmLmlkKycpIGlzIGFscmVhZHkgc2V0IGluIHlvdXIgY29tcG9uZW50IGRlZmluaXRpb24hXFxuVXNhZ2U6IC5kZWZpbmUoW2lkT3ZlcnJpZGVdLCBkZWZpbml0aW9uKScpO1xuXHRcdH1cblx0XHRjb21wb25lbnREZWYuaWQgPSBjb21wb25lbnQuaWRPdmVycmlkZTtcblx0fVxuXHRpZiAoIWNvbXBvbmVudERlZi5pZCkge1xuXHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IHVzZSAuZGVmaW5lKCkgd2l0aG91dCBkZWZpbmluZyBhbiBpZCBwcm9wZXJ0eSBvciBvdmVycmlkZSBpbiB5b3VyIGNvbXBvbmVudCFcXG5Vc2FnZTogLmRlZmluZShbaWRPdmVycmlkZV0sIGRlZmluaXRpb24pJyk7XG5cdH1cblx0RlJBTUVXT1JLLmNvbXBvbmVudHNbY29tcG9uZW50RGVmLmlkXSA9IGNvbXBvbmVudERlZjtcbn07XG4iLCIvKipcbiAqIE9wdGlvbmFsIG1ldGhvZCB0byByZXF1aXJlIGFwcCBjb21wb25lbnRzLiBSZXF1aXJlLmpzIGNhbiBiZSB1c2VkIGluc3RlYWRcbiAqIGFzIG5lZWRlZC5cbiAqXG4gKiBAcGFyYW0gIHtTdHJpbmd9IFx0WyhvcHRpb25hbCkgQ29tcG9uZW50IGlkIG92ZXJyaWRlXVxuICogQHBhcmFtICB7RnVuY3Rpb259IFtGdW5jdGlvbiBEZWZpbml0aW9uIG9mIGNvbXBvbmVudF1cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBkZWZpbmUoaWQsIGRlZmluaXRpb25Gbikge1xuXHQvLyBJZCBwYXJhbSBpcyBvcHRpb25hbFxuXHRpZiAoIWRlZmluaXRpb25Gbikge1xuXHRcdGRlZmluaXRpb25GbiA9IGlkO1xuXHRcdGlkID0gbnVsbDtcblx0fVxuXG5cdEZSQU1FV09SSy5fZGVmaW5lUXVldWUucHVzaCh7XG5cdFx0ZGVmaW5pdGlvbjogZGVmaW5pdGlvbkZuLFxuXHRcdGlkT3ZlcnJpZGU6IGlkXG5cdH0pO1xufTtcbiIsIi8qKlxuICogTWFzdCBidWlsZCBmaWxlLiBUaGUgbWFpbiBmaWxlXG4gKi9cblxudmFyIGRlZmluZSA9IHJlcXVpcmUoJy4vZGVmaW5lL2luZGV4Jyk7XG52YXIgUmVnaW9uID0gcmVxdWlyZSgnLi9yZWdpb24vaW5kZXgnKTtcbnZhciBDb21wb25lbnQgPSByZXF1aXJlKCcuL2NvbXBvbmVudC9pbmRleCcpO1xudmFyIHJhaXNlID0gcmVxdWlyZSgnLi9yYWlzZS9pbmRleCcpO1xuXG4vKipcbiAqIEZyYW1ld29yayBjbGFzcyBkZWZpbml0aW9uIHRoYXQgd2lsbCBjcmVhdGUgYSBuZXcgZ2xvYmFsIGluc3RhbmNlIG9mIGEgY3VzdG9tIEZyYW1ld29yay5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBbb3B0aW9ucyBoYXNoIHRvIGluaXRpYWxpemUgdGhlIGN1c3RvbSBmcmFtZXdvcmsgd2l0aF1cbiAqL1xudmFyIEZyYW1ld29yayA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcblxuXHQvLyBTZXQgdGhlIGRlZmF1bHQgb3B0aW9ucyBmb3IgdGhvc2Ugbm90IHBhc3NlZCBpbi5cblx0b3B0aW9ucyA9IF8uZGVmYXVsdHMob3B0aW9ucyB8fCB7fSwge1xuXHRcdHRocm90dGxlV2luZG93UmVzaXplOiAyMDAsXG5cdFx0bG9nTGV2ZWw6ICd3YXJuJyxcblx0XHRmcmFtZXdvcmtJZDogJ21hc3QnLFxuXHRcdHByb2R1Y3Rpb246IGZhbHNlLFxuXHRcdGxvZ2dlcjogdW5kZWZpbmVkLFxuXHRcdHNob3J0Y3V0OiB7XG5cdFx0XHR0ZW1wbGF0ZTogdHJ1ZSxcblx0XHRcdGNvdW50OiB0cnVlXG5cdFx0fVxuXHR9KTtcblxuXHQvLyBTZXQgYSBzdGFydGluZyBwb2ludCB0byBCYWNrYm9uZSBhbmQgYWRkIGFkZGl0aW9uYWwgYXR0cmlidXRlLlxuXHRfLmV4dGVuZCh0aGlzLCBCYWNrYm9uZSwge1xuXHRcdG9wdGlvbnM6IG9wdGlvbnMsXG5cdFx0dGVtcGxhdGVzOiB7fSxcblx0XHRjb21wb25lbnRzOiB7fSxcblx0XHRkYXRhOiB7fSxcblx0XHRfZGVmaW5lUXVldWU6IFtdLFxuXHRcdHJlZ2lvbnM6IHt9XG5cdH0pO1xuXG5cdC8qKlxuXHQgKiBFeHRlbmQgRlJBTUVXT1JLLkNvbGxlY3Rpb24gdG8gbWFrZSBpdCBiZXR0ZXJcblx0ICogKHNwZWNpZmljYWxseSwgdG8gYWRkIGVycm9yIGhhbmRsaW5nKVxuXHQgKi9cblx0dmFyIHNlbGYgPSB0aGlzO1xuXHR2YXIgb3JpZ2luYWxDb2xsZWN0aW9uID0gdGhpcy5Db2xsZWN0aW9uO1xuXHR0aGlzLkNvbGxlY3Rpb24gPSBvcmlnaW5hbENvbGxlY3Rpb24uZXh0ZW5kKHtcblxuXHRcdGluaXRpYWxpemU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG5cblx0XHRcdC8vIE92ZXJyaWRlIGBjb2xsZWN0aW9uLmZldGNoKClgXG5cdFx0XHR0aGlzLl9mZXRjaCA9IHRoaXMuZmV0Y2g7XG5cdFx0XHR0aGlzLmZldGNoID0gdGhpc1snX2ZldGNoKysnXTtcblx0XHR9LFxuXG5cblx0XHQvKipcblx0XHQgKiBhZnRlckVycm9yXG5cdFx0ICpcblx0XHQgKiBMaWZlY3ljbGUgY2FsbGJhY2sgdG8gY2F0Y2ggd2hlbiBhIGZldGNoIGVycm9yIG9jY3Vyc1xuXHRcdCAqXG5cdFx0ICogVE9ETzpcblx0XHQgKiBQcm9iYWJseSByZW1vdmUgdGhpcy0tIHJlYXNvbmluZyA6OlxuXHRcdCAqIEluIG1vc3QgY2FzZXMsIHlvdSBhY3R1YWxseSBjYXJlIGFib3V0IHRoZSBlcnJvciBpblxuXHRcdCAqIHRoZSByZWxldmFudCBjb21wb25lbnRzIHdobyBhcmUgdXNpbmcgdGhpcyBjb2xsZWN0aW9uLFxuXHRcdCAqIGluIHdoaWNoIGNhc2UgeW91J2QganVzdCBiaW5kIGFuIGVycm9yIGV2ZW50IGhhbmRsZXIuXG5cdFx0ICovXG5cdFx0YWZ0ZXJFcnJvcjogZnVuY3Rpb24gKGNvbGxlY3Rpb24sIHhociwgb3B0aW9ucykge1xuXHRcdFx0Ly8gdGhpcyBleGlzdHMgZm9yIHlvdSB0byBvdmVycmlkZSBpdCFcblx0XHR9LFxuXG5cblxuXG5cdFx0LyoqXG5cdFx0ICogT3ZlcnJpZGUgQmFja2JvbmUuQ29sbGVjdGlvbidzIGBmZXRjaCgpYFxuXHRcdCAqIHRvIGFsbG93IGZvciBiZXR0ZXIgZXJyb3IgaGFuZGxpbmcuXG5cdFx0ICpcblx0XHQgKiBUT0RPOiBwdWxsIHRoaXMgaW50byBCYWNrYm9uZS5zeW5jIGluc3RlYWQuLlxuXHRcdCAqIG9ubHkgcHJvYmxlbSBpcyBjbGFzaGluZyB3aXRoIG90aGVyIHN5bmMgb3ZlcnJpZGVzXG5cdFx0ICovXG5cdFx0J19mZXRjaCsrJzogZnVuY3Rpb24gKG9wdGlvbnMpIHtcblx0XHRcdHZhciBjb2xsZWN0aW9uID0gdGhpcztcblxuXHRcdFx0b3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cblx0XHRcdC8vIExvZyBhIGZyaWVuZGxpZXIgXCJObyBVUkxcIiBtZXNzYWdlOlxuXHRcdFx0aWYgKCAhY29sbGVjdGlvbi51cmwgKSB7XG5cdFx0XHRcdHNlbGYuZXJyb3IoJ0Nhbm5vdCBmZXRjaCgpICcgKyBjb2xsZWN0aW9uLnR5cGUgKyAnIDo6IENvbGxlY3Rpb24gaGFzIG5vIFVSTCBmdW5jdGlvbi9wcm9wZXJ0eS4uLicpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIE92ZXJyaWRlIGVycm9yIGhhbmRsZXIgdG8gbWl4aW4gYW4gJ2Vycm9yJyBldmVudFxuXHRcdFx0dmFyIG9yaWdpbmFsRXJyb3JIYW5kbGVyID0gb3B0aW9ucy5lcnJvcjtcblx0XHRcdHZhciBvcmlnaW5hbFN1Y2Nlc3NIYW5kbGVyID0gb3B0aW9ucy5zdWNjZXNzO1xuXHRcdFx0Xy5leHRlbmQob3B0aW9ucywge1xuXHRcdFx0XHRzdWNjZXNzOiBmdW5jdGlvbiAoY29sbGVjdGlvbiwgeGhyLCBvcHRpb25zKSB7XG5cdFx0XHRcdFx0dmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuXG5cdFx0XHRcdFx0Ly8gTnVsbCBvdXQgYGNvbGxlY3Rpb24uc3luY2luZ2Bcblx0XHRcdFx0XHRjb2xsZWN0aW9uLnN5bmNpbmcgPSBudWxsO1xuXG5cdFx0XHRcdFx0Ly8gVHJpZ2dlciBvcmlnaW5hbCBzdWNjZXNzIGhhbmRsZXIgaWYgc3BlY2lmaWVkXG5cdFx0XHRcdFx0Ly8gb24gYGZldGNoKHtzdWNjZXNzOiBmdW5jdGlvbigpey8qLi4uKi99fSlgXG5cdFx0XHRcdFx0aWYgKG9yaWdpbmFsU3VjY2Vzc0hhbmRsZXIpIHtcblx0XHRcdFx0XHRcdHJldHVybiBvcmlnaW5hbFN1Y2Nlc3NIYW5kbGVyLmFwcGx5KGNvbGxlY3Rpb24sIGFyZ3MpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0ZXJyb3I6IGZ1bmN0aW9uIChjb2xsZWN0aW9uLCB4aHIsIG9wdGlvbnMpIHtcblx0XHRcdFx0XHR2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG5cblx0XHRcdFx0XHQvLyBOdWxsIG91dCBgY29sbGVjdGlvbi5zeW5jaW5nYFxuXHRcdFx0XHRcdGNvbGxlY3Rpb24uc3luY2luZyA9IG51bGw7XG5cblx0XHRcdFx0XHQvLyBJZiB0aGlzIGlzIGFuIFwiYWJvcnRcIiwgaWdub3JlIGl0LSAoc3RhdGUgaGFzIGFscmVhZHkgYmVlbiB0YWtlbiBjYXJlIG9mKVxuXHRcdFx0XHRcdGlmICggeGhyICYmIHhoci5zdGF0dXNUZXh0PT09J2Fib3J0JyApIHJldHVybjtcblxuXHRcdFx0XHRcdC8vIFNldCBgY29sbGVjdGlvbi5lcnJvcmAgdXNpbmcgdGhlIHJlc3BvbnNlIGZyb20gdGhlIGZldGNoXG5cdFx0XHRcdFx0Ly8gKHRyeSBqc29uLCB0aGVuIHJlc3BvbnNlIHRleHQsIHRoZW4gc3RhdHVzIGNvZGUsIHRoZW4ganVzdCBkZWZhdWx0IHRvIGB0cnVlYClcblx0XHRcdFx0XHRjb2xsZWN0aW9uLmVycm9yID1cblx0XHRcdFx0XHRcdCggeGhyICYmIHhoci5yZXNwb25zZUpTT04gKSA/IHhoci5yZXNwb25zZUpTT04gOlxuXHRcdFx0XHRcdFx0KCB4aHIgJiYgeGhyLnJlc3BvbnNlVGV4dCApID8geGhyLnJlc3BvbnNlVGV4dCA6XG5cdFx0XHRcdFx0XHR0cnVlO1xuXG5cblx0XHRcdFx0XHQvLyBDYWxsIGBhZnRlckVycm9yKClgXG5cdFx0XHRcdFx0Y29sbGVjdGlvbi5hZnRlckVycm9yLmFwcGx5KGNvbGxlY3Rpb24sYXJncyk7XG5cblx0XHRcdFx0XHQvLyBUcmlnZ2VyIG9yaWdpbmFsIGVycm9yIGhhbmRsZXIgaWYgc3BlY2lmaWVkXG5cdFx0XHRcdFx0Ly8gb24gYGZldGNoKHtlcnJvcjogZnVuY3Rpb24oKXsvKi4uLiovfX0pYFxuXHRcdFx0XHRcdGlmIChvcmlnaW5hbEVycm9ySGFuZGxlcikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG9yaWdpbmFsRXJyb3JIYW5kbGVyLmFwcGx5KGNvbGxlY3Rpb24sIGFyZ3MpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIE51bGwgb3V0IGBjb2xsZWN0aW9uLmVycm9yYFxuXHRcdFx0Y29sbGVjdGlvbi5lcnJvciA9IG51bGw7XG5cblx0XHRcdC8vIElmIGBmZXRjaGAgaXMgYWxyZWFkeSBpbiBwcm9ncmVzcywgY2FuY2VsIGl0XG5cdFx0XHQvLyBhbmQgZmlyZSBvZmYgYSBuZXcgb25lLlxuXHRcdFx0aWYgKGNvbGxlY3Rpb24uc3luY2luZykge1xuXHRcdFx0XHRzZWxmLmxvZygnQWJvcnRpbmcgcnVubmluZyBgZmV0Y2goKWAgaW4gb3JkZXIgdG8gc3RhcnQgYSBuZXcgYGZldGNoKClgLi4uJyk7XG5cdFx0XHRcdGNvbGxlY3Rpb24uc3luY2luZy5hYm9ydCgpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDYWxsIG9yaWdpbmFsIGBmZXRjaCgpYCB1c2luZyBvdXIgbW9ua2V5LXBhdGNoZWQgb3B0aW9uc1xuXHRcdFx0dmFyIHhociA9IGNvbGxlY3Rpb24uX2ZldGNoKG9wdGlvbnMpO1xuXG5cdFx0XHQvLyBTZXQgYGNvbGxlY3Rpb24uc3luY2luZ2AgdG8gdGhlIFhIUiBvYmplY3QgaW4gdXNlXG5cdFx0XHRjb2xsZWN0aW9uLnN5bmNpbmcgPSB4aHI7XG5cblx0XHRcdC8vIFJldHVybiB0aGUgWEhSIG9iamVjdCB0byBtYWludGFpbiBvcmlnaW5hbCBgQmFja2JvbmUuQ29sbGVjdGlvbi5mZXRjaCgpYCBBUElcblx0XHRcdHJldHVybiB4aHI7XG5cdFx0fVxuXG5cdH0pO1xuXG5cblx0Ly8gVGhyb3VnaG91dCB0aGUgc291cmNlIGNvZGUsIHRoZXJlIGFyZSBvcGVyYXRpb25zIG9uIGBGUkFNRVdPUktgIG9yIGNvZGUgdGhhdCBhY2Nlc3Nlc1xuXHQvLyBpdHMgYXR0cmlidXRlcy4gU28gd2UgbWFrZSBgRlJBTUVXT1JLYCBhY2Nlc3NpYmxlLlxuXHQvL1xuXHQvLyBOb3RlOlxuXHQvLyBgRlJBTUVXT1JLYCB3aWxsIG9ubHkgYmUgYSBnbG9iYWwgdmFyaWFibGUgKiogZHVyaW5nIHRoZSBidWlsZCAqKlxuXHRGUkFNRVdPUksgPSB0aGlzO1xuXG5cbn07XG5cbi8vIEZyYW1ld29yayBwcm90b3R5cGUgbWV0aG9kcy5cbkZyYW1ld29yay5wcm90b3R5cGUuUmVnaW9uID0gUmVnaW9uO1xuRnJhbWV3b3JrLnByb3RvdHlwZS5Db21wb25lbnQgPSBDb21wb25lbnQ7XG5GcmFtZXdvcmsucHJvdG90eXBlLmRlZmluZSA9IGRlZmluZTtcbkZyYW1ld29yay5wcm90b3R5cGUucmFpc2UgPSByYWlzZTtcblxuXG5cbi8vIEV4cG9zZSBpbnN0YW50aWF0ZWQgZnJhbWV3b3JrIHZpYSBVTUQ6XG52YXIgZnJhbWV3b3JrID0gbmV3IEZyYW1ld29yaygpO1xubW9kdWxlLmV4cG9ydHMgPSBmcmFtZXdvcms7XG5cbiIsIi8qKlxuICpcdExvZ2dldCBjb25zdHJ1Y3RvciBtZXRob2QgdGhhdCB3aWxsIHNldHVwIEZSQU1FV09SSyB0byBsb2cgbWVzc2FnZXMuXG4gKi9cblxudmFyIHNldHVwTG9nZ2VyID0gcmVxdWlyZSgnLi9zZXR1cCcpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIExvZ2dlcigpIHtcblxuXHQvLyBVcG9uIGluaXRpYWxpemF0aW9uLCBzZXR1cCBsb2dnZXJcblx0c2V0dXBMb2dnZXIoRlJBTUVXT1JLLm9wdGlvbnMubG9nTGV2ZWwpO1xuXG5cdC8vIEluIHN1cHBvcnRlZCBicm93c2VycywgYWxzbyBydW4gc2V0dXBMb2dnZXIgYWdhaW5cblx0Ly8gd2hlbiBGUkFNRVdPUksubG9nTGV2ZWwgaXMgc2V0IGJ5IHRoZSB1c2VyXG5cdC8vIFRPRE86IGZpbmQgYSB3YXkgdG8gZG8gdGhpcyB3aXRob3V0IGRlcGVuZGluZyBvbiBfX2RlZmluZVNldHRlcl9fLlxuXHRpZiAoXy5pc0Z1bmN0aW9uKEZSQU1FV09SSy5fX2RlZmluZVNldHRlcl9fKSkge1xuXHRcdEZSQU1FV09SSy5fX2RlZmluZVNldHRlcl9fKCdsb2dMZXZlbCcsIGZ1bmN0aW9uIG9uQ2hhbmdlIChuZXdMb2dMZXZlbCkge1xuXHRcdFx0c2V0dXBMb2dnZXIobmV3TG9nTGV2ZWwpO1xuXHRcdH0pO1xuXHR9XG59O1xuIiwiLyoqXG4gKiBTZXQgdXAgdGhlIGxvZyBmdW5jdGlvbnM6XG4gKlxuICogRlJBTUVXT1JLLmVycm9yXG4gKiBGUkFNRVdPUksud2FyblxuICogRlJBTUVXT1JLLmxvZ1xuICogRlJBTUVXT1JLLmRlYnVnICgqbGVnYWN5KVxuICogRlJBTUVXT1JLLnZlcmJvc2VcbiAqXG4gKiBAcGFyYW0gIHtTdHJpbmd9IGxvZ0xldmVsIFtUaGUgZGVzaXJlZCBsb2cgbGV2ZWwgb2YgdGhlIExvZ2dlcl1cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBzZXR1cExvZ2dlciAobG9nTGV2ZWwpIHtcblxuXHR2YXIgbm9vcCA9IGZ1bmN0aW9uICgpIHt9O1xuXG5cdC8vIElmIGxvZyBpcyBzcGVjaWZpZWQsIHVzZSBpdCwgb3RoZXJ3aXNlIHVzZSB0aGUgY29uc29sZVxuXHRpZiAoRlJBTUVXT1JLLmxvZ2dlcikge1xuXHRcdEZSQU1FV09SSy5lcnJvciAgICAgPSBGUkFNRVdPUksubG9nZ2VyLmVycm9yO1xuXHRcdEZSQU1FV09SSy53YXJuICAgICAgPSBGUkFNRVdPUksubG9nZ2VyLndhcm47XG5cdFx0RlJBTUVXT1JLLmxvZyAgICAgICA9IEZSQU1FV09SSy5sb2dnZXIuZGVidWcgfHwgRlJBTUVXT1JLLmxvZ2dlcjtcblx0XHRGUkFNRVdPUksudmVyYm9zZSAgID0gRlJBTUVXT1JLLmxvZ2dlci52ZXJib3NlO1xuXHR9XG5cblx0Ly8gSW4gSUUsIHdlIGNhbid0IGRlZmF1bHQgdG8gdGhlIGJyb3dzZXIgY29uc29sZSBiZWNhdXNlIHRoZXJlIElTIE5PIEJST1dTRVIgQ09OU09MRVxuXHRlbHNlIGlmICh0eXBlb2YgY29uc29sZSAhPT0gJ3VuZGVmaW5lZCcpIHtcblxuXHRcdC8vIFdlIGNhbm5vdCBjYWxsZWQgdGhlIC5iaW5kIG1ldGhvZCBvbiB0aGUgY29uc29sZSBtZXRob2RzLiBXZSBhcmUgaW4gaWUgOSBvciA4LCBqdXN0IG1ha2Vcblx0XHQvLyBldmVyeWh0aW5nIGEgbm9vcC5cblx0XHRpZiAoXy5pc1VuZGVmaW5lZChjb25zb2xlLmxvZy5iaW5kKSkgIHtcblx0XHRcdEZSQU1FV09SSy5lcnJvciAgICAgPSBub29wO1xuXHRcdFx0RlJBTUVXT1JLLndhcm4gICAgICA9IG5vb3A7XG5cdFx0XHRGUkFNRVdPUksubG9nICAgICAgID0gbm9vcDtcblx0XHRcdEZSQU1FV09SSy5kZWJ1ZyAgICAgPSBub29wO1xuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UgICA9IG5vb3A7XG5cdFx0fVxuXG5cdFx0Ly8gV2UgYXJlIGluIGEgZnJpZW5kbHkgYnJvd3NlciBsaWtlIENocm9tZSwgRmlyZWZveCwgb3IgSUUxMFxuXHRcdGVsc2Uge1xuXHRcdFx0RlJBTUVXT1JLLmVycm9yXHRcdD0gY29uc29sZS5lcnJvciAmJiBjb25zb2xlLmVycm9yLmJpbmQoY29uc29sZSk7XG5cdFx0XHRGUkFNRVdPUksud2Fyblx0XHQ9IGNvbnNvbGUud2FybiAmJiBjb25zb2xlLndhcm4uYmluZChjb25zb2xlKTtcblx0XHRcdEZSQU1FV09SSy5sb2dcdFx0XHQ9IGNvbnNvbGUuZGVidWcgJiYgY29uc29sZS5kZWJ1Zy5iaW5kKGNvbnNvbGUpO1xuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2VcdD0gY29uc29sZS5sb2cgJiYgY29uc29sZS5sb2cuYmluZChjb25zb2xlKTtcblxuXHRcdFx0Ly8gVXNlIGxvZyBsZXZlbCBjb25maWcgaWYgcHJvdmlkZWRcblx0XHRcdHN3aXRjaCAobG9nTGV2ZWwpIHtcblx0XHRcdFx0Y2FzZSAndmVyYm9zZSc6IGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgJ2RlYnVnJzpcblx0XHRcdFx0XHRGUkFNRVdPUksudmVyYm9zZSA9IG5vb3A7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSAnd2Fybic6XG5cdFx0XHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UgPSBGUkFNRVdPUksubG9nID0gbm9vcDtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlICdlcnJvcic6XG5cdFx0XHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UgPSBGUkFNRVdPUksubG9nID0gRlJBTUVXT1JLLndhcm4gPSBub29wO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgJ3NpbGVudCc6XG5cdFx0XHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UgPSBGUkFNRVdPUksubG9nID0gRlJBTUVXT1JLLndhcm4gPSBGUkFNRVdPUksuZXJyb3IgPSBub29wO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yICgnVW5yZWNvZ25pemVkIGxvZ2dpbmcgbGV2ZWwgY29uZmlnICcgK1xuXHRcdFx0XHRcdCcoJyArIEZSQU1FV09SSy5vcHRpb25zLmZyYW1ld29ya0lkICsgJy5sb2dMZXZlbCA9IFwiJyArIGxvZ0xldmVsICsgJ1wiKScpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTdXBwb3J0IGZvciBgZGVidWdgIGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eVxuXHRcdFx0RlJBTUVXT1JLLmRlYnVnID0gRlJBTUVXT1JLLmxvZztcblxuXHRcdFx0Ly8gVmVyYm9zZSBzcGl0cyBvdXQgbG9nIGxldmVsXG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZSgnTG9nIGxldmVsIHNldCB0byA6OiAnLCBsb2dMZXZlbCk7XG5cdFx0fVxuXHR9XG59XG4iLCIvKipcbiAqIEdpdmVuIGEgY29tcG9uZW50IGRlZmluaXRpb24gYW5kIGl0cyBrZXksIHdlIHdpbGwgYnVpbGQgdXAgdGhlIGNvbXBvbmVudCBwcm90b3R5cGUgYW5kIG1lcmdlXG4gKiB0aGlzIGNvbXBvbmVudCB3aXRoIGl0cyBtYXRjaGluZyB0ZW1wbGF0ZS5cbiAqXG4gKiBAcGFyYW0gIHtPYmplY3R9IGNvbXBvbmVudERlZiBbT2JqZWN0IGNvbnRhaW5pbmcgdGhlIGNvbXBvbmVudCBkZWZpbml0aW9uXVxuICogQHBhcmFtICB7U3RyaW5nfSBjb21wb25lbnRLZXkgW1RoZSBjb21wb25lbnQgaWRlbnRpZmllcl1cbiAqL1xuXG52YXIgdHJhbnNsYXRlU2hvcnRoYW5kID0gcmVxdWlyZSgnLi4vdXRpbHMvc2hvcnRoYW5kJyk7XG52YXIgb2JqTWFwID0gcmVxdWlyZSgnLi4vdXRpbHMvb2JqTWFwJyk7XG52YXIgRXZlbnRzID0gcmVxdWlyZSgnLi4vdXRpbHMvZXZlbnRzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYnVpbGRDb21wb25lbnRQcm90b3R5cGUoY29tcG9uZW50RGVmLCBjb21wb25lbnRLZXkpIHtcblxuXHQvLyBJZiBjb21wb25lbnQgaWQgaXMgbm90IGV4cGxpY2l0bHkgc2V0LCB1c2UgdGhlIGNvbXBvbmVudEtleVxuXHRpZiAoIWNvbXBvbmVudERlZi5pZCkge1xuXHRcdGNvbXBvbmVudERlZi5pZCA9IGNvbXBvbmVudEtleTtcblx0fVxuXG5cdC8vIFNlYXJjaCB0ZW1wbGF0ZXNcblx0dmFyIHRlbXBsYXRlID0gRlJBTUVXT1JLLnRlbXBsYXRlc1tjb21wb25lbnREZWYuaWRdO1xuXG5cdC8vIElmIG5vIG1hdGNoIGZvciBjb21wb25lbnQgd2FzIGZvdW5kwqBpbiB0ZW1wbGF0ZXMsIGlzc3VlIGEgd2FybmluZ1xuXHRpZiAoIXRlbXBsYXRlKSB7XG5cdFx0cmV0dXJuIEZSQU1FV09SSy53YXJuKFxuXHRcdFx0Y29tcG9uZW50RGVmLmlkICsgJyA6OiBObyB0ZW1wbGF0ZSBmb3VuZCBmb3IgY29tcG9uZW50IScgK1xuXHRcdFx0J1xcblRlbXBsYXRlcyBkb25cXCd0IG5lZWQgYSBjb21wb25lbnQgdW5sZXNzIHlvdSB3YW50IGludGVyYWN0aXZpdHksICcgK1xuXHRcdFx0J2V2ZXJ5IGNvbXBvbmVudCAqc2hvdWxkKiBoYXZlIGEgbWF0Y2hpbmcgdGVtcGxhdGUhIScgK1xuXHRcdFx0J1xcblVzaW5nIGNvbXBvbmVudHMgd2l0aG91dCB0ZW1wbGF0ZXMgbWF5IHNlZW0gbmVjZXNzYXJ5LCAnICtcblx0XHRcdCdidXQgaXRcXCdzIG5vdC4gIEl0IG1ha2VzIHlvdXIgdmlldyBsb2dpYyBpbmNvcnBvcmVhbCwgYW5kIG1ha2VzIHlvdXIgY29sbGVhZ3VlcyAnICtcblx0XHRcdCd1bmNvbWZvcnRhYmxlLicpO1xuXHR9XG5cblx0Ly8gU2F2ZSByZWZlcmVuY2UgdG8gdGVtcGxhdGUgaW4gY29tcG9uZW50IHByb3RvdHlwZVxuXHRGUkFNRVdPUksudmVyYm9zZShjb21wb25lbnREZWYuaWQgKyAnIDo6IFBhaXJpbmcgY29tcG9uZW50IHdpdGggdGVtcGxhdGUuLi4nKTtcblx0Y29tcG9uZW50RGVmLnRlbXBsYXRlID0gdGVtcGxhdGU7XG5cblx0Ly8gVHJhbnNsYXRlIHJpZ2h0LWhhbmQgc2hvcnRoYW5kIGZvciB0b3AtbGV2ZWwga2V5c1xuXHRjb21wb25lbnREZWYgPSBvYmpNYXAoY29tcG9uZW50RGVmLCB0cmFuc2xhdGVTaG9ydGhhbmQpO1xuXG5cblx0Ly8gYW5kIGV2ZW50cyBvYmplY3Rcblx0aWYgKGNvbXBvbmVudERlZi5ldmVudHMpIHtcblx0XHRjb21wb25lbnREZWYuZXZlbnRzID0gb2JqTWFwKFxuXHRcdFx0Y29tcG9uZW50RGVmLmV2ZW50cyxcblx0XHRcdHRyYW5zbGF0ZVNob3J0aGFuZFxuXHRcdCk7XG5cdH1cblxuXHQvLyBhbmQgYWZ0ZXJDaGFuZ2UgYmluZGluZ3Ncblx0aWYgKF8uaXNPYmplY3QoY29tcG9uZW50RGVmLmFmdGVyQ2hhbmdlKSAmJiAhXy5pc0Z1bmN0aW9uKGNvbXBvbmVudERlZi5hZnRlckNoYW5nZSkpIHtcblx0XHRjb21wb25lbnREZWYuYWZ0ZXJDaGFuZ2UgPSBvYmpNYXAoXG5cdFx0XHRjb21wb25lbnREZWYuYWZ0ZXJDaGFuZ2UsXG5cdFx0XHR0cmFuc2xhdGVTaG9ydGhhbmRcblx0XHQpO1xuXHR9XG5cblx0Ly8gR28gYWhlYWQgYW5kIHR1cm4gdGhlIGRlZmluaXRpb24gaW50byBhIHJlYWwgY29tcG9uZW50IHByb3RvdHlwZVxuXHRGUkFNRVdPUksudmVyYm9zZShjb21wb25lbnREZWYuaWQgKyAnIDo6IEJ1aWxkaW5nIGNvbXBvbmVudCBwcm90b3R5cGUuLi4nKTtcblx0dmFyIGNvbXBvbmVudFByb3RvdHlwZSA9IEZSQU1FV09SSy5Db21wb25lbnQuZXh0ZW5kKGNvbXBvbmVudERlZik7XG5cblx0Ly8gRGlzY292ZXIgc3Vic2NyaXB0aW9uc1xuXHRjb21wb25lbnRQcm90b3R5cGUucHJvdG90eXBlLnN1YnNjcmlwdGlvbnMgPSB7fTtcblxuXHQvLyBJdGVyYXRlIHRocm91Z2ggZWFjaCBwcm9wZXJ0eSBvbiB0aGlzIGNvbXBvbmVudCBwcm90b3R5cGVcblx0Xy5lYWNoKGNvbXBvbmVudFByb3RvdHlwZS5wcm90b3R5cGUsIGZ1bmN0aW9uIChoYW5kbGVyLCBrZXkpIHtcblxuXHRcdC8vIERldGVjdCBET00gZXZlbnRzIGFuZCBzbWFzaCB0aGVtIGludG8gdGhlIGV2ZW50cyBoYXNoXG5cdFx0dmFyIG1hdGNoZWRET01FdmVudHMgPSBrZXkubWF0Y2goRXZlbnRzWycvRE9NRXZlbnQvJ10pO1xuXHRcdGlmIChtYXRjaGVkRE9NRXZlbnRzKSB7XG5cdFx0XHR2YXIgZXZlbnROYW1lID0gbWF0Y2hlZERPTUV2ZW50c1sxXTtcblx0XHRcdHZhciBkZWxlZ2F0ZVNlbGVjdG9yID0gbWF0Y2hlZERPTUV2ZW50c1szXTtcblxuXHRcdFx0Ly8gU3RvdyB0aGVtIGluIGV2ZW50cyBoYXNoXG5cdFx0XHRjb21wb25lbnRQcm90b3R5cGUucHJvdG90eXBlLmV2ZW50cyA9IGNvbXBvbmVudFByb3RvdHlwZS5wcm90b3R5cGUuZXZlbnRzIHx8IHt9O1xuXHRcdFx0Y29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZS5ldmVudHNba2V5XSA9IGhhbmRsZXI7XG5cdFx0fVxuXG5cdFx0Ly8gQWRkIGFwcCBldmVudHMgKCUpLCByb3V0ZXMgKCMpLCBhbmQgZGF0YSBsaXN0ZW5lcnMgKH4pIHRvIHN1YnNjcmlwdGlvbnMgaGFzaFxuXHRcdGlmIChrZXkubWF0Y2goL14oJXwjfH4pLykpIHtcblx0XHRcdGlmIChfLmlzU3RyaW5nKGhhbmRsZXIpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihjb21wb25lbnREZWYuaWQgKyAnOjogSW52YWxpZCBsaXN0ZW5lciBmb3Igc3Vic2NyaXB0aW9uOiAnICsga2V5ICsgJy5cXG4nICtcblx0XHRcdFx0XHQnRGVmaW5lIHlvdXIgY2FsbGJhY2sgd2l0aCBhbiBhbm9ueW1vdXMgZnVuY3Rpb24gaW5zdGVhZCBvZiBhIHN0cmluZy4nXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIV8uaXNGdW5jdGlvbihoYW5kbGVyKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoY29tcG9uZW50RGVmLmlkICsnOjogSW52YWxpZCBsaXN0ZW5lciBmb3Igc3Vic2NyaXB0aW9uOiAnICsga2V5KTtcblx0XHRcdH1cblx0XHRcdGNvbXBvbmVudFByb3RvdHlwZS5wcm90b3R5cGUuc3Vic2NyaXB0aW9uc1trZXldID0gaGFuZGxlcjtcblx0XHR9XG5cblx0XHQvLyBFeHRlbmQgb25lIG9yIG1vcmUgb3RoZXIgY29tcG9uZW50c1xuXHRcdGVsc2UgaWYgKGtleSA9PT0gJ2V4dGVuZENvbXBvbmVudHMnKSB7XG5cdFx0XHR2YXIgb2JqVG9NZXJnZSA9IHt9O1xuXHRcdFx0Xy5lYWNoKGhhbmRsZXIsIGZ1bmN0aW9uKGNoaWxkSWQpe1xuXG5cdFx0XHRcdGlmICghRlJBTUVXT1JLLmNvbXBvbmVudHNbY2hpbGRJZF0pe1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihcblx0XHRcdFx0XHRjb21wb25lbnREZWYuaWQgKyAnIDo6ICcgK1xuXHRcdFx0XHRcdCdUcnlpbmcgdG8gZGVmaW5lL2V4dGVuZCB0aGlzIGNvbXBvbmVudCBmcm9tIGAnICsgY2hpbGRJZCArICdgLCAnICtcblx0XHRcdFx0XHQnYnV0IG5vIGNvbXBvbmVudCB3aXRoIHRoYXQgaWQgY2FuIGJlIGZvdW5kLidcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Xy5leHRlbmQob2JqVG9NZXJnZSwgRlJBTUVXT1JLLmNvbXBvbmVudHNbY2hpbGRJZF0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdF8uZGVmYXVsdHMoY29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZSwgb2JqVG9NZXJnZSk7XG5cdFx0fVxuXHR9KTtcblxuXHQvLyBTYXZlIHByb3RvdHlwZSBpbiBnbG9iYWwgc2V0IGZvciB0cmFja2luZ1xuXHRGUkFNRVdPUksuY29tcG9uZW50c1tjb21wb25lbnREZWYuaWRdID0gY29tcG9uZW50UHJvdG90eXBlO1xufTtcbiIsIi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llc1xuICovXG5cbnZhciBlbDJEZWZhdWx0VGVtcGxhdGVJRCA9IHJlcXVpcmUoJy4uL3V0aWxzL2VsMkRlZmF1bHRUZW1wbGF0ZUlEJyk7XG5cblxuXG5cblxuLyoqXG4gKiBDb2xsZWN0IGFueSBUT1AtTEVWRUwgcmVnaW9ucyB3aXRoIHRoZSBkZWZhdWx0IHRlbXBsYXRlL2NvbXBvbmVudCBzcGVjaWZpZWQgaW4gdGhlIEhUTUxcbiAqXG4gKiBOb3RlOlxuICogVGhpcyBpcyBvbmx5IHJ1biBvbiB0aGUgb3JpZ2luYWwgSFRNTCBwYWdlLCBub3QgaW4gY2xpZW50LXNpZGUgdGVtcGxhdGVzISEhXG4gKiBGb3IgdGhhdCwgc2VlIGBsaWIvY29tcG9uZW50L3JlbmRlclJlZ2lvbnMuanNgLlxuICpcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNvbGxlY3RSZWdpb25zICgpIHtcblxuXG5cdC8vIEdldCB0b3AtbGV2ZWwgcmVnaW9ucy5cblx0dmFyICR0b3BMZXZlbFJlZ2lvbnMgPSAkKCdyZWdpb24sIFtkYXRhLXJlZ2lvbl0nKS5maWx0ZXIoZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuICQodGhpcykucGFyZW50cygncmVnaW9uLCBbZGF0YS1yZWdpb25dJykubGVuZ3RoID09PSAwO1xuXHR9KTtcblxuXG5cdCR0b3BMZXZlbFJlZ2lvbnMuZWFjaChmdW5jdGlvbigpIHtcblx0XHR2YXIgZWwgPSB0aGlzO1xuXHRcdHZhciAkZWwgPSAkKHRoaXMpO1xuXG5cdFx0Ly8gUHJvdmlkZSBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eSBmb3IgbGVnYWN5IG5vdGF0aW9uXG5cdFx0Ly8gKG5vcm1hbGl6ZSB0byBgdGVtcGxhdGVgKVxuXHRcdHZhciBjb21wb25lbnRJZCA9IGVsMkRlZmF1bHRUZW1wbGF0ZUlEKGVsKTtcblxuXHRcdC8vIE5vdyBpbnN0YW50aWF0ZSB0aGUgYXBwcm9wcmlhdGUgZGVmYXVsdCBjb21wb25lbnQgaW4gZWFjaFxuXHRcdC8vIHJlZ2lvbiB3aXRoIGEgc3BlY2lmaWVkIHRlbXBsYXRlL2NvbXBvbmVudFxuXHRcdEZSQU1FV09SSy5SZWdpb24uZnJvbUVsZW1lbnQoZWwpO1xuXHR9KTtcblxufTtcbiIsIi8qKlxuICogTG9hZCBhbnkgc2NyaXB0IHRhZ3Mgb24gdGhlIHBhZ2Ugd2l0aCB0eXBlPVwidGV4dC90ZW1wbGF0ZVwiLlxuICpcbiAqIEByZXR1cm4ge09iamVjdH0gW09iamVjdCBjb25zaXN0aW5nIG9mIGEgdGVtcGxhdGUgaWRlbnRpZmllciBhbmQgaXRzIEhUTUwuXVxuICovXG5cbnZhciBlbDJNYXN0SUQgPSByZXF1aXJlKCcuLi91dGlscy9lbDJNYXN0SUQnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjb2xsZWN0VGVtcGxhdGVzRnJvbVNjcmlwdFRhZ3MoKSB7XG5cdHZhciB0ZW1wbGF0ZXMgPSB7fTtcblxuXHQkKCdzY3JpcHRbdHlwZT1cInRleHQvdGVtcGxhdGVcIl0nKS5lYWNoKGZ1bmN0aW9uIChpLCBlbCkge1xuXHRcdHZhciBpZCA9IGVsMk1hc3RJRChlbCwgdHJ1ZSk7XG5cdFx0dGVtcGxhdGVzW2lkXSA9ICQoZWwpLmh0bWwoKTtcblxuXHRcdC8vIFN0cmlwIHdoaXRlc3BhY2UgbGVmdG92ZXIgZnJvbSBzY3JpcHQgdGFnc1xuXHRcdHRlbXBsYXRlc1tpZF0gPSB0ZW1wbGF0ZXNbaWRdLnJlcGxhY2UoL15cXHMrLywnJyk7XG5cdFx0dGVtcGxhdGVzW2lkXSA9IHRlbXBsYXRlc1tpZF0ucmVwbGFjZSgvXFxzKyQvLCcnKTtcblxuXHRcdC8vIFJlbW92ZSBmcm9tIERPTVxuXHRcdCQoZWwpLnJlbW92ZSgpO1xuXHR9KTtcblxuXHRyZXR1cm4gdGVtcGxhdGVzO1xufTtcbiIsIi8qKlxuICogVGhpcyBpcyB0aGUgc3RhcnRpbmcgcG9pbnQgdG8geW91ciBhcHBsaWNhdGlvbi4gIFlvdSBzaG91bGQgZ3JhYiB0ZW1wbGF0ZXMgYW5kIGNvbXBvbmVudHNcbiAqIGJlZm9yZSBjYWxsaW5nIEZSQU1FV09SSy5yYWlzZSgpIHVzaW5nIHNvbWV0aGluZyBsaWtlIFJlcXVpcmUuanMuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnNcblx0XHRkYXRhOiB7IGF1dGhlbnRpY2F0ZWQ6IGZhbHNlIH0sXG5cdFx0dGVtcGxhdGVzOiB7IGNvbXBvbmVudE5hbWU6IEhUTUxPclByZWNvbXBpbGVkRm4gfSxcblx0XHRjb21wb25lbnRzOiB7IGNvbXBvbmVudE5hbWU6IENvbXBvbmVudERlZmluaXRpb24gfVxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2JcbiAqL1xuXG52YXIgTG9nZ2VyID0gcmVxdWlyZSgnLi4vbG9nZ2VyL2luZGV4Jyk7XG52YXIgYnVpbGRDb21wb25lbnREZWZpbml0aW9uID0gcmVxdWlyZSgnLi4vZGVmaW5lL2J1aWxkRGVmaW5pdGlvbicpO1xudmFyIGJ1aWxkQ29tcG9uZW50UHJvdG90eXBlID0gcmVxdWlyZSgnLi9idWlsZFByb3RvdHlwZScpO1xudmFyIGNvbGxlY3RUZW1wbGF0ZXNGcm9tU2NyaXB0VGFncyA9IHJlcXVpcmUoJy4vY29sbGVjdFRlbXBsYXRlc0Zyb21TY3JpcHRUYWdzJyk7XG52YXIgY29sbGVjdFJlZ2lvbnMgPSByZXF1aXJlKCcuL2NvbGxlY3RSZWdpb25zJyk7XG52YXIgc2V0dXBSb3V0ZXIgPSByZXF1aXJlKCcuLi9yb3V0ZXIvaW5kZXgnKTtcblxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHJhaXNlKG9wdGlvbnMsIGNiKSB7XG5cblx0Ly8gSWYgb25seSBvbmUgYXJnIGlzIHByZXNlbnQsIHVzZSBvcHRpb25zIGFzIGNhbGxiYWNrIGlmIHBvc3NpYmxlLlxuXHQvLyBJZiBvcHRpb25zIGFyZSBub3QgZGVmaW5lZCwgdXNlIGFuIGVtcHR5IG9iamVjdC5cblx0aWYgKCFjYiAmJiBfLmlzRnVuY3Rpb24ob3B0aW9ucykpIHtcblx0XHRjYiA9IG9wdGlvbnM7XG5cdH1cblx0aWYgKCFfLmlzUGxhaW5PYmplY3Qob3B0aW9ucykpIHtcblx0XHRvcHRpb25zID0ge307XG5cdH1cblxuXHQvLyBJbnRlcnByZXQgYHByb2R1Y3Rpb25gIGFzIGBsb2dMZXZlbCA9PT0gJ3NpbGVudCdgXG5cdGlmIChGUkFNRVdPUksub3B0aW9ucy5wcm9kdWN0aW9uKSB7XG5cdFx0RlJBTUVXT1JLLm9wdGlvbnMubG9nTGV2ZWwgPSAnc2lsZW50Jztcblx0fVxuXG5cdC8vIEluaXRpYWxpemUgbG9nZ2VyXG5cdG5ldyBMb2dnZXIoKTtcblxuXHQvLyBNZXJnZSBkYXRhIGludG8gRlJBTUVXT1JLLmRhdGFcblx0Xy5leHRlbmQoRlJBTUVXT1JLLmRhdGEsIG9wdGlvbnMuZGF0YSB8fCB7fSk7XG5cblx0Ly8gTWVyZ2Ugc3BlY2lmaWVkIHRlbXBsYXRlcyB3aXRoIEZSQU1FV09SSy50ZW1wbGF0ZXNcblx0Xy5leHRlbmQoRlJBTUVXT1JLLnRlbXBsYXRlcywgb3B0aW9ucy50ZW1wbGF0ZXMgfHwge30pO1xuXG5cdC8vIElmIEZSQU1FV09SSy5kZWZpbmUoKSB3YXMgdXNlZCwgYnVpbGQgdGhlIGxpc3Qgb2YgY29tcG9uZW50c1xuXHQvLyBJdGVyYXRlIHRocm91Z2ggdGhlIGRlZmluZSBxdWV1ZSBhbmQgY3JlYXRlIGVhY2ggZGVmaW5pdGlvblxuXHRfLmVhY2goRlJBTUVXT1JLLl9kZWZpbmVRdWV1ZSwgYnVpbGRDb21wb25lbnREZWZpbml0aW9uKTtcblxuXHQvLyBNZXJnZSBzcGVjaWZpZWQgY29tcG9uZW50cyB3LyBGUkFNRVdPUksuY29tcG9uZW50c1xuXHRfLmV4dGVuZChGUkFNRVdPUksuY29tcG9uZW50cywgb3B0aW9ucy5jb21wb25lbnRzIHx8IHt9KTtcblxuXHQvLyBCYWNrIHVwIGVhY2ggY29tcG9uZW50IGRlZmluaXRpb24gYmVmb3JlIHRyYW5zZm9ybWluZyBpdCBpbnRvIGEgbGl2ZSBwcm90b3R5cGVcblx0RlJBTUVXT1JLLmNvbXBvbmVudERlZnMgPSBfLmNsb25lKEZSQU1FV09SSy5jb21wb25lbnRzKTtcblxuXHQvLyBSdW4gdGhpcyBjYWxsIGJhY2sgd2hlbiB0aGUgRE9NIGlzIHJlYWR5XG5cdCQoZnVuY3Rpb24gKCkge1xuXG5cdFx0Ly8gQ29sbGVjdCBhbnkgPHNjcmlwdD4gdGFnIHRlbXBsYXRlcyBvbiB0aGUgcGFnZVxuXHRcdC8vIGFuZCBhYnNvcmIgdGhlbSBpbnRvIEZSQU1FV09SSy50ZW1wbGF0ZXNcblx0XHRfLmV4dGVuZChGUkFNRVdPUksudGVtcGxhdGVzLCBjb2xsZWN0VGVtcGxhdGVzRnJvbVNjcmlwdFRhZ3MoKSk7XG5cblx0XHQvLyBCdWlsZCBhY3R1YWwgcHJvdG90eXBlcyBmb3IgdGhlIGNvbXBvbmVudHNcblx0XHQvLyAobmVlZCB0aGUgdGVtcGxhdGVzIGF0IHRoaXMgcG9pbnQgdG8gbWFrZSB0aGlzIHdvcmspXG5cdFx0Xy5lYWNoKEZSQU1FV09SSy5jb21wb25lbnRzLCBidWlsZENvbXBvbmVudFByb3RvdHlwZSk7XG5cblx0XHQvLyBHcmFiIGluaXRpYWwgcmVnaW9ucyBmcm9tIERPTVxuXHRcdGNvbGxlY3RSZWdpb25zKCk7XG5cblx0XHQvLyBCaW5kIGdsb2JhbCBET00gZXZlbnRzIGFzIEZSQU1FV09SSyBldmVudHNcblx0XHQvLyAoZS5nLiAld2luZG93OnJlc2l6ZSlcblx0XHR2YXIgdHJpZ2dlclJlc2l6ZUV2ZW50ID0gXy5kZWJvdW5jZShmdW5jdGlvbiAoKSB7XG5cdFx0XHRGUkFNRVdPUksudHJpZ2dlcignJXdpbmRvdzpyZXNpemUnKTtcblx0XHR9LCBGUkFNRVdPUksub3B0aW9ucy50aHJvdHRsZVdpbmRvd1Jlc2l6ZSB8fCAwKTtcblx0XHQkKHdpbmRvdykucmVzaXplKHRyaWdnZXJSZXNpemVFdmVudCk7XG5cdFx0Ly8gVE9ETzogYWRkIG1vcmUgZXZlbnRzIGFuZCBleHRyYXBvbGF0ZSB0aGlzIGxvZ2ljIHRvIGEgc2VwYXJhdGUgbW9kdWxlXG5cblx0XHQvLyBEbyB0aGUgaW5pdGlhbCByb3V0aW5nIHNlcXVlbmNlXG5cdFx0Ly8gTG9vayBhdCB0aGUgI2ZyYWdtZW50IHVybCBhbmQgZmlyZSB0aGUgZ2xvYmFsIHJvdXRlIGV2ZW50XG5cdFx0c2V0dXBSb3V0ZXIoKTtcblx0XHRGUkFNRVdPUksuaGlzdG9yeS5zdGFydChfLmRlZmF1bHRzKHtcblx0XHRcdHB1c2hTdGF0ZTogdW5kZWZpbmVkLFxuXHRcdFx0aGFzaENoYW5nZTogdW5kZWZpbmVkLFxuXHRcdFx0cm9vdDogdW5kZWZpbmVkXG5cdFx0fSwgb3B0aW9ucykpO1xuXG5cdFx0aWYgKGNiKSBjYigpO1xuXHR9KTtcbn07XG4iLCIvKipcbiAqIEFwcGVuZCBhIGNvbXBvbmVudCB0byB0aGUgZW5kIG9mIGEgcmVnaW9uLiBUaGlzIGNhbGxzIGluc2VydCBhdCB0aGUgbGFzdCBwb3NpdGlvbi5cbiAqXG4gKiBAcGFyYW0gIHtTdHJpbmd9IGNvbXBvbmVudElkIFtUaGUgY29tcG9uZW50IGlkIHRoYXQgd2Ugd2FudCB0byBhcHBlbmRdXG4gKiBAcGFyYW0gIHtPYmplY3R9IHByb3BlcnRpZXMgIFtQcm9wZXJ0aWVzIHRvIGluc3RhbnRpYXRlIHRoZSBjb21wb25lbnQgd2l0aF1cbiAqXG4gKiBAcmV0dXJuIHtDb21wb25lbnR9ICAgICAgICAgIFtOZXdseSBhcHBlbmRlZCBDb21wb25lbnRdXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYXBwZW5kKGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKSB7XG5cdC8vIEluc2VydCBhdCBsYXN0IHBvc2l0aW9uXG5cdHJldHVybiB0aGlzLmluc2VydCh0aGlzLl9jaGlsZHJlbi5sZW5ndGgsIGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKTtcbn07XG4iLCIvKipcbiAqIFNob3J0Y3V0IGZvciBjYWxsaW5nIGVtcHR5KCkgYW5kIHRoZW4gYXBwZW5kKCksXG4gKiBUaGlzIGlzIHRoZSBnZW5lcmFsIHVzZSBjYXNlIGZvciBtYW5hZ2luZyBzdWJjb21wb25lbnRzXG4gKiAoZS5nLiB3aGVuIGEgbmF2YmFyIGl0ZW0gaXMgdG91Y2hlZClcbiAqXG4gKiBAcGFyYW0gIHtTdHJpbmd9IGNvbXBvbmVudCAgW1RoZSBpZCBuYW1lIG9mIHRoZSBjb21wb25ldCB0aGF0IHlvdSB3YW50IHRvIGF0dGFjaF1cbiAqIEBwYXJhbSAge09iamVjdH0gcHJvcGVydGllcyBbUHJvcGVydGllcyB0aGF0IHRoZSBhdHRhY2hlZCBjb21wb25lbnQgd2lsbCBiZSBpbml0YWxpemVkIHdpdGhdXG4gKlxuICogQHJldHVybiB7Q29tcG9uZW50fSBcdFx0XHRcdCBbTmV3bHkgYXR0YWNoZWQgY29tcG9uZW50XVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGF0dGFjaChjb21wb25lbnQsIHByb3BlcnRpZXMpIHtcblx0dGhpcy5lbXB0eSgpO1xuXHRyZXR1cm4gdGhpcy5hcHBlbmQoY29tcG9uZW50LCBwcm9wZXJ0aWVzKTtcbn07XG4iLCIvKipcbiAqIHJlZ2lvbi5lbXB0eSggKVxuICpcbiAqIEl0ZXJhdGUgb3ZlciBlYWNoIGNvbXBvbmVudCBpbiB0aGlzIHJlZ2lvbiBhbmQgY2FsbCAuY2xvc2UoKSBvbiBpdFxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGVtcHR5KCkge1xuXHRGUkFNRVdPUksuZGVidWcodGhpcy5wYXJlbnQuaWQgKyAnIDo6IEVtcHR5aW5nIHJlZ2lvbjogJyArIHRoaXMuaWQpO1xuXHR3aGlsZSAodGhpcy5fY2hpbGRyZW4ubGVuZ3RoID4gMCkge1xuXHRcdHRoaXMucmVtb3ZlKDApO1xuXHR9XG59O1xuIiwiLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzXG4gKi9cbnZhciBlbDJNYXN0SUQgPSByZXF1aXJlKCcuLi91dGlscy9lbDJNYXN0SUQnKSxcblx0ZWwyRGVmYXVsdFRlbXBsYXRlSUQgPSByZXF1aXJlKCcuLi91dGlscy9lbDJEZWZhdWx0VGVtcGxhdGVJRCcpO1xuXG5cblxuLyoqXG4gKiBGYWN0b3J5IG1ldGhvZCB0byBnZW5lcmF0ZSBhIG5ldyByZWdpb24gaW5zdGFuY2UgZnJvbSBhIERPTSBlbGVtZW50XG4gKiBBbHNvIGltcGxlbWVudHMgYHRlbXBsYXRlYCBhbmQgYGNvdW50YCBkaXJlY3RpdmVzLCBhcyB3ZWxsIGFzIHN1cHBvcnRcbiAqIGZvciBlbWJlZGRlZCB0ZW1wbGF0ZXMgYnkgY2hlY2tpbmcgYGVsYCdzIGlubmVySFRNTC5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9uc1xuICogQHJldHVybnMgcmVnaW9uIGluc3RhbmNlXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmcm9tRWxlbWVudChlbCwgcGFyZW50KSB7XG5cblx0Ly8gSWYgcGFyZW50IGlzIG5vdCBzcGVjaWZpZWQsIG1ha2UtYmVsaWV2ZS5cblx0cGFyZW50ID0gcGFyZW50IHx8IHsgaWQ6ICcqJyB9O1xuXG5cdHZhciAkZWwgPSAkKGVsKTtcblxuXG5cdC8vIEJ1aWxkIHJlZ2lvblxuXHR2YXIgcmVnaW9uID0gbmV3IEZSQU1FV09SSy5SZWdpb24oe1xuXHRcdGlkOiBlbDJNYXN0SUQoZWwpLFxuXHRcdCRlbDogJGVsLFxuXHRcdHBhcmVudDogcGFyZW50XG5cdH0pO1xuXG5cdHZhciBlbWJlZGRlZENvbXBvbmVudCA9IHJlZ2lvbi5lbWJlZGRlZENvbXBvbmVudDtcblxuXG5cdC8vIElmIGB0ZW1wbGF0ZWAgc2hvcnRjdXQgaXMgZW5hYmxlZCwgYXBwZW5kIHNwZWNpZmllZCBzdWItY29tcG9uZW50KHMpXG5cdC8vIHRvIHRoZSByZWdpb24gYXV0b21hdGljYWxseVxuXHRpZiAoIEZSQU1FV09SSy5vcHRpb25zLnNob3J0Y3V0LnRlbXBsYXRlICYmIGVtYmVkZGVkQ29tcG9uZW50ICkge1xuXG5cdFx0Ly8gSWYgYGNvdW50YCBpcyBzZXQsIHJlbmRlciBzdWItY29tcG9uZW50IHNwZWNpZmllZCBudW1iZXIgb2YgdGltZXMuXG5cdFx0Ly8gZS5nLiA8cmVnaW9uIHRlbXBsYXRlPVwiRm9vXCIgY291bnQ9XCIzXCIgLz5cblx0XHQvL1xuXHRcdC8vIChOb3RlIHRoYXQgaWYgdGhlIGBjb3VudGAgc2hvcnRjdXQgaXMgZGlzYWJsZWQsIGBjb3VudGAgaXMgYWx3YXlzID0gMSlcblx0XHR2YXIgY291bnQ7XG5cdFx0aWYgKEZSQU1FV09SSy5vcHRpb25zLnNob3J0Y3V0LmNvdW50KSB7XG5cdFx0XHRjb3VudCA9ICh0eXBlb2YgJGVsLmF0dHIoJ2NvdW50JykgIT09ICd1bmRlZmluZWQnKSA/ICRlbC5hdHRyKCdjb3VudCcpIDogMTtcblx0XHR9XG5cblx0XHQvLyBBcHBlbmQgdGhlIHN1YmNvbXBvbmVudCB0aGUgYXBwcm9wcmlhdGUgIyBvZiB0aW1lcy5cblx0XHRmb3IgKHZhciBpPTA7IGkgPCBjb3VudDsgaSsrICkge1xuXHRcdFx0cmVnaW9uLmFwcGVuZChlbWJlZGRlZENvbXBvbmVudCk7XG5cdFx0fVxuXG5cdFx0RlJBTUVXT1JLLmRlYnVnKFxuXHRcdFx0cGFyZW50LmlkICsgJyA6LTogSW5zdGFudGlhdGVkwqBuZXcgcmVnaW9uJyArXG5cdFx0XHQoIHJlZ2lvbi5pZCA/ICcgYCcgKyByZWdpb24uaWQgKyAnYCcgOiAnJyApICtcblx0XHRcdCggZW1iZWRkZWRDb21wb25lbnQgPyAnIGFuZCBwb3B1bGF0ZWQgaXQgd2l0aCcgK1xuXHRcdFx0XHQoIGNvdW50ID4gMSA/IGNvdW50ICsgJyBpbnN0YW5jZXMgb2YnIDogJyAxJyApICtcblx0XHRcdFx0JyBgJyArIGVtYmVkZGVkQ29tcG9uZW50ICsgJ2AnIDogJydcblx0XHRcdCkgKyAnLidcblx0XHQpO1xuXHR9XG5cblx0cmV0dXJuIHJlZ2lvbjtcbn07XG4iLCIvKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXNcbiAqL1xuXG52YXIgaW5zZXJ0ID0gcmVxdWlyZSgnLi9pbnNlcnQnKSxcblx0cmVtb3ZlID0gcmVxdWlyZSgnLi9yZW1vdmUnKSxcblx0ZW1wdHkgPSByZXF1aXJlKCcuL2VtcHR5JyksXG5cdGFwcGVuZCA9IHJlcXVpcmUoJy4vYXBwZW5kJyksXG5cdGF0dGFjaCA9IHJlcXVpcmUoJy4vYXR0YWNoJyksXG5cdHByZXBlbmQgPSByZXF1aXJlKCcuL3ByZXBlbmQnKSxcblx0ZnJvbUVsZW1lbnQgPSByZXF1aXJlKCcuL2Zyb21FbGVtZW50JyksXG5cdGVsMkRlZmF1bHRUZW1wbGF0ZUlEID0gcmVxdWlyZSgnLi4vdXRpbHMvZWwyRGVmYXVsdFRlbXBsYXRlSUQnKTtcblxuXG4vKipcbiAqIEZSQU1FV09SSy5SZWdpb25cbiAqXG4gKiBAcGFyYW0gIHtPYmplY3R9IHByb3BlcnRpZXNcbiAqXG4gKiBAY29uc3RydWN0b3JcbiAqL1xuXG52YXIgUmVnaW9uID0gbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByZWdpb24ocHJvcGVydGllcykge1xuXG5cdF8uZXh0ZW5kKHRoaXMsIEZSQU1FV09SSy5FdmVudHMpO1xuXG5cdGlmICghcHJvcGVydGllcykge1xuXHRcdHByb3BlcnRpZXMgPSB7fTtcblx0fVxuXHRpZiAoIXByb3BlcnRpZXMuJGVsKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdUcnlpbmcgdG8gaW5zdGFudGlhdGUgcmVnaW9uIHdpdGggbm8gJGVsIScpO1xuXHR9XG5cblx0Ly8gRm9sZCBpbiBwcm9wZXJ0aWVzIHRvIHByb3RvdHlwZVxuXHRfLmV4dGVuZCh0aGlzLCBwcm9wZXJ0aWVzKTtcblxuXHQvLyBJZiB0aGUgcmVnaW9uIGhhcyBhIGNvbXBvbmVudC90ZW1wbGF0ZSBpZGVudGlmaWVyLCAoZS5nLiA8cmVnaW9uIHRlbXBsYXRlPVwiRm9vXCIgLz4pXG5cdC8vIHdlJ2xsIHVzZSB0aGF0IGFzIHRoZSBgZW1iZWRkZWRDb21wb25lbnRgLlxuXHR0aGlzLmVtYmVkZGVkQ29tcG9uZW50ID0gZWwyRGVmYXVsdFRlbXBsYXRlSUQodGhpcy4kZWxbMF0pO1xuXG5cdC8vIE5leHQsIGNoZWNrIGlmIHRoZSByZWdpb24gaGFzIGFueSBlbWJlZGRlZCBIVE1MLlxuXHR2YXIgZW1iZWRkZWRUZW1wbGF0ZSA9IHRoaXMuJGVsLmh0bWwoKTtcblxuXHQvLyBUcmltIHdoaXRlc3BhY2UgZnJvbSBlbWJlZGRlZCB0ZW1wbGF0ZSBpbiBjYXNlIGl0IHdhcyBpbmNsdWRlZCBieSBhY2NpZGVudC5cblx0ZW1iZWRkZWRUZW1wbGF0ZSA9IGVtYmVkZGVkVGVtcGxhdGUgJiYgZW1iZWRkZWRUZW1wbGF0ZS5yZXBsYWNlKC9eXFxzKy8sICcnKTtcblx0ZW1iZWRkZWRUZW1wbGF0ZSA9IGVtYmVkZGVkVGVtcGxhdGUgJiYgZW1iZWRkZWRUZW1wbGF0ZS5yZXBsYWNlKC9cXHMrJC8sICcnKTtcblxuXHQvLyBJbnN0YW50aWF0ZSBhbiBhbm9ueW1vdXMgY29tcG9uZW50IGZvciB0aGUgZW1iZWRkZWQgdGVtcGxhdGUuXG5cdGlmIChlbWJlZGRlZFRlbXBsYXRlKSB7XG5cblx0XHQvLyBXaXBlIHRoZSBlbWJlZGRlZCBIVE1MIGZyb20gdGhlIERPTS5cblx0XHQvLyBOT1RFOiB0aGlzIHN0ZXAgY291bGQgYmUgb21pdHRlZCwgYnV0IGxlYXZpbmcgaXQgaW4gbm93IGZvciBzYWZldHkuXG5cdFx0dGhpcy4kZWwuZW1wdHkoKTtcblxuXHRcdC8vIChtYXliZSBsYXRlcikgVE9ETzpcblx0XHQvLyBhbGxvdyBlbWJlZGRlZCB0ZW1wbGF0ZXMgdG8gYmUgbmFtZWQgdGhpcyB3YXksIGUuZy4gYDxyZWdpb24gdGVtcGxhdGU9XCJGb29cIj48L3JlZ2lvbj5gXG5cdFx0Ly8gKHNob3VsZCBiZSB2ZXJ5IGVhc3kpXG5cdFx0Ly9cblx0XHQvLyBpZDogdGhpcy5lbWJlZGRlZENvbXBvbmVudCxcblxuXHRcdC8vIEV4dGVuZCBhIGNvbXBvbmVudCBwcm90b3R5cGUsIHRoZW4gaW5zdGFudGlhdGUgdGhlIGNvbXBvbmVudCxcblx0XHQvLyBidXQgZG9uJ3QgcmVuZGVyIHlldC4gIEl0J3MgYWxyZWFkeSByZW5kZXJlZCwgbW9zdGx5ISAoZXhjZXB0IGZvciBJVFMgcmVnaW9ucylcblx0XHQvLyBXZSdsbCB1c2UgdGhpcyBhbm9ueW1vdXMgY29tcG9uZW50IGluc3RhbmNlIGFzIG91ciBgZW1iZWRkZWRDb21wb25lbnRgIGZvciB0aGlzXG5cdFx0Ly8gcmVnaW9uLlxuXHRcdHRoaXMuZW1iZWRkZWRDb21wb25lbnQgPSBuZXcgKFxuXHRcdFx0RlJBTUVXT1JLLkNvbXBvbmVudC5leHRlbmQoe1xuXHRcdFx0XHR0ZW1wbGF0ZTogZW1iZWRkZWRUZW1wbGF0ZVxuXHRcdFx0fSlcblx0XHQpKHByb3BlcnRpZXMpO1xuXG5cdH1cblxuXHQvLyBJZiBuZWl0aGVyIGFuIGlkIG5vciBhIGB0ZW1wbGF0ZWAgd2FzIHNwZWNpZmllZCxcblx0Ly8gd2UnbGwgdGhyb3cgYW4gZXJyb3IsIHNpbmNlIHRoZXJlJ3Mgbm8gd2F5IHRvIGdldCBhIGhvbGQgb2YgdGhlIHJlZ2lvblxuXHRpZiAoICF0aGlzLmlkICYmICF0aGlzLmVtYmVkZGVkQ29tcG9uZW50ICkge1xuXG5cdFx0dGhyb3cgbmV3IEVycm9yKFxuXHRcdFx0dGhpcy5wYXJlbnQuaWQgKyAnIDo6IEEgcmVnaW9uIGlkZW50aWZpZXIgKGUuZy4gYGRhdGEtcmVnaW9uPVwiZm9vXCJgKSBtYXkgJyArXG5cdFx0XHQnb25seSBiZSBvbWl0dGVkIGlmIGEgZGVmYXVsdCB0ZW1wbGF0ZSBpcyBzcGVjaWZpZWQsIGUuZy46XFxuJyArXG5cdFx0XHQnZS5nLiA8cmVnaW9uIHRlbXBsYXRlPVwiU29tZUNvbXBvbmVudFwiPjwvcmVnaW9uPidcblx0XHQpO1xuXHR9XG5cblx0Ly8gU2V0IHVwIGxpc3QgdG8gaG91c2UgY2hpbGQgY29tcG9uZW50c1xuXHR0aGlzLl9jaGlsZHJlbiA9IFtdO1xuXG5cdF8uYmluZEFsbCh0aGlzKTtcblxuXHQvLyBTZXQgdXAgY29udmVuaWVuY2UgYWNjZXNzIHRvIHRoaXMgcmVnaW9uIGluIHRoZSBnbG9iYWwgcmVnaW9uIGNhY2hlXG5cdEZSQU1FV09SSy5yZWdpb25zW3RoaXMuaWRdID0gdGhpcztcbn07XG5cblJlZ2lvbi5mcm9tRWxlbWVudCA9IGZ1bmN0aW9uKGVsLCBwYXJlbnQpIHtcblx0cmV0dXJuIGZyb21FbGVtZW50KGVsLCBwYXJlbnQpO1xufTtcblJlZ2lvbi5wcm90b3R5cGUucmVtb3ZlID0gZnVuY3Rpb24oYXRJbmRleCkge1xuXHRyZXR1cm4gcmVtb3ZlLmNhbGwodGhpcywgYXRJbmRleCk7XG59O1xuUmVnaW9uLnByb3RvdHlwZS5lbXB0eSA9IGZ1bmN0aW9uKCkge1xuXHRyZXR1cm4gZW1wdHkuY2FsbCh0aGlzKTtcbn07XG5SZWdpb24ucHJvdG90eXBlLmluc2VydCA9IGZ1bmN0aW9uKGF0SW5kZXgsIGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKSB7XG5cdHJldHVybiBpbnNlcnQuY2FsbCh0aGlzLCBhdEluZGV4LCBjb21wb25lbnRJZCwgcHJvcGVydGllcyk7XG59O1xuUmVnaW9uLnByb3RvdHlwZS5hcHBlbmQgPSBmdW5jdGlvbihjb21wb25lbnRJZCwgcHJvcGVydGllcykge1xuXHRyZXR1cm4gYXBwZW5kLmNhbGwodGhpcywgY29tcG9uZW50SWQsIHByb3BlcnRpZXMpO1xufTtcblJlZ2lvbi5wcm90b3R5cGUuYXR0YWNoID0gZnVuY3Rpb24oY29tcG9uZW50LCBwcm9wZXJ0aWVzKSB7XG5cdHJldHVybiBhdHRhY2guY2FsbCh0aGlzLCBjb21wb25lbnQsIHByb3BlcnRpZXMpO1xufTtcblJlZ2lvbi5wcm90b3R5cGUucHJlcGVuZCA9IGZ1bmN0aW9uKGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKSB7XG5cdHJldHVybiBwcmVwZW5kLmNhbGwodGhpcywgY29tcG9uZW50SWQsIHByb3BlcnRpZXMpO1xufTtcbiIsIi8qKlxuICogcmVnaW9uLmluc2VydCggYXRJbmRleCwgY29tcG9uZW50SWQsIFtwcm9wZXJ0aWVzXSApXG4gKlxuICogVE9ETzogc3VwcG9ydCBhIGxpc3Qgb2YgcHJvcGVydGllcyBvYmplY3RzIGluIGxpZXUgb2YgdGhlIHByb3BlcnRpZXMgb2JqZWN0XG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpbnNlcnQoYXRJbmRleCwgY29tcG9uZW50SWQsIHByb3BlcnRpZXMpIHtcblxuXHR2YXIgZXJyID0gJyc7XG5cdGlmICghKGF0SW5kZXggfHwgXy5pc0Zpbml0ZShhdEluZGV4KSkpIHtcblx0XHRlcnIgKz0gdGhpcy5pZCArICcuaW5zZXJ0KCkgOjogTm8gYXRJbmRleCBzcGVjaWZpZWQhJztcblx0fVxuXHRlbHNlIGlmICghY29tcG9uZW50SWQpIHtcblx0XHRlcnIgKz0gdGhpcy5pZCArICcuaW5zZXJ0KCkgOjogTm8gY29tcG9uZW50SWQgc3BlY2lmaWVkISc7XG5cdH1cblx0aWYgKGVycikge1xuXHRcdHRocm93IG5ldyBFcnJvcihlcnIgKyAnXFxuVXNhZ2U6IGluc2VydChhdEluZGV4LCBjb21wb25lbnRJZCwgW3Byb3BlcnRpZXNdKScpO1xuXHR9XG5cblx0dmFyIGNvbXBvbmVudDtcblx0Ly8gSWYgY29tcG9uZW50SWQgaXMgYSBzdHJpbmcsIGxvb2sgdXAgY29tcG9uZW50IHByb3RvdHlwZSBhbmQgaW5zdGF0aWF0ZVxuXHRpZiAoJ3N0cmluZycgPT0gdHlwZW9mIGNvbXBvbmVudElkKSB7XG5cblx0XHR2YXIgY29tcG9uZW50UHJvdG90eXBlID0gRlJBTUVXT1JLLmNvbXBvbmVudHNbY29tcG9uZW50SWRdO1xuXG5cdFx0aWYgKCFjb21wb25lbnRQcm90b3R5cGUpIHtcblx0XHRcdHZhciB0ZW1wbGF0ZSA9IEZSQU1FV09SSy50ZW1wbGF0ZXNbY29tcG9uZW50SWRdO1xuXHRcdFx0aWYgKCF0ZW1wbGF0ZSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IgKCdJbiAnICtcblx0XHRcdFx0XHQodGhpcy5pZCB8fCAnQW5vbnltb3VzIHJlZ2lvbicpICsgJzo6IFRyeWluZyB0byBpbnNlcnQgJyArXG5cdFx0XHRcdFx0Y29tcG9uZW50SWQgKyAnLCBidXQgbm8gdGVtcGxhdGUgZXhpc3RzIHdpdGggdGhhdCBpZC4nKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSWYgbm8gY29tcG9uZW50IHByb3RvdHlwZSBleGlzdHMgZm9yIHRoZSB0ZW1wbGF0ZVxuXHRcdFx0Ly8gd2l0aCB0aGUgc3BlY2lmaWZlZCBpZCwgY3JlYXRlIGEgc3R1YiBvbmUgb24gdGhlIGZseS5cblx0XHRcdGNvbXBvbmVudFByb3RvdHlwZSA9IEZSQU1FV09SSy5Db21wb25lbnQuZXh0ZW5kKHtcblx0XHRcdFx0aWQ6IGNvbXBvbmVudElkLFxuXHRcdFx0XHR0ZW1wbGF0ZTogdGVtcGxhdGVcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIEluc3RhbnRpYXRlIGFuZCByZW5kZXIgdGhlIGNvbXBvbmVudCBpbnNpZGUgdGhpcyByZWdpb25cblx0XHRjb21wb25lbnQgPSBuZXcgY29tcG9uZW50UHJvdG90eXBlKF8uZXh0ZW5kKHtcblx0XHRcdCRvdXRsZXQ6IHRoaXMuJGVsXG5cdFx0fSwgcHJvcGVydGllcyB8fCB7fSkpO1xuXG5cblx0fVxuXG5cdC8vIE90aGVyd2lzZSBhc3N1bWUgYW4gaW5zdGFudGlhdGVkIGNvbXBvbmVudCBvYmplY3Qgd2FzIHNlbnRcblx0LyogVE9ETzogQ2hlY2sgdGhhdCBjb21wb25lbnQgb2JqZWN0IGlzIHZhbGlkICovXG5cdGVsc2Uge1xuXHRcdGNvbXBvbmVudCA9IGNvbXBvbmVudElkO1xuXHRcdGNvbXBvbmVudC4kb3V0bGV0ID0gdGhpcy4kZWw7XG5cdH1cblxuXHQvLyBTYXZlIHJlZmVyZW5jZSB0byBwYXJlbnRSZWdpb25cblx0Y29tcG9uZW50LnBhcmVudFJlZ2lvbiA9IHRoaXM7XG5cblx0Ly8gQ2hlY2sgdG8gc2VlIGlmIHRoZSBtb2RlbCB3YXMgYWxyZWFkeSBkZWZpbmVkLiBJZiBpdCBpcywgdXNlIHRoYXQgbW9kZWwuIElmIG5vdCwgYXNzaWduIGl0XG5cdC8vIHRoZSBwYXJlbnRzIG1vZGVsIGlmIGl0IGhhcyBvbmUsIG9yIGFzc2lnbiBpdCBhIG5ldyBiYWNrYm9uZSBpbnN0YW5jZS5cblx0aWYgKCFjb21wb25lbnQubW9kZWwpIHtcblx0XHRjb21wb25lbnQubW9kZWwgPSB0aGlzLnBhcmVudC5tb2RlbCA/IHRoaXMucGFyZW50Lm1vZGVsIDogbmV3IEJhY2tib25lLk1vZGVsKCk7XG5cdH1cblxuXHQvLyBSZW5kZXIgY29tcG9uZW50IGludG8gdGhpcyByZWdpb25cblx0Y29tcG9uZW50LnJlbmRlcihhdEluZGV4KTtcblxuXHQvLyBBbmQga2VlcCB0cmFjayBvZiBpdCBpbiB0aGUgbGlzdCBvZiB0aGlzIHJlZ2lvbidzIGNoaWxkcmVuXG5cdHRoaXMuX2NoaWxkcmVuLnNwbGljZShhdEluZGV4LCAwLCBjb21wb25lbnQpO1xuXG5cdC8vIExvZyBmb3IgZGVidWdnaW5nIGBjb3VudGAgZGVjbGFyYXRpdmVcblx0dmFyIGRlYnVnU3RyID0gdGhpcy5wYXJlbnQuaWQgKyAnIDo6IEluc2VydGVkICcgKyBjb21wb25lbnRJZCArICcgaW50byAnO1xuXHRpZiAodGhpcy5pZCkgZGVidWdTdHIgKz0gJ3JlZ2lvbjogJyArIHRoaXMuaWQgKyAnIGF0IGluZGV4ICcgKyBhdEluZGV4O1xuXHRlbHNlIGRlYnVnU3RyICs9ICdhbm9ueW1vdXMgcmVnaW9uIGF0IGluZGV4ICcgKyBhdEluZGV4O1xuXHRGUkFNRVdPUksudmVyYm9zZShkZWJ1Z1N0cik7XG5cblx0cmV0dXJuIGNvbXBvbmVudDtcblxufTtcbiIsIi8qKlxuICogUHJlcGVuZCBhIGNvbXBvbmVudCB0byB0aGUgYmVnaW5uaW5nIG9mIGEgcmVnaW9uLiBUaGlzIGNhbGxzIGluc2VydCBhdCB0aGUgZmlyc3QgcG9zaXRpb24uXG4gKlxuICogQHBhcmFtICB7U3RyaW5nfSBjb21wb25lbnRJZCBbVGhlIGNvbXBvbmVudCBpZCB0aGF0IHdlIHdhbnQgdG8gcHJlcGVuZCBdXG4gKiBAcGFyYW0gIHtPYmplY3R9IHByb3BlcnRpZXMgIFtQcm9wZXJ0aWVzIHRvIGluc3RhbnRpYXRlIHRoZSBjb21wb25lbnQgd2l0aF1cbiAqXG4gKiBAcmV0dXJuIHtDb21wb25lbnR9ICAgICAgICAgIFtOZXdseSBwcmVwZW5kZWQgQ29tcG9uZW50XVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHByZXBlbmQoY29tcG9uZW50SWQsIHByb3BlcnRpZXMpIHtcblx0Ly8gSW5zZXJ0IGF0IGxhc3QgcG9zaXRpb25cblx0cmV0dXJuIHRoaXMuaW5zZXJ0KDAsIGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKTtcbn07XG4iLCIvKipcbiAqIHJlZ2lvbi5yZW1vdmUoIGF0SW5kZXggKVxuICpcbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByZW1vdmUoYXRJbmRleCkge1xuXG5cdGlmICghYXRJbmRleCAmJiAhXy5pc0Zpbml0ZShhdEluZGV4KSkge1xuXHRcdHRocm93IG5ldyBFcnJvcih0aGlzLmlkICsgJy5yZW1vdmUoKSA6OiBObyBhdEluZGV4IHNwZWNpZmllZCEgXFxuVXNhZ2U6IHJlbW92ZShhdEluZGV4KScpO1xuXHR9XG5cblx0Ly8gUmVtb3ZlIHRoZSBjb21wb25lbnQgZnJvbSB0aGUgbGlzdFxuXHR2YXIgY29tcG9uZW50ID0gdGhpcy5fY2hpbGRyZW4uc3BsaWNlKGF0SW5kZXgsIDEpO1xuXHRpZiAoIWNvbXBvbmVudFswXSkge1xuXG5cdFx0Ly8gSWYgdGhlIGxpc3QgaXMgZW1wdHksIGZyZWFrIG91dFxuXHRcdHRocm93IG5ldyBFcnJvcih0aGlzLmlkICsgJy5yZW1vdmUoKSA6OiBUcnlpbmcgdG8gcmVtb3ZlIGEgY29tcG9uZW50IHRoYXQgZG9lc25cXCd0IGV4aXN0IGF0IGluZGV4ICcgKyBhdEluZGV4KTtcblx0fVxuXG5cdC8vIFNxdWVlemUgdGhlIGNvbXBvbmVudCB0byBkbyBnZXQgYWxsIHRoZSBiaW5keSBnb29kbmVzcyBvdXRcblx0Y29tcG9uZW50WzBdLmNsb3NlKCk7XG5cblx0RlJBTUVXT1JLLmRlYnVnKHRoaXMucGFyZW50LmlkICsgJyA6OiBSZW1vdmVkIGNvbXBvbmVudCBhdCBpbmRleCAnICsgYXRJbmRleCArICcgZnJvbSByZWdpb246ICcgKyB0aGlzLmlkKTtcbn07XG4iLCIvKipcbiAqIFNldHMgdXAgdGhlIEZSQU1FV09SSyByb3V0ZXIuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcm91dGVyU2V0dXAoKSB7XG5cblx0Ly8gV2lsZGNhcmQgcm91dGVzIHRvIGdsb2JhbCBldmVudCBkZWxlZ2F0b3Jcblx0dmFyIHJvdXRlciA9IG5ldyBGUkFNRVdPUksuUm91dGVyKCk7XG5cdHJvdXRlci5yb3V0ZSgvKC4qKS8sICdyb3V0ZScsIGZ1bmN0aW9uIChyb3V0ZSkge1xuXG5cdFx0Ly8gTm9ybWFsaXplIGhvbWUgcm91dGVzICgjIG9yIG51bGwpIHRvICcnXG5cdFx0aWYgKCFyb3V0ZSkge1xuXHRcdFx0cm91dGUgPSAnJztcblx0XHR9XG5cblx0XHQvLyBUcmlnZ2VyIHJvdXRlXG5cdFx0RlJBTUVXT1JLLnRyaWdnZXIoJyMnICsgcm91dGUpO1xuXHR9KTtcblxuXHQvLyBFeHBvc2UgYG5hdmlnYXRlKClgIG1ldGhvZFxuXHRGUkFNRVdPUksubmF2aWdhdGUgPSBGUkFNRVdPUksuaGlzdG9yeS5uYXZpZ2F0ZTtcbn1cbiIsIi8qKlxuICogQmFyZS1ib25lcyBET00vVUkgdXRpbGl0aWVzXG4gKi9cblxudmFyIEV2ZW50cyA9IHJlcXVpcmUoJy4vZXZlbnRzJyk7XG5cbnZhciBET00gPSB7XG5cblx0LyoqXG5cdCAqIEV4cG9zZSB0aGUgXCJET01teS1ldmVudGVkbmVzc1wiIG9mIGVsZW1lbnRzIHNvIHRoYXQgaXQncyBzZWxlY3RhYmxlIHZpYSBDU1Ncblx0ICogWW91IGNhbiB1c2UgdGhpcyB0byBhcHBseSBhIGZldyBjaG9pY2UgRE9NIG1vZGlmaWNhdGlvbnMgb3V0IHRoZSBnYXRlLS1cblx0ICogKGUuZy4gdHdlYWtzIHRhcmdldGluZyBjb21tb24gaXNzdWVzIHRoYXQgdHlwaWNhbGx5IGdldCBmb3Jnb3R0ZW4sIGxpa2UgZGlzYWJsaW5nIHRleHQgc2VsZWN0aW9uKVxuXHQgKlxuXHQgKiBAcGFyYW0ge0NvbXBvbmVudH0gY29tcG9uZW50XG5cdCAqL1xuXHRmbGFnQm91bmRFdmVudHM6IGZ1bmN0aW9uICggY29tcG9uZW50ICkge1xuXG5cdFx0Ly8gVE9ETzogcHJvdmlkZSBhY2Nlc3MgdG8gYm91bmQgZ2xvYmFsIGV2ZW50cyAoJSkgYW5kIHJvdXRlcyAoIykgYXMgd2VsbFxuXHRcdC8vIFRPRE86IGZsYWcgYWxsIERPTSBldmVudHMsIG5vdCBqdXN0IGNsaWNrIGFuZCB0b3VjaFxuXG5cdFx0Ly8gQnVpbGQgc3Vic2V0IG9mIGp1c3QgdGhlIGNsaWNrL3RvdWNoIGV2ZW50c1xuXHRcdHZhciBjbGlja09yVG91Y2hFdmVudHMgPSBFdmVudHMucGFyc2UoXG5cdFx0XHRjb21wb25lbnQuZXZlbnRzLFxuXHRcdFx0eyBvbmx5OiBbJ2NsaWNrJywgJ3RvdWNoJywgJ3RvdWNoc3RhcnQnLCAndG91Y2hlbmQnXSB9XG5cdFx0KTtcblxuXHRcdC8vIElmIG5vIGNsaWNrL3RvdWNoIGV2ZW50cyBmb3VuZCwgYmFpbCBvdXRcblx0XHRpZiAoIGNsaWNrT3JUb3VjaEV2ZW50cy5sZW5ndGggPCAxICkgcmV0dXJuO1xuXG5cdFx0Ly8gUXVlcnkgYWZmZWN0ZWQgZWxlbWVudHMgZnJvbSBET01cblx0XHR2YXIgJGFmZmVjdGVkID0gRXZlbnRzLmdldEVsZW1lbnRzKGNsaWNrT3JUb3VjaEV2ZW50cywgY29tcG9uZW50KTtcblxuXHRcdC8vIE5PVEU6IEZvciBub3csIHRoaXMgaXMgYWx3YXlzIGp1c3QgJ2NsaWNrJ1xuXHRcdHZhciBib3VuZEV2ZW50c1N0cmluZyA9ICdjbGljayc7XG5cblx0XHQvLyBTZXQgYGRhdGEtRlJBTUVXT1JLLWNsaWNrYWJsZWAgY3VzdG9tIGF0dHJpYnV0ZVxuXHRcdC8vICh1aSBsb2dpYyBzaG91bGQgYmUgZXh0ZW5kZWQgaW4gQ1NTKVxuXHRcdCRhZmZlY3RlZC5hdHRyKCdkYXRhLScgKyBGUkFNRVdPUksub3B0aW9ucy5mcmFtZXdvcmtJZCArICctZXZlbnRzJywgYm91bmRFdmVudHNTdHJpbmcpO1xuXG5cdFx0RlJBTUVXT1JLLnZlcmJvc2UoXG5cdFx0XHRjb21wb25lbnQuaWQgKyAnIDo6ICcgK1xuXHRcdFx0J0Rpc2FibGVkIHVzZXIgdGV4dCBzZWxlY3Rpb24gb24gZWxlbWVudHMgdy8gY2xpY2svdG91Y2ggZXZlbnRzOicsXG5cdFx0XHRjbGlja09yVG91Y2hFdmVudHMsXG5cdFx0XHQkYWZmZWN0ZWRcblx0XHQpO1xuXHR9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IERPTTtcbiIsIi8qKlxuICogSW5zcGVjdCBhIERPTSBlbGVtZW50IGFuZCBzZWUgaWYgaXQgaGFzIGEgZGVmYXVsdCBjb21wb25lbnQvdGVtcGxhdGUgSUQuXG4gKiBQcm92aWRlcyBiYWNrd2FyZHMtY29tcGF0aWJpbGl0eSBsYXllciwgYW5kIG5vcm1hbGl6ZXMgdGhlIHN5bnRheCBpbiB0aGUgRE9NLlxuICpcbiAqIEBwYXJhbSAge0RPTUVsZW1lbnR9IGVsXG4gKiBAcmV0dXJuIHtTdHJpbmd9ICAgIFt0aGUgaWQgb2YgdGhlIGRlZmF1bHQgY29tcG9uZW50L3RlbXBsYXRlLCBpZiBvbmUgd2FzIHNwZWNpZmllZF1cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoZWwpIHtcblxuXHQvLyBQcm92aWRlIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5IGZvclxuXHQvLyBgZGVmYXVsdGAsIGBjb250ZW50c2AgYW5kIGB0ZW1wbGF0ZWAgbm90YXRpb25cblx0dmFyIGNvbXBvbmVudElkID0gJChlbCkuYXR0cigndGVtcGxhdGUnKSB8fCAkKGVsKS5hdHRyKCdkZWZhdWx0JykgfHwgJChlbCkuYXR0cignY29udGVudHMnKTtcblxuXHQvLyBOb3JtYWxpemUgdG8gYHRlbXBsYXRlYCBhdHRyaWJ1dGUgaW4gdGhlIERPTS5cblx0JChlbCkuYXR0cigndGVtcGxhdGUnLCBjb21wb25lbnRJZCk7XG5cblx0cmV0dXJuIGNvbXBvbmVudElkO1xufTtcbiIsIi8qKlxuICogR3JhYnMgdGhlIE1hc3QgaWRlbnRpZmllciBmcm9tIGFuIEhUTUwgZWxlbWVudC5cbiAqIFN1cHBvcnRzIGBpZGAsIGBkYXRhLWlkYCwgb3IgYGRhdGEtcmVnaW9uYFxuICpcbiAqIEBwYXJhbSAge0RPTUVsZW1lbnR9IGVsICAgIFt0aGUgRE9NIGVsZW1lbnQgdG8gaW5zcGVjdF1cbiAqIEBwYXJhbSAge0Jvb2xlYW59IHJlcXVpcmVkIFt3aGV0aGVyIGFuIGlkZW50aWZpZXIgaXMgcmVxdWlyZWRdXG4gKlxuICogQHJldHVybiB7U3RyaW5nfSAgICAgICAgICAgW2lkZW50aWZpZXJdXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBlbDJNYXN0SUQgKGVsLCByZXF1aXJlZCkge1xuXG5cdHZhciBpZCA9ICQoZWwpLmF0dHIoJ2lkJyk7XG5cdHZhciBkYXRhSWQgPSAkKGVsKS5hdHRyKCdkYXRhLWlkJykgfHwgJChlbCkuYXR0cignZGF0YS1yZWdpb24nKTtcblx0dmFyIGNvbnRlbnRzSWQgPSAkKGVsKS5hdHRyKCdjb250ZW50cycpO1xuXG5cdGlmIChpZCAmJiBkYXRhSWQpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoaWQgKyAnIDo6IENhbm5vdCBzZXQgYm90aCBgaWRgIGFuZCBgZGF0YS1pZGAhICBQbGVhc2UgdXNlIG9uZSBvciB0aGUgb3RoZXIuICAoZGF0YS1pZCBpcyBzYWZlc3QpJyk7XG5cdH1cblx0aWYgKHJlcXVpcmVkICYmICFpZCAmJiAhZGF0YUlkKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdObyBpZCBzcGVjaWZpZWQgaW4gZWxlbWVudCB3aGVyZSBpdCBpcyByZXF1aXJlZDpcXG4nICsgZWwpO1xuXHR9XG5cblx0cmV0dXJuIGlkIHx8IGRhdGFJZCB8fCBjb250ZW50c0lkO1xufTtcbiIsIi8qKlxuICogVXRpbGl0eSBFdmVudCB0b29sa2l0XG4gKi9cblxudmFyIEV2ZW50cyA9IHtcblxuXHQvKipcblx0ICogUGFyc2VzIGEgZGljdGlvbmFyeSBvZiBldmVudHMgYW5kIG9wdGlvbmFsbHkgZmlsdGVycyBieSB0aGUgZXZlbnQgdHlwZS4gSWYgdGhlIGV2ZW50XG5cdCAqXG5cdCAqIEBwYXJhbSAge09iamVjdH0gZXZlbnRzICBbQSBCYWNrYm9uZS5WaWV3IGV2ZW50cyBvYmplY3RdXG5cdCAqIEBwYXJhbSAge09iamVjdH0gb3B0aW9ucyBbT3B0aW9ucyBvYmplY3QgdGhhdCBhbGxvd3MgdXMgdG8gZmlsdGVyIHBhcnNpbmcgdG8gY2VydGFpbiBldmVudFxuXHQgKiAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWVzXVxuXHQgKlxuXHQgKiBAcmV0dXJuIHtBcnJheX0gICAgICAgICAgW0FycmF5IGNvbnRhaW5pbmcgcGFyc2VkRXZlbnRzIHRoYXQgYXJlIG1hdGNoaW5nIGV2ZW50IGtleXNdXG5cdCAqL1xuXHRwYXJzZTogZnVuY3Rpb24gKGV2ZW50cywgb3B0aW9ucykge1xuXG5cdFx0dmFyIGV2ZW50S2V5cyA9IF8ua2V5cyhldmVudHMgfHwge30pLFxuXHRcdFx0bGltaXRFdmVudHMsXG5cdFx0XHRwYXJzZWRFdmVudHMgPSBbXTtcblxuXHRcdC8vIE9wdGlvbmFsbHkgZmlsdGVyIHVzaW5nIHNldCBvZiBhY2NlcHRhYmxlIGV2ZW50IHR5cGVzXG5cdFx0bGltaXRFdmVudHMgPSBvcHRpb25zLm9ubHk7XG5cdFx0ZXZlbnRLZXlzID0gXy5maWx0ZXIoZXZlbnRLZXlzLCBmdW5jdGlvbiBjaGVja0V2ZW50TmFtZSAoZXZlbnRLZXkpIHtcblxuXHRcdFx0Ly8gUGFyc2UgZXZlbnQgc3RyaW5nIGludG8gc2VtYW50aWMgcmVwcmVzZW50YXRpb25cblx0XHRcdHZhciBldmVudCA9IEV2ZW50cy5wYXJzZURPTUV2ZW50KGV2ZW50S2V5KTtcblx0XHRcdHBhcnNlZEV2ZW50cy5wdXNoKGV2ZW50KTtcblxuXHRcdFx0Ly8gT3B0aW9uYWwgZmlsdGVyXG5cdFx0XHRpZiAobGltaXRFdmVudHMpIHtcblx0XHRcdFx0cmV0dXJuIF8uY29udGFpbnMobGltaXRFdmVudHMsIGV2ZW50Lm5hbWUpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gcGFyc2VkRXZlbnRzO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBbZ2V0RWxlbWVudHMgZGVzY3JpcHRpb25dXG5cdCAqXG5cdCAqIEBwYXJhbSAge0FycmF5fSBzZW1hbnRpY0V2ZW50cyBbQSBsaXN0IG9mIHBhcnNlZCBldmVudCBvYmplY3RzXVxuXHQgKiBAcGFyYW0gIHtDb21wb25lbnR9IGNvbnRleHQgICAgW0luc3RhbmNlIG9mIGEgY29tcG9uZW50IHRvIHVzZSBhcyBhIHN0YXJ0aW5nIHBvaW50IGZvclxuXHQgKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoZSBET00gcXVlcmllc11cblx0ICpcblx0ICogQHJldHVybiB7QXJyYXl9ICAgICAgICAgICAgICAgIFtBbiBhcnJheSBvZiBqUXVlcnkgc2V0IG9mIG1hdGNoZWQgZWxlbWVudHNdXG5cdCAqL1xuXHRnZXRFbGVtZW50czogZnVuY3Rpb24gKHNlbWFudGljRXZlbnRzLCBjb250ZXh0KSB7XG5cblx0XHQvLyBDb250ZXh0IG9wdGlvbmFsXG5cdFx0Y29udGV4dCA9IGNvbnRleHQgfHwgeyAkOiAkIH07XG5cblx0XHQvLyBJdGVyYXRpdmVseSBidWlsZCBhIHNldCBvZiBhZmZlY3RlZCBlbGVtZW50c1xuXHRcdHZhciAkYWZmZWN0ZWQgPSAkKCk7XG5cdFx0Xy5lYWNoKHNlbWFudGljRXZlbnRzLCBmdW5jdGlvbiBsb29rdXBFbGVtZW50c0ZvckV2ZW50IChldmVudCkge1xuXG5cdFx0XHQvLyBEZXRlcm1pbmUgbWF0Y2hlZCBlbGVtZW50c1xuXHRcdFx0Ly8gVXNlIGRlbGVnYXRlIHNlbGVjdG9yIGlmIHNwZWNpZmllZFxuXHRcdFx0Ly8gT3RoZXJ3aXNlLCBncmFiIHRoZSBlbGVtZW50IGZvciB0aGlzIGNvbXBvbmVudFxuXHRcdFx0dmFyICRtYXRjaGVkID1cdGV2ZW50LnNlbGVjdG9yID9cblx0XHRcdFx0XHRcdFx0Y29udGV4dC4kKGV2ZW50LnNlbGVjdG9yKSA6XG5cdFx0XHRcdFx0XHRcdGNvbnRleHQuJGVsO1xuXG5cdFx0XHQvLyBBZGQgbWF0Y2hlZCBlbGVtZW50cyB0byBzZXRcblx0XHRcdCRhZmZlY3RlZCA9ICRhZmZlY3RlZC5hZGQoICRtYXRjaGVkICk7XG5cdFx0fSwgdGhpcyk7XG5cblx0XHRyZXR1cm4gJGFmZmVjdGVkO1xuXHR9LFxuXG5cblxuXHQvKipcblx0ICogUmV0dXJucyB3aGV0aGVyIHRoZSBzcGVjaWZpZWQgZXZlbnQga2V5IG1hdGNoZXMgYSBET00gZXZlbnQuXG5cdCAqXG5cdCAqIEBwYXJhbSAge1N0cmluZ30ga2V5IFtLZXkgdG8gbWF0Y2ggYWdhaW5zdF1cblx0ICpcblx0ICogaWYgbm8gbWF0Y2ggaXMgZm91bmRcblx0ICogQHJldHVybiB7Qm9vbGVhbn0gXHRcdFtyZXR1cm4gYGZhbHNlYF1cblx0ICpcblx0ICogb3RoZXJ3aXNlXG5cdCAqIEByZXR1cm4ge09iamVjdH0gIFx0XHRbT2JqZWN0IGNvbnRhaW5pbmcgdGhlIGBuYW1lYCBvZiB0aGUgRE9NIGVsZW1lbnQgYW5kIHRoZSBgc2VsZWN0b3JgXVxuXHQgKi9cblx0cGFyc2VET01FdmVudDogXy5tZW1vaXplKGZ1bmN0aW9uKGtleSkge1xuXG5cdFx0dmFyIG1hdGNoZXMgPSBrZXkubWF0Y2godGhpc1snL0RPTUV2ZW50LyddKTtcblxuXHRcdGlmICghbWF0Y2hlcyB8fCAhbWF0Y2hlc1sxXSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRuYW1lOiBtYXRjaGVzWzFdLFxuXHRcdFx0c2VsZWN0b3I6IG1hdGNoZXNbM11cblx0XHR9O1xuXHR9KSxcblxuXG5cdC8qKlxuXHQgKiBTdXBwb3J0ZWQgXCJmaXJzdC1jbGFzc1wiIERPTSBldmVudHMuXG5cdCAqIEB0eXBlIHtBcnJheX1cblx0ICovXG5cdG5hbWVzOiBbXG5cblx0XHQvLyBMb2NhbGl6ZWQgYnJvd3NlciBldmVudHNcblx0XHQvLyAod29ya3Mgb24gaW5kaXZpZHVhbCBlbGVtZW50cylcblx0XHQnZXJyb3InLCAnc2Nyb2xsJyxcblxuXHRcdC8vIE1vdXNlIGV2ZW50c1xuXHRcdCdjbGljaycsICdkYmxjbGljaycsICdtb3VzZWRvd24nLCAnbW91c2V1cCcsICdob3ZlcicsICdtb3VzZWVudGVyJywgJ21vdXNlbGVhdmUnLFxuXHRcdCdtb3VzZW92ZXInLCAnbW91c2VvdXQnLCAnbW91c2Vtb3ZlJyxcblxuXHRcdC8vIEtleWJvYXJkIGV2ZW50c1xuXHRcdCdrZXlkb3duJywgJ2tleXVwJywgJ2tleXByZXNzJyxcblxuXHRcdC8vIEZvcm0gZXZlbnRzXG5cdFx0J2JsdXInLCAnY2hhbmdlJywgJ2ZvY3VzJywgJ2ZvY3VzaW4nLCAnZm9jdXNvdXQnLCAnc2VsZWN0JywgJ3N1Ym1pdCcsXG5cblx0XHQvLyBSYXcgdG91Y2ggZXZlbnRzXG5cdFx0J3RvdWNoc3RhcnQnLCAndG91Y2hlbmQnLCAndG91Y2htb3ZlJywgJ3RvdWNoY2FuY2VsJyxcblxuXHRcdC8vIE1hbnVmYWN0dXJlZCBldmVudHNcblx0XHQndG91Y2gnLFxuXG5cdFx0Ly8gVE9ETzpcblx0XHQncmlnaHRjbGljaycsICdjbGlja291dHNpZGUnXG5cdF1cbn07XG5cblxuXG5cbi8qKlxuICogUmVnZXhwIHRvIG1hdGNoIFwiZmlyc3QgY2xhc3NcIiBET00gZXZlbnRzXG4gKiAodGhlc2UgYXJlIGFsbG93ZWQgaW4gdGhlIHRvcCBsZXZlbCBvZiBhIGNvbXBvbmVudCBkZWZpbml0aW9uIGFzIG1ldGhvZCBrZXlzKVxuICpcdFx0aS5lLiAvXihjbGlja3xob3ZlcnxibHVyfGZvY3VzKSggKC4rKSkvXG4gKlx0XHRcdFsxXSA9PiBldmVudCBuYW1lXG4gKlx0XHRcdFszXSA9PiBzZWxlY3RvclxuICovXG5cbkV2ZW50c1snL0RPTUV2ZW50LyddID0gbmV3IFJlZ0V4cCgnXignICsgXy5yZWR1Y2UoRXZlbnRzLm5hbWVzLFxuXHRmdW5jdGlvbiBidWlsZFJlZ2V4cChtZW1vLCBldmVudE5hbWUsIGluZGV4KSB7XG5cblx0XHQvLyBPbWl0IGB8YCB0aGUgZmlyc3QgdGltZVxuXHRcdGlmIChpbmRleCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIG1lbW8gKyBldmVudE5hbWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG1lbW8gKyAnfCcgKyBldmVudE5hbWU7XG5cdH0sICcnKSArXG4nKSggKC4rKSk/JCcpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEV2ZW50cztcbiIsIi8qKlxuICogTWFwIGFuIG9iamVjdCdzIHZhbHVlcywgYW5kIHJldHVybiBhIHZhbGlkIG9iamVjdCAodGhpcyBmdW5jdGlvbiBpcyBoYW5keSBiZWNhdXNlXG4gKiB1bmRlcnNjb3JlLm1hcCgpIHJldHVybnMgYSBsaXN0LCBub3QgYW4gb2JqZWN0LilcbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqICAgICAgICAgICAgW09iamVjdCB3aG9zIHZhbHVlcyB5b3Ugd2FudCB0byBtYXBdXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gdHJhbnNmb3JtRm4gW0Z1bmN0aW9uIHRvIHRyYW5zZm9ybSBlYWNoIG9iamVjdCB2YWx1ZSBieV1cbiAqXG4gKiBAcmV0dXJuIHtPYmplY3R9ICAgICAgICAgICAgICAgIFtOZXcgb2JqZWN0IHdpdGggdGhlIHZhbHVlcyBtYXBwZWRdXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBvYmpNYXAob2JqLCB0cmFuc2Zvcm1Gbikge1xuXHRyZXR1cm4gXy5vYmplY3QoXy5rZXlzKG9iaiksIF8ubWFwKG9iaiwgdHJhbnNmb3JtRm4pKTtcbn07XG5cbiIsIi8qKlxuICogVHJhbnNsYXRlICoqcmlnaHQtaGFuZC1zaWRlIGFiYnJldmlhdGlvbnMqKiBpbnRvIGZ1bmN0aW9ucyB0aGF0IHBlcmZvcm1cbiAqIHRoZSBwcm9wZXIgYmVoYXZpb3JzLCBlLmcuXG4gKlx0XHQjYWJvdXRfbWVcbiAqXHRcdCVtYWluTWVudTpvcGVuXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB0cmFuc2xhdGVTaG9ydGhhbmQodmFsdWUsIGtleSkge1xuXG5cdHZhciBtYXRjaGVzLCBmbjtcblxuXHQvLyBJZiB0aGlzIGlzIGFuIGltcG9ydGFudCwgRlJBTUVXT1JLLXNwZWNpZmljIGRhdGEga2V5LFxuXHQvLyBhbmQgYSBmdW5jdGlvbiB3YXMgc3BlY2lmaWVkLCBydW4gaXQgdG8gZ2V0IGl0cyB2YWx1ZVxuXHQvLyAodGhpcyBpcyB0byBrZWVwIHBhcml0eSB3aXRoIEJhY2tib25lJ3Mgc2ltaWxhciBmdW5jdGlvbmFsaXR5KVxuXHRpZiAoXy5pc0Z1bmN0aW9uKHZhbHVlKSAmJiAoa2V5ID09PSAnY29sbGVjdGlvbicgfHwga2V5ID09PSAnbW9kZWwnKSkge1xuXHRcdHJldHVybiB2YWx1ZSgpO1xuXHR9XG5cblx0Ly8gSWdub3JlIG90aGVyIG5vbi1zdHJpbmdzXG5cdGlmICghXy5pc1N0cmluZyh2YWx1ZSkpIHtcblx0XHRyZXR1cm4gdmFsdWU7XG5cdH1cblxuXHQvLyBBbHNvIGlnbm9yZSBgdGVtcGxhdGVgXG5cdC8vIFRPRE86IHVzZSBhIGRpZmZlcmVudCBrZXkgbGF0ZXJcblx0aWYgKGtleSA9PT0gJ3RlbXBsYXRlJykgcmV0dXJuIHZhbHVlO1xuXG5cdC8vIEFsc28gaWdub3JlIHRoaW5ncyB0aGF0IHN0YXJ0IHdpdGggX1xuXHRpZiAoa2V5Lm1hdGNoKC9eXy8pKSByZXR1cm4gdmFsdWU7XG5cblxuXHQvLyBSZWRpcmVjdHMgdXNlciB0byBjbGllbnQtc2lkZSBVUkwsIHcvbyBhZmZlY3RpbmcgYnJvd3NlciBoaXN0b3J5XG5cdC8vIExpa2UgY2FsbGluZyBgQmFja2JvbmUuaGlzdG9yeS5uYXZpZ2F0ZSgnL2ZvbycsIHsgcmVwbGFjZTogdHJ1ZSB9KWBcblx0aWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14jIyguKlteLlxcc10pLykpICYmIG1hdGNoZXNbMV0pIHtcblx0XHRmbiA9IGZ1bmN0aW9uIHJlZGlyZWN0QW5kQ292ZXJUcmFja3MoKSB7XG5cdFx0XHR2YXIgdXJsID0gbWF0Y2hlc1sxXTtcblx0XHRcdEZSQU1FV09SSy5oaXN0b3J5Lm5hdmlnYXRlKHVybCwge1xuXHRcdFx0XHR0cmlnZ2VyOiB0cnVlLFxuXHRcdFx0XHRyZXBsYWNlOiB0cnVlXG5cdFx0XHR9KTtcblx0XHR9O1xuXHR9XG5cdC8vIE1ldGhvZCB0byByZWRpcmVjdCB1c2VyIHRvIGEgY2xpZW50LXNpZGUgVVJMLCB0aGVuIGNhbGwgdGhlIGhhbmRsZXJcblx0ZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXiMoLipbXi5cXHNdKykvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHRcdGZuID0gZnVuY3Rpb24gY2hhbmdlVXJsRnJhZ21lbnQoKSB7XG5cdFx0XHR2YXIgdXJsID0gbWF0Y2hlc1sxXTtcblx0XHRcdEZSQU1FV09SSy5oaXN0b3J5Lm5hdmlnYXRlKHVybCwge1xuXHRcdFx0XHR0cmlnZ2VyOiB0cnVlXG5cdFx0XHR9KTtcblx0XHR9O1xuXHR9XG5cdC8vIE1ldGhvZCB0byB0cmlnZ2VyIGdsb2JhbCBldmVudFxuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eKCUuKlteLlxcc10pLykpICYmIG1hdGNoZXNbMV0pIHtcblx0XHRmbiA9IGZ1bmN0aW9uIHRyaWdnZXJFdmVudCgpIHtcblx0XHRcdHZhciB0cmlnZ2VyID0gbWF0Y2hlc1sxXTtcblx0XHRcdEZSQU1FV09SSy52ZXJib3NlKHRoaXMuaWQgKyAnIDo6IFRyaWdnZXJpbmcgZXZlbnQgKCcgKyB0cmlnZ2VyICsgJykuLi4nKTtcblx0XHRcdEZSQU1FV09SSy50cmlnZ2VyKHRyaWdnZXIpO1xuXHRcdH07XG5cdH1cblx0Ly8gTWV0aG9kIHRvIGZpcmUgYSB0ZXN0IGFsZXJ0XG5cdC8vICh1c2UgbWVzc2FnZSwgaWYgc3BlY2lmaWVkKVxuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eISEhXFxzKiguKlteLlxcc10pPy8pKSkge1xuXHRcdGZuID0gZnVuY3Rpb24gYmFuZ0FsZXJ0KGUpIHtcblxuXHRcdFx0Ly8gSWYgc3BlY2lmaWVkLCBtZXNzYWdlIGlzIHVzZWQsIG90aGVyd2lzZSAnQWxlcnQgdHJpZ2dlcmVkISdcblx0XHRcdHZhciBtc2cgPSAobWF0Y2hlcyAmJiBtYXRjaGVzWzFdKSB8fCAnRGVidWcgYWxlcnQgKCEhISkgdHJpZ2dlcmVkISc7XG5cblx0XHRcdC8vIE90aGVyIGRpYWdub3N0aWMgaW5mb3JtYXRpb25cblx0XHRcdG1zZyArPSAnXFxuXFxuRGlhZ25vc3RpY3NcXG49PT09PT09PT09PT09PT09PT09PT09PT1cXG4nO1xuXHRcdFx0aWYgKGUgJiYgZS5jdXJyZW50VGFyZ2V0KSB7XG5cdFx0XHRcdG1zZyArPSAnZS5jdXJyZW50VGFyZ2V0IDo6ICcgKyBlLmN1cnJlbnRUYXJnZXQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5pZCkge1xuXHRcdFx0XHRtc2cgKz0gJ3RoaXMuaWQgOjogJyArIHRoaXMuaWQ7XG5cdFx0XHR9XG5cblx0XHRcdGFsZXJ0KG1zZyk7XG5cdFx0fTtcblx0fVxuXG5cdC8vIE1ldGhvZCB0byBsb2cgYSBtZXNzYWdlIHRvIHRoZSBjb25zb2xlXG5cdC8vICh1c2UgbWVzc2FnZSwgaWYgc3BlY2lmaWVkKVxuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9ePj4+XFxzKiguKlteLlxcc10pPy8pKSkge1xuXG5cdFx0Zm4gPSBmdW5jdGlvbiBsb2dNZXNzYWdlKGUpIHtcblxuXHRcdFx0Ly8gSWYgc3BlY2lmaWVkLCBtZXNzYWdlIGlzIHVzZWQsIG90aGVyd2lzZSB1c2UgZGVmYXVsdFxuXHRcdFx0dmFyIG1zZyA9IChtYXRjaGVzICYmIG1hdGNoZXNbMV0pIHx8ICdMb2cgbWVzc2FnZSAoPj4+KSB0cmlnZ2VyZWQhJztcblx0XHRcdEZSQU1FV09SSy5sb2cobXNnKTtcblx0XHR9O1xuXHR9XG5cblx0Ly8gTWV0aG9kIHRvIGF0dGFjaCB0aGUgc3BlY2lmaWVkIGNvbXBvbmVudC90ZW1wbGF0ZSB0byBhIHJlZ2lvblxuXHRlbHNlIGlmIChcblx0XHQoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXihbXi5cXHNdKylcXHMqPFxcLVxccyooLipbXi5cXHNdKS8pKSAmJiBtYXRjaGVzWzFdICYmIG1hdGNoZXNbMl0pIHx8XG5cdFx0KChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14oW14uXFxzXSspXFxzKlxcLT5cXHMqKC4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSAmJiBtYXRjaGVzWzJdICYmXG5cdFx0XHQobWF0Y2hlc1sndG1wJ10gPSBtYXRjaGVzWzFdKSAmJiAobWF0Y2hlc1sxXSA9IG1hdGNoZXNbMl0pICYmIChtYXRjaGVzWzJdID0gbWF0Y2hlc1sndG1wJ10pKVxuXHQpIHtcblx0XHRmbiA9IGZ1bmN0aW9uIGF0dGFjaFRlbXBsYXRlKCkge1xuXG5cdFx0XHQvLyBSZW1vdmUgYWxsIHdoaXRlc3BhY2UgZnJvbSBtYXRjaGVzXG5cdFx0XHRtYXRjaGVzWzFdID0gbWF0Y2hlc1sxXS5yZXBsYWNlKC8oXFxzKykvZywgJycpO1xuXHRcdFx0bWF0Y2hlc1syXSA9IG1hdGNoZXNbMl0ucmVwbGFjZSgvKFxccyspL2csICcnKTtcblxuXHRcdFx0dmFyIHJlZ2lvbiA9IG1hdGNoZXNbMV07XG5cdFx0XHR2YXIgdGVtcGxhdGUgPSBtYXRjaGVzWzJdO1xuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UodGhpcy5pZCArICcgOjogQXR0YWNoaW5nIGAnICsgdGVtcGxhdGUgKyAnYCB0byBgJyArIHJlZ2lvbiArICdgLi4uJyk7XG5cblxuXHRcdFx0aWYgKCF0aGlzW3JlZ2lvbl0pIHtcblx0XHRcdFx0RlJBTUVXT1JLLmVycm9yKHRoaXMuaWQsJzo6IFRyeWluZyB0byBhdHRhY2ggcmVnaW9uIHdpdGggc2hvcnRoYW5kICgnK3ZhbHVlKycpLCBidXQgY291bGQgbm90IGZpbmQgcmVnaW9uIGAnK3JlZ2lvbisnYCcpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzW3JlZ2lvbl0uYXR0YWNoKHRlbXBsYXRlKTtcblx0XHR9O1xuXHR9XG5cblxuXHQvLyBNZXRob2QgdG8gdG9nZ2xlICghKSB0aGUgc3BlY2lmaWVkIG1vZGVsIGF0dHJcblx0ZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXlxcIVxccypcXEAoLipbXi5cXHNdKS8pKSAmJiBtYXRjaGVzWzFdKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiB0b2dnbGVBdHRyKCkge1xuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UodGhpcy5pZCArICcgOjogVG9nZ2xpbmcgYXR0ciAoJyArIG1hdGNoZXNbMV0gKyAnKS4uLicpO1xuXHRcdFx0dmFyIG9sZEF0dHJWYWx1ZSA9IHRoaXMubW9kZWwuZ2V0KCBtYXRjaGVzWzFdICk7XG5cblx0XHRcdGlmIChvbGRBdHRyVmFsdWUpIHtcblx0XHRcdFx0dGhpcy5tb2RlbC5zZXQoIG1hdGNoZXNbMV0sIGZhbHNlICk7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0dGhpcy5tb2RlbC5zZXQoIG1hdGNoZXNbMV0sIHRydWUgKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0Ly8gTWV0aG9kIHRvIGNoYW5nZSB0aGUgc3BlY2lmaWVkIG1vZGVsIGF0dHJcblx0ZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXlxccypcXEAoW149XSspPShbXj1dKilcXHMqJC8pKSkge1xuXG5cdFx0dmFyIGF0dHJOYW1lID0gbWF0Y2hlc1sxXTtcblx0XHR2YXIgbmV3QXR0clZhbHVlID0gbWF0Y2hlc1syXTtcblxuXHRcdGZuID0gZnVuY3Rpb24gY2hhbmdlQXR0cigpIHtcblx0XHRcdHRoaXMubW9kZWwuc2V0KGF0dHJOYW1lLCBuZXdBdHRyVmFsdWUpO1xuXHRcdH07XG5cdH1cblxuXHQvLyBNZXRob2QgdG8gcmVtb3ZlIHRoZSBtb2RlbCBmb3IgdGhlIGN1cnJlbnQgY29tcG9uZW50XG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL15cXHMqXFwtXFxzKiQvKSkpIHtcblx0XHRmbiA9IGZ1bmN0aW9uIHJlbW92ZU1vZGVsICgpIHtcblxuXHRcdFx0Ly8gT25seSB3b3JrcyBpZiBtb2RlbCBiZWxvbmdzIHRvIGEgY29sbGVjdGlvblxuXHRcdFx0aWYgKCF0aGlzLm1vZGVsLmNvbGxlY3Rpb24pIHJldHVybjtcblxuXHRcdFx0dGhpcy5tb2RlbC5jb2xsZWN0aW9uLnJlbW92ZSh0aGlzLm1vZGVsKTtcblx0XHR9O1xuXHR9XG5cblxuXHQvLyBkZXByZWNhdGluZyBjbGFzcyBtYW5pcHVsYXRpb24gc2hvcnRoYW5kXG5cdC8vIChubyBuZWVkIHRvIGRvIGRvbSBtYW5pcHVsYXRpb24gdW5sZXNzIGFic29sdXRlbHkgbmVjZXNzYXJ5KVxuXG5cdC8vIC8vIE1ldGhvZCB0byBhZGQgdGhlIHNwZWNpZmllZCBjbGFzc1xuXHQvLyBlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eXFwrXFxzKlxcLiguKlteLlxcc10pLykpICYmIG1hdGNoZXNbMV0pIHtcblx0Ly8gXHRmbiA9IGZ1bmN0aW9uIGFkZENsYXNzKCkge1xuXHQvLyBcdFx0RlJBTUVXT1JLLnZlcmJvc2UodGhpcy5pZCArICcgOjogQWRkaW5nIGNsYXNzICgnICsgbWF0Y2hlc1sxXSArICcpLi4uJyk7XG5cdC8vIFx0XHR0aGlzLiRlbC5hZGRDbGFzcyhtYXRjaGVzWzFdKTtcblx0Ly8gXHR9O1xuXHQvLyB9XG5cdC8vIC8vIE1ldGhvZCB0byByZW1vdmUgdGhlIHNwZWNpZmllZCBjbGFzc1xuXHQvLyBlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eXFwtXFxzKlxcLiguKlteLlxcc10pLykpICYmIG1hdGNoZXNbMV0pIHtcblx0Ly8gXHRmbiA9IGZ1bmN0aW9uIHJlbW92ZUNsYXNzKCkge1xuXHQvLyBcdFx0RlJBTUVXT1JLLnZlcmJvc2UodGhpcy5pZCArICcgOjogUmVtb3ZpbmcgY2xhc3MgKCcgKyBtYXRjaGVzWzFdICsgJykuLi4nKTtcblx0Ly8gXHRcdHRoaXMuJGVsLnJlbW92ZUNsYXNzKG1hdGNoZXNbMV0pO1xuXHQvLyBcdH07XG5cdC8vIH1cblx0Ly8gLy8gTWV0aG9kIHRvIHRvZ2dsZSB0aGUgc3BlY2lmaWVkIGNsYXNzXG5cdC8vIGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL15cXCFcXHMqXFwuKC4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHQvLyBcdGZuID0gZnVuY3Rpb24gdG9nZ2xlQ2xhc3MoKSB7XG5cdC8vIFx0XHRGUkFNRVdPUksudmVyYm9zZSh0aGlzLmlkICsgJyA6OiBUb2dnbGluZyBjbGFzcyAoJyArIG1hdGNoZXNbMV0gKyAnKS4uLicpO1xuXHQvLyBcdFx0dGhpcy4kZWwudG9nZ2xlQ2xhc3MobWF0Y2hlc1sxXSk7XG5cdC8vIFx0fTtcblx0Ly8gfVxuXG5cdC8vIFRPRE86XHRhbGxvdyBkZXNjZW5kYW50cyB0byBiZSBjb250cm9sbGVkIHZpYSBzaG9ydGhhbmRcblx0Ly9cdFx0XHRlLmcuIDogJ2xpLnJvdyAtLmhpZ2hsaWdodGVkJ1xuXHQvL1x0XHRcdHdvdWxkIHJlbW92ZSB0aGUgYGhpZ2hsaWdodGVkYCBjbGFzcyBmcm9tIHRoaXMuJCgnbGkucm93JylcblxuXG5cdC8vIElmIHNob3J0LWhhbmQgbWF0Y2hlZCwgcmV0dXJuIHRoZSBkZXJlZmVyZW5jZWQgZnVuY3Rpb25cblx0aWYgKGZuKSB7XG5cblx0XHRGUkFNRVdPUksudmVyYm9zZSgnSW50ZXJwcmV0aW5nIG1lYW5pbmcgZnJvbSBzaG9ydGhhbmQgOjogYCcgKyB2YWx1ZSArICdgLi4uJyk7XG5cblx0XHQvLyBDdXJyeSB0aGUgcmVzdWx0IGZ1bmN0aW9uIHdpdGggYW55IHN1ZmZpeCBtYXRjaGVzXG5cdFx0dmFyIGN1cnJpZWRGbiA9IGZuO1xuXG5cdFx0Ly8gVHJhaWxpbmcgYC5gIGluZGljYXRlcyBhbiBlLnN0b3BQcm9wYWdhdGlvbigpXG5cdFx0aWYgKHZhbHVlLm1hdGNoKC9cXC5cXHMqJC8pKSB7XG5cdFx0XHRjdXJyaWVkRm4gPSBmdW5jdGlvbiBhbmRTdG9wUHJvcGFnYXRpb24oZSkge1xuXG5cdFx0XHRcdC8vIEJpbmQgKHNvIGl0IGluaGVyaXRzIGNvbXBvbmVudCBjb250ZXh0KSBhbmQgY2FsbCBpbnRlcmlvciBmdW5jdGlvblxuXHRcdFx0XHRmbi5hcHBseSh0aGlzKTtcblxuXHRcdFx0XHQvLyB0aGVuIGltbWVkaWF0ZWx5IHN0b3AgZXZlbnQgYnViYmxpbmcvcHJvcGFnYXRpb25cblx0XHRcdFx0aWYgKGUgJiYgZS5zdG9wUHJvcGFnYXRpb24pIHtcblx0XHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdEZSQU1FV09SSy53YXJuKFxuXHRcdFx0XHRcdFx0dGhpcy5pZCArICcgOjogVHJhaWxpbmcgYC5gIHNob3J0aGFuZCB3YXMgdXNlZCB0byBpbnZva2UgYW4gJyArXG5cdFx0XHRcdFx0XHQnZS5zdG9wUHJvcGFnYXRpb24oKSwgYnV0IFwiJyArIHZhbHVlICsgJ1wiIHdhcyBub3QgdHJpZ2dlcmVkIGJ5IGEgRE9NIGV2ZW50IVxcbicgK1xuXHRcdFx0XHRcdFx0J1Byb2JhYmx5IGJlc3QgdG8gZG91YmxlLWNoZWNrIHRoaXMgd2FzIHdoYXQgeW91IG1lYW50IHRvIGRvLicpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiBjdXJyaWVkRm47XG5cdH1cblxuXG5cdC8vIE90aGVyd2lzZSwgaWYgbm8gc2hvcnQtaGFuZCBtYXRjaGVkLCBwYXNzIHRoZSBvcmlnaW5hbCB2YWx1ZVxuXHQvLyBzdHJhaWdodCB0aHJvdWdoXG5cdHJldHVybiB2YWx1ZTtcbn07XG4iXX0=
(17)
});
;