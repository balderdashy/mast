define([], function () {
	return {

		'#': ' > TodoList',
		'#settings': ' > Settings',

		events: {
			click: 'switchContent'
		},

		switchContent: function () {
			this.navOperations.attach();
		},

		afterRender: function () {
			Mast.log('afterCreate');
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