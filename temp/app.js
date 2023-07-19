import express from "express";
const app = express();
app.use(express.static(`.`));
app.get(`/`, (_, res) => res.redirect(`/index.html`));
app.listen(3000, () => {
  console.log(`Server listening on http://localhost:${3000}`);
});
