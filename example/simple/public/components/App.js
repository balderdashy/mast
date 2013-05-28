Mast.define('App', function () {
	return {

		'#': function () {
			this.content.attach('Home');
		},
		'#aboutUs': function () {
			this.content.attach('AboutUs');
		},
		'#contact': function () {
			this.content.attach('Contact');
		}

	};
});