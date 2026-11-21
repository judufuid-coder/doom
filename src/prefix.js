function tokenize(input) {
  const tokens = [];
  const pattern = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|(\S+)/g;
  let match;
  while ((match = pattern.exec(input)) !== null) {
    const quoted = match[1] ?? match[2];
    tokens.push(quoted === undefined ? match[3] : quoted.replace(/\\(["'\\])/g, '$1'));
  }
  return tokens;
}

function getPrefix(value) {
  const prefix = (value || '!').trim();
  if (!prefix || prefix.length > 5 || /\s/.test(prefix)) {
    throw new Error('COMMAND_PREFIX must be 1-5 non-space characters.');
  }
  return prefix;
}

function parseMemberId(value) {
  const mention = value?.match(/^<@!?(\d{17,20})>$/);
  if (mention) return mention[1];
  return /^\d{17,20}$/.test(value || '') ? value : null;
}

module.exports = { tokenize, getPrefix, parseMemberId };
