// TODO: resolve how loading will work
var Framework = Mast;
////////////////////////////////////////////////////////////////////////////


Framework.Component = Framework.View.extend({
	
	events: {
		click: function (){
			alert('click');
		}
	},

	/* 
	 * Constructor
	 */
	initialize: function (properties) {

		// Disable or issue warnings about certain properties 
		// and methods to avoid confusion
		properties = this._validateDefinition(properties);

		// Extend instance w/ specified properties and methods
		_.extend(this,properties);

		_.bindAll(this);
	},

	/*
	* Run HTML template through engine and append result to outlet
	*/
	render: function () {
		Framework.debug(this.id + ' :: render()');

		if (!this.$outlet) {
			throw new Error(this.id + ' :: render() called, but no $outlet was defined!');
		}

		// Refresh compiled template
		this._compileTemplate();

		// Append to DOM
		this.$outlet.append(this.$el);
	},

	// Non-global event delegation is disabled at the user level
	on: function () { this._disableLocalEventDelegator(); },
	off: function () { this._disableLocalEventDelegator(); },
	trigger: function () { this._disableLocalEventDelegator(); },

	_compileTemplate: function () {

		// Create template data context by providing access to the global Data object,
		// Also fold in the model associated with this component, if there is one
		templateContext = _.extend({}, Mast.Data);
		if (this.model) {
			_.extend(templateContext, this.model.attributes);
		}

		// Save reference to templateContext for debugging purposes
		this._templateContext = templateContext;

		// TODO: allow precompiled templates

		// Template the HTML with the data
		// (don't try more than 1000 times, just to be safe)
		var html, repetitions = 0;
		// while (repetitions < 1000) {
			try {
				html = _.template(this.template, templateContext);
				// break;
			}
			catch (e) {
				Framework.error(this.id + ' :: render() error in template :: ' + e.toString() + '.');
				// repetitions++;
			}
		// }

		// Set Backbone element (cache and redelegate DOM events)
		// (Will also update this.$el)
		this.setElement(html);
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

			// Clone properties to avoid inadvertent modifications
			return _.clone(properties);
		}
		else return {};
	},

	_disableLocalEventDelegator: function () {
		Framework.warn(this.id + ' :: on(), off(), and trigger() are not allowed on components.  Global event delegation ftw!');
	}

});