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
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L2JpbmRFdmVudHMuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L2Nsb3NlLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2NvbXBvbmVudC9jb21waWxlVGVtcGxhdGUuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L2RhdGFCaW5kaW5ncy9jbGFzcy5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9jb21wb25lbnQvZGF0YUJpbmRpbmdzL3RleHQuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L2RlbGV0ZUFsbFJlZ2lvbnMuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L2luZGV4LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2NvbXBvbmVudC9saWZlY3ljbGVFdmVudHMuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L2xpZmVjeWNsZUhvb2tzLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2NvbXBvbmVudC9yZW5kZXIuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L3JlbmRlckNvbGxlY3Rpb24uanMiLCIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L3JlbmRlckRhdGFCaW5kaW5ncy5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9jb21wb25lbnQvcmVuZGVyUmVnaW9ucy5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9jb21wb25lbnQvdmFsaWRhdGVEZWZpbml0aW9uLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2RlZmluZS9idWlsZERlZmluaXRpb24uanMiLCIvY29kZS9vc3MvbWFzdC9saWIvZGVmaW5lL2luZGV4LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2luZGV4LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2xvZ2dlci9pbmRleC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9sb2dnZXIvc2V0dXAuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvcmFpc2UvYnVpbGRQcm90b3R5cGUuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvcmFpc2UvY29sbGVjdFJlZ2lvbnMuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvcmFpc2UvY29sbGVjdFRlbXBsYXRlc0Zyb21TY3JpcHRUYWdzLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3JhaXNlL2luZGV4LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3JlZ2lvbi9hcHBlbmQuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvcmVnaW9uL2F0dGFjaC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9yZWdpb24vZW1wdHkuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvcmVnaW9uL2Zyb21FbGVtZW50LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3JlZ2lvbi9pbmRleC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9yZWdpb24vaW5zZXJ0LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3JlZ2lvbi9wcmVwZW5kLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3JlZ2lvbi9yZW1vdmUuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvcm91dGVyL2luZGV4LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3V0aWxzL0RPTS5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi91dGlscy9lbDJEZWZhdWx0VGVtcGxhdGVJRC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi91dGlscy9lbDJNYXN0SUQuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvdXRpbHMvZXZlbnRzLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3V0aWxzL29iak1hcC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi91dGlscy9zaG9ydGhhbmQuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9GQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekxBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL05BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNaQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzXG4gKi9cbnZhciByZW5kZXJEYXRhQmluZGluZ3MgPSByZXF1aXJlKCcuL3JlbmRlckRhdGFCaW5kaW5ncycpO1xuXG5cbi8qKlxuICogQmluZCBjb2xsZWN0aW9uIGV2ZW50cyB0byBsaWZlY3ljbGUgZXZlbnQgaGFuZGxlcnNcbiAqL1xuZXhwb3J0cy5jb2xsZWN0aW9uRXZlbnRzID0gZnVuY3Rpb24oKSB7XG5cdC8vIEJpbmQgdG8gY29sbGVjdGlvbiBldmVudHMgaWYgb25lIHdhcyBwYXNzZWQgaW5cblx0aWYgKHRoaXMuY29sbGVjdGlvbikge1xuXG5cdFx0Ly8gTGlzdGVuIHRvIGV2ZW50c1xuXHRcdHRoaXMubGlzdGVuVG8odGhpcy5jb2xsZWN0aW9uLCAnYWRkJywgdGhpcy5hZnRlckFkZCk7XG5cdFx0dGhpcy5saXN0ZW5Ubyh0aGlzLmNvbGxlY3Rpb24sICdyZW1vdmUnLCB0aGlzLmFmdGVyUmVtb3ZlKTtcblx0XHR0aGlzLmxpc3RlblRvKHRoaXMuY29sbGVjdGlvbiwgJ3Jlc2V0JywgdGhpcy5hZnRlclJlc2V0KTtcblx0fVxufTtcblxuLyoqXG4gKiBCaW5kIG1vZGVsIGV2ZW50cyB0byBsaWZlY3ljbGUgZXZlbnQgaGFuZGxlcnMgYW5kIGFsc28gYWxsb3dzIGZvciBoYW5kbGVycyB0byBmaXJlXG4gKiBvbiBjZXJ0YWluIG1vZGVsIGF0dHJpYnV0ZSBjaGFuZ2VzLlxuICovXG5leHBvcnRzLm1vZGVsRXZlbnRzID0gZnVuY3Rpb24oKSB7XG5cdHZhciBzZWxmID0gdGhpcztcblxuXHRpZiAodGhpcy5tb2RlbCkge1xuXG5cdFx0Ly8gTGlzdGVuIGZvciBhbnkgYXR0cmlidXRlIGNoYW5nZXNcblx0XHQvLyBlLmcuXG5cdFx0Ly8gLmFmdGVyQ2hhbmdlKG1vZGVsLCBvcHRpb25zKVxuXHRcdC8vXG5cdFx0dGhpcy5saXN0ZW5Ubyh0aGlzLm1vZGVsLCAnY2hhbmdlJywgZnVuY3Rpb24gbW9kZWxDaGFuZ2VkIChtb2RlbCwgb3B0aW9ucykge1xuXG5cdFx0XHQvLyBSZW5kZXIgZGF0YSBiaW5kaW5nc1xuXHRcdFx0cmVuZGVyRGF0YUJpbmRpbmdzLmNhbGwoc2VsZik7XG5cblx0XHRcdC8vIFJ1biBjdXN0b20gYGFmdGVyQ2hhbmdlYCgpIG1ldGhvZFxuXHRcdFx0aWYgKF8uaXNGdW5jdGlvbih0aGlzLmFmdGVyQ2hhbmdlKSkge1xuXHRcdFx0XHR0aGlzLmFmdGVyQ2hhbmdlKG1vZGVsLCBvcHRpb25zKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIExpc3RlbiBmb3Igc3BlY2lmaWMgYXR0cmlidXRlIGNoYW5nZXNcblx0XHQvLyBlLmcuXG5cdFx0Ly8gLmFmdGVyQ2hhbmdlLmNvbG9yKG1vZGVsLCB2YWx1ZSwgb3B0aW9ucylcblx0XHRpZiAoXy5pc09iamVjdCh0aGlzLmFmdGVyQ2hhbmdlKSkge1xuXHRcdFx0Xy5lYWNoKHRoaXMuYWZ0ZXJDaGFuZ2UsIGZ1bmN0aW9uIChoYW5kbGVyLCBhdHRyTmFtZSkge1xuXG5cdFx0XHRcdC8vIENhbGwgaGFuZGxlciB3aXRoIG5ld1ZhbCB0byBrZWVwIGFyZ3VtZW50cyBzdHJhaWdodGZvcndhcmRcblx0XHRcdFx0dGhpcy5saXN0ZW5Ubyh0aGlzLm1vZGVsLCAnY2hhbmdlOicgKyBhdHRyTmFtZSwgZnVuY3Rpb24gYXR0ckNoYW5nZWQgKG1vZGVsLCBuZXdWYWwpIHtcblx0XHRcdFx0XHRoYW5kbGVyLmNhbGwodGhpcywgbmV3VmFsKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdH0sIHRoaXMpO1xuXHRcdH1cblx0fVxufTtcblxuLyoqXG4gKiBMaXN0ZW5zIGZvciBhbmQgcnVucyBoYW5kbGVycyBvbiBnbG9iYWwgZXZlbnRzIHRoYXQgYXJlIGxpc3RlbmVkIGZvciBvbiBhIGNvbXBvbmVudC5cbiAqL1xuZXhwb3J0cy5nbG9iYWxUcmlnZ2VycyA9IGZ1bmN0aW9uKCkge1xuXG5cdHZhciBzZWxmID0gdGhpcztcblxuXHR0aGlzLmxpc3RlblRvKEZSQU1FV09SSywgJ2FsbCcsIGZ1bmN0aW9uIChlUm91dGUpIHtcblxuXHRcdC8vIFRyaW0gb2ZmIGFsbCBidXQgdGhlIGZpcnN0IGFyZ3VtZW50IHRvIHBhc3MgdGhyb3VnaCB0byBoYW5kbGVyXG5cdFx0dmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuXHRcdGFyZ3Muc2hpZnQoKTtcblxuXHRcdC8vIEl0ZXJhdGUgdGhyb3VnaCBlYWNoIHN1YnNjcmlwdGlvbiBvbiB0aGlzIGNvbXBvbmVudFxuXHRcdC8vIGFuZCBsaXN0ZW4gZm9yIHRoZSBzcGVjaWZpZWQgZ2xvYmFsIGV2ZW50c1xuXHRcdF8uZWFjaChzZWxmLnN1YnNjcmlwdGlvbnMsIGZ1bmN0aW9uKGhhbmRsZXIsIG1hdGNoUGF0dGVybikge1xuXG5cdFx0XHQvLyBHcmFiIHJlZ2V4IGFuZCBwYXJhbSBwYXJzaW5nIGxvZ2ljIGZyb20gQmFja2JvbmUgY29yZVxuXHRcdFx0dmFyIGV4dHJhY3RQYXJhbXMgPSBCYWNrYm9uZS5Sb3V0ZXIucHJvdG90eXBlLl9leHRyYWN0UGFyYW1ldGVycyxcblx0XHRcdFx0Y2FsY3VsYXRlUmVnZXggPSBCYWNrYm9uZS5Sb3V0ZXIucHJvdG90eXBlLl9yb3V0ZVRvUmVnRXhwO1xuXG5cdFx0XHQvLyBUcmltIHRyYWlsaW5nXG5cdFx0XHRtYXRjaFBhdHRlcm4gPSBtYXRjaFBhdHRlcm4ucmVwbGFjZSgvXFwvKiQvZywgJycpO1xuXHRcdFx0Ly8gYW5kIGVyIHNvcnQgb2YuLiBsZWFkaW5nLi4gc2xhc2hlc1xuXHRcdFx0bWF0Y2hQYXR0ZXJuID0gbWF0Y2hQYXR0ZXJuLnJlcGxhY2UoL14oWyN+JV0pXFwvKi9nLCAnJDEnKTtcblx0XHRcdC8vIFRPRE86IG9wdGltaXphdGlvbi0gdGhpcyByZWFsbHkgb25seSBoYXMgdG8gYmUgZG9uZSBvbmNlLCBvbiByYWlzZSgpLCB3ZSBzaG91bGQgZG8gdGhhdFxuXG5cblx0XHRcdC8vIENvbWUgdXAgd2l0aCByZWdleCBmb3IgdGhpcyBtYXRjaFBhdHRlcm5cblx0XHRcdHZhciByZWdleCA9IGNhbGN1bGF0ZVJlZ2V4KG1hdGNoUGF0dGVybik7XG5cblx0XHRcdC8vIElmIHRoaXMgbWF0Y2hQYXRlcm4gaXMgdGhpcyBpcyBub3QgYSBtYXRjaCBmb3IgdGhlIGV2ZW50LFxuXHRcdFx0Ly8gYGNvbnRpbnVlYCBpdCBhbG9uZyB0byBpdCBjYW4gdHJ5IHRoZSBuZXh0IG1hdGNoUGF0dGVyblxuXHRcdFx0aWYgKCFlUm91dGUubWF0Y2gocmVnZXgpKSByZXR1cm47XG5cblx0XHRcdC8vIFBhcnNlIHBhcmFtZXRlcnMgZm9yIHVzZSBhcyBhcmdzIHRvIHRoZSBoYW5kbGVyXG5cdFx0XHQvLyAob3IgYW4gZW1wdHkgbGlzdCBpZiBub25lIGV4aXN0KVxuXHRcdFx0dmFyIHBhcmFtcyA9IGV4dHJhY3RQYXJhbXMocmVnZXgsIGVSb3V0ZSk7XG5cblx0XHRcdC8vIEhhbmRsZSBzdHJpbmcgcmVkaXJlY3RzIHRvIGZ1bmN0aW9uIG5hbWVzXG5cdFx0XHRpZiAoIV8uaXNGdW5jdGlvbihoYW5kbGVyKSkge1xuXHRcdFx0XHRoYW5kbGVyID0gc2VsZltoYW5kbGVyXTtcblxuXHRcdFx0XHRpZiAoIWhhbmRsZXIpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCB0cmlnZ2VyIHN1YnNjcmlwdGlvbiBiZWNhdXNlIG9mIHVua25vd24gaGFuZGxlcjogJyArIGhhbmRsZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIEJpbmQgY29udGV4dCBhbmQgYXJndW1lbnRzIHRvIHN1YnNjcmlwdGlvbiBoYW5kbGVyXG5cdFx0XHRoYW5kbGVyLmFwcGx5KHNlbGYsIF8udW5pb24oYXJncywgcGFyYW1zKSk7XG5cblx0XHR9KTtcblx0fSk7XG59O1xuIiwiLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzXG4gKi9cblxudmFyIGRlbGV0ZUFsbFJlZ2lvbnMgPSByZXF1aXJlKCcuL2RlbGV0ZUFsbFJlZ2lvbnMnKTtcblxuXG5cblxuLyoqXG4gKiBGUkFNRVdPUksuQ29tcG9uZW50LnByb3RvdHlwZS5jbG9zZVxuICpcbiAqIFNhZmVseSB6YXAgZXZlcnkgdHJhY2UgYWJvdXQgdGhpcyBjb21wb25lbnQgZnJvbSBtZW1vcnkuXG4gKlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY2xvc2UgKCkge1xuXG5cdEZSQU1FV09SSy5kZWJ1ZygnQ2xvc2VkICcgKyB0aGlzLmlkICsgJyBjb21wb25lbnQuJyk7XG5cdHZhciBzZWxmID0gdGhpcztcblxuXHQvLyBDYW5jZWwgY3VycmVudCByZW5kZXIgYW5kIGNsb3NlIGpvYnMsIGlmIHRoZXkncmUgcnVubmluZ1xuXHRpZiAodGhpcy5fcmVuZGVyaW5nKSB7XG5cdFx0c2VsZi5fcmVuZGVyaW5nQ2FuY2VsZWQgPSB0cnVlO1xuXHRcdHRoaXMuY2FuY2VsUmVuZGVyKCk7XG5cdFx0c2VsZi5fcmVuZGVyaW5nID0gZmFsc2U7XG5cdH1cblx0aWYgKHRoaXMuX2Nsb3NpbmcpIHtcblx0XHR0aGlzLmNhbmNlbENsb3NlKCk7XG5cdFx0c2VsZi5fY2xvc2luZyA9IGZhbHNlO1xuXHR9XG5cblx0Ly8gTG9jayBhY2Nlc3MgdG8gY2xvc2UoKVxuXHR0aGlzLl9jbG9zaW5nID0gdHJ1ZTtcblxuXHR0aGlzLmJlZm9yZUNsb3NlKGZ1bmN0aW9uICgpIHtcblxuXHRcdC8vID4gTk9URTogYHRoaXMuX2Nsb3Npbmc9ZmFsc2VgIGNhbiBhbmQgcHJvYmFibHkgc2hvdWxkIGJlIHJlbW92ZWQsXG5cdFx0Ly8gPiBzaW5jZSBtdXRleCBpcyB1bm5lY2Vzc2FyeSBub3cgdGhhdCB0aGUgY29tcG9uZW50IGlzIHVwIGZvciBnYXJiYWdlIGNvbGxlY3Rpb25cblx0XHQvLyA+IFdhaXRpbmcgdG8gZG8gdGhpcyB1bnRpbCBpdCBjYW4gYmUgdGVzdGVkIGZ1cnRoZXJcblxuXHRcdC8vIFVubG9jayBjbG9zZSgpXG5cdFx0c2VsZi5fY2xvc2luZyA9IGZhbHNlO1xuXG5cdFx0Ly8gU3RvcCBsaXN0ZW5pbmcgdG8gYWxsIGdsb2JhbCB0cmlnZ2VycyAoJXwjKVxuXG5cdFx0Ly8gQ2xvc2UgYWxsIGNoaWxkIGNvbXBvbmVudHNcblx0XHRkZWxldGVBbGxSZWdpb25zLmNhbGwoc2VsZik7XG5cblx0XHQvLyBDYWxsIG5hdGl2ZSBgQmFja2JvbmUuVmlldy5wcm90b3R5cGUucmVtb3ZlKClgXG5cdFx0Ly8gdG8gdW5kZWxlZ2F0ZSBldmVudHMsIGV0Yy5cblx0XHRzZWxmLnJlbW92ZSgpO1xuXG5cdH0pO1xufTtcbiIsIi8qKlxuICogQ29udmVydCB0ZW1wbGF0ZSBIVE1MIGFuZCBkYXRhIGludG8gYSBjb21waWxlZCAkdGVtcGxhdGVcbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjb21waWxlVGVtcGxhdGUgKCkge1xuXG5cdC8vIENyZWF0ZSB0ZW1wbGF0ZSBkYXRhIGNvbnRleHQgYnkgcHJvdmlkaW5nIGFjY2VzcyB0byB0aGUgZ2xvYmFsIERhdGEgb2JqZWN0LFxuXHQvLyBBbHNvIGZvbGQgaW4gdGhlIG1vZGVsIGFzc29jaWF0ZWQgd2l0aCB0aGlzIGNvbXBvbmVudCwgaWYgdGhlcmUgaXMgb25lXG5cdHZhciB0ZW1wbGF0ZUNvbnRleHQgPSBfLmV4dGVuZCh7XG5cblx0XHQvLyBBbGxvd3MgeW91IHRvIGdldCBhIGhvbGQgb2YgZGF0YSxcblx0XHQvLyBidXQgdXNlIGEgZGVmYXVsdCB2YWx1ZSBpZiBpdCBkb2Vzbid0IGV4aXN0XG5cdFx0Z2V0OiBmdW5jdGlvbiAoa2V5LCBkZWZhdWx0VmFsKSB7XG5cdFx0XHR2YXIgdmFsID0gdGVtcGxhdGVDb250ZXh0W2tleV07XG5cdFx0XHRpZiAodHlwZW9mIHZhbCA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdFx0dmFsID0gZGVmYXVsdFZhbDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB2YWw7XG5cdFx0fVxuXHR9LFxuXG5cdC8vIEFsbCBGUkFNRVdPUksuZGF0YSBpcyBhdmFpbGFibGUgaW4gZXZlcnkgdGVtcGxhdGVcblx0RlJBTUVXT1JLLmRhdGEpO1xuXG5cdC8vIElmIGEgbW9kZWwgaXMgcHJvdmlkZWQgZm9yIHRoaXMgY29tcG9uZW50LCBtYWtlIGl0IGF2YWlsYWJsZSBpbiB0aGlzIHRlbXBsYXRlXG5cdGlmICh0aGlzLm1vZGVsKSB7XG5cdFx0Xy5leHRlbmQodGVtcGxhdGVDb250ZXh0LCB0aGlzLm1vZGVsLmF0dHJpYnV0ZXMpO1xuXHR9XG5cblx0Ly8gVGVtcGxhdGUgdGhlIEhUTUwgd2l0aCB0aGUgZGF0YVxuXHR2YXIgaHRtbDtcblx0dHJ5IHtcblx0XHQvLyBBY2NlcHQgcHJlY29tcGlsZWQgdGVtcGxhdGVzXG5cdFx0aWYgKF8uaXNGdW5jdGlvbih0aGlzLnRlbXBsYXRlKSkge1xuXHRcdFx0aHRtbCA9IHRoaXMudGVtcGxhdGUodGVtcGxhdGVDb250ZXh0KTtcblx0XHR9XG5cdFx0Ly8gT3IgcmF3IHN0cmluZ3Ncblx0XHRlbHNlIGh0bWwgPSBfLnRlbXBsYXRlKHRoaXMudGVtcGxhdGUsIHRlbXBsYXRlQ29udGV4dCk7XG5cdH1cblx0Y2F0Y2ggKGUpIHtcblx0XHR2YXIgc3RyID0gZSxcblx0XHRcdHN0YWNrID0gJyc7XG5cblx0XHRpZiAoZSBpbnN0YW5jZW9mIEVycm9yKSB7XG5cdFx0XHRzdHIgPSAgZS50b1N0cmluZygpO1xuXHRcdFx0c3RhY2sgPSBlLnN0YWNrO1xuXHRcdH1cblxuXHRcdEZSQU1FV09SSy5lcnJvcih0aGlzLmlkICsgJyA6OiBDYW5ub3QgcmVuZGVyKCkgdGVtcGxhdGUgKHByb2JhYmx5IG1pc3NpbmcgZGF0YSkuXFxuXFxuR290IHRoaXMgZXJyb3IgOjpcXG4nK3N0ciwnXFxuJyk7XG5cdFx0aWYgKGh0bWwpIHtGUkFNRVdPUksudmVyYm9zZSgnVGVtcGxhdGUgOjogJyArIGh0bWwpO31cblx0XHRGUkFNRVdPUksudmVyYm9zZSgnRnVsbCBUZW1wbGF0ZSBFcnJvcjonICsgJ1xcbicsc3RhY2spO1xuXHRcdEZSQU1FV09SSy52ZXJib3NlKCdcXG5cXG5Nb3JlIGluZm9ybWF0aW9uOicsICdcXG5cXG5UZW1wbGF0ZSBjb250ZXh0IDo6Jyx0ZW1wbGF0ZUNvbnRleHQsICdcXG5cXG50aGlzLm1vZGVsOjonLCB0aGlzLm1vZGVsKTtcblx0XHRodG1sID0gXy5pc1N0cmluZyh0aGlzLnRlbXBsYXRlKSA/IHRoaXMudGVtcGxhdGUgOiBzdHI7XG5cdH1cblxuXHRyZXR1cm4gaHRtbDtcbn07XG5cblxuIiwiLyoqXG4gKiBgY2xhc3NgIGRhdGEgYmluZGluZ1xuICogQHR5cGUge09iamVjdH1cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSB7XG5cdHJlZ2V4cDogL2JpbmRcXC1jbGFzc1xcLShbXi1dKykvLFxuXHRmbjogZnVuY3Rpb24gKCRlbCwgbW9kZWwsIG1hdGNoZXMpIHtcblx0XHQvLyBSZWdleHAgbWF0Y2hlcyBmb3Igd2lsZGNhcmQgcGFyYW1zIGluIGF0dHJpYnV0ZSBtYXRjaCBleHByZXNzaW9uXG5cdFx0dmFyIGNsYXNzTmFtZSA9IG1hdGNoZXNbMV07XG5cblx0XHR2YXIgcmF3ID0gJGJvdW5kRWwuYXR0cignYmluZC1jbGFzcy0nICsgY2xhc3NOYW1lKTtcblx0XHR2YXIgY2xlYW4gPSByYXcucmVwbGFjZSgvXkAvLCAnJyk7XG5cdFx0aWYgKCBtb2RlbC5nZXQoY2xlYW4pICkge1xuXHRcdFx0JGJvdW5kRWwuYWRkQ2xhc3MoY2xhc3NOYW1lKTtcblx0XHR9XG5cdFx0ZWxzZSB7XG5cdFx0XHQkYm91bmRFbC5yZW1vdmVDbGFzcyhjbGFzc05hbWUpO1xuXHRcdH1cblx0fVxufTtcblxuIiwiLyoqXG4gKiBgdGV4dGAgZGF0YSBiaW5kaW5nXG4gKiBAdHlwZSB7T2JqZWN0fVxuICovXG5cbm1vZHVsZS5leHBvcnRzID0ge1xuXHRyZWdleHA6IC9iaW5kLXRleHQvLFxuXHRmbjogZnVuY3Rpb24gKCRlbCwgbW9kZWwpIHtcblx0XHR2YXIgcmF3ID0gJGJvdW5kRWwuYXR0cignYmluZC10ZXh0Jyk7XG5cdFx0dmFyIGNsZWFuID0gcmF3LnJlcGxhY2UoL15ALywgJycpO1xuXHRcdCRib3VuZEVsLnRleHQoIG1vZGVsLmdldChjbGVhbikgKTtcblx0fVxufTtcbiIsIi8qKlxuICogSWYgYW55IHJlZ2lvbnMgZXhpc3QgaW4gdGhpcyBjb21wb25lbnQsXG4gKiBlbXB0eSB0aGVtLCBhbmQgdGhlbiBkZWxldGUgdGhlbVxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZGVsZXRlQWxsUmVnaW9ucyAoKSB7XG5cdF8uZWFjaCh0aGlzLnJlZ2lvbnMsIGZ1bmN0aW9uIChyZWdpb24sIGtleSkge1xuXHRcdHJlZ2lvbi5lbXB0eSgpO1xuXHRcdGRlbGV0ZSB0aGlzLnJlZ2lvbnNba2V5XTtcblx0fSwgdGhpcyk7XG59O1xuIiwiLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzXG4gKi9cblxudmFyIGxpZmVjeWNsZUhvb2tzICAgICA9IHJlcXVpcmUoJy4vbGlmZWN5Y2xlSG9va3MnKSxcblx0bGlmZWN5Y2xlRXZlbnRzICAgID0gcmVxdWlyZSgnLi9saWZlY3ljbGVFdmVudHMnKSxcblx0YmluZEV2ZW50cyAgICAgICAgID0gcmVxdWlyZSgnLi9iaW5kRXZlbnRzJyksXG5cdGNsb3NlQ29tcG9uZW50ICAgICA9IHJlcXVpcmUoJy4vY2xvc2UnKSxcblx0cmVuZGVyICAgICAgICAgICAgID0gcmVxdWlyZSgnLi9yZW5kZXInKSxcblx0cmVuZGVyQ29sbGVjdGlvbiAgID0gcmVxdWlyZSgnLi9yZW5kZXJDb2xsZWN0aW9uJyksXG5cdHZhbGlkYXRlRGVmaW5pdGlvbiA9IHJlcXVpcmUoJy4vdmFsaWRhdGVEZWZpbml0aW9uJyk7XG5cblxuLyoqXG4gKiBGUkFNRVdPUksuQ29tcG9uZW50XG4gKlxuICogQ29tcG9uZW50IGlzIGFuIGV4dGVuZGVkIGBCYWNrYm9uZS5WaWV3YC4gSXQgYWRkIGZlYXR1cmVzIHN1Y2ggYXMgYXV0b21hdGljIGV2ZW50IGJpbmRpbmcsXG4gKiByZW5kZXJpbmcsIGxpZmVjeWNsZSBob29rcyBhbmQgZXZlbnRzLCBhbmQgbW9yZS5cbiAqXG4gKiBAY29uc3RydWN0b3JcbiAqL1xudmFyIENvbXBvbmVudCA9IG1vZHVsZS5leHBvcnRzID0gQmFja2JvbmUuVmlldy5leHRlbmQoKTtcblxuXG5fLmV4dGVuZChDb21wb25lbnQucHJvdG90eXBlLCB7XG5cblx0Ly8gTGlmZWN5Y2xlIEhvb2tzXG5cdGJlZm9yZVJlbmRlcjogZnVuY3Rpb24oY2IpIHtcblx0XHRsaWZlY3ljbGVIb29rcy5iZWZvcmVSZW5kZXIuY2FsbCh0aGlzLCBjYik7XG5cdH0sXG5cdGJlZm9yZUNsb3NlOiBmdW5jdGlvbihjYikge1xuXHRcdGxpZmVjeWNsZUhvb2tzLmJlZm9yZUNsb3NlLmNhbGwodGhpcywgY2IpO1xuXHR9LFxuXHRhZnRlclJlbmRlcjogZnVuY3Rpb24oKSB7XG5cdFx0bGlmZWN5Y2xlSG9va3MuYWZ0ZXJSZW5kZXIuY2FsbCh0aGlzKTtcblx0fSxcblx0Y2FuY2VsUmVuZGVyOiBmdW5jdGlvbigpIHtcblx0XHRsaWZlY3ljbGVIb29rcy5jYW5jZWxSZW5kZXIuY2FsbCh0aGlzKTtcblx0fSxcblx0Y2FuY2VsQ2xvc2U6IGZ1bmN0aW9uKCkge1xuXHRcdGxpZmVjeWNsZUhvb2tzLmNhbmNlbENsb3NlLmNhbGwodGhpcyk7XG5cdH0sXG5cblx0Ly8gTGlmZWN5Y2xlIEV2ZW50c1xuXHRhZnRlckNoYW5nZTogZnVuY3Rpb24obW9kZWwsIG9wdGlvbnMpIHtcblx0XHRsaWZlY3ljbGVFdmVudHMuYWZ0ZXJDaGFuZ2UuY2FsbCh0aGlzLCBtb2RlbCwgb3B0aW9ucyk7XG5cdH0sXG5cdGFmdGVyQWRkOiBmdW5jdGlvbihtb2RlbCwgY29sbGVjdGlvbiwgb3B0aW9ucykge1xuXHRcdGxpZmVjeWNsZUV2ZW50cy5hZnRlckFkZC5jYWxsKHRoaXMsIG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zKTtcblx0fSxcblx0YWZ0ZXJSZW1vdmU6IGZ1bmN0aW9uKG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zKSB7XG5cdFx0bGlmZWN5Y2xlRXZlbnRzLmFmdGVyUmVtb3ZlLmNhbGwodGhpcywgbW9kZWwsIGNvbGxlY3Rpb24sIG9wdGlvbnMpO1xuXHR9LFxuXHRhZnRlclJlc2V0OiBmdW5jdGlvbihjb2xsZWN0aW9uLCBvcHRpb25zKSB7XG5cdFx0bGlmZWN5Y2xlRXZlbnRzLmFmdGVyUmVzZXQuY2FsbCh0aGlzLCBjb2xsZWN0aW9uLCBvcHRpb25zKTtcblx0fSxcblxuXHQvLyBQcm90b3R5cGUgbWV0aG9kcy5cblx0Y2xvc2U6IGZ1bmN0aW9uKCkge1xuXHRcdGNsb3NlQ29tcG9uZW50LmNhbGwodGhpcyk7XG5cdH0sXG5cdHJlbmRlcjogZnVuY3Rpb24oYXRJbmRleCkge1xuXHRcdHJlbmRlci5jYWxsKHRoaXMsIGF0SW5kZXgpO1xuXHR9LFxuXG5cdHJlbmRlckNvbGxlY3Rpb246IGZ1bmN0aW9uICgpIHtcblx0XHR2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG5cdFx0cmVuZGVyQ29sbGVjdGlvbi5hcHBseSh0aGlzLCBhcmdzKTtcblx0fSxcbn0pO1xuXG5cblxuXG5Db21wb25lbnQucHJvdG90eXBlLmluaXRpYWxpemUgPSBmdW5jdGlvbihwcm9wZXJ0aWVzKSB7XG5cblx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdC8vIEtlZXAgdHJhY2sgb2YgYSBjb3VudGVyIGZvciB1c2UgaW4gZ2VuZXJhdGluZ1xuXHQvLyBpZHMgZm9yIGFub255bW91cyBjb21wb25lbnRzLlxuXHR0aGlzLmFub255bW91c1JlZ2lvbkNvdW50ZXIgPSAwO1xuXG5cdC8vIERpc2FibGUgb3IgaXNzdWUgd2FybmluZ3MgYWJvdXQgY2VydGFpbiBwcm9wZXJ0aWVzXG5cdC8vIGFuZCBtZXRob2RzIHRvIGF2b2lkIGNvbmZ1c2lvblxuXHRwcm9wZXJ0aWVzID0gdmFsaWRhdGVEZWZpbml0aW9uKHByb3BlcnRpZXMpO1xuXG5cdC8vIEV4dGVuZCBpbnN0YW5jZSB3LyBzcGVjaWZpZWQgcHJvcGVydGllcyBhbmQgbWV0aG9kc1xuXHRfLmV4dGVuZCh0aGlzLCBwcm9wZXJ0aWVzKTtcblxuXHQvLyBTdGFydCB3aXRoIGVtcHR5IHJlZ2lvbnMgb2JqZWN0XG5cdHRoaXMucmVnaW9ucyA9IHt9O1xuXG5cdC8vIEVuY291cmFnZSBjaGlsZCBtZXRob2RzIHRvIHVzZSB0aGUgY29tcG9uZW50IGNvbnRleHRcblx0Xy5iaW5kQWxsKHRoaXMpO1xufTtcbiIsIi8vIEZpcmVkIHdoZW4gdGhlIGJvdW5kIG1vZGVsIGlzIHVwZGF0ZWQgKGB0aGlzLm1vZGVsYClcbmV4cG9ydHMuYWZ0ZXJDaGFuZ2UgPSBmdW5jdGlvbiAobW9kZWwsIG9wdGlvbnMpIHt9O1xuXG4vLyBGaXJlZCB3aGVuIGEgbW9kZWwgaXMgYWRkZWQgdG8gdGhlIGJvdW5kIGNvbGxlY3Rpb24gKGB0aGlzLmNvbGxlY3Rpb25gKVxuZXhwb3J0cy5hZnRlckFkZCA9IGZ1bmN0aW9uIChtb2RlbCwgY29sbGVjdGlvbiwgb3B0aW9ucykge307XG5cbi8vIEZpcmVkIHdoZW4gYSBtb2RlbCBpcyByZW1vdmVkIGZyb20gdGhlIGJvdW5kIGNvbGxlY3Rpb24gKGB0aGlzLmNvbGxlY3Rpb25gKVxuZXhwb3J0cy5hZnRlclJlbW92ZSA9IGZ1bmN0aW9uIChtb2RlbCwgY29sbGVjdGlvbiwgb3B0aW9ucykge307XG5cbi8vIEZpcmVkIHdoZW4gdGhlIGJvdW5kIGNvbGxlY3Rpb24gaXMgd2lwZWQgKGB0aGlzLmNvbGxlY3Rpb25gKVxuZXhwb3J0cy5hZnRlclJlc2V0ID0gZnVuY3Rpb24gKGNvbGxlY3Rpb24sIG9wdGlvbnMpIHt9O1xuIiwiLy8gRmlyZWQgYXV0b21hdGljYWxseSB3aGVuIHRoZSB2aWV3IGlzIGluaXRpYWxseSBjcmVhdGVkXG4vLyBvbmx5IGZpcmVkIGFmdGVyd2FyZHMgaWYgdGhpcy5yZW5kZXIoKSBpcyBleHBsaWNpdGx5IGNhbGxlZFxuLy8gQ2FsbGJhY2sgbXVzdCBiZSBmaXJlZCEhXG5leHBvcnRzLmJlZm9yZVJlbmRlciA9IGZ1bmN0aW9uIChjYikge2NiKCk7fTtcblxuLy8gRmlyZWQgYXV0b21hdGljYWxseSB3aGVuIHRoZSB2aWV3IGlzIGluaXRpYWxseSBjcmVhdGVkXG4vLyBvbmx5IGZpcmVkIGFmdGVyd2FyZHMgaWYgdGhpcy5yZW5kZXIoKSBpcyBleHBsaWNpdGx5IGNhbGxlZFxuZXhwb3J0cy5hZnRlclJlbmRlciA9IGZ1bmN0aW9uICgpIHt9O1xuXG4vLyBGaXJlZCBhdXRvbWF0aWNhbGx5IHdoZW4gdGhlIHZpZXcgaXMgY2xvc2VkXG5leHBvcnRzLmJlZm9yZUNsb3NlID0gZnVuY3Rpb24gKGNiKSB7Y2IoKTt9O1xuXG4vLyBGaXJlZCBiZWZvcmUgcmVyZW5kZXJpbmcgb3IgY2xvc2luZyBhIHZpZXcgdGhhdCBpcyBhbHJlYWR5IHdhaXRpbmcgb24gYSBsb2NrXG5leHBvcnRzLmNhbmNlbFJlbmRlciA9IGZ1bmN0aW9uICgpIHtcblx0RlJBTUVXT1JLLndhcm4oJ2NhbmNlbFJlbmRlcigpIHNob3VsZCBiZSBkZWZpbmVkIGlmIGJlZm9yZUNsb3NlKGNiKSBvciBiZWZvcmVSZW5kZXIoY2IpJyArXG5cdFx0XHRcdFx0XHRcdFx0ICdhcmUgYmVpbmcgdXNlZCEnKTtcbn07XG5cbi8vIEZpcmVkIGJlZm9yZSByZXJlbmRlcmluZyBvciBjbG9zaW5nIGEgdmlldyB0aGF0IGlzIGFscmVhZHkgd2FpdGluZyBvbiBhIGxvY2tcbmV4cG9ydHMuY2FuY2VsQ2xvc2UgPSBmdW5jdGlvbiAoKSB7XG5cdEZSQU1FV09SSy53YXJuKCdjYW5jZWxDbG9zZSgpIHNob3VsZCBiZSBkZWZpbmVkIGlmIGJlZm9yZUNsb3NlKGNiKSBvciBiZWZvcmVSZW5kZXIoY2IpJyArXG5cdFx0XHRcdFx0XHRcdFx0ICdhcmUgYmVpbmcgdXNlZCEnKTtcbn07XG4iLCIvKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXNcbiAqL1xuXG52YXIgRE9NID0gcmVxdWlyZSAoJy4uL3V0aWxzL0RPTScpLFxuXHRcdHJlbmRlckRhdGFCaW5kaW5ncyA9IHJlcXVpcmUoJy4vcmVuZGVyRGF0YUJpbmRpbmdzJyksXG5cdFx0Y29tcGlsZVRlbXBsYXRlID0gcmVxdWlyZSgnLi9jb21waWxlVGVtcGxhdGUnKSxcblx0XHRyZW5kZXJSZWdpb25zID0gcmVxdWlyZSgnLi9yZW5kZXJSZWdpb25zJyksXG5cdFx0YmluZEV2ZW50cyA9IHJlcXVpcmUgKCcuL2JpbmRFdmVudHMnKTtcblxuXG5cblxuLyoqXG4gKiBSdW4gSFRNTCB0ZW1wbGF0ZSB0aHJvdWdoIGVuZ2luZSBhbmQgYXBwZW5kIHJlc3VsdHMgdG8gb3V0bGV0LiBBbHNvIHJlcmVuZGVyIHJlZ2lvbnMuXG4gKiBJZiBhdEluZGV4IGlzIHNwZWNpZmllZCwgdGhlIGNvbXBvbmVudCBpcyByZW5kZXJlZCBhdCB0aGUgZ2l2ZW4gcG9zaXRpb24gd2l0aGluIGl0c1xuICogb3V0bGV0LiBPdGhlcndpc2UsIHRoZSBsYXN0IHBvc2l0aW9uIGlzIHVzZWQuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IGF0SW5kZXggW1RoZSBpbmRleCBpbiB3aGljaCB0byByZW5kZXIgdGhpcyBlbGVtZW50XVxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcmVuZGVyKGF0SW5kZXgpIHtcblxuXHRGUkFNRVdPUksuZGVidWcodGhpcy5pZCArICcgOi0tLTogUmVuZGVyaW5nIGNvbXBvbmVudC4uLicpO1xuXG5cdHZhciBzZWxmID0gdGhpcztcblxuXHQvLyBDYW5jZWwgY3VycmVudCByZW5kZXIgYW5kIGNsb3NlIGpvYnMsIGlmIHRoZXkncmUgcnVubmluZ1xuXHRpZiAodGhpcy5fcmVuZGVyaW5nKSB7XG5cdFx0RlJBTUVXT1JLLmRlYnVnKHRoaXMuaWQgKyAnIDo6IHJlbmRlcigpIGNhbmNlbGVkLicpO1xuXHRcdHRoaXMuX3JlbmRlcmluZ0NhbmNlbGVkID0gdHJ1ZTtcblx0XHR0aGlzLmNhbmNlbFJlbmRlcigpO1xuXHRcdHRoaXMuX3JlbmRlcmluZyA9IGZhbHNlO1xuXHR9XG5cdGlmICh0aGlzLl9jbG9zaW5nKSB7XG5cdFx0RlJBTUVXT1JLLmRlYnVnKHRoaXMuaWQgKyAnIDo6IGNsb3NlKCkgY2FuY2VsZWQuJyk7XG5cdFx0dGhpcy5jYW5jZWxDbG9zZSgpO1xuXHRcdHRoaXMuX2Nsb3NpbmcgPSBmYWxzZTtcblx0fVxuXG5cdC8vIExvY2sgYWNjZXNzIHRvIHJlbmRlclxuXHR0aGlzLl9yZW5kZXJpbmcgPSB0cnVlO1xuXG5cdC8vIFRyaWdnZXIgYmVmb3JlUmVuZGVyIG1ldGhvZFxuXHR0aGlzLmJlZm9yZVJlbmRlcihmdW5jdGlvbiAoKSB7XG5cblx0XHQvLyBJZiByZW5kZXJpbmcgd2FzIGNhbmNlbGVkLCBicmVhayBvdXRcblx0XHQvLyBkbyBub3QgcmVuZGVyLCBhbmQgZG8gbm90IGNhbGwgYWZ0ZXJSZW5kZXIoKVxuXHRcdGlmICggc2VsZi5fcmVuZGVyaW5nQ2FuY2VsZWQgKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQmluZCB0aGUgZXZlbnRzIG9uIG1vZGVsL2NvbGxlY3Rpb25zIGFuZCBnbG9iYWwgdHJpZ2dlcmVkIGV2ZW50cy5cblx0XHRiaW5kRXZlbnRzLmNvbGxlY3Rpb25FdmVudHMuY2FsbChzZWxmKTtcblx0XHRiaW5kRXZlbnRzLm1vZGVsRXZlbnRzLmNhbGwoc2VsZik7XG5cdFx0YmluZEV2ZW50cy5nbG9iYWxUcmlnZ2Vycy5jYWxsKHNlbGYpO1xuXG5cdFx0Ly8gVW5sb2NrIHJlbmRlcmluZyBtdXRleFxuXHRcdHNlbGYuX3JlbmRlcmluZyA9IGZhbHNlO1xuXG5cdFx0aWYgKCFzZWxmLiRvdXRsZXQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihzZWxmLmlkICsgJyA6OiBUcnlpbmcgdG8gcmVuZGVyKCksIGJ1dCBubyAkb3V0bGV0IHdhcyBkZWZpbmVkIScpO1xuXHRcdH1cblxuXHRcdC8vIEh5ZHJhdGUgY29tcGlsZWQgdGVtcGxhdGVcblx0XHQvLyAoY29tYmluZXMgdGhlIHRlbXBsYXRlIGZ1bmN0aW9uIHdpdGggZGF0YSB0byByZXR1cm4gSFRNTClcblx0XHR2YXIgaHRtbCA9IGNvbXBpbGVUZW1wbGF0ZS5jYWxsKHNlbGYpO1xuXHRcdGlmICghaHRtbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKHRoaXMuaWQgKyAnIDo6IFVuYWJsZSB0byByZW5kZXIgY29tcG9uZW50IGJlY2F1c2UgdGVtcGxhdGUgY29tcGlsYXRpb24gZGlkIG5vdCByZXR1cm4gYW55IEhUTUwuJyk7XG5cdFx0fVxuXG5cdFx0Ly8gU3RyaXAgdHJhaWxpbmcgYW5kIGxlYWRpbmcgd2hpdGVzcGFjZSB0byBhdm9pZCBmYWxzZWx5IGRpYWdub3Npbmdcblx0XHQvLyBtdWx0aXBsZSBlbGVtZW50cywgd2hlbiBvbmx5IG9uZSBhY3R1YWxseSBleGlzdHNcblx0XHQvLyAodGhpcyBtaXNkaWFnbm9zaXMgd3JhcHMgdGhlIHRlbXBsYXRlIGluIGFuIGV4dHJhbmVvdXMgPGRpdj4pXG5cdFx0aHRtbCA9IGh0bWwucmVwbGFjZSgvXlxccyovLCAnJyk7XG5cdFx0aHRtbCA9IGh0bWwucmVwbGFjZSgvXFxzKiQvLCAnJyk7XG5cdFx0aHRtbCA9IGh0bWwucmVwbGFjZSgvKFxccnxcXG4pKi8sICcnKTtcblxuXHRcdC8vIFN0cmlwIEhUTUwgY29tbWVudHMsIHRoZW4gc3RyaXAgd2hpdGVzcGFjZSBhZ2FpblxuXHRcdC8vIChUT0RPOiBvcHRpbWl6ZSB0aGlzKVxuXHRcdGh0bWwgPSBodG1sLnJlcGxhY2UoLyg8IS0tListLT4pKi8sICcnKTtcblx0XHRodG1sID0gaHRtbC5yZXBsYWNlKC9eXFxzKi8sICcnKTtcblx0XHRodG1sID0gaHRtbC5yZXBsYWNlKC9cXHMqJC8sICcnKTtcblx0XHRodG1sID0gaHRtbC5yZXBsYWNlKC8oXFxyfFxcbikqLywgJycpO1xuXG5cdFx0Ly8gUGFyc2UgYSBET00gbm9kZSBvciBzZXJpZXMgb2YgRE9NIG5vZGVzIGZyb20gdGhlIG5ld2x5IHRlbXBsYXRlZCBIVE1MXG5cdFx0dmFyIHBhcnNlZE5vZGVzID0gJC5wYXJzZUhUTUwoaHRtbCk7XG5cdFx0dmFyIGVsID0gcGFyc2VkTm9kZXNbMF07XG5cblx0XHQvLyBJZiBubyBub2RlcyB3ZXJlIHBhcnNlZCwgdGhyb3cgYW4gZXJyb3Jcblx0XHRpZiAocGFyc2VkTm9kZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3Ioc2VsZi5pZCArICcgOjogcmVuZGVyKCkgcmFuIGludG8gYSBwcm9ibGVtIHJlbmRlcmluZyB0aGUgdGVtcGxhdGUgd2l0aCBIVE1MID0+IFxcbicraHRtbCk7XG5cdFx0fVxuXG5cblxuXHRcdC8vIElmIHRoZXJlIGlzIG5vdCBvbmUgc2luZ2xlIHdyYXBwZXIgZWxlbWVudCxcblx0XHQvLyBvciBpZiB0aGUgcmVuZGVyZWQgdGVtcGxhdGUgY29udGFpbnMgb25seSBhIHNpbmdsZSB0ZXh0IG5vZGUsXG5cdFx0ZWxzZSBpZiAocGFyc2VkTm9kZXMubGVuZ3RoID4gMSB8fCBwYXJzZWROb2Rlc1swXS5ub2RlVHlwZSA9PT0gMykge1xuXG5cdFx0XHRGUkFNRVdPUksubG9nKHNlbGYuaWQgKyAnIDo6IFdyYXBwaW5nIHRlbXBsYXRlIGluIDxkaXYvPi4uLicsIHBhcnNlZE5vZGVzKTtcblx0XHRcdGVsID0gJCgnPGRpdi8+JykuYXBwZW5kKGh0bWwpO1xuXHRcdFx0ZWwgPSBlbFswXTtcblx0XHR9XG5cblx0XHQvLyAob3IganVzdCBhIGxvbmUgcmVnaW9uKVxuXHRcdC8vIHdyYXAgdGhlIGh0bWwgdXAgaW4gYSBjb250YWluZXIgPGRpdi8+XG5cdFx0Ly8gZWxzZSBpZiAoXG5cdFx0Ly8gXHQkKHBhcnNlZE5vZGVzWzBdKS5pcygncmVnaW9uJykgfHxcblx0XHQvLyBcdCQocGFyc2VkTm9kZXNbMF0pLmF0dHIoJ2RhdGEtcmVnaW9uJykgIT09IHVuZGVmaW5lZCApIHtcblx0XHQvLyBcdC8vIHVzZWQgdG8gd3JhcCB0aGlzIHN0dWZmIGluIGEgZGl2IHRvbywgYnV0IG5vdCBhbnltb3JlXG5cdFx0Ly8gXHQvLyBzaW5jZSBpdCBtZXNzZXMgdy8gSFRNTCB0aGluZ3MgbGlrZSB0YWJsZXNcblx0XHQvLyB9XG5cblxuXG5cdFx0Ly8gU2V0IEJhY2tib25lIGVsZW1lbnQgKGNhY2hlIGFuZCByZWRlbGVnYXRlIERPTSBldmVudHMpXG5cdFx0Ly8gKFdpbGwgYWxzbyB1cGRhdGUgc2VsZi4kZWwpXG5cdFx0c2VsZi5zZXRFbGVtZW50KGVsKTtcblxuXG5cblx0XHQvLyBEZXRlY3QgYW5kIHJlbmRlciBhbGwgcmVnaW9ucyBhbmQgdGhlaXIgZGVzY2VuZGVudCBjb21wb25lbnRzIGFuZCByZWdpb25zXG5cdFx0cmVuZGVyUmVnaW9ucy5jYWxsKHNlbGYpO1xuXG5cdFx0Ly8gSW5zZXJ0IHRoZSBlbGVtZW50IGF0IHRoZSBwcm9wZXIgcGxhY2UgYW1vbmdzdCB0aGUgb3V0bGV0J3MgY2hpbGRyZW5cblx0XHR2YXIgbmVpZ2hib3JzID0gc2VsZi4kb3V0bGV0LmNoaWxkcmVuKCk7XG5cdFx0aWYgKF8uaXNGaW5pdGUoYXRJbmRleCkgJiYgbmVpZ2hib3JzLmxlbmd0aCA+IDAgJiYgbmVpZ2hib3JzLmxlbmd0aCA+IGF0SW5kZXgpIHtcblx0XHRcdG5laWdoYm9ycy5lcShhdEluZGV4KS5iZWZvcmUoc2VsZi4kZWwpO1xuXHRcdH1cblxuXHRcdC8vIEJ1dCBpZiB0aGUgb3V0bGV0IGlzIGVtcHR5LCBvciB0aGVyZSdzIG5vIGF0SW5kZXgsIGp1c3Qgc3RpY2sgaXQgb24gdGhlIGVuZFxuXHRcdGVsc2Ugc2VsZi4kb3V0bGV0LmFwcGVuZChzZWxmLiRlbCk7XG5cblxuXHRcdC8vIEZsYWcgd2l0aCBkYXRhLXRlbXBsYXRlLWlkIGF0dHJpYnV0ZVxuXHRcdC8vICh0byBtYWtlIHRlbXBsYXRlL2NvbXBvbmVudCBib3VuZGFyaWVzIGVhc2llciB0byBwaWNrIG91dCBpbiB0aGUgaW5zcGVjdG9yKVxuXHRcdHNlbGYuJGVsLmF0dHIoJ2RhdGEtdGVtcGxhdGUtaWQnLCBzZWxmLmlkKTtcblxuXG5cblxuXHRcdC8vXG5cdFx0Ly8gSWYgdGhlIHBhcmVudCBjb21wb25lbnQgaGFzIHJvdXRlIGxpc3RlbmVycyAoZS5nLiAjZm9vKVxuXHRcdC8vIHJ1biBhbnkgb2YgdGhlbSB0aGF0IG1hdGNoIGB3aW5kb3cubG9jYXRpb24uaGFzaGAuXG5cdFx0Ly8gKGFmdGVyIHJlbmRlcmluZyB0aGUgdGVtcGxhdGUgYW5kIHJlZ2lvbnMgYnV0IEJFRk9SRSB0aGUgYGFmdGVyUmVuZGVyYFxuXHRcdC8vIGxpZmVjeWNsZSBjYWxsYmFjayBpcyB0cmlnZ2VyZWQpXG5cdFx0Ly9cblx0XHQvLyBub3Qgc3VyZSBpZiB0aGlzIGlzIGEgZ29vZCBpZGVhIGluIGdlbmVyYWwtLSBtYXliZSBjb25maWd1cmFibGUuLj9cblx0XHQvLyBvciBvbmx5IGlmIGJhY2tib25lLmhpc3RvcnkgaXNuJ3QgcmVhZHkgeWV0P1xuXHRcdC8vXG5cdFx0Ly8gZGlzYWJsaW5nIGZvciBub3cuLi5cblx0XHQvLyBfLmVhY2goIE9iamVjdC5rZXlzKHNlbGYpLCBmdW5jdGlvbiAoa2V5KSB7XG5cdFx0Ly8gXHR2YXIgbWF0Y2hlZFJvdXRlID0ga2V5Lm1hdGNoKG5ldyBSZWdFeHAoJy9eJyArd2luZG93LmxvY2F0aW9uLmhhc2ggKyAnLycpKTtcblx0XHQvLyBcdGlmICghbWF0Y2hlZFJvdXRlKSByZXR1cm47XG5cblx0XHQvLyBcdHZhciBtYXRjaGVkUm91dGVMaXN0ZW5lciA9IHNlbGZbbWF0Y2hlZFJvdXRlXTtcblx0XHQvLyBcdG1hdGNoZWRSb3V0ZUxpc3RlbmVyKCk7XG5cdFx0Ly8gfSk7XG5cblxuXHRcdC8vIEZpbmFsbHksIHRyaWdnZXIgYWZ0ZXJSZW5kZXIgbWV0aG9kXG5cdFx0c2VsZi5hZnRlclJlbmRlcigpO1xuXG5cblx0XHQvLyBSdW4gZGF0YSBiaW5kaW5nc1xuXHRcdC8vIFRPRE86IGRvbid0IGNhbGwgdGhpcyBoZXJlLS0ganVzdCBkbyB3aGVuIGluaXRpYWxseSBpbnNlcnRpbmcgdGhlIHRlbXBsYXRlIGludG8gdGhlIERPTVxuXHRcdC8vICh0aGlzIGlzIGluZWZmaWNpZW50KVxuXHRcdHJlbmRlckRhdGFCaW5kaW5ncy5jYWxsKHNlbGYpO1xuXG5cblx0XHQvLyBBZGQgZGF0YSBhdHRyaWJ1dGVzIHRvIHRoaXMgY29tcG9uZW50J3MgJGVsLCBwcm92aWRpbmcgYWNjZXNzXG5cdFx0Ly8gdG8gd2hldGhlciB0aGUgZWxlbWVudCBoYXMgdmFyaW91cyBET00gYmluZGluZ3MgZnJvbSBzdHlsZXNoZWV0cy5cblx0XHQvLyAoaGFuZHkgZm9yIGRpc2FibGluZyB0ZXh0IHNlbGVjdGlvbiBhY2NvcmRpbmdseSwgZXRjLilcblx0XHQvL1xuXHRcdC8vIC0+IGRpc2FibGUgZm9yIHRoaXMgY29tcG9uZW50IHdpdGggYHRoaXMuYXR0ckZsYWdzID0gZmFsc2VgXG5cdFx0Ly8gLT4gb3IgZ2xvYmFsbHkgd2l0aCBgRlJBTUVXT1JLLmF0dHJGbGFncyA9IGZhbHNlYFxuXHRcdC8vXG5cdFx0Ly8gVE9ETzogbWFrZSBpdCB3b3JrIHdpdGggZGVsZWdhdGVkIERPTSBldmVudCBiaW5kaW5nc1xuXHRcdC8vXG5cdFx0aWYgKHNlbGYuYXR0ckZsYWdzICE9PSBmYWxzZSAmJiBGUkFNRVdPUksuYXR0ckZsYWdzICE9PSBmYWxzZSkge1xuXHRcdFx0RE9NLmZsYWdCb3VuZEV2ZW50cyhzZWxmKTtcblx0XHR9XG5cdH0pO1xufTtcbiIsIlxuLyoqXG4gKiBUT0RPOlxuICogVHJ5IG91dCBhIGRpZmZlcmVudCBhcHByb2FjaCBmb3IgdGhlIGxvZ2ljIGluIGByZW5kZXJDb2xsZWN0aW9uYFxuICogYmVsb3cgYnkgb3ZlcmxvYWRpbmcgYHJlZ2lvbi5hdHRhY2goKWAuXG4gKlxuICogRXhhbXBsZSB1c2FnZTogKGluIHBhcmVudCBjb21wb25lbnQpXG4gKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICogdGhpcy5zb21lUmVnaW9uLmF0dGFjaCgnU29tZU90aGVyQ29tcG9uZW50Jyx7IGNvbGxlY3Rpb246IFNvbWVDb2xsZWN0aW9uIH0pXG4gKlxuICogLW9yLVxuICpcbiAqIHRoaXMuc29tZVJlZ2lvbi5yZXBlYXQoJ1NvbWVPdGhlckNvbXBvbmVudCcseyBjb2xsZWN0aW9uOiBTb21lQ29sbGVjdGlvbiB9KVxuICovXG5cbi8qKlxuICogcmVuZGVyQ29sbGVjdGlvbigpXG4gKlxuICogUmV1c2FibGUgbG9naWMgdG8gcmVuZGVyIGEgY29sbGVjdGlvbiBpbnRvIGEgcmVnaW9uXG4gKlxuICogVE9ETzogbW92ZSBvbnRvIFJlZ2lvbiBvYmplY3QgaW5zdGVhZC4uLiAgU2VlIGdpc3QuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IGNvbGxlY3Rpb24gLSBkYXRhIHNvdXJjZVxuICogQHBhcmFtIHtPcHRpb25zfSBvcHRpb25zXG4gKlx0XHQ6IG9wdGlvbnMuaXRlbVRlbXBsYXRlIHtTdHJpbmd9IC0gbmFtZSBvZiB0ZW1wbGF0ZS9jb21wb25lbnQgdG8gdXNlIGFzIGl0ZW1cbiAqXHRcdDogb3B0aW9ucy5pbnRvUmVnaW9uIHtPYmplY3R9IC0gdGhlIGRlc3RpbmF0aW9uIHJlZ2lvblxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChjb2xsZWN0aW9uLCBvcHRpb25zKSB7XG5cblx0Ly8gUmVxdWlyZWQ6XG5cdGlmICh0eXBlb2YgY29sbGVjdGlvbiAhPT0gJ29iamVjdCcpIHRocm93IG5ldyBFcnJvcigncmVuZGVyQ29sbGVjdGlvbiA6OiBVbmtub3duL2ludmFsaWQgY29sbGVjdGlvbiwgXCInICsgKGNvbGxlY3Rpb24gJiYgY29sbGVjdGlvbi50eXBlKSArICdcIicpO1xuXHRpZiAoIW9wdGlvbnMuaXRlbVRlbXBsYXRlKSB0aHJvdyBuZXcgRXJyb3IoJ3JlbmRlckNvbGxlY3Rpb24gOjogb3B0aW9ucy5pdGVtVGVtcGxhdGUgcmVxdWlyZWQhJyk7XG5cdGlmICghb3B0aW9ucy5pbnRvUmVnaW9uKSB0aHJvdyBuZXcgRXJyb3IoJ3JlbmRlckNvbGxlY3Rpb24gOjogb3B0aW9ucy5pbnRvUmVnaW9uIHJlcXVpcmVkIScpO1xuXG5cblx0Ly8gRGV0ZXJtaW5lIGNvbGxlY3Rpb25OYW1lXG5cdHZhciBjb2xsZWN0aW9uTmFtZSA9IGNvbGxlY3Rpb24udHlwZTtcblxuXHQvLyBUYXJnZXQgcmVnaW9uXG5cdHZhciBvdXRsZXQgPSBvcHRpb25zLmludG9SZWdpb247XG5cblx0Ly8gU3ViLWNvbXBvbmVudFxuXHR2YXIgc3ViY29tcG9uZW50TmFtZSA9IG9wdGlvbnMuaXRlbVRlbXBsYXRlO1xuXG5cdC8vIE5hbWUgb2YgdGhlIGNvbGxlY3Rpb24gc3RhdGUgYXR0cmlidXRlIHRoYXQgd2lsbGUgYmUgaW5qZWN0ZWQgaW50byB0aGUgSFRNTFxuXHQvLyBVc2VkIGZvciB0aGUgZGVmYXVsdCByZW5kZXIgYmVoYXZpb3IuXG5cdHZhciBib2R5U3RhdGVBdHRyaWJ1dGUgPSAnZGF0YS0nICsgY29sbGVjdGlvbk5hbWUgKyAnLXN0YXRlJztcblxuXG5cblxuXHQvKipcblx0ICogRGVmYXVsdCByZW5kZXIgbWV0aG9kc1xuXHQgKlxuXHQgKiBPdmVycmlkZSBkZWZhdWx0IHJlbmRlciBtZXRob2RzIHdpdGggb3B0aW9ucyBpZiBzcGVjaWZpZWRcblx0ICovXG5cblx0Ly8gRGVmYXVsdCByZW5kZXIgbG9naWMgZm9yIGVycm9yIHN0YXRlIChlLmcuIHJlZCB0ZXh0KVxuXHR2YXIgcmVuZGVyRXJyb3IgPSBvcHRpb25zLnJlbmRlckVycm9yIHx8IGZ1bmN0aW9uIHJlbmRlckVycm9yICgpIHtcblx0XHRGUkFNRVdPUksuZXJyb3IoJ0FuIGVycm9yIG9jY3VycmVkIHdoaWxlIGxvYWRpbmcgJyArIGNvbGxlY3Rpb25OYW1lICsgJyA6OlxcbicsIGNvbGxlY3Rpb24uZXJyb3IpO1xuXG5cdFx0Ly8gU2V0IGEgZGF0YSBhdHRyaWJ1dGUgb24gSFRNTCBib2R5XG5cdFx0JCgnYm9keScpLmF0dHIoYm9keVN0YXRlQXR0cmlidXRlLCAnZXJyb3InKTtcblx0fTtcblxuXHQvLyBEZWZhdWx0IHJlbmRlciBsb2dpYyBmb3IgbG9hZGluZyBzdGF0ZSAoZS5nLiBzcGlubmVyKVxuXHR2YXIgcmVuZGVyU3luY2luZyA9IG9wdGlvbnMucmVuZGVyU3luY2luZyB8fCBmdW5jdGlvbiByZW5kZXJTeW5jaW5nKCkge1xuXHRcdEZSQU1FV09SSy5sb2coJ0xvYWRpbmcgJyArIGNvbGxlY3Rpb25OYW1lICsgJy4uLicpO1xuXG5cdFx0Ly8gU2V0IHN0YXRlIGF0dHJpYnV0ZSBvbiBIVE1MIGJvZHlcblx0XHQkKCdib2R5JykuYXR0cihib2R5U3RhdGVBdHRyaWJ1dGUsICdzeW5jaW5nJyk7XG5cdH07XG5cblx0Ly8gRGVmYXVsdCByZW5kZXIgbG9naWMgdG8gY2xlYW4gdXAgYWZ0ZXIgYSBzdWNjZXNzZnVsIHN5bmMvbG9hZFxuXHR2YXIgcmVuZGVyU3luY2VkID0gb3B0aW9ucy5yZW5kZXJTeW5jZWQgfHwgZnVuY3Rpb24gcmVuZGVyU3luY2VkKCkge1xuXHRcdEZSQU1FV09SSy5sb2coY29sbGVjdGlvbi5sZW5ndGggKyAnICcgKyBjb2xsZWN0aW9uTmFtZSArICcgZmV0Y2hlZCBzdWNjZXNzZnVsbHkuJyk7XG5cblx0XHQvLyBTZXQgc3RhdGUgYXR0cmlidXRlIG9uIEhUTUwgYm9keVxuXHRcdCQoJ2JvZHknKS5hdHRyKGJvZHlTdGF0ZUF0dHJpYnV0ZSwgJ3JlYWR5Jyk7XG5cdH07XG5cblx0Ly8gRGVmYXVsdCByZW5kZXIgbG9naWMgZm9yIGl0ZW1zIGluIGNvbGxlY3Rpb25cblx0dmFyIHJlbmRlclJlc2V0ID0gb3B0aW9ucy5yZW5kZXJSZXNldCB8fCBmdW5jdGlvbiByZW5kZXJSZXNldCgpIHtcblxuXHRcdC8vIENsZWFuIG91dCB0aGUgcmVnaW9uLCB3cmFwIGluIGEgdHJ5L2NhdGNoIHRvIHN0b3AgdGhlIGV4ZWN1dGlvblxuXHRcdHRyeSB7XG5cdFx0XHRvdXRsZXQuZW1wdHkoKTtcblx0XHR9IGNhdGNoIChlKSB7fVxuXG5cblx0XHQvLyBUT0RPOiBTbWFydCBtZXJnZSB0byBtaW5pbWl6ZSBET00gcXVlcmllc1xuXHRcdGNvbGxlY3Rpb24uZWFjaChmdW5jdGlvbiAobW9kZWwpIHtcblx0XHRcdC8vIEZvciBlYWNoIG1vZGVsIGZvdW5kLCBhcHBlbmQgYSBzdWJjb21wb25lbnQgdG8gdGhlIHJlZ2lvblxuXHRcdFx0b3V0bGV0LmFwcGVuZChzdWJjb21wb25lbnROYW1lLCB7IG1vZGVsOiBtb2RlbCB9KTtcblx0XHR9KTtcblx0fTtcblxuXHQvKipcblx0ICogcmVuZGVyQWRkICggbW9kZWwsIFthdEluZGV4XSApXG5cdCAqXG5cdCAqIEBwYXJhbSB7TW9kZWx9IG1vZGVsXHRcdFx0XHRcdFx0LSB0aGUgQmFja2JvbmUgbW9kZWwgdGhhdCB3YXMgYWRkZWRcblx0ICogQHBhcmFtIHtJbnRlZ2VyfSBhdEluZGV4XHRcdFx0XHQtIChvcHRpb25hbC0gZGVmYXVsdHMgdG8gY29sbGVjdGlvbi5sZW5ndGgpXG5cdCAqXG5cdCAqIERlZmF1bHQgcmVuZGVyIGxvZ2ljIGZvciB0aGUgY2FzZSB3aGVyZSBhbiBpdGVtIGlzIGFkZGVkIHRvIHRoZSBjb2xsZWN0aW9uLlxuXHQgKi9cblx0dmFyIHJlbmRlckFkZCA9IG9wdGlvbnMucmVuZGVyQWRkIHx8IGZ1bmN0aW9uIHJlbmRlckFkZCggbW9kZWwsIGF0SW5kZXggKSB7XG5cdFx0aWYgKCB0eXBlb2YgYXRJbmRleCA9PT0gJ251bWJlcicpIHtcblx0XHRcdHJldHVybiBvdXRsZXQuaW5zZXJ0KGF0SW5kZXgsIHN1YmNvbXBvbmVudE5hbWUsIHsgbW9kZWw6IG1vZGVsIH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gb3V0bGV0LmFwcGVuZChzdWJjb21wb25lbnROYW1lLCB7IG1vZGVsOiBtb2RlbCB9KTtcblx0fTtcblxuXHQvKipcblx0ICogcmVuZGVyUmVtb3ZlKCBhdEluZGV4IClcblx0ICpcblx0ICogQHBhcmFtIHtJbnRlZ2VyfSBhdEluZGV4XHRcdFx0LSB0aGUgZm9ybWVyIGluZGV4IG9mIHRoZSBCYWNrYm9uZSBtb2RlbCB0aGF0IHdhcyByZW1vdmVkXG5cdCAqXG5cdCAqIERlZmF1bHQgcmVuZGVyIGxvZ2ljIGZvciB0aGUgY2FzZSB3aGVyZSBhbiBpdGVtIGlzIHJlbW92ZWQgZnJvbSB0aGUgY29sbGVjdGlvbi5cblx0ICovXG5cdHZhciByZW5kZXJSZW1vdmUgPSBvcHRpb25zLnJlbmRlclJlbW92ZSB8fCBmdW5jdGlvbiByZW5kZXJSZW1vdmUoIGF0SW5kZXggKSB7XG5cdFx0b3V0bGV0LnJlbW92ZSggYXRJbmRleCApO1xuXHR9O1xuXG5cblxuXG5cblxuXHQvKipcblx0ICogQm9vdHN0cmFwXG5cdCAqXG5cdCAqIFJlbmRlcnMgaW5pdGlhbCBzdGF0ZSBvZiBjb2xsZWN0aW9uIGludG8gb3VyIHJlZ2lvblxuXHQgKiB1c2luZyBvdXIgY2hpbGQgdGVtcGxhdGUuXG5cdCAqL1xuXG5cdC8vIElmIG91ciBjb2xsZWN0aW9uIGlzIGZldGNoaW5nLCByZW5kZXIgdGhlIGZldGNoaW5nIChsb2FkaW5nKSBzdGF0ZS5cblx0aWYgKGNvbGxlY3Rpb24uc3luY2luZykge1xuXHRcdHJlbmRlclN5bmNpbmcoKTtcblx0fVxuXG5cblx0Ly8gSWYgb3VyIGNvbGxlY3Rpb24gZmFpbGVkIHRvIGZldGNoIChpLmUuIHJlY2VpdmVkIGEgNHh4IG9yIDV4eCBlcnJvciBjb2RlKVxuXHQvLyByZW5kZXIgYW4gZXJyb3Igc3RhdGVcblx0Ly9cblx0Ly8gSGFuZGxlIHRoZSBjYXNlIG9mIG11bHRpcGxlIGVycm9yIHN0YXRlcyB3aXRoIGRpZmZlcmVudCBzdHlsZXMgaGVyZSBhcyB3ZWxsLlxuXHRlbHNlIGlmIChjb2xsZWN0aW9uLmVycm9yKSB7XG5cdFx0cmVuZGVyRXJyb3IoKTtcblx0fVxuXG5cblx0Ly8gT3RoZXJ3aXNlIG91ciBjb2xsZWN0aW9uIGlzIGxvYWRlZCBhbmQgcmVhZHksXG5cdC8vIHNvIGdvIGFoZWFkIGFuZCByZW5kZXIgaXQgaW50byB0aGUgdGFyZ2V0IHJlZ2lvbi5cblx0Ly9cblx0Ly8gKGFsdGVybmF0aXZlbHkgYXQgdGhpcyBwb2ludCwgYSBjdXN0b20gYGVtcHR5YCBzdGF0ZSBtYXkgYmUgcmVuZGVyZWQpXG5cdC8vIGNvbnNvbGUubG9nKCdUaGUgY29sbGVjdGlvbiAnICsgc3ViY29tcG9uZW50TmFtZSArICctLS0tPicpO1xuXHRlbHNlIHJlbmRlclJlc2V0KCk7XG5cblxuXG5cblxuXG5cblx0LyoqXG5cdCAqIEJpbmQgZXZlbnRzXG5cdCAqXG5cdCAqIExpc3RlbiBmb3Igc3RhdGUgY2hhbmdlcyAoc3luY2luZywgc3luY2VkLCBzZXJ2ZXIgZXJyb3IsIGFkZCwgcmVtb3ZlLCBzb3J0LCBldGMuKVxuXHQgKiBUaGVzZSBtYW51YWwgYmluZGluZ3MgY2FuIGJlIHJlbW92ZWQgd2hlbiBjb3JlIGZyYW1ld29yayBzdXBwb3J0cyByZW5kZXItdGltZSBjb2xsZWN0aW9uXG5cdCAqIGJpbmRpbmdzLiAgRm9yIG5vdywgZG9pbmcgaXQgdGhpcyB3YXkgcmF0aGVyIHRoYW4gcGF0Y2hpbmcgdGhlIGNvcmUgdG8gdGVzdCBvdXIgc3RydWN0dXJhbFxuXHQgKiBhc3N1bXB0aW9ucy5cblx0ICovXG5cblx0Ly8gV2hlbiBhIGZldGNoIGlzIGluaXRpYXRlZCBmcm9tIHRoZSBzZXJ2ZXIuLi5cblx0Ly9cblx0Ly8gKGFmdGVyIGBCYWNrYm9uZS5zeW5jYCBiZWdpbnMgYSByZW1vdGUgcmVxdWVzdClcblx0dGhpcy5saXN0ZW5Ubyhjb2xsZWN0aW9uLCAncmVxdWVzdCcsIGZ1bmN0aW9uIGFmdGVyUmVxdWVzdCAoKSB7XG5cdFx0cmVuZGVyU3luY2luZygpO1xuXHR9KTtcblxuXHQvLyBXaGVuIGEgZmV0Y2ggY29tcGxldGVzIHN1Y2Nlc3NmdWxseSBhbmQgbmV3IGRhdGEgaXMgbG9hZGVkLi4uXG5cdC8vXG5cdC8vIChhZnRlciB0aGlzIGNvbXBvbmVudCBpcyBhbHJlYWR5IGluc3RhbnRpYXRlZClcblx0dGhpcy5saXN0ZW5Ubyhjb2xsZWN0aW9uLCAnc3luYycsIGZ1bmN0aW9uIGFmdGVyU3luYyAoKSB7XG5cdFx0cmVuZGVyU3luY2VkKCk7XG5cdFx0cmVuZGVyUmVzZXQoKTtcblx0fSk7XG5cblx0Ly8gV2hlbiBzZXJ2ZXIgc2VuZHMgYSByZXNwb25zZSB3LyBhbiBlcnJvciBjb2RlXG5cdC8vXG5cdC8vIChhZnRlciB0aGlzIGNvbXBvbmVudCBpcyBhbHJlYWR5IGluc3RhbnRpYXRlZClcblx0dGhpcy5saXN0ZW5Ubyhjb2xsZWN0aW9uLCAnZXJyb3InLCBmdW5jdGlvbiBhZnRlclN5bmNFcnJvciAoY29sbGVjdGlvbiwgeGhyKSB7XG5cblx0XHQvLyBJZ25vcmUgYWJvcnQgXCJlcnJvclwiXG5cdFx0Ly9cblx0XHQvLyBXaHk/IGJlY2F1c2UgaXQncyBub3QgYWN0dWFsbHkgYW4gZXJyb3IuXG5cdFx0Ly8gTm90IHN1cmUgd2h5IHRoaXMgdHJpZ2dlcnMgQmFja2JvbmUuQ29sbGVjdGlvbidzIGBlcnJvcmAgZXZlbnQuLi5cblx0XHQvL1xuXHRcdC8vIElmIHR3byBmZXRjaGVzIG9jY3VyIG9uIHRoZSBzYW1lIGNvbGxlY3Rpb24gYXQgdGhlIHNhbWUgdGltZSxcblx0XHQvLyB3ZSBhYm9ydCB0aGUgb2xkIFhIUiByZXF1ZXN0IG91cnNlbHZlcyBpZiBpdCdzIHN0aWxsIHJ1bm5pbmcpXG5cdFx0aWYgKHhociAmJiB4aHIuc3RhdHVzVGV4dCA9PT0gJ2Fib3J0JykgcmV0dXJuO1xuXG5cdFx0cmVuZGVyRXJyb3IoKTtcblx0fSk7XG5cblx0Ly8gV2hlbiBhIG1vZGVsIGlzIGFkZGVkLi4uXG5cdC8vXG5cdC8vIExpc3RlbiBmb3IgbmV3IG1vZGVscywgYW5kIGluc2VydCBhIGNoaWxkIHRlbXBsYXRlXG5cdC8vIGF0IHRoZSBhcHByb3ByaWF0ZSBpbmRleCB3aXRoaW4gdGhlIHJlZ2lvbi5cblx0dGhpcy5saXN0ZW5Ubyhjb2xsZWN0aW9uLCAnYWRkJywgZnVuY3Rpb24gYWZ0ZXJBZGQgKCBtb2RlbCwgY29sbGVjdGlvbiwgb3B0aW9ucyApIHtcblx0XHRyZW5kZXJBZGQoIG1vZGVsLCBvcHRpb25zLmF0ICk7XG5cdH0pO1xuXG5cdC8vIFdoZW4gYSBtb2RlbCBpcyByZW1vdmVkLi4uXG5cdC8vXG5cdC8vIEdyYWIgbW9kZWwncyByZWxhdGl2ZSBpbmRleCB3aXRoaW4gY29sbGVjdGlvbiBhbmQgcmVtb3ZlXG5cdC8vIHRoZSBjaGlsZCB0ZW1wbGF0ZSBhdCB0aGUgc2FtZSBpbmRleCB3aXRoaW4gdGhlIHJlZ2lvbi5cblx0dGhpcy5saXN0ZW5Ubyhjb2xsZWN0aW9uLCAncmVtb3ZlJywgZnVuY3Rpb24gYWZ0ZXJSZW1vdmUgKCBtb2RlbCwgY29sbGVjdGlvbiwgb3B0aW9ucyApIHtcblx0XHRyZW5kZXJSZW1vdmUoIG9wdGlvbnMuaW5kZXggKTtcblx0fSk7XG5cblxuXG59O1xuIiwiLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzXG4gKi9cblxudmFyIGRhdGFCaW5kaW5ncyA9IHtcblx0dGV4dCAgICA6IHJlcXVpcmUoJy4vZGF0YUJpbmRpbmdzL3RleHQnKSxcblx0J2NsYXNzJyA6IHJlcXVpcmUoJy4vZGF0YUJpbmRpbmdzL2NsYXNzJylcbn07XG5cblxuXG4vKipcbiAqIFJlbmRlciBtb2RlbCBiaW5kaW5ncy5cbiAqICAgKyBgYmluZC10ZXh0YFxuICogICArIG1vcmUgdG8gY29tZVxuICpcbiAqIENhbGxlZCBieSBDb21wb25lbnQgd2hlbiBpdHMgbW9kZWwgY2hhbmdlcy5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHJlbmRlckRhdGFCaW5kaW5ncyAoKSB7XG5cdEZSQU1FV09SSy5kZWJ1ZygnUmVuZGVyaW5nIGRhdGEgYmluZGluZ3MgZm9yICcsIHRoaXMuaWQsJ2NvbXBvbmVudC4uLicpO1xuXG5cdC8vIEVuc3VyZSB0aGF0IG1vZGVsIGV4aXN0c1xuXHRpZiAoIXRoaXMubW9kZWwpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoXG5cdFx0XHQnVHJ5aW5nIHRvIGJvb3RzdHJhcCBkYXRhIGJpbmRpbmdzIGZvciBjb21wb25lbnQgKCcgKyB0aGlzLmlkICsgJyksICcgK1xuXHRcdFx0J2J1dCBpdCBoYXMgbm8gbW9kZWwhJyk7XG5cdH1cblx0dmFyIG1vZGVsID0gdGhpcy5tb2RlbDtcblxuXHQvLyBqUXVlcnkgc2VsZWN0b3IgZm9yIGdyYWJiaW5nIGFsbCBlbGVtZW50cyB3LyBkYXRhIGJpbmRpbmdzXG5cdHZhciBiaW5kaW5nU2VsZWN0b3IgPSAnW2JpbmQtdGV4dF0sIDptYXRjaEF0dHIoXCJeYmluZC1jbGFzcy0qJFwiKSc7XG5cblx0Ly8gR2V0IGVsZW1lbnRzIGluIHRoaXMgY29tcG9uZW50IHdoaWNoIGhhdmUgZGF0YSBiaW5kaW5nc1xuXHQvLyAoaWdub3JlcyBjb250ZW50cyBvZiByZWdpb25zIGlmIHRoZXkgZXhpc3QpXG5cdHZhciAkYm91bmRFbGVtZW50cyA9IF8kc2VsZWN0T3V0ZXIuY2FsbCh0aGlzLCBiaW5kaW5nU2VsZWN0b3IpO1xuXG5cdC8vIExvb3AgdGhyb3VnaCBlYWNoIGJvdW5kIGF0dHJpYnV0ZSBvZiBlYWNoIGJvdW5kIGVsZW1lbnRcblx0Ly8gYW5kIGNhbGwgdGhlIGFwcHJvcHJpYXRlIHJlbmRlciBtZXRob2QuXG5cdCRib3VuZEVsZW1lbnRzLmVhY2goZnVuY3Rpb24gZWFjaEJvdW5kRWxlbWVudCAoKSB7XG5cdFx0JGJvdW5kRWwgPSAkKHRoaXMpO1xuXG5cdFx0dmFyIGFsbEF0dHJpYnV0ZXMgPSAkYm91bmRFbFswXS5hdHRyaWJ1dGVzO1xuXHRcdF8uZWFjaChhbGxBdHRyaWJ1dGVzLCBmdW5jdGlvbiAoYXR0cikge1xuXHRcdFx0dmFyIGF0dHJOYW1lID0gYXR0ci5ub2RlTmFtZTtcblxuXHRcdFx0Xy5lYWNoKCBkYXRhQmluZGluZ3MsIGZ1bmN0aW9uIGVhY2hCaW5kaW5nRm9ybXVsYSAoIGJpbmRpbmcgKSB7XG5cdFx0XHRcdHZhciBtYXRjaGVzID0gYXR0ck5hbWUubWF0Y2goYmluZGluZy5yZWdleHApO1xuXHRcdFx0XHRpZiAoIG1hdGNoZXMgKSB7XG5cdFx0XHRcdFx0YmluZGluZy5mbigkYm91bmRFbCwgbW9kZWwsIG1hdGNoZXMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG59O1xuXG5cblxuXG4vKipcbiAqIExvb2t1cCBzdWl0YWJsZSBlbGVtZW50cyB3aXRoaW4gdGhpcyBjb21wb25lbnQncyAkZWwgY29udGV4dC5cbiAqIElnbm9yZSByZWdpb25zLCBhbmQgaW5jbHVkZSB0aGUgdG9wLWxldmVsIGVsZW1lbnQuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGJpbmRpbmdTZWxlY3RvciAtIERPTSBzZWxlY3RvciB0byB1c2VcbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBfJHNlbGVjdE91dGVyICggYmluZGluZ1NlbGVjdG9yICkge1xuXG5cdC8vIExvb2t1cCBtYXRjaGVzXG5cdHZhciAkbWF0Y2hlcyA9IHRoaXMuJChiaW5kaW5nU2VsZWN0b3IpO1xuXG5cdC8vIElmIHRvcC1sZXZlbCBlbGVtZW50IGluIHRlbXBsYXRlIGhhcyBhIGRhdGEtYmluZGluZywgaW5jbHVkZSBpdFxuXHRpZiAodGhpcy4kZWwuZmlsdGVyKGJpbmRpbmdTZWxlY3RvcikpIHtcblx0XHQkbWF0Y2hlcyA9ICQubWVyZ2UoJG1hdGNoZXMsIHRoaXMuJGVsKTtcblx0fVxuXG5cdC8vIE9taXQgYW55dGhpbmcgaW5zaWRlIGEgcmVnaW9uLCBzaW5jZSB0aG9zZSBiaW5kaW5ncyB3aWxsIGhhdmUgYWxyZWFkeVxuXHQvLyBiZWVuIHRha2VuIGNhcmUgb2YgYnkgb25lIG9mIHRoZSBkZXNjZW5kYW50IGNvbXBvbmVudChzKSB3aXRoaW4gdGhlIHJlZ2lvbi5cblx0Ly9cblx0Ly8gVE9ETzogb3B0aW1pemUgdG8gZXhjbHVkZSB0aGVzZSBlbGVtZW50cyBmcm9tIHRoZSBvcmlnaW5hbCBET00gc2VsZWN0aW9uXG5cdCRtYXRjaGVzID0gJG1hdGNoZXMubm90KCB0aGlzLiQoJ3JlZ2lvbiAqLCBbZGF0YS1yZWdpb25dIConKSApO1xuXG5cdHJldHVybiAkbWF0Y2hlcztcbn1cblxuXG5cblxuXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbi8vL1xuLy8gICAgICAgICAgICAgICAgICAgICAgICAgfHxcbi8vIFRPRE86IG1vdmUgdGhpcyB0aGluZyAgIFxcL1xuLy8gICAgICAgaW50byBgdXRpbHNgIHByYmx5XG4vL1xuXG4vKipcbiAqIENyZWF0ZSBwc2V1ZG8tc2VsZWN0b3IgZm9yIGdldHRpbmcgd2lsZGNhcmQgZGF0YSBhdHRyaWJ1dGVzLlxuICpcbiAqIFVzYWdlOlxuICogJChcIjptYXRjaEF0dHIoJ15kYXRhLScpXCIpXG4gKlxuICogU291cmNlOlxuICogaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMTMyMjI1MDkvNDg2NTQ3XG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxualF1ZXJ5LmV4cHIucHNldWRvcy5tYXRjaEF0dHIgPSAkLmV4cHIuY3JlYXRlUHNldWRvKGZ1bmN0aW9uKGFyZykge1xuXG4gICAgdmFyIHJlZ2V4cCA9IG5ldyBSZWdFeHAoYXJnKTtcbiAgICByZXR1cm4gZnVuY3Rpb24oZWxlbSkge1xuICAgICAgICBmb3IodmFyIGkgPSAwOyBpIDwgZWxlbS5hdHRyaWJ1dGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgYXR0ciA9IGVsZW0uYXR0cmlidXRlc1tpXTtcbiAgICAgICAgICAgIGlmKHJlZ2V4cC50ZXN0KGF0dHIubmFtZSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfTtcbn0pO1xuXG4vLyAgL1xcXG4vLyAgfHxcbi8vXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxuXG5cblxuXG5cblxuXG5cblxuXG5cblxuXG5cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4vLy8gICAgICAgICAgICAgICAgICAgICB8fFxuLy8vIENVUlJFTlRMWSBVTlVTRUQgICAgXFwvXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG5cbi8vIFJlZ2V4cHMgZm9yIGRldGVjdGlvbiBvZiB3aWxkY2FyZCBuYW1lZCBwYXJhbWV0ZXJzIGluIGN1c3RvbSBlbGVtZW50IGF0dHJpYnV0ZSBuYW1lcy5cbi8vIHZhciBvcHRpb25hbFBhcmFtID0gL1xcKCguKj8pXFwpL2c7XG4vLyB2YXIgbmFtZWRQYXJhbSA9IC8oXFwoXFw/KT86XFx3Ky9nO1xuLy8gdmFyIHNwbGF0UGFyYW0gPSAvXFwqXFx3Ky9nO1xuLy8gdmFyIGVzY2FwZVJlZ0V4cCA9IC9bXFwte31cXFtcXF0rPy4sXFxcXFxcXiR8I1xcc10vZztcblxuXG4vLyBCdWlsZCBzZWxlY3RvciBmb3Igc3VwZXJzZXQgb2YgdGhlc2UgYmluZGluZ3Ncbi8vIHZhciBfYXR0ck5hbWVUb1JlZ0V4cCA9IGZ1bmN0aW9uKCBhdHRyRXhwcmVzc2lvbiApIHtcblxuLy8gXHRhdHRyRXhwcmVzc2lvbiA9IGF0dHJFeHByZXNzaW9uLnJlcGxhY2UoZXNjYXBlUmVnRXhwLCAnXFxcXCQmJylcbi8vIFx0XHQucmVwbGFjZShvcHRpb25hbFBhcmFtLCAnKD86JDEpPycpXG4vLyBcdFx0LnJlcGxhY2UobmFtZWRQYXJhbSwgZnVuY3Rpb24obWF0Y2gsIG9wdGlvbmFsKSB7XG4vLyBcdFx0XHRyZXR1cm4gb3B0aW9uYWwgPyBtYXRjaCA6ICcoW15cXC9dKyknO1xuLy8gXHRcdH0pXG4vLyBcdFx0LnJlcGxhY2Uoc3BsYXRQYXJhbSwgJyguKj8pJyk7XG4vLyBcdHJldHVybiAnXicgKyBhdHRyRXhwcmVzc2lvbiArICckJztcbi8vIH07XG4vLyB2YXIgX2V4dHJhY3RQYXJhbWV0ZXJzID0gZnVuY3Rpb24ocmVnZXhwLCBhdHRyTmFtZSwgYXR0ckV4cHJlc3Npb24pIHtcbi8vIFx0dmFyIHBhcmFtVmFsdWVzID0gcmVnZXhwLmV4ZWMoYXR0ck5hbWUpLnNsaWNlKDEpO1xuLy8gXHR2YXIgcGFyYW1LZXlzID0gbmFtZWRQYXJhbS5leGVjKGF0dHJFeHByZXNzaW9uKTtcblxuLy8gXHRpZiAoIXBhcmFtS2V5cyB8fCAhcGFyYW1WYWx1ZXMpIHJldHVybiB7fTtcblxuLy8gXHR2YXIgbmFtZWRQYXJhbWV0ZXJzID0ge307XG4vLyBcdGNvbnNvbGUubG9nKCdwYXJhbVZhbHVlczonLHBhcmFtVmFsdWVzKTtcbi8vIFx0Xy5lYWNoKHBhcmFtVmFsdWVzLCBmdW5jdGlvbiBlYWNoTWF0Y2hpbmdQaWVjZSggcGFyYW0sIGkgKSB7XG4vLyBcdFx0dmFyIGtleSA9IHBhcmFtS2V5c1tpXTtcbi8vIFx0XHRrZXkgPSBrZXkuc2xpY2UoMSk7IC8vIHJlbW92ZSBgOmAgZnJvbSBuYW1lZCBwYXJhbVxuLy8gXHRcdG5hbWVkUGFyYW1ldGVyc1trZXldID0gcGFyYW1WYWx1ZXNbaV07XG4vLyBcdH0pO1xuLy8gXHRyZXR1cm4gbmFtZWRQYXJhbWV0ZXJzO1xuLy8gfTtcblxuXG5cbi8vIC8qKlxuLy8gICogUmVuZGVyIGEgc2luZ2xlIGJpbmRpbmdcbi8vICAqL1xuLy8gdmFyIF9yZW5kZXJCaW5kaW5nID0gZnVuY3Rpb24gKCRtYXRjaGVkRWwsIGRvbUF0dHJpYnV0ZU5hbWUsIG1vZGVsLCByZW5kZXJGbiwgbmFtZWRQYXJhbXMpIHtcbi8vIFx0dmFyIHJhd0JpbmRpbmcgPSAkbWF0Y2hlZEVsLmF0dHIoIGRvbUF0dHJpYnV0ZU5hbWUgKTtcbi8vIFx0Ly8gSWYgZWxlbWVudCBkb2Vzbid0IGNvbnRhaW4gdGhlIHNwZWNpZmllZCBET00gYXR0cmlidXRlLi4uXG4vLyBcdC8vIGZhaWwgc2lsZW50bHkuXG4vLyBcdGlmICggIXJhd0JpbmRpbmcgKSByZXR1cm47XG5cbi8vIFx0Ly8gY29uc29sZS5sb2coJ2dldHRpbmcgJyxkb21BdHRyaWJ1dGVOYW1lLCdvbicsJG1hdGNoZWRFbCk7XG4vLyBcdHZhciBtb2RlbEF0dHJpYnV0ZU5hbWUgPSByYXdCaW5kaW5nLnJlcGxhY2UoL15cXEAvLCAnJyk7XG4vLyBcdEZSQU1FV09SSy5kZWJ1ZygnRm91bmQgYSBiaW5kaW5nIDo6JywgcmF3QmluZGluZywgJzo6JywgbmFtZWRQYXJhbXMpO1xuXG4vLyBcdC8vIElmIG1vZGVsIGRvZXNuJ3QgY29udGFpbiB0aGUgc3BlY2lmaWVkIGF0dHJpYnV0ZS4uLlxuLy8gXHRpZiAoIHR5cGVvZiBtb2RlbC5hdHRyaWJ1dGVzW21vZGVsQXR0cmlidXRlTmFtZV0gPT09ICd1bmRlZmluZWQnICkge1xuXG4vLyBcdFx0Ly8gZmFpbCBzaWxlbnRseS5cbi8vIFx0XHRyZXR1cm47XG4vLyBcdFx0Ly8gRlJBTUVXT1JLLndhcm4oJ0Nhbm5vdCBiaW5kIGBAJyttb2RlbEF0dHJpYnV0ZU5hbWUrJyBmb3IgdGVtcGxhdGUvY29tcG9uZW50ICcgK1xuLy8gXHRcdC8vIFx0J2AnICsgY29tcG9uZW50LmlkICsnYC5cXG4nK1xuLy8gXHRcdC8vIFx0J05vIHN1Y2ggYXR0cmlidXRlIGV4aXN0cyBpbiB0aGUgY29tcG9uZW50XFwncyBtb2RlbC4nXG4vLyBcdFx0Ly8gKTtcbi8vIFx0fVxuXG4vLyBcdC8vIFJlbmRlciBhIGRhdGEgYmluZGluZ1xuLy8gXHR2YXIgYmluZGluZ1ZhbCA9IG1vZGVsLmdldChtb2RlbEF0dHJpYnV0ZU5hbWUpIHx8ICcnO1xuLy8gXHRyZW5kZXJGbiggJG1hdGNoZWRFbCwgYmluZGluZ1ZhbCwgbmFtZWRQYXJhbXMgKTtcbi8vIH07XG5cblxuLy8gLyoqXG4vLyAgKiBSZW5kZXIgdGhlIHNwZWNpZmllZCB0eXBlIG9mIGRhdGEgYmluZGluZ3Ncbi8vICAqXG4vLyAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9uc1xuLy8gICpcdFx0QG9wdGlvbiB7RnVuY3Rpb259IHJlbmRlckZuICgkZWwsIHZhbCwgcGFyYW1zKVx0LT4gZnVuY3Rpb24gd2hpY2ggcmVuZGVycyB0aGUgZGF0YSBiaW5kaW5nIGZvciB0aGUgc3BlY2lmaWVkIGVsZW1lbnRcbi8vICAqXHRcdFx0QHBhcmFtIHtKUXVlcnlFbGVtZW50fSAkZWxcbi8vICAqXHRcdFx0QHBhcmFtIHs/fSB2YWwgLT4gdmFsdWUgb2YgYm91bmQgbW9kZWwgYXR0cmlidXRlXG4vLyAgKlx0XHRcdEBwYXJhbSB7T2JqZWN0fSBwYXJhbXMgLT4ga2V5ZWQgb2JqZWN0IG9mIGR5bmFtaWMgcGFyYW1ldGVycyBmcm9tIHRoZSBuYW1lIG9mIHRoZSBhdHRyaWJ1dGUgaXRzZWxmXG4vLyAgKlx0XHRAb3B0aW9uIHtTdHJpbmd9IGF0dHJpYnV0ZSAtPiBuYW1lIG9mIGJvdW5kIGF0dHJpYnV0ZSwgZS5nLiAnYmluZC10ZXh0J1xuLy8gICpcdFx0QG9wdGlvbiB7Q29tcG9uZW50fSBjb21wb25lbnRcbi8vICAqXHRcdEBvcHRpb24ge0JhY2tib25lLk1vZGVsfSBbbW9kZWxdIC0gZGVmYXVsdHMgdG8gYGNvbXBvbmVudC5tb2RlbGBcbi8vICAqL1xuLy8gdmFyIF9yZW5kZXJCaW5kaW5ncyA9IGZ1bmN0aW9uICggb3B0aW9ucyApIHtcbi8vIFx0dmFyIGNvbXBvbmVudCA9IG9wdGlvbnMuY29tcG9uZW50O1xuLy8gXHR2YXIgYXR0cmlidXRlRXhwcmVzc2lvbiA9IG9wdGlvbnMuYXR0cmlidXRlO1xuLy8gXHR2YXIgbW9kZWwgPSBvcHRpb25zLm1vZGVsIHx8IG9wdGlvbnMuY29tcG9uZW50Lm1vZGVsO1xuXG5cbi8vIFx0Ly8gQ2FsY3VsYXRlIHN0cmluZyB3aGljaCBjYW4gYmUgXCJuZXctZWRcIiBpbnRvIGEgUmVnRXhwXG4vLyBcdHZhciBhdHRyUmVnRXhwU3RyID0gX2F0dHJOYW1lVG9SZWdFeHAoYXR0cmlidXRlRXhwcmVzc2lvbik7XG4vLyBcdHZhciBhdHRyUmVnRXhwID0gbmV3IFJlZ0V4cChhdHRyUmVnRXhwU3RyKTtcblxuXG4vLyBcdHZhciBib3VuZEF0dHJTZWxlY3RvciA9ICc6bWF0Y2hBdHRyKFwiJyArIGF0dHJSZWdFeHBTdHIgKyAnXCIpJztcblxuLy8gXHQvLyBGaW5kIGFsbCByZWxldmFudCBkZXNjZW5kYW50IGVsZW1lbnRzXG4vLyBcdHZhciAkbWF0Y2hlcyA9IF9nZXQkTWF0Y2hlcyhib3VuZEF0dHJTZWxlY3RvciwgY29tcG9uZW50KTtcblxuLy8gXHQvLyBFYXJseSBleGl0IGZvciBzaW1wbGUgYmluZGluZ3MgKHcvbyBib3VuZCBwYXJhbXMpXG4vLyBcdGlmICggIWF0dHJpYnV0ZUV4cHJlc3Npb24ubWF0Y2goL1xcOi8pKSB7XG4vLyBcdFx0JG1hdGNoZXMuZWFjaChmdW5jdGlvbiAoKSB7XG4vLyBcdFx0XHRfcmVuZGVyQmluZGluZygkKHRoaXMpLCBhdHRyaWJ1dGVFeHByZXNzaW9uLCBtb2RlbCwgb3B0aW9ucy5yZW5kZXJGbiwge30pO1xuXG4vLyBcdFx0fSk7XG4vLyBcdFx0cmV0dXJuO1xuLy8gXHR9XG5cbi8vIFx0Y29uc29sZS5sb2coJ1xcblJlbmRlcmluZyBwYXJhbWV0ZXJpemVkIGRhdGEgYmluZGluZzogJyxhdHRyUmVnRXhwKTtcblxuLy8gXHQvLyBUT0RPOiBiYXRjaCBpdCB1cCBzbyB3ZSBvbmx5IGRvIG9uZSBET00gcXVlcnlcbi8vIFx0JG1hdGNoZXMuZWFjaChmdW5jdGlvbiBlYWNoRWxlbWVudFdpdGhBQmluZGluZyAoKSB7XG4vLyBcdFx0dmFyICRtYXRjaGVkRWwgPSAkKHRoaXMpO1xuXG4vLyBcdFx0Ly8gR2V0IGFsbCBhdHRyaWJ1dGVzIGZvciB0aGlzICRlbCBhbmQgZmlsdGVyIGEgc2V0IG9mIG1hdGNoaW5nIG5hbWVzL3BhcmFtc1xuLy8gXHRcdHZhciBhbGxET01BdHRyTmFtZXMgPSBfLm1hcCggJG1hdGNoZWRFbFswXS5hdHRyaWJ1dGVzLCBmdW5jdGlvbiAoZWwpIHtcbi8vIFx0XHRcdHJldHVybiBlbC5ub2RlTmFtZTtcbi8vIFx0XHR9KTtcbi8vIFx0XHRjb25zb2xlLmxvZygnYWxsRE9NQXR0ck5hbWVzIGZvciBlbCcsYWxsRE9NQXR0ck5hbWVzLCAkbWF0Y2hlZEVsKTtcbi8vIFx0XHR2YXIgbWF0Y2hpbmdET01BdHRycyA9IHt9O1xuLy8gXHRcdF8uZWFjaCggYWxsRE9NQXR0ck5hbWVzLCBmdW5jdGlvbiBlYWNoQXR0cmlidXRlICggZG9tQXR0ck5hbWUgKSB7XG4vLyBcdFx0XHQvLyBjb25zb2xlLmxvZygnY2hlY2tpbmcnLGRvbUF0dHJOYW1lKTtcbi8vIFx0XHRcdGlmICggZG9tQXR0ck5hbWUubWF0Y2goYXR0clJlZ0V4cCkpIHtcbi8vIFx0XHRcdFx0bWF0Y2hpbmdET01BdHRyc1tkb21BdHRyTmFtZV0gPSBfZXh0cmFjdFBhcmFtZXRlcnMoIGF0dHJSZWdFeHAsIGRvbUF0dHJOYW1lLCBhdHRyaWJ1dGVFeHByZXNzaW9uICk7XG4vLyBcdFx0XHRcdC8vIGNvbnNvbGUubG9nKCcsIGdvdCcsbWF0Y2hpbmdET01BdHRyc1tkb21BdHRyTmFtZV0sICcgKCgoJyxkb21BdHRyTmFtZSwgYXR0cmlidXRlRXhwcmVzc2lvbik7XG4vLyBcdFx0XHR9XG4vLyBcdFx0fSk7XG5cblxuLy8gXHRcdGNvbnNvbGUubG9nKCcgKioqKiBtYXRjaGluZ0RPTUF0dHJzIDo6JywgbWF0Y2hpbmdET01BdHRycyk7XG5cbi8vIFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2h3YWFhJyk7XG4vLyBcdFx0Xy5lYWNoKG1hdGNoaW5nRE9NQXR0cnMsIGZ1bmN0aW9uICggbmFtZWRQYXJhbXMsIGRvbUF0dHJpYnV0ZU5hbWUgKSB7XG4vLyBcdFx0XHRfcmVuZGVyQmluZGluZygkbWF0Y2hlZEVsLCBkb21BdHRyaWJ1dGVOYW1lLCBtb2RlbCwgb3B0aW9ucy5yZW5kZXJGbiwgbmFtZWRQYXJhbXMpO1xuLy8gXHRcdH0pO1xuXG4vLyBcdH0pO1xuLy8gfTtcblxuXG5cbiIsIi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llc1xuICovXG52YXIgZGVsZXRlQWxsUmVnaW9ucyA9IHJlcXVpcmUoJy4vZGVsZXRlQWxsUmVnaW9ucycpLFxuXHRlbDJEZWZhdWx0VGVtcGxhdGVJRCA9IHJlcXVpcmUoJy4uL3V0aWxzL2VsMkRlZmF1bHRUZW1wbGF0ZUlEJyk7XG5cblxuXG4vKipcbiAqIEluc3RhbnRpYXRlIHJlZ2lvbiBjb21wb25lbnRzIGFuZCBhcHBlbmQgYW55IGRlZmF1bHRcbiAqIHRlbXBsYXRlcy9jb21wb25lbnRzIHRvIHRoZSBET01cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHJlbmRlclJlZ2lvbnMgKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0ZGVsZXRlQWxsUmVnaW9ucygpO1xuXG5cdC8vIFRPRE86IGdldCBjbG9zZXN0IGRlc2NlbmRhbnQgcmVnaW9ucywgbm90IGFsbCBkZXNjZW5kYW50IHJlZ2lvbnNcblxuXHQvLyBEZXRlY3QgY2hpbGQgcmVnaW9ucyBpbiB0ZW1wbGF0ZVxuXHR2YXIgJHJlZ2lvbnMgPSB0aGlzLiQoJ3JlZ2lvbiwgW2RhdGEtcmVnaW9uXScpO1xuXG5cdC8vIEJ1dCBhbHNvIGNoZWNrIHRoZSB0b3AtbGV2ZWwgZWxlbWVudCBvZiB0aGUgY29tcG9uZW50J3MgdGVtcGxhdGUgaXRzZWxmLFxuXHQvLyBpbiBjYXNlIHRoZSB0b3AtbGV2ZWwgZWxlbWVudCBpcyBJVFMgT1dOIHJlZ2lvblxuXHQkcmVnaW9ucyA9ICRyZWdpb25zLmFkZCggdGhpcy4kZWwuZmlsdGVyKCdyZWdpb24sIFtkYXRhLXJlZ2lvbl0nKSApO1xuXG5cdCRyZWdpb25zLmVhY2goZnVuY3Rpb24gKGksIGVsKSB7XG5cblx0XHQvLyBEZXRlY3QgZGVmYXVsdCBjb21wb25lbnQgaWQgZm9yIGNoaWxkIHJlZ2lvblxuXHRcdHZhciBkZWZhdWx0Q29tcG9uZW50SWQgPSBlbDJEZWZhdWx0VGVtcGxhdGVJRChlbCk7XG5cblx0XHQvLyBHZW5lcmF0ZSBhIHJlZ2lvbiBpbnN0YW5jZSBmcm9tIHRoZSBlbGVtZW50XG5cdFx0Ly8gKG1vZGlmeWluZyB0aGUgRE9NIGFzIG5lY2Vzc2FyeSlcblx0XHR2YXIgcmVnaW9uID0gRlJBTUVXT1JLLlJlZ2lvbi5mcm9tRWxlbWVudChlbCwgc2VsZik7XG5cblx0XHQvLyBJZiByZWdpb24gaGFzIG5vIGlkLCBnZW5lcmF0ZSBhIHVuaXF1ZSByZWdpb24gaWQgdy9pIHRoaXMgY29tcG9uZW50XG5cdFx0Ly8gdGhhdCBpcyB1bmxpa2VseSB0byBjb2xsaWRlIHdpdGggbXkgb3RoZXIgbmFtZWQgcmVnaW9uc1xuXHRcdGlmICghcmVnaW9uLmlkKSB7XG5cdFx0XHRyZWdpb24uaWQgPSAnJytcblx0XHRcdFx0RlJBTUVXT1JLLm9wdGlvbnMuZnJhbWV3b3JrSWQgK1xuXHRcdFx0XHQnX19hbm9ueW1vdXNfcmVnaW9uX18nICtcblx0XHRcdFx0c2VsZi5hbm9ueW1vdXNSZWdpb25Db3VudGVyO1xuXG5cdFx0XHQvLyBJbmNyZW1lbnQgY291bnRlciBmb3IgbmV4dCB0aW1lXG5cdFx0XHRzZWxmLmFub255bW91c1JlZ2lvbkNvdW50ZXIrKztcblx0XHR9XG5cblx0XHQvLyBLZWVwIHRyYWNrIG9mIHJlZ2lvbnMsIHNpbmNlIHdlIGFyZSB0aGUgcGFyZW50IGNvbXBvbmVudFxuXHRcdHNlbGYucmVnaW9uc1tyZWdpb24uaWRdID0gcmVnaW9uO1xuXG5cdFx0Ly8gQXMgbG9uZyBhcyB0aGVyZSBhcmUgbm8gY29sbGlzaW9ucywgYWxzbyBwcm92aWRlIGFjY2VzcyB0byB0aGUgcmVnaW9uXG5cdFx0Ly8gb24gdGhlIHRvcCBsZXZlbCBvZiB0aGUgY29tcG9uZW50LCBlLmcuIHNvIHlvdSBjYW4gZG8gYHRoaXMubXlSZWdpb25gXG5cdFx0Ly8gaW4geW91ciBjb21wb25lbnQgbWV0aG9kcy5cblx0XHRpZiAoIXNlbGZbcmVnaW9uLmlkXSkge1xuXHRcdFx0c2VsZltyZWdpb24uaWRdID0gcmVnaW9uO1xuXHRcdH1cblx0fSk7XG59O1xuXG4iLCIvKipcbiAqIENoZWNrIHRoZSBzcGVjaWZpZWQgZGVmaW5pdGlvbiBmb3Igb2J2aW91cyBtaXN0YWtlcywgZXNwZWNpYWxseSBsaWtlbHkgZGVwcmVjYXRpb25zIGFuZFxuICogdmFsaWRhdGUgdGhhdCB0aGUgbW9kZWwgYW5kIGNvbGxlY3Rpb25zIGFyZSBpbnN0YW5jZXMgb2YgQmFja2JvbmUncyBEYXRhIHN0cnVjdHVyZXMuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IHByb3BlcnRpZXMgW09iamVjdCBjb250YWluaW5nIHRoZSBwcm9wZXJ0aWVzIG9mIHRoZSBjb21wb25lbnRdXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB2YWxpZGF0ZURlZmluaXRpb24ocHJvcGVydGllcykge1xuXG5cdGlmIChfLmlzT2JqZWN0KHByb3BlcnRpZXMpKSB7XG5cblx0XHQvLyBEZXRlcm1pbmUgY29tcG9uZW50IGlkXG5cdFx0dmFyIGlkID0gdGhpcy5pZCB8fCBwcm9wZXJ0aWVzLmlkO1xuXG5cdFx0ZnVuY3Rpb24gX3ZhbGlkYXRlQmFja2JvbmVJbnN0YW5jZSAodHlwZSkge1xuXHRcdFx0dmFyIFR5cGUgPSB0eXBlWzBdLnRvVXBwZXJDYXNlKCkgKyB0eXBlLnNsaWNlKDEpO1xuXG5cdFx0XHRpZiAoICFwcm9wZXJ0aWVzW3R5cGVdIGluc3RhbmNlb2YgQmFja2JvbmVbVHlwZV0gKSB7XG5cblx0XHRcdFx0RnJhbWV3b3JrLmVycm9yKFxuXHRcdFx0XHRcdCdDb21wb25lbnQgKCcgKyBpZCArICcpIGhhcyBhbiBpbnZhbGlkICcgKyB0eXBlICsgJy0tIFxcbicgK1xuXHRcdFx0XHRcdCdJZiBgJyArIHR5cGUgKyAnYCBpcyBzcGVjaWZpZWQgZm9yIGEgY29tcG9uZW50LCAnICtcblx0XHRcdFx0XHQnaXQgbXVzdCBiZSBhbiAqaW5zdGFuY2UqIG9mIGEgQmFja2JvbmUuJyArIFR5cGUgKyAnLlxcbicpO1xuXG5cdFx0XHRcdGlmIChwcm9wZXJ0aWVzW3R5cGVdIGluc3RhbmNlb2YgQmFja2JvbmVbVHlwZV0uY29uc3RydWN0b3IpIHtcblx0XHRcdFx0XHRGcmFtZXdvcmsuZXJyb3IoXG5cdFx0XHRcdFx0XHQnSXQgbG9va3MgbGlrZSBhIEJhY2tib25lLicgKyBUeXBlICsgJyAqcHJvdG90eXBlKiB3YXMgc3BlY2lmaWVkIGluc3RlYWQgb2YgYSAnICtcblx0XHRcdFx0XHRcdCdCYWNrYm9uZS4nICsgVHlwZSArICcgKmluc3RhbmNlKi5cXG4nICtcblx0XHRcdFx0XHRcdCdQbGVhc2UgYG5ld2AgdXAgdGhlICcgKyB0eXBlICsgJyAtYmVmb3JlLSAnICsgRnJhbWV3b3JrLmlkICsgJy5yYWlzZSgpLCcgK1xuXHRcdFx0XHRcdFx0J29yIHVzZSBhIHdyYXBwZXIgZnVuY3Rpb24gdG8gYWNoaWV2ZSB0aGUgc2FtZSBlZmZlY3QsIGUuZy46XFxuJyArXG5cdFx0XHRcdFx0XHQnYCcgKyB0eXBlICsgJzogZnVuY3Rpb24gKCkge1xcbnJldHVybiBuZXcgU29tZScgKyBUeXBlICsgJygpO1xcbn1gJ1xuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRGcmFtZXdvcmsud2FybignSWdub3JpbmcgaW52YWxpZCAnICsgdHlwZSArICcgOjogJyArIHByb3BlcnRpZXNbdHlwZV0pO1xuXHRcdFx0XHRkZWxldGUgcHJvcGVydGllc1t0eXBlXTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDaGVjayB0aGF0IHRoaXMuY29sbGVjdGlvbiBpcyBhY3R1YWxseSBhbiBpbnN0YW5jZSBvZiBCYWNrYm9uZS5Db2xsZWN0aW9uXG5cdFx0Ly8gYW5kIHRoYXQgdGhpcy5tb2RlbCBpcyBhY3R1YWxseSBhbiBpbnN0YW5jZSBvZiBCYWNrYm9uZS5Nb2RlbFxuXHRcdF92YWxpZGF0ZUJhY2tib25lSW5zdGFuY2UoJ21vZGVsJyk7XG5cdFx0X3ZhbGlkYXRlQmFja2JvbmVJbnN0YW5jZSgnY29sbGVjdGlvbicpO1xuXG5cdFx0Ly8gQ2xvbmUgcHJvcGVydGllcyB0byBhdm9pZCBpbmFkdmVydGVudCBtb2RpZmljYXRpb25zXG5cdFx0cmV0dXJuIF8uY2xvbmUocHJvcGVydGllcyk7XG5cdH1cblxuXHRlbHNlIHJldHVybiB7fTtcblxufVxuIiwiLyoqXG4gKiBSdW4gZGVmaW5pdGlvbiBtZXRob2RzIHRvIGdldCBhY3R1YWwgY29tcG9uZW50IGRlZmluaXRpb25zLlxuICogVGhpcyBpcyBkZWZlcnJlZCB0byBhdm9pZCBoYXZpbmcgdG8gdXNlIEJhY2tib25lJ3MgZnVuY3Rpb24gKCkge30gYXBwcm9hY2ggZm9yIHRoaW5nc1xuICogbGlrZSBjb2xsZWN0aW9ucy5cbiAqL1xuXG4vKipcbiAqIEJ1aWxkIHVwcyBhIGNvbXBvbmVudCBkZWZpbml0aW9uIGJ5IHJ1bm5pbmcgdGhlIGRlZmluaXRpb24uIFdlIHRoZW4gbGluayB0aGVcbiAqIGNvbXBvbmVudCBkZWZpbml0aW9uIHRvIGFuIGlkZW50aWZpZXIgaW4gYEZSQU1FV09SSy5jb21wb25lbnRzYC5cbiAqXG4gKiBAcGFyYW0gIHtPYmplY3R9IGNvbXBvbmVudCBbT2JqZWN0IGNvbnRhaW5pbmcgdGhlIGRlZmluaXRpb24gZnVuY3Rpb24gb2YgdGhlIGNvbXBvbmVudF1cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBidWlsZENvbXBvbmVudERlZmluaXRpb24oY29tcG9uZW50KSB7XG5cdHZhciBjb21wb25lbnREZWYgPSBjb21wb25lbnQuZGVmaW5pdGlvbigpO1xuXG5cdGlmIChjb21wb25lbnQuaWRPdmVycmlkZSkge1xuXHRcdGlmIChjb21wb25lbnREZWYuaWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihjb21wb25lbnQuaWRPdmVycmlkZSArICc6OiBDYW5ub3Qgc3BlY2lmeSBhbiBpZE92ZXJyaWRlIGluIC5kZWZpbmUoKSBpZiBhbiBpZCBwcm9wZXJ0eSAoJytjb21wb25lbnREZWYuaWQrJykgaXMgYWxyZWFkeSBzZXQgaW4geW91ciBjb21wb25lbnQgZGVmaW5pdGlvbiFcXG5Vc2FnZTogLmRlZmluZShbaWRPdmVycmlkZV0sIGRlZmluaXRpb24pJyk7XG5cdFx0fVxuXHRcdGNvbXBvbmVudERlZi5pZCA9IGNvbXBvbmVudC5pZE92ZXJyaWRlO1xuXHR9XG5cdGlmICghY29tcG9uZW50RGVmLmlkKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgdXNlIC5kZWZpbmUoKSB3aXRob3V0IGRlZmluaW5nIGFuIGlkIHByb3BlcnR5IG9yIG92ZXJyaWRlIGluIHlvdXIgY29tcG9uZW50IVxcblVzYWdlOiAuZGVmaW5lKFtpZE92ZXJyaWRlXSwgZGVmaW5pdGlvbiknKTtcblx0fVxuXHRGUkFNRVdPUksuY29tcG9uZW50c1tjb21wb25lbnREZWYuaWRdID0gY29tcG9uZW50RGVmO1xufTtcbiIsIi8qKlxuICogT3B0aW9uYWwgbWV0aG9kIHRvIHJlcXVpcmUgYXBwIGNvbXBvbmVudHMuIFJlcXVpcmUuanMgY2FuIGJlIHVzZWQgaW5zdGVhZFxuICogYXMgbmVlZGVkLlxuICpcbiAqIEBwYXJhbSAge1N0cmluZ30gXHRbKG9wdGlvbmFsKSBDb21wb25lbnQgaWQgb3ZlcnJpZGVdXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gW0Z1bmN0aW9uIERlZmluaXRpb24gb2YgY29tcG9uZW50XVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGRlZmluZShpZCwgZGVmaW5pdGlvbkZuKSB7XG5cdC8vIElkIHBhcmFtIGlzIG9wdGlvbmFsXG5cdGlmICghZGVmaW5pdGlvbkZuKSB7XG5cdFx0ZGVmaW5pdGlvbkZuID0gaWQ7XG5cdFx0aWQgPSBudWxsO1xuXHR9XG5cblx0RlJBTUVXT1JLLl9kZWZpbmVRdWV1ZS5wdXNoKHtcblx0XHRkZWZpbml0aW9uOiBkZWZpbml0aW9uRm4sXG5cdFx0aWRPdmVycmlkZTogaWRcblx0fSk7XG59O1xuIiwiLyoqXG4gKiBNYXN0IGJ1aWxkIGZpbGUuIFRoZSBtYWluIGZpbGVcbiAqL1xuXG52YXIgZGVmaW5lID0gcmVxdWlyZSgnLi9kZWZpbmUvaW5kZXgnKTtcbnZhciBSZWdpb24gPSByZXF1aXJlKCcuL3JlZ2lvbi9pbmRleCcpO1xudmFyIENvbXBvbmVudCA9IHJlcXVpcmUoJy4vY29tcG9uZW50L2luZGV4Jyk7XG52YXIgcmFpc2UgPSByZXF1aXJlKCcuL3JhaXNlL2luZGV4Jyk7XG5cbi8qKlxuICogRnJhbWV3b3JrIGNsYXNzIGRlZmluaXRpb24gdGhhdCB3aWxsIGNyZWF0ZSBhIG5ldyBnbG9iYWwgaW5zdGFuY2Ugb2YgYSBjdXN0b20gRnJhbWV3b3JrLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIFtvcHRpb25zIGhhc2ggdG8gaW5pdGlhbGl6ZSB0aGUgY3VzdG9tIGZyYW1ld29yayB3aXRoXVxuICovXG52YXIgRnJhbWV3b3JrID0gZnVuY3Rpb24ob3B0aW9ucykge1xuXG5cdC8vIFNldCB0aGUgZGVmYXVsdCBvcHRpb25zIGZvciB0aG9zZSBub3QgcGFzc2VkIGluLlxuXHRvcHRpb25zID0gXy5kZWZhdWx0cyhvcHRpb25zIHx8IHt9LCB7XG5cdFx0dGhyb3R0bGVXaW5kb3dSZXNpemU6IDIwMCxcblx0XHRsb2dMZXZlbDogJ3dhcm4nLFxuXHRcdGZyYW1ld29ya0lkOiAnbWFzdCcsXG5cdFx0cHJvZHVjdGlvbjogZmFsc2UsXG5cdFx0bG9nZ2VyOiB1bmRlZmluZWQsXG5cdFx0c2hvcnRjdXQ6IHtcblx0XHRcdHRlbXBsYXRlOiB0cnVlLFxuXHRcdFx0Y291bnQ6IHRydWVcblx0XHR9XG5cdH0pO1xuXG5cdC8vIFNldCBhIHN0YXJ0aW5nIHBvaW50IHRvIEJhY2tib25lIGFuZCBhZGQgYWRkaXRpb25hbCBhdHRyaWJ1dGUuXG5cdF8uZXh0ZW5kKHRoaXMsIEJhY2tib25lLCB7XG5cdFx0b3B0aW9uczogb3B0aW9ucyxcblx0XHR0ZW1wbGF0ZXM6IHt9LFxuXHRcdGNvbXBvbmVudHM6IHt9LFxuXHRcdGRhdGE6IHt9LFxuXHRcdF9kZWZpbmVRdWV1ZTogW10sXG5cdFx0cmVnaW9uczoge31cblx0fSk7XG5cblx0LyoqXG5cdCAqIEV4dGVuZCBGUkFNRVdPUksuQ29sbGVjdGlvbiB0byBtYWtlIGl0IGJldHRlclxuXHQgKiAoc3BlY2lmaWNhbGx5LCB0byBhZGQgZXJyb3IgaGFuZGxpbmcpXG5cdCAqL1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdHZhciBvcmlnaW5hbENvbGxlY3Rpb24gPSB0aGlzLkNvbGxlY3Rpb247XG5cdHRoaXMuQ29sbGVjdGlvbiA9IG9yaWdpbmFsQ29sbGVjdGlvbi5leHRlbmQoe1xuXG5cdFx0aW5pdGlhbGl6ZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcblxuXHRcdFx0Ly8gT3ZlcnJpZGUgYGNvbGxlY3Rpb24uZmV0Y2goKWBcblx0XHRcdHRoaXMuX2ZldGNoID0gdGhpcy5mZXRjaDtcblx0XHRcdHRoaXMuZmV0Y2ggPSB0aGlzWydfZmV0Y2grKyddO1xuXHRcdH0sXG5cblxuXHRcdC8qKlxuXHRcdCAqIGFmdGVyRXJyb3Jcblx0XHQgKlxuXHRcdCAqIExpZmVjeWNsZSBjYWxsYmFjayB0byBjYXRjaCB3aGVuIGEgZmV0Y2ggZXJyb3Igb2NjdXJzXG5cdFx0ICpcblx0XHQgKiBUT0RPOlxuXHRcdCAqIFByb2JhYmx5IHJlbW92ZSB0aGlzLS0gcmVhc29uaW5nIDo6XG5cdFx0ICogSW4gbW9zdCBjYXNlcywgeW91IGFjdHVhbGx5IGNhcmUgYWJvdXQgdGhlIGVycm9yIGluXG5cdFx0ICogdGhlIHJlbGV2YW50IGNvbXBvbmVudHMgd2hvIGFyZSB1c2luZyB0aGlzIGNvbGxlY3Rpb24sXG5cdFx0ICogaW4gd2hpY2ggY2FzZSB5b3UnZCBqdXN0IGJpbmQgYW4gZXJyb3IgZXZlbnQgaGFuZGxlci5cblx0XHQgKi9cblx0XHRhZnRlckVycm9yOiBmdW5jdGlvbiAoY29sbGVjdGlvbiwgeGhyLCBvcHRpb25zKSB7XG5cdFx0XHQvLyB0aGlzIGV4aXN0cyBmb3IgeW91IHRvIG92ZXJyaWRlIGl0IVxuXHRcdH0sXG5cblxuXG5cblx0XHQvKipcblx0XHQgKiBPdmVycmlkZSBCYWNrYm9uZS5Db2xsZWN0aW9uJ3MgYGZldGNoKClgXG5cdFx0ICogdG8gYWxsb3cgZm9yIGJldHRlciBlcnJvciBoYW5kbGluZy5cblx0XHQgKlxuXHRcdCAqIFRPRE86IHB1bGwgdGhpcyBpbnRvIEJhY2tib25lLnN5bmMgaW5zdGVhZC4uXG5cdFx0ICogb25seSBwcm9ibGVtIGlzIGNsYXNoaW5nIHdpdGggb3RoZXIgc3luYyBvdmVycmlkZXNcblx0XHQgKi9cblx0XHQnX2ZldGNoKysnOiBmdW5jdGlvbiAob3B0aW9ucykge1xuXHRcdFx0dmFyIGNvbGxlY3Rpb24gPSB0aGlzO1xuXG5cdFx0XHRvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblxuXHRcdFx0Ly8gTG9nIGEgZnJpZW5kbGllciBcIk5vIFVSTFwiIG1lc3NhZ2U6XG5cdFx0XHRpZiAoICFjb2xsZWN0aW9uLnVybCApIHtcblx0XHRcdFx0c2VsZi5lcnJvcignQ2Fubm90IGZldGNoKCkgJyArIGNvbGxlY3Rpb24udHlwZSArICcgOjogQ29sbGVjdGlvbiBoYXMgbm8gVVJMIGZ1bmN0aW9uL3Byb3BlcnR5Li4uJyk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gT3ZlcnJpZGUgZXJyb3IgaGFuZGxlciB0byBtaXhpbiBhbiAnZXJyb3InIGV2ZW50XG5cdFx0XHR2YXIgb3JpZ2luYWxFcnJvckhhbmRsZXIgPSBvcHRpb25zLmVycm9yO1xuXHRcdFx0dmFyIG9yaWdpbmFsU3VjY2Vzc0hhbmRsZXIgPSBvcHRpb25zLnN1Y2Nlc3M7XG5cdFx0XHRfLmV4dGVuZChvcHRpb25zLCB7XG5cdFx0XHRcdHN1Y2Nlc3M6IGZ1bmN0aW9uIChjb2xsZWN0aW9uLCB4aHIsIG9wdGlvbnMpIHtcblx0XHRcdFx0XHR2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG5cblx0XHRcdFx0XHQvLyBOdWxsIG91dCBgY29sbGVjdGlvbi5zeW5jaW5nYFxuXHRcdFx0XHRcdGNvbGxlY3Rpb24uc3luY2luZyA9IG51bGw7XG5cblx0XHRcdFx0XHQvLyBUcmlnZ2VyIG9yaWdpbmFsIHN1Y2Nlc3MgaGFuZGxlciBpZiBzcGVjaWZpZWRcblx0XHRcdFx0XHQvLyBvbiBgZmV0Y2goe3N1Y2Nlc3M6IGZ1bmN0aW9uKCl7LyouLi4qL319KWBcblx0XHRcdFx0XHRpZiAob3JpZ2luYWxTdWNjZXNzSGFuZGxlcikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG9yaWdpbmFsU3VjY2Vzc0hhbmRsZXIuYXBwbHkoY29sbGVjdGlvbiwgYXJncyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRlcnJvcjogZnVuY3Rpb24gKGNvbGxlY3Rpb24sIHhociwgb3B0aW9ucykge1xuXHRcdFx0XHRcdHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcblxuXHRcdFx0XHRcdC8vIE51bGwgb3V0IGBjb2xsZWN0aW9uLnN5bmNpbmdgXG5cdFx0XHRcdFx0Y29sbGVjdGlvbi5zeW5jaW5nID0gbnVsbDtcblxuXHRcdFx0XHRcdC8vIElmIHRoaXMgaXMgYW4gXCJhYm9ydFwiLCBpZ25vcmUgaXQtIChzdGF0ZSBoYXMgYWxyZWFkeSBiZWVuIHRha2VuIGNhcmUgb2YpXG5cdFx0XHRcdFx0aWYgKCB4aHIgJiYgeGhyLnN0YXR1c1RleHQ9PT0nYWJvcnQnICkgcmV0dXJuO1xuXG5cdFx0XHRcdFx0Ly8gU2V0IGBjb2xsZWN0aW9uLmVycm9yYCB1c2luZyB0aGUgcmVzcG9uc2UgZnJvbSB0aGUgZmV0Y2hcblx0XHRcdFx0XHQvLyAodHJ5IGpzb24sIHRoZW4gcmVzcG9uc2UgdGV4dCwgdGhlbiBzdGF0dXMgY29kZSwgdGhlbiBqdXN0IGRlZmF1bHQgdG8gYHRydWVgKVxuXHRcdFx0XHRcdGNvbGxlY3Rpb24uZXJyb3IgPVxuXHRcdFx0XHRcdFx0KCB4aHIgJiYgeGhyLnJlc3BvbnNlSlNPTiApID8geGhyLnJlc3BvbnNlSlNPTiA6XG5cdFx0XHRcdFx0XHQoIHhociAmJiB4aHIucmVzcG9uc2VUZXh0ICkgPyB4aHIucmVzcG9uc2VUZXh0IDpcblx0XHRcdFx0XHRcdHRydWU7XG5cblxuXHRcdFx0XHRcdC8vIENhbGwgYGFmdGVyRXJyb3IoKWBcblx0XHRcdFx0XHRjb2xsZWN0aW9uLmFmdGVyRXJyb3IuYXBwbHkoY29sbGVjdGlvbixhcmdzKTtcblxuXHRcdFx0XHRcdC8vIFRyaWdnZXIgb3JpZ2luYWwgZXJyb3IgaGFuZGxlciBpZiBzcGVjaWZpZWRcblx0XHRcdFx0XHQvLyBvbiBgZmV0Y2goe2Vycm9yOiBmdW5jdGlvbigpey8qLi4uKi99fSlgXG5cdFx0XHRcdFx0aWYgKG9yaWdpbmFsRXJyb3JIYW5kbGVyKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gb3JpZ2luYWxFcnJvckhhbmRsZXIuYXBwbHkoY29sbGVjdGlvbiwgYXJncyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gTnVsbCBvdXQgYGNvbGxlY3Rpb24uZXJyb3JgXG5cdFx0XHRjb2xsZWN0aW9uLmVycm9yID0gbnVsbDtcblxuXHRcdFx0Ly8gSWYgYGZldGNoYCBpcyBhbHJlYWR5IGluIHByb2dyZXNzLCBjYW5jZWwgaXRcblx0XHRcdC8vIGFuZCBmaXJlIG9mZiBhIG5ldyBvbmUuXG5cdFx0XHRpZiAoY29sbGVjdGlvbi5zeW5jaW5nKSB7XG5cdFx0XHRcdHNlbGYubG9nKCdBYm9ydGluZyBydW5uaW5nIGBmZXRjaCgpYCBpbiBvcmRlciB0byBzdGFydCBhIG5ldyBgZmV0Y2goKWAuLi4nKTtcblx0XHRcdFx0Y29sbGVjdGlvbi5zeW5jaW5nLmFib3J0KCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENhbGwgb3JpZ2luYWwgYGZldGNoKClgIHVzaW5nIG91ciBtb25rZXktcGF0Y2hlZCBvcHRpb25zXG5cdFx0XHR2YXIgeGhyID0gY29sbGVjdGlvbi5fZmV0Y2gob3B0aW9ucyk7XG5cblx0XHRcdC8vIFNldCBgY29sbGVjdGlvbi5zeW5jaW5nYCB0byB0aGUgWEhSIG9iamVjdCBpbiB1c2Vcblx0XHRcdGNvbGxlY3Rpb24uc3luY2luZyA9IHhocjtcblxuXHRcdFx0Ly8gUmV0dXJuIHRoZSBYSFIgb2JqZWN0IHRvIG1haW50YWluIG9yaWdpbmFsIGBCYWNrYm9uZS5Db2xsZWN0aW9uLmZldGNoKClgIEFQSVxuXHRcdFx0cmV0dXJuIHhocjtcblx0XHR9XG5cblx0fSk7XG5cblxuXHQvLyBUaHJvdWdob3V0IHRoZSBzb3VyY2UgY29kZSwgdGhlcmUgYXJlIG9wZXJhdGlvbnMgb24gYEZSQU1FV09SS2Agb3IgY29kZSB0aGF0IGFjY2Vzc2VzXG5cdC8vIGl0cyBhdHRyaWJ1dGVzLiBTbyB3ZSBtYWtlIGBGUkFNRVdPUktgIGFjY2Vzc2libGUuXG5cdC8vXG5cdC8vIE5vdGU6XG5cdC8vIGBGUkFNRVdPUktgIHdpbGwgb25seSBiZSBhIGdsb2JhbCB2YXJpYWJsZSAqKiBkdXJpbmcgdGhlIGJ1aWxkICoqXG5cdEZSQU1FV09SSyA9IHRoaXM7XG5cblxufTtcblxuLy8gRnJhbWV3b3JrIHByb3RvdHlwZSBtZXRob2RzLlxuRnJhbWV3b3JrLnByb3RvdHlwZS5SZWdpb24gPSBSZWdpb247XG5GcmFtZXdvcmsucHJvdG90eXBlLkNvbXBvbmVudCA9IENvbXBvbmVudDtcbkZyYW1ld29yay5wcm90b3R5cGUuZGVmaW5lID0gZGVmaW5lO1xuRnJhbWV3b3JrLnByb3RvdHlwZS5yYWlzZSA9IHJhaXNlO1xuXG5cbi8vIEluc3RhbnRpYXRlIEZyYW1ld29yayBpbnN0YW5jZVxudmFyIGZyYW1ld29yayA9IG5ldyBGcmFtZXdvcmsoKTtcblxuLy8gVE9ETzogZnV0dXJlXG4vLyBSYWlzZSBpbW1lZGlhdGVseSwgYW5kIHRoZW4gYWxsIG5ldyBtb2RlbHMgLyBuZXcgY29tcG9uZW50cyAvIGNoYW5nZXNcbi8vIHNob3VsZCBiZSBkeW5hbWljIGF0IHJ1bnRpbWUuXG4vL1xuLy8gRm9yIG5vdywgTWFzdC5yYWlzZSgpIGlzIHN0aWxsIG1hbnVhbC5cblxuXG4vLyBFeHBvc2UgaW5zdGFudGlhdGVkIGZyYW1ld29yayB2aWEgVU1EOlxubW9kdWxlLmV4cG9ydHMgPSBmcmFtZXdvcms7XG4iLCIvKipcbiAqXHRMb2dnZXQgY29uc3RydWN0b3IgbWV0aG9kIHRoYXQgd2lsbCBzZXR1cCBGUkFNRVdPUksgdG8gbG9nIG1lc3NhZ2VzLlxuICovXG5cbnZhciBzZXR1cExvZ2dlciA9IHJlcXVpcmUoJy4vc2V0dXAnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBMb2dnZXIoKSB7XG5cblx0Ly8gVXBvbiBpbml0aWFsaXphdGlvbiwgc2V0dXAgbG9nZ2VyXG5cdHNldHVwTG9nZ2VyKEZSQU1FV09SSy5vcHRpb25zLmxvZ0xldmVsKTtcblxuXHQvLyBJbiBzdXBwb3J0ZWQgYnJvd3NlcnMsIGFsc28gcnVuIHNldHVwTG9nZ2VyIGFnYWluXG5cdC8vIHdoZW4gRlJBTUVXT1JLLmxvZ0xldmVsIGlzIHNldCBieSB0aGUgdXNlclxuXHQvLyBUT0RPOiBmaW5kIGEgd2F5IHRvIGRvIHRoaXMgd2l0aG91dCBkZXBlbmRpbmcgb24gX19kZWZpbmVTZXR0ZXJfXy5cblx0aWYgKF8uaXNGdW5jdGlvbihGUkFNRVdPUksuX19kZWZpbmVTZXR0ZXJfXykpIHtcblx0XHRGUkFNRVdPUksuX19kZWZpbmVTZXR0ZXJfXygnbG9nTGV2ZWwnLCBmdW5jdGlvbiBvbkNoYW5nZSAobmV3TG9nTGV2ZWwpIHtcblx0XHRcdHNldHVwTG9nZ2VyKG5ld0xvZ0xldmVsKTtcblx0XHR9KTtcblx0fVxufTtcbiIsIi8qKlxuICogU2V0IHVwIHRoZSBsb2cgZnVuY3Rpb25zOlxuICpcbiAqIEZSQU1FV09SSy5lcnJvclxuICogRlJBTUVXT1JLLndhcm5cbiAqIEZSQU1FV09SSy5sb2dcbiAqIEZSQU1FV09SSy5kZWJ1ZyAoKmxlZ2FjeSlcbiAqIEZSQU1FV09SSy52ZXJib3NlXG4gKlxuICogQHBhcmFtICB7U3RyaW5nfSBsb2dMZXZlbCBbVGhlIGRlc2lyZWQgbG9nIGxldmVsIG9mIHRoZSBMb2dnZXJdXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gc2V0dXBMb2dnZXIgKGxvZ0xldmVsKSB7XG5cblx0dmFyIG5vb3AgPSBmdW5jdGlvbiAoKSB7fTtcblxuXHQvLyBJZiBsb2cgaXMgc3BlY2lmaWVkLCB1c2UgaXQsIG90aGVyd2lzZSB1c2UgdGhlIGNvbnNvbGVcblx0aWYgKEZSQU1FV09SSy5sb2dnZXIpIHtcblx0XHRGUkFNRVdPUksuZXJyb3IgICAgID0gRlJBTUVXT1JLLmxvZ2dlci5lcnJvcjtcblx0XHRGUkFNRVdPUksud2FybiAgICAgID0gRlJBTUVXT1JLLmxvZ2dlci53YXJuO1xuXHRcdEZSQU1FV09SSy5sb2cgICAgICAgPSBGUkFNRVdPUksubG9nZ2VyLmRlYnVnIHx8IEZSQU1FV09SSy5sb2dnZXI7XG5cdFx0RlJBTUVXT1JLLnZlcmJvc2UgICA9IEZSQU1FV09SSy5sb2dnZXIudmVyYm9zZTtcblx0fVxuXG5cdC8vIEluIElFLCB3ZSBjYW4ndCBkZWZhdWx0IHRvIHRoZSBicm93c2VyIGNvbnNvbGUgYmVjYXVzZSB0aGVyZSBJUyBOTyBCUk9XU0VSIENPTlNPTEVcblx0ZWxzZSBpZiAodHlwZW9mIGNvbnNvbGUgIT09ICd1bmRlZmluZWQnKSB7XG5cblx0XHQvLyBXZSBjYW5ub3QgY2FsbGVkIHRoZSAuYmluZCBtZXRob2Qgb24gdGhlIGNvbnNvbGUgbWV0aG9kcy4gV2UgYXJlIGluIGllIDkgb3IgOCwganVzdCBtYWtlXG5cdFx0Ly8gZXZlcnlodGluZyBhIG5vb3AuXG5cdFx0aWYgKF8uaXNVbmRlZmluZWQoY29uc29sZS5sb2cuYmluZCkpICB7XG5cdFx0XHRGUkFNRVdPUksuZXJyb3IgICAgID0gbm9vcDtcblx0XHRcdEZSQU1FV09SSy53YXJuICAgICAgPSBub29wO1xuXHRcdFx0RlJBTUVXT1JLLmxvZyAgICAgICA9IG5vb3A7XG5cdFx0XHRGUkFNRVdPUksuZGVidWcgICAgID0gbm9vcDtcblx0XHRcdEZSQU1FV09SSy52ZXJib3NlICAgPSBub29wO1xuXHRcdH1cblxuXHRcdC8vIFdlIGFyZSBpbiBhIGZyaWVuZGx5IGJyb3dzZXIgbGlrZSBDaHJvbWUsIEZpcmVmb3gsIG9yIElFMTBcblx0XHRlbHNlIHtcblx0XHRcdEZSQU1FV09SSy5lcnJvclx0XHQ9IGNvbnNvbGUuZXJyb3IgJiYgY29uc29sZS5lcnJvci5iaW5kKGNvbnNvbGUpO1xuXHRcdFx0RlJBTUVXT1JLLndhcm5cdFx0PSBjb25zb2xlLndhcm4gJiYgY29uc29sZS53YXJuLmJpbmQoY29uc29sZSk7XG5cdFx0XHRGUkFNRVdPUksubG9nXHRcdFx0PSBjb25zb2xlLmRlYnVnICYmIGNvbnNvbGUuZGVidWcuYmluZChjb25zb2xlKTtcblx0XHRcdEZSQU1FV09SSy52ZXJib3NlXHQ9IGNvbnNvbGUubG9nICYmIGNvbnNvbGUubG9nLmJpbmQoY29uc29sZSk7XG5cblx0XHRcdC8vIFVzZSBsb2cgbGV2ZWwgY29uZmlnIGlmIHByb3ZpZGVkXG5cdFx0XHRzd2l0Y2ggKGxvZ0xldmVsKSB7XG5cdFx0XHRcdGNhc2UgJ3ZlcmJvc2UnOiBicmVhaztcblxuXHRcdFx0XHRjYXNlICdkZWJ1Zyc6XG5cdFx0XHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UgPSBub29wO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgJ3dhcm4nOlxuXHRcdFx0XHRcdEZSQU1FV09SSy52ZXJib3NlID0gRlJBTUVXT1JLLmxvZyA9IG5vb3A7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSAnZXJyb3InOlxuXHRcdFx0XHRcdEZSQU1FV09SSy52ZXJib3NlID0gRlJBTUVXT1JLLmxvZyA9IEZSQU1FV09SSy53YXJuID0gbm9vcDtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlICdzaWxlbnQnOlxuXHRcdFx0XHRcdEZSQU1FV09SSy52ZXJib3NlID0gRlJBTUVXT1JLLmxvZyA9IEZSQU1FV09SSy53YXJuID0gRlJBTUVXT1JLLmVycm9yID0gbm9vcDtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvciAoJ1VucmVjb2duaXplZCBsb2dnaW5nIGxldmVsIGNvbmZpZyAnICtcblx0XHRcdFx0XHQnKCcgKyBGUkFNRVdPUksub3B0aW9ucy5mcmFtZXdvcmtJZCArICcubG9nTGV2ZWwgPSBcIicgKyBsb2dMZXZlbCArICdcIiknKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU3VwcG9ydCBmb3IgYGRlYnVnYCBmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHlcblx0XHRcdEZSQU1FV09SSy5kZWJ1ZyA9IEZSQU1FV09SSy5sb2c7XG5cblx0XHRcdC8vIFZlcmJvc2Ugc3BpdHMgb3V0IGxvZyBsZXZlbFxuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UoJ0xvZyBsZXZlbCBzZXQgdG8gOjogJywgbG9nTGV2ZWwpO1xuXHRcdH1cblx0fVxufVxuIiwiLyoqXG4gKiBHaXZlbiBhIGNvbXBvbmVudCBkZWZpbml0aW9uIGFuZCBpdHMga2V5LCB3ZSB3aWxsIGJ1aWxkIHVwIHRoZSBjb21wb25lbnQgcHJvdG90eXBlIGFuZCBtZXJnZVxuICogdGhpcyBjb21wb25lbnQgd2l0aCBpdHMgbWF0Y2hpbmcgdGVtcGxhdGUuXG4gKlxuICogQHBhcmFtICB7T2JqZWN0fSBjb21wb25lbnREZWYgW09iamVjdCBjb250YWluaW5nIHRoZSBjb21wb25lbnQgZGVmaW5pdGlvbl1cbiAqIEBwYXJhbSAge1N0cmluZ30gY29tcG9uZW50S2V5IFtUaGUgY29tcG9uZW50IGlkZW50aWZpZXJdXG4gKi9cblxudmFyIHRyYW5zbGF0ZVNob3J0aGFuZCA9IHJlcXVpcmUoJy4uL3V0aWxzL3Nob3J0aGFuZCcpO1xudmFyIG9iak1hcCA9IHJlcXVpcmUoJy4uL3V0aWxzL29iak1hcCcpO1xudmFyIEV2ZW50cyA9IHJlcXVpcmUoJy4uL3V0aWxzL2V2ZW50cycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGJ1aWxkQ29tcG9uZW50UHJvdG90eXBlKGNvbXBvbmVudERlZiwgY29tcG9uZW50S2V5KSB7XG5cblx0Ly8gSWYgY29tcG9uZW50IGlkIGlzIG5vdCBleHBsaWNpdGx5IHNldCwgdXNlIHRoZSBjb21wb25lbnRLZXlcblx0aWYgKCFjb21wb25lbnREZWYuaWQpIHtcblx0XHRjb21wb25lbnREZWYuaWQgPSBjb21wb25lbnRLZXk7XG5cdH1cblxuXHQvLyBTZWFyY2ggdGVtcGxhdGVzXG5cdHZhciB0ZW1wbGF0ZSA9IEZSQU1FV09SSy50ZW1wbGF0ZXNbY29tcG9uZW50RGVmLmlkXTtcblxuXHQvLyBJZiBubyBtYXRjaCBmb3IgY29tcG9uZW50IHdhcyBmb3VuZMKgaW4gdGVtcGxhdGVzLCBpc3N1ZSBhIHdhcm5pbmdcblx0aWYgKCF0ZW1wbGF0ZSkge1xuXHRcdHJldHVybiBGUkFNRVdPUksud2Fybihcblx0XHRcdGNvbXBvbmVudERlZi5pZCArICcgOjogTm8gdGVtcGxhdGUgZm91bmQgZm9yIGNvbXBvbmVudCEnICtcblx0XHRcdCdcXG5UZW1wbGF0ZXMgZG9uXFwndCBuZWVkIGEgY29tcG9uZW50IHVubGVzcyB5b3Ugd2FudCBpbnRlcmFjdGl2aXR5LCAnICtcblx0XHRcdCdldmVyeSBjb21wb25lbnQgKnNob3VsZCogaGF2ZSBhIG1hdGNoaW5nIHRlbXBsYXRlISEnICtcblx0XHRcdCdcXG5Vc2luZyBjb21wb25lbnRzIHdpdGhvdXQgdGVtcGxhdGVzIG1heSBzZWVtIG5lY2Vzc2FyeSwgJyArXG5cdFx0XHQnYnV0IGl0XFwncyBub3QuICBJdCBtYWtlcyB5b3VyIHZpZXcgbG9naWMgaW5jb3Jwb3JlYWwsIGFuZCBtYWtlcyB5b3VyIGNvbGxlYWd1ZXMgJyArXG5cdFx0XHQndW5jb21mb3J0YWJsZS4nKTtcblx0fVxuXG5cdC8vIFNhdmUgcmVmZXJlbmNlIHRvIHRlbXBsYXRlIGluIGNvbXBvbmVudCBwcm90b3R5cGVcblx0RlJBTUVXT1JLLnZlcmJvc2UoY29tcG9uZW50RGVmLmlkICsgJyA6OiBQYWlyaW5nIGNvbXBvbmVudCB3aXRoIHRlbXBsYXRlLi4uJyk7XG5cdGNvbXBvbmVudERlZi50ZW1wbGF0ZSA9IHRlbXBsYXRlO1xuXG5cdC8vIFRyYW5zbGF0ZSByaWdodC1oYW5kIHNob3J0aGFuZCBmb3IgdG9wLWxldmVsIGtleXNcblx0Y29tcG9uZW50RGVmID0gb2JqTWFwKGNvbXBvbmVudERlZiwgdHJhbnNsYXRlU2hvcnRoYW5kKTtcblxuXG5cdC8vIGFuZCBldmVudHMgb2JqZWN0XG5cdGlmIChjb21wb25lbnREZWYuZXZlbnRzKSB7XG5cdFx0Y29tcG9uZW50RGVmLmV2ZW50cyA9IG9iak1hcChcblx0XHRcdGNvbXBvbmVudERlZi5ldmVudHMsXG5cdFx0XHR0cmFuc2xhdGVTaG9ydGhhbmRcblx0XHQpO1xuXHR9XG5cblx0Ly8gYW5kIGFmdGVyQ2hhbmdlIGJpbmRpbmdzXG5cdGlmIChfLmlzT2JqZWN0KGNvbXBvbmVudERlZi5hZnRlckNoYW5nZSkgJiYgIV8uaXNGdW5jdGlvbihjb21wb25lbnREZWYuYWZ0ZXJDaGFuZ2UpKSB7XG5cdFx0Y29tcG9uZW50RGVmLmFmdGVyQ2hhbmdlID0gb2JqTWFwKFxuXHRcdFx0Y29tcG9uZW50RGVmLmFmdGVyQ2hhbmdlLFxuXHRcdFx0dHJhbnNsYXRlU2hvcnRoYW5kXG5cdFx0KTtcblx0fVxuXG5cdC8vIEdvIGFoZWFkIGFuZCB0dXJuIHRoZSBkZWZpbml0aW9uIGludG8gYSByZWFsIGNvbXBvbmVudCBwcm90b3R5cGVcblx0RlJBTUVXT1JLLnZlcmJvc2UoY29tcG9uZW50RGVmLmlkICsgJyA6OiBCdWlsZGluZyBjb21wb25lbnQgcHJvdG90eXBlLi4uJyk7XG5cdHZhciBjb21wb25lbnRQcm90b3R5cGUgPSBGUkFNRVdPUksuQ29tcG9uZW50LmV4dGVuZChjb21wb25lbnREZWYpO1xuXG5cdC8vIERpc2NvdmVyIHN1YnNjcmlwdGlvbnNcblx0Y29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZS5zdWJzY3JpcHRpb25zID0ge307XG5cblx0Ly8gSXRlcmF0ZSB0aHJvdWdoIGVhY2ggcHJvcGVydHkgb24gdGhpcyBjb21wb25lbnQgcHJvdG90eXBlXG5cdF8uZWFjaChjb21wb25lbnRQcm90b3R5cGUucHJvdG90eXBlLCBmdW5jdGlvbiAoaGFuZGxlciwga2V5KSB7XG5cblx0XHQvLyBEZXRlY3QgRE9NIGV2ZW50cyBhbmQgc21hc2ggdGhlbSBpbnRvIHRoZSBldmVudHMgaGFzaFxuXHRcdHZhciBtYXRjaGVkRE9NRXZlbnRzID0ga2V5Lm1hdGNoKEV2ZW50c1snL0RPTUV2ZW50LyddKTtcblx0XHRpZiAobWF0Y2hlZERPTUV2ZW50cykge1xuXHRcdFx0dmFyIGV2ZW50TmFtZSA9IG1hdGNoZWRET01FdmVudHNbMV07XG5cdFx0XHR2YXIgZGVsZWdhdGVTZWxlY3RvciA9IG1hdGNoZWRET01FdmVudHNbM107XG5cblx0XHRcdC8vIFN0b3cgdGhlbSBpbiBldmVudHMgaGFzaFxuXHRcdFx0Y29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZS5ldmVudHMgPSBjb21wb25lbnRQcm90b3R5cGUucHJvdG90eXBlLmV2ZW50cyB8fCB7fTtcblx0XHRcdGNvbXBvbmVudFByb3RvdHlwZS5wcm90b3R5cGUuZXZlbnRzW2tleV0gPSBoYW5kbGVyO1xuXHRcdH1cblxuXHRcdC8vIEFkZCBhcHAgZXZlbnRzICglKSwgcm91dGVzICgjKSwgYW5kIGRhdGEgbGlzdGVuZXJzICh+KSB0byBzdWJzY3JpcHRpb25zIGhhc2hcblx0XHRpZiAoa2V5Lm1hdGNoKC9eKCV8I3x+KS8pKSB7XG5cdFx0XHRpZiAoXy5pc1N0cmluZyhoYW5kbGVyKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoY29tcG9uZW50RGVmLmlkICsgJzo6IEludmFsaWQgbGlzdGVuZXIgZm9yIHN1YnNjcmlwdGlvbjogJyArIGtleSArICcuXFxuJyArXG5cdFx0XHRcdFx0J0RlZmluZSB5b3VyIGNhbGxiYWNrIHdpdGggYW4gYW5vbnltb3VzIGZ1bmN0aW9uIGluc3RlYWQgb2YgYSBzdHJpbmcuJ1xuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFfLmlzRnVuY3Rpb24oaGFuZGxlcikpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGNvbXBvbmVudERlZi5pZCArJzo6IEludmFsaWQgbGlzdGVuZXIgZm9yIHN1YnNjcmlwdGlvbjogJyArIGtleSk7XG5cdFx0XHR9XG5cdFx0XHRjb21wb25lbnRQcm90b3R5cGUucHJvdG90eXBlLnN1YnNjcmlwdGlvbnNba2V5XSA9IGhhbmRsZXI7XG5cdFx0fVxuXG5cdFx0Ly8gRXh0ZW5kIG9uZSBvciBtb3JlIG90aGVyIGNvbXBvbmVudHNcblx0XHRlbHNlIGlmIChrZXkgPT09ICdleHRlbmRDb21wb25lbnRzJykge1xuXHRcdFx0dmFyIG9ialRvTWVyZ2UgPSB7fTtcblx0XHRcdF8uZWFjaChoYW5kbGVyLCBmdW5jdGlvbihjaGlsZElkKXtcblxuXHRcdFx0XHRpZiAoIUZSQU1FV09SSy5jb21wb25lbnRzW2NoaWxkSWRdKXtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoXG5cdFx0XHRcdFx0Y29tcG9uZW50RGVmLmlkICsgJyA6OiAnICtcblx0XHRcdFx0XHQnVHJ5aW5nIHRvIGRlZmluZS9leHRlbmQgdGhpcyBjb21wb25lbnQgZnJvbSBgJyArIGNoaWxkSWQgKyAnYCwgJyArXG5cdFx0XHRcdFx0J2J1dCBubyBjb21wb25lbnQgd2l0aCB0aGF0IGlkIGNhbiBiZSBmb3VuZC4nXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdF8uZXh0ZW5kKG9ialRvTWVyZ2UsIEZSQU1FV09SSy5jb21wb25lbnRzW2NoaWxkSWRdKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRfLmRlZmF1bHRzKGNvbXBvbmVudFByb3RvdHlwZS5wcm90b3R5cGUsIG9ialRvTWVyZ2UpO1xuXHRcdH1cblx0fSk7XG5cblx0Ly8gU2F2ZSBwcm90b3R5cGUgaW4gZ2xvYmFsIHNldCBmb3IgdHJhY2tpbmdcblx0RlJBTUVXT1JLLmNvbXBvbmVudHNbY29tcG9uZW50RGVmLmlkXSA9IGNvbXBvbmVudFByb3RvdHlwZTtcbn07XG4iLCIvKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXNcbiAqL1xuXG52YXIgZWwyRGVmYXVsdFRlbXBsYXRlSUQgPSByZXF1aXJlKCcuLi91dGlscy9lbDJEZWZhdWx0VGVtcGxhdGVJRCcpO1xuXG5cblxuXG5cbi8qKlxuICogQ29sbGVjdCBhbnkgVE9QLUxFVkVMIHJlZ2lvbnMgd2l0aCB0aGUgZGVmYXVsdCB0ZW1wbGF0ZS9jb21wb25lbnQgc3BlY2lmaWVkIGluIHRoZSBIVE1MXG4gKlxuICogTm90ZTpcbiAqIFRoaXMgaXMgb25seSBydW4gb24gdGhlIG9yaWdpbmFsIEhUTUwgcGFnZSwgbm90IGluIGNsaWVudC1zaWRlIHRlbXBsYXRlcyEhIVxuICogRm9yIHRoYXQsIHNlZSBgbGliL2NvbXBvbmVudC9yZW5kZXJSZWdpb25zLmpzYC5cbiAqXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjb2xsZWN0UmVnaW9ucyAoKSB7XG5cblxuXHQvLyBHZXQgdG9wLWxldmVsIHJlZ2lvbnMuXG5cdHZhciAkdG9wTGV2ZWxSZWdpb25zID0gJCgncmVnaW9uLCBbZGF0YS1yZWdpb25dJykuZmlsdGVyKGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiAkKHRoaXMpLnBhcmVudHMoJ3JlZ2lvbiwgW2RhdGEtcmVnaW9uXScpLmxlbmd0aCA9PT0gMDtcblx0fSk7XG5cblxuXHQkdG9wTGV2ZWxSZWdpb25zLmVhY2goZnVuY3Rpb24oKSB7XG5cdFx0dmFyIGVsID0gdGhpcztcblx0XHR2YXIgJGVsID0gJCh0aGlzKTtcblxuXHRcdC8vIFByb3ZpZGUgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkgZm9yIGxlZ2FjeSBub3RhdGlvblxuXHRcdC8vIChub3JtYWxpemUgdG8gYHRlbXBsYXRlYClcblx0XHR2YXIgY29tcG9uZW50SWQgPSBlbDJEZWZhdWx0VGVtcGxhdGVJRChlbCk7XG5cblx0XHQvLyBOb3cgaW5zdGFudGlhdGUgdGhlIGFwcHJvcHJpYXRlIGRlZmF1bHQgY29tcG9uZW50IGluIGVhY2hcblx0XHQvLyByZWdpb24gd2l0aCBhIHNwZWNpZmllZCB0ZW1wbGF0ZS9jb21wb25lbnRcblx0XHRGUkFNRVdPUksuUmVnaW9uLmZyb21FbGVtZW50KGVsKTtcblx0fSk7XG5cbn07XG4iLCIvKipcbiAqIExvYWQgYW55IHNjcmlwdCB0YWdzIG9uIHRoZSBwYWdlIHdpdGggdHlwZT1cInRleHQvdGVtcGxhdGVcIi5cbiAqXG4gKiBAcmV0dXJuIHtPYmplY3R9IFtPYmplY3QgY29uc2lzdGluZyBvZiBhIHRlbXBsYXRlIGlkZW50aWZpZXIgYW5kIGl0cyBIVE1MLl1cbiAqL1xuXG52YXIgZWwyTWFzdElEID0gcmVxdWlyZSgnLi4vdXRpbHMvZWwyTWFzdElEJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY29sbGVjdFRlbXBsYXRlc0Zyb21TY3JpcHRUYWdzKCkge1xuXHR2YXIgdGVtcGxhdGVzID0ge307XG5cblx0JCgnc2NyaXB0W3R5cGU9XCJ0ZXh0L3RlbXBsYXRlXCJdJykuZWFjaChmdW5jdGlvbiAoaSwgZWwpIHtcblx0XHR2YXIgaWQgPSBlbDJNYXN0SUQoZWwsIHRydWUpO1xuXHRcdHRlbXBsYXRlc1tpZF0gPSAkKGVsKS5odG1sKCk7XG5cblx0XHQvLyBTdHJpcCB3aGl0ZXNwYWNlIGxlZnRvdmVyIGZyb20gc2NyaXB0IHRhZ3Ncblx0XHR0ZW1wbGF0ZXNbaWRdID0gdGVtcGxhdGVzW2lkXS5yZXBsYWNlKC9eXFxzKy8sJycpO1xuXHRcdHRlbXBsYXRlc1tpZF0gPSB0ZW1wbGF0ZXNbaWRdLnJlcGxhY2UoL1xccyskLywnJyk7XG5cblx0XHQvLyBSZW1vdmUgZnJvbSBET01cblx0XHQkKGVsKS5yZW1vdmUoKTtcblx0fSk7XG5cblx0cmV0dXJuIHRlbXBsYXRlcztcbn07XG4iLCIvKipcbiAqIFRoaXMgaXMgdGhlIHN0YXJ0aW5nIHBvaW50IHRvIHlvdXIgYXBwbGljYXRpb24uICBZb3Ugc2hvdWxkIGdyYWIgdGVtcGxhdGVzIGFuZCBjb21wb25lbnRzXG4gKiBiZWZvcmUgY2FsbGluZyBGUkFNRVdPUksucmFpc2UoKSB1c2luZyBzb21ldGhpbmcgbGlrZSBSZXF1aXJlLmpzLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG5cdFx0ZGF0YTogeyBhdXRoZW50aWNhdGVkOiBmYWxzZSB9LFxuXHRcdHRlbXBsYXRlczogeyBjb21wb25lbnROYW1lOiBIVE1MT3JQcmVjb21waWxlZEZuIH0sXG5cdFx0Y29tcG9uZW50czogeyBjb21wb25lbnROYW1lOiBDb21wb25lbnREZWZpbml0aW9uIH1cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNiXG4gKi9cblxudmFyIExvZ2dlciA9IHJlcXVpcmUoJy4uL2xvZ2dlci9pbmRleCcpO1xudmFyIGJ1aWxkQ29tcG9uZW50RGVmaW5pdGlvbiA9IHJlcXVpcmUoJy4uL2RlZmluZS9idWlsZERlZmluaXRpb24nKTtcbnZhciBidWlsZENvbXBvbmVudFByb3RvdHlwZSA9IHJlcXVpcmUoJy4vYnVpbGRQcm90b3R5cGUnKTtcbnZhciBjb2xsZWN0VGVtcGxhdGVzRnJvbVNjcmlwdFRhZ3MgPSByZXF1aXJlKCcuL2NvbGxlY3RUZW1wbGF0ZXNGcm9tU2NyaXB0VGFncycpO1xudmFyIGNvbGxlY3RSZWdpb25zID0gcmVxdWlyZSgnLi9jb2xsZWN0UmVnaW9ucycpO1xudmFyIHNldHVwUm91dGVyID0gcmVxdWlyZSgnLi4vcm91dGVyL2luZGV4Jyk7XG5cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByYWlzZShvcHRpb25zLCBjYikge1xuXG5cdC8vIElmIG9ubHkgb25lIGFyZyBpcyBwcmVzZW50LCB1c2Ugb3B0aW9ucyBhcyBjYWxsYmFjayBpZiBwb3NzaWJsZS5cblx0Ly8gSWYgb3B0aW9ucyBhcmUgbm90IGRlZmluZWQsIHVzZSBhbiBlbXB0eSBvYmplY3QuXG5cdGlmICghY2IgJiYgXy5pc0Z1bmN0aW9uKG9wdGlvbnMpKSB7XG5cdFx0Y2IgPSBvcHRpb25zO1xuXHR9XG5cdGlmICghXy5pc1BsYWluT2JqZWN0KG9wdGlvbnMpKSB7XG5cdFx0b3B0aW9ucyA9IHt9O1xuXHR9XG5cblx0Ly8gSW50ZXJwcmV0IGBwcm9kdWN0aW9uYCBhcyBgbG9nTGV2ZWwgPT09ICdzaWxlbnQnYFxuXHRpZiAoRlJBTUVXT1JLLm9wdGlvbnMucHJvZHVjdGlvbikge1xuXHRcdEZSQU1FV09SSy5vcHRpb25zLmxvZ0xldmVsID0gJ3NpbGVudCc7XG5cdH1cblxuXHQvLyBJbml0aWFsaXplIGxvZ2dlclxuXHRuZXcgTG9nZ2VyKCk7XG5cblx0Ly8gTWVyZ2UgZGF0YSBpbnRvIEZSQU1FV09SSy5kYXRhXG5cdF8uZXh0ZW5kKEZSQU1FV09SSy5kYXRhLCBvcHRpb25zLmRhdGEgfHwge30pO1xuXG5cdC8vIE1lcmdlIHNwZWNpZmllZCB0ZW1wbGF0ZXMgd2l0aCBGUkFNRVdPUksudGVtcGxhdGVzXG5cdF8uZXh0ZW5kKEZSQU1FV09SSy50ZW1wbGF0ZXMsIG9wdGlvbnMudGVtcGxhdGVzIHx8IHt9KTtcblxuXHQvLyBJZiBGUkFNRVdPUksuZGVmaW5lKCkgd2FzIHVzZWQsIGJ1aWxkIHRoZSBsaXN0IG9mIGNvbXBvbmVudHNcblx0Ly8gSXRlcmF0ZSB0aHJvdWdoIHRoZSBkZWZpbmUgcXVldWUgYW5kIGNyZWF0ZSBlYWNoIGRlZmluaXRpb25cblx0Xy5lYWNoKEZSQU1FV09SSy5fZGVmaW5lUXVldWUsIGJ1aWxkQ29tcG9uZW50RGVmaW5pdGlvbik7XG5cblx0Ly8gTWVyZ2Ugc3BlY2lmaWVkIGNvbXBvbmVudHMgdy8gRlJBTUVXT1JLLmNvbXBvbmVudHNcblx0Xy5leHRlbmQoRlJBTUVXT1JLLmNvbXBvbmVudHMsIG9wdGlvbnMuY29tcG9uZW50cyB8fCB7fSk7XG5cblx0Ly8gQmFjayB1cCBlYWNoIGNvbXBvbmVudCBkZWZpbml0aW9uIGJlZm9yZSB0cmFuc2Zvcm1pbmcgaXQgaW50byBhIGxpdmUgcHJvdG90eXBlXG5cdEZSQU1FV09SSy5jb21wb25lbnREZWZzID0gXy5jbG9uZShGUkFNRVdPUksuY29tcG9uZW50cyk7XG5cblx0Ly8gUnVuIHRoaXMgY2FsbCBiYWNrIHdoZW4gdGhlIERPTSBpcyByZWFkeVxuXHQkKGZ1bmN0aW9uICgpIHtcblxuXHRcdC8vIENvbGxlY3QgYW55IDxzY3JpcHQ+IHRhZyB0ZW1wbGF0ZXMgb24gdGhlIHBhZ2Vcblx0XHQvLyBhbmQgYWJzb3JiIHRoZW0gaW50byBGUkFNRVdPUksudGVtcGxhdGVzXG5cdFx0Xy5leHRlbmQoRlJBTUVXT1JLLnRlbXBsYXRlcywgY29sbGVjdFRlbXBsYXRlc0Zyb21TY3JpcHRUYWdzKCkpO1xuXG5cdFx0Ly8gQnVpbGQgYWN0dWFsIHByb3RvdHlwZXMgZm9yIHRoZSBjb21wb25lbnRzXG5cdFx0Ly8gKG5lZWQgdGhlIHRlbXBsYXRlcyBhdCB0aGlzIHBvaW50IHRvIG1ha2UgdGhpcyB3b3JrKVxuXHRcdF8uZWFjaChGUkFNRVdPUksuY29tcG9uZW50cywgYnVpbGRDb21wb25lbnRQcm90b3R5cGUpO1xuXG5cdFx0Ly8gR3JhYiBpbml0aWFsIHJlZ2lvbnMgZnJvbSBET01cblx0XHRjb2xsZWN0UmVnaW9ucygpO1xuXG5cdFx0Ly8gQmluZCBnbG9iYWwgRE9NIGV2ZW50cyBhcyBGUkFNRVdPUksgZXZlbnRzXG5cdFx0Ly8gKGUuZy4gJXdpbmRvdzpyZXNpemUpXG5cdFx0dmFyIHRyaWdnZXJSZXNpemVFdmVudCA9IF8uZGVib3VuY2UoZnVuY3Rpb24gKCkge1xuXHRcdFx0RlJBTUVXT1JLLnRyaWdnZXIoJyV3aW5kb3c6cmVzaXplJyk7XG5cdFx0fSwgRlJBTUVXT1JLLm9wdGlvbnMudGhyb3R0bGVXaW5kb3dSZXNpemUgfHwgMCk7XG5cdFx0JCh3aW5kb3cpLnJlc2l6ZSh0cmlnZ2VyUmVzaXplRXZlbnQpO1xuXHRcdC8vIFRPRE86IGFkZCBtb3JlIGV2ZW50cyBhbmQgZXh0cmFwb2xhdGUgdGhpcyBsb2dpYyB0byBhIHNlcGFyYXRlIG1vZHVsZVxuXG5cdFx0Ly8gRG8gdGhlIGluaXRpYWwgcm91dGluZyBzZXF1ZW5jZVxuXHRcdC8vIExvb2sgYXQgdGhlICNmcmFnbWVudCB1cmwgYW5kIGZpcmUgdGhlIGdsb2JhbCByb3V0ZSBldmVudFxuXHRcdHNldHVwUm91dGVyKCk7XG5cdFx0RlJBTUVXT1JLLmhpc3Rvcnkuc3RhcnQoXy5kZWZhdWx0cyh7XG5cdFx0XHRwdXNoU3RhdGU6IHVuZGVmaW5lZCxcblx0XHRcdGhhc2hDaGFuZ2U6IHVuZGVmaW5lZCxcblx0XHRcdHJvb3Q6IHVuZGVmaW5lZFxuXHRcdH0sIG9wdGlvbnMpKTtcblxuXHRcdGlmIChjYikgY2IoKTtcblx0fSk7XG59O1xuIiwiLyoqXG4gKiBBcHBlbmQgYSBjb21wb25lbnQgdG8gdGhlIGVuZCBvZiBhIHJlZ2lvbi4gVGhpcyBjYWxscyBpbnNlcnQgYXQgdGhlIGxhc3QgcG9zaXRpb24uXG4gKlxuICogQHBhcmFtICB7U3RyaW5nfSBjb21wb25lbnRJZCBbVGhlIGNvbXBvbmVudCBpZCB0aGF0IHdlIHdhbnQgdG8gYXBwZW5kXVxuICogQHBhcmFtICB7T2JqZWN0fSBwcm9wZXJ0aWVzICBbUHJvcGVydGllcyB0byBpbnN0YW50aWF0ZSB0aGUgY29tcG9uZW50IHdpdGhdXG4gKlxuICogQHJldHVybiB7Q29tcG9uZW50fSAgICAgICAgICBbTmV3bHkgYXBwZW5kZWQgQ29tcG9uZW50XVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGFwcGVuZChjb21wb25lbnRJZCwgcHJvcGVydGllcykge1xuXHQvLyBJbnNlcnQgYXQgbGFzdCBwb3NpdGlvblxuXHRyZXR1cm4gdGhpcy5pbnNlcnQodGhpcy5fY2hpbGRyZW4ubGVuZ3RoLCBjb21wb25lbnRJZCwgcHJvcGVydGllcyk7XG59O1xuIiwiLyoqXG4gKiBTaG9ydGN1dCBmb3IgY2FsbGluZyBlbXB0eSgpIGFuZCB0aGVuIGFwcGVuZCgpLFxuICogVGhpcyBpcyB0aGUgZ2VuZXJhbCB1c2UgY2FzZSBmb3IgbWFuYWdpbmcgc3ViY29tcG9uZW50c1xuICogKGUuZy4gd2hlbiBhIG5hdmJhciBpdGVtIGlzIHRvdWNoZWQpXG4gKlxuICogQHBhcmFtICB7U3RyaW5nfSBjb21wb25lbnQgIFtUaGUgaWQgbmFtZSBvZiB0aGUgY29tcG9uZXQgdGhhdCB5b3Ugd2FudCB0byBhdHRhY2hdXG4gKiBAcGFyYW0gIHtPYmplY3R9IHByb3BlcnRpZXMgW1Byb3BlcnRpZXMgdGhhdCB0aGUgYXR0YWNoZWQgY29tcG9uZW50IHdpbGwgYmUgaW5pdGFsaXplZCB3aXRoXVxuICpcbiAqIEByZXR1cm4ge0NvbXBvbmVudH0gXHRcdFx0XHQgW05ld2x5IGF0dGFjaGVkIGNvbXBvbmVudF1cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBhdHRhY2goY29tcG9uZW50LCBwcm9wZXJ0aWVzKSB7XG5cdHRoaXMuZW1wdHkoKTtcblx0cmV0dXJuIHRoaXMuYXBwZW5kKGNvbXBvbmVudCwgcHJvcGVydGllcyk7XG59O1xuIiwiLyoqXG4gKiByZWdpb24uZW1wdHkoIClcbiAqXG4gKiBJdGVyYXRlIG92ZXIgZWFjaCBjb21wb25lbnQgaW4gdGhpcyByZWdpb24gYW5kIGNhbGwgLmNsb3NlKCkgb24gaXRcbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBlbXB0eSgpIHtcblx0RlJBTUVXT1JLLmRlYnVnKHRoaXMucGFyZW50LmlkICsgJyA6OiBFbXB0eWluZyByZWdpb246ICcgKyB0aGlzLmlkKTtcblx0d2hpbGUgKHRoaXMuX2NoaWxkcmVuLmxlbmd0aCA+IDApIHtcblx0XHR0aGlzLnJlbW92ZSgwKTtcblx0fVxufTtcbiIsIi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llc1xuICovXG52YXIgZWwyTWFzdElEID0gcmVxdWlyZSgnLi4vdXRpbHMvZWwyTWFzdElEJyksXG5cdGVsMkRlZmF1bHRUZW1wbGF0ZUlEID0gcmVxdWlyZSgnLi4vdXRpbHMvZWwyRGVmYXVsdFRlbXBsYXRlSUQnKTtcblxuXG5cbi8qKlxuICogRmFjdG9yeSBtZXRob2QgdG8gZ2VuZXJhdGUgYSBuZXcgcmVnaW9uIGluc3RhbmNlIGZyb20gYSBET00gZWxlbWVudFxuICogQWxzbyBpbXBsZW1lbnRzIGB0ZW1wbGF0ZWAgYW5kIGBjb3VudGAgZGlyZWN0aXZlcywgYXMgd2VsbCBhcyBzdXBwb3J0XG4gKiBmb3IgZW1iZWRkZWQgdGVtcGxhdGVzIGJ5IGNoZWNraW5nIGBlbGAncyBpbm5lckhUTUwuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnNcbiAqIEByZXR1cm5zIHJlZ2lvbiBpbnN0YW5jZVxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZnJvbUVsZW1lbnQoZWwsIHBhcmVudCkge1xuXG5cdC8vIElmIHBhcmVudCBpcyBub3Qgc3BlY2lmaWVkLCBtYWtlLWJlbGlldmUuXG5cdHBhcmVudCA9IHBhcmVudCB8fCB7IGlkOiAnKicgfTtcblxuXHR2YXIgJGVsID0gJChlbCk7XG5cblxuXHQvLyBCdWlsZCByZWdpb25cblx0dmFyIHJlZ2lvbiA9IG5ldyBGUkFNRVdPUksuUmVnaW9uKHtcblx0XHRpZDogZWwyTWFzdElEKGVsKSxcblx0XHQkZWw6ICRlbCxcblx0XHRwYXJlbnQ6IHBhcmVudFxuXHR9KTtcblxuXHR2YXIgZW1iZWRkZWRDb21wb25lbnQgPSByZWdpb24uZW1iZWRkZWRDb21wb25lbnQ7XG5cblxuXHQvLyBJZiBgdGVtcGxhdGVgIHNob3J0Y3V0IGlzIGVuYWJsZWQsIGFwcGVuZCBzcGVjaWZpZWQgc3ViLWNvbXBvbmVudChzKVxuXHQvLyB0byB0aGUgcmVnaW9uIGF1dG9tYXRpY2FsbHlcblx0aWYgKCBGUkFNRVdPUksub3B0aW9ucy5zaG9ydGN1dC50ZW1wbGF0ZSAmJiBlbWJlZGRlZENvbXBvbmVudCApIHtcblxuXHRcdC8vIElmIGBjb3VudGAgaXMgc2V0LCByZW5kZXIgc3ViLWNvbXBvbmVudCBzcGVjaWZpZWQgbnVtYmVyIG9mIHRpbWVzLlxuXHRcdC8vIGUuZy4gPHJlZ2lvbiB0ZW1wbGF0ZT1cIkZvb1wiIGNvdW50PVwiM1wiIC8+XG5cdFx0Ly9cblx0XHQvLyAoTm90ZSB0aGF0IGlmIHRoZSBgY291bnRgIHNob3J0Y3V0IGlzIGRpc2FibGVkLCBgY291bnRgIGlzIGFsd2F5cyA9IDEpXG5cdFx0dmFyIGNvdW50O1xuXHRcdGlmIChGUkFNRVdPUksub3B0aW9ucy5zaG9ydGN1dC5jb3VudCkge1xuXHRcdFx0Y291bnQgPSAodHlwZW9mICRlbC5hdHRyKCdjb3VudCcpICE9PSAndW5kZWZpbmVkJykgPyAkZWwuYXR0cignY291bnQnKSA6IDE7XG5cdFx0fVxuXG5cdFx0Ly8gQXBwZW5kIHRoZSBzdWJjb21wb25lbnQgdGhlIGFwcHJvcHJpYXRlICMgb2YgdGltZXMuXG5cdFx0Zm9yICh2YXIgaT0wOyBpIDwgY291bnQ7IGkrKyApIHtcblx0XHRcdHJlZ2lvbi5hcHBlbmQoZW1iZWRkZWRDb21wb25lbnQpO1xuXHRcdH1cblxuXHRcdEZSQU1FV09SSy5kZWJ1Zyhcblx0XHRcdHBhcmVudC5pZCArICcgOi06IEluc3RhbnRpYXRlZMKgbmV3IHJlZ2lvbicgK1xuXHRcdFx0KCByZWdpb24uaWQgPyAnIGAnICsgcmVnaW9uLmlkICsgJ2AnIDogJycgKSArXG5cdFx0XHQoIGVtYmVkZGVkQ29tcG9uZW50ID8gJyBhbmQgcG9wdWxhdGVkIGl0IHdpdGgnICtcblx0XHRcdFx0KCBjb3VudCA+IDEgPyBjb3VudCArICcgaW5zdGFuY2VzIG9mJyA6ICcgMScgKSArXG5cdFx0XHRcdCcgYCcgKyBlbWJlZGRlZENvbXBvbmVudCArICdgJyA6ICcnXG5cdFx0XHQpICsgJy4nXG5cdFx0KTtcblx0fVxuXG5cdHJldHVybiByZWdpb247XG59O1xuIiwiLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzXG4gKi9cblxudmFyIGluc2VydCA9IHJlcXVpcmUoJy4vaW5zZXJ0JyksXG5cdHJlbW92ZSA9IHJlcXVpcmUoJy4vcmVtb3ZlJyksXG5cdGVtcHR5ID0gcmVxdWlyZSgnLi9lbXB0eScpLFxuXHRhcHBlbmQgPSByZXF1aXJlKCcuL2FwcGVuZCcpLFxuXHRhdHRhY2ggPSByZXF1aXJlKCcuL2F0dGFjaCcpLFxuXHRwcmVwZW5kID0gcmVxdWlyZSgnLi9wcmVwZW5kJyksXG5cdGZyb21FbGVtZW50ID0gcmVxdWlyZSgnLi9mcm9tRWxlbWVudCcpLFxuXHRlbDJEZWZhdWx0VGVtcGxhdGVJRCA9IHJlcXVpcmUoJy4uL3V0aWxzL2VsMkRlZmF1bHRUZW1wbGF0ZUlEJyk7XG5cblxuLyoqXG4gKiBGUkFNRVdPUksuUmVnaW9uXG4gKlxuICogQHBhcmFtICB7T2JqZWN0fSBwcm9wZXJ0aWVzXG4gKlxuICogQGNvbnN0cnVjdG9yXG4gKi9cblxudmFyIFJlZ2lvbiA9IG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcmVnaW9uKHByb3BlcnRpZXMpIHtcblxuXHRfLmV4dGVuZCh0aGlzLCBGUkFNRVdPUksuRXZlbnRzKTtcblxuXHRpZiAoIXByb3BlcnRpZXMpIHtcblx0XHRwcm9wZXJ0aWVzID0ge307XG5cdH1cblx0aWYgKCFwcm9wZXJ0aWVzLiRlbCkge1xuXHRcdHRocm93IG5ldyBFcnJvcignVHJ5aW5nIHRvIGluc3RhbnRpYXRlIHJlZ2lvbiB3aXRoIG5vICRlbCEnKTtcblx0fVxuXG5cdC8vIEZvbGQgaW4gcHJvcGVydGllcyB0byBwcm90b3R5cGVcblx0Xy5leHRlbmQodGhpcywgcHJvcGVydGllcyk7XG5cblx0Ly8gSWYgdGhlIHJlZ2lvbiBoYXMgYSBjb21wb25lbnQvdGVtcGxhdGUgaWRlbnRpZmllciwgKGUuZy4gPHJlZ2lvbiB0ZW1wbGF0ZT1cIkZvb1wiIC8+KVxuXHQvLyB3ZSdsbCB1c2UgdGhhdCBhcyB0aGUgYGVtYmVkZGVkQ29tcG9uZW50YC5cblx0dGhpcy5lbWJlZGRlZENvbXBvbmVudCA9IGVsMkRlZmF1bHRUZW1wbGF0ZUlEKHRoaXMuJGVsWzBdKTtcblxuXHQvLyBOZXh0LCBjaGVjayBpZiB0aGUgcmVnaW9uIGhhcyBhbnkgZW1iZWRkZWQgSFRNTC5cblx0dmFyIGVtYmVkZGVkVGVtcGxhdGUgPSB0aGlzLiRlbC5odG1sKCk7XG5cblx0Ly8gVHJpbSB3aGl0ZXNwYWNlIGZyb20gZW1iZWRkZWQgdGVtcGxhdGUgaW4gY2FzZSBpdCB3YXMgaW5jbHVkZWQgYnkgYWNjaWRlbnQuXG5cdGVtYmVkZGVkVGVtcGxhdGUgPSBlbWJlZGRlZFRlbXBsYXRlICYmIGVtYmVkZGVkVGVtcGxhdGUucmVwbGFjZSgvXlxccysvLCAnJyk7XG5cdGVtYmVkZGVkVGVtcGxhdGUgPSBlbWJlZGRlZFRlbXBsYXRlICYmIGVtYmVkZGVkVGVtcGxhdGUucmVwbGFjZSgvXFxzKyQvLCAnJyk7XG5cblx0Ly8gSW5zdGFudGlhdGUgYW4gYW5vbnltb3VzIGNvbXBvbmVudCBmb3IgdGhlIGVtYmVkZGVkIHRlbXBsYXRlLlxuXHRpZiAoZW1iZWRkZWRUZW1wbGF0ZSkge1xuXG5cdFx0Ly8gV2lwZSB0aGUgZW1iZWRkZWQgSFRNTCBmcm9tIHRoZSBET00uXG5cdFx0Ly8gTk9URTogdGhpcyBzdGVwIGNvdWxkIGJlIG9taXR0ZWQsIGJ1dCBsZWF2aW5nIGl0IGluIG5vdyBmb3Igc2FmZXR5LlxuXHRcdHRoaXMuJGVsLmVtcHR5KCk7XG5cblx0XHQvLyAobWF5YmUgbGF0ZXIpIFRPRE86XG5cdFx0Ly8gYWxsb3cgZW1iZWRkZWQgdGVtcGxhdGVzIHRvIGJlIG5hbWVkIHRoaXMgd2F5LCBlLmcuIGA8cmVnaW9uIHRlbXBsYXRlPVwiRm9vXCI+PC9yZWdpb24+YFxuXHRcdC8vIChzaG91bGQgYmUgdmVyeSBlYXN5KVxuXHRcdC8vXG5cdFx0Ly8gaWQ6IHRoaXMuZW1iZWRkZWRDb21wb25lbnQsXG5cblx0XHQvLyBFeHRlbmQgYSBjb21wb25lbnQgcHJvdG90eXBlLCB0aGVuIGluc3RhbnRpYXRlIHRoZSBjb21wb25lbnQsXG5cdFx0Ly8gYnV0IGRvbid0IHJlbmRlciB5ZXQuICBJdCdzIGFscmVhZHkgcmVuZGVyZWQsIG1vc3RseSEgKGV4Y2VwdCBmb3IgSVRTIHJlZ2lvbnMpXG5cdFx0Ly8gV2UnbGwgdXNlIHRoaXMgYW5vbnltb3VzIGNvbXBvbmVudCBpbnN0YW5jZSBhcyBvdXIgYGVtYmVkZGVkQ29tcG9uZW50YCBmb3IgdGhpc1xuXHRcdC8vIHJlZ2lvbi5cblx0XHR0aGlzLmVtYmVkZGVkQ29tcG9uZW50ID0gbmV3IChcblx0XHRcdEZSQU1FV09SSy5Db21wb25lbnQuZXh0ZW5kKHtcblx0XHRcdFx0dGVtcGxhdGU6IGVtYmVkZGVkVGVtcGxhdGVcblx0XHRcdH0pXG5cdFx0KShwcm9wZXJ0aWVzKTtcblxuXHR9XG5cblx0Ly8gSWYgbmVpdGhlciBhbiBpZCBub3IgYSBgdGVtcGxhdGVgIHdhcyBzcGVjaWZpZWQsXG5cdC8vIHdlJ2xsIHRocm93IGFuIGVycm9yLCBzaW5jZSB0aGVyZSdzIG5vIHdheSB0byBnZXQgYSBob2xkIG9mIHRoZSByZWdpb25cblx0aWYgKCAhdGhpcy5pZCAmJiAhdGhpcy5lbWJlZGRlZENvbXBvbmVudCApIHtcblxuXHRcdHRocm93IG5ldyBFcnJvcihcblx0XHRcdHRoaXMucGFyZW50LmlkICsgJyA6OiBBIHJlZ2lvbiBpZGVudGlmaWVyIChlLmcuIGBkYXRhLXJlZ2lvbj1cImZvb1wiYCkgbWF5ICcgK1xuXHRcdFx0J29ubHkgYmUgb21pdHRlZCBpZiBhIGRlZmF1bHQgdGVtcGxhdGUgaXMgc3BlY2lmaWVkLCBlLmcuOlxcbicgK1xuXHRcdFx0J2UuZy4gPHJlZ2lvbiB0ZW1wbGF0ZT1cIlNvbWVDb21wb25lbnRcIj48L3JlZ2lvbj4nXG5cdFx0KTtcblx0fVxuXG5cdC8vIFNldCB1cCBsaXN0IHRvIGhvdXNlIGNoaWxkIGNvbXBvbmVudHNcblx0dGhpcy5fY2hpbGRyZW4gPSBbXTtcblxuXHRfLmJpbmRBbGwodGhpcyk7XG5cblx0Ly8gU2V0IHVwIGNvbnZlbmllbmNlIGFjY2VzcyB0byB0aGlzIHJlZ2lvbiBpbiB0aGUgZ2xvYmFsIHJlZ2lvbiBjYWNoZVxuXHRGUkFNRVdPUksucmVnaW9uc1t0aGlzLmlkXSA9IHRoaXM7XG59O1xuXG5SZWdpb24uZnJvbUVsZW1lbnQgPSBmdW5jdGlvbihlbCwgcGFyZW50KSB7XG5cdHJldHVybiBmcm9tRWxlbWVudChlbCwgcGFyZW50KTtcbn07XG5SZWdpb24ucHJvdG90eXBlLnJlbW92ZSA9IGZ1bmN0aW9uKGF0SW5kZXgpIHtcblx0cmV0dXJuIHJlbW92ZS5jYWxsKHRoaXMsIGF0SW5kZXgpO1xufTtcblJlZ2lvbi5wcm90b3R5cGUuZW1wdHkgPSBmdW5jdGlvbigpIHtcblx0cmV0dXJuIGVtcHR5LmNhbGwodGhpcyk7XG59O1xuUmVnaW9uLnByb3RvdHlwZS5pbnNlcnQgPSBmdW5jdGlvbihhdEluZGV4LCBjb21wb25lbnRJZCwgcHJvcGVydGllcykge1xuXHRyZXR1cm4gaW5zZXJ0LmNhbGwodGhpcywgYXRJbmRleCwgY29tcG9uZW50SWQsIHByb3BlcnRpZXMpO1xufTtcblJlZ2lvbi5wcm90b3R5cGUuYXBwZW5kID0gZnVuY3Rpb24oY29tcG9uZW50SWQsIHByb3BlcnRpZXMpIHtcblx0cmV0dXJuIGFwcGVuZC5jYWxsKHRoaXMsIGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKTtcbn07XG5SZWdpb24ucHJvdG90eXBlLmF0dGFjaCA9IGZ1bmN0aW9uKGNvbXBvbmVudCwgcHJvcGVydGllcykge1xuXHRyZXR1cm4gYXR0YWNoLmNhbGwodGhpcywgY29tcG9uZW50LCBwcm9wZXJ0aWVzKTtcbn07XG5SZWdpb24ucHJvdG90eXBlLnByZXBlbmQgPSBmdW5jdGlvbihjb21wb25lbnRJZCwgcHJvcGVydGllcykge1xuXHRyZXR1cm4gcHJlcGVuZC5jYWxsKHRoaXMsIGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKTtcbn07XG4iLCIvKipcbiAqIHJlZ2lvbi5pbnNlcnQoIGF0SW5kZXgsIGNvbXBvbmVudElkLCBbcHJvcGVydGllc10gKVxuICpcbiAqIFRPRE86IHN1cHBvcnQgYSBsaXN0IG9mIHByb3BlcnRpZXMgb2JqZWN0cyBpbiBsaWV1IG9mIHRoZSBwcm9wZXJ0aWVzIG9iamVjdFxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaW5zZXJ0KGF0SW5kZXgsIGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKSB7XG5cblx0dmFyIGVyciA9ICcnO1xuXHRpZiAoIShhdEluZGV4IHx8IF8uaXNGaW5pdGUoYXRJbmRleCkpKSB7XG5cdFx0ZXJyICs9IHRoaXMuaWQgKyAnLmluc2VydCgpIDo6IE5vIGF0SW5kZXggc3BlY2lmaWVkISc7XG5cdH1cblx0ZWxzZSBpZiAoIWNvbXBvbmVudElkKSB7XG5cdFx0ZXJyICs9IHRoaXMuaWQgKyAnLmluc2VydCgpIDo6IE5vIGNvbXBvbmVudElkIHNwZWNpZmllZCEnO1xuXHR9XG5cdGlmIChlcnIpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoZXJyICsgJ1xcblVzYWdlOiBpbnNlcnQoYXRJbmRleCwgY29tcG9uZW50SWQsIFtwcm9wZXJ0aWVzXSknKTtcblx0fVxuXG5cdHZhciBjb21wb25lbnQ7XG5cdC8vIElmIGNvbXBvbmVudElkIGlzIGEgc3RyaW5nLCBsb29rIHVwIGNvbXBvbmVudCBwcm90b3R5cGUgYW5kIGluc3RhdGlhdGVcblx0aWYgKCdzdHJpbmcnID09IHR5cGVvZiBjb21wb25lbnRJZCkge1xuXG5cdFx0dmFyIGNvbXBvbmVudFByb3RvdHlwZSA9IEZSQU1FV09SSy5jb21wb25lbnRzW2NvbXBvbmVudElkXTtcblxuXHRcdGlmICghY29tcG9uZW50UHJvdG90eXBlKSB7XG5cdFx0XHR2YXIgdGVtcGxhdGUgPSBGUkFNRVdPUksudGVtcGxhdGVzW2NvbXBvbmVudElkXTtcblx0XHRcdGlmICghdGVtcGxhdGUpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yICgnSW4gJyArXG5cdFx0XHRcdFx0KHRoaXMuaWQgfHwgJ0Fub255bW91cyByZWdpb24nKSArICc6OiBUcnlpbmcgdG8gaW5zZXJ0ICcgK1xuXHRcdFx0XHRcdGNvbXBvbmVudElkICsgJywgYnV0IG5vIHRlbXBsYXRlIGV4aXN0cyB3aXRoIHRoYXQgaWQuJyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIElmIG5vIGNvbXBvbmVudCBwcm90b3R5cGUgZXhpc3RzIGZvciB0aGUgdGVtcGxhdGVcblx0XHRcdC8vIHdpdGggdGhlIHNwZWNpZmlmZWQgaWQsIGNyZWF0ZSBhIHN0dWIgb25lIG9uIHRoZSBmbHkuXG5cdFx0XHRjb21wb25lbnRQcm90b3R5cGUgPSBGUkFNRVdPUksuQ29tcG9uZW50LmV4dGVuZCh7XG5cdFx0XHRcdGlkOiBjb21wb25lbnRJZCxcblx0XHRcdFx0dGVtcGxhdGU6IHRlbXBsYXRlXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBJbnN0YW50aWF0ZSBhbmQgcmVuZGVyIHRoZSBjb21wb25lbnQgaW5zaWRlIHRoaXMgcmVnaW9uXG5cdFx0Y29tcG9uZW50ID0gbmV3IGNvbXBvbmVudFByb3RvdHlwZShfLmV4dGVuZCh7XG5cdFx0XHQkb3V0bGV0OiB0aGlzLiRlbFxuXHRcdH0sIHByb3BlcnRpZXMgfHwge30pKTtcblxuXG5cdH1cblxuXHQvLyBPdGhlcndpc2UgYXNzdW1lIGFuIGluc3RhbnRpYXRlZCBjb21wb25lbnQgb2JqZWN0IHdhcyBzZW50XG5cdC8qIFRPRE86IENoZWNrIHRoYXQgY29tcG9uZW50IG9iamVjdCBpcyB2YWxpZCAqL1xuXHRlbHNlIHtcblx0XHRjb21wb25lbnQgPSBjb21wb25lbnRJZDtcblx0XHRjb21wb25lbnQuJG91dGxldCA9IHRoaXMuJGVsO1xuXHR9XG5cblx0Ly8gU2F2ZSByZWZlcmVuY2UgdG8gcGFyZW50UmVnaW9uXG5cdGNvbXBvbmVudC5wYXJlbnRSZWdpb24gPSB0aGlzO1xuXG5cdC8vIENoZWNrIHRvIHNlZSBpZiB0aGUgbW9kZWwgd2FzIGFscmVhZHkgZGVmaW5lZC4gSWYgaXQgaXMsIHVzZSB0aGF0IG1vZGVsLiBJZiBub3QsIGFzc2lnbiBpdFxuXHQvLyB0aGUgcGFyZW50cyBtb2RlbCBpZiBpdCBoYXMgb25lLCBvciBhc3NpZ24gaXQgYSBuZXcgYmFja2JvbmUgaW5zdGFuY2UuXG5cdGlmICghY29tcG9uZW50Lm1vZGVsKSB7XG5cdFx0Y29tcG9uZW50Lm1vZGVsID0gdGhpcy5wYXJlbnQubW9kZWwgPyB0aGlzLnBhcmVudC5tb2RlbCA6IG5ldyBCYWNrYm9uZS5Nb2RlbCgpO1xuXHR9XG5cblx0Ly8gUmVuZGVyIGNvbXBvbmVudCBpbnRvIHRoaXMgcmVnaW9uXG5cdGNvbXBvbmVudC5yZW5kZXIoYXRJbmRleCk7XG5cblx0Ly8gQW5kIGtlZXAgdHJhY2sgb2YgaXQgaW4gdGhlIGxpc3Qgb2YgdGhpcyByZWdpb24ncyBjaGlsZHJlblxuXHR0aGlzLl9jaGlsZHJlbi5zcGxpY2UoYXRJbmRleCwgMCwgY29tcG9uZW50KTtcblxuXHQvLyBMb2cgZm9yIGRlYnVnZ2luZyBgY291bnRgIGRlY2xhcmF0aXZlXG5cdHZhciBkZWJ1Z1N0ciA9IHRoaXMucGFyZW50LmlkICsgJyA6OiBJbnNlcnRlZCAnICsgY29tcG9uZW50SWQgKyAnIGludG8gJztcblx0aWYgKHRoaXMuaWQpIGRlYnVnU3RyICs9ICdyZWdpb246ICcgKyB0aGlzLmlkICsgJyBhdCBpbmRleCAnICsgYXRJbmRleDtcblx0ZWxzZSBkZWJ1Z1N0ciArPSAnYW5vbnltb3VzIHJlZ2lvbiBhdCBpbmRleCAnICsgYXRJbmRleDtcblx0RlJBTUVXT1JLLnZlcmJvc2UoZGVidWdTdHIpO1xuXG5cdHJldHVybiBjb21wb25lbnQ7XG5cbn07XG4iLCIvKipcbiAqIFByZXBlbmQgYSBjb21wb25lbnQgdG8gdGhlIGJlZ2lubmluZyBvZiBhIHJlZ2lvbi4gVGhpcyBjYWxscyBpbnNlcnQgYXQgdGhlIGZpcnN0IHBvc2l0aW9uLlxuICpcbiAqIEBwYXJhbSAge1N0cmluZ30gY29tcG9uZW50SWQgW1RoZSBjb21wb25lbnQgaWQgdGhhdCB3ZSB3YW50IHRvIHByZXBlbmQgXVxuICogQHBhcmFtICB7T2JqZWN0fSBwcm9wZXJ0aWVzICBbUHJvcGVydGllcyB0byBpbnN0YW50aWF0ZSB0aGUgY29tcG9uZW50IHdpdGhdXG4gKlxuICogQHJldHVybiB7Q29tcG9uZW50fSAgICAgICAgICBbTmV3bHkgcHJlcGVuZGVkIENvbXBvbmVudF1cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBwcmVwZW5kKGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKSB7XG5cdC8vIEluc2VydCBhdCBsYXN0IHBvc2l0aW9uXG5cdHJldHVybiB0aGlzLmluc2VydCgwLCBjb21wb25lbnRJZCwgcHJvcGVydGllcyk7XG59O1xuIiwiLyoqXG4gKiByZWdpb24ucmVtb3ZlKCBhdEluZGV4IClcbiAqXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcmVtb3ZlKGF0SW5kZXgpIHtcblxuXHRpZiAoIWF0SW5kZXggJiYgIV8uaXNGaW5pdGUoYXRJbmRleCkpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IodGhpcy5pZCArICcucmVtb3ZlKCkgOjogTm8gYXRJbmRleCBzcGVjaWZpZWQhIFxcblVzYWdlOiByZW1vdmUoYXRJbmRleCknKTtcblx0fVxuXG5cdC8vIFJlbW92ZSB0aGUgY29tcG9uZW50IGZyb20gdGhlIGxpc3Rcblx0dmFyIGNvbXBvbmVudCA9IHRoaXMuX2NoaWxkcmVuLnNwbGljZShhdEluZGV4LCAxKTtcblx0aWYgKCFjb21wb25lbnRbMF0pIHtcblxuXHRcdC8vIElmIHRoZSBsaXN0IGlzIGVtcHR5LCBmcmVhayBvdXRcblx0XHR0aHJvdyBuZXcgRXJyb3IodGhpcy5pZCArICcucmVtb3ZlKCkgOjogVHJ5aW5nIHRvIHJlbW92ZSBhIGNvbXBvbmVudCB0aGF0IGRvZXNuXFwndCBleGlzdCBhdCBpbmRleCAnICsgYXRJbmRleCk7XG5cdH1cblxuXHQvLyBTcXVlZXplIHRoZSBjb21wb25lbnQgdG8gZG8gZ2V0IGFsbCB0aGUgYmluZHkgZ29vZG5lc3Mgb3V0XG5cdGNvbXBvbmVudFswXS5jbG9zZSgpO1xuXG5cdEZSQU1FV09SSy5kZWJ1Zyh0aGlzLnBhcmVudC5pZCArICcgOjogUmVtb3ZlZCBjb21wb25lbnQgYXQgaW5kZXggJyArIGF0SW5kZXggKyAnIGZyb20gcmVnaW9uOiAnICsgdGhpcy5pZCk7XG59O1xuIiwiLyoqXG4gKiBTZXRzIHVwIHRoZSBGUkFNRVdPUksgcm91dGVyLlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHJvdXRlclNldHVwKCkge1xuXG5cdC8vIFdpbGRjYXJkIHJvdXRlcyB0byBnbG9iYWwgZXZlbnQgZGVsZWdhdG9yXG5cdHZhciByb3V0ZXIgPSBuZXcgRlJBTUVXT1JLLlJvdXRlcigpO1xuXHRyb3V0ZXIucm91dGUoLyguKikvLCAncm91dGUnLCBmdW5jdGlvbiAocm91dGUpIHtcblxuXHRcdC8vIE5vcm1hbGl6ZSBob21lIHJvdXRlcyAoIyBvciBudWxsKSB0byAnJ1xuXHRcdGlmICghcm91dGUpIHtcblx0XHRcdHJvdXRlID0gJyc7XG5cdFx0fVxuXG5cdFx0Ly8gVHJpZ2dlciByb3V0ZVxuXHRcdEZSQU1FV09SSy50cmlnZ2VyKCcjJyArIHJvdXRlKTtcblx0fSk7XG5cblx0Ly8gRXhwb3NlIGBuYXZpZ2F0ZSgpYCBtZXRob2Rcblx0RlJBTUVXT1JLLm5hdmlnYXRlID0gRlJBTUVXT1JLLmhpc3RvcnkubmF2aWdhdGU7XG59XG4iLCIvKipcbiAqIEJhcmUtYm9uZXMgRE9NL1VJIHV0aWxpdGllc1xuICovXG5cbnZhciBFdmVudHMgPSByZXF1aXJlKCcuL2V2ZW50cycpO1xuXG52YXIgRE9NID0ge1xuXG5cdC8qKlxuXHQgKiBFeHBvc2UgdGhlIFwiRE9NbXktZXZlbnRlZG5lc3NcIiBvZiBlbGVtZW50cyBzbyB0aGF0IGl0J3Mgc2VsZWN0YWJsZSB2aWEgQ1NTXG5cdCAqIFlvdSBjYW4gdXNlIHRoaXMgdG8gYXBwbHkgYSBmZXcgY2hvaWNlIERPTSBtb2RpZmljYXRpb25zIG91dCB0aGUgZ2F0ZS0tXG5cdCAqIChlLmcuIHR3ZWFrcyB0YXJnZXRpbmcgY29tbW9uIGlzc3VlcyB0aGF0IHR5cGljYWxseSBnZXQgZm9yZ290dGVuLCBsaWtlIGRpc2FibGluZyB0ZXh0IHNlbGVjdGlvbilcblx0ICpcblx0ICogQHBhcmFtIHtDb21wb25lbnR9IGNvbXBvbmVudFxuXHQgKi9cblx0ZmxhZ0JvdW5kRXZlbnRzOiBmdW5jdGlvbiAoIGNvbXBvbmVudCApIHtcblxuXHRcdC8vIFRPRE86IHByb3ZpZGUgYWNjZXNzIHRvIGJvdW5kIGdsb2JhbCBldmVudHMgKCUpIGFuZCByb3V0ZXMgKCMpIGFzIHdlbGxcblx0XHQvLyBUT0RPOiBmbGFnIGFsbCBET00gZXZlbnRzLCBub3QganVzdCBjbGljayBhbmQgdG91Y2hcblxuXHRcdC8vIEJ1aWxkIHN1YnNldCBvZiBqdXN0IHRoZSBjbGljay90b3VjaCBldmVudHNcblx0XHR2YXIgY2xpY2tPclRvdWNoRXZlbnRzID0gRXZlbnRzLnBhcnNlKFxuXHRcdFx0Y29tcG9uZW50LmV2ZW50cyxcblx0XHRcdHsgb25seTogWydjbGljaycsICd0b3VjaCcsICd0b3VjaHN0YXJ0JywgJ3RvdWNoZW5kJ10gfVxuXHRcdCk7XG5cblx0XHQvLyBJZiBubyBjbGljay90b3VjaCBldmVudHMgZm91bmQsIGJhaWwgb3V0XG5cdFx0aWYgKCBjbGlja09yVG91Y2hFdmVudHMubGVuZ3RoIDwgMSApIHJldHVybjtcblxuXHRcdC8vIFF1ZXJ5IGFmZmVjdGVkIGVsZW1lbnRzIGZyb20gRE9NXG5cdFx0dmFyICRhZmZlY3RlZCA9IEV2ZW50cy5nZXRFbGVtZW50cyhjbGlja09yVG91Y2hFdmVudHMsIGNvbXBvbmVudCk7XG5cblx0XHQvLyBOT1RFOiBGb3Igbm93LCB0aGlzIGlzIGFsd2F5cyBqdXN0ICdjbGljaydcblx0XHR2YXIgYm91bmRFdmVudHNTdHJpbmcgPSAnY2xpY2snO1xuXG5cdFx0Ly8gU2V0IGBkYXRhLUZSQU1FV09SSy1jbGlja2FibGVgIGN1c3RvbSBhdHRyaWJ1dGVcblx0XHQvLyAodWkgbG9naWMgc2hvdWxkIGJlIGV4dGVuZGVkIGluIENTUylcblx0XHQkYWZmZWN0ZWQuYXR0cignZGF0YS0nICsgRlJBTUVXT1JLLm9wdGlvbnMuZnJhbWV3b3JrSWQgKyAnLWV2ZW50cycsIGJvdW5kRXZlbnRzU3RyaW5nKTtcblxuXHRcdEZSQU1FV09SSy52ZXJib3NlKFxuXHRcdFx0Y29tcG9uZW50LmlkICsgJyA6OiAnICtcblx0XHRcdCdEaXNhYmxlZCB1c2VyIHRleHQgc2VsZWN0aW9uIG9uIGVsZW1lbnRzIHcvIGNsaWNrL3RvdWNoIGV2ZW50czonLFxuXHRcdFx0Y2xpY2tPclRvdWNoRXZlbnRzLFxuXHRcdFx0JGFmZmVjdGVkXG5cdFx0KTtcblx0fVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBET007XG4iLCIvKipcbiAqIEluc3BlY3QgYSBET00gZWxlbWVudCBhbmQgc2VlIGlmIGl0IGhhcyBhIGRlZmF1bHQgY29tcG9uZW50L3RlbXBsYXRlIElELlxuICogUHJvdmlkZXMgYmFja3dhcmRzLWNvbXBhdGliaWxpdHkgbGF5ZXIsIGFuZCBub3JtYWxpemVzIHRoZSBzeW50YXggaW4gdGhlIERPTS5cbiAqXG4gKiBAcGFyYW0gIHtET01FbGVtZW50fSBlbFxuICogQHJldHVybiB7U3RyaW5nfSAgICBbdGhlIGlkIG9mIHRoZSBkZWZhdWx0IGNvbXBvbmVudC90ZW1wbGF0ZSwgaWYgb25lIHdhcyBzcGVjaWZpZWRdXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGVsKSB7XG5cblx0Ly8gUHJvdmlkZSBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eSBmb3Jcblx0Ly8gYGRlZmF1bHRgLCBgY29udGVudHNgIGFuZCBgdGVtcGxhdGVgIG5vdGF0aW9uXG5cdHZhciBjb21wb25lbnRJZCA9ICQoZWwpLmF0dHIoJ3RlbXBsYXRlJykgfHwgJChlbCkuYXR0cignZGVmYXVsdCcpIHx8ICQoZWwpLmF0dHIoJ2NvbnRlbnRzJyk7XG5cblx0Ly8gTm9ybWFsaXplIHRvIGB0ZW1wbGF0ZWAgYXR0cmlidXRlIGluIHRoZSBET00uXG5cdCQoZWwpLmF0dHIoJ3RlbXBsYXRlJywgY29tcG9uZW50SWQpO1xuXG5cdHJldHVybiBjb21wb25lbnRJZDtcbn07XG4iLCIvKipcbiAqIEdyYWJzIHRoZSBNYXN0IGlkZW50aWZpZXIgZnJvbSBhbiBIVE1MIGVsZW1lbnQuXG4gKiBTdXBwb3J0cyBgaWRgLCBgZGF0YS1pZGAsIG9yIGBkYXRhLXJlZ2lvbmBcbiAqXG4gKiBAcGFyYW0gIHtET01FbGVtZW50fSBlbCAgICBbdGhlIERPTSBlbGVtZW50IHRvIGluc3BlY3RdXG4gKiBAcGFyYW0gIHtCb29sZWFufSByZXF1aXJlZCBbd2hldGhlciBhbiBpZGVudGlmaWVyIGlzIHJlcXVpcmVkXVxuICpcbiAqIEByZXR1cm4ge1N0cmluZ30gICAgICAgICAgIFtpZGVudGlmaWVyXVxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZWwyTWFzdElEIChlbCwgcmVxdWlyZWQpIHtcblxuXHR2YXIgaWQgPSAkKGVsKS5hdHRyKCdpZCcpO1xuXHR2YXIgZGF0YUlkID0gJChlbCkuYXR0cignZGF0YS1pZCcpIHx8ICQoZWwpLmF0dHIoJ2RhdGEtcmVnaW9uJyk7XG5cdHZhciBjb250ZW50c0lkID0gJChlbCkuYXR0cignY29udGVudHMnKTtcblxuXHRpZiAoaWQgJiYgZGF0YUlkKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGlkICsgJyA6OiBDYW5ub3Qgc2V0IGJvdGggYGlkYCBhbmQgYGRhdGEtaWRgISAgUGxlYXNlIHVzZSBvbmUgb3IgdGhlIG90aGVyLiAgKGRhdGEtaWQgaXMgc2FmZXN0KScpO1xuXHR9XG5cdGlmIChyZXF1aXJlZCAmJiAhaWQgJiYgIWRhdGFJZCkge1xuXHRcdHRocm93IG5ldyBFcnJvcignTm8gaWQgc3BlY2lmaWVkIGluIGVsZW1lbnQgd2hlcmUgaXQgaXMgcmVxdWlyZWQ6XFxuJyArIGVsKTtcblx0fVxuXG5cdHJldHVybiBpZCB8fCBkYXRhSWQgfHwgY29udGVudHNJZDtcbn07XG4iLCIvKipcbiAqIFV0aWxpdHkgRXZlbnQgdG9vbGtpdFxuICovXG5cbnZhciBFdmVudHMgPSB7XG5cblx0LyoqXG5cdCAqIFBhcnNlcyBhIGRpY3Rpb25hcnkgb2YgZXZlbnRzIGFuZCBvcHRpb25hbGx5IGZpbHRlcnMgYnkgdGhlIGV2ZW50IHR5cGUuIElmIHRoZSBldmVudFxuXHQgKlxuXHQgKiBAcGFyYW0gIHtPYmplY3R9IGV2ZW50cyAgW0EgQmFja2JvbmUuVmlldyBldmVudHMgb2JqZWN0XVxuXHQgKiBAcGFyYW0gIHtPYmplY3R9IG9wdGlvbnMgW09wdGlvbnMgb2JqZWN0IHRoYXQgYWxsb3dzIHVzIHRvIGZpbHRlciBwYXJzaW5nIHRvIGNlcnRhaW4gZXZlbnRcblx0ICogICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lc11cblx0ICpcblx0ICogQHJldHVybiB7QXJyYXl9ICAgICAgICAgIFtBcnJheSBjb250YWluaW5nIHBhcnNlZEV2ZW50cyB0aGF0IGFyZSBtYXRjaGluZyBldmVudCBrZXlzXVxuXHQgKi9cblx0cGFyc2U6IGZ1bmN0aW9uIChldmVudHMsIG9wdGlvbnMpIHtcblxuXHRcdHZhciBldmVudEtleXMgPSBfLmtleXMoZXZlbnRzIHx8IHt9KSxcblx0XHRcdGxpbWl0RXZlbnRzLFxuXHRcdFx0cGFyc2VkRXZlbnRzID0gW107XG5cblx0XHQvLyBPcHRpb25hbGx5IGZpbHRlciB1c2luZyBzZXQgb2YgYWNjZXB0YWJsZSBldmVudCB0eXBlc1xuXHRcdGxpbWl0RXZlbnRzID0gb3B0aW9ucy5vbmx5O1xuXHRcdGV2ZW50S2V5cyA9IF8uZmlsdGVyKGV2ZW50S2V5cywgZnVuY3Rpb24gY2hlY2tFdmVudE5hbWUgKGV2ZW50S2V5KSB7XG5cblx0XHRcdC8vIFBhcnNlIGV2ZW50IHN0cmluZyBpbnRvIHNlbWFudGljIHJlcHJlc2VudGF0aW9uXG5cdFx0XHR2YXIgZXZlbnQgPSBFdmVudHMucGFyc2VET01FdmVudChldmVudEtleSk7XG5cdFx0XHRwYXJzZWRFdmVudHMucHVzaChldmVudCk7XG5cblx0XHRcdC8vIE9wdGlvbmFsIGZpbHRlclxuXHRcdFx0aWYgKGxpbWl0RXZlbnRzKSB7XG5cdFx0XHRcdHJldHVybiBfLmNvbnRhaW5zKGxpbWl0RXZlbnRzLCBldmVudC5uYW1lKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHBhcnNlZEV2ZW50cztcblx0fSxcblxuXHQvKipcblx0ICogW2dldEVsZW1lbnRzIGRlc2NyaXB0aW9uXVxuXHQgKlxuXHQgKiBAcGFyYW0gIHtBcnJheX0gc2VtYW50aWNFdmVudHMgW0EgbGlzdCBvZiBwYXJzZWQgZXZlbnQgb2JqZWN0c11cblx0ICogQHBhcmFtICB7Q29tcG9uZW50fSBjb250ZXh0ICAgIFtJbnN0YW5jZSBvZiBhIGNvbXBvbmVudCB0byB1c2UgYXMgYSBzdGFydGluZyBwb2ludCBmb3Jcblx0ICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGUgRE9NIHF1ZXJpZXNdXG5cdCAqXG5cdCAqIEByZXR1cm4ge0FycmF5fSAgICAgICAgICAgICAgICBbQW4gYXJyYXkgb2YgalF1ZXJ5IHNldCBvZiBtYXRjaGVkIGVsZW1lbnRzXVxuXHQgKi9cblx0Z2V0RWxlbWVudHM6IGZ1bmN0aW9uIChzZW1hbnRpY0V2ZW50cywgY29udGV4dCkge1xuXG5cdFx0Ly8gQ29udGV4dCBvcHRpb25hbFxuXHRcdGNvbnRleHQgPSBjb250ZXh0IHx8IHsgJDogJCB9O1xuXG5cdFx0Ly8gSXRlcmF0aXZlbHkgYnVpbGQgYSBzZXQgb2YgYWZmZWN0ZWQgZWxlbWVudHNcblx0XHR2YXIgJGFmZmVjdGVkID0gJCgpO1xuXHRcdF8uZWFjaChzZW1hbnRpY0V2ZW50cywgZnVuY3Rpb24gbG9va3VwRWxlbWVudHNGb3JFdmVudCAoZXZlbnQpIHtcblxuXHRcdFx0Ly8gRGV0ZXJtaW5lIG1hdGNoZWQgZWxlbWVudHNcblx0XHRcdC8vIFVzZSBkZWxlZ2F0ZSBzZWxlY3RvciBpZiBzcGVjaWZpZWRcblx0XHRcdC8vIE90aGVyd2lzZSwgZ3JhYiB0aGUgZWxlbWVudCBmb3IgdGhpcyBjb21wb25lbnRcblx0XHRcdHZhciAkbWF0Y2hlZCA9XHRldmVudC5zZWxlY3RvciA/XG5cdFx0XHRcdFx0XHRcdGNvbnRleHQuJChldmVudC5zZWxlY3RvcikgOlxuXHRcdFx0XHRcdFx0XHRjb250ZXh0LiRlbDtcblxuXHRcdFx0Ly8gQWRkIG1hdGNoZWQgZWxlbWVudHMgdG8gc2V0XG5cdFx0XHQkYWZmZWN0ZWQgPSAkYWZmZWN0ZWQuYWRkKCAkbWF0Y2hlZCApO1xuXHRcdH0sIHRoaXMpO1xuXG5cdFx0cmV0dXJuICRhZmZlY3RlZDtcblx0fSxcblxuXG5cblx0LyoqXG5cdCAqIFJldHVybnMgd2hldGhlciB0aGUgc3BlY2lmaWVkIGV2ZW50IGtleSBtYXRjaGVzIGEgRE9NIGV2ZW50LlxuXHQgKlxuXHQgKiBAcGFyYW0gIHtTdHJpbmd9IGtleSBbS2V5IHRvIG1hdGNoIGFnYWluc3RdXG5cdCAqXG5cdCAqIGlmIG5vIG1hdGNoIGlzIGZvdW5kXG5cdCAqIEByZXR1cm4ge0Jvb2xlYW59IFx0XHRbcmV0dXJuIGBmYWxzZWBdXG5cdCAqXG5cdCAqIG90aGVyd2lzZVxuXHQgKiBAcmV0dXJuIHtPYmplY3R9ICBcdFx0W09iamVjdCBjb250YWluaW5nIHRoZSBgbmFtZWAgb2YgdGhlIERPTSBlbGVtZW50IGFuZCB0aGUgYHNlbGVjdG9yYF1cblx0ICovXG5cdHBhcnNlRE9NRXZlbnQ6IF8ubWVtb2l6ZShmdW5jdGlvbihrZXkpIHtcblxuXHRcdHZhciBtYXRjaGVzID0ga2V5Lm1hdGNoKHRoaXNbJy9ET01FdmVudC8nXSk7XG5cblx0XHRpZiAoIW1hdGNoZXMgfHwgIW1hdGNoZXNbMV0pIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZTogbWF0Y2hlc1sxXSxcblx0XHRcdHNlbGVjdG9yOiBtYXRjaGVzWzNdXG5cdFx0fTtcblx0fSksXG5cblxuXHQvKipcblx0ICogU3VwcG9ydGVkIFwiZmlyc3QtY2xhc3NcIiBET00gZXZlbnRzLlxuXHQgKiBAdHlwZSB7QXJyYXl9XG5cdCAqL1xuXHRuYW1lczogW1xuXG5cdFx0Ly8gTG9jYWxpemVkIGJyb3dzZXIgZXZlbnRzXG5cdFx0Ly8gKHdvcmtzIG9uIGluZGl2aWR1YWwgZWxlbWVudHMpXG5cdFx0J2Vycm9yJywgJ3Njcm9sbCcsXG5cblx0XHQvLyBNb3VzZSBldmVudHNcblx0XHQnY2xpY2snLCAnZGJsY2xpY2snLCAnbW91c2Vkb3duJywgJ21vdXNldXAnLCAnaG92ZXInLCAnbW91c2VlbnRlcicsICdtb3VzZWxlYXZlJyxcblx0XHQnbW91c2VvdmVyJywgJ21vdXNlb3V0JywgJ21vdXNlbW92ZScsXG5cblx0XHQvLyBLZXlib2FyZCBldmVudHNcblx0XHQna2V5ZG93bicsICdrZXl1cCcsICdrZXlwcmVzcycsXG5cblx0XHQvLyBGb3JtIGV2ZW50c1xuXHRcdCdibHVyJywgJ2NoYW5nZScsICdmb2N1cycsICdmb2N1c2luJywgJ2ZvY3Vzb3V0JywgJ3NlbGVjdCcsICdzdWJtaXQnLFxuXG5cdFx0Ly8gUmF3IHRvdWNoIGV2ZW50c1xuXHRcdCd0b3VjaHN0YXJ0JywgJ3RvdWNoZW5kJywgJ3RvdWNobW92ZScsICd0b3VjaGNhbmNlbCcsXG5cblx0XHQvLyBNYW51ZmFjdHVyZWQgZXZlbnRzXG5cdFx0J3RvdWNoJyxcblxuXHRcdC8vIFRPRE86XG5cdFx0J3JpZ2h0Y2xpY2snLCAnY2xpY2tvdXRzaWRlJ1xuXHRdXG59O1xuXG5cblxuXG4vKipcbiAqIFJlZ2V4cCB0byBtYXRjaCBcImZpcnN0IGNsYXNzXCIgRE9NIGV2ZW50c1xuICogKHRoZXNlIGFyZSBhbGxvd2VkIGluIHRoZSB0b3AgbGV2ZWwgb2YgYSBjb21wb25lbnQgZGVmaW5pdGlvbiBhcyBtZXRob2Qga2V5cylcbiAqXHRcdGkuZS4gL14oY2xpY2t8aG92ZXJ8Ymx1cnxmb2N1cykoICguKykpL1xuICpcdFx0XHRbMV0gPT4gZXZlbnQgbmFtZVxuICpcdFx0XHRbM10gPT4gc2VsZWN0b3JcbiAqL1xuXG5FdmVudHNbJy9ET01FdmVudC8nXSA9IG5ldyBSZWdFeHAoJ14oJyArIF8ucmVkdWNlKEV2ZW50cy5uYW1lcyxcblx0ZnVuY3Rpb24gYnVpbGRSZWdleHAobWVtbywgZXZlbnROYW1lLCBpbmRleCkge1xuXG5cdFx0Ly8gT21pdCBgfGAgdGhlIGZpcnN0IHRpbWVcblx0XHRpZiAoaW5kZXggPT09IDApIHtcblx0XHRcdHJldHVybiBtZW1vICsgZXZlbnROYW1lO1xuXHRcdH1cblxuXHRcdHJldHVybiBtZW1vICsgJ3wnICsgZXZlbnROYW1lO1xuXHR9LCAnJykgK1xuJykoICguKykpPyQnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBFdmVudHM7XG4iLCIvKipcbiAqIE1hcCBhbiBvYmplY3QncyB2YWx1ZXMsIGFuZCByZXR1cm4gYSB2YWxpZCBvYmplY3QgKHRoaXMgZnVuY3Rpb24gaXMgaGFuZHkgYmVjYXVzZVxuICogdW5kZXJzY29yZS5tYXAoKSByZXR1cm5zIGEgbGlzdCwgbm90IGFuIG9iamVjdC4pXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9iaiAgICAgICAgICAgIFtPYmplY3Qgd2hvcyB2YWx1ZXMgeW91IHdhbnQgdG8gbWFwXVxuICogQHBhcmFtICB7RnVuY3Rpb259IHRyYW5zZm9ybUZuIFtGdW5jdGlvbiB0byB0cmFuc2Zvcm0gZWFjaCBvYmplY3QgdmFsdWUgYnldXG4gKlxuICogQHJldHVybiB7T2JqZWN0fSAgICAgICAgICAgICAgICBbTmV3IG9iamVjdCB3aXRoIHRoZSB2YWx1ZXMgbWFwcGVkXVxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gb2JqTWFwKG9iaiwgdHJhbnNmb3JtRm4pIHtcblx0cmV0dXJuIF8ub2JqZWN0KF8ua2V5cyhvYmopLCBfLm1hcChvYmosIHRyYW5zZm9ybUZuKSk7XG59O1xuXG4iLCIvKipcbiAqIFRyYW5zbGF0ZSAqKnJpZ2h0LWhhbmQtc2lkZSBhYmJyZXZpYXRpb25zKiogaW50byBmdW5jdGlvbnMgdGhhdCBwZXJmb3JtXG4gKiB0aGUgcHJvcGVyIGJlaGF2aW9ycywgZS5nLlxuICpcdFx0I2Fib3V0X21lXG4gKlx0XHQlbWFpbk1lbnU6b3BlblxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gdHJhbnNsYXRlU2hvcnRoYW5kKHZhbHVlLCBrZXkpIHtcblxuXHR2YXIgbWF0Y2hlcywgZm47XG5cblx0Ly8gSWYgdGhpcyBpcyBhbiBpbXBvcnRhbnQsIEZSQU1FV09SSy1zcGVjaWZpYyBkYXRhIGtleSxcblx0Ly8gYW5kIGEgZnVuY3Rpb24gd2FzIHNwZWNpZmllZCwgcnVuIGl0IHRvIGdldCBpdHMgdmFsdWVcblx0Ly8gKHRoaXMgaXMgdG8ga2VlcCBwYXJpdHkgd2l0aCBCYWNrYm9uZSdzIHNpbWlsYXIgZnVuY3Rpb25hbGl0eSlcblx0aWYgKF8uaXNGdW5jdGlvbih2YWx1ZSkgJiYgKGtleSA9PT0gJ2NvbGxlY3Rpb24nIHx8IGtleSA9PT0gJ21vZGVsJykpIHtcblx0XHRyZXR1cm4gdmFsdWUoKTtcblx0fVxuXG5cdC8vIElnbm9yZSBvdGhlciBub24tc3RyaW5nc1xuXHRpZiAoIV8uaXNTdHJpbmcodmFsdWUpKSB7XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG5cblx0Ly8gQWxzbyBpZ25vcmUgYHRlbXBsYXRlYFxuXHQvLyBUT0RPOiB1c2UgYSBkaWZmZXJlbnQga2V5IGxhdGVyXG5cdGlmIChrZXkgPT09ICd0ZW1wbGF0ZScpIHJldHVybiB2YWx1ZTtcblxuXHQvLyBBbHNvIGlnbm9yZSB0aGluZ3MgdGhhdCBzdGFydCB3aXRoIF9cblx0aWYgKGtleS5tYXRjaCgvXl8vKSkgcmV0dXJuIHZhbHVlO1xuXG5cblx0Ly8gUmVkaXJlY3RzIHVzZXIgdG8gY2xpZW50LXNpZGUgVVJMLCB3L28gYWZmZWN0aW5nIGJyb3dzZXIgaGlzdG9yeVxuXHQvLyBMaWtlIGNhbGxpbmcgYEJhY2tib25lLmhpc3RvcnkubmF2aWdhdGUoJy9mb28nLCB7IHJlcGxhY2U6IHRydWUgfSlgXG5cdGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eIyMoLipbXi5cXHNdKS8pKSAmJiBtYXRjaGVzWzFdKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiByZWRpcmVjdEFuZENvdmVyVHJhY2tzKCkge1xuXHRcdFx0dmFyIHVybCA9IG1hdGNoZXNbMV07XG5cdFx0XHRGUkFNRVdPUksuaGlzdG9yeS5uYXZpZ2F0ZSh1cmwsIHtcblx0XHRcdFx0dHJpZ2dlcjogdHJ1ZSxcblx0XHRcdFx0cmVwbGFjZTogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0fTtcblx0fVxuXHQvLyBNZXRob2QgdG8gcmVkaXJlY3QgdXNlciB0byBhIGNsaWVudC1zaWRlIFVSTCwgdGhlbiBjYWxsIHRoZSBoYW5kbGVyXG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14jKC4qW14uXFxzXSspLykpICYmIG1hdGNoZXNbMV0pIHtcblx0XHRmbiA9IGZ1bmN0aW9uIGNoYW5nZVVybEZyYWdtZW50KCkge1xuXHRcdFx0dmFyIHVybCA9IG1hdGNoZXNbMV07XG5cdFx0XHRGUkFNRVdPUksuaGlzdG9yeS5uYXZpZ2F0ZSh1cmwsIHtcblx0XHRcdFx0dHJpZ2dlcjogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0fTtcblx0fVxuXHQvLyBNZXRob2QgdG8gdHJpZ2dlciBnbG9iYWwgZXZlbnRcblx0ZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXiglLipbXi5cXHNdKS8pKSAmJiBtYXRjaGVzWzFdKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiB0cmlnZ2VyRXZlbnQoKSB7XG5cdFx0XHR2YXIgdHJpZ2dlciA9IG1hdGNoZXNbMV07XG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZSh0aGlzLmlkICsgJyA6OiBUcmlnZ2VyaW5nIGV2ZW50ICgnICsgdHJpZ2dlciArICcpLi4uJyk7XG5cdFx0XHRGUkFNRVdPUksudHJpZ2dlcih0cmlnZ2VyKTtcblx0XHR9O1xuXHR9XG5cdC8vIE1ldGhvZCB0byBmaXJlIGEgdGVzdCBhbGVydFxuXHQvLyAodXNlIG1lc3NhZ2UsIGlmIHNwZWNpZmllZClcblx0ZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXiEhIVxccyooLipbXi5cXHNdKT8vKSkpIHtcblx0XHRmbiA9IGZ1bmN0aW9uIGJhbmdBbGVydChlKSB7XG5cblx0XHRcdC8vIElmIHNwZWNpZmllZCwgbWVzc2FnZSBpcyB1c2VkLCBvdGhlcndpc2UgJ0FsZXJ0IHRyaWdnZXJlZCEnXG5cdFx0XHR2YXIgbXNnID0gKG1hdGNoZXMgJiYgbWF0Y2hlc1sxXSkgfHwgJ0RlYnVnIGFsZXJ0ICghISEpIHRyaWdnZXJlZCEnO1xuXG5cdFx0XHQvLyBPdGhlciBkaWFnbm9zdGljIGluZm9ybWF0aW9uXG5cdFx0XHRtc2cgKz0gJ1xcblxcbkRpYWdub3N0aWNzXFxuPT09PT09PT09PT09PT09PT09PT09PT09XFxuJztcblx0XHRcdGlmIChlICYmIGUuY3VycmVudFRhcmdldCkge1xuXHRcdFx0XHRtc2cgKz0gJ2UuY3VycmVudFRhcmdldCA6OiAnICsgZS5jdXJyZW50VGFyZ2V0O1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuaWQpIHtcblx0XHRcdFx0bXNnICs9ICd0aGlzLmlkIDo6ICcgKyB0aGlzLmlkO1xuXHRcdFx0fVxuXG5cdFx0XHRhbGVydChtc2cpO1xuXHRcdH07XG5cdH1cblxuXHQvLyBNZXRob2QgdG8gbG9nIGEgbWVzc2FnZSB0byB0aGUgY29uc29sZVxuXHQvLyAodXNlIG1lc3NhZ2UsIGlmIHNwZWNpZmllZClcblx0ZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXj4+PlxccyooLipbXi5cXHNdKT8vKSkpIHtcblxuXHRcdGZuID0gZnVuY3Rpb24gbG9nTWVzc2FnZShlKSB7XG5cblx0XHRcdC8vIElmIHNwZWNpZmllZCwgbWVzc2FnZSBpcyB1c2VkLCBvdGhlcndpc2UgdXNlIGRlZmF1bHRcblx0XHRcdHZhciBtc2cgPSAobWF0Y2hlcyAmJiBtYXRjaGVzWzFdKSB8fCAnTG9nIG1lc3NhZ2UgKD4+PikgdHJpZ2dlcmVkISc7XG5cdFx0XHRGUkFNRVdPUksubG9nKG1zZyk7XG5cdFx0fTtcblx0fVxuXG5cdC8vIE1ldGhvZCB0byBhdHRhY2ggdGhlIHNwZWNpZmllZCBjb21wb25lbnQvdGVtcGxhdGUgdG8gYSByZWdpb25cblx0ZWxzZSBpZiAoXG5cdFx0KChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14oW14uXFxzXSspXFxzKjxcXC1cXHMqKC4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSAmJiBtYXRjaGVzWzJdKSB8fFxuXHRcdCgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eKFteLlxcc10rKVxccypcXC0+XFxzKiguKlteLlxcc10pLykpICYmIG1hdGNoZXNbMV0gJiYgbWF0Y2hlc1syXSAmJlxuXHRcdFx0KG1hdGNoZXNbJ3RtcCddID0gbWF0Y2hlc1sxXSkgJiYgKG1hdGNoZXNbMV0gPSBtYXRjaGVzWzJdKSAmJiAobWF0Y2hlc1syXSA9IG1hdGNoZXNbJ3RtcCddKSlcblx0KSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiBhdHRhY2hUZW1wbGF0ZSgpIHtcblxuXHRcdFx0Ly8gUmVtb3ZlIGFsbCB3aGl0ZXNwYWNlIGZyb20gbWF0Y2hlc1xuXHRcdFx0bWF0Y2hlc1sxXSA9IG1hdGNoZXNbMV0ucmVwbGFjZSgvKFxccyspL2csICcnKTtcblx0XHRcdG1hdGNoZXNbMl0gPSBtYXRjaGVzWzJdLnJlcGxhY2UoLyhcXHMrKS9nLCAnJyk7XG5cblx0XHRcdHZhciByZWdpb24gPSBtYXRjaGVzWzFdO1xuXHRcdFx0dmFyIHRlbXBsYXRlID0gbWF0Y2hlc1syXTtcblx0XHRcdEZSQU1FV09SSy52ZXJib3NlKHRoaXMuaWQgKyAnIDo6IEF0dGFjaGluZyBgJyArIHRlbXBsYXRlICsgJ2AgdG8gYCcgKyByZWdpb24gKyAnYC4uLicpO1xuXG5cblx0XHRcdGlmICghdGhpc1tyZWdpb25dKSB7XG5cdFx0XHRcdEZSQU1FV09SSy5lcnJvcih0aGlzLmlkLCc6OiBUcnlpbmcgdG8gYXR0YWNoIHJlZ2lvbiB3aXRoIHNob3J0aGFuZCAoJyt2YWx1ZSsnKSwgYnV0IGNvdWxkIG5vdCBmaW5kIHJlZ2lvbiBgJytyZWdpb24rJ2AnKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpc1tyZWdpb25dLmF0dGFjaCh0ZW1wbGF0ZSk7XG5cdFx0fTtcblx0fVxuXG5cblx0Ly8gTWV0aG9kIHRvIHRvZ2dsZSAoISkgdGhlIHNwZWNpZmllZCBtb2RlbCBhdHRyXG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL15cXCFcXHMqXFxAKC4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHRcdGZuID0gZnVuY3Rpb24gdG9nZ2xlQXR0cigpIHtcblx0XHRcdEZSQU1FV09SSy52ZXJib3NlKHRoaXMuaWQgKyAnIDo6IFRvZ2dsaW5nIGF0dHIgKCcgKyBtYXRjaGVzWzFdICsgJykuLi4nKTtcblx0XHRcdHZhciBvbGRBdHRyVmFsdWUgPSB0aGlzLm1vZGVsLmdldCggbWF0Y2hlc1sxXSApO1xuXG5cdFx0XHRpZiAob2xkQXR0clZhbHVlKSB7XG5cdFx0XHRcdHRoaXMubW9kZWwuc2V0KCBtYXRjaGVzWzFdLCBmYWxzZSApO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdHRoaXMubW9kZWwuc2V0KCBtYXRjaGVzWzFdLCB0cnVlICk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdC8vIE1ldGhvZCB0byBjaGFuZ2UgdGhlIHNwZWNpZmllZCBtb2RlbCBhdHRyXG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL15cXHMqXFxAKFtePV0rKT0oW149XSopXFxzKiQvKSkpIHtcblxuXHRcdHZhciBhdHRyTmFtZSA9IG1hdGNoZXNbMV07XG5cdFx0dmFyIG5ld0F0dHJWYWx1ZSA9IG1hdGNoZXNbMl07XG5cblx0XHRmbiA9IGZ1bmN0aW9uIGNoYW5nZUF0dHIoKSB7XG5cdFx0XHR0aGlzLm1vZGVsLnNldChhdHRyTmFtZSwgbmV3QXR0clZhbHVlKTtcblx0XHR9O1xuXHR9XG5cblx0Ly8gTWV0aG9kIHRvIHJlbW92ZSB0aGUgbW9kZWwgZm9yIHRoZSBjdXJyZW50IGNvbXBvbmVudFxuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eXFxzKlxcLVxccyokLykpKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiByZW1vdmVNb2RlbCAoKSB7XG5cblx0XHRcdC8vIE9ubHkgd29ya3MgaWYgbW9kZWwgYmVsb25ncyB0byBhIGNvbGxlY3Rpb25cblx0XHRcdGlmICghdGhpcy5tb2RlbC5jb2xsZWN0aW9uKSByZXR1cm47XG5cblx0XHRcdHRoaXMubW9kZWwuY29sbGVjdGlvbi5yZW1vdmUodGhpcy5tb2RlbCk7XG5cdFx0fTtcblx0fVxuXG5cblx0Ly8gZGVwcmVjYXRpbmcgY2xhc3MgbWFuaXB1bGF0aW9uIHNob3J0aGFuZFxuXHQvLyAobm8gbmVlZCB0byBkbyBkb20gbWFuaXB1bGF0aW9uIHVubGVzcyBhYnNvbHV0ZWx5IG5lY2Vzc2FyeSlcblxuXHQvLyAvLyBNZXRob2QgdG8gYWRkIHRoZSBzcGVjaWZpZWQgY2xhc3Ncblx0Ly8gZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXlxcK1xccypcXC4oLipbXi5cXHNdKS8pKSAmJiBtYXRjaGVzWzFdKSB7XG5cdC8vIFx0Zm4gPSBmdW5jdGlvbiBhZGRDbGFzcygpIHtcblx0Ly8gXHRcdEZSQU1FV09SSy52ZXJib3NlKHRoaXMuaWQgKyAnIDo6IEFkZGluZyBjbGFzcyAoJyArIG1hdGNoZXNbMV0gKyAnKS4uLicpO1xuXHQvLyBcdFx0dGhpcy4kZWwuYWRkQ2xhc3MobWF0Y2hlc1sxXSk7XG5cdC8vIFx0fTtcblx0Ly8gfVxuXHQvLyAvLyBNZXRob2QgdG8gcmVtb3ZlIHRoZSBzcGVjaWZpZWQgY2xhc3Ncblx0Ly8gZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXlxcLVxccypcXC4oLipbXi5cXHNdKS8pKSAmJiBtYXRjaGVzWzFdKSB7XG5cdC8vIFx0Zm4gPSBmdW5jdGlvbiByZW1vdmVDbGFzcygpIHtcblx0Ly8gXHRcdEZSQU1FV09SSy52ZXJib3NlKHRoaXMuaWQgKyAnIDo6IFJlbW92aW5nIGNsYXNzICgnICsgbWF0Y2hlc1sxXSArICcpLi4uJyk7XG5cdC8vIFx0XHR0aGlzLiRlbC5yZW1vdmVDbGFzcyhtYXRjaGVzWzFdKTtcblx0Ly8gXHR9O1xuXHQvLyB9XG5cdC8vIC8vIE1ldGhvZCB0byB0b2dnbGUgdGhlIHNwZWNpZmllZCBjbGFzc1xuXHQvLyBlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eXFwhXFxzKlxcLiguKlteLlxcc10pLykpICYmIG1hdGNoZXNbMV0pIHtcblx0Ly8gXHRmbiA9IGZ1bmN0aW9uIHRvZ2dsZUNsYXNzKCkge1xuXHQvLyBcdFx0RlJBTUVXT1JLLnZlcmJvc2UodGhpcy5pZCArICcgOjogVG9nZ2xpbmcgY2xhc3MgKCcgKyBtYXRjaGVzWzFdICsgJykuLi4nKTtcblx0Ly8gXHRcdHRoaXMuJGVsLnRvZ2dsZUNsYXNzKG1hdGNoZXNbMV0pO1xuXHQvLyBcdH07XG5cdC8vIH1cblxuXHQvLyBUT0RPOlx0YWxsb3cgZGVzY2VuZGFudHMgdG8gYmUgY29udHJvbGxlZCB2aWEgc2hvcnRoYW5kXG5cdC8vXHRcdFx0ZS5nLiA6ICdsaS5yb3cgLS5oaWdobGlnaHRlZCdcblx0Ly9cdFx0XHR3b3VsZCByZW1vdmUgdGhlIGBoaWdobGlnaHRlZGAgY2xhc3MgZnJvbSB0aGlzLiQoJ2xpLnJvdycpXG5cblxuXHQvLyBJZiBzaG9ydC1oYW5kIG1hdGNoZWQsIHJldHVybiB0aGUgZGVyZWZlcmVuY2VkIGZ1bmN0aW9uXG5cdGlmIChmbikge1xuXG5cdFx0RlJBTUVXT1JLLnZlcmJvc2UoJ0ludGVycHJldGluZyBtZWFuaW5nIGZyb20gc2hvcnRoYW5kIDo6IGAnICsgdmFsdWUgKyAnYC4uLicpO1xuXG5cdFx0Ly8gQ3VycnkgdGhlIHJlc3VsdCBmdW5jdGlvbiB3aXRoIGFueSBzdWZmaXggbWF0Y2hlc1xuXHRcdHZhciBjdXJyaWVkRm4gPSBmbjtcblxuXHRcdC8vIFRyYWlsaW5nIGAuYCBpbmRpY2F0ZXMgYW4gZS5zdG9wUHJvcGFnYXRpb24oKVxuXHRcdGlmICh2YWx1ZS5tYXRjaCgvXFwuXFxzKiQvKSkge1xuXHRcdFx0Y3VycmllZEZuID0gZnVuY3Rpb24gYW5kU3RvcFByb3BhZ2F0aW9uKGUpIHtcblxuXHRcdFx0XHQvLyBCaW5kIChzbyBpdCBpbmhlcml0cyBjb21wb25lbnQgY29udGV4dCkgYW5kIGNhbGwgaW50ZXJpb3IgZnVuY3Rpb25cblx0XHRcdFx0Zm4uYXBwbHkodGhpcyk7XG5cblx0XHRcdFx0Ly8gdGhlbiBpbW1lZGlhdGVseSBzdG9wIGV2ZW50IGJ1YmJsaW5nL3Byb3BhZ2F0aW9uXG5cdFx0XHRcdGlmIChlICYmIGUuc3RvcFByb3BhZ2F0aW9uKSB7XG5cdFx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRGUkFNRVdPUksud2Fybihcblx0XHRcdFx0XHRcdHRoaXMuaWQgKyAnIDo6IFRyYWlsaW5nIGAuYCBzaG9ydGhhbmQgd2FzIHVzZWQgdG8gaW52b2tlIGFuICcgK1xuXHRcdFx0XHRcdFx0J2Uuc3RvcFByb3BhZ2F0aW9uKCksIGJ1dCBcIicgKyB2YWx1ZSArICdcIiB3YXMgbm90IHRyaWdnZXJlZCBieSBhIERPTSBldmVudCFcXG4nICtcblx0XHRcdFx0XHRcdCdQcm9iYWJseSBiZXN0IHRvIGRvdWJsZS1jaGVjayB0aGlzIHdhcyB3aGF0IHlvdSBtZWFudCB0byBkby4nKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY3VycmllZEZuO1xuXHR9XG5cblxuXHQvLyBPdGhlcndpc2UsIGlmIG5vIHNob3J0LWhhbmQgbWF0Y2hlZCwgcGFzcyB0aGUgb3JpZ2luYWwgdmFsdWVcblx0Ly8gc3RyYWlnaHQgdGhyb3VnaFxuXHRyZXR1cm4gdmFsdWU7XG59O1xuIl19
(17)
});
;