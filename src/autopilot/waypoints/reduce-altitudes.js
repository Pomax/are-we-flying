export function reduceAltitudes(
  blocks,
  minInterval = 3,
  ascentRate = 1000,
  descentRate = 1000
) {
  `
    Run an initial merge of all consecutive same-level intervals,
    keeping only the first block (update "how many minutes")
  `;
  for (let i = blocks.length - 1; i > 0; i--) {
    const cur = blocks[i];
    const prev = blocks[i - 1];
    if (prev.level === cur.level) {
      blocks.splice(i, 1);
      prev.length += cur.length;
      prev.end = cur.end;
      prev.endDistance = cur.endDistance;
    }
  }

  for (let j = 1; j < minInterval; j++) {
    runIteration(blocks, j, ascentRate, descentRate);
  }
}

function runIteration(blocks, cutoff, maxUp, maxDown) {
  `
    Slide a window over the data and see whether to left-or-right merge.
  `;

  // FIXME: work in the maxUp and maxDown limitations

  for (let i = blocks.length - 1; i > 0; i--) {
    const [a, b, c] = blocks.slice(i - 1);

    if (b.length > cutoff) continue;

    const [al, bl, cl] = [a.level, b.level, c?.level];
    const { mergeWithA, mergeWithC, join } = shortHands(blocks, i, a, b, c);

    // right-most case
    if (!c) {
      mergeWithA(al < bl);
      continue;
    }

    // b is a dip, i.e. (a|c) > b
    if (al > bl && cl > bl) {
      if (al > cl) mergeWithC();
      else if (al < cl) mergeWithA();
      else if (al == cl) join();
    }
    // a>b>c: extend a to cover b
    else if (al > bl && cl < bl) mergeWithA();
    // b is a peak, i.e. b > (a|c)
    else if (al < bl && cl < bl) {
      // extend by uplifting a
      if (al > cl) mergeWithA(true);
      // extend by uplifting c
      else if (al < cl) mergeWithC(true);
      // merge with whichever covers fewer intervals
      else if (al == cl) {
        if (a.length < c.length) mergeWithA(true);
        else if (a.length > c.length) mergeWithC(true);
        else if (a.length === c.length) {
          // merge with a, mostly because we're rather go up "earlier"
          // and descend "sooner" than the other way around.
          mergeWithA(true);
        }
      }
    }
    // a<b<c: merge with c
    else if (al < bl && cl > bl) mergeWithC();
  }
}

function shortHands(blocks, i, a, b, c) {
  `
    Create the accounting functions that we need to update the block list.
  `;

  const mergeWithA = (moveA = false) => {
    console.log(
      `merging a <- b (changing level: ${moveA}), [${a.startDistance},${a.endDistance}] <- [${b.startDistance},${b.endDistance}]`
    );
    blocks.splice(i, 1);
    if (moveA) a.level = b.level;
    a.length += b.length;
    a.end = b.end;
    a.endDistance = b.endDistance;
    console.log(`> new block a: [${a.startDistance},${a.endDistance}]`)
  };

  const mergeWithC = (moveC = false) => {
    console.log(`merging b <- c (changing level: ${!moveC}), [${b.startDistance},${b.endDistance}] <- [${c.startDistance},${c.endDistance}]`);
    blocks.splice(i + 1, 1);
    if (!moveC) b.level = c.level;
    b.length += c.length;
    b.end = c.end;
    b.endDistance = c.endDistance;
    console.log(`> new block b: [${b.startDistance},${b.endDistance}]`)
  };

  const join = () => {
    console.log(`merging (a,b,c) into one track, [${a.startDistance},${a.endDistance}] <- [${c.startDistance},${c.endDistance}]`);
    blocks.splice(i, 2);
    a.length += b.length + c.length;
    a.end = c.end;
    a.endDistance = c.endDistance;
    console.log(`> new block a: [${a.startDistance},${a.endDistance}]`)
  };

  return { mergeWithA, mergeWithC, join };
}
