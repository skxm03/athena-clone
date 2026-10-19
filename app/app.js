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
        kiosk: true,
        webPreferences: {
            devTools: true,
            preload: path.join(import.meta.dirname, 'preload.js')
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

async function captureScreenSnap() {
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
            const dir = path.join(import.meta.dirname, "user-screen-snap");
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
        await captureScreenSnap();
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

ipcMain.handle('store-camera-snap-image-on-disk', (_event, data) => {
    const dir = path.join(import.meta.dirname, "user-camera-snap");
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const filePath = path.join(dir, `${Date.now()}.jpg`);
    fs.writeFileSync(filePath, Buffer.from(data));
});

ipcMain.handle('store-screen-snap-image-on-disk', (_event, data) => {
    const dir = path.join(import.meta.dirname, "user-screen-snap");
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const filePath = path.join(dir, `${Date.now()}.jpg`);
    fs.writeFileSync(filePath, Buffer.from(data));
});

ipcMain.handle('capture-screen-snap', async () => {
    return await captureScreenSnap();
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