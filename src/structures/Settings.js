const prefixes = process.env.PREFIXES
	? 	process.env.PREFIXES.split(',')
	: 	['a!', '@mention'];

const Cache = require('atlas-lib/lib/structures/Cache');

const Action = require('./Action');
const cache = require('../cache');

const warnCache = new Cache('log-warn-cache');

module.exports = class GuildSettings {
	/**
    * GuildSettings constructor
    * @param {Object} settings The guilds settings from a DB
		* @param {Guild} guild The guild the settings is for
  	*/
	constructor(settings, guild) {
		// mongoose does stupid stuff, toObject makes it a regular, fun object.
		// https://i.sylver.me/hCS7u7.jpg
		this.raw = settings.toObject ? settings.toObject() : settings;

		this.Atlas = require('../../Atlas');

		this.guild = guild || this.Atlas.client.guilds.get(settings.id);

		if (!this.raw.bot) {
			this.update({
				$set: {
					bot: true,
				},
			});
		}
	}

	/**
    * The mute role for the server, undefined if it's not been generated
    * @readonly
    * @memberof Guild
    */
	get muteRole() {
		return this.guild.roles.get(this.raw.plugins.moderation.mute_role);
	}

	/**
    * The ID of the server
    * @readonly
    * @memberof Guild
    */
	get id() {
		return this.raw.id;
	}

	/**
    * The prefix for the server, defaults to the first prefix in env
    * @readonly
    * @memberof Guild
    */
	get prefix() {
		return this.raw.prefix || prefixes[0];
	}

	/**
    * The server lang, defaults to DEFAULT_LANG
    * @readonly
    * @memberof Guild
    */
	get lang() {
		return this.raw.lang || process.env.DEFAULT_LANG;
	}

	/**
    * The permissions of the bot in the guild
    * @readonly
    * @memberof Guild
    */
	get botPerms() {
		return this.guild.me.permission;
	}

	/**
    * The channel to log actions to
    * @readonly
    * @memberof Guild
    */
	get actionLogChannel() {
		const channels = this.plugin('moderation').logs;

		return channels && this.guild.channels.get(channels.action);
	}

	/**
    * The channel to log moderator actions to
    * @readonly
    * @memberof Guild
    */
	get modLogChannel() {
		const channels = this.plugin('moderation').logs;

		return channels && this.guild.channels.get(channels.mod);
	}

	/**
    * The channel to log errors to
    * @readonly
    * @memberof Guild
    */
	get errorLogChannel() {
		const channels = this.plugin('moderation').logs;

		return channels && this.guild.channels.get(channels.error);
	}

	/**
	 * Gets the ticket plugin's support role
	 *
	 * @returns {Role}
	 * @readonly
	 */
	get supportRole() {
		return this.guild.roles.get(this.plugin('tickets').options.support);
	}

	filter(name) {
		return this.raw.plugins.moderation.filters[name];
	}

	/**
    * Find a member in the guild
    * @param {string} query the query to use to find the member. Can be a user ID, username, nickname, mention, etc...
    * @param {Object} opts options
    * @param {Array} opts.members An optional members list to use
    * @param {boolean} opts.memberOnly If false, the return value could be a member or a user object
    * @param {number} opts.percent the percent of sensitivity, on a scale of 0 - 1, e.g 0.60 would require a 60% match
    * @returns {Promise} the member or nothing if nothing was found
    */
	findUser(query, {
		members,
		memberOnly = false,
		percent,
	} = {}) {
		return this.Atlas.util.findUser(this.guild, query, {
			members,
			memberOnly,
			percent,
		});
	}

	/**
	    * Finds a role or channel
	    * @param {string} query the search term. can be a mention, ID, name, etc..
	    * @param {Object} options Options
	    * @param {number} options.percent the percent of sensitivity, on a scale of 0 - 1, e.g 0.60 would require a 60% match
	    * @param {string} options.type The type to search for, defaults to either role or channel. Must be either void, 'role' or 'channel'
	    * @returns {Promise<Channel|Role|Void>}
	    */
	findRoleOrChannel(query, {
		percent,
		type,
	} = {}) {
		return this.Atlas.util.findRoleOrChannel(this.guild, query, {
			percent,
			type,
		});
	}

	/**
        * Get a plugins settings
        * @param {string} name - The name of the plugin to get data for
        * @returns {Object} the plugins data
        */
	plugin(name) {
		return {
			state: 'disabled',
			restrictions: {
				mode: 'blacklist',
				roles: [],
				channels: [],
			},
			...(this.raw.plugins && this.raw.plugins[name.toLowerCase()]) || {},
		};
	}

	/**
    * Update the guild's config with new data. This will also update the local settings
    * @param {Object} settings a MongoDB query to update the guild with
    * @param {Object} opts Options
    * @returns {Promise<Object>} The new guild's settings
    */
	async update(settings, {
		query = {},
	} = {}) {
		const data = await this.Atlas.DB.get('settings')
			.findOneAndUpdate({ id: this.guild.id, ...query }, settings, {
				new: true,
			});

		await cache.settings.set(this.guild.id, data, this.Atlas.DB.CACHE_TIME_SECONDS);

		this.raw = data.toObject();

		return data;
	}

	/**
    * Get options for a command by label
    * @param {string} name the label of the command to get options for
    * @returns {Object|null} the command's options
    */
	command(name) {
		const command = this.Atlas.commands.get(name);
		if (!command) {
			throw new Error(`"${name}" is not a valid command label!`);
		}

		const opts = this.raw.command_options.find(o => o.name === name);

		const parsed = {
			name,
			auto_delete: false,
			disabled: false,
			silent: false,
			cooldown: command.info.cooldown.min,
			restrictions: {
				channels: [],
				roles: [],
				mode: 'blacklist',
			},
			existing: !!opts,
			...opts,
		};

		return parsed;
	}

	/**
    * Add a warning to a user
    * @param {Object} data Data
    * @param {Object} data.target The user object of the target to warn
    * @param {Object} data.moderator The moderator who issued the warn
    * @param {string} data.reason The reason the warn was issued
    * @param {boolean} data.notify Whether the target should be notified that they were warned
    * @returns {Promise} The data, data.notify is whether or not the user was notified, data.info is from mongodb.
     */
	async addInfraction({ target, moderator, reason }) {
		const d = await this.Atlas.DB.get('infractions').create({
			reason,
			target: target.id,
			moderator: moderator.id,
			guild: this.id,
		});

		try {
			if (!this.guild.members.has(target.id)) {
				throw new Error('Cannot warn a member not in the guild');
			}

			// todo: localise
			const responder = new this.Atlas.structs.Responder(null, process.env.DEFAULT_LANG);

			try {
				await responder.dm(target).embed({
					color: this.Atlas.colors.get('red').decimal,
					title: 'Warning',
					description: `You have received a warning in ${this.guild.name}. Improve your behaviour or you will be removed from the server.`,
					fields: [{
						name: 'Warned By',
						value: `${moderator.mention} (\`${moderator.tag}\`)`,
						inline: true,
					}, {
						name: 'Reason',
						value: reason,
						inline: true,
					}],
					timestamp: new Date(),
					footer: {
						text: `This message was sent automatically because you received a warn in ${this.guild.name}. You can block Atlas if you wish to stop receiving these messages.`,
					},
				}).send();

				return {
					notified: true,
					info: d,
				};
			} catch (e) {
				return {
					notified: false,
					info: d,
				};
			}
		} catch (e) {
			if (process.env.VERBOSE === 'true') {
				console.warn(e);
			}

			return {
				notified: false,
				info: d,
			};
		}
	}

	/**
    * Does what it says on a tin, removes a warning by ID
    * @param {Object|ObjectId} _id The ID or Object of the warn, if an object is provided it must have an _id key
    * @returns {Promise} the update
    */
	async removeInfraction(_id) {
		const id = _id._id || _id;

		const removed = await this.Atlas.DB.get('infractions').remove({ _id: id });

		if (removed.nModified !== 0) {
			return removed;
		}

		throw new Error('Invaild warning ID');
	}

	/**
    * Gets all warnings for a user
    * @param {string} user the ID of the user
    * @param {Object} opts Options
    * @returns {Array} An array of objects with infraction info
    */
	async getInfractions(user) {
		const warnings = await this.Atlas.DB.get('infractions').find({
			guild: this.id,
			target: (user.id || user),
		});

		warnings.sort((a, b) => b.date - a.date);

		return warnings;
	}

	/**
    * Logs a message into the appropriate channel in the guild if enabled
		*
    * @param {string} type The type of log it is, "action", "error" or "mod"
    * @param {Object} embed the embed to send to the channel
		* @param {boolean} retry If a previous log failed, this will force the bot to fetch new webhooks
    * @returns {Promise|Void} the message sent, or void if logging is not enabled in the guild
    */
	async log(type, embed) {
		const channel = this[`${type}LogChannel`];

		if (channel) {
			const perms = channel.permissionsOf(this.guild.me.id);

			if (!perms.has('sendMessages')) {
				return;
			}

			const responder = new this.Atlas.structs.Responder(channel, this.lang);

			if (!perms.has('embedLinks')) {
				const warned = await warnCache.get(this.id);

				if (warned) {
					return;
				}

				return responder.text('general.loggerWarning').send();
			}

			return responder.embed(embed).send();
		}
	}

	/**
	 * Run actions based on a Mongoose query.
	 *
	 * @param {Object} query A Mongoose query for the Actions collection
	 * @param {Object} options options
	 * @param {Object} options.msg The message to use in context.
	 * @param {Object} [options.user=options.msg] The user to have in context, defaults to msg.author !! WHICH MAY BE INCORRECT !! sometimes.
	 */
	async runActions(query, {
		msg,
		user = msg.author,
	}) {
		if (!query['flags.enabled']) {
			query['flags.enabled'] = true;
		}

		const actions = await this.Atlas.DB.get('actions').find(query);

		// run those actions
		if (actions.length) {
			for (const action of actions.map(a => new Action(this, a))) {
				const member = await this.findUser(user.id, {
					memberOnly: true,
				});

				try {
					// basically immitating a message with the user that added the reaction as the author
					await action.execute({
						author: user,
						guild: msg.guild,
						channel: msg.channel,
						lang: this.raw.lang,
						member,
					});

					if (actions.length !== 1) {
						// sleep for 1s to prevent abuse
						await this.Atlas.lib.utils.sleep(1000);
					}
				} catch (e) {
					this.Atlas.Sentry.captureException(e);

					console.warn('Error executing action', e);
				}
			}
		}

		return actions;
	}

	/**
	 * Gets all action triggers for the guild.
	 * @returns {Promise<Array<Object>>} The action triggers
	 */
	async getTriggers() {
		return this.Atlas.DB.get('actions').find({
			guild: this.id,
			'flags.enabled': true,
		}, 'trigger');
	}

	/**
	 * Gets the action from an ID
	 * @param {ObjectID|string} id The ID of the action
	 * @returns {Promisie<Action>} The action
	 */
	async getAction(id) {
		const action = await this.Atlas.DB
			.get('actions')
			.findOne({
				_id: id,
				guild: this.id,
				'flags.enabled': true,
			});

		if (action) {
			return new Action(this, action);
		}
	}

	/**
	 * Gets the actions to run for a specific message.
	 *
	 * @param {Message} msg The message to check for actions
	 * @returns {Promise<Array<Action>>}
	 */
	async findActions(msg) {
		const actions = await this.getTriggers();

		const triggers = actions.filter(({ trigger }) => {
			if (trigger.type === 'messageCreate') {
				if (!trigger.content) {
					return true;
				}

				return trigger.content === msg.channel.id;
			}

			if (trigger.type === 'label' && msg.label === trigger.content) {
				return true;
			}

			// i'm not sorry honestly
			if (
				trigger.type === 'keyword'
					&& (
						msg.content.toLowerCase().includes(trigger.content.toLowerCase())
						|| msg.cleanContent.toLowerCase().includes(trigger.content.toLowerCase())
					)
			) {
				return true;
			}

			return false;
		});

		if (triggers.length) {
			return this.getActions(triggers.map(t => t._id));
		}

		return [];
	}

	/**
	 * Gets full actions form an array of _id's
	 *
	 * @param {Array<ObjectId|string>} ids The ID's of the actions to get
	 * @returns {Promise<Array<Action>>}
	 */
	async getActions(ids) {
		return (await this.Atlas.DB
			.get('actions')
			.find({
				_id: {
					$in: ids,
				},
				guild: this.id,
			}))
			.map(a => new Action(this, a));
	}

	/**
	 * Gets the guild's ticket category, generating one if one doesn't exist.
	 *
	 * @returns {Promise<GuildCategory>}
	 */
	async getTicketCategory() {
		const existing = this.guild.channels.get(this.plugin('tickets').options.category);

		if (existing) {
			return existing;
		}

		// try find a category in the guild with the name as 'Tickets', only works for english guilds and has drawbacks but like
		// better then nothing
		let category = this.guild.channels.find(c => c.type === 4 && c.name.toLowerCase() === 'tickets');

		if (!category) {
			// create our own when all else fails
			category = await this.guild.createChannel('Tickets', 4, 'Category for Tickets');

			// guild.id is the @everyone role ID
			await category.editPermission(this.guild.id, 0, 1024, 'role');
		}

		await this.update({
			'plugins.tickets.options.category': category.id,
		});

		return category;
	}
};
