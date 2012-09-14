// Add outerHtml to jQuery
jQuery.fn.outerHTML = function(s) {
	return s
	? this.before(s).remove()
	: jQuery("<p>").append(this.eq(0).clone()).html();
};

// Build mast objects and set defaults
Mast = _.extend(Backbone,
{
	
	// Route map that will be populated by user definitions
	routes: {},
	
	// Model/collection dictionary that will be populated by user definitions
	models: {},
	
	// Cache of models and collections, by cid
	modelCache: {},
	
	// Component dictionary that will be populated by user definitions
	components: {},	
	
	// Detect mobile viewports (looks at the user agent string)
	isMobile: navigator.userAgent.match(/(iPhone|iPod|Android|BlackBerry)/),
	
	// Register models, collections, components, and trees and manage dependencies/inheritance
	registerEntities: function () {

		var infinityCounter = 0;
		while(Mast._registerQueue.length > 0) {
			_.each(Mast._registerQueue,function(v,i) {
				v.definition = v.definition || {};								// Support undefined definition
				var entitySet =													// Determine entity set (i.e. Mast.components, Mast.models)
					( v.type == 'tree' || v.type == 'component') ?
					Mast.components : Mast.models;
				var parent = (v.definition.extendsFrom) ?						// Determine parent
					entitySet[v.definition.extendsFrom] : 
					Mast[_.str.capitalize(v.type)];
				if (parent) {
					var newEntity = parent.extend(v.definition);				// Extend parent
					newEntity.prototype.events =								// Extend events hash as well
					_.extend({},parent.prototype.events,
						newEntity.prototype.events);
					entitySet[v.name] = newEntity;								// Register new instance in entity set
					Mast._registerQueue.splice(i,1);
				}
				else {
					infinityCounter++;
					if (infinityCounter > 1000) {
						debug.warn('Parent does not seem to be registered',
							v.definition.extendsFrom,"in:",entitySet
						);
						throw new Error("Could find parent, "+v.definition.extendsFrom+"!");	
					}
				}
			});
		}
	},
	
	// Mast.raise() instantiates the Mast library with the specified options
	raise: function (options,afterLoadFn,beforeRouteFn) {
		// Legacy support
		Mast.Table = Mast.Tree;
		
		$(function(){
			options = _.defaults(options || {},{								// Extend defaults
				socket			: true,
				afterLoadFn		: afterLoadFn,
				beforeRouteFn	: beforeRouteFn
			});
			
			Mast.registerEntities();											// Register Mast.entities and enable inheritance
			
			// Convert options.routes into a format Backbone's router will accept
			// (can't have key:function(){} style routes, must use a string function name)
			var routerConfig = {
				routes:{}
			};
			var indexRoute = null;
			
			// If external router is specified in options, use it
			if (options.router) {
				Mast.routes = options.router;
			}
			
			// Decorate and interpret routes
			_.each(Mast.routes,function(action,query) {
				// "routes" is a reserved word
				if (query=="routes") throw new Error("Can't define a route using reserved word: '"+query+"'!");
				
				// Save index route for the end
				if (query=="index") {
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
			Mast.TemplateLibrary = {}
			
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
			_.defer(function(){
				Mast.app = new AppRouter();
				
				
				// Mast makes the assumption that you want to trigger
				// the route handler.  This can be overridden
				Mast.navigate = function(query,options) {
					return Mast.app.navigate(query,_.extend({
						trigger:true
					},options));
				}
				
				// TODO: Go ahead and absorb all of the templates in the library 
				// right from the get-go
				
				// Set up template settings
				_.templateSettings = {
					//				variable: 'data',
					interpolate : /\{\{(.+?)\}\}/g,
					escape : /\{\{-(.+?)\}\}/g,
					evaluate : /\{\%(.+?)\%\}/g
				};
				
				// when document is ready
				$(function(){
					
					// Launch history manager 
					Mast.history.start();
					
					// When Mast and $.document are ready, 
					// trigger afterLoad callback (if specified)
					options.afterLoadFn && _.defer(options.afterLoadFn);
				});
			});
		});		
	}
},
Backbone.Events);

// Accepts:
// - Mast object 
// - string referencing object name
Mast._provisionPrototype= function (identity, identitySet) {
	
	if (identity && _.isObject(identity) && _.isFunction(identity)) {			// A Mast entity definition
		return identity;
	}
	else if (_.isString(identity)) {
		if (! (identitySet[identity])) {										// A string component name
			throw new Error("No entity with that name ("+identity+") exists!");
		}
		identity = identitySet[identity];
	}
	else {																		// Any other definition is invalid
		throw new Error ("Invalid identity provided: " + identity);
	}
	return identity;
}

Mast.Model = Mast.Model.extend({
	initialize: function() {
		_.bindAll(this);
		
		Mast.modelCache[this.cid] = this;
		// TODO: Make model cache smarter (instead of cids, use id+class name)
		// 
		// Trigger init event
		_.result(this,'init');
	}
})

Mast.Collection = Mast.Collection.extend({
	initialize: function() {
		_.bindAll(this);
		
		Mast.modelCache[this.cid] = this;
		
		// handle string model definitions to maintain parity with Mast.Component
		// and allow for dependencies to exist between files
		this.model = this.model && Mast._provisionPrototype(this.model,Mast.models);
		
		// Trigger init event
		_.result(this,'init');
	}
});