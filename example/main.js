// You can set this up however you like, we're just using require here to try it out.
require([
	'components/App',
	'text!templates/Nav.html'
	], function (App, NavTemplate) {

		console.log(NavTemplate);

		// Fire up app
		Mast.raise(function () {
			Mast.debug('App is ready.');
		});
});