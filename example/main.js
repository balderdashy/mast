// You can set this up however you like, we're just using require here to try it out.
require([
	'components/Nav',
	'text!templates/Nav.html'
	], function (Nav, NavTemplate) {

		// Build template and component sets
		Mast.templates = {
			Nav: NavTemplate
		};

		Mast.components = {
			Nav: Nav
		};

		// Fire up app
		Mast.raise(function () {
			Mast.debug('App is ready.');
		});
});