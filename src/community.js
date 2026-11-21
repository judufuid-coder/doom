const { randomInt } = require('node:crypto');

const GAME_CHOICES = {
  rps: ['rock', 'paper', 'scissors'],
  coinflip: ['heads', 'tails']
};

function isTicketChannel(channel) {
  const ticketName = /(?:^|[^a-z0-9])(tickets?|supports?|cases?)(?:$|[^a-z0-9])/i;
  return ticketName.test(channel.name || '') || ticketName.test(channel.parent?.name || '');
}

function randomGameChoice(game) {
  const choices = GAME_CHOICES[game];
  if (!choices) throw new Error('That game is not supported.');
  return choices[randomInt(choices.length)];
}

function resolveGameResult(game, playerChoice, botChoice) {
  const choices = GAME_CHOICES[game];
  if (!choices || !choices.includes(playerChoice) || !choices.includes(botChoice)) {
    throw new Error('That game choice is not valid.');
  }
  if (game === 'coinflip') return playerChoice === botChoice ? 'win' : 'loss';
  if (playerChoice === botChoice) return 'tie';
  const beats = {
    rock: 'scissors',
    paper: 'rock',
    scissors: 'paper'
  };
  return beats[playerChoice] === botChoice ? 'win' : 'loss';
}

module.exports = { GAME_CHOICES, isTicketChannel, randomGameChoice, resolveGameResult };
