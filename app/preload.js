// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld("athena", {
    registerListenerForTimerTickFromMain: (callback) => {
        // callback is setTimer
        const fn = (event, message) => {
            callback(message);
        }

        ipcRenderer.on('timer', fn);

        return () => {
            ipcRenderer.removeListener('timer', fn);
        }
    },
    startTimerOnMain: () => {
        try {
            return ipcRenderer.invoke('start-timer');
        } catch {
            throw "error";
        }
    },
    stopTimerOnMain: () => {
        try {
            return ipcRenderer.invoke('stop-timer');
        } catch {
            throw "error";
        }
    },

    // New Preload Functions

    // Functions related to capturing camera snaps of user
    registerListenerForCameraSnapFromMain: (callback) => {
        ipcRenderer.on('camera-shot', callback);

        return () => {
            ipcRenderer.removeListener('camera-shot', callback);
        }
    },

    storeCameraSnapImageOnDisk: (data, customDir) => {
        return ipcRenderer.invoke('store-camera-snap-image-on-disk', data, customDir);
    },

    // Functions related to capturing screen snaps of user
    registerListenerForScreenSnapFromMain: (callback) => {
        ipcRenderer.on('screen-shot', callback);

        return () => {
            ipcRenderer.removeListener('screen-shot', callback);
        }
    },

    storeScreenSnapImageOnDisk: (data, customDir) => {
        return ipcRenderer.invoke('store-screen-snap-image-on-disk', data, customDir);
    },

    captureScreenSnap: (customDir) => {
        return ipcRenderer.invoke('capture-screen-snap', customDir);
    },

    // Directory selection functions
    selectDirectory: (defaultPath) => {
        return ipcRenderer.invoke('select-directory', defaultPath);
    },
    getDirectories: () => {
        return ipcRenderer.invoke('get-directories');
    },
    setCameraDirectory: (dir) => {
        return ipcRenderer.invoke('set-camera-directory', dir);
    },
    setScreenDirectory: (dir) => {
        return ipcRenderer.invoke('set-screen-directory', dir);
    },

    // Kiosk Mode functions
    setKiosk: (flag = true) => {
        return ipcRenderer.invoke('set-kiosk', flag);
    },
    isKiosk: () => {
        return ipcRenderer.invoke('is-kiosk');
    },

    // Focus and Blur detection
    onWindowBlur: (callback) => {
        const fn = () => callback();
        ipcRenderer.on('window-blur', fn);
        return () => {
            ipcRenderer.removeListener('window-blur', fn);
        };
    },
    onWindowFocus: (callback) => {
        const fn = () => callback();
        ipcRenderer.on('window-focus', fn);
        return () => {
            ipcRenderer.removeListener('window-focus', fn);
        };
    },

    // Functions related to showing Contest Rules in a new Dialog
    showRules: () => {
        ipcRenderer.send("show-rules");
    }
})
