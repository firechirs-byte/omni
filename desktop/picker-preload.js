/* Preload for the screen-share picker only. The chat window does not load this.
   It can report a chosen source id and nothing else. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('omniPicker', {
  onSources(callback) {
    ipcRenderer.on('omni-desktop-picker-sources', (_event, sources) => {
      if (typeof callback === 'function') callback(Array.isArray(sources) ? sources : []);
    });
  },
  choose(id) {
    ipcRenderer.send('omni-desktop-picker-choice', typeof id === 'string' ? id : '');
  }
});
