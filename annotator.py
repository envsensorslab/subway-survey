#!/usr/bin/env python3

""" Live annotation tool for recording train locations and statuses.

To run, execute this script. This will start a Flask server on port 8889;
direct a web browser to localhost:8889 to view it.
"""

import csv
import flask
import os
import time

#from sanity_check import sanity_check

PORT = 8889
DATA_DIR = "./data/"

if (not os.path.isdir(DATA_DIR)):
    os.makedirs(DATA_DIR)

start_time = time.time()
paths = {
    key: "./data/%s-%d.csv" % (key, start_time)
    for key in ["locations", "observations"]
}
csv_writers = {
    key: csv.writer(open(paths[key], "w", 1))
    for key in paths
}
csv_writers["locations"].writerow(["TIMESTAMP", "LOCATION", "POSITION", "STATUS"])
csv_writers["observations"].writerow(["TIMESTAMP", "SENSOR", "VALUE", "NOTES"])
for (key, path) in paths.items():
    print("writing %s to %s" % (key, path))

print("")
app = flask.Flask(__name__)

@app.route("/", methods = ["GET"])
def index():
    with open("./annotator.html", "r", encoding = "utf-8") as f:
        return f.read()

@app.route("/update_location", methods = ["POST"])
def update_location():
    """ Update and save the current location. """
    form = flask.request.form
    if (form):
        location = (
            time.time(), form.get("location_name"), form.get("position_name"), form.get("status")
        )

        for field in location[1:]:
            if (len(field) == 0):
                return flask.jsonify({"error": "blank field in input"})

        csv_writers["locations"].writerow(location)
        print(location)
        return flask.jsonify({
            "received": {
                "location": location
            }
        })
    else:
        return flask.jsonify({"error": "blank form"})

@app.route("/new_observation", methods = ["POST"])
def new_observation():
    """ Create a new observation. """
    form = flask.request.form

    if (form):
        sensor = form.get("sensor")
        raw_value = form.get("value")

        if (len(sensor) == 0):
            return flask.jsonify({"error": "blank sensor"})
        elif (len(raw_value) == 0):
            return flask.jsonify({"error": "blank value"})
        else:
            notes = form.get("notes")
            if (len(notes) == 0):
                notes = None

            # sanity checking and auto correction
            """ code for this was lost; will have to reimplement in the future
            try:
                sane_value = sanity_check(sensor, raw_value)
            except Exception as err:
                return flask.jsonify({
                    "error": "sanity check failed",
                    "exception_text": str(err)
                })
            """

            if (sane_value):
                row = [time.time(), sensor, sane_value, notes]
                csv_writers["observations"].writerow(row)
                print(row)
                return flask.jsonify({
                    "received": {
                        "sensor": sensor,
                        "raw_value": raw_value,
                        "sane_value": sane_value,
                        "notes": notes
                    }
                })

            else:
                return flask.jsonify({"error": "sanity check and auto correction failed"})

    else:
        return flask.jsonify({"error": "blank form"})

if (__name__ == "__main__"):
    import webbrowser
    webbrowser.open_new_tab("http://localhost:%d" % PORT)
    app.run(port = PORT, debug = False)
