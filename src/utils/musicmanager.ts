import {
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  joinVoiceChannel,
  NoSubscriberBehavior,
  StreamType,
  entersState,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import { type VoiceChannel } from "discord.js";
import { execa } from "execa";
import { Logger } from "botmanager";
import { existsSync } from "fs";
import { createHash } from "crypto";
import path from "path";

export class MusicManager {
  private static instance: Map<string, MusicManager> = new Map();
  private Queue: string[];
  private isPlaying: boolean = false;
  private VC: VoiceChannel;
  private downloadingQueue: Set<string> = new Set();

  private constructor(vc: VoiceChannel) {
    this.VC = vc;
    this.Queue = [];
  }

  public static getInstance(ChannelId: string): MusicManager | undefined {
    if (!this.instance.has(ChannelId)) {
      return undefined;
    }
    return this.instance.get(ChannelId)!;
  }

  public static getQueue(ChannelId: string): string[] | undefined {
    if (!this.instance.has(ChannelId)) {
      return undefined;
    }
    return this.instance.get(ChannelId)!.Queue;
  }

  public static createPlayer(vc: VoiceChannel): MusicManager {
    if (this.instance.has(vc.id)) {
      return this.instance.get(vc.id)!;
    }
    const player = new MusicManager(vc);
    this.instance.set(vc.id, player);
    return player;
  }

  public pushQueue(url: string): void {
    this.Queue.push(url);
    Logger.log(
      `[ChannelId: ${this.VC.id}] URL added to queue: ${url}`,
      "debug",
    );

    if (this.isPlaying) {
      this.predownloadNext();
    }
  }

  private getFilePath(url: string): string {
    const hash = createHash("md5").update(url).digest("hex");
    return path.join("data", "cache", `${hash}.opus`);
  }

  private async downloadTrack(url: string): Promise<string> {
    const filePath = this.getFilePath(url);

    if (existsSync(filePath)) {
      return filePath;
    }

    if (this.downloadingQueue.has(url)) {
      while (this.downloadingQueue.has(url)) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return filePath;
    }

    this.downloadingQueue.add(url);
    try {
      try {
        await execa("yt-dlp", [
          "-o",
          filePath,
          "-f",
          'ba[acodec="opus"]',
          "--audio-quality",
          "72K",
          url,
        ]);
      } catch {
        const tempPath = filePath.replace(".opus", ".temp");
        let success = false;

        try {
          await execa("yt-dlp", ["-o", tempPath, "-f", "bestaudio", url]);
          success = true;
        } catch {
          try {
            await execa("yt-dlp", ["-o", tempPath, "-f", "ba", url]);
            success = true;
          } catch {
            await execa("yt-dlp", ["-o", tempPath, url]);
            success = true;
          }
        }

        if (success) {
          await execa("ffmpeg", [
            "-i",
            tempPath,
            "-af",
            "loudnorm=I=-16:TP=-1.5:LRA=11",
            "-c:a",
            "libopus",
            "-b:a",
            "72k",
            filePath,
            "-y",
          ]);
          await execa("del", [tempPath], { shell: true });
        }
      }
      Logger.log(`[ChannelId: ${this.VC.id}] Downloaded: ${url}`, "debug");
    } catch (error) {
      Logger.log(
        `[ChannelId: ${this.VC.id}] Download failed: ${url} - ${error}`,
        "error",
      );
      throw error;
    } finally {
      this.downloadingQueue.delete(url);
    }

    return filePath;
  }

  private async predownloadNext(): Promise<void> {
    const nextUrls = this.Queue.slice(0, 3);
    for (const url of nextUrls) {
      if (
        !existsSync(this.getFilePath(url)) &&
        !this.downloadingQueue.has(url)
      ) {
        this.downloadTrack(url).catch((error) => {
          Logger.log(
            `[ChannelId: ${this.VC.id}] Predownload failed: ${url} - ${error}`,
            "error",
          );
        });
      }
    }
  }

  public shiftQueue(): string | undefined {
    const url = this.Queue.shift();
    return url ?? undefined;
  }

  public async start(): Promise<void> {
    if (this.isPlaying) return;

    const con = joinVoiceChannel({
      channelId: this.VC.id,
      guildId: this.VC.guild.id,
      adapterCreator: this.VC.guild.voiceAdapterCreator,
    });

    try {
      await entersState(con, VoiceConnectionStatus.Ready, 30_000);
    } catch (error) {
      Logger.log(
        `[ChannelId: ${this.VC.id}] Voice connection failed: ${error}`,
        "error",
      );
      con.destroy();
      return;
    }

    this.isPlaying = true;
    const player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Pause,
        maxMissedFrames: Math.round(15000 / 20),
      },
    });
    con.subscribe(player);

    const playNext = async () => {
      const url = this.shiftQueue();
      if (!url) {
        this.isPlaying = false;
        player.stop();
        con.destroy();
        return;
      }

      try {
        const filePath = await this.downloadTrack(url);

        // ファイルが完全に書き込まれるまで少し待機
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const resource = createAudioResource(filePath, {
          inputType: StreamType.OggOpus,
          inlineVolume: true,
        });

        player.play(resource);

        // バックグラウンドで次の曲をダウンロード
        this.predownloadNext();
      } catch (error) {
        Logger.log(
          `[ChannelId: ${this.VC.id}] Error playing ${url}: ${error}`,
          "error",
        );
        await playNext();
      }
    };

    player.on(AudioPlayerStatus.Idle, async () => {
      await playNext();
    });

    player.on("error", (error) => {
      Logger.log(
        `[ChannelId: ${this.VC.id}] Audio player error: ${error}`,
        "error",
      );
    });

    con.on(VoiceConnectionStatus.Disconnected, () => {
      this.isPlaying = false;
      player.stop();
    });

    await playNext();
  }
}
