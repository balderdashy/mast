Mast.define('Row', function () {
	
	return {

		// Model is passed down by parent component when this component is created

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

		cancelClose: function () {
			this.$el.stop();
		},
		cancelRender: function () {
			this.$el.stop();
		},

		afterRender: function () {
			this.$el.hide();
			this.$el.fadeIn();
		},

		// Standard model binding
		afterChange: {
			color: function (model, value, options) {
				this.$el.css({
					'background-color': value
				});
			}
		}
	};
});