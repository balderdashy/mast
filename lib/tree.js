// A Tree is a special Component that may handle events for a
// homogenous collection of child components.
// 
// It also provides an API for performing CRUD operations on that
// collection, both on the clientside and over the Socket using
// Backbone REST-style semantics.
Mast.Tree = {
	
	// Keeps track of hot branch components for memory management
	_branchStack: [],
	
	initialize: function (attributes,options){
				
		// Determine whether specified branch component is a className, class, or instance
		this.branchComponent = (this.branchComponent && 
			Mast.mixins.provisionPrototype(this.branchComponent,Mast.components,Mast.Component));
		
		// Determine whether specified collection is a className, class, or instance
		// and replace with a valid instance if necessary
		this.collection = Mast.mixins.provisionInstance(this.collection,Mast.models,Mast.Collection);
				
		// Mixin scaffold subscriptions
		// Default subscriptions (for scaffolds)
		var defaultSubscriptions = {},entity = _.str.trim(this.collection.url,'/');
		if (entity) {
			defaultSubscriptions["~"+entity+'/create'] = function (attributes) {
				this.collection.add(attributes);
			};
			defaultSubscriptions["~"+entity+'/:id/update'] = function (id,attributes) {
				this.collection.get(id).set(attributes);
			};
			defaultSubscriptions["~"+entity+'/:id/destroy'] = function (id) {
				this.collection.remove(id);
			};
			this.subscriptions = _.defaults(this.subscriptions || {},defaultSubscriptions);
		}
				
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
			
	// Render the underlying component+subcomponents (and branches if necessary)
	render: function (silent,changes) {
		!silent && this.trigger('beforeRender');
		Mast.Component.prototype.render.call(this,true,changes);
		!silent && this.trigger('afterRender');
	},
	
	// Do a standard component naive render, but also rerender branches
	naiveRender: function (silent,changes) {
		Mast.Component.prototype.naiveRender.call(this,silent,changes);
		this.renderBranches(silent,changes);
	},
	
	// Render the Tree's branches
	renderBranches: function (silent,changes) {
		!silent && this.trigger('beforeRender');

		// If no branchOutlet is explicitly specified, use the current outlet
		// Otherwise use the branchOutlet selector to find the branchOutlet element inside of this.$el
		this.$branchOutlet = (this.branchOutlet) ? 
			Mast.mixins.verifyOutlet(this.branchOutlet,this.$el) : 
			Mast.mixins.verifyOutlet(this.outlet,this.parent && this.parent.$el);
		
		// Empty branch outlet and close any lingering branch components
		this.$branchOutlet.empty();
		_.invoke(this._branchStack,'close');
		this._branchStack = [];
		
		// Append branches or empty HTML to the branchOutlet
		if (this.collection && !this.collection.length) {
			this.$branchOutlet.append(this._generateEmptyHTML());
		}
		else {
			var self = this;
			this.collection && this.collection.each(function(model,index){
				self.appendBranch(model,{},true);
			});
		}
		!silent && this.trigger('afterRender');
	},
	
	// Add a new branch
	appendBranch: function (model,options,silent) {
		if (!this.branchComponent) { throw new Error ('No branchComponent specified!'); }
		// If this is the first branch, empty to remove the emptyHTML element
		if (this.collection && this.collection.length == 1) {
			this.$branchOutlet.empty();
		}
		// Generate component
		var r = new this.branchComponent({
			parent: this,
			autoRender: false,
			model: model,
			outlet: this.$branchOutlet
		});
		
		// Add at a position
		if (options && !_.isUndefined(options.at)) {
			r.insert(options.at);
			// Push or splice branch component to stack for garbage collection
			this._branchStack.splice(options.at,0,r);
		}
		// or append to the end
		else {
			r.append();
			// Push or splice branch component to stack for garbage collection
			this._branchStack.push(r);
		}
		
		!silent && this.trigger('afterRender');
	},
	
	// Remove a branch
	removeBranch: function (model,options,silent) {
		// Garbage collect branch
		var branch = this._branchStack[options.index];
		if (!branch) debug.warn('Branch missing from memory manager!');
		else {
			branch.close();
			this._branchStack.splice(options.index,1);
		}
		
		// Render empty HTML if necessary
		if (this.collection && this.collection.length === 0 ) {
			this.$branchOutlet.append(this._generateEmptyHTML());
		}
		!silent && this.trigger('afterRender');
	},
	
	// Extend Component's close method to also free branches
	close: function () {
		_.invoke(this._branchStack,'close');
		this._branchStack = [];
		Mast.Component.prototype.close.call(this);
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
		if (this.emptyTemplate) {
			var pattern = new Mast.Pattern({
				template: this.emptyTemplate
			});
			return $(pattern.generate());
		}
		else {
			return this.emptyHTML;
		}
	}
}