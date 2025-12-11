// download-files.js

import { downloadFiles } from "@livekit/agents-plugin-livekit";

// Descarga los modelos necesarios ANTES de iniciar el bot
console.log("⬇️ Descargando modelos de LiveKit...");
await downloadFiles();
console.log("✅ Modelos descargados correctamente.");
