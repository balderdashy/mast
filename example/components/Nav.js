define([], function () {
	return {

		'#': ' > TodoList',
		'#settings': ' > Settings',

		afterRender: function () {
			Mast.log('afterCreate');

			console.log('-> regino thing -> ',this.navOperations);
		},

		beforeRender: function (cb) {
			this.$outlet.append('Loading...');
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