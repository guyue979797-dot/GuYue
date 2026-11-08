import { useState } from '../lib/react.js';

/** A serializable business draft and its last opened/saved baseline. */
export function useDraftState(initial) {
  const [value, setValue] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  function reset(next) { setValue(next); setBaseline(next); }
  return [value, setValue, reset, JSON.stringify(value) !== JSON.stringify(baseline)];
}
