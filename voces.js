import Cartesia from "cartesia-js";
import dotenv from "dotenv";

dotenv.config();

const client = new Cartesia({
  apiKey: process.env.CARTESIA_API_KEY,
});

const voices = await client.voices.list();

console.log("🔊 Voces disponibles:", voices);

// Si querés filtrar solo voces en español:
const spanishVoices = voices.filter((v) => v.language.startsWith("es"));
console.log("🎙️ Voces en español:", spanishVoices);
