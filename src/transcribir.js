const fs = require('fs');
const path = require('path');
const {
    preguntarIA,
    crearErrorDeRed,
    crearErrorDeRespuesta
} = require('./ia');

const URL_TRANSCRIPCION = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MODELO_TRANSCRIPCION = 'whisper-large-v3-turbo';
const MAX_TAMANO_AUDIO = 25 * 1024 * 1024;
const TIMEOUT_TRANSCRIPCION_MS = 120000;

function rutaVisible(ruta) {
    const relativa = path.relative(process.cwd(), ruta);
    return relativa && !relativa.startsWith('..') ? relativa : ruta;
}

function validarAudio(rutaAudio, archivoOriginal) {
    if (!fs.existsSync(rutaAudio)) {
        throw new Error(`No se encontró el archivo de audio: ${archivoOriginal}`);
    }

    const informacion = fs.statSync(rutaAudio);

    if (!informacion.isFile()) {
        throw new Error(`La ruta no es un archivo de audio: ${archivoOriginal}`);
    }

    if (informacion.size > MAX_TAMANO_AUDIO) {
        throw new Error('El audio supera el límite de 25 MB.');
    }

    const apiKey = process.env.GROQ_API_KEY?.trim();

    if (!apiKey) {
        throw new Error('Falta GROQ_API_KEY. Configúrala en el archivo .env.');
    }

    return apiKey;
}

async function transcribirAudio(rutaAudio, apiKey) {
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(rutaAudio)]), path.basename(rutaAudio));
    form.append('model', MODELO_TRANSCRIPCION);
    form.append('language', 'es');

    let respuesta;

    try {
        respuesta = await fetch(URL_TRANSCRIPCION, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            },
            body: form,
            signal: AbortSignal.timeout(TIMEOUT_TRANSCRIPCION_MS)
        });
    } catch (error) {
        throw crearErrorDeRed(error);
    }

    if (!respuesta.ok) {
        throw await crearErrorDeRespuesta(respuesta);
    }

    let datos;

    try {
        datos = await respuesta.json();
    } catch (error) {
        throw new Error('El servicio de transcripción devolvió una respuesta que no es JSON válido.');
    }

    if (typeof datos.text !== 'string' || !datos.text.trim()) {
        throw new Error('El servicio de transcripción no devolvió texto.');
    }

    return datos.text.trim();
}

function construirRutaSalida(rutaAudio, sufijo) {
    const directorio = path.dirname(rutaAudio);
    const extension = path.extname(rutaAudio);
    const nombre = path.basename(rutaAudio, extension);

    return path.join(directorio, `${nombre}_${sufijo}.txt`);
}

async function main() {
    const archivoOriginal = process.argv[2] || path.join('audio', 'audio.mp3');
    const rutaAudio = path.resolve(archivoOriginal);
    const apiKey = validarAudio(rutaAudio, archivoOriginal);

    const transcripcion = await transcribirAudio(rutaAudio, apiKey);
    const rutaTranscripcion = construirRutaSalida(rutaAudio, 'transcription');

    await fs.promises.writeFile(rutaTranscripcion, `${transcripcion}\n`, 'utf8');

    console.log('Transcripción:');
    console.log(transcripcion);
    console.log(`\nTranscripción guardada en: ${rutaVisible(rutaTranscripcion)}`);

    const resumen = await preguntarIA(
        'Eres un asistente que resume transcripciones de clases. Resume el texto proporcionado en un máximo de 5 viñetas claras, en español, conservando las ideas y conceptos principales. No pidas más información: usa únicamente el texto recibido. Devuelve únicamente el resumen.',
        `Texto de la transcripción:\n\n${transcripcion}`
    );
    const rutaResumen = construirRutaSalida(rutaAudio, 'resumen');

    await fs.promises.writeFile(rutaResumen, `${resumen}\n`, 'utf8');

    console.log('\nResumen:');
    console.log(resumen);
    console.log(`\nResumen guardado en: ${rutaVisible(rutaResumen)}`);
}

main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
});
