const Command = require('../../structures/Command.js');

module.exports = class extends Command {
	constructor(Atlas) {
		super(Atlas, module.exports.info);
	}

	async action(...args) {
		// redirects to the "warn view"
		const warnView = this.Atlas.commands.get('warn').subcommands.get('view');

		return warnView.execute(...args);
	}
};

module.exports.info = {
	name: 'warnings',
	examples: [
		'@user',
	],
	guildOnly: true,
};
