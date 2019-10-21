const ytdl = require('ytdl-core');
const getYoutubeID = require('get-youtube-id');
const fetchVideoInfo = require('youtube-info');

var songQueue = [];
var isPlaying = false;
var vars = null;
var YT_API_KEY = null;

function attach(mainVars, config){
    vars = mainVars;
    YT_API_KEY = config.yt_api_key;
}

function close() {
    songQueue = [];
    isPlaying = false;
}

function interpret(params, member){
    // if (params[0] === 'music') {
        switch (params[0]) {
            case 'play':
            case 'queue':
            case 'q'://TODO check if needed
                play(member, params.slice(1));
                return true;
            case 'playlist':
                playlist(member, params.slice(1));
                return true;
            case 'skip':
            case 'next':
                skip();
                return true;
            case 'pause':
                pause();
                return true;
            case 'resume':
                resume();
                return true;
            case 'volume':
                volume(params.slice(1));
                return true;
            case 'reset':
            case 'clear':
                clearQueue();
                return true;
            case 'repeat':
                repeat(member, params.slice(1));
                return true;
            }
        // }
    return false;
}


function play(member, params) {
	if (!member.voiceChannel) {
		return;
	}
	if (!vars.voiceChannel) {
		vars.voiceChannel = member.voiceChannel;
	}
	if (params.length != 0) {
		playRequest(params);
	}
}

function playlist(member, params) {
	if (!member.voiceChannel) {
		return;
	}
	if (!vars.voiceChannel) {
		vars.voiceChannel = member.voiceChannel;
	}

	if (params.indexOf(prefix) == 0) {
		params = params.slice(1);
	}
	params = params.toLowerCase().split(' ');
	if (params[0] === 'play' && params[1] === 'list') {
		params = params.slice(2).join(' ');
	} else {
		params = params.slice(1).join(' ');
	}

	params = params.trim();
	if (params.length !== 0) playlistRequest(params);
}

function skip() {
	if (songQueue.length > 0) {
		skipSong();
		textChannel.send('Skipping current song!');
	}
}

function pause() {
	if (vars.soundDispatcher) {
		vars.soundDispatcher.pause();
	}
}

function resume() {
	if (vars.soundDispatcher) {
		vars.soundDispatcher.resume();
	}
}

function volume(params) {
	var vol = parseInt(params);
	if (!isNaN(vol)
		&& vol <= 100
		&& vol >= 0) {
		vars.soundDispatcher.setVolume(vol / 100.0);
	}
}

function clearQueue() {
	if (songQueue.length > 0) {
		songQueue = [];
		if (vars.soundDispatcher) {
			vars.soundDispatcher.end();
		}
		textChannel.send('The queue has been cleared.');
	}
}

function repeat(member, params) {
	if (!member.voiceChannel) {
		textChannel.send(' you need to be in a voice channel first.')
		return;
	}

	vars.voiceChannel = member.voiceChannel;
	vars.voiceChannel.join().then((connection) => {
		textChannel.send(params, {
			tts: true
		});
	});
}


function skipSong() {
	if (vars.soundDispatcher) {
		vars.soundDispatcher.end();
	}
}

function playRequest(params) {
	if (songQueue.length > 0 || isPlaying) {
		getID(params, function (id) {
			if (id === null) {
				vars.textChannel.send('Sorry, no search results turned up');
			} else {
				add_to_queue(id);
				fetchVideoInfo(id, function (err, videoInfo) {
					if (err) throw new Error(err);
					vars.textChannel.send('Added to queue **' + videoInfo.title + '**');
				});
			}
		});
	} else {
		getID(params, function (id) {
			if (id === null) {
				vars.textChannel.send('Sorry, no search results turned up');
			} else {
				isPlaying = true;
				songQueue.push('placeholder');
				playMusic(id);

			}
		});
	}
}

function playlistRequest(params) {
	if (songQueue.length > 0 || isPlaying) {
		search_playlist(params, function (body) {
			if (!body) {
				vars.textChannel.send('Sorry, no search results turned up');
			} else {
				vars.textChannel.send('Playlist for '**' + params + '**' added to queue');
				json = JSON.parse(body);
				isPlaying = true;
				items = shuffle(json.items);
				items.forEach((item) => {
					add_to_queue(item.id.videoId);
				});
			}
		});
	} else {
		search_playlist(params, function (body) {
			if (!body) {
				vars.textChannel.send('Sorry, no search results turned up');
			} else {
				json = JSON.parse(body);
				isPlaying = true;
				items = shuffle(json.items);
				songQueue.push('placeholder');
				items.slice(1).forEach((item) => {
					add_to_queue(item.id.videoId);
				});
				playMusic(items[0].id.videoId);
			}
		});
	}
}

function playMusic(id) {
	//voiceChannel = message.member.voiceChannel;
	vars.voiceChannel.join().then((connection) => {
		console.log('playing');
		stream = ytdl('https://www.youtube.com/watch?v=' + id, {
			filter: 'audioonly'
		});
		vars.skipReq = 0;
		vars.skippers = [];
		vars.soundDispatcher = connection.playStream(stream);
		fetchVideoInfo(id, (err, videoInfo) => {
			if (err) throw new Error(err);
			vars.textChannel.send('Now playing **' + videoInfo.title + '**');
		});
		vars.soundDispatcher.on('end', () => {
			vars.soundDispatcher = null;
			songQueue.shift();
			console.log('queue size: ' + songQueue.length);
			if (songQueue.length === 0) {
				songQueue = [];
				isPlaying = false;
			} else {
				setTimeout(() => {
					playMusic(songQueue[0]);
				}, 2000);
			}
		})
	});
}

function shuffle(array) {
	var currentIndex = array.length, temporaryValue, randomIndex;

	// While there remain elements to shuffle...
	while (0 !== currentIndex) {

		// Pick a remaining element...
		randomIndex = Math.floor(Math.random() * currentIndex);
		currentIndex -= 1;

		// And swap it with the current element.
		temporaryValue = array[currentIndex];
		array[currentIndex] = array[randomIndex];
		array[randomIndex] = temporaryValue;
	}

	return array;
}

function isYoutube(str) {
	return str.toLowerCase().indexOf('youtube.com') > -1;
}

function getID(str, cb) {
	if (isYoutube(str)) {
		cb(getYoutubeID(str));
	} else {
		search_video(str, function (id) {
			cb(id);
		});
	}
}

function add_to_queue(strID) {
	if (isYoutube(strID)) {
		songQueue.push(getYoutubeID(strID));
	} else {
		songQueue.push(strID);
	}
}

function search_video(query, callback) {
	request('https://www.googleapis.com/youtube/v3/search?part=id&type=video&q=' + encodeURIComponent(query) + '&key=' + YT_API_KEY, function (error, response, body) {
		var json = JSON.parse(body);

		if (json.items[0] === null) {
			callback(null);
		} else {
			callback(json.items[0].id.videoId);
		}
	});
}

function search_playlist(query, callback) {
	var maxResults = 40
	request('https://www.googleapis.com/youtube/v3/search?part=id&type=video&q=' + encodeURIComponent(query) + '&key=' + YT_API_KEY + '&maxResults=' + 40, function (error, response, body) {
		var json = JSON.parse(body);

		if (json.items[0] === null) {
			callback(null);
		} else {
			callback(body);
		}
	});
}

module.exports = {
    interpret,
    attach,
    close
}