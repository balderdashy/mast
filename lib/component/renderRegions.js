/**
 * Module dependencies
 */
var deleteAllRegions = require('./deleteAllRegions');



/**
 * Instantiate region components and append any default
 * templates/components to the DOM
 */

module.exports = function renderRegions () {
	var self = this;

	deleteAllRegions();

	// Detect child regions in template
	var $regions = this.$('region, [data-region]');
	$regions.each(function (i, el) {

		// Provide backwards compatibility for
		// `default`, `contents` and `template` notation
		// Normalizes notation to `contents` attribute.
		var componentId = $(el).attr('default');
		componentId = componentId || $(el).attr('contents');
		componentId = componentId || $(el).attr('template');
		$(el).attr('contents', componentId);

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

		// As long as there are no collisions,
		// provide a friendly reference to the region on the top level of the collection
		if (!self[region.id]) {
			self[region.id] = region;
		}
	});
};

