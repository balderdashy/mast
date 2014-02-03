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

var el2MastID = require('../utils/el2MastID');

module.exports = function collectTemplates() {
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
		var count = FRAMEWORK.options.shortcut.count ? +($el.attr('count')) : 1;

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
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L2JpbmRFdmVudHMuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvY29tcG9uZW50L2Nsb3NlLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2NvbXBvbmVudC9oZWxwZXJzLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2NvbXBvbmVudC9pbmRleC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9jb21wb25lbnQvbGlmZWN5Y2xlRXZlbnRzLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2NvbXBvbmVudC9saWZlY3ljbGVIb29rcy5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9jb21wb25lbnQvcmVuZGVyLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2NvbXBvbmVudC9yZW5kZXJDb2xsZWN0aW9uLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2NvbXBvbmVudC92YWxpZGF0ZURlZmluaXRpb24uanMiLCIvY29kZS9vc3MvbWFzdC9saWIvZGVmaW5lL2J1aWxkRGVmaW5pdGlvbi5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9kZWZpbmUvaW5kZXguanMiLCIvY29kZS9vc3MvbWFzdC9saWIvaW5kZXguanMiLCIvY29kZS9vc3MvbWFzdC9saWIvbG9nZ2VyL2luZGV4LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL2xvZ2dlci9zZXR1cC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9yYWlzZS9idWlsZFByb3RvdHlwZS5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9yYWlzZS9jb2xsZWN0UmVnaW9ucy5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9yYWlzZS9jb2xsZWN0VGVtcGxhdGVzLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3JhaXNlL2luZGV4LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3JlZ2lvbi9hcHBlbmQuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvcmVnaW9uL2F0dGFjaC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9yZWdpb24vZW1wdHkuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvcmVnaW9uL2Zyb21FbGVtZW50LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3JlZ2lvbi9pbmRleC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi9yZWdpb24vaW5zZXJ0LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3JlZ2lvbi9wcmVwZW5kLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3JlZ2lvbi9yZW1vdmUuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvcm91dGVyL2luZGV4LmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3V0aWxzL0RPTS5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi91dGlscy9lbDJNYXN0SUQuanMiLCIvY29kZS9vc3MvbWFzdC9saWIvdXRpbHMvZXZlbnRzLmpzIiwiL2NvZGUvb3NzL21hc3QvbGliL3V0aWxzL29iak1hcC5qcyIsIi9jb2RlL29zcy9tYXN0L2xpYi91dGlscy9zaG9ydGhhbmQuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvWUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNYQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9OQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNYQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llc1xuICovXG52YXIgaGVscGVycyA9IHJlcXVpcmUoJy4vaGVscGVycycpO1xuXG5cbi8qKlxuICogQmluZCBjb2xsZWN0aW9uIGV2ZW50cyB0byBsaWZlY3ljbGUgZXZlbnQgaGFuZGxlcnNcbiAqL1xuZXhwb3J0cy5jb2xsZWN0aW9uRXZlbnRzID0gZnVuY3Rpb24oKSB7XG5cdC8vIEJpbmQgdG8gY29sbGVjdGlvbiBldmVudHMgaWYgb25lIHdhcyBwYXNzZWQgaW5cblx0aWYgKHRoaXMuY29sbGVjdGlvbikge1xuXG5cdFx0Ly8gTGlzdGVuIHRvIGV2ZW50c1xuXHRcdHRoaXMubGlzdGVuVG8odGhpcy5jb2xsZWN0aW9uLCAnYWRkJywgdGhpcy5hZnRlckFkZCk7XG5cdFx0dGhpcy5saXN0ZW5Ubyh0aGlzLmNvbGxlY3Rpb24sICdyZW1vdmUnLCB0aGlzLmFmdGVyUmVtb3ZlKTtcblx0XHR0aGlzLmxpc3RlblRvKHRoaXMuY29sbGVjdGlvbiwgJ3Jlc2V0JywgdGhpcy5hZnRlclJlc2V0KTtcblx0fVxufTtcblxuLyoqXG4gKiBCaW5kIG1vZGVsIGV2ZW50cyB0byBsaWZlY3ljbGUgZXZlbnQgaGFuZGxlcnMgYW5kIGFsc28gYWxsb3dzIGZvciBoYW5kbGVycyB0byBmaXJlXG4gKiBvbiBjZXJ0YWluIG1vZGVsIGF0dHJpYnV0ZSBjaGFuZ2VzLlxuICovXG5leHBvcnRzLm1vZGVsRXZlbnRzID0gZnVuY3Rpb24oKSB7XG5cdHZhciBzZWxmID0gdGhpcztcblxuXHRpZiAodGhpcy5tb2RlbCkge1xuXG5cdFx0Ly8gTGlzdGVuIGZvciBhbnkgYXR0cmlidXRlIGNoYW5nZXNcblx0XHQvLyBlLmcuXG5cdFx0Ly8gLmFmdGVyQ2hhbmdlKG1vZGVsLCBvcHRpb25zKVxuXHRcdC8vXG5cdFx0dGhpcy5saXN0ZW5Ubyh0aGlzLm1vZGVsLCAnY2hhbmdlJywgZnVuY3Rpb24gbW9kZWxDaGFuZ2VkIChtb2RlbCwgb3B0aW9ucykge1xuXG5cdFx0XHQvLyBBcHBseSBkYXRhIGJpbmRpbmdzXG5cdFx0XHRoZWxwZXJzLnJlbmRlckRhdGFCaW5kaW5ncy5jYWxsKHNlbGYpO1xuXG5cdFx0XHQvLyBSdW4gY3VzdG9tIGBhZnRlckNoYW5nZWAoKSBtZXRob2Rcblx0XHRcdGlmIChfLmlzRnVuY3Rpb24odGhpcy5hZnRlckNoYW5nZSkpIHtcblx0XHRcdFx0dGhpcy5hZnRlckNoYW5nZShtb2RlbCwgb3B0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyBMaXN0ZW4gZm9yIHNwZWNpZmljIGF0dHJpYnV0ZSBjaGFuZ2VzXG5cdFx0Ly8gZS5nLlxuXHRcdC8vIC5hZnRlckNoYW5nZS5jb2xvcihtb2RlbCwgdmFsdWUsIG9wdGlvbnMpXG5cdFx0aWYgKF8uaXNPYmplY3QodGhpcy5hZnRlckNoYW5nZSkpIHtcblx0XHRcdF8uZWFjaCh0aGlzLmFmdGVyQ2hhbmdlLCBmdW5jdGlvbiAoaGFuZGxlciwgYXR0ck5hbWUpIHtcblxuXHRcdFx0XHQvLyBDYWxsIGhhbmRsZXIgd2l0aCBuZXdWYWwgdG8ga2VlcCBhcmd1bWVudHMgc3RyYWlnaHRmb3J3YXJkXG5cdFx0XHRcdHRoaXMubGlzdGVuVG8odGhpcy5tb2RlbCwgJ2NoYW5nZTonICsgYXR0ck5hbWUsIGZ1bmN0aW9uIGF0dHJDaGFuZ2VkIChtb2RlbCwgbmV3VmFsKSB7XG5cdFx0XHRcdFx0aGFuZGxlci5jYWxsKHRoaXMsIG5ld1ZhbCk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHR9LCB0aGlzKTtcblx0XHR9XG5cdH1cbn07XG5cbi8qKlxuICogTGlzdGVucyBmb3IgYW5kIHJ1bnMgaGFuZGxlcnMgb24gZ2xvYmFsIGV2ZW50cyB0aGF0IGFyZSBsaXN0ZW5lZCBmb3Igb24gYSBjb21wb25lbnQuXG4gKi9cbmV4cG9ydHMuZ2xvYmFsVHJpZ2dlcnMgPSBmdW5jdGlvbigpIHtcblxuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0dGhpcy5saXN0ZW5UbyhGUkFNRVdPUkssICdhbGwnLCBmdW5jdGlvbiAoZVJvdXRlKSB7XG5cblx0XHQvLyBUcmltIG9mZiBhbGwgYnV0IHRoZSBmaXJzdCBhcmd1bWVudCB0byBwYXNzIHRocm91Z2ggdG8gaGFuZGxlclxuXHRcdHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcblx0XHRhcmdzLnNoaWZ0KCk7XG5cblx0XHQvLyBJdGVyYXRlIHRocm91Z2ggZWFjaCBzdWJzY3JpcHRpb24gb24gdGhpcyBjb21wb25lbnRcblx0XHQvLyBhbmQgbGlzdGVuIGZvciB0aGUgc3BlY2lmaWVkIGdsb2JhbCBldmVudHNcblx0XHRfLmVhY2goc2VsZi5zdWJzY3JpcHRpb25zLCBmdW5jdGlvbihoYW5kbGVyLCBtYXRjaFBhdHRlcm4pIHtcblxuXHRcdFx0Ly8gR3JhYiByZWdleCBhbmQgcGFyYW0gcGFyc2luZyBsb2dpYyBmcm9tIEJhY2tib25lIGNvcmVcblx0XHRcdHZhciBleHRyYWN0UGFyYW1zID0gQmFja2JvbmUuUm91dGVyLnByb3RvdHlwZS5fZXh0cmFjdFBhcmFtZXRlcnMsXG5cdFx0XHRcdGNhbGN1bGF0ZVJlZ2V4ID0gQmFja2JvbmUuUm91dGVyLnByb3RvdHlwZS5fcm91dGVUb1JlZ0V4cDtcblxuXHRcdFx0Ly8gVHJpbSB0cmFpbGluZ1xuXHRcdFx0bWF0Y2hQYXR0ZXJuID0gbWF0Y2hQYXR0ZXJuLnJlcGxhY2UoL1xcLyokL2csICcnKTtcblx0XHRcdC8vIGFuZCBlciBzb3J0IG9mLi4gbGVhZGluZy4uIHNsYXNoZXNcblx0XHRcdG1hdGNoUGF0dGVybiA9IG1hdGNoUGF0dGVybi5yZXBsYWNlKC9eKFsjfiVdKVxcLyovZywgJyQxJyk7XG5cdFx0XHQvLyBUT0RPOiBvcHRpbWl6YXRpb24tIHRoaXMgcmVhbGx5IG9ubHkgaGFzIHRvIGJlIGRvbmUgb25jZSwgb24gcmFpc2UoKSwgd2Ugc2hvdWxkIGRvIHRoYXRcblxuXG5cdFx0XHQvLyBDb21lIHVwIHdpdGggcmVnZXggZm9yIHRoaXMgbWF0Y2hQYXR0ZXJuXG5cdFx0XHR2YXIgcmVnZXggPSBjYWxjdWxhdGVSZWdleChtYXRjaFBhdHRlcm4pO1xuXG5cdFx0XHQvLyBJZiB0aGlzIG1hdGNoUGF0ZXJuIGlzIHRoaXMgaXMgbm90IGEgbWF0Y2ggZm9yIHRoZSBldmVudCxcblx0XHRcdC8vIGBjb250aW51ZWAgaXQgYWxvbmcgdG8gaXQgY2FuIHRyeSB0aGUgbmV4dCBtYXRjaFBhdHRlcm5cblx0XHRcdGlmICghZVJvdXRlLm1hdGNoKHJlZ2V4KSkgcmV0dXJuO1xuXG5cdFx0XHQvLyBQYXJzZSBwYXJhbWV0ZXJzIGZvciB1c2UgYXMgYXJncyB0byB0aGUgaGFuZGxlclxuXHRcdFx0Ly8gKG9yIGFuIGVtcHR5IGxpc3QgaWYgbm9uZSBleGlzdClcblx0XHRcdHZhciBwYXJhbXMgPSBleHRyYWN0UGFyYW1zKHJlZ2V4LCBlUm91dGUpO1xuXG5cdFx0XHQvLyBIYW5kbGUgc3RyaW5nIHJlZGlyZWN0cyB0byBmdW5jdGlvbiBuYW1lc1xuXHRcdFx0aWYgKCFfLmlzRnVuY3Rpb24oaGFuZGxlcikpIHtcblx0XHRcdFx0aGFuZGxlciA9IHNlbGZbaGFuZGxlcl07XG5cblx0XHRcdFx0aWYgKCFoYW5kbGVyKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgdHJpZ2dlciBzdWJzY3JpcHRpb24gYmVjYXVzZSBvZiB1bmtub3duIGhhbmRsZXI6ICcgKyBoYW5kbGVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBCaW5kIGNvbnRleHQgYW5kIGFyZ3VtZW50cyB0byBzdWJzY3JpcHRpb24gaGFuZGxlclxuXHRcdFx0aGFuZGxlci5hcHBseShzZWxmLCBfLnVuaW9uKGFyZ3MsIHBhcmFtcykpO1xuXG5cdFx0fSk7XG5cdH0pO1xufTtcbiIsIi8qKlxuICogU2FmZWx5IHphcCBldmVyeSB0cmFjZSBhYm91dCB0aGlzIGNvbXBvbmVudCBmcm9tIG1lbW9yeS5cbiAqL1xuXG52YXIgaGVscGVycyA9IHJlcXVpcmUoJy4vaGVscGVycycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNsb3NlKCkge1xuXG5cdEZSQU1FV09SSy5kZWJ1ZygnQ2xvc2VkICcgKyB0aGlzLmlkICsgJyBjb21wb25lbnQuJyk7XG5cdHZhciBzZWxmID0gdGhpcztcblxuXHQvLyBDYW5jZWwgY3VycmVudCByZW5kZXIgYW5kIGNsb3NlIGpvYnMsIGlmIHRoZXkncmUgcnVubmluZ1xuXHRpZiAodGhpcy5fcmVuZGVyaW5nKSB7XG5cdFx0c2VsZi5fcmVuZGVyaW5nQ2FuY2VsZWQgPSB0cnVlO1xuXHRcdHRoaXMuY2FuY2VsUmVuZGVyKCk7XG5cdFx0c2VsZi5fcmVuZGVyaW5nID0gZmFsc2U7XG5cdH1cblx0aWYgKHRoaXMuX2Nsb3NpbmcpIHtcblx0XHR0aGlzLmNhbmNlbENsb3NlKCk7XG5cdFx0c2VsZi5fY2xvc2luZyA9IGZhbHNlO1xuXHR9XG5cblx0Ly8gTG9jayBhY2Nlc3MgdG8gY2xvc2UoKVxuXHR0aGlzLl9jbG9zaW5nID0gdHJ1ZTtcblxuXHR0aGlzLmJlZm9yZUNsb3NlKGZ1bmN0aW9uICgpIHtcblxuXHRcdC8vID4gTk9URTogYHRoaXMuX2Nsb3Npbmc9ZmFsc2VgIGNhbiBhbmQgcHJvYmFibHkgc2hvdWxkIGJlIHJlbW92ZWQsXG5cdFx0Ly8gPiBzaW5jZSBtdXRleCBpcyB1bm5lY2Vzc2FyeSBub3cgdGhhdCB0aGUgY29tcG9uZW50IGlzIHVwIGZvciBnYXJiYWdlIGNvbGxlY3Rpb25cblx0XHQvLyA+IFdhaXRpbmcgdG8gZG8gdGhpcyB1bnRpbCBpdCBjYW4gYmUgdGVzdGVkIGZ1cnRoZXJcblxuXHRcdC8vIFVubG9jayBjbG9zZSgpXG5cdFx0c2VsZi5fY2xvc2luZyA9IGZhbHNlO1xuXG5cdFx0Ly8gU3RvcCBsaXN0ZW5pbmcgdG8gYWxsIGdsb2JhbCB0cmlnZ2VycyAoJXwjKVxuXG5cdFx0Ly8gQ2xvc2UgYWxsIGNoaWxkIGNvbXBvbmVudHNcblxuXHRcdGhlbHBlcnMuZW1wdHlBbGxSZWdpb25zLmNhbGwoc2VsZik7XG5cblx0XHQvLyBDYWxsIG5hdGl2ZSBgQmFja2JvbmUuVmlldy5wcm90b3R5cGUucmVtb3ZlKClgXG5cdFx0Ly8gdG8gdW5kZWxlZ2F0ZSBldmVudHMsIGV0Yy5cblx0XHRzZWxmLnJlbW92ZSgpO1xuXG5cdH0pO1xufTtcbiIsIlxudmFyIF9iaW5kaW5ncyA9IHtcblxuXHR0ZXh0OiB7XG5cdFx0cmVnZXhwOiAvYmluZC10ZXh0Lyxcblx0XHRmbjogZnVuY3Rpb24gKCRlbCwgbW9kZWwpIHtcblx0XHRcdHZhciByYXcgPSAkYm91bmRFbC5hdHRyKCdiaW5kLXRleHQnKTtcblx0XHRcdHZhciBjbGVhbiA9IHJhdy5yZXBsYWNlKC9eQC8sICcnKTtcblx0XHRcdCRib3VuZEVsLnRleHQoIG1vZGVsLmdldChjbGVhbikgKTtcblx0XHR9XG5cdH0sXG5cblx0J2NsYXNzJzoge1xuXHRcdHJlZ2V4cDogL2JpbmRcXC1jbGFzc1xcLShbXi1dKykvLFxuXHRcdGZuOiBmdW5jdGlvbiAoJGVsLCBtb2RlbCwgbWF0Y2hlcykge1xuXHRcdFx0Ly8gUmVnZXhwIG1hdGNoZXMgZm9yIHdpbGRjYXJkIHBhcmFtcyBpbiBhdHRyaWJ1dGUgbWF0Y2ggZXhwcmVzc2lvblxuXHRcdFx0dmFyIGNsYXNzTmFtZSA9IG1hdGNoZXNbMV07XG5cblx0XHRcdHZhciByYXcgPSAkYm91bmRFbC5hdHRyKCdiaW5kLWNsYXNzLScgKyBjbGFzc05hbWUpO1xuXHRcdFx0dmFyIGNsZWFuID0gcmF3LnJlcGxhY2UoL15ALywgJycpO1xuXHRcdFx0aWYgKCBtb2RlbC5nZXQoY2xlYW4pICkge1xuXHRcdFx0XHQkYm91bmRFbC5hZGRDbGFzcyhjbGFzc05hbWUpO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdCRib3VuZEVsLnJlbW92ZUNsYXNzKGNsYXNzTmFtZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59O1xuXG5cbi8qKlxuICogSGVscGVyIGZ1bmN0aW9ucyB1c2VkIGJ5IGNvbXBvbmVudHNcbiAqL1xuXG52YXIgaGVscGVycyA9IG1vZHVsZS5leHBvcnRzID0ge1xuXG5cblxuXHQvKipcblx0ICogUmVuZGVyIG1vZGVsIGJpbmRpbmdzLlxuXHQgKiAgICsgYGJpbmQtdGV4dGBcblx0ICogICArIG1vcmUgdG8gY29tZVxuXHQgKlxuXHQgKiBDYWxsZWQgYnkgQ29tcG9uZW50IHdoZW4gaXRzIG1vZGVsIGNoYW5nZXMuXG5cdCAqL1xuXHRyZW5kZXJEYXRhQmluZGluZ3M6IGZ1bmN0aW9uICgpIHtcblx0XHRGUkFNRVdPUksuZGVidWcoJ1JlbmRlcmluZyBkYXRhIGJpbmRpbmdzIGZvciAnLCB0aGlzLmlkLCdjb21wb25lbnQuLi4nKTtcblxuXHRcdC8vIEVuc3VyZSB0aGF0IG1vZGVsIGV4aXN0c1xuXHRcdGlmICghdGhpcy5tb2RlbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFxuXHRcdFx0XHQnVHJ5aW5nIHRvIGJvb3RzdHJhcCBkYXRhIGJpbmRpbmdzIGZvciBjb21wb25lbnQgKCcgKyB0aGlzLmlkICsgJyksICcgK1xuXHRcdFx0XHQnYnV0IGl0IGhhcyBubyBtb2RlbCEnKTtcblx0XHR9XG5cdFx0dmFyIG1vZGVsID0gdGhpcy5tb2RlbDtcblxuXHRcdC8vIGpRdWVyeSBzZWxlY3RvciBmb3IgZ3JhYmJpbmcgYWxsIGVsZW1lbnRzIHcvIGRhdGEgYmluZGluZ3Ncblx0XHR2YXIgYmluZGluZ1NlbGVjdG9yID0gJ1tiaW5kLXRleHRdLCA6bWF0Y2hBdHRyKFwiXmJpbmQtY2xhc3MtKiRcIiknO1xuXG5cdFx0Ly8gR2V0IGVsZW1lbnRzIGluIHRoaXMgY29tcG9uZW50IHdoaWNoIGhhdmUgZGF0YSBiaW5kaW5nc1xuXHRcdC8vIChpZ25vcmVzIGNvbnRlbnRzIG9mIHJlZ2lvbnMgaWYgdGhleSBleGlzdClcblx0XHR2YXIgJGJvdW5kRWxlbWVudHMgPSBfJHNlbGVjdE91dGVyLmNhbGwodGhpcywgYmluZGluZ1NlbGVjdG9yKTtcblxuXHRcdC8vIExvb3AgdGhyb3VnaCBlYWNoIGJvdW5kIGF0dHJpYnV0ZSBvZiBlYWNoIGJvdW5kIGVsZW1lbnRcblx0XHQvLyBhbmQgY2FsbCB0aGUgYXBwcm9wcmlhdGUgcmVuZGVyIG1ldGhvZC5cblx0XHQkYm91bmRFbGVtZW50cy5lYWNoKGZ1bmN0aW9uIGVhY2hCb3VuZEVsZW1lbnQgKCkge1xuXHRcdFx0JGJvdW5kRWwgPSAkKHRoaXMpO1xuXG5cdFx0XHR2YXIgYWxsQXR0cmlidXRlcyA9ICRib3VuZEVsWzBdLmF0dHJpYnV0ZXM7XG5cdFx0XHRfLmVhY2goYWxsQXR0cmlidXRlcywgZnVuY3Rpb24gKGF0dHIpIHtcblx0XHRcdFx0dmFyIGF0dHJOYW1lID0gYXR0ci5ub2RlTmFtZTtcblxuXHRcdFx0XHRfLmVhY2goX2JpbmRpbmdzLCBmdW5jdGlvbiBlYWNoQmluZGluZ0Zvcm11bGEgKCBiaW5kaW5nICkge1xuXHRcdFx0XHRcdHZhciBtYXRjaGVzID0gYXR0ck5hbWUubWF0Y2goYmluZGluZy5yZWdleHApO1xuXHRcdFx0XHRcdGlmICggbWF0Y2hlcyApIHtcblx0XHRcdFx0XHRcdGJpbmRpbmcuZm4oJGJvdW5kRWwsIG1vZGVsLCBtYXRjaGVzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0sXG5cblxuXG5cdC8qKlxuXHQgKiBJZiBhbnkgcmVnaW9ucyBleGlzdCBpbiB0aGlzIGNvbXBvbmVudCxcblx0ICogZW1wdHkgdGhlbSwgYW5kIHRoZW4gZGVsZXRlIHRoZW1cblx0ICovXG5cdGVtcHR5QWxsUmVnaW9uczogZnVuY3Rpb24oKSB7XG5cdFx0Xy5lYWNoKHRoaXMucmVnaW9ucywgZnVuY3Rpb24gKHJlZ2lvbiwga2V5KSB7XG5cdFx0XHRyZWdpb24uZW1wdHkoKTtcblx0XHRcdGRlbGV0ZSB0aGlzLnJlZ2lvbnNba2V5XTtcblx0XHR9LCB0aGlzKTtcblx0fSxcblxuXHQvKipcblx0ICogSW5zdGFudGlhdGUgcmVnaW9uIGNvbXBvbmVudHMgYW5kIGFwcGVuZCBhbnkgZGVmYXVsdFxuXHQgKiB0ZW1wbGF0ZXMvY29tcG9uZW50cyB0byB0aGUgRE9NXG5cdCAqL1xuXHRyZW5kZXJSZWdpb25zOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0XHRoZWxwZXJzLmVtcHR5QWxsUmVnaW9ucygpO1xuXG5cdFx0Ly8gRGV0ZWN0IGNoaWxkIHJlZ2lvbnMgaW4gdGVtcGxhdGVcblx0XHR2YXIgJHJlZ2lvbnMgPSB0aGlzLiQoJ3JlZ2lvbiwgW2RhdGEtcmVnaW9uXScpO1xuXHRcdCRyZWdpb25zLmVhY2goZnVuY3Rpb24gKGksIGVsKSB7XG5cblx0XHRcdC8vIFByb3ZpZGUgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkgZm9yXG5cdFx0XHQvLyBgZGVmYXVsdGAsIGBjb250ZW50c2AgYW5kIGB0ZW1wbGF0ZWAgbm90YXRpb25cblx0XHRcdC8vIE5vcm1hbGl6ZXMgbm90YXRpb24gdG8gYGNvbnRlbnRzYCBhdHRyaWJ1dGUuXG5cdFx0XHR2YXIgY29tcG9uZW50SWQgPSAkKGVsKS5hdHRyKCdkZWZhdWx0Jyk7XG5cdFx0XHRjb21wb25lbnRJZCA9IGNvbXBvbmVudElkIHx8ICQoZWwpLmF0dHIoJ2NvbnRlbnRzJyk7XG5cdFx0XHRjb21wb25lbnRJZCA9IGNvbXBvbmVudElkIHx8ICQoZWwpLmF0dHIoJ3RlbXBsYXRlJyk7XG5cdFx0XHQkKGVsKS5hdHRyKCdjb250ZW50cycsIGNvbXBvbmVudElkKTtcblxuXHRcdFx0Ly8gR2VuZXJhdGUgYSByZWdpb24gaW5zdGFuY2UgZnJvbSB0aGUgZWxlbWVudFxuXHRcdFx0Ly8gKG1vZGlmeWluZyB0aGUgRE9NIGFzIG5lY2Vzc2FyeSlcblx0XHRcdHZhciByZWdpb24gPSBGUkFNRVdPUksuUmVnaW9uLmZyb21FbGVtZW50KGVsLCBzZWxmKTtcblxuXHRcdFx0Ly8gSWYgcmVnaW9uIGhhcyBubyBpZCwgZ2VuZXJhdGUgYSB1bmlxdWUgcmVnaW9uIGlkIHcvaSB0aGlzIGNvbXBvbmVudFxuXHRcdFx0Ly8gdGhhdCBpcyB1bmxpa2VseSB0byBjb2xsaWRlIHdpdGggbXkgb3RoZXIgbmFtZWQgcmVnaW9uc1xuXHRcdFx0aWYgKCFyZWdpb24uaWQpIHtcblx0XHRcdFx0cmVnaW9uLmlkID0gJycrXG5cdFx0XHRcdFx0RlJBTUVXT1JLLm9wdGlvbnMuZnJhbWV3b3JrSWQgK1xuXHRcdFx0XHRcdCdfX2Fub255bW91c19yZWdpb25fXycgK1xuXHRcdFx0XHRcdHNlbGYuYW5vbnltb3VzUmVnaW9uQ291bnRlcjtcblxuXHRcdFx0XHQvLyBJbmNyZW1lbnQgY291bnRlciBmb3IgbmV4dCB0aW1lXG5cdFx0XHRcdHNlbGYuYW5vbnltb3VzUmVnaW9uQ291bnRlcisrO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBLZWVwIHRyYWNrIG9mIHJlZ2lvbnMsIHNpbmNlIHdlIGFyZSB0aGUgcGFyZW50IGNvbXBvbmVudFxuXHRcdFx0c2VsZi5yZWdpb25zW3JlZ2lvbi5pZF0gPSByZWdpb247XG5cblx0XHRcdC8vIEFzIGxvbmcgYXMgdGhlcmUgYXJlIG5vIGNvbGxpc2lvbnMsXG5cdFx0XHQvLyBwcm92aWRlIGEgZnJpZW5kbHkgcmVmZXJlbmNlIHRvIHRoZSByZWdpb24gb24gdGhlIHRvcCBsZXZlbCBvZiB0aGUgY29sbGVjdGlvblxuXHRcdFx0aWYgKCFzZWxmW3JlZ2lvbi5pZF0pIHtcblx0XHRcdFx0c2VsZltyZWdpb24uaWRdID0gcmVnaW9uO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0IHRlbXBsYXRlIEhUTUwgYW5kIGRhdGEgaW50byBhIGNvbXBpbGVkICR0ZW1wbGF0ZVxuXHQgKi9cblx0Y29tcGlsZVRlbXBsYXRlOiBmdW5jdGlvbigpIHtcblxuXHRcdC8vIENyZWF0ZSB0ZW1wbGF0ZSBkYXRhIGNvbnRleHQgYnkgcHJvdmlkaW5nIGFjY2VzcyB0byB0aGUgZ2xvYmFsIERhdGEgb2JqZWN0LFxuXHRcdC8vIEFsc28gZm9sZCBpbiB0aGUgbW9kZWwgYXNzb2NpYXRlZCB3aXRoIHRoaXMgY29tcG9uZW50LCBpZiB0aGVyZSBpcyBvbmVcblx0XHR2YXIgdGVtcGxhdGVDb250ZXh0ID0gXy5leHRlbmQoe1xuXG5cdFx0XHQvLyBBbGxvd3MgeW91IHRvIGdldCBhIGhvbGQgb2YgZGF0YSxcblx0XHRcdC8vIGJ1dCB1c2UgYSBkZWZhdWx0IHZhbHVlIGlmIGl0IGRvZXNuJ3QgZXhpc3Rcblx0XHRcdGdldDogZnVuY3Rpb24gKGtleSwgZGVmYXVsdFZhbCkge1xuXHRcdFx0XHR2YXIgdmFsID0gdGVtcGxhdGVDb250ZXh0W2tleV07XG5cdFx0XHRcdGlmICh0eXBlb2YgdmFsID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRcdHZhbCA9IGRlZmF1bHRWYWw7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHZhbDtcblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0Ly8gQWxsIEZSQU1FV09SSy5kYXRhIGlzIGF2YWlsYWJsZSBpbiBldmVyeSB0ZW1wbGF0ZVxuXHRcdEZSQU1FV09SSy5kYXRhKTtcblxuXHRcdC8vIElmIGEgbW9kZWwgaXMgcHJvdmlkZWQgZm9yIHRoaXMgY29tcG9uZW50LCBtYWtlIGl0IGF2YWlsYWJsZSBpbiB0aGlzIHRlbXBsYXRlXG5cdFx0aWYgKHRoaXMubW9kZWwpIHtcblx0XHRcdF8uZXh0ZW5kKHRlbXBsYXRlQ29udGV4dCwgdGhpcy5tb2RlbC5hdHRyaWJ1dGVzKTtcblx0XHR9XG5cblx0XHQvLyBUZW1wbGF0ZSB0aGUgSFRNTCB3aXRoIHRoZSBkYXRhXG5cdFx0dmFyIGh0bWw7XG5cdFx0dHJ5IHtcblx0XHRcdC8vIEFjY2VwdCBwcmVjb21waWxlZCB0ZW1wbGF0ZXNcblx0XHRcdGlmIChfLmlzRnVuY3Rpb24odGhpcy50ZW1wbGF0ZSkpIHtcblx0XHRcdFx0aHRtbCA9IHRoaXMudGVtcGxhdGUodGVtcGxhdGVDb250ZXh0KTtcblx0XHRcdH1cblx0XHRcdC8vIE9yIHJhdyBzdHJpbmdzXG5cdFx0XHRlbHNlIGh0bWwgPSBfLnRlbXBsYXRlKHRoaXMudGVtcGxhdGUsIHRlbXBsYXRlQ29udGV4dCk7XG5cdFx0fVxuXHRcdGNhdGNoIChlKSB7XG5cdFx0XHR2YXIgc3RyID0gZSxcblx0XHRcdFx0c3RhY2sgPSAnJztcblxuXHRcdFx0aWYgKGUgaW5zdGFuY2VvZiBFcnJvcikge1xuXHRcdFx0XHRzdHIgPSAgZS50b1N0cmluZygpO1xuXHRcdFx0XHRzdGFjayA9IGUuc3RhY2s7XG5cdFx0XHR9XG5cblx0XHRcdEZSQU1FV09SSy5lcnJvcih0aGlzLmlkICsgJyA6OiBDYW5ub3QgcmVuZGVyKCkgdGVtcGxhdGUgKHByb2JhYmx5IG1pc3NpbmcgZGF0YSkuXFxuXFxuR290IHRoaXMgZXJyb3IgOjpcXG4nK3N0ciwnXFxuJyk7XG5cdFx0XHRpZiAoaHRtbCkge0ZSQU1FV09SSy52ZXJib3NlKCdUZW1wbGF0ZSA6OiAnICsgaHRtbCk7fVxuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UoJ0Z1bGwgVGVtcGxhdGUgRXJyb3I6JyArICdcXG4nLHN0YWNrKTtcblx0XHRcdEZSQU1FV09SSy52ZXJib3NlKCdcXG5cXG5Nb3JlIGluZm9ybWF0aW9uOicsICdcXG5cXG5UZW1wbGF0ZSBjb250ZXh0IDo6Jyx0ZW1wbGF0ZUNvbnRleHQsICdcXG5cXG50aGlzLm1vZGVsOjonLCB0aGlzLm1vZGVsKTtcblx0XHRcdGh0bWwgPSBfLmlzU3RyaW5nKHRoaXMudGVtcGxhdGUpID8gdGhpcy50ZW1wbGF0ZSA6IHN0cjtcblx0XHR9XG5cblx0XHRyZXR1cm4gaHRtbDtcblx0fVxuXG59O1xuXG5cblxuXG4vLyBQcml2YXRlIGludHJhLWhlbHBlciBtZXRob2RzXG5cblxuXG4vKipcbiAqIExvb2t1cCBzdWl0YWJsZSBlbGVtZW50cyB3aXRoaW4gdGhpcyBjb21wb25lbnQncyAkZWwgY29udGV4dC5cbiAqIElnbm9yZSByZWdpb25zLCBhbmQgaW5jbHVkZSB0aGUgdG9wLWxldmVsIGVsZW1lbnQuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGJpbmRpbmdTZWxlY3RvciAtIERPTSBzZWxlY3RvciB0byB1c2VcbiAqL1xudmFyIF8kc2VsZWN0T3V0ZXIgPSBmdW5jdGlvbiAoIGJpbmRpbmdTZWxlY3RvciApIHtcblxuXHQvLyBMb29rdXAgbWF0Y2hlc1xuXHR2YXIgJG1hdGNoZXMgPSB0aGlzLiQoYmluZGluZ1NlbGVjdG9yKTtcblxuXHQvLyBJZiB0b3AtbGV2ZWwgZWxlbWVudCBpbiB0ZW1wbGF0ZSBoYXMgYSBkYXRhLWJpbmRpbmcsIGluY2x1ZGUgaXRcblx0aWYgKHRoaXMuJGVsLmZpbHRlcihiaW5kaW5nU2VsZWN0b3IpKSB7XG5cdFx0JG1hdGNoZXMgPSAkLm1lcmdlKCRtYXRjaGVzLCB0aGlzLiRlbCk7XG5cdH1cblxuXHQvLyBPbWl0IGFueXRoaW5nIGluc2lkZSBhIHJlZ2lvbiwgc2luY2UgdGhvc2UgYmluZGluZ3Mgd2lsbCBoYXZlIGFscmVhZHlcblx0Ly8gYmVlbiB0YWtlbiBjYXJlIG9mIGJ5IG9uZSBvZiB0aGUgZGVzY2VuZGFudCBjb21wb25lbnQocykgd2l0aGluIHRoZSByZWdpb24uXG5cdC8vXG5cdC8vIFRPRE86IG9wdGltaXplIHRvIGV4Y2x1ZGUgdGhlc2UgZWxlbWVudHMgZnJvbSB0aGUgb3JpZ2luYWwgRE9NIHNlbGVjdGlvblxuXHQkbWF0Y2hlcyA9ICRtYXRjaGVzLm5vdCggdGhpcy4kKCdyZWdpb24gKiwgW2RhdGEtcmVnaW9uXSAqJykgKTtcblxuXHRyZXR1cm4gJG1hdGNoZXM7XG59O1xuXG5cblxuLy8gUmVnZXhwcyBmb3IgZGV0ZWN0aW9uIG9mIHdpbGRjYXJkIG5hbWVkIHBhcmFtZXRlcnMgaW4gY3VzdG9tIGVsZW1lbnQgYXR0cmlidXRlIG5hbWVzLlxudmFyIG9wdGlvbmFsUGFyYW0gPSAvXFwoKC4qPylcXCkvZztcbnZhciBuYW1lZFBhcmFtID0gLyhcXChcXD8pPzpcXHcrL2c7XG52YXIgc3BsYXRQYXJhbSA9IC9cXCpcXHcrL2c7XG52YXIgZXNjYXBlUmVnRXhwID0gL1tcXC17fVxcW1xcXSs/LixcXFxcXFxeJHwjXFxzXS9nO1xuXG5cbi8vIEJ1aWxkIHNlbGVjdG9yIGZvciBzdXBlcnNldCBvZiB0aGVzZSBiaW5kaW5nc1xudmFyIF9hdHRyTmFtZVRvUmVnRXhwID0gZnVuY3Rpb24oIGF0dHJFeHByZXNzaW9uICkge1xuXG5cdGF0dHJFeHByZXNzaW9uID0gYXR0ckV4cHJlc3Npb24ucmVwbGFjZShlc2NhcGVSZWdFeHAsICdcXFxcJCYnKVxuXHRcdC5yZXBsYWNlKG9wdGlvbmFsUGFyYW0sICcoPzokMSk/Jylcblx0XHQucmVwbGFjZShuYW1lZFBhcmFtLCBmdW5jdGlvbihtYXRjaCwgb3B0aW9uYWwpIHtcblx0XHRcdHJldHVybiBvcHRpb25hbCA/IG1hdGNoIDogJyhbXlxcL10rKSc7XG5cdFx0fSlcblx0XHQucmVwbGFjZShzcGxhdFBhcmFtLCAnKC4qPyknKTtcblx0cmV0dXJuICdeJyArIGF0dHJFeHByZXNzaW9uICsgJyQnO1xufTtcbnZhciBfZXh0cmFjdFBhcmFtZXRlcnMgPSBmdW5jdGlvbihyZWdleHAsIGF0dHJOYW1lLCBhdHRyRXhwcmVzc2lvbikge1xuXHR2YXIgcGFyYW1WYWx1ZXMgPSByZWdleHAuZXhlYyhhdHRyTmFtZSkuc2xpY2UoMSk7XG5cdHZhciBwYXJhbUtleXMgPSBuYW1lZFBhcmFtLmV4ZWMoYXR0ckV4cHJlc3Npb24pO1xuXG5cdGlmICghcGFyYW1LZXlzIHx8ICFwYXJhbVZhbHVlcykgcmV0dXJuIHt9O1xuXG5cdHZhciBuYW1lZFBhcmFtZXRlcnMgPSB7fTtcblx0Y29uc29sZS5sb2coJ3BhcmFtVmFsdWVzOicscGFyYW1WYWx1ZXMpO1xuXHRfLmVhY2gocGFyYW1WYWx1ZXMsIGZ1bmN0aW9uIGVhY2hNYXRjaGluZ1BpZWNlKCBwYXJhbSwgaSApIHtcblx0XHR2YXIga2V5ID0gcGFyYW1LZXlzW2ldO1xuXHRcdGtleSA9IGtleS5zbGljZSgxKTsgLy8gcmVtb3ZlIGA6YCBmcm9tIG5hbWVkIHBhcmFtXG5cdFx0bmFtZWRQYXJhbWV0ZXJzW2tleV0gPSBwYXJhbVZhbHVlc1tpXTtcblx0fSk7XG5cdHJldHVybiBuYW1lZFBhcmFtZXRlcnM7XG59O1xuXG5cblxuLyoqXG4gKiBSZW5kZXIgYSBzaW5nbGUgYmluZGluZ1xuICovXG52YXIgX3JlbmRlckJpbmRpbmcgPSBmdW5jdGlvbiAoJG1hdGNoZWRFbCwgZG9tQXR0cmlidXRlTmFtZSwgbW9kZWwsIHJlbmRlckZuLCBuYW1lZFBhcmFtcykge1xuXHR2YXIgcmF3QmluZGluZyA9ICRtYXRjaGVkRWwuYXR0ciggZG9tQXR0cmlidXRlTmFtZSApO1xuXHQvLyBJZiBlbGVtZW50IGRvZXNuJ3QgY29udGFpbiB0aGUgc3BlY2lmaWVkIERPTSBhdHRyaWJ1dGUuLi5cblx0Ly8gZmFpbCBzaWxlbnRseS5cblx0aWYgKCAhcmF3QmluZGluZyApIHJldHVybjtcblxuXHQvLyBjb25zb2xlLmxvZygnZ2V0dGluZyAnLGRvbUF0dHJpYnV0ZU5hbWUsJ29uJywkbWF0Y2hlZEVsKTtcblx0dmFyIG1vZGVsQXR0cmlidXRlTmFtZSA9IHJhd0JpbmRpbmcucmVwbGFjZSgvXlxcQC8sICcnKTtcblx0RlJBTUVXT1JLLmRlYnVnKCdGb3VuZCBhIGJpbmRpbmcgOjonLCByYXdCaW5kaW5nLCAnOjonLCBuYW1lZFBhcmFtcyk7XG5cblx0Ly8gSWYgbW9kZWwgZG9lc24ndCBjb250YWluIHRoZSBzcGVjaWZpZWQgYXR0cmlidXRlLi4uXG5cdGlmICggdHlwZW9mIG1vZGVsLmF0dHJpYnV0ZXNbbW9kZWxBdHRyaWJ1dGVOYW1lXSA9PT0gJ3VuZGVmaW5lZCcgKSB7XG5cblx0XHQvLyBmYWlsIHNpbGVudGx5LlxuXHRcdHJldHVybjtcblx0XHQvLyBGUkFNRVdPUksud2FybignQ2Fubm90IGJpbmQgYEAnK21vZGVsQXR0cmlidXRlTmFtZSsnIGZvciB0ZW1wbGF0ZS9jb21wb25lbnQgJyArXG5cdFx0Ly8gXHQnYCcgKyBjb21wb25lbnQuaWQgKydgLlxcbicrXG5cdFx0Ly8gXHQnTm8gc3VjaCBhdHRyaWJ1dGUgZXhpc3RzIGluIHRoZSBjb21wb25lbnRcXCdzIG1vZGVsLidcblx0XHQvLyApO1xuXHR9XG5cblx0Ly8gUmVuZGVyIGEgZGF0YSBiaW5kaW5nXG5cdHZhciBiaW5kaW5nVmFsID0gbW9kZWwuZ2V0KG1vZGVsQXR0cmlidXRlTmFtZSkgfHwgJyc7XG5cdHJlbmRlckZuKCAkbWF0Y2hlZEVsLCBiaW5kaW5nVmFsLCBuYW1lZFBhcmFtcyApO1xufTtcblxuXG4vKipcbiAqIFJlbmRlciB0aGUgc3BlY2lmaWVkIHR5cGUgb2YgZGF0YSBiaW5kaW5nc1xuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gKlx0XHRAb3B0aW9uIHtGdW5jdGlvbn0gcmVuZGVyRm4gKCRlbCwgdmFsLCBwYXJhbXMpXHQtPiBmdW5jdGlvbiB3aGljaCByZW5kZXJzIHRoZSBkYXRhIGJpbmRpbmcgZm9yIHRoZSBzcGVjaWZpZWQgZWxlbWVudFxuICpcdFx0XHRAcGFyYW0ge0pRdWVyeUVsZW1lbnR9ICRlbFxuICpcdFx0XHRAcGFyYW0gez99IHZhbCAtPiB2YWx1ZSBvZiBib3VuZCBtb2RlbCBhdHRyaWJ1dGVcbiAqXHRcdFx0QHBhcmFtIHtPYmplY3R9IHBhcmFtcyAtPiBrZXllZCBvYmplY3Qgb2YgZHluYW1pYyBwYXJhbWV0ZXJzIGZyb20gdGhlIG5hbWUgb2YgdGhlIGF0dHJpYnV0ZSBpdHNlbGZcbiAqXHRcdEBvcHRpb24ge1N0cmluZ30gYXR0cmlidXRlIC0+IG5hbWUgb2YgYm91bmQgYXR0cmlidXRlLCBlLmcuICdiaW5kLXRleHQnXG4gKlx0XHRAb3B0aW9uIHtDb21wb25lbnR9IGNvbXBvbmVudFxuICpcdFx0QG9wdGlvbiB7QmFja2JvbmUuTW9kZWx9IFttb2RlbF0gLSBkZWZhdWx0cyB0byBgY29tcG9uZW50Lm1vZGVsYFxuICovXG52YXIgX3JlbmRlckJpbmRpbmdzID0gZnVuY3Rpb24gKCBvcHRpb25zICkge1xuXHR2YXIgY29tcG9uZW50ID0gb3B0aW9ucy5jb21wb25lbnQ7XG5cdHZhciBhdHRyaWJ1dGVFeHByZXNzaW9uID0gb3B0aW9ucy5hdHRyaWJ1dGU7XG5cdHZhciBtb2RlbCA9IG9wdGlvbnMubW9kZWwgfHwgb3B0aW9ucy5jb21wb25lbnQubW9kZWw7XG5cblxuXHQvLyBDYWxjdWxhdGUgc3RyaW5nIHdoaWNoIGNhbiBiZSBcIm5ldy1lZFwiIGludG8gYSBSZWdFeHBcblx0dmFyIGF0dHJSZWdFeHBTdHIgPSBfYXR0ck5hbWVUb1JlZ0V4cChhdHRyaWJ1dGVFeHByZXNzaW9uKTtcblx0dmFyIGF0dHJSZWdFeHAgPSBuZXcgUmVnRXhwKGF0dHJSZWdFeHBTdHIpO1xuXG5cblx0dmFyIGJvdW5kQXR0clNlbGVjdG9yID0gJzptYXRjaEF0dHIoXCInICsgYXR0clJlZ0V4cFN0ciArICdcIiknO1xuXG5cdC8vIEZpbmQgYWxsIHJlbGV2YW50IGRlc2NlbmRhbnQgZWxlbWVudHNcblx0dmFyICRtYXRjaGVzID0gX2dldCRNYXRjaGVzKGJvdW5kQXR0clNlbGVjdG9yLCBjb21wb25lbnQpO1xuXG5cdC8vIEVhcmx5IGV4aXQgZm9yIHNpbXBsZSBiaW5kaW5ncyAody9vIGJvdW5kIHBhcmFtcylcblx0aWYgKCAhYXR0cmlidXRlRXhwcmVzc2lvbi5tYXRjaCgvXFw6LykpIHtcblx0XHQkbWF0Y2hlcy5lYWNoKGZ1bmN0aW9uICgpIHtcblx0XHRcdF9yZW5kZXJCaW5kaW5nKCQodGhpcyksIGF0dHJpYnV0ZUV4cHJlc3Npb24sIG1vZGVsLCBvcHRpb25zLnJlbmRlckZuLCB7fSk7XG5cblx0XHR9KTtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRjb25zb2xlLmxvZygnXFxuUmVuZGVyaW5nIHBhcmFtZXRlcml6ZWQgZGF0YSBiaW5kaW5nOiAnLGF0dHJSZWdFeHApO1xuXG5cdC8vIFRPRE86IGJhdGNoIGl0IHVwIHNvIHdlIG9ubHkgZG8gb25lIERPTSBxdWVyeVxuXHQkbWF0Y2hlcy5lYWNoKGZ1bmN0aW9uIGVhY2hFbGVtZW50V2l0aEFCaW5kaW5nICgpIHtcblx0XHR2YXIgJG1hdGNoZWRFbCA9ICQodGhpcyk7XG5cblx0XHQvLyBHZXQgYWxsIGF0dHJpYnV0ZXMgZm9yIHRoaXMgJGVsIGFuZCBmaWx0ZXIgYSBzZXQgb2YgbWF0Y2hpbmcgbmFtZXMvcGFyYW1zXG5cdFx0dmFyIGFsbERPTUF0dHJOYW1lcyA9IF8ubWFwKCAkbWF0Y2hlZEVsWzBdLmF0dHJpYnV0ZXMsIGZ1bmN0aW9uIChlbCkge1xuXHRcdFx0cmV0dXJuIGVsLm5vZGVOYW1lO1xuXHRcdH0pO1xuXHRcdGNvbnNvbGUubG9nKCdhbGxET01BdHRyTmFtZXMgZm9yIGVsJyxhbGxET01BdHRyTmFtZXMsICRtYXRjaGVkRWwpO1xuXHRcdHZhciBtYXRjaGluZ0RPTUF0dHJzID0ge307XG5cdFx0Xy5lYWNoKCBhbGxET01BdHRyTmFtZXMsIGZ1bmN0aW9uIGVhY2hBdHRyaWJ1dGUgKCBkb21BdHRyTmFtZSApIHtcblx0XHRcdC8vIGNvbnNvbGUubG9nKCdjaGVja2luZycsZG9tQXR0ck5hbWUpO1xuXHRcdFx0aWYgKCBkb21BdHRyTmFtZS5tYXRjaChhdHRyUmVnRXhwKSkge1xuXHRcdFx0XHRtYXRjaGluZ0RPTUF0dHJzW2RvbUF0dHJOYW1lXSA9IF9leHRyYWN0UGFyYW1ldGVycyggYXR0clJlZ0V4cCwgZG9tQXR0ck5hbWUsIGF0dHJpYnV0ZUV4cHJlc3Npb24gKTtcblx0XHRcdFx0Ly8gY29uc29sZS5sb2coJywgZ290JyxtYXRjaGluZ0RPTUF0dHJzW2RvbUF0dHJOYW1lXSwgJyAoKCgnLGRvbUF0dHJOYW1lLCBhdHRyaWJ1dGVFeHByZXNzaW9uKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXG5cdFx0Y29uc29sZS5sb2coJyAqKioqIG1hdGNoaW5nRE9NQXR0cnMgOjonLCBtYXRjaGluZ0RPTUF0dHJzKTtcblxuXHRcdHRocm93IG5ldyBFcnJvcignaHdhYWEnKTtcblx0XHRfLmVhY2gobWF0Y2hpbmdET01BdHRycywgZnVuY3Rpb24gKCBuYW1lZFBhcmFtcywgZG9tQXR0cmlidXRlTmFtZSApIHtcblx0XHRcdF9yZW5kZXJCaW5kaW5nKCRtYXRjaGVkRWwsIGRvbUF0dHJpYnV0ZU5hbWUsIG1vZGVsLCBvcHRpb25zLnJlbmRlckZuLCBuYW1lZFBhcmFtcyk7XG5cdFx0fSk7XG5cblx0fSk7XG59O1xuXG5cblxuXG5cblxuLyoqXG4gKiBDcmVhdGUgcHNldWRvLXNlbGVjdG9yIGZvciBnZXR0aW5nIHdpbGRjYXJkIGRhdGEgYXR0cmlidXRlcy5cbiAqXG4gKiBVc2FnZTpcbiAqICQoXCI6bWF0Y2hBdHRyKCdeZGF0YS0nKVwiKVxuICpcbiAqIFNvdXJjZTpcbiAqIGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9hLzEzMjIyNTA5LzQ4NjU0N1xuICovXG5qUXVlcnkuZXhwci5wc2V1ZG9zLm1hdGNoQXR0ciA9ICQuZXhwci5jcmVhdGVQc2V1ZG8oZnVuY3Rpb24oYXJnKSB7XG5cbiAgICB2YXIgcmVnZXhwID0gbmV3IFJlZ0V4cChhcmcpO1xuICAgIHJldHVybiBmdW5jdGlvbihlbGVtKSB7XG4gICAgICAgIGZvcih2YXIgaSA9IDA7IGkgPCBlbGVtLmF0dHJpYnV0ZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBhdHRyID0gZWxlbS5hdHRyaWJ1dGVzW2ldO1xuICAgICAgICAgICAgaWYocmVnZXhwLnRlc3QoYXR0ci5uYW1lKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9O1xufSk7XG5cbiIsIi8qKlxuICogQ29tcG9uZW50IGlzIGFuIGV4dGVuZGVkIGBCYWNrYm9uZS5WaWV3YC4gSXQgYWRkIGZlYXR1cmVzIHN1Y2ggYXMgYXV0b21hdGljIGV2ZW50IGJpbmRpbmcsXG4gKiByZW5kZXJpbmcsIGxpZmVjeWNsZSBob29rcyBhbmQgZXZlbnRzLCBhbmQgbW9yZS5cbiAqL1xuXG52YXIgbGlmZWN5Y2xlSG9va3MgICAgID0gcmVxdWlyZSgnLi9saWZlY3ljbGVIb29rcycpLFxuXHRsaWZlY3ljbGVFdmVudHMgICAgPSByZXF1aXJlKCcuL2xpZmVjeWNsZUV2ZW50cycpLFxuXHRiaW5kRXZlbnRzICAgICAgICAgPSByZXF1aXJlKCcuL2JpbmRFdmVudHMnKSxcblx0Y2xvc2UgICAgICAgICAgICAgID0gcmVxdWlyZSgnLi9jbG9zZScpLFxuXHRyZW5kZXIgICAgICAgICAgICAgPSByZXF1aXJlKCcuL3JlbmRlcicpLFxuXHRyZW5kZXJDb2xsZWN0aW9uICAgPSByZXF1aXJlKCcuL3JlbmRlckNvbGxlY3Rpb24nKSxcblx0dmFsaWRhdGVEZWZpbml0aW9uID0gcmVxdWlyZSgnLi92YWxpZGF0ZURlZmluaXRpb24nKTtcblxuQ29tcG9uZW50ID0gbW9kdWxlLmV4cG9ydHMgPSBCYWNrYm9uZS5WaWV3LmV4dGVuZCgpO1xuXG5cbl8uZXh0ZW5kKENvbXBvbmVudC5wcm90b3R5cGUsIHtcblxuXHQvLyBMaWZlY3ljbGUgSG9va3Ncblx0YmVmb3JlUmVuZGVyOiBmdW5jdGlvbihjYikge1xuXHRcdGxpZmVjeWNsZUhvb2tzLmJlZm9yZVJlbmRlci5jYWxsKHRoaXMsIGNiKTtcblx0fSxcblx0YmVmb3JlQ2xvc2U6IGZ1bmN0aW9uKGNiKSB7XG5cdFx0bGlmZWN5Y2xlSG9va3MuYmVmb3JlQ2xvc2UuY2FsbCh0aGlzLCBjYik7XG5cdH0sXG5cdGFmdGVyUmVuZGVyOiBmdW5jdGlvbigpIHtcblx0XHRsaWZlY3ljbGVIb29rcy5hZnRlclJlbmRlci5jYWxsKHRoaXMpO1xuXHR9LFxuXHRjYW5jZWxSZW5kZXI6IGZ1bmN0aW9uKCkge1xuXHRcdGxpZmVjeWNsZUhvb2tzLmNhbmNlbFJlbmRlci5jYWxsKHRoaXMpO1xuXHR9LFxuXHRjYW5jZWxDbG9zZTogZnVuY3Rpb24oKSB7XG5cdFx0bGlmZWN5Y2xlSG9va3MuY2FuY2VsQ2xvc2UuY2FsbCh0aGlzKTtcblx0fSxcblxuXHQvLyBMaWZlY3ljbGUgRXZlbnRzXG5cdGFmdGVyQ2hhbmdlOiBmdW5jdGlvbihtb2RlbCwgb3B0aW9ucykge1xuXHRcdGxpZmVjeWNsZUV2ZW50cy5hZnRlckNoYW5nZS5jYWxsKHRoaXMsIG1vZGVsLCBvcHRpb25zKTtcblx0fSxcblx0YWZ0ZXJBZGQ6IGZ1bmN0aW9uKG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zKSB7XG5cdFx0bGlmZWN5Y2xlRXZlbnRzLmFmdGVyQWRkLmNhbGwodGhpcywgbW9kZWwsIGNvbGxlY3Rpb24sIG9wdGlvbnMpO1xuXHR9LFxuXHRhZnRlclJlbW92ZTogZnVuY3Rpb24obW9kZWwsIGNvbGxlY3Rpb24sIG9wdGlvbnMpIHtcblx0XHRsaWZlY3ljbGVFdmVudHMuYWZ0ZXJSZW1vdmUuY2FsbCh0aGlzLCBtb2RlbCwgY29sbGVjdGlvbiwgb3B0aW9ucyk7XG5cdH0sXG5cdGFmdGVyUmVzZXQ6IGZ1bmN0aW9uKGNvbGxlY3Rpb24sIG9wdGlvbnMpIHtcblx0XHRsaWZlY3ljbGVFdmVudHMuYWZ0ZXJSZXNldC5jYWxsKHRoaXMsIGNvbGxlY3Rpb24sIG9wdGlvbnMpO1xuXHR9LFxuXG5cdC8vIFByb3RvdHlwZSBtZXRob2RzLlxuXHRjbG9zZTogZnVuY3Rpb24oKSB7XG5cdFx0Y2xvc2UuY2FsbCh0aGlzKTtcblx0fSxcblx0cmVuZGVyOiBmdW5jdGlvbihhdEluZGV4KSB7XG5cdFx0cmVuZGVyLmNhbGwodGhpcywgYXRJbmRleCk7XG5cdH0sXG5cblx0cmVuZGVyQ29sbGVjdGlvbjogZnVuY3Rpb24gKCkge1xuXHRcdHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcblx0XHRyZW5kZXJDb2xsZWN0aW9uLmFwcGx5KHRoaXMsIGFyZ3MpO1xuXHR9LFxufSk7XG5cblxuXG5cbkNvbXBvbmVudC5wcm90b3R5cGUuaW5pdGlhbGl6ZSA9IGZ1bmN0aW9uKHByb3BlcnRpZXMpIHtcblxuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0Ly8gS2VlcCB0cmFjayBvZiBhIGNvdW50ZXIgZm9yIHVzZSBpbiBnZW5lcmF0aW5nXG5cdC8vIGlkcyBmb3IgYW5vbnltb3VzIGNvbXBvbmVudHMuXG5cdHRoaXMuYW5vbnltb3VzUmVnaW9uQ291bnRlciA9IDA7XG5cblx0Ly8gRGlzYWJsZSBvciBpc3N1ZSB3YXJuaW5ncyBhYm91dCBjZXJ0YWluIHByb3BlcnRpZXNcblx0Ly8gYW5kIG1ldGhvZHMgdG8gYXZvaWQgY29uZnVzaW9uXG5cdHByb3BlcnRpZXMgPSB2YWxpZGF0ZURlZmluaXRpb24ocHJvcGVydGllcyk7XG5cblx0Ly8gRXh0ZW5kIGluc3RhbmNlIHcvIHNwZWNpZmllZCBwcm9wZXJ0aWVzIGFuZCBtZXRob2RzXG5cdF8uZXh0ZW5kKHRoaXMsIHByb3BlcnRpZXMpO1xuXG5cdC8vIFN0YXJ0IHdpdGggZW1wdHkgcmVnaW9ucyBvYmplY3Rcblx0dGhpcy5yZWdpb25zID0ge307XG5cblx0Ly8gRW5jb3VyYWdlIGNoaWxkIG1ldGhvZHMgdG8gdXNlIHRoZSBjb21wb25lbnQgY29udGV4dFxuXHRfLmJpbmRBbGwodGhpcyk7XG59O1xuIiwiLy8gRmlyZWQgd2hlbiB0aGUgYm91bmQgbW9kZWwgaXMgdXBkYXRlZCAoYHRoaXMubW9kZWxgKVxuZXhwb3J0cy5hZnRlckNoYW5nZSA9IGZ1bmN0aW9uIChtb2RlbCwgb3B0aW9ucykge307XG5cbi8vIEZpcmVkIHdoZW4gYSBtb2RlbCBpcyBhZGRlZCB0byB0aGUgYm91bmQgY29sbGVjdGlvbiAoYHRoaXMuY29sbGVjdGlvbmApXG5leHBvcnRzLmFmdGVyQWRkID0gZnVuY3Rpb24gKG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zKSB7fTtcblxuLy8gRmlyZWQgd2hlbiBhIG1vZGVsIGlzIHJlbW92ZWQgZnJvbSB0aGUgYm91bmQgY29sbGVjdGlvbiAoYHRoaXMuY29sbGVjdGlvbmApXG5leHBvcnRzLmFmdGVyUmVtb3ZlID0gZnVuY3Rpb24gKG1vZGVsLCBjb2xsZWN0aW9uLCBvcHRpb25zKSB7fTtcblxuLy8gRmlyZWQgd2hlbiB0aGUgYm91bmQgY29sbGVjdGlvbiBpcyB3aXBlZCAoYHRoaXMuY29sbGVjdGlvbmApXG5leHBvcnRzLmFmdGVyUmVzZXQgPSBmdW5jdGlvbiAoY29sbGVjdGlvbiwgb3B0aW9ucykge307XG4iLCIvLyBGaXJlZCBhdXRvbWF0aWNhbGx5IHdoZW4gdGhlIHZpZXcgaXMgaW5pdGlhbGx5IGNyZWF0ZWRcbi8vIG9ubHkgZmlyZWQgYWZ0ZXJ3YXJkcyBpZiB0aGlzLnJlbmRlcigpIGlzIGV4cGxpY2l0bHkgY2FsbGVkXG4vLyBDYWxsYmFjayBtdXN0IGJlIGZpcmVkISFcbmV4cG9ydHMuYmVmb3JlUmVuZGVyID0gZnVuY3Rpb24gKGNiKSB7Y2IoKTt9O1xuXG4vLyBGaXJlZCBhdXRvbWF0aWNhbGx5IHdoZW4gdGhlIHZpZXcgaXMgaW5pdGlhbGx5IGNyZWF0ZWRcbi8vIG9ubHkgZmlyZWQgYWZ0ZXJ3YXJkcyBpZiB0aGlzLnJlbmRlcigpIGlzIGV4cGxpY2l0bHkgY2FsbGVkXG5leHBvcnRzLmFmdGVyUmVuZGVyID0gZnVuY3Rpb24gKCkge307XG5cbi8vIEZpcmVkIGF1dG9tYXRpY2FsbHkgd2hlbiB0aGUgdmlldyBpcyBjbG9zZWRcbmV4cG9ydHMuYmVmb3JlQ2xvc2UgPSBmdW5jdGlvbiAoY2IpIHtjYigpO307XG5cbi8vIEZpcmVkIGJlZm9yZSByZXJlbmRlcmluZyBvciBjbG9zaW5nIGEgdmlldyB0aGF0IGlzIGFscmVhZHkgd2FpdGluZyBvbiBhIGxvY2tcbmV4cG9ydHMuY2FuY2VsUmVuZGVyID0gZnVuY3Rpb24gKCkge1xuXHRGUkFNRVdPUksud2FybignY2FuY2VsUmVuZGVyKCkgc2hvdWxkIGJlIGRlZmluZWQgaWYgYmVmb3JlQ2xvc2UoY2IpIG9yIGJlZm9yZVJlbmRlcihjYiknICtcblx0XHRcdFx0XHRcdFx0XHQgJ2FyZSBiZWluZyB1c2VkIScpO1xufTtcblxuLy8gRmlyZWQgYmVmb3JlIHJlcmVuZGVyaW5nIG9yIGNsb3NpbmcgYSB2aWV3IHRoYXQgaXMgYWxyZWFkeSB3YWl0aW5nIG9uIGEgbG9ja1xuZXhwb3J0cy5jYW5jZWxDbG9zZSA9IGZ1bmN0aW9uICgpIHtcblx0RlJBTUVXT1JLLndhcm4oJ2NhbmNlbENsb3NlKCkgc2hvdWxkIGJlIGRlZmluZWQgaWYgYmVmb3JlQ2xvc2UoY2IpIG9yIGJlZm9yZVJlbmRlcihjYiknICtcblx0XHRcdFx0XHRcdFx0XHQgJ2FyZSBiZWluZyB1c2VkIScpO1xufTtcbiIsIi8qKlxuICogUnVuIEhUTUwgdGVtcGxhdGUgdGhyb3VnaCBlbmdpbmUgYW5kIGFwcGVuZCByZXN1bHRzIHRvIG91dGxldC4gQWxzbyByZXJlbmRlciByZWdpb25zLlxuICogSWYgYXRJbmRleCBpcyBzcGVjaWZpZWQsIHRoZSBjb21wb25lbnQgaXMgcmVuZGVyZWQgYXQgdGhlIGdpdmVuIHBvc2l0aW9uIHdpdGhpbiBpdHNcbiAqIG91dGxldC4gT3RoZXJ3aXNlLCB0aGUgbGFzdCBwb3NpdGlvbiBpcyB1c2VkLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSBhdEluZGV4IFtUaGUgaW5kZXggaW4gd2hpY2ggdG8gcmVuZGVyIHRoaXMgZWxlbWVudF1cbiAqL1xuXG52YXIgRE9NID0gcmVxdWlyZSAoJy4uL3V0aWxzL0RPTScpLFxuXHRcdGhlbHBlcnMgPSByZXF1aXJlKCcuL2hlbHBlcnMnKSxcblx0XHRiaW5kRXZlbnRzID0gcmVxdWlyZSAoJy4vYmluZEV2ZW50cycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHJlbmRlcihhdEluZGV4KSB7XG5cblx0RlJBTUVXT1JLLmRlYnVnKHRoaXMuaWQgKyAnIDotLS06IFJlbmRlcmluZyBjb21wb25lbnQuLi4nKTtcblxuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0Ly8gQ2FuY2VsIGN1cnJlbnQgcmVuZGVyIGFuZCBjbG9zZSBqb2JzLCBpZiB0aGV5J3JlIHJ1bm5pbmdcblx0aWYgKHRoaXMuX3JlbmRlcmluZykge1xuXHRcdEZSQU1FV09SSy5kZWJ1Zyh0aGlzLmlkICsgJyA6OiByZW5kZXIoKSBjYW5jZWxlZC4nKTtcblx0XHR0aGlzLl9yZW5kZXJpbmdDYW5jZWxlZCA9IHRydWU7XG5cdFx0dGhpcy5jYW5jZWxSZW5kZXIoKTtcblx0XHR0aGlzLl9yZW5kZXJpbmcgPSBmYWxzZTtcblx0fVxuXHRpZiAodGhpcy5fY2xvc2luZykge1xuXHRcdEZSQU1FV09SSy5kZWJ1Zyh0aGlzLmlkICsgJyA6OiBjbG9zZSgpIGNhbmNlbGVkLicpO1xuXHRcdHRoaXMuY2FuY2VsQ2xvc2UoKTtcblx0XHR0aGlzLl9jbG9zaW5nID0gZmFsc2U7XG5cdH1cblxuXHQvLyBMb2NrIGFjY2VzcyB0byByZW5kZXJcblx0dGhpcy5fcmVuZGVyaW5nID0gdHJ1ZTtcblxuXHQvLyBUcmlnZ2VyIGJlZm9yZVJlbmRlciBtZXRob2Rcblx0dGhpcy5iZWZvcmVSZW5kZXIoZnVuY3Rpb24gKCkge1xuXG5cdFx0Ly8gSWYgcmVuZGVyaW5nIHdhcyBjYW5jZWxlZCwgYnJlYWsgb3V0XG5cdFx0Ly8gZG8gbm90IHJlbmRlciwgYW5kIGRvIG5vdCBjYWxsIGFmdGVyUmVuZGVyKClcblx0XHRpZiAoIHNlbGYuX3JlbmRlcmluZ0NhbmNlbGVkICkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEJpbmQgdGhlIGV2ZW50cyBvbiBtb2RlbC9jb2xsZWN0aW9ucyBhbmQgZ2xvYmFsIHRyaWdnZXJlZCBldmVudHMuXG5cdFx0YmluZEV2ZW50cy5jb2xsZWN0aW9uRXZlbnRzLmNhbGwoc2VsZik7XG5cdFx0YmluZEV2ZW50cy5tb2RlbEV2ZW50cy5jYWxsKHNlbGYpO1xuXHRcdGJpbmRFdmVudHMuZ2xvYmFsVHJpZ2dlcnMuY2FsbChzZWxmKTtcblxuXHRcdC8vIFVubG9jayByZW5kZXJpbmcgbXV0ZXhcblx0XHRzZWxmLl9yZW5kZXJpbmcgPSBmYWxzZTtcblxuXHRcdGlmICghc2VsZi4kb3V0bGV0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3Ioc2VsZi5pZCArICcgOjogVHJ5aW5nIHRvIHJlbmRlcigpLCBidXQgbm8gJG91dGxldCB3YXMgZGVmaW5lZCEnKTtcblx0XHR9XG5cblx0XHQvLyBIeWRyYXRlIGNvbXBpbGVkIHRlbXBsYXRlXG5cdFx0Ly8gKGNvbWJpbmVzIHRoZSB0ZW1wbGF0ZSBmdW5jdGlvbiB3aXRoIGRhdGEgdG8gcmV0dXJuIEhUTUwpXG5cdFx0dmFyIGh0bWwgPSBoZWxwZXJzLmNvbXBpbGVUZW1wbGF0ZS5jYWxsKHNlbGYpO1xuXHRcdGlmICghaHRtbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKHRoaXMuaWQgKyAnIDo6IFVuYWJsZSB0byByZW5kZXIgY29tcG9uZW50IGJlY2F1c2UgdGVtcGxhdGUgY29tcGlsYXRpb24gZGlkIG5vdCByZXR1cm4gYW55IEhUTUwuJyk7XG5cdFx0fVxuXG5cdFx0Ly8gU3RyaXAgdHJhaWxpbmcgYW5kIGxlYWRpbmcgd2hpdGVzcGFjZSB0byBhdm9pZCBmYWxzZWx5IGRpYWdub3Npbmdcblx0XHQvLyBtdWx0aXBsZSBlbGVtZW50cywgd2hlbiBvbmx5IG9uZSBhY3R1YWxseSBleGlzdHNcblx0XHQvLyAodGhpcyBtaXNkaWFnbm9zaXMgd3JhcHMgdGhlIHRlbXBsYXRlIGluIGFuIGV4dHJhbmVvdXMgPGRpdj4pXG5cdFx0aHRtbCA9IGh0bWwucmVwbGFjZSgvXlxccyovLCAnJyk7XG5cdFx0aHRtbCA9IGh0bWwucmVwbGFjZSgvXFxzKiQvLCAnJyk7XG5cdFx0aHRtbCA9IGh0bWwucmVwbGFjZSgvKFxccnxcXG4pKi8sICcnKTtcblxuXHRcdC8vIFN0cmlwIEhUTUwgY29tbWVudHMsIHRoZW4gc3RyaXAgd2hpdGVzcGFjZSBhZ2FpblxuXHRcdC8vIChUT0RPOiBvcHRpbWl6ZSB0aGlzKVxuXHRcdGh0bWwgPSBodG1sLnJlcGxhY2UoLyg8IS0tListLT4pKi8sICcnKTtcblx0XHRodG1sID0gaHRtbC5yZXBsYWNlKC9eXFxzKi8sICcnKTtcblx0XHRodG1sID0gaHRtbC5yZXBsYWNlKC9cXHMqJC8sICcnKTtcblx0XHRodG1sID0gaHRtbC5yZXBsYWNlKC8oXFxyfFxcbikqLywgJycpO1xuXG5cdFx0Ly8gUGFyc2UgYSBET00gbm9kZSBvciBzZXJpZXMgb2YgRE9NIG5vZGVzIGZyb20gdGhlIG5ld2x5IHRlbXBsYXRlZCBIVE1MXG5cdFx0dmFyIHBhcnNlZE5vZGVzID0gJC5wYXJzZUhUTUwoaHRtbCk7XG5cdFx0dmFyIGVsID0gcGFyc2VkTm9kZXNbMF07XG5cblx0XHQvLyBJZiBubyBub2RlcyB3ZXJlIHBhcnNlZCwgdGhyb3cgYW4gZXJyb3Jcblx0XHRpZiAocGFyc2VkTm9kZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3Ioc2VsZi5pZCArICcgOjogcmVuZGVyKCkgcmFuIGludG8gYSBwcm9ibGVtIHJlbmRlcmluZyB0aGUgdGVtcGxhdGUgd2l0aCBIVE1MID0+IFxcbicraHRtbCk7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgdGhlcmUgaXMgbm90IG9uZSBzaW5nbGUgd3JhcHBlciBlbGVtZW50LFxuXHRcdC8vIG9yIGlmIHRoZSByZW5kZXJlZCB0ZW1wbGF0ZSBjb250YWlucyBvbmx5IGEgc2luZ2xlIHRleHQgbm9kZSxcblx0XHQvLyAob3IganVzdCBhIGxvbmUgcmVnaW9uKVxuXHRcdGVsc2UgaWYgKHBhcnNlZE5vZGVzLmxlbmd0aCA+IDEgfHwgcGFyc2VkTm9kZXNbMF0ubm9kZVR5cGUgPT09IDMgfHxcblx0XHRcdFx0XHRcdCAkKHBhcnNlZE5vZGVzWzBdKS5pcygncmVnaW9uJykgfHxcblx0XHRcdFx0XHRcdCAkKHBhcnNlZE5vZGVzWzBdKS5hdHRyKCdkYXRhLXJlZ2lvbicpICE9PSB1bmRlZmluZWQgKSB7XG5cblx0XHRcdEZSQU1FV09SSy5sb2coc2VsZi5pZCArICcgOjogV3JhcHBpbmcgdGVtcGxhdGUgaW4gPGRpdi8+Li4uJywgcGFyc2VkTm9kZXMpO1xuXG5cdFx0XHQvLyB3cmFwIHRoZSBodG1sIHVwIGluIGEgY29udGFpbmVyIDxkaXYvPlxuXHRcdFx0ZWwgPSAkKCc8ZGl2Lz4nKS5hcHBlbmQoaHRtbCk7XG5cdFx0XHRlbCA9IGVsWzBdO1xuXHRcdH1cblxuXHRcdC8vIFNldCBCYWNrYm9uZSBlbGVtZW50IChjYWNoZSBhbmQgcmVkZWxlZ2F0ZSBET00gZXZlbnRzKVxuXHRcdC8vIChXaWxsIGFsc28gdXBkYXRlIHNlbGYuJGVsKVxuXHRcdHNlbGYuc2V0RWxlbWVudChlbCk7XG5cdFx0Ly8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cblxuXHRcdC8vIERldGVjdCBhbmQgcmVuZGVyIGFsbCByZWdpb25zIGFuZCB0aGVpciBkZXNjZW5kZW50IGNvbXBvbmVudHMgYW5kIHJlZ2lvbnNcblx0XHRoZWxwZXJzLnJlbmRlclJlZ2lvbnMuY2FsbChzZWxmKTtcblxuXHRcdC8vIEluc2VydCB0aGUgZWxlbWVudCBhdCB0aGUgcHJvcGVyIHBsYWNlIGFtb25nc3QgdGhlIG91dGxldCdzIGNoaWxkcmVuXG5cdFx0dmFyIG5laWdoYm9ycyA9IHNlbGYuJG91dGxldC5jaGlsZHJlbigpO1xuXHRcdGlmIChfLmlzRmluaXRlKGF0SW5kZXgpICYmIG5laWdoYm9ycy5sZW5ndGggPiAwICYmIG5laWdoYm9ycy5sZW5ndGggPiBhdEluZGV4KSB7XG5cdFx0XHRuZWlnaGJvcnMuZXEoYXRJbmRleCkuYmVmb3JlKHNlbGYuJGVsKTtcblx0XHR9XG5cblx0XHQvLyBCdXQgaWYgdGhlIG91dGxldCBpcyBlbXB0eSwgb3IgdGhlcmUncyBubyBhdEluZGV4LCBqdXN0IHN0aWNrIGl0IG9uIHRoZSBlbmRcblx0XHRlbHNlIHNlbGYuJG91dGxldC5hcHBlbmQoc2VsZi4kZWwpO1xuXG5cblx0XHQvLyBGbGFnIHdpdGggZGF0YS10ZW1wbGF0ZS1pZCBhdHRyaWJ1dGVcblx0XHQvLyAodG8gbWFrZSB0ZW1wbGF0ZS9jb21wb25lbnQgYm91bmRhcmllcyBlYXNpZXIgdG8gcGljayBvdXQgaW4gdGhlIGluc3BlY3Rvcilcblx0XHRzZWxmLiRlbC5hdHRyKCdkYXRhLXRlbXBsYXRlLWlkJywgc2VsZi5pZCk7XG5cblxuXG5cblx0XHQvL1xuXHRcdC8vIElmIHRoZSBwYXJlbnQgY29tcG9uZW50IGhhcyByb3V0ZSBsaXN0ZW5lcnMgKGUuZy4gI2Zvbylcblx0XHQvLyBydW4gYW55IG9mIHRoZW0gdGhhdCBtYXRjaCBgd2luZG93LmxvY2F0aW9uLmhhc2hgLlxuXHRcdC8vIChhZnRlciByZW5kZXJpbmcgdGhlIHRlbXBsYXRlIGFuZCByZWdpb25zIGJ1dCBCRUZPUkUgdGhlIGBhZnRlclJlbmRlcmBcblx0XHQvLyBsaWZlY3ljbGUgY2FsbGJhY2sgaXMgdHJpZ2dlcmVkKVxuXHRcdC8vXG5cdFx0Ly8gbm90IHN1cmUgaWYgdGhpcyBpcyBhIGdvb2QgaWRlYSBpbiBnZW5lcmFsLS0gbWF5YmUgY29uZmlndXJhYmxlLi4/XG5cdFx0Ly8gb3Igb25seSBpZiBiYWNrYm9uZS5oaXN0b3J5IGlzbid0IHJlYWR5IHlldD9cblx0XHQvL1xuXHRcdC8vIGRpc2FibGluZyBmb3Igbm93Li4uXG5cdFx0Ly8gXy5lYWNoKCBPYmplY3Qua2V5cyhzZWxmKSwgZnVuY3Rpb24gKGtleSkge1xuXHRcdC8vIFx0dmFyIG1hdGNoZWRSb3V0ZSA9IGtleS5tYXRjaChuZXcgUmVnRXhwKCcvXicgK3dpbmRvdy5sb2NhdGlvbi5oYXNoICsgJy8nKSk7XG5cdFx0Ly8gXHRpZiAoIW1hdGNoZWRSb3V0ZSkgcmV0dXJuO1xuXG5cdFx0Ly8gXHR2YXIgbWF0Y2hlZFJvdXRlTGlzdGVuZXIgPSBzZWxmW21hdGNoZWRSb3V0ZV07XG5cdFx0Ly8gXHRtYXRjaGVkUm91dGVMaXN0ZW5lcigpO1xuXHRcdC8vIH0pO1xuXG5cblx0XHQvLyBGaW5hbGx5LCB0cmlnZ2VyIGFmdGVyUmVuZGVyIG1ldGhvZFxuXHRcdHNlbGYuYWZ0ZXJSZW5kZXIoKTtcblxuXG5cdFx0Ly8gUnVuIGRhdGEgYmluZGluZ3Ncblx0XHQvLyBUT0RPOiBkb24ndCBjYWxsIHRoaXMgaGVyZS0tIGp1c3QgZG8gd2hlbiBpbml0aWFsbHkgaW5zZXJ0aW5nIHRoZSB0ZW1wbGF0ZSBpbnRvIHRoZSBET01cblx0XHQvLyAodGhpcyBpcyBpbmVmZmljaWVudClcblx0XHRoZWxwZXJzLnJlbmRlckRhdGFCaW5kaW5ncy5jYWxsKHNlbGYpO1xuXG5cblx0XHQvLyBBZGQgZGF0YSBhdHRyaWJ1dGVzIHRvIHRoaXMgY29tcG9uZW50J3MgJGVsLCBwcm92aWRpbmcgYWNjZXNzXG5cdFx0Ly8gdG8gd2hldGhlciB0aGUgZWxlbWVudCBoYXMgdmFyaW91cyBET00gYmluZGluZ3MgZnJvbSBzdHlsZXNoZWV0cy5cblx0XHQvLyAoaGFuZHkgZm9yIGRpc2FibGluZyB0ZXh0IHNlbGVjdGlvbiBhY2NvcmRpbmdseSwgZXRjLilcblx0XHQvL1xuXHRcdC8vIC0+IGRpc2FibGUgZm9yIHRoaXMgY29tcG9uZW50IHdpdGggYHRoaXMuYXR0ckZsYWdzID0gZmFsc2VgXG5cdFx0Ly8gLT4gb3IgZ2xvYmFsbHkgd2l0aCBgRlJBTUVXT1JLLmF0dHJGbGFncyA9IGZhbHNlYFxuXHRcdC8vXG5cdFx0Ly8gVE9ETzogbWFrZSBpdCB3b3JrIHdpdGggZGVsZWdhdGVkIERPTSBldmVudCBiaW5kaW5nc1xuXHRcdC8vXG5cdFx0aWYgKHNlbGYuYXR0ckZsYWdzICE9PSBmYWxzZSAmJiBGUkFNRVdPUksuYXR0ckZsYWdzICE9PSBmYWxzZSkge1xuXHRcdFx0RE9NLmZsYWdCb3VuZEV2ZW50cyhzZWxmKTtcblx0XHR9XG5cdH0pO1xufTtcbiIsIlxuLyoqXG4gKiBUT0RPOlxuICogVHJ5IG91dCBhIGRpZmZlcmVudCBhcHByb2FjaCBmb3IgdGhlIGxvZ2ljIGluIGByZW5kZXJDb2xsZWN0aW9uYFxuICogYmVsb3cgYnkgb3ZlcmxvYWRpbmcgYHJlZ2lvbi5hdHRhY2goKWAuXG4gKlxuICogRXhhbXBsZSB1c2FnZTogKGluIHBhcmVudCBjb21wb25lbnQpXG4gKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICogdGhpcy5zb21lUmVnaW9uLmF0dGFjaCgnU29tZU90aGVyQ29tcG9uZW50Jyx7IGNvbGxlY3Rpb246IFNvbWVDb2xsZWN0aW9uIH0pXG4gKlxuICogLW9yLVxuICpcbiAqIHRoaXMuc29tZVJlZ2lvbi5yZXBlYXQoJ1NvbWVPdGhlckNvbXBvbmVudCcseyBjb2xsZWN0aW9uOiBTb21lQ29sbGVjdGlvbiB9KVxuICovXG5cbi8qKlxuICogcmVuZGVyQ29sbGVjdGlvbigpXG4gKlxuICogUmV1c2FibGUgbG9naWMgdG8gcmVuZGVyIGEgY29sbGVjdGlvbiBpbnRvIGEgcmVnaW9uXG4gKlxuICogVE9ETzogbW92ZSBvbnRvIFJlZ2lvbiBvYmplY3QgaW5zdGVhZC4uLiAgU2VlIGdpc3QuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IGNvbGxlY3Rpb24gLSBkYXRhIHNvdXJjZVxuICogQHBhcmFtIHtPcHRpb25zfSBvcHRpb25zXG4gKlx0XHQ6IG9wdGlvbnMuaXRlbVRlbXBsYXRlIHtTdHJpbmd9IC0gbmFtZSBvZiB0ZW1wbGF0ZS9jb21wb25lbnQgdG8gdXNlIGFzIGl0ZW1cbiAqXHRcdDogb3B0aW9ucy5pbnRvUmVnaW9uIHtPYmplY3R9IC0gdGhlIGRlc3RpbmF0aW9uIHJlZ2lvblxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChjb2xsZWN0aW9uLCBvcHRpb25zKSB7XG5cblx0Ly8gUmVxdWlyZWQ6XG5cdGlmICh0eXBlb2YgY29sbGVjdGlvbiAhPT0gJ29iamVjdCcpIHRocm93IG5ldyBFcnJvcigncmVuZGVyQ29sbGVjdGlvbiA6OiBVbmtub3duL2ludmFsaWQgY29sbGVjdGlvbiwgXCInICsgKGNvbGxlY3Rpb24gJiYgY29sbGVjdGlvbi50eXBlKSArICdcIicpO1xuXHRpZiAoIW9wdGlvbnMuaXRlbVRlbXBsYXRlKSB0aHJvdyBuZXcgRXJyb3IoJ3JlbmRlckNvbGxlY3Rpb24gOjogb3B0aW9ucy5pdGVtVGVtcGxhdGUgcmVxdWlyZWQhJyk7XG5cdGlmICghb3B0aW9ucy5pbnRvUmVnaW9uKSB0aHJvdyBuZXcgRXJyb3IoJ3JlbmRlckNvbGxlY3Rpb24gOjogb3B0aW9ucy5pbnRvUmVnaW9uIHJlcXVpcmVkIScpO1xuXG5cblx0Ly8gRGV0ZXJtaW5lIGNvbGxlY3Rpb25OYW1lXG5cdHZhciBjb2xsZWN0aW9uTmFtZSA9IGNvbGxlY3Rpb24udHlwZTtcblxuXHQvLyBUYXJnZXQgcmVnaW9uXG5cdHZhciBvdXRsZXQgPSBvcHRpb25zLmludG9SZWdpb247XG5cblx0Ly8gU3ViLWNvbXBvbmVudFxuXHR2YXIgc3ViY29tcG9uZW50TmFtZSA9IG9wdGlvbnMuaXRlbVRlbXBsYXRlO1xuXG5cdC8vIE5hbWUgb2YgdGhlIGNvbGxlY3Rpb24gc3RhdGUgYXR0cmlidXRlIHRoYXQgd2lsbGUgYmUgaW5qZWN0ZWQgaW50byB0aGUgSFRNTFxuXHQvLyBVc2VkIGZvciB0aGUgZGVmYXVsdCByZW5kZXIgYmVoYXZpb3IuXG5cdHZhciBib2R5U3RhdGVBdHRyaWJ1dGUgPSAnZGF0YS0nICsgY29sbGVjdGlvbk5hbWUgKyAnLXN0YXRlJztcblxuXG5cblxuXHQvKipcblx0ICogRGVmYXVsdCByZW5kZXIgbWV0aG9kc1xuXHQgKlxuXHQgKiBPdmVycmlkZSBkZWZhdWx0IHJlbmRlciBtZXRob2RzIHdpdGggb3B0aW9ucyBpZiBzcGVjaWZpZWRcblx0ICovXG5cblx0Ly8gRGVmYXVsdCByZW5kZXIgbG9naWMgZm9yIGVycm9yIHN0YXRlIChlLmcuIHJlZCB0ZXh0KVxuXHR2YXIgcmVuZGVyRXJyb3IgPSBvcHRpb25zLnJlbmRlckVycm9yIHx8IGZ1bmN0aW9uIHJlbmRlckVycm9yICgpIHtcblx0XHRGUkFNRVdPUksuZXJyb3IoJ0FuIGVycm9yIG9jY3VycmVkIHdoaWxlIGxvYWRpbmcgJyArIGNvbGxlY3Rpb25OYW1lICsgJyA6OlxcbicsIGNvbGxlY3Rpb24uZXJyb3IpO1xuXG5cdFx0Ly8gU2V0IGEgZGF0YSBhdHRyaWJ1dGUgb24gSFRNTCBib2R5XG5cdFx0JCgnYm9keScpLmF0dHIoYm9keVN0YXRlQXR0cmlidXRlLCAnZXJyb3InKTtcblx0fTtcblxuXHQvLyBEZWZhdWx0IHJlbmRlciBsb2dpYyBmb3IgbG9hZGluZyBzdGF0ZSAoZS5nLiBzcGlubmVyKVxuXHR2YXIgcmVuZGVyU3luY2luZyA9IG9wdGlvbnMucmVuZGVyU3luY2luZyB8fCBmdW5jdGlvbiByZW5kZXJTeW5jaW5nKCkge1xuXHRcdEZSQU1FV09SSy5sb2coJ0xvYWRpbmcgJyArIGNvbGxlY3Rpb25OYW1lICsgJy4uLicpO1xuXG5cdFx0Ly8gU2V0IHN0YXRlIGF0dHJpYnV0ZSBvbiBIVE1MIGJvZHlcblx0XHQkKCdib2R5JykuYXR0cihib2R5U3RhdGVBdHRyaWJ1dGUsICdzeW5jaW5nJyk7XG5cdH07XG5cblx0Ly8gRGVmYXVsdCByZW5kZXIgbG9naWMgdG8gY2xlYW4gdXAgYWZ0ZXIgYSBzdWNjZXNzZnVsIHN5bmMvbG9hZFxuXHR2YXIgcmVuZGVyU3luY2VkID0gb3B0aW9ucy5yZW5kZXJTeW5jZWQgfHwgZnVuY3Rpb24gcmVuZGVyU3luY2VkKCkge1xuXHRcdEZSQU1FV09SSy5sb2coY29sbGVjdGlvbi5sZW5ndGggKyAnICcgKyBjb2xsZWN0aW9uTmFtZSArICcgZmV0Y2hlZCBzdWNjZXNzZnVsbHkuJyk7XG5cblx0XHQvLyBTZXQgc3RhdGUgYXR0cmlidXRlIG9uIEhUTUwgYm9keVxuXHRcdCQoJ2JvZHknKS5hdHRyKGJvZHlTdGF0ZUF0dHJpYnV0ZSwgJ3JlYWR5Jyk7XG5cdH07XG5cblx0Ly8gRGVmYXVsdCByZW5kZXIgbG9naWMgZm9yIGl0ZW1zIGluIGNvbGxlY3Rpb25cblx0dmFyIHJlbmRlclJlc2V0ID0gb3B0aW9ucy5yZW5kZXJSZXNldCB8fCBmdW5jdGlvbiByZW5kZXJSZXNldCgpIHtcblxuXHRcdC8vIENsZWFuIG91dCB0aGUgcmVnaW9uLCB3cmFwIGluIGEgdHJ5L2NhdGNoIHRvIHN0b3AgdGhlIGV4ZWN1dGlvblxuXHRcdHRyeSB7XG5cdFx0XHRvdXRsZXQuZW1wdHkoKTtcblx0XHR9IGNhdGNoIChlKSB7fVxuXG5cblx0XHQvLyBUT0RPOiBTbWFydCBtZXJnZSB0byBtaW5pbWl6ZSBET00gcXVlcmllc1xuXHRcdGNvbGxlY3Rpb24uZWFjaChmdW5jdGlvbiAobW9kZWwpIHtcblx0XHRcdC8vIEZvciBlYWNoIG1vZGVsIGZvdW5kLCBhcHBlbmQgYSBzdWJjb21wb25lbnQgdG8gdGhlIHJlZ2lvblxuXHRcdFx0b3V0bGV0LmFwcGVuZChzdWJjb21wb25lbnROYW1lLCB7IG1vZGVsOiBtb2RlbCB9KTtcblx0XHR9KTtcblx0fTtcblxuXHQvKipcblx0ICogcmVuZGVyQWRkICggbW9kZWwsIFthdEluZGV4XSApXG5cdCAqXG5cdCAqIEBwYXJhbSB7TW9kZWx9IG1vZGVsXHRcdFx0XHRcdFx0LSB0aGUgQmFja2JvbmUgbW9kZWwgdGhhdCB3YXMgYWRkZWRcblx0ICogQHBhcmFtIHtJbnRlZ2VyfSBhdEluZGV4XHRcdFx0XHQtIChvcHRpb25hbC0gZGVmYXVsdHMgdG8gY29sbGVjdGlvbi5sZW5ndGgpXG5cdCAqXG5cdCAqIERlZmF1bHQgcmVuZGVyIGxvZ2ljIGZvciB0aGUgY2FzZSB3aGVyZSBhbiBpdGVtIGlzIGFkZGVkIHRvIHRoZSBjb2xsZWN0aW9uLlxuXHQgKi9cblx0dmFyIHJlbmRlckFkZCA9IG9wdGlvbnMucmVuZGVyQWRkIHx8IGZ1bmN0aW9uIHJlbmRlckFkZCggbW9kZWwsIGF0SW5kZXggKSB7XG5cdFx0aWYgKCB0eXBlb2YgYXRJbmRleCA9PT0gJ251bWJlcicpIHtcblx0XHRcdHJldHVybiBvdXRsZXQuaW5zZXJ0KGF0SW5kZXgsIHN1YmNvbXBvbmVudE5hbWUsIHsgbW9kZWw6IG1vZGVsIH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gb3V0bGV0LmFwcGVuZChzdWJjb21wb25lbnROYW1lLCB7IG1vZGVsOiBtb2RlbCB9KTtcblx0fTtcblxuXHQvKipcblx0ICogcmVuZGVyUmVtb3ZlKCBhdEluZGV4IClcblx0ICpcblx0ICogQHBhcmFtIHtJbnRlZ2VyfSBhdEluZGV4XHRcdFx0LSB0aGUgZm9ybWVyIGluZGV4IG9mIHRoZSBCYWNrYm9uZSBtb2RlbCB0aGF0IHdhcyByZW1vdmVkXG5cdCAqXG5cdCAqIERlZmF1bHQgcmVuZGVyIGxvZ2ljIGZvciB0aGUgY2FzZSB3aGVyZSBhbiBpdGVtIGlzIHJlbW92ZWQgZnJvbSB0aGUgY29sbGVjdGlvbi5cblx0ICovXG5cdHZhciByZW5kZXJSZW1vdmUgPSBvcHRpb25zLnJlbmRlclJlbW92ZSB8fCBmdW5jdGlvbiByZW5kZXJSZW1vdmUoIGF0SW5kZXggKSB7XG5cdFx0b3V0bGV0LnJlbW92ZSggYXRJbmRleCApO1xuXHR9O1xuXG5cblxuXG5cblxuXHQvKipcblx0ICogQm9vdHN0cmFwXG5cdCAqXG5cdCAqIFJlbmRlcnMgaW5pdGlhbCBzdGF0ZSBvZiBjb2xsZWN0aW9uIGludG8gb3VyIHJlZ2lvblxuXHQgKiB1c2luZyBvdXIgY2hpbGQgdGVtcGxhdGUuXG5cdCAqL1xuXG5cdC8vIElmIG91ciBjb2xsZWN0aW9uIGlzIGZldGNoaW5nLCByZW5kZXIgdGhlIGZldGNoaW5nIChsb2FkaW5nKSBzdGF0ZS5cblx0aWYgKGNvbGxlY3Rpb24uc3luY2luZykge1xuXHRcdHJlbmRlclN5bmNpbmcoKTtcblx0fVxuXG5cblx0Ly8gSWYgb3VyIGNvbGxlY3Rpb24gZmFpbGVkIHRvIGZldGNoIChpLmUuIHJlY2VpdmVkIGEgNHh4IG9yIDV4eCBlcnJvciBjb2RlKVxuXHQvLyByZW5kZXIgYW4gZXJyb3Igc3RhdGVcblx0Ly9cblx0Ly8gSGFuZGxlIHRoZSBjYXNlIG9mIG11bHRpcGxlIGVycm9yIHN0YXRlcyB3aXRoIGRpZmZlcmVudCBzdHlsZXMgaGVyZSBhcyB3ZWxsLlxuXHRlbHNlIGlmIChjb2xsZWN0aW9uLmVycm9yKSB7XG5cdFx0cmVuZGVyRXJyb3IoKTtcblx0fVxuXG5cblx0Ly8gT3RoZXJ3aXNlIG91ciBjb2xsZWN0aW9uIGlzIGxvYWRlZCBhbmQgcmVhZHksXG5cdC8vIHNvIGdvIGFoZWFkIGFuZCByZW5kZXIgaXQgaW50byB0aGUgdGFyZ2V0IHJlZ2lvbi5cblx0Ly9cblx0Ly8gKGFsdGVybmF0aXZlbHkgYXQgdGhpcyBwb2ludCwgYSBjdXN0b20gYGVtcHR5YCBzdGF0ZSBtYXkgYmUgcmVuZGVyZWQpXG5cdC8vIGNvbnNvbGUubG9nKCdUaGUgY29sbGVjdGlvbiAnICsgc3ViY29tcG9uZW50TmFtZSArICctLS0tPicpO1xuXHRlbHNlIHJlbmRlclJlc2V0KCk7XG5cblxuXG5cblxuXG5cblx0LyoqXG5cdCAqIEJpbmQgZXZlbnRzXG5cdCAqXG5cdCAqIExpc3RlbiBmb3Igc3RhdGUgY2hhbmdlcyAoc3luY2luZywgc3luY2VkLCBzZXJ2ZXIgZXJyb3IsIGFkZCwgcmVtb3ZlLCBzb3J0LCBldGMuKVxuXHQgKiBUaGVzZSBtYW51YWwgYmluZGluZ3MgY2FuIGJlIHJlbW92ZWQgd2hlbiBjb3JlIGZyYW1ld29yayBzdXBwb3J0cyByZW5kZXItdGltZSBjb2xsZWN0aW9uXG5cdCAqIGJpbmRpbmdzLiAgRm9yIG5vdywgZG9pbmcgaXQgdGhpcyB3YXkgcmF0aGVyIHRoYW4gcGF0Y2hpbmcgdGhlIGNvcmUgdG8gdGVzdCBvdXIgc3RydWN0dXJhbFxuXHQgKiBhc3N1bXB0aW9ucy5cblx0ICovXG5cblx0Ly8gV2hlbiBhIGZldGNoIGlzIGluaXRpYXRlZCBmcm9tIHRoZSBzZXJ2ZXIuLi5cblx0Ly9cblx0Ly8gKGFmdGVyIGBCYWNrYm9uZS5zeW5jYCBiZWdpbnMgYSByZW1vdGUgcmVxdWVzdClcblx0dGhpcy5saXN0ZW5Ubyhjb2xsZWN0aW9uLCAncmVxdWVzdCcsIGZ1bmN0aW9uIGFmdGVyUmVxdWVzdCAoKSB7XG5cdFx0cmVuZGVyU3luY2luZygpO1xuXHR9KTtcblxuXHQvLyBXaGVuIGEgZmV0Y2ggY29tcGxldGVzIHN1Y2Nlc3NmdWxseSBhbmQgbmV3IGRhdGEgaXMgbG9hZGVkLi4uXG5cdC8vXG5cdC8vIChhZnRlciB0aGlzIGNvbXBvbmVudCBpcyBhbHJlYWR5IGluc3RhbnRpYXRlZClcblx0dGhpcy5saXN0ZW5Ubyhjb2xsZWN0aW9uLCAnc3luYycsIGZ1bmN0aW9uIGFmdGVyU3luYyAoKSB7XG5cdFx0cmVuZGVyU3luY2VkKCk7XG5cdFx0cmVuZGVyUmVzZXQoKTtcblx0fSk7XG5cblx0Ly8gV2hlbiBzZXJ2ZXIgc2VuZHMgYSByZXNwb25zZSB3LyBhbiBlcnJvciBjb2RlXG5cdC8vXG5cdC8vIChhZnRlciB0aGlzIGNvbXBvbmVudCBpcyBhbHJlYWR5IGluc3RhbnRpYXRlZClcblx0dGhpcy5saXN0ZW5Ubyhjb2xsZWN0aW9uLCAnZXJyb3InLCBmdW5jdGlvbiBhZnRlclN5bmNFcnJvciAoY29sbGVjdGlvbiwgeGhyKSB7XG5cblx0XHQvLyBJZ25vcmUgYWJvcnQgXCJlcnJvclwiXG5cdFx0Ly9cblx0XHQvLyBXaHk/IGJlY2F1c2UgaXQncyBub3QgYWN0dWFsbHkgYW4gZXJyb3IuXG5cdFx0Ly8gTm90IHN1cmUgd2h5IHRoaXMgdHJpZ2dlcnMgQmFja2JvbmUuQ29sbGVjdGlvbidzIGBlcnJvcmAgZXZlbnQuLi5cblx0XHQvL1xuXHRcdC8vIElmIHR3byBmZXRjaGVzIG9jY3VyIG9uIHRoZSBzYW1lIGNvbGxlY3Rpb24gYXQgdGhlIHNhbWUgdGltZSxcblx0XHQvLyB3ZSBhYm9ydCB0aGUgb2xkIFhIUiByZXF1ZXN0IG91cnNlbHZlcyBpZiBpdCdzIHN0aWxsIHJ1bm5pbmcpXG5cdFx0aWYgKHhociAmJiB4aHIuc3RhdHVzVGV4dCA9PT0gJ2Fib3J0JykgcmV0dXJuO1xuXG5cdFx0cmVuZGVyRXJyb3IoKTtcblx0fSk7XG5cblx0Ly8gV2hlbiBhIG1vZGVsIGlzIGFkZGVkLi4uXG5cdC8vXG5cdC8vIExpc3RlbiBmb3IgbmV3IG1vZGVscywgYW5kIGluc2VydCBhIGNoaWxkIHRlbXBsYXRlXG5cdC8vIGF0IHRoZSBhcHByb3ByaWF0ZSBpbmRleCB3aXRoaW4gdGhlIHJlZ2lvbi5cblx0dGhpcy5saXN0ZW5Ubyhjb2xsZWN0aW9uLCAnYWRkJywgZnVuY3Rpb24gYWZ0ZXJBZGQgKCBtb2RlbCwgY29sbGVjdGlvbiwgb3B0aW9ucyApIHtcblx0XHRyZW5kZXJBZGQoIG1vZGVsLCBvcHRpb25zLmF0ICk7XG5cdH0pO1xuXG5cdC8vIFdoZW4gYSBtb2RlbCBpcyByZW1vdmVkLi4uXG5cdC8vXG5cdC8vIEdyYWIgbW9kZWwncyByZWxhdGl2ZSBpbmRleCB3aXRoaW4gY29sbGVjdGlvbiBhbmQgcmVtb3ZlXG5cdC8vIHRoZSBjaGlsZCB0ZW1wbGF0ZSBhdCB0aGUgc2FtZSBpbmRleCB3aXRoaW4gdGhlIHJlZ2lvbi5cblx0dGhpcy5saXN0ZW5Ubyhjb2xsZWN0aW9uLCAncmVtb3ZlJywgZnVuY3Rpb24gYWZ0ZXJSZW1vdmUgKCBtb2RlbCwgY29sbGVjdGlvbiwgb3B0aW9ucyApIHtcblx0XHRyZW5kZXJSZW1vdmUoIG9wdGlvbnMuaW5kZXggKTtcblx0fSk7XG5cblxuXG59O1xuIiwiLyoqXG4gKiBDaGVjayB0aGUgc3BlY2lmaWVkIGRlZmluaXRpb24gZm9yIG9idmlvdXMgbWlzdGFrZXMsIGVzcGVjaWFsbHkgbGlrZWx5IGRlcHJlY2F0aW9ucyBhbmRcbiAqIHZhbGlkYXRlIHRoYXQgdGhlIG1vZGVsIGFuZCBjb2xsZWN0aW9ucyBhcmUgaW5zdGFuY2VzIG9mIEJhY2tib25lJ3MgRGF0YSBzdHJ1Y3R1cmVzLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBwcm9wZXJ0aWVzIFtPYmplY3QgY29udGFpbmluZyB0aGUgcHJvcGVydGllcyBvZiB0aGUgY29tcG9uZW50XVxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gdmFsaWRhdGVEZWZpbml0aW9uKHByb3BlcnRpZXMpIHtcblxuXHRpZiAoXy5pc09iamVjdChwcm9wZXJ0aWVzKSkge1xuXG5cdFx0Ly8gRGV0ZXJtaW5lIGNvbXBvbmVudCBpZFxuXHRcdHZhciBpZCA9IHRoaXMuaWQgfHwgcHJvcGVydGllcy5pZDtcblxuXHRcdGZ1bmN0aW9uIF92YWxpZGF0ZUJhY2tib25lSW5zdGFuY2UgKHR5cGUpIHtcblx0XHRcdHZhciBUeXBlID0gdHlwZVswXS50b1VwcGVyQ2FzZSgpICsgdHlwZS5zbGljZSgxKTtcblxuXHRcdFx0aWYgKCAhcHJvcGVydGllc1t0eXBlXSBpbnN0YW5jZW9mIEJhY2tib25lW1R5cGVdICkge1xuXG5cdFx0XHRcdEZyYW1ld29yay5lcnJvcihcblx0XHRcdFx0XHQnQ29tcG9uZW50ICgnICsgaWQgKyAnKSBoYXMgYW4gaW52YWxpZCAnICsgdHlwZSArICctLSBcXG4nICtcblx0XHRcdFx0XHQnSWYgYCcgKyB0eXBlICsgJ2AgaXMgc3BlY2lmaWVkIGZvciBhIGNvbXBvbmVudCwgJyArXG5cdFx0XHRcdFx0J2l0IG11c3QgYmUgYW4gKmluc3RhbmNlKiBvZiBhIEJhY2tib25lLicgKyBUeXBlICsgJy5cXG4nKTtcblxuXHRcdFx0XHRpZiAocHJvcGVydGllc1t0eXBlXSBpbnN0YW5jZW9mIEJhY2tib25lW1R5cGVdLmNvbnN0cnVjdG9yKSB7XG5cdFx0XHRcdFx0RnJhbWV3b3JrLmVycm9yKFxuXHRcdFx0XHRcdFx0J0l0IGxvb2tzIGxpa2UgYSBCYWNrYm9uZS4nICsgVHlwZSArICcgKnByb3RvdHlwZSogd2FzIHNwZWNpZmllZCBpbnN0ZWFkIG9mIGEgJyArXG5cdFx0XHRcdFx0XHQnQmFja2JvbmUuJyArIFR5cGUgKyAnICppbnN0YW5jZSouXFxuJyArXG5cdFx0XHRcdFx0XHQnUGxlYXNlIGBuZXdgIHVwIHRoZSAnICsgdHlwZSArICcgLWJlZm9yZS0gJyArIEZyYW1ld29yay5pZCArICcucmFpc2UoKSwnICtcblx0XHRcdFx0XHRcdCdvciB1c2UgYSB3cmFwcGVyIGZ1bmN0aW9uIHRvIGFjaGlldmUgdGhlIHNhbWUgZWZmZWN0LCBlLmcuOlxcbicgK1xuXHRcdFx0XHRcdFx0J2AnICsgdHlwZSArICc6IGZ1bmN0aW9uICgpIHtcXG5yZXR1cm4gbmV3IFNvbWUnICsgVHlwZSArICcoKTtcXG59YCdcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0RnJhbWV3b3JrLndhcm4oJ0lnbm9yaW5nIGludmFsaWQgJyArIHR5cGUgKyAnIDo6ICcgKyBwcm9wZXJ0aWVzW3R5cGVdKTtcblx0XHRcdFx0ZGVsZXRlIHByb3BlcnRpZXNbdHlwZV07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgdGhhdCB0aGlzLmNvbGxlY3Rpb24gaXMgYWN0dWFsbHkgYW4gaW5zdGFuY2Ugb2YgQmFja2JvbmUuQ29sbGVjdGlvblxuXHRcdC8vIGFuZCB0aGF0IHRoaXMubW9kZWwgaXMgYWN0dWFsbHkgYW4gaW5zdGFuY2Ugb2YgQmFja2JvbmUuTW9kZWxcblx0XHRfdmFsaWRhdGVCYWNrYm9uZUluc3RhbmNlKCdtb2RlbCcpO1xuXHRcdF92YWxpZGF0ZUJhY2tib25lSW5zdGFuY2UoJ2NvbGxlY3Rpb24nKTtcblxuXHRcdC8vIENsb25lIHByb3BlcnRpZXMgdG8gYXZvaWQgaW5hZHZlcnRlbnQgbW9kaWZpY2F0aW9uc1xuXHRcdHJldHVybiBfLmNsb25lKHByb3BlcnRpZXMpO1xuXHR9XG5cblx0ZWxzZSByZXR1cm4ge307XG5cbn1cbiIsIi8qKlxuICogUnVuIGRlZmluaXRpb24gbWV0aG9kcyB0byBnZXQgYWN0dWFsIGNvbXBvbmVudCBkZWZpbml0aW9ucy5cbiAqIFRoaXMgaXMgZGVmZXJyZWQgdG8gYXZvaWQgaGF2aW5nIHRvIHVzZSBCYWNrYm9uZSdzIGZ1bmN0aW9uICgpIHt9IGFwcHJvYWNoIGZvciB0aGluZ3NcbiAqIGxpa2UgY29sbGVjdGlvbnMuXG4gKi9cblxuLyoqXG4gKiBCdWlsZCB1cHMgYSBjb21wb25lbnQgZGVmaW5pdGlvbiBieSBydW5uaW5nIHRoZSBkZWZpbml0aW9uLiBXZSB0aGVuIGxpbmsgdGhlXG4gKiBjb21wb25lbnQgZGVmaW5pdGlvbiB0byBhbiBpZGVudGlmaWVyIGluIGBGUkFNRVdPUksuY29tcG9uZW50c2AuXG4gKlxuICogQHBhcmFtICB7T2JqZWN0fSBjb21wb25lbnQgW09iamVjdCBjb250YWluaW5nIHRoZSBkZWZpbml0aW9uIGZ1bmN0aW9uIG9mIHRoZSBjb21wb25lbnRdXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYnVpbGRDb21wb25lbnREZWZpbml0aW9uKGNvbXBvbmVudCkge1xuXHR2YXIgY29tcG9uZW50RGVmID0gY29tcG9uZW50LmRlZmluaXRpb24oKTtcblxuXHRpZiAoY29tcG9uZW50LmlkT3ZlcnJpZGUpIHtcblx0XHRpZiAoY29tcG9uZW50RGVmLmlkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoY29tcG9uZW50LmlkT3ZlcnJpZGUgKyAnOjogQ2Fubm90IHNwZWNpZnkgYW4gaWRPdmVycmlkZSBpbiAuZGVmaW5lKCkgaWYgYW4gaWQgcHJvcGVydHkgKCcrY29tcG9uZW50RGVmLmlkKycpIGlzIGFscmVhZHkgc2V0IGluIHlvdXIgY29tcG9uZW50IGRlZmluaXRpb24hXFxuVXNhZ2U6IC5kZWZpbmUoW2lkT3ZlcnJpZGVdLCBkZWZpbml0aW9uKScpO1xuXHRcdH1cblx0XHRjb21wb25lbnREZWYuaWQgPSBjb21wb25lbnQuaWRPdmVycmlkZTtcblx0fVxuXHRpZiAoIWNvbXBvbmVudERlZi5pZCkge1xuXHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IHVzZSAuZGVmaW5lKCkgd2l0aG91dCBkZWZpbmluZyBhbiBpZCBwcm9wZXJ0eSBvciBvdmVycmlkZSBpbiB5b3VyIGNvbXBvbmVudCFcXG5Vc2FnZTogLmRlZmluZShbaWRPdmVycmlkZV0sIGRlZmluaXRpb24pJyk7XG5cdH1cblx0RlJBTUVXT1JLLmNvbXBvbmVudHNbY29tcG9uZW50RGVmLmlkXSA9IGNvbXBvbmVudERlZjtcbn07XG4iLCIvKipcbiAqIE9wdGlvbmFsIG1ldGhvZCB0byByZXF1aXJlIGFwcCBjb21wb25lbnRzLiBSZXF1aXJlLmpzIGNhbiBiZSB1c2VkIGluc3RlYWRcbiAqIGFzIG5lZWRlZC5cbiAqXG4gKiBAcGFyYW0gIHtTdHJpbmd9IFx0WyhvcHRpb25hbCkgQ29tcG9uZW50IGlkIG92ZXJyaWRlXVxuICogQHBhcmFtICB7RnVuY3Rpb259IFtGdW5jdGlvbiBEZWZpbml0aW9uIG9mIGNvbXBvbmVudF1cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBkZWZpbmUoaWQsIGRlZmluaXRpb25Gbikge1xuXHQvLyBJZCBwYXJhbSBpcyBvcHRpb25hbFxuXHRpZiAoIWRlZmluaXRpb25Gbikge1xuXHRcdGRlZmluaXRpb25GbiA9IGlkO1xuXHRcdGlkID0gbnVsbDtcblx0fVxuXG5cdEZSQU1FV09SSy5fZGVmaW5lUXVldWUucHVzaCh7XG5cdFx0ZGVmaW5pdGlvbjogZGVmaW5pdGlvbkZuLFxuXHRcdGlkT3ZlcnJpZGU6IGlkXG5cdH0pO1xufTtcbiIsIi8qKlxuICogTWFzdCBidWlsZCBmaWxlLiBUaGUgbWFpbiBmaWxlXG4gKi9cblxudmFyIGRlZmluZSA9IHJlcXVpcmUoJy4vZGVmaW5lL2luZGV4Jyk7XG52YXIgUmVnaW9uID0gcmVxdWlyZSgnLi9yZWdpb24vaW5kZXgnKTtcbnZhciBDb21wb25lbnQgPSByZXF1aXJlKCcuL2NvbXBvbmVudC9pbmRleCcpO1xudmFyIHJhaXNlID0gcmVxdWlyZSgnLi9yYWlzZS9pbmRleCcpO1xuXG4vKipcbiAqIEZyYW1ld29yayBjbGFzcyBkZWZpbml0aW9uIHRoYXQgd2lsbCBjcmVhdGUgYSBuZXcgZ2xvYmFsIGluc3RhbmNlIG9mIGEgY3VzdG9tIEZyYW1ld29yay5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBbb3B0aW9ucyBoYXNoIHRvIGluaXRpYWxpemUgdGhlIGN1c3RvbSBmcmFtZXdvcmsgd2l0aF1cbiAqL1xudmFyIEZyYW1ld29yayA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcblxuXHQvLyBTZXQgdGhlIGRlZmF1bHQgb3B0aW9ucyBmb3IgdGhvc2Ugbm90IHBhc3NlZCBpbi5cblx0b3B0aW9ucyA9IF8uZGVmYXVsdHMob3B0aW9ucyB8fCB7fSwge1xuXHRcdHRocm90dGxlV2luZG93UmVzaXplOiAyMDAsXG5cdFx0bG9nTGV2ZWw6ICd3YXJuJyxcblx0XHRmcmFtZXdvcmtJZDogJ21hc3QnLFxuXHRcdHByb2R1Y3Rpb246IGZhbHNlLFxuXHRcdGxvZ2dlcjogdW5kZWZpbmVkLFxuXHRcdHNob3J0Y3V0OiB7XG5cdFx0XHR0ZW1wbGF0ZTogdHJ1ZSxcblx0XHRcdGNvdW50OiB0cnVlXG5cdFx0fVxuXHR9KTtcblxuXHQvLyBTZXQgYSBzdGFydGluZyBwb2ludCB0byBCYWNrYm9uZSBhbmQgYWRkIGFkZGl0aW9uYWwgYXR0cmlidXRlLlxuXHRfLmV4dGVuZCh0aGlzLCBCYWNrYm9uZSwge1xuXHRcdG9wdGlvbnM6IG9wdGlvbnMsXG5cdFx0dGVtcGxhdGVzOiB7fSxcblx0XHRjb21wb25lbnRzOiB7fSxcblx0XHRkYXRhOiB7fSxcblx0XHRfZGVmaW5lUXVldWU6IFtdLFxuXHRcdHJlZ2lvbnM6IHt9XG5cdH0pO1xuXG5cdC8qKlxuXHQgKiBFeHRlbmQgRlJBTUVXT1JLLkNvbGxlY3Rpb24gdG8gbWFrZSBpdCBiZXR0ZXJcblx0ICogKHNwZWNpZmljYWxseSwgdG8gYWRkIGVycm9yIGhhbmRsaW5nKVxuXHQgKi9cblx0dmFyIHNlbGYgPSB0aGlzO1xuXHR2YXIgb3JpZ2luYWxDb2xsZWN0aW9uID0gdGhpcy5Db2xsZWN0aW9uO1xuXHR0aGlzLkNvbGxlY3Rpb24gPSBvcmlnaW5hbENvbGxlY3Rpb24uZXh0ZW5kKHtcblxuXHRcdGluaXRpYWxpemU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG5cblx0XHRcdC8vIE92ZXJyaWRlIGBjb2xsZWN0aW9uLmZldGNoKClgXG5cdFx0XHR0aGlzLl9mZXRjaCA9IHRoaXMuZmV0Y2g7XG5cdFx0XHR0aGlzLmZldGNoID0gdGhpc1snX2ZldGNoKysnXTtcblx0XHR9LFxuXG5cblx0XHQvKipcblx0XHQgKiBhZnRlckVycm9yXG5cdFx0ICpcblx0XHQgKiBMaWZlY3ljbGUgY2FsbGJhY2sgdG8gY2F0Y2ggd2hlbiBhIGZldGNoIGVycm9yIG9jY3Vyc1xuXHRcdCAqXG5cdFx0ICogVE9ETzpcblx0XHQgKiBQcm9iYWJseSByZW1vdmUgdGhpcy0tIHJlYXNvbmluZyA6OlxuXHRcdCAqIEluIG1vc3QgY2FzZXMsIHlvdSBhY3R1YWxseSBjYXJlIGFib3V0IHRoZSBlcnJvciBpblxuXHRcdCAqIHRoZSByZWxldmFudCBjb21wb25lbnRzIHdobyBhcmUgdXNpbmcgdGhpcyBjb2xsZWN0aW9uLFxuXHRcdCAqIGluIHdoaWNoIGNhc2UgeW91J2QganVzdCBiaW5kIGFuIGVycm9yIGV2ZW50IGhhbmRsZXIuXG5cdFx0ICovXG5cdFx0YWZ0ZXJFcnJvcjogZnVuY3Rpb24gKGNvbGxlY3Rpb24sIHhociwgb3B0aW9ucykge1xuXHRcdFx0Ly8gdGhpcyBleGlzdHMgZm9yIHlvdSB0byBvdmVycmlkZSBpdCFcblx0XHR9LFxuXG5cblxuXG5cdFx0LyoqXG5cdFx0ICogT3ZlcnJpZGUgQmFja2JvbmUuQ29sbGVjdGlvbidzIGBmZXRjaCgpYFxuXHRcdCAqIHRvIGFsbG93IGZvciBiZXR0ZXIgZXJyb3IgaGFuZGxpbmcuXG5cdFx0ICpcblx0XHQgKiBUT0RPOiBwdWxsIHRoaXMgaW50byBCYWNrYm9uZS5zeW5jIGluc3RlYWQuLlxuXHRcdCAqIG9ubHkgcHJvYmxlbSBpcyBjbGFzaGluZyB3aXRoIG90aGVyIHN5bmMgb3ZlcnJpZGVzXG5cdFx0ICovXG5cdFx0J19mZXRjaCsrJzogZnVuY3Rpb24gKG9wdGlvbnMpIHtcblx0XHRcdHZhciBjb2xsZWN0aW9uID0gdGhpcztcblxuXHRcdFx0b3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cblx0XHRcdC8vIExvZyBhIGZyaWVuZGxpZXIgXCJObyBVUkxcIiBtZXNzYWdlOlxuXHRcdFx0aWYgKCAhY29sbGVjdGlvbi51cmwgKSB7XG5cdFx0XHRcdHNlbGYuZXJyb3IoJ0Nhbm5vdCBmZXRjaCgpICcgKyBjb2xsZWN0aW9uLnR5cGUgKyAnIDo6IENvbGxlY3Rpb24gaGFzIG5vIFVSTCBmdW5jdGlvbi9wcm9wZXJ0eS4uLicpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIE92ZXJyaWRlIGVycm9yIGhhbmRsZXIgdG8gbWl4aW4gYW4gJ2Vycm9yJyBldmVudFxuXHRcdFx0dmFyIG9yaWdpbmFsRXJyb3JIYW5kbGVyID0gb3B0aW9ucy5lcnJvcjtcblx0XHRcdHZhciBvcmlnaW5hbFN1Y2Nlc3NIYW5kbGVyID0gb3B0aW9ucy5zdWNjZXNzO1xuXHRcdFx0Xy5leHRlbmQob3B0aW9ucywge1xuXHRcdFx0XHRzdWNjZXNzOiBmdW5jdGlvbiAoY29sbGVjdGlvbiwgeGhyLCBvcHRpb25zKSB7XG5cdFx0XHRcdFx0dmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuXG5cdFx0XHRcdFx0Ly8gTnVsbCBvdXQgYGNvbGxlY3Rpb24uc3luY2luZ2Bcblx0XHRcdFx0XHRjb2xsZWN0aW9uLnN5bmNpbmcgPSBudWxsO1xuXG5cdFx0XHRcdFx0Ly8gVHJpZ2dlciBvcmlnaW5hbCBzdWNjZXNzIGhhbmRsZXIgaWYgc3BlY2lmaWVkXG5cdFx0XHRcdFx0Ly8gb24gYGZldGNoKHtzdWNjZXNzOiBmdW5jdGlvbigpey8qLi4uKi99fSlgXG5cdFx0XHRcdFx0aWYgKG9yaWdpbmFsU3VjY2Vzc0hhbmRsZXIpIHtcblx0XHRcdFx0XHRcdHJldHVybiBvcmlnaW5hbFN1Y2Nlc3NIYW5kbGVyLmFwcGx5KGNvbGxlY3Rpb24sIGFyZ3MpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0ZXJyb3I6IGZ1bmN0aW9uIChjb2xsZWN0aW9uLCB4aHIsIG9wdGlvbnMpIHtcblx0XHRcdFx0XHR2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG5cblx0XHRcdFx0XHQvLyBOdWxsIG91dCBgY29sbGVjdGlvbi5zeW5jaW5nYFxuXHRcdFx0XHRcdGNvbGxlY3Rpb24uc3luY2luZyA9IG51bGw7XG5cblx0XHRcdFx0XHQvLyBJZiB0aGlzIGlzIGFuIFwiYWJvcnRcIiwgaWdub3JlIGl0LSAoc3RhdGUgaGFzIGFscmVhZHkgYmVlbiB0YWtlbiBjYXJlIG9mKVxuXHRcdFx0XHRcdGlmICggeGhyICYmIHhoci5zdGF0dXNUZXh0PT09J2Fib3J0JyApIHJldHVybjtcblxuXHRcdFx0XHRcdC8vIFNldCBgY29sbGVjdGlvbi5lcnJvcmAgdXNpbmcgdGhlIHJlc3BvbnNlIGZyb20gdGhlIGZldGNoXG5cdFx0XHRcdFx0Ly8gKHRyeSBqc29uLCB0aGVuIHJlc3BvbnNlIHRleHQsIHRoZW4gc3RhdHVzIGNvZGUsIHRoZW4ganVzdCBkZWZhdWx0IHRvIGB0cnVlYClcblx0XHRcdFx0XHRjb2xsZWN0aW9uLmVycm9yID1cblx0XHRcdFx0XHRcdCggeGhyICYmIHhoci5yZXNwb25zZUpTT04gKSA/IHhoci5yZXNwb25zZUpTT04gOlxuXHRcdFx0XHRcdFx0KCB4aHIgJiYgeGhyLnJlc3BvbnNlVGV4dCApID8geGhyLnJlc3BvbnNlVGV4dCA6XG5cdFx0XHRcdFx0XHR0cnVlO1xuXG5cblx0XHRcdFx0XHQvLyBDYWxsIGBhZnRlckVycm9yKClgXG5cdFx0XHRcdFx0Y29sbGVjdGlvbi5hZnRlckVycm9yLmFwcGx5KGNvbGxlY3Rpb24sYXJncyk7XG5cblx0XHRcdFx0XHQvLyBUcmlnZ2VyIG9yaWdpbmFsIGVycm9yIGhhbmRsZXIgaWYgc3BlY2lmaWVkXG5cdFx0XHRcdFx0Ly8gb24gYGZldGNoKHtlcnJvcjogZnVuY3Rpb24oKXsvKi4uLiovfX0pYFxuXHRcdFx0XHRcdGlmIChvcmlnaW5hbEVycm9ySGFuZGxlcikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG9yaWdpbmFsRXJyb3JIYW5kbGVyLmFwcGx5KGNvbGxlY3Rpb24sIGFyZ3MpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIE51bGwgb3V0IGBjb2xsZWN0aW9uLmVycm9yYFxuXHRcdFx0Y29sbGVjdGlvbi5lcnJvciA9IG51bGw7XG5cblx0XHRcdC8vIElmIGBmZXRjaGAgaXMgYWxyZWFkeSBpbiBwcm9ncmVzcywgY2FuY2VsIGl0XG5cdFx0XHQvLyBhbmQgZmlyZSBvZmYgYSBuZXcgb25lLlxuXHRcdFx0aWYgKGNvbGxlY3Rpb24uc3luY2luZykge1xuXHRcdFx0XHRzZWxmLmxvZygnQWJvcnRpbmcgcnVubmluZyBgZmV0Y2goKWAgaW4gb3JkZXIgdG8gc3RhcnQgYSBuZXcgYGZldGNoKClgLi4uJyk7XG5cdFx0XHRcdGNvbGxlY3Rpb24uc3luY2luZy5hYm9ydCgpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDYWxsIG9yaWdpbmFsIGBmZXRjaCgpYCB1c2luZyBvdXIgbW9ua2V5LXBhdGNoZWQgb3B0aW9uc1xuXHRcdFx0dmFyIHhociA9IGNvbGxlY3Rpb24uX2ZldGNoKG9wdGlvbnMpO1xuXG5cdFx0XHQvLyBTZXQgYGNvbGxlY3Rpb24uc3luY2luZ2AgdG8gdGhlIFhIUiBvYmplY3QgaW4gdXNlXG5cdFx0XHRjb2xsZWN0aW9uLnN5bmNpbmcgPSB4aHI7XG5cblx0XHRcdC8vIFJldHVybiB0aGUgWEhSIG9iamVjdCB0byBtYWludGFpbiBvcmlnaW5hbCBgQmFja2JvbmUuQ29sbGVjdGlvbi5mZXRjaCgpYCBBUElcblx0XHRcdHJldHVybiB4aHI7XG5cdFx0fVxuXG5cdH0pO1xuXG5cblx0Ly8gVGhyb3VnaG91dCB0aGUgc291cmNlIGNvZGUsIHRoZXJlIGFyZSBvcGVyYXRpb25zIG9uIGBGUkFNRVdPUktgIG9yIGNvZGUgdGhhdCBhY2Nlc3Nlc1xuXHQvLyBpdHMgYXR0cmlidXRlcy4gU28gd2UgbWFrZSBgRlJBTUVXT1JLYCBhY2Nlc3NpYmxlLlxuXHQvL1xuXHQvLyBOb3RlOlxuXHQvLyBgRlJBTUVXT1JLYCB3aWxsIG9ubHkgYmUgYSBnbG9iYWwgdmFyaWFibGUgKiogZHVyaW5nIHRoZSBidWlsZCAqKlxuXHRGUkFNRVdPUksgPSB0aGlzO1xuXG5cbn07XG5cbi8vIEZyYW1ld29yayBwcm90b3R5cGUgbWV0aG9kcy5cbkZyYW1ld29yay5wcm90b3R5cGUuUmVnaW9uID0gUmVnaW9uO1xuRnJhbWV3b3JrLnByb3RvdHlwZS5Db21wb25lbnQgPSBDb21wb25lbnQ7XG5GcmFtZXdvcmsucHJvdG90eXBlLmRlZmluZSA9IGRlZmluZTtcbkZyYW1ld29yay5wcm90b3R5cGUucmFpc2UgPSByYWlzZTtcblxuXG5cbi8vIEV4cG9zZSBpbnN0YW50aWF0ZWQgZnJhbWV3b3JrIHZpYSBVTUQ6XG52YXIgZnJhbWV3b3JrID0gbmV3IEZyYW1ld29yaygpO1xubW9kdWxlLmV4cG9ydHMgPSBmcmFtZXdvcms7XG5cbiIsIi8qKlxuICpcdExvZ2dldCBjb25zdHJ1Y3RvciBtZXRob2QgdGhhdCB3aWxsIHNldHVwIEZSQU1FV09SSyB0byBsb2cgbWVzc2FnZXMuXG4gKi9cblxudmFyIHNldHVwTG9nZ2VyID0gcmVxdWlyZSgnLi9zZXR1cCcpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIExvZ2dlcigpIHtcblxuXHQvLyBVcG9uIGluaXRpYWxpemF0aW9uLCBzZXR1cCBsb2dnZXJcblx0c2V0dXBMb2dnZXIoRlJBTUVXT1JLLm9wdGlvbnMubG9nTGV2ZWwpO1xuXG5cdC8vIEluIHN1cHBvcnRlZCBicm93c2VycywgYWxzbyBydW4gc2V0dXBMb2dnZXIgYWdhaW5cblx0Ly8gd2hlbiBGUkFNRVdPUksubG9nTGV2ZWwgaXMgc2V0IGJ5IHRoZSB1c2VyXG5cdC8vIFRPRE86IGZpbmQgYSB3YXkgdG8gZG8gdGhpcyB3aXRob3V0IGRlcGVuZGluZyBvbiBfX2RlZmluZVNldHRlcl9fLlxuXHRpZiAoXy5pc0Z1bmN0aW9uKEZSQU1FV09SSy5fX2RlZmluZVNldHRlcl9fKSkge1xuXHRcdEZSQU1FV09SSy5fX2RlZmluZVNldHRlcl9fKCdsb2dMZXZlbCcsIGZ1bmN0aW9uIG9uQ2hhbmdlIChuZXdMb2dMZXZlbCkge1xuXHRcdFx0c2V0dXBMb2dnZXIobmV3TG9nTGV2ZWwpO1xuXHRcdH0pO1xuXHR9XG59O1xuIiwiLyoqXG4gKiBTZXQgdXAgdGhlIGxvZyBmdW5jdGlvbnM6XG4gKlxuICogRlJBTUVXT1JLLmVycm9yXG4gKiBGUkFNRVdPUksud2FyblxuICogRlJBTUVXT1JLLmxvZ1xuICogRlJBTUVXT1JLLmRlYnVnICgqbGVnYWN5KVxuICogRlJBTUVXT1JLLnZlcmJvc2VcbiAqXG4gKiBAcGFyYW0gIHtTdHJpbmd9IGxvZ0xldmVsIFtUaGUgZGVzaXJlZCBsb2cgbGV2ZWwgb2YgdGhlIExvZ2dlcl1cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBzZXR1cExvZ2dlciAobG9nTGV2ZWwpIHtcblxuXHR2YXIgbm9vcCA9IGZ1bmN0aW9uICgpIHt9O1xuXG5cdC8vIElmIGxvZyBpcyBzcGVjaWZpZWQsIHVzZSBpdCwgb3RoZXJ3aXNlIHVzZSB0aGUgY29uc29sZVxuXHRpZiAoRlJBTUVXT1JLLmxvZ2dlcikge1xuXHRcdEZSQU1FV09SSy5lcnJvciAgICAgPSBGUkFNRVdPUksubG9nZ2VyLmVycm9yO1xuXHRcdEZSQU1FV09SSy53YXJuICAgICAgPSBGUkFNRVdPUksubG9nZ2VyLndhcm47XG5cdFx0RlJBTUVXT1JLLmxvZyAgICAgICA9IEZSQU1FV09SSy5sb2dnZXIuZGVidWcgfHwgRlJBTUVXT1JLLmxvZ2dlcjtcblx0XHRGUkFNRVdPUksudmVyYm9zZSAgID0gRlJBTUVXT1JLLmxvZ2dlci52ZXJib3NlO1xuXHR9XG5cblx0Ly8gSW4gSUUsIHdlIGNhbid0IGRlZmF1bHQgdG8gdGhlIGJyb3dzZXIgY29uc29sZSBiZWNhdXNlIHRoZXJlIElTIE5PIEJST1dTRVIgQ09OU09MRVxuXHRlbHNlIGlmICh0eXBlb2YgY29uc29sZSAhPT0gJ3VuZGVmaW5lZCcpIHtcblxuXHRcdC8vIFdlIGNhbm5vdCBjYWxsZWQgdGhlIC5iaW5kIG1ldGhvZCBvbiB0aGUgY29uc29sZSBtZXRob2RzLiBXZSBhcmUgaW4gaWUgOSBvciA4LCBqdXN0IG1ha2Vcblx0XHQvLyBldmVyeWh0aW5nIGEgbm9vcC5cblx0XHRpZiAoXy5pc1VuZGVmaW5lZChjb25zb2xlLmxvZy5iaW5kKSkgIHtcblx0XHRcdEZSQU1FV09SSy5lcnJvciAgICAgPSBub29wO1xuXHRcdFx0RlJBTUVXT1JLLndhcm4gICAgICA9IG5vb3A7XG5cdFx0XHRGUkFNRVdPUksubG9nICAgICAgID0gbm9vcDtcblx0XHRcdEZSQU1FV09SSy5kZWJ1ZyAgICAgPSBub29wO1xuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UgICA9IG5vb3A7XG5cdFx0fVxuXG5cdFx0Ly8gV2UgYXJlIGluIGEgZnJpZW5kbHkgYnJvd3NlciBsaWtlIENocm9tZSwgRmlyZWZveCwgb3IgSUUxMFxuXHRcdGVsc2Uge1xuXHRcdFx0RlJBTUVXT1JLLmVycm9yXHRcdD0gY29uc29sZS5lcnJvciAmJiBjb25zb2xlLmVycm9yLmJpbmQoY29uc29sZSk7XG5cdFx0XHRGUkFNRVdPUksud2Fyblx0XHQ9IGNvbnNvbGUud2FybiAmJiBjb25zb2xlLndhcm4uYmluZChjb25zb2xlKTtcblx0XHRcdEZSQU1FV09SSy5sb2dcdFx0XHQ9IGNvbnNvbGUuZGVidWcgJiYgY29uc29sZS5kZWJ1Zy5iaW5kKGNvbnNvbGUpO1xuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2VcdD0gY29uc29sZS5sb2cgJiYgY29uc29sZS5sb2cuYmluZChjb25zb2xlKTtcblxuXHRcdFx0Ly8gVXNlIGxvZyBsZXZlbCBjb25maWcgaWYgcHJvdmlkZWRcblx0XHRcdHN3aXRjaCAobG9nTGV2ZWwpIHtcblx0XHRcdFx0Y2FzZSAndmVyYm9zZSc6IGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgJ2RlYnVnJzpcblx0XHRcdFx0XHRGUkFNRVdPUksudmVyYm9zZSA9IG5vb3A7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSAnd2Fybic6XG5cdFx0XHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UgPSBGUkFNRVdPUksubG9nID0gbm9vcDtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlICdlcnJvcic6XG5cdFx0XHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UgPSBGUkFNRVdPUksubG9nID0gRlJBTUVXT1JLLndhcm4gPSBub29wO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgJ3NpbGVudCc6XG5cdFx0XHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UgPSBGUkFNRVdPUksubG9nID0gRlJBTUVXT1JLLndhcm4gPSBGUkFNRVdPUksuZXJyb3IgPSBub29wO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yICgnVW5yZWNvZ25pemVkIGxvZ2dpbmcgbGV2ZWwgY29uZmlnICcgK1xuXHRcdFx0XHRcdCcoJyArIEZSQU1FV09SSy5vcHRpb25zLmZyYW1ld29ya0lkICsgJy5sb2dMZXZlbCA9IFwiJyArIGxvZ0xldmVsICsgJ1wiKScpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTdXBwb3J0IGZvciBgZGVidWdgIGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eVxuXHRcdFx0RlJBTUVXT1JLLmRlYnVnID0gRlJBTUVXT1JLLmxvZztcblxuXHRcdFx0Ly8gVmVyYm9zZSBzcGl0cyBvdXQgbG9nIGxldmVsXG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZSgnTG9nIGxldmVsIHNldCB0byA6OiAnLCBsb2dMZXZlbCk7XG5cdFx0fVxuXHR9XG59XG4iLCIvKipcbiAqIEdpdmVuIGEgY29tcG9uZW50IGRlZmluaXRpb24gYW5kIGl0cyBrZXksIHdlIHdpbGwgYnVpbGQgdXAgdGhlIGNvbXBvbmVudCBwcm90b3R5cGUgYW5kIG1lcmdlXG4gKiB0aGlzIGNvbXBvbmVudCB3aXRoIGl0cyBtYXRjaGluZyB0ZW1wbGF0ZS5cbiAqXG4gKiBAcGFyYW0gIHtPYmplY3R9IGNvbXBvbmVudERlZiBbT2JqZWN0IGNvbnRhaW5pbmcgdGhlIGNvbXBvbmVudCBkZWZpbml0aW9uXVxuICogQHBhcmFtICB7U3RyaW5nfSBjb21wb25lbnRLZXkgW1RoZSBjb21wb25lbnQgaWRlbnRpZmllcl1cbiAqL1xuXG52YXIgdHJhbnNsYXRlU2hvcnRoYW5kID0gcmVxdWlyZSgnLi4vdXRpbHMvc2hvcnRoYW5kJyk7XG52YXIgb2JqTWFwID0gcmVxdWlyZSgnLi4vdXRpbHMvb2JqTWFwJyk7XG52YXIgRXZlbnRzID0gcmVxdWlyZSgnLi4vdXRpbHMvZXZlbnRzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYnVpbGRDb21wb25lbnRQcm90b3R5cGUoY29tcG9uZW50RGVmLCBjb21wb25lbnRLZXkpIHtcblxuXHQvLyBJZiBjb21wb25lbnQgaWQgaXMgbm90IGV4cGxpY2l0bHkgc2V0LCB1c2UgdGhlIGNvbXBvbmVudEtleVxuXHRpZiAoIWNvbXBvbmVudERlZi5pZCkge1xuXHRcdGNvbXBvbmVudERlZi5pZCA9IGNvbXBvbmVudEtleTtcblx0fVxuXG5cdC8vIFNlYXJjaCB0ZW1wbGF0ZXNcblx0dmFyIHRlbXBsYXRlID0gRlJBTUVXT1JLLnRlbXBsYXRlc1tjb21wb25lbnREZWYuaWRdO1xuXG5cdC8vIElmIG5vIG1hdGNoIGZvciBjb21wb25lbnQgd2FzIGZvdW5kwqBpbiB0ZW1wbGF0ZXMsIGlzc3VlIGEgd2FybmluZ1xuXHRpZiAoIXRlbXBsYXRlKSB7XG5cdFx0cmV0dXJuIEZSQU1FV09SSy53YXJuKFxuXHRcdFx0Y29tcG9uZW50RGVmLmlkICsgJyA6OiBObyB0ZW1wbGF0ZSBmb3VuZCBmb3IgY29tcG9uZW50IScgK1xuXHRcdFx0J1xcblRlbXBsYXRlcyBkb25cXCd0IG5lZWQgYSBjb21wb25lbnQgdW5sZXNzIHlvdSB3YW50IGludGVyYWN0aXZpdHksICcgK1xuXHRcdFx0J2V2ZXJ5IGNvbXBvbmVudCAqc2hvdWxkKiBoYXZlIGEgbWF0Y2hpbmcgdGVtcGxhdGUhIScgK1xuXHRcdFx0J1xcblVzaW5nIGNvbXBvbmVudHMgd2l0aG91dCB0ZW1wbGF0ZXMgbWF5IHNlZW0gbmVjZXNzYXJ5LCAnICtcblx0XHRcdCdidXQgaXRcXCdzIG5vdC4gIEl0IG1ha2VzIHlvdXIgdmlldyBsb2dpYyBpbmNvcnBvcmVhbCwgYW5kIG1ha2VzIHlvdXIgY29sbGVhZ3VlcyAnICtcblx0XHRcdCd1bmNvbWZvcnRhYmxlLicpO1xuXHR9XG5cblx0Ly8gU2F2ZSByZWZlcmVuY2UgdG8gdGVtcGxhdGUgaW4gY29tcG9uZW50IHByb3RvdHlwZVxuXHRGUkFNRVdPUksudmVyYm9zZShjb21wb25lbnREZWYuaWQgKyAnIDo6IFBhaXJpbmcgY29tcG9uZW50IHdpdGggdGVtcGxhdGUuLi4nKTtcblx0Y29tcG9uZW50RGVmLnRlbXBsYXRlID0gdGVtcGxhdGU7XG5cblx0Ly8gVHJhbnNsYXRlIHJpZ2h0LWhhbmQgc2hvcnRoYW5kIGZvciB0b3AtbGV2ZWwga2V5c1xuXHRjb21wb25lbnREZWYgPSBvYmpNYXAoY29tcG9uZW50RGVmLCB0cmFuc2xhdGVTaG9ydGhhbmQpO1xuXG5cblx0Ly8gYW5kIGV2ZW50cyBvYmplY3Rcblx0aWYgKGNvbXBvbmVudERlZi5ldmVudHMpIHtcblx0XHRjb21wb25lbnREZWYuZXZlbnRzID0gb2JqTWFwKFxuXHRcdFx0Y29tcG9uZW50RGVmLmV2ZW50cyxcblx0XHRcdHRyYW5zbGF0ZVNob3J0aGFuZFxuXHRcdCk7XG5cdH1cblxuXHQvLyBhbmQgYWZ0ZXJDaGFuZ2UgYmluZGluZ3Ncblx0aWYgKF8uaXNPYmplY3QoY29tcG9uZW50RGVmLmFmdGVyQ2hhbmdlKSAmJiAhXy5pc0Z1bmN0aW9uKGNvbXBvbmVudERlZi5hZnRlckNoYW5nZSkpIHtcblx0XHRjb21wb25lbnREZWYuYWZ0ZXJDaGFuZ2UgPSBvYmpNYXAoXG5cdFx0XHRjb21wb25lbnREZWYuYWZ0ZXJDaGFuZ2UsXG5cdFx0XHR0cmFuc2xhdGVTaG9ydGhhbmRcblx0XHQpO1xuXHR9XG5cblx0Ly8gR28gYWhlYWQgYW5kIHR1cm4gdGhlIGRlZmluaXRpb24gaW50byBhIHJlYWwgY29tcG9uZW50IHByb3RvdHlwZVxuXHRGUkFNRVdPUksudmVyYm9zZShjb21wb25lbnREZWYuaWQgKyAnIDo6IEJ1aWxkaW5nIGNvbXBvbmVudCBwcm90b3R5cGUuLi4nKTtcblx0dmFyIGNvbXBvbmVudFByb3RvdHlwZSA9IEZSQU1FV09SSy5Db21wb25lbnQuZXh0ZW5kKGNvbXBvbmVudERlZik7XG5cblx0Ly8gRGlzY292ZXIgc3Vic2NyaXB0aW9uc1xuXHRjb21wb25lbnRQcm90b3R5cGUucHJvdG90eXBlLnN1YnNjcmlwdGlvbnMgPSB7fTtcblxuXHQvLyBJdGVyYXRlIHRocm91Z2ggZWFjaCBwcm9wZXJ0eSBvbiB0aGlzIGNvbXBvbmVudCBwcm90b3R5cGVcblx0Xy5lYWNoKGNvbXBvbmVudFByb3RvdHlwZS5wcm90b3R5cGUsIGZ1bmN0aW9uIChoYW5kbGVyLCBrZXkpIHtcblxuXHRcdC8vIERldGVjdCBET00gZXZlbnRzIGFuZCBzbWFzaCB0aGVtIGludG8gdGhlIGV2ZW50cyBoYXNoXG5cdFx0dmFyIG1hdGNoZWRET01FdmVudHMgPSBrZXkubWF0Y2goRXZlbnRzWycvRE9NRXZlbnQvJ10pO1xuXHRcdGlmIChtYXRjaGVkRE9NRXZlbnRzKSB7XG5cdFx0XHR2YXIgZXZlbnROYW1lID0gbWF0Y2hlZERPTUV2ZW50c1sxXTtcblx0XHRcdHZhciBkZWxlZ2F0ZVNlbGVjdG9yID0gbWF0Y2hlZERPTUV2ZW50c1szXTtcblxuXHRcdFx0Ly8gU3RvdyB0aGVtIGluIGV2ZW50cyBoYXNoXG5cdFx0XHRjb21wb25lbnRQcm90b3R5cGUucHJvdG90eXBlLmV2ZW50cyA9IGNvbXBvbmVudFByb3RvdHlwZS5wcm90b3R5cGUuZXZlbnRzIHx8IHt9O1xuXHRcdFx0Y29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZS5ldmVudHNba2V5XSA9IGhhbmRsZXI7XG5cdFx0fVxuXG5cdFx0Ly8gQWRkIGFwcCBldmVudHMgKCUpLCByb3V0ZXMgKCMpLCBhbmQgZGF0YSBsaXN0ZW5lcnMgKH4pIHRvIHN1YnNjcmlwdGlvbnMgaGFzaFxuXHRcdGlmIChrZXkubWF0Y2goL14oJXwjfH4pLykpIHtcblx0XHRcdGlmIChfLmlzU3RyaW5nKGhhbmRsZXIpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihjb21wb25lbnREZWYuaWQgKyAnOjogSW52YWxpZCBsaXN0ZW5lciBmb3Igc3Vic2NyaXB0aW9uOiAnICsga2V5ICsgJy5cXG4nICtcblx0XHRcdFx0XHQnRGVmaW5lIHlvdXIgY2FsbGJhY2sgd2l0aCBhbiBhbm9ueW1vdXMgZnVuY3Rpb24gaW5zdGVhZCBvZiBhIHN0cmluZy4nXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIV8uaXNGdW5jdGlvbihoYW5kbGVyKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoY29tcG9uZW50RGVmLmlkICsnOjogSW52YWxpZCBsaXN0ZW5lciBmb3Igc3Vic2NyaXB0aW9uOiAnICsga2V5KTtcblx0XHRcdH1cblx0XHRcdGNvbXBvbmVudFByb3RvdHlwZS5wcm90b3R5cGUuc3Vic2NyaXB0aW9uc1trZXldID0gaGFuZGxlcjtcblx0XHR9XG5cblx0XHQvLyBFeHRlbmQgb25lIG9yIG1vcmUgb3RoZXIgY29tcG9uZW50c1xuXHRcdGVsc2UgaWYgKGtleSA9PT0gJ2V4dGVuZENvbXBvbmVudHMnKSB7XG5cdFx0XHR2YXIgb2JqVG9NZXJnZSA9IHt9O1xuXHRcdFx0Xy5lYWNoKGhhbmRsZXIsIGZ1bmN0aW9uKGNoaWxkSWQpe1xuXG5cdFx0XHRcdGlmICghRlJBTUVXT1JLLmNvbXBvbmVudHNbY2hpbGRJZF0pe1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihcblx0XHRcdFx0XHRjb21wb25lbnREZWYuaWQgKyAnIDo6ICcgK1xuXHRcdFx0XHRcdCdUcnlpbmcgdG8gZGVmaW5lL2V4dGVuZCB0aGlzIGNvbXBvbmVudCBmcm9tIGAnICsgY2hpbGRJZCArICdgLCAnICtcblx0XHRcdFx0XHQnYnV0IG5vIGNvbXBvbmVudCB3aXRoIHRoYXQgaWQgY2FuIGJlIGZvdW5kLidcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Xy5leHRlbmQob2JqVG9NZXJnZSwgRlJBTUVXT1JLLmNvbXBvbmVudHNbY2hpbGRJZF0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdF8uZGVmYXVsdHMoY29tcG9uZW50UHJvdG90eXBlLnByb3RvdHlwZSwgb2JqVG9NZXJnZSk7XG5cdFx0fVxuXHR9KTtcblxuXHQvLyBTYXZlIHByb3RvdHlwZSBpbiBnbG9iYWwgc2V0IGZvciB0cmFja2luZ1xuXHRGUkFNRVdPUksuY29tcG9uZW50c1tjb21wb25lbnREZWYuaWRdID0gY29tcG9uZW50UHJvdG90eXBlO1xufTtcbiIsIi8qKlxuICogQ29sbGVjdCBhbnkgcmVnaW9ucyB3aXRoIHRoZSBkZWZhdWx0IGNvbXBvbmVudCBzZXQgZnJvbSB0aGUgRE9NLlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY29sbGVjdFJlZ2lvbnMgKCkge1xuXG5cdC8vIFByb3ZpZGUgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkgZm9yIGxlZ2FjeSBub3RhdGlvblxuXHQkKCdyZWdpb25bZGVmYXVsdF0scmVnaW9uW3RlbXBsYXRlXSxbZGF0YS1yZWdpb25dW2RlZmF1bHRdLFtkYXRhLXJlZ2lvbl1bdGVtcGxhdGVdJykuZWFjaChmdW5jdGlvbigpIHtcblx0XHQkZSA9ICQodGhpcyk7XG5cdFx0dmFyIGNvbXBvbmVudElkID0gJGUuYXR0cignZGVmYXVsdCcpIHx8ICRlLmF0dHIoJ3RlbXBsYXRlJyk7XG5cdFx0JGUuYXR0cignY29udGVudHMnLCBjb21wb25lbnRJZCk7XG5cdH0pO1xuXG5cdC8vIE5vdyBpbnN0YW50aWF0ZSB0aGUgYXBwcm9wcmlhdGUgZGVmYXVsdCBjb21wb25lbnQgaW4gZWFjaFxuXHQvLyByZWdpb24gd2l0aCBhIHNwZWNpZmllZCB0ZW1wbGF0ZS9jb21wb25lbnRcblx0JCgncmVnaW9uW2NvbnRlbnRzXSxbZGF0YS1yZWdpb25dW2NvbnRlbnRzXScpLmVhY2goZnVuY3Rpb24oKSB7XG5cdFx0RlJBTUVXT1JLLlJlZ2lvbi5mcm9tRWxlbWVudCh0aGlzKTtcblx0fSk7XG59O1xuIiwiLyoqXG4gKiBMb2FkIGFueSBzY3JpcHQgdGFncyBvbiB0aGUgcGFnZSB3aXRoIHR5cGU9XCJ0ZXh0L3RlbXBsYXRlXCIuXG4gKlxuICogQHJldHVybiB7T2JqZWN0fSBbT2JqZWN0IGNvbnNpc3Rpbmcgb2YgYSB0ZW1wbGF0ZSBpZGVudGlmaWVyIGFuZCBpdHMgSFRNTC5dXG4gKi9cblxudmFyIGVsMk1hc3RJRCA9IHJlcXVpcmUoJy4uL3V0aWxzL2VsMk1hc3RJRCcpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNvbGxlY3RUZW1wbGF0ZXMoKSB7XG5cdHZhciB0ZW1wbGF0ZXMgPSB7fTtcblxuXHQkKCdzY3JpcHRbdHlwZT1cInRleHQvdGVtcGxhdGVcIl0nKS5lYWNoKGZ1bmN0aW9uIChpLCBlbCkge1xuXHRcdHZhciBpZCA9IGVsMk1hc3RJRChlbCwgdHJ1ZSk7XG5cdFx0dGVtcGxhdGVzW2lkXSA9ICQoZWwpLmh0bWwoKTtcblxuXHRcdC8vIFN0cmlwIHdoaXRlc3BhY2UgbGVmdG92ZXIgZnJvbSBzY3JpcHQgdGFnc1xuXHRcdHRlbXBsYXRlc1tpZF0gPSB0ZW1wbGF0ZXNbaWRdLnJlcGxhY2UoL15cXHMrLywnJyk7XG5cdFx0dGVtcGxhdGVzW2lkXSA9IHRlbXBsYXRlc1tpZF0ucmVwbGFjZSgvXFxzKyQvLCcnKTtcblxuXHRcdC8vIFJlbW92ZSBmcm9tIERPTVxuXHRcdCQoZWwpLnJlbW92ZSgpO1xuXHR9KTtcblxuXHRyZXR1cm4gdGVtcGxhdGVzO1xufTtcbiIsIi8qKlxuICogVGhpcyBpcyB0aGUgc3RhcnRpbmcgcG9pbnQgdG8geW91ciBhcHBsaWNhdGlvbi4gIFlvdSBzaG91bGQgZ3JhYiB0ZW1wbGF0ZXMgYW5kIGNvbXBvbmVudHNcbiAqIGJlZm9yZSBjYWxsaW5nIEZSQU1FV09SSy5yYWlzZSgpIHVzaW5nIHNvbWV0aGluZyBsaWtlIFJlcXVpcmUuanMuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnNcblx0XHRkYXRhOiB7IGF1dGhlbnRpY2F0ZWQ6IGZhbHNlIH0sXG5cdFx0dGVtcGxhdGVzOiB7IGNvbXBvbmVudE5hbWU6IEhUTUxPclByZWNvbXBpbGVkRm4gfSxcblx0XHRjb21wb25lbnRzOiB7IGNvbXBvbmVudE5hbWU6IENvbXBvbmVudERlZmluaXRpb24gfVxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2JcbiAqL1xuXG52YXIgTG9nZ2VyID0gcmVxdWlyZSgnLi4vbG9nZ2VyL2luZGV4Jyk7XG52YXIgYnVpbGRDb21wb25lbnREZWZpbml0aW9uID0gcmVxdWlyZSgnLi4vZGVmaW5lL2J1aWxkRGVmaW5pdGlvbicpO1xudmFyIGJ1aWxkQ29tcG9uZW50UHJvdG90eXBlID0gcmVxdWlyZSgnLi9idWlsZFByb3RvdHlwZScpO1xudmFyIGNvbGxlY3RUZW1wbGF0ZXMgPSByZXF1aXJlKCcuL2NvbGxlY3RUZW1wbGF0ZXMnKTtcbnZhciBjb2xsZWN0UmVnaW9ucyA9IHJlcXVpcmUoJy4vY29sbGVjdFJlZ2lvbnMnKTtcbnZhciBzZXR1cFJvdXRlciA9IHJlcXVpcmUoJy4uL3JvdXRlci9pbmRleCcpO1xuXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcmFpc2Uob3B0aW9ucywgY2IpIHtcblxuXHQvLyBJZiBvbmx5IG9uZSBhcmcgaXMgcHJlc2VudCwgdXNlIG9wdGlvbnMgYXMgY2FsbGJhY2sgaWYgcG9zc2libGUuXG5cdC8vIElmIG9wdGlvbnMgYXJlIG5vdCBkZWZpbmVkLCB1c2UgYW4gZW1wdHkgb2JqZWN0LlxuXHRpZiAoIWNiICYmIF8uaXNGdW5jdGlvbihvcHRpb25zKSkge1xuXHRcdGNiID0gb3B0aW9ucztcblx0fVxuXHRpZiAoIV8uaXNQbGFpbk9iamVjdChvcHRpb25zKSkge1xuXHRcdG9wdGlvbnMgPSB7fTtcblx0fVxuXG5cdC8vIEludGVycHJldCBgcHJvZHVjdGlvbmAgYXMgYGxvZ0xldmVsID09PSAnc2lsZW50J2Bcblx0aWYgKEZSQU1FV09SSy5vcHRpb25zLnByb2R1Y3Rpb24pIHtcblx0XHRGUkFNRVdPUksub3B0aW9ucy5sb2dMZXZlbCA9ICdzaWxlbnQnO1xuXHR9XG5cblx0Ly8gSW5pdGlhbGl6ZSBsb2dnZXJcblx0bmV3IExvZ2dlcigpO1xuXG5cdC8vIE1lcmdlIGRhdGEgaW50byBGUkFNRVdPUksuZGF0YVxuXHRfLmV4dGVuZChGUkFNRVdPUksuZGF0YSwgb3B0aW9ucy5kYXRhIHx8IHt9KTtcblxuXHQvLyBNZXJnZSBzcGVjaWZpZWQgdGVtcGxhdGVzIHdpdGggRlJBTUVXT1JLLnRlbXBsYXRlc1xuXHRfLmV4dGVuZChGUkFNRVdPUksudGVtcGxhdGVzLCBvcHRpb25zLnRlbXBsYXRlcyB8fCB7fSk7XG5cblx0Ly8gSWYgRlJBTUVXT1JLLmRlZmluZSgpIHdhcyB1c2VkLCBidWlsZCB0aGUgbGlzdCBvZiBjb21wb25lbnRzXG5cdC8vIEl0ZXJhdGUgdGhyb3VnaCB0aGUgZGVmaW5lIHF1ZXVlIGFuZCBjcmVhdGUgZWFjaCBkZWZpbml0aW9uXG5cdF8uZWFjaChGUkFNRVdPUksuX2RlZmluZVF1ZXVlLCBidWlsZENvbXBvbmVudERlZmluaXRpb24pO1xuXG5cdC8vIE1lcmdlIHNwZWNpZmllZCBjb21wb25lbnRzIHcvIEZSQU1FV09SSy5jb21wb25lbnRzXG5cdF8uZXh0ZW5kKEZSQU1FV09SSy5jb21wb25lbnRzLCBvcHRpb25zLmNvbXBvbmVudHMgfHwge30pO1xuXG5cdC8vIEJhY2sgdXAgZWFjaCBjb21wb25lbnQgZGVmaW5pdGlvbiBiZWZvcmUgdHJhbnNmb3JtaW5nIGl0IGludG8gYSBsaXZlIHByb3RvdHlwZVxuXHRGUkFNRVdPUksuY29tcG9uZW50RGVmcyA9IF8uY2xvbmUoRlJBTUVXT1JLLmNvbXBvbmVudHMpO1xuXG5cdC8vIFJ1biB0aGlzIGNhbGwgYmFjayB3aGVuIHRoZSBET00gaXMgcmVhZHlcblx0JChmdW5jdGlvbiAoKSB7XG5cblx0XHQvLyBDb2xsZWN0IGFueSA8c2NyaXB0PiB0YWcgdGVtcGxhdGVzIG9uIHRoZSBwYWdlXG5cdFx0Ly8gYW5kIGFic29yYiB0aGVtIGludG8gRlJBTUVXT1JLLnRlbXBsYXRlc1xuXHRcdF8uZXh0ZW5kKEZSQU1FV09SSy50ZW1wbGF0ZXMsIGNvbGxlY3RUZW1wbGF0ZXMoKSk7XG5cblx0XHQvLyBCdWlsZCBhY3R1YWwgcHJvdG90eXBlcyBmb3IgdGhlIGNvbXBvbmVudHNcblx0XHQvLyAobmVlZCB0aGUgdGVtcGxhdGVzIGF0IHRoaXMgcG9pbnQgdG8gbWFrZSB0aGlzIHdvcmspXG5cdFx0Xy5lYWNoKEZSQU1FV09SSy5jb21wb25lbnRzLCBidWlsZENvbXBvbmVudFByb3RvdHlwZSk7XG5cblx0XHQvLyBHcmFiIGluaXRpYWwgcmVnaW9ucyBmcm9tIERPTVxuXHRcdGNvbGxlY3RSZWdpb25zKCk7XG5cblx0XHQvLyBCaW5kIGdsb2JhbCBET00gZXZlbnRzIGFzIEZSQU1FV09SSyBldmVudHNcblx0XHQvLyAoZS5nLiAld2luZG93OnJlc2l6ZSlcblx0XHR2YXIgdHJpZ2dlclJlc2l6ZUV2ZW50ID0gXy5kZWJvdW5jZShmdW5jdGlvbiAoKSB7XG5cdFx0XHRGUkFNRVdPUksudHJpZ2dlcignJXdpbmRvdzpyZXNpemUnKTtcblx0XHR9LCBGUkFNRVdPUksub3B0aW9ucy50aHJvdHRsZVdpbmRvd1Jlc2l6ZSB8fCAwKTtcblx0XHQkKHdpbmRvdykucmVzaXplKHRyaWdnZXJSZXNpemVFdmVudCk7XG5cdFx0Ly8gVE9ETzogYWRkIG1vcmUgZXZlbnRzIGFuZCBleHRyYXBvbGF0ZSB0aGlzIGxvZ2ljIHRvIGEgc2VwYXJhdGUgbW9kdWxlXG5cblx0XHQvLyBEbyB0aGUgaW5pdGlhbCByb3V0aW5nIHNlcXVlbmNlXG5cdFx0Ly8gTG9vayBhdCB0aGUgI2ZyYWdtZW50IHVybCBhbmQgZmlyZSB0aGUgZ2xvYmFsIHJvdXRlIGV2ZW50XG5cdFx0c2V0dXBSb3V0ZXIoKTtcblx0XHRGUkFNRVdPUksuaGlzdG9yeS5zdGFydChfLmRlZmF1bHRzKHtcblx0XHRcdHB1c2hTdGF0ZTogdW5kZWZpbmVkLFxuXHRcdFx0aGFzaENoYW5nZTogdW5kZWZpbmVkLFxuXHRcdFx0cm9vdDogdW5kZWZpbmVkXG5cdFx0fSwgb3B0aW9ucykpO1xuXG5cdFx0aWYgKGNiKSBjYigpO1xuXHR9KTtcbn07XG4iLCIvKipcbiAqIEFwcGVuZCBhIGNvbXBvbmVudCB0byB0aGUgZW5kIG9mIGEgcmVnaW9uLiBUaGlzIGNhbGxzIGluc2VydCBhdCB0aGUgbGFzdCBwb3NpdGlvbi5cbiAqXG4gKiBAcGFyYW0gIHtTdHJpbmd9IGNvbXBvbmVudElkIFtUaGUgY29tcG9uZW50IGlkIHRoYXQgd2Ugd2FudCB0byBhcHBlbmRdXG4gKiBAcGFyYW0gIHtPYmplY3R9IHByb3BlcnRpZXMgIFtQcm9wZXJ0aWVzIHRvIGluc3RhbnRpYXRlIHRoZSBjb21wb25lbnQgd2l0aF1cbiAqXG4gKiBAcmV0dXJuIHtDb21wb25lbnR9ICAgICAgICAgIFtOZXdseSBhcHBlbmRlZCBDb21wb25lbnRdXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYXBwZW5kKGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKSB7XG5cdC8vIEluc2VydCBhdCBsYXN0IHBvc2l0aW9uXG5cdHJldHVybiB0aGlzLmluc2VydCh0aGlzLl9jaGlsZHJlbi5sZW5ndGgsIGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKTtcbn07XG4iLCIvKipcbiAqIFNob3J0Y3V0IGZvciBjYWxsaW5nIGVtcHR5KCkgYW5kIHRoZW4gYXBwZW5kKCksXG4gKiBUaGlzIGlzIHRoZSBnZW5lcmFsIHVzZSBjYXNlIGZvciBtYW5hZ2luZyBzdWJjb21wb25lbnRzXG4gKiAoZS5nLiB3aGVuIGEgbmF2YmFyIGl0ZW0gaXMgdG91Y2hlZClcbiAqXG4gKiBAcGFyYW0gIHtTdHJpbmd9IGNvbXBvbmVudCAgW1RoZSBpZCBuYW1lIG9mIHRoZSBjb21wb25ldCB0aGF0IHlvdSB3YW50IHRvIGF0dGFjaF1cbiAqIEBwYXJhbSAge09iamVjdH0gcHJvcGVydGllcyBbUHJvcGVydGllcyB0aGF0IHRoZSBhdHRhY2hlZCBjb21wb25lbnQgd2lsbCBiZSBpbml0YWxpemVkIHdpdGhdXG4gKlxuICogQHJldHVybiB7Q29tcG9uZW50fSBcdFx0XHRcdCBbTmV3bHkgYXR0YWNoZWQgY29tcG9uZW50XVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGF0dGFjaChjb21wb25lbnQsIHByb3BlcnRpZXMpIHtcblx0dGhpcy5lbXB0eSgpO1xuXHRyZXR1cm4gdGhpcy5hcHBlbmQoY29tcG9uZW50LCBwcm9wZXJ0aWVzKTtcbn07XG4iLCIvKipcbiAqIHJlZ2lvbi5lbXB0eSggKVxuICpcbiAqIEl0ZXJhdGUgb3ZlciBlYWNoIGNvbXBvbmVudCBpbiB0aGlzIHJlZ2lvbiBhbmQgY2FsbCAuY2xvc2UoKSBvbiBpdFxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGVtcHR5KCkge1xuXHRGUkFNRVdPUksuZGVidWcodGhpcy5wYXJlbnQuaWQgKyAnIDo6IEVtcHR5aW5nIHJlZ2lvbjogJyArIHRoaXMuaWQpO1xuXHR3aGlsZSAodGhpcy5fY2hpbGRyZW4ubGVuZ3RoID4gMCkge1xuXHRcdHRoaXMucmVtb3ZlKDApO1xuXHR9XG59O1xuIiwiLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzXG4gKi9cbnZhciBlbDJNYXN0SUQgPSByZXF1aXJlKCcuLi91dGlscy9lbDJNYXN0SUQnKTtcblxuXG5cbi8qKlxuICogRmFjdG9yeSBtZXRob2QgdG8gZ2VuZXJhdGUgYSBuZXcgcmVnaW9uIGluc3RhbmNlIGZyb20gYSBET00gZWxlbWVudFxuICogQWxzbyBpbXBsZW1lbnRzIGB0ZW1wbGF0ZWAgYW5kIGBjb3VudGAgZGlyZWN0aXZlcy5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9uc1xuICogQHJldHVybnMgcmVnaW9uIGluc3RhbmNlXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmcm9tRWxlbWVudChlbCwgcGFyZW50KSB7XG5cblx0Ly8gSWYgcGFyZW50IGlzIG5vdCBzcGVjaWZpZWQsIG1ha2UtYmVsaWV2ZS5cblx0cGFyZW50ID0gcGFyZW50IHx8IHsgaWQ6ICcqJyB9O1xuXG5cdHZhciAkZWwgPSAkKGVsKTtcblxuXHQvLyBCdWlsZCByZWdpb25cblx0dmFyIHJlZ2lvbiA9IG5ldyBGUkFNRVdPUksuUmVnaW9uKHtcblx0XHRpZDogZWwyTWFzdElEKGVsKSxcblx0XHQkZWw6ICRlbCxcblx0XHRwYXJlbnQ6IHBhcmVudFxuXHR9KTtcblxuXHQvLyBJZiB0aGlzIHJlZ2lvbiBoYXMgYSBkZWZhdWx0IGNvbXBvbmVudC90ZW1wbGF0ZSBzZXQsXG5cdC8vIGdyYWIgdGhlIGlkICAtLSAgZS5nLiA8cmVnaW9uIHRlbXBsYXRlPVwiRm9vXCIgLz5cblx0dmFyIGNvbXBvbmVudElkID0gJGVsLmF0dHIoJ3RlbXBsYXRlJykgfHwgJGVsLmF0dHIoJ2RlZmF1bHQnKSB8fCAkZWwuYXR0cignY29udGVudHMnKTtcblxuXG5cdC8vIElmIGB0ZW1wbGF0ZWAgc2hvcnRjdXQgaXMgZW5hYmxlZCwgYXBwZW5kIHNwZWNpZmllZCBzdWItY29tcG9uZW50KHMpXG5cdC8vIHRvIHRoZSByZWdpb24gYXV0b21hdGljYWxseVxuXHRpZiAoIEZSQU1FV09SSy5vcHRpb25zLnNob3J0Y3V0LnRlbXBsYXRlICYmIGNvbXBvbmVudElkICkge1xuXG5cdFx0Ly8gSWYgYGNvdW50YCBpcyBzZXQsIHJlbmRlciBzdWItY29tcG9uZW50IHNwZWNpZmllZCBudW1iZXIgb2YgdGltZXMuXG5cdFx0Ly8gZS5nLiA8cmVnaW9uIHRlbXBsYXRlPVwiRm9vXCIgY291bnQ9XCIzXCIgLz5cblx0XHQvL1xuXHRcdC8vIChOb3RlIHRoYXQgaWYgdGhlIGBjb3VudGAgc2hvcnRjdXQgaXMgZGlzYWJsZWQsIGBjb3VudGAgaXMgYWx3YXlzID0gMSlcblx0XHR2YXIgY291bnQgPSBGUkFNRVdPUksub3B0aW9ucy5zaG9ydGN1dC5jb3VudCA/ICsoJGVsLmF0dHIoJ2NvdW50JykpIDogMTtcblxuXHRcdC8vIEFwcGVuZCB0aGUgc3ViY29tcG9uZW50IHRoZSBhcHByb3ByaWF0ZSAjIG9mIHRpbWVzLlxuXHRcdGZvciAodmFyIGk9MDsgaSA8IGNvdW50OyBpKysgKSB7XG5cdFx0XHRyZWdpb24uYXBwZW5kKGNvbXBvbmVudElkKTtcblx0XHR9XG5cblx0XHRGUkFNRVdPUksuZGVidWcoXG5cdFx0XHRwYXJlbnQuaWQgKyAnIDotOiBJbnN0YW50aWF0ZWTCoG5ldyByZWdpb24nICtcblx0XHRcdCggcmVnaW9uLmlkID8gJyBgJyArIHJlZ2lvbi5pZCArICdgJyA6ICcnICkgK1xuXHRcdFx0KCBjb21wb25lbnRJZCA/ICcgYW5kIHBvcHVsYXRlZCBpdCB3aXRoJyArXG5cdFx0XHRcdCggY291bnQgPiAxID8gY291bnQgKyAnIGluc3RhbmNlcyBvZicgOiAnIDEnICkgK1xuXHRcdFx0XHQnIGAnICsgY29tcG9uZW50SWQgKyAnYCcgOiAnJ1xuXHRcdFx0KSArICcuJ1xuXHRcdCk7XG5cdH1cblxuXHRyZXR1cm4gcmVnaW9uO1xufTtcbiIsIi8qKlxuICogUmVnaW9uc1xuICovXG5cbnZhciBpbnNlcnQgPSByZXF1aXJlKCcuL2luc2VydCcpLFxuXHRcdHJlbW92ZSA9IHJlcXVpcmUoJy4vcmVtb3ZlJyksXG5cdFx0ZW1wdHkgPSByZXF1aXJlKCcuL2VtcHR5JyksXG5cdFx0YXBwZW5kID0gcmVxdWlyZSgnLi9hcHBlbmQnKSxcblx0XHRhdHRhY2ggPSByZXF1aXJlKCcuL2F0dGFjaCcpLFxuXHRcdHByZXBlbmQgPSByZXF1aXJlKCcuL3ByZXBlbmQnKSxcblx0XHRmcm9tRWxlbWVudCA9IHJlcXVpcmUoJy4vZnJvbUVsZW1lbnQnKTtcblxuUmVnaW9uID0gbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByZWdpb24ocHJvcGVydGllcykge1xuXG5cdF8uZXh0ZW5kKHRoaXMsIEZSQU1FV09SSy5FdmVudHMpO1xuXG5cdGlmICghcHJvcGVydGllcykge1xuXHRcdHByb3BlcnRpZXMgPSB7fTtcblx0fVxuXHRpZiAoIXByb3BlcnRpZXMuJGVsKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdUcnlpbmcgdG8gaW5zdGFudGlhdGUgcmVnaW9uIHdpdGggbm8gJGVsIScpO1xuXHR9XG5cblx0Ly8gRm9sZCBpbiBwcm9wZXJ0aWVzIHRvIHByb3RvdHlwZVxuXHRfLmV4dGVuZCh0aGlzLCBwcm9wZXJ0aWVzKTtcblxuXHQvLyBJZiBuZWl0aGVyIGFuIGlkIG5vciBhIGB0ZW1wbGF0ZWAgd2FzIHNwZWNpZmllZCxcblx0Ly8gd2UnbGwgdGhyb3cgYW4gZXJyb3IsIHNpbmNlIHRoZXJlJ3Mgbm8gd2F5IHRvIGdldCBhIGhvbGQgb2YgdGhlIHJlZ2lvblxuXHR2YXIgZGVmYXVsdFRlbXBsYXRlID0gdGhpcy4kZWwuYXR0cignZGVmYXVsdCcpIHx8IHRoaXMuJGVsLmF0dHIoJ3RlbXBsYXRlJykgfHwgdGhpcy4kZWwuYXR0cignY29udGVudHMnKTtcblx0aWYgKCAhdGhpcy5pZCAmJiAhZGVmYXVsdFRlbXBsYXRlICkge1xuXG5cdFx0dGhyb3cgbmV3IEVycm9yKFxuXHRcdFx0dGhpcy5wYXJlbnQuaWQgKyAnIDo6IEEgcmVnaW9uIGlkZW50aWZpZXIgKGUuZy4gYGRhdGEtcmVnaW9uPVwiZm9vXCJgKSBtYXkgJyArXG5cdFx0XHQnb25seSBiZSBvbWl0dGVkIGlmIGEgZGVmYXVsdCB0ZW1wbGF0ZSBpcyBzcGVjaWZpZWQsIGUuZy46XFxuJyArXG5cdFx0XHQnZS5nLiA8cmVnaW9uIHRlbXBsYXRlPVwiU29tZUNvbXBvbmVudFwiPjwvcmVnaW9uPidcblx0XHQpO1xuXHR9XG5cblx0Ly8gU2V0IHVwIGxpc3QgdG8gaG91c2UgY2hpbGQgY29tcG9uZW50c1xuXHR0aGlzLl9jaGlsZHJlbiA9IFtdO1xuXG5cdF8uYmluZEFsbCh0aGlzKTtcblxuXHQvLyBTZXQgdXAgY29udmVuaWVuY2UgYWNjZXNzIHRvIHRoaXMgcmVnaW9uIGluIHRoZSBnbG9iYWwgcmVnaW9uIGNhY2hlXG5cdEZSQU1FV09SSy5yZWdpb25zW3RoaXMuaWRdID0gdGhpcztcbn07XG5cblJlZ2lvbi5mcm9tRWxlbWVudCA9IGZ1bmN0aW9uKGVsLCBwYXJlbnQpIHtcblx0cmV0dXJuIGZyb21FbGVtZW50KGVsLCBwYXJlbnQpO1xufTtcblJlZ2lvbi5wcm90b3R5cGUucmVtb3ZlID0gZnVuY3Rpb24oYXRJbmRleCkge1xuXHRyZXR1cm4gcmVtb3ZlLmNhbGwodGhpcywgYXRJbmRleCk7XG59O1xuUmVnaW9uLnByb3RvdHlwZS5lbXB0eSA9IGZ1bmN0aW9uKCkge1xuXHRyZXR1cm4gZW1wdHkuY2FsbCh0aGlzKTtcbn07XG5SZWdpb24ucHJvdG90eXBlLmluc2VydCA9IGZ1bmN0aW9uKGF0SW5kZXgsIGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKSB7XG5cdHJldHVybiBpbnNlcnQuY2FsbCh0aGlzLCBhdEluZGV4LCBjb21wb25lbnRJZCwgcHJvcGVydGllcyk7XG59O1xuUmVnaW9uLnByb3RvdHlwZS5hcHBlbmQgPSBmdW5jdGlvbihjb21wb25lbnRJZCwgcHJvcGVydGllcykge1xuXHRyZXR1cm4gYXBwZW5kLmNhbGwodGhpcywgY29tcG9uZW50SWQsIHByb3BlcnRpZXMpO1xufTtcblJlZ2lvbi5wcm90b3R5cGUuYXR0YWNoID0gZnVuY3Rpb24oY29tcG9uZW50LCBwcm9wZXJ0aWVzKSB7XG5cdHJldHVybiBhdHRhY2guY2FsbCh0aGlzLCBjb21wb25lbnQsIHByb3BlcnRpZXMpO1xufTtcblJlZ2lvbi5wcm90b3R5cGUucHJlcGVuZCA9IGZ1bmN0aW9uKGNvbXBvbmVudElkLCBwcm9wZXJ0aWVzKSB7XG5cdHJldHVybiBwcmVwZW5kLmNhbGwodGhpcywgY29tcG9uZW50SWQsIHByb3BlcnRpZXMpO1xufTtcbiIsIi8qKlxuICogcmVnaW9uLmluc2VydCggYXRJbmRleCwgY29tcG9uZW50SWQsIFtwcm9wZXJ0aWVzXSApXG4gKlxuICogVE9ETzogc3VwcG9ydCBhIGxpc3Qgb2YgcHJvcGVydGllcyBvYmplY3RzIGluIGxpZXUgb2YgdGhlIHByb3BlcnRpZXMgb2JqZWN0XG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpbnNlcnQoYXRJbmRleCwgY29tcG9uZW50SWQsIHByb3BlcnRpZXMpIHtcblxuXHR2YXIgZXJyID0gJyc7XG5cdGlmICghKGF0SW5kZXggfHwgXy5pc0Zpbml0ZShhdEluZGV4KSkpIHtcblx0XHRlcnIgKz0gdGhpcy5pZCArICcuaW5zZXJ0KCkgOjogTm8gYXRJbmRleCBzcGVjaWZpZWQhJztcblx0fVxuXHRlbHNlIGlmICghY29tcG9uZW50SWQpIHtcblx0XHRlcnIgKz0gdGhpcy5pZCArICcuaW5zZXJ0KCkgOjogTm8gY29tcG9uZW50SWQgc3BlY2lmaWVkISc7XG5cdH1cblx0aWYgKGVycikge1xuXHRcdHRocm93IG5ldyBFcnJvcihlcnIgKyAnXFxuVXNhZ2U6IGFwcGVuZChhdEluZGV4LCBjb21wb25lbnRJZCwgW3Byb3BlcnRpZXNdKScpO1xuXHR9XG5cblx0dmFyIGNvbXBvbmVudDtcblx0Ly8gSWYgY29tcG9uZW50SWQgaXMgYSBzdHJpbmcsIGxvb2sgdXAgY29tcG9uZW50IHByb3RvdHlwZSBhbmQgaW5zdGF0aWF0ZVxuXHRpZiAoJ3N0cmluZycgPT0gdHlwZW9mIGNvbXBvbmVudElkKSB7XG5cblx0XHR2YXIgY29tcG9uZW50UHJvdG90eXBlID0gRlJBTUVXT1JLLmNvbXBvbmVudHNbY29tcG9uZW50SWRdO1xuXG5cdFx0aWYgKCFjb21wb25lbnRQcm90b3R5cGUpIHtcblx0XHRcdHZhciB0ZW1wbGF0ZSA9IEZSQU1FV09SSy50ZW1wbGF0ZXNbY29tcG9uZW50SWRdO1xuXHRcdFx0aWYgKCF0ZW1wbGF0ZSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IgKCdJbiAnICtcblx0XHRcdFx0XHQodGhpcy5pZCB8fCAnQW5vbnltb3VzIHJlZ2lvbicpICsgJzo6IFRyeWluZyB0byBhdHRhY2ggJyArXG5cdFx0XHRcdFx0Y29tcG9uZW50SWQgKyAnLCBidXQgbm8gY29tcG9uZW50IG9yIHRlbXBsYXRlIGV4aXN0cyB3aXRoIHRoYXQgaWQuJyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIElmIG5vIGNvbXBvbmVudCBwcm90b3R5cGUgd2l0aCB0aGlzIGlkIGV4aXN0cyxcblx0XHRcdC8vIGNyZWF0ZSBhbiBhbm9ueW1vdXMgb25lIHRvIHVzZVxuXHRcdFx0Y29tcG9uZW50UHJvdG90eXBlID0gRlJBTUVXT1JLLkNvbXBvbmVudC5leHRlbmQoe1xuXHRcdFx0XHRpZDogY29tcG9uZW50SWQsXG5cdFx0XHRcdHRlbXBsYXRlOiB0ZW1wbGF0ZVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gSW5zdGFudGlhdGUgYW5kIHJlbmRlciB0aGUgY29tcG9uZW50IGluc2lkZSB0aGlzIHJlZ2lvblxuXHRcdGNvbXBvbmVudCA9IG5ldyBjb21wb25lbnRQcm90b3R5cGUoXy5leHRlbmQoe1xuXHRcdFx0JG91dGxldDogdGhpcy4kZWxcblx0XHR9LCBwcm9wZXJ0aWVzIHx8IHt9KSk7XG5cblxuXHR9XG5cblx0Ly8gT3RoZXJ3aXNlIGFzc3VtZSBhbiBpbnN0YW50aWF0ZWQgY29tcG9uZW50IG9iamVjdCB3YXMgc2VudFxuXHQvKiBUT0RPOiBDaGVjayB0aGF0IGNvbXBvbmVudCBvYmplY3QgaXMgdmFsaWQgKi9cblx0ZWxzZSB7XG5cdFx0Y29tcG9uZW50ID0gY29tcG9uZW50SWQ7XG5cdFx0Y29tcG9uZW50LiRvdXRsZXQgPSB0aGlzLiRlbDtcblx0fVxuXG5cdC8vIFNhdmUgcmVmZXJlbmNlIHRvIHBhcmVudFJlZ2lvblxuXHRjb21wb25lbnQucGFyZW50UmVnaW9uID0gdGhpcztcblxuXHQvLyBDaGVjayB0byBzZWUgaWYgdGhlIG1vZGVsIHdhcyBhbHJlYWR5IGRlZmluZWQuIElmIGl0IGlzLCB1c2UgdGhhdCBtb2RlbC4gSWYgbm90LCBhc3NpZ24gaXRcblx0Ly8gdGhlIHBhcmVudHMgbW9kZWwgaWYgaXQgaGFzIG9uZSwgb3IgYXNzaWduIGl0IGEgbmV3IGJhY2tib25lIGluc3RhbmNlLlxuXHRpZiAoIWNvbXBvbmVudC5tb2RlbCkge1xuXHRcdGNvbXBvbmVudC5tb2RlbCA9IHRoaXMucGFyZW50Lm1vZGVsID8gdGhpcy5wYXJlbnQubW9kZWwgOiBuZXcgQmFja2JvbmUuTW9kZWwoKTtcblx0fVxuXG5cdC8vIFJlbmRlciBjb21wb25lbnQgaW50byB0aGlzIHJlZ2lvblxuXHRjb21wb25lbnQucmVuZGVyKGF0SW5kZXgpO1xuXG5cdC8vIEFuZCBrZWVwIHRyYWNrIG9mIGl0IGluIHRoZSBsaXN0IG9mIHRoaXMgcmVnaW9uJ3MgY2hpbGRyZW5cblx0dGhpcy5fY2hpbGRyZW4uc3BsaWNlKGF0SW5kZXgsIDAsIGNvbXBvbmVudCk7XG5cblx0Ly8gTG9nIGZvciBkZWJ1Z2dpbmcgYGNvdW50YCBkZWNsYXJhdGl2ZVxuXHR2YXIgZGVidWdTdHIgPSB0aGlzLnBhcmVudC5pZCArICcgOjogSW5zZXJ0ZWQgJyArIGNvbXBvbmVudElkICsgJyBpbnRvICc7XG5cdGlmICh0aGlzLmlkKSBkZWJ1Z1N0ciArPSAncmVnaW9uOiAnICsgdGhpcy5pZCArICcgYXQgaW5kZXggJyArIGF0SW5kZXg7XG5cdGVsc2UgZGVidWdTdHIgKz0gJ2Fub255bW91cyByZWdpb24gYXQgaW5kZXggJyArIGF0SW5kZXg7XG5cdEZSQU1FV09SSy52ZXJib3NlKGRlYnVnU3RyKTtcblxuXHRyZXR1cm4gY29tcG9uZW50O1xuXG59O1xuIiwiLyoqXG4gKiBQcmVwZW5kIGEgY29tcG9uZW50IHRvIHRoZSBiZWdpbm5pbmcgb2YgYSByZWdpb24uIFRoaXMgY2FsbHMgaW5zZXJ0IGF0IHRoZSBmaXJzdCBwb3NpdGlvbi5cbiAqXG4gKiBAcGFyYW0gIHtTdHJpbmd9IGNvbXBvbmVudElkIFtUaGUgY29tcG9uZW50IGlkIHRoYXQgd2Ugd2FudCB0byBwcmVwZW5kIF1cbiAqIEBwYXJhbSAge09iamVjdH0gcHJvcGVydGllcyAgW1Byb3BlcnRpZXMgdG8gaW5zdGFudGlhdGUgdGhlIGNvbXBvbmVudCB3aXRoXVxuICpcbiAqIEByZXR1cm4ge0NvbXBvbmVudH0gICAgICAgICAgW05ld2x5IHByZXBlbmRlZCBDb21wb25lbnRdXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcHJlcGVuZChjb21wb25lbnRJZCwgcHJvcGVydGllcykge1xuXHQvLyBJbnNlcnQgYXQgbGFzdCBwb3NpdGlvblxuXHRyZXR1cm4gdGhpcy5pbnNlcnQoMCwgY29tcG9uZW50SWQsIHByb3BlcnRpZXMpO1xufTtcbiIsIi8qKlxuICogcmVnaW9uLnJlbW92ZSggYXRJbmRleCApXG4gKlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHJlbW92ZShhdEluZGV4KSB7XG5cblx0aWYgKCFhdEluZGV4ICYmICFfLmlzRmluaXRlKGF0SW5kZXgpKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKHRoaXMuaWQgKyAnLnJlbW92ZSgpIDo6IE5vIGF0SW5kZXggc3BlY2lmaWVkISBcXG5Vc2FnZTogcmVtb3ZlKGF0SW5kZXgpJyk7XG5cdH1cblxuXHQvLyBSZW1vdmUgdGhlIGNvbXBvbmVudCBmcm9tIHRoZSBsaXN0XG5cdHZhciBjb21wb25lbnQgPSB0aGlzLl9jaGlsZHJlbi5zcGxpY2UoYXRJbmRleCwgMSk7XG5cdGlmICghY29tcG9uZW50WzBdKSB7XG5cblx0XHQvLyBJZiB0aGUgbGlzdCBpcyBlbXB0eSwgZnJlYWsgb3V0XG5cdFx0dGhyb3cgbmV3IEVycm9yKHRoaXMuaWQgKyAnLnJlbW92ZSgpIDo6IFRyeWluZyB0byByZW1vdmUgYSBjb21wb25lbnQgdGhhdCBkb2VzblxcJ3QgZXhpc3QgYXQgaW5kZXggJyArIGF0SW5kZXgpO1xuXHR9XG5cblx0Ly8gU3F1ZWV6ZSB0aGUgY29tcG9uZW50IHRvIGRvIGdldCBhbGwgdGhlIGJpbmR5IGdvb2RuZXNzIG91dFxuXHRjb21wb25lbnRbMF0uY2xvc2UoKTtcblxuXHRGUkFNRVdPUksuZGVidWcodGhpcy5wYXJlbnQuaWQgKyAnIDo6IFJlbW92ZWQgY29tcG9uZW50IGF0IGluZGV4ICcgKyBhdEluZGV4ICsgJyBmcm9tIHJlZ2lvbjogJyArIHRoaXMuaWQpO1xufTtcbiIsIi8qKlxuICogU2V0cyB1cCB0aGUgRlJBTUVXT1JLIHJvdXRlci5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByb3V0ZXJTZXR1cCgpIHtcblxuXHQvLyBXaWxkY2FyZCByb3V0ZXMgdG8gZ2xvYmFsIGV2ZW50IGRlbGVnYXRvclxuXHR2YXIgcm91dGVyID0gbmV3IEZSQU1FV09SSy5Sb3V0ZXIoKTtcblx0cm91dGVyLnJvdXRlKC8oLiopLywgJ3JvdXRlJywgZnVuY3Rpb24gKHJvdXRlKSB7XG5cblx0XHQvLyBOb3JtYWxpemUgaG9tZSByb3V0ZXMgKCMgb3IgbnVsbCkgdG8gJydcblx0XHRpZiAoIXJvdXRlKSB7XG5cdFx0XHRyb3V0ZSA9ICcnO1xuXHRcdH1cblxuXHRcdC8vIFRyaWdnZXIgcm91dGVcblx0XHRGUkFNRVdPUksudHJpZ2dlcignIycgKyByb3V0ZSk7XG5cdH0pO1xuXG5cdC8vIEV4cG9zZSBgbmF2aWdhdGUoKWAgbWV0aG9kXG5cdEZSQU1FV09SSy5uYXZpZ2F0ZSA9IEZSQU1FV09SSy5oaXN0b3J5Lm5hdmlnYXRlO1xufVxuIiwiLyoqXG4gKiBCYXJlLWJvbmVzIERPTS9VSSB1dGlsaXRpZXNcbiAqL1xuXG52YXIgRXZlbnRzID0gcmVxdWlyZSgnLi9ldmVudHMnKTtcblxudmFyIERPTSA9IHtcblxuXHQvKipcblx0ICogRXhwb3NlIHRoZSBcIkRPTW15LWV2ZW50ZWRuZXNzXCIgb2YgZWxlbWVudHMgc28gdGhhdCBpdCdzIHNlbGVjdGFibGUgdmlhIENTU1xuXHQgKiBZb3UgY2FuIHVzZSB0aGlzIHRvIGFwcGx5IGEgZmV3IGNob2ljZSBET00gbW9kaWZpY2F0aW9ucyBvdXQgdGhlIGdhdGUtLVxuXHQgKiAoZS5nLiB0d2Vha3MgdGFyZ2V0aW5nIGNvbW1vbiBpc3N1ZXMgdGhhdCB0eXBpY2FsbHkgZ2V0IGZvcmdvdHRlbiwgbGlrZSBkaXNhYmxpbmcgdGV4dCBzZWxlY3Rpb24pXG5cdCAqXG5cdCAqIEBwYXJhbSB7Q29tcG9uZW50fSBjb21wb25lbnRcblx0ICovXG5cdGZsYWdCb3VuZEV2ZW50czogZnVuY3Rpb24gKCBjb21wb25lbnQgKSB7XG5cblx0XHQvLyBUT0RPOiBwcm92aWRlIGFjY2VzcyB0byBib3VuZCBnbG9iYWwgZXZlbnRzICglKSBhbmQgcm91dGVzICgjKSBhcyB3ZWxsXG5cdFx0Ly8gVE9ETzogZmxhZyBhbGwgRE9NIGV2ZW50cywgbm90IGp1c3QgY2xpY2sgYW5kIHRvdWNoXG5cblx0XHQvLyBCdWlsZCBzdWJzZXQgb2YganVzdCB0aGUgY2xpY2svdG91Y2ggZXZlbnRzXG5cdFx0dmFyIGNsaWNrT3JUb3VjaEV2ZW50cyA9IEV2ZW50cy5wYXJzZShcblx0XHRcdGNvbXBvbmVudC5ldmVudHMsXG5cdFx0XHR7IG9ubHk6IFsnY2xpY2snLCAndG91Y2gnLCAndG91Y2hzdGFydCcsICd0b3VjaGVuZCddIH1cblx0XHQpO1xuXG5cdFx0Ly8gSWYgbm8gY2xpY2svdG91Y2ggZXZlbnRzIGZvdW5kLCBiYWlsIG91dFxuXHRcdGlmICggY2xpY2tPclRvdWNoRXZlbnRzLmxlbmd0aCA8IDEgKSByZXR1cm47XG5cblx0XHQvLyBRdWVyeSBhZmZlY3RlZCBlbGVtZW50cyBmcm9tIERPTVxuXHRcdHZhciAkYWZmZWN0ZWQgPSBFdmVudHMuZ2V0RWxlbWVudHMoY2xpY2tPclRvdWNoRXZlbnRzLCBjb21wb25lbnQpO1xuXG5cdFx0Ly8gTk9URTogRm9yIG5vdywgdGhpcyBpcyBhbHdheXMganVzdCAnY2xpY2snXG5cdFx0dmFyIGJvdW5kRXZlbnRzU3RyaW5nID0gJ2NsaWNrJztcblxuXHRcdC8vIFNldCBgZGF0YS1GUkFNRVdPUkstY2xpY2thYmxlYCBjdXN0b20gYXR0cmlidXRlXG5cdFx0Ly8gKHVpIGxvZ2ljIHNob3VsZCBiZSBleHRlbmRlZCBpbiBDU1MpXG5cdFx0JGFmZmVjdGVkLmF0dHIoJ2RhdGEtJyArIEZSQU1FV09SSy5vcHRpb25zLmZyYW1ld29ya0lkICsgJy1ldmVudHMnLCBib3VuZEV2ZW50c1N0cmluZyk7XG5cblx0XHRGUkFNRVdPUksudmVyYm9zZShcblx0XHRcdGNvbXBvbmVudC5pZCArICcgOjogJyArXG5cdFx0XHQnRGlzYWJsZWQgdXNlciB0ZXh0IHNlbGVjdGlvbiBvbiBlbGVtZW50cyB3LyBjbGljay90b3VjaCBldmVudHM6Jyxcblx0XHRcdGNsaWNrT3JUb3VjaEV2ZW50cyxcblx0XHRcdCRhZmZlY3RlZFxuXHRcdCk7XG5cdH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gRE9NO1xuIiwiLyoqXG4gKiBHcmFicyB0aGUgTWFzdCBpZGVudGlmaWVyIGZyb20gYW4gSFRNTCBlbGVtZW50LlxuICogU3VwcG9ydHMgYGlkYCwgYGRhdGEtaWRgLCBvciBgZGF0YS1yZWdpb25gXG4gKlxuICogQHBhcmFtICB7RE9NRWxlbWVudH0gZWwgICAgW3RoZSBET00gZWxlbWVudCB0byBpbnNwZWN0XVxuICogQHBhcmFtICB7Qm9vbGVhbn0gcmVxdWlyZWQgW3doZXRoZXIgYW4gaWRlbnRpZmllciBpcyByZXF1aXJlZF1cbiAqXG4gKiBAcmV0dXJuIHtTdHJpbmd9ICAgICAgICAgICBbaWRlbnRpZmllcl1cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGVsMk1hc3RJRCAoZWwsIHJlcXVpcmVkKSB7XG5cblx0dmFyIGlkID0gJChlbCkuYXR0cignaWQnKTtcblx0dmFyIGRhdGFJZCA9ICQoZWwpLmF0dHIoJ2RhdGEtaWQnKSB8fCAkKGVsKS5hdHRyKCdkYXRhLXJlZ2lvbicpO1xuXHR2YXIgY29udGVudHNJZCA9ICQoZWwpLmF0dHIoJ2NvbnRlbnRzJyk7XG5cblx0aWYgKGlkICYmIGRhdGFJZCkge1xuXHRcdHRocm93IG5ldyBFcnJvcihpZCArICcgOjogQ2Fubm90IHNldCBib3RoIGBpZGAgYW5kIGBkYXRhLWlkYCEgIFBsZWFzZSB1c2Ugb25lIG9yIHRoZSBvdGhlci4gIChkYXRhLWlkIGlzIHNhZmVzdCknKTtcblx0fVxuXHRpZiAocmVxdWlyZWQgJiYgIWlkICYmICFkYXRhSWQpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIGlkIHNwZWNpZmllZCBpbiBlbGVtZW50IHdoZXJlIGl0IGlzIHJlcXVpcmVkOlxcbicgKyBlbCk7XG5cdH1cblxuXHRyZXR1cm4gaWQgfHwgZGF0YUlkIHx8IGNvbnRlbnRzSWQ7XG59O1xuIiwiLyoqXG4gKiBVdGlsaXR5IEV2ZW50IHRvb2xraXRcbiAqL1xuXG52YXIgRXZlbnRzID0ge1xuXG5cdC8qKlxuXHQgKiBQYXJzZXMgYSBkaWN0aW9uYXJ5IG9mIGV2ZW50cyBhbmQgb3B0aW9uYWxseSBmaWx0ZXJzIGJ5IHRoZSBldmVudCB0eXBlLiBJZiB0aGUgZXZlbnRcblx0ICpcblx0ICogQHBhcmFtICB7T2JqZWN0fSBldmVudHMgIFtBIEJhY2tib25lLlZpZXcgZXZlbnRzIG9iamVjdF1cblx0ICogQHBhcmFtICB7T2JqZWN0fSBvcHRpb25zIFtPcHRpb25zIG9iamVjdCB0aGF0IGFsbG93cyB1cyB0byBmaWx0ZXIgcGFyc2luZyB0byBjZXJ0YWluIGV2ZW50XG5cdCAqICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZXNdXG5cdCAqXG5cdCAqIEByZXR1cm4ge0FycmF5fSAgICAgICAgICBbQXJyYXkgY29udGFpbmluZyBwYXJzZWRFdmVudHMgdGhhdCBhcmUgbWF0Y2hpbmcgZXZlbnQga2V5c11cblx0ICovXG5cdHBhcnNlOiBmdW5jdGlvbiAoZXZlbnRzLCBvcHRpb25zKSB7XG5cblx0XHR2YXIgZXZlbnRLZXlzID0gXy5rZXlzKGV2ZW50cyB8fCB7fSksXG5cdFx0XHRsaW1pdEV2ZW50cyxcblx0XHRcdHBhcnNlZEV2ZW50cyA9IFtdO1xuXG5cdFx0Ly8gT3B0aW9uYWxseSBmaWx0ZXIgdXNpbmcgc2V0IG9mIGFjY2VwdGFibGUgZXZlbnQgdHlwZXNcblx0XHRsaW1pdEV2ZW50cyA9IG9wdGlvbnMub25seTtcblx0XHRldmVudEtleXMgPSBfLmZpbHRlcihldmVudEtleXMsIGZ1bmN0aW9uIGNoZWNrRXZlbnROYW1lIChldmVudEtleSkge1xuXG5cdFx0XHQvLyBQYXJzZSBldmVudCBzdHJpbmcgaW50byBzZW1hbnRpYyByZXByZXNlbnRhdGlvblxuXHRcdFx0dmFyIGV2ZW50ID0gRXZlbnRzLnBhcnNlRE9NRXZlbnQoZXZlbnRLZXkpO1xuXHRcdFx0cGFyc2VkRXZlbnRzLnB1c2goZXZlbnQpO1xuXG5cdFx0XHQvLyBPcHRpb25hbCBmaWx0ZXJcblx0XHRcdGlmIChsaW1pdEV2ZW50cykge1xuXHRcdFx0XHRyZXR1cm4gXy5jb250YWlucyhsaW1pdEV2ZW50cywgZXZlbnQubmFtZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBwYXJzZWRFdmVudHM7XG5cdH0sXG5cblx0LyoqXG5cdCAqIFtnZXRFbGVtZW50cyBkZXNjcmlwdGlvbl1cblx0ICpcblx0ICogQHBhcmFtICB7QXJyYXl9IHNlbWFudGljRXZlbnRzIFtBIGxpc3Qgb2YgcGFyc2VkIGV2ZW50IG9iamVjdHNdXG5cdCAqIEBwYXJhbSAge0NvbXBvbmVudH0gY29udGV4dCAgICBbSW5zdGFuY2Ugb2YgYSBjb21wb25lbnQgdG8gdXNlIGFzIGEgc3RhcnRpbmcgcG9pbnQgZm9yXG5cdCAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhlIERPTSBxdWVyaWVzXVxuXHQgKlxuXHQgKiBAcmV0dXJuIHtBcnJheX0gICAgICAgICAgICAgICAgW0FuIGFycmF5IG9mIGpRdWVyeSBzZXQgb2YgbWF0Y2hlZCBlbGVtZW50c11cblx0ICovXG5cdGdldEVsZW1lbnRzOiBmdW5jdGlvbiAoc2VtYW50aWNFdmVudHMsIGNvbnRleHQpIHtcblxuXHRcdC8vIENvbnRleHQgb3B0aW9uYWxcblx0XHRjb250ZXh0ID0gY29udGV4dCB8fCB7ICQ6ICQgfTtcblxuXHRcdC8vIEl0ZXJhdGl2ZWx5IGJ1aWxkIGEgc2V0IG9mIGFmZmVjdGVkIGVsZW1lbnRzXG5cdFx0dmFyICRhZmZlY3RlZCA9ICQoKTtcblx0XHRfLmVhY2goc2VtYW50aWNFdmVudHMsIGZ1bmN0aW9uIGxvb2t1cEVsZW1lbnRzRm9yRXZlbnQgKGV2ZW50KSB7XG5cblx0XHRcdC8vIERldGVybWluZSBtYXRjaGVkIGVsZW1lbnRzXG5cdFx0XHQvLyBVc2UgZGVsZWdhdGUgc2VsZWN0b3IgaWYgc3BlY2lmaWVkXG5cdFx0XHQvLyBPdGhlcndpc2UsIGdyYWIgdGhlIGVsZW1lbnQgZm9yIHRoaXMgY29tcG9uZW50XG5cdFx0XHR2YXIgJG1hdGNoZWQgPVx0ZXZlbnQuc2VsZWN0b3IgP1xuXHRcdFx0XHRcdFx0XHRjb250ZXh0LiQoZXZlbnQuc2VsZWN0b3IpIDpcblx0XHRcdFx0XHRcdFx0Y29udGV4dC4kZWw7XG5cblx0XHRcdC8vIEFkZCBtYXRjaGVkIGVsZW1lbnRzIHRvIHNldFxuXHRcdFx0JGFmZmVjdGVkID0gJGFmZmVjdGVkLmFkZCggJG1hdGNoZWQgKTtcblx0XHR9LCB0aGlzKTtcblxuXHRcdHJldHVybiAkYWZmZWN0ZWQ7XG5cdH0sXG5cblxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHdoZXRoZXIgdGhlIHNwZWNpZmllZCBldmVudCBrZXkgbWF0Y2hlcyBhIERPTSBldmVudC5cblx0ICpcblx0ICogQHBhcmFtICB7U3RyaW5nfSBrZXkgW0tleSB0byBtYXRjaCBhZ2FpbnN0XVxuXHQgKlxuXHQgKiBpZiBubyBtYXRjaCBpcyBmb3VuZFxuXHQgKiBAcmV0dXJuIHtCb29sZWFufSBcdFx0W3JldHVybiBgZmFsc2VgXVxuXHQgKlxuXHQgKiBvdGhlcndpc2Vcblx0ICogQHJldHVybiB7T2JqZWN0fSAgXHRcdFtPYmplY3QgY29udGFpbmluZyB0aGUgYG5hbWVgIG9mIHRoZSBET00gZWxlbWVudCBhbmQgdGhlIGBzZWxlY3RvcmBdXG5cdCAqL1xuXHRwYXJzZURPTUV2ZW50OiBfLm1lbW9pemUoZnVuY3Rpb24oa2V5KSB7XG5cblx0XHR2YXIgbWF0Y2hlcyA9IGtleS5tYXRjaCh0aGlzWycvRE9NRXZlbnQvJ10pO1xuXG5cdFx0aWYgKCFtYXRjaGVzIHx8ICFtYXRjaGVzWzFdKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdG5hbWU6IG1hdGNoZXNbMV0sXG5cdFx0XHRzZWxlY3RvcjogbWF0Y2hlc1szXVxuXHRcdH07XG5cdH0pLFxuXG5cblx0LyoqXG5cdCAqIFN1cHBvcnRlZCBcImZpcnN0LWNsYXNzXCIgRE9NIGV2ZW50cy5cblx0ICogQHR5cGUge0FycmF5fVxuXHQgKi9cblx0bmFtZXM6IFtcblxuXHRcdC8vIExvY2FsaXplZCBicm93c2VyIGV2ZW50c1xuXHRcdC8vICh3b3JrcyBvbiBpbmRpdmlkdWFsIGVsZW1lbnRzKVxuXHRcdCdlcnJvcicsICdzY3JvbGwnLFxuXG5cdFx0Ly8gTW91c2UgZXZlbnRzXG5cdFx0J2NsaWNrJywgJ2RibGNsaWNrJywgJ21vdXNlZG93bicsICdtb3VzZXVwJywgJ2hvdmVyJywgJ21vdXNlZW50ZXInLCAnbW91c2VsZWF2ZScsXG5cdFx0J21vdXNlb3ZlcicsICdtb3VzZW91dCcsICdtb3VzZW1vdmUnLFxuXG5cdFx0Ly8gS2V5Ym9hcmQgZXZlbnRzXG5cdFx0J2tleWRvd24nLCAna2V5dXAnLCAna2V5cHJlc3MnLFxuXG5cdFx0Ly8gRm9ybSBldmVudHNcblx0XHQnYmx1cicsICdjaGFuZ2UnLCAnZm9jdXMnLCAnZm9jdXNpbicsICdmb2N1c291dCcsICdzZWxlY3QnLCAnc3VibWl0JyxcblxuXHRcdC8vIFJhdyB0b3VjaCBldmVudHNcblx0XHQndG91Y2hzdGFydCcsICd0b3VjaGVuZCcsICd0b3VjaG1vdmUnLCAndG91Y2hjYW5jZWwnLFxuXG5cdFx0Ly8gTWFudWZhY3R1cmVkIGV2ZW50c1xuXHRcdCd0b3VjaCcsXG5cblx0XHQvLyBUT0RPOlxuXHRcdCdyaWdodGNsaWNrJywgJ2NsaWNrb3V0c2lkZSdcblx0XVxufTtcblxuXG5cblxuLyoqXG4gKiBSZWdleHAgdG8gbWF0Y2ggXCJmaXJzdCBjbGFzc1wiIERPTSBldmVudHNcbiAqICh0aGVzZSBhcmUgYWxsb3dlZCBpbiB0aGUgdG9wIGxldmVsIG9mIGEgY29tcG9uZW50IGRlZmluaXRpb24gYXMgbWV0aG9kIGtleXMpXG4gKlx0XHRpLmUuIC9eKGNsaWNrfGhvdmVyfGJsdXJ8Zm9jdXMpKCAoLispKS9cbiAqXHRcdFx0WzFdID0+IGV2ZW50IG5hbWVcbiAqXHRcdFx0WzNdID0+IHNlbGVjdG9yXG4gKi9cblxuRXZlbnRzWycvRE9NRXZlbnQvJ10gPSBuZXcgUmVnRXhwKCdeKCcgKyBfLnJlZHVjZShFdmVudHMubmFtZXMsXG5cdGZ1bmN0aW9uIGJ1aWxkUmVnZXhwKG1lbW8sIGV2ZW50TmFtZSwgaW5kZXgpIHtcblxuXHRcdC8vIE9taXQgYHxgIHRoZSBmaXJzdCB0aW1lXG5cdFx0aWYgKGluZGV4ID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gbWVtbyArIGV2ZW50TmFtZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbWVtbyArICd8JyArIGV2ZW50TmFtZTtcblx0fSwgJycpICtcbicpKCAoLispKT8kJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gRXZlbnRzO1xuIiwiLyoqXG4gKiBNYXAgYW4gb2JqZWN0J3MgdmFsdWVzLCBhbmQgcmV0dXJuIGEgdmFsaWQgb2JqZWN0ICh0aGlzIGZ1bmN0aW9uIGlzIGhhbmR5IGJlY2F1c2VcbiAqIHVuZGVyc2NvcmUubWFwKCkgcmV0dXJucyBhIGxpc3QsIG5vdCBhbiBvYmplY3QuKVxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmogICAgICAgICAgICBbT2JqZWN0IHdob3MgdmFsdWVzIHlvdSB3YW50IHRvIG1hcF1cbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSB0cmFuc2Zvcm1GbiBbRnVuY3Rpb24gdG8gdHJhbnNmb3JtIGVhY2ggb2JqZWN0IHZhbHVlIGJ5XVxuICpcbiAqIEByZXR1cm4ge09iamVjdH0gICAgICAgICAgICAgICAgW05ldyBvYmplY3Qgd2l0aCB0aGUgdmFsdWVzIG1hcHBlZF1cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIG9iak1hcChvYmosIHRyYW5zZm9ybUZuKSB7XG5cdHJldHVybiBfLm9iamVjdChfLmtleXMob2JqKSwgXy5tYXAob2JqLCB0cmFuc2Zvcm1GbikpO1xufTtcblxuIiwiLyoqXG4gKiBUcmFuc2xhdGUgKipyaWdodC1oYW5kLXNpZGUgYWJicmV2aWF0aW9ucyoqIGludG8gZnVuY3Rpb25zIHRoYXQgcGVyZm9ybVxuICogdGhlIHByb3BlciBiZWhhdmlvcnMsIGUuZy5cbiAqXHRcdCNhYm91dF9tZVxuICpcdFx0JW1haW5NZW51Om9wZW5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHRyYW5zbGF0ZVNob3J0aGFuZCh2YWx1ZSwga2V5KSB7XG5cblx0dmFyIG1hdGNoZXMsIGZuO1xuXG5cdC8vIElmIHRoaXMgaXMgYW4gaW1wb3J0YW50LCBGUkFNRVdPUkstc3BlY2lmaWMgZGF0YSBrZXksXG5cdC8vIGFuZCBhIGZ1bmN0aW9uIHdhcyBzcGVjaWZpZWQsIHJ1biBpdCB0byBnZXQgaXRzIHZhbHVlXG5cdC8vICh0aGlzIGlzIHRvIGtlZXAgcGFyaXR5IHdpdGggQmFja2JvbmUncyBzaW1pbGFyIGZ1bmN0aW9uYWxpdHkpXG5cdGlmIChfLmlzRnVuY3Rpb24odmFsdWUpICYmIChrZXkgPT09ICdjb2xsZWN0aW9uJyB8fCBrZXkgPT09ICdtb2RlbCcpKSB7XG5cdFx0cmV0dXJuIHZhbHVlKCk7XG5cdH1cblxuXHQvLyBJZ25vcmUgb3RoZXIgbm9uLXN0cmluZ3Ncblx0aWYgKCFfLmlzU3RyaW5nKHZhbHVlKSkge1xuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxuXG5cdC8vIEFsc28gaWdub3JlIGB0ZW1wbGF0ZWBcblx0Ly8gVE9ETzogdXNlIGEgZGlmZmVyZW50IGtleSBsYXRlclxuXHRpZiAoa2V5ID09PSAndGVtcGxhdGUnKSByZXR1cm4gdmFsdWU7XG5cblx0Ly8gQWxzbyBpZ25vcmUgdGhpbmdzIHRoYXQgc3RhcnQgd2l0aCBfXG5cdGlmIChrZXkubWF0Y2goL15fLykpIHJldHVybiB2YWx1ZTtcblxuXG5cdC8vIFJlZGlyZWN0cyB1c2VyIHRvIGNsaWVudC1zaWRlIFVSTCwgdy9vIGFmZmVjdGluZyBicm93c2VyIGhpc3Rvcnlcblx0Ly8gTGlrZSBjYWxsaW5nIGBCYWNrYm9uZS5oaXN0b3J5Lm5hdmlnYXRlKCcvZm9vJywgeyByZXBsYWNlOiB0cnVlIH0pYFxuXHRpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXiMjKC4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHRcdGZuID0gZnVuY3Rpb24gcmVkaXJlY3RBbmRDb3ZlclRyYWNrcygpIHtcblx0XHRcdHZhciB1cmwgPSBtYXRjaGVzWzFdO1xuXHRcdFx0RlJBTUVXT1JLLmhpc3RvcnkubmF2aWdhdGUodXJsLCB7XG5cdFx0XHRcdHRyaWdnZXI6IHRydWUsXG5cdFx0XHRcdHJlcGxhY2U6IHRydWVcblx0XHRcdH0pO1xuXHRcdH07XG5cdH1cblx0Ly8gTWV0aG9kIHRvIHJlZGlyZWN0IHVzZXIgdG8gYSBjbGllbnQtc2lkZSBVUkwsIHRoZW4gY2FsbCB0aGUgaGFuZGxlclxuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eIyguKlteLlxcc10rKS8pKSAmJiBtYXRjaGVzWzFdKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiBjaGFuZ2VVcmxGcmFnbWVudCgpIHtcblx0XHRcdHZhciB1cmwgPSBtYXRjaGVzWzFdO1xuXHRcdFx0RlJBTUVXT1JLLmhpc3RvcnkubmF2aWdhdGUodXJsLCB7XG5cdFx0XHRcdHRyaWdnZXI6IHRydWVcblx0XHRcdH0pO1xuXHRcdH07XG5cdH1cblx0Ly8gTWV0aG9kIHRvIHRyaWdnZXIgZ2xvYmFsIGV2ZW50XG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14oJS4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHRcdGZuID0gZnVuY3Rpb24gdHJpZ2dlckV2ZW50KCkge1xuXHRcdFx0dmFyIHRyaWdnZXIgPSBtYXRjaGVzWzFdO1xuXHRcdFx0RlJBTUVXT1JLLnZlcmJvc2UodGhpcy5pZCArICcgOjogVHJpZ2dlcmluZyBldmVudCAoJyArIHRyaWdnZXIgKyAnKS4uLicpO1xuXHRcdFx0RlJBTUVXT1JLLnRyaWdnZXIodHJpZ2dlcik7XG5cdFx0fTtcblx0fVxuXHQvLyBNZXRob2QgdG8gZmlyZSBhIHRlc3QgYWxlcnRcblx0Ly8gKHVzZSBtZXNzYWdlLCBpZiBzcGVjaWZpZWQpXG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14hISFcXHMqKC4qW14uXFxzXSk/LykpKSB7XG5cdFx0Zm4gPSBmdW5jdGlvbiBiYW5nQWxlcnQoZSkge1xuXG5cdFx0XHQvLyBJZiBzcGVjaWZpZWQsIG1lc3NhZ2UgaXMgdXNlZCwgb3RoZXJ3aXNlICdBbGVydCB0cmlnZ2VyZWQhJ1xuXHRcdFx0dmFyIG1zZyA9IChtYXRjaGVzICYmIG1hdGNoZXNbMV0pIHx8ICdEZWJ1ZyBhbGVydCAoISEhKSB0cmlnZ2VyZWQhJztcblxuXHRcdFx0Ly8gT3RoZXIgZGlhZ25vc3RpYyBpbmZvcm1hdGlvblxuXHRcdFx0bXNnICs9ICdcXG5cXG5EaWFnbm9zdGljc1xcbj09PT09PT09PT09PT09PT09PT09PT09PVxcbic7XG5cdFx0XHRpZiAoZSAmJiBlLmN1cnJlbnRUYXJnZXQpIHtcblx0XHRcdFx0bXNnICs9ICdlLmN1cnJlbnRUYXJnZXQgOjogJyArIGUuY3VycmVudFRhcmdldDtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmlkKSB7XG5cdFx0XHRcdG1zZyArPSAndGhpcy5pZCA6OiAnICsgdGhpcy5pZDtcblx0XHRcdH1cblxuXHRcdFx0YWxlcnQobXNnKTtcblx0XHR9O1xuXHR9XG5cblx0Ly8gTWV0aG9kIHRvIGxvZyBhIG1lc3NhZ2UgdG8gdGhlIGNvbnNvbGVcblx0Ly8gKHVzZSBtZXNzYWdlLCBpZiBzcGVjaWZpZWQpXG5cdGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL14+Pj5cXHMqKC4qW14uXFxzXSk/LykpKSB7XG5cblx0XHRmbiA9IGZ1bmN0aW9uIGxvZ01lc3NhZ2UoZSkge1xuXG5cdFx0XHQvLyBJZiBzcGVjaWZpZWQsIG1lc3NhZ2UgaXMgdXNlZCwgb3RoZXJ3aXNlIHVzZSBkZWZhdWx0XG5cdFx0XHR2YXIgbXNnID0gKG1hdGNoZXMgJiYgbWF0Y2hlc1sxXSkgfHwgJ0xvZyBtZXNzYWdlICg+Pj4pIHRyaWdnZXJlZCEnO1xuXHRcdFx0RlJBTUVXT1JLLmxvZyhtc2cpO1xuXHRcdH07XG5cdH1cblxuXHQvLyBNZXRob2QgdG8gYXR0YWNoIHRoZSBzcGVjaWZpZWQgY29tcG9uZW50L3RlbXBsYXRlIHRvIGEgcmVnaW9uXG5cdGVsc2UgaWYgKFxuXHRcdCgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eKFteLlxcc10rKVxccyo8XFwtXFxzKiguKlteLlxcc10pLykpICYmIG1hdGNoZXNbMV0gJiYgbWF0Y2hlc1syXSkgfHxcblx0XHQoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXihbXi5cXHNdKylcXHMqXFwtPlxccyooLipbXi5cXHNdKS8pKSAmJiBtYXRjaGVzWzFdICYmIG1hdGNoZXNbMl0gJiZcblx0XHRcdChtYXRjaGVzWyd0bXAnXSA9IG1hdGNoZXNbMV0pICYmIChtYXRjaGVzWzFdID0gbWF0Y2hlc1syXSkgJiYgKG1hdGNoZXNbMl0gPSBtYXRjaGVzWyd0bXAnXSkpXG5cdCkge1xuXHRcdGZuID0gZnVuY3Rpb24gYXR0YWNoVGVtcGxhdGUoKSB7XG5cblx0XHRcdC8vIFJlbW92ZSBhbGwgd2hpdGVzcGFjZSBmcm9tIG1hdGNoZXNcblx0XHRcdG1hdGNoZXNbMV0gPSBtYXRjaGVzWzFdLnJlcGxhY2UoLyhcXHMrKS9nLCAnJyk7XG5cdFx0XHRtYXRjaGVzWzJdID0gbWF0Y2hlc1syXS5yZXBsYWNlKC8oXFxzKykvZywgJycpO1xuXG5cdFx0XHR2YXIgcmVnaW9uID0gbWF0Y2hlc1sxXTtcblx0XHRcdHZhciB0ZW1wbGF0ZSA9IG1hdGNoZXNbMl07XG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZSh0aGlzLmlkICsgJyA6OiBBdHRhY2hpbmcgYCcgKyB0ZW1wbGF0ZSArICdgIHRvIGAnICsgcmVnaW9uICsgJ2AuLi4nKTtcblxuXG5cdFx0XHRpZiAoIXRoaXNbcmVnaW9uXSkge1xuXHRcdFx0XHRGUkFNRVdPUksuZXJyb3IodGhpcy5pZCwnOjogVHJ5aW5nIHRvIGF0dGFjaCByZWdpb24gd2l0aCBzaG9ydGhhbmQgKCcrdmFsdWUrJyksIGJ1dCBjb3VsZCBub3QgZmluZCByZWdpb24gYCcrcmVnaW9uKydgJyk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXNbcmVnaW9uXS5hdHRhY2godGVtcGxhdGUpO1xuXHRcdH07XG5cdH1cblxuXG5cdC8vIE1ldGhvZCB0byB0b2dnbGUgKCEpIHRoZSBzcGVjaWZpZWQgbW9kZWwgYXR0clxuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eXFwhXFxzKlxcQCguKlteLlxcc10pLykpICYmIG1hdGNoZXNbMV0pIHtcblx0XHRmbiA9IGZ1bmN0aW9uIHRvZ2dsZUF0dHIoKSB7XG5cdFx0XHRGUkFNRVdPUksudmVyYm9zZSh0aGlzLmlkICsgJyA6OiBUb2dnbGluZyBhdHRyICgnICsgbWF0Y2hlc1sxXSArICcpLi4uJyk7XG5cdFx0XHR2YXIgb2xkQXR0clZhbHVlID0gdGhpcy5tb2RlbC5nZXQoIG1hdGNoZXNbMV0gKTtcblxuXHRcdFx0aWYgKG9sZEF0dHJWYWx1ZSkge1xuXHRcdFx0XHR0aGlzLm1vZGVsLnNldCggbWF0Y2hlc1sxXSwgZmFsc2UgKTtcblx0XHRcdH1cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHR0aGlzLm1vZGVsLnNldCggbWF0Y2hlc1sxXSwgdHJ1ZSApO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHQvLyBNZXRob2QgdG8gY2hhbmdlIHRoZSBzcGVjaWZpZWQgbW9kZWwgYXR0clxuXHRlbHNlIGlmICgobWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9eXFxzKlxcQChbXj1dKyk9KFtePV0qKVxccyokLykpKSB7XG5cblx0XHR2YXIgYXR0ck5hbWUgPSBtYXRjaGVzWzFdO1xuXHRcdHZhciBuZXdBdHRyVmFsdWUgPSBtYXRjaGVzWzJdO1xuXG5cdFx0Zm4gPSBmdW5jdGlvbiBjaGFuZ2VBdHRyKCkge1xuXHRcdFx0dGhpcy5tb2RlbC5zZXQoYXR0ck5hbWUsIG5ld0F0dHJWYWx1ZSk7XG5cdFx0fTtcblx0fVxuXG5cdC8vIE1ldGhvZCB0byByZW1vdmUgdGhlIG1vZGVsIGZvciB0aGUgY3VycmVudCBjb21wb25lbnRcblx0ZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXlxccypcXC1cXHMqJC8pKSkge1xuXHRcdGZuID0gZnVuY3Rpb24gcmVtb3ZlTW9kZWwgKCkge1xuXG5cdFx0XHQvLyBPbmx5IHdvcmtzIGlmIG1vZGVsIGJlbG9uZ3MgdG8gYSBjb2xsZWN0aW9uXG5cdFx0XHRpZiAoIXRoaXMubW9kZWwuY29sbGVjdGlvbikgcmV0dXJuO1xuXG5cdFx0XHR0aGlzLm1vZGVsLmNvbGxlY3Rpb24ucmVtb3ZlKHRoaXMubW9kZWwpO1xuXHRcdH07XG5cdH1cblxuXG5cdC8vIGRlcHJlY2F0aW5nIGNsYXNzIG1hbmlwdWxhdGlvbiBzaG9ydGhhbmRcblx0Ly8gKG5vIG5lZWQgdG8gZG8gZG9tIG1hbmlwdWxhdGlvbiB1bmxlc3MgYWJzb2x1dGVseSBuZWNlc3NhcnkpXG5cblx0Ly8gLy8gTWV0aG9kIHRvIGFkZCB0aGUgc3BlY2lmaWVkIGNsYXNzXG5cdC8vIGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL15cXCtcXHMqXFwuKC4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHQvLyBcdGZuID0gZnVuY3Rpb24gYWRkQ2xhc3MoKSB7XG5cdC8vIFx0XHRGUkFNRVdPUksudmVyYm9zZSh0aGlzLmlkICsgJyA6OiBBZGRpbmcgY2xhc3MgKCcgKyBtYXRjaGVzWzFdICsgJykuLi4nKTtcblx0Ly8gXHRcdHRoaXMuJGVsLmFkZENsYXNzKG1hdGNoZXNbMV0pO1xuXHQvLyBcdH07XG5cdC8vIH1cblx0Ly8gLy8gTWV0aG9kIHRvIHJlbW92ZSB0aGUgc3BlY2lmaWVkIGNsYXNzXG5cdC8vIGVsc2UgaWYgKChtYXRjaGVzID0gdmFsdWUubWF0Y2goL15cXC1cXHMqXFwuKC4qW14uXFxzXSkvKSkgJiYgbWF0Y2hlc1sxXSkge1xuXHQvLyBcdGZuID0gZnVuY3Rpb24gcmVtb3ZlQ2xhc3MoKSB7XG5cdC8vIFx0XHRGUkFNRVdPUksudmVyYm9zZSh0aGlzLmlkICsgJyA6OiBSZW1vdmluZyBjbGFzcyAoJyArIG1hdGNoZXNbMV0gKyAnKS4uLicpO1xuXHQvLyBcdFx0dGhpcy4kZWwucmVtb3ZlQ2xhc3MobWF0Y2hlc1sxXSk7XG5cdC8vIFx0fTtcblx0Ly8gfVxuXHQvLyAvLyBNZXRob2QgdG8gdG9nZ2xlIHRoZSBzcGVjaWZpZWQgY2xhc3Ncblx0Ly8gZWxzZSBpZiAoKG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXlxcIVxccypcXC4oLipbXi5cXHNdKS8pKSAmJiBtYXRjaGVzWzFdKSB7XG5cdC8vIFx0Zm4gPSBmdW5jdGlvbiB0b2dnbGVDbGFzcygpIHtcblx0Ly8gXHRcdEZSQU1FV09SSy52ZXJib3NlKHRoaXMuaWQgKyAnIDo6IFRvZ2dsaW5nIGNsYXNzICgnICsgbWF0Y2hlc1sxXSArICcpLi4uJyk7XG5cdC8vIFx0XHR0aGlzLiRlbC50b2dnbGVDbGFzcyhtYXRjaGVzWzFdKTtcblx0Ly8gXHR9O1xuXHQvLyB9XG5cblx0Ly8gVE9ETzpcdGFsbG93IGRlc2NlbmRhbnRzIHRvIGJlIGNvbnRyb2xsZWQgdmlhIHNob3J0aGFuZFxuXHQvL1x0XHRcdGUuZy4gOiAnbGkucm93IC0uaGlnaGxpZ2h0ZWQnXG5cdC8vXHRcdFx0d291bGQgcmVtb3ZlIHRoZSBgaGlnaGxpZ2h0ZWRgIGNsYXNzIGZyb20gdGhpcy4kKCdsaS5yb3cnKVxuXG5cblx0Ly8gSWYgc2hvcnQtaGFuZCBtYXRjaGVkLCByZXR1cm4gdGhlIGRlcmVmZXJlbmNlZCBmdW5jdGlvblxuXHRpZiAoZm4pIHtcblxuXHRcdEZSQU1FV09SSy52ZXJib3NlKCdJbnRlcnByZXRpbmcgbWVhbmluZyBmcm9tIHNob3J0aGFuZCA6OiBgJyArIHZhbHVlICsgJ2AuLi4nKTtcblxuXHRcdC8vIEN1cnJ5IHRoZSByZXN1bHQgZnVuY3Rpb24gd2l0aCBhbnkgc3VmZml4IG1hdGNoZXNcblx0XHR2YXIgY3VycmllZEZuID0gZm47XG5cblx0XHQvLyBUcmFpbGluZyBgLmAgaW5kaWNhdGVzIGFuIGUuc3RvcFByb3BhZ2F0aW9uKClcblx0XHRpZiAodmFsdWUubWF0Y2goL1xcLlxccyokLykpIHtcblx0XHRcdGN1cnJpZWRGbiA9IGZ1bmN0aW9uIGFuZFN0b3BQcm9wYWdhdGlvbihlKSB7XG5cblx0XHRcdFx0Ly8gQmluZCAoc28gaXQgaW5oZXJpdHMgY29tcG9uZW50IGNvbnRleHQpIGFuZCBjYWxsIGludGVyaW9yIGZ1bmN0aW9uXG5cdFx0XHRcdGZuLmFwcGx5KHRoaXMpO1xuXG5cdFx0XHRcdC8vIHRoZW4gaW1tZWRpYXRlbHkgc3RvcCBldmVudCBidWJibGluZy9wcm9wYWdhdGlvblxuXHRcdFx0XHRpZiAoZSAmJiBlLnN0b3BQcm9wYWdhdGlvbikge1xuXHRcdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0RlJBTUVXT1JLLndhcm4oXG5cdFx0XHRcdFx0XHR0aGlzLmlkICsgJyA6OiBUcmFpbGluZyBgLmAgc2hvcnRoYW5kIHdhcyB1c2VkIHRvIGludm9rZSBhbiAnICtcblx0XHRcdFx0XHRcdCdlLnN0b3BQcm9wYWdhdGlvbigpLCBidXQgXCInICsgdmFsdWUgKyAnXCIgd2FzIG5vdCB0cmlnZ2VyZWQgYnkgYSBET00gZXZlbnQhXFxuJyArXG5cdFx0XHRcdFx0XHQnUHJvYmFibHkgYmVzdCB0byBkb3VibGUtY2hlY2sgdGhpcyB3YXMgd2hhdCB5b3UgbWVhbnQgdG8gZG8uJyk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGN1cnJpZWRGbjtcblx0fVxuXG5cblx0Ly8gT3RoZXJ3aXNlLCBpZiBubyBzaG9ydC1oYW5kIG1hdGNoZWQsIHBhc3MgdGhlIG9yaWdpbmFsIHZhbHVlXG5cdC8vIHN0cmFpZ2h0IHRocm91Z2hcblx0cmV0dXJuIHZhbHVlO1xufTtcbiJdfQ==
(12)
});
;