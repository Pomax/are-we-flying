from typing import Dict, Union
from threading import Timer
from math import degrees, pi, copysign
from simconnection import SimConnection

MSFS_RADIAN = pi / 10
LEVEL_FLIGHT = 'LVL'
HEADING_MODE = 'HDG'
VERTICAL_SPEED_HOLD = 'VSH'
ALTITUDE_HOLD = 'ALT'


def map(v: float, ds: float, de: float, ts: float, te: float) -> float:
    d = (de-ds)
    if d == 0:
        return ts
    return ts + (v-ds) * (te-ts)/d


def constrain(v: float, m: float, M: float) -> float:
    if m > M:
        return constrain(v, M, m)
    return M if v > M else m if v < m else v


def constrain_map(v: float, ds: float, de: float, ts: float, te: float) -> float:
    return constrain(map(v, ds, de, ts, te), ts, te)


def get_compass_diff(current, target):
    diff = (current - 360) if current > 180 else current
    target = target - diff
    return target if target < 180 else target - 360


class AutoPilot():
    def __init__(self, api: SimConnection):
        self.api = api
        self.autopilot_enabled: bool = False
        self.modes: Dict[str, Union[bool, float]] = {
            LEVEL_FLIGHT: False,  # level flight
            HEADING_MODE: False,  # heading mode
            VERTICAL_SPEED_HOLD: False,  # vertical speed hold
            ALTITUDE_HOLD: False,  # altitude hold
        }
        self.pids = {}
        self.lvl_center = 0

    def schedule_ap_call(self) -> None:
        # call run function 1 second from now
        Timer(0.5, self.run_auto_pilot, [], {}).start()

    def get_state(self) -> Dict[str, any]:
        state = {'AP_STATE': self.autopilot_enabled}
        for key, value in self.modes.items():
            state[key] = value
        return state

    def toggle(self, ap_type: str) -> bool:
        if ap_type not in self.modes:
            return None
        self.modes[ap_type] = not self.modes[ap_type]
        if self.modes[ap_type]:
            if ap_type == VERTICAL_SPEED_HOLD:
                print(f'Engaging VS hold')
                self.prev_vspeed = 0
        return self.modes[ap_type]

    def set_target(self, ap_type: str, value: float) -> float:
        if ap_type in self.modes:
            self.modes[ap_type] = value if value != None else False
            if ap_type == ALTITUDE_HOLD:
                print(f'Engaging ALT hold to {value}')
                self.prev_alt = self.api.get_standard_property_value(
                    'INDICATED_ALTITUDE')
            return value
        return None

    def toggle_autopilot(self) -> bool:
        self.autopilot_enabled = not self.autopilot_enabled
        if self.autopilot_enabled:
            self.schedule_ap_call()
        return self.autopilot_enabled

    def run_auto_pilot(self) -> None:
        speed = self.api.get_standard_property_value('AIRSPEED_TRUE')
        bank = self.api.get_standard_property_value('PLANE_BANK_DEGREES')
        heading = self.api.get_standard_property_value(
            'PLANE_HEADING_DEGREES_MAGNETIC')
        trim = self.api.get_standard_property_value('AILERON_TRIM_PCT')

        if (speed and bank and heading and trim) is None:
            return

        if self.autopilot_enabled is False:
            return
        if self.modes[LEVEL_FLIGHT]:
            self.fly_level(speed, bank, heading)
        if self.modes[VERTICAL_SPEED_HOLD]:
            self.hold_vertical_speed(speed, trim)
        self.schedule_ap_call()

    def fly_level(self, speed, bank, heading) -> None:
        bank = degrees(bank)
        shift = constrain_map(bank, -5, 5, -2, 2)
        center = self.lvl_center + shift


        # Do we need to correct this center further in order to account for intended heading?
        if self.modes[HEADING_MODE]:
            heading = degrees(heading)
            target = self.modes[HEADING_MODE]
            # not a fan of this 0.5, but it seems to be necessary?
            hdiff = get_compass_diff(heading, target)
            max_bump = map(speed, 50, 150, 1.1, 1.7)
            bump = constrain_map(hdiff, -10, 10, -max_bump, max_bump)
            center = self.lvl_center + bump

        # Done, set new trim
        self.api.set_property_value('AILERON_TRIM_PCT', (center + bank)/45)
        self.lvl_center = center

    def hold_vertical_speed(self, speed, trim) -> None:
        alt = self.api.get_standard_property_value('INDICATED_ALTITUDE')
        vspeed = self.api.get_standard_property_value('VERTICAL_SPEED')
        trim = self.api.get_standard_property_value('ELEVATOR_TRIM_POSITION')

        if (alt and speed and vspeed and trim) is None:
            return

        vs_target = 0  # self.modes[VERTICAL_SPEED_HOLD]
        vs_diff = vs_target - vspeed
        alt_target = self.modes[ALTITUDE_HOLD]
        alt_diff = (alt_target - alt) if alt_target else 0
        vs_max = 10 * speed
        dvs = vspeed - self.prev_vspeed
        dvs_max = speed / 2
        alt_hold_limit = 20
        correct = 0

        # We make our step size contingent on how fast this plane (can) go(es)
        step = map(speed, 50, 150, MSFS_RADIAN / 200, MSFS_RADIAN / 100)

        # we want both vspeed *and* dVS to become zero.
        correct += constrain_map(vs_diff, -vs_max, vs_max, -step, step)
        correct += constrain_map(dvs, -dvs_max, dvs_max, step, -step)

        # special handling for when we're close to our target
        if abs(vs_diff) < 200 and abs(alt_diff) < alt_hold_limit:
            correct += constrain_map(vs_diff, -200, 200, -step / 4, step / 4)
            correct += constrain_map(dvs, -20, 20, step / 9.99, -step / 10)

        # Same trick as for heading: nudge us up or down if we need to be at a specific altitude
        if alt_diff:
            alt_correct = constrain_map(alt_diff, -200, 200, -step, step)
            correct += alt_correct
            # Do we need an extra kick, though?
            if alt_diff > 20 and vspeed < -20:
                correct += alt_correct
            elif alt_diff < -20 and vspeed > 20:
                correct += alt_correct

        self.api.set_property_value('ELEVATOR_TRIM_POSITION', trim + correct)
        self.prev_vspeed = vspeed
