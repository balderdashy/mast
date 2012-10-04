Mast.mixins = {

	/**
	* Translator for Mast shorthand notation
	* command - the string command to interpret
	* "this" refers to the calling instance
	*
	* Returns a working function or throws an error
	*/
	interpretShorthand: function (command) {
		// If command is a function, nothing needs to be done
		if (_.isFunction(command)) {
			return command;
		}
		else if (_.isString(command)) {
			var matches = null, attribute, value,ev;

			// Set attribute (i.e. #name = "Mike")
			if (matches = command.match(/#([$_a-zA-Z]+)\s*=\s*["']?([^'"]+)["']?/)) {
				attribute = matches[1], value = matches[2];
				command = function () {
					// If value can be parsed as a number, do so
					value = _.isFinite(+value) ? +value : value;
					// Set attribute to value
					this.set(attribute,value);
				};
			}
			// Trigger event (i.e. /someEvent)
			else if (matches = command.match(/\/([^'"]+)/)) {
				ev = matches[1];
				command = function () {
					this.trigger(ev);
				};
			}

			// backbone will do the work of binding functions and converting simple strings later
			return command;
		}
	},

	// Register models, collections, components, and trees and manage dependencies/inheritance
	registerEntities: function() {

		var infinityCounter = 0;
		while(Mast._registerQueue.length > 0) {
			_.each(Mast._registerQueue, function(v, i) {
				v.definition = v.definition || {}; // Support undefined definition
				var entitySet = // Determine entity set (i.e. Mast.components, Mast.models)
				(v.type == 'tree' || v.type == 'component') ? Mast.components : Mast.models;
				var parent = (v.definition.extendsFrom) ? // Determine parent
				entitySet[v.definition.extendsFrom] : Mast[_.str.capitalize(v.type)];
				if(parent) {
					var newEntity = parent.extend(v.definition); // Extend parent
					newEntity.prototype.events = // Extend events hash 
					_.extend({}, parent.prototype.events, newEntity.prototype.events);
					newEntity.prototype.bindings = // Extend bindings hash 
					_.extend({}, parent.prototype.bindings, newEntity.prototype.bindings);
					newEntity.prototype.subscriptions = // Extend subscriptions hash 
					_.extend({}, parent.prototype.subscriptions, newEntity.prototype.subscriptions);
					entitySet[v.name] = newEntity; // Register new instance in entity set

					// Map shorthand
					newEntity.prototype.events = _.objMap(newEntity.prototype.events,Mast.mixins.interpretShorthand);
					newEntity.prototype.bindings = _.objMap(newEntity.prototype.bindings,Mast.mixins.interpretShorthand);
					newEntity.prototype.subscriptions = _.objMap(newEntity.prototype.subscriptions,Mast.mixins.interpretShorthand);

					Mast._registerQueue.splice(i, 1);
				} else {
					infinityCounter++;
					if(infinityCounter > 1000) {
						debug.warn('Parent does not seem to be registered', v.definition.extendsFrom, "in:", entitySet);
						throw new Error("Could find parent, " + v.definition.extendsFrom + "!");
					}
				}
			});
		}
	},
	
	// Given a class, string, or definition object, return a new instance of the indicated class
	// Given an instance, return it (reflexive)
	provisionInstance: function (identity, identitySet, identityPrototype) {
		
		if (identity && _.isObject(identity) && _.isFunction(identity)) {		// Mast class
			return new identity();
		}
		else if (_.isString(identity)) {										// A string class name			
			if (!identitySet[identity]) {
				throw new Error("No identity with that name ("+identity+") exists!");
			}
			identitySet[identity].prototype._class=identity;
			return new identitySet[identity]();
		}
		else if (_.isObject(identity)) {
			// If this looks like an instance, use it directly
			if (identity.cid || identity._byCid) {
				return identity;
			}
			// If identityPrototype is a Collection, and this is an array, 
			// this is data for instantiating an anonymous collection
			else if (_.isArray(identity) && identityPrototype === Mast.Collection) {
				return new Mast.Collection(identity);
			}
			// If this is a model, use entity as the argument to the constructor to the anonymous model
			else if (identityPrototype === Mast.Model) {
				return new Mast.Model(identity);
			}
			// Otherwise we will assume this is meant as an entity prototype, and extend it before instantiating
			else {
				return new (identityPrototype.extend(identity))();
			}
		}
		else {
			debug.error("Invalid identity definition: ",identity);				// Something is amiss, throw an error
			throw new Error("Invalid identity definition.");
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
			identitySet[identity].prototype._class=identity;
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
		}
	},

	/**
	* Determine the proper outlet selector and ensure that it is valid
	* outlet - selector or jQuery $el to use as outlet
	* context - if a selector was specified, the context for DOM selection
	*/
	verifyOutlet: function (outlet,context) {
		// If no outlet is set on this component, throw an error
		if (!outlet) {
			throw new Error("No outlet selector specified to render into!");
		}
		
		var $outlet;
		if (_.isString(outlet)) {
			// Select the outlet element
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
		
		// If no outlet could be selected, or more than one exists, throw a warning
		if ($outlet.length != 1) {
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
	
	// Given a jQuery object, return the html, **INCLUDING** the element itself
	outerHTML: function(s) {
		return s ? 
			this.before(s).remove() : 
			jQuery("<p>").append(this.eq(0).clone()).html();
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
};


// Mix in jQuery plugins
_.extend(jQuery.fn,{
	outerHTML: Mast.mixins.outerHTML,
	closest_descendant: Mast.mixins.closestDescendant
});


// Underscore mixins
_.mixin({
  // ### _.objMap
  // _.map for objects, keeps key/value associations
  objMap: function (input, mapper, context) {
    return _.reduce(input, function (obj, v, k) {
             obj[k] = mapper.call(context, v, k, input);
             return obj;
           }, {}, context);
  },
  // ### _.objFilter
  // _.filter for objects, keeps key/value associations
  // but only includes the properties that pass test().
  objFilter: function (input, test, context) {
    return _.reduce(input, function (obj, v, k) {
             if (test.call(context, v, k, input)) {
               obj[k] = v;
             }
             return obj;
           }, {}, context);
  },
  // ### _.objReject
  //
  // _.reject for objects, keeps key/value associations
  // but does not include the properties that pass test().
  objReject: function (input, test, context) {
    return _.reduce(input, function (obj, v, k) {
             if (!test.call(context, v, k, input)) {
               obj[k] = v;
             }
             return obj;
           }, {}, context);
  }
});