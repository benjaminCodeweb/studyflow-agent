import { cli, JobContext } from "@livekit/agents";
import { AssemblyAI } from "assemblyai";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY!;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET!;
const LIVEKIT_URL = process.env.LIVE_KIT_URL!;

if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
  console.error("❌ Faltan variables en el .env");
  process.exit(1);
}

const ASSEMBLY_KEY = process.env.ASSEMBLYAI_API_KEY;
if (!ASSEMBLY_KEY) {
  console.error("❌ Falta ASSEMBLYAI_API_KEY en el .env");
  process.exit(1);
}

// ✅ Aquí TS ya sabe que es string, no undefined
const aaiClient = new AssemblyAI({ apiKey: ASSEMBLY_KEY });

export async function startAgent(ctx: JobContext) {

    const room = ctx.room;

  console.log("🚀 Agente conectado a sala:", room.name);

  if (!ctx.room) {
    console.error("❌ No hay room asignada al agente");
    return;
  }

 

  let audioFrames: Int16Array[] = [];
  let bufferTimer: NodeJS.Timeout | null = null;

  // 👂 Recibir frames de audio PCM
  // @ts-expect-error: onAudioFrame puede no estar tipado en algunas versiones de @livekit/agents
  ctx.onAudioFrame = (frame: Int16Array) => {
    audioFrames.push(frame);

    if (!bufferTimer) {
      bufferTimer = setTimeout(async () => {
        const totalLength = audioFrames.reduce((acc, cur) => acc + cur.length, 0);
        const merged = new Int16Array(totalLength);

        let offset = 0;
        for (const chunk of audioFrames) {
          merged.set(chunk, offset);
          offset += chunk.length;
        }

        audioFrames = [];
        bufferTimer = null;

        try {
          const wavBuffer = pcm16ToWav(merged, 48000);
          fs.writeFileSync("/tmp/audio.wav", wavBuffer);

          const transcript = await aaiClient.transcripts.transcribe({
            audio: "/tmp/audio.wav",
          });

          console.log("📝 Transcripción:", transcript.text);

          // ✅ Type narrowing antes de publicar
          if (room.localParticipant) {
            room.localParticipant.publishData(
              new TextEncoder().encode(transcript.text || ""),
              { reliable: true }
            );
          } else {
            console.warn("⚠️ localParticipant no está disponible, no se publica el mensaje");
          }
        } catch (err) {
          console.error("❌ Error en transcripción:", err);
        }
      }, 3000);
    }
  };
}

// 🔧 Helper: convertir PCM a WAV
function pcm16ToWav(pcm: Int16Array, sampleRate = 48000): Buffer {
  const buffer = Buffer.alloc(44 + pcm.length * 2);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + pcm.length * 2, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(pcm.length * 2, 40);

  for (let i = 0; i < pcm.length; i++) {
    buffer.writeInt16LE(pcm[i], 44 + i * 2);
  }

  return buffer;
}

cli.runApp({
  // @ts-expect-error forzamos el tipo porque esta versión espera string
  agent: startAgent,
  livekitConfig: {
    apiKey: process.env.LIVEKIT_API_KEY!,
    apiSecret: process.env.LIVEKIT_API_SECRET!,
    wsUrl: process.env.LIVE_KIT_URL!,
  },
});
