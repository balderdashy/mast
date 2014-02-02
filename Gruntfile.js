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



	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),

		uglify: {
			options: {
				report: 'min',
				preserveComments: false
			},
			files: {
				src: './dist/mast.min.js',
				dest: './dist/mast.min.js',
			}
		},

		watchify: {
			dev: {
				options: {
					debug: true
				},
				src: './lib/src/index.js',
				dest: './dist/mast.dev.js'
			},

			prod: {
				options: {
					debug: false
				},
				src: './lib/src/index.js',
				dest: './dist/mast.min.js'
			},

			devEnv: {
				options: {
					keepalive: true,
					debug: true
				},
				src: './lib/src/index.js',
				dest: './.tmp.mast.build.js'
			}
		}
	});

	grunt.loadNpmTasks('grunt-contrib-uglify');
	grunt.loadNpmTasks('grunt-watchify');

	// Build both development and production versions of mast.
	grunt.registerTask('default', [
		'build:dev',
		'build:prod'
	]);

	// Run a development enviroment.
	grunt.registerTask('develop', [
		'env:dev'
	]);

	grunt.registerTask('build:dev', ['watchify:dev']);
	grunt.registerTask('build:prod', ['watchify:prod', 'uglify']);
	grunt.registerTask('env:dev', ['watchify:devEnv']);
};
