// Create global Mast
var Mast;

// Allow dependencies to be passed in to keep global namespace clean
Mast = (function (Backbone, _, $) {
	var Framework = Backbone;
	
	Framework.templates = {};
	Framework.components = {};
	Framework.data = {};

	// Region cache
	Framework.regions = {};

	// Shortcut defaults
	Framework.shortcut = {};
	Framework.shortcut.template = true;
	Framework.shortcut.count = true;
	
	return Framework;
})(Backbone, _, $);