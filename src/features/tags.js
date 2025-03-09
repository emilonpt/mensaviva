import FilteringComponent from './filtering.js';
import MarkersComponent from '../components/markers.js';

/**
 * Tags component responsible for managing tags
 */
class TagsComponent {
    constructor() {
        this.activeTags = new Set();
        this.tagsFilter = null;
        this.tagSuggestions = null;
        this.activeTagsContainer = null;
    }

    /**
     * Initialize tags functionality
     */
    initialize() {
        this.tagsFilter = document.getElementById('tags-filter');
        this.tagSuggestions = document.getElementById('tag-suggestions');
        this.activeTagsContainer = document.getElementById('active-tags');

        this.setupEventListeners();
        
        // Expose the handleTagClick method to the global scope
        window.handleTagClick = this.handleTagClick.bind(this);
    }

    /**
     * Set up event listeners for tags
     */
    setupEventListeners() {
        // Tags filter with suggestions
        this.tagsFilter?.addEventListener('input', (e) => {
            const currentTag = e.target.value.trim().toLowerCase();
            
            if (currentTag && this.tagSuggestions) {
                const allTags = MarkersComponent.getAllTags();
                const suggestions = Array.from(allTags)
                    .filter(tag => 
                        tag.toLowerCase().includes(currentTag) && 
                        !this.hasTag(tag)
                    )
                    .map(tag => `<div class="tag-suggestion">${tag}</div>`)
                    .join('');
                
                if (suggestions) {
                    this.tagSuggestions.innerHTML = suggestions;
                    this.tagSuggestions.classList.add('active');

                    this.tagSuggestions.querySelectorAll('.tag-suggestion').forEach(suggestion => {
                        suggestion.addEventListener('click', () => {
                            this.toggleTag(suggestion.textContent);
                            if (this.tagsFilter) this.tagsFilter.value = '';
                            this.tagSuggestions.classList.remove('active');
                        });
                    });
                } else {
                    this.tagSuggestions.classList.remove('active');
                }
            } else if (this.tagSuggestions) {
                this.tagSuggestions.classList.remove('active');
            }
        });

        // Handle tag input with Enter key
        this.tagsFilter?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && this.tagsFilter.value.trim()) {
                this.toggleTag(this.tagsFilter.value);
                this.tagsFilter.value = '';
                if (this.tagSuggestions) this.tagSuggestions.classList.remove('active');
            }
        });

        // Handle active tags clicks (delegation)
        this.activeTagsContainer?.addEventListener('click', (e) => {
            const tag = e.target.closest('.tag');
            if (tag && tag.dataset.tag) {
                this.toggleTag(tag.dataset.tag);
            }
        });

        // Hide suggestions when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.tag-filter-container') && this.tagSuggestions) {
                this.tagSuggestions.classList.remove('active');
            }
        });
    }

    /**
     * Toggle a tag (add if not present, remove if present)
     * 
     * @param {string} tag - Tag to toggle
     */
    toggleTag(tag) {
        const normalizedTag = tag.trim().toLowerCase();
        if (this.hasTag(normalizedTag)) {
            this.removeTag(normalizedTag);
        } else {
            this.addTag(normalizedTag);
        }
        
        // Update UI and filters
        this.updateUI();
        this.syncWithFilters();
        FilteringComponent.applyFilters();
        FilteringComponent.updateFilterButtonState();
    }

    /**
     * Check if a tag is active
     * 
     * @param {string} tag - Tag to check
     * @returns {boolean} - Whether the tag is active
     */
    hasTag(tag) {
        return this.activeTags.has(tag.trim().toLowerCase());
    }

    /**
     * Add a tag
     * 
     * @param {string} tag - Tag to add
     * @returns {boolean} - Whether the tag was added
     */
    addTag(tag) {
        const normalizedTag = tag.trim().toLowerCase();
        if (normalizedTag && !this.activeTags.has(normalizedTag)) {
            this.activeTags.add(normalizedTag);
            return true;
        }
        return false;
    }

    /**
     * Remove a tag
     * 
     * @param {string} tag - Tag to remove
     * @returns {boolean} - Whether the tag was removed
     */
    removeTag(tag) {
        const normalizedTag = tag.trim().toLowerCase();
        const removed = this.activeTags.delete(normalizedTag);
        return removed;
    }

    /**
     * Clear all tags
     */
    clearTags() {
        this.activeTags.clear();
        this.updateUI();
        this.syncWithFilters();
    }

    /**
     * Update the UI to reflect current tags
     */
    updateUI() {
        if (!this.activeTagsContainer) return;

        this.activeTagsContainer.innerHTML = Array.from(this.activeTags)
            .map(tag => `<span class="tag" data-tag="${tag}">${tag}</span>`)
            .join('');

        // Only update filter toggle icon state
        const filterToggle = document.getElementById('toggle-filters');
        if (filterToggle) {
            if (this.activeTags.size > 0) {
                filterToggle.classList.add('has-filters');
            } else {
                filterToggle.classList.remove('has-filters');
                
                // Hide filters panel if no active filters
                const activeFilters = FilteringComponent.getActiveFilters();
                const hasOtherFilters = 
                    activeFilters.food || 
                    activeFilters.price || 
                    activeFilters.ambience || 
                    activeFilters.withReviews;
                
                if (!hasOtherFilters) {
                    const filtersPanel = document.querySelector('.filters-panel');
                    if (filtersPanel) {
                        filterToggle.classList.remove('active');
                        filtersPanel.hidden = true;
                    }
                }
            }
        }
    }

    /**
     * Sync active tags with filters
     */
    syncWithFilters() {
        FilteringComponent.setFilter('tags', Array.from(this.activeTags).join(','));
    }

    /**
     * Handle tag click from restaurant popup
     * 
     * @param {string} tag - Tag that was clicked
     */
    handleTagClick(tag) {
        // Prevent default event if it's a click event
        if (event) event.preventDefault();
        
        if (!tag) return;
        
        console.log('Tag clicked:', tag);
        this.toggleTag(tag);
    }
}

export default new TagsComponent();
