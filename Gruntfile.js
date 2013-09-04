module.exports = function(grunt) {

	// Order of the source files that we want to concatenate
	var srcFiles = [
		// Dependencies
		'lib/deps/$.js',
		'lib/deps/_.js',
		'lib/deps/Backbone.js',
		'lib/touch.js',
		'lib/deps/async.js',

		// Core
		'lib/Framework.js',
		'lib/Logger.js',
		'lib/Util.js',
		'lib/define.js',
		'lib/Component.js',
		'lib/Region.js',
		'lib/Data.js',
		'lib/Router.js',
		'lib/ready.js',
		'lib/raise.js'
	];


	// Man they should totally make this stuff more declarative
	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),

		concat: {

			// Concatenate the source files
			// into a single `framework.dev.js` file for the example
			dist: {
				src: srcFiles,
				dest: 'example/dependencies/framework.dev.js'
			}
		},

		uglify: {
			options: {
				report: 'min',
				preserveComments: false
			},
			files: {
				src: 'framework.dev.js',
				dest: 'framework.min.js'
			}
		},

		watchify: {
			options: {
				debug: true
			},
			dev: {
        src: './lib/src/build.js',
        dest: './lib/mast.js'
      }
		}
	});

	grunt.loadNpmTasks('grunt-contrib-concat');
	grunt.loadNpmTasks('grunt-contrib-uglify');
	grunt.loadNpmTasks('grunt-watchify');

	// It's so close!
	grunt.registerTask('default', [
		'build:dev'
		// 'build:production'
	]);

	grunt.registerTask('build:dev', ['watchify']);
	grunt.registerTask('build:production', ['concat', 'uglify']);
};
