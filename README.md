# Atlas

A Discord bot that does ~~all~~ most of the things - [atlasbot.xyz](https://atlasbot.xyz)

**This is Atlas 8.0, an unfinished version of Atlas**. Source code for pre-8.0 versions will not be made public. The code here isn't finished, and while it should work fine, it's missing a lot of the features the live version has. Slowly they'll be ported over. Contributions are welcome.

## Prerequisites

* Node.js >v10
* MongoDB 
* [Lavalink](https://github.com/Frederikam/Lavalink) 

## Installation

1. Clone this repo

    ```bash
    git clone https://github.com/get-atlas/bot.git
    ```
2. Run `npm i` to install dependencies

3. Copy `.env.example` to `.env` and fill in the env variables

4. Start the bot with `npm start`

## Environment Variables

| Name          | Description   |
| ------------- | ------------- |
| PREFIXES      | A list of all prefixes the bot will listen for by default, split by commas. @mention will be replaced with the bot's mention. |
| NODE_ENV      | The environment the bot is in, should be "production" or "development". |
| TOKEN         | The bot token to login with. |
| MONGO_URI     | A MongoDB Connection URI. |
| LAVALINK_HOST | The IP of the lavalink server to use. |
| LAVALINK_PORT | The WebSocket port for the lavalink server. |
| LAVALINK_PASS | The password for the lavalink server. |
| OMDBAPI_KEY   | An [OMDBAPI](http://omdbapi.com/apikey.aspx) key. |
| VERBOSE       | Whether or not to use verbose logging (e.g, logging commands) - you'll probably want this disabled in a production environment. |
| OWNER         | The bot's owner ID. **For security, this should only be set to user ID's that already have direct access to the host server.**|
| DISCORDBOTS_ORG_TOKEN | A [discordbots.org](https://discordbots.org/) API Token, used to post statistics to and get information about other bots. |
| GOOGLE_CX | A Google CX key for custom searches. Google is your friend. |
| GOOGLE_KEY | A Google key for custom searches. See above. |
| DEFAULT_LANG | The default language to use for everything. Valid languages are in [/lang](/lang)

## Disclaimer / Warning

This is a very early version of 8.0, which means many features from 7.x are missing. Some features are still being ported over, be patient. Additionally, if you find any issues, tell us or submit a PR to get it fixed.

## Acknowledgements

* lib/utils/parseTime - from [Aetheryx/remindme](https://github.com/Aetheryx/remindme/blob/edb8d301c633379e7fa3d4141226143cc3358906/src/utils/parseTime.js#L1), licensed under MIT.
* lib/utils/cleanArgs - from [abalabahaha/eris](https://github.com/abalabahaha/eris/blob/e6208fa8ab49d526df5276620ac21eb351da3954/lib/structures/Message.js#L147), licensed under MIT.
