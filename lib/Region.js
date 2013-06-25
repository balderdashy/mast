// TODO: resolve how loading will work
var Framework = Mast;
////////////////////////////////////////////////////////////////////////////

Framework.Region = constructor;
_.extend(Framework.Region, Framework.Events);


function constructor (properties) {

	if (!properties) {
		properties = {};
	}
	if (!properties.$el) {
		throw new Error('Trying to instantiate region with no $el!');
	}

	// Fold in properties to prototype
	_.extend(this,properties);

	// If neither an id nor a `default` was specified,
	// we'll throw an error, since there's no way to get a hold of the region
	if (!this.id && !this.$el.attr('default')) {
		throw new Error(this.parent.id + ' :: Either `data-id`, `default`, or both must be specified on regions. \ne.g. <region data-id="foo" default="SomeComponent"></region>');
	}


	// Set up list to house child components
	this._children = [];

	_.bindAll(this);

	// Set up convenience access to this region in the global region cache
	Framework.regions[this.id] = this;
}


/**
 * region.insert( atIndex, componentId, [properties] )
 *
 * TODO: support a list of properties objects in lieu of the properties object
 */

Framework.Region.prototype.insert = function ( atIndex, componentId, properties ) {
	var err = '';
	if (!atIndex && !_.isFinite(atIndex)) {
		err += this.id + '.insert() :: No atIndex specified!';
	}
	else if (!componentId) {
		err += this.id + '.insert() :: No componentId specified!';
	}
	if (err) {
		throw new Error(err + '\nUsage: append(atIndex, componentId, [properties])');
	}

	var component;
	// If componentId is a string, look up component prototype and instatiate
	if ('string' == typeof componentId) {
		var componentPrototype = Framework.components[componentId];
		if (!componentPrototype) {
			var template = Framework.templates[componentId];
			if (!template) {
				throw new Error ('In ' +
					(this.id || 'Anonymous region') + ':: Trying to attach ' +
					componentId + ', but no component or template exists with that id.');
			}

			// If no component prototype with this id exists,
			// create an anonymous one to use
			componentPrototype = Framework.Component.extend({
				id: componentId,
				template: template
			});
		}

		// Instantiate and render the component inside this region
		component = new componentPrototype(_.extend({
			$outlet: this.$el
		}, properties || {}));
	}

	// Otherwise assume an instantiated component object was sent
	/* TODO: Check that component object is valid */
	else {
		component = componentId;
		component.$outlet = this.$el;
	}

	component.render( atIndex );

	// And keep track of it in the list of this region's children
	this._children.splice(atIndex, 0, component);

	var debugStr = this.parent.id + ' :: Inserted ' + componentId + ' into ';
	if (this.id) debugStr += 'region: ' + this.id + ' at index ' + atIndex;
	else debugStr += 'anonymous region at index ' + atIndex;
	Framework.debug(debugStr);

	return component;

};


/**
 * region.remove( atIndex )
 *
 */

Framework.Region.prototype.remove = function ( atIndex ) {
	if (!atIndex && !_.isFinite(atIndex)) {
		throw new Error(this.id + '.remove() :: No atIndex specified! \nUsage: remove(atIndex)');
	}

	// Remove the component from the list
	var component = this._children.splice(atIndex, 1);
	if (!component[0]) {

		// If the list is empty, freak out
		throw new Error(this.id + '.remove() :: Trying to remove a component that doesn\'t exist at index ' + atIndex);
	}

	// Squeeze the component to do get all the bindy goodness out
	component[0].close();

	Framework.debug(this.parent.id + ' :: Removed component at index ' + atIndex + ' from region: ' + this.id);

};

/**
 * region.empty( )
 *
 * Iterate over each component in this region and call .close() on it
 */

Framework.Region.prototype.empty = function () {
	Framework.debug(this.parent.id + ' :: Emptying region: ' + this.id);

	while (this._children.length > 0) {
		this.remove(0);
	}

};

/**
 * region.append( componentId, [properties] )
 *
 * Calls insert() at last position
 */

Framework.Region.prototype.append = function (componentId, properties) {

	// Insert at last position
	return this.insert(this._children.length, componentId, properties);

};


/**
 * Shortcut for calling empty() and then append(),
 * This is the general use case for managing subcomponents
 * (e.g. when a navbar item is touched)
 *
 * @param  {string} component  The id name of the componet that you want to attach.
 * @param  {Object} properties Properties that the attached component will be initalized with.
 */

Framework.Region.prototype.attach = function (component, properties) {
	this.empty();
	this.append(component, properties);
};

