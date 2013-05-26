// TODO: resolve how loading will work
var Framework = Mast;
////////////////////////////////////////////////////////////////////////////

Framework.Region = constructor;
_.extend(Framework.Region, Framework.Events);

/**
 * region.append( componentId, [properties] )
 *
 * Calls insert() at last position
 */
Framework.Region.prototype.append = function (componentId, properties) {
	
	// Insert at last position
	this.insert(this._children.length, componentId, properties);

};


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

	// Look up component prototype
	var componentPrototype = Framework.components[componentId];
	if (!componentPrototype) {
		throw new Error (this.id + ':: Unknown component: '+ componentId);
	}
	
	// Instantiate and render the component inside this region
	var component = new componentPrototype(_.extend({
		$outlet: this.$el
	}, properties || {}));
	component.render( atIndex );

	// And keep track of it in the list of this region's children
	this._children.splice(atIndex, 0, component);

	Framework.debug(this.parent.id + ' :: Inserted ' + componentId + ' into region: ' + this.id + ' at index ' + atIndex);

};


/**
 * region.remove( atIndex )
 *
 */
Framework.Region.prototype.remove = function ( atIndex ) {
	if (!atIndex) {
		throw new Error(this.id + '.remove() :: No atIndex specified! \nUsage: remove(atIndex)');
	}
	Framework.debug(this.parent.id + ' :: Removed component at index ' + atIndex + ' from region: ' + this.id);
	
};

/**
 * region.empty( )
 *
 */
Framework.Region.prototype.empty = function () {
	Framework.debug(this.parent.id + ' :: Emptying region: ' + this.id);

	// Iterate over each component in this region and call .close() on them
	

};


/**
 * region.attach( component, [properties] )
 *
 * Shortcut for calling empty() and then append(),
 * this is the general use case for managing subcomponents
 * (e.g. when a navbar item is touched)
 *
 */
Framework.Region.prototype.attach = function (component, properties) {

	this.empty();
	this.append(component, properties);

};


function constructor (properties) {

	if (!properties) {
		properties = {};
	}
	if (!properties.$el) {
		throw new Error('Trying to instantiate region with no $el!');
	}

	// Fold in properties to prototype
	_.extend(this,properties);

	// Identify this region
	if (!this.id) {
		throw new Error(this.parent.id + ' :: No id specified for one of the regions in this component.');
	}

	// Set up list to house child components
	this._children = [];

	_.bindAll(this);

}
