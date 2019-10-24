const { wordsToNumbers } = require('words-to-numbers');

this.vars = null;

function attach(mainVars, config) {
	vars = mainVars;
	IMGUR_API_KEY = config.imgur_api_key;
}

function close() {
}

function interpret(params, member) {
	switch (params[0]) {
		case 'roll':
		case 'role':
			interpretRoll(params.slice(1), member)
			return true;
		default:
			return false;
	}
}

/**
 * 
 * @param {Array<string|number|[number, string]>} params 
 * @param {GuildMember} member 
 */
function interpretRoll(params, member) {
	console.log('roll: ' + params);

	//Convert text to numbers and symbols
	params.forEach((param, index) => {
		switch (param) {
			case 'percent':
			case 'percentile':
				params.splice(index, 2, 'D', '100');
			case 'D':
			case 'd': {
				params[index] = 'D';
				break;
			}
			case '+':
			case 'add':
			case 'plus': {
				params[index] = '+';
				break;
			}
			case '-':
			case 'negative':
			case 'minus': {
				params[index] = '-';
				break;
			}
			default: {
				let out = parseInt(wordsToNumbers(param));
				if (out !== NaN) {
					params[index] = out;
				} else {
					vars.textChannel.send('Invalid Roll Parameters: ' + params + '\nUnrecognized: ' + param);
					return;
				}
			}
		}
	});

	// Roll Dice
	for (let index = 0; index < params.length; index++) {
		console.log('params: ' + params);
		if (params[index] !== 'D') {
			continue;
		}
		if (index > params.length - 2 || typeof params[index + 1] !== 'number') {//if 'D' is the last element or if the next value is not a number
			vars.textChannel.send('Invalid Roll Parameters: ' + params);
			return;
		}
		if (index === 0 || typeof params[index - 1] !== 'number') {//if 'D' is the first element or the previous value is not a number
			params[index] = roll(params[index + 1]);
			params.splice(index + 1, 1);
		} else {//there is a roll amount
			// if (index > 1 && params[index - 2] === '-') {//there is a negative in front
			// 	let rollAmount = -params[index - 1];
			// 	params.splice(index - 2, 2);
			// 	index -= 2;
			// 	params[index] = roll(params[index + 1], rollAmount);
			// 	params.splice(index + 1);
			// } else {
				let rollAmount = params[index - 1];
				params.splice(index - 1, 1);
				index--;
				params[index] = roll(params[index + 1], rollAmount);
				params.splice(index + 1, 1);
			// }
		}
	}

	console.log('params post roll: ' + params);

	// Combine +,- symbols, removing them
	for (let index = params.length - 1; index > -1; index--) {//run backwards so that double symbols can be read
		console.log('Checking param: ' + params[index]);
		if ((params[index] !== '+') && (params[index] !== '-')){//ignore non-symbols
			continue;
		}
		if (index + 1 === params.length) {//if there's no next parameter
			vars.textChannel.send('Invalid Roll Parameters: ' + params);
			return;
		}
		if (params[index] === '+') {
			params.splice(index, 1);
		} else {
			if (typeof params[index + 1] === 'object') {
				params[index + 1][0] = -params[index + 1][0];//invert value
				params[index + 1][1] = '-' + params[index + 1][1];//add negative to text
			} else {
				params[index + 1] *= -1;
			}
			params.splice(index, 1);
		}
	}

	console.log('params sans symbols: ' + params);

	var value = params.reduce((total, current, index) => {
		if (typeof current === 'number') {
			return total + current;
		}
		if (typeof current === 'object') {
			return total + current[0];
		}
		throw 'parameter ' + current + ' not numbers or arrays';
	}, 0);

	var text = params.reduce((total, current, index) => {
		if (typeof current === 'number') {
			if (total) {
				return total.concat(' + ' + current);
			} else {
				return current;
			}
		}
		if (typeof current === 'object') {
			if (total){
				return total.concat(' + ' + current[1]);
			} else {
				return current[1];
			}
		}
		throw 'parameters not numbers or arrays';
	}, '');

	vars.textChannel.send('<@' + member.id + '> rolled **' + value + '**. [' + text + ']');
}

/**
 * 
 * @param {number} diceSize 
 * @param {number} [rollAmount] must be positive
 * @returns {[number, string]} value and text
 */
function roll(diceSize, rollAmount) {
	console.log("rolling dice: ", diceSize, rollAmount)
	if (rollAmount === undefined) {
		rollAmount = 1;
	}
	let sum = 0;
	let text;
	for (let i = 0; i < rollAmount; i++) {
		const rolled = Math.ceil(Math.random() * diceSize);
		sum += rolled;
		if (!text) {
			text = '**' + rolled + '**';
		} else {
			text += ' + **' + rolled + '**';
		}
	}
	if (rollAmount > 1) {
		text = '(' + text + ' = ' + sum + ')';
	} else {
		text = '(' + text + ')';
	}
	
	console.log("rolled dice: ", sum, text)
	return [sum, text];
}

function getRandomItem(arr) {
	var index = Math.round(Math.random() * (arr.length - 1));
	return arr[index];
}

module.exports = {
	interpret,
	attach,
	close
}