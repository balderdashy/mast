module.exports = function(grunt) {

	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),

		uglify: {

			// Minify the Mast core + jQuery + lodash + Backbone
			withDeps: {
				options: {
					report: 'min',
					preserveComments: false
				},
				files: {

					// TODO: bring deps in w/ bower
					// (the following is a short-term hack)
					'./dist/mast.withDependencies.min.js': [
						'./example/deps/jquery.js',
						'./example/deps/lodash.js',
						'./example/deps/Backbone.js',
						'./dist/mast.min.js'
					]
				}
			},

			// Minify just the Mast core
			bare: {
				options: {
					report: 'min',
					preserveComments: false
				},
				files: {
					'./dist/mast.min.js': './dist/mast.min.js'
				}
			}
		},

		watchify: {
			dev: {
				options: {
					standalone: 'Mast',
					debug: true
				},
				src: './lib/index.js',
				dest: './dist/mast.dev.js'
			},

			prod: {
				options: {
					standalone: 'Mast',
					debug: false
				},
				src: './lib/index.js',
				dest: './dist/mast.min.js'
			},

			devEnv: {
				options: {
					standalone: 'Mast',
					keepalive: true,
					debug: true
				},
				src: './lib/index.js',
				dest: './.tmp.mast.build.js'
			}
		}
	});

	grunt.loadNpmTasks('grunt-contrib-uglify');
	grunt.loadNpmTasks('grunt-watchify');

	// Build both development and production versions of mast.
	grunt.registerTask('default', [
		'build:dev',
		// 'build:prod',
		'build:prodWithDeps'
	]);

	// Run a development enviroment.
	grunt.registerTask('develop', [
		'env:dev'
	]);

	grunt.registerTask('build:dev', ['watchify:dev']);
	grunt.registerTask('build:prod', ['watchify:prod', 'uglify:bare']);
	grunt.registerTask('build:prodWithDeps', ['watchify:prod', 'uglify:withDeps']);
	grunt.registerTask('env:dev', ['watchify:devEnv']);
};
