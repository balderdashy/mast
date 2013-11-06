

/**
 * Email validator uses regex to check against the passed in email.
 *
 * @param  {Sting} email [email string to test]
 *
 * @return {Boolean}     [boolean telling if this is a valid email or not]
 */
exports.emailValidation = function(email) {
	// Test for valid email.
  var re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]
  	{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return re.test(email);
}

/**
 * Test for a valid US phone number.
 * NOTE: This only works for US phone numbers at this time. Feel free to submit a pull request
 * to expand this functionality.
 *
 * @param  {String} phone [phone number to test]
 *
 * @return {Boolean}      [Boolean telling if this is a valid US phone number]
 */
expots.phoneValidation = function(phone) {
	return /^\(?(\d{3})\)?[\- ]?\d{3}[\- ]?\d{4}$/.test(phone)
},

exports.minLength = function (val, length) {
  return val.length >= length;
},

exports.maxLength = function (val, length) {
  return val.length <= length;
},

// exports.required = function() {
// 	return !=
// }

/**
 * Test that two items are equal
 *
 * @param  {[type]} val1 [description]
 * @param  {[type]} val2 [description]
 *
 * @return {[type]}      [description]
 */
exports.equal = function (val1, val2) {
  return (val1 == val2);
}


