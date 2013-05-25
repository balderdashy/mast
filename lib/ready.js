// TODO: resolve how loading will work
var Framework = Mast;
////////////////////////////////////////////////////////////////////////////

// Fire callback when Framework core is ready
Framework.ready = function (cb) {
	async.auto({
		$: function (cb) {
			$(function() {
				cb();
			});
		}
	}, cb);
};