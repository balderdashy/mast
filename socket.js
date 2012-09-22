// Mast.Socket wraps around socket.io to provide a universal API  
// for programatic communication with the Sails backend
Mast.Socket =_.extend(
{	
	// Local reference to Socket.io object
	io: window.io,	
	
	// The base url of the application
	baseurl: window.location.origin,
	
	// Whether to connect automatically
	autoconnect: true,
	
	// Map of entities and actions, by uri
	routes: {},
	
	// Override backbone.sync when Socket object is instantiated
	initialize: function() {
		_.bindAll(this);
		this.autoconnect && this.connect();
		Backbone.sync = function(method, model, options) {						// Override Backbone.sync	
			switch (method) {													// (reference: http://documentcloud.github.com/backbone/docs/backbone-localstorage.html)
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
	connect: function(baseurl) {
		if (!this.io) {
			throw new Error(
			"Can't connect to socket because the Socket.io "+
			"client library (io) cannot be found!"
			);
		}
		if (this.connected) {
			throw new Error(
				"Can't connect to "+baseurl+ " because you're "+
				"already connected to a socket @ " + this.baseurl+"!"
				);
		}
		this.baseurl = baseurl || this.baseurl;
		this._socket = this.io.connect(this.baseurl);
		Mast.Socket._socket.on('sessionUpdated',function(data) {				// Listen for latest session data from server and update local store
			Mast.Session = data;
		});
		Mast.Socket._socket.on('message',function(cometMessage) {				// Route server-sent comet events
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
	route: function (serverUri,serverData) {
		var extractParams = Backbone.Router.prototype._extractParameters,
			calculateRegex = Backbone.Router.prototype._routeToRegExp;
		_.each(Mast.Socket.routes,function(instances,routeUri) {				// Match the request's URI against each subcribed route
			var regex=calculateRegex(routeUri);
			if (serverUri.match(regex)) {
				var params=extractParams(regex,serverUri);						// Grab named uri parameters and include them as arguments
				_.each(instances,function(instance,index) {
					params.push(serverData);
					instance.action.apply(instance.context,params);				// Run the appropriate action on each matching, subscribed instance
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
			action: action,														// The function to trigger
			context: context													// Component where the logic will run
		})
	},
			
	// CRUD methods for Backbone usage
	create: function(model,options){
		var url = (model.url() || model.collection.url) + "/create";
		this.post(url,model.toJSON(),function (parsedResult) {
			options && options.success && options.success(parsedResult);
		});
	},
	
	find: function(model,options){
		url = model.url().replace(/\/*$/,'');									// Remove trailing slash and add /find to url
		var id = +(url.match(/(\/[^\/]+)$/)[0].replace(/[^0-9]/,''));
		url = url.replace(/(\/[^\/]+)$/,'/find');
		this.get(url, {id:id}, function (parsedResult) {						// Add id to params
			options && options.success && options.success(parsedResult);
		});
	},
	
	findAll: function(collection,options){
		var url = (collection.url) + "/findAll";
		this.get(url, {}, function (parsedResult) {
			options && options.success && options.success(parsedResult);
		});
	},
	
	update: function(model,options){
		var url = model.url().replace(/\/*$/,'');								// Remove trailing slash and add /update to url
		var id = +(url.match(/(\/[^\/]+)$/)[0].replace(/[^0-9]/,''));
		url = url.replace(/(\/[^\/]+)$/,'/update');
		var data = _.extend({id:id},model.toJSON());							// Add id to data params
		this.put(url, data, function (parsedResult) {
			options && options.success && options.success(parsedResult);
		});
	},
	
	destroy: function(model,options){
		var url = model.url().replace(/\/*$/,'');								// Remove trailing slash and add /destroy to url
		var id = +(url.match(/(\/[^\/]+)$/)[0].replace(/[^0-9]/,''));
		url = url.replace(/(\/[^\/]+)$/,'/destroy');
		this['delete'](url,{id:id},function (parsedResult) {					// Add id to data params
			options && options.success && options.success(parsedResult);
		});
	},
	
	// Request wrappers for each of the CRUD HTTP verbs
	get: function (url,data,options) { this.request(url,data,options,'get') },
	post: function (url,data,options) { this.request(url,data,options,'post') },
	put: function (url,data,options) { this.request(url,data,options,'put') },
	'delete': function (url,data,options) { this.request(url,data,options,'delete') },
	
	// Simulate an HTTP request to the backend
	request: function (url,data,options, method) {
		url = url.replace(/\/*$/,'');											// Remove trailing slash
		this._send('message',{
			url: url,
			data: data,
			method: method || 'get'
		},function (parsedResult) {
			options && ((_.isFunction(options) ? 
				options :														// If options is a function, treat it as a callback
				options.success) (parsedResult));								// Otherwise the "success" property will be treated as the callback
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
			try {
				var parsedResult = JSON.parse(result);
			}
			catch (e) {
				throw new Error("Server response could not be parsed:",result,e);
			}
			callback && callback(parsedResult);									// Call success callback if specified
		})
	}
},Backbone.Events)