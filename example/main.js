// You can set this up however you like, we're just using require here to try it out.
require([
	'components/App',
	'models/Me',
	'models/Todo',
	'templates/Settings.html',
	'templates/TodoList.html'
	], function () {

		// Fire up app
		Mast.raise(function () {
			alert('loaded');
		});
});