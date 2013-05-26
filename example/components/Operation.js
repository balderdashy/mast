define([], function () {
	return {

		events: {
			click: function () {
				this.model.set({
					color: Mast.randomPastelColor()
				});
			}
		},

		beforeClose: function (cb) {
			this.$el.animate({
				opacity: 0,
				height: 0,
				paddingTop: 0,
				paddingBottom: 0
			}, 300, cb);
		},

		afterRender: function () {
			this.$el.hide();
			this.$el.fadeIn();
		},

		// Standard model binding
		afterChange: function (changedAttrs) {
			
			// Change color
			if (changedAttrs.color) {
				this.$el.css({
					'background-color': changedAttrs.color
				});
			}
		}
	};
});