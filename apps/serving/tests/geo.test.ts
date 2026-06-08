import { describe, it, expect } from 'vitest';
import { regionFromHeaders, getVisitorRegions } from '../src/lib/geo.js';

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

describe('getVisitorRegions', () => {
  it('maps a capital-area city to specific city and capital', () => {
    expect(getVisitorRegions({ 'x-vercel-ip-city': 'Reykjavík' })).toEqual([
      'reykjavik',
      'capital',
    ]);
    expect(getVisitorRegions({ 'x-vercel-ip-city': 'Kópavogur' })).toEqual([
      'kopavogur',
      'capital',
    ]);
    expect(getVisitorRegions({ 'x-vercel-ip-city': 'Garðabær' })).toEqual(['gardabaer', 'capital']);
  });
  it('maps other Icelandic cities to specific city and countryside', () => {
    expect(getVisitorRegions({ 'x-vercel-ip-city': 'Akureyri' })).toEqual([
      'akureyri',
      'countryside',
    ]);
    expect(getVisitorRegions({ 'x-vercel-ip-city': 'Selfoss' })).toEqual([
      'selfoss',
      'countryside',
    ]);
  });
  it('returns unknown when no city header', () => {
    expect(getVisitorRegions({})).toEqual(['unknown']);
  });
});
