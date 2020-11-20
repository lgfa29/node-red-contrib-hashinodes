module.exports = class Jobs {
  constructor(nomad) {
    this.nomad = nomad;
  }

  list(options = {}) {
    const path = "/v1/jobs";

    if (options.blocking) {
      return this.nomad.client.blockingQuery(path);
    }
    return this.nomad.client.get(path);
  }

  get(id, options = {}) {
    const path = `/v1/job/${id}`;

    if (options.blocking) {
      return this.nomad.client.blockingQuery(path);
    }
    return this.nomad.client.get(path);
  }

  scale(jobId, group, count, options = {}) {
    const path = `/v1/job/${jobId}/scale`;
    return this.nomad.client.post(path, {
      Count: count,
      Meta: options.meta,
      Message: options.message,
      Target: {
        Group: group,
      },
    });
  }

  dispatch(id, options = {}) {
    const path = `/v1/job/${id}/dispatch`;
    const payload = options.payload || "";
    const meta = options.meta || {};

    return this.nomad.client.post(path, {
      payload: Buffer.from(payload).toString("base64"),
      meta: meta,
    });
  }
};
