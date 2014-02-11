// angular.module('Waterline', []);




angular.module('App', [])

	.controller('FooCtrl', function($scope) {
		var DOM = $scope;

		Pirate.find().exec(function (err, pirates) {
			if (err) throw err;
			$scope.list = pirates;
			$scope.$apply();
		});

	});
