import MapComponent from './map.js';
import ApiService from '../services/ApiService.js';
import MarkersComponent from './markers.js';
import FilteringComponent from '../features/filtering.js';

/**
 * Controls component responsible for handling UI controls
 */
class ControlsComponent {
    constructor() {
        this.searchToggle = null;
        this.filterToggle = null;
        this.searchPanel = null;
        this.filtersPanel = null;
        this.searchInput = null;
        this.zoomInButton = null;
        this.zoomOutButton = null;
    }

    /**
     * Initialize controls
     */
    initialize() {
        this.searchToggle = document.getElementById('toggle-search');
        this.filterToggle = document.getElementById('toggle-filters');
        this.searchPanel = document.querySelector('.search-panel');
        this.filtersPanel = document.querySelector('.filters-panel');
        this.searchInput = document.getElementById('search-input');
        this.zoomInButton = document.getElementById('zoom-in');
        this.zoomOutButton = document.getElementById('zoom-out');

        this.setupEventListeners();
        this.initializeCustomSelects();
    }

    /**
     * Set up event listeners for controls
     */
    setupEventListeners() {
        // Search toggle functionality
        this.searchToggle?.addEventListener('click', () => {
            const isActive = this.searchToggle.classList.contains('active');
            
            // Close filters if open
            this.filterToggle?.classList.remove('active');
            if (this.filtersPanel) this.filtersPanel.hidden = true;
            
            // Toggle search
            this.searchToggle.classList.toggle('active');
            if (this.searchPanel) this.searchPanel.hidden = isActive;
            
            if (!isActive && this.searchInput) {
                this.searchInput.focus();
            }
        });

        // Filter toggle functionality
        this.filterToggle?.addEventListener('click', () => {
            const isActive = this.filterToggle.classList.contains('active');
            
            // Close search if open
            this.searchToggle?.classList.remove('active');
            if (this.searchPanel) this.searchPanel.hidden = true;
            
            // Toggle filters
            this.filterToggle.classList.toggle('active');
            if (this.filtersPanel) this.filtersPanel.hidden = isActive;
        });

        // City search functionality
        this.searchInput?.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // Prevent form submission
                const query = this.searchInput.value.trim();
                if (query) {
                    const location = await ApiService.searchCity(query);
                    if (location) {
                        MapComponent.setView(location.lat, location.lon, 15);
                        this.searchToggle?.classList.remove('active');
                        if (this.searchPanel) this.searchPanel.hidden = true;
                        this.searchInput.value = '';
                    } else {
                        alert('City not found');
                    }
                }
            }
        });

        // Zoom controls
        this.zoomInButton?.addEventListener('click', () => {
            MapComponent.zoomIn();
        });
        
        this.zoomOutButton?.addEventListener('click', () => {
            MapComponent.zoomOut();
        });

        // Close selects when clicking outside
        document.addEventListener('click', () => this.closeAllSelect());
    }

    /**
     * Initialize custom select elements
     */
    initializeCustomSelects() {
        const foodFilter = document.getElementById('food-filter');
        const priceFilter = document.getElementById('price-filter');
        const ambienceFilter = document.getElementById('ambience-filter');
        const amenityFilter = document.getElementById('amenity-filter');

        // Initialize all custom selects
        if (foodFilter) this.initializeCustomSelect(foodFilter);
        if (priceFilter) this.initializeCustomSelect(priceFilter);
        if (ambienceFilter) this.initializeCustomSelect(ambienceFilter);
        if (amenityFilter) this.initializeCustomSelect(amenityFilter);
    }

    /**
     * Initialize a custom select element
     * 
     * @param {HTMLElement} select - The select element to initialize
     */
    initializeCustomSelect(select) {
        const selected = select.querySelector('.select-selected');
        const items = select.querySelector('.select-items');
        const id = select.id;

        selected.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeAllSelect(select);
            items.classList.toggle('select-hide');
            selected.classList.toggle('select-arrow-active');
        });

        items.querySelectorAll('div').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                selected.textContent = item.textContent;
                FilteringComponent.setFilter(id.replace('-filter', ''), item.dataset.value);
                items.classList.add('select-hide');
                selected.classList.remove('select-arrow-active');
            });
        });
    }

    /**
     * Close all select boxes except the current one
     * 
     * @param {HTMLElement} except - The select element to keep open
     */
    closeAllSelect(except) {
        const selectItems = document.getElementsByClassName('select-items');
        const selected = document.getElementsByClassName('select-selected');
        
        Array.from(selectItems).forEach((items, idx) => {
            if (except && except.contains(items)) return;
            items.classList.add('select-hide');
            selected[idx].classList.remove('select-arrow-active');
        });
    }

    /**
     * Update filter button state based on active filters
     */
    updateFilterButtonState() {
        if (this.filterToggle) {
            const hasActiveFilters = FilteringComponent.hasActiveFilters();
            this.filterToggle.classList.toggle('has-filters', hasActiveFilters);
        }
    }
}

export default new ControlsComponent();
