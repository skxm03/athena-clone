import { app, BrowserWindow, ipcMain, dialog, desktopCapturer, screen } from "electron";
import path from "path";
import fs from "fs";
import { Buffer } from "buffer";

let electronWindow = null;
let startTimestamp = null;

function createWindow() {
    electronWindow = new BrowserWindow({
        height: 1000,
        width: 1000,
        webPreferences: {
            devTools: true,
            preload: path.join(import.meta.dirname, 'preload.js')
        }
    });

    electronWindow.on('blur', () => {
        if (electronWindow && !electronWindow.isDestroyed()) {
            electronWindow.webContents.send('window-blur');
        }
    });

    electronWindow.on('focus', () => {
        if (electronWindow && !electronWindow.isDestroyed()) {
            electronWindow.webContents.send('window-focus');
        }
    });

    electronWindow.loadURL('http://localhost:5173');
}

ipcMain.handle('set-kiosk', (_event, flag = true) => {
    if (electronWindow && !electronWindow.isDestroyed()) {
        electronWindow.setKiosk(flag);
        return electronWindow.isKiosk();
    }
    return false;
});

ipcMain.handle('is-kiosk', () => {
    if (electronWindow && !electronWindow.isDestroyed()) {
        return electronWindow.isKiosk();
    }
    return false;
});

let cameraSnapDir = path.join(import.meta.dirname, "user-camera-snap");
let screenSnapDir = path.join(import.meta.dirname, "user-screen-snap");

ipcMain.handle('select-directory', async (_event, defaultPath) => {
    const result = await dialog.showOpenDialog(electronWindow, {
        title: "Select Directory to Save Snapshots",
        defaultPath: defaultPath || import.meta.dirname,
        properties: ['openDirectory', 'createDirectory']
    });
    if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
        return result.filePaths[0];
    }
    return null;
});

ipcMain.handle('get-directories', () => {
    return {
        cameraDir: cameraSnapDir,
        screenDir: screenSnapDir
    };
});

ipcMain.handle('set-camera-directory', (_event, newDir) => {
    if (newDir && typeof newDir === 'string') {
        cameraSnapDir = newDir;
        if (!fs.existsSync(cameraSnapDir)) {
            fs.mkdirSync(cameraSnapDir, { recursive: true });
        }
        return cameraSnapDir;
    }
    return cameraSnapDir;
});

ipcMain.handle('set-screen-directory', (_event, newDir) => {
    if (newDir && typeof newDir === 'string') {
        screenSnapDir = newDir;
        if (!fs.existsSync(screenSnapDir)) {
            fs.mkdirSync(screenSnapDir, { recursive: true });
        }
        return screenSnapDir;
    }
    return screenSnapDir;
});

async function captureScreenSnap(customDir) {
    try {
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width, height } = primaryDisplay.size;
        const scaleFactor = primaryDisplay.scaleFactor || 1;
        const thumbnailSize = {
            width: Math.round(width * scaleFactor),
            height: Math.round(height * scaleFactor)
        };

        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize
        });

        if (sources.length > 0) {
            const buffer = sources[0].thumbnail.toJPEG(80);
            const dir = customDir || screenSnapDir;
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            const filePath = path.join(dir, `${Date.now()}.jpg`);
            fs.writeFileSync(filePath, buffer);
            return filePath;
        }
    } catch (err) {
        console.error("Failed to capture screen using desktopCapturer:", err);
    }
}

let timerInterval = null;
let cameraInterval = null;
let screenInterval = null;

function clearTimers() {
    if (timerInterval) clearInterval(timerInterval);
    if (cameraInterval) clearInterval(cameraInterval);
    if (screenInterval) clearInterval(screenInterval);
    timerInterval = null;
    cameraInterval = null;
    screenInterval = null;
}

ipcMain.handle('start-timer', () => {
    clearTimers();
    startTimestamp = Date.now();

    // Send Timer Tick every 1s
    timerInterval = setInterval(() => {
        if (electronWindow && !electronWindow.isDestroyed()) {
            electronWindow.webContents.send('timer', Math.floor((Date.now() - startTimestamp) / 1000));
        }
    }, 1000);

    // Capture user's camera snap every 5s
    cameraInterval = setInterval(() => {
        if (electronWindow && !electronWindow.isDestroyed()) {
            electronWindow.webContents.send('camera-shot');
        }
    }, 5000);

    // Capture user's screen snap every 5s using desktopCapturer
    screenInterval = setInterval(async () => {
        await captureScreenSnap(screenSnapDir);
        if (electronWindow && !electronWindow.isDestroyed()) {
            electronWindow.webContents.send('screen-shot');
        }
    }, 5000);
});

ipcMain.handle('stop-timer', () => {
    clearTimers();
    startTimestamp = null;
    return true;
});

ipcMain.handle('store-camera-snap-image-on-disk', (_event, data, customDir) => {
    const dir = customDir || cameraSnapDir;
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const filePath = path.join(dir, `${Date.now()}.jpg`);
    fs.writeFileSync(filePath, Buffer.from(data));
    return filePath;
});

ipcMain.handle('store-screen-snap-image-on-disk', (_event, data, customDir) => {
    const dir = customDir || screenSnapDir;
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const filePath = path.join(dir, `${Date.now()}.jpg`);
    fs.writeFileSync(filePath, Buffer.from(data));
    return filePath;
});

ipcMain.handle('capture-screen-snap', async (_event, customDir) => {
    return await captureScreenSnap(customDir);
});

ipcMain.on("show-rules", () => {
    dialog.showMessageBox(electronWindow, {
        type: "info",
        title: "Athena Exam Rules",
        message: "Exam Rules",
        detail:
            "1. Stay on the exam screen.\n" +
            "2. Camera must remain enabled.\n" +
            "3. Do not leave the exam.\n" +
            "4. Do not use external assistance.\n" +
            "5. Click Exit Exam when finished."
    });
});

app.whenReady().then(createWindow);