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
			'click .change-title': function() {

				// Sanitize value from input field
				var title = this.$('#changeTitle').val().trim();

				// Persist to session
				if (title) {
					this.model.set('title', title);
				}

				// Empty out input field
				this.$('#changeTitle').val('');
			}
		}

	};
});

