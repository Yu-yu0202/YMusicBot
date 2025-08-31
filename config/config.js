import { GatewayIntentBits } from "discord.js";

export const config = {
  token: process.env.DISCORD_TOKEN || "",
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ],
  options: {
    adminuserid: ["1264130543008612426"],
    log: {
      logLevel: "info",
      enable_console: true,
    },
    feature: {
      command_autoload: true,
      event_autoload: true,
      enable_admin_commands: false
    },
  },
};
