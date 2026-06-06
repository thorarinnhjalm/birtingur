import { describe, it, expect } from 'vitest';
import { regionFromHeaders } from '../src/lib/geo.js';

describe('regionFromHeaders', () => {
  it('maps a capital-area city to capital', () => {
    expect(regionFromHeaders({ 'x-vercel-ip-city': 'Reykjavik' })).toBe('capital');
    expect(regionFromHeaders({ 'x-vercel-ip-city': 'Reykjavík' })).toBe('capital');
    expect(regionFromHeaders({ 'x-vercel-ip-city': 'Kópavogur' })).toBe('capital');
    expect(regionFromHeaders({ 'x-vercel-ip-city': 'kopavogur' })).toBe('capital');
    expect(regionFromHeaders({ 'x-vercel-ip-city': 'Garðabær' })).toBe('capital');
    expect(regionFromHeaders({ 'x-vercel-ip-city': 'Hafnarfjörður' })).toBe('capital');
  });
  it('maps other Icelandic cities to countryside', () => {
    expect(regionFromHeaders({ 'x-vercel-ip-city': 'Akureyri' })).toBe('countryside');
  });
  it('returns unknown when no city header', () => {
    expect(regionFromHeaders({})).toBe('unknown');
  });
});
