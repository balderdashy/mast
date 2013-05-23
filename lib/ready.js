// Fire callback when Mast core is ready
Mast.ready = function (cb) {
	async.auto({
		$: function (cb) {
			$(function() {
				cb();
			});
		}
	}, cb);
};