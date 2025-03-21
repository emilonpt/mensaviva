// Map layers configuration
const lightLayer = L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Tiles style by <a href="https://www.hotosm.org/" target="_blank">Humanitarian OpenStreetMap Team</a> hosted by <a href="https://openstreetmap.fr/" target="_blank">OpenStreetMap France</a>'
});

const darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
});

// Map initialization options
const mapOptions = {
    zoomControl: false // Disable default zoom controls
};

// Marker cluster options
const clusterOptions = {
    maxClusterRadius: function(zoom) {
        // Scale cluster radius based on zoom level
        // At low zoom (further out), use larger radius to group more markers
        // At high zoom (closer in), use smaller radius for more precise grouping
        if (zoom <= 12) return 150;        // Far out
        if (zoom <= 14) return 80;        // Mid-range
        if (zoom <= 19) return 40;        // Getting closer
        return 0;                        // Very close
    },
    disableClusteringAtZoom: 19,
    iconCreateFunction: function(cluster) {
        return L.divIcon({
            html: '<div class="cluster-icon">' + cluster.getChildCount() + '</div>',
            className: 'marker-cluster',
            iconSize: L.point(40, 40)
        });
    }
};

// Default location (Lisbon) if geolocation fails
const defaultLocation = {
    lat: 38.72655110619349,
    lon: -9.144294226912088
};

export {
    lightLayer,
    darkLayer,
    mapOptions,
    clusterOptions,
    defaultLocation
};
