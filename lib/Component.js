// TODO: resolve how loading will work
var Framework = Mast;
////////////////////////////////////////////////////////////////////////////


Framework.Component = Framework.View.extend({
	
	events: {
		click: function (){
			alert('click');
		}
	},

	_initialize: function (properties) {

	},

	initialize: function (properties) {

		if (_.isObject(properties)) {

			// Disable or issue warnings about certain properties 
			// and methods to avoid confusion
			if (properties.initialize) {
				delete properties.initialize;
				Framework.warn('initialize() is not allowed in definitions.');
			}
			if (properties.init) {
				delete properties.init;
				Framework.warn('init() is not allowed in definitions.');
			}

			// Extend instance w/ specified properties and methods
			_.extend(this,properties);
		}

		_.bindAll(this);
	},

	// Non-global event delegation is disabled at the user level
	on: function () { this._disableLocalEventDelegator(); },
	off: function () { this._disableLocalEventDelegator(); },
	trigger: function () { this._disableLocalEventDelegator(); },

	_disableLocalEventDelegator: function () {
		Framework.warn('on(), off(), and trigger() are not allowed on components.  Global event delegation ftw!');
	}

});