// Friend invite links that connect you on their own.
//
// A link like prayerlock://add-friend?code=ABC12345 can arrive when you
// are signed in, signed out or still onboarding. Wherever it lands, the
// code is kept as the pending invite (Redux + AsyncStorage, so it survives
// the app being closed while you verify your email). As soon as you are
// signed in and onboarded, useRedeemPendingInvite connects you once.

import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../components/Toast';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { setPendingInviteCode } from '../../store/slices/authSlice';
import { friendErrorText, inviteResultText, useRedeemInvite } from './api';
import { inviteCodeFromUrl } from './logic';

export const PENDING_INVITE_KEY = 'grow.pendingInviteCode';

async function readStored(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PENDING_INVITE_KEY);
  } catch {
    return null;
  }
}

async function writeStored(code: string | null): Promise<void> {
  try {
    if (code) await AsyncStorage.setItem(PENDING_INVITE_KEY, code);
    else await AsyncStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    // Storage is a convenience; the code still works for this session.
  }
}

/**
 * Mounted once at the app root. Picks invite codes out of the link that
 * opened the app and links opened while it runs, restores a code saved
 * before the app was closed, and keeps storage in step with Redux.
 */
export function useInviteLinkCapture(): void {
  const dispatch = useAppDispatch();
  const pending = useAppSelector((state) => state.auth.pendingInviteCode);
  const restored = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const take = (url: string | null) => {
      const code = inviteCodeFromUrl(url);
      if (code && !cancelled) dispatch(setPendingInviteCode(code));
    };

    (async () => {
      const [stored, initialUrl] = await Promise.all([
        readStored(),
        Linking.getInitialURL().catch(() => null),
      ]);
      if (cancelled) return;
      restored.current = true;
      const fromLink = inviteCodeFromUrl(initialUrl);
      const code = fromLink ?? stored;
      if (code) dispatch(setPendingInviteCode(code));
    })();

    const sub = Linking.addEventListener('url', ({ url }) => take(url));
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [dispatch]);

  useEffect(() => {
    // Do not wipe a stored code before it has been read back.
    if (!restored.current && pending === null) return;
    void writeStored(pending);
  }, [pending]);
}

/**
 * Mounted inside the signed-in app. Redeems the pending invite once and
 * tells you how it went.
 */
export function useRedeemPendingInvite(): void {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const pending = useAppSelector((state) => state.auth.pendingInviteCode);
  const redeem = useRedeemInvite();
  const inFlight = useRef<string | null>(null);

  useEffect(() => {
    if (!pending || inFlight.current === pending) return;
    inFlight.current = pending;
    redeem
      .mutateAsync(pending)
      .then((result) => {
        showToast({
          message: result.redeemed
            ? t('today.inviteAcceptedYouAre')
            : inviteResultText(result.reason),
        });
        dispatch(setPendingInviteCode(null));
      })
      .catch((e: unknown) => {
        // Offline or a server hiccup: keep the code (it stays saved) and
        // try again on the next launch.
        showToast({ message: friendErrorText(e) });
      })
      .finally(() => {
        inFlight.current = null;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);
}
