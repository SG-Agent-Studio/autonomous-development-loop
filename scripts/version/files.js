export const FILES = [
  {
    rel: ".claude-plugin/plugin.json",
    get: (p) => p.version,
    set: (p, v) => {
      p.version = v;
    },
  },
  {
    rel: ".cursor-plugin/plugin.json",
    get: (p) => p.version,
    set: (p, v) => {
      p.version = v;
    },
  },
  {
    rel: ".claude-plugin/marketplace.json",
    get: (p) => p.metadata.version,
    set: (p, v) => {
      p.metadata.version = v;
    },
  },
  {
    rel: ".cursor-plugin/marketplace.json",
    get: (p) => p.metadata.version,
    set: (p, v) => {
      p.metadata.version = v;
    },
  },
];
