// adapted from https://www.d3-graph-gallery.com/graph/histogram_basic.html
var marginBottom = 20,
    marginSides = 5;

var histogramNode = document.getElementById("histogram-div"),
    svg = d3.select(histogramNode).append("svg");

var nBins = 30;

var rawData, maxSmallParticles;

function redrawHistogram(filterFunction = (function() {return true; })) {
    var width = histogramNode.clientWidth - marginSides - marginSides,
        height = histogramNode.clientHeight - marginBottom;

    // x scale
    var xScale = d3.scaleLinear()
        .domain([0, maxSmallParticles])
        .range([0, width]);

    // histogram binning
    var histogram = d3.histogram()
        .value(function(d) { return Number.parseInt(d["SMALLPARTICLES"]); })
        .domain(xScale.domain())
        .thresholds(xScale.ticks(nBins))

    var bins = histogram(rawData.filter(filterFunction)),
        bins2 = histogram(rawData.filter(filterFunction).filter(function(d) {
            return d["load"] == "rush_hour";
        }));

    // y scale (dependent on histogram)
    var yScale = d3.scaleLinear()
        .range([height, 0])
        .domain([0, d3.max(bins, function(d) { return d.length; })]);

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

d3.csv("data/segments-old.csv", function(data) {
    rawData = data;
    maxSmallParticles = d3.max(data, function(d) { return +d["SMALLPARTICLES"]; });
});
