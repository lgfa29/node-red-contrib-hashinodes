const EventEmitter = require("events");
const stream = require("stream");

const superagent = require("superagent");

const Clients = require("./clients");
const Evaluations = require("./evaluations.js");
const Events = require("./events.js");
const Jobs = require("./jobs.js");

module.exports = class Nomad {
  constructor(config = {}) {
    this.address =
      config.address || process.env.NOMAD_ADDR || "http://localhost:4646";
    this.region = config.region || process.env.NOMAD_REGION || "";
    this.namespace = config.namespace || process.env.NOMAD_NAMESPACE || "";

    this.client = buildClient(this);

    this.clients = new Clients(this);
    this.evals = new Evaluations(this);
    this.events = new Events(this);
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
    blockingQuery(path, options) {
      const url = new URL(path, nomad.address);
      const emitter = new EventEmitter();
      let currentIndex = 0;

      let client = this;
      const makeRequest = function () {
        // Wait until we have at least one listener registered.
        if (
          emitter.listenerCount("data") == 0 &&
          emitter.listenerCount("error") == 0
        ) {
          setTimeout(makeRequest, 500);
          return;
        }

        client
          .get(path, options)
          .query({ index: currentIndex })
          .then((resp) => {
            // Parse returned index header. Exit if not bigger than our current index.
            let newIndex = parseInt(resp.headers["x-nomad-index"], 10);
            if (isNaN(newIndex) || newIndex <= currentIndex) {
              return;
            }

            // Update current index and emit data.
            currentIndex = newIndex;
            emitter.emit("data", resp.body);
          })
          .catch((err) => {
            emitter.emit("error", err);
            // Wait 5s before retrying.
            return new Promise((resolve) => setTimeout(resolve, 5000));
          })
          .finally(makeRequest); // Recursive loop.
      };

      // Start request in background.
      process.nextTick(makeRequest);

      return emitter;
    },
    stream(path, options = {}) {
      const url = new URL(path, nomad.address);
      const emitter = new EventEmitter();

      let sink = null;
      let req = null;
      let lastIndex = options.index || 0;

      // Build topic query param.
      let topicsParam = "";
      if (options.topics) {
        topicsParam = options.topics
          .map((t) => `topic=${t.topic}:${t.filter ? t.filter : "*"}`)
          .join("&");
      }

      emitter.on("data", (data) => {
        if (data.Index) {
          lastIndex = data.Index;
        }
      });

      const connect = function () {
        // Start request and pipe events to the emitter sink.
        if (!sink || !sink.writable) {
          sink = new EventEmitterWritable({ emitter });
        }
        req = superagent
          .get(url.href)
          .query({ index: lastIndex })
          .query(topicsParam);
        req.pipe(sink);
      };

      const retryInterval = setInterval(() => {
        if (sink && sink.connected) {
          return;
        }
        connect();
      }, 60000);

      const listenerCheckInterval = setInterval(() => {
        if (emitter.listenerCount("data") === 0) {
          req.abort();
          sink.end();
          clearInterval(retryInterval);
          clearInterval(listenerCheckInterval);
        }
      }, 1000);

      connect();
      return emitter;
    },
  };
}

class EventEmitterWritable extends stream.Writable {
  constructor(options = {}) {
    super(options);
    this.emitter = options.emitter;
    this.tmpChunk = "";
    this.connected = false;

    this.on("pipe", () => {
      this.connected = true;
      this.emitter.emit("connected");
    });

    this.on("unpipe", () => {
      this.connected = false;
      this.emitter.emit("disconnected");
    });

    this.on("error", (err) => {
      this.emitter.emit("error", err);
    });
  }

  _write(chunk, encoding, callback) {
    if (!this.connected) {
      callback();
      return;
    }

    // Conver buffer to string if necessary.
    let chunkString = chunk;
    if (Buffer.isBuffer(chunk)) {
      chunkString = chunk.toString("utf8");
    }

    // Accumulate chunks untile we have a full object.
    this.tmpChunk += chunkString;

    // Try to parse accumulated chunks. Exit if we don't have a full object yet.
    let chunkObj;
    try {
      chunkObj = JSON.parse(this.tmpChunk);
    } catch (err) {
      callback();
      return;
    }

    // Emit events.
    if (chunkObj.Events) {
      for (let i = 0; i < chunkObj.Events.length; i++) {
        this.emitter.emit("data", chunkObj.Events[i]);
      }
    }

    // Clear accumulated chunks.
    this.tmpChunk = "";
    callback();
  }
}

function enhanceClient(client, nomad) {
  return client
    .query({ namespace: nomad.namespace })
    .query({ region: nomad.region });
}
