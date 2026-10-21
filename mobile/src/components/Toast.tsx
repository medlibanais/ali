import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { borderWidth, colors, radius, spacing, themed } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import Txt from './Txt';

export interface ToastOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
  /** When set, the action label shows a live countdown, e.g. "Undo (8s)". */
  countdownSeconds?: number;
}

interface ToastState extends ToastOptions {
  id: number;
}

interface ToastContextValue {
  showToast: (options: ToastOptions) => void;
  hideToast: () => void;
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => undefined,
  hideToast: () => undefined,
});

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  useTheme();
  const [toast, setToast] = useState<ToastState | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const hideToast = useCallback(() => {
    clearTimers();
    setToast(null);
    setSecondsLeft(null);
  }, [clearTimers]);

  const showToast = useCallback(
    (options: ToastOptions) => {
      clearTimers();
      const id = Date.now();
      setToast({ ...options, id });

      if (options.countdownSeconds && options.countdownSeconds > 0) {
        setSecondsLeft(options.countdownSeconds);
        intervalRef.current = setInterval(() => {
          setSecondsLeft((prev) => {
            if (prev === null || prev <= 1) {
              if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
              }
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        setSecondsLeft(null);
      }

      const duration = options.durationMs ?? 4000;
      timerRef.current = setTimeout(() => {
        setToast((current) => (current && current.id === id ? null : current));
        setSecondsLeft(null);
      }, duration);
    },
    [clearTimers],
  );

  useEffect(() => clearTimers, [clearTimers]);

  const actionLabel =
    toast?.actionLabel && secondsLeft !== null && secondsLeft > 0
      ? `${toast.actionLabel} (${secondsLeft}s)`
      : toast?.actionLabel;

  const actionDisabled = secondsLeft !== null && secondsLeft <= 0;

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}
      {toast ? (
        <View style={styles.wrap} pointerEvents="box-none">
          <View style={styles.toast}>
            <Txt variant="body" color={colors.ink} style={styles.message}>
              {toast.message}
            </Txt>
            {toast.actionLabel && toast.onAction && !actionDisabled ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  toast.onAction?.();
                  hideToast();
                }}
                style={({ pressed }) => [
                  styles.action,
                  pressed && styles.pressed,
                ]}
              >
                <Txt variant="bodySemi" color={colors.accent}>
                  {actionLabel}
                </Txt>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: spacing.xl,
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
    },
    toast: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderWidth: borderWidth.hairline,
      borderColor: colors.line,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      maxWidth: 520,
    },
    message: {
      flexShrink: 1,
    },
    action: {
      marginLeft: spacing.lg,
      minHeight: 32,
      justifyContent: 'center',
    },
    pressed: {
      opacity: 0.96,
    },
  }),
);

export default ToastProvider;
