/**
 * About
 *
 * The UI logic controlling the about view.
 * We are using collection binding methods here.
 */

TEST.define('About', function () {
	return {


		/**
		 * Lifecycle callbacks
		 */
		beforeRender: function(cb) {
			this.collection = new Backbone.Collection([
				{name: 'Sparky'},
				{name: 'Ruffus'},
				{name: 'Buddy'}
			]);

			// Since the about component assigns a model, it does not share a model with its parent.
			this.model = new Backbone.Model({
				title: 'About Page'
			});

			// Be sure to call callback at the end of beforeRender
			cb();
		},

		afterRender: function() {
			// Don't need to do this anymore:
			// this.renderDogs();

			// Instead, just use:
			this.renderCollection(this.collection, {
				itemTemplate: 'DogItem',
				intoRegion: this.dogList
			});
		},


		/**
		 * Event listeners
		 */
		events: {
			'click .add-dog': 'addDog',
			'click .change-title': 'changeTitle'
		},


		/**
		 * Component Methods
		 */
		addDog: function() {
			var dogName = this.$('#dogInput').val().trim();

			if (dogName)
				this.collection.add({name: dogName});

			this.$('#dogInput').val('');
		},


		// New `set` shorthand for models
		changeTitle: '@title=foo'

		// Similar to the original (below) except our shorthand is just setting a static value--
		// it won't accept user input, or clear the input field, or trim the input string)
		//
		//function() {
		// 	var title = this.$('#changeTitle').val().trim();

		// 	if (title)
		// 		this.model.set('title', title);

		// 	this.$('#changeTitle').val('');
		// },


		// Don't have to do this anymore: (b/c of renderCollection)
		//
		// Render the dog items by appending a DogItem component to the dog list region.
		// Each DogItem component gets instantiated with a passed in dog model.
		// renderDogs: function() {

		// 	//
		// 	// this.collection.each(function(dog) {
		// 	// 	this.dogList.append('DogItem', {model: dog});
		// 	// }, this);

		// },



		/**
		 * Collection bindings
		 */
		// not necessary any more: (b/c of renderCollection)
		//
		// afterAdd: function(model, collection, options) {
		// 	this.dogList.append('DogItem', {model: model});
		// },

		// not necessary any more: (b/c of HTML data bindings)
		//
		// afterChange: {
		// 	title: function(newVal) {
		// 		this.$('.page-title').text(newVal);
		// 	}
		// }
	};
});
