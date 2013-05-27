// TODO: resolve how loading will work
var Framework = Mast;
////////////////////////////////////////////////////////////////////////////


Framework.Component = Framework.View.extend();

/**
 * this.close( )
 *
 * Safely zap every trace about this component from memory.
 *
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




/*
* this.render( [atIndex] )
*
* Run HTML template through engine and append result to outlet
* Also rerender regions
*
* If atIndex is specified, the component is rendered at the given position within its outlet 
* Otherwise, the last position is used
*
*/
Framework.Component.prototype.render = function (atIndex) {
	Framework.debug(this.id + ' :: render()');

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
		if (!html) return;

		// Parse a DOM node or series of DOM nodes from the newly templated HTML
		var parsedNodes = $.parseHTML(html);
		var el = parsedNodes[0];

		// If no nodes were parsed, throw an error
		if (parsedNodes.length === 0) {
			throw new Error(self.id + ' :: render() ran into a problem rendering the template with HTML => \n'+html);
		}

		// If there is not one single wrapper element,
		// or if the rendered template contains only a single text node,
		// wrap the html up in a container <div/>
		else if (parsedNodes.length > 1 || parsedNodes[0].nodeType === 3) {
			el = $('<div/>').append(html);
			el = el[0];
		}

		// Set Backbone element (cache and redelegate DOM events)
		// (Will also update self.$el)
		self.setElement(el);

		// Detect and render all regions and their descendent components and regions
		self._renderRegions();

		// Insert the element at the proper place amongst the outlet's children
		// But if the outlet is empty, or there's no atIndex, just stick it on the end
		var neighbors = self.$outlet.children();
		if (atIndex && neighbors.length > 0 && neighbors.length < atIndex) {
			neighbors.eq(atIndex).before(self.$el);
		}
		else self.$outlet.append(self.$el);

		// Trigger afterRender method
		self.afterRender();
	});

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
	afterChange: function () {},

	// this.collection
	afterAdd: function () {},
	afterRemove: function () {},
	afterReset: function () {}

});




/**
 * 'Banned' methods
 *
 */
_.extend(Framework.Component.prototype, {

	// Non-global event delegation is disabled at the user level
	on: function () { this._disableLocalEventDelegator(); },
	off: function () { this._disableLocalEventDelegator(); },
	trigger: function () { this._disableLocalEventDelegator(); }

});




/**
 * 
 * 
 * Catalog of built-in events
 * ---------------------------------------------------------------------------------
 * "add" (model, collection, options) — when a model is added to a collection.
 * "remove" (model, collection, options) — when a model is removed from a collection.
 * "reset" (collection, options) — when the collection's entire contents have been replaced.
 * "sort" (collection, options) — when the collection has been re-sorted.
 * "change" (model, options) — when a model's attributes have changed.
 * "change:[attribute]" (model, value, options) — when a specific attribute has been updated.
 * "destroy" (model, collection, options) — when a model is destroyed.
 * "request" (model, xhr, options) — when a model (or collection) has started a request to the server.
 * "sync" (model, resp, options) — when a model (or collection) has been successfully synced with the server.
 * "error" (model, xhr, options) — when a model's save call fails on the server.
 * "invalid" (model, error, options) — when a model's validation fails on the client.
 * "route:[name]" (params) — Fired by the router when a specific route is matched.
 * "route" (router, route, params) — Fired by history (or router) when any route has been matched.
 * "all" — this special event fires for any triggered event, passing the event name as the first argument.
 *
 */


/**
 * Private methods
 *
 */
_.extend(Framework.Component.prototype, {

	// Constructor
	initialize: function (properties) {

		// Disable or issue warnings about certain properties 
		// and methods to avoid confusion
		properties = this._validateDefinition(properties);

		// Extend instance w/ specified properties and methods
		_.extend(this,properties);

		// Start with empty regions object
		this.regions = {};

		// Bind to model and/or collection events if one was passed in
		if (this.collection) {
			this.collection.on('add', this.afterAdd, this);
			this.collection.on('remove', this.afterRemove, this);
			this.collection.on('reset', this.afterReset, this);
		}

		if (this.model) {
			var self = this;
			this.model.on('change', function () {

				// Calculated changed attributes
				var c = self.model.changedAttributes();
				console.log(c);

				this.afterChange(c);
			}, this);
		}

		_.bindAll(this);
	},

	// If any regions exist, empty them
	_emptyAllRegions: function () {
		_.each(this.regions, function (region, key) {
			region.empty();
			delete this.regions[key];
		}, this);
	},

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

			// If this region has a default components
			// e.g. <region default="Foo"/>
			var defaultComponentId = $(el).attr('default');
			if (defaultComponentId) {
				
				// Extract default component id
				var componentId = defaultComponentId;

				// And append component to region automatically
				region.append(componentId);
			}

			Framework.debug(self.id + ' :: Instantiated region: ' + region.id);

		});
	},

	// Convert template HTML and data into a compiled $template
	_compileTemplate: function () {

		// Create template data context by providing access to the global Data object,
		// Also fold in the model associated with this component, if there is one
		var templateContext = _.extend({}, Mast.Data);
		if (this.model) {
			_.extend(templateContext, this.model.attributes);
		}

		// TODO: support for precompiled templates

		// Template the HTML with the data
		var html;
		try {
			html = _.template(this.template, templateContext);
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


			// Clone properties to avoid inadvertent modifications
			return _.clone(properties);
		}
		else return {};
	},

	_disableLocalEventDelegator: function () {
		Framework.warn(this.id + ' :: on(), off(), and trigger() are not allowed on components.  Global event delegation ftw!');
	}

});
