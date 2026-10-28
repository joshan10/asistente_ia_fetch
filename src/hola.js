const path = require('path');

try {
    process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch (error) {
}

async function main() {
    const respuesta = await fetch(process.env.API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
            model: process.env.MODEL,
            messages: [
                { role: 'user', content: 'Explícame en una frase qué es Node.js' }
            ]
        })
    });

    const datos = await respuesta.json();

    console.log('Status HTTP:', respuesta.status);
    console.log(JSON.stringify(datos, null, 2));

    if (respuesta.ok) {
        console.log('\nTexto de la IA:', datos.choices?.[0]?.message?.content);
    } else {
        console.log('\nLa API devolvió un error. Revisa el status y el mensaje anteriores.');
    }
}

main().catch((error) => {
    console.error('Error de conexión:', error.message);
    process.exitCode = 1;
});
