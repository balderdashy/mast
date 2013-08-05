module.exports = function(grunt) {

	'use strict';

	// Order of the source files that we want to concat
	var srcFiles = [
		// Dependencies
		'lib/deps/$.js',
		'lib/deps/_.js',
		'lib/deps/Backbone.js',
		'lib/deps/async.js',

		// Core
		'lib/Framework.js',
		'lib/Logger.js',
		'lib/Util.js',
		'lib/touch.js',
		'lib/define.js',
		'lib/Component.js',
		'lib/Region.js',
		'lib/Data.js',
		'lib/Router.js',
		'lib/Comet.js',
		'lib/ready.js',
		'lib/raise.js'
	];

	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),

		concat: {
			dist: {
				src: srcFiles,
				dest: 'mast.dev.js'
			}
		},

		uglify: {
			options: {
				report: 'min',
				preserveComments: false
			},
			files: {
				src: 'mast.dev.js',
				dest: 'mast.min.js'
			}
		}
	});

  grunt.loadNpmTasks('grunt-contrib-concat');
	grunt.loadNpmTasks('grunt-contrib-uglify');


	grunt.registerTask('default', [
		'build:dev',
		'build:production'
	]);

	grunt.registerTask('build:dev', ['concat']);
	grunt.registerTask('build:production', ['concat', 'uglify']);
};
