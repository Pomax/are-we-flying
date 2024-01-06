/**
 * Some planes need different trimming mechanism.
 *
 * FIXME: it would be wonderful if we could determine this
 * without needing to hardcode lists of planes...
 */
export function checkTrimCapability(data) {
  const noAileronTrim = [
    `ae145`,
    `ae45`,
    `fox`,
    `kodiak 100`,
    `pa28`,
    `zenith 701`,
  ].some((fragment) => data.title.toLowerCase().includes(fragment));

  if (noAileronTrim) {
    data.noAileronTrim = true;
  }

  // Mostly fighter jets, which may technically have trim,
  // but you're not going to fly with it.
  const noElevatorTrim = [`super hornet`, `vertigo`].some((fragment) =>
    data.title.toLowerCase().includes(fragment)
  );

  if (noElevatorTrim) {
    data.noElevatorTrim = true;
  }

  // Zooooom! Which means that we need to use drastically smaller steps
  // for both the wing leveler and the altitude hold corrections.
  const forAcrobatics = [`gee bee r3`, `super hornet`, `vertigo`, `l-39`].some(
    (fragment) => data.title.toLowerCase().includes(fragment)
  );

  if (forAcrobatics) {
    data.isAcrobatic = true;
  }
}
