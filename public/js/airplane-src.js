export const defaultPlane = `plane.png`;

export function getAirplaneSrc(title = ``) {
  let pic = defaultPlane;
  let plane = title.toLowerCase();

  // let's find our plane!
  if (plane.includes(`da62`)) pic = `da62.png`;
  else if (plane.includes(` 152`)) pic = `152.png`;
  else if (plane.includes(` 152`)) pic = `172.png`;
  else if (plane.includes(` c182`)) pic = `182.png`;
  else if (plane.includes(` 310`)) pic = `310.png`;
  else if (plane.includes(` dc-3`)) pic = `dc3.png`;
  else if (plane.includes(`103 solo`)) pic = `top-rudder.png`;
  else if (plane.includes(` bonanza`)) pic = `bonanza.png`;
  else if (plane.includes(`vertigo`)) pic = `vertigo.png`;
  else if (plane.includes(` d18`)) pic = `model-18.png`;
  else if (plane.includes(` citation`)) pic = `citation.png`;
  else if (plane.includes(` king air`)) pic = `king-air.png`;
  else if (plane.includes(` beaver`)) pic = `beaver.png`;
  else if (plane.includes(` carbon`)) pic = `carbon.png`;
  else if (plane.includes(` mb-339`)) pic = `mb-339.png`;
  else if (plane.includes(` searey`)) pic = `searey.png`;
  else if (plane.includes(` 930`)) pic = `930.png`;
  else if (plane.includes(`super hornet`)) pic = `F18.png`;
  else if (plane.includes(` r3`)) pic = `gbr3.png`;
  else if (plane.includes(`wilga`)) {
    pic = `wilga.png`;
    if (plane.match(/\d+h/)) pic = `wilga-float.png`;
  } else if (plane.includes(`kodiak `)) pic = `kodiak.png`;
  else if (plane.includes(` p-750`)) pic = `p-750.png`;
  else if (plane.includes(` islander`)) pic = `islander.png`;
  else if (plane.includes(` trislander`)) pic = `trislander.png`;
  else if (plane.includes(`zenith 701`)) pic = `zenith-701.png`;
  else if (plane.includes(`icon a5`)) pic = `icon-a5.png`;
  else if (plane.includes(`bede `)) pic = `bede.png`;

  // float plane variant?
  if (plane.includes(`amphibian`) || plane.includes(`float`)) {
    pic = pic.replace(`.png`, `-float.png`);
  }

  return pic;
}
