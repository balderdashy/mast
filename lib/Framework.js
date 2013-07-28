(function (frameworkId, $, _, Backbone) {
	var Framework = Backbone;

	// TODO: set up a proper build script
	window.Framework = Framework;

	// Remember the frameworkId for usage examples in warnings and errors
	Framework.id = frameworkId;

	// Start w/ empty templates, components, and data
	Framework.templates = {};
	Framework.components = {};
	Framework.data = {};

	// Region cache
	Framework.regions = {};

	// Shortcut defaults
	Framework.shortcut = {};
	Framework.shortcut.template = true;
	Framework.shortcut.count = true;

	// Expose framework global on window object
	window[Framework.id] = Framework;
})(
	// Name your framework
	'Mast',

	// Pass dependencies as args to keep global namespace clean
	$,
	_,
	Backbone
);