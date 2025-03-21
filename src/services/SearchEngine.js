import RestaurantDataStore from './RestaurantDataStore.js';

/**
 * Trie node for prefix matching
 */
class TrieNode {
    constructor() {
        this.children = new Map();
        this.isEndOfWord = false;
        this.items = new Set();
    }
}

/**
 * Manages restaurant search functionality with efficient indexing
 */
class SearchEngine {
    constructor(options = {}) {
        this.options = {
            minQueryLength: options.minQueryLength || 2,
            maxResults: options.maxResults || 50,
            typeaheadLimit: options.typeaheadLimit || 10,
            cacheTimeout: options.cacheTimeout || 5 * 60 * 1000, // 5 minutes
            normalizeChars: options.normalizeChars || true,
            ...options
        };

        // Search indexes
        this.nameIndex = new TrieNode();
        this.tagIndex = new TrieNode();
        this.addressIndex = new TrieNode();

        // Result caching
        this.queryCache = new Map();
        this.typeaheadCache = new Map();
        this.lastIndexUpdate = 0;

        // Statistics
        this.metrics = {
            totalSearches: 0,
            cacheHits: 0,
            indexSize: 0,
            averageResponseTime: 0
        };

        // Bind methods
        this.handleDataUpdate = this.handleDataUpdate.bind(this);
        RestaurantDataStore.subscribe(this.handleDataUpdate);
    }

    /**
     * Handle data updates from RestaurantDataStore
     */
    handleDataUpdate() {
        this.rebuildIndexes();
    }

    /**
     * Rebuild search indexes
     */
    rebuildIndexes() {
        const startTime = performance.now();
        
        // Clear existing indexes
        this.nameIndex = new TrieNode();
        this.tagIndex = new TrieNode();
        this.addressIndex = new TrieNode();
        this.queryCache.clear();
        this.typeaheadCache.clear();

        // Get all restaurants
        const restaurants = RestaurantDataStore.getAllRestaurants();
        let indexedTerms = 0;

        restaurants.forEach(restaurant => {
            // Index name
            const nameTokens = this.tokenize(restaurant.name);
            nameTokens.forEach(token => {
                this.insertIntoTrie(this.nameIndex, token, restaurant.id);
                indexedTerms++;
            });

            // Index tags
            if (restaurant.tags) {
                restaurant.tags.forEach(tag => {
                    const tagTokens = this.tokenize(tag);
                    tagTokens.forEach(token => {
                        this.insertIntoTrie(this.tagIndex, token, restaurant.id);
                        indexedTerms++;
                    });
                });
            }

            // Index address
            if (restaurant.address) {
                const addressTokens = this.tokenize(restaurant.address);
                addressTokens.forEach(token => {
                    this.insertIntoTrie(this.addressIndex, token, restaurant.id);
                    indexedTerms++;
                });
            }
        });

        this.lastIndexUpdate = Date.now();
        this.metrics.indexSize = indexedTerms;
        this.metrics.indexBuildTime = performance.now() - startTime;
    }

    /**
     * Insert a term into trie index
     * @param {TrieNode} root - Root node of trie
     * @param {string} term - Term to insert
     * @param {string} id - Restaurant ID
     */
    insertIntoTrie(root, term, id) {
        let node = root;
        for (const char of term) {
            if (!node.children.has(char)) {
                node.children.set(char, new TrieNode());
            }
            node = node.children.get(char);
            node.items.add(id);
        }
        node.isEndOfWord = true;
    }

    /**
     * Search for restaurants
     * @param {string} query - Search query
     * @param {Object} options - Search options
     * @returns {Promise<Array>} Search results
     */
    async search(query, options = {}) {
        const startTime = performance.now();
        const normalizedQuery = this.normalizeQuery(query);

        if (normalizedQuery.length < this.options.minQueryLength) {
            return { results: [], metadata: { source: 'minimum_length' } };
        }

        // Check cache
        const cacheKey = this.generateCacheKey(normalizedQuery, options);
        if (this.queryCache.has(cacheKey)) {
            const cached = this.queryCache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.options.cacheTimeout) {
                this.metrics.cacheHits++;
                return { ...cached.data, metadata: { source: 'cache' } };
            }
        }

        // Perform search
        const results = await this.executeSearch(normalizedQuery, options);
        
        // Cache results
        this.queryCache.set(cacheKey, {
            data: results,
            timestamp: Date.now()
        });

        // Update metrics
        this.updateMetrics(startTime);

        return { ...results, metadata: { source: 'search' } };
    }

    /**
     * Execute search across indexes
     * @param {string} query - Normalized query
     * @param {Object} options - Search options
     * @returns {Promise<Object>} Search results
     */
    async executeSearch(query, options) {
        const searchPromises = [
            this.searchIndex(this.nameIndex, query, 2), // Higher weight for names
            this.searchIndex(this.tagIndex, query, 1),
            this.searchIndex(this.addressIndex, query, 0.5)
        ];

        const [nameResults, tagResults, addressResults] = await Promise.all(searchPromises);
        
        // Merge and sort results
        const scoreMap = new Map();
        
        const addResults = (results, weight) => {
            results.forEach(({ id, score }) => {
                const currentScore = scoreMap.get(id) || 0;
                scoreMap.set(id, currentScore + (score * weight));
            });
        };

        addResults(nameResults, 2);
        addResults(tagResults, 1);
        addResults(addressResults, 0.5);

        // Get full restaurant data and sort by score
        const results = Array.from(scoreMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, this.options.maxResults)
            .map(([id, score]) => ({
                restaurant: RestaurantDataStore.getRestaurant(id),
                score
            }));

        return {
            results,
            total: scoreMap.size,
            query
        };
    }

    /**
     * Search within a specific index
     * @param {TrieNode} root - Root node of index
     * @param {string} query - Search query
     * @param {number} weight - Result weight
     * @returns {Promise<Array>} Search results
     */
    async searchIndex(root, query, weight) {
        const results = new Map();
        const prefixNode = this.findPrefixNode(root, query);

        if (!prefixNode) return [];

        // Collect all items under this prefix
        this.collectItems(prefixNode, results, query.length * weight);

        return Array.from(results.entries())
            .map(([id, score]) => ({ id, score }));
    }

    /**
     * Find node matching prefix
     * @param {TrieNode} root - Root node
     * @param {string} prefix - Search prefix
     * @returns {TrieNode|null} Matching node
     */
    findPrefixNode(root, prefix) {
        let node = root;
        for (const char of prefix) {
            if (!node.children.has(char)) {
                return null;
            }
            node = node.children.get(char);
        }
        return node;
    }

    /**
     * Collect items from node
     * @param {TrieNode} node - Current node
     * @param {Map} results - Results map
     * @param {number} baseScore - Base score for items
     */
    collectItems(node, results, baseScore) {
        // Add items at current node
        node.items.forEach(id => {
            const currentScore = results.get(id) || 0;
            results.set(id, currentScore + baseScore);
        });

        // Recursively collect from children
        node.children.forEach(child => {
            this.collectItems(child, results, baseScore * 0.9); // Reduce score with depth
        });
    }

    /**
     * Get typeahead suggestions
     * @param {string} prefix - Search prefix
     * @returns {Promise<Array>} Typeahead suggestions
     */
    async getTypeaheadSuggestions(prefix) {
        const normalizedPrefix = this.normalizeQuery(prefix);

        if (normalizedPrefix.length < this.options.minQueryLength) {
            return [];
        }

        // Check cache
        const cacheKey = `typeahead:${normalizedPrefix}`;
        if (this.typeaheadCache.has(cacheKey)) {
            const cached = this.typeaheadCache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.options.cacheTimeout) {
                return cached.data;
            }
        }

        // Find suggestions
        const suggestions = new Set();
        this.collectTypeaheadSuggestions(this.nameIndex, normalizedPrefix, suggestions);
        this.collectTypeaheadSuggestions(this.tagIndex, normalizedPrefix, suggestions);

        const results = Array.from(suggestions)
            .slice(0, this.options.typeaheadLimit);

        // Cache results
        this.typeaheadCache.set(cacheKey, {
            data: results,
            timestamp: Date.now()
        });

        return results;
    }

    /**
     * Collect typeahead suggestions from index
     * @param {TrieNode} root - Root node
     * @param {string} prefix - Search prefix
     * @param {Set} suggestions - Suggestions set
     */
    collectTypeaheadSuggestions(root, prefix, suggestions) {
        const node = this.findPrefixNode(root, prefix);
        if (!node) return;

        if (node.isEndOfWord) {
            suggestions.add(prefix);
        }

        node.children.forEach((child, char) => {
            this.collectTypeaheadSuggestions(child, prefix + char, suggestions);
        });
    }

    /**
     * Normalize search query
     * @param {string} query - Raw query
     * @returns {string} Normalized query
     */
    normalizeQuery(query) {
        let normalized = query.toLowerCase().trim();
        
        if (this.options.normalizeChars) {
            normalized = normalized
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '');
        }

        return normalized;
    }

    /**
     * Tokenize text for indexing
     * @param {string} text - Text to tokenize
     * @returns {Array} Tokens
     */
    tokenize(text) {
        return text
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .split(/[\s,.-]+/)
            .filter(token => token.length >= this.options.minQueryLength);
    }

    /**
     * Generate cache key
     * @param {string} query - Search query
     * @param {Object} options - Search options
     * @returns {string} Cache key
     */
    generateCacheKey(query, options) {
        return `${query}:${JSON.stringify(options)}`;
    }

    /**
     * Update search metrics
     * @param {number} startTime - Operation start time
     */
    updateMetrics(startTime) {
        const responseTime = performance.now() - startTime;
        this.metrics.totalSearches++;
        this.metrics.averageResponseTime = 
            (this.metrics.averageResponseTime * (this.metrics.totalSearches - 1) + responseTime) /
            this.metrics.totalSearches;
    }

    /**
     * Get search metrics
     * @returns {Object} Search metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            cacheSize: this.queryCache.size + this.typeaheadCache.size,
            lastIndexUpdate: this.lastIndexUpdate
        };
    }

    /**
     * Clear search cache
     */
    clearCache() {
        this.queryCache.clear();
        this.typeaheadCache.clear();
    }
}

export default new SearchEngine();
