// array of all connections and transfers in the subway system. each sub-array
// has the station name in the first index and two routes that can be
// transferred between at that station in the second index. for stations
// supporting multiple transfers, each transfer must be separately declared
var CONNECTIONS = [
    ["Copley", ["E", "B/C/D/E"]],
    ["Copley", ["B/C/D", "B/C/D/E"]],

    ["Downtown Crossing", ["Orange", "Ashmont/Braintree"]],

    ["Government Center", ["Blue", "B/C/D/E"]],
    ["Government Center", ["Blue", "C/E"]],
    ["Government Center", ["B/C/D/E", "C/E"]],

    ["Haymarket", ["C/E", "Orange"]],

    ["JFK/UMass", ["Ashmont", "Ashmont/Braintree"]],
    ["JFK/UMass", ["Braintree", "Ashmont/Braintree"]],

    ["Kenmore", ["B", "B/C/D"]],
    ["Kenmore", ["B/C/D", "C"]],
    ["Kenmore", ["B/C/D", "D"]],

    ["North Station", ["C/E", "Orange"]],
    ["North Station", ["E", "Orange"]],
    ["North Station", ["C/E", "E"]],

    ["Park Street", ["B/C/D/E", "Ashmont/Braintree"]],

    ["State", ["Blue", "Orange"]],
]

// Leaflet visuals
var LINE_COLORS = {
    "Orange": "#ed8b00",
    "Red": "#da291c",
    "Green": "#00843d",
    "Blue": "#003da5"
}
var LINE_COLORS_INACTIVE = {
    // generated by reducing HSV saturation by 40
    "Orange": "#874f00",
    "Red": "#74160f",
    "Green": "#001e0e",
    "Blue": "#00173f"
}
var SEGMENTS_LAYER_THICKNESS = 6;
var STATIONS_LAYER_THICKNESS = 4;

// global variables
var graph;
var startStation;
var currentPath;
var currentQuantity = "SMALLPARTICLES";

// leaflet
var map = L.map(
    "map", {
        minZoom: 11,
        maxBounds: [
            [42.17, -71.3],
            [42.47, -70.9]
        ]
    }
).setView([42.34, -71.09510425], 12);
var Esri_WorldImagery = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
        attribution: "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA,"
            + " USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP,"
            + " and the GIS User Community",
        opacity: 0.5
    }
);
var segmentsBlankLayer = new L.GeoJSON.AJAX(
    "data/segments.geojson",
    {
        style: {
            stroke: true,
            color: "black",
            weight: SEGMENTS_LAYER_THICKNESS + 6,
            interactive: false
        }
    }
);
var stationsBlankLayer = new L.GeoJSON.AJAX(
    "data/stations.geojson", {
    pointToLayer: function (feature, latlng) {
            return L.circleMarker(latlng, {
                color: "black",
                fillOpacity: 1,
                radius: STATIONS_LAYER_THICKNESS + 3,
                interactive: false
            });
        }
    }
);
var segmentsLayer = new L.GeoJSON.AJAX(
    "data/segments.geojson",
    {
        style: function(feature) {
            return {
                color: LINE_COLORS_INACTIVE[feature.properties["LINE"]],
                weight: SEGMENTS_LAYER_THICKNESS,
                interactive: false
            }
        }
    }
);
var stationsLayer = new L.GeoJSON.AJAX(
    "data/stations.geojson",
    {
        pointToLayer: function (feature, latlng) {
            return L.circleMarker(latlng, {
                color: LINE_COLORS_INACTIVE[feature.properties["LINE"]],
                fillOpacity: 1,
                radius: STATIONS_LAYER_THICKNESS,
                interactive: true,
            });
        },
        onEachFeature: function(feature, layer) {
            layer.on({
                mouseover: function(e) {
                    stationsBlankLayer.eachLayer(function(borderLayer) {
                        if (
                            borderLayer.feature.properties["STATION"]
                            == feature.properties["STATION"]
                        ) {
                            borderLayer.setStyle({
                                color: "white"
                            });
                        }
                    });
                },
                mouseout: function(e) {
                    stationsBlankLayer.eachLayer(function(borderLayer) {
                        if (
                            borderLayer.feature.properties["STATION"]
                            == feature.properties["STATION"]
                        ) {
                            borderLayer.setStyle({
                                color: "black"
                            });
                        }
                    });
                },
                click: function(e) {
                    shortestPath(feature);
                    layer.setStyle({
                        color: LINE_COLORS[feature.properties["LINE"]]
                    });
                    layer.bringToFront();
                }
            })
        }
    }
);

/**
 * Initialize a JSNetworkX corresponding to the MBTA subway network.  Transfers
 * are defined in the `CONNECTIONS` constant; the graph will be stored in the
 * `graph` global variable (ugly).
 * @param {Object} segmentsGeojson A Leaflet layer containing all track
 *   segments.
 */
function initGraph(segmentsGeojson, connections) {
    graph = new jsnx.Graph();
    for (const feature of segmentsGeojson["features"]) {
        var properties = feature.properties;
        graph.addEdge(
            JSON.stringify([properties["START_STATION"], properties["ROUTE"]]),
            JSON.stringify([properties["END_STATION"], properties["ROUTE"]]),
            {
                weight: properties["length_mi"]
            }
        );
    }
    for (const [station, routes] of connections) {
        var [start_route, end_route] = routes;
        graph.addEdge(
            JSON.stringify([station, start_route]),
            JSON.stringify([station, end_route]),
            {
                // inter-line transfers are weighted very high so that they
                // only happen when absolutely necessary. the units are in
                // miles, so a transfer incurs a cost of 100 miles for the
                // shortest path calculation
                weight: 100
            }
        );
    }
}

/**
 * Return the GeoJSON feature equivalent of a segment represented in the
 * `graph` object as an edge between two JSON strings.
 * @param {string} startStationJSON The JSON of the start station.
 * @param {string} endStationJSON The JSON of the end station.
 * @return {Object} A dictionary containing the Leaflet layer of the relevant
 *   segment in the "layer" index and the direction, as either a 0 or 1, in the
 *   "direction" index
 */
function selectSegmentLayer(startStationJSON, endStationJSON) {
    var [startStation, startRoute] = JSON.parse(startStationJSON);
    var [endStation, endRoute] = JSON.parse(endStationJSON);
    for (let layer of segmentsLayer.getLayers()) {
        var properties = layer.feature.properties;
        if (
            (
                (properties["START_STATION"] == startStation)
                && (properties["ROUTE"] == startRoute)
            ) && (
                (properties["END_STATION"] == endStation)
                && (properties["ROUTE"] == endRoute)
            )
        ) {
            return {
                "layer": layer,
                "direction": 0
            }
        } else if (
            (
                (properties["END_STATION"] == startStation)
                && (properties["ROUTE"] == startRoute)
            ) && (
                (properties["START_STATION"] == endStation)
                && (properties["ROUTE"] == endRoute)
            )
        ) {
            return {
                "layer": layer,
                "direction": 1
            }
        }
    }
}

/**
 * Return the GeoJSON feature equivalent of a station represented in the
 * `graph` object as a JSON string.
 * @param {string} stationJSON The JSON of the station.
 * @return {Object} A dictionary containing the Leaflet layer of the relevant
 *   segment in the "layer" index and the direction in the "direction" index.
 *   The direction is always null, since the direction cannot be determined
 *   from the station JSON alone. Rather, this is done to standardize the
 *   return value with that of selectSegmentLayer.
 */
function selectStationLayer(stationJSON) {
    var [station, route] = JSON.parse(stationJSON);
    for (let layer of stationsLayer.getLayers()) {
        var properties = layer.feature.properties;
        if ((properties["STATION"] == station) && (properties["ROUTE"] == route)) {
            return {
                "layer": layer,
                "direction": null
            }
        }
    }
}

/**
 * Select GeoJSON features along a path.
 * @param {string[]} path An array of strings, with each value being a
 *   JSON-encoded array containing the station name in the first index and the
 *   route in the second index.
 * @return {Object} An array of Leaflet features corresponding to stations and
 *   track segments along the route.
 */
function featuresAlongPath(path) {
    var features = [];
    for (var i = 0; i < path.length - 1; i++) {
        var currentStation = path[i],
            nextStation = path[i+1];

        var possibleSegment = selectSegmentLayer(currentStation, nextStation);
        var possibleStation = selectStationLayer(currentStation);

        if (possibleStation != null) {
            if (possibleSegment != null) {
                possibleStation["direction"] = possibleSegment["direction"];
            } else {
                possibleStation["direction"] =
                    features[features.length - 1]["direction"];
            }
            features.push(possibleStation);
        }

        if (possibleSegment != null) {
            features.push(possibleSegment);
        }

    }
    return features;
}

/**
 * Highlight a path along the subway system in the Leaflet map by adjusting the
 * brightness.
 * @param {string[]} path An array of strings, with each value being a
 *   JSON-encoded array containing the station name in the first index and the
 *   route in the second index.
 */
function colorPath(path) {
    // reset segments
    segmentsLayer.eachLayer(function(layer) {
        layer.setStyle({
            color: LINE_COLORS_INACTIVE[layer.feature.properties["LINE"]]
        });
    });

    // color segments
    for (var i = 0; i < path.length - 1; i++) {
        var startStation = path[i],
            endStation = path[i+1],
            segment = selectSegmentLayer(startStation, endStation);
        if (segment != null) { // connections don't actually exist in GeoJSON
            var layer = segment["layer"];
            layer.setStyle({
                color: LINE_COLORS[layer.feature.properties["LINE"]]
            });
            layer.bringToFront();
        } else {
            console.log(
                "WARNING: nonexistant segment " + startStation + " to "
                + endStation + " (possible transfer?)"
            );
        }
    }

    // color stations
    stationsLayer.eachLayer(function(layer) {
        var properties = layer.feature.properties;
        if (path.includes(
            JSON.stringify([properties["STATION"], properties["ROUTE"]]))
        ) {
            layer.setStyle({
                color: LINE_COLORS[properties["LINE"]]
            });
            layer.bringToFront();
        } else {
            layer.setStyle({
                color: LINE_COLORS_INACTIVE[properties["LINE"]]
            });
        }
    });
}

/**
 * Update one of the station signs in the UI to reflect the current selection.
 * @param {string} id The ID of the element to be updated.
 * @param {Object} station The Leaflet feature of the selected station.
 */
function updateStationText(id, station) {
    var padding = "&nbsp;&nbsp;"
    element = document.getElementById(id);
    element.innerHTML = padding + station.properties["STATION"].toUpperCase()
        + padding;
    element.setAttribute(
        "style",
        "color:white; background-color:"
            + LINE_COLORS[station.properties["LINE"]]
    );
}

/**
 * Inverse of updateStationText; reset the appearance of a station sign to
 * indicate that no selection has been made.
 * @param {string} id The ID of the element to be updated.
 */
function resetStationText(id) {
    var padding = "&nbsp;&nbsp;"
    element = document.getElementById(id);
    element.innerHTML = padding + "..." + padding;
    element.setAttribute(
        "style",
        "color:white; background-color:gray"
    );
}

/**
 * Calculate the shortest path between two selected stations and update the
 * interface to display the relevant data. The first time this is called, the
 * start station is set; the second time, the path is calculated.
 * @param {Object} station The Leaflet object of a station.
 */
function shortestPath(station) {

    // remove the instructions and make the exposure graph visible
    document.getElementById("exposure-interface").removeAttribute("style");
    document.getElementById("exposure-instructions")
        .setAttribute("style", "display: none");

    if ((startStation != null) && (station != startStation)) {
        // update station labels in the interface
        updateStationText("end-station", station);

        // calculate the path
        path = jsnx.shortestPath(
            graph,
            {
                source: JSON.stringify([
                    startStation.properties["STATION"],
                    startStation.properties["ROUTE"],
                ]),
                target: JSON.stringify([
                    station.properties["STATION"],
                    station.properties["ROUTE"]
                ]),
                weight: "weight"
            }
        );

        // color the path on the map
        colorPath(path);

        // redraw the exposure graph
        currentPath = featuresAlongPath(path);
        currentQuantity = document.getElementById("quantity-selector").value;
        console.log("selected path", currentPath);
        redrawGraph(currentPath, currentQuantity);

        // reset startStation to null
        startStation = null;
    } else {
        updateStationText("start-station", station);
        resetStationText("end-station");
        startStation = station;
        colorPath([]);
    }

}

fetch("data/segments.geojson")
    .then(function(response) {
        return response.json();
    })
    .then(function(data) {
        initGraph(data, CONNECTIONS);
    });

// leaflet components
Esri_WorldImagery.addTo(map);
segmentsBlankLayer.addTo(map);
stationsBlankLayer.setZIndex(5000).addTo(map);
segmentsLayer.setZIndex(10000).addTo(map);
stationsLayer.setZIndex(15000).addTo(map);

// hack to fix the data layer not being in the front; not sure why it isn't
// sometimes
map.on("overlayadd", function (e) {
    stationsBlankLayer.bringToFront();
    segmentsDataLayer.bringToFront();
    stationsLayer.bringToFront();
})
window.setTimeout(function() {
    stationsBlankLayer.bringToFront();
    segmentsLayer.bringToFront();
    stationsLayer.bringToFront();
}, 2000);

// station text
resetStationText("start-station");
resetStationText("end-station");
