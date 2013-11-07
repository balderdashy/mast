/**
 * Home
 *
 * The UI logic controlling the template with `data-id="Home"`
 * Represents the home page of the example application.
 */

TEST.define('Home', function () {
	return {

		'%test'		: '>>> An instance of the `Home` component received trigger: `%test`',

		events: {
			'click .change-title': 'changeTitle'
		},

		changeTitle: function() {
			var title = this.$('#changeTitle').val().trim();

			if (title)
				this.model.set('title', title);

			this.$('#changeTitle').val('');
		},

		afterChange: {
			title: function(newVal) {
				this.$('.page-title').text(newVal);
			}
		}

	};
});

