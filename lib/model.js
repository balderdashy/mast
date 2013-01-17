Mast.Model = Mast.Model.extend({
	initialize: function() {
		_.bindAll(this);
		
		// Trigger init event
		_.result(this,'init');
	},
	
	increment: function(key,amount,options) {
		var self = this;
		Mast.Component.prototype._normalizeArgs(key, amount, options, function(attrs,options) {
			attrs = _.objMap(attrs,function(amt,key) {
				return self.get(key)+amt;
			});
			self.set(attrs,options);
		});
	},
	
	decrement: function(key,amount,options) {
		var self = this;
		Mast.Component.prototype._normalizeArgs(key, amount, options, function(attrs,options) {
			attrs = _.objMap(attrs,function(amt,key) {
				return self.get(key)-amt;
			});
			self.set(attrs,options);
		});
	}
});

Mast.Collection = Mast.Collection.extend({

	initialize: function() {
		_.bindAll(this);
		
		// Allow model to be specified as a string, class def, etc.
		this.model = this.model && Mast.mixins.provisionPrototype(this.model,Mast.models,Mast.Model);
		
		// Determine autoFetch default state if not specified
		if (_.isUndefined(this.autoFetch)) {
			this.autoFetch = !! this.url;
		}

		// Absorb defaults, if provided
		if (this.defaults) {
			this.reset(this.defaults);
		}
		
		// Do autoFetch
		this.autoFetch && this.fetch();
		
		// Trigger init event
		_.result(this,'init');
	}
});