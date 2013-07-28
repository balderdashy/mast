// TODO: resolve how loading will work
var Framework = Mast;
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


	// Regexp to match "first class" DOM events
	// (these are allowed in the top level of a component definition as method keys)
	// 		i.e. /^(click|hover|blur|focus)( (.+))/
	//				[1] => event name
	//				[3] => selector
	'/DOMEvent/': new RegExp('^(' + _.reduce(DOMEvents, 
		function buildRegexp (memo, eventName, index) {

			// Omit `|` the first time
			if (index === 0) {
				return memo + eventName;
			}

			return memo + '|' + eventName;
		}, '') +
		')( (.+))?')
};
