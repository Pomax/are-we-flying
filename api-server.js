import url from "url";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
import dotenv from "dotenv";
dotenv.config({ path: `${__dirname}/.env` });
const { API_PORT } = process.env;

import { ClientClass, ServerClass } from "./src/classes/index.js";
import { linkClasses } from "socketless";
const factory = linkClasses(ClientClass, ServerClass);

const { webserver } = factory.createServer();
webserver.listen(API_PORT, () => {
  console.log(`Server listening on http://localhost:${API_PORT}`);
});
