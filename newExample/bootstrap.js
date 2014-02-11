/**
 * Simple bootstrap to set up Waterline given some
 * collection, connection, and adapter definitions.

  @param options
    :: {Object}   adapters     [i.e. a dictionary]
    :: {Object}   connections  [i.e. a dictionary]
    :: {Object}   collections  [i.e. a dictionary]

  @param  {Function} cb
    () {Error} err
    () ontology
      :: {Object} collections
      :: {Object} connections

  @return {Waterline}
 */

function bootstrap(options, cb) {

	var adapters = options.adapters || {};
	var connections = options.connections || {};
	var collections = options.collections || {};



	Object.keys(adapters).forEach(function(identity) {
		var def = adapters[identity];

		// Make sure our adapter defs have `identity` properties
		def.identity = def.identity || identity;
	});


	var extendedCollections = [];
	Object.keys(collections).forEach(function(identity) {
		var def = collections[identity];

		// Make sure our collection defs have `identity` properties
		def.identity = def.identity || identity;

		// Fold object of collection definitions into an array
		// of extended Waterline collections.
		extendedCollections.push(Waterline.Collection.extend(def));
	});


	// Instantiate Waterline and load the already-extended
	// Waterline collections.
	var waterline = new Waterline();
	extendedCollections.forEach(function(collection) {
		waterline.loadCollection(collection);
	});


	// Initialize Waterline
	// (and tell it about our adapters)
	waterline.initialize({
		adapters: adapters,
		connections: connections
	}, cb);

	return waterline;
}


bootstrap({
	adapters: {
		foo: {
			find: function (connectionName, collectionName, criteria, cb) {
				setTimeout(function () {
					cb(null, [{
						name: 'Gabe the Pirate'
					}]);
				}, 0);
			}
		}
	},
	connections: {
		test: {
			adapter: 'foo'
		}
	},
	collections: {
		pirate: {
			connection: 'test',
			attributes: {
				name: 'string',
				age: 'integer'
			}
		}
	}
}, function(err, ontology) {
	if (err) throw err;
	Pirate = ontology.collections.pirate;
});
