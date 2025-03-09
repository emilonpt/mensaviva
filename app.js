// Map layers
const lightLayer = L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Tiles style by <a href="https://www.hotosm.org/" target="_blank">Humanitarian OpenStreetMap Team</a> hosted by <a href="https://openstreetmap.fr/" target="_blank">OpenStreetMap France</a>'
});

const darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
});

// Initialize map (position will be set by geolocation)
const map = L.map('map', {
    zoomControl: false // Disable default zoom controls
});
lightLayer.addTo(map);

// Create layer groups for markers
const reviewedLayer = L.layerGroup();
const nonReviewedCluster = L.markerClusterGroup({
    maxClusterRadius: 50,
    disableClusteringAtZoom: 17,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    iconCreateFunction: function(cluster) {
        return L.divIcon({
            html: '<div class="cluster-icon">' + cluster.getChildCount() + '</div>',
            className: 'marker-cluster',
            iconSize: L.point(40, 40)
        });
    }
});

// Add layers to map
reviewedLayer.addTo(map);
nonReviewedCluster.addTo(map);

// Get user location
async function getUserLocation() {
    try {
        if ('geolocation' in navigator) {
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject);
            });
            return {
                lat: position.coords.latitude,
                lon: position.coords.longitude
            };
        }
        throw new Error('Geolocation not available');
    } catch (error) {
        console.log('Geolocation failed, defaulting to Lisbon:', error);
        return {
            lat: 38.72655110619349,
            lon: -9.144294226912088
        };
    }
}

// Initialize user location and map
async function initializeLocation() {
    const location = await getUserLocation();
    console.log('Setting initial map view:', location);
    map.setView([location.lat, location.lon], 15);
    fetchRestaurants();
}

// Dark mode functionality
function initializeDarkMode() {
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const isDarkMode = localStorage.getItem('darkMode') === 'true';
    
    if (isDarkMode) {
        map.removeLayer(lightLayer);
        darkLayer.addTo(map);
        darkModeToggle.checked = true;
    }

    darkModeToggle.addEventListener('change', () => {
        if (darkModeToggle.checked) {
            map.removeLayer(lightLayer);
            darkLayer.addTo(map);
            localStorage.setItem('darkMode', 'true');
        } else {
            map.removeLayer(darkLayer);
            lightLayer.addTo(map);
            localStorage.setItem('darkMode', 'false');
        }
    });
}

// Store markers and filter state
const markers = {};
const markerLayers = {}; // Track which layer each marker belongs to
let activeFilters = {
    food: '',
    price: '',
    ambience: '',
    tags: '',
    withReviews: false
};

// Store all unique tags from restaurants
let allTags = new Set();

// Centralized tag management system
const tagManager = {
    activeTags: new Set(),
    
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
        applyFilters();
        updateFilterButtonState();
    },

    hasTag(tag) {
        return this.activeTags.has(tag.trim().toLowerCase());
    },

    addTag(tag) {
        const normalizedTag = tag.trim().toLowerCase();
        if (normalizedTag && !this.activeTags.has(normalizedTag)) {
            this.activeTags.add(normalizedTag);
            return true;
        }
        return false;
    },

    removeTag(tag) {
        const normalizedTag = tag.trim().toLowerCase();
        const removed = this.activeTags.delete(normalizedTag);
        return removed;
    },

    clearTags() {
        this.activeTags.clear();
        this.updateUI();
        this.syncWithFilters();
    },

    updateUI() {
        const activeTagsContainer = document.getElementById('active-tags');
        if (!activeTagsContainer) return;

        activeTagsContainer.innerHTML = Array.from(this.activeTags)
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
    },

    syncWithFilters() {
        activeFilters.tags = Array.from(this.activeTags).join(',');
    }
};

// Make tag manager globally accessible
window.tagManager = tagManager;

// City search functionality
async function searchCity(query) {
    try {
        console.log('Searching for city:', query);
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
        const data = await response.json();
        console.log('City search results:', data);
        if (data && data.length > 0) {
            const { lat, lon } = data[0];
            console.log('Moving map to:', { lat, lon });
            map.setView([lat, lon], 14);
        } else {
            console.warn('City not found:', query);
            alert('City not found');
        }
    } catch (error) {
        console.error('Error searching city:', error);
        alert('Error searching for city');
    }
}

// Initialize search and filter functionality
function initializeControls() {
    const searchToggle = document.getElementById('toggle-search');
    const filterToggle = document.getElementById('toggle-filters');
    const searchPanel = document.querySelector('.search-panel');
    const filtersPanel = document.querySelector('.filters-panel');
    const searchInput = document.getElementById('search-input');
    const foodFilter = document.getElementById('food-filter');
    const priceFilter = document.getElementById('price-filter');
    const ambienceFilter = document.getElementById('ambience-filter');
    const tagsFilter = document.getElementById('tags-filter');
    const reviewsToggle = document.getElementById('reviews-only');
    const tagSuggestions = document.getElementById('tag-suggestions');

    // Search toggle functionality
    searchToggle?.addEventListener('click', () => {
        const isActive = searchToggle.classList.contains('active');
        
        // Close filters if open
        filterToggle?.classList.remove('active');
        if (filtersPanel) filtersPanel.hidden = true;
        
        // Toggle search
        searchToggle.classList.toggle('active');
        if (searchPanel) searchPanel.hidden = isActive;
        
        if (!isActive && searchInput) {
            searchInput.focus();
        }
    });

    // Filter toggle functionality
    filterToggle?.addEventListener('click', () => {
        const isActive = filterToggle.classList.contains('active');
        
        // Close search if open
        searchToggle?.classList.remove('active');
        if (searchPanel) searchPanel.hidden = true;
        
        // Toggle filters
        filterToggle.classList.toggle('active');
        if (filtersPanel) filtersPanel.hidden = isActive;
    });

    // Initialize custom selects
    function initializeCustomSelect(select) {
        const selected = select.querySelector('.select-selected');
        const items = select.querySelector('.select-items');
        const id = select.id;

        selected.addEventListener('click', (e) => {
            e.stopPropagation();
            closeAllSelect(select);
            items.classList.toggle('select-hide');
            selected.classList.toggle('select-arrow-active');
        });

        items.querySelectorAll('div').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                selected.textContent = item.textContent;
                activeFilters[id.replace('-filter', '')] = item.dataset.value;
                items.classList.add('select-hide');
                selected.classList.remove('select-arrow-active');
                applyFilters();
            });
        });
    }

    // Close all select boxes except the current one
    function closeAllSelect(except) {
        const selectItems = document.getElementsByClassName('select-items');
        const selected = document.getElementsByClassName('select-selected');
        
        Array.from(selectItems).forEach((items, idx) => {
            if (except && except.contains(items)) return;
            items.classList.add('select-hide');
            selected[idx].classList.remove('select-arrow-active');
        });
    }

    // Close selects when clicking outside
    document.addEventListener('click', () => closeAllSelect());

    // Initialize all custom selects
    if (foodFilter) initializeCustomSelect(foodFilter);
    if (priceFilter) initializeCustomSelect(priceFilter);
    if (ambienceFilter) initializeCustomSelect(ambienceFilter);

    // Tags filter with suggestions
    tagsFilter?.addEventListener('input', (e) => {
        const currentTag = e.target.value.trim().toLowerCase();
        
        if (currentTag && tagSuggestions) {
            const suggestions = Array.from(allTags)
                .filter(tag => 
                    tag.toLowerCase().includes(currentTag) && 
                    !tagManager.hasTag(tag)
                )
                .map(tag => `<div class="tag-suggestion">${tag}</div>`)
                .join('');
            
            if (suggestions) {
                tagSuggestions.innerHTML = suggestions;
                tagSuggestions.classList.add('active');

                tagSuggestions.querySelectorAll('.tag-suggestion').forEach(suggestion => {
                    suggestion.addEventListener('click', () => {
                        tagManager.toggleTag(suggestion.textContent);
                        if (tagsFilter) tagsFilter.value = '';
                        tagSuggestions.classList.remove('active');
                    });
                });
            } else {
                tagSuggestions.classList.remove('active');
            }
        } else if (tagSuggestions) {
            tagSuggestions.classList.remove('active');
        }
    });

    // Handle tag input with Enter key
    tagsFilter?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && tagsFilter.value.trim()) {
            tagManager.toggleTag(tagsFilter.value);
            tagsFilter.value = '';
            if (tagSuggestions) tagSuggestions.classList.remove('active');
        }
    });

    // Handle active tags clicks (delegation)
    document.getElementById('active-tags')?.addEventListener('click', (e) => {
        const tag = e.target.closest('.tag');
        if (tag && tag.dataset.tag) {
            tagManager.toggleTag(tag.dataset.tag);
        }
    });

    // Hide suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.tag-filter-container') && tagSuggestions) {
            tagSuggestions.classList.remove('active');
        }
    });

    // Reviews toggle
    reviewsToggle?.addEventListener('change', (e) => {
        activeFilters.withReviews = e.target.checked;
        applyFilters();
        updateFilterButtonState();
    });

    // City search functionality
    searchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // Prevent form submission
            const query = searchInput.value.trim();
            if (query) {
                searchCity(query).then(() => {
                    searchToggle?.classList.remove('active');
                    if (searchPanel) searchPanel.hidden = true;
                    searchInput.value = '';
                });
            }
        }
    });
}

// Optimized apply filters function with batch processing
function applyFilters() {
    console.log('Applying filters:', activeFilters);
    let visibleCount = 0;
    let totalCount = 0;
    
    // Clear all layers first
    reviewedLayer.clearLayers();
    nonReviewedCluster.clearLayers();
    
    // Create arrays to hold markers for each layer
    const reviewedMarkers = [];
    const nonReviewedMarkers = [];
    
    Object.entries(markers).forEach(([id, marker]) => {
        const restaurant = marker.restaurantData;
        if (!restaurant) return;
        totalCount++;
        
        let visible = true;
        
        const ratings = restaurant.avgRatings;
        const comments = restaurant.comments;
        const hasReviews = comments.some(comment => 
            comment.food_rating || comment.price_rating || comment.ambience_rating || comment.text
        ) || restaurant.tags.length > 0;

        if (activeFilters.withReviews && !hasReviews) {
            visible = false;
        }
        
        if ((activeFilters.food || activeFilters.price || activeFilters.ambience) && !hasReviews) {
            visible = false;
        }
        
        if (visible && activeFilters.food) {
            if (!ratings || ratings.food === null || ratings.food < parseFloat(activeFilters.food)) {
                visible = false;
            }
        }
        
        if (visible && activeFilters.price) {
            if (!ratings || ratings.price === null || ratings.price < parseFloat(activeFilters.price)) {
                visible = false;
            }
        }
        
        if (visible && activeFilters.ambience) {
            if (!ratings || ratings.ambience === null || ratings.ambience < parseFloat(activeFilters.ambience)) {
                visible = false;
            }
        }
        
        if (activeFilters.tags && restaurant.tags) {
            const searchTags = activeFilters.tags.split(',').map(t => t.trim().toLowerCase()).filter(t => t);
            if (searchTags.length > 0) {
                const matchingTags = searchTags.filter(searchTag =>
                    restaurant.tags.some(restaurantTag => 
                        restaurantTag.toLowerCase().includes(searchTag)
                    )
                );
                if (matchingTags.length !== searchTags.length) {
                    visible = false;
                }
            }
        }
        
        if (visible) {
            // Add to appropriate array based on whether it has reviews
            if (hasReviews) {
                reviewedMarkers.push(marker);
                markerLayers[id] = 'reviewed';
            } else {
                nonReviewedMarkers.push(marker);
                markerLayers[id] = 'nonReviewed';
            }
            visibleCount++;
        }
    });
    
    // Add markers to layers in batches
    const BATCH_SIZE = 50;
    
    function addMarkersInBatches(markers, layer, batchIndex = 0) {
        const start = batchIndex * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, markers.length);
        
        if (start >= markers.length) return;
        
        // Add a batch of markers
        for (let i = start; i < end; i++) {
            layer.addLayer(markers[i]);
        }
        
        // Schedule next batch in next animation frame
        if (end < markers.length) {
            requestAnimationFrame(() => {
                addMarkersInBatches(markers, layer, batchIndex + 1);
            });
        }
    }
    
    // Start adding markers in batches
    addMarkersInBatches(reviewedMarkers, reviewedLayer);
    addMarkersInBatches(nonReviewedMarkers, nonReviewedCluster);
    
    console.log(`Filters applied: ${visibleCount}/${totalCount} restaurants visible`);
}

// Debounce function to limit how often a function can be called
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

// Track the last fetched bounds to avoid redundant fetches
let lastFetchedBounds = null;

// Check if current bounds are significantly different from last fetched bounds
function boundsChanged(currentBounds, lastBounds, threshold = 0.2) {
    if (!lastBounds) return true;
    
    const currentCenter = currentBounds.getCenter();
    const lastCenter = lastBounds.getCenter();
    
    // Calculate distance between centers as a percentage of the viewport size
    const viewportWidth = currentBounds.getEast() - currentBounds.getWest();
    const viewportHeight = currentBounds.getNorth() - currentBounds.getSouth();
    
    const latDiff = Math.abs(currentCenter.lat - lastCenter.lat) / viewportHeight;
    const lngDiff = Math.abs(currentCenter.lng - lastCenter.lng) / viewportWidth;
    
    // Only fetch if the map has moved by more than the threshold percentage
    return latDiff > threshold || lngDiff > threshold;
}

// Cache for restaurant data to avoid redundant fetches
const restaurantDataCache = new Map();

// Fetch restaurants in viewport with debouncing and bounds checking
const debouncedFetchRestaurants = debounce(async (forceUpdate = false) => {
    const bounds = map.getBounds();
    
    // Skip fetch if bounds haven't changed significantly and not forced
    if (!forceUpdate && !boundsChanged(bounds, lastFetchedBounds)) {
        console.log('Skipping fetch - map movement too small');
        return;
    }
    
    const params = {
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast()
    };
    console.log('Fetching restaurants with bounds:', params);
    
    try {
        const response = await fetch(`/restaurants?south=${params.south}&west=${params.west}&north=${params.north}&east=${params.east}&checkForUpdates=${forceUpdate}`);
        if (!response.ok) throw new Error(`Failed to fetch restaurants: ${response.status} ${response.statusText}`);
        const restaurants = await response.json();
        console.log(`Fetched ${restaurants.length} restaurants from server`);
        
        // Update lastFetchedBounds
        lastFetchedBounds = L.latLngBounds(
            [bounds.getSouth(), bounds.getWest()],
            [bounds.getNorth(), bounds.getEast()]
        );
        
        // Batch process restaurants in chunks to avoid UI freezing
        const BATCH_SIZE = 20;
        const batches = [];
        
        for (let i = 0; i < restaurants.length; i += BATCH_SIZE) {
            batches.push(restaurants.slice(i, i + BATCH_SIZE));
        }
        
        let batchIndex = 0;
        
        async function processBatch() {
            if (batchIndex >= batches.length) {
                // All batches processed, apply filters
                applyFilters();
                return;
            }
            
            const batch = batches[batchIndex++];
            const updatePromises = batch.map(restaurant => 
                updateMarker(restaurant, forceUpdate)
            );
            
            await Promise.all(updatePromises);
            
            // Process next batch in next animation frame to keep UI responsive
            requestAnimationFrame(() => setTimeout(processBatch, 0));
        }
        
        // Start processing batches
        processBatch();
    } catch (error) {
        console.error('Error fetching restaurants:', error);
    }
}, 300); // 300ms debounce time

// Alias for backward compatibility
async function fetchRestaurants(forceUpdate = false) {
    debouncedFetchRestaurants(forceUpdate);
}

// Helper function to format ratings
function formatRating(value) {
    return value !== null ? value.toFixed(1) : 'N/A';
}

// Calculate average ratings
function calculateAverageRatings(comments) {
    const sum = { food: 0, price: 0, ambience: 0 };
    const count = { food: 0, price: 0, ambience: 0 };
    
    comments.forEach(comment => {
        ['food', 'price', 'ambience'].forEach(type => {
            if (comment[`${type}_rating`]) {
                sum[type] += comment[`${type}_rating`];
                count[type]++;
            }
        });
    });
    
    return {
        food: count.food ? sum.food / count.food : null,
        price: count.price ? sum.price / count.price : null,
        ambience: count.ambience ? sum.ambience / count.ambience : null
    };
}

// Store restaurant data with marker
function storeRestaurantData(marker, restaurant, avgRatings, tags, comments) {
    const data = {
        ...restaurant,
        avgRatings,
        tags,
        comments
    };
    marker.restaurantData = data;
}

// Create popup content - extracted to a separate function for lazy loading
function createPopupContent(restaurant, comments, tags, avgRatings) {
    // Format opening hours
    const openingHours = restaurant.opening_hours ? 
        restaurant.opening_hours.split(';').map(h => `<div class="opening-hours-row">${h.trim()}</div>`).join('') :
        'Opening hours not available';

    // Create popup content
    const popupContent = document.createElement('div');
    popupContent.className = 'restaurant-popup';
    popupContent.innerHTML = `
        <div class="restaurant-info">
            <h3>${restaurant.name}</h3>
            
            <div class="restaurant-details">
                ${restaurant.address ? `
                    <div class="info-row">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>${restaurant.address}</span>
                    </div>
                ` : ''}
                
                <div class="info-row">
                    <i class="fas fa-clock"></i>
                    <div class="opening-hours">
                        ${openingHours}
                    </div>
                </div>
            </div>

            <div class="rating-summary">
                <div class="rating-item">
                    <h4>🍽️ Food</h4>
                    <div class="value">${formatRating(avgRatings.food)}</div>
                </div>
                <div class="rating-item">
                    <h4>💰 Price</h4>
                    <div class="value">${formatRating(avgRatings.price)}</div>
                </div>
                <div class="rating-item">
                    <h4>🌟 Ambience</h4>
                    <div class="value">${formatRating(avgRatings.ambience)}</div>
                </div>
            </div>

            ${tags.length > 0 ? `
                <div class="tags-list">
                    ${tags.map(tag => `
                        <span class="tag" onclick="handleTagClick('${tag.replace(/'/g, "\\'")}')">${tag}</span>
                    `).join('')}
                </div>
            ` : ''}
        </div>

        ${comments.map(comment => `
            <div class="comment">
                <p class="comment-text">${comment.text || ''}</p>
                <div class="comment-meta">
                    <span>
                        ${comment.food_rating ? `🍽️ ${comment.food_rating}` : ''}
                        ${comment.price_rating ? `${comment.food_rating ? ' • ' : ''}💰 ${comment.price_rating}` : ''}
                        ${comment.ambience_rating ? `${(comment.food_rating || comment.price_rating) ? ' • ' : ''}🌟 ${comment.ambience_rating}` : ''}
                    </span>
                    <span>${new Date(comment.date).toLocaleDateString()}</span>
                </div>
                ${comment.tags ? `
                    <div class="comment-tags">
                        ${comment.tags.split(',').map(tag => `
                            <span class="tag">${tag.trim()}</span>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `).join('')}
        
        <button onclick="openReviewModal('${restaurant.osm_id}')">Add Review</button>
    `;
    
    return popupContent;
}

// Update marker appearance and popup with lazy popup creation
async function updateMarker(restaurant, forceUpdate = false) {
    try {
        const cacheKey = restaurant.osm_id;
        let cachedData = restaurantDataCache.get(cacheKey);
        
        // Only fetch data if we don't have it cached or if forceUpdate is true
        if (!cachedData || forceUpdate) {
            const [commentsResponse, tagsResponse] = await Promise.all([
                fetch(`/comments/${restaurant.osm_id}`),
                fetch(`/tags/${restaurant.osm_id}`)
            ]);
            
            const comments = await commentsResponse.json();
            const tags = await tagsResponse.json();
            
            // Calculate ratings
            const avgRatings = calculateAverageRatings(comments);
            
            // Cache the data
            cachedData = { comments, tags, avgRatings };
            restaurantDataCache.set(cacheKey, cachedData);
            
            // Update all tags collection
            tags.forEach(tag => allTags.add(tag));
        }
        
        const { comments, tags, avgRatings } = cachedData;
        
        // Remove marker from previous layer if it exists
        if (markers[restaurant.osm_id]) {
            const currentLayer = markerLayers[restaurant.osm_id];
            if (currentLayer === 'reviewed') {
                reviewedLayer.removeLayer(markers[restaurant.osm_id]);
            } else if (currentLayer === 'nonReviewed') {
                nonReviewedCluster.removeLayer(markers[restaurant.osm_id]);
            }
        }
        
        let marker = markers[restaurant.osm_id];
        if (!marker) {
            marker = L.circleMarker([restaurant.lat, restaurant.lng], {
                opacity: 1,
            });
            
            // Use event delegation for mouseover to improve performance
            marker.on('mouseover', function(e) {
                // Only close other popups when this one opens
                if (!this.isPopupOpen()) {
                    Object.values(markers).forEach(m => {
                        if (m !== this && m.isPopupOpen()) m.closePopup();
                    });
                }
                
                this.openPopup();
                this.setStyle({
                    fillColor: "#F59E0B"
                });
            });
            
            marker.on('mouseout', function(e) {
                // Reset fill color when mouse leaves
                if (!this.isPopupOpen()) {
                    const hasReviews = this.restaurantData && 
                        (this.restaurantData.comments.some(comment => 
                            comment.food_rating || comment.price_rating || 
                            comment.ambience_rating || comment.text
                        ) || this.restaurantData.tags.length > 0);
                    
                    this.setStyle({
                        fillColor: hasReviews ? 'SkyBlue' : 'DimGrey'
                    });
                }
            });

            marker.on('click', function(e) {
                L.DomEvent.stopPropagation(e);
                this.openPopup();
            });
            
            markers[restaurant.osm_id] = marker;

            if (!map.hasClickHandler) {
                map.on('click', function(e) {
                    Object.values(markers).forEach(m => m.closePopup());
                });
                map.hasClickHandler = true;
            }
        }

        // Store restaurant data with marker
        storeRestaurantData(marker, restaurant, avgRatings, tags, comments);

        // Lazy popup creation - only create popup content when needed
        marker.unbindPopup(); // Remove any existing popup
        
        marker.bindPopup(() => {
            // This function is only called when the popup is opened
            return createPopupContent(restaurant, comments, tags, avgRatings);
        });

        const hasReviews = comments.some(comment => 
            comment.food_rating || comment.price_rating || comment.ambience_rating || comment.text
        ) || tags.length > 0;

        marker.setStyle({
            color: 'Black',
            fillColor: hasReviews ? 'SkyBlue' : 'DimGrey',
            radius: hasReviews ? 18 : 8,
            weight: 0.5,
            fillOpacity: 0.8,
            zIndex: hasReviews ? 1000 : 0
        });

        // Track which layer it should belong to
        markerLayers[restaurant.osm_id] = hasReviews ? 'reviewed' : 'nonReviewed';
        
        return marker;
    } catch (error) {
        console.error('Error updating marker:', error);
        return null;
    }
}

// Initialize zoom controls
function initializeZoomControls() {
    document.getElementById('zoom-in')?.addEventListener('click', () => {
        map.zoomIn();
    });
    
    document.getElementById('zoom-out')?.addEventListener('click', () => {
        map.zoomOut();
    });
}

// Modal functionality
const modal = document.getElementById('review-modal');
const closeBtn = document.getElementsByClassName('close')[0];
let currentRestaurantId = null;

window.openReviewModal = function(restaurantId) {
    currentRestaurantId = restaurantId;
    resetRatings();
    resetTags();
    if (modal) {
        document.getElementById('review-text').value = '';
        modal.style.display = 'block';
    }
};

if (closeBtn) {
    closeBtn.onclick = function() {
        if (modal) modal.style.display = 'none';
    };
}

window.onclick = function(event) {
    if (event.target == modal) {
        modal.style.display = 'none';
    }
};

// Rating functionality
let currentRatings = {
    food: 0,
    price: 0,
    ambience: 0
};

function initializeRatings() {
    document.querySelectorAll('.stars').forEach(starsContainer => {
        const type = starsContainer.dataset.rating;
        starsContainer.querySelectorAll('.star').forEach(star => {
            star.addEventListener('click', () => {
                const value = parseInt(star.dataset.value);
                updateStarRating(type, value);
            });
        });
    });
}

function updateStarRating(type, value) {
    currentRatings[type] = value;
    const starsContainer = document.querySelector(`.stars[data-rating="${type}"]`);
    if (starsContainer) {
        starsContainer.querySelectorAll('.star').forEach(star => {
            star.classList.toggle('active', parseInt(star.dataset.value) <= value);
        });
    }
}

function resetRatings() {
    currentRatings = { food: 0, price: 0, ambience: 0 };
    document.querySelectorAll('.star').forEach(star => star.classList.remove('active'));
}

// Tags functionality
let currentTags = new Set();

function initializeTags() {
    const tagsInput = document.getElementById('tags-input');
    tagsInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const tag = tagsInput.value.trim().toLowerCase();
            if (tag) {
                if (!currentTags.has(tag)) {
                    currentTags.add(tag);
                    updateTagsDisplay();
                } else {
                    const existingTag = document.querySelector(`.tag[data-tag="${tag}"]`);
                    if (existingTag) {
                        existingTag.classList.add('duplicate');
                        setTimeout(() => existingTag.classList.remove('duplicate'), 1000);
                    }
                }
            }
            tagsInput.value = '';
        }
    });
}

function updateTagsDisplay() {
    const tagsDisplay = document.getElementById('tags-display');
    if (tagsDisplay) {
        tagsDisplay.innerHTML = Array.from(currentTags).map(tag => `
            <span class="tag">
                ${tag}
                <span class="remove" onclick="removeTag('${tag}')">&times;</span>
            </span>
        `).join('');
    }
}

window.removeTag = function(tag) {
    currentTags.delete(tag);
    updateTagsDisplay();
};

function resetTags() {
    currentTags.clear();
    updateTagsDisplay();
    const tagsInput = document.getElementById('tags-input');
    if (tagsInput) tagsInput.value = '';
}

// Handle review submission
const submitReview = document.getElementById('submit-review');
if (submitReview) {
    submitReview.onclick = async function() {
        const reviewText = document.getElementById('review-text')?.value.trim();
        
        if (!currentRatings.food && !currentRatings.price && !currentRatings.ambience && !reviewText && currentTags.size === 0) {
            alert('Please provide at least one rating, review text, or tag');
            return;
        }

        try {
            console.log('Submitting review for restaurant:', currentRestaurantId);
            // Save comment
            const commentResponse = await fetch('/comments', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    restaurantId: currentRestaurantId,
                    text: reviewText || null,
                    foodRating: currentRatings.food || null,
                    priceRating: currentRatings.price || null,
                    ambienceRating: currentRatings.ambience || null
                })
            });

            if (!commentResponse.ok) throw new Error('Failed to save comment: ' + commentResponse.statusText);

            // Save tags if any
            if (currentTags.size > 0) {
                console.log('Saving tags:', Array.from(currentTags));
                const tagsResponse = await fetch('/tags', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        restaurantId: currentRestaurantId,
                        tags: Array.from(currentTags),
                        commentId: await commentResponse.json()
                    })
                });

                if (!tagsResponse.ok) throw new Error('Failed to save tags');
            }

            // Close modal and refresh data
            if (modal) modal.style.display = 'none';
            const bounds = map.getBounds();
            await fetchRestaurants(true);
            console.log('Review submitted successfully');
        } catch (error) {
            console.error('Error saving review:', error);
            alert('Failed to save review. Please try again.');
        }
    };
}

function updateFilterButtonState() {
    const filterButton = document.getElementById('toggle-filters');
    if (filterButton) {
        const hasActiveFilters = 
            activeFilters.food || 
            activeFilters.price || 
            activeFilters.ambience || 
            activeFilters.tags || 
            activeFilters.withReviews;
        
        filterButton.classList.toggle('has-filters', hasActiveFilters);
    }
}

// Global tag click handler
window.handleTagClick = function(tag) {
    // Prevent default event if it's a click event
    if (event) event.preventDefault();
    
    if (!tag) return;
    
    console.log('Tag clicked:', tag);
    tagManager.toggleTag(tag);
};

// Initialize map when document is ready
map.on('moveend', () => {
    console.log('Map moved, fetching new restaurants...');
    fetchRestaurants();
});

initializeControls();
initializeDarkMode();
initializeZoomControls();
initializeRatings();
initializeTags();
initializeLocation();

