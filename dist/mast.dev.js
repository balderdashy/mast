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


// Instantiate Framework instance
var framework = new Framework();

// Raise it after one cycle of the event loop.
setTimeout(function () {
	framework.raise();
}, 100);

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
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L2JpbmRFdmVudHMuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L2Nsb3NlLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2NvbXBvbmVudC9jb21waWxlVGVtcGxhdGUuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L2RhdGFCaW5kaW5ncy9jbGFzcy5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9jb21wb25lbnQvZGF0YUJpbmRpbmdzL3RleHQuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L2RlbGV0ZUFsbFJlZ2lvbnMuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L2luZGV4LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2NvbXBvbmVudC9saWZlY3ljbGVFdmVudHMuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L2xpZmVjeWNsZUhvb2tzLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2NvbXBvbmVudC9yZW5kZXIuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L3JlbmRlckNvbGxlY3Rpb24uanMiLCIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L3JlbmRlckRhdGFCaW5kaW5ncy5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9jb21wb25lbnQvcmVuZGVyUmVnaW9ucy5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9jb21wb25lbnQvdmFsaWRhdGVEZWZpbml0aW9uLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2RlZmluZS9idWlsZERlZmluaXRpb24uanMiLCIvY29kZS9vc3MvbWFzdC9saWIvZGVmaW5lL2luZGV4LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2luZGV4LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2xvZ2dlci9pbmRleC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9sb2dnZXIvc2V0dXAuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvcmFpc2UvYnVpbGRQcm90b3R5cGUuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvcmFpc2UvY29sbGVjdFJlZ2lvbnMuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvcmFpc2UvY29sbGVjdFRlbXBsYXRlc0Zyb21TY3JpcHRUYWdzLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3JhaXNlL2luZGV4LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3JlZ2lvbi9hcHBlbmQuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvcmVnaW9uL2F0dGFjaC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9yZWdpb24vZW1wdHkuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvcmVnaW9uL2Zyb21FbGVtZW50LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3JlZ2lvbi9pbmRleC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9yZWdpb24vaW5zZXJ0LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3JlZ2lvbi9wcmVwZW5kLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3JlZ2lvbi9yZW1vdmUuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvcm91dGVyL2luZGV4LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3V0aWxzL0RPTS5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi91dGlscy9lbDJEZWZhdWx0VGVtcGxhdGVJRC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi91dGlscy9lbDJNYXN0SUQuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvdXRpbHMvZXZlbnRzLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3V0aWxzL29iak1hcC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi91dGlscy9zaG9ydGhhbmQuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9GQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekxBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL05BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6TEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXNcbiAqL1xudmFyIHJlbmRlckRhdGFCaW5kaW5ncyA9IHJlcXVpcmUoJy4vcmVuZGVyRGF0YUJpbmRpbmdzJyk7XG5cblxuLyoqXG4gKiBCaW5kIGNvbGxlY3Rpb24gZXZlbnRzIHRvIGxpZmVjeWNsZSBldmVudCBoYW5kbGVyc1xuICovXG5leHBvcnRzLmNvbGxlY3Rpb25FdmVudHMgPSBmdW5jdGlvbigpIHtcblx0Ly8gQmluZCB0byBjb2xsZWN0aW9uIGV2ZW50cyBpZiBvbmUgd2FzIHBhc3NlZCBpblxuXHRpZiAodGhpcy5jb2xsZWN0aW9uKSB7XG5cblx0XHQvLyBMaXN0ZW4gdG8gZXZlbnRzXG5cdFx0dGhpcy5saXN0ZW5Ubyh0aGlzLmNvbGxlY3Rpb24sICdhZGQnLCB0aGlzLmFmdGVyQWRkKTtcblx0XHR0aGlzLmxpc3RlblRvKHRoaXMuY29sbGVjdGlvbiwgJ3JlbW92ZScsIHRoaXMuYWZ0ZXJSZW1vdmUpO1xuXHRcdHRoaXMubGlzdGVuVG8odGhpcy5jb2xsZWN0aW9uLCAncmVzZXQnLCB0aGlzLmFmdGVyUmVzZXQpO1xuXHR9XG59O1xuXG4vKipcbiAqIEJpbmQgbW9kZWwgZXZlbnRzIHRvIGxpZmVjeWNsZSBldmVudCBoYW5kbGVycyBhbmQgYWxzbyBhbGxvd3MgZm9yIGhhbmRsZXJzIHRvIGZpcmVcbiAqIG9uIGNlcnRhaW4gbW9kZWwgYXR0cmlidXRlIGNoYW5nZXMuXG4gKi9cbmV4cG9ydHMubW9kZWxFdmVudHMgPSBmdW5jdGlvbigpIHtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdGlmICh0aGlzLm1vZGVsKSB7XG5cblx0XHQvLyBMaXN0ZW4gZm9yIGFueSBhdHRyaWJ1dGUgY2hhbmdlc1xuXHRcdC8vIGUuZy5cblx0XHQvLyAuYWZ0ZXJDaGFuZ2UobW9kZWwsIG9wdGlvbnMpXG5cdFx0Ly9cblx0XHR0aGlzLmxpc3RlblRvKHRoaXMubW9kZWwsICdjaGFuZ2UnLCBmdW5jdGlvbiBtb2RlbENoYW5nZWQgKG1vZGVsLCBvcHRpb25zKSB7XG5cblx0XHRcdC8vIFJlbmRlciBkYXRhIGJpbmRpbmdzXG5cdFx0XHRyZW5kZXJEYXRhQmluZGluZ3MuY2FsbChzZWxmKTtcblxuXHRcdFx0Ly8gUnVuIGN1c3RvbSBgYWZ0ZXJDaGFuZ2VgKCkgbWV0aG9kXG5cdFx0XHRpZiAoXy5pc0Z1bmN0aW9uKHRoaXMuYWZ0ZXJDaGFuZ2UpKSB7XG5cdFx0XHRcdHRoaXMuYWZ0ZXJDaGFuZ2UobW9kZWwsIG9wdGlvbnMpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Ly8gTGlzdGVuIGZvciBzcGVjaWZpYyBhdHRyaWJ1dGUgY2hhbmdlc1xuXHRcdC8vIGUuZy5cblx0XHQvLyAuYWZ0ZXJDaGFuZ2UuY29sb3IobW9kZWwsIHZhbHVlLCBvcHRpb25zKVxuXHRcdGlmIChfLmlzT2JqZWN0KHRoaXMuYWZ0ZXJDaGFuZ2UpKSB7XG5cdFx0XHRfLmVhY2godGhpcy5hZnRlckNoYW5nZSwgZnVuY3Rpb24gKGhhbmRsZXIsIGF0dHJOYW1lKSB7XG5cblx0XHRcdFx0Ly8gQ2FsbCBoYW5kbGVyIHdpdGggbmV3VmFsIHRvIGtlZXAgYXJndW1lbnRzIHN0cmFpZ2h0Zm9yd2FyZFxuXHRcdFx0XHR0aGlzLmxpc3RlblRvKHRoaXMubW9kZWwsICdjaGFuZ2U6JyArIGF0dHJOYW1lLCBmdW5jdGlvbiBhdHRyQ2hhbmdlZCAobW9kZWwsIG5ld1ZhbCkge1xuXHRcdFx0XHRcdGhhbmRsZXIuY2FsbCh0aGlzLCBuZXdWYWwpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0fSwgdGhpcyk7XG5cdFx0fVxuXHR9XG59O1xuXG4vKipcbiAqIExpc3RlbnMgZm9yIGFuZCBydW5zIGhhbmRsZXJzIG9uIGdsb2JhbCBldmVudHMgdGhhdCBhcmUgbGlzdGVuZWQgZm9yIG9uIGEgY29tcG9uZW50LlxuICovXG5leHBvcnRzLmdsb2JhbFRyaWdnZXJzID0gZnVuY3Rpb24oKSB7XG5cblx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdHRoaXMubGlzdGVuVG8oRlJBTUVXT1JLLCAnYWxsJywgZnVuY3Rpb24gKGVSb3V0ZSkge1xuXG5cdFx0Ly8gVHJpbSBvZmYgYWxsIGJ1dCB0aGUgZmlyc3QgYXJndW1lbnQgdG8gcGFzcyB0aHJvdWdoIHRvIGhhbmRsZXJcblx0XHR2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG5cdFx0YXJncy5zaGlmdCgpO1xuXG5cdFx0Ly8gSXRlcmF0ZSB0aHJvdWdoIGVhY2ggc3Vic2NyaXB0aW9uIG9uIHRoaXMgY29tcG9uZW50XG5cdFx0Ly8gYW5kIGxpc3RlbiBmb3IgdGhlIHNwZWNpZmllZCBnbG9iYWwgZXZlbnRzXG5cdFx0Xy5lYWNoKHNlbGYuc3Vic2NyaXB0aW9ucywgZnVuY3Rpb24oaGFuZGxlciwgbWF0Y2hQYXR0ZXJuKSB7XG5cblx0XHRcdC8vIEdyYWIgcmVnZXggYW5kIHBhcmFtIHBhcnNpbmcgbG9naWMgZnJvbSBCYWNrYm9uZSBjb3JlXG5cdFx0XHR2YXIgZXh0cmFjdFBhcmFtcyA9IEJhY2tib25lLlJvdXRlci5wcm90b3R5cGUuX2V4dHJhY3RQYXJhbWV0ZXJzLFxuXHRcdFx0XHRjYWxjdWxhdGVSZWdleCA9IEJhY2tib25lLlJvdXRlci5wcm90b3R5cGUuX3JvdXRlVG9SZWdFeHA7XG5cblx0XHRcdC8vIFRyaW0gdHJhaWxpbmdcblx0XHRcdG1hdGNoUGF0dGVybiA9IG1hdGNoUGF0dGVybi5yZXBsYWNlKC9cXC8qJC9nLCAnJyk7XG5cdFx0XHQvLyBhbmQgZXIgc29ydCBvZi4uIGxlYWRpbmcuLiBzbGFzaGVzXG5cdFx0XHRtYXRjaFBhdHRlcm4gPSBtYXRjaFBhdHRlcm4ucmVwbGFjZSgvXihbI34lXSlcXC8qL2csICckMScpO1xuXHRcdFx0Ly8gVE9ETzogb3B0aW1pemF0aW9uLSB0aGlzIHJlYWxseSBvbmx5IGhhcyB0byBiZSBkb25lIG9uY2UsIG9uIHJhaXNlKCksIHdlIHNob3VsZCBkbyB0aGF0XG5cblxuXHRcdFx0Ly8gQ29tZSB1cCB3aXRoIHJlZ2V4IGZvciB0aGlzIG1hdGNoUGF0dGVyblxuXHRcdFx0dmFyIHJlZ2V4ID0gY2FsY3VsYXRlUmVnZXgobWF0Y2hQYXR0ZXJuKTtcblxuXHRcdFx0Ly8gSWYgdGhpcyBtYXRjaFBhdGVybiBpcyB0aGlzIGlzIG5vdCBhIG1hdGNoIGZvciB0aGUgZXZlbnQsXG5cdFx0XHQvLyBgY29udGludWVgIGl0IGFsb25nIHRvIGl0IGNhbiB0cnkgdGhlIG5leHQgbWF0Y2hQYXR0ZXJuXG5cdFx0XHRpZiAoIWVSb3V0ZS5tYXRjaChyZWdleCkpIHJldHVybjtcblxuXHRcdFx0Ly8gUGFyc2UgcGFyYW1ldGVycyBmb3IgdXNlIGFzIGFyZ3MgdG8gdGhlIGhhbmRsZXJcblx0XHRcdC8vIChvciBhbiBlbXB0eSBsaXN0IGlmIG5vbmUgZXhpc3QpXG5cdFx0XHR2YXIgcGFyYW1zID0gZXh0cmFjdFBhcmFtcyhyZWdleCwgZVJvdXRlKTtcblxuXHRcdFx0Ly8gSGFuZGxlIHN0cmluZyByZWRpcmVjdHMgdG8gZnVuY3Rpb24gbmFtZXNcblx0XHRcdGlmICghXy5pc0Z1bmN0aW9uKGhhbmRsZXIpKSB7XG5cdFx0XHRcdGhhbmRsZXIgPSBzZWxmW2hhbmRsZXJdO1xuXG5cdFx0XHRcdGlmICghaGFuZGxlcikge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IHRyaWdnZXIgc3Vic2NyaXB0aW9uIGJlY2F1c2Ugb2YgdW5rbm93biBoYW5kbGVyOiAnICsgaGFuZGxlcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gQmluZCBjb250ZXh0IGFuZCBhcmd1bWVudHMgdG8gc3Vic2NyaXB0aW9uIGhhbmRsZXJcblx0XHRcdGhhbmRsZXIuYXBwbHkoc2VsZiwgXy51bmlvbihhcmdzLCBwYXJhbXMpKTtcblxuXHRcdH0pO1xuXHR9KTtcbn07XG4iLCIvKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXNcbiAqL1xuXG52YXIgZGVsZXRlQWxsUmVnaW9ucyA9IHJlcXVpcmUoJy4vZGVsZXRlQWxsUmVnaW9ucycpO1xuXG5cblxuXG4vKipcbiAqIEZSQU1FV09SSy5Db21wb25lbnQucHJvdG90eXBlLmNsb3NlXG4gKlxuICogU2FmZWx5IHphcCBldmVyeSB0cmFjZSBhYm91dCB0aGlzIGNvbXBvbmVudCBmcm9tIG1lbW9yeS5cbiAqXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjbG9zZSAoKSB7XG5cblx0RlJBTUVXT1JLLmRlYnVnKCdDbG9zZWQgJyArIHRoaXMuaWQgKyAnIGNvbXBvbmVudC4nKTtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdC8vIENhbmNlbCBjdXJyZW50IHJlbmRlciBhbmQgY2xvc2Ugam9icywgaWYgdGhleSdyZSBydW5uaW5nXG5cdGlmICh0aGlzLl9yZW5kZXJpbmcpIHtcblx0XHRzZWxmLl9yZW5kZXJpbmdDYW5jZWxlZCA9IHRydWU7XG5cdFx0dGhpcy5jYW5jZWxSZW5kZXIoKTtcblx0XHRzZWxmLl9yZW5kZXJpbmcgPSBmYWxzZTtcblx0fVxuXHRpZiAodGhpcy5fY2xvc2luZykge1xuXHRcdHRoaXMuY2FuY2VsQ2xvc2UoKTtcblx0XHRzZWxmLl9jbG9zaW5nID0gZmFsc2U7XG5cdH1cblxuXHQvLyBMb2NrIGFjY2VzcyB0byBjbG9zZSgpXG5cdHRoaXMuX2Nsb3NpbmcgPSB0cnVlO1xuXG5cdHRoaXMuYmVmb3JlQ2xvc2UoZnVuY3Rpb24gKCkge1xuXG5cdFx0Ly8gPiBOT1RFOiBgdGhpcy5fY2xvc2luZz1mYWxzZWAgY2FuIGFuZCBwcm9iYWJseSBzaG91bGQgYmUgcmVtb3ZlZCxcblx0XHQvLyA+IHNpbmNlIG11dGV4IGlzIHVubmVjZXNzYXJ5IG5vdyB0aGF0IHRoZSBjb21wb25lbnQgaXMgdXAgZm9yIGdhcmJhZ2UgY29sbGVjdGlvblxuXHRcdC8vID4gV2FpdGluZyB0byBkbyB0aGlzIHVudGlsIGl0IGNhbiBiZSB0ZXN0ZWQgZnVydGhlclxuXG5cdFx0Ly8gVW5sb2NrIGNsb3NlKClcblx0XHRzZWxmLl9jbG9zaW5nID0gZmFsc2U7XG5cblx0XHQvLyBTdG9wIGxpc3RlbmluZyB0byBhbGwgZ2xvYmFsIHRyaWdnZXJzICglfCMpXG5cblx0XHQvLyBDbG9zZSBhbGwgY2hpbGQgY29tcG9uZW50c1xuXHRcdGRlbGV0ZUFsbFJlZ2lvbnMuY2FsbChzZWxmKTtcblxuXHRcdC8vIENhbGwgbmF0aXZlIGBCYWNrYm9uZS5WaWV3LnByb3RvdHlwZS5yZW1vdmUoKWBcblx0XHQvLyB0byB1bmRlbGVnYXRlIGV2ZW50cywgZXRjLlxuXHRcdHNlbGYucmVtb3ZlKCk7XG5cblx0fSk7XG59O1xuIiwiLyoqXG4gKiBDb252ZXJ0IHRlbXBsYXRlIEhUTUwgYW5kIGRhdGEgaW50byBhIGNvbXBpbGVkICR0ZW1wbGF0ZVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNvbXBpbGVUZW1wbGF0ZSAoKSB7XG5cblx0Ly8gQ3JlYXRlIHRlbXBsYXRlIGRhdGEgY29udGV4dCBieSBwcm92aWRpbmcgYWNjZXNzIHRvIHRoZSBnbG9iYWwgRGF0YSBvYmplY3QsXG5cdC8vIEFsc28gZm9sZCBpbiB0aGUgbW9kZWwgYXNzb2NpYXRlZCB3aXRoIHRoaXMgY29tcG9uZW50LCBpZiB0aGVyZSBpcyBvbmVcblx0dmFyIHRlbXBsYXRlQ29udGV4dCA9IF8uZXh0ZW5kKHtcblxuXHRcdC8vIEFsbG93cyB5b3UgdG8gZ2V0IGEgaG9sZCBvZiBkYXRhLFxuXHRcdC8vIGJ1dCB1c2UgYSBkZWZhdWx0IHZhbHVlIGlmIGl0IGRvZXNuJ3QgZXhpc3Rcblx0XHRnZXQ6IGZ1bmN0aW9uIChrZXksIGRlZmF1bHRWYWwpIHtcblx0XHRcdHZhciB2YWwgPSB0ZW1wbGF0ZUNvbnRleHRba2V5XTtcblx0XHRcdGlmICh0eXBlb2YgdmFsID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHR2YWwgPSBkZWZhdWx0VmFsO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHZhbDtcblx0XHR9XG5cdH0sXG5cblx0Ly8gQWxsIEZSQU1FV09SSy5kYXRhIGlzIGF2YWlsYWJsZSBpbiBldmVyeSB0ZW1wbGF0ZVxuXHRGUkFNRVdPUksuZGF0YSk7XG5cblx0Ly8gSWYgYSBtb2RlbCBpcyBwcm92aWRlZCBmb3IgdGhpcyBjb21wb25lbnQsIG1ha2UgaXQgYXZhaWxhYmxlIGluIHRoaXMgdGVtcGxhdGVcblx0aWYgKHRoaXMubW9kZWwpIHtcblx0XHRfLmV4dGVuZCh0ZW1wbGF0ZUNvbnRleHQsIHRoaXMubW9kZWwuYXR0cmlidXRlcyk7XG5cdH1cblxuXHQvLyBUZW1wbGF0ZSB0aGUgSFRNTCB3aXRoIHRoZSBkYXRhXG5cdHZhciBodG1sO1xuXHR0cnkge1xuXHRcdC8vIEFjY2VwdCBwcmVjb21waWxlZCB0ZW1wbGF0ZXNcblx0XHRpZiAoXy5pc0Z1bmN0aW9uKHRoaXMudGVtcGxhdGUpKSB7XG5cdFx0XHRodG1sID0gdGhpcy50ZW1wbGF0ZSh0ZW1wbGF0ZUNvbnRleHQpO1xuXHRcdH1cblx0XHQvLyBPciByYXcgc3RyaW5nc1xuXHRcdGVsc2UgaHRtbCA9IF8udGVtcGxhdGUodGhpcy50ZW1wbGF0ZSwgdGVtcGxhdGVDb250ZXh0KTtcblx0fVxuXHRjYXRjaCAoZSkge1xuXHRcdHZhciBzdHIgPSBlLFxuXHRcdFx0c3RhY2sgPSAnJztcblxuXHRcdGlmIChlIGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdHN0ciA9ICBlLnRvU3RyaW5nKCk7XG5cdFx0XHRzdGFjayA9IGUuc3RhY2s7XG5cdFx0fVxuXG5cdFx0RlJBTUVXT1JLLmVycm9yKHRoaXMuaWQgKyAnIDo6IENhbm5vdCByZW5kZXIoKSB0ZW1wbGF0ZSAocHJvYmFibHkgbWlzc2luZyBkYXRhKS5cXG5cXG5Hb3QgdGhpcyBlcnJvciA6Olxcbicrc3RyLCdcXG4nKTtcblx0XHRpZiAoaHRtbCkge0ZSQU1FV09SSy52ZXJib3NlKCdUZW1wbGF0ZSA6OiAnICsgaHRtbCk7fVxuXHRcdEZSQU1FV09SSy52ZXJib3NlKCdGdWxsIFRlbXBsYXRlIEVycm9yOicgKyAnXFxuJyxzdGFjayk7XG5cdFx0RlJBTUVXT1JLLnZlcmJvc2UoJ1xcblxcbk1vcmUgaW5mb3JtYXRpb246JywgJ1xcblxcblRlbXBsYXRlIGNvbnRleHQgOjonLHRlbXBsYXRlQ29udGV4dCwgJ1xcblxcbnRoaXMubW9kZWw6OicsIHRoaXMubW9kZWwpO1xuXHRcdGh0bWwgPSBfLmlzU3RyaW5nKHRoaXMudGVtcGxhdGUpID8gdGhpcy50ZW1wbGF0ZSA6IHN0cjtcblx0fVxuXG5cdHJldHVybiBodG1sO1xufTtcblxuXG4iLCIvKipcbiAqIGBjbGFzc2AgZGF0YSBiaW5kaW5nXG4gKiBAdHlwZSB7T2JqZWN0fVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IHtcblx0cmVnZXhwOiAvYmluZFxcLWNsYXNzXFwtKFteLV0rKS8sXG5cdGZuOiBmdW5jdGlvbiAoJGVsLCBtb2RlbCwgbWF0Y2hlcykge1xuXHRcdC8vIFJlZ2V4cCBtYXRjaGVzIGZvciB3aWxkY2FyZCBwYXJhbXMgaW4gYXR0cmlidXRlIG1hdGNoIGV4cHJlc3Npb25cblx0XHR2YXIgY2xhc3NOYW1lID0gbWF0Y2hlc1sxXTtcblxuXHRcdHZhciByYXcgPSAkYm91bmRFbC5hdHRyKCdiaW5kLWNsYXNzLScgKyBjbGFzc05hbWUpO1xuXHRcdHZhciBjbGVhbiA9IHJhdy5yZXBsYWNlKC9eQC8sICcnKTtcblx0XHRpZiAoIG1vZGVsLmdldChjbGVhbikgKSB7XG5cdFx0XHQkYm91bmRFbC5hZGRDbGFzcyhjbGFzc05hbWUpO1xuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdCRib3VuZEVsLnJlbW92ZUNsYXNzKGNsYXNzTmFtZSk7XG5cdFx0fVxuXHR9XG59O1xuXG4iLCIvKipcbiAqIGB0ZXh0YCBkYXRhIGJpbmRpbmdcbiAqIEB0eXBlIHtPYmplY3R9XG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSB7XG5cdHJlZ2V4cDogL2JpbmQtdGV4dC8sXG5cdGZuOiBmdW5jdGlvbiAoJGVsLCBtb2RlbCkge1xuXHRcdHZhciByYXcgPSAkYm91bmRFbC5hdHRyKCdiaW5kLXRleHQnKTtcblx0XHR2YXIgY2xlYW4gPSByYXcucmVwbGFjZSgvXkAvLCAnJyk7XG5cdFx0JGJvdW5kRWwudGV4dCggbW9kZWwuZ2V0KGNsZWFuKSApO1xuXHR9XG59O1xuIiwiLyoqXG4gKiBJZiBhbnkgcmVnaW9ucyBleGlzdCBpbiB0aGlzIGNvbXBvbmVudCxcbiAqIGVtcHR5IHRoZW0sIGFuZCB0aGVuIGRlbGV0ZSB0aGVtXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBkZWxldGVBbGxSZWdpb25zICgpIHtcblx0Xy5lYWNoKHRoaXMucmVnaW9ucywgZnVuY3Rpb24gKHJlZ2lvbiwga2V5KSB7XG5cdFx0cmVnaW9uLmVtcHR5KCk7XG5cdFx0ZGVsZXRlIHRoaXMucmVnaW9uc1trZXldO1xuXHR9LCB0aGlzKTtcbn07XG4iLCIvKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXNcbiAqL1xuXG52YXIgbGlmZWN5Y2xlSG9va3MgICAgID0gcmVxdWlyZSgnLi9saWZlY3ljbGVIb29rcycpLFxuXHRsaWZlY3ljbGVFdmVudHMgICAgPSByZXF1aXJlKCcuL2xpZmVjeWNsZUV2ZW50cycpLFxuXHRiaW5kRXZlbnRzICAgICAgICAgPSByZXF1aXJlKCcuL2JpbmRFdmVudHMnKSxcblx0Y2xvc2VDb21wb25lbnQgICAgID0gcmVxdWlyZSgnLi9jbG9zZScpLFxuXHRyZW5kZXIgICAgICAgICAgICAgPSByZXF1aXJlKCcuL3JlbmRlcicpLFxuXHRyZW5kZXJDb2xsZWN0aW9uICAgPSByZXF1aXJlKCcuL3JlbmRlckNvbGxlY3Rpb24nKSxcblx0dmFsaWRhdGVEZWZpbml0aW9uID0gcmVxdWlyZSgnLi92YWxpZGF0ZURlZmluaXRpb24nKTtcblxuXG4vKipcbiAqIEZSQU1FV09SSy5Db21wb25lbnRcbiAqXG4gKiBDb21wb25lbnQgaXMgYW4gZXh0ZW5kZWQgYEJhY2tib25lLlZpZXdgLiBJdCBhZGQgZmVhdHVyZXMgc3VjaCBhcyBhdXRvbWF0aWMgZXZlbnQgYmluZGluZyxcbiAqIHJlbmRlcmluZywgbGlmZWN5Y2xlIGhvb2tzIGFuZCBldmVudHMsIGFuZCBtb3JlLlxuICpcbiAqIEBjb25zdHJ1Y3RvclxuICovXG52YXIgQ29tcG9uZW50ID0gbW9kdWxlLmV4cG9ydHMgPSBCYWNrYm9uZS5WaWV3LmV4dGVuZCgpO1xuXG5cbl8uZXh0ZW5kKENvbXBvbmVudC5wcm90b3R5cGUsIHtcblxuXHQvLyBMaWZlY3ljbGUgSG9va3Ncblx0YmVmb3JlUmVuZGVyOiBmdW5jdGlvbihjYikge1xuXHRcdGxpZmVjeWNsZUhvb2tzLmJlZm9yZVJlbmRlci5jYWxsKHRoaXMsIGNiKTtcblx0fSxcblx0YmVmb3JlQ2xvc2U6IGZ1bmN0aW9uKGNiKSB7XG5cdFx0bGlmZWN5Y2xlSG9va3MuYmVmb3JlQ2xvc2UuY2FsbCh0aGlzLCBjYik7XG5cdH0sXG5cdGFmdGVyUmVuZGVyOiBmdW5jdGlvbigpIHtcblx0XHRsaWZlY3ljbGVIb29rcy5hZnRlclJlbmRlci5jYWxsKHRoaXMpO1xuXHR9LFxuXHRjYW5jZWxSZW5kZXI6IGZ1bmN0aW9uKCkge1xuXHRcdGxpZmVjeWNsZUhvb2tzLmNhbmNlbFJlbmRlci5jYWxsKHRoaXMpO1xuXHR9LFxuXHRjYW5jZWxDbG9zZTogZnVuY3Rpb24oKSB7XG5cdFx0bGlmZWN5Y2xlSG9va3MuY2FuY2VsQ2xvc2UuY2FsbCh0aGlzKTtcblx0fSxcblxuXHQvLyBMaWZlY3ljbGUgRXZlbnRzXG5cdGFmdGVyQ2hhbmdlOiBmdW5jdGlvbihtb2RlbCwgb3B0aW9ucykge1xuXHRcdGxpZmVjeWNsZUV2ZW50cy5hZnRlckNoYW5nZS5jYWxsKHRoaXMsIG1vZGVsLCBvcHRpb25zKTtcblx0fSxcblx0YWZ0ZXJBZGQ6IGZ1bmN0aW9uKG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zKSB7XG5cdFx0bGlmZWN5Y2xlRXZlbnRzLmFmdGVyQWRkLmNhbGwodGhpcywgbW9kZWwsIGNvbGxlY3Rpb24sIG9wdGlvbnMpO1xuXHR9LFxuXHRhZnRlclJlbW92ZTogZnVuY3Rpb24obW9kZWwsIGNvbGxlY3Rpb24sIG9wdGlvbnMpIHtcblx0XHRsaWZlY3ljbGVFdmVudHMuYWZ0ZXJSZW1vdmUuY2FsbCh0aGlzLCBtb2RlbCwgY29sbGVjdGlvbiwgb3B0aW9ucyk7XG5cdH0sXG5cdGFmdGVyUmVzZXQ6IGZ1bmN0aW9uKGNvbGxlY3Rpb24sIG9wdGlvbnMpIHtcblx0XHRsaWZlY3ljbGVFdmVudHMuYWZ0ZXJSZXNldC5jYWxsKHRoaXMsIGNvbGxlY3Rpb24sIG9wdGlvbnMpO1xuXHR9LFxuXG5cdC8vIFByb3RvdHlwZSBtZXRob2RzLlxuXHRjbG9zZTogZnVuY3Rpb24oKSB7XG5cdFx0Y2xvc2VDb21wb25lbnQuY2FsbCh0aGlzKTtcblx0fSxcblx0cmVuZGVyOiBmdW5jdGlvbihhdEluZGV4KSB7XG5cdFx0cmVuZGVyLmNhbGwodGhpcywgYXRJbmRleCk7XG5cdH0sXG5cblx0cmVuZGVyQ29sbGVjdGlvbjogZnVuY3Rpb24gKCkge1xuXHRcdHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcblx0XHRyZW5kZXJDb2xsZWN0aW9uLmFwcGx5KHRoaXMsIGFyZ3MpO1xuXHR9LFxufSk7XG5cblxuXG5cbkNvbXBvbmVudC5wcm90b3R5cGUuaW5pdGlhbGl6ZSA9IGZ1bmN0aW9uKHByb3BlcnRpZXMpIHtcblxuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0Ly8gS2VlcCB0cmFjayBvZiBhIGNvdW50ZXIgZm9yIHVzZSBpbiBnZW5lcmF0aW5nXG5cdC8vIGlkcyBmb3IgYW5vbnltb3VzIGNvbXBvbmVudHMuXG5cdHRoaXMuYW5vbnltb3VzUmVnaW9uQ291bnRlciA9IDA7XG5cblx0Ly8gRGlzYWJsZSBvciBpc3N1ZSB3YXJuaW5ncyBhYm91dCBjZXJ0YWluIHByb3BlcnRpZXNcblx0Ly8gYW5kIG1ldGhvZHMgdG8gYXZvaWQgY29uZnVzaW9uXG5cdHByb3BlcnRpZXMgPSB2YWxpZGF0ZURlZmluaXRpb24ocHJvcGVydGllcyk7XG5cblx0Ly8gRXh0ZW5kIGluc3RhbmNlIHcvIHNwZWNpZmllZCBwcm9wZXJ0aWVzIGFuZCBtZXRob2RzXG5cdF8uZXh0ZW5kKHRoaXMsIHByb3BlcnRpZXMpO1xuXG5cdC8vIFN0YXJ0IHdpdGggZW1wdHkgcmVnaW9ucyBvYmplY3Rcblx0dGhpcy5yZWdpb25zID0ge307XG5cblx0Ly8gRW5jb3VyYWdlIGNoaWxkIG1ldGhvZHMgdG8gdXNlIHRoZSBjb21wb25lbnQgY29udGV4dFxuXHRfLmJpbmRBbGwodGhpcyk7XG59O1xuIiwiLy8gRmlyZWQgd2hlbiB0aGUgYm91bmQgbW9kZWwgaXMgdXBkYXRlZCAoYHRoaXMubW9kZWxgKVxuZXhwb3J0cy5hZnRlckNoYW5nZSA9IGZ1bmN0aW9uIChtb2RlbCwgb3B0aW9ucykge307XG5cbi8vIEZpcmVkIHdoZW4gYSBtb2RlbCBpcyBhZGRlZCB0byB0aGUgYm91bmQgY29sbGVjdGlvbiAoYHRoaXMuY29sbGVjdGlvbmApXG5leHBvcnRzLmFmdGVyQWRkID0gZnVuY3Rpb24gKG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zKSB7fTtcblxuLy8gRmlyZWQgd2hlbiBhIG1vZGVsIGlzIHJlbW92ZWQgZnJvbSB0aGUgYm91bmQgY29sbGVjdGlvbiAoYHRoaXMuY29sbGVjdGlvbmApXG5leHBvcnRzLmFmdGVyUmVtb3ZlID0gZnVuY3Rpb24gKG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zKSB7fTtcblxuLy8gRmlyZWQgd2hlbiB0aGUgYm91bmQgY29sbGVjdGlvbiBpcyB3aXBlZCAoYHRoaXMuY29sbGVjdGlvbmApXG5leHBvcnRzLmFmdGVyUmVzZXQgPSBmdW5jdGlvbiAoY29sbGVjdGlvbiwgb3B0aW9ucykge307XG4iLCIvLyBGaXJlZCBhdXRvbWF0aWNhbGx5IHdoZW4gdGhlIHZpZXcgaXMgaW5pdGlhbGx5IGNyZWF0ZWRcbi8vIG9ubHkgZmlyZWQgYWZ0ZXJ3YXJkcyBpZiB0aGlzLnJlbmRlcigpIGlzIGV4cGxpY2l0bHkgY2FsbGVkXG4vLyBDYWxsYmFjayBtdXN0IGJlIGZpcmVkISFcbmV4cG9ydHMuYmVmb3JlUmVuZGVyID0gZnVuY3Rpb24gKGNiKSB7Y2IoKTt9O1xuXG4vLyBGaXJlZCBhdXRvbWF0aWNhbGx5IHdoZW4gdGhlIHZpZXcgaXMgaW5pdGlhbGx5IGNyZWF0ZWRcbi8vIG9ubHkgZmlyZWQgYWZ0ZXJ3YXJkcyBpZiB0aGlzLnJlbmRlcigpIGlzIGV4cGxpY2l0bHkgY2FsbGVkXG5leHBvcnRzLmFmdGVyUmVuZGVyID0gZnVuY3Rpb24gKCkge307XG5cbi8vIEZpcmVkIGF1dG9tYXRpY2FsbHkgd2hlbiB0aGUgdmlldyBpcyBjbG9zZWRcbmV4cG9ydHMuYmVmb3JlQ2xvc2UgPSBmdW5jdGlvbiAoY2IpIHtjYigpO307XG5cbi8vIEZpcmVkIGJlZm9yZSByZXJlbmRlcmluZyBvciBjbG9zaW5nIGEgdmlldyB0aGF0IGlzIGFscmVhZHkgd2FpdGluZyBvbiBhIGxvY2tcbmV4cG9ydHMuY2FuY2VsUmVuZGVyID0gZnVuY3Rpb24gKCkge1xuXHRGUkFNRVdPUksud2FybignY2FuY2VsUmVuZGVyKCkgc2hvdWxkIGJlIGRlZmluZWQgaWYgYmVmb3JlQ2xvc2UoY2IpIG9yIGJlZm9yZVJlbmRlcihjYiknICtcblx0XHRcdFx0XHRcdFx0XHQgJ2FyZSBiZWluZyB1c2VkIScpO1xufTtcblxuLy8gRmlyZWQgYmVmb3JlIHJlcmVuZGVyaW5nIG9yIGNsb3NpbmcgYSB2aWV3IHRoYXQgaXMgYWxyZWFkeSB3YWl0aW5nIG9uIGEgbG9ja1xuZXhwb3J0cy5jYW5jZWxDbG9zZSA9IGZ1bmN0aW9uICgpIHtcblx0RlJBTUVXT1JLLndhcm4oJ2NhbmNlbENsb3NlKCkgc2hvdWxkIGJlIGRlZmluZWQgaWYgYmVmb3JlQ2xvc2UoY2IpIG9yIGJlZm9yZVJlbmRlcihjYiknICtcblx0XHRcdFx0XHRcdFx0XHQgJ2FyZSBiZWluZyB1c2VkIScpO1xufTtcbiIsIi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llc1xuICovXG5cbnZhciBET00gPSByZXF1aXJlICgnLi4vdXRpbHMvRE9NJyksXG5cdFx0cmVuZGVyRGF0YUJpbmRpbmdzID0gcmVxdWlyZSgnLi9yZW5kZXJEYXRhQmluZGluZ3MnKSxcblx0XHRjb21waWxlVGVtcGxhdGUgPSByZXF1aXJlKCcuL2NvbXBpbGVUZW1wbGF0ZScpLFxuXHRcdHJlbmRlclJlZ2lvbnMgPSByZXF1aXJlKCcuL3JlbmRlclJlZ2lvbnMnKSxcblx0XHRiaW5kRXZlbnRzID0gcmVxdWlyZSAoJy4vYmluZEV2ZW50cycpO1xuXG5cblxuXG4vKipcbiAqIFJ1biBIVE1MIHRlbXBsYXRlIHRocm91Z2ggZW5naW5lIGFuZCBhcHBlbmQgcmVzdWx0cyB0byBvdXRsZXQuIEFsc28gcmVyZW5kZXIgcmVnaW9ucy5cbiAqIElmIGF0SW5kZXggaXMgc3BlY2lmaWVkLCB0aGUgY29tcG9uZW50IGlzIHJlbmRlcmVkIGF0IHRoZSBnaXZlbiBwb3NpdGlvbiB3aXRoaW4gaXRzXG4gKiBvdXRsZXQuIE90aGVyd2lzZSwgdGhlIGxhc3QgcG9zaXRpb24gaXMgdXNlZC5cbiAqXG4gKiBAcGFyYW0ge051bWJlcn0gYXRJbmRleCBbVGhlIGluZGV4IGluIHdoaWNoIHRvIHJlbmRlciB0aGlzIGVsZW1lbnRdXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByZW5kZXIoYXRJbmRleCkge1xuXG5cdEZSQU1FV09SSy5kZWJ1Zyh0aGlzLmlkICsgJyA6LS0tOiBSZW5kZXJpbmcgY29tcG9uZW50Li4uJyk7XG5cblx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdC8vIENhbmNlbCBjdXJyZW50IHJlbmRlciBhbmQgY2xvc2Ugam9icywgaWYgdGhleSdyZSBydW5uaW5nXG5cdGlmICh0aGlzLl9yZW5kZXJpbmcpIHtcblx0XHRGUkFNRVdPUksuZGVidWcodGhpcy5pZCArICcgOjogcmVuZGVyKCkgY2FuY2VsZWQuJyk7XG5cdFx0dGhpcy5fcmVuZGVyaW5nQ2FuY2VsZWQgPSB0cnVlO1xuXHRcdHRoaXMuY2FuY2VsUmVuZGVyKCk7XG5cdFx0dGhpcy5fcmVuZGVyaW5nID0gZmFsc2U7XG5cdH1cblx0aWYgKHRoaXMuX2Nsb3NpbmcpIHtcblx0XHRGUkFNRVdPUksuZGVidWcodGhpcy5pZCArICcgOjogY2xvc2UoKSBjYW5jZWxlZC4nKTtcblx0XHR0aGlzLmNhbmNlbENsb3NlKCk7XG5cdFx0dGhpcy5fY2xvc2luZyA9IGZhbHNlO1xuXHR9XG5cblx0Ly8gTG9jayBhY2Nlc3MgdG8gcmVuZGVyXG5cdHRoaXMuX3JlbmRlcmluZyA9IHRydWU7XG5cblx0Ly8gVHJpZ2dlciBiZWZvcmVSZW5kZXIgbWV0aG9kXG5cdHRoaXMuYmVmb3JlUmVuZGVyKGZ1bmN0aW9uICgpIHtcblxuXHRcdC8vIElmIHJlbmRlcmluZyB3YXMgY2FuY2VsZWQsIGJyZWFrIG91dFxuXHRcdC8vIGRvIG5vdCByZW5kZXIsIGFuZCBkbyBub3QgY2FsbCBhZnRlclJlbmRlcigpXG5cdFx0aWYgKCBzZWxmLl9yZW5kZXJpbmdDYW5jZWxlZCApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBCaW5kIHRoZSBldmVudHMgb24gbW9kZWwvY29sbGVjdGlvbnMgYW5kIGdsb2JhbCB0cmlnZ2VyZWQgZXZlbnRzLlxuXHRcdGJpbmRFdmVudHMuY29sbGVjdGlvbkV2ZW50cy5jYWxsKHNlbGYpO1xuXHRcdGJpbmRFdmVudHMubW9kZWxFdmVudHMuY2FsbChzZWxmKTtcblx0XHRiaW5kRXZlbnRzLmdsb2JhbFRyaWdnZXJzLmNhbGwoc2VsZik7XG5cblx0XHQvLyBVbmxvY2sgcmVuZGVyaW5nIG11dGV4XG5cdFx0c2VsZi5fcmVuZGVyaW5nID0gZmFsc2U7XG5cblx0XHRpZiAoIXNlbGYuJG91dGxldCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKHNlbGYuaWQgKyAnIDo6IFRyeWluZyB0byByZW5kZXIoKSwgYnV0IG5vICRvdXRsZXQgd2FzIGRlZmluZWQhJyk7XG5cdFx0fVxuXG5cdFx0Ly8gSHlkcmF0ZSBjb21waWxlZCB0ZW1wbGF0ZVxuXHRcdC8vIChjb21iaW5lcyB0aGUgdGVtcGxhdGUgZnVuY3Rpb24gd2l0aCBkYXRhIHRvIHJldHVybiBIVE1MKVxuXHRcdHZhciBodG1sID0gY29tcGlsZVRlbXBsYXRlLmNhbGwoc2VsZik7XG5cdFx0aWYgKCFodG1sKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IodGhpcy5pZCArICcgOjogVW5hYmxlIHRvIHJlbmRlciBjb21wb25lbnQgYmVjYXVzZSB0ZW1wbGF0ZSBjb21waWxhdGlvbiBkaWQgbm90IHJldHVybiBhbnkgSFRNTC4nKTtcblx0XHR9XG5cblx0XHQvLyBTdHJpcCB0cmFpbGluZyBhbmQgbGVhZGluZyB3aGl0ZXNwYWNlIHRvIGF2b2lkIGZhbHNlbHkgZGlhZ25vc2luZ1xuXHRcdC8vIG11bHRpcGxlIGVsZW1lbnRzLCB3aGVuIG9ubHkgb25lIGFjdHVhbGx5IGV4aXN0c1xuXHRcdC8vICh0aGlzIG1pc2RpYWdub3NpcyB3cmFwcyB0aGUgdGVtcGxhdGUgaW4gYW4gZXh0cmFuZW91cyA8ZGl2Pilcblx0XHRodG1sID0gaHRtbC5yZXBsYWNlKC9eXFxzKi8sICcnKTtcblx0XHRodG1sID0gaHRtbC5yZXBsYWNlKC9cXHMqJC8sICcnKTtcblx0XHRodG1sID0gaHRtbC5yZXBsYWNlKC8oXFxyfFxcbikqLywgJycpO1xuXG5cdFx0Ly8gU3RyaXAgSFRNTCBjb21tZW50cywgdGhlbiBzdHJpcCB3aGl0ZXNwYWNlIGFnYWluXG5cdFx0Ly8gKFRPRE86IG9wdGltaXplIHRoaXMpXG5cdFx0aHRtbCA9IGh0bWwucmVwbGFjZSgvKDwhLS0uKy0tPikqLywgJycpO1xuXHRcdGh0bWwgPSBodG1sLnJlcGxhY2UoL15cXHMqLywgJycpO1xuXHRcdGh0bWwgPSBodG1sLnJlcGxhY2UoL1xccyokLywgJycpO1xuXHRcdGh0bWwgPSBodG1sLnJlcGxhY2UoLyhcXHJ8XFxuKSovLCAnJyk7XG5cblx0XHQvLyBQYXJzZSBhIERPTSBub2RlIG9yIHNlcmllcyBvZiBET00gbm9kZXMgZnJvbSB0aGUgbmV3bHkgdGVtcGxhdGVkIEhUTUxcblx0XHR2YXIgcGFyc2VkTm9kZXMgPSAkLnBhcnNlSFRNTChodG1sKTtcblx0XHR2YXIgZWwgPSBwYXJzZWROb2Rlc1swXTtcblxuXHRcdC8vIElmIG5vIG5vZGVzIHdlcmUgcGFyc2VkLCB0aHJvdyBhbiBlcnJvclxuXHRcdGlmIChwYXJzZWROb2Rlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihzZWxmLmlkICsgJyA6OiByZW5kZXIoKSByYW4gaW50byBhIHByb2JsZW0gcmVuZGVyaW5nIHRoZSB0ZW1wbGF0ZSB3aXRoIEhUTUwgPT4gXFxuJytodG1sKTtcblx0XHR9XG5cblxuXG5cdFx0Ly8gSWYgdGhlcmUgaXMgbm90IG9uZSBzaW5nbGUgd3JhcHBlciBlbGVtZW50LFxuXHRcdC8vIG9yIGlmIHRoZSByZW5kZXJlZCB0ZW1wbGF0ZSBjb250YWlucyBvbmx5IGEgc2luZ2xlIHRleHQgbm9kZSxcblx0XHRlbHNlIGlmIChwYXJzZWROb2Rlcy5sZW5ndGggPiAxIHx8IHBhcnNlZE5vZGVzWzBdLm5vZGVUeXBlID09PSAzKSB7XG5cblx0XHRcdEZSQU1FV09SSy5sb2coc2VsZi5pZCArICcgOjogV3JhcHBpbmcgdGVtcGxhdGUgaW4gPGRpdi8+Li4uJywgcGFyc2VkTm9kZXMpO1xuXHRcdFx0ZWwgPSAkKCc8ZGl2Lz4nKS5hcHBlbmQoaHRtbCk7XG5cdFx0XHRlbCA9IGVsWzBdO1xuXHRcdH1cblxuXHRcdC8vIChvciBqdXN0IGEgbG9uZSByZWdpb24pXG5cdFx0Ly8gd3JhcCB0aGUgaHRtbCB1cCBpbiBhIGNvbnRhaW5lciA8ZGl2Lz5cblx0XHQvLyBlbHNlIGlmIChcblx0XHQvLyBcdCQocGFyc2VkTm9kZXNbMF0pLmlzKCdyZWdpb24nKSB8fFxuXHRcdC8vIFx0JChwYXJzZWROb2Rlc1swXSkuYXR0cignZGF0YS1yZWdpb24nKSAhPT0gdW5kZWZpbmVkICkge1xuXHRcdC8vIFx0Ly8gdXNlZCB0byB3cmFwIHRoaXMgc3R1ZmYgaW4gYSBkaXYgdG9vLCBidXQgbm90IGFueW1vcmVcblx0XHQvLyBcdC8vIHNpbmNlIGl0IG1lc3NlcyB3LyBIVE1MIHRoaW5ncyBsaWtlIHRhYmxlc1xuXHRcdC8vIH1cblxuXG5cblx0XHQvLyBTZXQgQmFja2JvbmUgZWxlbWVudCAoY2FjaGUgYW5kIHJlZGVsZWdhdGUgRE9NIGV2ZW50cylcblx0XHQvLyAoV2lsbCBhbHNvIHVwZGF0ZSBzZWxmLiRlbClcblx0XHRzZWxmLnNldEVsZW1lbnQoZWwpO1xuXG5cblxuXHRcdC8vIERldGVjdCBhbmQgcmVuZGVyIGFsbCByZWdpb25zIGFuZCB0aGVpciBkZXNjZW5kZW50IGNvbXBvbmVudHMgYW5kIHJlZ2lvbnNcblx0XHRyZW5kZXJSZWdpb25zLmNhbGwoc2VsZik7XG5cblx0XHQvLyBJbnNlcnQgdGhlIGVsZW1lbnQgYXQgdGhlIHByb3BlciBwbGFjZSBhbW9uZ3N0IHRoZSBvdXRsZXQncyBjaGlsZHJlblxuXHRcdHZhciBuZWlnaGJvcnMgPSBzZWxmLiRvdXRsZXQuY2hpbGRyZW4oKTtcblx0XHRpZiAoXy5pc0Zpbml0ZShhdEluZGV4KSAmJiBuZWlnaGJvcnMubGVuZ3RoID4gMCAmJiBuZWlnaGJvcnMubGVuZ3RoID4gYXRJbmRleCkge1xuXHRcdFx0bmVpZ2hib3JzLmVxKGF0SW5kZXgpLmJlZm9yZShzZWxmLiRlbCk7XG5cdFx0fVxuXG5cdFx0Ly8gQnV0IGlmIHRoZSBvdXRsZXQgaXMgZW1wdHksIG9yIHRoZXJlJ3Mgbm8gYXRJbmRleCwganVzdCBzdGljayBpdCBvbiB0aGUgZW5kXG5cdFx0ZWxzZSBzZWxmLiRvdXRsZXQuYXBwZW5kKHNlbGYuJGVsKTtcblxuXG5cdFx0Ly8gRmxhZyB3aXRoIGRhdGEtdGVtcGxhdGUtaWQgYXR0cmlidXRlXG5cdFx0Ly8gKHRvIG1ha2UgdGVtcGxhdGUvY29tcG9uZW50IGJvdW5kYXJpZXMgZWFzaWVyIHRvIHBpY2sgb3V0IGluIHRoZSBpbnNwZWN0b3IpXG5cdFx0c2VsZi4kZWwuYXR0cignZGF0YS10ZW1wbGF0ZS1pZCcsIHNlbGYuaWQpO1xuXG5cblxuXG5cdFx0Ly9cblx0XHQvLyBJZiB0aGUgcGFyZW50IGNvbXBvbmVudCBoYXMgcm91dGUgbGlzdGVuZXJzIChlLmcuICNmb28pXG5cdFx0Ly8gcnVuIGFueSBvZiB0aGVtIHRoYXQgbWF0Y2ggYHdpbmRvdy5sb2NhdGlvbi5oYXNoYC5cblx0XHQvLyAoYWZ0ZXIgcmVuZGVyaW5nIHRoZSB0ZW1wbGF0ZSBhbmQgcmVnaW9ucyBidXQgQkVGT1JFIHRoZSBgYWZ0ZXJSZW5kZXJgXG5cdFx0Ly8gbGlmZWN5Y2xlIGNhbGxiYWNrIGlzIHRyaWdnZXJlZClcblx0XHQvL1xuXHRcdC8vIG5vdCBzdXJlIGlmIHRoaXMgaXMgYSBnb29kIGlkZWEgaW4gZ2VuZXJhbC0tIG1heWJlIGNvbmZpZ3VyYWJsZS4uP1xuXHRcdC8vIG9yIG9ubHkgaWYgYmFja2JvbmUuaGlzdG9yeSBpc24ndCByZWFkeSB5ZXQ/XG5cdFx0Ly9cblx0XHQvLyBkaXNhYmxpbmcgZm9yIG5vdy4uLlxuXHRcdC8vIF8uZWFjaCggT2JqZWN0LmtleXMoc2VsZiksIGZ1bmN0aW9uIChrZXkpIHtcblx0XHQvLyBcdHZhciBtYXRjaGVkUm91dGUgPSBrZXkubWF0Y2gobmV3IFJlZ0V4cCgnL14nICt3aW5kb3cubG9jYXRpb24uaGFzaCArICcvJykpO1xuXHRcdC8vIFx0aWYgKCFtYXRjaGVkUm91dGUpIHJldHVybjtcblxuXHRcdC8vIFx0dmFyIG1hdGNoZWRSb3V0ZUxpc3RlbmVyID0gc2VsZlttYXRjaGVkUm91dGVdO1xuXHRcdC8vIFx0bWF0Y2hlZFJvdXRlTGlzdGVuZXIoKTtcblx0XHQvLyB9KTtcblxuXG5cdFx0Ly8gRmluYWxseSwgdHJpZ2dlciBhZnRlclJlbmRlciBtZXRob2Rcblx0XHRzZWxmLmFmdGVyUmVuZGVyKCk7XG5cblxuXHRcdC8vIFJ1biBkYXRhIGJpbmRpbmdzXG5cdFx0Ly8gVE9ETzogZG9uJ3QgY2FsbCB0aGlzIGhlcmUtLSBqdXN0IGRvIHdoZW4gaW5pdGlhbGx5IGluc2VydGluZyB0aGUgdGVtcGxhdGUgaW50byB0aGUgRE9NXG5cdFx0Ly8gKHRoaXMgaXMgaW5lZmZpY2llbnQpXG5cdFx0cmVuZGVyRGF0YUJpbmRpbmdzLmNhbGwoc2VsZik7XG5cblxuXHRcdC8vIEFkZCBkYXRhIGF0dHJpYnV0ZXMgdG8gdGhpcyBjb21wb25lbnQncyAkZWwsIHByb3ZpZGluZyBhY2Nlc3Ncblx0XHQvLyB0byB3aGV0aGVyIHRoZSBlbGVtZW50IGhhcyB2YXJpb3VzIERPTSBiaW5kaW5ncyBmcm9tIHN0eWxlc2hlZXRzLlxuXHRcdC8vIChoYW5keSBmb3IgZGlzYWJsaW5nIHRleHQgc2VsZWN0aW9uIGFjY29yZGluZ2x5LCBldGMuKVxuXHRcdC8vXG5cdFx0Ly8gLT4gZGlzYWJsZSBmb3IgdGhpcyBjb21wb25lbnQgd2l0aCBgdGhpcy5hdHRyRmxhZ3MgPSBmYWxzZWBcblx0XHQvLyAtPiBvciBnbG9iYWxseSB3aXRoIGBGUkFNRVdPUksuYXR0ckZsYWdzID0gZmFsc2VgXG5cdFx0Ly9cblx0XHQvLyBUT0RPOiBtYWtlIGl0IHdvcmsgd2l0aCBkZWxlZ2F0ZWQgRE9NIGV2ZW50IGJpbmRpbmdzXG5cdFx0Ly9cblx0XHRpZiAoc2VsZi5hdHRyRmxhZ3MgIT09IGZhbHNlICYmIEZSQU1FV09SSy5hdHRyRmxhZ3MgIT09IGZhbHNlKSB7XG5cdFx0XHRET00uZmxhZ0JvdW5kRXZlbnRzKHNlbGYpO1xuXHRcdH1cblx0fSk7XG59O1xuIiwiXG4vKipcbiAqIFRPRE86XG4gKiBUcnkgb3V0IGEgZGlmZmVyZW50IGFwcHJvYWNoIGZvciB0aGUgbG9naWMgaW4gYHJlbmRlckNvbGxlY3Rpb25gXG4gKiBiZWxvdyBieSBvdmVybG9hZGluZyBgcmVnaW9uLmF0dGFjaCgpYC5cbiAqXG4gKiBFeGFtcGxlIHVzYWdlOiAoaW4gcGFyZW50IGNvbXBvbmVudClcbiAqID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gKiB0aGlzLnNvbWVSZWdpb24uYXR0YWNoKCdTb21lT3RoZXJDb21wb25lbnQnLHsgY29sbGVjdGlvbjogU29tZUNvbGxlY3Rpb24gfSlcbiAqXG4gKiAtb3ItXG4gKlxuICogdGhpcy5zb21lUmVnaW9uLnJlcGVhdCgnU29tZU90aGVyQ29tcG9uZW50Jyx7IGNvbGxlY3Rpb246IFNvbWVDb2xsZWN0aW9uIH0pXG4gKi9cblxuLyoqXG4gKiByZW5kZXJDb2xsZWN0aW9uKClcbiAqXG4gKiBSZXVzYWJsZSBsb2dpYyB0byByZW5kZXIgYSBjb2xsZWN0aW9uIGludG8gYSByZWdpb25cbiAqXG4gKiBUT0RPOiBtb3ZlIG9udG8gUmVnaW9uIG9iamVjdCBpbnN0ZWFkLi4uICBTZWUgZ2lzdC5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gY29sbGVjdGlvbiAtIGRhdGEgc291cmNlXG4gKiBAcGFyYW0ge09wdGlvbnN9IG9wdGlvbnNcbiAqXHRcdDogb3B0aW9ucy5pdGVtVGVtcGxhdGUge1N0cmluZ30gLSBuYW1lIG9mIHRlbXBsYXRlL2NvbXBvbmVudCB0byB1c2UgYXMgaXRlbVxuICpcdFx0OiBvcHRpb25zLmludG9SZWdpb24ge09iamVjdH0gLSB0aGUgZGVzdGluYXRpb24gcmVnaW9uXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGNvbGxlY3Rpb24sIG9wdGlvbnMpIHtcblxuXHQvLyBSZXF1aXJlZDpcblx0aWYgKHR5cGVvZiBjb2xsZWN0aW9uICE9PSAnb2JqZWN0JykgdGhyb3cgbmV3IEVycm9yKCdyZW5kZXJDb2xsZWN0aW9uIDo6IFVua25vd24vaW52YWxpZCBjb2xsZWN0aW9uLCBcIicgKyAoY29sbGVjdGlvbiAmJiBjb2xsZWN0aW9uLnR5cGUpICsgJ1wiJyk7XG5cdGlmICghb3B0aW9ucy5pdGVtVGVtcGxhdGUpIHRocm93IG5ldyBFcnJvcigncmVuZGVyQ29sbGVjdGlvbiA6OiBvcHRpb25zLml0ZW1UZW1wbGF0ZSByZXF1aXJlZCEnKTtcblx0aWYgKCFvcHRpb25zLmludG9SZWdpb24pIHRocm93IG5ldyBFcnJvcigncmVuZGVyQ29sbGVjdGlvbiA6OiBvcHRpb25zLmludG9SZWdpb24gcmVxdWlyZWQhJyk7XG5cblxuXHQvLyBEZXRlcm1pbmUgY29sbGVjdGlvbk5hbWVcblx0dmFyIGNvbGxlY3Rpb25OYW1lID0gY29sbGVjdGlvbi50eXBlO1xuXG5cdC8vIFRhcmdldCByZWdpb25cblx0dmFyIG91dGxldCA9IG9wdGlvbnMuaW50b1JlZ2lvbjtcblxuXHQvLyBTdWItY29tcG9uZW50XG5cdHZhciBzdWJjb21wb25lbnROYW1lID0gb3B0aW9ucy5pdGVtVGVtcGxhdGU7XG5cblx0Ly8gTmFtZSBvZiB0aGUgY29sbGVjdGlvbiBzdGF0ZSBhdHRyaWJ1dGUgdGhhdCB3aWxsZSBiZSBpbmplY3RlZCBpbnRvIHRoZSBIVE1MXG5cdC8vIFVzZWQgZm9yIHRoZSBkZWZhdWx0IHJlbmRlciBiZWhhdmlvci5cblx0dmFyIGJvZHlTdGF0ZUF0dHJpYnV0ZSA9ICdkYXRhLScgKyBjb2xsZWN0aW9uTmFtZSArICctc3RhdGUnO1xuXG5cblxuXG5cdC8qKlxuXHQgKiBEZWZhdWx0IHJlbmRlciBtZXRob2RzXG5cdCAqXG5cdCAqIE92ZXJyaWRlIGRlZmF1bHQgcmVuZGVyIG1ldGhvZHMgd2l0aCBvcHRpb25zIGlmIHNwZWNpZmllZFxuXHQgKi9cblxuXHQvLyBEZWZhdWx0IHJlbmRlciBsb2dpYyBmb3IgZXJyb3Igc3RhdGUgKGUuZy4gcmVkIHRleHQpXG5cdHZhciByZW5kZXJFcnJvciA9IG9wdGlvbnMucmVuZGVyRXJyb3IgfHwgZnVuY3Rpb24gcmVuZGVyRXJyb3IgKCkge1xuXHRcdEZSQU1FV09SSy5lcnJvcignQW4gZXJyb3Igb2NjdXJyZWQgd2hpbGUgbG9hZGluZyAnICsgY29sbGVjdGlvbk5hbWUgKyAnIDo6XFxuJywgY29sbGVjdGlvbi5lcnJvcik7XG5cblx0XHQvLyBTZXQgYSBkYXRhIGF0dHJpYnV0ZSBvbiBIVE1MIGJvZHlcblx0XHQkKCdib2R5JykuYXR0cihib2R5U3RhdGVBdHRyaWJ1dGUsICdlcnJvcicpO1xuXHR9O1xuXG5cdC8vIERlZmF1bHQgcmVuZGVyIGxvZ2ljIGZvciBsb2FkaW5nIHN0YXRlIChlLmcuIHNwaW5uZXIpXG5cdHZhciByZW5kZXJTeW5jaW5nID0gb3B0aW9ucy5yZW5kZXJTeW5jaW5nIHx8IGZ1bmN0aW9uIHJlbmRlclN5bmNpbmcoKSB7XG5cdFx0RlJBTUVXT1JLLmxvZygnTG9hZGluZyAnICsgY29sbGVjdGlvbk5hbWUgKyAnLi4uJyk7XG5cblx0XHQvLyBTZXQgc3RhdGUgYXR0cmlidXRlIG9uIEhUTUwgYm9keVxuXHRcdCQoJ2JvZHknKS5hdHRyKGJvZHlTdGF0ZUF0dHJpYnV0ZSwgJ3N5bmNpbmcnKTtcblx0fTtcblxuXHQvLyBEZWZhdWx0IHJlbmRlciBsb2dpYyB0byBjbGVhbiB1cCBhZnRlciBhIHN1Y2Nlc3NmdWwgc3luYy9sb2FkXG5cdHZhciByZW5kZXJTeW5jZWQgPSBvcHRpb25zLnJlbmRlclN5bmNlZCB8fCBmdW5jdGlvbiByZW5kZXJTeW5jZWQoKSB7XG5cdFx0RlJBTUVXT1JLLmxvZyhjb2xsZWN0aW9uLmxlbmd0aCArICcgJyArIGNvbGxlY3Rpb25OYW1lICsgJyBmZXRjaGVkIHN1Y2Nlc3NmdWxseS4nKTtcblxuXHRcdC8vIFNldCBzdGF0ZSBhdHRyaWJ1dGUgb24gSFRNTCBib2R5XG5cdFx0JCgnYm9keScpLmF0dHIoYm9keVN0YXRlQXR0cmlidXRlLCAncmVhZHknKTtcblx0fTtcblxuXHQvLyBEZWZhdWx0IHJlbmRlciBsb2dpYyBmb3IgaXRlbXMgaW4gY29sbGVjdGlvblxuXHR2YXIgcmVuZGVyUmVzZXQgPSBvcHRpb25zLnJlbmRlclJlc2V0IHx8IGZ1bmN0aW9uIHJlbmRlclJlc2V0KCkge1xuXG5cdFx0Ly8gQ2xlYW4gb3V0IHRoZSByZWdpb24sIHdyYXAgaW4gYSB0cnkvY2F0Y2ggdG8gc3RvcCB0aGUgZXhlY3V0aW9uXG5cdFx0dHJ5IHtcblx0XHRcdG91dGxldC5lbXB0eSgpO1xuXHRcdH0gY2F0Y2ggKGUpIHt9XG5cblxuXHRcdC8vIFRPRE86IFNtYXJ0IG1lcmdlIHRvIG1pbmltaXplIERPTSBxdWVyaWVzXG5cdFx0Y29sbGVjdGlvbi5lYWNoKGZ1bmN0aW9uIChtb2RlbCkge1xuXHRcdFx0Ly8gRm9yIGVhY2ggbW9kZWwgZm91bmQsIGFwcGVuZCBhIHN1YmNvbXBvbmVudCB0byB0aGUgcmVnaW9uXG5cdFx0XHRvdXRsZXQuYXBwZW5kKHN1YmNvbXBvbmVudE5hbWUsIHsgbW9kZWw6IG1vZGVsIH0pO1xuXHRcdH0pO1xuXHR9O1xuXG5cdC8qKlxuXHQgKiByZW5kZXJBZGQgKCBtb2RlbCwgW2F0SW5kZXhdIClcblx0ICpcblx0ICogQHBhcmFtIHtNb2RlbH0gbW9kZWxcdFx0XHRcdFx0XHQtIHRoZSBCYWNrYm9uZSBtb2RlbCB0aGF0IHdhcyBhZGRlZFxuXHQgKiBAcGFyYW0ge0ludGVnZXJ9IGF0SW5kZXhcdFx0XHRcdC0gKG9wdGlvbmFsLSBkZWZhdWx0cyB0byBjb2xsZWN0aW9uLmxlbmd0aClcblx0ICpcblx0ICogRGVmYXVsdCByZW5kZXIgbG9naWMgZm9yIHRoZSBjYXNlIHdoZXJlIGFuIGl0ZW0gaXMgYWRkZWQgdG8gdGhlIGNvbGxlY3Rpb24uXG5cdCAqL1xuXHR2YXIgcmVuZGVyQWRkID0gb3B0aW9ucy5yZW5kZXJBZGQgfHwgZnVuY3Rpb24gcmVuZGVyQWRkKCBtb2RlbCwgYXRJbmRleCApIHtcblx0XHRpZiAoIHR5cGVvZiBhdEluZGV4ID09PSAnbnVtYmVyJykge1xuXHRcdFx0cmV0dXJuIG91dGxldC5pbnNlcnQoYXRJbmRleCwgc3ViY29tcG9uZW50TmFtZSwgeyBtb2RlbDogbW9kZWwgfSk7XG5cdFx0fVxuXHRcdHJldHVybiBvdXRsZXQuYXBwZW5kKHN1YmNvbXBvbmVudE5hbWUsIHsgbW9kZWw6IG1vZGVsIH0pO1xuXHR9O1xuXG5cdC8qKlxuXHQgKiByZW5kZXJSZW1vdmUoIGF0SW5kZXggKVxuXHQgKlxuXHQgKiBAcGFyYW0ge0ludGVnZXJ9IGF0SW5kZXhcdFx0XHQtIHRoZSBmb3JtZXIgaW5kZXggb2YgdGhlIEJhY2tib25lIG1vZGVsIHRoYXQgd2FzIHJlbW92ZWRcblx0ICpcblx0ICogRGVmYXVsdCByZW5kZXIgbG9naWMgZm9yIHRoZSBjYXNlIHdoZXJlIGFuIGl0ZW0gaXMgcmVtb3ZlZCBmcm9tIHRoZSBjb2xsZWN0aW9uLlxuXHQgKi9cblx0dmFyIHJlbmRlclJlbW92ZSA9IG9wdGlvbnMucmVuZGVyUmVtb3ZlIHx8IGZ1bmN0aW9uIHJlbmRlclJlbW92ZSggYXRJbmRleCApIHtcblx0XHRvdXRsZXQucmVtb3ZlKCBhdEluZGV4ICk7XG5cdH07XG5cblxuXG5cblxuXG5cdC8qKlxuXHQgKiBCb290c3RyYXBcblx0ICpcblx0ICogUmVuZGVycyBpbml0aWFsIHN0YXRlIG9mIGNvbGxlY3Rpb24gaW50byBvdXIgcmVnaW9uXG5cdCAqIHVzaW5nIG91ciBjaGlsZCB0ZW1wbGF0ZS5cblx0ICovXG5cblx0Ly8gSWYgb3VyIGNvbGxlY3Rpb24gaXMgZmV0Y2hpbmcsIHJlbmRlciB0aGUgZmV0Y2hpbmcgKGxvYWRpbmcpIHN0YXRlLlxuXHRpZiAoY29sbGVjdGlvbi5zeW5jaW5nKSB7XG5cdFx0cmVuZGVyU3luY2luZygpO1xuXHR9XG5cblxuXHQvLyBJZiBvdXIgY29sbGVjdGlvbiBmYWlsZWQgdG8gZmV0Y2ggKGkuZS4gcmVjZWl2ZWQgYSA0eHggb3IgNXh4IGVycm9yIGNvZGUpXG5cdC8vIHJlbmRlciBhbiBlcnJvciBzdGF0ZVxuXHQvL1xuXHQvLyBIYW5kbGUgdGhlIGNhc2Ugb2YgbXVsdGlwbGUgZXJyb3Igc3RhdGVzIHdpdGggZGlmZmVyZW50IHN0eWxlcyBoZXJlIGFzIHdlbGwuXG5cdGVsc2UgaWYgKGNvbGxlY3Rpb24uZXJyb3IpIHtcblx0XHRyZW5kZXJFcnJvcigpO1xuXHR9XG5cblxuXHQvLyBPdGhlcndpc2Ugb3VyIGNvbGxlY3Rpb24gaXMgbG9hZGVkIGFuZCByZWFkeSxcblx0Ly8gc28gZ28gYWhlYWQgYW5kIHJlbmRlciBpdCBpbnRvIHRoZSB0YXJnZXQgcmVnaW9uLlxuXHQvL1xuXHQvLyAoYWx0ZXJuYXRpdmVseSBhdCB0aGlzIHBvaW50LCBhIGN1c3RvbSBgZW1wdHlgIHN0YXRlIG1heSBiZSByZW5kZXJlZClcblx0Ly8gY29uc29sZS5sb2coJ1RoZSBjb2xsZWN0aW9uICcgKyBzdWJjb21wb25lbnROYW1lICsgJy0tLS0+Jyk7XG5cdGVsc2UgcmVuZGVyUmVzZXQoKTtcblxuXG5cblxuXG5cblxuXHQvKipcblx0ICogQmluZCBldmVudHNcblx0ICpcblx0ICogTGlzdGVuIGZvciBzdGF0ZSBjaGFuZ2VzIChzeW5jaW5nLCBzeW5jZWQsIHNlcnZlciBlcnJvciwgYWRkLCByZW1vdmUsIHNvcnQsIGV0Yy4pXG5cdCAqIFRoZXNlIG1hbnVhbCBiaW5kaW5ncyBjYW4gYmUgcmVtb3ZlZCB3aGVuIGNvcmUgZnJhbWV3b3JrIHN1cHBvcnRzIHJlbmRlci10aW1lIGNvbGxlY3Rpb25cblx0ICogYmluZGluZ3MuICBGb3Igbm93LCBkb2luZyBpdCB0aGlzIHdheSByYXRoZXIgdGhhbiBwYXRjaGluZyB0aGUgY29yZSB0byB0ZXN0IG91ciBzdHJ1Y3R1cmFsXG5cdCAqIGFzc3VtcHRpb25zLlxuXHQgKi9cblxuXHQvLyBXaGVuIGEgZmV0Y2ggaXMgaW5pdGlhdGVkIGZyb20gdGhlIHNlcnZlci4uLlxuXHQvL1xuXHQvLyAoYWZ0ZXIgYEJhY2tib25lLnN5bmNgIGJlZ2lucyBhIHJlbW90ZSByZXF1ZXN0KVxuXHR0aGlzLmxpc3RlblRvKGNvbGxlY3Rpb24sICdyZXF1ZXN0JywgZnVuY3Rpb24gYWZ0ZXJSZXF1ZXN0ICgpIHtcblx0XHRyZW5kZXJTeW5jaW5nKCk7XG5cdH0pO1xuXG5cdC8vIFdoZW4gYSBmZXRjaCBjb21wbGV0ZXMgc3VjY2Vzc2Z1bGx5IGFuZCBuZXcgZGF0YSBpcyBsb2FkZWQuLi5cblx0Ly9cblx0Ly8gKGFmdGVyIHRoaXMgY29tcG9uZW50IGlzIGFscmVhZHkgaW5zdGFudGlhdGVkKVxuXHR0aGlzLmxpc3RlblRvKGNvbGxlY3Rpb24sICdzeW5jJywgZnVuY3Rpb24gYWZ0ZXJTeW5jICgpIHtcblx0XHRyZW5kZXJTeW5jZWQoKTtcblx0XHRyZW5kZXJSZXNldCgpO1xuXHR9KTtcblxuXHQvLyBXaGVuIHNlcnZlciBzZW5kcyBhIHJlc3BvbnNlIHcvIGFuIGVycm9yIGNvZGVcblx0Ly9cblx0Ly8gKGFmdGVyIHRoaXMgY29tcG9uZW50IGlzIGFscmVhZHkgaW5zdGFudGlhdGVkKVxuXHR0aGlzLmxpc3RlblRvKGNvbGxlY3Rpb24sICdlcnJvcicsIGZ1bmN0aW9uIGFmdGVyU3luY0Vycm9yIChjb2xsZWN0aW9uLCB4aHIpIHtcblxuXHRcdC8vIElnbm9yZSBhYm9ydCBcImVycm9yXCJcblx0XHQvL1xuXHRcdC8vIFdoeT8gYmVjYXVzZSBpdCdzIG5vdCBhY3R1YWxseSBhbiBlcnJvci5cblx0XHQvLyBOb3Qgc3VyZSB3aHkgdGhpcyB0cmlnZ2VycyBCYWNrYm9uZS5Db2xsZWN0aW9uJ3MgYGVycm9yYCBldmVudC4uLlxuXHRcdC8vXG5cdFx0Ly8gSWYgdHdvIGZldGNoZXMgb2NjdXIgb24gdGhlIHNhbWUgY29sbGVjdGlvbiBhdCB0aGUgc2FtZSB0aW1lLFxuXHRcdC8vIHdlIGFib3J0IHRoZSBvbGQgWEhSIHJlcXVlc3Qgb3Vyc2VsdmVzIGlmIGl0J3Mgc3RpbGwgcnVubmluZylcblx0XHRpZiAoeGhyICYmIHhoci5zdGF0dXNUZXh0ID09PSAnYWJvcnQnKSByZXR1cm47XG5cblx0XHRyZW5kZXJFcnJvcigpO1xuXHR9KTtcblxuXHQvLyBXaGVuIGEgbW9kZWwgaXMgYWRkZWQuLi5cblx0Ly9cblx0Ly8gTGlzdGVuIGZvciBuZXcgbW9kZWxzLCBhbmQgaW5zZXJ0IGEgY2hpbGQgdGVtcGxhdGVcblx0Ly8gYXQgdGhlIGFwcHJvcHJpYXRlIGluZGV4IHdpdGhpbiB0aGUgcmVnaW9uLlxuXHR0aGlzLmxpc3RlblRvKGNvbGxlY3Rpb24sICdhZGQnLCBmdW5jdGlvbiBhZnRlckFkZCAoIG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zICkge1xuXHRcdHJlbmRlckFkZCggbW9kZWwsIG9wdGlvbnMuYXQgKTtcblx0fSk7XG5cblx0Ly8gV2hlbiBhIG1vZGVsIGlzIHJlbW92ZWQuLi5cblx0Ly9cblx0Ly8gR3JhYiBtb2RlbCdzIHJlbGF0aXZlIGluZGV4IHdpdGhpbiBjb2xsZWN0aW9uIGFuZCByZW1vdmVcblx0Ly8gdGhlIGNoaWxkIHRlbXBsYXRlIGF0IHRoZSBzYW1lIGluZGV4IHdpdGhpbiB0aGUgcmVnaW9uLlxuXHR0aGlzLmxpc3RlblRvKGNvbGxlY3Rpb24sICdyZW1vdmUnLCBmdW5jdGlvbiBhZnRlclJlbW92ZSAoIG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zICkge1xuXHRcdHJlbmRlclJlbW92ZSggb3B0aW9ucy5pbmRleCApO1xuXHR9KTtcblxuXG5cbn07XG4iLCIvKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXNcbiAqL1xuXG52YXIgZGF0YUJpbmRpbmdzID0ge1xuXHR0ZXh0ICAgIDogcmVxdWlyZSgnLi9kYXRhQmluZGluZ3MvdGV4dCcpLFxuXHQnY2xhc3MnIDogcmVxdWlyZSgnLi9kYXRhQmluZGluZ3MvY2xhc3MnKVxufTtcblxuXG5cbi8qKlxuICogUmVuZGVyIG1vZGVsIGJpbmRpbmdzLlxuICogICArIGBiaW5kLXRleHRgXG4gKiAgICsgbW9yZSB0byBjb21lXG4gKlxuICogQ2FsbGVkIGJ5IENvbXBvbmVudCB3aGVuIGl0cyBtb2RlbCBjaGFuZ2VzLlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcmVuZGVyRGF0YUJpbmRpbmdzICgpIHtcblx0RlJBTUVXT1JLLmRlYnVnKCdSZW5kZXJpbmcgZGF0YSBiaW5kaW5ncyBmb3IgJywgdGhpcy5pZCwnY29tcG9uZW50Li4uJyk7XG5cblx0Ly8gRW5zdXJlIHRoYXQgbW9kZWwgZXhpc3RzXG5cdGlmICghdGhpcy5tb2RlbCkge1xuXHRcdHRocm93IG5ldyBFcnJvcihcblx0XHRcdCdUcnlpbmcgdG8gYm9vdHN0cmFwIGRhdGEgYmluZGluZ3MgZm9yIGNvbXBvbmVudCAoJyArIHRoaXMuaWQgKyAnKSwgJyArXG5cdFx0XHQnYnV0IGl0IGhhcyBubyBtb2RlbCEnKTtcblx0fVxuXHR2YXIgbW9kZWwgPSB0aGlzLm1vZGVsO1xuXG5cdC8vIGpRdWVyeSBzZWxlY3RvciBmb3IgZ3JhYmJpbmcgYWxsIGVsZW1lbnRzIHcvIGRhdGEgYmluZGluZ3Ncblx0dmFyIGJpbmRpbmdTZWxlY3RvciA9ICdbYmluZC10ZXh0XSwgOm1hdGNoQXR0cihcIl5iaW5kLWNsYXNzLSokXCIpJztcblxuXHQvLyBHZXQgZWxlbWVudHMgaW4gdGhpcyBjb21wb25lbnQgd2hpY2ggaGF2ZSBkYXRhIGJpbmRpbmdzXG5cdC8vIChpZ25vcmVzIGNvbnRlbnRzIG9mIHJlZ2lvbnMgaWYgdGhleSBleGlzdClcblx0dmFyICRib3VuZEVsZW1lbnRzID0gXyRzZWxlY3RPdXRlci5jYWxsKHRoaXMsIGJpbmRpbmdTZWxlY3Rvcik7XG5cblx0Ly8gTG9vcCB0aHJvdWdoIGVhY2ggYm91bmQgYXR0cmlidXRlIG9mIGVhY2ggYm91bmQgZWxlbWVudFxuXHQvLyBhbmQgY2FsbCB0aGUgYXBwcm9wcmlhdGUgcmVuZGVyIG1ldGhvZC5cblx0JGJvdW5kRWxlbWVudHMuZWFjaChmdW5jdGlvbiBlYWNoQm91bmRFbGVtZW50ICgpIHtcblx0XHQkYm91bmRFbCA9ICQodGhpcyk7XG5cblx0XHR2YXIgYWxsQXR0cmlidXRlcyA9ICRib3VuZEVsWzBdLmF0dHJpYnV0ZXM7XG5cdFx0Xy5lYWNoKGFsbEF0dHJpYnV0ZXMsIGZ1bmN0aW9uIChhdHRyKSB7XG5cdFx0XHR2YXIgYXR0ck5hbWUgPSBhdHRyLm5vZGVOYW1lO1xuXG5cdFx0XHRfLmVhY2goIGRhdGFCaW5kaW5ncywgZnVuY3Rpb24gZWFjaEJpbmRpbmdGb3JtdWxhICggYmluZGluZyApIHtcblx0XHRcdFx0dmFyIG1hdGNoZXMgPSBhdHRyTmFtZS5tYXRjaChiaW5kaW5nLnJlZ2V4cCk7XG5cdFx0XHRcdGlmICggbWF0Y2hlcyApIHtcblx0XHRcdFx0XHRiaW5kaW5nLmZuKCRib3VuZEVsLCBtb2RlbCwgbWF0Y2hlcyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcbn07XG5cblxuXG5cbi8qKlxuICogTG9va3VwIHN1aXRhYmxlIGVsZW1lbnRzIHdpdGhpbiB0aGlzIGNvbXBvbmVudCdzICRlbCBjb250ZXh0LlxuICogSWdub3JlIHJlZ2lvbnMsIGFuZCBpbmNsdWRlIHRoZSB0b3AtbGV2ZWwgZWxlbWVudC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gYmluZGluZ1NlbGVjdG9yIC0gRE9NIHNlbGVjdG9yIHRvIHVzZVxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIF8kc2VsZWN0T3V0ZXIgKCBiaW5kaW5nU2VsZWN0b3IgKSB7XG5cblx0Ly8gTG9va3VwIG1hdGNoZXNcblx0dmFyICRtYXRjaGVzID0gdGhpcy4kKGJpbmRpbmdTZWxlY3Rvcik7XG5cblx0Ly8gSWYgdG9wLWxldmVsIGVsZW1lbnQgaW4gdGVtcGxhdGUgaGFzIGEgZGF0YS1iaW5kaW5nLCBpbmNsdWRlIGl0XG5cdGlmICh0aGlzLiRlbC5maWx0ZXIoYmluZGluZ1NlbGVjdG9yKSkge1xuXHRcdCRtYXRjaGVzID0gJC5tZXJnZSgkbWF0Y2hlcywgdGhpcy4kZWwpO1xuXHR9XG5cblx0Ly8gT21pdCBhbnl0aGluZyBpbnNpZGUgYSByZWdpb24sIHNpbmNlIHRob3NlIGJpbmRpbmdzIHdpbGwgaGF2ZSBhbHJlYWR5XG5cdC8vIGJlZW4gdGFrZW4gY2FyZSBvZiBieSBvbmUgb2YgdGhlIGRlc2NlbmRhbnQgY29tcG9uZW50KHMpIHdpdGhpbiB0aGUgcmVnaW9uLlxuXHQvL1xuXHQvLyBUT0RPOiBvcHRpbWl6ZSB0byBleGNsdWRlIHRoZXNlIGVsZW1lbnRzIGZyb20gdGhlIG9yaWdpbmFsIERPTSBzZWxlY3Rpb25cblx0JG1hdGNoZXMgPSAkbWF0Y2hlcy5ub3QoIHRoaXMuJCgncmVnaW9uICosIFtkYXRhLXJlZ2lvbl0gKicpICk7XG5cblx0cmV0dXJuICRtYXRjaGVzO1xufVxuXG5cblxuXG5cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuLy8vXG4vLyAgICAgICAgICAgICAgICAgICAgICAgICB8fFxuLy8gVE9ETzogbW92ZSB0aGlzIHRoaW5nICAgXFwvXG4vLyAgICAgICBpbnRvIGB1dGlsc2AgcHJibHlcbi8vXG5cbi8qKlxuICogQ3JlYXRlIHBzZXVkby1zZWxlY3RvciBmb3IgZ2V0dGluZyB3aWxkY2FyZCBkYXRhIGF0dHJpYnV0ZXMuXG4gKlxuICogVXNhZ2U6XG4gKiAkKFwiOm1hdGNoQXR0cignXmRhdGEtJylcIilcbiAqXG4gKiBTb3VyY2U6XG4gKiBodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8xMzIyMjUwOS80ODY1NDdcbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5qUXVlcnkuZXhwci5wc2V1ZG9zLm1hdGNoQXR0ciA9ICQuZXhwci5jcmVhdGVQc2V1ZG8oZnVuY3Rpb24oYXJnKSB7XG5cbiAgICB2YXIgcmVnZXhwID0gbmV3IFJlZ0V4cChhcmcpO1xuICAgIHJldHVybiBmdW5jdGlvbihlbGVtKSB7XG4gICAgICAgIGZvcih2YXIgaSA9IDA7IGkgPCBlbGVtLmF0dHJpYnV0ZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBhdHRyID0gZWxlbS5hdHRyaWJ1dGVzW2ldO1xuICAgICAgICAgICAgaWYocmVnZXhwLnRlc3QoYXR0ci5uYW1lKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9O1xufSk7XG5cbi8vICAvXFxcbi8vICB8fFxuLy9cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG5cblxuXG5cblxuXG5cblxuXG5cblxuXG5cblxuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbi8vLyAgICAgICAgICAgICAgICAgICAgIHx8XG4vLy8gQ1VSUkVOVExZIFVOVVNFRCAgICBcXC9cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cblxuLy8gUmVnZXhwcyBmb3IgZGV0ZWN0aW9uIG9mIHdpbGRjYXJkIG5hbWVkIHBhcmFtZXRlcnMgaW4gY3VzdG9tIGVsZW1lbnQgYXR0cmlidXRlIG5hbWVzLlxuLy8gdmFyIG9wdGlvbmFsUGFyYW0gPSAvXFwoKC4qPylcXCkvZztcbi8vIHZhciBuYW1lZFBhcmFtID0gLyhcXChcXD8pPzpcXHcrL2c7XG4vLyB2YXIgc3BsYXRQYXJhbSA9IC9cXCpcXHcrL2c7XG4vLyB2YXIgZXNjYXBlUmVnRXhwID0gL1tcXC17fVxcW1xcXSs/LixcXFxcXFxeJHwjXFxzXS9nO1xuXG5cbi8vIEJ1aWxkIHNlbGVjdG9yIGZvciBzdXBlcnNldCBvZiB0aGVzZSBiaW5kaW5nc1xuLy8gdmFyIF9hdHRyTmFtZVRvUmVnRXhwID0gZnVuY3Rpb24oIGF0dHJFeHByZXNzaW9uICkge1xuXG4vLyBcdGF0dHJFeHByZXNzaW9uID0gYXR0ckV4cHJlc3Npb24ucmVwbGFjZShlc2NhcGVSZWdFeHAsICdcXFxcJCYnKVxuLy8gXHRcdC5yZXBsYWNlKG9wdGlvbmFsUGFyYW0sICcoPzokMSk/Jylcbi8vIFx0XHQucmVwbGFjZShuYW1lZFBhcmFtLCBmdW5jdGlvbihtYXRjaCwgb3B0aW9uYWwpIHtcbi8vIFx0XHRcdHJldHVybiBvcHRpb25hbCA/IG1hdGNoIDogJyhbXlxcL10rKSc7XG4vLyBcdFx0fSlcbi8vIFx0XHQucmVwbGFjZShzcGxhdFBhcmFtLCAnKC4qPyknKTtcbi8vIFx0cmV0dXJuICdeJyArIGF0dHJFeHByZXNzaW9uICsgJyQnO1xuLy8gfTtcbi8vIHZhciBfZXh0cmFjdFBhcmFtZXRlcnMgPSBmdW5jdGlvbihyZWdleHAsIGF0dHJOYW1lLCBhdHRyRXhwcmVzc2lvbikge1xuLy8gXHR2YXIgcGFyYW1WYWx1ZXMgPSByZWdleHAuZXhlYyhhdHRyTmFtZSkuc2xpY2UoMSk7XG4vLyBcdHZhciBwYXJhbUtleXMgPSBuYW1lZFBhcmFtLmV4ZWMoYXR0ckV4cHJlc3Npb24pO1xuXG4vLyBcdGlmICghcGFyYW1LZXlzIHx8ICFwYXJhbVZhbHVlcykgcmV0dXJuIHt9O1xuXG4vLyBcdHZhciBuYW1lZFBhcmFtZXRlcnMgPSB7fTtcbi8vIFx0Y29uc29sZS5sb2coJ3BhcmFtVmFsdWVzOicscGFyYW1WYWx1ZXMpO1xuLy8gXHRfLmVhY2gocGFyYW1WYWx1ZXMsIGZ1bmN0aW9uIGVhY2hNYXRjaGluZ1BpZWNlKCBwYXJhbSwgaSApIHtcbi8vIFx0XHR2YXIga2V5ID0gcGFyYW1LZXlzW2ldO1xuLy8gXHRcdGtleSA9IGtleS5zbGljZSgxKTsgLy8gcmVtb3ZlIGA6YCBmcm9tIG5hbWVkIHBhcmFtXG4vLyBcdFx0bmFtZWRQYXJhbWV0ZXJzW2tleV0gPSBwYXJhbVZhbHVlc1tpXTtcbi8vIFx0fSk7XG4vLyBcdHJldHVybiBuYW1lZFBhcmFtZXRlcnM7XG4vLyB9O1xuXG5cblxuLy8gLyoqXG4vLyAgKiBSZW5kZXIgYSBzaW5nbGUgYmluZGluZ1xuLy8gICovXG4vLyB2YXIgX3JlbmRlckJpbmRpbmcgPSBmdW5jdGlvbiAoJG1hdGNoZWRFbCwgZG9tQXR0cmlidXRlTmFtZSwgbW9kZWwsIHJlbmRlckZuLCBuYW1lZFBhcmFtcykge1xuLy8gXHR2YXIgcmF3QmluZGluZyA9ICRtYXRjaGVkRWwuYXR0ciggZG9tQXR0cmlidXRlTmFtZSApO1xuLy8gXHQvLyBJZiBlbGVtZW50IGRvZXNuJ3QgY29udGFpbiB0aGUgc3BlY2lmaWVkIERPTSBhdHRyaWJ1dGUuLi5cbi8vIFx0Ly8gZmFpbCBzaWxlbnRseS5cbi8vIFx0aWYgKCAhcmF3QmluZGluZyApIHJldHVybjtcblxuLy8gXHQvLyBjb25zb2xlLmxvZygnZ2V0dGluZyAnLGRvbUF0dHJpYnV0ZU5hbWUsJ29uJywkbWF0Y2hlZEVsKTtcbi8vIFx0dmFyIG1vZGVsQXR0cmlidXRlTmFtZSA9IHJhd0JpbmRpbmcucmVwbGFjZSgvXlxcQC8sICcnKTtcbi8vIFx0RlJBTUVXT1JLLmRlYnVnKCdGb3VuZCBhIGJpbmRpbmcgOjonLCByYXdCaW5kaW5nLCAnOjonLCBuYW1lZFBhcmFtcyk7XG5cbi8vIFx0Ly8gSWYgbW9kZWwgZG9lc24ndCBjb250YWluIHRoZSBzcGVjaWZpZWQgYXR0cmlidXRlLi4uXG4vLyBcdGlmICggdHlwZW9mIG1vZGVsLmF0dHJpYnV0ZXNbbW9kZWxBdHRyaWJ1dGVOYW1lXSA9PT0gJ3VuZGVmaW5lZCcgKSB7XG5cbi8vIFx0XHQvLyBmYWlsIHNpbGVudGx5LlxuLy8gXHRcdHJldHVybjtcbi8vIFx0XHQvLyBGUkFNRVdPUksud2FybignQ2Fubm90IGJpbmQgYEAnK21vZGVsQXR0cmlidXRlTmFtZSsnIGZvciB0ZW1wbGF0ZS9jb21wb25lbnQgJyArXG4vLyBcdFx0Ly8gXHQnYCcgKyBjb21wb25lbnQuaWQgKydgLlxcbicrXG4vLyBcdFx0Ly8gXHQnTm8gc3VjaCBhdHRyaWJ1dGUgZXhpc3RzIGluIHRoZSBjb21wb25lbnRcXCdzIG1vZGVsLidcbi8vIFx0XHQvLyApO1xuLy8gXHR9XG5cbi8vIFx0Ly8gUmVuZGVyIGEgZGF0YSBiaW5kaW5nXG4vLyBcdHZhciBiaW5kaW5nVmFsID0gbW9kZWwuZ2V0KG1vZGVsQXR0cmlidXRlTmFtZSkgfHwgJyc7XG4vLyBcdHJlbmRlckZuKCAkbWF0Y2hlZEVsLCBiaW5kaW5nVmFsLCBuYW1lZFBhcmFtcyApO1xuLy8gfTtcblxuXG4vLyAvKipcbi8vICAqIFJlbmRlciB0aGUgc3BlY2lmaWVkIHR5cGUgb2YgZGF0YSBiaW5kaW5nc1xuLy8gICpcbi8vICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4vLyAgKlx0XHRAb3B0aW9uIHtGdW5jdGlvbn0gcmVuZGVyRm4gKCRlbCwgdmFsLCBwYXJhbXMpXHQtPiBmdW5jdGlvbiB3aGljaCByZW5kZXJzIHRoZSBkYXRhIGJpbmRpbmcgZm9yIHRoZSBzcGVjaWZpZWQgZWxlbWVudFxuLy8gICpcdFx0XHRAcGFyYW0ge0pRdWVyeUVsZW1lbnR9ICRlbFxuLy8gICpcdFx0XHRAcGFyYW0gez99IHZhbCAtPiB2YWx1ZSBvZiBib3VuZCBtb2RlbCBhdHRyaWJ1dGVcbi8vICAqXHRcdFx0QHBhcmFtIHtPYmplY3R9IHBhcmFtcyAtPiBrZXllZCBvYmplY3Qgb2YgZHluYW1pYyBwYXJhbWV0ZXJzIGZyb20gdGhlIG5hbWUgb2YgdGhlIGF0dHJpYnV0ZSBpdHNlbGZcbi8vICAqXHRcdEBvcHRpb24ge1N0cmluZ30gYXR0cmlidXRlIC0+IG5hbWUgb2YgYm91bmQgYXR0cmlidXRlLCBlLmcuICdiaW5kLXRleHQnXG4vLyAgKlx0XHRAb3B0aW9uIHtDb21wb25lbnR9IGNvbXBvbmVudFxuLy8gICpcdFx0QG9wdGlvbiB7QmFja2JvbmUuTW9kZWx9IFttb2RlbF0gLSBkZWZhdWx0cyB0byBgY29tcG9uZW50Lm1vZGVsYFxuLy8gICovXG4vLyB2YXIgX3JlbmRlckJpbmRpbmdzID0gZnVuY3Rpb24gKCBvcHRpb25zICkge1xuLy8gXHR2YXIgY29tcG9uZW50ID0gb3B0aW9ucy5jb21wb25lbnQ7XG4vLyBcdHZhciBhdHRyaWJ1dGVFeHByZXNzaW9uID0gb3B0aW9ucy5hdHRyaWJ1dGU7XG4vLyBcdHZhciBtb2RlbCA9IG9wdGlvbnMubW9kZWwgfHwgb3B0aW9ucy5jb21wb25lbnQubW9kZWw7XG5cblxuLy8gXHQvLyBDYWxjdWxhdGUgc3RyaW5nIHdoaWNoIGNhbiBiZSBcIm5ldy1lZFwiIGludG8gYSBSZWdFeHBcbi8vIFx0dmFyIGF0dHJSZWdFeHBTdHIgPSBfYXR0ck5hbWVUb1JlZ0V4cChhdHRyaWJ1dGVFeHByZXNzaW9uKTtcbi8vIFx0dmFyIGF0dHJSZWdFeHAgPSBuZXcgUmVnRXhwKGF0dHJSZWdFeHBTdHIpO1xuXG5cbi8vIFx0dmFyIGJvdW5kQXR0clNlbGVjdG9yID0gJzptYXRjaEF0dHIoXCInICsgYXR0clJlZ0V4cFN0ciArICdcIiknO1xuXG4vLyBcdC8vIEZpbmQgYWxsIHJlbGV2YW50IGRlc2NlbmRhbnQgZWxlbWVudHNcbi8vIFx0dmFyICRtYXRjaGVzID0gX2dldCRNYXRjaGVzKGJvdW5kQXR0clNlbGVjdG9yLCBjb21wb25lbnQpO1xuXG4vLyBcdC8vIEVhcmx5IGV4aXQgZm9yIHNpbXBsZSBiaW5kaW5ncyAody9vIGJvdW5kIHBhcmFtcylcbi8vIFx0aWYgKCAhYXR0cmlidXRlRXhwcmVzc2lvbi5tYXRjaCgvXFw6LykpIHtcbi8vIFx0XHQkbWF0Y2hlcy5lYWNoKGZ1bmN0aW9uICgpIHtcbi8vIFx0XHRcdF9yZW5kZXJCaW5kaW5nKCQodGhpcyksIGF0dHJpYnV0ZUV4cHJlc3Npb24sIG1vZGVsLCBvcHRpb25zLnJlbmRlckZuLCB7fSk7XG5cbi8vIFx0XHR9KTtcbi8vIFx0XHRyZXR1cm47XG4vLyBcdH1cblxuLy8gXHRjb25zb2xlLmxvZygnXFxuUmVuZGVyaW5nIHBhcmFtZXRlcml6ZWQgZGF0YSBiaW5kaW5nOiAnLGF0dHJSZWdFeHApO1xuXG4vLyBcdC8vIFRPRE86IGJhdGNoIGl0IHVwIHNvIHdlIG9ubHkgZG8gb25lIERPTSBxdWVyeVxuLy8gXHQkbWF0Y2hlcy5lYWNoKGZ1bmN0aW9uIGVhY2hFbGVtZW50V2l0aEFCaW5kaW5nICgpIHtcbi8vIFx0XHR2YXIgJG1hdGNoZWRFbCA9ICQodGhpcyk7XG5cbi8vIFx0XHQvLyBHZXQgYWxsIGF0dHJpYnV0ZXMgZm9yIHRoaXMgJGVsIGFuZCBmaWx0ZXIgYSBzZXQgb2YgbWF0Y2hpbmcgbmFtZXMvcGFyYW1zXG4vLyBcdFx0dmFyIGFsbERPTUF0dHJOYW1lcyA9IF8ubWFwKCAkbWF0Y2hlZEVsWzBdLmF0dHJpYnV0ZXMsIGZ1bmN0aW9uIChlbCkge1xuLy8gXHRcdFx0cmV0dXJuIGVsLm5vZGVOYW1lO1xuLy8gXHRcdH0pO1xuLy8gXHRcdGNvbnNvbGUubG9nKCdhbGxET01BdHRyTmFtZXMgZm9yIGVsJyxhbGxET01BdHRyTmFtZXMsICRtYXRjaGVkRWwpO1xuLy8gXHRcdHZhciBtYXRjaGluZ0RPTUF0dHJzID0ge307XG4vLyBcdFx0Xy5lYWNoKCBhbGxET01BdHRyTmFtZXMsIGZ1bmN0aW9uIGVhY2hBdHRyaWJ1dGUgKCBkb21BdHRyTmFtZSApIHtcbi8vIFx0XHRcdC8vIGNvbnNvbGUubG9nKCdjaGVja2luZycsZG9tQXR0ck5hbWUpO1xuLy8gXHRcdFx0aWYgKCBkb21BdHRyTmFtZS5tYXRjaChhdHRyUmVnRXhwKSkge1xuLy8gXHRcdFx0XHRtYXRjaGluZ0RPTUF0dHJzW2RvbUF0dHJOYW1lXSA9IF9leHRyYWN0UGFyYW1ldGVycyggYXR0clJlZ0V4cCwgZG9tQXR0ck5hbWUsIGF0dHJpYnV0ZUV4cHJlc3Npb24gKTtcbi8vIFx0XHRcdFx0Ly8gY29uc29sZS5sb2coJywgZ290JyxtYXRjaGluZ0RPTUF0dHJzW2RvbUF0dHJOYW1lXSwgJyAoKCgnLGRvbUF0dHJOYW1lLCBhdHRyaWJ1dGVFeHByZXNzaW9uKTtcbi8vIFx0XHRcdH1cbi8vIFx0XHR9KTtcblxuXG4vLyBcdFx0Y29uc29sZS5sb2coJyAqKioqIG1hdGNoaW5nRE9NQXR0cnMgOjonLCBtYXRjaGluZ0RPTUF0dHJzKTtcblxuLy8gXHRcdHRocm93IG5ldyBFcnJvcignaHdhYWEnKTtcbi8vIFx0XHRfLmVhY2gobWF0Y2hpbmdET01BdHRycywgZnVuY3Rpb24gKCBuYW1lZFBhcmFtcywgZG9tQXR0cmlidXRlTmFtZSApIHtcbi8vIFx0XHRcdF9yZW5kZXJCaW5kaW5nKCRtYXRjaGVkRWwsIGRvbUF0dHJpYnV0ZU5hbWUsIG1vZGVsLCBvcHRpb25zLnJlbmRlckZuLCBuYW1lZFBhcmFtcyk7XG4vLyBcdFx0fSk7XG5cbi8vIFx0fSk7XG4vLyB9O1xuXG5cblxuIiwiLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzXG4gKi9cbnZhciBkZWxldGVBbGxSZWdpb25zID0gcmVxdWlyZSgnLi9kZWxldGVBbGxSZWdpb25zJyksXG5cdGVsMkRlZmF1bHRUZW1wbGF0ZUlEID0gcmVxdWlyZSgnLi4vdXRpbHMvZWwyRGVmYXVsdFRlbXBsYXRlSUQnKTtcblxuXG5cbi8qKlxuICogSW5zdGFudGlhdGUgcmVnaW9uIGNvbXBvbmVudHMgYW5kIGFwcGVuZCBhbnkgZGVmYXVsdFxuICogdGVtcGxhdGVzL2NvbXBvbmVudHMgdG8gdGhlIERPTVxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcmVuZGVyUmVnaW9ucyAoKSB7XG5cdHZhciBzZWxmID0gdGhpcztcblxuXHRkZWxldGVBbGxSZWdpb25zKCk7XG5cblx0Ly8gVE9ETzogZ2V0IGNsb3Nlc3QgZGVzY2VuZGFudCByZWdpb25zLCBub3QgYWxsIGRlc2NlbmRhbnQgcmVnaW9uc1xuXG5cdC8vIERldGVjdCBjaGlsZCByZWdpb25zIGluIHRlbXBsYXRlXG5cdHZhciAkcmVnaW9ucyA9IHRoaXMuJCgncmVnaW9uLCBbZGF0YS1yZWdpb25dJyk7XG5cblx0Ly8gQnV0IGFsc28gY2hlY2sgdGhlIHRvcC1sZXZlbCBlbGVtZW50IG9mIHRoZSBjb21wb25lbnQncyB0ZW1wbGF0ZSBpdHNlbGYsXG5cdC8vIGluIGNhc2UgdGhlIHRvcC1sZXZlbCBlbGVtZW50IGlzIElUUyBPV04gcmVnaW9uXG5cdCRyZWdpb25zID0gJHJlZ2lvbnMuYWRkKCB0aGlzLiRlbC5maWx0ZXIoJ3JlZ2lvbiwgW2RhdGEtcmVnaW9uXScpICk7XG5cblx0JHJlZ2lvbnMuZWFjaChmdW5jdGlvbiAoaSwgZWwpIHtcblxuXHRcdC8vIERldGVjdCBkZWZhdWx0IGNvbXBvbmVudCBpZCBmb3IgY2hpbGQgcmVnaW9uXG5cdFx0dmFyIGRlZmF1bHRDb21wb25lbnRJZCA9IGVsMkRlZmF1bHRUZW1wbGF0ZUlEKGVsKTtcblxuXHRcdC8vIEdlbmVyYXRlIGEgcmVnaW9uIGluc3RhbmNlIGZyb20gdGhlIGVsZW1lbnRcblx0XHQvLyAobW9kaWZ5aW5nIHRoZSBET00gYXMgbmVjZXNzYXJ5KVxuXHRcdHZhciByZWdpb24gPSBGUkFNRVdPUksuUmVnaW9uLmZyb21FbGVtZW50KGVsLCBzZWxmKTtcblxuXHRcdC8vIElmIHJlZ2lvbiBoYXMgbm8gaWQsIGdlbmVyYXRlIGEgdW5pcXVlIHJlZ2lvbiBpZCB3L2kgdGhpcyBjb21wb25lbnRcblx0XHQvLyB0aGF0IGlzIHVubGlrZWx5IHRvIGNvbGxpZGUgd2l0aCBteSBvdGhlciBuYW1lZCByZWdpb25zXG5cdFx0aWYgKCFyZWdpb24uaWQpIHtcblx0XHRcdHJlZ2lvbi5pZCA9ICcnK1xuXHRcdFx0XHRGUkFNRVdPUksub3B0aW9ucy5mcmFtZXdvcmtJZCArXG5cdFx0XHRcdCdfX2Fub255bW91c19yZWdpb25fXycgK1xuXHRcdFx0XHRzZWxmLmFub255bW91c1JlZ2lvbkNvdW50ZXI7XG5cblx0XHRcdC8vIEluY3JlbWVudCBjb3VudGVyIGZvciBuZXh0IHRpbWVcblx0XHRcdHNlbGYuYW5vbnltb3VzUmVnaW9uQ291bnRlcisrO1xuXHRcdH1cblxuXHRcdC8vIEtlZXAgdHJhY2sgb2YgcmVnaW9ucywgc2luY2Ugd2UgYXJlIHRoZSBwYXJlbnQgY29tcG9uZW50XG5cdFx0c2VsZi5yZWdpb25zW3JlZ2lvbi5pZF0gPSByZWdpb247XG5cblx0XHQvLyBBcyBsb25nIGFzIHRoZXJlIGFyZSBubyBjb2xsaXNpb25zLCBhbHNvIHByb3ZpZGUgYWNjZXNzIHRvIHRoZSByZWdpb25cblx0XHQvLyBvbiB0aGUgdG9wIGxldmVsIG9mIHRoZSBjb21wb25lbnQsIGUuZy4gc28geW91IGNhbiBkbyBgdGhpcy5teVJlZ2lvbmBcblx0XHQvLyBpbiB5b3VyIGNvbXBvbmVudCBtZXRob2RzLlxuXHRcdGlmICghc2VsZltyZWdpb24uaWRdKSB7XG5cdFx0XHRzZWxmW3JlZ2lvbi5pZF0gPSByZWdpb247XG5cdFx0fVxuXHR9KTtcbn07XG5cbiIsIi8qKlxuICogQ2hlY2sgdGhlIHNwZWNpZmllZCBkZWZpbml0aW9uIGZvciBvYnZpb3VzIG1pc3Rha2VzLCBlc3BlY2lhbGx5IGxpa2VseSBkZXByZWNhdGlvbnMgYW5kXG4gKiB2YWxpZGF0ZSB0aGF0IHRoZSBtb2RlbCBhbmQgY29sbGVjdGlvbnMgYXJlIGluc3RhbmNlcyBvZiBCYWNrYm9uZSdzIERhdGEgc3RydWN0dXJlcy5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gcHJvcGVydGllcyBbT2JqZWN0IGNvbnRhaW5pbmcgdGhlIHByb3BlcnRpZXMgb2YgdGhlIGNvbXBvbmVudF1cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHZhbGlkYXRlRGVmaW5pdGlvbihwcm9wZXJ0aWVzKSB7XG5cblx0aWYgKF8uaXNPYmplY3QocHJvcGVydGllcykpIHtcblxuXHRcdC8vIERldGVybWluZSBjb21wb25lbnQgaWRcblx0XHR2YXIgaWQgPSB0aGlzLmlkIHx8IHByb3BlcnRpZXMuaWQ7XG5cblx0XHRmdW5jdGlvbiBfdmFsaWRhdGVCYWNrYm9uZUluc3RhbmNlICh0eXBlKSB7XG5cdFx0XHR2YXIgVHlwZSA9IHR5cGVbMF0udG9VcHBlckNhc2UoKSArIHR5cGUuc2xpY2UoMSk7XG5cblx0XHRcdGlmICggIXByb3BlcnRpZXNbdHlwZV0gaW5zdGFuY2VvZiBCYWNrYm9uZVtUeXBlXSApIHtcblxuXHRcdFx0XHRGcmFtZXdvcmsuZXJyb3IoXG5cdFx0XHRcdFx0J0NvbXBvbmVudCAoJyArIGlkICsgJykgaGFzIGFuIGludmFsaWQgJyArIHR5cGUgKyAnLS0gXFxuJyArXG5cdFx0XHRcdFx0J0lmIGAnICsgdHlwZSArICdgIGlzIHNwZWNpZmllZCBmb3IgYSBjb21wb25lbnQsICcgK1xuXHRcdFx0XHRcdCdpdCBtdXN0IGJlIGFuICppbnN0YW5jZSogb2YgYSBCYWNrYm9uZS4nICsgVHlwZSArICcuXFxuJyk7XG5cblx0XHRcdFx0aWYgKHByb3BlcnRpZXNbdHlwZV0gaW5zdGFuY2VvZiBCYWNrYm9uZVtUeXBlXS5jb25zdHJ1Y3Rvcikge1xuXHRcdFx0XHRcdEZyYW1ld29yay5lcnJvcihcblx0XHRcdFx0XHRcdCdJdCBsb29rcyBsaWtlIGEgQmFja2JvbmUuJyArIFR5cGUgKyAnICpwcm90b3R5cGUqIHdhcyBzcGVjaWZpZWQgaW5zdGVhZCBvZiBhICcgK1xuXHRcdFx0XHRcdFx0J0JhY2tib25lLicgKyBUeXBlICsgJyAqaW5zdGFuY2UqLlxcbicgK1xuXHRcdFx0XHRcdFx0J1BsZWFzZSBgbmV3YCB1cCB0aGUgJyArIHR5cGUgKyAnIC1iZWZvcmUtICcgKyBGcmFtZXdvcmsuaWQgKyAnLnJhaXNlKCksJyArXG5cdFx0XHRcdFx0XHQnb3IgdXNlIGEgd3JhcHBlciBmdW5jdGlvbiB0byBhY2hpZXZlIHRoZSBzYW1lIGVmZmVjdCwgZS5nLjpcXG4nICtcblx0XHRcdFx0XHRcdCdgJyArIHR5cGUgKyAnOiBmdW5jdGlvbiAoKSB7XFxucmV0dXJuIG5ldyBTb21lJyArIFR5cGUgKyAnKCk7XFxufWAnXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdEZyYW1ld29yay53YXJuKCdJZ25vcmluZyBpbnZhbGlkICcgKyB0eXBlICsgJyA6OiAnICsgcHJvcGVydGllc1t0eXBlXSk7XG5cdFx0XHRcdGRlbGV0ZSBwcm9wZXJ0aWVzW3R5cGVdO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENoZWNrIHRoYXQgdGhpcy5jb2xsZWN0aW9uIGlzIGFjdHVhbGx5IGFuIGluc3RhbmNlIG9mIEJhY2tib25lLkNvbGxlY3Rpb25cblx0XHQvLyBhbmQgdGhhdCB0aGlzLm1vZGVsIGlzIGFjdHVhbGx5IGFuIGluc3RhbmNlIG9mIEJhY2tib25lLk1vZGVsXG5cdFx0X3ZhbGlkYXRlQmFja2JvbmVJbnN0YW5jZSgnbW9kZWwnKTtcblx0XHRfdmFsaWRhdGVCYWNrYm9uZUluc3RhbmNlKCdjb2xsZWN0aW9uJyk7XG5cblx0XHQvLyBDbG9uZSBwcm9wZXJ0aWVzIHRvIGF2b2lkIGluYWR2ZXJ0ZW50IG1vZGlmaWNhdGlvbnNcblx0XHRyZXR1cm4gXy5jbG9uZShwcm9wZXJ0aWVzKTtcblx0fVxuXG5cdGVsc2UgcmV0dXJuIHt9O1xuXG59XG4iLCIvKipcbiAqIFJ1biBkZWZpbml0aW9uIG1ldGhvZHMgdG8gZ2V0IGFjdHVhbCBjb21wb25lbnQgZGVmaW5pdGlvbnMuXG4gKiBUaGlzIGlzIGRlZmVycmVkIHRvIGF2b2lkIGhhdmluZyB0byB1c2UgQmFja2JvbmUncyBmdW5jdGlvbiAoKSB7fSBhcHByb2FjaCBmb3IgdGhpbmdzXG4gKiBsaWtlIGNvbGxlY3Rpb25zLlxuICovXG5cbi8qKlxuICogQnVpbGQgdXBzIGEgY29tcG9uZW50IGRlZmluaXRpb24gYnkgcnVubmluZyB0aGUgZGVmaW5pdGlvbi4gV2UgdGhlbiBsaW5rIHRoZVxuICogY29tcG9uZW50IGRlZmluaXRpb24gdG8gYW4gaWRlbnRpZmllciBpbiBgRlJBTUVXT1JLLmNvbXBvbmVudHNgLlxuICpcbiAqIEBwYXJhbSAge09iamVjdH0gY29tcG9uZW50IFtPYmplY3QgY29udGFpbmluZyB0aGUgZGVmaW5pdGlvbiBmdW5jdGlvbiBvZiB0aGUgY29tcG9uZW50XVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGJ1aWxkQ29tcG9uZW50RGVmaW5pdGlvbihjb21wb25lbnQpIHtcblx0dmFyIGNvbXBvbmVudERlZiA9IGNvbXBvbmVudC5kZWZpbml0aW9uKCk7XG5cblx0aWYgKGNvbXBvbmVudC5pZE92ZXJyaWRlKSB7XG5cdFx0aWYgKGNvbXBvbmVudERlZi5pZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGNvbXBvbmVudC5pZE92ZXJyaWRlICsgJzo6IENhbm5vdCBzcGVjaWZ5IGFuIGlkT3ZlcnJpZGUgaW4gLmRlZmluZSgpIGlmIGFuIGlkIHByb3BlcnR5ICgnK2NvbXBvbmVudERlZi5pZCsnKSBpcyBhbHJlYWR5IHNldCBpbiB5b3VyIGNvbXBvbmVudCBkZWZpbml0aW9uIVxcblVzYWdlOiAuZGVmaW5lKFtpZE92ZXJyaWRlXSwgZGVmaW5pdGlvbiknKTtcblx0XHR9XG5cdFx0Y29tcG9uZW50RGVmLmlkID0gY29tcG9uZW50LmlkT3ZlcnJpZGU7XG5cdH1cblx0aWYgKCFjb21wb25lbnREZWYuaWQpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCB1c2UgLmRlZmluZSgpIHdpdGhvdXQgZGVmaW5pbmcgYW4gaWQgcHJvcGVydHkgb3Igb3ZlcnJpZGUgaW4geW91ciBjb21wb25lbnQhXFxuVXNhZ2U6IC5kZWZpbmUoW2lkT3ZlcnJpZGVdLCBkZWZpbml0aW9uKScpO1xuXHR9XG5cdEZSQU1FV09SSy5jb21wb25lbnRzW2NvbXBvbmVudERlZi5pZF0gPSBjb21wb25lbnREZWY7XG59O1xuIiwiLyoqXG4gKiBPcHRpb25hbCBtZXRob2QgdG8gcmVxdWlyZSBhcHAgY29tcG9uZW50cy4gUmVxdWlyZS5qcyBjYW4gYmUgdXNlZCBpbnN0ZWFkXG4gKiBhcyBuZWVkZWQuXG4gKlxuICogQHBhcmFtICB7U3RyaW5nfSBcdFsob3B0aW9uYWwpIENvbXBvbmVudCBpZCBvdmVycmlkZV1cbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSBbRnVuY3Rpb24gRGVmaW5pdGlvbiBvZiBjb21wb25lbnRdXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZGVmaW5lKGlkLCBkZWZpbml0aW9uRm4pIHtcblx0Ly8gSWQgcGFyYW0gaXMgb3B0aW9uYWxcblx0aWYgKCFkZWZpbml0aW9uRm4pIHtcblx0XHRkZWZpbml0aW9uRm4gPSBpZDtcblx0XHRpZCA9IG51bGw7XG5cdH1cblxuXHRGUkFNRVdPUksuX2RlZmluZVF1ZXVlLnB1c2goe1xuXHRcdGRlZmluaXRpb246IGRlZmluaXRpb25Gbixcblx0XHRpZE92ZXJyaWRlOiBpZFxuXHR9KTtcbn07XG4iLCIvKipcbiAqIE1hc3QgYnVpbGQgZmlsZS4gVGhlIG1haW4gZmlsZVxuICovXG5cbnZhciBkZWZpbmUgPSByZXF1aXJlKCcuL2RlZmluZS9pbmRleCcpO1xudmFyIFJlZ2lvbiA9IHJlcXVpcmUoJy4vcmVnaW9uL2luZGV4Jyk7XG52YXIgQ29tcG9uZW50ID0gcmVxdWlyZSgnLi9jb21wb25lbnQvaW5kZXgnKTtcbnZhciByYWlzZSA9IHJlcXVpcmUoJy4vcmFpc2UvaW5kZXgnKTtcblxuLyoqXG4gKiBGcmFtZXdvcmsgY2xhc3MgZGVmaW5pdGlvbiB0aGF0IHdpbGwgY3JlYXRlIGEgbmV3IGdsb2JhbCBpbnN0YW5jZSBvZiBhIGN1c3RvbSBGcmFtZXdvcmsuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgW29wdGlvbnMgaGFzaCB0byBpbml0aWFsaXplIHRoZSBjdXN0b20gZnJhbWV3b3JrIHdpdGhdXG4gKi9cbnZhciBGcmFtZXdvcmsgPSBmdW5jdGlvbihvcHRpb25zKSB7XG5cblx0Ly8gU2V0IHRoZSBkZWZhdWx0IG9wdGlvbnMgZm9yIHRob3NlIG5vdCBwYXNzZWQgaW4uXG5cdG9wdGlvbnMgPSBfLmRlZmF1bHRzKG9wdGlvbnMgfHwge30sIHtcblx0XHR0aHJvdHRsZVdpbmRvd1Jlc2l6ZTogMjAwLFxuXHRcdGxvZ0xldmVsOiAnd2FybicsXG5cdFx0ZnJhbWV3b3JrSWQ6ICdtYXN0Jyxcblx0XHRwcm9kdWN0aW9uOiBmYWxzZSxcblx0XHRsb2dnZXI6IHVuZGVmaW5lZCxcblx0XHRzaG9ydGN1dDoge1xuXHRcdFx0dGVtcGxhdGU6IHRydWUsXG5cdFx0XHRjb3VudDogdHJ1ZVxuXHRcdH1cblx0fSk7XG5cblx0Ly8gU2V0IGEgc3RhcnRpbmcgcG9pbnQgdG8gQmFja2JvbmUgYW5kIGFkZCBhZGRpdGlvbmFsIGF0dHJpYnV0ZS5cblx0Xy5leHRlbmQodGhpcywgQmFja2JvbmUsIHtcblx0XHRvcHRpb25zOiBvcHRpb25zLFxuXHRcdHRlbXBsYXRlczoge30sXG5cdFx0Y29tcG9uZW50czoge30sXG5cdFx0ZGF0YToge30sXG5cdFx0X2RlZmluZVF1ZXVlOiBbXSxcblx0XHRyZWdpb25zOiB7fVxuXHR9KTtcblxuXHQvKipcblx0ICogRXh0ZW5kIEZSQU1FV09SSy5Db2xsZWN0aW9uIHRvIG1ha2UgaXQgYmV0dGVyXG5cdCAqIChzcGVjaWZpY2FsbHksIHRvIGFkZCBlcnJvciBoYW5kbGluZylcblx0ICovXG5cdHZhciBzZWxmID0gdGhpcztcblx0dmFyIG9yaWdpbmFsQ29sbGVjdGlvbiA9IHRoaXMuQ29sbGVjdGlvbjtcblx0dGhpcy5Db2xsZWN0aW9uID0gb3JpZ2luYWxDb2xsZWN0aW9uLmV4dGVuZCh7XG5cblx0XHRpbml0aWFsaXplOiBmdW5jdGlvbiAob3B0aW9ucykge1xuXG5cdFx0XHQvLyBPdmVycmlkZSBgY29sbGVjdGlvbi5mZXRjaCgpYFxuXHRcdFx0dGhpcy5fZmV0Y2ggPSB0aGlzLmZldGNoO1xuXHRcdFx0dGhpcy5mZXRjaCA9IHRoaXNbJ19mZXRjaCsrJ107XG5cdFx0fSxcblxuXG5cdFx0LyoqXG5cdFx0ICogYWZ0ZXJFcnJvclxuXHRcdCAqXG5cdFx0ICogTGlmZWN5Y2xlIGNhbGxiYWNrIHRvIGNhdGNoIHdoZW4gYSBmZXRjaCBlcnJvciBvY2N1cnNcblx0XHQgKlxuXHRcdCAqIFRPRE86XG5cdFx0ICogUHJvYmFibHkgcmVtb3ZlIHRoaXMtLSByZWFzb25pbmcgOjpcblx0XHQgKiBJbiBtb3N0IGNhc2VzLCB5b3UgYWN0dWFsbHkgY2FyZSBhYm91dCB0aGUgZXJyb3IgaW5cblx0XHQgKiB0aGUgcmVsZXZhbnQgY29tcG9uZW50cyB3aG8gYXJlIHVzaW5nIHRoaXMgY29sbGVjdGlvbixcblx0XHQgKiBpbiB3aGljaCBjYXNlIHlvdSdkIGp1c3QgYmluZCBhbiBlcnJvciBldmVudCBoYW5kbGVyLlxuXHRcdCAqL1xuXHRcdGFmdGVyRXJyb3I6IGZ1bmN0aW9uIChjb2xsZWN0aW9uLCB4aHIsIG9wdGlvbnMpIHtcblx0XHRcdC8vIHRoaXMgZXhpc3RzIGZvciB5b3UgdG8gb3ZlcnJpZGUgaXQhXG5cdFx0fSxcblxuXG5cblxuXHRcdC8qKlxuXHRcdCAqIE92ZXJyaWRlIEJhY2tib25lLkNvbGxlY3Rpb24ncyBgZmV0Y2goKWBcblx0XHQgKiB0byBhbGxvdyBmb3IgYmV0dGVyIGVycm9yIGhhbmRsaW5nLlxuXHRcdCAqXG5cdFx0ICogVE9ETzogcHVsbCB0aGlzIGludG8gQmFja2JvbmUuc3luYyBpbnN0ZWFkLi5cblx0XHQgKiBvbmx5IHByb2JsZW0gaXMgY2xhc2hpbmcgd2l0aCBvdGhlciBzeW5jIG92ZXJyaWRlc1xuXHRcdCAqL1xuXHRcdCdfZmV0Y2grKyc6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG5cdFx0XHR2YXIgY29sbGVjdGlvbiA9IHRoaXM7XG5cblx0XHRcdG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG5cdFx0XHQvLyBMb2cgYSBmcmllbmRsaWVyIFwiTm8gVVJMXCIgbWVzc2FnZTpcblx0XHRcdGlmICggIWNvbGxlY3Rpb24udXJsICkge1xuXHRcdFx0XHRzZWxmLmVycm9yKCdDYW5ub3QgZmV0Y2goKSAnICsgY29sbGVjdGlvbi50eXBlICsgJyA6OiBDb2xsZWN0aW9uIGhhcyBubyBVUkwgZnVuY3Rpb24vcHJvcGVydHkuLi4nKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBPdmVycmlkZSBlcnJvciBoYW5kbGVyIHRvIG1peGluIGFuICdlcnJvcicgZXZlbnRcblx0XHRcdHZhciBvcmlnaW5hbEVycm9ySGFuZGxlciA9IG9wdGlvbnMuZXJyb3I7XG5cdFx0XHR2YXIgb3JpZ2luYWxTdWNjZXNzSGFuZGxlciA9IG9wdGlvbnMuc3VjY2Vzcztcblx0XHRcdF8uZXh0ZW5kKG9wdGlvbnMsIHtcblx0XHRcdFx0c3VjY2VzczogZnVuY3Rpb24gKGNvbGxlY3Rpb24sIHhociwgb3B0aW9ucykge1xuXHRcdFx0XHRcdHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcblxuXHRcdFx0XHRcdC8vIE51bGwgb3V0IGBjb2xsZWN0aW9uLnN5bmNpbmdgXG5cdFx0XHRcdFx0Y29sbGVjdGlvbi5zeW5jaW5nID0gbnVsbDtcblxuXHRcdFx0XHRcdC8vIFRyaWdnZXIgb3JpZ2luYWwgc3VjY2VzcyBoYW5kbGVyIGlmIHNwZWNpZmllZFxuXHRcdFx0XHRcdC8vIG9uIGBmZXRjaCh7c3VjY2VzczogZnVuY3Rpb24oKXsvKi4uLiovfX0pYFxuXHRcdFx0XHRcdGlmIChvcmlnaW5hbFN1Y2Nlc3NIYW5kbGVyKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gb3JpZ2luYWxTdWNjZXNzSGFuZGxlci5hcHBseShjb2xsZWN0aW9uLCBhcmdzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGVycm9yOiBmdW5jdGlvbiAoY29sbGVjdGlvbiwgeGhyLCBvcHRpb25zKSB7XG5cdFx0XHRcdFx0dmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuXG5cdFx0XHRcdFx0Ly8gTnVsbCBvdXQgYGNvbGxlY3Rpb24uc3luY2luZ2Bcblx0XHRcdFx0XHRjb2xsZWN0aW9uLnN5bmNpbmcgPSBudWxsO1xuXG5cdFx0XHRcdFx0Ly8gSWYgdGhpcyBpcyBhbiBcImFib3J0XCIsIGlnbm9yZSBpdC0gKHN0YXRlIGhhcyBhbHJlYWR5IGJlZW4gdGFrZW4gY2FyZSBvZilcblx0XHRcdFx0XHRpZiAoIHhociAmJiB4aHIuc3RhdHVzVGV4dD09PSdhYm9ydCcgKSByZXR1cm47XG5cblx0XHRcdFx0XHQvLyBTZXQgYGNvbGxlY3Rpb24uZXJyb3JgIHVzaW5nIHRoZSByZXNwb25zZSBmcm9tIHRoZSBmZXRjaFxuXHRcdFx0XHRcdC8vICh0cnkganNvbiwgdGhlbiByZXNwb25zZSB0ZXh0LCB0aGVuIHN0YXR1cyBjb2RlLCB0aGVuIGp1c3QgZGVmYXVsdCB0byBgdHJ1ZWApXG5cdFx0XHRcdFx0Y29sbGVjdGlvbi5lcnJvciA9XG5cdFx0XHRcdFx0XHQoIHhociAmJiB4aHIucmVzcG9uc2VKU09OICkgPyB4aHIucmVzcG9uc2VKU09OIDpcblx0XHRcdFx0XHRcdCggeGhyICYmIHhoci5yZXNwb25zZVRleHQgKSA/IHhoci5yZXNwb25zZVRleHQgOlxuXHRcdFx0XHRcdFx0dHJ1ZTtcblxuXG5cdFx0XHRcdFx0Ly8gQ2FsbCBgYWZ0ZXJFcnJvcigpYFxuXHRcdFx0XHRcdGNvbGxlY3Rpb24uYWZ0ZXJFcnJvci5hcHBseShjb2xsZWN0aW9uLGFyZ3MpO1xuXG5cdFx0XHRcdFx0Ly8gVHJpZ2dlciBvcmlnaW5hbCBlcnJvciBoYW5kbGVyIGlmIHNwZWNpZmllZFxuXHRcdFx0XHRcdC8vIG9uIGBmZXRjaCh7ZXJyb3I6IGZ1bmN0aW9uKCl7LyouLi4qL319KWBcblx0XHRcdFx0XHRpZiAob3JpZ2luYWxFcnJvckhhbmRsZXIpIHtcblx0XHRcdFx0XHRcdHJldHVybiBvcmlnaW5hbEVycm9ySGFuZGxlci5hcHBseShjb2xsZWN0aW9uLCBhcmdzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBOdWxsIG91dCBgY29sbGVjdGlvbi5lcnJvcmBcblx0XHRcdGNvbGxlY3Rpb24uZXJyb3IgPSBudWxsO1xuXG5cdFx0XHQvLyBJZiBgZmV0Y2hgIGlzIGFscmVhZHkgaW4gcHJvZ3Jlc3MsIGNhbmNlbCBpdFxuXHRcdFx0Ly8gYW5kIGZpcmUgb2ZmIGEgbmV3IG9uZS5cblx0XHRcdGlmIChjb2xsZWN0aW9uLnN5bmNpbmcpIHtcblx0XHRcdFx0c2VsZi5sb2coJ0Fib3J0aW5nIHJ1bm5pbmcgYGZldGNoKClgIGluIG9yZGVyIHRvIHN0YXJ0IGEgbmV3IGBmZXRjaCgpYC4uLicpO1xuXHRcdFx0XHRjb2xsZWN0aW9uLnN5bmNpbmcuYWJvcnQoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ2FsbCBvcmlnaW5hbCBgZmV0Y2goKWAgdXNpbmcgb3VyIG1vbmtleS1wYXRjaGVkIG9wdGlvbnNcblx0XHRcdHZhciB4aHIgPSBjb2xsZWN0aW9uLl9mZXRjaChvcHRpb25zKTtcblxuXHRcdFx0Ly8gU2V0IGBjb2xsZWN0aW9uLnN5bmNpbmdgIHRvIHRoZSBYSFIgb2JqZWN0IGluIHVzZVxuXHRcdFx0Y29sbGVjdGlvbi5zeW5jaW5nID0geGhyO1xuXG5cdFx0XHQvLyBSZXR1cm4gdGhlIFhIUiBvYmplY3QgdG8gbWFpbnRhaW4gb3JpZ2luYWwgYEJhY2tib25lLkNvbGxlY3Rpb24uZmV0Y2goKWAgQVBJXG5cdFx0XHRyZXR1cm4geGhyO1xuXHRcdH1cblxuXHR9KTtcblxuXG5cdC8vIFRocm91Z2hvdXQgdGhlIHNvdXJjZSBjb2RlLCB0aGVyZSBhcmUgb3BlcmF0aW9ucyBvbiBgRlJBTUVXT1JLYCBvciBjb2RlIHRoYXQgYWNjZXNzZXNcblx0Ly8gaXRzIGF0dHJpYnV0ZXMuIFNvIHdlIG1ha2UgYEZSQU1FV09SS2AgYWNjZXNzaWJsZS5cblx0Ly9cblx0Ly8gTm90ZTpcblx0Ly8gYEZSQU1FV09SS2Agd2lsbCBvbmx5IGJlIGEgZ2xvYmFsIHZhcmlhYmxlICoqIGR1cmluZyB0aGUgYnVpbGQgKipcblx0RlJBTUVXT1JLID0gdGhpcztcblxuXG59O1xuXG4vLyBGcmFtZXdvcmsgcHJvdG90eXBlIG1ldGhvZHMuXG5GcmFtZXdvcmsucHJvdG90eXBlLlJlZ2lvbiA9IFJlZ2lvbjtcbkZyYW1ld29yay5wcm90b3R5cGUuQ29tcG9uZW50ID0gQ29tcG9uZW50O1xuRnJhbWV3b3JrLnByb3RvdHlwZS5kZWZpbmUgPSBkZWZpbmU7XG5GcmFtZXdvcmsucHJvdG90eXBlLnJhaXNlID0gcmFpc2U7XG5cblxuLy8gSW5zdGFudGlhdGUgRnJhbWV3b3JrIGluc3RhbmNlXG52YXIgZnJhbWV3b3JrID0gbmV3IEZyYW1ld29yaygpO1xuXG4vLyBSYWlzZSBpdCBhZnRlciBvbmUgY3ljbGUgb2YgdGhlIGV2ZW50IGxvb3AuXG5zZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcblx0ZnJhbWV3b3JrLnJhaXNlKCk7XG59LCAxMDApO1xuXG4vLyBFeHBvc2UgaW5zdGFudGlhdGVkIGZyYW1ld29yayB2aWEgVU1EOlxubW9kdWxlLmV4cG9ydHMgPSBmcmFtZXdvcms7XG4iLCIvKipcbiAqXHRMb2dnZXQgY29uc3RydWN0b3IgbWV0aG9kIHRoYXQgd2lsbCBzZXR1cCBGUkFNRVdPUksgdG8gbG9nIG1lc3NhZ2VzLlxuICovXG5cbnZhciBzZXR1cExvZ2dlciA9IHJlcXVpcmUoJy4vc2V0dXAnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBMb2dnZXIoKSB7XG5cblx0Ly8gVXBvbiBpbml0aWFsaXphdGlvbiwgc2V0dXAgbG9nZ2VyXG5cdHNldHVwTG9nZ2VyKEZSQU1FV09SSy5vcHRpb25zLmxvZ0xldmVsKTtcblxuXHQvLyBJbiBzdXBwb3J0ZWQgYnJvd3NlcnMsIGFsc28gcnVuIHNldHVwTG9nZ2VyIGFnYWluXG5cdC8vIHdoZW4gRlJBTUVXT1JLLmxvZ0xldmVsIGlzIHNldCBieSB0aGUgdXNlclxuXHQvLyBUT0RPOiBmaW5kIGEgd2F5IHRvIGRvIHRoaXMgd2l0aG91dCBkZXBlbmRpbmcgb24gX19kZWZpbmVTZXR0ZXJfXy5cblx0aWYgKF8uaXNGdW5jdGlvbihGUkFNRVdPUksuX19kZWZpbmVTZXR0ZXJfXykpIHtcblx0XHRGUkFNRVdPUksuX19kZWZpbmVTZXR0ZXJfXygnbG9nTGV2ZWwnLCBmdW5jdGlvbiBvbkNoYW5nZSAobmV3TG9nTGV2ZWwpIHtcblx0XHRcdHNldHVwTG9nZ2VyKG5ld0xvZ0xldmVsKTtcblx0XHR9KTtcblx0fVxufTtcbiIsIi8qKlxuICogU2V0IHVwIHRoZSBsb2cgZnVuY3Rpb25zOlxuICpcbiAqIEZSQU1FV09SSy5lcnJvclxuICogRlJBTUVXT1JLLndhcm5cbiAqIEZSQU1FV09SSy5sb2dcbiAqIEZSQU1FV09SSy5kZWJ1ZyAoKmxlZ2FjeSlcbiAqIEZSQU1FV09SSy52ZXJib3NlXG4gKlxuICogQHBhcmFtICB7U3RyaW5nfSBsb2dMZXZlbCBbVGhlIGRlc2lyZWQgbG9nIGxldmVsIG9mIHRoZSBMb2dnZXJdXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gc2V0dXBMb2dnZXIgKGxvZ0xldmVsKSB7XG5cblx0dmFyIG5vb3AgPSBmdW5jdGlvbiAoKSB7fTtcblxuXHQvLyBJZiBsb2cgaXMgc3BlY2lmaWVkLCB1c2UgaXQsIG90aGVyd2lzZSB1c2UgdGhlIGNvbnNvbGVcblx0aWYgKEZSQU1FV09SSy5sb2dnZXIpIHtcblx0XHRGUkFNRVdPUksuZXJyb3IgICAgID0gRlJBTUVXT1JLLmxvZ2dlci5lcnJvcjtcblx0XHRGUkFNRVdPUksud2FybiAgICAgID0gRlJBTUVXT1JLLmxvZ2dlci53YXJuO1xuXHRcdEZSQU1FV09SSy5sb2cgICAgICAgPSBGUkFNRVdPUksubG9nZ2VyLmRlYnVnIHx8IEZSQU1FV09SSy5sb2dnZXI7XG5cdFx0RlJBTUVXT1JLLnZlcmJvc2UgICA9IEZSQU1FV09SSy5sb2dnZXIudmVyYm9zZTtcblx0fVxuXG5cdC8vIEluIElFLCB3ZSBjYW4ndCBkZWZhdWx0IHRvIHRoZSBicm93c2VyIGNvbnNvbGUgYmVjYXVzZSB0aGVyZSBJUyBOTyBCUk9XU0VSIENPTlNPTEVcblx0ZWxzZSBpZiAodHlwZW9mIGNvbnNvbGUgIT09ICd1bmRlZmluZWQnKSB7XG5cblx0XHQvLyBXZSBjYW5ub3QgY2FsbGVkIHRoZSAuYmluZCBtZXRob2Qgb24gdGhlIGNvbnNvbGUgbWV0aG9kcy4gV2UgYXJlIGluIGllIDkgb3IgOCwganVzdCBtYWtlXG5cdFx0Ly8gZXZlcnlodGluZyBhIG5vb3AuXG5cdFx0aWYgKF8uaXNVbmRlZmluZWQoY29uc29sZS5sb2cuYmluZCkpICB7XG5cdFx0XHRGUkFNRVdPUksuZXJyb3IgICAgID0gbm9vcDtcblx0XHRcdEZSQU1FV09SSy53YXJuICAgICAgPSBub29wO1xuXHRcdFx0RlJBTUVXT1JLLmxvZyAgICAgICA9IG5vb3A7XG5cdFx0XHRGUkFNRVdPUksuZGVidWcgICAgID0gbm9vcDtcblx0XHRcdEZSQU1FV09SSy52ZXJib3NlICAgPSBub29wO1xuXHRcdH1cblxuXHRcdC8vIFdlIGFyZSBpbiBhIGZyaWVuZGx5IGJyb3dzZXIgbGlrZSBDaHJvbWUsIEZpcmVmb3gsIG9yIElFMTBcblx0XHRlbHNlIHtcblx0XHRcdEZSQU1FV09SSy5lcnJvclx0XHQ9IGNvbnNvbGUuZXJyb3IgJiYgY29uc29sZS5lcnJvci5iaW5kKGNvbnNvbGUpO1xuXHRcdFx0RlJBTUVXT1JLLndhcm5cdFx0PSBjb25zb2xlLndhcm4gJiYgY29uc29sZS53YXJuLmJpbmQoY29uc29sZSk7XG5cdFx0XHRGUkFNRVdPUksubG9nXHRcdFx0PSBjb25zb2xlLmRlYnVnICYmIGNvbnNvbGUuZGVidWcuYmluZChjb25zb2xlKTtcblx0XHRcdEZSQU1FV09SSy52ZXJib3NlXHQ9IGNvbnNvbGUubG9nICYmIGNvbnNvbGUubG9nLmJpbmQoY29uc29sZSk7XG5cblx0XHRcdC8vIFVzZSBsb2cgbGV2ZWwgY29uZmlnIGlmIHByb3ZpZGVkXG5cdFx0XHRzd2l0Y2ggKGxvZ0xldmVsKSB7XG5cdFx0XHRcdGNhc2UgJ3ZlcmJvc2UnOiBicmVhaztcblxuXHRcdFx0XHRjYXNlICdkZWJ1Zyc6XG5cdFx0XHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UgPSBub29wO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgJ3dhcm4nOlxuXHRcdFx0XHRcdEZSQU1FV09SSy52ZXJib3NlID0gRlJBTUVXT1JLLmxvZyA9IG5vb3A7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSAnZXJyb3InOlxuXHRcdFx0XHRcdEZSQU1FV09SSy52ZXJib3NlID0gRlJBTUVXT1JLLmxvZyA9IEZSQU1FV09SSy53YXJuID0gbm9vcDtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlICdzaWxlbnQnOlxuXHRcdFx0XHRcdEZSQU1FV09SSy52ZXJib3NlID0gRlJBTUVXT1JLLmxvZyA9IEZSQU1FV09SSy53YXJuID0gRlJBTUVXT1JLLmVycm9yID0gbm9vcDtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvciAoJ1VucmVjb2duaXplZCBsb2dnaW5nIGxldmVsIGNvbmZpZyAnICtcblx0XHRcdFx0XHQnKCcgKyBGUkFNRVdPUksub3B0aW9ucy5mcmFtZXdvcmtJZCArICcubG9nTGV2ZWwgPSBcIicgKyBsb2dMZXZlbCArICdcIiknKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU3VwcG9ydCBmb3IgYGRlYnVnYCBmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHlcblx0XHRcdEZSQU1FV09SSy5kZWJ1ZyA9IEZSQU1FV09SSy5sb2c7XG5cblx0XHRcdC8vIFZlcmJvc2Ugc3BpdHMgb3V0IGxvZyBsZXZlbFxuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UoJ0xvZyBsZXZlbCBzZXQgdG8gOjogJywgbG9nTGV2ZWwpO1xuXHRcdH1cblx0fVxufVxuIiwiLyoqXG4gKiBHaXZlbiBhIGNvbXBvbmVudCBkZWZpbml0aW9uIGFuZCBpdHMga2V5LCB3ZSB3aWxsIGJ1aWxkIHVwIHRoZSBjb21wb25lbnQgcHJvdG90eXBlIGFuZCBtZXJnZVxuICogdGhpcyBjb21wb25lbnQgd2l0aCBpdHMgbWF0Y2hpbmcgdGVtcGxhdGUuXG4gKlxuICogQHBhcmFtICB7T2JqZWN0fSBjb21wb25lbnREZWYgW09iamVjdCBjb250YWluaW5nIHRoZSBjb21wb25lbnQgZGVmaW5pdGlvbl1cbiAqIEBwYXJhbSAge1N0cmluZ30gY29tcG9uZW50S2V5IFtUaGUgY29tcG9uZW50IGlkZW50aWZpZXJdXG4gKi9cblxudmFyIHRyYW5zbGF0ZVNob3J0aGFuZCA9IHJlcXVpcmUoJy4uL3V0aWxzL3Nob3J0aGFuZCcpO1xudmFyIG9iak1hcCA9IHJlcXVpcmUoJy4uL3V0aWxzL29iak1hcCcpO1xudmFyIEV2ZW50cyA9IHJlcXVpcmUoJy4uL3V0aWxzL2V2ZW50cycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGJ1aWxkQ29tcG9uZW50UHJvdG90eXBlKGNvbXBvbmVudERlZiwgY29tcG9uZW50S2V5KSB7XG5cblx0Ly8gSWYgY29tcG9uZW50IGlkIGlzIG5vdCBleHBsaWNpdGx5IHNldCwgdXNlIHRoZSBjb21wb25lbnRLZXlcblx0aWYgKCFjb21wb25lbnREZWYuaWQpIHtcblx0XHRjb21wb25lbnREZWYuaWQgPSBjb21wb25lbnRLZXk7XG5cdH1cblxuXHQvLyBTZWFyY2ggdGVtcGxhdGVzXG5cdHZhciB0ZW1wbGF0ZSA9IEZSQU1FV09SSy50ZW1wbGF0ZXNbY29tcG9uZW50RGVmLmlkXTtcblxuXHQvLyBJZiBubyBtYXRjaCBmb3IgY29tcG9uZW50IHdhcyBmb3VuZMKgaW4gdGVtcGxhdGVzLCBpc3N1ZSBhIHdhcm5pbmdcblx0aWYgKCF0ZW1wbGF0ZSkge1xuXHRcdHJldHVybiBGUkFNRVdPUksud2Fybihcblx0XHRcdGNvbXBvbmVudERlZi5pZCArICcgOjogTm8gdGVtcGxhdGUgZm91bmQgZm9yIGNvbXBvbmVudCEnICtcblx0XHRcdCdcXG5UZW1wbGF0ZXMgZG9uXFwndCBuZWVkIGEgY29tcG9uZW50IHVubGVzcyB5b3Ugd2FudCBpbnRlcmFjdGl2aXR5LCAnICtcblx0XHRcdCdldmVyeSBjb21wb25lbnQgKnNob3VsZCogaGF2ZSBhIG1hdGNoaW5nIHRlbXBsYXRlISEnICtcblx0XHRcdCdcXG5Vc2luZyBjb21wb25lbnRzIHdpdGhvdXQgdGVtcGxhdGVzIG1heSBzZWVtIG5lY2Vzc2FyeSwgJyArXG5cdFx0XHQnYnV0IGl0XFwncyBub3QuICBJdCBtYWtlcyB5b3VyIHZpZXcgbG9naWMgaW5jb3Jwb3JlYWwsIGFuZCBtYWtlcyB5b3VyIGNvbGxlYWd1ZXMgJyArXG5cdFx0XHQndW5jb21mb3J0YWJsZS4nKTtcblx0fVxuXG5cdC8vIFNhdmUgcmVmZXJlbmNlIHRvIHRlbXBsYXRlIGluIGNvbXBvbmVudCBwcm90b3R5cGVcblx0RlJBTUVXT1JLLnZlcmJvc2UoY29tcG9uZW50RGVmLmlkICsgJyA6OiBQYWlyaW5nIGNvbXBvbmVudCB3aXRoIHRlbXBsYXRlLi4uJyk7XG5cdGNvbXBvbmVudERlZi50ZW1wbGF0ZSA9IHRlbXBsYXRlO1xuXG5cdC8vIFRyYW5zbGF0ZSByaWdodC1oYW5kIHNob3J0aGFuZCBmb3IgdG9wLWxldmVsIGtleXNcblx0Y29tcG9uZW50RGVmID0gb2JqTWFwKGNvbXBvbmVudERlZiwgdHJhbnNsYXRlU2hvcnRoYW5kKTtcblxuXG5cdC8vIGFuZCBldmVudHMgb2JqZWN0XG5cdGlmIChjb21wb25lbnREZWYuZXZlbnRzKSB7XG5cdFx0Y29tcG9uZW50RGVmLmV2ZW50cyA9IG9iak1hcChcblx0XHRcdGNvbXBvbmVudERlZi5ldmVudHMsXG5cdFx0XHR0cmFuc2xhdGVTaG9ydGhhbmRcblx0XHQpO1xuXHR9XG5cblx0Ly8gYW5kIGFmdGVyQ2hhbmdlIGJpbmRpbmdzXG5cdGlmIChfLmlzT2JqZWN0KGNvbXBvbmVudERlZi5hZnRlckNoYW5nZSkgJiYgIV8uaXNGdW5jdGlvbihjb21wb25lbnREZWYuYWZ0ZXJDaGFuZ2UpKSB7XG5cdFx0Y29tcG9uZW50RGVmLmFmdGVyQ2hhbmdlID0gb2JqTWFwKFxuXHRcdFx0Y29tcG9uZW50RGVmLmFmdGVyQ2hhbmdlLFxuXHRcdFx0dHJhbnNsYXRlU2hvcnRoYW5kXG5cdFx0KTtcblx0fVxuXG5cdC8vIEdvIGFoZWFkIGFuZCB0dXJuIHRoZSBkZWZpbml0aW9uIGludG8gYSByZWFsIGNvbXBvbmVudCBwcm90b3R5cGVcblx0RlJBTUVXT1JLLnZlcmJvc2UoY29tcG9uZW50RGVmLmlkICsgJyA6OiBCdWlsZGluZyBjb21wb25lbnQgcHJvdG90eXBlLi4uJyk7XG5cdHZhciBjb21wb25lbnRQcm90b3R5cGUgPSBGUkFNRVdPUksuQ29tcG9uZW50LmV4dGVuZChjb21wb25lbnREZWYpO1xuXG5cdC8vIERpc2NvdmVyIHN1YnNjcmlwdGlvbnNcblx0Y29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZS5zdWJzY3JpcHRpb25zID0ge307XG5cblx0Ly8gSXRlcmF0ZSB0aHJvdWdoIGVhY2ggcHJvcGVydHkgb24gdGhpcyBjb21wb25lbnQgcHJvdG90eXBlXG5cdF8uZWFjaChjb21wb25lbnRQcm90b3R5cGUucHJvdG90eXBlLCBmdW5jdGlvbiAoaGFuZGxlciwga2V5KSB7XG5cblx0XHQvLyBEZXRlY3QgRE9NIGV2ZW50cyBhbmQgc21hc2ggdGhlbSBpbnRvIHRoZSBldmVudHMgaGFzaFxuXHRcdHZhciBtYXRjaGVkRE9NRXZlbnRzID0ga2V5Lm1hdGNoKEV2ZW50c1snL0RPTUV2ZW50LyddKTtcblx0XHRpZiAobWF0Y2hlZERPTUV2ZW50cykge1xuXHRcdFx0dmFyIGV2ZW50TmFtZSA9IG1hdGNoZWRET01FdmVudHNbMV07XG5cdFx0XHR2YXIgZGVsZWdhdGVTZWxlY3RvciA9IG1hdGNoZWRET01FdmVudHNbM107XG5cblx0XHRcdC8vIFN0b3cgdGhlbSBpbiBldmVudHMgaGFzaFxuXHRcdFx0Y29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZS5ldmVudHMgPSBjb21wb25lbnRQcm90b3R5cGUucHJvdG90eXBlLmV2ZW50cyB8fCB7fTtcblx0XHRcdGNvbXBvbmVudFByb3RvdHlwZS5wcm90b3R5cGUuZXZlbnRzW2tleV0gPSBoYW5kbGVyO1xuXHRcdH1cblxuXHRcdC8vIEFkZCBhcHAgZXZlbnRzICglKSwgcm91dGVzICgjKSwgYW5kIGRhdGEgbGlzdGVuZXJzICh+KSB0byBzdWJzY3JpcHRpb25zIGhhc2hcblx0XHRpZiAoa2V5Lm1hdGNoKC9eKCV8I3x+KS8pKSB7XG5cdFx0XHRpZiAoXy5pc1N0cmluZyhoYW5kbGVyKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoY29tcG9uZW50RGVmLmlkICsgJzo6IEludmFsaWQgbGlzdGVuZXIgZm9yIHN1YnNjcmlwdGlvbjogJyArIGtleSArICcuXFxuJyArXG5cdFx0XHRcdFx0J0RlZmluZSB5b3VyIGNhbGxiYWNrIHdpdGggYW4gYW5vbnltb3VzIGZ1bmN0aW9uIGluc3RlYWQgb2YgYSBzdHJpbmcuJ1xuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFfLmlzRnVuY3Rpb24oaGFuZGxlcikpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGNvbXBvbmVudERlZi5pZCArJzo6IEludmFsaWQgbGlzdGVuZXIgZm9yIHN1YnNjcmlwdGlvbjogJyArIGtleSk7XG5cdFx0XHR9XG5cdFx0XHRjb21wb25lbnRQcm90b3R5cGUucHJvdG90eXBlLnN1YnNjcmlwdGlvbnNba2V5XSA9IGhhbmRsZXI7XG5cdFx0fVxuXG5cdFx0Ly8gRXh0ZW5kIG9uZSBvciBtb3JlIG90aGVyIGNvbXBvbmVudHNcblx0XHRlbHNlIGlmIChrZXkgPT09ICdleHRlbmRDb21wb25lbnRzJykge1xuXHRcdFx0dmFyIG9ialRvTWVyZ2UgPSB7fTtcblx0XHRcdF8uZWFjaChoYW5kbGVyLCBmdW5jdGlvbihjaGlsZElkKXtcblxuXHRcdFx0XHRpZiAoIUZSQU1FV09SSy5jb21wb25lbnRzW2NoaWxkSWRdKXtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoXG5cdFx0XHRcdFx0Y29tcG9uZW50RGVmLmlkICsgJyA6OiAnICtcblx0XHRcdFx0XHQnVHJ5aW5nIHRvIGRlZmluZS9leHRlbmQgdGhpcyBjb21wb25lbnQgZnJvbSBgJyArIGNoaWxkSWQgKyAnYCwgJyArXG5cdFx0XHRcdFx0J2J1dCBubyBjb21wb25lbnQgd2l0aCB0aGF0IGlkIGNhbiBiZSBmb3VuZC4nXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdF8uZXh0ZW5kKG9ialRvTWVyZ2UsIEZSQU1FV09SSy5jb21wb25lbnRzW2NoaWxkSWRdKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRfLmRlZmF1bHRzKGNvbXBvbmVudFByb3RvdHlwZS5wcm90b3R5cGUsIG9ialRvTWVyZ2UpO1xuXHRcdH1cblx0fSk7XG5cblx0Ly8gU2F2ZSBwcm90b3R5cGUgaW4gZ2xvYmFsIHNldCBmb3IgdHJhY2tpbmdcblx0RlJBTUVXT1JLLmNvbXBvbmVudHNbY29tcG9uZW50RGVmLmlkXSA9IGNvbXBvbmVudFByb3RvdHlwZTtcbn07XG4iLCIvKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXNcbiAqL1xuXG52YXIgZWwyRGVmYXVsdFRlbXBsYXRlSUQgPSByZXF1aXJlKCcuLi91dGlscy9lbDJEZWZhdWx0VGVtcGxhdGVJRCcpO1xuXG5cblxuXG5cbi8qKlxuICogQ29sbGVjdCBhbnkgVE9QLUxFVkVMIHJlZ2lvbnMgd2l0aCB0aGUgZGVmYXVsdCB0ZW1wbGF0ZS9jb21wb25lbnQgc3BlY2lmaWVkIGluIHRoZSBIVE1MXG4gKlxuICogTm90ZTpcbiAqIFRoaXMgaXMgb25seSBydW4gb24gdGhlIG9yaWdpbmFsIEhUTUwgcGFnZSwgbm90IGluIGNsaWVudC1zaWRlIHRlbXBsYXRlcyEhIVxuICogRm9yIHRoYXQsIHNlZSBgbGliL2NvbXBvbmVudC9yZW5kZXJSZWdpb25zLmpzYC5cbiAqXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjb2xsZWN0UmVnaW9ucyAoKSB7XG5cblxuXHQvLyBHZXQgdG9wLWxldmVsIHJlZ2lvbnMuXG5cdHZhciAkdG9wTGV2ZWxSZWdpb25zID0gJCgncmVnaW9uLCBbZGF0YS1yZWdpb25dJykuZmlsdGVyKGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiAkKHRoaXMpLnBhcmVudHMoJ3JlZ2lvbiwgW2RhdGEtcmVnaW9uXScpLmxlbmd0aCA9PT0gMDtcblx0fSk7XG5cblxuXHQkdG9wTGV2ZWxSZWdpb25zLmVhY2goZnVuY3Rpb24oKSB7XG5cdFx0dmFyIGVsID0gdGhpcztcblx0XHR2YXIgJGVsID0gJCh0aGlzKTtcblxuXHRcdC8vIFByb3ZpZGUgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkgZm9yIGxlZ2FjeSBub3RhdGlvblxuXHRcdC8vIChub3JtYWxpemUgdG8gYHRlbXBsYXRlYClcblx0XHR2YXIgY29tcG9uZW50SWQgPSBlbDJEZWZhdWx0VGVtcGxhdGVJRChlbCk7XG5cblx0XHQvLyBOb3cgaW5zdGFudGlhdGUgdGhlIGFwcHJvcHJpYXRlIGRlZmF1bHQgY29tcG9uZW50IGluIGVhY2hcblx0XHQvLyByZWdpb24gd2l0aCBhIHNwZWNpZmllZCB0ZW1wbGF0ZS9jb21wb25lbnRcblx0XHRGUkFNRVdPUksuUmVnaW9uLmZyb21FbGVtZW50KGVsKTtcblx0fSk7XG5cbn07XG4iLCIvKipcbiAqIExvYWQgYW55IHNjcmlwdCB0YWdzIG9uIHRoZSBwYWdlIHdpdGggdHlwZT1cInRleHQvdGVtcGxhdGVcIi5cbiAqXG4gKiBAcmV0dXJuIHtPYmplY3R9IFtPYmplY3QgY29uc2lzdGluZyBvZiBhIHRlbXBsYXRlIGlkZW50aWZpZXIgYW5kIGl0cyBIVE1MLl1cbiAqL1xuXG52YXIgZWwyTWFzdElEID0gcmVxdWlyZSgnLi4vdXRpbHMvZWwyTWFzdElEJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY29sbGVjdFRlbXBsYXRlc0Zyb21TY3JpcHRUYWdzKCkge1xuXHR2YXIgdGVtcGxhdGVzID0ge307XG5cblx0JCgnc2NyaXB0W3R5cGU9XCJ0ZXh0L3RlbXBsYXRlXCJdJykuZWFjaChmdW5jdGlvbiAoaSwgZWwpIHtcblx0XHR2YXIgaWQgPSBlbDJNYXN0SUQoZWwsIHRydWUpO1xuXHRcdHRlbXBsYXRlc1tpZF0gPSAkKGVsKS5odG1sKCk7XG5cblx0XHQvLyBTdHJpcCB3aGl0ZXNwYWNlIGxlZnRvdmVyIGZyb20gc2NyaXB0IHRhZ3Ncblx0XHR0ZW1wbGF0ZXNbaWRdID0gdGVtcGxhdGVzW2lkXS5yZXBsYWNlKC9eXFxzKy8sJycpO1xuXHRcdHRlbXBsYXRlc1tpZF0gPSB0ZW1wbGF0ZXNbaWRdLnJlcGxhY2UoL1xccyskLywnJyk7XG5cblx0XHQvLyBSZW1vdmUgZnJvbSBET01cblx0XHQkKGVsKS5yZW1vdmUoKTtcblx0fSk7XG5cblx0cmV0dXJuIHRlbXBsYXRlcztcbn07XG4iLCIvKipcbiAqIFRoaXMgaXMgdGhlIHN0YXJ0aW5nIHBvaW50IHRvIHlvdXIgYXBwbGljYXRpb24uICBZb3Ugc2hvdWxkIGdyYWIgdGVtcGxhdGVzIGFuZCBjb21wb25lbnRzXG4gKiBiZWZvcmUgY2FsbGluZyBGUkFNRVdPUksucmFpc2UoKSB1c2luZyBzb21ldGhpbmcgbGlrZSBSZXF1aXJlLmpzLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG5cdFx0ZGF0YTogeyBhdXRoZW50aWNhdGVkOiBmYWxzZSB9LFxuXHRcdHRlbXBsYXRlczogeyBjb21wb25lbnROYW1lOiBIVE1MT3JQcmVjb21waWxlZEZuIH0sXG5cdFx0Y29tcG9uZW50czogeyBjb21wb25lbnROYW1lOiBDb21wb25lbnREZWZpbml0aW9uIH1cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNiXG4gKi9cblxudmFyIExvZ2dlciA9IHJlcXVpcmUoJy4uL2xvZ2dlci9pbmRleCcpO1xudmFyIGJ1aWxkQ29tcG9uZW50RGVmaW5pdGlvbiA9IHJlcXVpcmUoJy4uL2RlZmluZS9idWlsZERlZmluaXRpb24nKTtcbnZhciBidWlsZENvbXBvbmVudFByb3RvdHlwZSA9IHJlcXVpcmUoJy4vYnVpbGRQcm90b3R5cGUnKTtcbnZhciBjb2xsZWN0VGVtcGxhdGVzRnJvbVNjcmlwdFRhZ3MgPSByZXF1aXJlKCcuL2NvbGxlY3RUZW1wbGF0ZXNGcm9tU2NyaXB0VGFncycpO1xudmFyIGNvbGxlY3RSZWdpb25zID0gcmVxdWlyZSgnLi9jb2xsZWN0UmVnaW9ucycpO1xudmFyIHNldHVwUm91dGVyID0gcmVxdWlyZSgnLi4vcm91dGVyL2luZGV4Jyk7XG5cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByYWlzZShvcHRpb25zLCBjYikge1xuXG5cdC8vIElmIG9ubHkgb25lIGFyZyBpcyBwcmVzZW50LCB1c2Ugb3B0aW9ucyBhcyBjYWxsYmFjayBpZiBwb3NzaWJsZS5cblx0Ly8gSWYgb3B0aW9ucyBhcmUgbm90IGRlZmluZWQsIHVzZSBhbiBlbXB0eSBvYmplY3QuXG5cdGlmICghY2IgJiYgXy5pc0Z1bmN0aW9uKG9wdGlvbnMpKSB7XG5cdFx0Y2IgPSBvcHRpb25zO1xuXHR9XG5cdGlmICghXy5pc1BsYWluT2JqZWN0KG9wdGlvbnMpKSB7XG5cdFx0b3B0aW9ucyA9IHt9O1xuXHR9XG5cblx0Ly8gSW50ZXJwcmV0IGBwcm9kdWN0aW9uYCBhcyBgbG9nTGV2ZWwgPT09ICdzaWxlbnQnYFxuXHRpZiAoRlJBTUVXT1JLLm9wdGlvbnMucHJvZHVjdGlvbikge1xuXHRcdEZSQU1FV09SSy5vcHRpb25zLmxvZ0xldmVsID0gJ3NpbGVudCc7XG5cdH1cblxuXHQvLyBJbml0aWFsaXplIGxvZ2dlclxuXHRuZXcgTG9nZ2VyKCk7XG5cblx0Ly8gTWVyZ2UgZGF0YSBpbnRvIEZSQU1FV09SSy5kYXRhXG5cdF8uZXh0ZW5kKEZSQU1FV09SSy5kYXRhLCBvcHRpb25zLmRhdGEgfHwge30pO1xuXG5cdC8vIE1lcmdlIHNwZWNpZmllZCB0ZW1wbGF0ZXMgd2l0aCBGUkFNRVdPUksudGVtcGxhdGVzXG5cdF8uZXh0ZW5kKEZSQU1FV09SSy50ZW1wbGF0ZXMsIG9wdGlvbnMudGVtcGxhdGVzIHx8IHt9KTtcblxuXHQvLyBJZiBGUkFNRVdPUksuZGVmaW5lKCkgd2FzIHVzZWQsIGJ1aWxkIHRoZSBsaXN0IG9mIGNvbXBvbmVudHNcblx0Ly8gSXRlcmF0ZSB0aHJvdWdoIHRoZSBkZWZpbmUgcXVldWUgYW5kIGNyZWF0ZSBlYWNoIGRlZmluaXRpb25cblx0Xy5lYWNoKEZSQU1FV09SSy5fZGVmaW5lUXVldWUsIGJ1aWxkQ29tcG9uZW50RGVmaW5pdGlvbik7XG5cblx0Ly8gTWVyZ2Ugc3BlY2lmaWVkIGNvbXBvbmVudHMgdy8gRlJBTUVXT1JLLmNvbXBvbmVudHNcblx0Xy5leHRlbmQoRlJBTUVXT1JLLmNvbXBvbmVudHMsIG9wdGlvbnMuY29tcG9uZW50cyB8fCB7fSk7XG5cblx0Ly8gQmFjayB1cCBlYWNoIGNvbXBvbmVudCBkZWZpbml0aW9uIGJlZm9yZSB0cmFuc2Zvcm1pbmcgaXQgaW50byBhIGxpdmUgcHJvdG90eXBlXG5cdEZSQU1FV09SSy5jb21wb25lbnREZWZzID0gXy5jbG9uZShGUkFNRVdPUksuY29tcG9uZW50cyk7XG5cblx0Ly8gUnVuIHRoaXMgY2FsbCBiYWNrIHdoZW4gdGhlIERPTSBpcyByZWFkeVxuXHQkKGZ1bmN0aW9uICgpIHtcblxuXHRcdC8vIENvbGxlY3QgYW55IDxzY3JpcHQ+IHRhZyB0ZW1wbGF0ZXMgb24gdGhlIHBhZ2Vcblx0XHQvLyBhbmQgYWJzb3JiIHRoZW0gaW50byBGUkFNRVdPUksudGVtcGxhdGVzXG5cdFx0Xy5leHRlbmQoRlJBTUVXT1JLLnRlbXBsYXRlcywgY29sbGVjdFRlbXBsYXRlc0Zyb21TY3JpcHRUYWdzKCkpO1xuXG5cdFx0Ly8gQnVpbGQgYWN0dWFsIHByb3RvdHlwZXMgZm9yIHRoZSBjb21wb25lbnRzXG5cdFx0Ly8gKG5lZWQgdGhlIHRlbXBsYXRlcyBhdCB0aGlzIHBvaW50IHRvIG1ha2UgdGhpcyB3b3JrKVxuXHRcdF8uZWFjaChGUkFNRVdPUksuY29tcG9uZW50cywgYnVpbGRDb21wb25lbnRQcm90b3R5cGUpO1xuXG5cdFx0Ly8gR3JhYiBpbml0aWFsIHJlZ2lvbnMgZnJvbSBET01cblx0XHRjb2xsZWN0UmVnaW9ucygpO1xuXG5cdFx0Ly8gQmluZCBnbG9iYWwgRE9NIGV2ZW50cyBhcyBGUkFNRVdPUksgZXZlbnRzXG5cdFx0Ly8gKGUuZy4gJXdpbmRvdzpyZXNpemUpXG5cdFx0dmFyIHRyaWdnZXJSZXNpemVFdmVudCA9IF8uZGVib3VuY2UoZnVuY3Rpb24gKCkge1xuXHRcdFx0RlJBTUVXT1JLLnRyaWdnZXIoJyV3aW5kb3c6cmVzaXplJyk7XG5cdFx0fSwgRlJBTUVXT1JLLm9wdGlvbnMudGhyb3R0bGVXaW5kb3dSZXNpemUgfHwgMCk7XG5cdFx0JCh3aW5kb3cpLnJlc2l6ZSh0cmlnZ2VyUmVzaXplRXZlbnQpO1xuXHRcdC8vIFRPRE86IGFkZCBtb3JlIGV2ZW50cyBhbmQgZXh0cmFwb2xhdGUgdGhpcyBsb2dpYyB0byBhIHNlcGFyYXRlIG1vZHVsZVxuXG5cdFx0Ly8gRG8gdGhlIGluaXRpYWwgcm91dGluZyBzZXF1ZW5jZVxuXHRcdC8vIExvb2sgYXQgdGhlICNmcmFnbWVudCB1cmwgYW5kIGZpcmUgdGhlIGdsb2JhbCByb3V0ZSBldmVudFxuXHRcdHNldHVwUm91dGVyKCk7XG5cdFx0RlJBTUVXT1JLLmhpc3Rvcnkuc3RhcnQoXy5kZWZhdWx0cyh7XG5cdFx0XHRwdXNoU3RhdGU6IHVuZGVmaW5lZCxcblx0XHRcdGhhc2hDaGFuZ2U6IHVuZGVmaW5lZCxcblx0XHRcdHJvb3Q6IHVuZGVmaW5lZFxuXHRcdH0sIG9wdGlvbnMpKTtcblxuXHRcdGlmIChjYikgY2IoKTtcblx0fSk7XG59O1xuIiwiLyoqXG4gKiBBcHBlbmQgYSBjb21wb25lbnQgdG8gdGhlIGVuZCBvZiBhIHJlZ2lvbi4gVGhpcyBjYWxscyBpbnNlcnQgYXQgdGhlIGxhc3QgcG9zaXRpb24uXG4gKlxuICogQHBhcmFtICB7U3RyaW5nfSBjb21wb25lbnRJZCBbVGhlIGNvbXBvbmVudCBpZCB0aGF0IHdlIHdhbnQgdG8gYXBwZW5kXVxuICogQHBhcmFtICB7T2JqZWN0fSBwcm9wZXJ0aWVzICBbUHJvcGVydGllcyB0byBpbnN0YW50aWF0ZSB0aGUgY29tcG9uZW50IHdpdGhdXG4gKlxuICogQHJldHVybiB7Q29tcG9uZW50fSAgICAgICAgICBbTmV3bHkgYXBwZW5kZWQgQ29tcG9uZW50XVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGFwcGVuZChjb21wb25lbnRJZCwgcHJvcGVydGllcykge1xuXHQvLyBJbnNlcnQgYXQgbGFzdCBwb3NpdGlvblxuXHRyZXR1cm4gdGhpcy5pbnNlcnQodGhpcy5fY2hpbGRyZW4ubGVuZ3RoLCBjb21wb25lbnRJZCwgcHJvcGVydGllcyk7XG59O1xuIiwiLyoqXG4gKiBTaG9ydGN1dCBmb3IgY2FsbGluZyBlbXB0eSgpIGFuZCB0aGVuIGFwcGVuZCgpLFxuICogVGhpcyBpcyB0aGUgZ2VuZXJhbCB1c2UgY2FzZSBmb3IgbWFuYWdpbmcgc3ViY29tcG9uZW50c1xuICogKGUuZy4gd2hlbiBhIG5hdmJhciBpdGVtIGlzIHRvdWNoZWQpXG4gKlxuICogQHBhcmFtICB7U3RyaW5nfSBjb21wb25lbnQgIFtUaGUgaWQgbmFtZSBvZiB0aGUgY29tcG9uZXQgdGhhdCB5b3Ugd2FudCB0byBhdHRhY2hdXG4gKiBAcGFyYW0gIHtPYmplY3R9IHByb3BlcnRpZXMgW1Byb3BlcnRpZXMgdGhhdCB0aGUgYXR0YWNoZWQgY29tcG9uZW50IHdpbGwgYmUgaW5pdGFsaXplZCB3aXRoXVxuICpcbiAqIEByZXR1cm4ge0NvbXBvbmVudH0gXHRcdFx0XHQgW05ld2x5IGF0dGFjaGVkIGNvbXBvbmVudF1cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBhdHRhY2goY29tcG9uZW50LCBwcm9wZXJ0aWVzKSB7XG5cdHRoaXMuZW1wdHkoKTtcblx0cmV0dXJuIHRoaXMuYXBwZW5kKGNvbXBvbmVudCwgcHJvcGVydGllcyk7XG59O1xuIiwiLyoqXG4gKiByZWdpb24uZW1wdHkoIClcbiAqXG4gKiBJdGVyYXRlIG92ZXIgZWFjaCBjb21wb25lbnQgaW4gdGhpcyByZWdpb24gYW5kIGNhbGwgLmNsb3NlKCkgb24gaXRcbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBlbXB0eSgpIHtcblx0RlJBTUVXT1JLLmRlYnVnKHRoaXMucGFyZW50LmlkICsgJyA6OiBFbXB0eWluZyByZWdpb246ICcgKyB0aGlzLmlkKTtcblx0d2hpbGUgKHRoaXMuX2NoaWxkcmVuLmxlbmd0aCA+IDApIHtcblx0XHR0aGlzLnJlbW92ZSgwKTtcblx0fVxufTtcbiIsIi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llc1xuICovXG52YXIgZWwyTWFzdElEID0gcmVxdWlyZSgnLi4vdXRpbHMvZWwyTWFzdElEJyksXG5cdGVsMkRlZmF1bHRUZW1wbGF0ZUlEID0gcmVxdWlyZSgnLi4vdXRpbHMvZWwyRGVmYXVsdFRlbXBsYXRlSUQnKTtcblxuXG5cbi8qKlxuICogRmFjdG9yeSBtZXRob2QgdG8gZ2VuZXJhdGUgYSBuZXcgcmVnaW9uIGluc3RhbmNlIGZyb20gYSBET00gZWxlbWVudFxuICogQWxzbyBpbXBsZW1lbnRzIGB0ZW1wbGF0ZWAgYW5kIGBjb3VudGAgZGlyZWN0aXZlcywgYXMgd2VsbCBhcyBzdXBwb3J0XG4gKiBmb3IgZW1iZWRkZWQgdGVtcGxhdGVzIGJ5IGNoZWNraW5nIGBlbGAncyBpbm5lckhUTUwuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnNcbiAqIEByZXR1cm5zIHJlZ2lvbiBpbnN0YW5jZVxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZnJvbUVsZW1lbnQoZWwsIHBhcmVudCkge1xuXG5cdC8vIElmIHBhcmVudCBpcyBub3Qgc3BlY2lmaWVkLCBtYWtlLWJlbGlldmUuXG5cdHBhcmVudCA9IHBhcmVudCB8fCB7IGlkOiAnKicgfTtcblxuXHR2YXIgJGVsID0gJChlbCk7XG5cblxuXHQvLyBCdWlsZCByZWdpb25cblx0dmFyIHJlZ2lvbiA9IG5ldyBGUkFNRVdPUksuUmVnaW9uKHtcblx0XHRpZDogZWwyTWFzdElEKGVsKSxcblx0XHQkZWw6ICRlbCxcblx0XHRwYXJlbnQ6IHBhcmVudFxuXHR9KTtcblxuXHR2YXIgZW1iZWRkZWRDb21wb25lbnQgPSByZWdpb24uZW1iZWRkZWRDb21wb25lbnQ7XG5cblxuXHQvLyBJZiBgdGVtcGxhdGVgIHNob3J0Y3V0IGlzIGVuYWJsZWQsIGFwcGVuZCBzcGVjaWZpZWQgc3ViLWNvbXBvbmVudChzKVxuXHQvLyB0byB0aGUgcmVnaW9uIGF1dG9tYXRpY2FsbHlcblx0aWYgKCBGUkFNRVdPUksub3B0aW9ucy5zaG9ydGN1dC50ZW1wbGF0ZSAmJiBlbWJlZGRlZENvbXBvbmVudCApIHtcblxuXHRcdC8vIElmIGBjb3VudGAgaXMgc2V0LCByZW5kZXIgc3ViLWNvbXBvbmVudCBzcGVjaWZpZWQgbnVtYmVyIG9mIHRpbWVzLlxuXHRcdC8vIGUuZy4gPHJlZ2lvbiB0ZW1wbGF0ZT1cIkZvb1wiIGNvdW50PVwiM1wiIC8+XG5cdFx0Ly9cblx0XHQvLyAoTm90ZSB0aGF0IGlmIHRoZSBgY291bnRgIHNob3J0Y3V0IGlzIGRpc2FibGVkLCBgY291bnRgIGlzIGFsd2F5cyA9IDEpXG5cdFx0dmFyIGNvdW50O1xuXHRcdGlmIChGUkFNRVdPUksub3B0aW9ucy5zaG9ydGN1dC5jb3VudCkge1xuXHRcdFx0Y291bnQgPSAodHlwZW9mICRlbC5hdHRyKCdjb3VudCcpICE9PSAndW5kZWZpbmVkJykgPyAkZWwuYXR0cignY291bnQnKSA6IDE7XG5cdFx0fVxuXG5cdFx0Ly8gQXBwZW5kIHRoZSBzdWJjb21wb25lbnQgdGhlIGFwcHJvcHJpYXRlICMgb2YgdGltZXMuXG5cdFx0Zm9yICh2YXIgaT0wOyBpIDwgY291bnQ7IGkrKyApIHtcblx0XHRcdHJlZ2lvbi5hcHBlbmQoZW1iZWRkZWRDb21wb25lbnQpO1xuXHRcdH1cblxuXHRcdEZSQU1FV09SSy5kZWJ1Zyhcblx0XHRcdHBhcmVudC5pZCArICcgOi06IEluc3RhbnRpYXRlZMKgbmV3IHJlZ2lvbicgK1xuXHRcdFx0KCByZWdpb24uaWQgPyAnIGAnICsgcmVnaW9uLmlkICsgJ2AnIDogJycgKSArXG5cdFx0XHQoIGVtYmVkZGVkQ29tcG9uZW50ID8gJyBhbmQgcG9wdWxhdGVkIGl0IHdpdGgnICtcblx0XHRcdFx0KCBjb3VudCA+IDEgPyBjb3VudCArICcgaW5zdGFuY2VzIG9mJyA6ICcgMScgKSArXG5cdFx0XHRcdCcgYCcgKyBlbWJlZGRlZENvbXBvbmVudCArICdgJyA6ICcnXG5cdFx0XHQpICsgJy4nXG5cdFx0KTtcblx0fVxuXG5cdHJldHVybiByZWdpb247XG59O1xuIiwiLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzXG4gKi9cblxudmFyIGluc2VydCA9IHJlcXVpcmUoJy4vaW5zZXJ0JyksXG5cdHJlbW92ZSA9IHJlcXVpcmUoJy4vcmVtb3ZlJyksXG5cdGVtcHR5ID0gcmVxdWlyZSgnLi9lbXB0eScpLFxuXHRhcHBlbmQgPSByZXF1aXJlKCcuL2FwcGVuZCcpLFxuXHRhdHRhY2ggPSByZXF1aXJlKCcuL2F0dGFjaCcpLFxuXHRwcmVwZW5kID0gcmVxdWlyZSgnLi9wcmVwZW5kJyksXG5cdGZyb21FbGVtZW50ID0gcmVxdWlyZSgnLi9mcm9tRWxlbWVudCcpLFxuXHRlbDJEZWZhdWx0VGVtcGxhdGVJRCA9IHJlcXVpcmUoJy4uL3V0aWxzL2VsMkRlZmF1bHRUZW1wbGF0ZUlEJyk7XG5cblxuLyoqXG4gKiBGUkFNRVdPUksuUmVnaW9uXG4gKlxuICogQHBhcmFtICB7T2JqZWN0fSBwcm9wZXJ0aWVzXG4gKlxuICogQGNvbnN0cnVjdG9yXG4gKi9cblxudmFyIFJlZ2lvbiA9IG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcmVnaW9uKHByb3BlcnRpZXMpIHtcblxuXHRfLmV4dGVuZCh0aGlzLCBGUkFNRVdPUksuRXZlbnRzKTtcblxuXHRpZiAoIXByb3BlcnRpZXMpIHtcblx0XHRwcm9wZXJ0aWVzID0ge307XG5cdH1cblx0aWYgKCFwcm9wZXJ0aWVzLiRlbCkge1xuXHRcdHRocm93IG5ldyBFcnJvcignVHJ5aW5nIHRvIGluc3RhbnRpYXRlIHJlZ2lvbiB3aXRoIG5vICRlbCEnKTtcblx0fVxuXG5cdC8vIEZvbGQgaW4gcHJvcGVydGllcyB0byBwcm90b3R5cGVcblx0Xy5leHRlbmQodGhpcywgcHJvcGVydGllcyk7XG5cblx0Ly8gSWYgdGhlIHJlZ2lvbiBoYXMgYSBjb21wb25lbnQvdGVtcGxhdGUgaWRlbnRpZmllciwgKGUuZy4gPHJlZ2lvbiB0ZW1wbGF0ZT1cIkZvb1wiIC8+KVxuXHQvLyB3ZSdsbCB1c2UgdGhhdCBhcyB0aGUgYGVtYmVkZGVkQ29tcG9uZW50YC5cblx0dGhpcy5lbWJlZGRlZENvbXBvbmVudCA9IGVsMkRlZmF1bHRUZW1wbGF0ZUlEKHRoaXMuJGVsWzBdKTtcblxuXHQvLyBOZXh0LCBjaGVjayBpZiB0aGUgcmVnaW9uIGhhcyBhbnkgZW1iZWRkZWQgSFRNTC5cblx0dmFyIGVtYmVkZGVkVGVtcGxhdGUgPSB0aGlzLiRlbC5odG1sKCk7XG5cblx0Ly8gVHJpbSB3aGl0ZXNwYWNlIGZyb20gZW1iZWRkZWQgdGVtcGxhdGUgaW4gY2FzZSBpdCB3YXMgaW5jbHVkZWQgYnkgYWNjaWRlbnQuXG5cdGVtYmVkZGVkVGVtcGxhdGUgPSBlbWJlZGRlZFRlbXBsYXRlICYmIGVtYmVkZGVkVGVtcGxhdGUucmVwbGFjZSgvXlxccysvLCAnJyk7XG5cdGVtYmVkZGVkVGVtcGxhdGUgPSBlbWJlZGRlZFRlbXBsYXRlICYmIGVtYmVkZGVkVGVtcGxhdGUucmVwbGFjZSgvXFxzKyQvLCAnJyk7XG5cblx0Ly8gSW5zdGFudGlhdGUgYW4gYW5vbnltb3VzIGNvbXBvbmVudCBmb3IgdGhlIGVtYmVkZGVkIHRlbXBsYXRlLlxuXHRpZiAoZW1iZWRkZWRUZW1wbGF0ZSkge1xuXG5cdFx0Ly8gV2lwZSB0aGUgZW1iZWRkZWQgSFRNTCBmcm9tIHRoZSBET00uXG5cdFx0Ly8gTk9URTogdGhpcyBzdGVwIGNvdWxkIGJlIG9taXR0ZWQsIGJ1dCBsZWF2aW5nIGl0IGluIG5vdyBmb3Igc2FmZXR5LlxuXHRcdHRoaXMuJGVsLmVtcHR5KCk7XG5cblx0XHQvLyAobWF5YmUgbGF0ZXIpIFRPRE86XG5cdFx0Ly8gYWxsb3cgZW1iZWRkZWQgdGVtcGxhdGVzIHRvIGJlIG5hbWVkIHRoaXMgd2F5LCBlLmcuIGA8cmVnaW9uIHRlbXBsYXRlPVwiRm9vXCI+PC9yZWdpb24+YFxuXHRcdC8vIChzaG91bGQgYmUgdmVyeSBlYXN5KVxuXHRcdC8vXG5cdFx0Ly8gaWQ6IHRoaXMuZW1iZWRkZWRDb21wb25lbnQsXG5cblx0XHQvLyBFeHRlbmQgYSBjb21wb25lbnQgcHJvdG90eXBlLCB0aGVuIGluc3RhbnRpYXRlIHRoZSBjb21wb25lbnQsXG5cdFx0Ly8gYnV0IGRvbid0IHJlbmRlciB5ZXQuICBJdCdzIGFscmVhZHkgcmVuZGVyZWQsIG1vc3RseSEgKGV4Y2VwdCBmb3IgSVRTIHJlZ2lvbnMpXG5cdFx0Ly8gV2UnbGwgdXNlIHRoaXMgYW5vbnltb3VzIGNvbXBvbmVudCBpbnN0YW5jZSBhcyBvdXIgYGVtYmVkZGVkQ29tcG9uZW50YCBmb3IgdGhpc1xuXHRcdC8vIHJlZ2lvbi5cblx0XHR0aGlzLmVtYmVkZGVkQ29tcG9uZW50ID0gbmV3IChcblx0XHRcdEZSQU1FV09SSy5Db21wb25lbnQuZXh0ZW5kKHtcblx0XHRcdFx0dGVtcGxhdGU6IGVtYmVkZGVkVGVtcGxhdGVcblx0XHRcdH0pXG5cdFx0KShwcm9wZXJ0aWVzKTtcblxuXHR9XG5cblx0Ly8gSWYgbmVpdGhlciBhbiBpZCBub3IgYSBgdGVtcGxhdGVgIHdhcyBzcGVjaWZpZWQsXG5cdC8vIHdlJ2xsIHRocm93IGFuIGVycm9yLCBzaW5jZSB0aGVyZSdzIG5vIHdheSB0byBnZXQgYSBob2xkIG9mIHRoZSByZWdpb25cblx0aWYgKCAhdGhpcy5pZCAmJiAhdGhpcy5lbWJlZGRlZENvbXBvbmVudCApIHtcblxuXHRcdHRocm93IG5ldyBFcnJvcihcblx0XHRcdHRoaXMucGFyZW50LmlkICsgJyA6OiBBIHJlZ2lvbiBpZGVudGlmaWVyIChlLmcuIGBkYXRhLXJlZ2lvbj1cImZvb1wiYCkgbWF5ICcgK1xuXHRcdFx0J29ubHkgYmUgb21pdHRlZCBpZiBhIGRlZmF1bHQgdGVtcGxhdGUgaXMgc3BlY2lmaWVkLCBlLmcuOlxcbicgK1xuXHRcdFx0J2UuZy4gPHJlZ2lvbiB0ZW1wbGF0ZT1cIlNvbWVDb21wb25lbnRcIj48L3JlZ2lvbj4nXG5cdFx0KTtcblx0fVxuXG5cdC8vIFNldCB1cCBsaXN0IHRvIGhvdXNlIGNoaWxkIGNvbXBvbmVudHNcblx0dGhpcy5fY2hpbGRyZW4gPSBbXTtcblxuXHRfLmJpbmRBbGwodGhpcyk7XG5cblx0Ly8gU2V0IHVwIGNvbnZlbmllbmNlIGFjY2VzcyB0byB0aGlzIHJlZ2lvbiBpbiB0aGUgZ2xvYmFsIHJlZ2lvbiBjYWNoZVxuXHRGUkFNRVdPUksucmVnaW9uc1t0aGlzLmlkXSA9IHRoaXM7XG59O1xuXG5SZWdpb24uZnJvbUVsZW1lbnQgPSBmdW5jdGlvbihlbCwgcGFyZW50KSB7XG5cdHJldHVybiBmcm9tRWxlbWVudChlbCwgcGFyZW50KTtcbn07XG5SZWdpb24ucHJvdG90eXBlLnJlbW92ZSA9IGZ1bmN0aW9uKGF0SW5kZXgpIHtcblx0cmV0dXJuIHJlbW92ZS5jYWxsKHRoaXMsIGF0SW5kZXgpO1xufTtcblJlZ2lvbi5wcm90b3R5cGUuZW1wdHkgPSBmdW5jdGlvbigpIHtcblx0cmV0dXJuIGVtcHR5LmNhbGwodGhpcyk7XG59O1xuUmVnaW9uLnByb3RvdHlwZS5pbnNlcnQgPSBmdW5jdGlvbihhdEluZGV4LCBjb21wb25lbnRJZCwgcHJvcGVydGllcykge1xuXHRyZXR1cm4gaW5zZXJ0LmNhbGwodGhpcywgYXRJbmRleCwgY29tcG9uZW50SWQsIHByb3BlcnRpZXMpO1xufTtcblJlZ2lvbi5wcm90b3R5cGUuYXBwZW5kID0gZnVuY3Rpb24oY29tcG9uZW50SWQsIHByb3BlcnRpZXMpIHtcblx0cmV0dXJuIGFwcGVuZC5jYWxsKHRoaXMsIGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKTtcbn07XG5SZWdpb24ucHJvdG90eXBlLmF0dGFjaCA9IGZ1bmN0aW9uKGNvbXBvbmVudCwgcHJvcGVydGllcykge1xuXHRyZXR1cm4gYXR0YWNoLmNhbGwodGhpcywgY29tcG9uZW50LCBwcm9wZXJ0aWVzKTtcbn07XG5SZWdpb24ucHJvdG90eXBlLnByZXBlbmQgPSBmdW5jdGlvbihjb21wb25lbnRJZCwgcHJvcGVydGllcykge1xuXHRyZXR1cm4gcHJlcGVuZC5jYWxsKHRoaXMsIGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKTtcbn07XG4iLCIvKipcbiAqIHJlZ2lvbi5pbnNlcnQoIGF0SW5kZXgsIGNvbXBvbmVudElkLCBbcHJvcGVydGllc10gKVxuICpcbiAqIFRPRE86IHN1cHBvcnQgYSBsaXN0IG9mIHByb3BlcnRpZXMgb2JqZWN0cyBpbiBsaWV1IG9mIHRoZSBwcm9wZXJ0aWVzIG9iamVjdFxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaW5zZXJ0KGF0SW5kZXgsIGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKSB7XG5cblx0dmFyIGVyciA9ICcnO1xuXHRpZiAoIShhdEluZGV4IHx8IF8uaXNGaW5pdGUoYXRJbmRleCkpKSB7XG5cdFx0ZXJyICs9IHRoaXMuaWQgKyAnLmluc2VydCgpIDo6IE5vIGF0SW5kZXggc3BlY2lmaWVkISc7XG5cdH1cblx0ZWxzZSBpZiAoIWNvbXBvbmVudElkKSB7XG5cdFx0ZXJyICs9IHRoaXMuaWQgKyAnLmluc2VydCgpIDo6IE5vIGNvbXBvbmVudElkIHNwZWNpZmllZCEnO1xuXHR9XG5cdGlmIChlcnIpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoZXJyICsgJ1xcblVzYWdlOiBpbnNlcnQoYXRJbmRleCwgY29tcG9uZW50SWQsIFtwcm9wZXJ0aWVzXSknKTtcblx0fVxuXG5cdHZhciBjb21wb25lbnQ7XG5cdC8vIElmIGNvbXBvbmVudElkIGlzIGEgc3RyaW5nLCBsb29rIHVwIGNvbXBvbmVudCBwcm90b3R5cGUgYW5kIGluc3RhdGlhdGVcblx0aWYgKCdzdHJpbmcnID09IHR5cGVvZiBjb21wb25lbnRJZCkge1xuXG5cdFx0dmFyIGNvbXBvbmVudFByb3RvdHlwZSA9IEZSQU1FV09SSy5jb21wb25lbnRzW2NvbXBvbmVudElkXTtcblxuXHRcdGlmICghY29tcG9uZW50UHJvdG90eXBlKSB7XG5cdFx0XHR2YXIgdGVtcGxhdGUgPSBGUkFNRVdPUksudGVtcGxhdGVzW2NvbXBvbmVudElkXTtcblx0XHRcdGlmICghdGVtcGxhdGUpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yICgnSW4gJyArXG5cdFx0XHRcdFx0KHRoaXMuaWQgfHwgJ0Fub255bW91cyByZWdpb24nKSArICc6OiBUcnlpbmcgdG8gaW5zZXJ0ICcgK1xuXHRcdFx0XHRcdGNvbXBvbmVudElkICsgJywgYnV0IG5vIHRlbXBsYXRlIGV4aXN0cyB3aXRoIHRoYXQgaWQuJyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIElmIG5vIGNvbXBvbmVudCBwcm90b3R5cGUgZXhpc3RzIGZvciB0aGUgdGVtcGxhdGVcblx0XHRcdC8vIHdpdGggdGhlIHNwZWNpZmlmZWQgaWQsIGNyZWF0ZSBhIHN0dWIgb25lIG9uIHRoZSBmbHkuXG5cdFx0XHRjb21wb25lbnRQcm90b3R5cGUgPSBGUkFNRVdPUksuQ29tcG9uZW50LmV4dGVuZCh7XG5cdFx0XHRcdGlkOiBjb21wb25lbnRJZCxcblx0XHRcdFx0dGVtcGxhdGU6IHRlbXBsYXRlXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBJbnN0YW50aWF0ZSBhbmQgcmVuZGVyIHRoZSBjb21wb25lbnQgaW5zaWRlIHRoaXMgcmVnaW9uXG5cdFx0Y29tcG9uZW50ID0gbmV3IGNvbXBvbmVudFByb3RvdHlwZShfLmV4dGVuZCh7XG5cdFx0XHQkb3V0bGV0OiB0aGlzLiRlbFxuXHRcdH0sIHByb3BlcnRpZXMgfHwge30pKTtcblxuXG5cdH1cblxuXHQvLyBPdGhlcndpc2UgYXNzdW1lIGFuIGluc3RhbnRpYXRlZCBjb21wb25lbnQgb2JqZWN0IHdhcyBzZW50XG5cdC8qIFRPRE86IENoZWNrIHRoYXQgY29tcG9uZW50IG9iamVjdCBpcyB2YWxpZCAqL1xuXHRlbHNlIHtcblx0XHRjb21wb25lbnQgPSBjb21wb25lbnRJZDtcblx0XHRjb21wb25lbnQuJG91dGxldCA9IHRoaXMuJGVsO1xuXHR9XG5cblx0Ly8gU2F2ZSByZWZlcmVuY2UgdG8gcGFyZW50UmVnaW9uXG5cdGNvbXBvbmVudC5wYXJlbnRSZWdpb24gPSB0aGlzO1xuXG5cdC8vIENoZWNrIHRvIHNlZSBpZiB0aGUgbW9kZWwgd2FzIGFscmVhZHkgZGVmaW5lZC4gSWYgaXQgaXMsIHVzZSB0aGF0IG1vZGVsLiBJZiBub3QsIGFzc2lnbiBpdFxuXHQvLyB0aGUgcGFyZW50cyBtb2RlbCBpZiBpdCBoYXMgb25lLCBvciBhc3NpZ24gaXQgYSBuZXcgYmFja2JvbmUgaW5zdGFuY2UuXG5cdGlmICghY29tcG9uZW50Lm1vZGVsKSB7XG5cdFx0Y29tcG9uZW50Lm1vZGVsID0gdGhpcy5wYXJlbnQubW9kZWwgPyB0aGlzLnBhcmVudC5tb2RlbCA6IG5ldyBCYWNrYm9uZS5Nb2RlbCgpO1xuXHR9XG5cblx0Ly8gUmVuZGVyIGNvbXBvbmVudCBpbnRvIHRoaXMgcmVnaW9uXG5cdGNvbXBvbmVudC5yZW5kZXIoYXRJbmRleCk7XG5cblx0Ly8gQW5kIGtlZXAgdHJhY2sgb2YgaXQgaW4gdGhlIGxpc3Qgb2YgdGhpcyByZWdpb24ncyBjaGlsZHJlblxuXHR0aGlzLl9jaGlsZHJlbi5zcGxpY2UoYXRJbmRleCwgMCwgY29tcG9uZW50KTtcblxuXHQvLyBMb2cgZm9yIGRlYnVnZ2luZyBgY291bnRgIGRlY2xhcmF0aXZlXG5cdHZhciBkZWJ1Z1N0ciA9IHRoaXMucGFyZW50LmlkICsgJyA6OiBJbnNlcnRlZCAnICsgY29tcG9uZW50SWQgKyAnIGludG8gJztcblx0aWYgKHRoaXMuaWQpIGRlYnVnU3RyICs9ICdyZWdpb246ICcgKyB0aGlzLmlkICsgJyBhdCBpbmRleCAnICsgYXRJbmRleDtcblx0ZWxzZSBkZWJ1Z1N0ciArPSAnYW5vbnltb3VzIHJlZ2lvbiBhdCBpbmRleCAnICsgYXRJbmRleDtcblx0RlJBTUVXT1JLLnZlcmJvc2UoZGVidWdTdHIpO1xuXG5cdHJldHVybiBjb21wb25lbnQ7XG5cbn07XG4iLCIvKipcbiAqIFByZXBlbmQgYSBjb21wb25lbnQgdG8gdGhlIGJlZ2lubmluZyBvZiBhIHJlZ2lvbi4gVGhpcyBjYWxscyBpbnNlcnQgYXQgdGhlIGZpcnN0IHBvc2l0aW9uLlxuICpcbiAqIEBwYXJhbSAge1N0cmluZ30gY29tcG9uZW50SWQgW1RoZSBjb21wb25lbnQgaWQgdGhhdCB3ZSB3YW50IHRvIHByZXBlbmQgXVxuICogQHBhcmFtICB7T2JqZWN0fSBwcm9wZXJ0aWVzICBbUHJvcGVydGllcyB0byBpbnN0YW50aWF0ZSB0aGUgY29tcG9uZW50IHdpdGhdXG4gKlxuICogQHJldHVybiB7Q29tcG9uZW50fSAgICAgICAgICBbTmV3bHkgcHJlcGVuZGVkIENvbXBvbmVudF1cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBwcmVwZW5kKGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKSB7XG5cdC8vIEluc2VydCBhdCBsYXN0IHBvc2l0aW9uXG5cdHJldHVybiB0aGlzLmluc2VydCgwLCBjb21wb25lbnRJZCwgcHJvcGVydGllcyk7XG59O1xuIiwiLyoqXG4gKiByZWdpb24ucmVtb3ZlKCBhdEluZGV4IClcbiAqXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcmVtb3ZlKGF0SW5kZXgpIHtcblxuXHRpZiAoIWF0SW5kZXggJiYgIV8uaXNGaW5pdGUoYXRJbmRleCkpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IodGhpcy5pZCArICcucmVtb3ZlKCkgOjogTm8gYXRJbmRleCBzcGVjaWZpZWQhIFxcblVzYWdlOiByZW1vdmUoYXRJbmRleCknKTtcblx0fVxuXG5cdC8vIFJlbW92ZSB0aGUgY29tcG9uZW50IGZyb20gdGhlIGxpc3Rcblx0dmFyIGNvbXBvbmVudCA9IHRoaXMuX2NoaWxkcmVuLnNwbGljZShhdEluZGV4LCAxKTtcblx0aWYgKCFjb21wb25lbnRbMF0pIHtcblxuXHRcdC8vIElmIHRoZSBsaXN0IGlzIGVtcHR5LCBmcmVhayBvdXRcblx0XHR0aHJvdyBuZXcgRXJyb3IodGhpcy5pZCArICcucmVtb3ZlKCkgOjogVHJ5aW5nIHRvIHJlbW92ZSBhIGNvbXBvbmVudCB0aGF0IGRvZXNuXFwndCBleGlzdCBhdCBpbmRleCAnICsgYXRJbmRleCk7XG5cdH1cblxuXHQvLyBTcXVlZXplIHRoZSBjb21wb25lbnQgdG8gZG8gZ2V0IGFsbCB0aGUgYmluZHkgZ29vZG5lc3Mgb3V0XG5cdGNvbXBvbmVudFswXS5jbG9zZSgpO1xuXG5cdEZSQU1FV09SSy5kZWJ1Zyh0aGlzLnBhcmVudC5pZCArICcgOjogUmVtb3ZlZCBjb21wb25lbnQgYXQgaW5kZXggJyArIGF0SW5kZXggKyAnIGZyb20gcmVnaW9uOiAnICsgdGhpcy5pZCk7XG59O1xuIiwiLyoqXG4gKiBTZXRzIHVwIHRoZSBGUkFNRVdPUksgcm91dGVyLlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHJvdXRlclNldHVwKCkge1xuXG5cdC8vIFdpbGRjYXJkIHJvdXRlcyB0byBnbG9iYWwgZXZlbnQgZGVsZWdhdG9yXG5cdHZhciByb3V0ZXIgPSBuZXcgRlJBTUVXT1JLLlJvdXRlcigpO1xuXHRyb3V0ZXIucm91dGUoLyguKikvLCAncm91dGUnLCBmdW5jdGlvbiAocm91dGUpIHtcblxuXHRcdC8vIE5vcm1hbGl6ZSBob21lIHJvdXRlcyAoIyBvciBudWxsKSB0byAnJ1xuXHRcdGlmICghcm91dGUpIHtcblx0XHRcdHJvdXRlID0gJyc7XG5cdFx0fVxuXG5cdFx0Ly8gVHJpZ2dlciByb3V0ZVxuXHRcdEZSQU1FV09SSy50cmlnZ2VyKCcjJyArIHJvdXRlKTtcblx0fSk7XG5cblx0Ly8gRXhwb3NlIGBuYXZpZ2F0ZSgpYCBtZXRob2Rcblx0RlJBTUVXT1JLLm5hdmlnYXRlID0gRlJBTUVXT1JLLmhpc3RvcnkubmF2aWdhdGU7XG59XG4iLCIvKipcbiAqIEJhcmUtYm9uZXMgRE9NL1VJIHV0aWxpdGllc1xuICovXG5cbnZhciBFdmVudHMgPSByZXF1aXJlKCcuL2V2ZW50cycpO1xuXG52YXIgRE9NID0ge1xuXG5cdC8qKlxuXHQgKiBFeHBvc2UgdGhlIFwiRE9NbXktZXZlbnRlZG5lc3NcIiBvZiBlbGVtZW50cyBzbyB0aGF0IGl0J3Mgc2VsZWN0YWJsZSB2aWEgQ1NTXG5cdCAqIFlvdSBjYW4gdXNlIHRoaXMgdG8gYXBwbHkgYSBmZXcgY2hvaWNlIERPTSBtb2RpZmljYXRpb25zIG91dCB0aGUgZ2F0ZS0tXG5cdCAqIChlLmcuIHR3ZWFrcyB0YXJnZXRpbmcgY29tbW9uIGlzc3VlcyB0aGF0IHR5cGljYWxseSBnZXQgZm9yZ290dGVuLCBsaWtlIGRpc2FibGluZyB0ZXh0IHNlbGVjdGlvbilcblx0ICpcblx0ICogQHBhcmFtIHtDb21wb25lbnR9IGNvbXBvbmVudFxuXHQgKi9cblx0ZmxhZ0JvdW5kRXZlbnRzOiBmdW5jdGlvbiAoIGNvbXBvbmVudCApIHtcblxuXHRcdC8vIFRPRE86IHByb3ZpZGUgYWNjZXNzIHRvIGJvdW5kIGdsb2JhbCBldmVudHMgKCUpIGFuZCByb3V0ZXMgKCMpIGFzIHdlbGxcblx0XHQvLyBUT0RPOiBmbGFnIGFsbCBET00gZXZlbnRzLCBub3QganVzdCBjbGljayBhbmQgdG91Y2hcblxuXHRcdC8vIEJ1aWxkIHN1YnNldCBvZiBqdXN0IHRoZSBjbGljay90b3VjaCBldmVudHNcblx0XHR2YXIgY2xpY2tPclRvdWNoRXZlbnRzID0gRXZlbnRzLnBhcnNlKFxuXHRcdFx0Y29tcG9uZW50LmV2ZW50cyxcblx0XHRcdHsgb25seTogWydjbGljaycsICd0b3VjaCcsICd0b3VjaHN0YXJ0JywgJ3RvdWNoZW5kJ10gfVxuXHRcdCk7XG5cblx0XHQvLyBJZiBubyBjbGljay90b3VjaCBldmVudHMgZm91bmQsIGJhaWwgb3V0XG5cdFx0aWYgKCBjbGlja09yVG91Y2hFdmVudHMubGVuZ3RoIDwgMSApIHJldHVybjtcblxuXHRcdC8vIFF1ZXJ5IGFmZmVjdGVkIGVsZW1lbnRzIGZyb20gRE9NXG5cdFx0dmFyICRhZmZlY3RlZCA9IEV2ZW50cy5nZXRFbGVtZW50cyhjbGlja09yVG91Y2hFdmVudHMsIGNvbXBvbmVudCk7XG5cblx0XHQvLyBOT1RFOiBGb3Igbm93LCB0aGlzIGlzIGFsd2F5cyBqdXN0ICdjbGljaydcblx0XHR2YXIgYm91bmRFdmVudHNTdHJpbmcgPSAnY2xpY2snO1xuXG5cdFx0Ly8gU2V0IGBkYXRhLUZSQU1FV09SSy1jbGlja2FibGVgIGN1c3RvbSBhdHRyaWJ1dGVcblx0XHQvLyAodWkgbG9naWMgc2hvdWxkIGJlIGV4dGVuZGVkIGluIENTUylcblx0XHQkYWZmZWN0ZWQuYXR0cignZGF0YS0nICsgRlJBTUVXT1JLLm9wdGlvbnMuZnJhbWV3b3JrSWQgKyAnLWV2ZW50cycsIGJvdW5kRXZlbnRzU3RyaW5nKTtcblxuXHRcdEZSQU1FV09SSy52ZXJib3NlKFxuXHRcdFx0Y29tcG9uZW50LmlkICsgJyA6OiAnICtcblx0XHRcdCdEaXNhYmxlZCB1c2VyIHRleHQgc2VsZWN0aW9uIG9uIGVsZW1lbnRzIHcvIGNsaWNrL3RvdWNoIGV2ZW50czonLFxuXHRcdFx0Y2xpY2tPclRvdWNoRXZlbnRzLFxuXHRcdFx0JGFmZmVjdGVkXG5cdFx0KTtcblx0fVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBET007XG4iLCIvKipcbiAqIEluc3BlY3QgYSBET00gZWxlbWVudCBhbmQgc2VlIGlmIGl0IGhhcyBhIGRlZmF1bHQgY29tcG9uZW50L3RlbXBsYXRlIElELlxuICogUHJvdmlkZXMgYmFja3dhcmRzLWNvbXBhdGliaWxpdHkgbGF5ZXIsIGFuZCBub3JtYWxpemVzIHRoZSBzeW50YXggaW4gdGhlIERPTS5cbiAqXG4gKiBAcGFyYW0gIHtET01FbGVtZW50fSBlbFxuICogQHJldHVybiB7U3RyaW5nfSAgICBbdGhlIGlkIG9mIHRoZSBkZWZhdWx0IGNvbXBvbmVudC90ZW1wbGF0ZSwgaWYgb25lIHdhcyBzcGVjaWZpZWRdXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGVsKSB7XG5cblx0Ly8gUHJvdmlkZSBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eSBmb3Jcblx0Ly8gYGRlZmF1bHRgLCBgY29udGVudHNgIGFuZCBgdGVtcGxhdGVgIG5vdGF0aW9uXG5cdHZhciBjb21wb25lbnRJZCA9ICQoZWwpLmF0dHIoJ3RlbXBsYXRlJykgfHwgJChlbCkuYXR0cignZGVmYXVsdCcpIHx8ICQoZWwpLmF0dHIoJ2NvbnRlbnRzJyk7XG5cblx0Ly8gTm9ybWFsaXplIHRvIGB0ZW1wbGF0ZWAgYXR0cmlidXRlIGluIHRoZSBET00uXG5cdCQoZWwpLmF0dHIoJ3RlbXBsYXRlJywgY29tcG9uZW50SWQpO1xuXG5cdHJldHVybiBjb21wb25lbnRJZDtcbn07XG4iLCIvKipcbiAqIEdyYWJzIHRoZSBNYXN0IGlkZW50aWZpZXIgZnJvbSBhbiBIVE1MIGVsZW1lbnQuXG4gKiBTdXBwb3J0cyBgaWRgLCBgZGF0YS1pZGAsIG9yIGBkYXRhLXJlZ2lvbmBcbiAqXG4gKiBAcGFyYW0gIHtET01FbGVtZW50fSBlbCAgICBbdGhlIERPTSBlbGVtZW50IHRvIGluc3BlY3RdXG4gKiBAcGFyYW0gIHtCb29sZWFufSByZXF1aXJlZCBbd2hldGhlciBhbiBpZGVudGlmaWVyIGlzIHJlcXVpcmVkXVxuICpcbiAqIEByZXR1cm4ge1N0cmluZ30gICAgICAgICAgIFtpZGVudGlmaWVyXVxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZWwyTWFzdElEIChlbCwgcmVxdWlyZWQpIHtcblxuXHR2YXIgaWQgPSAkKGVsKS5hdHRyKCdpZCcpO1xuXHR2YXIgZGF0YUlkID0gJChlbCkuYXR0cignZGF0YS1pZCcpIHx8ICQoZWwpLmF0dHIoJ2RhdGEtcmVnaW9uJyk7XG5cdHZhciBjb250ZW50c0lkID0gJChlbCkuYXR0cignY29udGVudHMnKTtcblxuXHRpZiAoaWQgJiYgZGF0YUlkKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGlkICsgJyA6OiBDYW5ub3Qgc2V0IGJvdGggYGlkYCBhbmQgYGRhdGEtaWRgISAgUGxlYXNlIHVzZSBvbmUgb3IgdGhlIG90aGVyLiAgKGRhdGEtaWQgaXMgc2FmZXN0KScpO1xuXHR9XG5cdGlmIChyZXF1aXJlZCAmJiAhaWQgJiYgIWRhdGFJZCkge1xuXHRcdHRocm93IG5ldyBFcnJvcignTm8gaWQgc3BlY2lmaWVkIGluIGVsZW1lbnQgd2hlcmUgaXQgaXMgcmVxdWlyZWQ6XFxuJyArIGVsKTtcblx0fVxuXG5cdHJldHVybiBpZCB8fCBkYXRhSWQgfHwgY29udGVudHNJZDtcbn07XG4iLCIvKipcbiAqIFV0aWxpdHkgRXZlbnQgdG9vbGtpdFxuICovXG5cbnZhciBFdmVudHMgPSB7XG5cblx0LyoqXG5cdCAqIFBhcnNlcyBhIGRpY3Rpb25hcnkgb2YgZXZlbnRzIGFuZCBvcHRpb25hbGx5IGZpbHRlcnMgYnkgdGhlIGV2ZW50IHR5cGUuIElmIHRoZSBldmVudFxuXHQgKlxuXHQgKiBAcGFyYW0gIHtPYmplY3R9IGV2ZW50cyAgW0EgQmFja2JvbmUuVmlldyBldmVudHMgb2JqZWN0XVxuXHQgKiBAcGFyYW0gIHtPYmplY3R9IG9wdGlvbnMgW09wdGlvbnMgb2JqZWN0IHRoYXQgYWxsb3dzIHVzIHRvIGZpbHRlciBwYXJzaW5nIHRvIGNlcnRhaW4gZXZlbnRcblx0ICogICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lc11cblx0ICpcblx0ICogQHJldHVybiB7QXJyYXl9ICAgICAgICAgIFtBcnJheSBjb250YWluaW5nIHBhcnNlZEV2ZW50cyB0aGF0IGFyZSBtYXRjaGluZyBldmVudCBrZXlzXVxuXHQgKi9cblx0cGFyc2U6IGZ1bmN0aW9uIChldmVudHMsIG9wdGlvbnMpIHtcblxuXHRcdHZhciBldmVudEtleXMgPSBfLmtleXMoZXZlbnRzIHx8IHt9KSxcblx0XHRcdGxpbWl0RXZlbnRzLFxuXHRcdFx0cGFyc2VkRXZlbnRzID0gW107XG5cblx0XHQvLyBPcHRpb25hbGx5IGZpbHRlciB1c2luZyBzZXQgb2YgYWNjZXB0YWJsZSBldmVudCB0eXBlc1xuXHRcdGxpbWl0RXZlbnRzID0gb3B0aW9ucy5vbmx5O1xuXHRcdGV2ZW50S2V5cyA9IF8uZmlsdGVyKGV2ZW50S2V5cywgZnVuY3Rpb24gY2hlY2tFdmVudE5hbWUgKGV2ZW50S2V5KSB7XG5cblx0XHRcdC8vIFBhcnNlIGV2ZW50IHN0cmluZyBpbnRvIHNlbWFudGljIHJlcHJlc2VudGF0aW9uXG5cdFx0XHR2YXIgZXZlbnQgPSBFdmVudHMucGFyc2VET01FdmVudChldmVudEtleSk7XG5cdFx0XHRwYXJzZWRFdmVudHMucHVzaChldmVudCk7XG5cblx0XHRcdC8vIE9wdGlvbmFsIGZpbHRlclxuXHRcdFx0aWYgKGxpbWl0RXZlbnRzKSB7XG5cdFx0XHRcdHJldHVybiBfLmNvbnRhaW5zKGxpbWl0RXZlbnRzLCBldmVudC5uYW1lKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHBhcnNlZEV2ZW50cztcblx0fSxcblxuXHQvKipcblx0ICogW2dldEVsZW1lbnRzIGRlc2NyaXB0aW9uXVxuXHQgKlxuXHQgKiBAcGFyYW0gIHtBcnJheX0gc2VtYW50aWNFdmVudHMgW0EgbGlzdCBvZiBwYXJzZWQgZXZlbnQgb2JqZWN0c11cblx0ICogQHBhcmFtICB7Q29tcG9uZW50fSBjb250ZXh0ICAgIFtJbnN0YW5jZSBvZiBhIGNvbXBvbmVudCB0byB1c2UgYXMgYSBzdGFydGluZyBwb2ludCBmb3Jcblx0ICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGUgRE9NIHF1ZXJpZXNdXG5cdCAqXG5cdCAqIEByZXR1cm4ge0FycmF5fSAgICAgICAgICAgICAgICBbQW4gYXJyYXkgb2YgalF1ZXJ5IHNldCBvZiBtYXRjaGVkIGVsZW1lbnRzXVxuXHQgKi9cblx0Z2V0RWxlbWVudHM6IGZ1bmN0aW9uIChzZW1hbnRpY0V2ZW50cywgY29udGV4dCkge1xuXG5cdFx0Ly8gQ29udGV4dCBvcHRpb25hbFxuXHRcdGNvbnRleHQgPSBjb250ZXh0IHx8IHsgJDogJCB9O1xuXG5cdFx0Ly8gSXRlcmF0aXZlbHkgYnVpbGQgYSBzZXQgb2YgYWZmZWN0ZWQgZWxlbWVudHNcblx0XHR2YXIgJGFmZmVjdGVkID0gJCgpO1xuXHRcdF8uZWFjaChzZW1hbnRpY0V2ZW50cywgZnVuY3Rpb24gbG9va3VwRWxlbWVudHNGb3JFdmVudCAoZXZlbnQpIHtcblxuXHRcdFx0Ly8gRGV0ZXJtaW5lIG1hdGNoZWQgZWxlbWVudHNcblx0XHRcdC8vIFVzZSBkZWxlZ2F0ZSBzZWxlY3RvciBpZiBzcGVjaWZpZWRcblx0XHRcdC8vIE90aGVyd2lzZSwgZ3JhYiB0aGUgZWxlbWVudCBmb3IgdGhpcyBjb21wb25lbnRcblx0XHRcdHZhciAkbWF0Y2hlZCA9XHRldmVudC5zZWxlY3RvciA/XG5cdFx0XHRcdFx0XHRcdGNvbnRleHQuJChldmVudC5zZWxlY3RvcikgOlxuXHRcdFx0XHRcdFx0XHRjb250ZXh0LiRlbDtcblxuXHRcdFx0Ly8gQWRkIG1hdGNoZWQgZWxlbWVudHMgdG8gc2V0XG5cdFx0XHQkYWZmZWN0ZWQgPSAkYWZmZWN0ZWQuYWRkKCAkbWF0Y2hlZCApO1xuXHRcdH0sIHRoaXMpO1xuXG5cdFx0cmV0dXJuICRhZmZlY3RlZDtcblx0fSxcblxuXG5cblx0LyoqXG5cdCAqIFJldHVybnMgd2hldGhlciB0aGUgc3BlY2lmaWVkIGV2ZW50IGtleSBtYXRjaGVzIGEgRE9NIGV2ZW50LlxuXHQgKlxuXHQgKiBAcGFyYW0gIHtTdHJpbmd9IGtleSBbS2V5IHRvIG1hdGNoIGFnYWluc3RdXG5cdCAqXG5cdCAqIGlmIG5vIG1hdGNoIGlzIGZvdW5kXG5cdCAqIEByZXR1cm4ge0Jvb2xlYW59IFx0XHRbcmV0dXJuIGBmYWxzZWBdXG5cdCAqXG5cdCAqIG90aGVyd2lzZVxuXHQgKiBAcmV0dXJuIHtPYmplY3R9ICBcdFx0W09iamVjdCBjb250YWluaW5nIHRoZSBgbmFtZWAgb2YgdGhlIERPTSBlbGVtZW50IGFuZCB0aGUgYHNlbGVjdG9yYF1cblx0ICovXG5cdHBhcnNlRE9NRXZlbnQ6IF8ubWVtb2l6ZShmdW5jdGlvbihrZXkpIHtcblxuXHRcdHZhciBtYXRjaGVzID0ga2V5Lm1hdGNoKHRoaXNbJy9ET01FdmVudC8nXSk7XG5cblx0XHRpZiAoIW1hdGNoZXMgfHwgIW1hdGNoZXNbMV0pIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZTogbWF0Y2hlc1sxXSxcblx0XHRcdHNlbGVjdG9yOiBtYXRjaGVzWzNdXG5cdFx0fTtcblx0fSksXG5cblxuXHQvKipcblx0ICogU3VwcG9ydGVkIFwiZmlyc3QtY2xhc3NcIiBET00gZXZlbnRzLlxuXHQgKiBAdHlwZSB7QXJyYXl9XG5cdCAqL1xuXHRuYW1lczogW1xuXG5cdFx0Ly8gTG9jYWxpemVkIGJyb3dzZXIgZXZlbnRzXG5cdFx0Ly8gKHdvcmtzIG9uIGluZGl2aWR1YWwgZWxlbWVudHMpXG5cdFx0J2Vycm9yJywgJ3Njcm9sbCcsXG5cblx0XHQvLyBNb3VzZSBldmVudHNcblx0XHQnY2xpY2snLCAnZGJsY2xpY2snLCAnbW91c2Vkb3duJywgJ21vdXNldXAnLCAnaG92ZXInLCAnbW91c2VlbnRlcicsICdtb3VzZWxlYXZlJyxcblx0XHQnbW91c2VvdmVyJywgJ21vdXNlb3V0JywgJ21vdXNlbW92ZScsXG5cblx0XHQvLyBLZXlib2FyZCBldmVudHNcblx0XHQna2V5ZG93bicsICdrZXl1cCcsICdrZXlwcmVzcycsXG5cblx0XHQvLyBGb3JtIGV2ZW50c1xuXHRcdCdibHVyJywgJ2NoYW5nZScsICdmb2N1cycsICdmb2N1c2luJywgJ2ZvY3Vzb3V0JywgJ3NlbGVjdCcsICdzdWJtaXQnLFxuXG5cdFx0Ly8gUmF3IHRvdWNoIGV2ZW50c1xuXHRcdCd0b3VjaHN0YXJ0JywgJ3RvdWNoZW5kJywgJ3RvdWNobW92ZScsICd0b3VjaGNhbmNlbCcsXG5cblx0XHQvLyBNYW51ZmFjdHVyZWQgZXZlbnRzXG5cdFx0J3RvdWNoJyxcblxuXHRcdC8vIFRPRE86XG5cdFx0J3JpZ2h0Y2xpY2snLCAnY2xpY2tvdXRzaWRlJ1xuXHRdXG59O1xuXG5cblxuXG4vKipcbiAqIFJlZ2V4cCB0byBtYXRjaCBcImZpcnN0IGNsYXNzXCIgRE9NIGV2ZW50c1xuICogKHRoZXNlIGFyZSBhbGxvd2VkIGluIHRoZSB0b3AgbGV2ZWwgb2YgYSBjb21wb25lbnQgZGVmaW5pdGlvbiBhcyBtZXRob2Qga2V5cylcbiAqXHRcdGkuZS4gL14oY2xpY2t8aG92ZXJ8Ymx1cnxmb2N1cykoICguKykpL1xuICpcdFx0XHRbMV0gPT4gZXZlbnQgbmFtZVxuICpcdFx0XHRbM10gPT4gc2VsZWN0b3JcbiAqL1xuXG5FdmVudHNbJy9ET01FdmVudC8nXSA9IG5ldyBSZWdFeHAoJ14oJyArIF8ucmVkdWNlKEV2ZW50cy5uYW1lcyxcblx0ZnVuY3Rpb24gYnVpbGRSZWdleHAobWVtbywgZXZlbnROYW1lLCBpbmRleCkge1xuXG5cdFx0Ly8gT21pdCBgfGAgdGhlIGZpcnN0IHRpbWVcblx0XHRpZiAoaW5kZXggPT09IDApIHtcblx0XHRcdHJldHVybiBtZW1vICsgZXZlbnROYW1lO1xuXHRcdH1cblxuXHRcdHJldHVybiBtZW1vICsgJ3wnICsgZXZlbnROYW1lO1xuXHR9LCAnJykgK1xuJykoICguKykpPyQnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBFdmVudHM7XG4iLCIvKipcbiAqIE1hcCBhbiBvYmplY3QncyB2YWx1ZXMsIGFuZCByZXR1cm4gYSB2YWxpZCBvYmplY3QgKHRoaXMgZnVuY3Rpb24gaXMgaGFuZHkgYmVjYXVzZVxuICogdW5kZXJzY29yZS5tYXAoKSByZXR1cm5zIGEgbGlzdCwgbm90IGFuIG9iamVjdC4pXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9iaiAgICAgICAgICAgIFtPYmplY3Qgd2hvcyB2YWx1ZXMgeW91IHdhbnQgdG8gbWFwXVxuICogQHBhcmFtICB7RnVuY3Rpb259IHRyYW5zZm9ybUZuIFtGdW5jdGlvbiB0byB0cmFuc2Zvcm0gZWFjaCBvYmplY3QgdmFsdWUgYnldXG4gKlxuICogQHJldHVybiB7T2JqZWN0fSAgICAgICAgICAgICAgICBbTmV3IG9iamVjdCB3aXRoIHRoZSB2YWx1ZXMgbWFwcGVkXVxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gb2JqTWFwKG9iaiwgdHJhbnNmb3JtRm4pIHtcblx0cmV0dXJuIF8ub2JqZWN0KF8ua2V5cyhvYmopLCBfLm1hcChvYmosIHRyYW5zZm9ybUZuKSk7XG59O1xuXG4iLCIvKipcbiAqIFRyYW5zbGF0ZSAqKnJpZ2h0LWhhbmQtc2lkZSBhYmJyZXZpYXRpb25zKiogaW50byBmdW5jdGlvbnMgdGhhdCBwZXJmb3JtXG4gKiB0aGUgcHJvcGVyIGJlaGF2aW9ycywgZS5nLlxuICpcdFx0I2Fib3V0X21lXG4gKlx0XHQlbWFpbk1lbnU6b3BlblxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gdHJhbnNsYXRlU2hvcnRoYW5kKHZhbHVlLCBrZXkpIHtcblxuXHR2YXIgbWF0Y2hlcywgZm47XG5cblx0Ly8gSWYgdGhpcyBpcyBhbiBpbXBvcnRhbnQsIEZSQU1FV09SSy1zcGVjaWZpYyBkYXRhIGtleSxcblx0Ly8gYW5kIGEgZnVuY3Rpb24gd2FzIHNwZWNpZmllZCwgcnVuIGl0IHRvIGdldCBpdHMgdmFsdWVcblx0Ly8gKHRoaXMgaXMgdG8ga2VlcCBwYXJpdHkgd2l0aCBCYWNrYm9uZSdzIHNpbWlsYXIgZnVuY3Rpb25hbGl0eSlcblx0aWYgKF8uaXNGdW5jdGlvbih2YWx1ZSkgJiYgKGtleSA9PT0gJ2NvbGxlY3Rpb24nIHx8IGtleSA9PT0gJ21vZGVsJykpIHtcblx0XHRyZXR1cm4gdmFsdWUoKTtcblx0fVxuXG5cdC8vIElnbm9yZSBvdGhlciBub24tc3RyaW5nc1xuXHRpZiAoIV8uaXNTdHJpbmcodmFsdWUpKSB7XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG5cblx0Ly8gQWxzbyBpZ25vcmUgYHRlbXBsYXRlYFxuXHQvLyBUT0RPOiB1c2UgYSBkaWZmZXJlbnQga2V5IGxhdGVyXG5cdGlmIChrZXkgPT09ICd0ZW1wbGF0ZScpIHJldHVybiB2YWx1ZTtcblxuXHQvLyBBbHNvIGlnbm9yZSB0aGluZ3MgdGhhdCBzdGFydCB3aXRoIF9cblx0aWYgKGtleS5tYXRjaCgvXl8vKSkgcmV0dXJuIHZhbHVlO1xuXG5cblx0Ly8gUmVkaXJlY3RzIHVzZXIgdG8gY2xpZW50LXNpZGUgVVJMLCB3L28gYWZmZWN0aW5nIGJyb3dzZXIgaGlzdG9yeVxuXHQvLyBMaWtlIGNhbGxpbmcgYEJhY2tib25lLmhpc3RvcnkubmF2aWdhdGUoJy9mb28nLCB7IHJlcGxhY2U6IHRydWUgfSlgXG5cdGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eIyMoLipbXi5cXHNdKS8pKSAmJiBtYXRjaGVzWzFdKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiByZWRpcmVjdEFuZENvdmVyVHJhY2tzKCkge1xuXHRcdFx0dmFyIHVybCA9IG1hdGNoZXNbMV07XG5cdFx0XHRGUkFNRVdPUksuaGlzdG9yeS5uYXZpZ2F0ZSh1cmwsIHtcblx0XHRcdFx0dHJpZ2dlcjogdHJ1ZSxcblx0XHRcdFx0cmVwbGFjZTogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0fTtcblx0fVxuXHQvLyBNZXRob2QgdG8gcmVkaXJlY3QgdXNlciB0byBhIGNsaWVudC1zaWRlIFVSTCwgdGhlbiBjYWxsIHRoZSBoYW5kbGVyXG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14jKC4qW14uXFxzXSspLykpICYmIG1hdGNoZXNbMV0pIHtcblx0XHRmbiA9IGZ1bmN0aW9uIGNoYW5nZVVybEZyYWdtZW50KCkge1xuXHRcdFx0dmFyIHVybCA9IG1hdGNoZXNbMV07XG5cdFx0XHRGUkFNRVdPUksuaGlzdG9yeS5uYXZpZ2F0ZSh1cmwsIHtcblx0XHRcdFx0dHJpZ2dlcjogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0fTtcblx0fVxuXHQvLyBNZXRob2QgdG8gdHJpZ2dlciBnbG9iYWwgZXZlbnRcblx0ZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXiglLipbXi5cXHNdKS8pKSAmJiBtYXRjaGVzWzFdKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiB0cmlnZ2VyRXZlbnQoKSB7XG5cdFx0XHR2YXIgdHJpZ2dlciA9IG1hdGNoZXNbMV07XG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZSh0aGlzLmlkICsgJyA6OiBUcmlnZ2VyaW5nIGV2ZW50ICgnICsgdHJpZ2dlciArICcpLi4uJyk7XG5cdFx0XHRGUkFNRVdPUksudHJpZ2dlcih0cmlnZ2VyKTtcblx0XHR9O1xuXHR9XG5cdC8vIE1ldGhvZCB0byBmaXJlIGEgdGVzdCBhbGVydFxuXHQvLyAodXNlIG1lc3NhZ2UsIGlmIHNwZWNpZmllZClcblx0ZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXiEhIVxccyooLipbXi5cXHNdKT8vKSkpIHtcblx0XHRmbiA9IGZ1bmN0aW9uIGJhbmdBbGVydChlKSB7XG5cblx0XHRcdC8vIElmIHNwZWNpZmllZCwgbWVzc2FnZSBpcyB1c2VkLCBvdGhlcndpc2UgJ0FsZXJ0IHRyaWdnZXJlZCEnXG5cdFx0XHR2YXIgbXNnID0gKG1hdGNoZXMgJiYgbWF0Y2hlc1sxXSkgfHwgJ0RlYnVnIGFsZXJ0ICghISEpIHRyaWdnZXJlZCEnO1xuXG5cdFx0XHQvLyBPdGhlciBkaWFnbm9zdGljIGluZm9ybWF0aW9uXG5cdFx0XHRtc2cgKz0gJ1xcblxcbkRpYWdub3N0aWNzXFxuPT09PT09PT09PT09PT09PT09PT09PT09XFxuJztcblx0XHRcdGlmIChlICYmIGUuY3VycmVudFRhcmdldCkge1xuXHRcdFx0XHRtc2cgKz0gJ2UuY3VycmVudFRhcmdldCA6OiAnICsgZS5jdXJyZW50VGFyZ2V0O1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuaWQpIHtcblx0XHRcdFx0bXNnICs9ICd0aGlzLmlkIDo6ICcgKyB0aGlzLmlkO1xuXHRcdFx0fVxuXG5cdFx0XHRhbGVydChtc2cpO1xuXHRcdH07XG5cdH1cblxuXHQvLyBNZXRob2QgdG8gbG9nIGEgbWVzc2FnZSB0byB0aGUgY29uc29sZVxuXHQvLyAodXNlIG1lc3NhZ2UsIGlmIHNwZWNpZmllZClcblx0ZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXj4+PlxccyooLipbXi5cXHNdKT8vKSkpIHtcblxuXHRcdGZuID0gZnVuY3Rpb24gbG9nTWVzc2FnZShlKSB7XG5cblx0XHRcdC8vIElmIHNwZWNpZmllZCwgbWVzc2FnZSBpcyB1c2VkLCBvdGhlcndpc2UgdXNlIGRlZmF1bHRcblx0XHRcdHZhciBtc2cgPSAobWF0Y2hlcyAmJiBtYXRjaGVzWzFdKSB8fCAnTG9nIG1lc3NhZ2UgKD4+PikgdHJpZ2dlcmVkISc7XG5cdFx0XHRGUkFNRVdPUksubG9nKG1zZyk7XG5cdFx0fTtcblx0fVxuXG5cdC8vIE1ldGhvZCB0byBhdHRhY2ggdGhlIHNwZWNpZmllZCBjb21wb25lbnQvdGVtcGxhdGUgdG8gYSByZWdpb25cblx0ZWxzZSBpZiAoXG5cdFx0KChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14oW14uXFxzXSspXFxzKjxcXC1cXHMqKC4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSAmJiBtYXRjaGVzWzJdKSB8fFxuXHRcdCgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eKFteLlxcc10rKVxccypcXC0+XFxzKiguKlteLlxcc10pLykpICYmIG1hdGNoZXNbMV0gJiYgbWF0Y2hlc1syXSAmJlxuXHRcdFx0KG1hdGNoZXNbJ3RtcCddID0gbWF0Y2hlc1sxXSkgJiYgKG1hdGNoZXNbMV0gPSBtYXRjaGVzWzJdKSAmJiAobWF0Y2hlc1syXSA9IG1hdGNoZXNbJ3RtcCddKSlcblx0KSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiBhdHRhY2hUZW1wbGF0ZSgpIHtcblxuXHRcdFx0Ly8gUmVtb3ZlIGFsbCB3aGl0ZXNwYWNlIGZyb20gbWF0Y2hlc1xuXHRcdFx0bWF0Y2hlc1sxXSA9IG1hdGNoZXNbMV0ucmVwbGFjZSgvKFxccyspL2csICcnKTtcblx0XHRcdG1hdGNoZXNbMl0gPSBtYXRjaGVzWzJdLnJlcGxhY2UoLyhcXHMrKS9nLCAnJyk7XG5cblx0XHRcdHZhciByZWdpb24gPSBtYXRjaGVzWzFdO1xuXHRcdFx0dmFyIHRlbXBsYXRlID0gbWF0Y2hlc1syXTtcblx0XHRcdEZSQU1FV09SSy52ZXJib3NlKHRoaXMuaWQgKyAnIDo6IEF0dGFjaGluZyBgJyArIHRlbXBsYXRlICsgJ2AgdG8gYCcgKyByZWdpb24gKyAnYC4uLicpO1xuXG5cblx0XHRcdGlmICghdGhpc1tyZWdpb25dKSB7XG5cdFx0XHRcdEZSQU1FV09SSy5lcnJvcih0aGlzLmlkLCc6OiBUcnlpbmcgdG8gYXR0YWNoIHJlZ2lvbiB3aXRoIHNob3J0aGFuZCAoJyt2YWx1ZSsnKSwgYnV0IGNvdWxkIG5vdCBmaW5kIHJlZ2lvbiBgJytyZWdpb24rJ2AnKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpc1tyZWdpb25dLmF0dGFjaCh0ZW1wbGF0ZSk7XG5cdFx0fTtcblx0fVxuXG5cblx0Ly8gTWV0aG9kIHRvIHRvZ2dsZSAoISkgdGhlIHNwZWNpZmllZCBtb2RlbCBhdHRyXG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL15cXCFcXHMqXFxAKC4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHRcdGZuID0gZnVuY3Rpb24gdG9nZ2xlQXR0cigpIHtcblx0XHRcdEZSQU1FV09SSy52ZXJib3NlKHRoaXMuaWQgKyAnIDo6IFRvZ2dsaW5nIGF0dHIgKCcgKyBtYXRjaGVzWzFdICsgJykuLi4nKTtcblx0XHRcdHZhciBvbGRBdHRyVmFsdWUgPSB0aGlzLm1vZGVsLmdldCggbWF0Y2hlc1sxXSApO1xuXG5cdFx0XHRpZiAob2xkQXR0clZhbHVlKSB7XG5cdFx0XHRcdHRoaXMubW9kZWwuc2V0KCBtYXRjaGVzWzFdLCBmYWxzZSApO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdHRoaXMubW9kZWwuc2V0KCBtYXRjaGVzWzFdLCB0cnVlICk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdC8vIE1ldGhvZCB0byBjaGFuZ2UgdGhlIHNwZWNpZmllZCBtb2RlbCBhdHRyXG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL15cXHMqXFxAKFtePV0rKT0oW149XSopXFxzKiQvKSkpIHtcblxuXHRcdHZhciBhdHRyTmFtZSA9IG1hdGNoZXNbMV07XG5cdFx0dmFyIG5ld0F0dHJWYWx1ZSA9IG1hdGNoZXNbMl07XG5cblx0XHRmbiA9IGZ1bmN0aW9uIGNoYW5nZUF0dHIoKSB7XG5cdFx0XHR0aGlzLm1vZGVsLnNldChhdHRyTmFtZSwgbmV3QXR0clZhbHVlKTtcblx0XHR9O1xuXHR9XG5cblx0Ly8gTWV0aG9kIHRvIHJlbW92ZSB0aGUgbW9kZWwgZm9yIHRoZSBjdXJyZW50IGNvbXBvbmVudFxuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eXFxzKlxcLVxccyokLykpKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiByZW1vdmVNb2RlbCAoKSB7XG5cblx0XHRcdC8vIE9ubHkgd29ya3MgaWYgbW9kZWwgYmVsb25ncyB0byBhIGNvbGxlY3Rpb25cblx0XHRcdGlmICghdGhpcy5tb2RlbC5jb2xsZWN0aW9uKSByZXR1cm47XG5cblx0XHRcdHRoaXMubW9kZWwuY29sbGVjdGlvbi5yZW1vdmUodGhpcy5tb2RlbCk7XG5cdFx0fTtcblx0fVxuXG5cblx0Ly8gZGVwcmVjYXRpbmcgY2xhc3MgbWFuaXB1bGF0aW9uIHNob3J0aGFuZFxuXHQvLyAobm8gbmVlZCB0byBkbyBkb20gbWFuaXB1bGF0aW9uIHVubGVzcyBhYnNvbHV0ZWx5IG5lY2Vzc2FyeSlcblxuXHQvLyAvLyBNZXRob2QgdG8gYWRkIHRoZSBzcGVjaWZpZWQgY2xhc3Ncblx0Ly8gZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXlxcK1xccypcXC4oLipbXi5cXHNdKS8pKSAmJiBtYXRjaGVzWzFdKSB7XG5cdC8vIFx0Zm4gPSBmdW5jdGlvbiBhZGRDbGFzcygpIHtcblx0Ly8gXHRcdEZSQU1FV09SSy52ZXJib3NlKHRoaXMuaWQgKyAnIDo6IEFkZGluZyBjbGFzcyAoJyArIG1hdGNoZXNbMV0gKyAnKS4uLicpO1xuXHQvLyBcdFx0dGhpcy4kZWwuYWRkQ2xhc3MobWF0Y2hlc1sxXSk7XG5cdC8vIFx0fTtcblx0Ly8gfVxuXHQvLyAvLyBNZXRob2QgdG8gcmVtb3ZlIHRoZSBzcGVjaWZpZWQgY2xhc3Ncblx0Ly8gZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXlxcLVxccypcXC4oLipbXi5cXHNdKS8pKSAmJiBtYXRjaGVzWzFdKSB7XG5cdC8vIFx0Zm4gPSBmdW5jdGlvbiByZW1vdmVDbGFzcygpIHtcblx0Ly8gXHRcdEZSQU1FV09SSy52ZXJib3NlKHRoaXMuaWQgKyAnIDo6IFJlbW92aW5nIGNsYXNzICgnICsgbWF0Y2hlc1sxXSArICcpLi4uJyk7XG5cdC8vIFx0XHR0aGlzLiRlbC5yZW1vdmVDbGFzcyhtYXRjaGVzWzFdKTtcblx0Ly8gXHR9O1xuXHQvLyB9XG5cdC8vIC8vIE1ldGhvZCB0byB0b2dnbGUgdGhlIHNwZWNpZmllZCBjbGFzc1xuXHQvLyBlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eXFwhXFxzKlxcLiguKlteLlxcc10pLykpICYmIG1hdGNoZXNbMV0pIHtcblx0Ly8gXHRmbiA9IGZ1bmN0aW9uIHRvZ2dsZUNsYXNzKCkge1xuXHQvLyBcdFx0RlJBTUVXT1JLLnZlcmJvc2UodGhpcy5pZCArICcgOjogVG9nZ2xpbmcgY2xhc3MgKCcgKyBtYXRjaGVzWzFdICsgJykuLi4nKTtcblx0Ly8gXHRcdHRoaXMuJGVsLnRvZ2dsZUNsYXNzKG1hdGNoZXNbMV0pO1xuXHQvLyBcdH07XG5cdC8vIH1cblxuXHQvLyBUT0RPOlx0YWxsb3cgZGVzY2VuZGFudHMgdG8gYmUgY29udHJvbGxlZCB2aWEgc2hvcnRoYW5kXG5cdC8vXHRcdFx0ZS5nLiA6ICdsaS5yb3cgLS5oaWdobGlnaHRlZCdcblx0Ly9cdFx0XHR3b3VsZCByZW1vdmUgdGhlIGBoaWdobGlnaHRlZGAgY2xhc3MgZnJvbSB0aGlzLiQoJ2xpLnJvdycpXG5cblxuXHQvLyBJZiBzaG9ydC1oYW5kIG1hdGNoZWQsIHJldHVybiB0aGUgZGVyZWZlcmVuY2VkIGZ1bmN0aW9uXG5cdGlmIChmbikge1xuXG5cdFx0RlJBTUVXT1JLLnZlcmJvc2UoJ0ludGVycHJldGluZyBtZWFuaW5nIGZyb20gc2hvcnRoYW5kIDo6IGAnICsgdmFsdWUgKyAnYC4uLicpO1xuXG5cdFx0Ly8gQ3VycnkgdGhlIHJlc3VsdCBmdW5jdGlvbiB3aXRoIGFueSBzdWZmaXggbWF0Y2hlc1xuXHRcdHZhciBjdXJyaWVkRm4gPSBmbjtcblxuXHRcdC8vIFRyYWlsaW5nIGAuYCBpbmRpY2F0ZXMgYW4gZS5zdG9wUHJvcGFnYXRpb24oKVxuXHRcdGlmICh2YWx1ZS5tYXRjaCgvXFwuXFxzKiQvKSkge1xuXHRcdFx0Y3VycmllZEZuID0gZnVuY3Rpb24gYW5kU3RvcFByb3BhZ2F0aW9uKGUpIHtcblxuXHRcdFx0XHQvLyBCaW5kIChzbyBpdCBpbmhlcml0cyBjb21wb25lbnQgY29udGV4dCkgYW5kIGNhbGwgaW50ZXJpb3IgZnVuY3Rpb25cblx0XHRcdFx0Zm4uYXBwbHkodGhpcyk7XG5cblx0XHRcdFx0Ly8gdGhlbiBpbW1lZGlhdGVseSBzdG9wIGV2ZW50IGJ1YmJsaW5nL3Byb3BhZ2F0aW9uXG5cdFx0XHRcdGlmIChlICYmIGUuc3RvcFByb3BhZ2F0aW9uKSB7XG5cdFx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRGUkFNRVdPUksud2Fybihcblx0XHRcdFx0XHRcdHRoaXMuaWQgKyAnIDo6IFRyYWlsaW5nIGAuYCBzaG9ydGhhbmQgd2FzIHVzZWQgdG8gaW52b2tlIGFuICcgK1xuXHRcdFx0XHRcdFx0J2Uuc3RvcFByb3BhZ2F0aW9uKCksIGJ1dCBcIicgKyB2YWx1ZSArICdcIiB3YXMgbm90IHRyaWdnZXJlZCBieSBhIERPTSBldmVudCFcXG4nICtcblx0XHRcdFx0XHRcdCdQcm9iYWJseSBiZXN0IHRvIGRvdWJsZS1jaGVjayB0aGlzIHdhcyB3aGF0IHlvdSBtZWFudCB0byBkby4nKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY3VycmllZEZuO1xuXHR9XG5cblxuXHQvLyBPdGhlcndpc2UsIGlmIG5vIHNob3J0LWhhbmQgbWF0Y2hlZCwgcGFzcyB0aGUgb3JpZ2luYWwgdmFsdWVcblx0Ly8gc3RyYWlnaHQgdGhyb3VnaFxuXHRyZXR1cm4gdmFsdWU7XG59O1xuIl19
(17)
});
;