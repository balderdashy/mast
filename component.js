// Components are the smallest unit of event handling and logic
// Components may contain sub-components, but (as of may 12th 2012),
// they are responsible for calling render on those elements
Mast.Component = 
{
	// Automatic rendering is enabled by default
	autoRender: true,

	// Custom event bindings for specific model attributes
	bindings: {},

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
					// Stop event from propagating up to parent components
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
				
		// Maintain dictionary of subcomponents
		this.children = {};
			
		// Extend model with properties specified
		_.each(modelAttributes,function(val,key){
			this.pattern.set(key,val);
		},this);
			
		// Watch for changes to pattern
		this.pattern.on('change',this.render);
				
		// Register any subcomponents
		_.each(this.subcomponents,function(properties,key) {
			this.registerSubcomponent(properties,key);
		},this);
				
		// Trigger init event
		_.result(this,'init');
				
		// Watch for and announce statechange events
		this.on('afterRender',this.afterRender);
		this.on('beforeRender',this.beforeRender);
				
		// Autorender is on by default
		if (!dontRender && this.autoRender!==false) {
			this.append();
		}
				
		// Listen for when the socket is live
		// (unless it's already live)
		if (Mast.Socket) {
			if (!Mast.Socket.connected) {
				Mast.Socket.off('connect', this.afterConnect);
				Mast.Socket.on('connect', this.afterConnect);
			}
			else {
				Mast.Socket.off('connect', this.afterConnect);
				this.afterConnect();
			}
		}
		
		// Bind actions to comet events
		if (this.subscriptions) {
			_.each(this.subscriptions,function(action,route) {					// Use Backbone's Router logic to parse parameters (/variable/parsing/:within/:path)
				Mast.Socket.subscribe(route,_.isFunction(action) ? action: this[action],this);
			},this)
		}
	},
		
	// Append the pattern to the outlet
	append: function (outlet) {
		var $outlet = this._verifyOutlet(outlet,
			this.parent && this.parent.$el);
			
		this.render();
		$outlet.append && $outlet.append(this.$el);
			
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
		this.renderPattern(silent,changes);
		this.renderSubcomponents();
		// Make sure afterRender is fired after anything else on the call stack
		if (!silent) {
			_.defer(function(self) {
					self.trigger('afterRender');
			},this);
		}
	},
		
	// Render the pattern in-place
	renderPattern: function (silent,changes) {
		this.trigger('beforeRender');		
		
		var allCustomChanges = changes && _.all(changes,function(v,attrName) {
			return (this.bindings[attrName]);
		},this);
		
		// If not all of the changed attributes were accounted for, 
		// go ahead and trigger a complete rerender
		if (!allCustomChanges) {
			var $element = this.generate();
			this.$el.replaceWith($element);
			this.setElement($element);
		}
		
		// Check bindings hash for custom render event
		// Perform custom render for this attr if it exists
		_.each(this.bindings,function(handler,attrName) {
			var newHandler = _.isString(handler) ? this[handler] : handler;
			if (!_.isFunction(newHandler)) throw new Error ("Bindings contain invalid or non-existent function.");
			newHandler = _.bind(newHandler,this);
			newHandler(this.get(attrName));
		},this);
		
		return this;
	},
	
	renderSubcomponents: function () {
		// TODO
		// If any subcomponents exist, 
//		_.each(this.children,function(subcomponent,key) {
//			
//			// append them to the appropriate outlet
//			_.defer(function() {
//				subcomponent.append();
//			})
//			
//		},this);
	},
			
	// Use pattern to generate a DOM element
	generate: function (data) {
		data = this._normalizeData(data);
		return $(this.pattern.generate(data));
	},
			
	// Register a new subcomponent from a definition
	registerSubcomponent: function(options,key) {
		var Subcomponent;
				
		if (!options.component) {
			throw new Error("Cannot register subcomponent because 'component' was not defined!");
		}
		else if ( typeof Mast.components[options.component] == "undefined" ) {
			throw new Error("Cannot register subcomponent because specified component, '"+options.component+"', does not exist!");
		}
		else {
			Subcomponent = options.component;
		}
		
		// Provision prototype for subcomponent
		Subcomponent = Mast.mixins.provisionPrototype(Subcomponent,Mast.components,Mast.Component)
		
		// Build property list with specified pieces
		var plist = {
			parent: this,
			outlet: options.outlet
		};
		// Remove stuff from definition that shouldn't be transfered as params
		_.each(options,function(val,key) {
			if (key!='component' && key!='outlet') {
				plist[key]=val;
			}
		});
		
		
		// Instantiate subcomponent, but don't append/render it yet
		var subcomponent = new Subcomponent(plist,plist);
		this.children[key] = subcomponent;
	},
			
	// Free the memory for this component and remove it from the DOM
	destroy: function () {
		// Remove models from modelCache
		this.pattern.model.cid && delete Mast.modelCache[this.pattern.model.cid];
		this.collection && this.collection.cid && delete Mast.modelCache[this.collection.cid];
			
		this.undelegateEvents();
		this.$el.remove();
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
			
	// Set pattern's model attribute
	// If the first argument is an object, value can also be an options hash
	set: function (key,value,options){
		var outcome,attrs;
		
		// Handle both `"key", value` and `{key: value}` -style arguments.
		if (_.isObject(key) || key == null) {
			attrs = key;
			options = value;
		} else {
			attrs = {};
			attrs[key] = value;
		}
		
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
			outcome = true;
		}
		// Otherwise just do a basic render by triggering the default behavior
		else {
			outcome = this.pattern.set(attrs,options);		
		}
		return outcome;
	},
	
	save: function () {
		this.pattern.model.save(null,{
			silent:true
		});
	},
	
	get: function(attribute) {
		return this.pattern.get(attribute);
	},
			
	beforeRender: function(){
	// stub
	},
	
	afterRender: function(){
	// stub
	},
			
	afterConnect: function(){
	// stub
	},
			
	// Default HTML to display if table is empty and no emptytemplate
	// is specified
	emptyHTML: "<span>There are no children available.</span>",
			
			
			
	// Determine the proper outlet selector and ensure that it is valid
	_verifyOutlet: function (outlet,context) {
		
		// If a parent component exists, render into that by default
		outlet = outlet || this.outlet || (this.parent && this.parent.$el);
		
		if (!outlet && !this.parent) {
			throw new Error("No outlet selector specified to render into!");
			return false;
		}
				
		var $outlet;
		if (_.isString(outlet)) {
			$outlet = (context && context.closest_descendant(outlet)) || $(outlet);
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