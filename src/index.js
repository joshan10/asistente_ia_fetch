const fs = require('fs');
const path = require('path');
const { solicitarIA } = require('./ia');

const MAX_CARACTERES = 6000;
const RUTA_DATA = path.join(__dirname, '..', 'data');
const RUTA_HISTORIAL = path.join(RUTA_DATA, 'historial.json');

const MODOS = {
    resumir: 'Eres un asistente que resume apuntes de programación. Resume el texto en un máximo de 5 viñetas claras, en español. Conserva los conceptos, comandos y nombres importantes. No inventes información. Devuelve únicamente el resumen.',
    explicar: 'Eres un docente de programación. Explica el texto como si el lector estuviera empezando a programar, en español, con ejemplos sencillos y un lenguaje claro. Devuelve únicamente la explicación.',
    preguntas: 'Genera exactamente 3 preguntas de repaso con su respuesta, en español, a partir del texto. Numéralas y separa claramente cada pregunta de su respuesta. Devuelve únicamente las preguntas y respuestas.',
    traducir: 'Traduce el texto al inglés conservando el formato, los títulos, las listas y los bloques de código. Devuelve únicamente la traducción.'
};

function mostrarUso() {
    console.log('Uso:');
    console.log('  node src/index.js <archivo> [modo]');
    console.log('  node src/index.js historial');
    console.log('');
    console.log('Modos válidos: resumir (por defecto), explicar, preguntas, traducir');
    console.log('');
    console.log('Ejemplos:');
    console.log('  npm start -- apuntes/sesion_fs.txt resumir');
    console.log('  npm start -- apuntes/sesion_fs.txt preguntas');
    console.log('  npm start -- historial');
}

function rutaVisible(ruta) {
    const relativa = path.relative(process.cwd(), ruta);
    return relativa && !relativa.startsWith('..') ? relativa : ruta;
}

function leerHistorial() {
    if (!fs.existsSync(RUTA_HISTORIAL)) {
        return [];
    }

    let contenido;

    try {
        contenido = fs.readFileSync(RUTA_HISTORIAL, 'utf8').trim();
    } catch (error) {
        console.warn(`No se pudo leer el historial: ${error.message}`);
        return [];
    }

    if (!contenido) {
        return [];
    }

    try {
        const registros = JSON.parse(contenido);

        if (!Array.isArray(registros)) {
            throw new Error('El contenido no es un arreglo.');
        }

        return registros;
    } catch (error) {
        const respaldo = `${RUTA_HISTORIAL}.danado-${Date.now()}.json`;

        try {
            fs.copyFileSync(RUTA_HISTORIAL, respaldo);
            console.warn(`El historial estaba dañado. Se guardó una copia en ${rutaVisible(respaldo)}.`);
        } catch (errorRespaldo) {
            console.warn('El historial estaba dañado y no se pudo crear una copia de respaldo.');
        }

        return [];
    }
}

function guardarHistorial(registros) {
    fs.mkdirSync(RUTA_DATA, { recursive: true });
    fs.writeFileSync(RUTA_HISTORIAL, `${JSON.stringify(registros, null, 2)}\n`, 'utf8');
}

function registrarEjecucion(registro) {
    try {
        const registros = leerHistorial();
        registros.push(registro);
        guardarHistorial(registros);
    } catch (error) {
        console.warn(`No se pudo guardar el historial: ${error.message}`);
    }
}

function mostrarHistorial() {
    const registros = leerHistorial();

    if (registros.length === 0) {
        console.log('Todavía no hay ejecuciones registradas.');
        return;
    }

    console.log('Últimas 5 ejecuciones:\n');

    registros.slice(-5).forEach((registro, indice) => {
        const fecha = registro.fecha
            ? new Date(registro.fecha).toLocaleString('es-CO')
            : 'Sin fecha';
        const tokens = registro.tokensUsados ?? 'No informados';

        console.log(`${indice + 1}. ${fecha}`);
        console.log(`   Archivo: ${registro.archivo}`);
        console.log(`   Modo: ${registro.modo}`);
        console.log(`   Modelo: ${registro.modelo}`);
        console.log(`   Caracteres: ${registro.caracteresEntrada} de entrada, ${registro.caracteresSalida} de salida`);
        console.log(`   Tokens usados: ${tokens}`);
        console.log('');
    });
}

function construirRutaSalida(rutaEntrada, modo) {
    const directorio = path.dirname(rutaEntrada);
    const extension = path.extname(rutaEntrada);
    const nombre = path.basename(rutaEntrada, extension);

    return path.join(directorio, `${nombre}_${modo}.txt`);
}

async function procesarArchivo(rutaEntrada, modo, archivoOriginal) {
    if (!fs.existsSync(rutaEntrada)) {
        throw new Error(`No se encontró el archivo: ${archivoOriginal}`);
    }

    const informacion = fs.statSync(rutaEntrada);

    if (!informacion.isFile()) {
        throw new Error(`La ruta no es un archivo: ${archivoOriginal}`);
    }

    const contenido = await fs.promises.readFile(rutaEntrada, 'utf8');

    if (!contenido.trim()) {
        throw new Error(`El archivo está vacío: ${archivoOriginal}`);
    }

    let textoParaEnviar = contenido;

    if (contenido.length > MAX_CARACTERES) {
        textoParaEnviar = contenido.slice(0, MAX_CARACTERES);
        console.warn(`Aviso: el archivo tiene ${contenido.length} caracteres. Solo se enviarán los primeros ${MAX_CARACTERES}.`);
    }

    const resultado = await solicitarIA(MODOS[modo], textoParaEnviar);
    const rutaSalida = construirRutaSalida(rutaEntrada, modo);

    await fs.promises.writeFile(rutaSalida, `${resultado.texto}\n`, 'utf8');

    console.log(resultado.texto);
    console.log(`\nResultado guardado en: ${rutaVisible(rutaSalida)}`);

    registrarEjecucion({
        fecha: new Date().toISOString(),
        archivo: archivoOriginal,
        modo,
        modelo: resultado.modelo,
        caracteresEntrada: contenido.length,
        caracteresSalida: resultado.texto.length,
        tokensUsados: resultado.usage?.total_tokens ?? null
    });
}

async function main() {
    const argumentos = process.argv.slice(2);

    if (argumentos.length === 0) {
        mostrarUso();
        process.exitCode = 1;
        return;
    }

    const [archivoOriginal, modoArgumento] = argumentos;

    if (archivoOriginal.toLowerCase() === 'historial') {
        mostrarHistorial();
        return;
    }

    const modo = (modoArgumento || 'resumir').toLowerCase();

    if (!Object.hasOwn(MODOS, modo)) {
        console.error(`El modo "${modo}" no existe.`);
        console.error(`Modos válidos: ${Object.keys(MODOS).join(', ')}.`);
        process.exitCode = 1;
        return;
    }

    await procesarArchivo(path.resolve(archivoOriginal), modo, archivoOriginal);
}

main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
});
