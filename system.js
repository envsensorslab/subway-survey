// leaflet layers initialization

// line colors come from the MBTA website
var LINE_COLORS = {
    "Orange": "#ed8b00",
    "Red": "#da291c",
    "Green": "#00843d",
    "Blue": "#003da5"
}
var SEGMENTS_LAYER_THICKNESS = 6;
var STATIONS_LAYER_THICKNESS = 4;

var segmentsDataLayer,
    stationsDataLayer,
    currentSegmentsData,
    currentStationsData,
    currentQuantity,
    currentGeometryType,
    currentMax;

var segmentsData,
    stationsData,
    metadata;

d3.csv("data/segments.csv", function(newData) {
    segmentsData = newData;
})
d3.csv("data/stations.csv", function(newData) {
    stationsData = newData;
})
fetch("data/metadata.json")
    .then(function(response) {
        return response.json();
    })
    .then(function(data) {
        metadata = data;
        initQuantitySelector(metadata);
    });

var map = L.map("map", {
    minZoom: 11,
    maxBounds: [
        [42.17, -71.3],
        [42.47, -70.9]
    ]
}).setView([42.34, -71.09510425], 12);

var scaleBar = L.control.scale()

// form https://leaflet-extras.github.io/leaflet-providers/preview/
var Esri_WorldImagery = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    attribution: "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
    opacity: 0.5
});

var segmentsBlankLayer = new L.GeoJSON.AJAX("data/segments.geojson", {
    style: {
        stroke: true,
        color: "black",
        weight: SEGMENTS_LAYER_THICKNESS + 6,
        interactive: false
    }
});
var stationsBlankLayer = new L.GeoJSON.AJAX("data/stations.geojson", {
    pointToLayer: function (feature, latlng) {
        return L.circleMarker(latlng, {
            color: "black",
            fillOpacity: 1,
            radius: STATIONS_LAYER_THICKNESS + 3,
            interactive: false
        });
    }
});
segmentsBlankLayer.addTo(map);
stationsBlankLayer.setZIndex(5000).addTo(map);

function updateInfo(properties) {
    var propertySpans;

    // update info panel with track segment info
    if ("START_STATION" in properties) {
        // highlight segment
        segmentsBlankLayer.eachLayer(function(layer){
            var feature = layer.feature
            if (
                (feature.properties["START_STATION"] == properties["START_STATION"])
                && (feature.properties["ROUTE"] == properties["ROUTE"])
            ) {
                layer.setStyle({color: "white"});
            } else {
                layer.setStyle({color: "black"});
            }
        });

        // remove all station highlights
        stationsBlankLayer.eachLayer(function(layer){
            layer.setStyle({color: "black"});
        });

        // declare spans to be updated
        var propertySpans = {
            "LINE": "segment-line",
            "ROUTE": "segment-route",
            "GRADE": "under-over",
            "START_STATION": "start-station",
            "END_STATION": "end-station",
            "length_mi": "length",
        }

    // update info panel with station info
    } else {
        // highlight station
        stationsBlankLayer.eachLayer(function(layer){
            var feature = layer.feature
            if (
                (feature.properties["STATION"] == properties["STATION"])
                && (feature.properties["ROUTE"] == properties["ROUTE"])
            ) {
                layer.setStyle({color: "white"});
            } else {
                layer.setStyle({color: "black"});
            }
        });

        // remove all segment highlights
        segmentsBlankLayer.eachLayer(function(layer){
            layer.setStyle({color: "black"});
        });

        // declare spans to be updated
        var propertySpans = {
            "LINE": "station-line",
            "ROUTE": "station-route",
            "STATION": "station",
            "TERMINUS": "terminal-station"
        }
    }

    for (var property in propertySpans) {
        console.log(propertySpans[property], document.getElementById(propertySpans[property]));
        var value = properties[property],
            propertyNode = document.getElementById(propertySpans[property]);

        // custom rule: orange and blue line don't have route
        // information so exclude it
        if (
            (property == "ROUTE")
            && (
                (properties["LINE"] == "Orange")
                || (properties["LINE"] == "Blue")
            )
        ) {
            propertyNode.innerHTML = "";

        // custom rule: determine above/below ground based on grade
        // definitions here: https://docs.digital.mass.gov/dataset/massgis-data-mbta-rapid-transit
        // 7 = underground
        } else if (property == "GRADE") {
            if (value == "7") {
                propertyNode.innerHTML = "underground";
            } else if (value.includes("7")) {
                propertyNode.innerHTML = "partially underground";
            } else {
                propertyNode.innerHTML = "above ground";
            }

        // custom rule: determine if a station is terminal
        } else if (property == "TERMINUS") {
            if (value == "Y") {
                propertyNode.innerHTML = "terminal";
            } else {
                propertyNode.innerHTML = "";
            }

        // station names: make thicker and all caps
        } else if (
            (property == "START_STATION")
            || (property == "END_STATION")
            || (property == "STATION")
        ) {
            var padding = "&nbsp;&nbsp;"
            propertyNode.innerHTML = padding + value.toUpperCase() + padding;

        // all others: no modification to the value
        } else {

            // round floating points to 2 decimals
            if ((typeof(value) == "number") && !(Number.isInteger(value))) {
                value = value.toFixed(2);
            }

            propertyNode.innerHTML = value;
        }
    }

    // color station names
    var line = properties["LINE"],
        stationStyle = "color:white; background-color:" + LINE_COLORS[line]
    document.getElementById("start-station").setAttribute("style", stationStyle);
    document.getElementById("end-station").setAttribute("style", stationStyle);
    document.getElementById("station").setAttribute("style", stationStyle);

    // redraw histogram
    redrawHistogramWhenVisible(properties);
}

// show info panel toggles
function showSegmentInfo() {
    document.getElementById("info-instructions").setAttribute("style", "display: none");
    document.getElementById("info").removeAttribute("style");
    document.getElementById("station-info").setAttribute("style", "display: none");
    document.getElementById("segment-info").removeAttribute("style");
}
function showStationInfo() {
    document.getElementById("info-instructions").setAttribute("style", "display: none");
    document.getElementById("info").removeAttribute("style");
    document.getElementById("segment-info").setAttribute("style", "display: none");
    document.getElementById("station-info").removeAttribute("style");
}

function redrawMap(quantityValue) {
    var quantityMetadata = metadata[quantityValue],
        colormapName = quantityMetadata["colormap"];

    currentQuantity = quantityValue;

    // subset data
    var currentSegmentsData = segmentsData.filter(function(d) {
        return (d["quantity"] == quantityValue) && (d["DIRECTION"] == "");
    });
    var currentStationsData = stationsData.filter(function(d) {
        return ( d["quantity"] == quantityValue) && (d["DIRECTION"] == "");
    });

    // determine upper bound
    var segmentsMax = d3.max(currentSegmentsData, function(d) { return +d["center"] }),
        stationsMax = d3.max(currentStationsData, function(d) { return +d["center"] });
    if (quantityValue.includes("off_peak")) {
        // for off-peak selections, try to draw maximums from the rush hour
        // conditions
        var rushHourQuantity = quantityValue.replace("off_peak", "rush_hour");
        var rushHourSegmentsData = segmentsData.filter(function(d) {
            return (d["quantity"] == rushHourQuantity) && (d["DIRECTION"] == "");
        });
        var rushHourStationsData = stationsData.filter(function(d) {
            return ( d["quantity"] == rushHourQuantity) && (d["DIRECTION"] == "");
        });
        segmentsMax = d3.max(rushHourSegmentsData, function(d) { return +d["center"] }),
        stationsMax = d3.max(rushHourStationsData, function(d) { return +d["center"] });
    }
    if (quantityValue == "vibration") {
        currentMax = segmentsMax;
    } else {
        currentMax = Math.max(segmentsMax, stationsMax);
    }

    // colorbar
    colorbar.recolor(colormapName);
    document.getElementById("colorbar-label").innerHTML
        = quantityMetadata["center_desc"] + " " + quantityMetadata["axis"];
    document.getElementById("colorbar-max").innerHTML = Math.round(currentMax);
    document.getElementById("colorbar-mid").innerHTML = Math.round(currentMax/2);

    // segments map
    segmentsDataLayer = new L.GeoJSON.AJAX("data/segments-centers.geojson", {
        style: function(feature) {
            var value = feature.properties[quantityValue];
            if (value === null) {
                return {
                    stroke: false
                }
            } else {
                return {
                    stroke: true,
                    color: colormap(value, 0, currentMax, colormapName),
                    weight: SEGMENTS_LAYER_THICKNESS
                };
            }
        },
        onEachFeature: function(feature, layer) {
            var oldColor;
            layer.on({
                mouseover: function(e) {
                    var feature = e.target.feature;
                    colorbar.select(
                        Math.round((feature.properties[quantityValue])*255/currentMax)
                    );
                    oldColor = layer.options.color;
                    layer.setStyle({color: "white"});
                },
                mouseout: function(e) {
                    colorbar.clear();
                    layer.setStyle({color: oldColor});
                },
                click: function(e) {
                    var feature = e.target.feature;
                    currentGeometryType = "segments";
                    updateInfo(feature.properties);
                    showSegmentInfo();
                }
            })
        }
    });
    segmentsDataLayer.setZIndex(10000).addTo(map);

    // stations map
    if (quantityValue != "vibration") {
        stationsDataLayer = new L.GeoJSON.AJAX("data/stations-centers.geojson", {
            pointToLayer: function(feature, latlng) {
                var value = feature.properties[quantityValue];
                if (value !== null) {
                    return L.circleMarker(latlng, {
                        color: colormap(value, 0, currentMax, colormapName),
                        fillOpacity: 1,
                        radius: STATIONS_LAYER_THICKNESS
                    });
                }
            },
            onEachFeature: function(feature, layer) {
                var oldColor;
                layer.on({
                    mouseover: function(e) {
                        var feature = e.target.feature;
                        colorbar.select(
                            Math.round((feature.properties[quantityValue])*255/currentMax)
                        );
                        oldColor = layer.options.color;
                        layer.setStyle({color: "white"});
                    },
                    mouseout: function(e) {
                        colorbar.clear();
                        layer.setStyle({color: oldColor});
                    },
                    click: function(e) {
                        var feature = e.target.feature;
                        currentGeometryType = "stations";
                        updateInfo(feature.properties);
                        showStationInfo();
                    }
                })
            }
        });
        stationsDataLayer.setZIndex(15000).addTo(map);
    }

    // hack to fix the data layer not being in the front; not sure why it isn't sometimes
    map.on("overlayadd", function (e) {
        if (quantityValue != "vibration") {
            stationsBlankLayer.bringToFront();
        }
        segmentsDataLayer.bringToFront();
        if (quantityValue != "vibration") {
            stationsDataLayer.bringToFront();
        }
    });
    window.setTimeout(function() {
        if (quantityValue != "vibration") {
            stationsBlankLayer.bringToFront();
        }
        segmentsDataLayer.bringToFront();
        if (quantityValue != "vibration") {
            stationsDataLayer.bringToFront();
        }
    }, 500);
}

// colorbar
var legend = L.control({position: "topright"});
var colorbar;

function Colorbar(colorbarNode) {
    var thisObject = this;
    this.colorbarNode = colorbarNode;
    this.selectedSegment = null;

    for (var i = 255; i > 0; i--) {
        var colorbarSegment = document.createElement("div");
        colorbarSegment.setAttribute("class", "colorbar-segment");
        //colorbarSegment.setAttribute("style", "background-color:" + colormap(i, 0, 255, "viridis"));
        colorbarNode.appendChild(colorbarSegment);
    }
    this.segments = thisObject.colorbarNode.childNodes;

    this.clear = function() {
        if (thisObject.selectedSegment != null) {
            thisObject.segments[thisObject.selectedSegment].removeAttribute("class");
        }
    }

    this.select = function(segmentIdx) {
        var nSegments = thisObject.segments.length;
        segmentIdx = nSegments - Math.min(segmentIdx, nSegments - 1) - 1;
        thisObject.clear();
        thisObject.selectedSegment = segmentIdx;
        thisObject.segments[segmentIdx].setAttribute("class", "colorbar-selected");
    }

    this.recolor = function(colormapName) {
        for (var i = 0; i < 255; i++) {
            thisObject.segments[254-i].setAttribute(
                "style", "background-color:" + colormap(i, 0, 255, colormapName)
            );
        }
    }

    return this;
}

legend.onAdd = function(map) {
    var div = document.createElement("div"),
        colorbarNode = document.getElementById("colorbar");
    div.setAttribute("id", "legend-outer");
    div.appendChild(document.getElementById("legend-inner"));
    colorbar = new Colorbar(colorbarNode);
    return div;
};

// drop down menus
document.getElementById("info-select").addEventListener("change", function() {
    if (this.value == "histogram") {
        document.getElementById("stats").setAttribute("style", "display: none");
        document.getElementById("histogram").removeAttribute("style");
    } else {
        document.getElementById("stats").removeAttribute("style");
        document.getElementById("histogram").setAttribute("style", "display: none");
    }
});

function initQuantitySelector(quantities) {
    var quantitySelector = document.getElementById("quantity-selector");

    for (const [quantity, properties] of Object.entries(metadata)) {
        var selection = document.createElement("option");
        selection.setAttribute("value", quantity);
        selection.innerHTML = properties["selection"];
        quantitySelector.appendChild(selection);

        // default selection
        if (properties["selection"] == "vibration") {
            selection.setAttribute("selected", "");
        }
    }
    quantitySelector.addEventListener("change", function() {
        if (segmentsDataLayer !== undefined) {
            segmentsDataLayer.remove();
        }
        if (stationsDataLayer !== undefined) {
            stationsDataLayer.remove();
        }
        stationsBlankLayer.eachLayer(function(layer){
            layer.setStyle({color: "black"});
        });
        segmentsBlankLayer.eachLayer(function(layer){
            layer.setStyle({color: "black"});
        });
        redrawMap(this.value);
    });

    window.setTimeout(function() {
        quantitySelector.dispatchEvent(new Event("change"));
    }, 1000);
}
// leaflet components

scaleBar.addTo(map);
Esri_WorldImagery.addTo(map);
legend.addTo(map);
