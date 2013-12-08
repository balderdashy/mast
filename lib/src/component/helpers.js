
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

		// Render initial data bindings
		_renderBindings({
			attribute: 'bind-text',
			renderFn: function ($boundElement, val) {
				$boundElement.text(val);
			},
			component: this,
			model: this.model
		});


		_renderBindings({
			attribute: 'bind-class-:foo',
			renderFn: function ($boundElement, val) {
				if (val) {
					$boundElement.addClass(val);
				}
				else {
					$boundElement.removeClass(val);
				}
			},
			component: this,
			model: this.model
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



// Build selector for superset of these bindings
var _attrNameToRegExp = function(attrName) {
	var optionalParam = /\((.*?)\)/g;
	var namedParam = /(\(\?)?:\w+/g;
	var splatParam = /\*\w+/g;
	var escapeRegExp = /[\-{}\[\]+?.,\\\^$|#\s]/g;

	attrName = attrName.replace(escapeRegExp, '\\$&')
		.replace(optionalParam, '(?:$1)?')
		.replace(namedParam, function(match, optional) {
			return optional ? match : '([^\/]+)';
		})
		.replace(splatParam, '(.*?)');
	return '^' + attrName + '$';
};
var _extractParameters = function(regexp, attrName) {
	var params = regexp.exec(attrName).slice(1);
	return _.map(params, function(param) {
		return param ? decodeURIComponent(param) : null;
	});
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


	// TODO: batch it up so we only do one DOM query
	$matches.each(function () {
		var $matchedEl = $(this);

		// Get all attributes for this $el and filter a set of matching names/params
		var allDOMAttrNames = _.map( $matchedEl[0].attributes, function (el) {
			return el.nodeName;
		});

		var matchingDOMAttrs = {};
		_.each( allDOMAttrNames, function( domAttrName ) {
			if ( !domAttrName.match(attrRegExp)) return;
			matchingDOMAttrs[domAttrName] = _extractParameters( attrRegExp, domAttrName );
		});

		_.each(matchingDOMAttrs, function ( params, domAttributeName ) {
			var rawBinding = $matchedEl.attr( domAttributeName );
			var modelAttributeName = rawBinding.replace(/^\@/, '');
			FRAMEWORK.debug('Found a binding ::', rawBinding, '::', params);

			if (!model.attributes[modelAttributeName]) {
				FRAMEWORK.warn('Cannot bind `@'+modelAttributeName+' for template/component ' +
					'`' + component.id +'`.\n'+
					'No such attribute exists in the component\'s model.'
				);
			}

			// Render a data binding
			var bindingVal = model.get(modelAttributeName) || '';
			options.renderFn( $matchedEl, bindingVal );
		});

	});
};


/**
 * Lookup suitable elements within this region
 * with the specified data-binding attribute
 *
 * @param {String} boundAttrSelector - DOM selector to use
 * @option {Component} component
 */
var _get$Matches = function ( boundAttrSelector, component ) {

	// Lookup matches
	var $matches = component.$(boundAttrSelector);

	// If top-level element in template has a data-binding, include it
	if (component.$el.filter(boundAttrSelector)) {
		$matches = $.merge($matches, component.$el);
	}

	// Omit anything inside a region, since those bindings will have already
	// been taken care of by one of the descendant component(s) within the region.
	//
	// TODO: optimize to exclude these elements from the original DOM selection
	$matches = $matches.not( component.$('region *, [data-region] *') );

	return $matches;
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

