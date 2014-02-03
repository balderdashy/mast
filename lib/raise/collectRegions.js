/**
 * Collect any regions with the default component set from the DOM.
 */

module.exports = function collectRegions () {


	// Get top-level regions.
	var $regions;

	$regions = $('region[default],region[template],[data-region][default],[data-region][template]');


	$regions.each(function() {

		$el = $(this);

		// Provide backwards compatibility for legacy notation
		// (normalize to `template`)
		var componentId = $el.attr('default') || $el.attr('contents');
		$el.attr('template', componentId);


		//
		// TODO:
		// allow embedded templates to be named this way, e.g. `<region template="Foo"></region>`
		// (should be very easy)
		//


		// Now instantiate the appropriate default component in each
		// region with a specified template/component
		FRAMEWORK.Region.fromElement(this);
	});

};
