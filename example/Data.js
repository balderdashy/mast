define([], function () {
	return {

		// (can be overridden by models)
		Operation: new Mast.Model({
			defaults: {
				color: '#add'
			}
		})
	};
});