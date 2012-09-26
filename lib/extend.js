// Extend Backbone structures
Mast.Pattern = Mast.View.extend(Mast.Pattern);
Mast.Component = Mast.Pattern.extend(Mast.Component);
Mast.Tree = Mast.Component.extend(Mast.Tree);
Mast.Table = Mast.Component.extend(Mast.Table);


// Define registration methods (required to extend other components/models in the app)
Mast._registerQueue = [];
var registerFn = function(entityType) {
	return function (entityName,definition) {
		Mast._registerQueue.push({
			name:		entityName,
			type:		entityType,
			definition:	_.extend({
				_class:entityName
			},definition)
		});
	}
}

Mast.registerComponent	= registerFn('component');
Mast.registerTree		= registerFn('tree');

Mast.registerModel		= registerFn('model');
Mast.registerCollection = registerFn('collection');

// "Smart"-register (take a guess at what sort of entity this is)
Mast.register = function (entityName,definition) {
	var entityType;
	if (!definition.template) {
		entityType = definition.model ? 'collection' : 'model';
	}
	else {
		entityType = 
			(definition.collection || 
			definition.branchOutlet || 
			definition.branchComponent) ? 'tree' : 'component';
	}
	Mast._registerQueue.push({
		name:		entityName,
		type:		entityType,
		definition:	_.extend({
			_class:entityName
		},definition)
	});
}