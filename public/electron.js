const {
  app,
  BrowserWindow,
  session,
  ipcMain,
  desktopCapturer,
  screen,
  clipboard,
} = require("electron");
const path = require("path");
const isDev = require("electron-is-dev");

// Set proper permissions for microphone access
app.commandLine.appendSwitch("enable-speech-api");
app.commandLine.appendSwitch("enable-speech-dispatcher");
app.commandLine.appendSwitch("allow-file-access-from-files");

// Reference to main window
let mainWindow;

// Setup IPC handlers for screen capture
ipcMain.handle("capture-screen", async () => {
  // Minimize the window temporarily to capture what's behind it
  const wasVisible = mainWindow.isVisible();
  const wasMinimized = mainWindow.isMinimized();

  // Hide the window to capture what's behind it
  mainWindow.minimize();

  // Wait a bit for the window to minimize
  await new Promise((resolve) => setTimeout(resolve, 300));

  try {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 1920, height: 1080 },
    });

    // Restore the window
    if (!wasMinimized) {
      mainWindow.restore();
    }
    if (wasVisible) {
      mainWindow.show();
    }

    // Return the main screen capture source
    return sources.length > 0
      ? {
          thumbnail: sources[0].thumbnail.toDataURL(),
        }
      : null;
  } catch (error) {
    // Restore the window even if there's an error
    if (!wasMinimized) {
      mainWindow.restore();
    }
    if (wasVisible) {
      mainWindow.show();
    }
    throw error;
  }
});

// Handle clipboard copy operations
ipcMain.handle("clipboard-write", (event, text) => {
  clipboard.writeText(text);
  return true;
});

function createWindow() {
  // Create the browser window with smaller size and no maximize option
  mainWindow = new BrowserWindow({
    width: 600,
    height: 700,
    resizable: false, // Prevent resizing
    maximizable: false, // Disable maximize button
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false, // Need this for microphone access in some cases
      allowRunningInsecureContent: true, // For development only
      enableRemoteModule: true, // Allow remote module for screen capture
    },
    backgroundColor: "#1a1a1a", // Dark theme background
  });

  // Set permissions for the window
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      if (
        permission === "media" ||
        permission === "microphone" ||
        permission === "display-capture" ||
        permission === "clipboard-read" ||
        permission === "clipboard-write"
      ) {
        callback(true); // Grant permission for media and clipboard access
      } else {
        callback(false);
      }
    }
  );

  // Load the app
  mainWindow.loadURL(
    isDev
      ? "http://localhost:3000" // Dev server URL
      : `file://${path.join(__dirname, "../build/index.html")}` // Production build
  );
}

// Create window when Electron is ready
app.whenReady().then(createWindow);

// Quit when all windows are closed, except on macOS
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// On macOS, recreate window when dock icon is clicked
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
