// You can set this up however you like, we're just using require here to try it out.
require([
	// These are here because we need to wait to raise until they're loaded
	'util', 'components/Rainbow', 'components/Row'
	], function (Data) {

		// RequireJS is only used to load templates, components, and data files
		// Once the files are in memory, as long as Mast knows about your data and templates, 
		// you can use Mast.define() to identify components

		// You can also use script tags to manually load all of this stuff on the page.
		// As long as it's before Mast.raise(), you can specify them in any order

		// Any <script> tags with the class="mast-template" will get automatically assimilated by id or data-id

		// Fire up app
		Mast.raise({

			// Load app data
			data: Data

		}, function appReady () {
			Mast.log('App is ready.');
		});
});