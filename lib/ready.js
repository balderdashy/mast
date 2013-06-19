// TODO: resolve how loading will work
var Framework = Mast;
////////////////////////////////////////////////////////////////////////////

// Fire callback if/when Framework core is ready
Framework.ready = function (cb) {

	if (Framework.isReady) {
		return cb();
	}

	async.auto({
		$: function (cb) {
			$(function() {
				cb();
			});
		}
	}, function (err) {
		if (err) return cb(err);

		Framework.isReady = true;
		cb();
	});
};