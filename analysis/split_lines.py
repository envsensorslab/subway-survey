#!/usr/bin/env python3
# Warning: Messy code

import geopandas
import pandas
import shapely.ops

INPUT_LINES = "./geometries/massgis_mbta_lines.geojson"
INPUT_STATIONS = "./geometries/massgis_mbta_stations.geojson"
OUTPUT_SEGMENTS = "./geometries/segments.geojson"
OUTPUT_STATIONS = "./geometries/stations.geojson"

CRS_INPUT = {"init": "epsg:26986"}
CRS_OUTPUT = {"init": "epsg:4326"}

STATIONS_COLUMN_ORDER = ["STATION", "LINE", "ROUTE", "TERMINUS", "geometry"]
SEGMENTS_COLUMN_ORDER = [
    "LINE", "ROUTE", "START_STATION", "END_STATION", "geometry", "length"
]

STATIONS_MULTIPLE_LINES = set([
    "Haymarket", "North Station", "Downtown Crossing",
    "State", "Government Center", "Park Street"
])
ALL_ROUTES = ["Blue", "Green", "Orange", "Red"]
def take_first(list_):
    return list(list_)[0]

def insert_slashes(list_):
    return "/".join(sorted(set(list_)))

# Tuple structure: (line_name, route_name, filter_function)
FILTERS = [
    ("Blue", "Blue", lambda row: "BLUE" in row["LINE"]),
    ("Orange", "Orange", lambda row: "ORANGE" in row["LINE"]),
    ("Green", "E", lambda row: ("GREEN" in row["LINE"]) and ("E" in row["ROUTE"])),
    ("Green", "D", lambda row: ("GREEN" in row["LINE"]) and ("D" in row["ROUTE"])),
    ("Green", "C", lambda row:
        ("GREEN" in row["LINE"])
         and ("C" in row["ROUTE"])
         and (not "College" in row["ROUTE"])),
    ("Green", "B", lambda row: ("GREEN" in row["LINE"]) and ("B" in row["ROUTE"])),
    ("Red", "Ashmont", lambda row: ("RED" in row["LINE"]) and ("Ashmont" in row["ROUTE"])),
    ("Red", "Braintree", lambda row: ("RED" in row["LINE"]) and ("Braintree" in row["ROUTE"]))
]

# Convert a MultiLineString into a plain LineString, handling different kinds
# of inputs
def merge_lines(multilinestring):
    merged = shapely.ops.linemerge(shapely.ops.cascaded_union(multilinestring))
    if (type(merged) is shapely.geometry.LineString):
        return merged
    else:
        multicoords = [list(line.coords) for line in merged]
        return shapely.geometry.LineString([
            item for sublist in multicoords for item in sublist
        ])

# Use MBTA nodes to split MBTA arcs into line segments between pairs of nodes.
# Returns a tuple containing the line's segments as a GeoDataFrame and the
# snapped stations a separate GeoDataFrame
def gen_segments(
    line, route, line_filter, station_filter = None,
    lines_file = INPUT_LINES, stations_file = INPUT_STATIONS
):
    # If no station_filter is specified, reuse the line_filter function
    if (station_filter is None):
        station_filter = line_filter

    # Read geometries and filter out relevant records
    df_lines = geopandas.read_file(lines_file)
    df_lines = df_lines[df_lines.apply(line_filter, axis = 1)]
    df_stations = geopandas.read_file(stations_file)
    df_stations = df_stations[df_stations.apply(station_filter, axis = 1)]

    # There are 2 different Saint Paul Street stops on the B and C lines
    saint_paul_streets = df_stations[df_stations["STATION"] == "Saint Paul Street"].copy()
    if (len(saint_paul_streets) > 0):
        saint_paul_streets["STATION"] = saint_paul_streets.apply(
            lambda row: "%s %s" % (row["STATION"], row["ROUTE"][0]), axis = 1
        )
        df_stations = geopandas.GeoDataFrame(pandas.concat([
            df_stations[df_stations["STATION"] != "Saint Paul Street"],
            saint_paul_streets
        ]))

    # Merge line segments into full LineString
    line_arc = merge_lines(df_lines["geometry"])

    # Get projections of stations onto line
    df_stations["projection"] = df_stations["geometry"].apply(
        lambda geometry: line_arc.project(geometry)
    )
    df_stations["geometry"] = df_stations["projection"].apply(
        lambda projection: line_arc.interpolate(projection)
    )
    df_stations = df_stations.sort_values("projection").reset_index(drop = True)

    # Some renaming and column selection of station metadata
    df_stations["LINE"] = line
    df_stations["ROUTE"] = route
    df_stations = df_stations[STATIONS_COLUMN_ORDER]

    # Snap projections into LineString
    for point in df_stations["geometry"]:
        line_arc = shapely.ops.snap(line_arc, point, 0.01)

    # Calculate segments and create new GeoDataFrame
    # Column selection at the end enforces a particular column order
    segments = shapely.ops.split(
        line_arc, shapely.geometry.MultiPoint(df_stations["geometry"])
    )
    df_segments = geopandas.GeoDataFrame([
        {
            "LINE": line,
            "ROUTE": route,
            "START_STATION": df_stations.iloc[i]["STATION"],
            "END_STATION": df_stations.iloc[i + 1]["STATION"],
            "geometry": segments[i],
            "length": segments[i].length
        }
        for i in range(len(df_stations) - 1)
    ])[SEGMENTS_COLUMN_ORDER]

    return (df_segments, df_stations)

if (__name__ == "__main__"):
    import os

    if (os.path.isfile(OUTPUT_STATIONS)):
        os.remove(OUTPUT_STATIONS)
    if (os.path.isfile(OUTPUT_SEGMENTS)):
        os.remove(OUTPUT_SEGMENTS)

    stations_aggregate = {
        "STATION": take_first,
        "LINE": insert_slashes,
        "ROUTE": insert_slashes,
        "TERMINUS": take_first,
        "geometry": take_first
    }
    segments_aggregate = {
        "LINE": insert_slashes,
        "ROUTE": insert_slashes,
        "START_STATION": take_first,
        "END_STATION": take_first,
        "geometry": take_first,
        "length": take_first
    }

    (all_segments, all_stations) = [
        pandas.concat(df_list).reset_index(drop = True)
        for df_list in zip(*[gen_segments(*args) for (args) in FILTERS])
    ]

    # Station processing - combine:
    # 1. Stations that are not shared between multiple lines
    # 2. Stations that are shared between multiple lines, with one record for
    #    each line
    rows_multiple_lines = all_stations["STATION"].apply(lambda x: x in STATIONS_MULTIPLE_LINES)
    all_stations_merged = geopandas.GeoDataFrame(
        pandas.concat([
            df.groupby(["STATION", "LINE"]).agg(stations_aggregate).reset_index(drop = True)[STATIONS_COLUMN_ORDER]
            for df in [
                # Stations that are not shared between multiple lines
                all_stations[~rows_multiple_lines]
            ] + [
                # Stations that are shared between multiple lines, separated
                # out by line
                all_stations[rows_multiple_lines & (all_stations["LINE"] == route)]
                for route in ALL_ROUTES
            ]
        ]),
        crs = CRS_INPUT
    ).sort_values("STATION").reset_index(drop = True).to_crs(CRS_OUTPUT)

    # Segment processing - combine:
    # 1. Segments that don't start at Haymarket
    # 2. Orange line segment that starts at Haymarket
    # 3. Orange line segment that starts at Haymarket (C and E lines)
    all_segments_merged = all_segments\
        .groupby(["START_STATION", "END_STATION"]).agg(segments_aggregate)
    haymarket_north_station = all_segments[all_segments["START_STATION"] == "Haymarket"]
    haymarket_north_station_orange_rows = haymarket_north_station["LINE"] == "Orange"
    all_segments_merged = geopandas.GeoDataFrame(
        pandas.concat([
            all_segments_merged[all_segments_merged["START_STATION"]\
                .apply(lambda x: not "Haymarket" in x)],
            haymarket_north_station[haymarket_north_station_orange_rows],
            haymarket_north_station[~haymarket_north_station_orange_rows]\
                .groupby(["START_STATION", "END_STATION"]).agg(segments_aggregate)
        ]),
        crs = CRS_INPUT
    ).reset_index(drop = True).sort_values(["LINE", "ROUTE"]).to_crs(CRS_OUTPUT)

    all_stations_merged.to_file(OUTPUT_STATIONS, driver = "GeoJSON")
    all_segments_merged.to_file(OUTPUT_SEGMENTS, driver = "GeoJSON")
