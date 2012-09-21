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
			this.collection.on('remove',function(model,collection,options) {
				self.removeBranch(model,options);
			});
			this.collection.on('add',function(model,collection,options) {
				self.appendBranch(model,options);
			});
			this.collection.on('reset',function(collection,options) {
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
		!silent && this.trigger('beforeRender');
		Mast.Component.prototype.render.call(this,silent,changes);
		!silent && this.trigger('afterRender');
	},
	
	// Render the Tree's branches
	renderBranches: function (silent,changes) {
		!silent && this.trigger('beforeRender');
		// If no branchOutlet is explicitly specified, just append the branch elements to this.$el
		// Otherwise use the branchOutlet selector to find the branchOutlet element inside of this.$el
		this.$branchOutlet = (this.branchOutlet) ? this._verifyOutlet(this.branchOutlet,this.$el) : this.$el;

		// customchanges = the set of bindings for _remove, _add, and _reset
		var allCustomChanges = changes && _.all(changes,function(v,attrName) {
			return (this.bindings[attrName]);
		},this);
		
		// If not all of the special tree bindings were accounted for, 
		// go ahead and trigger a naive rerender
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
					self.appendBranch(model,{},true);
				});
			}
		}
		!silent && this.trigger('afterRender');
	},
			
	
	// Add a new branch
	appendBranch: function (model,options,silent) {
		if (!this.branchComponent) { throw new Error ('No branchComponent specified!'); }
		// If this is the first branch, empty the emptyHTML element
		if (this.collection && this.collection.length == 1) {
			this.$branchOutlet.empty();
		}
		// Generate component
		var r = new this.branchComponent({
			parent: this,
			autoRender: false,
			model: model,
			outlet: this.branchOutlet
		});
		
		// TODO keep track of branch components for memory management
		// (and to unbind backbone + socket events)
		
		// Add at a position
		if (options && !_.isUndefined(options.at)) {
			var $outlet = r._verifyOutlet(null,
				r.parent && r.parent.$el);
			r.render();
			$outlet.children().eq(options.at) && $outlet.children().eq(options.at).before(r.$el);
		}
		// or append to the end
		else {
			r.append();
		}
		!silent && this.trigger('afterRender');
	},
	
	// Remove a branch
	removeBranch: function (model,options,silent) {
		this.getBranchEl(options.index).remove();
		if (this.collection && this.collection.length == 0 ) {
			this.$branchOutlet.append(this._generateEmptyHTML());
		}
		!silent && this.trigger('afterRender');
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