// TODO: resolve how loading will work
var Framework = Mast;
////////////////////////////////////////////////////////////////////////////

// TODO: disable debug mode
Framework.debug = true;

/**
 * You should grab templates and components with something like requirejs
 * before calling Framework.raise()
 * 
 * Usage:
 * Framework.raise([options], [cb])
 * 
 * options -> {
 *	templates: {
 *		componentName: templateHTML
 *	},
 *	components: {
 *		componentName: ComponentDefinition
 *	}
 * }

cb -> function () {}

*/
Framework.raise = function (options, cb) {

	// If only one arg is present, use options as callback if possible
	// If options are not defined, use an empty object
	if (!cb && _.isFunction(options)) {
		cb = options;
	}
	if (!_.isObject(options)) {
		options = {};
	}

	// If log is specified, use it, otherwise use the console
	if (options.log) {
		Framework.log = options.log;
		Framework.warn = options.log.warn;
		Framework.error = options.log.error;
		Framework.debug = Framework.debug ? options.log.debug : function () {};
	}
	else {
		Framework.log = Framework.isProduction ? function () {} : console.log;
		Framework.warn = Framework.isProduction ? function () {} : console.warn;
		Framework.error = Framework.isProduction ? function () {} : console.error;
		Framework.debug = Framework.debug ? console.debug : function () {};
	}

	// Merge data into Framework.data
	_.extend(Framework.data, options.data || {});

	// Merge specified templates with Framework.templates
	_.extend(Framework.templates, options.templates || {});

	// If Mast.define() was used, build the list of components
	Framework._buildComponentDefinitions();

	// Merge specified components w/ Framework.components
	_.extend(Framework.components, options.components || {});

	// Back up each component definition before transforming it into a live prototype
	Framework.componentDefs = _.clone(Framework.components);

	


	// Wait until Framework core is ready
	Framework.ready(function () {

		// Collect any <script> tag templates on the page
		// and absorb them into Framework.templates
		_.extend(Framework.templates, collectTemplates());

		// Build actual prototypes for the components
		// (need the templates at this point to make this work)
		buildComponentPrototypes();


		// TODO: v2.5
		// ################################
		// Load any missing templates named in our components asynchronously

		// Determine dependencies by parsing HTML for regions

		// Find a flat list of all the top-level region components
		// (i.e. <region>s which are not inside other <region>s)
		// ################################


		// TODO: v2.3
		// ################################
		// For all regions, absorb implicit templates, identifying discovered regions as subcomponents

		// If no implicit template found, and either:
		// (1) no component with the same name is found, and no template with the same name is found
		// or (2) a component w/ the same name is found, but no template is specified
		// Then throw an error and ignore that region.

		// How will this work?

		// Of the stuff initially in the DOM, and starting with each top-level region,
		// descend to the leaf branches in the current tree, absorbing the implicit contents 
		// from each of its child regions, until we reach a leaf.
		// ################################


		// TODO: v2.3
		// ################################
		// Only grab top-level regions, since implicit DOM parsing is enabled 
		// ################################

		// Grab initial regions from DOM
		collectRegions();
		
		// TODO: v2.0
		// ################################
		// Do the initial routing sequence
		//
		// Look at the #fragment url and fire the global route event
		// ################################


		// TODO: v2.1
		// ################################
		// Fire the register event on all async endpoint collections/models
		//
		// This will let things like socket adapters make the initial connection
		// ################################

		// ################################
		// Trigger callback
		if (cb) cb();

	});



	// Iterate through component definitions, merge them with templates, and build actual prototypes
	function buildComponentPrototypes() {
		_.each(Framework.components, function (componentDef, componentKey) {
		
			// If component id is not explicitly set, use the componentKey
			if (!componentDef.id) componentDef.id = componentKey;

			// Validate that the component definition doesn't have any forbidden properties
			Framework.Component.prototype._validateDefinition(componentDef);

			// TODO: Validate that the component isn't named anything naughty
			// (can't think of anything that would cause problems at the moment)

			// Search templates
			var template = Framework.templates[componentDef.id];

			// If no match for component was found in templates, issue a warning
			if (!template) {
				return Framework.warn(componentDef.id + ' :: No template found for component!');
			}

			// Save reference to template in component prototype
			Framework.debug(componentDef.id + ' :: Pairing component with template...');
			componentDef.template = template;

			// Translate right-hand shorthand for top-level keys and events object
			componentDef = objMap(componentDef, translateShorthand);
			if (componentDef.events) {
				componentDef.events = objMap(componentDef.events, translateShorthand);
			}

			// Go ahead and turn the definition into a real component prototype
			var componentPrototype = Framework.Component.extend(componentDef);

			// Discover subscriptions
			componentPrototype.prototype.subscriptions = {};
			
			// Iterate through each property on this component prototype
			_.each(componentPrototype.prototype, function (handler, key) {
				if (key.match(/^(%|#|~)/)) {
					if (!_.isFunction(handler)) {
						throw new Error(componentDef.id + ':: Invalid listener for subscription: ' + key);
					}
					componentPrototype.prototype.subscriptions[key] = handler;
				}
			});

			// Save prototype in global set for tracking
			Framework.components[componentDef.id] = componentPrototype;
		});
	}

	// Load any script tags on the page with type="text/template"
	function collectTemplates() {
		var templates = {};

		$('script[type="text/template"]').each(function (i, el) {
			var id = Mast.Util.el2id(el, true);
			templates[id] = $(el).html();

			// Strip whitespace leftover from script tags
			templates[id] = templates[id].replace(/^\s+/,'');
			templates[id] = templates[id].replace(/\s+$/,'');

			// Remove from DOM
			$(el).remove();
		});

		return templates;
	}

	// Collect any regions with the default component set from the DOM
	function collectRegions () {
		var $defaultRegions = $('region[default]');
		
		// Now instantiate the appropriate default component in each
		$defaultRegions.each(function(i,el) {

			// Pull id from region
			var regionId = Mast.Util.el2id(el);

			// Build region
			var region = new Framework.Region({
				id: regionId,
				$el: $(el),
				parent: { id: '*' }
			});

			// Extract default component id
			var componentId = $(el).attr('default');
			region.append(componentId);
		});
	}

	// Translate right-hand-side shorthand from things like #about_me and %mainMenu:open
	// to functions that perform the proper behaviors
	function translateShorthand (value, key) {

		// If this is an important, Framework-specific data key, and a function was specified,
		// run it to get the value
		if (_.isFunction(value) && (key === 'collection' || key === 'model')) {
			return value();
		}

		// Ignore other non-strings
		if (!_.isString(value)) return value;

		var matches;
		
		// Method to redirect user to a client-side URL
		if ( value.match(/^#/) ) {
			return function changeUrlFragment () {
				window.location.hash = value;
			};
		}
		// Method to trigger global event
		else if ( value.match(/^%/) ) {
			return function triggerEvent () {
				Mast.trigger(value);
			};
		}
		// Method do add the specified class
		else if ( matches = value.match(/^\+\s\.*(.+)/) && matches[1] ) {
			return function addClass () {
				this.$el.addClass(matches[1]);
			};
		}
		// Method to remove the specified class
		else if ( matches = value.match(/^\+\s*\.(.+)/) && matches[1] ) {
			return function removeClass () {
				this.$el.removeClass(matches[1]);
			};
		}

		return value;
	}

	// Map an object's values, but return a valid object
	function objMap(obj, transformFn) {
		return _.object(_.keys(obj), _.map(obj, transformFn));
	}


};