
import { WorkerOptions, cli, defineAgent, llm, metrics, voice, } from '@livekit/agents';
import * as cartesia from '@livekit/agents-plugin-cartesia';
import * as deepgram from '@livekit/agents-plugin-deepgram';
import * as openai from '@livekit/agents-plugin-openai';
import * as silero from '@livekit/agents-plugin-silero';
import { BackgroundVoiceCancellation } from '@livekit/noise-cancellation-node';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { db } from "./db.js";
import OpenAI from 'openai';
dotenv.config({ path: '.env' });
class Assistant extends voice.Agent {
    constructor(activePdfId = null) {
        super({
            instructions: `
Eres un tutor de estudio por voz conectado a una sala de LiveKit.
Tu función es ayudar a los estudiantes a comprender el contenido de sus PDFS y prepararse para exámenes orales.

🎯 ESTILO:
- Responde de forma clara, breve y pedagógica (máx. 3–4 frases).
- Usa un tono motivador y profesional, como un profesor que toma una lección.
- Evita símbolos, emojis y formato raro: solo texto simple.

📖 COMPORTAMIENTO:
- Cuando el usuario haga una pregunta, responde basándote en el contenido del PDF o en tu conocimiento general si no está en el PDF.
- Si no tenés la respuesta, decí: "Eso no aparece en tu documento, pero te puedo dar una explicación general".
- Sé curioso, hacé preguntas de repaso al usuario cuando tenga sentido.
- Si detectás que el usuario duda o responde mal, explícale con paciencia y dale ejemplos.

🗣️ VOZ:
- Da tus respuestas como si estuvieras en una lección oral: claras, pausadas y fáciles de entender.
- Espera a que el usuario termine de hablar antes de responder.
`,
            tools: {
                consultaPdf: llm.tool({
                    description: `Consulta el resumen del PDF cargado por el estudiante 
    para responder dudas específicas.`,
                    parameters: {
                        type: "object",
                        properties: {
                            fileId: {
                                type: "string",
                                description: "El ID único del PDF en la base de datos.",
                            },
                            question: {
                                type: "string",
                                description: "La pregunta que el usuario quiere hacer sobre el PDF.",
                            },
                        },
                        required: ["fileId", "question"],
                    },
                    execute: async ({ question, fileId }) => {
                        const pdfToUse = fileId || activePdfId; // usa el de metadata si no viene directo
                        if (!pdfToUse) {
                            return "⚠️ No hay un PDF vinculado a esta sesión.";
                        }
                        try {
                            console.log(`📂 Consultando PDF con ID: ${pdfToUse}, pregunta: ${question}`);
                            const [rows] = await db.query(`
                SELECT resumen FROM pdfs WHERE id = ? LIMIT 1
              `, [pdfToUse]);
                            if (!rows || rows.length === 0) {
                                return "No encontré el PDF cargado en la base de datos.";
                            }
                            ;
                            const pdfText = rows[0].resumen;
                            const openais = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
                            const response = await openais.chat.completions.create({
                                model: "gpt-4o-mini",
                                messages: [
                                    { role: "system", content: "Eres un asistente experto en responder preguntas sobre documentos PDF." },
                                    { role: "user", content: `Documento:\n${pdfText}\n\nPregunta: ${question}` },
                                ],
                            });
                            return response.choices[0].message.content ?? "No pude generar respuesta.";
                        }
                        catch (err) {
                            console.error("❌ Error en consultaPdf:", err);
                            return "⚠️ Hubo un error al consultar el PDF.";
                        }
                    },
                }),
            },
        });
    }
}
export default defineAgent({
    prewarm: async (proc) => {
        proc.userData.vad = await silero.VAD.load();
    },
    entry: async (ctx) => {
        // Set up a voice AI pipeline using OpenAI, Cartesia, Deepgram, and the LiveKit turn detector
        const session = new voice.AgentSession({
            // A Large Language Model (LLM) is your agent's brain, processing user input and generating a response
            // See all providers at https://docs.livekit.io/agents/integrations/llm/
            llm: new openai.LLM({ model: 'gpt-4o-mini', apiKey: process.env.API_KEY_OPENAI }),
            // Speech-to-text (STT) is your agent's ears, turning the user's speech into text that the LLM can understand
            // See all providers at https://docs.livekit.io/agents/integrations/stt/
            stt: new deepgram.STT({
                model: 'nova-3',
                apiKey: process.env.DEEPGRAM_API_KEY,
                language: "es"
            }),
            // Text-to-speech (TTS) is your agent's voice, turning the LLM's text into speech that the user can hear
            // See all providers at https://docs.livekit.io/agents/integrations/tts/
            tts: new cartesia.TTS({
                voice: '5c5ad5e7-1020-476b-8b91-fdcbe9cc313c',
                apiKey: process.env.CARTESIA_API_KEY
            }),
            // VAD and turn detection are used to determine when the user is speaking and when the agent should respond
            // See more at https://docs.livekit.io/agents/build/turns
            
            vad: ctx.proc.userData.vad,
        });
        // To use a realtime model instead of a voice pipeline, use the following session setup instead:
        // const session = new voice.AgentSession({
        //   // See all providers at https://docs.livekit.io/agents/integrations/realtime/
        //   llm: new openai.realtime.RealtimeModel({ voice: 'marin' }),
        // });
        // Metrics collection, to measure pipeline performance
        // For more information, see https://docs.livekit.io/agents/build/metrics/
        const usageCollector = new metrics.UsageCollector();
        session.on(voice.AgentSessionEventTypes.MetricsCollected, (ev) => {
            metrics.logMetrics(ev.metrics);
            usageCollector.collect(ev.metrics);
        });
        const logUsage = async () => {
            const summary = usageCollector.getSummary();
            console.log(`Usage: ${JSON.stringify(summary)}`);
        };
        ctx.addShutdownCallback(logUsage);
        let activePdfId = null;
        ctx.room.on("participantConnected", (p) => {
            if (p.metadata) {
                try {
                    const meta = JSON.parse(p.metadata);
                    if (meta.pdfId) {
                        activePdfId = meta.pdfId;
                        console.log(`✅ PDF vinculado al usuario: ${activePdfId}`);
                    }
                }
                catch (e) {
                    console.error("❌ Error leyendo metadata:", e);
                }
            }
        });
        // Start the session, which initializes the voice pipeline and warms up the models
        await session.start({
            agent: new Assistant(activePdfId),
            room: ctx.room,
            inputOptions: {
                // LiveKit Cloud enhanced noise cancellation
                // - If self-hosting, omit this parameter
                // - For telephony applications, use `BackgroundVoiceCancellationTelephony` for best results
                noiseCancellation: BackgroundVoiceCancellation(),
            },
        });
        // Join the room and connect to the user
        await ctx.connect();
        console.log("🎓 Assistant iniciado con PDF:", activePdfId);
    },
});
cli.runApp(new WorkerOptions({
    apiKey: process.env.LIVEKIT_API_KEY,
    apiSecret: process.env.LIVEKIT_API_SECRET,
    wsURL: process.env.LIVE_KIT_URL,
    agent: fileURLToPath(import.meta.url), // sigue apuntando al mismo archivo
}));
//# sourceMappingURL=botNode.js.map