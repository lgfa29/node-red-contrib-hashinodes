module.exports = class Evaluations {
  constructor(nomad) {
    this.nomad = nomad;
  }

  allocs(evalId, options = {}) {
    const path = `/v1/evaluation/${evalId}/allocations`;
    return this.nomad.client.get(path);
  }
};
