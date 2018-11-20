const tags = require('./loader')();
const interpreter = require('./interpreter');
const Parser = require('./Parser');
const Lexer = require('./lexer');

const CommandTag = require('./CommandTag');

module.exports = class {
	/**
     *
     * @param {Object} data Data for the tags to pull information from
     * @param {Object} data.ticket The ticket to get info from
     * @param {Guild} data.guild The guild to get info from
     * @param {Channel} data.channel The channel to get info from
     * @param {Object} data.action The action that is being processed
     * @param {Object} data.user The user in context or something idk
     */
	constructor({
		msg,
		guild = msg.guild,
		// todo: try and get channel ourselves if it's not present
		ticket,
		channel = msg.channel,
		settings,
		action,
		user = msg.author,
	}) {
		this.data = {
			msg,
			ticket,
			guild,
			channel,
			settings,
			action,
			user,
		};

		this.tags = tags;
		this.Atlas = require('./../../Atlas');

		// janky "temporary" way for tag aliases that will probably never be replaced :^)
		this.tags.get = (key) => {
			// in dev environments prefix is different, but i want compat so 'a!',
			//  also pre-v8 used 'a!' no matter what so more compat
			const prefix = ['a!', process.env.DEFAULT_PREFIX, settings.prefix].find(p => key.startsWith(p));

			if (prefix) {
				const label = key.substring(prefix.length);
				const command = this.Atlas.commands.get(label);

				if (command) {
					return new CommandTag(command, settings);
				}
			}

			const val = Map.prototype.get.call(this.tags, key);

			return val;
		};
	}

	async parse(source) {
		const ast = Lexer.lex(source);
		const parsed = await Parser.parse(ast);

		return interpreter(parsed, this.data, this.tags);
	}
};
