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


	// If `count` is set, render sub-component specified number of times.
	// e.g. <region template="Foo" count="3" />
	// (verify FRAMEWORK.shortcut.count is enabled)
	var countAttr,
			count = 1;

	// TODO: fix count-- it doesn't work yet
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


	// Method to toggle the specified attr
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
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvY29kZS9vc3MvbWFzdC9saWIvc3JjL2NvbXBvbmVudC9iaW5kRXZlbnRzLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3NyYy9jb21wb25lbnQvY2xvc2UuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvc3JjL2NvbXBvbmVudC9oZWxwZXJzLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3NyYy9jb21wb25lbnQvaW5kZXguanMiLCIvY29kZS9vc3MvbWFzdC9saWIvc3JjL2NvbXBvbmVudC9saWZlY3ljbGVFdmVudHMuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvc3JjL2NvbXBvbmVudC9saWZlY3ljbGVIb29rcy5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9zcmMvY29tcG9uZW50L3JlbmRlci5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9zcmMvY29tcG9uZW50L3JlbmRlckNvbGxlY3Rpb24uanMiLCIvY29kZS9vc3MvbWFzdC9saWIvc3JjL2NvbXBvbmVudC92YWxpZGF0ZURlZmluaXRpb24uanMiLCIvY29kZS9vc3MvbWFzdC9saWIvc3JjL2RlZmluZS9idWlsZERlZmluaXRpb24uanMiLCIvY29kZS9vc3MvbWFzdC9saWIvc3JjL2RlZmluZS9pbmRleC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9zcmMvaW5kZXguanMiLCIvY29kZS9vc3MvbWFzdC9saWIvc3JjL2xvZ2dlci9pbmRleC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9zcmMvbG9nZ2VyL3NldHVwLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3NyYy9yYWlzZS9idWlsZFByb3RvdHlwZS5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9zcmMvcmFpc2UvY29sbGVjdFJlZ2lvbnMuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvc3JjL3JhaXNlL2NvbGxlY3RUZW1wbGF0ZXMuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvc3JjL3JhaXNlL2luZGV4LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3NyYy9yZWdpb24vYXBwZW5kLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3NyYy9yZWdpb24vYXR0YWNoLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3NyYy9yZWdpb24vZW1wdHkuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvc3JjL3JlZ2lvbi9mcm9tRWxlbWVudC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9zcmMvcmVnaW9uL2luZGV4LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3NyYy9yZWdpb24vaW5zZXJ0LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3NyYy9yZWdpb24vcHJlcGVuZC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9zcmMvcmVnaW9uL3JlbW92ZS5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9zcmMvcm91dGVyL2luZGV4LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3NyYy91dGlscy9ET00uanMiLCIvY29kZS9vc3MvbWFzdC9saWIvc3JjL3V0aWxzL2V2ZW50cy5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9zcmMvdXRpbHMvc2hvcnRoYW5kLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3NyYy91dGlscy91dGlscy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9ZQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9OQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNaQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUxBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llc1xuICovXG52YXIgaGVscGVycyA9IHJlcXVpcmUoJy4vaGVscGVycycpO1xuXG5cbi8qKlxuICogQmluZCBjb2xsZWN0aW9uIGV2ZW50cyB0byBsaWZlY3ljbGUgZXZlbnQgaGFuZGxlcnNcbiAqL1xuZXhwb3J0cy5jb2xsZWN0aW9uRXZlbnRzID0gZnVuY3Rpb24oKSB7XG5cdC8vIEJpbmQgdG8gY29sbGVjdGlvbiBldmVudHMgaWYgb25lIHdhcyBwYXNzZWQgaW5cblx0aWYgKHRoaXMuY29sbGVjdGlvbikge1xuXG5cdFx0Ly8gTGlzdGVuIHRvIGV2ZW50c1xuXHRcdHRoaXMubGlzdGVuVG8odGhpcy5jb2xsZWN0aW9uLCAnYWRkJywgdGhpcy5hZnRlckFkZCk7XG5cdFx0dGhpcy5saXN0ZW5Ubyh0aGlzLmNvbGxlY3Rpb24sICdyZW1vdmUnLCB0aGlzLmFmdGVyUmVtb3ZlKTtcblx0XHR0aGlzLmxpc3RlblRvKHRoaXMuY29sbGVjdGlvbiwgJ3Jlc2V0JywgdGhpcy5hZnRlclJlc2V0KTtcblx0fVxufTtcblxuLyoqXG4gKiBCaW5kIG1vZGVsIGV2ZW50cyB0byBsaWZlY3ljbGUgZXZlbnQgaGFuZGxlcnMgYW5kIGFsc28gYWxsb3dzIGZvciBoYW5kbGVycyB0byBmaXJlXG4gKiBvbiBjZXJ0YWluIG1vZGVsIGF0dHJpYnV0ZSBjaGFuZ2VzLlxuICovXG5leHBvcnRzLm1vZGVsRXZlbnRzID0gZnVuY3Rpb24oKSB7XG5cdHZhciBzZWxmID0gdGhpcztcblxuXHRpZiAodGhpcy5tb2RlbCkge1xuXG5cdFx0Ly8gTGlzdGVuIGZvciBhbnkgYXR0cmlidXRlIGNoYW5nZXNcblx0XHQvLyBlLmcuXG5cdFx0Ly8gLmFmdGVyQ2hhbmdlKG1vZGVsLCBvcHRpb25zKVxuXHRcdC8vXG5cdFx0dGhpcy5saXN0ZW5Ubyh0aGlzLm1vZGVsLCAnY2hhbmdlJywgZnVuY3Rpb24gbW9kZWxDaGFuZ2VkIChtb2RlbCwgb3B0aW9ucykge1xuXG5cdFx0XHQvLyBBcHBseSBkYXRhIGJpbmRpbmdzXG5cdFx0XHRoZWxwZXJzLnJlbmRlckRhdGFCaW5kaW5ncy5jYWxsKHNlbGYpO1xuXG5cdFx0XHQvLyBSdW4gY3VzdG9tIGBhZnRlckNoYW5nZWAoKSBtZXRob2Rcblx0XHRcdGlmIChfLmlzRnVuY3Rpb24odGhpcy5hZnRlckNoYW5nZSkpIHtcblx0XHRcdFx0dGhpcy5hZnRlckNoYW5nZShtb2RlbCwgb3B0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyBMaXN0ZW4gZm9yIHNwZWNpZmljIGF0dHJpYnV0ZSBjaGFuZ2VzXG5cdFx0Ly8gZS5nLlxuXHRcdC8vIC5hZnRlckNoYW5nZS5jb2xvcihtb2RlbCwgdmFsdWUsIG9wdGlvbnMpXG5cdFx0aWYgKF8uaXNPYmplY3QodGhpcy5hZnRlckNoYW5nZSkpIHtcblx0XHRcdF8uZWFjaCh0aGlzLmFmdGVyQ2hhbmdlLCBmdW5jdGlvbiAoaGFuZGxlciwgYXR0ck5hbWUpIHtcblxuXHRcdFx0XHQvLyBDYWxsIGhhbmRsZXIgd2l0aCBuZXdWYWwgdG8ga2VlcCBhcmd1bWVudHMgc3RyYWlnaHRmb3J3YXJkXG5cdFx0XHRcdHRoaXMubGlzdGVuVG8odGhpcy5tb2RlbCwgJ2NoYW5nZTonICsgYXR0ck5hbWUsIGZ1bmN0aW9uIGF0dHJDaGFuZ2VkIChtb2RlbCwgbmV3VmFsKSB7XG5cdFx0XHRcdFx0aGFuZGxlci5jYWxsKHRoaXMsIG5ld1ZhbCk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHR9LCB0aGlzKTtcblx0XHR9XG5cdH1cbn07XG5cbi8qKlxuICogTGlzdGVucyBmb3IgYW5kIHJ1bnMgaGFuZGxlcnMgb24gZ2xvYmFsIGV2ZW50cyB0aGF0IGFyZSBsaXN0ZW5lZCBmb3Igb24gYSBjb21wb25lbnQuXG4gKi9cbmV4cG9ydHMuZ2xvYmFsVHJpZ2dlcnMgPSBmdW5jdGlvbigpIHtcblxuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0dGhpcy5saXN0ZW5UbyhGUkFNRVdPUkssICdhbGwnLCBmdW5jdGlvbiAoZVJvdXRlKSB7XG5cblx0XHQvLyBUcmltIG9mZiBhbGwgYnV0IHRoZSBmaXJzdCBhcmd1bWVudCB0byBwYXNzIHRocm91Z2ggdG8gaGFuZGxlclxuXHRcdHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcblx0XHRhcmdzLnNoaWZ0KCk7XG5cblx0XHQvLyBJdGVyYXRlIHRocm91Z2ggZWFjaCBzdWJzY3JpcHRpb24gb24gdGhpcyBjb21wb25lbnRcblx0XHQvLyBhbmQgbGlzdGVuIGZvciB0aGUgc3BlY2lmaWVkIGdsb2JhbCBldmVudHNcblx0XHRfLmVhY2goc2VsZi5zdWJzY3JpcHRpb25zLCBmdW5jdGlvbihoYW5kbGVyLCBtYXRjaFBhdHRlcm4pIHtcblxuXHRcdFx0Ly8gR3JhYiByZWdleCBhbmQgcGFyYW0gcGFyc2luZyBsb2dpYyBmcm9tIEJhY2tib25lIGNvcmVcblx0XHRcdHZhciBleHRyYWN0UGFyYW1zID0gQmFja2JvbmUuUm91dGVyLnByb3RvdHlwZS5fZXh0cmFjdFBhcmFtZXRlcnMsXG5cdFx0XHRcdGNhbGN1bGF0ZVJlZ2V4ID0gQmFja2JvbmUuUm91dGVyLnByb3RvdHlwZS5fcm91dGVUb1JlZ0V4cDtcblxuXHRcdFx0Ly8gVHJpbSB0cmFpbGluZ1xuXHRcdFx0bWF0Y2hQYXR0ZXJuID0gbWF0Y2hQYXR0ZXJuLnJlcGxhY2UoL1xcLyokL2csICcnKTtcblx0XHRcdC8vIGFuZCBlciBzb3J0IG9mLi4gbGVhZGluZy4uIHNsYXNoZXNcblx0XHRcdG1hdGNoUGF0dGVybiA9IG1hdGNoUGF0dGVybi5yZXBsYWNlKC9eKFsjfiVdKVxcLyovZywgJyQxJyk7XG5cdFx0XHQvLyBUT0RPOiBvcHRpbWl6YXRpb24tIHRoaXMgcmVhbGx5IG9ubHkgaGFzIHRvIGJlIGRvbmUgb25jZSwgb24gcmFpc2UoKSwgd2Ugc2hvdWxkIGRvIHRoYXRcblxuXG5cdFx0XHQvLyBDb21lIHVwIHdpdGggcmVnZXggZm9yIHRoaXMgbWF0Y2hQYXR0ZXJuXG5cdFx0XHR2YXIgcmVnZXggPSBjYWxjdWxhdGVSZWdleChtYXRjaFBhdHRlcm4pO1xuXG5cdFx0XHQvLyBJZiB0aGlzIG1hdGNoUGF0ZXJuIGlzIHRoaXMgaXMgbm90IGEgbWF0Y2ggZm9yIHRoZSBldmVudCxcblx0XHRcdC8vIGBjb250aW51ZWAgaXQgYWxvbmcgdG8gaXQgY2FuIHRyeSB0aGUgbmV4dCBtYXRjaFBhdHRlcm5cblx0XHRcdGlmICghZVJvdXRlLm1hdGNoKHJlZ2V4KSkgcmV0dXJuO1xuXG5cdFx0XHQvLyBQYXJzZSBwYXJhbWV0ZXJzIGZvciB1c2UgYXMgYXJncyB0byB0aGUgaGFuZGxlclxuXHRcdFx0Ly8gKG9yIGFuIGVtcHR5IGxpc3QgaWYgbm9uZSBleGlzdClcblx0XHRcdHZhciBwYXJhbXMgPSBleHRyYWN0UGFyYW1zKHJlZ2V4LCBlUm91dGUpO1xuXG5cdFx0XHQvLyBIYW5kbGUgc3RyaW5nIHJlZGlyZWN0cyB0byBmdW5jdGlvbiBuYW1lc1xuXHRcdFx0aWYgKCFfLmlzRnVuY3Rpb24oaGFuZGxlcikpIHtcblx0XHRcdFx0aGFuZGxlciA9IHNlbGZbaGFuZGxlcl07XG5cblx0XHRcdFx0aWYgKCFoYW5kbGVyKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgdHJpZ2dlciBzdWJzY3JpcHRpb24gYmVjYXVzZSBvZiB1bmtub3duIGhhbmRsZXI6ICcgKyBoYW5kbGVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBCaW5kIGNvbnRleHQgYW5kIGFyZ3VtZW50cyB0byBzdWJzY3JpcHRpb24gaGFuZGxlclxuXHRcdFx0aGFuZGxlci5hcHBseShzZWxmLCBfLnVuaW9uKGFyZ3MsIHBhcmFtcykpO1xuXG5cdFx0fSk7XG5cdH0pO1xufTtcbiIsIi8qKlxuICogU2FmZWx5IHphcCBldmVyeSB0cmFjZSBhYm91dCB0aGlzIGNvbXBvbmVudCBmcm9tIG1lbW9yeS5cbiAqL1xuXG52YXIgaGVscGVycyA9IHJlcXVpcmUoJy4vaGVscGVycycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNsb3NlKCkge1xuXG5cdEZSQU1FV09SSy5kZWJ1ZygnQ2xvc2VkICcgKyB0aGlzLmlkICsgJyBjb21wb25lbnQuJyk7XG5cdHZhciBzZWxmID0gdGhpcztcblxuXHQvLyBDYW5jZWwgY3VycmVudCByZW5kZXIgYW5kIGNsb3NlIGpvYnMsIGlmIHRoZXkncmUgcnVubmluZ1xuXHRpZiAodGhpcy5fcmVuZGVyaW5nKSB7XG5cdFx0c2VsZi5fcmVuZGVyaW5nQ2FuY2VsZWQgPSB0cnVlO1xuXHRcdHRoaXMuY2FuY2VsUmVuZGVyKCk7XG5cdFx0c2VsZi5fcmVuZGVyaW5nID0gZmFsc2U7XG5cdH1cblx0aWYgKHRoaXMuX2Nsb3NpbmcpIHtcblx0XHR0aGlzLmNhbmNlbENsb3NlKCk7XG5cdFx0c2VsZi5fY2xvc2luZyA9IGZhbHNlO1xuXHR9XG5cblx0Ly8gTG9jayBhY2Nlc3MgdG8gY2xvc2UoKVxuXHR0aGlzLl9jbG9zaW5nID0gdHJ1ZTtcblxuXHR0aGlzLmJlZm9yZUNsb3NlKGZ1bmN0aW9uICgpIHtcblxuXHRcdC8vID4gTk9URTogYHRoaXMuX2Nsb3Npbmc9ZmFsc2VgIGNhbiBhbmQgcHJvYmFibHkgc2hvdWxkIGJlIHJlbW92ZWQsXG5cdFx0Ly8gPiBzaW5jZSBtdXRleCBpcyB1bm5lY2Vzc2FyeSBub3cgdGhhdCB0aGUgY29tcG9uZW50IGlzIHVwIGZvciBnYXJiYWdlIGNvbGxlY3Rpb25cblx0XHQvLyA+IFdhaXRpbmcgdG8gZG8gdGhpcyB1bnRpbCBpdCBjYW4gYmUgdGVzdGVkIGZ1cnRoZXJcblxuXHRcdC8vIFVubG9jayBjbG9zZSgpXG5cdFx0c2VsZi5fY2xvc2luZyA9IGZhbHNlO1xuXG5cdFx0Ly8gU3RvcCBsaXN0ZW5pbmcgdG8gYWxsIGdsb2JhbCB0cmlnZ2VycyAoJXwjKVxuXG5cdFx0Ly8gQ2xvc2UgYWxsIGNoaWxkIGNvbXBvbmVudHNcblxuXHRcdGhlbHBlcnMuZW1wdHlBbGxSZWdpb25zLmNhbGwoc2VsZik7XG5cblx0XHQvLyBDYWxsIG5hdGl2ZSBgQmFja2JvbmUuVmlldy5wcm90b3R5cGUucmVtb3ZlKClgXG5cdFx0Ly8gdG8gdW5kZWxlZ2F0ZSBldmVudHMsIGV0Yy5cblx0XHRzZWxmLnJlbW92ZSgpO1xuXG5cdH0pO1xufTtcbiIsIlxudmFyIF9iaW5kaW5ncyA9IHtcblxuXHR0ZXh0OiB7XG5cdFx0cmVnZXhwOiAvYmluZC10ZXh0Lyxcblx0XHRmbjogZnVuY3Rpb24gKCRlbCwgbW9kZWwpIHtcblx0XHRcdHZhciByYXcgPSAkYm91bmRFbC5hdHRyKCdiaW5kLXRleHQnKTtcblx0XHRcdHZhciBjbGVhbiA9IHJhdy5yZXBsYWNlKC9eQC8sICcnKTtcblx0XHRcdCRib3VuZEVsLnRleHQoIG1vZGVsLmdldChjbGVhbikgKTtcblx0XHR9XG5cdH0sXG5cblx0J2NsYXNzJzoge1xuXHRcdHJlZ2V4cDogL2JpbmRcXC1jbGFzc1xcLShbXi1dKykvLFxuXHRcdGZuOiBmdW5jdGlvbiAoJGVsLCBtb2RlbCwgbWF0Y2hlcykge1xuXHRcdFx0Ly8gUmVnZXhwIG1hdGNoZXMgZm9yIHdpbGRjYXJkIHBhcmFtcyBpbiBhdHRyaWJ1dGUgbWF0Y2ggZXhwcmVzc2lvblxuXHRcdFx0dmFyIGNsYXNzTmFtZSA9IG1hdGNoZXNbMV07XG5cblx0XHRcdHZhciByYXcgPSAkYm91bmRFbC5hdHRyKCdiaW5kLWNsYXNzLScgKyBjbGFzc05hbWUpO1xuXHRcdFx0dmFyIGNsZWFuID0gcmF3LnJlcGxhY2UoL15ALywgJycpO1xuXHRcdFx0aWYgKCBtb2RlbC5nZXQoY2xlYW4pICkge1xuXHRcdFx0XHQkYm91bmRFbC5hZGRDbGFzcyhjbGFzc05hbWUpO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdCRib3VuZEVsLnJlbW92ZUNsYXNzKGNsYXNzTmFtZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59O1xuXG5cbi8qKlxuICogSGVscGVyIGZ1bmN0aW9ucyB1c2VkIGJ5IGNvbXBvbmVudHNcbiAqL1xuXG52YXIgaGVscGVycyA9IG1vZHVsZS5leHBvcnRzID0ge1xuXG5cblxuXHQvKipcblx0ICogUmVuZGVyIG1vZGVsIGJpbmRpbmdzLlxuXHQgKiAgICsgYGJpbmQtdGV4dGBcblx0ICogICArIG1vcmUgdG8gY29tZVxuXHQgKlxuXHQgKiBDYWxsZWQgYnkgQ29tcG9uZW50IHdoZW4gaXRzIG1vZGVsIGNoYW5nZXMuXG5cdCAqL1xuXHRyZW5kZXJEYXRhQmluZGluZ3M6IGZ1bmN0aW9uICgpIHtcblx0XHRGUkFNRVdPUksuZGVidWcoJ1JlbmRlcmluZyBkYXRhIGJpbmRpbmdzIGZvciAnLCB0aGlzLmlkLCdjb21wb25lbnQuLi4nKTtcblxuXHRcdC8vIEVuc3VyZSB0aGF0IG1vZGVsIGV4aXN0c1xuXHRcdGlmICghdGhpcy5tb2RlbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFxuXHRcdFx0XHQnVHJ5aW5nIHRvIGJvb3RzdHJhcCBkYXRhIGJpbmRpbmdzIGZvciBjb21wb25lbnQgKCcgKyB0aGlzLmlkICsgJyksICcgK1xuXHRcdFx0XHQnYnV0IGl0IGhhcyBubyBtb2RlbCEnKTtcblx0XHR9XG5cdFx0dmFyIG1vZGVsID0gdGhpcy5tb2RlbDtcblxuXHRcdC8vIGpRdWVyeSBzZWxlY3RvciBmb3IgZ3JhYmJpbmcgYWxsIGVsZW1lbnRzIHcvIGRhdGEgYmluZGluZ3Ncblx0XHR2YXIgYmluZGluZ1NlbGVjdG9yID0gJ1tiaW5kLXRleHRdLCA6bWF0Y2hBdHRyKFwiXmJpbmQtY2xhc3MtKiRcIiknO1xuXG5cdFx0Ly8gR2V0IGVsZW1lbnRzIGluIHRoaXMgY29tcG9uZW50IHdoaWNoIGhhdmUgZGF0YSBiaW5kaW5nc1xuXHRcdC8vIChpZ25vcmVzIGNvbnRlbnRzIG9mIHJlZ2lvbnMgaWYgdGhleSBleGlzdClcblx0XHR2YXIgJGJvdW5kRWxlbWVudHMgPSBfJHNlbGVjdE91dGVyLmNhbGwodGhpcywgYmluZGluZ1NlbGVjdG9yKTtcblxuXHRcdC8vIExvb3AgdGhyb3VnaCBlYWNoIGJvdW5kIGF0dHJpYnV0ZSBvZiBlYWNoIGJvdW5kIGVsZW1lbnRcblx0XHQvLyBhbmQgY2FsbCB0aGUgYXBwcm9wcmlhdGUgcmVuZGVyIG1ldGhvZC5cblx0XHQkYm91bmRFbGVtZW50cy5lYWNoKGZ1bmN0aW9uIGVhY2hCb3VuZEVsZW1lbnQgKCkge1xuXHRcdFx0JGJvdW5kRWwgPSAkKHRoaXMpO1xuXG5cdFx0XHR2YXIgYWxsQXR0cmlidXRlcyA9ICRib3VuZEVsWzBdLmF0dHJpYnV0ZXM7XG5cdFx0XHRfLmVhY2goYWxsQXR0cmlidXRlcywgZnVuY3Rpb24gKGF0dHIpIHtcblx0XHRcdFx0dmFyIGF0dHJOYW1lID0gYXR0ci5ub2RlTmFtZTtcblxuXHRcdFx0XHRfLmVhY2goX2JpbmRpbmdzLCBmdW5jdGlvbiBlYWNoQmluZGluZ0Zvcm11bGEgKCBiaW5kaW5nICkge1xuXHRcdFx0XHRcdHZhciBtYXRjaGVzID0gYXR0ck5hbWUubWF0Y2goYmluZGluZy5yZWdleHApO1xuXHRcdFx0XHRcdGlmICggbWF0Y2hlcyApIHtcblx0XHRcdFx0XHRcdGJpbmRpbmcuZm4oJGJvdW5kRWwsIG1vZGVsLCBtYXRjaGVzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0sXG5cblxuXG5cdC8qKlxuXHQgKiBJZiBhbnkgcmVnaW9ucyBleGlzdCBpbiB0aGlzIGNvbXBvbmVudCxcblx0ICogZW1wdHkgdGhlbSwgYW5kIHRoZW4gZGVsZXRlIHRoZW1cblx0ICovXG5cdGVtcHR5QWxsUmVnaW9uczogZnVuY3Rpb24oKSB7XG5cdFx0Xy5lYWNoKHRoaXMucmVnaW9ucywgZnVuY3Rpb24gKHJlZ2lvbiwga2V5KSB7XG5cdFx0XHRyZWdpb24uZW1wdHkoKTtcblx0XHRcdGRlbGV0ZSB0aGlzLnJlZ2lvbnNba2V5XTtcblx0XHR9LCB0aGlzKTtcblx0fSxcblxuXHQvKipcblx0ICogSW5zdGFudGlhdGUgcmVnaW9uIGNvbXBvbmVudHMgYW5kIGFwcGVuZCBhbnkgZGVmYXVsdFxuXHQgKiB0ZW1wbGF0ZXMvY29tcG9uZW50cyB0byB0aGUgRE9NXG5cdCAqL1xuXHRyZW5kZXJSZWdpb25zOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0XHRoZWxwZXJzLmVtcHR5QWxsUmVnaW9ucygpO1xuXG5cdFx0Ly8gRGV0ZWN0IGNoaWxkIHJlZ2lvbnMgaW4gdGVtcGxhdGVcblx0XHR2YXIgJHJlZ2lvbnMgPSB0aGlzLiQoJ3JlZ2lvbiwgW2RhdGEtcmVnaW9uXScpO1xuXHRcdCRyZWdpb25zLmVhY2goZnVuY3Rpb24gKGksIGVsKSB7XG5cblx0XHRcdC8vIFByb3ZpZGUgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkgZm9yXG5cdFx0XHQvLyBgZGVmYXVsdGAsIGBjb250ZW50c2AgYW5kIGB0ZW1wbGF0ZWAgbm90YXRpb25cblx0XHRcdC8vIE5vcm1hbGl6ZXMgbm90YXRpb24gdG8gYGNvbnRlbnRzYCBhdHRyaWJ1dGUuXG5cdFx0XHR2YXIgY29tcG9uZW50SWQgPSAkKGVsKS5hdHRyKCdkZWZhdWx0Jyk7XG5cdFx0XHRjb21wb25lbnRJZCA9IGNvbXBvbmVudElkIHx8ICQoZWwpLmF0dHIoJ2NvbnRlbnRzJyk7XG5cdFx0XHRjb21wb25lbnRJZCA9IGNvbXBvbmVudElkIHx8ICQoZWwpLmF0dHIoJ3RlbXBsYXRlJyk7XG5cdFx0XHQkKGVsKS5hdHRyKCdjb250ZW50cycsIGNvbXBvbmVudElkKTtcblxuXHRcdFx0Ly8gR2VuZXJhdGUgYSByZWdpb24gaW5zdGFuY2UgZnJvbSB0aGUgZWxlbWVudFxuXHRcdFx0Ly8gKG1vZGlmeWluZyB0aGUgRE9NIGFzIG5lY2Vzc2FyeSlcblx0XHRcdHZhciByZWdpb24gPSBGUkFNRVdPUksuUmVnaW9uLmZyb21FbGVtZW50KGVsLCBzZWxmKTtcblxuXHRcdFx0Ly8gSWYgcmVnaW9uIGhhcyBubyBpZCwgZ2VuZXJhdGUgYSB1bmlxdWUgcmVnaW9uIGlkIHcvaSB0aGlzIGNvbXBvbmVudFxuXHRcdFx0Ly8gdGhhdCBpcyB1bmxpa2VseSB0byBjb2xsaWRlIHdpdGggbXkgb3RoZXIgbmFtZWQgcmVnaW9uc1xuXHRcdFx0aWYgKCFyZWdpb24uaWQpIHtcblx0XHRcdFx0cmVnaW9uLmlkID0gJycrXG5cdFx0XHRcdFx0RlJBTUVXT1JLLm9wdGlvbnMuZnJhbWV3b3JrSWQgK1xuXHRcdFx0XHRcdCdfX2Fub255bW91c19yZWdpb25fXycgK1xuXHRcdFx0XHRcdHNlbGYuYW5vbnltb3VzUmVnaW9uQ291bnRlcjtcblxuXHRcdFx0XHQvLyBJbmNyZW1lbnQgY291bnRlciBmb3IgbmV4dCB0aW1lXG5cdFx0XHRcdHNlbGYuYW5vbnltb3VzUmVnaW9uQ291bnRlcisrO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBLZWVwIHRyYWNrIG9mIHJlZ2lvbnMsIHNpbmNlIHdlIGFyZSB0aGUgcGFyZW50IGNvbXBvbmVudFxuXHRcdFx0c2VsZi5yZWdpb25zW3JlZ2lvbi5pZF0gPSByZWdpb247XG5cblx0XHRcdC8vIEFzIGxvbmcgYXMgdGhlcmUgYXJlIG5vIGNvbGxpc2lvbnMsXG5cdFx0XHQvLyBwcm92aWRlIGEgZnJpZW5kbHkgcmVmZXJlbmNlIHRvIHRoZSByZWdpb24gb24gdGhlIHRvcCBsZXZlbCBvZiB0aGUgY29sbGVjdGlvblxuXHRcdFx0aWYgKCFzZWxmW3JlZ2lvbi5pZF0pIHtcblx0XHRcdFx0c2VsZltyZWdpb24uaWRdID0gcmVnaW9uO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0IHRlbXBsYXRlIEhUTUwgYW5kIGRhdGEgaW50byBhIGNvbXBpbGVkICR0ZW1wbGF0ZVxuXHQgKi9cblx0Y29tcGlsZVRlbXBsYXRlOiBmdW5jdGlvbigpIHtcblxuXHRcdC8vIENyZWF0ZSB0ZW1wbGF0ZSBkYXRhIGNvbnRleHQgYnkgcHJvdmlkaW5nIGFjY2VzcyB0byB0aGUgZ2xvYmFsIERhdGEgb2JqZWN0LFxuXHRcdC8vIEFsc28gZm9sZCBpbiB0aGUgbW9kZWwgYXNzb2NpYXRlZCB3aXRoIHRoaXMgY29tcG9uZW50LCBpZiB0aGVyZSBpcyBvbmVcblx0XHR2YXIgdGVtcGxhdGVDb250ZXh0ID0gXy5leHRlbmQoe1xuXG5cdFx0XHQvLyBBbGxvd3MgeW91IHRvIGdldCBhIGhvbGQgb2YgZGF0YSxcblx0XHRcdC8vIGJ1dCB1c2UgYSBkZWZhdWx0IHZhbHVlIGlmIGl0IGRvZXNuJ3QgZXhpc3Rcblx0XHRcdGdldDogZnVuY3Rpb24gKGtleSwgZGVmYXVsdFZhbCkge1xuXHRcdFx0XHR2YXIgdmFsID0gdGVtcGxhdGVDb250ZXh0W2tleV07XG5cdFx0XHRcdGlmICh0eXBlb2YgdmFsID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRcdHZhbCA9IGRlZmF1bHRWYWw7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHZhbDtcblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0Ly8gQWxsIEZSQU1FV09SSy5kYXRhIGlzIGF2YWlsYWJsZSBpbiBldmVyeSB0ZW1wbGF0ZVxuXHRcdEZSQU1FV09SSy5kYXRhKTtcblxuXHRcdC8vIElmIGEgbW9kZWwgaXMgcHJvdmlkZWQgZm9yIHRoaXMgY29tcG9uZW50LCBtYWtlIGl0IGF2YWlsYWJsZSBpbiB0aGlzIHRlbXBsYXRlXG5cdFx0aWYgKHRoaXMubW9kZWwpIHtcblx0XHRcdF8uZXh0ZW5kKHRlbXBsYXRlQ29udGV4dCwgdGhpcy5tb2RlbC5hdHRyaWJ1dGVzKTtcblx0XHR9XG5cblx0XHQvLyBUZW1wbGF0ZSB0aGUgSFRNTCB3aXRoIHRoZSBkYXRhXG5cdFx0dmFyIGh0bWw7XG5cdFx0dHJ5IHtcblx0XHRcdC8vIEFjY2VwdCBwcmVjb21waWxlZCB0ZW1wbGF0ZXNcblx0XHRcdGlmIChfLmlzRnVuY3Rpb24odGhpcy50ZW1wbGF0ZSkpIHtcblx0XHRcdFx0aHRtbCA9IHRoaXMudGVtcGxhdGUodGVtcGxhdGVDb250ZXh0KTtcblx0XHRcdH1cblx0XHRcdC8vIE9yIHJhdyBzdHJpbmdzXG5cdFx0XHRlbHNlIGh0bWwgPSBfLnRlbXBsYXRlKHRoaXMudGVtcGxhdGUsIHRlbXBsYXRlQ29udGV4dCk7XG5cdFx0fVxuXHRcdGNhdGNoIChlKSB7XG5cdFx0XHR2YXIgc3RyID0gZSxcblx0XHRcdFx0c3RhY2sgPSAnJztcblxuXHRcdFx0aWYgKGUgaW5zdGFuY2VvZiBFcnJvcikge1xuXHRcdFx0XHRzdHIgPSAgZS50b1N0cmluZygpO1xuXHRcdFx0XHRzdGFjayA9IGUuc3RhY2s7XG5cdFx0XHR9XG5cblx0XHRcdEZSQU1FV09SSy5lcnJvcih0aGlzLmlkICsgJyA6OiBDYW5ub3QgcmVuZGVyKCkgdGVtcGxhdGUgKHByb2JhYmx5IG1pc3NpbmcgZGF0YSkuXFxuXFxuR290IHRoaXMgZXJyb3IgOjpcXG4nK3N0ciwnXFxuJyk7XG5cdFx0XHRpZiAoaHRtbCkge0ZSQU1FV09SSy52ZXJib3NlKCdUZW1wbGF0ZSA6OiAnICsgaHRtbCk7fVxuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UoJ0Z1bGwgVGVtcGxhdGUgRXJyb3I6JyArICdcXG4nLHN0YWNrKTtcblx0XHRcdEZSQU1FV09SSy52ZXJib3NlKCdcXG5cXG5Nb3JlIGluZm9ybWF0aW9uOicsICdcXG5cXG5UZW1wbGF0ZSBjb250ZXh0IDo6Jyx0ZW1wbGF0ZUNvbnRleHQsICdcXG5cXG50aGlzLm1vZGVsOjonLCB0aGlzLm1vZGVsKTtcblx0XHRcdGh0bWwgPSBfLmlzU3RyaW5nKHRoaXMudGVtcGxhdGUpID8gdGhpcy50ZW1wbGF0ZSA6IHN0cjtcblx0XHR9XG5cblx0XHRyZXR1cm4gaHRtbDtcblx0fVxuXG59O1xuXG5cblxuXG4vLyBQcml2YXRlIGludHJhLWhlbHBlciBtZXRob2RzXG5cblxuXG4vKipcbiAqIExvb2t1cCBzdWl0YWJsZSBlbGVtZW50cyB3aXRoaW4gdGhpcyBjb21wb25lbnQncyAkZWwgY29udGV4dC5cbiAqIElnbm9yZSByZWdpb25zLCBhbmQgaW5jbHVkZSB0aGUgdG9wLWxldmVsIGVsZW1lbnQuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGJpbmRpbmdTZWxlY3RvciAtIERPTSBzZWxlY3RvciB0byB1c2VcbiAqL1xudmFyIF8kc2VsZWN0T3V0ZXIgPSBmdW5jdGlvbiAoIGJpbmRpbmdTZWxlY3RvciApIHtcblxuXHQvLyBMb29rdXAgbWF0Y2hlc1xuXHR2YXIgJG1hdGNoZXMgPSB0aGlzLiQoYmluZGluZ1NlbGVjdG9yKTtcblxuXHQvLyBJZiB0b3AtbGV2ZWwgZWxlbWVudCBpbiB0ZW1wbGF0ZSBoYXMgYSBkYXRhLWJpbmRpbmcsIGluY2x1ZGUgaXRcblx0aWYgKHRoaXMuJGVsLmZpbHRlcihiaW5kaW5nU2VsZWN0b3IpKSB7XG5cdFx0JG1hdGNoZXMgPSAkLm1lcmdlKCRtYXRjaGVzLCB0aGlzLiRlbCk7XG5cdH1cblxuXHQvLyBPbWl0IGFueXRoaW5nIGluc2lkZSBhIHJlZ2lvbiwgc2luY2UgdGhvc2UgYmluZGluZ3Mgd2lsbCBoYXZlIGFscmVhZHlcblx0Ly8gYmVlbiB0YWtlbiBjYXJlIG9mIGJ5IG9uZSBvZiB0aGUgZGVzY2VuZGFudCBjb21wb25lbnQocykgd2l0aGluIHRoZSByZWdpb24uXG5cdC8vXG5cdC8vIFRPRE86IG9wdGltaXplIHRvIGV4Y2x1ZGUgdGhlc2UgZWxlbWVudHMgZnJvbSB0aGUgb3JpZ2luYWwgRE9NIHNlbGVjdGlvblxuXHQkbWF0Y2hlcyA9ICRtYXRjaGVzLm5vdCggdGhpcy4kKCdyZWdpb24gKiwgW2RhdGEtcmVnaW9uXSAqJykgKTtcblxuXHRyZXR1cm4gJG1hdGNoZXM7XG59O1xuXG5cblxuLy8gUmVnZXhwcyBmb3IgZGV0ZWN0aW9uIG9mIHdpbGRjYXJkIG5hbWVkIHBhcmFtZXRlcnMgaW4gY3VzdG9tIGVsZW1lbnQgYXR0cmlidXRlIG5hbWVzLlxudmFyIG9wdGlvbmFsUGFyYW0gPSAvXFwoKC4qPylcXCkvZztcbnZhciBuYW1lZFBhcmFtID0gLyhcXChcXD8pPzpcXHcrL2c7XG52YXIgc3BsYXRQYXJhbSA9IC9cXCpcXHcrL2c7XG52YXIgZXNjYXBlUmVnRXhwID0gL1tcXC17fVxcW1xcXSs/LixcXFxcXFxeJHwjXFxzXS9nO1xuXG5cbi8vIEJ1aWxkIHNlbGVjdG9yIGZvciBzdXBlcnNldCBvZiB0aGVzZSBiaW5kaW5nc1xudmFyIF9hdHRyTmFtZVRvUmVnRXhwID0gZnVuY3Rpb24oIGF0dHJFeHByZXNzaW9uICkge1xuXG5cdGF0dHJFeHByZXNzaW9uID0gYXR0ckV4cHJlc3Npb24ucmVwbGFjZShlc2NhcGVSZWdFeHAsICdcXFxcJCYnKVxuXHRcdC5yZXBsYWNlKG9wdGlvbmFsUGFyYW0sICcoPzokMSk/Jylcblx0XHQucmVwbGFjZShuYW1lZFBhcmFtLCBmdW5jdGlvbihtYXRjaCwgb3B0aW9uYWwpIHtcblx0XHRcdHJldHVybiBvcHRpb25hbCA/IG1hdGNoIDogJyhbXlxcL10rKSc7XG5cdFx0fSlcblx0XHQucmVwbGFjZShzcGxhdFBhcmFtLCAnKC4qPyknKTtcblx0cmV0dXJuICdeJyArIGF0dHJFeHByZXNzaW9uICsgJyQnO1xufTtcbnZhciBfZXh0cmFjdFBhcmFtZXRlcnMgPSBmdW5jdGlvbihyZWdleHAsIGF0dHJOYW1lLCBhdHRyRXhwcmVzc2lvbikge1xuXHR2YXIgcGFyYW1WYWx1ZXMgPSByZWdleHAuZXhlYyhhdHRyTmFtZSkuc2xpY2UoMSk7XG5cdHZhciBwYXJhbUtleXMgPSBuYW1lZFBhcmFtLmV4ZWMoYXR0ckV4cHJlc3Npb24pO1xuXG5cdGlmICghcGFyYW1LZXlzIHx8ICFwYXJhbVZhbHVlcykgcmV0dXJuIHt9O1xuXG5cdHZhciBuYW1lZFBhcmFtZXRlcnMgPSB7fTtcblx0Y29uc29sZS5sb2coJ3BhcmFtVmFsdWVzOicscGFyYW1WYWx1ZXMpO1xuXHRfLmVhY2gocGFyYW1WYWx1ZXMsIGZ1bmN0aW9uIGVhY2hNYXRjaGluZ1BpZWNlKCBwYXJhbSwgaSApIHtcblx0XHR2YXIga2V5ID0gcGFyYW1LZXlzW2ldO1xuXHRcdGtleSA9IGtleS5zbGljZSgxKTsgLy8gcmVtb3ZlIGA6YCBmcm9tIG5hbWVkIHBhcmFtXG5cdFx0bmFtZWRQYXJhbWV0ZXJzW2tleV0gPSBwYXJhbVZhbHVlc1tpXTtcblx0fSk7XG5cdHJldHVybiBuYW1lZFBhcmFtZXRlcnM7XG59O1xuXG5cblxuLyoqXG4gKiBSZW5kZXIgYSBzaW5nbGUgYmluZGluZ1xuICovXG52YXIgX3JlbmRlckJpbmRpbmcgPSBmdW5jdGlvbiAoJG1hdGNoZWRFbCwgZG9tQXR0cmlidXRlTmFtZSwgbW9kZWwsIHJlbmRlckZuLCBuYW1lZFBhcmFtcykge1xuXHR2YXIgcmF3QmluZGluZyA9ICRtYXRjaGVkRWwuYXR0ciggZG9tQXR0cmlidXRlTmFtZSApO1xuXHQvLyBJZiBlbGVtZW50IGRvZXNuJ3QgY29udGFpbiB0aGUgc3BlY2lmaWVkIERPTSBhdHRyaWJ1dGUuLi5cblx0Ly8gZmFpbCBzaWxlbnRseS5cblx0aWYgKCAhcmF3QmluZGluZyApIHJldHVybjtcblxuXHQvLyBjb25zb2xlLmxvZygnZ2V0dGluZyAnLGRvbUF0dHJpYnV0ZU5hbWUsJ29uJywkbWF0Y2hlZEVsKTtcblx0dmFyIG1vZGVsQXR0cmlidXRlTmFtZSA9IHJhd0JpbmRpbmcucmVwbGFjZSgvXlxcQC8sICcnKTtcblx0RlJBTUVXT1JLLmRlYnVnKCdGb3VuZCBhIGJpbmRpbmcgOjonLCByYXdCaW5kaW5nLCAnOjonLCBuYW1lZFBhcmFtcyk7XG5cblx0Ly8gSWYgbW9kZWwgZG9lc24ndCBjb250YWluIHRoZSBzcGVjaWZpZWQgYXR0cmlidXRlLi4uXG5cdGlmICggdHlwZW9mIG1vZGVsLmF0dHJpYnV0ZXNbbW9kZWxBdHRyaWJ1dGVOYW1lXSA9PT0gJ3VuZGVmaW5lZCcgKSB7XG5cblx0XHQvLyBmYWlsIHNpbGVudGx5LlxuXHRcdHJldHVybjtcblx0XHQvLyBGUkFNRVdPUksud2FybignQ2Fubm90IGJpbmQgYEAnK21vZGVsQXR0cmlidXRlTmFtZSsnIGZvciB0ZW1wbGF0ZS9jb21wb25lbnQgJyArXG5cdFx0Ly8gXHQnYCcgKyBjb21wb25lbnQuaWQgKydgLlxcbicrXG5cdFx0Ly8gXHQnTm8gc3VjaCBhdHRyaWJ1dGUgZXhpc3RzIGluIHRoZSBjb21wb25lbnRcXCdzIG1vZGVsLidcblx0XHQvLyApO1xuXHR9XG5cblx0Ly8gUmVuZGVyIGEgZGF0YSBiaW5kaW5nXG5cdHZhciBiaW5kaW5nVmFsID0gbW9kZWwuZ2V0KG1vZGVsQXR0cmlidXRlTmFtZSkgfHwgJyc7XG5cdHJlbmRlckZuKCAkbWF0Y2hlZEVsLCBiaW5kaW5nVmFsLCBuYW1lZFBhcmFtcyApO1xufTtcblxuXG4vKipcbiAqIFJlbmRlciB0aGUgc3BlY2lmaWVkIHR5cGUgb2YgZGF0YSBiaW5kaW5nc1xuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gKlx0XHRAb3B0aW9uIHtGdW5jdGlvbn0gcmVuZGVyRm4gKCRlbCwgdmFsLCBwYXJhbXMpXHQtPiBmdW5jdGlvbiB3aGljaCByZW5kZXJzIHRoZSBkYXRhIGJpbmRpbmcgZm9yIHRoZSBzcGVjaWZpZWQgZWxlbWVudFxuICpcdFx0XHRAcGFyYW0ge0pRdWVyeUVsZW1lbnR9ICRlbFxuICpcdFx0XHRAcGFyYW0gez99IHZhbCAtPiB2YWx1ZSBvZiBib3VuZCBtb2RlbCBhdHRyaWJ1dGVcbiAqXHRcdFx0QHBhcmFtIHtPYmplY3R9IHBhcmFtcyAtPiBrZXllZCBvYmplY3Qgb2YgZHluYW1pYyBwYXJhbWV0ZXJzIGZyb20gdGhlIG5hbWUgb2YgdGhlIGF0dHJpYnV0ZSBpdHNlbGZcbiAqXHRcdEBvcHRpb24ge1N0cmluZ30gYXR0cmlidXRlIC0+IG5hbWUgb2YgYm91bmQgYXR0cmlidXRlLCBlLmcuICdiaW5kLXRleHQnXG4gKlx0XHRAb3B0aW9uIHtDb21wb25lbnR9IGNvbXBvbmVudFxuICpcdFx0QG9wdGlvbiB7QmFja2JvbmUuTW9kZWx9IFttb2RlbF0gLSBkZWZhdWx0cyB0byBgY29tcG9uZW50Lm1vZGVsYFxuICovXG52YXIgX3JlbmRlckJpbmRpbmdzID0gZnVuY3Rpb24gKCBvcHRpb25zICkge1xuXHR2YXIgY29tcG9uZW50ID0gb3B0aW9ucy5jb21wb25lbnQ7XG5cdHZhciBhdHRyaWJ1dGVFeHByZXNzaW9uID0gb3B0aW9ucy5hdHRyaWJ1dGU7XG5cdHZhciBtb2RlbCA9IG9wdGlvbnMubW9kZWwgfHwgb3B0aW9ucy5jb21wb25lbnQubW9kZWw7XG5cblxuXHQvLyBDYWxjdWxhdGUgc3RyaW5nIHdoaWNoIGNhbiBiZSBcIm5ldy1lZFwiIGludG8gYSBSZWdFeHBcblx0dmFyIGF0dHJSZWdFeHBTdHIgPSBfYXR0ck5hbWVUb1JlZ0V4cChhdHRyaWJ1dGVFeHByZXNzaW9uKTtcblx0dmFyIGF0dHJSZWdFeHAgPSBuZXcgUmVnRXhwKGF0dHJSZWdFeHBTdHIpO1xuXG5cblx0dmFyIGJvdW5kQXR0clNlbGVjdG9yID0gJzptYXRjaEF0dHIoXCInICsgYXR0clJlZ0V4cFN0ciArICdcIiknO1xuXG5cdC8vIEZpbmQgYWxsIHJlbGV2YW50IGRlc2NlbmRhbnQgZWxlbWVudHNcblx0dmFyICRtYXRjaGVzID0gX2dldCRNYXRjaGVzKGJvdW5kQXR0clNlbGVjdG9yLCBjb21wb25lbnQpO1xuXG5cdC8vIEVhcmx5IGV4aXQgZm9yIHNpbXBsZSBiaW5kaW5ncyAody9vIGJvdW5kIHBhcmFtcylcblx0aWYgKCAhYXR0cmlidXRlRXhwcmVzc2lvbi5tYXRjaCgvXFw6LykpIHtcblx0XHQkbWF0Y2hlcy5lYWNoKGZ1bmN0aW9uICgpIHtcblx0XHRcdF9yZW5kZXJCaW5kaW5nKCQodGhpcyksIGF0dHJpYnV0ZUV4cHJlc3Npb24sIG1vZGVsLCBvcHRpb25zLnJlbmRlckZuLCB7fSk7XG5cblx0XHR9KTtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRjb25zb2xlLmxvZygnXFxuUmVuZGVyaW5nIHBhcmFtZXRlcml6ZWQgZGF0YSBiaW5kaW5nOiAnLGF0dHJSZWdFeHApO1xuXG5cdC8vIFRPRE86IGJhdGNoIGl0IHVwIHNvIHdlIG9ubHkgZG8gb25lIERPTSBxdWVyeVxuXHQkbWF0Y2hlcy5lYWNoKGZ1bmN0aW9uIGVhY2hFbGVtZW50V2l0aEFCaW5kaW5nICgpIHtcblx0XHR2YXIgJG1hdGNoZWRFbCA9ICQodGhpcyk7XG5cblx0XHQvLyBHZXQgYWxsIGF0dHJpYnV0ZXMgZm9yIHRoaXMgJGVsIGFuZCBmaWx0ZXIgYSBzZXQgb2YgbWF0Y2hpbmcgbmFtZXMvcGFyYW1zXG5cdFx0dmFyIGFsbERPTUF0dHJOYW1lcyA9IF8ubWFwKCAkbWF0Y2hlZEVsWzBdLmF0dHJpYnV0ZXMsIGZ1bmN0aW9uIChlbCkge1xuXHRcdFx0cmV0dXJuIGVsLm5vZGVOYW1lO1xuXHRcdH0pO1xuXHRcdGNvbnNvbGUubG9nKCdhbGxET01BdHRyTmFtZXMgZm9yIGVsJyxhbGxET01BdHRyTmFtZXMsICRtYXRjaGVkRWwpO1xuXHRcdHZhciBtYXRjaGluZ0RPTUF0dHJzID0ge307XG5cdFx0Xy5lYWNoKCBhbGxET01BdHRyTmFtZXMsIGZ1bmN0aW9uIGVhY2hBdHRyaWJ1dGUgKCBkb21BdHRyTmFtZSApIHtcblx0XHRcdC8vIGNvbnNvbGUubG9nKCdjaGVja2luZycsZG9tQXR0ck5hbWUpO1xuXHRcdFx0aWYgKCBkb21BdHRyTmFtZS5tYXRjaChhdHRyUmVnRXhwKSkge1xuXHRcdFx0XHRtYXRjaGluZ0RPTUF0dHJzW2RvbUF0dHJOYW1lXSA9IF9leHRyYWN0UGFyYW1ldGVycyggYXR0clJlZ0V4cCwgZG9tQXR0ck5hbWUsIGF0dHJpYnV0ZUV4cHJlc3Npb24gKTtcblx0XHRcdFx0Ly8gY29uc29sZS5sb2coJywgZ290JyxtYXRjaGluZ0RPTUF0dHJzW2RvbUF0dHJOYW1lXSwgJyAoKCgnLGRvbUF0dHJOYW1lLCBhdHRyaWJ1dGVFeHByZXNzaW9uKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXG5cdFx0Y29uc29sZS5sb2coJyAqKioqIG1hdGNoaW5nRE9NQXR0cnMgOjonLCBtYXRjaGluZ0RPTUF0dHJzKTtcblxuXHRcdHRocm93IG5ldyBFcnJvcignaHdhYWEnKTtcblx0XHRfLmVhY2gobWF0Y2hpbmdET01BdHRycywgZnVuY3Rpb24gKCBuYW1lZFBhcmFtcywgZG9tQXR0cmlidXRlTmFtZSApIHtcblx0XHRcdF9yZW5kZXJCaW5kaW5nKCRtYXRjaGVkRWwsIGRvbUF0dHJpYnV0ZU5hbWUsIG1vZGVsLCBvcHRpb25zLnJlbmRlckZuLCBuYW1lZFBhcmFtcyk7XG5cdFx0fSk7XG5cblx0fSk7XG59O1xuXG5cblxuXG5cblxuLyoqXG4gKiBDcmVhdGUgcHNldWRvLXNlbGVjdG9yIGZvciBnZXR0aW5nIHdpbGRjYXJkIGRhdGEgYXR0cmlidXRlcy5cbiAqXG4gKiBVc2FnZTpcbiAqICQoXCI6bWF0Y2hBdHRyKCdeZGF0YS0nKVwiKVxuICpcbiAqIFNvdXJjZTpcbiAqIGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9hLzEzMjIyNTA5LzQ4NjU0N1xuICovXG5qUXVlcnkuZXhwci5wc2V1ZG9zLm1hdGNoQXR0ciA9ICQuZXhwci5jcmVhdGVQc2V1ZG8oZnVuY3Rpb24oYXJnKSB7XG5cbiAgICB2YXIgcmVnZXhwID0gbmV3IFJlZ0V4cChhcmcpO1xuICAgIHJldHVybiBmdW5jdGlvbihlbGVtKSB7XG4gICAgICAgIGZvcih2YXIgaSA9IDA7IGkgPCBlbGVtLmF0dHJpYnV0ZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBhdHRyID0gZWxlbS5hdHRyaWJ1dGVzW2ldO1xuICAgICAgICAgICAgaWYocmVnZXhwLnRlc3QoYXR0ci5uYW1lKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9O1xufSk7XG5cbiIsIi8qKlxuICogQ29tcG9uZW50IGlzIGFuIGV4dGVuZGVkIGBCYWNrYm9uZS5WaWV3YC4gSXQgYWRkIGZlYXR1cmVzIHN1Y2ggYXMgYXV0b21hdGljIGV2ZW50IGJpbmRpbmcsXG4gKiByZW5kZXJpbmcsIGxpZmVjeWNsZSBob29rcyBhbmQgZXZlbnRzLCBhbmQgbW9yZS5cbiAqL1xuXG52YXIgbGlmZWN5Y2xlSG9va3MgICAgID0gcmVxdWlyZSgnLi9saWZlY3ljbGVIb29rcycpLFxuXHRsaWZlY3ljbGVFdmVudHMgICAgPSByZXF1aXJlKCcuL2xpZmVjeWNsZUV2ZW50cycpLFxuXHRiaW5kRXZlbnRzICAgICAgICAgPSByZXF1aXJlKCcuL2JpbmRFdmVudHMnKSxcblx0Y2xvc2UgICAgICAgICAgICAgID0gcmVxdWlyZSgnLi9jbG9zZScpLFxuXHRyZW5kZXIgICAgICAgICAgICAgPSByZXF1aXJlKCcuL3JlbmRlcicpLFxuXHRyZW5kZXJDb2xsZWN0aW9uICAgPSByZXF1aXJlKCcuL3JlbmRlckNvbGxlY3Rpb24nKSxcblx0dmFsaWRhdGVEZWZpbml0aW9uID0gcmVxdWlyZSgnLi92YWxpZGF0ZURlZmluaXRpb24nKTtcblxuQ29tcG9uZW50ID0gbW9kdWxlLmV4cG9ydHMgPSBCYWNrYm9uZS5WaWV3LmV4dGVuZCgpO1xuXG5cbl8uZXh0ZW5kKENvbXBvbmVudC5wcm90b3R5cGUsIHtcblxuXHQvLyBMaWZlY3ljbGUgSG9va3Ncblx0YmVmb3JlUmVuZGVyOiBmdW5jdGlvbihjYikge1xuXHRcdGxpZmVjeWNsZUhvb2tzLmJlZm9yZVJlbmRlci5jYWxsKHRoaXMsIGNiKTtcblx0fSxcblx0YmVmb3JlQ2xvc2U6IGZ1bmN0aW9uKGNiKSB7XG5cdFx0bGlmZWN5Y2xlSG9va3MuYmVmb3JlQ2xvc2UuY2FsbCh0aGlzLCBjYik7XG5cdH0sXG5cdGFmdGVyUmVuZGVyOiBmdW5jdGlvbigpIHtcblx0XHRsaWZlY3ljbGVIb29rcy5hZnRlclJlbmRlci5jYWxsKHRoaXMpO1xuXHR9LFxuXHRjYW5jZWxSZW5kZXI6IGZ1bmN0aW9uKCkge1xuXHRcdGxpZmVjeWNsZUhvb2tzLmNhbmNlbFJlbmRlci5jYWxsKHRoaXMpO1xuXHR9LFxuXHRjYW5jZWxDbG9zZTogZnVuY3Rpb24oKSB7XG5cdFx0bGlmZWN5Y2xlSG9va3MuY2FuY2VsQ2xvc2UuY2FsbCh0aGlzKTtcblx0fSxcblxuXHQvLyBMaWZlY3ljbGUgRXZlbnRzXG5cdGFmdGVyQ2hhbmdlOiBmdW5jdGlvbihtb2RlbCwgb3B0aW9ucykge1xuXHRcdGxpZmVjeWNsZUV2ZW50cy5hZnRlckNoYW5nZS5jYWxsKHRoaXMsIG1vZGVsLCBvcHRpb25zKTtcblx0fSxcblx0YWZ0ZXJBZGQ6IGZ1bmN0aW9uKG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zKSB7XG5cdFx0bGlmZWN5Y2xlRXZlbnRzLmFmdGVyQWRkLmNhbGwodGhpcywgbW9kZWwsIGNvbGxlY3Rpb24sIG9wdGlvbnMpO1xuXHR9LFxuXHRhZnRlclJlbW92ZTogZnVuY3Rpb24obW9kZWwsIGNvbGxlY3Rpb24sIG9wdGlvbnMpIHtcblx0XHRsaWZlY3ljbGVFdmVudHMuYWZ0ZXJSZW1vdmUuY2FsbCh0aGlzLCBtb2RlbCwgY29sbGVjdGlvbiwgb3B0aW9ucyk7XG5cdH0sXG5cdGFmdGVyUmVzZXQ6IGZ1bmN0aW9uKGNvbGxlY3Rpb24sIG9wdGlvbnMpIHtcblx0XHRsaWZlY3ljbGVFdmVudHMuYWZ0ZXJSZXNldC5jYWxsKHRoaXMsIGNvbGxlY3Rpb24sIG9wdGlvbnMpO1xuXHR9LFxuXG5cdC8vIFByb3RvdHlwZSBtZXRob2RzLlxuXHRjbG9zZTogZnVuY3Rpb24oKSB7XG5cdFx0Y2xvc2UuY2FsbCh0aGlzKTtcblx0fSxcblx0cmVuZGVyOiBmdW5jdGlvbihhdEluZGV4KSB7XG5cdFx0cmVuZGVyLmNhbGwodGhpcywgYXRJbmRleCk7XG5cdH0sXG5cblx0cmVuZGVyQ29sbGVjdGlvbjogZnVuY3Rpb24gKCkge1xuXHRcdHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcblx0XHRyZW5kZXJDb2xsZWN0aW9uLmFwcGx5KHRoaXMsIGFyZ3MpO1xuXHR9LFxufSk7XG5cblxuXG5cbkNvbXBvbmVudC5wcm90b3R5cGUuaW5pdGlhbGl6ZSA9IGZ1bmN0aW9uKHByb3BlcnRpZXMpIHtcblxuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0Ly8gS2VlcCB0cmFjayBvZiBhIGNvdW50ZXIgZm9yIHVzZSBpbiBnZW5lcmF0aW5nXG5cdC8vIGlkcyBmb3IgYW5vbnltb3VzIGNvbXBvbmVudHMuXG5cdHRoaXMuYW5vbnltb3VzUmVnaW9uQ291bnRlciA9IDA7XG5cblx0Ly8gRGlzYWJsZSBvciBpc3N1ZSB3YXJuaW5ncyBhYm91dCBjZXJ0YWluIHByb3BlcnRpZXNcblx0Ly8gYW5kIG1ldGhvZHMgdG8gYXZvaWQgY29uZnVzaW9uXG5cdHByb3BlcnRpZXMgPSB2YWxpZGF0ZURlZmluaXRpb24ocHJvcGVydGllcyk7XG5cblx0Ly8gRXh0ZW5kIGluc3RhbmNlIHcvIHNwZWNpZmllZCBwcm9wZXJ0aWVzIGFuZCBtZXRob2RzXG5cdF8uZXh0ZW5kKHRoaXMsIHByb3BlcnRpZXMpO1xuXG5cdC8vIFN0YXJ0IHdpdGggZW1wdHkgcmVnaW9ucyBvYmplY3Rcblx0dGhpcy5yZWdpb25zID0ge307XG5cblx0Ly8gRW5jb3VyYWdlIGNoaWxkIG1ldGhvZHMgdG8gdXNlIHRoZSBjb21wb25lbnQgY29udGV4dFxuXHRfLmJpbmRBbGwodGhpcyk7XG59O1xuIiwiLy8gRmlyZWQgd2hlbiB0aGUgYm91bmQgbW9kZWwgaXMgdXBkYXRlZCAoYHRoaXMubW9kZWxgKVxuZXhwb3J0cy5hZnRlckNoYW5nZSA9IGZ1bmN0aW9uIChtb2RlbCwgb3B0aW9ucykge307XG5cbi8vIEZpcmVkIHdoZW4gYSBtb2RlbCBpcyBhZGRlZCB0byB0aGUgYm91bmQgY29sbGVjdGlvbiAoYHRoaXMuY29sbGVjdGlvbmApXG5leHBvcnRzLmFmdGVyQWRkID0gZnVuY3Rpb24gKG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zKSB7fTtcblxuLy8gRmlyZWQgd2hlbiBhIG1vZGVsIGlzIHJlbW92ZWQgZnJvbSB0aGUgYm91bmQgY29sbGVjdGlvbiAoYHRoaXMuY29sbGVjdGlvbmApXG5leHBvcnRzLmFmdGVyUmVtb3ZlID0gZnVuY3Rpb24gKG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zKSB7fTtcblxuLy8gRmlyZWQgd2hlbiB0aGUgYm91bmQgY29sbGVjdGlvbiBpcyB3aXBlZCAoYHRoaXMuY29sbGVjdGlvbmApXG5leHBvcnRzLmFmdGVyUmVzZXQgPSBmdW5jdGlvbiAoY29sbGVjdGlvbiwgb3B0aW9ucykge307XG4iLCIvLyBGaXJlZCBhdXRvbWF0aWNhbGx5IHdoZW4gdGhlIHZpZXcgaXMgaW5pdGlhbGx5IGNyZWF0ZWRcbi8vIG9ubHkgZmlyZWQgYWZ0ZXJ3YXJkcyBpZiB0aGlzLnJlbmRlcigpIGlzIGV4cGxpY2l0bHkgY2FsbGVkXG4vLyBDYWxsYmFjayBtdXN0IGJlIGZpcmVkISFcbmV4cG9ydHMuYmVmb3JlUmVuZGVyID0gZnVuY3Rpb24gKGNiKSB7Y2IoKTt9O1xuXG4vLyBGaXJlZCBhdXRvbWF0aWNhbGx5IHdoZW4gdGhlIHZpZXcgaXMgaW5pdGlhbGx5IGNyZWF0ZWRcbi8vIG9ubHkgZmlyZWQgYWZ0ZXJ3YXJkcyBpZiB0aGlzLnJlbmRlcigpIGlzIGV4cGxpY2l0bHkgY2FsbGVkXG5leHBvcnRzLmFmdGVyUmVuZGVyID0gZnVuY3Rpb24gKCkge307XG5cbi8vIEZpcmVkIGF1dG9tYXRpY2FsbHkgd2hlbiB0aGUgdmlldyBpcyBjbG9zZWRcbmV4cG9ydHMuYmVmb3JlQ2xvc2UgPSBmdW5jdGlvbiAoY2IpIHtjYigpO307XG5cbi8vIEZpcmVkIGJlZm9yZSByZXJlbmRlcmluZyBvciBjbG9zaW5nIGEgdmlldyB0aGF0IGlzIGFscmVhZHkgd2FpdGluZyBvbiBhIGxvY2tcbmV4cG9ydHMuY2FuY2VsUmVuZGVyID0gZnVuY3Rpb24gKCkge1xuXHRGUkFNRVdPUksud2FybignY2FuY2VsUmVuZGVyKCkgc2hvdWxkIGJlIGRlZmluZWQgaWYgYmVmb3JlQ2xvc2UoY2IpIG9yIGJlZm9yZVJlbmRlcihjYiknICtcblx0XHRcdFx0XHRcdFx0XHQgJ2FyZSBiZWluZyB1c2VkIScpO1xufTtcblxuLy8gRmlyZWQgYmVmb3JlIHJlcmVuZGVyaW5nIG9yIGNsb3NpbmcgYSB2aWV3IHRoYXQgaXMgYWxyZWFkeSB3YWl0aW5nIG9uIGEgbG9ja1xuZXhwb3J0cy5jYW5jZWxDbG9zZSA9IGZ1bmN0aW9uICgpIHtcblx0RlJBTUVXT1JLLndhcm4oJ2NhbmNlbENsb3NlKCkgc2hvdWxkIGJlIGRlZmluZWQgaWYgYmVmb3JlQ2xvc2UoY2IpIG9yIGJlZm9yZVJlbmRlcihjYiknICtcblx0XHRcdFx0XHRcdFx0XHQgJ2FyZSBiZWluZyB1c2VkIScpO1xufTtcbiIsIi8qKlxuICogUnVuIEhUTUwgdGVtcGxhdGUgdGhyb3VnaCBlbmdpbmUgYW5kIGFwcGVuZCByZXN1bHRzIHRvIG91dGxldC4gQWxzbyByZXJlbmRlciByZWdpb25zLlxuICogSWYgYXRJbmRleCBpcyBzcGVjaWZpZWQsIHRoZSBjb21wb25lbnQgaXMgcmVuZGVyZWQgYXQgdGhlIGdpdmVuIHBvc2l0aW9uIHdpdGhpbiBpdHNcbiAqIG91dGxldC4gT3RoZXJ3aXNlLCB0aGUgbGFzdCBwb3NpdGlvbiBpcyB1c2VkLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSBhdEluZGV4IFtUaGUgaW5kZXggaW4gd2hpY2ggdG8gcmVuZGVyIHRoaXMgZWxlbWVudF1cbiAqL1xuXG52YXIgRE9NID0gcmVxdWlyZSAoJy4uL3V0aWxzL0RPTScpLFxuXHRcdGhlbHBlcnMgPSByZXF1aXJlKCcuL2hlbHBlcnMnKSxcblx0XHRiaW5kRXZlbnRzID0gcmVxdWlyZSAoJy4vYmluZEV2ZW50cycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHJlbmRlcihhdEluZGV4KSB7XG5cblx0RlJBTUVXT1JLLmRlYnVnKHRoaXMuaWQgKyAnIDotLS06IFJlbmRlcmluZyBjb21wb25lbnQuLi4nKTtcblxuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0Ly8gQ2FuY2VsIGN1cnJlbnQgcmVuZGVyIGFuZCBjbG9zZSBqb2JzLCBpZiB0aGV5J3JlIHJ1bm5pbmdcblx0aWYgKHRoaXMuX3JlbmRlcmluZykge1xuXHRcdEZSQU1FV09SSy5kZWJ1Zyh0aGlzLmlkICsgJyA6OiByZW5kZXIoKSBjYW5jZWxlZC4nKTtcblx0XHR0aGlzLl9yZW5kZXJpbmdDYW5jZWxlZCA9IHRydWU7XG5cdFx0dGhpcy5jYW5jZWxSZW5kZXIoKTtcblx0XHR0aGlzLl9yZW5kZXJpbmcgPSBmYWxzZTtcblx0fVxuXHRpZiAodGhpcy5fY2xvc2luZykge1xuXHRcdEZSQU1FV09SSy5kZWJ1Zyh0aGlzLmlkICsgJyA6OiBjbG9zZSgpIGNhbmNlbGVkLicpO1xuXHRcdHRoaXMuY2FuY2VsQ2xvc2UoKTtcblx0XHR0aGlzLl9jbG9zaW5nID0gZmFsc2U7XG5cdH1cblxuXHQvLyBMb2NrIGFjY2VzcyB0byByZW5kZXJcblx0dGhpcy5fcmVuZGVyaW5nID0gdHJ1ZTtcblxuXHQvLyBUcmlnZ2VyIGJlZm9yZVJlbmRlciBtZXRob2Rcblx0dGhpcy5iZWZvcmVSZW5kZXIoZnVuY3Rpb24gKCkge1xuXG5cdFx0Ly8gSWYgcmVuZGVyaW5nIHdhcyBjYW5jZWxlZCwgYnJlYWsgb3V0XG5cdFx0Ly8gZG8gbm90IHJlbmRlciwgYW5kIGRvIG5vdCBjYWxsIGFmdGVyUmVuZGVyKClcblx0XHRpZiAoIHNlbGYuX3JlbmRlcmluZ0NhbmNlbGVkICkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEJpbmQgdGhlIGV2ZW50cyBvbiBtb2RlbC9jb2xsZWN0aW9ucyBhbmQgZ2xvYmFsIHRyaWdnZXJlZCBldmVudHMuXG5cdFx0YmluZEV2ZW50cy5jb2xsZWN0aW9uRXZlbnRzLmNhbGwoc2VsZik7XG5cdFx0YmluZEV2ZW50cy5tb2RlbEV2ZW50cy5jYWxsKHNlbGYpO1xuXHRcdGJpbmRFdmVudHMuZ2xvYmFsVHJpZ2dlcnMuY2FsbChzZWxmKTtcblxuXHRcdC8vIFVubG9jayByZW5kZXJpbmcgbXV0ZXhcblx0XHRzZWxmLl9yZW5kZXJpbmcgPSBmYWxzZTtcblxuXHRcdGlmICghc2VsZi4kb3V0bGV0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3Ioc2VsZi5pZCArICcgOjogVHJ5aW5nIHRvIHJlbmRlcigpLCBidXQgbm8gJG91dGxldCB3YXMgZGVmaW5lZCEnKTtcblx0XHR9XG5cblx0XHQvLyBIeWRyYXRlIGNvbXBpbGVkIHRlbXBsYXRlXG5cdFx0Ly8gKGNvbWJpbmVzIHRoZSB0ZW1wbGF0ZSBmdW5jdGlvbiB3aXRoIGRhdGEgdG8gcmV0dXJuIEhUTUwpXG5cdFx0dmFyIGh0bWwgPSBoZWxwZXJzLmNvbXBpbGVUZW1wbGF0ZS5jYWxsKHNlbGYpO1xuXHRcdGlmICghaHRtbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKHRoaXMuaWQgKyAnIDo6IFVuYWJsZSB0byByZW5kZXIgY29tcG9uZW50IGJlY2F1c2UgdGVtcGxhdGUgY29tcGlsYXRpb24gZGlkIG5vdCByZXR1cm4gYW55IEhUTUwuJyk7XG5cdFx0fVxuXG5cdFx0Ly8gU3RyaXAgdHJhaWxpbmcgYW5kIGxlYWRpbmcgd2hpdGVzcGFjZSB0byBhdm9pZCBmYWxzZWx5IGRpYWdub3Npbmdcblx0XHQvLyBtdWx0aXBsZSBlbGVtZW50cywgd2hlbiBvbmx5IG9uZSBhY3R1YWxseSBleGlzdHNcblx0XHQvLyAodGhpcyBtaXNkaWFnbm9zaXMgd3JhcHMgdGhlIHRlbXBsYXRlIGluIGFuIGV4dHJhbmVvdXMgPGRpdj4pXG5cdFx0aHRtbCA9IGh0bWwucmVwbGFjZSgvXlxccyovLCAnJyk7XG5cdFx0aHRtbCA9IGh0bWwucmVwbGFjZSgvXFxzKiQvLCAnJyk7XG5cdFx0aHRtbCA9IGh0bWwucmVwbGFjZSgvKFxccnxcXG4pKi8sICcnKTtcblxuXHRcdC8vIFN0cmlwIEhUTUwgY29tbWVudHMsIHRoZW4gc3RyaXAgd2hpdGVzcGFjZSBhZ2FpblxuXHRcdC8vIChUT0RPOiBvcHRpbWl6ZSB0aGlzKVxuXHRcdGh0bWwgPSBodG1sLnJlcGxhY2UoLyg8IS0tListLT4pKi8sICcnKTtcblx0XHRodG1sID0gaHRtbC5yZXBsYWNlKC9eXFxzKi8sICcnKTtcblx0XHRodG1sID0gaHRtbC5yZXBsYWNlKC9cXHMqJC8sICcnKTtcblx0XHRodG1sID0gaHRtbC5yZXBsYWNlKC8oXFxyfFxcbikqLywgJycpO1xuXG5cdFx0Ly8gUGFyc2UgYSBET00gbm9kZSBvciBzZXJpZXMgb2YgRE9NIG5vZGVzIGZyb20gdGhlIG5ld2x5IHRlbXBsYXRlZCBIVE1MXG5cdFx0dmFyIHBhcnNlZE5vZGVzID0gJC5wYXJzZUhUTUwoaHRtbCk7XG5cdFx0dmFyIGVsID0gcGFyc2VkTm9kZXNbMF07XG5cblx0XHQvLyBJZiBubyBub2RlcyB3ZXJlIHBhcnNlZCwgdGhyb3cgYW4gZXJyb3Jcblx0XHRpZiAocGFyc2VkTm9kZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3Ioc2VsZi5pZCArICcgOjogcmVuZGVyKCkgcmFuIGludG8gYSBwcm9ibGVtIHJlbmRlcmluZyB0aGUgdGVtcGxhdGUgd2l0aCBIVE1MID0+IFxcbicraHRtbCk7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgdGhlcmUgaXMgbm90IG9uZSBzaW5nbGUgd3JhcHBlciBlbGVtZW50LFxuXHRcdC8vIG9yIGlmIHRoZSByZW5kZXJlZCB0ZW1wbGF0ZSBjb250YWlucyBvbmx5IGEgc2luZ2xlIHRleHQgbm9kZSxcblx0XHQvLyAob3IganVzdCBhIGxvbmUgcmVnaW9uKVxuXHRcdGVsc2UgaWYgKHBhcnNlZE5vZGVzLmxlbmd0aCA+IDEgfHwgcGFyc2VkTm9kZXNbMF0ubm9kZVR5cGUgPT09IDMgfHxcblx0XHRcdFx0XHRcdCAkKHBhcnNlZE5vZGVzWzBdKS5pcygncmVnaW9uJykpIHtcblxuXHRcdFx0RlJBTUVXT1JLLmxvZyhzZWxmLmlkICsgJyA6OiBXcmFwcGluZyB0ZW1wbGF0ZSBpbiA8ZGl2Lz4uLi4nLCBwYXJzZWROb2Rlcyk7XG5cblx0XHRcdC8vIHdyYXAgdGhlIGh0bWwgdXAgaW4gYSBjb250YWluZXIgPGRpdi8+XG5cdFx0XHRlbCA9ICQoJzxkaXYvPicpLmFwcGVuZChodG1sKTtcblx0XHRcdGVsID0gZWxbMF07XG5cdFx0fVxuXG5cdFx0Ly8gU2V0IEJhY2tib25lIGVsZW1lbnQgKGNhY2hlIGFuZCByZWRlbGVnYXRlIERPTSBldmVudHMpXG5cdFx0Ly8gKFdpbGwgYWxzbyB1cGRhdGUgc2VsZi4kZWwpXG5cdFx0c2VsZi5zZXRFbGVtZW50KGVsKTtcblx0XHQvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxuXG5cdFx0Ly8gRGV0ZWN0IGFuZCByZW5kZXIgYWxsIHJlZ2lvbnMgYW5kIHRoZWlyIGRlc2NlbmRlbnQgY29tcG9uZW50cyBhbmQgcmVnaW9uc1xuXHRcdGhlbHBlcnMucmVuZGVyUmVnaW9ucy5jYWxsKHNlbGYpO1xuXG5cdFx0Ly8gSW5zZXJ0IHRoZSBlbGVtZW50IGF0IHRoZSBwcm9wZXIgcGxhY2UgYW1vbmdzdCB0aGUgb3V0bGV0J3MgY2hpbGRyZW5cblx0XHR2YXIgbmVpZ2hib3JzID0gc2VsZi4kb3V0bGV0LmNoaWxkcmVuKCk7XG5cdFx0aWYgKF8uaXNGaW5pdGUoYXRJbmRleCkgJiYgbmVpZ2hib3JzLmxlbmd0aCA+IDAgJiYgbmVpZ2hib3JzLmxlbmd0aCA+IGF0SW5kZXgpIHtcblx0XHRcdG5laWdoYm9ycy5lcShhdEluZGV4KS5iZWZvcmUoc2VsZi4kZWwpO1xuXHRcdH1cblxuXHRcdC8vIEJ1dCBpZiB0aGUgb3V0bGV0IGlzIGVtcHR5LCBvciB0aGVyZSdzIG5vIGF0SW5kZXgsIGp1c3Qgc3RpY2sgaXQgb24gdGhlIGVuZFxuXHRcdGVsc2Ugc2VsZi4kb3V0bGV0LmFwcGVuZChzZWxmLiRlbCk7XG5cblxuXHRcdC8vIEZsYWcgd2l0aCBkYXRhLXRlbXBsYXRlLWlkIGF0dHJpYnV0ZVxuXHRcdC8vICh0byBtYWtlIHRlbXBsYXRlL2NvbXBvbmVudCBib3VuZGFyaWVzIGVhc2llciB0byBwaWNrIG91dCBpbiB0aGUgaW5zcGVjdG9yKVxuXHRcdHNlbGYuJGVsLmF0dHIoJ2RhdGEtdGVtcGxhdGUtaWQnLCBzZWxmLmlkKTtcblxuXG5cblxuXHRcdC8vXG5cdFx0Ly8gSWYgdGhlIHBhcmVudCBjb21wb25lbnQgaGFzIHJvdXRlIGxpc3RlbmVycyAoZS5nLiAjZm9vKVxuXHRcdC8vIHJ1biBhbnkgb2YgdGhlbSB0aGF0IG1hdGNoIGB3aW5kb3cubG9jYXRpb24uaGFzaGAuXG5cdFx0Ly8gKGFmdGVyIHJlbmRlcmluZyB0aGUgdGVtcGxhdGUgYW5kIHJlZ2lvbnMgYnV0IEJFRk9SRSB0aGUgYGFmdGVyUmVuZGVyYFxuXHRcdC8vIGxpZmVjeWNsZSBjYWxsYmFjayBpcyB0cmlnZ2VyZWQpXG5cdFx0Ly9cblx0XHQvLyBub3Qgc3VyZSBpZiB0aGlzIGlzIGEgZ29vZCBpZGVhIGluIGdlbmVyYWwtLSBtYXliZSBjb25maWd1cmFibGUuLj9cblx0XHQvLyBvciBvbmx5IGlmIGJhY2tib25lLmhpc3RvcnkgaXNuJ3QgcmVhZHkgeWV0P1xuXHRcdC8vXG5cdFx0Ly8gZGlzYWJsaW5nIGZvciBub3cuLi5cblx0XHQvLyBfLmVhY2goIE9iamVjdC5rZXlzKHNlbGYpLCBmdW5jdGlvbiAoa2V5KSB7XG5cdFx0Ly8gXHR2YXIgbWF0Y2hlZFJvdXRlID0ga2V5Lm1hdGNoKG5ldyBSZWdFeHAoJy9eJyArd2luZG93LmxvY2F0aW9uLmhhc2ggKyAnLycpKTtcblx0XHQvLyBcdGlmICghbWF0Y2hlZFJvdXRlKSByZXR1cm47XG5cblx0XHQvLyBcdHZhciBtYXRjaGVkUm91dGVMaXN0ZW5lciA9IHNlbGZbbWF0Y2hlZFJvdXRlXTtcblx0XHQvLyBcdG1hdGNoZWRSb3V0ZUxpc3RlbmVyKCk7XG5cdFx0Ly8gfSk7XG5cblxuXHRcdC8vIEZpbmFsbHksIHRyaWdnZXIgYWZ0ZXJSZW5kZXIgbWV0aG9kXG5cdFx0c2VsZi5hZnRlclJlbmRlcigpO1xuXG5cblx0XHQvLyBSdW4gZGF0YSBiaW5kaW5nc1xuXHRcdC8vIFRPRE86IGRvbid0IGNhbGwgdGhpcyBoZXJlLS0ganVzdCBkbyB3aGVuIGluaXRpYWxseSBpbnNlcnRpbmcgdGhlIHRlbXBsYXRlIGludG8gdGhlIERPTVxuXHRcdC8vICh0aGlzIGlzIGluZWZmaWNpZW50KVxuXHRcdGhlbHBlcnMucmVuZGVyRGF0YUJpbmRpbmdzLmNhbGwoc2VsZik7XG5cblxuXHRcdC8vIEFkZCBkYXRhIGF0dHJpYnV0ZXMgdG8gdGhpcyBjb21wb25lbnQncyAkZWwsIHByb3ZpZGluZyBhY2Nlc3Ncblx0XHQvLyB0byB3aGV0aGVyIHRoZSBlbGVtZW50IGhhcyB2YXJpb3VzIERPTSBiaW5kaW5ncyBmcm9tIHN0eWxlc2hlZXRzLlxuXHRcdC8vIChoYW5keSBmb3IgZGlzYWJsaW5nIHRleHQgc2VsZWN0aW9uIGFjY29yZGluZ2x5LCBldGMuKVxuXHRcdC8vXG5cdFx0Ly8gLT4gZGlzYWJsZSBmb3IgdGhpcyBjb21wb25lbnQgd2l0aCBgdGhpcy5hdHRyRmxhZ3MgPSBmYWxzZWBcblx0XHQvLyAtPiBvciBnbG9iYWxseSB3aXRoIGBGUkFNRVdPUksuYXR0ckZsYWdzID0gZmFsc2VgXG5cdFx0Ly9cblx0XHQvLyBUT0RPOiBtYWtlIGl0IHdvcmsgd2l0aCBkZWxlZ2F0ZWQgRE9NIGV2ZW50IGJpbmRpbmdzXG5cdFx0Ly9cblx0XHRpZiAoc2VsZi5hdHRyRmxhZ3MgIT09IGZhbHNlICYmIEZSQU1FV09SSy5hdHRyRmxhZ3MgIT09IGZhbHNlKSB7XG5cdFx0XHRET00uZmxhZ0JvdW5kRXZlbnRzKHNlbGYpO1xuXHRcdH1cblx0fSk7XG59O1xuIiwiXG4vKipcbiAqIFRPRE86XG4gKiBUcnkgb3V0IGEgZGlmZmVyZW50IGFwcHJvYWNoIGZvciB0aGUgbG9naWMgaW4gYHJlbmRlckNvbGxlY3Rpb25gXG4gKiBiZWxvdyBieSBvdmVybG9hZGluZyBgcmVnaW9uLmF0dGFjaCgpYC5cbiAqXG4gKiBFeGFtcGxlIHVzYWdlOiAoaW4gcGFyZW50IGNvbXBvbmVudClcbiAqID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gKiB0aGlzLnNvbWVSZWdpb24uYXR0YWNoKCdTb21lT3RoZXJDb21wb25lbnQnLHsgY29sbGVjdGlvbjogU29tZUNvbGxlY3Rpb24gfSlcbiAqXG4gKiAtb3ItXG4gKlxuICogdGhpcy5zb21lUmVnaW9uLnJlcGVhdCgnU29tZU90aGVyQ29tcG9uZW50Jyx7IGNvbGxlY3Rpb246IFNvbWVDb2xsZWN0aW9uIH0pXG4gKi9cblxuLyoqXG4gKiByZW5kZXJDb2xsZWN0aW9uKClcbiAqXG4gKiBSZXVzYWJsZSBsb2dpYyB0byByZW5kZXIgYSBjb2xsZWN0aW9uIGludG8gYSByZWdpb25cbiAqXG4gKiBUT0RPOiBtb3ZlIG9udG8gUmVnaW9uIG9iamVjdCBpbnN0ZWFkLi4uICBTZWUgZ2lzdC5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gY29sbGVjdGlvbiAtIGRhdGEgc291cmNlXG4gKiBAcGFyYW0ge09wdGlvbnN9IG9wdGlvbnNcbiAqXHRcdDogb3B0aW9ucy5pdGVtVGVtcGxhdGUge1N0cmluZ30gLSBuYW1lIG9mIHRlbXBsYXRlL2NvbXBvbmVudCB0byB1c2UgYXMgaXRlbVxuICpcdFx0OiBvcHRpb25zLmludG9SZWdpb24ge09iamVjdH0gLSB0aGUgZGVzdGluYXRpb24gcmVnaW9uXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGNvbGxlY3Rpb24sIG9wdGlvbnMpIHtcblxuXHQvLyBSZXF1aXJlZDpcblx0aWYgKHR5cGVvZiBjb2xsZWN0aW9uICE9PSAnb2JqZWN0JykgdGhyb3cgbmV3IEVycm9yKCdyZW5kZXJDb2xsZWN0aW9uIDo6IFVua25vd24vaW52YWxpZCBjb2xsZWN0aW9uLCBcIicgKyAoY29sbGVjdGlvbiAmJiBjb2xsZWN0aW9uLnR5cGUpICsgJ1wiJyk7XG5cdGlmICghb3B0aW9ucy5pdGVtVGVtcGxhdGUpIHRocm93IG5ldyBFcnJvcigncmVuZGVyQ29sbGVjdGlvbiA6OiBvcHRpb25zLml0ZW1UZW1wbGF0ZSByZXF1aXJlZCEnKTtcblx0aWYgKCFvcHRpb25zLmludG9SZWdpb24pIHRocm93IG5ldyBFcnJvcigncmVuZGVyQ29sbGVjdGlvbiA6OiBvcHRpb25zLmludG9SZWdpb24gcmVxdWlyZWQhJyk7XG5cblxuXHQvLyBEZXRlcm1pbmUgY29sbGVjdGlvbk5hbWVcblx0dmFyIGNvbGxlY3Rpb25OYW1lID0gY29sbGVjdGlvbi50eXBlO1xuXG5cdC8vIFRhcmdldCByZWdpb25cblx0dmFyIG91dGxldCA9IG9wdGlvbnMuaW50b1JlZ2lvbjtcblxuXHQvLyBTdWItY29tcG9uZW50XG5cdHZhciBzdWJjb21wb25lbnROYW1lID0gb3B0aW9ucy5pdGVtVGVtcGxhdGU7XG5cblx0Ly8gTmFtZSBvZiB0aGUgY29sbGVjdGlvbiBzdGF0ZSBhdHRyaWJ1dGUgdGhhdCB3aWxsZSBiZSBpbmplY3RlZCBpbnRvIHRoZSBIVE1MXG5cdC8vIFVzZWQgZm9yIHRoZSBkZWZhdWx0IHJlbmRlciBiZWhhdmlvci5cblx0dmFyIGJvZHlTdGF0ZUF0dHJpYnV0ZSA9ICdkYXRhLScgKyBjb2xsZWN0aW9uTmFtZSArICctc3RhdGUnO1xuXG5cblxuXG5cdC8qKlxuXHQgKiBEZWZhdWx0IHJlbmRlciBtZXRob2RzXG5cdCAqXG5cdCAqIE92ZXJyaWRlIGRlZmF1bHQgcmVuZGVyIG1ldGhvZHMgd2l0aCBvcHRpb25zIGlmIHNwZWNpZmllZFxuXHQgKi9cblxuXHQvLyBEZWZhdWx0IHJlbmRlciBsb2dpYyBmb3IgZXJyb3Igc3RhdGUgKGUuZy4gcmVkIHRleHQpXG5cdHZhciByZW5kZXJFcnJvciA9IG9wdGlvbnMucmVuZGVyRXJyb3IgfHwgZnVuY3Rpb24gcmVuZGVyRXJyb3IgKCkge1xuXHRcdEZSQU1FV09SSy5lcnJvcignQW4gZXJyb3Igb2NjdXJyZWQgd2hpbGUgbG9hZGluZyAnICsgY29sbGVjdGlvbk5hbWUgKyAnIDo6XFxuJywgY29sbGVjdGlvbi5lcnJvcik7XG5cblx0XHQvLyBTZXQgYSBkYXRhIGF0dHJpYnV0ZSBvbiBIVE1MIGJvZHlcblx0XHQkKCdib2R5JykuYXR0cihib2R5U3RhdGVBdHRyaWJ1dGUsICdlcnJvcicpO1xuXHR9O1xuXG5cdC8vIERlZmF1bHQgcmVuZGVyIGxvZ2ljIGZvciBsb2FkaW5nIHN0YXRlIChlLmcuIHNwaW5uZXIpXG5cdHZhciByZW5kZXJTeW5jaW5nID0gb3B0aW9ucy5yZW5kZXJTeW5jaW5nIHx8IGZ1bmN0aW9uIHJlbmRlclN5bmNpbmcoKSB7XG5cdFx0RlJBTUVXT1JLLmxvZygnTG9hZGluZyAnICsgY29sbGVjdGlvbk5hbWUgKyAnLi4uJyk7XG5cblx0XHQvLyBTZXQgc3RhdGUgYXR0cmlidXRlIG9uIEhUTUwgYm9keVxuXHRcdCQoJ2JvZHknKS5hdHRyKGJvZHlTdGF0ZUF0dHJpYnV0ZSwgJ3N5bmNpbmcnKTtcblx0fTtcblxuXHQvLyBEZWZhdWx0IHJlbmRlciBsb2dpYyB0byBjbGVhbiB1cCBhZnRlciBhIHN1Y2Nlc3NmdWwgc3luYy9sb2FkXG5cdHZhciByZW5kZXJTeW5jZWQgPSBvcHRpb25zLnJlbmRlclN5bmNlZCB8fCBmdW5jdGlvbiByZW5kZXJTeW5jZWQoKSB7XG5cdFx0RlJBTUVXT1JLLmxvZyhjb2xsZWN0aW9uLmxlbmd0aCArICcgJyArIGNvbGxlY3Rpb25OYW1lICsgJyBmZXRjaGVkIHN1Y2Nlc3NmdWxseS4nKTtcblxuXHRcdC8vIFNldCBzdGF0ZSBhdHRyaWJ1dGUgb24gSFRNTCBib2R5XG5cdFx0JCgnYm9keScpLmF0dHIoYm9keVN0YXRlQXR0cmlidXRlLCAncmVhZHknKTtcblx0fTtcblxuXHQvLyBEZWZhdWx0IHJlbmRlciBsb2dpYyBmb3IgaXRlbXMgaW4gY29sbGVjdGlvblxuXHR2YXIgcmVuZGVyUmVzZXQgPSBvcHRpb25zLnJlbmRlclJlc2V0IHx8IGZ1bmN0aW9uIHJlbmRlclJlc2V0KCkge1xuXG5cdFx0Ly8gQ2xlYW4gb3V0IHRoZSByZWdpb24sIHdyYXAgaW4gYSB0cnkvY2F0Y2ggdG8gc3RvcCB0aGUgZXhlY3V0aW9uXG5cdFx0dHJ5IHtcblx0XHRcdG91dGxldC5lbXB0eSgpO1xuXHRcdH0gY2F0Y2ggKGUpIHt9XG5cblxuXHRcdC8vIFRPRE86IFNtYXJ0IG1lcmdlIHRvIG1pbmltaXplIERPTSBxdWVyaWVzXG5cdFx0Y29sbGVjdGlvbi5lYWNoKGZ1bmN0aW9uIChtb2RlbCkge1xuXHRcdFx0Ly8gRm9yIGVhY2ggbW9kZWwgZm91bmQsIGFwcGVuZCBhIHN1YmNvbXBvbmVudCB0byB0aGUgcmVnaW9uXG5cdFx0XHRvdXRsZXQuYXBwZW5kKHN1YmNvbXBvbmVudE5hbWUsIHsgbW9kZWw6IG1vZGVsIH0pO1xuXHRcdH0pO1xuXHR9O1xuXG5cdC8qKlxuXHQgKiByZW5kZXJBZGQgKCBtb2RlbCwgW2F0SW5kZXhdIClcblx0ICpcblx0ICogQHBhcmFtIHtNb2RlbH0gbW9kZWxcdFx0XHRcdFx0XHQtIHRoZSBCYWNrYm9uZSBtb2RlbCB0aGF0IHdhcyBhZGRlZFxuXHQgKiBAcGFyYW0ge0ludGVnZXJ9IGF0SW5kZXhcdFx0XHRcdC0gKG9wdGlvbmFsLSBkZWZhdWx0cyB0byBjb2xsZWN0aW9uLmxlbmd0aClcblx0ICpcblx0ICogRGVmYXVsdCByZW5kZXIgbG9naWMgZm9yIHRoZSBjYXNlIHdoZXJlIGFuIGl0ZW0gaXMgYWRkZWQgdG8gdGhlIGNvbGxlY3Rpb24uXG5cdCAqL1xuXHR2YXIgcmVuZGVyQWRkID0gb3B0aW9ucy5yZW5kZXJBZGQgfHwgZnVuY3Rpb24gcmVuZGVyQWRkKCBtb2RlbCwgYXRJbmRleCApIHtcblx0XHRpZiAoIHR5cGVvZiBhdEluZGV4ID09PSAnbnVtYmVyJykge1xuXHRcdFx0cmV0dXJuIG91dGxldC5pbnNlcnQoYXRJbmRleCwgc3ViY29tcG9uZW50TmFtZSwgeyBtb2RlbDogbW9kZWwgfSk7XG5cdFx0fVxuXHRcdHJldHVybiBvdXRsZXQuYXBwZW5kKHN1YmNvbXBvbmVudE5hbWUsIHsgbW9kZWw6IG1vZGVsIH0pO1xuXHR9O1xuXG5cdC8qKlxuXHQgKiByZW5kZXJSZW1vdmUoIGF0SW5kZXggKVxuXHQgKlxuXHQgKiBAcGFyYW0ge0ludGVnZXJ9IGF0SW5kZXhcdFx0XHQtIHRoZSBmb3JtZXIgaW5kZXggb2YgdGhlIEJhY2tib25lIG1vZGVsIHRoYXQgd2FzIHJlbW92ZWRcblx0ICpcblx0ICogRGVmYXVsdCByZW5kZXIgbG9naWMgZm9yIHRoZSBjYXNlIHdoZXJlIGFuIGl0ZW0gaXMgcmVtb3ZlZCBmcm9tIHRoZSBjb2xsZWN0aW9uLlxuXHQgKi9cblx0dmFyIHJlbmRlclJlbW92ZSA9IG9wdGlvbnMucmVuZGVyUmVtb3ZlIHx8IGZ1bmN0aW9uIHJlbmRlclJlbW92ZSggYXRJbmRleCApIHtcblx0XHRvdXRsZXQucmVtb3ZlKCBhdEluZGV4ICk7XG5cdH07XG5cblxuXG5cblxuXG5cdC8qKlxuXHQgKiBCb290c3RyYXBcblx0ICpcblx0ICogUmVuZGVycyBpbml0aWFsIHN0YXRlIG9mIGNvbGxlY3Rpb24gaW50byBvdXIgcmVnaW9uXG5cdCAqIHVzaW5nIG91ciBjaGlsZCB0ZW1wbGF0ZS5cblx0ICovXG5cblx0Ly8gSWYgb3VyIGNvbGxlY3Rpb24gaXMgZmV0Y2hpbmcsIHJlbmRlciB0aGUgZmV0Y2hpbmcgKGxvYWRpbmcpIHN0YXRlLlxuXHRpZiAoY29sbGVjdGlvbi5zeW5jaW5nKSB7XG5cdFx0cmVuZGVyU3luY2luZygpO1xuXHR9XG5cblxuXHQvLyBJZiBvdXIgY29sbGVjdGlvbiBmYWlsZWQgdG8gZmV0Y2ggKGkuZS4gcmVjZWl2ZWQgYSA0eHggb3IgNXh4IGVycm9yIGNvZGUpXG5cdC8vIHJlbmRlciBhbiBlcnJvciBzdGF0ZVxuXHQvL1xuXHQvLyBIYW5kbGUgdGhlIGNhc2Ugb2YgbXVsdGlwbGUgZXJyb3Igc3RhdGVzIHdpdGggZGlmZmVyZW50IHN0eWxlcyBoZXJlIGFzIHdlbGwuXG5cdGVsc2UgaWYgKGNvbGxlY3Rpb24uZXJyb3IpIHtcblx0XHRyZW5kZXJFcnJvcigpO1xuXHR9XG5cblxuXHQvLyBPdGhlcndpc2Ugb3VyIGNvbGxlY3Rpb24gaXMgbG9hZGVkIGFuZCByZWFkeSxcblx0Ly8gc28gZ28gYWhlYWQgYW5kIHJlbmRlciBpdCBpbnRvIHRoZSB0YXJnZXQgcmVnaW9uLlxuXHQvL1xuXHQvLyAoYWx0ZXJuYXRpdmVseSBhdCB0aGlzIHBvaW50LCBhIGN1c3RvbSBgZW1wdHlgIHN0YXRlIG1heSBiZSByZW5kZXJlZClcblx0Ly8gY29uc29sZS5sb2coJ1RoZSBjb2xsZWN0aW9uICcgKyBzdWJjb21wb25lbnROYW1lICsgJy0tLS0+Jyk7XG5cdGVsc2UgcmVuZGVyUmVzZXQoKTtcblxuXG5cblxuXG5cblxuXHQvKipcblx0ICogQmluZCBldmVudHNcblx0ICpcblx0ICogTGlzdGVuIGZvciBzdGF0ZSBjaGFuZ2VzIChzeW5jaW5nLCBzeW5jZWQsIHNlcnZlciBlcnJvciwgYWRkLCByZW1vdmUsIHNvcnQsIGV0Yy4pXG5cdCAqIFRoZXNlIG1hbnVhbCBiaW5kaW5ncyBjYW4gYmUgcmVtb3ZlZCB3aGVuIGNvcmUgZnJhbWV3b3JrIHN1cHBvcnRzIHJlbmRlci10aW1lIGNvbGxlY3Rpb25cblx0ICogYmluZGluZ3MuICBGb3Igbm93LCBkb2luZyBpdCB0aGlzIHdheSByYXRoZXIgdGhhbiBwYXRjaGluZyB0aGUgY29yZSB0byB0ZXN0IG91ciBzdHJ1Y3R1cmFsXG5cdCAqIGFzc3VtcHRpb25zLlxuXHQgKi9cblxuXHQvLyBXaGVuIGEgZmV0Y2ggaXMgaW5pdGlhdGVkIGZyb20gdGhlIHNlcnZlci4uLlxuXHQvL1xuXHQvLyAoYWZ0ZXIgYEJhY2tib25lLnN5bmNgIGJlZ2lucyBhIHJlbW90ZSByZXF1ZXN0KVxuXHR0aGlzLmxpc3RlblRvKGNvbGxlY3Rpb24sICdyZXF1ZXN0JywgZnVuY3Rpb24gYWZ0ZXJSZXF1ZXN0ICgpIHtcblx0XHRyZW5kZXJTeW5jaW5nKCk7XG5cdH0pO1xuXG5cdC8vIFdoZW4gYSBmZXRjaCBjb21wbGV0ZXMgc3VjY2Vzc2Z1bGx5IGFuZCBuZXcgZGF0YSBpcyBsb2FkZWQuLi5cblx0Ly9cblx0Ly8gKGFmdGVyIHRoaXMgY29tcG9uZW50IGlzIGFscmVhZHkgaW5zdGFudGlhdGVkKVxuXHR0aGlzLmxpc3RlblRvKGNvbGxlY3Rpb24sICdzeW5jJywgZnVuY3Rpb24gYWZ0ZXJTeW5jICgpIHtcblx0XHRyZW5kZXJTeW5jZWQoKTtcblx0XHRyZW5kZXJSZXNldCgpO1xuXHR9KTtcblxuXHQvLyBXaGVuIHNlcnZlciBzZW5kcyBhIHJlc3BvbnNlIHcvIGFuIGVycm9yIGNvZGVcblx0Ly9cblx0Ly8gKGFmdGVyIHRoaXMgY29tcG9uZW50IGlzIGFscmVhZHkgaW5zdGFudGlhdGVkKVxuXHR0aGlzLmxpc3RlblRvKGNvbGxlY3Rpb24sICdlcnJvcicsIGZ1bmN0aW9uIGFmdGVyU3luY0Vycm9yIChjb2xsZWN0aW9uLCB4aHIpIHtcblxuXHRcdC8vIElnbm9yZSBhYm9ydCBcImVycm9yXCJcblx0XHQvL1xuXHRcdC8vIFdoeT8gYmVjYXVzZSBpdCdzIG5vdCBhY3R1YWxseSBhbiBlcnJvci5cblx0XHQvLyBOb3Qgc3VyZSB3aHkgdGhpcyB0cmlnZ2VycyBCYWNrYm9uZS5Db2xsZWN0aW9uJ3MgYGVycm9yYCBldmVudC4uLlxuXHRcdC8vXG5cdFx0Ly8gSWYgdHdvIGZldGNoZXMgb2NjdXIgb24gdGhlIHNhbWUgY29sbGVjdGlvbiBhdCB0aGUgc2FtZSB0aW1lLFxuXHRcdC8vIHdlIGFib3J0IHRoZSBvbGQgWEhSIHJlcXVlc3Qgb3Vyc2VsdmVzIGlmIGl0J3Mgc3RpbGwgcnVubmluZylcblx0XHRpZiAoeGhyICYmIHhoci5zdGF0dXNUZXh0ID09PSAnYWJvcnQnKSByZXR1cm47XG5cblx0XHRyZW5kZXJFcnJvcigpO1xuXHR9KTtcblxuXHQvLyBXaGVuIGEgbW9kZWwgaXMgYWRkZWQuLi5cblx0Ly9cblx0Ly8gTGlzdGVuIGZvciBuZXcgbW9kZWxzLCBhbmQgaW5zZXJ0IGEgY2hpbGQgdGVtcGxhdGVcblx0Ly8gYXQgdGhlIGFwcHJvcHJpYXRlIGluZGV4IHdpdGhpbiB0aGUgcmVnaW9uLlxuXHR0aGlzLmxpc3RlblRvKGNvbGxlY3Rpb24sICdhZGQnLCBmdW5jdGlvbiBhZnRlckFkZCAoIG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zICkge1xuXHRcdHJlbmRlckFkZCggbW9kZWwsIG9wdGlvbnMuYXQgKTtcblx0fSk7XG5cblx0Ly8gV2hlbiBhIG1vZGVsIGlzIHJlbW92ZWQuLi5cblx0Ly9cblx0Ly8gR3JhYiBtb2RlbCdzIHJlbGF0aXZlIGluZGV4IHdpdGhpbiBjb2xsZWN0aW9uIGFuZCByZW1vdmVcblx0Ly8gdGhlIGNoaWxkIHRlbXBsYXRlIGF0IHRoZSBzYW1lIGluZGV4IHdpdGhpbiB0aGUgcmVnaW9uLlxuXHR0aGlzLmxpc3RlblRvKGNvbGxlY3Rpb24sICdyZW1vdmUnLCBmdW5jdGlvbiBhZnRlclJlbW92ZSAoIG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zICkge1xuXHRcdHJlbmRlclJlbW92ZSggb3B0aW9ucy5pbmRleCApO1xuXHR9KTtcblxuXG5cbn07XG4iLCIvKipcbiAqIENoZWNrIHRoZSBzcGVjaWZpZWQgZGVmaW5pdGlvbiBmb3Igb2J2aW91cyBtaXN0YWtlcywgZXNwZWNpYWxseSBsaWtlbHkgZGVwcmVjYXRpb25zIGFuZFxuICogdmFsaWRhdGUgdGhhdCB0aGUgbW9kZWwgYW5kIGNvbGxlY3Rpb25zIGFyZSBpbnN0YW5jZXMgb2YgQmFja2JvbmUncyBEYXRhIHN0cnVjdHVyZXMuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IHByb3BlcnRpZXMgW09iamVjdCBjb250YWluaW5nIHRoZSBwcm9wZXJ0aWVzIG9mIHRoZSBjb21wb25lbnRdXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB2YWxpZGF0ZURlZmluaXRpb24ocHJvcGVydGllcykge1xuXG5cdGlmIChfLmlzT2JqZWN0KHByb3BlcnRpZXMpKSB7XG5cblx0XHQvLyBEZXRlcm1pbmUgY29tcG9uZW50IGlkXG5cdFx0dmFyIGlkID0gdGhpcy5pZCB8fCBwcm9wZXJ0aWVzLmlkO1xuXG5cdFx0ZnVuY3Rpb24gX3ZhbGlkYXRlQmFja2JvbmVJbnN0YW5jZSAodHlwZSkge1xuXHRcdFx0dmFyIFR5cGUgPSB0eXBlWzBdLnRvVXBwZXJDYXNlKCkgKyB0eXBlLnNsaWNlKDEpO1xuXG5cdFx0XHRpZiAoICFwcm9wZXJ0aWVzW3R5cGVdIGluc3RhbmNlb2YgQmFja2JvbmVbVHlwZV0gKSB7XG5cblx0XHRcdFx0RnJhbWV3b3JrLmVycm9yKFxuXHRcdFx0XHRcdCdDb21wb25lbnQgKCcgKyBpZCArICcpIGhhcyBhbiBpbnZhbGlkICcgKyB0eXBlICsgJy0tIFxcbicgK1xuXHRcdFx0XHRcdCdJZiBgJyArIHR5cGUgKyAnYCBpcyBzcGVjaWZpZWQgZm9yIGEgY29tcG9uZW50LCAnICtcblx0XHRcdFx0XHQnaXQgbXVzdCBiZSBhbiAqaW5zdGFuY2UqIG9mIGEgQmFja2JvbmUuJyArIFR5cGUgKyAnLlxcbicpO1xuXG5cdFx0XHRcdGlmIChwcm9wZXJ0aWVzW3R5cGVdIGluc3RhbmNlb2YgQmFja2JvbmVbVHlwZV0uY29uc3RydWN0b3IpIHtcblx0XHRcdFx0XHRGcmFtZXdvcmsuZXJyb3IoXG5cdFx0XHRcdFx0XHQnSXQgbG9va3MgbGlrZSBhIEJhY2tib25lLicgKyBUeXBlICsgJyAqcHJvdG90eXBlKiB3YXMgc3BlY2lmaWVkIGluc3RlYWQgb2YgYSAnICtcblx0XHRcdFx0XHRcdCdCYWNrYm9uZS4nICsgVHlwZSArICcgKmluc3RhbmNlKi5cXG4nICtcblx0XHRcdFx0XHRcdCdQbGVhc2UgYG5ld2AgdXAgdGhlICcgKyB0eXBlICsgJyAtYmVmb3JlLSAnICsgRnJhbWV3b3JrLmlkICsgJy5yYWlzZSgpLCcgK1xuXHRcdFx0XHRcdFx0J29yIHVzZSBhIHdyYXBwZXIgZnVuY3Rpb24gdG8gYWNoaWV2ZSB0aGUgc2FtZSBlZmZlY3QsIGUuZy46XFxuJyArXG5cdFx0XHRcdFx0XHQnYCcgKyB0eXBlICsgJzogZnVuY3Rpb24gKCkge1xcbnJldHVybiBuZXcgU29tZScgKyBUeXBlICsgJygpO1xcbn1gJ1xuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRGcmFtZXdvcmsud2FybignSWdub3JpbmcgaW52YWxpZCAnICsgdHlwZSArICcgOjogJyArIHByb3BlcnRpZXNbdHlwZV0pO1xuXHRcdFx0XHRkZWxldGUgcHJvcGVydGllc1t0eXBlXTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDaGVjayB0aGF0IHRoaXMuY29sbGVjdGlvbiBpcyBhY3R1YWxseSBhbiBpbnN0YW5jZSBvZiBCYWNrYm9uZS5Db2xsZWN0aW9uXG5cdFx0Ly8gYW5kIHRoYXQgdGhpcy5tb2RlbCBpcyBhY3R1YWxseSBhbiBpbnN0YW5jZSBvZiBCYWNrYm9uZS5Nb2RlbFxuXHRcdF92YWxpZGF0ZUJhY2tib25lSW5zdGFuY2UoJ21vZGVsJyk7XG5cdFx0X3ZhbGlkYXRlQmFja2JvbmVJbnN0YW5jZSgnY29sbGVjdGlvbicpO1xuXG5cdFx0Ly8gQ2xvbmUgcHJvcGVydGllcyB0byBhdm9pZCBpbmFkdmVydGVudCBtb2RpZmljYXRpb25zXG5cdFx0cmV0dXJuIF8uY2xvbmUocHJvcGVydGllcyk7XG5cdH1cblxuXHRlbHNlIHJldHVybiB7fTtcblxufVxuIiwiLyoqXG4gKiBSdW4gZGVmaW5pdGlvbiBtZXRob2RzIHRvIGdldCBhY3R1YWwgY29tcG9uZW50IGRlZmluaXRpb25zLlxuICogVGhpcyBpcyBkZWZlcnJlZCB0byBhdm9pZCBoYXZpbmcgdG8gdXNlIEJhY2tib25lJ3MgZnVuY3Rpb24gKCkge30gYXBwcm9hY2ggZm9yIHRoaW5nc1xuICogbGlrZSBjb2xsZWN0aW9ucy5cbiAqL1xuXG4vKipcbiAqIEJ1aWxkIHVwcyBhIGNvbXBvbmVudCBkZWZpbml0aW9uIGJ5IHJ1bm5pbmcgdGhlIGRlZmluaXRpb24uIFdlIHRoZW4gbGluayB0aGVcbiAqIGNvbXBvbmVudCBkZWZpbml0aW9uIHRvIGFuIGlkZW50aWZpZXIgaW4gYEZSQU1FV09SSy5jb21wb25lbnRzYC5cbiAqXG4gKiBAcGFyYW0gIHtPYmplY3R9IGNvbXBvbmVudCBbT2JqZWN0IGNvbnRhaW5pbmcgdGhlIGRlZmluaXRpb24gZnVuY3Rpb24gb2YgdGhlIGNvbXBvbmVudF1cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBidWlsZENvbXBvbmVudERlZmluaXRpb24oY29tcG9uZW50KSB7XG5cdHZhciBjb21wb25lbnREZWYgPSBjb21wb25lbnQuZGVmaW5pdGlvbigpO1xuXG5cdGlmIChjb21wb25lbnQuaWRPdmVycmlkZSkge1xuXHRcdGlmIChjb21wb25lbnREZWYuaWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihjb21wb25lbnQuaWRPdmVycmlkZSArICc6OiBDYW5ub3Qgc3BlY2lmeSBhbiBpZE92ZXJyaWRlIGluIC5kZWZpbmUoKSBpZiBhbiBpZCBwcm9wZXJ0eSAoJytjb21wb25lbnREZWYuaWQrJykgaXMgYWxyZWFkeSBzZXQgaW4geW91ciBjb21wb25lbnQgZGVmaW5pdGlvbiFcXG5Vc2FnZTogLmRlZmluZShbaWRPdmVycmlkZV0sIGRlZmluaXRpb24pJyk7XG5cdFx0fVxuXHRcdGNvbXBvbmVudERlZi5pZCA9IGNvbXBvbmVudC5pZE92ZXJyaWRlO1xuXHR9XG5cdGlmICghY29tcG9uZW50RGVmLmlkKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgdXNlIC5kZWZpbmUoKSB3aXRob3V0IGRlZmluaW5nIGFuIGlkIHByb3BlcnR5IG9yIG92ZXJyaWRlIGluIHlvdXIgY29tcG9uZW50IVxcblVzYWdlOiAuZGVmaW5lKFtpZE92ZXJyaWRlXSwgZGVmaW5pdGlvbiknKTtcblx0fVxuXHRGUkFNRVdPUksuY29tcG9uZW50c1tjb21wb25lbnREZWYuaWRdID0gY29tcG9uZW50RGVmO1xufTtcbiIsIi8qKlxuICogT3B0aW9uYWwgbWV0aG9kIHRvIHJlcXVpcmUgYXBwIGNvbXBvbmVudHMuIFJlcXVpcmUuanMgY2FuIGJlIHVzZWQgaW5zdGVhZFxuICogYXMgbmVlZGVkLlxuICpcbiAqIEBwYXJhbSAge1N0cmluZ30gXHRbKG9wdGlvbmFsKSBDb21wb25lbnQgaWQgb3ZlcnJpZGVdXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gW0Z1bmN0aW9uIERlZmluaXRpb24gb2YgY29tcG9uZW50XVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGRlZmluZShpZCwgZGVmaW5pdGlvbkZuKSB7XG5cdC8vIElkIHBhcmFtIGlzIG9wdGlvbmFsXG5cdGlmICghZGVmaW5pdGlvbkZuKSB7XG5cdFx0ZGVmaW5pdGlvbkZuID0gaWQ7XG5cdFx0aWQgPSBudWxsO1xuXHR9XG5cblx0RlJBTUVXT1JLLl9kZWZpbmVRdWV1ZS5wdXNoKHtcblx0XHRkZWZpbml0aW9uOiBkZWZpbml0aW9uRm4sXG5cdFx0aWRPdmVycmlkZTogaWRcblx0fSk7XG59O1xuIiwiLyoqXG4gKiBNYXN0IGJ1aWxkIGZpbGUuIFRoZSBtYWluIGZpbGVcbiAqL1xuXG52YXIgZGVmaW5lID0gcmVxdWlyZSgnLi9kZWZpbmUvaW5kZXgnKTtcbnZhciBSZWdpb24gPSByZXF1aXJlKCcuL3JlZ2lvbi9pbmRleCcpO1xudmFyIENvbXBvbmVudCA9IHJlcXVpcmUoJy4vY29tcG9uZW50L2luZGV4Jyk7XG52YXIgcmFpc2UgPSByZXF1aXJlKCcuL3JhaXNlL2luZGV4Jyk7XG5cbi8qKlxuICogRnJhbWV3b3JrIGNsYXNzIGRlZmluaXRpb24gdGhhdCB3aWxsIGNyZWF0ZSBhIG5ldyBnbG9iYWwgaW5zdGFuY2Ugb2YgYSBjdXN0b20gRnJhbWV3b3JrLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIFtvcHRpb25zIGhhc2ggdG8gaW5pdGlhbGl6ZSB0aGUgY3VzdG9tIGZyYW1ld29yayB3aXRoXVxuICovXG5GcmFtZXdvcmsgPSBmdW5jdGlvbihvcHRpb25zKSB7XG5cdC8vIFNldCB0aGUgZGVmYXVsdCBvcHRpb25zIGZvciB0aG9zZSBub3QgcGFzc2VkIGluLlxuXHRvcHRpb25zID0gXy5kZWZhdWx0cyhvcHRpb25zLCB7XG5cdFx0dGhyb3R0bGVXaW5kb3dSZXNpemU6IDIwMCxcblx0XHRsb2dMZXZlbDogJ3dhcm4nLFxuXHRcdGZyYW1ld29ya0lkOiAnTWFzdCcsXG5cdFx0cHJvZHVjdGlvbjogZmFsc2UsXG5cdFx0bG9nZ2VyOiB1bmRlZmluZWQsXG5cdFx0c2hvcnRjdXQ6IHtcblx0XHRcdHRlbXBsYXRlOiB0cnVlLFxuXHRcdFx0Y291bnQ6IHRydWVcblx0XHR9XG5cdH0pO1xuXG5cdC8vIFNldCBhIHN0YXJ0aW5nIHBvaW50IHRvIEJhY2tib25lIGFuZCBhZGQgYWRkaXRpb25hbCBhdHRyaWJ1dGUuXG5cdF8uZXh0ZW5kKHRoaXMsIEJhY2tib25lLCB7XG5cdFx0b3B0aW9uczogb3B0aW9ucyxcblx0XHR0ZW1wbGF0ZXM6IHt9LFxuXHRcdGNvbXBvbmVudHM6IHt9LFxuXHRcdGRhdGE6IHt9LFxuXHRcdF9kZWZpbmVRdWV1ZTogW10sXG5cdFx0cmVnaW9uczoge31cblx0fSk7XG5cblx0LyoqXG5cdCAqIEV4dGVuZCBGUkFNRVdPUksuQ29sbGVjdGlvbiB0byBtYWtlIGl0IGJldHRlclxuXHQgKiAoc3BlY2lmaWNhbGx5LCB0byBhZGQgZXJyb3IgaGFuZGxpbmcpXG5cdCAqL1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdHZhciBvcmlnaW5hbENvbGxlY3Rpb24gPSB0aGlzLkNvbGxlY3Rpb247XG5cdHRoaXMuQ29sbGVjdGlvbiA9IG9yaWdpbmFsQ29sbGVjdGlvbi5leHRlbmQoe1xuXG5cdFx0aW5pdGlhbGl6ZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcblxuXHRcdFx0Ly8gT3ZlcnJpZGUgYGNvbGxlY3Rpb24uZmV0Y2goKWBcblx0XHRcdHRoaXMuX2ZldGNoID0gdGhpcy5mZXRjaDtcblx0XHRcdHRoaXMuZmV0Y2ggPSB0aGlzWydfZmV0Y2grKyddO1xuXHRcdH0sXG5cblxuXHRcdC8qKlxuXHRcdCAqIGFmdGVyRXJyb3Jcblx0XHQgKlxuXHRcdCAqIExpZmVjeWNsZSBjYWxsYmFjayB0byBjYXRjaCB3aGVuIGEgZmV0Y2ggZXJyb3Igb2NjdXJzXG5cdFx0ICpcblx0XHQgKiBUT0RPOlxuXHRcdCAqIFByb2JhYmx5IHJlbW92ZSB0aGlzLS0gcmVhc29uaW5nIDo6XG5cdFx0ICogSW4gbW9zdCBjYXNlcywgeW91IGFjdHVhbGx5IGNhcmUgYWJvdXQgdGhlIGVycm9yIGluXG5cdFx0ICogdGhlIHJlbGV2YW50IGNvbXBvbmVudHMgd2hvIGFyZSB1c2luZyB0aGlzIGNvbGxlY3Rpb24sXG5cdFx0ICogaW4gd2hpY2ggY2FzZSB5b3UnZCBqdXN0IGJpbmQgYW4gZXJyb3IgZXZlbnQgaGFuZGxlci5cblx0XHQgKi9cblx0XHRhZnRlckVycm9yOiBmdW5jdGlvbiAoY29sbGVjdGlvbiwgeGhyLCBvcHRpb25zKSB7XG5cdFx0XHQvLyB0aGlzIGV4aXN0cyBmb3IgeW91IHRvIG92ZXJyaWRlIGl0IVxuXHRcdH0sXG5cblxuXG5cblx0XHQvKipcblx0XHQgKiBPdmVycmlkZSBCYWNrYm9uZS5Db2xsZWN0aW9uJ3MgYGZldGNoKClgXG5cdFx0ICogdG8gYWxsb3cgZm9yIGJldHRlciBlcnJvciBoYW5kbGluZy5cblx0XHQgKlxuXHRcdCAqIFRPRE86IHB1bGwgdGhpcyBpbnRvIEJhY2tib25lLnN5bmMgaW5zdGVhZC4uXG5cdFx0ICogb25seSBwcm9ibGVtIGlzIGNsYXNoaW5nIHdpdGggb3RoZXIgc3luYyBvdmVycmlkZXNcblx0XHQgKi9cblx0XHQnX2ZldGNoKysnOiBmdW5jdGlvbiAob3B0aW9ucykge1xuXHRcdFx0dmFyIGNvbGxlY3Rpb24gPSB0aGlzO1xuXG5cdFx0XHRvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblxuXHRcdFx0Ly8gTG9nIGEgZnJpZW5kbGllciBcIk5vIFVSTFwiIG1lc3NhZ2U6XG5cdFx0XHRpZiAoICFjb2xsZWN0aW9uLnVybCApIHtcblx0XHRcdFx0c2VsZi5lcnJvcignQ2Fubm90IGZldGNoKCkgJyArIGNvbGxlY3Rpb24udHlwZSArICcgOjogQ29sbGVjdGlvbiBoYXMgbm8gVVJMIGZ1bmN0aW9uL3Byb3BlcnR5Li4uJyk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gT3ZlcnJpZGUgZXJyb3IgaGFuZGxlciB0byBtaXhpbiBhbiAnZXJyb3InIGV2ZW50XG5cdFx0XHR2YXIgb3JpZ2luYWxFcnJvckhhbmRsZXIgPSBvcHRpb25zLmVycm9yO1xuXHRcdFx0dmFyIG9yaWdpbmFsU3VjY2Vzc0hhbmRsZXIgPSBvcHRpb25zLnN1Y2Nlc3M7XG5cdFx0XHRfLmV4dGVuZChvcHRpb25zLCB7XG5cdFx0XHRcdHN1Y2Nlc3M6IGZ1bmN0aW9uIChjb2xsZWN0aW9uLCB4aHIsIG9wdGlvbnMpIHtcblx0XHRcdFx0XHR2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG5cblx0XHRcdFx0XHQvLyBOdWxsIG91dCBgY29sbGVjdGlvbi5zeW5jaW5nYFxuXHRcdFx0XHRcdGNvbGxlY3Rpb24uc3luY2luZyA9IG51bGw7XG5cblx0XHRcdFx0XHQvLyBUcmlnZ2VyIG9yaWdpbmFsIHN1Y2Nlc3MgaGFuZGxlciBpZiBzcGVjaWZpZWRcblx0XHRcdFx0XHQvLyBvbiBgZmV0Y2goe3N1Y2Nlc3M6IGZ1bmN0aW9uKCl7LyouLi4qL319KWBcblx0XHRcdFx0XHRpZiAob3JpZ2luYWxTdWNjZXNzSGFuZGxlcikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG9yaWdpbmFsU3VjY2Vzc0hhbmRsZXIuYXBwbHkoY29sbGVjdGlvbiwgYXJncyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRlcnJvcjogZnVuY3Rpb24gKGNvbGxlY3Rpb24sIHhociwgb3B0aW9ucykge1xuXHRcdFx0XHRcdHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcblxuXHRcdFx0XHRcdC8vIE51bGwgb3V0IGBjb2xsZWN0aW9uLnN5bmNpbmdgXG5cdFx0XHRcdFx0Y29sbGVjdGlvbi5zeW5jaW5nID0gbnVsbDtcblxuXHRcdFx0XHRcdC8vIElmIHRoaXMgaXMgYW4gXCJhYm9ydFwiLCBpZ25vcmUgaXQtIChzdGF0ZSBoYXMgYWxyZWFkeSBiZWVuIHRha2VuIGNhcmUgb2YpXG5cdFx0XHRcdFx0aWYgKCB4aHIgJiYgeGhyLnN0YXR1c1RleHQ9PT0nYWJvcnQnICkgcmV0dXJuO1xuXG5cdFx0XHRcdFx0Ly8gU2V0IGBjb2xsZWN0aW9uLmVycm9yYCB1c2luZyB0aGUgcmVzcG9uc2UgZnJvbSB0aGUgZmV0Y2hcblx0XHRcdFx0XHQvLyAodHJ5IGpzb24sIHRoZW4gcmVzcG9uc2UgdGV4dCwgdGhlbiBzdGF0dXMgY29kZSwgdGhlbiBqdXN0IGRlZmF1bHQgdG8gYHRydWVgKVxuXHRcdFx0XHRcdGNvbGxlY3Rpb24uZXJyb3IgPVxuXHRcdFx0XHRcdFx0KCB4aHIgJiYgeGhyLnJlc3BvbnNlSlNPTiApID8geGhyLnJlc3BvbnNlSlNPTiA6XG5cdFx0XHRcdFx0XHQoIHhociAmJiB4aHIucmVzcG9uc2VUZXh0ICkgPyB4aHIucmVzcG9uc2VUZXh0IDpcblx0XHRcdFx0XHRcdHRydWU7XG5cblxuXHRcdFx0XHRcdC8vIENhbGwgYGFmdGVyRXJyb3IoKWBcblx0XHRcdFx0XHRjb2xsZWN0aW9uLmFmdGVyRXJyb3IuYXBwbHkoY29sbGVjdGlvbixhcmdzKTtcblxuXHRcdFx0XHRcdC8vIFRyaWdnZXIgb3JpZ2luYWwgZXJyb3IgaGFuZGxlciBpZiBzcGVjaWZpZWRcblx0XHRcdFx0XHQvLyBvbiBgZmV0Y2goe2Vycm9yOiBmdW5jdGlvbigpey8qLi4uKi99fSlgXG5cdFx0XHRcdFx0aWYgKG9yaWdpbmFsRXJyb3JIYW5kbGVyKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gb3JpZ2luYWxFcnJvckhhbmRsZXIuYXBwbHkoY29sbGVjdGlvbiwgYXJncyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gTnVsbCBvdXQgYGNvbGxlY3Rpb24uZXJyb3JgXG5cdFx0XHRjb2xsZWN0aW9uLmVycm9yID0gbnVsbDtcblxuXHRcdFx0Ly8gSWYgYGZldGNoYCBpcyBhbHJlYWR5IGluIHByb2dyZXNzLCBjYW5jZWwgaXRcblx0XHRcdC8vIGFuZCBmaXJlIG9mZiBhIG5ldyBvbmUuXG5cdFx0XHRpZiAoY29sbGVjdGlvbi5zeW5jaW5nKSB7XG5cdFx0XHRcdHNlbGYubG9nKCdBYm9ydGluZyBydW5uaW5nIGBmZXRjaCgpYCBpbiBvcmRlciB0byBzdGFydCBhIG5ldyBgZmV0Y2goKWAuLi4nKTtcblx0XHRcdFx0Y29sbGVjdGlvbi5zeW5jaW5nLmFib3J0KCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENhbGwgb3JpZ2luYWwgYGZldGNoKClgIHVzaW5nIG91ciBtb25rZXktcGF0Y2hlZCBvcHRpb25zXG5cdFx0XHR2YXIgeGhyID0gY29sbGVjdGlvbi5fZmV0Y2gob3B0aW9ucyk7XG5cblx0XHRcdC8vIFNldCBgY29sbGVjdGlvbi5zeW5jaW5nYCB0byB0aGUgWEhSIG9iamVjdCBpbiB1c2Vcblx0XHRcdGNvbGxlY3Rpb24uc3luY2luZyA9IHhocjtcblxuXHRcdFx0Ly8gUmV0dXJuIHRoZSBYSFIgb2JqZWN0IHRvIG1haW50YWluIG9yaWdpbmFsIGBCYWNrYm9uZS5Db2xsZWN0aW9uLmZldGNoKClgIEFQSVxuXHRcdFx0cmV0dXJuIHhocjtcblx0XHR9XG5cblx0fSk7XG5cblx0Ly8gRXhwb3NlIGEgZ2xvYmFsIGZvciB0aGUgY3VzdG9tIEZSQU1FV09SSy5cblx0dmFyIGZyYW1ld29ya05hbWUgPSBvcHRpb25zLmZyYW1ld29ya0lkO1xuXHR3aW5kb3dbZnJhbWV3b3JrTmFtZV0gPSB0aGlzO1xuXG5cdC8vIFRocm91Z2h0b3V0IHRoZSBzb3VyY2UgY29kZSwgdGhlcmUgYXJlIG9wZXJhdGlvbnMgb24gYEZSQU1FV09SS2Agb3IgY29kZSB0aGF0IGFjY2Vzc2VzXG5cdC8vIGl0cyBhdHRyaWJ1dGVzLiBXZSB3aWxsIG1ha2UgYEZSQU1FV09SS2AgYWNjZXNzYWJsZSBieSBhc3NpZ25pbmcgaXQgdGhlIGluc3RhbmNlIG9mIHRoZVxuXHQvLyBjdXN0b20gRnJhbWV3b3JrLlxuXHRGUkFNRVdPUksgPSB3aW5kb3dbZnJhbWV3b3JrTmFtZV07XG59O1xuXG4vLyBGcmFtZXdvcmsgcHJvdG90eXBlIG1ldGhvZHMuXG5GcmFtZXdvcmsucHJvdG90eXBlLlJlZ2lvbiA9IFJlZ2lvbjtcbkZyYW1ld29yay5wcm90b3R5cGUuQ29tcG9uZW50ID0gQ29tcG9uZW50O1xuRnJhbWV3b3JrLnByb3RvdHlwZS5kZWZpbmUgPSBkZWZpbmU7XG5GcmFtZXdvcmsucHJvdG90eXBlLnJhaXNlID0gcmFpc2U7XG5cbiIsIi8qKlxuICpcdExvZ2dldCBjb25zdHJ1Y3RvciBtZXRob2QgdGhhdCB3aWxsIHNldHVwIEZSQU1FV09SSyB0byBsb2cgbWVzc2FnZXMuXG4gKi9cblxudmFyIHNldHVwTG9nZ2VyID0gcmVxdWlyZSgnLi9zZXR1cCcpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIExvZ2dlcigpIHtcblxuXHQvLyBVcG9uIGluaXRpYWxpemF0aW9uLCBzZXR1cCBsb2dnZXJcblx0c2V0dXBMb2dnZXIoRlJBTUVXT1JLLm9wdGlvbnMubG9nTGV2ZWwpO1xuXG5cdC8vIEluIHN1cHBvcnRlZCBicm93c2VycywgYWxzbyBydW4gc2V0dXBMb2dnZXIgYWdhaW5cblx0Ly8gd2hlbiBGUkFNRVdPUksubG9nTGV2ZWwgaXMgc2V0IGJ5IHRoZSB1c2VyXG5cdC8vIFRPRE86IGZpbmQgYSB3YXkgdG8gZG8gdGhpcyB3aXRob3V0IGRlcGVuZGluZyBvbiBfX2RlZmluZVNldHRlcl9fLlxuXHRpZiAoXy5pc0Z1bmN0aW9uKEZSQU1FV09SSy5fX2RlZmluZVNldHRlcl9fKSkge1xuXHRcdEZSQU1FV09SSy5fX2RlZmluZVNldHRlcl9fKCdsb2dMZXZlbCcsIGZ1bmN0aW9uIG9uQ2hhbmdlIChuZXdMb2dMZXZlbCkge1xuXHRcdFx0c2V0dXBMb2dnZXIobmV3TG9nTGV2ZWwpO1xuXHRcdH0pO1xuXHR9XG59O1xuIiwiLyoqXG4gKiBTZXQgdXAgdGhlIGxvZyBmdW5jdGlvbnM6XG4gKlxuICogRlJBTUVXT1JLLmVycm9yXG4gKiBGUkFNRVdPUksud2FyblxuICogRlJBTUVXT1JLLmxvZ1xuICogRlJBTUVXT1JLLmRlYnVnICgqbGVnYWN5KVxuICogRlJBTUVXT1JLLnZlcmJvc2VcbiAqXG4gKiBAcGFyYW0gIHtTdHJpbmd9IGxvZ0xldmVsIFtUaGUgZGVzaXJlZCBsb2cgbGV2ZWwgb2YgdGhlIExvZ2dlcl1cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBzZXR1cExvZ2dlciAobG9nTGV2ZWwpIHtcblxuXHR2YXIgbm9vcCA9IGZ1bmN0aW9uICgpIHt9O1xuXG5cdC8vIElmIGxvZyBpcyBzcGVjaWZpZWQsIHVzZSBpdCwgb3RoZXJ3aXNlIHVzZSB0aGUgY29uc29sZVxuXHRpZiAoRlJBTUVXT1JLLmxvZ2dlcikge1xuXHRcdEZSQU1FV09SSy5lcnJvciAgICAgPSBGUkFNRVdPUksubG9nZ2VyLmVycm9yO1xuXHRcdEZSQU1FV09SSy53YXJuICAgICAgPSBGUkFNRVdPUksubG9nZ2VyLndhcm47XG5cdFx0RlJBTUVXT1JLLmxvZyAgICAgICA9IEZSQU1FV09SSy5sb2dnZXIuZGVidWcgfHwgRlJBTUVXT1JLLmxvZ2dlcjtcblx0XHRGUkFNRVdPUksudmVyYm9zZSAgID0gRlJBTUVXT1JLLmxvZ2dlci52ZXJib3NlO1xuXHR9XG5cblx0Ly8gSW4gSUUsIHdlIGNhbid0IGRlZmF1bHQgdG8gdGhlIGJyb3dzZXIgY29uc29sZSBiZWNhdXNlIHRoZXJlIElTIE5PIEJST1dTRVIgQ09OU09MRVxuXHRlbHNlIGlmICh0eXBlb2YgY29uc29sZSAhPT0gJ3VuZGVmaW5lZCcpIHtcblxuXHRcdC8vIFdlIGNhbm5vdCBjYWxsZWQgdGhlIC5iaW5kIG1ldGhvZCBvbiB0aGUgY29uc29sZSBtZXRob2RzLiBXZSBhcmUgaW4gaWUgOSBvciA4LCBqdXN0IG1ha2Vcblx0XHQvLyBldmVyeWh0aW5nIGEgbm9vcC5cblx0XHRpZiAoXy5pc1VuZGVmaW5lZChjb25zb2xlLmxvZy5iaW5kKSkgIHtcblx0XHRcdEZSQU1FV09SSy5lcnJvciAgICAgPSBub29wO1xuXHRcdFx0RlJBTUVXT1JLLndhcm4gICAgICA9IG5vb3A7XG5cdFx0XHRGUkFNRVdPUksubG9nICAgICAgID0gbm9vcDtcblx0XHRcdEZSQU1FV09SSy5kZWJ1ZyAgICAgPSBub29wO1xuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UgICA9IG5vb3A7XG5cdFx0fVxuXG5cdFx0Ly8gV2UgYXJlIGluIGEgZnJpZW5kbHkgYnJvd3NlciBsaWtlIENocm9tZSwgRmlyZWZveCwgb3IgSUUxMFxuXHRcdGVsc2Uge1xuXHRcdFx0RlJBTUVXT1JLLmVycm9yXHRcdD0gY29uc29sZS5lcnJvciAmJiBjb25zb2xlLmVycm9yLmJpbmQoY29uc29sZSk7XG5cdFx0XHRGUkFNRVdPUksud2Fyblx0XHQ9IGNvbnNvbGUud2FybiAmJiBjb25zb2xlLndhcm4uYmluZChjb25zb2xlKTtcblx0XHRcdEZSQU1FV09SSy5sb2dcdFx0XHQ9IGNvbnNvbGUuZGVidWcgJiYgY29uc29sZS5kZWJ1Zy5iaW5kKGNvbnNvbGUpO1xuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2VcdD0gY29uc29sZS5sb2cgJiYgY29uc29sZS5sb2cuYmluZChjb25zb2xlKTtcblxuXHRcdFx0Ly8gVXNlIGxvZyBsZXZlbCBjb25maWcgaWYgcHJvdmlkZWRcblx0XHRcdHN3aXRjaCAobG9nTGV2ZWwpIHtcblx0XHRcdFx0Y2FzZSAndmVyYm9zZSc6IGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgJ2RlYnVnJzpcblx0XHRcdFx0XHRGUkFNRVdPUksudmVyYm9zZSA9IG5vb3A7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSAnd2Fybic6XG5cdFx0XHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UgPSBGUkFNRVdPUksubG9nID0gbm9vcDtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlICdlcnJvcic6XG5cdFx0XHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UgPSBGUkFNRVdPUksubG9nID0gRlJBTUVXT1JLLndhcm4gPSBub29wO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgJ3NpbGVudCc6XG5cdFx0XHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UgPSBGUkFNRVdPUksubG9nID0gRlJBTUVXT1JLLndhcm4gPSBGUkFNRVdPUksuZXJyb3IgPSBub29wO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yICgnVW5yZWNvZ25pemVkIGxvZ2dpbmcgbGV2ZWwgY29uZmlnICcgK1xuXHRcdFx0XHRcdCcoJyArIEZSQU1FV09SSy5vcHRpb25zLmZyYW1ld29ya0lkICsgJy5sb2dMZXZlbCA9IFwiJyArIGxvZ0xldmVsICsgJ1wiKScpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTdXBwb3J0IGZvciBgZGVidWdgIGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eVxuXHRcdFx0RlJBTUVXT1JLLmRlYnVnID0gRlJBTUVXT1JLLmxvZztcblxuXHRcdFx0Ly8gVmVyYm9zZSBzcGl0cyBvdXQgbG9nIGxldmVsXG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZSgnTG9nIGxldmVsIHNldCB0byA6OiAnLCBsb2dMZXZlbCk7XG5cdFx0fVxuXHR9XG59XG4iLCIvKipcbiAqIEdpdmVuIGEgY29tcG9uZW50IGRlZmluaXRpb24gYW5kIGl0cyBrZXksIHdlIHdpbGwgYnVpbGQgdXAgdGhlIGNvbXBvbmVudCBwcm90b3R5cGUgYW5kIG1lcmdlXG4gKiB0aGlzIGNvbXBvbmVudCB3aXRoIGl0cyBtYXRjaGluZyB0ZW1wbGF0ZS5cbiAqXG4gKiBAcGFyYW0gIHtPYmplY3R9IGNvbXBvbmVudERlZiBbT2JqZWN0IGNvbnRhaW5pbmcgdGhlIGNvbXBvbmVudCBkZWZpbml0aW9uXVxuICogQHBhcmFtICB7U3RyaW5nfSBjb21wb25lbnRLZXkgW1RoZSBjb21wb25lbnQgaWRlbnRpZmllcl1cbiAqL1xuXG52YXIgdHJhbnNsYXRlU2hvcnRoYW5kID0gcmVxdWlyZSgnLi4vdXRpbHMvc2hvcnRoYW5kJyk7XG52YXIgVXRpbHMgPSByZXF1aXJlKCcuLi91dGlscy91dGlscycpO1xudmFyIEV2ZW50cyA9IHJlcXVpcmUoJy4uL3V0aWxzL2V2ZW50cycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGJ1aWxkQ29tcG9uZW50UHJvdG90eXBlKGNvbXBvbmVudERlZiwgY29tcG9uZW50S2V5KSB7XG5cblx0Ly8gSWYgY29tcG9uZW50IGlkIGlzIG5vdCBleHBsaWNpdGx5IHNldCwgdXNlIHRoZSBjb21wb25lbnRLZXlcblx0aWYgKCFjb21wb25lbnREZWYuaWQpIHtcblx0XHRjb21wb25lbnREZWYuaWQgPSBjb21wb25lbnRLZXk7XG5cdH1cblxuXHQvLyBTZWFyY2ggdGVtcGxhdGVzXG5cdHZhciB0ZW1wbGF0ZSA9IEZSQU1FV09SSy50ZW1wbGF0ZXNbY29tcG9uZW50RGVmLmlkXTtcblxuXHQvLyBJZiBubyBtYXRjaCBmb3IgY29tcG9uZW50IHdhcyBmb3VuZMKgaW4gdGVtcGxhdGVzLCBpc3N1ZSBhIHdhcm5pbmdcblx0aWYgKCF0ZW1wbGF0ZSkge1xuXHRcdHJldHVybiBGUkFNRVdPUksud2Fybihcblx0XHRcdGNvbXBvbmVudERlZi5pZCArICcgOjogTm8gdGVtcGxhdGUgZm91bmQgZm9yIGNvbXBvbmVudCEnICtcblx0XHRcdCdcXG5UZW1wbGF0ZXMgZG9uXFwndCBuZWVkIGEgY29tcG9uZW50IHVubGVzcyB5b3Ugd2FudCBpbnRlcmFjdGl2aXR5LCAnICtcblx0XHRcdCdldmVyeSBjb21wb25lbnQgKnNob3VsZCogaGF2ZSBhIG1hdGNoaW5nIHRlbXBsYXRlISEnICtcblx0XHRcdCdcXG5Vc2luZyBjb21wb25lbnRzIHdpdGhvdXQgdGVtcGxhdGVzIG1heSBzZWVtIG5lY2Vzc2FyeSwgJyArXG5cdFx0XHQnYnV0IGl0XFwncyBub3QuICBJdCBtYWtlcyB5b3VyIHZpZXcgbG9naWMgaW5jb3Jwb3JlYWwsIGFuZCBtYWtlcyB5b3VyIGNvbGxlYWd1ZXMgJyArXG5cdFx0XHQndW5jb21mb3J0YWJsZS4nKTtcblx0fVxuXG5cdC8vIFNhdmUgcmVmZXJlbmNlIHRvIHRlbXBsYXRlIGluIGNvbXBvbmVudCBwcm90b3R5cGVcblx0RlJBTUVXT1JLLnZlcmJvc2UoY29tcG9uZW50RGVmLmlkICsgJyA6OiBQYWlyaW5nIGNvbXBvbmVudCB3aXRoIHRlbXBsYXRlLi4uJyk7XG5cdGNvbXBvbmVudERlZi50ZW1wbGF0ZSA9IHRlbXBsYXRlO1xuXG5cdC8vIFRyYW5zbGF0ZSByaWdodC1oYW5kIHNob3J0aGFuZCBmb3IgdG9wLWxldmVsIGtleXNcblx0Y29tcG9uZW50RGVmID0gVXRpbHMub2JqTWFwKGNvbXBvbmVudERlZiwgdHJhbnNsYXRlU2hvcnRoYW5kKTtcblxuXG5cdC8vIGFuZCBldmVudHMgb2JqZWN0XG5cdGlmIChjb21wb25lbnREZWYuZXZlbnRzKSB7XG5cdFx0Y29tcG9uZW50RGVmLmV2ZW50cyA9IFV0aWxzLm9iak1hcChcblx0XHRcdGNvbXBvbmVudERlZi5ldmVudHMsXG5cdFx0XHR0cmFuc2xhdGVTaG9ydGhhbmRcblx0XHQpO1xuXHR9XG5cblx0Ly8gYW5kIGFmdGVyQ2hhbmdlIGJpbmRpbmdzXG5cdGlmIChfLmlzT2JqZWN0KGNvbXBvbmVudERlZi5hZnRlckNoYW5nZSkgJiYgIV8uaXNGdW5jdGlvbihjb21wb25lbnREZWYuYWZ0ZXJDaGFuZ2UpKSB7XG5cdFx0Y29tcG9uZW50RGVmLmFmdGVyQ2hhbmdlID0gVXRpbHMub2JqTWFwKFxuXHRcdFx0Y29tcG9uZW50RGVmLmFmdGVyQ2hhbmdlLFxuXHRcdFx0dHJhbnNsYXRlU2hvcnRoYW5kXG5cdFx0KTtcblx0fVxuXG5cdC8vIEdvIGFoZWFkIGFuZCB0dXJuIHRoZSBkZWZpbml0aW9uIGludG8gYSByZWFsIGNvbXBvbmVudCBwcm90b3R5cGVcblx0RlJBTUVXT1JLLnZlcmJvc2UoY29tcG9uZW50RGVmLmlkICsgJyA6OiBCdWlsZGluZyBjb21wb25lbnQgcHJvdG90eXBlLi4uJyk7XG5cdHZhciBjb21wb25lbnRQcm90b3R5cGUgPSBGUkFNRVdPUksuQ29tcG9uZW50LmV4dGVuZChjb21wb25lbnREZWYpO1xuXG5cdC8vIERpc2NvdmVyIHN1YnNjcmlwdGlvbnNcblx0Y29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZS5zdWJzY3JpcHRpb25zID0ge307XG5cblx0Ly8gSXRlcmF0ZSB0aHJvdWdoIGVhY2ggcHJvcGVydHkgb24gdGhpcyBjb21wb25lbnQgcHJvdG90eXBlXG5cdF8uZWFjaChjb21wb25lbnRQcm90b3R5cGUucHJvdG90eXBlLCBmdW5jdGlvbiAoaGFuZGxlciwga2V5KSB7XG5cblx0XHQvLyBEZXRlY3QgRE9NIGV2ZW50cyBhbmQgc21hc2ggdGhlbSBpbnRvIHRoZSBldmVudHMgaGFzaFxuXHRcdHZhciBtYXRjaGVkRE9NRXZlbnRzID0ga2V5Lm1hdGNoKEV2ZW50c1snL0RPTUV2ZW50LyddKTtcblx0XHRpZiAobWF0Y2hlZERPTUV2ZW50cykge1xuXHRcdFx0dmFyIGV2ZW50TmFtZSA9IG1hdGNoZWRET01FdmVudHNbMV07XG5cdFx0XHR2YXIgZGVsZWdhdGVTZWxlY3RvciA9IG1hdGNoZWRET01FdmVudHNbM107XG5cblx0XHRcdC8vIFN0b3cgdGhlbSBpbiBldmVudHMgaGFzaFxuXHRcdFx0Y29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZS5ldmVudHMgPSBjb21wb25lbnRQcm90b3R5cGUucHJvdG90eXBlLmV2ZW50cyB8fCB7fTtcblx0XHRcdGNvbXBvbmVudFByb3RvdHlwZS5wcm90b3R5cGUuZXZlbnRzW2tleV0gPSBoYW5kbGVyO1xuXHRcdH1cblxuXHRcdC8vIEFkZCBhcHAgZXZlbnRzICglKSwgcm91dGVzICgjKSwgYW5kIGRhdGEgbGlzdGVuZXJzICh+KSB0byBzdWJzY3JpcHRpb25zIGhhc2hcblx0XHRpZiAoa2V5Lm1hdGNoKC9eKCV8I3x+KS8pKSB7XG5cdFx0XHRpZiAoXy5pc1N0cmluZyhoYW5kbGVyKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoY29tcG9uZW50RGVmLmlkICsgJzo6IEludmFsaWQgbGlzdGVuZXIgZm9yIHN1YnNjcmlwdGlvbjogJyArIGtleSArICcuXFxuJyArXG5cdFx0XHRcdFx0J0RlZmluZSB5b3VyIGNhbGxiYWNrIHdpdGggYW4gYW5vbnltb3VzIGZ1bmN0aW9uIGluc3RlYWQgb2YgYSBzdHJpbmcuJ1xuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFfLmlzRnVuY3Rpb24oaGFuZGxlcikpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGNvbXBvbmVudERlZi5pZCArJzo6IEludmFsaWQgbGlzdGVuZXIgZm9yIHN1YnNjcmlwdGlvbjogJyArIGtleSk7XG5cdFx0XHR9XG5cdFx0XHRjb21wb25lbnRQcm90b3R5cGUucHJvdG90eXBlLnN1YnNjcmlwdGlvbnNba2V5XSA9IGhhbmRsZXI7XG5cdFx0fVxuXG5cdFx0Ly8gRXh0ZW5kIG9uZSBvciBtb3JlIG90aGVyIGNvbXBvbmVudHNcblx0XHRlbHNlIGlmIChrZXkgPT09ICdleHRlbmRDb21wb25lbnRzJykge1xuXHRcdFx0dmFyIG9ialRvTWVyZ2UgPSB7fTtcblx0XHRcdF8uZWFjaChoYW5kbGVyLCBmdW5jdGlvbihjaGlsZElkKXtcblxuXHRcdFx0XHRpZiAoIUZSQU1FV09SSy5jb21wb25lbnRzW2NoaWxkSWRdKXtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoXG5cdFx0XHRcdFx0Y29tcG9uZW50RGVmLmlkICsgJyA6OiAnICtcblx0XHRcdFx0XHQnVHJ5aW5nIHRvIGRlZmluZS9leHRlbmQgdGhpcyBjb21wb25lbnQgZnJvbSBgJyArIGNoaWxkSWQgKyAnYCwgJyArXG5cdFx0XHRcdFx0J2J1dCBubyBjb21wb25lbnQgd2l0aCB0aGF0IGlkIGNhbiBiZSBmb3VuZC4nXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdF8uZXh0ZW5kKG9ialRvTWVyZ2UsIEZSQU1FV09SSy5jb21wb25lbnRzW2NoaWxkSWRdKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRfLmRlZmF1bHRzKGNvbXBvbmVudFByb3RvdHlwZS5wcm90b3R5cGUsIG9ialRvTWVyZ2UpO1xuXHRcdH1cblx0fSk7XG5cblx0Ly8gU2F2ZSBwcm90b3R5cGUgaW4gZ2xvYmFsIHNldCBmb3IgdHJhY2tpbmdcblx0RlJBTUVXT1JLLmNvbXBvbmVudHNbY29tcG9uZW50RGVmLmlkXSA9IGNvbXBvbmVudFByb3RvdHlwZTtcbn07XG4iLCIvKipcbiAqIENvbGxlY3QgYW55IHJlZ2lvbnMgd2l0aCB0aGUgZGVmYXVsdCBjb21wb25lbnQgc2V0IGZyb20gdGhlIERPTS5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNvbGxlY3RSZWdpb25zICgpIHtcblxuXHQvLyBQcm92aWRlIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5IGZvciBsZWdhY3kgbm90YXRpb25cblx0JCgncmVnaW9uW2RlZmF1bHRdLHJlZ2lvblt0ZW1wbGF0ZV0sW2RhdGEtcmVnaW9uXVtkZWZhdWx0XSxbZGF0YS1yZWdpb25dW3RlbXBsYXRlXScpLmVhY2goZnVuY3Rpb24oKSB7XG5cdFx0JGUgPSAkKHRoaXMpO1xuXHRcdHZhciBjb21wb25lbnRJZCA9ICRlLmF0dHIoJ2RlZmF1bHQnKSB8fCAkZS5hdHRyKCd0ZW1wbGF0ZScpO1xuXHRcdCRlLmF0dHIoJ2NvbnRlbnRzJywgY29tcG9uZW50SWQpO1xuXHR9KTtcblxuXHQvLyBOb3cgaW5zdGFudGlhdGUgdGhlIGFwcHJvcHJpYXRlIGRlZmF1bHQgY29tcG9uZW50IGluIGVhY2hcblx0Ly8gcmVnaW9uIHdpdGggYSBzcGVjaWZpZWQgdGVtcGxhdGUvY29tcG9uZW50XG5cdCQoJ3JlZ2lvbltjb250ZW50c10sW2RhdGEtcmVnaW9uXVtjb250ZW50c10nKS5lYWNoKGZ1bmN0aW9uKCkge1xuXHRcdEZSQU1FV09SSy5SZWdpb24uZnJvbUVsZW1lbnQodGhpcyk7XG5cdH0pO1xufVxuIiwiLyoqXG4gKiBMb2FkIGFueSBzY3JpcHQgdGFncyBvbiB0aGUgcGFnZSB3aXRoIHR5cGU9XCJ0ZXh0L3RlbXBsYXRlXCIuXG4gKlxuICogQHJldHVybiB7T2JqZWN0fSBbT2JqZWN0IGNvbnNpc3Rpbmcgb2YgYSB0ZW1wbGF0ZSBpZGVudGlmaWVyIGFuZCBpdHMgSFRNTC5dXG4gKi9cblxudmFyIFV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMvdXRpbHMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjb2xsZWN0VGVtcGxhdGVzKCkge1xuXHR2YXIgdGVtcGxhdGVzID0ge307XG5cblx0JCgnc2NyaXB0W3R5cGU9XCJ0ZXh0L3RlbXBsYXRlXCJdJykuZWFjaChmdW5jdGlvbiAoaSwgZWwpIHtcblx0XHR2YXIgaWQgPSBVdGlscy5lbDJpZChlbCwgdHJ1ZSk7XG5cdFx0dGVtcGxhdGVzW2lkXSA9ICQoZWwpLmh0bWwoKTtcblxuXHRcdC8vIFN0cmlwIHdoaXRlc3BhY2UgbGVmdG92ZXIgZnJvbSBzY3JpcHQgdGFnc1xuXHRcdHRlbXBsYXRlc1tpZF0gPSB0ZW1wbGF0ZXNbaWRdLnJlcGxhY2UoL15cXHMrLywnJyk7XG5cdFx0dGVtcGxhdGVzW2lkXSA9IHRlbXBsYXRlc1tpZF0ucmVwbGFjZSgvXFxzKyQvLCcnKTtcblxuXHRcdC8vIFJlbW92ZSBmcm9tIERPTVxuXHRcdCQoZWwpLnJlbW92ZSgpO1xuXHR9KTtcblxuXHRyZXR1cm4gdGVtcGxhdGVzO1xufTtcbiIsIi8qKlxuICogVGhpcyBpcyB0aGUgc3RhcnRpbmcgcG9pbnQgdG8geW91ciBhcHBsaWNhdGlvbi4gIFlvdSBzaG91bGQgZ3JhYiB0ZW1wbGF0ZXMgYW5kIGNvbXBvbmVudHNcbiAqIGJlZm9yZSBjYWxsaW5nIEZSQU1FV09SSy5yYWlzZSgpIHVzaW5nIHNvbWV0aGluZyBsaWtlIFJlcXVpcmUuanMuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnNcblx0XHRkYXRhOiB7IGF1dGhlbnRpY2F0ZWQ6IGZhbHNlIH0sXG5cdFx0dGVtcGxhdGVzOiB7IGNvbXBvbmVudE5hbWU6IEhUTUxPclByZWNvbXBpbGVkRm4gfSxcblx0XHRjb21wb25lbnRzOiB7IGNvbXBvbmVudE5hbWU6IENvbXBvbmVudERlZmluaXRpb24gfVxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2JcbiAqL1xuXG52YXIgTG9nZ2VyID0gcmVxdWlyZSgnLi4vbG9nZ2VyL2luZGV4Jyk7XG52YXIgYnVpbGRDb21wb25lbnREZWZpbml0aW9uID0gcmVxdWlyZSgnLi4vZGVmaW5lL2J1aWxkRGVmaW5pdGlvbicpO1xudmFyIGJ1aWxkQ29tcG9uZW50UHJvdG90eXBlID0gcmVxdWlyZSgnLi9idWlsZFByb3RvdHlwZScpO1xudmFyIGNvbGxlY3RUZW1wbGF0ZXMgPSByZXF1aXJlKCcuL2NvbGxlY3RUZW1wbGF0ZXMnKTtcbnZhciBjb2xsZWN0UmVnaW9ucyA9IHJlcXVpcmUoJy4vY29sbGVjdFJlZ2lvbnMnKTtcbnZhciBzZXR1cFJvdXRlciA9IHJlcXVpcmUoJy4uL3JvdXRlci9pbmRleCcpO1xuXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcmFpc2Uob3B0aW9ucywgY2IpIHtcblxuXHQvLyBJZiBvbmx5IG9uZSBhcmcgaXMgcHJlc2VudCwgdXNlIG9wdGlvbnMgYXMgY2FsbGJhY2sgaWYgcG9zc2libGUuXG5cdC8vIElmIG9wdGlvbnMgYXJlIG5vdCBkZWZpbmVkLCB1c2UgYW4gZW1wdHkgb2JqZWN0LlxuXHRpZiAoIWNiICYmIF8uaXNGdW5jdGlvbihvcHRpb25zKSkge1xuXHRcdGNiID0gb3B0aW9ucztcblx0fVxuXHRpZiAoIV8uaXNQbGFpbk9iamVjdChvcHRpb25zKSkge1xuXHRcdG9wdGlvbnMgPSB7fTtcblx0fVxuXG5cdC8vIEludGVycHJldCBgcHJvZHVjdGlvbmAgYXMgYGxvZ0xldmVsID09PSAnc2lsZW50J2Bcblx0aWYgKEZSQU1FV09SSy5vcHRpb25zLnByb2R1Y3Rpb24pIHtcblx0XHRGUkFNRVdPUksub3B0aW9ucy5sb2dMZXZlbCA9ICdzaWxlbnQnO1xuXHR9XG5cblx0Ly8gSW5pdGlhbGl6ZSBsb2dnZXJcblx0bmV3IExvZ2dlcigpO1xuXG5cdC8vIE1lcmdlIGRhdGEgaW50byBGUkFNRVdPUksuZGF0YVxuXHRfLmV4dGVuZChGUkFNRVdPUksuZGF0YSwgb3B0aW9ucy5kYXRhIHx8IHt9KTtcblxuXHQvLyBNZXJnZSBzcGVjaWZpZWQgdGVtcGxhdGVzIHdpdGggRlJBTUVXT1JLLnRlbXBsYXRlc1xuXHRfLmV4dGVuZChGUkFNRVdPUksudGVtcGxhdGVzLCBvcHRpb25zLnRlbXBsYXRlcyB8fCB7fSk7XG5cblx0Ly8gSWYgRlJBTUVXT1JLLmRlZmluZSgpIHdhcyB1c2VkLCBidWlsZCB0aGUgbGlzdCBvZiBjb21wb25lbnRzXG5cdC8vIEl0ZXJhdGUgdGhyb3VnaCB0aGUgZGVmaW5lIHF1ZXVlIGFuZCBjcmVhdGUgZWFjaCBkZWZpbml0aW9uXG5cdF8uZWFjaChGUkFNRVdPUksuX2RlZmluZVF1ZXVlLCBidWlsZENvbXBvbmVudERlZmluaXRpb24pO1xuXG5cdC8vIE1lcmdlIHNwZWNpZmllZCBjb21wb25lbnRzIHcvIEZSQU1FV09SSy5jb21wb25lbnRzXG5cdF8uZXh0ZW5kKEZSQU1FV09SSy5jb21wb25lbnRzLCBvcHRpb25zLmNvbXBvbmVudHMgfHwge30pO1xuXG5cdC8vIEJhY2sgdXAgZWFjaCBjb21wb25lbnQgZGVmaW5pdGlvbiBiZWZvcmUgdHJhbnNmb3JtaW5nIGl0IGludG8gYSBsaXZlIHByb3RvdHlwZVxuXHRGUkFNRVdPUksuY29tcG9uZW50RGVmcyA9IF8uY2xvbmUoRlJBTUVXT1JLLmNvbXBvbmVudHMpO1xuXG5cdC8vIFJ1biB0aGlzIGNhbGwgYmFjayB3aGVuIHRoZSBET00gaXMgcmVhZHlcblx0JChmdW5jdGlvbiAoKSB7XG5cblx0XHQvLyBDb2xsZWN0IGFueSA8c2NyaXB0PiB0YWcgdGVtcGxhdGVzIG9uIHRoZSBwYWdlXG5cdFx0Ly8gYW5kIGFic29yYiB0aGVtIGludG8gRlJBTUVXT1JLLnRlbXBsYXRlc1xuXHRcdF8uZXh0ZW5kKEZSQU1FV09SSy50ZW1wbGF0ZXMsIGNvbGxlY3RUZW1wbGF0ZXMoKSk7XG5cblx0XHQvLyBCdWlsZCBhY3R1YWwgcHJvdG90eXBlcyBmb3IgdGhlIGNvbXBvbmVudHNcblx0XHQvLyAobmVlZCB0aGUgdGVtcGxhdGVzIGF0IHRoaXMgcG9pbnQgdG8gbWFrZSB0aGlzIHdvcmspXG5cdFx0Xy5lYWNoKEZSQU1FV09SSy5jb21wb25lbnRzLCBidWlsZENvbXBvbmVudFByb3RvdHlwZSk7XG5cblx0XHQvLyBHcmFiIGluaXRpYWwgcmVnaW9ucyBmcm9tIERPTVxuXHRcdGNvbGxlY3RSZWdpb25zKCk7XG5cblx0XHQvLyBCaW5kIGdsb2JhbCBET00gZXZlbnRzIGFzIEZSQU1FV09SSyBldmVudHNcblx0XHQvLyAoZS5nLiAld2luZG93OnJlc2l6ZSlcblx0XHR2YXIgdHJpZ2dlclJlc2l6ZUV2ZW50ID0gXy5kZWJvdW5jZShmdW5jdGlvbiAoKSB7XG5cdFx0XHRGUkFNRVdPUksudHJpZ2dlcignJXdpbmRvdzpyZXNpemUnKTtcblx0XHR9LCBGUkFNRVdPUksub3B0aW9ucy50aHJvdHRsZVdpbmRvd1Jlc2l6ZSB8fCAwKTtcblx0XHQkKHdpbmRvdykucmVzaXplKHRyaWdnZXJSZXNpemVFdmVudCk7XG5cdFx0Ly8gVE9ETzogYWRkIG1vcmUgZXZlbnRzIGFuZCBleHRyYXBvbGF0ZSB0aGlzIGxvZ2ljIHRvIGEgc2VwYXJhdGUgbW9kdWxlXG5cblx0XHQvLyBEbyB0aGUgaW5pdGlhbCByb3V0aW5nIHNlcXVlbmNlXG5cdFx0Ly8gTG9vayBhdCB0aGUgI2ZyYWdtZW50IHVybCBhbmQgZmlyZSB0aGUgZ2xvYmFsIHJvdXRlIGV2ZW50XG5cdFx0c2V0dXBSb3V0ZXIoKTtcblx0XHRGUkFNRVdPUksuaGlzdG9yeS5zdGFydChfLmRlZmF1bHRzKHtcblx0XHRcdHB1c2hTdGF0ZTogdW5kZWZpbmVkLFxuXHRcdFx0aGFzaENoYW5nZTogdW5kZWZpbmVkLFxuXHRcdFx0cm9vdDogdW5kZWZpbmVkXG5cdFx0fSwgb3B0aW9ucykpO1xuXG5cdFx0aWYgKGNiKSBjYigpO1xuXHR9KTtcbn07XG4iLCIvKipcbiAqIEFwcGVuZCBhIGNvbXBvbmVudCB0byB0aGUgZW5kIG9mIGEgcmVnaW9uLiBUaGlzIGNhbGxzIGluc2VydCBhdCB0aGUgbGFzdCBwb3NpdGlvbi5cbiAqXG4gKiBAcGFyYW0gIHtTdHJpbmd9IGNvbXBvbmVudElkIFtUaGUgY29tcG9uZW50IGlkIHRoYXQgd2Ugd2FudCB0byBhcHBlbmRdXG4gKiBAcGFyYW0gIHtPYmplY3R9IHByb3BlcnRpZXMgIFtQcm9wZXJ0aWVzIHRvIGluc3RhbnRpYXRlIHRoZSBjb21wb25lbnQgd2l0aF1cbiAqXG4gKiBAcmV0dXJuIHtDb21wb25lbnR9ICAgICAgICAgIFtOZXdseSBhcHBlbmRlZCBDb21wb25lbnRdXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYXBwZW5kKGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKSB7XG5cdC8vIEluc2VydCBhdCBsYXN0IHBvc2l0aW9uXG5cdHJldHVybiB0aGlzLmluc2VydCh0aGlzLl9jaGlsZHJlbi5sZW5ndGgsIGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKTtcbn07XG4iLCIvKipcbiAqIFNob3J0Y3V0IGZvciBjYWxsaW5nIGVtcHR5KCkgYW5kIHRoZW4gYXBwZW5kKCksXG4gKiBUaGlzIGlzIHRoZSBnZW5lcmFsIHVzZSBjYXNlIGZvciBtYW5hZ2luZyBzdWJjb21wb25lbnRzXG4gKiAoZS5nLiB3aGVuIGEgbmF2YmFyIGl0ZW0gaXMgdG91Y2hlZClcbiAqXG4gKiBAcGFyYW0gIHtTdHJpbmd9IGNvbXBvbmVudCAgW1RoZSBpZCBuYW1lIG9mIHRoZSBjb21wb25ldCB0aGF0IHlvdSB3YW50IHRvIGF0dGFjaF1cbiAqIEBwYXJhbSAge09iamVjdH0gcHJvcGVydGllcyBbUHJvcGVydGllcyB0aGF0IHRoZSBhdHRhY2hlZCBjb21wb25lbnQgd2lsbCBiZSBpbml0YWxpemVkIHdpdGhdXG4gKlxuICogQHJldHVybiB7Q29tcG9uZW50fSBcdFx0XHRcdCBbTmV3bHkgYXR0YWNoZWQgY29tcG9uZW50XVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGF0dGFjaChjb21wb25lbnQsIHByb3BlcnRpZXMpIHtcblx0dGhpcy5lbXB0eSgpO1xuXHRyZXR1cm4gdGhpcy5hcHBlbmQoY29tcG9uZW50LCBwcm9wZXJ0aWVzKTtcbn07XG4iLCIvKipcbiAqIHJlZ2lvbi5lbXB0eSggKVxuICpcbiAqIEl0ZXJhdGUgb3ZlciBlYWNoIGNvbXBvbmVudCBpbiB0aGlzIHJlZ2lvbiBhbmQgY2FsbCAuY2xvc2UoKSBvbiBpdFxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGVtcHR5KCkge1xuXHRGUkFNRVdPUksuZGVidWcodGhpcy5wYXJlbnQuaWQgKyAnIDo6IEVtcHR5aW5nIHJlZ2lvbjogJyArIHRoaXMuaWQpO1xuXHR3aGlsZSAodGhpcy5fY2hpbGRyZW4ubGVuZ3RoID4gMCkge1xuXHRcdHRoaXMucmVtb3ZlKDApO1xuXHR9XG59O1xuIiwiLyoqXG4gKiBGYWN0b3J5IG1ldGhvZCB0byBnZW5lcmF0ZSBhIG5ldyByZWdpb24gaW5zdGFuY2UgZnJvbSBhIERPTSBlbGVtZW50XG4gKiBJbXBsZW1lbnRzIGB0ZW1wbGF0ZWAsIGBjb3VudGAsIGFuZCBgZGF0YS0qYCBIVE1MIGF0dHJpYnV0ZXMuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnNcbiAqIEByZXR1cm5zIHJlZ2lvbiBpbnN0YW5jZVxuICovXG5cbnZhciBVdGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzL3V0aWxzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZnJvbUVsZW1lbnQoZWwsIHBhcmVudCkge1xuXG5cdC8vIElmIHBhcmVudCBpcyBub3Qgc3BlY2lmaWVkLCBtYWtlLWJlbGlldmUuXG5cdHBhcmVudCA9IHBhcmVudCB8fCB7IGlkOiAnKicgfTtcblxuXG5cblx0Ly8gQnVpbGQgcmVnaW9uXG5cdHZhciByZWdpb24gPSBuZXcgRlJBTUVXT1JLLlJlZ2lvbih7XG5cdFx0aWQ6IFV0aWxzLmVsMmlkKGVsKSxcblx0XHQkZWw6ICQoZWwpLFxuXHRcdHBhcmVudDogcGFyZW50XG5cdH0pO1xuXG5cdC8vIElmIHRoaXMgcmVnaW9uIGhhcyBhIGRlZmF1bHQgY29tcG9uZW50L3RlbXBsYXRlIHNldCxcblx0Ly8gZ3JhYiB0aGUgaWQgIC0tICBlLmcuIDxyZWdpb24gY29udGVudHM9XCJGb29cIiAvPlxuXHR2YXIgY29tcG9uZW50SWQgPSAkKGVsKS5hdHRyKCdjb250ZW50cycpO1xuXG5cblx0Ly8gSWYgYGNvdW50YCBpcyBzZXQsIHJlbmRlciBzdWItY29tcG9uZW50IHNwZWNpZmllZCBudW1iZXIgb2YgdGltZXMuXG5cdC8vIGUuZy4gPHJlZ2lvbiB0ZW1wbGF0ZT1cIkZvb1wiIGNvdW50PVwiM1wiIC8+XG5cdC8vICh2ZXJpZnkgRlJBTUVXT1JLLnNob3J0Y3V0LmNvdW50IGlzIGVuYWJsZWQpXG5cdHZhciBjb3VudEF0dHIsXG5cdFx0XHRjb3VudCA9IDE7XG5cblx0Ly8gVE9ETzogZml4IGNvdW50LS0gaXQgZG9lc24ndCB3b3JrIHlldFxuXHRpZiAoRlJBTUVXT1JLLm9wdGlvbnMuc2hvcnRjdXQuY291bnQpIHtcblxuXHRcdC8vIElmIGBjb3VudGAgYXR0cmlidXRlIGlzIG5vdCBmYWxzZSBvciB1bmRlZmluZWQsXG5cdFx0Ly8gdGhhdCBtZWFucyBpdCB3YXMgc2V0IGV4cGxpY2l0bHksIGFuZCB3ZSBzaG91bGQgdXNlIGl0XG5cdFx0Y291bnRBdHRyID0gJChlbCkuYXR0cignY291bnQnKTtcblx0XHQvLyBGUkFNRVdPUksuZGVidWcoJ0NvdW50IGF0dHIgaXMgOjogJywgY291bnRBdHRyKTtcblx0XHRpZiAoISFjb3VudEF0dHIpIHtcblx0XHRcdGNvdW50ID0gY291bnRBdHRyO1xuXHRcdH1cblx0fVxuXG5cblxuXG5cdEZSQU1FV09SSy5kZWJ1Zyhcblx0XHRwYXJlbnQuaWQgKyAnIDotOiBJbnN0YW50aWF0ZWTCoG5ldyByZWdpb24nICtcblx0XHQoIHJlZ2lvbi5pZCA/ICcgYCcgKyByZWdpb24uaWQgKyAnYCcgOiAnJyApICtcblx0XHQoIGNvbXBvbmVudElkID8gJyBhbmQgcG9wdWxhdGVkIGl0IHdpdGgnICtcblx0XHRcdCggY291bnQgPiAxID8gY291bnQgKyAnIGluc3RhbmNlcyBvZicgOiAnIDEnICkgK1xuXHRcdFx0JyBgJyArIGNvbXBvbmVudElkICsgJ2AnIDogJydcblx0XHQpICsgJy4nXG5cdCk7XG5cblxuXG5cdC8vIEFwcGVuZCBzdWItY29tcG9uZW50KHMpIHRvIHJlZ2lvbiBhdXRvbWF0aWNhbGx5XG5cdC8vICh2ZXJpZnkgRlJBTUVXT1JLLnNob3J0Y3V0LnRlbXBsYXRlIGlzIGVuYWJsZWQpXG5cdGlmICggRlJBTUVXT1JLLm9wdGlvbnMuc2hvcnRjdXQudGVtcGxhdGUgJiYgY29tcG9uZW50SWQgKSB7XG5cblx0XHQvLyBGUkFNRVdPUksuZGVidWcoXG5cdFx0Ly8gXHQnUHJlcGFyaW5nIHRvIHJlbmRlciAnICsgY291bnQgKyAnICcgKyBjb21wb25lbnRJZCArICcgY29tcG9uZW50cyBpbnRvIHJlZ2lvbiAnICtcblx0XHQvLyBcdCcoJyArIHJlZ2lvbi5pZCArICcpLCB3aGljaCBhbHJlYWR5IGNvbnRhaW5zICcgKyByZWdpb24uJGVsLmNoaWxkcmVuKCkubGVuZ3RoICtcblx0XHQvLyBcdCcgc3ViY29tcG9uZW50cy4nXG5cdFx0Ly8gKTtcblxuXHRcdHJlZ2lvbi5hcHBlbmQoY29tcG9uZW50SWQpO1xuXG5cdFx0Ly8gLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cdFx0Ly8gLy8gU0VSSU9VU0xZIFdURlxuXHRcdC8vIC8vIE1BSk9SIEhBWFhYWFhYWFxuXHRcdC8vIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXHRcdC8vIGNvdW50ID0gK2NvdW50ICsgMTtcblx0XHQvLyAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxuXHRcdC8vIGZvciAodmFyIGo9MDsgaiA8IGNvdW50OyBqKysgKSB7XG5cblx0XHQvLyBcdHJlZ2lvbi5hcHBlbmQoY29tcG9uZW50SWQpO1xuXG5cdFx0Ly8gXHQvLyBGUkFNRVdPUksuZGVidWcoXG5cdFx0Ly8gXHQvLyBcdCdyZW5kZXJpbmcgdGhlICcgKyBjb21wb25lbnRJZCArICcgY29tcG9uZW50LCByZW1haW5pbmc6ICcgK1xuXHRcdC8vIFx0Ly8gXHRjb3VudCArICcgYW5kIHRoZXJlIGFyZSAnICsgcmVnaW9uLiRlbC5jaGlsZHJlbigpLmxlbmd0aCArXG5cdFx0Ly8gXHQvLyBcdCcgc3ViY29tcG9uZW50IGVsZW1lbnRzIGluIHRoZSByZWdpb24gbm93J1xuXHRcdC8vIFx0Ly8gKTtcblxuXHRcdC8vIH1cblxuXHR9XG5cblx0cmV0dXJuIHJlZ2lvbjtcbn07XG4iLCIvKipcbiAqIFJlZ2lvbnNcbiAqL1xuXG52YXIgaW5zZXJ0ID0gcmVxdWlyZSgnLi9pbnNlcnQnKSxcblx0XHRyZW1vdmUgPSByZXF1aXJlKCcuL3JlbW92ZScpLFxuXHRcdGVtcHR5ID0gcmVxdWlyZSgnLi9lbXB0eScpLFxuXHRcdGFwcGVuZCA9IHJlcXVpcmUoJy4vYXBwZW5kJyksXG5cdFx0YXR0YWNoID0gcmVxdWlyZSgnLi9hdHRhY2gnKSxcblx0XHRwcmVwZW5kID0gcmVxdWlyZSgnLi9wcmVwZW5kJyksXG5cdFx0ZnJvbUVsZW1lbnQgPSByZXF1aXJlKCcuL2Zyb21FbGVtZW50Jyk7XG5cblJlZ2lvbiA9IG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcmVnaW9uKHByb3BlcnRpZXMpIHtcblxuXHRfLmV4dGVuZCh0aGlzLCBGUkFNRVdPUksuRXZlbnRzKTtcblxuXHRpZiAoIXByb3BlcnRpZXMpIHtcblx0XHRwcm9wZXJ0aWVzID0ge307XG5cdH1cblx0aWYgKCFwcm9wZXJ0aWVzLiRlbCkge1xuXHRcdHRocm93IG5ldyBFcnJvcignVHJ5aW5nIHRvIGluc3RhbnRpYXRlIHJlZ2lvbiB3aXRoIG5vICRlbCEnKTtcblx0fVxuXG5cdC8vIEZvbGQgaW4gcHJvcGVydGllcyB0byBwcm90b3R5cGVcblx0Xy5leHRlbmQodGhpcywgcHJvcGVydGllcyk7XG5cblx0Ly8gSWYgbmVpdGhlciBhbiBpZCBub3IgYSBgdGVtcGxhdGVgIHdhcyBzcGVjaWZpZWQsXG5cdC8vIHdlJ2xsIHRocm93IGFuIGVycm9yLCBzaW5jZSB0aGVyZSdzIG5vIHdheSB0byBnZXQgYSBob2xkIG9mIHRoZSByZWdpb25cblx0aWYgKCF0aGlzLmlkICYmICEodGhpcy4kZWwuYXR0cignZGVmYXVsdCcpIHx8IHRoaXMuJGVsLmF0dHIoJ3RlbXBsYXRlJykgfHxcblx0XHR0aGlzLiRlbC5hdHRyKCdjb250ZW50cycpKSkge1xuXG5cdFx0dGhyb3cgbmV3IEVycm9yKFxuXHRcdFx0dGhpcy5wYXJlbnQuaWQgKyAnIDo6IEVpdGhlciBgZGF0YS1pZGAsIGBjb250ZW50c2AsIG9yIGJvdGggJyArXG5cdFx0XHQnbXVzdCBiZSBzcGVjaWZpZWQgb24gcmVnaW9ucy4gXFxuJyArXG5cdFx0XHQnZS5nLiA8cmVnaW9uIGRhdGEtaWQ9XCJmb29cIiB0ZW1wbGF0ZT1cIlNvbWVDb21wb25lbnRcIj48L3JlZ2lvbj4nXG5cdFx0KTtcblx0fVxuXG5cdC8vIFNldCB1cCBsaXN0IHRvIGhvdXNlIGNoaWxkIGNvbXBvbmVudHNcblx0dGhpcy5fY2hpbGRyZW4gPSBbXTtcblxuXHRfLmJpbmRBbGwodGhpcyk7XG5cblx0Ly8gU2V0IHVwIGNvbnZlbmllbmNlIGFjY2VzcyB0byB0aGlzIHJlZ2lvbiBpbiB0aGUgZ2xvYmFsIHJlZ2lvbiBjYWNoZVxuXHRGUkFNRVdPUksucmVnaW9uc1t0aGlzLmlkXSA9IHRoaXM7XG59O1xuXG5SZWdpb24uZnJvbUVsZW1lbnQgPSBmdW5jdGlvbihlbCwgcGFyZW50KSB7XG5cdHJldHVybiBmcm9tRWxlbWVudChlbCwgcGFyZW50KTtcbn07XG5SZWdpb24ucHJvdG90eXBlLnJlbW92ZSA9IGZ1bmN0aW9uKGF0SW5kZXgpIHtcblx0cmV0dXJuIHJlbW92ZS5jYWxsKHRoaXMsIGF0SW5kZXgpO1xufTtcblJlZ2lvbi5wcm90b3R5cGUuZW1wdHkgPSBmdW5jdGlvbigpIHtcblx0cmV0dXJuIGVtcHR5LmNhbGwodGhpcyk7XG59O1xuUmVnaW9uLnByb3RvdHlwZS5pbnNlcnQgPSBmdW5jdGlvbihhdEluZGV4LCBjb21wb25lbnRJZCwgcHJvcGVydGllcykge1xuXHRyZXR1cm4gaW5zZXJ0LmNhbGwodGhpcywgYXRJbmRleCwgY29tcG9uZW50SWQsIHByb3BlcnRpZXMpO1xufTtcblJlZ2lvbi5wcm90b3R5cGUuYXBwZW5kID0gZnVuY3Rpb24oY29tcG9uZW50SWQsIHByb3BlcnRpZXMpIHtcblx0cmV0dXJuIGFwcGVuZC5jYWxsKHRoaXMsIGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKTtcbn07XG5SZWdpb24ucHJvdG90eXBlLmF0dGFjaCA9IGZ1bmN0aW9uKGNvbXBvbmVudCwgcHJvcGVydGllcykge1xuXHRyZXR1cm4gYXR0YWNoLmNhbGwodGhpcywgY29tcG9uZW50LCBwcm9wZXJ0aWVzKTtcbn07XG5SZWdpb24ucHJvdG90eXBlLnByZXBlbmQgPSBmdW5jdGlvbihjb21wb25lbnRJZCwgcHJvcGVydGllcykge1xuXHRyZXR1cm4gcHJlcGVuZC5jYWxsKHRoaXMsIGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKTtcbn07XG4iLCIvKipcbiAqIHJlZ2lvbi5pbnNlcnQoIGF0SW5kZXgsIGNvbXBvbmVudElkLCBbcHJvcGVydGllc10gKVxuICpcbiAqIFRPRE86IHN1cHBvcnQgYSBsaXN0IG9mIHByb3BlcnRpZXMgb2JqZWN0cyBpbiBsaWV1IG9mIHRoZSBwcm9wZXJ0aWVzIG9iamVjdFxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaW5zZXJ0KGF0SW5kZXgsIGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKSB7XG5cblx0dmFyIGVyciA9ICcnO1xuXHRpZiAoIShhdEluZGV4IHx8IF8uaXNGaW5pdGUoYXRJbmRleCkpKSB7XG5cdFx0ZXJyICs9IHRoaXMuaWQgKyAnLmluc2VydCgpIDo6IE5vIGF0SW5kZXggc3BlY2lmaWVkISc7XG5cdH1cblx0ZWxzZSBpZiAoIWNvbXBvbmVudElkKSB7XG5cdFx0ZXJyICs9IHRoaXMuaWQgKyAnLmluc2VydCgpIDo6IE5vIGNvbXBvbmVudElkIHNwZWNpZmllZCEnO1xuXHR9XG5cdGlmIChlcnIpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoZXJyICsgJ1xcblVzYWdlOiBhcHBlbmQoYXRJbmRleCwgY29tcG9uZW50SWQsIFtwcm9wZXJ0aWVzXSknKTtcblx0fVxuXG5cdHZhciBjb21wb25lbnQ7XG5cdC8vIElmIGNvbXBvbmVudElkIGlzIGEgc3RyaW5nLCBsb29rIHVwIGNvbXBvbmVudCBwcm90b3R5cGUgYW5kIGluc3RhdGlhdGVcblx0aWYgKCdzdHJpbmcnID09IHR5cGVvZiBjb21wb25lbnRJZCkge1xuXG5cdFx0dmFyIGNvbXBvbmVudFByb3RvdHlwZSA9IEZSQU1FV09SSy5jb21wb25lbnRzW2NvbXBvbmVudElkXTtcblxuXHRcdGlmICghY29tcG9uZW50UHJvdG90eXBlKSB7XG5cdFx0XHR2YXIgdGVtcGxhdGUgPSBGUkFNRVdPUksudGVtcGxhdGVzW2NvbXBvbmVudElkXTtcblx0XHRcdGlmICghdGVtcGxhdGUpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yICgnSW4gJyArXG5cdFx0XHRcdFx0KHRoaXMuaWQgfHwgJ0Fub255bW91cyByZWdpb24nKSArICc6OiBUcnlpbmcgdG8gYXR0YWNoICcgK1xuXHRcdFx0XHRcdGNvbXBvbmVudElkICsgJywgYnV0IG5vIGNvbXBvbmVudCBvciB0ZW1wbGF0ZSBleGlzdHMgd2l0aCB0aGF0IGlkLicpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZiBubyBjb21wb25lbnQgcHJvdG90eXBlIHdpdGggdGhpcyBpZCBleGlzdHMsXG5cdFx0XHQvLyBjcmVhdGUgYW4gYW5vbnltb3VzIG9uZSB0byB1c2Vcblx0XHRcdGNvbXBvbmVudFByb3RvdHlwZSA9IEZSQU1FV09SSy5Db21wb25lbnQuZXh0ZW5kKHtcblx0XHRcdFx0aWQ6IGNvbXBvbmVudElkLFxuXHRcdFx0XHR0ZW1wbGF0ZTogdGVtcGxhdGVcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIEluc3RhbnRpYXRlIGFuZCByZW5kZXIgdGhlIGNvbXBvbmVudCBpbnNpZGUgdGhpcyByZWdpb25cblx0XHRjb21wb25lbnQgPSBuZXcgY29tcG9uZW50UHJvdG90eXBlKF8uZXh0ZW5kKHtcblx0XHRcdCRvdXRsZXQ6IHRoaXMuJGVsXG5cdFx0fSwgcHJvcGVydGllcyB8fCB7fSkpO1xuXG5cblx0fVxuXG5cdC8vIE90aGVyd2lzZSBhc3N1bWUgYW4gaW5zdGFudGlhdGVkIGNvbXBvbmVudCBvYmplY3Qgd2FzIHNlbnRcblx0LyogVE9ETzogQ2hlY2sgdGhhdCBjb21wb25lbnQgb2JqZWN0IGlzIHZhbGlkICovXG5cdGVsc2Uge1xuXHRcdGNvbXBvbmVudCA9IGNvbXBvbmVudElkO1xuXHRcdGNvbXBvbmVudC4kb3V0bGV0ID0gdGhpcy4kZWw7XG5cdH1cblxuXHQvLyBTYXZlIHJlZmVyZW5jZSB0byBwYXJlbnRSZWdpb25cblx0Y29tcG9uZW50LnBhcmVudFJlZ2lvbiA9IHRoaXM7XG5cblx0Ly8gQ2hlY2sgdG8gc2VlIGlmIHRoZSBtb2RlbCB3YXMgYWxyZWFkeSBkZWZpbmVkLiBJZiBpdCBpcywgdXNlIHRoYXQgbW9kZWwuIElmIG5vdCwgYXNzaWduIGl0XG5cdC8vIHRoZSBwYXJlbnRzIG1vZGVsIGlmIGl0IGhhcyBvbmUsIG9yIGFzc2lnbiBpdCBhIG5ldyBiYWNrYm9uZSBpbnN0YW5jZS5cblx0aWYgKCFjb21wb25lbnQubW9kZWwpIHtcblx0XHRjb21wb25lbnQubW9kZWwgPSB0aGlzLnBhcmVudC5tb2RlbCA/IHRoaXMucGFyZW50Lm1vZGVsIDogbmV3IEJhY2tib25lLk1vZGVsKCk7XG5cdH1cblxuXHQvLyBSZW5kZXIgY29tcG9uZW50IGludG8gdGhpcyByZWdpb25cblx0Y29tcG9uZW50LnJlbmRlcihhdEluZGV4KTtcblxuXHQvLyBBbmQga2VlcCB0cmFjayBvZiBpdCBpbiB0aGUgbGlzdCBvZiB0aGlzIHJlZ2lvbidzIGNoaWxkcmVuXG5cdHRoaXMuX2NoaWxkcmVuLnNwbGljZShhdEluZGV4LCAwLCBjb21wb25lbnQpO1xuXG5cdC8vIExvZyBmb3IgZGVidWdnaW5nIGBjb3VudGAgZGVjbGFyYXRpdmVcblx0dmFyIGRlYnVnU3RyID0gdGhpcy5wYXJlbnQuaWQgKyAnIDo6IEluc2VydGVkICcgKyBjb21wb25lbnRJZCArICcgaW50byAnO1xuXHRpZiAodGhpcy5pZCkgZGVidWdTdHIgKz0gJ3JlZ2lvbjogJyArIHRoaXMuaWQgKyAnIGF0IGluZGV4ICcgKyBhdEluZGV4O1xuXHRlbHNlIGRlYnVnU3RyICs9ICdhbm9ueW1vdXMgcmVnaW9uIGF0IGluZGV4ICcgKyBhdEluZGV4O1xuXHRGUkFNRVdPUksudmVyYm9zZShkZWJ1Z1N0cik7XG5cblx0cmV0dXJuIGNvbXBvbmVudDtcblxufTtcbiIsIi8qKlxuICogUHJlcGVuZCBhIGNvbXBvbmVudCB0byB0aGUgYmVnaW5uaW5nIG9mIGEgcmVnaW9uLiBUaGlzIGNhbGxzIGluc2VydCBhdCB0aGUgZmlyc3QgcG9zaXRpb24uXG4gKlxuICogQHBhcmFtICB7U3RyaW5nfSBjb21wb25lbnRJZCBbVGhlIGNvbXBvbmVudCBpZCB0aGF0IHdlIHdhbnQgdG8gcHJlcGVuZCBdXG4gKiBAcGFyYW0gIHtPYmplY3R9IHByb3BlcnRpZXMgIFtQcm9wZXJ0aWVzIHRvIGluc3RhbnRpYXRlIHRoZSBjb21wb25lbnQgd2l0aF1cbiAqXG4gKiBAcmV0dXJuIHtDb21wb25lbnR9ICAgICAgICAgIFtOZXdseSBwcmVwZW5kZWQgQ29tcG9uZW50XVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHByZXBlbmQoY29tcG9uZW50SWQsIHByb3BlcnRpZXMpIHtcblx0Ly8gSW5zZXJ0IGF0IGxhc3QgcG9zaXRpb25cblx0cmV0dXJuIHRoaXMuaW5zZXJ0KDAsIGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKTtcbn07XG4iLCIvKipcbiAqIHJlZ2lvbi5yZW1vdmUoIGF0SW5kZXggKVxuICpcbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByZW1vdmUoYXRJbmRleCkge1xuXG5cdGlmICghYXRJbmRleCAmJiAhXy5pc0Zpbml0ZShhdEluZGV4KSkge1xuXHRcdHRocm93IG5ldyBFcnJvcih0aGlzLmlkICsgJy5yZW1vdmUoKSA6OiBObyBhdEluZGV4IHNwZWNpZmllZCEgXFxuVXNhZ2U6IHJlbW92ZShhdEluZGV4KScpO1xuXHR9XG5cblx0Ly8gUmVtb3ZlIHRoZSBjb21wb25lbnQgZnJvbSB0aGUgbGlzdFxuXHR2YXIgY29tcG9uZW50ID0gdGhpcy5fY2hpbGRyZW4uc3BsaWNlKGF0SW5kZXgsIDEpO1xuXHRpZiAoIWNvbXBvbmVudFswXSkge1xuXG5cdFx0Ly8gSWYgdGhlIGxpc3QgaXMgZW1wdHksIGZyZWFrIG91dFxuXHRcdHRocm93IG5ldyBFcnJvcih0aGlzLmlkICsgJy5yZW1vdmUoKSA6OiBUcnlpbmcgdG8gcmVtb3ZlIGEgY29tcG9uZW50IHRoYXQgZG9lc25cXCd0IGV4aXN0IGF0IGluZGV4ICcgKyBhdEluZGV4KTtcblx0fVxuXG5cdC8vIFNxdWVlemUgdGhlIGNvbXBvbmVudCB0byBkbyBnZXQgYWxsIHRoZSBiaW5keSBnb29kbmVzcyBvdXRcblx0Y29tcG9uZW50WzBdLmNsb3NlKCk7XG5cblx0RlJBTUVXT1JLLmRlYnVnKHRoaXMucGFyZW50LmlkICsgJyA6OiBSZW1vdmVkIGNvbXBvbmVudCBhdCBpbmRleCAnICsgYXRJbmRleCArICcgZnJvbSByZWdpb246ICcgKyB0aGlzLmlkKTtcbn07XG4iLCIvKipcbiAqIFNldHMgdXAgdGhlIEZSQU1FV09SSyByb3V0ZXIuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcm91dGVyU2V0dXAoKSB7XG5cblx0Ly8gV2lsZGNhcmQgcm91dGVzIHRvIGdsb2JhbCBldmVudCBkZWxlZ2F0b3Jcblx0dmFyIHJvdXRlciA9IG5ldyBGUkFNRVdPUksuUm91dGVyKCk7XG5cdHJvdXRlci5yb3V0ZSgvKC4qKS8sICdyb3V0ZScsIGZ1bmN0aW9uIChyb3V0ZSkge1xuXG5cdFx0Ly8gTm9ybWFsaXplIGhvbWUgcm91dGVzICgjIG9yIG51bGwpIHRvICcnXG5cdFx0aWYgKCFyb3V0ZSkge1xuXHRcdFx0cm91dGUgPSAnJztcblx0XHR9XG5cblx0XHQvLyBUcmlnZ2VyIHJvdXRlXG5cdFx0RlJBTUVXT1JLLnRyaWdnZXIoJyMnICsgcm91dGUpO1xuXHR9KTtcblxuXHQvLyBFeHBvc2UgYG5hdmlnYXRlKClgIG1ldGhvZFxuXHRGUkFNRVdPUksubmF2aWdhdGUgPSBGUkFNRVdPUksuaGlzdG9yeS5uYXZpZ2F0ZTtcbn1cbiIsIi8qKlxuICogQmFyZS1ib25lcyBET00vVUkgdXRpbGl0aWVzXG4gKi9cblxudmFyIEV2ZW50cyA9IHJlcXVpcmUoJy4vZXZlbnRzJyk7XG5cbnZhciBET00gPSB7XG5cblx0LyoqXG5cdCAqIEV4cG9zZSB0aGUgXCJET01teS1ldmVudGVkbmVzc1wiIG9mIGVsZW1lbnRzIHNvIHRoYXQgaXQncyBzZWxlY3RhYmxlIHZpYSBDU1Ncblx0ICogWW91IGNhbiB1c2UgdGhpcyB0byBhcHBseSBhIGZldyBjaG9pY2UgRE9NIG1vZGlmaWNhdGlvbnMgb3V0IHRoZSBnYXRlLS1cblx0ICogKGUuZy4gdHdlYWtzIHRhcmdldGluZyBjb21tb24gaXNzdWVzIHRoYXQgdHlwaWNhbGx5IGdldCBmb3Jnb3R0ZW4sIGxpa2UgZGlzYWJsaW5nIHRleHQgc2VsZWN0aW9uKVxuXHQgKlxuXHQgKiBAcGFyYW0ge0NvbXBvbmVudH0gY29tcG9uZW50XG5cdCAqL1xuXHRmbGFnQm91bmRFdmVudHM6IGZ1bmN0aW9uICggY29tcG9uZW50ICkge1xuXG5cdFx0Ly8gVE9ETzogcHJvdmlkZSBhY2Nlc3MgdG8gYm91bmQgZ2xvYmFsIGV2ZW50cyAoJSkgYW5kIHJvdXRlcyAoIykgYXMgd2VsbFxuXHRcdC8vIFRPRE86IGZsYWcgYWxsIERPTSBldmVudHMsIG5vdCBqdXN0IGNsaWNrIGFuZCB0b3VjaFxuXG5cdFx0Ly8gQnVpbGQgc3Vic2V0IG9mIGp1c3QgdGhlIGNsaWNrL3RvdWNoIGV2ZW50c1xuXHRcdHZhciBjbGlja09yVG91Y2hFdmVudHMgPSBFdmVudHMucGFyc2UoXG5cdFx0XHRjb21wb25lbnQuZXZlbnRzLFxuXHRcdFx0eyBvbmx5OiBbJ2NsaWNrJywgJ3RvdWNoJywgJ3RvdWNoc3RhcnQnLCAndG91Y2hlbmQnXSB9XG5cdFx0KTtcblxuXHRcdC8vIElmIG5vIGNsaWNrL3RvdWNoIGV2ZW50cyBmb3VuZCwgYmFpbCBvdXRcblx0XHRpZiAoIGNsaWNrT3JUb3VjaEV2ZW50cy5sZW5ndGggPCAxICkgcmV0dXJuO1xuXG5cdFx0Ly8gUXVlcnkgYWZmZWN0ZWQgZWxlbWVudHMgZnJvbSBET01cblx0XHR2YXIgJGFmZmVjdGVkID0gRXZlbnRzLmdldEVsZW1lbnRzKGNsaWNrT3JUb3VjaEV2ZW50cywgY29tcG9uZW50KTtcblxuXHRcdC8vIE5PVEU6IEZvciBub3csIHRoaXMgaXMgYWx3YXlzIGp1c3QgJ2NsaWNrJ1xuXHRcdHZhciBib3VuZEV2ZW50c1N0cmluZyA9ICdjbGljayc7XG5cblx0XHQvLyBTZXQgYGRhdGEtRlJBTUVXT1JLLWNsaWNrYWJsZWAgY3VzdG9tIGF0dHJpYnV0ZVxuXHRcdC8vICh1aSBsb2dpYyBzaG91bGQgYmUgZXh0ZW5kZWQgaW4gQ1NTKVxuXHRcdCRhZmZlY3RlZC5hdHRyKCdkYXRhLScgKyBGUkFNRVdPUksub3B0aW9ucy5mcmFtZXdvcmtJZCArICctZXZlbnRzJywgYm91bmRFdmVudHNTdHJpbmcpO1xuXG5cdFx0RlJBTUVXT1JLLnZlcmJvc2UoXG5cdFx0XHRjb21wb25lbnQuaWQgKyAnIDo6ICcgK1xuXHRcdFx0J0Rpc2FibGVkIHVzZXIgdGV4dCBzZWxlY3Rpb24gb24gZWxlbWVudHMgdy8gY2xpY2svdG91Y2ggZXZlbnRzOicsXG5cdFx0XHRjbGlja09yVG91Y2hFdmVudHMsXG5cdFx0XHQkYWZmZWN0ZWRcblx0XHQpO1xuXHR9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IERPTTtcbiIsIi8qKlxuICogVXRpbGl0eSBFdmVudCB0b29sa2l0XG4gKi9cblxudmFyIFV0aWxzID0gcmVxdWlyZSgnLi91dGlscy5qcycpO1xuXG52YXIgRXZlbnRzID0ge1xuXG5cdC8qKlxuXHQgKiBQYXJzZXMgYSBkaWN0aW9uYXJ5IG9mIGV2ZW50cyBhbmQgb3B0aW9uYWxseSBmaWx0ZXJzIGJ5IHRoZSBldmVudCB0eXBlLiBJZiB0aGUgZXZlbnRcblx0ICpcblx0ICogQHBhcmFtICB7T2JqZWN0fSBldmVudHMgIFtBIEJhY2tib25lLlZpZXcgZXZlbnRzIG9iamVjdF1cblx0ICogQHBhcmFtICB7T2JqZWN0fSBvcHRpb25zIFtPcHRpb25zIG9iamVjdCB0aGF0IGFsbG93cyB1cyB0byBmaWx0ZXIgcGFyc2luZyB0byBjZXJ0YWluIGV2ZW50XG5cdCAqICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZXNdXG5cdCAqXG5cdCAqIEByZXR1cm4ge0FycmF5fSAgICAgICAgICBbQXJyYXkgY29udGFpbmluZyBwYXJzZWRFdmVudHMgdGhhdCBhcmUgbWF0Y2hpbmcgZXZlbnQga2V5c11cblx0ICovXG5cdHBhcnNlOiBmdW5jdGlvbiAoZXZlbnRzLCBvcHRpb25zKSB7XG5cblx0XHR2YXIgZXZlbnRLZXlzID0gXy5rZXlzKGV2ZW50cyB8fCB7fSksXG5cdFx0XHRsaW1pdEV2ZW50cyxcblx0XHRcdHBhcnNlZEV2ZW50cyA9IFtdO1xuXG5cdFx0Ly8gT3B0aW9uYWxseSBmaWx0ZXIgdXNpbmcgc2V0IG9mIGFjY2VwdGFibGUgZXZlbnQgdHlwZXNcblx0XHRsaW1pdEV2ZW50cyA9IG9wdGlvbnMub25seTtcblx0XHRldmVudEtleXMgPSBfLmZpbHRlcihldmVudEtleXMsIGZ1bmN0aW9uIGNoZWNrRXZlbnROYW1lIChldmVudEtleSkge1xuXG5cdFx0XHQvLyBQYXJzZSBldmVudCBzdHJpbmcgaW50byBzZW1hbnRpYyByZXByZXNlbnRhdGlvblxuXHRcdFx0dmFyIGV2ZW50ID0gRXZlbnRzLnBhcnNlRE9NRXZlbnQoZXZlbnRLZXkpO1xuXHRcdFx0cGFyc2VkRXZlbnRzLnB1c2goZXZlbnQpO1xuXG5cdFx0XHQvLyBPcHRpb25hbCBmaWx0ZXJcblx0XHRcdGlmIChsaW1pdEV2ZW50cykge1xuXHRcdFx0XHRyZXR1cm4gXy5jb250YWlucyhsaW1pdEV2ZW50cywgZXZlbnQubmFtZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBwYXJzZWRFdmVudHM7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFtnZXRFbGVtZW50cyBkZXNjcmlwdGlvbl1cblx0ICpcblx0ICogQHBhcmFtICB7QXJyYXl9IHNlbWFudGljRXZlbnRzIFtBIGxpc3Qgb2YgcGFyc2VkIGV2ZW50IG9iamVjdHNdXG5cdCAqIEBwYXJhbSAge0NvbXBvbmVudH0gY29udGV4dCAgICBbSW5zdGFuY2Ugb2YgYSBjb21wb25lbnQgdG8gdXNlIGFzIGEgc3RhcnRpbmcgcG9pbnQgZm9yXG5cdCAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhlIERPTSBxdWVyaWVzXVxuXHQgKlxuXHQgKiBAcmV0dXJuIHtBcnJheX0gICAgICAgICAgICAgICAgW0FuIGFycmF5IG9mIGpRdWVyeSBzZXQgb2YgbWF0Y2hlZCBlbGVtZW50c11cblx0ICovXG5cdGdldEVsZW1lbnRzOiBmdW5jdGlvbiAoc2VtYW50aWNFdmVudHMsIGNvbnRleHQpIHtcblxuXHRcdC8vIENvbnRleHQgb3B0aW9uYWxcblx0XHRjb250ZXh0ID0gY29udGV4dCB8fCB7ICQ6ICQgfTtcblxuXHRcdC8vIEl0ZXJhdGl2ZWx5IGJ1aWxkIGEgc2V0IG9mIGFmZmVjdGVkIGVsZW1lbnRzXG5cdFx0dmFyICRhZmZlY3RlZCA9ICQoKTtcblx0XHRfLmVhY2goc2VtYW50aWNFdmVudHMsIGZ1bmN0aW9uIGxvb2t1cEVsZW1lbnRzRm9yRXZlbnQgKGV2ZW50KSB7XG5cblx0XHRcdC8vIERldGVybWluZSBtYXRjaGVkIGVsZW1lbnRzXG5cdFx0XHQvLyBVc2UgZGVsZWdhdGUgc2VsZWN0b3IgaWYgc3BlY2lmaWVkXG5cdFx0XHQvLyBPdGhlcndpc2UsIGdyYWIgdGhlIGVsZW1lbnQgZm9yIHRoaXMgY29tcG9uZW50XG5cdFx0XHR2YXIgJG1hdGNoZWQgPVx0ZXZlbnQuc2VsZWN0b3IgP1xuXHRcdFx0XHRcdFx0XHRjb250ZXh0LiQoZXZlbnQuc2VsZWN0b3IpIDpcblx0XHRcdFx0XHRcdFx0Y29udGV4dC4kZWw7XG5cblx0XHRcdC8vIEFkZCBtYXRjaGVkIGVsZW1lbnRzIHRvIHNldFxuXHRcdFx0JGFmZmVjdGVkID0gJGFmZmVjdGVkLmFkZCggJG1hdGNoZWQgKTtcblx0XHR9LCB0aGlzKTtcblxuXHRcdHJldHVybiAkYWZmZWN0ZWQ7XG5cdH0sXG5cblxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHdoZXRoZXIgdGhlIHNwZWNpZmllZCBldmVudCBrZXkgbWF0Y2hlcyBhIERPTSBldmVudC5cblx0ICpcblx0ICogQHBhcmFtICB7U3RyaW5nfSBrZXkgW0tleSB0byBtYXRjaCBhZ2FpbnN0XVxuXHQgKlxuXHQgKiBpZiBubyBtYXRjaCBpcyBmb3VuZFxuXHQgKiBAcmV0dXJuIHtCb29sZWFufSBcdFx0W3JldHVybiBgZmFsc2VgXVxuXHQgKlxuXHQgKiBvdGhlcndpc2Vcblx0ICogQHJldHVybiB7T2JqZWN0fSAgXHRcdFtPYmplY3QgY29udGFpbmluZyB0aGUgYG5hbWVgIG9mIHRoZSBET00gZWxlbWVudCBhbmQgdGhlIGBzZWxlY3RvcmBdXG5cdCAqL1xuXHRwYXJzZURPTUV2ZW50OiBfLm1lbW9pemUoZnVuY3Rpb24oa2V5KSB7XG5cblx0XHR2YXIgbWF0Y2hlcyA9IGtleS5tYXRjaCh0aGlzWycvRE9NRXZlbnQvJ10pO1xuXG5cdFx0aWYgKCFtYXRjaGVzIHx8ICFtYXRjaGVzWzFdKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdG5hbWU6IG1hdGNoZXNbMV0sXG5cdFx0XHRzZWxlY3RvcjogbWF0Y2hlc1szXVxuXHRcdH07XG5cdH0pLFxuXG5cblx0LyoqXG5cdCAqIFN1cHBvcnRlZCBcImZpcnN0LWNsYXNzXCIgRE9NIGV2ZW50cy5cblx0ICogQHR5cGUge0FycmF5fVxuXHQgKi9cblx0bmFtZXM6IFtcblxuXHRcdC8vIExvY2FsaXplZCBicm93c2VyIGV2ZW50c1xuXHRcdC8vICh3b3JrcyBvbiBpbmRpdmlkdWFsIGVsZW1lbnRzKVxuXHRcdCdlcnJvcicsICdzY3JvbGwnLFxuXG5cdFx0Ly8gTW91c2UgZXZlbnRzXG5cdFx0J2NsaWNrJywgJ2RibGNsaWNrJywgJ21vdXNlZG93bicsICdtb3VzZXVwJywgJ2hvdmVyJywgJ21vdXNlZW50ZXInLCAnbW91c2VsZWF2ZScsXG5cdFx0J21vdXNlb3ZlcicsICdtb3VzZW91dCcsICdtb3VzZW1vdmUnLFxuXG5cdFx0Ly8gS2V5Ym9hcmQgZXZlbnRzXG5cdFx0J2tleWRvd24nLCAna2V5dXAnLCAna2V5cHJlc3MnLFxuXG5cdFx0Ly8gRm9ybSBldmVudHNcblx0XHQnYmx1cicsICdjaGFuZ2UnLCAnZm9jdXMnLCAnZm9jdXNpbicsICdmb2N1c291dCcsICdzZWxlY3QnLCAnc3VibWl0JyxcblxuXHRcdC8vIFJhdyB0b3VjaCBldmVudHNcblx0XHQndG91Y2hzdGFydCcsICd0b3VjaGVuZCcsICd0b3VjaG1vdmUnLCAndG91Y2hjYW5jZWwnLFxuXG5cdFx0Ly8gTWFudWZhY3R1cmVkIGV2ZW50c1xuXHRcdCd0b3VjaCcsXG5cblx0XHQvLyBUT0RPOlxuXHRcdCdyaWdodGNsaWNrJywgJ2NsaWNrb3V0c2lkZSdcblx0XVxufTtcblxuXG5cblxuLyoqXG4gKiBSZWdleHAgdG8gbWF0Y2ggXCJmaXJzdCBjbGFzc1wiIERPTSBldmVudHNcbiAqICh0aGVzZSBhcmUgYWxsb3dlZCBpbiB0aGUgdG9wIGxldmVsIG9mIGEgY29tcG9uZW50IGRlZmluaXRpb24gYXMgbWV0aG9kIGtleXMpXG4gKlx0XHRpLmUuIC9eKGNsaWNrfGhvdmVyfGJsdXJ8Zm9jdXMpKCAoLispKS9cbiAqXHRcdFx0WzFdID0+IGV2ZW50IG5hbWVcbiAqXHRcdFx0WzNdID0+IHNlbGVjdG9yXG4gKi9cblxuRXZlbnRzWycvRE9NRXZlbnQvJ10gPSBuZXcgUmVnRXhwKCdeKCcgKyBfLnJlZHVjZShFdmVudHMubmFtZXMsXG5cdGZ1bmN0aW9uIGJ1aWxkUmVnZXhwKG1lbW8sIGV2ZW50TmFtZSwgaW5kZXgpIHtcblxuXHRcdC8vIE9taXQgYHxgIHRoZSBmaXJzdCB0aW1lXG5cdFx0aWYgKGluZGV4ID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gbWVtbyArIGV2ZW50TmFtZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbWVtbyArICd8JyArIGV2ZW50TmFtZTtcblx0fSwgJycpICtcbicpKCAoLispKT8kJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gRXZlbnRzO1xuIiwiLyoqXG4gKiBUcmFuc2xhdGUgKipyaWdodC1oYW5kLXNpZGUgYWJicmV2aWF0aW9ucyoqIGludG8gZnVuY3Rpb25zIHRoYXQgcGVyZm9ybVxuICogdGhlIHByb3BlciBiZWhhdmlvcnMsIGUuZy5cbiAqXHRcdCNhYm91dF9tZVxuICpcdFx0JW1haW5NZW51Om9wZW5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHRyYW5zbGF0ZVNob3J0aGFuZCh2YWx1ZSwga2V5KSB7XG5cblx0dmFyIG1hdGNoZXMsIGZuO1xuXG5cdC8vIElmIHRoaXMgaXMgYW4gaW1wb3J0YW50LCBGUkFNRVdPUkstc3BlY2lmaWMgZGF0YSBrZXksXG5cdC8vIGFuZCBhIGZ1bmN0aW9uIHdhcyBzcGVjaWZpZWQsIHJ1biBpdCB0byBnZXQgaXRzIHZhbHVlXG5cdC8vICh0aGlzIGlzIHRvIGtlZXAgcGFyaXR5IHdpdGggQmFja2JvbmUncyBzaW1pbGFyIGZ1bmN0aW9uYWxpdHkpXG5cdGlmIChfLmlzRnVuY3Rpb24odmFsdWUpICYmIChrZXkgPT09ICdjb2xsZWN0aW9uJyB8fCBrZXkgPT09ICdtb2RlbCcpKSB7XG5cdFx0cmV0dXJuIHZhbHVlKCk7XG5cdH1cblxuXHQvLyBJZ25vcmUgb3RoZXIgbm9uLXN0cmluZ3Ncblx0aWYgKCFfLmlzU3RyaW5nKHZhbHVlKSkge1xuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxuXG5cdC8vIEFsc28gaWdub3JlIGB0ZW1wbGF0ZWBcblx0Ly8gVE9ETzogdXNlIGEgZGlmZmVyZW50IGtleSBsYXRlclxuXHRpZiAoa2V5ID09PSAndGVtcGxhdGUnKSByZXR1cm4gdmFsdWU7XG5cblx0Ly8gQWxzbyBpZ25vcmUgdGhpbmdzIHRoYXQgc3RhcnQgd2l0aCBfXG5cdGlmIChrZXkubWF0Y2goL15fLykpIHJldHVybiB2YWx1ZTtcblxuXG5cdC8vIFJlZGlyZWN0cyB1c2VyIHRvIGNsaWVudC1zaWRlIFVSTCwgdy9vIGFmZmVjdGluZyBicm93c2VyIGhpc3Rvcnlcblx0Ly8gTGlrZSBjYWxsaW5nIGBCYWNrYm9uZS5oaXN0b3J5Lm5hdmlnYXRlKCcvZm9vJywgeyByZXBsYWNlOiB0cnVlIH0pYFxuXHRpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXiMjKC4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHRcdGZuID0gZnVuY3Rpb24gcmVkaXJlY3RBbmRDb3ZlclRyYWNrcygpIHtcblx0XHRcdHZhciB1cmwgPSBtYXRjaGVzWzFdO1xuXHRcdFx0RlJBTUVXT1JLLmhpc3RvcnkubmF2aWdhdGUodXJsLCB7XG5cdFx0XHRcdHRyaWdnZXI6IHRydWUsXG5cdFx0XHRcdHJlcGxhY2U6IHRydWVcblx0XHRcdH0pO1xuXHRcdH07XG5cdH1cblx0Ly8gTWV0aG9kIHRvIHJlZGlyZWN0IHVzZXIgdG8gYSBjbGllbnQtc2lkZSBVUkwsIHRoZW4gY2FsbCB0aGUgaGFuZGxlclxuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eIyguKlteLlxcc10rKS8pKSAmJiBtYXRjaGVzWzFdKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiBjaGFuZ2VVcmxGcmFnbWVudCgpIHtcblx0XHRcdHZhciB1cmwgPSBtYXRjaGVzWzFdO1xuXHRcdFx0RlJBTUVXT1JLLmhpc3RvcnkubmF2aWdhdGUodXJsLCB7XG5cdFx0XHRcdHRyaWdnZXI6IHRydWVcblx0XHRcdH0pO1xuXHRcdH07XG5cdH1cblx0Ly8gTWV0aG9kIHRvIHRyaWdnZXIgZ2xvYmFsIGV2ZW50XG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14oJS4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHRcdGZuID0gZnVuY3Rpb24gdHJpZ2dlckV2ZW50KCkge1xuXHRcdFx0dmFyIHRyaWdnZXIgPSBtYXRjaGVzWzFdO1xuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UodGhpcy5pZCArICcgOjogVHJpZ2dlcmluZyBldmVudCAoJyArIHRyaWdnZXIgKyAnKS4uLicpO1xuXHRcdFx0RlJBTUVXT1JLLnRyaWdnZXIodHJpZ2dlcik7XG5cdFx0fTtcblx0fVxuXHQvLyBNZXRob2QgdG8gZmlyZSBhIHRlc3QgYWxlcnRcblx0Ly8gKHVzZSBtZXNzYWdlLCBpZiBzcGVjaWZpZWQpXG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14hISFcXHMqKC4qW14uXFxzXSk/LykpKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiBiYW5nQWxlcnQoZSkge1xuXG5cdFx0XHQvLyBJZiBzcGVjaWZpZWQsIG1lc3NhZ2UgaXMgdXNlZCwgb3RoZXJ3aXNlICdBbGVydCB0cmlnZ2VyZWQhJ1xuXHRcdFx0dmFyIG1zZyA9IChtYXRjaGVzICYmIG1hdGNoZXNbMV0pIHx8ICdEZWJ1ZyBhbGVydCAoISEhKSB0cmlnZ2VyZWQhJztcblxuXHRcdFx0Ly8gT3RoZXIgZGlhZ25vc3RpYyBpbmZvcm1hdGlvblxuXHRcdFx0bXNnICs9ICdcXG5cXG5EaWFnbm9zdGljc1xcbj09PT09PT09PT09PT09PT09PT09PT09PVxcbic7XG5cdFx0XHRpZiAoZSAmJiBlLmN1cnJlbnRUYXJnZXQpIHtcblx0XHRcdFx0bXNnICs9ICdlLmN1cnJlbnRUYXJnZXQgOjogJyArIGUuY3VycmVudFRhcmdldDtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmlkKSB7XG5cdFx0XHRcdG1zZyArPSAndGhpcy5pZCA6OiAnICsgdGhpcy5pZDtcblx0XHRcdH1cblxuXHRcdFx0YWxlcnQobXNnKTtcblx0XHR9O1xuXHR9XG5cblx0Ly8gTWV0aG9kIHRvIGxvZyBhIG1lc3NhZ2UgdG8gdGhlIGNvbnNvbGVcblx0Ly8gKHVzZSBtZXNzYWdlLCBpZiBzcGVjaWZpZWQpXG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14+Pj5cXHMqKC4qW14uXFxzXSk/LykpKSB7XG5cblx0XHRmbiA9IGZ1bmN0aW9uIGxvZ01lc3NhZ2UoZSkge1xuXG5cdFx0XHQvLyBJZiBzcGVjaWZpZWQsIG1lc3NhZ2UgaXMgdXNlZCwgb3RoZXJ3aXNlIHVzZSBkZWZhdWx0XG5cdFx0XHR2YXIgbXNnID0gKG1hdGNoZXMgJiYgbWF0Y2hlc1sxXSkgfHwgJ0xvZyBtZXNzYWdlICg+Pj4pIHRyaWdnZXJlZCEnO1xuXHRcdFx0RlJBTUVXT1JLLmxvZyhtc2cpO1xuXHRcdH07XG5cdH1cblxuXHQvLyBNZXRob2QgdG8gYXR0YWNoIHRoZSBzcGVjaWZpZWQgY29tcG9uZW50L3RlbXBsYXRlIHRvIGEgcmVnaW9uXG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14oLispPFxcLSguKlteLlxcc10pLykpICYmIG1hdGNoZXNbMV0gJiYgbWF0Y2hlc1syXSkge1xuXHRcdGZuID0gZnVuY3Rpb24gYXR0YWNoVGVtcGxhdGUoKSB7XG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZSh0aGlzLmlkICsgJyA6OiBBdHRhY2hpbmcgYCcgKyBtYXRjaGVzWzJdICsgJ2AgdG8gYCcgKyBtYXRjaGVzWzFdICsgJ2AuLi4nKTtcblxuXHRcdFx0dmFyIHJlZ2lvbiA9IG1hdGNoZXNbMV07XG5cdFx0XHR2YXIgdGVtcGxhdGUgPSBtYXRjaGVzWzJdO1xuXG5cdFx0XHRpZiAoIXRoaXNbcmVnaW9uXSkge1xuXHRcdFx0XHRGUkFNRVdPUksuZXJyb3IodGhpcy5pZCwnOjogVHJ5aW5nIHRvIGF0dGFjaCByZWdpb24gd2l0aCBzaG9ydGhhbmQgKCcrbWF0Y2hlcysnKSwgYnV0IGNvdWxkIG5vdCBmaW5kIHJlZ2lvbiBgJywgcmVnaW9uLCdgJyk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXNbcmVnaW9uXS5hdHRhY2godGVtcGxhdGUpO1xuXHRcdH07XG5cdH1cblxuXG5cdC8vIE1ldGhvZCB0byB0b2dnbGUgdGhlIHNwZWNpZmllZCBhdHRyXG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL15cXCFcXHMqXFxAKC4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHRcdGZuID0gZnVuY3Rpb24gdG9nZ2xlQXR0cigpIHtcblx0XHRcdEZSQU1FV09SSy52ZXJib3NlKHRoaXMuaWQgKyAnIDo6IFRvZ2dsaW5nIGF0dHIgKCcgKyBtYXRjaGVzWzFdICsgJykuLi4nKTtcblx0XHRcdHZhciBvbGRBdHRyVmFsdWUgPSB0aGlzLm1vZGVsLmdldCggbWF0Y2hlc1sxXSApO1xuXG5cdFx0XHRpZiAob2xkQXR0clZhbHVlKSB7XG5cdFx0XHRcdHRoaXMubW9kZWwuc2V0KCBtYXRjaGVzWzFdLCBmYWxzZSApO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdHRoaXMubW9kZWwuc2V0KCBtYXRjaGVzWzFdLCB0cnVlICk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cblx0Ly8gZGVwcmVjYXRpbmcgY2xhc3MgbWFuaXB1bGF0aW9uIHNob3J0aGFuZFxuXHQvLyAobm8gbmVlZCB0byBkbyBkb20gbWFuaXB1bGF0aW9uIHVubGVzcyBhYnNvbHV0ZWx5IG5lY2Vzc2FyeSlcblxuXHQvLyAvLyBNZXRob2QgdG8gYWRkIHRoZSBzcGVjaWZpZWQgY2xhc3Ncblx0Ly8gZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXlxcK1xccypcXC4oLipbXi5cXHNdKS8pKSAmJiBtYXRjaGVzWzFdKSB7XG5cdC8vIFx0Zm4gPSBmdW5jdGlvbiBhZGRDbGFzcygpIHtcblx0Ly8gXHRcdEZSQU1FV09SSy52ZXJib3NlKHRoaXMuaWQgKyAnIDo6IEFkZGluZyBjbGFzcyAoJyArIG1hdGNoZXNbMV0gKyAnKS4uLicpO1xuXHQvLyBcdFx0dGhpcy4kZWwuYWRkQ2xhc3MobWF0Y2hlc1sxXSk7XG5cdC8vIFx0fTtcblx0Ly8gfVxuXHQvLyAvLyBNZXRob2QgdG8gcmVtb3ZlIHRoZSBzcGVjaWZpZWQgY2xhc3Ncblx0Ly8gZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXlxcLVxccypcXC4oLipbXi5cXHNdKS8pKSAmJiBtYXRjaGVzWzFdKSB7XG5cdC8vIFx0Zm4gPSBmdW5jdGlvbiByZW1vdmVDbGFzcygpIHtcblx0Ly8gXHRcdEZSQU1FV09SSy52ZXJib3NlKHRoaXMuaWQgKyAnIDo6IFJlbW92aW5nIGNsYXNzICgnICsgbWF0Y2hlc1sxXSArICcpLi4uJyk7XG5cdC8vIFx0XHR0aGlzLiRlbC5yZW1vdmVDbGFzcyhtYXRjaGVzWzFdKTtcblx0Ly8gXHR9O1xuXHQvLyB9XG5cdC8vIC8vIE1ldGhvZCB0byB0b2dnbGUgdGhlIHNwZWNpZmllZCBjbGFzc1xuXHQvLyBlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eXFwhXFxzKlxcLiguKlteLlxcc10pLykpICYmIG1hdGNoZXNbMV0pIHtcblx0Ly8gXHRmbiA9IGZ1bmN0aW9uIHRvZ2dsZUNsYXNzKCkge1xuXHQvLyBcdFx0RlJBTUVXT1JLLnZlcmJvc2UodGhpcy5pZCArICcgOjogVG9nZ2xpbmcgY2xhc3MgKCcgKyBtYXRjaGVzWzFdICsgJykuLi4nKTtcblx0Ly8gXHRcdHRoaXMuJGVsLnRvZ2dsZUNsYXNzKG1hdGNoZXNbMV0pO1xuXHQvLyBcdH07XG5cdC8vIH1cblxuXHQvLyBUT0RPOlx0YWxsb3cgZGVzY2VuZGFudHMgdG8gYmUgY29udHJvbGxlZCB2aWEgc2hvcnRoYW5kXG5cdC8vXHRcdFx0ZS5nLiA6ICdsaS5yb3cgLS5oaWdobGlnaHRlZCdcblx0Ly9cdFx0XHR3b3VsZCByZW1vdmUgdGhlIGBoaWdobGlnaHRlZGAgY2xhc3MgZnJvbSB0aGlzLiQoJ2xpLnJvdycpXG5cblxuXHQvLyBJZiBzaG9ydC1oYW5kIG1hdGNoZWQsIHJldHVybiB0aGUgZGVyZWZlcmVuY2VkIGZ1bmN0aW9uXG5cdGlmIChmbikge1xuXG5cdFx0RlJBTUVXT1JLLnZlcmJvc2UoJ0ludGVycHJldGluZyBtZWFuaW5nIGZyb20gc2hvcnRoYW5kIDo6IGAnICsgdmFsdWUgKyAnYC4uLicpO1xuXG5cdFx0Ly8gQ3VycnkgdGhlIHJlc3VsdCBmdW5jdGlvbiB3aXRoIGFueSBzdWZmaXggbWF0Y2hlc1xuXHRcdHZhciBjdXJyaWVkRm4gPSBmbjtcblxuXHRcdC8vIFRyYWlsaW5nIGAuYCBpbmRpY2F0ZXMgYW4gZS5zdG9wUHJvcGFnYXRpb24oKVxuXHRcdGlmICh2YWx1ZS5tYXRjaCgvXFwuXFxzKiQvKSkge1xuXHRcdFx0Y3VycmllZEZuID0gZnVuY3Rpb24gYW5kU3RvcFByb3BhZ2F0aW9uKGUpIHtcblxuXHRcdFx0XHQvLyBCaW5kIChzbyBpdCBpbmhlcml0cyBjb21wb25lbnQgY29udGV4dCkgYW5kIGNhbGwgaW50ZXJpb3IgZnVuY3Rpb25cblx0XHRcdFx0Zm4uYXBwbHkodGhpcyk7XG5cblx0XHRcdFx0Ly8gdGhlbiBpbW1lZGlhdGVseSBzdG9wIGV2ZW50IGJ1YmJsaW5nL3Byb3BhZ2F0aW9uXG5cdFx0XHRcdGlmIChlICYmIGUuc3RvcFByb3BhZ2F0aW9uKSB7XG5cdFx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRGUkFNRVdPUksud2Fybihcblx0XHRcdFx0XHRcdHRoaXMuaWQgKyAnIDo6IFRyYWlsaW5nIGAuYCBzaG9ydGhhbmQgd2FzIHVzZWQgdG8gaW52b2tlIGFuICcgK1xuXHRcdFx0XHRcdFx0J2Uuc3RvcFByb3BhZ2F0aW9uKCksIGJ1dCBcIicgKyB2YWx1ZSArICdcIiB3YXMgbm90IHRyaWdnZXJlZCBieSBhIERPTSBldmVudCFcXG4nICtcblx0XHRcdFx0XHRcdCdQcm9iYWJseSBiZXN0IHRvIGRvdWJsZS1jaGVjayB0aGlzIHdhcyB3aGF0IHlvdSBtZWFudCB0byBkby4nKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY3VycmllZEZuO1xuXHR9XG5cblxuXHQvLyBPdGhlcndpc2UsIGlmIG5vIHNob3J0LWhhbmQgbWF0Y2hlZCwgcGFzcyB0aGUgb3JpZ2luYWwgdmFsdWVcblx0Ly8gc3RyYWlnaHQgdGhyb3VnaFxuXHRyZXR1cm4gdmFsdWU7XG59O1xuIiwiLyoqXG4gKiBVdGlsaXR5IGZ1bmN0aW9ucyB0aGF0IGFyZSB1c2VkIHRocm91Z2hvdXQgdGhlIGNvcmUuXG4gKi9cblxudmFyIFV0aWxzID0ge1xuXG5cdC8qKlxuXHQgKiBHcmFicyB0aGUgaWQgeG9yIGRhdGEtaWQgZnJvbSBhbiBIVE1MIGVsZW1lbnQuXG5cdCAqXG5cdCAqIEBwYXJhbSAge0RPTUVsZW1lbnR9IGVsICAgIFtFbGVtZW50IHdoZXJlIHdlIGFyZSBsb29raW5nIGZvciB0aGUgYGlkYCBvciBgZGF0YS1pZGAgYXR0cl1cblx0ICogQHBhcmFtICB7Qm9vbGVhbn0gcmVxdWlyZWQgW0RldGVybWluZXMgaWYgaXQgaXMgcmVxdWlyZWQgdG8gZmluZCBhbiBgaWRgIG9yIGBkYXRhLWlkYCBhdHRyXVxuXHQgKlxuXHQgKiBAcmV0dXJuIHtTdHJpbmd9ICAgICAgICAgIFx0W0lkZW50aWZpY2F0aW9uIHN0cmluZyB0aGF0IHdhcyBmb3VuZF1cblx0ICovXG5cdGVsMmlkOiBmdW5jdGlvbihlbCwgcmVxdWlyZWQpIHtcblxuXHRcdHZhciBpZCA9ICQoZWwpLmF0dHIoJ2lkJyk7XG5cdFx0dmFyIGRhdGFJZCA9ICQoZWwpLmF0dHIoJ2RhdGEtaWQnKTtcblx0XHR2YXIgY29udGVudHNJZCA9ICQoZWwpLmF0dHIoJ2NvbnRlbnRzJyk7XG5cblx0XHRpZiAoaWQgJiYgZGF0YUlkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoaWQgKyAnIDo6IENhbm5vdCBzZXQgYm90aCBgaWRgIGFuZCBgZGF0YS1pZGAhICBQbGVhc2UgdXNlIG9uZSBvciB0aGUgb3RoZXIuICAoZGF0YS1pZCBpcyBzYWZlc3QpJyk7XG5cdFx0fVxuXHRcdGlmIChyZXF1aXJlZCAmJiAhaWQgJiYgIWRhdGFJZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdObyBpZCBzcGVjaWZpZWQgaW4gZWxlbWVudCB3aGVyZSBpdCBpcyByZXF1aXJlZDpcXG4nICsgZWwpO1xuXHRcdH1cblxuXHRcdHJldHVybiBpZCB8fCBkYXRhSWQgfHwgY29udGVudHNJZDtcblx0fSxcblxuXHQvKipcblx0ICogTWFwIGFuIG9iamVjdCdzIHZhbHVlcywgYW5kIHJldHVybiBhIHZhbGlkIG9iamVjdCAodGhpcyBmdW5jdGlvbiBpcyBoYW5keSBiZWNhdXNlXG5cdCAqIHVuZGVyc2NvcmUubWFwKCkgcmV0dXJucyBhIGxpc3QsIG5vdCBhbiBvYmplY3QuKVxuXHQgKlxuXHQgKiBAcGFyYW0gIHtPYmplY3R9IG9iaiAgICAgICAgIFx0W09qZWN0IHdob3MgdmFsdWVzIHlvdSB3YW50IHRvIG1hcF1cblx0ICogQHBhcmFtICB7RnVuY3Rpb259IHRyYW5zZm9ybUZuIFtGdW5jdGlvbiB0byB0cmFuc2Zvcm0gZWFjaCBvYmplY3QgdmFsdWUgYnldXG5cdCAqXG5cdCAqIEByZXR1cm4ge09iamVjdH0gICAgICAgICAgICAgXHRbTmV3IG9iamVjdCB3aXRoIHRoZSB2YWx1ZXMgbWFwcGVkXVxuXHQgKi9cblx0b2JqTWFwOiBmdW5jdGlvbiBvYmpNYXAob2JqLCB0cmFuc2Zvcm1Gbikge1xuXHRcdHJldHVybiBfLm9iamVjdChfLmtleXMob2JqKSwgXy5tYXAob2JqLCB0cmFuc2Zvcm1GbikpO1xuXHR9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFV0aWxzOyJdfQ==
;