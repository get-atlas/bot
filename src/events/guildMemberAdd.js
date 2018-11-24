const Parser = require('../tagengine');
const Responder = require('../structures/Responder');

module.exports = class Event {
	constructor(Atlas) {
		this.Atlas = Atlas;
	}

	async execute(guild, member) {
		const settings = await this.Atlas.DB.getGuild(guild.id);

		const gatekeeper = settings.plugin('gatekeeper');

		if (gatekeeper.state === 'enabled') {
			const responder = new Responder(null, settings.lang);

			const parser = new Parser({
				settings,
				user: member,
				guild,
			}, true);

			if (gatekeeper.channel.enabled) {
				const channel = guild.channels.get(gatekeeper.channel.channel);

				if (channel) {
					parser.data.channel = channel;

					const { output } = await parser.parse(gatekeeper.channel.content);

					await responder.channel(channel).localised(true).text(output).send();
				}
			}

			if (gatekeeper.dm.enabled) {
				try {
					const dmChannel = await member.user.getDMChannel();

					parser.data.channel = dmChannel;

					const { output } = await parser.parse(gatekeeper.dm.content);

					await responder.channel(dmChannel).localised(true).text(output).send();
				} catch (e) {
					console.warn(e);
				}
			}
		}

		if (!settings.actionLogChannel) {
			return;
		}

		const embed = {
			title: 'general.logs.guildMemberAdd.title',
			color: this.Atlas.colors.get('cyan').decimal,
			description: ['general.logs.guildMemberAdd.description', member.tag],
			fields: [{
				name: 'Account Created',
				value: (new Date(member.createdAt)).toLocaleDateString(),
			}],
			thumbnail: {
				url: member.avatarURL,
			},
			footer: {
				text: `User ${member.id}`,
			},
			timestamp: new Date(),
		};

		return settings.log('action', embed);
	}
};
