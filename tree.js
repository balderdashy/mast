// A Tree is a special Component that may handle events for a
// homogenous collection of child components.
// 
// It also provides an API for performing CRUD operations on that
// collection, both on the clientside and over the Socket using
// Backbone REST-style semantics.
Mast.Tree = {
			
	initialize: function (attributes,options){
				
		// Determine whether specified branch component is a className, class, or instance
		this.branchComponent = (this.branchComponent && 
			Mast.mixins.provisionPrototype(this.branchComponent,Mast.components,Mast.Component));
		
		// Determine whether specified collection is a className, class, or instance
		// and replace with a valid instance if necessary
		this.collection = Mast.mixins.provisionInstance(this.collection,Mast.models,Mast.Collection);
				
		// Initialize main component
		Mast.Component.prototype.initialize.call(this,attributes,options);
		
		// Watch for collection changes
		var self = this;
		if (this.collection) {
			this.collection.on('remove',function(model,collection,status) {
				self.removeBranch(model,status.index);
			});
			this.collection.on('add',function(model,collection,options) {
				self.appendBranch(model,options);
			});
			this.collection.on('reset',function() {
				self.renderBranches();
			});
		}
	},
			
	// Render the branches and underlying component+subcomponents
	render: function (silent,changes) {
		this.renderComponent(true,changes);
		this.renderBranches(true,changes);
		// Fire the afterRender event if silent is not set
		if (!silent) {
			this.trigger('afterRender');
		}
	},
	
	// Render the underlying component and subcomponents
	renderComponent: function (silent,changes) {
		Mast.Component.prototype.render.call(this,silent,changes);
		if (!silent) {
			this.trigger('afterRender');
		}
	},
	
	// Render the Tree's branches
	renderBranches: function (silent,changes) {
		
		// If no branchOutlet is explicitly specified, just append the branch elements to this.$el
		// Otherwise use the branchOutlet selector to find the branchOutlet element inside of this.$el
		this.$branchOutlet = (this.branchOutlet) ? this._verifyOutlet(this.branchOutlet,this.$el) : this.$el;

		var allCustomChanges = changes && _.all(changes,function(v,attrName) {
			return (this.bindings[attrName]);
		},this);
				
		
		// If not all of the changed attributes were accounted for, 
		// go ahead and trigger a complete rerender
		if (!allCustomChanges) {		
			// Empty and append branches to the branch outlet
			if (this.collection && this.collection.length == 0 ) {
				this.$branchOutlet.empty();
				this.$branchOutlet.append(this._generateEmptyHTML());
			}
			else {
				this.$branchOutlet.empty();
				var self = this;
				this.collection && this.collection.each(function(model,index){
					self.appendBranch(model);
				});
			}
		}
		if (!silent) {
			this.trigger('afterRender');
		}
	},
			
	
	// Add a new branch
	appendBranch: function (model,options) {
		
		// If this is the first branch, empty the emptyHTML element
		if (!this.branchComponent) { throw new Error ('No branchComponent specified!'); }
		if (this.collection && this.collection.length == 1) {
			this.$branchOutlet.empty();
		}
		r = new this.branchComponent({
			parent: this,
			autoRender: false,
			model: model,
			outlet: this.branchOutlet
		});
		
		if (options && !_.isUndefined(options.at)) {
			var $outlet = r._verifyOutlet(null,
				r.parent && r.parent.$el);
			r.render();
			$outlet.children().eq(options.at) && $outlet.children().eq(options.at).before(r.$el);
		}
		else {
			r.append();
		}
	},
	
	// Remove a branch
	removeBranch: function (model,index) {
		this.getBranchEl(index).remove();
		if (this.collection && this.collection.length == 0 ) {
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
			
	// Generate empty tree html
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