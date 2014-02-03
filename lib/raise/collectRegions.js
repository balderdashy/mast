/**
 * Collect any regions with the default component set from the DOM.
 */

module.exports = function collectRegions () {

	$('region[default],region[template],[data-region][default],[data-region][template]').each(function() {
		$e = $(this);

		// Provide backwards compatibility for legacy notation
		// (normalize to `template`)
		var componentId = $e.attr('default') || $e.attr('contents');
		$e.attr('template', componentId);


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
