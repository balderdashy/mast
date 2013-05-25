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

	Framework.debug(this.parent.id + ' :: Appended ' + component.id + ' to region: ' + this.id);
	Framework.error('TODO');

};


/**
 * region.insert( atIndex, component, [properties] )
 *
 */
Framework.Region.prototype.insert = function ( atIndex, component, properties ) {
	
	Framework.debug(this.parent.id + ' :: Inserted ' + component.id + ' into region: ' + this.id + ' at index ' + atIndex);
	Framework.error('TODO');

};


/**
 * region.remove( atIndex )
 *
 */
Framework.Region.prototype.remove = function ( atIndex ) {

	Framework.debug(this.parent.id + ' :: Removed component at index ' + atIndex + ' from region: ' + this.id);
	Framework.error('TODO');
};

/**
 * region.empty( )
 *
 */
Framework.Region.prototype.empty = function () {

	Framework.debug(this.parent.id + ' :: Emptied region: ' + this.id);
	Framework.error('TODO');

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

	_.bindAll(this);

}
