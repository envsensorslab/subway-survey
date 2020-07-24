// Code to write vibration data from the ADXL345 to the serial port.
// Timestamping is offloaded to the computer to minimize the length of clock
// cycles.

#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_ADXL345_U.h>

Adafruit_ADXL345_Unified accel = Adafruit_ADXL345_Unified(12345);
int dt = 0.018 * 1000;

long last_recording = 0;

void setup(void) {
  Serial.begin(14400);

  while (!accel.begin()) {
    Serial.println("no adxl345 detected");
  }

  Serial.println("TIME,X,Y,Z");
  accel.setRange(ADXL345_RANGE_2_G);
}

void record() {
  last_recording = millis();
  sensors_event_t event; 
  accel.getEvent(&event);

  Serial.print(last_recording);
  Serial.print(",");
  Serial.print(event.acceleration.x);
  Serial.print(",");
  Serial.print(event.acceleration.y);
  Serial.print(",");
  Serial.println(event.acceleration.z);
}

void loop(void) {
  //while (millis() - last_recording < dt) {}
  record();
}
