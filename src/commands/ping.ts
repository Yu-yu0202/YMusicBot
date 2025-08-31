import { type ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { type CommandMeta } from "botmanager";

export class Ping implements CommandMeta {
  public name = "ping";
  public description: string = "Pingを取得します";
  public type: "slash" = "slash";

  public async exec(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🏓Pong!")
          .setDescription(`Ping: ${interaction.client.ws.ping}ms`)
          .setColor("Green"),
      ],
    });
  }
}
