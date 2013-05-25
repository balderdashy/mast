// TODO: resolve how loading will work
var Framework = Mast;
////////////////////////////////////////////////////////////////////////////

/*
You should grab templates and components with something like requirejs
before calling Framework.raise()

Usage:
Framework.raise([options], [cb])

options -> {
	templates: {
		componentName: templateHTML
	},
	components: {
		componentName: ComponentDefinition
	}
}

cb -> function () {}

*/
Framework.raise = function (options, cb) {

	// If only one arg is present, use options as callback if possible
	// If options are not defined, use an empty object
	if (!cb && _.isFunction(options)) {
		cb = options;
	}
	if (!_.isObject(options)) {
		options = {};
	}

	// If log is specified, use it, otherwise use the console
	if (options.log) {
		Framework.log = options.log;
	}
	else {
		Framework.log = console.log;
		Framework.warn = console.warn;
		Framework.error = console.error;
		Framework.debug = console.debug;
	}

	// Merge with Framework.templates
	if (!_.isObject(options.templates) && !Framework.templates) {}
	else _.extend(Framework.templates, options.templates);

	// Merge with Framework.components
	// If no components are specified, issue warning
	if (!_.isObject(options.components) && !Framework.components) {}
	else _.extend(Framework.components, options.components);

	// Wait until Framework core is ready
	Framework.ready(function () {


		// TODO: v2.5
		// ################################
		// Load any missing templates named in our components asynchronously

		// Determine dependencies by parsing HTML for regions

		// Find a flat list of all the top-level region components
		// (i.e. <region>s which are not inside other <region>s)
		// ################################


		// TODO: v2.3
		// ################################
		// For all regions, absorb implicit templates, identifying discovered regions as subcomponents

		// If no implicit template found, and either:
		// (1) no component with the same name is found, and no template with the same name is found
		// or (2) a component w/ the same name is found, but no template is specified
		// Then throw an error and ignore that region.

		// How will this work?

		// Of the stuff initially in the DOM, and starting with each top-level region,
		// descend to the leaf branches in the current tree, absorbing the implicit contents 
		// from each of its child regions, until we reach a leaf.
		// ################################


		// TODO: v2.3
		// ################################
		// Only grab top-level regions, since implicit DOM parsing is enabled 
		// ################################

		// Collect any regions with the default component set from the DOM
		var defaultRegions = $('region[default]');
		
		// Now instantiate the appropriate default component in each
		defaultRegions.each(function(i,el) {
			var regionId = $(el).attr('id');
			var componentId = $(el).attr('default');
			Framework.debug('Appending ' + regionId + ' region\'s default component ('+componentId+')...');

			var component = new Framework.Component({
				$outlet: $(el)
			});
		});
		

		// ################################
		// Do the initial routing sequence
		//
		// Look at the #fragment url and fire the global route event
		// ################################

		// ################################
		// Fire the register event on all async endpoint collections/models
		//
		// This will let things like socket adapters make the initial connection
		// ################################

		// ################################
		// Trigger callback
		if (cb) cb();

	});
};