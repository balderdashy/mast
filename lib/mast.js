// Build mast objects and set defaults
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

	// Mast.raise() instantiates the Mast library with the specified options
	raise: function(options, afterLoadFn, beforeRouteFn) {

		// If function is specified as first argument, use it as 
		if (_.isFunction(options)) {
			afterLoadFn = options;
			options = {
				afterLoadFn: options
			};
		}

		// Set up template settings
		_.templateSettings = {
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
			if (options.removeTemplateIds !== undefined) {
				Mast.removeTemplateIds = options.removeTemplateIds;
			}

			// Register Mast.entities and enable inheritance
			Mast.mixins.registerEntities(); 

			// Convert options.routes into a format Backbone's router will accept
			// (can't have key:function(){} style routes, must use a string function name)
			var routerConfig = {
				routes: {}
			};
			var indexRoute = null;

			// If external router is specified in options, use it
			if(options.router) {
				Mast.routes = options.router;
			}

			// Decorate and interpret routes
			_.each(Mast.routes, function(action, query) {
				// "routes" is a reserved word
				if(query == "routes") throw new Error("Can't define a route using reserved word: '" + query + "'!");

				// Save index route for the end
				if(query == "index") {
					indexRoute = action;
				}
				routerConfig.routes[query] = query;
				routerConfig[query] = action;
			});

			// Define default (index) route
			routerConfig.routes[""] = "index";
			routerConfig.index = indexRoute;

			// Prepare template library
			// HTML templates can be manually assigned here
			// otherwise they can be loaded from DOM elements
			// or from a URL
			Mast.TemplateLibrary = {};

			// Initialize Socket
			// Override default base URL if one was specified
			if (Mast.Socket && options.socket) {
				Mast.Socket.baseurl = (options && options.baseurl) || Mast.Socket.baseurl;
				Mast.Socket.initialize();
			}

			// Before routing, trigger beforeRouteFn callback (if specified)
			options.beforeRouteFn && options.beforeRouteFn();

			// Extend and instantiate main router
			var AppRouter = Mast.Router.extend(routerConfig);

			var self = this;
			_.defer(function() {
				Mast.appRouter = new AppRouter();

				// Mast makes the assumption that you want to trigger
				// the route handler.  This can be overridden
				Mast.navigate = function(query, options) {
					return Mast.appRouter.navigate(query, _.extend({
						trigger: true
					}, options));
				};

				// TODO: Go ahead and absorb all of the templates in the library 
				// right from the get-go
				// TODO: parse rest of DOM to find and absorb implicit templates
				// when document is ready
				$(function() {

					// Launch history manager 
					Mast.history.start();

					// When Mast and $.document are ready, 
					// trigger afterLoad callback (if specified)
					options.afterLoadFn && _.defer(options.afterLoadFn);
				});
			});
		});
	}
}, Backbone.Events);