import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

export type PropsCallback<PropsType> = (props: PropsType) => void;

export function useDebouncedCallback<PropsType>(
  callback: PropsCallback<PropsType>,
  delaySecs: number
): [PropsCallback<PropsType>, () => void, boolean] {
  const timerRef: RefObject<NodeJS.Timeout | null> = useRef(null);
  const callbackRef: RefObject<PropsCallback<PropsType>> = useRef(callback);
  const [isPending, setIsPending] = useState<boolean>(false);

  useEffect((): void => {
    callbackRef.current = callback;
  }, [callback]);

  const cancel: () => void = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      setIsPending(false);
    }
  }, []);

  const debounced: PropsCallback<PropsType> = useCallback(
    (props: PropsType): void => {
      cancel();
      setIsPending(true);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        callbackRef.current(props);
        setIsPending(false);
      }, delaySecs * 1000);
    },
    [cancel, delaySecs]
  );

  useEffect((): () => void => cancel, [cancel]);

  return [debounced, cancel, isPending];
}
