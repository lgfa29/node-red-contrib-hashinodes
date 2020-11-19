const EventEmitter = require("events");
const superagent = require("superagent");

const Jobs = require("./jobs.js");

module.exports = class Nomad {
  constructor(config = {}) {
    this.address =
      config.address || process.env.NOMAD_ADDR || "http://localhost:4646";
    this.region = config.region || process.env.NOMAD_REGION || "";
    this.namespace = config.namespace || process.env.NOMAD_NAMESPACE || "";

    this.client = buildClient(this);
    this.jobs = new Jobs(this);
  }
};

function buildClient(nomad) {
  return {
    get(path) {
      const url = new URL(path, nomad.address);
      const client = superagent.get(url.href);
      return enhanceClient(client, nomad);
    },
    post(path, data) {
      const url = new URL(path, nomad.address);
      const client = superagent.post(url.href).send(data);
      return enhanceClient(client, nomad);
    },
    del(path) {
      const url = new URL(path, nomad.address);
      const client = superagent.del(url.href);
      return enhanceClient(client, nomad);
    },
    subscribe(path, options) {
      let url = new URL(path, nomad.address);
      const emitter = new EventEmitter();
      let index = 0;

      let client = this;
      const makeRequest = function () {
        if (emitter.listenerCount("data") == 0) {
          setTimeout(makeRequest, 500);
          return;
        }

        client
          .get(path, options)
          .query({ index })
          .then((resp) => {
            let currentIndex = parseInt(resp.headers["x-nomad-index"], 10);
            if (isNaN(currentIndex) || currentIndex <= index) {
              return;
            }

            index = currentIndex;
            emitter.emit("data", resp.body);
          })
          .catch((err) => {
            emitter.emit("error", err);
            return new Promise((resolve) => setTimeout(resolve, 5000));
          })
          .finally(makeRequest);
      };

      process.nextTick(makeRequest);

      return emitter;
    },
  };
}

function enhanceClient(client, nomad) {
  return client
    .query({ namespace: nomad.namespace })
    .query({ region: nomad.region });
}
