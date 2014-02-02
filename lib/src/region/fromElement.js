/**
 * Module dependencies
 */
var Utils = require('../utils/utils');



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

	// Build region
	var region = new FRAMEWORK.Region({
		id: Utils.el2id(el),
		$el: $(el),
		parent: parent
	});

	// If this region has a default component/template set,
	// grab the id  --  e.g. <region contents="Foo" />
	var componentId = $(el).attr('contents');


	/**************************
	 * Template implementation
	 **************************/

	// Append sub-component(s) to region automatically
	if ( FRAMEWORK.options.shortcut.template && componentId ) {

		region.append(componentId);


		/***********************
		 * Count implementation
		 ***********************/

		if (FRAMEWORK.options.shortcut.count) {
			// If `count` is set, render sub-component specified number of times.
			// e.g. <region template="Foo" count="3" />
			var count = $(el).attr('count');

			if (count) {

				// Remove one from count because shortcut.template appends one.
				count -= 1;
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
		}
	}

	return region;
};
