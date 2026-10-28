const path = require('path');

try {
    process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch (error) {
}

const TIMEOUT_MS = 30000;

function validarConfiguracion() {
    const apiKey = process.env.GROQ_API_KEY?.trim();
    const apiUrl = process.env.API_URL?.trim();
    const modelo = process.env.MODEL?.trim();

    if (!apiKey) {
        throw new Error('Falta GROQ_API_KEY. Configúrala en el archivo .env.');
    }

    if (!apiUrl) {
        throw new Error('Falta API_URL. Configúrala en el archivo .env.');
    }

    if (!modelo) {
        throw new Error('Falta MODEL. Configúralo en el archivo .env.');
    }

    return { apiKey, apiUrl, modelo };
}

function crearErrorDeRed(error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        const errorTiempo = new Error('La API tardó demasiado en responder. Inténtalo de nuevo.');
        errorTiempo.code = 'TIMEOUT';
        errorTiempo.cause = error;
        return errorTiempo;
    }

    const errorConexion = new Error('No se pudo conectar. Revisa tu internet o la API_URL.');
    errorConexion.code = 'NETWORK';
    errorConexion.cause = error;
    return errorConexion;
}

async function crearErrorDeRespuesta(respuesta) {
    let detalle = '';

    try {
        const cuerpo = await respuesta.json();
        detalle = cuerpo?.error?.message || cuerpo?.message || JSON.stringify(cuerpo);
    } catch (error) {
        try {
            detalle = (await respuesta.text()).trim();
        } catch (errorTexto) {
            detalle = '';
        }
    }

    const retryAfter = respuesta.headers.get('retry-after');
    let mensaje;

    switch (respuesta.status) {
        case 401:
            mensaje = 'La API key no es válida. Revisa tu archivo .env.';
            break;
        case 429:
            mensaje = `Superaste el límite. Espera ${retryAfter || 'unos'} segundos e inténtalo de nuevo.`;
            break;
        case 404:
            mensaje = 'El modelo o la ruta de la API no existe. Revisa MODEL y API_URL en tu archivo .env.';
            break;
        default:
            mensaje = `La API respondió con un error (${respuesta.status}).`;
    }

    const error = new Error(
        `${mensaje}${detalle ? ` Detalle: ${detalle}` : ''}`
    );
    error.status = respuesta.status;
    error.retryAfter = retryAfter;
    error.detalle = detalle;
    return error;
}

async function solicitarIA(mensajeSistema, mensajeUsuario) {
    if (typeof mensajeSistema !== 'string' || !mensajeSistema.trim()) {
        throw new Error('El mensaje de sistema no puede estar vacío.');
    }

    if (typeof mensajeUsuario !== 'string' || !mensajeUsuario.trim()) {
        throw new Error('El mensaje de usuario no puede estar vacío.');
    }

    const { apiKey, apiUrl, modelo } = validarConfiguracion();
    let respuesta;

    try {
        respuesta = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: modelo,
                messages: [
                    { role: 'system', content: mensajeSistema },
                    { role: 'user', content: mensajeUsuario }
                ]
            }),
            signal: AbortSignal.timeout(TIMEOUT_MS)
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
        throw new Error('La API devolvió una respuesta que no es un JSON válido.');
    }

    const texto = datos?.choices?.[0]?.message?.content;

    if (typeof texto !== 'string' || !texto.trim()) {
        throw new Error('La API no devolvió texto. Revisa la respuesta del servidor.');
    }

    return {
        texto: texto.trim(),
        usage: datos.usage || null,
        modelo: datos.model || modelo
    };
}

async function preguntarIA(mensajeSistema, mensajeUsuario) {
    const resultado = await solicitarIA(mensajeSistema, mensajeUsuario);
    return resultado.texto;
}

module.exports = {
    preguntarIA,
    solicitarIA,
    crearErrorDeRed,
    crearErrorDeRespuesta,
    TIMEOUT_MS
};
