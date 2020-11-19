const EventEmitter = require("events");
const superagent = require("superagent");

const Jobs = require("./jobs.js");

module.exports = class Nomad {
  constructor(config = {}) {
    this.address =
      config.address || process.env.NOMAD_ADDR || "http://localhost:4646";
    this.region = config.region || process.env.NOMAD_REGION;
    this.namespace = config.namespace || process.env.NOMAD_NAMESPACE;

    const nomad = this;
    this.client = {
      get(path) {
        let url = new URL(path, nomad.address);
        return superagent.get(url.href);
      },
      post(path, data) {
        let url = new URL(path, nomad.address);
        return superagent.post(url.href).send(data);
      },
      del(path) {
        let url = new URL(path, nomad.address);
        return superagent.del(url.href);
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

    this.jobs = new Jobs(this);
  }
};
