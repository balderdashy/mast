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
			this.renderDogs();
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

		changeTitle: function() {
			var title = this.$('#changeTitle').val().trim();

			if (title)
				this.model.set('title', title);

			this.$('#changeTitle').val('');
		},

		// Render the dog items by appending a DogItem component to the dog list region.
		// Each DogItem component gets instantiated with a passed in dog model.
		renderDogs: function() {
			this.collection.each(function(dog) {
				this.dogList.append('DogItem', {model: dog});
			}, this);
		},



		/**
		 * Collection bindings
		 */
		afterAdd: function(model, collection, options) {
			this.dogList.append('DogItem', {model: model});
		},

		// not necessary any more:
		//
		// afterChange: {
		// 	title: function(newVal) {
		// 		this.$('.page-title').text(newVal);
		// 	}
		// }
	};
});
