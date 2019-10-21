const Discord = require('discord.js');
const ffmpeg = require('fluent-ffmpeg');
const WitSpeech = require('node-witai-speech');
const decode = require('./tools/decodeOpus');
const fs = require('fs-extra');
const Path = require('path');
const interpreters = require('./interpreters');
const ytdl = require('ytdl-core');

var config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));

/** @type {string} */
const WIT_API_KEY = config.wit_api_key;
/** @type {string} */
const prefixText = config.prefixText;
/** @type {Array<Array<string>>} */
const prefixVoiceList = config.prefixVoiceList;
/** @type {string} */
const discord_token = config.discord_token;
/** @type {string} */
const content_type = config.content_type;
// const bot_controller = config.bot_controller;

var vars = {
	soundDispatcher: null,
	/** @type {VoiceChannel} */
	voiceChannel: null,
	textChannel: null,
	// /** @type {VoiceConnection} */
	// listenConnection: null,
	/** @type {VoiceReceiver} */
	listenReceiver: null,
	/** @type {Map<string, Stream>} */
	listenStreams: new Map(),
	skipReq: 0,
	skippers: []
}

const client = new Discord.Client();
const recordingsPath = './recordings';
try {
	fs.mkdirSync(recordingsPath);
} catch (error){
	if (error.code !== 'EEXIST'){
		throw error
	}
} finally {
	fs.emptyDirSync(recordingsPath);
}

interpreters.forEach((interpreter)=>{
	interpreter.attach(vars, config);
});

/**
 * User (not often used)
 * @typedef {Object} User
 * @property {string} id
 */

/**
 * GuildMember (User in a server. Most often used)
 * @typedef {Object} GuildMember
 * @property {string} id
 * @property {string} displayName
 * @property {VoiceChannel} voiceChannel
 * @property {string} voiceChannelId
 * @property {function} kick
 * @property {function} setVoiceChannel
 */

/**
 * Message
 * @typedef {Object} Message
 * @property {string} content
 * @property {GuildMember} member
 * @property {string} channel
 * @property {function} reply
 */

/**
 * VoiceChannel
 * @typedef {Object} VoiceChannel
 * @property {string} name
 * @property {()=>VoiceConnection} join
 * @property {()=>void} leave
 */

/**
 * @typedef {Object} VoiceConnection
 * @property {function(function(VoiceConnection)=>VoiceConnection)} then
 * @property {()=>VoiceReceiver} createReceiver
 */

/**
 * @typedef {Object} VoiceReceiver
 * @property {VoiceConnection} voiceConnection
 * @property {function(string, function(User, Buffer))} on
 * @event opus
 */

/**
 * @typedef {Object} Stream
 * @property {function(chunk, encoding)} write
 */

client.login(discord_token).catch((error) => {
	console.error('Could Not Login to Discord');
	console.error(error);
})

client.on('ready', handleReady.bind(this));

client.on('message', handleText.bind(this));

client.on('guildMemberSpeaking', handleAudio.bind(this));

client.on('disconnect', disconnect.bind(this));

function handleReady() {
	console.log('Loaded Successfully');
}

/**
 * @param {Array<string>} params
 * @param {GuildMember} member
 * @param {Message} [message]
 */
function interpret(params, member, message) {
	console.log ('interpreting:\t' + params)
	switch (params[0]) {
		case 'listen':
		case 'join':
			commandListen(params.slice(1), member, message);
			break;
		case 'leave':
		case 'stop':
			disconnect();
			break;
		default:
			if (!interpreters.some((interpreter) => interpreter.interpret(params, member)) && message){
				message.reply(" command not recognized! Type '!help' for a list of commands.");
			}
	}
}

/**
 * Processes and Interprets Text
 * @param {Message} message 
 */
function handleText(message){
	if (message.content.substring(0, prefixText.length) === prefixText) {
		vars.textChannel = message.channel;
		const params = message.content.toLowerCase().slice(prefixText.length).trim().split(' ');//TODO remove redundant trim?
		console.log('Message:\t' + message);
		interpret(params, message.member, message);
	}
}

/**
 * Processes and Interprets Speech
 * @param {GuildMember} member 
 * @param {string} speech 
 */
function handleTTS(speech, member) {
	if (speech.length===0) {
		// console.log('\tHeard no words');
		return;
	}
	console.log('\tHeard:\t' + speech);
	vars.textChannel.send('Heard: ' + speech);
	var command = speech.toLowerCase().split(' ');
	let commandLength = 0;
	if (prefixVoiceList.some(
		(prefix)=>prefix.every((word, index) => {
			if (command[index] === word ){
				commandLength = prefix.length;
				return true;
			} else {
				return false;
			}
		})
	)) {
		let params = command.slice(commandLength);
		if (params[0] == 'play' && params[1] == 'list') {
			params.slice(1)[0] = 'playlist';
		}
		console.log('Heard Prefix Keyword');
		interpret(params, member);
	}
}

/**
 * 
 * @param {GuildMember} member
 * @param {boolean} speaking
 */
function handleAudio(member, speaking) {
	// console.log(speaking + ' hearing Sounds from ' + member);
	// console.log('Connected to ' + discord.voiceConnections.array().length);
	if (speaking || !member.voiceChannel) {// Interpret after they finish speaking
		return;
	}
	let stream = vars.listenStreams.get(member.id);
	if (!stream) {
		return;
	}
	vars.listenStreams.delete(member.id);
	stream.end((err) => {
		if (err) {
			console.error(err);
		}

		let basename = Path.basename(stream.path, '.opus_string');
		let text = 'default';

		// decode file into pcm
		decode.convertOpusStringToRawPCM(stream.path,
			basename,
			(function () {
				processRawToWav(
					Path.join(recordingsPath, basename + '.raw_pcm'),
					Path.join(recordingsPath, basename + '.wav'),
					(function (data) {
						if (data != null) {
							handleTTS(data._text, member);
						}
					}).bind(this))
			}).bind(this));
	});
}

/**
 * 
 * @param {Array<string>} params 
 * @param {Member} member 
 * @param {Message} [message] 
 */
function commandListen(params, member, message) {
	console.log('Listening to ' )
	if (!member) {//TODO: remove? How can there not be a member?
		return;
	}
	// choose the n'th voice channel
	const channelNumber = parseInt(params[params.length-1]);// The final word interpreted as an integer
	if ((params[0] === 'to' || params [0] === 'channel') && channelNumber !== NaN){
		vars.voiceChannel = client.channels.filter((channel)=>{
			return channel.type === 'voice';
		}).array[channelNumber-1];//converting human index to computer index
	} else {
		if (!member.voiceChannel && message) {
			message.reply(' you need to be in a voice channel first.');
			return;
		}
		if (vars.voiceChannel === member.voiceChannel && message) {
			message.reply(" I'm already here!");
			return;
		}
	
		vars.voiceChannel = member.voiceChannel;
	}
	vars.textChannel.send('Awaiting Command in **' + member.voiceChannel.name + '**!');

	vars.voiceChannel.join().then((connection) => {
		//listenConnection.set(member.voiceChannelId, connection);
		// vars.listenConnection = connection;
		const stream = ytdl('https://www.youtube.com/watch?v=O51uFhJGf5s', { filter : 'audioonly' });
		// new Promise(()=>{
		connection.playStream(stream, {volume: 1});
		// }).then(()=>{
		// 	connection.end();
		// });

		let receiver = connection.createReceiver();
		receiver.on('opus', (user, buffer) => {
			let hexString = buffer.toString('hex');
			let stream = vars.listenStreams.get(user.id);
			if (!stream) {
				if (hexString === 'f8fffe') {
					return;
				}
				let outputPath = Path.join(recordingsPath, `${user.id}-${Date.now()}.opus_string`);
				stream = fs.createWriteStream(outputPath);
				vars.listenStreams.set(user.id, stream);
			}
			stream.write(`,${hexString}`);
		});
		//listenReceiver.set(member.voiceChannelId, receiver);
		vars.listenReceiver = receiver;
	}).catch(console.error);

	
	console.log('CommandListen: Connected to ' + client.voiceConnections.array().length);
}

/**
 * Leaves the Voice Channel and closes all functionality.
 */
function disconnect() {
	console.log('Disconnecting');
	if (vars.soundDispatcher) {
		vars.soundDispatcher.end();
	}
	vars.soundDispatcher = null;
	interpreters.forEach((interpreter)=>{
		interpreter.close();
	});
	// if (vars.listenReceiver.voiceConnection) {
	// 	vars.listenReceiver.voiceConnection.disconnect();
	// }
	if (vars.listenReceiver) {
		vars.listenReceiver.destroy();
		vars.listenReceiver = null;
	}
	if (vars.voiceChannel) {
		vars.voiceChannel.leave();
		vars.voiceChannel = null;
	}
}


/**
 * 
 * @param {string} filepath 
 * @param {string} outputpath 
 * @param {(data)=>null} cb 
 */
function processRawToWav(filepath, outputpath, cb) {
	fs.closeSync(fs.openSync(outputpath, 'w'));
	var command = ffmpeg(filepath)
		.addInputOptions([
			'-f s32le',
			'-ar 48k',
			'-ac 1'
		])
		.on('end', function () {
			// Stream the file to be sent to the wit.ai
			var stream = fs.createReadStream(outputpath);

			// Its best to return a promise
			var parseSpeech = new Promise((resolve, reject) => {
				// call the wit.ai api with the created stream
				WitSpeech.extractSpeechIntent(
					WIT_API_KEY,
					stream,
					content_type,
					(err, res) => {
						if (err) return reject(err);
						resolve(res);
					}
				);
			});

			// check in the promise for the completion of call to witai
			parseSpeech.then((data) => {
				// console.log('you said: ' + data._text);
				cb(data);
				//return data;
			})
				.catch((err) => {
					console.log(err);
					cb(null);
					//return null;
				})
		})
		.on('error', function (err) {
			console.log('an error happened: ' + err.message);
		})
		.addOutput(outputpath)
		.run();
}