type Listener = () => void;

const listeners = new Set<Listener>();

/**
 * Chat creates threads; Sidebar lists them. Rather than lifting that state
 * through MainLayout, Chat announces a change and Sidebar refetches.
 */
export const threadsChanged = () => {
  listeners.forEach((fn) => fn());
};

export const onThreadsChanged = (fn: Listener) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
