module.exports = function(grunt) {

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
