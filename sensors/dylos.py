#!/usr/bin/env python3
# to stream data:
# ./serial.py [/path/to/device_file]
# to download stored data:
# ./serial.py [/path/to/device_file] download

""" Python script for downloading or streaming particle data from the Dylos
DC1700 air quality monitor.

To use, first locate the path to the serial port block device, e.g.
/dev/ttyUSB0. Then:

* To stream data: `python3 dylos.py /dev/ttyUSB0`
* To download stored data: `python3 dylos.py /dev/ttyUSB0 download`
"""

import dateutil.parser
import serial
import sys
import time

OUTPUT = "dylos_%d.csv" % time.time()

device_file = sys.argv[1]
dylos = serial.Serial(
    device_file,
    baudrate = 9600,
    parity = serial.PARITY_NONE,
    stopbits = serial.STOPBITS_ONE,
    xonxoff = False
)

# documentation is from the dylos dc1700 user manual
stream = True
try:
    if (sys.argv[2][0].lower() == "d"):
        stream = False
except:
    pass

print("writing data to %s" % OUTPUT)
with open(OUTPUT, "w") as f:
    f.write("TIME,SMALLPARTICLES,LARGEPARTICLES\n")
    if (stream):
        while True:
            try:
                line = "%f,%s" % (
                    time.time(), dylos.readline().rstrip().decode()
                )
                f.write("%s\n" % line)
                print(line)
            except KeyboardInterrupt:
                break
    else:
        dylos.write(bytes(b"D\r"))
        while True:
            read_first_line = True
            try:
                read_first_line = False
                line = dylos.readline().rstrip().decode().split(",")
                line = "%d,%s,%s" % (
                    time.mktime(dateutil.parser.parse(line[0]).timetuple()),
                    line[1],
                    line[2]
                )
                f.write("%s\n" % line)
                print(line)
            except (AttributeError, IndexError, ValueError, serial.serialutil.SerialException):
                if (read_first_line):
                    pass
                else:
                    break
            except KeyboardInterrupt:
                break
