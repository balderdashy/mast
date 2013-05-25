// TODO: resolve how loading will work
var Framework = Mast;
////////////////////////////////////////////////////////////////////////////

Framework.Region = function (properties) {

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
	
	Framework.debug(this.parent.id + ' :: Instantiated region: ' + this.id);
};

Framework.Region.prototype.empty = function () {
	Framework.debug(this.parent.id + ' :: Emptied region: ' + this.id);
	Framework.error('TODO');
};

_.extend(Framework.Region, Framework.Events);
