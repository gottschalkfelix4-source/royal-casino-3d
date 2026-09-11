const listeners = new Set();

export const store = {
  user: null,
  activeGames: [],
};

function emit() {
  for (const fn of listeners) fn(store);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setUser(user) {
  store.user = user;
  emit();
}

export function setBalance(cents) {
  if (!store.user || typeof cents !== 'number') return;
  store.user.balance = cents;
  if (store.user.rescue) {
    store.user.rescue.available = cents < store.user.rescue.threshold && Date.now() >= store.user.rescue.nextAt;
  }
  emit();
}

export function setActiveGames(list) {
  store.activeGames = list;
  emit();
}
