#!/usr/bin/env python3

import json

import geopandas
import numpy
import os
import pandas

EXTRA_GROUPBY_AGGREGATES = {
    "geometry": "first",
    "LINE": "first"
}
CRS_NAD83_MA_M = {"init": "epsg:26986"}
CRS_WGS84 = {"init": "epsg:4326"}

class SubwayJoiner(object):
    
    def __init__(self):
        self.segments = geopandas.read_file("./analysis/geometries/segments.geojson")
        self.stations = geopandas.read_file("./analysis/geometries/stations.geojson")
        with open("./analysis/mapping.json", "r") as f:
            self.mappings = json.load(f)
        self.mapped_location_cache = {}

    def map_location(self, label):
        # To speed up mapping of locations, maintain an internal cache
        if (label in self.mapped_location_cache):
            return self.mapped_location_cache[label]
        else:
            mapped_labels = [
                self.mappings[location]
                for location in label.split(" to ")
            ]

            # Station
            if (len(mapped_labels) == 1):
                location = mapped_labels[0]
                #direction = None

            # Segment: return in a normalized order
            else:
                if (len(self.segments[
                    (self.segments["START_STATION"] == mapped_labels[0])
                    & (self.segments["END_STATION"] == mapped_labels[1])
                ]) == 0):
                    location = mapped_labels[::-1]
                    #direction = 1
                else:
                    location = mapped_labels
                    #direction = 0

            #result = (location, direction)
            result = location
            self.mapped_location_cache[label] = result
            return result
    
    def label_data(self, data, labels):
        results = []
        sample_id = 0
        
        # Attempt to guess the time column
        time_column = "TIME"
        if (not time_column in data.columns):
            time_column = "TIMESTAMP"
        
        # New method of assigning direction relies on manual input into the
        # labels csv; other methods are not as reliable
        if not "DIRECTION" in labels.columns:
            print(
                "please add a DIRECTION column to the labels data frame. direction"
                " 0 refers to the order given by the segments shapefile, which is"
                " roughly south-to-north. 1 refers to the opposite direction."
            )
            raise Exception("no DIRECTION column in labels df")

        for (index, row) in labels.iterrows():
            sample_id += 1
            
            subset = data[
                (data[time_column] >= row["START"])
                & (data[time_column] < row["END"])
            ]
            subset["SAMPLE_ID"] = sample_id
            subset["LOCATION"] = row["LOCATION"]
            subset["STATUS"] = row["STATUS"]
            subset["DIRECTION"] = row["DIRECTION"]
            
            results.append(subset)
        return pandas.concat(results)
    
    def split_labeled_data(self, labeled_data):
        labeled_data = labeled_data.copy()

        #labeled_data["STATION"], labeled_data["DIRECTION"] = zip(
        #    *labeled_data.pop("LOCATION").apply(self.map_location)
        #)
        labeled_data["STATION"] = labeled_data.pop("LOCATION").apply(self.map_location)
        
        station_rows = labeled_data["STATION"].apply(lambda x: type(x) is str)
        labeled_stations = labeled_data[station_rows]

        labeled_segments = labeled_data[~station_rows]
        start_end_tuples = labeled_segments.pop("STATION")
        labeled_segments["START_STATION"] = start_end_tuples\
            .apply(lambda x: x[0])
        labeled_segments["END_STATION"] = start_end_tuples\
            .apply(lambda x: x[1])

        return (labeled_stations, labeled_segments)
    
    def geospatial_join(self, labeled_data):
        (labeled_stations, labeled_segments) = self.split_labeled_data(labeled_data)

        # Join with geospatial data
        stations_joined = pandas.merge(
            self.stations, labeled_stations, left_on = "STATION", right_on = "STATION"
        )
        segments_joined = pandas.merge(
            self.segments, labeled_segments,
            left_on = ["START_STATION", "END_STATION"],
            right_on = ["START_STATION", "END_STATION"]
        )

        return (stations_joined, segments_joined)

    def count_readings(self, labeled_data):
        (labeled_stations, labeled_segments) = self.split_labeled_data(labeled_data)
        
        segment_counts = self.segments[[
            "LINE", "ROUTE", "START_STATION", "END_STATION"
        ]].copy()
        segment_counts["count"] = segment_counts.apply(
            lambda row: (
                (labeled_segments["START_STATION"] == row["START_STATION"])
            ).sum(),
            axis = 1
        )

        station_counts = self.stations[["LINE", "ROUTE", "STATION"]].copy()
        station_counts["count"] = station_counts.apply(
            lambda row: (
                (labeled_stations["STATION"] == row["STATION"])
            ).sum(),
            axis = 1
        )

        line_counts = pandas.concat(
            [station_counts, segment_counts],
            sort = False
        ).dropna(axis = 1).groupby(["LINE", "ROUTE"]).sum()

        return (station_counts, segment_counts, section_counts)
    
    def process(self, data, labels):
        labeled_data = self.label_data(data, labels)
        return self.geospatial_join(labeled_data)
    
def gdf_aggregate(df, columns, aggregates):
    df = df.groupby(columns, group_keys=False)\
        .agg({**EXTRA_GROUPBY_AGGREGATES, **aggregates})\
        .reset_index()

    # modified from https://stackoverflow.com/a/14508355
    df.columns = [
        ".".join(column).strip() 
        if (column[1] != "")
        else column[0]
        for column in df.columns.values
    ]
    
    return geopandas.GeoDataFrame(
        df.rename(
            {
                "{}.first".format(column): column
                for column in EXTRA_GROUPBY_AGGREGATES.keys()
            },
            axis=1
        ),
        crs=CRS_NAD83_MA_M
    )

def tidy_aggregates(gdf):
    df_new = gdf.drop(
        ["LINE", "geometry"],
        errors="ignore",
        axis=1
    )
    return pandas.melt(
        df_new,
        id_vars=[
            column
            for column in df_new.columns
            if not "." in column
        ]
    ).dropna(subset=["value"])

def export_all_aggregates(df_stations, df_segments, aggregates, name):
    tidy_aggregates(
        gdf_aggregate(df_stations, ["STATION", "ROUTE"], aggregates)
    ).to_csv("output/stations/directionless/{}.csv".format(name), index=False)
    tidy_aggregates(
        gdf_aggregate(df_stations, ["STATION", "ROUTE", "DIRECTION"], aggregates)
    ).to_csv("output/stations/by_direction/{}.csv".format(name), index=False)
    tidy_aggregates(
        gdf_aggregate(df_segments, ["START_STATION", "END_STATION", "ROUTE"], aggregates)
    ).to_csv("output/segments/directionless/{}.csv".format(name), index=False)
    tidy_aggregates(
        gdf_aggregate(df_segments, ["START_STATION", "END_STATION", "ROUTE", "DIRECTION"], aggregates)
    ).to_csv("output/segments/by_direction/{}.csv".format(name), index=False)

def export_webapp_input(df_stations, df_segments, aggregates, value_generators, metadata, quantity):
    station_results = []
    segment_results = []

    # save data
    for (df, groupby_columns, result_accumulator) in [
        (df_stations, ["STATION", "ROUTE"], station_results),
        (df_segments, ["START_STATION", "END_STATION", "ROUTE"], segment_results)
    ]:
        for direction_column_maybe in [[], ["DIRECTION"]]:
            groupby_columns += direction_column_maybe
            result = gdf_aggregate(df, groupby_columns, aggregates)
            for (column, generator) in value_generators.items():
                result[column] = result.apply(generator, axis=1)
            result["quantity"] = quantity
            result_accumulator.append(
                result[groupby_columns + ["LINE"] + list(value_generators.keys())]
            )
    
    # save metadata
    if os.path.isfile("output/webapp/metadata.json"):
        with open("output/webapp/metadata.json", "r") as f:
            all_metadata = json.load(f)
    else:
        all_metadata = {}
    all_metadata[quantity] = metadata
    with open("output/webapp/metadata.json", "w") as f:
        json.dump(all_metadata, f, indent=4)
    
    pandas.concat(station_results).to_csv("output/webapp/stations/{}.csv".format(quantity), index=False)
    pandas.concat(segment_results).to_csv("output/webapp/segments/{}.csv".format(quantity), index=False)

def create_histogram_bins(df, metric, value_range, n_bins = 30):
    (values, bin_edges) = [
        array.tolist()
        for array in numpy.histogram(df[metric], bins=n_bins, range=value_range)
    ]
    return pandas.Series({
        "bins": n_bins,
        "values": values,
        "min": bin_edges[0],
        "max": bin_edges[-1]
    })

def export_webapp_histograms(df_stations, df_segments, metric, quantity, n_bins = 30):
    if os.path.isfile("output/webapp/histograms.json"):
        with open("output/webapp/histograms.json", "r") as f:
            all_bins = json.load(f)
    else:
        all_bins = {}
    
    if df_stations is not None:
        all_values = pandas.concat([df_stations[metric], df_segments[metric]])
        value_range = (all_values.min(), all_values.max())
    else:
        # vibration data is subject to a lot of skew, so we only bin data <= 999th percentile
        all_values = df_segments[metric]
        value_range = (all_values.min(), all_values.quantile(0.999))
    
    all_bins[quantity] = {
        geometry_type: df.groupby(groupby_columns).apply(
            lambda df: create_histogram_bins(df, metric, value_range, n_bins)
        ).reset_index().to_dict(orient="records")
        for (df, groupby_columns, geometry_type) in [
            (df_stations, ["STATION", "ROUTE"], "stations"),
            (df_segments, ["START_STATION", "END_STATION", "ROUTE"], "segments")
        ]
        if df is not None
    }
    
    with open("output/webapp/histograms.json", "w") as f:
        # reduce the size of the JSON as much as possible while keeping it
        # relatively easy to parse
        json.dump(all_bins, f, separators=(",", ":"))