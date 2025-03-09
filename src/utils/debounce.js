/**
 * Creates a debounced function that delays invoking the provided function
 * until after the specified wait time has elapsed since the last time it was invoked.
 * 
 * @param {Function} func - The function to debounce
 * @param {number} wait - The number of milliseconds to delay
 * @returns {Function} - The debounced function
 */
function debounce(func, wait) {
    let timeout;
    return async function(...args) {
        console.log('Debounce - Function called with args:', args);
        const context = this;
        
        return new Promise((resolve) => {
            clearTimeout(timeout);
            timeout = setTimeout(async () => {
                console.log('Debounce - Executing debounced function after', wait, 'ms');
                try {
                    const result = await func.apply(context, args);
                    resolve(result);
                } catch (error) {
                    console.error('Debounce - Error in debounced function:', error);
                    resolve([]);
                }
            }, wait);
        });
    };
}

export default debounce;
