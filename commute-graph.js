var LINE_COLORS = {
    "Orange": "#ed8b00",
    "Red": "#da291c",
    "Green": "#00843d",
    "Blue": "#003da5"
}
var LINE_COLORS_PASTEL = {
    "Orange": "#f1ad81",
    "Red": "#e38583",
    "Green": "#81a98a",
    "Blue": "#818abe"
}
var LINE_COLORS_INACTIVE = {
    // generated by reducing HSV saturation by 40
    "Orange": "#874f00",
    "Red": "#74160f",
    "Green": "#001e0e",
    "Blue": "#00173f"
}
var STATION_LABEL_MARGIN = {
    x: 5,
    y: 2
}
var GRAPH_MARGIN = {
    top: 20,
    left: 70, // must accommodate scale and axis label
    bottom: 20,
    right: 20
}
var X_AXIS_TRANSFORM = 20; // to make way for the y label

var segmentsData,
    stationsData,
    metadata,
    referenceValues;

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
fetch("data/reference-values.json")
    .then(function(response) {
        return response.json();
    })
    .then(function(data) {
        referenceValues = data;
    });

var graphNode = document.getElementById("exposure-graph"),
    svg = d3.select(graphNode).append("svg");

function weightedAverage(data, valueField, weightField) {
    var accumulation = 0,
        totalWeight = 0;
    for (const datum of data) {
        if (datum[valueField] != null) {
            accumulation += (datum[valueField] * datum[weightField]);
            totalWeight += datum[weightField];
        }
    }
    return accumulation / totalWeight;
}

function initQuantitySelector(quantities) {
    for (const [quantity, properties] of Object.entries(metadata)) {
        var selection = document.createElement("option");
        selection.setAttribute("value", quantity);
        selection.innerHTML = properties["selection"];
        document.getElementById("quantity-selector").appendChild(selection);

        // default selection
        if (properties["selection"] == "small particles (rush hour)") {
            selection.setAttribute("selected", "");
        }
    }
    document.getElementById("quantity-selector").addEventListener("change", function() {
        currentQuantity = this.value;
        if (currentPath != null) {
            redrawGraph(currentPath, currentQuantity);
        }
    });
}

/**
 * Draw a station label into the given SVG container. A station label roughly
 * mimics the style of the MBTA station signs.
 * @param {Object[]} container The container to draw this svg element into.
 * @param {number} x The X position to draw this label centered at.
 * @param {number} y The Y position to draw this label at.
 * @param {string} text The text of this label.
 * @param {backgroundColor} text The backgroud color of this label.
 * @param {number} minX The minimum X position that this label can occupy; if
 *   the label stretches beyond this, it is translated to fit.
 * @param {number} maxX The maximum X position that this label can occupy; if
 *   the label stretches beyond this, it is translated to fit.
 */
function createStationLabel(container, x, y, text, backgroundColor, minX, maxX) {
    var stationLabel = container.append("text")
        .attr("fill", "white")
        .attr("font-weight", "bold")
        .attr("text-anchor", "middle")
        .attr("x", x)
        .attr("y", y)
        .text(text);

    // create station label background
    var textBBox = stationLabel.node().getBBox();
    container.insert("rect", "text")
        .attr("x", textBBox.x - STATION_LABEL_MARGIN.x)
        .attr("y", textBBox.y - STATION_LABEL_MARGIN.y)
        .attr(
            "width",
            textBBox.width + (STATION_LABEL_MARGIN.x * 2)
        )
        .attr(
            "height",
            textBBox.height + (STATION_LABEL_MARGIN.y * 2)
        )
        .style("fill", backgroundColor);

    // make adjustments if the label moves off of the graph
    var stationLabelBBox = container.node().getBBox(),
        stationLabelMaxX = stationLabelBBox.x
            + stationLabelBBox.width;
    if (stationLabelBBox.x < minX) {
        container
            .attr(
                "transform",
                "translate(" + (minX - stationLabelBBox.x) + ",0)"
            );
    } else if (stationLabelMaxX  > maxX) {
        container
            .attr(
                "transform",
                "translate(" + (maxX - stationLabelMaxX + 5)
                    + ",0)"
            );
    }
}

/**
 * Update the exposure graph.
 * @param {Object[]} features An array of GeoJSON features corresponding to the
 *   path to be visualized.
 * @param {string} quantity The quantity to plot, appearing in the keys of
 *   data/metadata.json.
 */
function redrawGraph(locations, quantityValue) {
    // graph dimensions
    var width = graphNode.clientWidth,
        height = graphNode.clientHeight,
        plotWidth = width - GRAPH_MARGIN.left - GRAPH_MARGIN.right,
        plotHeight = height - GRAPH_MARGIN.top - GRAPH_MARGIN.bottom;

    // locate the correct quantity to pull properties from
    var quantityProperties;
    for (const [quantity, properties] of Object.entries(metadata)) {
        if (quantity == quantityValue) {
            quantityProperties = properties;
            break;
        }
    }

    // load data
    var dataThisDir = [],
        dataOtherDir = [],
        dataBothDirs = [];
    for (var i = 0; i < locations.length; i++) {
        var loc = locations[i],
            properties = loc["layer"]["feature"]["properties"],
            locationData = [];

        if ("STATION" in properties) { // station
            locationData = stationsData.filter(function(d) {
                return (
                    d["STATION"] == properties["STATION"]
                ) && (
                    d["ROUTE"] == properties["ROUTE"]
                ) && (
                    d["quantity"] == quantityValue
                );
            });
        } else { // segment
            locationData = segmentsData.filter(function(d) {
                return (
                    d["START_STATION"] == properties["START_STATION"]
                ) && (
                    d["END_STATION"] == properties["END_STATION"]
                ) && (
                    d["ROUTE"] == properties["ROUTE"]
                ) && (
                    d["quantity"] == quantityValue
                );
            });
        }

        // sort out by direction - CAUTION: 0 == ""; to avoid typecasting, we
        // use === here instead
        for (const datum of locationData) {
            datum["PLOT_INDEX"] = i;
            // blank string "" == "not aggregated by direction"
            if (datum["DIRECTION"] !== "") {
                if (+datum["DIRECTION"] == loc["direction"]) {
                    dataThisDir.push(datum);
                } else {
                    dataOtherDir.push(datum);
                }
            }
        }

        // update plot index
        locations[i]["PLOT_INDEX"] = i;
    }
    dataBothDirs = dataThisDir.concat(dataOtherDir);

    // clear current graph
    svg.selectAll("*").remove();


    // hatching definition
    // credit: https://stackoverflow.com/a/17777121
    svg
        .append("defs")
        .append("pattern")
            .attr("id", "diagonalHatch")
            .attr("patternUnits", "userSpaceOnUse")
            .attr("width", 4)
            .attr("height", 4)
        .append("path")
            .attr("d", "M-1,1 l2,-2 M0,4 l4,-4 M3,5 l2,-2")
            .attr("stroke", "lightgrey")
            .attr("stroke-width", 1);

    // resize graph
    svg
        .attr("width", width)
        .attr("height", height)

    // x scale
    var xScale = d3.scaleLinear()
        .domain([0, locations.length - 1])
        .range([X_AXIS_TRANSFORM, plotWidth]);

    // y axis label
    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 0)
        .attr("x", -height/2)
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .style("font-size", "13px")
        .text(quantityProperties["axis"]);

    // start calculating and plotting direction-specific values and features
    for (const primaryDirection of [true, false]) {
        var canvasHeight = plotHeight * 2 / 5; // leave 1/5th in the center
        var plotData;

        // filter data
        if (primaryDirection) {
            plotData = dataThisDir;
        } else {
            plotData = dataOtherDir;
        }

        // y scale
        var maxY = d3.max(dataBothDirs, function(d) {
            return Math.max(d["center"], d["upper"]);
        });
        var yscale;

        if (quantityValue in referenceValues) {
            maxY = Math.max(
                maxY,
                d3.max(referenceValues[quantityValue], function(d) {
                    return d["value"];
                })
            );
        }

        if (primaryDirection) {
            yScale = d3.scaleLinear()
                .domain([0, maxY])
                .range([canvasHeight, 0]);
        } else {
            yScale = d3.scaleLinear()
                .domain([0, maxY])
                .range([0, canvasHeight]);
        }

        // create canvas
        var canvas,
            canvasLabel;
        if (primaryDirection) {
            canvas = svg.append("g")
                .attr("width", plotWidth)
                .attr("height", canvasHeight)
                .attr(
                    "transform",
                    "translate(" + GRAPH_MARGIN.left + "," + GRAPH_MARGIN.top
                    + ")"
                );
            canvasLabel = "Selected direction";
        } else {
            canvas = svg.append("g")
                .attr("width", plotWidth)
                .attr("height", canvasHeight)
                .attr(
                    "transform",
                    "translate(" + GRAPH_MARGIN.left + ","
                    + (GRAPH_MARGIN.top + canvasHeight + (plotHeight / 5)) + ")"
                );
            canvasLabel = "Other direction";
        }
        canvas.append("text")
            .attr("transform", "rotate(-90)")
            .attr("y", 0)
            .attr("x", -canvasHeight/2)
            .attr("dy", "1em")
            .style("text-anchor", "middle")
            .style("font-size", "12px")
            .text(canvasLabel);

        // create y yxis
        canvas.append("g")
            .call(d3.axisLeft(yScale).ticks(4));

        // function to generate lines
        // to use: canvas.append("path").attr("d", lineGenerator(data)
        var lineGenerator = d3.line()
            .x(function(d) { return xScale(d["PLOT_INDEX"]) })
            .y(function(d) { return yScale(d["center"]) })

        // reference values
        if (quantityValue in referenceValues) {
            for (const referenceValue of referenceValues[quantityValue]) {
                if (!("noplot" in referenceValue)) {
                    var textHeight;

                    // line
                    if ("value" in referenceValue) {
                        var value = referenceValue["value"];
                        textHeight = yScale(value) - 4;

                        canvas.append("path")
                            .attr("d", lineGenerator([
                                {"PLOT_INDEX": 0, "center": value},
                                {"PLOT_INDEX": locations.length - 1, "center": value}
                            ]))
                            .style("stroke-dasharray", ("6, 3"))
                            .attr("fill", "none")
                            .attr("stroke", "lightgrey")


                    // range
                    } else {
                        var top_, bottom, height;
                        if (primaryDirection) {
                            top_ = yScale(referenceValue["lower"]);
                            bottom = yScale(referenceValue["upper"]);
                            textHeight = bottom - 4;
                        } else {
                            top_ = yScale(referenceValue["upper"]);
                            bottom = yScale(referenceValue["lower"]);
                            textHeight = top_ + 12;
                        }

                        canvas.append("rect")
                            .attr("x", xScale(0))
                            .attr("y", bottom)
                            .attr("width", xScale(locations.length))
                            .attr("height", top_ - bottom)
                            .attr("fill", "url(#diagonalHatch)");

                    }

                    // repeat text periodically for banner effect
                    var referenceValueLabel = "";
                    for (var i = 0; i < 30; i++) {
                        referenceValueLabel += referenceValue["label"];
                        referenceValueLabel += " ".repeat(30);
                    }
                    canvas.append("text")
                        .attr("fill", "lightgrey")
                        .attr("font-weight", "bold")
                        .attr("x", X_AXIS_TRANSFORM)
                        .attr("y", textHeight)
                        .style("font-size", "12px")
                        .style("white-space", "pre")
                        .text(referenceValueLabel);
                }
            }
        }

        for (const [line, color] of Object.entries(LINE_COLORS)) {
            var filteredData = plotData.filter(function(d) {
                return d["LINE"] == line;
            });

            // chunking of contiguous groups of stations and segments with
            // deviation data - not all geometries have deviation data, so we
            // cannot simply draw an area graph over all the data or we may
            // misrepresent deviations and glitch the graph
            var contiguousDeviations = [];
            var currentContiguousDeviations = [];
            for (const datum of filteredData) {
                if (datum["lower"] == "") {
                    contiguousDeviations.push(currentContiguousDeviations);
                    currentContiguousDeviations = [];
                } else {
                    currentContiguousDeviations.push(datum);
                }
            }
            contiguousDeviations.push(currentContiguousDeviations);

            // variation shaded areas
            for (var contiguousData of contiguousDeviations) {
                // single point
                if (contiguousData.length == 1) {
                    var datum = contiguousData[0],
                        plotX = xScale(datum["PLOT_INDEX"]);

                    // variation bar
                    canvas.append("rect")
                        .attr("fill", "lightgrey")
                        .attr("x", plotX - 2)
                        .attr("y", yScale(datum["upper"]))
                        .attr("width", 4)
                        .attr("height", yScale(datum["lower"]) - yScale(datum["upper"]));

                    // center point
                    canvas.append("circle")
                        .attr("cx", plotX)
                        .attr("cy", yScale(datum["center"]))
                        .attr("r", 3)
                        .attr("fill", color)

                // line of many points
                } else {
                    // variation shaded area
                    canvas.append("path")
                        .data([contiguousData])
                        .attr("fill", "lightgrey")
                        .attr(
                            "d",
                            d3.area()
                                .x(function(d) { return xScale(d["PLOT_INDEX"]) })
                                .y0(function(d) { return yScale(d["lower"]) })
                                .y1(function(d) { return yScale(d["upper"]) })
                        );

                    // center line
                    canvas.append("path")
                        .attr("d", lineGenerator(contiguousData))
                        .attr("fill", "none")
                        .attr("stroke", color)
                        .attr("stroke-width", 3);
                }
            }
        }
    }

    // subway location bar
    var locationCanvasHeight = plotHeight / 5;
    var locationCanvas = svg.append("g")
        .attr("width", plotWidth)
        .attr("height", locationCanvasHeight)
        .attr(
            "transform",
            "translate(" + GRAPH_MARGIN.left + ","
            + (GRAPH_MARGIN.top + (plotHeight * 2 / 5)) + ")"
        );

    var locationLineGenerator = d3.line()
        .x(function(d) { return xScale(d["PLOT_INDEX"]) })
        .y(function(d) { return locationCanvasHeight / 2 });

    // dotted line connecting all locations, representing transfers
    // (underneath the location graph)
    locationCanvas.append("path")
        .attr("d", locationLineGenerator(locations))
        .style("stroke-dasharray", ("6, 3"))
        .attr("fill", "none")
        .attr("stroke", "grey")
        .attr("stroke-width", 3);

    // location graph lines -- reusing some code from the data plot loop below
    for (const [line, color] of Object.entries(LINE_COLORS)) {
        var filteredData = locations.filter(function(d) {
            return d["layer"]["feature"]["properties"]["LINE"] == line;
        });

        locationCanvas.append("path")
            .attr("d", locationLineGenerator(filteredData))
            .attr("fill", "none")
            .attr("stroke", color)
            .attr("stroke-width", 10);
    }

    // location graph points
    locationCanvas.selectAll("circle")
        .data(locations)
        .enter()
        .append("circle")
        .attr("cx", function(d) { return xScale(d["PLOT_INDEX"]) })
        .attr("cy", function(d) { return locationCanvasHeight / 2 })
        .attr("r", 5)
        .attr("stroke-width", 3)
        .attr("style", function(d) {
            var properties = d["layer"]["feature"]["properties"],
                line = properties["LINE"]
                lineColor = LINE_COLORS[line],
                segmentColor = LINE_COLORS_PASTEL[line];
            if ("STATION" in properties) { // station
                return "fill:white; stroke:" + lineColor;
            } else { // segment
                return "fill:" + segmentColor + "; stroke:" + lineColor;
            }
        })
        .on("mouseover", function(d, i) {
            // make circle larger
            var circle = d3.select(this)
                .raise()
                .attr("r", 10) // 2x
                .attr("stroke-width", 6); // 2x

            // create popup container
            var popup = locationCanvas.append("g")
                .attr("id", "station-popup");

            var properties = d["layer"]["feature"]["properties"];

            if ("STATION" in properties) {
                // create station label
                createStationLabel(
                    popup.append("g"),
                    circle.attr("cx"),
                    +circle.attr("cy") - 18,
                    properties["STATION"].toUpperCase(),
                    LINE_COLORS[properties["LINE"]],
                    20,
                    plotWidth
                );
            } else {
                // create segment labels
                var backgroundColor = LINE_COLORS[properties["LINE"]],
                    container = popup.append("g"),
                    previousStation,
                    nextStation;
                if (d["direction"] === 0) {
                    previousStation = properties["START_STATION"];
                    nextStation = properties["END_STATION"];
                } else {
                    nextStation = properties["START_STATION"];
                    previousStation = properties["END_STATION"];
                }
                createStationLabel(
                    container,
                    circle.attr("cx"),
                    +circle.attr("cy") - 20,
                    "🡄 " + previousStation.toUpperCase(),
                    backgroundColor,
                    20,
                    plotWidth
                );
                createStationLabel(
                    container,
                    circle.attr("cx"),
                    +circle.attr("cy") + 30,
                    nextStation.toUpperCase() + " 🡆",
                    backgroundColor,
                    20,
                    plotWidth
                );
            }
        })
        .on("mouseout", function(d, i) {
            d3.select(this)
                .attr("r", 5) // original - TODO: store in constant?
                .attr("stroke-width", 3); // original - TODO: store in constant?
            d3.select("#station-popup").remove();
        });

}
