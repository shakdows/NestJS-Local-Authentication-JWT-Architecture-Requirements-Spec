import { parseDurationToSeconds } from './duration.util.js';

describe('parseDurationToSeconds', () => {
  it.each([
    ['900s', 900],
    ['15m', 900],
    ['1h', 3600],
    ['7d', 604800],
    ['30d', 2592000],
  ])('parses %s', (input, expected) => {
    expect(parseDurationToSeconds(input)).toBe(expected);
  });

  it.each(['', '15', 'm', '15w', '-1m', '1.5h', ' 15m'])(
    'rejects %j',
    (input) => {
      expect(() => parseDurationToSeconds(input)).toThrow();
    },
  );

  it('rejects zero', () => {
    expect(() => parseDurationToSeconds('0s')).toThrow(/greater than zero/);
  });
});
