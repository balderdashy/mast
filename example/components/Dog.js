/**
 * Dog
 *
 * The UI logic controlling the template with `data-id="Dog"`
 * Represents an individual Dog entry.
 */

TEST.define('Dog', function () {
	return {

		// This direct DOM manipulation is no longer necessary-- HTML data bindings can be used instead.
		// Both approaches will continue to be supported.
		//
		// events: {
		// 	click: '! .highlighted.'
		// }


		// Instead:
		// Toggle highlighting on this dog's $el
		click: '! @selected'

		// Equivalent to:
		// click: function () {
		// 	if (this.model.get('selected')) {
		// 		this.model.set({selected: false});
		// 	}
		// 	else {
		// 		this.model.set({selected: true});
		// 	}
		// }
	};
});
