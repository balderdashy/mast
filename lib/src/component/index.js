/**
 * Component is an extended `Backbone.View`. It add features suck as automatic event binding,
 * rendering, lifecycle hooks and events, and more.
 */

var lifecycleHooks  = require('./lifecycleHooks');
var lifecycleEvents = require('./lifecycleEvents');
var bindEvents      = require('./bindEvents');
var close           = require('./close');
var render          = require('./render');
var bindEvents      = require ('./bindEvents');

Component = module.exports = Backbone.View.extend();


_.extend(Component.prototype, {

	// Lifecycle Hooks
	beforeRender: function(cb) {
		lifecycleHooks.beforeRender.call(this, cb);
	},
	beforeClose: function(cb) {
		lifecycleHooks.beforeClose.call(this, cb);
	},
	afterRender: function() {
		lifecycleHooks.afterRender.call(this);
	},
	cancelRender: function() {
		lifecycleHooks.cancelRender.call(this);
	},
	cancelClose: function() {
		lifecycleHooks.cancelClose.call(this);
	},

	// Lifecycle Events
	afterChange: function(model, options) {
		lifecycleEvents.afterChange.call(this, model, options);
	},
	afterAdd: function(model, collection, options) {
		lifecycleEvents.afterAdd.call(this, model, collection, options);
	},
	afterRemove: function(model, collection, options) {
		lifecycleEvents.afterRemove.call(this, model, collection, options);
	},
	afterReset: function(collection, options) {
		lifecycleEvents.afterReset.call(this, collection, options);
	}
});

Component.prototype.close = function() {close.call(this)};
Component.prototype.render = function(atIndex) {render.call(this, atIndex);};


Component.prototype.initialize = function(properties) {

	var self = this;

	// Extend instance w/ specified properties and methods
	_.extend(this, properties);

	// Start with empty regions object
	this.regions = {};

	// Bind the events on model/collections and global triggered events.
	bindEvents.collectionEvents.call(this);
	bindEvents.modelEvents.call(this);
	bindEvents.globalTriggers.call(this);

	// Encourage child methods to use the component context
	_.bindAll(this);

	// Bind context to event handlers
	_.each(this.events, function(handler, eventString) {
		_.bind(handler, this);
	}, this);
};
