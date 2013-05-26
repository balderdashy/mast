// You can set this up however you like, we're just using require here to try it out.
require([
	'components/Operation',
	'text!components/Operation.html',
	'components/Nav',
	'text!components/Nav.html'
	], function (Operation, OperationTemplate, Nav, NavTemplate) {

		// Fire up app
		Mast.raise({

			// Build template and component sets
			templates: {
				Nav: NavTemplate,
				Operation: OperationTemplate
			},

			components: {
				Nav: Nav,
				Operation: Operation
			}

		}, function appReady () {
			Mast.log('App is ready.');
		});
});