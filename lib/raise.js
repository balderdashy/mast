// TODO: resolve how loading will work
var Framework = window.FRAMEWORK;
////////////////////////////////////////////////////////////////////////////


/**
 * This is the starting point to your application.  You should grab templates and components
 * before calling Framework.raise() using something like Require.js.
 *
 * @param {Object} options
		data: { authenticated: false },
		templates: { componentName: HTMLOrPrecompiledFn },
		components: { componentName: ComponentDefinition }
 * @param {Function} cb
 */

Framework.raise = function (options, cb) {

	// If only one arg is present, use options as callback if possible
	// If options are not defined, use an empty object
	if (!cb && _.isFunction(options)) {
		cb = options;
	}
	if (!_.isPlainObject(options)) {
		options = {};
	}

	// Apply defaults
	_.defaults(Framework, {
		throttleWindowResize: 200,
		logLevel: 'warn',
		logger: undefined,
		production: false
	});

	// Apply overrides from options
	_.extend(Framework, options);

	// Interpret `production` as `logLevel === 'silent'`
	if (Framework.production) {
		Framework.logLevel = 'silent';
	}

	// Initialize logger
	new Logger(Framework);

	// Merge data into Framework.data
	_.extend(Framework.data, options.data || {});

	// Merge specified templates with Framework.templates
	_.extend(Framework.templates, options.templates || {});

	// If Framework.define() was used, build the list of components
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
		// (and append default templates)
		collectRegions();


		// Bind global DOM events as Framework events
		// (e.g. %window:resize)
		var triggerResizeEvent = _.debounce(function () {
			Framework.trigger('%window:resize');
		}, options.throttleWindowResize || 0);
		$(window).resize(triggerResizeEvent);
		// TODO: add more events and extrapolate this logic to a separate module


		// Do the initial routing sequence
		// Look at the #fragment url and fire the global route event
		Framework.history.start(_.defaults({
			pushState: undefined,
			hashChange: undefined,
			root: undefined
		}, options));


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
				return Framework.warn(
					componentDef.id + ' :: No template found for component!' +
					'\nTemplates don\'t need a component unless you want interactivity, ' + 
					'every component *should* have a matching template!!' +
					'\nUsing components without templates may seem necessary, ' + 
					'but it\'s not.  It makes your view logic incorporeal, and makes your colleagues ' +
					'uncomfortable.');
			}

			// Save reference to template in component prototype
			Framework.verbose(componentDef.id + ' :: Pairing component with template...');
			componentDef.template = template;

			// Translate right-hand shorthand for top-level keys
			componentDef = Framework.Util.objMap(
				componentDef,
				Framework.Util.translateShorthand
			);

			// and events object
			if (componentDef.events) {
				componentDef.events = Framework.Util.objMap(
					componentDef.events,
					Framework.Util.translateShorthand
				);
			}

			// and afterChange bindings
			if (	_.isObject(componentDef.afterChange) && 
					!_.isFunction(componentDef.afterChange)		) {

				componentDef.afterChange = Framework.Util.objMap(
					componentDef.afterChange,
					Framework.Util.translateShorthand
				);
			}

			// Go ahead and turn the definition into a real component prototype
			Framework.verbose(componentDef.id + ' :: Building component prototype...');
			var componentPrototype = Framework.Component.extend(componentDef);

			// Discover subscriptions
			componentPrototype.prototype.subscriptions = {};

			// Iterate through each property on this component prototype
			_.each(componentPrototype.prototype, function (handler, key) {
				
				// Detect DOM events
				var matchedDOMEvents = key.match(Framework.Util['/DOMEvent/']);
				if (matchedDOMEvents) {
					var eventName = matchedDOMEvents[1];
					var delegateSelector = matchedDOMEvents[3];

					// Stow them in events hash
					componentPrototype.prototype.events = componentPrototype.prototype.events || {};
					componentPrototype.prototype.events[key] = handler;
				}

				// Add app events (%), routes (#), and data listeners (~) to subscriptions hash
				else if (key.match(/^(%|#|~)/)) {

					if (_.isString(handler)) {
						throw new Error(componentDef.id + 
							':: Invalid listener for subscription: ' + key + '.\n' +
							'Define your callback with an anonymous function instead of a string.'
						);
					}
					if (!_.isFunction(handler)) {
						throw new Error(componentDef.id + 
							':: Invalid listener for subscription: ' + key);
					}

					componentPrototype.prototype.subscriptions[key] = handler;

				}

				// Extend one or more other components
				else if (key === 'extendComponents') {
					var objToMerge = {};
					_.each(handler, function(childId){

						if (!Framework.components[childId]){
							throw new Error(
							componentDef.id + ' :: ' + 
							'Trying to define/extend this component from `' + childId + '`, ' +
							'but no component with that id can be found.'
							);
						}

						_.extend(objToMerge, Framework.components[childId]);

					});

					_.defaults(componentPrototype.prototype, objToMerge);
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
			var id = Framework.Util.el2id(el, true);
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

		// Provide backwards compatibility for legacy notation
		$('region[default],[data-region][default],region[template],[data-region][template]').each(function () {
			$e = $(this);
			var componentId = $e.attr('default') || $e.attr('template');
			$e.attr('contents', componentId);
		});

		// Now instantiate the appropriate default component in each
		// region with a specified template/component
		$('region[contents],[data-region][contents]').each(function(i,el) {
			Framework.Region.fromElement(el);
		});
	}


};
