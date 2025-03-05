import { attachConsole } from '@tauri-apps/plugin-log';

/**
 * Initialize the logging system
 * This connects the frontend to the Tauri log plugin
 */
export async function initLogging() {
  try {
    // Attach to the Tauri log plugin to receive logs in the console
    const detach = await attachConsole();
    console.log('Logging system initialized');
    
    // Forward console messages to the log plugin
    setupConsoleForwarding();
    
    return detach;
  } catch (error) {
    console.error('Failed to initialize logging system:', error);
    return () => {}; // Return a no-op detach function
  }
}

/**
 * Set up forwarding of console messages to the log plugin
 */
function setupConsoleForwarding() {
  // Store original console methods
  const originalConsole = {
    log: console.log,
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };

  // Override console methods to also log to the Tauri log plugin
  console.log = (...args: any[]) => {
    originalConsole.log(...args);
  };

  console.debug = (...args: any[]) => {
    originalConsole.debug(...args);
  };

  console.info = (...args: any[]) => {
    originalConsole.info(...args);
  };

  console.warn = (...args: any[]) => {
    originalConsole.warn(...args);
  };

  console.error = (...args: any[]) => {
    originalConsole.error(...args);
  };
}
