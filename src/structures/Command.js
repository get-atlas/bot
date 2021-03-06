const parseArgs = require('yargs-parser');
const path = require('path');

const cleanArgs = require('atlas-lib/lib/utils/cleanArgs');
const Responder = require('./Responder');

class Command {
	constructor(Atlas, info) {
		this.Atlas = Atlas;
		this.raw = info;
		this.info = {
			...{
				usage: null,
				aliases: [],
				cooldown: {
					min: 2000,
					default: 2000,
				},
				guildOnly: false,
				hidden: false,
				permissions: {
					bot: {},
					user: {},
				},
				examples: [],
				noExamples: info.usage && !info.examples,
				supportedArgs: [],
				supportedFlags: [],
			},
			...info };

		this.subcommands = new Map();
		this.subcommandAliases = new Map();

		// loader will populate these
		// would be done using another arg but i'm not updating ~120 commands to forward it lmao
		this.plugin = null;
		this.location = null;
		this.isSub = null;

		this.execute = this.execute.bind(this);
		this.action = this.action.bind(this);
	}

	get displayName() {
		const { master, info: { name } } = this;

		return `${master ? `${master.info.name} ${name}` : name}`;
	}

	get master() {
		if (!this.isSub) {
			return;
		}

		const master = path.basename(path.dirname(this.location));

		return this.Atlas.commands.get(master);
	}

	async execute(msg, args, {
		settings,
		tag: isTag,
		...passthrough
	}) {
		const responder = new Responder(msg, msg.lang, 'general');

		// parse --args="arg"

		const parsedArgs = {};
		const parsed = parseArgs(msg.content, {
			configuration: {
				'parse-numbers': false,
			},
		});

		for (const key of Object.keys(parsed)) {
			if (this.info.allowAllFlags || this.info.supportedFlags.some(a => a.name === parsed)) {
				parsedArgs[key] = parsed[key];
			}
		}

		let options;
		if (settings) {
			// user is in a guild, run guild-only checks

			const botPerms = msg.channel.permissionsOf(msg.guild.me.id);

			if (!botPerms.has('sendMessages')) {
				// no point trying to run if we're gonna get blocked by discord anyway
				return;
			}

			// permission checking for bot/user
			for (const permsKey of Object.keys(this.info.permissions || {})) {
				let permissions = Object.keys(this.info.permissions[permsKey]);

				if (!permissions) {
					continue;
				}

				if (this.info.name === 'advancedembed' && isTag && permsKey === 'user') {
					permissions = [];
				}

				for (const perm of permissions) {
					const perms = permsKey === 'bot' ? botPerms : msg.channel.permissionsOf(msg.member.id);

					if (perms.has(perm) === false) {
						const missing = responder.format(`permissions.list.${perm}`);

						return responder.error(`permissions.permError.${permsKey}`, missing).send();
					}
				}
			}

			options = settings.command(this.master ? this.master.info.name : this.info.name);

			if (options.disabled) {
			// command is disabled
				return responder.error('command.disabled', settings.prefix, this.info.name).send();
			}

			const errorKey = this.Atlas.lib.utils.checkRestriction({
				roles: msg.member.roles,
				channel: msg.channel.id,
				permissions: msg.channel.permissionsOf(msg.member.id),
			}, options.restrictions);

			if (errorKey) {
				return responder.error(`command.restrictions.${errorKey}`).send();
			}
		} else {
			// DM-only options
			if ((this.info.guildOnly === true || this.info.premiumOnly)) { // eslint-disable-line no-lonely-if
				return responder.error('command.guildOnly').send();
			}
		}

		if (this.info.premiumOnly) {
			const patron = await this.Atlas.lib.utils.isPatron(msg.guild.ownerID);

			if (!patron || patron.amount_cents < 500) {
				return responder.error('command.premiumOnly').send();
			}
		}

		if (this.info.patronOnly) {
			const patron = !!await this.Atlas.lib.utils.isPatron(msg.author.id);

			if (!patron) {
				return responder.error('command.patronOnly', msg.prefix).send();
			}
		}

		try {
			if (settings) {
				if (options.delete && msg.delete && msg.channel.permissionsOf(msg.guild.me.id).has('manageMessages')) {
					msg.delete().catch(() => false);
				}

				msg.options = options;
			}
			// run the command
			const out = await this.action(msg, args, {
				settings,
				parsedArgs,
				...passthrough,
				get cleanArgs() {
					return cleanArgs(msg, args);
				},
			});

			const duration = new Date() - new Date(msg.createdAt);

			if (process.env.VERBOSE === 'true') {
				console.log(`${this.info.name} - ${msg.author.username} ${msg.author.id} ${duration}ms`);
			}

			return out;
		} catch (e) {
			if (e.status && e.response) {
				// it's /probably/ a http error
				await responder.error('command.restError').send();
			} else {
				await responder.error('command.errorExecuting').send();
			}

			throw e;
		}
	}

	/**
	 * Converts the command info to a language
	 * @param {string} lang The locale to format with, defaults to "DEFAULT_LANG"
	 * @returns {Object} the converted command info
	 */
	getInfo(lang = process.env.DEFAULT_LANG) {
		const responder = new Responder(null, lang);

		let key;
		if (this.master) {
			key = `info.${this.master.info.name}.${this.info.name}`;
		} else if (this.subcommands.size !== 0) {
			key = `info.${this.info.name}.base`;
		} else {
			key = `info.${this.info.name}`;
		}

		return responder.format({
			stringOnly: false,
			lang,
			key,
		});
	}

	/**
	 * Generates a help embed for the command
	 * @param {Message} msg the message to pull data from
	 * @returns {Object} The embed
	 */
	helpEmbed(msg) {
		const info = {
			...this.info,
			...this.getInfo(msg.lang),
		};

		const getDN = ({ master, info: { name } }) => (master ? `${master.info.name} ${name}` : name);
		const displayName = getDN(this);

		const embed = {
			title: msg.displayPrefix + displayName,
			description: info.description,
			fields: [],
			timestamp: new Date(),
			footer: {},
		};

		if (info.examples.length) {
			const examples = info.examples.map(e => `• ${msg.displayPrefix + displayName} ${e}`);

			if (examples.length > 4) {
				const colOne = examples;
				const colTwo = info.examples.splice(0, Math.floor(colOne.length / 2));

				embed.fields.push({
					name: 'general.help.examples',
					value: colOne.join('\n'),
					inline: true,
				}, {
					// This has a zero-width character in it
					name: '​',
					value: colTwo.join('\n'),
					inline: true,
				});
			} else {
				embed.fields.push({
					name: 'general.help.examples',
					value: examples.join('\n'),
				});
			}
		}

		if (info.aliases.length) {
			const aliases = info.aliases.map(a => `• ${getDN({ info: { ...this.info, name: a } })}`);

			embed.fields.push({
				name: 'general.help.aliases',
				value: aliases.join('\n'),
				inline: true,
			});
		}

		if (this.subcommands.size !== 0) {
			embed.fields.push({
				name: 'general.help.subcommands',
				value: Array.from(this.subcommands.values()).map(({ info: { name } }) => `• ${name}`).join('\n'),
				inline: true,
			});

			embed.footer.text = ['general.help.footer', msg.displayPrefix, this.info.name];
		}

		embed.fields.push({
			name: 'general.help.usage',
			value: `${msg.displayPrefix + displayName} ${info.usage || ''}`,
			inline: true,
		});

		const userPerms = Object.keys(info.permissions.user || {});
		const botPerms = Object.keys(info.permissions.bot || {});

		if (userPerms.length) {
			embed.fields.push({
				name: 'general.help.userPerms',
				value: `\`${userPerms.map(p => this.Atlas.util.format(msg.lang, `general.permissions.list.${p}`)).join('`, `')}\``,
				inline: true,
			});
		}

		if (botPerms.length) {
			embed.fields.push({
				name: 'general.help.botPerms',
				value: `\`${botPerms.map(p => this.Atlas.util.format(msg.lang, `general.permissions.list.${p}`)).join('`, `')}\``,
				inline: true,
			});
		}

		if (info.supportedFlags.length) {
			let supported = info.supportedFlags;

			if (msg.author.id !== process.env.OWNER) {
				supported = info.supportedFlags.filter(arg => !arg.dev);
			}

			const flags = supported.map((m) => {
				let str = `**•** \`--${m.name}`;

				if (m.placeholder) {
					str += `="${m.placeholder}"\``;
				} else {
					str += '`';
				}

				if (m.desc) {
					str += ` - ${m.desc}`;
				}

				return str;
			});

			flags.sort((a, b) => b.length - a.length);

			embed.fields.push({
				name: 'general.help.supportedFlags',
				value: flags.join('\n'),
			});
		}

		embed.fields.push({
			name: 'general.help.plugin',
			value: this.plugin.name,
			inline: true,
		});

		embed.fields.forEach((f) => {
			// using random names doesn't work anymore because discord won't resolve id's in embeds :c
			f.value = f.value.replace(/(@sylver|@random|@user)/ig, msg.author.mention);
		});

		return embed;
	}
}

module.exports = Command;
