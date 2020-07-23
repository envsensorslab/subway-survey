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
var OpenStreetMap_Mapnik = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
});

var segmentsBlankLayer = new L.GeoJSON.AJAX("data/segments-nodata.geojson", {
    style: {
        stroke: true,
        color: "black",
        weight: SEGMENTS_LAYER_THICKNESS + 6,
        interactive: false
    }
});
var stationsBlankLayer = new L.GeoJSON.AJAX("data/stations-nodata.geojson", {
    pointToLayer: function (feature, latlng) {
        return L.circleMarker(latlng, {
            color: "black",
            fillOpacity: 1,
            radius: STATIONS_LAYER_THICKNESS + 3,
            interactive: false
        });
    }
});

//var currentMax = 6370;
//var currentMax = 9520;
var currentMax = 12406;
var currentProperty = "mean";

function updateInfoPanel(properties) {
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

    /*
    // highlight start and end stations
    stationsBlankLayer.eachLayer(function(layer){
        var feature = layer.feature
        if (
            (feature.properties["ROUTE"] == properties["ROUTE"])
            && (
                (feature.properties["STATION"] == properties["START_STATION"])
                | (feature.properties["STATION"] == properties["END_STATION"])
            )
        ) {
            layer.setStyle({color: "white"});
        } else {
            layer.setStyle({color: "black"});
        }
    });
    */

    // update info panel
    var propertySpans = {
        "LINE": "line",
        "ROUTE": "route",
        "GRADE": "under-over",
        "START_STATION": "start-station",
        "END_STATION": "end-station",
        "count": "count",
        "length_mi": "length",

        "SMALLPARTICLES.mean": "mean",
        "SMALLPARTICLES.std": "std",
        "SMALLPARTICLES.min": "min",
        "SMALLPARTICLES.median": "med",
        "SMALLPARTICLES.max": "max"
    }
    for (var property in propertySpans) {
        var value = properties[property];
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

        // station names: make thicker and all caps
        } else if (
            (property == "START_STATION")
            || (property == "END_STATION")
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

    // redraw histogram
    redrawHistogramWhenVisible(function(d) {
        return d["START_STATION"] == properties["START_STATION"];
    });
}

// show info panel
function showInfoPanel() {
    document.getElementById("info-instructions").setAttribute("style", "display: none");
    document.getElementById("info").removeAttribute("style");
}

// hide info panel
function hideInfoPanel() {
    document.getElementById("info-instructions").removeAttribute("style");
    document.getElementById("info").setAttribute("style", "display: none");
}

var segmentsDataLayer = new L.GeoJSON.AJAX("data/segments-old.geojson", {
    style: function(feature) {
        return {
            stroke: true,
            //color: "#ff0000",
            color: mapViridis(feature.properties["SMALLPARTICLES.mean"], 0, currentMax),
            //color: "rgba("
            //    + (feature.properties["SMALLPARTICLES.mean"] * 255 / 6731)
            //    + ",0,0,255)",
            weight: SEGMENTS_LAYER_THICKNESS
        };
    },
    onEachFeature: function(feature, layer) {
        var oldColor;
        layer.on({
            mouseover: function(e) {
                var feature = e.target.feature;

                // update colorbar
                colorbar.select(
                    Math.round((feature.properties["SMALLPARTICLES." + currentProperty] - 0)*255/currentMax)
                );

                // color item
                oldColor = layer.options.color;
                layer.setStyle({color: "red"});
            },
            mouseout: function(e) {
                // reset colorbar
                colorbar.clear();

                // reset color
                layer.setStyle({color: oldColor});
            },
            click: function(e) {
                var feature = e.target.feature;

                updateInfoPanel(feature.properties);
                showInfoPanel();
            }
        })
    }
});

var stationsDataLayer = new L.GeoJSON.AJAX("data/stations-old.geojson", {
    pointToLayer: function (feature, latlng) {
        return L.circleMarker(latlng, {
            color: mapViridis(feature.properties["SMALLPARTICLES.mean"], 0, currentMax),
            fillOpacity: 1,
            radius: STATIONS_LAYER_THICKNESS,
            interactive: false
        });
    }
});

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
        colorbarSegment.setAttribute("style", "background-color:" + mapViridis(i, 0, 255));
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

document.getElementById("metric-select").addEventListener("change", function() {
    currentProperty = this.value;
    /* XXX deprecated - constant predefined max value
    currentMax = 0;

    // find the max value
    segmentsDataLayer.eachLayer(function(featureInstanceLayer) {
        var property = featureInstanceLayer.feature.properties[
            "SMALLPARTICLES." + currentProperty
        ];
        currentMax = Math.max(property, currentMax);
    });
    */

    // update visuals
    segmentsDataLayer.eachLayer(function(featureInstanceLayer) {
        var property = featureInstanceLayer.feature.properties[
            "SMALLPARTICLES." + currentProperty
        ];
        featureInstanceLayer.setStyle({
            color: mapViridis(property, 0, currentMax)
        });
    });
    stationsDataLayer.eachLayer(function(featureInstanceLayer) {
        var property = featureInstanceLayer.feature.properties[
            "SMALLPARTICLES." + currentProperty
        ];
        featureInstanceLayer.setStyle({
            color: mapViridis(property, 0, currentMax)
        });
    });

    // update colorbar
    document.getElementById("colorbar-label").innerHTML = currentProperty.charAt(0).toUpperCase() + currentProperty.substring(1) + "<br>small<br>particles"
    document.getElementById("colorbar-max").innerHTML = Math.round(currentMax);
    document.getElementById("colorbar-mid").innerHTML = Math.round(currentMax/2);
});

document.getElementById("info-select").addEventListener("change", function() {
    console.log(this.value);
    if (this.value == "histogram") {
        document.getElementById("stats").setAttribute("style", "display: none");
        document.getElementById("histogram").removeAttribute("style");
    } else {
        document.getElementById("stats").removeAttribute("style");
        document.getElementById("histogram").setAttribute("style", "display: none");
    }
});

// leaflet components

scaleBar.addTo(map);
Esri_WorldImagery.addTo(map);
segmentsBlankLayer.addTo(map);
stationsBlankLayer.setZIndex(5000).addTo(map);
segmentsDataLayer.setZIndex(10000).addTo(map);
stationsDataLayer.setZIndex(15000).addTo(map);
legend.addTo(map);

// hack to fix the data layer not being in the front; not sure why it isn't sometimes
map.on("overlayadd", function (e) {
    stationsBlankLayer.bringToFront();
    segmentsDataLayer.bringToFront();
    stationsDataLayer.bringToFront();
});
window.setTimeout(function() {
    console.log("test");
    stationsBlankLayer.bringToFront();
    segmentsDataLayer.bringToFront();
    stationsDataLayer.bringToFront();
}, 2000);
