import { useState } from "react";

// Bumps a key on every trigger so a mounted icon can replay its CSS
// animation (React only restarts an animation when the element remounts).
export function useRefreshAnimation(onRefresh: () => void) {
  const [tick, setTick] = useState(0);

  function trigger() {
    setTick((t) => t + 1);
    onRefresh();
  }

  return { tick, trigger };
}
