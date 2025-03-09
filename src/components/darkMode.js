import MapComponent from './map.js';

/**
 * Dark mode component responsible for handling dark mode functionality
 */
class DarkModeComponent {
    constructor() {
        this.darkModeToggle = null;
        this.isDarkMode = false;
    }

    /**
     * Initialize dark mode functionality
     */
    initialize() {
        this.darkModeToggle = document.getElementById('dark-mode-toggle');
        this.isDarkMode = localStorage.getItem('darkMode') === 'true';
        
        if (this.isDarkMode) {
            MapComponent.toggleDarkMode(true);
            this.darkModeToggle.checked = true;
        }

        this.setupEventListeners();
    }

    /**
     * Set up event listeners for dark mode toggle
     */
    setupEventListeners() {
        this.darkModeToggle.addEventListener('change', () => {
            this.isDarkMode = this.darkModeToggle.checked;
            MapComponent.toggleDarkMode(this.isDarkMode);
            localStorage.setItem('darkMode', this.isDarkMode.toString());
        });
    }

    /**
     * Get current dark mode state
     * 
     * @returns {boolean} - Whether dark mode is enabled
     */
    isDarkModeEnabled() {
        return this.isDarkMode;
    }

    /**
     * Set dark mode state
     * 
     * @param {boolean} enabled - Whether to enable dark mode
     */
    setDarkMode(enabled) {
        this.isDarkMode = enabled;
        this.darkModeToggle.checked = enabled;
        MapComponent.toggleDarkMode(enabled);
        localStorage.setItem('darkMode', enabled.toString());
    }
}

export default new DarkModeComponent();
