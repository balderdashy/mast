define(['Data'], function (Data) {
	return {
		
		events: {
			'click .add-thing': function addThing () { 
				this.collection.add({
					color: Mast.randomPastelColor()
				});
			},

			'click .remove-thing': function removeFirstThing () {
				this.collection.shift();
			},

			'click .wipe-things': function removeAllThings () {
				this.collection.reset();
			}
		},

		collection: Data.Rainbows,

		// Standard collection bindings
		afterAdd: function (model, collection, options) {
			this.navOperations.append('Operation', {
				model: model
			});

			// Clear empty state
			if (this.collection.length > 0) {
				this.$('.emptyhtml').fadeOut();
			}
		},
		afterRemove: function (model, collection, options) {
			this.navOperations.remove(0);

			// Empty state
			if (this.collection.length < 1) {
				this.$('.emptyhtml').fadeIn();
			}
		},
		afterReset: function (collection, options) {
			this.navOperations.empty();

			// Empty state
			if (this.collection.length < 1) {
				this.$('.emptyhtml').fadeIn();
			}
		}

	};
});

