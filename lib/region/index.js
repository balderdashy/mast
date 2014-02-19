/**
 * Module dependencies
 */

var insert = require('./insert'),
	remove = require('./remove'),
	empty = require('./empty'),
	append = require('./append'),
	attach = require('./attach'),
	prepend = require('./prepend'),
	fromElement = require('./fromElement'),
	el2DefaultTemplateID = require('../utils/el2DefaultTemplateID'),
	buildComponentPrototype = require('../raise/buildPrototype');


/**
 * FRAMEWORK.Region
 *
 * @param  {Object} properties
 *
 * @constructor
 */

var Region = module.exports = function region(properties) {

	_.extend(this, FRAMEWORK.Events);

	if (!properties) {
		properties = {};
	}
	if (!properties.$el) {
		throw new Error('Trying to instantiate region with no $el!');
	}

	// Fold in properties to prototype
	_.extend(this, properties);

	// If the region has a component/template identifier, (e.g. <region template="Foo" />)
	// we'll use that as the `embeddedComponent`.
	this.embeddedComponent = el2DefaultTemplateID(this.$el[0]);

	// Next, check if the region has any embedded HTML.
	var embeddedTemplate = this.$el.html();



	// Trim whitespace from embedded template in case it was included by accident.
	embeddedTemplate = embeddedTemplate && embeddedTemplate.replace(/^\s+/, '');
	embeddedTemplate = embeddedTemplate && embeddedTemplate.replace(/\s+$/, '');

	// Instantiate an anonymous component for the embedded template.
	if (embeddedTemplate) {

		// Give an flag so we know this region has embedded content.
		this.hasContent = true;

		// Add this template to our collection of framework templates. This will allow us to
		// render this component in the future.
		FRAMEWORK.templates[this.embeddedComponent] = embeddedTemplate;

		// If the Framework has this component registered for this embedded component,
		// then create a prototype of this compnent. This allows having logic for this
		// embedded component in a different component file.
		if (_.has(FRAMEWORK.componentDefs, this.embeddedComponent)) {
			var componentDef = FRAMEWORK.componentDefs[this.embeddedComponent],
					componentKey = this.embeddedComponent;

			buildComponentPrototype(componentDef, componentKey);
		}

		// Wipe the embedded HTML from the DOM.
		// NOTE: this step could be omitted, but leaving it in now for safety.
		this.$el.empty();

		// Extend a component prototype, then instantiate the component,
		// but don't render yet.  It's already rendered, mostly! (except for ITS regions)
		// We'll use this anonymous component instance as our `embeddedComponent` for this
		// region.
		// var templateProperties = {
		// 	template: embeddedTemplate,
		// 	id: this.embeddedComponent
		// };

		// shortcut to get hold of embedded component id.
		this.embeddedContent = this.embeddedComponent;

		// this.embeddedComponent = new (FRAMEWORK.Component.extend(templateProperties))(properties);
		// this.embeddedComponent = new FRAMEWORK.Component(templateProperties);
		// console.log('something');

	}

	// If neither an id nor a `template` was specified,
	// we'll throw an error, since there's no way to get a hold of the region
	if ( !this.id && !this.embeddedComponent ) {

		throw new Error(
			this.parent.id + ' :: A region identifier (e.g. `data-region="foo"`) may ' +
			'only be omitted if a default template is specified, e.g.:\n' +
			'e.g. <region template="SomeComponent"></region>'
		);
	}

	// Set up list to house child components
	this._children = [];

	_.bindAll(this);

	// Set up convenience access to this region in the global region cache
	FRAMEWORK.regions[this.id] = this;
};

Region.fromElement = function(el, parent) {
	return fromElement(el, parent);
};
Region.prototype.remove = function(atIndex) {
	return remove.call(this, atIndex);
};
Region.prototype.empty = function() {
	return empty.call(this);
};
Region.prototype.insert = function(atIndex, componentId, properties) {
	return insert.call(this, atIndex, componentId, properties);
};
Region.prototype.append = function(componentId, properties) {
	return append.call(this, componentId, properties);
};
Region.prototype.attach = function(component, properties) {
	return attach.call(this, component, properties);
};
Region.prototype.prepend = function(componentId, properties) {
	return prepend.call(this, componentId, properties);
};
