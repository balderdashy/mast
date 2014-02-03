/**
 * Module dependencies
 */

var el2DefaultTemplateID = require('../utils/el2DefaultTemplateID');





/**
 * Collect any TOP-LEVEL regions with the default template/component specified in the HTML
 *
 * Note:
 * This is only run on the original HTML page, not in client-side templates!!!
 * For that, see `lib/component/renderRegions.js`.
 *
 */

module.exports = function collectRegions () {


	// Get top-level regions.
	var $topLevelRegions = $('region, [data-region]').filter(function() {
		return $(this).parents('region, [data-region]').length === 0;
	});


	$topLevelRegions.each(function() {
		var el = this;
		var $el = $(this);

		// Provide backwards compatibility for legacy notation
		// (normalize to `template`)
		var componentId = el2DefaultTemplateID(el);


		// Find out if the region has any embedded HTML.
		// If it does, absorb that HTML into an anonymous template,
		// and mark the region with that template.
		// $el =



		//
		// TODO:
		// allow embedded templates to be named this way, e.g. `<region template="Foo"></region>`
		// (should be very easy)
		//


		// Now instantiate the appropriate default component in each
		// region with a specified template/component
		FRAMEWORK.Region.fromElement(el);
	});

};
