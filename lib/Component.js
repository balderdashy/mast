// TODO: resolve how loading will work
var Framework = Mast;
////////////////////////////////////////////////////////////////////////////


Framework.Component = Framework.View.extend();

/**
 * Safely zap every trace about this component from memory.
 */

Framework.Component.prototype.close = function ( ) {
	Framework.debug('Closed ' + this.id + ' component.');
	var self = this;

	// Cancel current render and close jobs, if they're running
	if (this._rendering) {
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

		// Unlock close()
		this._closing = false;

		// Close all child components
		self._emptyAllRegions();

		self.remove();

	});
};

/**
 * Run HTML template through engine and append results to outlet. Also rerender regions.
 * If atIndex is specified, the component is rendered at the given position within its
 * outlet. Otherwise, the last position is used.
 *
 * @param {number} atIndex
 */

Framework.Component.prototype.render = function (atIndex) {
	Framework.debug(this.id + ' :: render()');

	var self = this;

	// Cancel current render and close jobs, if they're running
	if (this._rendering) {
		Framework.debug(this.id + ' :: render() canceled.');
		this.cancelRender();
		self._rendering = false;
	}
	if (this._closing) {
		Framework.debug(this.id + ' :: close() canceled.');
		this.cancelClose();
		self._closing = false;
	}

	// Lock access to render
	this._rendering = true;

	// Trigger beforeRender method
	this.beforeRender(function () {


		// Unlock rendering mutex
		self._rendering = false;

		if (!self.$outlet) {
			throw new Error(self.id + ' :: render() called, but no $outlet was defined!');
		}

		// Refresh compiled template
		var html = self._compileTemplate();
		if (!html) {
			Framework.warn(this.id + ' :: unable to render() because template compilation did not return any HTML.');
			return;
		}

		///////////////////////////////////////////////////////////////
		// Cody's stuff
		///////////////////////////////////////////////////////////////
		// Remove the current el
		delete self.el;

		// Set the el property
		self._ensureElement();

		// Set the el's html to the template
		self.$el.html(html);

		// Delegate Events
		self.delegateEvents();
		///////////////////////////////////////////////////////////////


		///////////////////////////////////////////////////////////////
		// Mike's stuff
		///////////////////////////////////////////////////////////////
		// // Parse a DOM node or series of DOM nodes from the newly templated HTML
		// var parsedNodes = $.parseHTML(html);
		// var el = parsedNodes[0];

		// // If no nodes were parsed, throw an error
		// if (parsedNodes.length === 0) {
		// 	throw new Error(self.id + ' :: render() ran into a problem rendering the template with HTML => \n'+html);
		// }

		// // If there is not one single wrapper element,
		// // or if the rendered template contains only a single text node,
		// // (or just a lone region)
		// // wrap the html up in a container <div/>
		// else if (	parsedNodes.length > 1 || parsedNodes[0].nodeType === 3 ||
		// 	$(parsedNodes[0]).is('region')) {

		// 	el = $('<div/>').append(html);
		// 	el = el[0];
		// }

		// // Set Backbone element (cache and redelegate DOM events)
		// // (Will also update self.$el)
		// self.setElement(el);
		///////////////////////////////////////////////////////////////


		// Detect and render all regions and their descendent components and regions
		self._renderRegions();

		// Insert the element at the proper place amongst the outlet's children
		// But if the outlet is empty, or there's no atIndex, just stick it on the end
		var neighbors = self.$outlet.children();
		if (_.isFinite(atIndex) && neighbors.length > 0 && neighbors.length >= atIndex) {
			neighbors.eq(atIndex).before(self.$el);
		}
		else self.$outlet.append(self.$el);

		// Trigger afterRender method
		self.afterRender();
	});

};



/**
 * Use Backbone's _ensureElement to ensure we don't change things too
 * much from normal backbone. This allows us to use things like className,
 * tagName, etc.
 *
 * NOTE: _ensureElement is overridden here to remove the id property.
 * This is needed because every element has an id set internally and it will
 * prevent a component from showing up multiple times in the dom if we use
 * the id.
 */

Framework.Component.prototype._ensureElement = function() {
	
	var attrs = _.extend({}, _.result(this, 'attributes'));
	if (this.className) {
		attrs['class'] = _.result(this, 'className');
	}

	var $el = Framework.$('<' + _.result(this, 'tagName') + '>').attr(attrs);
	this.setElement($el, false);
};



/**
 * Lifecycle hooks
 *
 */

_.extend(Framework.Component.prototype, {

	// Fired automatically when the view is initially created
	// only fired afterwards if this.render() is explicitly called
	// Callback must be fired!!
	beforeRender: function (cb) { cb(); },

	// Fired automatically when the view is initially created
	// only fired afterwards if this.render() is explicitly called
	afterRender: function () {},

	// Fired automatically when the view is closed
	beforeClose: function (cb) { cb(); }

});

_.extend(Framework.Component.prototype, {

	// Fired before rerendering or closing a view that is already waiting on a lock
	cancelRender: function () {
		Framework.warn('cancelRender() should be defined if beforeClose(cb) or beforeRender(cb) are being used!');
	},

	// Fired before rerendering or closing a view that is already waiting on a lock
	cancelClose: function () {
		Framework.warn('cancelClose() should be defined if beforeClose(cb) or beforeRender(cb) are being used!');
	}
});


_.extend(Framework.Component.prototype, {

	// this.model
	afterChange: function (model, options) {},
	// afterInvalid: function (model, error, options) {},

	// this.collection
	afterAdd: function (model, collection, options) {},
	afterRemove: function (model, collection, options) {},
	afterReset: function (collection, options) {}
	// afterSort: function (collection, options) {},

	// Server
	// afterDestroy: function (model, collection, options) {},
	// afterError: function (model, xhr, options) {},
	// afterRequest: function (collectionOrModel, xhr, options) {},
	// afterSync: function (collectionOrModel, response, options) {},
	// afterAll: function () {}

});


/**
 * 'Banned' methods
 *
 */
 
_.extend(Framework.Component.prototype, {

	// Non-global event delegation is disabled at the user level
	on: this._disableLocalEventDelegator,
	off: this._disableLocalEventDelegator,
	trigger: this._disableLocalEventDelegator,
	once: this._disableLocalEventDelegator,
	bind: this._disableLocalEventDelegator

	// These seem to be required by Backbone core
	// listenTo: this._disableLocalEventDelegator,
	// listenToOnce: this._disableLocalEventDelegator,
	// stopListening: this._disableLocalEventDelegator
});




/**
 * Private methods
 *
 */

_.extend(Framework.Component.prototype, {

	// Constructor
	initialize: function (properties) {
		var self = this;

		// Disable or issue warnings about certain properties
		// and methods to avoid confusion
		properties = this._validateDefinition(properties);

		// Extend instance w/ specified properties and methods
		_.extend(this,properties);

		// Start with empty regions object
		this.regions = {};

		// Bind to model and/or collection events if one was passed in
		if (this.collection) {

			// Listen to events
			this.listenTo(this.collection, 'add', this.afterAdd);
			this.listenTo(this.collection, 'remove', this.afterRemove);
			this.listenTo(this.collection, 'reset', this.afterReset);
		}

		if (this.model) {

			// Listen for any attribute changes
			// e.g.
			// .afterChange(model, options)
			//
			this.listenTo(this.model, 'change', function (model, options) {
				if (_.isFunction(this.afterChange)) {
					this.afterChange(model, options);
				}
			}, this);

			// Listen for specific attribute changes
			// e.g.
			// .afterChange.color(model, value, options)
			//
			if (_.isObject(this.afterChange)) {
				_.each(this.afterChange, function(handler, attrName) {
					this.model.on('change:' + attrName, handler, this);
				}, this);
			}
		}

		

		// TODO:	this could be optimized by pull this out of the wildcard event handler,
		//			but to do it elegantly would involve hacking the Backbone core to allow 
		//			regex routes.  An important, but easier, optimization would be wildcard 
		//			routing only as absolutely necessary (so non-param events get static routes)
		//
		//			It's very important that we test this part for performance on slower mobile devices
		//

		// First argument is event name, subsequent args are other params to trigger()
		this.listenTo(Framework, 'all', function (eRoute) {

			// Trim off all but the first argument to pass through to handler
			var args = Array.prototype.slice.call(arguments);
			args.shift();


			// Iterate through each subscription on this component
			// and listen for the specified global events
			_.each(self.subscriptions, function (handler, matchPattern) {

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
				if ( ! _.isFunction(handler) ) {
					handler = self[handler];

					if (!handler) {
						throw new Error('Cannot trigger subscription because of unknown handler: ' +handler);
					}
				}

				// Bind context and arguments to subscription handler
				handler.apply(self,_.union(args, params));
			});
		});

		// Encourage child methods to use the component context
		_.bindAll(this);
	},

	// If any regions exist, empty them
	_emptyAllRegions: function () {
		_.each(this.regions, function (region, key) {
			region.empty();
			delete this.regions[key];
		}, this);
	},




	/**
	 * 
	 */

	_renderRegions: function () {
		var self = this;

		this._emptyAllRegions();

		// Detect child regions in template
		var $regions = this.$('region');
		$regions.each(function (i, el) {

			// Pull id from region
			var regionId = $(el).attr('data-id') || $(el).attr('id');

			// Build region
			var region = new Framework.Region({
				id: regionId,
				$el: $(el),
				parent: self
			});


			// Keep track of regions, since we are the parent component
			self.regions[region.id] = region;

			// As long as there are no collisions,
			// provide a friendly reference to the region on the top level of the collection
			if (!self[region.id]) {
				self[region.id] = region;
			}

			// Extract default component id
			// if this region has a default components
			// e.g. <region default="Foo"/>
			var subcomponentId = $(el).attr('template') || $(el).attr('default');
			if (Mast.prototyping && subcomponentId) {

				// Render number of branches of a certain component defined in this region. The two 
				// attributes that are relevent in the region element are `count` and `template`
				var count = $(el).attr('count') || 1;

				// And append component to region automatically
				// (if `count` was specified, do it `count` times)
				console.log('preparing the region, and there are ' + region.$el.children().length + ' subcomponent elements in the region now');
				while (count > 0) {
					region.append(subcomponentId);

					console.log('rendering the ' + subcomponentId + ' component, remaining: ' + count + ' and there are ' + region.$el.children().length + ' subcomponent elements in the region now');
					count--;
				}

			}

			Framework.debug(self.id + ' :: Instantiated region: ' + region.id);

		});
	},

	// Convert template HTML and data into a compiled $template
	_compileTemplate: function () {

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

		// All Framework.data is available in every template
		Framework.data);

		// If a model is provided for this component, make it available in this template
		if (this.model) {
			_.extend(templateContext, this.model.attributes);
		}

		// TODO: support for precompiled templates

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
			Framework.error(this.id + ' :: render() error in template :\n' + e.toString() + '\nTemplate :: ' + html);
			html = this.template;
		}

		return html;
	},

	_validateDefinition: function (properties) {
		if (_.isObject(properties)) {

			// Determine component id
			var id = this.id || properties.id;

			// Disable or issue warnings about certain properties
			// and methods to avoid confusion
			if (properties.initialize) {
				delete properties.initialize;
				Framework.warn(id + ' :: initialize() is not allowed in component definitions.');
			}
			if (properties.init) {
				delete properties.init;
				Framework.warn(id + ' :: init() is not allowed in component definitions.');
			}
			if (properties.regions) {
				delete properties.regions;
				Framework.warn(id + ' :: `regions` are not allowed in component definitions.  Use <region/> tags in your template.');
			}
			if (properties.subscriptions) {
				delete properties.subscriptions;
				Framework.warn(id + ' :: `subscriptions` are not allowed in component definitions.  You can include route (#), global app event (%), and comet (~) handlers in the top level your component.');
			}
			if (properties.bindings) {
				delete properties.bindings;
				Framework.warn(id + ' :: `bindings` are not allowed in component definitions.  Try using the onChange(changedAttributes) method instead.');
			}
			if (properties.template) {
				delete properties.template;
				Framework.warn(id + ' :: `template` is not allowed in component definitions.  Name your template the same thing as your component and verify that everything is set up properly.');
			}
			if (properties.afterCreate) {
				delete properties.afterCreate;
				Framework.warn(id + ' :: afterCreate() is not allowed in component definitions.  You can use afterRender() for the same effect.');
			}
			if (properties.beforeCreate) {
				delete properties.beforeCreate;
				Framework.warn(id + ' :: beforeCreate() is not allowed in component definitions.  You can use beforeRender() for the same effect, but be sure and trigger the callback when you\'re finished, and to also write a cancelRender() so your component knows how to cancel any asynchronous operations.');
			}

			// Check that this.collection is actually an instance of Backbone.Collection
			// and that this.model is actually an instance of Backbone.Model
			validateBackboneInstance('model');
			validateBackboneInstance('collection');

			function validateBackboneInstance (type) {

				var Type = type[0].toUpperCase() + type.slice(1);

				if ( !properties[type] instanceof Backbone[Type] ) {

					Framework.error(
						'Component (' + id + ') has an invalid ' + type + '-- \n' + 
						'If `' + type + '` is set on a component, ' + 
						'it must be an *instance* of a Backbone.' + Type + '.\n');

					if (properties[type] instanceof Backbone[Type].constructor) {
						Framework.error(
							'However, a Backbone.' + Type + ' prototype was specified instead of a ' +
							'Backbone.' + Type + ' instance.\n' +
							'Please `new` up the ' + type + ' before assigning it ' + 
							'to the component, or use a wrapper function, e.g.:\n' +
							'`' + type + ': function () {\nreturn new Some' + Type + '();\n}`'
						);
					}

					Framework.warn('Ignoring invalid ' + type + ' :: ' + properties[type]);
					delete properties[type];
				}
			}

			// Clone properties to avoid inadvertent modifications
			return _.clone(properties);
		}
		else return {};
	},

	_disableLocalEventDelegator: function () {
		Framework.warn(this.id + ' :: on(), off(), trigger(), and the like are not allowed on components.  Global event delegation ftw!');
	}

});
