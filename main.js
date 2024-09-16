const { app, BrowserWindow, session, Menu, shell, ipcMain } = require('electron');
const { ElectronBlocker } = require('@cliqz/adblocker-electron');
const fetch = require('cross-fetch');
const path = require('path');
const RPC = require('discord-rpc');

// 
const clientId = '';


RPC.register(clientId);
const rpc = new RPC.Client({ transport: 'ipc' });

let currentUrl = ''; // Global current URL
let currentDramaTitle = ''; // Global current drama title
let currentDramaImage = ''; // Global current drama image URL
let delayTimeout = 500; // Delay timeout in milliseconds
let adblockerEnabled = true; // Toggle adblocker state
let blocker = null; // Placeholder for adblocker instance

async function setRichPresence() {
    try {
        await rpc.setActivity({
            details: `Watching on KissKh`,
            state: `${currentDramaTitle}`,
            startTimestamp: new Date(),
            largeImageKey: currentDramaImage || 'https://i.ibb.co/hy1CXy6/images.png',
            largeImageText: 'Watching Asian Dramas',
            smallImageKey: 'https://i.ibb.co/hy1CXy6/images.png',
            smallImageText: 'Enjoying the show!',
            buttons: [
                { label: 'Watch Now', url: currentUrl || 'https://kisskh.co/' }
            ],
            instance: true
        });

        console.log(`Rich Presence updated with drama: ${currentDramaTitle}, URL: ${currentUrl}`);
    } catch (error) {
        console.error('Error setting Rich Presence:', error);
    }
}

async function fetchDramaImage(webContents) {
    return webContents.executeJavaScript(`
        (() => {
            const videoElement = document.querySelector('video');
            if (videoElement && videoElement.hasAttribute('poster')) {
                return videoElement.getAttribute('poster');
            } else {
                return '';
            }
        })();
    `);
}

async function fetchDramaImageWithRetry(webContents, retries = 5, delay = 500) {
    let attempt = 0;

    return new Promise((resolve, reject) => {
        const checkVideoPoster = async () => {
            try {
                const poster = await webContents.executeJavaScript(`
                    (() => {
                        const videoElement = document.querySelector('video');
                        return videoElement && videoElement.hasAttribute('poster') ? videoElement.getAttribute('poster') : '';
                    })();
                `);

                if (poster || attempt >= retries) {
                    resolve(poster);
                } else {
                    attempt++;
                    setTimeout(checkVideoPoster, delay); 
                }
            } catch (error) {
                reject(error);
            }
        };

        checkVideoPoster();
    });
}

async function fetchDynamicTitleAndImageWithDelay(webContents) {
    return new Promise((resolve, reject) => {
        setTimeout(async () => {
            try {
                const title = await webContents.executeJavaScript('document.title');
                const image = await fetchDramaImage(webContents);
                resolve({ title: title || 'KissKh', image });
            } catch (error) {
                reject('Error fetching dynamic title and image:', error);
            }
        }, delayTimeout); 
    });
}


async function handleUrlChange(webContents, url) {
    currentUrl = url; 

    try {
        const { title, image } = await fetchDynamicTitleAndImageWithDelay(webContents); 
        const dramaImage = await fetchDramaImageWithRetry(webContents);
        currentDramaTitle = title; 
        currentDramaImage = dramaImage || 'https://i.ibb.co/hy1CXy6/images.png';
        setRichPresence();
    } catch (error) {
        console.error('Error fetching dynamic drama title and image from page:', error);
    }
}

function toggleAdBlocker(enabled) {
    adblockerEnabled = enabled;
    const ses = session.defaultSession;

    if (enabled) {
        ElectronBlocker.fromPrebuiltAdsAndTracking(fetch).then(instance => {
            blocker = instance;
            blocker.enableBlockingInSession(ses);
            console.log('AdBlocker enabled.');
        }).catch(err => {
            console.error('Failed to enable AdBlocker:', err);
        });
    } else {
        if (blocker) {
            blocker.disableBlockingInSession(ses);
            console.log('AdBlocker disabled.');
        }
    }
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1000,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, 'src/assets/icon.ico')
    });

    win.loadFile('src/views/index.html');

    setTimeout(() => {
        win.loadURL('https://kisskh.co/');
    }, 100);

    win.webContents.on('did-navigate', (event, url) => {
        handleUrlChange(win.webContents, url); 
    });

    win.webContents.on('did-navigate-in-page', (event, url) => {
        handleUrlChange(win.webContents, url); 
    });

    toggleAdBlocker(adblockerEnabled); 

    createMenu(win);
}

rpc.on('ready', () => {
    setRichPresence().catch(console.error);
});

function loginToDiscord(clientId) {
    rpc.login({ clientId }).catch((error) => {
        console.error('Discord RPC login failed, retrying...', error);
        setTimeout(() => loginToDiscord(clientId), 5000); 
    });
}

loginToDiscord(clientId); 

function createMenu(win) {
    const menuTemplate = [
        {
            label: 'File',
            submenu: [
                { label: 'Quit', role: 'quit' }
            ]
        },
        {
            label: 'Settings',
            submenu: [
                {
                    label: 'Enable Adblocker',
                    type: 'checkbox',
                    checked: adblockerEnabled,
                    click: (menuItem) => {
                        toggleAdBlocker(menuItem.checked);
                    }
                }
            ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'GitHub Page',
                    click: () => {
                        shell.openExternal('https://github.com/AlphaNodesDev');
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);
}

app.on('ready', createWindow);
