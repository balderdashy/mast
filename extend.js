// Extend Backbone structures
Mast.Pattern = Mast.View.extend(Mast.Pattern);
Mast.Component = Mast.Pattern.extend(Mast.Component);
Mast.Table = Mast.Component.extend(Mast.Table);
Mast.Tree = Mast.Component.extend(Mast.Tree);




var extendFn = function (entityType,entityName,definition) {
	return function (entityName,definition) {
		var parent = Mast[entityType+'s'][entityName];
		if (!parent) throw new Error('Cannot extend "'+entityName+'".  No such '+entityType+' exists!')
		return parent.extend(definition);
	}
}

// Define Mast.extend*() methods
Mast.extendComponent = extendFn('component');
Mast.extendModel = extendFn('model');
Mast.extendCollection = extendFn('model');