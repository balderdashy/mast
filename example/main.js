// You can set this up however you like, we're just using require here to try it out.
require([
	'Data',
	'components/Row',
	'text!components/Row.html',
	'components/Rainbow',
	'text!components/Rainbow.html'
	], function (Data, Row, RowTemplate, Rainbow, RainbowTemplate) {

		// RequireJS is only used to load templates, components, and data files
		// Once the files are in memory, as long as Mast knows about your data and templates, 
		// you can use Mast.define() to identify components

		// You can also use script tags to manually load all of this stuff on the page.
		// As long as it's before Mast.raise(), you can specify them in any order

		// Any <script> tags with the class="mast-template" will get automatically assimilated by id or data-id

		// Fire up app
		Mast.raise({

			// Components are automatically integrated when they're loaded
			// since we're using Mast.define()

			// Load templates
			templates: {
				Rainbow: RainbowTemplate,
				Row: RowTemplate
			},

			// Load app data
			data: Data

		}, function appReady () {
			Mast.log('App is ready.');
		});

		Mast.randomPastelColor = function () {
			var color = '#';
			for (var i=0;i<6;i++) {
				switch (Math.floor(Math.random() * 6)) {
					case 0: color += 'a'; break;
					case 1: color += 'b'; break;
					case 2: color += 'c'; break;
					case 3: color += 'd'; break;
					case 4: color += 'e'; break;
					case 5: color += 'f'; break;
				}
			}
			return color;
		};
});