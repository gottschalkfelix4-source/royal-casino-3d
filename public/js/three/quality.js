/** Keep explicit choices; new devices start with a conservative automatic profile. */
let sessionQuality = 'auto';
export function getQuality() {
  let value;
  try { value = localStorage.getItem('casino.quality'); } catch { return sessionQuality; }
  return ['auto', 'high', 'medium', 'low'].includes(value) ? value : 'auto';
}

export function setQuality(value) {
  if (!['auto', 'high', 'medium', 'low'].includes(value)) return;
  sessionQuality = value;
  try { localStorage.setItem('casino.quality', value); } catch { /* Rendering still works without storage. */ }
}

export function automaticQuality({ cores, memory, mobile = false } = {}) {
  if (mobile || (cores > 0 && cores <= 4) || (memory > 0 && memory <= 4)) return 'low';
  if (cores >= 8 && memory >= 8) return 'high';
  return 'medium';
}

export function deviceQuality() {
  return automaticQuality({
    cores: navigator.hardwareConcurrency,
    memory: navigator.deviceMemory,
    mobile: navigator.userAgentData?.mobile || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
      || (navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches),
  });
}
