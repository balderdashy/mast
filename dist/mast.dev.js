(function(e){if("function"==typeof bootstrap)bootstrap("mast",e);else if("object"==typeof exports)module.exports=e();else if("function"==typeof define&&define.amd)define(e);else if("undefined"!=typeof ses){if(!ses.ok())return;ses.makeMast=e}else"undefined"!=typeof window?window.Mast=e():global.Mast=e()})(function(){var define,ses,bootstrap,module,exports;
return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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
						 $(parsedNodes[0]).is('region') ||
						 $(parsedNodes[0]).attr('data-region') !== undefined ) {

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
};

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
 * Module dependencies
 */
var Utils = require('../utils/utils');



/**
 * Factory method to generate a new region instance from a DOM element
 * Also implements `template` and `count` directives.
 *
 * @param {Object} options
 * @returns region instance
 */

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
	var defaultTemplate = this.$el.attr('default') || this.$el.attr('template') || this.$el.attr('contents');
	if ( !this.id && !defaultTemplate ) {

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

},{}],31:[function(require,module,exports){
/**
 * Utility functions that are used throughout the core.
 */

var Utils = {

	/**
	 * Grabs the Mast identifier from an HTML element.
	 * Supports `id`, `data-id`, or `data-region`
	 *
	 * @param  {DOMElement} el    [the DOM element to inspect]
	 * @param  {Boolean} required [whether an identifier is required]
	 *
	 * @return {String}           [identifier]
	 */
	el2id: function(el, required) {

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
	},

	/**
	 * Map an object's values, and return a valid object (this function is handy because
	 * underscore.map() returns a list, not an object.)
	 *
	 * @param {Object} obj            [Object whos values you want to map]
	 * @param  {Function} transformFn [Function to transform each object value by]
	 *
	 * @return {Object}                [New object with the values mapped]
	 */
	objMap: function objMap(obj, transformFn) {
		return _.object(_.keys(obj), _.map(obj, transformFn));
	}
};

module.exports = Utils;

},{}]},{},[12])
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L2JpbmRFdmVudHMuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L2Nsb3NlLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2NvbXBvbmVudC9oZWxwZXJzLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2NvbXBvbmVudC9pbmRleC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9jb21wb25lbnQvbGlmZWN5Y2xlRXZlbnRzLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2NvbXBvbmVudC9saWZlY3ljbGVIb29rcy5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9jb21wb25lbnQvcmVuZGVyLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2NvbXBvbmVudC9yZW5kZXJDb2xsZWN0aW9uLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2NvbXBvbmVudC92YWxpZGF0ZURlZmluaXRpb24uanMiLCIvY29kZS9vc3MvbWFzdC9saWIvZGVmaW5lL2J1aWxkRGVmaW5pdGlvbi5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9kZWZpbmUvaW5kZXguanMiLCIvY29kZS9vc3MvbWFzdC9saWIvaW5kZXguanMiLCIvY29kZS9vc3MvbWFzdC9saWIvbG9nZ2VyL2luZGV4LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2xvZ2dlci9zZXR1cC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9yYWlzZS9idWlsZFByb3RvdHlwZS5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9yYWlzZS9jb2xsZWN0UmVnaW9ucy5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9yYWlzZS9jb2xsZWN0VGVtcGxhdGVzLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3JhaXNlL2luZGV4LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3JlZ2lvbi9hcHBlbmQuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvcmVnaW9uL2F0dGFjaC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9yZWdpb24vZW1wdHkuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvcmVnaW9uL2Zyb21FbGVtZW50LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3JlZ2lvbi9pbmRleC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9yZWdpb24vaW5zZXJ0LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3JlZ2lvbi9wcmVwZW5kLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3JlZ2lvbi9yZW1vdmUuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvcm91dGVyL2luZGV4LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3V0aWxzL0RPTS5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi91dGlscy9ldmVudHMuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvdXRpbHMvc2hvcnRoYW5kLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3V0aWxzL3V0aWxzLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL1lBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4S0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcExBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN05BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXNcbiAqL1xudmFyIGhlbHBlcnMgPSByZXF1aXJlKCcuL2hlbHBlcnMnKTtcblxuXG4vKipcbiAqIEJpbmQgY29sbGVjdGlvbiBldmVudHMgdG8gbGlmZWN5Y2xlIGV2ZW50IGhhbmRsZXJzXG4gKi9cbmV4cG9ydHMuY29sbGVjdGlvbkV2ZW50cyA9IGZ1bmN0aW9uKCkge1xuXHQvLyBCaW5kIHRvIGNvbGxlY3Rpb24gZXZlbnRzIGlmIG9uZSB3YXMgcGFzc2VkIGluXG5cdGlmICh0aGlzLmNvbGxlY3Rpb24pIHtcblxuXHRcdC8vIExpc3RlbiB0byBldmVudHNcblx0XHR0aGlzLmxpc3RlblRvKHRoaXMuY29sbGVjdGlvbiwgJ2FkZCcsIHRoaXMuYWZ0ZXJBZGQpO1xuXHRcdHRoaXMubGlzdGVuVG8odGhpcy5jb2xsZWN0aW9uLCAncmVtb3ZlJywgdGhpcy5hZnRlclJlbW92ZSk7XG5cdFx0dGhpcy5saXN0ZW5Ubyh0aGlzLmNvbGxlY3Rpb24sICdyZXNldCcsIHRoaXMuYWZ0ZXJSZXNldCk7XG5cdH1cbn07XG5cbi8qKlxuICogQmluZCBtb2RlbCBldmVudHMgdG8gbGlmZWN5Y2xlIGV2ZW50IGhhbmRsZXJzIGFuZCBhbHNvIGFsbG93cyBmb3IgaGFuZGxlcnMgdG8gZmlyZVxuICogb24gY2VydGFpbiBtb2RlbCBhdHRyaWJ1dGUgY2hhbmdlcy5cbiAqL1xuZXhwb3J0cy5tb2RlbEV2ZW50cyA9IGZ1bmN0aW9uKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0aWYgKHRoaXMubW9kZWwpIHtcblxuXHRcdC8vIExpc3RlbiBmb3IgYW55IGF0dHJpYnV0ZSBjaGFuZ2VzXG5cdFx0Ly8gZS5nLlxuXHRcdC8vIC5hZnRlckNoYW5nZShtb2RlbCwgb3B0aW9ucylcblx0XHQvL1xuXHRcdHRoaXMubGlzdGVuVG8odGhpcy5tb2RlbCwgJ2NoYW5nZScsIGZ1bmN0aW9uIG1vZGVsQ2hhbmdlZCAobW9kZWwsIG9wdGlvbnMpIHtcblxuXHRcdFx0Ly8gQXBwbHkgZGF0YSBiaW5kaW5nc1xuXHRcdFx0aGVscGVycy5yZW5kZXJEYXRhQmluZGluZ3MuY2FsbChzZWxmKTtcblxuXHRcdFx0Ly8gUnVuIGN1c3RvbSBgYWZ0ZXJDaGFuZ2VgKCkgbWV0aG9kXG5cdFx0XHRpZiAoXy5pc0Z1bmN0aW9uKHRoaXMuYWZ0ZXJDaGFuZ2UpKSB7XG5cdFx0XHRcdHRoaXMuYWZ0ZXJDaGFuZ2UobW9kZWwsIG9wdGlvbnMpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Ly8gTGlzdGVuIGZvciBzcGVjaWZpYyBhdHRyaWJ1dGUgY2hhbmdlc1xuXHRcdC8vIGUuZy5cblx0XHQvLyAuYWZ0ZXJDaGFuZ2UuY29sb3IobW9kZWwsIHZhbHVlLCBvcHRpb25zKVxuXHRcdGlmIChfLmlzT2JqZWN0KHRoaXMuYWZ0ZXJDaGFuZ2UpKSB7XG5cdFx0XHRfLmVhY2godGhpcy5hZnRlckNoYW5nZSwgZnVuY3Rpb24gKGhhbmRsZXIsIGF0dHJOYW1lKSB7XG5cblx0XHRcdFx0Ly8gQ2FsbCBoYW5kbGVyIHdpdGggbmV3VmFsIHRvIGtlZXAgYXJndW1lbnRzIHN0cmFpZ2h0Zm9yd2FyZFxuXHRcdFx0XHR0aGlzLmxpc3RlblRvKHRoaXMubW9kZWwsICdjaGFuZ2U6JyArIGF0dHJOYW1lLCBmdW5jdGlvbiBhdHRyQ2hhbmdlZCAobW9kZWwsIG5ld1ZhbCkge1xuXHRcdFx0XHRcdGhhbmRsZXIuY2FsbCh0aGlzLCBuZXdWYWwpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0fSwgdGhpcyk7XG5cdFx0fVxuXHR9XG59O1xuXG4vKipcbiAqIExpc3RlbnMgZm9yIGFuZCBydW5zIGhhbmRsZXJzIG9uIGdsb2JhbCBldmVudHMgdGhhdCBhcmUgbGlzdGVuZWQgZm9yIG9uIGEgY29tcG9uZW50LlxuICovXG5leHBvcnRzLmdsb2JhbFRyaWdnZXJzID0gZnVuY3Rpb24oKSB7XG5cblx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdHRoaXMubGlzdGVuVG8oRlJBTUVXT1JLLCAnYWxsJywgZnVuY3Rpb24gKGVSb3V0ZSkge1xuXG5cdFx0Ly8gVHJpbSBvZmYgYWxsIGJ1dCB0aGUgZmlyc3QgYXJndW1lbnQgdG8gcGFzcyB0aHJvdWdoIHRvIGhhbmRsZXJcblx0XHR2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG5cdFx0YXJncy5zaGlmdCgpO1xuXG5cdFx0Ly8gSXRlcmF0ZSB0aHJvdWdoIGVhY2ggc3Vic2NyaXB0aW9uIG9uIHRoaXMgY29tcG9uZW50XG5cdFx0Ly8gYW5kIGxpc3RlbiBmb3IgdGhlIHNwZWNpZmllZCBnbG9iYWwgZXZlbnRzXG5cdFx0Xy5lYWNoKHNlbGYuc3Vic2NyaXB0aW9ucywgZnVuY3Rpb24oaGFuZGxlciwgbWF0Y2hQYXR0ZXJuKSB7XG5cblx0XHRcdC8vIEdyYWIgcmVnZXggYW5kIHBhcmFtIHBhcnNpbmcgbG9naWMgZnJvbSBCYWNrYm9uZSBjb3JlXG5cdFx0XHR2YXIgZXh0cmFjdFBhcmFtcyA9IEJhY2tib25lLlJvdXRlci5wcm90b3R5cGUuX2V4dHJhY3RQYXJhbWV0ZXJzLFxuXHRcdFx0XHRjYWxjdWxhdGVSZWdleCA9IEJhY2tib25lLlJvdXRlci5wcm90b3R5cGUuX3JvdXRlVG9SZWdFeHA7XG5cblx0XHRcdC8vIFRyaW0gdHJhaWxpbmdcblx0XHRcdG1hdGNoUGF0dGVybiA9IG1hdGNoUGF0dGVybi5yZXBsYWNlKC9cXC8qJC9nLCAnJyk7XG5cdFx0XHQvLyBhbmQgZXIgc29ydCBvZi4uIGxlYWRpbmcuLiBzbGFzaGVzXG5cdFx0XHRtYXRjaFBhdHRlcm4gPSBtYXRjaFBhdHRlcm4ucmVwbGFjZSgvXihbI34lXSlcXC8qL2csICckMScpO1xuXHRcdFx0Ly8gVE9ETzogb3B0aW1pemF0aW9uLSB0aGlzIHJlYWxseSBvbmx5IGhhcyB0byBiZSBkb25lIG9uY2UsIG9uIHJhaXNlKCksIHdlIHNob3VsZCBkbyB0aGF0XG5cblxuXHRcdFx0Ly8gQ29tZSB1cCB3aXRoIHJlZ2V4IGZvciB0aGlzIG1hdGNoUGF0dGVyblxuXHRcdFx0dmFyIHJlZ2V4ID0gY2FsY3VsYXRlUmVnZXgobWF0Y2hQYXR0ZXJuKTtcblxuXHRcdFx0Ly8gSWYgdGhpcyBtYXRjaFBhdGVybiBpcyB0aGlzIGlzIG5vdCBhIG1hdGNoIGZvciB0aGUgZXZlbnQsXG5cdFx0XHQvLyBgY29udGludWVgIGl0IGFsb25nIHRvIGl0IGNhbiB0cnkgdGhlIG5leHQgbWF0Y2hQYXR0ZXJuXG5cdFx0XHRpZiAoIWVSb3V0ZS5tYXRjaChyZWdleCkpIHJldHVybjtcblxuXHRcdFx0Ly8gUGFyc2UgcGFyYW1ldGVycyBmb3IgdXNlIGFzIGFyZ3MgdG8gdGhlIGhhbmRsZXJcblx0XHRcdC8vIChvciBhbiBlbXB0eSBsaXN0IGlmIG5vbmUgZXhpc3QpXG5cdFx0XHR2YXIgcGFyYW1zID0gZXh0cmFjdFBhcmFtcyhyZWdleCwgZVJvdXRlKTtcblxuXHRcdFx0Ly8gSGFuZGxlIHN0cmluZyByZWRpcmVjdHMgdG8gZnVuY3Rpb24gbmFtZXNcblx0XHRcdGlmICghXy5pc0Z1bmN0aW9uKGhhbmRsZXIpKSB7XG5cdFx0XHRcdGhhbmRsZXIgPSBzZWxmW2hhbmRsZXJdO1xuXG5cdFx0XHRcdGlmICghaGFuZGxlcikge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IHRyaWdnZXIgc3Vic2NyaXB0aW9uIGJlY2F1c2Ugb2YgdW5rbm93biBoYW5kbGVyOiAnICsgaGFuZGxlcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gQmluZCBjb250ZXh0IGFuZCBhcmd1bWVudHMgdG8gc3Vic2NyaXB0aW9uIGhhbmRsZXJcblx0XHRcdGhhbmRsZXIuYXBwbHkoc2VsZiwgXy51bmlvbihhcmdzLCBwYXJhbXMpKTtcblxuXHRcdH0pO1xuXHR9KTtcbn07XG4iLCIvKipcbiAqIFNhZmVseSB6YXAgZXZlcnkgdHJhY2UgYWJvdXQgdGhpcyBjb21wb25lbnQgZnJvbSBtZW1vcnkuXG4gKi9cblxudmFyIGhlbHBlcnMgPSByZXF1aXJlKCcuL2hlbHBlcnMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjbG9zZSgpIHtcblxuXHRGUkFNRVdPUksuZGVidWcoJ0Nsb3NlZCAnICsgdGhpcy5pZCArICcgY29tcG9uZW50LicpO1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0Ly8gQ2FuY2VsIGN1cnJlbnQgcmVuZGVyIGFuZCBjbG9zZSBqb2JzLCBpZiB0aGV5J3JlIHJ1bm5pbmdcblx0aWYgKHRoaXMuX3JlbmRlcmluZykge1xuXHRcdHNlbGYuX3JlbmRlcmluZ0NhbmNlbGVkID0gdHJ1ZTtcblx0XHR0aGlzLmNhbmNlbFJlbmRlcigpO1xuXHRcdHNlbGYuX3JlbmRlcmluZyA9IGZhbHNlO1xuXHR9XG5cdGlmICh0aGlzLl9jbG9zaW5nKSB7XG5cdFx0dGhpcy5jYW5jZWxDbG9zZSgpO1xuXHRcdHNlbGYuX2Nsb3NpbmcgPSBmYWxzZTtcblx0fVxuXG5cdC8vIExvY2sgYWNjZXNzIHRvIGNsb3NlKClcblx0dGhpcy5fY2xvc2luZyA9IHRydWU7XG5cblx0dGhpcy5iZWZvcmVDbG9zZShmdW5jdGlvbiAoKSB7XG5cblx0XHQvLyA+IE5PVEU6IGB0aGlzLl9jbG9zaW5nPWZhbHNlYCBjYW4gYW5kIHByb2JhYmx5IHNob3VsZCBiZSByZW1vdmVkLFxuXHRcdC8vID4gc2luY2UgbXV0ZXggaXMgdW5uZWNlc3Nhcnkgbm93IHRoYXQgdGhlIGNvbXBvbmVudCBpcyB1cCBmb3IgZ2FyYmFnZSBjb2xsZWN0aW9uXG5cdFx0Ly8gPiBXYWl0aW5nIHRvIGRvIHRoaXMgdW50aWwgaXQgY2FuIGJlIHRlc3RlZCBmdXJ0aGVyXG5cblx0XHQvLyBVbmxvY2sgY2xvc2UoKVxuXHRcdHNlbGYuX2Nsb3NpbmcgPSBmYWxzZTtcblxuXHRcdC8vIFN0b3AgbGlzdGVuaW5nIHRvIGFsbCBnbG9iYWwgdHJpZ2dlcnMgKCV8IylcblxuXHRcdC8vIENsb3NlIGFsbCBjaGlsZCBjb21wb25lbnRzXG5cblx0XHRoZWxwZXJzLmVtcHR5QWxsUmVnaW9ucy5jYWxsKHNlbGYpO1xuXG5cdFx0Ly8gQ2FsbCBuYXRpdmUgYEJhY2tib25lLlZpZXcucHJvdG90eXBlLnJlbW92ZSgpYFxuXHRcdC8vIHRvIHVuZGVsZWdhdGUgZXZlbnRzLCBldGMuXG5cdFx0c2VsZi5yZW1vdmUoKTtcblxuXHR9KTtcbn07XG4iLCJcbnZhciBfYmluZGluZ3MgPSB7XG5cblx0dGV4dDoge1xuXHRcdHJlZ2V4cDogL2JpbmQtdGV4dC8sXG5cdFx0Zm46IGZ1bmN0aW9uICgkZWwsIG1vZGVsKSB7XG5cdFx0XHR2YXIgcmF3ID0gJGJvdW5kRWwuYXR0cignYmluZC10ZXh0Jyk7XG5cdFx0XHR2YXIgY2xlYW4gPSByYXcucmVwbGFjZSgvXkAvLCAnJyk7XG5cdFx0XHQkYm91bmRFbC50ZXh0KCBtb2RlbC5nZXQoY2xlYW4pICk7XG5cdFx0fVxuXHR9LFxuXG5cdCdjbGFzcyc6IHtcblx0XHRyZWdleHA6IC9iaW5kXFwtY2xhc3NcXC0oW14tXSspLyxcblx0XHRmbjogZnVuY3Rpb24gKCRlbCwgbW9kZWwsIG1hdGNoZXMpIHtcblx0XHRcdC8vIFJlZ2V4cCBtYXRjaGVzIGZvciB3aWxkY2FyZCBwYXJhbXMgaW4gYXR0cmlidXRlIG1hdGNoIGV4cHJlc3Npb25cblx0XHRcdHZhciBjbGFzc05hbWUgPSBtYXRjaGVzWzFdO1xuXG5cdFx0XHR2YXIgcmF3ID0gJGJvdW5kRWwuYXR0cignYmluZC1jbGFzcy0nICsgY2xhc3NOYW1lKTtcblx0XHRcdHZhciBjbGVhbiA9IHJhdy5yZXBsYWNlKC9eQC8sICcnKTtcblx0XHRcdGlmICggbW9kZWwuZ2V0KGNsZWFuKSApIHtcblx0XHRcdFx0JGJvdW5kRWwuYWRkQ2xhc3MoY2xhc3NOYW1lKTtcblx0XHRcdH1cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHQkYm91bmRFbC5yZW1vdmVDbGFzcyhjbGFzc05hbWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufTtcblxuXG4vKipcbiAqIEhlbHBlciBmdW5jdGlvbnMgdXNlZCBieSBjb21wb25lbnRzXG4gKi9cblxudmFyIGhlbHBlcnMgPSBtb2R1bGUuZXhwb3J0cyA9IHtcblxuXG5cblx0LyoqXG5cdCAqIFJlbmRlciBtb2RlbCBiaW5kaW5ncy5cblx0ICogICArIGBiaW5kLXRleHRgXG5cdCAqICAgKyBtb3JlIHRvIGNvbWVcblx0ICpcblx0ICogQ2FsbGVkIGJ5IENvbXBvbmVudCB3aGVuIGl0cyBtb2RlbCBjaGFuZ2VzLlxuXHQgKi9cblx0cmVuZGVyRGF0YUJpbmRpbmdzOiBmdW5jdGlvbiAoKSB7XG5cdFx0RlJBTUVXT1JLLmRlYnVnKCdSZW5kZXJpbmcgZGF0YSBiaW5kaW5ncyBmb3IgJywgdGhpcy5pZCwnY29tcG9uZW50Li4uJyk7XG5cblx0XHQvLyBFbnN1cmUgdGhhdCBtb2RlbCBleGlzdHNcblx0XHRpZiAoIXRoaXMubW9kZWwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihcblx0XHRcdFx0J1RyeWluZyB0byBib290c3RyYXAgZGF0YSBiaW5kaW5ncyBmb3IgY29tcG9uZW50ICgnICsgdGhpcy5pZCArICcpLCAnICtcblx0XHRcdFx0J2J1dCBpdCBoYXMgbm8gbW9kZWwhJyk7XG5cdFx0fVxuXHRcdHZhciBtb2RlbCA9IHRoaXMubW9kZWw7XG5cblx0XHQvLyBqUXVlcnkgc2VsZWN0b3IgZm9yIGdyYWJiaW5nIGFsbCBlbGVtZW50cyB3LyBkYXRhIGJpbmRpbmdzXG5cdFx0dmFyIGJpbmRpbmdTZWxlY3RvciA9ICdbYmluZC10ZXh0XSwgOm1hdGNoQXR0cihcIl5iaW5kLWNsYXNzLSokXCIpJztcblxuXHRcdC8vIEdldCBlbGVtZW50cyBpbiB0aGlzIGNvbXBvbmVudCB3aGljaCBoYXZlIGRhdGEgYmluZGluZ3Ncblx0XHQvLyAoaWdub3JlcyBjb250ZW50cyBvZiByZWdpb25zIGlmIHRoZXkgZXhpc3QpXG5cdFx0dmFyICRib3VuZEVsZW1lbnRzID0gXyRzZWxlY3RPdXRlci5jYWxsKHRoaXMsIGJpbmRpbmdTZWxlY3Rvcik7XG5cblx0XHQvLyBMb29wIHRocm91Z2ggZWFjaCBib3VuZCBhdHRyaWJ1dGUgb2YgZWFjaCBib3VuZCBlbGVtZW50XG5cdFx0Ly8gYW5kIGNhbGwgdGhlIGFwcHJvcHJpYXRlIHJlbmRlciBtZXRob2QuXG5cdFx0JGJvdW5kRWxlbWVudHMuZWFjaChmdW5jdGlvbiBlYWNoQm91bmRFbGVtZW50ICgpIHtcblx0XHRcdCRib3VuZEVsID0gJCh0aGlzKTtcblxuXHRcdFx0dmFyIGFsbEF0dHJpYnV0ZXMgPSAkYm91bmRFbFswXS5hdHRyaWJ1dGVzO1xuXHRcdFx0Xy5lYWNoKGFsbEF0dHJpYnV0ZXMsIGZ1bmN0aW9uIChhdHRyKSB7XG5cdFx0XHRcdHZhciBhdHRyTmFtZSA9IGF0dHIubm9kZU5hbWU7XG5cblx0XHRcdFx0Xy5lYWNoKF9iaW5kaW5ncywgZnVuY3Rpb24gZWFjaEJpbmRpbmdGb3JtdWxhICggYmluZGluZyApIHtcblx0XHRcdFx0XHR2YXIgbWF0Y2hlcyA9IGF0dHJOYW1lLm1hdGNoKGJpbmRpbmcucmVnZXhwKTtcblx0XHRcdFx0XHRpZiAoIG1hdGNoZXMgKSB7XG5cdFx0XHRcdFx0XHRiaW5kaW5nLmZuKCRib3VuZEVsLCBtb2RlbCwgbWF0Y2hlcyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9LFxuXG5cblxuXHQvKipcblx0ICogSWYgYW55IHJlZ2lvbnMgZXhpc3QgaW4gdGhpcyBjb21wb25lbnQsXG5cdCAqIGVtcHR5IHRoZW0sIGFuZCB0aGVuIGRlbGV0ZSB0aGVtXG5cdCAqL1xuXHRlbXB0eUFsbFJlZ2lvbnM6IGZ1bmN0aW9uKCkge1xuXHRcdF8uZWFjaCh0aGlzLnJlZ2lvbnMsIGZ1bmN0aW9uIChyZWdpb24sIGtleSkge1xuXHRcdFx0cmVnaW9uLmVtcHR5KCk7XG5cdFx0XHRkZWxldGUgdGhpcy5yZWdpb25zW2tleV07XG5cdFx0fSwgdGhpcyk7XG5cdH0sXG5cblx0LyoqXG5cdCAqIEluc3RhbnRpYXRlIHJlZ2lvbiBjb21wb25lbnRzIGFuZCBhcHBlbmQgYW55IGRlZmF1bHRcblx0ICogdGVtcGxhdGVzL2NvbXBvbmVudHMgdG8gdGhlIERPTVxuXHQgKi9cblx0cmVuZGVyUmVnaW9uczogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdFx0aGVscGVycy5lbXB0eUFsbFJlZ2lvbnMoKTtcblxuXHRcdC8vIERldGVjdCBjaGlsZCByZWdpb25zIGluIHRlbXBsYXRlXG5cdFx0dmFyICRyZWdpb25zID0gdGhpcy4kKCdyZWdpb24sIFtkYXRhLXJlZ2lvbl0nKTtcblx0XHQkcmVnaW9ucy5lYWNoKGZ1bmN0aW9uIChpLCBlbCkge1xuXG5cdFx0XHQvLyBQcm92aWRlIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5IGZvclxuXHRcdFx0Ly8gYGRlZmF1bHRgLCBgY29udGVudHNgIGFuZCBgdGVtcGxhdGVgIG5vdGF0aW9uXG5cdFx0XHQvLyBOb3JtYWxpemVzIG5vdGF0aW9uIHRvIGBjb250ZW50c2AgYXR0cmlidXRlLlxuXHRcdFx0dmFyIGNvbXBvbmVudElkID0gJChlbCkuYXR0cignZGVmYXVsdCcpO1xuXHRcdFx0Y29tcG9uZW50SWQgPSBjb21wb25lbnRJZCB8fCAkKGVsKS5hdHRyKCdjb250ZW50cycpO1xuXHRcdFx0Y29tcG9uZW50SWQgPSBjb21wb25lbnRJZCB8fCAkKGVsKS5hdHRyKCd0ZW1wbGF0ZScpO1xuXHRcdFx0JChlbCkuYXR0cignY29udGVudHMnLCBjb21wb25lbnRJZCk7XG5cblx0XHRcdC8vIEdlbmVyYXRlIGEgcmVnaW9uIGluc3RhbmNlIGZyb20gdGhlIGVsZW1lbnRcblx0XHRcdC8vIChtb2RpZnlpbmcgdGhlIERPTSBhcyBuZWNlc3NhcnkpXG5cdFx0XHR2YXIgcmVnaW9uID0gRlJBTUVXT1JLLlJlZ2lvbi5mcm9tRWxlbWVudChlbCwgc2VsZik7XG5cblx0XHRcdC8vIElmIHJlZ2lvbiBoYXMgbm8gaWQsIGdlbmVyYXRlIGEgdW5pcXVlIHJlZ2lvbiBpZCB3L2kgdGhpcyBjb21wb25lbnRcblx0XHRcdC8vIHRoYXQgaXMgdW5saWtlbHkgdG8gY29sbGlkZSB3aXRoIG15IG90aGVyIG5hbWVkIHJlZ2lvbnNcblx0XHRcdGlmICghcmVnaW9uLmlkKSB7XG5cdFx0XHRcdHJlZ2lvbi5pZCA9ICcnK1xuXHRcdFx0XHRcdEZSQU1FV09SSy5vcHRpb25zLmZyYW1ld29ya0lkICtcblx0XHRcdFx0XHQnX19hbm9ueW1vdXNfcmVnaW9uX18nICtcblx0XHRcdFx0XHRzZWxmLmFub255bW91c1JlZ2lvbkNvdW50ZXI7XG5cblx0XHRcdFx0Ly8gSW5jcmVtZW50IGNvdW50ZXIgZm9yIG5leHQgdGltZVxuXHRcdFx0XHRzZWxmLmFub255bW91c1JlZ2lvbkNvdW50ZXIrKztcblx0XHRcdH1cblxuXHRcdFx0Ly8gS2VlcCB0cmFjayBvZiByZWdpb25zLCBzaW5jZSB3ZSBhcmUgdGhlIHBhcmVudCBjb21wb25lbnRcblx0XHRcdHNlbGYucmVnaW9uc1tyZWdpb24uaWRdID0gcmVnaW9uO1xuXG5cdFx0XHQvLyBBcyBsb25nIGFzIHRoZXJlIGFyZSBubyBjb2xsaXNpb25zLFxuXHRcdFx0Ly8gcHJvdmlkZSBhIGZyaWVuZGx5IHJlZmVyZW5jZSB0byB0aGUgcmVnaW9uIG9uIHRoZSB0b3AgbGV2ZWwgb2YgdGhlIGNvbGxlY3Rpb25cblx0XHRcdGlmICghc2VsZltyZWdpb24uaWRdKSB7XG5cdFx0XHRcdHNlbGZbcmVnaW9uLmlkXSA9IHJlZ2lvbjtcblx0XHRcdH1cblx0XHR9KTtcblx0fSxcblxuXHQvKipcblx0ICogQ29udmVydCB0ZW1wbGF0ZSBIVE1MIGFuZCBkYXRhIGludG8gYSBjb21waWxlZCAkdGVtcGxhdGVcblx0ICovXG5cdGNvbXBpbGVUZW1wbGF0ZTogZnVuY3Rpb24oKSB7XG5cblx0XHQvLyBDcmVhdGUgdGVtcGxhdGUgZGF0YSBjb250ZXh0IGJ5IHByb3ZpZGluZyBhY2Nlc3MgdG8gdGhlIGdsb2JhbCBEYXRhIG9iamVjdCxcblx0XHQvLyBBbHNvIGZvbGQgaW4gdGhlIG1vZGVsIGFzc29jaWF0ZWQgd2l0aCB0aGlzIGNvbXBvbmVudCwgaWYgdGhlcmUgaXMgb25lXG5cdFx0dmFyIHRlbXBsYXRlQ29udGV4dCA9IF8uZXh0ZW5kKHtcblxuXHRcdFx0Ly8gQWxsb3dzIHlvdSB0byBnZXQgYSBob2xkIG9mIGRhdGEsXG5cdFx0XHQvLyBidXQgdXNlIGEgZGVmYXVsdCB2YWx1ZSBpZiBpdCBkb2Vzbid0IGV4aXN0XG5cdFx0XHRnZXQ6IGZ1bmN0aW9uIChrZXksIGRlZmF1bHRWYWwpIHtcblx0XHRcdFx0dmFyIHZhbCA9IHRlbXBsYXRlQ29udGV4dFtrZXldO1xuXHRcdFx0XHRpZiAodHlwZW9mIHZhbCA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdFx0XHR2YWwgPSBkZWZhdWx0VmFsO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB2YWw7XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdC8vIEFsbCBGUkFNRVdPUksuZGF0YSBpcyBhdmFpbGFibGUgaW4gZXZlcnkgdGVtcGxhdGVcblx0XHRGUkFNRVdPUksuZGF0YSk7XG5cblx0XHQvLyBJZiBhIG1vZGVsIGlzIHByb3ZpZGVkIGZvciB0aGlzIGNvbXBvbmVudCwgbWFrZSBpdCBhdmFpbGFibGUgaW4gdGhpcyB0ZW1wbGF0ZVxuXHRcdGlmICh0aGlzLm1vZGVsKSB7XG5cdFx0XHRfLmV4dGVuZCh0ZW1wbGF0ZUNvbnRleHQsIHRoaXMubW9kZWwuYXR0cmlidXRlcyk7XG5cdFx0fVxuXG5cdFx0Ly8gVGVtcGxhdGUgdGhlIEhUTUwgd2l0aCB0aGUgZGF0YVxuXHRcdHZhciBodG1sO1xuXHRcdHRyeSB7XG5cdFx0XHQvLyBBY2NlcHQgcHJlY29tcGlsZWQgdGVtcGxhdGVzXG5cdFx0XHRpZiAoXy5pc0Z1bmN0aW9uKHRoaXMudGVtcGxhdGUpKSB7XG5cdFx0XHRcdGh0bWwgPSB0aGlzLnRlbXBsYXRlKHRlbXBsYXRlQ29udGV4dCk7XG5cdFx0XHR9XG5cdFx0XHQvLyBPciByYXcgc3RyaW5nc1xuXHRcdFx0ZWxzZSBodG1sID0gXy50ZW1wbGF0ZSh0aGlzLnRlbXBsYXRlLCB0ZW1wbGF0ZUNvbnRleHQpO1xuXHRcdH1cblx0XHRjYXRjaCAoZSkge1xuXHRcdFx0dmFyIHN0ciA9IGUsXG5cdFx0XHRcdHN0YWNrID0gJyc7XG5cblx0XHRcdGlmIChlIGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdFx0c3RyID0gIGUudG9TdHJpbmcoKTtcblx0XHRcdFx0c3RhY2sgPSBlLnN0YWNrO1xuXHRcdFx0fVxuXG5cdFx0XHRGUkFNRVdPUksuZXJyb3IodGhpcy5pZCArICcgOjogQ2Fubm90IHJlbmRlcigpIHRlbXBsYXRlIChwcm9iYWJseSBtaXNzaW5nIGRhdGEpLlxcblxcbkdvdCB0aGlzIGVycm9yIDo6XFxuJytzdHIsJ1xcbicpO1xuXHRcdFx0aWYgKGh0bWwpIHtGUkFNRVdPUksudmVyYm9zZSgnVGVtcGxhdGUgOjogJyArIGh0bWwpO31cblx0XHRcdEZSQU1FV09SSy52ZXJib3NlKCdGdWxsIFRlbXBsYXRlIEVycm9yOicgKyAnXFxuJyxzdGFjayk7XG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZSgnXFxuXFxuTW9yZSBpbmZvcm1hdGlvbjonLCAnXFxuXFxuVGVtcGxhdGUgY29udGV4dCA6OicsdGVtcGxhdGVDb250ZXh0LCAnXFxuXFxudGhpcy5tb2RlbDo6JywgdGhpcy5tb2RlbCk7XG5cdFx0XHRodG1sID0gXy5pc1N0cmluZyh0aGlzLnRlbXBsYXRlKSA/IHRoaXMudGVtcGxhdGUgOiBzdHI7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGh0bWw7XG5cdH1cblxufTtcblxuXG5cblxuLy8gUHJpdmF0ZSBpbnRyYS1oZWxwZXIgbWV0aG9kc1xuXG5cblxuLyoqXG4gKiBMb29rdXAgc3VpdGFibGUgZWxlbWVudHMgd2l0aGluIHRoaXMgY29tcG9uZW50J3MgJGVsIGNvbnRleHQuXG4gKiBJZ25vcmUgcmVnaW9ucywgYW5kIGluY2x1ZGUgdGhlIHRvcC1sZXZlbCBlbGVtZW50LlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBiaW5kaW5nU2VsZWN0b3IgLSBET00gc2VsZWN0b3IgdG8gdXNlXG4gKi9cbnZhciBfJHNlbGVjdE91dGVyID0gZnVuY3Rpb24gKCBiaW5kaW5nU2VsZWN0b3IgKSB7XG5cblx0Ly8gTG9va3VwIG1hdGNoZXNcblx0dmFyICRtYXRjaGVzID0gdGhpcy4kKGJpbmRpbmdTZWxlY3Rvcik7XG5cblx0Ly8gSWYgdG9wLWxldmVsIGVsZW1lbnQgaW4gdGVtcGxhdGUgaGFzIGEgZGF0YS1iaW5kaW5nLCBpbmNsdWRlIGl0XG5cdGlmICh0aGlzLiRlbC5maWx0ZXIoYmluZGluZ1NlbGVjdG9yKSkge1xuXHRcdCRtYXRjaGVzID0gJC5tZXJnZSgkbWF0Y2hlcywgdGhpcy4kZWwpO1xuXHR9XG5cblx0Ly8gT21pdCBhbnl0aGluZyBpbnNpZGUgYSByZWdpb24sIHNpbmNlIHRob3NlIGJpbmRpbmdzIHdpbGwgaGF2ZSBhbHJlYWR5XG5cdC8vIGJlZW4gdGFrZW4gY2FyZSBvZiBieSBvbmUgb2YgdGhlIGRlc2NlbmRhbnQgY29tcG9uZW50KHMpIHdpdGhpbiB0aGUgcmVnaW9uLlxuXHQvL1xuXHQvLyBUT0RPOiBvcHRpbWl6ZSB0byBleGNsdWRlIHRoZXNlIGVsZW1lbnRzIGZyb20gdGhlIG9yaWdpbmFsIERPTSBzZWxlY3Rpb25cblx0JG1hdGNoZXMgPSAkbWF0Y2hlcy5ub3QoIHRoaXMuJCgncmVnaW9uICosIFtkYXRhLXJlZ2lvbl0gKicpICk7XG5cblx0cmV0dXJuICRtYXRjaGVzO1xufTtcblxuXG5cbi8vIFJlZ2V4cHMgZm9yIGRldGVjdGlvbiBvZiB3aWxkY2FyZCBuYW1lZCBwYXJhbWV0ZXJzIGluIGN1c3RvbSBlbGVtZW50IGF0dHJpYnV0ZSBuYW1lcy5cbnZhciBvcHRpb25hbFBhcmFtID0gL1xcKCguKj8pXFwpL2c7XG52YXIgbmFtZWRQYXJhbSA9IC8oXFwoXFw/KT86XFx3Ky9nO1xudmFyIHNwbGF0UGFyYW0gPSAvXFwqXFx3Ky9nO1xudmFyIGVzY2FwZVJlZ0V4cCA9IC9bXFwte31cXFtcXF0rPy4sXFxcXFxcXiR8I1xcc10vZztcblxuXG4vLyBCdWlsZCBzZWxlY3RvciBmb3Igc3VwZXJzZXQgb2YgdGhlc2UgYmluZGluZ3NcbnZhciBfYXR0ck5hbWVUb1JlZ0V4cCA9IGZ1bmN0aW9uKCBhdHRyRXhwcmVzc2lvbiApIHtcblxuXHRhdHRyRXhwcmVzc2lvbiA9IGF0dHJFeHByZXNzaW9uLnJlcGxhY2UoZXNjYXBlUmVnRXhwLCAnXFxcXCQmJylcblx0XHQucmVwbGFjZShvcHRpb25hbFBhcmFtLCAnKD86JDEpPycpXG5cdFx0LnJlcGxhY2UobmFtZWRQYXJhbSwgZnVuY3Rpb24obWF0Y2gsIG9wdGlvbmFsKSB7XG5cdFx0XHRyZXR1cm4gb3B0aW9uYWwgPyBtYXRjaCA6ICcoW15cXC9dKyknO1xuXHRcdH0pXG5cdFx0LnJlcGxhY2Uoc3BsYXRQYXJhbSwgJyguKj8pJyk7XG5cdHJldHVybiAnXicgKyBhdHRyRXhwcmVzc2lvbiArICckJztcbn07XG52YXIgX2V4dHJhY3RQYXJhbWV0ZXJzID0gZnVuY3Rpb24ocmVnZXhwLCBhdHRyTmFtZSwgYXR0ckV4cHJlc3Npb24pIHtcblx0dmFyIHBhcmFtVmFsdWVzID0gcmVnZXhwLmV4ZWMoYXR0ck5hbWUpLnNsaWNlKDEpO1xuXHR2YXIgcGFyYW1LZXlzID0gbmFtZWRQYXJhbS5leGVjKGF0dHJFeHByZXNzaW9uKTtcblxuXHRpZiAoIXBhcmFtS2V5cyB8fCAhcGFyYW1WYWx1ZXMpIHJldHVybiB7fTtcblxuXHR2YXIgbmFtZWRQYXJhbWV0ZXJzID0ge307XG5cdGNvbnNvbGUubG9nKCdwYXJhbVZhbHVlczonLHBhcmFtVmFsdWVzKTtcblx0Xy5lYWNoKHBhcmFtVmFsdWVzLCBmdW5jdGlvbiBlYWNoTWF0Y2hpbmdQaWVjZSggcGFyYW0sIGkgKSB7XG5cdFx0dmFyIGtleSA9IHBhcmFtS2V5c1tpXTtcblx0XHRrZXkgPSBrZXkuc2xpY2UoMSk7IC8vIHJlbW92ZSBgOmAgZnJvbSBuYW1lZCBwYXJhbVxuXHRcdG5hbWVkUGFyYW1ldGVyc1trZXldID0gcGFyYW1WYWx1ZXNbaV07XG5cdH0pO1xuXHRyZXR1cm4gbmFtZWRQYXJhbWV0ZXJzO1xufTtcblxuXG5cbi8qKlxuICogUmVuZGVyIGEgc2luZ2xlIGJpbmRpbmdcbiAqL1xudmFyIF9yZW5kZXJCaW5kaW5nID0gZnVuY3Rpb24gKCRtYXRjaGVkRWwsIGRvbUF0dHJpYnV0ZU5hbWUsIG1vZGVsLCByZW5kZXJGbiwgbmFtZWRQYXJhbXMpIHtcblx0dmFyIHJhd0JpbmRpbmcgPSAkbWF0Y2hlZEVsLmF0dHIoIGRvbUF0dHJpYnV0ZU5hbWUgKTtcblx0Ly8gSWYgZWxlbWVudCBkb2Vzbid0IGNvbnRhaW4gdGhlIHNwZWNpZmllZCBET00gYXR0cmlidXRlLi4uXG5cdC8vIGZhaWwgc2lsZW50bHkuXG5cdGlmICggIXJhd0JpbmRpbmcgKSByZXR1cm47XG5cblx0Ly8gY29uc29sZS5sb2coJ2dldHRpbmcgJyxkb21BdHRyaWJ1dGVOYW1lLCdvbicsJG1hdGNoZWRFbCk7XG5cdHZhciBtb2RlbEF0dHJpYnV0ZU5hbWUgPSByYXdCaW5kaW5nLnJlcGxhY2UoL15cXEAvLCAnJyk7XG5cdEZSQU1FV09SSy5kZWJ1ZygnRm91bmQgYSBiaW5kaW5nIDo6JywgcmF3QmluZGluZywgJzo6JywgbmFtZWRQYXJhbXMpO1xuXG5cdC8vIElmIG1vZGVsIGRvZXNuJ3QgY29udGFpbiB0aGUgc3BlY2lmaWVkIGF0dHJpYnV0ZS4uLlxuXHRpZiAoIHR5cGVvZiBtb2RlbC5hdHRyaWJ1dGVzW21vZGVsQXR0cmlidXRlTmFtZV0gPT09ICd1bmRlZmluZWQnICkge1xuXG5cdFx0Ly8gZmFpbCBzaWxlbnRseS5cblx0XHRyZXR1cm47XG5cdFx0Ly8gRlJBTUVXT1JLLndhcm4oJ0Nhbm5vdCBiaW5kIGBAJyttb2RlbEF0dHJpYnV0ZU5hbWUrJyBmb3IgdGVtcGxhdGUvY29tcG9uZW50ICcgK1xuXHRcdC8vIFx0J2AnICsgY29tcG9uZW50LmlkICsnYC5cXG4nK1xuXHRcdC8vIFx0J05vIHN1Y2ggYXR0cmlidXRlIGV4aXN0cyBpbiB0aGUgY29tcG9uZW50XFwncyBtb2RlbC4nXG5cdFx0Ly8gKTtcblx0fVxuXG5cdC8vIFJlbmRlciBhIGRhdGEgYmluZGluZ1xuXHR2YXIgYmluZGluZ1ZhbCA9IG1vZGVsLmdldChtb2RlbEF0dHJpYnV0ZU5hbWUpIHx8ICcnO1xuXHRyZW5kZXJGbiggJG1hdGNoZWRFbCwgYmluZGluZ1ZhbCwgbmFtZWRQYXJhbXMgKTtcbn07XG5cblxuLyoqXG4gKiBSZW5kZXIgdGhlIHNwZWNpZmllZCB0eXBlIG9mIGRhdGEgYmluZGluZ3NcbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9uc1xuICpcdFx0QG9wdGlvbiB7RnVuY3Rpb259IHJlbmRlckZuICgkZWwsIHZhbCwgcGFyYW1zKVx0LT4gZnVuY3Rpb24gd2hpY2ggcmVuZGVycyB0aGUgZGF0YSBiaW5kaW5nIGZvciB0aGUgc3BlY2lmaWVkIGVsZW1lbnRcbiAqXHRcdFx0QHBhcmFtIHtKUXVlcnlFbGVtZW50fSAkZWxcbiAqXHRcdFx0QHBhcmFtIHs/fSB2YWwgLT4gdmFsdWUgb2YgYm91bmQgbW9kZWwgYXR0cmlidXRlXG4gKlx0XHRcdEBwYXJhbSB7T2JqZWN0fSBwYXJhbXMgLT4ga2V5ZWQgb2JqZWN0IG9mIGR5bmFtaWMgcGFyYW1ldGVycyBmcm9tIHRoZSBuYW1lIG9mIHRoZSBhdHRyaWJ1dGUgaXRzZWxmXG4gKlx0XHRAb3B0aW9uIHtTdHJpbmd9IGF0dHJpYnV0ZSAtPiBuYW1lIG9mIGJvdW5kIGF0dHJpYnV0ZSwgZS5nLiAnYmluZC10ZXh0J1xuICpcdFx0QG9wdGlvbiB7Q29tcG9uZW50fSBjb21wb25lbnRcbiAqXHRcdEBvcHRpb24ge0JhY2tib25lLk1vZGVsfSBbbW9kZWxdIC0gZGVmYXVsdHMgdG8gYGNvbXBvbmVudC5tb2RlbGBcbiAqL1xudmFyIF9yZW5kZXJCaW5kaW5ncyA9IGZ1bmN0aW9uICggb3B0aW9ucyApIHtcblx0dmFyIGNvbXBvbmVudCA9IG9wdGlvbnMuY29tcG9uZW50O1xuXHR2YXIgYXR0cmlidXRlRXhwcmVzc2lvbiA9IG9wdGlvbnMuYXR0cmlidXRlO1xuXHR2YXIgbW9kZWwgPSBvcHRpb25zLm1vZGVsIHx8IG9wdGlvbnMuY29tcG9uZW50Lm1vZGVsO1xuXG5cblx0Ly8gQ2FsY3VsYXRlIHN0cmluZyB3aGljaCBjYW4gYmUgXCJuZXctZWRcIiBpbnRvIGEgUmVnRXhwXG5cdHZhciBhdHRyUmVnRXhwU3RyID0gX2F0dHJOYW1lVG9SZWdFeHAoYXR0cmlidXRlRXhwcmVzc2lvbik7XG5cdHZhciBhdHRyUmVnRXhwID0gbmV3IFJlZ0V4cChhdHRyUmVnRXhwU3RyKTtcblxuXG5cdHZhciBib3VuZEF0dHJTZWxlY3RvciA9ICc6bWF0Y2hBdHRyKFwiJyArIGF0dHJSZWdFeHBTdHIgKyAnXCIpJztcblxuXHQvLyBGaW5kIGFsbCByZWxldmFudCBkZXNjZW5kYW50IGVsZW1lbnRzXG5cdHZhciAkbWF0Y2hlcyA9IF9nZXQkTWF0Y2hlcyhib3VuZEF0dHJTZWxlY3RvciwgY29tcG9uZW50KTtcblxuXHQvLyBFYXJseSBleGl0IGZvciBzaW1wbGUgYmluZGluZ3MgKHcvbyBib3VuZCBwYXJhbXMpXG5cdGlmICggIWF0dHJpYnV0ZUV4cHJlc3Npb24ubWF0Y2goL1xcOi8pKSB7XG5cdFx0JG1hdGNoZXMuZWFjaChmdW5jdGlvbiAoKSB7XG5cdFx0XHRfcmVuZGVyQmluZGluZygkKHRoaXMpLCBhdHRyaWJ1dGVFeHByZXNzaW9uLCBtb2RlbCwgb3B0aW9ucy5yZW5kZXJGbiwge30pO1xuXG5cdFx0fSk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Y29uc29sZS5sb2coJ1xcblJlbmRlcmluZyBwYXJhbWV0ZXJpemVkIGRhdGEgYmluZGluZzogJyxhdHRyUmVnRXhwKTtcblxuXHQvLyBUT0RPOiBiYXRjaCBpdCB1cCBzbyB3ZSBvbmx5IGRvIG9uZSBET00gcXVlcnlcblx0JG1hdGNoZXMuZWFjaChmdW5jdGlvbiBlYWNoRWxlbWVudFdpdGhBQmluZGluZyAoKSB7XG5cdFx0dmFyICRtYXRjaGVkRWwgPSAkKHRoaXMpO1xuXG5cdFx0Ly8gR2V0IGFsbCBhdHRyaWJ1dGVzIGZvciB0aGlzICRlbCBhbmQgZmlsdGVyIGEgc2V0IG9mIG1hdGNoaW5nIG5hbWVzL3BhcmFtc1xuXHRcdHZhciBhbGxET01BdHRyTmFtZXMgPSBfLm1hcCggJG1hdGNoZWRFbFswXS5hdHRyaWJ1dGVzLCBmdW5jdGlvbiAoZWwpIHtcblx0XHRcdHJldHVybiBlbC5ub2RlTmFtZTtcblx0XHR9KTtcblx0XHRjb25zb2xlLmxvZygnYWxsRE9NQXR0ck5hbWVzIGZvciBlbCcsYWxsRE9NQXR0ck5hbWVzLCAkbWF0Y2hlZEVsKTtcblx0XHR2YXIgbWF0Y2hpbmdET01BdHRycyA9IHt9O1xuXHRcdF8uZWFjaCggYWxsRE9NQXR0ck5hbWVzLCBmdW5jdGlvbiBlYWNoQXR0cmlidXRlICggZG9tQXR0ck5hbWUgKSB7XG5cdFx0XHQvLyBjb25zb2xlLmxvZygnY2hlY2tpbmcnLGRvbUF0dHJOYW1lKTtcblx0XHRcdGlmICggZG9tQXR0ck5hbWUubWF0Y2goYXR0clJlZ0V4cCkpIHtcblx0XHRcdFx0bWF0Y2hpbmdET01BdHRyc1tkb21BdHRyTmFtZV0gPSBfZXh0cmFjdFBhcmFtZXRlcnMoIGF0dHJSZWdFeHAsIGRvbUF0dHJOYW1lLCBhdHRyaWJ1dGVFeHByZXNzaW9uICk7XG5cdFx0XHRcdC8vIGNvbnNvbGUubG9nKCcsIGdvdCcsbWF0Y2hpbmdET01BdHRyc1tkb21BdHRyTmFtZV0sICcgKCgoJyxkb21BdHRyTmFtZSwgYXR0cmlidXRlRXhwcmVzc2lvbik7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblxuXHRcdGNvbnNvbGUubG9nKCcgKioqKiBtYXRjaGluZ0RPTUF0dHJzIDo6JywgbWF0Y2hpbmdET01BdHRycyk7XG5cblx0XHR0aHJvdyBuZXcgRXJyb3IoJ2h3YWFhJyk7XG5cdFx0Xy5lYWNoKG1hdGNoaW5nRE9NQXR0cnMsIGZ1bmN0aW9uICggbmFtZWRQYXJhbXMsIGRvbUF0dHJpYnV0ZU5hbWUgKSB7XG5cdFx0XHRfcmVuZGVyQmluZGluZygkbWF0Y2hlZEVsLCBkb21BdHRyaWJ1dGVOYW1lLCBtb2RlbCwgb3B0aW9ucy5yZW5kZXJGbiwgbmFtZWRQYXJhbXMpO1xuXHRcdH0pO1xuXG5cdH0pO1xufTtcblxuXG5cblxuXG5cbi8qKlxuICogQ3JlYXRlIHBzZXVkby1zZWxlY3RvciBmb3IgZ2V0dGluZyB3aWxkY2FyZCBkYXRhIGF0dHJpYnV0ZXMuXG4gKlxuICogVXNhZ2U6XG4gKiAkKFwiOm1hdGNoQXR0cignXmRhdGEtJylcIilcbiAqXG4gKiBTb3VyY2U6XG4gKiBodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8xMzIyMjUwOS80ODY1NDdcbiAqL1xualF1ZXJ5LmV4cHIucHNldWRvcy5tYXRjaEF0dHIgPSAkLmV4cHIuY3JlYXRlUHNldWRvKGZ1bmN0aW9uKGFyZykge1xuXG4gICAgdmFyIHJlZ2V4cCA9IG5ldyBSZWdFeHAoYXJnKTtcbiAgICByZXR1cm4gZnVuY3Rpb24oZWxlbSkge1xuICAgICAgICBmb3IodmFyIGkgPSAwOyBpIDwgZWxlbS5hdHRyaWJ1dGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgYXR0ciA9IGVsZW0uYXR0cmlidXRlc1tpXTtcbiAgICAgICAgICAgIGlmKHJlZ2V4cC50ZXN0KGF0dHIubmFtZSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfTtcbn0pO1xuXG4iLCIvKipcbiAqIENvbXBvbmVudCBpcyBhbiBleHRlbmRlZCBgQmFja2JvbmUuVmlld2AuIEl0IGFkZCBmZWF0dXJlcyBzdWNoIGFzIGF1dG9tYXRpYyBldmVudCBiaW5kaW5nLFxuICogcmVuZGVyaW5nLCBsaWZlY3ljbGUgaG9va3MgYW5kIGV2ZW50cywgYW5kIG1vcmUuXG4gKi9cblxudmFyIGxpZmVjeWNsZUhvb2tzICAgICA9IHJlcXVpcmUoJy4vbGlmZWN5Y2xlSG9va3MnKSxcblx0bGlmZWN5Y2xlRXZlbnRzICAgID0gcmVxdWlyZSgnLi9saWZlY3ljbGVFdmVudHMnKSxcblx0YmluZEV2ZW50cyAgICAgICAgID0gcmVxdWlyZSgnLi9iaW5kRXZlbnRzJyksXG5cdGNsb3NlICAgICAgICAgICAgICA9IHJlcXVpcmUoJy4vY2xvc2UnKSxcblx0cmVuZGVyICAgICAgICAgICAgID0gcmVxdWlyZSgnLi9yZW5kZXInKSxcblx0cmVuZGVyQ29sbGVjdGlvbiAgID0gcmVxdWlyZSgnLi9yZW5kZXJDb2xsZWN0aW9uJyksXG5cdHZhbGlkYXRlRGVmaW5pdGlvbiA9IHJlcXVpcmUoJy4vdmFsaWRhdGVEZWZpbml0aW9uJyk7XG5cbkNvbXBvbmVudCA9IG1vZHVsZS5leHBvcnRzID0gQmFja2JvbmUuVmlldy5leHRlbmQoKTtcblxuXG5fLmV4dGVuZChDb21wb25lbnQucHJvdG90eXBlLCB7XG5cblx0Ly8gTGlmZWN5Y2xlIEhvb2tzXG5cdGJlZm9yZVJlbmRlcjogZnVuY3Rpb24oY2IpIHtcblx0XHRsaWZlY3ljbGVIb29rcy5iZWZvcmVSZW5kZXIuY2FsbCh0aGlzLCBjYik7XG5cdH0sXG5cdGJlZm9yZUNsb3NlOiBmdW5jdGlvbihjYikge1xuXHRcdGxpZmVjeWNsZUhvb2tzLmJlZm9yZUNsb3NlLmNhbGwodGhpcywgY2IpO1xuXHR9LFxuXHRhZnRlclJlbmRlcjogZnVuY3Rpb24oKSB7XG5cdFx0bGlmZWN5Y2xlSG9va3MuYWZ0ZXJSZW5kZXIuY2FsbCh0aGlzKTtcblx0fSxcblx0Y2FuY2VsUmVuZGVyOiBmdW5jdGlvbigpIHtcblx0XHRsaWZlY3ljbGVIb29rcy5jYW5jZWxSZW5kZXIuY2FsbCh0aGlzKTtcblx0fSxcblx0Y2FuY2VsQ2xvc2U6IGZ1bmN0aW9uKCkge1xuXHRcdGxpZmVjeWNsZUhvb2tzLmNhbmNlbENsb3NlLmNhbGwodGhpcyk7XG5cdH0sXG5cblx0Ly8gTGlmZWN5Y2xlIEV2ZW50c1xuXHRhZnRlckNoYW5nZTogZnVuY3Rpb24obW9kZWwsIG9wdGlvbnMpIHtcblx0XHRsaWZlY3ljbGVFdmVudHMuYWZ0ZXJDaGFuZ2UuY2FsbCh0aGlzLCBtb2RlbCwgb3B0aW9ucyk7XG5cdH0sXG5cdGFmdGVyQWRkOiBmdW5jdGlvbihtb2RlbCwgY29sbGVjdGlvbiwgb3B0aW9ucykge1xuXHRcdGxpZmVjeWNsZUV2ZW50cy5hZnRlckFkZC5jYWxsKHRoaXMsIG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zKTtcblx0fSxcblx0YWZ0ZXJSZW1vdmU6IGZ1bmN0aW9uKG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zKSB7XG5cdFx0bGlmZWN5Y2xlRXZlbnRzLmFmdGVyUmVtb3ZlLmNhbGwodGhpcywgbW9kZWwsIGNvbGxlY3Rpb24sIG9wdGlvbnMpO1xuXHR9LFxuXHRhZnRlclJlc2V0OiBmdW5jdGlvbihjb2xsZWN0aW9uLCBvcHRpb25zKSB7XG5cdFx0bGlmZWN5Y2xlRXZlbnRzLmFmdGVyUmVzZXQuY2FsbCh0aGlzLCBjb2xsZWN0aW9uLCBvcHRpb25zKTtcblx0fSxcblxuXHQvLyBQcm90b3R5cGUgbWV0aG9kcy5cblx0Y2xvc2U6IGZ1bmN0aW9uKCkge1xuXHRcdGNsb3NlLmNhbGwodGhpcyk7XG5cdH0sXG5cdHJlbmRlcjogZnVuY3Rpb24oYXRJbmRleCkge1xuXHRcdHJlbmRlci5jYWxsKHRoaXMsIGF0SW5kZXgpO1xuXHR9LFxuXG5cdHJlbmRlckNvbGxlY3Rpb246IGZ1bmN0aW9uICgpIHtcblx0XHR2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG5cdFx0cmVuZGVyQ29sbGVjdGlvbi5hcHBseSh0aGlzLCBhcmdzKTtcblx0fSxcbn0pO1xuXG5cblxuXG5Db21wb25lbnQucHJvdG90eXBlLmluaXRpYWxpemUgPSBmdW5jdGlvbihwcm9wZXJ0aWVzKSB7XG5cblx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdC8vIEtlZXAgdHJhY2sgb2YgYSBjb3VudGVyIGZvciB1c2UgaW4gZ2VuZXJhdGluZ1xuXHQvLyBpZHMgZm9yIGFub255bW91cyBjb21wb25lbnRzLlxuXHR0aGlzLmFub255bW91c1JlZ2lvbkNvdW50ZXIgPSAwO1xuXG5cdC8vIERpc2FibGUgb3IgaXNzdWUgd2FybmluZ3MgYWJvdXQgY2VydGFpbiBwcm9wZXJ0aWVzXG5cdC8vIGFuZCBtZXRob2RzIHRvIGF2b2lkIGNvbmZ1c2lvblxuXHRwcm9wZXJ0aWVzID0gdmFsaWRhdGVEZWZpbml0aW9uKHByb3BlcnRpZXMpO1xuXG5cdC8vIEV4dGVuZCBpbnN0YW5jZSB3LyBzcGVjaWZpZWQgcHJvcGVydGllcyBhbmQgbWV0aG9kc1xuXHRfLmV4dGVuZCh0aGlzLCBwcm9wZXJ0aWVzKTtcblxuXHQvLyBTdGFydCB3aXRoIGVtcHR5IHJlZ2lvbnMgb2JqZWN0XG5cdHRoaXMucmVnaW9ucyA9IHt9O1xuXG5cdC8vIEVuY291cmFnZSBjaGlsZCBtZXRob2RzIHRvIHVzZSB0aGUgY29tcG9uZW50IGNvbnRleHRcblx0Xy5iaW5kQWxsKHRoaXMpO1xufTtcbiIsIi8vIEZpcmVkIHdoZW4gdGhlIGJvdW5kIG1vZGVsIGlzIHVwZGF0ZWQgKGB0aGlzLm1vZGVsYClcbmV4cG9ydHMuYWZ0ZXJDaGFuZ2UgPSBmdW5jdGlvbiAobW9kZWwsIG9wdGlvbnMpIHt9O1xuXG4vLyBGaXJlZCB3aGVuIGEgbW9kZWwgaXMgYWRkZWQgdG8gdGhlIGJvdW5kIGNvbGxlY3Rpb24gKGB0aGlzLmNvbGxlY3Rpb25gKVxuZXhwb3J0cy5hZnRlckFkZCA9IGZ1bmN0aW9uIChtb2RlbCwgY29sbGVjdGlvbiwgb3B0aW9ucykge307XG5cbi8vIEZpcmVkIHdoZW4gYSBtb2RlbCBpcyByZW1vdmVkIGZyb20gdGhlIGJvdW5kIGNvbGxlY3Rpb24gKGB0aGlzLmNvbGxlY3Rpb25gKVxuZXhwb3J0cy5hZnRlclJlbW92ZSA9IGZ1bmN0aW9uIChtb2RlbCwgY29sbGVjdGlvbiwgb3B0aW9ucykge307XG5cbi8vIEZpcmVkIHdoZW4gdGhlIGJvdW5kIGNvbGxlY3Rpb24gaXMgd2lwZWQgKGB0aGlzLmNvbGxlY3Rpb25gKVxuZXhwb3J0cy5hZnRlclJlc2V0ID0gZnVuY3Rpb24gKGNvbGxlY3Rpb24sIG9wdGlvbnMpIHt9O1xuIiwiLy8gRmlyZWQgYXV0b21hdGljYWxseSB3aGVuIHRoZSB2aWV3IGlzIGluaXRpYWxseSBjcmVhdGVkXG4vLyBvbmx5IGZpcmVkIGFmdGVyd2FyZHMgaWYgdGhpcy5yZW5kZXIoKSBpcyBleHBsaWNpdGx5IGNhbGxlZFxuLy8gQ2FsbGJhY2sgbXVzdCBiZSBmaXJlZCEhXG5leHBvcnRzLmJlZm9yZVJlbmRlciA9IGZ1bmN0aW9uIChjYikge2NiKCk7fTtcblxuLy8gRmlyZWQgYXV0b21hdGljYWxseSB3aGVuIHRoZSB2aWV3IGlzIGluaXRpYWxseSBjcmVhdGVkXG4vLyBvbmx5IGZpcmVkIGFmdGVyd2FyZHMgaWYgdGhpcy5yZW5kZXIoKSBpcyBleHBsaWNpdGx5IGNhbGxlZFxuZXhwb3J0cy5hZnRlclJlbmRlciA9IGZ1bmN0aW9uICgpIHt9O1xuXG4vLyBGaXJlZCBhdXRvbWF0aWNhbGx5IHdoZW4gdGhlIHZpZXcgaXMgY2xvc2VkXG5leHBvcnRzLmJlZm9yZUNsb3NlID0gZnVuY3Rpb24gKGNiKSB7Y2IoKTt9O1xuXG4vLyBGaXJlZCBiZWZvcmUgcmVyZW5kZXJpbmcgb3IgY2xvc2luZyBhIHZpZXcgdGhhdCBpcyBhbHJlYWR5IHdhaXRpbmcgb24gYSBsb2NrXG5leHBvcnRzLmNhbmNlbFJlbmRlciA9IGZ1bmN0aW9uICgpIHtcblx0RlJBTUVXT1JLLndhcm4oJ2NhbmNlbFJlbmRlcigpIHNob3VsZCBiZSBkZWZpbmVkIGlmIGJlZm9yZUNsb3NlKGNiKSBvciBiZWZvcmVSZW5kZXIoY2IpJyArXG5cdFx0XHRcdFx0XHRcdFx0ICdhcmUgYmVpbmcgdXNlZCEnKTtcbn07XG5cbi8vIEZpcmVkIGJlZm9yZSByZXJlbmRlcmluZyBvciBjbG9zaW5nIGEgdmlldyB0aGF0IGlzIGFscmVhZHkgd2FpdGluZyBvbiBhIGxvY2tcbmV4cG9ydHMuY2FuY2VsQ2xvc2UgPSBmdW5jdGlvbiAoKSB7XG5cdEZSQU1FV09SSy53YXJuKCdjYW5jZWxDbG9zZSgpIHNob3VsZCBiZSBkZWZpbmVkIGlmIGJlZm9yZUNsb3NlKGNiKSBvciBiZWZvcmVSZW5kZXIoY2IpJyArXG5cdFx0XHRcdFx0XHRcdFx0ICdhcmUgYmVpbmcgdXNlZCEnKTtcbn07XG4iLCIvKipcbiAqIFJ1biBIVE1MIHRlbXBsYXRlIHRocm91Z2ggZW5naW5lIGFuZCBhcHBlbmQgcmVzdWx0cyB0byBvdXRsZXQuIEFsc28gcmVyZW5kZXIgcmVnaW9ucy5cbiAqIElmIGF0SW5kZXggaXMgc3BlY2lmaWVkLCB0aGUgY29tcG9uZW50IGlzIHJlbmRlcmVkIGF0IHRoZSBnaXZlbiBwb3NpdGlvbiB3aXRoaW4gaXRzXG4gKiBvdXRsZXQuIE90aGVyd2lzZSwgdGhlIGxhc3QgcG9zaXRpb24gaXMgdXNlZC5cbiAqXG4gKiBAcGFyYW0ge051bWJlcn0gYXRJbmRleCBbVGhlIGluZGV4IGluIHdoaWNoIHRvIHJlbmRlciB0aGlzIGVsZW1lbnRdXG4gKi9cblxudmFyIERPTSA9IHJlcXVpcmUgKCcuLi91dGlscy9ET00nKSxcblx0XHRoZWxwZXJzID0gcmVxdWlyZSgnLi9oZWxwZXJzJyksXG5cdFx0YmluZEV2ZW50cyA9IHJlcXVpcmUgKCcuL2JpbmRFdmVudHMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByZW5kZXIoYXRJbmRleCkge1xuXG5cdEZSQU1FV09SSy5kZWJ1Zyh0aGlzLmlkICsgJyA6LS0tOiBSZW5kZXJpbmcgY29tcG9uZW50Li4uJyk7XG5cblx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdC8vIENhbmNlbCBjdXJyZW50IHJlbmRlciBhbmQgY2xvc2Ugam9icywgaWYgdGhleSdyZSBydW5uaW5nXG5cdGlmICh0aGlzLl9yZW5kZXJpbmcpIHtcblx0XHRGUkFNRVdPUksuZGVidWcodGhpcy5pZCArICcgOjogcmVuZGVyKCkgY2FuY2VsZWQuJyk7XG5cdFx0dGhpcy5fcmVuZGVyaW5nQ2FuY2VsZWQgPSB0cnVlO1xuXHRcdHRoaXMuY2FuY2VsUmVuZGVyKCk7XG5cdFx0dGhpcy5fcmVuZGVyaW5nID0gZmFsc2U7XG5cdH1cblx0aWYgKHRoaXMuX2Nsb3NpbmcpIHtcblx0XHRGUkFNRVdPUksuZGVidWcodGhpcy5pZCArICcgOjogY2xvc2UoKSBjYW5jZWxlZC4nKTtcblx0XHR0aGlzLmNhbmNlbENsb3NlKCk7XG5cdFx0dGhpcy5fY2xvc2luZyA9IGZhbHNlO1xuXHR9XG5cblx0Ly8gTG9jayBhY2Nlc3MgdG8gcmVuZGVyXG5cdHRoaXMuX3JlbmRlcmluZyA9IHRydWU7XG5cblx0Ly8gVHJpZ2dlciBiZWZvcmVSZW5kZXIgbWV0aG9kXG5cdHRoaXMuYmVmb3JlUmVuZGVyKGZ1bmN0aW9uICgpIHtcblxuXHRcdC8vIElmIHJlbmRlcmluZyB3YXMgY2FuY2VsZWQsIGJyZWFrIG91dFxuXHRcdC8vIGRvIG5vdCByZW5kZXIsIGFuZCBkbyBub3QgY2FsbCBhZnRlclJlbmRlcigpXG5cdFx0aWYgKCBzZWxmLl9yZW5kZXJpbmdDYW5jZWxlZCApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBCaW5kIHRoZSBldmVudHMgb24gbW9kZWwvY29sbGVjdGlvbnMgYW5kIGdsb2JhbCB0cmlnZ2VyZWQgZXZlbnRzLlxuXHRcdGJpbmRFdmVudHMuY29sbGVjdGlvbkV2ZW50cy5jYWxsKHNlbGYpO1xuXHRcdGJpbmRFdmVudHMubW9kZWxFdmVudHMuY2FsbChzZWxmKTtcblx0XHRiaW5kRXZlbnRzLmdsb2JhbFRyaWdnZXJzLmNhbGwoc2VsZik7XG5cblx0XHQvLyBVbmxvY2sgcmVuZGVyaW5nIG11dGV4XG5cdFx0c2VsZi5fcmVuZGVyaW5nID0gZmFsc2U7XG5cblx0XHRpZiAoIXNlbGYuJG91dGxldCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKHNlbGYuaWQgKyAnIDo6IFRyeWluZyB0byByZW5kZXIoKSwgYnV0IG5vICRvdXRsZXQgd2FzIGRlZmluZWQhJyk7XG5cdFx0fVxuXG5cdFx0Ly8gSHlkcmF0ZSBjb21waWxlZCB0ZW1wbGF0ZVxuXHRcdC8vIChjb21iaW5lcyB0aGUgdGVtcGxhdGUgZnVuY3Rpb24gd2l0aCBkYXRhIHRvIHJldHVybiBIVE1MKVxuXHRcdHZhciBodG1sID0gaGVscGVycy5jb21waWxlVGVtcGxhdGUuY2FsbChzZWxmKTtcblx0XHRpZiAoIWh0bWwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcih0aGlzLmlkICsgJyA6OiBVbmFibGUgdG8gcmVuZGVyIGNvbXBvbmVudCBiZWNhdXNlIHRlbXBsYXRlIGNvbXBpbGF0aW9uIGRpZCBub3QgcmV0dXJuIGFueSBIVE1MLicpO1xuXHRcdH1cblxuXHRcdC8vIFN0cmlwIHRyYWlsaW5nIGFuZCBsZWFkaW5nIHdoaXRlc3BhY2UgdG8gYXZvaWQgZmFsc2VseSBkaWFnbm9zaW5nXG5cdFx0Ly8gbXVsdGlwbGUgZWxlbWVudHMsIHdoZW4gb25seSBvbmUgYWN0dWFsbHkgZXhpc3RzXG5cdFx0Ly8gKHRoaXMgbWlzZGlhZ25vc2lzIHdyYXBzIHRoZSB0ZW1wbGF0ZSBpbiBhbiBleHRyYW5lb3VzIDxkaXY+KVxuXHRcdGh0bWwgPSBodG1sLnJlcGxhY2UoL15cXHMqLywgJycpO1xuXHRcdGh0bWwgPSBodG1sLnJlcGxhY2UoL1xccyokLywgJycpO1xuXHRcdGh0bWwgPSBodG1sLnJlcGxhY2UoLyhcXHJ8XFxuKSovLCAnJyk7XG5cblx0XHQvLyBTdHJpcCBIVE1MIGNvbW1lbnRzLCB0aGVuIHN0cmlwIHdoaXRlc3BhY2UgYWdhaW5cblx0XHQvLyAoVE9ETzogb3B0aW1pemUgdGhpcylcblx0XHRodG1sID0gaHRtbC5yZXBsYWNlKC8oPCEtLS4rLS0+KSovLCAnJyk7XG5cdFx0aHRtbCA9IGh0bWwucmVwbGFjZSgvXlxccyovLCAnJyk7XG5cdFx0aHRtbCA9IGh0bWwucmVwbGFjZSgvXFxzKiQvLCAnJyk7XG5cdFx0aHRtbCA9IGh0bWwucmVwbGFjZSgvKFxccnxcXG4pKi8sICcnKTtcblxuXHRcdC8vIFBhcnNlIGEgRE9NIG5vZGUgb3Igc2VyaWVzIG9mIERPTSBub2RlcyBmcm9tIHRoZSBuZXdseSB0ZW1wbGF0ZWQgSFRNTFxuXHRcdHZhciBwYXJzZWROb2RlcyA9ICQucGFyc2VIVE1MKGh0bWwpO1xuXHRcdHZhciBlbCA9IHBhcnNlZE5vZGVzWzBdO1xuXG5cdFx0Ly8gSWYgbm8gbm9kZXMgd2VyZSBwYXJzZWQsIHRocm93IGFuIGVycm9yXG5cdFx0aWYgKHBhcnNlZE5vZGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKHNlbGYuaWQgKyAnIDo6IHJlbmRlcigpIHJhbiBpbnRvIGEgcHJvYmxlbSByZW5kZXJpbmcgdGhlIHRlbXBsYXRlIHdpdGggSFRNTCA9PiBcXG4nK2h0bWwpO1xuXHRcdH1cblxuXHRcdC8vIElmIHRoZXJlIGlzIG5vdCBvbmUgc2luZ2xlIHdyYXBwZXIgZWxlbWVudCxcblx0XHQvLyBvciBpZiB0aGUgcmVuZGVyZWQgdGVtcGxhdGUgY29udGFpbnMgb25seSBhIHNpbmdsZSB0ZXh0IG5vZGUsXG5cdFx0Ly8gKG9yIGp1c3QgYSBsb25lIHJlZ2lvbilcblx0XHRlbHNlIGlmIChwYXJzZWROb2Rlcy5sZW5ndGggPiAxIHx8IHBhcnNlZE5vZGVzWzBdLm5vZGVUeXBlID09PSAzIHx8XG5cdFx0XHRcdFx0XHQgJChwYXJzZWROb2Rlc1swXSkuaXMoJ3JlZ2lvbicpIHx8XG5cdFx0XHRcdFx0XHQgJChwYXJzZWROb2Rlc1swXSkuYXR0cignZGF0YS1yZWdpb24nKSAhPT0gdW5kZWZpbmVkICkge1xuXG5cdFx0XHRGUkFNRVdPUksubG9nKHNlbGYuaWQgKyAnIDo6IFdyYXBwaW5nIHRlbXBsYXRlIGluIDxkaXYvPi4uLicsIHBhcnNlZE5vZGVzKTtcblxuXHRcdFx0Ly8gd3JhcCB0aGUgaHRtbCB1cCBpbiBhIGNvbnRhaW5lciA8ZGl2Lz5cblx0XHRcdGVsID0gJCgnPGRpdi8+JykuYXBwZW5kKGh0bWwpO1xuXHRcdFx0ZWwgPSBlbFswXTtcblx0XHR9XG5cblx0XHQvLyBTZXQgQmFja2JvbmUgZWxlbWVudCAoY2FjaGUgYW5kIHJlZGVsZWdhdGUgRE9NIGV2ZW50cylcblx0XHQvLyAoV2lsbCBhbHNvIHVwZGF0ZSBzZWxmLiRlbClcblx0XHRzZWxmLnNldEVsZW1lbnQoZWwpO1xuXHRcdC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG5cblx0XHQvLyBEZXRlY3QgYW5kIHJlbmRlciBhbGwgcmVnaW9ucyBhbmQgdGhlaXIgZGVzY2VuZGVudCBjb21wb25lbnRzIGFuZCByZWdpb25zXG5cdFx0aGVscGVycy5yZW5kZXJSZWdpb25zLmNhbGwoc2VsZik7XG5cblx0XHQvLyBJbnNlcnQgdGhlIGVsZW1lbnQgYXQgdGhlIHByb3BlciBwbGFjZSBhbW9uZ3N0IHRoZSBvdXRsZXQncyBjaGlsZHJlblxuXHRcdHZhciBuZWlnaGJvcnMgPSBzZWxmLiRvdXRsZXQuY2hpbGRyZW4oKTtcblx0XHRpZiAoXy5pc0Zpbml0ZShhdEluZGV4KSAmJiBuZWlnaGJvcnMubGVuZ3RoID4gMCAmJiBuZWlnaGJvcnMubGVuZ3RoID4gYXRJbmRleCkge1xuXHRcdFx0bmVpZ2hib3JzLmVxKGF0SW5kZXgpLmJlZm9yZShzZWxmLiRlbCk7XG5cdFx0fVxuXG5cdFx0Ly8gQnV0IGlmIHRoZSBvdXRsZXQgaXMgZW1wdHksIG9yIHRoZXJlJ3Mgbm8gYXRJbmRleCwganVzdCBzdGljayBpdCBvbiB0aGUgZW5kXG5cdFx0ZWxzZSBzZWxmLiRvdXRsZXQuYXBwZW5kKHNlbGYuJGVsKTtcblxuXG5cdFx0Ly8gRmxhZyB3aXRoIGRhdGEtdGVtcGxhdGUtaWQgYXR0cmlidXRlXG5cdFx0Ly8gKHRvIG1ha2UgdGVtcGxhdGUvY29tcG9uZW50IGJvdW5kYXJpZXMgZWFzaWVyIHRvIHBpY2sgb3V0IGluIHRoZSBpbnNwZWN0b3IpXG5cdFx0c2VsZi4kZWwuYXR0cignZGF0YS10ZW1wbGF0ZS1pZCcsIHNlbGYuaWQpO1xuXG5cblxuXG5cdFx0Ly9cblx0XHQvLyBJZiB0aGUgcGFyZW50IGNvbXBvbmVudCBoYXMgcm91dGUgbGlzdGVuZXJzIChlLmcuICNmb28pXG5cdFx0Ly8gcnVuIGFueSBvZiB0aGVtIHRoYXQgbWF0Y2ggYHdpbmRvdy5sb2NhdGlvbi5oYXNoYC5cblx0XHQvLyAoYWZ0ZXIgcmVuZGVyaW5nIHRoZSB0ZW1wbGF0ZSBhbmQgcmVnaW9ucyBidXQgQkVGT1JFIHRoZSBgYWZ0ZXJSZW5kZXJgXG5cdFx0Ly8gbGlmZWN5Y2xlIGNhbGxiYWNrIGlzIHRyaWdnZXJlZClcblx0XHQvL1xuXHRcdC8vIG5vdCBzdXJlIGlmIHRoaXMgaXMgYSBnb29kIGlkZWEgaW4gZ2VuZXJhbC0tIG1heWJlIGNvbmZpZ3VyYWJsZS4uP1xuXHRcdC8vIG9yIG9ubHkgaWYgYmFja2JvbmUuaGlzdG9yeSBpc24ndCByZWFkeSB5ZXQ/XG5cdFx0Ly9cblx0XHQvLyBkaXNhYmxpbmcgZm9yIG5vdy4uLlxuXHRcdC8vIF8uZWFjaCggT2JqZWN0LmtleXMoc2VsZiksIGZ1bmN0aW9uIChrZXkpIHtcblx0XHQvLyBcdHZhciBtYXRjaGVkUm91dGUgPSBrZXkubWF0Y2gobmV3IFJlZ0V4cCgnL14nICt3aW5kb3cubG9jYXRpb24uaGFzaCArICcvJykpO1xuXHRcdC8vIFx0aWYgKCFtYXRjaGVkUm91dGUpIHJldHVybjtcblxuXHRcdC8vIFx0dmFyIG1hdGNoZWRSb3V0ZUxpc3RlbmVyID0gc2VsZlttYXRjaGVkUm91dGVdO1xuXHRcdC8vIFx0bWF0Y2hlZFJvdXRlTGlzdGVuZXIoKTtcblx0XHQvLyB9KTtcblxuXG5cdFx0Ly8gRmluYWxseSwgdHJpZ2dlciBhZnRlclJlbmRlciBtZXRob2Rcblx0XHRzZWxmLmFmdGVyUmVuZGVyKCk7XG5cblxuXHRcdC8vIFJ1biBkYXRhIGJpbmRpbmdzXG5cdFx0Ly8gVE9ETzogZG9uJ3QgY2FsbCB0aGlzIGhlcmUtLSBqdXN0IGRvIHdoZW4gaW5pdGlhbGx5IGluc2VydGluZyB0aGUgdGVtcGxhdGUgaW50byB0aGUgRE9NXG5cdFx0Ly8gKHRoaXMgaXMgaW5lZmZpY2llbnQpXG5cdFx0aGVscGVycy5yZW5kZXJEYXRhQmluZGluZ3MuY2FsbChzZWxmKTtcblxuXG5cdFx0Ly8gQWRkIGRhdGEgYXR0cmlidXRlcyB0byB0aGlzIGNvbXBvbmVudCdzICRlbCwgcHJvdmlkaW5nIGFjY2Vzc1xuXHRcdC8vIHRvIHdoZXRoZXIgdGhlIGVsZW1lbnQgaGFzIHZhcmlvdXMgRE9NIGJpbmRpbmdzIGZyb20gc3R5bGVzaGVldHMuXG5cdFx0Ly8gKGhhbmR5IGZvciBkaXNhYmxpbmcgdGV4dCBzZWxlY3Rpb24gYWNjb3JkaW5nbHksIGV0Yy4pXG5cdFx0Ly9cblx0XHQvLyAtPiBkaXNhYmxlIGZvciB0aGlzIGNvbXBvbmVudCB3aXRoIGB0aGlzLmF0dHJGbGFncyA9IGZhbHNlYFxuXHRcdC8vIC0+IG9yIGdsb2JhbGx5IHdpdGggYEZSQU1FV09SSy5hdHRyRmxhZ3MgPSBmYWxzZWBcblx0XHQvL1xuXHRcdC8vIFRPRE86IG1ha2UgaXQgd29yayB3aXRoIGRlbGVnYXRlZCBET00gZXZlbnQgYmluZGluZ3Ncblx0XHQvL1xuXHRcdGlmIChzZWxmLmF0dHJGbGFncyAhPT0gZmFsc2UgJiYgRlJBTUVXT1JLLmF0dHJGbGFncyAhPT0gZmFsc2UpIHtcblx0XHRcdERPTS5mbGFnQm91bmRFdmVudHMoc2VsZik7XG5cdFx0fVxuXHR9KTtcbn07XG4iLCJcbi8qKlxuICogVE9ETzpcbiAqIFRyeSBvdXQgYSBkaWZmZXJlbnQgYXBwcm9hY2ggZm9yIHRoZSBsb2dpYyBpbiBgcmVuZGVyQ29sbGVjdGlvbmBcbiAqIGJlbG93IGJ5IG92ZXJsb2FkaW5nIGByZWdpb24uYXR0YWNoKClgLlxuICpcbiAqIEV4YW1wbGUgdXNhZ2U6IChpbiBwYXJlbnQgY29tcG9uZW50KVxuICogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAqIHRoaXMuc29tZVJlZ2lvbi5hdHRhY2goJ1NvbWVPdGhlckNvbXBvbmVudCcseyBjb2xsZWN0aW9uOiBTb21lQ29sbGVjdGlvbiB9KVxuICpcbiAqIC1vci1cbiAqXG4gKiB0aGlzLnNvbWVSZWdpb24ucmVwZWF0KCdTb21lT3RoZXJDb21wb25lbnQnLHsgY29sbGVjdGlvbjogU29tZUNvbGxlY3Rpb24gfSlcbiAqL1xuXG4vKipcbiAqIHJlbmRlckNvbGxlY3Rpb24oKVxuICpcbiAqIFJldXNhYmxlIGxvZ2ljIHRvIHJlbmRlciBhIGNvbGxlY3Rpb24gaW50byBhIHJlZ2lvblxuICpcbiAqIFRPRE86IG1vdmUgb250byBSZWdpb24gb2JqZWN0IGluc3RlYWQuLi4gIFNlZSBnaXN0LlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBjb2xsZWN0aW9uIC0gZGF0YSBzb3VyY2VcbiAqIEBwYXJhbSB7T3B0aW9uc30gb3B0aW9uc1xuICpcdFx0OiBvcHRpb25zLml0ZW1UZW1wbGF0ZSB7U3RyaW5nfSAtIG5hbWUgb2YgdGVtcGxhdGUvY29tcG9uZW50IHRvIHVzZSBhcyBpdGVtXG4gKlx0XHQ6IG9wdGlvbnMuaW50b1JlZ2lvbiB7T2JqZWN0fSAtIHRoZSBkZXN0aW5hdGlvbiByZWdpb25cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoY29sbGVjdGlvbiwgb3B0aW9ucykge1xuXG5cdC8vIFJlcXVpcmVkOlxuXHRpZiAodHlwZW9mIGNvbGxlY3Rpb24gIT09ICdvYmplY3QnKSB0aHJvdyBuZXcgRXJyb3IoJ3JlbmRlckNvbGxlY3Rpb24gOjogVW5rbm93bi9pbnZhbGlkIGNvbGxlY3Rpb24sIFwiJyArIChjb2xsZWN0aW9uICYmIGNvbGxlY3Rpb24udHlwZSkgKyAnXCInKTtcblx0aWYgKCFvcHRpb25zLml0ZW1UZW1wbGF0ZSkgdGhyb3cgbmV3IEVycm9yKCdyZW5kZXJDb2xsZWN0aW9uIDo6IG9wdGlvbnMuaXRlbVRlbXBsYXRlIHJlcXVpcmVkIScpO1xuXHRpZiAoIW9wdGlvbnMuaW50b1JlZ2lvbikgdGhyb3cgbmV3IEVycm9yKCdyZW5kZXJDb2xsZWN0aW9uIDo6IG9wdGlvbnMuaW50b1JlZ2lvbiByZXF1aXJlZCEnKTtcblxuXG5cdC8vIERldGVybWluZSBjb2xsZWN0aW9uTmFtZVxuXHR2YXIgY29sbGVjdGlvbk5hbWUgPSBjb2xsZWN0aW9uLnR5cGU7XG5cblx0Ly8gVGFyZ2V0IHJlZ2lvblxuXHR2YXIgb3V0bGV0ID0gb3B0aW9ucy5pbnRvUmVnaW9uO1xuXG5cdC8vIFN1Yi1jb21wb25lbnRcblx0dmFyIHN1YmNvbXBvbmVudE5hbWUgPSBvcHRpb25zLml0ZW1UZW1wbGF0ZTtcblxuXHQvLyBOYW1lIG9mIHRoZSBjb2xsZWN0aW9uIHN0YXRlIGF0dHJpYnV0ZSB0aGF0IHdpbGxlIGJlIGluamVjdGVkIGludG8gdGhlIEhUTUxcblx0Ly8gVXNlZCBmb3IgdGhlIGRlZmF1bHQgcmVuZGVyIGJlaGF2aW9yLlxuXHR2YXIgYm9keVN0YXRlQXR0cmlidXRlID0gJ2RhdGEtJyArIGNvbGxlY3Rpb25OYW1lICsgJy1zdGF0ZSc7XG5cblxuXG5cblx0LyoqXG5cdCAqIERlZmF1bHQgcmVuZGVyIG1ldGhvZHNcblx0ICpcblx0ICogT3ZlcnJpZGUgZGVmYXVsdCByZW5kZXIgbWV0aG9kcyB3aXRoIG9wdGlvbnMgaWYgc3BlY2lmaWVkXG5cdCAqL1xuXG5cdC8vIERlZmF1bHQgcmVuZGVyIGxvZ2ljIGZvciBlcnJvciBzdGF0ZSAoZS5nLiByZWQgdGV4dClcblx0dmFyIHJlbmRlckVycm9yID0gb3B0aW9ucy5yZW5kZXJFcnJvciB8fCBmdW5jdGlvbiByZW5kZXJFcnJvciAoKSB7XG5cdFx0RlJBTUVXT1JLLmVycm9yKCdBbiBlcnJvciBvY2N1cnJlZCB3aGlsZSBsb2FkaW5nICcgKyBjb2xsZWN0aW9uTmFtZSArICcgOjpcXG4nLCBjb2xsZWN0aW9uLmVycm9yKTtcblxuXHRcdC8vIFNldCBhIGRhdGEgYXR0cmlidXRlIG9uIEhUTUwgYm9keVxuXHRcdCQoJ2JvZHknKS5hdHRyKGJvZHlTdGF0ZUF0dHJpYnV0ZSwgJ2Vycm9yJyk7XG5cdH07XG5cblx0Ly8gRGVmYXVsdCByZW5kZXIgbG9naWMgZm9yIGxvYWRpbmcgc3RhdGUgKGUuZy4gc3Bpbm5lcilcblx0dmFyIHJlbmRlclN5bmNpbmcgPSBvcHRpb25zLnJlbmRlclN5bmNpbmcgfHwgZnVuY3Rpb24gcmVuZGVyU3luY2luZygpIHtcblx0XHRGUkFNRVdPUksubG9nKCdMb2FkaW5nICcgKyBjb2xsZWN0aW9uTmFtZSArICcuLi4nKTtcblxuXHRcdC8vIFNldCBzdGF0ZSBhdHRyaWJ1dGUgb24gSFRNTCBib2R5XG5cdFx0JCgnYm9keScpLmF0dHIoYm9keVN0YXRlQXR0cmlidXRlLCAnc3luY2luZycpO1xuXHR9O1xuXG5cdC8vIERlZmF1bHQgcmVuZGVyIGxvZ2ljIHRvIGNsZWFuIHVwIGFmdGVyIGEgc3VjY2Vzc2Z1bCBzeW5jL2xvYWRcblx0dmFyIHJlbmRlclN5bmNlZCA9IG9wdGlvbnMucmVuZGVyU3luY2VkIHx8IGZ1bmN0aW9uIHJlbmRlclN5bmNlZCgpIHtcblx0XHRGUkFNRVdPUksubG9nKGNvbGxlY3Rpb24ubGVuZ3RoICsgJyAnICsgY29sbGVjdGlvbk5hbWUgKyAnIGZldGNoZWQgc3VjY2Vzc2Z1bGx5LicpO1xuXG5cdFx0Ly8gU2V0IHN0YXRlIGF0dHJpYnV0ZSBvbiBIVE1MIGJvZHlcblx0XHQkKCdib2R5JykuYXR0cihib2R5U3RhdGVBdHRyaWJ1dGUsICdyZWFkeScpO1xuXHR9O1xuXG5cdC8vIERlZmF1bHQgcmVuZGVyIGxvZ2ljIGZvciBpdGVtcyBpbiBjb2xsZWN0aW9uXG5cdHZhciByZW5kZXJSZXNldCA9IG9wdGlvbnMucmVuZGVyUmVzZXQgfHwgZnVuY3Rpb24gcmVuZGVyUmVzZXQoKSB7XG5cblx0XHQvLyBDbGVhbiBvdXQgdGhlIHJlZ2lvbiwgd3JhcCBpbiBhIHRyeS9jYXRjaCB0byBzdG9wIHRoZSBleGVjdXRpb25cblx0XHR0cnkge1xuXHRcdFx0b3V0bGV0LmVtcHR5KCk7XG5cdFx0fSBjYXRjaCAoZSkge31cblxuXG5cdFx0Ly8gVE9ETzogU21hcnQgbWVyZ2UgdG8gbWluaW1pemUgRE9NIHF1ZXJpZXNcblx0XHRjb2xsZWN0aW9uLmVhY2goZnVuY3Rpb24gKG1vZGVsKSB7XG5cdFx0XHQvLyBGb3IgZWFjaCBtb2RlbCBmb3VuZCwgYXBwZW5kIGEgc3ViY29tcG9uZW50IHRvIHRoZSByZWdpb25cblx0XHRcdG91dGxldC5hcHBlbmQoc3ViY29tcG9uZW50TmFtZSwgeyBtb2RlbDogbW9kZWwgfSk7XG5cdFx0fSk7XG5cdH07XG5cblx0LyoqXG5cdCAqIHJlbmRlckFkZCAoIG1vZGVsLCBbYXRJbmRleF0gKVxuXHQgKlxuXHQgKiBAcGFyYW0ge01vZGVsfSBtb2RlbFx0XHRcdFx0XHRcdC0gdGhlIEJhY2tib25lIG1vZGVsIHRoYXQgd2FzIGFkZGVkXG5cdCAqIEBwYXJhbSB7SW50ZWdlcn0gYXRJbmRleFx0XHRcdFx0LSAob3B0aW9uYWwtIGRlZmF1bHRzIHRvIGNvbGxlY3Rpb24ubGVuZ3RoKVxuXHQgKlxuXHQgKiBEZWZhdWx0IHJlbmRlciBsb2dpYyBmb3IgdGhlIGNhc2Ugd2hlcmUgYW4gaXRlbSBpcyBhZGRlZCB0byB0aGUgY29sbGVjdGlvbi5cblx0ICovXG5cdHZhciByZW5kZXJBZGQgPSBvcHRpb25zLnJlbmRlckFkZCB8fCBmdW5jdGlvbiByZW5kZXJBZGQoIG1vZGVsLCBhdEluZGV4ICkge1xuXHRcdGlmICggdHlwZW9mIGF0SW5kZXggPT09ICdudW1iZXInKSB7XG5cdFx0XHRyZXR1cm4gb3V0bGV0Lmluc2VydChhdEluZGV4LCBzdWJjb21wb25lbnROYW1lLCB7IG1vZGVsOiBtb2RlbCB9KTtcblx0XHR9XG5cdFx0cmV0dXJuIG91dGxldC5hcHBlbmQoc3ViY29tcG9uZW50TmFtZSwgeyBtb2RlbDogbW9kZWwgfSk7XG5cdH07XG5cblx0LyoqXG5cdCAqIHJlbmRlclJlbW92ZSggYXRJbmRleCApXG5cdCAqXG5cdCAqIEBwYXJhbSB7SW50ZWdlcn0gYXRJbmRleFx0XHRcdC0gdGhlIGZvcm1lciBpbmRleCBvZiB0aGUgQmFja2JvbmUgbW9kZWwgdGhhdCB3YXMgcmVtb3ZlZFxuXHQgKlxuXHQgKiBEZWZhdWx0IHJlbmRlciBsb2dpYyBmb3IgdGhlIGNhc2Ugd2hlcmUgYW4gaXRlbSBpcyByZW1vdmVkIGZyb20gdGhlIGNvbGxlY3Rpb24uXG5cdCAqL1xuXHR2YXIgcmVuZGVyUmVtb3ZlID0gb3B0aW9ucy5yZW5kZXJSZW1vdmUgfHwgZnVuY3Rpb24gcmVuZGVyUmVtb3ZlKCBhdEluZGV4ICkge1xuXHRcdG91dGxldC5yZW1vdmUoIGF0SW5kZXggKTtcblx0fTtcblxuXG5cblxuXG5cblx0LyoqXG5cdCAqIEJvb3RzdHJhcFxuXHQgKlxuXHQgKiBSZW5kZXJzIGluaXRpYWwgc3RhdGUgb2YgY29sbGVjdGlvbiBpbnRvIG91ciByZWdpb25cblx0ICogdXNpbmcgb3VyIGNoaWxkIHRlbXBsYXRlLlxuXHQgKi9cblxuXHQvLyBJZiBvdXIgY29sbGVjdGlvbiBpcyBmZXRjaGluZywgcmVuZGVyIHRoZSBmZXRjaGluZyAobG9hZGluZykgc3RhdGUuXG5cdGlmIChjb2xsZWN0aW9uLnN5bmNpbmcpIHtcblx0XHRyZW5kZXJTeW5jaW5nKCk7XG5cdH1cblxuXG5cdC8vIElmIG91ciBjb2xsZWN0aW9uIGZhaWxlZCB0byBmZXRjaCAoaS5lLiByZWNlaXZlZCBhIDR4eCBvciA1eHggZXJyb3IgY29kZSlcblx0Ly8gcmVuZGVyIGFuIGVycm9yIHN0YXRlXG5cdC8vXG5cdC8vIEhhbmRsZSB0aGUgY2FzZSBvZiBtdWx0aXBsZSBlcnJvciBzdGF0ZXMgd2l0aCBkaWZmZXJlbnQgc3R5bGVzIGhlcmUgYXMgd2VsbC5cblx0ZWxzZSBpZiAoY29sbGVjdGlvbi5lcnJvcikge1xuXHRcdHJlbmRlckVycm9yKCk7XG5cdH1cblxuXG5cdC8vIE90aGVyd2lzZSBvdXIgY29sbGVjdGlvbiBpcyBsb2FkZWQgYW5kIHJlYWR5LFxuXHQvLyBzbyBnbyBhaGVhZCBhbmQgcmVuZGVyIGl0IGludG8gdGhlIHRhcmdldCByZWdpb24uXG5cdC8vXG5cdC8vIChhbHRlcm5hdGl2ZWx5IGF0IHRoaXMgcG9pbnQsIGEgY3VzdG9tIGBlbXB0eWAgc3RhdGUgbWF5IGJlIHJlbmRlcmVkKVxuXHQvLyBjb25zb2xlLmxvZygnVGhlIGNvbGxlY3Rpb24gJyArIHN1YmNvbXBvbmVudE5hbWUgKyAnLS0tLT4nKTtcblx0ZWxzZSByZW5kZXJSZXNldCgpO1xuXG5cblxuXG5cblxuXG5cdC8qKlxuXHQgKiBCaW5kIGV2ZW50c1xuXHQgKlxuXHQgKiBMaXN0ZW4gZm9yIHN0YXRlIGNoYW5nZXMgKHN5bmNpbmcsIHN5bmNlZCwgc2VydmVyIGVycm9yLCBhZGQsIHJlbW92ZSwgc29ydCwgZXRjLilcblx0ICogVGhlc2UgbWFudWFsIGJpbmRpbmdzIGNhbiBiZSByZW1vdmVkIHdoZW4gY29yZSBmcmFtZXdvcmsgc3VwcG9ydHMgcmVuZGVyLXRpbWUgY29sbGVjdGlvblxuXHQgKiBiaW5kaW5ncy4gIEZvciBub3csIGRvaW5nIGl0IHRoaXMgd2F5IHJhdGhlciB0aGFuIHBhdGNoaW5nIHRoZSBjb3JlIHRvIHRlc3Qgb3VyIHN0cnVjdHVyYWxcblx0ICogYXNzdW1wdGlvbnMuXG5cdCAqL1xuXG5cdC8vIFdoZW4gYSBmZXRjaCBpcyBpbml0aWF0ZWQgZnJvbSB0aGUgc2VydmVyLi4uXG5cdC8vXG5cdC8vIChhZnRlciBgQmFja2JvbmUuc3luY2AgYmVnaW5zIGEgcmVtb3RlIHJlcXVlc3QpXG5cdHRoaXMubGlzdGVuVG8oY29sbGVjdGlvbiwgJ3JlcXVlc3QnLCBmdW5jdGlvbiBhZnRlclJlcXVlc3QgKCkge1xuXHRcdHJlbmRlclN5bmNpbmcoKTtcblx0fSk7XG5cblx0Ly8gV2hlbiBhIGZldGNoIGNvbXBsZXRlcyBzdWNjZXNzZnVsbHkgYW5kIG5ldyBkYXRhIGlzIGxvYWRlZC4uLlxuXHQvL1xuXHQvLyAoYWZ0ZXIgdGhpcyBjb21wb25lbnQgaXMgYWxyZWFkeSBpbnN0YW50aWF0ZWQpXG5cdHRoaXMubGlzdGVuVG8oY29sbGVjdGlvbiwgJ3N5bmMnLCBmdW5jdGlvbiBhZnRlclN5bmMgKCkge1xuXHRcdHJlbmRlclN5bmNlZCgpO1xuXHRcdHJlbmRlclJlc2V0KCk7XG5cdH0pO1xuXG5cdC8vIFdoZW4gc2VydmVyIHNlbmRzIGEgcmVzcG9uc2Ugdy8gYW4gZXJyb3IgY29kZVxuXHQvL1xuXHQvLyAoYWZ0ZXIgdGhpcyBjb21wb25lbnQgaXMgYWxyZWFkeSBpbnN0YW50aWF0ZWQpXG5cdHRoaXMubGlzdGVuVG8oY29sbGVjdGlvbiwgJ2Vycm9yJywgZnVuY3Rpb24gYWZ0ZXJTeW5jRXJyb3IgKGNvbGxlY3Rpb24sIHhocikge1xuXG5cdFx0Ly8gSWdub3JlIGFib3J0IFwiZXJyb3JcIlxuXHRcdC8vXG5cdFx0Ly8gV2h5PyBiZWNhdXNlIGl0J3Mgbm90IGFjdHVhbGx5IGFuIGVycm9yLlxuXHRcdC8vIE5vdCBzdXJlIHdoeSB0aGlzIHRyaWdnZXJzIEJhY2tib25lLkNvbGxlY3Rpb24ncyBgZXJyb3JgIGV2ZW50Li4uXG5cdFx0Ly9cblx0XHQvLyBJZiB0d28gZmV0Y2hlcyBvY2N1ciBvbiB0aGUgc2FtZSBjb2xsZWN0aW9uIGF0IHRoZSBzYW1lIHRpbWUsXG5cdFx0Ly8gd2UgYWJvcnQgdGhlIG9sZCBYSFIgcmVxdWVzdCBvdXJzZWx2ZXMgaWYgaXQncyBzdGlsbCBydW5uaW5nKVxuXHRcdGlmICh4aHIgJiYgeGhyLnN0YXR1c1RleHQgPT09ICdhYm9ydCcpIHJldHVybjtcblxuXHRcdHJlbmRlckVycm9yKCk7XG5cdH0pO1xuXG5cdC8vIFdoZW4gYSBtb2RlbCBpcyBhZGRlZC4uLlxuXHQvL1xuXHQvLyBMaXN0ZW4gZm9yIG5ldyBtb2RlbHMsIGFuZCBpbnNlcnQgYSBjaGlsZCB0ZW1wbGF0ZVxuXHQvLyBhdCB0aGUgYXBwcm9wcmlhdGUgaW5kZXggd2l0aGluIHRoZSByZWdpb24uXG5cdHRoaXMubGlzdGVuVG8oY29sbGVjdGlvbiwgJ2FkZCcsIGZ1bmN0aW9uIGFmdGVyQWRkICggbW9kZWwsIGNvbGxlY3Rpb24sIG9wdGlvbnMgKSB7XG5cdFx0cmVuZGVyQWRkKCBtb2RlbCwgb3B0aW9ucy5hdCApO1xuXHR9KTtcblxuXHQvLyBXaGVuIGEgbW9kZWwgaXMgcmVtb3ZlZC4uLlxuXHQvL1xuXHQvLyBHcmFiIG1vZGVsJ3MgcmVsYXRpdmUgaW5kZXggd2l0aGluIGNvbGxlY3Rpb24gYW5kIHJlbW92ZVxuXHQvLyB0aGUgY2hpbGQgdGVtcGxhdGUgYXQgdGhlIHNhbWUgaW5kZXggd2l0aGluIHRoZSByZWdpb24uXG5cdHRoaXMubGlzdGVuVG8oY29sbGVjdGlvbiwgJ3JlbW92ZScsIGZ1bmN0aW9uIGFmdGVyUmVtb3ZlICggbW9kZWwsIGNvbGxlY3Rpb24sIG9wdGlvbnMgKSB7XG5cdFx0cmVuZGVyUmVtb3ZlKCBvcHRpb25zLmluZGV4ICk7XG5cdH0pO1xuXG5cblxufTtcbiIsIi8qKlxuICogQ2hlY2sgdGhlIHNwZWNpZmllZCBkZWZpbml0aW9uIGZvciBvYnZpb3VzIG1pc3Rha2VzLCBlc3BlY2lhbGx5IGxpa2VseSBkZXByZWNhdGlvbnMgYW5kXG4gKiB2YWxpZGF0ZSB0aGF0IHRoZSBtb2RlbCBhbmQgY29sbGVjdGlvbnMgYXJlIGluc3RhbmNlcyBvZiBCYWNrYm9uZSdzIERhdGEgc3RydWN0dXJlcy5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gcHJvcGVydGllcyBbT2JqZWN0IGNvbnRhaW5pbmcgdGhlIHByb3BlcnRpZXMgb2YgdGhlIGNvbXBvbmVudF1cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHZhbGlkYXRlRGVmaW5pdGlvbihwcm9wZXJ0aWVzKSB7XG5cblx0aWYgKF8uaXNPYmplY3QocHJvcGVydGllcykpIHtcblxuXHRcdC8vIERldGVybWluZSBjb21wb25lbnQgaWRcblx0XHR2YXIgaWQgPSB0aGlzLmlkIHx8IHByb3BlcnRpZXMuaWQ7XG5cblx0XHRmdW5jdGlvbiBfdmFsaWRhdGVCYWNrYm9uZUluc3RhbmNlICh0eXBlKSB7XG5cdFx0XHR2YXIgVHlwZSA9IHR5cGVbMF0udG9VcHBlckNhc2UoKSArIHR5cGUuc2xpY2UoMSk7XG5cblx0XHRcdGlmICggIXByb3BlcnRpZXNbdHlwZV0gaW5zdGFuY2VvZiBCYWNrYm9uZVtUeXBlXSApIHtcblxuXHRcdFx0XHRGcmFtZXdvcmsuZXJyb3IoXG5cdFx0XHRcdFx0J0NvbXBvbmVudCAoJyArIGlkICsgJykgaGFzIGFuIGludmFsaWQgJyArIHR5cGUgKyAnLS0gXFxuJyArXG5cdFx0XHRcdFx0J0lmIGAnICsgdHlwZSArICdgIGlzIHNwZWNpZmllZCBmb3IgYSBjb21wb25lbnQsICcgK1xuXHRcdFx0XHRcdCdpdCBtdXN0IGJlIGFuICppbnN0YW5jZSogb2YgYSBCYWNrYm9uZS4nICsgVHlwZSArICcuXFxuJyk7XG5cblx0XHRcdFx0aWYgKHByb3BlcnRpZXNbdHlwZV0gaW5zdGFuY2VvZiBCYWNrYm9uZVtUeXBlXS5jb25zdHJ1Y3Rvcikge1xuXHRcdFx0XHRcdEZyYW1ld29yay5lcnJvcihcblx0XHRcdFx0XHRcdCdJdCBsb29rcyBsaWtlIGEgQmFja2JvbmUuJyArIFR5cGUgKyAnICpwcm90b3R5cGUqIHdhcyBzcGVjaWZpZWQgaW5zdGVhZCBvZiBhICcgK1xuXHRcdFx0XHRcdFx0J0JhY2tib25lLicgKyBUeXBlICsgJyAqaW5zdGFuY2UqLlxcbicgK1xuXHRcdFx0XHRcdFx0J1BsZWFzZSBgbmV3YCB1cCB0aGUgJyArIHR5cGUgKyAnIC1iZWZvcmUtICcgKyBGcmFtZXdvcmsuaWQgKyAnLnJhaXNlKCksJyArXG5cdFx0XHRcdFx0XHQnb3IgdXNlIGEgd3JhcHBlciBmdW5jdGlvbiB0byBhY2hpZXZlIHRoZSBzYW1lIGVmZmVjdCwgZS5nLjpcXG4nICtcblx0XHRcdFx0XHRcdCdgJyArIHR5cGUgKyAnOiBmdW5jdGlvbiAoKSB7XFxucmV0dXJuIG5ldyBTb21lJyArIFR5cGUgKyAnKCk7XFxufWAnXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdEZyYW1ld29yay53YXJuKCdJZ25vcmluZyBpbnZhbGlkICcgKyB0eXBlICsgJyA6OiAnICsgcHJvcGVydGllc1t0eXBlXSk7XG5cdFx0XHRcdGRlbGV0ZSBwcm9wZXJ0aWVzW3R5cGVdO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENoZWNrIHRoYXQgdGhpcy5jb2xsZWN0aW9uIGlzIGFjdHVhbGx5IGFuIGluc3RhbmNlIG9mIEJhY2tib25lLkNvbGxlY3Rpb25cblx0XHQvLyBhbmQgdGhhdCB0aGlzLm1vZGVsIGlzIGFjdHVhbGx5IGFuIGluc3RhbmNlIG9mIEJhY2tib25lLk1vZGVsXG5cdFx0X3ZhbGlkYXRlQmFja2JvbmVJbnN0YW5jZSgnbW9kZWwnKTtcblx0XHRfdmFsaWRhdGVCYWNrYm9uZUluc3RhbmNlKCdjb2xsZWN0aW9uJyk7XG5cblx0XHQvLyBDbG9uZSBwcm9wZXJ0aWVzIHRvIGF2b2lkIGluYWR2ZXJ0ZW50IG1vZGlmaWNhdGlvbnNcblx0XHRyZXR1cm4gXy5jbG9uZShwcm9wZXJ0aWVzKTtcblx0fVxuXG5cdGVsc2UgcmV0dXJuIHt9O1xuXG59XG4iLCIvKipcbiAqIFJ1biBkZWZpbml0aW9uIG1ldGhvZHMgdG8gZ2V0IGFjdHVhbCBjb21wb25lbnQgZGVmaW5pdGlvbnMuXG4gKiBUaGlzIGlzIGRlZmVycmVkIHRvIGF2b2lkIGhhdmluZyB0byB1c2UgQmFja2JvbmUncyBmdW5jdGlvbiAoKSB7fSBhcHByb2FjaCBmb3IgdGhpbmdzXG4gKiBsaWtlIGNvbGxlY3Rpb25zLlxuICovXG5cbi8qKlxuICogQnVpbGQgdXBzIGEgY29tcG9uZW50IGRlZmluaXRpb24gYnkgcnVubmluZyB0aGUgZGVmaW5pdGlvbi4gV2UgdGhlbiBsaW5rIHRoZVxuICogY29tcG9uZW50IGRlZmluaXRpb24gdG8gYW4gaWRlbnRpZmllciBpbiBgRlJBTUVXT1JLLmNvbXBvbmVudHNgLlxuICpcbiAqIEBwYXJhbSAge09iamVjdH0gY29tcG9uZW50IFtPYmplY3QgY29udGFpbmluZyB0aGUgZGVmaW5pdGlvbiBmdW5jdGlvbiBvZiB0aGUgY29tcG9uZW50XVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGJ1aWxkQ29tcG9uZW50RGVmaW5pdGlvbihjb21wb25lbnQpIHtcblx0dmFyIGNvbXBvbmVudERlZiA9IGNvbXBvbmVudC5kZWZpbml0aW9uKCk7XG5cblx0aWYgKGNvbXBvbmVudC5pZE92ZXJyaWRlKSB7XG5cdFx0aWYgKGNvbXBvbmVudERlZi5pZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGNvbXBvbmVudC5pZE92ZXJyaWRlICsgJzo6IENhbm5vdCBzcGVjaWZ5IGFuIGlkT3ZlcnJpZGUgaW4gLmRlZmluZSgpIGlmIGFuIGlkIHByb3BlcnR5ICgnK2NvbXBvbmVudERlZi5pZCsnKSBpcyBhbHJlYWR5IHNldCBpbiB5b3VyIGNvbXBvbmVudCBkZWZpbml0aW9uIVxcblVzYWdlOiAuZGVmaW5lKFtpZE92ZXJyaWRlXSwgZGVmaW5pdGlvbiknKTtcblx0XHR9XG5cdFx0Y29tcG9uZW50RGVmLmlkID0gY29tcG9uZW50LmlkT3ZlcnJpZGU7XG5cdH1cblx0aWYgKCFjb21wb25lbnREZWYuaWQpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCB1c2UgLmRlZmluZSgpIHdpdGhvdXQgZGVmaW5pbmcgYW4gaWQgcHJvcGVydHkgb3Igb3ZlcnJpZGUgaW4geW91ciBjb21wb25lbnQhXFxuVXNhZ2U6IC5kZWZpbmUoW2lkT3ZlcnJpZGVdLCBkZWZpbml0aW9uKScpO1xuXHR9XG5cdEZSQU1FV09SSy5jb21wb25lbnRzW2NvbXBvbmVudERlZi5pZF0gPSBjb21wb25lbnREZWY7XG59O1xuIiwiLyoqXG4gKiBPcHRpb25hbCBtZXRob2QgdG8gcmVxdWlyZSBhcHAgY29tcG9uZW50cy4gUmVxdWlyZS5qcyBjYW4gYmUgdXNlZCBpbnN0ZWFkXG4gKiBhcyBuZWVkZWQuXG4gKlxuICogQHBhcmFtICB7U3RyaW5nfSBcdFsob3B0aW9uYWwpIENvbXBvbmVudCBpZCBvdmVycmlkZV1cbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSBbRnVuY3Rpb24gRGVmaW5pdGlvbiBvZiBjb21wb25lbnRdXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZGVmaW5lKGlkLCBkZWZpbml0aW9uRm4pIHtcblx0Ly8gSWQgcGFyYW0gaXMgb3B0aW9uYWxcblx0aWYgKCFkZWZpbml0aW9uRm4pIHtcblx0XHRkZWZpbml0aW9uRm4gPSBpZDtcblx0XHRpZCA9IG51bGw7XG5cdH1cblxuXHRGUkFNRVdPUksuX2RlZmluZVF1ZXVlLnB1c2goe1xuXHRcdGRlZmluaXRpb246IGRlZmluaXRpb25Gbixcblx0XHRpZE92ZXJyaWRlOiBpZFxuXHR9KTtcbn07XG4iLCIvKipcbiAqIE1hc3QgYnVpbGQgZmlsZS4gVGhlIG1haW4gZmlsZVxuICovXG5cbnZhciBkZWZpbmUgPSByZXF1aXJlKCcuL2RlZmluZS9pbmRleCcpO1xudmFyIFJlZ2lvbiA9IHJlcXVpcmUoJy4vcmVnaW9uL2luZGV4Jyk7XG52YXIgQ29tcG9uZW50ID0gcmVxdWlyZSgnLi9jb21wb25lbnQvaW5kZXgnKTtcbnZhciByYWlzZSA9IHJlcXVpcmUoJy4vcmFpc2UvaW5kZXgnKTtcblxuLyoqXG4gKiBGcmFtZXdvcmsgY2xhc3MgZGVmaW5pdGlvbiB0aGF0IHdpbGwgY3JlYXRlIGEgbmV3IGdsb2JhbCBpbnN0YW5jZSBvZiBhIGN1c3RvbSBGcmFtZXdvcmsuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgW29wdGlvbnMgaGFzaCB0byBpbml0aWFsaXplIHRoZSBjdXN0b20gZnJhbWV3b3JrIHdpdGhdXG4gKi9cbnZhciBGcmFtZXdvcmsgPSBmdW5jdGlvbihvcHRpb25zKSB7XG5cblx0Ly8gU2V0IHRoZSBkZWZhdWx0IG9wdGlvbnMgZm9yIHRob3NlIG5vdCBwYXNzZWQgaW4uXG5cdG9wdGlvbnMgPSBfLmRlZmF1bHRzKG9wdGlvbnMgfHwge30sIHtcblx0XHR0aHJvdHRsZVdpbmRvd1Jlc2l6ZTogMjAwLFxuXHRcdGxvZ0xldmVsOiAnd2FybicsXG5cdFx0ZnJhbWV3b3JrSWQ6ICdtYXN0Jyxcblx0XHRwcm9kdWN0aW9uOiBmYWxzZSxcblx0XHRsb2dnZXI6IHVuZGVmaW5lZCxcblx0XHRzaG9ydGN1dDoge1xuXHRcdFx0dGVtcGxhdGU6IHRydWUsXG5cdFx0XHRjb3VudDogdHJ1ZVxuXHRcdH1cblx0fSk7XG5cblx0Ly8gU2V0IGEgc3RhcnRpbmcgcG9pbnQgdG8gQmFja2JvbmUgYW5kIGFkZCBhZGRpdGlvbmFsIGF0dHJpYnV0ZS5cblx0Xy5leHRlbmQodGhpcywgQmFja2JvbmUsIHtcblx0XHRvcHRpb25zOiBvcHRpb25zLFxuXHRcdHRlbXBsYXRlczoge30sXG5cdFx0Y29tcG9uZW50czoge30sXG5cdFx0ZGF0YToge30sXG5cdFx0X2RlZmluZVF1ZXVlOiBbXSxcblx0XHRyZWdpb25zOiB7fVxuXHR9KTtcblxuXHQvKipcblx0ICogRXh0ZW5kIEZSQU1FV09SSy5Db2xsZWN0aW9uIHRvIG1ha2UgaXQgYmV0dGVyXG5cdCAqIChzcGVjaWZpY2FsbHksIHRvIGFkZCBlcnJvciBoYW5kbGluZylcblx0ICovXG5cdHZhciBzZWxmID0gdGhpcztcblx0dmFyIG9yaWdpbmFsQ29sbGVjdGlvbiA9IHRoaXMuQ29sbGVjdGlvbjtcblx0dGhpcy5Db2xsZWN0aW9uID0gb3JpZ2luYWxDb2xsZWN0aW9uLmV4dGVuZCh7XG5cblx0XHRpbml0aWFsaXplOiBmdW5jdGlvbiAob3B0aW9ucykge1xuXG5cdFx0XHQvLyBPdmVycmlkZSBgY29sbGVjdGlvbi5mZXRjaCgpYFxuXHRcdFx0dGhpcy5fZmV0Y2ggPSB0aGlzLmZldGNoO1xuXHRcdFx0dGhpcy5mZXRjaCA9IHRoaXNbJ19mZXRjaCsrJ107XG5cdFx0fSxcblxuXG5cdFx0LyoqXG5cdFx0ICogYWZ0ZXJFcnJvclxuXHRcdCAqXG5cdFx0ICogTGlmZWN5Y2xlIGNhbGxiYWNrIHRvIGNhdGNoIHdoZW4gYSBmZXRjaCBlcnJvciBvY2N1cnNcblx0XHQgKlxuXHRcdCAqIFRPRE86XG5cdFx0ICogUHJvYmFibHkgcmVtb3ZlIHRoaXMtLSByZWFzb25pbmcgOjpcblx0XHQgKiBJbiBtb3N0IGNhc2VzLCB5b3UgYWN0dWFsbHkgY2FyZSBhYm91dCB0aGUgZXJyb3IgaW5cblx0XHQgKiB0aGUgcmVsZXZhbnQgY29tcG9uZW50cyB3aG8gYXJlIHVzaW5nIHRoaXMgY29sbGVjdGlvbixcblx0XHQgKiBpbiB3aGljaCBjYXNlIHlvdSdkIGp1c3QgYmluZCBhbiBlcnJvciBldmVudCBoYW5kbGVyLlxuXHRcdCAqL1xuXHRcdGFmdGVyRXJyb3I6IGZ1bmN0aW9uIChjb2xsZWN0aW9uLCB4aHIsIG9wdGlvbnMpIHtcblx0XHRcdC8vIHRoaXMgZXhpc3RzIGZvciB5b3UgdG8gb3ZlcnJpZGUgaXQhXG5cdFx0fSxcblxuXG5cblxuXHRcdC8qKlxuXHRcdCAqIE92ZXJyaWRlIEJhY2tib25lLkNvbGxlY3Rpb24ncyBgZmV0Y2goKWBcblx0XHQgKiB0byBhbGxvdyBmb3IgYmV0dGVyIGVycm9yIGhhbmRsaW5nLlxuXHRcdCAqXG5cdFx0ICogVE9ETzogcHVsbCB0aGlzIGludG8gQmFja2JvbmUuc3luYyBpbnN0ZWFkLi5cblx0XHQgKiBvbmx5IHByb2JsZW0gaXMgY2xhc2hpbmcgd2l0aCBvdGhlciBzeW5jIG92ZXJyaWRlc1xuXHRcdCAqL1xuXHRcdCdfZmV0Y2grKyc6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG5cdFx0XHR2YXIgY29sbGVjdGlvbiA9IHRoaXM7XG5cblx0XHRcdG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG5cdFx0XHQvLyBMb2cgYSBmcmllbmRsaWVyIFwiTm8gVVJMXCIgbWVzc2FnZTpcblx0XHRcdGlmICggIWNvbGxlY3Rpb24udXJsICkge1xuXHRcdFx0XHRzZWxmLmVycm9yKCdDYW5ub3QgZmV0Y2goKSAnICsgY29sbGVjdGlvbi50eXBlICsgJyA6OiBDb2xsZWN0aW9uIGhhcyBubyBVUkwgZnVuY3Rpb24vcHJvcGVydHkuLi4nKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBPdmVycmlkZSBlcnJvciBoYW5kbGVyIHRvIG1peGluIGFuICdlcnJvcicgZXZlbnRcblx0XHRcdHZhciBvcmlnaW5hbEVycm9ySGFuZGxlciA9IG9wdGlvbnMuZXJyb3I7XG5cdFx0XHR2YXIgb3JpZ2luYWxTdWNjZXNzSGFuZGxlciA9IG9wdGlvbnMuc3VjY2Vzcztcblx0XHRcdF8uZXh0ZW5kKG9wdGlvbnMsIHtcblx0XHRcdFx0c3VjY2VzczogZnVuY3Rpb24gKGNvbGxlY3Rpb24sIHhociwgb3B0aW9ucykge1xuXHRcdFx0XHRcdHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcblxuXHRcdFx0XHRcdC8vIE51bGwgb3V0IGBjb2xsZWN0aW9uLnN5bmNpbmdgXG5cdFx0XHRcdFx0Y29sbGVjdGlvbi5zeW5jaW5nID0gbnVsbDtcblxuXHRcdFx0XHRcdC8vIFRyaWdnZXIgb3JpZ2luYWwgc3VjY2VzcyBoYW5kbGVyIGlmIHNwZWNpZmllZFxuXHRcdFx0XHRcdC8vIG9uIGBmZXRjaCh7c3VjY2VzczogZnVuY3Rpb24oKXsvKi4uLiovfX0pYFxuXHRcdFx0XHRcdGlmIChvcmlnaW5hbFN1Y2Nlc3NIYW5kbGVyKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gb3JpZ2luYWxTdWNjZXNzSGFuZGxlci5hcHBseShjb2xsZWN0aW9uLCBhcmdzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGVycm9yOiBmdW5jdGlvbiAoY29sbGVjdGlvbiwgeGhyLCBvcHRpb25zKSB7XG5cdFx0XHRcdFx0dmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuXG5cdFx0XHRcdFx0Ly8gTnVsbCBvdXQgYGNvbGxlY3Rpb24uc3luY2luZ2Bcblx0XHRcdFx0XHRjb2xsZWN0aW9uLnN5bmNpbmcgPSBudWxsO1xuXG5cdFx0XHRcdFx0Ly8gSWYgdGhpcyBpcyBhbiBcImFib3J0XCIsIGlnbm9yZSBpdC0gKHN0YXRlIGhhcyBhbHJlYWR5IGJlZW4gdGFrZW4gY2FyZSBvZilcblx0XHRcdFx0XHRpZiAoIHhociAmJiB4aHIuc3RhdHVzVGV4dD09PSdhYm9ydCcgKSByZXR1cm47XG5cblx0XHRcdFx0XHQvLyBTZXQgYGNvbGxlY3Rpb24uZXJyb3JgIHVzaW5nIHRoZSByZXNwb25zZSBmcm9tIHRoZSBmZXRjaFxuXHRcdFx0XHRcdC8vICh0cnkganNvbiwgdGhlbiByZXNwb25zZSB0ZXh0LCB0aGVuIHN0YXR1cyBjb2RlLCB0aGVuIGp1c3QgZGVmYXVsdCB0byBgdHJ1ZWApXG5cdFx0XHRcdFx0Y29sbGVjdGlvbi5lcnJvciA9XG5cdFx0XHRcdFx0XHQoIHhociAmJiB4aHIucmVzcG9uc2VKU09OICkgPyB4aHIucmVzcG9uc2VKU09OIDpcblx0XHRcdFx0XHRcdCggeGhyICYmIHhoci5yZXNwb25zZVRleHQgKSA/IHhoci5yZXNwb25zZVRleHQgOlxuXHRcdFx0XHRcdFx0dHJ1ZTtcblxuXG5cdFx0XHRcdFx0Ly8gQ2FsbCBgYWZ0ZXJFcnJvcigpYFxuXHRcdFx0XHRcdGNvbGxlY3Rpb24uYWZ0ZXJFcnJvci5hcHBseShjb2xsZWN0aW9uLGFyZ3MpO1xuXG5cdFx0XHRcdFx0Ly8gVHJpZ2dlciBvcmlnaW5hbCBlcnJvciBoYW5kbGVyIGlmIHNwZWNpZmllZFxuXHRcdFx0XHRcdC8vIG9uIGBmZXRjaCh7ZXJyb3I6IGZ1bmN0aW9uKCl7LyouLi4qL319KWBcblx0XHRcdFx0XHRpZiAob3JpZ2luYWxFcnJvckhhbmRsZXIpIHtcblx0XHRcdFx0XHRcdHJldHVybiBvcmlnaW5hbEVycm9ySGFuZGxlci5hcHBseShjb2xsZWN0aW9uLCBhcmdzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBOdWxsIG91dCBgY29sbGVjdGlvbi5lcnJvcmBcblx0XHRcdGNvbGxlY3Rpb24uZXJyb3IgPSBudWxsO1xuXG5cdFx0XHQvLyBJZiBgZmV0Y2hgIGlzIGFscmVhZHkgaW4gcHJvZ3Jlc3MsIGNhbmNlbCBpdFxuXHRcdFx0Ly8gYW5kIGZpcmUgb2ZmIGEgbmV3IG9uZS5cblx0XHRcdGlmIChjb2xsZWN0aW9uLnN5bmNpbmcpIHtcblx0XHRcdFx0c2VsZi5sb2coJ0Fib3J0aW5nIHJ1bm5pbmcgYGZldGNoKClgIGluIG9yZGVyIHRvIHN0YXJ0IGEgbmV3IGBmZXRjaCgpYC4uLicpO1xuXHRcdFx0XHRjb2xsZWN0aW9uLnN5bmNpbmcuYWJvcnQoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ2FsbCBvcmlnaW5hbCBgZmV0Y2goKWAgdXNpbmcgb3VyIG1vbmtleS1wYXRjaGVkIG9wdGlvbnNcblx0XHRcdHZhciB4aHIgPSBjb2xsZWN0aW9uLl9mZXRjaChvcHRpb25zKTtcblxuXHRcdFx0Ly8gU2V0IGBjb2xsZWN0aW9uLnN5bmNpbmdgIHRvIHRoZSBYSFIgb2JqZWN0IGluIHVzZVxuXHRcdFx0Y29sbGVjdGlvbi5zeW5jaW5nID0geGhyO1xuXG5cdFx0XHQvLyBSZXR1cm4gdGhlIFhIUiBvYmplY3QgdG8gbWFpbnRhaW4gb3JpZ2luYWwgYEJhY2tib25lLkNvbGxlY3Rpb24uZmV0Y2goKWAgQVBJXG5cdFx0XHRyZXR1cm4geGhyO1xuXHRcdH1cblxuXHR9KTtcblxuXG5cdC8vIFRocm91Z2hvdXQgdGhlIHNvdXJjZSBjb2RlLCB0aGVyZSBhcmUgb3BlcmF0aW9ucyBvbiBgRlJBTUVXT1JLYCBvciBjb2RlIHRoYXQgYWNjZXNzZXNcblx0Ly8gaXRzIGF0dHJpYnV0ZXMuIFNvIHdlIG1ha2UgYEZSQU1FV09SS2AgYWNjZXNzaWJsZS5cblx0Ly9cblx0Ly8gTm90ZTpcblx0Ly8gYEZSQU1FV09SS2Agd2lsbCBvbmx5IGJlIGEgZ2xvYmFsIHZhcmlhYmxlICoqIGR1cmluZyB0aGUgYnVpbGQgKipcblx0RlJBTUVXT1JLID0gdGhpcztcblxuXG59O1xuXG4vLyBGcmFtZXdvcmsgcHJvdG90eXBlIG1ldGhvZHMuXG5GcmFtZXdvcmsucHJvdG90eXBlLlJlZ2lvbiA9IFJlZ2lvbjtcbkZyYW1ld29yay5wcm90b3R5cGUuQ29tcG9uZW50ID0gQ29tcG9uZW50O1xuRnJhbWV3b3JrLnByb3RvdHlwZS5kZWZpbmUgPSBkZWZpbmU7XG5GcmFtZXdvcmsucHJvdG90eXBlLnJhaXNlID0gcmFpc2U7XG5cblxuXG4vLyBFeHBvc2UgaW5zdGFudGlhdGVkIGZyYW1ld29yayB2aWEgVU1EOlxudmFyIGZyYW1ld29yayA9IG5ldyBGcmFtZXdvcmsoKTtcbm1vZHVsZS5leHBvcnRzID0gZnJhbWV3b3JrO1xuXG4iLCIvKipcbiAqXHRMb2dnZXQgY29uc3RydWN0b3IgbWV0aG9kIHRoYXQgd2lsbCBzZXR1cCBGUkFNRVdPUksgdG8gbG9nIG1lc3NhZ2VzLlxuICovXG5cbnZhciBzZXR1cExvZ2dlciA9IHJlcXVpcmUoJy4vc2V0dXAnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBMb2dnZXIoKSB7XG5cblx0Ly8gVXBvbiBpbml0aWFsaXphdGlvbiwgc2V0dXAgbG9nZ2VyXG5cdHNldHVwTG9nZ2VyKEZSQU1FV09SSy5vcHRpb25zLmxvZ0xldmVsKTtcblxuXHQvLyBJbiBzdXBwb3J0ZWQgYnJvd3NlcnMsIGFsc28gcnVuIHNldHVwTG9nZ2VyIGFnYWluXG5cdC8vIHdoZW4gRlJBTUVXT1JLLmxvZ0xldmVsIGlzIHNldCBieSB0aGUgdXNlclxuXHQvLyBUT0RPOiBmaW5kIGEgd2F5IHRvIGRvIHRoaXMgd2l0aG91dCBkZXBlbmRpbmcgb24gX19kZWZpbmVTZXR0ZXJfXy5cblx0aWYgKF8uaXNGdW5jdGlvbihGUkFNRVdPUksuX19kZWZpbmVTZXR0ZXJfXykpIHtcblx0XHRGUkFNRVdPUksuX19kZWZpbmVTZXR0ZXJfXygnbG9nTGV2ZWwnLCBmdW5jdGlvbiBvbkNoYW5nZSAobmV3TG9nTGV2ZWwpIHtcblx0XHRcdHNldHVwTG9nZ2VyKG5ld0xvZ0xldmVsKTtcblx0XHR9KTtcblx0fVxufTtcbiIsIi8qKlxuICogU2V0IHVwIHRoZSBsb2cgZnVuY3Rpb25zOlxuICpcbiAqIEZSQU1FV09SSy5lcnJvclxuICogRlJBTUVXT1JLLndhcm5cbiAqIEZSQU1FV09SSy5sb2dcbiAqIEZSQU1FV09SSy5kZWJ1ZyAoKmxlZ2FjeSlcbiAqIEZSQU1FV09SSy52ZXJib3NlXG4gKlxuICogQHBhcmFtICB7U3RyaW5nfSBsb2dMZXZlbCBbVGhlIGRlc2lyZWQgbG9nIGxldmVsIG9mIHRoZSBMb2dnZXJdXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gc2V0dXBMb2dnZXIgKGxvZ0xldmVsKSB7XG5cblx0dmFyIG5vb3AgPSBmdW5jdGlvbiAoKSB7fTtcblxuXHQvLyBJZiBsb2cgaXMgc3BlY2lmaWVkLCB1c2UgaXQsIG90aGVyd2lzZSB1c2UgdGhlIGNvbnNvbGVcblx0aWYgKEZSQU1FV09SSy5sb2dnZXIpIHtcblx0XHRGUkFNRVdPUksuZXJyb3IgICAgID0gRlJBTUVXT1JLLmxvZ2dlci5lcnJvcjtcblx0XHRGUkFNRVdPUksud2FybiAgICAgID0gRlJBTUVXT1JLLmxvZ2dlci53YXJuO1xuXHRcdEZSQU1FV09SSy5sb2cgICAgICAgPSBGUkFNRVdPUksubG9nZ2VyLmRlYnVnIHx8IEZSQU1FV09SSy5sb2dnZXI7XG5cdFx0RlJBTUVXT1JLLnZlcmJvc2UgICA9IEZSQU1FV09SSy5sb2dnZXIudmVyYm9zZTtcblx0fVxuXG5cdC8vIEluIElFLCB3ZSBjYW4ndCBkZWZhdWx0IHRvIHRoZSBicm93c2VyIGNvbnNvbGUgYmVjYXVzZSB0aGVyZSBJUyBOTyBCUk9XU0VSIENPTlNPTEVcblx0ZWxzZSBpZiAodHlwZW9mIGNvbnNvbGUgIT09ICd1bmRlZmluZWQnKSB7XG5cblx0XHQvLyBXZSBjYW5ub3QgY2FsbGVkIHRoZSAuYmluZCBtZXRob2Qgb24gdGhlIGNvbnNvbGUgbWV0aG9kcy4gV2UgYXJlIGluIGllIDkgb3IgOCwganVzdCBtYWtlXG5cdFx0Ly8gZXZlcnlodGluZyBhIG5vb3AuXG5cdFx0aWYgKF8uaXNVbmRlZmluZWQoY29uc29sZS5sb2cuYmluZCkpICB7XG5cdFx0XHRGUkFNRVdPUksuZXJyb3IgICAgID0gbm9vcDtcblx0XHRcdEZSQU1FV09SSy53YXJuICAgICAgPSBub29wO1xuXHRcdFx0RlJBTUVXT1JLLmxvZyAgICAgICA9IG5vb3A7XG5cdFx0XHRGUkFNRVdPUksuZGVidWcgICAgID0gbm9vcDtcblx0XHRcdEZSQU1FV09SSy52ZXJib3NlICAgPSBub29wO1xuXHRcdH1cblxuXHRcdC8vIFdlIGFyZSBpbiBhIGZyaWVuZGx5IGJyb3dzZXIgbGlrZSBDaHJvbWUsIEZpcmVmb3gsIG9yIElFMTBcblx0XHRlbHNlIHtcblx0XHRcdEZSQU1FV09SSy5lcnJvclx0XHQ9IGNvbnNvbGUuZXJyb3IgJiYgY29uc29sZS5lcnJvci5iaW5kKGNvbnNvbGUpO1xuXHRcdFx0RlJBTUVXT1JLLndhcm5cdFx0PSBjb25zb2xlLndhcm4gJiYgY29uc29sZS53YXJuLmJpbmQoY29uc29sZSk7XG5cdFx0XHRGUkFNRVdPUksubG9nXHRcdFx0PSBjb25zb2xlLmRlYnVnICYmIGNvbnNvbGUuZGVidWcuYmluZChjb25zb2xlKTtcblx0XHRcdEZSQU1FV09SSy52ZXJib3NlXHQ9IGNvbnNvbGUubG9nICYmIGNvbnNvbGUubG9nLmJpbmQoY29uc29sZSk7XG5cblx0XHRcdC8vIFVzZSBsb2cgbGV2ZWwgY29uZmlnIGlmIHByb3ZpZGVkXG5cdFx0XHRzd2l0Y2ggKGxvZ0xldmVsKSB7XG5cdFx0XHRcdGNhc2UgJ3ZlcmJvc2UnOiBicmVhaztcblxuXHRcdFx0XHRjYXNlICdkZWJ1Zyc6XG5cdFx0XHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UgPSBub29wO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgJ3dhcm4nOlxuXHRcdFx0XHRcdEZSQU1FV09SSy52ZXJib3NlID0gRlJBTUVXT1JLLmxvZyA9IG5vb3A7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSAnZXJyb3InOlxuXHRcdFx0XHRcdEZSQU1FV09SSy52ZXJib3NlID0gRlJBTUVXT1JLLmxvZyA9IEZSQU1FV09SSy53YXJuID0gbm9vcDtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlICdzaWxlbnQnOlxuXHRcdFx0XHRcdEZSQU1FV09SSy52ZXJib3NlID0gRlJBTUVXT1JLLmxvZyA9IEZSQU1FV09SSy53YXJuID0gRlJBTUVXT1JLLmVycm9yID0gbm9vcDtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvciAoJ1VucmVjb2duaXplZCBsb2dnaW5nIGxldmVsIGNvbmZpZyAnICtcblx0XHRcdFx0XHQnKCcgKyBGUkFNRVdPUksub3B0aW9ucy5mcmFtZXdvcmtJZCArICcubG9nTGV2ZWwgPSBcIicgKyBsb2dMZXZlbCArICdcIiknKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU3VwcG9ydCBmb3IgYGRlYnVnYCBmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHlcblx0XHRcdEZSQU1FV09SSy5kZWJ1ZyA9IEZSQU1FV09SSy5sb2c7XG5cblx0XHRcdC8vIFZlcmJvc2Ugc3BpdHMgb3V0IGxvZyBsZXZlbFxuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UoJ0xvZyBsZXZlbCBzZXQgdG8gOjogJywgbG9nTGV2ZWwpO1xuXHRcdH1cblx0fVxufVxuIiwiLyoqXG4gKiBHaXZlbiBhIGNvbXBvbmVudCBkZWZpbml0aW9uIGFuZCBpdHMga2V5LCB3ZSB3aWxsIGJ1aWxkIHVwIHRoZSBjb21wb25lbnQgcHJvdG90eXBlIGFuZCBtZXJnZVxuICogdGhpcyBjb21wb25lbnQgd2l0aCBpdHMgbWF0Y2hpbmcgdGVtcGxhdGUuXG4gKlxuICogQHBhcmFtICB7T2JqZWN0fSBjb21wb25lbnREZWYgW09iamVjdCBjb250YWluaW5nIHRoZSBjb21wb25lbnQgZGVmaW5pdGlvbl1cbiAqIEBwYXJhbSAge1N0cmluZ30gY29tcG9uZW50S2V5IFtUaGUgY29tcG9uZW50IGlkZW50aWZpZXJdXG4gKi9cblxudmFyIHRyYW5zbGF0ZVNob3J0aGFuZCA9IHJlcXVpcmUoJy4uL3V0aWxzL3Nob3J0aGFuZCcpO1xudmFyIFV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMvdXRpbHMnKTtcbnZhciBFdmVudHMgPSByZXF1aXJlKCcuLi91dGlscy9ldmVudHMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBidWlsZENvbXBvbmVudFByb3RvdHlwZShjb21wb25lbnREZWYsIGNvbXBvbmVudEtleSkge1xuXG5cdC8vIElmIGNvbXBvbmVudCBpZCBpcyBub3QgZXhwbGljaXRseSBzZXQsIHVzZSB0aGUgY29tcG9uZW50S2V5XG5cdGlmICghY29tcG9uZW50RGVmLmlkKSB7XG5cdFx0Y29tcG9uZW50RGVmLmlkID0gY29tcG9uZW50S2V5O1xuXHR9XG5cblx0Ly8gU2VhcmNoIHRlbXBsYXRlc1xuXHR2YXIgdGVtcGxhdGUgPSBGUkFNRVdPUksudGVtcGxhdGVzW2NvbXBvbmVudERlZi5pZF07XG5cblx0Ly8gSWYgbm8gbWF0Y2ggZm9yIGNvbXBvbmVudCB3YXMgZm91bmTCoGluIHRlbXBsYXRlcywgaXNzdWUgYSB3YXJuaW5nXG5cdGlmICghdGVtcGxhdGUpIHtcblx0XHRyZXR1cm4gRlJBTUVXT1JLLndhcm4oXG5cdFx0XHRjb21wb25lbnREZWYuaWQgKyAnIDo6IE5vIHRlbXBsYXRlIGZvdW5kIGZvciBjb21wb25lbnQhJyArXG5cdFx0XHQnXFxuVGVtcGxhdGVzIGRvblxcJ3QgbmVlZCBhIGNvbXBvbmVudCB1bmxlc3MgeW91IHdhbnQgaW50ZXJhY3Rpdml0eSwgJyArXG5cdFx0XHQnZXZlcnkgY29tcG9uZW50ICpzaG91bGQqIGhhdmUgYSBtYXRjaGluZyB0ZW1wbGF0ZSEhJyArXG5cdFx0XHQnXFxuVXNpbmcgY29tcG9uZW50cyB3aXRob3V0IHRlbXBsYXRlcyBtYXkgc2VlbSBuZWNlc3NhcnksICcgK1xuXHRcdFx0J2J1dCBpdFxcJ3Mgbm90LiAgSXQgbWFrZXMgeW91ciB2aWV3IGxvZ2ljIGluY29ycG9yZWFsLCBhbmQgbWFrZXMgeW91ciBjb2xsZWFndWVzICcgK1xuXHRcdFx0J3VuY29tZm9ydGFibGUuJyk7XG5cdH1cblxuXHQvLyBTYXZlIHJlZmVyZW5jZSB0byB0ZW1wbGF0ZSBpbiBjb21wb25lbnQgcHJvdG90eXBlXG5cdEZSQU1FV09SSy52ZXJib3NlKGNvbXBvbmVudERlZi5pZCArICcgOjogUGFpcmluZyBjb21wb25lbnQgd2l0aCB0ZW1wbGF0ZS4uLicpO1xuXHRjb21wb25lbnREZWYudGVtcGxhdGUgPSB0ZW1wbGF0ZTtcblxuXHQvLyBUcmFuc2xhdGUgcmlnaHQtaGFuZCBzaG9ydGhhbmQgZm9yIHRvcC1sZXZlbCBrZXlzXG5cdGNvbXBvbmVudERlZiA9IFV0aWxzLm9iak1hcChjb21wb25lbnREZWYsIHRyYW5zbGF0ZVNob3J0aGFuZCk7XG5cblxuXHQvLyBhbmQgZXZlbnRzIG9iamVjdFxuXHRpZiAoY29tcG9uZW50RGVmLmV2ZW50cykge1xuXHRcdGNvbXBvbmVudERlZi5ldmVudHMgPSBVdGlscy5vYmpNYXAoXG5cdFx0XHRjb21wb25lbnREZWYuZXZlbnRzLFxuXHRcdFx0dHJhbnNsYXRlU2hvcnRoYW5kXG5cdFx0KTtcblx0fVxuXG5cdC8vIGFuZCBhZnRlckNoYW5nZSBiaW5kaW5nc1xuXHRpZiAoXy5pc09iamVjdChjb21wb25lbnREZWYuYWZ0ZXJDaGFuZ2UpICYmICFfLmlzRnVuY3Rpb24oY29tcG9uZW50RGVmLmFmdGVyQ2hhbmdlKSkge1xuXHRcdGNvbXBvbmVudERlZi5hZnRlckNoYW5nZSA9IFV0aWxzLm9iak1hcChcblx0XHRcdGNvbXBvbmVudERlZi5hZnRlckNoYW5nZSxcblx0XHRcdHRyYW5zbGF0ZVNob3J0aGFuZFxuXHRcdCk7XG5cdH1cblxuXHQvLyBHbyBhaGVhZCBhbmQgdHVybiB0aGUgZGVmaW5pdGlvbiBpbnRvIGEgcmVhbCBjb21wb25lbnQgcHJvdG90eXBlXG5cdEZSQU1FV09SSy52ZXJib3NlKGNvbXBvbmVudERlZi5pZCArICcgOjogQnVpbGRpbmcgY29tcG9uZW50IHByb3RvdHlwZS4uLicpO1xuXHR2YXIgY29tcG9uZW50UHJvdG90eXBlID0gRlJBTUVXT1JLLkNvbXBvbmVudC5leHRlbmQoY29tcG9uZW50RGVmKTtcblxuXHQvLyBEaXNjb3ZlciBzdWJzY3JpcHRpb25zXG5cdGNvbXBvbmVudFByb3RvdHlwZS5wcm90b3R5cGUuc3Vic2NyaXB0aW9ucyA9IHt9O1xuXG5cdC8vIEl0ZXJhdGUgdGhyb3VnaCBlYWNoIHByb3BlcnR5IG9uIHRoaXMgY29tcG9uZW50IHByb3RvdHlwZVxuXHRfLmVhY2goY29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZSwgZnVuY3Rpb24gKGhhbmRsZXIsIGtleSkge1xuXG5cdFx0Ly8gRGV0ZWN0IERPTSBldmVudHMgYW5kIHNtYXNoIHRoZW0gaW50byB0aGUgZXZlbnRzIGhhc2hcblx0XHR2YXIgbWF0Y2hlZERPTUV2ZW50cyA9IGtleS5tYXRjaChFdmVudHNbJy9ET01FdmVudC8nXSk7XG5cdFx0aWYgKG1hdGNoZWRET01FdmVudHMpIHtcblx0XHRcdHZhciBldmVudE5hbWUgPSBtYXRjaGVkRE9NRXZlbnRzWzFdO1xuXHRcdFx0dmFyIGRlbGVnYXRlU2VsZWN0b3IgPSBtYXRjaGVkRE9NRXZlbnRzWzNdO1xuXG5cdFx0XHQvLyBTdG93IHRoZW0gaW4gZXZlbnRzIGhhc2hcblx0XHRcdGNvbXBvbmVudFByb3RvdHlwZS5wcm90b3R5cGUuZXZlbnRzID0gY29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZS5ldmVudHMgfHwge307XG5cdFx0XHRjb21wb25lbnRQcm90b3R5cGUucHJvdG90eXBlLmV2ZW50c1trZXldID0gaGFuZGxlcjtcblx0XHR9XG5cblx0XHQvLyBBZGQgYXBwIGV2ZW50cyAoJSksIHJvdXRlcyAoIyksIGFuZCBkYXRhIGxpc3RlbmVycyAofikgdG8gc3Vic2NyaXB0aW9ucyBoYXNoXG5cdFx0aWYgKGtleS5tYXRjaCgvXiglfCN8fikvKSkge1xuXHRcdFx0aWYgKF8uaXNTdHJpbmcoaGFuZGxlcikpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGNvbXBvbmVudERlZi5pZCArICc6OiBJbnZhbGlkIGxpc3RlbmVyIGZvciBzdWJzY3JpcHRpb246ICcgKyBrZXkgKyAnLlxcbicgK1xuXHRcdFx0XHRcdCdEZWZpbmUgeW91ciBjYWxsYmFjayB3aXRoIGFuIGFub255bW91cyBmdW5jdGlvbiBpbnN0ZWFkIG9mIGEgc3RyaW5nLidcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHRcdGlmICghXy5pc0Z1bmN0aW9uKGhhbmRsZXIpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihjb21wb25lbnREZWYuaWQgKyc6OiBJbnZhbGlkIGxpc3RlbmVyIGZvciBzdWJzY3JpcHRpb246ICcgKyBrZXkpO1xuXHRcdFx0fVxuXHRcdFx0Y29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZS5zdWJzY3JpcHRpb25zW2tleV0gPSBoYW5kbGVyO1xuXHRcdH1cblxuXHRcdC8vIEV4dGVuZCBvbmUgb3IgbW9yZSBvdGhlciBjb21wb25lbnRzXG5cdFx0ZWxzZSBpZiAoa2V5ID09PSAnZXh0ZW5kQ29tcG9uZW50cycpIHtcblx0XHRcdHZhciBvYmpUb01lcmdlID0ge307XG5cdFx0XHRfLmVhY2goaGFuZGxlciwgZnVuY3Rpb24oY2hpbGRJZCl7XG5cblx0XHRcdFx0aWYgKCFGUkFNRVdPUksuY29tcG9uZW50c1tjaGlsZElkXSl7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKFxuXHRcdFx0XHRcdGNvbXBvbmVudERlZi5pZCArICcgOjogJyArXG5cdFx0XHRcdFx0J1RyeWluZyB0byBkZWZpbmUvZXh0ZW5kIHRoaXMgY29tcG9uZW50IGZyb20gYCcgKyBjaGlsZElkICsgJ2AsICcgK1xuXHRcdFx0XHRcdCdidXQgbm8gY29tcG9uZW50IHdpdGggdGhhdCBpZCBjYW4gYmUgZm91bmQuJ1xuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRfLmV4dGVuZChvYmpUb01lcmdlLCBGUkFNRVdPUksuY29tcG9uZW50c1tjaGlsZElkXSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Xy5kZWZhdWx0cyhjb21wb25lbnRQcm90b3R5cGUucHJvdG90eXBlLCBvYmpUb01lcmdlKTtcblx0XHR9XG5cdH0pO1xuXG5cdC8vIFNhdmUgcHJvdG90eXBlIGluIGdsb2JhbCBzZXQgZm9yIHRyYWNraW5nXG5cdEZSQU1FV09SSy5jb21wb25lbnRzW2NvbXBvbmVudERlZi5pZF0gPSBjb21wb25lbnRQcm90b3R5cGU7XG59O1xuIiwiLyoqXG4gKiBDb2xsZWN0IGFueSByZWdpb25zIHdpdGggdGhlIGRlZmF1bHQgY29tcG9uZW50IHNldCBmcm9tIHRoZSBET00uXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjb2xsZWN0UmVnaW9ucyAoKSB7XG5cblx0Ly8gUHJvdmlkZSBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eSBmb3IgbGVnYWN5IG5vdGF0aW9uXG5cdCQoJ3JlZ2lvbltkZWZhdWx0XSxyZWdpb25bdGVtcGxhdGVdLFtkYXRhLXJlZ2lvbl1bZGVmYXVsdF0sW2RhdGEtcmVnaW9uXVt0ZW1wbGF0ZV0nKS5lYWNoKGZ1bmN0aW9uKCkge1xuXHRcdCRlID0gJCh0aGlzKTtcblx0XHR2YXIgY29tcG9uZW50SWQgPSAkZS5hdHRyKCdkZWZhdWx0JykgfHwgJGUuYXR0cigndGVtcGxhdGUnKTtcblx0XHQkZS5hdHRyKCdjb250ZW50cycsIGNvbXBvbmVudElkKTtcblx0fSk7XG5cblx0Ly8gTm93IGluc3RhbnRpYXRlIHRoZSBhcHByb3ByaWF0ZSBkZWZhdWx0IGNvbXBvbmVudCBpbiBlYWNoXG5cdC8vIHJlZ2lvbiB3aXRoIGEgc3BlY2lmaWVkIHRlbXBsYXRlL2NvbXBvbmVudFxuXHQkKCdyZWdpb25bY29udGVudHNdLFtkYXRhLXJlZ2lvbl1bY29udGVudHNdJykuZWFjaChmdW5jdGlvbigpIHtcblx0XHRGUkFNRVdPUksuUmVnaW9uLmZyb21FbGVtZW50KHRoaXMpO1xuXHR9KTtcbn07XG4iLCIvKipcbiAqIExvYWQgYW55IHNjcmlwdCB0YWdzIG9uIHRoZSBwYWdlIHdpdGggdHlwZT1cInRleHQvdGVtcGxhdGVcIi5cbiAqXG4gKiBAcmV0dXJuIHtPYmplY3R9IFtPYmplY3QgY29uc2lzdGluZyBvZiBhIHRlbXBsYXRlIGlkZW50aWZpZXIgYW5kIGl0cyBIVE1MLl1cbiAqL1xuXG52YXIgVXRpbHMgPSByZXF1aXJlKCcuLi91dGlscy91dGlscycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNvbGxlY3RUZW1wbGF0ZXMoKSB7XG5cdHZhciB0ZW1wbGF0ZXMgPSB7fTtcblxuXHQkKCdzY3JpcHRbdHlwZT1cInRleHQvdGVtcGxhdGVcIl0nKS5lYWNoKGZ1bmN0aW9uIChpLCBlbCkge1xuXHRcdHZhciBpZCA9IFV0aWxzLmVsMmlkKGVsLCB0cnVlKTtcblx0XHR0ZW1wbGF0ZXNbaWRdID0gJChlbCkuaHRtbCgpO1xuXG5cdFx0Ly8gU3RyaXAgd2hpdGVzcGFjZSBsZWZ0b3ZlciBmcm9tIHNjcmlwdCB0YWdzXG5cdFx0dGVtcGxhdGVzW2lkXSA9IHRlbXBsYXRlc1tpZF0ucmVwbGFjZSgvXlxccysvLCcnKTtcblx0XHR0ZW1wbGF0ZXNbaWRdID0gdGVtcGxhdGVzW2lkXS5yZXBsYWNlKC9cXHMrJC8sJycpO1xuXG5cdFx0Ly8gUmVtb3ZlIGZyb20gRE9NXG5cdFx0JChlbCkucmVtb3ZlKCk7XG5cdH0pO1xuXG5cdHJldHVybiB0ZW1wbGF0ZXM7XG59O1xuIiwiLyoqXG4gKiBUaGlzIGlzIHRoZSBzdGFydGluZyBwb2ludCB0byB5b3VyIGFwcGxpY2F0aW9uLiAgWW91IHNob3VsZCBncmFiIHRlbXBsYXRlcyBhbmQgY29tcG9uZW50c1xuICogYmVmb3JlIGNhbGxpbmcgRlJBTUVXT1JLLnJhaXNlKCkgdXNpbmcgc29tZXRoaW5nIGxpa2UgUmVxdWlyZS5qcy5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9uc1xuXHRcdGRhdGE6IHsgYXV0aGVudGljYXRlZDogZmFsc2UgfSxcblx0XHR0ZW1wbGF0ZXM6IHsgY29tcG9uZW50TmFtZTogSFRNTE9yUHJlY29tcGlsZWRGbiB9LFxuXHRcdGNvbXBvbmVudHM6IHsgY29tcG9uZW50TmFtZTogQ29tcG9uZW50RGVmaW5pdGlvbiB9XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYlxuICovXG5cbnZhciBMb2dnZXIgPSByZXF1aXJlKCcuLi9sb2dnZXIvaW5kZXgnKTtcbnZhciBidWlsZENvbXBvbmVudERlZmluaXRpb24gPSByZXF1aXJlKCcuLi9kZWZpbmUvYnVpbGREZWZpbml0aW9uJyk7XG52YXIgYnVpbGRDb21wb25lbnRQcm90b3R5cGUgPSByZXF1aXJlKCcuL2J1aWxkUHJvdG90eXBlJyk7XG52YXIgY29sbGVjdFRlbXBsYXRlcyA9IHJlcXVpcmUoJy4vY29sbGVjdFRlbXBsYXRlcycpO1xudmFyIGNvbGxlY3RSZWdpb25zID0gcmVxdWlyZSgnLi9jb2xsZWN0UmVnaW9ucycpO1xudmFyIHNldHVwUm91dGVyID0gcmVxdWlyZSgnLi4vcm91dGVyL2luZGV4Jyk7XG5cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByYWlzZShvcHRpb25zLCBjYikge1xuXG5cdC8vIElmIG9ubHkgb25lIGFyZyBpcyBwcmVzZW50LCB1c2Ugb3B0aW9ucyBhcyBjYWxsYmFjayBpZiBwb3NzaWJsZS5cblx0Ly8gSWYgb3B0aW9ucyBhcmUgbm90IGRlZmluZWQsIHVzZSBhbiBlbXB0eSBvYmplY3QuXG5cdGlmICghY2IgJiYgXy5pc0Z1bmN0aW9uKG9wdGlvbnMpKSB7XG5cdFx0Y2IgPSBvcHRpb25zO1xuXHR9XG5cdGlmICghXy5pc1BsYWluT2JqZWN0KG9wdGlvbnMpKSB7XG5cdFx0b3B0aW9ucyA9IHt9O1xuXHR9XG5cblx0Ly8gSW50ZXJwcmV0IGBwcm9kdWN0aW9uYCBhcyBgbG9nTGV2ZWwgPT09ICdzaWxlbnQnYFxuXHRpZiAoRlJBTUVXT1JLLm9wdGlvbnMucHJvZHVjdGlvbikge1xuXHRcdEZSQU1FV09SSy5vcHRpb25zLmxvZ0xldmVsID0gJ3NpbGVudCc7XG5cdH1cblxuXHQvLyBJbml0aWFsaXplIGxvZ2dlclxuXHRuZXcgTG9nZ2VyKCk7XG5cblx0Ly8gTWVyZ2UgZGF0YSBpbnRvIEZSQU1FV09SSy5kYXRhXG5cdF8uZXh0ZW5kKEZSQU1FV09SSy5kYXRhLCBvcHRpb25zLmRhdGEgfHwge30pO1xuXG5cdC8vIE1lcmdlIHNwZWNpZmllZCB0ZW1wbGF0ZXMgd2l0aCBGUkFNRVdPUksudGVtcGxhdGVzXG5cdF8uZXh0ZW5kKEZSQU1FV09SSy50ZW1wbGF0ZXMsIG9wdGlvbnMudGVtcGxhdGVzIHx8IHt9KTtcblxuXHQvLyBJZiBGUkFNRVdPUksuZGVmaW5lKCkgd2FzIHVzZWQsIGJ1aWxkIHRoZSBsaXN0IG9mIGNvbXBvbmVudHNcblx0Ly8gSXRlcmF0ZSB0aHJvdWdoIHRoZSBkZWZpbmUgcXVldWUgYW5kIGNyZWF0ZSBlYWNoIGRlZmluaXRpb25cblx0Xy5lYWNoKEZSQU1FV09SSy5fZGVmaW5lUXVldWUsIGJ1aWxkQ29tcG9uZW50RGVmaW5pdGlvbik7XG5cblx0Ly8gTWVyZ2Ugc3BlY2lmaWVkIGNvbXBvbmVudHMgdy8gRlJBTUVXT1JLLmNvbXBvbmVudHNcblx0Xy5leHRlbmQoRlJBTUVXT1JLLmNvbXBvbmVudHMsIG9wdGlvbnMuY29tcG9uZW50cyB8fCB7fSk7XG5cblx0Ly8gQmFjayB1cCBlYWNoIGNvbXBvbmVudCBkZWZpbml0aW9uIGJlZm9yZSB0cmFuc2Zvcm1pbmcgaXQgaW50byBhIGxpdmUgcHJvdG90eXBlXG5cdEZSQU1FV09SSy5jb21wb25lbnREZWZzID0gXy5jbG9uZShGUkFNRVdPUksuY29tcG9uZW50cyk7XG5cblx0Ly8gUnVuIHRoaXMgY2FsbCBiYWNrIHdoZW4gdGhlIERPTSBpcyByZWFkeVxuXHQkKGZ1bmN0aW9uICgpIHtcblxuXHRcdC8vIENvbGxlY3QgYW55IDxzY3JpcHQ+IHRhZyB0ZW1wbGF0ZXMgb24gdGhlIHBhZ2Vcblx0XHQvLyBhbmQgYWJzb3JiIHRoZW0gaW50byBGUkFNRVdPUksudGVtcGxhdGVzXG5cdFx0Xy5leHRlbmQoRlJBTUVXT1JLLnRlbXBsYXRlcywgY29sbGVjdFRlbXBsYXRlcygpKTtcblxuXHRcdC8vIEJ1aWxkIGFjdHVhbCBwcm90b3R5cGVzIGZvciB0aGUgY29tcG9uZW50c1xuXHRcdC8vIChuZWVkIHRoZSB0ZW1wbGF0ZXMgYXQgdGhpcyBwb2ludCB0byBtYWtlIHRoaXMgd29yaylcblx0XHRfLmVhY2goRlJBTUVXT1JLLmNvbXBvbmVudHMsIGJ1aWxkQ29tcG9uZW50UHJvdG90eXBlKTtcblxuXHRcdC8vIEdyYWIgaW5pdGlhbCByZWdpb25zIGZyb20gRE9NXG5cdFx0Y29sbGVjdFJlZ2lvbnMoKTtcblxuXHRcdC8vIEJpbmQgZ2xvYmFsIERPTSBldmVudHMgYXMgRlJBTUVXT1JLIGV2ZW50c1xuXHRcdC8vIChlLmcuICV3aW5kb3c6cmVzaXplKVxuXHRcdHZhciB0cmlnZ2VyUmVzaXplRXZlbnQgPSBfLmRlYm91bmNlKGZ1bmN0aW9uICgpIHtcblx0XHRcdEZSQU1FV09SSy50cmlnZ2VyKCcld2luZG93OnJlc2l6ZScpO1xuXHRcdH0sIEZSQU1FV09SSy5vcHRpb25zLnRocm90dGxlV2luZG93UmVzaXplIHx8IDApO1xuXHRcdCQod2luZG93KS5yZXNpemUodHJpZ2dlclJlc2l6ZUV2ZW50KTtcblx0XHQvLyBUT0RPOiBhZGQgbW9yZSBldmVudHMgYW5kIGV4dHJhcG9sYXRlIHRoaXMgbG9naWMgdG8gYSBzZXBhcmF0ZSBtb2R1bGVcblxuXHRcdC8vIERvIHRoZSBpbml0aWFsIHJvdXRpbmcgc2VxdWVuY2Vcblx0XHQvLyBMb29rIGF0IHRoZSAjZnJhZ21lbnQgdXJsIGFuZCBmaXJlIHRoZSBnbG9iYWwgcm91dGUgZXZlbnRcblx0XHRzZXR1cFJvdXRlcigpO1xuXHRcdEZSQU1FV09SSy5oaXN0b3J5LnN0YXJ0KF8uZGVmYXVsdHMoe1xuXHRcdFx0cHVzaFN0YXRlOiB1bmRlZmluZWQsXG5cdFx0XHRoYXNoQ2hhbmdlOiB1bmRlZmluZWQsXG5cdFx0XHRyb290OiB1bmRlZmluZWRcblx0XHR9LCBvcHRpb25zKSk7XG5cblx0XHRpZiAoY2IpIGNiKCk7XG5cdH0pO1xufTtcbiIsIi8qKlxuICogQXBwZW5kIGEgY29tcG9uZW50IHRvIHRoZSBlbmQgb2YgYSByZWdpb24uIFRoaXMgY2FsbHMgaW5zZXJ0IGF0IHRoZSBsYXN0IHBvc2l0aW9uLlxuICpcbiAqIEBwYXJhbSAge1N0cmluZ30gY29tcG9uZW50SWQgW1RoZSBjb21wb25lbnQgaWQgdGhhdCB3ZSB3YW50IHRvIGFwcGVuZF1cbiAqIEBwYXJhbSAge09iamVjdH0gcHJvcGVydGllcyAgW1Byb3BlcnRpZXMgdG8gaW5zdGFudGlhdGUgdGhlIGNvbXBvbmVudCB3aXRoXVxuICpcbiAqIEByZXR1cm4ge0NvbXBvbmVudH0gICAgICAgICAgW05ld2x5IGFwcGVuZGVkIENvbXBvbmVudF1cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBhcHBlbmQoY29tcG9uZW50SWQsIHByb3BlcnRpZXMpIHtcblx0Ly8gSW5zZXJ0IGF0IGxhc3QgcG9zaXRpb25cblx0cmV0dXJuIHRoaXMuaW5zZXJ0KHRoaXMuX2NoaWxkcmVuLmxlbmd0aCwgY29tcG9uZW50SWQsIHByb3BlcnRpZXMpO1xufTtcbiIsIi8qKlxuICogU2hvcnRjdXQgZm9yIGNhbGxpbmcgZW1wdHkoKSBhbmQgdGhlbiBhcHBlbmQoKSxcbiAqIFRoaXMgaXMgdGhlIGdlbmVyYWwgdXNlIGNhc2UgZm9yIG1hbmFnaW5nIHN1YmNvbXBvbmVudHNcbiAqIChlLmcuIHdoZW4gYSBuYXZiYXIgaXRlbSBpcyB0b3VjaGVkKVxuICpcbiAqIEBwYXJhbSAge1N0cmluZ30gY29tcG9uZW50ICBbVGhlIGlkIG5hbWUgb2YgdGhlIGNvbXBvbmV0IHRoYXQgeW91IHdhbnQgdG8gYXR0YWNoXVxuICogQHBhcmFtICB7T2JqZWN0fSBwcm9wZXJ0aWVzIFtQcm9wZXJ0aWVzIHRoYXQgdGhlIGF0dGFjaGVkIGNvbXBvbmVudCB3aWxsIGJlIGluaXRhbGl6ZWQgd2l0aF1cbiAqXG4gKiBAcmV0dXJuIHtDb21wb25lbnR9IFx0XHRcdFx0IFtOZXdseSBhdHRhY2hlZCBjb21wb25lbnRdXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYXR0YWNoKGNvbXBvbmVudCwgcHJvcGVydGllcykge1xuXHR0aGlzLmVtcHR5KCk7XG5cdHJldHVybiB0aGlzLmFwcGVuZChjb21wb25lbnQsIHByb3BlcnRpZXMpO1xufTtcbiIsIi8qKlxuICogcmVnaW9uLmVtcHR5KCApXG4gKlxuICogSXRlcmF0ZSBvdmVyIGVhY2ggY29tcG9uZW50IGluIHRoaXMgcmVnaW9uIGFuZCBjYWxsIC5jbG9zZSgpIG9uIGl0XG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZW1wdHkoKSB7XG5cdEZSQU1FV09SSy5kZWJ1Zyh0aGlzLnBhcmVudC5pZCArICcgOjogRW1wdHlpbmcgcmVnaW9uOiAnICsgdGhpcy5pZCk7XG5cdHdoaWxlICh0aGlzLl9jaGlsZHJlbi5sZW5ndGggPiAwKSB7XG5cdFx0dGhpcy5yZW1vdmUoMCk7XG5cdH1cbn07XG4iLCIvKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXNcbiAqL1xudmFyIFV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMvdXRpbHMnKTtcblxuXG5cbi8qKlxuICogRmFjdG9yeSBtZXRob2QgdG8gZ2VuZXJhdGUgYSBuZXcgcmVnaW9uIGluc3RhbmNlIGZyb20gYSBET00gZWxlbWVudFxuICogQWxzbyBpbXBsZW1lbnRzIGB0ZW1wbGF0ZWAgYW5kIGBjb3VudGAgZGlyZWN0aXZlcy5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9uc1xuICogQHJldHVybnMgcmVnaW9uIGluc3RhbmNlXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmcm9tRWxlbWVudChlbCwgcGFyZW50KSB7XG5cblx0Ly8gSWYgcGFyZW50IGlzIG5vdCBzcGVjaWZpZWQsIG1ha2UtYmVsaWV2ZS5cblx0cGFyZW50ID0gcGFyZW50IHx8IHsgaWQ6ICcqJyB9O1xuXG5cdC8vIEJ1aWxkIHJlZ2lvblxuXHR2YXIgcmVnaW9uID0gbmV3IEZSQU1FV09SSy5SZWdpb24oe1xuXHRcdGlkOiBVdGlscy5lbDJpZChlbCksXG5cdFx0JGVsOiAkKGVsKSxcblx0XHRwYXJlbnQ6IHBhcmVudFxuXHR9KTtcblxuXHQvLyBJZiB0aGlzIHJlZ2lvbiBoYXMgYSBkZWZhdWx0IGNvbXBvbmVudC90ZW1wbGF0ZSBzZXQsXG5cdC8vIGdyYWIgdGhlIGlkICAtLSAgZS5nLiA8cmVnaW9uIGNvbnRlbnRzPVwiRm9vXCIgLz5cblx0dmFyIGNvbXBvbmVudElkID0gJChlbCkuYXR0cignY29udGVudHMnKTtcblxuXG5cdC8qKioqKioqKioqKioqKioqKioqKioqKioqKlxuXHQgKiBUZW1wbGF0ZSBpbXBsZW1lbnRhdGlvblxuXHQgKioqKioqKioqKioqKioqKioqKioqKioqKiovXG5cblx0Ly8gQXBwZW5kIHN1Yi1jb21wb25lbnQocykgdG8gcmVnaW9uIGF1dG9tYXRpY2FsbHlcblx0aWYgKCBGUkFNRVdPUksub3B0aW9ucy5zaG9ydGN1dC50ZW1wbGF0ZSAmJiBjb21wb25lbnRJZCApIHtcblxuXHRcdHJlZ2lvbi5hcHBlbmQoY29tcG9uZW50SWQpO1xuXG5cblx0XHQvKioqKioqKioqKioqKioqKioqKioqKipcblx0XHQgKiBDb3VudCBpbXBsZW1lbnRhdGlvblxuXHRcdCAqKioqKioqKioqKioqKioqKioqKioqKi9cblxuXHRcdGlmIChGUkFNRVdPUksub3B0aW9ucy5zaG9ydGN1dC5jb3VudCkge1xuXHRcdFx0Ly8gSWYgYGNvdW50YCBpcyBzZXQsIHJlbmRlciBzdWItY29tcG9uZW50IHNwZWNpZmllZCBudW1iZXIgb2YgdGltZXMuXG5cdFx0XHQvLyBlLmcuIDxyZWdpb24gdGVtcGxhdGU9XCJGb29cIiBjb3VudD1cIjNcIiAvPlxuXHRcdFx0dmFyIGNvdW50ID0gJChlbCkuYXR0cignY291bnQnKTtcblxuXHRcdFx0aWYgKGNvdW50KSB7XG5cblx0XHRcdFx0Ly8gUmVtb3ZlIG9uZSBmcm9tIGNvdW50IGJlY2F1c2Ugc2hvcnRjdXQudGVtcGxhdGUgYXBwZW5kcyBvbmUuXG5cdFx0XHRcdGNvdW50IC09IDE7XG5cdFx0XHRcdGZvciAodmFyIGk9MDsgaSA8IGNvdW50OyBpKysgKSB7XG5cdFx0XHRcdFx0cmVnaW9uLmFwcGVuZChjb21wb25lbnRJZCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRGUkFNRVdPUksuZGVidWcoXG5cdFx0XHRcdFx0cGFyZW50LmlkICsgJyA6LTogSW5zdGFudGlhdGVkwqBuZXcgcmVnaW9uJyArXG5cdFx0XHRcdFx0KCByZWdpb24uaWQgPyAnIGAnICsgcmVnaW9uLmlkICsgJ2AnIDogJycgKSArXG5cdFx0XHRcdFx0KCBjb21wb25lbnRJZCA/ICcgYW5kIHBvcHVsYXRlZCBpdCB3aXRoJyArXG5cdFx0XHRcdFx0XHQoIGNvdW50ID4gMSA/IGNvdW50ICsgJyBpbnN0YW5jZXMgb2YnIDogJyAxJyApICtcblx0XHRcdFx0XHRcdCcgYCcgKyBjb21wb25lbnRJZCArICdgJyA6ICcnXG5cdFx0XHRcdFx0KSArICcuJ1xuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJldHVybiByZWdpb247XG59O1xuIiwiLyoqXG4gKiBSZWdpb25zXG4gKi9cblxudmFyIGluc2VydCA9IHJlcXVpcmUoJy4vaW5zZXJ0JyksXG5cdFx0cmVtb3ZlID0gcmVxdWlyZSgnLi9yZW1vdmUnKSxcblx0XHRlbXB0eSA9IHJlcXVpcmUoJy4vZW1wdHknKSxcblx0XHRhcHBlbmQgPSByZXF1aXJlKCcuL2FwcGVuZCcpLFxuXHRcdGF0dGFjaCA9IHJlcXVpcmUoJy4vYXR0YWNoJyksXG5cdFx0cHJlcGVuZCA9IHJlcXVpcmUoJy4vcHJlcGVuZCcpLFxuXHRcdGZyb21FbGVtZW50ID0gcmVxdWlyZSgnLi9mcm9tRWxlbWVudCcpO1xuXG5SZWdpb24gPSBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHJlZ2lvbihwcm9wZXJ0aWVzKSB7XG5cblx0Xy5leHRlbmQodGhpcywgRlJBTUVXT1JLLkV2ZW50cyk7XG5cblx0aWYgKCFwcm9wZXJ0aWVzKSB7XG5cdFx0cHJvcGVydGllcyA9IHt9O1xuXHR9XG5cdGlmICghcHJvcGVydGllcy4kZWwpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1RyeWluZyB0byBpbnN0YW50aWF0ZSByZWdpb24gd2l0aCBubyAkZWwhJyk7XG5cdH1cblxuXHQvLyBGb2xkIGluIHByb3BlcnRpZXMgdG8gcHJvdG90eXBlXG5cdF8uZXh0ZW5kKHRoaXMsIHByb3BlcnRpZXMpO1xuXG5cdC8vIElmIG5laXRoZXIgYW4gaWQgbm9yIGEgYHRlbXBsYXRlYCB3YXMgc3BlY2lmaWVkLFxuXHQvLyB3ZSdsbCB0aHJvdyBhbiBlcnJvciwgc2luY2UgdGhlcmUncyBubyB3YXkgdG8gZ2V0IGEgaG9sZCBvZiB0aGUgcmVnaW9uXG5cdHZhciBkZWZhdWx0VGVtcGxhdGUgPSB0aGlzLiRlbC5hdHRyKCdkZWZhdWx0JykgfHwgdGhpcy4kZWwuYXR0cigndGVtcGxhdGUnKSB8fCB0aGlzLiRlbC5hdHRyKCdjb250ZW50cycpO1xuXHRpZiAoICF0aGlzLmlkICYmICFkZWZhdWx0VGVtcGxhdGUgKSB7XG5cblx0XHR0aHJvdyBuZXcgRXJyb3IoXG5cdFx0XHR0aGlzLnBhcmVudC5pZCArICcgOjogQSByZWdpb24gaWRlbnRpZmllciAoZS5nLiBgZGF0YS1yZWdpb249XCJmb29cImApIG1heSAnICtcblx0XHRcdCdvbmx5IGJlIG9taXR0ZWQgaWYgYSBkZWZhdWx0IHRlbXBsYXRlIGlzIHNwZWNpZmllZCwgZS5nLjpcXG4nICtcblx0XHRcdCdlLmcuIDxyZWdpb24gdGVtcGxhdGU9XCJTb21lQ29tcG9uZW50XCI+PC9yZWdpb24+J1xuXHRcdCk7XG5cdH1cblxuXHQvLyBTZXQgdXAgbGlzdCB0byBob3VzZSBjaGlsZCBjb21wb25lbnRzXG5cdHRoaXMuX2NoaWxkcmVuID0gW107XG5cblx0Xy5iaW5kQWxsKHRoaXMpO1xuXG5cdC8vIFNldCB1cCBjb252ZW5pZW5jZSBhY2Nlc3MgdG8gdGhpcyByZWdpb24gaW4gdGhlIGdsb2JhbCByZWdpb24gY2FjaGVcblx0RlJBTUVXT1JLLnJlZ2lvbnNbdGhpcy5pZF0gPSB0aGlzO1xufTtcblxuUmVnaW9uLmZyb21FbGVtZW50ID0gZnVuY3Rpb24oZWwsIHBhcmVudCkge1xuXHRyZXR1cm4gZnJvbUVsZW1lbnQoZWwsIHBhcmVudCk7XG59O1xuUmVnaW9uLnByb3RvdHlwZS5yZW1vdmUgPSBmdW5jdGlvbihhdEluZGV4KSB7XG5cdHJldHVybiByZW1vdmUuY2FsbCh0aGlzLCBhdEluZGV4KTtcbn07XG5SZWdpb24ucHJvdG90eXBlLmVtcHR5ID0gZnVuY3Rpb24oKSB7XG5cdHJldHVybiBlbXB0eS5jYWxsKHRoaXMpO1xufTtcblJlZ2lvbi5wcm90b3R5cGUuaW5zZXJ0ID0gZnVuY3Rpb24oYXRJbmRleCwgY29tcG9uZW50SWQsIHByb3BlcnRpZXMpIHtcblx0cmV0dXJuIGluc2VydC5jYWxsKHRoaXMsIGF0SW5kZXgsIGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKTtcbn07XG5SZWdpb24ucHJvdG90eXBlLmFwcGVuZCA9IGZ1bmN0aW9uKGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKSB7XG5cdHJldHVybiBhcHBlbmQuY2FsbCh0aGlzLCBjb21wb25lbnRJZCwgcHJvcGVydGllcyk7XG59O1xuUmVnaW9uLnByb3RvdHlwZS5hdHRhY2ggPSBmdW5jdGlvbihjb21wb25lbnQsIHByb3BlcnRpZXMpIHtcblx0cmV0dXJuIGF0dGFjaC5jYWxsKHRoaXMsIGNvbXBvbmVudCwgcHJvcGVydGllcyk7XG59O1xuUmVnaW9uLnByb3RvdHlwZS5wcmVwZW5kID0gZnVuY3Rpb24oY29tcG9uZW50SWQsIHByb3BlcnRpZXMpIHtcblx0cmV0dXJuIHByZXBlbmQuY2FsbCh0aGlzLCBjb21wb25lbnRJZCwgcHJvcGVydGllcyk7XG59O1xuIiwiLyoqXG4gKiByZWdpb24uaW5zZXJ0KCBhdEluZGV4LCBjb21wb25lbnRJZCwgW3Byb3BlcnRpZXNdIClcbiAqXG4gKiBUT0RPOiBzdXBwb3J0IGEgbGlzdCBvZiBwcm9wZXJ0aWVzIG9iamVjdHMgaW4gbGlldSBvZiB0aGUgcHJvcGVydGllcyBvYmplY3RcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGluc2VydChhdEluZGV4LCBjb21wb25lbnRJZCwgcHJvcGVydGllcykge1xuXG5cdHZhciBlcnIgPSAnJztcblx0aWYgKCEoYXRJbmRleCB8fCBfLmlzRmluaXRlKGF0SW5kZXgpKSkge1xuXHRcdGVyciArPSB0aGlzLmlkICsgJy5pbnNlcnQoKSA6OiBObyBhdEluZGV4IHNwZWNpZmllZCEnO1xuXHR9XG5cdGVsc2UgaWYgKCFjb21wb25lbnRJZCkge1xuXHRcdGVyciArPSB0aGlzLmlkICsgJy5pbnNlcnQoKSA6OiBObyBjb21wb25lbnRJZCBzcGVjaWZpZWQhJztcblx0fVxuXHRpZiAoZXJyKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGVyciArICdcXG5Vc2FnZTogYXBwZW5kKGF0SW5kZXgsIGNvbXBvbmVudElkLCBbcHJvcGVydGllc10pJyk7XG5cdH1cblxuXHR2YXIgY29tcG9uZW50O1xuXHQvLyBJZiBjb21wb25lbnRJZCBpcyBhIHN0cmluZywgbG9vayB1cCBjb21wb25lbnQgcHJvdG90eXBlIGFuZCBpbnN0YXRpYXRlXG5cdGlmICgnc3RyaW5nJyA9PSB0eXBlb2YgY29tcG9uZW50SWQpIHtcblxuXHRcdHZhciBjb21wb25lbnRQcm90b3R5cGUgPSBGUkFNRVdPUksuY29tcG9uZW50c1tjb21wb25lbnRJZF07XG5cblx0XHRpZiAoIWNvbXBvbmVudFByb3RvdHlwZSkge1xuXHRcdFx0dmFyIHRlbXBsYXRlID0gRlJBTUVXT1JLLnRlbXBsYXRlc1tjb21wb25lbnRJZF07XG5cdFx0XHRpZiAoIXRlbXBsYXRlKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvciAoJ0luICcgK1xuXHRcdFx0XHRcdCh0aGlzLmlkIHx8ICdBbm9ueW1vdXMgcmVnaW9uJykgKyAnOjogVHJ5aW5nIHRvIGF0dGFjaCAnICtcblx0XHRcdFx0XHRjb21wb25lbnRJZCArICcsIGJ1dCBubyBjb21wb25lbnQgb3IgdGVtcGxhdGUgZXhpc3RzIHdpdGggdGhhdCBpZC4nKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSWYgbm8gY29tcG9uZW50IHByb3RvdHlwZSB3aXRoIHRoaXMgaWQgZXhpc3RzLFxuXHRcdFx0Ly8gY3JlYXRlIGFuIGFub255bW91cyBvbmUgdG8gdXNlXG5cdFx0XHRjb21wb25lbnRQcm90b3R5cGUgPSBGUkFNRVdPUksuQ29tcG9uZW50LmV4dGVuZCh7XG5cdFx0XHRcdGlkOiBjb21wb25lbnRJZCxcblx0XHRcdFx0dGVtcGxhdGU6IHRlbXBsYXRlXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBJbnN0YW50aWF0ZSBhbmQgcmVuZGVyIHRoZSBjb21wb25lbnQgaW5zaWRlIHRoaXMgcmVnaW9uXG5cdFx0Y29tcG9uZW50ID0gbmV3IGNvbXBvbmVudFByb3RvdHlwZShfLmV4dGVuZCh7XG5cdFx0XHQkb3V0bGV0OiB0aGlzLiRlbFxuXHRcdH0sIHByb3BlcnRpZXMgfHwge30pKTtcblxuXG5cdH1cblxuXHQvLyBPdGhlcndpc2UgYXNzdW1lIGFuIGluc3RhbnRpYXRlZCBjb21wb25lbnQgb2JqZWN0IHdhcyBzZW50XG5cdC8qIFRPRE86IENoZWNrIHRoYXQgY29tcG9uZW50IG9iamVjdCBpcyB2YWxpZCAqL1xuXHRlbHNlIHtcblx0XHRjb21wb25lbnQgPSBjb21wb25lbnRJZDtcblx0XHRjb21wb25lbnQuJG91dGxldCA9IHRoaXMuJGVsO1xuXHR9XG5cblx0Ly8gU2F2ZSByZWZlcmVuY2UgdG8gcGFyZW50UmVnaW9uXG5cdGNvbXBvbmVudC5wYXJlbnRSZWdpb24gPSB0aGlzO1xuXG5cdC8vIENoZWNrIHRvIHNlZSBpZiB0aGUgbW9kZWwgd2FzIGFscmVhZHkgZGVmaW5lZC4gSWYgaXQgaXMsIHVzZSB0aGF0IG1vZGVsLiBJZiBub3QsIGFzc2lnbiBpdFxuXHQvLyB0aGUgcGFyZW50cyBtb2RlbCBpZiBpdCBoYXMgb25lLCBvciBhc3NpZ24gaXQgYSBuZXcgYmFja2JvbmUgaW5zdGFuY2UuXG5cdGlmICghY29tcG9uZW50Lm1vZGVsKSB7XG5cdFx0Y29tcG9uZW50Lm1vZGVsID0gdGhpcy5wYXJlbnQubW9kZWwgPyB0aGlzLnBhcmVudC5tb2RlbCA6IG5ldyBCYWNrYm9uZS5Nb2RlbCgpO1xuXHR9XG5cblx0Ly8gUmVuZGVyIGNvbXBvbmVudCBpbnRvIHRoaXMgcmVnaW9uXG5cdGNvbXBvbmVudC5yZW5kZXIoYXRJbmRleCk7XG5cblx0Ly8gQW5kIGtlZXAgdHJhY2sgb2YgaXQgaW4gdGhlIGxpc3Qgb2YgdGhpcyByZWdpb24ncyBjaGlsZHJlblxuXHR0aGlzLl9jaGlsZHJlbi5zcGxpY2UoYXRJbmRleCwgMCwgY29tcG9uZW50KTtcblxuXHQvLyBMb2cgZm9yIGRlYnVnZ2luZyBgY291bnRgIGRlY2xhcmF0aXZlXG5cdHZhciBkZWJ1Z1N0ciA9IHRoaXMucGFyZW50LmlkICsgJyA6OiBJbnNlcnRlZCAnICsgY29tcG9uZW50SWQgKyAnIGludG8gJztcblx0aWYgKHRoaXMuaWQpIGRlYnVnU3RyICs9ICdyZWdpb246ICcgKyB0aGlzLmlkICsgJyBhdCBpbmRleCAnICsgYXRJbmRleDtcblx0ZWxzZSBkZWJ1Z1N0ciArPSAnYW5vbnltb3VzIHJlZ2lvbiBhdCBpbmRleCAnICsgYXRJbmRleDtcblx0RlJBTUVXT1JLLnZlcmJvc2UoZGVidWdTdHIpO1xuXG5cdHJldHVybiBjb21wb25lbnQ7XG5cbn07XG4iLCIvKipcbiAqIFByZXBlbmQgYSBjb21wb25lbnQgdG8gdGhlIGJlZ2lubmluZyBvZiBhIHJlZ2lvbi4gVGhpcyBjYWxscyBpbnNlcnQgYXQgdGhlIGZpcnN0IHBvc2l0aW9uLlxuICpcbiAqIEBwYXJhbSAge1N0cmluZ30gY29tcG9uZW50SWQgW1RoZSBjb21wb25lbnQgaWQgdGhhdCB3ZSB3YW50IHRvIHByZXBlbmQgXVxuICogQHBhcmFtICB7T2JqZWN0fSBwcm9wZXJ0aWVzICBbUHJvcGVydGllcyB0byBpbnN0YW50aWF0ZSB0aGUgY29tcG9uZW50IHdpdGhdXG4gKlxuICogQHJldHVybiB7Q29tcG9uZW50fSAgICAgICAgICBbTmV3bHkgcHJlcGVuZGVkIENvbXBvbmVudF1cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBwcmVwZW5kKGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKSB7XG5cdC8vIEluc2VydCBhdCBsYXN0IHBvc2l0aW9uXG5cdHJldHVybiB0aGlzLmluc2VydCgwLCBjb21wb25lbnRJZCwgcHJvcGVydGllcyk7XG59O1xuIiwiLyoqXG4gKiByZWdpb24ucmVtb3ZlKCBhdEluZGV4IClcbiAqXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcmVtb3ZlKGF0SW5kZXgpIHtcblxuXHRpZiAoIWF0SW5kZXggJiYgIV8uaXNGaW5pdGUoYXRJbmRleCkpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IodGhpcy5pZCArICcucmVtb3ZlKCkgOjogTm8gYXRJbmRleCBzcGVjaWZpZWQhIFxcblVzYWdlOiByZW1vdmUoYXRJbmRleCknKTtcblx0fVxuXG5cdC8vIFJlbW92ZSB0aGUgY29tcG9uZW50IGZyb20gdGhlIGxpc3Rcblx0dmFyIGNvbXBvbmVudCA9IHRoaXMuX2NoaWxkcmVuLnNwbGljZShhdEluZGV4LCAxKTtcblx0aWYgKCFjb21wb25lbnRbMF0pIHtcblxuXHRcdC8vIElmIHRoZSBsaXN0IGlzIGVtcHR5LCBmcmVhayBvdXRcblx0XHR0aHJvdyBuZXcgRXJyb3IodGhpcy5pZCArICcucmVtb3ZlKCkgOjogVHJ5aW5nIHRvIHJlbW92ZSBhIGNvbXBvbmVudCB0aGF0IGRvZXNuXFwndCBleGlzdCBhdCBpbmRleCAnICsgYXRJbmRleCk7XG5cdH1cblxuXHQvLyBTcXVlZXplIHRoZSBjb21wb25lbnQgdG8gZG8gZ2V0IGFsbCB0aGUgYmluZHkgZ29vZG5lc3Mgb3V0XG5cdGNvbXBvbmVudFswXS5jbG9zZSgpO1xuXG5cdEZSQU1FV09SSy5kZWJ1Zyh0aGlzLnBhcmVudC5pZCArICcgOjogUmVtb3ZlZCBjb21wb25lbnQgYXQgaW5kZXggJyArIGF0SW5kZXggKyAnIGZyb20gcmVnaW9uOiAnICsgdGhpcy5pZCk7XG59O1xuIiwiLyoqXG4gKiBTZXRzIHVwIHRoZSBGUkFNRVdPUksgcm91dGVyLlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHJvdXRlclNldHVwKCkge1xuXG5cdC8vIFdpbGRjYXJkIHJvdXRlcyB0byBnbG9iYWwgZXZlbnQgZGVsZWdhdG9yXG5cdHZhciByb3V0ZXIgPSBuZXcgRlJBTUVXT1JLLlJvdXRlcigpO1xuXHRyb3V0ZXIucm91dGUoLyguKikvLCAncm91dGUnLCBmdW5jdGlvbiAocm91dGUpIHtcblxuXHRcdC8vIE5vcm1hbGl6ZSBob21lIHJvdXRlcyAoIyBvciBudWxsKSB0byAnJ1xuXHRcdGlmICghcm91dGUpIHtcblx0XHRcdHJvdXRlID0gJyc7XG5cdFx0fVxuXG5cdFx0Ly8gVHJpZ2dlciByb3V0ZVxuXHRcdEZSQU1FV09SSy50cmlnZ2VyKCcjJyArIHJvdXRlKTtcblx0fSk7XG5cblx0Ly8gRXhwb3NlIGBuYXZpZ2F0ZSgpYCBtZXRob2Rcblx0RlJBTUVXT1JLLm5hdmlnYXRlID0gRlJBTUVXT1JLLmhpc3RvcnkubmF2aWdhdGU7XG59XG4iLCIvKipcbiAqIEJhcmUtYm9uZXMgRE9NL1VJIHV0aWxpdGllc1xuICovXG5cbnZhciBFdmVudHMgPSByZXF1aXJlKCcuL2V2ZW50cycpO1xuXG52YXIgRE9NID0ge1xuXG5cdC8qKlxuXHQgKiBFeHBvc2UgdGhlIFwiRE9NbXktZXZlbnRlZG5lc3NcIiBvZiBlbGVtZW50cyBzbyB0aGF0IGl0J3Mgc2VsZWN0YWJsZSB2aWEgQ1NTXG5cdCAqIFlvdSBjYW4gdXNlIHRoaXMgdG8gYXBwbHkgYSBmZXcgY2hvaWNlIERPTSBtb2RpZmljYXRpb25zIG91dCB0aGUgZ2F0ZS0tXG5cdCAqIChlLmcuIHR3ZWFrcyB0YXJnZXRpbmcgY29tbW9uIGlzc3VlcyB0aGF0IHR5cGljYWxseSBnZXQgZm9yZ290dGVuLCBsaWtlIGRpc2FibGluZyB0ZXh0IHNlbGVjdGlvbilcblx0ICpcblx0ICogQHBhcmFtIHtDb21wb25lbnR9IGNvbXBvbmVudFxuXHQgKi9cblx0ZmxhZ0JvdW5kRXZlbnRzOiBmdW5jdGlvbiAoIGNvbXBvbmVudCApIHtcblxuXHRcdC8vIFRPRE86IHByb3ZpZGUgYWNjZXNzIHRvIGJvdW5kIGdsb2JhbCBldmVudHMgKCUpIGFuZCByb3V0ZXMgKCMpIGFzIHdlbGxcblx0XHQvLyBUT0RPOiBmbGFnIGFsbCBET00gZXZlbnRzLCBub3QganVzdCBjbGljayBhbmQgdG91Y2hcblxuXHRcdC8vIEJ1aWxkIHN1YnNldCBvZiBqdXN0IHRoZSBjbGljay90b3VjaCBldmVudHNcblx0XHR2YXIgY2xpY2tPclRvdWNoRXZlbnRzID0gRXZlbnRzLnBhcnNlKFxuXHRcdFx0Y29tcG9uZW50LmV2ZW50cyxcblx0XHRcdHsgb25seTogWydjbGljaycsICd0b3VjaCcsICd0b3VjaHN0YXJ0JywgJ3RvdWNoZW5kJ10gfVxuXHRcdCk7XG5cblx0XHQvLyBJZiBubyBjbGljay90b3VjaCBldmVudHMgZm91bmQsIGJhaWwgb3V0XG5cdFx0aWYgKCBjbGlja09yVG91Y2hFdmVudHMubGVuZ3RoIDwgMSApIHJldHVybjtcblxuXHRcdC8vIFF1ZXJ5IGFmZmVjdGVkIGVsZW1lbnRzIGZyb20gRE9NXG5cdFx0dmFyICRhZmZlY3RlZCA9IEV2ZW50cy5nZXRFbGVtZW50cyhjbGlja09yVG91Y2hFdmVudHMsIGNvbXBvbmVudCk7XG5cblx0XHQvLyBOT1RFOiBGb3Igbm93LCB0aGlzIGlzIGFsd2F5cyBqdXN0ICdjbGljaydcblx0XHR2YXIgYm91bmRFdmVudHNTdHJpbmcgPSAnY2xpY2snO1xuXG5cdFx0Ly8gU2V0IGBkYXRhLUZSQU1FV09SSy1jbGlja2FibGVgIGN1c3RvbSBhdHRyaWJ1dGVcblx0XHQvLyAodWkgbG9naWMgc2hvdWxkIGJlIGV4dGVuZGVkIGluIENTUylcblx0XHQkYWZmZWN0ZWQuYXR0cignZGF0YS0nICsgRlJBTUVXT1JLLm9wdGlvbnMuZnJhbWV3b3JrSWQgKyAnLWV2ZW50cycsIGJvdW5kRXZlbnRzU3RyaW5nKTtcblxuXHRcdEZSQU1FV09SSy52ZXJib3NlKFxuXHRcdFx0Y29tcG9uZW50LmlkICsgJyA6OiAnICtcblx0XHRcdCdEaXNhYmxlZCB1c2VyIHRleHQgc2VsZWN0aW9uIG9uIGVsZW1lbnRzIHcvIGNsaWNrL3RvdWNoIGV2ZW50czonLFxuXHRcdFx0Y2xpY2tPclRvdWNoRXZlbnRzLFxuXHRcdFx0JGFmZmVjdGVkXG5cdFx0KTtcblx0fVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBET007XG4iLCIvKipcbiAqIFV0aWxpdHkgRXZlbnQgdG9vbGtpdFxuICovXG5cbnZhciBVdGlscyA9IHJlcXVpcmUoJy4vdXRpbHMuanMnKTtcblxudmFyIEV2ZW50cyA9IHtcblxuXHQvKipcblx0ICogUGFyc2VzIGEgZGljdGlvbmFyeSBvZiBldmVudHMgYW5kIG9wdGlvbmFsbHkgZmlsdGVycyBieSB0aGUgZXZlbnQgdHlwZS4gSWYgdGhlIGV2ZW50XG5cdCAqXG5cdCAqIEBwYXJhbSAge09iamVjdH0gZXZlbnRzICBbQSBCYWNrYm9uZS5WaWV3IGV2ZW50cyBvYmplY3RdXG5cdCAqIEBwYXJhbSAge09iamVjdH0gb3B0aW9ucyBbT3B0aW9ucyBvYmplY3QgdGhhdCBhbGxvd3MgdXMgdG8gZmlsdGVyIHBhcnNpbmcgdG8gY2VydGFpbiBldmVudFxuXHQgKiAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWVzXVxuXHQgKlxuXHQgKiBAcmV0dXJuIHtBcnJheX0gICAgICAgICAgW0FycmF5IGNvbnRhaW5pbmcgcGFyc2VkRXZlbnRzIHRoYXQgYXJlIG1hdGNoaW5nIGV2ZW50IGtleXNdXG5cdCAqL1xuXHRwYXJzZTogZnVuY3Rpb24gKGV2ZW50cywgb3B0aW9ucykge1xuXG5cdFx0dmFyIGV2ZW50S2V5cyA9IF8ua2V5cyhldmVudHMgfHwge30pLFxuXHRcdFx0bGltaXRFdmVudHMsXG5cdFx0XHRwYXJzZWRFdmVudHMgPSBbXTtcblxuXHRcdC8vIE9wdGlvbmFsbHkgZmlsdGVyIHVzaW5nIHNldCBvZiBhY2NlcHRhYmxlIGV2ZW50IHR5cGVzXG5cdFx0bGltaXRFdmVudHMgPSBvcHRpb25zLm9ubHk7XG5cdFx0ZXZlbnRLZXlzID0gXy5maWx0ZXIoZXZlbnRLZXlzLCBmdW5jdGlvbiBjaGVja0V2ZW50TmFtZSAoZXZlbnRLZXkpIHtcblxuXHRcdFx0Ly8gUGFyc2UgZXZlbnQgc3RyaW5nIGludG8gc2VtYW50aWMgcmVwcmVzZW50YXRpb25cblx0XHRcdHZhciBldmVudCA9IEV2ZW50cy5wYXJzZURPTUV2ZW50KGV2ZW50S2V5KTtcblx0XHRcdHBhcnNlZEV2ZW50cy5wdXNoKGV2ZW50KTtcblxuXHRcdFx0Ly8gT3B0aW9uYWwgZmlsdGVyXG5cdFx0XHRpZiAobGltaXRFdmVudHMpIHtcblx0XHRcdFx0cmV0dXJuIF8uY29udGFpbnMobGltaXRFdmVudHMsIGV2ZW50Lm5hbWUpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gcGFyc2VkRXZlbnRzO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBbZ2V0RWxlbWVudHMgZGVzY3JpcHRpb25dXG5cdCAqXG5cdCAqIEBwYXJhbSAge0FycmF5fSBzZW1hbnRpY0V2ZW50cyBbQSBsaXN0IG9mIHBhcnNlZCBldmVudCBvYmplY3RzXVxuXHQgKiBAcGFyYW0gIHtDb21wb25lbnR9IGNvbnRleHQgICAgW0luc3RhbmNlIG9mIGEgY29tcG9uZW50IHRvIHVzZSBhcyBhIHN0YXJ0aW5nIHBvaW50IGZvclxuXHQgKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoZSBET00gcXVlcmllc11cblx0ICpcblx0ICogQHJldHVybiB7QXJyYXl9ICAgICAgICAgICAgICAgIFtBbiBhcnJheSBvZiBqUXVlcnkgc2V0IG9mIG1hdGNoZWQgZWxlbWVudHNdXG5cdCAqL1xuXHRnZXRFbGVtZW50czogZnVuY3Rpb24gKHNlbWFudGljRXZlbnRzLCBjb250ZXh0KSB7XG5cblx0XHQvLyBDb250ZXh0IG9wdGlvbmFsXG5cdFx0Y29udGV4dCA9IGNvbnRleHQgfHwgeyAkOiAkIH07XG5cblx0XHQvLyBJdGVyYXRpdmVseSBidWlsZCBhIHNldCBvZiBhZmZlY3RlZCBlbGVtZW50c1xuXHRcdHZhciAkYWZmZWN0ZWQgPSAkKCk7XG5cdFx0Xy5lYWNoKHNlbWFudGljRXZlbnRzLCBmdW5jdGlvbiBsb29rdXBFbGVtZW50c0ZvckV2ZW50IChldmVudCkge1xuXG5cdFx0XHQvLyBEZXRlcm1pbmUgbWF0Y2hlZCBlbGVtZW50c1xuXHRcdFx0Ly8gVXNlIGRlbGVnYXRlIHNlbGVjdG9yIGlmIHNwZWNpZmllZFxuXHRcdFx0Ly8gT3RoZXJ3aXNlLCBncmFiIHRoZSBlbGVtZW50IGZvciB0aGlzIGNvbXBvbmVudFxuXHRcdFx0dmFyICRtYXRjaGVkID1cdGV2ZW50LnNlbGVjdG9yID9cblx0XHRcdFx0XHRcdFx0Y29udGV4dC4kKGV2ZW50LnNlbGVjdG9yKSA6XG5cdFx0XHRcdFx0XHRcdGNvbnRleHQuJGVsO1xuXG5cdFx0XHQvLyBBZGQgbWF0Y2hlZCBlbGVtZW50cyB0byBzZXRcblx0XHRcdCRhZmZlY3RlZCA9ICRhZmZlY3RlZC5hZGQoICRtYXRjaGVkICk7XG5cdFx0fSwgdGhpcyk7XG5cblx0XHRyZXR1cm4gJGFmZmVjdGVkO1xuXHR9LFxuXG5cblxuXHQvKipcblx0ICogUmV0dXJucyB3aGV0aGVyIHRoZSBzcGVjaWZpZWQgZXZlbnQga2V5IG1hdGNoZXMgYSBET00gZXZlbnQuXG5cdCAqXG5cdCAqIEBwYXJhbSAge1N0cmluZ30ga2V5IFtLZXkgdG8gbWF0Y2ggYWdhaW5zdF1cblx0ICpcblx0ICogaWYgbm8gbWF0Y2ggaXMgZm91bmRcblx0ICogQHJldHVybiB7Qm9vbGVhbn0gXHRcdFtyZXR1cm4gYGZhbHNlYF1cblx0ICpcblx0ICogb3RoZXJ3aXNlXG5cdCAqIEByZXR1cm4ge09iamVjdH0gIFx0XHRbT2JqZWN0IGNvbnRhaW5pbmcgdGhlIGBuYW1lYCBvZiB0aGUgRE9NIGVsZW1lbnQgYW5kIHRoZSBgc2VsZWN0b3JgXVxuXHQgKi9cblx0cGFyc2VET01FdmVudDogXy5tZW1vaXplKGZ1bmN0aW9uKGtleSkge1xuXG5cdFx0dmFyIG1hdGNoZXMgPSBrZXkubWF0Y2godGhpc1snL0RPTUV2ZW50LyddKTtcblxuXHRcdGlmICghbWF0Y2hlcyB8fCAhbWF0Y2hlc1sxXSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRuYW1lOiBtYXRjaGVzWzFdLFxuXHRcdFx0c2VsZWN0b3I6IG1hdGNoZXNbM11cblx0XHR9O1xuXHR9KSxcblxuXG5cdC8qKlxuXHQgKiBTdXBwb3J0ZWQgXCJmaXJzdC1jbGFzc1wiIERPTSBldmVudHMuXG5cdCAqIEB0eXBlIHtBcnJheX1cblx0ICovXG5cdG5hbWVzOiBbXG5cblx0XHQvLyBMb2NhbGl6ZWQgYnJvd3NlciBldmVudHNcblx0XHQvLyAod29ya3Mgb24gaW5kaXZpZHVhbCBlbGVtZW50cylcblx0XHQnZXJyb3InLCAnc2Nyb2xsJyxcblxuXHRcdC8vIE1vdXNlIGV2ZW50c1xuXHRcdCdjbGljaycsICdkYmxjbGljaycsICdtb3VzZWRvd24nLCAnbW91c2V1cCcsICdob3ZlcicsICdtb3VzZWVudGVyJywgJ21vdXNlbGVhdmUnLFxuXHRcdCdtb3VzZW92ZXInLCAnbW91c2VvdXQnLCAnbW91c2Vtb3ZlJyxcblxuXHRcdC8vIEtleWJvYXJkIGV2ZW50c1xuXHRcdCdrZXlkb3duJywgJ2tleXVwJywgJ2tleXByZXNzJyxcblxuXHRcdC8vIEZvcm0gZXZlbnRzXG5cdFx0J2JsdXInLCAnY2hhbmdlJywgJ2ZvY3VzJywgJ2ZvY3VzaW4nLCAnZm9jdXNvdXQnLCAnc2VsZWN0JywgJ3N1Ym1pdCcsXG5cblx0XHQvLyBSYXcgdG91Y2ggZXZlbnRzXG5cdFx0J3RvdWNoc3RhcnQnLCAndG91Y2hlbmQnLCAndG91Y2htb3ZlJywgJ3RvdWNoY2FuY2VsJyxcblxuXHRcdC8vIE1hbnVmYWN0dXJlZCBldmVudHNcblx0XHQndG91Y2gnLFxuXG5cdFx0Ly8gVE9ETzpcblx0XHQncmlnaHRjbGljaycsICdjbGlja291dHNpZGUnXG5cdF1cbn07XG5cblxuXG5cbi8qKlxuICogUmVnZXhwIHRvIG1hdGNoIFwiZmlyc3QgY2xhc3NcIiBET00gZXZlbnRzXG4gKiAodGhlc2UgYXJlIGFsbG93ZWQgaW4gdGhlIHRvcCBsZXZlbCBvZiBhIGNvbXBvbmVudCBkZWZpbml0aW9uIGFzIG1ldGhvZCBrZXlzKVxuICpcdFx0aS5lLiAvXihjbGlja3xob3ZlcnxibHVyfGZvY3VzKSggKC4rKSkvXG4gKlx0XHRcdFsxXSA9PiBldmVudCBuYW1lXG4gKlx0XHRcdFszXSA9PiBzZWxlY3RvclxuICovXG5cbkV2ZW50c1snL0RPTUV2ZW50LyddID0gbmV3IFJlZ0V4cCgnXignICsgXy5yZWR1Y2UoRXZlbnRzLm5hbWVzLFxuXHRmdW5jdGlvbiBidWlsZFJlZ2V4cChtZW1vLCBldmVudE5hbWUsIGluZGV4KSB7XG5cblx0XHQvLyBPbWl0IGB8YCB0aGUgZmlyc3QgdGltZVxuXHRcdGlmIChpbmRleCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIG1lbW8gKyBldmVudE5hbWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG1lbW8gKyAnfCcgKyBldmVudE5hbWU7XG5cdH0sICcnKSArXG4nKSggKC4rKSk/JCcpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEV2ZW50cztcbiIsIi8qKlxuICogVHJhbnNsYXRlICoqcmlnaHQtaGFuZC1zaWRlIGFiYnJldmlhdGlvbnMqKiBpbnRvIGZ1bmN0aW9ucyB0aGF0IHBlcmZvcm1cbiAqIHRoZSBwcm9wZXIgYmVoYXZpb3JzLCBlLmcuXG4gKlx0XHQjYWJvdXRfbWVcbiAqXHRcdCVtYWluTWVudTpvcGVuXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB0cmFuc2xhdGVTaG9ydGhhbmQodmFsdWUsIGtleSkge1xuXG5cdHZhciBtYXRjaGVzLCBmbjtcblxuXHQvLyBJZiB0aGlzIGlzIGFuIGltcG9ydGFudCwgRlJBTUVXT1JLLXNwZWNpZmljIGRhdGEga2V5LFxuXHQvLyBhbmQgYSBmdW5jdGlvbiB3YXMgc3BlY2lmaWVkLCBydW4gaXQgdG8gZ2V0IGl0cyB2YWx1ZVxuXHQvLyAodGhpcyBpcyB0byBrZWVwIHBhcml0eSB3aXRoIEJhY2tib25lJ3Mgc2ltaWxhciBmdW5jdGlvbmFsaXR5KVxuXHRpZiAoXy5pc0Z1bmN0aW9uKHZhbHVlKSAmJiAoa2V5ID09PSAnY29sbGVjdGlvbicgfHwga2V5ID09PSAnbW9kZWwnKSkge1xuXHRcdHJldHVybiB2YWx1ZSgpO1xuXHR9XG5cblx0Ly8gSWdub3JlIG90aGVyIG5vbi1zdHJpbmdzXG5cdGlmICghXy5pc1N0cmluZyh2YWx1ZSkpIHtcblx0XHRyZXR1cm4gdmFsdWU7XG5cdH1cblxuXHQvLyBBbHNvIGlnbm9yZSBgdGVtcGxhdGVgXG5cdC8vIFRPRE86IHVzZSBhIGRpZmZlcmVudCBrZXkgbGF0ZXJcblx0aWYgKGtleSA9PT0gJ3RlbXBsYXRlJykgcmV0dXJuIHZhbHVlO1xuXG5cdC8vIEFsc28gaWdub3JlIHRoaW5ncyB0aGF0IHN0YXJ0IHdpdGggX1xuXHRpZiAoa2V5Lm1hdGNoKC9eXy8pKSByZXR1cm4gdmFsdWU7XG5cblxuXHQvLyBSZWRpcmVjdHMgdXNlciB0byBjbGllbnQtc2lkZSBVUkwsIHcvbyBhZmZlY3RpbmcgYnJvd3NlciBoaXN0b3J5XG5cdC8vIExpa2UgY2FsbGluZyBgQmFja2JvbmUuaGlzdG9yeS5uYXZpZ2F0ZSgnL2ZvbycsIHsgcmVwbGFjZTogdHJ1ZSB9KWBcblx0aWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14jIyguKlteLlxcc10pLykpICYmIG1hdGNoZXNbMV0pIHtcblx0XHRmbiA9IGZ1bmN0aW9uIHJlZGlyZWN0QW5kQ292ZXJUcmFja3MoKSB7XG5cdFx0XHR2YXIgdXJsID0gbWF0Y2hlc1sxXTtcblx0XHRcdEZSQU1FV09SSy5oaXN0b3J5Lm5hdmlnYXRlKHVybCwge1xuXHRcdFx0XHR0cmlnZ2VyOiB0cnVlLFxuXHRcdFx0XHRyZXBsYWNlOiB0cnVlXG5cdFx0XHR9KTtcblx0XHR9O1xuXHR9XG5cdC8vIE1ldGhvZCB0byByZWRpcmVjdCB1c2VyIHRvIGEgY2xpZW50LXNpZGUgVVJMLCB0aGVuIGNhbGwgdGhlIGhhbmRsZXJcblx0ZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXiMoLipbXi5cXHNdKykvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHRcdGZuID0gZnVuY3Rpb24gY2hhbmdlVXJsRnJhZ21lbnQoKSB7XG5cdFx0XHR2YXIgdXJsID0gbWF0Y2hlc1sxXTtcblx0XHRcdEZSQU1FV09SSy5oaXN0b3J5Lm5hdmlnYXRlKHVybCwge1xuXHRcdFx0XHR0cmlnZ2VyOiB0cnVlXG5cdFx0XHR9KTtcblx0XHR9O1xuXHR9XG5cdC8vIE1ldGhvZCB0byB0cmlnZ2VyIGdsb2JhbCBldmVudFxuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eKCUuKlteLlxcc10pLykpICYmIG1hdGNoZXNbMV0pIHtcblx0XHRmbiA9IGZ1bmN0aW9uIHRyaWdnZXJFdmVudCgpIHtcblx0XHRcdHZhciB0cmlnZ2VyID0gbWF0Y2hlc1sxXTtcblx0XHRcdEZSQU1FV09SSy52ZXJib3NlKHRoaXMuaWQgKyAnIDo6IFRyaWdnZXJpbmcgZXZlbnQgKCcgKyB0cmlnZ2VyICsgJykuLi4nKTtcblx0XHRcdEZSQU1FV09SSy50cmlnZ2VyKHRyaWdnZXIpO1xuXHRcdH07XG5cdH1cblx0Ly8gTWV0aG9kIHRvIGZpcmUgYSB0ZXN0IGFsZXJ0XG5cdC8vICh1c2UgbWVzc2FnZSwgaWYgc3BlY2lmaWVkKVxuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eISEhXFxzKiguKlteLlxcc10pPy8pKSkge1xuXHRcdGZuID0gZnVuY3Rpb24gYmFuZ0FsZXJ0KGUpIHtcblxuXHRcdFx0Ly8gSWYgc3BlY2lmaWVkLCBtZXNzYWdlIGlzIHVzZWQsIG90aGVyd2lzZSAnQWxlcnQgdHJpZ2dlcmVkISdcblx0XHRcdHZhciBtc2cgPSAobWF0Y2hlcyAmJiBtYXRjaGVzWzFdKSB8fCAnRGVidWcgYWxlcnQgKCEhISkgdHJpZ2dlcmVkISc7XG5cblx0XHRcdC8vIE90aGVyIGRpYWdub3N0aWMgaW5mb3JtYXRpb25cblx0XHRcdG1zZyArPSAnXFxuXFxuRGlhZ25vc3RpY3NcXG49PT09PT09PT09PT09PT09PT09PT09PT1cXG4nO1xuXHRcdFx0aWYgKGUgJiYgZS5jdXJyZW50VGFyZ2V0KSB7XG5cdFx0XHRcdG1zZyArPSAnZS5jdXJyZW50VGFyZ2V0IDo6ICcgKyBlLmN1cnJlbnRUYXJnZXQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5pZCkge1xuXHRcdFx0XHRtc2cgKz0gJ3RoaXMuaWQgOjogJyArIHRoaXMuaWQ7XG5cdFx0XHR9XG5cblx0XHRcdGFsZXJ0KG1zZyk7XG5cdFx0fTtcblx0fVxuXG5cdC8vIE1ldGhvZCB0byBsb2cgYSBtZXNzYWdlIHRvIHRoZSBjb25zb2xlXG5cdC8vICh1c2UgbWVzc2FnZSwgaWYgc3BlY2lmaWVkKVxuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9ePj4+XFxzKiguKlteLlxcc10pPy8pKSkge1xuXG5cdFx0Zm4gPSBmdW5jdGlvbiBsb2dNZXNzYWdlKGUpIHtcblxuXHRcdFx0Ly8gSWYgc3BlY2lmaWVkLCBtZXNzYWdlIGlzIHVzZWQsIG90aGVyd2lzZSB1c2UgZGVmYXVsdFxuXHRcdFx0dmFyIG1zZyA9IChtYXRjaGVzICYmIG1hdGNoZXNbMV0pIHx8ICdMb2cgbWVzc2FnZSAoPj4+KSB0cmlnZ2VyZWQhJztcblx0XHRcdEZSQU1FV09SSy5sb2cobXNnKTtcblx0XHR9O1xuXHR9XG5cblx0Ly8gTWV0aG9kIHRvIGF0dGFjaCB0aGUgc3BlY2lmaWVkIGNvbXBvbmVudC90ZW1wbGF0ZSB0byBhIHJlZ2lvblxuXHRlbHNlIGlmIChcblx0XHQoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXihbXi5cXHNdKylcXHMqPFxcLVxccyooLipbXi5cXHNdKS8pKSAmJiBtYXRjaGVzWzFdICYmIG1hdGNoZXNbMl0pIHx8XG5cdFx0KChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14oW14uXFxzXSspXFxzKlxcLT5cXHMqKC4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSAmJiBtYXRjaGVzWzJdICYmXG5cdFx0XHQobWF0Y2hlc1sndG1wJ10gPSBtYXRjaGVzWzFdKSAmJiAobWF0Y2hlc1sxXSA9IG1hdGNoZXNbMl0pICYmIChtYXRjaGVzWzJdID0gbWF0Y2hlc1sndG1wJ10pKVxuXHQpIHtcblx0XHRmbiA9IGZ1bmN0aW9uIGF0dGFjaFRlbXBsYXRlKCkge1xuXG5cdFx0XHQvLyBSZW1vdmUgYWxsIHdoaXRlc3BhY2UgZnJvbSBtYXRjaGVzXG5cdFx0XHRtYXRjaGVzWzFdID0gbWF0Y2hlc1sxXS5yZXBsYWNlKC8oXFxzKykvZywgJycpO1xuXHRcdFx0bWF0Y2hlc1syXSA9IG1hdGNoZXNbMl0ucmVwbGFjZSgvKFxccyspL2csICcnKTtcblxuXHRcdFx0dmFyIHJlZ2lvbiA9IG1hdGNoZXNbMV07XG5cdFx0XHR2YXIgdGVtcGxhdGUgPSBtYXRjaGVzWzJdO1xuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UodGhpcy5pZCArICcgOjogQXR0YWNoaW5nIGAnICsgdGVtcGxhdGUgKyAnYCB0byBgJyArIHJlZ2lvbiArICdgLi4uJyk7XG5cblxuXHRcdFx0aWYgKCF0aGlzW3JlZ2lvbl0pIHtcblx0XHRcdFx0RlJBTUVXT1JLLmVycm9yKHRoaXMuaWQsJzo6IFRyeWluZyB0byBhdHRhY2ggcmVnaW9uIHdpdGggc2hvcnRoYW5kICgnK3ZhbHVlKycpLCBidXQgY291bGQgbm90IGZpbmQgcmVnaW9uIGAnK3JlZ2lvbisnYCcpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzW3JlZ2lvbl0uYXR0YWNoKHRlbXBsYXRlKTtcblx0XHR9O1xuXHR9XG5cblxuXHQvLyBNZXRob2QgdG8gdG9nZ2xlICghKSB0aGUgc3BlY2lmaWVkIG1vZGVsIGF0dHJcblx0ZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXlxcIVxccypcXEAoLipbXi5cXHNdKS8pKSAmJiBtYXRjaGVzWzFdKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiB0b2dnbGVBdHRyKCkge1xuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UodGhpcy5pZCArICcgOjogVG9nZ2xpbmcgYXR0ciAoJyArIG1hdGNoZXNbMV0gKyAnKS4uLicpO1xuXHRcdFx0dmFyIG9sZEF0dHJWYWx1ZSA9IHRoaXMubW9kZWwuZ2V0KCBtYXRjaGVzWzFdICk7XG5cblx0XHRcdGlmIChvbGRBdHRyVmFsdWUpIHtcblx0XHRcdFx0dGhpcy5tb2RlbC5zZXQoIG1hdGNoZXNbMV0sIGZhbHNlICk7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0dGhpcy5tb2RlbC5zZXQoIG1hdGNoZXNbMV0sIHRydWUgKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0Ly8gTWV0aG9kIHRvIGNoYW5nZSB0aGUgc3BlY2lmaWVkIG1vZGVsIGF0dHJcblx0ZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXlxccypcXEAoW149XSspPShbXj1dKilcXHMqJC8pKSkge1xuXG5cdFx0dmFyIGF0dHJOYW1lID0gbWF0Y2hlc1sxXTtcblx0XHR2YXIgbmV3QXR0clZhbHVlID0gbWF0Y2hlc1syXTtcblxuXHRcdGZuID0gZnVuY3Rpb24gY2hhbmdlQXR0cigpIHtcblx0XHRcdHRoaXMubW9kZWwuc2V0KGF0dHJOYW1lLCBuZXdBdHRyVmFsdWUpO1xuXHRcdH07XG5cdH1cblxuXHQvLyBNZXRob2QgdG8gcmVtb3ZlIHRoZSBtb2RlbCBmb3IgdGhlIGN1cnJlbnQgY29tcG9uZW50XG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL15cXHMqXFwtXFxzKiQvKSkpIHtcblx0XHRmbiA9IGZ1bmN0aW9uIHJlbW92ZU1vZGVsICgpIHtcblxuXHRcdFx0Ly8gT25seSB3b3JrcyBpZiBtb2RlbCBiZWxvbmdzIHRvIGEgY29sbGVjdGlvblxuXHRcdFx0aWYgKCF0aGlzLm1vZGVsLmNvbGxlY3Rpb24pIHJldHVybjtcblxuXHRcdFx0dGhpcy5tb2RlbC5jb2xsZWN0aW9uLnJlbW92ZSh0aGlzLm1vZGVsKTtcblx0XHR9O1xuXHR9XG5cblxuXHQvLyBkZXByZWNhdGluZyBjbGFzcyBtYW5pcHVsYXRpb24gc2hvcnRoYW5kXG5cdC8vIChubyBuZWVkIHRvIGRvIGRvbSBtYW5pcHVsYXRpb24gdW5sZXNzIGFic29sdXRlbHkgbmVjZXNzYXJ5KVxuXG5cdC8vIC8vIE1ldGhvZCB0byBhZGQgdGhlIHNwZWNpZmllZCBjbGFzc1xuXHQvLyBlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eXFwrXFxzKlxcLiguKlteLlxcc10pLykpICYmIG1hdGNoZXNbMV0pIHtcblx0Ly8gXHRmbiA9IGZ1bmN0aW9uIGFkZENsYXNzKCkge1xuXHQvLyBcdFx0RlJBTUVXT1JLLnZlcmJvc2UodGhpcy5pZCArICcgOjogQWRkaW5nIGNsYXNzICgnICsgbWF0Y2hlc1sxXSArICcpLi4uJyk7XG5cdC8vIFx0XHR0aGlzLiRlbC5hZGRDbGFzcyhtYXRjaGVzWzFdKTtcblx0Ly8gXHR9O1xuXHQvLyB9XG5cdC8vIC8vIE1ldGhvZCB0byByZW1vdmUgdGhlIHNwZWNpZmllZCBjbGFzc1xuXHQvLyBlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eXFwtXFxzKlxcLiguKlteLlxcc10pLykpICYmIG1hdGNoZXNbMV0pIHtcblx0Ly8gXHRmbiA9IGZ1bmN0aW9uIHJlbW92ZUNsYXNzKCkge1xuXHQvLyBcdFx0RlJBTUVXT1JLLnZlcmJvc2UodGhpcy5pZCArICcgOjogUmVtb3ZpbmcgY2xhc3MgKCcgKyBtYXRjaGVzWzFdICsgJykuLi4nKTtcblx0Ly8gXHRcdHRoaXMuJGVsLnJlbW92ZUNsYXNzKG1hdGNoZXNbMV0pO1xuXHQvLyBcdH07XG5cdC8vIH1cblx0Ly8gLy8gTWV0aG9kIHRvIHRvZ2dsZSB0aGUgc3BlY2lmaWVkIGNsYXNzXG5cdC8vIGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL15cXCFcXHMqXFwuKC4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHQvLyBcdGZuID0gZnVuY3Rpb24gdG9nZ2xlQ2xhc3MoKSB7XG5cdC8vIFx0XHRGUkFNRVdPUksudmVyYm9zZSh0aGlzLmlkICsgJyA6OiBUb2dnbGluZyBjbGFzcyAoJyArIG1hdGNoZXNbMV0gKyAnKS4uLicpO1xuXHQvLyBcdFx0dGhpcy4kZWwudG9nZ2xlQ2xhc3MobWF0Y2hlc1sxXSk7XG5cdC8vIFx0fTtcblx0Ly8gfVxuXG5cdC8vIFRPRE86XHRhbGxvdyBkZXNjZW5kYW50cyB0byBiZSBjb250cm9sbGVkIHZpYSBzaG9ydGhhbmRcblx0Ly9cdFx0XHRlLmcuIDogJ2xpLnJvdyAtLmhpZ2hsaWdodGVkJ1xuXHQvL1x0XHRcdHdvdWxkIHJlbW92ZSB0aGUgYGhpZ2hsaWdodGVkYCBjbGFzcyBmcm9tIHRoaXMuJCgnbGkucm93JylcblxuXG5cdC8vIElmIHNob3J0LWhhbmQgbWF0Y2hlZCwgcmV0dXJuIHRoZSBkZXJlZmVyZW5jZWQgZnVuY3Rpb25cblx0aWYgKGZuKSB7XG5cblx0XHRGUkFNRVdPUksudmVyYm9zZSgnSW50ZXJwcmV0aW5nIG1lYW5pbmcgZnJvbSBzaG9ydGhhbmQgOjogYCcgKyB2YWx1ZSArICdgLi4uJyk7XG5cblx0XHQvLyBDdXJyeSB0aGUgcmVzdWx0IGZ1bmN0aW9uIHdpdGggYW55IHN1ZmZpeCBtYXRjaGVzXG5cdFx0dmFyIGN1cnJpZWRGbiA9IGZuO1xuXG5cdFx0Ly8gVHJhaWxpbmcgYC5gIGluZGljYXRlcyBhbiBlLnN0b3BQcm9wYWdhdGlvbigpXG5cdFx0aWYgKHZhbHVlLm1hdGNoKC9cXC5cXHMqJC8pKSB7XG5cdFx0XHRjdXJyaWVkRm4gPSBmdW5jdGlvbiBhbmRTdG9wUHJvcGFnYXRpb24oZSkge1xuXG5cdFx0XHRcdC8vIEJpbmQgKHNvIGl0IGluaGVyaXRzIGNvbXBvbmVudCBjb250ZXh0KSBhbmQgY2FsbCBpbnRlcmlvciBmdW5jdGlvblxuXHRcdFx0XHRmbi5hcHBseSh0aGlzKTtcblxuXHRcdFx0XHQvLyB0aGVuIGltbWVkaWF0ZWx5IHN0b3AgZXZlbnQgYnViYmxpbmcvcHJvcGFnYXRpb25cblx0XHRcdFx0aWYgKGUgJiYgZS5zdG9wUHJvcGFnYXRpb24pIHtcblx0XHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdEZSQU1FV09SSy53YXJuKFxuXHRcdFx0XHRcdFx0dGhpcy5pZCArICcgOjogVHJhaWxpbmcgYC5gIHNob3J0aGFuZCB3YXMgdXNlZCB0byBpbnZva2UgYW4gJyArXG5cdFx0XHRcdFx0XHQnZS5zdG9wUHJvcGFnYXRpb24oKSwgYnV0IFwiJyArIHZhbHVlICsgJ1wiIHdhcyBub3QgdHJpZ2dlcmVkIGJ5IGEgRE9NIGV2ZW50IVxcbicgK1xuXHRcdFx0XHRcdFx0J1Byb2JhYmx5IGJlc3QgdG8gZG91YmxlLWNoZWNrIHRoaXMgd2FzIHdoYXQgeW91IG1lYW50IHRvIGRvLicpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiBjdXJyaWVkRm47XG5cdH1cblxuXG5cdC8vIE90aGVyd2lzZSwgaWYgbm8gc2hvcnQtaGFuZCBtYXRjaGVkLCBwYXNzIHRoZSBvcmlnaW5hbCB2YWx1ZVxuXHQvLyBzdHJhaWdodCB0aHJvdWdoXG5cdHJldHVybiB2YWx1ZTtcbn07XG4iLCIvKipcbiAqIFV0aWxpdHkgZnVuY3Rpb25zIHRoYXQgYXJlIHVzZWQgdGhyb3VnaG91dCB0aGUgY29yZS5cbiAqL1xuXG52YXIgVXRpbHMgPSB7XG5cblx0LyoqXG5cdCAqIEdyYWJzIHRoZSBNYXN0IGlkZW50aWZpZXIgZnJvbSBhbiBIVE1MIGVsZW1lbnQuXG5cdCAqIFN1cHBvcnRzIGBpZGAsIGBkYXRhLWlkYCwgb3IgYGRhdGEtcmVnaW9uYFxuXHQgKlxuXHQgKiBAcGFyYW0gIHtET01FbGVtZW50fSBlbCAgICBbdGhlIERPTSBlbGVtZW50IHRvIGluc3BlY3RdXG5cdCAqIEBwYXJhbSAge0Jvb2xlYW59IHJlcXVpcmVkIFt3aGV0aGVyIGFuIGlkZW50aWZpZXIgaXMgcmVxdWlyZWRdXG5cdCAqXG5cdCAqIEByZXR1cm4ge1N0cmluZ30gICAgICAgICAgIFtpZGVudGlmaWVyXVxuXHQgKi9cblx0ZWwyaWQ6IGZ1bmN0aW9uKGVsLCByZXF1aXJlZCkge1xuXG5cdFx0dmFyIGlkID0gJChlbCkuYXR0cignaWQnKTtcblx0XHR2YXIgZGF0YUlkID0gJChlbCkuYXR0cignZGF0YS1pZCcpIHx8ICQoZWwpLmF0dHIoJ2RhdGEtcmVnaW9uJyk7XG5cdFx0dmFyIGNvbnRlbnRzSWQgPSAkKGVsKS5hdHRyKCdjb250ZW50cycpO1xuXG5cdFx0aWYgKGlkICYmIGRhdGFJZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGlkICsgJyA6OiBDYW5ub3Qgc2V0IGJvdGggYGlkYCBhbmQgYGRhdGEtaWRgISAgUGxlYXNlIHVzZSBvbmUgb3IgdGhlIG90aGVyLiAgKGRhdGEtaWQgaXMgc2FmZXN0KScpO1xuXHRcdH1cblx0XHRpZiAocmVxdWlyZWQgJiYgIWlkICYmICFkYXRhSWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTm8gaWQgc3BlY2lmaWVkIGluIGVsZW1lbnQgd2hlcmUgaXQgaXMgcmVxdWlyZWQ6XFxuJyArIGVsKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gaWQgfHwgZGF0YUlkIHx8IGNvbnRlbnRzSWQ7XG5cdH0sXG5cblx0LyoqXG5cdCAqIE1hcCBhbiBvYmplY3QncyB2YWx1ZXMsIGFuZCByZXR1cm4gYSB2YWxpZCBvYmplY3QgKHRoaXMgZnVuY3Rpb24gaXMgaGFuZHkgYmVjYXVzZVxuXHQgKiB1bmRlcnNjb3JlLm1hcCgpIHJldHVybnMgYSBsaXN0LCBub3QgYW4gb2JqZWN0Lilcblx0ICpcblx0ICogQHBhcmFtIHtPYmplY3R9IG9iaiAgICAgICAgICAgIFtPYmplY3Qgd2hvcyB2YWx1ZXMgeW91IHdhbnQgdG8gbWFwXVxuXHQgKiBAcGFyYW0gIHtGdW5jdGlvbn0gdHJhbnNmb3JtRm4gW0Z1bmN0aW9uIHRvIHRyYW5zZm9ybSBlYWNoIG9iamVjdCB2YWx1ZSBieV1cblx0ICpcblx0ICogQHJldHVybiB7T2JqZWN0fSAgICAgICAgICAgICAgICBbTmV3IG9iamVjdCB3aXRoIHRoZSB2YWx1ZXMgbWFwcGVkXVxuXHQgKi9cblx0b2JqTWFwOiBmdW5jdGlvbiBvYmpNYXAob2JqLCB0cmFuc2Zvcm1Gbikge1xuXHRcdHJldHVybiBfLm9iamVjdChfLmtleXMob2JqKSwgXy5tYXAob2JqLCB0cmFuc2Zvcm1GbikpO1xuXHR9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFV0aWxzO1xuIl19
(12)
});
;