import { test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { McpConnectPanel, MCP_ENDPOINT } from './McpConnectPanel';

const writeText = vi.fn();

beforeEach(() => {
  writeText.mockReset();
  Object.assign(navigator, { clipboard: { writeText } });
});

function blocks() {
  return Array.from(document.querySelectorAll('pre')).map((el) => el.textContent ?? '');
}

test('substitutes a freshly issued key into every config block', () => {
  render(<McpConnectPanel apiKey="ak_live_abc123" />);

  const texts = blocks();
  expect(texts.length).toBeGreaterThan(0);
  for (const text of texts) {
    expect(text).not.toContain('LYKILLINN_ÞINN');
  }
  expect(texts.join('\n')).toContain('Bearer ak_live_abc123');
});

test('falls back to a placeholder when no key was just issued', () => {
  render(<McpConnectPanel />);

  expect(blocks().join('\n')).toContain('ak_LYKILLINN_ÞINN');
});

// The instructions this panel replaced configured a stdio `curl` command with
// a `{{mcp_payload}}` placeholder no client substitutes, so they could not
// work. Birtingur's server is remote streamable-HTTP.
test('never emits the broken stdio-curl shape', () => {
  render(<McpConnectPanel apiKey="ak_x" />);

  const all = blocks().join('\n');
  expect(all).not.toContain('mcp_payload');
  expect(all).not.toContain('"command"');
});

test('Claude Code config carries the type field its parser requires', () => {
  render(<McpConnectPanel apiKey="ak_x" />);

  // An entry with `url` but no `type` is read as a stdio server and skipped.
  const json = blocks().find((t) => t.includes('mcpServers') && t.includes('"type"'));
  expect(json).toBeDefined();
  const parsed = JSON.parse(json!);
  expect(parsed.mcpServers.birtingur).toMatchObject({
    type: 'http',
    url: MCP_ENDPOINT,
    headers: { Authorization: 'Bearer ak_x' },
  });
});

test('Cursor tab emits valid JSON pointing at the same endpoint', () => {
  render(<McpConnectPanel apiKey="ak_x" />);
  fireEvent.click(screen.getByRole('button', { name: 'Cursor' }));

  const json = blocks().find((t) => t.includes('mcpServers'));
  const parsed = JSON.parse(json!);
  expect(parsed.mcpServers.birtingur.url).toBe(MCP_ENDPOINT);
  expect(parsed.mcpServers.birtingur.headers.Authorization).toBe('Bearer ak_x');
});

test('every client tab renders the endpoint or a config containing it', () => {
  render(<McpConnectPanel apiKey="ak_x" />);

  for (const label of [
    'Claude Code',
    'Claude (vefur / Desktop)',
    'Cursor',
    'Annað (Lovable o.fl.)',
  ]) {
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(blocks().join('\n')).toContain(MCP_ENDPOINT);
  }
});

test('copy button writes the block it belongs to', () => {
  render(<McpConnectPanel apiKey="ak_x" />);

  fireEvent.click(screen.getAllByRole('button', { name: 'Afrita' })[0]!);

  expect(writeText).toHaveBeenCalledTimes(1);
  expect(writeText.mock.calls[0]![0]).toContain('claude mcp add --transport http');
});
