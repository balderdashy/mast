
/**
 * TODO:
 * Try out a different approach for the logic in `renderCollection`
 * below by overloading `region.attach()`.
 *
 * Example usage: (in parent component)
 * ======================================
 * this.someRegion.attach('SomeOtherComponent',{ collection: SomeCollection })
 *
 * -or-
 *
 * this.someRegion.repeat('SomeOtherComponent',{ collection: SomeCollection })
 */

/**
 * renderCollection()
 *
 * Reusable logic to render a collection into a region
 *
 * TODO: move onto Region object instead...  See gist.
 *
 * @param {Object} collection - data source
 * @param {Options} options
 *		: options.itemTemplate {String} - name of template/component to use as item
 *		: options.intoRegion {Object} - the destination region
 */
module.exports = function (collection, options) {

	// Required:
	if (typeof collection !== 'object') throw new Error('renderCollection :: Unknown/invalid collection, "' + (collection && collection.type) + '"');
	if (!options.itemTemplate) throw new Error('renderCollection :: options.itemTemplate required!');
	if (!options.intoRegion) throw new Error('renderCollection :: options.intoRegion required!');


	// Determine collectionName
	var collectionName = collection.type;

	// Target region
	var outlet = options.intoRegion;

	// Sub-component
	var subcomponentName = options.itemTemplate;

	// Name of the collection state attribute that wille be injected into the HTML
	// Used for the default render behavior.
	var bodyStateAttribute = 'data-' + collectionName + '-state';




	/**
	 * Default render methods
	 *
	 * Override default render methods with options if specified
	 */

	// Default render logic for error state (e.g. red text)
	var renderError = options.renderError || function renderError () {
		FRAMEWORK.error('An error occurred while loading ' + collectionName + ' ::\n', collection.error);

		// Set a data attribute on HTML body
		$('body').attr(bodyStateAttribute, 'error');
	};

	// Default render logic for loading state (e.g. spinner)
	var renderSyncing = options.renderSyncing || function renderSyncing() {
		FRAMEWORK.log('Loading ' + collectionName + '...');

		// Set state attribute on HTML body
		$('body').attr(bodyStateAttribute, 'syncing');
	};

	// Default render logic to clean up after a successful sync/load
	var renderSynced = options.renderSynced || function renderSynced() {
		FRAMEWORK.log(collection.length + ' ' + collectionName + ' fetched successfully.');

		// Set state attribute on HTML body
		$('body').attr(bodyStateAttribute, 'ready');
	};

	// Default render logic for items in collection
	var renderReset = options.renderReset || function renderReset() {

		// Clean out the region, wrap in a try/catch to stop the execution
		try {
			outlet.empty();
		} catch (e) {}


		// TODO: Smart merge to minimize DOM queries
		collection.each(function (model) {
			// For each model found, append a subcomponent to the region
			outlet.append(subcomponentName, { model: model });
		});
	};

	/**
	 * renderAdd ( model, [atIndex] )
	 *
	 * @param {Model} model						- the Backbone model that was added
	 * @param {Integer} atIndex				- (optional- defaults to collection.length)
	 *
	 * Default render logic for the case where an item is added to the collection.
	 */
	var renderAdd = options.renderAdd || function renderAdd( model, atIndex ) {
		if ( typeof atIndex === 'number') {
			return outlet.insert(atIndex, subcomponentName, { model: model });
		}
		return outlet.append(subcomponentName, { model: model });
	};

	/**
	 * renderRemove( atIndex )
	 *
	 * @param {Integer} atIndex			- the former index of the Backbone model that was removed
	 *
	 * Default render logic for the case where an item is removed from the collection.
	 */
	var renderRemove = options.renderRemove || function renderRemove( atIndex ) {
		outlet.remove( atIndex );
	};






	/**
	 * Bootstrap
	 *
	 * Renders initial state of collection into our region
	 * using our child template.
	 */

	// If our collection is fetching, render the fetching (loading) state.
	if (collection.syncing) {
		renderSyncing();
	}


	// If our collection failed to fetch (i.e. received a 4xx or 5xx error code)
	// render an error state
	//
	// Handle the case of multiple error states with different styles here as well.
	else if (collection.error) {
		renderError();
	}


	// Otherwise our collection is loaded and ready,
	// so go ahead and render it into the target region.
	//
	// (alternatively at this point, a custom `empty` state may be rendered)
	// console.log('The collection ' + subcomponentName + '---->');
	else renderReset();







	/**
	 * Bind events
	 *
	 * Listen for state changes (syncing, synced, server error, add, remove, sort, etc.)
	 * These manual bindings can be removed when core framework supports render-time collection
	 * bindings.  For now, doing it this way rather than patching the core to test our structural
	 * assumptions.
	 */

	// When a fetch is initiated from the server...
	//
	// (after `Backbone.sync` begins a remote request)
	this.listenTo(collection, 'request', function afterRequest () {
		renderSyncing();
	});

	// When a fetch completes successfully and new data is loaded...
	//
	// (after this component is already instantiated)
	this.listenTo(collection, 'sync', function afterSync () {
		renderSynced();
		renderReset();
	});

	// When server sends a response w/ an error code
	//
	// (after this component is already instantiated)
	this.listenTo(collection, 'error', function afterSyncError (collection, xhr) {

		// Ignore abort "error"
		//
		// Why? because it's not actually an error.
		// Not sure why this triggers Backbone.Collection's `error` event...
		//
		// If two fetches occur on the same collection at the same time,
		// we abort the old XHR request ourselves if it's still running)
		if (xhr && xhr.statusText === 'abort') return;

		renderError();
	});

	// When a model is added...
	//
	// Listen for new models, and insert a child template
	// at the appropriate index within the region.
	this.listenTo(collection, 'add', function afterAdd ( model, collection, options ) {
		renderAdd( model, options.at );
	});

	// When a model is removed...
	//
	// Grab model's relative index within collection and remove
	// the child template at the same index within the region.
	this.listenTo(collection, 'remove', function afterRemove ( model, collection, options ) {
		renderRemove( options.index );
	});



};
