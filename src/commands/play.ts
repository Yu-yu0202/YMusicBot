import {
  type ChatInputCommandInteraction,
  EmbedBuilder,
  ChannelType,
  MessageFlags,
} from "discord.js";
import { type CommandMeta } from "botmanager";
import { MusicManager } from "../utils/musicmanager.js";

export class Play implements CommandMeta {
  public name = "play";
  public description: string = "音楽を再生します";
  public type: "slash" = "slash";
  public options = [
    {
      name: "url",
      description: "再生するURL",
      type: "string" as const,
      required: true,
    },
  ];

  public async exec(interaction: ChatInputCommandInteraction): Promise<void> {
    const url = interaction.options.getString("url", true);
    const member = interaction.guild?.members.cache.get(interaction.user.id);
    const channel = member?.voice?.channel;
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      const embed = new EmbedBuilder()
        .setTitle("❌エラー")
        .setDescription("ボイスチャンネルに参加していません")
        .setColor("Red");
      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const embed = new EmbedBuilder()
      .setTitle("✅️完了")
      .setDescription(
        "キューに追加しました。\n-# 再生開始まで少し時間がかかる場合があります。",
      )
      .setColor("Green");
    const queue: MusicManager =
      MusicManager.getInstance(channel.id) ??
      MusicManager.createPlayer(channel);
    queue.pushQueue(url);
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    queue.start();
  }
}
