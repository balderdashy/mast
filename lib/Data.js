// TODO: resolve how loading will work
var Framework = FRAMEWORK;
////////////////////////////////////////////////////////////////////////////


// TODO:	make this actually useful
//			(right now, Framework.Data is basically just an empty object)

var Datastore = function () {};

Datastore.prototype.saveToLocalStorage = function () {
	throw new Error('TODO');
};

Datastore.prototype.loadFromLocalStorage = function () {
	throw new Error('TODO');
};


Framework.Data = new Datastore();
_.extend(Framework.Data, Framework.Events);