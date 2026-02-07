"use client";

import { useEffect, useState } from "react";

export function useAppReady() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  return ready;
}
