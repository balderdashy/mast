define([], function () {
	return {

		'#': ' > TodoList',
		'#settings': ' > Settings',

		afterRender: function () {
			Mast.log('afterCreate');
		},

		beforeRender: function (cb) {
			this.timer = setTimeout(function () {
				console.log('beforeRender finished!');
				cb();
			}, 1000);
		},

		cancelRender: function () {
			clearTimeout(this.timer);
		}

	};
});