define([], function () {
	Mast.Collection.extend({
		name	: 'Todo',
		
		// Url notation:
		url		: '/todo',
		// is equivalent to:
		fetch	: 'get /todo',
		create	: 'post /todo',
		save	: 'put /todo',
		destroy	: 'delete /todo'
	});
});