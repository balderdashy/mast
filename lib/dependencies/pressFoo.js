(function(){


	// Map a few pressFoo events automatically
	pressFoo(27,'pressEscape', false, 'keydown');
	pressFoo(13,'pressEnter',false, 'keydown');
	
	// Map global pressFoo events
	pressFoo(27,'gPressEscape',true,"keydown");
	pressFoo(13,'gPressEnter',true,'keydown');
	
	
	// Enable public access to this method for registering more events later
	$.pressFoo = pressFoo;
	
	// Map a custom keypress event
	function pressFoo(keyCode,handlerName,globalScope,eventSrc) {
		eventSrc = eventSrc || "keyup";
		
		var pressEvent = function (origTarget,keyCode,handlerName) {
			return function(e) {
				e.stopPropagation();
				var pressedkeycode = e.keyCode || e.which;
				if(pressedkeycode == keyCode) {
					e.preventDefault();
					origTarget.triggerHandler( handlerName,e );
				}
			};
		};
		
		// Add our new event to jQuery
		// (handlerName is the name of the new event)
		$.event.special[handlerName] = {
		
			// This method gets called the first time this event
			// is bound to THIS particular element. It will be
			// called once and ONLY once for EACH element.
			setup: function( eventData, namespaces ){
				var target = globalScope ? $(document) : $(this),
				origTarget = $(this),
				dataKeyName = '_pressFooBound'+keyCode;

				// Bind the event handler that we are going
				// to need to make sure this event fires correctly.
				var eventHandler = pressEvent(origTarget,keyCode,handlerName);
				if (origTarget.data(dataKeyName)) {			// Clear out existing keyup or keydown events
					target.unbind(eventSrc,eventHandler);
					origTarget.data(dataKeyName,false);
				}
				target.bind(eventSrc, eventHandler);
				origTarget.data(dataKeyName,eventHandler);
			

				// Return void as we don't want jQuery to use the
				// native event binding on this element.
				return;
			},

			// This method gets called when this event us unbound
			// from THIS particular element.
			teardown: function( namespaces ) {

				var target = globalScope ? $(document) : $(this),
				origTarget = $(this),
				dataKeyName = '_pressFooBound'+keyCode;

				// Bind the event handler that we are going
				// to need to make sure this event fires correctly.
				target.unbind( eventSrc, origTarget.data(dataKeyName));
				origTarget.data(dataKeyName,false);

				// Return void as we don't want jQuery to use the
				// native event binding on this element.
				return;
			}
		};
	}

})();