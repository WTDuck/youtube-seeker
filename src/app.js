const fs = require('fs');
const puppeteer = require('puppeteer');
const Papa = require('papaparse');

let result = [];
let songs = [
];
let currentType = 'C';
let currentSongIndex = 0;
let correctKeyPressed = false;
let pause = false;

function youtubifyStr(str) {
    return str.toLowerCase().replace(/\s/g, '+')
}

function typeStr(type) {
    switch (type) {
        case 'D':
            return 'lyrics';
        case 'Z':
            return 'official mv';
        case 'C':
            return 'topic';
        default:
            return '';

    }
}

function keyHandler(keyCode) {
    correctKeyPressed = true;
    switch (keyCode) {
        case 115: // S, skip
            console.log(`(${currentSongIndex + 1}/${songs.length}) skipping`);
            currentType = 'S';
            result[currentSongIndex] = {
                ...songs[currentSongIndex],
                'Mp3 Link to add': 'none',
                'Type': 'none',
                'Memo': 'not found'
            };
            currentSongIndex += 1;
            currentType = 'C';
            break;
        case 99:
            currentType = 'C';
            console.log('switch to:', typeStr(currentType));
            break;
        case 100:
            currentType = 'D';
            console.log('switch to:', typeStr(currentType));
            break;
        case 122:
            currentType = 'Z';
            console.log('switch to:', typeStr(currentType));
            break;
        case 112:
            pause = true;
            break;
        default:
            correctKeyPressed = false;
    }
}

async function navigate (page) {
    if (currentSongIndex >= songs.length || pause) {
        await parseJSON(result);
        return page.browser().close();

    }
    let song = songs[currentSongIndex];
    while (song['Mp3 Link to add'] != null && song['Mp3 Link to add'] !== '') {
        console.log(`(${currentSongIndex + 1}/${songs.length}) skipping`);
        currentSongIndex += 1;
        song = songs[currentSongIndex];
    }
    const artist = song['Artist Track on iTunes'];
    const title = song['Song Title on Itunes'];
    const url = `${youtubifyStr(artist)}+${youtubifyStr(title)}+${typeStr(currentType)}`;
    await page.goto('https://youtube.com/results?search_query=' + url);
    page.evaluate(() => {
        window.document.body.onkeypress = (k) => {
            console.log('keypress', k.keyCode)
        }
    });
}

async function routine() {
    const browser = await puppeteer.launch({ headless: false, defaultViewport: null });
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('console', msg => {
        // keyPress Handler
        if (msg.args().length !== 2) { return }
        const slug = msg.args()[0]._remoteObject.value || undefined;
        const key = msg.args()[1]._remoteObject.value || undefined;
        if (slug && key && slug === 'keypress') {
            keyHandler(key);
            if (!correctKeyPressed) return;
            navigate(page)
        }
    });
    page.on('request', async (request) => {
        if (request && request.url && request.url()) {
            if (request.url().includes && request.url().includes('youtube.com/watch')) {
                const videoURL = new URL(request.url());
                videoURL.searchParams.delete('pbj');
                console.log(`(${currentSongIndex + 1}/${songs.length}) adding : ${videoURL.toString()}`);
                result[currentSongIndex] = {
                    ...songs[currentSongIndex],
                    'Mp3 Link to add': videoURL.toString(),
                    'Type': currentType
                };
                currentSongIndex += 1;
                currentType = 'C';
                await navigate(page)
            }
        }
        request.continue()
    });
    await navigate(page);
}

const readCSV = async (filePath) => {
    const csvFile = fs.readFileSync(filePath);
    const csvData = csvFile.toString();
    return new Promise(resolve => {
        Papa.parse(csvData, {
            header: true,
            complete: results => {
                console.log('Loaded', results.data.length, 'records.');
                resolve(results.data);
            }
        });
    });
};

const parseJSON = async (json) => {
    const csvContent = await Papa.unparse(json);
    fs.writeFile('output.csv', csvContent, err => {
        if (err) console.error(err);
        console.log('output.csv happen created !')
    })
};


(async () => {
    const [_u, _t, file = ''] = process.argv;
    if (!file) { console.error('invalid file'); return; }
    songs = await readCSV(file);
    result = [...songs];
    await routine()
})();
