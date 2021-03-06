const Command = require('../../structures/Command.js');

module.exports = class extends Command {
	constructor(Atlas) {
		super(Atlas, module.exports.info);
	}

	action(msg) {
		const responder = new this.Atlas.structs.Responder(msg);

		const responses = responder.format({
			stringOnly: false,
			key: '8ball.responses',
		});

		const response = this.Atlas.lib.utils.pickOne(responses);

		return responder
			.localised()
			.text(response)
			.send();
	}
};

module.exports.info = {
	name: '8ball',
	ignoreStyleRules: true,
	aliases: [
		'eightball',
		'ateball',
	],
	examples: [
		'is atlas a good bot?',
		'is @random a bad person?',
		'is @random a good person?',
	],
};
