// Bind global events to the Mast dispatcher
$(function() {

	// $hashchange is defined in mast.js with the routing stuff
	// $mousemove
	$(window).bind('mousemove', globalDispatchBinding('$mousemove'));

	// $click
	$(window).bind('click', globalDispatchBinding('$click'));

	// $pressEnter
	$(window).bind('pressEnter', globalDispatchBinding('$pressEnter'));

	// $pressEsc
	$(window).bind('pressEsc', globalDispatchBinding('$pressEsc'));



	// Generate a function which fires the event trigger on the Mast global dispatcher
	// and passes down arguments from the event handler
	function globalDispatchBinding(event) {
		return function() {
			Mast.trigger.apply(Mast,['event:'+event].concat(_.toArray(arguments)));
		};
	}
});