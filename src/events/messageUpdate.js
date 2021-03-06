module.exports = class {
	constructor(Atlas) {
		this.Atlas = Atlas;
	}

	async execute(msg, oldMsg) {
		// according to sentry this can sometimes be null
		// /shrug
		if (!oldMsg || msg.content === oldMsg.content || msg.type !== 0) {
			return;
		}

		if (!msg.author) {
			try {
				msg = await this.Atlas.client.getMessage(msg.channel.id, msg.id);
			} catch (e) {
				// if we can't have the full message then we'll be picky and throw our food on the floor
				return;
			}
		}

		if (msg.type === 0 && msg.guild && !msg.author.bot) {
			const settings = await this.Atlas.DB.getGuild(msg.guild);

			for (const filter of this.Atlas.filters.values()) {
				const output = await filter.checkMessage(settings, msg);

				if (output === true) {
					break;
				}
			}

			if (!settings.actionLogChannel || (msg.channel.topic && msg.channel.topic.includes('actionlog-ignore'))) {
				return;
			}

			const embed = {
				title: 'general.logs.messageUpdate.title',
				color: this.Atlas.colors.get('blue').decimal,
				description: ['general.logs.messageUpdate.description', msg.author.tag, msg.channel.mention],
				fields: [{
					name: 'general.logs.messageUpdate.oldContent.name',
					value: oldMsg.content.substring(0, 1024) || '-',
				}, {
					name: 'general.logs.messageUpdate.newContent.name',
					value: msg.content.substring(0, 1024) || '-',
				}],
				thumbnail: {
					url: msg.author.avatarURL,
				},
				footer: {
					text: `User ${msg.author.id}`,
				},
				timestamp: new Date(),
			};

			return settings.log('action', embed);
		}
	}
};
