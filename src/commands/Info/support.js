const Command = require('../../structures/Command.js');

module.exports = class Support extends Command {
	constructor(Atlas) {
		super(Atlas, module.exports.info);
	}

	action(msg) {
		const responder = new this.Atlas.structs.Responder(msg);

		responder.text('support').send();
	}
};

module.exports.info = {
	name: 'support',
};
