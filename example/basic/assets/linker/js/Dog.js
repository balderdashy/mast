Mast.define('Dog', function () {
	return {

		afterRender: function () {
			this.off('foo', function (){});
		},

		click: '##foo'
	};
});

[
	// Global window events
	'window resize',
	'window scroll',

	// Localized browser events
	// (works on individual elements)
	'error',
	'scroll',

	// Form events
	'blur',
	'change',
	'focus',
	'focusin',
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