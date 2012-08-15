
Mast.Tree = {
			
	initialize: function (attributes,options,dontRender){
				
		// Determine whether specified component is a className, class, or instance
		this.branchComponent = this._provisionPrototype(this.branchComponent,Mast.components,Mast.Component);
		
		// Determine whether specified collection is a className, class, or instance
		this.collection = this._provisionInstance(this.collection,Mast.models,Mast.Collection);
				
		// Initialize main component
		Mast.Component.prototype.initialize.call(this,attributes,options,true);
				
		_.bindAll(this);
				
		_.extend(this,attributes);
				
				
		// Watch for collection changes
		var self = this;
		this.collection.on('remove',function(model,collection,status) {
			self.removeBranch(model,status.index);
		});
		this.collection.on('add',function(model) {
			self.appendBranch(model);
		});
		this.collection.on('reset',function() {
			self.render();
		});
				
		// Verify branchComponent
		if (!this.branchComponent) {
			throw new Error("No branchComponent or branchTemplate specified!");
		}
	
				
		// Autorender is on by default
		// Default render type is "append", but you can also specify "replaceOutlet""
		if (!dontRender && this.autorender!==false) {
			if (this.replaceOutlet) {
				this.replace()
			}
			else {
				this.append();
			}
		}
				
	},
			
	// Render the Tree, its subcomponents, and all branch
	render: function (silent) {
		// Render main pattern
		Mast.Component.prototype.render.call(this,true);
				
		// Determine and verify branch outlet
		if (!this.branchOutlet) {
			// If no branchOutlet is explicitly specified,
			// just append the branch elements to this.$el
			this.$branchOutlet = this.$el;
		}
		else {
			// Otherwise use the branchOutlet selector to find
			// the branchOutlet element inside of this.$el
			this.$branchOutlet = this._verifyOutlet(this.branchOutlet,this.$el);
		}
				
		// Empty and append branches to the branch outlet
		if (this.collection.length == 0 ) {
			this.$branchOutlet.empty();
			this.$branchOutlet.append(this._generateEmptyHTML());
		}
		else {
			var self = this;
			this.collection.each(function(model,index){
				self.appendBranch(model);
			});
		}
				
		if (!silent) {
			this.trigger('afterRender');
		}
	},
			
	
	
	appendBranch: function (model) {
		
		// If this is the first branch, empty the emptyHTML element
		if (this.collection.length == 1) {
			this.$branchOutlet.empty();
		}
		
		(new this.branchComponent({
			parent: this,
			autorender: false,
			model: model,
			outlet: this.branchOutlet
		})).append();
	},
	
	removeBranch: function (model,index) {
		this.getBranchEl(index).remove();
		if (this.collection.length == 0 ) {
			this.$branchOutlet.append(this._generateEmptyHTML());
		}
	},


	// Lookup the element for the id'th branch
	getBranchEl: function (id) {
		return this.getBranchesEl().eq(id);
	},
			
	// Lookup $ set of all Branches
	getBranchesEl: function () {
		return this.$branchOutlet.children();
	},
			
	// Generate empty table html
	_generateEmptyHTML: function () {
		if (this.emptytemplate) {
			var pattern = new Mast.Pattern({
				template: this.emptytemplate
			});
			return $(pattern.generate());
		}
		else {
			return $(this.emptyHTML);
		}
	}
}