// Create global Mast
var Mast;

// Allow dependencies to be passed in to keep global namespace clean
Mast = (function (Backbone, _, $) {
	var Framework = Backbone;
	
	Framework.templates = {};
	Framework.components = {};
	
	return Framework;
})(Backbone, _, $);