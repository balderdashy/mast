// Build mast objects and set defaults
// Mast is also a global event dispatcher (before router is instantiated!)
Mast = _.extend(Backbone, {

	// Whether to remove ids from template elements automatically before absorption
	removeTemplateIds: true,

	// Route map that will be populated by user definitions
	routes: {},

	// Model/collection dictionary that will be populated by user definitions
	models: {},

	// Component dictionary that will be populated by user definitions
	components: {},

	// Detect mobile viewports (looks at the user agent string)
	isMobile: navigator.userAgent.match(/(iPhone|iPod|Android|BlackBerry)/ig),

	isTouch: navigator.userAgent.match(/(iPad|iPhone|iPod|Android|BlackBerry)/ig),

	// Mast.raise() instantiates the Mast library with the specified options
	raise: function(options, afterLoadFn, beforeRouteFn) {

		// If function is specified as first argument, use it as 
		if(_.isFunction(options)) {
			afterLoadFn = options;
			options = {
				afterLoadFn: options
			};
		}

		// Set up template settings
		_.templateSettings = options.templateSettings || {
			//			variable: 'data',
			interpolate: /\{\{(.+?)\}\}/g,
			escape: /\{\{-(.+?)\}\}/g,
			evaluate: /\{\%(.+?)\%\}/g
		};

		$(function() {
			options = _.defaults(options || {}, { // Extend defaults
				socket: true,
				afterLoadFn: afterLoadFn,
				beforeRouteFn: beforeRouteFn
			});

			// Absorb key Mast property overrides from options
			if(options.removeTemplateIds !== undefined) {
				Mast.removeTemplateIds = options.removeTemplateIds;
			}

			// Register Mast.entities and enable inheritance
			Mast.mixins.registerEntities();


			// Prepare template library
			// HTML templates can be manually assigned here
			// otherwise they can be loaded from DOM elements
			// or from a URL
			Mast.TemplateLibrary = {};

			// Initialize Socket
			// Override default base URL if one was specified
			if(Mast.Socket && options.socket) {
				Mast.Socket.baseurl = (options && options.baseurl) || Mast.Socket.baseurl;
				Mast.Socket.initialize();
			}

			// Before routing, trigger beforeRouteFn callback (if specified)
			options.beforeRouteFn && options.beforeRouteFn();

			// Clone router
			Mast.Router = Backbone.Router.extend({});

			// Instantiate router and trigger routerInitialized event on components
			var router = new Mast.Router();

			// "Warm up" the router so that it will create Backbone.history
			router.route("somecrazyneverusedthing", "somenameofsomecrazyneverusedthing", function() {
				throw new Error("Can't listen on a route using reserved word: somenameofsomecrazyneverusedthing!");
			});

			// Add wildcard route
			Backbone.history.route(/.*/, function(fragment) {

				// Trigger specific route event
				Mast.trigger("route:#" + fragment);

				// Trigger cross-browser global hashchange event
				Mast.trigger("event:$hashchange");
			});

			// LEGACY: Decorate and interpret defined routes
			// (Routes are now handled as subscriptions in components)
			_.each(Mast.routes, function(action, query) {
				// "routes" is a reserved word
				if(query == "routes") throw new Error("Can't define a route using reserved word: '" + query + "'!");

				// Index and "" are the same thing
				if(query === "index" || query === "") {
					router.route("", "index", action);
				}

				// Set up route
				router.route(query, query, action);
			});

			// Mast makes the assumption that you want to trigger
			// the route handler.  This can be overridden
			Mast.navigate = function(query, options) {
				return router.navigate(query, _.extend({
					trigger: true
				}, options));
			};


			// TODO: Go ahead and absorb all of the templates in the library 
			// right from the get-go
			// TODO: parse rest of DOM to find and absorb implicit templates
			
			// Launch history manager 
			Mast.history.start();

			// When Mast and $.document are ready, 
			// trigger afterLoad callback (if specified)
			options.afterLoadFn && _.defer(options.afterLoadFn);
			options.afterRouteFn && _.defer(options.afterRouteFn);
		});
	}
}, Backbone.Events);