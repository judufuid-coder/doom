const SHORTCUT_COMMANDS = Object.freeze({
  balance: 'balance',
  profile: 'profile',
  transfer: 'transfer',
  exchange: 'exchange'
});

function normalizeShortcutTrigger(trigger) {
  if (typeof trigger !== 'string') throw new Error('Shortcut trigger must be text.');
  const normalized = trigger.trim().toLocaleLowerCase();
  if (!normalized || normalized.length > 100 || /[\r\n]/u.test(normalized)) {
    throw new Error('Shortcut trigger must be between 1 and 100 characters.');
  }
  return normalized;
}

function validateShortcutCommand(command) {
  if (!Object.hasOwn(SHORTCUT_COMMANDS, command)) {
    throw new Error('Choose a supported shortcut command.');
  }
  return command;
}

function findShortcut(shortcuts, messageContent) {
  if (typeof messageContent !== 'string') return null;
  const content = messageContent.trim();
  const normalized = content.toLocaleLowerCase();
  const orderedShortcuts = [...shortcuts].sort((a, b) => b.trigger.length - a.trigger.length);
  for (const shortcut of orderedShortcuts) {
    if (!shortcut.command_name && shortcut.response) {
      if (normalized === shortcut.trigger) return { shortcut, argumentsText: '' };
      continue;
    }
    if (normalized === shortcut.trigger) {
      return { shortcut, argumentsText: '' };
    }
    if (normalized.startsWith(`${shortcut.trigger} `)) {
      return {
        shortcut,
        argumentsText: content.slice(shortcut.trigger.length).trim()
      };
    }
  }
  return null;
}

module.exports = {
  SHORTCUT_COMMANDS,
  findShortcut,
  normalizeShortcutTrigger,
  validateShortcutCommand
};
