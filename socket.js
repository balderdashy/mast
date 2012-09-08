// Mast.Socket wraps around socket.io to provide a universal API  
// for programatic communication with the Sails backend
Mast.Socket =_.extend(
{	
	io: window.io,
	baseurl: window.location.origin,
	autoconnect: true,
	initialize: function() {
		_.bindAll(this);
		if (this.autoconnect) {
			this.connect();
		}
				
				
		// Override Backbone.sync
		Backbone.sync = function(method, model, options) {
			var resp;
					
			switch (method) {
				case "read":
					model.id ? Mast.Socket.find(model,options) : Mast.Socket.findAll(model,options);
					break;
				case "create":
					resp = Mast.Socket.create(model,options);
					break;
				case "update":
					resp = Mast.Socket.update(model,options);
					break;
				case "delete":
					resp = Mast.Socket.destroy(model,options);
					break;
			}
		};
	},
			
	// CRUD methods for Backbone usage
	// (reference: http://documentcloud.github.com/backbone/docs/backbone-localstorage.html)
	create: function(model,options){
		var url = (model.url() || model.collection.url) + "/create";
		
		this.send('message',_.extend({
			url: url
		},model.toJSON()),function (parsedResult) {
			options && options.success && options.success(parsedResult);
		});
	},
	find: function(model,options){
//		var url = (model.url || model.collection.url) + "/find";
		var url = model.url();
		
		// Remove trailing slash and add /update to url
		url = url.replace(/\/*$/,'');
		var id = +(url.match(/(\/[^\/]+)$/)[0].replace(/[^0-9]/,''));
		url = url.replace(/(\/[^\/]+)$/,'/find');
		
		this.send('message',_.extend({
			id: id,
			url: url
		},model.toJSON()),function (parsedResult) {
			options && options.success && options.success(parsedResult);
		});
	},
	findAll: function(collection,options){
		var url = (collection.url) + "/findAll";
		this.send('message',{
			url: url
		},function (parsedResult) {
			options && options.success && options.success(parsedResult);
		});
	},
	update: function(model,options){
		var url = model.url();
		
		// Remove trailing slash and add /update to url
		url = url.replace(/\/*$/,'');
		var id = +(url.match(/(\/[^\/]+)$/)[0].replace(/[^0-9]/,''));
		url = url.replace(/(\/[^\/]+)$/,'/update');
		
		this.send('message',_.extend({
			id: id,
			url: url
		},model.toJSON()),function (parsedResult) {
			options && options.success && options.success(parsedResult);
		});
	},
	destroy: function(model,options){
		var url = model.url();
		
		// Remove trailing slash and add /destroy to url
		url = url.replace(/\/*$/,'');
		var id = +(url.match(/(\/[^\/]+)$/)[0].replace(/[^0-9]/,''));
		url = url.replace(/(\/[^\/]+)$/,'/destroy');
		
		this.send('message',_.extend({
			id: id,
			url: url
		},model.toJSON()),function (parsedResult) {
			options && options.success && options.success(parsedResult);
		});
	},
				
	// TODO: Investigate removing this and doing it all automatically
	events: {
		connect: "status"
	},

	// Report status of socket
	status: function() {
		debug.debug("Socket " + (this.connected ? "connected to "+this.baseurl+".":"not connected!!!"));
	},

	// Connect to socket
	connect: function(baseurl) {
		if (!this.io) {
			throw new Error(
			"Can't connect to socket because the Socket.io "+
			"client library (io) cannot be found!"
			);
		};
		if (this.connected) {
			throw new Error(
				"Can't connect to "+baseurl+ " because you're "+
				"already connected to a socket @ " + this.baseurl+"!"
				);
		}
					
		this.baseurl = baseurl || this.baseurl;
		
		this._socket = this.io.connect(this.baseurl);
		
		// Listen for latest session data from server and update local store
		Mast.Socket._socket.on('sessionUpdated',function(data) {
			Mast.Session = data;
		});
		
		// Route server-sent comet events
		Mast.Socket._socket.on('message',function(data) {	
			if (data && (data.model || data.collection) && data.method) {
				if (data.model && data.collection) {
					debug.warn('model or collection may be specified, but not both!  They are synonyms.',data);
					throw new Error('Message from server is invalid.');
				}
				data.model = data.collection || data.model;
				
				// Clone attributes
				var attributes = _.clone(data.attributes);
				
				// Access the model cache to update the appropriate models
				Mast.routeToModel(data.model,data.method,attributes);
			}
			else {
				debug.warn('Unknown message received from server.',data);
				throw new Error('Unknown message received from server.');
			}
		});
					
		this.connected = true;
	},
	
	/**
	 * If options is a function, treat it as a callback
	 * Otherwise the "success" property will be treated as the callback
	 */
	request: function (url,data,options) {
		// Remove trailing slash
		url = url.replace(/\/*$/,'');

		this.send('message',_.extend({
			url: url
		},data),function (parsedResult) {
			options && ((_.isFunction(options) && options || options.success) (parsedResult));
		});
	},
	
	
	/**
	 * Make a call to the server over the socket
	 *   label:		the request label
	 *   params:	data to pass with the request
	 *   callback:	optional callback fired when server responds
	 */
	send: function (label,params,callback) {
		Mast.Socket._socket.emit(label,JSON.stringify(params),function(result) {
			try {
				var parsedResult = JSON.parse(result);
			}
			catch (e) {
				throw new Error("Server response could not be parsed:",result,e);
			}
			
			// Call success callback if specified
			callback && callback(parsedResult);
		})
	}
	
//	joinRoom: function (room,callback) {
//		this.send ('joinRoom',{room:room},callback);
//	},
//	
//	leaveRoom: function (room,callback){
//		this.send ('leaveRoom',{room:room},callback);
//	}
},Backbone.Events)