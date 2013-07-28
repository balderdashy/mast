Mast.define('Dog', function () {
	return {

		afterRender: function () {
			console.log('rendered this::', this.$el)
			console.log('events::', this.events);
		},

		'click p': function (){
			alert('works!');
		}
	};
});

