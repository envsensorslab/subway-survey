// adapted from https://www.d3-graph-gallery.com/graph/histogram_basic.html
var marginBottom = 20,
    marginSides = 5;

var histogramNode = document.getElementById("histogram-div"),
    svg = d3.select(histogramNode).append("svg");

var nBins = 30;

var histograms;
fetch("data/histograms.json")
    .then(function(response) {
        return response.json();
    })
    .then(function(data) {
        histograms = data;
    });

function redrawHistogram(featureProperties) {
    var width = histogramNode.clientWidth - marginSides - marginSides,
        height = histogramNode.clientHeight - marginBottom;

    // histogram label
    document.getElementById("histogram-axis").innerHTML = metadata[currentQuantity]["axis"];

    // look for the histogram data
    var allHistogramData = histograms[currentQuantity][currentGeometryType],
        quantityMax = d3.max(allHistogramData, function(d) { return d["max"]; }),
        quantityMin = d3.min(allHistogramData, function(d) { return d["min"]; }),
        histogramData;
    for (var possibleHistogramData of allHistogramData) {
        if (
            (
                (currentGeometryType == "segments")
                && (possibleHistogramData["START_STATION"] == featureProperties["START_STATION"])
                && (possibleHistogramData["END_STATION"] == featureProperties["END_STATION"])
                && (possibleHistogramData["ROUTE"] == featureProperties["ROUTE"])
            ) || (
                (currentGeometryType == "stations")
                && (possibleHistogramData["STATION"] == featureProperties["STATION"])
                && (possibleHistogramData["ROUTE"] == featureProperties["ROUTE"])
            )
        ) {
            histogramData = possibleHistogramData;
            break;
        }
    };

    // update histogram count
    document.getElementById("sample-count").innerHTML = d3.sum(histogramData["values"]);
    if (currentGeometryType == "segments") {
        document.getElementById("geometry-type").innerHTML = "track segment";
    } else {
        document.getElementById("geometry-type").innerHTML = "station";
    }

    // reconstruct histogram bins
    var binWidth = (histogramData["max"] - histogramData["min"]) / histogramData["bins"],
        bins = histogramData["values"].map(function(bin, i) {
          return {
            "length": bin,
            "x0": histogramData["min"] + (binWidth * i),
            "x1": histogramData["min"] + (binWidth * (i + 1)),
          };
        });

    // x scale
    var xScale = d3.scaleLinear()
        .domain([quantityMin, quantityMax])
        .range([0, width]);

    // y scale (dependent on histogram)
    var yScale = d3.scaleLinear()
        .range([height, 0])
        .domain([0, d3.max(histogramData["values"])]);

    // resize graph
    svg
        .attr("width", width)
        .attr("height", height + marginBottom)
        .append("g")

    // clear graph
    svg.selectAll("*").remove();

    // append x axis
    svg.append("g")
        .attr("transform", "translate(" + marginSides + "," + height + ")")
        .call(d3.axisBottom(xScale));

    // draw rectangles
    // format of bins: [{x0: min, x1: max, length: height}, ...]
    var baseHistogram = svg.selectAll("rect")
        .data(bins)
        .enter()
        .append("rect")
            .attr("x", 1)
            .attr("transform", function(d) {
                return "translate(" + xScale(d.x0) + "," + yScale(d.length) + ")";
            })
            .attr("width", function(d) {
                return xScale(d.x1) - xScale(d.x0) + 1;
            })
            .attr("height", function(d) {
                return height - yScale(d.length);
            })
            .style("fill", "black");
}

// wait until histogram div becomes visible before drawing
function redrawHistogramWhenVisible(...args) {
    if (histogramNode.offsetParent === null) {
        window.setTimeout(function() {
            redrawHistogramWhenVisible(...args);
        }, 50);
    } else {
        redrawHistogram(...args);
    }
}

