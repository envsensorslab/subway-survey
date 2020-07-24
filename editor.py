#!/usr/bin/env python3

""" Tool for aligning annotation data with vibration data, for higher accuracy.

To run, execute this script. This will start a Flask server on port 8889;
direct a web browser to localhost:8889 to view it.
"""

import csv
import flask
import glob
import os

PORT = 8889
#DATA_DIR = "./data/"
DATA_DIR = "./data_2018/"

app = flask.Flask(__name__)

dates = list(sorted(filter(
    lambda item: os.path.isdir(os.path.join(DATA_DIR, item)),
    os.listdir(DATA_DIR)
)))

@app.route("/", methods = ["GET"])
def index():
    return flask.redirect("/editor/%s" % dates[0])

@app.route("/editor/<date>/")
def showEditor(date):
    with open("./editor.html", "r", encoding = "utf-8") as f:
        return f.read().replace("%SAMPLE_DATE%", date)

@app.route("/data/")
def showAvailableData():
    return flask.jsonify(dates)

@app.route("/data/<day>/")
def showAvailableSesors(day):
    return flask.jsonify(os.listdir("%s/%s" % (DATA_DIR, day)))

@app.route("/data/<day>/<sensor>")
def fetchData(day, sensor):
    joined_rows = []
    first = True
    for part in sorted(glob.glob("%s/%s/%s*.csv" % (DATA_DIR, day, sensor))):
        print("reading %s" % part)
        with open(part, "r") as f:
            if (not first):
                _ = f.readline()
            first = False
            for line in f:
                if (len(line.rstrip()) > 0):
                    joined_rows.append(line)
    return "".join(joined_rows)

if (__name__ == "__main__"):
    import webbrowser
    webbrowser.open_new_tab("http://localhost:%d" % PORT)
    app.run(port = PORT, debug = False)
