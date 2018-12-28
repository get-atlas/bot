const parseArgs = require('yargs-parser');
const mongoose = require('mongoose');

const Cache = require('../../lib/structures/Cache');

const ratelimits = new Cache('ratelimits');

const prefixes = process.env.PREFIXES.split(',');

module.exports = class Ready {
	constructor(Atlas) {
		this.Atlas = Atlas;
	}

	async execute(msg) {
		if (msg.type !== 0 || msg.author.bot) {
			return;
		}

		let settings;
		if (msg.guild) {
			settings = await this.Atlas.DB.getSettings(msg.guild.id);

			msg.lang = settings.lang;
			msg.displayPrefix = settings.prefix || process.env.DEFAULT_PREFIX;
		} else {
			([msg.displayPrefix] = prefixes);
			// temporary
			msg.lang = process.env.DEFAULT_LANG;
		}


		msg.prefix = this.checkPrefix(msg.content, settings);

		if (msg.prefix) {
			msg.args = msg.content.replace(/<@!/g, '<@').substring(msg.prefix.length).trim()
				.split(/ +/g);
			msg.label = msg.args.shift().toLowerCase();
		}

		// am using eval to alter levels during testing when no commands for levels existed
		if (!msg.label) {
			// don't level up the user on commands, it looks weird.
			this.updateProfile(msg, settings).catch(console.warn);
		} else {
			this.Atlas.util.updateUser(msg.author);
		}

		// try and find an action, if one exists it'll run it then do nothing.
		if (msg.guild && settings) {
			const actions = await settings.findActions(msg);

			if (actions.length) {
				for (const action of actions) {
					try {
						await action.execute(msg);
						if (actions.length !== 1) {
							// sleep for 1s to prevent abuse
							await this.Atlas.lib.utils.sleep(1000);
						}
					} catch (e) {
						console.error(e);
					}
				}

				// if an "custom command" was called, don't do anything.
				if (actions.find(a => a.trigger.type === 'label' && a.trigger.content === msg.label)) {
					return;
				}
			}
		}

		if (msg.prefix) { // eslint-disable-line no-extra-parens
			msg.command = this.Atlas.commands.get(msg.label);

			if (msg.command) {
				if (settings) {
					// guild-only checks

					const responder = new this.Atlas.structs.Responder(msg, msg.lang, 'general.plugin');
					// handle guild things
					const pluginConf = settings.plugin(msg.command.info.plugin.name.toLowerCase());

					if (pluginConf) {
						if (pluginConf.state === 'disabled' && !(msg.command.info.name === 'help' && !Object.values(settings.raw.plugins).some(p => p.state === 'enabled' && msg.member.permission.has('manageGuild')))) {
							return responder.error('disabled', msg.command.info.plugin.name, msg.command.info.name).send();
						}

						const errorKey = this.Atlas.lib.utils.checkRestriction({
							roles: msg.member.roles || [],
							channel: msg.channel.id,
						}, pluginConf.restrictions);

						if (errorKey) {
							return responder.error(`restrictions.${errorKey}`).send();
						}
					}
				}

				if (msg.command.info.subcommands.size !== 0 && msg.args[0]) {
					// handle subcommands
					const subLabel = msg.args[0].toLowerCase();
					const sub = msg.command.info.subcommands.get(subLabel)
						|| msg.command.info.subcommands.get(msg.command.info.subcommandAliases.get(subLabel));

					if (sub) {
						msg.args.shift();
						msg.command = sub;
					}
				}

				const uncleanOptions = parseArgs(msg.content);
				const parsedArgs = {};
				for (const arg of Object.keys(uncleanOptions)) {
					const cleanedArg = arg.toLowerCase().trim();

					if (msg.command.info.allowAllFlags || ((msg.command.info.supportedFlags || []).map(a => a.name).includes(cleanedArg))) {
						parsedArgs[cleanedArg] = uncleanOptions[cleanedArg];
					}
				}

				if (msg.author.id === process.env.OWNER && this.Atlas.env === 'development') {
					msg.addReaction('🔁').catch(() => false);
				}

				return msg.command.execute(msg, msg.args, {
					settings,
					parsedArgs,
				});
			}

			this.Atlas.client.emit('message', msg);
		}

		if (msg.guild && settings) {
			for (const [, filter] of this.Atlas.filters) {
				const output = await filter.checkMessage(settings, msg);

				if (output === true) {
					break;
				}
			}
		}
	}

	checkPrefix(msg, settings = {}) {
		const possiblePrefixes = settings.prefix
			? [settings.prefix, ...prefixes]
			: prefixes;

		for (let prefix of possiblePrefixes) {
			prefix = prefix.replace(/@mention/g, this.Atlas.client.user.mention);
			if (msg.startsWith(prefix)) {
				return prefix;
			}
		}
	}

	async updateProfile(msg, settings) {
		if (!(await ratelimits.get(msg.author.id))) {
			await ratelimits.set(msg.author.id, Date.now(), 60);

			const levelConf = settings.plugin('levels');

			const restrictionError = this.Atlas.lib.utils.checkRestriction({
				roles: msg.member.roles || [],
				channel: msg.channel.id,
			}, levelConf.restrictions);

			// if levels are enabled and the channel/user is not blacklisted, then... wew
			if (levelConf.state === 'enabled' && !restrictionError) {
				// the amount of xp to reward them with
				const xp = this.Atlas.lib.xputil.calcXP(msg.content);

				const payload = {
					username: msg.author.username,
					discriminator: msg.author.discriminator,
					avatar: msg.author.avatar,
				};

				const profile = await this.Atlas.DB.getProfile(msg.author, msg.guild.id);

				const guild = profile.guilds.find(({ id }) => id === msg.guild.id);

				if (guild) {
					// update existing guild profile
					await mongoose
						.model('User')
						.updateOne({ id: profile.id, 'guilds._id': guild._id }, {
							$set: payload,
							$inc: {
								'guilds.$.xp': xp,
								'guilds.$.messages': 1,
							},
						});
				} else {
					await mongoose
						.model('User')
						.updateOne({ id: profile.id }, {
							$set: payload,
							$push: {
								guilds: {
									xp,
									id: msg.guild.id,
									messages: 1,
								},
							},
						});
				}

				// update the cached version aswell because why not
				await this.Atlas.DB.cache.del(profile.id);

				// first guild will always be the target guild due to the mongo magic above
				const currentXP = guild ? guild.xp + xp : xp;

				// will announce level ups and reward roles when needed
				this.Atlas.util.levelup(msg.member, {
					previous: this.Atlas.lib.xputil.getUserXPProfile(guild ? guild.xp : 0),
					current: this.Atlas.lib.xputil.getUserXPProfile(currentXP),
				}, msg, settings);

				return profile;
			}

			// since levels are disabled or they don't need XP, forward to the regular
			// func that makes sure our "local" info (avatars, usernames) are acurate
			await this.Atlas.util.updateUser(msg.author);
		}
	}
};
