Mast.define('Rainbow', function () {

	return {

		'#test': function () {
			alert('#test');
		},
		
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

		// Doing it this way ensures that this component is bound to a global collection set, 
		// and if one already exists, it uses it
		collection: function () {
			return Mast.data.Rainbows = Mast.data.Rainbows || new Mast.Collection();
		},

		// Standard collection bindings
		afterAdd: function (model, collection, options) {

			// Clear empty state
			if (this.collection.length > 0) {
				this.$('.emptyhtml').fadeOut();
			}

			// Render the row in the appropriate place
			this.rows.insert(
				options.at || collection.length-1,
				'Row', {
					model: model
				});

		},
		afterRemove: function (model, collection, options) {
			this.rows.remove(options.at || 0);

			// Empty state
			if (this.collection.length < 1) {
				this.$('.emptyhtml').fadeIn();
			}
		},
		afterReset: function (collection, options) {
			var self = this;

			// Flush region and replace w/ new contents
			this.rows.empty();
			collection.each(function (model) {
				self.rows.append('Row', { model: model });
			});

			// Empty state
			if (this.collection.length < 1) {
				this.$('.emptyhtml').fadeIn();
			}
		}
	};
});