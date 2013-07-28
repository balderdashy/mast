Mast.define('Row', function () {
	
	return {
		extendComponents: ['Colors', 'Red'],

		// Model is passed down by parent component when this component is created

		events: {
			click: function () {
				this.model.set({
					color: Mast.randomPastelColor()
				});
			}
		},

		beforeClose: function (cb) {
			var self = this;

			self.$el.removeClass('lightSpeedIn');
			self.$el.addClass('lightSpeedOut');

			setTimeout(function () {
				self.$el.animate({
					opacity: 0,
					height: 0,
					paddingTop: 0,
					paddingBottom: 0
				}, 200, cb);
			},400);
		},
		
		afterRender: function () {
			this.$el.addClass('animated');
			this.$el.addClass('lightSpeedIn');
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
