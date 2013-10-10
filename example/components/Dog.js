/**
 * Dog
 *
 * The UI logic controlling the template with `data-id="Dog"`
 * Represents an individual Dog entry.
 */

FRAMEWORK.define('Dog', function () {
	return {

		events: {
			// Toggle highlighting on this dog's $el
			click: '! .highlighted.'
		}
	};
});
