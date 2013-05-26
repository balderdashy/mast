// TODO: resolve how loading will work
var Framework = Mast;
////////////////////////////////////////////////////////////////////////////

Framework.Region = constructor;
_.extend(Framework.Region, Framework.Events);

/**
 * region.append( component, [properties] )
 *
 */
Framework.Region.prototype.append = function (component, properties) {
	if (!component) {
		throw new Error(this.id + '.append() :: No component specified! \nUsage: append(component, [properties])');
	}
	Framework.debug(this.parent.id + ' :: Appended ' + component.id + ' to region: ' + this.id);

};


/**
 * region.insert( atIndex, component, [properties] )
 *
 */
Framework.Region.prototype.insert = function ( atIndex, component, properties ) {
	var err = '';
	if (!atIndex) {
		err += this.id + '.insert() :: No atIndex specified to insert the component at! ';
	}
	else if (!component) {
		err += this.id + '.insert() :: No component specified!';
	}
	if (err) {
		throw new Error(err + '\nUsage: append(atIndex, component, [properties])');
	}

	Framework.debug(this.parent.id + ' :: Inserted ' + component.id + ' into region: ' + this.id + ' at index ' + atIndex);

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
