function setup() {
  setSize(500, 300);
  addSlider(`cap`, { max: 500, step: 1, value: 200 });
  addSlider(`curve`, { max: 10, step: 1, value: 3 });
  setBorder(1, `black`);
}

function draw() {
  clear(`white`);
  translate(30, 20);
  scale(0.9);
  setGrid(50, `lightgrey`);

  const f = (x) => {
    if (x <= cap) {
      // quadratic interpolation
      const t = (cap - x) / cap;
      return 1000 - t ** curve * 1000;
    }
    return 1000;
  };

  setColor(`black`);
  axes(`diff`, 0, width, `VS`, 0, height, 0, 500, 0, 1000);

  noFill();
  setStroke(`lightgrey`);
  line(0, 0, cap, height);

  setStroke(`black`);
  plot(f, 0, 1000, 2 * cap, 1, height / 1000);
}
