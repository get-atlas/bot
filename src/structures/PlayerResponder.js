const Responder = require('./Responder');
const EmojiCollector = require('./EmojiCollector');

const sent = new Map();

// '⏸',
// '▶',
// '🔁',
const commandMap = [{
	emoji: '⏭',
	name: 'skip',
}];
// todo: only show buttons if they can be used (e.g, hide skip if there is no song to skip to or if it's disabled)

module.exports = class PlayerResponder extends Responder {
	constructor(player, lang, {
		settings,
	} = {}) {
		super(player.msg, lang);

		this.settings = settings;
		this.player = player;

		this._buttons = true;
	}

	/**
	 * Controls whether or not player buttons are added.
	 * @param {boolean} bool If true, buttons will be added to the message to control the player.
	 * @returns {PlayerResponder} the current responder
	 */
	buttons(bool) {
		this._buttons = bool;

		return this;
	}

	/**
	 * Whether or not buttons should be added, based on plugin settings & hard coded values
	 * @returns {boolean}
	 * @readonly
	 */
	get shouldAdd() {
		const { options } = this.settings.plugin('music');

		if (this.settings && !this.settings.guild.me.permission.has('addReactions')) {
			return false;
		}

		return (options.player_buttons && this._buttons);
	}

	async clean(channel) {
		const channelID = channel.id || channel;

		if (sent.has(channelID)) {
			const msgID = sent.get(channelID);

			let ret;
			try {
				ret = await this.Atlas.client.deleteMessage(channelID, msgID);
			} catch (e) {
				return false;
			}

			sent.delete(channelID);

			return ret;
		}

		return false;
	}


	/**
 		* Sends the message like a regular responder, then (tries) to add buttons when needed
		* @returns {Promise<Message>}
		*/
	async send() {
		// call the og responder send() and get the response, then we can handle it
		const res = await super.send();

		try {
			if (this.shouldAdd) {
				res.collector = new EmojiCollector();

				await res.collector
					.msg(res)
					.emoji(commandMap.map(c => c.emoji))
					.remove(true)
					.exec(async (msg, emoji, userID) => {
						const command = commandMap.find(c => c.emoji === emoji.name);

						if (command) {
							const args = [];

							return this.Atlas.commands.get(command.name).execute({
								channel: this.player.msg.channel,
								author: this.Atlas.client.users.get(userID) || this.player.msg.author,
								guild: this.settings.guild,
							}, args, {
								settings: this.settings,
								button: true,
							});
						}
					})
					.listen();

				if (sent.has(res.channel.id)) {
					// delete previous player messages to keep the channel clean
					await this.clean(res.channel);
				}

				sent.set(res.channel.id, res.id);
			}
		} catch (e) {
			console.error(e);

			return res;
		}

		this._buttons = true;

		return res;
	}
};
