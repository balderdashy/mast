// Components are the smallest unit of event handling and logic
// Components may contain sub-components, but (as of may 12th 2012),
// they are responsible for calling render on those elements
Mast.Component = 
{
	// Default HTML to display if table is empty and no emptytemplateis specified
	emptyHTML: "<span>This collection is empty.</span>",
	
	// HTML to display if nothing can be loaded from the server
	errorHTML: "<span>The specified URL did not return valid data.</span>",

	// Automatic rendering is enabled by default
	autoRender: true,

	/**
         * attributes: properties to be added directly to the component
         *              i.e. accessible from component as:
         *                  this.someThing
         *                  this.someThingElse
         *                  
         * modelAttributes: properties to be added directly to the component's Model
         *              i.e. accessible from component as:
         *                  this.get('someThing')
         *                  this.get('someThingElse')
         *                  
         * dontRender: whether or not to render this component when it is instantiated
         *              default: false
         */
	initialize: function(attributes,modelAttributes,dontRender){
		// Bind context
		_.bindAll(this);
		
		// Bring in attributes
		_.extend(this,attributes);	
		
		// Maintain dictionaries of subcomponent prototypes 
		this.regions = this.regions || {};
		
		// and instances
		this.children = {};
		
		// Custom event bindings for specific model attributes
		this.bindings = this.bindings || {};
			
		
		// Backwards compatibility for autorender / autoRender
		this.autoRender = (this.autorender!==undefined) ? this.autorender : this.autoRender;
		
		// Parse special notation in events hash
		_.each(this.events,function(handler,name) {
			var splitName = name.split(/\s+/g);
			if (splitName.length > 1 && splitName[1].substr(0,1) == '>') {
				// This is a closest_descendant event so generate new name of event
				var newName = name.replace(/(\S+\s+)>/g, "$1");					// i.e. "click >.button"
				delete this.events[name];
				var newHandler = function (e) {
					// Stop event from propagating up to superclass
					e.stopImmediatePropagation();
					_.isString(handler) ? this[handler](e) : _.bind(handler,this)(e);
					return false;
				}
				_.bind(newHandler,this);
				this.events[newName] = newHandler;
			}
		},this);
		
		
		// Build pattern	
		if (!this.pattern) {
			if (!this.template) {
				throw new Error ("No pattern or template selector specified for component!");
			}
			else {
				// Create pattern from model and template
				this.pattern = new Mast.Pattern({
					template: this.template,
					model: this.model ? this.model : new Mast.Model
				});
				
				// Provide direct access to model from component
				this._modelIdentifier = this.model;
				this.model = this.pattern.model;
			}
		}
		else {
			if (this.template || this.model) {
				debug.warn ('A template selector and/or model was specified '+
					' even though a pattern was also specified!! \n'+
					'Ignoring extra attributes and using the specified pattern...');
			}
		}
				
		// If this belongs to another component, disable autoRender
		if (this.parent) {
			this.autoRender = false;
		}
				
		// Extend model with properties specified
		_.each(modelAttributes,function(val,key){
			this.pattern.set(key,val);
		},this);
			
		// Watch for changes to pattern
		this.pattern.on('change',this.render);
				
		// Trigger init event
		_.result(this,'init');
				
		// Watch for and announce events
		this.on('afterRender',this.afterRender);
		this.on('beforeRender',this.beforeRender);
		this.on('beforeClose',this.beforeClose);
		this.on('afterClose',this.afterClose);
				
		// Autorender is on by default
		if (!dontRender && this.autoRender!==false) {
			this.append();
		}
				
		// Listen for when the socket is live
		// (unless it's already live)
		if (Mast.Socket) {
			if (!Mast.Socket.connected) {
				Mast.Socket.off('sessionUpdated', this.afterConnect);
				Mast.Socket.on('sessionUpdated',this.afterConnect);
			}
			else {
				this.afterConnect();
			}			
		}
		
		// Bind actions to comet events
		if (this.subscriptions) {
			// Use Backbone's Router logic to parse parameters (/variable/parsing/:within/:path)
			_.each(this.subscriptions,function(action,route) {					
				Mast.Socket.subscribe(route,_.isFunction(action) ? action: this[action],this);
			},this)
		}
	},
		
	// Append the pattern to the outlet
	append: function (outlet) {
		var $outlet = this._verifyOutlet(outlet,
			this.parent && this.parent.$el);
			
		// Render without firing the afterRender event
		this.render(true);
		$outlet.append && $outlet.append(this.$el);
		// Then trigger afterRender after appending the element to the DOM
		this.trigger('afterRender');
			
		return this;
	},
		
	// Replace the outlet with the rendered pattern
	replace: function (outlet) {
		var $outlet = this._verifyOutlet(outlet);
				
		this.setElement($outlet);
		this.render();
		return this;
	},
		
	// Render the pattern and subcomponents
	render: function (silent,changes) {
		!silent && this.trigger('beforeRender');
		
		// Determine if all changed attributes are bound
		var allBound = _.all(changes,function(attrVal,attrName) {
			return !_.isUndefined(this.bindings[attrName]); 
		},this);
		
		// if not all attribute changes are bound, or there are no explicit changes, naively rerender
		if (!allBound || !changes ) {
			this.naiveRender(true,changes);
		}
		// Otherwise, perform the specific bindings for this changeset
		else {
			this.runBindings(changes);
		}
		
		!silent && this.trigger('afterRender',changes);
		return this;
	},
	
	// Run the binding functions as they apply to the specified changeset
	// or if no changeset is specified, render all bindings
	runBindings: function (changes) {
		var bindingsToPerform = _.keys(changes || this.bindings);
		_.each(bindingsToPerform,function(attrName) {
			var handler = this.bindings[attrName];
			handler = _.isString(handler) ? this[handler] : handler;
			if (handler) {
				if (!_.isFunction(handler)) throw new Error ("Bindings contain invalid or non-existent function.");
				handler = _.bind(handler,this);
				handler(this.get(attrName));
			}
		},this);
	},
	
	// Rip existing element out of DOM, replace with new element, then render subcomponents
	naiveRender: function (silent) {
		var $element = this.generate();
		this.$el.replaceWith($element);
		this.setElement($element);
		this.renderRegions(silent);
	},
	
	// Render the regions for this component
	renderRegions: function (silent,changes) {
		!silent && this.trigger('beforeRender');
		_.each(this.regions,this.renderRegion,this);
		!silent && this.trigger('afterRender',changes);
	},
	
	// Render a particular region
	renderRegion: function(subcomponent,outletSelector) {
		// Close existing component
		this.children[outletSelector] && this.children[outletSelector].close();
		
		// Create and save new component
		var subcomponentPrototype = Mast.mixins.provisionPrototype(subcomponent,Mast.components,Mast.Component);
		this.children[outletSelector] = new subcomponentPrototype({
			outlet: outletSelector,
			parent: this
		})
			
		// append new component to DOM
		this.children[outletSelector].append(); 
	},	
			
	// Attach a new subcomponent to an outlet in this component
	attach: function(outletSelector, subcomponent){
		this.regions[outletSelector] = subcomponent;
		this.renderRegion(subcomponent,outletSelector);
	},
	
	// Detach all subcomponents from a region
	detach: function(outletSelector){
		if (this.children[outletSelector]) {
			this.children.close();
			delete this.regions[outletSelector];
		}
	},
			
	// Use pattern to generate a DOM element
	generate: function (data) {
		data = this._normalizeData(data);
		return $(this.pattern.generate(data));
	},
	
	// Free the memory for this component and remove it from the DOM
	close: function (silent) {
		!silent && this.trigger('beforeClose');
	
		// Destroy all subcomponents
		_.invoke(this.children,'close');
		
		// Unsubscribe to model change events
		this.pattern.off();
		this.off();
		
		// Remove from DOM
		this.$el.remove();
		
		// TODO: Unsubscribe to comet updates
				
		!silent && this.trigger('afterClose');
	},
			
	// Set pattern's template selector
	setTemplate: function (selector,options){
		options = _.defaults(options || {}, {
			render: true
		});
		
		// If a render function is specified, use that
		if (_.isFunction(options.render)) {
			// call custom render function with current and new elements (in the proper scope)
			_.bind(options.render,this);
			options.render(this.$el,this.generate());
		}
		// Otherwise just do a basic render by triggering the default behavior
		else {
			this.pattern.setTemplate(selector,options);
		}
		return this.$el;
	},
			
	// Handle both `"key", value` and `{key: value}` -style arguments.
	_normalizeArgs: function(key,value,options,transformedFn) {
		var attrs;
		if (_.isObject(key) || key == null) {
			attrs = key;
			options = value;
		} else {
			attrs = {};
			attrs[key] = value;
		}
		transformedFn(attrs,options);
	},
	
	// Change model as a result of set
	_changeModel: function (attrs,options) {
		options = _.defaults(options || {}, {
			render: true
		});
		
		// If a render function is specified, use that
		if (_.isFunction(options.render)) {
			// call custom render function with current and new elements (in the proper scope)
			this.pattern.set(attrs,_.extend(options,{
				silent:true
			}));
			options.render =_.bind(options.render,this);
			options.render(this.$el,this.generate());
			// Fire afterRender unless silent:true was set in options
			!options.silent && this.trigger('afterRender',attrs);
		}
		// Otherwise just do a basic render by triggering the default behavior
		else {
			this.pattern.set(attrs,options);		
		}
	},
			
	// Set pattern's model attribute
	// If the first argument is an object, value can also be an options hash
	set: function (key,value,options){
		var self = this;
		self._normalizeArgs(key, value, options, function(attrs,options) {
			self._changeModel(attrs,options);
		});
	},
	
	increment: function(key,amount,options) {
		var self = this;
		self._normalizeArgs(key, amount, options, function(attrs,options) {
			attrs = _.objMap(attrs,function(amt,key) {
				return self.get(key)+amt;
			});
			self._changeModel(attrs,options);
		});
	},
	decrement: function(key,amount,options) {
		var self = this;
		self._normalizeArgs(key, amount, options, function(attrs,options) {
			attrs = _.objMap(attrs,function(amt,key) {
				return self.get(key)-amt;
			});
			self._changeModel(attrs,options);
		});
	},
	
	// Pass-thru to model.save()
	save: function () {
		this.pattern.model.save(null,{
			silent:true
		});
	},
	
	// Pass-thru to model.get()
	get: function(attribute) {
		return this.pattern.get(attribute);
	},
			
	beforeRender: function(){
	// stub
	},
	
	afterRender: function(){
	// stub
	},
	
	beforeClose: function(){
	// stub
	},
	
	afterClose: function(){
	// stub
	},
			
	afterConnect: function(){
	// stub
	},
			
	// Determine the proper outlet selector and ensure that it is valid
	_verifyOutlet: function (outlet,context) {
		
		// If a parent component exists, render into its $el by default
		outlet = outlet || this.outlet;// || (this.parent && this.parent.$el);
		
		if (!outlet && !this.parent) {
			throw new Error("No outlet selector specified to render into!");
			return false;
		}
				
		var $outlet;
		if (_.isString(outlet)) {
			if (context) {
				$outlet = (context && context.closest_descendant(outlet));
			}
			else {
				$outlet = $(outlet);
			}
		}
		else {
			$outlet = outlet;
		}
		
		if ($outlet.length != 1) {
			
			//			debug.debug($outlet,outlet,this.parent.$el);
			debug.warn(
				(($outlet.length > 1)?"More than one ":"No ")+
				(($outlet.length > 1)?"element exists ":"elements exist ")+
				(context?"in this template context ("+context+ ")":"") +
				"for the specified "+
				(context?"child ":"") +
				"outlet selector! ('"+outlet+"')");
			return false;
		}
		return $outlet;
	},
			
	// Used for debugging
	_test: function() {
		debug.debug("TEST FUNCTION FIRED!",arguments,this);
	}
}