/**
 * Module dependencies
 */
var deleteAllRegions = require('./deleteAllRegions'),
	el2DefaultTemplateID = require('../utils/el2DefaultTemplateID');



/**
 * Instantiate region components and append any default
 * templates/components to the DOM
 */

module.exports = function renderRegions () {
	var self = this;

	deleteAllRegions();

	// TODO: get closest descendant regions, not all descendant regions

	// Detect child regions in template
	var $regions = this.$('region, [data-region]');

	// But also check the top-level element of the component's template itself,
	// in case the top-level element is ITS OWN region
	$regions = $regions.add( this.$el.filter('region, [data-region]') );

	$regions.each(function (i, el) {

		// Detect default component id for child region
		var defaultComponentId = el2DefaultTemplateID(el);

		// Generate a region instance from the element
		// (modifying the DOM as necessary)
		var region = FRAMEWORK.Region.fromElement(el, self);

		// If region has no id, generate a unique region id w/i this component
		// that is unlikely to collide with my other named regions
		if (!region.id) {
			region.id = ''+
				FRAMEWORK.options.frameworkId +
				'__anonymous_region__' +
				self.anonymousRegionCounter;

			// Increment counter for next time
			self.anonymousRegionCounter++;
		}

		// Keep track of regions, since we are the parent component
		self.regions[region.id] = region;

		// As long as there are no collisions, also provide access to the region
		// on the top level of the component, e.g. so you can do `this.myRegion`
		// in your component methods.
		if (!self[region.id]) {
			self[region.id] = region;
		}
	});
};

