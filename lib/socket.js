// Mast.Socket wraps around socket.io to provide a universal API  
// for programatic communication with the Sails backend
Mast.Socket =_.extend(
{	
	
	// The base url of the application
	baseurl: window.location.origin,
	
	// Whether to connect automatically
	autoconnect: true,
	
	// Map of entities and actions, by uri
	routes: {},
	
	// Override backbone.sync when Socket object is instantiated
	initialize: function(cb) {
		_.bindAll(this);

		this.autoconnect && this.connect(cb);

		// Override Backbone.sync for Socket
		// (reference: http://documentcloud.github.com/backbone/docs/backbone-localstorage.html)
		Backbone.sync = function(method, model, options) {
			switch (method) {
				case "read":
					model.id ? 
						Mast.Socket.find(model,options) : 
						Mast.Socket.findAll(model,options);
					break;
				case "create":
					Mast.Socket.create(model,options);
					break;
				case "update":
					Mast.Socket.update(model,options);
					break;
				case "delete":
					Mast.Socket.destroy(model,options);
					break;
			}
		};
	},
	
	// Connect to socket
	connect: function(baseurl,cb) {
		var self = this;

		// Local reference to Socket.io object
		this.io = this.io || window.io;
		if (!this.io) {
			throw new Error(
			"Can't connect to socket because the Socket.io client library (io) cannot be found!"
			);
		}
		if (this.connected) {
			throw new Error(
				"Can't connect to "+baseurl+ " because you're "+
				"already connected to a socket @ " + this.baseurl+"!"
				);
		}
		this.baseurl = baseurl || this.baseurl;
		
		debug.debug("Connecting socket to "+this.baseurl);
		this._socket = this.io.connect(this.baseurl);

		// Listen for latest session data from server and update local store
		Mast.Socket._socket.on('sessionUpdated',function(data) {
			Mast.Session = data;
			Mast.Socket.trigger('sessionUpdated');
		});

		// Route server-sent comet events
		Mast.Socket._socket.on('message',function(cometMessage) {
			if (cometMessage.uri) {
				Mast.Socket.route(cometMessage.uri,_.clone(cometMessage.data));
			}
			else {
				debug.warn('Unknown message received from server.',cometMessage);
				throw new Error('Unknown message received from server.');
			}
		});
		this.connected = true;
	},
	
	// Route an incoming comet request to the appropriate context and action
	// TODO: use mixin here
	route: function (serverUri,serverData) {
		// Use Backbone's Router logic to parse parameters (/variable/parsing/:within/:path)
		var extractParams = Backbone.Router.prototype._extractParameters,
			calculateRegex = Backbone.Router.prototype._routeToRegExp;

		// Match the request's URI against each subcribed route
		_.each(Mast.Socket.routes,function(instances,routeUri) {
			// Peel off comet symbol (~)
			routeUri = _.str.ltrim(routeUri,'~');
			
			// Trim traliing and leading slashes
			routeUri = _.str.trim(routeUri,'/');
			var regex=calculateRegex(routeUri);
			if (serverUri.match(regex)) {

				// Grab named uri parameters and include them as arguments
				var params=extractParams(regex,serverUri);
				_.each(instances,function(instance,index) {
					params.push(serverData);

					// Run the appropriate action on each matching, subscribed instance
					instance.action.apply(instance.context,params);
				});
			}
		});
	},
	
	// Subscribe a client-side handler action to a server-sent event
	subscribe: function (routeUri,action,context) {
		if (!Mast.Socket.routes[routeUri]) {
			Mast.Socket.routes[routeUri] = [];
		}
		Mast.Socket.routes[routeUri].push({
			// The function to trigger
			action: action,

			// Component where the logic will run
			context: context
		});
	},
			
	// CRUD methods for Backbone usage
	create: function(model,options){
		var url = (model.url() || model.collection.url) + "/create";

		var data = model.toJSON();

		// Always pass a filter attribute in case this user is using the Sails API scaffold
		_.extend(data, {
			sails_filter: true
		});

		this.post(url,model.toJSON(),function (parsedResult) {
			options && options.success && options.success(parsedResult);
		});
	},
	
	find: function(model,options, huh){
		options = options || {};
		options.data = options.data || {};

		// Remove trailing slash and add /find to url
		url = model.url().replace(/\/*$/,'');
		var id = +(url.match(/(\/[^\/]+)$/)[0].replace(/[^0-9]/,''));

		// include an id attribute unless one is already set
		options.data = _.extend({
			id:id
		},options.data);

		// Always pass a filter attribute in case this user is using the Sails API scaffold
		_.extend(options.data, {
			sails_filter: true
		});

		// Add id to params
		this.get(url, options.data, function (parsedResult) {	
			console.log("FIND RESULT:",parsedResult);

			options && options.success && options.success(parsedResult);
		});
	},
	
	findAll: function(collection,options){
		options = options || {};
		options.data = options.data || {};

		var url = (collection.url);
		
		// Support limit/offset/search/sort params in main .fetch({}) instead of just in {data:{}}
		_.defaults(options.data,{
			where: options.where,
			search: options.search,
			limit: options.limit,
			skip: options.skip,
			order: options.order
		});

		// Always pass a filter attribute in case this user is using the Sails API scaffold
		_.extend(options.data, {
			sails_filter: true
		});

		this.get(url, options.data, function (parsedResult) {
			options && options.success && options.success(parsedResult);
		});
	},
	
	update: function(model,options){
		// Remove trailing slash and add /update to url
		var url = model.url().replace(/\/*$/,'');
		var id = +(url.match(/(\/[^\/]+)$/)[0].replace(/[^0-9]/,''));

		// Add id to data params
		var data = _.extend({id:id},model.toJSON());

		// Always pass a filter attribute in case this user is using the Sails API scaffold
		_.extend(data, {
			sails_filter: true
		});

		this.put(url, data, function (parsedResult) {
			options && options.success && options.success(parsedResult);
		});
	},
	
	destroy: function(model,options){
		// Remove trailing slash and add /destroy to url
		var url = model.url().replace(/\/*$/,'');
		var id = +(url.match(/(\/[^\/]+)$/)[0].replace(/[^0-9]/,''));

		// Add id to data params
		this['delete'](url,{id:id},function (parsedResult) {
			options && options.success && options.success(parsedResult);
		});
	},
	
	// Request wrappers for each of the CRUD HTTP verbs
	get: function (url,data,options) { this.request(url,data,options,'get'); },
	post: function (url,data,options) { this.request(url,data,options,'post'); },
	put: function (url,data,options) { this.request(url,data,options,'put'); },
	'delete': function (url,data,options) { this.request(url,data,options,'delete'); },
	
	// Simulate an HTTP request to the backend
	request: function (url,data,options, method) {
		// Remove trailing slashes and spaces
		url = url.replace(/\/*\s*$/,'');

		// If url is empty, use /
		if (url === '') url = '/';

		// If options is a function, treat it as a callback
		// Otherwise the "success" property will be treated as the callback
		var cb;
		if (_.isFunction(options)) cb = options;
		else cb = options.success;

		// If not connected, fall back to $.ajax
		if (!this.connected) {
			return $.ajax(url,_.extend(options,{
				data: data,
				type: method || 'get'
			}));
		}

		console.log('url',url);
		console.log('data',data);
		console.log('method',method);

		this._send('message',{
			url: url,
			data: data,
			method: method || 'get'
		},function (parsedResult) {

			// TODO
			// Handle errors
			if (parsedResult === 404) throw new Error("404: Not found");
			if (parsedResult === 403) throw new Error("403: Forbidden");
			if (parsedResult === 500) throw new Error("500: Server error");

			cb(parsedResult);
		});
	},
	
	/**
	 * Make a call to the server over the socket
	 *   label:		the request label
	 *   params:	data to pass with the request
	 *   callback:	optional callback fired when server responds
	 */
	_send: function (label,params,callback) {
		Mast.Socket._socket.emit(label,JSON.stringify(params),function(result) {
			var parsedResult;
			try {
				parsedResult = JSON.parse(result);
			}
			catch (e) {
				debug.debug("Could not parse:",result,e);
				throw new Error("Server response could not be parsed!");
			}

			// Call success callback if specified
			callback && callback(parsedResult);
		});
	}
},Backbone.Events);