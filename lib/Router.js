// TODO: resolve how loading will work
var Framework = Mast;
////////////////////////////////////////////////////////////////////////////


// Wildcard routes to global event delegator
var router = new Framework.Router();
router.route(/(.*)/, 'route', function (route) {

	// Normalize home routes (# or null) to ''
	if (!route) {
		route = '';
	}

	// Trim parameters from route
	var trimmedRoute = route;
	
	var params = {

	};

	// Trigger route
	Framework.trigger('#' + trimmedRoute);
});