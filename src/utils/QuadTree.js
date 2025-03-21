/**
 * A QuadTree implementation for efficient spatial queries
 */
class QuadTree {
    /**
     * Create a new QuadTree node
     * @param {Object} bounds - The bounds of this quad {x, y, width, height}
     * @param {number} capacity - Maximum number of points per node before splitting
     * @param {number} maxDepth - Maximum depth of the tree
     * @param {number} depth - Current depth of this node
     */
    constructor(bounds, capacity = 4, maxDepth = 8, depth = 0) {
        this.bounds = bounds;
        this.capacity = capacity;
        this.maxDepth = maxDepth;
        this.depth = depth;
        this.points = [];
        this.divided = false;
    }

    /**
     * Convert lat/lng to quadtree coordinates
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @returns {Object} - {x, y} normalized coordinates
     */
    static latLngToXY(lat, lng) {
        // Mercator projection
        const x = (lng + 180) / 360;
        const y = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2;
        return { x, y };
    }

    /**
     * Convert quadtree coordinates back to lat/lng
     * @param {number} x - Normalized x coordinate
     * @param {number} y - Normalized y coordinate
     * @returns {Object} - {lat, lng}
     */
    static xyToLatLng(x, y) {
        const lng = x * 360 - 180;
        const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI;
        return { lat, lng };
    }

    /**
     * Check if a point is within the bounds
     * @param {Object} point - The point to check
     * @returns {boolean} - True if the point is within bounds
     */
    contains(point) {
        return point.x >= this.bounds.x &&
               point.x < this.bounds.x + this.bounds.width &&
               point.y >= this.bounds.y &&
               point.y < this.bounds.y + this.bounds.height;
    }

    /**
     * Split this node into four subnodes
     */
    subdivide() {
        const x = this.bounds.x;
        const y = this.bounds.y;
        const w = this.bounds.width / 2;
        const h = this.bounds.height / 2;
        const depth = this.depth + 1;

        this.northwest = new QuadTree({ x, y, width: w, height: h }, 
            this.capacity, this.maxDepth, depth);
        this.northeast = new QuadTree({ x: x + w, y, width: w, height: h }, 
            this.capacity, this.maxDepth, depth);
        this.southwest = new QuadTree({ x, y: y + h, width: w, height: h }, 
            this.capacity, this.maxDepth, depth);
        this.southeast = new QuadTree({ x: x + w, y: y + h, width: w, height: h }, 
            this.capacity, this.maxDepth, depth);

        this.divided = true;

        // Redistribute points to children
        for (let point of this.points) {
            this.insertToChildren(point);
        }
        this.points = []; // Clear points after redistribution
    }

    /**
     * Insert a point into the quadtree
     * @param {Object} point - The point to insert {x, y, data}
     * @returns {boolean} - True if point was inserted
     */
    insert(point) {
        if (!this.contains(point)) {
            return false;
        }

        if (!this.divided) {
            if (this.points.length < this.capacity || this.depth >= this.maxDepth) {
                this.points.push(point);
                return true;
            }
            this.subdivide();
        }

        return this.insertToChildren(point);
    }

    /**
     * Insert a point into the children nodes
     * @param {Object} point - The point to insert
     * @returns {boolean} - True if point was inserted into a child
     */
    insertToChildren(point) {
        return this.northwest.insert(point) ||
               this.northeast.insert(point) ||
               this.southwest.insert(point) ||
               this.southeast.insert(point);
    }

    /**
     * Query points within a rectangular region
     * @param {Object} range - The query rectangle {x, y, width, height}
     * @returns {Array} - Array of points within the range
     */
    query(range) {
        let found = [];

        if (!this.intersects(range)) {
            return found;
        }

        for (let point of this.points) {
            if (this.pointInRange(point, range)) {
                found.push(point);
            }
        }

        if (this.divided) {
            found = found.concat(
                this.northwest.query(range),
                this.northeast.query(range),
                this.southwest.query(range),
                this.southeast.query(range)
            );
        }

        return found;
    }

    /**
     * Check if this node's bounds intersect with a range
     * @param {Object} range - The range to check
     * @returns {boolean} - True if ranges intersect
     */
    intersects(range) {
        return !(range.x > this.bounds.x + this.bounds.width ||
                range.x + range.width < this.bounds.x ||
                range.y > this.bounds.y + this.bounds.height ||
                range.y + range.height < this.bounds.y);
    }

    /**
     * Check if a point is within a range
     * @param {Object} point - The point to check
     * @param {Object} range - The range to check against
     * @returns {boolean} - True if point is in range
     */
    pointInRange(point, range) {
        return point.x >= range.x &&
               point.x < range.x + range.width &&
               point.y >= range.y &&
               point.y < range.y + range.height;
    }

    /**
     * Clear all points from the quadtree
     */
    clear() {
        this.points = [];
        if (this.divided) {
            this.northwest.clear();
            this.northeast.clear();
            this.southwest.clear();
            this.southeast.clear();
            this.divided = false;
        }
    }
}

export default QuadTree;
