// You can set this up however you like, we're just using require here to try it out.
require([
	'Data',
	'components/Row',
	'text!components/Row.html',
	'components/Rainbow',
	'text!components/Rainbow.html',
	'components/Footer',
	'text!components/Footer.html'
	], function (Data, Row, RowTemplate, Rainbow, RainbowTemplate, Footer, FooterTemplate) {

		// Bring in global user data config
		_.extend(Mast.Data, Data);

		// Fire up app
		Mast.raise({

			// Build template and component sets
			templates: {
				Rainbow: RainbowTemplate,
				Row: RowTemplate,
				Footer: FooterTemplate
			},

			components: {
				Rainbow: Rainbow,
				Row: Row,
				Footer: Footer
			}

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