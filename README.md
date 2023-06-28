# Are We Flying? (in Microsoft Flight Simulator 2020)

### https://pomax.github.io/are-we-flying

# What is this?

this project is both the completed code for, and a tutorial on, writing an autopilot for MSFS that runs in Node and is controlled via a web page, by using MSFS's SimConnect SDK.

If you just want to run the code and be up and flying, clone the repo, then install all the necessary dependencies using `npm install` in the root dir. (Note: Node 19 or higher is required. I recommend using [nvm-windows](https://github.com/coreybutler/nvm-windows) to make managing Node versions easier. Don't install Node using the nodejs.org installers).

You'll need an `.env` file, with the following content:

```sh
export DATA_FOLDER=
export ALOS_PORT=9000
export WEB_PORT=3000
export API_PORT=8080
export FLIGHT_OWNER_KEY=FOK-12345
```
The ports are really just whatever's convenient for you, but they need to exist. Also, the "flight owner key" can be whatever you like, but again it needs to exist.

Finally, the `DATA_FOLDER` variable is for if you went through the trouble of downloading all the data from https://www.eorc.jaxa.jp/ALOS/en/dataset/aw3d30/aw3d30_e.htm (which is free, but does require getting an equally free account because it's only downloadable after logging in). Note that this is a 150GB download spread of hundreds of files, unpacking to 450GB of GeoTIFF files and associated metadata. Space is cheap, and a lot of folks have unlimited internet these days, but even then, I suspect few people will actually download this dataset.

I'm still thinking of a way to make that less of a problem =)

## Running the project

Have MSFS running, and then run `run.bat` in the root folder to start two command prompt instances that run the API server and web page server, respectively (which means you can kill and restart them individually if necessary)

Needless to say, you need to be on Windows for this, because MSFS doesn't run on anything else (I mean, I guess XBox? But I doubt you have git and/or Node installed on that).

## Using the autopilot

There are two parts to the autopilot:

1. the AP toggles, and
2. the navigation map

The AP toggles are:

- `AP` toggle the autopilot on or off
- `LVL` toggle the wing leveler on or off
- `ALT` toggle altitude hold on or off, with the altitude in feet set using the input field to the left of it
- `ATT` toggle auto-throttle on or off
- `TER` toggle terrain-follow on or off (note: this currently only works if you've [downloaded and unpacked the ALOS 30m dataset](https://pomax.github.io/are-we-flying/#terrain-follow-mode))
- `HDG` toggle heading mode on or off, with the heading in degrees set using the input field to the left of it
- `take off` makes the plane take off!
- `land` only exists (for now) when loading the page with `?experiment=auto-land`, and will find a nearby airport to land at, then tries to land there.

The navigation map lets you control the flight plan Google Maps style:

- click to place a waypoint
- click an existing waypoint to set its altitude (note: altitudes are ignored when terrain follow mode is active)
- click-drag a waypoint to move it around
- double-click a waypoint to remove it

Waypoint navigation is based on flying legs between waypoints, with the active leg indicated by its start and end waypoint being highlighted.

Waypoint based flight plans can be saved and loaded, as well as reset (marking each waypoint as not having been visited yet) or cleared (removing all waypoints from the map)

## Testing the code without even running MSFS

There is a convenient `mock.bat` that runs the api server in "mock mode" that can "talk SimConnect" just well enough to fake a flight for testing code without having to run MSFS. A bunch of the AP code is also [set up for hot-reloading](https://pomax.github.io/are-we-flying/#hot-reloading-to-make-our-dev-lives-easier) so that changes immediately kick in rather than having to restart the API server. 

## Reading the tutorial

Head on over to https://pomax.github.io/are-we-flying for the extensive tutorial

## Sponsorship / donation

Writing a 150 page tutorial (book?) takes time and effort. If you can financially appreciate that, click the [sponsor button](https://github.com/sponsors/Pomax) to help fund this kind of work either as a one-time thing, or on an on-going basis. Anything you can spare is highly appreciated.

## Questions and comments

If you found bugs, or _fixed_ bugs, or even came up with completely new code that's cool to add (or replace existing code), file an issue!

For less serious engagement, you can also hit me up over on https://mastodon.social/@TheRealPomax or https://twitter.com/TheRealPomax
