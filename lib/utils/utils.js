/**
 * Utility functions that are used throughout the core.
 */

var Utils = {

	/**
	 * Grabs the Mast identifier from an HTML element.
	 * Supports `id`, `data-id`, or `data-region`
	 *
	 * @param  {DOMElement} el    [the DOM element to inspect]
	 * @param  {Boolean} required [whether an identifier is required]
	 *
	 * @return {String}           [identifier]
	 */
	el2id: function(el, required) {

		var id = $(el).attr('id');
		var dataId = $(el).attr('data-id') || $(el).attr('data-region');
		var contentsId = $(el).attr('contents');

		if (id && dataId) {
			throw new Error(id + ' :: Cannot set both `id` and `data-id`!  Please use one or the other.  (data-id is safest)');
		}
		if (required && !id && !dataId) {
			throw new Error('No id specified in element where it is required:\n' + el);
		}

		return id || dataId || contentsId;
	},

	/**
	 * Map an object's values, and return a valid object (this function is handy because
	 * underscore.map() returns a list, not an object.)
	 *
	 * @param {Object} obj            [Object whos values you want to map]
	 * @param  {Function} transformFn [Function to transform each object value by]
	 *
	 * @return {Object}                [New object with the values mapped]
	 */
	objMap: function objMap(obj, transformFn) {
		return _.object(_.keys(obj), _.map(obj, transformFn));
	}
};

module.exports = Utils;
