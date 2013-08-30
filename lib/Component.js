// TODO: resolve how loading will work
var Framework = window.FRAMEWORK;
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

	Framework.debug(this.id + ' :---: Rendering component...');

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
			throw new Error(self.id + ' :: Trying to render(), but no $outlet was defined!');
		}

		// Refresh compiled template
		var html = self._compileTemplate();
		if (!html) {
			throw new Error(this.id + ' :: Unable to render component because template compilation did not return any HTML.');
		}

		//

		///////////////////////////////////////////////////////////////
		// Cody's stuff
		// (disabled for now while debugging issue w/ `count`)
		///////////////////////////////////////////////////////////////
		// Remove the current el
		// delete self.el;

		// // Set the el property
		// self._ensureElement();

		// // Set the el's html to the template
		// self.$el.html(html);

		// // Delegate Events
		// self.delegateEvents();
		///////////////////////////////////////////////////////////////

		// -either/or-

		///////////////////////////////////////////////////////////////
		// Mike's stuff
		// (trying to diagnose issue with "count", put this here in case it worked)
		///////////////////////////////////////////////////////////////

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
		else if (	parsedNodes.length > 1 || 
					parsedNodes[0].nodeType === 3 ||
					$(parsedNodes[0]).is('region') ) {

			Framework.log(self.id + ' :: Wrapping template in <div/>...', parsedNodes);

			// wrap the html up in a container <div/>
			el = $('<div/>').append(html);
			el = el[0];
		}

		// Set Backbone element (cache and redelegate DOM events)
		// (Will also update self.$el)
		self.setElement(el);
		///////////////////////////////////////////////////////////////


		// Detect and render all regions and their descendent components and regions
		self._renderRegions();

		// Insert the element at the proper place amongst the outlet's children
		var neighbors = self.$outlet.children();
		if (_.isFinite(atIndex) && neighbors.length > 0 && neighbors.length > atIndex) {
			neighbors.eq(atIndex).before(self.$el);
		}

		// But if the outlet is empty, or there's no atIndex, just stick it on the end
		else self.$outlet.append(self.$el);

		// Finally, trigger afterRender method
		self.afterRender();

		
		// Add data attributes to this component's $el, providing access
		// to whether the element has various DOM bindings from stylesheets.
		// (handy for disabling text selection accordingly, etc.)
		//
		// -> disable for this component with `this.attrFlags = false`
		// -> or globally with `Framework.attrFlags = false`
		//
		// TODO: make it work with delegated DOM event bindings
		//
		if ( self.attrFlags !== false && Framework.attrFlags !== false ) {
			Framework.Util.DOM.flagComponent(self);
		}
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



/**
 * Default lifecycle events for bound model and/or collection
 */
_.extend(Framework.Component.prototype, {

	// Fired when the bound model is updated (`this.model`)
	afterChange: function (model, options) {},
	// afterInvalid: function (model, error, options) {},

	// Fired when a model is added to the bound collection (`this.collection`)
	afterAdd: function (model, collection, options) {},

	// Fired when a model is removed from the bound collection (`this.collection`)
	afterRemove: function (model, collection, options) {},

	// Fired when the bound collection is wiped (`this.collection`)
	afterReset: function (collection, options) {}


	// TODO:
	// Backbone version compatibility issues make this one tricky
	// afterSort: function (collection, options) {},

	// TODO: Server-oriented model/collection event bindings
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

	// Provide access to banned methods in `_ev` sub-object for private use
	_ev: {
		on: Framework.Component.prototype.on,
		off: Framework.Component.prototype.off,
		trigger: Framework.Component.prototype.trigger,
		once: Framework.Component.prototype.once,
		bind: Framework.Component.prototype.bind,
		listenTo: Framework.Component.prototype.listenTo,
		listenToOnce: Framework.Component.prototype.listenToOnce,
		stopListening: Framework.Component.prototype.stopListening
	},

	// Non-global event delegation is disabled at the user level
	on: _disableLocalEventDelegator,
	off: _disableLocalEventDelegator,
	trigger: _disableLocalEventDelegator,
	once: _disableLocalEventDelegator,
	bind: _disableLocalEventDelegator,


	// These seem to be required by Backbone core
	// listenTo: _disableLocalEventDelegator,
	// listenToOnce: _disableLocalEventDelegator
	// stopListening: _disableLocalEventDelegator

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
			});

			// Listen for specific attribute changes
			// e.g.
			// .afterChange.color(model, value, options)
			//
			if (_.isObject(this.afterChange)) {
				_.each(this.afterChange, function(handler, attrName) {

					// Call handler with newVal to keep arguments straightforward
					this.model.on('change:' + attrName, function (model, newVal) {
						handler.call(this,newVal);
					}, this);

				}, this);
			}
		}
		

		// TODO:	This could be optimized by pulling it out of the wildcard event handler,
		//			but to do it elegantly would involve hacking the Backbone core to allow 
		//			regex routes.  An important, but easier, optimization would be wildcard 
		//			routing only as absolutely necessary (so non-param events get static routes)
		//

		// First argument is event name, subsequent args are other params to trigger()
		this._ev.listenTo(Framework, 'all', function (eRoute) {

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

		// Bind context to event handlers
		_.each(this.events, function (handler, eventString) {
			_.bind(handler, this);
		}, this);
	},





	/**
	 * If any regions exist in this component, 
	 * empty them, and then delete them
	 */

	_emptyAllRegions: function () {
		_.each(this.regions, function (region, key) {
			region.empty();
			delete this.regions[key];
		}, this);
	},





	/**
	 * Instantiate region components and append any default
	 * templates/components to the DOM
	 */

	_renderRegions: function () {
		var self = this;

		this._emptyAllRegions();

		// Detect child regions in template
		var $regions = this.$('region');
		$regions.each(function (i, el) {

			// Provide backwards compatibility for old `default` notation
			var template = $(el).attr('default');
			$(el).attr('template', template);

			// Generate a region instance from the element
			// (modifying the DOM as necessary)
			var region = Framework.Region.fromElement(el, self);

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

			Framework.error(this.id + ' :: render() error in template :\n' + str + '\nTemplate :: ' + html + '\n' + stack);
			html = this.template;
		}

		return html;
	},




	/**
	 * Check the specified definition for obvious mistakes,
	 * especially likely deprecation issues from FRAMEWORK 1.x
	 */

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
			if (properties.render) {
				delete properties.render;
				Framework.warn(id + ' :: render() is not allowed in component definitions.');
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
				Framework.warn(id + ' :: `subscriptions` are not allowed in component definitions.  You can include route (#), global app event (%), and data (~) handlers in the top level of your component.');
			}
			if (properties.bindings) {
				delete properties.bindings;
				Framework.warn(id + ' :: `bindings` are not allowed in component definitions.  Try using the onChange(changedAttrs) method instead.\nYou can also specify an object corresponding to the model attributes to emulate the old behavior (e.g. `onChange: { someAttr: function myBinding(newVal) {} }` )');
			}
			if (properties.template) {
				delete properties.template;
				Framework.warn(id + ' :: `template` is not allowed in component definitions.  Name your template the same thing as your component and verify that everything is set up properly.');
			}
			if (properties.afterCreate) {
				delete properties.afterCreate;
				Framework.warn(id + ' :: afterCreate() is not allowed in component definitions.  You can now use afterRender() for the same effect.');
			}
			if (properties.beforeCreate) {
				delete properties.beforeCreate;
				Framework.warn(id + ' :: beforeCreate() is not allowed in component definitions.  You can now use beforeRender(cb) for the same effect, but be sure and trigger the callback when you\'re finished, and to also write a cancelRender() so your component knows how to cancel any asynchronous operations.');
			}


			// Handle bad event bindings
			// In particular, `window.onerror` should not be bound via Framework 
			// since it shouldn't use the jQuery `error` event
			// (see http://api.jquery.com/error/ for more information)
			if (properties['window error'] || (properties.events && properties.events['window error'])) {
				delete properties['window error'];
				if (properties.events) {
					delete properties.events['window error'];
				}
				Framework.warn(id + ' :: `window error` should not be bound using Backbone/jQuery.  See `http://api.jquery.com/error` for more information.');
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


			// Clone properties to avoid inadvertent modifications
			return _.clone(properties);
		}
		else return {};
	}

});


/**
 * Disable binding and triggering of component-local Backbone events.
 * Global events are more powerful and maintainable, and always a better choice!
 */

function _disableLocalEventDelegator () {
	throw new Error('\n' +
		'Local event binders like ' + this.id+'.on(\'foo\', fn), '+this.id+'.off(\'foo\', fn), '+this.id+'.trigger(\'foo\', theId), etc. \n' +
		'are no longer allowed on components.  Global event delegation is a much more maintainable solution\n' + 
		'for cross-component messaging anyways.\n\n' +
		'Please use global triggers and listeners on the ' + Framework.id + ' object instead--\n' +
		'e.g. ' + Framework.id + '.on(\'' + this.id + ':foo\', fn), ' + Framework.id + '.trigger(\''+this.id+':foo\', theId), etc.' + 
		'Alternatively, you can use the (%) shorthand syntax, which is available for subscriptions and triggers ' +
		'on all ' + Framework.id + ' components.\n\n' + 
		'For example, to bind a function to a custom global event called `' + this.id + ':foo` :: \n' +
		'\'%' + this.id + ':foo\': fn\n\n' +
		'To trigger the custom event ::\n' +
		'\'click .whatever\': \'%' + this.id + ':foo\''
	);
}