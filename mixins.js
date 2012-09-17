Mast.mixins = {
	
	// Given a class, string, or definition object, return a new instance of the indicated class
	// Given an instance, return it (reflexive)
	provisionInstance: function (identity, identitySet, identityPrototype) {
		
		if (identity && _.isObject(identity) && _.isFunction(identity)) {		// Mast class
			var def;
			if (identityPrototype == Mast.Component || identityPrototype == Mast.Tree) {
				def = { autorender: false	}
			}
			return new identity(def);
		}
		else if (_.isString(identity)) {										// A string class name			
			if (!identitySet[identity]) {
				throw new Error("No identity with that name ("+identity+") exists!");
			}
			return new identitySet[identity];
		}
		else if (_.isObject(identity)) {
			return ((identity.cid || identity._byCid)) ?
				identity :														// A Mast instance
				new identityPrototype(identity);								// An object: treat this as a definition and try to create a new instance
		}
		else {
			debug.error("Invalid identity definition: ",identity);				// Something is amiss, throw an error
			throw new Error("Invalid identity definition.");
			return identityPrototype;
		}
	},
	
	// Given a string or class definition, return a class
	// Given a class, return it (reflexive)
	provisionPrototype: function (identity, identitySet, identityPrototype) {
		if (identity && _.isObject(identity) && _.isFunction(identity)) {		// A Mast class
			return identity;
		}
		else if (_.isString(identity)) {										// A string class name
			if (!(identitySet[identity])) {
				throw new Error("No identity with that name ("+identity+") exists!");
			}
			return identitySet[identity];
		}
		else if (_.isObject(identity)) {
			if (identity.cid || identity._byCid) {
				throw new Error("A class, string class name, or class definition should be specified, not an instance!");
			}
			var parentPrototype = identity.extendsFrom || identityPrototype;
			if (! parentPrototype.extend) {
				throw new Error ("Invalid identity provided: " + identity);
			}
			return parentPrototype.extend(identity);							// An object: treat this as a class definition and try to define a new class
		}
		else {																	// Something is amiss, throw an error
			throw new Error ("Invalid identity provided: " + identity);
			return identity;
		}
	},
	
	// Given a jQuery object, return the html, **INCLUDING** the element itself
	outerHTML: function(s) {
		return s
		? this.before(s).remove()
		: jQuery("<p>").append(this.eq(0).clone()).html();
	},
	
	// Get first descendant that matches the specified selector
	closestDescendant: function(filter) {
		var $found = $(),
		$currentSet = this;															// Current place
		while ($currentSet.length) {
			$found = $currentSet.filter(filter);
			if ($found.length) break;												// At least one match: break loop
			$currentSet = $currentSet.children();									// Get all children of the current set
		}
		return $found.first();														// Return first match of the collection
	} 
}


// Mix in jQuery plugins
_.extend(jQuery.fn,{
	outerHTML: Mast.mixins.outerHTML,
	closest_descendant: Mast.mixins.closestDescendant
});
