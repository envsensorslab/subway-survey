#!/usr/bin/env python3

""" Python script for receiving accelerometer data from the Arduino.

To use, first locate the path to the serial port block device, e.g.
/dev/ttyUSB0, and run `python3 adxl345.py /dev/ttyUSB0`. Data will be written
to the current directory.
"""

from matplotlib import pyplot
import colorama
import serial
import sys
import time

THRESH = 20
GRAPH_WIDTH = 70

start_time = time.time()
output = "adxl345_%d.csv" % start_time
device_file = sys.argv[1]
adxl345 = serial.Serial(
    device_file,
    baudrate = 14400,
    parity = serial.PARITY_NONE,
    stopbits = serial.STOPBITS_ONE,
    xonxoff = False
)

with open(output, "w") as f:
    f.write("TIME,X,Y,Z\n")
    while True:
        try:
            line = adxl345.readline().rstrip().decode()
            if ("X" in line):
                pass
            else:
                (timestamp, x, y, z) = line.split(",")
                f.write("%f,%s,%s,%s\n" % (
                    start_time + float(timestamp)/1000, x, y, z
                ))

                (x_float, y_float, z_float) = map(
                    lambda n: abs(float(n)),
                    (x, y, z)
                )
                (x_width, y_width, z_width) = map(
                    lambda n: int(n / THRESH * GRAPH_WIDTH) - 1,
                    (x_float, y_float, z_float)
                )

                # faster than multiple prints and concatenations
                sys.stdout.write(colorama.Fore.RED)
                sys.stdout.write("% 6.2f | " % x_float)
                sys.stdout.write("█" * x_width)
                sys.stdout.write("\n")
                sys.stdout.write(colorama.Fore.GREEN)
                sys.stdout.write("% 6.2f | " % y_float)
                sys.stdout.write("█" * y_width)
                sys.stdout.write("\n")
                sys.stdout.write(colorama.Fore.BLUE)
                sys.stdout.write("% 6.2f | " % z_float)
                sys.stdout.write("█" * z_width)
                sys.stdout.write("\n")
                sys.stdout.flush()
        except KeyboardInterrupt:
            break
        except UnicodeDecodeError:
            pass
        except ValueError:
            pass
