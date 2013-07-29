Mast.define('Body', function () {
	return {

		// Trigger the %test subscription whenever a <h1>
		// inside this component's $el is clicked
		//
		// Also stop propagation (.) so the event doesn't
		// bubble and trigger the next handler (click)
		'click h1'	: '%test.',

		// if anywhere ELSE inside this component's $el is clicked,
		// log a note to the console
		'click'		: '>>> Note: The click event of the Body component fired.',



		// When %test subscription is triggered,
		'%test'		: '!!! You fired the %test trigger!',


		// Route navigation menu to change the URL appropriately
		// NOTE:	This could be done w/o javascript using <a href=""></a>
		//			In this case, we used a `destination` HTML attribute to indicate 
		//			the URL target.
		'click [destination="#about"]': '#about',
		'click [destination="#home"]': '#home',

		// Change `content` region according to URL
		'#about'	: 'content@About',
		'#home'		: 'content@Home',

		// Redirect empty URL to '#home' handler (changes URL)
		'#'			: '#home'
	};
});

