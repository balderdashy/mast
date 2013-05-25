define([], function () {
	return {

		'#': ' > TodoList',
		'#settings': ' > Settings',

		afterRender: function () {
			Mast.log('afterCreate');
		}

	};
});