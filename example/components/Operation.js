define([], function () {
	return {

		// Standard model binding
		afterChange: function (changedAttrs) {
			
			if (changedAttrs.color) {
				this.css({
					'background-color': changedAttrs.color
				});
			}
		}
	};
});