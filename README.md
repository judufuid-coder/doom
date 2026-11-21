# Discord Currency Bot

A Discord.js bot with configurable currencies and prices, member transfers, moderator-approved exchanges, and giveaways. Balances, exchange requests, and transaction history are stored in SQLite.

## Requirements

- Node.js 24 or newer
- A Discord application and bot token

## Setup

1. Copy `.env.example` to `.env` and set `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, and `BOT_OWNER_ID` (one or more Discord user IDs, separated by commas, to authorize multiple owners). Keep the token private.
   To enable `!ai`, also set `GROQ_API_KEY` to your Groq API key. `GROQ_MODEL` is optional and defaults to `openai/gpt-oss-120b`. Change `GROQ_SYSTEM_PROMPT` in `.env` to customize the AI; it always responds in Arabic. Keep the API key private and restart the bot after editing `.env`.
2. Install dependencies with `npm install`.
3. In the Discord Developer Portal, enable **Message Content Intent** and **Server Members Intent** under **Bot → Privileged Gateway Intents**. Prefix commands need message content; `!up` needs the members intent to find server members.
4. Invite the bot to your server with the `bot` and `applications.commands` scopes. It needs permission to send messages, embeds, and use buttons.
5. Deploy slash commands with `npm run deploy-commands`.
6. Start the bot with `npm start`.

## Deploying on Railway

1. Create a Railway project from this GitHub repository and deploy the service.
2. In the service's **Variables** settings, add `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, and `BOT_OWNER_ID`. Add `GROQ_API_KEY` if you want to enable `!ai`. Add secrets in Railway, not in source files or GitHub.
3. Add a Railway Volume mounted at `/data`, then set `DATABASE_PATH` to `/data/currency.sqlite`. Keep one running replica so multiple bot instances do not write to separate SQLite databases.
4. The included `railway.json` starts the bot with `npm start` and restarts it after failures. The project requires Node.js 24 or newer. This bot uses the Discord Gateway and does not need an HTTP port or public domain.
5. To register slash commands after setting the Railway variables, link the Railway CLI to this project and run `railway run npm run deploy-commands` from the project directory. Re-run this command after changing slash command definitions.
6. Check the service's deployment logs in Railway if it does not connect. Confirm the Discord bot token is current and the required privileged intents are enabled in the Discord Developer Portal.

Slash commands are registered to the configured guild for quick testing. Prefix commands default to `!`; set `COMMAND_PREFIX` in `.env` to customize it. Set `TRANSFER_CAPTCHA_VARIANT_PERCENT` to a whole number from 0 to 100 to choose the chance of using the alternate CAPTCHA design (default 50%; the rest use the current design). Configure one guild per bot database.

Use `/auditlog channel:#channel` or `!auditlog #channel` to configure the server's separate action-log channel. The bot posts member departures (username and user ID), member role assignments/removals, role creation/updates/deletions, channel creation/updates/deletions, and server setting changes there, with the executor's username and ID when Discord has a matching audit-log entry. Grant the bot **View Audit Log** in the server, plus permission to view and send messages and embed links in the configured channel. Scam stories remain separate and are posted publicly to the scam-alert channel configured through `/setup` or `!setup alert #channel`.

## Commands

- `/help` or `!help` — show an interactive embed with buttons for every command section.
- `/language language:<English|Arabic>` or `!language [english|arabic]` — Administrator-only server language setting. `!language` without an option toggles the setting; bot replies, menus, and profile cards use the selected language.
- `/setup [approval_channel] [alert_channel]` or `!setup [#approval-channel] [#alert-channel]` — Administrator setup check; optionally set exchange approvals and the public scam-alert channel, and scan existing ticket channels for claim buttons. Use `!setup alert #alert-channel` to configure only the scam-alert channel.
- `/auditlog channel:#channel` or `!auditlog #channel` — Administrator-only configuration for the separate server action-log channel.
- `/اختصارات add trigger:<text> command:<balance|profile|transfer|exchange>`, `/اختصارات list`, and `/اختصارات remove trigger:<text>` — Administrator-only command aliases. The `add` command provides a dropdown of supported commands; `list` also shows the available targets and configured aliases. For example, set `trigger:pay` and `command:transfer`; members can then type `pay @member 10` and the bot runs the transfer command with those arguments. Aliases accept the same arguments as their corresponding prefix commands. Adding the same trigger again updates its target command.
- `!up` — Administrator-only role review, posted in the current channel. It finds members holding roles with Administrator, Manage Server/Roles/Channels, Kick, Ban, Timeout, or Manage Messages permission. The buttons can promote to the next higher server role, skip, open a DM form, or remove all matching moderation-permission roles. The bot needs Server Members Intent and Manage Roles; its highest role must be above roles it changes.
- `!تشهير` — Administrator-only command that posts an embed and report button. Any member can submit a story through the form; the story and reporter’s Discord username are posted publicly to the configured scam-alert channel. The form warns members before submission. Reports do not identify a target or trigger automatic bans. Configure the destination with `/setup alert_channel:#channel` or `!setup alert #channel`. The bot needs View Channel, Send Messages, and Embed Links there.
- Prefix command examples: `!profile`, `!p @member`, `!balance`, `!b @member`, `!transfer @member 10`, `!exchange`, `!exchange 5 Secrets "Gold Coins"`, `!currency`, `!ex`.
- `/profile [member]` or `!profile [@member]` / `!p [@member]` — show a profile image with the avatar, current Secrets balance, level based on the highest Secrets balance ever reached, and global rank among positive Secrets holders. Spending or transferring Secrets does not lower the level. Level 1 requires 30,000 Secrets; each next level requires 10,000 more Secrets than the previous level.
- `/games` or `!games` — play Rock Paper Scissors or Coin Flip; each win earns 1 server leaderboard point.
- `!ai <message>` — chat with Groq AI in the current channel. Recent context is kept separately for each member in each server while the bot is running; use `!ai reset` to clear your history. Requires `GROQ_API_KEY`.
- The AI answers in Arabic. Asking `!ai whoami` (or “who am I?” / “من أنا؟”) gets a playful Arabic reply with your Discord username.
- `/score [member]` or `!score [@member]` — show a member’s server points and message count.
- `/leaderboard` or `!leaderboard` — show the top ten server scores. Members earn 1 point per 20 messages; each administrator ticket claim earns 1 point.
- Ticket claim buttons are posted when a text channel is created or detected whose name or parent category contains “ticket”, “support”, or “case”. The first Administrator to claim a ticket gets 1 point. The bot needs access to those ticket channels and permission to send messages, embeds, and buttons.
- `/balance [member] [currency]` — view a wallet showing Secrets only; optionally specify a currency to check its balance. Members with Manage Server can inspect another member's balance.
- `/transfer member amount` — transfer Secrets to another member after entering a six-character letter-and-number code shown in a CAPTCHA image in the command channel. Type the code as your next message in that channel; the bot deletes both the image and your answer after either a correct or incorrect attempt. The bot needs Manage Messages and Attach Files permissions in that channel. The recipient receives a DM with the amount and sender; if their DMs are closed, the transfer still completes and the sender is notified. Amounts support up to six decimal places, up to the database’s per-user balance limit of 9,223,372,036,854.775807 Secrets.
- Currency amounts support up to six decimal places.
- `/currency list`, `/currency add`, `/currency set-price`, `/currency grant amount`, and `/currency remove` — manage currencies with slash commands. Currency changes are owner-only; grant adds Secrets to the configured owner only.
- `/owner` — open a private dashboard with buttons for server listing, currency leaderboards, currency administration, transferring Secrets from a user to the owner, and blacklisting/unblacklisting users. These actions are restricted to `BOT_OWNER_ID`.
- `/admin` or `!admin` — open a private, paginated command dashboard with buttons for every slash command/subcommand and prefix command. Only `BOT_OWNER_ID` can open or use it. Buttons run commands that need no arguments; commands requiring inputs show their usage or open the relevant existing setup flow.
- `!currency` — open the owner-only button menu to list, add, reprice, remove currencies, or grant yourself Secrets. Prices are measured in Secrets.
- `!ex` — open the owner-only menu for managing currencies/rates and choosing the exchange approval channel.
- `!b @member` — show only Secrets in the mentioned member's wallet. This alias allows anyone to view the member's Secrets balance.
- `/exchange amount from to` — request the specified amount of the To currency; the equivalent From amount, rounded up to six decimal places, is reserved and posted for moderator approval. The requester is DM’d after review; a rejection refunds the reserved amount.
- `!exchange` — show available currencies and rates, select currencies, and order an exchange by entering how much of the selected To currency you want to receive. The request is posted in the configured approval channel. The requester gets a DM that the request is pending; slash commands and the interactive form reply privately.
- `!exchange <amount> "<from currency>" "<to currency>"` — request the specified amount of the To currency directly.
- `/giveaway create` — open a private setup form and create a public reaction-entry giveaway. `!giveaway` opens setup by button; `list`, `end <id>`, and `reroll <id>` are also supported.
- `/roller add`, `points`, `remove`, and `list` — Manage Server members can configure separate Basic and Advanced prize rollers. Each prize has a points weight; its chance is that weight divided by the roller’s total points. Add a prize with `/roller add`, set its weight with `/roller points`, and use `/roller list` to see the points and percentages (10 prizes per page).
- `/roller roll` — Roll for yourself and publicly announce the prize with your mention. A member with Manage Server can optionally select another member to roll for. Each prize roller is configured separately for each server.
- `!roller` — Post an embed with Basic and Advanced buttons. Anyone can click a button to roll for themselves and publicly announce their prize. The prefix follows `COMMAND_PREFIX` if customized.
- `/moderate timeout`, `untimeout`, `kick`, `ban`, `unban`, `warn`, `purge`, `role-add`, and `role-remove` — Administrator-only moderation. Warnings are sent by DM and are not stored. Role commands affect one selected role and one member; server-wide role removal is not available.

Currency administration through `/currency`, `!currency`, `!ex`, or the `/owner` dashboard is restricted to the configured bot owner. Owner grants add Secrets only to the owner; the dashboard can also transfer an entered amount from a user's existing Secrets balance to the owner, up to that user's balance and the supported account limit. Amounts use six-decimal precision, with a SQLite signed 64-bit balance limit of 9,223,372,036,854.775807 Secrets per account. The owner leaderboard reports current holdings and cumulative positive admin grants. Blacklisted users cannot use slash/prefix commands or interactions and cannot enter new giveaways; blacklisting removes their active giveaway entries. The configured owner is exempt. The server list creates and caches non-expiring invite links; the bot needs Create Invite permission in at least one channel in each server. Treat these links as public access to those servers. Giveaways and moderation commands require Discord's Administrator permission. Giveaways last from one minute to 90 days and support up to 20 winners; the bot needs View Channel, Send Messages, Embed Links, Add Reactions, and Read Message History in the giveaway channel. Purge is limited to 50 messages per command, and Discord cannot bulk-delete messages older than 14 days. Exchanges require moderator approval. The built-in `Secrets` currency is the base for configured rates and cannot be removed or repriced. Existing databases migrate the former `Coins` currency to `Secrets` while retaining its balances and history. Stored amounts are migrated to six-decimal precision without changing their value.

For prefix commands, put quotes around currency names containing spaces.
