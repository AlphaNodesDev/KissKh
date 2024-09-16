const { ipcRenderer } = require('electron');

window.addEventListener('DOMContentLoaded', () => {
    const currentTitle = document.title;
    ipcRenderer.send('set-current-drama-title', currentTitle);
});
