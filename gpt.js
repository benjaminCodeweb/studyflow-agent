import OpenAi from 'openai';
import pdf from "pdf-parse-fixed";
import dotenv from 'dotenv';


dotenv.config();


const openai = new OpenAi({
    apiKey: process.env.API_KEY_OPENAI
});

export function chunksPdf (text, size =  1000) {
    const words = text.split(' ');
    let chunks = [];
    let current = [];
    let count = 0;

    for(let word of words) {
        count  += word.length + 1;
        if(count > size) {
            chunks.push(current.join(""));
            current = [];
            count = 0;

        }

        current.push(word);

    } 
    if(current.length) chunks.push(current.join(" "));
    return chunks

}


async function resumirChunk(chunk) {
    const res = await openai.chat.completions.create({
        model: 'chatgpt-4o-latest',
        messages: [
            {role: 'system', content: 'Eres un sistema que resume documentos'},
            {role: 'user', content:`resume el siguiente documento ${chunk}`}

        ]
    });
    return res.choices[0].message.content;
}


export async function processPdf(fileBuffer) {
    const data = await pdf(fileBuffer);
    const text = data.text;

    const chunks = chunksPdf(text, 2000);


    const partialSummaries = [];

    for(const chunk of chunks) {
        const summary = await resumirChunk(chunk);
        partialSummaries.push(summary)
    }

    const finalSummary = await resumirChunk(partialSummaries.join('\n\n'));
    return finalSummary
}