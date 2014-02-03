/**
 * Check the specified definition for obvious mistakes, especially likely deprecations and
 * validate that the model and collections are instances of Backbone's Data structures.
 *
 * @param {Object} properties [Object containing the properties of the component]
 */

module.exports = function validateDefinition(properties) {

	if (_.isObject(properties)) {

		// Determine component id
		var id = this.id || properties.id;

		function _validateBackboneInstance (type) {
			var Type = type[0].toUpperCase() + type.slice(1);

			if ( !properties[type] instanceof Backbone[Type] ) {

				Framework.error(
					'Component (' + id + ') has an invalid ' + type + '-- \n' +
					'If `' + type + '` is specified for a component, ' +
					'it must be an *instance* of a Backbone.' + Type + '.\n');

				if (properties[type] instanceof Backbone[Type].constructor) {
					Framework.error(
						'It looks like a Backbone.' + Type + ' *prototype* was specified instead of a ' +
						'Backbone.' + Type + ' *instance*.\n' +
						'Please `new` up the ' + type + ' -before- ' + Framework.id + '.raise(),' +
						'or use a wrapper function to achieve the same effect, e.g.:\n' +
						'`' + type + ': function () {\nreturn new Some' + Type + '();\n}`'
					);
				}

				Framework.warn('Ignoring invalid ' + type + ' :: ' + properties[type]);
				delete properties[type];
			}
		}

		// Check that this.collection is actually an instance of Backbone.Collection
		// and that this.model is actually an instance of Backbone.Model
		_validateBackboneInstance('model');
		_validateBackboneInstance('collection');

		// Clone properties to avoid inadvertent modifications
		return _.clone(properties);
	}

	else return {};

}
