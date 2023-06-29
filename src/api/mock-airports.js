// Victoria International Airport
export const airports = [
  {
    icao: "CAM3",
    latitude: 48.75477511435747,
    longitude: -123.70985001325607,
    altitude: 91.44000244140625,
  },
  {
    icao: "CML2",
    latitude: 48.811944387853146,
    longitude: -123.65055575966835,
    altitude: 39.624000549316406,
  },
  {
    icao: "CAV8",
    latitude: 48.633333407342434,
    longitude: -123.63333329558372,
    altitude: 115.82400512695312,
  },
  {
    icao: "CLH3",
    latitude: 48.85819438844919,
    longitude: -123.47458317875862,
    altitude: 12.192000389099121,
  },
  {
    icao: "CYYJ",
    latitude: 48.647222220897675,
    longitude: -123.42583313584328,
    altitude: 16.306001663208008,
  },
];

const CAM3 = {
  icao: "CAM3",
  runways: [
    {
      latitude: 48.75475365668535,
      longitude: -123.70985895395279,
      altitude: 91.44000244140625,
      heading: 151.0964813232422,
      length: 457.28955078125,
      width: 8.357414245605469,
      patternAltitude: 304.79998779296875,
      slope: 0.0012909056385979056,
      slopeTrue: 0.0012909056385979056,
      surface: "bituminus",
      approach: [
        {
          designation: "none",
          marking: "13",
          ILS: {
            type: "none",
            icao: "",
            region: "",
          },
        },
        {
          designation: "none",
          marking: "31",
          ILS: {
            type: "none",
            icao: "",
            region: "",
          },
        },
      ],
    },
  ],
  latitude: 48.75477511435747,
  longitude: -123.70985001325607,
  altitude: 91.44000244140625,
  declination: 340,
  name: "Duncan",
  name64: "Duncan",
  region: "CA",
  runwayCount: 1,
};

const CML2 = {
  icao: "CML2",
  runways: [
    {
      latitude: 48.81187330931425,
      longitude: -123.65057900547981,
      altitude: 39.624000549316406,
      heading: 180.23117065429688,
      length: 524.4055786132812,
      width: 9.284469604492188,
      patternAltitude: 304.79998779296875,
      slope: 0.003059924580156803,
      slopeTrue: 0.003059924580156803,
      surface: "dirt",
      approach: [
        {
          designation: "none",
          marking: "16",
          ILS: {
            type: "none",
            icao: "",
            region: "",
          },
        },
        {
          designation: "none",
          marking: "34",
          ILS: {
            type: "none",
            icao: "",
            region: "",
          },
        },
      ],
    },
  ],
  latitude: 48.811944387853146,
  longitude: -123.65055575966835,
  altitude: 39.624000549316406,
  declination: 340,
  name: "Raven Field",
  name64: "Raven Field",
  region: "CM",
  runwayCount: 1,
};

const CAV8 = {
  icao: "CAV8",
  runways: [
    {
      latitude: 48.63674350082874,
      longitude: -123.63798648118973,
      altitude: 115.82400512695312,
      heading: 184.35446166992188,
      length: 582.060302734375,
      width: 60.000003814697266,
      patternAltitude: 304.79998779296875,
      slope: 0.0018236604519188404,
      slopeTrue: -0.0018236604519188404,
      surface: "water fsx",
      approach: [
        {
          designation: "water",
          marking: "17",
          ILS: {
            type: "none",
            icao: "",
            region: "",
          },
        },
        {
          designation: "water",
          marking: "35",
          ILS: {
            type: "none",
            icao: "",
            region: "",
          },
        },
      ],
    },
  ],
  latitude: 48.633333407342434,
  longitude: -123.63333329558372,
  altitude: 115.82400512695312,
  declination: 0,
  name: "Shawnigan Lake Seaplane Base",
  name64: "Shawnigan Lake Seaplane Base",
  region: "CA",
  runwayCount: 1,
};

const CLH3 = {
  icao: "CLH3",
  runways: [
    {
      latitude: 48.85846395045519,
      longitude: -123.47493410110474,
      altitude: 12.192000389099121,
      heading: 305.1468200683594,
      length: 507.2409973144531,
      width: 11.135159492492676,
      patternAltitude: 304.79998779296875,
      slope: 0,
      slopeTrue: 0,
      surface: "dirt",
      approach: [
        {
          designation: "none",
          marking: "29",
          ILS: {
            type: "none",
            icao: "",
            region: "",
          },
        },
        {
          designation: "none",
          marking: "11",
          ILS: {
            type: "none",
            icao: "",
            region: "",
          },
        },
      ],
    },
  ],
  latitude: 48.85819438844919,
  longitude: -123.47458317875862,
  altitude: 12.192000389099121,
  declination: 344,
  name: "Long Harbour",
  name64: "Long Harbour",
  region: "CL",
  runwayCount: 1,
};

const CYYJ = {
  icao: "CYYJ",
  runways: [
    {
      latitude: 48.649231530725956,
      longitude: -123.42574506998062,
      altitude: 16.306001663208008,
      heading: 106.1448974609375,
      length: 2123.3076171875,
      width: 63.90035629272461,
      patternAltitude: 304.79998779296875,
      slope: 0.024677472189068794,
      slopeTrue: 0.024677472189068794,
      surface: "asphalt",
      approach: [
        {
          designation: "none",
          marking: "9",
          ILS: {
            type: "VOR",
            icao: "IKH",
            region: "CY",
          },
        },
        {
          designation: "none",
          marking: "27",
          ILS: {
            type: "VOR",
            icao: "IYJ",
            region: "CY",
          },
        },
      ],
    },
    {
      latitude: 48.64716321229935,
      longitude: -123.42911034822464,
      altitude: 16.306001663208008,
      heading: 152.0636749267578,
      length: 1516.7969970703125,
      width: 60.61731719970703,
      patternAltitude: 304.79998779296875,
      slope: 0.2391863763332367,
      slopeTrue: -0.2391863763332367,
      surface: "asphalt",
      approach: [
        {
          designation: "none",
          marking: "14",
          ILS: {
            type: "none",
            icao: "",
            region: "",
          },
        },
        {
          designation: "none",
          marking: "32",
          ILS: {
            type: "none",
            icao: "",
            region: "",
          },
        },
      ],
    },
    {
      latitude: 48.647341914474964,
      longitude: -123.42816308140755,
      altitude: 16.306001663208008,
      heading: 223.96090698242188,
      length: 1534.5501708984375,
      width: 62.291847229003906,
      patternAltitude: 304.79998779296875,
      slope: 0.06273528188467026,
      slopeTrue: -0.06273528188467026,
      surface: "asphalt",
      approach: [
        {
          designation: "none",
          marking: "21",
          ILS: {
            type: "none",
            icao: "",
            region: "",
          },
        },
        {
          designation: "none",
          marking: "3",
          ILS: {
            type: "none",
            icao: "",
            region: "",
          },
        },
      ],
    },
  ],
  latitude: 48.647222220897675,
  longitude: -123.42583313584328,
  altitude: 16.306001663208008,
  declination: 340,
  name: "Victoria Intl",
  name64: "Victoria Intl",
  region: "CY",
  runwayCount: 3,
};

const CYCD = {
  icao: "CYCD",
  runways: [
    {
      latitude: 49.05453912913799,
      longitude: -123.87015894055367,
      altitude: 25.450000762939453,
      heading: 0.8728867173194885,
      length: 2009.5350341796875,
      width: 39.78949737548828,
      patternAltitude: 304.79998779296875,
      slope: 0.1805218905210495,
      slopeTrue: -0.1805218905210495,
      surface: "asphalt",
      approach: [
        {
          designation: "none",
          marking: "34",
          ILS: {
            type: "none",
            icao: "",
            region: "",
          },
        },
        {
          designation: "none",
          marking: "16",
          ILS: {
            type: "VOR",
            icao: "ICD",
            region: "CY",
          },
        },
      ],
    },
  ],
  latitude: 49.05444458127022,
  longitude: -123.86999979615211,
  altitude: 25.450000762939453,
  declination: 341,
  name: "Nanaimo",
  name64: "Nanaimo",
  region: "CY",
  runwayCount: 1,
};

export const AIRPORTS = [CAM3, CML2, CAV8, CLH3, CYYJ, CYCD];
