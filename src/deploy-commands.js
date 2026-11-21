const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { REST, Routes } = require('discord.js');
const commands = require('./commands');
const { localizeCommandDefinition } = require('./localization');

const { DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID || !DISCORD_GUILD_ID) {
  throw new Error('Set DISCORD_TOKEN, DISCORD_CLIENT_ID, and DISCORD_GUILD_ID in your .env file.');
}

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

rest.put(
  Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID),
  { body: commands.map(command => localizeCommandDefinition(command.toJSON())) }
).then(() => {
  console.log('Guild slash commands deployed.');
}).catch(error => {
  console.error('Could not deploy slash commands:', error);
  process.exitCode = 1;
});
