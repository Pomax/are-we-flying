# Are We Flying? (in Microsoft Flight Simulator 2020)

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

## Reading the tutorial

Head on over the `docs` dir, there should be a rather substantial INDEX.md file for your perusal, conveniently mirrored over on https://pomax.github.io/are-we-flying.

## Questions and comments

If you found bugs, or _fixed_ bugs, or even came up with completely new code that's cool to add (or replace existing code), file an issue!

For less serious engagement, you can also hit me up over on https://twitter.com/TheRealPomax or https://mastodon.social/@therealpomax
