import { describe, it, expect } from 'vitest';
import { renderPendingEvents } from '../dashboard';

const ev = (id: number) => ({
  id, title: `Esemény <${id}>`, narrative: 'Leírás',
  options: [{ id: 'fix', label: 'Javítás ($600)', description: 'Gyors' }, { id: 'wait', label: 'Kivárás', description: '' }],
});

describe('„Döntésre vár" sáv', () => {
  it('nincs esemény → nincs sáv', () => {
    expect(renderPendingEvents('hu', [])).toBe('');
  });
  it('a folyamban renderelt sáv döntésgombokkal, lefordított fejléccel, escape-elve', () => {
    const html = renderPendingEvents('hu', [ev(7)]);
    expect(html).toContain('id="events-strip"');
    expect(html).toContain('Döntésre vár');
    expect(html).toContain('data-event-id="7"');
    expect(html).toContain('data-event-opt="fix"');
    expect(html).toContain('data-event-opt="wait"');
    expect(html).toContain('Esemény &lt;7&gt;');
    expect(html).not.toContain('position: fixed');
    expect(html).not.toContain('data-ev-more');
  });
  it('kettőnél több esemény: a többi rejtve, „+N további" gombbal', () => {
    const html = renderPendingEvents('de', [ev(1), ev(2), ev(3), ev(4)]);
    expect(html.match(/class="ev-item" data-event-id="\d+" hidden/g)).toHaveLength(2);
    expect(html).toContain('+2 weitere');
  });
});
