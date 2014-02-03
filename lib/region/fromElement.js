/**
 * Module dependencies
 */
var el2MastID = require('../utils/el2MastID'),
	el2DefaultTemplateID = require('../utils/el2DefaultTemplateID');



/**
 * Factory method to generate a new region instance from a DOM element
 * Also implements `template` and `count` directives.
 *
 * @param {Object} options
 * @returns region instance
 */

module.exports = function fromElement(el, parent) {

	// If parent is not specified, make-believe.
	parent = parent || { id: '*' };

	var $el = $(el);

	// Build region
	var region = new FRAMEWORK.Region({
		id: el2MastID(el),
		$el: $el,
		parent: parent
	});

	// If this region has a default component/template set,
	// grab the id  --  e.g. <region template="Foo" />
	var componentId = el2DefaultTemplateID(el);


	// If `template` shortcut is enabled, append specified sub-component(s)
	// to the region automatically
	if ( FRAMEWORK.options.shortcut.template && componentId ) {

		// If `count` is set, render sub-component specified number of times.
		// e.g. <region template="Foo" count="3" />
		//
		// (Note that if the `count` shortcut is disabled, `count` is always = 1)
		var count;
		if (FRAMEWORK.options.shortcut.count) {
			count = (typeof $el.attr('count') !== 'undefined') ? $el.attr('count') : 1;
		}

		// Append the subcomponent the appropriate # of times.
		for (var i=0; i < count; i++ ) {
			region.append(componentId);
		}

		FRAMEWORK.debug(
			parent.id + ' :-: Instantiated new region' +
			( region.id ? ' `' + region.id + '`' : '' ) +
			( componentId ? ' and populated it with' +
				( count > 1 ? count + ' instances of' : ' 1' ) +
				' `' + componentId + '`' : ''
			) + '.'
		);
	}

	return region;
};
