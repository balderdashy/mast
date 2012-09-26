// JS file extension validator
function isJs(filename) {
	return filename.match(/.+\.js$/g);
}

// Concatenate dependencies, the mast core, and all of the module files in the proper order 
// and make it available through the exports.mast property

// todo