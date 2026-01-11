import { createServer } from "socketless";
import { ServerClass } from "./src/classes/index.js";

// Where "its thing" is creating an API server:
const { webserver } = createServer(ServerClass);

// Which we then run like any other Node server.
const { API_PORT } = process.env;
webserver.listen(API_PORT, () => {
  console.log(`Server listening on http://localhost:${API_PORT}`);
});
