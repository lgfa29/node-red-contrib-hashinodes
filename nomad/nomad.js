const Nomad = require("../lib/nomad-api-client");

module.exports = function (RED) {
  function NomadClientNode(config) {
    RED.nodes.createNode(this, config);

    this.address = config.address;
    this.region = config.region;
    this.namespace = config.namespace;

    this.client = new Nomad({
      address: this.address,
      region: this.region,
      namespace: this.namespace,
    });
  }
  RED.nodes.registerType("nomad-client", NomadClientNode);

  function NomadGetJobNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    this.nomad = RED.nodes.getNode(config.client);
    this.jobId = config.jobId;
    this.blocking = config.blocking;
    this.sub = null;

    this.handleData = function (data) {
      let color = "grey";
      switch (data.Status) {
        case "running":
          color = "green";
          break;
        case "dead":
          color = "red";
          break;
      }
      node.status({ fill: color, shape: "dot", text: data.Status });
      node.send({ payload: data });
    };

    this.handleError = function (err) {
      node.error(err, "failed to get job");
    };

    this.on("input", function (msg, send, done) {
      this.nomad.client.jobs
        .get(msg.payload.jobId || node.jobId)
        .then((data) => {
          msg.payload = data.body;

          if (send) {
            send(msg);
          } else {
            node.send(msg);
          }

          if (done) {
            done();
          }
        })
        .catch((err) => {
          if (done) {
            done(err);
          } else {
            node.error(err, msg);
          }
        });
    });

    this.on("close", function (removed, done) {
      if (node.sub) {
        node.sub.removeAllListeners();
        node.sub = null;
      }
      node.status({});
      done();
    });

    if (this.blocking) {
      this.sub = this.nomad.client.jobs.get(config.jobId, { blocking: true });
      this.sub.on("data", this.handleData);
      this.sub.on("error", this.handleError);
    }
  }
  RED.nodes.registerType("nomad-get-job", NomadGetJobNode);

  function NomadScaleJobNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    this.nomad = RED.nodes.getNode(config.client);

    this.on("input", function (msg, send, done) {
      const { jobId, group, count, meta, message } = msg.payload;

      this.nomad.client.jobs
        .scale(jobId, group, count, { meta, message })
        .then((data) => {
          msg.payload = data.body;

          if (send) {
            send(msg);
          } else {
            node.send(msg);
          }

          if (done) {
            done();
          }
        })
        .catch((err) => {
          if (done) {
            done(err);
          } else {
            node.error(err, msg);
          }
        });
    });
  }
  RED.nodes.registerType("nomad-scale-job", NomadScaleJobNode);

  function NomadDispatchJobNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    this.nomad = RED.nodes.getNode(config.client);
    this.jobId = config.jobId;

    this.on("input", function (msg, send, done) {
      const jobId = msg.payload.jobId || this.jobId;
      const opts = {
        payload: msg.payload.payload,
        meta: msg.payload.meta,
      };

      this.nomad.client.jobs
        .dispatch(jobId, opts)
        .then((data) => {
          msg.payload = data.body;

          if (send) {
            send(msg);
          } else {
            node.send(msg);
          }

          if (done) {
            done();
          }
        })
        .catch((err) => {
          if (done) {
            done(err);
          } else {
            node.error(err, msg);
          }
        });
    });
  }
  RED.nodes.registerType("nomad-dispatch-job", NomadDispatchJobNode);

  function NomadAllocLogsNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    this.nomad = RED.nodes.getNode(config.client);

    this.on("input", function (msg, send, done) {
      if (!msg.payload.allocId) {
        done("message missing payload.allocId");
        return;
      }

      const allocId = msg.payload.allocId;
      const opts = msg.payload.options;

      this.nomad.client.clients
        .logs(allocId, opts)
        .then((data) => {
          const buff = Buffer.from(data.body.Data, "base64");
          msg.payload = buff.toString("utf-8");

          if (send) {
            send(msg);
          } else {
            node.send(msg);
          }

          if (done) {
            done();
          }
        })
        .catch((err) => {
          if (done) {
            done(err);
          } else {
            node.error(err, msg);
          }
        });
    });
  }
  RED.nodes.registerType("nomad-alloc-logs", NomadAllocLogsNode);

  function NomadEventStream(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    this.nomad = RED.nodes.getNode(config.client);
    this.topics = [];
    this.sub = null;
    this.reconnectInterval = null;

    if (config.topics) {
      try {
        this.topics = JSON.parse(config.topics);
      } catch (err) {
        this.error(err, "failed to parse topics");
        return;
      }
    }

    this.setConnected = function () {
      node.status({ fill: "green", shape: "dot", text: "connected" });
    };

    this.setDisconnected = function () {
      node.status({ fill: "red", shape: "dot", text: "disconnected" });
    };

    this.closeStream = function () {
      if (node.sub) {
        node.sub.removeAllListeners();
        node.sub = null;
      }
    };

    this.startStream = function (msg = {}) {
      this.setDisconnected();

      this.sub = this.nomad.client.events.stream({ topics: this.topics });
      this.sub.on("connected", this.setConnected);
      this.sub.on("disconnected", this.setDisconnected);

      this.sub.on("data", (data) => {
        msg.payload = data;
        node.send(msg);
      });

      this.sub.on("error", (err) => {
        node.error(err, msg);
      });
    };

    this.on("input", function (msg, send, done) {
      node.closeStream();
      node.topics = msg.payload.topics;
      node.startStream(msg);
      done();
    });

    this.on("close", function (removed, done) {
      node.closeStream();
      done();
    });

    if (config.topics) {
      this.startStream();
    }
  }
  RED.nodes.registerType("nomad-event-stream", NomadEventStream);
};
