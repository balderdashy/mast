// Add outerHtml to jQuery
jQuery.fn.outerHTML = function(s) {
	return s
	? this.before(s).remove()
	: jQuery("<p>").append(this.eq(0).clone()).html();
};

// jQuery plugin to find the closest descendant
$.fn.closest_descendant = function(filter) {
	var $found = $(),
	$currentSet = this;															// Current place
	while ($currentSet.length) {
		$found = $currentSet.filter(filter);
		if ($found.length) break;												// At least one match: break loop
		$currentSet = $currentSet.children();									// Get all children of the current set
	}
	return $found.first();														// Return first match of the collection
}    