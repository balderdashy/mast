// TODO: resolve how loading will work
var Framework = window.Mast;
////////////////////////////////////////////////////////////////////////////

// Supported "first-class" DOM events
var DOMEvents = [

	// Localized browser events
	// (works on individual elements)
	'error',
	'scroll',

	// Mouse events
	'click',
	'dblclick',
	'mousedown',
	'mouseup',
	'hover',
	'mouseenter',
	'mouseleave',
	'mouseover',
	'mouseout',
	'mousemove',
	

	// Keyboard events
	'keydown',
	'keyup',
	'keypress',

	// Form events
	'blur',
	'change',
	'focus',
	'focusin',
	'focusout',
	'select',
	'submit',

	// Raw touch events
	'touchstart',
	'touchend',
	'touchmove',
	'touchcancel',

	// Manufactured touch event
	'touch'
];



// Special Framework events
// (not implemented yet)
var FrameworkEvents = [

	// e.g. 'window resize', 'window scroll', 'window mousemove'...
	'window .+',

	'rightclick',

	'clickoutside'
];


/*
// Handle global window events
// (which are not covered by backbone natively)
var matchedSpecialDOMEvent = eventName.match(/window (.+)/);
if (matchedSpecialDOMEvent && matchedSpecialDOMEvent[1]) {
	$(window).unbind(matchedSpecialDOMEvent[1], handler);
	$(window).bind(matchedSpecialDOMEvent[1], handler);
}
*/





Framework.Util = {

	// Grab id xor data-id from an HTML element
	el2id: function (el, required) {
		var id = $(el).attr('id');
		var dataId = $(el).attr('data-id');

		if (id && dataId) {
			throw new Error(id + ' :: Cannot set both `id` and `data-id`!  Please use one or the other.  (data-id is safest)');
		}
		if (required && !id && !dataId) {
			throw new Error('No id specified in element where it is required:\n' + el);
		}

		return id || dataId;
	},



	/**
	 * Regexp to match "first class" DOM events
	 * (these are allowed in the top level of a component definition as method keys)
	 *		i.e. /^(click|hover|blur|focus)( (.+))/
	 *			[1] => event name
	 *			[3] => selector
	 */

	'/DOMEvent/': new RegExp('^(' + _.reduce(DOMEvents, 
		function buildRegexp (memo, eventName, index) {

			// Omit `|` the first time
			if (index === 0) {
				return memo + eventName;
			}

			return memo + '|' + eventName;
		}, '') +
		')( (.+))?'),



	/**
	 * Returns whether the specified event key matches a DOM event
	 *
	 * if no match is found
	 * @returns {Boolean} `false`
	 *
	 * otherwise
	 * @returns {Object} {
	 *		name		: name of DOM event
	 *		selector	: optionally, DOM selector(s) for delegation, or `undefined`
	 *	}
	 *
	 * NOTE: this function is cached using _.memoize
	 */

	parseDOMEvent: _.memoize(function (key) {

		var matches = key.match(Framework.Util['/DOMEvent/']);
		
		if (!matches || !matches[1]) {
			return false;
		}

		return {
			name		: matches[1],
			selector	: matches[3]
		};
	}),




	/**
	 * Translate **right-hand-side abbreviations** into functions that perform
	 * the proper behaviors, e.g.
	 *		#about_me
	 *		%mainMenu:open
	 */

	translateShorthand: function translateShorthand (value, key) {

		// If this is an important, Framework-specific data key, 
		// and a function was specified, run it to get its value
		// (this is to keep parity with Backbone's similar functionality)
		if (_.isFunction(value) && (key === 'collection' || key === 'model')) {
			return value();
		}

		// Ignore other non-strings
		if ( !_.isString(value) ) {
			return value;
		}

		var matches;
		var fn;

		// Redirects user to client-side URL, w/o affecting browser history
		// Like calling `Backbone.history.navigate('/foo', { replace: true })`
		if ( value.match(/^##/) ) {
			fn = function redirectAndCoverTracks () {
				var url = value.replace(/^##/,'');
				Framework.history.navigate(url, { trigger: true, replace: true });
			};
		}
		// Method to redirect user to a client-side URL, then call the handler
		else if ( value.match(/^#/) ) {
			fn = function changeUrlFragment () {
				var url = value.replace(/^#/,'');
				Framework.history.navigate(url, { trigger: true });
			};
		}
		// Method to trigger global event
		else if ( value.match(/^%/) ) {
			fn = function triggerEvent () {
				Framework.verbose(this.id + ' :: Triggering event (' + value + ')...');
				Framework.trigger(value);
			};			
		}
		// Method to fire a test alert
		// (use message, if specified)
		else if ( matches = value.match(/^!!!\s*(.+)?/) ) {
			fn = function bangAlert (e) {

				// If specified, message is used, otherwise 'Alert triggered!'
				var msg = (matches && matches[1]) || 'Debug alert (!!!) triggered!';

				// Other diagnostic information
				msg += '\n\nDiagnostics\n========================\n';
				if (e && e.currentTarget) {
					msg += 'e.currentTarget :: ' + e.currentTarget;
				}
				if (this.id) {
					msg +='this.id :: ' + this.id;
				}

				alert(msg);
			};
		}
		// Method to add the specified class
		else if ( (matches = value.match(/^\+\s*\.(.+)/)) && matches[1] ) {
			fn = function addClass () {
				this.$el.addClass(matches[1]);
			};
		}
		// Method to remove the specified class
		else if ( (matches = value.match(/^\-\s*\.(.+)/)) && matches[1] ) {
			fn = function removeClass () {
				this.$el.removeClass(matches[1]);
			};
		}
		// Method to toggle the specified class
		else if ( (matches = value.match(/^\!\s*\.(.+)/)) && matches[1] ) {
			fn = function toggleClass () {
				Framework.verbose(this.id + ' :: Toggling class (' + matches[1] + ')...');
				this.$el.toggleClass(matches[1]);
			};
		}

		// TODO:	allow descendants to be controlled via shorthand
		//			e.g. : 'li.row -.highlighted'
		//			would remove the `highlighted` class from this.$('li.row')


		// If short-hand matched, return the dereferenced function
		if (fn) {

			Framework.verbose('Interpreting meaning from shorthand :: `' + value + '`...');

			// Curry the result function with any suffix matches
			var curriedFn = fn;

			// Trailing `.` indicates an e.stopPropagation()
			if (value.match(/\.\s*$/)) {
				curriedFn = function andStopPropagation (e) {
					
					// Call original function
					fn();

					// then immediately stop event bubbling/propagation
					if (e && e.stopPropagation) {
						e.stopPropagation();
					}
					else {
						Framework.warn(
							this.id + ' :: Trailing `.` shorthand was used to invoke an ' +
							'e.stopPropagation(), but "' + value + '" was not triggered by a DOM event!\n' + 
							'Probably best to double-check this was what you meant to do.');
					}
				};
			}


			return curriedFn;
		}


		// Otherwise, if no short-hand matched, pass the original value
		// straight through
		return value;
	},



	// Map an object's values, but return a valid object
	// (this function is handy because underscore.map() returns a list, not an object)
	objMap: function objMap (obj, transformFn) {
		return _.object(_.keys(obj), _.map(obj, transformFn));
	}
};




/**
 * Event toolkit
 */

Framework.Util.Events = {


	/**
	 * Parse a dictionary of events
	 * (optionally filter by event type)
	 *
	 * @param {Object} events
	 *		`events` is a Backbone.View event object
	 *
	 * @param {Object} options
	 *	{
	 *		only: return the events explicitly laid out in this list
	 *	}
	 *
	 * @returns list of matching event keys
	 */

	parse: function (events, options) {

		var eventKeys = _.keys(events || {}),
			limitEvents,
			parsedEvents = [];

		// Optionally filter using set of acceptable event types
		limitEvents = options.only;
		eventKeys = _.filter(eventKeys, function checkEventName (eventKey) {
			
			// Parse event string into semantic representation
			var event = Framework.Util.parseDOMEvent(eventKey);
			parsedEvents.push(event);
			
			// Optional filter
			if (limitEvents) {
				return _.contains(limitEvents, event.name);
			}
			return true;
		});

		return parsedEvents;
	},




	/**
	 * Given a list of event expressions
	 *
	 * @param {Array} semanticEvents
	 *		List of event objs from `Framwork.Util.Events.parse`
	 *
	 * @returns jQuery set of matched elements
	 */

	getElements: function (semanticEvents) {

		// Iteratively build a set of affected elements
		var $affected = $();
		_.each(semanticEvents, function lookupElementsForEvent (event) {

			// Determine matched elements
			// Use delegate selector if specified
			// Otherwise, grab the element for this component
			var $matched =	event.selector ? 
							self.$(event.selector) :
							self.$el;

			// Add matched elements to set
			$affected = $affected.add( $matched );
		});

		return $affected;
	}
};
