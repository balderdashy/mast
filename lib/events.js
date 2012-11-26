// Bind global events to the Mast dispatcher
(function() {
	$(function() {

		// $hashchange is defined in mast.js with the routing stuff

		// $mousemove
		$(window).live('mousemove',globalDispatchBinding('$mousemove'));

		// $click
		$(window).live('click',globalDispatchBinding('$click'));

		// $pressEnter
		$(window).live('pressEnter',globalDispatchBinding('$pressEnter'));
		
		// $pressEsc
		$(window).live('pressEsc',globalDispatchBinding('$pressEsc'));



		// Generate a function which fires the event trigger on the Mast global dispatcher
		function globalDispatchBinding (event) {
			return function () {
				var args = (_.toArray(arguments));
				Mast.trigger('event:'+eventName,args);
			};
		}
	});
})();