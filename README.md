# asistente-ia

Herramienta de consola en Node.js que lee un archivo de apuntes, lo envía a una API de inteligencia artificial compatible con OpenAI mediante `fetch` y guarda el resultado junto al archivo de entrada.

No usa dependencias externas: el proyecto solo requiere Node.js 20.12 o superior.

## Requisitos

- Node.js 20.12 o superior (`node -v`).
- Una API key de Groq (plan gratuito) o el servicio de prueba Pollinations.

`fetch`, `FormData`, `Blob`, `AbortSignal.timeout` y `process.loadEnvFile` ya vienen incluidos en Node.js.

## Configuración

1. Copia el archivo de ejemplo:

   ```bash
   cp .env.example .env
   ```

2. Abre `.env` y escribe tu clave real:

   ```env
   GROQ_API_KEY=gsk_tu_clave
   MODEL=openai/gpt-oss-20b
   API_URL=https://api.groq.com/openai/v1/chat/completions
   ```

3. Comprueba que `.env` está ignorado por Git:

   ```bash
   git check-ignore .env
   git ls-files | grep '^\.env'
   ```

   La segunda orden solo debe mostrar `.env.example`.

### Plan B con Pollinations

Solo para las partes de texto (no para audio), cambia estos valores en `.env`:

```env
GROQ_API_KEY=sin-clave
MODEL=openai
API_URL=https://text.pollinations.ai/openai
```

## Uso

```bash
npm start -- <archivo> [modo]
```

Si no se indica el modo, se usa `resumir`.

| Modo | Resultado |
| --- | --- |
| `resumir` | Resumen en máximo 5 viñetas. |
| `explicar` | Explicación para alguien que empieza a programar. |
| `preguntas` | 3 preguntas de repaso con sus respuestas. |
| `traducir` | Traducción al inglés conservando el formato. |

Ejemplos:

```bash
npm start -- apuntes/sesion_fs.txt resumir
npm start -- apuntes/sesion_fs.txt preguntas
npm start -- apuntes/sesion_fs.txt explicar
npm start -- apuntes/sesion_fs.txt traducir
npm start -- apuntes/sesion_fs.txt
npm start -- historial
```

Cada ejecución crea un archivo junto al de entrada:

```text
apuntes/sesion_fs.txt
apuntes/sesion_fs_resumir.txt
apuntes/sesion_fs_preguntas.txt
apuntes/sesion_fs_explicar.txt
apuntes/sesion_fs_traducir.txt
```

El programa valida que el archivo exista, que no esté vacío y que el modo sea válido. Si el texto supera los 6000 caracteres, avisa y envía solo los primeros 6000 para respetar los límites del plan gratuito.

## Historial

Cada ejecución exitosa agrega un registro a `data/historial.json` con la fecha, el archivo, el modo, el modelo, los caracteres de entrada y salida, y los tokens usados cuando la API los devuelve.

```bash
npm start -- historial
```

Muestra las últimas 5 ejecuciones. Si el archivo no existe, lo informa; si está dañado, guarda una copia con extensión `.danado-<timestamp>.json` y continúa sin romperse.

## Reto de audio

El script `src/transcribir.js` usa el mismo enfoque HTTP, pero con un formulario `multipart/form-data`:

```bash
node src/transcribir.js audio/audio.mp3
```

- Envía el audio a `https://api.groq.com/openai/v1/audio/transcriptions` con `whisper-large-v3-turbo`.
- No es necesario convertir el MP3 a WAV.
- Guarda `audio/audio_transcription.txt`.
- Genera un resumen con `preguntarIA` y lo guarda en `audio/audio_resumen.txt`.
- No se establece `Content-Type` manualmente: `fetch` calcula el `boundary` del formulario.

## Estructura

```text
asistente_ia_fetch/
├── apuntes/
│   └── sesion_fs.txt
├── audio/
│   └── audio.mp3
├── data/                  # ignorado por Git
│   └── historial.json
├── src/
│   ├── hola.js
│   ├── ia.js
│   ├── index.js
│   └── transcribir.js
├── .env                   # ignorado por Git
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## Seguridad

- La clave real vive únicamente en `.env`.
- `.env` está incluido en `.gitignore`.
- `.env.example` documenta las variables sin contener secretos.
- El código nunca imprime la API key.
- Si una clave se filtra, se debe revocar en la consola de Groq y crear otra.

## Parte 6: respuestas y reflexión

### 1. Resultados del Paso 4 de la Parte 1

Con una petición correcta se obtuvo `Status HTTP: 200`. La respuesta tiene campos como `id`, `model`, `choices` y `usage`. El texto de la IA está en `choices[0].message.content`. El campo `usage` informa los tokens consumidos: `prompt_tokens`, `completion_tokens` y `total_tokens`, además de tiempos y, en este modelo, `completion_tokens_details.reasoning_tokens`.

Fallas provocadas:

- **Clave alterada:** la API respondió `401` con `Invalid API Key`. El programa lo traduce a “La API key no es válida. Revisa tu archivo .env.”.
- **Modelo inexistente:** la API respondió `404` con un mensaje del tipo “The model ... does not exist or you do not have access to it.”.
- **URL inalcanzable o mal escrita:** `fetch` lanzó un `TypeError` (`fetch failed`) antes de obtener una respuesta HTTP, por eso no hay `status`. El programa muestra “No se pudo conectar. Revisa tu internet o la API_URL.”.
- **Respuesta sin `choices`:** si la API devuelve un error y se intenta leer `datos.choices[0]`, aparece `TypeError: Cannot read properties of undefined (reading '0')`. Por eso se valida `respuesta.ok` y la forma de los datos antes de acceder a `choices`.

`method` indica la acción HTTP (`POST`), `headers` declara el tipo de contenido y la autenticación (`Content-Type` y `Authorization: Bearer ...`), y `body` lleva el JSON con el modelo y los mensajes.

### 2. ¿Por qué la clave va en `.env` y no en el código?

Porque el código se comparte, se sube a Git y se revisa con frecuencia; una clave allí queda expuesta a cualquier persona con acceso al repositorio. `.env` mantiene los secretos fuera del código y `.gitignore` evita que se suban. Si el `.env` llegara a GitHub, la clave quedaría en el historial de Git incluso si después se borra el archivo, y cualquiera podría usarla hasta que sea revocada.

### 3. ¿Por qué hay que usar `await` con `fetch` y con `respuesta.json()`?

Porque ambas funciones son asíncronas y devuelven una promesa. `fetch` resuelve con un objeto `Response`; sin `await` se obtiene una promesa y no se puede leer `respuesta.ok` ni `respuesta.status`. `respuesta.json()` también devuelve una promesa; sin `await` se obtendría la promesa en lugar del objeto con `choices` y `usage`. Además, una promesa rechazada sin manejo puede terminar en un `unhandledRejection`.

### 4. ¿Qué significa `respuesta.ok` y por qué no basta con que `fetch` no lance error?

`respuesta.ok` es `true` cuando el código HTTP está entre 200 y 299. `fetch` solo rechaza la promesa ante fallos de red, DNS, timeout o problemas al construir la petición; no lanza un error por respuestas HTTP 400, 401, 404 o 500. Por eso hay que revisar `respuesta.ok` y leer el cuerpo del error antes de intentar usar `choices`.

### 5. Comparación con la sesión 5 (gRPC + NVIDIA)

1. **Dependencias:** la sesión 5 necesitó paquetes de gRPC y de carga de protobuf; esta versión no instala nada, porque usa `fetch` nativo.
2. **Contratos y archivos:** la sesión 5 necesitó tres archivos `.proto`; aquí el contrato es una URL y un cuerpo JSON documentado por la API.
3. **Formato y transporte:** gRPC usa Protobuf binario sobre HTTP/2 y exigía convertir el audio a WAV; esta API usa JSON sobre HTTP y acepta MP3 directamente en `multipart/form-data`. También cambia la autenticación: metadatos de gRPC frente a `Authorization: Bearer` en una petición HTTP.

## Evidencias de ejecución

Salidas capturadas en la terminal:

```text
$ npm start -- apuntes/sesion_fs.txt resumir
...
Resultado guardado en: apuntes/sesion_fs_resumir.txt

$ npm start -- historial
Últimas 5 ejecuciones:
1. ... Modo: resumir ... Tokens usados: 1409
2. ... Modo: preguntas ... Tokens usados: 1289
3. ... Modo: explicar ... Tokens usados: 2476
4. ... Modo: traducir ... Tokens usados: 2089
```

Errores provocados:

```text
Clave inválida -> status: 401
La API key no es válida. Revisa tu archivo .env. Detalle: Invalid API Key

Modelo inválido -> status: 404
El modelo o la ruta de la API no existe. Revisa MODEL y API_URL en tu archivo .env.

URL inalcanzable -> status: undefined, code: NETWORK
No se pudo conectar. Revisa tu internet o la API_URL.
```

El caso `429` se verificó con un servidor local simulado que devolvía `retry-after: 7`; el programa respondió: “Superaste el límite. Espera 7 segundos e inténtalo de nuevo.”. El timeout también se probó con un servidor local que no respondía: a los 30 segundos se obtuvo “La API tardó demasiado en responder.”.

Transcripción de audio:

```text
$ node src/transcribir.js audio/audio.mp3
Transcripción guardada en: audio/audio_transcription.txt
Resumen guardado en: audio/audio_resumen.txt
```
