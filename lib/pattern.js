// Patterns are the smallest unit that has state and a template
// They are always owned by a Component, and their only logic should be the 
// deterministic generation of HTML given a particular model and template
Mast.Pattern = {
		
	// Absorb and delete template
	initialize: function(attributes,options){
		// Bind context
		_.bindAll(this);
		var self=this;
			
		_.extend(this,attributes);
			
		// If a template was specified, absorb it
		if (this.template) {
			this.absorbTemplate(this.template);
		}
			
		// Determine whether specified model is a className, class, or instance
		this.model = Mast.mixins.provisionInstance(this.model,Mast.models,Mast.Model);
		
		// Listen for changes in model and bubble them up
		this.model && this.model.on('change',function(model,parameters){
			self.trigger('change',!parameters.render,parameters.changes);
		});
		
		// Initialize init method if specified
		_.result(this,'init');
	},
		
	// Absorb or access cached template
	absorbTemplate: function(selector) {
		
		// If template is already cached in template library
		if (typeof Mast.TemplateLibrary[selector] != 'undefined') {
			// Grab cached copy of html from template library
			this._template = Mast.TemplateLibrary[selector];
		}
		// Otherwise the template will need to be fetched from the DOM
		else {
			// Try to select the template from the DOM
			var $template = $(selector);
			if ($template.length < 1) {
				throw new Error("No elements exist for the specified template selector! ('"+selector+"')");
			}
			
			// If an id exists for this template element
			if (!! $template.attr('id')) {
				// Depending on state of Mast.removeTemplateIds, issue a warning message
				var warningMessage = "An #id ("+$template.attr('id')+") was specified in a template element."+
					" (Ids shouldn't be set on template elements, since more than one copy might be created.) ";
				if (Mast.removeTemplateIds) {
					// Remove id attr!
					warningMessage += " Removing #id ("+$template.attr('id')+") from template... (NOTE: this may break your CSS.)";
					$template.removeAttr("id");
				}
				debug.warn(warningMessage);
			}			

			// Absorb template (remove from DOM and cache in template library)
			this._template = $template.outerHTML();
			this._template = this._template.replace('%7B%7B', '{{').replace('%7D%7D', '}}');
			$template.remove();
			Mast.TemplateLibrary[selector] = this._template;
		}
	},
		
	// Return templated HTML for this pattern
	generate: function (data) {
		data = this._normalizeData(data);
		// console.log("* Pattern rendering:",this._template,data);
		return ((_.template(this._template))(data));
	},
		
		
	// Replace this pattern's template and create one with the specified 
	// template selector.
	setTemplate: function (template,options) {
		options = _.defaults(options || {}, {
			render: true
		});
		this.absorbTemplate(template);
		
		if (!(options && options.silent)) {
			
			// The change event must be manually triggered since there isn't necessarily a model
			this.trigger('change');
		}	
	},
			
	// Pass-through methods to model
	set: function(key,value,options) {
		
		// If no model exists, create one
		var m;
		if (!this.model) {
			m = new Mast.Model();
		}
		else {
			m = this.model;
		}
		
		m.set(key,value,options);
	},
	get: function(key) {
		return this.model && this.model.get(key);
	},
			
	_normalizeData: function (data) {
		var modelData = this.model && this.model.toJSON && this.model.toJSON();
		return data ? _.extend(_.clone(modelData), data) : modelData || {};
	}
}