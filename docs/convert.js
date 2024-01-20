import http from "node:http";
import fs from "node:fs";
import cmark from "cmark-gfm";
import handler from "serve-handler";

async function convert() {
  console.log(`converting markdown to html...`);
  const markdown = fs.readFileSync(`index.md`).toString(`utf-8`);
  const html = await cmark.renderHtml(markdown, {
    githubPreLang: true,
    unsafe: true,
  });
  fs.writeFileSync(`index.html`, html);
  console.log(`done`);
}

convert();

const server = http.createServer((request, response) => handler(request, response));
server.listen(0, () => console.log(`server running on http://localhost:${server.address().port}`));

fs.watchFile(`./index.md`, { interval: 1000 }, async () => convert());
