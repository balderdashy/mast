// TODO: resolve how loading will work
var Framework = Mast;
////////////////////////////////////////////////////////////////////////////

// Optional method to require app components
// Require.js can be used instead as needed


Framework.define = function (id, definitionFn) {
	// Id param is optional
	if (!definitionFn) {
		definitionFn = id;
		id = null;
	}

	Framework._defineQueue.push({
		definition: definitionFn,
		idOverride: id
	});
};


// Run definition methods to get actual component definitions
// This is deferred to avoid having to use Backbone's function () {} approach for things like collections
Framework._defineQueue = [];
Framework._buildComponents = function () {

	// Iterate through the define queue and create each definition
	_.each(Framework._defineQueue, function (component) {
		var componentDef = component.definition();
		
		if (component.idOverride) {
			if (componentDef.id) {
				throw new Error(component.idOverride + ':: Cannot specify an idOverride in .define() if an id property ('+componentDef.id+') is already set in your component definition!\nUsage: .define([idOverride], definition)');
			}
			componentDef.id = component.idOverride;
		}
		if (!componentDef.id) {
			throw new Error('Cannot use .define() without defining an id property or override in your component!\nUsage: .define([idOverride], definition)');
		}
		Framework.components[componentDef.id] = componentDef;
	});
};