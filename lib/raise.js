// User can decide when to fire Mast.raise yourself by first 
// grabbing templates and components with something like requirejs.

// Fired by end user app 
// All components should be loaded at this point!
// (Mast will check Mast.components for the definitions)
Mast.raise = function (cb) {

	// Wait until Mast core is ready
	Mast.ready(function () {


		// ################################
		// Load any missing templates named in our components asynchronously
		//
		// ################################

		// ################################
		// Determine dependencies by parsing HTML for regions

		// Find a flat list of all the top-level region components
		// (i.e. <region>s which are not inside other <region>s)
		// ################################


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


		// ################################
		// Perform automatic attachments for all top-level regions
		//
		// Use the same set of top-level regions from above to auto-attach the appropriate component
		// Components will be generated on the fly as needed for regions w/o a component, but with a template.
		//
		// For a standard single-page app, this step basically just takes the form of binding 
		// the top-level component to the body and nothing else
		// ################################

		// ################################
		// Now instantiate the components for each of the top level components
		//
		// All components which are attached to regions in the top-level components will be instantiated, 
		// and so on, all the way down.
		// This involves DOM event delegation, binding global event listeners, triggering custom lifecycle guards, etc.
		// ################################

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