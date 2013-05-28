// App-level utilities
Mast.randomPastelColor = function () {
	var color = '#';
	for (var i=0;i<6;i++) {
		switch (Math.floor(Math.random() * 6)) {
			case 0: color += 'a'; break;
			case 1: color += 'b'; break;
			case 2: color += 'c'; break;
			case 3: color += 'd'; break;
			case 4: color += 'e'; break;
			case 5: color += 'f'; break;
		}
	}
	return color;
};