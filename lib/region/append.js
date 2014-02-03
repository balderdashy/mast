/**
 * Append a component to the end of a region. This calls insert at the last position.
 *
 * @param  {String} componentId [The component id that we want to append]
 * @param  {Object} properties  [Properties to instantiate the component with]
 *
 * @return {Component}          [Newly appended Component]
 */
module.exports = function append(componentId, properties) {
	// Insert at last position
	return this.insert(this._children.length, componentId, properties);
};
