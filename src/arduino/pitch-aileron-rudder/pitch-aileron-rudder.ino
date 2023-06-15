/* Demo with 128x64 OLED display and multiple I2C encoders wired up. The sketch will auto-
   detect up to 4 encoder on the first 4 addresses. Twisting will display text on OLED
   and change neopixel color.
   set USE_OLED to true t
*/
#include "Adafruit_seesaw.h"
#include <seesaw_neopixel.h>
#include <Joystick.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>


#define SS_SWITCH        24    // this is the pin on the encoder connected to switch
#define SEESAW_BASE_ADDR 0x36  // I2C address, starts with 0x36

#define SCREEN_WIDTH 128 // OLED display width, in pixels
#define SCREEN_HEIGHT 32 // OLED display height, in pixels
#define OLED_RESET     -1 // Reset pin # (or -1 if sharing Arduino reset pin)
#define SCREEN_ADDRESS 0x3C ///< See datasheet for Address; 0x3D for 128x64, 0x3C for 128x32

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// create 6 encoders
#define ENCODER_COUNT 6
Adafruit_seesaw encoders[ENCODER_COUNT];

uint8_t encoder_increment[] = {
  5, // pitch increment
  5, // aileron increment
  5, // rudder increment

  1,
  1,
  1
};

uint16_t encoder_center[] = {
  1000, // pitch center
  1000, // aileron center
  1000, // rudder center

  1000,
  1000,
  1000
};

// Center the encoders on startup
int32_t encoder_positions[] = {0, 0, 0,    0, 0, 0};
bool found_encoders[] = {false, false, false,   false, false, false};
bool encoder_down[] = {false, false, false,   false, false, false};

// button layout for each of the three trims is  [down,reset,up]
uint8_t down_buttons[]  = {0, 3, 6, 0, 3};
uint8_t reset_buttons[] = {1, 4, 7, 1, 4};
uint8_t up_buttons[]    = {2, 5, 8, 2, 5};

uint8_t button_count = ENCODER_COUNT * 3;

uint8_t buttons_durations[] = {
  300, 25, 300, // pitch
  300, 25, 300, // aileron
  300, 25, 300, // rudder

  50, 25, 50,
  50, 25, 50,
  50, 25, 50
};

long last_pressed[] = {
  0, 0, 0,
  0, 0, 0,
  0, 0, 0,

  0, 0, 0,
  0, 0, 0,
  0, 0, 0
};


// joystick configuration
Joystick_ joystick(
  /* hidReportId */ 0x03,
  /* joystickType */ 0x04,
  /* buttonCount */ 9, // three buttons for "up, reset, down" per encoder
  /* hatSwitchCount */ 0,
  /* includeXAxis */ false,
  /* includeYAxis */ false,
  /* includeZAxis */ false,
  /* includeRxAxis */ true, // pitch
  /* includeRyAxis */ true, // aileron
  /* includeRzAxis */ true, // rudder
  /* includeRudder */ false,
  /* includeThrottle */ false,
  /* includeAccelerator */ false,
  /* includeBrake */ false,
  /* includeSteering */ false
);

/**
   ...docs go here...
*/
void setup() {
  Serial.begin(115200);

  bindEncoders();
  setupJoystick();


  // SSD1306_SWITCHCAPVCC = generate display voltage from 3.3V internally
  if (!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
    Serial.println(F("SSD1306 allocation failed"));
    for (;;); // Don't proceed, loop forever
  }

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.cp437(true);
  display.setCursor(0, 0);
  drawStringToScreen("     trim controller");
  display.display();
}

/**
   ...docs go here...
*/
void bindEncoders() {
  for (uint8_t enc = 0; enc < ENCODER_COUNT; enc++) {
    String s = enc == 0 ? "0" : enc == 1 ? "1" : "2";

    // See if we can find encoders on this address
    if (! encoders[enc].begin(SEESAW_BASE_ADDR + enc)) {
      Serial.print("Couldn't find encoder " + s);
    } else {
      Serial.print("Found encoder + pixel " + s);

      uint32_t version = ((encoders[enc].getVersion() >> 16) & 0xFFFF);
      if (version != 4991) {
        Serial.print("Wrong firmware loaded? ");
        Serial.println(version);
        while (1) delay(10);
      }
      Serial.println("Found Product 4991");

      // use a pin for the built in encoder switch
      encoders[enc].pinMode(SS_SWITCH, INPUT_PULLUP);

      // get starting position
      encoders[enc].setEncoderPosition(0);

      Serial.println("Turning on interrupts");
      delay(10);
      encoders[enc].setGPIOInterrupts((uint32_t)1 << SS_SWITCH, 1);
      encoders[enc].enableEncoderInterrupt();

      found_encoders[enc] = true;
    }
  }

  Serial.println("Encoders started");
}

/**
   ...docs go here...
*/
void setupJoystick() {
  joystick.begin(true);
  joystick.setRxAxisRange(0, 2 * encoder_center[0]);
  joystick.setRxAxis(encoder_center[0]);
  joystick.setRyAxis(encoder_center[1]);
  joystick.setRyAxisRange(0, 2 * encoder_center[1]);
  joystick.setRzAxis(encoder_center[2]);
  joystick.setRzAxisRange(0, 2 * encoder_center[2]);
}

/**
   ...docs go here...
*/
void loop() {
  checkButtonRelease();

  for (uint8_t enc = 0; enc < ENCODER_COUNT; enc++) {
    if (!found_encoders[enc]) continue;
    processPosition(enc, encoder_positions[enc], encoders[enc].getEncoderPosition());
    checkEncoderSwitch(enc);
  }

  drawValuesToScreen();

  yield();
  delay(50);
}

/**
   ...docs go here...
*/
void processPosition(uint8_t enc, int32_t old_position, int32_t new_position) {
  if (old_position == new_position) return;

  encoder_positions[enc] = new_position;

  uint16_t axis_value = 0;
  uint8_t ctrl = enc % 3;
  int8_t other = 3;
  if (enc > ctrl) other = -3;
  axis_value = encoder_center[enc] + encoder_increment[enc] * encoder_positions[enc] + encoder_increment[enc + other] * encoder_positions[enc + other];

  // update the "joystick" with the new value
  if (ctrl == 0) {
    joystick.setRxAxis(axis_value);
  }
  else if (ctrl == 1) {
    joystick.setRyAxis(axis_value);
  }
  else if (ctrl == 2) {
    joystick.setRzAxis(axis_value);
  }

  if (old_position < new_position) {
    pressButton(up_buttons[enc]);
  } else {
    pressButton(down_buttons[enc]);
  }

  Serial.print("position ");
  Serial.print(enc);
  Serial.print(" ");
  Serial.print(new_position);
  Serial.print(" ");
  Serial.print(axis_value);
  Serial.println("");

}


/**
   ...docs go here...
*/
void checkEncoderSwitch(uint8_t enc) {
  bool pressed = !encoders[enc].digitalRead(SS_SWITCH);
  if (pressed && !encoder_down[enc]) {
    encoder_down[enc] = true;
    encoder_positions[enc] = 0;
    encoders[enc].setEncoderPosition(0);
    uint8_t ctrl = enc % 3;
    int8_t other = 3;
    if (enc > ctrl) {
      other = -3;
    }
    encoder_positions[enc + other] = 0;
    encoders[enc + other].setEncoderPosition(0);
    pressButton(reset_buttons[enc]);
    uint16_t center_value = encoder_center[enc];
    processPosition(enc, 9999, 0);
  }
  else if (!pressed && encoder_down[enc]) {
    encoder_down[enc] = false;
  }
}


/**
   ...docs go here...
*/
void checkButtonRelease() {
  long now = millis();
  for (uint8_t i = 0; i < button_count; i++) {
    if (now - last_pressed[i] > buttons_durations[i]) {
      joystick.releaseButton(i);
    }
  }
}

void drawValuesToScreen() {
  display.clearDisplay();

  // heading
  display.setCursor(0, 0);
  drawStringToScreen("     trim controller");

  // values
  for (int8_t i = 0; i < 3; i++) {
    display.setCursor(0, 8 * (1 + i));
    String label = "";
    if (i == 0) label = "pitch: ";
    if (i == 1) label = "yaw  : ";
    if (i == 2) label = "roll : ";
    String dval = String(encoder_increment[i] * encoder_positions[i] + encoder_increment[i + 3] * encoder_positions[i + 3]);
    Serial.println(dval);
    while (dval.length() < 14) dval = " " + dval;
    drawStringToScreen(label + dval);
  }

  display.display();
}

void drawStringToScreen(String str) {
  int16_t slen = str.length() + 1;
  char letters[slen];
  str.toCharArray(letters, slen);
  for (int16_t i = 0; i < slen; i++) display.write(letters[i]);
}

/**
   ...docs go here...
*/
void pressButton(uint8_t button) {
  joystick.pressButton(button);
  last_pressed[button] = millis();
}
