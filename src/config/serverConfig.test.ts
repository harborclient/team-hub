import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LOGGING_CONFIG } from '#/config/loggingConfig.js';
import { ConfigError, loadServerConfig } from '#/config/serverConfig.js';

/**
 * Writes a temporary server.yaml file for config loader tests.
 *
 * @param contents - Raw YAML written to the temp config file.
 * @returns Absolute path to the written config file.
 */
function writeConfig(contents: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'team-hub-config-'));
  const configPath = path.join(dir, 'server.yaml');
  writeFileSync(configPath, contents, 'utf8');
  return configPath;
}

const sampleDbSection = `db:
  driver: postgres
  host: 127.0.0.1
  port: 5432
  user: harbor
  password: harbor
  database: harbor
`;

const sampleRedisSection = `redis:
  host: 127.0.0.1
  port: 6380
`;

describe('loadServerConfig', () => {
  it('loads a valid nested config', () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: 127.0.0.1
${sampleDbSection}${sampleRedisSection}`);

    expect(loadServerConfig(configPath)).toEqual({
      port: 8787,
      host: '127.0.0.1',
      db: {
        driver: 'postgres',
        host: '127.0.0.1',
        port: 5432,
        user: 'harbor',
        password: 'harbor',
        database: 'harbor'
      },
      redis: {
        host: '127.0.0.1',
        port: 6380
      },
      llm: null,
      plugins: null,
      docs: null,
      logging: DEFAULT_LOGGING_CONFIG
    });
  });

  it('accepts port as a string', () => {
    const configPath = writeConfig(`server:
  port: "9000"
  host: 0.0.0.0
${sampleDbSection}${sampleRedisSection}`);

    expect(loadServerConfig(configPath)).toEqual({
      port: 9000,
      host: '0.0.0.0',
      db: {
        driver: 'postgres',
        host: '127.0.0.1',
        port: 5432,
        user: 'harbor',
        password: 'harbor',
        database: 'harbor'
      },
      redis: {
        host: '127.0.0.1',
        port: 6380
      },
      llm: null,
      plugins: null,
      docs: null,
      logging: DEFAULT_LOGGING_CONFIG
    });
  });

  it('loads an optional llm section with MCP servers', () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: 127.0.0.1
${sampleDbSection}${sampleRedisSection}llm:
  providers:
    openai:
      apiKey: sk-test
  models:
    - gpt-4o
  mcp:
    - name: Exa
      url: https://mcp.exa.ai/mcp
      headers:
        - [ { "x-api-key": "4fbd5841-94f6-43f1-87c3-f3b09cf855a8" } ]
`);

    expect(loadServerConfig(configPath)).toEqual({
      port: 8787,
      host: '127.0.0.1',
      db: {
        driver: 'postgres',
        host: '127.0.0.1',
        port: 5432,
        user: 'harbor',
        password: 'harbor',
        database: 'harbor'
      },
      redis: {
        host: '127.0.0.1',
        port: 6380
      },
      llm: {
        providers: {
          openai: { apiKey: 'sk-test' }
        },
        models: ['gpt-4o'],
        mcp: [
          {
            name: 'Exa',
            url: 'https://mcp.exa.ai/mcp',
            headers: [{ key: 'x-api-key', value: '4fbd5841-94f6-43f1-87c3-f3b09cf855a8' }]
          }
        ]
      },
      plugins: null,
      docs: null,
      logging: DEFAULT_LOGGING_CONFIG
    });
  });

  it('loads an optional llm section', () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: 127.0.0.1
${sampleDbSection}${sampleRedisSection}llm:
  providers:
    openai:
      apiKey: sk-test
  models:
    - gpt-4o
`);

    expect(loadServerConfig(configPath)).toEqual({
      port: 8787,
      host: '127.0.0.1',
      db: {
        driver: 'postgres',
        host: '127.0.0.1',
        port: 5432,
        user: 'harbor',
        password: 'harbor',
        database: 'harbor'
      },
      redis: {
        host: '127.0.0.1',
        port: 6380
      },
      llm: {
        providers: {
          openai: { apiKey: 'sk-test' }
        },
        models: ['gpt-4o']
      },
      plugins: null,
      docs: null,
      logging: DEFAULT_LOGGING_CONFIG
    });
  });

  it('loads an optional plugins section', () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: 127.0.0.1
${sampleDbSection}${sampleRedisSection}plugins:
  catalogs:
    - https://harborclient.com/plugin_catalog.json
    - https://example.com/catalog.json
  trusted:
    - https://harborclient.com/plugins/trusted.json
`);

    expect(loadServerConfig(configPath)).toEqual({
      port: 8787,
      host: '127.0.0.1',
      db: {
        driver: 'postgres',
        host: '127.0.0.1',
        port: 5432,
        user: 'harbor',
        password: 'harbor',
        database: 'harbor'
      },
      redis: {
        host: '127.0.0.1',
        port: 6380
      },
      llm: null,
      plugins: {
        catalogs: [
          'https://harborclient.com/plugin_catalog.json',
          'https://example.com/catalog.json'
        ],
        trusted: ['https://harborclient.com/plugins/trusted.json']
      },
      docs: null,
      logging: DEFAULT_LOGGING_CONFIG
    });
  });

  it('throws on invalid plugins URLs', () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: 127.0.0.1
${sampleDbSection}${sampleRedisSection}plugins:
  catalogs:
    - not-a-url
`);

    expect(() => loadServerConfig(configPath)).toThrow(ConfigError);
  });

  it('throws when the config file is missing', () => {
    expect(() => loadServerConfig('/nonexistent/server.yaml')).toThrow(ConfigError);
    expect(() => loadServerConfig('/nonexistent/server.yaml')).toThrow(
      'Config file not found: /nonexistent/server.yaml'
    );
  });

  it('throws on malformed YAML', () => {
    const configPath = writeConfig(`server:
  port: [unclosed
`);

    expect(() => loadServerConfig(configPath)).toThrow(ConfigError);
    expect(() => loadServerConfig(configPath)).toThrow('Failed to parse config file:');
  });

  it('throws when server mapping is missing', () => {
    const configPath = writeConfig(`port: 8787
host: 127.0.0.1
`);

    expect(() => loadServerConfig(configPath)).toThrow('Config must include a "server" mapping.');
  });

  it('throws when server.port is missing', () => {
    const configPath = writeConfig(`server:
  host: 127.0.0.1
`);

    expect(() => loadServerConfig(configPath)).toThrow('Config must include server.port.');
  });

  it('throws when server.host is missing', () => {
    const configPath = writeConfig(`server:
  port: 8787
${sampleDbSection}${sampleRedisSection}`);

    expect(() => loadServerConfig(configPath)).toThrow('Config must include server.host.');
  });

  it('throws when db mapping is missing', () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: 127.0.0.1
`);

    expect(() => loadServerConfig(configPath)).toThrow('Config must include a "db" mapping.');
  });

  it('throws when db.driver is missing', () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: 127.0.0.1
db:
  host: 127.0.0.1
`);

    expect(() => loadServerConfig(configPath)).toThrow('Config must include db.driver.');
  });

  it('throws when redis mapping is missing', () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: 127.0.0.1
${sampleDbSection}`);

    expect(() => loadServerConfig(configPath)).toThrow('Config must include a "redis" mapping.');
  });

  it('throws when redis.host is missing', () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: 127.0.0.1
${sampleDbSection}redis:
  port: 6380
`);

    expect(() => loadServerConfig(configPath)).toThrow('Config must include redis.host.');
  });

  it('throws when redis.port is missing', () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: 127.0.0.1
${sampleDbSection}redis:
  host: 127.0.0.1
`);

    expect(() => loadServerConfig(configPath)).toThrow('Config must include redis.port.');
  });

  it('throws on invalid port values', () => {
    const configPath = writeConfig(`server:
  port: 99999
  host: 127.0.0.1
${sampleDbSection}${sampleRedisSection}`);

    expect(() => loadServerConfig(configPath)).toThrow(
      'Port must be an integer between 1 and 65535.'
    );
  });

  it('loads an optional logging section', () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: 127.0.0.1
${sampleDbSection}${sampleRedisSection}logging:
  level: debug
  file: /var/log/team-hub.log
  console: false
`);

    expect(loadServerConfig(configPath).logging).toEqual({
      level: 'debug',
      file: '/var/log/team-hub.log',
      console: false
    });
  });

  it('throws on invalid logging level', () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: 127.0.0.1
${sampleDbSection}${sampleRedisSection}logging:
  level: trace
`);

    expect(() => loadServerConfig(configPath)).toThrow(ConfigError);
  });

  it('throws on invalid host values', () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: "   "
${sampleDbSection}${sampleRedisSection}`);

    expect(() => loadServerConfig(configPath)).toThrow('Host must not be empty.');
  });
});
