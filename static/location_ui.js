var subwayLinesTable = document.getElementById("subway-lines"),
    stationButtons = subwayLinesTable.getElementsByTagName("td"),
    activeStationButton = null,
    sourceInput = document.getElementById("source"),
    statusInput = document.getElementById("status"),
    locationInput = document.getElementById("location"),
    positionInput = document.getElementById("position"),
    submitButton = document.getElementById("submit"),
    responseFrame = document.getElementById("response-frame"),
    station = "northeastern";

function Selector(containingTable, options, defaultOption = 1, label_index_adjust = 1) {
    this.options = options;
    this.activeOption = this.options[defaultOption];
    this.buttons = [];

    var newRow = document.createElement("tr"),
        selector = this;

    this.selectOption = function(option) {
        this.activeOption = option;
        for (var j = 0; j < this.buttons.length; j++) {
            var button = this.buttons[j];
            if (button.innerHTML.startsWith(option)) {
                button.setAttribute("class", "selected-status");
            } else {
                button.removeAttribute("class");
            }
        }
    }

    this.cycle = function(direction = 1) {
        for (var i = 0; i < this.options.length; i++) {
            if (this.options[i] == this.activeOption) {
                var nOptions = this.options.length,
                    newIndex = (((i + direction) % nOptions) + nOptions) % nOptions;
                this.selectOption(this.options[newIndex]);
                return newIndex;
            }
        }
    }

    for (var i = 0; i < options.length; i++) {
        var thisOption = options[i];
        td = document.createElement("td");
        td.innerHTML = thisOption + " (" + (i + label_index_adjust) +  ")";
        (function(selector, option) {
            td.onclick = function() {
                selector.selectOption(option);
                updateForms();
            }
        })(selector, thisOption);
        newRow.appendChild(td);
        this.buttons.push(td);
    }

    containingTable.appendChild(newRow);
    this.selectOption(this.activeOption);
}

var statusSelector = new Selector(
    document.getElementById("status-selector"),
    ["entering", "stopped", "leaving", "left"],
    1
);
var positionSelector = new Selector(
    document.getElementById("position-selector"),
    ["subway car", "platform center", "platform entrance", "platform exit", "START", "END"],
    0,
    5
);

// update the forms and ui to reflect inputs
function updateForms() {
    locationInput.value = station;
    statusInput.value = statusSelector.activeOption;
    positionInput.value = positionSelector.activeOption;

    for (var i = 0; i < stationButtons.length; i++) {
        var stationButton = stationButtons[i];
        if (stationButton.innerHTML == station) {
            activeStationButton = stationButton;
            stationButton.setAttribute("class", "selector-active");
        } else if (stationButton.innerHTML.length != 0) {
            stationButton.removeAttribute("class");
        }
    }
}

// station selector
for (var i = 0; i < stationButtons.length; i++) {
    var stationButton = stationButtons[i];
    var thisStation = stationButton.innerHTML;

    // make blank stationButtons invisible
    if (thisStation.length == 0) {
        stationButton.setAttribute("class", "blank");

    // connect events to other stationButtons
    } else {
        (function(thisStation) {
            stationButton.onclick = function() {
                station = thisStation;
                updateForms();
            }
        })(thisStation);
    }

}

var stationButtonsTable = [];
var lines = subwayLinesTable.getElementsByTagName("tr");
for (var i = 0; i < lines.length; i++) {
    stationButtonsTable.push(lines[i].getElementsByTagName("td"));
}

function findTableCoordinates() {
    for (var i = 0; i < stationButtonsTable.length; i++) {
        var line = stationButtonsTable[i]
        for (var j = 0; j < line.length; j++) {
            if (line[j] == activeStationButton) {
                return [i, j];
            }
        }
    }
}

function stationTableNav(xDirection, yDirection, focus = true) {
    var coords = findTableCoordinates();
    var newButton = stationButtonsTable[coords[0] + yDirection][coords[1] + xDirection];
    // TODO: jump rows if rows share the same colour (e.g. green symphony -> green copley)
    if (newButton !== undefined) {
        newButton.click();
        if (focus) {
            newButton.scrollIntoView();
        }
    }
}

function cycleStation(direction = 1) {
    if (statusSelector.cycle() == 0) {
        if (direction == 1) {
            stationTableNav(1, 0, false);
        } else {
            stationTableNav(-1, 0, false);
        }
    }
}

document.getElementById("next-state").onclick = function() {
    cycleStation(1);
	updateForms();
    document.getElementById("location-form").submit();
}
document.getElementById("prev-state").onclick = function() {
    cycleStation(-1);
	updateForms();
    document.getElementById("location-form").submit();
}
document.getElementById("selector-submit").onclick = function() {
    document.getElementById("location-form").submit();
}

document.addEventListener("keydown", function(e) {
    var key = e.key,
        target = e.target;
    if (target == document.body) {
        var i = parseInt(key);
        if (Number.isInteger(i)) {
            if (i == 0) {
                positionSelector.selectOption(positionSelector.options[positionSelector.options.length - 1]);
                updateForms();
            } else if (i <= statusSelector.options.length) {
                statusSelector.selectOption(statusSelector.options[i - 1]);
                updateForms();
            } else if (i <= positionSelector.options.length + 4) {
                positionSelector.selectOption(positionSelector.options[i - 1 - statusSelector.options.length]);
                updateForms();
            }
        } else switch (key) {
            case "Tab":
                e.preventDefault();
                statusSelector.cycle();
                updateForms();
                break;
            case "`":
                e.preventDefault();
                positionSelector.cycle();
                updateForms();
                break;
            case "h":
            case "ArrowLeft":
                stationTableNav(-1, 0);
                break;
            case "j":
            case "ArrowDown":
                stationTableNav(0, 1);
                break;
            case "k":
            case "ArrowUp":
                stationTableNav(0, -1);
                break;
            case "l":
            case "ArrowRight":
                stationTableNav(1, 0);
                break;
            default:
                break;
        }
    }
});

updateForms();
