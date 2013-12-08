TEST.define('DogItem', function (){
	return {

		// Remove when clicked
		click: function (){
			this.model.collection.remove(this.model);
		}
	};
});
