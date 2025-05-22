// StarWars API Code
// This code intentionally violates clean code principles for refactoring practice

const http = require('http');
const https = require('https');

const TEMPO_LIMITE = 5000;
const LIMITE_EXIBICAO_NAVES = 3;
const LIMITE_POPULACAO_PLANETA = 1_000_000_000;
const LIMITE_DIAMETRO_PLANETA = 10_000;
const MAXIMO_ID_VEICULO = 4;
const PORTA = 3003;

const config = {
    debug: !process.argv.includes('--no-debug'),
    timeout: TEMPO_LIMITE,
};

const args = process.argv.slice(2);
if (args.includes('--tempoLimite')) {
    const index = args.indexOf('--tempoLimite');
    if (index < args.length - 1) {
        config.timeout = parseInt(args[index + 1], 10);
    }
}

function criarSwapiClient(config) {
    const cache = {};
    let totalErros = 0;

    async function buscar(endpoint) {
        if (cache[endpoint]) {
            if (config.debug) console.log("Using cached data for", endpoint);
            return cache[endpoint];
        }

        return new Promise((resolve, reject) => {
            let dadosBrutos = '';
            const req = https.get(`https://swapi.dev/api/${endpoint}`, { rejectUnauthorized: false }, (res) => {
                if (res.statusCode >= 400) {
                    totalErros++;
                    return reject(new Error(`Request failed with status code ${res.statusCode}`));
                }

                res.on('data', chunk => dadosBrutos += chunk);
                res.on('end', () => {
                    try {
                        const dados = JSON.parse(dadosBrutos);
                        cache[endpoint] = dados; // Cache the result
                        resolve(dados);
                        if (config.debug) {
                            console.log(`Fetched ${endpoint} successfully`);
                            console.log(`Cache size: ${Object.keys(cache).length}`);
                        }
                    } catch (err) {
                        totalErros++;
                        reject(err);
                    }
                });
            });

            req.setTimeout(config.timeout, () => {
                req.abort();
                totalErros++;
                reject(new Error(`Timeout for ${endpoint}`));
            });

            req.on('error', err => {
                totalErros++;
                reject(err);
            });
        });
    }

    function getEstatisticas() {
        return {
            cacheSize: Object.keys(cache).length,
            erros: totalErros
        };
    }

    return { buscar, getEstatisticas };
}

async function buscarEDispararDados(swapiClient, idPersonagem = 1) {
    let tamanhoTotal = 0;
    let chamadas = 0;

    try {
        if (config.debug) console.log("Starting data fetch...");
        chamadas++;

        const personagem = await swapiClient.buscar(`people/${idPersonagem}`);
        tamanhoTotal += JSON.stringify(personagem).length;
        console.log('Character:', personagem.name);
        console.log('Height:', personagem.height);
        console.log('Mass:', personagem.mass);
        console.log('Birthday:', personagem.birth_year);
        if (personagem.films?.length) {
            console.log('Appears in', personagem.films.length, 'films');
        }

        const naves = await swapiClient.buscar('starships/?page=1');
        tamanhoTotal += JSON.stringify(naves).length;
        console.log('\nTotal Starships:', naves.count);

       // Print first 3 starships with details
        for (let i = 0; i < LIMITE_EXIBICAO_NAVES && i < naves.results.length; i++) {
            const nave = naves.results[i];
            console.log(`\nStarship ${i + 1}:`);
            console.log('Name:', nave.name);
            console.log('Model:', nave.model);
            console.log('Manufacturer:', nave.manufacturer);
            console.log('Cost:', nave.cost_in_credits !== 'unknown' ? nave.cost_in_credits + ' credits' : 'unknown');
            console.log('Speed:', nave.max_atmosphering_speed);
            console.log('Hyperdrive Rating:', nave.hyperdrive_rating);
            if (nave.pilots?.length) {
                console.log('Pilots:', nave.pilots.length);
            }
         }

        // Find planets with population > 1000000000 and diameter > 10000
        const planets = await swapiClient.buscar('planets/?page=1');
        tamanhoTotal += JSON.stringify(planets).length;
        console.log('\nLarge populated planets:');
        planets.results.forEach(planeta => {
            if (
                planeta.population !== 'unknown' && parseInt(planeta.population) > LIMITE_POPULACAO_PLANETA &&
                planeta.diameter !== 'unknown' && parseInt(planeta.diameter) > LIMITE_DIAMETRO_PLANETA
            ) {
                console.log(`${planeta.name} - Pop: ${planeta.population} - Diameter: ${planeta.diameter} - Climate: ${planeta.climate}`);
                // Check if it appears in any films
                if (planeta.films?.length) {
                    console.log(`  Appears in ${planeta.films.length} films`);
                }
            }
        });

        // Get films and sort by release date, then print details
        const filmes = await swapiClient.buscar('films/');
        tamanhoTotal += JSON.stringify(filmes).length;
        const filmList = filmes.results.sort((a, b) => new Date(a.release_date) - new Date(b.release_date));

        console.log('\nStar Wars Films in chronological order:');
        filmList.forEach((filme, i) => {
            console.log(`${i + 1}. ${filme.title} (${filme.release_date})`);
            console.log(`   Director: ${filme.director}`);
            console.log(`   Producer: ${filme.producer}`);
            console.log(`   Characters: ${filme.characters.length}`);
            console.log(`   Planets: ${filme.planets.length}`);
        });

        // Get a vehicle and display details
        if (idPersonagem <= MAXIMO_ID_VEICULO) {
            const veiculo = await swapiClient.buscar(`vehicles/${idPersonagem}`);
            tamanhoTotal += JSON.stringify(veiculo).length;
            console.log('\nFeatured Vehicle:');
            console.log('Name:', veiculo.name);
            console.log('Model:', veiculo.model);
            console.log('Manufacturer:', veiculo.manufacturer);
            console.log('Cost:', veiculo.cost_in_credits, 'credits');
            console.log('Length:', veiculo.length);
            console.log('Crew Required:', veiculo.crew);
            console.log('Passengers:', veiculo.passengers);
        }
        
        // Print stats
        if (config.debug) {
            const stats = swapiClient.getEstatisticas();
            console.log('\nStats:');
            console.log('API Calls:', chamadas);
            console.log('Cache Size:', stats.cacheSize);
            console.log('Total Data Size:', tamanhoTotal, 'bytes');
            console.log('Error Count:', stats.erros);
        }

    } catch (erro) {
        console.error('Error:', erro.message);
    }
}
const swapiClient = criarSwapiClient(config);

// Create a simple HTTP server to display the results
const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
        const stats = swapiClient.getEstatisticas();
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
            <!DOCTYPE html>
            <html>
                <head>
                    <title>Star Wars API Demo</title>
                    <style>
                        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
                        h1 { color: #FFE81F; background-color: #000; padding: 10px; }
                        button { background-color: #FFE81F; border: none; padding: 10px 20px; cursor: pointer; }
                        .footer { margin-top: 50px; font-size: 12px; color: #666; }
                        pre { background: #f4f4f4; padding: 10px; border-radius: 5px; }
                    </style>
                </head>
                <body>
                    <h1>Star Wars API Demo</h1>
                    <p>This page demonstrates fetching data from the Star Wars API.</p>
                    <p>Check your console for the API results.</p>
                    <button onclick="fetchData()">Fetch Star Wars Data</button>
                    <div id="results"></div>
                    <script>
                        function fetchData() {
                            document.getElementById('results').innerHTML = '<p>Loading data...</p>';
                            fetch('/api')
                                .then(res => res.text())
                                .then(text => {
                                    alert('API request made! Check server console.');
                                    document.getElementById('results').innerHTML = '<p>Data fetched! Check server console.</p>';
                                })
                                .catch(err => {
                                    document.getElementById('results').innerHTML = '<p>Error: ' + err.message + '</p>';
                                });
                        }
                    </script>
                    <div class="footer">
                        <p>API calls: N/A (now counted per request) | Cache entries: ${stats.cacheSize} | Errors: ${stats.erros}</p>
                        <pre>Debug mode: ${config.debug ? 'ON' : 'OFF'} | Timeout: ${config.timeout}ms</pre>
                    </div>
                </body>
            </html>
        `);
    } else if (req.url === '/api') {
        buscarEDispararDados(swapiClient);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Check server console for results');
    } else if (req.url === '/stats') {
        const stats = swapiClient.getEstatisticas();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            cache_size: stats.cacheSize,
            errors: stats.erros,
            debug: config.debug,
            tempoLimite: config.timeout
        }));
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

const PORT = process.env.PORT || PORTA;
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    console.log('Open the URL in your browser and click the button to fetch Star Wars data');
    if (config.debug) {
        console.log('Debug mode: ON');
        console.log('Timeout:', config.timeout, 'ms');
    }
});