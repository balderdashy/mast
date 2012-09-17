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
		
		// Allow model to be specified as a string, class def, 
		this.model = this.model && Mast.mixins.provisionPrototype(this.model,Mast.models,Mast.Model);
		
		// Trigger init event
		_.result(this,'init');
	}
});