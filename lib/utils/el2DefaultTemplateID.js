/**
 * Inspect a DOM element and see if it has a default component/template ID.
 * Provides backwards-compatibility layer, and normalizes the syntax in the DOM.
 *
 * @param  {DOMElement} el
 * @return {String}    [the id of the default component/template, if one was specified]
 */
module.exports = function (el) {

	// Provide backwards compatibility for
	// `default`, `contents` and `template` notation
	var componentId = $(el).attr('template') || $(el).attr('default') || $(el).attr('contents');

	// Normalize to `template` attribute in the DOM.
	$(el).attr('template', componentId);

	return componentId;
};
