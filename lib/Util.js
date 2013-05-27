// TODO: resolve how loading will work
var Framework = Mast;
////////////////////////////////////////////////////////////////////////////

Framework.Util = {

	// Grab id or data-id from an HTML element
	el2id: function (el) {
		var id = $(el).attr('id');
		var dataId = $(el).attr('data-id');

		if (id && dataId) {
			throw new Error(id + ' :: Cannot set both `id` and `data-id`!  Please use one or the other.  (data-id is safest)');
		}
		if (!id && !dataId) {
			throw new Error('No id specified in element where it is required:\n' + el);
		}

		return id || dataId;
	}

};