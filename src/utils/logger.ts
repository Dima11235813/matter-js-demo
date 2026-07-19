/**
 * Observability Logger Utility
 * Enables or disables verbose console log statements based on the .env configurations (VITE_ENABLE_LOGS).
 * Default is disabled (off) for optimal rendering performance (preventing blocking stdout writes).
 */

const enableLogs = import.meta.env.VITE_ENABLE_LOGS === 'true';

export const logger = {
    log: (...args: unknown[]) => {
        if (enableLogs) {
            console.log(...args);
        }
    },
    warn: (...args: unknown[]) => {
        if (enableLogs) {
            console.warn(...args);
        }
    },
    error: (...args: unknown[]) => {
        // Critical errors are always logged for visibility
        console.error(...args);
    }
};
