/** `promise`'s answer if it comes within `ms`, else `fallback`; the promise itself runs on. */
export async function within<T, F>(promise: Promise<T>, ms: number, fallback: F): Promise<T | F> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<F>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
