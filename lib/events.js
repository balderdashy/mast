// Bind global events to the Mast dispatcher
$(function() {

	// $hashchange is defined in mast.js with the routing stuff
	// $mousemove
	$(window).bind('mousemove', globalDispatchBinding('$mousemove'));

	// $click
	$(window).bind('click', globalDispatchBinding('$click'));

	// $pressEnter
	$(document).bind('gPressEnter', globalDispatchBinding('$pressEnter'));

	// $pressEsc
	$(document).bind('gPressEsc', globalDispatchBinding('$pressEsc'));



	// Generate a function which fires the event trigger on the Mast global dispatcher
	// and passes down arguments from the event handler


	function globalDispatchBinding(event) {
		return function() {
			Mast.trigger.apply(Mast, ['event:' + event].concat(_.toArray(arguments)));
		};
	}



	// 	function handle(e) {
	// 		e.stopPropagation();
	// 		var pressedkeycode = e.keyCode || e.which;
	// 		if(pressedkeycode === keyCode) {
	// 			// e.preventDefault();
	// 			origTarget.triggerHandler( handlerName,e );
	// 		}
	// 	}

	// // Create touch event
	// // var globalScope = false;
	// $.event.special['touch'] = {
	// 	// This method gets called the first time this event
	// 	// is bound to THIS particular element. It will be
	// 	// called once and ONLY once for EACH element.
	// 	add: function(eventData, namespaces) {
	// 		// var target = globalScope ? $(document) : $(this),
	// 		var target = $(this),
	// 			origTarget = $(this);

	// 		var isTouch = navigator.userAgent.match(/(iPad|iPhone|iPod|Android|BlackBerry)/ig);

	// 		console.log(eventData, namespaces);
	// 		var $el = $(this);
	// 		// $el.unbind('click');
	// 		// $el.unbind('hover');
	// 		// $el.unbind('touchstart');
	// 		// $el.unbind('touchcancel');
	// 		// $el.unbind('touchmove');
	// 		// $el.unbind('touchend');
	// 		// For development purposes, and in case this mobile-optimized experience 
	// 		// is being consumed on a P&C (point and click) device, 
	// 		// use click instead of touch when necessary
	// 		if(!isTouch) {

	// 			$el.bind('click', function(e) {
	// 				$el.trigger('touch',e);
	// 			});
	// 		}
	// 		// else {
	// 		console.log("$el", $el);
	// 		// When the user touches
	// 		$el.on('touchstart', function(e) {
	// 			alert("touchstart!!!");
	// 			window.clearTimeout($el.data('countdownToTapped'));
	// 			$el.data('countdownToTapped', window.setTimeout(function() {
	// 				$el.addClass('tapped');
	// 			}, 5));

	// 			// Always stop propagation on touch events
	// 			// Sorry :(
	// 			e.stopPropagation();

	// 			// TODO: Prevent default scroll behavior (in certain situations)
	// 			// e.preventDefault();
	// 		});

	// 		// When the user lets go
	// 		// Touchend cancels the tapCountdown timer
	// 		// It also fires the event we're interested in if the tapped state is already set
	// 		$el.on('touchend', function(e) {

	// 			if($el.hasClass('tapped')) {
	// 				$el.trigger('touch', e);
	// 			} else {
	// 				window.clearTimeout($el.data('countdownToTapped'));
	// 			}
	// 		});

	// 		// Touchcancel cancels the tapCountdown timer
	// 		// If the user's finger wanders into browser UI, or the touch otherwise needs to be canceled, the touchcancel event is sent
	// 		$el.on('touchcancel', function() {

	// 			if($el.hasClass('tapped')) {
	// 				$el.removeClass('tapped');
	// 			} else {
	// 				window.clearTimeout($el.data('countdownToTapped'));
	// 			}
	// 		});

	// 		// Touchmove cancels the countdownToTapped timer, as well as cancelling the tapped state if it is set
	// 		$el.on('touchmove', function(e) {

	// 			if($el.hasClass('tapped')) {
	// 				$el.removeClass('tapped');
	// 			} else {
	// 				window.clearTimeout($el.data('countdownToTapped'));
	// 			}

	// 			// Prevent propagation of scrolling
	// 			// e.stopPropagation();
	// 			// TODO: Prevent default scroll behavior (in certain situations)
	// 			e.preventDefault();
	// 		});

	// 		// Return void as we don't want jQuery to use the
	// 		// native event binding on this element.
	// 		return;
	// 	},

	// 	// This method gets called when this event us unbound
	// 	// from THIS particular element.
	// 	remove: function(namespaces) {

	// 		var isTouch = navigator.userAgent.match(/(iPad|iPhone|iPod|Android|BlackBerry)/ig);
	// 		var $el = $(this);

	// 		if(!isTouch) $el.unbind('click');
	// 		$el.unbind('touchstart');
	// 		$el.unbind('touchend');
	// 		$el.unbind('touchmove');
	// 		$el.unbind('touchcancel');

	// 		// Return void as we don't want jQuery to use the
	// 		// native event binding on this element.
	// 		return;
	// 	}
	// };



});