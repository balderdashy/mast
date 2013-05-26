define([], function () {
	return {

		'#': ' > TodoList',
		'#settings': ' > Settings',

		afterRender: function () {
			Mast.log('afterCreate');
		},

		beforeRender: function (cb) {
			console.log(this.$outlet);
			this.$outlet.append('test');
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