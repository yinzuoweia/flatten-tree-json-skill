import { describe, expect, it } from 'vitest';
import { parseQuery, matchesNode } from '../src/query.js';

describe('query parser', () => {
  it('parses newer_than filter', () => {
    const parsed = parseQuery('newer_than:7d tag:idea llm');
    expect(parsed.terms).toEqual(['llm']);
    expect(parsed.filters).toHaveLength(2);
  });

  it('matches node by term and field filter', () => {
    const parsed = parseQuery('tag:idea transformer');
    const node = {
      id: 'n_001',
      parent: 'root',
      children: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      summary: 'Transformer research direction',
      tag: 'idea'
    };
    expect(matchesNode(node, parsed, new Date())).toBe(true);
  });
});
