const request = require('request');

var vars = null;
var IMGUR_API_KEY = null;

function attach(mainVars, config){
    vars = mainVars;
    IMGUR_API_KEY = config.imgur_api_key;
}

function close() {
}

function interpret(params, member){
    switch (params[0]) {
        case 'image':
        case 'picture':
        case 'react':
            image(params.slice(1))
            return true;
        default:
            return false;
    }
}

function image(params) {
	var ext = '';
	if (params.includes('gif') || params.includes('jif')) {//TODO: jif?
		ext = '+ext:gif';
	}
	console.log('searching for image!');
	const options = {
		url: 'https://api.imgur.com/3/gallery/search/top/week/0/?q=' + params + ext,
		headers: {
			'Authorization': 'Client-ID ' + IMGUR_API_KEY
		}
	};
	request.get(options, (error, response, body) => {

		let json = JSON.parse(body);
		if (!body || json.data.length < 1) {
			vars.textChannel.send('No results were found!');
			return;
		}
		let item = getRandomItem(json.data);
		var link;
		if (item.is_album) {
			link = getRandomItem(item.images).link;
		} else {
			link = item.link;
		}
		var embed = new Discord.RichEmbed()
			.setImage(link);
		vars.textChannel.send({ embed });
	});
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