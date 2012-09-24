Mast.Model = Mast.Model.extend({
	initialize: function() {
		_.bindAll(this);
		
		// Trigger init event
		_.result(this,'init');
	}
})

Mast.Collection = Mast.Collection.extend({
	initialize: function() {
		_.bindAll(this);
		
		// Allow model to be specified as a string, class def, etc.
		this.model = this.model && Mast.mixins.provisionPrototype(this.model,Mast.models,Mast.Model);
		
		// Determine autoFetch default state if not specified
		if (_.isUndefined(this.autoFetch)) {
			this.autoFetch = !! this.url;
		}
		
		// Do autoFetch
		this.autoFetch && this.fetch();
		
		// Trigger init event
		_.result(this,'init');
	}
});