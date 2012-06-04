var compressor = require('node-minify'),
	path = require('path');

var config = {
	appEnvironment: 'development'
}

exports.compile=function(compilerCallback){

	// Validators for file extensions
	function isJs(filename) {
		return filename.match(/.+\.js$/g);
	}
	function isCss(filename) {
		return filename.match(/.+\.css$/g);
	}

	// Grab a list of applicable filenames given a directory name
	function ls(dirPath,filenameValidator,newPathPrefix) {
		var filenames = [];
		fs.readdirSync(dirPath).forEach(function(filename) {

			// TODO: Use conventions w/ filenames to improve everything
			// see https://github.com/balderdashdesign/mast/issues/5
	
			// Ignore files that start with an underscore
			if ((filename[0] === '_')) {
				return;
			}
	
			// Add this filename to the list
			if (filenameValidator && filenameValidator(filename)) {
				filenames.push(path.join(newPathPrefix || dirPath, filename));
			}
		});
		return filenames;
	}

	var isProduction = config.appEnvironment=="production",
	isDevelopment = config.appEnvironment=="development";
	
	function decorateDependency(filename) {
		if (isDevelopment) {
			return "/_lib/dependencies/"+filename+".min.js"
		}
		else {
			return "lib/mast/_lib/dependencies/"+filename+".min.js"
		}
	}

	function decorateCoreFile(filename) {
		if (isDevelopment) {
			return "/_lib/"+filename;
		}
		else {
			return "lib/mast/_lib/"+filename;
		}
	}

	// TODO: Crawl components and determine dependencies

	// Determine all of the files that should be compiled
	var jsDependencies =	_.map(["jquery","jquery-ui","underscore","backbone","logger","outside","pressFoo"],decorateDependency);
	var jsMastCore =		_.map(["mast.js"],decorateCoreFile);
	

	// Define the global array of js filenames
	_mastJsFiles = _.union(jsDependencies,jsMastCore);
	console.log("_mastJsFiles",_mastJsFiles);
	
	
	console.log("Compiling JS and CSS in " + config.appEnvironment + " mode...");
	var compmileWaitTimer = setInterval(function(){console.log("Still compiling CSS/JS...")},2500);

	if (isProduction) {

		async.parallel([
		
			function(finishedCss){
				console.log("MINIFIYING CSS!!!");
				// Combine and minify css
				new compressor.minify({
					type: 'yui',
					fileIn: _mastCssFiles,
					fileOut: './public/_target/app.css',
					callback: finishedCss
				});
			},
		
			function (finishedJs) {
				console.log("MINIFIYING JS!!!");
				// Combine and minify js
				new compressor.minify({
					type: 'gcc',
					fileIn: _mastJsFiles,
					fileOut: './public/_target/app.js',
					callback: finishedJs
				})	
			}
			],function() {
				console.log("******* Finished compiling production assets ********");
				clearTimeout(compmileWaitTimer);
				compilerCallback();
			})
	}

	else if (isDevelopment) {
		// Public access to /mast directory is only enabled in development mode
		// See express's app.configure() in main.js

		// We take advantage of that by directly linking to all of the necessary files
		clearTimeout(compmileWaitTimer);
		compilerCallback();
	}

}

exports.compile();