define([], function () {
	return {

		
		events: {
			click: 'addContent'
		},

		addContent: function () {
			this.navOperations.append('Operation');
		}

	};
});