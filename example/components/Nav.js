define([], function () {
	return {

		'#': ' > TodoList',
		'#settings': ' > Settings',

		events: {
			click: 'addContent'
		},

		addContent: function () {
			this.navOperations.append('Operation');
		},

		afterRender: function () {
			Mast.log('afterCreate');
		},

		beforeRender: function (cb) {
			var self = this;
			this.$outlet.append('Loading...');
			this.timer = setTimeout(function () {
				console.log('beforeRender finished!');
				self.$outlet.empty();
				cb();
			}, 1000);
		},

		cancelRender: function () {
			clearTimeout(this.timer);
		}

	};
});