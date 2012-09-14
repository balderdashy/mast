// A Table is a special Component that may handle events for a
// homogenous collection of child components.
// 
// It also provides an API for performing CRUD operations on that
// collection, both on the clientside and over the Socket using
// Backbone REST-style semantics.
Mast.Table = {
			
	initialize: function (attributes,options,dontRender){
				
		// Determine whether specified branch component is a className, class, or instance
		this.rowcomponent = (this.rowcomponent && 
			this._provisionPrototype(this.rowcomponent,Mast.components,Mast.Component));
		
		// Determine whether specified collection is a className, class, or instance
		this.collection = this._provisionInstance(this.collection,Mast.models,Mast.Collection);
				
		// Initialize main component
		Mast.Component.prototype.initialize.call(this,attributes,options,true);
				
		_.bindAll(this);
				
		_.extend(this,attributes);
				
				
		// Watch for collection changes
		var self = this;
		if (this.collection) {
			this.collection.on('remove',function(model,collection,status) {
				self.removeBranch(model,status.index);
			});
			this.collection.on('add',function(model) {
				self.appendBranch(model);
			});
			this.collection.on('reset',function() {
				self.renderBranches();
			});
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
			
	// Render the Table, its subcomponents, and all branch
	render: function (silent,changes) {
		var self = this;
		
		// Render main pattern
		Mast.Component.prototype.render.call(this,true,changes);
		
		this.renderBranches(changes);
				
		if (!silent) {
			this.trigger('afterRender');
		}
	},
	
	renderBranches: function (changes) {

		var self = this;
		
		// Determine and verify branch outlet
		if (!this.rowoutlet) {
			// If no rowoutlet is explicitly specified,
			// just append the branch elements to this.$el
			this.$rowoutlet = this.$el;
		}
		else {
			// Otherwise use the rowoutlet selector to find
			// the rowoutlet element inside of this.$el
			this.$rowoutlet = this._verifyOutlet(this.rowoutlet,this.$el);
		}

		var allCustomChanges = changes && _.all(changes,function(v,attrName) {
			return (self.bindings[attrName]);
		});
				
		
		// If not all of the changed attributes were accounted for, 
		// go ahead and trigger a complete rerender
		if (!allCustomChanges) {		
			// Empty and append branches to the branch outlet
			if (this.collection && this.collection.length == 0 ) {
				this.$rowoutlet.empty();
				this.$rowoutlet.append(this._generateEmptyHTML());
			}
			else {
				this.$rowoutlet.empty();
				this.collection && this.collection.each(function(model,index){
					self.appendBranch(model);
				});
			}
		}
	},
			
	
	
	appendBranch: function (model) {
		
		// If this is the first branch, empty the emptyHTML element
		if (!this.rowcomponent) { throw new Error ('No rowcomponent specified!'); }
		if (this.collection && this.collection.length == 1) {
			this.$rowoutlet.empty();
		}
		(new this.rowcomponent({
			parent: this,
			autorender: false,
			model: model,
			outlet: this.rowoutlet
		})).append();
	},
	
	removeBranch: function (model,index) {
		this.getBranchEl(index).remove();
		if (this.collection && this.collection.length == 0 ) {
			this.$rowoutlet.append(this._generateEmptyHTML());
		}
	},


	// Lookup the element for the id'th branch
	getBranchEl: function (id) {
		return this.getBranchesEl().eq(id);
	},
			
	// Lookup $ set of all Branches
	getBranchesEl: function () {
		return this.$rowoutlet.children();
	},
			
	// Generate empty Table html
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