// You can set this up however you like, we're just using require here to try it out.
require([
	'components/Nav',
	'text!components/Nav.html',
	'text!components/Nav.css'
	], function (Nav, NavTemplate) {

		// Fire up app
		Mast.raise({

			// Build template and component sets
			templates: {
				Nav: NavTemplate
			},

			components: {
				Nav: Nav
			}

		}, function appReady () {
			Mast.log('App is ready.');
		});
});