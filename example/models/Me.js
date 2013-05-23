define([], function () {
	Mast.Collection.extend({
		name	: 'Me',
		
		fetch	: 'get /session',
		save	: 'put /session'
	});
});