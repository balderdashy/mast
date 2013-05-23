// You can set this up however you like, we're just using require here to try it out.
require([
	'../lib/index',
	'components/App'
	], function (Mast, App) {

		// Fire up app
		Mast.raise();
});