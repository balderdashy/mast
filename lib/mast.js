// Create global Mast
var Mast;

// Allow dependencies to be passed in to keep global namespace clean
Mast = (function (Backbone, _, $) {

	var Framework = Backbone;
	
	Framework.Component = Backbone.View.extend({});
	
	return Framework;
})(Backbone, _, $);