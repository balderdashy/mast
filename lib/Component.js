// TODO: resolve how loading will work
var Framework = Mast;
////////////////////////////////////////////////////////////////////////////


Framework.Component = Framework.View.extend();

/**
 * this.close( )
 *
 */
Framework.Component.prototype.close = function ( ) {

	Framework.debug('Closed ' + this.id + ' component.');
	this.remove();

};




/*
* this.render()
*
* Run HTML template through engine and append result to outlet
* Also rerender regions
*
*/
Framework.Component.prototype.render = function () {
	Framework.debug(this.id + ' :: render()');

	if (!this.$outlet) {
		throw new Error(this.id + ' :: render() called, but no $outlet was defined!');
	}

	// Refresh compiled template
	var html = this._compileTemplate();
	if (!html) return;

	// Set Backbone element (cache and redelegate DOM events)
	// (Will also update this.$el)
	this.setElement(html);

	// Detect and render all regions and their descendent components and regions
	this._renderRegions();

	// Append to DOM
	this.$outlet.append(this.$el);
};





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

		_.bindAll(this);
	},


	_renderRegions: function () {
		var self = this;

		// If any regions exist, empty them
		_.each(this.regions, function (region, key) {
			region.empty();
			delete this.regions[key];
		}, this);

		// Detect regions
		var $regions = this.$('region');
		$regions.each(function (i, el) {

			// TODO: support default components for regions
			// e.g. <region default="Foo"/>

			// Build region
			var region = new Framework.Region({
				id: $(el).attr('id'),
				$el: $(el),
				parent: self
			});

			// Keep track of regions, since we are the parent component
			self.regions[region.id] = region;
			t = self.regions;

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
			Framework.error(this.id + ' :: render() error in template :: ' + e.toString() + '.');
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


			// Clone properties to avoid inadvertent modifications
			return _.clone(properties);
		}
		else return {};
	},

	_disableLocalEventDelegator: function () {
		Framework.warn(this.id + ' :: on(), off(), and trigger() are not allowed on components.  Global event delegation ftw!');
	}

});
