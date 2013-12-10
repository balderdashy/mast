;(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * Module dependencies
 */
var helpers = require('./helpers');


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

			// Apply data bindings
			helpers.renderDataBindings.call(self);

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

},{"./helpers":3}],2:[function(require,module,exports){
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

var _bindings = {

	text: {
		regexp: /bind-text/,
		fn: function ($el, model) {
			var raw = $boundEl.attr('bind-text');
			var clean = raw.replace(/^@/, '');
			$boundEl.text( model.get(clean) );
		}
	},

	'class': {
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
	}
};


/**
 * Helper functions used by components
 */

var helpers = module.exports = {



	/**
	 * Render model bindings.
	 *   + `bind-text`
	 *   + more to come
	 *
	 * Called by Component when its model changes.
	 */
	renderDataBindings: function () {
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

				_.each(_bindings, function eachBindingFormula ( binding ) {
					var matches = attrName.match(binding.regexp);
					if ( matches ) {
						binding.fn($boundEl, model, matches);
					}
				});
			});
		});
	},



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
			// Normalizes notation to `contents` attribute.
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

			FRAMEWORK.error(this.id + ' :: Cannot render() template (probably missing data).\n\nGot this error ::\n'+str,'\n');
			if (html) {FRAMEWORK.verbose('Template :: ' + html);}
			FRAMEWORK.verbose('Full Template Error:' + '\n',stack);
			FRAMEWORK.verbose('\n\nMore information:', '\n\nTemplate context ::',templateContext, '\n\nthis.model::', this.model);
			html = _.isString(this.template) ? this.template : str;
		}

		return html;
	}

};




// Private intra-helper methods



/**
 * Lookup suitable elements within this component's $el context.
 * Ignore regions, and include the top-level element.
 *
 * @param {String} bindingSelector - DOM selector to use
 */
var _$selectOuter = function ( bindingSelector ) {

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
};



// Regexps for detection of wildcard named parameters in custom element attribute names.
var optionalParam = /\((.*?)\)/g;
var namedParam = /(\(\?)?:\w+/g;
var splatParam = /\*\w+/g;
var escapeRegExp = /[\-{}\[\]+?.,\\\^$|#\s]/g;


// Build selector for superset of these bindings
var _attrNameToRegExp = function( attrExpression ) {

	attrExpression = attrExpression.replace(escapeRegExp, '\\$&')
		.replace(optionalParam, '(?:$1)?')
		.replace(namedParam, function(match, optional) {
			return optional ? match : '([^\/]+)';
		})
		.replace(splatParam, '(.*?)');
	return '^' + attrExpression + '$';
};
var _extractParameters = function(regexp, attrName, attrExpression) {
	var paramValues = regexp.exec(attrName).slice(1);
	var paramKeys = namedParam.exec(attrExpression);

	if (!paramKeys || !paramValues) return {};

	var namedParameters = {};
	console.log('paramValues:',paramValues);
	_.each(paramValues, function eachMatchingPiece( param, i ) {
		var key = paramKeys[i];
		key = key.slice(1); // remove `:` from named param
		namedParameters[key] = paramValues[i];
	});
	return namedParameters;
};



/**
 * Render a single binding
 */
var _renderBinding = function ($matchedEl, domAttributeName, model, renderFn, namedParams) {
	var rawBinding = $matchedEl.attr( domAttributeName );
	// If element doesn't contain the specified DOM attribute...
	// fail silently.
	if ( !rawBinding ) return;

	// console.log('getting ',domAttributeName,'on',$matchedEl);
	var modelAttributeName = rawBinding.replace(/^\@/, '');
	FRAMEWORK.debug('Found a binding ::', rawBinding, '::', namedParams);

	// If model doesn't contain the specified attribute...
	if ( typeof model.attributes[modelAttributeName] === 'undefined' ) {

		// fail silently.
		return;
		// FRAMEWORK.warn('Cannot bind `@'+modelAttributeName+' for template/component ' +
		// 	'`' + component.id +'`.\n'+
		// 	'No such attribute exists in the component\'s model.'
		// );
	}

	// Render a data binding
	var bindingVal = model.get(modelAttributeName) || '';
	renderFn( $matchedEl, bindingVal, namedParams );
};


/**
 * Render the specified type of data bindings
 *
 * @param {Object} options
 *		@option {Function} renderFn ($el, val, params)	-> function which renders the data binding for the specified element
 *			@param {JQueryElement} $el
 *			@param {?} val -> value of bound model attribute
 *			@param {Object} params -> keyed object of dynamic parameters from the name of the attribute itself
 *		@option {String} attribute -> name of bound attribute, e.g. 'bind-text'
 *		@option {Component} component
 *		@option {Backbone.Model} [model] - defaults to `component.model`
 */
var _renderBindings = function ( options ) {
	var component = options.component;
	var attributeExpression = options.attribute;
	var model = options.model || options.component.model;


	// Calculate string which can be "new-ed" into a RegExp
	var attrRegExpStr = _attrNameToRegExp(attributeExpression);
	var attrRegExp = new RegExp(attrRegExpStr);


	var boundAttrSelector = ':matchAttr("' + attrRegExpStr + '")';

	// Find all relevant descendant elements
	var $matches = _get$Matches(boundAttrSelector, component);

	// Early exit for simple bindings (w/o bound params)
	if ( !attributeExpression.match(/\:/)) {
		$matches.each(function () {
			_renderBinding($(this), attributeExpression, model, options.renderFn, {});

		});
		return;
	}

	console.log('\nRendering parameterized data binding: ',attrRegExp);

	// TODO: batch it up so we only do one DOM query
	$matches.each(function eachElementWithABinding () {
		var $matchedEl = $(this);

		// Get all attributes for this $el and filter a set of matching names/params
		var allDOMAttrNames = _.map( $matchedEl[0].attributes, function (el) {
			return el.nodeName;
		});
		console.log('allDOMAttrNames for el',allDOMAttrNames, $matchedEl);
		var matchingDOMAttrs = {};
		_.each( allDOMAttrNames, function eachAttribute ( domAttrName ) {
			// console.log('checking',domAttrName);
			if ( domAttrName.match(attrRegExp)) {
				matchingDOMAttrs[domAttrName] = _extractParameters( attrRegExp, domAttrName, attributeExpression );
				// console.log(', got',matchingDOMAttrs[domAttrName], ' (((',domAttrName, attributeExpression);
			}
		});


		console.log(' **** matchingDOMAttrs ::', matchingDOMAttrs);

		throw new Error('hwaaa');
		_.each(matchingDOMAttrs, function ( namedParams, domAttributeName ) {
			_renderBinding($matchedEl, domAttributeName, model, options.renderFn, namedParams);
		});

	});
};






/**
 * Create pseudo-selector for getting wildcard data attributes.
 *
 * Usage:
 * $(":matchAttr('^data-')")
 *
 * Source:
 * http://stackoverflow.com/a/13222509/486547
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
	renderCollection   = require('./renderCollection'),
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

},{"./bindEvents":1,"./close":2,"./lifecycleEvents":5,"./lifecycleHooks":6,"./render":7,"./renderCollection":8,"./validateDefinition":9}],5:[function(require,module,exports){
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
		helpers.renderDataBindings.call(self);


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

},{"../utils/DOM":28,"./bindEvents":1,"./helpers":3}],8:[function(require,module,exports){

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

},{}],9:[function(require,module,exports){
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

	// Expose a global for the custom FRAMEWORK.
	var frameworkName = options.frameworkId;
	window[frameworkName] = this;

	// Throughtout the source code, there are operations on `FRAMEWORK` or code that accesses
	// its attributes. We will make `FRAMEWORK` accessable by assigning it the instance of the
	// custom Framework.
	FRAMEWORK = window[frameworkName];
};

// Framework prototype methods.
Framework.prototype.Region = Region;
Framework.prototype.Component = Component;
Framework.prototype.define = define;
Framework.prototype.raise = raise;


},{"./component/index":4,"./define/index":11,"./raise/index":18,"./region/index":23}],13:[function(require,module,exports){
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

},{"./setup":14}],14:[function(require,module,exports){
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

},{}],15:[function(require,module,exports){
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

},{"../utils/events":29,"../utils/shorthand":30,"../utils/utils":31}],16:[function(require,module,exports){
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

},{}],17:[function(require,module,exports){
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

},{"../utils/utils":31}],18:[function(require,module,exports){
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

},{"../define/buildDefinition":10,"../logger/index":13,"../router/index":27,"./buildPrototype":15,"./collectRegions":16,"./collectTemplates":17}],19:[function(require,module,exports){
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

},{}],20:[function(require,module,exports){
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

},{}],21:[function(require,module,exports){
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

},{}],22:[function(require,module,exports){
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


	/**************************
	 * Template implementation
	 **************************/

	// Append sub-component(s) to region automatically
	if ( FRAMEWORK.options.shortcut.template && componentId ) {

		region.append(componentId);


		/***********************
		 * Count implementation
		 ***********************/

		if (FRAMEWORK.options.shortcut.count) {
			// If `count` is set, render sub-component specified number of times.
			// e.g. <region template="Foo" count="3" />
			var count = $(el).attr('count');

			if (count) {

				// Remove one from count because shortcut.template appends one.
				count -= 1;
				for (var i=0; i < count; i++ ) {
					region.append(componentId);
				}

				FRAMEWORK.debug(
					parent.id + ' :-: Instantiated new region' +
					( region.id ? ' `' + region.id + '`' : '' ) +
					( componentId ? ' and populated it with' +
						( count > 1 ? count + ' instances of' : ' 1' ) +
						' `' + componentId + '`' : ''
					) + '.'
				);
			}
		}
	}

	return region;
};

},{"../utils/utils":31}],23:[function(require,module,exports){
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

},{"./append":19,"./attach":20,"./empty":21,"./fromElement":22,"./insert":24,"./prepend":25,"./remove":26}],24:[function(require,module,exports){
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

},{}],25:[function(require,module,exports){
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

},{}],26:[function(require,module,exports){
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

},{}],27:[function(require,module,exports){
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

},{}],28:[function(require,module,exports){
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

},{"./events":29}],29:[function(require,module,exports){
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

},{"./utils.js":31}],30:[function(require,module,exports){
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
	else if ((matches = value.match(/^(.+)<\-(.*[^.\s])/)) && matches[1] && matches[2]) {
		fn = function attachTemplate() {
			FRAMEWORK.verbose(this.id + ' :: Attaching `' + matches[2] + '` to `' + matches[1] + '`...');

			var region = matches[1];
			var template = matches[2];

			if (!this[region]) {
				FRAMEWORK.error(this.id,':: Trying to attach region with shorthand ('+matches+'), but could not find region `', region,'`');
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

},{}],31:[function(require,module,exports){
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
},{}]},{},[12])
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9jb21wb25lbnQvYmluZEV2ZW50cy5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL2NvbXBvbmVudC9jbG9zZS5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL2NvbXBvbmVudC9oZWxwZXJzLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvY29tcG9uZW50L2luZGV4LmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvY29tcG9uZW50L2xpZmVjeWNsZUV2ZW50cy5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL2NvbXBvbmVudC9saWZlY3ljbGVIb29rcy5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL2NvbXBvbmVudC9yZW5kZXIuanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9jb21wb25lbnQvcmVuZGVyQ29sbGVjdGlvbi5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL2NvbXBvbmVudC92YWxpZGF0ZURlZmluaXRpb24uanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9kZWZpbmUvYnVpbGREZWZpbml0aW9uLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvZGVmaW5lL2luZGV4LmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvaW5kZXguanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9sb2dnZXIvaW5kZXguanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9sb2dnZXIvc2V0dXAuanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9yYWlzZS9idWlsZFByb3RvdHlwZS5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL3JhaXNlL2NvbGxlY3RSZWdpb25zLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvcmFpc2UvY29sbGVjdFRlbXBsYXRlcy5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL3JhaXNlL2luZGV4LmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvcmVnaW9uL2FwcGVuZC5qcyIsIi9Vc2Vycy9naGVybmFuZGV6MzQ1L2NvZGUvbWFzdC9saWIvc3JjL3JlZ2lvbi9hdHRhY2guanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9yZWdpb24vZW1wdHkuanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9yZWdpb24vZnJvbUVsZW1lbnQuanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9yZWdpb24vaW5kZXguanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9yZWdpb24vaW5zZXJ0LmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvcmVnaW9uL3ByZXBlbmQuanMiLCIvVXNlcnMvZ2hlcm5hbmRlejM0NS9jb2RlL21hc3QvbGliL3NyYy9yZWdpb24vcmVtb3ZlLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvcm91dGVyL2luZGV4LmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvdXRpbHMvRE9NLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvdXRpbHMvZXZlbnRzLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvdXRpbHMvc2hvcnRoYW5kLmpzIiwiL1VzZXJzL2doZXJuYW5kZXozNDUvY29kZS9tYXN0L2xpYi9zcmMvdXRpbHMvdXRpbHMuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvWUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNYQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2S0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1S0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNYQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNaQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1SkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXNcbiAqL1xudmFyIGhlbHBlcnMgPSByZXF1aXJlKCcuL2hlbHBlcnMnKTtcblxuXG4vKipcbiAqIEJpbmQgY29sbGVjdGlvbiBldmVudHMgdG8gbGlmZWN5Y2xlIGV2ZW50IGhhbmRsZXJzXG4gKi9cbmV4cG9ydHMuY29sbGVjdGlvbkV2ZW50cyA9IGZ1bmN0aW9uKCkge1xuXHQvLyBCaW5kIHRvIGNvbGxlY3Rpb24gZXZlbnRzIGlmIG9uZSB3YXMgcGFzc2VkIGluXG5cdGlmICh0aGlzLmNvbGxlY3Rpb24pIHtcblxuXHRcdC8vIExpc3RlbiB0byBldmVudHNcblx0XHR0aGlzLmxpc3RlblRvKHRoaXMuY29sbGVjdGlvbiwgJ2FkZCcsIHRoaXMuYWZ0ZXJBZGQpO1xuXHRcdHRoaXMubGlzdGVuVG8odGhpcy5jb2xsZWN0aW9uLCAncmVtb3ZlJywgdGhpcy5hZnRlclJlbW92ZSk7XG5cdFx0dGhpcy5saXN0ZW5Ubyh0aGlzLmNvbGxlY3Rpb24sICdyZXNldCcsIHRoaXMuYWZ0ZXJSZXNldCk7XG5cdH1cbn07XG5cbi8qKlxuICogQmluZCBtb2RlbCBldmVudHMgdG8gbGlmZWN5Y2xlIGV2ZW50IGhhbmRsZXJzIGFuZCBhbHNvIGFsbG93cyBmb3IgaGFuZGxlcnMgdG8gZmlyZVxuICogb24gY2VydGFpbiBtb2RlbCBhdHRyaWJ1dGUgY2hhbmdlcy5cbiAqL1xuZXhwb3J0cy5tb2RlbEV2ZW50cyA9IGZ1bmN0aW9uKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0aWYgKHRoaXMubW9kZWwpIHtcblxuXHRcdC8vIExpc3RlbiBmb3IgYW55IGF0dHJpYnV0ZSBjaGFuZ2VzXG5cdFx0Ly8gZS5nLlxuXHRcdC8vIC5hZnRlckNoYW5nZShtb2RlbCwgb3B0aW9ucylcblx0XHQvL1xuXHRcdHRoaXMubGlzdGVuVG8odGhpcy5tb2RlbCwgJ2NoYW5nZScsIGZ1bmN0aW9uIG1vZGVsQ2hhbmdlZCAobW9kZWwsIG9wdGlvbnMpIHtcblxuXHRcdFx0Ly8gQXBwbHkgZGF0YSBiaW5kaW5nc1xuXHRcdFx0aGVscGVycy5yZW5kZXJEYXRhQmluZGluZ3MuY2FsbChzZWxmKTtcblxuXHRcdFx0Ly8gUnVuIGN1c3RvbSBgYWZ0ZXJDaGFuZ2VgKCkgbWV0aG9kXG5cdFx0XHRpZiAoXy5pc0Z1bmN0aW9uKHRoaXMuYWZ0ZXJDaGFuZ2UpKSB7XG5cdFx0XHRcdHRoaXMuYWZ0ZXJDaGFuZ2UobW9kZWwsIG9wdGlvbnMpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Ly8gTGlzdGVuIGZvciBzcGVjaWZpYyBhdHRyaWJ1dGUgY2hhbmdlc1xuXHRcdC8vIGUuZy5cblx0XHQvLyAuYWZ0ZXJDaGFuZ2UuY29sb3IobW9kZWwsIHZhbHVlLCBvcHRpb25zKVxuXHRcdGlmIChfLmlzT2JqZWN0KHRoaXMuYWZ0ZXJDaGFuZ2UpKSB7XG5cdFx0XHRfLmVhY2godGhpcy5hZnRlckNoYW5nZSwgZnVuY3Rpb24gKGhhbmRsZXIsIGF0dHJOYW1lKSB7XG5cblx0XHRcdFx0Ly8gQ2FsbCBoYW5kbGVyIHdpdGggbmV3VmFsIHRvIGtlZXAgYXJndW1lbnRzIHN0cmFpZ2h0Zm9yd2FyZFxuXHRcdFx0XHR0aGlzLmxpc3RlblRvKHRoaXMubW9kZWwsICdjaGFuZ2U6JyArIGF0dHJOYW1lLCBmdW5jdGlvbiBhdHRyQ2hhbmdlZCAobW9kZWwsIG5ld1ZhbCkge1xuXHRcdFx0XHRcdGhhbmRsZXIuY2FsbCh0aGlzLCBuZXdWYWwpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0fSwgdGhpcyk7XG5cdFx0fVxuXHR9XG59O1xuXG4vKipcbiAqIExpc3RlbnMgZm9yIGFuZCBydW5zIGhhbmRsZXJzIG9uIGdsb2JhbCBldmVudHMgdGhhdCBhcmUgbGlzdGVuZWQgZm9yIG9uIGEgY29tcG9uZW50LlxuICovXG5leHBvcnRzLmdsb2JhbFRyaWdnZXJzID0gZnVuY3Rpb24oKSB7XG5cblx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdHRoaXMubGlzdGVuVG8oRlJBTUVXT1JLLCAnYWxsJywgZnVuY3Rpb24gKGVSb3V0ZSkge1xuXG5cdFx0Ly8gVHJpbSBvZmYgYWxsIGJ1dCB0aGUgZmlyc3QgYXJndW1lbnQgdG8gcGFzcyB0aHJvdWdoIHRvIGhhbmRsZXJcblx0XHR2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG5cdFx0YXJncy5zaGlmdCgpO1xuXG5cdFx0Ly8gSXRlcmF0ZSB0aHJvdWdoIGVhY2ggc3Vic2NyaXB0aW9uIG9uIHRoaXMgY29tcG9uZW50XG5cdFx0Ly8gYW5kIGxpc3RlbiBmb3IgdGhlIHNwZWNpZmllZCBnbG9iYWwgZXZlbnRzXG5cdFx0Xy5lYWNoKHNlbGYuc3Vic2NyaXB0aW9ucywgZnVuY3Rpb24oaGFuZGxlciwgbWF0Y2hQYXR0ZXJuKSB7XG5cblx0XHRcdC8vIEdyYWIgcmVnZXggYW5kIHBhcmFtIHBhcnNpbmcgbG9naWMgZnJvbSBCYWNrYm9uZSBjb3JlXG5cdFx0XHR2YXIgZXh0cmFjdFBhcmFtcyA9IEJhY2tib25lLlJvdXRlci5wcm90b3R5cGUuX2V4dHJhY3RQYXJhbWV0ZXJzLFxuXHRcdFx0XHRjYWxjdWxhdGVSZWdleCA9IEJhY2tib25lLlJvdXRlci5wcm90b3R5cGUuX3JvdXRlVG9SZWdFeHA7XG5cblx0XHRcdC8vIFRyaW0gdHJhaWxpbmdcblx0XHRcdG1hdGNoUGF0dGVybiA9IG1hdGNoUGF0dGVybi5yZXBsYWNlKC9cXC8qJC9nLCAnJyk7XG5cdFx0XHQvLyBhbmQgZXIgc29ydCBvZi4uIGxlYWRpbmcuLiBzbGFzaGVzXG5cdFx0XHRtYXRjaFBhdHRlcm4gPSBtYXRjaFBhdHRlcm4ucmVwbGFjZSgvXihbI34lXSlcXC8qL2csICckMScpO1xuXHRcdFx0Ly8gVE9ETzogb3B0aW1pemF0aW9uLSB0aGlzIHJlYWxseSBvbmx5IGhhcyB0byBiZSBkb25lIG9uY2UsIG9uIHJhaXNlKCksIHdlIHNob3VsZCBkbyB0aGF0XG5cblxuXHRcdFx0Ly8gQ29tZSB1cCB3aXRoIHJlZ2V4IGZvciB0aGlzIG1hdGNoUGF0dGVyblxuXHRcdFx0dmFyIHJlZ2V4ID0gY2FsY3VsYXRlUmVnZXgobWF0Y2hQYXR0ZXJuKTtcblxuXHRcdFx0Ly8gSWYgdGhpcyBtYXRjaFBhdGVybiBpcyB0aGlzIGlzIG5vdCBhIG1hdGNoIGZvciB0aGUgZXZlbnQsXG5cdFx0XHQvLyBgY29udGludWVgIGl0IGFsb25nIHRvIGl0IGNhbiB0cnkgdGhlIG5leHQgbWF0Y2hQYXR0ZXJuXG5cdFx0XHRpZiAoIWVSb3V0ZS5tYXRjaChyZWdleCkpIHJldHVybjtcblxuXHRcdFx0Ly8gUGFyc2UgcGFyYW1ldGVycyBmb3IgdXNlIGFzIGFyZ3MgdG8gdGhlIGhhbmRsZXJcblx0XHRcdC8vIChvciBhbiBlbXB0eSBsaXN0IGlmIG5vbmUgZXhpc3QpXG5cdFx0XHR2YXIgcGFyYW1zID0gZXh0cmFjdFBhcmFtcyhyZWdleCwgZVJvdXRlKTtcblxuXHRcdFx0Ly8gSGFuZGxlIHN0cmluZyByZWRpcmVjdHMgdG8gZnVuY3Rpb24gbmFtZXNcblx0XHRcdGlmICghXy5pc0Z1bmN0aW9uKGhhbmRsZXIpKSB7XG5cdFx0XHRcdGhhbmRsZXIgPSBzZWxmW2hhbmRsZXJdO1xuXG5cdFx0XHRcdGlmICghaGFuZGxlcikge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IHRyaWdnZXIgc3Vic2NyaXB0aW9uIGJlY2F1c2Ugb2YgdW5rbm93biBoYW5kbGVyOiAnICsgaGFuZGxlcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gQmluZCBjb250ZXh0IGFuZCBhcmd1bWVudHMgdG8gc3Vic2NyaXB0aW9uIGhhbmRsZXJcblx0XHRcdGhhbmRsZXIuYXBwbHkoc2VsZiwgXy51bmlvbihhcmdzLCBwYXJhbXMpKTtcblxuXHRcdH0pO1xuXHR9KTtcbn07XG4iLCIvKipcbiAqIFNhZmVseSB6YXAgZXZlcnkgdHJhY2UgYWJvdXQgdGhpcyBjb21wb25lbnQgZnJvbSBtZW1vcnkuXG4gKi9cblxudmFyIGhlbHBlcnMgPSByZXF1aXJlKCcuL2hlbHBlcnMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjbG9zZSgpIHtcblxuXHRGUkFNRVdPUksuZGVidWcoJ0Nsb3NlZCAnICsgdGhpcy5pZCArICcgY29tcG9uZW50LicpO1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0Ly8gQ2FuY2VsIGN1cnJlbnQgcmVuZGVyIGFuZCBjbG9zZSBqb2JzLCBpZiB0aGV5J3JlIHJ1bm5pbmdcblx0aWYgKHRoaXMuX3JlbmRlcmluZykge1xuXHRcdHNlbGYuX3JlbmRlcmluZ0NhbmNlbGVkID0gdHJ1ZTtcblx0XHR0aGlzLmNhbmNlbFJlbmRlcigpO1xuXHRcdHNlbGYuX3JlbmRlcmluZyA9IGZhbHNlO1xuXHR9XG5cdGlmICh0aGlzLl9jbG9zaW5nKSB7XG5cdFx0dGhpcy5jYW5jZWxDbG9zZSgpO1xuXHRcdHNlbGYuX2Nsb3NpbmcgPSBmYWxzZTtcblx0fVxuXG5cdC8vIExvY2sgYWNjZXNzIHRvIGNsb3NlKClcblx0dGhpcy5fY2xvc2luZyA9IHRydWU7XG5cblx0dGhpcy5iZWZvcmVDbG9zZShmdW5jdGlvbiAoKSB7XG5cblx0XHQvLyA+IE5PVEU6IGB0aGlzLl9jbG9zaW5nPWZhbHNlYCBjYW4gYW5kIHByb2JhYmx5IHNob3VsZCBiZSByZW1vdmVkLFxuXHRcdC8vID4gc2luY2UgbXV0ZXggaXMgdW5uZWNlc3Nhcnkgbm93IHRoYXQgdGhlIGNvbXBvbmVudCBpcyB1cCBmb3IgZ2FyYmFnZSBjb2xsZWN0aW9uXG5cdFx0Ly8gPiBXYWl0aW5nIHRvIGRvIHRoaXMgdW50aWwgaXQgY2FuIGJlIHRlc3RlZCBmdXJ0aGVyXG5cblx0XHQvLyBVbmxvY2sgY2xvc2UoKVxuXHRcdHNlbGYuX2Nsb3NpbmcgPSBmYWxzZTtcblxuXHRcdC8vIFN0b3AgbGlzdGVuaW5nIHRvIGFsbCBnbG9iYWwgdHJpZ2dlcnMgKCV8IylcblxuXHRcdC8vIENsb3NlIGFsbCBjaGlsZCBjb21wb25lbnRzXG5cblx0XHRoZWxwZXJzLmVtcHR5QWxsUmVnaW9ucy5jYWxsKHNlbGYpO1xuXG5cdFx0Ly8gQ2FsbCBuYXRpdmUgYEJhY2tib25lLlZpZXcucHJvdG90eXBlLnJlbW92ZSgpYFxuXHRcdC8vIHRvIHVuZGVsZWdhdGUgZXZlbnRzLCBldGMuXG5cdFx0c2VsZi5yZW1vdmUoKTtcblxuXHR9KTtcbn07XG4iLCJcbnZhciBfYmluZGluZ3MgPSB7XG5cblx0dGV4dDoge1xuXHRcdHJlZ2V4cDogL2JpbmQtdGV4dC8sXG5cdFx0Zm46IGZ1bmN0aW9uICgkZWwsIG1vZGVsKSB7XG5cdFx0XHR2YXIgcmF3ID0gJGJvdW5kRWwuYXR0cignYmluZC10ZXh0Jyk7XG5cdFx0XHR2YXIgY2xlYW4gPSByYXcucmVwbGFjZSgvXkAvLCAnJyk7XG5cdFx0XHQkYm91bmRFbC50ZXh0KCBtb2RlbC5nZXQoY2xlYW4pICk7XG5cdFx0fVxuXHR9LFxuXG5cdCdjbGFzcyc6IHtcblx0XHRyZWdleHA6IC9iaW5kXFwtY2xhc3NcXC0oW14tXSspLyxcblx0XHRmbjogZnVuY3Rpb24gKCRlbCwgbW9kZWwsIG1hdGNoZXMpIHtcblx0XHRcdC8vIFJlZ2V4cCBtYXRjaGVzIGZvciB3aWxkY2FyZCBwYXJhbXMgaW4gYXR0cmlidXRlIG1hdGNoIGV4cHJlc3Npb25cblx0XHRcdHZhciBjbGFzc05hbWUgPSBtYXRjaGVzWzFdO1xuXG5cdFx0XHR2YXIgcmF3ID0gJGJvdW5kRWwuYXR0cignYmluZC1jbGFzcy0nICsgY2xhc3NOYW1lKTtcblx0XHRcdHZhciBjbGVhbiA9IHJhdy5yZXBsYWNlKC9eQC8sICcnKTtcblx0XHRcdGlmICggbW9kZWwuZ2V0KGNsZWFuKSApIHtcblx0XHRcdFx0JGJvdW5kRWwuYWRkQ2xhc3MoY2xhc3NOYW1lKTtcblx0XHRcdH1cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHQkYm91bmRFbC5yZW1vdmVDbGFzcyhjbGFzc05hbWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufTtcblxuXG4vKipcbiAqIEhlbHBlciBmdW5jdGlvbnMgdXNlZCBieSBjb21wb25lbnRzXG4gKi9cblxudmFyIGhlbHBlcnMgPSBtb2R1bGUuZXhwb3J0cyA9IHtcblxuXG5cblx0LyoqXG5cdCAqIFJlbmRlciBtb2RlbCBiaW5kaW5ncy5cblx0ICogICArIGBiaW5kLXRleHRgXG5cdCAqICAgKyBtb3JlIHRvIGNvbWVcblx0ICpcblx0ICogQ2FsbGVkIGJ5IENvbXBvbmVudCB3aGVuIGl0cyBtb2RlbCBjaGFuZ2VzLlxuXHQgKi9cblx0cmVuZGVyRGF0YUJpbmRpbmdzOiBmdW5jdGlvbiAoKSB7XG5cdFx0RlJBTUVXT1JLLmRlYnVnKCdSZW5kZXJpbmcgZGF0YSBiaW5kaW5ncyBmb3IgJywgdGhpcy5pZCwnY29tcG9uZW50Li4uJyk7XG5cblx0XHQvLyBFbnN1cmUgdGhhdCBtb2RlbCBleGlzdHNcblx0XHRpZiAoIXRoaXMubW9kZWwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihcblx0XHRcdFx0J1RyeWluZyB0byBib290c3RyYXAgZGF0YSBiaW5kaW5ncyBmb3IgY29tcG9uZW50ICgnICsgdGhpcy5pZCArICcpLCAnICtcblx0XHRcdFx0J2J1dCBpdCBoYXMgbm8gbW9kZWwhJyk7XG5cdFx0fVxuXHRcdHZhciBtb2RlbCA9IHRoaXMubW9kZWw7XG5cblx0XHQvLyBqUXVlcnkgc2VsZWN0b3IgZm9yIGdyYWJiaW5nIGFsbCBlbGVtZW50cyB3LyBkYXRhIGJpbmRpbmdzXG5cdFx0dmFyIGJpbmRpbmdTZWxlY3RvciA9ICdbYmluZC10ZXh0XSwgOm1hdGNoQXR0cihcIl5iaW5kLWNsYXNzLSokXCIpJztcblxuXHRcdC8vIEdldCBlbGVtZW50cyBpbiB0aGlzIGNvbXBvbmVudCB3aGljaCBoYXZlIGRhdGEgYmluZGluZ3Ncblx0XHQvLyAoaWdub3JlcyBjb250ZW50cyBvZiByZWdpb25zIGlmIHRoZXkgZXhpc3QpXG5cdFx0dmFyICRib3VuZEVsZW1lbnRzID0gXyRzZWxlY3RPdXRlci5jYWxsKHRoaXMsIGJpbmRpbmdTZWxlY3Rvcik7XG5cblx0XHQvLyBMb29wIHRocm91Z2ggZWFjaCBib3VuZCBhdHRyaWJ1dGUgb2YgZWFjaCBib3VuZCBlbGVtZW50XG5cdFx0Ly8gYW5kIGNhbGwgdGhlIGFwcHJvcHJpYXRlIHJlbmRlciBtZXRob2QuXG5cdFx0JGJvdW5kRWxlbWVudHMuZWFjaChmdW5jdGlvbiBlYWNoQm91bmRFbGVtZW50ICgpIHtcblx0XHRcdCRib3VuZEVsID0gJCh0aGlzKTtcblxuXHRcdFx0dmFyIGFsbEF0dHJpYnV0ZXMgPSAkYm91bmRFbFswXS5hdHRyaWJ1dGVzO1xuXHRcdFx0Xy5lYWNoKGFsbEF0dHJpYnV0ZXMsIGZ1bmN0aW9uIChhdHRyKSB7XG5cdFx0XHRcdHZhciBhdHRyTmFtZSA9IGF0dHIubm9kZU5hbWU7XG5cblx0XHRcdFx0Xy5lYWNoKF9iaW5kaW5ncywgZnVuY3Rpb24gZWFjaEJpbmRpbmdGb3JtdWxhICggYmluZGluZyApIHtcblx0XHRcdFx0XHR2YXIgbWF0Y2hlcyA9IGF0dHJOYW1lLm1hdGNoKGJpbmRpbmcucmVnZXhwKTtcblx0XHRcdFx0XHRpZiAoIG1hdGNoZXMgKSB7XG5cdFx0XHRcdFx0XHRiaW5kaW5nLmZuKCRib3VuZEVsLCBtb2RlbCwgbWF0Y2hlcyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9LFxuXG5cblxuXHQvKipcblx0ICogSWYgYW55IHJlZ2lvbnMgZXhpc3QgaW4gdGhpcyBjb21wb25lbnQsXG5cdCAqIGVtcHR5IHRoZW0sIGFuZCB0aGVuIGRlbGV0ZSB0aGVtXG5cdCAqL1xuXHRlbXB0eUFsbFJlZ2lvbnM6IGZ1bmN0aW9uKCkge1xuXHRcdF8uZWFjaCh0aGlzLnJlZ2lvbnMsIGZ1bmN0aW9uIChyZWdpb24sIGtleSkge1xuXHRcdFx0cmVnaW9uLmVtcHR5KCk7XG5cdFx0XHRkZWxldGUgdGhpcy5yZWdpb25zW2tleV07XG5cdFx0fSwgdGhpcyk7XG5cdH0sXG5cblx0LyoqXG5cdCAqIEluc3RhbnRpYXRlIHJlZ2lvbiBjb21wb25lbnRzIGFuZCBhcHBlbmQgYW55IGRlZmF1bHRcblx0ICogdGVtcGxhdGVzL2NvbXBvbmVudHMgdG8gdGhlIERPTVxuXHQgKi9cblx0cmVuZGVyUmVnaW9uczogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdFx0aGVscGVycy5lbXB0eUFsbFJlZ2lvbnMoKTtcblxuXHRcdC8vIERldGVjdCBjaGlsZCByZWdpb25zIGluIHRlbXBsYXRlXG5cdFx0dmFyICRyZWdpb25zID0gdGhpcy4kKCdyZWdpb24sIFtkYXRhLXJlZ2lvbl0nKTtcblx0XHQkcmVnaW9ucy5lYWNoKGZ1bmN0aW9uIChpLCBlbCkge1xuXG5cdFx0XHQvLyBQcm92aWRlIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5IGZvclxuXHRcdFx0Ly8gYGRlZmF1bHRgLCBgY29udGVudHNgIGFuZCBgdGVtcGxhdGVgIG5vdGF0aW9uXG5cdFx0XHQvLyBOb3JtYWxpemVzIG5vdGF0aW9uIHRvIGBjb250ZW50c2AgYXR0cmlidXRlLlxuXHRcdFx0dmFyIGNvbXBvbmVudElkID0gJChlbCkuYXR0cignZGVmYXVsdCcpO1xuXHRcdFx0Y29tcG9uZW50SWQgPSBjb21wb25lbnRJZCB8fCAkKGVsKS5hdHRyKCdjb250ZW50cycpO1xuXHRcdFx0Y29tcG9uZW50SWQgPSBjb21wb25lbnRJZCB8fCAkKGVsKS5hdHRyKCd0ZW1wbGF0ZScpO1xuXHRcdFx0JChlbCkuYXR0cignY29udGVudHMnLCBjb21wb25lbnRJZCk7XG5cblx0XHRcdC8vIEdlbmVyYXRlIGEgcmVnaW9uIGluc3RhbmNlIGZyb20gdGhlIGVsZW1lbnRcblx0XHRcdC8vIChtb2RpZnlpbmcgdGhlIERPTSBhcyBuZWNlc3NhcnkpXG5cdFx0XHR2YXIgcmVnaW9uID0gRlJBTUVXT1JLLlJlZ2lvbi5mcm9tRWxlbWVudChlbCwgc2VsZik7XG5cblx0XHRcdC8vIElmIHJlZ2lvbiBoYXMgbm8gaWQsIGdlbmVyYXRlIGEgdW5pcXVlIHJlZ2lvbiBpZCB3L2kgdGhpcyBjb21wb25lbnRcblx0XHRcdC8vIHRoYXQgaXMgdW5saWtlbHkgdG8gY29sbGlkZSB3aXRoIG15IG90aGVyIG5hbWVkIHJlZ2lvbnNcblx0XHRcdGlmICghcmVnaW9uLmlkKSB7XG5cdFx0XHRcdHJlZ2lvbi5pZCA9ICcnK1xuXHRcdFx0XHRcdEZSQU1FV09SSy5vcHRpb25zLmZyYW1ld29ya0lkICtcblx0XHRcdFx0XHQnX19hbm9ueW1vdXNfcmVnaW9uX18nICtcblx0XHRcdFx0XHRzZWxmLmFub255bW91c1JlZ2lvbkNvdW50ZXI7XG5cblx0XHRcdFx0Ly8gSW5jcmVtZW50IGNvdW50ZXIgZm9yIG5leHQgdGltZVxuXHRcdFx0XHRzZWxmLmFub255bW91c1JlZ2lvbkNvdW50ZXIrKztcblx0XHRcdH1cblxuXHRcdFx0Ly8gS2VlcCB0cmFjayBvZiByZWdpb25zLCBzaW5jZSB3ZSBhcmUgdGhlIHBhcmVudCBjb21wb25lbnRcblx0XHRcdHNlbGYucmVnaW9uc1tyZWdpb24uaWRdID0gcmVnaW9uO1xuXG5cdFx0XHQvLyBBcyBsb25nIGFzIHRoZXJlIGFyZSBubyBjb2xsaXNpb25zLFxuXHRcdFx0Ly8gcHJvdmlkZSBhIGZyaWVuZGx5IHJlZmVyZW5jZSB0byB0aGUgcmVnaW9uIG9uIHRoZSB0b3AgbGV2ZWwgb2YgdGhlIGNvbGxlY3Rpb25cblx0XHRcdGlmICghc2VsZltyZWdpb24uaWRdKSB7XG5cdFx0XHRcdHNlbGZbcmVnaW9uLmlkXSA9IHJlZ2lvbjtcblx0XHRcdH1cblx0XHR9KTtcblx0fSxcblxuXHQvKipcblx0ICogQ29udmVydCB0ZW1wbGF0ZSBIVE1MIGFuZCBkYXRhIGludG8gYSBjb21waWxlZCAkdGVtcGxhdGVcblx0ICovXG5cdGNvbXBpbGVUZW1wbGF0ZTogZnVuY3Rpb24oKSB7XG5cblx0XHQvLyBDcmVhdGUgdGVtcGxhdGUgZGF0YSBjb250ZXh0IGJ5IHByb3ZpZGluZyBhY2Nlc3MgdG8gdGhlIGdsb2JhbCBEYXRhIG9iamVjdCxcblx0XHQvLyBBbHNvIGZvbGQgaW4gdGhlIG1vZGVsIGFzc29jaWF0ZWQgd2l0aCB0aGlzIGNvbXBvbmVudCwgaWYgdGhlcmUgaXMgb25lXG5cdFx0dmFyIHRlbXBsYXRlQ29udGV4dCA9IF8uZXh0ZW5kKHtcblxuXHRcdFx0Ly8gQWxsb3dzIHlvdSB0byBnZXQgYSBob2xkIG9mIGRhdGEsXG5cdFx0XHQvLyBidXQgdXNlIGEgZGVmYXVsdCB2YWx1ZSBpZiBpdCBkb2Vzbid0IGV4aXN0XG5cdFx0XHRnZXQ6IGZ1bmN0aW9uIChrZXksIGRlZmF1bHRWYWwpIHtcblx0XHRcdFx0dmFyIHZhbCA9IHRlbXBsYXRlQ29udGV4dFtrZXldO1xuXHRcdFx0XHRpZiAodHlwZW9mIHZhbCA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdFx0XHR2YWwgPSBkZWZhdWx0VmFsO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB2YWw7XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdC8vIEFsbCBGUkFNRVdPUksuZGF0YSBpcyBhdmFpbGFibGUgaW4gZXZlcnkgdGVtcGxhdGVcblx0XHRGUkFNRVdPUksuZGF0YSk7XG5cblx0XHQvLyBJZiBhIG1vZGVsIGlzIHByb3ZpZGVkIGZvciB0aGlzIGNvbXBvbmVudCwgbWFrZSBpdCBhdmFpbGFibGUgaW4gdGhpcyB0ZW1wbGF0ZVxuXHRcdGlmICh0aGlzLm1vZGVsKSB7XG5cdFx0XHRfLmV4dGVuZCh0ZW1wbGF0ZUNvbnRleHQsIHRoaXMubW9kZWwuYXR0cmlidXRlcyk7XG5cdFx0fVxuXG5cdFx0Ly8gVGVtcGxhdGUgdGhlIEhUTUwgd2l0aCB0aGUgZGF0YVxuXHRcdHZhciBodG1sO1xuXHRcdHRyeSB7XG5cdFx0XHQvLyBBY2NlcHQgcHJlY29tcGlsZWQgdGVtcGxhdGVzXG5cdFx0XHRpZiAoXy5pc0Z1bmN0aW9uKHRoaXMudGVtcGxhdGUpKSB7XG5cdFx0XHRcdGh0bWwgPSB0aGlzLnRlbXBsYXRlKHRlbXBsYXRlQ29udGV4dCk7XG5cdFx0XHR9XG5cdFx0XHQvLyBPciByYXcgc3RyaW5nc1xuXHRcdFx0ZWxzZSBodG1sID0gXy50ZW1wbGF0ZSh0aGlzLnRlbXBsYXRlLCB0ZW1wbGF0ZUNvbnRleHQpO1xuXHRcdH1cblx0XHRjYXRjaCAoZSkge1xuXHRcdFx0dmFyIHN0ciA9IGUsXG5cdFx0XHRcdHN0YWNrID0gJyc7XG5cblx0XHRcdGlmIChlIGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdFx0c3RyID0gIGUudG9TdHJpbmcoKTtcblx0XHRcdFx0c3RhY2sgPSBlLnN0YWNrO1xuXHRcdFx0fVxuXG5cdFx0XHRGUkFNRVdPUksuZXJyb3IodGhpcy5pZCArICcgOjogQ2Fubm90IHJlbmRlcigpIHRlbXBsYXRlIChwcm9iYWJseSBtaXNzaW5nIGRhdGEpLlxcblxcbkdvdCB0aGlzIGVycm9yIDo6XFxuJytzdHIsJ1xcbicpO1xuXHRcdFx0aWYgKGh0bWwpIHtGUkFNRVdPUksudmVyYm9zZSgnVGVtcGxhdGUgOjogJyArIGh0bWwpO31cblx0XHRcdEZSQU1FV09SSy52ZXJib3NlKCdGdWxsIFRlbXBsYXRlIEVycm9yOicgKyAnXFxuJyxzdGFjayk7XG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZSgnXFxuXFxuTW9yZSBpbmZvcm1hdGlvbjonLCAnXFxuXFxuVGVtcGxhdGUgY29udGV4dCA6OicsdGVtcGxhdGVDb250ZXh0LCAnXFxuXFxudGhpcy5tb2RlbDo6JywgdGhpcy5tb2RlbCk7XG5cdFx0XHRodG1sID0gXy5pc1N0cmluZyh0aGlzLnRlbXBsYXRlKSA/IHRoaXMudGVtcGxhdGUgOiBzdHI7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGh0bWw7XG5cdH1cblxufTtcblxuXG5cblxuLy8gUHJpdmF0ZSBpbnRyYS1oZWxwZXIgbWV0aG9kc1xuXG5cblxuLyoqXG4gKiBMb29rdXAgc3VpdGFibGUgZWxlbWVudHMgd2l0aGluIHRoaXMgY29tcG9uZW50J3MgJGVsIGNvbnRleHQuXG4gKiBJZ25vcmUgcmVnaW9ucywgYW5kIGluY2x1ZGUgdGhlIHRvcC1sZXZlbCBlbGVtZW50LlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBiaW5kaW5nU2VsZWN0b3IgLSBET00gc2VsZWN0b3IgdG8gdXNlXG4gKi9cbnZhciBfJHNlbGVjdE91dGVyID0gZnVuY3Rpb24gKCBiaW5kaW5nU2VsZWN0b3IgKSB7XG5cblx0Ly8gTG9va3VwIG1hdGNoZXNcblx0dmFyICRtYXRjaGVzID0gdGhpcy4kKGJpbmRpbmdTZWxlY3Rvcik7XG5cblx0Ly8gSWYgdG9wLWxldmVsIGVsZW1lbnQgaW4gdGVtcGxhdGUgaGFzIGEgZGF0YS1iaW5kaW5nLCBpbmNsdWRlIGl0XG5cdGlmICh0aGlzLiRlbC5maWx0ZXIoYmluZGluZ1NlbGVjdG9yKSkge1xuXHRcdCRtYXRjaGVzID0gJC5tZXJnZSgkbWF0Y2hlcywgdGhpcy4kZWwpO1xuXHR9XG5cblx0Ly8gT21pdCBhbnl0aGluZyBpbnNpZGUgYSByZWdpb24sIHNpbmNlIHRob3NlIGJpbmRpbmdzIHdpbGwgaGF2ZSBhbHJlYWR5XG5cdC8vIGJlZW4gdGFrZW4gY2FyZSBvZiBieSBvbmUgb2YgdGhlIGRlc2NlbmRhbnQgY29tcG9uZW50KHMpIHdpdGhpbiB0aGUgcmVnaW9uLlxuXHQvL1xuXHQvLyBUT0RPOiBvcHRpbWl6ZSB0byBleGNsdWRlIHRoZXNlIGVsZW1lbnRzIGZyb20gdGhlIG9yaWdpbmFsIERPTSBzZWxlY3Rpb25cblx0JG1hdGNoZXMgPSAkbWF0Y2hlcy5ub3QoIHRoaXMuJCgncmVnaW9uICosIFtkYXRhLXJlZ2lvbl0gKicpICk7XG5cblx0cmV0dXJuICRtYXRjaGVzO1xufTtcblxuXG5cbi8vIFJlZ2V4cHMgZm9yIGRldGVjdGlvbiBvZiB3aWxkY2FyZCBuYW1lZCBwYXJhbWV0ZXJzIGluIGN1c3RvbSBlbGVtZW50IGF0dHJpYnV0ZSBuYW1lcy5cbnZhciBvcHRpb25hbFBhcmFtID0gL1xcKCguKj8pXFwpL2c7XG52YXIgbmFtZWRQYXJhbSA9IC8oXFwoXFw/KT86XFx3Ky9nO1xudmFyIHNwbGF0UGFyYW0gPSAvXFwqXFx3Ky9nO1xudmFyIGVzY2FwZVJlZ0V4cCA9IC9bXFwte31cXFtcXF0rPy4sXFxcXFxcXiR8I1xcc10vZztcblxuXG4vLyBCdWlsZCBzZWxlY3RvciBmb3Igc3VwZXJzZXQgb2YgdGhlc2UgYmluZGluZ3NcbnZhciBfYXR0ck5hbWVUb1JlZ0V4cCA9IGZ1bmN0aW9uKCBhdHRyRXhwcmVzc2lvbiApIHtcblxuXHRhdHRyRXhwcmVzc2lvbiA9IGF0dHJFeHByZXNzaW9uLnJlcGxhY2UoZXNjYXBlUmVnRXhwLCAnXFxcXCQmJylcblx0XHQucmVwbGFjZShvcHRpb25hbFBhcmFtLCAnKD86JDEpPycpXG5cdFx0LnJlcGxhY2UobmFtZWRQYXJhbSwgZnVuY3Rpb24obWF0Y2gsIG9wdGlvbmFsKSB7XG5cdFx0XHRyZXR1cm4gb3B0aW9uYWwgPyBtYXRjaCA6ICcoW15cXC9dKyknO1xuXHRcdH0pXG5cdFx0LnJlcGxhY2Uoc3BsYXRQYXJhbSwgJyguKj8pJyk7XG5cdHJldHVybiAnXicgKyBhdHRyRXhwcmVzc2lvbiArICckJztcbn07XG52YXIgX2V4dHJhY3RQYXJhbWV0ZXJzID0gZnVuY3Rpb24ocmVnZXhwLCBhdHRyTmFtZSwgYXR0ckV4cHJlc3Npb24pIHtcblx0dmFyIHBhcmFtVmFsdWVzID0gcmVnZXhwLmV4ZWMoYXR0ck5hbWUpLnNsaWNlKDEpO1xuXHR2YXIgcGFyYW1LZXlzID0gbmFtZWRQYXJhbS5leGVjKGF0dHJFeHByZXNzaW9uKTtcblxuXHRpZiAoIXBhcmFtS2V5cyB8fCAhcGFyYW1WYWx1ZXMpIHJldHVybiB7fTtcblxuXHR2YXIgbmFtZWRQYXJhbWV0ZXJzID0ge307XG5cdGNvbnNvbGUubG9nKCdwYXJhbVZhbHVlczonLHBhcmFtVmFsdWVzKTtcblx0Xy5lYWNoKHBhcmFtVmFsdWVzLCBmdW5jdGlvbiBlYWNoTWF0Y2hpbmdQaWVjZSggcGFyYW0sIGkgKSB7XG5cdFx0dmFyIGtleSA9IHBhcmFtS2V5c1tpXTtcblx0XHRrZXkgPSBrZXkuc2xpY2UoMSk7IC8vIHJlbW92ZSBgOmAgZnJvbSBuYW1lZCBwYXJhbVxuXHRcdG5hbWVkUGFyYW1ldGVyc1trZXldID0gcGFyYW1WYWx1ZXNbaV07XG5cdH0pO1xuXHRyZXR1cm4gbmFtZWRQYXJhbWV0ZXJzO1xufTtcblxuXG5cbi8qKlxuICogUmVuZGVyIGEgc2luZ2xlIGJpbmRpbmdcbiAqL1xudmFyIF9yZW5kZXJCaW5kaW5nID0gZnVuY3Rpb24gKCRtYXRjaGVkRWwsIGRvbUF0dHJpYnV0ZU5hbWUsIG1vZGVsLCByZW5kZXJGbiwgbmFtZWRQYXJhbXMpIHtcblx0dmFyIHJhd0JpbmRpbmcgPSAkbWF0Y2hlZEVsLmF0dHIoIGRvbUF0dHJpYnV0ZU5hbWUgKTtcblx0Ly8gSWYgZWxlbWVudCBkb2Vzbid0IGNvbnRhaW4gdGhlIHNwZWNpZmllZCBET00gYXR0cmlidXRlLi4uXG5cdC8vIGZhaWwgc2lsZW50bHkuXG5cdGlmICggIXJhd0JpbmRpbmcgKSByZXR1cm47XG5cblx0Ly8gY29uc29sZS5sb2coJ2dldHRpbmcgJyxkb21BdHRyaWJ1dGVOYW1lLCdvbicsJG1hdGNoZWRFbCk7XG5cdHZhciBtb2RlbEF0dHJpYnV0ZU5hbWUgPSByYXdCaW5kaW5nLnJlcGxhY2UoL15cXEAvLCAnJyk7XG5cdEZSQU1FV09SSy5kZWJ1ZygnRm91bmQgYSBiaW5kaW5nIDo6JywgcmF3QmluZGluZywgJzo6JywgbmFtZWRQYXJhbXMpO1xuXG5cdC8vIElmIG1vZGVsIGRvZXNuJ3QgY29udGFpbiB0aGUgc3BlY2lmaWVkIGF0dHJpYnV0ZS4uLlxuXHRpZiAoIHR5cGVvZiBtb2RlbC5hdHRyaWJ1dGVzW21vZGVsQXR0cmlidXRlTmFtZV0gPT09ICd1bmRlZmluZWQnICkge1xuXG5cdFx0Ly8gZmFpbCBzaWxlbnRseS5cblx0XHRyZXR1cm47XG5cdFx0Ly8gRlJBTUVXT1JLLndhcm4oJ0Nhbm5vdCBiaW5kIGBAJyttb2RlbEF0dHJpYnV0ZU5hbWUrJyBmb3IgdGVtcGxhdGUvY29tcG9uZW50ICcgK1xuXHRcdC8vIFx0J2AnICsgY29tcG9uZW50LmlkICsnYC5cXG4nK1xuXHRcdC8vIFx0J05vIHN1Y2ggYXR0cmlidXRlIGV4aXN0cyBpbiB0aGUgY29tcG9uZW50XFwncyBtb2RlbC4nXG5cdFx0Ly8gKTtcblx0fVxuXG5cdC8vIFJlbmRlciBhIGRhdGEgYmluZGluZ1xuXHR2YXIgYmluZGluZ1ZhbCA9IG1vZGVsLmdldChtb2RlbEF0dHJpYnV0ZU5hbWUpIHx8ICcnO1xuXHRyZW5kZXJGbiggJG1hdGNoZWRFbCwgYmluZGluZ1ZhbCwgbmFtZWRQYXJhbXMgKTtcbn07XG5cblxuLyoqXG4gKiBSZW5kZXIgdGhlIHNwZWNpZmllZCB0eXBlIG9mIGRhdGEgYmluZGluZ3NcbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9uc1xuICpcdFx0QG9wdGlvbiB7RnVuY3Rpb259IHJlbmRlckZuICgkZWwsIHZhbCwgcGFyYW1zKVx0LT4gZnVuY3Rpb24gd2hpY2ggcmVuZGVycyB0aGUgZGF0YSBiaW5kaW5nIGZvciB0aGUgc3BlY2lmaWVkIGVsZW1lbnRcbiAqXHRcdFx0QHBhcmFtIHtKUXVlcnlFbGVtZW50fSAkZWxcbiAqXHRcdFx0QHBhcmFtIHs/fSB2YWwgLT4gdmFsdWUgb2YgYm91bmQgbW9kZWwgYXR0cmlidXRlXG4gKlx0XHRcdEBwYXJhbSB7T2JqZWN0fSBwYXJhbXMgLT4ga2V5ZWQgb2JqZWN0IG9mIGR5bmFtaWMgcGFyYW1ldGVycyBmcm9tIHRoZSBuYW1lIG9mIHRoZSBhdHRyaWJ1dGUgaXRzZWxmXG4gKlx0XHRAb3B0aW9uIHtTdHJpbmd9IGF0dHJpYnV0ZSAtPiBuYW1lIG9mIGJvdW5kIGF0dHJpYnV0ZSwgZS5nLiAnYmluZC10ZXh0J1xuICpcdFx0QG9wdGlvbiB7Q29tcG9uZW50fSBjb21wb25lbnRcbiAqXHRcdEBvcHRpb24ge0JhY2tib25lLk1vZGVsfSBbbW9kZWxdIC0gZGVmYXVsdHMgdG8gYGNvbXBvbmVudC5tb2RlbGBcbiAqL1xudmFyIF9yZW5kZXJCaW5kaW5ncyA9IGZ1bmN0aW9uICggb3B0aW9ucyApIHtcblx0dmFyIGNvbXBvbmVudCA9IG9wdGlvbnMuY29tcG9uZW50O1xuXHR2YXIgYXR0cmlidXRlRXhwcmVzc2lvbiA9IG9wdGlvbnMuYXR0cmlidXRlO1xuXHR2YXIgbW9kZWwgPSBvcHRpb25zLm1vZGVsIHx8IG9wdGlvbnMuY29tcG9uZW50Lm1vZGVsO1xuXG5cblx0Ly8gQ2FsY3VsYXRlIHN0cmluZyB3aGljaCBjYW4gYmUgXCJuZXctZWRcIiBpbnRvIGEgUmVnRXhwXG5cdHZhciBhdHRyUmVnRXhwU3RyID0gX2F0dHJOYW1lVG9SZWdFeHAoYXR0cmlidXRlRXhwcmVzc2lvbik7XG5cdHZhciBhdHRyUmVnRXhwID0gbmV3IFJlZ0V4cChhdHRyUmVnRXhwU3RyKTtcblxuXG5cdHZhciBib3VuZEF0dHJTZWxlY3RvciA9ICc6bWF0Y2hBdHRyKFwiJyArIGF0dHJSZWdFeHBTdHIgKyAnXCIpJztcblxuXHQvLyBGaW5kIGFsbCByZWxldmFudCBkZXNjZW5kYW50IGVsZW1lbnRzXG5cdHZhciAkbWF0Y2hlcyA9IF9nZXQkTWF0Y2hlcyhib3VuZEF0dHJTZWxlY3RvciwgY29tcG9uZW50KTtcblxuXHQvLyBFYXJseSBleGl0IGZvciBzaW1wbGUgYmluZGluZ3MgKHcvbyBib3VuZCBwYXJhbXMpXG5cdGlmICggIWF0dHJpYnV0ZUV4cHJlc3Npb24ubWF0Y2goL1xcOi8pKSB7XG5cdFx0JG1hdGNoZXMuZWFjaChmdW5jdGlvbiAoKSB7XG5cdFx0XHRfcmVuZGVyQmluZGluZygkKHRoaXMpLCBhdHRyaWJ1dGVFeHByZXNzaW9uLCBtb2RlbCwgb3B0aW9ucy5yZW5kZXJGbiwge30pO1xuXG5cdFx0fSk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Y29uc29sZS5sb2coJ1xcblJlbmRlcmluZyBwYXJhbWV0ZXJpemVkIGRhdGEgYmluZGluZzogJyxhdHRyUmVnRXhwKTtcblxuXHQvLyBUT0RPOiBiYXRjaCBpdCB1cCBzbyB3ZSBvbmx5IGRvIG9uZSBET00gcXVlcnlcblx0JG1hdGNoZXMuZWFjaChmdW5jdGlvbiBlYWNoRWxlbWVudFdpdGhBQmluZGluZyAoKSB7XG5cdFx0dmFyICRtYXRjaGVkRWwgPSAkKHRoaXMpO1xuXG5cdFx0Ly8gR2V0IGFsbCBhdHRyaWJ1dGVzIGZvciB0aGlzICRlbCBhbmQgZmlsdGVyIGEgc2V0IG9mIG1hdGNoaW5nIG5hbWVzL3BhcmFtc1xuXHRcdHZhciBhbGxET01BdHRyTmFtZXMgPSBfLm1hcCggJG1hdGNoZWRFbFswXS5hdHRyaWJ1dGVzLCBmdW5jdGlvbiAoZWwpIHtcblx0XHRcdHJldHVybiBlbC5ub2RlTmFtZTtcblx0XHR9KTtcblx0XHRjb25zb2xlLmxvZygnYWxsRE9NQXR0ck5hbWVzIGZvciBlbCcsYWxsRE9NQXR0ck5hbWVzLCAkbWF0Y2hlZEVsKTtcblx0XHR2YXIgbWF0Y2hpbmdET01BdHRycyA9IHt9O1xuXHRcdF8uZWFjaCggYWxsRE9NQXR0ck5hbWVzLCBmdW5jdGlvbiBlYWNoQXR0cmlidXRlICggZG9tQXR0ck5hbWUgKSB7XG5cdFx0XHQvLyBjb25zb2xlLmxvZygnY2hlY2tpbmcnLGRvbUF0dHJOYW1lKTtcblx0XHRcdGlmICggZG9tQXR0ck5hbWUubWF0Y2goYXR0clJlZ0V4cCkpIHtcblx0XHRcdFx0bWF0Y2hpbmdET01BdHRyc1tkb21BdHRyTmFtZV0gPSBfZXh0cmFjdFBhcmFtZXRlcnMoIGF0dHJSZWdFeHAsIGRvbUF0dHJOYW1lLCBhdHRyaWJ1dGVFeHByZXNzaW9uICk7XG5cdFx0XHRcdC8vIGNvbnNvbGUubG9nKCcsIGdvdCcsbWF0Y2hpbmdET01BdHRyc1tkb21BdHRyTmFtZV0sICcgKCgoJyxkb21BdHRyTmFtZSwgYXR0cmlidXRlRXhwcmVzc2lvbik7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblxuXHRcdGNvbnNvbGUubG9nKCcgKioqKiBtYXRjaGluZ0RPTUF0dHJzIDo6JywgbWF0Y2hpbmdET01BdHRycyk7XG5cblx0XHR0aHJvdyBuZXcgRXJyb3IoJ2h3YWFhJyk7XG5cdFx0Xy5lYWNoKG1hdGNoaW5nRE9NQXR0cnMsIGZ1bmN0aW9uICggbmFtZWRQYXJhbXMsIGRvbUF0dHJpYnV0ZU5hbWUgKSB7XG5cdFx0XHRfcmVuZGVyQmluZGluZygkbWF0Y2hlZEVsLCBkb21BdHRyaWJ1dGVOYW1lLCBtb2RlbCwgb3B0aW9ucy5yZW5kZXJGbiwgbmFtZWRQYXJhbXMpO1xuXHRcdH0pO1xuXG5cdH0pO1xufTtcblxuXG5cblxuXG5cbi8qKlxuICogQ3JlYXRlIHBzZXVkby1zZWxlY3RvciBmb3IgZ2V0dGluZyB3aWxkY2FyZCBkYXRhIGF0dHJpYnV0ZXMuXG4gKlxuICogVXNhZ2U6XG4gKiAkKFwiOm1hdGNoQXR0cignXmRhdGEtJylcIilcbiAqXG4gKiBTb3VyY2U6XG4gKiBodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8xMzIyMjUwOS80ODY1NDdcbiAqL1xualF1ZXJ5LmV4cHIucHNldWRvcy5tYXRjaEF0dHIgPSAkLmV4cHIuY3JlYXRlUHNldWRvKGZ1bmN0aW9uKGFyZykge1xuXG4gICAgdmFyIHJlZ2V4cCA9IG5ldyBSZWdFeHAoYXJnKTtcbiAgICByZXR1cm4gZnVuY3Rpb24oZWxlbSkge1xuICAgICAgICBmb3IodmFyIGkgPSAwOyBpIDwgZWxlbS5hdHRyaWJ1dGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgYXR0ciA9IGVsZW0uYXR0cmlidXRlc1tpXTtcbiAgICAgICAgICAgIGlmKHJlZ2V4cC50ZXN0KGF0dHIubmFtZSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfTtcbn0pO1xuXG4iLCIvKipcbiAqIENvbXBvbmVudCBpcyBhbiBleHRlbmRlZCBgQmFja2JvbmUuVmlld2AuIEl0IGFkZCBmZWF0dXJlcyBzdWNoIGFzIGF1dG9tYXRpYyBldmVudCBiaW5kaW5nLFxuICogcmVuZGVyaW5nLCBsaWZlY3ljbGUgaG9va3MgYW5kIGV2ZW50cywgYW5kIG1vcmUuXG4gKi9cblxudmFyIGxpZmVjeWNsZUhvb2tzICAgICA9IHJlcXVpcmUoJy4vbGlmZWN5Y2xlSG9va3MnKSxcblx0bGlmZWN5Y2xlRXZlbnRzICAgID0gcmVxdWlyZSgnLi9saWZlY3ljbGVFdmVudHMnKSxcblx0YmluZEV2ZW50cyAgICAgICAgID0gcmVxdWlyZSgnLi9iaW5kRXZlbnRzJyksXG5cdGNsb3NlICAgICAgICAgICAgICA9IHJlcXVpcmUoJy4vY2xvc2UnKSxcblx0cmVuZGVyICAgICAgICAgICAgID0gcmVxdWlyZSgnLi9yZW5kZXInKSxcblx0cmVuZGVyQ29sbGVjdGlvbiAgID0gcmVxdWlyZSgnLi9yZW5kZXJDb2xsZWN0aW9uJyksXG5cdHZhbGlkYXRlRGVmaW5pdGlvbiA9IHJlcXVpcmUoJy4vdmFsaWRhdGVEZWZpbml0aW9uJyk7XG5cbkNvbXBvbmVudCA9IG1vZHVsZS5leHBvcnRzID0gQmFja2JvbmUuVmlldy5leHRlbmQoKTtcblxuXG5fLmV4dGVuZChDb21wb25lbnQucHJvdG90eXBlLCB7XG5cblx0Ly8gTGlmZWN5Y2xlIEhvb2tzXG5cdGJlZm9yZVJlbmRlcjogZnVuY3Rpb24oY2IpIHtcblx0XHRsaWZlY3ljbGVIb29rcy5iZWZvcmVSZW5kZXIuY2FsbCh0aGlzLCBjYik7XG5cdH0sXG5cdGJlZm9yZUNsb3NlOiBmdW5jdGlvbihjYikge1xuXHRcdGxpZmVjeWNsZUhvb2tzLmJlZm9yZUNsb3NlLmNhbGwodGhpcywgY2IpO1xuXHR9LFxuXHRhZnRlclJlbmRlcjogZnVuY3Rpb24oKSB7XG5cdFx0bGlmZWN5Y2xlSG9va3MuYWZ0ZXJSZW5kZXIuY2FsbCh0aGlzKTtcblx0fSxcblx0Y2FuY2VsUmVuZGVyOiBmdW5jdGlvbigpIHtcblx0XHRsaWZlY3ljbGVIb29rcy5jYW5jZWxSZW5kZXIuY2FsbCh0aGlzKTtcblx0fSxcblx0Y2FuY2VsQ2xvc2U6IGZ1bmN0aW9uKCkge1xuXHRcdGxpZmVjeWNsZUhvb2tzLmNhbmNlbENsb3NlLmNhbGwodGhpcyk7XG5cdH0sXG5cblx0Ly8gTGlmZWN5Y2xlIEV2ZW50c1xuXHRhZnRlckNoYW5nZTogZnVuY3Rpb24obW9kZWwsIG9wdGlvbnMpIHtcblx0XHRsaWZlY3ljbGVFdmVudHMuYWZ0ZXJDaGFuZ2UuY2FsbCh0aGlzLCBtb2RlbCwgb3B0aW9ucyk7XG5cdH0sXG5cdGFmdGVyQWRkOiBmdW5jdGlvbihtb2RlbCwgY29sbGVjdGlvbiwgb3B0aW9ucykge1xuXHRcdGxpZmVjeWNsZUV2ZW50cy5hZnRlckFkZC5jYWxsKHRoaXMsIG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zKTtcblx0fSxcblx0YWZ0ZXJSZW1vdmU6IGZ1bmN0aW9uKG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zKSB7XG5cdFx0bGlmZWN5Y2xlRXZlbnRzLmFmdGVyUmVtb3ZlLmNhbGwodGhpcywgbW9kZWwsIGNvbGxlY3Rpb24sIG9wdGlvbnMpO1xuXHR9LFxuXHRhZnRlclJlc2V0OiBmdW5jdGlvbihjb2xsZWN0aW9uLCBvcHRpb25zKSB7XG5cdFx0bGlmZWN5Y2xlRXZlbnRzLmFmdGVyUmVzZXQuY2FsbCh0aGlzLCBjb2xsZWN0aW9uLCBvcHRpb25zKTtcblx0fSxcblxuXHQvLyBQcm90b3R5cGUgbWV0aG9kcy5cblx0Y2xvc2U6IGZ1bmN0aW9uKCkge1xuXHRcdGNsb3NlLmNhbGwodGhpcyk7XG5cdH0sXG5cdHJlbmRlcjogZnVuY3Rpb24oYXRJbmRleCkge1xuXHRcdHJlbmRlci5jYWxsKHRoaXMsIGF0SW5kZXgpO1xuXHR9LFxuXG5cdHJlbmRlckNvbGxlY3Rpb246IGZ1bmN0aW9uICgpIHtcblx0XHR2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG5cdFx0cmVuZGVyQ29sbGVjdGlvbi5hcHBseSh0aGlzLCBhcmdzKTtcblx0fSxcbn0pO1xuXG5cblxuXG5Db21wb25lbnQucHJvdG90eXBlLmluaXRpYWxpemUgPSBmdW5jdGlvbihwcm9wZXJ0aWVzKSB7XG5cblx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdC8vIEtlZXAgdHJhY2sgb2YgYSBjb3VudGVyIGZvciB1c2UgaW4gZ2VuZXJhdGluZ1xuXHQvLyBpZHMgZm9yIGFub255bW91cyBjb21wb25lbnRzLlxuXHR0aGlzLmFub255bW91c1JlZ2lvbkNvdW50ZXIgPSAwO1xuXG5cdC8vIERpc2FibGUgb3IgaXNzdWUgd2FybmluZ3MgYWJvdXQgY2VydGFpbiBwcm9wZXJ0aWVzXG5cdC8vIGFuZCBtZXRob2RzIHRvIGF2b2lkIGNvbmZ1c2lvblxuXHRwcm9wZXJ0aWVzID0gdmFsaWRhdGVEZWZpbml0aW9uKHByb3BlcnRpZXMpO1xuXG5cdC8vIEV4dGVuZCBpbnN0YW5jZSB3LyBzcGVjaWZpZWQgcHJvcGVydGllcyBhbmQgbWV0aG9kc1xuXHRfLmV4dGVuZCh0aGlzLCBwcm9wZXJ0aWVzKTtcblxuXHQvLyBTdGFydCB3aXRoIGVtcHR5IHJlZ2lvbnMgb2JqZWN0XG5cdHRoaXMucmVnaW9ucyA9IHt9O1xuXG5cdC8vIEVuY291cmFnZSBjaGlsZCBtZXRob2RzIHRvIHVzZSB0aGUgY29tcG9uZW50IGNvbnRleHRcblx0Xy5iaW5kQWxsKHRoaXMpO1xufTtcbiIsIi8vIEZpcmVkIHdoZW4gdGhlIGJvdW5kIG1vZGVsIGlzIHVwZGF0ZWQgKGB0aGlzLm1vZGVsYClcbmV4cG9ydHMuYWZ0ZXJDaGFuZ2UgPSBmdW5jdGlvbiAobW9kZWwsIG9wdGlvbnMpIHt9O1xuXG4vLyBGaXJlZCB3aGVuIGEgbW9kZWwgaXMgYWRkZWQgdG8gdGhlIGJvdW5kIGNvbGxlY3Rpb24gKGB0aGlzLmNvbGxlY3Rpb25gKVxuZXhwb3J0cy5hZnRlckFkZCA9IGZ1bmN0aW9uIChtb2RlbCwgY29sbGVjdGlvbiwgb3B0aW9ucykge307XG5cbi8vIEZpcmVkIHdoZW4gYSBtb2RlbCBpcyByZW1vdmVkIGZyb20gdGhlIGJvdW5kIGNvbGxlY3Rpb24gKGB0aGlzLmNvbGxlY3Rpb25gKVxuZXhwb3J0cy5hZnRlclJlbW92ZSA9IGZ1bmN0aW9uIChtb2RlbCwgY29sbGVjdGlvbiwgb3B0aW9ucykge307XG5cbi8vIEZpcmVkIHdoZW4gdGhlIGJvdW5kIGNvbGxlY3Rpb24gaXMgd2lwZWQgKGB0aGlzLmNvbGxlY3Rpb25gKVxuZXhwb3J0cy5hZnRlclJlc2V0ID0gZnVuY3Rpb24gKGNvbGxlY3Rpb24sIG9wdGlvbnMpIHt9O1xuIiwiLy8gRmlyZWQgYXV0b21hdGljYWxseSB3aGVuIHRoZSB2aWV3IGlzIGluaXRpYWxseSBjcmVhdGVkXG4vLyBvbmx5IGZpcmVkIGFmdGVyd2FyZHMgaWYgdGhpcy5yZW5kZXIoKSBpcyBleHBsaWNpdGx5IGNhbGxlZFxuLy8gQ2FsbGJhY2sgbXVzdCBiZSBmaXJlZCEhXG5leHBvcnRzLmJlZm9yZVJlbmRlciA9IGZ1bmN0aW9uIChjYikge2NiKCk7fTtcblxuLy8gRmlyZWQgYXV0b21hdGljYWxseSB3aGVuIHRoZSB2aWV3IGlzIGluaXRpYWxseSBjcmVhdGVkXG4vLyBvbmx5IGZpcmVkIGFmdGVyd2FyZHMgaWYgdGhpcy5yZW5kZXIoKSBpcyBleHBsaWNpdGx5IGNhbGxlZFxuZXhwb3J0cy5hZnRlclJlbmRlciA9IGZ1bmN0aW9uICgpIHt9O1xuXG4vLyBGaXJlZCBhdXRvbWF0aWNhbGx5IHdoZW4gdGhlIHZpZXcgaXMgY2xvc2VkXG5leHBvcnRzLmJlZm9yZUNsb3NlID0gZnVuY3Rpb24gKGNiKSB7Y2IoKTt9O1xuXG4vLyBGaXJlZCBiZWZvcmUgcmVyZW5kZXJpbmcgb3IgY2xvc2luZyBhIHZpZXcgdGhhdCBpcyBhbHJlYWR5IHdhaXRpbmcgb24gYSBsb2NrXG5leHBvcnRzLmNhbmNlbFJlbmRlciA9IGZ1bmN0aW9uICgpIHtcblx0RlJBTUVXT1JLLndhcm4oJ2NhbmNlbFJlbmRlcigpIHNob3VsZCBiZSBkZWZpbmVkIGlmIGJlZm9yZUNsb3NlKGNiKSBvciBiZWZvcmVSZW5kZXIoY2IpJyArXG5cdFx0XHRcdFx0XHRcdFx0ICdhcmUgYmVpbmcgdXNlZCEnKTtcbn07XG5cbi8vIEZpcmVkIGJlZm9yZSByZXJlbmRlcmluZyBvciBjbG9zaW5nIGEgdmlldyB0aGF0IGlzIGFscmVhZHkgd2FpdGluZyBvbiBhIGxvY2tcbmV4cG9ydHMuY2FuY2VsQ2xvc2UgPSBmdW5jdGlvbiAoKSB7XG5cdEZSQU1FV09SSy53YXJuKCdjYW5jZWxDbG9zZSgpIHNob3VsZCBiZSBkZWZpbmVkIGlmIGJlZm9yZUNsb3NlKGNiKSBvciBiZWZvcmVSZW5kZXIoY2IpJyArXG5cdFx0XHRcdFx0XHRcdFx0ICdhcmUgYmVpbmcgdXNlZCEnKTtcbn07XG4iLCIvKipcbiAqIFJ1biBIVE1MIHRlbXBsYXRlIHRocm91Z2ggZW5naW5lIGFuZCBhcHBlbmQgcmVzdWx0cyB0byBvdXRsZXQuIEFsc28gcmVyZW5kZXIgcmVnaW9ucy5cbiAqIElmIGF0SW5kZXggaXMgc3BlY2lmaWVkLCB0aGUgY29tcG9uZW50IGlzIHJlbmRlcmVkIGF0IHRoZSBnaXZlbiBwb3NpdGlvbiB3aXRoaW4gaXRzXG4gKiBvdXRsZXQuIE90aGVyd2lzZSwgdGhlIGxhc3QgcG9zaXRpb24gaXMgdXNlZC5cbiAqXG4gKiBAcGFyYW0ge051bWJlcn0gYXRJbmRleCBbVGhlIGluZGV4IGluIHdoaWNoIHRvIHJlbmRlciB0aGlzIGVsZW1lbnRdXG4gKi9cblxudmFyIERPTSA9IHJlcXVpcmUgKCcuLi91dGlscy9ET00nKSxcblx0XHRoZWxwZXJzID0gcmVxdWlyZSgnLi9oZWxwZXJzJyksXG5cdFx0YmluZEV2ZW50cyA9IHJlcXVpcmUgKCcuL2JpbmRFdmVudHMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByZW5kZXIoYXRJbmRleCkge1xuXG5cdEZSQU1FV09SSy5kZWJ1Zyh0aGlzLmlkICsgJyA6LS0tOiBSZW5kZXJpbmcgY29tcG9uZW50Li4uJyk7XG5cblx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdC8vIENhbmNlbCBjdXJyZW50IHJlbmRlciBhbmQgY2xvc2Ugam9icywgaWYgdGhleSdyZSBydW5uaW5nXG5cdGlmICh0aGlzLl9yZW5kZXJpbmcpIHtcblx0XHRGUkFNRVdPUksuZGVidWcodGhpcy5pZCArICcgOjogcmVuZGVyKCkgY2FuY2VsZWQuJyk7XG5cdFx0dGhpcy5fcmVuZGVyaW5nQ2FuY2VsZWQgPSB0cnVlO1xuXHRcdHRoaXMuY2FuY2VsUmVuZGVyKCk7XG5cdFx0dGhpcy5fcmVuZGVyaW5nID0gZmFsc2U7XG5cdH1cblx0aWYgKHRoaXMuX2Nsb3NpbmcpIHtcblx0XHRGUkFNRVdPUksuZGVidWcodGhpcy5pZCArICcgOjogY2xvc2UoKSBjYW5jZWxlZC4nKTtcblx0XHR0aGlzLmNhbmNlbENsb3NlKCk7XG5cdFx0dGhpcy5fY2xvc2luZyA9IGZhbHNlO1xuXHR9XG5cblx0Ly8gTG9jayBhY2Nlc3MgdG8gcmVuZGVyXG5cdHRoaXMuX3JlbmRlcmluZyA9IHRydWU7XG5cblx0Ly8gVHJpZ2dlciBiZWZvcmVSZW5kZXIgbWV0aG9kXG5cdHRoaXMuYmVmb3JlUmVuZGVyKGZ1bmN0aW9uICgpIHtcblxuXHRcdC8vIElmIHJlbmRlcmluZyB3YXMgY2FuY2VsZWQsIGJyZWFrIG91dFxuXHRcdC8vIGRvIG5vdCByZW5kZXIsIGFuZCBkbyBub3QgY2FsbCBhZnRlclJlbmRlcigpXG5cdFx0aWYgKCBzZWxmLl9yZW5kZXJpbmdDYW5jZWxlZCApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBCaW5kIHRoZSBldmVudHMgb24gbW9kZWwvY29sbGVjdGlvbnMgYW5kIGdsb2JhbCB0cmlnZ2VyZWQgZXZlbnRzLlxuXHRcdGJpbmRFdmVudHMuY29sbGVjdGlvbkV2ZW50cy5jYWxsKHNlbGYpO1xuXHRcdGJpbmRFdmVudHMubW9kZWxFdmVudHMuY2FsbChzZWxmKTtcblx0XHRiaW5kRXZlbnRzLmdsb2JhbFRyaWdnZXJzLmNhbGwoc2VsZik7XG5cblx0XHQvLyBVbmxvY2sgcmVuZGVyaW5nIG11dGV4XG5cdFx0c2VsZi5fcmVuZGVyaW5nID0gZmFsc2U7XG5cblx0XHRpZiAoIXNlbGYuJG91dGxldCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKHNlbGYuaWQgKyAnIDo6IFRyeWluZyB0byByZW5kZXIoKSwgYnV0IG5vICRvdXRsZXQgd2FzIGRlZmluZWQhJyk7XG5cdFx0fVxuXG5cdFx0Ly8gSHlkcmF0ZSBjb21waWxlZCB0ZW1wbGF0ZVxuXHRcdC8vIChjb21iaW5lcyB0aGUgdGVtcGxhdGUgZnVuY3Rpb24gd2l0aCBkYXRhIHRvIHJldHVybiBIVE1MKVxuXHRcdHZhciBodG1sID0gaGVscGVycy5jb21waWxlVGVtcGxhdGUuY2FsbChzZWxmKTtcblx0XHRpZiAoIWh0bWwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcih0aGlzLmlkICsgJyA6OiBVbmFibGUgdG8gcmVuZGVyIGNvbXBvbmVudCBiZWNhdXNlIHRlbXBsYXRlIGNvbXBpbGF0aW9uIGRpZCBub3QgcmV0dXJuIGFueSBIVE1MLicpO1xuXHRcdH1cblxuXHRcdC8vIFN0cmlwIHRyYWlsaW5nIGFuZCBsZWFkaW5nIHdoaXRlc3BhY2UgdG8gYXZvaWQgZmFsc2VseSBkaWFnbm9zaW5nXG5cdFx0Ly8gbXVsdGlwbGUgZWxlbWVudHMsIHdoZW4gb25seSBvbmUgYWN0dWFsbHkgZXhpc3RzXG5cdFx0Ly8gKHRoaXMgbWlzZGlhZ25vc2lzIHdyYXBzIHRoZSB0ZW1wbGF0ZSBpbiBhbiBleHRyYW5lb3VzIDxkaXY+KVxuXHRcdGh0bWwgPSBodG1sLnJlcGxhY2UoL15cXHMqLywgJycpO1xuXHRcdGh0bWwgPSBodG1sLnJlcGxhY2UoL1xccyokLywgJycpO1xuXHRcdGh0bWwgPSBodG1sLnJlcGxhY2UoLyhcXHJ8XFxuKSovLCAnJyk7XG5cblx0XHQvLyBTdHJpcCBIVE1MIGNvbW1lbnRzLCB0aGVuIHN0cmlwIHdoaXRlc3BhY2UgYWdhaW5cblx0XHQvLyAoVE9ETzogb3B0aW1pemUgdGhpcylcblx0XHRodG1sID0gaHRtbC5yZXBsYWNlKC8oPCEtLS4rLS0+KSovLCAnJyk7XG5cdFx0aHRtbCA9IGh0bWwucmVwbGFjZSgvXlxccyovLCAnJyk7XG5cdFx0aHRtbCA9IGh0bWwucmVwbGFjZSgvXFxzKiQvLCAnJyk7XG5cdFx0aHRtbCA9IGh0bWwucmVwbGFjZSgvKFxccnxcXG4pKi8sICcnKTtcblxuXHRcdC8vIFBhcnNlIGEgRE9NIG5vZGUgb3Igc2VyaWVzIG9mIERPTSBub2RlcyBmcm9tIHRoZSBuZXdseSB0ZW1wbGF0ZWQgSFRNTFxuXHRcdHZhciBwYXJzZWROb2RlcyA9ICQucGFyc2VIVE1MKGh0bWwpO1xuXHRcdHZhciBlbCA9IHBhcnNlZE5vZGVzWzBdO1xuXG5cdFx0Ly8gSWYgbm8gbm9kZXMgd2VyZSBwYXJzZWQsIHRocm93IGFuIGVycm9yXG5cdFx0aWYgKHBhcnNlZE5vZGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKHNlbGYuaWQgKyAnIDo6IHJlbmRlcigpIHJhbiBpbnRvIGEgcHJvYmxlbSByZW5kZXJpbmcgdGhlIHRlbXBsYXRlIHdpdGggSFRNTCA9PiBcXG4nK2h0bWwpO1xuXHRcdH1cblxuXHRcdC8vIElmIHRoZXJlIGlzIG5vdCBvbmUgc2luZ2xlIHdyYXBwZXIgZWxlbWVudCxcblx0XHQvLyBvciBpZiB0aGUgcmVuZGVyZWQgdGVtcGxhdGUgY29udGFpbnMgb25seSBhIHNpbmdsZSB0ZXh0IG5vZGUsXG5cdFx0Ly8gKG9yIGp1c3QgYSBsb25lIHJlZ2lvbilcblx0XHRlbHNlIGlmIChwYXJzZWROb2Rlcy5sZW5ndGggPiAxIHx8IHBhcnNlZE5vZGVzWzBdLm5vZGVUeXBlID09PSAzIHx8XG5cdFx0XHRcdFx0XHQgJChwYXJzZWROb2Rlc1swXSkuaXMoJ3JlZ2lvbicpKSB7XG5cblx0XHRcdEZSQU1FV09SSy5sb2coc2VsZi5pZCArICcgOjogV3JhcHBpbmcgdGVtcGxhdGUgaW4gPGRpdi8+Li4uJywgcGFyc2VkTm9kZXMpO1xuXG5cdFx0XHQvLyB3cmFwIHRoZSBodG1sIHVwIGluIGEgY29udGFpbmVyIDxkaXYvPlxuXHRcdFx0ZWwgPSAkKCc8ZGl2Lz4nKS5hcHBlbmQoaHRtbCk7XG5cdFx0XHRlbCA9IGVsWzBdO1xuXHRcdH1cblxuXHRcdC8vIFNldCBCYWNrYm9uZSBlbGVtZW50IChjYWNoZSBhbmQgcmVkZWxlZ2F0ZSBET00gZXZlbnRzKVxuXHRcdC8vIChXaWxsIGFsc28gdXBkYXRlIHNlbGYuJGVsKVxuXHRcdHNlbGYuc2V0RWxlbWVudChlbCk7XG5cdFx0Ly8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cblxuXHRcdC8vIERldGVjdCBhbmQgcmVuZGVyIGFsbCByZWdpb25zIGFuZCB0aGVpciBkZXNjZW5kZW50IGNvbXBvbmVudHMgYW5kIHJlZ2lvbnNcblx0XHRoZWxwZXJzLnJlbmRlclJlZ2lvbnMuY2FsbChzZWxmKTtcblxuXHRcdC8vIEluc2VydCB0aGUgZWxlbWVudCBhdCB0aGUgcHJvcGVyIHBsYWNlIGFtb25nc3QgdGhlIG91dGxldCdzIGNoaWxkcmVuXG5cdFx0dmFyIG5laWdoYm9ycyA9IHNlbGYuJG91dGxldC5jaGlsZHJlbigpO1xuXHRcdGlmIChfLmlzRmluaXRlKGF0SW5kZXgpICYmIG5laWdoYm9ycy5sZW5ndGggPiAwICYmIG5laWdoYm9ycy5sZW5ndGggPiBhdEluZGV4KSB7XG5cdFx0XHRuZWlnaGJvcnMuZXEoYXRJbmRleCkuYmVmb3JlKHNlbGYuJGVsKTtcblx0XHR9XG5cblx0XHQvLyBCdXQgaWYgdGhlIG91dGxldCBpcyBlbXB0eSwgb3IgdGhlcmUncyBubyBhdEluZGV4LCBqdXN0IHN0aWNrIGl0IG9uIHRoZSBlbmRcblx0XHRlbHNlIHNlbGYuJG91dGxldC5hcHBlbmQoc2VsZi4kZWwpO1xuXG5cblx0XHQvLyBGbGFnIHdpdGggZGF0YS10ZW1wbGF0ZS1pZCBhdHRyaWJ1dGVcblx0XHQvLyAodG8gbWFrZSB0ZW1wbGF0ZS9jb21wb25lbnQgYm91bmRhcmllcyBlYXNpZXIgdG8gcGljayBvdXQgaW4gdGhlIGluc3BlY3Rvcilcblx0XHRzZWxmLiRlbC5hdHRyKCdkYXRhLXRlbXBsYXRlLWlkJywgc2VsZi5pZCk7XG5cblxuXG5cblx0XHQvL1xuXHRcdC8vIElmIHRoZSBwYXJlbnQgY29tcG9uZW50IGhhcyByb3V0ZSBsaXN0ZW5lcnMgKGUuZy4gI2Zvbylcblx0XHQvLyBydW4gYW55IG9mIHRoZW0gdGhhdCBtYXRjaCBgd2luZG93LmxvY2F0aW9uLmhhc2hgLlxuXHRcdC8vIChhZnRlciByZW5kZXJpbmcgdGhlIHRlbXBsYXRlIGFuZCByZWdpb25zIGJ1dCBCRUZPUkUgdGhlIGBhZnRlclJlbmRlcmBcblx0XHQvLyBsaWZlY3ljbGUgY2FsbGJhY2sgaXMgdHJpZ2dlcmVkKVxuXHRcdC8vXG5cdFx0Ly8gbm90IHN1cmUgaWYgdGhpcyBpcyBhIGdvb2QgaWRlYSBpbiBnZW5lcmFsLS0gbWF5YmUgY29uZmlndXJhYmxlLi4/XG5cdFx0Ly8gb3Igb25seSBpZiBiYWNrYm9uZS5oaXN0b3J5IGlzbid0IHJlYWR5IHlldD9cblx0XHQvL1xuXHRcdC8vIGRpc2FibGluZyBmb3Igbm93Li4uXG5cdFx0Ly8gXy5lYWNoKCBPYmplY3Qua2V5cyhzZWxmKSwgZnVuY3Rpb24gKGtleSkge1xuXHRcdC8vIFx0dmFyIG1hdGNoZWRSb3V0ZSA9IGtleS5tYXRjaChuZXcgUmVnRXhwKCcvXicgK3dpbmRvdy5sb2NhdGlvbi5oYXNoICsgJy8nKSk7XG5cdFx0Ly8gXHRpZiAoIW1hdGNoZWRSb3V0ZSkgcmV0dXJuO1xuXG5cdFx0Ly8gXHR2YXIgbWF0Y2hlZFJvdXRlTGlzdGVuZXIgPSBzZWxmW21hdGNoZWRSb3V0ZV07XG5cdFx0Ly8gXHRtYXRjaGVkUm91dGVMaXN0ZW5lcigpO1xuXHRcdC8vIH0pO1xuXG5cblx0XHQvLyBGaW5hbGx5LCB0cmlnZ2VyIGFmdGVyUmVuZGVyIG1ldGhvZFxuXHRcdHNlbGYuYWZ0ZXJSZW5kZXIoKTtcblxuXG5cdFx0Ly8gUnVuIGRhdGEgYmluZGluZ3Ncblx0XHQvLyBUT0RPOiBkb24ndCBjYWxsIHRoaXMgaGVyZS0tIGp1c3QgZG8gd2hlbiBpbml0aWFsbHkgaW5zZXJ0aW5nIHRoZSB0ZW1wbGF0ZSBpbnRvIHRoZSBET01cblx0XHQvLyAodGhpcyBpcyBpbmVmZmljaWVudClcblx0XHRoZWxwZXJzLnJlbmRlckRhdGFCaW5kaW5ncy5jYWxsKHNlbGYpO1xuXG5cblx0XHQvLyBBZGQgZGF0YSBhdHRyaWJ1dGVzIHRvIHRoaXMgY29tcG9uZW50J3MgJGVsLCBwcm92aWRpbmcgYWNjZXNzXG5cdFx0Ly8gdG8gd2hldGhlciB0aGUgZWxlbWVudCBoYXMgdmFyaW91cyBET00gYmluZGluZ3MgZnJvbSBzdHlsZXNoZWV0cy5cblx0XHQvLyAoaGFuZHkgZm9yIGRpc2FibGluZyB0ZXh0IHNlbGVjdGlvbiBhY2NvcmRpbmdseSwgZXRjLilcblx0XHQvL1xuXHRcdC8vIC0+IGRpc2FibGUgZm9yIHRoaXMgY29tcG9uZW50IHdpdGggYHRoaXMuYXR0ckZsYWdzID0gZmFsc2VgXG5cdFx0Ly8gLT4gb3IgZ2xvYmFsbHkgd2l0aCBgRlJBTUVXT1JLLmF0dHJGbGFncyA9IGZhbHNlYFxuXHRcdC8vXG5cdFx0Ly8gVE9ETzogbWFrZSBpdCB3b3JrIHdpdGggZGVsZWdhdGVkIERPTSBldmVudCBiaW5kaW5nc1xuXHRcdC8vXG5cdFx0aWYgKHNlbGYuYXR0ckZsYWdzICE9PSBmYWxzZSAmJiBGUkFNRVdPUksuYXR0ckZsYWdzICE9PSBmYWxzZSkge1xuXHRcdFx0RE9NLmZsYWdCb3VuZEV2ZW50cyhzZWxmKTtcblx0XHR9XG5cdH0pO1xufTtcbiIsIlxuLyoqXG4gKiBUT0RPOlxuICogVHJ5IG91dCBhIGRpZmZlcmVudCBhcHByb2FjaCBmb3IgdGhlIGxvZ2ljIGluIGByZW5kZXJDb2xsZWN0aW9uYFxuICogYmVsb3cgYnkgb3ZlcmxvYWRpbmcgYHJlZ2lvbi5hdHRhY2goKWAuXG4gKlxuICogRXhhbXBsZSB1c2FnZTogKGluIHBhcmVudCBjb21wb25lbnQpXG4gKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICogdGhpcy5zb21lUmVnaW9uLmF0dGFjaCgnU29tZU90aGVyQ29tcG9uZW50Jyx7IGNvbGxlY3Rpb246IFNvbWVDb2xsZWN0aW9uIH0pXG4gKlxuICogLW9yLVxuICpcbiAqIHRoaXMuc29tZVJlZ2lvbi5yZXBlYXQoJ1NvbWVPdGhlckNvbXBvbmVudCcseyBjb2xsZWN0aW9uOiBTb21lQ29sbGVjdGlvbiB9KVxuICovXG5cbi8qKlxuICogcmVuZGVyQ29sbGVjdGlvbigpXG4gKlxuICogUmV1c2FibGUgbG9naWMgdG8gcmVuZGVyIGEgY29sbGVjdGlvbiBpbnRvIGEgcmVnaW9uXG4gKlxuICogVE9ETzogbW92ZSBvbnRvIFJlZ2lvbiBvYmplY3QgaW5zdGVhZC4uLiAgU2VlIGdpc3QuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IGNvbGxlY3Rpb24gLSBkYXRhIHNvdXJjZVxuICogQHBhcmFtIHtPcHRpb25zfSBvcHRpb25zXG4gKlx0XHQ6IG9wdGlvbnMuaXRlbVRlbXBsYXRlIHtTdHJpbmd9IC0gbmFtZSBvZiB0ZW1wbGF0ZS9jb21wb25lbnQgdG8gdXNlIGFzIGl0ZW1cbiAqXHRcdDogb3B0aW9ucy5pbnRvUmVnaW9uIHtPYmplY3R9IC0gdGhlIGRlc3RpbmF0aW9uIHJlZ2lvblxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChjb2xsZWN0aW9uLCBvcHRpb25zKSB7XG5cblx0Ly8gUmVxdWlyZWQ6XG5cdGlmICh0eXBlb2YgY29sbGVjdGlvbiAhPT0gJ29iamVjdCcpIHRocm93IG5ldyBFcnJvcigncmVuZGVyQ29sbGVjdGlvbiA6OiBVbmtub3duL2ludmFsaWQgY29sbGVjdGlvbiwgXCInICsgKGNvbGxlY3Rpb24gJiYgY29sbGVjdGlvbi50eXBlKSArICdcIicpO1xuXHRpZiAoIW9wdGlvbnMuaXRlbVRlbXBsYXRlKSB0aHJvdyBuZXcgRXJyb3IoJ3JlbmRlckNvbGxlY3Rpb24gOjogb3B0aW9ucy5pdGVtVGVtcGxhdGUgcmVxdWlyZWQhJyk7XG5cdGlmICghb3B0aW9ucy5pbnRvUmVnaW9uKSB0aHJvdyBuZXcgRXJyb3IoJ3JlbmRlckNvbGxlY3Rpb24gOjogb3B0aW9ucy5pbnRvUmVnaW9uIHJlcXVpcmVkIScpO1xuXG5cblx0Ly8gRGV0ZXJtaW5lIGNvbGxlY3Rpb25OYW1lXG5cdHZhciBjb2xsZWN0aW9uTmFtZSA9IGNvbGxlY3Rpb24udHlwZTtcblxuXHQvLyBUYXJnZXQgcmVnaW9uXG5cdHZhciBvdXRsZXQgPSBvcHRpb25zLmludG9SZWdpb247XG5cblx0Ly8gU3ViLWNvbXBvbmVudFxuXHR2YXIgc3ViY29tcG9uZW50TmFtZSA9IG9wdGlvbnMuaXRlbVRlbXBsYXRlO1xuXG5cdC8vIE5hbWUgb2YgdGhlIGNvbGxlY3Rpb24gc3RhdGUgYXR0cmlidXRlIHRoYXQgd2lsbGUgYmUgaW5qZWN0ZWQgaW50byB0aGUgSFRNTFxuXHQvLyBVc2VkIGZvciB0aGUgZGVmYXVsdCByZW5kZXIgYmVoYXZpb3IuXG5cdHZhciBib2R5U3RhdGVBdHRyaWJ1dGUgPSAnZGF0YS0nICsgY29sbGVjdGlvbk5hbWUgKyAnLXN0YXRlJztcblxuXG5cblxuXHQvKipcblx0ICogRGVmYXVsdCByZW5kZXIgbWV0aG9kc1xuXHQgKlxuXHQgKiBPdmVycmlkZSBkZWZhdWx0IHJlbmRlciBtZXRob2RzIHdpdGggb3B0aW9ucyBpZiBzcGVjaWZpZWRcblx0ICovXG5cblx0Ly8gRGVmYXVsdCByZW5kZXIgbG9naWMgZm9yIGVycm9yIHN0YXRlIChlLmcuIHJlZCB0ZXh0KVxuXHR2YXIgcmVuZGVyRXJyb3IgPSBvcHRpb25zLnJlbmRlckVycm9yIHx8IGZ1bmN0aW9uIHJlbmRlckVycm9yICgpIHtcblx0XHRGUkFNRVdPUksuZXJyb3IoJ0FuIGVycm9yIG9jY3VycmVkIHdoaWxlIGxvYWRpbmcgJyArIGNvbGxlY3Rpb25OYW1lICsgJyA6OlxcbicsIGNvbGxlY3Rpb24uZXJyb3IpO1xuXG5cdFx0Ly8gU2V0IGEgZGF0YSBhdHRyaWJ1dGUgb24gSFRNTCBib2R5XG5cdFx0JCgnYm9keScpLmF0dHIoYm9keVN0YXRlQXR0cmlidXRlLCAnZXJyb3InKTtcblx0fTtcblxuXHQvLyBEZWZhdWx0IHJlbmRlciBsb2dpYyBmb3IgbG9hZGluZyBzdGF0ZSAoZS5nLiBzcGlubmVyKVxuXHR2YXIgcmVuZGVyU3luY2luZyA9IG9wdGlvbnMucmVuZGVyU3luY2luZyB8fCBmdW5jdGlvbiByZW5kZXJTeW5jaW5nKCkge1xuXHRcdEZSQU1FV09SSy5sb2coJ0xvYWRpbmcgJyArIGNvbGxlY3Rpb25OYW1lICsgJy4uLicpO1xuXG5cdFx0Ly8gU2V0IHN0YXRlIGF0dHJpYnV0ZSBvbiBIVE1MIGJvZHlcblx0XHQkKCdib2R5JykuYXR0cihib2R5U3RhdGVBdHRyaWJ1dGUsICdzeW5jaW5nJyk7XG5cdH07XG5cblx0Ly8gRGVmYXVsdCByZW5kZXIgbG9naWMgdG8gY2xlYW4gdXAgYWZ0ZXIgYSBzdWNjZXNzZnVsIHN5bmMvbG9hZFxuXHR2YXIgcmVuZGVyU3luY2VkID0gb3B0aW9ucy5yZW5kZXJTeW5jZWQgfHwgZnVuY3Rpb24gcmVuZGVyU3luY2VkKCkge1xuXHRcdEZSQU1FV09SSy5sb2coY29sbGVjdGlvbi5sZW5ndGggKyAnICcgKyBjb2xsZWN0aW9uTmFtZSArICcgZmV0Y2hlZCBzdWNjZXNzZnVsbHkuJyk7XG5cblx0XHQvLyBTZXQgc3RhdGUgYXR0cmlidXRlIG9uIEhUTUwgYm9keVxuXHRcdCQoJ2JvZHknKS5hdHRyKGJvZHlTdGF0ZUF0dHJpYnV0ZSwgJ3JlYWR5Jyk7XG5cdH07XG5cblx0Ly8gRGVmYXVsdCByZW5kZXIgbG9naWMgZm9yIGl0ZW1zIGluIGNvbGxlY3Rpb25cblx0dmFyIHJlbmRlclJlc2V0ID0gb3B0aW9ucy5yZW5kZXJSZXNldCB8fCBmdW5jdGlvbiByZW5kZXJSZXNldCgpIHtcblxuXHRcdC8vIENsZWFuIG91dCB0aGUgcmVnaW9uLCB3cmFwIGluIGEgdHJ5L2NhdGNoIHRvIHN0b3AgdGhlIGV4ZWN1dGlvblxuXHRcdHRyeSB7XG5cdFx0XHRvdXRsZXQuZW1wdHkoKTtcblx0XHR9IGNhdGNoIChlKSB7fVxuXG5cblx0XHQvLyBUT0RPOiBTbWFydCBtZXJnZSB0byBtaW5pbWl6ZSBET00gcXVlcmllc1xuXHRcdGNvbGxlY3Rpb24uZWFjaChmdW5jdGlvbiAobW9kZWwpIHtcblx0XHRcdC8vIEZvciBlYWNoIG1vZGVsIGZvdW5kLCBhcHBlbmQgYSBzdWJjb21wb25lbnQgdG8gdGhlIHJlZ2lvblxuXHRcdFx0b3V0bGV0LmFwcGVuZChzdWJjb21wb25lbnROYW1lLCB7IG1vZGVsOiBtb2RlbCB9KTtcblx0XHR9KTtcblx0fTtcblxuXHQvKipcblx0ICogcmVuZGVyQWRkICggbW9kZWwsIFthdEluZGV4XSApXG5cdCAqXG5cdCAqIEBwYXJhbSB7TW9kZWx9IG1vZGVsXHRcdFx0XHRcdFx0LSB0aGUgQmFja2JvbmUgbW9kZWwgdGhhdCB3YXMgYWRkZWRcblx0ICogQHBhcmFtIHtJbnRlZ2VyfSBhdEluZGV4XHRcdFx0XHQtIChvcHRpb25hbC0gZGVmYXVsdHMgdG8gY29sbGVjdGlvbi5sZW5ndGgpXG5cdCAqXG5cdCAqIERlZmF1bHQgcmVuZGVyIGxvZ2ljIGZvciB0aGUgY2FzZSB3aGVyZSBhbiBpdGVtIGlzIGFkZGVkIHRvIHRoZSBjb2xsZWN0aW9uLlxuXHQgKi9cblx0dmFyIHJlbmRlckFkZCA9IG9wdGlvbnMucmVuZGVyQWRkIHx8IGZ1bmN0aW9uIHJlbmRlckFkZCggbW9kZWwsIGF0SW5kZXggKSB7XG5cdFx0aWYgKCB0eXBlb2YgYXRJbmRleCA9PT0gJ251bWJlcicpIHtcblx0XHRcdHJldHVybiBvdXRsZXQuaW5zZXJ0KGF0SW5kZXgsIHN1YmNvbXBvbmVudE5hbWUsIHsgbW9kZWw6IG1vZGVsIH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gb3V0bGV0LmFwcGVuZChzdWJjb21wb25lbnROYW1lLCB7IG1vZGVsOiBtb2RlbCB9KTtcblx0fTtcblxuXHQvKipcblx0ICogcmVuZGVyUmVtb3ZlKCBhdEluZGV4IClcblx0ICpcblx0ICogQHBhcmFtIHtJbnRlZ2VyfSBhdEluZGV4XHRcdFx0LSB0aGUgZm9ybWVyIGluZGV4IG9mIHRoZSBCYWNrYm9uZSBtb2RlbCB0aGF0IHdhcyByZW1vdmVkXG5cdCAqXG5cdCAqIERlZmF1bHQgcmVuZGVyIGxvZ2ljIGZvciB0aGUgY2FzZSB3aGVyZSBhbiBpdGVtIGlzIHJlbW92ZWQgZnJvbSB0aGUgY29sbGVjdGlvbi5cblx0ICovXG5cdHZhciByZW5kZXJSZW1vdmUgPSBvcHRpb25zLnJlbmRlclJlbW92ZSB8fCBmdW5jdGlvbiByZW5kZXJSZW1vdmUoIGF0SW5kZXggKSB7XG5cdFx0b3V0bGV0LnJlbW92ZSggYXRJbmRleCApO1xuXHR9O1xuXG5cblxuXG5cblxuXHQvKipcblx0ICogQm9vdHN0cmFwXG5cdCAqXG5cdCAqIFJlbmRlcnMgaW5pdGlhbCBzdGF0ZSBvZiBjb2xsZWN0aW9uIGludG8gb3VyIHJlZ2lvblxuXHQgKiB1c2luZyBvdXIgY2hpbGQgdGVtcGxhdGUuXG5cdCAqL1xuXG5cdC8vIElmIG91ciBjb2xsZWN0aW9uIGlzIGZldGNoaW5nLCByZW5kZXIgdGhlIGZldGNoaW5nIChsb2FkaW5nKSBzdGF0ZS5cblx0aWYgKGNvbGxlY3Rpb24uc3luY2luZykge1xuXHRcdHJlbmRlclN5bmNpbmcoKTtcblx0fVxuXG5cblx0Ly8gSWYgb3VyIGNvbGxlY3Rpb24gZmFpbGVkIHRvIGZldGNoIChpLmUuIHJlY2VpdmVkIGEgNHh4IG9yIDV4eCBlcnJvciBjb2RlKVxuXHQvLyByZW5kZXIgYW4gZXJyb3Igc3RhdGVcblx0Ly9cblx0Ly8gSGFuZGxlIHRoZSBjYXNlIG9mIG11bHRpcGxlIGVycm9yIHN0YXRlcyB3aXRoIGRpZmZlcmVudCBzdHlsZXMgaGVyZSBhcyB3ZWxsLlxuXHRlbHNlIGlmIChjb2xsZWN0aW9uLmVycm9yKSB7XG5cdFx0cmVuZGVyRXJyb3IoKTtcblx0fVxuXG5cblx0Ly8gT3RoZXJ3aXNlIG91ciBjb2xsZWN0aW9uIGlzIGxvYWRlZCBhbmQgcmVhZHksXG5cdC8vIHNvIGdvIGFoZWFkIGFuZCByZW5kZXIgaXQgaW50byB0aGUgdGFyZ2V0IHJlZ2lvbi5cblx0Ly9cblx0Ly8gKGFsdGVybmF0aXZlbHkgYXQgdGhpcyBwb2ludCwgYSBjdXN0b20gYGVtcHR5YCBzdGF0ZSBtYXkgYmUgcmVuZGVyZWQpXG5cdC8vIGNvbnNvbGUubG9nKCdUaGUgY29sbGVjdGlvbiAnICsgc3ViY29tcG9uZW50TmFtZSArICctLS0tPicpO1xuXHRlbHNlIHJlbmRlclJlc2V0KCk7XG5cblxuXG5cblxuXG5cblx0LyoqXG5cdCAqIEJpbmQgZXZlbnRzXG5cdCAqXG5cdCAqIExpc3RlbiBmb3Igc3RhdGUgY2hhbmdlcyAoc3luY2luZywgc3luY2VkLCBzZXJ2ZXIgZXJyb3IsIGFkZCwgcmVtb3ZlLCBzb3J0LCBldGMuKVxuXHQgKiBUaGVzZSBtYW51YWwgYmluZGluZ3MgY2FuIGJlIHJlbW92ZWQgd2hlbiBjb3JlIGZyYW1ld29yayBzdXBwb3J0cyByZW5kZXItdGltZSBjb2xsZWN0aW9uXG5cdCAqIGJpbmRpbmdzLiAgRm9yIG5vdywgZG9pbmcgaXQgdGhpcyB3YXkgcmF0aGVyIHRoYW4gcGF0Y2hpbmcgdGhlIGNvcmUgdG8gdGVzdCBvdXIgc3RydWN0dXJhbFxuXHQgKiBhc3N1bXB0aW9ucy5cblx0ICovXG5cblx0Ly8gV2hlbiBhIGZldGNoIGlzIGluaXRpYXRlZCBmcm9tIHRoZSBzZXJ2ZXIuLi5cblx0Ly9cblx0Ly8gKGFmdGVyIGBCYWNrYm9uZS5zeW5jYCBiZWdpbnMgYSByZW1vdGUgcmVxdWVzdClcblx0dGhpcy5saXN0ZW5Ubyhjb2xsZWN0aW9uLCAncmVxdWVzdCcsIGZ1bmN0aW9uIGFmdGVyUmVxdWVzdCAoKSB7XG5cdFx0cmVuZGVyU3luY2luZygpO1xuXHR9KTtcblxuXHQvLyBXaGVuIGEgZmV0Y2ggY29tcGxldGVzIHN1Y2Nlc3NmdWxseSBhbmQgbmV3IGRhdGEgaXMgbG9hZGVkLi4uXG5cdC8vXG5cdC8vIChhZnRlciB0aGlzIGNvbXBvbmVudCBpcyBhbHJlYWR5IGluc3RhbnRpYXRlZClcblx0dGhpcy5saXN0ZW5Ubyhjb2xsZWN0aW9uLCAnc3luYycsIGZ1bmN0aW9uIGFmdGVyU3luYyAoKSB7XG5cdFx0cmVuZGVyU3luY2VkKCk7XG5cdFx0cmVuZGVyUmVzZXQoKTtcblx0fSk7XG5cblx0Ly8gV2hlbiBzZXJ2ZXIgc2VuZHMgYSByZXNwb25zZSB3LyBhbiBlcnJvciBjb2RlXG5cdC8vXG5cdC8vIChhZnRlciB0aGlzIGNvbXBvbmVudCBpcyBhbHJlYWR5IGluc3RhbnRpYXRlZClcblx0dGhpcy5saXN0ZW5Ubyhjb2xsZWN0aW9uLCAnZXJyb3InLCBmdW5jdGlvbiBhZnRlclN5bmNFcnJvciAoY29sbGVjdGlvbiwgeGhyKSB7XG5cblx0XHQvLyBJZ25vcmUgYWJvcnQgXCJlcnJvclwiXG5cdFx0Ly9cblx0XHQvLyBXaHk/IGJlY2F1c2UgaXQncyBub3QgYWN0dWFsbHkgYW4gZXJyb3IuXG5cdFx0Ly8gTm90IHN1cmUgd2h5IHRoaXMgdHJpZ2dlcnMgQmFja2JvbmUuQ29sbGVjdGlvbidzIGBlcnJvcmAgZXZlbnQuLi5cblx0XHQvL1xuXHRcdC8vIElmIHR3byBmZXRjaGVzIG9jY3VyIG9uIHRoZSBzYW1lIGNvbGxlY3Rpb24gYXQgdGhlIHNhbWUgdGltZSxcblx0XHQvLyB3ZSBhYm9ydCB0aGUgb2xkIFhIUiByZXF1ZXN0IG91cnNlbHZlcyBpZiBpdCdzIHN0aWxsIHJ1bm5pbmcpXG5cdFx0aWYgKHhociAmJiB4aHIuc3RhdHVzVGV4dCA9PT0gJ2Fib3J0JykgcmV0dXJuO1xuXG5cdFx0cmVuZGVyRXJyb3IoKTtcblx0fSk7XG5cblx0Ly8gV2hlbiBhIG1vZGVsIGlzIGFkZGVkLi4uXG5cdC8vXG5cdC8vIExpc3RlbiBmb3IgbmV3IG1vZGVscywgYW5kIGluc2VydCBhIGNoaWxkIHRlbXBsYXRlXG5cdC8vIGF0IHRoZSBhcHByb3ByaWF0ZSBpbmRleCB3aXRoaW4gdGhlIHJlZ2lvbi5cblx0dGhpcy5saXN0ZW5Ubyhjb2xsZWN0aW9uLCAnYWRkJywgZnVuY3Rpb24gYWZ0ZXJBZGQgKCBtb2RlbCwgY29sbGVjdGlvbiwgb3B0aW9ucyApIHtcblx0XHRyZW5kZXJBZGQoIG1vZGVsLCBvcHRpb25zLmF0ICk7XG5cdH0pO1xuXG5cdC8vIFdoZW4gYSBtb2RlbCBpcyByZW1vdmVkLi4uXG5cdC8vXG5cdC8vIEdyYWIgbW9kZWwncyByZWxhdGl2ZSBpbmRleCB3aXRoaW4gY29sbGVjdGlvbiBhbmQgcmVtb3ZlXG5cdC8vIHRoZSBjaGlsZCB0ZW1wbGF0ZSBhdCB0aGUgc2FtZSBpbmRleCB3aXRoaW4gdGhlIHJlZ2lvbi5cblx0dGhpcy5saXN0ZW5Ubyhjb2xsZWN0aW9uLCAncmVtb3ZlJywgZnVuY3Rpb24gYWZ0ZXJSZW1vdmUgKCBtb2RlbCwgY29sbGVjdGlvbiwgb3B0aW9ucyApIHtcblx0XHRyZW5kZXJSZW1vdmUoIG9wdGlvbnMuaW5kZXggKTtcblx0fSk7XG5cblxuXG59O1xuIiwiLyoqXG4gKiBDaGVjayB0aGUgc3BlY2lmaWVkIGRlZmluaXRpb24gZm9yIG9idmlvdXMgbWlzdGFrZXMsIGVzcGVjaWFsbHkgbGlrZWx5IGRlcHJlY2F0aW9ucyBhbmRcbiAqIHZhbGlkYXRlIHRoYXQgdGhlIG1vZGVsIGFuZCBjb2xsZWN0aW9ucyBhcmUgaW5zdGFuY2VzIG9mIEJhY2tib25lJ3MgRGF0YSBzdHJ1Y3R1cmVzLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBwcm9wZXJ0aWVzIFtPYmplY3QgY29udGFpbmluZyB0aGUgcHJvcGVydGllcyBvZiB0aGUgY29tcG9uZW50XVxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gdmFsaWRhdGVEZWZpbml0aW9uKHByb3BlcnRpZXMpIHtcblxuXHRpZiAoXy5pc09iamVjdChwcm9wZXJ0aWVzKSkge1xuXG5cdFx0Ly8gRGV0ZXJtaW5lIGNvbXBvbmVudCBpZFxuXHRcdHZhciBpZCA9IHRoaXMuaWQgfHwgcHJvcGVydGllcy5pZDtcblxuXHRcdGZ1bmN0aW9uIF92YWxpZGF0ZUJhY2tib25lSW5zdGFuY2UgKHR5cGUpIHtcblx0XHRcdHZhciBUeXBlID0gdHlwZVswXS50b1VwcGVyQ2FzZSgpICsgdHlwZS5zbGljZSgxKTtcblxuXHRcdFx0aWYgKCAhcHJvcGVydGllc1t0eXBlXSBpbnN0YW5jZW9mIEJhY2tib25lW1R5cGVdICkge1xuXG5cdFx0XHRcdEZyYW1ld29yay5lcnJvcihcblx0XHRcdFx0XHQnQ29tcG9uZW50ICgnICsgaWQgKyAnKSBoYXMgYW4gaW52YWxpZCAnICsgdHlwZSArICctLSBcXG4nICtcblx0XHRcdFx0XHQnSWYgYCcgKyB0eXBlICsgJ2AgaXMgc3BlY2lmaWVkIGZvciBhIGNvbXBvbmVudCwgJyArXG5cdFx0XHRcdFx0J2l0IG11c3QgYmUgYW4gKmluc3RhbmNlKiBvZiBhIEJhY2tib25lLicgKyBUeXBlICsgJy5cXG4nKTtcblxuXHRcdFx0XHRpZiAocHJvcGVydGllc1t0eXBlXSBpbnN0YW5jZW9mIEJhY2tib25lW1R5cGVdLmNvbnN0cnVjdG9yKSB7XG5cdFx0XHRcdFx0RnJhbWV3b3JrLmVycm9yKFxuXHRcdFx0XHRcdFx0J0l0IGxvb2tzIGxpa2UgYSBCYWNrYm9uZS4nICsgVHlwZSArICcgKnByb3RvdHlwZSogd2FzIHNwZWNpZmllZCBpbnN0ZWFkIG9mIGEgJyArXG5cdFx0XHRcdFx0XHQnQmFja2JvbmUuJyArIFR5cGUgKyAnICppbnN0YW5jZSouXFxuJyArXG5cdFx0XHRcdFx0XHQnUGxlYXNlIGBuZXdgIHVwIHRoZSAnICsgdHlwZSArICcgLWJlZm9yZS0gJyArIEZyYW1ld29yay5pZCArICcucmFpc2UoKSwnICtcblx0XHRcdFx0XHRcdCdvciB1c2UgYSB3cmFwcGVyIGZ1bmN0aW9uIHRvIGFjaGlldmUgdGhlIHNhbWUgZWZmZWN0LCBlLmcuOlxcbicgK1xuXHRcdFx0XHRcdFx0J2AnICsgdHlwZSArICc6IGZ1bmN0aW9uICgpIHtcXG5yZXR1cm4gbmV3IFNvbWUnICsgVHlwZSArICcoKTtcXG59YCdcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0RnJhbWV3b3JrLndhcm4oJ0lnbm9yaW5nIGludmFsaWQgJyArIHR5cGUgKyAnIDo6ICcgKyBwcm9wZXJ0aWVzW3R5cGVdKTtcblx0XHRcdFx0ZGVsZXRlIHByb3BlcnRpZXNbdHlwZV07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgdGhhdCB0aGlzLmNvbGxlY3Rpb24gaXMgYWN0dWFsbHkgYW4gaW5zdGFuY2Ugb2YgQmFja2JvbmUuQ29sbGVjdGlvblxuXHRcdC8vIGFuZCB0aGF0IHRoaXMubW9kZWwgaXMgYWN0dWFsbHkgYW4gaW5zdGFuY2Ugb2YgQmFja2JvbmUuTW9kZWxcblx0XHRfdmFsaWRhdGVCYWNrYm9uZUluc3RhbmNlKCdtb2RlbCcpO1xuXHRcdF92YWxpZGF0ZUJhY2tib25lSW5zdGFuY2UoJ2NvbGxlY3Rpb24nKTtcblxuXHRcdC8vIENsb25lIHByb3BlcnRpZXMgdG8gYXZvaWQgaW5hZHZlcnRlbnQgbW9kaWZpY2F0aW9uc1xuXHRcdHJldHVybiBfLmNsb25lKHByb3BlcnRpZXMpO1xuXHR9XG5cblx0ZWxzZSByZXR1cm4ge307XG5cbn1cbiIsIi8qKlxuICogUnVuIGRlZmluaXRpb24gbWV0aG9kcyB0byBnZXQgYWN0dWFsIGNvbXBvbmVudCBkZWZpbml0aW9ucy5cbiAqIFRoaXMgaXMgZGVmZXJyZWQgdG8gYXZvaWQgaGF2aW5nIHRvIHVzZSBCYWNrYm9uZSdzIGZ1bmN0aW9uICgpIHt9IGFwcHJvYWNoIGZvciB0aGluZ3NcbiAqIGxpa2UgY29sbGVjdGlvbnMuXG4gKi9cblxuLyoqXG4gKiBCdWlsZCB1cHMgYSBjb21wb25lbnQgZGVmaW5pdGlvbiBieSBydW5uaW5nIHRoZSBkZWZpbml0aW9uLiBXZSB0aGVuIGxpbmsgdGhlXG4gKiBjb21wb25lbnQgZGVmaW5pdGlvbiB0byBhbiBpZGVudGlmaWVyIGluIGBGUkFNRVdPUksuY29tcG9uZW50c2AuXG4gKlxuICogQHBhcmFtICB7T2JqZWN0fSBjb21wb25lbnQgW09iamVjdCBjb250YWluaW5nIHRoZSBkZWZpbml0aW9uIGZ1bmN0aW9uIG9mIHRoZSBjb21wb25lbnRdXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYnVpbGRDb21wb25lbnREZWZpbml0aW9uKGNvbXBvbmVudCkge1xuXHR2YXIgY29tcG9uZW50RGVmID0gY29tcG9uZW50LmRlZmluaXRpb24oKTtcblxuXHRpZiAoY29tcG9uZW50LmlkT3ZlcnJpZGUpIHtcblx0XHRpZiAoY29tcG9uZW50RGVmLmlkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoY29tcG9uZW50LmlkT3ZlcnJpZGUgKyAnOjogQ2Fubm90IHNwZWNpZnkgYW4gaWRPdmVycmlkZSBpbiAuZGVmaW5lKCkgaWYgYW4gaWQgcHJvcGVydHkgKCcrY29tcG9uZW50RGVmLmlkKycpIGlzIGFscmVhZHkgc2V0IGluIHlvdXIgY29tcG9uZW50IGRlZmluaXRpb24hXFxuVXNhZ2U6IC5kZWZpbmUoW2lkT3ZlcnJpZGVdLCBkZWZpbml0aW9uKScpO1xuXHRcdH1cblx0XHRjb21wb25lbnREZWYuaWQgPSBjb21wb25lbnQuaWRPdmVycmlkZTtcblx0fVxuXHRpZiAoIWNvbXBvbmVudERlZi5pZCkge1xuXHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IHVzZSAuZGVmaW5lKCkgd2l0aG91dCBkZWZpbmluZyBhbiBpZCBwcm9wZXJ0eSBvciBvdmVycmlkZSBpbiB5b3VyIGNvbXBvbmVudCFcXG5Vc2FnZTogLmRlZmluZShbaWRPdmVycmlkZV0sIGRlZmluaXRpb24pJyk7XG5cdH1cblx0RlJBTUVXT1JLLmNvbXBvbmVudHNbY29tcG9uZW50RGVmLmlkXSA9IGNvbXBvbmVudERlZjtcbn07XG4iLCIvKipcbiAqIE9wdGlvbmFsIG1ldGhvZCB0byByZXF1aXJlIGFwcCBjb21wb25lbnRzLiBSZXF1aXJlLmpzIGNhbiBiZSB1c2VkIGluc3RlYWRcbiAqIGFzIG5lZWRlZC5cbiAqXG4gKiBAcGFyYW0gIHtTdHJpbmd9IFx0WyhvcHRpb25hbCkgQ29tcG9uZW50IGlkIG92ZXJyaWRlXVxuICogQHBhcmFtICB7RnVuY3Rpb259IFtGdW5jdGlvbiBEZWZpbml0aW9uIG9mIGNvbXBvbmVudF1cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBkZWZpbmUoaWQsIGRlZmluaXRpb25Gbikge1xuXHQvLyBJZCBwYXJhbSBpcyBvcHRpb25hbFxuXHRpZiAoIWRlZmluaXRpb25Gbikge1xuXHRcdGRlZmluaXRpb25GbiA9IGlkO1xuXHRcdGlkID0gbnVsbDtcblx0fVxuXG5cdEZSQU1FV09SSy5fZGVmaW5lUXVldWUucHVzaCh7XG5cdFx0ZGVmaW5pdGlvbjogZGVmaW5pdGlvbkZuLFxuXHRcdGlkT3ZlcnJpZGU6IGlkXG5cdH0pO1xufTtcbiIsIi8qKlxuICogTWFzdCBidWlsZCBmaWxlLiBUaGUgbWFpbiBmaWxlXG4gKi9cblxudmFyIGRlZmluZSA9IHJlcXVpcmUoJy4vZGVmaW5lL2luZGV4Jyk7XG52YXIgUmVnaW9uID0gcmVxdWlyZSgnLi9yZWdpb24vaW5kZXgnKTtcbnZhciBDb21wb25lbnQgPSByZXF1aXJlKCcuL2NvbXBvbmVudC9pbmRleCcpO1xudmFyIHJhaXNlID0gcmVxdWlyZSgnLi9yYWlzZS9pbmRleCcpO1xuXG4vKipcbiAqIEZyYW1ld29yayBjbGFzcyBkZWZpbml0aW9uIHRoYXQgd2lsbCBjcmVhdGUgYSBuZXcgZ2xvYmFsIGluc3RhbmNlIG9mIGEgY3VzdG9tIEZyYW1ld29yay5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBbb3B0aW9ucyBoYXNoIHRvIGluaXRpYWxpemUgdGhlIGN1c3RvbSBmcmFtZXdvcmsgd2l0aF1cbiAqL1xuRnJhbWV3b3JrID0gZnVuY3Rpb24ob3B0aW9ucykge1xuXHQvLyBTZXQgdGhlIGRlZmF1bHQgb3B0aW9ucyBmb3IgdGhvc2Ugbm90IHBhc3NlZCBpbi5cblx0b3B0aW9ucyA9IF8uZGVmYXVsdHMob3B0aW9ucywge1xuXHRcdHRocm90dGxlV2luZG93UmVzaXplOiAyMDAsXG5cdFx0bG9nTGV2ZWw6ICd3YXJuJyxcblx0XHRmcmFtZXdvcmtJZDogJ01hc3QnLFxuXHRcdHByb2R1Y3Rpb246IGZhbHNlLFxuXHRcdGxvZ2dlcjogdW5kZWZpbmVkLFxuXHRcdHNob3J0Y3V0OiB7XG5cdFx0XHR0ZW1wbGF0ZTogdHJ1ZSxcblx0XHRcdGNvdW50OiB0cnVlXG5cdFx0fVxuXHR9KTtcblxuXHQvLyBTZXQgYSBzdGFydGluZyBwb2ludCB0byBCYWNrYm9uZSBhbmQgYWRkIGFkZGl0aW9uYWwgYXR0cmlidXRlLlxuXHRfLmV4dGVuZCh0aGlzLCBCYWNrYm9uZSwge1xuXHRcdG9wdGlvbnM6IG9wdGlvbnMsXG5cdFx0dGVtcGxhdGVzOiB7fSxcblx0XHRjb21wb25lbnRzOiB7fSxcblx0XHRkYXRhOiB7fSxcblx0XHRfZGVmaW5lUXVldWU6IFtdLFxuXHRcdHJlZ2lvbnM6IHt9XG5cdH0pO1xuXG5cdC8qKlxuXHQgKiBFeHRlbmQgRlJBTUVXT1JLLkNvbGxlY3Rpb24gdG8gbWFrZSBpdCBiZXR0ZXJcblx0ICogKHNwZWNpZmljYWxseSwgdG8gYWRkIGVycm9yIGhhbmRsaW5nKVxuXHQgKi9cblx0dmFyIHNlbGYgPSB0aGlzO1xuXHR2YXIgb3JpZ2luYWxDb2xsZWN0aW9uID0gdGhpcy5Db2xsZWN0aW9uO1xuXHR0aGlzLkNvbGxlY3Rpb24gPSBvcmlnaW5hbENvbGxlY3Rpb24uZXh0ZW5kKHtcblxuXHRcdGluaXRpYWxpemU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG5cblx0XHRcdC8vIE92ZXJyaWRlIGBjb2xsZWN0aW9uLmZldGNoKClgXG5cdFx0XHR0aGlzLl9mZXRjaCA9IHRoaXMuZmV0Y2g7XG5cdFx0XHR0aGlzLmZldGNoID0gdGhpc1snX2ZldGNoKysnXTtcblx0XHR9LFxuXG5cblx0XHQvKipcblx0XHQgKiBhZnRlckVycm9yXG5cdFx0ICpcblx0XHQgKiBMaWZlY3ljbGUgY2FsbGJhY2sgdG8gY2F0Y2ggd2hlbiBhIGZldGNoIGVycm9yIG9jY3Vyc1xuXHRcdCAqXG5cdFx0ICogVE9ETzpcblx0XHQgKiBQcm9iYWJseSByZW1vdmUgdGhpcy0tIHJlYXNvbmluZyA6OlxuXHRcdCAqIEluIG1vc3QgY2FzZXMsIHlvdSBhY3R1YWxseSBjYXJlIGFib3V0IHRoZSBlcnJvciBpblxuXHRcdCAqIHRoZSByZWxldmFudCBjb21wb25lbnRzIHdobyBhcmUgdXNpbmcgdGhpcyBjb2xsZWN0aW9uLFxuXHRcdCAqIGluIHdoaWNoIGNhc2UgeW91J2QganVzdCBiaW5kIGFuIGVycm9yIGV2ZW50IGhhbmRsZXIuXG5cdFx0ICovXG5cdFx0YWZ0ZXJFcnJvcjogZnVuY3Rpb24gKGNvbGxlY3Rpb24sIHhociwgb3B0aW9ucykge1xuXHRcdFx0Ly8gdGhpcyBleGlzdHMgZm9yIHlvdSB0byBvdmVycmlkZSBpdCFcblx0XHR9LFxuXG5cblxuXG5cdFx0LyoqXG5cdFx0ICogT3ZlcnJpZGUgQmFja2JvbmUuQ29sbGVjdGlvbidzIGBmZXRjaCgpYFxuXHRcdCAqIHRvIGFsbG93IGZvciBiZXR0ZXIgZXJyb3IgaGFuZGxpbmcuXG5cdFx0ICpcblx0XHQgKiBUT0RPOiBwdWxsIHRoaXMgaW50byBCYWNrYm9uZS5zeW5jIGluc3RlYWQuLlxuXHRcdCAqIG9ubHkgcHJvYmxlbSBpcyBjbGFzaGluZyB3aXRoIG90aGVyIHN5bmMgb3ZlcnJpZGVzXG5cdFx0ICovXG5cdFx0J19mZXRjaCsrJzogZnVuY3Rpb24gKG9wdGlvbnMpIHtcblx0XHRcdHZhciBjb2xsZWN0aW9uID0gdGhpcztcblxuXHRcdFx0b3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cblx0XHRcdC8vIExvZyBhIGZyaWVuZGxpZXIgXCJObyBVUkxcIiBtZXNzYWdlOlxuXHRcdFx0aWYgKCAhY29sbGVjdGlvbi51cmwgKSB7XG5cdFx0XHRcdHNlbGYuZXJyb3IoJ0Nhbm5vdCBmZXRjaCgpICcgKyBjb2xsZWN0aW9uLnR5cGUgKyAnIDo6IENvbGxlY3Rpb24gaGFzIG5vIFVSTCBmdW5jdGlvbi9wcm9wZXJ0eS4uLicpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIE92ZXJyaWRlIGVycm9yIGhhbmRsZXIgdG8gbWl4aW4gYW4gJ2Vycm9yJyBldmVudFxuXHRcdFx0dmFyIG9yaWdpbmFsRXJyb3JIYW5kbGVyID0gb3B0aW9ucy5lcnJvcjtcblx0XHRcdHZhciBvcmlnaW5hbFN1Y2Nlc3NIYW5kbGVyID0gb3B0aW9ucy5zdWNjZXNzO1xuXHRcdFx0Xy5leHRlbmQob3B0aW9ucywge1xuXHRcdFx0XHRzdWNjZXNzOiBmdW5jdGlvbiAoY29sbGVjdGlvbiwgeGhyLCBvcHRpb25zKSB7XG5cdFx0XHRcdFx0dmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuXG5cdFx0XHRcdFx0Ly8gTnVsbCBvdXQgYGNvbGxlY3Rpb24uc3luY2luZ2Bcblx0XHRcdFx0XHRjb2xsZWN0aW9uLnN5bmNpbmcgPSBudWxsO1xuXG5cdFx0XHRcdFx0Ly8gVHJpZ2dlciBvcmlnaW5hbCBzdWNjZXNzIGhhbmRsZXIgaWYgc3BlY2lmaWVkXG5cdFx0XHRcdFx0Ly8gb24gYGZldGNoKHtzdWNjZXNzOiBmdW5jdGlvbigpey8qLi4uKi99fSlgXG5cdFx0XHRcdFx0aWYgKG9yaWdpbmFsU3VjY2Vzc0hhbmRsZXIpIHtcblx0XHRcdFx0XHRcdHJldHVybiBvcmlnaW5hbFN1Y2Nlc3NIYW5kbGVyLmFwcGx5KGNvbGxlY3Rpb24sIGFyZ3MpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0ZXJyb3I6IGZ1bmN0aW9uIChjb2xsZWN0aW9uLCB4aHIsIG9wdGlvbnMpIHtcblx0XHRcdFx0XHR2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG5cblx0XHRcdFx0XHQvLyBOdWxsIG91dCBgY29sbGVjdGlvbi5zeW5jaW5nYFxuXHRcdFx0XHRcdGNvbGxlY3Rpb24uc3luY2luZyA9IG51bGw7XG5cblx0XHRcdFx0XHQvLyBJZiB0aGlzIGlzIGFuIFwiYWJvcnRcIiwgaWdub3JlIGl0LSAoc3RhdGUgaGFzIGFscmVhZHkgYmVlbiB0YWtlbiBjYXJlIG9mKVxuXHRcdFx0XHRcdGlmICggeGhyICYmIHhoci5zdGF0dXNUZXh0PT09J2Fib3J0JyApIHJldHVybjtcblxuXHRcdFx0XHRcdC8vIFNldCBgY29sbGVjdGlvbi5lcnJvcmAgdXNpbmcgdGhlIHJlc3BvbnNlIGZyb20gdGhlIGZldGNoXG5cdFx0XHRcdFx0Ly8gKHRyeSBqc29uLCB0aGVuIHJlc3BvbnNlIHRleHQsIHRoZW4gc3RhdHVzIGNvZGUsIHRoZW4ganVzdCBkZWZhdWx0IHRvIGB0cnVlYClcblx0XHRcdFx0XHRjb2xsZWN0aW9uLmVycm9yID1cblx0XHRcdFx0XHRcdCggeGhyICYmIHhoci5yZXNwb25zZUpTT04gKSA/IHhoci5yZXNwb25zZUpTT04gOlxuXHRcdFx0XHRcdFx0KCB4aHIgJiYgeGhyLnJlc3BvbnNlVGV4dCApID8geGhyLnJlc3BvbnNlVGV4dCA6XG5cdFx0XHRcdFx0XHR0cnVlO1xuXG5cblx0XHRcdFx0XHQvLyBDYWxsIGBhZnRlckVycm9yKClgXG5cdFx0XHRcdFx0Y29sbGVjdGlvbi5hZnRlckVycm9yLmFwcGx5KGNvbGxlY3Rpb24sYXJncyk7XG5cblx0XHRcdFx0XHQvLyBUcmlnZ2VyIG9yaWdpbmFsIGVycm9yIGhhbmRsZXIgaWYgc3BlY2lmaWVkXG5cdFx0XHRcdFx0Ly8gb24gYGZldGNoKHtlcnJvcjogZnVuY3Rpb24oKXsvKi4uLiovfX0pYFxuXHRcdFx0XHRcdGlmIChvcmlnaW5hbEVycm9ySGFuZGxlcikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG9yaWdpbmFsRXJyb3JIYW5kbGVyLmFwcGx5KGNvbGxlY3Rpb24sIGFyZ3MpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIE51bGwgb3V0IGBjb2xsZWN0aW9uLmVycm9yYFxuXHRcdFx0Y29sbGVjdGlvbi5lcnJvciA9IG51bGw7XG5cblx0XHRcdC8vIElmIGBmZXRjaGAgaXMgYWxyZWFkeSBpbiBwcm9ncmVzcywgY2FuY2VsIGl0XG5cdFx0XHQvLyBhbmQgZmlyZSBvZmYgYSBuZXcgb25lLlxuXHRcdFx0aWYgKGNvbGxlY3Rpb24uc3luY2luZykge1xuXHRcdFx0XHRzZWxmLmxvZygnQWJvcnRpbmcgcnVubmluZyBgZmV0Y2goKWAgaW4gb3JkZXIgdG8gc3RhcnQgYSBuZXcgYGZldGNoKClgLi4uJyk7XG5cdFx0XHRcdGNvbGxlY3Rpb24uc3luY2luZy5hYm9ydCgpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDYWxsIG9yaWdpbmFsIGBmZXRjaCgpYCB1c2luZyBvdXIgbW9ua2V5LXBhdGNoZWQgb3B0aW9uc1xuXHRcdFx0dmFyIHhociA9IGNvbGxlY3Rpb24uX2ZldGNoKG9wdGlvbnMpO1xuXG5cdFx0XHQvLyBTZXQgYGNvbGxlY3Rpb24uc3luY2luZ2AgdG8gdGhlIFhIUiBvYmplY3QgaW4gdXNlXG5cdFx0XHRjb2xsZWN0aW9uLnN5bmNpbmcgPSB4aHI7XG5cblx0XHRcdC8vIFJldHVybiB0aGUgWEhSIG9iamVjdCB0byBtYWludGFpbiBvcmlnaW5hbCBgQmFja2JvbmUuQ29sbGVjdGlvbi5mZXRjaCgpYCBBUElcblx0XHRcdHJldHVybiB4aHI7XG5cdFx0fVxuXG5cdH0pO1xuXG5cdC8vIEV4cG9zZSBhIGdsb2JhbCBmb3IgdGhlIGN1c3RvbSBGUkFNRVdPUksuXG5cdHZhciBmcmFtZXdvcmtOYW1lID0gb3B0aW9ucy5mcmFtZXdvcmtJZDtcblx0d2luZG93W2ZyYW1ld29ya05hbWVdID0gdGhpcztcblxuXHQvLyBUaHJvdWdodG91dCB0aGUgc291cmNlIGNvZGUsIHRoZXJlIGFyZSBvcGVyYXRpb25zIG9uIGBGUkFNRVdPUktgIG9yIGNvZGUgdGhhdCBhY2Nlc3Nlc1xuXHQvLyBpdHMgYXR0cmlidXRlcy4gV2Ugd2lsbCBtYWtlIGBGUkFNRVdPUktgIGFjY2Vzc2FibGUgYnkgYXNzaWduaW5nIGl0IHRoZSBpbnN0YW5jZSBvZiB0aGVcblx0Ly8gY3VzdG9tIEZyYW1ld29yay5cblx0RlJBTUVXT1JLID0gd2luZG93W2ZyYW1ld29ya05hbWVdO1xufTtcblxuLy8gRnJhbWV3b3JrIHByb3RvdHlwZSBtZXRob2RzLlxuRnJhbWV3b3JrLnByb3RvdHlwZS5SZWdpb24gPSBSZWdpb247XG5GcmFtZXdvcmsucHJvdG90eXBlLkNvbXBvbmVudCA9IENvbXBvbmVudDtcbkZyYW1ld29yay5wcm90b3R5cGUuZGVmaW5lID0gZGVmaW5lO1xuRnJhbWV3b3JrLnByb3RvdHlwZS5yYWlzZSA9IHJhaXNlO1xuXG4iLCIvKipcbiAqXHRMb2dnZXQgY29uc3RydWN0b3IgbWV0aG9kIHRoYXQgd2lsbCBzZXR1cCBGUkFNRVdPUksgdG8gbG9nIG1lc3NhZ2VzLlxuICovXG5cbnZhciBzZXR1cExvZ2dlciA9IHJlcXVpcmUoJy4vc2V0dXAnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBMb2dnZXIoKSB7XG5cblx0Ly8gVXBvbiBpbml0aWFsaXphdGlvbiwgc2V0dXAgbG9nZ2VyXG5cdHNldHVwTG9nZ2VyKEZSQU1FV09SSy5vcHRpb25zLmxvZ0xldmVsKTtcblxuXHQvLyBJbiBzdXBwb3J0ZWQgYnJvd3NlcnMsIGFsc28gcnVuIHNldHVwTG9nZ2VyIGFnYWluXG5cdC8vIHdoZW4gRlJBTUVXT1JLLmxvZ0xldmVsIGlzIHNldCBieSB0aGUgdXNlclxuXHQvLyBUT0RPOiBmaW5kIGEgd2F5IHRvIGRvIHRoaXMgd2l0aG91dCBkZXBlbmRpbmcgb24gX19kZWZpbmVTZXR0ZXJfXy5cblx0aWYgKF8uaXNGdW5jdGlvbihGUkFNRVdPUksuX19kZWZpbmVTZXR0ZXJfXykpIHtcblx0XHRGUkFNRVdPUksuX19kZWZpbmVTZXR0ZXJfXygnbG9nTGV2ZWwnLCBmdW5jdGlvbiBvbkNoYW5nZSAobmV3TG9nTGV2ZWwpIHtcblx0XHRcdHNldHVwTG9nZ2VyKG5ld0xvZ0xldmVsKTtcblx0XHR9KTtcblx0fVxufTtcbiIsIi8qKlxuICogU2V0IHVwIHRoZSBsb2cgZnVuY3Rpb25zOlxuICpcbiAqIEZSQU1FV09SSy5lcnJvclxuICogRlJBTUVXT1JLLndhcm5cbiAqIEZSQU1FV09SSy5sb2dcbiAqIEZSQU1FV09SSy5kZWJ1ZyAoKmxlZ2FjeSlcbiAqIEZSQU1FV09SSy52ZXJib3NlXG4gKlxuICogQHBhcmFtICB7U3RyaW5nfSBsb2dMZXZlbCBbVGhlIGRlc2lyZWQgbG9nIGxldmVsIG9mIHRoZSBMb2dnZXJdXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gc2V0dXBMb2dnZXIgKGxvZ0xldmVsKSB7XG5cblx0dmFyIG5vb3AgPSBmdW5jdGlvbiAoKSB7fTtcblxuXHQvLyBJZiBsb2cgaXMgc3BlY2lmaWVkLCB1c2UgaXQsIG90aGVyd2lzZSB1c2UgdGhlIGNvbnNvbGVcblx0aWYgKEZSQU1FV09SSy5sb2dnZXIpIHtcblx0XHRGUkFNRVdPUksuZXJyb3IgICAgID0gRlJBTUVXT1JLLmxvZ2dlci5lcnJvcjtcblx0XHRGUkFNRVdPUksud2FybiAgICAgID0gRlJBTUVXT1JLLmxvZ2dlci53YXJuO1xuXHRcdEZSQU1FV09SSy5sb2cgICAgICAgPSBGUkFNRVdPUksubG9nZ2VyLmRlYnVnIHx8IEZSQU1FV09SSy5sb2dnZXI7XG5cdFx0RlJBTUVXT1JLLnZlcmJvc2UgICA9IEZSQU1FV09SSy5sb2dnZXIudmVyYm9zZTtcblx0fVxuXG5cdC8vIEluIElFLCB3ZSBjYW4ndCBkZWZhdWx0IHRvIHRoZSBicm93c2VyIGNvbnNvbGUgYmVjYXVzZSB0aGVyZSBJUyBOTyBCUk9XU0VSIENPTlNPTEVcblx0ZWxzZSBpZiAodHlwZW9mIGNvbnNvbGUgIT09ICd1bmRlZmluZWQnKSB7XG5cblx0XHQvLyBXZSBjYW5ub3QgY2FsbGVkIHRoZSAuYmluZCBtZXRob2Qgb24gdGhlIGNvbnNvbGUgbWV0aG9kcy4gV2UgYXJlIGluIGllIDkgb3IgOCwganVzdCBtYWtlXG5cdFx0Ly8gZXZlcnlodGluZyBhIG5vb3AuXG5cdFx0aWYgKF8uaXNVbmRlZmluZWQoY29uc29sZS5sb2cuYmluZCkpICB7XG5cdFx0XHRGUkFNRVdPUksuZXJyb3IgICAgID0gbm9vcDtcblx0XHRcdEZSQU1FV09SSy53YXJuICAgICAgPSBub29wO1xuXHRcdFx0RlJBTUVXT1JLLmxvZyAgICAgICA9IG5vb3A7XG5cdFx0XHRGUkFNRVdPUksuZGVidWcgICAgID0gbm9vcDtcblx0XHRcdEZSQU1FV09SSy52ZXJib3NlICAgPSBub29wO1xuXHRcdH1cblxuXHRcdC8vIFdlIGFyZSBpbiBhIGZyaWVuZGx5IGJyb3dzZXIgbGlrZSBDaHJvbWUsIEZpcmVmb3gsIG9yIElFMTBcblx0XHRlbHNlIHtcblx0XHRcdEZSQU1FV09SSy5lcnJvclx0XHQ9IGNvbnNvbGUuZXJyb3IgJiYgY29uc29sZS5lcnJvci5iaW5kKGNvbnNvbGUpO1xuXHRcdFx0RlJBTUVXT1JLLndhcm5cdFx0PSBjb25zb2xlLndhcm4gJiYgY29uc29sZS53YXJuLmJpbmQoY29uc29sZSk7XG5cdFx0XHRGUkFNRVdPUksubG9nXHRcdFx0PSBjb25zb2xlLmRlYnVnICYmIGNvbnNvbGUuZGVidWcuYmluZChjb25zb2xlKTtcblx0XHRcdEZSQU1FV09SSy52ZXJib3NlXHQ9IGNvbnNvbGUubG9nICYmIGNvbnNvbGUubG9nLmJpbmQoY29uc29sZSk7XG5cblx0XHRcdC8vIFVzZSBsb2cgbGV2ZWwgY29uZmlnIGlmIHByb3ZpZGVkXG5cdFx0XHRzd2l0Y2ggKGxvZ0xldmVsKSB7XG5cdFx0XHRcdGNhc2UgJ3ZlcmJvc2UnOiBicmVhaztcblxuXHRcdFx0XHRjYXNlICdkZWJ1Zyc6XG5cdFx0XHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UgPSBub29wO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgJ3dhcm4nOlxuXHRcdFx0XHRcdEZSQU1FV09SSy52ZXJib3NlID0gRlJBTUVXT1JLLmxvZyA9IG5vb3A7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSAnZXJyb3InOlxuXHRcdFx0XHRcdEZSQU1FV09SSy52ZXJib3NlID0gRlJBTUVXT1JLLmxvZyA9IEZSQU1FV09SSy53YXJuID0gbm9vcDtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlICdzaWxlbnQnOlxuXHRcdFx0XHRcdEZSQU1FV09SSy52ZXJib3NlID0gRlJBTUVXT1JLLmxvZyA9IEZSQU1FV09SSy53YXJuID0gRlJBTUVXT1JLLmVycm9yID0gbm9vcDtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvciAoJ1VucmVjb2duaXplZCBsb2dnaW5nIGxldmVsIGNvbmZpZyAnICtcblx0XHRcdFx0XHQnKCcgKyBGUkFNRVdPUksub3B0aW9ucy5mcmFtZXdvcmtJZCArICcubG9nTGV2ZWwgPSBcIicgKyBsb2dMZXZlbCArICdcIiknKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU3VwcG9ydCBmb3IgYGRlYnVnYCBmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHlcblx0XHRcdEZSQU1FV09SSy5kZWJ1ZyA9IEZSQU1FV09SSy5sb2c7XG5cblx0XHRcdC8vIFZlcmJvc2Ugc3BpdHMgb3V0IGxvZyBsZXZlbFxuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UoJ0xvZyBsZXZlbCBzZXQgdG8gOjogJywgbG9nTGV2ZWwpO1xuXHRcdH1cblx0fVxufVxuIiwiLyoqXG4gKiBHaXZlbiBhIGNvbXBvbmVudCBkZWZpbml0aW9uIGFuZCBpdHMga2V5LCB3ZSB3aWxsIGJ1aWxkIHVwIHRoZSBjb21wb25lbnQgcHJvdG90eXBlIGFuZCBtZXJnZVxuICogdGhpcyBjb21wb25lbnQgd2l0aCBpdHMgbWF0Y2hpbmcgdGVtcGxhdGUuXG4gKlxuICogQHBhcmFtICB7T2JqZWN0fSBjb21wb25lbnREZWYgW09iamVjdCBjb250YWluaW5nIHRoZSBjb21wb25lbnQgZGVmaW5pdGlvbl1cbiAqIEBwYXJhbSAge1N0cmluZ30gY29tcG9uZW50S2V5IFtUaGUgY29tcG9uZW50IGlkZW50aWZpZXJdXG4gKi9cblxudmFyIHRyYW5zbGF0ZVNob3J0aGFuZCA9IHJlcXVpcmUoJy4uL3V0aWxzL3Nob3J0aGFuZCcpO1xudmFyIFV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMvdXRpbHMnKTtcbnZhciBFdmVudHMgPSByZXF1aXJlKCcuLi91dGlscy9ldmVudHMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBidWlsZENvbXBvbmVudFByb3RvdHlwZShjb21wb25lbnREZWYsIGNvbXBvbmVudEtleSkge1xuXG5cdC8vIElmIGNvbXBvbmVudCBpZCBpcyBub3QgZXhwbGljaXRseSBzZXQsIHVzZSB0aGUgY29tcG9uZW50S2V5XG5cdGlmICghY29tcG9uZW50RGVmLmlkKSB7XG5cdFx0Y29tcG9uZW50RGVmLmlkID0gY29tcG9uZW50S2V5O1xuXHR9XG5cblx0Ly8gU2VhcmNoIHRlbXBsYXRlc1xuXHR2YXIgdGVtcGxhdGUgPSBGUkFNRVdPUksudGVtcGxhdGVzW2NvbXBvbmVudERlZi5pZF07XG5cblx0Ly8gSWYgbm8gbWF0Y2ggZm9yIGNvbXBvbmVudCB3YXMgZm91bmTCoGluIHRlbXBsYXRlcywgaXNzdWUgYSB3YXJuaW5nXG5cdGlmICghdGVtcGxhdGUpIHtcblx0XHRyZXR1cm4gRlJBTUVXT1JLLndhcm4oXG5cdFx0XHRjb21wb25lbnREZWYuaWQgKyAnIDo6IE5vIHRlbXBsYXRlIGZvdW5kIGZvciBjb21wb25lbnQhJyArXG5cdFx0XHQnXFxuVGVtcGxhdGVzIGRvblxcJ3QgbmVlZCBhIGNvbXBvbmVudCB1bmxlc3MgeW91IHdhbnQgaW50ZXJhY3Rpdml0eSwgJyArXG5cdFx0XHQnZXZlcnkgY29tcG9uZW50ICpzaG91bGQqIGhhdmUgYSBtYXRjaGluZyB0ZW1wbGF0ZSEhJyArXG5cdFx0XHQnXFxuVXNpbmcgY29tcG9uZW50cyB3aXRob3V0IHRlbXBsYXRlcyBtYXkgc2VlbSBuZWNlc3NhcnksICcgK1xuXHRcdFx0J2J1dCBpdFxcJ3Mgbm90LiAgSXQgbWFrZXMgeW91ciB2aWV3IGxvZ2ljIGluY29ycG9yZWFsLCBhbmQgbWFrZXMgeW91ciBjb2xsZWFndWVzICcgK1xuXHRcdFx0J3VuY29tZm9ydGFibGUuJyk7XG5cdH1cblxuXHQvLyBTYXZlIHJlZmVyZW5jZSB0byB0ZW1wbGF0ZSBpbiBjb21wb25lbnQgcHJvdG90eXBlXG5cdEZSQU1FV09SSy52ZXJib3NlKGNvbXBvbmVudERlZi5pZCArICcgOjogUGFpcmluZyBjb21wb25lbnQgd2l0aCB0ZW1wbGF0ZS4uLicpO1xuXHRjb21wb25lbnREZWYudGVtcGxhdGUgPSB0ZW1wbGF0ZTtcblxuXHQvLyBUcmFuc2xhdGUgcmlnaHQtaGFuZCBzaG9ydGhhbmQgZm9yIHRvcC1sZXZlbCBrZXlzXG5cdGNvbXBvbmVudERlZiA9IFV0aWxzLm9iak1hcChjb21wb25lbnREZWYsIHRyYW5zbGF0ZVNob3J0aGFuZCk7XG5cblxuXHQvLyBhbmQgZXZlbnRzIG9iamVjdFxuXHRpZiAoY29tcG9uZW50RGVmLmV2ZW50cykge1xuXHRcdGNvbXBvbmVudERlZi5ldmVudHMgPSBVdGlscy5vYmpNYXAoXG5cdFx0XHRjb21wb25lbnREZWYuZXZlbnRzLFxuXHRcdFx0dHJhbnNsYXRlU2hvcnRoYW5kXG5cdFx0KTtcblx0fVxuXG5cdC8vIGFuZCBhZnRlckNoYW5nZSBiaW5kaW5nc1xuXHRpZiAoXy5pc09iamVjdChjb21wb25lbnREZWYuYWZ0ZXJDaGFuZ2UpICYmICFfLmlzRnVuY3Rpb24oY29tcG9uZW50RGVmLmFmdGVyQ2hhbmdlKSkge1xuXHRcdGNvbXBvbmVudERlZi5hZnRlckNoYW5nZSA9IFV0aWxzLm9iak1hcChcblx0XHRcdGNvbXBvbmVudERlZi5hZnRlckNoYW5nZSxcblx0XHRcdHRyYW5zbGF0ZVNob3J0aGFuZFxuXHRcdCk7XG5cdH1cblxuXHQvLyBHbyBhaGVhZCBhbmQgdHVybiB0aGUgZGVmaW5pdGlvbiBpbnRvIGEgcmVhbCBjb21wb25lbnQgcHJvdG90eXBlXG5cdEZSQU1FV09SSy52ZXJib3NlKGNvbXBvbmVudERlZi5pZCArICcgOjogQnVpbGRpbmcgY29tcG9uZW50IHByb3RvdHlwZS4uLicpO1xuXHR2YXIgY29tcG9uZW50UHJvdG90eXBlID0gRlJBTUVXT1JLLkNvbXBvbmVudC5leHRlbmQoY29tcG9uZW50RGVmKTtcblxuXHQvLyBEaXNjb3ZlciBzdWJzY3JpcHRpb25zXG5cdGNvbXBvbmVudFByb3RvdHlwZS5wcm90b3R5cGUuc3Vic2NyaXB0aW9ucyA9IHt9O1xuXG5cdC8vIEl0ZXJhdGUgdGhyb3VnaCBlYWNoIHByb3BlcnR5IG9uIHRoaXMgY29tcG9uZW50IHByb3RvdHlwZVxuXHRfLmVhY2goY29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZSwgZnVuY3Rpb24gKGhhbmRsZXIsIGtleSkge1xuXG5cdFx0Ly8gRGV0ZWN0IERPTSBldmVudHMgYW5kIHNtYXNoIHRoZW0gaW50byB0aGUgZXZlbnRzIGhhc2hcblx0XHR2YXIgbWF0Y2hlZERPTUV2ZW50cyA9IGtleS5tYXRjaChFdmVudHNbJy9ET01FdmVudC8nXSk7XG5cdFx0aWYgKG1hdGNoZWRET01FdmVudHMpIHtcblx0XHRcdHZhciBldmVudE5hbWUgPSBtYXRjaGVkRE9NRXZlbnRzWzFdO1xuXHRcdFx0dmFyIGRlbGVnYXRlU2VsZWN0b3IgPSBtYXRjaGVkRE9NRXZlbnRzWzNdO1xuXG5cdFx0XHQvLyBTdG93IHRoZW0gaW4gZXZlbnRzIGhhc2hcblx0XHRcdGNvbXBvbmVudFByb3RvdHlwZS5wcm90b3R5cGUuZXZlbnRzID0gY29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZS5ldmVudHMgfHwge307XG5cdFx0XHRjb21wb25lbnRQcm90b3R5cGUucHJvdG90eXBlLmV2ZW50c1trZXldID0gaGFuZGxlcjtcblx0XHR9XG5cblx0XHQvLyBBZGQgYXBwIGV2ZW50cyAoJSksIHJvdXRlcyAoIyksIGFuZCBkYXRhIGxpc3RlbmVycyAofikgdG8gc3Vic2NyaXB0aW9ucyBoYXNoXG5cdFx0aWYgKGtleS5tYXRjaCgvXiglfCN8fikvKSkge1xuXHRcdFx0aWYgKF8uaXNTdHJpbmcoaGFuZGxlcikpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGNvbXBvbmVudERlZi5pZCArICc6OiBJbnZhbGlkIGxpc3RlbmVyIGZvciBzdWJzY3JpcHRpb246ICcgKyBrZXkgKyAnLlxcbicgK1xuXHRcdFx0XHRcdCdEZWZpbmUgeW91ciBjYWxsYmFjayB3aXRoIGFuIGFub255bW91cyBmdW5jdGlvbiBpbnN0ZWFkIG9mIGEgc3RyaW5nLidcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHRcdGlmICghXy5pc0Z1bmN0aW9uKGhhbmRsZXIpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihjb21wb25lbnREZWYuaWQgKyc6OiBJbnZhbGlkIGxpc3RlbmVyIGZvciBzdWJzY3JpcHRpb246ICcgKyBrZXkpO1xuXHRcdFx0fVxuXHRcdFx0Y29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZS5zdWJzY3JpcHRpb25zW2tleV0gPSBoYW5kbGVyO1xuXHRcdH1cblxuXHRcdC8vIEV4dGVuZCBvbmUgb3IgbW9yZSBvdGhlciBjb21wb25lbnRzXG5cdFx0ZWxzZSBpZiAoa2V5ID09PSAnZXh0ZW5kQ29tcG9uZW50cycpIHtcblx0XHRcdHZhciBvYmpUb01lcmdlID0ge307XG5cdFx0XHRfLmVhY2goaGFuZGxlciwgZnVuY3Rpb24oY2hpbGRJZCl7XG5cblx0XHRcdFx0aWYgKCFGUkFNRVdPUksuY29tcG9uZW50c1tjaGlsZElkXSl7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKFxuXHRcdFx0XHRcdGNvbXBvbmVudERlZi5pZCArICcgOjogJyArXG5cdFx0XHRcdFx0J1RyeWluZyB0byBkZWZpbmUvZXh0ZW5kIHRoaXMgY29tcG9uZW50IGZyb20gYCcgKyBjaGlsZElkICsgJ2AsICcgK1xuXHRcdFx0XHRcdCdidXQgbm8gY29tcG9uZW50IHdpdGggdGhhdCBpZCBjYW4gYmUgZm91bmQuJ1xuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRfLmV4dGVuZChvYmpUb01lcmdlLCBGUkFNRVdPUksuY29tcG9uZW50c1tjaGlsZElkXSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Xy5kZWZhdWx0cyhjb21wb25lbnRQcm90b3R5cGUucHJvdG90eXBlLCBvYmpUb01lcmdlKTtcblx0XHR9XG5cdH0pO1xuXG5cdC8vIFNhdmUgcHJvdG90eXBlIGluIGdsb2JhbCBzZXQgZm9yIHRyYWNraW5nXG5cdEZSQU1FV09SSy5jb21wb25lbnRzW2NvbXBvbmVudERlZi5pZF0gPSBjb21wb25lbnRQcm90b3R5cGU7XG59O1xuIiwiLyoqXG4gKiBDb2xsZWN0IGFueSByZWdpb25zIHdpdGggdGhlIGRlZmF1bHQgY29tcG9uZW50IHNldCBmcm9tIHRoZSBET00uXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjb2xsZWN0UmVnaW9ucyAoKSB7XG5cblx0Ly8gUHJvdmlkZSBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eSBmb3IgbGVnYWN5IG5vdGF0aW9uXG5cdCQoJ3JlZ2lvbltkZWZhdWx0XSxyZWdpb25bdGVtcGxhdGVdLFtkYXRhLXJlZ2lvbl1bZGVmYXVsdF0sW2RhdGEtcmVnaW9uXVt0ZW1wbGF0ZV0nKS5lYWNoKGZ1bmN0aW9uKCkge1xuXHRcdCRlID0gJCh0aGlzKTtcblx0XHR2YXIgY29tcG9uZW50SWQgPSAkZS5hdHRyKCdkZWZhdWx0JykgfHwgJGUuYXR0cigndGVtcGxhdGUnKTtcblx0XHQkZS5hdHRyKCdjb250ZW50cycsIGNvbXBvbmVudElkKTtcblx0fSk7XG5cblx0Ly8gTm93IGluc3RhbnRpYXRlIHRoZSBhcHByb3ByaWF0ZSBkZWZhdWx0IGNvbXBvbmVudCBpbiBlYWNoXG5cdC8vIHJlZ2lvbiB3aXRoIGEgc3BlY2lmaWVkIHRlbXBsYXRlL2NvbXBvbmVudFxuXHQkKCdyZWdpb25bY29udGVudHNdLFtkYXRhLXJlZ2lvbl1bY29udGVudHNdJykuZWFjaChmdW5jdGlvbigpIHtcblx0XHRGUkFNRVdPUksuUmVnaW9uLmZyb21FbGVtZW50KHRoaXMpO1xuXHR9KTtcbn1cbiIsIi8qKlxuICogTG9hZCBhbnkgc2NyaXB0IHRhZ3Mgb24gdGhlIHBhZ2Ugd2l0aCB0eXBlPVwidGV4dC90ZW1wbGF0ZVwiLlxuICpcbiAqIEByZXR1cm4ge09iamVjdH0gW09iamVjdCBjb25zaXN0aW5nIG9mIGEgdGVtcGxhdGUgaWRlbnRpZmllciBhbmQgaXRzIEhUTUwuXVxuICovXG5cbnZhciBVdGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzL3V0aWxzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY29sbGVjdFRlbXBsYXRlcygpIHtcblx0dmFyIHRlbXBsYXRlcyA9IHt9O1xuXG5cdCQoJ3NjcmlwdFt0eXBlPVwidGV4dC90ZW1wbGF0ZVwiXScpLmVhY2goZnVuY3Rpb24gKGksIGVsKSB7XG5cdFx0dmFyIGlkID0gVXRpbHMuZWwyaWQoZWwsIHRydWUpO1xuXHRcdHRlbXBsYXRlc1tpZF0gPSAkKGVsKS5odG1sKCk7XG5cblx0XHQvLyBTdHJpcCB3aGl0ZXNwYWNlIGxlZnRvdmVyIGZyb20gc2NyaXB0IHRhZ3Ncblx0XHR0ZW1wbGF0ZXNbaWRdID0gdGVtcGxhdGVzW2lkXS5yZXBsYWNlKC9eXFxzKy8sJycpO1xuXHRcdHRlbXBsYXRlc1tpZF0gPSB0ZW1wbGF0ZXNbaWRdLnJlcGxhY2UoL1xccyskLywnJyk7XG5cblx0XHQvLyBSZW1vdmUgZnJvbSBET01cblx0XHQkKGVsKS5yZW1vdmUoKTtcblx0fSk7XG5cblx0cmV0dXJuIHRlbXBsYXRlcztcbn07XG4iLCIvKipcbiAqIFRoaXMgaXMgdGhlIHN0YXJ0aW5nIHBvaW50IHRvIHlvdXIgYXBwbGljYXRpb24uICBZb3Ugc2hvdWxkIGdyYWIgdGVtcGxhdGVzIGFuZCBjb21wb25lbnRzXG4gKiBiZWZvcmUgY2FsbGluZyBGUkFNRVdPUksucmFpc2UoKSB1c2luZyBzb21ldGhpbmcgbGlrZSBSZXF1aXJlLmpzLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG5cdFx0ZGF0YTogeyBhdXRoZW50aWNhdGVkOiBmYWxzZSB9LFxuXHRcdHRlbXBsYXRlczogeyBjb21wb25lbnROYW1lOiBIVE1MT3JQcmVjb21waWxlZEZuIH0sXG5cdFx0Y29tcG9uZW50czogeyBjb21wb25lbnROYW1lOiBDb21wb25lbnREZWZpbml0aW9uIH1cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNiXG4gKi9cblxudmFyIExvZ2dlciA9IHJlcXVpcmUoJy4uL2xvZ2dlci9pbmRleCcpO1xudmFyIGJ1aWxkQ29tcG9uZW50RGVmaW5pdGlvbiA9IHJlcXVpcmUoJy4uL2RlZmluZS9idWlsZERlZmluaXRpb24nKTtcbnZhciBidWlsZENvbXBvbmVudFByb3RvdHlwZSA9IHJlcXVpcmUoJy4vYnVpbGRQcm90b3R5cGUnKTtcbnZhciBjb2xsZWN0VGVtcGxhdGVzID0gcmVxdWlyZSgnLi9jb2xsZWN0VGVtcGxhdGVzJyk7XG52YXIgY29sbGVjdFJlZ2lvbnMgPSByZXF1aXJlKCcuL2NvbGxlY3RSZWdpb25zJyk7XG52YXIgc2V0dXBSb3V0ZXIgPSByZXF1aXJlKCcuLi9yb3V0ZXIvaW5kZXgnKTtcblxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHJhaXNlKG9wdGlvbnMsIGNiKSB7XG5cblx0Ly8gSWYgb25seSBvbmUgYXJnIGlzIHByZXNlbnQsIHVzZSBvcHRpb25zIGFzIGNhbGxiYWNrIGlmIHBvc3NpYmxlLlxuXHQvLyBJZiBvcHRpb25zIGFyZSBub3QgZGVmaW5lZCwgdXNlIGFuIGVtcHR5IG9iamVjdC5cblx0aWYgKCFjYiAmJiBfLmlzRnVuY3Rpb24ob3B0aW9ucykpIHtcblx0XHRjYiA9IG9wdGlvbnM7XG5cdH1cblx0aWYgKCFfLmlzUGxhaW5PYmplY3Qob3B0aW9ucykpIHtcblx0XHRvcHRpb25zID0ge307XG5cdH1cblxuXHQvLyBJbnRlcnByZXQgYHByb2R1Y3Rpb25gIGFzIGBsb2dMZXZlbCA9PT0gJ3NpbGVudCdgXG5cdGlmIChGUkFNRVdPUksub3B0aW9ucy5wcm9kdWN0aW9uKSB7XG5cdFx0RlJBTUVXT1JLLm9wdGlvbnMubG9nTGV2ZWwgPSAnc2lsZW50Jztcblx0fVxuXG5cdC8vIEluaXRpYWxpemUgbG9nZ2VyXG5cdG5ldyBMb2dnZXIoKTtcblxuXHQvLyBNZXJnZSBkYXRhIGludG8gRlJBTUVXT1JLLmRhdGFcblx0Xy5leHRlbmQoRlJBTUVXT1JLLmRhdGEsIG9wdGlvbnMuZGF0YSB8fCB7fSk7XG5cblx0Ly8gTWVyZ2Ugc3BlY2lmaWVkIHRlbXBsYXRlcyB3aXRoIEZSQU1FV09SSy50ZW1wbGF0ZXNcblx0Xy5leHRlbmQoRlJBTUVXT1JLLnRlbXBsYXRlcywgb3B0aW9ucy50ZW1wbGF0ZXMgfHwge30pO1xuXG5cdC8vIElmIEZSQU1FV09SSy5kZWZpbmUoKSB3YXMgdXNlZCwgYnVpbGQgdGhlIGxpc3Qgb2YgY29tcG9uZW50c1xuXHQvLyBJdGVyYXRlIHRocm91Z2ggdGhlIGRlZmluZSBxdWV1ZSBhbmQgY3JlYXRlIGVhY2ggZGVmaW5pdGlvblxuXHRfLmVhY2goRlJBTUVXT1JLLl9kZWZpbmVRdWV1ZSwgYnVpbGRDb21wb25lbnREZWZpbml0aW9uKTtcblxuXHQvLyBNZXJnZSBzcGVjaWZpZWQgY29tcG9uZW50cyB3LyBGUkFNRVdPUksuY29tcG9uZW50c1xuXHRfLmV4dGVuZChGUkFNRVdPUksuY29tcG9uZW50cywgb3B0aW9ucy5jb21wb25lbnRzIHx8IHt9KTtcblxuXHQvLyBCYWNrIHVwIGVhY2ggY29tcG9uZW50IGRlZmluaXRpb24gYmVmb3JlIHRyYW5zZm9ybWluZyBpdCBpbnRvIGEgbGl2ZSBwcm90b3R5cGVcblx0RlJBTUVXT1JLLmNvbXBvbmVudERlZnMgPSBfLmNsb25lKEZSQU1FV09SSy5jb21wb25lbnRzKTtcblxuXHQvLyBSdW4gdGhpcyBjYWxsIGJhY2sgd2hlbiB0aGUgRE9NIGlzIHJlYWR5XG5cdCQoZnVuY3Rpb24gKCkge1xuXG5cdFx0Ly8gQ29sbGVjdCBhbnkgPHNjcmlwdD4gdGFnIHRlbXBsYXRlcyBvbiB0aGUgcGFnZVxuXHRcdC8vIGFuZCBhYnNvcmIgdGhlbSBpbnRvIEZSQU1FV09SSy50ZW1wbGF0ZXNcblx0XHRfLmV4dGVuZChGUkFNRVdPUksudGVtcGxhdGVzLCBjb2xsZWN0VGVtcGxhdGVzKCkpO1xuXG5cdFx0Ly8gQnVpbGQgYWN0dWFsIHByb3RvdHlwZXMgZm9yIHRoZSBjb21wb25lbnRzXG5cdFx0Ly8gKG5lZWQgdGhlIHRlbXBsYXRlcyBhdCB0aGlzIHBvaW50IHRvIG1ha2UgdGhpcyB3b3JrKVxuXHRcdF8uZWFjaChGUkFNRVdPUksuY29tcG9uZW50cywgYnVpbGRDb21wb25lbnRQcm90b3R5cGUpO1xuXG5cdFx0Ly8gR3JhYiBpbml0aWFsIHJlZ2lvbnMgZnJvbSBET01cblx0XHRjb2xsZWN0UmVnaW9ucygpO1xuXG5cdFx0Ly8gQmluZCBnbG9iYWwgRE9NIGV2ZW50cyBhcyBGUkFNRVdPUksgZXZlbnRzXG5cdFx0Ly8gKGUuZy4gJXdpbmRvdzpyZXNpemUpXG5cdFx0dmFyIHRyaWdnZXJSZXNpemVFdmVudCA9IF8uZGVib3VuY2UoZnVuY3Rpb24gKCkge1xuXHRcdFx0RlJBTUVXT1JLLnRyaWdnZXIoJyV3aW5kb3c6cmVzaXplJyk7XG5cdFx0fSwgRlJBTUVXT1JLLm9wdGlvbnMudGhyb3R0bGVXaW5kb3dSZXNpemUgfHwgMCk7XG5cdFx0JCh3aW5kb3cpLnJlc2l6ZSh0cmlnZ2VyUmVzaXplRXZlbnQpO1xuXHRcdC8vIFRPRE86IGFkZCBtb3JlIGV2ZW50cyBhbmQgZXh0cmFwb2xhdGUgdGhpcyBsb2dpYyB0byBhIHNlcGFyYXRlIG1vZHVsZVxuXG5cdFx0Ly8gRG8gdGhlIGluaXRpYWwgcm91dGluZyBzZXF1ZW5jZVxuXHRcdC8vIExvb2sgYXQgdGhlICNmcmFnbWVudCB1cmwgYW5kIGZpcmUgdGhlIGdsb2JhbCByb3V0ZSBldmVudFxuXHRcdHNldHVwUm91dGVyKCk7XG5cdFx0RlJBTUVXT1JLLmhpc3Rvcnkuc3RhcnQoXy5kZWZhdWx0cyh7XG5cdFx0XHRwdXNoU3RhdGU6IHVuZGVmaW5lZCxcblx0XHRcdGhhc2hDaGFuZ2U6IHVuZGVmaW5lZCxcblx0XHRcdHJvb3Q6IHVuZGVmaW5lZFxuXHRcdH0sIG9wdGlvbnMpKTtcblxuXHRcdGlmIChjYikgY2IoKTtcblx0fSk7XG59O1xuIiwiLyoqXG4gKiBBcHBlbmQgYSBjb21wb25lbnQgdG8gdGhlIGVuZCBvZiBhIHJlZ2lvbi4gVGhpcyBjYWxscyBpbnNlcnQgYXQgdGhlIGxhc3QgcG9zaXRpb24uXG4gKlxuICogQHBhcmFtICB7U3RyaW5nfSBjb21wb25lbnRJZCBbVGhlIGNvbXBvbmVudCBpZCB0aGF0IHdlIHdhbnQgdG8gYXBwZW5kXVxuICogQHBhcmFtICB7T2JqZWN0fSBwcm9wZXJ0aWVzICBbUHJvcGVydGllcyB0byBpbnN0YW50aWF0ZSB0aGUgY29tcG9uZW50IHdpdGhdXG4gKlxuICogQHJldHVybiB7Q29tcG9uZW50fSAgICAgICAgICBbTmV3bHkgYXBwZW5kZWQgQ29tcG9uZW50XVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGFwcGVuZChjb21wb25lbnRJZCwgcHJvcGVydGllcykge1xuXHQvLyBJbnNlcnQgYXQgbGFzdCBwb3NpdGlvblxuXHRyZXR1cm4gdGhpcy5pbnNlcnQodGhpcy5fY2hpbGRyZW4ubGVuZ3RoLCBjb21wb25lbnRJZCwgcHJvcGVydGllcyk7XG59O1xuIiwiLyoqXG4gKiBTaG9ydGN1dCBmb3IgY2FsbGluZyBlbXB0eSgpIGFuZCB0aGVuIGFwcGVuZCgpLFxuICogVGhpcyBpcyB0aGUgZ2VuZXJhbCB1c2UgY2FzZSBmb3IgbWFuYWdpbmcgc3ViY29tcG9uZW50c1xuICogKGUuZy4gd2hlbiBhIG5hdmJhciBpdGVtIGlzIHRvdWNoZWQpXG4gKlxuICogQHBhcmFtICB7U3RyaW5nfSBjb21wb25lbnQgIFtUaGUgaWQgbmFtZSBvZiB0aGUgY29tcG9uZXQgdGhhdCB5b3Ugd2FudCB0byBhdHRhY2hdXG4gKiBAcGFyYW0gIHtPYmplY3R9IHByb3BlcnRpZXMgW1Byb3BlcnRpZXMgdGhhdCB0aGUgYXR0YWNoZWQgY29tcG9uZW50IHdpbGwgYmUgaW5pdGFsaXplZCB3aXRoXVxuICpcbiAqIEByZXR1cm4ge0NvbXBvbmVudH0gXHRcdFx0XHQgW05ld2x5IGF0dGFjaGVkIGNvbXBvbmVudF1cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBhdHRhY2goY29tcG9uZW50LCBwcm9wZXJ0aWVzKSB7XG5cdHRoaXMuZW1wdHkoKTtcblx0cmV0dXJuIHRoaXMuYXBwZW5kKGNvbXBvbmVudCwgcHJvcGVydGllcyk7XG59O1xuIiwiLyoqXG4gKiByZWdpb24uZW1wdHkoIClcbiAqXG4gKiBJdGVyYXRlIG92ZXIgZWFjaCBjb21wb25lbnQgaW4gdGhpcyByZWdpb24gYW5kIGNhbGwgLmNsb3NlKCkgb24gaXRcbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBlbXB0eSgpIHtcblx0RlJBTUVXT1JLLmRlYnVnKHRoaXMucGFyZW50LmlkICsgJyA6OiBFbXB0eWluZyByZWdpb246ICcgKyB0aGlzLmlkKTtcblx0d2hpbGUgKHRoaXMuX2NoaWxkcmVuLmxlbmd0aCA+IDApIHtcblx0XHR0aGlzLnJlbW92ZSgwKTtcblx0fVxufTtcbiIsIi8qKlxuICogRmFjdG9yeSBtZXRob2QgdG8gZ2VuZXJhdGUgYSBuZXcgcmVnaW9uIGluc3RhbmNlIGZyb20gYSBET00gZWxlbWVudFxuICogSW1wbGVtZW50cyBgdGVtcGxhdGVgLCBgY291bnRgLCBhbmQgYGRhdGEtKmAgSFRNTCBhdHRyaWJ1dGVzLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gKiBAcmV0dXJucyByZWdpb24gaW5zdGFuY2VcbiAqL1xuXG52YXIgVXRpbHMgPSByZXF1aXJlKCcuLi91dGlscy91dGlscycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZyb21FbGVtZW50KGVsLCBwYXJlbnQpIHtcblxuXHQvLyBJZiBwYXJlbnQgaXMgbm90IHNwZWNpZmllZCwgbWFrZS1iZWxpZXZlLlxuXHRwYXJlbnQgPSBwYXJlbnQgfHwgeyBpZDogJyonIH07XG5cblx0Ly8gQnVpbGQgcmVnaW9uXG5cdHZhciByZWdpb24gPSBuZXcgRlJBTUVXT1JLLlJlZ2lvbih7XG5cdFx0aWQ6IFV0aWxzLmVsMmlkKGVsKSxcblx0XHQkZWw6ICQoZWwpLFxuXHRcdHBhcmVudDogcGFyZW50XG5cdH0pO1xuXG5cdC8vIElmIHRoaXMgcmVnaW9uIGhhcyBhIGRlZmF1bHQgY29tcG9uZW50L3RlbXBsYXRlIHNldCxcblx0Ly8gZ3JhYiB0aGUgaWQgIC0tICBlLmcuIDxyZWdpb24gY29udGVudHM9XCJGb29cIiAvPlxuXHR2YXIgY29tcG9uZW50SWQgPSAkKGVsKS5hdHRyKCdjb250ZW50cycpO1xuXG5cblx0LyoqKioqKioqKioqKioqKioqKioqKioqKioqXG5cdCAqIFRlbXBsYXRlIGltcGxlbWVudGF0aW9uXG5cdCAqKioqKioqKioqKioqKioqKioqKioqKioqKi9cblxuXHQvLyBBcHBlbmQgc3ViLWNvbXBvbmVudChzKSB0byByZWdpb24gYXV0b21hdGljYWxseVxuXHRpZiAoIEZSQU1FV09SSy5vcHRpb25zLnNob3J0Y3V0LnRlbXBsYXRlICYmIGNvbXBvbmVudElkICkge1xuXG5cdFx0cmVnaW9uLmFwcGVuZChjb21wb25lbnRJZCk7XG5cblxuXHRcdC8qKioqKioqKioqKioqKioqKioqKioqKlxuXHRcdCAqIENvdW50IGltcGxlbWVudGF0aW9uXG5cdFx0ICoqKioqKioqKioqKioqKioqKioqKioqL1xuXG5cdFx0aWYgKEZSQU1FV09SSy5vcHRpb25zLnNob3J0Y3V0LmNvdW50KSB7XG5cdFx0XHQvLyBJZiBgY291bnRgIGlzIHNldCwgcmVuZGVyIHN1Yi1jb21wb25lbnQgc3BlY2lmaWVkIG51bWJlciBvZiB0aW1lcy5cblx0XHRcdC8vIGUuZy4gPHJlZ2lvbiB0ZW1wbGF0ZT1cIkZvb1wiIGNvdW50PVwiM1wiIC8+XG5cdFx0XHR2YXIgY291bnQgPSAkKGVsKS5hdHRyKCdjb3VudCcpO1xuXG5cdFx0XHRpZiAoY291bnQpIHtcblxuXHRcdFx0XHQvLyBSZW1vdmUgb25lIGZyb20gY291bnQgYmVjYXVzZSBzaG9ydGN1dC50ZW1wbGF0ZSBhcHBlbmRzIG9uZS5cblx0XHRcdFx0Y291bnQgLT0gMTtcblx0XHRcdFx0Zm9yICh2YXIgaT0wOyBpIDwgY291bnQ7IGkrKyApIHtcblx0XHRcdFx0XHRyZWdpb24uYXBwZW5kKGNvbXBvbmVudElkKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdEZSQU1FV09SSy5kZWJ1Zyhcblx0XHRcdFx0XHRwYXJlbnQuaWQgKyAnIDotOiBJbnN0YW50aWF0ZWTCoG5ldyByZWdpb24nICtcblx0XHRcdFx0XHQoIHJlZ2lvbi5pZCA/ICcgYCcgKyByZWdpb24uaWQgKyAnYCcgOiAnJyApICtcblx0XHRcdFx0XHQoIGNvbXBvbmVudElkID8gJyBhbmQgcG9wdWxhdGVkIGl0IHdpdGgnICtcblx0XHRcdFx0XHRcdCggY291bnQgPiAxID8gY291bnQgKyAnIGluc3RhbmNlcyBvZicgOiAnIDEnICkgK1xuXHRcdFx0XHRcdFx0JyBgJyArIGNvbXBvbmVudElkICsgJ2AnIDogJydcblx0XHRcdFx0XHQpICsgJy4nXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHJlZ2lvbjtcbn07XG4iLCIvKipcbiAqIFJlZ2lvbnNcbiAqL1xuXG52YXIgaW5zZXJ0ID0gcmVxdWlyZSgnLi9pbnNlcnQnKSxcblx0XHRyZW1vdmUgPSByZXF1aXJlKCcuL3JlbW92ZScpLFxuXHRcdGVtcHR5ID0gcmVxdWlyZSgnLi9lbXB0eScpLFxuXHRcdGFwcGVuZCA9IHJlcXVpcmUoJy4vYXBwZW5kJyksXG5cdFx0YXR0YWNoID0gcmVxdWlyZSgnLi9hdHRhY2gnKSxcblx0XHRwcmVwZW5kID0gcmVxdWlyZSgnLi9wcmVwZW5kJyksXG5cdFx0ZnJvbUVsZW1lbnQgPSByZXF1aXJlKCcuL2Zyb21FbGVtZW50Jyk7XG5cblJlZ2lvbiA9IG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcmVnaW9uKHByb3BlcnRpZXMpIHtcblxuXHRfLmV4dGVuZCh0aGlzLCBGUkFNRVdPUksuRXZlbnRzKTtcblxuXHRpZiAoIXByb3BlcnRpZXMpIHtcblx0XHRwcm9wZXJ0aWVzID0ge307XG5cdH1cblx0aWYgKCFwcm9wZXJ0aWVzLiRlbCkge1xuXHRcdHRocm93IG5ldyBFcnJvcignVHJ5aW5nIHRvIGluc3RhbnRpYXRlIHJlZ2lvbiB3aXRoIG5vICRlbCEnKTtcblx0fVxuXG5cdC8vIEZvbGQgaW4gcHJvcGVydGllcyB0byBwcm90b3R5cGVcblx0Xy5leHRlbmQodGhpcywgcHJvcGVydGllcyk7XG5cblx0Ly8gSWYgbmVpdGhlciBhbiBpZCBub3IgYSBgdGVtcGxhdGVgIHdhcyBzcGVjaWZpZWQsXG5cdC8vIHdlJ2xsIHRocm93IGFuIGVycm9yLCBzaW5jZSB0aGVyZSdzIG5vIHdheSB0byBnZXQgYSBob2xkIG9mIHRoZSByZWdpb25cblx0aWYgKCF0aGlzLmlkICYmICEodGhpcy4kZWwuYXR0cignZGVmYXVsdCcpIHx8IHRoaXMuJGVsLmF0dHIoJ3RlbXBsYXRlJykgfHxcblx0XHR0aGlzLiRlbC5hdHRyKCdjb250ZW50cycpKSkge1xuXG5cdFx0dGhyb3cgbmV3IEVycm9yKFxuXHRcdFx0dGhpcy5wYXJlbnQuaWQgKyAnIDo6IEVpdGhlciBgZGF0YS1pZGAsIGBjb250ZW50c2AsIG9yIGJvdGggJyArXG5cdFx0XHQnbXVzdCBiZSBzcGVjaWZpZWQgb24gcmVnaW9ucy4gXFxuJyArXG5cdFx0XHQnZS5nLiA8cmVnaW9uIGRhdGEtaWQ9XCJmb29cIiB0ZW1wbGF0ZT1cIlNvbWVDb21wb25lbnRcIj48L3JlZ2lvbj4nXG5cdFx0KTtcblx0fVxuXG5cdC8vIFNldCB1cCBsaXN0IHRvIGhvdXNlIGNoaWxkIGNvbXBvbmVudHNcblx0dGhpcy5fY2hpbGRyZW4gPSBbXTtcblxuXHRfLmJpbmRBbGwodGhpcyk7XG5cblx0Ly8gU2V0IHVwIGNvbnZlbmllbmNlIGFjY2VzcyB0byB0aGlzIHJlZ2lvbiBpbiB0aGUgZ2xvYmFsIHJlZ2lvbiBjYWNoZVxuXHRGUkFNRVdPUksucmVnaW9uc1t0aGlzLmlkXSA9IHRoaXM7XG59O1xuXG5SZWdpb24uZnJvbUVsZW1lbnQgPSBmdW5jdGlvbihlbCwgcGFyZW50KSB7XG5cdHJldHVybiBmcm9tRWxlbWVudChlbCwgcGFyZW50KTtcbn07XG5SZWdpb24ucHJvdG90eXBlLnJlbW92ZSA9IGZ1bmN0aW9uKGF0SW5kZXgpIHtcblx0cmV0dXJuIHJlbW92ZS5jYWxsKHRoaXMsIGF0SW5kZXgpO1xufTtcblJlZ2lvbi5wcm90b3R5cGUuZW1wdHkgPSBmdW5jdGlvbigpIHtcblx0cmV0dXJuIGVtcHR5LmNhbGwodGhpcyk7XG59O1xuUmVnaW9uLnByb3RvdHlwZS5pbnNlcnQgPSBmdW5jdGlvbihhdEluZGV4LCBjb21wb25lbnRJZCwgcHJvcGVydGllcykge1xuXHRyZXR1cm4gaW5zZXJ0LmNhbGwodGhpcywgYXRJbmRleCwgY29tcG9uZW50SWQsIHByb3BlcnRpZXMpO1xufTtcblJlZ2lvbi5wcm90b3R5cGUuYXBwZW5kID0gZnVuY3Rpb24oY29tcG9uZW50SWQsIHByb3BlcnRpZXMpIHtcblx0cmV0dXJuIGFwcGVuZC5jYWxsKHRoaXMsIGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKTtcbn07XG5SZWdpb24ucHJvdG90eXBlLmF0dGFjaCA9IGZ1bmN0aW9uKGNvbXBvbmVudCwgcHJvcGVydGllcykge1xuXHRyZXR1cm4gYXR0YWNoLmNhbGwodGhpcywgY29tcG9uZW50LCBwcm9wZXJ0aWVzKTtcbn07XG5SZWdpb24ucHJvdG90eXBlLnByZXBlbmQgPSBmdW5jdGlvbihjb21wb25lbnRJZCwgcHJvcGVydGllcykge1xuXHRyZXR1cm4gcHJlcGVuZC5jYWxsKHRoaXMsIGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKTtcbn07XG4iLCIvKipcbiAqIHJlZ2lvbi5pbnNlcnQoIGF0SW5kZXgsIGNvbXBvbmVudElkLCBbcHJvcGVydGllc10gKVxuICpcbiAqIFRPRE86IHN1cHBvcnQgYSBsaXN0IG9mIHByb3BlcnRpZXMgb2JqZWN0cyBpbiBsaWV1IG9mIHRoZSBwcm9wZXJ0aWVzIG9iamVjdFxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaW5zZXJ0KGF0SW5kZXgsIGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKSB7XG5cblx0dmFyIGVyciA9ICcnO1xuXHRpZiAoIShhdEluZGV4IHx8IF8uaXNGaW5pdGUoYXRJbmRleCkpKSB7XG5cdFx0ZXJyICs9IHRoaXMuaWQgKyAnLmluc2VydCgpIDo6IE5vIGF0SW5kZXggc3BlY2lmaWVkISc7XG5cdH1cblx0ZWxzZSBpZiAoIWNvbXBvbmVudElkKSB7XG5cdFx0ZXJyICs9IHRoaXMuaWQgKyAnLmluc2VydCgpIDo6IE5vIGNvbXBvbmVudElkIHNwZWNpZmllZCEnO1xuXHR9XG5cdGlmIChlcnIpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoZXJyICsgJ1xcblVzYWdlOiBhcHBlbmQoYXRJbmRleCwgY29tcG9uZW50SWQsIFtwcm9wZXJ0aWVzXSknKTtcblx0fVxuXG5cdHZhciBjb21wb25lbnQ7XG5cdC8vIElmIGNvbXBvbmVudElkIGlzIGEgc3RyaW5nLCBsb29rIHVwIGNvbXBvbmVudCBwcm90b3R5cGUgYW5kIGluc3RhdGlhdGVcblx0aWYgKCdzdHJpbmcnID09IHR5cGVvZiBjb21wb25lbnRJZCkge1xuXG5cdFx0dmFyIGNvbXBvbmVudFByb3RvdHlwZSA9IEZSQU1FV09SSy5jb21wb25lbnRzW2NvbXBvbmVudElkXTtcblxuXHRcdGlmICghY29tcG9uZW50UHJvdG90eXBlKSB7XG5cdFx0XHR2YXIgdGVtcGxhdGUgPSBGUkFNRVdPUksudGVtcGxhdGVzW2NvbXBvbmVudElkXTtcblx0XHRcdGlmICghdGVtcGxhdGUpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yICgnSW4gJyArXG5cdFx0XHRcdFx0KHRoaXMuaWQgfHwgJ0Fub255bW91cyByZWdpb24nKSArICc6OiBUcnlpbmcgdG8gYXR0YWNoICcgK1xuXHRcdFx0XHRcdGNvbXBvbmVudElkICsgJywgYnV0IG5vIGNvbXBvbmVudCBvciB0ZW1wbGF0ZSBleGlzdHMgd2l0aCB0aGF0IGlkLicpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZiBubyBjb21wb25lbnQgcHJvdG90eXBlIHdpdGggdGhpcyBpZCBleGlzdHMsXG5cdFx0XHQvLyBjcmVhdGUgYW4gYW5vbnltb3VzIG9uZSB0byB1c2Vcblx0XHRcdGNvbXBvbmVudFByb3RvdHlwZSA9IEZSQU1FV09SSy5Db21wb25lbnQuZXh0ZW5kKHtcblx0XHRcdFx0aWQ6IGNvbXBvbmVudElkLFxuXHRcdFx0XHR0ZW1wbGF0ZTogdGVtcGxhdGVcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIEluc3RhbnRpYXRlIGFuZCByZW5kZXIgdGhlIGNvbXBvbmVudCBpbnNpZGUgdGhpcyByZWdpb25cblx0XHRjb21wb25lbnQgPSBuZXcgY29tcG9uZW50UHJvdG90eXBlKF8uZXh0ZW5kKHtcblx0XHRcdCRvdXRsZXQ6IHRoaXMuJGVsXG5cdFx0fSwgcHJvcGVydGllcyB8fCB7fSkpO1xuXG5cblx0fVxuXG5cdC8vIE90aGVyd2lzZSBhc3N1bWUgYW4gaW5zdGFudGlhdGVkIGNvbXBvbmVudCBvYmplY3Qgd2FzIHNlbnRcblx0LyogVE9ETzogQ2hlY2sgdGhhdCBjb21wb25lbnQgb2JqZWN0IGlzIHZhbGlkICovXG5cdGVsc2Uge1xuXHRcdGNvbXBvbmVudCA9IGNvbXBvbmVudElkO1xuXHRcdGNvbXBvbmVudC4kb3V0bGV0ID0gdGhpcy4kZWw7XG5cdH1cblxuXHQvLyBTYXZlIHJlZmVyZW5jZSB0byBwYXJlbnRSZWdpb25cblx0Y29tcG9uZW50LnBhcmVudFJlZ2lvbiA9IHRoaXM7XG5cblx0Ly8gQ2hlY2sgdG8gc2VlIGlmIHRoZSBtb2RlbCB3YXMgYWxyZWFkeSBkZWZpbmVkLiBJZiBpdCBpcywgdXNlIHRoYXQgbW9kZWwuIElmIG5vdCwgYXNzaWduIGl0XG5cdC8vIHRoZSBwYXJlbnRzIG1vZGVsIGlmIGl0IGhhcyBvbmUsIG9yIGFzc2lnbiBpdCBhIG5ldyBiYWNrYm9uZSBpbnN0YW5jZS5cblx0aWYgKCFjb21wb25lbnQubW9kZWwpIHtcblx0XHRjb21wb25lbnQubW9kZWwgPSB0aGlzLnBhcmVudC5tb2RlbCA/IHRoaXMucGFyZW50Lm1vZGVsIDogbmV3IEJhY2tib25lLk1vZGVsKCk7XG5cdH1cblxuXHQvLyBSZW5kZXIgY29tcG9uZW50IGludG8gdGhpcyByZWdpb25cblx0Y29tcG9uZW50LnJlbmRlcihhdEluZGV4KTtcblxuXHQvLyBBbmQga2VlcCB0cmFjayBvZiBpdCBpbiB0aGUgbGlzdCBvZiB0aGlzIHJlZ2lvbidzIGNoaWxkcmVuXG5cdHRoaXMuX2NoaWxkcmVuLnNwbGljZShhdEluZGV4LCAwLCBjb21wb25lbnQpO1xuXG5cdC8vIExvZyBmb3IgZGVidWdnaW5nIGBjb3VudGAgZGVjbGFyYXRpdmVcblx0dmFyIGRlYnVnU3RyID0gdGhpcy5wYXJlbnQuaWQgKyAnIDo6IEluc2VydGVkICcgKyBjb21wb25lbnRJZCArICcgaW50byAnO1xuXHRpZiAodGhpcy5pZCkgZGVidWdTdHIgKz0gJ3JlZ2lvbjogJyArIHRoaXMuaWQgKyAnIGF0IGluZGV4ICcgKyBhdEluZGV4O1xuXHRlbHNlIGRlYnVnU3RyICs9ICdhbm9ueW1vdXMgcmVnaW9uIGF0IGluZGV4ICcgKyBhdEluZGV4O1xuXHRGUkFNRVdPUksudmVyYm9zZShkZWJ1Z1N0cik7XG5cblx0cmV0dXJuIGNvbXBvbmVudDtcblxufTtcbiIsIi8qKlxuICogUHJlcGVuZCBhIGNvbXBvbmVudCB0byB0aGUgYmVnaW5uaW5nIG9mIGEgcmVnaW9uLiBUaGlzIGNhbGxzIGluc2VydCBhdCB0aGUgZmlyc3QgcG9zaXRpb24uXG4gKlxuICogQHBhcmFtICB7U3RyaW5nfSBjb21wb25lbnRJZCBbVGhlIGNvbXBvbmVudCBpZCB0aGF0IHdlIHdhbnQgdG8gcHJlcGVuZCBdXG4gKiBAcGFyYW0gIHtPYmplY3R9IHByb3BlcnRpZXMgIFtQcm9wZXJ0aWVzIHRvIGluc3RhbnRpYXRlIHRoZSBjb21wb25lbnQgd2l0aF1cbiAqXG4gKiBAcmV0dXJuIHtDb21wb25lbnR9ICAgICAgICAgIFtOZXdseSBwcmVwZW5kZWQgQ29tcG9uZW50XVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHByZXBlbmQoY29tcG9uZW50SWQsIHByb3BlcnRpZXMpIHtcblx0Ly8gSW5zZXJ0IGF0IGxhc3QgcG9zaXRpb25cblx0cmV0dXJuIHRoaXMuaW5zZXJ0KDAsIGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKTtcbn07XG4iLCIvKipcbiAqIHJlZ2lvbi5yZW1vdmUoIGF0SW5kZXggKVxuICpcbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByZW1vdmUoYXRJbmRleCkge1xuXG5cdGlmICghYXRJbmRleCAmJiAhXy5pc0Zpbml0ZShhdEluZGV4KSkge1xuXHRcdHRocm93IG5ldyBFcnJvcih0aGlzLmlkICsgJy5yZW1vdmUoKSA6OiBObyBhdEluZGV4IHNwZWNpZmllZCEgXFxuVXNhZ2U6IHJlbW92ZShhdEluZGV4KScpO1xuXHR9XG5cblx0Ly8gUmVtb3ZlIHRoZSBjb21wb25lbnQgZnJvbSB0aGUgbGlzdFxuXHR2YXIgY29tcG9uZW50ID0gdGhpcy5fY2hpbGRyZW4uc3BsaWNlKGF0SW5kZXgsIDEpO1xuXHRpZiAoIWNvbXBvbmVudFswXSkge1xuXG5cdFx0Ly8gSWYgdGhlIGxpc3QgaXMgZW1wdHksIGZyZWFrIG91dFxuXHRcdHRocm93IG5ldyBFcnJvcih0aGlzLmlkICsgJy5yZW1vdmUoKSA6OiBUcnlpbmcgdG8gcmVtb3ZlIGEgY29tcG9uZW50IHRoYXQgZG9lc25cXCd0IGV4aXN0IGF0IGluZGV4ICcgKyBhdEluZGV4KTtcblx0fVxuXG5cdC8vIFNxdWVlemUgdGhlIGNvbXBvbmVudCB0byBkbyBnZXQgYWxsIHRoZSBiaW5keSBnb29kbmVzcyBvdXRcblx0Y29tcG9uZW50WzBdLmNsb3NlKCk7XG5cblx0RlJBTUVXT1JLLmRlYnVnKHRoaXMucGFyZW50LmlkICsgJyA6OiBSZW1vdmVkIGNvbXBvbmVudCBhdCBpbmRleCAnICsgYXRJbmRleCArICcgZnJvbSByZWdpb246ICcgKyB0aGlzLmlkKTtcbn07XG4iLCIvKipcbiAqIFNldHMgdXAgdGhlIEZSQU1FV09SSyByb3V0ZXIuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcm91dGVyU2V0dXAoKSB7XG5cblx0Ly8gV2lsZGNhcmQgcm91dGVzIHRvIGdsb2JhbCBldmVudCBkZWxlZ2F0b3Jcblx0dmFyIHJvdXRlciA9IG5ldyBGUkFNRVdPUksuUm91dGVyKCk7XG5cdHJvdXRlci5yb3V0ZSgvKC4qKS8sICdyb3V0ZScsIGZ1bmN0aW9uIChyb3V0ZSkge1xuXG5cdFx0Ly8gTm9ybWFsaXplIGhvbWUgcm91dGVzICgjIG9yIG51bGwpIHRvICcnXG5cdFx0aWYgKCFyb3V0ZSkge1xuXHRcdFx0cm91dGUgPSAnJztcblx0XHR9XG5cblx0XHQvLyBUcmlnZ2VyIHJvdXRlXG5cdFx0RlJBTUVXT1JLLnRyaWdnZXIoJyMnICsgcm91dGUpO1xuXHR9KTtcblxuXHQvLyBFeHBvc2UgYG5hdmlnYXRlKClgIG1ldGhvZFxuXHRGUkFNRVdPUksubmF2aWdhdGUgPSBGUkFNRVdPUksuaGlzdG9yeS5uYXZpZ2F0ZTtcbn1cbiIsIi8qKlxuICogQmFyZS1ib25lcyBET00vVUkgdXRpbGl0aWVzXG4gKi9cblxudmFyIEV2ZW50cyA9IHJlcXVpcmUoJy4vZXZlbnRzJyk7XG5cbnZhciBET00gPSB7XG5cblx0LyoqXG5cdCAqIEV4cG9zZSB0aGUgXCJET01teS1ldmVudGVkbmVzc1wiIG9mIGVsZW1lbnRzIHNvIHRoYXQgaXQncyBzZWxlY3RhYmxlIHZpYSBDU1Ncblx0ICogWW91IGNhbiB1c2UgdGhpcyB0byBhcHBseSBhIGZldyBjaG9pY2UgRE9NIG1vZGlmaWNhdGlvbnMgb3V0IHRoZSBnYXRlLS1cblx0ICogKGUuZy4gdHdlYWtzIHRhcmdldGluZyBjb21tb24gaXNzdWVzIHRoYXQgdHlwaWNhbGx5IGdldCBmb3Jnb3R0ZW4sIGxpa2UgZGlzYWJsaW5nIHRleHQgc2VsZWN0aW9uKVxuXHQgKlxuXHQgKiBAcGFyYW0ge0NvbXBvbmVudH0gY29tcG9uZW50XG5cdCAqL1xuXHRmbGFnQm91bmRFdmVudHM6IGZ1bmN0aW9uICggY29tcG9uZW50ICkge1xuXG5cdFx0Ly8gVE9ETzogcHJvdmlkZSBhY2Nlc3MgdG8gYm91bmQgZ2xvYmFsIGV2ZW50cyAoJSkgYW5kIHJvdXRlcyAoIykgYXMgd2VsbFxuXHRcdC8vIFRPRE86IGZsYWcgYWxsIERPTSBldmVudHMsIG5vdCBqdXN0IGNsaWNrIGFuZCB0b3VjaFxuXG5cdFx0Ly8gQnVpbGQgc3Vic2V0IG9mIGp1c3QgdGhlIGNsaWNrL3RvdWNoIGV2ZW50c1xuXHRcdHZhciBjbGlja09yVG91Y2hFdmVudHMgPSBFdmVudHMucGFyc2UoXG5cdFx0XHRjb21wb25lbnQuZXZlbnRzLFxuXHRcdFx0eyBvbmx5OiBbJ2NsaWNrJywgJ3RvdWNoJywgJ3RvdWNoc3RhcnQnLCAndG91Y2hlbmQnXSB9XG5cdFx0KTtcblxuXHRcdC8vIElmIG5vIGNsaWNrL3RvdWNoIGV2ZW50cyBmb3VuZCwgYmFpbCBvdXRcblx0XHRpZiAoIGNsaWNrT3JUb3VjaEV2ZW50cy5sZW5ndGggPCAxICkgcmV0dXJuO1xuXG5cdFx0Ly8gUXVlcnkgYWZmZWN0ZWQgZWxlbWVudHMgZnJvbSBET01cblx0XHR2YXIgJGFmZmVjdGVkID0gRXZlbnRzLmdldEVsZW1lbnRzKGNsaWNrT3JUb3VjaEV2ZW50cywgY29tcG9uZW50KTtcblxuXHRcdC8vIE5PVEU6IEZvciBub3csIHRoaXMgaXMgYWx3YXlzIGp1c3QgJ2NsaWNrJ1xuXHRcdHZhciBib3VuZEV2ZW50c1N0cmluZyA9ICdjbGljayc7XG5cblx0XHQvLyBTZXQgYGRhdGEtRlJBTUVXT1JLLWNsaWNrYWJsZWAgY3VzdG9tIGF0dHJpYnV0ZVxuXHRcdC8vICh1aSBsb2dpYyBzaG91bGQgYmUgZXh0ZW5kZWQgaW4gQ1NTKVxuXHRcdCRhZmZlY3RlZC5hdHRyKCdkYXRhLScgKyBGUkFNRVdPUksub3B0aW9ucy5mcmFtZXdvcmtJZCArICctZXZlbnRzJywgYm91bmRFdmVudHNTdHJpbmcpO1xuXG5cdFx0RlJBTUVXT1JLLnZlcmJvc2UoXG5cdFx0XHRjb21wb25lbnQuaWQgKyAnIDo6ICcgK1xuXHRcdFx0J0Rpc2FibGVkIHVzZXIgdGV4dCBzZWxlY3Rpb24gb24gZWxlbWVudHMgdy8gY2xpY2svdG91Y2ggZXZlbnRzOicsXG5cdFx0XHRjbGlja09yVG91Y2hFdmVudHMsXG5cdFx0XHQkYWZmZWN0ZWRcblx0XHQpO1xuXHR9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IERPTTtcbiIsIi8qKlxuICogVXRpbGl0eSBFdmVudCB0b29sa2l0XG4gKi9cblxudmFyIFV0aWxzID0gcmVxdWlyZSgnLi91dGlscy5qcycpO1xuXG52YXIgRXZlbnRzID0ge1xuXG5cdC8qKlxuXHQgKiBQYXJzZXMgYSBkaWN0aW9uYXJ5IG9mIGV2ZW50cyBhbmQgb3B0aW9uYWxseSBmaWx0ZXJzIGJ5IHRoZSBldmVudCB0eXBlLiBJZiB0aGUgZXZlbnRcblx0ICpcblx0ICogQHBhcmFtICB7T2JqZWN0fSBldmVudHMgIFtBIEJhY2tib25lLlZpZXcgZXZlbnRzIG9iamVjdF1cblx0ICogQHBhcmFtICB7T2JqZWN0fSBvcHRpb25zIFtPcHRpb25zIG9iamVjdCB0aGF0IGFsbG93cyB1cyB0byBmaWx0ZXIgcGFyc2luZyB0byBjZXJ0YWluIGV2ZW50XG5cdCAqICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZXNdXG5cdCAqXG5cdCAqIEByZXR1cm4ge0FycmF5fSAgICAgICAgICBbQXJyYXkgY29udGFpbmluZyBwYXJzZWRFdmVudHMgdGhhdCBhcmUgbWF0Y2hpbmcgZXZlbnQga2V5c11cblx0ICovXG5cdHBhcnNlOiBmdW5jdGlvbiAoZXZlbnRzLCBvcHRpb25zKSB7XG5cblx0XHR2YXIgZXZlbnRLZXlzID0gXy5rZXlzKGV2ZW50cyB8fCB7fSksXG5cdFx0XHRsaW1pdEV2ZW50cyxcblx0XHRcdHBhcnNlZEV2ZW50cyA9IFtdO1xuXG5cdFx0Ly8gT3B0aW9uYWxseSBmaWx0ZXIgdXNpbmcgc2V0IG9mIGFjY2VwdGFibGUgZXZlbnQgdHlwZXNcblx0XHRsaW1pdEV2ZW50cyA9IG9wdGlvbnMub25seTtcblx0XHRldmVudEtleXMgPSBfLmZpbHRlcihldmVudEtleXMsIGZ1bmN0aW9uIGNoZWNrRXZlbnROYW1lIChldmVudEtleSkge1xuXG5cdFx0XHQvLyBQYXJzZSBldmVudCBzdHJpbmcgaW50byBzZW1hbnRpYyByZXByZXNlbnRhdGlvblxuXHRcdFx0dmFyIGV2ZW50ID0gRXZlbnRzLnBhcnNlRE9NRXZlbnQoZXZlbnRLZXkpO1xuXHRcdFx0cGFyc2VkRXZlbnRzLnB1c2goZXZlbnQpO1xuXG5cdFx0XHQvLyBPcHRpb25hbCBmaWx0ZXJcblx0XHRcdGlmIChsaW1pdEV2ZW50cykge1xuXHRcdFx0XHRyZXR1cm4gXy5jb250YWlucyhsaW1pdEV2ZW50cywgZXZlbnQubmFtZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBwYXJzZWRFdmVudHM7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFtnZXRFbGVtZW50cyBkZXNjcmlwdGlvbl1cblx0ICpcblx0ICogQHBhcmFtICB7QXJyYXl9IHNlbWFudGljRXZlbnRzIFtBIGxpc3Qgb2YgcGFyc2VkIGV2ZW50IG9iamVjdHNdXG5cdCAqIEBwYXJhbSAge0NvbXBvbmVudH0gY29udGV4dCAgICBbSW5zdGFuY2Ugb2YgYSBjb21wb25lbnQgdG8gdXNlIGFzIGEgc3RhcnRpbmcgcG9pbnQgZm9yXG5cdCAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhlIERPTSBxdWVyaWVzXVxuXHQgKlxuXHQgKiBAcmV0dXJuIHtBcnJheX0gICAgICAgICAgICAgICAgW0FuIGFycmF5IG9mIGpRdWVyeSBzZXQgb2YgbWF0Y2hlZCBlbGVtZW50c11cblx0ICovXG5cdGdldEVsZW1lbnRzOiBmdW5jdGlvbiAoc2VtYW50aWNFdmVudHMsIGNvbnRleHQpIHtcblxuXHRcdC8vIENvbnRleHQgb3B0aW9uYWxcblx0XHRjb250ZXh0ID0gY29udGV4dCB8fCB7ICQ6ICQgfTtcblxuXHRcdC8vIEl0ZXJhdGl2ZWx5IGJ1aWxkIGEgc2V0IG9mIGFmZmVjdGVkIGVsZW1lbnRzXG5cdFx0dmFyICRhZmZlY3RlZCA9ICQoKTtcblx0XHRfLmVhY2goc2VtYW50aWNFdmVudHMsIGZ1bmN0aW9uIGxvb2t1cEVsZW1lbnRzRm9yRXZlbnQgKGV2ZW50KSB7XG5cblx0XHRcdC8vIERldGVybWluZSBtYXRjaGVkIGVsZW1lbnRzXG5cdFx0XHQvLyBVc2UgZGVsZWdhdGUgc2VsZWN0b3IgaWYgc3BlY2lmaWVkXG5cdFx0XHQvLyBPdGhlcndpc2UsIGdyYWIgdGhlIGVsZW1lbnQgZm9yIHRoaXMgY29tcG9uZW50XG5cdFx0XHR2YXIgJG1hdGNoZWQgPVx0ZXZlbnQuc2VsZWN0b3IgP1xuXHRcdFx0XHRcdFx0XHRjb250ZXh0LiQoZXZlbnQuc2VsZWN0b3IpIDpcblx0XHRcdFx0XHRcdFx0Y29udGV4dC4kZWw7XG5cblx0XHRcdC8vIEFkZCBtYXRjaGVkIGVsZW1lbnRzIHRvIHNldFxuXHRcdFx0JGFmZmVjdGVkID0gJGFmZmVjdGVkLmFkZCggJG1hdGNoZWQgKTtcblx0XHR9LCB0aGlzKTtcblxuXHRcdHJldHVybiAkYWZmZWN0ZWQ7XG5cdH0sXG5cblxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHdoZXRoZXIgdGhlIHNwZWNpZmllZCBldmVudCBrZXkgbWF0Y2hlcyBhIERPTSBldmVudC5cblx0ICpcblx0ICogQHBhcmFtICB7U3RyaW5nfSBrZXkgW0tleSB0byBtYXRjaCBhZ2FpbnN0XVxuXHQgKlxuXHQgKiBpZiBubyBtYXRjaCBpcyBmb3VuZFxuXHQgKiBAcmV0dXJuIHtCb29sZWFufSBcdFx0W3JldHVybiBgZmFsc2VgXVxuXHQgKlxuXHQgKiBvdGhlcndpc2Vcblx0ICogQHJldHVybiB7T2JqZWN0fSAgXHRcdFtPYmplY3QgY29udGFpbmluZyB0aGUgYG5hbWVgIG9mIHRoZSBET00gZWxlbWVudCBhbmQgdGhlIGBzZWxlY3RvcmBdXG5cdCAqL1xuXHRwYXJzZURPTUV2ZW50OiBfLm1lbW9pemUoZnVuY3Rpb24oa2V5KSB7XG5cblx0XHR2YXIgbWF0Y2hlcyA9IGtleS5tYXRjaCh0aGlzWycvRE9NRXZlbnQvJ10pO1xuXG5cdFx0aWYgKCFtYXRjaGVzIHx8ICFtYXRjaGVzWzFdKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdG5hbWU6IG1hdGNoZXNbMV0sXG5cdFx0XHRzZWxlY3RvcjogbWF0Y2hlc1szXVxuXHRcdH07XG5cdH0pLFxuXG5cblx0LyoqXG5cdCAqIFN1cHBvcnRlZCBcImZpcnN0LWNsYXNzXCIgRE9NIGV2ZW50cy5cblx0ICogQHR5cGUge0FycmF5fVxuXHQgKi9cblx0bmFtZXM6IFtcblxuXHRcdC8vIExvY2FsaXplZCBicm93c2VyIGV2ZW50c1xuXHRcdC8vICh3b3JrcyBvbiBpbmRpdmlkdWFsIGVsZW1lbnRzKVxuXHRcdCdlcnJvcicsICdzY3JvbGwnLFxuXG5cdFx0Ly8gTW91c2UgZXZlbnRzXG5cdFx0J2NsaWNrJywgJ2RibGNsaWNrJywgJ21vdXNlZG93bicsICdtb3VzZXVwJywgJ2hvdmVyJywgJ21vdXNlZW50ZXInLCAnbW91c2VsZWF2ZScsXG5cdFx0J21vdXNlb3ZlcicsICdtb3VzZW91dCcsICdtb3VzZW1vdmUnLFxuXG5cdFx0Ly8gS2V5Ym9hcmQgZXZlbnRzXG5cdFx0J2tleWRvd24nLCAna2V5dXAnLCAna2V5cHJlc3MnLFxuXG5cdFx0Ly8gRm9ybSBldmVudHNcblx0XHQnYmx1cicsICdjaGFuZ2UnLCAnZm9jdXMnLCAnZm9jdXNpbicsICdmb2N1c291dCcsICdzZWxlY3QnLCAnc3VibWl0JyxcblxuXHRcdC8vIFJhdyB0b3VjaCBldmVudHNcblx0XHQndG91Y2hzdGFydCcsICd0b3VjaGVuZCcsICd0b3VjaG1vdmUnLCAndG91Y2hjYW5jZWwnLFxuXG5cdFx0Ly8gTWFudWZhY3R1cmVkIGV2ZW50c1xuXHRcdCd0b3VjaCcsXG5cblx0XHQvLyBUT0RPOlxuXHRcdCdyaWdodGNsaWNrJywgJ2NsaWNrb3V0c2lkZSdcblx0XVxufTtcblxuXG5cblxuLyoqXG4gKiBSZWdleHAgdG8gbWF0Y2ggXCJmaXJzdCBjbGFzc1wiIERPTSBldmVudHNcbiAqICh0aGVzZSBhcmUgYWxsb3dlZCBpbiB0aGUgdG9wIGxldmVsIG9mIGEgY29tcG9uZW50IGRlZmluaXRpb24gYXMgbWV0aG9kIGtleXMpXG4gKlx0XHRpLmUuIC9eKGNsaWNrfGhvdmVyfGJsdXJ8Zm9jdXMpKCAoLispKS9cbiAqXHRcdFx0WzFdID0+IGV2ZW50IG5hbWVcbiAqXHRcdFx0WzNdID0+IHNlbGVjdG9yXG4gKi9cblxuRXZlbnRzWycvRE9NRXZlbnQvJ10gPSBuZXcgUmVnRXhwKCdeKCcgKyBfLnJlZHVjZShFdmVudHMubmFtZXMsXG5cdGZ1bmN0aW9uIGJ1aWxkUmVnZXhwKG1lbW8sIGV2ZW50TmFtZSwgaW5kZXgpIHtcblxuXHRcdC8vIE9taXQgYHxgIHRoZSBmaXJzdCB0aW1lXG5cdFx0aWYgKGluZGV4ID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gbWVtbyArIGV2ZW50TmFtZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbWVtbyArICd8JyArIGV2ZW50TmFtZTtcblx0fSwgJycpICtcbicpKCAoLispKT8kJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gRXZlbnRzO1xuIiwiLyoqXG4gKiBUcmFuc2xhdGUgKipyaWdodC1oYW5kLXNpZGUgYWJicmV2aWF0aW9ucyoqIGludG8gZnVuY3Rpb25zIHRoYXQgcGVyZm9ybVxuICogdGhlIHByb3BlciBiZWhhdmlvcnMsIGUuZy5cbiAqXHRcdCNhYm91dF9tZVxuICpcdFx0JW1haW5NZW51Om9wZW5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHRyYW5zbGF0ZVNob3J0aGFuZCh2YWx1ZSwga2V5KSB7XG5cblx0dmFyIG1hdGNoZXMsIGZuO1xuXG5cdC8vIElmIHRoaXMgaXMgYW4gaW1wb3J0YW50LCBGUkFNRVdPUkstc3BlY2lmaWMgZGF0YSBrZXksXG5cdC8vIGFuZCBhIGZ1bmN0aW9uIHdhcyBzcGVjaWZpZWQsIHJ1biBpdCB0byBnZXQgaXRzIHZhbHVlXG5cdC8vICh0aGlzIGlzIHRvIGtlZXAgcGFyaXR5IHdpdGggQmFja2JvbmUncyBzaW1pbGFyIGZ1bmN0aW9uYWxpdHkpXG5cdGlmIChfLmlzRnVuY3Rpb24odmFsdWUpICYmIChrZXkgPT09ICdjb2xsZWN0aW9uJyB8fCBrZXkgPT09ICdtb2RlbCcpKSB7XG5cdFx0cmV0dXJuIHZhbHVlKCk7XG5cdH1cblxuXHQvLyBJZ25vcmUgb3RoZXIgbm9uLXN0cmluZ3Ncblx0aWYgKCFfLmlzU3RyaW5nKHZhbHVlKSkge1xuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxuXG5cdC8vIEFsc28gaWdub3JlIGB0ZW1wbGF0ZWBcblx0Ly8gVE9ETzogdXNlIGEgZGlmZmVyZW50IGtleSBsYXRlclxuXHRpZiAoa2V5ID09PSAndGVtcGxhdGUnKSByZXR1cm4gdmFsdWU7XG5cblx0Ly8gQWxzbyBpZ25vcmUgdGhpbmdzIHRoYXQgc3RhcnQgd2l0aCBfXG5cdGlmIChrZXkubWF0Y2goL15fLykpIHJldHVybiB2YWx1ZTtcblxuXG5cdC8vIFJlZGlyZWN0cyB1c2VyIHRvIGNsaWVudC1zaWRlIFVSTCwgdy9vIGFmZmVjdGluZyBicm93c2VyIGhpc3Rvcnlcblx0Ly8gTGlrZSBjYWxsaW5nIGBCYWNrYm9uZS5oaXN0b3J5Lm5hdmlnYXRlKCcvZm9vJywgeyByZXBsYWNlOiB0cnVlIH0pYFxuXHRpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXiMjKC4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHRcdGZuID0gZnVuY3Rpb24gcmVkaXJlY3RBbmRDb3ZlclRyYWNrcygpIHtcblx0XHRcdHZhciB1cmwgPSBtYXRjaGVzWzFdO1xuXHRcdFx0RlJBTUVXT1JLLmhpc3RvcnkubmF2aWdhdGUodXJsLCB7XG5cdFx0XHRcdHRyaWdnZXI6IHRydWUsXG5cdFx0XHRcdHJlcGxhY2U6IHRydWVcblx0XHRcdH0pO1xuXHRcdH07XG5cdH1cblx0Ly8gTWV0aG9kIHRvIHJlZGlyZWN0IHVzZXIgdG8gYSBjbGllbnQtc2lkZSBVUkwsIHRoZW4gY2FsbCB0aGUgaGFuZGxlclxuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eIyguKlteLlxcc10rKS8pKSAmJiBtYXRjaGVzWzFdKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiBjaGFuZ2VVcmxGcmFnbWVudCgpIHtcblx0XHRcdHZhciB1cmwgPSBtYXRjaGVzWzFdO1xuXHRcdFx0RlJBTUVXT1JLLmhpc3RvcnkubmF2aWdhdGUodXJsLCB7XG5cdFx0XHRcdHRyaWdnZXI6IHRydWVcblx0XHRcdH0pO1xuXHRcdH07XG5cdH1cblx0Ly8gTWV0aG9kIHRvIHRyaWdnZXIgZ2xvYmFsIGV2ZW50XG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14oJS4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHRcdGZuID0gZnVuY3Rpb24gdHJpZ2dlckV2ZW50KCkge1xuXHRcdFx0dmFyIHRyaWdnZXIgPSBtYXRjaGVzWzFdO1xuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UodGhpcy5pZCArICcgOjogVHJpZ2dlcmluZyBldmVudCAoJyArIHRyaWdnZXIgKyAnKS4uLicpO1xuXHRcdFx0RlJBTUVXT1JLLnRyaWdnZXIodHJpZ2dlcik7XG5cdFx0fTtcblx0fVxuXHQvLyBNZXRob2QgdG8gZmlyZSBhIHRlc3QgYWxlcnRcblx0Ly8gKHVzZSBtZXNzYWdlLCBpZiBzcGVjaWZpZWQpXG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14hISFcXHMqKC4qW14uXFxzXSk/LykpKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiBiYW5nQWxlcnQoZSkge1xuXG5cdFx0XHQvLyBJZiBzcGVjaWZpZWQsIG1lc3NhZ2UgaXMgdXNlZCwgb3RoZXJ3aXNlICdBbGVydCB0cmlnZ2VyZWQhJ1xuXHRcdFx0dmFyIG1zZyA9IChtYXRjaGVzICYmIG1hdGNoZXNbMV0pIHx8ICdEZWJ1ZyBhbGVydCAoISEhKSB0cmlnZ2VyZWQhJztcblxuXHRcdFx0Ly8gT3RoZXIgZGlhZ25vc3RpYyBpbmZvcm1hdGlvblxuXHRcdFx0bXNnICs9ICdcXG5cXG5EaWFnbm9zdGljc1xcbj09PT09PT09PT09PT09PT09PT09PT09PVxcbic7XG5cdFx0XHRpZiAoZSAmJiBlLmN1cnJlbnRUYXJnZXQpIHtcblx0XHRcdFx0bXNnICs9ICdlLmN1cnJlbnRUYXJnZXQgOjogJyArIGUuY3VycmVudFRhcmdldDtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmlkKSB7XG5cdFx0XHRcdG1zZyArPSAndGhpcy5pZCA6OiAnICsgdGhpcy5pZDtcblx0XHRcdH1cblxuXHRcdFx0YWxlcnQobXNnKTtcblx0XHR9O1xuXHR9XG5cblx0Ly8gTWV0aG9kIHRvIGxvZyBhIG1lc3NhZ2UgdG8gdGhlIGNvbnNvbGVcblx0Ly8gKHVzZSBtZXNzYWdlLCBpZiBzcGVjaWZpZWQpXG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14+Pj5cXHMqKC4qW14uXFxzXSk/LykpKSB7XG5cblx0XHRmbiA9IGZ1bmN0aW9uIGxvZ01lc3NhZ2UoZSkge1xuXG5cdFx0XHQvLyBJZiBzcGVjaWZpZWQsIG1lc3NhZ2UgaXMgdXNlZCwgb3RoZXJ3aXNlIHVzZSBkZWZhdWx0XG5cdFx0XHR2YXIgbXNnID0gKG1hdGNoZXMgJiYgbWF0Y2hlc1sxXSkgfHwgJ0xvZyBtZXNzYWdlICg+Pj4pIHRyaWdnZXJlZCEnO1xuXHRcdFx0RlJBTUVXT1JLLmxvZyhtc2cpO1xuXHRcdH07XG5cdH1cblxuXHQvLyBNZXRob2QgdG8gYXR0YWNoIHRoZSBzcGVjaWZpZWQgY29tcG9uZW50L3RlbXBsYXRlIHRvIGEgcmVnaW9uXG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14oLispPFxcLSguKlteLlxcc10pLykpICYmIG1hdGNoZXNbMV0gJiYgbWF0Y2hlc1syXSkge1xuXHRcdGZuID0gZnVuY3Rpb24gYXR0YWNoVGVtcGxhdGUoKSB7XG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZSh0aGlzLmlkICsgJyA6OiBBdHRhY2hpbmcgYCcgKyBtYXRjaGVzWzJdICsgJ2AgdG8gYCcgKyBtYXRjaGVzWzFdICsgJ2AuLi4nKTtcblxuXHRcdFx0dmFyIHJlZ2lvbiA9IG1hdGNoZXNbMV07XG5cdFx0XHR2YXIgdGVtcGxhdGUgPSBtYXRjaGVzWzJdO1xuXG5cdFx0XHRpZiAoIXRoaXNbcmVnaW9uXSkge1xuXHRcdFx0XHRGUkFNRVdPUksuZXJyb3IodGhpcy5pZCwnOjogVHJ5aW5nIHRvIGF0dGFjaCByZWdpb24gd2l0aCBzaG9ydGhhbmQgKCcrbWF0Y2hlcysnKSwgYnV0IGNvdWxkIG5vdCBmaW5kIHJlZ2lvbiBgJywgcmVnaW9uLCdgJyk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXNbcmVnaW9uXS5hdHRhY2godGVtcGxhdGUpO1xuXHRcdH07XG5cdH1cblxuXG5cdC8vIE1ldGhvZCB0byB0b2dnbGUgKCEpIHRoZSBzcGVjaWZpZWQgbW9kZWwgYXR0clxuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eXFwhXFxzKlxcQCguKlteLlxcc10pLykpICYmIG1hdGNoZXNbMV0pIHtcblx0XHRmbiA9IGZ1bmN0aW9uIHRvZ2dsZUF0dHIoKSB7XG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZSh0aGlzLmlkICsgJyA6OiBUb2dnbGluZyBhdHRyICgnICsgbWF0Y2hlc1sxXSArICcpLi4uJyk7XG5cdFx0XHR2YXIgb2xkQXR0clZhbHVlID0gdGhpcy5tb2RlbC5nZXQoIG1hdGNoZXNbMV0gKTtcblxuXHRcdFx0aWYgKG9sZEF0dHJWYWx1ZSkge1xuXHRcdFx0XHR0aGlzLm1vZGVsLnNldCggbWF0Y2hlc1sxXSwgZmFsc2UgKTtcblx0XHRcdH1cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHR0aGlzLm1vZGVsLnNldCggbWF0Y2hlc1sxXSwgdHJ1ZSApO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHQvLyBNZXRob2QgdG8gY2hhbmdlIHRoZSBzcGVjaWZpZWQgbW9kZWwgYXR0clxuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eXFxzKlxcQChbXj1dKyk9KFtePV0qKVxccyokLykpKSB7XG5cblx0XHR2YXIgYXR0ck5hbWUgPSBtYXRjaGVzWzFdO1xuXHRcdHZhciBuZXdBdHRyVmFsdWUgPSBtYXRjaGVzWzJdO1xuXG5cdFx0Zm4gPSBmdW5jdGlvbiBjaGFuZ2VBdHRyKCkge1xuXHRcdFx0dGhpcy5tb2RlbC5zZXQoYXR0ck5hbWUsIG5ld0F0dHJWYWx1ZSk7XG5cdFx0fTtcblx0fVxuXG5cdC8vIE1ldGhvZCB0byByZW1vdmUgdGhlIG1vZGVsIGZvciB0aGUgY3VycmVudCBjb21wb25lbnRcblx0ZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXlxccypcXC1cXHMqJC8pKSkge1xuXHRcdGZuID0gZnVuY3Rpb24gcmVtb3ZlTW9kZWwgKCkge1xuXG5cdFx0XHQvLyBPbmx5IHdvcmtzIGlmIG1vZGVsIGJlbG9uZ3MgdG8gYSBjb2xsZWN0aW9uXG5cdFx0XHRpZiAoIXRoaXMubW9kZWwuY29sbGVjdGlvbikgcmV0dXJuO1xuXG5cdFx0XHR0aGlzLm1vZGVsLmNvbGxlY3Rpb24ucmVtb3ZlKHRoaXMubW9kZWwpO1xuXHRcdH07XG5cdH1cblxuXG5cdC8vIGRlcHJlY2F0aW5nIGNsYXNzIG1hbmlwdWxhdGlvbiBzaG9ydGhhbmRcblx0Ly8gKG5vIG5lZWQgdG8gZG8gZG9tIG1hbmlwdWxhdGlvbiB1bmxlc3MgYWJzb2x1dGVseSBuZWNlc3NhcnkpXG5cblx0Ly8gLy8gTWV0aG9kIHRvIGFkZCB0aGUgc3BlY2lmaWVkIGNsYXNzXG5cdC8vIGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL15cXCtcXHMqXFwuKC4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHQvLyBcdGZuID0gZnVuY3Rpb24gYWRkQ2xhc3MoKSB7XG5cdC8vIFx0XHRGUkFNRVdPUksudmVyYm9zZSh0aGlzLmlkICsgJyA6OiBBZGRpbmcgY2xhc3MgKCcgKyBtYXRjaGVzWzFdICsgJykuLi4nKTtcblx0Ly8gXHRcdHRoaXMuJGVsLmFkZENsYXNzKG1hdGNoZXNbMV0pO1xuXHQvLyBcdH07XG5cdC8vIH1cblx0Ly8gLy8gTWV0aG9kIHRvIHJlbW92ZSB0aGUgc3BlY2lmaWVkIGNsYXNzXG5cdC8vIGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL15cXC1cXHMqXFwuKC4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHQvLyBcdGZuID0gZnVuY3Rpb24gcmVtb3ZlQ2xhc3MoKSB7XG5cdC8vIFx0XHRGUkFNRVdPUksudmVyYm9zZSh0aGlzLmlkICsgJyA6OiBSZW1vdmluZyBjbGFzcyAoJyArIG1hdGNoZXNbMV0gKyAnKS4uLicpO1xuXHQvLyBcdFx0dGhpcy4kZWwucmVtb3ZlQ2xhc3MobWF0Y2hlc1sxXSk7XG5cdC8vIFx0fTtcblx0Ly8gfVxuXHQvLyAvLyBNZXRob2QgdG8gdG9nZ2xlIHRoZSBzcGVjaWZpZWQgY2xhc3Ncblx0Ly8gZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXlxcIVxccypcXC4oLipbXi5cXHNdKS8pKSAmJiBtYXRjaGVzWzFdKSB7XG5cdC8vIFx0Zm4gPSBmdW5jdGlvbiB0b2dnbGVDbGFzcygpIHtcblx0Ly8gXHRcdEZSQU1FV09SSy52ZXJib3NlKHRoaXMuaWQgKyAnIDo6IFRvZ2dsaW5nIGNsYXNzICgnICsgbWF0Y2hlc1sxXSArICcpLi4uJyk7XG5cdC8vIFx0XHR0aGlzLiRlbC50b2dnbGVDbGFzcyhtYXRjaGVzWzFdKTtcblx0Ly8gXHR9O1xuXHQvLyB9XG5cblx0Ly8gVE9ETzpcdGFsbG93IGRlc2NlbmRhbnRzIHRvIGJlIGNvbnRyb2xsZWQgdmlhIHNob3J0aGFuZFxuXHQvL1x0XHRcdGUuZy4gOiAnbGkucm93IC0uaGlnaGxpZ2h0ZWQnXG5cdC8vXHRcdFx0d291bGQgcmVtb3ZlIHRoZSBgaGlnaGxpZ2h0ZWRgIGNsYXNzIGZyb20gdGhpcy4kKCdsaS5yb3cnKVxuXG5cblx0Ly8gSWYgc2hvcnQtaGFuZCBtYXRjaGVkLCByZXR1cm4gdGhlIGRlcmVmZXJlbmNlZCBmdW5jdGlvblxuXHRpZiAoZm4pIHtcblxuXHRcdEZSQU1FV09SSy52ZXJib3NlKCdJbnRlcnByZXRpbmcgbWVhbmluZyBmcm9tIHNob3J0aGFuZCA6OiBgJyArIHZhbHVlICsgJ2AuLi4nKTtcblxuXHRcdC8vIEN1cnJ5IHRoZSByZXN1bHQgZnVuY3Rpb24gd2l0aCBhbnkgc3VmZml4IG1hdGNoZXNcblx0XHR2YXIgY3VycmllZEZuID0gZm47XG5cblx0XHQvLyBUcmFpbGluZyBgLmAgaW5kaWNhdGVzIGFuIGUuc3RvcFByb3BhZ2F0aW9uKClcblx0XHRpZiAodmFsdWUubWF0Y2goL1xcLlxccyokLykpIHtcblx0XHRcdGN1cnJpZWRGbiA9IGZ1bmN0aW9uIGFuZFN0b3BQcm9wYWdhdGlvbihlKSB7XG5cblx0XHRcdFx0Ly8gQmluZCAoc28gaXQgaW5oZXJpdHMgY29tcG9uZW50IGNvbnRleHQpIGFuZCBjYWxsIGludGVyaW9yIGZ1bmN0aW9uXG5cdFx0XHRcdGZuLmFwcGx5KHRoaXMpO1xuXG5cdFx0XHRcdC8vIHRoZW4gaW1tZWRpYXRlbHkgc3RvcCBldmVudCBidWJibGluZy9wcm9wYWdhdGlvblxuXHRcdFx0XHRpZiAoZSAmJiBlLnN0b3BQcm9wYWdhdGlvbikge1xuXHRcdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0RlJBTUVXT1JLLndhcm4oXG5cdFx0XHRcdFx0XHR0aGlzLmlkICsgJyA6OiBUcmFpbGluZyBgLmAgc2hvcnRoYW5kIHdhcyB1c2VkIHRvIGludm9rZSBhbiAnICtcblx0XHRcdFx0XHRcdCdlLnN0b3BQcm9wYWdhdGlvbigpLCBidXQgXCInICsgdmFsdWUgKyAnXCIgd2FzIG5vdCB0cmlnZ2VyZWQgYnkgYSBET00gZXZlbnQhXFxuJyArXG5cdFx0XHRcdFx0XHQnUHJvYmFibHkgYmVzdCB0byBkb3VibGUtY2hlY2sgdGhpcyB3YXMgd2hhdCB5b3UgbWVhbnQgdG8gZG8uJyk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGN1cnJpZWRGbjtcblx0fVxuXG5cblx0Ly8gT3RoZXJ3aXNlLCBpZiBubyBzaG9ydC1oYW5kIG1hdGNoZWQsIHBhc3MgdGhlIG9yaWdpbmFsIHZhbHVlXG5cdC8vIHN0cmFpZ2h0IHRocm91Z2hcblx0cmV0dXJuIHZhbHVlO1xufTtcbiIsIi8qKlxuICogVXRpbGl0eSBmdW5jdGlvbnMgdGhhdCBhcmUgdXNlZCB0aHJvdWdob3V0IHRoZSBjb3JlLlxuICovXG5cbnZhciBVdGlscyA9IHtcblxuXHQvKipcblx0ICogR3JhYnMgdGhlIGlkIHhvciBkYXRhLWlkIGZyb20gYW4gSFRNTCBlbGVtZW50LlxuXHQgKlxuXHQgKiBAcGFyYW0gIHtET01FbGVtZW50fSBlbCAgICBbRWxlbWVudCB3aGVyZSB3ZSBhcmUgbG9va2luZyBmb3IgdGhlIGBpZGAgb3IgYGRhdGEtaWRgIGF0dHJdXG5cdCAqIEBwYXJhbSAge0Jvb2xlYW59IHJlcXVpcmVkIFtEZXRlcm1pbmVzIGlmIGl0IGlzIHJlcXVpcmVkIHRvIGZpbmQgYW4gYGlkYCBvciBgZGF0YS1pZGAgYXR0cl1cblx0ICpcblx0ICogQHJldHVybiB7U3RyaW5nfSAgICAgICAgICBcdFtJZGVudGlmaWNhdGlvbiBzdHJpbmcgdGhhdCB3YXMgZm91bmRdXG5cdCAqL1xuXHRlbDJpZDogZnVuY3Rpb24oZWwsIHJlcXVpcmVkKSB7XG5cblx0XHR2YXIgaWQgPSAkKGVsKS5hdHRyKCdpZCcpO1xuXHRcdHZhciBkYXRhSWQgPSAkKGVsKS5hdHRyKCdkYXRhLWlkJyk7XG5cdFx0dmFyIGNvbnRlbnRzSWQgPSAkKGVsKS5hdHRyKCdjb250ZW50cycpO1xuXG5cdFx0aWYgKGlkICYmIGRhdGFJZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGlkICsgJyA6OiBDYW5ub3Qgc2V0IGJvdGggYGlkYCBhbmQgYGRhdGEtaWRgISAgUGxlYXNlIHVzZSBvbmUgb3IgdGhlIG90aGVyLiAgKGRhdGEtaWQgaXMgc2FmZXN0KScpO1xuXHRcdH1cblx0XHRpZiAocmVxdWlyZWQgJiYgIWlkICYmICFkYXRhSWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTm8gaWQgc3BlY2lmaWVkIGluIGVsZW1lbnQgd2hlcmUgaXQgaXMgcmVxdWlyZWQ6XFxuJyArIGVsKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gaWQgfHwgZGF0YUlkIHx8IGNvbnRlbnRzSWQ7XG5cdH0sXG5cblx0LyoqXG5cdCAqIE1hcCBhbiBvYmplY3QncyB2YWx1ZXMsIGFuZCByZXR1cm4gYSB2YWxpZCBvYmplY3QgKHRoaXMgZnVuY3Rpb24gaXMgaGFuZHkgYmVjYXVzZVxuXHQgKiB1bmRlcnNjb3JlLm1hcCgpIHJldHVybnMgYSBsaXN0LCBub3QgYW4gb2JqZWN0Lilcblx0ICpcblx0ICogQHBhcmFtICB7T2JqZWN0fSBvYmogICAgICAgICBcdFtPamVjdCB3aG9zIHZhbHVlcyB5b3Ugd2FudCB0byBtYXBdXG5cdCAqIEBwYXJhbSAge0Z1bmN0aW9ufSB0cmFuc2Zvcm1GbiBbRnVuY3Rpb24gdG8gdHJhbnNmb3JtIGVhY2ggb2JqZWN0IHZhbHVlIGJ5XVxuXHQgKlxuXHQgKiBAcmV0dXJuIHtPYmplY3R9ICAgICAgICAgICAgIFx0W05ldyBvYmplY3Qgd2l0aCB0aGUgdmFsdWVzIG1hcHBlZF1cblx0ICovXG5cdG9iak1hcDogZnVuY3Rpb24gb2JqTWFwKG9iaiwgdHJhbnNmb3JtRm4pIHtcblx0XHRyZXR1cm4gXy5vYmplY3QoXy5rZXlzKG9iaiksIF8ubWFwKG9iaiwgdHJhbnNmb3JtRm4pKTtcblx0fVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBVdGlsczsiXX0=
;