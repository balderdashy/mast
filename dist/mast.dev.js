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

},{"../utils/events":30,"../utils/objMap":31,"../utils/shorthand":32}],16:[function(require,module,exports){
/**
 * Collect any regions with the default component set from the DOM.
 */

module.exports = function collectRegions () {

	$('region[default],region[template],[data-region][default],[data-region][template]').each(function() {
		$e = $(this);

		// Provide backwards compatibility for legacy notation
		// (normalize to `template`)
		var componentId = $e.attr('default') || $e.attr('contents');
		$e.attr('template', componentId);


		//
		// TODO:
		// allow embedded templates to be named this way, e.g. `<region template="Foo"></region>`
		// (should be very easy)
		//


		// Now instantiate the appropriate default component in each
		// region with a specified template/component
		FRAMEWORK.Region.fromElement(this);
	});

};

},{}],17:[function(require,module,exports){
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

},{"../utils/el2MastID":29}],18:[function(require,module,exports){
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

},{"../define/buildDefinition":10,"../logger/index":13,"../router/index":27,"./buildPrototype":15,"./collectRegions":16,"./collectTemplatesFromScriptTags":17}],19:[function(require,module,exports){
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
var el2MastID = require('../utils/el2MastID');



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

	var $el = $(el);

	// Build region
	var region = new FRAMEWORK.Region({
		id: el2MastID(el),
		$el: $el,
		parent: parent
	});

	// If this region has a default component/template set,
	// grab the id  --  e.g. <region template="Foo" />
	var componentId = $el.attr('template') || $el.attr('default') || $el.attr('contents');


	// If `template` shortcut is enabled, append specified sub-component(s)
	// to the region automatically
	if ( FRAMEWORK.options.shortcut.template && componentId ) {

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

	return region;
};

},{"../utils/el2MastID":29}],23:[function(require,module,exports){
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

},{"./events":30}],29:[function(require,module,exports){
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

},{}],30:[function(require,module,exports){
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

},{}],31:[function(require,module,exports){
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


},{}],32:[function(require,module,exports){
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

},{}]},{},[12])
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L2JpbmRFdmVudHMuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L2Nsb3NlLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2NvbXBvbmVudC9oZWxwZXJzLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2NvbXBvbmVudC9pbmRleC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9jb21wb25lbnQvbGlmZWN5Y2xlRXZlbnRzLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2NvbXBvbmVudC9saWZlY3ljbGVIb29rcy5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9jb21wb25lbnQvcmVuZGVyLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2NvbXBvbmVudC9yZW5kZXJDb2xsZWN0aW9uLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2NvbXBvbmVudC92YWxpZGF0ZURlZmluaXRpb24uanMiLCIvY29kZS9vc3MvbWFzdC9saWIvZGVmaW5lL2J1aWxkRGVmaW5pdGlvbi5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9kZWZpbmUvaW5kZXguanMiLCIvY29kZS9vc3MvbWFzdC9saWIvaW5kZXguanMiLCIvY29kZS9vc3MvbWFzdC9saWIvbG9nZ2VyL2luZGV4LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2xvZ2dlci9zZXR1cC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9yYWlzZS9idWlsZFByb3RvdHlwZS5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9yYWlzZS9jb2xsZWN0UmVnaW9ucy5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9yYWlzZS9jb2xsZWN0VGVtcGxhdGVzRnJvbVNjcmlwdFRhZ3MuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvcmFpc2UvaW5kZXguanMiLCIvY29kZS9vc3MvbWFzdC9saWIvcmVnaW9uL2FwcGVuZC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9yZWdpb24vYXR0YWNoLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3JlZ2lvbi9lbXB0eS5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9yZWdpb24vZnJvbUVsZW1lbnQuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvcmVnaW9uL2luZGV4LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3JlZ2lvbi9pbnNlcnQuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvcmVnaW9uL3ByZXBlbmQuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvcmVnaW9uL3JlbW92ZS5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9yb3V0ZXIvaW5kZXguanMiLCIvY29kZS9vc3MvbWFzdC9saWIvdXRpbHMvRE9NLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3V0aWxzL2VsMk1hc3RJRC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi91dGlscy9ldmVudHMuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvdXRpbHMvb2JqTWFwLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3V0aWxzL3Nob3J0aGFuZC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9ZQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL05BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNaQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNaQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzXG4gKi9cbnZhciBoZWxwZXJzID0gcmVxdWlyZSgnLi9oZWxwZXJzJyk7XG5cblxuLyoqXG4gKiBCaW5kIGNvbGxlY3Rpb24gZXZlbnRzIHRvIGxpZmVjeWNsZSBldmVudCBoYW5kbGVyc1xuICovXG5leHBvcnRzLmNvbGxlY3Rpb25FdmVudHMgPSBmdW5jdGlvbigpIHtcblx0Ly8gQmluZCB0byBjb2xsZWN0aW9uIGV2ZW50cyBpZiBvbmUgd2FzIHBhc3NlZCBpblxuXHRpZiAodGhpcy5jb2xsZWN0aW9uKSB7XG5cblx0XHQvLyBMaXN0ZW4gdG8gZXZlbnRzXG5cdFx0dGhpcy5saXN0ZW5Ubyh0aGlzLmNvbGxlY3Rpb24sICdhZGQnLCB0aGlzLmFmdGVyQWRkKTtcblx0XHR0aGlzLmxpc3RlblRvKHRoaXMuY29sbGVjdGlvbiwgJ3JlbW92ZScsIHRoaXMuYWZ0ZXJSZW1vdmUpO1xuXHRcdHRoaXMubGlzdGVuVG8odGhpcy5jb2xsZWN0aW9uLCAncmVzZXQnLCB0aGlzLmFmdGVyUmVzZXQpO1xuXHR9XG59O1xuXG4vKipcbiAqIEJpbmQgbW9kZWwgZXZlbnRzIHRvIGxpZmVjeWNsZSBldmVudCBoYW5kbGVycyBhbmQgYWxzbyBhbGxvd3MgZm9yIGhhbmRsZXJzIHRvIGZpcmVcbiAqIG9uIGNlcnRhaW4gbW9kZWwgYXR0cmlidXRlIGNoYW5nZXMuXG4gKi9cbmV4cG9ydHMubW9kZWxFdmVudHMgPSBmdW5jdGlvbigpIHtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdGlmICh0aGlzLm1vZGVsKSB7XG5cblx0XHQvLyBMaXN0ZW4gZm9yIGFueSBhdHRyaWJ1dGUgY2hhbmdlc1xuXHRcdC8vIGUuZy5cblx0XHQvLyAuYWZ0ZXJDaGFuZ2UobW9kZWwsIG9wdGlvbnMpXG5cdFx0Ly9cblx0XHR0aGlzLmxpc3RlblRvKHRoaXMubW9kZWwsICdjaGFuZ2UnLCBmdW5jdGlvbiBtb2RlbENoYW5nZWQgKG1vZGVsLCBvcHRpb25zKSB7XG5cblx0XHRcdC8vIEFwcGx5IGRhdGEgYmluZGluZ3Ncblx0XHRcdGhlbHBlcnMucmVuZGVyRGF0YUJpbmRpbmdzLmNhbGwoc2VsZik7XG5cblx0XHRcdC8vIFJ1biBjdXN0b20gYGFmdGVyQ2hhbmdlYCgpIG1ldGhvZFxuXHRcdFx0aWYgKF8uaXNGdW5jdGlvbih0aGlzLmFmdGVyQ2hhbmdlKSkge1xuXHRcdFx0XHR0aGlzLmFmdGVyQ2hhbmdlKG1vZGVsLCBvcHRpb25zKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIExpc3RlbiBmb3Igc3BlY2lmaWMgYXR0cmlidXRlIGNoYW5nZXNcblx0XHQvLyBlLmcuXG5cdFx0Ly8gLmFmdGVyQ2hhbmdlLmNvbG9yKG1vZGVsLCB2YWx1ZSwgb3B0aW9ucylcblx0XHRpZiAoXy5pc09iamVjdCh0aGlzLmFmdGVyQ2hhbmdlKSkge1xuXHRcdFx0Xy5lYWNoKHRoaXMuYWZ0ZXJDaGFuZ2UsIGZ1bmN0aW9uIChoYW5kbGVyLCBhdHRyTmFtZSkge1xuXG5cdFx0XHRcdC8vIENhbGwgaGFuZGxlciB3aXRoIG5ld1ZhbCB0byBrZWVwIGFyZ3VtZW50cyBzdHJhaWdodGZvcndhcmRcblx0XHRcdFx0dGhpcy5saXN0ZW5Ubyh0aGlzLm1vZGVsLCAnY2hhbmdlOicgKyBhdHRyTmFtZSwgZnVuY3Rpb24gYXR0ckNoYW5nZWQgKG1vZGVsLCBuZXdWYWwpIHtcblx0XHRcdFx0XHRoYW5kbGVyLmNhbGwodGhpcywgbmV3VmFsKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdH0sIHRoaXMpO1xuXHRcdH1cblx0fVxufTtcblxuLyoqXG4gKiBMaXN0ZW5zIGZvciBhbmQgcnVucyBoYW5kbGVycyBvbiBnbG9iYWwgZXZlbnRzIHRoYXQgYXJlIGxpc3RlbmVkIGZvciBvbiBhIGNvbXBvbmVudC5cbiAqL1xuZXhwb3J0cy5nbG9iYWxUcmlnZ2VycyA9IGZ1bmN0aW9uKCkge1xuXG5cdHZhciBzZWxmID0gdGhpcztcblxuXHR0aGlzLmxpc3RlblRvKEZSQU1FV09SSywgJ2FsbCcsIGZ1bmN0aW9uIChlUm91dGUpIHtcblxuXHRcdC8vIFRyaW0gb2ZmIGFsbCBidXQgdGhlIGZpcnN0IGFyZ3VtZW50IHRvIHBhc3MgdGhyb3VnaCB0byBoYW5kbGVyXG5cdFx0dmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuXHRcdGFyZ3Muc2hpZnQoKTtcblxuXHRcdC8vIEl0ZXJhdGUgdGhyb3VnaCBlYWNoIHN1YnNjcmlwdGlvbiBvbiB0aGlzIGNvbXBvbmVudFxuXHRcdC8vIGFuZCBsaXN0ZW4gZm9yIHRoZSBzcGVjaWZpZWQgZ2xvYmFsIGV2ZW50c1xuXHRcdF8uZWFjaChzZWxmLnN1YnNjcmlwdGlvbnMsIGZ1bmN0aW9uKGhhbmRsZXIsIG1hdGNoUGF0dGVybikge1xuXG5cdFx0XHQvLyBHcmFiIHJlZ2V4IGFuZCBwYXJhbSBwYXJzaW5nIGxvZ2ljIGZyb20gQmFja2JvbmUgY29yZVxuXHRcdFx0dmFyIGV4dHJhY3RQYXJhbXMgPSBCYWNrYm9uZS5Sb3V0ZXIucHJvdG90eXBlLl9leHRyYWN0UGFyYW1ldGVycyxcblx0XHRcdFx0Y2FsY3VsYXRlUmVnZXggPSBCYWNrYm9uZS5Sb3V0ZXIucHJvdG90eXBlLl9yb3V0ZVRvUmVnRXhwO1xuXG5cdFx0XHQvLyBUcmltIHRyYWlsaW5nXG5cdFx0XHRtYXRjaFBhdHRlcm4gPSBtYXRjaFBhdHRlcm4ucmVwbGFjZSgvXFwvKiQvZywgJycpO1xuXHRcdFx0Ly8gYW5kIGVyIHNvcnQgb2YuLiBsZWFkaW5nLi4gc2xhc2hlc1xuXHRcdFx0bWF0Y2hQYXR0ZXJuID0gbWF0Y2hQYXR0ZXJuLnJlcGxhY2UoL14oWyN+JV0pXFwvKi9nLCAnJDEnKTtcblx0XHRcdC8vIFRPRE86IG9wdGltaXphdGlvbi0gdGhpcyByZWFsbHkgb25seSBoYXMgdG8gYmUgZG9uZSBvbmNlLCBvbiByYWlzZSgpLCB3ZSBzaG91bGQgZG8gdGhhdFxuXG5cblx0XHRcdC8vIENvbWUgdXAgd2l0aCByZWdleCBmb3IgdGhpcyBtYXRjaFBhdHRlcm5cblx0XHRcdHZhciByZWdleCA9IGNhbGN1bGF0ZVJlZ2V4KG1hdGNoUGF0dGVybik7XG5cblx0XHRcdC8vIElmIHRoaXMgbWF0Y2hQYXRlcm4gaXMgdGhpcyBpcyBub3QgYSBtYXRjaCBmb3IgdGhlIGV2ZW50LFxuXHRcdFx0Ly8gYGNvbnRpbnVlYCBpdCBhbG9uZyB0byBpdCBjYW4gdHJ5IHRoZSBuZXh0IG1hdGNoUGF0dGVyblxuXHRcdFx0aWYgKCFlUm91dGUubWF0Y2gocmVnZXgpKSByZXR1cm47XG5cblx0XHRcdC8vIFBhcnNlIHBhcmFtZXRlcnMgZm9yIHVzZSBhcyBhcmdzIHRvIHRoZSBoYW5kbGVyXG5cdFx0XHQvLyAob3IgYW4gZW1wdHkgbGlzdCBpZiBub25lIGV4aXN0KVxuXHRcdFx0dmFyIHBhcmFtcyA9IGV4dHJhY3RQYXJhbXMocmVnZXgsIGVSb3V0ZSk7XG5cblx0XHRcdC8vIEhhbmRsZSBzdHJpbmcgcmVkaXJlY3RzIHRvIGZ1bmN0aW9uIG5hbWVzXG5cdFx0XHRpZiAoIV8uaXNGdW5jdGlvbihoYW5kbGVyKSkge1xuXHRcdFx0XHRoYW5kbGVyID0gc2VsZltoYW5kbGVyXTtcblxuXHRcdFx0XHRpZiAoIWhhbmRsZXIpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCB0cmlnZ2VyIHN1YnNjcmlwdGlvbiBiZWNhdXNlIG9mIHVua25vd24gaGFuZGxlcjogJyArIGhhbmRsZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIEJpbmQgY29udGV4dCBhbmQgYXJndW1lbnRzIHRvIHN1YnNjcmlwdGlvbiBoYW5kbGVyXG5cdFx0XHRoYW5kbGVyLmFwcGx5KHNlbGYsIF8udW5pb24oYXJncywgcGFyYW1zKSk7XG5cblx0XHR9KTtcblx0fSk7XG59O1xuIiwiLyoqXG4gKiBTYWZlbHkgemFwIGV2ZXJ5IHRyYWNlIGFib3V0IHRoaXMgY29tcG9uZW50IGZyb20gbWVtb3J5LlxuICovXG5cbnZhciBoZWxwZXJzID0gcmVxdWlyZSgnLi9oZWxwZXJzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY2xvc2UoKSB7XG5cblx0RlJBTUVXT1JLLmRlYnVnKCdDbG9zZWQgJyArIHRoaXMuaWQgKyAnIGNvbXBvbmVudC4nKTtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdC8vIENhbmNlbCBjdXJyZW50IHJlbmRlciBhbmQgY2xvc2Ugam9icywgaWYgdGhleSdyZSBydW5uaW5nXG5cdGlmICh0aGlzLl9yZW5kZXJpbmcpIHtcblx0XHRzZWxmLl9yZW5kZXJpbmdDYW5jZWxlZCA9IHRydWU7XG5cdFx0dGhpcy5jYW5jZWxSZW5kZXIoKTtcblx0XHRzZWxmLl9yZW5kZXJpbmcgPSBmYWxzZTtcblx0fVxuXHRpZiAodGhpcy5fY2xvc2luZykge1xuXHRcdHRoaXMuY2FuY2VsQ2xvc2UoKTtcblx0XHRzZWxmLl9jbG9zaW5nID0gZmFsc2U7XG5cdH1cblxuXHQvLyBMb2NrIGFjY2VzcyB0byBjbG9zZSgpXG5cdHRoaXMuX2Nsb3NpbmcgPSB0cnVlO1xuXG5cdHRoaXMuYmVmb3JlQ2xvc2UoZnVuY3Rpb24gKCkge1xuXG5cdFx0Ly8gPiBOT1RFOiBgdGhpcy5fY2xvc2luZz1mYWxzZWAgY2FuIGFuZCBwcm9iYWJseSBzaG91bGQgYmUgcmVtb3ZlZCxcblx0XHQvLyA+IHNpbmNlIG11dGV4IGlzIHVubmVjZXNzYXJ5IG5vdyB0aGF0IHRoZSBjb21wb25lbnQgaXMgdXAgZm9yIGdhcmJhZ2UgY29sbGVjdGlvblxuXHRcdC8vID4gV2FpdGluZyB0byBkbyB0aGlzIHVudGlsIGl0IGNhbiBiZSB0ZXN0ZWQgZnVydGhlclxuXG5cdFx0Ly8gVW5sb2NrIGNsb3NlKClcblx0XHRzZWxmLl9jbG9zaW5nID0gZmFsc2U7XG5cblx0XHQvLyBTdG9wIGxpc3RlbmluZyB0byBhbGwgZ2xvYmFsIHRyaWdnZXJzICglfCMpXG5cblx0XHQvLyBDbG9zZSBhbGwgY2hpbGQgY29tcG9uZW50c1xuXG5cdFx0aGVscGVycy5lbXB0eUFsbFJlZ2lvbnMuY2FsbChzZWxmKTtcblxuXHRcdC8vIENhbGwgbmF0aXZlIGBCYWNrYm9uZS5WaWV3LnByb3RvdHlwZS5yZW1vdmUoKWBcblx0XHQvLyB0byB1bmRlbGVnYXRlIGV2ZW50cywgZXRjLlxuXHRcdHNlbGYucmVtb3ZlKCk7XG5cblx0fSk7XG59O1xuIiwiXG52YXIgX2JpbmRpbmdzID0ge1xuXG5cdHRleHQ6IHtcblx0XHRyZWdleHA6IC9iaW5kLXRleHQvLFxuXHRcdGZuOiBmdW5jdGlvbiAoJGVsLCBtb2RlbCkge1xuXHRcdFx0dmFyIHJhdyA9ICRib3VuZEVsLmF0dHIoJ2JpbmQtdGV4dCcpO1xuXHRcdFx0dmFyIGNsZWFuID0gcmF3LnJlcGxhY2UoL15ALywgJycpO1xuXHRcdFx0JGJvdW5kRWwudGV4dCggbW9kZWwuZ2V0KGNsZWFuKSApO1xuXHRcdH1cblx0fSxcblxuXHQnY2xhc3MnOiB7XG5cdFx0cmVnZXhwOiAvYmluZFxcLWNsYXNzXFwtKFteLV0rKS8sXG5cdFx0Zm46IGZ1bmN0aW9uICgkZWwsIG1vZGVsLCBtYXRjaGVzKSB7XG5cdFx0XHQvLyBSZWdleHAgbWF0Y2hlcyBmb3Igd2lsZGNhcmQgcGFyYW1zIGluIGF0dHJpYnV0ZSBtYXRjaCBleHByZXNzaW9uXG5cdFx0XHR2YXIgY2xhc3NOYW1lID0gbWF0Y2hlc1sxXTtcblxuXHRcdFx0dmFyIHJhdyA9ICRib3VuZEVsLmF0dHIoJ2JpbmQtY2xhc3MtJyArIGNsYXNzTmFtZSk7XG5cdFx0XHR2YXIgY2xlYW4gPSByYXcucmVwbGFjZSgvXkAvLCAnJyk7XG5cdFx0XHRpZiAoIG1vZGVsLmdldChjbGVhbikgKSB7XG5cdFx0XHRcdCRib3VuZEVsLmFkZENsYXNzKGNsYXNzTmFtZSk7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0JGJvdW5kRWwucmVtb3ZlQ2xhc3MoY2xhc3NOYW1lKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn07XG5cblxuLyoqXG4gKiBIZWxwZXIgZnVuY3Rpb25zIHVzZWQgYnkgY29tcG9uZW50c1xuICovXG5cbnZhciBoZWxwZXJzID0gbW9kdWxlLmV4cG9ydHMgPSB7XG5cblxuXG5cdC8qKlxuXHQgKiBSZW5kZXIgbW9kZWwgYmluZGluZ3MuXG5cdCAqICAgKyBgYmluZC10ZXh0YFxuXHQgKiAgICsgbW9yZSB0byBjb21lXG5cdCAqXG5cdCAqIENhbGxlZCBieSBDb21wb25lbnQgd2hlbiBpdHMgbW9kZWwgY2hhbmdlcy5cblx0ICovXG5cdHJlbmRlckRhdGFCaW5kaW5nczogZnVuY3Rpb24gKCkge1xuXHRcdEZSQU1FV09SSy5kZWJ1ZygnUmVuZGVyaW5nIGRhdGEgYmluZGluZ3MgZm9yICcsIHRoaXMuaWQsJ2NvbXBvbmVudC4uLicpO1xuXG5cdFx0Ly8gRW5zdXJlIHRoYXQgbW9kZWwgZXhpc3RzXG5cdFx0aWYgKCF0aGlzLm1vZGVsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXG5cdFx0XHRcdCdUcnlpbmcgdG8gYm9vdHN0cmFwIGRhdGEgYmluZGluZ3MgZm9yIGNvbXBvbmVudCAoJyArIHRoaXMuaWQgKyAnKSwgJyArXG5cdFx0XHRcdCdidXQgaXQgaGFzIG5vIG1vZGVsIScpO1xuXHRcdH1cblx0XHR2YXIgbW9kZWwgPSB0aGlzLm1vZGVsO1xuXG5cdFx0Ly8galF1ZXJ5IHNlbGVjdG9yIGZvciBncmFiYmluZyBhbGwgZWxlbWVudHMgdy8gZGF0YSBiaW5kaW5nc1xuXHRcdHZhciBiaW5kaW5nU2VsZWN0b3IgPSAnW2JpbmQtdGV4dF0sIDptYXRjaEF0dHIoXCJeYmluZC1jbGFzcy0qJFwiKSc7XG5cblx0XHQvLyBHZXQgZWxlbWVudHMgaW4gdGhpcyBjb21wb25lbnQgd2hpY2ggaGF2ZSBkYXRhIGJpbmRpbmdzXG5cdFx0Ly8gKGlnbm9yZXMgY29udGVudHMgb2YgcmVnaW9ucyBpZiB0aGV5IGV4aXN0KVxuXHRcdHZhciAkYm91bmRFbGVtZW50cyA9IF8kc2VsZWN0T3V0ZXIuY2FsbCh0aGlzLCBiaW5kaW5nU2VsZWN0b3IpO1xuXG5cdFx0Ly8gTG9vcCB0aHJvdWdoIGVhY2ggYm91bmQgYXR0cmlidXRlIG9mIGVhY2ggYm91bmQgZWxlbWVudFxuXHRcdC8vIGFuZCBjYWxsIHRoZSBhcHByb3ByaWF0ZSByZW5kZXIgbWV0aG9kLlxuXHRcdCRib3VuZEVsZW1lbnRzLmVhY2goZnVuY3Rpb24gZWFjaEJvdW5kRWxlbWVudCAoKSB7XG5cdFx0XHQkYm91bmRFbCA9ICQodGhpcyk7XG5cblx0XHRcdHZhciBhbGxBdHRyaWJ1dGVzID0gJGJvdW5kRWxbMF0uYXR0cmlidXRlcztcblx0XHRcdF8uZWFjaChhbGxBdHRyaWJ1dGVzLCBmdW5jdGlvbiAoYXR0cikge1xuXHRcdFx0XHR2YXIgYXR0ck5hbWUgPSBhdHRyLm5vZGVOYW1lO1xuXG5cdFx0XHRcdF8uZWFjaChfYmluZGluZ3MsIGZ1bmN0aW9uIGVhY2hCaW5kaW5nRm9ybXVsYSAoIGJpbmRpbmcgKSB7XG5cdFx0XHRcdFx0dmFyIG1hdGNoZXMgPSBhdHRyTmFtZS5tYXRjaChiaW5kaW5nLnJlZ2V4cCk7XG5cdFx0XHRcdFx0aWYgKCBtYXRjaGVzICkge1xuXHRcdFx0XHRcdFx0YmluZGluZy5mbigkYm91bmRFbCwgbW9kZWwsIG1hdGNoZXMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSxcblxuXG5cblx0LyoqXG5cdCAqIElmIGFueSByZWdpb25zIGV4aXN0IGluIHRoaXMgY29tcG9uZW50LFxuXHQgKiBlbXB0eSB0aGVtLCBhbmQgdGhlbiBkZWxldGUgdGhlbVxuXHQgKi9cblx0ZW1wdHlBbGxSZWdpb25zOiBmdW5jdGlvbigpIHtcblx0XHRfLmVhY2godGhpcy5yZWdpb25zLCBmdW5jdGlvbiAocmVnaW9uLCBrZXkpIHtcblx0XHRcdHJlZ2lvbi5lbXB0eSgpO1xuXHRcdFx0ZGVsZXRlIHRoaXMucmVnaW9uc1trZXldO1xuXHRcdH0sIHRoaXMpO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBJbnN0YW50aWF0ZSByZWdpb24gY29tcG9uZW50cyBhbmQgYXBwZW5kIGFueSBkZWZhdWx0XG5cdCAqIHRlbXBsYXRlcy9jb21wb25lbnRzIHRvIHRoZSBET01cblx0ICovXG5cdHJlbmRlclJlZ2lvbnM6IGZ1bmN0aW9uKCkge1xuXHRcdHZhciBzZWxmID0gdGhpcztcblxuXHRcdGhlbHBlcnMuZW1wdHlBbGxSZWdpb25zKCk7XG5cblx0XHQvLyBEZXRlY3QgY2hpbGQgcmVnaW9ucyBpbiB0ZW1wbGF0ZVxuXHRcdHZhciAkcmVnaW9ucyA9IHRoaXMuJCgncmVnaW9uLCBbZGF0YS1yZWdpb25dJyk7XG5cdFx0JHJlZ2lvbnMuZWFjaChmdW5jdGlvbiAoaSwgZWwpIHtcblxuXHRcdFx0Ly8gUHJvdmlkZSBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eSBmb3Jcblx0XHRcdC8vIGBkZWZhdWx0YCwgYGNvbnRlbnRzYCBhbmQgYHRlbXBsYXRlYCBub3RhdGlvblxuXHRcdFx0Ly8gTm9ybWFsaXplcyBub3RhdGlvbiB0byBgY29udGVudHNgIGF0dHJpYnV0ZS5cblx0XHRcdHZhciBjb21wb25lbnRJZCA9ICQoZWwpLmF0dHIoJ2RlZmF1bHQnKTtcblx0XHRcdGNvbXBvbmVudElkID0gY29tcG9uZW50SWQgfHwgJChlbCkuYXR0cignY29udGVudHMnKTtcblx0XHRcdGNvbXBvbmVudElkID0gY29tcG9uZW50SWQgfHwgJChlbCkuYXR0cigndGVtcGxhdGUnKTtcblx0XHRcdCQoZWwpLmF0dHIoJ2NvbnRlbnRzJywgY29tcG9uZW50SWQpO1xuXG5cdFx0XHQvLyBHZW5lcmF0ZSBhIHJlZ2lvbiBpbnN0YW5jZSBmcm9tIHRoZSBlbGVtZW50XG5cdFx0XHQvLyAobW9kaWZ5aW5nIHRoZSBET00gYXMgbmVjZXNzYXJ5KVxuXHRcdFx0dmFyIHJlZ2lvbiA9IEZSQU1FV09SSy5SZWdpb24uZnJvbUVsZW1lbnQoZWwsIHNlbGYpO1xuXG5cdFx0XHQvLyBJZiByZWdpb24gaGFzIG5vIGlkLCBnZW5lcmF0ZSBhIHVuaXF1ZSByZWdpb24gaWQgdy9pIHRoaXMgY29tcG9uZW50XG5cdFx0XHQvLyB0aGF0IGlzIHVubGlrZWx5IHRvIGNvbGxpZGUgd2l0aCBteSBvdGhlciBuYW1lZCByZWdpb25zXG5cdFx0XHRpZiAoIXJlZ2lvbi5pZCkge1xuXHRcdFx0XHRyZWdpb24uaWQgPSAnJytcblx0XHRcdFx0XHRGUkFNRVdPUksub3B0aW9ucy5mcmFtZXdvcmtJZCArXG5cdFx0XHRcdFx0J19fYW5vbnltb3VzX3JlZ2lvbl9fJyArXG5cdFx0XHRcdFx0c2VsZi5hbm9ueW1vdXNSZWdpb25Db3VudGVyO1xuXG5cdFx0XHRcdC8vIEluY3JlbWVudCBjb3VudGVyIGZvciBuZXh0IHRpbWVcblx0XHRcdFx0c2VsZi5hbm9ueW1vdXNSZWdpb25Db3VudGVyKys7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEtlZXAgdHJhY2sgb2YgcmVnaW9ucywgc2luY2Ugd2UgYXJlIHRoZSBwYXJlbnQgY29tcG9uZW50XG5cdFx0XHRzZWxmLnJlZ2lvbnNbcmVnaW9uLmlkXSA9IHJlZ2lvbjtcblxuXHRcdFx0Ly8gQXMgbG9uZyBhcyB0aGVyZSBhcmUgbm8gY29sbGlzaW9ucyxcblx0XHRcdC8vIHByb3ZpZGUgYSBmcmllbmRseSByZWZlcmVuY2UgdG8gdGhlIHJlZ2lvbiBvbiB0aGUgdG9wIGxldmVsIG9mIHRoZSBjb2xsZWN0aW9uXG5cdFx0XHRpZiAoIXNlbGZbcmVnaW9uLmlkXSkge1xuXHRcdFx0XHRzZWxmW3JlZ2lvbi5pZF0gPSByZWdpb247XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0sXG5cblx0LyoqXG5cdCAqIENvbnZlcnQgdGVtcGxhdGUgSFRNTCBhbmQgZGF0YSBpbnRvIGEgY29tcGlsZWQgJHRlbXBsYXRlXG5cdCAqL1xuXHRjb21waWxlVGVtcGxhdGU6IGZ1bmN0aW9uKCkge1xuXG5cdFx0Ly8gQ3JlYXRlIHRlbXBsYXRlIGRhdGEgY29udGV4dCBieSBwcm92aWRpbmcgYWNjZXNzIHRvIHRoZSBnbG9iYWwgRGF0YSBvYmplY3QsXG5cdFx0Ly8gQWxzbyBmb2xkIGluIHRoZSBtb2RlbCBhc3NvY2lhdGVkIHdpdGggdGhpcyBjb21wb25lbnQsIGlmIHRoZXJlIGlzIG9uZVxuXHRcdHZhciB0ZW1wbGF0ZUNvbnRleHQgPSBfLmV4dGVuZCh7XG5cblx0XHRcdC8vIEFsbG93cyB5b3UgdG8gZ2V0IGEgaG9sZCBvZiBkYXRhLFxuXHRcdFx0Ly8gYnV0IHVzZSBhIGRlZmF1bHQgdmFsdWUgaWYgaXQgZG9lc24ndCBleGlzdFxuXHRcdFx0Z2V0OiBmdW5jdGlvbiAoa2V5LCBkZWZhdWx0VmFsKSB7XG5cdFx0XHRcdHZhciB2YWwgPSB0ZW1wbGF0ZUNvbnRleHRba2V5XTtcblx0XHRcdFx0aWYgKHR5cGVvZiB2YWwgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdFx0dmFsID0gZGVmYXVsdFZhbDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdmFsO1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHQvLyBBbGwgRlJBTUVXT1JLLmRhdGEgaXMgYXZhaWxhYmxlIGluIGV2ZXJ5IHRlbXBsYXRlXG5cdFx0RlJBTUVXT1JLLmRhdGEpO1xuXG5cdFx0Ly8gSWYgYSBtb2RlbCBpcyBwcm92aWRlZCBmb3IgdGhpcyBjb21wb25lbnQsIG1ha2UgaXQgYXZhaWxhYmxlIGluIHRoaXMgdGVtcGxhdGVcblx0XHRpZiAodGhpcy5tb2RlbCkge1xuXHRcdFx0Xy5leHRlbmQodGVtcGxhdGVDb250ZXh0LCB0aGlzLm1vZGVsLmF0dHJpYnV0ZXMpO1xuXHRcdH1cblxuXHRcdC8vIFRlbXBsYXRlIHRoZSBIVE1MIHdpdGggdGhlIGRhdGFcblx0XHR2YXIgaHRtbDtcblx0XHR0cnkge1xuXHRcdFx0Ly8gQWNjZXB0IHByZWNvbXBpbGVkIHRlbXBsYXRlc1xuXHRcdFx0aWYgKF8uaXNGdW5jdGlvbih0aGlzLnRlbXBsYXRlKSkge1xuXHRcdFx0XHRodG1sID0gdGhpcy50ZW1wbGF0ZSh0ZW1wbGF0ZUNvbnRleHQpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gT3IgcmF3IHN0cmluZ3Ncblx0XHRcdGVsc2UgaHRtbCA9IF8udGVtcGxhdGUodGhpcy50ZW1wbGF0ZSwgdGVtcGxhdGVDb250ZXh0KTtcblx0XHR9XG5cdFx0Y2F0Y2ggKGUpIHtcblx0XHRcdHZhciBzdHIgPSBlLFxuXHRcdFx0XHRzdGFjayA9ICcnO1xuXG5cdFx0XHRpZiAoZSBpbnN0YW5jZW9mIEVycm9yKSB7XG5cdFx0XHRcdHN0ciA9ICBlLnRvU3RyaW5nKCk7XG5cdFx0XHRcdHN0YWNrID0gZS5zdGFjaztcblx0XHRcdH1cblxuXHRcdFx0RlJBTUVXT1JLLmVycm9yKHRoaXMuaWQgKyAnIDo6IENhbm5vdCByZW5kZXIoKSB0ZW1wbGF0ZSAocHJvYmFibHkgbWlzc2luZyBkYXRhKS5cXG5cXG5Hb3QgdGhpcyBlcnJvciA6Olxcbicrc3RyLCdcXG4nKTtcblx0XHRcdGlmIChodG1sKSB7RlJBTUVXT1JLLnZlcmJvc2UoJ1RlbXBsYXRlIDo6ICcgKyBodG1sKTt9XG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZSgnRnVsbCBUZW1wbGF0ZSBFcnJvcjonICsgJ1xcbicsc3RhY2spO1xuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UoJ1xcblxcbk1vcmUgaW5mb3JtYXRpb246JywgJ1xcblxcblRlbXBsYXRlIGNvbnRleHQgOjonLHRlbXBsYXRlQ29udGV4dCwgJ1xcblxcbnRoaXMubW9kZWw6OicsIHRoaXMubW9kZWwpO1xuXHRcdFx0aHRtbCA9IF8uaXNTdHJpbmcodGhpcy50ZW1wbGF0ZSkgPyB0aGlzLnRlbXBsYXRlIDogc3RyO1xuXHRcdH1cblxuXHRcdHJldHVybiBodG1sO1xuXHR9XG5cbn07XG5cblxuXG5cbi8vIFByaXZhdGUgaW50cmEtaGVscGVyIG1ldGhvZHNcblxuXG5cbi8qKlxuICogTG9va3VwIHN1aXRhYmxlIGVsZW1lbnRzIHdpdGhpbiB0aGlzIGNvbXBvbmVudCdzICRlbCBjb250ZXh0LlxuICogSWdub3JlIHJlZ2lvbnMsIGFuZCBpbmNsdWRlIHRoZSB0b3AtbGV2ZWwgZWxlbWVudC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gYmluZGluZ1NlbGVjdG9yIC0gRE9NIHNlbGVjdG9yIHRvIHVzZVxuICovXG52YXIgXyRzZWxlY3RPdXRlciA9IGZ1bmN0aW9uICggYmluZGluZ1NlbGVjdG9yICkge1xuXG5cdC8vIExvb2t1cCBtYXRjaGVzXG5cdHZhciAkbWF0Y2hlcyA9IHRoaXMuJChiaW5kaW5nU2VsZWN0b3IpO1xuXG5cdC8vIElmIHRvcC1sZXZlbCBlbGVtZW50IGluIHRlbXBsYXRlIGhhcyBhIGRhdGEtYmluZGluZywgaW5jbHVkZSBpdFxuXHRpZiAodGhpcy4kZWwuZmlsdGVyKGJpbmRpbmdTZWxlY3RvcikpIHtcblx0XHQkbWF0Y2hlcyA9ICQubWVyZ2UoJG1hdGNoZXMsIHRoaXMuJGVsKTtcblx0fVxuXG5cdC8vIE9taXQgYW55dGhpbmcgaW5zaWRlIGEgcmVnaW9uLCBzaW5jZSB0aG9zZSBiaW5kaW5ncyB3aWxsIGhhdmUgYWxyZWFkeVxuXHQvLyBiZWVuIHRha2VuIGNhcmUgb2YgYnkgb25lIG9mIHRoZSBkZXNjZW5kYW50IGNvbXBvbmVudChzKSB3aXRoaW4gdGhlIHJlZ2lvbi5cblx0Ly9cblx0Ly8gVE9ETzogb3B0aW1pemUgdG8gZXhjbHVkZSB0aGVzZSBlbGVtZW50cyBmcm9tIHRoZSBvcmlnaW5hbCBET00gc2VsZWN0aW9uXG5cdCRtYXRjaGVzID0gJG1hdGNoZXMubm90KCB0aGlzLiQoJ3JlZ2lvbiAqLCBbZGF0YS1yZWdpb25dIConKSApO1xuXG5cdHJldHVybiAkbWF0Y2hlcztcbn07XG5cblxuXG4vLyBSZWdleHBzIGZvciBkZXRlY3Rpb24gb2Ygd2lsZGNhcmQgbmFtZWQgcGFyYW1ldGVycyBpbiBjdXN0b20gZWxlbWVudCBhdHRyaWJ1dGUgbmFtZXMuXG52YXIgb3B0aW9uYWxQYXJhbSA9IC9cXCgoLio/KVxcKS9nO1xudmFyIG5hbWVkUGFyYW0gPSAvKFxcKFxcPyk/OlxcdysvZztcbnZhciBzcGxhdFBhcmFtID0gL1xcKlxcdysvZztcbnZhciBlc2NhcGVSZWdFeHAgPSAvW1xcLXt9XFxbXFxdKz8uLFxcXFxcXF4kfCNcXHNdL2c7XG5cblxuLy8gQnVpbGQgc2VsZWN0b3IgZm9yIHN1cGVyc2V0IG9mIHRoZXNlIGJpbmRpbmdzXG52YXIgX2F0dHJOYW1lVG9SZWdFeHAgPSBmdW5jdGlvbiggYXR0ckV4cHJlc3Npb24gKSB7XG5cblx0YXR0ckV4cHJlc3Npb24gPSBhdHRyRXhwcmVzc2lvbi5yZXBsYWNlKGVzY2FwZVJlZ0V4cCwgJ1xcXFwkJicpXG5cdFx0LnJlcGxhY2Uob3B0aW9uYWxQYXJhbSwgJyg/OiQxKT8nKVxuXHRcdC5yZXBsYWNlKG5hbWVkUGFyYW0sIGZ1bmN0aW9uKG1hdGNoLCBvcHRpb25hbCkge1xuXHRcdFx0cmV0dXJuIG9wdGlvbmFsID8gbWF0Y2ggOiAnKFteXFwvXSspJztcblx0XHR9KVxuXHRcdC5yZXBsYWNlKHNwbGF0UGFyYW0sICcoLio/KScpO1xuXHRyZXR1cm4gJ14nICsgYXR0ckV4cHJlc3Npb24gKyAnJCc7XG59O1xudmFyIF9leHRyYWN0UGFyYW1ldGVycyA9IGZ1bmN0aW9uKHJlZ2V4cCwgYXR0ck5hbWUsIGF0dHJFeHByZXNzaW9uKSB7XG5cdHZhciBwYXJhbVZhbHVlcyA9IHJlZ2V4cC5leGVjKGF0dHJOYW1lKS5zbGljZSgxKTtcblx0dmFyIHBhcmFtS2V5cyA9IG5hbWVkUGFyYW0uZXhlYyhhdHRyRXhwcmVzc2lvbik7XG5cblx0aWYgKCFwYXJhbUtleXMgfHwgIXBhcmFtVmFsdWVzKSByZXR1cm4ge307XG5cblx0dmFyIG5hbWVkUGFyYW1ldGVycyA9IHt9O1xuXHRjb25zb2xlLmxvZygncGFyYW1WYWx1ZXM6JyxwYXJhbVZhbHVlcyk7XG5cdF8uZWFjaChwYXJhbVZhbHVlcywgZnVuY3Rpb24gZWFjaE1hdGNoaW5nUGllY2UoIHBhcmFtLCBpICkge1xuXHRcdHZhciBrZXkgPSBwYXJhbUtleXNbaV07XG5cdFx0a2V5ID0ga2V5LnNsaWNlKDEpOyAvLyByZW1vdmUgYDpgIGZyb20gbmFtZWQgcGFyYW1cblx0XHRuYW1lZFBhcmFtZXRlcnNba2V5XSA9IHBhcmFtVmFsdWVzW2ldO1xuXHR9KTtcblx0cmV0dXJuIG5hbWVkUGFyYW1ldGVycztcbn07XG5cblxuXG4vKipcbiAqIFJlbmRlciBhIHNpbmdsZSBiaW5kaW5nXG4gKi9cbnZhciBfcmVuZGVyQmluZGluZyA9IGZ1bmN0aW9uICgkbWF0Y2hlZEVsLCBkb21BdHRyaWJ1dGVOYW1lLCBtb2RlbCwgcmVuZGVyRm4sIG5hbWVkUGFyYW1zKSB7XG5cdHZhciByYXdCaW5kaW5nID0gJG1hdGNoZWRFbC5hdHRyKCBkb21BdHRyaWJ1dGVOYW1lICk7XG5cdC8vIElmIGVsZW1lbnQgZG9lc24ndCBjb250YWluIHRoZSBzcGVjaWZpZWQgRE9NIGF0dHJpYnV0ZS4uLlxuXHQvLyBmYWlsIHNpbGVudGx5LlxuXHRpZiAoICFyYXdCaW5kaW5nICkgcmV0dXJuO1xuXG5cdC8vIGNvbnNvbGUubG9nKCdnZXR0aW5nICcsZG9tQXR0cmlidXRlTmFtZSwnb24nLCRtYXRjaGVkRWwpO1xuXHR2YXIgbW9kZWxBdHRyaWJ1dGVOYW1lID0gcmF3QmluZGluZy5yZXBsYWNlKC9eXFxALywgJycpO1xuXHRGUkFNRVdPUksuZGVidWcoJ0ZvdW5kIGEgYmluZGluZyA6OicsIHJhd0JpbmRpbmcsICc6OicsIG5hbWVkUGFyYW1zKTtcblxuXHQvLyBJZiBtb2RlbCBkb2Vzbid0IGNvbnRhaW4gdGhlIHNwZWNpZmllZCBhdHRyaWJ1dGUuLi5cblx0aWYgKCB0eXBlb2YgbW9kZWwuYXR0cmlidXRlc1ttb2RlbEF0dHJpYnV0ZU5hbWVdID09PSAndW5kZWZpbmVkJyApIHtcblxuXHRcdC8vIGZhaWwgc2lsZW50bHkuXG5cdFx0cmV0dXJuO1xuXHRcdC8vIEZSQU1FV09SSy53YXJuKCdDYW5ub3QgYmluZCBgQCcrbW9kZWxBdHRyaWJ1dGVOYW1lKycgZm9yIHRlbXBsYXRlL2NvbXBvbmVudCAnICtcblx0XHQvLyBcdCdgJyArIGNvbXBvbmVudC5pZCArJ2AuXFxuJytcblx0XHQvLyBcdCdObyBzdWNoIGF0dHJpYnV0ZSBleGlzdHMgaW4gdGhlIGNvbXBvbmVudFxcJ3MgbW9kZWwuJ1xuXHRcdC8vICk7XG5cdH1cblxuXHQvLyBSZW5kZXIgYSBkYXRhIGJpbmRpbmdcblx0dmFyIGJpbmRpbmdWYWwgPSBtb2RlbC5nZXQobW9kZWxBdHRyaWJ1dGVOYW1lKSB8fCAnJztcblx0cmVuZGVyRm4oICRtYXRjaGVkRWwsIGJpbmRpbmdWYWwsIG5hbWVkUGFyYW1zICk7XG59O1xuXG5cbi8qKlxuICogUmVuZGVyIHRoZSBzcGVjaWZpZWQgdHlwZSBvZiBkYXRhIGJpbmRpbmdzXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnNcbiAqXHRcdEBvcHRpb24ge0Z1bmN0aW9ufSByZW5kZXJGbiAoJGVsLCB2YWwsIHBhcmFtcylcdC0+IGZ1bmN0aW9uIHdoaWNoIHJlbmRlcnMgdGhlIGRhdGEgYmluZGluZyBmb3IgdGhlIHNwZWNpZmllZCBlbGVtZW50XG4gKlx0XHRcdEBwYXJhbSB7SlF1ZXJ5RWxlbWVudH0gJGVsXG4gKlx0XHRcdEBwYXJhbSB7P30gdmFsIC0+IHZhbHVlIG9mIGJvdW5kIG1vZGVsIGF0dHJpYnV0ZVxuICpcdFx0XHRAcGFyYW0ge09iamVjdH0gcGFyYW1zIC0+IGtleWVkIG9iamVjdCBvZiBkeW5hbWljIHBhcmFtZXRlcnMgZnJvbSB0aGUgbmFtZSBvZiB0aGUgYXR0cmlidXRlIGl0c2VsZlxuICpcdFx0QG9wdGlvbiB7U3RyaW5nfSBhdHRyaWJ1dGUgLT4gbmFtZSBvZiBib3VuZCBhdHRyaWJ1dGUsIGUuZy4gJ2JpbmQtdGV4dCdcbiAqXHRcdEBvcHRpb24ge0NvbXBvbmVudH0gY29tcG9uZW50XG4gKlx0XHRAb3B0aW9uIHtCYWNrYm9uZS5Nb2RlbH0gW21vZGVsXSAtIGRlZmF1bHRzIHRvIGBjb21wb25lbnQubW9kZWxgXG4gKi9cbnZhciBfcmVuZGVyQmluZGluZ3MgPSBmdW5jdGlvbiAoIG9wdGlvbnMgKSB7XG5cdHZhciBjb21wb25lbnQgPSBvcHRpb25zLmNvbXBvbmVudDtcblx0dmFyIGF0dHJpYnV0ZUV4cHJlc3Npb24gPSBvcHRpb25zLmF0dHJpYnV0ZTtcblx0dmFyIG1vZGVsID0gb3B0aW9ucy5tb2RlbCB8fCBvcHRpb25zLmNvbXBvbmVudC5tb2RlbDtcblxuXG5cdC8vIENhbGN1bGF0ZSBzdHJpbmcgd2hpY2ggY2FuIGJlIFwibmV3LWVkXCIgaW50byBhIFJlZ0V4cFxuXHR2YXIgYXR0clJlZ0V4cFN0ciA9IF9hdHRyTmFtZVRvUmVnRXhwKGF0dHJpYnV0ZUV4cHJlc3Npb24pO1xuXHR2YXIgYXR0clJlZ0V4cCA9IG5ldyBSZWdFeHAoYXR0clJlZ0V4cFN0cik7XG5cblxuXHR2YXIgYm91bmRBdHRyU2VsZWN0b3IgPSAnOm1hdGNoQXR0cihcIicgKyBhdHRyUmVnRXhwU3RyICsgJ1wiKSc7XG5cblx0Ly8gRmluZCBhbGwgcmVsZXZhbnQgZGVzY2VuZGFudCBlbGVtZW50c1xuXHR2YXIgJG1hdGNoZXMgPSBfZ2V0JE1hdGNoZXMoYm91bmRBdHRyU2VsZWN0b3IsIGNvbXBvbmVudCk7XG5cblx0Ly8gRWFybHkgZXhpdCBmb3Igc2ltcGxlIGJpbmRpbmdzICh3L28gYm91bmQgcGFyYW1zKVxuXHRpZiAoICFhdHRyaWJ1dGVFeHByZXNzaW9uLm1hdGNoKC9cXDovKSkge1xuXHRcdCRtYXRjaGVzLmVhY2goZnVuY3Rpb24gKCkge1xuXHRcdFx0X3JlbmRlckJpbmRpbmcoJCh0aGlzKSwgYXR0cmlidXRlRXhwcmVzc2lvbiwgbW9kZWwsIG9wdGlvbnMucmVuZGVyRm4sIHt9KTtcblxuXHRcdH0pO1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGNvbnNvbGUubG9nKCdcXG5SZW5kZXJpbmcgcGFyYW1ldGVyaXplZCBkYXRhIGJpbmRpbmc6ICcsYXR0clJlZ0V4cCk7XG5cblx0Ly8gVE9ETzogYmF0Y2ggaXQgdXAgc28gd2Ugb25seSBkbyBvbmUgRE9NIHF1ZXJ5XG5cdCRtYXRjaGVzLmVhY2goZnVuY3Rpb24gZWFjaEVsZW1lbnRXaXRoQUJpbmRpbmcgKCkge1xuXHRcdHZhciAkbWF0Y2hlZEVsID0gJCh0aGlzKTtcblxuXHRcdC8vIEdldCBhbGwgYXR0cmlidXRlcyBmb3IgdGhpcyAkZWwgYW5kIGZpbHRlciBhIHNldCBvZiBtYXRjaGluZyBuYW1lcy9wYXJhbXNcblx0XHR2YXIgYWxsRE9NQXR0ck5hbWVzID0gXy5tYXAoICRtYXRjaGVkRWxbMF0uYXR0cmlidXRlcywgZnVuY3Rpb24gKGVsKSB7XG5cdFx0XHRyZXR1cm4gZWwubm9kZU5hbWU7XG5cdFx0fSk7XG5cdFx0Y29uc29sZS5sb2coJ2FsbERPTUF0dHJOYW1lcyBmb3IgZWwnLGFsbERPTUF0dHJOYW1lcywgJG1hdGNoZWRFbCk7XG5cdFx0dmFyIG1hdGNoaW5nRE9NQXR0cnMgPSB7fTtcblx0XHRfLmVhY2goIGFsbERPTUF0dHJOYW1lcywgZnVuY3Rpb24gZWFjaEF0dHJpYnV0ZSAoIGRvbUF0dHJOYW1lICkge1xuXHRcdFx0Ly8gY29uc29sZS5sb2coJ2NoZWNraW5nJyxkb21BdHRyTmFtZSk7XG5cdFx0XHRpZiAoIGRvbUF0dHJOYW1lLm1hdGNoKGF0dHJSZWdFeHApKSB7XG5cdFx0XHRcdG1hdGNoaW5nRE9NQXR0cnNbZG9tQXR0ck5hbWVdID0gX2V4dHJhY3RQYXJhbWV0ZXJzKCBhdHRyUmVnRXhwLCBkb21BdHRyTmFtZSwgYXR0cmlidXRlRXhwcmVzc2lvbiApO1xuXHRcdFx0XHQvLyBjb25zb2xlLmxvZygnLCBnb3QnLG1hdGNoaW5nRE9NQXR0cnNbZG9tQXR0ck5hbWVdLCAnICgoKCcsZG9tQXR0ck5hbWUsIGF0dHJpYnV0ZUV4cHJlc3Npb24pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cblx0XHRjb25zb2xlLmxvZygnICoqKiogbWF0Y2hpbmdET01BdHRycyA6OicsIG1hdGNoaW5nRE9NQXR0cnMpO1xuXG5cdFx0dGhyb3cgbmV3IEVycm9yKCdod2FhYScpO1xuXHRcdF8uZWFjaChtYXRjaGluZ0RPTUF0dHJzLCBmdW5jdGlvbiAoIG5hbWVkUGFyYW1zLCBkb21BdHRyaWJ1dGVOYW1lICkge1xuXHRcdFx0X3JlbmRlckJpbmRpbmcoJG1hdGNoZWRFbCwgZG9tQXR0cmlidXRlTmFtZSwgbW9kZWwsIG9wdGlvbnMucmVuZGVyRm4sIG5hbWVkUGFyYW1zKTtcblx0XHR9KTtcblxuXHR9KTtcbn07XG5cblxuXG5cblxuXG4vKipcbiAqIENyZWF0ZSBwc2V1ZG8tc2VsZWN0b3IgZm9yIGdldHRpbmcgd2lsZGNhcmQgZGF0YSBhdHRyaWJ1dGVzLlxuICpcbiAqIFVzYWdlOlxuICogJChcIjptYXRjaEF0dHIoJ15kYXRhLScpXCIpXG4gKlxuICogU291cmNlOlxuICogaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMTMyMjI1MDkvNDg2NTQ3XG4gKi9cbmpRdWVyeS5leHByLnBzZXVkb3MubWF0Y2hBdHRyID0gJC5leHByLmNyZWF0ZVBzZXVkbyhmdW5jdGlvbihhcmcpIHtcblxuICAgIHZhciByZWdleHAgPSBuZXcgUmVnRXhwKGFyZyk7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKGVsZW0pIHtcbiAgICAgICAgZm9yKHZhciBpID0gMDsgaSA8IGVsZW0uYXR0cmlidXRlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIGF0dHIgPSBlbGVtLmF0dHJpYnV0ZXNbaV07XG4gICAgICAgICAgICBpZihyZWdleHAudGVzdChhdHRyLm5hbWUpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH07XG59KTtcblxuIiwiLyoqXG4gKiBDb21wb25lbnQgaXMgYW4gZXh0ZW5kZWQgYEJhY2tib25lLlZpZXdgLiBJdCBhZGQgZmVhdHVyZXMgc3VjaCBhcyBhdXRvbWF0aWMgZXZlbnQgYmluZGluZyxcbiAqIHJlbmRlcmluZywgbGlmZWN5Y2xlIGhvb2tzIGFuZCBldmVudHMsIGFuZCBtb3JlLlxuICovXG5cbnZhciBsaWZlY3ljbGVIb29rcyAgICAgPSByZXF1aXJlKCcuL2xpZmVjeWNsZUhvb2tzJyksXG5cdGxpZmVjeWNsZUV2ZW50cyAgICA9IHJlcXVpcmUoJy4vbGlmZWN5Y2xlRXZlbnRzJyksXG5cdGJpbmRFdmVudHMgICAgICAgICA9IHJlcXVpcmUoJy4vYmluZEV2ZW50cycpLFxuXHRjbG9zZSAgICAgICAgICAgICAgPSByZXF1aXJlKCcuL2Nsb3NlJyksXG5cdHJlbmRlciAgICAgICAgICAgICA9IHJlcXVpcmUoJy4vcmVuZGVyJyksXG5cdHJlbmRlckNvbGxlY3Rpb24gICA9IHJlcXVpcmUoJy4vcmVuZGVyQ29sbGVjdGlvbicpLFxuXHR2YWxpZGF0ZURlZmluaXRpb24gPSByZXF1aXJlKCcuL3ZhbGlkYXRlRGVmaW5pdGlvbicpO1xuXG5Db21wb25lbnQgPSBtb2R1bGUuZXhwb3J0cyA9IEJhY2tib25lLlZpZXcuZXh0ZW5kKCk7XG5cblxuXy5leHRlbmQoQ29tcG9uZW50LnByb3RvdHlwZSwge1xuXG5cdC8vIExpZmVjeWNsZSBIb29rc1xuXHRiZWZvcmVSZW5kZXI6IGZ1bmN0aW9uKGNiKSB7XG5cdFx0bGlmZWN5Y2xlSG9va3MuYmVmb3JlUmVuZGVyLmNhbGwodGhpcywgY2IpO1xuXHR9LFxuXHRiZWZvcmVDbG9zZTogZnVuY3Rpb24oY2IpIHtcblx0XHRsaWZlY3ljbGVIb29rcy5iZWZvcmVDbG9zZS5jYWxsKHRoaXMsIGNiKTtcblx0fSxcblx0YWZ0ZXJSZW5kZXI6IGZ1bmN0aW9uKCkge1xuXHRcdGxpZmVjeWNsZUhvb2tzLmFmdGVyUmVuZGVyLmNhbGwodGhpcyk7XG5cdH0sXG5cdGNhbmNlbFJlbmRlcjogZnVuY3Rpb24oKSB7XG5cdFx0bGlmZWN5Y2xlSG9va3MuY2FuY2VsUmVuZGVyLmNhbGwodGhpcyk7XG5cdH0sXG5cdGNhbmNlbENsb3NlOiBmdW5jdGlvbigpIHtcblx0XHRsaWZlY3ljbGVIb29rcy5jYW5jZWxDbG9zZS5jYWxsKHRoaXMpO1xuXHR9LFxuXG5cdC8vIExpZmVjeWNsZSBFdmVudHNcblx0YWZ0ZXJDaGFuZ2U6IGZ1bmN0aW9uKG1vZGVsLCBvcHRpb25zKSB7XG5cdFx0bGlmZWN5Y2xlRXZlbnRzLmFmdGVyQ2hhbmdlLmNhbGwodGhpcywgbW9kZWwsIG9wdGlvbnMpO1xuXHR9LFxuXHRhZnRlckFkZDogZnVuY3Rpb24obW9kZWwsIGNvbGxlY3Rpb24sIG9wdGlvbnMpIHtcblx0XHRsaWZlY3ljbGVFdmVudHMuYWZ0ZXJBZGQuY2FsbCh0aGlzLCBtb2RlbCwgY29sbGVjdGlvbiwgb3B0aW9ucyk7XG5cdH0sXG5cdGFmdGVyUmVtb3ZlOiBmdW5jdGlvbihtb2RlbCwgY29sbGVjdGlvbiwgb3B0aW9ucykge1xuXHRcdGxpZmVjeWNsZUV2ZW50cy5hZnRlclJlbW92ZS5jYWxsKHRoaXMsIG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zKTtcblx0fSxcblx0YWZ0ZXJSZXNldDogZnVuY3Rpb24oY29sbGVjdGlvbiwgb3B0aW9ucykge1xuXHRcdGxpZmVjeWNsZUV2ZW50cy5hZnRlclJlc2V0LmNhbGwodGhpcywgY29sbGVjdGlvbiwgb3B0aW9ucyk7XG5cdH0sXG5cblx0Ly8gUHJvdG90eXBlIG1ldGhvZHMuXG5cdGNsb3NlOiBmdW5jdGlvbigpIHtcblx0XHRjbG9zZS5jYWxsKHRoaXMpO1xuXHR9LFxuXHRyZW5kZXI6IGZ1bmN0aW9uKGF0SW5kZXgpIHtcblx0XHRyZW5kZXIuY2FsbCh0aGlzLCBhdEluZGV4KTtcblx0fSxcblxuXHRyZW5kZXJDb2xsZWN0aW9uOiBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuXHRcdHJlbmRlckNvbGxlY3Rpb24uYXBwbHkodGhpcywgYXJncyk7XG5cdH0sXG59KTtcblxuXG5cblxuQ29tcG9uZW50LnByb3RvdHlwZS5pbml0aWFsaXplID0gZnVuY3Rpb24ocHJvcGVydGllcykge1xuXG5cdHZhciBzZWxmID0gdGhpcztcblxuXHQvLyBLZWVwIHRyYWNrIG9mIGEgY291bnRlciBmb3IgdXNlIGluIGdlbmVyYXRpbmdcblx0Ly8gaWRzIGZvciBhbm9ueW1vdXMgY29tcG9uZW50cy5cblx0dGhpcy5hbm9ueW1vdXNSZWdpb25Db3VudGVyID0gMDtcblxuXHQvLyBEaXNhYmxlIG9yIGlzc3VlIHdhcm5pbmdzIGFib3V0IGNlcnRhaW4gcHJvcGVydGllc1xuXHQvLyBhbmQgbWV0aG9kcyB0byBhdm9pZCBjb25mdXNpb25cblx0cHJvcGVydGllcyA9IHZhbGlkYXRlRGVmaW5pdGlvbihwcm9wZXJ0aWVzKTtcblxuXHQvLyBFeHRlbmQgaW5zdGFuY2Ugdy8gc3BlY2lmaWVkIHByb3BlcnRpZXMgYW5kIG1ldGhvZHNcblx0Xy5leHRlbmQodGhpcywgcHJvcGVydGllcyk7XG5cblx0Ly8gU3RhcnQgd2l0aCBlbXB0eSByZWdpb25zIG9iamVjdFxuXHR0aGlzLnJlZ2lvbnMgPSB7fTtcblxuXHQvLyBFbmNvdXJhZ2UgY2hpbGQgbWV0aG9kcyB0byB1c2UgdGhlIGNvbXBvbmVudCBjb250ZXh0XG5cdF8uYmluZEFsbCh0aGlzKTtcbn07XG4iLCIvLyBGaXJlZCB3aGVuIHRoZSBib3VuZCBtb2RlbCBpcyB1cGRhdGVkIChgdGhpcy5tb2RlbGApXG5leHBvcnRzLmFmdGVyQ2hhbmdlID0gZnVuY3Rpb24gKG1vZGVsLCBvcHRpb25zKSB7fTtcblxuLy8gRmlyZWQgd2hlbiBhIG1vZGVsIGlzIGFkZGVkIHRvIHRoZSBib3VuZCBjb2xsZWN0aW9uIChgdGhpcy5jb2xsZWN0aW9uYClcbmV4cG9ydHMuYWZ0ZXJBZGQgPSBmdW5jdGlvbiAobW9kZWwsIGNvbGxlY3Rpb24sIG9wdGlvbnMpIHt9O1xuXG4vLyBGaXJlZCB3aGVuIGEgbW9kZWwgaXMgcmVtb3ZlZCBmcm9tIHRoZSBib3VuZCBjb2xsZWN0aW9uIChgdGhpcy5jb2xsZWN0aW9uYClcbmV4cG9ydHMuYWZ0ZXJSZW1vdmUgPSBmdW5jdGlvbiAobW9kZWwsIGNvbGxlY3Rpb24sIG9wdGlvbnMpIHt9O1xuXG4vLyBGaXJlZCB3aGVuIHRoZSBib3VuZCBjb2xsZWN0aW9uIGlzIHdpcGVkIChgdGhpcy5jb2xsZWN0aW9uYClcbmV4cG9ydHMuYWZ0ZXJSZXNldCA9IGZ1bmN0aW9uIChjb2xsZWN0aW9uLCBvcHRpb25zKSB7fTtcbiIsIi8vIEZpcmVkIGF1dG9tYXRpY2FsbHkgd2hlbiB0aGUgdmlldyBpcyBpbml0aWFsbHkgY3JlYXRlZFxuLy8gb25seSBmaXJlZCBhZnRlcndhcmRzIGlmIHRoaXMucmVuZGVyKCkgaXMgZXhwbGljaXRseSBjYWxsZWRcbi8vIENhbGxiYWNrIG11c3QgYmUgZmlyZWQhIVxuZXhwb3J0cy5iZWZvcmVSZW5kZXIgPSBmdW5jdGlvbiAoY2IpIHtjYigpO307XG5cbi8vIEZpcmVkIGF1dG9tYXRpY2FsbHkgd2hlbiB0aGUgdmlldyBpcyBpbml0aWFsbHkgY3JlYXRlZFxuLy8gb25seSBmaXJlZCBhZnRlcndhcmRzIGlmIHRoaXMucmVuZGVyKCkgaXMgZXhwbGljaXRseSBjYWxsZWRcbmV4cG9ydHMuYWZ0ZXJSZW5kZXIgPSBmdW5jdGlvbiAoKSB7fTtcblxuLy8gRmlyZWQgYXV0b21hdGljYWxseSB3aGVuIHRoZSB2aWV3IGlzIGNsb3NlZFxuZXhwb3J0cy5iZWZvcmVDbG9zZSA9IGZ1bmN0aW9uIChjYikge2NiKCk7fTtcblxuLy8gRmlyZWQgYmVmb3JlIHJlcmVuZGVyaW5nIG9yIGNsb3NpbmcgYSB2aWV3IHRoYXQgaXMgYWxyZWFkeSB3YWl0aW5nIG9uIGEgbG9ja1xuZXhwb3J0cy5jYW5jZWxSZW5kZXIgPSBmdW5jdGlvbiAoKSB7XG5cdEZSQU1FV09SSy53YXJuKCdjYW5jZWxSZW5kZXIoKSBzaG91bGQgYmUgZGVmaW5lZCBpZiBiZWZvcmVDbG9zZShjYikgb3IgYmVmb3JlUmVuZGVyKGNiKScgK1xuXHRcdFx0XHRcdFx0XHRcdCAnYXJlIGJlaW5nIHVzZWQhJyk7XG59O1xuXG4vLyBGaXJlZCBiZWZvcmUgcmVyZW5kZXJpbmcgb3IgY2xvc2luZyBhIHZpZXcgdGhhdCBpcyBhbHJlYWR5IHdhaXRpbmcgb24gYSBsb2NrXG5leHBvcnRzLmNhbmNlbENsb3NlID0gZnVuY3Rpb24gKCkge1xuXHRGUkFNRVdPUksud2FybignY2FuY2VsQ2xvc2UoKSBzaG91bGQgYmUgZGVmaW5lZCBpZiBiZWZvcmVDbG9zZShjYikgb3IgYmVmb3JlUmVuZGVyKGNiKScgK1xuXHRcdFx0XHRcdFx0XHRcdCAnYXJlIGJlaW5nIHVzZWQhJyk7XG59O1xuIiwiLyoqXG4gKiBSdW4gSFRNTCB0ZW1wbGF0ZSB0aHJvdWdoIGVuZ2luZSBhbmQgYXBwZW5kIHJlc3VsdHMgdG8gb3V0bGV0LiBBbHNvIHJlcmVuZGVyIHJlZ2lvbnMuXG4gKiBJZiBhdEluZGV4IGlzIHNwZWNpZmllZCwgdGhlIGNvbXBvbmVudCBpcyByZW5kZXJlZCBhdCB0aGUgZ2l2ZW4gcG9zaXRpb24gd2l0aGluIGl0c1xuICogb3V0bGV0LiBPdGhlcndpc2UsIHRoZSBsYXN0IHBvc2l0aW9uIGlzIHVzZWQuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IGF0SW5kZXggW1RoZSBpbmRleCBpbiB3aGljaCB0byByZW5kZXIgdGhpcyBlbGVtZW50XVxuICovXG5cbnZhciBET00gPSByZXF1aXJlICgnLi4vdXRpbHMvRE9NJyksXG5cdFx0aGVscGVycyA9IHJlcXVpcmUoJy4vaGVscGVycycpLFxuXHRcdGJpbmRFdmVudHMgPSByZXF1aXJlICgnLi9iaW5kRXZlbnRzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcmVuZGVyKGF0SW5kZXgpIHtcblxuXHRGUkFNRVdPUksuZGVidWcodGhpcy5pZCArICcgOi0tLTogUmVuZGVyaW5nIGNvbXBvbmVudC4uLicpO1xuXG5cdHZhciBzZWxmID0gdGhpcztcblxuXHQvLyBDYW5jZWwgY3VycmVudCByZW5kZXIgYW5kIGNsb3NlIGpvYnMsIGlmIHRoZXkncmUgcnVubmluZ1xuXHRpZiAodGhpcy5fcmVuZGVyaW5nKSB7XG5cdFx0RlJBTUVXT1JLLmRlYnVnKHRoaXMuaWQgKyAnIDo6IHJlbmRlcigpIGNhbmNlbGVkLicpO1xuXHRcdHRoaXMuX3JlbmRlcmluZ0NhbmNlbGVkID0gdHJ1ZTtcblx0XHR0aGlzLmNhbmNlbFJlbmRlcigpO1xuXHRcdHRoaXMuX3JlbmRlcmluZyA9IGZhbHNlO1xuXHR9XG5cdGlmICh0aGlzLl9jbG9zaW5nKSB7XG5cdFx0RlJBTUVXT1JLLmRlYnVnKHRoaXMuaWQgKyAnIDo6IGNsb3NlKCkgY2FuY2VsZWQuJyk7XG5cdFx0dGhpcy5jYW5jZWxDbG9zZSgpO1xuXHRcdHRoaXMuX2Nsb3NpbmcgPSBmYWxzZTtcblx0fVxuXG5cdC8vIExvY2sgYWNjZXNzIHRvIHJlbmRlclxuXHR0aGlzLl9yZW5kZXJpbmcgPSB0cnVlO1xuXG5cdC8vIFRyaWdnZXIgYmVmb3JlUmVuZGVyIG1ldGhvZFxuXHR0aGlzLmJlZm9yZVJlbmRlcihmdW5jdGlvbiAoKSB7XG5cblx0XHQvLyBJZiByZW5kZXJpbmcgd2FzIGNhbmNlbGVkLCBicmVhayBvdXRcblx0XHQvLyBkbyBub3QgcmVuZGVyLCBhbmQgZG8gbm90IGNhbGwgYWZ0ZXJSZW5kZXIoKVxuXHRcdGlmICggc2VsZi5fcmVuZGVyaW5nQ2FuY2VsZWQgKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQmluZCB0aGUgZXZlbnRzIG9uIG1vZGVsL2NvbGxlY3Rpb25zIGFuZCBnbG9iYWwgdHJpZ2dlcmVkIGV2ZW50cy5cblx0XHRiaW5kRXZlbnRzLmNvbGxlY3Rpb25FdmVudHMuY2FsbChzZWxmKTtcblx0XHRiaW5kRXZlbnRzLm1vZGVsRXZlbnRzLmNhbGwoc2VsZik7XG5cdFx0YmluZEV2ZW50cy5nbG9iYWxUcmlnZ2Vycy5jYWxsKHNlbGYpO1xuXG5cdFx0Ly8gVW5sb2NrIHJlbmRlcmluZyBtdXRleFxuXHRcdHNlbGYuX3JlbmRlcmluZyA9IGZhbHNlO1xuXG5cdFx0aWYgKCFzZWxmLiRvdXRsZXQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihzZWxmLmlkICsgJyA6OiBUcnlpbmcgdG8gcmVuZGVyKCksIGJ1dCBubyAkb3V0bGV0IHdhcyBkZWZpbmVkIScpO1xuXHRcdH1cblxuXHRcdC8vIEh5ZHJhdGUgY29tcGlsZWQgdGVtcGxhdGVcblx0XHQvLyAoY29tYmluZXMgdGhlIHRlbXBsYXRlIGZ1bmN0aW9uIHdpdGggZGF0YSB0byByZXR1cm4gSFRNTClcblx0XHR2YXIgaHRtbCA9IGhlbHBlcnMuY29tcGlsZVRlbXBsYXRlLmNhbGwoc2VsZik7XG5cdFx0aWYgKCFodG1sKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IodGhpcy5pZCArICcgOjogVW5hYmxlIHRvIHJlbmRlciBjb21wb25lbnQgYmVjYXVzZSB0ZW1wbGF0ZSBjb21waWxhdGlvbiBkaWQgbm90IHJldHVybiBhbnkgSFRNTC4nKTtcblx0XHR9XG5cblx0XHQvLyBTdHJpcCB0cmFpbGluZyBhbmQgbGVhZGluZyB3aGl0ZXNwYWNlIHRvIGF2b2lkIGZhbHNlbHkgZGlhZ25vc2luZ1xuXHRcdC8vIG11bHRpcGxlIGVsZW1lbnRzLCB3aGVuIG9ubHkgb25lIGFjdHVhbGx5IGV4aXN0c1xuXHRcdC8vICh0aGlzIG1pc2RpYWdub3NpcyB3cmFwcyB0aGUgdGVtcGxhdGUgaW4gYW4gZXh0cmFuZW91cyA8ZGl2Pilcblx0XHRodG1sID0gaHRtbC5yZXBsYWNlKC9eXFxzKi8sICcnKTtcblx0XHRodG1sID0gaHRtbC5yZXBsYWNlKC9cXHMqJC8sICcnKTtcblx0XHRodG1sID0gaHRtbC5yZXBsYWNlKC8oXFxyfFxcbikqLywgJycpO1xuXG5cdFx0Ly8gU3RyaXAgSFRNTCBjb21tZW50cywgdGhlbiBzdHJpcCB3aGl0ZXNwYWNlIGFnYWluXG5cdFx0Ly8gKFRPRE86IG9wdGltaXplIHRoaXMpXG5cdFx0aHRtbCA9IGh0bWwucmVwbGFjZSgvKDwhLS0uKy0tPikqLywgJycpO1xuXHRcdGh0bWwgPSBodG1sLnJlcGxhY2UoL15cXHMqLywgJycpO1xuXHRcdGh0bWwgPSBodG1sLnJlcGxhY2UoL1xccyokLywgJycpO1xuXHRcdGh0bWwgPSBodG1sLnJlcGxhY2UoLyhcXHJ8XFxuKSovLCAnJyk7XG5cblx0XHQvLyBQYXJzZSBhIERPTSBub2RlIG9yIHNlcmllcyBvZiBET00gbm9kZXMgZnJvbSB0aGUgbmV3bHkgdGVtcGxhdGVkIEhUTUxcblx0XHR2YXIgcGFyc2VkTm9kZXMgPSAkLnBhcnNlSFRNTChodG1sKTtcblx0XHR2YXIgZWwgPSBwYXJzZWROb2Rlc1swXTtcblxuXHRcdC8vIElmIG5vIG5vZGVzIHdlcmUgcGFyc2VkLCB0aHJvdyBhbiBlcnJvclxuXHRcdGlmIChwYXJzZWROb2Rlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihzZWxmLmlkICsgJyA6OiByZW5kZXIoKSByYW4gaW50byBhIHByb2JsZW0gcmVuZGVyaW5nIHRoZSB0ZW1wbGF0ZSB3aXRoIEhUTUwgPT4gXFxuJytodG1sKTtcblx0XHR9XG5cblx0XHQvLyBJZiB0aGVyZSBpcyBub3Qgb25lIHNpbmdsZSB3cmFwcGVyIGVsZW1lbnQsXG5cdFx0Ly8gb3IgaWYgdGhlIHJlbmRlcmVkIHRlbXBsYXRlIGNvbnRhaW5zIG9ubHkgYSBzaW5nbGUgdGV4dCBub2RlLFxuXHRcdC8vIChvciBqdXN0IGEgbG9uZSByZWdpb24pXG5cdFx0ZWxzZSBpZiAocGFyc2VkTm9kZXMubGVuZ3RoID4gMSB8fCBwYXJzZWROb2Rlc1swXS5ub2RlVHlwZSA9PT0gMyB8fFxuXHRcdFx0XHRcdFx0ICQocGFyc2VkTm9kZXNbMF0pLmlzKCdyZWdpb24nKSB8fFxuXHRcdFx0XHRcdFx0ICQocGFyc2VkTm9kZXNbMF0pLmF0dHIoJ2RhdGEtcmVnaW9uJykgIT09IHVuZGVmaW5lZCApIHtcblxuXHRcdFx0RlJBTUVXT1JLLmxvZyhzZWxmLmlkICsgJyA6OiBXcmFwcGluZyB0ZW1wbGF0ZSBpbiA8ZGl2Lz4uLi4nLCBwYXJzZWROb2Rlcyk7XG5cblx0XHRcdC8vIHdyYXAgdGhlIGh0bWwgdXAgaW4gYSBjb250YWluZXIgPGRpdi8+XG5cdFx0XHRlbCA9ICQoJzxkaXYvPicpLmFwcGVuZChodG1sKTtcblx0XHRcdGVsID0gZWxbMF07XG5cdFx0fVxuXG5cdFx0Ly8gU2V0IEJhY2tib25lIGVsZW1lbnQgKGNhY2hlIGFuZCByZWRlbGVnYXRlIERPTSBldmVudHMpXG5cdFx0Ly8gKFdpbGwgYWxzbyB1cGRhdGUgc2VsZi4kZWwpXG5cdFx0c2VsZi5zZXRFbGVtZW50KGVsKTtcblx0XHQvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxuXG5cdFx0Ly8gRGV0ZWN0IGFuZCByZW5kZXIgYWxsIHJlZ2lvbnMgYW5kIHRoZWlyIGRlc2NlbmRlbnQgY29tcG9uZW50cyBhbmQgcmVnaW9uc1xuXHRcdGhlbHBlcnMucmVuZGVyUmVnaW9ucy5jYWxsKHNlbGYpO1xuXG5cdFx0Ly8gSW5zZXJ0IHRoZSBlbGVtZW50IGF0IHRoZSBwcm9wZXIgcGxhY2UgYW1vbmdzdCB0aGUgb3V0bGV0J3MgY2hpbGRyZW5cblx0XHR2YXIgbmVpZ2hib3JzID0gc2VsZi4kb3V0bGV0LmNoaWxkcmVuKCk7XG5cdFx0aWYgKF8uaXNGaW5pdGUoYXRJbmRleCkgJiYgbmVpZ2hib3JzLmxlbmd0aCA+IDAgJiYgbmVpZ2hib3JzLmxlbmd0aCA+IGF0SW5kZXgpIHtcblx0XHRcdG5laWdoYm9ycy5lcShhdEluZGV4KS5iZWZvcmUoc2VsZi4kZWwpO1xuXHRcdH1cblxuXHRcdC8vIEJ1dCBpZiB0aGUgb3V0bGV0IGlzIGVtcHR5LCBvciB0aGVyZSdzIG5vIGF0SW5kZXgsIGp1c3Qgc3RpY2sgaXQgb24gdGhlIGVuZFxuXHRcdGVsc2Ugc2VsZi4kb3V0bGV0LmFwcGVuZChzZWxmLiRlbCk7XG5cblxuXHRcdC8vIEZsYWcgd2l0aCBkYXRhLXRlbXBsYXRlLWlkIGF0dHJpYnV0ZVxuXHRcdC8vICh0byBtYWtlIHRlbXBsYXRlL2NvbXBvbmVudCBib3VuZGFyaWVzIGVhc2llciB0byBwaWNrIG91dCBpbiB0aGUgaW5zcGVjdG9yKVxuXHRcdHNlbGYuJGVsLmF0dHIoJ2RhdGEtdGVtcGxhdGUtaWQnLCBzZWxmLmlkKTtcblxuXG5cblxuXHRcdC8vXG5cdFx0Ly8gSWYgdGhlIHBhcmVudCBjb21wb25lbnQgaGFzIHJvdXRlIGxpc3RlbmVycyAoZS5nLiAjZm9vKVxuXHRcdC8vIHJ1biBhbnkgb2YgdGhlbSB0aGF0IG1hdGNoIGB3aW5kb3cubG9jYXRpb24uaGFzaGAuXG5cdFx0Ly8gKGFmdGVyIHJlbmRlcmluZyB0aGUgdGVtcGxhdGUgYW5kIHJlZ2lvbnMgYnV0IEJFRk9SRSB0aGUgYGFmdGVyUmVuZGVyYFxuXHRcdC8vIGxpZmVjeWNsZSBjYWxsYmFjayBpcyB0cmlnZ2VyZWQpXG5cdFx0Ly9cblx0XHQvLyBub3Qgc3VyZSBpZiB0aGlzIGlzIGEgZ29vZCBpZGVhIGluIGdlbmVyYWwtLSBtYXliZSBjb25maWd1cmFibGUuLj9cblx0XHQvLyBvciBvbmx5IGlmIGJhY2tib25lLmhpc3RvcnkgaXNuJ3QgcmVhZHkgeWV0P1xuXHRcdC8vXG5cdFx0Ly8gZGlzYWJsaW5nIGZvciBub3cuLi5cblx0XHQvLyBfLmVhY2goIE9iamVjdC5rZXlzKHNlbGYpLCBmdW5jdGlvbiAoa2V5KSB7XG5cdFx0Ly8gXHR2YXIgbWF0Y2hlZFJvdXRlID0ga2V5Lm1hdGNoKG5ldyBSZWdFeHAoJy9eJyArd2luZG93LmxvY2F0aW9uLmhhc2ggKyAnLycpKTtcblx0XHQvLyBcdGlmICghbWF0Y2hlZFJvdXRlKSByZXR1cm47XG5cblx0XHQvLyBcdHZhciBtYXRjaGVkUm91dGVMaXN0ZW5lciA9IHNlbGZbbWF0Y2hlZFJvdXRlXTtcblx0XHQvLyBcdG1hdGNoZWRSb3V0ZUxpc3RlbmVyKCk7XG5cdFx0Ly8gfSk7XG5cblxuXHRcdC8vIEZpbmFsbHksIHRyaWdnZXIgYWZ0ZXJSZW5kZXIgbWV0aG9kXG5cdFx0c2VsZi5hZnRlclJlbmRlcigpO1xuXG5cblx0XHQvLyBSdW4gZGF0YSBiaW5kaW5nc1xuXHRcdC8vIFRPRE86IGRvbid0IGNhbGwgdGhpcyBoZXJlLS0ganVzdCBkbyB3aGVuIGluaXRpYWxseSBpbnNlcnRpbmcgdGhlIHRlbXBsYXRlIGludG8gdGhlIERPTVxuXHRcdC8vICh0aGlzIGlzIGluZWZmaWNpZW50KVxuXHRcdGhlbHBlcnMucmVuZGVyRGF0YUJpbmRpbmdzLmNhbGwoc2VsZik7XG5cblxuXHRcdC8vIEFkZCBkYXRhIGF0dHJpYnV0ZXMgdG8gdGhpcyBjb21wb25lbnQncyAkZWwsIHByb3ZpZGluZyBhY2Nlc3Ncblx0XHQvLyB0byB3aGV0aGVyIHRoZSBlbGVtZW50IGhhcyB2YXJpb3VzIERPTSBiaW5kaW5ncyBmcm9tIHN0eWxlc2hlZXRzLlxuXHRcdC8vIChoYW5keSBmb3IgZGlzYWJsaW5nIHRleHQgc2VsZWN0aW9uIGFjY29yZGluZ2x5LCBldGMuKVxuXHRcdC8vXG5cdFx0Ly8gLT4gZGlzYWJsZSBmb3IgdGhpcyBjb21wb25lbnQgd2l0aCBgdGhpcy5hdHRyRmxhZ3MgPSBmYWxzZWBcblx0XHQvLyAtPiBvciBnbG9iYWxseSB3aXRoIGBGUkFNRVdPUksuYXR0ckZsYWdzID0gZmFsc2VgXG5cdFx0Ly9cblx0XHQvLyBUT0RPOiBtYWtlIGl0IHdvcmsgd2l0aCBkZWxlZ2F0ZWQgRE9NIGV2ZW50IGJpbmRpbmdzXG5cdFx0Ly9cblx0XHRpZiAoc2VsZi5hdHRyRmxhZ3MgIT09IGZhbHNlICYmIEZSQU1FV09SSy5hdHRyRmxhZ3MgIT09IGZhbHNlKSB7XG5cdFx0XHRET00uZmxhZ0JvdW5kRXZlbnRzKHNlbGYpO1xuXHRcdH1cblx0fSk7XG59O1xuIiwiXG4vKipcbiAqIFRPRE86XG4gKiBUcnkgb3V0IGEgZGlmZmVyZW50IGFwcHJvYWNoIGZvciB0aGUgbG9naWMgaW4gYHJlbmRlckNvbGxlY3Rpb25gXG4gKiBiZWxvdyBieSBvdmVybG9hZGluZyBgcmVnaW9uLmF0dGFjaCgpYC5cbiAqXG4gKiBFeGFtcGxlIHVzYWdlOiAoaW4gcGFyZW50IGNvbXBvbmVudClcbiAqID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gKiB0aGlzLnNvbWVSZWdpb24uYXR0YWNoKCdTb21lT3RoZXJDb21wb25lbnQnLHsgY29sbGVjdGlvbjogU29tZUNvbGxlY3Rpb24gfSlcbiAqXG4gKiAtb3ItXG4gKlxuICogdGhpcy5zb21lUmVnaW9uLnJlcGVhdCgnU29tZU90aGVyQ29tcG9uZW50Jyx7IGNvbGxlY3Rpb246IFNvbWVDb2xsZWN0aW9uIH0pXG4gKi9cblxuLyoqXG4gKiByZW5kZXJDb2xsZWN0aW9uKClcbiAqXG4gKiBSZXVzYWJsZSBsb2dpYyB0byByZW5kZXIgYSBjb2xsZWN0aW9uIGludG8gYSByZWdpb25cbiAqXG4gKiBUT0RPOiBtb3ZlIG9udG8gUmVnaW9uIG9iamVjdCBpbnN0ZWFkLi4uICBTZWUgZ2lzdC5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gY29sbGVjdGlvbiAtIGRhdGEgc291cmNlXG4gKiBAcGFyYW0ge09wdGlvbnN9IG9wdGlvbnNcbiAqXHRcdDogb3B0aW9ucy5pdGVtVGVtcGxhdGUge1N0cmluZ30gLSBuYW1lIG9mIHRlbXBsYXRlL2NvbXBvbmVudCB0byB1c2UgYXMgaXRlbVxuICpcdFx0OiBvcHRpb25zLmludG9SZWdpb24ge09iamVjdH0gLSB0aGUgZGVzdGluYXRpb24gcmVnaW9uXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGNvbGxlY3Rpb24sIG9wdGlvbnMpIHtcblxuXHQvLyBSZXF1aXJlZDpcblx0aWYgKHR5cGVvZiBjb2xsZWN0aW9uICE9PSAnb2JqZWN0JykgdGhyb3cgbmV3IEVycm9yKCdyZW5kZXJDb2xsZWN0aW9uIDo6IFVua25vd24vaW52YWxpZCBjb2xsZWN0aW9uLCBcIicgKyAoY29sbGVjdGlvbiAmJiBjb2xsZWN0aW9uLnR5cGUpICsgJ1wiJyk7XG5cdGlmICghb3B0aW9ucy5pdGVtVGVtcGxhdGUpIHRocm93IG5ldyBFcnJvcigncmVuZGVyQ29sbGVjdGlvbiA6OiBvcHRpb25zLml0ZW1UZW1wbGF0ZSByZXF1aXJlZCEnKTtcblx0aWYgKCFvcHRpb25zLmludG9SZWdpb24pIHRocm93IG5ldyBFcnJvcigncmVuZGVyQ29sbGVjdGlvbiA6OiBvcHRpb25zLmludG9SZWdpb24gcmVxdWlyZWQhJyk7XG5cblxuXHQvLyBEZXRlcm1pbmUgY29sbGVjdGlvbk5hbWVcblx0dmFyIGNvbGxlY3Rpb25OYW1lID0gY29sbGVjdGlvbi50eXBlO1xuXG5cdC8vIFRhcmdldCByZWdpb25cblx0dmFyIG91dGxldCA9IG9wdGlvbnMuaW50b1JlZ2lvbjtcblxuXHQvLyBTdWItY29tcG9uZW50XG5cdHZhciBzdWJjb21wb25lbnROYW1lID0gb3B0aW9ucy5pdGVtVGVtcGxhdGU7XG5cblx0Ly8gTmFtZSBvZiB0aGUgY29sbGVjdGlvbiBzdGF0ZSBhdHRyaWJ1dGUgdGhhdCB3aWxsZSBiZSBpbmplY3RlZCBpbnRvIHRoZSBIVE1MXG5cdC8vIFVzZWQgZm9yIHRoZSBkZWZhdWx0IHJlbmRlciBiZWhhdmlvci5cblx0dmFyIGJvZHlTdGF0ZUF0dHJpYnV0ZSA9ICdkYXRhLScgKyBjb2xsZWN0aW9uTmFtZSArICctc3RhdGUnO1xuXG5cblxuXG5cdC8qKlxuXHQgKiBEZWZhdWx0IHJlbmRlciBtZXRob2RzXG5cdCAqXG5cdCAqIE92ZXJyaWRlIGRlZmF1bHQgcmVuZGVyIG1ldGhvZHMgd2l0aCBvcHRpb25zIGlmIHNwZWNpZmllZFxuXHQgKi9cblxuXHQvLyBEZWZhdWx0IHJlbmRlciBsb2dpYyBmb3IgZXJyb3Igc3RhdGUgKGUuZy4gcmVkIHRleHQpXG5cdHZhciByZW5kZXJFcnJvciA9IG9wdGlvbnMucmVuZGVyRXJyb3IgfHwgZnVuY3Rpb24gcmVuZGVyRXJyb3IgKCkge1xuXHRcdEZSQU1FV09SSy5lcnJvcignQW4gZXJyb3Igb2NjdXJyZWQgd2hpbGUgbG9hZGluZyAnICsgY29sbGVjdGlvbk5hbWUgKyAnIDo6XFxuJywgY29sbGVjdGlvbi5lcnJvcik7XG5cblx0XHQvLyBTZXQgYSBkYXRhIGF0dHJpYnV0ZSBvbiBIVE1MIGJvZHlcblx0XHQkKCdib2R5JykuYXR0cihib2R5U3RhdGVBdHRyaWJ1dGUsICdlcnJvcicpO1xuXHR9O1xuXG5cdC8vIERlZmF1bHQgcmVuZGVyIGxvZ2ljIGZvciBsb2FkaW5nIHN0YXRlIChlLmcuIHNwaW5uZXIpXG5cdHZhciByZW5kZXJTeW5jaW5nID0gb3B0aW9ucy5yZW5kZXJTeW5jaW5nIHx8IGZ1bmN0aW9uIHJlbmRlclN5bmNpbmcoKSB7XG5cdFx0RlJBTUVXT1JLLmxvZygnTG9hZGluZyAnICsgY29sbGVjdGlvbk5hbWUgKyAnLi4uJyk7XG5cblx0XHQvLyBTZXQgc3RhdGUgYXR0cmlidXRlIG9uIEhUTUwgYm9keVxuXHRcdCQoJ2JvZHknKS5hdHRyKGJvZHlTdGF0ZUF0dHJpYnV0ZSwgJ3N5bmNpbmcnKTtcblx0fTtcblxuXHQvLyBEZWZhdWx0IHJlbmRlciBsb2dpYyB0byBjbGVhbiB1cCBhZnRlciBhIHN1Y2Nlc3NmdWwgc3luYy9sb2FkXG5cdHZhciByZW5kZXJTeW5jZWQgPSBvcHRpb25zLnJlbmRlclN5bmNlZCB8fCBmdW5jdGlvbiByZW5kZXJTeW5jZWQoKSB7XG5cdFx0RlJBTUVXT1JLLmxvZyhjb2xsZWN0aW9uLmxlbmd0aCArICcgJyArIGNvbGxlY3Rpb25OYW1lICsgJyBmZXRjaGVkIHN1Y2Nlc3NmdWxseS4nKTtcblxuXHRcdC8vIFNldCBzdGF0ZSBhdHRyaWJ1dGUgb24gSFRNTCBib2R5XG5cdFx0JCgnYm9keScpLmF0dHIoYm9keVN0YXRlQXR0cmlidXRlLCAncmVhZHknKTtcblx0fTtcblxuXHQvLyBEZWZhdWx0IHJlbmRlciBsb2dpYyBmb3IgaXRlbXMgaW4gY29sbGVjdGlvblxuXHR2YXIgcmVuZGVyUmVzZXQgPSBvcHRpb25zLnJlbmRlclJlc2V0IHx8IGZ1bmN0aW9uIHJlbmRlclJlc2V0KCkge1xuXG5cdFx0Ly8gQ2xlYW4gb3V0IHRoZSByZWdpb24sIHdyYXAgaW4gYSB0cnkvY2F0Y2ggdG8gc3RvcCB0aGUgZXhlY3V0aW9uXG5cdFx0dHJ5IHtcblx0XHRcdG91dGxldC5lbXB0eSgpO1xuXHRcdH0gY2F0Y2ggKGUpIHt9XG5cblxuXHRcdC8vIFRPRE86IFNtYXJ0IG1lcmdlIHRvIG1pbmltaXplIERPTSBxdWVyaWVzXG5cdFx0Y29sbGVjdGlvbi5lYWNoKGZ1bmN0aW9uIChtb2RlbCkge1xuXHRcdFx0Ly8gRm9yIGVhY2ggbW9kZWwgZm91bmQsIGFwcGVuZCBhIHN1YmNvbXBvbmVudCB0byB0aGUgcmVnaW9uXG5cdFx0XHRvdXRsZXQuYXBwZW5kKHN1YmNvbXBvbmVudE5hbWUsIHsgbW9kZWw6IG1vZGVsIH0pO1xuXHRcdH0pO1xuXHR9O1xuXG5cdC8qKlxuXHQgKiByZW5kZXJBZGQgKCBtb2RlbCwgW2F0SW5kZXhdIClcblx0ICpcblx0ICogQHBhcmFtIHtNb2RlbH0gbW9kZWxcdFx0XHRcdFx0XHQtIHRoZSBCYWNrYm9uZSBtb2RlbCB0aGF0IHdhcyBhZGRlZFxuXHQgKiBAcGFyYW0ge0ludGVnZXJ9IGF0SW5kZXhcdFx0XHRcdC0gKG9wdGlvbmFsLSBkZWZhdWx0cyB0byBjb2xsZWN0aW9uLmxlbmd0aClcblx0ICpcblx0ICogRGVmYXVsdCByZW5kZXIgbG9naWMgZm9yIHRoZSBjYXNlIHdoZXJlIGFuIGl0ZW0gaXMgYWRkZWQgdG8gdGhlIGNvbGxlY3Rpb24uXG5cdCAqL1xuXHR2YXIgcmVuZGVyQWRkID0gb3B0aW9ucy5yZW5kZXJBZGQgfHwgZnVuY3Rpb24gcmVuZGVyQWRkKCBtb2RlbCwgYXRJbmRleCApIHtcblx0XHRpZiAoIHR5cGVvZiBhdEluZGV4ID09PSAnbnVtYmVyJykge1xuXHRcdFx0cmV0dXJuIG91dGxldC5pbnNlcnQoYXRJbmRleCwgc3ViY29tcG9uZW50TmFtZSwgeyBtb2RlbDogbW9kZWwgfSk7XG5cdFx0fVxuXHRcdHJldHVybiBvdXRsZXQuYXBwZW5kKHN1YmNvbXBvbmVudE5hbWUsIHsgbW9kZWw6IG1vZGVsIH0pO1xuXHR9O1xuXG5cdC8qKlxuXHQgKiByZW5kZXJSZW1vdmUoIGF0SW5kZXggKVxuXHQgKlxuXHQgKiBAcGFyYW0ge0ludGVnZXJ9IGF0SW5kZXhcdFx0XHQtIHRoZSBmb3JtZXIgaW5kZXggb2YgdGhlIEJhY2tib25lIG1vZGVsIHRoYXQgd2FzIHJlbW92ZWRcblx0ICpcblx0ICogRGVmYXVsdCByZW5kZXIgbG9naWMgZm9yIHRoZSBjYXNlIHdoZXJlIGFuIGl0ZW0gaXMgcmVtb3ZlZCBmcm9tIHRoZSBjb2xsZWN0aW9uLlxuXHQgKi9cblx0dmFyIHJlbmRlclJlbW92ZSA9IG9wdGlvbnMucmVuZGVyUmVtb3ZlIHx8IGZ1bmN0aW9uIHJlbmRlclJlbW92ZSggYXRJbmRleCApIHtcblx0XHRvdXRsZXQucmVtb3ZlKCBhdEluZGV4ICk7XG5cdH07XG5cblxuXG5cblxuXG5cdC8qKlxuXHQgKiBCb290c3RyYXBcblx0ICpcblx0ICogUmVuZGVycyBpbml0aWFsIHN0YXRlIG9mIGNvbGxlY3Rpb24gaW50byBvdXIgcmVnaW9uXG5cdCAqIHVzaW5nIG91ciBjaGlsZCB0ZW1wbGF0ZS5cblx0ICovXG5cblx0Ly8gSWYgb3VyIGNvbGxlY3Rpb24gaXMgZmV0Y2hpbmcsIHJlbmRlciB0aGUgZmV0Y2hpbmcgKGxvYWRpbmcpIHN0YXRlLlxuXHRpZiAoY29sbGVjdGlvbi5zeW5jaW5nKSB7XG5cdFx0cmVuZGVyU3luY2luZygpO1xuXHR9XG5cblxuXHQvLyBJZiBvdXIgY29sbGVjdGlvbiBmYWlsZWQgdG8gZmV0Y2ggKGkuZS4gcmVjZWl2ZWQgYSA0eHggb3IgNXh4IGVycm9yIGNvZGUpXG5cdC8vIHJlbmRlciBhbiBlcnJvciBzdGF0ZVxuXHQvL1xuXHQvLyBIYW5kbGUgdGhlIGNhc2Ugb2YgbXVsdGlwbGUgZXJyb3Igc3RhdGVzIHdpdGggZGlmZmVyZW50IHN0eWxlcyBoZXJlIGFzIHdlbGwuXG5cdGVsc2UgaWYgKGNvbGxlY3Rpb24uZXJyb3IpIHtcblx0XHRyZW5kZXJFcnJvcigpO1xuXHR9XG5cblxuXHQvLyBPdGhlcndpc2Ugb3VyIGNvbGxlY3Rpb24gaXMgbG9hZGVkIGFuZCByZWFkeSxcblx0Ly8gc28gZ28gYWhlYWQgYW5kIHJlbmRlciBpdCBpbnRvIHRoZSB0YXJnZXQgcmVnaW9uLlxuXHQvL1xuXHQvLyAoYWx0ZXJuYXRpdmVseSBhdCB0aGlzIHBvaW50LCBhIGN1c3RvbSBgZW1wdHlgIHN0YXRlIG1heSBiZSByZW5kZXJlZClcblx0Ly8gY29uc29sZS5sb2coJ1RoZSBjb2xsZWN0aW9uICcgKyBzdWJjb21wb25lbnROYW1lICsgJy0tLS0+Jyk7XG5cdGVsc2UgcmVuZGVyUmVzZXQoKTtcblxuXG5cblxuXG5cblxuXHQvKipcblx0ICogQmluZCBldmVudHNcblx0ICpcblx0ICogTGlzdGVuIGZvciBzdGF0ZSBjaGFuZ2VzIChzeW5jaW5nLCBzeW5jZWQsIHNlcnZlciBlcnJvciwgYWRkLCByZW1vdmUsIHNvcnQsIGV0Yy4pXG5cdCAqIFRoZXNlIG1hbnVhbCBiaW5kaW5ncyBjYW4gYmUgcmVtb3ZlZCB3aGVuIGNvcmUgZnJhbWV3b3JrIHN1cHBvcnRzIHJlbmRlci10aW1lIGNvbGxlY3Rpb25cblx0ICogYmluZGluZ3MuICBGb3Igbm93LCBkb2luZyBpdCB0aGlzIHdheSByYXRoZXIgdGhhbiBwYXRjaGluZyB0aGUgY29yZSB0byB0ZXN0IG91ciBzdHJ1Y3R1cmFsXG5cdCAqIGFzc3VtcHRpb25zLlxuXHQgKi9cblxuXHQvLyBXaGVuIGEgZmV0Y2ggaXMgaW5pdGlhdGVkIGZyb20gdGhlIHNlcnZlci4uLlxuXHQvL1xuXHQvLyAoYWZ0ZXIgYEJhY2tib25lLnN5bmNgIGJlZ2lucyBhIHJlbW90ZSByZXF1ZXN0KVxuXHR0aGlzLmxpc3RlblRvKGNvbGxlY3Rpb24sICdyZXF1ZXN0JywgZnVuY3Rpb24gYWZ0ZXJSZXF1ZXN0ICgpIHtcblx0XHRyZW5kZXJTeW5jaW5nKCk7XG5cdH0pO1xuXG5cdC8vIFdoZW4gYSBmZXRjaCBjb21wbGV0ZXMgc3VjY2Vzc2Z1bGx5IGFuZCBuZXcgZGF0YSBpcyBsb2FkZWQuLi5cblx0Ly9cblx0Ly8gKGFmdGVyIHRoaXMgY29tcG9uZW50IGlzIGFscmVhZHkgaW5zdGFudGlhdGVkKVxuXHR0aGlzLmxpc3RlblRvKGNvbGxlY3Rpb24sICdzeW5jJywgZnVuY3Rpb24gYWZ0ZXJTeW5jICgpIHtcblx0XHRyZW5kZXJTeW5jZWQoKTtcblx0XHRyZW5kZXJSZXNldCgpO1xuXHR9KTtcblxuXHQvLyBXaGVuIHNlcnZlciBzZW5kcyBhIHJlc3BvbnNlIHcvIGFuIGVycm9yIGNvZGVcblx0Ly9cblx0Ly8gKGFmdGVyIHRoaXMgY29tcG9uZW50IGlzIGFscmVhZHkgaW5zdGFudGlhdGVkKVxuXHR0aGlzLmxpc3RlblRvKGNvbGxlY3Rpb24sICdlcnJvcicsIGZ1bmN0aW9uIGFmdGVyU3luY0Vycm9yIChjb2xsZWN0aW9uLCB4aHIpIHtcblxuXHRcdC8vIElnbm9yZSBhYm9ydCBcImVycm9yXCJcblx0XHQvL1xuXHRcdC8vIFdoeT8gYmVjYXVzZSBpdCdzIG5vdCBhY3R1YWxseSBhbiBlcnJvci5cblx0XHQvLyBOb3Qgc3VyZSB3aHkgdGhpcyB0cmlnZ2VycyBCYWNrYm9uZS5Db2xsZWN0aW9uJ3MgYGVycm9yYCBldmVudC4uLlxuXHRcdC8vXG5cdFx0Ly8gSWYgdHdvIGZldGNoZXMgb2NjdXIgb24gdGhlIHNhbWUgY29sbGVjdGlvbiBhdCB0aGUgc2FtZSB0aW1lLFxuXHRcdC8vIHdlIGFib3J0IHRoZSBvbGQgWEhSIHJlcXVlc3Qgb3Vyc2VsdmVzIGlmIGl0J3Mgc3RpbGwgcnVubmluZylcblx0XHRpZiAoeGhyICYmIHhoci5zdGF0dXNUZXh0ID09PSAnYWJvcnQnKSByZXR1cm47XG5cblx0XHRyZW5kZXJFcnJvcigpO1xuXHR9KTtcblxuXHQvLyBXaGVuIGEgbW9kZWwgaXMgYWRkZWQuLi5cblx0Ly9cblx0Ly8gTGlzdGVuIGZvciBuZXcgbW9kZWxzLCBhbmQgaW5zZXJ0IGEgY2hpbGQgdGVtcGxhdGVcblx0Ly8gYXQgdGhlIGFwcHJvcHJpYXRlIGluZGV4IHdpdGhpbiB0aGUgcmVnaW9uLlxuXHR0aGlzLmxpc3RlblRvKGNvbGxlY3Rpb24sICdhZGQnLCBmdW5jdGlvbiBhZnRlckFkZCAoIG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zICkge1xuXHRcdHJlbmRlckFkZCggbW9kZWwsIG9wdGlvbnMuYXQgKTtcblx0fSk7XG5cblx0Ly8gV2hlbiBhIG1vZGVsIGlzIHJlbW92ZWQuLi5cblx0Ly9cblx0Ly8gR3JhYiBtb2RlbCdzIHJlbGF0aXZlIGluZGV4IHdpdGhpbiBjb2xsZWN0aW9uIGFuZCByZW1vdmVcblx0Ly8gdGhlIGNoaWxkIHRlbXBsYXRlIGF0IHRoZSBzYW1lIGluZGV4IHdpdGhpbiB0aGUgcmVnaW9uLlxuXHR0aGlzLmxpc3RlblRvKGNvbGxlY3Rpb24sICdyZW1vdmUnLCBmdW5jdGlvbiBhZnRlclJlbW92ZSAoIG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zICkge1xuXHRcdHJlbmRlclJlbW92ZSggb3B0aW9ucy5pbmRleCApO1xuXHR9KTtcblxuXG5cbn07XG4iLCIvKipcbiAqIENoZWNrIHRoZSBzcGVjaWZpZWQgZGVmaW5pdGlvbiBmb3Igb2J2aW91cyBtaXN0YWtlcywgZXNwZWNpYWxseSBsaWtlbHkgZGVwcmVjYXRpb25zIGFuZFxuICogdmFsaWRhdGUgdGhhdCB0aGUgbW9kZWwgYW5kIGNvbGxlY3Rpb25zIGFyZSBpbnN0YW5jZXMgb2YgQmFja2JvbmUncyBEYXRhIHN0cnVjdHVyZXMuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IHByb3BlcnRpZXMgW09iamVjdCBjb250YWluaW5nIHRoZSBwcm9wZXJ0aWVzIG9mIHRoZSBjb21wb25lbnRdXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB2YWxpZGF0ZURlZmluaXRpb24ocHJvcGVydGllcykge1xuXG5cdGlmIChfLmlzT2JqZWN0KHByb3BlcnRpZXMpKSB7XG5cblx0XHQvLyBEZXRlcm1pbmUgY29tcG9uZW50IGlkXG5cdFx0dmFyIGlkID0gdGhpcy5pZCB8fCBwcm9wZXJ0aWVzLmlkO1xuXG5cdFx0ZnVuY3Rpb24gX3ZhbGlkYXRlQmFja2JvbmVJbnN0YW5jZSAodHlwZSkge1xuXHRcdFx0dmFyIFR5cGUgPSB0eXBlWzBdLnRvVXBwZXJDYXNlKCkgKyB0eXBlLnNsaWNlKDEpO1xuXG5cdFx0XHRpZiAoICFwcm9wZXJ0aWVzW3R5cGVdIGluc3RhbmNlb2YgQmFja2JvbmVbVHlwZV0gKSB7XG5cblx0XHRcdFx0RnJhbWV3b3JrLmVycm9yKFxuXHRcdFx0XHRcdCdDb21wb25lbnQgKCcgKyBpZCArICcpIGhhcyBhbiBpbnZhbGlkICcgKyB0eXBlICsgJy0tIFxcbicgK1xuXHRcdFx0XHRcdCdJZiBgJyArIHR5cGUgKyAnYCBpcyBzcGVjaWZpZWQgZm9yIGEgY29tcG9uZW50LCAnICtcblx0XHRcdFx0XHQnaXQgbXVzdCBiZSBhbiAqaW5zdGFuY2UqIG9mIGEgQmFja2JvbmUuJyArIFR5cGUgKyAnLlxcbicpO1xuXG5cdFx0XHRcdGlmIChwcm9wZXJ0aWVzW3R5cGVdIGluc3RhbmNlb2YgQmFja2JvbmVbVHlwZV0uY29uc3RydWN0b3IpIHtcblx0XHRcdFx0XHRGcmFtZXdvcmsuZXJyb3IoXG5cdFx0XHRcdFx0XHQnSXQgbG9va3MgbGlrZSBhIEJhY2tib25lLicgKyBUeXBlICsgJyAqcHJvdG90eXBlKiB3YXMgc3BlY2lmaWVkIGluc3RlYWQgb2YgYSAnICtcblx0XHRcdFx0XHRcdCdCYWNrYm9uZS4nICsgVHlwZSArICcgKmluc3RhbmNlKi5cXG4nICtcblx0XHRcdFx0XHRcdCdQbGVhc2UgYG5ld2AgdXAgdGhlICcgKyB0eXBlICsgJyAtYmVmb3JlLSAnICsgRnJhbWV3b3JrLmlkICsgJy5yYWlzZSgpLCcgK1xuXHRcdFx0XHRcdFx0J29yIHVzZSBhIHdyYXBwZXIgZnVuY3Rpb24gdG8gYWNoaWV2ZSB0aGUgc2FtZSBlZmZlY3QsIGUuZy46XFxuJyArXG5cdFx0XHRcdFx0XHQnYCcgKyB0eXBlICsgJzogZnVuY3Rpb24gKCkge1xcbnJldHVybiBuZXcgU29tZScgKyBUeXBlICsgJygpO1xcbn1gJ1xuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRGcmFtZXdvcmsud2FybignSWdub3JpbmcgaW52YWxpZCAnICsgdHlwZSArICcgOjogJyArIHByb3BlcnRpZXNbdHlwZV0pO1xuXHRcdFx0XHRkZWxldGUgcHJvcGVydGllc1t0eXBlXTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDaGVjayB0aGF0IHRoaXMuY29sbGVjdGlvbiBpcyBhY3R1YWxseSBhbiBpbnN0YW5jZSBvZiBCYWNrYm9uZS5Db2xsZWN0aW9uXG5cdFx0Ly8gYW5kIHRoYXQgdGhpcy5tb2RlbCBpcyBhY3R1YWxseSBhbiBpbnN0YW5jZSBvZiBCYWNrYm9uZS5Nb2RlbFxuXHRcdF92YWxpZGF0ZUJhY2tib25lSW5zdGFuY2UoJ21vZGVsJyk7XG5cdFx0X3ZhbGlkYXRlQmFja2JvbmVJbnN0YW5jZSgnY29sbGVjdGlvbicpO1xuXG5cdFx0Ly8gQ2xvbmUgcHJvcGVydGllcyB0byBhdm9pZCBpbmFkdmVydGVudCBtb2RpZmljYXRpb25zXG5cdFx0cmV0dXJuIF8uY2xvbmUocHJvcGVydGllcyk7XG5cdH1cblxuXHRlbHNlIHJldHVybiB7fTtcblxufVxuIiwiLyoqXG4gKiBSdW4gZGVmaW5pdGlvbiBtZXRob2RzIHRvIGdldCBhY3R1YWwgY29tcG9uZW50IGRlZmluaXRpb25zLlxuICogVGhpcyBpcyBkZWZlcnJlZCB0byBhdm9pZCBoYXZpbmcgdG8gdXNlIEJhY2tib25lJ3MgZnVuY3Rpb24gKCkge30gYXBwcm9hY2ggZm9yIHRoaW5nc1xuICogbGlrZSBjb2xsZWN0aW9ucy5cbiAqL1xuXG4vKipcbiAqIEJ1aWxkIHVwcyBhIGNvbXBvbmVudCBkZWZpbml0aW9uIGJ5IHJ1bm5pbmcgdGhlIGRlZmluaXRpb24uIFdlIHRoZW4gbGluayB0aGVcbiAqIGNvbXBvbmVudCBkZWZpbml0aW9uIHRvIGFuIGlkZW50aWZpZXIgaW4gYEZSQU1FV09SSy5jb21wb25lbnRzYC5cbiAqXG4gKiBAcGFyYW0gIHtPYmplY3R9IGNvbXBvbmVudCBbT2JqZWN0IGNvbnRhaW5pbmcgdGhlIGRlZmluaXRpb24gZnVuY3Rpb24gb2YgdGhlIGNvbXBvbmVudF1cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBidWlsZENvbXBvbmVudERlZmluaXRpb24oY29tcG9uZW50KSB7XG5cdHZhciBjb21wb25lbnREZWYgPSBjb21wb25lbnQuZGVmaW5pdGlvbigpO1xuXG5cdGlmIChjb21wb25lbnQuaWRPdmVycmlkZSkge1xuXHRcdGlmIChjb21wb25lbnREZWYuaWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihjb21wb25lbnQuaWRPdmVycmlkZSArICc6OiBDYW5ub3Qgc3BlY2lmeSBhbiBpZE92ZXJyaWRlIGluIC5kZWZpbmUoKSBpZiBhbiBpZCBwcm9wZXJ0eSAoJytjb21wb25lbnREZWYuaWQrJykgaXMgYWxyZWFkeSBzZXQgaW4geW91ciBjb21wb25lbnQgZGVmaW5pdGlvbiFcXG5Vc2FnZTogLmRlZmluZShbaWRPdmVycmlkZV0sIGRlZmluaXRpb24pJyk7XG5cdFx0fVxuXHRcdGNvbXBvbmVudERlZi5pZCA9IGNvbXBvbmVudC5pZE92ZXJyaWRlO1xuXHR9XG5cdGlmICghY29tcG9uZW50RGVmLmlkKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgdXNlIC5kZWZpbmUoKSB3aXRob3V0IGRlZmluaW5nIGFuIGlkIHByb3BlcnR5IG9yIG92ZXJyaWRlIGluIHlvdXIgY29tcG9uZW50IVxcblVzYWdlOiAuZGVmaW5lKFtpZE92ZXJyaWRlXSwgZGVmaW5pdGlvbiknKTtcblx0fVxuXHRGUkFNRVdPUksuY29tcG9uZW50c1tjb21wb25lbnREZWYuaWRdID0gY29tcG9uZW50RGVmO1xufTtcbiIsIi8qKlxuICogT3B0aW9uYWwgbWV0aG9kIHRvIHJlcXVpcmUgYXBwIGNvbXBvbmVudHMuIFJlcXVpcmUuanMgY2FuIGJlIHVzZWQgaW5zdGVhZFxuICogYXMgbmVlZGVkLlxuICpcbiAqIEBwYXJhbSAge1N0cmluZ30gXHRbKG9wdGlvbmFsKSBDb21wb25lbnQgaWQgb3ZlcnJpZGVdXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gW0Z1bmN0aW9uIERlZmluaXRpb24gb2YgY29tcG9uZW50XVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGRlZmluZShpZCwgZGVmaW5pdGlvbkZuKSB7XG5cdC8vIElkIHBhcmFtIGlzIG9wdGlvbmFsXG5cdGlmICghZGVmaW5pdGlvbkZuKSB7XG5cdFx0ZGVmaW5pdGlvbkZuID0gaWQ7XG5cdFx0aWQgPSBudWxsO1xuXHR9XG5cblx0RlJBTUVXT1JLLl9kZWZpbmVRdWV1ZS5wdXNoKHtcblx0XHRkZWZpbml0aW9uOiBkZWZpbml0aW9uRm4sXG5cdFx0aWRPdmVycmlkZTogaWRcblx0fSk7XG59O1xuIiwiLyoqXG4gKiBNYXN0IGJ1aWxkIGZpbGUuIFRoZSBtYWluIGZpbGVcbiAqL1xuXG52YXIgZGVmaW5lID0gcmVxdWlyZSgnLi9kZWZpbmUvaW5kZXgnKTtcbnZhciBSZWdpb24gPSByZXF1aXJlKCcuL3JlZ2lvbi9pbmRleCcpO1xudmFyIENvbXBvbmVudCA9IHJlcXVpcmUoJy4vY29tcG9uZW50L2luZGV4Jyk7XG52YXIgcmFpc2UgPSByZXF1aXJlKCcuL3JhaXNlL2luZGV4Jyk7XG5cbi8qKlxuICogRnJhbWV3b3JrIGNsYXNzIGRlZmluaXRpb24gdGhhdCB3aWxsIGNyZWF0ZSBhIG5ldyBnbG9iYWwgaW5zdGFuY2Ugb2YgYSBjdXN0b20gRnJhbWV3b3JrLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIFtvcHRpb25zIGhhc2ggdG8gaW5pdGlhbGl6ZSB0aGUgY3VzdG9tIGZyYW1ld29yayB3aXRoXVxuICovXG52YXIgRnJhbWV3b3JrID0gZnVuY3Rpb24ob3B0aW9ucykge1xuXG5cdC8vIFNldCB0aGUgZGVmYXVsdCBvcHRpb25zIGZvciB0aG9zZSBub3QgcGFzc2VkIGluLlxuXHRvcHRpb25zID0gXy5kZWZhdWx0cyhvcHRpb25zIHx8IHt9LCB7XG5cdFx0dGhyb3R0bGVXaW5kb3dSZXNpemU6IDIwMCxcblx0XHRsb2dMZXZlbDogJ3dhcm4nLFxuXHRcdGZyYW1ld29ya0lkOiAnbWFzdCcsXG5cdFx0cHJvZHVjdGlvbjogZmFsc2UsXG5cdFx0bG9nZ2VyOiB1bmRlZmluZWQsXG5cdFx0c2hvcnRjdXQ6IHtcblx0XHRcdHRlbXBsYXRlOiB0cnVlLFxuXHRcdFx0Y291bnQ6IHRydWVcblx0XHR9XG5cdH0pO1xuXG5cdC8vIFNldCBhIHN0YXJ0aW5nIHBvaW50IHRvIEJhY2tib25lIGFuZCBhZGQgYWRkaXRpb25hbCBhdHRyaWJ1dGUuXG5cdF8uZXh0ZW5kKHRoaXMsIEJhY2tib25lLCB7XG5cdFx0b3B0aW9uczogb3B0aW9ucyxcblx0XHR0ZW1wbGF0ZXM6IHt9LFxuXHRcdGNvbXBvbmVudHM6IHt9LFxuXHRcdGRhdGE6IHt9LFxuXHRcdF9kZWZpbmVRdWV1ZTogW10sXG5cdFx0cmVnaW9uczoge31cblx0fSk7XG5cblx0LyoqXG5cdCAqIEV4dGVuZCBGUkFNRVdPUksuQ29sbGVjdGlvbiB0byBtYWtlIGl0IGJldHRlclxuXHQgKiAoc3BlY2lmaWNhbGx5LCB0byBhZGQgZXJyb3IgaGFuZGxpbmcpXG5cdCAqL1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdHZhciBvcmlnaW5hbENvbGxlY3Rpb24gPSB0aGlzLkNvbGxlY3Rpb247XG5cdHRoaXMuQ29sbGVjdGlvbiA9IG9yaWdpbmFsQ29sbGVjdGlvbi5leHRlbmQoe1xuXG5cdFx0aW5pdGlhbGl6ZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcblxuXHRcdFx0Ly8gT3ZlcnJpZGUgYGNvbGxlY3Rpb24uZmV0Y2goKWBcblx0XHRcdHRoaXMuX2ZldGNoID0gdGhpcy5mZXRjaDtcblx0XHRcdHRoaXMuZmV0Y2ggPSB0aGlzWydfZmV0Y2grKyddO1xuXHRcdH0sXG5cblxuXHRcdC8qKlxuXHRcdCAqIGFmdGVyRXJyb3Jcblx0XHQgKlxuXHRcdCAqIExpZmVjeWNsZSBjYWxsYmFjayB0byBjYXRjaCB3aGVuIGEgZmV0Y2ggZXJyb3Igb2NjdXJzXG5cdFx0ICpcblx0XHQgKiBUT0RPOlxuXHRcdCAqIFByb2JhYmx5IHJlbW92ZSB0aGlzLS0gcmVhc29uaW5nIDo6XG5cdFx0ICogSW4gbW9zdCBjYXNlcywgeW91IGFjdHVhbGx5IGNhcmUgYWJvdXQgdGhlIGVycm9yIGluXG5cdFx0ICogdGhlIHJlbGV2YW50IGNvbXBvbmVudHMgd2hvIGFyZSB1c2luZyB0aGlzIGNvbGxlY3Rpb24sXG5cdFx0ICogaW4gd2hpY2ggY2FzZSB5b3UnZCBqdXN0IGJpbmQgYW4gZXJyb3IgZXZlbnQgaGFuZGxlci5cblx0XHQgKi9cblx0XHRhZnRlckVycm9yOiBmdW5jdGlvbiAoY29sbGVjdGlvbiwgeGhyLCBvcHRpb25zKSB7XG5cdFx0XHQvLyB0aGlzIGV4aXN0cyBmb3IgeW91IHRvIG92ZXJyaWRlIGl0IVxuXHRcdH0sXG5cblxuXG5cblx0XHQvKipcblx0XHQgKiBPdmVycmlkZSBCYWNrYm9uZS5Db2xsZWN0aW9uJ3MgYGZldGNoKClgXG5cdFx0ICogdG8gYWxsb3cgZm9yIGJldHRlciBlcnJvciBoYW5kbGluZy5cblx0XHQgKlxuXHRcdCAqIFRPRE86IHB1bGwgdGhpcyBpbnRvIEJhY2tib25lLnN5bmMgaW5zdGVhZC4uXG5cdFx0ICogb25seSBwcm9ibGVtIGlzIGNsYXNoaW5nIHdpdGggb3RoZXIgc3luYyBvdmVycmlkZXNcblx0XHQgKi9cblx0XHQnX2ZldGNoKysnOiBmdW5jdGlvbiAob3B0aW9ucykge1xuXHRcdFx0dmFyIGNvbGxlY3Rpb24gPSB0aGlzO1xuXG5cdFx0XHRvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblxuXHRcdFx0Ly8gTG9nIGEgZnJpZW5kbGllciBcIk5vIFVSTFwiIG1lc3NhZ2U6XG5cdFx0XHRpZiAoICFjb2xsZWN0aW9uLnVybCApIHtcblx0XHRcdFx0c2VsZi5lcnJvcignQ2Fubm90IGZldGNoKCkgJyArIGNvbGxlY3Rpb24udHlwZSArICcgOjogQ29sbGVjdGlvbiBoYXMgbm8gVVJMIGZ1bmN0aW9uL3Byb3BlcnR5Li4uJyk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gT3ZlcnJpZGUgZXJyb3IgaGFuZGxlciB0byBtaXhpbiBhbiAnZXJyb3InIGV2ZW50XG5cdFx0XHR2YXIgb3JpZ2luYWxFcnJvckhhbmRsZXIgPSBvcHRpb25zLmVycm9yO1xuXHRcdFx0dmFyIG9yaWdpbmFsU3VjY2Vzc0hhbmRsZXIgPSBvcHRpb25zLnN1Y2Nlc3M7XG5cdFx0XHRfLmV4dGVuZChvcHRpb25zLCB7XG5cdFx0XHRcdHN1Y2Nlc3M6IGZ1bmN0aW9uIChjb2xsZWN0aW9uLCB4aHIsIG9wdGlvbnMpIHtcblx0XHRcdFx0XHR2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG5cblx0XHRcdFx0XHQvLyBOdWxsIG91dCBgY29sbGVjdGlvbi5zeW5jaW5nYFxuXHRcdFx0XHRcdGNvbGxlY3Rpb24uc3luY2luZyA9IG51bGw7XG5cblx0XHRcdFx0XHQvLyBUcmlnZ2VyIG9yaWdpbmFsIHN1Y2Nlc3MgaGFuZGxlciBpZiBzcGVjaWZpZWRcblx0XHRcdFx0XHQvLyBvbiBgZmV0Y2goe3N1Y2Nlc3M6IGZ1bmN0aW9uKCl7LyouLi4qL319KWBcblx0XHRcdFx0XHRpZiAob3JpZ2luYWxTdWNjZXNzSGFuZGxlcikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG9yaWdpbmFsU3VjY2Vzc0hhbmRsZXIuYXBwbHkoY29sbGVjdGlvbiwgYXJncyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRlcnJvcjogZnVuY3Rpb24gKGNvbGxlY3Rpb24sIHhociwgb3B0aW9ucykge1xuXHRcdFx0XHRcdHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcblxuXHRcdFx0XHRcdC8vIE51bGwgb3V0IGBjb2xsZWN0aW9uLnN5bmNpbmdgXG5cdFx0XHRcdFx0Y29sbGVjdGlvbi5zeW5jaW5nID0gbnVsbDtcblxuXHRcdFx0XHRcdC8vIElmIHRoaXMgaXMgYW4gXCJhYm9ydFwiLCBpZ25vcmUgaXQtIChzdGF0ZSBoYXMgYWxyZWFkeSBiZWVuIHRha2VuIGNhcmUgb2YpXG5cdFx0XHRcdFx0aWYgKCB4aHIgJiYgeGhyLnN0YXR1c1RleHQ9PT0nYWJvcnQnICkgcmV0dXJuO1xuXG5cdFx0XHRcdFx0Ly8gU2V0IGBjb2xsZWN0aW9uLmVycm9yYCB1c2luZyB0aGUgcmVzcG9uc2UgZnJvbSB0aGUgZmV0Y2hcblx0XHRcdFx0XHQvLyAodHJ5IGpzb24sIHRoZW4gcmVzcG9uc2UgdGV4dCwgdGhlbiBzdGF0dXMgY29kZSwgdGhlbiBqdXN0IGRlZmF1bHQgdG8gYHRydWVgKVxuXHRcdFx0XHRcdGNvbGxlY3Rpb24uZXJyb3IgPVxuXHRcdFx0XHRcdFx0KCB4aHIgJiYgeGhyLnJlc3BvbnNlSlNPTiApID8geGhyLnJlc3BvbnNlSlNPTiA6XG5cdFx0XHRcdFx0XHQoIHhociAmJiB4aHIucmVzcG9uc2VUZXh0ICkgPyB4aHIucmVzcG9uc2VUZXh0IDpcblx0XHRcdFx0XHRcdHRydWU7XG5cblxuXHRcdFx0XHRcdC8vIENhbGwgYGFmdGVyRXJyb3IoKWBcblx0XHRcdFx0XHRjb2xsZWN0aW9uLmFmdGVyRXJyb3IuYXBwbHkoY29sbGVjdGlvbixhcmdzKTtcblxuXHRcdFx0XHRcdC8vIFRyaWdnZXIgb3JpZ2luYWwgZXJyb3IgaGFuZGxlciBpZiBzcGVjaWZpZWRcblx0XHRcdFx0XHQvLyBvbiBgZmV0Y2goe2Vycm9yOiBmdW5jdGlvbigpey8qLi4uKi99fSlgXG5cdFx0XHRcdFx0aWYgKG9yaWdpbmFsRXJyb3JIYW5kbGVyKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gb3JpZ2luYWxFcnJvckhhbmRsZXIuYXBwbHkoY29sbGVjdGlvbiwgYXJncyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gTnVsbCBvdXQgYGNvbGxlY3Rpb24uZXJyb3JgXG5cdFx0XHRjb2xsZWN0aW9uLmVycm9yID0gbnVsbDtcblxuXHRcdFx0Ly8gSWYgYGZldGNoYCBpcyBhbHJlYWR5IGluIHByb2dyZXNzLCBjYW5jZWwgaXRcblx0XHRcdC8vIGFuZCBmaXJlIG9mZiBhIG5ldyBvbmUuXG5cdFx0XHRpZiAoY29sbGVjdGlvbi5zeW5jaW5nKSB7XG5cdFx0XHRcdHNlbGYubG9nKCdBYm9ydGluZyBydW5uaW5nIGBmZXRjaCgpYCBpbiBvcmRlciB0byBzdGFydCBhIG5ldyBgZmV0Y2goKWAuLi4nKTtcblx0XHRcdFx0Y29sbGVjdGlvbi5zeW5jaW5nLmFib3J0KCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENhbGwgb3JpZ2luYWwgYGZldGNoKClgIHVzaW5nIG91ciBtb25rZXktcGF0Y2hlZCBvcHRpb25zXG5cdFx0XHR2YXIgeGhyID0gY29sbGVjdGlvbi5fZmV0Y2gob3B0aW9ucyk7XG5cblx0XHRcdC8vIFNldCBgY29sbGVjdGlvbi5zeW5jaW5nYCB0byB0aGUgWEhSIG9iamVjdCBpbiB1c2Vcblx0XHRcdGNvbGxlY3Rpb24uc3luY2luZyA9IHhocjtcblxuXHRcdFx0Ly8gUmV0dXJuIHRoZSBYSFIgb2JqZWN0IHRvIG1haW50YWluIG9yaWdpbmFsIGBCYWNrYm9uZS5Db2xsZWN0aW9uLmZldGNoKClgIEFQSVxuXHRcdFx0cmV0dXJuIHhocjtcblx0XHR9XG5cblx0fSk7XG5cblxuXHQvLyBUaHJvdWdob3V0IHRoZSBzb3VyY2UgY29kZSwgdGhlcmUgYXJlIG9wZXJhdGlvbnMgb24gYEZSQU1FV09SS2Agb3IgY29kZSB0aGF0IGFjY2Vzc2VzXG5cdC8vIGl0cyBhdHRyaWJ1dGVzLiBTbyB3ZSBtYWtlIGBGUkFNRVdPUktgIGFjY2Vzc2libGUuXG5cdC8vXG5cdC8vIE5vdGU6XG5cdC8vIGBGUkFNRVdPUktgIHdpbGwgb25seSBiZSBhIGdsb2JhbCB2YXJpYWJsZSAqKiBkdXJpbmcgdGhlIGJ1aWxkICoqXG5cdEZSQU1FV09SSyA9IHRoaXM7XG5cblxufTtcblxuLy8gRnJhbWV3b3JrIHByb3RvdHlwZSBtZXRob2RzLlxuRnJhbWV3b3JrLnByb3RvdHlwZS5SZWdpb24gPSBSZWdpb247XG5GcmFtZXdvcmsucHJvdG90eXBlLkNvbXBvbmVudCA9IENvbXBvbmVudDtcbkZyYW1ld29yay5wcm90b3R5cGUuZGVmaW5lID0gZGVmaW5lO1xuRnJhbWV3b3JrLnByb3RvdHlwZS5yYWlzZSA9IHJhaXNlO1xuXG5cblxuLy8gRXhwb3NlIGluc3RhbnRpYXRlZCBmcmFtZXdvcmsgdmlhIFVNRDpcbnZhciBmcmFtZXdvcmsgPSBuZXcgRnJhbWV3b3JrKCk7XG5tb2R1bGUuZXhwb3J0cyA9IGZyYW1ld29yaztcblxuIiwiLyoqXG4gKlx0TG9nZ2V0IGNvbnN0cnVjdG9yIG1ldGhvZCB0aGF0IHdpbGwgc2V0dXAgRlJBTUVXT1JLIHRvIGxvZyBtZXNzYWdlcy5cbiAqL1xuXG52YXIgc2V0dXBMb2dnZXIgPSByZXF1aXJlKCcuL3NldHVwJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gTG9nZ2VyKCkge1xuXG5cdC8vIFVwb24gaW5pdGlhbGl6YXRpb24sIHNldHVwIGxvZ2dlclxuXHRzZXR1cExvZ2dlcihGUkFNRVdPUksub3B0aW9ucy5sb2dMZXZlbCk7XG5cblx0Ly8gSW4gc3VwcG9ydGVkIGJyb3dzZXJzLCBhbHNvIHJ1biBzZXR1cExvZ2dlciBhZ2FpblxuXHQvLyB3aGVuIEZSQU1FV09SSy5sb2dMZXZlbCBpcyBzZXQgYnkgdGhlIHVzZXJcblx0Ly8gVE9ETzogZmluZCBhIHdheSB0byBkbyB0aGlzIHdpdGhvdXQgZGVwZW5kaW5nIG9uIF9fZGVmaW5lU2V0dGVyX18uXG5cdGlmIChfLmlzRnVuY3Rpb24oRlJBTUVXT1JLLl9fZGVmaW5lU2V0dGVyX18pKSB7XG5cdFx0RlJBTUVXT1JLLl9fZGVmaW5lU2V0dGVyX18oJ2xvZ0xldmVsJywgZnVuY3Rpb24gb25DaGFuZ2UgKG5ld0xvZ0xldmVsKSB7XG5cdFx0XHRzZXR1cExvZ2dlcihuZXdMb2dMZXZlbCk7XG5cdFx0fSk7XG5cdH1cbn07XG4iLCIvKipcbiAqIFNldCB1cCB0aGUgbG9nIGZ1bmN0aW9uczpcbiAqXG4gKiBGUkFNRVdPUksuZXJyb3JcbiAqIEZSQU1FV09SSy53YXJuXG4gKiBGUkFNRVdPUksubG9nXG4gKiBGUkFNRVdPUksuZGVidWcgKCpsZWdhY3kpXG4gKiBGUkFNRVdPUksudmVyYm9zZVxuICpcbiAqIEBwYXJhbSAge1N0cmluZ30gbG9nTGV2ZWwgW1RoZSBkZXNpcmVkIGxvZyBsZXZlbCBvZiB0aGUgTG9nZ2VyXVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHNldHVwTG9nZ2VyIChsb2dMZXZlbCkge1xuXG5cdHZhciBub29wID0gZnVuY3Rpb24gKCkge307XG5cblx0Ly8gSWYgbG9nIGlzIHNwZWNpZmllZCwgdXNlIGl0LCBvdGhlcndpc2UgdXNlIHRoZSBjb25zb2xlXG5cdGlmIChGUkFNRVdPUksubG9nZ2VyKSB7XG5cdFx0RlJBTUVXT1JLLmVycm9yICAgICA9IEZSQU1FV09SSy5sb2dnZXIuZXJyb3I7XG5cdFx0RlJBTUVXT1JLLndhcm4gICAgICA9IEZSQU1FV09SSy5sb2dnZXIud2Fybjtcblx0XHRGUkFNRVdPUksubG9nICAgICAgID0gRlJBTUVXT1JLLmxvZ2dlci5kZWJ1ZyB8fCBGUkFNRVdPUksubG9nZ2VyO1xuXHRcdEZSQU1FV09SSy52ZXJib3NlICAgPSBGUkFNRVdPUksubG9nZ2VyLnZlcmJvc2U7XG5cdH1cblxuXHQvLyBJbiBJRSwgd2UgY2FuJ3QgZGVmYXVsdCB0byB0aGUgYnJvd3NlciBjb25zb2xlIGJlY2F1c2UgdGhlcmUgSVMgTk8gQlJPV1NFUiBDT05TT0xFXG5cdGVsc2UgaWYgKHR5cGVvZiBjb25zb2xlICE9PSAndW5kZWZpbmVkJykge1xuXG5cdFx0Ly8gV2UgY2Fubm90IGNhbGxlZCB0aGUgLmJpbmQgbWV0aG9kIG9uIHRoZSBjb25zb2xlIG1ldGhvZHMuIFdlIGFyZSBpbiBpZSA5IG9yIDgsIGp1c3QgbWFrZVxuXHRcdC8vIGV2ZXJ5aHRpbmcgYSBub29wLlxuXHRcdGlmIChfLmlzVW5kZWZpbmVkKGNvbnNvbGUubG9nLmJpbmQpKSAge1xuXHRcdFx0RlJBTUVXT1JLLmVycm9yICAgICA9IG5vb3A7XG5cdFx0XHRGUkFNRVdPUksud2FybiAgICAgID0gbm9vcDtcblx0XHRcdEZSQU1FV09SSy5sb2cgICAgICAgPSBub29wO1xuXHRcdFx0RlJBTUVXT1JLLmRlYnVnICAgICA9IG5vb3A7XG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZSAgID0gbm9vcDtcblx0XHR9XG5cblx0XHQvLyBXZSBhcmUgaW4gYSBmcmllbmRseSBicm93c2VyIGxpa2UgQ2hyb21lLCBGaXJlZm94LCBvciBJRTEwXG5cdFx0ZWxzZSB7XG5cdFx0XHRGUkFNRVdPUksuZXJyb3JcdFx0PSBjb25zb2xlLmVycm9yICYmIGNvbnNvbGUuZXJyb3IuYmluZChjb25zb2xlKTtcblx0XHRcdEZSQU1FV09SSy53YXJuXHRcdD0gY29uc29sZS53YXJuICYmIGNvbnNvbGUud2Fybi5iaW5kKGNvbnNvbGUpO1xuXHRcdFx0RlJBTUVXT1JLLmxvZ1x0XHRcdD0gY29uc29sZS5kZWJ1ZyAmJiBjb25zb2xlLmRlYnVnLmJpbmQoY29uc29sZSk7XG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZVx0PSBjb25zb2xlLmxvZyAmJiBjb25zb2xlLmxvZy5iaW5kKGNvbnNvbGUpO1xuXG5cdFx0XHQvLyBVc2UgbG9nIGxldmVsIGNvbmZpZyBpZiBwcm92aWRlZFxuXHRcdFx0c3dpdGNoIChsb2dMZXZlbCkge1xuXHRcdFx0XHRjYXNlICd2ZXJib3NlJzogYnJlYWs7XG5cblx0XHRcdFx0Y2FzZSAnZGVidWcnOlxuXHRcdFx0XHRcdEZSQU1FV09SSy52ZXJib3NlID0gbm9vcDtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlICd3YXJuJzpcblx0XHRcdFx0XHRGUkFNRVdPUksudmVyYm9zZSA9IEZSQU1FV09SSy5sb2cgPSBub29wO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgJ2Vycm9yJzpcblx0XHRcdFx0XHRGUkFNRVdPUksudmVyYm9zZSA9IEZSQU1FV09SSy5sb2cgPSBGUkFNRVdPUksud2FybiA9IG5vb3A7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSAnc2lsZW50Jzpcblx0XHRcdFx0XHRGUkFNRVdPUksudmVyYm9zZSA9IEZSQU1FV09SSy5sb2cgPSBGUkFNRVdPUksud2FybiA9IEZSQU1FV09SSy5lcnJvciA9IG5vb3A7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IgKCdVbnJlY29nbml6ZWQgbG9nZ2luZyBsZXZlbCBjb25maWcgJyArXG5cdFx0XHRcdFx0JygnICsgRlJBTUVXT1JLLm9wdGlvbnMuZnJhbWV3b3JrSWQgKyAnLmxvZ0xldmVsID0gXCInICsgbG9nTGV2ZWwgKyAnXCIpJyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFN1cHBvcnQgZm9yIGBkZWJ1Z2AgZm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5XG5cdFx0XHRGUkFNRVdPUksuZGVidWcgPSBGUkFNRVdPUksubG9nO1xuXG5cdFx0XHQvLyBWZXJib3NlIHNwaXRzIG91dCBsb2cgbGV2ZWxcblx0XHRcdEZSQU1FV09SSy52ZXJib3NlKCdMb2cgbGV2ZWwgc2V0IHRvIDo6ICcsIGxvZ0xldmVsKTtcblx0XHR9XG5cdH1cbn1cbiIsIi8qKlxuICogR2l2ZW4gYSBjb21wb25lbnQgZGVmaW5pdGlvbiBhbmQgaXRzIGtleSwgd2Ugd2lsbCBidWlsZCB1cCB0aGUgY29tcG9uZW50IHByb3RvdHlwZSBhbmQgbWVyZ2VcbiAqIHRoaXMgY29tcG9uZW50IHdpdGggaXRzIG1hdGNoaW5nIHRlbXBsYXRlLlxuICpcbiAqIEBwYXJhbSAge09iamVjdH0gY29tcG9uZW50RGVmIFtPYmplY3QgY29udGFpbmluZyB0aGUgY29tcG9uZW50IGRlZmluaXRpb25dXG4gKiBAcGFyYW0gIHtTdHJpbmd9IGNvbXBvbmVudEtleSBbVGhlIGNvbXBvbmVudCBpZGVudGlmaWVyXVxuICovXG5cbnZhciB0cmFuc2xhdGVTaG9ydGhhbmQgPSByZXF1aXJlKCcuLi91dGlscy9zaG9ydGhhbmQnKTtcbnZhciBvYmpNYXAgPSByZXF1aXJlKCcuLi91dGlscy9vYmpNYXAnKTtcbnZhciBFdmVudHMgPSByZXF1aXJlKCcuLi91dGlscy9ldmVudHMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBidWlsZENvbXBvbmVudFByb3RvdHlwZShjb21wb25lbnREZWYsIGNvbXBvbmVudEtleSkge1xuXG5cdC8vIElmIGNvbXBvbmVudCBpZCBpcyBub3QgZXhwbGljaXRseSBzZXQsIHVzZSB0aGUgY29tcG9uZW50S2V5XG5cdGlmICghY29tcG9uZW50RGVmLmlkKSB7XG5cdFx0Y29tcG9uZW50RGVmLmlkID0gY29tcG9uZW50S2V5O1xuXHR9XG5cblx0Ly8gU2VhcmNoIHRlbXBsYXRlc1xuXHR2YXIgdGVtcGxhdGUgPSBGUkFNRVdPUksudGVtcGxhdGVzW2NvbXBvbmVudERlZi5pZF07XG5cblx0Ly8gSWYgbm8gbWF0Y2ggZm9yIGNvbXBvbmVudCB3YXMgZm91bmTCoGluIHRlbXBsYXRlcywgaXNzdWUgYSB3YXJuaW5nXG5cdGlmICghdGVtcGxhdGUpIHtcblx0XHRyZXR1cm4gRlJBTUVXT1JLLndhcm4oXG5cdFx0XHRjb21wb25lbnREZWYuaWQgKyAnIDo6IE5vIHRlbXBsYXRlIGZvdW5kIGZvciBjb21wb25lbnQhJyArXG5cdFx0XHQnXFxuVGVtcGxhdGVzIGRvblxcJ3QgbmVlZCBhIGNvbXBvbmVudCB1bmxlc3MgeW91IHdhbnQgaW50ZXJhY3Rpdml0eSwgJyArXG5cdFx0XHQnZXZlcnkgY29tcG9uZW50ICpzaG91bGQqIGhhdmUgYSBtYXRjaGluZyB0ZW1wbGF0ZSEhJyArXG5cdFx0XHQnXFxuVXNpbmcgY29tcG9uZW50cyB3aXRob3V0IHRlbXBsYXRlcyBtYXkgc2VlbSBuZWNlc3NhcnksICcgK1xuXHRcdFx0J2J1dCBpdFxcJ3Mgbm90LiAgSXQgbWFrZXMgeW91ciB2aWV3IGxvZ2ljIGluY29ycG9yZWFsLCBhbmQgbWFrZXMgeW91ciBjb2xsZWFndWVzICcgK1xuXHRcdFx0J3VuY29tZm9ydGFibGUuJyk7XG5cdH1cblxuXHQvLyBTYXZlIHJlZmVyZW5jZSB0byB0ZW1wbGF0ZSBpbiBjb21wb25lbnQgcHJvdG90eXBlXG5cdEZSQU1FV09SSy52ZXJib3NlKGNvbXBvbmVudERlZi5pZCArICcgOjogUGFpcmluZyBjb21wb25lbnQgd2l0aCB0ZW1wbGF0ZS4uLicpO1xuXHRjb21wb25lbnREZWYudGVtcGxhdGUgPSB0ZW1wbGF0ZTtcblxuXHQvLyBUcmFuc2xhdGUgcmlnaHQtaGFuZCBzaG9ydGhhbmQgZm9yIHRvcC1sZXZlbCBrZXlzXG5cdGNvbXBvbmVudERlZiA9IG9iak1hcChjb21wb25lbnREZWYsIHRyYW5zbGF0ZVNob3J0aGFuZCk7XG5cblxuXHQvLyBhbmQgZXZlbnRzIG9iamVjdFxuXHRpZiAoY29tcG9uZW50RGVmLmV2ZW50cykge1xuXHRcdGNvbXBvbmVudERlZi5ldmVudHMgPSBvYmpNYXAoXG5cdFx0XHRjb21wb25lbnREZWYuZXZlbnRzLFxuXHRcdFx0dHJhbnNsYXRlU2hvcnRoYW5kXG5cdFx0KTtcblx0fVxuXG5cdC8vIGFuZCBhZnRlckNoYW5nZSBiaW5kaW5nc1xuXHRpZiAoXy5pc09iamVjdChjb21wb25lbnREZWYuYWZ0ZXJDaGFuZ2UpICYmICFfLmlzRnVuY3Rpb24oY29tcG9uZW50RGVmLmFmdGVyQ2hhbmdlKSkge1xuXHRcdGNvbXBvbmVudERlZi5hZnRlckNoYW5nZSA9IG9iak1hcChcblx0XHRcdGNvbXBvbmVudERlZi5hZnRlckNoYW5nZSxcblx0XHRcdHRyYW5zbGF0ZVNob3J0aGFuZFxuXHRcdCk7XG5cdH1cblxuXHQvLyBHbyBhaGVhZCBhbmQgdHVybiB0aGUgZGVmaW5pdGlvbiBpbnRvIGEgcmVhbCBjb21wb25lbnQgcHJvdG90eXBlXG5cdEZSQU1FV09SSy52ZXJib3NlKGNvbXBvbmVudERlZi5pZCArICcgOjogQnVpbGRpbmcgY29tcG9uZW50IHByb3RvdHlwZS4uLicpO1xuXHR2YXIgY29tcG9uZW50UHJvdG90eXBlID0gRlJBTUVXT1JLLkNvbXBvbmVudC5leHRlbmQoY29tcG9uZW50RGVmKTtcblxuXHQvLyBEaXNjb3ZlciBzdWJzY3JpcHRpb25zXG5cdGNvbXBvbmVudFByb3RvdHlwZS5wcm90b3R5cGUuc3Vic2NyaXB0aW9ucyA9IHt9O1xuXG5cdC8vIEl0ZXJhdGUgdGhyb3VnaCBlYWNoIHByb3BlcnR5IG9uIHRoaXMgY29tcG9uZW50IHByb3RvdHlwZVxuXHRfLmVhY2goY29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZSwgZnVuY3Rpb24gKGhhbmRsZXIsIGtleSkge1xuXG5cdFx0Ly8gRGV0ZWN0IERPTSBldmVudHMgYW5kIHNtYXNoIHRoZW0gaW50byB0aGUgZXZlbnRzIGhhc2hcblx0XHR2YXIgbWF0Y2hlZERPTUV2ZW50cyA9IGtleS5tYXRjaChFdmVudHNbJy9ET01FdmVudC8nXSk7XG5cdFx0aWYgKG1hdGNoZWRET01FdmVudHMpIHtcblx0XHRcdHZhciBldmVudE5hbWUgPSBtYXRjaGVkRE9NRXZlbnRzWzFdO1xuXHRcdFx0dmFyIGRlbGVnYXRlU2VsZWN0b3IgPSBtYXRjaGVkRE9NRXZlbnRzWzNdO1xuXG5cdFx0XHQvLyBTdG93IHRoZW0gaW4gZXZlbnRzIGhhc2hcblx0XHRcdGNvbXBvbmVudFByb3RvdHlwZS5wcm90b3R5cGUuZXZlbnRzID0gY29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZS5ldmVudHMgfHwge307XG5cdFx0XHRjb21wb25lbnRQcm90b3R5cGUucHJvdG90eXBlLmV2ZW50c1trZXldID0gaGFuZGxlcjtcblx0XHR9XG5cblx0XHQvLyBBZGQgYXBwIGV2ZW50cyAoJSksIHJvdXRlcyAoIyksIGFuZCBkYXRhIGxpc3RlbmVycyAofikgdG8gc3Vic2NyaXB0aW9ucyBoYXNoXG5cdFx0aWYgKGtleS5tYXRjaCgvXiglfCN8fikvKSkge1xuXHRcdFx0aWYgKF8uaXNTdHJpbmcoaGFuZGxlcikpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGNvbXBvbmVudERlZi5pZCArICc6OiBJbnZhbGlkIGxpc3RlbmVyIGZvciBzdWJzY3JpcHRpb246ICcgKyBrZXkgKyAnLlxcbicgK1xuXHRcdFx0XHRcdCdEZWZpbmUgeW91ciBjYWxsYmFjayB3aXRoIGFuIGFub255bW91cyBmdW5jdGlvbiBpbnN0ZWFkIG9mIGEgc3RyaW5nLidcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHRcdGlmICghXy5pc0Z1bmN0aW9uKGhhbmRsZXIpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihjb21wb25lbnREZWYuaWQgKyc6OiBJbnZhbGlkIGxpc3RlbmVyIGZvciBzdWJzY3JpcHRpb246ICcgKyBrZXkpO1xuXHRcdFx0fVxuXHRcdFx0Y29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZS5zdWJzY3JpcHRpb25zW2tleV0gPSBoYW5kbGVyO1xuXHRcdH1cblxuXHRcdC8vIEV4dGVuZCBvbmUgb3IgbW9yZSBvdGhlciBjb21wb25lbnRzXG5cdFx0ZWxzZSBpZiAoa2V5ID09PSAnZXh0ZW5kQ29tcG9uZW50cycpIHtcblx0XHRcdHZhciBvYmpUb01lcmdlID0ge307XG5cdFx0XHRfLmVhY2goaGFuZGxlciwgZnVuY3Rpb24oY2hpbGRJZCl7XG5cblx0XHRcdFx0aWYgKCFGUkFNRVdPUksuY29tcG9uZW50c1tjaGlsZElkXSl7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKFxuXHRcdFx0XHRcdGNvbXBvbmVudERlZi5pZCArICcgOjogJyArXG5cdFx0XHRcdFx0J1RyeWluZyB0byBkZWZpbmUvZXh0ZW5kIHRoaXMgY29tcG9uZW50IGZyb20gYCcgKyBjaGlsZElkICsgJ2AsICcgK1xuXHRcdFx0XHRcdCdidXQgbm8gY29tcG9uZW50IHdpdGggdGhhdCBpZCBjYW4gYmUgZm91bmQuJ1xuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRfLmV4dGVuZChvYmpUb01lcmdlLCBGUkFNRVdPUksuY29tcG9uZW50c1tjaGlsZElkXSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Xy5kZWZhdWx0cyhjb21wb25lbnRQcm90b3R5cGUucHJvdG90eXBlLCBvYmpUb01lcmdlKTtcblx0XHR9XG5cdH0pO1xuXG5cdC8vIFNhdmUgcHJvdG90eXBlIGluIGdsb2JhbCBzZXQgZm9yIHRyYWNraW5nXG5cdEZSQU1FV09SSy5jb21wb25lbnRzW2NvbXBvbmVudERlZi5pZF0gPSBjb21wb25lbnRQcm90b3R5cGU7XG59O1xuIiwiLyoqXG4gKiBDb2xsZWN0IGFueSByZWdpb25zIHdpdGggdGhlIGRlZmF1bHQgY29tcG9uZW50IHNldCBmcm9tIHRoZSBET00uXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjb2xsZWN0UmVnaW9ucyAoKSB7XG5cblx0JCgncmVnaW9uW2RlZmF1bHRdLHJlZ2lvblt0ZW1wbGF0ZV0sW2RhdGEtcmVnaW9uXVtkZWZhdWx0XSxbZGF0YS1yZWdpb25dW3RlbXBsYXRlXScpLmVhY2goZnVuY3Rpb24oKSB7XG5cdFx0JGUgPSAkKHRoaXMpO1xuXG5cdFx0Ly8gUHJvdmlkZSBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eSBmb3IgbGVnYWN5IG5vdGF0aW9uXG5cdFx0Ly8gKG5vcm1hbGl6ZSB0byBgdGVtcGxhdGVgKVxuXHRcdHZhciBjb21wb25lbnRJZCA9ICRlLmF0dHIoJ2RlZmF1bHQnKSB8fCAkZS5hdHRyKCdjb250ZW50cycpO1xuXHRcdCRlLmF0dHIoJ3RlbXBsYXRlJywgY29tcG9uZW50SWQpO1xuXG5cblx0XHQvL1xuXHRcdC8vIFRPRE86XG5cdFx0Ly8gYWxsb3cgZW1iZWRkZWQgdGVtcGxhdGVzIHRvIGJlIG5hbWVkIHRoaXMgd2F5LCBlLmcuIGA8cmVnaW9uIHRlbXBsYXRlPVwiRm9vXCI+PC9yZWdpb24+YFxuXHRcdC8vIChzaG91bGQgYmUgdmVyeSBlYXN5KVxuXHRcdC8vXG5cblxuXHRcdC8vIE5vdyBpbnN0YW50aWF0ZSB0aGUgYXBwcm9wcmlhdGUgZGVmYXVsdCBjb21wb25lbnQgaW4gZWFjaFxuXHRcdC8vIHJlZ2lvbiB3aXRoIGEgc3BlY2lmaWVkIHRlbXBsYXRlL2NvbXBvbmVudFxuXHRcdEZSQU1FV09SSy5SZWdpb24uZnJvbUVsZW1lbnQodGhpcyk7XG5cdH0pO1xuXG59O1xuIiwiLyoqXG4gKiBMb2FkIGFueSBzY3JpcHQgdGFncyBvbiB0aGUgcGFnZSB3aXRoIHR5cGU9XCJ0ZXh0L3RlbXBsYXRlXCIuXG4gKlxuICogQHJldHVybiB7T2JqZWN0fSBbT2JqZWN0IGNvbnNpc3Rpbmcgb2YgYSB0ZW1wbGF0ZSBpZGVudGlmaWVyIGFuZCBpdHMgSFRNTC5dXG4gKi9cblxudmFyIGVsMk1hc3RJRCA9IHJlcXVpcmUoJy4uL3V0aWxzL2VsMk1hc3RJRCcpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNvbGxlY3RUZW1wbGF0ZXNGcm9tU2NyaXB0VGFncygpIHtcblx0dmFyIHRlbXBsYXRlcyA9IHt9O1xuXG5cdCQoJ3NjcmlwdFt0eXBlPVwidGV4dC90ZW1wbGF0ZVwiXScpLmVhY2goZnVuY3Rpb24gKGksIGVsKSB7XG5cdFx0dmFyIGlkID0gZWwyTWFzdElEKGVsLCB0cnVlKTtcblx0XHR0ZW1wbGF0ZXNbaWRdID0gJChlbCkuaHRtbCgpO1xuXG5cdFx0Ly8gU3RyaXAgd2hpdGVzcGFjZSBsZWZ0b3ZlciBmcm9tIHNjcmlwdCB0YWdzXG5cdFx0dGVtcGxhdGVzW2lkXSA9IHRlbXBsYXRlc1tpZF0ucmVwbGFjZSgvXlxccysvLCcnKTtcblx0XHR0ZW1wbGF0ZXNbaWRdID0gdGVtcGxhdGVzW2lkXS5yZXBsYWNlKC9cXHMrJC8sJycpO1xuXG5cdFx0Ly8gUmVtb3ZlIGZyb20gRE9NXG5cdFx0JChlbCkucmVtb3ZlKCk7XG5cdH0pO1xuXG5cdHJldHVybiB0ZW1wbGF0ZXM7XG59O1xuIiwiLyoqXG4gKiBUaGlzIGlzIHRoZSBzdGFydGluZyBwb2ludCB0byB5b3VyIGFwcGxpY2F0aW9uLiAgWW91IHNob3VsZCBncmFiIHRlbXBsYXRlcyBhbmQgY29tcG9uZW50c1xuICogYmVmb3JlIGNhbGxpbmcgRlJBTUVXT1JLLnJhaXNlKCkgdXNpbmcgc29tZXRoaW5nIGxpa2UgUmVxdWlyZS5qcy5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9uc1xuXHRcdGRhdGE6IHsgYXV0aGVudGljYXRlZDogZmFsc2UgfSxcblx0XHR0ZW1wbGF0ZXM6IHsgY29tcG9uZW50TmFtZTogSFRNTE9yUHJlY29tcGlsZWRGbiB9LFxuXHRcdGNvbXBvbmVudHM6IHsgY29tcG9uZW50TmFtZTogQ29tcG9uZW50RGVmaW5pdGlvbiB9XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYlxuICovXG5cbnZhciBMb2dnZXIgPSByZXF1aXJlKCcuLi9sb2dnZXIvaW5kZXgnKTtcbnZhciBidWlsZENvbXBvbmVudERlZmluaXRpb24gPSByZXF1aXJlKCcuLi9kZWZpbmUvYnVpbGREZWZpbml0aW9uJyk7XG52YXIgYnVpbGRDb21wb25lbnRQcm90b3R5cGUgPSByZXF1aXJlKCcuL2J1aWxkUHJvdG90eXBlJyk7XG52YXIgY29sbGVjdFRlbXBsYXRlc0Zyb21TY3JpcHRUYWdzID0gcmVxdWlyZSgnLi9jb2xsZWN0VGVtcGxhdGVzRnJvbVNjcmlwdFRhZ3MnKTtcbnZhciBjb2xsZWN0UmVnaW9ucyA9IHJlcXVpcmUoJy4vY29sbGVjdFJlZ2lvbnMnKTtcbnZhciBzZXR1cFJvdXRlciA9IHJlcXVpcmUoJy4uL3JvdXRlci9pbmRleCcpO1xuXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcmFpc2Uob3B0aW9ucywgY2IpIHtcblxuXHQvLyBJZiBvbmx5IG9uZSBhcmcgaXMgcHJlc2VudCwgdXNlIG9wdGlvbnMgYXMgY2FsbGJhY2sgaWYgcG9zc2libGUuXG5cdC8vIElmIG9wdGlvbnMgYXJlIG5vdCBkZWZpbmVkLCB1c2UgYW4gZW1wdHkgb2JqZWN0LlxuXHRpZiAoIWNiICYmIF8uaXNGdW5jdGlvbihvcHRpb25zKSkge1xuXHRcdGNiID0gb3B0aW9ucztcblx0fVxuXHRpZiAoIV8uaXNQbGFpbk9iamVjdChvcHRpb25zKSkge1xuXHRcdG9wdGlvbnMgPSB7fTtcblx0fVxuXG5cdC8vIEludGVycHJldCBgcHJvZHVjdGlvbmAgYXMgYGxvZ0xldmVsID09PSAnc2lsZW50J2Bcblx0aWYgKEZSQU1FV09SSy5vcHRpb25zLnByb2R1Y3Rpb24pIHtcblx0XHRGUkFNRVdPUksub3B0aW9ucy5sb2dMZXZlbCA9ICdzaWxlbnQnO1xuXHR9XG5cblx0Ly8gSW5pdGlhbGl6ZSBsb2dnZXJcblx0bmV3IExvZ2dlcigpO1xuXG5cdC8vIE1lcmdlIGRhdGEgaW50byBGUkFNRVdPUksuZGF0YVxuXHRfLmV4dGVuZChGUkFNRVdPUksuZGF0YSwgb3B0aW9ucy5kYXRhIHx8IHt9KTtcblxuXHQvLyBNZXJnZSBzcGVjaWZpZWQgdGVtcGxhdGVzIHdpdGggRlJBTUVXT1JLLnRlbXBsYXRlc1xuXHRfLmV4dGVuZChGUkFNRVdPUksudGVtcGxhdGVzLCBvcHRpb25zLnRlbXBsYXRlcyB8fCB7fSk7XG5cblx0Ly8gSWYgRlJBTUVXT1JLLmRlZmluZSgpIHdhcyB1c2VkLCBidWlsZCB0aGUgbGlzdCBvZiBjb21wb25lbnRzXG5cdC8vIEl0ZXJhdGUgdGhyb3VnaCB0aGUgZGVmaW5lIHF1ZXVlIGFuZCBjcmVhdGUgZWFjaCBkZWZpbml0aW9uXG5cdF8uZWFjaChGUkFNRVdPUksuX2RlZmluZVF1ZXVlLCBidWlsZENvbXBvbmVudERlZmluaXRpb24pO1xuXG5cdC8vIE1lcmdlIHNwZWNpZmllZCBjb21wb25lbnRzIHcvIEZSQU1FV09SSy5jb21wb25lbnRzXG5cdF8uZXh0ZW5kKEZSQU1FV09SSy5jb21wb25lbnRzLCBvcHRpb25zLmNvbXBvbmVudHMgfHwge30pO1xuXG5cdC8vIEJhY2sgdXAgZWFjaCBjb21wb25lbnQgZGVmaW5pdGlvbiBiZWZvcmUgdHJhbnNmb3JtaW5nIGl0IGludG8gYSBsaXZlIHByb3RvdHlwZVxuXHRGUkFNRVdPUksuY29tcG9uZW50RGVmcyA9IF8uY2xvbmUoRlJBTUVXT1JLLmNvbXBvbmVudHMpO1xuXG5cdC8vIFJ1biB0aGlzIGNhbGwgYmFjayB3aGVuIHRoZSBET00gaXMgcmVhZHlcblx0JChmdW5jdGlvbiAoKSB7XG5cblx0XHQvLyBDb2xsZWN0IGFueSA8c2NyaXB0PiB0YWcgdGVtcGxhdGVzIG9uIHRoZSBwYWdlXG5cdFx0Ly8gYW5kIGFic29yYiB0aGVtIGludG8gRlJBTUVXT1JLLnRlbXBsYXRlc1xuXHRcdF8uZXh0ZW5kKEZSQU1FV09SSy50ZW1wbGF0ZXMsIGNvbGxlY3RUZW1wbGF0ZXNGcm9tU2NyaXB0VGFncygpKTtcblxuXHRcdC8vIEJ1aWxkIGFjdHVhbCBwcm90b3R5cGVzIGZvciB0aGUgY29tcG9uZW50c1xuXHRcdC8vIChuZWVkIHRoZSB0ZW1wbGF0ZXMgYXQgdGhpcyBwb2ludCB0byBtYWtlIHRoaXMgd29yaylcblx0XHRfLmVhY2goRlJBTUVXT1JLLmNvbXBvbmVudHMsIGJ1aWxkQ29tcG9uZW50UHJvdG90eXBlKTtcblxuXHRcdC8vIEdyYWIgaW5pdGlhbCByZWdpb25zIGZyb20gRE9NXG5cdFx0Y29sbGVjdFJlZ2lvbnMoKTtcblxuXHRcdC8vIEJpbmQgZ2xvYmFsIERPTSBldmVudHMgYXMgRlJBTUVXT1JLIGV2ZW50c1xuXHRcdC8vIChlLmcuICV3aW5kb3c6cmVzaXplKVxuXHRcdHZhciB0cmlnZ2VyUmVzaXplRXZlbnQgPSBfLmRlYm91bmNlKGZ1bmN0aW9uICgpIHtcblx0XHRcdEZSQU1FV09SSy50cmlnZ2VyKCcld2luZG93OnJlc2l6ZScpO1xuXHRcdH0sIEZSQU1FV09SSy5vcHRpb25zLnRocm90dGxlV2luZG93UmVzaXplIHx8IDApO1xuXHRcdCQod2luZG93KS5yZXNpemUodHJpZ2dlclJlc2l6ZUV2ZW50KTtcblx0XHQvLyBUT0RPOiBhZGQgbW9yZSBldmVudHMgYW5kIGV4dHJhcG9sYXRlIHRoaXMgbG9naWMgdG8gYSBzZXBhcmF0ZSBtb2R1bGVcblxuXHRcdC8vIERvIHRoZSBpbml0aWFsIHJvdXRpbmcgc2VxdWVuY2Vcblx0XHQvLyBMb29rIGF0IHRoZSAjZnJhZ21lbnQgdXJsIGFuZCBmaXJlIHRoZSBnbG9iYWwgcm91dGUgZXZlbnRcblx0XHRzZXR1cFJvdXRlcigpO1xuXHRcdEZSQU1FV09SSy5oaXN0b3J5LnN0YXJ0KF8uZGVmYXVsdHMoe1xuXHRcdFx0cHVzaFN0YXRlOiB1bmRlZmluZWQsXG5cdFx0XHRoYXNoQ2hhbmdlOiB1bmRlZmluZWQsXG5cdFx0XHRyb290OiB1bmRlZmluZWRcblx0XHR9LCBvcHRpb25zKSk7XG5cblx0XHRpZiAoY2IpIGNiKCk7XG5cdH0pO1xufTtcbiIsIi8qKlxuICogQXBwZW5kIGEgY29tcG9uZW50IHRvIHRoZSBlbmQgb2YgYSByZWdpb24uIFRoaXMgY2FsbHMgaW5zZXJ0IGF0IHRoZSBsYXN0IHBvc2l0aW9uLlxuICpcbiAqIEBwYXJhbSAge1N0cmluZ30gY29tcG9uZW50SWQgW1RoZSBjb21wb25lbnQgaWQgdGhhdCB3ZSB3YW50IHRvIGFwcGVuZF1cbiAqIEBwYXJhbSAge09iamVjdH0gcHJvcGVydGllcyAgW1Byb3BlcnRpZXMgdG8gaW5zdGFudGlhdGUgdGhlIGNvbXBvbmVudCB3aXRoXVxuICpcbiAqIEByZXR1cm4ge0NvbXBvbmVudH0gICAgICAgICAgW05ld2x5IGFwcGVuZGVkIENvbXBvbmVudF1cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBhcHBlbmQoY29tcG9uZW50SWQsIHByb3BlcnRpZXMpIHtcblx0Ly8gSW5zZXJ0IGF0IGxhc3QgcG9zaXRpb25cblx0cmV0dXJuIHRoaXMuaW5zZXJ0KHRoaXMuX2NoaWxkcmVuLmxlbmd0aCwgY29tcG9uZW50SWQsIHByb3BlcnRpZXMpO1xufTtcbiIsIi8qKlxuICogU2hvcnRjdXQgZm9yIGNhbGxpbmcgZW1wdHkoKSBhbmQgdGhlbiBhcHBlbmQoKSxcbiAqIFRoaXMgaXMgdGhlIGdlbmVyYWwgdXNlIGNhc2UgZm9yIG1hbmFnaW5nIHN1YmNvbXBvbmVudHNcbiAqIChlLmcuIHdoZW4gYSBuYXZiYXIgaXRlbSBpcyB0b3VjaGVkKVxuICpcbiAqIEBwYXJhbSAge1N0cmluZ30gY29tcG9uZW50ICBbVGhlIGlkIG5hbWUgb2YgdGhlIGNvbXBvbmV0IHRoYXQgeW91IHdhbnQgdG8gYXR0YWNoXVxuICogQHBhcmFtICB7T2JqZWN0fSBwcm9wZXJ0aWVzIFtQcm9wZXJ0aWVzIHRoYXQgdGhlIGF0dGFjaGVkIGNvbXBvbmVudCB3aWxsIGJlIGluaXRhbGl6ZWQgd2l0aF1cbiAqXG4gKiBAcmV0dXJuIHtDb21wb25lbnR9IFx0XHRcdFx0IFtOZXdseSBhdHRhY2hlZCBjb21wb25lbnRdXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYXR0YWNoKGNvbXBvbmVudCwgcHJvcGVydGllcykge1xuXHR0aGlzLmVtcHR5KCk7XG5cdHJldHVybiB0aGlzLmFwcGVuZChjb21wb25lbnQsIHByb3BlcnRpZXMpO1xufTtcbiIsIi8qKlxuICogcmVnaW9uLmVtcHR5KCApXG4gKlxuICogSXRlcmF0ZSBvdmVyIGVhY2ggY29tcG9uZW50IGluIHRoaXMgcmVnaW9uIGFuZCBjYWxsIC5jbG9zZSgpIG9uIGl0XG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZW1wdHkoKSB7XG5cdEZSQU1FV09SSy5kZWJ1Zyh0aGlzLnBhcmVudC5pZCArICcgOjogRW1wdHlpbmcgcmVnaW9uOiAnICsgdGhpcy5pZCk7XG5cdHdoaWxlICh0aGlzLl9jaGlsZHJlbi5sZW5ndGggPiAwKSB7XG5cdFx0dGhpcy5yZW1vdmUoMCk7XG5cdH1cbn07XG4iLCIvKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXNcbiAqL1xudmFyIGVsMk1hc3RJRCA9IHJlcXVpcmUoJy4uL3V0aWxzL2VsMk1hc3RJRCcpO1xuXG5cblxuLyoqXG4gKiBGYWN0b3J5IG1ldGhvZCB0byBnZW5lcmF0ZSBhIG5ldyByZWdpb24gaW5zdGFuY2UgZnJvbSBhIERPTSBlbGVtZW50XG4gKiBBbHNvIGltcGxlbWVudHMgYHRlbXBsYXRlYCBhbmQgYGNvdW50YCBkaXJlY3RpdmVzLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gKiBAcmV0dXJucyByZWdpb24gaW5zdGFuY2VcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZyb21FbGVtZW50KGVsLCBwYXJlbnQpIHtcblxuXHQvLyBJZiBwYXJlbnQgaXMgbm90IHNwZWNpZmllZCwgbWFrZS1iZWxpZXZlLlxuXHRwYXJlbnQgPSBwYXJlbnQgfHwgeyBpZDogJyonIH07XG5cblx0dmFyICRlbCA9ICQoZWwpO1xuXG5cdC8vIEJ1aWxkIHJlZ2lvblxuXHR2YXIgcmVnaW9uID0gbmV3IEZSQU1FV09SSy5SZWdpb24oe1xuXHRcdGlkOiBlbDJNYXN0SUQoZWwpLFxuXHRcdCRlbDogJGVsLFxuXHRcdHBhcmVudDogcGFyZW50XG5cdH0pO1xuXG5cdC8vIElmIHRoaXMgcmVnaW9uIGhhcyBhIGRlZmF1bHQgY29tcG9uZW50L3RlbXBsYXRlIHNldCxcblx0Ly8gZ3JhYiB0aGUgaWQgIC0tICBlLmcuIDxyZWdpb24gdGVtcGxhdGU9XCJGb29cIiAvPlxuXHR2YXIgY29tcG9uZW50SWQgPSAkZWwuYXR0cigndGVtcGxhdGUnKSB8fCAkZWwuYXR0cignZGVmYXVsdCcpIHx8ICRlbC5hdHRyKCdjb250ZW50cycpO1xuXG5cblx0Ly8gSWYgYHRlbXBsYXRlYCBzaG9ydGN1dCBpcyBlbmFibGVkLCBhcHBlbmQgc3BlY2lmaWVkIHN1Yi1jb21wb25lbnQocylcblx0Ly8gdG8gdGhlIHJlZ2lvbiBhdXRvbWF0aWNhbGx5XG5cdGlmICggRlJBTUVXT1JLLm9wdGlvbnMuc2hvcnRjdXQudGVtcGxhdGUgJiYgY29tcG9uZW50SWQgKSB7XG5cblx0XHQvLyBJZiBgY291bnRgIGlzIHNldCwgcmVuZGVyIHN1Yi1jb21wb25lbnQgc3BlY2lmaWVkIG51bWJlciBvZiB0aW1lcy5cblx0XHQvLyBlLmcuIDxyZWdpb24gdGVtcGxhdGU9XCJGb29cIiBjb3VudD1cIjNcIiAvPlxuXHRcdC8vXG5cdFx0Ly8gKE5vdGUgdGhhdCBpZiB0aGUgYGNvdW50YCBzaG9ydGN1dCBpcyBkaXNhYmxlZCwgYGNvdW50YCBpcyBhbHdheXMgPSAxKVxuXHRcdHZhciBjb3VudDtcblx0XHRpZiAoRlJBTUVXT1JLLm9wdGlvbnMuc2hvcnRjdXQuY291bnQpIHtcblx0XHRcdGNvdW50ID0gKHR5cGVvZiAkZWwuYXR0cignY291bnQnKSAhPT0gJ3VuZGVmaW5lZCcpID8gJGVsLmF0dHIoJ2NvdW50JykgOiAxO1xuXHRcdH1cblxuXHRcdC8vIEFwcGVuZCB0aGUgc3ViY29tcG9uZW50IHRoZSBhcHByb3ByaWF0ZSAjIG9mIHRpbWVzLlxuXHRcdGZvciAodmFyIGk9MDsgaSA8IGNvdW50OyBpKysgKSB7XG5cdFx0XHRyZWdpb24uYXBwZW5kKGNvbXBvbmVudElkKTtcblx0XHR9XG5cblx0XHRGUkFNRVdPUksuZGVidWcoXG5cdFx0XHRwYXJlbnQuaWQgKyAnIDotOiBJbnN0YW50aWF0ZWTCoG5ldyByZWdpb24nICtcblx0XHRcdCggcmVnaW9uLmlkID8gJyBgJyArIHJlZ2lvbi5pZCArICdgJyA6ICcnICkgK1xuXHRcdFx0KCBjb21wb25lbnRJZCA/ICcgYW5kIHBvcHVsYXRlZCBpdCB3aXRoJyArXG5cdFx0XHRcdCggY291bnQgPiAxID8gY291bnQgKyAnIGluc3RhbmNlcyBvZicgOiAnIDEnICkgK1xuXHRcdFx0XHQnIGAnICsgY29tcG9uZW50SWQgKyAnYCcgOiAnJ1xuXHRcdFx0KSArICcuJ1xuXHRcdCk7XG5cdH1cblxuXHRyZXR1cm4gcmVnaW9uO1xufTtcbiIsIi8qKlxuICogUmVnaW9uc1xuICovXG5cbnZhciBpbnNlcnQgPSByZXF1aXJlKCcuL2luc2VydCcpLFxuXHRcdHJlbW92ZSA9IHJlcXVpcmUoJy4vcmVtb3ZlJyksXG5cdFx0ZW1wdHkgPSByZXF1aXJlKCcuL2VtcHR5JyksXG5cdFx0YXBwZW5kID0gcmVxdWlyZSgnLi9hcHBlbmQnKSxcblx0XHRhdHRhY2ggPSByZXF1aXJlKCcuL2F0dGFjaCcpLFxuXHRcdHByZXBlbmQgPSByZXF1aXJlKCcuL3ByZXBlbmQnKSxcblx0XHRmcm9tRWxlbWVudCA9IHJlcXVpcmUoJy4vZnJvbUVsZW1lbnQnKTtcblxuUmVnaW9uID0gbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByZWdpb24ocHJvcGVydGllcykge1xuXG5cdF8uZXh0ZW5kKHRoaXMsIEZSQU1FV09SSy5FdmVudHMpO1xuXG5cdGlmICghcHJvcGVydGllcykge1xuXHRcdHByb3BlcnRpZXMgPSB7fTtcblx0fVxuXHRpZiAoIXByb3BlcnRpZXMuJGVsKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdUcnlpbmcgdG8gaW5zdGFudGlhdGUgcmVnaW9uIHdpdGggbm8gJGVsIScpO1xuXHR9XG5cblx0Ly8gRm9sZCBpbiBwcm9wZXJ0aWVzIHRvIHByb3RvdHlwZVxuXHRfLmV4dGVuZCh0aGlzLCBwcm9wZXJ0aWVzKTtcblxuXHQvLyBJZiBuZWl0aGVyIGFuIGlkIG5vciBhIGB0ZW1wbGF0ZWAgd2FzIHNwZWNpZmllZCxcblx0Ly8gd2UnbGwgdGhyb3cgYW4gZXJyb3IsIHNpbmNlIHRoZXJlJ3Mgbm8gd2F5IHRvIGdldCBhIGhvbGQgb2YgdGhlIHJlZ2lvblxuXHR2YXIgZGVmYXVsdFRlbXBsYXRlID0gdGhpcy4kZWwuYXR0cignZGVmYXVsdCcpIHx8IHRoaXMuJGVsLmF0dHIoJ3RlbXBsYXRlJykgfHwgdGhpcy4kZWwuYXR0cignY29udGVudHMnKTtcblx0aWYgKCAhdGhpcy5pZCAmJiAhZGVmYXVsdFRlbXBsYXRlICkge1xuXG5cdFx0dGhyb3cgbmV3IEVycm9yKFxuXHRcdFx0dGhpcy5wYXJlbnQuaWQgKyAnIDo6IEEgcmVnaW9uIGlkZW50aWZpZXIgKGUuZy4gYGRhdGEtcmVnaW9uPVwiZm9vXCJgKSBtYXkgJyArXG5cdFx0XHQnb25seSBiZSBvbWl0dGVkIGlmIGEgZGVmYXVsdCB0ZW1wbGF0ZSBpcyBzcGVjaWZpZWQsIGUuZy46XFxuJyArXG5cdFx0XHQnZS5nLiA8cmVnaW9uIHRlbXBsYXRlPVwiU29tZUNvbXBvbmVudFwiPjwvcmVnaW9uPidcblx0XHQpO1xuXHR9XG5cblx0Ly8gU2V0IHVwIGxpc3QgdG8gaG91c2UgY2hpbGQgY29tcG9uZW50c1xuXHR0aGlzLl9jaGlsZHJlbiA9IFtdO1xuXG5cdF8uYmluZEFsbCh0aGlzKTtcblxuXHQvLyBTZXQgdXAgY29udmVuaWVuY2UgYWNjZXNzIHRvIHRoaXMgcmVnaW9uIGluIHRoZSBnbG9iYWwgcmVnaW9uIGNhY2hlXG5cdEZSQU1FV09SSy5yZWdpb25zW3RoaXMuaWRdID0gdGhpcztcbn07XG5cblJlZ2lvbi5mcm9tRWxlbWVudCA9IGZ1bmN0aW9uKGVsLCBwYXJlbnQpIHtcblx0cmV0dXJuIGZyb21FbGVtZW50KGVsLCBwYXJlbnQpO1xufTtcblJlZ2lvbi5wcm90b3R5cGUucmVtb3ZlID0gZnVuY3Rpb24oYXRJbmRleCkge1xuXHRyZXR1cm4gcmVtb3ZlLmNhbGwodGhpcywgYXRJbmRleCk7XG59O1xuUmVnaW9uLnByb3RvdHlwZS5lbXB0eSA9IGZ1bmN0aW9uKCkge1xuXHRyZXR1cm4gZW1wdHkuY2FsbCh0aGlzKTtcbn07XG5SZWdpb24ucHJvdG90eXBlLmluc2VydCA9IGZ1bmN0aW9uKGF0SW5kZXgsIGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKSB7XG5cdHJldHVybiBpbnNlcnQuY2FsbCh0aGlzLCBhdEluZGV4LCBjb21wb25lbnRJZCwgcHJvcGVydGllcyk7XG59O1xuUmVnaW9uLnByb3RvdHlwZS5hcHBlbmQgPSBmdW5jdGlvbihjb21wb25lbnRJZCwgcHJvcGVydGllcykge1xuXHRyZXR1cm4gYXBwZW5kLmNhbGwodGhpcywgY29tcG9uZW50SWQsIHByb3BlcnRpZXMpO1xufTtcblJlZ2lvbi5wcm90b3R5cGUuYXR0YWNoID0gZnVuY3Rpb24oY29tcG9uZW50LCBwcm9wZXJ0aWVzKSB7XG5cdHJldHVybiBhdHRhY2guY2FsbCh0aGlzLCBjb21wb25lbnQsIHByb3BlcnRpZXMpO1xufTtcblJlZ2lvbi5wcm90b3R5cGUucHJlcGVuZCA9IGZ1bmN0aW9uKGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKSB7XG5cdHJldHVybiBwcmVwZW5kLmNhbGwodGhpcywgY29tcG9uZW50SWQsIHByb3BlcnRpZXMpO1xufTtcbiIsIi8qKlxuICogcmVnaW9uLmluc2VydCggYXRJbmRleCwgY29tcG9uZW50SWQsIFtwcm9wZXJ0aWVzXSApXG4gKlxuICogVE9ETzogc3VwcG9ydCBhIGxpc3Qgb2YgcHJvcGVydGllcyBvYmplY3RzIGluIGxpZXUgb2YgdGhlIHByb3BlcnRpZXMgb2JqZWN0XG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpbnNlcnQoYXRJbmRleCwgY29tcG9uZW50SWQsIHByb3BlcnRpZXMpIHtcblxuXHR2YXIgZXJyID0gJyc7XG5cdGlmICghKGF0SW5kZXggfHwgXy5pc0Zpbml0ZShhdEluZGV4KSkpIHtcblx0XHRlcnIgKz0gdGhpcy5pZCArICcuaW5zZXJ0KCkgOjogTm8gYXRJbmRleCBzcGVjaWZpZWQhJztcblx0fVxuXHRlbHNlIGlmICghY29tcG9uZW50SWQpIHtcblx0XHRlcnIgKz0gdGhpcy5pZCArICcuaW5zZXJ0KCkgOjogTm8gY29tcG9uZW50SWQgc3BlY2lmaWVkISc7XG5cdH1cblx0aWYgKGVycikge1xuXHRcdHRocm93IG5ldyBFcnJvcihlcnIgKyAnXFxuVXNhZ2U6IGFwcGVuZChhdEluZGV4LCBjb21wb25lbnRJZCwgW3Byb3BlcnRpZXNdKScpO1xuXHR9XG5cblx0dmFyIGNvbXBvbmVudDtcblx0Ly8gSWYgY29tcG9uZW50SWQgaXMgYSBzdHJpbmcsIGxvb2sgdXAgY29tcG9uZW50IHByb3RvdHlwZSBhbmQgaW5zdGF0aWF0ZVxuXHRpZiAoJ3N0cmluZycgPT0gdHlwZW9mIGNvbXBvbmVudElkKSB7XG5cblx0XHR2YXIgY29tcG9uZW50UHJvdG90eXBlID0gRlJBTUVXT1JLLmNvbXBvbmVudHNbY29tcG9uZW50SWRdO1xuXG5cdFx0aWYgKCFjb21wb25lbnRQcm90b3R5cGUpIHtcblx0XHRcdHZhciB0ZW1wbGF0ZSA9IEZSQU1FV09SSy50ZW1wbGF0ZXNbY29tcG9uZW50SWRdO1xuXHRcdFx0aWYgKCF0ZW1wbGF0ZSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IgKCdJbiAnICtcblx0XHRcdFx0XHQodGhpcy5pZCB8fCAnQW5vbnltb3VzIHJlZ2lvbicpICsgJzo6IFRyeWluZyB0byBhdHRhY2ggJyArXG5cdFx0XHRcdFx0Y29tcG9uZW50SWQgKyAnLCBidXQgbm8gY29tcG9uZW50IG9yIHRlbXBsYXRlIGV4aXN0cyB3aXRoIHRoYXQgaWQuJyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIElmIG5vIGNvbXBvbmVudCBwcm90b3R5cGUgd2l0aCB0aGlzIGlkIGV4aXN0cyxcblx0XHRcdC8vIGNyZWF0ZSBhbiBhbm9ueW1vdXMgb25lIHRvIHVzZVxuXHRcdFx0Y29tcG9uZW50UHJvdG90eXBlID0gRlJBTUVXT1JLLkNvbXBvbmVudC5leHRlbmQoe1xuXHRcdFx0XHRpZDogY29tcG9uZW50SWQsXG5cdFx0XHRcdHRlbXBsYXRlOiB0ZW1wbGF0ZVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gSW5zdGFudGlhdGUgYW5kIHJlbmRlciB0aGUgY29tcG9uZW50IGluc2lkZSB0aGlzIHJlZ2lvblxuXHRcdGNvbXBvbmVudCA9IG5ldyBjb21wb25lbnRQcm90b3R5cGUoXy5leHRlbmQoe1xuXHRcdFx0JG91dGxldDogdGhpcy4kZWxcblx0XHR9LCBwcm9wZXJ0aWVzIHx8IHt9KSk7XG5cblxuXHR9XG5cblx0Ly8gT3RoZXJ3aXNlIGFzc3VtZSBhbiBpbnN0YW50aWF0ZWQgY29tcG9uZW50IG9iamVjdCB3YXMgc2VudFxuXHQvKiBUT0RPOiBDaGVjayB0aGF0IGNvbXBvbmVudCBvYmplY3QgaXMgdmFsaWQgKi9cblx0ZWxzZSB7XG5cdFx0Y29tcG9uZW50ID0gY29tcG9uZW50SWQ7XG5cdFx0Y29tcG9uZW50LiRvdXRsZXQgPSB0aGlzLiRlbDtcblx0fVxuXG5cdC8vIFNhdmUgcmVmZXJlbmNlIHRvIHBhcmVudFJlZ2lvblxuXHRjb21wb25lbnQucGFyZW50UmVnaW9uID0gdGhpcztcblxuXHQvLyBDaGVjayB0byBzZWUgaWYgdGhlIG1vZGVsIHdhcyBhbHJlYWR5IGRlZmluZWQuIElmIGl0IGlzLCB1c2UgdGhhdCBtb2RlbC4gSWYgbm90LCBhc3NpZ24gaXRcblx0Ly8gdGhlIHBhcmVudHMgbW9kZWwgaWYgaXQgaGFzIG9uZSwgb3IgYXNzaWduIGl0IGEgbmV3IGJhY2tib25lIGluc3RhbmNlLlxuXHRpZiAoIWNvbXBvbmVudC5tb2RlbCkge1xuXHRcdGNvbXBvbmVudC5tb2RlbCA9IHRoaXMucGFyZW50Lm1vZGVsID8gdGhpcy5wYXJlbnQubW9kZWwgOiBuZXcgQmFja2JvbmUuTW9kZWwoKTtcblx0fVxuXG5cdC8vIFJlbmRlciBjb21wb25lbnQgaW50byB0aGlzIHJlZ2lvblxuXHRjb21wb25lbnQucmVuZGVyKGF0SW5kZXgpO1xuXG5cdC8vIEFuZCBrZWVwIHRyYWNrIG9mIGl0IGluIHRoZSBsaXN0IG9mIHRoaXMgcmVnaW9uJ3MgY2hpbGRyZW5cblx0dGhpcy5fY2hpbGRyZW4uc3BsaWNlKGF0SW5kZXgsIDAsIGNvbXBvbmVudCk7XG5cblx0Ly8gTG9nIGZvciBkZWJ1Z2dpbmcgYGNvdW50YCBkZWNsYXJhdGl2ZVxuXHR2YXIgZGVidWdTdHIgPSB0aGlzLnBhcmVudC5pZCArICcgOjogSW5zZXJ0ZWQgJyArIGNvbXBvbmVudElkICsgJyBpbnRvICc7XG5cdGlmICh0aGlzLmlkKSBkZWJ1Z1N0ciArPSAncmVnaW9uOiAnICsgdGhpcy5pZCArICcgYXQgaW5kZXggJyArIGF0SW5kZXg7XG5cdGVsc2UgZGVidWdTdHIgKz0gJ2Fub255bW91cyByZWdpb24gYXQgaW5kZXggJyArIGF0SW5kZXg7XG5cdEZSQU1FV09SSy52ZXJib3NlKGRlYnVnU3RyKTtcblxuXHRyZXR1cm4gY29tcG9uZW50O1xuXG59O1xuIiwiLyoqXG4gKiBQcmVwZW5kIGEgY29tcG9uZW50IHRvIHRoZSBiZWdpbm5pbmcgb2YgYSByZWdpb24uIFRoaXMgY2FsbHMgaW5zZXJ0IGF0IHRoZSBmaXJzdCBwb3NpdGlvbi5cbiAqXG4gKiBAcGFyYW0gIHtTdHJpbmd9IGNvbXBvbmVudElkIFtUaGUgY29tcG9uZW50IGlkIHRoYXQgd2Ugd2FudCB0byBwcmVwZW5kIF1cbiAqIEBwYXJhbSAge09iamVjdH0gcHJvcGVydGllcyAgW1Byb3BlcnRpZXMgdG8gaW5zdGFudGlhdGUgdGhlIGNvbXBvbmVudCB3aXRoXVxuICpcbiAqIEByZXR1cm4ge0NvbXBvbmVudH0gICAgICAgICAgW05ld2x5IHByZXBlbmRlZCBDb21wb25lbnRdXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcHJlcGVuZChjb21wb25lbnRJZCwgcHJvcGVydGllcykge1xuXHQvLyBJbnNlcnQgYXQgbGFzdCBwb3NpdGlvblxuXHRyZXR1cm4gdGhpcy5pbnNlcnQoMCwgY29tcG9uZW50SWQsIHByb3BlcnRpZXMpO1xufTtcbiIsIi8qKlxuICogcmVnaW9uLnJlbW92ZSggYXRJbmRleCApXG4gKlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHJlbW92ZShhdEluZGV4KSB7XG5cblx0aWYgKCFhdEluZGV4ICYmICFfLmlzRmluaXRlKGF0SW5kZXgpKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKHRoaXMuaWQgKyAnLnJlbW92ZSgpIDo6IE5vIGF0SW5kZXggc3BlY2lmaWVkISBcXG5Vc2FnZTogcmVtb3ZlKGF0SW5kZXgpJyk7XG5cdH1cblxuXHQvLyBSZW1vdmUgdGhlIGNvbXBvbmVudCBmcm9tIHRoZSBsaXN0XG5cdHZhciBjb21wb25lbnQgPSB0aGlzLl9jaGlsZHJlbi5zcGxpY2UoYXRJbmRleCwgMSk7XG5cdGlmICghY29tcG9uZW50WzBdKSB7XG5cblx0XHQvLyBJZiB0aGUgbGlzdCBpcyBlbXB0eSwgZnJlYWsgb3V0XG5cdFx0dGhyb3cgbmV3IEVycm9yKHRoaXMuaWQgKyAnLnJlbW92ZSgpIDo6IFRyeWluZyB0byByZW1vdmUgYSBjb21wb25lbnQgdGhhdCBkb2VzblxcJ3QgZXhpc3QgYXQgaW5kZXggJyArIGF0SW5kZXgpO1xuXHR9XG5cblx0Ly8gU3F1ZWV6ZSB0aGUgY29tcG9uZW50IHRvIGRvIGdldCBhbGwgdGhlIGJpbmR5IGdvb2RuZXNzIG91dFxuXHRjb21wb25lbnRbMF0uY2xvc2UoKTtcblxuXHRGUkFNRVdPUksuZGVidWcodGhpcy5wYXJlbnQuaWQgKyAnIDo6IFJlbW92ZWQgY29tcG9uZW50IGF0IGluZGV4ICcgKyBhdEluZGV4ICsgJyBmcm9tIHJlZ2lvbjogJyArIHRoaXMuaWQpO1xufTtcbiIsIi8qKlxuICogU2V0cyB1cCB0aGUgRlJBTUVXT1JLIHJvdXRlci5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByb3V0ZXJTZXR1cCgpIHtcblxuXHQvLyBXaWxkY2FyZCByb3V0ZXMgdG8gZ2xvYmFsIGV2ZW50IGRlbGVnYXRvclxuXHR2YXIgcm91dGVyID0gbmV3IEZSQU1FV09SSy5Sb3V0ZXIoKTtcblx0cm91dGVyLnJvdXRlKC8oLiopLywgJ3JvdXRlJywgZnVuY3Rpb24gKHJvdXRlKSB7XG5cblx0XHQvLyBOb3JtYWxpemUgaG9tZSByb3V0ZXMgKCMgb3IgbnVsbCkgdG8gJydcblx0XHRpZiAoIXJvdXRlKSB7XG5cdFx0XHRyb3V0ZSA9ICcnO1xuXHRcdH1cblxuXHRcdC8vIFRyaWdnZXIgcm91dGVcblx0XHRGUkFNRVdPUksudHJpZ2dlcignIycgKyByb3V0ZSk7XG5cdH0pO1xuXG5cdC8vIEV4cG9zZSBgbmF2aWdhdGUoKWAgbWV0aG9kXG5cdEZSQU1FV09SSy5uYXZpZ2F0ZSA9IEZSQU1FV09SSy5oaXN0b3J5Lm5hdmlnYXRlO1xufVxuIiwiLyoqXG4gKiBCYXJlLWJvbmVzIERPTS9VSSB1dGlsaXRpZXNcbiAqL1xuXG52YXIgRXZlbnRzID0gcmVxdWlyZSgnLi9ldmVudHMnKTtcblxudmFyIERPTSA9IHtcblxuXHQvKipcblx0ICogRXhwb3NlIHRoZSBcIkRPTW15LWV2ZW50ZWRuZXNzXCIgb2YgZWxlbWVudHMgc28gdGhhdCBpdCdzIHNlbGVjdGFibGUgdmlhIENTU1xuXHQgKiBZb3UgY2FuIHVzZSB0aGlzIHRvIGFwcGx5IGEgZmV3IGNob2ljZSBET00gbW9kaWZpY2F0aW9ucyBvdXQgdGhlIGdhdGUtLVxuXHQgKiAoZS5nLiB0d2Vha3MgdGFyZ2V0aW5nIGNvbW1vbiBpc3N1ZXMgdGhhdCB0eXBpY2FsbHkgZ2V0IGZvcmdvdHRlbiwgbGlrZSBkaXNhYmxpbmcgdGV4dCBzZWxlY3Rpb24pXG5cdCAqXG5cdCAqIEBwYXJhbSB7Q29tcG9uZW50fSBjb21wb25lbnRcblx0ICovXG5cdGZsYWdCb3VuZEV2ZW50czogZnVuY3Rpb24gKCBjb21wb25lbnQgKSB7XG5cblx0XHQvLyBUT0RPOiBwcm92aWRlIGFjY2VzcyB0byBib3VuZCBnbG9iYWwgZXZlbnRzICglKSBhbmQgcm91dGVzICgjKSBhcyB3ZWxsXG5cdFx0Ly8gVE9ETzogZmxhZyBhbGwgRE9NIGV2ZW50cywgbm90IGp1c3QgY2xpY2sgYW5kIHRvdWNoXG5cblx0XHQvLyBCdWlsZCBzdWJzZXQgb2YganVzdCB0aGUgY2xpY2svdG91Y2ggZXZlbnRzXG5cdFx0dmFyIGNsaWNrT3JUb3VjaEV2ZW50cyA9IEV2ZW50cy5wYXJzZShcblx0XHRcdGNvbXBvbmVudC5ldmVudHMsXG5cdFx0XHR7IG9ubHk6IFsnY2xpY2snLCAndG91Y2gnLCAndG91Y2hzdGFydCcsICd0b3VjaGVuZCddIH1cblx0XHQpO1xuXG5cdFx0Ly8gSWYgbm8gY2xpY2svdG91Y2ggZXZlbnRzIGZvdW5kLCBiYWlsIG91dFxuXHRcdGlmICggY2xpY2tPclRvdWNoRXZlbnRzLmxlbmd0aCA8IDEgKSByZXR1cm47XG5cblx0XHQvLyBRdWVyeSBhZmZlY3RlZCBlbGVtZW50cyBmcm9tIERPTVxuXHRcdHZhciAkYWZmZWN0ZWQgPSBFdmVudHMuZ2V0RWxlbWVudHMoY2xpY2tPclRvdWNoRXZlbnRzLCBjb21wb25lbnQpO1xuXG5cdFx0Ly8gTk9URTogRm9yIG5vdywgdGhpcyBpcyBhbHdheXMganVzdCAnY2xpY2snXG5cdFx0dmFyIGJvdW5kRXZlbnRzU3RyaW5nID0gJ2NsaWNrJztcblxuXHRcdC8vIFNldCBgZGF0YS1GUkFNRVdPUkstY2xpY2thYmxlYCBjdXN0b20gYXR0cmlidXRlXG5cdFx0Ly8gKHVpIGxvZ2ljIHNob3VsZCBiZSBleHRlbmRlZCBpbiBDU1MpXG5cdFx0JGFmZmVjdGVkLmF0dHIoJ2RhdGEtJyArIEZSQU1FV09SSy5vcHRpb25zLmZyYW1ld29ya0lkICsgJy1ldmVudHMnLCBib3VuZEV2ZW50c1N0cmluZyk7XG5cblx0XHRGUkFNRVdPUksudmVyYm9zZShcblx0XHRcdGNvbXBvbmVudC5pZCArICcgOjogJyArXG5cdFx0XHQnRGlzYWJsZWQgdXNlciB0ZXh0IHNlbGVjdGlvbiBvbiBlbGVtZW50cyB3LyBjbGljay90b3VjaCBldmVudHM6Jyxcblx0XHRcdGNsaWNrT3JUb3VjaEV2ZW50cyxcblx0XHRcdCRhZmZlY3RlZFxuXHRcdCk7XG5cdH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gRE9NO1xuIiwiLyoqXG4gKiBHcmFicyB0aGUgTWFzdCBpZGVudGlmaWVyIGZyb20gYW4gSFRNTCBlbGVtZW50LlxuICogU3VwcG9ydHMgYGlkYCwgYGRhdGEtaWRgLCBvciBgZGF0YS1yZWdpb25gXG4gKlxuICogQHBhcmFtICB7RE9NRWxlbWVudH0gZWwgICAgW3RoZSBET00gZWxlbWVudCB0byBpbnNwZWN0XVxuICogQHBhcmFtICB7Qm9vbGVhbn0gcmVxdWlyZWQgW3doZXRoZXIgYW4gaWRlbnRpZmllciBpcyByZXF1aXJlZF1cbiAqXG4gKiBAcmV0dXJuIHtTdHJpbmd9ICAgICAgICAgICBbaWRlbnRpZmllcl1cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGVsMk1hc3RJRCAoZWwsIHJlcXVpcmVkKSB7XG5cblx0dmFyIGlkID0gJChlbCkuYXR0cignaWQnKTtcblx0dmFyIGRhdGFJZCA9ICQoZWwpLmF0dHIoJ2RhdGEtaWQnKSB8fCAkKGVsKS5hdHRyKCdkYXRhLXJlZ2lvbicpO1xuXHR2YXIgY29udGVudHNJZCA9ICQoZWwpLmF0dHIoJ2NvbnRlbnRzJyk7XG5cblx0aWYgKGlkICYmIGRhdGFJZCkge1xuXHRcdHRocm93IG5ldyBFcnJvcihpZCArICcgOjogQ2Fubm90IHNldCBib3RoIGBpZGAgYW5kIGBkYXRhLWlkYCEgIFBsZWFzZSB1c2Ugb25lIG9yIHRoZSBvdGhlci4gIChkYXRhLWlkIGlzIHNhZmVzdCknKTtcblx0fVxuXHRpZiAocmVxdWlyZWQgJiYgIWlkICYmICFkYXRhSWQpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIGlkIHNwZWNpZmllZCBpbiBlbGVtZW50IHdoZXJlIGl0IGlzIHJlcXVpcmVkOlxcbicgKyBlbCk7XG5cdH1cblxuXHRyZXR1cm4gaWQgfHwgZGF0YUlkIHx8IGNvbnRlbnRzSWQ7XG59O1xuIiwiLyoqXG4gKiBVdGlsaXR5IEV2ZW50IHRvb2xraXRcbiAqL1xuXG52YXIgRXZlbnRzID0ge1xuXG5cdC8qKlxuXHQgKiBQYXJzZXMgYSBkaWN0aW9uYXJ5IG9mIGV2ZW50cyBhbmQgb3B0aW9uYWxseSBmaWx0ZXJzIGJ5IHRoZSBldmVudCB0eXBlLiBJZiB0aGUgZXZlbnRcblx0ICpcblx0ICogQHBhcmFtICB7T2JqZWN0fSBldmVudHMgIFtBIEJhY2tib25lLlZpZXcgZXZlbnRzIG9iamVjdF1cblx0ICogQHBhcmFtICB7T2JqZWN0fSBvcHRpb25zIFtPcHRpb25zIG9iamVjdCB0aGF0IGFsbG93cyB1cyB0byBmaWx0ZXIgcGFyc2luZyB0byBjZXJ0YWluIGV2ZW50XG5cdCAqICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZXNdXG5cdCAqXG5cdCAqIEByZXR1cm4ge0FycmF5fSAgICAgICAgICBbQXJyYXkgY29udGFpbmluZyBwYXJzZWRFdmVudHMgdGhhdCBhcmUgbWF0Y2hpbmcgZXZlbnQga2V5c11cblx0ICovXG5cdHBhcnNlOiBmdW5jdGlvbiAoZXZlbnRzLCBvcHRpb25zKSB7XG5cblx0XHR2YXIgZXZlbnRLZXlzID0gXy5rZXlzKGV2ZW50cyB8fCB7fSksXG5cdFx0XHRsaW1pdEV2ZW50cyxcblx0XHRcdHBhcnNlZEV2ZW50cyA9IFtdO1xuXG5cdFx0Ly8gT3B0aW9uYWxseSBmaWx0ZXIgdXNpbmcgc2V0IG9mIGFjY2VwdGFibGUgZXZlbnQgdHlwZXNcblx0XHRsaW1pdEV2ZW50cyA9IG9wdGlvbnMub25seTtcblx0XHRldmVudEtleXMgPSBfLmZpbHRlcihldmVudEtleXMsIGZ1bmN0aW9uIGNoZWNrRXZlbnROYW1lIChldmVudEtleSkge1xuXG5cdFx0XHQvLyBQYXJzZSBldmVudCBzdHJpbmcgaW50byBzZW1hbnRpYyByZXByZXNlbnRhdGlvblxuXHRcdFx0dmFyIGV2ZW50ID0gRXZlbnRzLnBhcnNlRE9NRXZlbnQoZXZlbnRLZXkpO1xuXHRcdFx0cGFyc2VkRXZlbnRzLnB1c2goZXZlbnQpO1xuXG5cdFx0XHQvLyBPcHRpb25hbCBmaWx0ZXJcblx0XHRcdGlmIChsaW1pdEV2ZW50cykge1xuXHRcdFx0XHRyZXR1cm4gXy5jb250YWlucyhsaW1pdEV2ZW50cywgZXZlbnQubmFtZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBwYXJzZWRFdmVudHM7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFtnZXRFbGVtZW50cyBkZXNjcmlwdGlvbl1cblx0ICpcblx0ICogQHBhcmFtICB7QXJyYXl9IHNlbWFudGljRXZlbnRzIFtBIGxpc3Qgb2YgcGFyc2VkIGV2ZW50IG9iamVjdHNdXG5cdCAqIEBwYXJhbSAge0NvbXBvbmVudH0gY29udGV4dCAgICBbSW5zdGFuY2Ugb2YgYSBjb21wb25lbnQgdG8gdXNlIGFzIGEgc3RhcnRpbmcgcG9pbnQgZm9yXG5cdCAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhlIERPTSBxdWVyaWVzXVxuXHQgKlxuXHQgKiBAcmV0dXJuIHtBcnJheX0gICAgICAgICAgICAgICAgW0FuIGFycmF5IG9mIGpRdWVyeSBzZXQgb2YgbWF0Y2hlZCBlbGVtZW50c11cblx0ICovXG5cdGdldEVsZW1lbnRzOiBmdW5jdGlvbiAoc2VtYW50aWNFdmVudHMsIGNvbnRleHQpIHtcblxuXHRcdC8vIENvbnRleHQgb3B0aW9uYWxcblx0XHRjb250ZXh0ID0gY29udGV4dCB8fCB7ICQ6ICQgfTtcblxuXHRcdC8vIEl0ZXJhdGl2ZWx5IGJ1aWxkIGEgc2V0IG9mIGFmZmVjdGVkIGVsZW1lbnRzXG5cdFx0dmFyICRhZmZlY3RlZCA9ICQoKTtcblx0XHRfLmVhY2goc2VtYW50aWNFdmVudHMsIGZ1bmN0aW9uIGxvb2t1cEVsZW1lbnRzRm9yRXZlbnQgKGV2ZW50KSB7XG5cblx0XHRcdC8vIERldGVybWluZSBtYXRjaGVkIGVsZW1lbnRzXG5cdFx0XHQvLyBVc2UgZGVsZWdhdGUgc2VsZWN0b3IgaWYgc3BlY2lmaWVkXG5cdFx0XHQvLyBPdGhlcndpc2UsIGdyYWIgdGhlIGVsZW1lbnQgZm9yIHRoaXMgY29tcG9uZW50XG5cdFx0XHR2YXIgJG1hdGNoZWQgPVx0ZXZlbnQuc2VsZWN0b3IgP1xuXHRcdFx0XHRcdFx0XHRjb250ZXh0LiQoZXZlbnQuc2VsZWN0b3IpIDpcblx0XHRcdFx0XHRcdFx0Y29udGV4dC4kZWw7XG5cblx0XHRcdC8vIEFkZCBtYXRjaGVkIGVsZW1lbnRzIHRvIHNldFxuXHRcdFx0JGFmZmVjdGVkID0gJGFmZmVjdGVkLmFkZCggJG1hdGNoZWQgKTtcblx0XHR9LCB0aGlzKTtcblxuXHRcdHJldHVybiAkYWZmZWN0ZWQ7XG5cdH0sXG5cblxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHdoZXRoZXIgdGhlIHNwZWNpZmllZCBldmVudCBrZXkgbWF0Y2hlcyBhIERPTSBldmVudC5cblx0ICpcblx0ICogQHBhcmFtICB7U3RyaW5nfSBrZXkgW0tleSB0byBtYXRjaCBhZ2FpbnN0XVxuXHQgKlxuXHQgKiBpZiBubyBtYXRjaCBpcyBmb3VuZFxuXHQgKiBAcmV0dXJuIHtCb29sZWFufSBcdFx0W3JldHVybiBgZmFsc2VgXVxuXHQgKlxuXHQgKiBvdGhlcndpc2Vcblx0ICogQHJldHVybiB7T2JqZWN0fSAgXHRcdFtPYmplY3QgY29udGFpbmluZyB0aGUgYG5hbWVgIG9mIHRoZSBET00gZWxlbWVudCBhbmQgdGhlIGBzZWxlY3RvcmBdXG5cdCAqL1xuXHRwYXJzZURPTUV2ZW50OiBfLm1lbW9pemUoZnVuY3Rpb24oa2V5KSB7XG5cblx0XHR2YXIgbWF0Y2hlcyA9IGtleS5tYXRjaCh0aGlzWycvRE9NRXZlbnQvJ10pO1xuXG5cdFx0aWYgKCFtYXRjaGVzIHx8ICFtYXRjaGVzWzFdKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdG5hbWU6IG1hdGNoZXNbMV0sXG5cdFx0XHRzZWxlY3RvcjogbWF0Y2hlc1szXVxuXHRcdH07XG5cdH0pLFxuXG5cblx0LyoqXG5cdCAqIFN1cHBvcnRlZCBcImZpcnN0LWNsYXNzXCIgRE9NIGV2ZW50cy5cblx0ICogQHR5cGUge0FycmF5fVxuXHQgKi9cblx0bmFtZXM6IFtcblxuXHRcdC8vIExvY2FsaXplZCBicm93c2VyIGV2ZW50c1xuXHRcdC8vICh3b3JrcyBvbiBpbmRpdmlkdWFsIGVsZW1lbnRzKVxuXHRcdCdlcnJvcicsICdzY3JvbGwnLFxuXG5cdFx0Ly8gTW91c2UgZXZlbnRzXG5cdFx0J2NsaWNrJywgJ2RibGNsaWNrJywgJ21vdXNlZG93bicsICdtb3VzZXVwJywgJ2hvdmVyJywgJ21vdXNlZW50ZXInLCAnbW91c2VsZWF2ZScsXG5cdFx0J21vdXNlb3ZlcicsICdtb3VzZW91dCcsICdtb3VzZW1vdmUnLFxuXG5cdFx0Ly8gS2V5Ym9hcmQgZXZlbnRzXG5cdFx0J2tleWRvd24nLCAna2V5dXAnLCAna2V5cHJlc3MnLFxuXG5cdFx0Ly8gRm9ybSBldmVudHNcblx0XHQnYmx1cicsICdjaGFuZ2UnLCAnZm9jdXMnLCAnZm9jdXNpbicsICdmb2N1c291dCcsICdzZWxlY3QnLCAnc3VibWl0JyxcblxuXHRcdC8vIFJhdyB0b3VjaCBldmVudHNcblx0XHQndG91Y2hzdGFydCcsICd0b3VjaGVuZCcsICd0b3VjaG1vdmUnLCAndG91Y2hjYW5jZWwnLFxuXG5cdFx0Ly8gTWFudWZhY3R1cmVkIGV2ZW50c1xuXHRcdCd0b3VjaCcsXG5cblx0XHQvLyBUT0RPOlxuXHRcdCdyaWdodGNsaWNrJywgJ2NsaWNrb3V0c2lkZSdcblx0XVxufTtcblxuXG5cblxuLyoqXG4gKiBSZWdleHAgdG8gbWF0Y2ggXCJmaXJzdCBjbGFzc1wiIERPTSBldmVudHNcbiAqICh0aGVzZSBhcmUgYWxsb3dlZCBpbiB0aGUgdG9wIGxldmVsIG9mIGEgY29tcG9uZW50IGRlZmluaXRpb24gYXMgbWV0aG9kIGtleXMpXG4gKlx0XHRpLmUuIC9eKGNsaWNrfGhvdmVyfGJsdXJ8Zm9jdXMpKCAoLispKS9cbiAqXHRcdFx0WzFdID0+IGV2ZW50IG5hbWVcbiAqXHRcdFx0WzNdID0+IHNlbGVjdG9yXG4gKi9cblxuRXZlbnRzWycvRE9NRXZlbnQvJ10gPSBuZXcgUmVnRXhwKCdeKCcgKyBfLnJlZHVjZShFdmVudHMubmFtZXMsXG5cdGZ1bmN0aW9uIGJ1aWxkUmVnZXhwKG1lbW8sIGV2ZW50TmFtZSwgaW5kZXgpIHtcblxuXHRcdC8vIE9taXQgYHxgIHRoZSBmaXJzdCB0aW1lXG5cdFx0aWYgKGluZGV4ID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gbWVtbyArIGV2ZW50TmFtZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbWVtbyArICd8JyArIGV2ZW50TmFtZTtcblx0fSwgJycpICtcbicpKCAoLispKT8kJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gRXZlbnRzO1xuIiwiLyoqXG4gKiBNYXAgYW4gb2JqZWN0J3MgdmFsdWVzLCBhbmQgcmV0dXJuIGEgdmFsaWQgb2JqZWN0ICh0aGlzIGZ1bmN0aW9uIGlzIGhhbmR5IGJlY2F1c2VcbiAqIHVuZGVyc2NvcmUubWFwKCkgcmV0dXJucyBhIGxpc3QsIG5vdCBhbiBvYmplY3QuKVxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmogICAgICAgICAgICBbT2JqZWN0IHdob3MgdmFsdWVzIHlvdSB3YW50IHRvIG1hcF1cbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSB0cmFuc2Zvcm1GbiBbRnVuY3Rpb24gdG8gdHJhbnNmb3JtIGVhY2ggb2JqZWN0IHZhbHVlIGJ5XVxuICpcbiAqIEByZXR1cm4ge09iamVjdH0gICAgICAgICAgICAgICAgW05ldyBvYmplY3Qgd2l0aCB0aGUgdmFsdWVzIG1hcHBlZF1cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIG9iak1hcChvYmosIHRyYW5zZm9ybUZuKSB7XG5cdHJldHVybiBfLm9iamVjdChfLmtleXMob2JqKSwgXy5tYXAob2JqLCB0cmFuc2Zvcm1GbikpO1xufTtcblxuIiwiLyoqXG4gKiBUcmFuc2xhdGUgKipyaWdodC1oYW5kLXNpZGUgYWJicmV2aWF0aW9ucyoqIGludG8gZnVuY3Rpb25zIHRoYXQgcGVyZm9ybVxuICogdGhlIHByb3BlciBiZWhhdmlvcnMsIGUuZy5cbiAqXHRcdCNhYm91dF9tZVxuICpcdFx0JW1haW5NZW51Om9wZW5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHRyYW5zbGF0ZVNob3J0aGFuZCh2YWx1ZSwga2V5KSB7XG5cblx0dmFyIG1hdGNoZXMsIGZuO1xuXG5cdC8vIElmIHRoaXMgaXMgYW4gaW1wb3J0YW50LCBGUkFNRVdPUkstc3BlY2lmaWMgZGF0YSBrZXksXG5cdC8vIGFuZCBhIGZ1bmN0aW9uIHdhcyBzcGVjaWZpZWQsIHJ1biBpdCB0byBnZXQgaXRzIHZhbHVlXG5cdC8vICh0aGlzIGlzIHRvIGtlZXAgcGFyaXR5IHdpdGggQmFja2JvbmUncyBzaW1pbGFyIGZ1bmN0aW9uYWxpdHkpXG5cdGlmIChfLmlzRnVuY3Rpb24odmFsdWUpICYmIChrZXkgPT09ICdjb2xsZWN0aW9uJyB8fCBrZXkgPT09ICdtb2RlbCcpKSB7XG5cdFx0cmV0dXJuIHZhbHVlKCk7XG5cdH1cblxuXHQvLyBJZ25vcmUgb3RoZXIgbm9uLXN0cmluZ3Ncblx0aWYgKCFfLmlzU3RyaW5nKHZhbHVlKSkge1xuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxuXG5cdC8vIEFsc28gaWdub3JlIGB0ZW1wbGF0ZWBcblx0Ly8gVE9ETzogdXNlIGEgZGlmZmVyZW50IGtleSBsYXRlclxuXHRpZiAoa2V5ID09PSAndGVtcGxhdGUnKSByZXR1cm4gdmFsdWU7XG5cblx0Ly8gQWxzbyBpZ25vcmUgdGhpbmdzIHRoYXQgc3RhcnQgd2l0aCBfXG5cdGlmIChrZXkubWF0Y2goL15fLykpIHJldHVybiB2YWx1ZTtcblxuXG5cdC8vIFJlZGlyZWN0cyB1c2VyIHRvIGNsaWVudC1zaWRlIFVSTCwgdy9vIGFmZmVjdGluZyBicm93c2VyIGhpc3Rvcnlcblx0Ly8gTGlrZSBjYWxsaW5nIGBCYWNrYm9uZS5oaXN0b3J5Lm5hdmlnYXRlKCcvZm9vJywgeyByZXBsYWNlOiB0cnVlIH0pYFxuXHRpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXiMjKC4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHRcdGZuID0gZnVuY3Rpb24gcmVkaXJlY3RBbmRDb3ZlclRyYWNrcygpIHtcblx0XHRcdHZhciB1cmwgPSBtYXRjaGVzWzFdO1xuXHRcdFx0RlJBTUVXT1JLLmhpc3RvcnkubmF2aWdhdGUodXJsLCB7XG5cdFx0XHRcdHRyaWdnZXI6IHRydWUsXG5cdFx0XHRcdHJlcGxhY2U6IHRydWVcblx0XHRcdH0pO1xuXHRcdH07XG5cdH1cblx0Ly8gTWV0aG9kIHRvIHJlZGlyZWN0IHVzZXIgdG8gYSBjbGllbnQtc2lkZSBVUkwsIHRoZW4gY2FsbCB0aGUgaGFuZGxlclxuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eIyguKlteLlxcc10rKS8pKSAmJiBtYXRjaGVzWzFdKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiBjaGFuZ2VVcmxGcmFnbWVudCgpIHtcblx0XHRcdHZhciB1cmwgPSBtYXRjaGVzWzFdO1xuXHRcdFx0RlJBTUVXT1JLLmhpc3RvcnkubmF2aWdhdGUodXJsLCB7XG5cdFx0XHRcdHRyaWdnZXI6IHRydWVcblx0XHRcdH0pO1xuXHRcdH07XG5cdH1cblx0Ly8gTWV0aG9kIHRvIHRyaWdnZXIgZ2xvYmFsIGV2ZW50XG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14oJS4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHRcdGZuID0gZnVuY3Rpb24gdHJpZ2dlckV2ZW50KCkge1xuXHRcdFx0dmFyIHRyaWdnZXIgPSBtYXRjaGVzWzFdO1xuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UodGhpcy5pZCArICcgOjogVHJpZ2dlcmluZyBldmVudCAoJyArIHRyaWdnZXIgKyAnKS4uLicpO1xuXHRcdFx0RlJBTUVXT1JLLnRyaWdnZXIodHJpZ2dlcik7XG5cdFx0fTtcblx0fVxuXHQvLyBNZXRob2QgdG8gZmlyZSBhIHRlc3QgYWxlcnRcblx0Ly8gKHVzZSBtZXNzYWdlLCBpZiBzcGVjaWZpZWQpXG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14hISFcXHMqKC4qW14uXFxzXSk/LykpKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiBiYW5nQWxlcnQoZSkge1xuXG5cdFx0XHQvLyBJZiBzcGVjaWZpZWQsIG1lc3NhZ2UgaXMgdXNlZCwgb3RoZXJ3aXNlICdBbGVydCB0cmlnZ2VyZWQhJ1xuXHRcdFx0dmFyIG1zZyA9IChtYXRjaGVzICYmIG1hdGNoZXNbMV0pIHx8ICdEZWJ1ZyBhbGVydCAoISEhKSB0cmlnZ2VyZWQhJztcblxuXHRcdFx0Ly8gT3RoZXIgZGlhZ25vc3RpYyBpbmZvcm1hdGlvblxuXHRcdFx0bXNnICs9ICdcXG5cXG5EaWFnbm9zdGljc1xcbj09PT09PT09PT09PT09PT09PT09PT09PVxcbic7XG5cdFx0XHRpZiAoZSAmJiBlLmN1cnJlbnRUYXJnZXQpIHtcblx0XHRcdFx0bXNnICs9ICdlLmN1cnJlbnRUYXJnZXQgOjogJyArIGUuY3VycmVudFRhcmdldDtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmlkKSB7XG5cdFx0XHRcdG1zZyArPSAndGhpcy5pZCA6OiAnICsgdGhpcy5pZDtcblx0XHRcdH1cblxuXHRcdFx0YWxlcnQobXNnKTtcblx0XHR9O1xuXHR9XG5cblx0Ly8gTWV0aG9kIHRvIGxvZyBhIG1lc3NhZ2UgdG8gdGhlIGNvbnNvbGVcblx0Ly8gKHVzZSBtZXNzYWdlLCBpZiBzcGVjaWZpZWQpXG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14+Pj5cXHMqKC4qW14uXFxzXSk/LykpKSB7XG5cblx0XHRmbiA9IGZ1bmN0aW9uIGxvZ01lc3NhZ2UoZSkge1xuXG5cdFx0XHQvLyBJZiBzcGVjaWZpZWQsIG1lc3NhZ2UgaXMgdXNlZCwgb3RoZXJ3aXNlIHVzZSBkZWZhdWx0XG5cdFx0XHR2YXIgbXNnID0gKG1hdGNoZXMgJiYgbWF0Y2hlc1sxXSkgfHwgJ0xvZyBtZXNzYWdlICg+Pj4pIHRyaWdnZXJlZCEnO1xuXHRcdFx0RlJBTUVXT1JLLmxvZyhtc2cpO1xuXHRcdH07XG5cdH1cblxuXHQvLyBNZXRob2QgdG8gYXR0YWNoIHRoZSBzcGVjaWZpZWQgY29tcG9uZW50L3RlbXBsYXRlIHRvIGEgcmVnaW9uXG5cdGVsc2UgaWYgKFxuXHRcdCgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eKFteLlxcc10rKVxccyo8XFwtXFxzKiguKlteLlxcc10pLykpICYmIG1hdGNoZXNbMV0gJiYgbWF0Y2hlc1syXSkgfHxcblx0XHQoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXihbXi5cXHNdKylcXHMqXFwtPlxccyooLipbXi5cXHNdKS8pKSAmJiBtYXRjaGVzWzFdICYmIG1hdGNoZXNbMl0gJiZcblx0XHRcdChtYXRjaGVzWyd0bXAnXSA9IG1hdGNoZXNbMV0pICYmIChtYXRjaGVzWzFdID0gbWF0Y2hlc1syXSkgJiYgKG1hdGNoZXNbMl0gPSBtYXRjaGVzWyd0bXAnXSkpXG5cdCkge1xuXHRcdGZuID0gZnVuY3Rpb24gYXR0YWNoVGVtcGxhdGUoKSB7XG5cblx0XHRcdC8vIFJlbW92ZSBhbGwgd2hpdGVzcGFjZSBmcm9tIG1hdGNoZXNcblx0XHRcdG1hdGNoZXNbMV0gPSBtYXRjaGVzWzFdLnJlcGxhY2UoLyhcXHMrKS9nLCAnJyk7XG5cdFx0XHRtYXRjaGVzWzJdID0gbWF0Y2hlc1syXS5yZXBsYWNlKC8oXFxzKykvZywgJycpO1xuXG5cdFx0XHR2YXIgcmVnaW9uID0gbWF0Y2hlc1sxXTtcblx0XHRcdHZhciB0ZW1wbGF0ZSA9IG1hdGNoZXNbMl07XG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZSh0aGlzLmlkICsgJyA6OiBBdHRhY2hpbmcgYCcgKyB0ZW1wbGF0ZSArICdgIHRvIGAnICsgcmVnaW9uICsgJ2AuLi4nKTtcblxuXG5cdFx0XHRpZiAoIXRoaXNbcmVnaW9uXSkge1xuXHRcdFx0XHRGUkFNRVdPUksuZXJyb3IodGhpcy5pZCwnOjogVHJ5aW5nIHRvIGF0dGFjaCByZWdpb24gd2l0aCBzaG9ydGhhbmQgKCcrdmFsdWUrJyksIGJ1dCBjb3VsZCBub3QgZmluZCByZWdpb24gYCcrcmVnaW9uKydgJyk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXNbcmVnaW9uXS5hdHRhY2godGVtcGxhdGUpO1xuXHRcdH07XG5cdH1cblxuXG5cdC8vIE1ldGhvZCB0byB0b2dnbGUgKCEpIHRoZSBzcGVjaWZpZWQgbW9kZWwgYXR0clxuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eXFwhXFxzKlxcQCguKlteLlxcc10pLykpICYmIG1hdGNoZXNbMV0pIHtcblx0XHRmbiA9IGZ1bmN0aW9uIHRvZ2dsZUF0dHIoKSB7XG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZSh0aGlzLmlkICsgJyA6OiBUb2dnbGluZyBhdHRyICgnICsgbWF0Y2hlc1sxXSArICcpLi4uJyk7XG5cdFx0XHR2YXIgb2xkQXR0clZhbHVlID0gdGhpcy5tb2RlbC5nZXQoIG1hdGNoZXNbMV0gKTtcblxuXHRcdFx0aWYgKG9sZEF0dHJWYWx1ZSkge1xuXHRcdFx0XHR0aGlzLm1vZGVsLnNldCggbWF0Y2hlc1sxXSwgZmFsc2UgKTtcblx0XHRcdH1cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHR0aGlzLm1vZGVsLnNldCggbWF0Y2hlc1sxXSwgdHJ1ZSApO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHQvLyBNZXRob2QgdG8gY2hhbmdlIHRoZSBzcGVjaWZpZWQgbW9kZWwgYXR0clxuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eXFxzKlxcQChbXj1dKyk9KFtePV0qKVxccyokLykpKSB7XG5cblx0XHR2YXIgYXR0ck5hbWUgPSBtYXRjaGVzWzFdO1xuXHRcdHZhciBuZXdBdHRyVmFsdWUgPSBtYXRjaGVzWzJdO1xuXG5cdFx0Zm4gPSBmdW5jdGlvbiBjaGFuZ2VBdHRyKCkge1xuXHRcdFx0dGhpcy5tb2RlbC5zZXQoYXR0ck5hbWUsIG5ld0F0dHJWYWx1ZSk7XG5cdFx0fTtcblx0fVxuXG5cdC8vIE1ldGhvZCB0byByZW1vdmUgdGhlIG1vZGVsIGZvciB0aGUgY3VycmVudCBjb21wb25lbnRcblx0ZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXlxccypcXC1cXHMqJC8pKSkge1xuXHRcdGZuID0gZnVuY3Rpb24gcmVtb3ZlTW9kZWwgKCkge1xuXG5cdFx0XHQvLyBPbmx5IHdvcmtzIGlmIG1vZGVsIGJlbG9uZ3MgdG8gYSBjb2xsZWN0aW9uXG5cdFx0XHRpZiAoIXRoaXMubW9kZWwuY29sbGVjdGlvbikgcmV0dXJuO1xuXG5cdFx0XHR0aGlzLm1vZGVsLmNvbGxlY3Rpb24ucmVtb3ZlKHRoaXMubW9kZWwpO1xuXHRcdH07XG5cdH1cblxuXG5cdC8vIGRlcHJlY2F0aW5nIGNsYXNzIG1hbmlwdWxhdGlvbiBzaG9ydGhhbmRcblx0Ly8gKG5vIG5lZWQgdG8gZG8gZG9tIG1hbmlwdWxhdGlvbiB1bmxlc3MgYWJzb2x1dGVseSBuZWNlc3NhcnkpXG5cblx0Ly8gLy8gTWV0aG9kIHRvIGFkZCB0aGUgc3BlY2lmaWVkIGNsYXNzXG5cdC8vIGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL15cXCtcXHMqXFwuKC4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHQvLyBcdGZuID0gZnVuY3Rpb24gYWRkQ2xhc3MoKSB7XG5cdC8vIFx0XHRGUkFNRVdPUksudmVyYm9zZSh0aGlzLmlkICsgJyA6OiBBZGRpbmcgY2xhc3MgKCcgKyBtYXRjaGVzWzFdICsgJykuLi4nKTtcblx0Ly8gXHRcdHRoaXMuJGVsLmFkZENsYXNzKG1hdGNoZXNbMV0pO1xuXHQvLyBcdH07XG5cdC8vIH1cblx0Ly8gLy8gTWV0aG9kIHRvIHJlbW92ZSB0aGUgc3BlY2lmaWVkIGNsYXNzXG5cdC8vIGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL15cXC1cXHMqXFwuKC4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHQvLyBcdGZuID0gZnVuY3Rpb24gcmVtb3ZlQ2xhc3MoKSB7XG5cdC8vIFx0XHRGUkFNRVdPUksudmVyYm9zZSh0aGlzLmlkICsgJyA6OiBSZW1vdmluZyBjbGFzcyAoJyArIG1hdGNoZXNbMV0gKyAnKS4uLicpO1xuXHQvLyBcdFx0dGhpcy4kZWwucmVtb3ZlQ2xhc3MobWF0Y2hlc1sxXSk7XG5cdC8vIFx0fTtcblx0Ly8gfVxuXHQvLyAvLyBNZXRob2QgdG8gdG9nZ2xlIHRoZSBzcGVjaWZpZWQgY2xhc3Ncblx0Ly8gZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXlxcIVxccypcXC4oLipbXi5cXHNdKS8pKSAmJiBtYXRjaGVzWzFdKSB7XG5cdC8vIFx0Zm4gPSBmdW5jdGlvbiB0b2dnbGVDbGFzcygpIHtcblx0Ly8gXHRcdEZSQU1FV09SSy52ZXJib3NlKHRoaXMuaWQgKyAnIDo6IFRvZ2dsaW5nIGNsYXNzICgnICsgbWF0Y2hlc1sxXSArICcpLi4uJyk7XG5cdC8vIFx0XHR0aGlzLiRlbC50b2dnbGVDbGFzcyhtYXRjaGVzWzFdKTtcblx0Ly8gXHR9O1xuXHQvLyB9XG5cblx0Ly8gVE9ETzpcdGFsbG93IGRlc2NlbmRhbnRzIHRvIGJlIGNvbnRyb2xsZWQgdmlhIHNob3J0aGFuZFxuXHQvL1x0XHRcdGUuZy4gOiAnbGkucm93IC0uaGlnaGxpZ2h0ZWQnXG5cdC8vXHRcdFx0d291bGQgcmVtb3ZlIHRoZSBgaGlnaGxpZ2h0ZWRgIGNsYXNzIGZyb20gdGhpcy4kKCdsaS5yb3cnKVxuXG5cblx0Ly8gSWYgc2hvcnQtaGFuZCBtYXRjaGVkLCByZXR1cm4gdGhlIGRlcmVmZXJlbmNlZCBmdW5jdGlvblxuXHRpZiAoZm4pIHtcblxuXHRcdEZSQU1FV09SSy52ZXJib3NlKCdJbnRlcnByZXRpbmcgbWVhbmluZyBmcm9tIHNob3J0aGFuZCA6OiBgJyArIHZhbHVlICsgJ2AuLi4nKTtcblxuXHRcdC8vIEN1cnJ5IHRoZSByZXN1bHQgZnVuY3Rpb24gd2l0aCBhbnkgc3VmZml4IG1hdGNoZXNcblx0XHR2YXIgY3VycmllZEZuID0gZm47XG5cblx0XHQvLyBUcmFpbGluZyBgLmAgaW5kaWNhdGVzIGFuIGUuc3RvcFByb3BhZ2F0aW9uKClcblx0XHRpZiAodmFsdWUubWF0Y2goL1xcLlxccyokLykpIHtcblx0XHRcdGN1cnJpZWRGbiA9IGZ1bmN0aW9uIGFuZFN0b3BQcm9wYWdhdGlvbihlKSB7XG5cblx0XHRcdFx0Ly8gQmluZCAoc28gaXQgaW5oZXJpdHMgY29tcG9uZW50IGNvbnRleHQpIGFuZCBjYWxsIGludGVyaW9yIGZ1bmN0aW9uXG5cdFx0XHRcdGZuLmFwcGx5KHRoaXMpO1xuXG5cdFx0XHRcdC8vIHRoZW4gaW1tZWRpYXRlbHkgc3RvcCBldmVudCBidWJibGluZy9wcm9wYWdhdGlvblxuXHRcdFx0XHRpZiAoZSAmJiBlLnN0b3BQcm9wYWdhdGlvbikge1xuXHRcdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0RlJBTUVXT1JLLndhcm4oXG5cdFx0XHRcdFx0XHR0aGlzLmlkICsgJyA6OiBUcmFpbGluZyBgLmAgc2hvcnRoYW5kIHdhcyB1c2VkIHRvIGludm9rZSBhbiAnICtcblx0XHRcdFx0XHRcdCdlLnN0b3BQcm9wYWdhdGlvbigpLCBidXQgXCInICsgdmFsdWUgKyAnXCIgd2FzIG5vdCB0cmlnZ2VyZWQgYnkgYSBET00gZXZlbnQhXFxuJyArXG5cdFx0XHRcdFx0XHQnUHJvYmFibHkgYmVzdCB0byBkb3VibGUtY2hlY2sgdGhpcyB3YXMgd2hhdCB5b3UgbWVhbnQgdG8gZG8uJyk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGN1cnJpZWRGbjtcblx0fVxuXG5cblx0Ly8gT3RoZXJ3aXNlLCBpZiBubyBzaG9ydC1oYW5kIG1hdGNoZWQsIHBhc3MgdGhlIG9yaWdpbmFsIHZhbHVlXG5cdC8vIHN0cmFpZ2h0IHRocm91Z2hcblx0cmV0dXJuIHZhbHVlO1xufTtcbiJdfQ==
(12)
});
;