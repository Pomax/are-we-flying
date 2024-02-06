// Make our lives a little easier by shimming some of
// the more sensible Express-isms for Response
export function shimResponse(Response) {
  Response.status = function (statusNumber, type = `text/plain`) {
    this.writeHead(statusNumber, {
      "Content-Type": type,
      "Cache-Control": `no-store`,
      "Access-Control-Allow-Origin": `*`,
    });
    return this;
  };

  Response.send = function (data) {
    this.write(data);
    this.end();
  };

  Response.text = function (textData) {
    this.status(200).send(textData);
  };

  Response.json = function (jsData) {
    this.status(200, `application/json`).send(JSON.stringify(jsData));
  };

  Response.fail = function (reason) {
    this.status(400).send(reason);
  };
}
