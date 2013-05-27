// TODO: resolve how loading will work
var Framework = Mast;
////////////////////////////////////////////////////////////////////////////

// Optional method to require app components
// Require.js can be used instead as needed


Framework.define = function (component) {
	Framework._defineQueue.push(component);
};


// Run definition methods to get actual component definitions
// This is deferred to avoid having to use Backbone's function () {} approach for things like collections
Framework._defineQueue = [];
Framework._buildComponents = function () {
	_.each(Framework._defineQueue, function (component) {
		var componentDef = component();
		if (!componentDef.id) {
			throw new Error('Cannot not use .define() without defining an id property in your component!');
		}
		Framework.components[componentDef.id] = componentDef;
	});
};