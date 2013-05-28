Mast.define('Nav', function () {
	return {

		'#': function () {
			this.$('li').removeClass('selected');
			this.$('li[href="#"]').addClass('selected');
		},
		'#aboutUs': function () {
			this.$('li').removeClass('selected');
			this.$('li[href="#aboutUs"]').addClass('selected');
		},
		'#contact': function () {
			this.$('li').removeClass('selected');
			this.$('li[href="#contact"]').addClass('selected');
		},

		events: {
			'click li': function (event) {
				var $theThingThatWasClicked = $(event.currentTarget);
				window.location.hash = $theThingThatWasClicked.attr('href');
			},
			'click button': '#signUp'
		}

	};
});