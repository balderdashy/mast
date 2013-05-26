define([], function () {
	return {
		
		events: {
			'click .add-thing': function addThing () { 
				Mast.Data.Operation.set('color', randomPastelColor());
				this.collection.add({});
			},

			'click .remove-thing': function removeFirstThing () {
				this.navOperations.remove(0);
			},

			'click .wipe-things': function removeAllThings () {
				this.collection.reset();
			}
		},

		collection: new Mast.Collection({
			model: Backbone.Model
		}),

		// Standard collection bindings
		afterAdd: function () {
			this.navOperations.append('Operation');
		},
		afterRemove: function () {
			this.collection.shift();
		},
		afterReset: function () {
			this.navOperations.empty();
		}

	};


	function randomPastelColor () {
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
	}
});

