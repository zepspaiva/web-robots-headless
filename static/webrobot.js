 function levenshtein(str1, str2) {

	if (str1 == null && str2 == null) return 0;
	if (str1 == null) return String(str2).length;
	if (str2 == null) return String(str1).length;

	str1 = String(str1); str2 = String(str2);

	var current = [], prev, value;

	for (var i = 0; i <= str2.length; i++)
		for (var j = 0; j <= str1.length; j++) {
			if (i && j)
				if (str1.charAt(j - 1) === str2.charAt(i - 1))
	  				value = prev;
				else
	  				value = Math.min(current[j], current[j - 1], prev) + 1;
			else
				value = i + j;

			prev = current[j];
			current[j] = value;
		}

	return current.pop();

};

function selectclosest(selector, value) {

	var options = [];
	$(selector + ' option').each(function(a, b) {
		options.push({ text: b.text, value: b.value });
	});

	var validoption = null;
	var validoptiondist = 100000;

	for (var i = 0; i < options.length; i++) {
		var option = options[i];
		var dist = levenshtein(option.text, value);

		if (dist < validoptiondist) {
			validoption = option;
			validoptiondist = dist;
		}

		dist = levenshtein(option.value, value);

		if (dist < validoptiondist) {
			validoption = option;
			validoptiondist = dist;
		}
	}

	if (validoption) $(selector).val(validoption.value);

	return $(selector);

}