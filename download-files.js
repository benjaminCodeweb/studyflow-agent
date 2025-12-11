import {
  ensureAudioModels,
  ensureTurnDetectorModels
} from "@livekit/agents-plugin-livekit";

console.log("⬇️ Descargando modelos de LiveKit...");

await ensureAudioModels();
await ensureTurnDetectorModels();

console.log("✅ Modelos descargados correctamente.");
